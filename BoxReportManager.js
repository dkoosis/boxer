// File: BoxReportManager.js
// Box report management with proper integration for new Config system
// Depends on: Config.js, BoxAuth.js, BoxFileOperations.js

/**
 * BoxReportManager - Manages Box weekly reports and systematic file processing
 */
var BoxReportManager = (function () {
  "use strict";

  var ns = {};

  // Constants
  var MAX_EXECUTION_TIME_MS = 4.5 * 60 * 1000; // 4.5 minutes safety margin
  var BATCH_SIZE = 8;
  var CHECKPOINT_KEY = "REPORT_CHECKPOINT"; // For Cache Service
  var STATS_KEY = "REPORT_STATS"; // For Cache Service

  /**
   * ReportManager - handles finding and caching Box reports
   */
  var ReportManager = {
    /**
     * Find the latest Box report in the reports folder
     * @param {string} accessToken Valid Box access token
     * @returns {object|null} Report info or null if not found
     */
    findLatestReport: function (accessToken) {
      Logger.log("--- Starting Box Report Search ---");
      var rootReportsFolderId = Config.getProperty("BOX_REPORTS_FOLDER");

      if (!rootReportsFolderId) {
        Logger.log("❌ BOX_REPORTS_FOLDER not configured");
        return null;
      }

      try {
        // Get folders in the reports directory (sorted by date DESC)
        var folderItemsUrl =
          Config.BOX_API_BASE_URL +
          "/folders/" +
          rootReportsFolderId +
          "/items?fields=id,name,type,created_at&limit=250&sort=date&direction=DESC";

        var folderResponse = UrlFetchApp.fetch(folderItemsUrl, {
          headers: { Authorization: "Bearer " + accessToken },
          muteHttpExceptions: true,
        });

        if (folderResponse.getResponseCode() !== 200) {
          Logger.log(
            "❌ Failed to list reports folder. HTTP: " +
              folderResponse.getResponseCode()
          );
          return null;
        }

        var folderItems = JSON.parse(folderResponse.getContentText()).entries;
        var reportSubfolders = folderItems.filter(function (item) {
          return (
            item.type === "folder" &&
            item.name.startsWith("Folder and File Tree run on")
          );
        });

        if (reportSubfolders.length === 0) {
          Logger.log("❌ No report subfolders found");
          return null;
        }

        var latestSubfolder = reportSubfolders[0];
        Logger.log(
          '✅ Found latest report subfolder: "' + latestSubfolder.name + '"'
        );

        // Look for CSV file in the subfolder
        var subfolderItemsUrl =
          Config.BOX_API_BASE_URL +
          "/folders/" +
          latestSubfolder.id +
          "/items?fields=id,name,type,created_at&limit=100";

        var subfolderResponse = UrlFetchApp.fetch(subfolderItemsUrl, {
          headers: { Authorization: "Bearer " + accessToken },
          muteHttpExceptions: true,
        });

        if (subfolderResponse.getResponseCode() !== 200) {
          Logger.log("❌ Failed to list subfolder contents");
          return null;
        }

        var subfolderItems = JSON.parse(
          subfolderResponse.getContentText()
        ).entries;
        var reportFile = subfolderItems.find(function (item) {
          return (
            item.name.startsWith("folder_and_file_tree_run_on_") &&
            item.name.endsWith(".csv")
          );
        });

        if (reportFile) {
          Logger.log('✅ Found report file: "' + reportFile.name + '"');
          return {
            id: reportFile.id,
            name: reportFile.name,
            created_at: reportFile.created_at,
            subfolder: latestSubfolder.name,
          };
        }

        Logger.log("❌ No CSV report file found in subfolder");
        return null;
      } catch (error) {
        Logger.log("❌ Exception finding latest report: " + error.toString());
        return null;
      }
    },

    /**
     * Cache report content to Google Drive
     * @param {object} checkpoint Current checkpoint data
     * @param {object} latestReport Report info object
     * @param {string} accessToken Valid Box access token
     * @returns {string|null} Google Drive file ID or null on error
     */
    cacheReportToDrive: function (checkpoint, latestReport, accessToken) {
      Logger.log("📥 Caching report to Google Drive...");

      try {
        // Download report content from Box first
        var reportContentUrl =
          Config.BOX_API_BASE_URL + "/files/" + latestReport.id + "/content";
        var reportResponse = UrlFetchApp.fetch(reportContentUrl, {
          headers: { Authorization: "Bearer " + accessToken },
          muteHttpExceptions: true,
        });

        if (reportResponse.getResponseCode() !== 200) {
          Logger.log(
            "❌ Failed to download report content from Box. HTTP: " +
              reportResponse.getResponseCode()
          );
          return null;
        }
        var reportContent = reportResponse.getContentText();

        // Delete old cached report if it exists
        if (checkpoint && checkpoint.driveFileId) {
          try {
            DriveApp.getFileById(checkpoint.driveFileId).setTrashed(true);
          } catch (e) {
            Logger.log("⚠️ Could not delete old cached report: " + e.message);
          }
        }

        var folder;
        var cacheFolderId = Config.getProperty("BOXER_CACHE_FOLDER");
        if (cacheFolderId) {
          try {
            folder = DriveApp.getFolderById(cacheFolderId);
            // Ensure folder is named "Boxer"
            if (folder.getName() !== "Boxer") {
              folder.setName("Boxer");
            }
          } catch (e) {
            Logger.log("⚠️ Could not access Boxer folder. Using root folder.");
            folder = DriveApp.getRootFolder();
          }
        }

        // Keep the original Box report filename
        var fileName =
          "box_report_" +
          latestReport.id +
          "_" +
          new Date().toISOString().slice(0, 10) +
          ".csv";
        var fileName =
          "boxer_report_cache_" +
          latestReport.id +
          "_" +
          new Date().toISOString().slice(0, 10) +
          ".csv";
        var driveFile = folder.createFile(fileName, reportContent);

        Logger.log("✅ Report cached to Drive: " + driveFile.getId());
        return driveFile.getId();
      } catch (error) {
        Logger.log("❌ Exception caching report: " + error.toString());
        if (typeof ErrorHandler !== "undefined") {
          ErrorHandler.reportError(
            error,
            "BoxReportManager.cacheReportToDrive",
            {
              reportId: latestReport ? latestReport.id : "unknown",
            }
          );
        }
        return null;
      }
    },

    /**
     * Verify report content and structure
     * @param {object} reportInfo Report information object
     * @param {string} reportContent CSV content string
     * @returns {boolean} True if report appears valid
     */
    verifyReport: function (reportInfo, reportContent) {
      Logger.log("🔍 Performing report validation...");

      try {
        // Check report age
        var reportAgeDays =
          (new Date() - new Date(reportInfo.created_at)) /
          (1000 * 60 * 60 * 24);
        if (reportAgeDays > 8) {
          Logger.log(
            "⚠️ WARNING: Report is " + Math.round(reportAgeDays) + " days old"
          );
        } else {
          Logger.log(
            "✅ Report age is acceptable (" +
              reportAgeDays.toFixed(1) +
              " days)"
          );
        }

        // Check basic CSV structure
        var lines = reportContent.split("\n");
        if (lines.length < 2) {
          Logger.log("❌ Report appears empty (less than 2 lines)");
          return false;
        }

        var header = lines[0] || "";
        var expectedHeaders = ["Path", "Item Name", "Item ID", "Metadata"];
        var hasAllHeaders = expectedHeaders.every(function (h) {
          return header.includes(h);
        });

        if (!hasAllHeaders) {
          Logger.log(
            "❌ Report missing expected headers: " + expectedHeaders.join(", ")
          );
          Logger.log("📋 Found headers: " + header);
          return false;
        }

        Logger.log("✅ Report structure validation passed");
        Logger.log("📊 Report contains " + (lines.length - 1) + " data rows");
        return true;
      } catch (error) {
        Logger.log(
          "❌ Exception during report verification: " + error.toString()
        );
        return false;
      }
    },
  };

  /**
   * Parse report CSV content using a robust CSV parser to extract image files.
   * @param {string} reportContent CSV content string
   * @returns {object[]} Array of image file objects
   */
  ns.parseReport = function (reportContent) {
    Logger.log("📊 Parsing report content with robust CSV parser...");

    try {
      // Use the robust Utilities.parseCsv() which handles commas inside quoted fields.
      var csvData = Utilities.parseCsv(reportContent);

      if (!csvData || csvData.length < 2) {
        Logger.log("⚠️ No data rows found in report");
        return [];
      }

      var headers = csvData[0].map(function (h) {
        return h.trim();
      });
      var dataRows = csvData.slice(1);

      // Find the index of the columns we need
      var itemNameIndex = headers.indexOf("Item Name");
      var itemIdIndex = headers.indexOf("Item ID");
      var pathIndex = headers.indexOf("Path");
      var metadataIndex = headers.indexOf("Metadata");
      var pathIdIndex = headers.indexOf("Path ID");

      if (
        itemNameIndex === -1 ||
        itemIdIndex === -1 ||
        metadataIndex === -1 ||
        pathIdIndex === -1
      ) {
        Logger.log("❌ Report missing required headers");
        return [];
      }

      Logger.log(
        "📋 CSV parsed with " +
          dataRows.length +
          " rows and " +
          headers.length +
          " columns"
      );
      Logger.log("🏷️ Headers found: " + headers.join(", "));

      // Filter to only image files
      var imageFiles = [];
      var filesWithMetadataCount = 0;

      dataRows.forEach(function (row) {
        var itemName = row[itemNameIndex] || "";
        var itemId = row[itemIdIndex] || "";
        var path = row[pathIndex] || "";
        var metadata = row[metadataIndex] || "";
        var pathId = row[pathIdIndex] || "";

        // Check if it's an image file and has a valid ID
        if (
          itemName &&
          itemId &&
          Config.isImageFile(itemName) &&
          /^\d+$/.test(itemId)
        ) {
          var hasMetadata =
            metadata &&
            (metadata.includes(Config.getProperty("BOX_IMAGE_METADATA_ID")) ||
              metadata.includes("comprehensiveImageMetadata")); // Legacy name

          if (hasMetadata) {
            filesWithMetadataCount++;
          }

          // Extract parent folder ID from the path ID string
          var parentId = null;
          if (pathId) {
            var ids = pathId.split("/");
            if (ids.length >= 2) {
              parentId = ids[ids.length - 2];
            }
          }

          imageFiles.push({
            id: itemId,
            name: itemName,
            path: path,
            hasMetadata: hasMetadata,
            metadata: metadata,
            parentId: parentId,
          });
        }
      });

      var percentageWithMetadata = 0;
      if (imageFiles.length > 0) {
        percentageWithMetadata = (
          (filesWithMetadataCount / imageFiles.length) *
          100
        ).toFixed(1);
      }

      Logger.log("✅ Parsed " + imageFiles.length + " image files from report");
      Logger.log(
        "📊 Files with metadata: " +
          filesWithMetadataCount +
          " (" +
          percentageWithMetadata +
          "%)"
      );
      Logger.log(
        "📊 Files without metadata: " +
          (imageFiles.length - filesWithMetadataCount)
      );

      return imageFiles;
    } catch (error) {
      if (typeof ErrorHandler !== "undefined") {
        ErrorHandler.reportError(error, "BoxReportManager.parseReport");
      }
      return [];
    }
  };

  /**
   * Main report processing function
   * @returns {object|null} Processing results or null on error
   */
  ns.runReportBasedProcessing = function () {
    var startTime = Date.now();
    Logger.log("🐕 === Boxer Report-Based Processing Started ===");

    var accessToken = getValidAccessToken();
    if (!accessToken) return null;

    // Resolve priority folder to its full path name if configured
    var testFolderPath = "";
    var testFolderId = Config.getProperty("BOX_PRIORITY_FOLDER");

    if (testFolderId) {
      try {
        var folderDetailsUrl =
          Config.BOX_API_BASE_URL +
          "/folders/" +
          testFolderId +
          "?fields=name,path_collection";
        var folderResponse = UrlFetchApp.fetch(folderDetailsUrl, {
          headers: { Authorization: "Bearer " + accessToken },
          muteHttpExceptions: true,
        });

        if (folderResponse.getResponseCode() === 200) {
          var folderDetails = JSON.parse(folderResponse.getContentText());
          var parentPath = folderDetails.path_collection.entries
            .map((p) => p.name)
            .join("/");
          testFolderPath = parentPath
            ? `${parentPath}/${folderDetails.name}`
            : folderDetails.name;
          Logger.log(`✅ Priority folder resolved to: "${testFolderPath}"`);
        }
      } catch (e) {
        Logger.log(`⚠️ Could not resolve priority folder: ${e.toString()}`);
      }
    }

    var stats = {
      reportFound: false,
      filesInReport: 0,
      filesProcessed: 0,
      filesSkipped: 0,
      filesErrored: 0,
      executionTimeMs: 0,
    };

    try {
      var latestReport = ReportManager.findLatestReport(accessToken);
      if (!latestReport) return stats;
      stats.reportFound = true;

      // Load checkpoint from Cache Service
      var checkpoint = Config.getState(CHECKPOINT_KEY) || {};

      if (checkpoint.boxReportId !== latestReport.id) {
        var newDriveFileId = ReportManager.cacheReportToDrive(
          checkpoint,
          latestReport,
          accessToken
        );
        if (!newDriveFileId) return stats;
        checkpoint = {
          boxReportId: latestReport.id,
          driveFileId: newDriveFileId,
          processedFileIds: [],
          lastUpdated: new Date().toISOString(),
        };
      }

      var driveFile = DriveApp.getFileById(checkpoint.driveFileId);
      var reportContent = driveFile.getBlob().getDataAsString();
      if (!ReportManager.verifyReport(latestReport, reportContent))
        return stats;

      var allReportFiles = ns.parseReport(reportContent);
      stats.filesInReport = allReportFiles.length;

      var processedIds = new Set(checkpoint.processedFileIds || []);
      var filesToConsider = allReportFiles.filter(
        (file) => !processedIds.has(file.id)
      );

      var priorityFiles = [];
      var generalFiles = [];

      if (testFolderPath) {
        filesToConsider.forEach(function (file) {
          if (
            file.path &&
            (file.path === testFolderPath ||
              (file.path + "/").startsWith(testFolderPath + "/"))
          ) {
            priorityFiles.push(file);
          } else {
            generalFiles.push(file);
          }
        });
        Logger.log(
          `Found ${priorityFiles.length} files within priority folder: "${testFolderPath}"`
        );
      } else {
        generalFiles = filesToConsider;
      }

      var prioritizedFiles = priorityFiles.concat(generalFiles);
      Logger.log(
        `📊 Total: ${allReportFiles.length}, Already Processed: ${processedIds.size}, To Process: ${prioritizedFiles.length}`
      );

      if (prioritizedFiles.length === 0) {
        Logger.log("🎉 No files require processing at this time.");
        return stats;
      }

      var filesToProcessNow = prioritizedFiles.slice(0, BATCH_SIZE);
      Logger.log(
        `🔄 Processing ${filesToProcessNow.length} files in this batch...`
      );

      for (var i = 0; i < filesToProcessNow.length; i++) {
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          Logger.log("⏰ Execution time limit reached.");
          break;
        }
        var file = filesToProcessNow[i];
        var result = ns.processFileFromReport(file, accessToken);
        checkpoint.processedFileIds.push(file.id);
        if (result === "processed") stats.filesProcessed++;
        else if (result === "skipped") stats.filesSkipped++;
        else stats.filesErrored++;
      }

      // Save checkpoint to Cache Service
      checkpoint.lastUpdated = new Date().toISOString();
      Config.setState(CHECKPOINT_KEY, checkpoint);

      stats.executionTimeMs = Date.now() - startTime;
      stats.checkpoint = checkpoint; // Return checkpoint for Main.js

      Logger.log("📊 === Processing Batch Complete ===");
      Logger.log(
        `✅ Processed: ${stats.filesProcessed}, ⏭️ Skipped: ${stats.filesSkipped}, ❌ Errors: ${stats.filesErrored}`
      );

      // Save stats
      ns.saveProcessingStats(stats);

      return stats;
    } catch (error) {
      Logger.log(`❌ Critical error in report processing: ${error.toString()}`);
      if (typeof ErrorHandler !== "undefined") {
        ErrorHandler.reportError(error, "runReportBasedProcessing");
      }
      return stats;
    }
  };

  /**
   * Process a single file from the report
   * @param {object} file File object from report
   * @param {string} accessToken Valid Box access token
   * @returns {string} Result: 'processed', 'skipped', or 'error'
   */
  ns.processFileFromReport = function (file, accessToken) {
    if (!file || !file.id || !file.name) {
      Logger.log("❌ Invalid file object");
      return "error";
    }

    try {
      Logger.log("🔄 Processing: " + file.name + " (ID: " + file.id + ")");

      // Get full file details from Box
      var fileDetailsUrl =
        Config.BOX_API_BASE_URL +
        "/files/" +
        file.id +
        "?fields=id,name,size,path_collection,created_at,modified_at,parent";

      var response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { Authorization: "Bearer " + accessToken },
        muteHttpExceptions: true,
      });

      if (response.getResponseCode() !== 200) {
        Logger.log(
          "❌ Failed to get file details for " +
            file.name +
            " (HTTP: " +
            response.getResponseCode() +
            ")"
        );
        return "error";
      }

      var fileDetails = JSON.parse(response.getContentText());

      // Check if file already has current metadata
      var currentMetadata = BoxFileOperations.getCurrentMetadata(
        file.id,
        accessToken
      );
      var needsProcessing =
        !currentMetadata ||
        currentMetadata.processingStage ===
          Config.PROCESSING_STAGE_UNPROCESSED ||
        currentMetadata.buildNumber !== Config.BUILD_NUMBER;

      if (!needsProcessing) {
        Logger.log("⏭️ Skipping " + file.name + " (already processed)");
        return "skipped";
      }

      // Extract comprehensive metadata
      var extractedMetadata = MetadataExtraction.extractMetadata(
        fileDetails,
        accessToken
      );

      // Apply metadata to Box
      var success = BoxFileOperations.applyMetadata(
        file.id,
        extractedMetadata,
        accessToken
      );

      if (success) {
        Logger.log("✅ Successfully processed: " + file.name);
        return "processed";
      } else {
        Logger.log("❌ Failed to apply metadata for: " + file.name);
        return "error";
      }
    } catch (error) {
      Logger.log(
        "❌ Exception processing " + file.name + ": " + error.toString()
      );
      if (typeof ErrorHandler !== "undefined") {
        ErrorHandler.reportError(error, "processFileFromReport", {
          fileId: file.id,
        });
      }
      return "error";
    }
  };

  /**
   * Save processing statistics
   * @param {object} stats Processing statistics object
   */
  ns.saveProcessingStats = function (stats) {
    try {
      // Save to tracking sheet if configured
      var sheetId = Config.getProperty("BOXER_TRACKING_SHEET");
      if (sheetId) {
        var sheet = SpreadsheetApp.openById(sheetId).getSheetByName(
          Config.PROCESSING_STATS_SHEET_NAME
        );

        if (sheet) {
          sheet.appendRow([
            new Date().toISOString(),
            "Report Processing",
            stats.filesInReport || 0,
            stats.filesProcessed || 0,
            stats.filesSkipped || 0,
            stats.filesErrored || 0,
            (stats.executionTimeMs || 0) / 1000,
            Config.BUILD_NUMBER,
          ]);
        }
      }

      // Also save recent stats to cache
      var recentStats = Config.getState(STATS_KEY) || [];
      stats.timestamp = new Date().toISOString();
      recentStats.push(stats);

      // Keep only last 20 runs
      if (recentStats.length > 20) {
        recentStats = recentStats.slice(-20);
      }

      Config.setState(STATS_KEY, recentStats);
    } catch (error) {
      Logger.log("❌ Error saving processing stats: " + error.toString());
    }
  };

  /**
   * Show recent processing statistics
   */
  ns.showProcessingStats = function () {
    Logger.log("📊 === Recent Boxer Report Processing Stats ===");

    try {
      var recentStats = Config.getState(STATS_KEY) || [];

      if (recentStats.length === 0) {
        Logger.log("📋 No processing stats available yet");
        return;
      }

      recentStats.slice(-10).forEach(function (run, index) {
        var date = new Date(run.timestamp).toLocaleString();
        Logger.log("");
        Logger.log("📅 Run " + (index + 1) + " - " + date);
        Logger.log("  📊 Report Found: " + (run.reportFound ? "✅" : "❌"));
        Logger.log("  📁 Files in Report: " + run.filesInReport);
        Logger.log("  ✅ Processed: " + run.filesProcessed);
        Logger.log("  ⏭️ Skipped: " + run.filesSkipped);
        Logger.log("  ❌ Errors: " + run.filesErrored);
        Logger.log(
          "  ⏱️ Time: " + (run.executionTimeMs / 1000).toFixed(1) + "s"
        );
      });

      // Show current checkpoint status
      var checkpoint = Config.getState(CHECKPOINT_KEY);
      if (checkpoint) {
        var processedCount = checkpoint.processedFileIds
          ? checkpoint.processedFileIds.length
          : 0;

        Logger.log("");
        Logger.log("📍 Current Checkpoint:");
        Logger.log("  📊 Report ID: " + checkpoint.boxReportId);
        Logger.log("  ✅ Files Processed: " + processedCount);
        Logger.log("  🕐 Last Updated: " + checkpoint.lastUpdated);
      }
    } catch (error) {
      Logger.log("❌ Error showing stats: " + error.toString());
    }
  };

  /**
   * Reset processing checkpoint (start over)
   */
  ns.resetProcessingCheckpoint = function () {
    Logger.log("🔄 Resetting Boxer processing checkpoint...");

    try {
      // Clear from Cache Service
      CacheService.getScriptCache().remove(CHECKPOINT_KEY);
      Logger.log("✅ Processing checkpoint reset - next run will start fresh");
    } catch (error) {
      Logger.log("❌ Error resetting checkpoint: " + error.toString());
    }
  };

  return ns;
})();

// Convenience functions for easy access
function runBoxReportProcessing() {
  return BoxReportManager.runReportBasedProcessing();
}

function showBoxerStats() {
  return BoxReportManager.showProcessingStats();
}

function resetBoxerCheckpoint() {
  return BoxReportManager.resetProcessingCheckpoint();
}
