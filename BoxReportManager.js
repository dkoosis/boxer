// File: BoxReportManager.js
// Box report management with an intelligent caching strategy and dynamic, time-based batching.
// Depends on: ConfigManager.js, BoxAuth.js, BoxFileOperations.js

const BoxReportManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Constants
  const MAX_EXECUTION_TIME_MS = 4.5 * 60 * 1000; // 4.5 minutes safety margin
  const CHECKPOINT_KEY = 'REPORT_CHECKPOINT';
  const STATS_KEY = 'REPORT_STATS';

  /**
   * Main report processing function. Orchestrates finding, ingesting, and processing files.
   * @returns {object|null} Processing results or null on error.
   */
  ns.runReportBasedProcessing = function() {
    const startTime = Date.now();
    Logger.log('🐕 === Boxer Report-Based Processing Started ===');

    const accessToken = getValidAccessToken();
    if (!accessToken) return null;

    let stats = {
        reportFound: false,
        filesInReport: 0,
        filesProcessed: 0,
        filesSkipped: 0,
        filesErrored: 0,
        executionTimeMs: 0
    };

    try {
      let checkpoint = ConfigManager.getState(CHECKPOINT_KEY) || {};
      const latestReport = ReportManager.findLatestReport(accessToken);

      if (!latestReport) {
        Logger.log('No new reports found. Ending run.');
        return { ...stats, executionTimeMs: Date.now() - startTime };
      }
      stats.reportFound = true;
      
      let allReportObjects;

      // If the report is new OR if the checkpoint is old and missing a JSON cache file, run ingestion.
      if (checkpoint.boxReportId !== latestReport.id || !checkpoint.jsonCacheFileId) {
        Logger.log('✨ New report detected or JSON cache is missing. Starting one-time ingestion process...');
        const ingestionResult = ReportManager.ingestNewReport(latestReport, accessToken);
        if (!ingestionResult) {
            throw new Error("Failed to ingest the new report.");
        }
        allReportObjects = ingestionResult.objects;
        
        // Create a new checkpoint tied to the newly ingested report and its JSON cache
        checkpoint = {
            boxReportId: latestReport.id,
            jsonCacheFileId: ingestionResult.jsonCacheFileId,
            processedFileIds: [],
            lastUpdated: new Date().toISOString()
        };
        Logger.log(`✅ Ingestion complete. Using new JSON cache file: ${checkpoint.jsonCacheFileId}`);

      } else {
        // Load the already-processed objects from the JSON cache file
        Logger.log(`✅ Using existing JSON cache file from Drive: ${checkpoint.jsonCacheFileId}`);
        const jsonCacheFile = DriveApp.getFileById(checkpoint.jsonCacheFileId);
        const jsonString = jsonCacheFile.getBlob().getDataAsString();
        allReportObjects = JSON.parse(jsonString);
        Logger.log(`✅ Loaded ${allReportObjects.length} file objects from JSON cache.`);
      }

      stats.filesInReport = allReportObjects.length;
      const filesToProcess = _getFilesToProcess(checkpoint, allReportObjects, accessToken);

      if (filesToProcess.length === 0) {
          Logger.log('🎉 No new files require processing at this time.');
          stats.executionTimeMs = Date.now() - startTime;
          return stats;
      }
      
      const processingResult = _processBatch(filesToProcess, accessToken, startTime);
      
      stats.filesProcessed = processingResult.processed;
      stats.filesSkipped = processingResult.skipped;
      stats.filesErrored = processingResult.errored;
      
      _saveCheckpoint(checkpoint, processingResult.processedIds);

      stats.executionTimeMs = Date.now() - startTime;
      stats.checkpoint = checkpoint;

      Logger.log('📊 === Processing Batch Complete ===');
      Logger.log(`✅ Processed: ${stats.filesProcessed}, ⏭️ Skipped: ${stats.filesSkipped}, ❌ Errors: ${stats.filesErrored}`);
      
      ns.saveProcessingStats(stats);
      return stats;

    } catch (error) {
      ErrorHandler.reportError(error, 'runReportBasedProcessing');
      stats.executionTimeMs = Date.now() - startTime;
      return stats;
    }
  };
  
  /**
   * ReportManager - handles finding, caching, and ingesting Box reports
   */
  const ReportManager = {
    /**
     * Finds the latest Box report file info.
     * @param {string} accessToken - Valid Box access token.
     * @returns {object|null} Report file object or null.
     */
    findLatestReport: function(accessToken) {
        Logger.log('--- Starting Box Report Search ---');
        const rootReportsFolderId = ConfigManager.getProperty('BOX_REPORTS_FOLDER');
        if (!rootReportsFolderId) {
            Logger.log('❌ BOX_REPORTS_FOLDER not configured');
            return null;
        }
        try {
            const folderItemsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${rootReportsFolderId}/items?fields=id,name,type,created_at&limit=250&sort=date&direction=DESC`;
            const folderResponse = UrlFetchApp.fetch(folderItemsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
            if (folderResponse.getResponseCode() !== 200) return null;

            const folderItems = JSON.parse(folderResponse.getContentText()).entries;
            const reportPrefix = ConfigManager.getProperty('BOX_REPORT_FOLDER_PREFIX');
            const reportSubfolder = folderItems.find(item => item.type === 'folder' && item.name.startsWith(reportPrefix));
            if (!reportSubfolder) {
                Logger.log('No report subfolders found matching the prefix.');
                return null;
            }
            
            Logger.log(`✅ Found latest report subfolder: "${reportSubfolder.name}"`);

            const subfolderItemsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${reportSubfolder.id}/items?fields=id,name,type,created_at&limit=100`;
            const subfolderResponse = UrlFetchApp.fetch(subfolderItemsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
            if (subfolderResponse.getResponseCode() !== 200) return null;

            const subfolderItems = JSON.parse(subfolderResponse.getContentText()).entries;
            const reportFile = subfolderItems.find(item => item.name.endsWith('.csv'));
            if (reportFile) {
                Logger.log(`✅ Found report file: "${reportFile.name}"`);
                return reportFile;
            }
            return null;
        } catch (error) {
            ErrorHandler.reportError(error, 'ReportManager.findLatestReport');
            return null;
        }
    },

    /**
     * Handles the one-time ingestion of a new weekly report.
     * @param {object} latestReport - The file object for the new report from Box.
     * @param {string} accessToken - Valid Box access token.
     * @returns {object|null} Object containing the parsed objects and the new JSON cache file ID.
     */
    ingestNewReport: function(latestReport, accessToken) {
        try {
            const reportContentUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${latestReport.id}/content`;
            const reportResponse = UrlFetchApp.fetch(reportContentUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
            if (reportResponse.getResponseCode() !== 200) {
                Logger.log(`❌ Failed to download report content from Box. HTTP: ${reportResponse.getResponseCode()}`);
                return null;
            }
            const reportContent = reportResponse.getContentText();
            Logger.log('✅ Downloaded new weekly report CSV from Box.');

            const parsedObjects = ns.parseReport(reportContent);
            if (!parsedObjects) throw new Error('Parsing the report content returned null or empty.');
            Logger.log(`✅ Parsed ${parsedObjects.length} objects from CSV.`);

            const cacheFolderId = ConfigManager.getProperty('BOXER_CACHE_FOLDER');
            const folder = DriveApp.getFolderById(cacheFolderId);
            const jsonString = JSON.stringify(parsedObjects);
            const jsonFileName = `boxer_report_cache_${latestReport.id}.json`;

            const oldFiles = folder.getFiles();
            while(oldFiles.hasNext()){
              const file = oldFiles.next();
              if (file.getName().startsWith('boxer_report_cache_')) {
                file.setTrashed(true);
              }
            }

            const jsonCacheFile = folder.createFile(jsonFileName, jsonString, MimeType.PLAIN_TEXT);
            const jsonCacheFileId = jsonCacheFile.getId();
            Logger.log(`✅ Saved processed objects to new JSON cache file in Drive: ${jsonFileName}`);

            return {
                objects: parsedObjects,
                jsonCacheFileId: jsonCacheFileId
            };
        } catch (error) {
            ErrorHandler.reportError(error, 'ReportManager.ingestNewReport', { reportId: latestReport.id });
            return null;
        }
    }
  };

  /**
   * Parses the raw CSV string content into an array of structured file objects.
   * @param {string} reportContent - The raw CSV data as a string.
   * @returns {object[]} An array of file objects.
   */
  ns.parseReport = function(reportContent) {
    Logger.log('...Parsing raw CSV content into structured objects...');
    try {
        const csvData = Utilities.parseCsv(reportContent);
        if (!csvData || csvData.length < 2) return [];

        const headers = csvData[0].map(h => h.trim());
        const dataRows = csvData.slice(1);
        
        const itemNameIndex = headers.indexOf('Item Name');
        const itemIdIndex = headers.indexOf('Item ID');
        const pathIndex = headers.indexOf('Path');
        const metadataIndex = headers.indexOf('Metadata');
        const pathIdIndex = headers.indexOf('Path ID');

        if ([itemNameIndex, itemIdIndex, metadataIndex, pathIdIndex].includes(-1)) {
            Logger.log('❌ Report missing required headers');
            return [];
        }

        const imageFiles = [];
        const totalRows = dataRows.length;
        let lastLoggedPercent = -1;

        dataRows.forEach((row, index) => {
            // --- NEW: Progress Logging ---
            const currentPercent = Math.floor(((index + 1) / totalRows) * 100);
            if (currentPercent % 10 === 0 && currentPercent > lastLoggedPercent) {
              Logger.log(`...Ingestion progress: ${currentPercent}% (${index + 1} / ${totalRows} rows processed)...`);
              lastLoggedPercent = currentPercent;
            }
            // --------------------------

            const itemId = row[itemIdIndex] || '';
            if (itemId && /^\d+$/.test(itemId)) {
                const metadata = row[metadataIndex] || '';
                const pathId = row[pathIdIndex] || '';
                let parentId = null;
                if (pathId) {
                    const ids = pathId.split('/');
                    if (ids.length >= 2) parentId = ids[ids.length - 2];
                }
                
                imageFiles.push({
                    id: itemId,
                    name: row[itemNameIndex] || '',
                    path: row[pathIndex] || '',
                    hasMetadata: metadata.includes(ConfigManager.getProperty('BOX_IMAGE_METADATA_ID')),
                    parentId: parentId
                });
            }
        });
        return imageFiles;
    } catch (error) {
        ErrorHandler.reportError(error, 'BoxReportManager.parseReport');
        return [];
    }
  };
  
  /**
   * Takes the full list of objects and prepares the queue for the current run.
   * @param {object} checkpoint - The current checkpoint object.
   * @param {object[]} allReportObjects - The full array of file objects from the JSON cache.
   * @param {string} accessToken - Valid Box access token.
   * @returns {object[]} The prioritized list of file objects to process.
   */
  function _getFilesToProcess(checkpoint, allReportObjects, accessToken) {
      const processedIds = new Set(checkpoint.processedFileIds || []);
      const filesToConsider = allReportObjects.filter(file => !processedIds.has(file.id));

      const filesWithoutMetadata = [];
      const filesWithMetadata = [];
      filesToConsider.forEach(file => {
          if (file.hasMetadata) {
              filesWithMetadata.push(file);
          } else {
              filesWithoutMetadata.push(file);
          }
      });

      const prioritizedFiles = filesWithoutMetadata.concat(filesWithMetadata);
      Logger.log(`ℹ️ Prioritizing ${filesWithoutMetadata.length} unprocessed files. ${filesWithMetadata.length} files with existing metadata will be checked for updates later.`);
      
      const testFolderId = ConfigManager.getProperty('BOX_PRIORITY_FOLDER');
      if (testFolderId) {
          try {
              const folderDetailsUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${testFolderId}?fields=name,path_collection`;
              const folderResponse = UrlFetchApp.fetch(folderDetailsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
              if (folderResponse.getResponseCode() === 200) {
                  const folderDetails = JSON.parse(folderResponse.getContentText());
                  const parentPath = folderDetails.path_collection.entries.map(p => p.name).join('/');
                  const testFolderPath = parentPath ? `${parentPath}/${folderDetails.name}` : folderDetails.name;
                  Logger.log(`✅ Priority folder resolved to: "${testFolderPath}"`);

                  const priorityBucket = prioritizedFiles.filter(file => file.path && (file.path === testFolderPath || (file.path + '/').startsWith(testFolderPath + '/')));
                  const generalBucket = prioritizedFiles.filter(file => !priorityBucket.includes(file));

                  Logger.log(`Found ${priorityBucket.length} files within the priority folder.`);
                  return priorityBucket.concat(generalBucket);
              }
          } catch (e) { 
              Logger.log(`⚠️ Could not resolve priority folder path: ${e.toString()}`);
          }
      }
      
      return prioritizedFiles;
  }

  /**
   * Processes a dynamic number of files based on available execution time.
   * @param {object[]} filesToProcess - The full queue of files for this run.
   * @param {string} accessToken - Valid Box access token.
   * @param {number} startTime - The script's start time, to manage execution limits.
   * @returns {object} An object with stats for the processed batch.
   */
  function _processBatch(filesToProcess, accessToken, startTime) {
      Logger.log(`🔄 Processing up to as many files as possible from ${filesToProcess.length} pending...`);
      const results = { processed: 0, skipped: 0, errored: 0, processedIds: [] };

      for (const file of filesToProcess) {
          if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
              Logger.log('⏰ Execution time limit reached. Stopping batch to ensure safe exit.');
              break;
          }
          const result = ns.processFileFromReport(file, accessToken);
          results.processedIds.push(file.id);
          if (result === 'processed') results.processed++;
          else if (result === 'skipped') results.skipped++;
          else results.errored++;
      }
      return results;
  }

  /**
   * Saves the updated checkpoint to the script cache.
   * @param {object} checkpoint - The checkpoint object to save.
   * @param {string[]} newProcessedIds - The list of file IDs from the batch that was just run.
   */
  function _saveCheckpoint(checkpoint, newProcessedIds) {
      checkpoint.processedFileIds.push(...newProcessedIds);
      checkpoint.lastUpdated = new Date().toISOString();
      ConfigManager.setState(CHECKPOINT_KEY, checkpoint);
  }

  /**
   * Processes a single file from the report.
   * @param {object} file - File object from the processing queue.
   * @param {string} accessToken - Valid Box access token.
   * @returns {string} Result: 'processed', 'skipped', or 'error'.
   */
  ns.processFileFromReport = function(file, accessToken) {
    if (!file || !file.id || !file.name) {
      Logger.log('❌ Invalid file object');
      return 'error';
    }
    
    try {
      Logger.log(`🔄 Processing: ${file.name} (ID: ${file.id})`);
      
      const fileDetailsUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${file.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
      const response = UrlFetchApp.fetch(fileDetailsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to get file details for ${file.name} (HTTP: ${response.getResponseCode()})`);
        return 'error';
      }
      const fileDetails = JSON.parse(response.getContentText());
      
      const currentMetadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
      const finalStages = [ConfigManager.PROCESSING_STAGE_AI, ConfigManager.PROCESSING_STAGE_COMPLETE, ConfigManager.PROCESSING_STAGE_REVIEWED];
      const needsProcessing = !currentMetadata || !finalStages.includes(currentMetadata.processingStage);

      if (!needsProcessing) {
        Logger.log(`⏭️ Skipping ${file.name} (already processed with stage: ${currentMetadata.processingStage})`);
        return 'skipped';
      }
      
      const extractedMetadata = MetadataExtraction.orchestrateFullExtraction(fileDetails, accessToken);
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
   * Saves processing statistics to the cache and optionally to a Google Sheet.
   * @param {object} stats - Processing statistics object.
   */
  ns.saveProcessingStats = function(stats) {
    try {
      const sheetId = ConfigManager.getProperty('BOXER_TRACKING_SHEET');
      if (sheetId) {
        const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(ConfigManager.PROCESSING_STATS_SHEET_NAME);
        if (sheet) {
          sheet.appendRow([
            new Date().toISOString(), 'Report Processing', stats.filesInReport || 0,
            stats.filesProcessed || 0, stats.filesSkipped || 0, stats.filesErrored || 0,
            (stats.executionTimeMs || 0) / 1000
          ]);
        }
      }
      
      let recentStats = ConfigManager.getState(STATS_KEY) || [];
      stats.timestamp = new Date().toISOString();
      recentStats.push(stats);
      if (recentStats.length > 20) recentStats = recentStats.slice(-20);
      ConfigManager.setState(STATS_KEY, recentStats);
      
    } catch (error) {
      Logger.log(`❌ Error saving processing stats: ${error.toString()}`);
    }
  };
  
  /**
   * Logs recent processing statistics to the Apps Script logger.
   */
  ns.showProcessingStats = function() {
    Logger.log('📊 === Recent Boxer Report Processing Stats ===');
    try {
      const recentStats = ConfigManager.getState(STATS_KEY) || [];
      if (recentStats.length === 0) {
        Logger.log('📋 No processing stats available yet');
        return;
      }
      
      recentStats.slice(-10).forEach((run, index) => {
        const date = new Date(run.timestamp).toLocaleString();
        Logger.log(`\n📅 Run ${index + 1} - ${date}`);
        Logger.log(`  📊 Report Found: ${run.reportFound ? '✅' : '❌'}`);
        Logger.log(`  📁 Files in Report: ${run.filesInReport}`);
        Logger.log(`  ✅ Processed: ${run.filesProcessed}`);
        Logger.log(`  ⏭️ Skipped: ${run.skipped}`);
        Logger.log(`  ❌ Errors: ${run.errored}`);
        Logger.log(`  ⏱️ Time: ${(run.executionTimeMs / 1000).toFixed(1)}s`);
      });
      
      const checkpoint = ConfigManager.getState(CHECKPOINT_KEY);
      if (checkpoint) {
        Logger.log('\n📍 Current Checkpoint:');
        Logger.log(`  📊 Report ID: ${checkpoint.boxReportId}`);
        Logger.log(`  📄 JSON Cache File ID: ${checkpoint.jsonCacheFileId}`);
        Logger.log(`  ✅ Files Processed in Cycle: ${checkpoint.processedFileIds ? checkpoint.processedFileIds.length : 0}`);
        Logger.log(`  🕐 Last Updated: ${checkpoint.lastUpdated}`);
      }
      
    } catch (error) {
      Logger.log(`❌ Error showing stats: ${error.toString()}`);
    }
  };
  
  /**
   * Resets the processing checkpoint, forcing a fresh ingestion on the next run.
   */
  ns.resetProcessingCheckpoint = function() {
    Logger.log('🔄 Resetting Boxer processing checkpoint...');
    try {
      CacheService.getScriptCache().remove(CHECKPOINT_KEY);
      Logger.log('✅ Processing checkpoint reset. The next run will re-ingest the latest report.');
    } catch (error) {
      Logger.log(`❌ Error resetting checkpoint: ${error.toString()}`);
    }
  };
  
  return ns;
})();