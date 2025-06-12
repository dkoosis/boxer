// File: VersionManager.js
// Build and script version management utilities.
// Merges logic from BuildManagement.js and VersionUtilities.js.
// Depends on: Config.js, BoxAuth.js, BoxFileOperations.js, MetadataExtraction.js

/**
 * VersionManager namespace for managing build tracking and version-based reprocessing.
 * Provides utilities to track script versions and trigger reprocessing when builds change.
 */
var VersionManager = (function() {
  'use strict';
  
  var ns = {};

  // =============================================================================
  // BUILD MANAGEMENT FUNCTIONS (from BuildManagement.js)
  // =============================================================================

  /**
   * Increment build number (run after making processing changes)
   * @returns {string} New build number
   */
  ns.increment_build = function() {
    var current = Config.getCurrentBuild();
    var today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    var parts = current.split('.');
    var increment = parts[0] === today ? String(parseInt(parts[1]) + 1).padStart(3, '0') : '001';
    var new_build = today + '.' + increment;
    
    Config.SCRIPT_PROPERTIES.setProperty('BUILD_NUMBER', new_build);
    Logger.log('🐕 Boxer build updated: ' + current + ' → ' + new_build);
    return new_build;
  };

  /**
   * Check how many files need build updates
   * @param {number} sample_size Number of files to check (default 20)
   * @returns {object} Status counts
   */
  ns.check_build_status = function(sample_size) {
    sample_size = sample_size || 20;
    
    Logger.log('Current build: ' + Config.getCurrentBuild());
    
    var access_token = getValidAccessToken();
    var images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
    
    var needs_update = 0;
    var up_to_date = 0;
    var no_metadata = 0;
    
    images.slice(0, sample_size).forEach(function(image) {
      var metadata = BoxFileOperations.getCurrentMetadata(image.id, access_token);
      if (!metadata) {
        no_metadata++;
      } else if (Config.shouldReprocessForBuild && Config.shouldReprocessForBuild(metadata.buildNumber)) {
        needs_update++;
      } else {
        up_to_date++;
      }
    });
    
    var result = {
      sample_size: Math.min(sample_size, images.length),
      up_to_date: up_to_date,
      needs_update: needs_update,
      no_metadata: no_metadata,
      current_build: Config.getCurrentBuild()
    };
    
    Logger.log('Build Status (sample of ' + result.sample_size + ' files):');
    Logger.log('  Up-to-date: ' + up_to_date);
    Logger.log('  Needs update: ' + needs_update); 
    Logger.log('  No metadata: ' + no_metadata);
    
    return result;
  };

  /**
   * Process files with outdated build numbers
   * @param {number} max_files Maximum files to process (default 10)
   * @returns {object} Processing results
   */
  ns.process_outdated_files = function(max_files) {
    max_files = max_files || 10;
    
    Logger.log('🔄 Processing files with outdated build numbers...');
    Logger.log('Maximum files to process: ' + max_files);
    
    var access_token = getValidAccessToken();
    if (!access_token) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    try {
      var images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
      var processed = 0;
      var skipped = 0;
      var errors = 0;
      
      for (var i = 0; i < images.length && processed < max_files; i++) {
        var image = images[i];
        var metadata = BoxFileOperations.getCurrentMetadata(image.id, access_token);
        
        if (!metadata) {
          Logger.log('⏭️ Skipping ' + image.name + ' (no existing metadata)');
          skipped++;
          continue;
        }
        
        if (Config.shouldReprocessForBuild && !Config.shouldReprocessForBuild(metadata.buildNumber)) {
          skipped++;
          continue;
        }
        
        try {
          Logger.log('🔄 Updating: ' + image.name);
          var result = MetadataExtraction.processSingleImageBasic(image, access_token);
          if (result && result.success !== false) {
            processed++;
            Logger.log('✅ Updated: ' + image.name);
          } else {
            errors++;
            Logger.log('❌ Failed: ' + image.name);
          }
        } catch (error) {
          errors++;
          Logger.log('❌ Error updating ' + image.name + ': ' + error.toString());
        }
        
        Utilities.sleep(1000); // Rate limiting
      }
      
      Logger.log('\n📊 Processing complete:');
      Logger.log('  Processed: ' + processed);
      Logger.log('  Skipped: ' + skipped);
      Logger.log('  Errors: ' + errors);
      
      if (processed === max_files) {
        Logger.log('⚠️ Reached processing limit. Run again to process more files.');
      }
      
      return {
        processed: processed,
        skipped: skipped,
        errors: errors,
        reached_limit: processed === max_files
      };
      
    } catch (error) {
      Logger.log('❌ Error in process_outdated_files: ' + error.toString());
      return null;
    }
  };

  /**
   * Get build history from recent processing
   * @returns {array} Recent builds found in files
   */
  ns.get_build_history = function() {
    var access_token = getValidAccessToken();
    var images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
    
    var builds = new Set();
    
    images.slice(0, 50).forEach(function(image) {
      var metadata = BoxFileOperations.getCurrentMetadata(image.id, access_token);
      if (metadata && metadata.buildNumber) {
        builds.add(metadata.buildNumber);
      }
    });
    
    var build_array = Array.from(builds).sort().reverse();
    
    Logger.log('Recent builds found:');
    build_array.forEach(function(build) {
      Logger.log('  ' + build);
    });
    
    return build_array;
  };

  /**
   * Increment build and process some outdated files
   * @param {number} max_files Maximum files to process after incrementing
   * @returns {object} Results including new build and processing stats
   */
  ns.increment_build_and_process = function(max_files) {
    max_files = max_files || 10;
    
    Logger.log('🔧 === Build Increment and Processing ===');
    
    // Increment build first
    var old_build = Config.getCurrentBuild();
    var new_build = ns.increment_build();
    
    Logger.log('Build incremented: ' + old_build + ' → ' + new_build);
    
    // Check how many files need updating
    var status = ns.check_build_status(50);
    
    if (status.needs_update === 0) {
      Logger.log('✅ No files need build updates');
      return { build: new_build, processing: null };
    }
    
    // Process some outdated files
    var processing_results = ns.process_outdated_files(max_files);
    
    return {
      build: new_build,
      old_build: old_build,
      status: status,
      processing: processing_results
    };
  };

  // =============================================================================
  // VERSION UTILITIES FUNCTIONS (from VersionUtilities.js)
  // =============================================================================

  /**
   * Display current build information.
   * @returns {object} Version information
   */
  ns.show_current_build = function() {
    var version_info = Config.getVersionInfo();
    
    Logger.log('=== 🐕 Boxer Build Information ===');
    Logger.log('Script Version: ' + version_info.scriptVersion);
    Logger.log('Build Number: ' + version_info.buildNumber);
    Logger.log('Build Date: ' + version_info.buildDate);
    Logger.log('Full Version: ' + version_info.fullVersion);
    Logger.log('=====================================');
    
    return version_info;
  };

  /**
   * Analyze version distribution across processed files.
   * @param {string} access_token Valid Box access token
   * @returns {object} Analysis results
   */
  ns.analyze_version_distribution = function(access_token) {
    if (!access_token) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    Logger.log('=== 🔍 Boxer Version Distribution Analysis ===\n');
    
    try {
      // Use optimized search to find processed images
      var search_queries = ['type:file .jpg', 'type:file .png', 'type:file .jpeg'];
      var version_counts = {};
      var total_processed = 0;
      var total_unprocessed = 0;
      var needs_update = 0;
      
      var current_version = Config.getCurrentVersionString();
      
      Logger.log('🎯 Current version: ' + current_version);
      Logger.log('🔍 Analyzing file versions...\n');
      
      search_queries.forEach(function(query) {
        try {
          var search_url = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                         '&limit=200&fields=id,name';
          
          var response = UrlFetchApp.fetch(search_url, {
            headers: { 'Authorization': 'Bearer ' + access_token },
            muteHttpExceptions: true
          });
          
          if (response.getResponseCode() === 200) {
            var data = JSON.parse(response.getContentText());
            
            data.entries.forEach(function(file) {
              if (BoxFileOperations.isImageFile(file.name)) {
                var metadata = BoxFileOperations.getCurrentMetadata(file.id, access_token);
                
                if (metadata) {
                  total_processed++;
                  var file_version = metadata.processingVersion || metadata.scriptVersion || 'unknown';
                  
                  version_counts[file_version] = (version_counts[file_version] || 0) + 1;
                  
                  if (Config.shouldReprocessForVersion && Config.shouldReprocessForVersion(file_version)) {
                    needs_update++;
                  }
                } else {
                  total_unprocessed++;
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
      Logger.log('Total processed files: ' + total_processed);
      Logger.log('Total unprocessed files: ' + total_unprocessed);
      Logger.log('Files needing version update: ' + needs_update);
      Logger.log('');
      
      if (Object.keys(version_counts).length > 0) {
        Logger.log('🏷️ VERSION DISTRIBUTION:');
        
        Object.keys(version_counts)
          .sort(function(a, b) { return version_counts[b] - version_counts[a]; })
          .forEach(function(version) {
            var count = version_counts[version];
            var is_current = version === current_version;
            var status = is_current ? '✅ (current)' : '⚠️ (outdated)';
            Logger.log('  ' + version + ': ' + count + ' files ' + status);
          });
      }
      
      Logger.log('\n💡 RECOMMENDATIONS:');
      if (needs_update > 0) {
        Logger.log('• Run process_all_outdated_files(' + Math.min(needs_update, 25) + ') to update outdated files');
      }
      if (total_unprocessed > 0) {
        Logger.log('• Run main processing to handle ' + total_unprocessed + ' unprocessed files');
      }
      if (needs_update === 0 && total_unprocessed === 0) {
        Logger.log('• All files are up to date! 🎉');
      }
      
      return {
        total_processed: total_processed,
        total_unprocessed: total_unprocessed,
        needs_update: needs_update,
        version_counts: version_counts,
        current_version: current_version
      };
      
    } catch (error) {
      Logger.log('❌ Error in version analysis: ' + error.toString());
      return null;
    }
  };

  /**
   * Process all files that have outdated versions.
   * @param {number} max_files Maximum number of files to process
   * @returns {object} Processing results
   */
  ns.process_all_outdated_files = function(max_files) {
    max_files = max_files || 25;
    
    Logger.log('🔄 === Processing All Outdated Files ===');
    Logger.log('Maximum files to process: ' + max_files);
    
    var access_token = getValidAccessToken();
    if (!access_token) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    try {
      var search_queries = ['type:file .jpg', 'type:file .png', 'type:file .jpeg'];
      var processed = 0;
      var skipped = 0;
      var errors = 0;
      
      for (var q = 0; q < search_queries.length && processed < max_files; q++) {
        var query = search_queries[q];
        
        try {
          var search_url = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                         '&limit=100&fields=id,name';
          
          var response = UrlFetchApp.fetch(search_url, {
            headers: { 'Authorization': 'Bearer ' + access_token },
            muteHttpExceptions: true
          });
          
          if (response.getResponseCode() === 200) {
            var data = JSON.parse(response.getContentText());
            
            for (var i = 0; i < data.entries.length && processed < max_files; i++) {
              var file = data.entries[i];
              
              if (!BoxFileOperations.isImageFile(file.name)) {
                continue;
              }
              
              var metadata = BoxFileOperations.getCurrentMetadata(file.id, access_token);
              if (!metadata) {
                skipped++;
                continue;
              }
              
              var file_version = metadata.processingVersion || metadata.scriptVersion || 'unknown';
              if (!Config.shouldReprocessForVersion || !Config.shouldReprocessForVersion(file_version)) {
                skipped++;
                continue;
              }
              
              try {
                Logger.log('🔄 Updating outdated file: ' + file.name + ' (version: ' + file_version + ')');
                
                var result = MetadataExtraction.processSingleImageBasic(
                  { id: file.id, name: file.name }, 
                  access_token
                );
                
                if (result && result.success !== false) {
                  processed++;
                  Logger.log('✅ Updated: ' + file.name);
                } else {
                  errors++;
                  Logger.log('❌ Failed: ' + file.name);
                }
                
                Utilities.sleep(1000); // Rate limiting
                
              } catch (error) {
                errors++;
                Logger.log('❌ Error processing ' + file.name + ': ' + error.toString());
              }
            }
          }
          
          Utilities.sleep(200); // Rate limiting between searches
          
        } catch (error) {
          Logger.log('Error with search query ' + query + ': ' + error.toString());
        }
      }
      
      Logger.log('\n📊 Processing Summary:');
      Logger.log('  Files updated: ' + processed);
      Logger.log('  Files skipped: ' + skipped);
      Logger.log('  Errors: ' + errors);
      
      if (processed === max_files) {
        Logger.log('⚠️ Reached processing limit of ' + max_files + ' files.');
        Logger.log('💡 Run again to process more files.');
      }
      
      return {
        processed: processed,
        skipped: skipped,
        errors: errors,
        reached_limit: processed === max_files
      };
      
    } catch (error) {
      Logger.log('❌ Error in process_all_outdated_files: ' + error.toString());
      return null;
    }
  };

  /**
   * Test version tracking on a single file.
   * @param {string} file_id Optional specific file ID to test
   * @returns {object} Test results
   */
  ns.test_version_tracking = function(file_id) {
    Logger.log('=== 🧪 Testing Version Tracking ===');
    
    var access_token = getValidAccessToken();
    if (!access_token) {
      Logger.log('❌ No access token available');
      return { success: false, error: 'No access token' };
    }
    
    try {
      // Find a test file if not specified
      if (!file_id) {
        var test_images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
        if (test_images.length === 0) {
          Logger.log('❌ No test images found');
          return { success: false, error: 'No test images found' };
        }
        file_id = test_images[0].id;
        Logger.log('🎯 Testing with: ' + test_images[0].name);
      }
      
      Logger.log('🔍 Analyzing current metadata...');
      
      // Get current metadata
      var current_metadata = BoxFileOperations.getCurrentMetadata(file_id, access_token);
      var current_version = Config.getCurrentVersionString();
      
      if (current_metadata) {
        var file_version = current_metadata.processingVersion || current_metadata.scriptVersion || 'none';
        var processing_count = current_metadata.processingCount || 0;
        var first_processed = current_metadata.firstProcessedDate || 'never';
        var last_processed = current_metadata.lastProcessedDate || 'never';
        
        Logger.log('📋 Current Status:');
        Logger.log('  File version: ' + file_version);
        Logger.log('  Current version: ' + current_version);
        Logger.log('  Processing count: ' + processing_count);
        Logger.log('  First processed: ' + first_processed);
        Logger.log('  Last processed: ' + last_processed);
        Logger.log('  Needs update: ' + (Config.shouldReprocessForVersion ? Config.shouldReprocessForVersion(file_version) : 'unknown'));
        
        if (current_metadata.processingNotes) {
          Logger.log('  Processing notes: ' + current_metadata.processingNotes.substring(0, 100) + '...');
        }
      } else {
        Logger.log('📋 No existing metadata found');
      }
      
      Logger.log('\n🔄 Testing version-aware processing...');
      
      // Test the version-aware processing
      var process_result = MetadataExtraction.processSingleImageBasic({ id: file_id, name: 'test-file' }, access_token);
      
      Logger.log('\n🔍 Checking updated metadata...');
      
      // Get updated metadata
      var updated_metadata = BoxFileOperations.getCurrentMetadata(file_id, access_token);
      
      if (updated_metadata) {
        Logger.log('📋 Updated Status:');
        Logger.log('  New version: ' + (updated_metadata.processingVersion || 'none'));
        Logger.log('  New processing count: ' + (updated_metadata.processingCount || 0));
        Logger.log('  Script version: ' + (updated_metadata.scriptVersion || 'none'));
        Logger.log('  Build number: ' + (updated_metadata.buildNumber || 'none'));
        
        if (updated_metadata.processingNotes) {
          Logger.log('  Updated notes: ' + updated_metadata.processingNotes.substring(0, 150) + '...');
        }
        
        Logger.log('\n✅ Version tracking test complete!');
        
        return {
          success: true,
          before: current_metadata,
          after: updated_metadata,
          processing_result: process_result
        };
      } else {
        Logger.log('❌ No metadata found after processing');
        return { success: false, error: 'No metadata after processing' };
      }
      
    } catch (error) {
      Logger.log('❌ Version tracking test failed: ' + error.toString());
      return { success: false, error: error.toString() };
    }
  };

  /**
   * Generate a suggested build number based on current date.
   * @returns {string} Suggested build number
   */
  ns.generate_build_number = function() {
    var now = new Date();
    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');
    var date_str = year + month + day;
    
    // Simple increment logic - in practice you'd track this better
    var increment = '001';
    var suggested = date_str + '.' + increment;
    
    Logger.log('💡 Suggested build number for today: ' + suggested);
    Logger.log('Format: YYYYMMDD.increment');
    Logger.log('Current: ' + Config.getCurrentBuild());
    
    return suggested;
  };

  /**
   * Utility to manually document build number updates.
   * Use this when making significant changes to processing logic.
   * @param {string} new_build_number New build number (format: YYYYMMDD.###)
   */
  ns.document_build_update = function(new_build_number) {
    Logger.log('⚠️ MANUAL BUILD UPDATE DOCUMENTATION');
    Logger.log('This function is for documentation only.');
    Logger.log('To update the build number:');
    Logger.log('1. Edit Config.js');
    Logger.log('2. Update BUILD_NUMBER constant to: ' + new_build_number);
    Logger.log('3. Update BUILD_DATE if needed');
    Logger.log('4. Consider updating SCRIPT_VERSION for major changes');
    Logger.log('5. Save and redeploy');
    Logger.log('\nCurrent build: ' + Config.getCurrentBuild());
    Logger.log('Suggested new build: ' + new_build_number);
  };

  return ns;
})();

// =============================================================================
// CONVENIENCE FUNCTIONS FOR EASY ACCESS FROM APPS SCRIPT EDITOR
// =============================================================================

/**
 * Show current Boxer build info
 */
function show_build_info() {
  return VersionManager.show_current_build();
}

/**
 * Analyze version distribution across files
 */
function analyze_file_versions() {
  var access_token = getValidAccessToken();
  return VersionManager.analyze_version_distribution(access_token);
}

/**
 * Process files with outdated versions (limit to 25 for safety)
 */
function update_outdated_files() {
  return VersionManager.process_all_outdated_files(25);
}

/**
 * Increment build number
 */
function increment_build() {
  return VersionManager.increment_build();
}

/**
 * Check build status of sample files
 */
function check_build_status() {
  return VersionManager.check_build_status();
}

/**
 * Process files with outdated build numbers
 */
function process_outdated_files(max_files) {
  return VersionManager.process_outdated_files(max_files);
}

/**
 * Test version tracking on sample file
 */
function test_version_system() {
  return VersionManager.test_version_tracking();
}

/**
 * Get build history from processed files
 */
function get_build_history() {
  return VersionManager.get_build_history();
}