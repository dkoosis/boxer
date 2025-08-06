// File: UtilitiesModule.js
const UtilitiesModule = (function() {
  'use strict';
  const ns = {};

  const STATS_KEY = 'AIRTABLE_STATS';

  ns.getArchiveAgeMonths = function() {
    const configured = ConfigManager.getProperty('ARCHIVE_AGE_MONTHS');
    return configured ? parseInt(configured) : 6; // Default to 6 months
  };

  ns.formatBytes = function(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    if (bytes < 1) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  ns.formatIndividualHtmlReport = function(base) {
    const TEAM_PLAN_RECORD_LIMIT = 50000;
    const TEAM_PLAN_ATTACHMENT_LIMIT_GB = 20;

    const recordPercent = Math.round((base.totalRecords / TEAM_PLAN_RECORD_LIMIT) * 100);
    const attachmentPercent = Math.round((base.totalAttachmentSize / (TEAM_PLAN_ATTACHMENT_LIMIT_GB * 1e9)) * 100);
    const recordFlag = recordPercent > 90 ? 'danger' : (recordPercent > 75 ? 'warn' : '');
    const attachmentFlag = attachmentPercent > 90 ? 'danger' : (attachmentPercent > 75 ? 'warn' : '');

    let html = `
    <html>
      <head>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; color: #333; }
          h1, h2 { color: #111; border-bottom: 1px solid #ddd; padding-bottom: 5px;}
          table { border-collapse: collapse; width: 100%; margin-top: 15px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .summary { background-color: #f9f9f9; padding: 15px; border: 1px solid #eee; border-radius: 5px; margin-bottom: 15px; }
          .flag { font-weight: bold; }
          .flag.warn { color: orange; }
          .flag.danger { color: red; }
        </style>
      </head>
      <body>
        <h1>Airtable Usage Report for: ${base.name}</h1>
        <p>This is an automated report because this base is approaching its usage limits or it is time for its monthly review.</p>
        <div class="summary">
          <strong>Total Records:</strong> <span class="flag ${recordFlag}">${base.totalRecords.toLocaleString()} / 50,000 (${recordPercent}%)</span><br>
          <strong>Total Attachments:</strong> <span class="flag ${attachmentFlag}">${ns.formatBytes(base.totalAttachmentSize)} / 20 GB (${attachmentPercent}%)</span>
        </div>
    `;

    if (base.tables && base.tables.length > 0) {
      html += `
        <h2>Usage by Table</h2>
        <table>
          <thead><tr><th>Table Name</th><th>Record Count</th><th>Attachment Size</th></tr></thead>
          <tbody>
      `;
      base.tables.sort((a,b) => b.attachmentSize - a.attachmentSize).forEach(table => {
        html += `
          <tr>
            <td>${table.name}</td>
            <td>${table.recordCount.toLocaleString()}</td>
            <td>${ns.formatBytes(table.attachmentSize)}</td>
          </tr>
        `;
      });
      html += `</tbody></table>`;
    }
    html += `<p>Please review the base to see if any data can be archived or cleaned up. For questions, contact your technical support team.</p></body></html>`;
    return html;
  };

  ns.saveStats = function(stats) {
    try {
      const recentStats = ConfigManager.getState(STATS_KEY) || [];
      stats.timestamp = new Date().toISOString();
      recentStats.push(stats);

      if (recentStats.length > 20) {
        recentStats.splice(0, recentStats.length - 20);
      }

      ConfigManager.setState(STATS_KEY, recentStats);

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
  };

  ns.getFileCategory = function(extension) {
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
  };

  return ns;
})();