// File: AirtableManager.js
const AirtableManager = (function() {
  'use strict';
  const ns = {};

  // Configuration
  const TEAM_PLAN_RECORD_LIMIT = 50000;
  const TEAM_PLAN_ATTACHMENT_LIMIT_GB = 20;

  ns.runGovernanceReport = function(apiKey) {
    Logger.log('📊 === Running Airtable Governance Process ===');
    const GOVERNANCE_BASE_ID = ConfigManager.getProperty('AIRTABLE_GOVERNANCE_BASE_ID');
    const GOVERNANCE_TABLE_NAME = ConfigManager.getProperty('AIRTABLE_GOVERNANCE_TABLE_NAME');
    const REPORTING_THRESHOLD = 0.75;
    const MONTHLY_REPORT_DAYS = 30;

    if (!apiKey || !GOVERNANCE_BASE_ID) {
      const msg = '❌ Missing Airtable API Key or AIRTABLE_GOVERNANCE_BASE_ID configuration.';
      Logger.log(msg);
      ErrorHandler.reportError(new Error(msg), 'runGovernanceReport');
      return { success: false, error: msg };
    }

    try {
      const managedBases = AirtableHelpers.fetchManagedBases(apiKey, GOVERNANCE_BASE_ID, GOVERNANCE_TABLE_NAME);
      if (!managedBases || managedBases.length === 0) {
        Logger.log('✅ No bases configured in the Governance Base. Exiting.');
        return { success: true, message: 'No managed bases found.' };
      }
      Logger.log(`Found ${managedBases.length} bases to manage.`);

      const workspaceUsage = ns.analyzeWorkspace(apiKey, true); // true for detailed analysis
      if (!workspaceUsage) {
        throw new Error('Failed to analyze workspace.');
      }

      AirtableHelpers.updateGovernanceBase(apiKey, GOVERNANCE_BASE_ID, GOVERNANCE_TABLE_NAME, managedBases, workspaceUsage);

      let reportsSent = 0;
      managedBases.forEach(base => {
        const usage = workspaceUsage.find(u => u.id === base.baseId);
        if (!usage) return;

        const recordPercent = usage.totalRecords / TEAM_PLAN_RECORD_LIMIT;
        const attachPercent = usage.totalAttachmentSize / (TEAM_PLAN_ATTACHMENT_LIMIT_GB * 1e9);

        const now = new Date();
        const lastReportDate = base.lastReportSent ? new Date(base.lastReportSent) : null;
        const daysSinceLastReport = lastReportDate ? (now - lastReportDate) / (1000 * 60 * 60 * 24) : Infinity;

        const needsReport = (recordPercent > REPORTING_THRESHOLD) ||
          (attachPercent > REPORTING_THRESHOLD) ||
          (daysSinceLastReport > MONTHLY_REPORT_DAYS);

        if (needsReport && base.businessOwner) {
          Logger.log(`  -> Sending report for "${base.baseName}" to ${base.businessOwner}`);
          const htmlReport = UtilitiesModule.formatIndividualHtmlReport(usage);
          const subject = `Airtable Usage Alert for: ${usage.name}`;
          MailApp.sendEmail({ to: base.businessOwner, subject: subject, htmlBody: htmlReport, name: 'Boxer for Airtable' });
          reportsSent++;
          AirtableHelpers.updateLastReportDate(apiKey, GOVERNANCE_BASE_ID, GOVERNANCE_TABLE_NAME, base.recordId);
          Utilities.sleep(1000);
        }
      });

      Logger.log(`✅ Governance process complete. Sent ${reportsSent} reports.`);
      return { success: true, reportsSent: reportsSent };

    } catch (error) {
      Logger.log(`❌ Error in runGovernanceReport: ${error.toString()}`);
      ErrorHandler.reportError(error, 'runGovernanceReport');
      return { success: false, error: error.toString() };
    }
  };

  ns.analyzeWorkspace = function(apiKey, detailed = false) {
    Logger.log('🔍 === Analyzing Airtable Workspace ===');
    if (!apiKey) {
      Logger.log('❌ No API key provided. Run: BoxerApp.setAirtableApiKey("YOUR_KEY")');
      return null;
    }
    try {
      const response = UrlFetchApp.fetch('https://api.airtable.com/v0/meta/bases', {
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        muteHttpExceptions: true
      });
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to list bases: ${response.getResponseCode()}`);
        Logger.log(`Response: ${response.getContentText()}`);
        return null;
      }
      const bases = JSON.parse(response.getContentText()).bases || [];
      Logger.log(`📊 Found ${bases.length} bases`);
      const results = [];
      bases.forEach((base, index) => {
        Logger.log(`\n[${index + 1}/${bases.length}] Analyzing base: ${base.name}`);
        const analysis = AirtableHelpers.analyzeBase(base, apiKey, detailed);
        if (analysis) results.push(analysis);
        Utilities.sleep(1000);
      });
      results.sort((a, b) => b.totalAttachmentSize - a.totalAttachmentSize);
      const totalGB = results.reduce((sum, b) => sum + b.totalAttachmentSize, 0) / 1e9;
      Logger.log(`\n📊 WORKSPACE TOTAL: ${totalGB.toFixed(2)} GB`);
      results.forEach((base, i) => {
        Logger.log(`\n${i+1}. ${base.name}: ${base.totalRecords} records, ${(base.totalAttachmentSize/1e9).toFixed(2)} GB`);
        if (base.tables) {
          base.tables.forEach(t => Logger.log(`   - ${t.name}: ${t.recordCount} records, ${(t.attachmentSize/1e6).toFixed(0)} MB`));
        }
      });
      return results;
    } catch (error) {
      Logger.log(`❌ Error in analyzeWorkspace: ${error.toString()}`);
      return null;
    }
  };

  ns.analyzeStorage = function(baseId, apiKey) {
    Logger.log('📊 === Detailed Airtable Storage Analysis ===');
    if (!apiKey) { Logger.log('❌ No API key found'); return; }

    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - UtilitiesModule.getArchiveAgeMonths());
    Logger.log(`📅 Archive age threshold: ${UtilitiesModule.getArchiveAgeMonths()} months`);
    Logger.log(`📅 Will archive files created before: ${cutoffDate.toLocaleDateString()}`);
    Logger.log(`🔍 Analyzing base: ${baseId}\n`);

    try {
      const baseName = AirtableHelpers.getBaseName(baseId, apiKey);
      Logger.log(`📦 Base Name: ${baseName}`);
      const tablesUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
      const tablesResponse = UrlFetchApp.fetch(tablesUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      const tables = JSON.parse(tablesResponse.getContentText()).tables || [];
      Logger.log(`📋 Found ${tables.length} tables in base\n`);
      const analysis = { totalAttachments: 0, totalBytes: 0, oldAttachments: 0, oldBytes: 0, newAttachments: 0, newBytes: 0, byFileType: {}, byTable: {}, tablesWithAttachments: 0, largestFiles: [] };
      for (const table of tables) {
        const attachmentFields = table.fields.filter(f => f.type === 'multipleAttachments');
        if (attachmentFields.length === 0) {
          Logger.log(`⏭️ Table "${table.name}" - No attachment fields`);
          continue;
        }
        analysis.tablesWithAttachments++;
        Logger.log(`\n📊 Analyzing table: ${table.name}`);
        Logger.log(`   Attachment fields: ${attachmentFields.map(f => f.name).join(', ')}`);
        const tableStats = { name: table.name, totalFiles: 0, totalBytes: 0, oldFiles: 0, oldBytes: 0, newFiles: 0, newBytes: 0, byType: {}, recordsWithAttachments: 0, recordsWithLinks: 0 };
        for (const field of attachmentFields) {
          try {
            const recordsUrl = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table.id)}?fields[]=${encodeURIComponent(field.name)}&fields[]=${encodeURIComponent(ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link')}`;
            const recordsResponse = UrlFetchApp.fetch(recordsUrl, { headers: { 'Authorization': `Bearer ${apiKey}` }, muteHttpExceptions: true });
            if (recordsResponse.getResponseCode() !== 200) {
              Logger.log(`   ❌ Failed to fetch records: ${recordsResponse.getResponseCode()}`);
              continue;
            }
            const data = JSON.parse(recordsResponse.getContentText());
            const records = data.records || [];
            Logger.log(`   📄 Found ${records.length} records`);
            records.forEach(record => {
              const attachments = record.fields[field.name];
              const hasLink = record.fields[ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link'];
              if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                tableStats.recordsWithAttachments++;
                if (hasLink) tableStats.recordsWithLinks++;
                const recordDate = new Date(record.createdTime || '2000-01-01');
                const isOld = recordDate < cutoffDate;
                attachments.forEach(att => {
                  const ext = att.filename.split('.').pop().toLowerCase();
                  const fileType = UtilitiesModule.getFileCategory(ext);
                  if (!tableStats.byType[fileType]) { tableStats.byType[fileType] = { count: 0, bytes: 0 }; }
                  if (!analysis.byFileType[fileType]) { analysis.byFileType[fileType] = { count: 0, bytes: 0 }; }
                  tableStats.byType[fileType].count++;
                  tableStats.byType[fileType].bytes += att.size || 0;
                  analysis.byFileType[fileType].count++;
                  analysis.byFileType[fileType].bytes += att.size || 0;
                  tableStats.totalFiles++;
                  tableStats.totalBytes += att.size || 0;
                  analysis.totalAttachments++;
                  analysis.totalBytes += att.size || 0;
                  if (isOld && !hasLink) {
                    tableStats.oldFiles++; tableStats.oldBytes += att.size || 0;
                    analysis.oldAttachments++; analysis.oldBytes += att.size || 0;
                  } else {
                    tableStats.newFiles++; tableStats.newBytes += att.size || 0;
                    analysis.newAttachments++; analysis.newBytes += att.size || 0;
                  }
                  if (att.size > 5 * 1024 * 1024) { // Files over 5MB
                    analysis.largestFiles.push({ filename: att.filename, size: att.size, table: table.name, isOld: isOld, hasLink: !!hasLink, recordDate: recordDate.toLocaleDateString() });
                  }
                });
              }
            });
            Utilities.sleep(1000);
          } catch (error) {
            Logger.log(`   ❌ Error analyzing field "${field.name}": ${error.toString()}`);
          }
        }
        if (tableStats.totalFiles > 0) {
          Logger.log(`\n   📊 Table Summary for "${table.name}":`);
          // ... Full logging of table stats ...
          analysis.byTable[table.name] = tableStats;
        }
      }
      analysis.largestFiles.sort((a, b) => b.size - a.size);
      // ... Full logging of overall summary ...
      return analysis;
    } catch (error) {
      Logger.log(`❌ Analysis failed: ${error.toString()}`);
      ErrorHandler.reportError(error, 'analyzeAirtableStorage', { baseId });
    }
  };

  ns.archiveTable = function(config, apiKey, boxToken) {
    const BATCH_SIZE = ConfigManager.getProperty('AIRTABLE_PROCESSING_BATCH_SIZE');
    const RATE_LIMIT_MS = ConfigManager.getProperty('AIRTABLE_SLEEP_DELAY_MS');
    const startTime = Date.now();
    const batchId = new Date().toISOString();
    Logger.log(`📦 === Archiving ${config.tableName} ===`);
    Logger.log(`🕐 Only archiving records older than ${UtilitiesModule.getArchiveAgeMonths()} months`);
    if (!apiKey || !boxToken) { return { success: false, error: 'Missing credentials' }; }
    const stats = { recordsProcessed: 0, filesArchived: 0, errors: 0, recordsTooNew: 0, bytesArchived: 0, executionTimeMs: 0, largestFiles: [] };
    if (config.trackStats) { config._bytesArchived = 0; }
    try {
      const linkFieldName = config.linkFieldName || ConfigManager.getProperty('AIRTABLE_LINK_FIELD');
      const fieldReady = AirtableHelpers.ensureLinkField(config.baseId, config.tableName, linkFieldName, apiKey);
      if (!fieldReady) { return { success: false, error: 'Failed to create/verify link field' }; }
      // const archiveTemplate = getOrCreateArchiveTemplate(boxToken); // Assuming this is global
      const baseName = AirtableHelpers.getBaseName(config.baseId, apiKey);
      const tableName = AirtableHelpers.getTableName(config.baseId, config.tableName, apiKey);
      const tableId = AirtableHelpers.getTableId(config.baseId, config.tableName, apiKey);
      if (tableId) { Logger.log(`📋 Table ID: ${tableId}`); }
      const records = AirtableHelpers.fetchRecords(config, apiKey);
      if (records.length === 0) {
        Logger.log('✅ No records to archive');
        return { success: true, ...stats };
      }
      Logger.log(`📋 Found ${records.length} records to process`);
      const targetFolderId = BoxHelpers.ensureBoxFolder({ ...config, baseName: baseName, tableName: tableName }, boxToken);
      if (!targetFolderId) { return { success: false, error: 'Failed to create Box folder' }; }
      const toProcess = records.slice(0, config.maxRecords || BATCH_SIZE);
      toProcess.forEach(record => {
        const result = BoxHelpers.processRecord(record, { ...config, batchId: batchId, baseName: baseName, linkFieldName: linkFieldName, tableId: tableId, trackStats: config.trackStats }, targetFolderId, apiKey, boxToken, stats);
        if (result.success) {
          stats.recordsProcessed++;
          stats.filesArchived += result.filesArchived || 0;
          if (result.bytesArchived) { stats.bytesArchived += result.bytesArchived; }
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
    // ... Final logging of stats ...
    UtilitiesModule.saveStats(stats);
    return { success: true, ...stats };
  };

  ns.archiveBase = function(config, apiKey, boxToken) {
    const BATCH_SIZE = parseInt(ConfigManager.getProperty('AIRTABLE_PROCESSING_BATCH_SIZE')) || 50;
    const startTime = Date.now();
    if (!apiKey || !boxToken) { return { success: false, error: 'Missing credentials' }; }
    const baseStats = { baseId: config.baseId, baseName: null, tablesProcessed: 0, tablesWithAttachments: 0, totalRecordsProcessed: 0, totalFilesArchived: 0, totalBytesArchived: 0, totalRecordsTooNew: 0, totalErrors: 0, executionTimeMs: 0, tableResults: [], largestFiles: [] };
    try {
      baseStats.baseName = AirtableHelpers.getBaseName(config.baseId, apiKey);
      Logger.log(`📦 === Archiving Base: ${baseStats.baseName} ===`);
      Logger.log(`🕐 Archiving attachments older than ${UtilitiesModule.getArchiveAgeMonths()} months`);
      const tablesUrl = `https://api.airtable.com/v0/meta/bases/${config.baseId}/tables`;
      const tablesResponse = UrlFetchApp.fetch(tablesUrl, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (tablesResponse.getResponseCode() !== 200) { throw new Error(`Failed to fetch tables: ${tablesResponse.getResponseCode()}`); }
      const tables = JSON.parse(tablesResponse.getContentText()).tables || [];
      Logger.log(`📋 Found ${tables.length} tables`);
      for (const table of tables) {
        const attachmentFields = table.fields.filter(f => f.type === 'multipleAttachments');
        if (attachmentFields.length === 0) { continue; }
        baseStats.tablesWithAttachments++;
        for (const attachmentField of attachmentFields) {
          const tableConfig = { baseId: config.baseId, tableName: table.id, attachmentFieldName: attachmentField.name, linkFieldName: ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link', maxRecords: BATCH_SIZE };
          const tableResult = ns.archiveTable(tableConfig, apiKey, boxToken);
          if (tableResult.success) {
            baseStats.totalRecordsProcessed += tableResult.recordsProcessed || 0;
            // ... aggregate other stats ...
            if (tableResult.filesArchived > 0) {
              Logger.log(`   ✅ Table "${table.name}" - ${tableResult.filesArchived} files, ${UtilitiesModule.formatBytes(tableResult.bytesArchived || 0)} recovered`);
              baseStats.tableResults.push({ tableName: table.name, fieldName: attachmentField.name, filesArchived: tableResult.filesArchived, bytesArchived: tableResult.bytesArchived || 0 });
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
    baseStats.largestFiles.sort((a, b) => b.size - a.size);
    // ... Final logging of base stats ...
    UtilitiesModule.saveStats(baseStats);
    return { success: true, ...baseStats };
  };

  ns.showStats = function() {
    Logger.log('📊 === Recent Airtable Archival Stats ===');
    const STATS_KEY = 'AIRTABLE_STATS'; // Should be shared or moved
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

  return ns;
})();