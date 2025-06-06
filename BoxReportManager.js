// File: BoxReportManager.gs
// Fixed Box report management with proper integration
// Depends on: Config.gs, BoxAuth.gs, BoxFileOperations.gs, bmFiddler library

/**
 * BoxReportManager - Manages Box weekly reports and systematic file processing
 * Uses Bruce McPherson's bmFiddler library for CSV manipulation and Google Drive caching
 */
var BoxReportManager = (function() {
  'use strict';
  
  var ns = {};
  
  // Constants
  var MAX_EXECUTION_TIME_MS = 4.5 * 60 * 1000; // 4.5 minutes safety margin
  var BATCH_SIZE = 8;
  var REPORT_PROCESSING_CHECKPOINT = 'BOXER_REPORT_CHECKPOINT';
  var PROCESSING_STATS_PROPERTY = 'BOXER_REPORT_STATS';
  
  /**
   * ReportManager - handles finding and caching Box reports
   */
  var ReportManager = {
    
    /**
     * Find the latest Box report in the reports folder
     * @param {string} accessToken Valid Box access token
     * @returns {object|null} Report info or null if not found
     */
    findLatestReport: function(accessToken) {
      Logger.log('--- Starting Box Report Search ---');
      var rootReportsFolderId = Config.REPORTS_FOLDER_ID;
      
      try {
        // Get folders in the reports directory (sorted by date DESC)
        var folderItemsUrl = Config.BOX_API_BASE_URL + '/folders/' + rootReportsFolderId + 
                           '/items?fields=id,name,type,created_at&limit=250&sort=date&direction=DESC';
        
        var folderResponse = UrlFetchApp.fetch(folderItemsUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
        
        if (folderResponse.getResponseCode() !== 200) {
          Logger.log('❌ Failed to list reports folder. HTTP: ' + folderResponse.getResponseCode());
          return null;
        }
        
        var folderItems = JSON.parse(folderResponse.getContentText()).entries;
        var reportSubfolders = folderItems.filter(function(item) {
          return item.type === 'folder' && item.name.startsWith('Folder and File Tree run on');
        });
        
        if (reportSubfolders.length === 0) {
          Logger.log('❌ No report subfolders found');
          return null;
        }
        
        var latestSubfolder = reportSubfolders[0];
        Logger.log('✅ Found latest report subfolder: "' + latestSubfolder.name + '"');
        
        // Look for CSV file in the subfolder
        var subfolderItemsUrl = Config.BOX_API_BASE_URL + '/folders/' + latestSubfolder.id + 
                              '/items?fields=id,name,type,created_at&limit=100';
        
        var subfolderResponse = UrlFetchApp.fetch(subfolderItemsUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
        
        if (subfolderResponse.getResponseCode() !== 200) {
          Logger.log('❌ Failed to list subfolder contents');
          return null;
        }
        
        var subfolderItems = JSON.parse(subfolderResponse.getContentText()).entries;
        var reportFile = subfolderItems.find(function(item) {
          return item.name.startsWith('folder_and_file_tree_run_on_') && item.name.endsWith('.csv');
        });
        
        if (reportFile) {
          Logger.log('✅ Found report file: "' + reportFile.name + '"');
          return {
            id: reportFile.id,
            name: reportFile.name,
            created_at: reportFile.created_at,
            subfolder: latestSubfolder.name
          };
        }
        
        Logger.log('❌ No CSV report file found in subfolder');
        return null;
        
      } catch (error) {
        Logger.log('❌ Exception finding latest report: ' + error.toString());
        return null;
      }
    },
    
    /**
     * Cache report content to Google Drive using bmFiddler
     * @param {object} checkpoint Current checkpoint data
     * @param {object} latestReport Report info object
     * @param {string} accessToken Valid Box access token
     * @returns {string|null} Google Drive file ID or null on error
     */
    cacheReportToDrive: function(checkpoint, latestReport, accessToken) {
      Logger.log('📥 Caching report to Google Drive...');
      
      try {
        // Download report content from Box
        var reportContentUrl = Config.BOX_API_BASE_URL + '/files/' + latestReport.id + '/content';
        var reportResponse = UrlFetchApp.fetch(reportContentUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
        
        if (reportResponse.getResponseCode() !== 200) {
          Logger.log('❌ Failed to download report content. HTTP: ' + reportResponse.getResponseCode());
          return null;
        }
        
        var reportContent = reportResponse.getContentText();
        
        // Delete old cached report if it exists
        if (checkpoint && checkpoint.driveFileId) {
          try {
            DriveApp.getFileById(checkpoint.driveFileId).setTrashed(true);
            Logger.log('🗑️ Deleted old cached report');
          } catch (e) {
            Logger.log('⚠️ Could not delete old cached report: ' + e.toString());
          }
        }
        
        // Create new cached file in Google Drive
        var folder = Config.DRIVE_CACHE_FOLDER_ID ? 
          DriveApp.getFolderById(Config.DRIVE_CACHE_FOLDER_ID) : 
          DriveApp.getRootFolder();
        
        var fileName = 'boxer_report_cache_' + latestReport.id + '_' + new Date().toISOString().slice(0,10) + '.csv';
        var driveFile = folder.createFile(fileName, reportContent);
        
        Logger.log('✅ Report cached to Drive: ' + fileName);
        return driveFile.getId();
        
      } catch (error) {
        Logger.log('❌ Exception caching report: ' + error.toString());
        return null;
      }
    },
    
    /**
     * Verify report content and structure
     * @param {object} reportInfo Report information object
     * @param {string} reportContent CSV content string
     * @returns {boolean} True if report appears valid
     */
    verifyReport: function(reportInfo, reportContent) {
      Logger.log("🔍 Performing report validation...");
      
      try {
        // Check report age
        var reportAgeDays = (new Date() - new Date(reportInfo.created_at)) / (1000 * 60 * 60 * 24);
        if (reportAgeDays > 8) {
          Logger.log('⚠️ WARNING: Report is ' + Math.round(reportAgeDays) + ' days old');
        } else {
          Logger.log('✅ Report age is acceptable (' + reportAgeDays.toFixed(1) + ' days)');
        }
        
        // Check basic CSV structure
        var lines = reportContent.split('\n');
        if (lines.length < 2) {
          Logger.log('❌ Report appears empty (less than 2 lines)');
          return false;
        }
        
        var header = lines[0] || '';
        var expectedHeaders = ["Path", "Item Name", "Item ID", "Metadata"];
        var hasAllHeaders = expectedHeaders.every(function(h) {
          return header.includes(h);
        });
        
        if (!hasAllHeaders) {
          Logger.log('❌ Report missing expected headers: ' + expectedHeaders.join(', '));
          Logger.log('📋 Found headers: ' + header);
          return false;
        }
        
        Logger.log('✅ Report structure validation passed');
        Logger.log('📊 Report contains ' + (lines.length - 1) + ' data rows');
        return true;
        
      } catch (error) {
        Logger.log('❌ Exception during report verification: ' + error.toString());
        return false;
      }
    }
  };

  /**
   * Parse report CSV content using a robust CSV parser to extract image files.
   * @param {string} reportContent CSV content string
   * @returns {object[]} Array of image file objects
   */
// File: BoxReportManager.js
// ... (the rest of the file remains the same until the parseReport function)

  /**
   * Parse report CSV content using a robust CSV parser to extract image files.
   * @param {string} reportContent CSV content string
   * @returns {object[]} Array of image file objects
   */
  ns.parseReport = function(reportContent) {
    Logger.log('📊 Parsing report content with robust CSV parser...');
    
    try {
      // Use the robust Utilities.parseCsv() which handles commas inside quoted fields.
      var csvData = Utilities.parseCsv(reportContent);
      
      if (!csvData || csvData.length < 2) {
        Logger.log('⚠️ No data rows found in report');
        return [];
      }
      
      var headers = csvData[0].map(function(h) { return h.trim(); });
      var dataRows = csvData.slice(1);
      
      // Find the index of the columns we need
      var itemNameIndex = headers.indexOf('Item Name');
      var itemIdIndex = headers.indexOf('Item ID');
      var pathIndex = headers.indexOf('Path');
      var metadataIndex = headers.indexOf('Metadata');
      var pathIdIndex = headers.indexOf('Path ID'); // New: Get Path ID column index

      if (itemNameIndex === -1 || itemIdIndex === -1 || metadataIndex === -1 || pathIdIndex === -1) {
          Logger.log('❌ Report missing required headers: "Item Name", "Item ID", "Metadata", or "Path ID"');
          return [];
      }

      Logger.log('📋 CSV parsed with ' + dataRows.length + ' rows and ' + headers.length + ' columns');
      Logger.log('🏷️ Headers found: ' + headers.join(', '));
      
      // Filter to only image files
      var imageFiles = [];
      var filesWithMetadataCount = 0;
      
      dataRows.forEach(function(row) {
        var itemName = row[itemNameIndex] || '';
        var itemId = row[itemIdIndex] || '';
        var path = row[pathIndex] || '';
        var metadata = row[metadataIndex] || '';
        var pathId = row[pathIdIndex] || ''; // New: Get Path ID string
        
        // Check if it's an image file and has a valid ID
        if (itemName && itemId && BoxFileOperations.isImageFile(itemName) && /^\d+$/.test(itemId)) {
          
          var hasMetadata = metadata && metadata.includes('comprehensiveImageMetadata');
          if (hasMetadata) {
            filesWithMetadataCount++;
          }

          // New: Extract parent folder ID from the path ID string
          var parentId = null;
          if (pathId) {
            var ids = pathId.split('/');
            // The parent ID is the second to last ID in the path string.
            // e.g., in "0/123/456", "123" is the parent of the item "456"
            if (ids.length >= 2) {
              parentId = ids[ids.length - 2];
            }
          }
          
          imageFiles.push({
            id: itemId,
            name: itemName,
            path: path,
            hasMetadata: hasMetadata,
            metadata: metadata,
            parentId: parentId // New: Add parentId to the file object
          });
        }
      });
      
      var percentageWithMetadata = 0;
      if (imageFiles.length > 0) {
        percentageWithMetadata = (filesWithMetadataCount / imageFiles.length * 100).toFixed(1);
      }
      
      Logger.log('✅ Parsed ' + imageFiles.length + ' image files from report');
      Logger.log('📊 Files with metadata: ' + filesWithMetadataCount + ' (' + percentageWithMetadata + '%)');
      Logger.log('📊 Files without metadata: ' + (imageFiles.length - filesWithMetadataCount));
      
      return imageFiles;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'BoxReportManager.parseReport', { reportContentSample: reportContent.substring(0, 500) });
      return [];
    }
  };

  /**
   * Main report processing function - systematically processes files from Box report
   * @returns {object|null} Processing results or null on error
   */
  ns.runReportBasedProcessing = function() {
    var startTime = Date.now();
    Logger.log('🐕 === Boxer Report-Based Processing Started ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    var stats = {
      reportFound: false,
      reportCached: false,
      filesInReport: 0,
      filesProcessed: 0,
      filesSkipped: 0,
      filesErrored: 0,
      executionTimeMs: 0,
      startTime: new Date().toISOString()
    };
    
    try {
      // Step 1: Find latest Box report
      var latestReport = ReportManager.findLatestReport(accessToken);
      if (!latestReport) {
        Logger.log('❌ Could not find latest Box report');
        return stats;
      }
      
      stats.reportFound = true;
      Logger.log('📊 Using report: ' + latestReport.name);
      
      // Step 2: Check if we need to update our cached copy
      var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(REPORT_PROCESSING_CHECKPOINT);
      var checkpoint = checkpointStr ? JSON.parse(checkpointStr) : {};
      
      var needsNewCache = false;
      if (checkpoint.boxReportId !== latestReport.id) {
        Logger.log('🔄 New report detected - updating cache...');
        needsNewCache = true;
      } else {
        Logger.log('✅ Using existing cached report');
      }
      
      // Step 3: Cache report to Google Drive if needed
      if (needsNewCache) {
        var newDriveFileId = ReportManager.cacheReportToDrive(checkpoint, latestReport, accessToken);
        if (!newDriveFileId) {
          Logger.log('❌ Failed to cache report to Drive');
          return stats;
        }
        
        checkpoint = {
          boxReportId: latestReport.id,
          boxReportName: latestReport.name,
          driveFileId: newDriveFileId,
          lastUpdated: new Date().toISOString(),
          processedFileIds: new Set(), // Track processed files
          processingPosition: 0 // Track where we left off
        };
        
        Config.SCRIPT_PROPERTIES.setProperty(REPORT_PROCESSING_CHECKPOINT, JSON.stringify({
          ...checkpoint,
          processedFileIds: Array.from(checkpoint.processedFileIds) // Convert Set to Array for storage
        }));
        
        stats.reportCached = true;
      } else {
        // Convert processedFileIds back to Set
        checkpoint.processedFileIds = new Set(checkpoint.processedFileIds || []);
        checkpoint.processingPosition = checkpoint.processingPosition || 0;
      }
      
      // Step 4: Read and parse the cached report
      var driveFile = DriveApp.getFileById(checkpoint.driveFileId);
      var reportContent = driveFile.getBlob().getDataAsString();
      
      if (!ReportManager.verifyReport(latestReport, reportContent)) {
        Logger.log('❌ Report validation failed');
        return stats;
      }
      
      var allReportFiles = ns.parseReport(reportContent);
      stats.filesInReport = allReportFiles.length;
      
      if (allReportFiles.length === 0) {
        Logger.log('❌ No files found in report');
        return stats;
      }
      
      // Step 5: Filter files that need processing (systematic approach)
      var filesToProcess = allReportFiles.filter(function(file) {
        return !checkpoint.processedFileIds.has(file.id);
      });
      
      Logger.log('📊 Report Analysis:');
      Logger.log('   Total files in report: ' + allReportFiles.length);
      Logger.log('   Already processed: ' + checkpoint.processedFileIds.size);
      Logger.log('   Need processing: ' + filesToProcess.length);
      Logger.log('   Starting from position: ' + checkpoint.processingPosition);
      
      if (filesToProcess.length === 0) {
        Logger.log('🎉 All files in report have been processed!');
        return stats;
      }
      
      // Step 6: Process files systematically (continue from where we left off)
      var remainingFiles = filesToProcess.slice(checkpoint.processingPosition);
      var filesToProcessNow = remainingFiles.slice(0, BATCH_SIZE);
      
      Logger.log('🔄 Processing ' + filesToProcessNow.length + ' files in this batch...');
      
      for (var i = 0; i < filesToProcessNow.length; i++) {
        // Check execution time limit
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log('⏰ Execution time limit reached - stopping processing');
          break;
        }
        
        var file = filesToProcessNow[i];
        var result = ns.processFileFromReport(file, accessToken);
        
        if (result === 'processed') {
          stats.filesProcessed++;
          checkpoint.processedFileIds.add(file.id);
        } else if (result === 'skipped') {
          stats.filesSkipped++;
          checkpoint.processedFileIds.add(file.id); // Don't reprocess skipped files
        } else {
          stats.filesErrored++;
          // Don't add to processed set - will retry next time
        }
        
        checkpoint.processingPosition++;
        
        // Brief pause between files
        if (i < filesToProcessNow.length - 1) {
          Utilities.sleep(500);
        }
      }
      
      // Step 7: Update checkpoint with progress
      Config.SCRIPT_PROPERTIES.setProperty(REPORT_PROCESSING_CHECKPOINT, JSON.stringify({
        ...checkpoint,
        processedFileIds: Array.from(checkpoint.processedFileIds)
      }));
      
      // Step 8: Calculate completion percentage
      var totalProcessed = checkpoint.processedFileIds.size;
      var completionPercentage = Math.round((totalProcessed / allReportFiles.length) * 100);
      
      stats.executionTimeMs = Date.now() - startTime;
      
      Logger.log('📊 === Processing Batch Complete ===');
      Logger.log('✅ Processed: ' + stats.filesProcessed + ' files');
      Logger.log('⏭️ Skipped: ' + stats.filesSkipped + ' files');
      Logger.log('❌ Errors: ' + stats.filesErrored + ' files');
      Logger.log('📈 Overall Progress: ' + totalProcessed + '/' + allReportFiles.length + ' (' + completionPercentage + '%)');
      Logger.log('⏱️ Execution time: ' + (stats.executionTimeMs / 1000).toFixed(1) + 's');
      
      if (completionPercentage === 100) {
        Logger.log('🎉 🐕 BOXER HAS FINISHED PROCESSING THE ENTIRE REPORT! 🎉');
      } else {
        var remaining = allReportFiles.length - totalProcessed;
        var estimatedRuns = Math.ceil(remaining / BATCH_SIZE);
        Logger.log('🔄 Estimated ' + estimatedRuns + ' more runs needed to complete report');
      }
      
      // Save processing stats
      ns.saveProcessingStats(stats);
      
      return stats;
      
    } catch (error) {
      stats.executionTimeMs = Date.now() - startTime;
      Logger.log('❌ Critical error in report processing: ' + error.toString());
      console.error('Report processing error:', error);
      return stats;
    }
  };
  
  /**
   * Process a single file from the report
   * @param {object} file File object from report
   * @param {string} accessToken Valid Box access token
   * @returns {string} Result: 'processed', 'skipped', or 'error'
   */
  ns.processFileFromReport = function(file, accessToken) {
    if (!file || !file.id || !file.name) {
      Logger.log('❌ Invalid file object');
      return 'error';
    }
    
    try {
      Logger.log('🔄 Processing: ' + file.name + ' (ID: ' + file.id + ')');
      
      // Get full file details from Box
      var fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + file.id + 
                          '?fields=id,name,size,path_collection,created_at,modified_at,parent';
      
      var response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log('❌ Failed to get file details for ' + file.name + ' (HTTP: ' + response.getResponseCode() + ')');
        return 'error';
      }
      
      var fileDetails = JSON.parse(response.getContentText());
      
      // Check if file already has current metadata
      var currentMetadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
      var needsProcessing = !currentMetadata || 
                           currentMetadata.processingStage === Config.PROCESSING_STAGE_UNPROCESSED ||
                           Config.shouldReprocessForBuild(currentMetadata.buildNumber);
      
      if (!needsProcessing) {
        Logger.log('⏭️ Skipping ' + file.name + ' (already processed)');
        return 'skipped';
      }
      
      // Extract comprehensive metadata
      var extractedMetadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      
      // Apply metadata to Box
      var success = BoxFileOperations.applyMetadata(file.id, extractedMetadata, accessToken);
      
      if (success) {
        Logger.log('✅ Successfully processed: ' + file.name);
        return 'processed';
      } else {
        Logger.log('❌ Failed to apply metadata for: ' + file.name);
        return 'error';
      }
      
    } catch (error) {
      Logger.log('❌ Exception processing ' + file.name + ': ' + error.toString());
      return 'error';
    }
  };
  
  /**
   * Save processing statistics
   * @param {object} stats Processing statistics object
   */
  ns.saveProcessingStats = function(stats) {
    try {
      var allStatsStr = Config.SCRIPT_PROPERTIES.getProperty(PROCESSING_STATS_PROPERTY);
      var allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
      
      stats.timestamp = new Date().toISOString();
      allStats.push(stats);
      
      // Keep only last 20 runs
      if (allStats.length > 20) {
        allStats = allStats.slice(-20);
      }
      
      Config.SCRIPT_PROPERTIES.setProperty(PROCESSING_STATS_PROPERTY, JSON.stringify(allStats));
    } catch (error) {
      Logger.log('❌ Error saving processing stats: ' + error.toString());
    }
  };
  
  /**
   * Show recent processing statistics
   */
  ns.showProcessingStats = function() {
    Logger.log('📊 === Recent Boxer Report Processing Stats ===');
    
    try {
      var allStatsStr = Config.SCRIPT_PROPERTIES.getProperty(PROCESSING_STATS_PROPERTY);
      if (!allStatsStr) {
        Logger.log('📋 No processing stats available yet');
        return;
      }
      
      var allStats = JSON.parse(allStatsStr);
      var recentStats = allStats.slice(-10); // Show last 10 runs
      
      recentStats.forEach(function(run, index) {
        var date = new Date(run.timestamp).toLocaleString();
        Logger.log('');
        Logger.log('📅 Run ' + (index + 1) + ' - ' + date);
        Logger.log('  📊 Report Found: ' + (run.reportFound ? '✅' : '❌'));
        Logger.log('  📁 Files in Report: ' + run.filesInReport);
        Logger.log('  ✅ Processed: ' + run.filesProcessed);
        Logger.log('  ⏭️ Skipped: ' + run.filesSkipped);
        Logger.log('  ❌ Errors: ' + run.filesErrored);
        Logger.log('  ⏱️ Time: ' + (run.executionTimeMs / 1000).toFixed(1) + 's');
      });
      
      // Show current checkpoint status
      var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(REPORT_PROCESSING_CHECKPOINT);
      if (checkpointStr) {
        var checkpoint = JSON.parse(checkpointStr);
        var processedCount = checkpoint.processedFileIds ? checkpoint.processedFileIds.length : 0;
        
        Logger.log('');
        Logger.log('📍 Current Checkpoint:');
        Logger.log('  📊 Report: ' + (checkpoint.boxReportName || 'Unknown'));
        Logger.log('  ✅ Files Processed: ' + processedCount);
        Logger.log('  📍 Position: ' + (checkpoint.processingPosition || 0));
        Logger.log('  🕐 Last Updated: ' + (checkpoint.lastUpdated || 'Unknown'));
      }
      
    } catch (error) {
      Logger.log('❌ Error showing stats: ' + error.toString());
    }
  };
  
  /**
   * Reset processing checkpoint (start over)
   */
  ns.resetProcessingCheckpoint = function() {
    Logger.log('🔄 Resetting Boxer processing checkpoint...');
    
    try {
      Config.SCRIPT_PROPERTIES.deleteProperty(REPORT_PROCESSING_CHECKPOINT);
      Logger.log('✅ Processing checkpoint reset - next run will start fresh');
    } catch (error) {
      Logger.log('❌ Error resetting checkpoint: ' + error.toString());
    }
  };
  
  return ns;
})();

// Convenience functions for easy access
function runBoxReportProcessing() {
  return BoxReportManager.runReportBasedProcessing();
}

function showBoxerStats() {
  return BoxReportManager.showProcessingStats();
}

function resetBoxerCheckpoint() {
  return BoxReportManager.resetProcessingCheckpoint();
}