// File: AirtableManager.js
// Unified Airtable to Box archival system
// Consolidates AirtableArchivalManager.js and AirtableArchiver.js

const AirtableManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Configuration
  const BATCH_SIZE = 5;
  const MAX_FILE_SIZE_MB = 50;
  const RATE_LIMIT_MS = 2000;
  const STATS_KEY = 'AIRTABLE_STATS';
  
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
      bases.forEach(base => {
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
    const startTime = Date.now();
    Logger.log(`📦 === Archiving ${config.tableName} ===`);
    
    if (!apiKey || !boxToken) {
      return { success: false, error: 'Missing credentials' };
    }
    
    const stats = {
      recordsProcessed: 0,
      filesArchived: 0,
      errors: 0,
      executionTimeMs: 0
    };
    
    try {
      // Get records to process
      const records = fetchRecords_(config, apiKey);
      if (records.length === 0) {
        Logger.log('✅ No records to archive');
        return { success: true, ...stats };
      }
      
      Logger.log(`📋 Found ${records.length} records to process`);
      
      // Ensure Box folder exists
      const targetFolderId = ensureBoxFolder_(config, boxToken);
      if (!targetFolderId) {
        return { success: false, error: 'Failed to create Box folder' };
      }
      
      // Process records
      const toProcess = records.slice(0, config.maxRecords || BATCH_SIZE);
      toProcess.forEach(record => {
        const result = processRecord_(record, config, targetFolderId, apiKey, boxToken);
        if (result.success) {
          stats.recordsProcessed++;
          stats.filesArchived += result.filesArchived || 0;
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
    Logger.log(`  Records: ${stats.recordsProcessed}`);
    Logger.log(`  Files: ${stats.filesArchived}`);
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
      
      // Filter to records with attachments but no link
      return records.filter(r => {
        const attachments = r.fields[config.attachmentFieldName];
        const hasLink = r.fields[config.linkFieldName];
        return attachments && attachments.length > 0 && !hasLink;
      });
      
    } catch (error) {
      return [];
    }
  }
  
  function ensureBoxFolder_(config, boxToken) {
    try {
      // Create folder structure: /Airtable/[BaseID]/[TableName]
      const rootId = ConfigManager.getProperty('BOX_AIRTABLE_ARCHIVE_FOLDER') || '0';
      
      // Find or create each level
      const airtableId = findOrCreateFolder_('Airtable', rootId, boxToken);
      const baseId = findOrCreateFolder_(config.baseId, airtableId, boxToken);
      const tableFolderId = findOrCreateFolder_(config.tableName, baseId, boxToken);
      
      return tableFolderId;
      
    } catch (error) {
      Logger.log(`❌ Folder creation failed: ${error.toString()}`);
      return null;
    }
  }
  
  function findOrCreateFolder_(name, parentId, boxToken) {
    // Check existing
    const response = UrlFetchApp.fetch(
      `${ConfigManager.BOX_API_BASE_URL}/folders/${parentId}/items?fields=id,name,type`,
      { headers: { 'Authorization': `Bearer ${boxToken}` }, muteHttpExceptions: true }
    );
    
    if (response.getResponseCode() === 200) {
      const items = JSON.parse(response.getContentText()).entries || [];
      const existing = items.find(i => i.type === 'folder' && i.name === name);
      if (existing) return existing.id;
    }
    
    // Create new
    const createResponse = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/folders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${boxToken}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ name, parent: { id: parentId } }),
      muteHttpExceptions: true
    });
    
    if (createResponse.getResponseCode() === 201) {
      return JSON.parse(createResponse.getContentText()).id;
    }
    
    throw new Error(`Failed to create folder: ${name}`);
  }
  
  function processRecord_(record, config, targetFolderId, apiKey, boxToken) {
    const recordName = record.fields.Name || record.id;
    
    try {
      const attachments = record.fields[config.attachmentFieldName];
      const uploadedFiles = [];
      
      // Upload each attachment
      for (const att of attachments) {
        // Check size
        if (att.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          Logger.log(`⚠️ Skipping large file: ${att.filename}`);
          continue;
        }
        
        const uploadResult = uploadToBox_(att, targetFolderId, boxToken);
        if (uploadResult.success) {
          uploadedFiles.push({
            filename: att.filename,
            boxLink: uploadResult.link
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
        Logger.log(`✅ Archived: ${recordName}`);
        return { success: true, filesArchived: uploadedFiles.length };
      }
      
      return { success: false, error: 'Failed to update record' };
      
    } catch (error) {
      return { success: false, error: error.toString() };
    }
  }
  
  function uploadToBox_(attachment, folderId, boxToken) {
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
          return { success: true, link };
        }
      }
      
      return { success: false };
      
    } catch (error) {
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
            stats.recordsSkipped || 0,
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