// File: BoxReportManager.js
// Box report management with proper integration for new Config system
// Depends on: ConfigManager.js, BoxAuth.js, BoxFileOperations.js

/**
 * BoxReportManager - Manages Box weekly reports and systematic file processing
 */
const BoxReportManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Constants
  const MAX_EXECUTION_TIME_MS = 4.5 * 60 * 1000; // 4.5 minutes safety margin
  const BATCH_SIZE = 8;
  const CHECKPOINT_KEY = 'REPORT_CHECKPOINT'; // For Cache Service
  const STATS_KEY = 'REPORT_STATS'; // For Cache Service
  
  /**
   * ReportManager - handles finding and caching Box reports
   */
  const ReportManager = {
    
    /**
     * Find the latest Box report in the reports folder
     * @param {string} accessToken Valid Box access token
     * @returns {object|null} Report info or null if not found
     */
    findLatestReport: function(accessToken) {
      Logger.log('--- Starting Box Report Search ---');
      const rootReportsFolderId = ConfigManager.getProperty('BOX_REPORTS_FOLDER');
      
      if (!rootReportsFolderId) {
        Logger.log('❌ BOX_REPORTS_FOLDER not configured');
        return null;
      }
      
      try {
        // Get folders in the reports directory (sorted by date DESC)
        const folderItemsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${rootReportsFolderId}/items?fields=id,name,type,created_at&limit=250&sort=date&direction=DESC`;
        
        const folderResponse = UrlFetchApp.fetch(folderItemsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
        
        if (folderResponse.getResponseCode() !== 200) {
          Logger.log(`❌ Failed to list reports folder. HTTP: ${folderResponse.getResponseCode()}`);
          return null;
        }
        
        const folderItems = JSON.parse(folderResponse.getContentText()).entries;
        const reportSubfolders = folderItems.filter(function(item) {
          return item.type === 'folder' && item.name.startsWith('Folder and File Tree run on');
        });
        
        if (reportSubfolders.length === 0) {
          Logger.log('❌ No report subfolders found');
          return null;
        }
        
        const latestSubfolder = reportSubfolders[0];
        Logger.log(`✅ Found latest report subfolder: "${latestSubfolder.name}"`);
        
        // Look for CSV file in the subfolder
        const subfolderItemsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${latestSubfolder.id}/items?fields=id,name,type,created_at&limit=100`;
        
        const subfolderResponse = UrlFetchApp.fetch(subfolderItemsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
        
        if (subfolderResponse.getResponseCode() !== 200) {
          Logger.log('❌ Failed to list subfolder contents');
          return null;
        }
        
        const subfolderItems = JSON.parse(subfolderResponse.getContentText()).entries;
        const reportFile = subfolderItems.find(function(item) {
          return item.name.startsWith('folder_and_file_tree_run_on_') && item.name.endsWith('.csv');
        });
        
        if (reportFile) {
          Logger.log(`✅ Found report file: "${reportFile.name}"`);
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
        ErrorHandler.reportError(error, 'ReportManager.findLatestReport');
        return null;
      }
    },
    
    /**
     * Cache report content to Google Drive
     * @param {object} checkpoint Current checkpoint data
     * @param {object} latestReport Report info object
     * @param {string} accessToken Valid Box access token
     * @returns {string|null} Google Drive file ID or null on error
     */
    cacheReportToDrive: function(checkpoint, latestReport, accessToken) {
      Logger.log('📥 Caching report to Google Drive...');

      try {
        // Download report content from Box first
        const reportContentUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${latestReport.id}/content`;
        const reportResponse = UrlFetchApp.fetch(reportContentUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });

        if (reportResponse.getResponseCode() !== 200) {
          Logger.log(`❌ Failed to download report content from Box. HTTP: ${reportResponse.getResponseCode()}`);
          return null;
        }
        const reportContent = reportResponse.getContentText();

        // Delete old cached report if it exists
        if (checkpoint && checkpoint.driveFileId) {
          try {
            DriveApp.getFileById(checkpoint.driveFileId).setTrashed(true);
          } catch (e) {
            Logger.log(`⚠️ Could not delete old cached report: ${e.message}`);
          }
        }

        let folder;
        const cacheFolderId = ConfigManager.getProperty('BOXER_CACHE_FOLDER');
        if (cacheFolderId) {
          try {
            folder = DriveApp.getFolderById(cacheFolderId);
            // Ensure folder is named "Boxer"
            if (folder.getName() !== 'Boxer') {
              folder.setName('Boxer');
            }
          } catch (e) {
            Logger.log('⚠️ Could not access Boxer folder. Using root folder.');
            folder = DriveApp.getRootFolder();
          }
        }

        // Keep the original Box report filename
        const fileName = `boxer_report_cache_${latestReport.id}_${new Date().toISOString().slice(0, 10)}.csv`;
        const driveFile = folder.createFile(fileName, reportContent);
        
        Logger.log(`✅ Report cached to Drive: ${driveFile.getId()}`);
        return driveFile.getId();

      } catch (error) {
        ErrorHandler.reportError(error, 'BoxReportManager.cacheReportToDrive', {
          reportId: latestReport ? latestReport.id : 'unknown'
        });
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
        const reportAgeDays = (new Date() - new Date(reportInfo.created_at)) / (1000 * 60 * 60 * 24);
        if (reportAgeDays > 8) {
          Logger.log(`⚠️ WARNING: Report is ${Math.round(reportAgeDays)} days old`);
        } else {
          Logger.log(`✅ Report age is acceptable (${reportAgeDays.toFixed(1)} days)`);
        }
        
        // Check basic CSV structure
        const lines = reportContent.split('\n');
        if (lines.length < 2) {
          Logger.log('❌ Report appears empty (less than 2 lines)');
          return false;
        }
        
        const header = lines[0] || '';
        const expectedHeaders = ["Path", "Item Name", "Item ID", "Metadata"];
        const hasAllHeaders = expectedHeaders.every(function(h) {
          return header.includes(h);
        });
        
        if (!hasAllHeaders) {
          Logger.log(`❌ Report missing expected headers: ${expectedHeaders.join(', ')}`);
          Logger.log(`📋 Found headers: ${header}`);
          return false;
        }
        
        Logger.log('✅ Report structure validation passed');
        Logger.log(`📊 Report contains ${lines.length - 1} data rows`);
        return true;
        
      } catch (error) {
        Logger.log(`❌ Exception during report verification: ${error.toString()}`);
        return false;
      }
    }
  };

  /**
   * Parse report CSV content using a robust CSV parser to extract image files.
   * @param {string} reportContent CSV content string
   * @returns {object[]} Array of image file objects
   */
  ns.parseReport = function(reportContent) {
    Logger.log('📊 Parsing report content with robust CSV parser...');
    
    try {
      // Use the robust Utilities.parseCsv() which handles commas inside quoted fields.
      const csvData = Utilities.parseCsv(reportContent);
      
      if (!csvData || csvData.length < 2) {
        Logger.log('⚠️ No data rows found in report');
        return [];
      }
      
      const headers = csvData[0].map(function(h) { return h.trim(); });
      const dataRows = csvData.slice(1);
      
      // Find the index of the columns we need
      const itemNameIndex = headers.indexOf('Item Name');
      const itemIdIndex = headers.indexOf('Item ID');
      const pathIndex = headers.indexOf('Path');
      const metadataIndex = headers.indexOf('Metadata');
      const pathIdIndex = headers.indexOf('Path ID');

      if (itemNameIndex === -1 || itemIdIndex === -1 || metadataIndex === -1 || pathIdIndex === -1) {
        Logger.log('❌ Report missing required headers');
        return [];
      }

      Logger.log(`📋 CSV parsed with ${dataRows.length} rows and ${headers.length} columns`);
      Logger.log(`🏷️ Headers found: ${headers.join(', ')}`);
      
      // Filter to only image files
      let imageFiles = [];
      let filesWithMetadataCount = 0;
      
      dataRows.forEach(function(row) {
        const itemName = row[itemNameIndex] || '';
        const itemId = row[itemIdIndex] || '';
        const path = row[pathIndex] || '';
        const metadata = row[metadataIndex] || '';
        const pathId = row[pathIdIndex] || '';
        
        // Check if it's an image file and has a valid ID
        if (itemName && itemId && ConfigManager.isImageFile(itemName) && /^\d+$/.test(itemId)) {
          
          const hasMetadata = metadata && (
            metadata.includes(ConfigManager.getProperty('BOX_IMAGE_METADATA_ID')) ||
            metadata.includes('comprehensiveImageMetadata') // Legacy name
          );
          
          if (hasMetadata) {
            filesWithMetadataCount++;
          }

          // Extract parent folder ID from the path ID string
          let parentId = null;
          if (pathId) {
            const ids = pathId.split('/');
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
            parentId: parentId
          });
        }
      });
      
      let percentageWithMetadata = 0;
      if (imageFiles.length > 0) {
        percentageWithMetadata = (filesWithMetadataCount / imageFiles.length * 100).toFixed(1);
      }
      
      Logger.log(`✅ Parsed ${imageFiles.length} image files from report`);
      Logger.log(`📊 Files with metadata: ${filesWithMetadataCount} (${percentageWithMetadata}%)`);
      Logger.log(`📊 Files without metadata: ${imageFiles.length - filesWithMetadataCount}`);
      
      return imageFiles;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'BoxReportManager.parseReport');
      return [];
    }
  };

  /**
   * Main report processing function
   * @returns {object|null} Processing results or null on error
   */
  ns.runReportBasedProcessing = function() {
    const startTime = Date.now();
    Logger.log('🐕 === Boxer Report-Based Processing Started ===');
    
    const accessToken = getValidAccessToken();
    if (!accessToken) return null;

    // Resolve priority folder to its full path name if configured
    let testFolderPath = '';
    const testFolderId = ConfigManager.getProperty('BOX_PRIORITY_FOLDER');

    if (testFolderId) {
      try {
        const folderDetailsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${testFolderId}?fields=name,path_collection`;
        const folderResponse = UrlFetchApp.fetch(folderDetailsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });

        if (folderResponse.getResponseCode() === 200) {
          const folderDetails = JSON.parse(folderResponse.getContentText());
          const parentPath = folderDetails.path_collection.entries.map(p => p.name).join('/');
          testFolderPath = parentPath ? `${parentPath}/${folderDetails.name}` : folderDetails.name;
          Logger.log(`✅ Priority folder resolved to: "${testFolderPath}"`);
        }
      } catch (e) {
        Logger.log(`⚠️ Could not resolve priority folder: ${e.toString()}`);
      }
    }

    const stats = { reportFound: false, filesInReport: 0, filesProcessed: 0, filesSkipped: 0, filesErrored: 0, executionTimeMs: 0 };
    
    try {
      const latestReport = ReportManager.findLatestReport(accessToken);
      if (!latestReport) return stats;
      stats.reportFound = true;
      
      // Load checkpoint from Cache Service
      let checkpoint = ConfigManager.getState(CHECKPOINT_KEY) || {};
      
      if (checkpoint.boxReportId !== latestReport.id) {
        const newDriveFileId = ReportManager.cacheReportToDrive(checkpoint, latestReport, accessToken);
        if (!newDriveFileId) return stats;
        checkpoint = { 
          boxReportId: latestReport.id, 
          driveFileId: newDriveFileId, 
          processedFileIds: [],
          lastUpdated: new Date().toISOString()
        };
      }
      
      const driveFile = DriveApp.getFileById(checkpoint.driveFileId);
      const reportContent = driveFile.getBlob().getDataAsString();
      if (!ReportManager.verifyReport(latestReport, reportContent)) return stats;
      
      const allReportFiles = ns.parseReport(reportContent);
      stats.filesInReport = allReportFiles.length;
      
      const processedIds = new Set(checkpoint.processedFileIds || []);
      const filesToConsider = allReportFiles.filter(file => !processedIds.has(file.id));
      
      let priorityFiles = [];
      let generalFiles = [];

      if (testFolderPath) {
        filesToConsider.forEach(function(file) {
          if (file.path && (file.path === testFolderPath || (file.path + '/').startsWith(testFolderPath + '/'))) {
            priorityFiles.push(file);
          } else {
            generalFiles.push(file);
          }
        });
        Logger.log(`Found ${priorityFiles.length} files within priority folder: "${testFolderPath}"`);
      } else {
        generalFiles = filesToConsider;
      }

      const prioritizedFiles = priorityFiles.concat(generalFiles);
      Logger.log(`📊 Total: ${allReportFiles.length}, Already Processed: ${processedIds.size}, To Process: ${prioritizedFiles.length}`);
      
      if (prioritizedFiles.length === 0) {
        Logger.log('🎉 No files require processing at this time.');
        return stats;
      }
      
      const filesToProcessNow = prioritizedFiles.slice(0, BATCH_SIZE);
      Logger.log(`🔄 Processing ${filesToProcessNow.length} files in this batch...`);

      for (let i = 0; i < filesToProcessNow.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log('⏰ Execution time limit reached.');
          break;
        }
        const file = filesToProcessNow[i];
        const result = ns.processFileFromReport(file, accessToken);
        checkpoint.processedFileIds.push(file.id);
        if (result === 'processed') stats.filesProcessed++;
        else if (result === 'skipped') stats.filesSkipped++;
        else stats.filesErrored++;
      }
      
      // Save checkpoint to Cache Service
      checkpoint.lastUpdated = new Date().toISOString();
      ConfigManager.setState(CHECKPOINT_KEY, checkpoint);
      
      stats.executionTimeMs = Date.now() - startTime;
      stats.checkpoint = checkpoint; // Return checkpoint for Main.js
      
      Logger.log('📊 === Processing Batch Complete ===');
      Logger.log(`✅ Processed: ${stats.filesProcessed}, ⏭️ Skipped: ${stats.filesSkipped}, ❌ Errors: ${stats.filesErrored}`);
      
      // Save stats
      ns.saveProcessingStats(stats);
      
      return stats;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'runReportBasedProcessing');
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
      Logger.log(`🔄 Processing: ${file.name} (ID: ${file.id})`);
      
      // Get full file details from Box
      const fileDetailsUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${file.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
      
      const response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to get file details for ${file.name} (HTTP: ${response.getResponseCode()})`);
        return 'error';
      }
      
      const fileDetails = JSON.parse(response.getContentText());
      
      // Check if file already has current metadata
      const currentMetadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
      const needsProcessing = !currentMetadata || 
                           currentMetadata.processingStage === ConfigManager.PROCESSING_STAGE_UNPROCESSED ||
                           currentMetadata.buildNumber !== ConfigManager.BUILD_NUMBER;
      
      if (!needsProcessing) {
        Logger.log(`⏭️ Skipping ${file.name} (already processed)`);
        return 'skipped';
      }
      
      // Extract comprehensive metadata
      const extractedMetadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      
      // Apply metadata to Box
      const success = BoxFileOperations.applyMetadata(file.id, extractedMetadata, accessToken);
      
      if (success) {
        Logger.log(`✅ Successfully processed: ${file.name}`);
        return 'processed';
      } else {
        Logger.log(`❌ Failed to apply metadata for: ${file.name}`);
        return 'error';
      }
      
    } catch (error) {
      ErrorHandler.reportError(error, 'processFileFromReport', { fileId: file.id });
      return 'error';
    }
  };
  
  /**
   * Save processing statistics
   * @param {object} stats Processing statistics object
   */
  ns.saveProcessingStats = function(stats) {
    try {
      // Save to tracking sheet if configured
      const sheetId = ConfigManager.getProperty('BOXER_TRACKING_SHEET');
      if (sheetId) {
        const sheet = SpreadsheetApp.openById(sheetId)
          .getSheetByName(ConfigManager.PROCESSING_STATS_SHEET_NAME);
        
        if (sheet) {
          sheet.appendRow([
            new Date().toISOString(),
            'Report Processing',
            stats.filesInReport || 0,
            stats.filesProcessed || 0,
            stats.filesSkipped || 0,
            stats.filesErrored || 0,
            (stats.executionTimeMs || 0) / 1000,
            ConfigManager.BUILD_NUMBER
          ]);
        }
      }
      
      // Also save recent stats to cache
      let recentStats = ConfigManager.getState(STATS_KEY) || [];
      stats.timestamp = new Date().toISOString();
      recentStats.push(stats);
      
      // Keep only last 20 runs
      if (recentStats.length > 20) {
        recentStats = recentStats.slice(-20);
      }
      
      ConfigManager.setState(STATS_KEY, recentStats);
      
    } catch (error) {
      Logger.log(`❌ Error saving processing stats: ${error.toString()}`);
    }
  };
  
  /**
   * Show recent processing statistics
   */
  ns.showProcessingStats = function() {
    Logger.log('📊 === Recent Boxer Report Processing Stats ===');
    
    try {
      const recentStats = ConfigManager.getState(STATS_KEY) || [];
      
      if (recentStats.length === 0) {
        Logger.log('📋 No processing stats available yet');
        return;
      }
      
      recentStats.slice(-10).forEach(function(run, index) {
        const date = new Date(run.timestamp).toLocaleString();
        Logger.log('');
        Logger.log(`📅 Run ${index + 1} - ${date}`);
        Logger.log(`  📊 Report Found: ${run.reportFound ? '✅' : '❌'}`);
        Logger.log(`  📁 Files in Report: ${run.filesInReport}`);
        Logger.log(`  ✅ Processed: ${run.filesProcessed}`);
        Logger.log(`  ⏭️ Skipped: ${run.filesSkipped}`);
        Logger.log(`  ❌ Errors: ${run.filesErrored}`);
        Logger.log(`  ⏱️ Time: ${(run.executionTimeMs / 1000).toFixed(1)}s`);
      });
      
      // Show current checkpoint status
      const checkpoint = ConfigManager.getState(CHECKPOINT_KEY);
      if (checkpoint) {
        const processedCount = checkpoint.processedFileIds ? checkpoint.processedFileIds.length : 0;
        
        Logger.log('');
        Logger.log('📍 Current Checkpoint:');
        Logger.log(`  📊 Report ID: ${checkpoint.boxReportId}`);
        Logger.log(`  ✅ Files Processed: ${processedCount}`);
        Logger.log(`  🕐 Last Updated: ${checkpoint.lastUpdated}`);
      }
      
    } catch (error) {
      Logger.log(`❌ Error showing stats: ${error.toString()}`);
    }
  };
  
  /**
   * Reset processing checkpoint (start over)
   */
  ns.resetProcessingCheckpoint = function() {
    Logger.log('🔄 Resetting Boxer processing checkpoint...');
    
    try {
      // Clear from Cache Service
      CacheService.getScriptCache().remove(CHECKPOINT_KEY);
      Logger.log('✅ Processing checkpoint reset - next run will start fresh');
    } catch (error) {
      Logger.log(`❌ Error resetting checkpoint: ${error.toString()}`);
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