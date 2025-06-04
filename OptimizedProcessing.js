// File: OptimizedProcessing.gs
// Optimized processing strategies with search optimization and refined error/retry handling

/**
 * Optimized processing namespace
 */
var OptimizedProcessing = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration for optimization
  var PROCESSING_BATCH_SIZE = 10; // How many new/unprocessed files to target in one run of processUnprocessedFilesOnly
  var MAX_EXECUTION_TIME_MS = 4 * 60 * 1000; // 4 minutes (safe margin for Apps Script execution time)
  var CHECKPOINT_PROPERTY = 'LAST_PROCESSING_CHECKPOINT_V2'; // Use V2 for new structure
  var STATS_PROPERTY = 'OPTIMIZED_PROCESSING_STATS_V2'; // Use V2 for new stats

  // Assumed to be defined in Config.gs:
  // Config.SCRIPT_PROPERTIES, Config.BOX_API_BASE_URL, Config.BOX_METADATA_SCOPE,
  // Config.BOX_METADATA_TEMPLATE_KEY, Config.ACTIVE_TEST_FOLDER_ID, Config.DEFAULT_PROCESSING_FOLDER_ID,
  // Config.PROCESSING_STAGE_COMPLETE, Config.PROCESSING_STAGE_FAILED, Config.PROCESSING_STAGE_UNPROCESSED
  // Config.getCurrentBuild(), Config.shouldReprocessForBuild()
  // Config.METADATA_KEY_LAST_ERROR, Config.METADATA_KEY_LAST_ERROR_TIMESTAMP (if used by markFileAsFailed)

  /**
   * Primary Strategy: Search-Based Incremental Processing with Checkpoints
   * Iterates through specified folders, processing files and saving checkpoints.
   */
  ns.processIncrementallyWithCheckpoints = function() {
    Logger.log("=== Primary Strategy: Incremental Processing with Search Optimization & Checkpoints ===\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken(); // Assumes this function is globally available (from BoxAuth.gs)
    if (!accessToken) {
        Logger.log("❌ No valid access token. Aborting incremental processing.");
        return;
    }
    
    var checkpoint = ns.getProcessingCheckpoint();
    var stats = { processed: 0, skipped_up_to_date: 0, skipped_failed_same_build: 0, retried_failed_new_build: 0, retried_complete_new_build: 0, errors: 0, files_considered: 0 };
    
    Logger.log("Starting incremental processing from checkpoint: " + JSON.stringify(checkpoint));
    
    try {
      var foldersToProcess = ns.getFoldersToProcess(); // Gets an array of folder IDs
      var currentFolderIndex = checkpoint.folderIndex || 0;
      var currentFileOffset = checkpoint.fileOffset || 0; // For paging through files in a folder
      var allFoldersProcessedInCycle = false;

      for (var folderIdx = currentFolderIndex; folderIdx < foldersToProcess.length; folderIdx++) {
        var folderId = foldersToProcess[folderIdx];
        Logger.log(`Processing Folder ID: ${folderId} (Index: ${folderIdx + 1}/${foldersToProcess.length}) starting at offset ${currentFileOffset}`);
        var moreFilesExistInFolder = true;

        while (moreFilesExistInFolder) {
            if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
                Logger.log("⏰ Approaching time limit. Saving checkpoint and stopping.");
                ns.saveProcessingCheckpoint({
                    folderIndex: folderIdx,
                    fileOffset: currentFileOffset, // Save current offset for this folder
                    lastRunTimestamp: new Date().toISOString()
                });
                ns.updateProcessingStats(stats, 'incremental_search_timed_out');
                return;
            }

            // Fetch a batch of files from the current folder starting at currentFileOffset
            var filesBatch = ns.getImageFilesInFolderWithPaging(folderId, accessToken, PROCESSING_BATCH_SIZE, currentFileOffset);
            stats.files_considered += filesBatch.length;

            if (filesBatch.length === 0) {
                moreFilesExistInFolder = false; // No more files in this folder or error fetching
                Logger.log(`No more files found in folder ${folderId} at offset ${currentFileOffset} or error fetching.`);
                break; // Move to the next folder
            }
            
            Logger.log(`  Fetched ${filesBatch.length} files from folder ${folderId} (offset: ${currentFileOffset}).`);

            for (var fileIdx = 0; fileIdx < filesBatch.length; fileIdx++) {
                if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
                    Logger.log("⏰ Time limit reached within file batch. Saving checkpoint.");
                    ns.saveProcessingCheckpoint({
                        folderIndex: folderIdx,
                        fileOffset: currentFileOffset + fileIdx, // Save offset of the file we didn't process
                        lastRunTimestamp: new Date().toISOString()
                    });
                    ns.updateProcessingStats(stats, 'incremental_search_timed_out_batch');
                    return;
                }
                
                var file = filesBatch[fileIdx];
                var result = ns.processFileIfNeeded(file, accessToken); // This is the core processing call

                switch (result) {
                    case 'processed': stats.processed++; break;
                    case 'skipped': stats.skipped_up_to_date++; break; // General skip (e.g. complete and up-to-date)
                    case 'skipped_failed_same_build': stats.skipped_failed_same_build++; break;
                    case 'retried_failed_new_build': stats.retried_failed_new_build++; stats.processed++; break; // Count as processed if retried
                    case 'retried_complete_new_build': stats.retried_complete_new_build++; stats.processed++; break; // Count as processed if retried
                    default: stats.errors++; break; // 'error' or any other non-success status
                }
                Utilities.sleep(200); // Small delay between processing individual files
            }
            currentFileOffset += filesBatch.length; // Advance offset for the next batch from this folder
            if (filesBatch.length < PROCESSING_BATCH_SIZE) {
                moreFilesExistInFolder = false; // Last batch for this folder
            }
        }
        currentFileOffset = 0; // Reset file offset for the next folder
        if (folderIdx === foldersToProcess.length - 1) {
            allFoldersProcessedInCycle = true; // Mark that we've gone through all configured folders
        }
      } // End of folders loop
      
      // If loop completed without time out for all folders
      Logger.log("✅ Completed a full cycle through specified folders.");
      ns.saveProcessingCheckpoint({
        folderIndex: 0, // Reset for next cycle
        fileOffset: 0,
        lastRunTimestamp: new Date().toISOString(),
        completedFullCycleTimestamp: new Date().toISOString() // Mark completion
      });
      ns.updateProcessingStats(stats, 'incremental_search_completed_cycle');
      
    } catch (error) {
      Logger.log("❌ CRITICAL Error in incremental processing: " + error.toString() + (error.stack ? "\nStack: " + error.stack : ""));
      stats.errors++; // Log a general error for the run
      ns.updateProcessingStats(stats, 'incremental_search_critical_error');
      // Consider saving checkpoint even on critical error to not restart from beginning
      var currentCheckpointOnError = ns.getProcessingCheckpoint();
      ns.saveProcessingCheckpoint({
          folderIndex: currentCheckpointOnError.folderIndex || 0,
          fileOffset: currentCheckpointOnError.fileOffset || 0,
          lastRunTimestamp: new Date().toISOString(),
          errorOccurred: true
      });
    } finally {
      Logger.log("\n📊 Incremental Processing Run Summary:");
      Logger.log(`  Considered: ${stats.files_considered}`);
      Logger.log(`  Processed: ${stats.processed} (includes retries)`);
      Logger.log(`  Skipped (up-to-date): ${stats.skipped_up_to_date}`);
      Logger.log(`  Skipped (failed on same build): ${stats.skipped_failed_same_build}`);
      Logger.log(`  Retried (failed on old build): ${stats.retried_failed_new_build}`);
      Logger.log(`  Retried (complete on old build): ${stats.retried_complete_new_build}`);
      Logger.log(`  Errors: ${stats.errors}`);
      Logger.log(`  Execution Time: ${(Date.now() - startTime) / 1000}s`);
    }
  };
  

/**
   * Core logic to process a single file if it needs processing based on its metadata.
   * This version implements the "retry failed on new build" and "reprocess complete on new build" logic.
   * @param {object} file A file object from Box API (must include at least id and name).
   * @param {string} accessToken Valid Box access token.
   * @returns {string} Status: 'processed', 'skipped', 'skipped_failed_same_build', 
   * 'retried_failed_new_build', 'retried_complete_new_build', or 'error'.
   */
  ns.processFileIfNeeded = function(file, accessToken) {
    if (!file || !file.id || !file.name) {
        Logger.log("❌ Invalid file object passed to processFileIfNeeded.");
        return 'error';
    }

    var currentMetadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken, Config.BOX_METADATA_TEMPLATE_KEY);
    const currentScriptBuild = Config.getCurrentBuild();

    if (currentMetadata) {
        const fileBuildNumber = currentMetadata.buildNumber;
        const stage = currentMetadata.processingStage;

        if (stage === Config.PROCESSING_STAGE_FAILED) {
            if (Config.shouldReprocessForBuild(fileBuildNumber)) {
                Logger.log(`🔁 Retrying previously FAILED file ${file.name} (ID: ${file.id}) due to new build. (File build: ${fileBuildNumber}, Script build: ${currentScriptBuild})`);
                // Proceed to processing by falling through logic below this metadata check block
            } else {
                Logger.log(`⏭️ Skipping FAILED file ${file.name} (ID: ${file.id}). Already failed under current build version (${fileBuildNumber}).`);
                return 'skipped_failed_same_build';
            }
        } else if (stage === Config.PROCESSING_STAGE_COMPLETE || 
                   stage === Config.PROCESSING_STAGE_AI || 
                   stage === Config.PROCESSING_STAGE_REVIEW) {
            // Consider AI_ANALYZED and HUMAN_REVIEWED as "complete enough" - only reprocess on build changes
            if (Config.shouldReprocessForBuild(fileBuildNumber)) {
                Logger.log(`🔁 Reprocessing ${stage.toUpperCase()} file ${file.name} (ID: ${file.id}) due to new build. (File build: ${fileBuildNumber}, Script build: ${currentScriptBuild})`);
                // Proceed to processing
            } else {
                Logger.log(`⏭️ Skipped ${stage.toUpperCase()} file ${file.name} (ID: ${file.id}). Processed by current build version (${fileBuildNumber}).`);
                return stage === Config.PROCESSING_STAGE_COMPLETE ? 'skipped' : 'skipped'; // All considered "complete enough"
            }
        } else {
            // Only UNPROCESSED, BASIC_EXTRACTED, EXIF_EXTRACTED should continue processing
            Logger.log(`▶️ Processing file ${file.name} (ID: ${file.id}) with current stage: ${stage || 'None'}, file build: ${fileBuildNumber || 'None'}.`);
        }
    } else {
        // No metadata instance exists for our templateKey, so it's a new file for our system.
        Logger.log(`✨ New file detected (no metadata instance): ${file.name} (ID: ${file.id}). Processing.`);
    }

    // --- Actual Processing Logic ---
    try {
        Logger.log(`  Fetching details for ${file.name} (ID: ${file.id})`);
        var fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + file.id + 
                            '?fields=id,name,size,path_collection,created_at,modified_at,parent,mime_type'; // Added mime_type
        var response = UrlFetchApp.fetch(fileDetailsUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
        });

        if (response.getResponseCode() === 200) {
            var fileDetails = JSON.parse(response.getContentText());
            
            Logger.log(`  Extracting metadata for ${file.name}`);
            // MetadataExtraction.extractMetadata should set the final processingStage and current buildNumber internally
            var metadataPayload = MetadataExtraction.extractMetadata(fileDetails, accessToken); 
            
            // Ensure buildNumber and a definitive processingStage are in the payload before applying.
            // extractMetadata should be responsible for this. If it fails, it should throw or return error state.
            // If extractMetadata itself determines a failure, it might return a payload indicating failure.
            // For this flow, we assume extractMetadata returns the full payload ready for application.
            // If extractMetadata itself throws an error, the catch block below handles it.

            Logger.log(`  Applying metadata to ${file.name}, build: ${metadataPayload.buildNumber || currentScriptBuild}, stage: ${metadataPayload.processingStage}`);
            var success = BoxFileOperations.applyMetadata(file.id, metadataPayload, accessToken, Config.BOX_METADATA_TEMPLATE_KEY);

            if (success) {
                Logger.log(`✅ Successfully processed and applied metadata for ${file.name} with build ${metadataPayload.buildNumber || currentScriptBuild}. Stage: ${metadataPayload.processingStage}`);
                // Determine if it was a retry of a failed/complete item
                if (currentMetadata && currentMetadata.processingStage === Config.PROCESSING_STAGE_FAILED) return 'retried_failed_new_build';
                if (currentMetadata && (currentMetadata.processingStage === Config.PROCESSING_STAGE_COMPLETE || 
                                      currentMetadata.processingStage === Config.PROCESSING_STAGE_AI ||
                                      currentMetadata.processingStage === Config.PROCESSING_STAGE_REVIEW)) return 'retried_complete_new_build';
                return 'processed';
            } else {
                Logger.log(`❌ Failed to apply metadata for ${file.name} after extraction.`);
                BoxFileOperations.markFileAsFailed(file.id, accessToken, "Failed to apply metadata post-extraction.", currentScriptBuild);
                return 'error';
            }
        } else {
            var errorMsg = `Failed to download file details for ${file.name}. Code: ${response.getResponseCode()}. Response: ${response.getContentText().substring(0,200)}`;
            Logger.log(`❌ ${errorMsg}`);
            BoxFileOperations.markFileAsFailed(file.id, accessToken, errorMsg, currentScriptBuild);
            return 'error';
        }
    } catch (error) {
        var criticalErrorMsg = `CRITICAL error processing file ${file.name} (ID: ${file.id}): ${error.toString()}` + (error.stack ? `\nStack: ${error.stack}` : "");
        Logger.log(`❌ ${criticalErrorMsg}`);
        BoxFileOperations.markFileAsFailed(file.id, accessToken, criticalErrorMsg.substring(0,250), currentScriptBuild);
        return 'error';
    }
  };  

// In dkoosis/boxer/boxer-dd651257104aaa36c00b667749eff28460a5de08/OptimizedProcessing.js

  // ... other parts of OptimizedProcessing namespace ...

  /**
   * Fallback Strategy: Processes only files that appear to be unprocessed.
   * Searches for common image types using a consolidated query and checks if they lack metadata.
   * Limited by PROCESSING_BATCH_SIZE to ensure it finishes quickly.
   */
  ns.processUnprocessedFilesOnly = function() {
    Logger.log("=== Fallback Strategy: Processing Unprocessed Files Only (Quick Scan with Consolidated Search) ===\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken(); // Assumes this function is globally available (from BoxAuth.gs)
    if (!accessToken) {
        Logger.log("❌ No valid access token. Aborting unprocessed files scan.");
        return;
    }
    var stats = { processed: 0, skipped_up_to_date: 0, errors: 0, files_considered: 0 };
    var filesFoundFromSearch = []; // Initialize here

    try {
      // Define desired image extensions for a single, consolidated search
      var imageExtensions = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'tiff', 'gif', 'bmp', 'webp']; // Add or remove as needed
      var extensionsString = imageExtensions.join(',');
      var searchLimit = PROCESSING_BATCH_SIZE * 2; // How many initial candidates to fetch
      
      Logger.log(`Searching for potentially unprocessed files with extensions: "${extensionsString}" (limit ${searchLimit})`);

      // Construct the URL for a single search query using file_extensions
      // The Box API search endpoint. No 'query' parameter is strictly needed if 'file_extensions' is used as the primary filter.
      // We include 'type=file' to ensure we only get files.
      var searchUrl = Config.BOX_API_BASE_URL + '/search' +
                     '?file_extensions=' + encodeURIComponent(extensionsString) +
                     '&limit=' + searchLimit +
                     '&type=file' + // Crucial to ensure we only get files
                     '&fields=id,name,size,created_at,modified_at,parent,path_collection,mime_type';
                     // Note: If Box API strictly requires a 'query' param even with file_extensions, 
                     // you might need to add '&query=' (empty) or a generic one like '&query=*'
                     // but typically file_extensions should suffice as a filter.

      if (Date.now() - startTime <= MAX_EXECUTION_TIME_MS / 2) { // Check time before making the API call
        var response = UrlFetchApp.fetch(searchUrl, { // Using UrlFetchApp directly for this custom call
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });

        var responseCode = response.getResponseCode();
        if (responseCode === 200) {
          var data = JSON.parse(response.getContentText());
          // The data.entries should already be files of the specified extensions.
          // A redundant check for item.type === 'file' is okay.
          filesFoundFromSearch = (data.entries || []).filter(function(item) {
            return item.type === 'file'; 
          });
        } else {
          Logger.log(`Consolidated search failed. Code: ${responseCode}. URL: ${searchUrl}. Response: ${response.getContentText().substring(0,200)}`);
          // filesFoundFromSearch will remain empty, and the function will proceed gracefully.
        }
      } else {
         Logger.log("⏰ Approaching time limit before consolidated search phase could complete. Stopping search.");
      }
      
      // Deduplicate found files (Box should return unique entries, but good for safety)
      var uniqueFiles = [];
      var seenIds = {};
      filesFoundFromSearch.forEach(function(file) {
        if (!seenIds[file.id]) {
          uniqueFiles.push(file);
          seenIds[file.id] = true;
        }
      });
      Logger.log(`Found ${uniqueFiles.length} unique file(s) from consolidated search.`);

      var filesToPotentiallyProcess = [];
      // Filter down to files that actually lack metadata, up to PROCESSING_BATCH_SIZE
      for (var j = 0; j < uniqueFiles.length; j++) {
        if (filesToPotentiallyProcess.length >= PROCESSING_BATCH_SIZE) break;
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS * 0.75) { 
            Logger.log("⏰ Approaching time limit before processing, stopping file check.");
            break;
        }
        var file = uniqueFiles[j];
        // Assuming BoxFileOperations.hasExistingMetadata is reliable now
        if (!BoxFileOperations.hasExistingMetadata(file.id, accessToken, Config.BOX_METADATA_TEMPLATE_KEY)) {
          filesToPotentiallyProcess.push(file);
        }
        if (j > 0 && j % 10 === 0) Utilities.sleep(100); // Small delay during metadata check loop, if checking many
      }
      
      Logger.log(`Identified ${filesToPotentiallyProcess.length} files lacking metadata for processing.`);
      stats.files_considered = filesToPotentiallyProcess.length;

      for (var k = 0; k < filesToPotentiallyProcess.length; k++) {
        // ... (rest of the processing loop for filesToPotentiallyProcess remains the same) ...
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Time limit reached during processing of unprocessed files.");
          break;
        }
        
        var fileToProcess = filesToPotentiallyProcess[k];
        Logger.log(`Processing new/unprocessed file: ${fileToProcess.name} (${fileToProcess.id})`);
        var result = ns.processFileIfNeeded(fileToProcess, accessToken); // This calls the core logic
        
        if (result === 'processed' || result === 'retried_failed_new_build' || result === 'retried_complete_new_build') {
            stats.processed++;
        } else if (result === 'skipped' || result === 'skipped_failed_same_build') {
            stats.skipped_up_to_date++; // Simplified skip counting for this summary
        } else {
            stats.errors++;
        }
        
        Utilities.sleep(200); // Delay between processing
      }
      
      ns.updateProcessingStats(stats, 'search_unprocessed_consolidated'); // Updated strategy name for stats
      
    } catch (error) {
      Logger.log("❌ CRITICAL Error in processing unprocessed files (consolidated search): " + error.toString() + (error.stack ? "\nStack: " + error.stack : ""));
      stats.errors++;
      ns.updateProcessingStats(stats, 'search_unprocessed_consolidated_critical_error');
    } finally {
      Logger.log("\n📊 Unprocessed Files Scan Summary (Consolidated Search):");
      Logger.log(`  Considered (initially found matching extensions): ${uniqueFiles ? uniqueFiles.length : 'N/A'}`);
      Logger.log(`  Identified as lacking metadata: ${stats.files_considered}`);
      Logger.log(`  Processed (or retried due to new build): ${stats.processed}`);
      Logger.log(`  Skipped (up-to-date or failed on same build): ${stats.skipped_up_to_date}`);
      Logger.log(`  Errors: ${stats.errors}`);
      Logger.log(`  Execution Time: ${(Date.now() - startTime) / 1000}s`);
    }
  };

// ... rest of OptimizedProcessing.js ...


  /**
   * Search Box for files matching a query.
   * @param {string} query The Box search query string.
   * @param {string} accessToken Valid Box access token.
   * @param {number} limit Max number of items to return.
   * @returns {object[]} Array of file objects from search results, or empty array on error.
   */
  ns.searchBoxFiles = function(query, accessToken, limit) {
    limit = limit || 50; // Default limit
    
    try {
      // Include path_collection and mime_type for better context
      var searchUrl = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                     '&limit=' + limit + '&type=file' + // Ensure we only get files
                     '&fields=id,name,size,created_at,modified_at,parent,path_collection,mime_type'; 
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        // Filter for images explicitly here, as Box search might return other file types even with extension in query
        return data.entries.filter(function(item) {
          return item.type === 'file' && BoxFileOperations.isImageFile(item.name);
        });
      } else {
        Logger.log(`Search failed with query "${query}". Code: ${response.getResponseCode()}. Response: ${response.getContentText().substring(0,200)}`);
        return [];
      }
    } catch (error) {
      Logger.log(`Exception during searchBoxFiles with query "${query}": ${error.toString()}`);
      return [];
    }
  };

  /**
   * Get image files from a specific folder with paging support using Box API's items endpoint.
   * This is preferred over search for specific folder contents if search indexing is slow.
   * @param {string} folderId The ID of the folder.
   * @param {string} accessToken Valid Box access token.
   * @param {number} limit Number of items to fetch per page.
   * @param {number} offset Starting offset for items.
   * @returns {object[]} Array of file objects that are images.
   */
  ns.getImageFilesInFolderWithPaging = function(folderId, accessToken, limit, offset) {
    limit = limit || PROCESSING_BATCH_SIZE; // Use defined batch size or default
    offset = offset || 0;
    var imageFiles = [];
    try {
      var url = Config.BOX_API_BASE_URL + '/folders/' + folderId + '/items' +
                '?fields=id,name,type,size,created_at,modified_at,parent,path_collection,mime_type' +
                '&limit=' + limit +
                '&offset=' + offset;

      var response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        data.entries.forEach(function(item) {
          if (item.type === 'file' && BoxFileOperations.isImageFile(item.name)) {
            imageFiles.push(item);
          }
        });
      } else {
        Logger.log(`Failed to get items for folder ${folderId} (offset ${offset}). Code: ${response.getResponseCode()}. Resp: ${response.getContentText().substring(0,200)}`);
      }
    } catch (e) {
      Logger.log(`Exception fetching items for folder ${folderId} (offset ${offset}): ${e.toString()}`);
    }
    return imageFiles;
  };
  
  // --- Checkpoint and Statistics Management ---
  
  ns.getProcessingCheckpoint = function() {
    var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(CHECKPOINT_PROPERTY);
    // Default structure for checkpoint
    return checkpointStr ? JSON.parse(checkpointStr) : { folderIndex: 0, fileOffset: 0, lastRunTimestamp: null };
  };
  
  ns.saveProcessingCheckpoint = function(checkpoint) {
    Config.SCRIPT_PROPERTIES.setProperty(CHECKPOINT_PROPERTY, JSON.stringify(checkpoint));
    Logger.log("Checkpoint saved: " + JSON.stringify(checkpoint));
  };
  
  ns.updateProcessingStats = function(runStats, strategyName) {
    var statsProperty = Config.SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
    var allStats = statsProperty ? JSON.parse(statsProperty) : [];
    
    var completedRunStats = {
      timestamp: new Date().toISOString(),
      strategy: strategyName,
      duration_seconds: runStats.duration_seconds, // Should be calculated by caller
      files_considered: runStats.files_considered || 0,
      processed: runStats.processed || 0,
      skipped_up_to_date: runStats.skipped_up_to_date || 0,
      skipped_failed_same_build: runStats.skipped_failed_same_build || 0,
      retried_failed_new_build: runStats.retried_failed_new_build || 0,
      retried_complete_new_build: runStats.retried_complete_new_build || 0,
      errors: runStats.errors || 0
    };
    
    allStats.push(completedRunStats);
    if (allStats.length > 20) { // Keep last 20 stats entries
      allStats = allStats.slice(-20);
    }
    Config.SCRIPT_PROPERTIES.setProperty(STATS_PROPERTY, JSON.stringify(allStats));
    Logger.log("Processing stats updated for strategy: " + strategyName);
  };
  
  ns.getFoldersToProcess = function() {
    // Example: process a specific test folder and the root folder.
    // Customize this to return an array of folder IDs you want to process.
    // Ensure these folder IDs exist and the authenticated user has access.
    var folders = [];
    if (Config.ACTIVE_TEST_FOLDER_ID && Config.ACTIVE_TEST_FOLDER_ID !== '0') {
         folders.push(Config.ACTIVE_TEST_FOLDER_ID);
    }
    // Avoid adding root '0' if it's the same as test folder or if you only want specific folders
    // if (Config.DEFAULT_PROCESSING_FOLDER_ID && Config.DEFAULT_PROCESSING_FOLDER_ID !== Config.ACTIVE_TEST_FOLDER_ID) {
    //     folders.push(Config.DEFAULT_PROCESSING_FOLDER_ID);
    // }
    // If no specific folders, default to root. For safety, usually better to specify.
    // For this example, let's use a known test folder or a default if not set.
    return folders.length > 0 ? folders : [Config.DEFAULT_PROCESSING_FOLDER_ID || '0'];
  };
  
  return ns;
})();

// Main optimized processing function for triggers
function processBoxImagesOptimized() {
  var overallStartTime = Date.now();
  Logger.log(`🚀 Starting Optimized Box Image Processing at ${new Date(overallStartTime).toISOString()}\n`);
  
  var checkpoint = OptimizedProcessing.getProcessingCheckpoint();
  var lastRunTimestamp = checkpoint.lastRunTimestamp;
  var hoursSinceLastFullCycle = Infinity;

  if (checkpoint.completedFullCycleTimestamp) {
      hoursSinceLastFullCycle = (Date.now() - new Date(checkpoint.completedFullCycleTimestamp).getTime()) / (1000 * 60 * 60);
  } else if (lastRunTimestamp) { // Fallback to last run if no full cycle completed yet
      hoursSinceLastFullCycle = (Date.now() - new Date(lastRunTimestamp).getTime()) / (1000 * 60 * 60);
  }

  Logger.log(`Hours since last full cycle completion (or last run): ${hoursSinceLastFullCycle.toFixed(2)}`);

  // Decision logic for strategy:
  // If a full cycle was completed relatively recently (e.g., within 24 hours),
  // do a quick scan for unprocessed files. Otherwise, continue incremental processing.
  if (checkpoint.completedFullCycleTimestamp && hoursSinceLastFullCycle < 23) { // e.g. less than 23 hours ago
    Logger.log("Recent full cycle detected. Running quick scan for unprocessed files.");
    OptimizedProcessing.processUnprocessedFilesOnly();
  } else {
    Logger.log("No recent full cycle or significant time passed. Running incremental checkpoint processing.");
    OptimizedProcessing.processIncrementallyWithCheckpoints();
  }
  Logger.log(`🏁 Optimized Box Image Processing finished. Total time: ${(Date.now() - overallStartTime) / 1000}s`);
}

// Show processing statistics
function showOptimizedProcessingStats() {
  Logger.log("=== Optimized Processing Statistics (Last 20 Runs) ===\n");
  
  var statsStr = Config.SCRIPT_PROPERTIES.getProperty('OPTIMIZED_PROCESSING_STATS_V2'); // Ensure using correct property key
  if (!statsStr) {
    Logger.log("No processing statistics available yet.");
    return;
  }
  
  try {
    var allStats = JSON.parse(statsStr);
    if (!Array.isArray(allStats) || allStats.length === 0) {
        Logger.log("No statistics entries found or invalid format.");
        return;
    }
    
    allStats.forEach(function(run, index) {
      var date = new Date(run.timestamp).toLocaleString(); // More readable date
      Logger.log(`${index + 1}. Date: ${date}`);
      Logger.log(`   Strategy: ${run.strategy}`);
      Logger.log(`   Duration: ${run.duration_seconds !== undefined ? run.duration_seconds.toFixed(1) + 's' : 'N/A'}`);
      Logger.log(`   Considered: ${run.files_considered}, Processed: ${run.processed}`);
      Logger.log(`   Skipped (UpToDate): ${run.skipped_up_to_date}, Skipped (FailedSameBuild): ${run.skipped_failed_same_build}`);
      Logger.log(`   Retried (FailedOldBuild): ${run.retried_failed_new_build}, Retried (CompleteOldBuild): ${run.retried_complete_new_build}`);
      Logger.log(`   Errors: ${run.errors}`);
      Logger.log("   ------------------------------------");
    });
    
    var checkpoint = OptimizedProcessing.getProcessingCheckpoint();
    if (checkpoint.lastRunTimestamp) {
      var lastRunDate = new Date(checkpoint.lastRunTimestamp).toLocaleString();
      var hoursSince = ((Date.now() - new Date(checkpoint.lastRunTimestamp).getTime()) / (1000 * 60 * 60)).toFixed(2);
      Logger.log(`\nLast Checkpoint Saved: ${lastRunDate} (${hoursSince} hours ago)`);
      Logger.log(`   Folder Index: ${checkpoint.folderIndex}, File Offset: ${checkpoint.fileOffset}`);
      if (checkpoint.completedFullCycleTimestamp) {
        Logger.log(`   Last Full Cycle Completion: ${new Date(checkpoint.completedFullCycleTimestamp).toLocaleString()}`);
      }
    } else {
        Logger.log("\nNo checkpoint found. System may run a full scan next.");
    }

  } catch (e) {
      Logger.log("Error parsing statistics: " + e.toString());
  }
}

/**
 * Placeholder: Analyzes Box account and recommends processing strategy
 * In a real scenario, this would involve API calls to estimate content volume.
 */
function recommendProcessingStrategy() {
  Logger.log("=== Box Processing Strategy Recommendation (Placeholder) ===\n");
  Logger.log("Recommendation: For most moderately sized accounts (up to a few thousand images),");
  Logger.log("the default behavior of 'processBoxImagesOptimized' (running every 4-6 hours)");
  Logger.log("should be effective. It alternates between deep incremental scans and quick scans for new files.");
  Logger.log("For very large accounts (tens of thousands+), ensure your Box API limits are sufficient,");
  Logger.log("and consider breaking down processing by top-level folders if necessary, though the checkpoint system aims to manage this.");
}

/**
 * Placeholder: Quick setup for optimized processing
 * In a real scenario, this might create triggers or verify configurations.
 */
function setupOptimizedProcessing() {
  Logger.log("=== Setting Up Optimized Processing (Placeholder) ===\n");
  Logger.log("To use optimized processing, ensure:");
  Logger.log("1. All dependent scripts (Config.gs, BoxAuth.gs, BoxFileOperations.gs, MetadataExtraction.gs) are correctly set up.");
  Logger.log("2. Your Box App has the necessary permissions (read/write files, manage metadata).");
  Logger.log("3. Script Properties in Apps Script are populated (OAuth credentials, API keys, Config values).");
  Logger.log("4. Create a time-based trigger in Apps Script to call 'processBoxImagesOptimized' regularly (e.g., every 4 to 6 hours).");
  Logger.log("\n  Example Trigger Setup:");
  Logger.log("  - Go to Triggers (clock icon on the left in Apps Script editor).");
  Logger.log("  - Click '+ Add Trigger'.");
  Logger.log("  - Choose function to run: processBoxImagesOptimized");
  Logger.log("  - Choose deployment: Head");
  Logger.log("  - Select event source: Time-driven");
  Logger.log("  - Select type of time based trigger: Hour timer (or Day timer)");
  Logger.log("  - Select hour interval: Every 4 hours / Every 6 hours");
  Logger.log("  - Save.");
  Logger.log("\nInitial run might take longer as it processes existing files. Subsequent runs will be faster.");
  Logger.log("Monitor execution logs via 'Executions' in Apps Script editor.");
}

/**
 * Example function to process all images in a specific test folder using the core logic.
 * This can be used for targeted testing.
 */
function processSpecificFolderImages(folderIdToProcess) {
  var overallStartTime = Date.now();
  if (!folderIdToProcess) {
      folderIdToProcess = Config.ACTIVE_TEST_FOLDER_ID; // Default to active test folder if none provided
      if (!folderIdToProcess) {
          Logger.log("❌ No folderIdToProcess provided and Config.ACTIVE_TEST_FOLDER_ID is not set. Aborting.");
          return;
      }
  }
  Logger.log(`🎯 Starting targeted processing for folder: ${folderIdToProcess} at ${new Date(overallStartTime).toISOString()}`);
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No valid access token. Aborting targeted processing.");
    return;
  }

  var stats = { processed: 0, skipped_up_to_date: 0, skipped_failed_same_build: 0, retried_failed_new_build: 0, retried_complete_new_build: 0, errors: 0, files_considered: 0 };
  var offset = 0;
  var moreFiles = true;

  while(moreFiles) {
    if (Date.now() - overallStartTime > MAX_EXECUTION_TIME_MS) {
        Logger.log("⏰ Time limit reached during targeted folder processing.");
        break;
    }
    var imageFiles = OptimizedProcessing.getImageFilesInFolderWithPaging(folderIdToProcess, accessToken, PROCESSING_BATCH_SIZE, offset);
    stats.files_considered += imageFiles.length;

    if (imageFiles.length === 0) {
        moreFiles = false;
        break;
    }
    Logger.log(`  Fetched ${imageFiles.length} files from folder ${folderIdToProcess} (offset: ${offset}).`);

    imageFiles.forEach(function(image, index) {
        if (Date.now() - overallStartTime > MAX_EXECUTION_TIME_MS) {
            Logger.log("⏰ Time limit reached within batch for targeted folder.");
            moreFiles = false; // Signal to stop outer loop too
            return; // Exit forEach early
        }
        Logger.log(`  Processing ${index + 1}/${imageFiles.length}: ${image.name} (ID: ${image.id})`);
        var result = OptimizedProcessing.processFileIfNeeded(image, accessToken);
        switch (result) {
            case 'processed': stats.processed++; break;
            case 'skipped': stats.skipped_up_to_date++; break;
            case 'skipped_failed_same_build': stats.skipped_failed_same_build++; break;
            case 'retried_failed_new_build': stats.retried_failed_new_build++; stats.processed++; break;
            case 'retried_complete_new_build': stats.retried_complete_new_build++; stats.processed++; break;
            default: stats.errors++; break;
        }
        Utilities.sleep(200); // Small delay
    });
    offset += imageFiles.length;
    if (imageFiles.length < PROCESSING_BATCH_SIZE) {
        moreFiles = false; // Last page
    }
    if (!moreFiles) break; // Exit while loop if inner loop decided to stop
  }
  
  Logger.log(`🏁 Targeted processing for folder ${folderIdToProcess} finished.`);
  Logger.log("\n📊 Targeted Run Summary:");
  Logger.log(`  Considered: ${stats.files_considered}`);
  Logger.log(`  Processed: ${stats.processed} (includes retries)`);
  Logger.log(`  Skipped (up-to-date): ${stats.skipped_up_to_date}`);
  Logger.log(`  Skipped (failed on same build): ${stats.skipped_failed_same_build}`);
  Logger.log(`  Retried (failed on old build): ${stats.retried_failed_new_build}`);
  Logger.log(`  Retried (complete on old build): ${stats.retried_complete_new_build}`);
  Logger.log(`  Errors: ${stats.errors}`);
  Logger.log(`  Total Execution Time: ${(Date.now() - overallStartTime) / 1000}s`);
}