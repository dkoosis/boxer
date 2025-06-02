// File: VersionUtilities.gs
// Build tracking and version management utilities for Boxer
// Depends on: Config.gs, BoxAuth.gs, BoxFileOperations.gs

/**
 * VersionUtilities namespace for managing build tracking and version-based reprocessing.
 * Provides utilities to track script versions and trigger reprocessing when builds change.
 */
var VersionUtilities = (function() {
  'use strict';
  
  var ns = {};
  
  /**
   * Display current build information.
   */
  ns.showCurrentBuild = function() {
    var versionInfo = Config.getVersionInfo();
    
    Logger.log('=== 🐕 Boxer Build Information ===');
    Logger.log('Script Version: ' + versionInfo.scriptVersion);
    Logger.log('Build Number: ' + versionInfo.buildNumber);
    Logger.log('Build Date: ' + versionInfo.buildDate);
    Logger.log('Full Version: ' + versionInfo.fullVersion);
    Logger.log('=====================================');
    
    return versionInfo;
  };
  
  /**
   * Analyze version distribution across processed files.
   * @param {string} accessToken Valid Box access token
   */
  ns.analyzeVersionDistribution = function(accessToken) {
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    Logger.log('=== 🔍 Boxer Version Distribution Analysis ===\n');
    
    try {
      // Use optimized search to find processed images
      var searchQueries = ['type:file .jpg', 'type:file .png', 'type:file .jpeg'];
      var versionCounts = {};
      var totalProcessed = 0;
      var totalUnprocessed = 0;
      var needsUpdate = 0;
      
      var currentVersion = Config.getCurrentVersionString();
      
      Logger.log('🎯 Current version: ' + currentVersion);
      Logger.log('🔍 Analyzing file versions...\n');
      
      searchQueries.forEach(function(query) {
        try {
          var searchUrl = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                         '&limit=200&fields=id,name';
          
          var response = UrlFetchApp.fetch(searchUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
          });
          
          if (response.getResponseCode() === 200) {
            var data = JSON.parse(response.getContentText());
            
            data.entries.forEach(function(file) {
              if (BoxFileOperations.isImageFile(file.name)) {
                var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
                
                if (metadata) {
                  totalProcessed++;
                  var fileVersion = metadata.processingVersion || metadata.scriptVersion || 'unknown';
                  
                  versionCounts[fileVersion] = (versionCounts[fileVersion] || 0) + 1;
                  
                  if (Config.shouldReprocessForVersion(fileVersion)) {
                    needsUpdate++;
                  }
                } else {
                  totalUnprocessed++;
                }
              }
            });
          }
          
          Utilities.sleep(200); // Rate limiting
        } catch (error) {
          Logger.log('Error searching ' + query + ': ' + error.toString());
        }
      });
      
      // Display results
      Logger.log('📊 ANALYSIS RESULTS:');
      Logger.log('Total processed files: ' + totalProcessed);
      Logger.log('Total unprocessed files: ' + totalUnprocessed);
      Logger.log('Files needing version update: ' + needsUpdate);
      Logger.log('');
      
      if (Object.keys(versionCounts).length > 0) {
        Logger.log('🏷️ VERSION DISTRIBUTION:');
        
        Object.keys(versionCounts)
          .sort(function(a, b) { return versionCounts[b] - versionCounts[a]; })
          .forEach(function(version) {
            var count = versionCounts[version];
            var isCurrent = version === currentVersion;
            var status = isCurrent ? '✅ CURRENT' : '⚠️ OLD';
            
            Logger.log('  ' + version + ': ' + count + ' files ' + status);
          });
      }
      
      Logger.log('');
      
      // Recommendations
      Logger.log('💡 RECOMMENDATIONS:');
      if (needsUpdate > 0) {
        Logger.log('🦴 Run version update processing for ' + needsUpdate + ' outdated files');
        Logger.log('   Use: processAllOutdatedFiles() or processBoxImagesOptimized()');
      }
      if (totalUnprocessed > 0) {
        Logger.log('📦 Process ' + totalUnprocessed + ' unprocessed files');
        Logger.log('   Use: processBoxImagesOptimized()');
      }
      if (needsUpdate === 0 && totalUnprocessed === 0) {
        Logger.log('🎉 All files are up-to-date with current Boxer version!');
      }
      
      return {
        currentVersion: currentVersion,
        totalProcessed: totalProcessed,
        totalUnprocessed: totalUnprocessed,
        needsUpdate: needsUpdate,
        versionDistribution: versionCounts
      };
      
    } catch (error) {
      Logger.log('❌ Error analyzing versions: ' + error.toString());
      return null;
    }
  };
  
  /**
   * Process all files that have outdated versions.
   * @param {number} maxFiles Maximum number of files to process (default: 50)
   */
  ns.processAllOutdatedFiles = function(maxFiles) {
    maxFiles = maxFiles || 50;
    
    Logger.log('=== 🔄 Processing Outdated Files ===');
    Logger.log('🐕 Boxer is updating outdated files to version ' + Config.getCurrentVersionString());
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    try {
      var processed = 0;
      var errors = 0;
      var skipped = 0;
      
      // Search for image files
      var searchQueries = ['type:file .jpg', 'type:file .png', 'type:file .jpeg'];
      
      for (var i = 0; i < searchQueries.length && processed < maxFiles; i++) {
        var query = searchQueries[i];
        
        try {
          var searchUrl = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                         '&limit=100&fields=id,name,size';
          
          var response = UrlFetchApp.fetch(searchUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
          });
          
          if (response.getResponseCode() === 200) {
            var data = JSON.parse(response.getContentText());
            
            for (var j = 0; j < data.entries.length && processed < maxFiles; j++) {
              var file = data.entries[j];
              
              if (BoxFileOperations.isImageFile(file.name)) {
                var metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
                
                if (metadata) {
                  var fileVersion = metadata.processingVersion || metadata.scriptVersion;
                  
                  if (Config.shouldReprocessForVersion(fileVersion)) {
                    Logger.log('🔄 Updating ' + file.name + ' from ' + fileVersion + ' to ' + Config.getCurrentVersionString());
                    
                    try {
                      // Use the enhanced processing function which includes version tracking
                      MetadataExtraction.processSingleImageBasic(file, accessToken);
                      processed++;
                      
                      // Brief pause between files
                      Utilities.sleep(500);
                      
                    } catch (error) {
                      Logger.log('❌ Error processing ' + file.name + ': ' + error.toString());
                      errors++;
                    }
                  } else {
                    skipped++;
                  }
                }
              }
            }
          }
          
          Utilities.sleep(1000); // Pause between search queries
          
        } catch (error) {
          Logger.log('Error with search query ' + query + ': ' + error.toString());
          errors++;
        }
      }
      
      Logger.log('\n📊 VERSION UPDATE COMPLETE:');
      Logger.log('✅ Updated: ' + processed + ' files');
      Logger.log('⏭️ Skipped (up-to-date): ' + skipped + ' files');
      Logger.log('❌ Errors: ' + errors + ' files');
      
      if (processed === maxFiles) {
        Logger.log('⚠️ Hit max file limit (' + maxFiles + '). Run again to process more files.');
      }
      
      return {
        processed: processed,
        skipped: skipped,
        errors: errors,
        reachedLimit: processed === maxFiles
      };
      
    } catch (error) {
      Logger.log('❌ Error in processAllOutdatedFiles: ' + error.toString());
      return null;
    }
  };
  
  /**
   * Test version tracking on a single file.
   * @param {string} fileId Optional specific file ID to test
   */
  ns.testVersionTracking = function(fileId) {
    Logger.log('=== 🧪 Testing Version Tracking ===');
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    try {
      // Find a test file if not specified
      if (!fileId) {
        var testImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
        if (testImages.length === 0) {
          Logger.log('❌ No test images found');
          return;
        }
        fileId = testImages[0].id;
        Logger.log('🎯 Testing with: ' + testImages[0].name);
      }
      
      Logger.log('🔍 Analyzing current metadata...');
      
      // Get current metadata
      var currentMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken);
      var currentVersion = Config.getCurrentVersionString();
      
      if (currentMetadata) {
        var fileVersion = currentMetadata.processingVersion || currentMetadata.scriptVersion || 'none';
        var processingCount = currentMetadata.processingCount || 0;
        var firstProcessed = currentMetadata.firstProcessedDate || 'never';
        var lastProcessed = currentMetadata.lastProcessedDate || 'never';
        
        Logger.log('📋 Current Status:');
        Logger.log('  File version: ' + fileVersion);
        Logger.log('  Current version: ' + currentVersion);
        Logger.log('  Processing count: ' + processingCount);
        Logger.log('  First processed: ' + firstProcessed);
        Logger.log('  Last processed: ' + lastProcessed);
        Logger.log('  Needs update: ' + Config.shouldReprocessForVersion(fileVersion));
        
        if (currentMetadata.processingNotes) {
          Logger.log('  Processing notes: ' + currentMetadata.processingNotes.substring(0, 100) + '...');
        }
      } else {
        Logger.log('📋 No existing metadata found');
      }
      
      Logger.log('\n🔄 Testing version-aware processing...');
      
      // Test the version-aware processing
      MetadataExtraction.processSingleImageBasic({ id: fileId, name: 'test-file' }, accessToken);
      
      Logger.log('\n🔍 Checking updated metadata...');
      
      // Get updated metadata
      var updatedMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken);
      
      if (updatedMetadata) {
        Logger.log('📋 Updated Status:');
        Logger.log('  New version: ' + (updatedMetadata.processingVersion || 'none'));
        Logger.log('  New processing count: ' + (updatedMetadata.processingCount || 0));
        Logger.log('  Script version: ' + (updatedMetadata.scriptVersion || 'none'));
        Logger.log('  Build number: ' + (updatedMetadata.buildNumber || 'none'));
        
        if (updatedMetadata.processingNotes) {
          Logger.log('  Updated notes: ' + updatedMetadata.processingNotes.substring(0, 150) + '...');
        }
        
        Logger.log('\n✅ Version tracking test complete!');
      } else {
        Logger.log('❌ No metadata found after processing');
      }
      
    } catch (error) {
      Logger.log('❌ Version tracking test failed: ' + error.toString());
    }
  };
  
  /**
   * Utility to manually increment build number.
   * Use this when making significant changes to processing logic.
   * @param {string} newBuildNumber New build number (format: YYYYMMDD.###)
   */
  ns.updateBuildNumber = function(newBuildNumber) {
    Logger.log('⚠️ MANUAL BUILD UPDATE');
    Logger.log('This function is for documentation only.');
    Logger.log('To update the build number:');
    Logger.log('1. Edit Config.gs');
    Logger.log('2. Update BUILD_NUMBER constant to: ' + newBuildNumber);
    Logger.log('3. Update BUILD_DATE if needed');
    Logger.log('4. Consider updating SCRIPT_VERSION for major changes');
    Logger.log('5. Save and redeploy');
    Logger.log('\nCurrent build: ' + Config.BUILD_NUMBER);
    Logger.log('Suggested new build: ' + newBuildNumber);
  };
  
  /**
   * Generate a suggested build number based on current date.
   * @returns {string} Suggested build number
   */
  ns.generateBuildNumber = function() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var dateStr = year + month + day;
    
    // Simple increment logic - in practice you'd track this better
    var increment = '001';
    var suggested = dateStr + '.' + increment;
    
    Logger.log('💡 Suggested build number for today: ' + suggested);
    Logger.log('Format: YYYYMMDD.increment');
    Logger.log('Current: ' + Config.BUILD_NUMBER);
    
    return suggested;
  };
  
  return ns;
})();

/**
 * Quick access functions for common version operations
 */

/**
 * Show current Boxer build info
 */
function showBoxerBuild() {
  return VersionUtilities.showCurrentBuild();
}

/**
 * Analyze version distribution across files
 */
function analyzeFileVersions() {
  const accessToken = getValidAccessToken();
  return VersionUtilities.analyzeVersionDistribution(accessToken);
}

/**
 * Process files with outdated versions (limit to 25 for safety)
 */
function updateOutdatedFiles() {
  return VersionUtilities.processAllOutdatedFiles(25);
}

/**
 * Test version tracking on sample file
 */
function testVersionSystem() {
  return VersionUtilities.testVersionTracking();
}