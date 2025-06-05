// File: OptimizedProcessing.gs
// Optimized processing with systematic search strategies

/**
 * OptimizedProcessing namespace - systematic and efficient file processing
 */
var OptimizedProcessing = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration
  var MAX_EXECUTION_TIME_MS = 5 * 60 * 1000; // 5 minutes
  var BATCH_SIZE = 8;
  var SEARCH_LIMIT = 200;
  var CHECKPOINT_PROPERTY = 'BOXER_PROCESSING_CHECKPOINT';
  var STATS_PROPERTY = 'BOXER_PROCESSING_STATS';
  var COMPREHENSIVE_CACHE_PROPERTY = 'BOXER_COMPREHENSIVE_CACHE';
  var CACHE_DURATION_HOURS = 6;
  
  /**
   * Get comprehensive count of all image files using search API
   */
  ns.getComprehensiveImageCount = function(accessToken, useCache) {
    useCache = useCache !== false;
    
    // Check cache first
    if (useCache) {
      try {
        var cacheStr = Config.SCRIPT_PROPERTIES.getProperty(COMPREHENSIVE_CACHE_PROPERTY);
        if (cacheStr) {
          var cache = JSON.parse(cacheStr);
          var cacheAge = Date.now() - new Date(cache.timestamp).getTime();
          var maxAge = CACHE_DURATION_HOURS * 60 * 60 * 1000;
          
          if (cacheAge < maxAge) {
            Logger.log(`Using cached counts (${(cacheAge / (1000 * 60 * 60)).toFixed(1)}h old)`);
            return cache.data;
          }
        }
      } catch (error) {
        Logger.log('Error reading cache: ' + error.toString());
      }
    }
    
    Logger.log('Getting comprehensive count using Search API...');
    var startTime = Date.now();
    
    var counts = {
      totalImageFiles: 0,
      filesWithoutMetadata: 0,
      filesWithMetadata: 0,
      processingStages: {},
      executionTime: 0
    };
    
    try {
      // Use Search API to get total count
      var searchUrl = Config.BOX_API_BASE_URL + '/search' +
                     '?query=jpg OR jpeg OR png OR heic OR gif OR bmp OR tiff OR webp' +
                     '&type=file' +
                     '&limit=1' +
                     '&fields=id';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        counts.totalImageFiles = data.total_count || 0;
        
        Logger.log(`Found ${counts.totalImageFiles} total image files`);
        
        // Sample files to check metadata status
        if (counts.totalImageFiles > 0) {
          var sampleSize = Math.min(500, counts.totalImageFiles);
          var sampleResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/search' +
            '?query=jpg OR jpeg OR png OR heic OR gif OR bmp OR tiff OR webp' +
            '&type=file' +
            '&limit=' + sampleSize +
            '&fields=id,name', {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
          });
          
          if (sampleResponse.getResponseCode() === 200) {
            var sampleData = JSON.parse(sampleResponse.getContentText());
            
            (sampleData.entries || []).forEach(function(file) {
              if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
                var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
                
                if (metadata) {
                  counts.filesWithMetadata++;
                  var stage = metadata.processingStage || 'unknown';
                  counts.processingStages[stage] = (counts.processingStages[stage] || 0) + 1;
                } else {
                  counts.filesWithoutMetadata++;
                }
              }
            });
            
            // Extrapolate from sample
            if (sampleSize < counts.totalImageFiles) {
              var ratio = counts.totalImageFiles / sampleSize;
              counts.filesWithMetadata = Math.round(counts.filesWithMetadata * ratio);
              counts.filesWithoutMetadata = counts.totalImageFiles - counts.filesWithMetadata;
              
              Object.keys(counts.processingStages).forEach(function(stage) {
                counts.processingStages[stage] = Math.round(counts.processingStages[stage] * ratio);
              });
            }
          }
        }
        
      } else {
        Logger.log(`Search API failed: ${response.getResponseCode()}`);
        counts.error = 'Search API failed: ' + response.getResponseCode();
      }
      
      counts.executionTime = Date.now() - startTime;
      
      // Cache results
      try {
        var cacheData = {
          timestamp: new Date().toISOString(),
          data: counts
        };
        Config.SCRIPT_PROPERTIES.setProperty(COMPREHENSIVE_CACHE_PROPERTY, JSON.stringify(cacheData));
      } catch (error) {
        Logger.log('Error caching results: ' + error.toString());
      }
      
      return counts;
      
    } catch (error) {
      Logger.log(`Error getting comprehensive count: ${error.toString()}`);
      counts.executionTime = Date.now() - startTime;
      counts.error = error.toString();
      return counts; // Return without caching
    }
  };
  
  /**
   * Main processing function
   */
  ns.processBoxImagesOptimized = function() {
    var startTime = Date.now();
    Logger.log(`Boxer starting processing at ${new Date().toISOString()}`);
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log("No access token available");
      return;
    }
    
    // Get overview
    var comprehensiveCounts = ns.getComprehensiveImageCount(accessToken, true);
    Logger.log(`Total files: ${comprehensiveCounts.totalImageFiles}, Without metadata: ${comprehensiveCounts.filesWithoutMetadata}`);
    
    var stats = {
      filesFound: 0,
      processed: 0,
      skipped: 0,
      errors: 0,
      executionTimeMs: 0,
      comprehensiveCounts: comprehensiveCounts
    };
    
    try {
      // Find files using systematic approach
      var candidateFiles = ns.findFilesSystematically(accessToken, startTime);
      stats.filesFound = candidateFiles.length;
      
      Logger.log(`Found ${candidateFiles.length} candidate files`);
      
      if (candidateFiles.length === 0) {
        Logger.log("No candidates found");
        return;
      }
      
      // Filter to files needing processing
      var filesToProcess = ns.filterFilesNeedingProcessing(candidateFiles, accessToken, startTime);
      Logger.log(`${filesToProcess.length} files need processing`);
      
      if (filesToProcess.length === 0) {
        Logger.log("All candidates up to date");
        return;
      }
      
      // Process files in batches
      var maxFiles = Math.min(filesToProcess.length, 30);
      
      for (var i = 0; i < maxFiles; i += BATCH_SIZE) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("Time limit reached");
          break;
        }
        
        var batch = filesToProcess.slice(i, i + BATCH_SIZE);
        var batchResults = ns.processBatch(batch, accessToken);
        
        stats.processed += batchResults.processed;
        stats.skipped += batchResults.skipped;
        stats.errors += batchResults.errors;
        
        Logger.log(`Batch ${Math.floor(i/BATCH_SIZE) + 1}: Processed ${batchResults.processed}, Errors ${batchResults.errors}`);
        
        Utilities.sleep(500);
      }
      
      // Save checkpoint
      ns.saveCheckpoint({
        lastRunTime: new Date().toISOString(),
        filesProcessedThisRun: stats.processed,
        currentBuild: Config.getCurrentBuild(),
        totalImageFiles: comprehensiveCounts.totalImageFiles,
        filesWithoutMetadata: comprehensiveCounts.filesWithoutMetadata
      });
      
    } catch (error) {
      Logger.log(`Critical error: ${error.toString()}`);
      stats.errors++;
    } finally {
      stats.executionTimeMs = Date.now() - startTime;
      ns.saveStats(stats);
      
      Logger.log(`Processed: ${stats.processed}, Errors: ${stats.errors}, Time: ${(stats.executionTimeMs / 1000).toFixed(1)}s`);
      
      if (comprehensiveCounts.filesWithoutMetadata > 0) {
        var remaining = Math.max(0, comprehensiveCounts.filesWithoutMetadata - stats.processed);
        var percentComplete = ((comprehensiveCounts.totalImageFiles - remaining) / comprehensiveCounts.totalImageFiles * 100).toFixed(1);
        Logger.log(`Progress: ${percentComplete}% complete (${remaining} remaining)`);
      }
    }
  };
  
  /**
   * Systematic file finding using rotating search strategies
   */
  ns.findFilesSystematically = function(accessToken, startTime) {
    var checkpoint = ns.getCheckpoint();
    var lastMethod = checkpoint.lastSearchMethod || 'unprocessed';
    
    Logger.log(`Last search method: ${lastMethod}`);
    
    var files = [];
    var method = '';
    
    // Rotate through search strategies
    if (lastMethod === 'unprocessed') {
      method = 'mdfilter_unprocessed';
      files = ns.findFilesWithMetadataFilter(accessToken, 'processingStage', 'unprocessed');
    } else if (lastMethod === 'mdfilter_unprocessed') {
      method = 'mdfilter_old_builds';
      files = ns.findFilesWithOldBuildsMetadataFilter(accessToken);
    } else if (lastMethod === 'mdfilter_old_builds') {
      method = 'mdfilter_enhanceable';
      files = ns.findFilesWithMetadataFilter(accessToken, 'processingStage', Config.PROCESSING_STAGE_BASIC || 'basic_extracted');
    } else if (lastMethod === 'mdfilter_enhanceable') {
      method = 'search_recent';
      files = ns.findRecentFilesWithDateRange(accessToken);
    } else if (lastMethod === 'search_recent') {
      method = 'search_no_metadata';
      files = ns.findFilesWithoutMetadata(accessToken);
    } else if (lastMethod === 'search_no_metadata') {
      method = 'recent_items';
      files = ns.findRecentItems(accessToken);
    } else {
      method = 'folder_listing';
      files = ns.findRecentFiles(accessToken);
    }
    
    // Update checkpoint
    checkpoint.lastSearchMethod = method;
    ns.saveCheckpoint(checkpoint);
    
    Logger.log(`Strategy "${method}" found ${files.length} files`);
    return files;
  };
  
  /**
   * Search using metadata filters
   */
  ns.findFilesWithMetadataFilter = function(accessToken, metadataField, metadataValue) {
    var files = [];
    
    try {
      var mdfilters = [{
        "scope": Config.BOX_METADATA_SCOPE,
        "templateKey": Config.BOX_METADATA_TEMPLATE_KEY,
        "filters": {}
      }];
      
      mdfilters[0].filters[metadataField] = metadataValue;
      
      var searchParams = [
        'query=jpg OR jpeg OR png OR heic OR gif OR bmp OR tiff OR webp',
        'type=file',
        'limit=200',
        'mdfilters=' + encodeURIComponent(JSON.stringify(mdfilters)),
        'fields=id,name,size,created_at,modified_at'
      ];
      
      var searchUrl = Config.BOX_API_BASE_URL + '/search?' + searchParams.join('&');
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        (data.entries || []).forEach(function(file) {
          if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
            files.push(file);
          }
        });
        
      } else {
        Logger.log(`Metadata filter search failed: ${response.getResponseCode()}`);
      }
      
    } catch (error) {
      Logger.log(`Error in metadata filter search: ${error.toString()}`);
    }
    
    return files;
  };
  
  /**
   * Find files with old build numbers
   */
  ns.findFilesWithOldBuildsMetadataFilter = function(accessToken) {
    var files = [];
    var currentBuild = Config.getCurrentBuild();
    
    try {
      var mdfilters = [{
        "scope": Config.BOX_METADATA_SCOPE,
        "templateKey": Config.BOX_METADATA_TEMPLATE_KEY,
        "filters": {}
      }];
      
      var searchParams = [
        'query=jpg OR jpeg OR png OR heic OR gif OR bmp OR tiff OR webp',
        'type=file',
        'limit=200',
        'mdfilters=' + encodeURIComponent(JSON.stringify(mdfilters)),
        'fields=id,name,size,created_at,modified_at'
      ];
      
      var searchUrl = Config.BOX_API_BASE_URL + '/search?' + searchParams.join('&');
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        // Filter client-side for old build numbers
        for (var i = 0; i < (data.entries || []).length && files.length < 50; i++) {
          var file = data.entries[i];
          
          if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
            var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
            if (metadata && Config.shouldReprocessForBuild(metadata.buildNumber)) {
              files.push(file);
            }
          }
        }
        
      } else {
        Logger.log(`Old builds search failed: ${response.getResponseCode()}`);
      }
      
    } catch (error) {
      Logger.log(`Error finding old builds: ${error.toString()}`);
    }
    
    return files;
  };
  
  /**
   * Find recent files using date range
   */
  ns.findRecentFilesWithDateRange = function(accessToken) {
    var files = [];
    
    try {
      var thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      var dateRange = thirtyDaysAgo.toISOString();
      
      var searchParams = [
        'query=jpg OR jpeg OR png OR heic OR gif OR bmp OR tiff OR webp',
        'type=file',
        'limit=100',
        'created_at_range=' + encodeURIComponent(dateRange + ','),
        'sort=modified_at',
        'fields=id,name,size,created_at,modified_at'
      ];
      
      var searchUrl = Config.BOX_API_BASE_URL + '/search?' + searchParams.join('&');
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        (data.entries || []).forEach(function(file) {
          if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
            files.push(file);
          }
        });
        
      } else {
        Logger.log(`Recent files search failed: ${response.getResponseCode()}`);
      }
      
    } catch (error) {
      Logger.log(`Error finding recent files: ${error.toString()}`);
    }
    
    return files;
  };
  
  /**
   * Find recent items using Box API
   */
  ns.findRecentItems = function(accessToken) {
    var recentFiles = [];
    
    try {
      var recentUrl = Config.BOX_API_BASE_URL + '/recent_items' +
                     '?limit=50' +
                     '&fields=id,name,size,created_at,modified_at,type';
      
      var response = UrlFetchApp.fetch(recentUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        (data.entries || []).forEach(function(item) {
          var file = item.item || item;
          
          if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
            recentFiles.push(file);
          }
        });
      }
      
    } catch (error) {
      Logger.log(`Error finding recent items: ${error.toString()}`);
    }
    
    return recentFiles;
  };
  
  /**
   * Find files without metadata
   */
  ns.findFilesWithoutMetadata = function(accessToken) {
    var filesWithoutMetadata = [];
    var searchedCount = 0;
    var maxToCheck = 300;
    
    try {
      var searchUrl = Config.BOX_API_BASE_URL + '/search' +
                     '?query=jpg OR jpeg OR png OR heic' +
                     '&type=file' +
                     '&limit=150' +
                     '&fields=id,name,size,created_at';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        (data.entries || []).forEach(function(file) {
          if (searchedCount >= maxToCheck) return;
          
          if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
            searchedCount++;
            
            var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
            if (!metadata) {
              filesWithoutMetadata.push(file);
            }
          }
        });
      }
      
    } catch (error) {
      Logger.log(`Error finding files without metadata: ${error.toString()}`);
    }
    
    return filesWithoutMetadata;
  };
  
  /**
   * Fallback: simple search for any image files
   */
  ns.findRecentFiles = function(accessToken) {
    var files = [];
    
    try {
      var searchUrl = Config.BOX_API_BASE_URL + '/search' +
                     '?query=jpg OR jpeg OR png' +
                     '&type=file' +
                     '&limit=100' +
                     '&fields=id,name,size,created_at,modified_at';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        (data.entries || []).forEach(function(file) {
          if (file.type === 'file' && BoxFileOperations.isImageFile(file.name)) {
            files.push(file);
          }
        });
      }
      
    } catch (error) {
      Logger.log(`Error in fallback search: ${error.toString()}`);
    }
    
    return files;
  };
  
  /**
   * Filter files to those needing processing
   */
  ns.filterFilesNeedingProcessing = function(files, accessToken, startTime) {
    var needsProcessing = [];
    var currentBuild = Config.getCurrentBuild();
    
    for (var i = 0; i < files.length; i++) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS * 0.6) {
        Logger.log("Time limit during filtering");
        break;
      }
      
      var file = files[i];
      var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
      
      var shouldProcess = false;
      var priority = 999;
      
      if (!metadata) {
        shouldProcess = true;
        priority = 0;
      } else {
        var stage = metadata.processingStage;
        var fileBuild = metadata.buildNumber;
        
        if (Config.shouldReprocessForBuild(fileBuild)) {
          shouldProcess = true;
          priority = 1;
        } else if (!stage || 
                   stage === Config.PROCESSING_STAGE_UNPROCESSED ||
                   stage === Config.PROCESSING_STAGE_FAILED) {
          shouldProcess = true;
          priority = 2;
        } else if (stage === Config.PROCESSING_STAGE_BASIC) {
          shouldProcess = true;
          priority = 3;
        }
      }
      
      if (shouldProcess) {
        needsProcessing.push({ file: file, priority: priority });
      }
      
      if (i > 0 && i % 25 === 0) {
        Utilities.sleep(50);
      }
    }
    
    // Sort by priority
    needsProcessing.sort(function(a, b) {
      return a.priority - b.priority;
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
        Logger.log(`Error processing ${file.name}: ${error.toString()}`);
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
        Logger.log(`Failed to get file details for ${file.name}`);
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
      
      Logger.log(`ℹ️ Processing: ${file.name}${pathDisplay}`);
      
      var metadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      var success = BoxFileOperations.applyMetadata(file.id, metadata, accessToken);
      
      if (success) {
        Logger.log(`✅ Successfully processed: ${file.name}${pathDisplay}`);
        return 'processed';
      } else {
        Logger.log(`Failed to apply metadata for: ${file.name}${pathDisplay}`);
        return 'error';
      }
      
    } catch (error) {
      Logger.log(`Exception processing ${file.name}: ${error.toString()}`);
      return 'error';
    }
  };
  
  ns.saveCheckpoint = function(checkpoint) {
    try {
      Config.SCRIPT_PROPERTIES.setProperty(CHECKPOINT_PROPERTY, JSON.stringify(checkpoint));
    } catch (error) {
      Logger.log(`Error saving checkpoint: ${error.toString()}`);
    }
  };
  
  ns.getCheckpoint = function() {
    try {
      var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(CHECKPOINT_PROPERTY);
      return checkpointStr ? JSON.parse(checkpointStr) : {};
    } catch (error) {
      Logger.log(`Error getting checkpoint: ${error.toString()}`);
      return {};
    }
  };
  
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
      Logger.log(`Error saving stats: ${error.toString()}`);
    }
  };
  
  return ns;
})();

// Main function for triggers
function processBoxImagesOptimized() {
  OptimizedProcessing.processBoxImagesOptimized();
}

// Show processing stats
function showOptimizedProcessingStats() {
  Logger.log("Recent Processing Stats");
  
  try {
    var statsStr = Config.SCRIPT_PROPERTIES.getProperty('BOXER_PROCESSING_STATS');
    if (!statsStr) {
      Logger.log("No stats available yet");
      return;
    }
    
    var allStats = JSON.parse(statsStr);
    
    allStats.forEach(function(run, index) {
      var date = new Date(run.timestamp).toLocaleString();
      Logger.log(`${index + 1}. ${date}`);
      Logger.log(`   Found: ${run.filesFound}, Processed: ${run.processed}, Errors: ${run.errors}`);
      Logger.log(`   Time: ${(run.executionTimeMs / 1000).toFixed(1)}s`);
      
      if (run.comprehensiveCounts) {
        Logger.log(`   Total: ${run.comprehensiveCounts.totalImageFiles}, Without metadata: ${run.comprehensiveCounts.filesWithoutMetadata}`);
      }
    });
    
    var checkpoint = OptimizedProcessing.getCheckpoint();
    if (checkpoint.lastRunTime) {
      var timeSince = ((Date.now() - new Date(checkpoint.lastRunTime).getTime()) / (1000 * 60 * 60)).toFixed(1);
      Logger.log(`\nLast run: ${timeSince} hours ago`);
      Logger.log(`Last search method: ${checkpoint.lastSearchMethod || 'unknown'}`);
    }
    
  } catch (error) {
    Logger.log(`Error showing stats: ${error.toString()}`);
  }
}

// Get comprehensive counts without processing  
function showComprehensiveBoxCounts() {
  Logger.log("Box Image Analysis");
  
  var accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("No access token available");
    return;
  }
  
  var counts = OptimizedProcessing.getComprehensiveImageCount(accessToken, false);
  
  Logger.log(`Total image files: ${counts.totalImageFiles}`);
  Logger.log(`Without metadata: ${counts.filesWithoutMetadata}`);
  Logger.log(`With metadata: ${counts.filesWithMetadata}`);
  
  if (Object.keys(counts.processingStages).length > 0) {
    Logger.log("\nProcessing stages:");
    Object.entries(counts.processingStages)
      .sort(([,a], [,b]) => b - a)
      .forEach(([stage, count]) => {
        var percentage = (count / counts.totalImageFiles * 100).toFixed(1);
        Logger.log(`   ${stage}: ${count} files (${percentage}%)`);
      });
  }
  
  if (counts.error) {
    Logger.log(`\nError: ${counts.error}`);
  }
  
  Logger.log(`\nAnalysis took: ${(counts.executionTime / 1000).toFixed(1)}s`);
  
  if (counts.filesWithoutMetadata > 0) {
    var estimatedRuns = Math.ceil(counts.filesWithoutMetadata / 30);
    Logger.log(`Estimated ${estimatedRuns} more runs needed`);
  } else {
    Logger.log("All files have metadata!");
  }
}