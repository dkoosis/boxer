// File: Diagnostics.js
// Comprehensive diagnostic, testing, and health check functions for the Boxer system
// Consolidates diagnostic functions from BoxUtilities.js

const Diagnostics = (function() {
  'use strict';
  
  const ns = {};

  /**
   * Quick health check for critical Google Services
   */
  ns.checkCriticalServices = function() {
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
        const testResponse = UrlFetchApp.fetch('https://httpbin.org/status/200', {
          muteHttpExceptions: true,
          timeout: 10
        });
        if (testResponse.getResponseCode() !== 200) {
          Logger.log('❌ Google UrlFetch service is experiencing issues');
          return false;
        }
      } catch (error) {
        Logger.log(`❌ Google UrlFetch service is down: ${error.toString()}`);
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
   * Enhanced health check with detailed service testing
   */
  ns.detailedHealthCheck = function() {
    const healthStatus = {
      overallHealthy: true,
      services: {},
      timestamp: new Date().toISOString()
    };
    
    // Test Google Services
    healthStatus.services.properties = testService_('PropertiesService', () => {
      PropertiesService.getScriptProperties().getProperty('_test');
    });
    
    healthStatus.services.urlfetch = testService_('UrlFetchApp', () => {
      const response = UrlFetchApp.fetch('https://httpbin.org/status/200', {
        muteHttpExceptions: true,
        timeout: 5
      });
      return response.getResponseCode() === 200;
    });
    
    healthStatus.services.drive = testService_('DriveApp', () => {
      DriveApp.getRootFolder().getName();
    });
    
    healthStatus.services.logger = testService_('Logger', () => {
      Logger.log('Health check test');
    });
    
    // Check if any critical services failed
    healthStatus.overallHealthy = Object.keys(healthStatus.services).every(service => 
      healthStatus.services[service].healthy
    );
    
    return healthStatus;
  };

  /**
   * Test a specific service with error handling
   * @private
   */
  function testService_(serviceName, testFunction) {
    try {
      const result = testFunction();
      return {
        healthy: true,
        testedAt: new Date().toISOString(),
        result
      };
    } catch (error) {
      return {
        healthy: false,
        testedAt: new Date().toISOString(),
        error: error.toString()
      };
    }
  }

  /**
   * Test Box authentication
   */
  ns.testBoxAuth = function() {
    Logger.log('=== Testing Box Authentication ===');
    
    try {
      const accessToken = getValidAccessToken();
      if (!accessToken) {
        Logger.log('❌ No access token available');
        return { success: false, error: 'No access token' };
      }
      
      Logger.log('✅ Access token obtained');
      
      // Test API call
      const response = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const user = JSON.parse(response.getContentText());
        Logger.log(`✅ Box API working - User: ${user.name}`);
        return { success: true, user };
      } else {
        Logger.log(`❌ Box API error: ${response.getResponseCode()}`);
        return { success: false, error: `Box API error: ${response.getResponseCode()}` };
      }
      
    } catch (error) {
      Logger.log(`❌ Box auth test failed: ${error.toString()}`);
      return { success: false, error: error.toString() };
    }
  };

  /**
   * Test basic file operations
   */
  ns.testFileOperations = function() {
    Logger.log('=== Testing File Operations ===');
    
    try {
      const accessToken = getValidAccessToken();
      if (!accessToken) {
        return { success: false, error: 'No access token' };
      }
      
      // Try to find some image files
      const images = BoxFileOperations.findAllImageFiles(
        ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0', 
        accessToken
      );
      
      Logger.log(`✅ Found ${images.length} image files`);
      
      if (images.length > 0) {
        Logger.log(`Sample file: ${images[0].name}`);
      }
      
      return { 
        success: true, 
        imagesFound: images.length,
        sampleFile: images.length > 0 ? images[0].name : null
      };
      
    } catch (error) {
      Logger.log(`❌ File operations test failed: ${error.toString()}`);
      return { success: false, error: error.toString() };
    }
  };

  /**
   * Run a quick system test
   */
  ns.runQuickTest = function() {
    Logger.log('🐕 === Boxer Quick System Test ===');
    
    const results = {
      healthCheck: false,
      boxAuth: false,
      fileOperations: false,
      overallSuccess: false
    };
    
    // Test 1: Health check
    results.healthCheck = ns.checkCriticalServices();
    
    // Test 2: Box auth (only if health check passes)
    if (results.healthCheck) {
      const authResult = ns.testBoxAuth();
      results.boxAuth = authResult.success;
    }
    
    // Test 3: File operations (only if auth works)
    if (results.boxAuth) {
      const fileResult = ns.testFileOperations();
      results.fileOperations = fileResult.success;
    }
    
    results.overallSuccess = results.healthCheck && results.boxAuth && results.fileOperations;
    
    Logger.log('📊 === Test Results ===');
    Logger.log(`Health Check: ${results.healthCheck ? '✅' : '❌'}`);
    Logger.log(`Box Auth: ${results.boxAuth ? '✅' : '❌'}`);
    Logger.log(`File Operations: ${results.fileOperations ? '✅' : '❌'}`);
    Logger.log(`Overall: ${results.overallSuccess ? '🎉 SUCCESS' : '❌ NEEDS ATTENTION'}`);
    
    return results;
  };

  /**
   * Run OAuth2 diagnostics
   */
  ns.runOAuth2Diagnostics = function() {
    Logger.log('=== 🔧 Box OAuth2 Diagnostics ===');
    Logger.log(`Timestamp: ${new Date().toISOString()}`);
    
    // Test 1: Check OAuth2 library
    Logger.log('\n1. Checking OAuth2 library...');
    try {
      if (typeof OAuth2 === 'undefined') {
        Logger.log('❌ OAuth2 library not found');
        Logger.log('   Add library: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF');
      } else {
        Logger.log('✅ OAuth2 library loaded');
      }
    } catch (e) {
      Logger.log(`❌ OAuth2 library error: ${e.toString()}`);
    }
    
    // Test 2: Check credentials
    Logger.log('\n2. Checking Box credentials...');
    const clientId = ConfigManager.getProperty('BOX_CLIENT_ID');
    const clientSecret = ConfigManager.getProperty('BOX_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      Logger.log('❌ Box credentials not found in Script Properties');
      Logger.log('   Set BOX_CLIENT_ID and BOX_CLIENT_SECRET');
    } else {
      Logger.log('✅ Box credentials found');
      Logger.log(`   Client ID: ${clientId.substring(0, 10)}...`);
    }
    
    // Test 3: Check service configuration
    Logger.log('\n3. Checking OAuth2 service...');
    try {
      const service = getBoxService();
      Logger.log('✅ Box service created successfully');
      
      // Test 4: Check authorization status
      Logger.log('\n4. Checking authorization status...');
      if (service.hasAccess()) {
        Logger.log('✅ Valid token found');
        
        // Test 5: Test actual Box API call
        Logger.log('\n5. Testing Box API connection...');
        const result = ns.testBoxAuth();
        if (result.success) {
          Logger.log('✅ API test successful');
        } else {
          Logger.log(`❌ API test failed: ${result.error}`);
        }
      } else {
        Logger.log('❌ Not authorized - need to complete OAuth flow');
        Logger.log('   Run BoxerApp.initializeBoxAuth() to get authorization URL');
      }
      
      // Show service URLs
      Logger.log('\n📍 Service URLs:');
      Logger.log('   Authorization URL: https://account.box.com/api/oauth2/authorize');
      Logger.log('   Token URL: https://api.box.com/oauth2/token');
      Logger.log('   Callback Function: authCallback');
      
    } catch (error) {
      Logger.log(`❌ Service error: ${error.toString()}`);
    }
    
    Logger.log('\n=== Diagnostics Complete ===');
  };

  /**
   * Test reports folder access
   */
  ns.testReportsFolder = function() {
    try {
      const token = getValidAccessToken();
      const folderId = ConfigManager.getProperty('BOX_REPORTS_FOLDER');
      
      if (!folderId) {
        Logger.log('❌ BOX_REPORTS_FOLDER not configured');
        return;
      }
      
      const response = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/folders/${folderId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
        muteHttpExceptions: true
      });
      
      Logger.log(`Status: ${response.getResponseCode()}`);
      if (response.getResponseCode() === 200) {
        const folder = JSON.parse(response.getContentText());
        Logger.log(`Folder: ${folder.name}`);
        Logger.log(`Contains ${folder.item_collection.total_count} items`);
      }
    } catch (error) {
      Logger.log(`❌ Error testing reports folder: ${error.toString()}`);
    }
  };

  

  /**
   * Diagnose Google Drive issues
   */
  ns.diagnoseGDriveIssue = function() {
    // Test basic Drive access
    try {
      DriveApp.getRootFolder().getName();
      Logger.log('✅ Drive access works');
    } catch (e) {
      Logger.log(`❌ Drive access failed: ${e.toString()}`);
      return;
    }
    
    // Check current config
    Logger.log('\nCurrent properties:');
    Logger.log(`BOXER_CACHE_FOLDER: ${ConfigManager.getProperty('BOXER_CACHE_FOLDER')}`);
    Logger.log(`BOXER_TRACKING_SHEET: ${ConfigManager.getProperty('BOXER_TRACKING_SHEET')}`);
    
    // Try validation again
    const validation = ConfigManager.validate(true);
    Logger.log(`\nValidation result: ${validation.valid}`);
    if (!validation.valid) {
      validation.errors.forEach(e => Logger.log(`  ${e}`));
    }
  };
// In Diagnostics.js, inside the Diagnostics = (function() { ... })(); block

  /**
   * Test processing on a specific folder of images
   */
  ns.runImageProcessingTest = function() {
    Logger.log('🧪 === Testing Image Processing on Sample Data ===');
    const maxFilesToProcess = 25; // Safety limit for a test run
    let processedCount = 0;

    try {
      const accessToken = getValidAccessToken();
      if (!accessToken) {
        Logger.log('❌ Could not get Box access token.');
        return { success: false, error: 'No access token' };
      }

      const testFolderId = ConfigManager.getProperty('BOX_TEST_DATA_FOLDER');
      if (!testFolderId) {
        Logger.log('❌ BOX_TEST_DATA_FOLDER is not set in Script Properties.');
        Logger.log('💡 Please add it and set the value to your Box folder ID.');
        return { success: false, error: 'Test folder not configured' };
      }

      Logger.log(`📁 Processing images in folder ID: ${testFolderId}`);
      const imageFiles = BoxFileOperations.findAllImageFiles(testFolderId, accessToken);
      
      if (imageFiles.length === 0) {
        Logger.log('✅ No image files found in the test folder.');
        return { success: true, message: 'No images found' };
      }

      Logger.log(`Found ${imageFiles.length} images. Processing up to ${maxFilesToProcess}...`);

      for (const image of imageFiles.slice(0, maxFilesToProcess)) {
        Logger.log(`--- Processing: ${image.name} (ID: ${image.id}) ---`);
        
        // The report-based processing function can be reused here
        const result = BoxReportManager.processFileFromReport(image, accessToken);
        
        if (result === 'processed' || result === 'skipped') {
          processedCount++;
        }
        Logger.log(`--- Result for ${image.name}: ${result} ---`);
      }

      Logger.log(`\n🎉 Test Complete. Processed ${processedCount} of ${imageFiles.length} images found.`);
      return { success: true, processed: processedCount, found: imageFiles.length };

    } catch (error) {
      Logger.log(`❌ Test failed with an exception: ${error.toString()}`);
      ErrorHandler.reportError(error, 'Diagnostics.runImageProcessingTest');
      return { success: false, error: error.toString() };
    }
  };

  return ns;
})();

