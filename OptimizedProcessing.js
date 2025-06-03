// File: OptimizedProcessing.gs
// Simplified processing strategies with search optimization for Box Image Metadata Processing System

/**
 * Optimized processing namespace with two core strategies
 */
var OptimizedProcessing = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration for optimization
  var PROCESSING_BATCH_SIZE = 10;
  var MAX_EXECUTION_TIME_MS = 4 * 60 * 1000; // 4 minutes (safe margin)
  var CHECKPOINT_PROPERTY = 'LAST_PROCESSING_CHECKPOINT';
  var STATS_PROPERTY = 'PROCESSING_STATS';
  
  /**
   * Primary Strategy: Search-Based Incremental Processing with Checkpoints
   * Uses Box search instead of recursive folder listing for performance
   */
  ns.processIncrementallyWithCheckpoints = function() {
    Logger.log("=== Primary Strategy: Incremental Processing with Search Optimization ===\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken();
    var checkpoint = ns.getProcessingCheckpoint();
    var processed = 0;
    var skipped = 0;
    var errors = 0;
    
    Logger.log("Starting from checkpoint: " + JSON.stringify(checkpoint));
    
    try {
      var foldersToProcess = ns.getFoldersToProcess();
      var currentFolderIndex = checkpoint.folderIndex || 0;
      var currentFileIndex = checkpoint.fileIndex || 0;
      
      for (var folderIdx = currentFolderIndex; folderIdx < foldersToProcess.length; folderIdx++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Saving checkpoint and stopping due to time limit");
          ns.saveProcessingCheckpoint({
            folderIndex: folderIdx,
            fileIndex: currentFileIndex,
            lastRun: new Date().toISOString()
          });
          break;
        }
        
        var folderId = foldersToProcess[folderIdx];
        Logger.log("Processing folder tree: " + folderId);
        
        var files = ns.getImageFilesInFolder(folderId, accessToken);
        
        for (var fileIdx = currentFileIndex; fileIdx < files.length; fileIdx++) {
          if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
            ns.saveProcessingCheckpoint({
              folderIndex: folderIdx,
              fileIndex: fileIdx,
              lastRun: new Date().toISOString()
            });
            Logger.log("⏰ Time limit reached, saved checkpoint");
            break;
          }
          
          var result = ns.processFileIfNeeded(files[fileIdx], accessToken);
          if (result === 'processed') processed++;
          else if (result === 'skipped') skipped++;
          else errors++;
          
          Utilities.sleep(150);
        }
        
        currentFileIndex = 0; // Reset for next folder
        
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) break;
      }
      
      // If we completed all folders, reset checkpoint
      if (currentFolderIndex >= foldersToProcess.length - 1) {
        ns.saveProcessingCheckpoint({
          folderIndex: 0,
          fileIndex: 0,
          lastRun: new Date().toISOString(),
          completedCycle: true
        });
        Logger.log("✅ Completed full processing cycle");
      }
      
      ns.saveProcessingStats({
        timestamp: new Date().toISOString(),
        processed: processed,
        skipped: skipped,
        errors: errors,
        strategy: 'incremental_search'
      });
      
      Logger.log("\n📊 Incremental processing complete:");
      Logger.log("✅ Processed: " + processed);
      Logger.log("⏭️ Skipped (already processed): " + skipped);
      Logger.log("❌ Errors: " + errors);
      
    } catch (error) {
      Logger.log("❌ Error in incremental processing: " + error.toString());
    }
  };
  
  /**
   * Fallback Strategy: Simple Search-Based Processing (Unprocessed Only)
   * Quick recovery strategy and manual trigger option
   */
  ns.processUnprocessedFilesOnly = function() {
    Logger.log("=== Fallback Strategy: Processing Unprocessed Files Only ===\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken();
    var processed = 0;
    var skipped = 0;
    var errors = 0;
    
    try {
      // Search for image files that likely don't have metadata
      var searchQueries = [
        'type:file .jpg',
        'type:file .png', 
        'type:file .jpeg'
      ];
      
      for (var i = 0; i < searchQueries.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Approaching time limit, stopping");
          break;
        }
        
        var query = searchQueries[i];
        Logger.log("Searching for: " + query);
        
        var unprocessedFiles = ns.findUnprocessedFiles(query, accessToken);
        Logger.log("ℹ️ Found " + unprocessedFiles.length + " potentially unprocessed files");
        
        // Process in small batches
        for (var j = 0; j < Math.min(unprocessedFiles.length, PROCESSING_BATCH_SIZE); j++) {
          if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
            Logger.log("⏰ Time limit reached, saving progress");
            break;
          }
          
          var file = unprocessedFiles[j];
          var result = ns.processFileIfNeeded(file, accessToken);
          
          if (result === 'processed') processed++;
          else if (result === 'skipped') skipped++;
          else errors++;
          
          Utilities.sleep(100);
        }
        
        Utilities.sleep(500); // Pause between search queries
      }
      
      ns.saveProcessingStats({
        timestamp: new Date().toISOString(),
        processed: processed,
        skipped: skipped,
        errors: errors,
        strategy: 'search_unprocessed'
      });
      
      Logger.log("\n📊 Search-based processing complete:");
      Logger.log("✅ Processed: " + processed);
      Logger.log("⏭️ Skipped (already processed): " + skipped);
      Logger.log("❌ Errors: " + errors);
      
    } catch (error) {
      Logger.log("❌ Error in search-based processing: " + error.toString());
    }
  };
  
  // Helper Functions
  
  /**
   * Find files that don't have our metadata template using search
   */
  ns.findUnprocessedFiles = function(query, accessToken) {
    var allFiles = ns.searchBoxFiles(query, accessToken, 100);
    var unprocessed = [];
    
    for (var i = 0; i < allFiles.length; i++) {
      var file = allFiles[i];
      
      var hasMetadata = ns.quickMetadataCheck(file.id, accessToken);
      if (!hasMetadata) {
        unprocessed.push(file);
      }
      
      // Don't check too many at once
      if (unprocessed.length >= 50) break;
    }
    
    return unprocessed;
  };
  
  /**
   * Quick check if file has our metadata (without full retrieval)
   */
  ns.quickMetadataCheck = function(fileId, accessToken) {
    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + Config.BOX_METADATA_TEMPLATE_KEY;
      
      var response = UrlFetchApp.fetch(url, {
        method: 'HEAD',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      return response.getResponseCode() === 200;
    } catch (error) {
      return false;
    }
  };
  
  /**
   * Process file only if it needs processing
   */
  ns.processFileIfNeeded = function(file, accessToken) {
    try {
      // Check if already processed
      if (ns.quickMetadataCheck(file.id, accessToken)) {
        return 'skipped';
      }
      
      // Get full file details for metadata extraction
      var fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + file.id + 
                          '?fields=id,name,size,path_collection,created_at,parent';
      var response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var fileDetails = JSON.parse(response.getContentText());
        var metadata = MetadataExtraction.extractComprehensiveMetadata(fileDetails);
        
        var success = BoxFileOperations.applyMetadata(file.id, metadata, accessToken);
        
        if (success) {
          Logger.log("✅ Processed: " + file.name);
          return 'processed';
        } else {
          Logger.log("❌ Failed to apply metadata: " + file.name);
          return 'error';
        }
      } else {
        return 'error';
      }
    } catch (error) {
      Logger.log("❌ Error processing file " + file.name + ": " + error.toString());
      return 'error';
    }
  };
  
  /**
   * Search Box for files with query - CORRECTED VERSION
   */
  ns.searchBoxFiles = function(query, accessToken, limit) {
    limit = limit || 50;
    
    try {
      var searchUrl = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                     '&limit=' + limit + '&fields=id,name,type,size,created_at,modified_at,parent';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        return data.entries.filter(function(item) {
          return item.type === 'file' && BoxFileOperations.isImageFile(item.name);
        });
      } else {
        Logger.log("Search failed: " + response.getResponseCode());
        return [];
      }
    } catch (error) {
      Logger.log("Search error: " + error.toString());
      return [];
    }
  };

  /**
   * Search for files in a specific folder using ancestor_folder_ids parameter - CORRECTED VERSION
   */
ns.searchBoxFilesInFolder = function(folderId, accessToken, limit) {
  limit = limit || 50;
  
  try {
    var searchUrl = Config.BOX_API_BASE_URL + '/search?' + 
                   'query=' + encodeURIComponent('type:file') +
                   '&ancestor_folder_ids=' + folderId +
                   '&limit=' + limit + 
                   '&fields=id,name,type,size,created_at,modified_at,parent';
    
    var response = UrlFetchApp.fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      return data.entries.filter(function(item) {
        return item.type === 'file' && BoxFileOperations.isImageFile(item.name);
      });
    } else {
      Logger.log("Folder search failed: " + response.getResponseCode());
      Logger.log("Response: " + response.getContentText());
      return [];
    }
  } catch (error) {
    Logger.log("Folder search error: " + error.toString());
    return [];
  }
};  
  /**
   * OPTIMIZED: Get image files using search instead of recursive folder listing
   * This replaces the slow recursive approach with Box search API
   */
  ns.getImageFilesInFolder = function(folderId, accessToken) {
    Logger.log("OptimizedProcessing: Using search to find image files in folder tree of ID: " + folderId);

    // Use the corrected search function
    var imageFiles = ns.searchBoxFilesInFolder(folderId, accessToken, Config.DEFAULT_API_ITEM_LIMIT);

    Logger.log("OptimizedProcessing: Search found " + imageFiles.length + " image file(s) in folder tree of " + folderId);
    return imageFiles;
  };
  
  // Checkpoint and Statistics Management
  
  ns.getProcessingCheckpoint = function() {
    var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(CHECKPOINT_PROPERTY);
    return checkpointStr ? JSON.parse(checkpointStr) : { folderIndex: 0, fileIndex: 0 };
  };
  
  ns.saveProcessingCheckpoint = function(checkpoint) {
    Config.SCRIPT_PROPERTIES.setProperty(CHECKPOINT_PROPERTY, JSON.stringify(checkpoint));
  };
  
  ns.getLastCheckpoint = function() {
    var checkpoint = ns.getProcessingCheckpoint();
    return checkpoint.lastRun || null;
  };
  
  ns.saveCheckpoint = function(timestamp) {
    var checkpoint = ns.getProcessingCheckpoint();
    checkpoint.lastRun = timestamp;
    ns.saveProcessingCheckpoint(checkpoint);
  };
  
  ns.saveProcessingStats = function(stats) {
    var existing = Config.SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
    var allStats = existing ? JSON.parse(existing) : [];
    allStats.push(stats);
    
    // Keep only last 10 runs
    if (allStats.length > 10) {
      allStats = allStats.slice(-10);
    }
    
    Config.SCRIPT_PROPERTIES.setProperty(STATS_PROPERTY, JSON.stringify(allStats));
  };
  
  ns.getFoldersToProcess = function() {
    // Define specific folders to process, or discover them dynamically
    return [Config.ACTIVE_TEST_FOLDER_ID, Config.DEFAULT_PROCESSING_FOLDER_ID]; 
  };
  
  return ns;
})();

// Main optimized processing function for triggers
function processBoxImagesOptimized() {
  Logger.log("🚀 Starting Optimized Box Image Processing\n");
  
  // Choose strategy based on conditions
  var lastRun = OptimizedProcessing.getLastCheckpoint();
  var daysSinceLastRun = lastRun ? 
    Math.floor((Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24)) : 7;
  
  if (daysSinceLastRun <= 3) {
    // Recent run - use fallback strategy for new files
    OptimizedProcessing.processUnprocessedFilesOnly();
  } else {
    // Use primary incremental strategy with checkpoints
    OptimizedProcessing.processIncrementallyWithCheckpoints();
  }
}

// Show processing statistics
function showOptimizedProcessingStats() {
  Logger.log("=== Optimized Processing Statistics ===\n");
  
  var statsStr = Config.SCRIPT_PROPERTIES.getProperty('PROCESSING_STATS');
  if (!statsStr) {
    Logger.log("No processing statistics available yet");
    return;
  }
  
  var stats = JSON.parse(statsStr);
  
  Logger.log("Last " + stats.length + " processing runs:");
  stats.forEach(function(run, index) {
    var date = new Date(run.timestamp).toLocaleDateString();
    Logger.log((index + 1) + ". " + date + " (" + run.strategy + "):");
    Logger.log("   Processed: " + run.processed + ", Skipped: " + run.skipped + ", Errors: " + run.errors);
  });
  
  var checkpoint = OptimizedProcessing.getProcessingCheckpoint();
  if (checkpoint.lastRun) {
    var lastRun = new Date(checkpoint.lastRun);
    var daysSince = Math.floor((Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24));
    Logger.log("\nLast processing run: " + daysSince + " days ago");
  }
}

/**
 * Analyzes Box account and recommends processing strategy
 */
function recommendProcessingStrategy() {
  Logger.log("=== Box Processing Strategy Recommendation ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    Logger.log("🔍 Analyzing your Box account...");
    
    // Quick search to estimate image count
    const totalImagesResponse = UrlFetchApp.fetch(
      Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent('type:file (.jpg OR .png OR .jpeg)') + '&limit=100',
      {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      }
    );
    
    if (totalImagesResponse.getResponseCode() === 200) {
      const searchData = JSON.parse(totalImagesResponse.getContentText());
      const totalEstimatedImages = searchData.entries.length;
      
      Logger.log("📈 Analysis Results:");
      Logger.log("• Estimated total images: " + totalEstimatedImages + "+");
      
      Logger.log("\n🎯 Recommended Setup:");
      if (totalEstimatedImages < 500) {
        Logger.log("**SMALL COLLECTION** - Use both strategies as configured");
        Logger.log("• Set trigger: Every 12 hours");
      } else {
        Logger.log("**LARGE COLLECTION** - Primary incremental strategy will handle this well");
        Logger.log("• Set trigger: Every 6 hours");
      }
      
      Logger.log("\n🔧 Implementation:");
      Logger.log("• Primary: processIncrementallyWithCheckpoints() (search-optimized)");
      Logger.log("• Fallback: processUnprocessedFilesOnly() (for quick recovery)");
      Logger.log("• Main function: processBoxImagesOptimized() (auto-chooses strategy)");
      
    } else {
      Logger.log("❌ Could not analyze account");
    }
    
  } catch (error) {
    Logger.log("❌ Error analyzing account: " + error.toString());
  }
}

/**
 * Quick setup for optimized processing
 */
function setupOptimizedProcessing() {
  Logger.log("=== Setting Up Optimized Processing ===\n");
  
  try {
    // Test basic connectivity
    Logger.log("1. Testing Box connectivity...");
    const testResult = testBoxAccess();
    if (!testResult.success) {
      Logger.log("❌ Box connection failed. Fix authentication first.");
      return;
    }
    Logger.log("✅ Box connected");
    
    // Ensure template exists
    Logger.log("\n2. Checking metadata template...");
    const accessToken = getValidAccessToken();
    const template = getOrCreateImageTemplate(accessToken);
    if (!template) {
      Logger.log("❌ Template creation failed");
      return;
    }
    Logger.log("✅ Template ready: " + template.displayName);
    
    // Update trigger
    Logger.log("\n3. Updating trigger...");
    
    // Delete old triggers
    ScriptApp.getProjectTriggers().forEach(trigger => {
      const funcName = trigger.getHandlerFunction();
      if (funcName === 'processBoxImages' || 
          funcName === 'processBoxImagesEnhanced' ||
          funcName === 'processBoxImagesOptimized') {
        ScriptApp.deleteTrigger(trigger);
        Logger.log("Deleted old trigger: " + funcName);
      }
    });
    
    // Create new optimized trigger
    ScriptApp.newTrigger('processBoxImagesOptimized')
      .timeBased()
      .everyHours(6)
      .create();
    
    Logger.log("✅ Created optimized trigger (every 6 hours)");
    
    Logger.log("\n🎉 Optimized Processing Setup Complete!");
    Logger.log("• Two-strategy approach implemented");
    Logger.log("• Search optimization enabled");
    Logger.log("• Execution time limits respected");
    Logger.log("• Progress checkpoints active");
    
  } catch (error) {
    Logger.log("❌ Setup error: " + error.toString());
  }
}

/**
 * Process all images in test folder using corrected search
 */
function processAllTestFolderImages() {
  const accessToken = getValidAccessToken();
  const folderId = '256585558894'; // Updated folder ID
  
  Logger.log("Processing all images in test folder: " + folderId);
  
  // Use corrected search
  const imageFiles = OptimizedProcessing.searchBoxFilesInFolder(folderId, accessToken, 100);
  
  Logger.log(`ℹ️ Found ${imageFiles.length} images to process`);
  
  imageFiles.forEach((image, index) => {
    try {
      Logger.log(`ℹ️ ${index + 1}/${imageFiles.length}: ${image.name}`);
      
      // Get full file details
      const detailsUrl = Config.BOX_API_BASE_URL + '/files/' + image.id + 
                        '?fields=id,name,size,path_collection,created_at,parent';
      const detailsResponse = UrlFetchApp.fetch(detailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      });
      const fileDetails = JSON.parse(detailsResponse.getContentText());
      
      const metadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      BoxFileOperations.applyMetadata(image.id, metadata, accessToken);
      
      Utilities.sleep(2000);
    } catch (error) {
      Logger.log(`Error processing ${image.name}: ${error.toString()}`);
    }
  });
}