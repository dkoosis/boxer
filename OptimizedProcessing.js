// File: OptimizedProcessing.gs
// Optimized processing using Box CSV reports as the systematic file source
// Depends on: Config.gs, BoxAuth.gs, BoxFileOperations.gs, BoxReportManager.gs

/**
 * OptimizedProcessing namespace - systematic processing using Box reports
 */
var OptimizedProcessing = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration
  var MAX_EXECUTION_TIME_MS = 5 * 60 * 1000; // 5 minutes
  var BATCH_SIZE = 8; // This can be adjusted in Config.js if needed
  // dk FIXME
  Logger.log("FIXME no idea why GAS is choking here.")
  //var STATS_PROPERTY = 'BOXER_PROCESSING_STATS'; // restore when issue resolved
  
  /**
   * Main processing function - refactored to strictly prioritize the test folder.
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
      executionTimeMs: 0,
      method: 'report-based'
    };
    
    try {
      // Step 1: Get all candidate files from the report
      var allCandidateFiles = ns.getFilesFromReport(accessToken, startTime);
      stats.filesFound = allCandidateFiles.length;
      
      // Step 2: Explicitly partition files into a priority queue and a general queue
      var priorityQueue = [];
      var generalQueue = [];
      
      allCandidateFiles.forEach(function(file) {
        if (file.parentId === Config.ACTIVE_TEST_FOLDER_ID) {
          priorityQueue.push(file);
        } else {
          generalQueue.push(file);
        }
      });
      
      Logger.log(`📁 Found ${priorityQueue.length} files in the priority test folder.`);
      Logger.log(`📂 Found ${generalQueue.length} files in the general queue.`);
      
      // Step 3: Filter and sort each queue independently
      var priorityFilesToProcess = ns.filterAndSortFiles(priorityQueue, accessToken, startTime);
      var generalFilesToProcess = ns.filterAndSortFiles(generalQueue, accessToken, startTime);
      
      // Step 4: Combine the lists, ensuring priority files are always first
      var filesToProcess = priorityFilesToProcess.concat(generalFilesToProcess);
      
      Logger.log(`🔄 ${filesToProcess.length} total files need processing.`);
      
      if (filesToProcess.length === 0) {
        Logger.log("✅ All candidate files are up to date.");
        return stats;
      }
      
      // Step 5: Process files from the final, prioritized queue
      var maxFilesToProcessInRun = Math.min(filesToProcess.length, 100);
      
      for (var i = 0; i < maxFilesToProcessInRun; i += BATCH_SIZE) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Time limit reached during processing.");
          break;
        }
        
        var batch = filesToProcess.slice(i, i + BATCH_SIZE);
        Logger.log(`📦 Processing batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(maxFilesToProcessInRun/BATCH_SIZE)}...`);
        var batchResults = ns.processBatch(batch, accessToken);
        
        stats.processed += batchResults.processed;
        stats.skipped += batchResults.skipped;
        stats.errors += batchResults.errors;
        
        Utilities.sleep(500);
      }
      
    } catch (error) {
      ErrorHandler.reportError(error, 'OptimizedProcessing.processBoxImagesOptimized');
      stats.errors++;
    } finally {
      stats.executionTimeMs = Date.now() - startTime;
      ns.saveStats(stats);
      Logger.log(`📊 Run Complete: Processed ${stats.processed}, Skipped ${stats.skipped}, Errors ${stats.errors}. Time: ${(stats.executionTimeMs / 1000).toFixed(1)}s`);
    }
    
    return stats;
  };
  
  /**
   * Helper function to filter a list of files that need processing and sort them by date.
   * @param {Array} files - The array of file objects to filter.
   * @param {string} accessToken - The Box access token.
   * @param {number} startTime - The script start time for timeout checks.
   * @returns {Array} A sorted array of file objects that need processing.
   */
  ns.filterAndSortFiles = function(files, accessToken, startTime) {
      var needsProcessing = [];
      
      for (var i = 0; i < files.length; i++) {
          if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
              Logger.log("⏰ Time limit reached during filtering stage.");
              break;
          }
          
          var file = files[i];
          var shouldProcess = false;

          // If the report says a file has no metadata, it's a primary candidate.
          if (file.reportFile && !file.hasMetadata) {
              shouldProcess = true;
          } else {
              // Otherwise, check the metadata directly for build version or processing stage.
              var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
              if (!metadata || Config.shouldReprocessForBuild(metadata.buildNumber) || 
                  metadata.processingStage === Config.PROCESSING_STAGE_UNPROCESSED || 
                  metadata.processingStage === Config.PROCESSING_STAGE_FAILED) {
                  shouldProcess = true;
              }
          }

          if (shouldProcess) {
              needsProcessing.push({
                  file: file,
                  modified_at: file.modified_at || file.created_at || new Date(0).toISOString()
              });
          }
      }

      // Sort the filtered list by modification date (most recent first)
      needsProcessing.sort(function(a, b) {
          return new Date(b.modified_at) - new Date(a.modified_at);
      });

      return needsProcessing.map(function(item) { return item.file; });
  };
  
  /**
   * Get files from the Box report systematically
   */
  ns.getFilesFromReport = function(accessToken, startTime) {
    Logger.log('📊 Getting files from cached Box report...');
    
    try {
      // Get files from BoxReportManager
      var reportData = BoxReportManager.getCachedReportData();
      
      if (!reportData || !reportData.files) {
        Logger.log('⚠️ No cached report data - trying to initialize...');
        
        // Try to run report-based processing to initialize
        var reportResult = BoxReportManager.runReportBasedProcessing();
        if (reportResult && reportResult.reportFound) {
          reportData = BoxReportManager.getCachedReportData();
        }
        
        if (!reportData || !reportData.files) {
          Logger.log('❌ Could not get report data - falling back to search');
          return ns.findFilesWithSearch(accessToken);
        }
      }
      
      // Get unprocessed files from the report
      var checkpoint = BoxReportManager.getProcessingCheckpoint();
      var processedIds = new Set(checkpoint.processedFileIds || []);
      
      var unprocessedFiles = reportData.files.filter(function(file) {
        return !processedIds.has(file.id);
      });
      
      Logger.log(`📋 Report has ${reportData.files.length} total files, ${processedIds.size} processed, ${unprocessedFiles.length} remaining`);
      
      // Convert to format expected by processing logic
      return unprocessedFiles.map(function(file) {
        return {
          id: file.id,
          name: file.name,
          type: 'file',
          path: file.path,
          hasMetadata: file.hasMetadata,
          reportFile: true
        };
      });
      
    } catch (error) {
      Logger.log(`❌ Error getting files from report: ${error.toString()}`);
      return ns.findFilesWithSearch(accessToken);
    }
  };
  
  /**
   * Fallback search method if report is not available
   */
  ns.findFilesWithSearch = function(accessToken) {
    Logger.log('🔍 Using search fallback to find files...');
    
    try {
      var searchUrl = Config.BOX_API_BASE_URL + '/search' +
                     '?query=jpg OR jpeg OR png OR heic OR gif OR bmp OR tiff OR webp' +
                     '&type=file' +
                     '&limit=100' +
                     '&fields=id,name,size,created_at,modified_at';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        return (data.entries || []).filter(function(file) {
          return file.type === 'file' && BoxFileOperations.isImageFile(file.name);
        });
      }
      
    } catch (error) {
      Logger.log(`❌ Error in search fallback: ${error.toString()}`);
    }
    
    return [];
  };
  
  /**
   * Filter files to those actually needing processing, with prioritization for the test folder.
   */
  ns.filterFilesNeedingProcessing = function(files, accessToken, startTime) {
    var needsProcessing = [];
    var currentBuild = Config.getCurrentBuild();
    
    for (var i = 0; i < files.length; i++) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS * 0.6) {
        Logger.log("⏰ Time limit during filtering");
        break;
      }
      
      var file = files[i];
      var shouldProcess = false;
      var priority = 999;
      var reason = 'up_to_date';
      
      // For report-based files, we can use the hasMetadata flag as a first filter
      if (file.reportFile && !file.hasMetadata) {
        shouldProcess = true;
        reason = 'unprocessed';
      } else {
        // For other files, or if report shows metadata, check directly
        var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
        
        if (!metadata) {
          shouldProcess = true;
          reason = 'unprocessed';
        } else {
          var stage = metadata.processingStage;
          var fileBuild = metadata.buildNumber;
          
          if (Config.shouldReprocessForBuild(fileBuild)) {
            shouldProcess = true;
            reason = 'build_update';
          } else if (!stage || 
                     stage === Config.PROCESSING_STAGE_UNPROCESSED ||
                     stage === Config.PROCESSING_STAGE_FAILED) {
            shouldProcess = true;
            reason = 'incomplete';
          }
        }
      }
      
      if (shouldProcess) {
        var isInTestFolder = file.parentId === Config.ACTIVE_TEST_FOLDER_ID;

        // New Priority Scheme:
        // 0: Unprocessed in Test Folder (Highest Priority)
        // 1: Other Unprocessed Files
        // 2: Outdated/Incomplete in Test Folder
        // 3: Other Outdated/Incomplete Files
        switch (reason) {
            case 'unprocessed':
                priority = isInTestFolder ? 0 : 1;
                break;
            case 'build_update':
            case 'incomplete':
                priority = isInTestFolder ? 2 : 3;
                break;
        }
        
        needsProcessing.push({ 
            file: file, 
            priority: priority, 
            modified_at: file.modified_at || file.created_at || new Date(0).toISOString() 
        });
      }
      
      if (i > 0 && i % 25 === 0) {
        Utilities.sleep(50);
      }
    }
    
    // Sort by new priority first, then by modification date (most recent first)
    needsProcessing.sort(function(a, b) {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return new Date(b.modified_at) - new Date(a.modified_at);
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
        
        Utilities.sleep(300);
        
      } catch (error) {
        Logger.log(`❌ Error processing ${file.name}: ${error.toString()}`);
        results.errors++;
      }
    });
    
    return results;
  };
  
  /**
   * Process a single file
   */
  ns.processFileIfNeeded = function(file, accessToken) {
    if (!file || !file.id || !file.name) {
      return 'error';
    }
    
    try {
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
      
      // Build path string for logging
      var pathString = '';
      if (fileDetails.path_collection && fileDetails.path_collection.entries && fileDetails.path_collection.entries.length > 1) {
        pathString = fileDetails.path_collection.entries.slice(1).map(function(p) { return p.name; }).join('/');
      } else if (fileDetails.parent && fileDetails.parent.name && fileDetails.parent.id !== '0') {
        pathString = fileDetails.parent.name;
      }
      var pathDisplay = pathString ? ` (${pathString})` : '';
      
      Logger.log(`🔄 Processing: ${file.name}${pathDisplay}`);
      
      var metadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      var success = BoxFileOperations.applyMetadata(file.id, metadata, accessToken);
      
      if (success) {
        Logger.log(`✅ Successfully processed: ${file.name}${pathDisplay}`);
        return 'processed';
      } else {
        Logger.log(`❌ Failed to apply metadata for: ${file.name}${pathDisplay}`);
        return 'error';
      }
      
    } catch (error) {
      Logger.log(`❌ Exception processing ${file.name}: ${error.toString()}`);
      return 'error';
    }
  };
  
  /**
   * Update progress in BoxReportManager
   */
  ns.updateReportProgress = function(processedFiles) {
    try {
      if (processedFiles && processedFiles.length > 0) {
        var checkpoint = BoxReportManager.getProcessingCheckpoint();
        if (!checkpoint.processedFileIds) {
          checkpoint.processedFileIds = [];
        }
        
        processedFiles.forEach(function(file) {
          if (checkpoint.processedFileIds.indexOf(file.id) === -1) {
            checkpoint.processedFileIds.push(file.id);
          }
        });
        
        BoxReportManager.updateProcessingCheckpoint(checkpoint);
        Logger.log(`📍 Updated progress: ${checkpoint.processedFileIds.length} files processed`);
      }
    } catch (error) {
      Logger.log(`⚠️ Error updating report progress: ${error.toString()}`);
    }
  };
  
  /**
   * Save processing statistics
   */
  ns.saveStats = function(stats) {
    try {
      var allStatsStr = Config.SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
      var allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
      
      stats.timestamp = new Date().toISOString();
      allStats.push(stats);
      
      if (allStats.length > 10) {
        allStats = allStats.slice(-10);
      }
      
      Config.SCRIPT_PROPERTIES.setProperty(STATS_PROPERTY, JSON.stringify(allStats));
    } catch (error) {
      Logger.log(`❌ Error saving stats: ${error.toString()}`);
    }
  };
  
  return ns;
})();

// Main function for triggers - now integrated with BoxReportManager
function processBoxImagesOptimized() {
  // Try report-based processing first
  var reportResult = BoxReportManager.runReportBasedProcessing();
  
  if (reportResult && reportResult.filesInReport > 0) {
    Logger.log('✅ Used BoxReportManager for systematic processing');
    return reportResult;
  } else {
    Logger.log('⚠️ BoxReportManager unavailable, falling back to OptimizedProcessing');
    return OptimizedProcessing.processBoxImagesOptimized();
  }
}

// Show processing stats from both systems
function showOptimizedProcessingStats() {
  Logger.log("📊 === Integrated Processing Stats ===");
  
  // Show BoxReportManager stats
  try {
    BoxReportManager.showProcessingStats();
  } catch (error) {
    Logger.log("⚠️ BoxReportManager stats unavailable: " + error.toString());
  }
  
  Logger.log("\n📊 === Legacy OptimizedProcessing Stats ===");
  
  try {
    var statsStr = Config.SCRIPT_PROPERTIES.getProperty('BOXER_PROCESSING_STATS');
    if (!statsStr) {
      Logger.log("📋 No legacy stats available");
      return;
    }
    
    var allStats = JSON.parse(statsStr);
    
    allStats.forEach(function(run, index) {
      var date = new Date(run.timestamp).toLocaleString();
      Logger.log(`${index + 1}. ${date} [${run.method || 'legacy'}]`);
      Logger.log(`   Found: ${run.filesFound}, Processed: ${run.processed}, Errors: ${run.errors}`);
      Logger.log(`   Time: ${(run.executionTimeMs / 1000).toFixed(1)}s`);
      
      if (run.comprehensiveCounts) {
        var source = run.comprehensiveCounts.reportBased ? 'report' : 'search';
        Logger.log(`   Total: ${run.comprehensiveCounts.totalImageFiles} [${source}], Without metadata: ${run.comprehensiveCounts.filesWithoutMetadata}`);
      }
    });
    
  } catch (error) {
    Logger.log(`❌ Error showing legacy stats: ${error.toString()}`);
  }
}

// Get comprehensive counts using integrated approach
function showComprehensiveBoxCounts() {
  Logger.log("📊 === Integrated Box Image Analysis ===");
  
  var accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  var counts = OptimizedProcessing.getComprehensiveImageCount(accessToken, false);
  var source = counts.reportBased ? '📊 Box Report' : '🔍 Search API';
  
  Logger.log(`\n${source} Analysis:`);
  Logger.log(`📁 Total image files: ${counts.totalImageFiles}`);
  Logger.log(`❌ Without metadata: ${counts.filesWithoutMetadata}`);
  Logger.log(`✅ With metadata: ${counts.filesWithMetadata}`);
  
  if (Object.keys(counts.processingStages).length > 0) {
    Logger.log("\n📈 Processing stages:");
    Object.entries(counts.processingStages)
      .sort(([,a], [,b]) => b - a)
      .forEach(([stage, count]) => {
        var percentage = (count / counts.totalImageFiles * 100).toFixed(1);
        Logger.log(`   ${stage}: ${count} files (${percentage}%)`);
      });
  }
  
  if (counts.error) {
    Logger.log(`\n❌ Error: ${counts.error}`);
  }
  
  Logger.log(`\n⏱️ Analysis took: ${(counts.executionTime / 1000).toFixed(1)}s`);
  
  if (counts.filesWithoutMetadata > 0) {
    var estimatedRuns = Math.ceil(counts.filesWithoutMetadata / 30);
    Logger.log(`🔄 Estimated ${estimatedRuns} more runs needed`);
  } else {
    Logger.log("🎉 All files have metadata!");
  }
  
  // Show BoxReportManager status
  Logger.log("\n📍 Report Manager Status:");
  try {
    var checkpoint = BoxReportManager.getProcessingCheckpoint();
    if (checkpoint && checkpoint.boxReportName) {
      Logger.log(`📊 Active Report: ${checkpoint.boxReportName}`);
      Logger.log(`✅ Files Processed: ${checkpoint.processedFileIds ? checkpoint.processedFileIds.length : 0}`);
    } else {
      Logger.log("📋 No active report checkpoint");
    }
  } catch (error) {
    Logger.log("⚠️ Could not read report status: " + error.toString());
  }
}