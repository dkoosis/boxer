// File: BoxReportManager.js
// Box report management with queue-based processing
// Depends on: ConfigManager.js, BoxAuth.js, BoxFileOperations.js

/**
 * BoxReportManager - Manages Box weekly reports with queue-based processing
 */
const BoxReportManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Constants
  const MAX_EXECUTION_TIME_MS = 4.5 * 60 * 1000; // 4.5 minutes safety margin
  const QUEUE_SIZE = 2000; // Working queue size
  const BATCH_SIZE = 50; // Files per run
  const QUEUE_FILE_NAME = 'boxer_processing_queue.json';
  const STATS_KEY = 'REPORT_STATS';
  
  /**
   * Build processing queue from latest Box report
   * This should run once weekly when new report arrives
   */
  ns.buildProcessingQueue = function() {
    Logger.log('📋 === Building Processing Queue from Box Report ===');
    const startTime = Date.now();
    
    const accessToken = getValidAccessToken();
    if (!accessToken) return null;
    
    try {
      // Find and download latest report
      const latestReport = findLatestReport(accessToken);
      if (!latestReport) {
        Logger.log('❌ No Box report found');
        return null;
      }
      
      Logger.log(`✅ Found report: ${latestReport.name} from ${latestReport.subfolder}`);
      
      // Download report content
      const reportContent = downloadReportContent(latestReport.id, accessToken);
      if (!reportContent) {
        Logger.log('❌ Failed to download report content');
        return null;
      }
      
      // Parse and filter files
      const allFiles = ns.parseReport(reportContent);
      Logger.log(`📊 Total image files in report: ${allFiles.length}`);
      
      // Filter to files needing processing
      const needsProcessing = allFiles.filter(file => {
        // Skip if already has AI analysis
        if (file.metadata && file.metadata.includes('ai_analyzed')) {
          return false;
        }
        return true;
      });
      
      Logger.log(`🎯 Files needing processing: ${needsProcessing.length}`);
      
      // Get priority folder tree
      const priorityFolderTree = ConfigManager.getProperty('PRIORITY_FOLDER_TREE');
      
      // Sort with priority folders first
      needsProcessing.sort((a, b) => {
        const aPriority = a.path && priorityFolderTree && a.path.includes(priorityFolderTree);
        const bPriority = b.path && priorityFolderTree && b.path.includes(priorityFolderTree);
        
        if (aPriority && !bPriority) return -1;
        if (!aPriority && bPriority) return 1;
        
        // Within same category, newer paths tend to sort later alphabetically
        return b.path.localeCompare(a.path);
      });
      
      // Take first QUEUE_SIZE items
      const queue = needsProcessing.slice(0, QUEUE_SIZE);
      
      Logger.log(`📦 Queue size: ${queue.length} files`);
      if (queue.length > 0) {
        Logger.log(`   First item: ${queue[0].name} (${queue[0].path})`);
        const priorityCount = queue.filter(f => f.path && priorityFolderTree && f.path.includes(priorityFolderTree)).length;
        Logger.log(`   Priority folder files: ${priorityCount}`);
      }
      
      // Save queue to Drive
      const saved = saveQueueToDrive(queue);
      if (!saved) {
        Logger.log('❌ Failed to save queue to Drive');
        return null;
      }
      
      // Save stats
      const stats = {
        reportId: latestReport.id,
        reportDate: latestReport.created_at,
        totalFiles: allFiles.length,
        needsProcessing: needsProcessing.length,
        queueSize: queue.length,
        buildTime: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
      
      ConfigManager.setState(STATS_KEY, stats);
      
      Logger.log('✅ Processing queue built successfully');
      return stats;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'buildProcessingQueue');
      return null;
    }
  };
  
  /**
   * Process next batch from queue
   * This runs every few hours via trigger
   */
  ns.runReportBasedProcessing = function() {
    const startTime = Date.now();
    Logger.log('🐕 === Boxer Queue Processing Started ===');
    
    const accessToken = getValidAccessToken();
    if (!accessToken) return null;
    
    const stats = {
      filesProcessed: 0,
      filesSkipped: 0,
      filesErrored: 0,
      executionTimeMs: 0
    };
    
    try {
      // Load queue from Drive
      const queue = loadQueueFromDrive();
      if (!queue || queue.length === 0) {
        Logger.log('📭 Queue is empty. Run buildProcessingQueue() to create new queue.');
        stats.executionTimeMs = Date.now() - startTime;
        return stats;
      }
      
      Logger.log(`📋 Queue has ${queue.length} files remaining`);
      
      // Process batch
      const batch = queue.splice(0, BATCH_SIZE);
      Logger.log(`🔄 Processing batch of ${batch.length} files`);
      
      for (let i = 0; i < batch.length; i++) {
        // Check execution time
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log('⏰ Execution time limit approaching, stopping batch');
          // Put unprocessed files back
          queue.unshift(...batch.slice(i));
          break;
        }
        
        const file = batch[i];
        const result = ns.processFileFromReport(file, accessToken);
        
        if (result === 'processed') {
          stats.filesProcessed++;
        } else if (result === 'skipped') {
          stats.filesSkipped++;
        } else {
          stats.filesErrored++;
        }
        
        // Log progress every 10 files
        if ((i + 1) % 10 === 0) {
          Logger.log(`Progress: ${i + 1}/${batch.length} files processed`);
        }
      }
      
      // Save updated queue
      saveQueueToDrive(queue);
      Logger.log(`📋 Updated queue: ${queue.length} files remaining`);
      
      stats.executionTimeMs = Date.now() - startTime;
      
      Logger.log('📊 === Processing Complete ===');
      Logger.log(`✅ Processed: ${stats.filesProcessed}`);
      Logger.log(`⏭️ Skipped: ${stats.filesSkipped}`);
      Logger.log(`❌ Errors: ${stats.filesErrored}`);
      Logger.log(`⏱️ Time: ${(stats.executionTimeMs/1000).toFixed(1)}s`);
      
      return stats;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'runReportBasedProcessing');
      stats.executionTimeMs = Date.now() - startTime;
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
      
      // Check if file already has up-to-date metadata
      const currentMetadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
      const finalStages = [ConfigManager.PROCESSING_STAGE_AI, ConfigManager.PROCESSING_STAGE_COMPLETE, ConfigManager.PROCESSING_STAGE_REVIEWED];
      const needsProcessing = !currentMetadata || !finalStages.includes(currentMetadata.processingStage);

      if (!needsProcessing) {
        Logger.log(`⏭️ Skipping ${file.name} (already processed with stage: ${currentMetadata.processingStage})`);
        return 'skipped';
      }
      
      // Extract comprehensive metadata using the orchestration function
      const extractedMetadata = MetadataExtraction.orchestrateFullExtraction(fileDetails, accessToken);
      
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
   * Parse report CSV content
   * @param {string} reportContent CSV content string
   * @returns {object[]} Array of file objects
   */
  ns.parseReport = function(reportContent) {
    Logger.log('📊 Parsing report content...');
    
    try {
      const csvData = Utilities.parseCsv(reportContent);
      
      if (!csvData || csvData.length < 2) {
        Logger.log('⚠️ No data rows found in report');
        return [];
      }
      
      const headers = csvData[0].map(h => h.trim());
      const dataRows = csvData.slice(1);
      
      // Find column indices
      const itemNameIndex = headers.indexOf('Item Name');
      const itemIdIndex = headers.indexOf('Item ID');
      const pathIndex = headers.indexOf('Path');
      const metadataIndex = headers.indexOf('Metadata');
      
      if (itemNameIndex === -1 || itemIdIndex === -1) {
        Logger.log('❌ Report missing required headers');
        return [];
      }
      
      // Filter to processable image files
      const imageFiles = [];
      const processableExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
      
      dataRows.forEach(row => {
        const itemName = row[itemNameIndex] || '';
        const itemId = row[itemIdIndex] || '';
        const path = row[pathIndex] || '';
        const metadata = row[metadataIndex] || '';
        
        // Check if processable image file with valid ID
        const isProcessable = processableExtensions.some(ext => 
          itemName.toLowerCase().endsWith(ext)
        );
        
        if (isProcessable && itemId && /^\d+$/.test(itemId)) {
          imageFiles.push({
            id: itemId,
            name: itemName,
            path: path,
            metadata: metadata,
            hasMetadata: metadata && metadata !== '[]'
          });
        }
      });
      
      Logger.log(`✅ Found ${imageFiles.length} processable image files`);
      return imageFiles;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'parseReport');
      return [];
    }
  };
  
  /**
   * Show processing statistics
   */
  ns.showProcessingStats = function() {
    Logger.log('📊 === Boxer Processing Stats ===');
    
    try {
      const stats = ConfigManager.getState(STATS_KEY);
      if (!stats) {
        Logger.log('No stats available. Run buildProcessingQueue() first.');
        return;
      }
      
      Logger.log(`📅 Last queue built: ${stats.timestamp}`);
      Logger.log(`📄 Report ID: ${stats.reportId}`);
      Logger.log(`📊 Total files in report: ${stats.totalFiles}`);
      Logger.log(`🎯 Files needing processing: ${stats.needsProcessing}`);
      Logger.log(`📦 Queue size: ${stats.queueSize}`);
      
      // Check current queue status
      const queue = loadQueueFromDrive();
      if (queue) {
        Logger.log(`\n📋 Current queue status:`);
        Logger.log(`   Remaining: ${queue.length} files`);
        Logger.log(`   Processed: ${stats.queueSize - queue.length} files`);
        
        if (queue.length > 0) {
          const priorityFolderTree = ConfigManager.getProperty('PRIORITY_FOLDER_TREE');
          if (priorityFolderTree) {
            const priorityCount = queue.filter(f => f.path && f.path.includes(priorityFolderTree)).length;
            Logger.log(`   Priority folder remaining: ${priorityCount}`);
          }
        }
      }
      
    } catch (error) {
      Logger.log(`❌ Error showing stats: ${error.toString()}`);
    }
  };
  
  // Private helper functions
  
  function findLatestReport(accessToken) {
    const rootReportsFolderId = ConfigManager.getProperty('BOX_REPORTS_FOLDER');
    if (!rootReportsFolderId) {
      Logger.log('❌ BOX_REPORTS_FOLDER not configured');
      return null;
    }
    
    try {
      const folderItemsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${rootReportsFolderId}/items?fields=id,name,type,created_at&limit=250&sort=date&direction=DESC`;
      
      const response = UrlFetchApp.fetch(folderItemsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        return null;
      }
      
      const folderItems = JSON.parse(response.getContentText()).entries;
      const reportPrefix = ConfigManager.getProperty('BOX_REPORT_FOLDER_PREFIX');
      const reportSubfolders = folderItems.filter(item => 
        item.type === 'folder' && item.name.startsWith(reportPrefix)
      );
      
      if (reportSubfolders.length === 0) {
        return null;
      }
      
      const latestSubfolder = reportSubfolders[0];
      
      // Look for CSV file in the subfolder
      const subfolderResponse = UrlFetchApp.fetch(
        `${ConfigManager.BOX_API_BASE_URL}/folders/${latestSubfolder.id}/items?fields=id,name,type,created_at&limit=100`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        }
      );
      
      if (subfolderResponse.getResponseCode() !== 200) {
        return null;
      }
      
      const subfolderItems = JSON.parse(subfolderResponse.getContentText()).entries;
      const reportFile = subfolderItems.find(item => 
        item.name.startsWith('folder_and_file_tree_run_on_') && item.name.endsWith('.csv')
      );
      
      if (reportFile) {
        return {
          id: reportFile.id,
          name: reportFile.name,
          created_at: reportFile.created_at,
          subfolder: latestSubfolder.name
        };
      }
      
      return null;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'findLatestReport');
      return null;
    }
  }
  
  function downloadReportContent(reportId, accessToken) {
    try {
      const reportContentUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${reportId}/content`;
      const response = UrlFetchApp.fetch(reportContentUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        return null;
      }
      
      return response.getContentText();
      
    } catch (error) {
      ErrorHandler.reportError(error, 'downloadReportContent', { reportId });
      return null;
    }
  }
  
  function saveQueueToDrive(queue) {
    try {
      const cacheFolderId = ConfigManager.getProperty('BOXER_CACHE_FOLDER');
      if (!cacheFolderId) {
        Logger.log('❌ BOXER_CACHE_FOLDER not configured');
        return false;
      }
      
      const folder = DriveApp.getFolderById(cacheFolderId);
      const queueData = JSON.stringify(queue);
      
      // Check if file exists
      const files = folder.getFilesByName(QUEUE_FILE_NAME);
      if (files.hasNext()) {
        // Update existing file
        const file = files.next();
        file.setContent(queueData);
      } else {
        // Create new file
        folder.createFile(QUEUE_FILE_NAME, queueData, 'application/json');
      }
      
      return true;
      
    } catch (error) {
      ErrorHandler.reportError(error, 'saveQueueToDrive');
      return false;
    }
  }
  
  function loadQueueFromDrive() {
    try {
      const cacheFolderId = ConfigManager.getProperty('BOXER_CACHE_FOLDER');
      if (!cacheFolderId) {
        return null;
      }
      
      const folder = DriveApp.getFolderById(cacheFolderId);
      const files = folder.getFilesByName(QUEUE_FILE_NAME);
      
      if (!files.hasNext()) {
        return null;
      }
      
      const file = files.next();
      const content = file.getBlob().getDataAsString();
      return JSON.parse(content);
      
    } catch (error) {
      ErrorHandler.reportError(error, 'loadQueueFromDrive');
      return null;
    }
  }
  
  return ns;
})();