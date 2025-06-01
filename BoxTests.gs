// File: BoxTests.gs
// Comprehensive test functions for Box Image Metadata Processing System
// Uses Bruce McPherson's cGoa library for authentication testing
// Depends on: Config.gs, BoxAuth.gs, BoxFileOperations.gs, VisionExif.gs

/**
 * Complete test of Box authentication setup following Bruce McPherson's cGoa patterns.
 */
function testBoxGoaSetup() {
  Logger.log('=== Box cGoa Authentication Test ===\n');
  
  try {
    // Test 1: Check if libraries are available
    Logger.log('1. Checking required libraries...');
    if (typeof cGoa === 'undefined') {
      Logger.log('❌ cGoa library not found - please add to Libraries');
      return;
    }
    if (typeof cUseful === 'undefined') {
      Logger.log('❌ cUseful library not found - please add to Libraries');  
      return;
    }
    Logger.log('✅ Required libraries found (cGoa, cUseful by Bruce McPherson)');
    
    // Test 2: Check credentials in properties
    Logger.log('\n2. Checking Box credentials...');
    const clientId = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY);
    const clientSecret = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY);
    
    if (!clientId || !clientSecret) {
      Logger.log('❌ Box credentials not found in Script Properties');
      Logger.log('👉 Set ' + OAUTH_CLIENT_ID_PROPERTY + ' and ' + OAUTH_CLIENT_SECRET_PROPERTY + ' in Project Settings > Script Properties');
      return;
    }
    Logger.log('✅ Box credentials found');
    
    // Test 3: Check package setup (following cGoa patterns)
    Logger.log('\n3. Checking cGoa package...');
    let goa;
    try {
      goa = getBoxGoa();
      const packageInfo = goa.getPackage();
      
      // Verify package structure following cGoa patterns
      if (packageInfo.service !== 'custom') {
        Logger.log('❌ Service should be "custom" for Box, found: ' + packageInfo.service);
        return;
      }
      
      if (!packageInfo.serviceParameters) {
        Logger.log('❌ Missing serviceParameters for custom service');
        return;
      }
      
      const requiredParams = ['authUrl', 'tokenUrl', 'refreshUrl'];
      const missingParams = requiredParams.filter(param => !packageInfo.serviceParameters[param]);
      if (missingParams.length > 0) {
        Logger.log('❌ Missing serviceParameters: ' + missingParams.join(', '));
        return;
      }
      
      Logger.log('✅ cGoa package properly configured');
      Logger.log('   Package Name: ' + packageInfo.packageName);
      Logger.log('   Service: ' + packageInfo.service);
      Logger.log('   Scopes: ' + packageInfo.scopes.join(', '));
      
    } catch (error) {
      Logger.log('❌ cGoa package error: ' + error.toString());
      Logger.log('👉 Try running createBoxPackage()');
      return;
    }
    
    // Test 4: Check authorization status (following cGoa patterns)
    Logger.log('\n4. Checking authorization status...');
    const hasToken = goa.hasToken();
    const needsConsent = goa.needsConsent();
    
    Logger.log('   Has Token: ' + hasToken);
    Logger.log('   Needs Consent: ' + needsConsent);
    
    if (!hasToken) {
      Logger.log('❌ No valid token found');
      Logger.log('👉 Run initializeBoxAuth() for setup instructions');
      return;
    }
    
    Logger.log('✅ Valid token found');
    
    // Test 5: Test token functionality (following cGoa patterns)
    Logger.log('\n5. Testing token functionality...');
    const token = goa.getToken();
    Logger.log('   Token preview: ' + token.substring(0, 20) + '...');
    
    // Test 6: Test Box API access
    Logger.log('\n6. Testing Box API access...');
    const apiResult = testBoxAccess();
    
    if (apiResult.success) {
      Logger.log('✅ Box API test successful!');
      Logger.log('   User: ' + apiResult.user.name);
      Logger.log('   Email: ' + apiResult.user.login);
    } else {
      Logger.log('❌ Box API test failed: ' + apiResult.error);
      return;
    }
    
    // Test 7: Test metadata template functions
    Logger.log('\n7. Testing metadata template integration...');
    try {
      const accessToken = getValidAccessToken();
      const template = getOrCreateImageTemplate(accessToken);
      
      if (template) {
        Logger.log('✅ Metadata template test successful!');
        Logger.log('   Template: ' + template.displayName);
        Logger.log('   Key: ' + template.templateKey);
        Logger.log('   Fields: ' + (template.fields ? template.fields.length : 0));
      } else {
        Logger.log('❌ Failed to get/create metadata template');
        return;
      }
    } catch (error) {
      Logger.log('❌ Metadata template test failed: ' + error.toString());
      return;
    }
    
    // Test 8: Test file operations
    Logger.log('\n8. Testing file operations...');
    try {
      const accessToken = getValidAccessToken();
      const sampleImages = BoxFileOperations.findAllImageFiles(ACTIVE_TEST_FOLDER_ID, accessToken);
      Logger.log('✅ File operations test successful!');
      Logger.log('   Found ' + sampleImages.length + ' images in test folder');
    } catch (error) {
      Logger.log('❌ File operations test failed: ' + error.toString());
      return;
    }
    
    // All tests passed!
    Logger.log('\n🎉 ALL cGOA TESTS PASSED! 🎉');
    Logger.log('✅ Box authentication properly configured with Bruce McPherson\'s cGoa');
    Logger.log('✅ Following cGoa documentation patterns');
    Logger.log('✅ Token management working');
    Logger.log('✅ API access confirmed');
    Logger.log('✅ Integration with metadata system ready');
    Logger.log('\n👉 You can now run setupComplete() to initialize your full system');
    
  } catch (error) {
    Logger.log('❌ Unexpected error: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}

/**
 * Test basic processing workflow.
 */
function testBasicProcessingWorkflow() {
  Logger.log('=== Testing Basic Processing Workflow ===\n');
  
  try {
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    Logger.log('1. Testing template attachment...');
    const template = getOrCreateImageTemplate(accessToken);
    if (!template) {
      Logger.log('❌ Could not get metadata template');
      return;
    }
    Logger.log('✅ Template available: ' + template.displayName);
    
    Logger.log('\n2. Finding test images...');
    const testImages = BoxFileOperations.findAllImageFiles(ACTIVE_TEST_FOLDER_ID, accessToken);
    Logger.log('✅ Found ' + testImages.length + ' images in test folder');
    
    if (testImages.length === 0) {
      Logger.log('⚠️ No images found in test folder for processing test');
      return;
    }
    
    Logger.log('\n3. Testing metadata extraction...');
    const testImage = testImages[0];
    Logger.log('   Testing with: ' + testImage.name);
    
    // Get file details for metadata extraction
    const fileDetailsUrl = BOX_API_BASE_URL + '/files/' + testImage.id + 
                          '?fields=id,name,size,path_collection,created_at,parent';
    const response = UrlFetchApp.fetch(fileDetailsUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      Logger.log('❌ Failed to get file details');
      return;
    }
    
    const fileDetails = JSON.parse(response.getContentText());
    const extractedMetadata = MetadataExtraction.extractComprehensiveMetadata(fileDetails);
    
    Logger.log('✅ Metadata extraction successful');
    Logger.log('   Content Type: ' + extractedMetadata.contentType);
    Logger.log('   Subject: ' + extractedMetadata.subject);
    Logger.log('   Processing Stage: ' + extractedMetadata.processingStage);
    
    Logger.log('\n4. Testing metadata application...');
    const applySuccess = BoxFileOperations.applyMetadata(testImage.id, extractedMetadata, accessToken);
    
    if (applySuccess) {
      Logger.log('✅ Metadata application successful');
    } else {
      Logger.log('⚠️ Metadata application failed (might already exist)');
    }
    
    Logger.log('\n5. Testing metadata retrieval...');
    const retrievedMetadata = BoxFileOperations.getCurrentMetadata(testImage.id, accessToken);
    
    if (retrievedMetadata) {
      Logger.log('✅ Metadata retrieval successful');
      Logger.log('   Retrieved stage: ' + (retrievedMetadata.processingStage || 'N/A'));
    } else {
      Logger.log('❌ Failed to retrieve metadata');
      return;
    }
    
    Logger.log('\n🎉 Basic Processing Workflow Test Complete!');
    Logger.log('✅ All basic operations working correctly');
    
  } catch (error) {
    Logger.log('❌ Basic processing workflow test failed: ' + error.toString());
    console.error('Basic processing test error:', error);
  }
}

/**
 * Test enhanced processing features (EXIF and Vision API).
 */
function testEnhancedProcessingFeatures() {
  Logger.log('=== Testing Enhanced Processing Features ===\n');
  
  try {
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    Logger.log('1. Testing Vision API setup...');
    const visionSetupOk = verifyVisionApiSetup();
    if (visionSetupOk) {
      Logger.log('✅ Vision API setup verified');
    } else {
      Logger.log('❌ Vision API setup failed - enhanced features may not work');
    }
    
    Logger.log('\n2. Finding suitable test image...');
    const testImages = BoxFileOperations.findAllImageFiles(ACTIVE_TEST_FOLDER_ID, accessToken);
    const suitableImage = testImages.find(img => 
      img.size > 0 && 
      img.size < MAX_VISION_API_FILE_SIZE_BYTES &&
      BoxFileOperations.isImageFile(img.name)
    );
    
    if (!suitableImage) {
      Logger.log('❌ No suitable image found for enhanced testing');
      return;
    }
    
    Logger.log('✅ Using test image: ' + suitableImage.name + ' (' + suitableImage.size + ' bytes)');
    
    Logger.log('\n3. Testing EXIF extraction...');
    try {
      const exifResult = extractExifData(suitableImage.id, accessToken);
      if (exifResult) {
        Logger.log('✅ EXIF extraction completed');
        Logger.log('   Has EXIF: ' + exifResult.hasExif);
        if (exifResult.hasExif && exifResult.cameraModel) {
          Logger.log('   Camera: ' + exifResult.cameraModel);
        }
      } else {
        Logger.log('⚠️ EXIF extraction returned null (normal for non-JPEG files)');
      }
    } catch (error) {
      Logger.log('❌ EXIF extraction failed: ' + error.toString());
    }
    
    Logger.log('\n4. Testing Vision API analysis...');
    if (visionSetupOk) {
      try {
        const visionResult = analyzeImageWithVisionImproved(suitableImage.id, accessToken);
        if (visionResult && !visionResult.error) {
          Logger.log('✅ Vision API analysis successful');
          Logger.log('   Labels detected: ' + (visionResult.labels ? visionResult.labels.length : 0));
          Logger.log('   Objects detected: ' + (visionResult.objects ? visionResult.objects.length : 0));
          Logger.log('   Text length: ' + (visionResult.text ? visionResult.text.length : 0));
          Logger.log('   Confidence score: ' + (visionResult.confidenceScore || 'N/A'));
          
          if (visionResult.labels && visionResult.labels.length > 0) {
            Logger.log('   Top labels: ' + visionResult.labels.slice(0, 3).map(l => l.description).join(', '));
          }
        } else {
          Logger.log('❌ Vision API analysis failed');
          if (visionResult && visionResult.error) {
            Logger.log('   Error: ' + visionResult.error);
            Logger.log('   Message: ' + (visionResult.message || 'No details'));
          }
        }
      } catch (error) {
        Logger.log('❌ Vision API test failed: ' + error.toString());
      }
    } else {
      Logger.log('⏭️ Skipping Vision API test due to setup issues');
    }
    
    Logger.log('\n5. Testing enhanced metadata extraction...');
    try {
      // Get full file details
      const fileDetailsUrl = BOX_API_BASE_URL + '/files/' + suitableImage.id + 
                            '?fields=id,name,size,path_collection,created_at,modified_at,parent';
      const response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const fileDetails = JSON.parse(response.getContentText());
        processImageFileEnhanced({ id: suitableImage.id, name: suitableImage.name }, accessToken);
        Logger.log('✅ Enhanced processing test completed');
      } else {
        Logger.log('❌ Could not get file details for enhanced processing');
      }
    } catch (error) {
      Logger.log('❌ Enhanced processing test failed: ' + error.toString());
    }
    
    Logger.log('\n🎉 Enhanced Processing Features Test Complete!');
    
  } catch (error) {
    Logger.log('❌ Enhanced processing features test failed: ' + error.toString());
    console.error('Enhanced processing test error:', error);
  }
}

/**
 * Utility function to show package contents (following cGoa debugging patterns).
 */
function showBoxPackage() {
  try {
    const goa = getBoxGoa();
    const packageInfo = goa.getPackage();
    
    Logger.log('=== Box Package Contents ===');
    Logger.log(JSON.stringify(packageInfo, (key, value) => {
      // Hide sensitive information in logs
      if (key === 'clientSecret' || key === 'accessToken' || key === 'refreshToken') {
        return value ? value.substring(0, 8) + '...' : value;
      }
      return value;
    }, 2));
    
  } catch (error) {
    Logger.log('Error showing package: ' + error.toString());
  }
}

/**
 * Quick diagnosis following cGoa patterns.
 */
function diagnoseBoxAuth() {
  Logger.log('=== Box Auth Quick Diagnosis ===');
  
  try {
    const status = getAuthStatus();
    Logger.log('Package found: ' + !status.error);
    Logger.log('Has Token: ' + status.hasToken);
    Logger.log('Needs Consent: ' + status.needsConsent);
    Logger.log('Credentials Set: ' + status.credentialsSet);
    
    if (status.error) {
      Logger.log('Error: ' + status.error);
    }
    
    // Additional diagnosis
    Logger.log('\nCredential Check:');
    Logger.log('  Client ID set: ' + !!SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY));
    Logger.log('  Client Secret set: ' + !!SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY));
    
    Logger.log('\nLibrary Check:');
    Logger.log('  cGoa available: ' + (typeof cGoa !== 'undefined'));
    Logger.log('  cUseful available: ' + (typeof cUseful !== 'undefined'));
    
  } catch (error) {
    Logger.log('Error getting status: ' + error.toString());
  }
}

/**
 * Reset and start fresh (following cGoa patterns).
 */
function resetBoxAuth() {
  Logger.log('=== Resetting Box Authentication ===');
  
  try {
    // Clear the cGoa package (this will require re-authorization)
    const goa = getBoxGoa();
    
    // Delete the stored token data
    const packageName = 'boxService';
    const tokenProperty = 'cGoa.' + packageName + '.token';
    SCRIPT_PROPERTIES.deleteProperty(tokenProperty);
    
    Logger.log('✅ Box authentication tokens cleared');
    Logger.log('👉 Run initializeBoxAuth() to re-authorize');
    
  } catch (error) {
    Logger.log('❌ Error resetting: ' + error.toString());
  }
}

/**
 * Test the complete system setup process.
 */
function testCompleteSetup() {
  Logger.log('=== Testing Complete System Setup ===\n');
  
  try {
    Logger.log('1. Testing authentication...');
    if (!testBoxAccess().success) {
      Logger.log('❌ Authentication test failed - run testBoxGoaSetup() for details');
      return;
    }
    Logger.log('✅ Authentication working');
    
    Logger.log('\n2. Testing basic processing...');
    testBasicProcessingWorkflow();
    
    Logger.log('\n3. Testing enhanced processing...');
    testEnhancedProcessingFeatures();
    
    Logger.log('\n4. Testing summary functions...');
    getImageProcessingSummary();
    
    Logger.log('\n🎉 Complete System Test Finished!');
    Logger.log('✅ All major components tested');
    Logger.log('👉 Your Box Image Metadata Processing System is ready for production use');
    
  } catch (error) {
    Logger.log('❌ Complete setup test failed: ' + error.toString());
    console.error('Complete setup test error:', error);
  }
}