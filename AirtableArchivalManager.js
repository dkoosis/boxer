// File: AirtableArchivalManager.js
// Automated Airtable Image Archival System for Box.com
// "Roomba" style incremental processing
// Depends on: Config.js, BoxAuth.js

/**
 * AirtableArchivalManager - Handles automated migration of images from Airtable to Box.com
 * Operates in "Roomba" mode: incremental, autonomous processing with queue management via Airtable views
 */
var AirtableArchivalManager = (function() {
  'use strict';
  
  var ns = {};
  
  // Processing constants
  var MAX_EXECUTION_TIME_MS = Config.AIRTABLE_MAX_EXECUTION_TIME_MS;
  var BATCH_SIZE = Config.AIRTABLE_BATCH_SIZE;
  var STATS_PROPERTY = Config.AIRTABLE_STATS_PROPERTY;
  var ERROR_LOG_PROPERTY = Config.AIRTABLE_ERROR_LOG_PROPERTY;
  
  /**
   * Main "Roomba" processing function - processes a small batch of records each run
   * @param {object} customConfig Optional custom configuration for specific base/table
   * @returns {object} Processing results
   */
  ns.runAirtableArchival = function(customConfig) {
    var startTime = Date.now();
    Logger.log('📦 === Boxer Airtable Archival Started ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    var config = Object.assign({}, Config.AIRTABLE_DEFAULT_CONFIG, customConfig || {});
    
    // Validate configuration
    if (!Config.validateAirtableConfig(config)) {
      Logger.log('❌ Invalid Airtable configuration');
      return { error: 'Invalid configuration' };
    }
    
    var stats = {
      recordsFound: 0,
      recordsProcessed: 0,
      filesUploaded: 0,
      recordsSkipped: 0,
      recordsErrored: 0,
      executionTimeMs: 0,
      startTime: new Date().toISOString(),
      config: {
        baseId: config.baseId,
        tableName: config.tableName,
        viewName: config.viewName
      }
    };
    
    try {
      // Step 1: Get API credentials
      var airtableApiKey = Config.getAirtableApiKey();
      var boxAccessToken = getValidAccessToken();
      
      if (!airtableApiKey) {
        Logger.log('❌ No Airtable API key found in Script Properties');
        Logger.log('💡 Set it using: Config.setAirtableApiKey("your_api_key_here")');
        return { error: 'No Airtable API key configured' };
      }
      
      if (!boxAccessToken) {
        Logger.log('❌ No Box access token available');
        return { error: 'No Box access token' };
      }
      
      Logger.log('✅ API credentials validated');
      
      // Step 2: Fetch records from Airtable view (Roomba queue)
      var records = ns.fetchRecordsFromView(config, airtableApiKey);
      stats.recordsFound = records.length;
      
      if (records.length === 0) {
        Logger.log('✅ No records in archival queue - all caught up!');
        stats.executionTimeMs = Date.now() - startTime;
        ns.saveStats(stats);
        return stats;
      }
      
      Logger.log('📋 Found ' + records.length + ' records in "' + config.viewName + '" view');
      
      // Step 3: Process records in small batches (Roomba behavior)
      var recordsToProcess = records.slice(0, BATCH_SIZE);
      Logger.log('🔄 Processing ' + recordsToProcess.length + ' records in this batch...');
      
      for (var i = 0; i < recordsToProcess.length; i++) {
        // Check execution time limit
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log('⏰ Execution time limit reached - stopping processing');
          break;
        }
        
        var record = recordsToProcess[i];
        var result = ns.processRecord(record, config, airtableApiKey, boxAccessToken);
        
        if (result.success) {
          stats.recordsProcessed++;
          stats.filesUploaded += result.filesUploaded || 0;
          Logger.log('✅ Successfully processed record: ' + (record.fields.Name || record.id));
        } else if (result.skipped) {
          stats.recordsSkipped++;
          Logger.log('⏭️ Skipped record: ' + (record.fields.Name || record.id) + ' - ' + result.reason);
        } else {
          stats.recordsErrored++;
          Logger.log('❌ Error processing record: ' + (record.fields.Name || record.id) + ' - ' + result.error);
          ns.logError(record, result.error, config);
        }
        
        // Brief pause between records
        if (i < recordsToProcess.length - 1) {
          Utilities.sleep(Config.AIRTABLE_DELAY_BETWEEN_RECORDS_MS);
        }
      }
      
      stats.executionTimeMs = Date.now() - startTime;
      
      Logger.log('📊 === Batch Processing Complete ===');
      Logger.log('✅ Processed: ' + stats.recordsProcessed + ' records');
      Logger.log('📁 Uploaded: ' + stats.filesUploaded + ' files');
      Logger.log('⏭️ Skipped: ' + stats.recordsSkipped + ' records');
      Logger.log('❌ Errors: ' + stats.recordsErrored + ' records');
      Logger.log('⏱️ Execution time: ' + (stats.executionTimeMs / 1000).toFixed(1) + 's');
      
      if (stats.recordsFound > BATCH_SIZE) {
        var remaining = stats.recordsFound - BATCH_SIZE;
        Logger.log('🔄 ' + remaining + ' more records remain in queue for next run');
      }
      
      ns.saveStats(stats);
      return stats;
      
    } catch (error) {
      stats.executionTimeMs = Date.now() - startTime;
      Logger.log('❌ Critical error in Airtable archival: ' + error.toString());
      console.error('Airtable archival error:', error);
      stats.error = error.toString();
      ns.saveStats(stats);
      return stats;
    }
  };
  
  /**
   * Fetch records from the specified Airtable view
   * @param {object} config Configuration object
   * @param {string} apiKey Airtable API key
   * @returns {Array} Array of records needing processing
   */
  ns.fetchRecordsFromView = function(config, apiKey) {
    Logger.log('📡 Fetching records from Airtable view: ' + config.viewName);
    
    try {
      var url = Config.AIRTABLE_API_BASE_URL + '/' + config.baseId + '/' + encodeURIComponent(config.tableName);
      var params = {
        'view': config.viewName,
        'maxRecords': Math.min(100, BATCH_SIZE * 4), // Get a reasonable number for queue visibility
        'fields': [config.attachmentFieldName, config.linkFieldName, 'Name'].join(',')
      };
      
      // Build query string
      var queryString = Object.keys(params).map(function(key) {
        return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
      }).join('&');
      
      var fullUrl = url + '?' + queryString;
      
      var response = UrlFetchApp.fetch(fullUrl, {
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log('❌ Failed to fetch Airtable records. HTTP: ' + response.getResponseCode());
        Logger.log('Response: ' + response.getContentText());
        return [];
      }
      
      var data = JSON.parse(response.getContentText());
      var records = data.records || [];
      
      Logger.log('📋 Retrieved ' + records.length + ' records from view');
      
      // Filter to only records that actually need processing
      var validRecords = records.filter(function(record) {
        var attachments = record.fields[config.attachmentFieldName];
        var hasLink = record.fields[config.linkFieldName];
        
        // Must have attachments and no existing link
        return attachments && Array.isArray(attachments) && attachments.length > 0 && !hasLink;
      });
      
      Logger.log('✅ ' + validRecords.length + ' records are ready for processing');
      return validRecords;
      
    } catch (error) {
      Logger.log('❌ Exception fetching Airtable records: ' + error.toString());
      return [];
    }
  };
  
  /**
   * Process a single Airtable record
   * @param {object} record Airtable record object
   * @param {object} config Configuration object
   * @param {string} airtableApiKey Airtable API key
   * @param {string} boxAccessToken Box access token
   * @returns {object} Processing result
   */
  ns.processRecord = function(record, config, airtableApiKey, boxAccessToken) {
    var recordName = record.fields.Name || record.id;
    Logger.log('🔄 Processing record: ' + recordName);
    
    try {
      var attachments = record.fields[config.attachmentFieldName];
      
      if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
        return { skipped: true, reason: 'No attachments found' };
      }
      
      // Filter to only image files
      var imageAttachments = attachments.filter(function(attachment) {
        return attachment.type && attachment.type.startsWith('image/');
      });
      
      if (imageAttachments.length === 0) {
        return { skipped: true, reason: 'No image attachments found' };
      }
      
      Logger.log('📁 Found ' + imageAttachments.length + ' image(s) to process');
      
      // Step 1: Ensure Box folder structure exists
      var targetFolderId = ns.ensureBoxFolderStructure(config, boxAccessToken);
      if (!targetFolderId) {
        return { error: 'Failed to create/find target folder in Box' };
      }
      
      // Step 2: Upload images to Box and collect links
      var uploadResults = [];
      var allUploadSuccessful = true;
      
      for (var i = 0; i < imageAttachments.length; i++) {
        var attachment = imageAttachments[i];
        
        // Check file size
        if (attachment.size > Config.AIRTABLE_MAX_FILE_SIZE_BYTES) {
          Logger.log('⚠️ Skipping oversized file: ' + attachment.filename + ' (' + (attachment.size / 1024 / 1024).toFixed(1) + 'MB)');
          continue;
        }
        
        var uploadResult = ns.uploadImageToBox(attachment, targetFolderId, record, config, boxAccessToken);
        
        if (uploadResult.success) {
          uploadResults.push(uploadResult);
          Logger.log('✅ Uploaded: ' + attachment.filename + ' → ' + uploadResult.boxLink);
        } else {
          Logger.log('❌ Failed to upload: ' + attachment.filename + ' - ' + uploadResult.error);
          allUploadSuccessful = false;
          break; // Stop processing this record on first failure
        }
        
        // Brief pause between file uploads
        if (i < imageAttachments.length - 1) {
          Utilities.sleep(Config.AIRTABLE_DELAY_BETWEEN_FILES_MS);
        }
      }
      
      if (!allUploadSuccessful || uploadResults.length === 0) {
        return { error: 'Failed to upload one or more files' };
      }
      
      // Step 3: Update Airtable record with Box links
      var updateSuccess = ns.updateAirtableRecord(record.id, uploadResults, config, airtableApiKey);
      
      if (updateSuccess) {
        return { 
          success: true, 
          filesUploaded: uploadResults.length,
          boxLinks: uploadResults.map(function(r) { return r.boxLink; })
        };
      } else {
        return { error: 'Failed to update Airtable record with Box links' };
      }
      
    } catch (error) {
      return { error: 'Exception processing record: ' + error.toString() };
    }
  };
  
  /**
   * Ensure Box folder structure exists: Airtable > [Base Name] > [Table Name]
   * @param {object} config Configuration object
   * @param {string} accessToken Box access token
   * @returns {string|null} Target folder ID or null on error
   */
  ns.ensureBoxFolderStructure = function(config, accessToken) {
    try {
      var rootFolderId = Config.AIRTABLE_ROOT_FOLDER_ID || '0';
      
      // Step 1: Find or create "Airtable" folder
      var airtableFolderId = ns.findOrCreateFolder('Airtable', rootFolderId, accessToken);
      if (!airtableFolderId) {
        Logger.log('❌ Failed to create Airtable root folder');
        return null;
      }
      
      // Step 2: Find or create base folder (use a clean name)
      var baseName = ns.sanitizeFolderName(config.baseId);
      var baseFolderId = ns.findOrCreateFolder(baseName, airtableFolderId, accessToken);
      if (!baseFolderId) {
        Logger.log('❌ Failed to create base folder: ' + baseName);
        return null;
      }
      
      // Step 3: Find or create table folder
      var tableName = ns.sanitizeFolderName(config.tableName);
      var tableFolderId = ns.findOrCreateFolder(tableName, baseFolderId, accessToken);
      if (!tableFolderId) {
        Logger.log('❌ Failed to create table folder: ' + tableName);
        return null;
      }
      
      Logger.log('📁 Target folder: Airtable > ' + baseName + ' > ' + tableName + ' (ID: ' + tableFolderId + ')');
      return tableFolderId;
      
    } catch (error) {
      Logger.log('❌ Exception ensuring folder structure: ' + error.toString());
      return null;
    }
  };
  
  /**
   * Find or create a folder in Box
   * @param {string} folderName Name of folder to find/create
   * @param {string} parentFolderId Parent folder ID
   * @param {string} accessToken Box access token
   * @returns {string|null} Folder ID or null on error
   */
  ns.findOrCreateFolder = function(folderName, parentFolderId, accessToken) {
    try {
      // First, try to find existing folder
      var searchUrl = Config.BOX_API_BASE_URL + '/folders/' + parentFolderId + '/items?fields=id,name,type&limit=100';
      
      var response = UrlFetchApp.fetch(searchUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        var existingFolder = (data.entries || []).find(function(item) {
          return item.type === 'folder' && item.name === folderName;
        });
        
        if (existingFolder) {
          Logger.log('📁 Found existing folder: ' + folderName + ' (ID: ' + existingFolder.id + ')');
          return existingFolder.id;
        }
      }
      
      // Folder doesn't exist, create it
      Logger.log('📁 Creating folder: ' + folderName + ' in parent: ' + parentFolderId);
      
      var createUrl = Config.BOX_API_BASE_URL + '/folders';
      var createPayload = {
        name: folderName,
        parent: { id: parentFolderId }
      };
      
      var createResponse = UrlFetchApp.fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(createPayload),
        muteHttpExceptions: true
      });
      
      if (createResponse.getResponseCode() === 201) {
        var newFolder = JSON.parse(createResponse.getContentText());
        Logger.log('✅ Created folder: ' + folderName + ' (ID: ' + newFolder.id + ')');
        return newFolder.id;
      } else {
        Logger.log('❌ Failed to create folder: ' + folderName + ' (HTTP: ' + createResponse.getResponseCode() + ')');
        return null;
      }
      
    } catch (error) {
      Logger.log('❌ Exception finding/creating folder ' + folderName + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Upload an image from Airtable to Box
   * @param {object} attachment Airtable attachment object
   * @param {string} targetFolderId Box folder ID for upload
   * @param {object} record Airtable record for metadata
   * @param {object} config Configuration object
   * @param {string} accessToken Box access token
   * @returns {object} Upload result
   */
  ns.uploadImageToBox = function(attachment, targetFolderId, record, config, accessToken) {
    try {
      Logger.log('📤 Uploading: ' + attachment.filename + ' (' + (attachment.size / 1024).toFixed(0) + ' KB)');
      
      // Step 1: Download file from Airtable
      var fileResponse = UrlFetchApp.fetch(attachment.url, { muteHttpExceptions: true });
      
      if (fileResponse.getResponseCode() !== 200) {
        return { error: 'Failed to download from Airtable (HTTP: ' + fileResponse.getResponseCode() + ')' };
      }
      
      var fileBlob = fileResponse.getBlob();
      
      // Step 2: Upload to Box
      var uploadUrl = 'https://upload.box.com/api/2.0/files/content';
      
      var payload = {
        'attributes': JSON.stringify({
          name: attachment.filename,
          parent: { id: targetFolderId }
        }),
        'file': fileBlob
      };
      
      var uploadResponse = UrlFetchApp.fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        payload: payload,
        muteHttpExceptions: true
      });
      
      if (uploadResponse.getResponseCode() !== 201) {
        return { error: 'Box upload failed (HTTP: ' + uploadResponse.getResponseCode() + ')' };
      }
      
      var uploadData = JSON.parse(uploadResponse.getContentText());
      var boxFile = uploadData.entries[0];
      
      // Step 3: Add metadata/notes to Box file
      ns.addMetadataToBoxFile(boxFile.id, record, config, accessToken);
      
      // Step 4: Generate shareable link
      var shareableLink = ns.createShareableLink(boxFile.id, accessToken);
      
      return {
        success: true,
        boxFileId: boxFile.id,
        boxLink: shareableLink || ('https://app.box.com/file/' + boxFile.id),
        filename: attachment.filename,
        originalUrl: attachment.url
      };
      
    } catch (error) {
      return { error: 'Exception during upload: ' + error.toString() };
    }
  };
  
  /**
   * Add metadata from Airtable record to Box file notes
   * @param {string} boxFileId Box file ID
   * @param {object} record Airtable record
   * @param {object} config Configuration object
   * @param {string} accessToken Box access token
   */
  ns.addMetadataToBoxFile = function(boxFileId, record, config, accessToken) {
    try {
      // Build metadata string from Airtable record
      var metadata = ['=== Airtable Archive ==='];
      metadata.push('Source: ' + config.baseId + ' / ' + config.tableName);
      metadata.push('Record ID: ' + record.id);
      metadata.push('Archived: ' + new Date().toISOString());
      
      if (record.fields.Name) {
        metadata.push('Name: ' + record.fields.Name);
      }
      
      // Add other text fields from the record
      Object.keys(record.fields).forEach(function(fieldName) {
        if (fieldName !== config.attachmentFieldName && 
            fieldName !== config.linkFieldName && 
            fieldName !== 'Name') {
          var value = record.fields[fieldName];
          if (typeof value === 'string' && value.length > 0 && value.length < 200) {
            metadata.push(fieldName + ': ' + value);
          }
        }
      });
      
      var metadataText = metadata.join('\n');
      
      // Update Box file description
      var updateUrl = Config.BOX_API_BASE_URL + '/files/' + boxFileId;
      var updatePayload = { description: metadataText };
      
      UrlFetchApp.fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(updatePayload),
        muteHttpExceptions: true
      });
      
      Logger.log('📝 Added metadata to Box file: ' + boxFileId);
      
    } catch (error) {
      Logger.log('⚠️ Failed to add metadata to Box file: ' + error.toString());
    }
  };
  
  /**
   * Create a shareable link for a Box file
   * @param {string} boxFileId Box file ID
   * @param {string} accessToken Box access token
   * @returns {string|null} Shareable link or null on error
   */
  ns.createShareableLink = function(boxFileId, accessToken) {
    try {
      var linkUrl = Config.BOX_API_BASE_URL + '/files/' + boxFileId + '?fields=shared_link';
      
      // First check if link already exists
      var checkResponse = UrlFetchApp.fetch(linkUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (checkResponse.getResponseCode() === 200) {
        var fileData = JSON.parse(checkResponse.getContentText());
        if (fileData.shared_link && fileData.shared_link.url) {
          return fileData.shared_link.url;
        }
      }
      
      // Create new shared link
      var updateUrl = Config.BOX_API_BASE_URL + '/files/' + boxFileId;
      var updatePayload = {
        shared_link: {
          access: 'open',
          permissions: {
            can_download: true,
            can_preview: true
          }
        }
      };
      
      var updateResponse = UrlFetchApp.fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(updatePayload),
        muteHttpExceptions: true
      });
      
      if (updateResponse.getResponseCode() === 200) {
        var updatedFile = JSON.parse(updateResponse.getContentText());
        return updatedFile.shared_link ? updatedFile.shared_link.url : null;
      }
      
    } catch (error) {
      Logger.log('⚠️ Failed to create shareable link: ' + error.toString());
    }
    
    return null;
  };
  
  /**
   * Update Airtable record with Box links and remove attachments
   * @param {string} recordId Airtable record ID
   * @param {Array} uploadResults Array of upload result objects
   * @param {object} config Configuration object
   * @param {string} apiKey Airtable API key
   * @returns {boolean} Success status
   */
  ns.updateAirtableRecord = function(recordId, uploadResults, config, apiKey) {
    try {
      Logger.log('📝 Updating Airtable record with Box links...');
      
      // Create link text with all uploaded files
      var linkTexts = uploadResults.map(function(result) {
        return result.filename + ': ' + result.boxLink;
      });
      var linkText = linkTexts.join('\n');
      
      var updateUrl = Config.AIRTABLE_API_BASE_URL + '/' + config.baseId + '/' + encodeURIComponent(config.tableName) + '/' + recordId;
      
      var updatePayload = {
        fields: {}
      };
      
      // Add Box links to the designated field
      updatePayload.fields[config.linkFieldName] = linkText;
      
      // Clear the attachment field (this removes images from Airtable)
      updatePayload.fields[config.attachmentFieldName] = [];
      
      var response = UrlFetchApp.fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify(updatePayload),
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        Logger.log('✅ Successfully updated Airtable record and cleared attachments');
        return true;
      } else {
        Logger.log('❌ Failed to update Airtable record (HTTP: ' + response.getResponseCode() + ')');
        Logger.log('Response: ' + response.getContentText());
        return false;
      }
      
    } catch (error) {
      Logger.log('❌ Exception updating Airtable record: ' + error.toString());
      return false;
    }
  };
  
  /**
   * Sanitize folder name for Box
   * @param {string} name Raw folder name
   * @returns {string} Sanitized folder name
   */
  ns.sanitizeFolderName = function(name) {
    return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 100);
  };
  
  /**
   * Log error for debugging
   * @param {object} record Airtable record that failed
   * @param {string} error Error message
   * @param {object} config Configuration object
   */
  ns.logError = function(record, error, config) {
    try {
      var errorLog = {
        timestamp: new Date().toISOString(),
        recordId: record.id,
        recordName: record.fields.Name || 'Unknown',
        error: error,
        config: {
          baseId: config.baseId,
          tableName: config.tableName,
          viewName: config.viewName
        }
      };
      
      var existingLogStr = Config.SCRIPT_PROPERTIES.getProperty(ERROR_LOG_PROPERTY);
      var existingLog = existingLogStr ? JSON.parse(existingLogStr) : [];
      
      existingLog.push(errorLog);
      
      // Keep only last 50 errors
      if (existingLog.length > 50) {
        existingLog = existingLog.slice(-50);
      }
      
      Config.SCRIPT_PROPERTIES.setProperty(ERROR_LOG_PROPERTY, JSON.stringify(existingLog));
      
    } catch (e) {
      Logger.log('❌ Failed to log error: ' + e.toString());
    }
  };
  
  /**
   * Save processing statistics
   * @param {object} stats Processing statistics object
   */
  ns.saveStats = function(stats) {
    try {
      var allStatsStr = Config.SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
      var allStats = allStatsStr ? JSON.parse(allStatsStr) : [];
      
      stats.timestamp = new Date().toISOString();
      allStats.push(stats);
      
      // Keep only last 20 runs
      if (allStats.length > 20) {
        allStats = allStats.slice(-20);
      }
      
      Config.SCRIPT_PROPERTIES.setProperty(STATS_PROPERTY, JSON.stringify(allStats));
    } catch (error) {
      Logger.log('❌ Error saving processing stats: ' + error.toString());
    }
  };
  
  /**
   * Show processing statistics and errors
   */
  ns.showStats = function() {
    Logger.log('📊 === Airtable Archival Statistics ===');
    
    try {
      var statsStr = Config.SCRIPT_PROPERTIES.getProperty(STATS_PROPERTY);
      if (!statsStr) {
        Logger.log('📋 No processing stats available yet');
        return;
      }
      
      var allStats = JSON.parse(statsStr);
      var recentStats = allStats.slice(-10);
      
      recentStats.forEach(function(run, index) {
        var date = new Date(run.timestamp).toLocaleString();
        Logger.log('');
        Logger.log('📅 Run ' + (index + 1) + ' - ' + date);
        Logger.log('  📊 Records Found: ' + run.recordsFound);
        Logger.log('  ✅ Processed: ' + run.recordsProcessed);
        Logger.log('  📁 Files Uploaded: ' + run.filesUploaded);
        Logger.log('  ⏭️ Skipped: ' + run.recordsSkipped);
        Logger.log('  ❌ Errors: ' + run.recordsErrored);
        Logger.log('  ⏱️ Time: ' + (run.executionTimeMs / 1000).toFixed(1) + 's');
        if (run.config) {
          Logger.log('  🎯 Target: ' + run.config.baseId + ' / ' + run.config.tableName + ' / ' + run.config.viewName);
        }
      });
      
      // Show recent errors
      var errorLogStr = Config.SCRIPT_PROPERTIES.getProperty(ERROR_LOG_PROPERTY);
      if (errorLogStr) {
        var errorLog = JSON.parse(errorLogStr);
        var recentErrors = errorLog.slice(-5);
        
        if (recentErrors.length > 0) {
          Logger.log('');
          Logger.log('🚨 Recent Errors:');
          recentErrors.forEach(function(error, index) {
            var date = new Date(error.timestamp).toLocaleString();
            Logger.log('  ' + (index + 1) + '. ' + date + ' - ' + error.recordName + ': ' + error.error);
          });
        }
      }
      
    } catch (error) {
      Logger.log('❌ Error showing stats: ' + error.toString());
    }
  };
  
  /**
   * Clear error log
   */
  ns.clearErrors = function() {
    Config.SCRIPT_PROPERTIES.deleteProperty(ERROR_LOG_PROPERTY);
    Logger.log('✅ Error log cleared');
  };
  
  return ns;
})();

// === CONVENIENCE FUNCTIONS FOR EASY ACCESS ===

/**
 * Main function to run Airtable archival with default configuration
 */
function runAirtableArchival() {
  return AirtableArchivalManager.runAirtableArchival();
}

/**
 * Run Airtable archival with custom configuration
 * @param {object} customConfig Custom configuration override
 */
function runAirtableArchivalCustom(customConfig) {
  return AirtableArchivalManager.runAirtableArchival(customConfig);
}

/**
 * Show Airtable archival statistics
 */
function showAirtableStats() {
  return AirtableArchivalManager.showStats();
}

/**
 * Clear Airtable error log
 */
function clearAirtableErrors() {
  return AirtableArchivalManager.clearErrors();
}

/**
 * Setup function - call this once to configure your Airtable API key
 * @param {string} apiKey Your Airtable API key
 */
function setupAirtableApiKey(apiKey) {
  Config.setAirtableApiKey(apiKey);
  Logger.log('✅ Airtable API key has been saved to Script Properties');
}