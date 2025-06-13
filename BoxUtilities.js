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
  // SIMPLE TEST FUNCTIONS
  // =============================================================================

  /**
   * Simple test of Box authentication
   * @returns {object} Test results
   */
  ns.test_box_auth = function() {
    Logger.log('=== Testing Box Authentication ===');
    
    try {
      var access_token = getValidAccessToken();
      if (!access_token) {
        Logger.log('❌ No access token available');
        return { success: false, error: 'No access token' };
      }
      
      Logger.log('✅ Access token obtained');
      
      // Test API call
      var response = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/users/me', {
        headers: { 'Authorization': 'Bearer ' + access_token },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var user = JSON.parse(response.getContentText());
        Logger.log('✅ Box API working - User: ' + user.name);
        return { success: true, user: user };
      } else {
        Logger.log('❌ Box API error: ' + response.getResponseCode());
        return { success: false, error: 'Box API error: ' + response.getResponseCode() };
      }
      
    } catch (error) {
      Logger.log('❌ Box auth test failed: ' + error.toString());
      return { success: false, error: error.toString() };
    }
  };

  /**
   * Test basic file operations
   * @returns {object} Test results
   */
  ns.test_file_operations = function() {
    Logger.log('=== Testing File Operations ===');
    
    try {
      var access_token = getValidAccessToken();
      if (!access_token) {
        return { success: false, error: 'No access token' };
      }
      
      // Try to find some image files
      var images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, access_token);
      
      Logger.log('✅ Found ' + images.length + ' image files');
      
      if (images.length > 0) {
        Logger.log('Sample file: ' + images[0].name);
      }
      
      return { 
        success: true, 
        images_found: images.length,
        sample_file: images.length > 0 ? images[0].name : null
      };
      
    } catch (error) {
      Logger.log('❌ File operations test failed: ' + error.toString());
      return { success: false, error: error.toString() };
    }
  };

  /**
   * Run a quick system test
   * @returns {object} Test results
   */
  ns.run_quick_test = function() {
    Logger.log('🐕 === Boxer Quick System Test ===');
    
    var results = {
      health_check: false,
      box_auth: false,
      file_operations: false,
      overall_success: false
    };
    
    // Test 1: Health check
    results.health_check = ns.check_critical_services();
    
    // Test 2: Box auth (only if health check passes)
    if (results.health_check) {
      var auth_result = ns.test_box_auth();
      results.box_auth = auth_result.success;
    }
    
    // Test 3: File operations (only if auth works)
    if (results.box_auth) {
      var file_result = ns.test_file_operations();
      results.file_operations = file_result.success;
    }
    
    results.overall_success = results.health_check && results.box_auth && results.file_operations;
    
    Logger.log('📊 === Test Results ===');
    Logger.log('Health Check: ' + (results.health_check ? '✅' : '❌'));
    Logger.log('Box Auth: ' + (results.box_auth ? '✅' : '❌'));
    Logger.log('File Operations: ' + (results.file_operations ? '✅' : '❌'));
    Logger.log('Overall: ' + (results.overall_success ? '🎉 SUCCESS' : '❌ NEEDS ATTENTION'));
    
    return results;
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
 * Test Box authentication
 */
function test_box_auth() {
  return Diagnostics.test_box_auth();
}

/**
 * Test file operations
 */
function test_file_ops() {
  return Diagnostics.test_file_operations();
}

/**
 * Run quick system test
 */
function run_quick_test() {
  return Diagnostics.run_quick_test();
}