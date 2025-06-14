// File: AirtableArchiver.js
// Unified Airtable to Box archival system
// Handles both single-table and workspace-wide operations

var AirtableArchiver = (function() {
  'use strict';
  
  var ns = {};
  
  // Configuration defaults
  var BATCH_SIZE = 5;
  var MAX_FILE_SIZE_MB = 50;
  var RATE_LIMIT_MS = 2000;
  
  /**
   * Get Airtable API key
   * @returns {string|null} API key or null
   */
  ns.getApiKey = function() {
    return PropertiesService.getScriptProperties().getProperty('AIRTABLE_API_KEY');
  };
  
  /**
   * Analyze entire workspace
   * @returns {object} Analysis results sorted by attachment size
   */
  ns.analyzeWorkspace = function() {
    Logger.log('🔍 === Analyzing Airtable Workspace ===');
    
    var apiKey = ns.getApiKey();
    if (!apiKey) {
      Logger.log('❌ No API key. Run: setupAirtableApiKey("YOUR_KEY")');
      return null;
    }
    
    try {
      // List all bases
      var response = UrlFetchApp.fetch('https://api.airtable.com/v0/meta/bases', {
        headers: { 
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log('❌ Failed to list bases: ' + response.getResponseCode());
        Logger.log('Response: ' + response.getContentText());
        return null;
      }
      
      var bases = JSON.parse(response.getContentText()).bases || [];
      Logger.log('📊 Found ' + bases.length + ' bases');
      
      // Analyze each base
      var results = [];
      bases.forEach(function(base) {
        var analysis = analyzeBase_(base, apiKey);
        if (analysis) results.push(analysis);
        Utilities.sleep(1000);
      });
      
      // Sort by size
      results.sort((a, b) => b.totalBytes - a.totalBytes);
      
      // Display summary
      var totalGB = results.reduce((sum, b) => sum + b.totalBytes, 0) / 1e9;
      Logger.log('\n📊 WORKSPACE TOTAL: ' + totalGB.toFixed(2) + ' GB');
      
      results.forEach((base, i) => {
        Logger.log(`\n${i+1}. ${base.name}: ${(base.totalBytes/1e9).toFixed(2)} GB`);
        base.topTables.forEach(t => 
          Logger.log(`   - ${t.name}: ${(t.bytes/1e6).toFixed(0)} MB`)
        );
      });
      
      return results;
      
    } catch (error) {
      Logger.log('❌ Error: ' + error.toString());
      return null;
    }
  };
  
  /**
   * Archive records from specific base/table
   * @param {object} config Archive configuration
   * @returns {object} Processing results
   */
  ns.archiveTable = function(config) {
    var startTime = Date.now();
    Logger.log('📦 === Archiving ' + config.tableName + ' ===');
    
    var apiKey = ns.getApiKey();
    var boxToken = getValidAccessToken();
    
    if (!apiKey || !boxToken) {
      return { error: 'Missing credentials' };
    }
    
    var stats = {
      recordsProcessed: 0,
      filesArchived: 0,
      errors: 0,
      executionTimeMs: 0
    };
    
    try {
      // Get records to process
      var records = fetchRecords_(config, apiKey);
      if (records.length === 0) {
        Logger.log('✅ No records to archive');
        return stats;
      }
      
      Logger.log('📋 Found ' + records.length + ' records to process');
      
      // Ensure Box folder exists
      var targetFolderId = ensureBoxFolder_(config, boxToken);
      if (!targetFolderId) {
        return { error: 'Failed to create Box folder' };
      }
      
      // Process records
      var toProcess = records.slice(0, config.maxRecords || BATCH_SIZE);
      toProcess.forEach(function(record) {
        var result = processRecord_(record, config, targetFolderId, apiKey, boxToken);
        if (result.success) {
          stats.recordsProcessed++;
          stats.filesArchived += result.filesArchived || 0;
        } else {
          stats.errors++;
        }
        Utilities.sleep(RATE_LIMIT_MS);
      });
      
    } catch (error) {
      Logger.log('❌ Error: ' + error.toString());
      stats.error = error.toString();
    }
    
    stats.executionTimeMs = Date.now() - startTime;
    
    Logger.log('\n📊 Results:');
    Logger.log('  Records: ' + stats.recordsProcessed);
    Logger.log('  Files: ' + stats.filesArchived);
    Logger.log('  Time: ' + (stats.executionTimeMs/1000).toFixed(1) + 's');
    
    return stats;
  };
  
  /**
   * Archive by priority (largest bases first)
   * @param {object} options Processing options
   */
  ns.archiveByPriority = function(options) {
    options = options || {};
    
    Logger.log('🚀 === Archive by Priority ===');
    Logger.log('Mode: ' + (options.testMode ? 'TEST' : 'LIVE'));
    
    // Get workspace analysis
    var bases = ns.analyzeWorkspace();
    if (!bases || bases.length === 0) return;
    
    var maxBases = options.maxBases || 1;
    var maxTables = options.maxTablesPerBase || 1;
    var maxRecords = options.maxRecords || 5;
    
    // Process top bases
    bases.slice(0, maxBases).forEach(function(base) {
      Logger.log('\n📦 Processing: ' + base.name);
      
      base.topTables.slice(0, maxTables).forEach(function(table) {
        if (options.testMode) {
          Logger.log('  Would archive: ' + table.name);
          return;
        }
        
        ns.archiveTable({
          baseId: base.id,
          tableName: table.name,
          attachmentFieldName: table.attachmentField,
          linkFieldName: 'Box_Link',
          maxRecords: maxRecords
        });
      });
    });
  };
  
  // Private helper functions
  
  function analyzeBase_(base, apiKey) {
    try {
      var response = UrlFetchApp.fetch(
        'https://api.airtable.com/v0/meta/bases/' + base.id + '/tables',
        { headers: { 'Authorization': 'Bearer ' + apiKey }, muteHttpExceptions: true }
      );
      
      if (response.getResponseCode() !== 200) return null;
      
      var tables = JSON.parse(response.getContentText()).tables || [];
      var analysis = {
        id: base.id,
        name: base.name,
        totalBytes: 0,
        topTables: []
      };
      
      // Analyze tables with attachments
      tables.forEach(function(table) {
        var attachmentField = table.fields.find(f => f.type === 'multipleAttachments');
        if (!attachmentField) return;
        
        var tableBytes = estimateTableSize_(base.id, table, attachmentField.name, apiKey);
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
      var response = UrlFetchApp.fetch(
        'https://api.airtable.com/v0/' + baseId + '/' + encodeURIComponent(table.name) + 
        '?maxRecords=100&fields[]=' + encodeURIComponent(fieldName),
        { headers: { 'Authorization': 'Bearer ' + apiKey }, muteHttpExceptions: true }
      );
      
      if (response.getResponseCode() !== 200) return 0;
      
      var data = JSON.parse(response.getContentText());
      var totalBytes = 0;
      var recordCount = 0;
      
      data.records.forEach(function(record) {
        var attachments = record.fields[fieldName];
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
      var url = 'https://api.airtable.com/v0/' + config.baseId + '/' + 
                encodeURIComponent(config.tableName);
      
      if (config.viewName) {
        url += '?view=' + encodeURIComponent(config.viewName);
      }
      
      var response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + apiKey },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) return [];
      
      var records = JSON.parse(response.getContentText()).records || [];
      
      // Filter to records with attachments but no link
      return records.filter(function(r) {
        var attachments = r.fields[config.attachmentFieldName];
        var hasLink = r.fields[config.linkFieldName];
        return attachments && attachments.length > 0 && !hasLink;
      });
      
    } catch (error) {
      return [];
    }
  }
  
  function ensureBoxFolder_(config, boxToken) {
    try {
      // Create folder structure: /Airtable/[BaseID]/[TableName]
      var rootId = Config.getProperty('BOX_AIRTABLE_ARCHIVE_FOLDER') || '0';
      
      // Find or create each level
      var airtableId = findOrCreateFolder_('Airtable', rootId, boxToken);
      var baseId = findOrCreateFolder_(config.baseId, airtableId, boxToken);
      var tableFolderId = findOrCreateFolder_(config.tableName, baseId, boxToken);
      
      return tableFolderId;
      
    } catch (error) {
      Logger.log('❌ Folder creation failed: ' + error.toString());
      return null;
    }
  }
  
  function findOrCreateFolder_(name, parentId, boxToken) {
    // Check existing
    var response = UrlFetchApp.fetch(
      Config.BOX_API_BASE_URL + '/folders/' + parentId + '/items?fields=id,name,type',
      { headers: { 'Authorization': 'Bearer ' + boxToken }, muteHttpExceptions: true }
    );
    
    if (response.getResponseCode() === 200) {
      var items = JSON.parse(response.getContentText()).entries || [];
      var existing = items.find(i => i.type === 'folder' && i.name === name);
      if (existing) return existing.id;
    }
    
    // Create new
    var createResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/folders', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + boxToken,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({ name: name, parent: { id: parentId } }),
      muteHttpExceptions: true
    });
    
    if (createResponse.getResponseCode() === 201) {
      return JSON.parse(createResponse.getContentText()).id;
    }
    
    throw new Error('Failed to create folder: ' + name);
  }
  
  function processRecord_(record, config, targetFolderId, apiKey, boxToken) {
    var recordName = record.fields.Name || record.id;
    
    try {
      var attachments = record.fields[config.attachmentFieldName];
      var uploadedFiles = [];
      
      // Upload each attachment
      for (var i = 0; i < attachments.length; i++) {
        var att = attachments[i];
        
        // Check size
        if (att.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
          Logger.log('⚠️ Skipping large file: ' + att.filename);
          continue;
        }
        
        var uploadResult = uploadToBox_(att, targetFolderId, boxToken);
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
      var linkText = uploadedFiles.map(f => f.filename + ': ' + f.boxLink).join('\n');
      
      var updateResponse = UrlFetchApp.fetch(
        'https://api.airtable.com/v0/' + config.baseId + '/' + 
        encodeURIComponent(config.tableName) + '/' + record.id,
        {
          method: 'PATCH',
          headers: {
            'Authorization': 'Bearer ' + apiKey,
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
        Logger.log('✅ Archived: ' + recordName);
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
      var response = UrlFetchApp.fetch(attachment.url, { muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) {
        return { success: false };
      }
      
      // Upload to Box
      var uploadResponse = UrlFetchApp.fetch('https://upload.box.com/api/2.0/files/content', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + boxToken },
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
        var boxFile = JSON.parse(uploadResponse.getContentText()).entries[0];
        
        // Create shared link
        var linkResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/files/' + boxFile.id, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + boxToken,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify({
            shared_link: { access: 'open' }
          }),
          muteHttpExceptions: true
        });
        
        if (linkResponse.getResponseCode() === 200) {
          var link = JSON.parse(linkResponse.getContentText()).shared_link.url;
          return { success: true, link: link };
        }
      }
      
      return { success: false };
      
    } catch (error) {
      return { success: false };
    }
  }
  
  return ns;
})();

// === Setup Functions ===

function setupAirtableApiKey(apiKey) {
  PropertiesService.getScriptProperties().setProperty('AIRTABLE_API_KEY', apiKey);
  Logger.log('✅ Airtable API key saved');
}

// === Workspace Analysis ===

function analyzeAirtableWorkspace() {
  return AirtableArchiver.analyzeWorkspace();
}

// === Targeted Archival ===

function archiveSpecificTable(baseId, tableName, maxRecords) {
  return AirtableArchiver.archiveTable({
    baseId: baseId,
    tableName: tableName,
    attachmentFieldName: 'Attachments', // Adjust as needed
    linkFieldName: 'Box_Link',
    maxRecords: maxRecords || 5
  });
}

// === Priority-Based Archival ===

function testArchiveByPriority() {
  return AirtableArchiver.archiveByPriority({
    testMode: true,
    maxBases: 2,
    maxTablesPerBase: 2
  });
}

function archiveTopBase() {
  return AirtableArchiver.archiveByPriority({
    testMode: false,
    maxBases: 1,
    maxTablesPerBase: 1,
    maxRecords: 5
  });
}