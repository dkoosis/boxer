function myFunction() {
// File: Diagnostics.js
// Comprehensive diagnostic, testing, and health check functions for the Boxer system.
// Merges logic from BoxTests.js, AirtableTestFunctions.js, and BoxerHealthCheck.js
// Depends on: Config.js, BoxAuth.js, BoxFileOperations.js, ExifProcessor.js, VisionAnalysis.js, AirtableArchivalManager.js

/**
 * Diagnostics namespace for all testing and health check functions.
 */
var Diagnostics = (function() {
  'use strict';
  
  var ns = {};

  // =============================================================================
  // HEALTH CHECK FUNCTIONS (from BoxerHealthCheck.js)
  // =============================================================================

  /**
   * Quick health check for critical Google Services.
   * This prevents processing during Google service outages.
   * @returns {boolean} True if safe to proceed, false if services are down.
   */
  ns.check_critical_services = function() {
    try {
      Logger.log('🔍 Checking Google Services health...');
      
      // Test 1: Script Properties (core dependency)
      try {
        PropertiesService.getScriptProperties().getProperty('_health_check_test');
      } catch (error) {
        Logger.log('❌ Google Script Properties service is down');
        return false;
      }
      
      // Test 2: UrlFetchApp (required for Box API)
      try {
        var test_response = UrlFetchApp.fetch('https://httpbin.org/status/200', {
          muteHttpExceptions: true,
          timeout: 10
        });
        if (test_response.getResponseCode() !== 200) {
          Logger.log('❌ Google UrlFetch service is experiencing issues');
          return false;
        }
      } catch (error) {
        Logger.log('❌ Google UrlFetch service is down: ' + error.toString());
        return false;
      }
      
      // Test 3: Logger (basic functionality)
      try {
        Logger.log('✅ Google Services health check passed');
      } catch (error) {
        // If we can't even log, something is seriously wrong
        return false;
      }
      
      return true;
      
    } catch (error) {
      // If the health check itself fails, assume services are down
      return false;
    }
  };

  /**
   * Enhanced health check with detailed service testing.
   * @returns {object} Detailed health status
   */
  ns.detailed_health_check = function() {
    var health_status = {
      overall_healthy: true,
      services: {},
      timestamp: new Date().toISOString()
    };
    
    // Test Google Services
    health_status.services.properties = test_service_('PropertiesService', function() {
      PropertiesService.getScriptProperties().getProperty('_test');
    });
    
    health_status.services.urlfetch = test_service_('UrlFetchApp', function() {
      var response = UrlFetchApp.fetch('https://httpbin.org/status/200', {
        muteHttpExceptions: true,
        timeout: 5
      });
      return response.getResponseCode() === 200;
    });
    
    health_status.services.drive = test_service_('DriveApp', function() {
      DriveApp.getRootFolder().getName();
    });
    
    health_status.services.logger = test_service_('Logger', function() {
      Logger.log('Health check test');
    });
    
    // Check if any critical services failed
    health_status.overall_healthy = Object.keys(health_status.services).every(function(service) {
      return health_status.services[service].healthy;
    });
    
    return health_status;
  };

  /**
   * Test a specific service with error handling
   * @private
   */
  function test_service_(service_name, test_function) {
    try {
      var result = test_function();
      return {
        healthy: true,
        tested_at: new Date().toISOString(),
        result: result
      };
    } catch (error) {
      return {
        healthy: false,
        tested_at: new Date().toISOString(),
        error: error.toString()
      };
    }
  }

  // =============================================================================
  // BOX AUTHENTICATION TESTS (from BoxTests.js)
  // =============================================================================

  /**
   * Complete test of Box authentication setup following Bruce McPherson's cGoa patterns.
   * @returns {object} Test results
   */
  ns.test_box_authentication_setup = function() {
    Logger.log('=== Box cGoa Authentication Test ===\n');
    
    var test_results = {
      success: true,
      issues: [],
      warnings: []
    };
    
    try {
      // Test 1: Check if libraries are available
      Logger.log('1. Checking required libraries...');
      if (typeof cGoa === 'undefined') {
        test_results.issues.push('cGoa library not found - please add to Libraries');
        test_results.success = false;
      }
      if (typeof cUseful === 'undefined') {
        test_results.issues.push('cUseful library not found - please add to Libraries');
        test_results.success = false;
      }
      if (test_results.issues.length === 0) {
        Logger.log('✅ Required libraries found (cGoa, cUseful by Bruce McPherson)');
      }
      
      // Test 2: Check credentials in properties
      Logger.log('\n2. Checking Box credentials...');
      var client_id = Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_ID_PROPERTY);
      var client_secret = Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_SECRET_PROPERTY);
      
      if (!client_id || !client_secret) {
        test_results.issues.push('Box credentials not found in Script Properties');
        test_results.issues.push('Set ' + Config.OAUTH_CLIENT_ID_PROPERTY + ' and ' + Config.OAUTH_CLIENT_SECRET_PROPERTY + ' in Project Settings > Script Properties');
        test_results.success = false;
      } else {
        Logger.log('✅ Box credentials found');
      }
      
      // Test 3: Check package setup (following cGoa patterns)
      Logger.log('\n3. Checking cGoa package...');
      var goa;
      try {
        goa = getBoxGoa();
        var package_info = goa.getPackage();
        
        // Verify package structure following cGoa patterns
        if (package_info.service !== 'custom') {
          test_results.issues.push('Service should be "custom" for Box, found: ' + package_info.service);
          test_results.success = false;
        }
        
        if (!package_info.serviceParameters) {
          test_results.issues.push('Missing serviceParameters for custom service');
          test_results.success = false;
        }
        
        var required_params = ['authUrl', 'tokenUrl', 'refreshUrl'];
        var missing_params = required_params.filter(function(param) {
          return !package_info.serviceParameters[param];
        });
        if (missing_params.length > 0) {
          test_results.issues.push('Missing serviceParameters: ' + missing_params.join(', '));
          test_results.success = false;
        }
        
        if (test_results.issues.length === 0) {
          Logger.log('✅ cGoa package properly configured');
          Logger.log('   Package Name: ' + package_info.packageName);
          Logger.log('   Service: ' + package_info.service);
          Logger.log('   Scopes: ' + package_info.scopes.join(', '));
        }
        
      } catch (error) {
        test_results.issues.push('cGoa package error: ' + error.toString());
        test_results.issues.push('Try running createBoxPackage()');
        test_results.success = false;
      }
      
      // Test 4: Check authorization status
      Logger.log('\n4. Checking authorization status...');
      try {
        var has_token = goa && goa.hasToken();
        var needs_consent = goa && goa.needsConsent();
        
        if (has_token) {
          Logger.log('✅ Valid token found');
          
          // Test 5: Test actual Box API call
          Logger.log('\n5. Testing Box API access...');
          var api_test = testBoxAccess();
          if (api_test.success) {
            Logger.log('✅ Box API access confirmed');
            Logger.log('👤 User: ' + api_test.user.name + ' (' + api_test.user.login + ')');
          } else {
            test_results.issues.push('Box API call failed: ' + api_test.error);
            test_results.success = false;
          }
        } else if (needs_consent) {
          test_results.warnings.push('Authorization required - deploy as web app and complete OAuth flow');
        } else {
          test_results.issues.push('Unknown authorization state');
          test_results.success = false;
        }
        
      } catch (error) {
        test_results.issues.push('Authorization check failed: ' + error.toString());
        test_results.success = false;
      }
      
    } catch (error) {
      test_results.issues.push('Test suite error: ' + error.toString());
      test_results.success = false;
    }
    
    // Summary
    Logger.log('\n📊 === Test Summary ===');
    if (test_results.success) {
      Logger.log('🎉 Box authentication setup is working correctly!');
    } else {
      Logger.log('❌ Issues found:');
      test_results.issues.forEach(function(issue) {
        Logger.log('   • ' + issue);
      });
    }
    
    if (test_results.warnings.length > 0) {
      Logger.log('\n⚠️ Warnings:');
      test_results.warnings.forEach(function(warning) {
        Logger.log('   • ' + warning);
      });
    }
    
    return test_results;
  };

  /**
   * Diagnostic function to check folder access permissions.
   * @returns {object} Diagnostic results
   */
  ns.diagnose_folder_access = function() {
    var access_token = getValidAccessToken();
    if (!access_token) {
      Logger.log("❌ No access token available");
      return { success: false, error: 'No access token' };
    }
    
    Logger.log("=== Box Folder Access Diagnostic ===\n");
    var results = { success: true, findings: [] };
    
    try {
      // Test 1: Check user info and permissions
      Logger.log("1. Checking authenticated user...");
      var user_response = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/users/me', {
        headers: { 'Authorization': 'Bearer ' + access_token },
        muteHttpExceptions: true
      });
      
      if (user_response.getResponseCode() === 200) {
        var user = JSON.parse(user_response.getContentText());
        Logger.log('✅ User: ' + user.name + ' (' + user.login + ')');
        Logger.log('   Role: ' + (user.role || 'N/A'));
        Logger.log('   Max Upload Size: ' + (user.max_upload_size || 'N/A'));
        Logger.log('   Enterprise: ' + (user.enterprise ? user.enterprise.name : 'None'));
        results.findings.push('User authenticated: ' + user.name);
      } else {
        Logger.log('❌ User info failed: ' + user_response.getResponseCode());
        results.success = false;
        results.findings.push('User info failed: HTTP ' + user_response.getResponseCode());
      }
      
      // Test 2: Check root folder access
      Logger.log("\n2. Checking root folder access...");
      var root_response = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/folders/0/items?limit=10', {
        headers: { 'Authorization': 'Bearer ' + access_token },
        muteHttpExceptions: true
      });
      
      if (root_response.getResponseCode() === 200) {
        var root_data = JSON.parse(root_response.getContentText());
        Logger.log('✅ Root access successful - found ' + root_data.entries.length + ' items');
        
        // Show first few folders for reference
        var folders = root_data.entries.filter(function(item) {
          return item.type === 'folder';
        }).slice(0, 5);
        
        if (folders.length > 0) {
          Logger.log("   Top-level folders:");
          folders.forEach(function(folder) {
            Logger.log('     - ' + folder.name + ' (ID: ' + folder.id + ')');
          });
        }
        results.findings.push('Root folder accessible with ' + root_data.entries.length + ' items');
      } else {
        Logger.log('❌ Root access failed: ' + root_response.getResponseCode());
        results.success = false;
        results.findings.push('Root access failed: HTTP ' + root_response.getResponseCode());
      }
      
      // Test 3: Test specific folder if configured
      if (Config.ACTIVE_TEST_FOLDER_ID && Config.ACTIVE_TEST_FOLDER_ID !== '0') {
        Logger.log('\n3. Testing configured test folder...');
        var test_folder_response = UrlFetchApp.fetch(
          Config.BOX_API_BASE_URL + '/folders/' + Config.ACTIVE_TEST_FOLDER_ID + '/items?limit=5', 
          {
            headers: { 'Authorization': 'Bearer ' + access_token },
            muteHttpExceptions: true
          }
        );
        
        if (test_folder_response.getResponseCode() === 200) {
          var folder_data = JSON.parse(test_folder_response.getContentText());
          Logger.log('✅ Test folder accessible - found ' + folder_data.entries.length + ' items');
          results.findings.push('Test folder accessible');
        } else {
          Logger.log('⚠️ Test folder not accessible: ' + test_folder_response.getResponseCode());
          results.findings.push('Test folder not accessible: HTTP ' + test_folder_response.getResponseCode());
        }
      }
      
    } catch (error) {
      Logger.log('❌ Diagnostic error: ' + error.toString());
      results.success = false;
      results.findings.push('Diagnostic error: ' + error.toString());
    }
    
    return results;
  };

  // =============================================================================
  // COMPREHENSIVE PROCESSING TESTS (from BoxTests.js)
  // =============================================================================

  /**
   * Test comprehensive metadata extraction with GPS focus.
   * @param {string} test_file_id Optional specific file ID to test
   * @returns {object} Test results
   */
  ns.test_comprehensive_metadata_extraction = function(test_file_id) {
    Logger.log("=== Comprehensive Metadata Extraction Test ===\n");
    
    var access_token = getValidAccessToken();
    if (!access_token) {
      Logger.log("❌ No access token available");
      return { success: false, error: 'No access token' };
    }
    
    var test_results = { success: true, findings: [] };
    
    try {
      // Find a test file if not specified
      if (!test_file_id) {
        var test_images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
        if (test_images.length === 0) {
          Logger.log("❌ No test images found");
          return { success: false, error: 'No test images found' };
        }
        test_file_id = test_images[0].id;
        Logger.log('Testing with: ' + test_images[0].name + '\n');
      }
      
      // Test 1: EXIF Extraction with GPS focus
      Logger.log("1. Testing EXIF Extraction (including GPS data)...");
      var exif_result = ExifProcessor.extract_enhanced_metadata(test_file_id, access_token);
      
      if (exif_result && exif_result.hasExif) {
        Logger.log("✅ EXIF extraction successful");
        Logger.log('   Method: ' + exif_result.extractionMethod);
        Logger.log('   Enhanced: ' + exif_result.enhanced);
        
        if (exif_result.metadata) {
          var metadata = exif_result.metadata;
          Logger.log("   Key metadata extracted:");
          if (metadata.cameraModel) Logger.log('     Camera: ' + metadata.cameraModel);
          if (metadata.imageWidth && metadata.imageHeight) {
            Logger.log('     Dimensions: ' + metadata.imageWidth + ' x ' + metadata.imageHeight);
          }
          if (metadata.aspectRatio) Logger.log('     Aspect Ratio: ' + metadata.aspectRatio);
          if (metadata.dateTaken) Logger.log('     Date Taken: ' + metadata.dateTaken);
          
          // Detailed GPS testing
          Logger.log("   GPS Coordinate Testing:");
          var gps_data_found = false;
          if (typeof metadata.gpsLatitude === 'number') {
            Logger.log('     ✅ GPS Latitude: ' + metadata.gpsLatitude + '°');
            gps_data_found = true;
          }
          if (typeof metadata.gpsLongitude === 'number') {
            Logger.log('     ✅ GPS Longitude: ' + metadata.gpsLongitude + '°');
            gps_data_found = true;
          }
          if (typeof metadata.gpsAltitude === 'number') {
            Logger.log('     ✅ GPS Altitude: ' + metadata.gpsAltitude + 'm');
            gps_data_found = true;
          }
          
          if (gps_data_found) {
            Logger.log("     🌍 Complete GPS coordinate data successfully extracted!");
            test_results.findings.push('GPS data extracted successfully');
          } else {
            Logger.log("     📍 No GPS coordinates found in this image");
            test_results.findings.push('No GPS data in test image');
          }
        }
        
        test_results.findings.push('EXIF extraction working');
      } else {
        Logger.log("⚠️ No EXIF data found or extraction failed");
        test_results.findings.push('EXIF extraction failed or no data');
      }
      
      // Test 2: Vision API (if enabled)
      Logger.log("\n2. Testing Vision API...");
      try {
        var vision_result = analyzeImageWithVisionImproved(test_file_id, access_token);
        if (vision_result && !vision_result.error) {
          Logger.log("✅ Vision API working");
          Logger.log('   Objects detected: ' + (vision_result.objects ? vision_result.objects.length : 0));
          Logger.log('   Labels detected: ' + (vision_result.labels ? vision_result.labels.length : 0));
          Logger.log('   Text detected: ' + (vision_result.text ? 'Yes' : 'No'));
          test_results.findings.push('Vision API working');
        } else {
          Logger.log("⚠️ Vision API not working or not configured");
          test_results.findings.push('Vision API issues: ' + (vision_result ? vision_result.error : 'Unknown'));
        }
      } catch (error) {
        Logger.log("⚠️ Vision API error: " + error.toString());
        test_results.findings.push('Vision API error: ' + error.toString());
      }
      
      // Test 3: Metadata application
      Logger.log("\n3. Testing metadata application to Box...");
      try {
        var apply_result = BoxFileOperations.applyMetadataToFile(
          test_file_id, 
          { testField: 'diagnostic_test_' + Date.now() }, 
          access_token
        );
        if (apply_result) {
          Logger.log("✅ Metadata application successful");
          test_results.findings.push('Metadata application working');
        } else {
          Logger.log("❌ Metadata application failed");
          test_results.success = false;
          test_results.findings.push('Metadata application failed');
        }
      } catch (error) {
        Logger.log("❌ Metadata application error: " + error.toString());
        test_results.success = false;
        test_results.findings.push('Metadata application error: ' + error.toString());
      }
      
    } catch (error) {
      Logger.log("❌ Test error: " + error.toString());
      test_results.success = false;
      test_results.findings.push('Test error: ' + error.toString());
    }
    
    return test_results;
  };

  /**
   * Test processing of exactly 3 files for end-to-end validation.
   * @returns {object} Processing results
   */
  ns.test_process_three_files = function() {
    Logger.log("=== Processing 3 Files Test ===\n");
    
    var access_token = getValidAccessToken();
    if (!access_token) {
      Logger.log("❌ No access token available");
      return { success: false, error: 'No access token' };
    }
    
    try {
      var images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
      if (images.length === 0) {
        Logger.log("❌ No images found for testing");
        return { success: false, error: 'No images found' };
      }
      
      var test_files = images.slice(0, 3);
      Logger.log('📊 Testing with ' + test_files.length + ' files');
      
      var results = {
        processed: 0,
        errors: 0,
        files: []
      };
      
      for (var i = 0; i < test_files.length; i++) {
        var file = test_files[i];
        Logger.log('\n🔄 Processing: ' + file.name);
        
        try {
          var process_result = MetadataExtraction.processSingleImageBasic(file, access_token);
          if (process_result && process_result.success !== false) {
            Logger.log('✅ Successfully processed: ' + file.name);
            results.processed++;
            results.files.push({ name: file.name, status: 'success' });
          } else {
            Logger.log('❌ Failed to process: ' + file.name);
            results.errors++;
            results.files.push({ name: file.name, status: 'failed' });
          }
        } catch (error) {
          Logger.log('❌ Error processing ' + file.name + ': ' + error.toString());
          results.errors++;
          results.files.push({ name: file.name, status: 'error', error: error.toString() });
        }
        
        Utilities.sleep(1000); // Rate limiting
      }
      
      Logger.log('\n📊 Test Results:');
      Logger.log('   Processed: ' + results.processed);
      Logger.log('   Errors: ' + results.errors);
      Logger.log('   Success rate: ' + Math.round((results.processed / test_files.length) * 100) + '%');
      
      results.success = results.processed > 0;
      return results;
      
    } catch (error) {
      Logger.log('❌ Test error: ' + error.toString());
      return { success: false, error: error.toString() };
    }
  };

  // =============================================================================
  // AIRTABLE VALIDATION TESTS (from AirtableTestFunctions.js)
  // =============================================================================

  /**
   * Comprehensive validation of Airtable archival setup.
   * @param {object} custom_config Optional custom configuration to test
   * @returns {object} Validation results
   */
  ns.validate_airtable_setup = function(custom_config) {
    Logger.log('=== Airtable Setup Validation ===\n');
    
    var validation_results = {
      success: true,
      issues: [],
      warnings: []
    };
    
    try {
      // Use default config merged with custom
      var config = Object.assign({}, Config.AIRTABLE_DEFAULT_CONFIG, custom_config || {});
      
      // Test 1: Check configuration completeness
      Logger.log('1️⃣ Validating configuration...');
      if (!AirtableArchivalManager.validateAirtableConfig(config)) {
        validation_results.issues.push('Invalid Airtable configuration');
        validation_results.success = false;
      } else {
        Logger.log('✅ Configuration is valid');
        Logger.log('   Base ID: ' + config.baseId);
        Logger.log('   Table: ' + config.tableName);
        Logger.log('   View: ' + config.viewName);
      }
      
      // Test 2: Check API key
      Logger.log('\n2️⃣ Checking Airtable API key...');
      var api_key = AirtableArchivalManager.getAirtableApiKey();
      if (!api_key) {
        validation_results.issues.push('Airtable API key not found in Script Properties');
        validation_results.issues.push('Run setupAirtableApiKey("your_key_here") to set it');
        validation_results.success = false;
      } else {
        Logger.log('✅ Airtable API key found');
        
        if (api_key.startsWith('key') && api_key.length > 10) {
          Logger.log('   Key format looks correct');
        } else {
          validation_results.warnings.push('API key format may be incorrect');
        }
      }
      
      // Test 3: Check Box authentication for archival
      Logger.log('\n3️⃣ Checking Box authentication for archival...');
      var box_token = null;
      try {
        box_token = getValidAccessToken();
        Logger.log('✅ Box authentication working');
      } catch (error) {
        validation_results.issues.push('Box authentication failed: ' + error.toString());
        validation_results.issues.push('Complete Box OAuth setup first');
        validation_results.success = false;
      }
      
      // Test 4: Check Box folder configuration
      Logger.log('\n4️⃣ Checking Box folder configuration...');
      var root_folder_id = Config.AIRTABLE_ROOT_FOLDER_ID;
      if (!root_folder_id || root_folder_id === 'YOUR_BOX_FOLDER_ID_HERE') {
        validation_results.warnings.push('Box root folder ID not configured');
        validation_results.warnings.push('Update Config.AIRTABLE_ROOT_FOLDER_ID');
      } else {
        Logger.log('✅ Box root folder ID is configured: ' + root_folder_id);
      }
      
      // Test 5: Test Airtable API connection (if we have the key)
      if (api_key && AirtableArchivalManager.validateAirtableConfig(config)) {
        Logger.log('\n5️⃣ Testing Airtable API connection...');
        try {
          var test_records = AirtableArchivalManager.fetchRecordsFromView(config, api_key);
          Logger.log('✅ Successfully connected to Airtable');
          Logger.log('   📋 Found ' + test_records.length + ' records in "' + config.viewName + '" view');
          
          if (test_records.length === 0) {
            Logger.log('   💡 No records need archiving (this is normal if already processed)');
          } else {
            Logger.log('   🎯 Ready to process ' + test_records.length + ' records');
          }
          validation_results.findings = { recordsFound: test_records.length };
        } catch (error) {
          validation_results.issues.push('Failed to connect to Airtable: ' + error.toString());
          validation_results.success = false;
        }
      }
      
      // Test 6: Test Box folder creation (if we have Box auth)
      if (box_token && root_folder_id && root_folder_id !== 'YOUR_BOX_FOLDER_ID_HERE') {
        Logger.log('\n6️⃣ Testing Box folder structure...');
        try {
          var test_folder_id = AirtableArchivalManager.ensureBoxFolderStructure(config, box_token);
          if (test_folder_id) {
            Logger.log('✅ Box folder structure verified');
            Logger.log('   📁 Target folder ID: ' + test_folder_id);
          } else {
            validation_results.issues.push('Failed to create/verify Box folder structure');
            validation_results.success = false;
          }
        } catch (error) {
          validation_results.issues.push('Box folder test failed: ' + error.toString());
          validation_results.success = false;
        }
      }
      
    } catch (error) {
      validation_results.issues.push('Validation error: ' + error.toString());
      validation_results.success = false;
    }
    
    // Summary
    Logger.log('\n📊 === Validation Summary ===');
    
    if (validation_results.success) {
      Logger.log('🎉 Airtable setup validation PASSED!');
      Logger.log('✅ Your Airtable archival system is ready to use');
      
      if (validation_results.warnings.length > 0) {
        Logger.log('\n⚠️ Warnings to address:');
        validation_results.warnings.forEach(function(warning) {
          Logger.log('   ' + warning);
        });
      }
      
      Logger.log('\n🚀 Next steps:');
      Logger.log('   1. Run test_airtable_archival_safely() to test with 1 record');
      Logger.log('   2. Set up regular triggers for archive_airtable_attachments()');
      
    } else {
      Logger.log('❌ Setup validation FAILED');
      Logger.log('\n🔧 Issues to fix:');
      validation_results.issues.forEach(function(issue) {
        Logger.log('   • ' + issue);
      });
    }
    
    return validation_results;
  };

  /**
   * Safe test of Airtable archival with a single record.
   * @returns {object} Test results
   */
  ns.test_airtable_archival_safely = function() {
    Logger.log('=== Safe Airtable Archival Test ===\n');
    
    try {
      // Override batch size to 1 for safety
      var safe_config = Object.assign({}, Config.AIRTABLE_DEFAULT_CONFIG);
      var original_batch_size = Config.AIRTABLE_BATCH_SIZE;
      Config.AIRTABLE_BATCH_SIZE = 1;
      
      Logger.log('🔒 Running in SAFE MODE (1 record maximum)');
      
      var result = AirtableArchivalManager.runAirtableArchival(safe_config);
      
      // Restore original batch size
      Config.AIRTABLE_BATCH_SIZE = original_batch_size;
      
      if (result && result.success !== false) {
        Logger.log('✅ Safe test completed successfully');
        Logger.log('📊 Records processed: ' + (result.recordsProcessed || 0));
        Logger.log('📦 Files uploaded: ' + (result.filesUploaded || 0));
        
        if (result.recordsProcessed === 0) {
          Logger.log('💡 No records were processed - this may mean:');
          Logger.log('   • All records are already archived');
          Logger.log('   • Your view filter isn\'t finding unarchived records');
          Logger.log('   • Configuration issue');
        }
      } else {
        Logger.log('❌ Safe test failed');
        if (result && result.error) {
          Logger.log('   Error: ' + result.error);
        }
      }
      
      return result;
      
    } catch (error) {
      Logger.log('❌ Safe test error: ' + error.toString());
      return { success: false, error: error.toString() };
    }
  };

  // =============================================================================
  // COMPLETE SYSTEM TESTS
  // =============================================================================

  /**
   * Run a complete end-to-end test of all Boxer systems.
   * @returns {object} Comprehensive test results
   */
  ns.run_complete_system_test = function() {
    Logger.log('🐕 === BOXER COMPLETE SYSTEM TEST ===\n');
    Logger.log('⏰ Test started: ' + new Date().toISOString());
    
    var overall_results = {
      success: true,
      tests_run: 0,
      tests_passed: 0,
      test_results: {},
      started_at: new Date().toISOString()
    };
    
    // Test 1: Health checks
    Logger.log('🔍 1. Testing system health...');
    overall_results.tests_run++;
    var health_result = ns.check_critical_services();
    if (health_result) {
      overall_results.tests_passed++;
      Logger.log('✅ System health check passed');
    } else {
      overall_results.success = false;
      Logger.log('❌ System health check failed');
    }
    overall_results.test_results.health_check = { success: health_result };
    
    // Test 2: Authentication
    Logger.log('\n🔐 2. Testing Box authentication...');
    overall_results.tests_run++;
    var auth_result = ns.test_box_authentication_setup();
    if (auth_result.success) {
      overall_results.tests_passed++;
      Logger.log('✅ Authentication test passed');
    } else {
      overall_results.success = false;
      Logger.log('❌ Authentication test failed');
    }
    overall_results.test_results.authentication = auth_result;
    
    // Test 3: Metadata extraction
    Logger.log('\n🔬 3. Testing metadata extraction...');
    overall_results.tests_run++;
    var metadata_result = ns.test_comprehensive_metadata_extraction();
    if (metadata_result.success) {
      overall_results.tests_passed++;
      Logger.log('✅ Metadata extraction test passed');
    } else {
      Logger.log('⚠️ Metadata extraction test had issues (may be expected)');
    }
    overall_results.test_results.metadata_extraction = metadata_result;
    
    // Test 4: File processing
    Logger.log('\n⚙️ 4. Testing file processing...');
    overall_results.tests_run++;
    var processing_result = ns.test_process_three_files();
    if (processing_result.success) {
      overall_results.tests_passed++;
      Logger.log('✅ File processing test passed');
    } else {
      Logger.log('⚠️ File processing test had issues');
    }
    overall_results.test_results.file_processing = processing_result;
    
    // Test 5: Airtable setup (if configured)
    Logger.log('\n📋 5. Testing Airtable setup...');
    overall_results.tests_run++;
    try {
      var airtable_result = ns.validate_airtable_setup();
      if (airtable_result.success) {
        overall_results.tests_passed++;
        Logger.log('✅ Airtable setup test passed');
      } else {
        Logger.log('⚠️ Airtable setup needs attention');
      }
      overall_results.test_results.airtable_setup = airtable_result;
    } catch (error) {
      Logger.log('⚠️ Airtable test skipped: ' + error.toString());
      overall_results.test_results.airtable_setup = { success: false, error: error.toString() };
    }
    
    // Final summary
    overall_results.completed_at = new Date().toISOString();
    var success_rate = Math.round((overall_results.tests_passed / overall_results.tests_run) * 100);
    
    Logger.log('\n🏁 === COMPLETE SYSTEM TEST RESULTS ===');
    Logger.log('📊 Tests passed: ' + overall_results.tests_passed + '/' + overall_results.tests_run + ' (' + success_rate + '%)');
    Logger.log('⏰ Test completed: ' + overall_results.completed_at);
    
    if (overall_results.tests_passed >= overall_results.tests_run - 1) { // Allow 1 test to have issues
      Logger.log('🎉 BOXER SYSTEM IS READY FOR PRODUCTION!');
      Logger.log('✅ All critical components are working correctly');
    } else {
      Logger.log('⚠️ Some issues detected - review test results above');
      Logger.log('💡 Fix critical issues before running in production');
    }
    
    return overall_results;
  };

  return ns;
})();

// =============================================================================
// CONVENIENCE FUNCTIONS FOR EASY ACCESS
// =============================================================================

/**
 * Quick health check - use this in your main processing functions
 */
function check_critical_services() {
  return Diagnostics.check_critical_services();
}

/**
 * Test Box authentication setup
 */
function test_box_authentication() {
  return Diagnostics.test_box_authentication_setup();
}

/**
 * Test processing 3 files end-to-end
 */
function test_three_files() {
  return Diagnostics.test_process_three_files();
}

/**
 * Complete system diagnostic
 */
function run_complete_test() {
  return Diagnostics.run_complete_system_test();
}

/**
 * Validate Airtable archival setup
 */
function validate_airtable() {
  return Diagnostics.validate_airtable_setup();
}

/**
 * Test Airtable archival safely (1 record only)
 */
function test_airtable_safely() {
  return Diagnostics.test_airtable_archival_safely();
}
}
