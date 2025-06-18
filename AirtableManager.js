// File: AirtableManager.js
// Unified Airtable to Box archival system with usage reporting
// Enhanced with full large file support and comprehensive reporting

const AirtableManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Configuration - NO FILE SIZE LIMITS
  const STATS_KEY = 'AIRTABLE_STATS';
  const TEAM_PLAN_RECORD_LIMIT = 50000;
  const TEAM_PLAN_ATTACHMENT_LIMIT_GB = 20;
  
  // Get configurable archive age
  const getArchiveAgeMonths = () => {
    const configured = ConfigManager.getProperty('ARCHIVE_AGE_MONTHS');
    return configured ? parseInt(configured) : 6; // Default to 6 months
  };

  /**
   * Generates a detailed usage report for all Airtable bases and emails it.
   * @param {string} apiKey Airtable API Key
   * @param {string} recipientEmail Email address to send the report to
   */
  ns.generateUsageReportAndEmail = function(apiKey, recipientEmail) {
    Logger.log('📊 === Generating Airtable Usage Report ===');
    if (!apiKey) {
      Logger.log('❌ No API key provided for usage report.');
      return { success: false, error: 'API key required' };
    }
    if (!recipientEmail) {
      Logger.log('❌ No recipient email provided for usage report.');
      return { success: false, error: 'Recipient email required' };
    }

    try {
      const allBases = ns.analyzeWorkspace(apiKey, true); // true for detailed analysis
      if (!allBases) {
        throw new Error('Failed to analyze workspace.');
      }

      const htmlReport = _formatHtmlReport(allBases);
      const subject = `Airtable Usage Report - ${new Date().toLocaleDateString()}`;

      MailApp.sendEmail({
        to: recipientEmail,
        subject: subject,
        htmlBody: htmlReport,
        name: 'Boxer for Airtable'
      });

      Logger.log(`✅ Successfully sent usage report to ${recipientEmail}`);
      return { success: true, basesAnalyzed: allBases.length };

    } catch (error) {
      Logger.log(`❌ Error generating or sending usage report: ${error.toString()}`);
      ErrorHandler.reportError(error, 'generateUsageReportAndEmail');
      return { success: false, error: error.toString() };
    }
  };
  
  /**
   * Analyze entire workspace
   * @param {string} apiKey Airtable API Key
   * @param {boolean} detailed Set to true to get record counts and attachment sizes
   */
  ns.analyzeWorkspace = function(apiKey, detailed = false) {
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
        
        const analysis = analyzeBase_(base, apiKey, detailed);
        if (analysis) results.push(analysis);
        Utilities.sleep(1000); // Prevent hitting rate limits
      });
      
      // Sort by attachment size (descending)
      results.sort((a, b) => b.totalAttachmentSize - a.totalAttachmentSize);
      
      // Display summary in logs
      const totalGB = results.reduce((sum, b) => sum + b.totalAttachmentSize, 0) / 1e9;
      Logger.log(`\n📊 WORKSPACE TOTAL: ${totalGB.toFixed(2)} GB`);
      
      results.forEach((base, i) => {
        Logger.log(`\n${i+1}. ${base.name}: ${base.totalRecords} records, ${(base.totalAttachmentSize/1e9).toFixed(2)} GB`);
        if(base.tables) {
          base.tables.forEach(t => 
            Logger.log(`   - ${t.name}: ${t.recordCount} records, ${(t.attachmentSize/1e6).toFixed(0)} MB`)
          );
        }
      });
      
      return results;
      
    } catch (error) {
      Logger.log(`❌ Error in analyzeWorkspace: ${error.toString()}`);
      return null;
    }
  };
  
  /**
   * Analyze storage in detail
   */
  ns.analyzeStorage = function(baseId, apiKey) {
    Logger.log('📊 === Detailed Airtable Storage Analysis ===');
    
    if (!apiKey) {
      Logger.log('❌ No API key found');
      return;
    }
    
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - getArchiveAgeMonths());
    
    Logger.log(`📅 Archive age threshold: ${getArchiveAgeMonths()} months`);
    Logger.log(`📅 Will archive files created before: ${cutoffDate.toLocaleDateString()}`);
    Logger.log(`🔍 Analyzing base: ${baseId}\n`);
    
    try {
      // Get base name
      const baseName = getBaseName_(baseId, apiKey);
      Logger.log(`📦 Base Name: ${baseName}`);
      
      // Get all tables
      const tablesUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const tablesResponse = UrlFetchApp.fetch(tablesUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const tables = JSON.parse(tablesResponse.getContentText()).tables || [];
      Logger.log(`📋 Found ${tables.length} tables in base\n`);
      
      const analysis = {
        totalAttachments: 0,
        totalBytes: 0,
        oldAttachments: 0,
        oldBytes: 0,
        newAttachments: 0,
        newBytes: 0,
        byFileType: {},
        byTable: {},
        tablesWithAttachments: 0,
        largestFiles: []
      };
      
      // Analyze each table
      for (const table of tables) {
        const attachmentFields = table.fields.filter(f => f.type === 'multipleAttachments');
        
        if (attachmentFields.length === 0) {
          Logger.log(`⏭️ Table "${table.name}" - No attachment fields`);
          continue;
        }
        
        analysis.tablesWithAttachments++;
        Logger.log(`\n📊 Analyzing table: ${table.name}`);
        Logger.log(`   Attachment fields: ${attachmentFields.map(f => f.name).join(', ')}`);
        
        const tableStats = {
          name: table.name,
          totalFiles: 0,
          totalBytes: 0,
          oldFiles: 0,
          oldBytes: 0,
          newFiles: 0,
          newBytes: 0,
          byType: {},
          recordsWithAttachments: 0,
          recordsWithLinks: 0
        };
        
        // Fetch records from this table
        for (const field of attachmentFields) {
          try {
            const recordsUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table.id)}?fields[]=${encodeURIComponent(field.name)}&fields[]=${encodeURIComponent(ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link')}`;
            
            const recordsResponse = UrlFetchApp.fetch(recordsUrl, {
              headers: { 'Authorization': `Bearer ${apiKey}` },
              muteHttpExceptions: true
            });
            
            if (recordsResponse.getResponseCode() !== 200) {
              Logger.log(`   ❌ Failed to fetch records: ${recordsResponse.getResponseCode()}`);
              continue;
            }
            
            const data = JSON.parse(recordsResponse.getContentText());
            const records = data.records || [];
            
            Logger.log(`   📄 Found ${records.length} records`);
            
            // Analyze each record
            records.forEach(record => {
              const attachments = record.fields[field.name];
              const hasLink = record.fields[ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link'];
              
              if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                tableStats.recordsWithAttachments++;
                if (hasLink) tableStats.recordsWithLinks++;
                
                // Check record age
                const recordDate = new Date(record.createdTime || '2000-01-01');
                const isOld = recordDate < cutoffDate;
                
                attachments.forEach(att => {
                  // Track by file type
                  const ext = att.filename.split('.').pop().toLowerCase();
                  const fileType = getFileCategory_(ext);
                  
                  if (!tableStats.byType[fileType]) {
                    tableStats.byType[fileType] = { count: 0, bytes: 0 };
                  }
                  if (!analysis.byFileType[fileType]) {
                    analysis.byFileType[fileType] = { count: 0, bytes: 0 };
                  }
                  
                  tableStats.byType[fileType].count++;
                  tableStats.byType[fileType].bytes += att.size || 0;
                  analysis.byFileType[fileType].count++;
                  analysis.byFileType[fileType].bytes += att.size || 0;
                  
                  // Track totals
                  tableStats.totalFiles++;
                  tableStats.totalBytes += att.size || 0;
                  analysis.totalAttachments++;
                  analysis.totalBytes += att.size || 0;
                  
                  // Track by age
                  if (isOld && !hasLink) {
                    tableStats.oldFiles++;
                    tableStats.oldBytes += att.size || 0;
                    analysis.oldAttachments++;
                    analysis.oldBytes += att.size || 0;
                  } else {
                    tableStats.newFiles++;
                    tableStats.newBytes += att.size || 0;
                    analysis.newAttachments++;
                    analysis.newBytes += att.size || 0;
                  }
                  
                  // Track large files
                  if (att.size > 5 * 1024 * 1024) { // Files over 5MB
                    analysis.largestFiles.push({
                      filename: att.filename,
                      size: att.size,
                      table: table.name,
                      isOld: isOld,
                      hasLink: !!hasLink,
                      recordDate: recordDate.toLocaleDateString()
                    });
                  }
                });
              }
            });
            
            // Sleep to avoid rate limits
            Utilities.sleep(1000);
            
          } catch (error) {
            Logger.log(`   ❌ Error analyzing field "${field.name}": ${error.toString()}`);
          }
        }
        
        // Log table summary
        if (tableStats.totalFiles > 0) {
          Logger.log(`\n   📊 Table Summary for "${table.name}":`);
          Logger.log(`      Total files: ${tableStats.totalFiles} (${formatBytes(tableStats.totalBytes)})`);
          Logger.log(`      Records with attachments: ${tableStats.recordsWithAttachments}`);
          Logger.log(`      Records with Box links: ${tableStats.recordsWithLinks}`);
          Logger.log(`      Old files (archivable): ${tableStats.oldFiles} (${formatBytes(tableStats.oldBytes)})`);
          Logger.log(`      Recent files: ${tableStats.newFiles} (${formatBytes(tableStats.newBytes)})`);
          
          Logger.log(`      By type:`);
          Object.entries(tableStats.byType).forEach(([type, stats]) => {
            Logger.log(`        - ${type}: ${stats.count} files (${formatBytes(stats.bytes)})`);
          });
          
          analysis.byTable[table.name] = tableStats;
        }
      }
      
      // Sort largest files
      analysis.largestFiles.sort((a, b) => b.size - a.size);
      
      // Final summary
      Logger.log('\n\n📊 === OVERALL SUMMARY ===');
      Logger.log(`Base: ${baseName}`);
      Logger.log(`Tables with attachments: ${analysis.tablesWithAttachments}`);
      Logger.log(`\n📦 TOTAL STORAGE:`);
      Logger.log(`  All files: ${analysis.totalAttachments} files (${formatBytes(analysis.totalBytes)})`);
      Logger.log(`  Archivable (>${getArchiveAgeMonths()} months): ${analysis.oldAttachments} files (${formatBytes(analysis.oldBytes)}) - ${Math.round(analysis.oldBytes/analysis.totalBytes*100)}%`);
      Logger.log(`  Recent (<${getArchiveAgeMonths()} months): ${analysis.newAttachments} files (${formatBytes(analysis.newBytes)}) - ${Math.round(analysis.newBytes/analysis.totalBytes*100)}%`);
      
      Logger.log(`\n📁 BY FILE TYPE:`);
      Object.entries(analysis.byFileType)
        .sort((a, b) => b[1].bytes - a[1].bytes)
        .forEach(([type, stats]) => {
          const pct = Math.round(stats.bytes/analysis.totalBytes*100);
          Logger.log(`  ${type}: ${stats.count} files (${formatBytes(stats.bytes)}) - ${pct}%`);
        });
      
      Logger.log(`\n🏆 LARGEST FILES (>5MB):`);
      analysis.largestFiles.slice(0, 10).forEach((file, i) => {
        const status = file.hasLink ? '✅ Archived' : (file.isOld ? '🕐 Archivable' : '🆕 Too new');
        Logger.log(`  ${i+1}. ${file.filename} - ${formatBytes(file.size)} - ${file.table} - ${status}`);
      });
      
      Logger.log(`\n💡 RECOMMENDATIONS:`);
      if (analysis.oldAttachments === 0) {
        Logger.log(`  ⚠️ No files older than ${getArchiveAgeMonths()} months found.`);
        Logger.log(`  💡 Consider reducing ARCHIVE_AGE_MONTHS if you want to archive newer files.`);
      } else {
        Logger.log(`  🎯 Can recover ${formatBytes(analysis.oldBytes)} by archiving ${analysis.oldAttachments} old files`);
      }
      
      // Check for non-image files
      const nonImageBytes = Object.entries(analysis.byFileType)
        .filter(([type]) => type !== 'Images')
        .reduce((sum, [, stats]) => sum + stats.bytes, 0);
      
      if (nonImageBytes > analysis.totalBytes * 0.3) {
        Logger.log(`  📎 ${Math.round(nonImageBytes/analysis.totalBytes*100)}% of storage is non-image files`);
      }
      
      return analysis;
      
    } catch (error) {
      Logger.log(`❌ Analysis failed: ${error.toString()}`);
      ErrorHandler.reportError(error, 'analyzeAirtableStorage', { baseId });
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
    Logger.log(`🕐 Only archiving records older than ${getArchiveAgeMonths()} months`);
    
    if (!apiKey || !boxToken) {
      return { success: false, error: 'Missing credentials' };
    }
    
    const stats = {
      recordsProcessed: 0,
      filesArchived: 0,
      errors: 0,
      recordsTooNew: 0,
      bytesArchived: 0,
      executionTimeMs: 0,
      largestFiles: [] // Track large files archived
    };
    
    // Track bytes if requested
    if (config.trackStats) {
      config._bytesArchived = 0;
    }
    
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
      
      // Get human-friendly table name for folder creation
      const tableName = getTableName_(config.baseId, config.tableName, apiKey);
      
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
      const targetFolderId = ensureBoxFolder_({
        ...config, 
        baseName: baseName,
        tableName: tableName  // Use resolved table name
      }, boxToken);
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
          tableId: tableId,
          trackStats: config.trackStats
        }, targetFolderId, apiKey, boxToken, stats); // Pass stats to track large files
        
        if (result.success) {
          stats.recordsProcessed++;
          stats.filesArchived += result.filesArchived || 0;
          if (result.bytesArchived) {
            stats.bytesArchived += result.bytesArchived;
          }
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
    
    // Log large files if any
    if (stats.largestFiles.length > 0) {
      Logger.log('\n🏆 Largest files archived:');
      stats.largestFiles.slice(0, 5).forEach((f, i) => {
        Logger.log(`  ${i+1}. ${f.filename} - ${formatBytes(f.size)}`);
      });
    }
    
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
  
  /**
   * Archive old attachments from an Airtable base
   * This is the main production function for weekly runs
   * @param {object} config Configuration object
   * @param {string} apiKey Airtable API Key  
   * @param {string} boxToken Valid Box access token
   */
  ns.archiveBase = function(config, apiKey, boxToken) {
    const BATCH_SIZE = parseInt(ConfigManager.getProperty('AIRTABLE_PROCESSING_BATCH_SIZE')) || 50;
    const RATE_LIMIT_MS = parseInt(ConfigManager.getProperty('AIRTABLE_SLEEP_DELAY_MS')) || 2000;
    const startTime = Date.now();
    const batchId = new Date().toISOString();
    
    if (!apiKey || !boxToken) {
      return { success: false, error: 'Missing credentials' };
    }
    
    const baseStats = {
      baseId: config.baseId,
      baseName: null,
      tablesProcessed: 0,
      tablesWithAttachments: 0,
      totalRecordsProcessed: 0,
      totalFilesArchived: 0,
      totalBytesArchived: 0,
      totalRecordsTooNew: 0,
      totalErrors: 0,
      executionTimeMs: 0,
      tableResults: [],
      largestFiles: []
    };
    
    try {
      // Get base name
      baseStats.baseName = getBaseName_(config.baseId, apiKey);
      Logger.log(`📦 === Archiving Base: ${baseStats.baseName} ===`);
      Logger.log(`🕐 Archiving attachments older than ${getArchiveAgeMonths()} months`);
      
      // Get all tables in base
      const tablesUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
      const tablesResponse = UrlFetchApp.fetch(tablesUrl, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      if (tablesResponse.getResponseCode() !== 200) {
        throw new Error(`Failed to fetch tables: ${tablesResponse.getResponseCode()}`);
      }
      
      const tables = JSON.parse(tablesResponse.getContentText()).tables || [];
      Logger.log(`📋 Found ${tables.length} tables`);
      
      // Process each table
      for (const table of tables) {
        // Check if table has attachment fields
        const attachmentFields = table.fields.filter(f => f.type === 'multipleAttachments');
        
        if (attachmentFields.length === 0) {
          continue; // Skip tables without attachments
        }
        
        baseStats.tablesWithAttachments++;
        
        // Process each attachment field in the table
        for (const attachmentField of attachmentFields) {
          const tableConfig = {
            baseId: config.baseId,
            tableName: table.id,
            attachmentFieldName: attachmentField.name,
            linkFieldName: ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link',
            maxRecords: BATCH_SIZE
          };
          
          // Archive this table/field combination
          const tableResult = ns.archiveTable(tableConfig, apiKey, boxToken);

          if (tableResult.success) {
            baseStats.totalRecordsProcessed += tableResult.recordsProcessed || 0;
            baseStats.totalFilesArchived += tableResult.filesArchived || 0;
            baseStats.totalBytesArchived += tableResult.bytesArchived || 0;
            baseStats.totalRecordsTooNew += tableResult.recordsTooNew || 0;
            baseStats.totalErrors += tableResult.errors || 0;
            
            // Collect large files
            if (tableResult.largestFiles && tableResult.largestFiles.length > 0) {
              baseStats.largestFiles.push(...tableResult.largestFiles);
            }
            
            if (tableResult.filesArchived > 0) {
              Logger.log(`   ✅ Table "${table.name}" - ${tableResult.filesArchived} files, ${formatBytes(tableResult.bytesArchived || 0)} recovered`);
              baseStats.tableResults.push({
                tableName: table.name,
                fieldName: attachmentField.name,
                filesArchived: tableResult.filesArchived,
                bytesArchived: tableResult.bytesArchived || 0
              });
            } else {
              Logger.log(`   ⏭️ Table "${table.name}" - No files needed archiving`);
            }
          } else {
            Logger.log(`   ❌ Table "${table.name}" - Failed to archive`);
          }      
        }
        
        baseStats.tablesProcessed++;
      }
      
    } catch (error) {
      Logger.log(`❌ Error: ${error.toString()}`);
      baseStats.error = error.toString();
    }
    
    baseStats.executionTimeMs = Date.now() - startTime;
    
    // Sort largest files
    baseStats.largestFiles.sort((a, b) => b.size - a.size);
    
    // Log summary
    Logger.log('\n📊 === Archival Summary ===');
    Logger.log(`Base: ${baseStats.baseName}`);
    Logger.log(`Tables: ${baseStats.tablesProcessed} processed, ${baseStats.tablesWithAttachments} had attachments`);
    Logger.log(`Files: ${baseStats.totalFilesArchived} archived`);
    Logger.log(`💾 Space recovered from Airtable: ${formatBytes(baseStats.totalBytesArchived)}`);
    Logger.log(`📦 Space added to Box: ${formatBytes(baseStats.totalBytesArchived)}`);
    Logger.log(`Records: ${baseStats.totalRecordsProcessed} processed, ${baseStats.totalRecordsTooNew} too recent`);
    Logger.log(`Time: ${(baseStats.executionTimeMs/1000).toFixed(1)}s`);  
    
    if (baseStats.totalBytesArchived > 0) {
      // Calculate impact
      const gbRecovered = (baseStats.totalBytesArchived / 1e9).toFixed(2);
      
      Logger.log(`\n🎉 === STORAGE IMPACT ===`);
      Logger.log(`💾 Freed ${gbRecovered} GB from Airtable!`);
      
      // Show largest files archived
      if (baseStats.largestFiles.length > 0) {
        Logger.log(`\n🏆 Largest files archived:`);
        baseStats.largestFiles.slice(0, 5).forEach((f, i) => {
          Logger.log(`  ${i+1}. ${f.filename} - ${formatBytes(f.size)}`);
        });
      }
    }
    
    saveStats_(baseStats);
    return { success: true, ...baseStats };
  };

  // Private helper functions

  function _formatHtmlReport(bases) {
    let html = `
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #333; }
          h1, h2 { color: #111; border-bottom: 1px solid #ddd; padding-bottom: 5px;}
          h1 { font-size: 24px; }
          h2 { font-size: 20px; margin-top: 30px; }
          table { border-collapse: collapse; width: 100%; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .summary { background-color: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 5px; margin-bottom: 15px; }
          .flag { font-weight: bold; }
          .flag.warn { color: orange; }
          .flag.danger { color: red; }
          .total-row { font-weight: bold; background-color: #f5f5f5; }
        </style>
      </head>
      <body>
        <h1>Airtable Usage Report - ${new Date().toLocaleDateString()}</h1>
    `;

    let workspaceTotalRecords = 0;
    let workspaceTotalBytes = 0;

    bases.forEach(base => {
      workspaceTotalRecords += base.totalRecords;
      workspaceTotalBytes += base.totalAttachmentSize;
      
      const recordPercent = Math.round((base.totalRecords / TEAM_PLAN_RECORD_LIMIT) * 100);
      const attachmentPercent = Math.round((base.totalAttachmentSize / (TEAM_PLAN_ATTACHMENT_LIMIT_GB * 1e9)) * 100);

      const recordFlag = recordPercent > 90 ? 'danger' : (recordPercent > 75 ? 'warn' : '');
      const attachmentFlag = attachmentPercent > 90 ? 'danger' : (attachmentPercent > 75 ? 'warn' : '');

      html += `
        <h2>${base.name}</h2>
        <div class="summary">
          <strong>Total Records:</strong> <span class="flag ${recordFlag}">${base.totalRecords.toLocaleString()} / ${TEAM_PLAN_RECORD_LIMIT.toLocaleString()} (${recordPercent}%)</span><br>
          <strong>Total Attachments:</strong> <span class="flag ${attachmentFlag}">${formatBytes(base.totalAttachmentSize)} / ${TEAM_PLAN_ATTACHMENT_LIMIT_GB} GB (${attachmentPercent}%)</span>
        </div>
      `;
      
      if (base.tables && base.tables.length > 0) {
        html += `
        <table>
          <thead>
            <tr>
              <th>Table Name</th>
              <th>Record Count</th>
              <th>Attachment Size</th>
              <th>Last Record Added</th>
            </tr>
          </thead>
          <tbody>
        `;
        
        // Sort tables by record count descending
        base.tables.sort((a,b) => b.recordCount - a.recordCount);

        base.tables.forEach(table => {
          html += `
            <tr>
              <td>${table.name}</td>
              <td>${table.recordCount.toLocaleString()}</td>
              <td>${formatBytes(table.attachmentSize)}</td>
              <td>${table.lastModified ? new Date(table.lastModified).toLocaleDateString() : 'N/A'}</td>
            </tr>
          `;
        });
        
        html += `
          </tbody>
        </table>
        `;
      }
    });

    // Add workspace totals
    const workspaceRecordPercent = Math.round((workspaceTotalRecords / TEAM_PLAN_RECORD_LIMIT) * 100);
    const workspaceAttachmentPercent = Math.round((workspaceTotalBytes / (TEAM_PLAN_ATTACHMENT_LIMIT_GB * 1e9)) * 100);
    
    html += `
      <h2>Workspace Totals</h2>
      <div class="summary">
        <strong>All Bases Combined:</strong><br>
        Records: ${workspaceTotalRecords.toLocaleString()} / ${TEAM_PLAN_RECORD_LIMIT.toLocaleString()} (${workspaceRecordPercent}%)<br>
        Attachments: ${formatBytes(workspaceTotalBytes)} / ${TEAM_PLAN_ATTACHMENT_LIMIT_GB} GB (${workspaceAttachmentPercent}%)
      </div>
    `;

    html += `</body></html>`;
    return html;
  }

  function _getTableStats(baseId, table, apiKey) {
    let recordCount = 0;
    let totalAttachmentSize = 0;
    let lastModified = null;
    let offset = null;

    Logger.log(`    Scanning table: ${table.name}...`);
    const attachmentField = table.fields.find(f => f.type === 'multipleAttachments');

    do {
      let url = `https://api.airtable.com/v0/${baseId}/${table.id}?pageSize=100`;
      if(offset) {
        url += `&offset=${offset}`;
      }

      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        muteHttpExceptions: true
      });

      if (response.getResponseCode() !== 200) {
        Logger.log(`      Could not fetch records for table ${table.name}. Skipping.`);
        break;
      }

      const data = JSON.parse(response.getContentText());
      const records = data.records || [];
      recordCount += records.length;

      records.forEach(record => {
        if (!lastModified || new Date(record.createdTime) > new Date(lastModified)) {
          lastModified = record.createdTime;
        }
        if (attachmentField && record.fields[attachmentField.name]) {
          record.fields[attachmentField.name].forEach(att => {
            totalAttachmentSize += att.size || 0;
          });
        }
      });
      
      offset = data.offset;
      if(offset) Utilities.sleep(250); // Rate limit between pages

    } while (offset);
    
    Logger.log(`      -> Found ${recordCount} records, ${formatBytes(totalAttachmentSize)}`);
    return { recordCount, attachmentSize: totalAttachmentSize, lastModified };
  }

  function analyzeBase_(base, apiKey, detailed) {
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
        totalRecords: 0,
        totalAttachmentSize: 0,
        tables: []
      };
      
      if (detailed) {
        tables.forEach(table => {
          const tableStats = _getTableStats(base.id, table, apiKey);
          analysis.tables.push({
            name: table.name,
            id: table.id,
            ...tableStats
          });
          analysis.totalRecords += tableStats.recordCount;
          analysis.totalAttachmentSize += tableStats.attachmentSize;
        });
      } else {
         // This is the old, faster estimation logic if detailed=false
        tables.forEach(table => {
            const attachmentField = table.fields.find(f => f.type === 'multipleAttachments');
            if (!attachmentField) return;
            const tableBytes = estimateTableSize_(base.id, table, attachmentField.name, apiKey);
            if (tableBytes > 0) {
              analysis.tables.push({
                name: table.name,
                attachmentField: attachmentField.name,
                attachmentSize: tableBytes, // Note: key is different
                recordCount: 0 // Not calculated in fast mode
              });
              analysis.totalAttachmentSize += tableBytes;
            }
        });
      }
      
      return analysis;
      
    } catch (error) {
       Logger.log(`Error analyzing base ${base.name}: ${error.toString()}`);
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
      // Build URL with optional view parameter
      let url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`;
      
      // Add view parameter if specified
      const params = [];
      if (config.viewName) {
        params.push(`view=${encodeURIComponent(config.viewName)}`);
      }
      
      if (params.length > 0) {
        url += '?' + params.join('&');
      }
      
      Logger.log(`📋 Fetching records from: ${url}`);
      
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to fetch records: ${response.getResponseCode()}`);
        return [];
      }
      
      const records = JSON.parse(response.getContentText()).records || [];
      
      // Calculate cutoff date
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - getArchiveAgeMonths());
      
      // Filter to records with attachments but no link, and old enough
      const filteredRecords = records.filter(r => {
        const attachments = r.fields[config.attachmentFieldName];
        const hasLink = r.fields[config.linkFieldName];
        
        // Check age - use createdTime if available
        const recordDate = new Date(r.createdTime || '2000-01-01');
        const isOldEnough = recordDate < cutoffDate;
        
        return attachments && attachments.length > 0 && !hasLink && isOldEnough;
      });
      
      Logger.log(`📊 Found ${records.length} total records, ${filteredRecords.length} need archiving`);
      
      return filteredRecords;
      
    } catch (error) {
      Logger.log(`❌ Error fetching records: ${error.toString()}`);
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
 * Sanitize folder name for Box compatibility
 * @private
 */
function sanitizeFolderName_(name) {
  if (!name) return 'Unknown';
  
  // Replace invalid characters with safe alternatives
  return name
    .replace(/\//g, '-')      // Replace forward slashes with hyphens
    .replace(/\\/g, '-')      // Replace backslashes with hyphens
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove non-printable ASCII
    .replace(/^\.+|\.+$/g, '') // Remove leading/trailing dots
    .replace(/^[\s]+|[\s]+$/g, '') // Remove leading/trailing whitespace
    .replace(/[^\u0000-\uFFFF]/g, '') // Remove characters outside basic multilingual plane
    .substring(0, 255); // Box has a 255 character limit for folder names
}
  /**
   * Get table name from API
   * @private
   */
  function getTableName_(baseId, tableNameOrId, apiKey) {
    try {
      // If it doesn't look like an ID, assume it's already a name
      if (!tableNameOrId.startsWith('tbl')) {
        return tableNameOrId;
      }
      
      const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const tables = JSON.parse(response.getContentText()).tables || [];
      const table = tables.find(t => t.id === tableNameOrId);
      return table ? table.name : tableNameOrId;
    } catch (error) {
      Logger.log(`Could not resolve table name: ${error.toString()}`);
      return tableNameOrId;
    }
  }
  
  /**
   * Get table ID for building proper Airtable URLs
   * @private
   */
  function getTableId_(baseId, tableName, apiKey) {
    try {
      // If tableName already looks like an ID, return it
      if (tableName.startsWith('tbl')) {
        return tableName;
      }
      
      const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      
      const tables = JSON.parse(response.getContentText()).tables || [];
      const table = tables.find(t => t.name === tableName || t.id === tableName);
      return table ? table.id : null;
    } catch (error) {
      Logger.log(`Error getting table ID: ${error.toString()}`);
      return null;
    }
  }
  
  /**
   * Ensures the Box link field exists in the table, creating it if necessary
   * @param {string} baseId Airtable base ID
   * @param {string} tableName Table name or ID
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
      
      // Find table by either name or ID
      const table = tables.find(t => t.name === tableName || t.id === tableName);
      
      if (!table) {
        Logger.log(`❌ Table "${tableName}" not found`);
        Logger.log(`Available tables: ${tables.map(t => `${t.name} (${t.id})`).join(', ')}`);
        return false;
      }
      
      Logger.log(`✅ Found table: ${table.name} (${table.id})`);
      
      // Check if field already exists
      const fieldExists = table.fields.some(f => f.name === linkFieldName);
      if (fieldExists) {
        Logger.log(`✅ Field "${linkFieldName}" already exists`);
        return true;
      }
      
      // Create the field
      Logger.log(`📝 Creating field "${linkFieldName}" in table "${table.name}"...`);
      
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
    
    // Sanitize folder names to remove invalid characters
    const baseFolderName = sanitizeFolderName_(config.baseName || config.baseId);
    const tableFolderName = sanitizeFolderName_(config.tableName || 'Unknown_Table');
    
    Logger.log(`📁 Creating folder structure: /Airtable/${baseFolderName}/${tableFolderName}/`);
    
    // Find or create each level
    const airtableId = findOrCreateFolder_('Airtable', rootId, boxToken);
    Logger.log(`  ✅ Airtable folder ID: ${airtableId}`);
    
    const baseId = findOrCreateFolder_(baseFolderName, airtableId, boxToken);
    Logger.log(`  ✅ Base folder ID: ${baseId}`);
    
    const tableFolderId = findOrCreateFolder_(tableFolderName, baseId, boxToken);
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
  
  function processRecord_(record, config, targetFolderId, apiKey, boxToken, tableStats) {
    const recordName = record.fields.Name || record.fields[Object.keys(record.fields)[0]] || record.id;
    
    // Check age again (in case of race conditions)
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - getArchiveAgeMonths());
    const recordDate = new Date(record.createdTime || '2000-01-01');
    
    if (recordDate >= cutoffDate) {
      Logger.log(`⏭️ Skipping ${recordName} - too new (created ${recordDate.toLocaleDateString()})`);
      return { success: false, tooNew: true };
    }
    
    try {
      const attachments = record.fields[config.attachmentFieldName];
      const uploadedFiles = [];
      let totalBytesArchived = 0;
      
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
      
      // Upload each attachment - NO SIZE CHECK
      for (const att of attachments) {
        const sizeMB = att.size / (1024 * 1024);
        if (sizeMB > 50) {
          Logger.log(`📦 Processing large file (${Math.round(sizeMB)}MB): ${att.filename}`);
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
            boxFileId: uploadResult.fileId,
            size: att.size
          });
          totalBytesArchived += (att.size || 0);
          
          // Track large files in stats
          if (tableStats && sizeMB > 5) {
            if (!tableStats.largestFiles) tableStats.largestFiles = [];
            tableStats.largestFiles.push({
              filename: att.filename,
              size: att.size
            });
          }
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
        
        // Process images for metadata
        uploadedFiles.forEach(file => {
          if (ConfigManager.isImageFile(file.filename)) {
            const fileSizeMB = file.size / (1024 * 1024);
            
            if (fileSizeMB > 20) {
              // Skip Vision API for large images
              Logger.log(`  🖼️ Skipping Vision API for large image ${file.filename} (${Math.round(fileSizeMB)}MB)`);
              
              // Still apply basic metadata
              try {
                const basicMetadata = {
                  originalFilename: file.filename,
                  fileFormat: file.filename.split('.').pop().toUpperCase(),
                  fileSizeMB: Math.round(fileSizeMB * 100) / 100,
                  processingStage: ConfigManager.PROCESSING_STAGE_BASIC,
                  processingVersion: ConfigManager.getCurrentVersion(),
                  notes: `Large file - Vision API skipped (${Math.round(fileSizeMB)}MB)`,
                  lastProcessedDate: new Date().toISOString()
                };
                
                BoxFileOperations.applyMetadata(file.boxFileId, basicMetadata, boxToken);
                Logger.log(`  ✅ Added basic metadata for large image`);
              } catch (e) {
                Logger.log(`  ⚠️ Could not add basic metadata: ${e.toString()}`);
              }
            } else {
              // Normal processing for smaller images
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
          }
        });
        
        return { 
          success: true, 
          filesArchived: uploadedFiles.length,
          bytesArchived: totalBytesArchived
        };
      }
      
      return { success: false, error: 'Failed to update record' };
      
    } catch (error) {
      return { success: false, error: error.toString() };
    }
  }
  
  function uploadToBoxWithMetadata_(attachment, folderId, boxToken, metadata) {
    try {
      const sizeMB = attachment.size / (1024 * 1024);
      
      // For very large files, add retry logic
      let retries = sizeMB > 100 ? 3 : 1;
      let lastError = null;
      
      while (retries > 0) {
        try {
          // Download from Airtable
          if (sizeMB > 50) {
            Logger.log(`  ⬇️ Downloading large file from Airtable (${Math.round(sizeMB)}MB)...`);
          }
          
          const response = UrlFetchApp.fetch(attachment.url, { muteHttpExceptions: true });
          if (response.getResponseCode() !== 200) {
            throw new Error(`Download failed: ${response.getResponseCode()}`);
          }
          
          // Upload to Box
          if (sizeMB > 50) {
            Logger.log(`  ⬆️ Uploading to Box...`);
          }
          
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
            // Success!
            const boxFile = JSON.parse(uploadResponse.getContentText()).entries[0];
            
            // Add metadata to the file
            const metadataTemplateKey = 'boxerArchiveMetadata';
            try {
              // Add note about file size to metadata
              const enhancedMetadata = {
                ...metadata,
                notes: sizeMB > 50 ? `Large file: ${Math.round(sizeMB)}MB` : undefined
              };
              BoxFileOperations.applyMetadata(boxFile.id, enhancedMetadata, boxToken, metadataTemplateKey);
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
              if (sizeMB > 50) {
                Logger.log(`  ✅ Large file archived successfully!`);
              }
              return { success: true, link, fileId: boxFile.id };
            }
          }
          
          throw new Error(`Upload failed: ${uploadResponse.getResponseCode()}`);
          
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            Logger.log(`  ⚠️ Error uploading, retrying... (${retries} attempts left)`);
            Utilities.sleep(5000); // Wait 5 seconds before retry
          }
        }
      }
      
      // All retries failed
      throw lastError;
      
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
  
  // Helper function to categorize file types
  function getFileCategory_(extension) {
    const ext = extension.toLowerCase();
    
    const categories = {
      'Images': ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'webp', 'heic', 'heif', 'svg'],
      'Documents': ['pdf', 'doc', 'docx', 'txt', 'rtf', 'odt'],
      'Spreadsheets': ['xls', 'xlsx', 'csv', 'ods'],
      'Videos': ['mp4', 'mov', 'avi', 'wmv', 'flv', 'mkv', 'webm'],
      'Audio': ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'],
      'Archives': ['zip', 'rar', '7z', 'tar', 'gz'],
      'Design': ['psd', 'ai', 'sketch', 'fig', 'xd', 'indd'],
      'CAD': ['dwg', 'dxf', 'step', 'stp', 'iges', 'stl'],
      'Other': []
    };
    
    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(ext)) {
        return category;
      }
    }
    
    return 'Other';
  }
  
  // Add helper function for bytes formatting
  function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

// Quick access function for analysis
function analyzeMyAirtableBase() {
  const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
  AirtableManager.analyzeStorage('appZDxOsDW7BzOJRg', apiKey);
}