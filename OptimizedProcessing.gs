// File: OptimizedProcessing.gs
// Smart processing strategies that scale and respect time/resource limits

/**
 * Optimized processing namespace with multiple strategies
 */
var OptimizedProcessing = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration for optimization
  var PROCESSING_BATCH_SIZE = 10;           // Process 10 files per batch
  var MAX_EXECUTION_TIME_MS = 4 * 60 * 1000; // 4 minutes (safe margin)
  var CHECKPOINT_PROPERTY = 'LAST_PROCESSING_CHECKPOINT';
  var STATS_PROPERTY = 'PROCESSING_STATS';
  
  /**
   * Strategy 1: Search-Based Processing (Most Efficient)
   * Uses Box search to find unprocessed files directly
   */
  ns.processUnprocessedFilesOnly = function() {
    Logger.log("=== Strategy 1: Processing Unprocessed Files Only ===\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken();
    var processed = 0;
    var skipped = 0;
    var errors = 0;
    
    try {
      // Search for image files that likely don't have metadata
      // We'll search for recent images and check them
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
        Logger.log("Found " + unprocessedFiles.length + " potentially unprocessed files");
        
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
          
          // Small delay to avoid rate limits
          Utilities.sleep(100);
        }
        
        Utilities.sleep(500); // Pause between search queries
      }
      
      ns.saveProcessingStats({
        timestamp: new Date().toISOString(),
        processed: processed,
        skipped: skipped,
        errors: errors,
        strategy: 'search_based'
      });
      
      Logger.log("\\n📊 Search-based processing complete:");
      Logger.log("✅ Processed: " + processed);
      Logger.log("⏭️ Skipped (already processed): " + skipped);
      Logger.log("❌ Errors: " + errors);
      
    } catch (error) {
      Logger.log("❌ Error in search-based processing: " + error.toString());
    }
  };
  
  /**
   * Strategy 2: Recent Files First (Time-based)
   * Process files modified/created in the last N days
   */
  ns.processRecentFilesFirst = function(daysSinceLastRun) {
    daysSinceLastRun = daysSinceLastRun || 7; // Default: last week
    
    Logger.log("=== Strategy 2: Processing Recent Files (Last " + daysSinceLastRun + " Days) ===\\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken();
    var lastCheckpoint = ns.getLastCheckpoint();
    
    // Calculate date range
    var sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - daysSinceLastRun);
    var sinceDateISO = sinceDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    Logger.log("Looking for files modified since: " + sinceDateISO);
    
    try {
      // Use Box search with date filter
      var dateQuery = "type:file modified_at:>" + sinceDateISO + " (.jpg OR .png OR .jpeg)";
      var recentFiles = ns.searchBoxFiles(dateQuery, accessToken, 50);
      
      Logger.log("Found " + recentFiles.length + " recent image files");
      
      var processed = 0;
      for (var i = 0; i < recentFiles.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Time limit reached");
          break;
        }
        
        var result = ns.processFileIfNeeded(recentFiles[i], accessToken);
        if (result === 'processed') processed++;
        
        Utilities.sleep(200); // Rate limiting
      }
      
      ns.saveCheckpoint(new Date().toISOString());
      Logger.log("\n✅ Recent files processing complete. Processed: " + processed);
      
    } catch (error) {
      Logger.log("❌ Error in recent files processing: " + error.toString());
    }
  };
  
  /**
   * Strategy 3: Incremental Folder Processing
   * Process folders incrementally, saving progress between runs
   */
  ns.processIncrementallyWithCheckpoints = function() {
    Logger.log("=== Strategy 3: Incremental Processing with Checkpoints ===\\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken();
    var checkpoint = ns.getProcessingCheckpoint();
    
    Logger.log("Starting from checkpoint: " + JSON.stringify(checkpoint));
    
    try {
      var foldersToProcess = ns.getFoldersToProcess();
      var currentFolderIndex = checkpoint.folderIndex || 0;
      var currentFileIndex = checkpoint.fileIndex || 0;
      
      for (var folderIdx = currentFolderIndex; folderIdx < foldersToProcess.length; folderIdx++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Saving checkpoint and stopping");
          ns.saveProcessingCheckpoint({
            folderIndex: folderIdx,
            fileIndex: currentFileIndex,
            lastRun: new Date().toISOString()
          });
          break;
        }
        
        var folderId = foldersToProcess[folderIdx];
        Logger.log("Processing folder: " + folderId);
        
        var files = ns.getImageFilesInFolder(folderId, accessToken);
        
        for (var fileIdx = currentFileIndex; fileIdx < files.length; fileIdx++) {
          if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
            ns.saveProcessingCheckpoint({
              folderIndex: folderIdx,
              fileIndex: fileIdx,
              lastRun: new Date().toISOString()
            });
            return;
          }
          
          ns.processFileIfNeeded(files[fileIdx], accessToken);
          Utilities.sleep(150);
        }
        
        currentFileIndex = 0; // Reset for next folder
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
      
    } catch (error) {
      Logger.log("❌ Error in incremental processing: " + error.toString());
    }
  };
  
  /**
   * Strategy 4: Priority-Based Processing
   * Process high-priority content first (new uploads, specific content types, etc.)
   */
  ns.processByPriority = function() {
    Logger.log("=== Strategy 4: Priority-Based Processing ===\\n");
    
    var startTime = Date.now();
    var accessToken = getValidAccessToken();
    
    // Priority levels (process in this order)
    var priorities = [
      {
        name: "New uploads (last 24 hours)",
        query: "type:file created_at:>2024-" + ns.getYesterdayISO() + " (.jpg OR .png)",
        weight: 10
      },
      {
        name: "Recently modified images",
        query: "type:file modified_at:>" + ns.getLastWeekISO() + " .jpg",
        weight: 8
      },
      {
        name: "Large images (likely important)",
        query: "type:file .jpg size:>1000000", // >1MB
        weight: 6
      }
    ];
    
    var totalProcessed = 0;
    
    for (var i = 0; i < priorities.length; i++) {
      if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) break;
      
      var priority = priorities[i];
      Logger.log("Processing priority: " + priority.name);
      
      var files = ns.searchBoxFiles(priority.query, accessToken, 20);
      var processed = 0;
      
      for (var j = 0; j < files.length; j++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) break;
        
        var result = ns.processFileIfNeeded(files[j], accessToken);
        if (result === 'processed') {
          processed++;
          totalProcessed++;
        }
        
        Utilities.sleep(100);
      }
      
      Logger.log("Processed " + processed + " files in priority: " + priority.name);
    }
    
    Logger.log("\\n✅ Priority processing complete. Total processed: " + totalProcessed);
  };
  
  // Helper Functions
  
  /**
   * Find files that don't have our metadata template
   */
  ns.findUnprocessedFiles = function(query, accessToken) {
    var allFiles = ns.searchBoxFiles(query, accessToken, 100);
    var unprocessed = [];
    
    for (var i = 0; i < allFiles.length; i++) {
      var file = allFiles[i];
      
      // Quick check: does this file have our metadata?
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
      var url = BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                BOX_METADATA_SCOPE + '/' + BOX_METADATA_TEMPLATE_KEY;
      
      var response = UrlFetchApp.fetch(url, {
        method: 'HEAD', // Just check existence, don't download content
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
      var fileDetailsUrl = BOX_API_BASE_URL + '/files/' + file.id + 
                          '?fields=id,name,size,path_collection,created_at,parent';
      var response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var fileDetails = JSON.parse(response.getContentText());
        var metadata = MetadataExtraction.extractComprehensiveMetadata(fileDetails);
        
        // Apply metadata using the fixed function
        var success = applyMetadataToFileFixed(file.id, metadata, accessToken);
        
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
   * Search Box for files with query
   */
  ns.searchBoxFiles = function(query, accessToken, limit) {
    limit = limit || 50;
    
    try {
      var searchUrl = BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
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
  
  // Checkpoint and Statistics Management
  
  ns.getProcessingCheckpoint = function() {
    var checkpointStr = SCRIPT_PROPERTIES.getProperty(CHECKPOINT_PROPERTY);
    return checkpointStr ? JSON.parse(checkpointStr) : { folderIndex: 0, fileIndex: 0 };
  };
  
  ns.saveProcessingCheckpoint = function(checkpoint) {
    SCRIPT_PROPERTIES.setProperty(CHECKPOINT_PROPERTY, JSON.stringify(checkpoint));
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
    var existing = SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
    var allStats = existing ? JSON.parse(existing) : [];
    allStats.push(stats);
    
    // Keep only last 10 runs
    if (allStats.length > 10) {
      allStats = allStats.slice(-10);
    }
    
    SCRIPT_PROPERTIES.setProperty(STATS_PROPERTY, JSON.stringify(allStats));
  };
  
  // Utility date functions
  ns.getYesterdayISO = function() {
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toISOString().split('T')[0];
  };
  
  ns.getLastWeekISO = function() {
    var lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    return lastWeek.toISOString().split('T')[0];
  };
  
  ns.getFoldersToProcess = function() {
    // Define specific folders to process, or discover them dynamically
    return [ACTIVE_TEST_FOLDER_ID]; // Start with test folder
  };
  
  ns.getImageFilesInFolder = function(folderId, accessToken) {
    return SimpleBoxOperations.findAllImageFiles(folderId, accessToken);
  };
  
  return ns;
})();

// Main optimized processing function for triggers
function processBoxImagesOptimized() {
  Logger.log("🚀 Starting Optimized Box Image Processing\\n");
  
  // Choose strategy based on conditions
  var lastRun = OptimizedProcessing.getLastCheckpoint();
  var daysSinceLastRun = lastRun ? 
    Math.floor((Date.now() - new Date(lastRun).getTime()) / (1000 * 60 * 60 * 24)) : 7;
  
  if (daysSinceLastRun <= 1) {
    // Recent run - just check for new files
    OptimizedProcessing.processUnprocessedFilesOnly();
  } else if (daysSinceLastRun <= 7) {
    // Weekly run - process recent files
    OptimizedProcessing.processRecentFilesFirst(daysSinceLastRun);
  } else {
    // Longer gap - use priority-based processing
    OptimizedProcessing.processByPriority();
  }
}

// Show processing statistics
function showOptimizedProcessingStats() {
  Logger.log("=== Optimized Processing Statistics ===\\n");
  
  var statsStr = SCRIPT_PROPERTIES.getProperty('PROCESSING_STATS');
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
    Logger.log("\\nLast processing run: " + daysSince + " days ago");
  }
}

/**
 * Smart processing recommendations and configuration
 */

/**
 * Analyzes your Box account and recommends the best processing strategy
 */
function recommendProcessingStrategy() {
  Logger.log("=== Box Processing Strategy Recommendation ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    // Analyze account size and activity
    Logger.log("🔍 Analyzing your Box account...");
    
    // Get user info
    const userResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/users/me', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (userResponse.getResponseCode() !== 200) {
      Logger.log("❌ Cannot access user info");
      return;
    }
    
    const user = JSON.parse(userResponse.getContentText());
    Logger.log(`📊 Account: ${user.name} (${user.login})`);
    
    // Quick search to estimate image count
    const searches = [
      { query: 'type:file .jpg', name: 'JPG files' },
      { query: 'type:file .png', name: 'PNG files' },
      { query: 'type:file (.jpg OR .png OR .jpeg)', name: 'Total images' }
    ];
    
    let totalEstimatedImages = 0;
    let recentImages = 0;
    
    for (const search of searches) {
      try {
        const searchUrl = `${BOX_API_BASE_URL}/search?query=${encodeURIComponent(search.query)}&limit=100`;
        const searchResponse = UrlFetchApp.fetch(searchUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
        
        if (searchResponse.getResponseCode() === 200) {
          const searchData = JSON.parse(searchResponse.getContentText());
          Logger.log(`${search.name}: ${searchData.entries.length}+ files`);
          
          if (search.name === 'Total images') {
            totalEstimatedImages = searchData.entries.length;
            
            // Count recent files (last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            recentImages = searchData.entries.filter(file => 
              new Date(file.created_at) > thirtyDaysAgo
            ).length;
          }
        }
        
        Utilities.sleep(500); // Rate limiting
      } catch (error) {
        Logger.log(`Error searching ${search.name}: ${error.toString()}`);
      }
    }
    
    Logger.log(`\n📈 Analysis Results:`);
    Logger.log(`• Estimated total images: ${totalEstimatedImages}+`);
    Logger.log(`• Recent images (last 30 days): ${recentImages}`);
    
    // Make recommendations based on analysis
    Logger.log(`\n🎯 Recommended Strategy:`);
    
    if (totalEstimatedImages < 100) {
      Logger.log(`**SMALL COLLECTION** - Use Strategy 2 (Recent Files)`);
      Logger.log(`• Your collection is small enough to process quickly`);
      Logger.log(`• Run: OptimizedProcessing.processRecentFilesFirst(30)`);
      Logger.log(`• Set trigger: Every 6 hours`);
      
    } else if (totalEstimatedImages < 1000) {
      Logger.log(`**MEDIUM COLLECTION** - Use Strategy 1 (Search-Based)`);
      Logger.log(`• Focus on unprocessed files only`);
      Logger.log(`• Run: OptimizedProcessing.processUnprocessedFilesOnly()`);
      Logger.log(`• Set trigger: Every 2 hours`);
      
    } else if (recentImages > 50) {
      Logger.log(`**LARGE ACTIVE COLLECTION** - Use Strategy 4 (Priority-Based)`);
      Logger.log(`• High activity requires priority processing`);
      Logger.log(`• Run: OptimizedProcessing.processByPriority()`);
      Logger.log(`• Set trigger: Every hour`);
      
    } else {
      Logger.log(`**LARGE STABLE COLLECTION** - Use Strategy 3 (Incremental)`);
      Logger.log(`• Large collection needs systematic processing`);
      Logger.log(`• Run: OptimizedProcessing.processIncrementallyWithCheckpoints()`);
      Logger.log(`• Set trigger: Every 4 hours`);
    }
    
    Logger.log(`\n🔧 Implementation Steps:`);
    Logger.log(`1. Replace your current trigger function:`);
    Logger.log(`   ScriptApp.newTrigger('processBoxImagesOptimized')`);
    Logger.log(`2. Test the recommended strategy manually first`);
    Logger.log(`3. Monitor with: showOptimizedProcessingStats()`);
    
    // Show current processing state
    const checkpoint = OptimizedProcessing.getProcessingCheckpoint();
    if (checkpoint.lastRun) {
      const lastRun = new Date(checkpoint.lastRun);
      const daysSince = Math.floor((Date.now() - lastRun.getTime()) / (1000 * 60 * 60 * 24));
      Logger.log(`\n📅 Last processing: ${daysSince} days ago`);
    } else {
      Logger.log(`\n📅 No previous processing runs detected`);
    }
    
  } catch (error) {
    Logger.log(`❌ Error analyzing account: ${error.toString()}`);
  }
}

/**
 * Quick setup for optimized processing
 */
function setupOptimizedProcessing() {
  Logger.log("=== Setting Up Optimized Processing ===\n");
  
  try {
    // 1. Test basic connectivity
    Logger.log("1. Testing Box connectivity...");
    const testResult = testBoxAccess();
    if (!testResult.success) {
      Logger.log("❌ Box connection failed. Fix authentication first.");
      return;
    }
    Logger.log("✅ Box connected");
    
    // 2. Ensure template exists
    Logger.log("\n2. Checking metadata template...");
    const accessToken = getValidAccessToken();
    const template = getOrCreateImageTemplate(accessToken);
    if (!template) {
      Logger.log("❌ Template creation failed");
      return;
    }
    Logger.log("✅ Template ready: " + template.displayName);
    
    // 3. Get recommendation
    Logger.log("\n3. Analyzing account for recommendations...");
    recommendProcessingStrategy();
    
    // 4. Update trigger
    Logger.log("\n4. Updating trigger...");
    
    // Delete old triggers
    ScriptApp.getProjectTriggers().forEach(trigger => {
      const funcName = trigger.getHandlerFunction();
      if (funcName === 'processBoxImages' || 
          funcName === 'processBoxImagesEnhanced' ||
          funcName === 'processBoxImagesOptimized') {
        ScriptApp.deleteTrigger(trigger);
        Logger.log(`Deleted old trigger: ${funcName}`);
      }
    });
    
    // Create new optimized trigger
    ScriptApp.newTrigger('processBoxImagesOptimized')
      .timeBased()
      .everyHours(2)  // Conservative starting point
      .create();
    
    Logger.log("✅ Created optimized trigger (every 2 hours)");
    
    // 5. Test run
    Logger.log("\n5. Running initial test...");
    try {
      OptimizedProcessing.processUnprocessedFilesOnly();
      Logger.log("✅ Test processing completed");
    } catch (error) {
      Logger.log("❌ Test processing failed: " + error.toString());
    }
    
    Logger.log("\n🎉 Optimized Processing Setup Complete!");
    Logger.log("\n📋 What's Different Now:");
    Logger.log("• Only processes files that need processing");
    Logger.log("• Respects execution time limits");
    Logger.log("• Saves progress between runs");
    Logger.log("• Prioritizes recent/important files");
    Logger.log("• Uses efficient Box search APIs");
    
    Logger.log("\n🔍 Monitoring Commands:");
    Logger.log("• showOptimizedProcessingStats() - View processing history");
    Logger.log("• recommendProcessingStrategy() - Re-analyze and get new recommendations");
    Logger.log("• processBoxImagesOptimized() - Manual run of optimized processing");
    
  } catch (error) {
    Logger.log("❌ Setup error: " + error.toString());
  }
}

/**
 * Test the optimized approach on a small batch
 */
function testOptimizedApproach() {
  Logger.log("=== Testing Optimized Approach ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token");
    return;
  }
  
  Logger.log("🔍 Testing search-based unprocessed file detection...");
  
  try {
    // Search for a few image files
    const searchUrl = `${BOX_API_BASE_URL}/search?query=type:file .jpg&limit=5&fields=id,name,size`;
    const response = UrlFetchApp.fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const data = JSON.parse(response.getContentText());
      Logger.log(`✅ Found ${data.entries.length} image files via search`);
      
      if (data.entries.length > 0) {
        // Test quick metadata check on first file
        const testFile = data.entries[0];
        Logger.log(`\n🔍 Testing quick metadata check on: ${testFile.name}`);
        
        const hasMetadata = OptimizedProcessing.quickMetadataCheck(testFile.id, accessToken);
        Logger.log(`Metadata exists: ${hasMetadata ? 'Yes' : 'No'}`);
        
        if (!hasMetadata) {
          Logger.log(`\n✅ This file would be processed by optimized approach`);
          Logger.log(`File: ${testFile.name} (${Math.round(testFile.size/1024)}KB)`);
        } else {
          Logger.log(`\n⏭️ This file would be skipped (already processed)`);
        }
        
        Logger.log(`\n🎯 Optimized processing would be much faster because:`);
        Logger.log(`• Only processes files that need it`);
        Logger.log(`• Uses search instead of scanning all folders`);
        Logger.log(`• Quick HEAD requests to check metadata existence`);
        Logger.log(`• Processes in small batches with time limits`);
        
      } else {
        Logger.log("⚠️ No image files found in search");
      }
    } else {
      Logger.log(`❌ Search failed: ${response.getResponseCode()}`);
    }
    
  } catch (error) {
    Logger.log(`❌ Test error: ${error.toString()}`);
  }
}