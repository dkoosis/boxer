// File: BoxHelpers.js
const BoxHelpers = (function() {
  'use strict';
  const ns = {};

  // This is a "private" helper function, not exposed on the 'ns' object.
  function findOrCreateFolder_(name, parentId, boxToken) {
    if (!name || !parentId || !boxToken) {
      throw new Error(`Invalid parameters: name=${name}, parentId=${parentId}, token=${boxToken ? 'present' : 'missing'}`);
    }
    const checkUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${parentId}/items?fields=id,name,type`;
    Logger.log(`    Checking for existing folder "${name}" in parent ${parentId}`);
    const response = UrlFetchApp.fetch(checkUrl, { headers: { 'Authorization': `Bearer ${boxToken}` }, muteHttpExceptions: true });
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

    Logger.log(`    Creating new folder "${name}"...`);
    const createResponse = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/folders`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${boxToken}`, 'Content-Type': 'application/json' },
      payload: JSON.stringify({ name: name, parent: { id: parentId } }),
      muteHttpExceptions: true
    });

    if (createResponse.getResponseCode() === 201) {
      const newFolder = JSON.parse(createResponse.getContentText());
      Logger.log(`    → Created new folder: ${newFolder.id}`);
      return newFolder.id;
    } else if (createResponse.getResponseCode() === 409) {
      // Handle race condition where folder was created between check and create
      const errorInfo = JSON.parse(createResponse.getContentText());
      if (errorInfo && errorInfo.context_info && errorInfo.context_info.conflicts) {
         const existingId = errorInfo.context_info.conflicts.id;
         if (existingId) {
             Logger.log(`    → Folder already exists (conflict), using existing ID: ${existingId}`);
             return existingId;
         }
      }
      // Fallback to re-fetching if conflict info is not as expected
      const recheckResponse = UrlFetchApp.fetch(checkUrl, { headers: { 'Authorization': `Bearer ${boxToken}` }});
      const items = JSON.parse(recheckResponse.getContentText()).entries || [];
      const existing = items.find(i => i.type === 'folder' && i.name === name);
      if (existing) return existing.id;
    }
    throw new Error(`Failed to create folder "${name}": ${createResponse.getResponseCode()} - ${createResponse.getContentText()}`);
  }

  // This is a "public" function for this module.
  ns.ensureBoxFolder = function(config, boxToken) {
    try {
      let rootId = ConfigManager.getProperty('BOX_AIRTABLE_ARCHIVE_FOLDER') || '0';
      if(rootId === '') rootId = '0';
      
      const baseFolderName = config.baseName || config.baseId;
      const tableFolderName = config.tableName || 'Unknown_Table';
      Logger.log(`📁 Creating folder structure: /Airtable/${baseFolderName}/${tableFolderName}/`);
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
  };

  // This is a "private" helper function.
  function uploadToBoxWithMetadata_(attachment, folderId, boxToken, metadata) {
    try {
      const sizeMB = attachment.size / (1024 * 1024);
      let retries = sizeMB > 100 ? 3 : 1;
      let lastError = null;
      while (retries > 0) {
        try {
          if (sizeMB > 50) { Logger.log(`  ⬇️ Downloading large file from Airtable (${Math.round(sizeMB)}MB)...`); }
          const response = UrlFetchApp.fetch(attachment.url, { muteHttpExceptions: true });
          if (response.getResponseCode() !== 200) { throw new Error(`Download failed: ${response.getResponseCode()}`); }
          if (sizeMB > 50) { Logger.log(`  ⬆️ Uploading to Box...`); }
          const uploadResponse = UrlFetchApp.fetch('https://upload.box.com/api/2.0/files/content', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${boxToken}` },
            payload: {
              attributes: JSON.stringify({ name: attachment.filename, parent: { id: folderId } }),
              file: response.getBlob()
            },
            muteHttpExceptions: true
          });
          if (uploadResponse.getResponseCode() === 201) {
            const boxFile = JSON.parse(uploadResponse.getContentText()).entries[0];
            const metadataTemplateKey = 'boxerArchiveMetadata';
            try {
              const enhancedMetadata = { ...metadata, notes: sizeMB > 50 ? `Large file: ${Math.round(sizeMB)}MB` : undefined };
              // Assuming BoxFileOperations is a global object or another module
              BoxFileOperations.applyMetadata(boxFile.id, enhancedMetadata, boxToken, metadataTemplateKey);
              Logger.log(`  📋 Added archive metadata to ${attachment.filename}`);
            } catch (e) {
              Logger.log(`  ⚠️ Could not add metadata to ${attachment.filename}: ${e.toString()}`);
            }
            const sharedLinkAccess = ConfigManager.getProperty('BOX_AIRTABLE_SHARED_LINK_ACCESS');
            const linkResponse = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/files/${boxFile.id}`, {
              method: 'PUT',
              headers: { 'Authorization': `Bearer ${boxToken}`, 'Content-Type': 'application/json' },
              payload: JSON.stringify({ shared_link: { access: sharedLinkAccess } }),
              muteHttpExceptions: true
            });
            if (linkResponse.getResponseCode() === 200) {
              const link = JSON.parse(linkResponse.getContentText()).shared_link.url;
              if (sizeMB > 50) { Logger.log(`  ✅ Large file archived successfully!`); }
              return { success: true, link, fileId: boxFile.id };
            }
          }
          throw new Error(`Upload failed: ${uploadResponse.getResponseCode()} - ${uploadResponse.getContentText()}`);
        } catch (error) {
          lastError = error;
          retries--;
          if (retries > 0) {
            Logger.log(`  ⚠️ Error uploading, retrying... (${retries} attempts left)`);
            Utilities.sleep(5000);
          }
        }
      }
      throw lastError;
    } catch (error) {
      Logger.log(`  ❌ Upload error: ${error.toString()}`);
      return { success: false };
    }
  }

  // This is a "public" function for this module.
  ns.processRecord = function(record, config, targetFolderId, apiKey, boxToken, tableStats) {
    const recordName = record.fields.Name || record.fields[Object.keys(record.fields)[0]] || record.id;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - UtilitiesModule.getArchiveAgeMonths());
    const recordDate = new Date(record.createdTime || '2000-01-01');
    if (recordDate >= cutoffDate) {
      Logger.log(`⏭️ Skipping ${recordName} - too new (created ${recordDate.toLocaleDateString()})`);
      return { success: false, tooNew: true };
    }
    try {
      const attachments = record.fields[config.attachmentFieldName];
      const uploadedFiles = [];
      let totalBytesArchived = 0;
      const recordUrl = config.tableId ? `https://airtable.com/${config.baseId}/${config.tableId}/${record.id}` : `https://airtable.com/${config.baseId}/${record.id}`;
      Logger.log(`  📌 Record URL: ${recordUrl}`);
      const keyFields = {};
      Object.keys(record.fields).forEach(fieldName => {
        if (fieldName !== config.attachmentFieldName && fieldName !== config.linkFieldName) {
          const value = record.fields[fieldName];
          if (value === null || value === undefined) { keyFields[fieldName] = null; } 
          else if (typeof value === 'string') { keyFields[fieldName] = value.length > 2000 ? value.substring(0, 2000) + '...' : value; } 
          else if (typeof value === 'number' || typeof value === 'boolean') { keyFields[fieldName] = value; } 
          else if (value instanceof Date) { keyFields[fieldName] = value.toISOString(); } 
          else if (Array.isArray(value)) { keyFields[fieldName] = value.slice(0, 10).join(', '); } 
          else if (typeof value === 'object') { try { keyFields[fieldName] = JSON.stringify(value).substring(0, 500); } catch (e) { keyFields[fieldName] = '[Complex Object]'; } }
        }
      });
      const metadata = {
        sourceSystem: 'airtable', sourceBaseId: config.baseId, sourceBaseName: config.baseName || config.baseId,
        sourceTableName: config.tableName, sourceRecordId: record.id, sourceRecordName: recordName, sourceRecordUrl: recordUrl,
        recordPrimaryField: recordName, recordKeyData: JSON.stringify(keyFields),
        recordCreatedDate: record.createdTime ? new Date(record.createdTime).toISOString() : new Date().toISOString(),
        archiveDate: new Date().toISOString(), archiveReason: 'storage_reduction', archiveVersion: ConfigManager.getCurrentVersion(),
        archiveBatch: config.batchId, retainOriginal: 'no'
      };
      for (const att of attachments) {
        const uploadResult = uploadToBoxWithMetadata_(att, targetFolderId, boxToken, { ...metadata, originalFilename: att.filename, originalFileSize: att.size });
        if (uploadResult.success) {
          uploadedFiles.push({ filename: att.filename, boxLink: uploadResult.link, boxFileId: uploadResult.fileId, size: att.size });
          totalBytesArchived += (att.size || 0);
          if (tableStats && att.size > 5 * 1024 * 1024) { // Files over 5MB
            if (!tableStats.largestFiles) tableStats.largestFiles = [];
            tableStats.largestFiles.push({ filename: att.filename, size: att.size });
          }
        }
      }
      if (uploadedFiles.length === 0) { return { success: false, error: 'No files were uploaded successfully' }; }
      const linkText = uploadedFiles.map(f => `${f.filename}: ${f.boxLink}`).join('\n');
      const updateResponse = UrlFetchApp.fetch(`https://api.airtable.com/v0/${config.baseId}/${encodeURIComponent(config.tableName)}/${record.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        payload: JSON.stringify({ fields: { [config.linkFieldName]: linkText, [config.attachmentFieldName]: [] } }),
        muteHttpExceptions: true
      });
      if (updateResponse.getResponseCode() === 200) {
        Logger.log(`✅ Archived: ${recordName} (${uploadedFiles.length} files)`);
        uploadedFiles.forEach(file => {
          if (ConfigManager.isImageFile(file.filename)) {
            const fileSizeMB = file.size / (1024 * 1024);
            if (fileSizeMB > 20) {
              Logger.log(`  🖼️ Skipping Vision API for large image ${file.filename} (${Math.round(fileSizeMB)}MB)`);
              try {
                const basicMetadata = { /* ... */ };
                BoxFileOperations.applyMetadata(file.boxFileId, basicMetadata, boxToken);
              } catch (e) { /* ... */ }
            } else {
              try {
                Logger.log(`  🖼️ Processing image metadata for ${file.filename}...`);
                const fileDetails = { id: file.boxFileId, name: file.filename, path_collection: { entries: [] } };
                const imageMetadata = MetadataExtraction.orchestrateFullExtraction(fileDetails, boxToken);
                BoxFileOperations.applyMetadata(file.boxFileId, imageMetadata, boxToken);
              } catch (e) { /* ... */ }
            }
          }
        });
        return { success: true, filesArchived: uploadedFiles.length, bytesArchived: totalBytesArchived };
      }
      return { success: false, error: `Failed to update record: ${updateResponse.getContentText()}` };
    } catch (error) { return { success: false, error: error.toString() }; }
  };

  return ns;
})();