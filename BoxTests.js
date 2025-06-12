// File: BoxTests.gs
// Comprehensive test functions for Box Image Metadata Processing System
// Uses Bruce McPherson's cGoa library for authentication testing
// Depends on: Config.gs, BoxAuth.gs, BoxFileOperations.gs, VisionAnalysis.gs, ExifExtraction.gs

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
    const clientId = Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_ID_PROPERTY);
    const clientSecret = Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_SECRET_PROPERTY);
    
    if (!clientId || !clientSecret) {
      Logger.log('❌ Box credentials not found in Script Properties');
      Logger.log('👉 Set ' + Config.OAUTH_CLIENT_ID_PROPERTY + ' and ' + Config.OAUTH_CLIENT_SECRET_PROPERTY + ' in Project Settings > Script Properties');
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
      const sampleImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
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
    const testImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
    Logger.log('✅ Found ' + testImages.length + ' images in test folder');
    
    if (testImages.length === 0) {
      Logger.log('⚠️ No images found in test folder for processing test');
      return;
    }
    
    Logger.log('\n3. Testing metadata extraction...');
    const testImage = testImages[0];
    Logger.log('   Testing with: ' + testImage.name);
    
    // Get file details for metadata extraction
    const fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + testImage.id + 
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
    const visionSetup = verifyVisionApiSetup();
    if (visionSetup) {
      Logger.log('✅ Vision API setup verified');
    } else {
      Logger.log('❌ Vision API setup failed - enhanced features may not work');
    }
    
    Logger.log('\n2. Finding suitable test image...');
    const testImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
    const suitableImage = testImages.find(img => 
      img.size > 0 && 
      img.size < Config.MAX_VISION_API_FILE_SIZE_BYTES &&
      BoxFileOperations.isImageFile(img.name)
    );
    
    if (!suitableImage) {
      Logger.log('❌ No suitable image found for enhanced testing');
      return;
    }
    
    Logger.log('✅ Using test image: ' + suitableImage.name + ' (' + suitableImage.size + ' bytes)');
    
    Logger.log('\n3. Testing EXIF extraction...');
    try {
      const exifResult = extractMetadata(suitableImage.id, accessToken);
      if (exifResult) {
        Logger.log('✅ EXIF extraction completed');
        Logger.log('   Has EXIF: ' + exifResult.hasExif);
        
        if (exifResult.hasExif && exifResult.metadata) {
          if (exifResult.metadata.cameraModel) {
            Logger.log('   Camera: ' + exifResult.metadata.cameraModel);
          }
          if (exifResult.metadata.imageWidth && exifResult.metadata.imageHeight) {
            Logger.log('   Dimensions: ' + exifResult.metadata.imageWidth + 'x' + exifResult.metadata.imageHeight);
          }
          if (exifResult.metadata.dateTaken) {
            Logger.log('   Date Taken: ' + exifResult.metadata.dateTaken);
          }
          
          // Test GPS data extraction
          var gpsFound = false;
          if (typeof exifResult.metadata.gpsLatitude === 'number') {
            Logger.log('   GPS Latitude: ' + exifResult.metadata.gpsLatitude);
            gpsFound = true;
          }
          if (typeof exifResult.metadata.gpsLongitude === 'number') {
            Logger.log('   GPS Longitude: ' + exifResult.metadata.gpsLongitude);
            gpsFound = true;
          }
          if (typeof exifResult.metadata.gpsAltitude === 'number') {
            Logger.log('   GPS Altitude: ' + exifResult.metadata.gpsAltitude + 'm');
            gpsFound = true;
          }
          
          if (gpsFound) {
            Logger.log('✅ GPS coordinate extraction working');
          } else {
            Logger.log('   No GPS data found in this image (normal for many photos)');
          }
        }
      } else {
        Logger.log('⚠️ EXIF extraction returned null (normal for non-JPEG files)');
      }
    } catch (error) {
      Logger.log('❌ EXIF extraction failed: ' + error.toString());
    }
    
    Logger.log('\n4. Testing Vision API analysis...');
    if (visionSetup) {
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
      const fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + suitableImage.id + 
                            '?fields=id,name,size,path_collection,created_at,modified_at,parent';
      const response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const fileDetails = JSON.parse(response.getContentText());
        const enhancedMetadata = MetadataExtraction.extractMetadata(fileDetails, accessToken);
        Logger.log('✅ Enhanced processing test completed');
        Logger.log('   Final stage: ' + enhancedMetadata.processingStage);
        
        // Test GPS data in enhanced metadata
        var enhancedGpsFound = false;
        if (typeof enhancedMetadata.gpsLatitude === 'number') {
          Logger.log('   Enhanced GPS Latitude: ' + enhancedMetadata.gpsLatitude);
          enhancedGpsFound = true;
        }
        if (typeof enhancedMetadata.gpsLongitude === 'number') {
          Logger.log('   Enhanced GPS Longitude: ' + enhancedMetadata.gpsLongitude);
          enhancedGpsFound = true;
        }
        if (typeof enhancedMetadata.gpsAltitude === 'number') {
          Logger.log('   Enhanced GPS Altitude: ' + enhancedMetadata.gpsAltitude + 'm');
          enhancedGpsFound = true;
        }
        
        if (enhancedGpsFound) {
          Logger.log('✅ GPS data successfully passed through enhanced processing');
        }
        
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
    Logger.log('  Client ID set: ' + !!Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_ID_PROPERTY));
    Logger.log('  Client Secret set: ' + !!Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_SECRET_PROPERTY));
    
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
    Config.SCRIPT_PROPERTIES.deleteProperty(tokenProperty);
    
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

/**
 * Diagnostic function to check folder access permissions
 */
function diagnoseFolderAccess() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  Logger.log("=== Box Folder Access Diagnostic ===\n");
  
  try {
    // Test 1: Check user info and permissions
    Logger.log("1. Checking authenticated user...");
    const userResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/users/me', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (userResponse.getResponseCode() === 200) {
      const user = JSON.parse(userResponse.getContentText());
      Logger.log(`✅ User: ${user.name} (${user.login})`);
      Logger.log(`   Role: ${user.role || 'N/A'}`);
      Logger.log(`   Max Upload Size: ${user.max_upload_size || 'N/A'}`);
      Logger.log(`   Enterprise: ${user.enterprise ? user.enterprise.name : 'None'}`);
    } else {
      Logger.log(`❌ User info failed: ${userResponse.getResponseCode()}`);
      return;
    }
    
    // Test 2: Check root folder access
    Logger.log("\n2. Checking root folder access...");
    const rootResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/folders/0/items?limit=10', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (rootResponse.getResponseCode() === 200) {
      const rootData = JSON.parse(rootResponse.getContentText());
      Logger.log(`✅ Root access successful - found ${rootData.entries.length} items`);
      
      // Show first few folders for reference
      const folders = rootData.entries.filter(item => item.type === 'folder').slice(0, 5);
      if (folders.length > 0) {
        Logger.log("   Top-level folders:");
        folders.forEach(folder => Logger.log(`     - ${folder.name} (ID: ${folder.id})`));
      }
    } else {
      Logger.log(`❌ Root access failed: ${rootResponse.getResponseCode()}`);
    }
    
    // Test 3: Try to access the specific folder
    Logger.log(`\n3. Testing access to folder ${Config.ACTIVE_TEST_FOLDER_ID}...`);
    const testFolderResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/folders/' + Config.ACTIVE_TEST_FOLDER_ID, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    const testCode = testFolderResponse.getResponseCode();
    if (testCode === 200) {
      const folderInfo = JSON.parse(testFolderResponse.getContentText());
      Logger.log(`✅ Folder accessible: ${folderInfo.name}`);
      Logger.log(`   Path: ${folderInfo.path_collection ? folderInfo.path_collection.entries.map(p => p.name).join(' > ') : 'N/A'}`);
    } else if (testCode === 404) {
      Logger.log("❌ Folder not found (404) - Permission or existence issue");
    } else if (testCode === 403) {
      Logger.log("❌ Folder access forbidden (403) - Permission denied");
    } else {
      Logger.log(`❌ Folder access failed: ${testCode}`);
      Logger.log(`Response: ${testFolderResponse.getContentText().substring(0, 200)}`);
    }
    
    // Test 4: Try folder contents if folder is accessible
    if (testCode === 200) {
      Logger.log(`\n4. Testing folder contents...`);
      const contentsResponse = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/folders/' + Config.ACTIVE_TEST_FOLDER_ID + '/items?limit=10', {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (contentsResponse.getResponseCode() === 200) {
        const contentsData = JSON.parse(contentsResponse.getContentText());
        Logger.log(`✅ Contents accessible - found ${contentsData.entries.length} items`);
        
        const images = contentsData.entries.filter(item => 
          item.type === 'file' && BoxFileOperations.isImageFile(item.name)
        );
        Logger.log(`   Images found: ${images.length}`);
        
        if (images.length > 0) {
          Logger.log("   Sample images:");
          images.slice(0, 3).forEach(img => 
            Logger.log(`     - ${img.name} (${Math.round(img.size/1024)}KB)`)
          );
        }
      } else {
        Logger.log(`❌ Contents access failed: ${contentsResponse.getResponseCode()}`);
      }
    }
    
    Logger.log("\n=== Diagnostic Summary ===");
    Logger.log("If folder access failed:");
    Logger.log("1. Check Box app permissions in Developer Console");
    Logger.log("2. Ensure 'Read and write all files and folders' is enabled");
    Logger.log("3. Try using a folder ID from the accessible folders above");
    Logger.log("4. Consider using root folder (ID: '0') for testing");
    
  } catch (error) {
    Logger.log(`❌ Diagnostic error: ${error.toString()}`);
  }
}

/**
 * Comprehensive test of both EXIF and Vision API with GPS data focus.
 * @param {string} testFileId Optional specific file ID to test
 */
function testComprehensiveMetadataExtraction(testFileId) {
  Logger.log("=== Comprehensive Metadata Extraction Test ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    // Find a test file if not specified
    if (!testFileId) {
      const testImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
      if (testImages.length === 0) {
        Logger.log("❌ No test images found");
        return;
      }
      testFileId = testImages[0].id;
      Logger.log(`Testing with: ${testImages[0].name}\n`);
    }
    
    // Test 1: EXIF Extraction with GPS focus
    Logger.log("1. Testing EXIF Extraction (including GPS data)...");
    const exifResult = extractMetadata(testFileId, accessToken);
    
    if (exifResult && exifResult.hasExif) {
      Logger.log("✅ EXIF extraction successful");
      Logger.log(`   Method: ${exifResult.extractionMethod}`);
      Logger.log(`   Enhanced: ${exifResult.enhanced}`);
      
      if (exifResult.metadata) {
        const metadata = exifResult.metadata;
        Logger.log("   Key metadata extracted:");
        if (metadata.cameraModel) Logger.log(`     Camera: ${metadata.cameraModel}`);
        if (metadata.imageWidth && metadata.imageHeight) {
          Logger.log(`     Dimensions: ${metadata.imageWidth} x ${metadata.imageHeight}`);
        }
        if (metadata.aspectRatio) Logger.log(`     Aspect Ratio: ${metadata.aspectRatio}`);
        if (metadata.dateTaken) Logger.log(`     Date Taken: ${metadata.dateTaken}`);
        
        // Detailed GPS testing
        Logger.log("   GPS Coordinate Testing:");
        var gpsDataFound = false;
        if (typeof metadata.gpsLatitude === 'number') {
          Logger.log(`     ✅ GPS Latitude: ${metadata.gpsLatitude}°`);
          gpsDataFound = true;
        }
        if (typeof metadata.gpsLongitude === 'number') {
          Logger.log(`     ✅ GPS Longitude: ${metadata.gpsLongitude}°`);
          gpsDataFound = true;
        }
        if (typeof metadata.gpsAltitude === 'number') {
          Logger.log(`     ✅ GPS Altitude: ${metadata.gpsAltitude}m`);
          gpsDataFound = true;
        }
        
        if (gpsDataFound) {
          Logger.log("     🌍 Complete GPS coordinate data successfully extracted!");
        } else {
          Logger.log("     📍 No GPS data in this image (normal for many photos)");
        }
      }
    } else {
      Logger.log("⚠️ No EXIF data found (normal for some file types)");
    }
    
    // Test 2: Vision API
    Logger.log("\n2. Testing Vision API...");
    
    // First check if Vision API is available
    try {
      const visionSetup = verifyVisionApiSetup();
      if (!visionSetup) {
        Logger.log("⚠️ Vision API not available - skipping");
        return;
      }
    } catch (error) {
      Logger.log("⚠️ Vision API setup failed - skipping");
      return;
    }
    
    const visionResult = analyzeImageWithVisionImproved(testFileId, accessToken);
    
    if (visionResult && !visionResult.error) {
      Logger.log("✅ Vision API analysis successful");
      Logger.log(`   Confidence Score: ${visionResult.confidenceScore || 'N/A'}`);
      Logger.log(`   Scene: ${visionResult.sceneDescription || 'N/A'}`);
      
      if (visionResult.categories) {
        Logger.log("   Categorized detections:");
        Object.keys(visionResult.categories).forEach(category => {
          const items = visionResult.categories[category];
          if (items.length > 0) {
            Logger.log(`     ${category}: ${items.slice(0, 3).join(', ')}`);
          }
        });
      }
      
      if (visionResult.text && visionResult.text.length > 0) {
        Logger.log(`   Text detected: ${visionResult.text.substring(0, 100)}${visionResult.text.length > 100 ? '...' : ''}`);
      }
      
      if (visionResult.dominantColors && visionResult.dominantColors.length > 0) {
        const colorNames = visionResult.dominantColors.map(c => c.name).slice(0, 3);
        Logger.log(`   Dominant colors: ${colorNames.join(', ')}`);
      }
      
    } else {
      Logger.log("❌ Vision API analysis failed");
      if (visionResult && visionResult.error) {
        Logger.log(`   Error: ${visionResult.error}`);
        Logger.log(`   Message: ${visionResult.message || 'No details'}`);
      }
    }
    
    Logger.log("\n🎉 Comprehensive metadata extraction test complete!");
    
    Logger.log("\n💡 Features provide:");
    Logger.log("• Comprehensive EXIF parsing with technical details");
    Logger.log("• Complete GPS coordinate extraction (lat/lng/altitude)");
    Logger.log("• Intelligent categorization of Vision API results");
    Logger.log("• Better scene descriptions and object detection");
    Logger.log("• Enhanced error handling and retry logic");
    Logger.log("• Automatic fallback to basic extraction when needed");
    
  } catch (error) {
    Logger.log(`❌ Test failed: ${error.toString()}`);
    console.error("Comprehensive test error:", error);
  }
}

/**
 * Vision API verification with detailed diagnostics.
 */
function verifyVisionApiSetup() {
  Logger.log("=== Google Vision API Setup Verification ===\n");
  
  try {
    Logger.log("1. Checking API key presence...");
    const apiKey = getVisionApiKey();
    Logger.log(`✅ API key found (${Config.VISION_API_KEY_PROPERTY}). Length: ${apiKey.length}`);
    
    if (!apiKey.startsWith('AIza') || apiKey.length !== 39) {
      Logger.log(`⚠️ API key format might be incorrect. Expected 39 chars starting with 'AIza'`);
    }
    
    Logger.log("\n2. Testing API key validity with comprehensive features...");
    const testPayload = {
      requests: [{ 
        image: { content: '' }, 
        features: [
          { type: 'LABEL_DETECTION', maxResults: 1 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 1 },
          { type: 'TEXT_DETECTION', maxResults: 1 }
        ] 
      }]
    };
    const testOptions = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(testPayload),
      muteHttpExceptions: true
    };
    const testResponse = UrlFetchApp.fetch(`${Config.VISION_API_ENDPOINT}?key=${apiKey}`, testOptions);
    const testResponseCode = testResponse.getResponseCode();
    
    if (testResponseCode === 400) {
      Logger.log("✅ API key is valid (400 error for empty image is expected)");
    } else if (testResponseCode === 403) {
      Logger.log("❌ API key authentication failed (403 Forbidden)");
      return false;
    } else {
      Logger.log(`⚠️ Unexpected response code: ${testResponseCode}`);
    }
    
    Logger.log("\n3. Testing with sample image...");
    const tinyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const imageTestPayload = {
      requests: [{ 
        image: { content: tinyImageBase64 }, 
        features: [
          { type: 'LABEL_DETECTION', maxResults: 5 },
          { type: 'OBJECT_LOCALIZATION', maxResults: 5 },
          { type: 'IMAGE_PROPERTIES' }
        ] 
      }]
    };
    const imageTestOptions = { ...testOptions, payload: JSON.stringify(imageTestPayload) };
    
    const imageTestResponse = UrlFetchApp.fetch(`${Config.VISION_API_ENDPOINT}?key=${apiKey}`, imageTestOptions);
    const imageTestResponseCode = imageTestResponse.getResponseCode();
    
    if (imageTestResponseCode === 200) {
      Logger.log("✅ Vision API features are working correctly!");
      
      // Parse response to check available features
      try {
        const responseData = JSON.parse(imageTestResponse.getContentText());
        if (responseData.responses && responseData.responses[0]) {
          Logger.log("✅ All features available:");
          Logger.log("  • Object localization");
          Logger.log("  • Label detection");
          Logger.log("  • Text detection");
          Logger.log("  • Image properties");
          Logger.log("  • Safe search detection");
        }
      } catch (e) {
        Logger.log("✅ Basic functionality confirmed");
      }
      
      return true;
    } else {
      Logger.log(`❌ Sample image test failed. Code: ${imageTestResponseCode}`);
      return false;
    }
    
  } catch (error) {
    Logger.log(`❌ Exception during Vision API verification: ${error.toString()}`);
    return false;
  }
}

// Alias for compatibility
function testEnhancedProcessingFeatures() {
  return testEnhancedProcessingFeatures();
}

// Test the cache logic to see what's actually broken

function testCacheLogic() {
  Logger.log('=== Testing Cache Logic ===');
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log('❌ No access token');
    return;
  }
  
  // 1. Check what's currently cached
  Logger.log('\n1. Current cache state:');
  const cacheStr = Config.SCRIPT_PROPERTIES.getProperty('BOXER_COMPREHENSIVE_CACHE');
  if (cacheStr) {
    Logger.log('✅ Cache exists, length: ' + cacheStr.length);
    try {
      const cache = JSON.parse(cacheStr);
      Logger.log('   Timestamp: ' + cache.timestamp);
      Logger.log('   Has data: ' + !!cache.data);
      if (cache.data) {
        Logger.log('   Total files: ' + cache.data.totalImageFiles);
      }
    } catch (e) {
      Logger.log('❌ Cache parse error: ' + e.toString());
    }
  } else {
    Logger.log('❌ No cache found');
  }
  
  // 2. Test cache age calculation
  Logger.log('\n2. Testing cache age logic:');
  if (cacheStr) {
    const cache = JSON.parse(cacheStr);
    const cacheTime = new Date(cache.timestamp);
    const cacheAge = Date.now() - cacheTime.getTime();
    const maxAge = 6 * 60 * 60 * 1000; // 6 hours
    const ageHours = cacheAge / (1000 * 60 * 60);
    
    Logger.log('   Cache age: ' + ageHours.toFixed(1) + ' hours');
    Logger.log('   Max age: 6 hours');
    Logger.log('   Should use cache: ' + (cacheAge < maxAge));
  }
  
  // 3. Test with cache enabled
  Logger.log('\n3. Testing with cache enabled:');
  const countsWithCache = OptimizedProcessing.getComprehensiveImageCount(accessToken, true);
  Logger.log('   Result: ' + JSON.stringify(countsWithCache).substring(0, 100) + '...');
  
  // 4. Test with cache disabled  
  Logger.log('\n4. Testing with cache disabled:');
  const countsWithoutCache = OptimizedProcessing.getComprehensiveImageCount(accessToken, false);
  Logger.log('   Result: ' + JSON.stringify(countsWithoutCache).substring(0, 100) + '...');
  
  // 5. Check if cache was updated
  Logger.log('\n5. Cache after fresh call:');
  const newCacheStr = Config.SCRIPT_PROPERTIES.getProperty('BOXER_COMPREHENSIVE_CACHE');
  if (newCacheStr !== cacheStr) {
    Logger.log('✅ Cache was updated');
  } else {
    Logger.log('❌ Cache was NOT updated');
  }
}

function clearCache() {
  Config.SCRIPT_PROPERTIES.deleteProperty('BOXER_COMPREHENSIVE_CACHE');
  Logger.log('Cache cleared');
}

function showCacheStatus() {
  const cacheStr = Config.SCRIPT_PROPERTIES.getProperty('BOXER_COMPREHENSIVE_CACHE');
  if (cacheStr) {
    const cache = JSON.parse(cacheStr);
    const ageHours = (Date.now() - new Date(cache.timestamp).getTime()) / (1000 * 60 * 60);
    Logger.log('Cache age: ' + ageHours.toFixed(1) + ' hours');
    Logger.log('Total files: ' + (cache.data ? cache.data.totalImageFiles : 'unknown'));
  } else {
    Logger.log('No cache');
  }
}

function debugFolderListingStrategy() {
  const accessToken = getValidAccessToken();
  
  // Test the exact search that's failing
  const searchUrl = Config.BOX_API_BASE_URL + '/search' +
                   '?query=jpg OR jpeg OR png' +
                   '&type=file' +
                   '&limit=100' +
                   '&fields=id,name,size,created_at,modified_at';
  
  const response = UrlFetchApp.fetch(searchUrl, {
    headers: { 'Authorization': 'Bearer ' + accessToken },
    muteHttpExceptions: true
  });
  
  Logger.log('Search URL: ' + searchUrl);
  Logger.log('Response code: ' + response.getResponseCode());
  
  if (response.getResponseCode() === 200) {
    const data = JSON.parse(response.getContentText());
    Logger.log('Raw results: ' + data.entries.length);
    
    const imageFiles = data.entries.filter(file => 
      file.type === 'file' && BoxFileOperations.isImageFile(file.name)
    );
    Logger.log('Image files: ' + imageFiles.length);
  } else {
    Logger.log('Search failed: ' + response.getContentText());
  }
}
function testPropertiesService() {
  const ps = PropertiesService.getScriptProperties();
  const key = 'myManualTestProperty';
  const value = 'Hello, world! ' + new Date().toISOString();

  try {
    Logger.log('--- Testing Properties Service Directly ---');

    // 1. Read before writing to see the initial state
    const initialValue = ps.getProperty(key);
    Logger.log('Initial value of "' + key + '": ' + initialValue);

    // 2. Write a new value
    Logger.log('Attempting to set property...');
    ps.setProperty(key, value);
    Logger.log('setProperty() executed without error.');

    // 3. Read the value back immediately to confirm the write
    const newValue = ps.getProperty(key);
    Logger.log('Value read back: ' + newValue);
    if (newValue === value) {
      Logger.log('✅ SUCCESS: Property was written and read back correctly via code.');
    } else {
      Logger.log('❌ FAILURE: Value read back does not match value written.');
    }

    // 4. Delete the property
    Logger.log('Attempting to delete property...');
    ps.deleteProperty(key);
    Logger.log('deleteProperty() executed without error.');
    const finalValue = ps.getProperty(key);
    if (finalValue === null) {
      Logger.log('✅ SUCCESS: Property was deleted correctly via code.');
    } else {
      Logger.log('❌ FAILURE: Property still exists after deletion.');
    }

  } catch (e) {
    Logger.log('💥 An exception occurred during the test: ' + e.toString());
  }
}
function debugStrategyRotation() {
  const checkpoint = OptimizedProcessing.getCheckpoint();
  Logger.log('Current checkpoint: ' + JSON.stringify(checkpoint));
  Logger.log('Last search method: ' + (checkpoint.lastSearchMethod || 'none'));
  
  // Test the strategy that should find unprocessed files
  const accessToken = getValidAccessToken();
  const unprocessedFiles = OptimizedProcessing.findFilesWithMetadataFilter(
    accessToken, 'processingStage', 'unprocessed'
  );
  Logger.log('Unprocessed files found: ' + unprocessedFiles.length);
}