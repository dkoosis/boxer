// File: AirtableManager.js
// Unified Airtable to Box archival system
// Consolidates AirtableArchivalManager.js and AirtableArchiver.js

const AirtableManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Configuration
  const MAX_FILE_SIZE_MB = 50;
  const STATS_KEY = 'AIRTABLE_STATS';
  const ARCHIVE_AGE_MONTHS = 6; // Only archive records older than this
  
  /**
   * Analyze entire workspace
   * @param {string} apiKey Airtable API Key
   */
  ns.analyzeWorkspace = function(apiKey) {
    Logger.log('🔍 === Analyzing Airtable Workspace ===');
    
    if (!apiKey) {
      Logger.log('❌ No API key provided. Run: BoxerApp.setAirtableApiKey("YOUR_KEY")');
      return null;
    }
    
    try {
      // List all bases
      const response = UrlFetchApp.fetch('https://api.airtable.com/v0/meta/bases', {
        headers: { 
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to list bases: ${response.getResponseCode()}`);
        Logger.log(`Response: ${response.getContentText()}`);
        return null;
      }
      
      const bases = JSON.parse(response.getContentText()).bases || [];
      Logger.log(`📊 Found ${bases.length} bases`);
      
      // Analyze each base
      const results = [];
      bases.forEach((base, index) => {
        // Add progress logging
        Logger.log(`\n[${index + 1}/${bases.length}] Analyzing base: ${base.name}`);
        
        const analysis = analyzeBase_(base, apiKey);
        if (analysis) results.push(analysis);
        Utilities.sleep(1000);
      });
      
      // Sort by size
      results.sort((a, b) => b.totalBytes - a.totalBytes);
      
      // Display summary
      const totalGB = results.reduce((sum, b) => sum + b.totalBytes, 0) / 1e9;
      Logger.log(`\n📊 WORKSPACE TOTAL: ${totalGB.toFixed(2)} GB`);
      
      results.forEach((base, i) => {
        Logger.log(`\n${i+1}. ${base.name}: ${(base.totalBytes/1e9).toFixed(2)} GB`);
        base.topTables.forEach(t => 
          Logger.log(`   - ${t.name}: ${(t.bytes/1e6).toFixed(0)} MB`)
        );
      });
      
      return results;
      
    } catch (error) {
      Logger.log(`❌ Error: ${error.toString()}`);
      return null;
    }
  };
  
  /**
   * Archive records from specific base/table
   * @param {object} config Configuration object for the archival task
   * @param {string} apiKey Airtable API Key
   * @param {string} boxToken A valid Box access token
   */
  ns.archiveTable = function(config, apiKey, boxToken) {
    const BATCH_SIZE = ConfigManager.getProperty('AIRTABLE_PROCESSING_BATCH_SIZE');
    const RATE_LIMIT_MS = ConfigManager.getProperty('AIRTABLE_SLEEP_DELAY_MS');
    const startTime = Date.now();
    const batchId = new Date().toISOString(); // Unique batch ID
    
    Logger.log(`📦 === Archiving ${config.tableName} ===`);
    Logger.log(`🕐 Only archiving records older than ${ARCHIVE_AGE_MONTHS} months`);
    
    if (!apiKey || !boxToken) {
      return { success: false, error: 'Missing credentials' };
    }
    
    const stats = {
      recordsProcessed: 0,
      filesArchived: 0,
      errors: 0,
      recordsTooNew: 0,
      executionTimeMs: 0
    };
    
    try {
      // Ensure the link field exists
      const linkFieldName = config.linkFieldName || ConfigManager.getProperty('AIRTABLE_LINK_FIELD');
      const fieldReady = ensureLinkField_(config.baseId, config.tableName, linkFieldName, apiKey);
      
      if (!fieldReady) {
        Logger.log('❌ Could not ensure link field exists');
        return { success: false, error: 'Failed to create/verify link field' };
      }
      
      // Ensure Box archive metadata template exists
      const archiveTemplate = getOrCreateArchiveTemplate(boxToken);
      if (!archiveTemplate) {
        Logger.log('⚠️ Could not create archive metadata template - continuing without metadata');
      }
      
      // Get base name for metadata
      const baseName = getBaseName_(config.baseId, apiKey);
      
      // Get table ID for proper URLs
      const tableId = getTableId_(config.baseId, config.tableName, apiKey);
      if (tableId) {
        Logger.log(`📋 Table ID: ${tableId}`);
      }
      
      // Get records to process
      const records = fetchRecords_(config, apiKey);
      if (records.length === 0) {
        Logger.log('✅ No records to archive');
        return { success: true, ...stats };
      }
      
      Logger.log(`📋 Found ${records.length} records to process`);
      
      // Ensure Box folder exists
      const targetFolderId = ensureBoxFolder_({...config, baseName: baseName}, boxToken);
      if (!targetFolderId) {
        return { success: false, error: 'Failed to create Box folder' };
      }
      
      // Process records
      const toProcess = records.slice(0, config.maxRecords || BATCH_SIZE);
      toProcess.forEach(record => {
        const result = processRecord_(record, {
          ...config,
          batchId: batchId,
          baseName: baseName,
          linkFieldName: linkFieldName,
          tableId: tableId
        }, targetFolderId, apiKey, boxToken);
        
        if (result.success) {
          stats.recordsProcessed++;
          stats.filesArchived += result.filesArchived || 0;
        } else if (result.tooNew) {
          stats.recordsTooNew++;
        } else {
          stats.errors++;
        }
        Utilities.sleep(RATE_LIMIT_MS);
      });
      
    } catch (error) {
      Logger.log(`❌ Error: ${error.toString()}`);
      stats.error = error.toString();
    }
    
    stats.executionTimeMs = Date.now() - startTime;
    
    Logger.log('\n📊 Results:');
    Logger.log(`  Records processed: ${stats.recordsProcessed}`);
    Logger.log(`  Files archived: ${stats.filesArchived}`);
    Logger.log(`  Records too new: ${stats.recordsTooNew}`);
    Logger.log(`  Errors: ${stats.errors}`);
    Logger.log(`  Time: ${(stats.executionTimeMs/1000).toFixed(1)}s`);
    
    saveStats_(stats);
    return { success: true, ...stats };
  };
  
  /**
   * Show recent archival statistics
   */
  ns.showStats = function() {
    Logger.log('📊 === Recent Airtable Archival Stats ===');
    
    const stats = ConfigManager.getState(STATS_KEY) || [];
    if (stats.length === 0) {
      Logger.log('No archival stats available yet');
      return;
    }
    
    stats.slice(-10).forEach((run, index) => {
      const date = new Date(run.timestamp).toLocaleString();
      Logger.log(`\n📅 Run ${index + 1} - ${date}`);
      Logger.log(`  ✅ Records: ${run.recordsProcessed}`);
      Logger.log(`  📁 Files: ${run.filesArchived}`);
      Logger.log(`  🕐 Too new: ${run.recordsTooNew || 0}`);
      Logger.log(`  ❌ Errors: ${run.errors}`);
      Logger.log(`  ⏱️ Time: ${(run.executionTimeMs/1000).toFixed(1)}s`);
    });
  };
  
  // Private helper functions
  
  function analyzeBase_(base, apiKey) {
    try {
      const response = UrlFetchApp.fetch(
        `https://api.airtable.com/v0/meta/bases/${base.id}/tables`,
        { headers: { 'Authorization': `Bearer ${apiKey}` }, muteHttpExceptions: true }
      );
      
      if (response.getResponseCode() !== 200) return null;
      
      const tables = JSON.parse(response.getContentText()).tables || [];
      const analysis = {
        id: base.id,
        name: base.name,
        totalBytes: 0,
        topTables: []
      };
      
      // Analyze tables with attachments
      tables.forEach(table => {
        const attachmentField = table.fields.find(f => f.type === 'multipleAttachments');
        if (!attachmentField) return;
        
        Logger.log(`  → Found attachment field "${attachmentField.name}" in table "${table.name}"`);
        
        const tableBytes = estimateTableSize_(base.id, table, attachmentField.name, apiKey);
        if (tableBytes > 0) {
          analysis.topTables.push({
            name: table.name,
            attachmentField: attachmentField.name,
            bytes: tableBytes
          });
          analysis.totalBytes += tableBytes;
        }
      });
      
      analysis.topTables.sort((a, b) => b.bytes - a.bytes);
      return analysis;
      
    } catch (error) {
      return null;
    }
  }
  
  function estimateTableSize_(baseId, table, fieldName, apiKey) {
    try {
      const response = UrlFetchApp.fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table.name)}?maxRecords=100&fields[]=${encodeURIComponent(fieldName)}`,
        { headers: { 'Authorization': `Bearer ${apiKey}` }, muteHttpExceptions: true }
      );
      
      if (response.getResponseCode() !== 200) return 0;
      
      const data = JSON.parse(response.getContentText());
      let totalBytes = 0;
      let recordCount = 0;
      
      data.records.forEach(record => {
        const attachments = record.fields[fieldName];
        if (attachments && Array.isArray(attachments)) {
          attachments.forEach(att => totalBytes += (att.size || 0));
        }
        recordCount++;
      });
      
      // Extrapolate if sampled
      if (recordCount === 100 && data.offset) {
        return totalBytes * 10; // Conservative estimate
      }
      
      return totalBytes;
      
    } catch (error) {
      return 0;
    }
  }
  
  function fetchRecords_(config, apiKey) {
    try {
      const url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}${config.viewName ? `?view=${encodeURIComponent(config.viewName)}` : ''}`;
      
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) return [];
      
      const records = JSON.parse(response.getContentText()).records || [];
      
      // Calculate cutoff date (6 months ago)
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - ARCHIVE_AGE_MONTHS);
      
      // Filter to records with attachments but no link, and old enough
      return records.filter(r => {
        const attachments = r.fields[config.attachmentFieldName];
        const hasLink = r.fields[config.linkFieldName];
        
        // Check age - use createdTime if available
        const recordDate = new Date(r.createdTime || '2000-01-01');
        const isOldEnough = recordDate < cutoffDate;
        
        return attachments && attachments.length > 0 && !hasLink && isOldEnough;
      });
      
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Get base name from API
   * @private
   */
  function getBaseName_(baseId, apiKey) {
    try {
      const response = UrlFetchApp.fetch(`https://api.airtable.com/v0/meta/bases`, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const bases = JSON.parse(response.getContentText()).bases || [];
      const base = bases.find(b => b.id === baseId);
      return base ? base.name : baseId;
    } catch (error) {
      return baseId;
    }
  }
  
  /**
   * Get table ID for building proper Airtable URLs
   * @private
   */
  function getTableId_(baseId, tableName, apiKey) {
    try {
      const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const tables = JSON.parse(response.getContentText()).tables || [];
      const table = tables.find(t => t.name === tableName);
      return table ? table.id : null;
    } catch (error) {
      Logger.log(`Error getting table ID: ${error.toString()}`);
      return null;
    }
  }
  
  /**
   * Ensures the Box link field exists in the table, creating it if necessary
   * @param {string} baseId Airtable base ID
   * @param {string} tableName Table name
   * @param {string} linkFieldName Name of the field to create
   * @param {string} apiKey Airtable API key
   * @returns {boolean} True if field exists or was created
   */
  function ensureLinkField_(baseId, tableName, linkFieldName, apiKey) {
    try {
      // First, get the table schema to check if field exists
      const schemaUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const schemaResponse = UrlFetchApp.fetch(schemaUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        muteHttpExceptions: true
      });
      
      if (schemaResponse.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to get table schema: ${schemaResponse.getResponseCode()}`);
        return false;
      }
      
      const tables = JSON.parse(schemaResponse.getContentText()).tables || [];
      const table = tables.find(t => t.name === tableName);
      
      if (!table) {
        Logger.log(`❌ Table "${tableName}" not found`);
        return false;
      }
      
      // Check if field already exists
      const fieldExists = table.fields.some(f => f.name === linkFieldName);
      if (fieldExists) {
        Logger.log(`✅ Field "${linkFieldName}" already exists`);
        return true;
      }
      
      // Create the field
      Logger.log(`📝 Creating field "${linkFieldName}" in table "${tableName}"...`);
      
      const createFieldUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;
      const createResponse = UrlFetchApp.fetch(createFieldUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({
          name: linkFieldName,
          type: 'multilineText',  // Long text field for Box links
          description: 'Box archive links for attachments'
        }),
        muteHttpExceptions: true
      });
      
      if (createResponse.getResponseCode() === 200 || createResponse.getResponseCode() === 201) {
        Logger.log(`✅ Successfully created field "${linkFieldName}"`);
        return true;
      } else {
        Logger.log(`❌ Failed to create field: ${createResponse.getResponseCode()}`);
        Logger.log(`Response: ${createResponse.getContentText()}`);
        return false;
      }
      
    } catch (error) {
      Logger.log(`❌ Error ensuring link field: ${error.toString()}`);
      return false;
    }
  }
  
  function ensureBoxFolder_(config, boxToken) {
    try {
      // Create folder structure: /Airtable/[BaseName]/[TableName]
      let rootId = ConfigManager.getProperty('BOX_AIRTABLE_ARCHIVE_FOLDER');
      
      // Ensure we have a valid root ID
      if (!rootId || rootId === '') {
        Logger.log('📁 BOX_AIRTABLE_ARCHIVE_FOLDER not set, using Box root folder (0)');
        rootId = '0'; // Box root folder
      }
      
      // Use base name if available, otherwise fall back to base ID
      const baseFolderName = config.baseName || config.baseId;
      
      Logger.log(`📁 Creating folder structure: /Airtable/${baseFolderName}/${config.tableName}/`);
      
      // Find or create each level
      const airtableId = findOrCreateFolder_('Airtable', rootId, boxToken);
      Logger.log(`  ✅ Airtable folder ID: ${airtableId}`);
      
      const baseId = findOrCreateFolder_(baseFolderName, airtableId, boxToken);
      Logger.log(`  ✅ Base folder ID: ${baseId}`);
      
      const tableFolderId = findOrCreateFolder_(config.tableName, baseId, boxToken);
      Logger.log(`  ✅ Table folder ID: ${tableFolderId}`);
      
      return tableFolderId;
      
    } catch (error) {
      Logger.log(`❌ Folder creation failed: ${error.toString()}`);
      return null;
    }
  }
  
  function findOrCreateFolder_(name, parentId, boxToken) {
    // Validate inputs
    if (!name || !parentId || !boxToken) {
      throw new Error(`Invalid parameters: name=${name}, parentId=${parentId}, token=${boxToken ? 'present' : 'missing'}`);
    }
    
    // Check existing
    const checkUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${parentId}/items?fields=id,name,type`;
    Logger.log(`    Checking for existing folder "${name}" in parent ${parentId}`);
    
    const response = UrlFetchApp.fetch(checkUrl, { 
      headers: { 'Authorization': `Bearer ${boxToken}` }, 
      muteHttpExceptions: true 
    });
    
    if (response.getResponseCode() === 200) {
      const items = JSON.parse(response.getContentText()).entries || [];
      const existing = items.find(i => i.type === 'folder' && i.name === name);
      if (existing) {
        Logger.log(`    → Found existing folder: ${existing.id}`);
        return existing.id;
      }
    } else {
      Logger.log(`    ⚠️ Could not list folder contents: ${response.getResponseCode()}`);
    }
    
    // Create new
    Logger.log(`    Creating new folder "${name}"...`);
    const createResponse = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/folders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${boxToken}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ 
        name: name, 
        parent: { id: parentId } 
      }),
      muteHttpExceptions: true
    });
    
    if (createResponse.getResponseCode() === 201) {
      const newFolder = JSON.parse(createResponse.getContentText());
      Logger.log(`    → Created new folder: ${newFolder.id}`);
      return newFolder.id;
    } else if (createResponse.getResponseCode() === 409) {
      // Conflict - folder already exists (race condition)
      Logger.log(`    → Folder already exists, fetching...`);
      const items = JSON.parse(response.getContentText()).entries || [];
      const existing = items.find(i => i.type === 'folder' && i.name === name);
      if (existing) return existing.id;
    }
    
    throw new Error(`Failed to create folder "${name}": ${createResponse.getResponseCode()} - ${createResponse.getContentText()}`);
  }
  
  function processRecord_(record, config, targetFolderId, apiKey, boxToken) {
    const recordName = record.fields.Name || record.fields[Object.keys(record.fields)[0]] || record.id;
    
    // Check age again (in case of race conditions)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - ARCHIVE_AGE_MONTHS);
    const recordDate = new Date(record.createdTime || '2000-01-01');
    
    if (recordDate >= cutoffDate) {
      Logger.log(`⏭️ Skipping ${recordName} - too new (created ${recordDate.toLocaleDateString()})`);
      return { success: false, tooNew: true };
    }
    
    try {
      const attachments = record.fields[config.attachmentFieldName];
      const uploadedFiles = [];
      
      // Build correct Airtable URL
      const recordUrl = config.tableId ? 
        `https://airtable.com/${config.baseId}/${config.tableId}/${record.id}` :
        `https://airtable.com/${config.baseId}/${record.id}`; // Fallback
      
      Logger.log(`  📌 Record URL: ${recordUrl}`);
      
      // Extract all fields except attachments (including complex types)
      const keyFields = {};
      Object.keys(record.fields).forEach(fieldName => {
        if (fieldName !== config.attachmentFieldName && fieldName !== config.linkFieldName) {
          const value = record.fields[fieldName];
          
          // Handle different field types
          if (value === null || value === undefined) {
            keyFields[fieldName] = null;
          } else if (typeof value === 'string') {
            // Truncate long strings
            keyFields[fieldName] = value.length > 2000 ? value.substring(0, 2000) + '...' : value;
          } else if (typeof value === 'number' || typeof value === 'boolean') {
            keyFields[fieldName] = value;
          } else if (value instanceof Date) {
            keyFields[fieldName] = value.toISOString();
          } else if (Array.isArray(value)) {
            // Handle arrays (multiple select, linked records, etc.)
            keyFields[fieldName] = value.slice(0, 10).join(', '); // First 10 items
          } else if (typeof value === 'object') {
            // Handle objects (might be linked record objects)
            try {
              keyFields[fieldName] = JSON.stringify(value).substring(0, 500);
            } catch (e) {
              keyFields[fieldName] = '[Complex Object]';
            }
          }
        }
      });
      
      // Prepare metadata
      const metadata = {
        sourceSystem: 'airtable',
        sourceBaseId: config.baseId,
        sourceBaseName: config.baseName || config.baseId,
        sourceTableName: config.tableName,
        sourceRecordId: record.id,
        sourceRecordName: recordName,
        sourceRecordUrl: recordUrl,
        recordPrimaryField: recordName,
        recordKeyData: JSON.stringify(keyFields),
        recordCreatedDate: record.createdTime ? new Date(record.createdTime).toISOString() : new Date().toISOString(),
        archiveDate: new Date().toISOString(),
        archiveReason: 'storage_reduction',
        archiveVersion: ConfigManager.getCurrentVersion(),
        archiveBatch: config.batchId,
        retainOriginal: 'no'
      };
      
      // Upload each attachment
      for (const att of attachments) {
        // Check size
        if (att.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          Logger.log(`⚠️ Skipping large file: ${att.filename}`);
          continue;
        }
        
        const uploadResult = uploadToBoxWithMetadata_(att, targetFolderId, boxToken, {
          ...metadata,
          originalFilename: att.filename,
          originalFileSize: att.size
        });
        
        if (uploadResult.success) {
          uploadedFiles.push({
            filename: att.filename,
            boxLink: uploadResult.link,
            boxFileId: uploadResult.fileId
          });
        }
      }
      
      if (uploadedFiles.length === 0) {
        return { success: false, error: 'No files uploaded' };
      }
      
      // Update Airtable record
      const linkText = uploadedFiles.map(f => `${f.filename}: ${f.boxLink}`).join('\n');
      
      const updateResponse = UrlFetchApp.fetch(
        `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}/${record.id}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify({
            fields: {
              [config.linkFieldName]: linkText,
              [config.attachmentFieldName]: [] // Clear attachments
            }
          }),
          muteHttpExceptions: true
        }
      );
      
      if (updateResponse.getResponseCode() === 200) {
        Logger.log(`✅ Archived: ${recordName} (${uploadedFiles.length} files)`);
        
        // If any uploaded files are images, also process them for image metadata
        uploadedFiles.forEach(file => {
          if (ConfigManager.isImageFile(file.filename)) {
            try {
              Logger.log(`  🖼️ Processing image metadata for ${file.filename}...`);
              const fileDetails = {
                id: file.boxFileId,
                name: file.filename,
                path_collection: { entries: [] }
              };
              const imageMetadata = MetadataExtraction.orchestrateFullExtraction(fileDetails, boxToken);
              BoxFileOperations.applyMetadata(file.boxFileId, imageMetadata, boxToken);
            } catch (e) {
              Logger.log(`  ⚠️ Could not add image metadata: ${e.toString()}`);
            }
          }
        });
        
        return { success: true, filesArchived: uploadedFiles.length };
      }
      
      return { success: false, error: 'Failed to update record' };
      
    } catch (error) {
      return { success: false, error: error.toString() };
    }
  }
  
  function uploadToBoxWithMetadata_(attachment, folderId, boxToken, metadata) {
    try {
      // Download from Airtable
      const response = UrlFetchApp.fetch(attachment.url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        return { success: false };
      }
      
      // Upload to Box
      const uploadResponse = UrlFetchApp.fetch('https://upload.box.com/api/2.0/files/content', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${boxToken}` },
        payload: {
          attributes: JSON.stringify({
            name: attachment.filename,
            parent: { id: folderId }
          }),
          file: response.getBlob()
        },
        muteHttpExceptions: true
      });
      
      if (uploadResponse.getResponseCode() === 201) {
        const boxFile = JSON.parse(uploadResponse.getContentText()).entries[0];
        
        // Add metadata to the file
        const metadataTemplateKey = 'boxerArchiveMetadata';
        try {
          BoxFileOperations.applyMetadata(boxFile.id, metadata, boxToken, metadataTemplateKey);
          Logger.log(`  📋 Added archive metadata to ${attachment.filename}`);
        } catch (e) {
          Logger.log(`  ⚠️ Could not add metadata to ${attachment.filename}: ${e.toString()}`);
        }
        
        // Create shared link
        const sharedLinkAccess = ConfigManager.getProperty('BOX_AIRTABLE_SHARED_LINK_ACCESS');
        const linkResponse = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/files/${boxFile.id}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${boxToken}`,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify({
            shared_link: { access: sharedLinkAccess }
          }),
          muteHttpExceptions: true
        });
        
        if (linkResponse.getResponseCode() === 200) {
          const link = JSON.parse(linkResponse.getContentText()).shared_link.url;
          return { success: true, link, fileId: boxFile.id };
        }
      }
      
      return { success: false };
      
    } catch (error) {
      Logger.log(`  ❌ Upload error: ${error.toString()}`);
      return { success: false };
    }
  }
  
  function saveStats_(stats) {
    try {
      const recentStats = ConfigManager.getState(STATS_KEY) || [];
      stats.timestamp = new Date().toISOString();
      recentStats.push(stats);
      
      // Keep only last 20 runs
      if (recentStats.length > 20) {
        recentStats.splice(0, recentStats.length - 20);
      }
      
      ConfigManager.setState(STATS_KEY, recentStats);
      
      // Also save to tracking sheet if configured
      const sheetId = ConfigManager.getProperty('BOXER_TRACKING_SHEET');
      if (sheetId) {
        const sheet = SpreadsheetApp.openById(sheetId).getSheetByName(ConfigManager.PROCESSING_STATS_SHEET_NAME);
        if (sheet) {
          sheet.appendRow([
            new Date().toISOString(),
            'Airtable Archival',
            stats.recordsFound || 0,
            stats.recordsProcessed || 0,
            stats.recordsSkipped || stats.recordsTooNew || 0,
            stats.errors || 0,
            (stats.executionTimeMs || 0) / 1000
          ]);
        }
      }
    } catch (error) {
      Logger.log(`Error saving stats: ${error.toString()}`);
    }
  }
  
  return ns;
})();

// Test functions
function testAirtableArchiveWithMetadata() {
  Logger.log('=== Testing Airtable Archive with Metadata ===');
  
  const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
  const boxToken = getValidAccessToken();
  
  // First ensure the archive template exists
  const template = getOrCreateArchiveTemplate(boxToken);
  if (!template) {
    Logger.log('❌ Could not create archive metadata template');
    return;
  }
  
  Logger.log('✅ Archive template ready');
  
  // Find a small test base
  const response = UrlFetchApp.fetch('https://api.airtable.com/v0/meta/bases', {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  
  const bases = JSON.parse(response.getContentText()).bases || [];
  const testBase = bases.find(b => b.name === 'Visitor Services' || b.name === 'Office Inventory');
  
  if (!testBase) {
    Logger.log('❌ Could not find test base');
    return;
  }
  
  Logger.log(`📋 Using base: ${testBase.name} (${testBase.id})`);
  
  // Now find a table with attachments in this base
  const tablesUrl = `https://api.airtable.com/v0/meta/bases/${testBase.id}/tables`;
  const tablesResponse = UrlFetchApp.fetch(tablesUrl, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  
  const tables = JSON.parse(tablesResponse.getContentText()).tables || [];
  
  // Find first table with attachment field
  let targetTable = null;
  let attachmentFieldName = null;
  
  for (const table of tables) {
    const attachField = table.fields.find(f => f.type === 'multipleAttachments');
    if (attachField) {
      targetTable = table.name;
      attachmentFieldName = attachField.name;
      Logger.log(`✅ Found table with attachments: ${targetTable} (field: ${attachmentFieldName})`);
      break;
    }
  }
  
  if (!targetTable) {
    Logger.log('❌ No tables with attachments found in this base');
    return;
  }
  
  const config = {
    baseId: testBase.id,
    tableName: targetTable,  // Use the actual table name we found
    attachmentFieldName: attachmentFieldName,  // Use the actual field name
    linkFieldName: 'Box_Archive_Link',
    maxRecords: 1  // Just test with 1 record
  };
  
  const result = AirtableManager.archiveTable(config, apiKey, boxToken);
  
  if (result.success && result.filesArchived > 0) {
    Logger.log('\n🎉 Success! Check Box for:');
    Logger.log(`  - New folder: /Airtable/${testBase.name}/${targetTable}/`);
    Logger.log('  - Files with archive metadata attached');
    Logger.log('  - If images, they should also have image metadata');
  } else if (result.recordsTooNew > 0) {
    Logger.log('\n⚠️ No files archived - all records are less than 6 months old');
    Logger.log('💡 Try with an older base or reduce ARCHIVE_AGE_MONTHS in the code');
  }
}