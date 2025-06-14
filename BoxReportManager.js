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
/**
 * Cache report content to Google Drive using bmFiddler and robust retries.
 * @param {object} checkpoint Current checkpoint data
 * @param {object} latestReport Report info object
 * @param {string} accessToken Valid Box access token
 * @returns {string|null} Google Drive file ID or null on error
 */
cacheReportToDrive: function(checkpoint, latestReport, accessToken) {
  Logger.log('📥 Caching report to Google Drive with retry logic...');

  try {
    // Download report content from Box first
    var reportContentUrl = Config.BOX_API_BASE_URL + '/files/' + latestReport.id + '/content';
    var reportResponse = UrlFetchApp.fetch(reportContentUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });

    if (reportResponse.getResponseCode() !== 200) {
      Logger.log('❌ Failed to download report content from Box. HTTP: ' + reportResponse.getResponseCode());
      return null;
    }
    var reportContent = reportResponse.getContentText();

    // --- IMPROVED FOLDER HANDLING WITH RETRY MECHANISM ---
    // Use cUseful to automatically retry the block of code on transient errors
    var utils = cUseful; // The cUseful library is already a project dependency
    var newDriveFileId = utils.rateLimitExpBackoff(function() {
      // Delete old cached report if it exists
      if (checkpoint && checkpoint.driveFileId) {
        try {
          DriveApp.getFileById(checkpoint.driveFileId).setTrashed(true);
        } catch (e) {
          // Non-critical error, log and continue
          Logger.log('⚠️ Could not delete old cached report (may have been deleted manually): ' + e.message);
        }
      }

      var folder;
      var cacheFolderId = Config.DRIVE_CACHE_FOLDER_ID;
      if (cacheFolderId) {
        try {
          folder = DriveApp.getFolderById(cacheFolderId);
        } catch (e) {
          Logger.log('⚠️ Could not access configured DRIVE_CACHE_FOLDER_ID (' + cacheFolderId + '). Error: ' + e.message);
          Logger.log('📂 Falling back to root Drive folder.');
          folder = DriveApp.getRootFolder();
        }
      } else {
        folder = DriveApp.getRootFolder();
      }

      var fileName = 'boxer_report_cache_' + latestReport.id + '_' + new Date().toISOString().slice(0, 10) + '.csv';
      var driveFile = folder.createFile(fileName, reportContent);
      
      // If any of the DriveApp calls above fail with a transient error,
      // cUseful.rateLimitExpBackoff will automatically wait and retry.

      return driveFile.getId();
    });
    // --- END OF IMPROVEMENT ---

    if (newDriveFileId) {
        Logger.log('✅ Report cached to Drive: (ID: ' + newDriveFileId + ')');
    }
    
    return newDriveFileId;

  } catch (error) {
    var errorMessage = '❌ Exception caching report: ' + error.toString();
    Logger.log(errorMessage);
    if (typeof ErrorHandler !== 'undefined' && ErrorHandler.reportError) {
      ErrorHandler.reportError(error, 'BoxReportManager.ReportManager.cacheReportToDrive', {
        reportId: latestReport ? latestReport.id : 'unknown',
        reportName: latestReport ? latestReport.name : 'unknown'
      });
    }
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
 * Main report processing function - uses an API call to resolve the test folder ID to its
 * full path name for robust, accurate tree prioritization.
 * @returns {object|null} Processing results or null on error
 */
ns.runReportBasedProcessing = function() {
  var startTime = Date.now();
  Logger.log('🐕 === Boxer Report-Based Processing Started (API Resolved Path Priority) ===');
  
  var accessToken = getValidAccessToken();
  if (!accessToken) return null;

  // --- Resolve ACTIVE_TEST_FOLDER_ID to its full path name ---
  var testFolderPath = '';
  var testFolderId = Config.ACTIVE_TEST_FOLDER_ID;

  if (testFolderId && testFolderId !== '0') {
    try {
      // API call to get the folder's name and its parent hierarchy (path_collection)
      var folderDetailsUrl = Config.BOX_API_BASE_URL + '/folders/' + testFolderId + '?fields=name,path_collection';
      var folderResponse = UrlFetchApp.fetch(folderDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });

      if (folderResponse.getResponseCode() === 200) {
        var folderDetails = JSON.parse(folderResponse.getContentText());
        
        // Construct the full path by joining the names of all parent folders
        var parentPath = folderDetails.path_collection.entries.map(p => p.name).join('/');
        
        // Append the actual folder's name to create the complete path
        testFolderPath = parentPath ? `${parentPath}/${folderDetails.name}` : folderDetails.name;

        Logger.log(`✅ Successfully resolved Test Folder ID ${testFolderId} to path: "${testFolderPath}"`);
      } else {
        Logger.log(`⚠️ Could not resolve folder ID ${testFolderId} to a path. Prioritization will be skipped. HTTP: ${folderResponse.getResponseCode()}`);
      }
    } catch (e) {
      Logger.log(`⚠️ Error resolving folder ID to path: ${e.toString()}`);
    }
  }
  // --- END ---

  var stats = { reportFound: false, filesInReport: 0, filesProcessed: 0, filesSkipped: 0, filesErrored: 0, executionTimeMs: 0 };
  
  try {
    var latestReport = ReportManager.findLatestReport(accessToken);
    if (!latestReport) return stats;
    stats.reportFound = true;
    
    var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(REPORT_PROCESSING_CHECKPOINT);
    var checkpoint = checkpointStr ? JSON.parse(checkpointStr) : {};
    
    if (checkpoint.boxReportId !== latestReport.id) {
      var newDriveFileId = ReportManager.cacheReportToDrive(checkpoint, latestReport, accessToken);
      if (!newDriveFileId) return stats;
      checkpoint = { boxReportId: latestReport.id, driveFileId: newDriveFileId, processedFileIds: [] };
    }
    
    var driveFile = DriveApp.getFileById(checkpoint.driveFileId);
    var reportContent = driveFile.getBlob().getDataAsString();
    if (!ReportManager.verifyReport(latestReport, reportContent)) return stats;
    
    var allReportFiles = ns.parseReport(reportContent);
    stats.filesInReport = allReportFiles.length;
    
    var processedIds = new Set(checkpoint.processedFileIds || []);
    var filesToConsider = allReportFiles.filter(file => !processedIds.has(file.id));
    
    var priorityFiles = [];
    var generalFiles = [];

    if (testFolderPath) {
      filesToConsider.forEach(function(file) {
        // Match if the file's path is the target folder or a subfolder within it.
        if (file.path && (file.path === testFolderPath || (file.path + '/').startsWith(testFolderPath + '/'))) {
          priorityFiles.push(file);
        } else {
          generalFiles.push(file);
        }
      });
      Logger.log(`Found ${priorityFiles.length} files within the priority test folder path: "${testFolderPath}".`);
    } else {
      Logger.log('⚠️ Test folder path could not be determined. Skipping prioritization.');
      generalFiles = filesToConsider;
    }

    var prioritizedFiles = priorityFiles.concat(generalFiles);
    Logger.log(`📊 Report Analysis: Total: ${allReportFiles.length}, Already Processed: ${processedIds.size}, Needing Processing: ${prioritizedFiles.length}`);
    
    if (prioritizedFiles.length === 0) {
        Logger.log('🎉 No files require processing at this time.');
        return stats;
    }
    
    var filesToProcessNow = prioritizedFiles.slice(0, BATCH_SIZE);
    Logger.log(`🔄 Processing ${filesToProcessNow.length} files in this batch...`);

    for (var i = 0; i < filesToProcessNow.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
            Logger.log('⏰ Execution time limit reached.');
            break;
        }
        var file = filesToProcessNow[i];
        var result = ns.processFileFromReport(file, accessToken);
        checkpoint.processedFileIds.push(file.id);
        if (result === 'processed') stats.filesProcessed++;
        else if (result === 'skipped') stats.filesSkipped++;
        else stats.filesErrored++;
    }
    
    Config.SCRIPT_PROPERTIES.setProperty(REPORT_PROCESSING_CHECKPOINT, JSON.stringify(checkpoint));
    stats.executionTimeMs = Date.now() - startTime;
    Logger.log('📊 === Processing Batch Complete ===');
    Logger.log(`✅ Processed: ${stats.filesProcessed}, ⏭️ Skipped: ${stats.filesSkipped}, ❌ Errors: ${stats.filesErrored}`);
    return stats;
    
  } catch (error) {
    Logger.log(`❌ Critical error in report processing: ${error.toString()}`);
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
/**
 * A temporary diagnostic function to inspect the headers and data of the cached Box report.
 * This will help us understand exactly how to parse the 'Path ID' column.
 */
function debugReportHeaders() {
  try {
    Logger.log('--- Starting Report Header and Data Diagnostic ---');
    
    // Get the ID of the cached report file from the checkpoint
    var checkpointStr = PropertiesService.getScriptProperties().getProperty('BOXER_REPORT_CHECKPOINT');
    if (!checkpointStr) {
      Logger.log('ERROR: No report checkpoint found. Please run the main processing script once to generate it.');
      return;
    }
    var checkpoint = JSON.parse(checkpointStr);
    var driveFileId = checkpoint.driveFileId;
    if (!driveFileId) {
      Logger.log('ERROR: Checkpoint found, but it does not contain a Google Drive file ID for the cached report.');
      return;
    }
    
    Logger.log('Reading cached report from Google Drive file ID: ' + driveFileId);
    var driveFile = DriveApp.getFileById(driveFileId);
    var reportContent = driveFile.getBlob().getDataAsString();
    
    // Get the first 5 lines to show the raw text
    var lines = reportContent.split('\n').slice(0, 5);
    
    Logger.log('\n--- First 5 Lines of Raw Report Text ---');
    lines.forEach((line, index) => {
      Logger.log(`Line ${index + 1}: ${line}`);
    });
    Logger.log('-------------------------------------------\n');
    
    // Parse the entire CSV to inspect how Apps Script sees the headers
    var csvData = Utilities.parseCsv(reportContent);
    
    var headers = csvData[0];
    Logger.log('--- Parsed Headers (as seen by the script) ---');
    headers.forEach((header, index) => {
      Logger.log(`Header[${index}]: "${header}"`);
    });
    Logger.log('-----------------------------------------------\n');
    
    // Find the "Path ID" column and log its index and content for a few rows
    var pathIdIndex = -1;
    headers.forEach((h, i) => {
        if(h.trim() === 'Path ID') {
            pathIdIndex = i;
        }
    });
    
    if (pathIdIndex === -1) {
      Logger.log('>>> CRITICAL ERROR: Could not find a header exactly named "Path ID". This is the root cause of the problem.');
    } else {
      Logger.log(`>>> SUCCESS: Found "Path ID" header at column index: ${pathIdIndex}`);
      Logger.log('\n--- Sample "Path ID" Data from First 5 Rows ---');
      for (let i = 1; i < Math.min(6, csvData.length); i++) {
        Logger.log(`Row ${i + 1} Path ID: "${csvData[i][pathIdIndex]}"`);
      }
      Logger.log('--------------------------------------------------');
    }
    
  } catch (e) {
    Logger.log('An error occurred during the diagnostic: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
  }
}

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
/**
 * Reads the ACTIVE_TEST_FOLDER_ID from Config.js, resolves it to a full
 * path name via the Box API, and logs the result.
 */
function logResolvedTestFolderPath() {
  try {
    Logger.log('--- Starting Test Folder Path Resolution ---');

    // 1. Get Access Token
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('ERROR: Could not get a valid access token. Please ensure Box authentication is complete.');
      return;
    }
    Logger.log('Successfully retrieved access token.');

    // 2. Get the Folder ID from your Config.js file
    var testFolderId = Config.ACTIVE_TEST_FOLDER_ID;
    if (!testFolderId || testFolderId === '0') {
      Logger.log('No active test folder ID is set in Config.js.');
      return;
    }
    Logger.log('Attempting to resolve ID from Config.js: "' + testFolderId + '"');

    // 3. Make API call to get folder details
    var folderDetailsUrl = Config.BOX_API_BASE_URL + '/folders/' + testFolderId + '?fields=name,path_collection';
    Logger.log('Requesting URL: ' + folderDetailsUrl);

    var response = UrlFetchApp.fetch(folderDetailsUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });

    var responseCode = response.getResponseCode();
    var responseText = response.getContentText();

    Logger.log('API Response Code: ' + responseCode);

    // 4. Parse response and construct path
    if (responseCode === 200) {
      var folderDetails = JSON.parse(responseText);
      var folderName = folderDetails.name;
      
      // The path_collection contains all parent folders. We join their names.
      var parentPath = folderDetails.path_collection.entries.map(p => p.name).join('/');
      
      // The full path is the path of the parents plus the folder's own name.
      var fullPath = parentPath ? (parentPath + '/' + folderName) : folderName;

      Logger.log('--- S U C C E S S ---');
      Logger.log('Resolved Path String: "' + fullPath + '"');
      Logger.log('-----------------------');
      Logger.log('The script will use this exact string to match against the "Path" column from your report.');

    } else {
      Logger.log('--- F A I L U R E ---');
      Logger.log('Could not resolve the folder ID. The API returned an error.');
      Logger.log('Response: ' + responseText);
      Logger.log('-----------------------');
    }

  } catch (e) {
    Logger.log('An unexpected error occurred: ' + e.toString());
  }
}