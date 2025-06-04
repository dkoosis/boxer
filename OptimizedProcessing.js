// File: OptimizedProcessing.gs

/**
 * OptimizedProcessing namespace - Fixed version (keeping good parts!)
 */
var OptimizedProcessing = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration
  var MAX_EXECUTION_TIME_MS = 5 * 60 * 1000; // 5 minutes (safe margin for 6-minute limit)
  var BATCH_SIZE = 8; // Process this many files per batch
  var SEARCH_LIMIT = 200; // How many files to fetch in consolidated search
  var CHECKPOINT_PROPERTY = 'BOXER_PROCESSING_CHECKPOINT';
  var STATS_PROPERTY = 'BOXER_PROCESSING_STATS';
  
  /**
   * Main optimized processing function - simplified but keeps efficient search
   */
  ns.processBoxImagesOptimized = function() {
    var startTime = Date.now();
    Logger.log(`🐕 Boxer starting optimized processing at ${new Date().toISOString()}`);
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log("❌ No access token available");
      return;
    }
    
    var stats = {
      filesFound: 0,
      processed: 0,
      skipped: 0,
      errors: 0,
      executionTimeMs: 0
    };
    
    try {
      // Use the ORIGINAL efficient consolidated search (this was actually good!)
      var candidateFiles = ns.findFilesUsingConsolidatedSearch(accessToken, startTime);
      stats.filesFound = candidateFiles.length;
      
      Logger.log(`🎯 Found ${candidateFiles.length} image files from consolidated search`);
      
      if (candidateFiles.length === 0) {
        Logger.log("✅ No image files found - Boxer needs more bones to fetch!");
        return;
      }
      
      // Filter to files that actually need processing
      var filesToProcess = ns.filterFilesNeedingProcessing(candidateFiles, accessToken, startTime);
      
      Logger.log(`🦴 ${filesToProcess.length} files need Boxer's attention`);
      
      if (filesToProcess.length === 0) {
        Logger.log("✅ All files up to date - Boxer is the goodest boy!");
        return;
      }
      
      // Process files in batches until time limit
      var maxFiles = Math.min(filesToProcess.length, 50); // Don't try to process too many
      
      for (var i = 0; i < maxFiles; i += BATCH_SIZE) {
        // Check time limit before each batch
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Time limit reached, Boxer needs a nap");
          break;
        }
        
        var batch = filesToProcess.slice(i, i + BATCH_SIZE);
        var batchResults = ns.processBatch(batch, accessToken);
        
        stats.processed += batchResults.processed;
        stats.skipped += batchResults.skipped;
        stats.errors += batchResults.errors;
        
        Logger.log(`📦 Batch ${Math.floor(i/BATCH_SIZE) + 1}: Processed ${batchResults.processed}, Skipped ${batchResults.skipped}, Errors ${batchResults.errors}`);
        
        // Small delay between batches to be nice to Box API
        Utilities.sleep(500);
      }
      
      // Save simple checkpoint
      ns.saveCheckpoint({
        lastRunTime: new Date().toISOString(),
        filesProcessedThisRun: stats.processed,
        currentBuild: Config.getCurrentBuild()
      });
      
    } catch (error) {
      Logger.log(`❌ Critical error: ${error.toString()}`);
      stats.errors++;
    } finally {
      stats.executionTimeMs = Date.now() - startTime;
      ns.saveStats(stats);
      
      Logger.log("\n📊 BOXER'S FETCH REPORT:");
      Logger.log(`🎾 Files found: ${stats.filesFound}`);
      Logger.log(`✅ Processed: ${stats.processed}`);
      Logger.log(`⏭️ Skipped: ${stats.skipped}`);
      Logger.log(`❌ Errors: ${stats.errors}`);
      Logger.log(`⏱️ Time: ${(stats.executionTimeMs / 1000).toFixed(1)}s`);
      
      if (stats.processed > 0) {
        Logger.log("🦴 Good boy Boxer! Files have been organized!");
      }
    }
  };
  
  /**
   * Find files using ORIGINAL efficient consolidated search (this was good!)
   */
  ns.findFilesUsingConsolidatedSearch = function(accessToken, startTime) {
    Logger.log("🔍 Using efficient consolidated search for image files...");
    
    try {
      // ORIGINAL approach - this was actually efficient and correct!
      var imageExtensions = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'tiff', 'gif', 'bmp', 'webp'];
      var extensionsString = imageExtensions.join(',');
      
      var searchUrl = Config.BOX_API_BASE_URL + '/search' +
                     '?query=' + 
                     '?file_extensions=' + encodeURIComponent(extensionsString) +
                     '&limit=' + SEARCH_LIMIT +
                     '&type=file' +
                     '&fields=id,name,size,created_at,modified_at,parent,path_collection';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        // Filter and deduplicate (defensive programming)
        var uniqueFiles = [];
        var seenIds = new Set();
        
        (data.entries || []).forEach(function(file) {
          if (file.type === 'file' && 
              BoxFileOperations.isImageFile(file.name) && 
              !seenIds.has(file.id)) {
            seenIds.add(file.id);
            uniqueFiles.push(file);
          }
        });
        
        Logger.log(`✅ Consolidated search found ${uniqueFiles.length} unique image files`);
        return uniqueFiles;
        
      } else {
        Logger.log(`❌ Consolidated search failed: ${response.getResponseCode()}`);
        Logger.log(`Response: ${response.getContentText().substring(0, 200)}`);
        return [];
      }
      
    } catch (error) {
      Logger.log(`❌ Exception during consolidated search: ${error.toString()}`);
      return [];
    }
  };
  
  /**
   * Filter files to those that actually need processing - this is where the real logic is
   */
  ns.filterFilesNeedingProcessing = function(files, accessToken, startTime) {
    var needsProcessing = [];
    var currentBuild = Config.getCurrentBuild();
    
    Logger.log(`🔎 Checking which files need processing (current build: ${currentBuild})`);
    
    // Limit how many files we check metadata for (time management)
    var maxToCheck = Math.min(files.length, 150);
    
    for (var i = 0; i < maxToCheck; i++) {
      // Check time limit during filtering
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS * 0.75) {
        Logger.log("⏰ Time limit during filtering, stopping filter phase");
        break;
      }
      
      var file = files[i];
      var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
      
      var shouldProcess = false;
      var reason = '';
      
      if (!metadata) {
        // No metadata at all - definitely needs processing
        shouldProcess = true;
        reason = 'no metadata';
      } else {
        var stage = metadata.processingStage;
        var fileBuild = metadata.buildNumber;
        
        // Check if file needs reprocessing due to build change
        if (Config.shouldReprocessForBuild(fileBuild)) {
          shouldProcess = true;
          reason = `build update (${fileBuild || 'unknown'} → ${currentBuild})`;
        } 
        // Check if processing stage indicates incomplete processing
        else if (!stage || 
                 stage === Config.PROCESSING_STAGE_UNPROCESSED ||
                 stage === Config.PROCESSING_STAGE_BASIC ||
                 stage === Config.PROCESSING_STAGE_FAILED) {
          shouldProcess = true;
          reason = `incomplete (${stage || 'unknown'})`;
        }
        // Skip files that are already complete and up-to-date
        else if (stage === Config.PROCESSING_STAGE_COMPLETE ||
                 stage === Config.PROCESSING_STAGE_AI ||
                 stage === Config.PROCESSING_STAGE_REVIEW) {
          shouldProcess = false;
          reason = `complete (${stage})`;
        } else {
          // Unknown stage, better to process it
          shouldProcess = true;
          reason = `unknown stage (${stage})`;
        }
      }
      
      if (shouldProcess) {
        needsProcessing.push({
          file: file,
          reason: reason
        });
      }
      
      // Progress indicator and small delay for large batches
      if (i > 0 && i % 25 === 0) {
        Logger.log(`  📋 Checked ${i}/${maxToCheck} files, found ${needsProcessing.length} needing processing`);
        Utilities.sleep(100);
      }
    }
    
    Logger.log(`🎯 ${needsProcessing.length} files need processing`);
    
    if (needsProcessing.length > 0) {
      Logger.log("📋 Reasons breakdown:");
      var reasonCounts = {};
      needsProcessing.forEach(function(item) {
        var reasonType = item.reason.split(' ')[0];
        reasonCounts[reasonType] = (reasonCounts[reasonType] || 0) + 1;
      });
      
      Object.keys(reasonCounts).forEach(function(reason) {
        Logger.log(`   ${reason}: ${reasonCounts[reason]} files`);
      });
    }
    
    // Sort by priority - new files first, then build updates, then incomplete
    needsProcessing.sort(function(a, b) {
      var priorityMap = {
        'no': 0,        // 'no metadata'
        'incomplete': 1, // 'incomplete (stage)'
        'build': 2,     // 'build update'
        'unknown': 3    // 'unknown stage'
      };
      
      var aType = a.reason.split(' ')[0];
      var bType = b.reason.split(' ')[0];
      var aPriority = priorityMap[aType] !== undefined ? priorityMap[aType] : 999;
      var bPriority = priorityMap[bType] !== undefined ? priorityMap[bType] : 999;
      
      return aPriority - bPriority;
    });
    
    return needsProcessing.map(function(item) { return item.file; });
  };
  
  /**
   * Process a batch of files
   */
  ns.processBatch = function(files, accessToken) {
    var results = { processed: 0, skipped: 0, errors: 0 };
    
    files.forEach(function(file) {
      try {
        var result = ns.processFileIfNeeded(file, accessToken);
        
        if (result === 'processed') {
          results.processed++;
        } else if (result === 'skipped') {
          results.skipped++;
        } else {
          results.errors++;
        }
        
        // Small delay between files
        Utilities.sleep(300);
        
      } catch (error) {
        Logger.log(`❌ Error processing ${file.name}: ${error.toString()}`);
        results.errors++;
      }
    });
    
    return results;
  };
  
  /**
   * Process a single file - simplified version
   */
  ns.processFileIfNeeded = function(file, accessToken) {
    if (!file || !file.id || !file.name) {
      return 'error';
    }
    
    try {
      Logger.log(`🐕 Processing: ${file.name}`);
      
      // Get full file details
      var fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + file.id + 
                          '?fields=id,name,size,path_collection,created_at,modified_at,parent';
      
      var response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to get file details for ${file.name}`);
        return 'error';
      }
      
      var fileDetails = JSON.parse(response.getContentText());
      
      // Extract enhanced metadata (this includes build number and processing stage)
      var metadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      
      // Apply metadata
      var success = BoxFileOperations.applyMetadata(file.id, metadata, accessToken);
      
      if (success) {
        Logger.log(`✅ Successfully processed: ${file.name} (Stage: ${metadata.processingStage})`);
        return 'processed';
      } else {
        Logger.log(`❌ Failed to apply metadata for: ${file.name}`);
        return 'error';
      }
      
    } catch (error) {
      Logger.log(`❌ Exception processing ${file.name}: ${error.toString()}`);
      return 'error';
    }
  };
  
  /**
   * Save simple checkpoint
   */
  ns.saveCheckpoint = function(checkpoint) {
    try {
      Config.SCRIPT_PROPERTIES.setProperty(CHECKPOINT_PROPERTY, JSON.stringify(checkpoint));
    } catch (error) {
      Logger.log(`Error saving checkpoint: ${error.toString()}`);
    }
  };
  
  /**
   * Get checkpoint
   */
  ns.getCheckpoint = function() {
    try {
      var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(CHECKPOINT_PROPERTY);
      return checkpointStr ? JSON.parse(checkpointStr) : {};
    } catch (error) {
      Logger.log(`Error getting checkpoint: ${error.toString()}`);
      return {};
    }
  };
  
  /**
   * Save processing stats
   */
  ns.saveStats = function(stats) {
    try {
      var allStatsStr = Config.SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
      var allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
      
      stats.timestamp = new Date().toISOString();
      allStats.push(stats);
      
      // Keep last 10 runs
      if (allStats.length > 10) {
        allStats = allStats.slice(-10);
      }
      
      Config.SCRIPT_PROPERTIES.setProperty(STATS_PROPERTY, JSON.stringify(allStats));
    } catch (error) {
      Logger.log(`Error saving stats: ${error.toString()}`);
    }
  };
  
  return ns;
})();

// Main function for triggers
function processBoxImagesOptimized() {
  OptimizedProcessing.processBoxImagesOptimized();
}

// Show recent processing stats
function showOptimizedProcessingStats() {
  Logger.log("=== 🐕 Boxer's Recent Performance ===\n");
  
  try {
    var statsStr = Config.SCRIPT_PROPERTIES.getProperty('BOXER_PROCESSING_STATS');
    if (!statsStr) {
      Logger.log("No stats available yet - Boxer hasn't run!");
      return;
    }
    
    var allStats = JSON.parse(statsStr);
    
    allStats.forEach(function(run, index) {
      var date = new Date(run.timestamp).toLocaleString();
      Logger.log(`${index + 1}. ${date}`);
      Logger.log(`   🎾 Found: ${run.filesFound}, ✅ Processed: ${run.processed}`);
      Logger.log(`   ⏭️ Skipped: ${run.skipped}, ❌ Errors: ${run.errors}`);
      Logger.log(`   ⏱️ Time: ${(run.executionTimeMs / 1000).toFixed(1)}s`);
      Logger.log("   " + "─".repeat(40));
    });
    
    var checkpoint = OptimizedProcessing.getCheckpoint();
    if (checkpoint.lastRunTime) {
      var timeSince = ((Date.now() - new Date(checkpoint.lastRunTime).getTime()) / (1000 * 60 * 60)).toFixed(1);
      Logger.log(`\n🕐 Last run: ${checkpoint.lastRunTime} (${timeSince} hours ago)`);
      Logger.log(`🔧 Last processed with build: ${checkpoint.currentBuild || 'unknown'}`);
    }
    
  } catch (error) {
    Logger.log(`Error showing stats: ${error.toString()}`);
  }
}

// Quick test function
function testBoxerProcessing() {
  Logger.log("=== 🐕 Testing Boxer's Fetching Skills ===");
  
  var accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  // Test the consolidated search
  var startTime = Date.now();
  var allFiles = OptimizedProcessing.findFilesUsingConsolidatedSearch(accessToken, startTime);
  Logger.log(`🎾 Consolidated search found ${allFiles.length} image files`);
  
  if (allFiles.length > 0) {
    // Test filtering
    var needsProcessing = OptimizedProcessing.filterFilesNeedingProcessing(allFiles.slice(0, 20), accessToken, startTime);
    Logger.log(`🎯 Of first 20 files, ${needsProcessing.length} need processing`);
    
    if (needsProcessing.length > 0) {
      Logger.log("📋 Sample files that would be processed:");
      needsProcessing.slice(0, 3).forEach(function(file, index) {
        Logger.log(`   ${index + 1}. ${file.name} (${file.id})`);
      });
    }
  } else {
    Logger.log("✅ No image files found - check your Box folders!");
  }
}