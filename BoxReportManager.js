var ReportManager = (function() {
    var rm = {};
    rm.findLatestReport = function(accessToken) {
        Logger.log('--- Starting Detailed Report Search ---');
        const rootReportsFolderId = Config.REPORTS_FOLDER_ID;
        try {
            const folderItemsUrl = `${Config.BOX_API_BASE_URL}/folders/${rootReportsFolderId}/items?fields=id,name,type,created_at&limit=250&sort=date&direction=DESC`;
            const folderResponse = UrlFetchApp.fetch(folderItemsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
            if (folderResponse.getResponseCode() !== 200) { return null; }
            const folderItems = JSON.parse(folderResponse.getContentText()).entries;
            const subfolders = folderItems.filter(item => item.type === 'folder' && item.name.startsWith('Folder and File Tree run on'));
            if (subfolders.length === 0) { return null; }
            const latestSubfolder = subfolders[0];
            Logger.log(`Identified latest report subfolder: "${latestSubfolder.name}"`);
            const subfolderItemsUrl = `${Config.BOX_API_BASE_URL}/folders/${latestSubfolder.id}/items?fields=id,name,type,created_at&limit=100`;
            const subfolderResponse = UrlFetchApp.fetch(subfolderItemsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
            if (subfolderResponse.getResponseCode() !== 200) { return null; }
            const subfolderItems = JSON.parse(subfolderResponse.getContentText()).entries;
            const reportFile = subfolderItems.find(item => item.name.startsWith('folder_and_file_tree_run_on_') && item.name.endsWith('.csv'));
            if (reportFile) {
                Logger.log(`Found correct report file: "${reportFile.name}"`);
                return { id: reportFile.id, name: reportFile.name, created_at: reportFile.created_at };
            }
            return null;
        } catch (error) { return null; }
    };
    rm.cacheReportToDrive = function(checkpoint, latestReport, accessToken) {
        const reportContentUrl = `${Config.BOX_API_BASE_URL}/files/${latestReport.id}/content`;
        const reportResponse = UrlFetchApp.fetch(reportContentUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
        if (reportResponse.getResponseCode() !== 200) { return null; }
        const reportContent = reportResponse.getContentText();
        if (checkpoint && checkpoint.driveFileId) { try { DriveApp.getFileById(checkpoint.driveFileId).setTrashed(true); } catch (e) {} }
        const folder = Config.DRIVE_CACHE_FOLDER_ID ? DriveApp.getFolderById(Config.DRIVE_CACHE_FOLDER_ID) : DriveApp.getRootFolder();
        const driveFile = folder.createFile(`boxer_report_cache_${latestReport.id}.csv`, reportContent);
        return driveFile.getId();
    };
    rm.verifyReport = function(reportInfo, reportContent) {
        Logger.log("Performing sanity checks on the report...");
        const reportAgeDays = (new Date() - new Date(reportInfo.created_at)) / (1000 * 60 * 60 * 24);
        if (reportAgeDays > 8) { Logger.log(`WARNING: The latest report found is ${Math.round(reportAgeDays)} days old.`); }
        else { Logger.log(`  ✓ Report timestamp is recent (${reportAgeDays.toFixed(1)} days old).`); }
        const lines = reportContent.split('\n');
        const header = lines[0] || '';
        const expectedHeaders = ["Path", "Item Name", "Item ID", "Metadata"];
        if (expectedHeaders.some(h => !header.includes(h))) { return false; }
        return true;
    };
    return rm;
  })();

  ns.parseReport = function(reportContent) {
      const files = [];
      const lines = reportContent.split('\n');
      if (lines.length < 2) { return files; }
      const header = lines[0].trim().split(',');
      const itemNameCol = header.indexOf("Item Name");
      const itemIdCol = header.indexOf("Item ID");
      if (itemNameCol === -1 || itemIdCol === -1) { return files; }
      for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const columns = line.split(',');
          if (columns.length > Math.max(itemNameCol, itemIdCol)) {
              const fileName = columns[itemNameCol].replace(/"/g, '').trim();
              const fileId = columns[itemIdCol].replace(/"/g, '').trim();
              if (fileId && /^\d+$/.test(fileId) && BoxFileOperations.isImageFile(fileName)) {
                  files.push({ id: fileId, name: fileName });
              }
          }
      }
      Logger.log(`Parsed report and found ${files.length} valid image files to consider for processing.`);
      return files;
  };

  ns.run = function() {
    var startTime = Date.now();
    Logger.log(`--- Boxer Report Processing Run Started: ${new Date().toISOString()} ---`);
    var accessToken = getValidAccessToken();
    if (!accessToken) return;
    var latestReport = ReportManager.findLatestReport(accessToken);
    if (!latestReport) { Logger.log("Could not find a report to process. Exiting."); return; }
    var checkpointStr = Config.SCRIPT_PROPERTIES.getProperty(Config.REPORT_PROCESSING_CHECKPOINT);
    var checkpoint = checkpointStr ? JSON.parse(checkpointStr) : {};
    if (checkpoint.boxReportId !== latestReport.id) {
        var newDriveFileId = ReportManager.cacheReportToDrive(checkpoint, latestReport, accessToken);
        if (!newDriveFileId) { Logger.log("Failed to cache new report to Drive. Aborting run."); return; }
        checkpoint = { boxReportId: latestReport.id, driveFileId: newDriveFileId };
        Config.SCRIPT_PROPERTIES.setProperty(Config.REPORT_PROCESSING_CHECKPOINT, JSON.stringify(checkpoint));
    }
    var driveFile = DriveApp.getFileById(checkpoint.driveFileId);
    var reportContent = driveFile.getBlob().getDataAsString();
    if (!ReportManager.verifyReport(latestReport, reportContent)) {
        Logger.log("Aborting run due to invalid report.");
        return;
    }
    var allReportFiles = ns.parseReport(reportContent); 
    var processedIds = TrackingDB.getSuccessfullyProcessedIds();
    var filesToProcess = allReportFiles.filter(file => !processedIds.has(file.id));
    Logger.log(`${allReportFiles.length} valid image files in report, ${processedIds.size} already processed. ${filesToProcess.length} files need processing.`);
    if (filesToProcess.length === 0) { Logger.log("No new files to process."); return; }
    var batchResults = [];
    for (var i = 0; i < filesToProcess.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) { Logger.log("Execution time limit reached."); break; }
        const file = filesToProcess[i];
        var result = { id: file.id, name: file.name, status: "Unknown", notes: "" };
        try {
            var processingStatus = ns.processFileIfNeeded(file, accessToken);
            result.status = (processingStatus === 'processed') ? 'Success' : 'Failed';
            result.notes = (processingStatus !== 'processed' && processingStatus !== 'skipped') ? "Processing function returned: " + processingStatus : "";
        } catch(e) {
            result.status = "Failed";
            result.notes = e.toString().substring(0, 500);
        }
        batchResults.push(result);
        if (batchResults.length >= BATCH_SIZE || i === filesToProcess.length - 1) {
            TrackingDB.updateBatch(batchResults);
            batchResults = [];
        }
    }
    if (batchResults.length > 0) { TrackingDB.updateBatch(batchResults); }
    Logger.log(`--- Boxer Report Processing Run Finished. ---`);
  };
  
  ns.processFileIfNeeded = function(file, accessToken) {
    if (!file || !file.id || !file.name) return 'error';
    try {
      var fileDetailsUrl = `${Config.BOX_API_BASE_URL}/files/${file.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
      var response = UrlFetchApp.fetch(fileDetailsUrl, { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true });
      if (response.getResponseCode() !== 200) { return 'error_fetch_details'; }
      var fileDetails = JSON.parse(response.getContentText());
      Logger.log(`ℹ️ Processing: ${fileDetails.name}`);
      var metadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
      var success = BoxFileOperations.applyMetadata(file.id, metadata, accessToken);
      return success ? 'processed' : 'error_apply_metadata';
    } catch (error) { return 'error_exception'; }
  };

  return ns;
})();
