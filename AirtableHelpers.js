// File: AirtableHelpers.js
const AirtableHelpers = (function() {
  'use strict';
  const ns = {};

  ns.fetchManagedBases = function(apiKey, baseId, tableName) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
    const response = UrlFetchApp.fetch(url, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      throw new Error(`Could not fetch from Governance Base: ${response.getContentText()}`);
    }

    const data = JSON.parse(response.getContentText());
    return data.records.map(r => ({
      recordId: r.id,
      baseId: r.fields['Base ID'],
      baseName: r.fields['Base Name'],
      businessOwner: r.fields['Business Owner'],
      lastReportSent: r.fields['Last Report Sent']
    }));
  };

  ns.updateGovernanceBase = function(apiKey, baseId, tableName, managedBases, workspaceUsage) {
    Logger.log('Updating governance base with latest stats...');
    const recordsToUpdate = [];
    const TEAM_PLAN_RECORD_LIMIT = 50000;
    const TEAM_PLAN_ATTACHMENT_LIMIT_GB = 20;

    managedBases.forEach(base => {
      const usage = workspaceUsage.find(u => u.id === base.baseId);
      if (usage) {
        recordsToUpdate.push({
          id: base.recordId,
          fields: {
            'Base Name': usage.name,
            'Total Records': usage.totalRecords,
            'Record Limit %': usage.totalRecords / TEAM_PLAN_RECORD_LIMIT,
            'Total Attachments (GB)': usage.totalAttachmentSize / 1e9,
            'Attachment Limit %': usage.totalAttachmentSize / (TEAM_PLAN_ATTACHMENT_LIMIT_GB * 1e9),
            'Last Usage Sync': new Date().toISOString()
          }
        });
      }
    });

    if (recordsToUpdate.length > 0) {
      const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
      UrlFetchApp.fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        payload: JSON.stringify({ records: recordsToUpdate }),
        muteHttpExceptions: true
      });
    }
  };

  ns.updateLastReportDate = function(apiKey, baseId, tableName, recordId) {
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}`;
    UrlFetchApp.fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify({
        records: [{
          id: recordId,
          fields: { 'Last Report Sent': new Date().toISOString() }
        }]
      }),
      muteHttpExceptions: true
    });
  };

  ns.getTableStats = function(baseId, table, apiKey) {
    let recordCount = 0;
    let totalAttachmentSize = 0;
    let lastModified = null;
    let offset = null;

    Logger.log(`    Scanning table: ${table.name}...`);
    const attachmentField = table.fields.find(f => f.type === 'multipleAttachments');

    do {
      let url = `https://api.airtable.com/v0/${baseId}/${table.id}?pageSize=100`;
      if (offset) {
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
      if (offset) Utilities.sleep(250); // Rate limit between pages

    } while (offset);

    Logger.log(`      -> Found ${recordCount} records, ${UtilitiesModule.formatBytes(totalAttachmentSize)}`);
    return { recordCount, attachmentSize: totalAttachmentSize, lastModified };
  };

  ns.analyzeBase = function(base, apiKey, detailed) {
    try {
      const response = UrlFetchApp.fetch(
        `https://api.airtable.com/v0/meta/bases/${base.id}/tables`, { headers: { 'Authorization': `Bearer ${apiKey}` }, muteHttpExceptions: true }
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
          const tableStats = ns.getTableStats(base.id, table, apiKey);
          analysis.tables.push({
            name: table.name,
            id: table.id,
            ...tableStats
          });
          analysis.totalRecords += tableStats.recordCount;
          analysis.totalAttachmentSize += tableStats.attachmentSize;
        });
      } else {
        tables.forEach(table => {
          const attachmentField = table.fields.find(f => f.type === 'multipleAttachments');
          if (!attachmentField) return;
          const tableBytes = ns.estimateTableSize(base.id, table, attachmentField.name, apiKey);
          if (tableBytes > 0) {
            analysis.tables.push({
              name: table.name,
              attachmentField: attachmentField.name,
              attachmentSize: tableBytes,
              recordCount: 0
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
  };

  ns.estimateTableSize = function(baseId, table, fieldName, apiKey) {
    try {
      const response = UrlFetchApp.fetch(
        `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table.name)}?maxRecords=100&fields[]=${encodeURIComponent(fieldName)}`, { headers: { 'Authorization': `Bearer ${apiKey}` }, muteHttpExceptions: true }
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

      if (recordCount === 100 && data.offset) {
        return totalBytes * 10; // Simple extrapolation
      }
      return totalBytes;
    } catch (error) {
      return 0;
    }
  };

  ns.fetchRecords = function(config, apiKey) {
    try {
      let url = `https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}`;

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

      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - UtilitiesModule.getArchiveAgeMonths());

      const filteredRecords = records.filter(r => {
        const attachments = r.fields[config.attachmentFieldName];
        const hasLink = r.fields[config.linkFieldName];
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
  };

  ns.getBaseName = function(baseId, apiKey) {
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
  };

  ns.getTableName = function(baseId, tableNameOrId, apiKey) {
    try {
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
  };

  ns.getTableId = function(baseId, tableName, apiKey) {
    try {
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
  };
  
  ns.ensureLinkField = function(baseId, tableName, linkFieldName, apiKey) {
    try {
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
      const table = tables.find(t => t.name === tableName || t.id === tableName);

      if (!table) {
        Logger.log(`❌ Table "${tableName}" not found`);
        Logger.log(`Available tables: ${tables.map(t => `${t.name} (${t.id})`).join(', ')}`);
        return false;
      }
      Logger.log(`✅ Found table: ${table.name} (${table.id})`);
      const fieldExists = table.fields.some(f => f.name === linkFieldName);
      if (fieldExists) {
        Logger.log(`✅ Field "${linkFieldName}" already exists`);
        return true;
      }

      Logger.log(`📝 Creating field "${linkFieldName}" in table "${table.name}"...`);
      const createFieldUrl = `https://api.airtable.com/v0/meta/bases/${baseId}/tables/${table.id}/fields`;
      const createResponse = UrlFetchApp.fetch(createFieldUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        payload: JSON.stringify({
          name: linkFieldName,
          type: 'multilineText',
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
  };

  return ns;
})();