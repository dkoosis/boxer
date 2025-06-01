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
    const userResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/users/me', {
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
    const rootResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/0/items?limit=10', {
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
    Logger.log(`\n3. Testing access to folder ${ACTIVE_TEST_FOLDER_ID}...`);
    const testFolderResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/' + ACTIVE_TEST_FOLDER_ID, {
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
      const contentsResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/' + ACTIVE_TEST_FOLDER_ID + '/items?limit=10', {
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
    
    // Test 5: Search for accessible folders with images
    Logger.log("\n5. Searching for alternative folders with images...");
    try {
      const searchResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/search?query=*.jpg&type=file&limit=10', {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      if (searchResponse.getResponseCode() === 200) {
        const searchData = JSON.parse(searchResponse.getContentText());
        Logger.log(`✅ Search found ${searchData.entries.length} image files`);
        
        if (searchData.entries.length > 0) {
          const uniqueFolders = new Set();
          searchData.entries.forEach(file => {
            if (file.parent && file.parent.id) {
              uniqueFolders.add(`${file.parent.name} (ID: ${file.parent.id})`);
            }
          });
          
          Logger.log("   Folders containing images:");
          Array.from(uniqueFolders).slice(0, 5).forEach(folder => 
            Logger.log(`     - ${folder}`)
          );
        }
      } else {
        Logger.log(`❌ Search failed: ${searchResponse.getResponseCode()}`);
      }
    } catch (error) {
      Logger.log(`❌ Search error: ${error.toString()}`);
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
 * Updates the test folder ID to an accessible one
 */
function updateTestFolderToAccessible() {
  Logger.log("=== Finding Accessible Test Folder ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    // Search for image files to find accessible folders
    const searchResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/search?query=*.jpg&type=file&limit=50', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (searchResponse.getResponseCode() === 200) {
      const searchData = JSON.parse(searchResponse.getContentText());
      Logger.log(`Found ${searchData.entries.length} image files`);
      
      if (searchData.entries.length > 0) {
        // Count images per folder
        const folderCounts = {};
        searchData.entries.forEach(file => {
          if (file.parent && file.parent.id) {
            const folderId = file.parent.id;
            const folderName = file.parent.name;
            if (!folderCounts[folderId]) {
              folderCounts[folderId] = { name: folderName, count: 0, id: folderId };
            }
            folderCounts[folderId].count++;
          }
        });
        
        // Find folder with most images
        const sortedFolders = Object.values(folderCounts)
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);
        
        Logger.log("\nFolders with images (sorted by count):");
        sortedFolders.forEach(folder => 
          Logger.log(`  ${folder.name}: ${folder.count} images (ID: ${folder.id})`)
        );
        
        if (sortedFolders.length > 0) {
          const bestFolder = sortedFolders[0];
          Logger.log(`\n✅ Recommended test folder: ${bestFolder.name} (ID: ${bestFolder.id})`);
          Logger.log(`Update ACTIVE_TEST_FOLDER_ID in Config.gs to: '${bestFolder.id}'`);
          
          // Test access to this folder
          const testResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/' + bestFolder.id + '/items?limit=5', {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
          });
          
          if (testResponse.getResponseCode() === 200) {
            Logger.log("✅ Folder access confirmed");
          } else {
            Logger.log(`❌ Folder access test failed: ${testResponse.getResponseCode()}`);
          }
        }
      } else {
        Logger.log("❌ No image files found in accessible folders");
        Logger.log("Try using root folder (ID: '0') or upload some test images");
      }
    } else {
      Logger.log(`❌ Search failed: ${searchResponse.getResponseCode()}`);
    }
    
  } catch (error) {
    Logger.log(`❌ Error finding accessible folder: ${error.toString()}`);
  }
}

/**
 * Simple version of BoxFileOperations without cUseful retry logic
 * Use this if the main version hangs
 */
var SimpleBoxOperations = {
  
  /**
   * Simple version of findAllImageFiles without cUseful retry
   */
  findAllImageFiles: function(folderId, accessToken) {
    folderId = folderId || '0';  // Default to root
    
    if (!accessToken) {
      throw new Error('Access token required');
    }
    
    const allImages = [];
    
    try {
      const url = BOX_API_BASE_URL + '/folders/' + folderId + '/items?limit=1000&fields=id,name,type,size,path_collection,created_at,modified_at,parent';
      
      const response = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true,
        timeout: 30000  // 30 second timeout
      });
      
      const responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        Logger.log('Failed to list folder ' + folderId + '. HTTP Code: ' + responseCode);
        return allImages;
      }
      
      const data = JSON.parse(response.getContentText());
      
      data.entries.forEach(function(item) {
        if (item.type === 'file' && BoxFileOperations.isImageFile(item.name)) {
          // Build path string
          let pathString = 'All Files';
          if (item.path_collection && item.path_collection.entries.length > 1) {
            pathString = item.path_collection.entries.slice(1)
              .map(p => p.name)
              .join('/');
          } else if (item.parent && item.parent.name && item.parent.id !== '0') {
            pathString = item.parent.name;
          } else if (item.parent && item.parent.id === '0') {
            pathString = '';
          }
          
          allImages.push({
            id: item.id,
            name: item.name,
            size: item.size,
            path: pathString,
            created_at: item.created_at,
            modified_at: item.modified_at
          });
        }
      });
      
      Logger.log('Found ' + allImages.length + ' images in folder ' + folderId);
      return allImages;
      
    } catch (error) {
      Logger.log('Error in findAllImageFiles: ' + error.toString());
      return allImages;
    }
  },
  
  /**
   * Simple test of the basic workflow
   */
  testBasicWorkflowWithSimpleOps: function() {
    Logger.log("=== Testing Basic Workflow (Simple Operations) ===\n");
    
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log("❌ No access token available");
      return;
    }
    
    Logger.log("1. Testing template...");
    const template = getOrCreateImageTemplate(accessToken);
    if (!template) {
      Logger.log("❌ Template not available");
      return;
    }
    Logger.log("✅ Template: " + template.displayName);
    
    Logger.log("\n2. Finding images with simple operations...");
    const images = this.findAllImageFiles(ACTIVE_TEST_FOLDER_ID, accessToken);
    Logger.log("✅ Found " + images.length + " images");
    
    if (images.length === 0) {
      Logger.log("⚠️ No images found - try using root folder ('0') or different folder");
      return;
    }
    
    Logger.log("\n3. Testing metadata on first image...");
    const testImage = images[0];
    Logger.log("Testing with: " + testImage.name);
    
    // Test basic metadata extraction
    try {
      // Get file details
      const fileDetailsUrl = BOX_API_BASE_URL + '/files/' + testImage.id + 
                            '?fields=id,name,size,path_collection,created_at,parent';
      const fileResponse = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true,
        timeout: 15000
      });
      
      if (fileResponse.getResponseCode() === 200) {
        const fileDetails = JSON.parse(fileResponse.getContentText());
        const extractedMetadata = MetadataExtraction.extractComprehensiveMetadata(fileDetails);
        
        Logger.log("✅ Metadata extraction successful");
        Logger.log("Content Type: " + extractedMetadata.contentType);
        Logger.log("Subject: " + extractedMetadata.subject);
        Logger.log("Processing Stage: " + extractedMetadata.processingStage);
        
        Logger.log("\n🎉 Simple workflow test complete!");
        Logger.log("If this worked, use SimpleBoxOperations instead of BoxFileOperations");
        
      } else {
        Logger.log("❌ Failed to get file details");
      }
      
    } catch (error) {
      Logger.log("❌ Metadata extraction error: " + error.toString());
    }
  }
};

/**
 * Simple Box API test without cUseful retry logic
 * Use this to isolate API issues
 */
function simpleBoxApiTest() {
  Logger.log("=== Simple Box API Test (No Retry Logic) ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  Logger.log("✅ Access token obtained");
  Logger.log("Token preview: " + accessToken.substring(0, 20) + "...\n");
  
  // Test 1: Simple user info call with timeout
  Logger.log("1. Testing user info with 10s timeout...");
  try {
    const userResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/users/me', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      timeout: 10000  // 10 second timeout
    });
    
    const userCode = userResponse.getResponseCode();
    Logger.log(`User API response code: ${userCode}`);
    
    if (userCode === 200) {
      const user = JSON.parse(userResponse.getContentText());
      Logger.log(`✅ User: ${user.name} (${user.login})`);
    } else {
      Logger.log(`❌ User API failed: ${userCode}`);
      Logger.log("Response: " + userResponse.getContentText().substring(0, 200));
      return;
    }
  } catch (error) {
    Logger.log(`❌ User API error: ${error.toString()}`);
    return;
  }
  
  // Test 2: Root folder with timeout
  Logger.log("\n2. Testing root folder with 15s timeout...");
  try {
    const rootResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/0/items?limit=10', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      timeout: 15000  // 15 second timeout
    });
    
    const rootCode = rootResponse.getResponseCode();
    Logger.log(`Root folder response code: ${rootCode}`);
    
    if (rootCode === 200) {
      const rootData = JSON.parse(rootResponse.getContentText());
      Logger.log(`✅ Root folder accessible - ${rootData.entries.length} items`);
      
      // Show some folders
      const folders = rootData.entries.filter(item => item.type === 'folder').slice(0, 3);
      if (folders.length > 0) {
        Logger.log("Sample folders:");
        folders.forEach(folder => Logger.log(`  - ${folder.name} (ID: ${folder.id})`));
      }
    } else {
      Logger.log(`❌ Root folder failed: ${rootCode}`);
      Logger.log("Response: " + rootResponse.getContentText().substring(0, 200));
      return;
    }
  } catch (error) {
    Logger.log(`❌ Root folder error: ${error.toString()}`);
    return;
  }
  
  // Test 3: Test the problematic folder directly
  Logger.log(`\n3. Testing problematic folder ${ACTIVE_TEST_FOLDER_ID} with 15s timeout...`);
  try {
    const testFolderResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/' + ACTIVE_TEST_FOLDER_ID + '/items?limit=10', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      timeout: 15000  // 15 second timeout
    });
    
    const testCode = testFolderResponse.getResponseCode();
    Logger.log(`Test folder response code: ${testCode}`);
    
    if (testCode === 200) {
      const testData = JSON.parse(testFolderResponse.getContentText());
      Logger.log(`✅ Test folder accessible - ${testData.entries.length} items`);
      
      const images = testData.entries.filter(item => 
        item.type === 'file' && BoxFileOperations.isImageFile(item.name)
      );
      Logger.log(`Images found: ${images.length}`);
      
      if (images.length > 0) {
        Logger.log("Sample images:");
        images.slice(0, 3).forEach(img => 
          Logger.log(`  - ${img.name} (${Math.round(img.size/1024)}KB)`)
        );
      }
    } else if (testCode === 404) {
      Logger.log(`❌ Folder not found (404) - try a different folder ID`);
    } else if (testCode === 403) {
      Logger.log(`❌ Access denied (403) - check app permissions`);
    } else {
      Logger.log(`❌ Test folder failed: ${testCode}`);
      Logger.log("Response: " + testFolderResponse.getContentText().substring(0, 200));
    }
  } catch (error) {
    Logger.log(`❌ Test folder error: ${error.toString()}`);
  }
  
  Logger.log("\n=== Simple Test Complete ===");
}

/**
 * Test basic processing workflow with simple API calls (no cUseful)
 */
function testBasicWorkflowSimple() {
  Logger.log("=== Testing Basic Workflow (Simple Version) ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  // Test template
  Logger.log("1. Testing template...");
  const template = getOrCreateImageTemplate(accessToken);
  if (!template) {
    Logger.log("❌ Template not available");
    return;
  }
  Logger.log(`✅ Template: ${template.displayName}`);
  
  // Use root folder instead of test folder
  Logger.log("\n2. Finding images in root folder...");
  try {
    const rootResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/0/items?limit=50&fields=id,name,type,size', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      timeout: 20000
    });
    
    if (rootResponse.getResponseCode() !== 200) {
      Logger.log(`❌ Failed to list root folder: ${rootResponse.getResponseCode()}`);
      return;
    }
    
    const rootData = JSON.parse(rootResponse.getContentText());
    const images = rootData.entries.filter(item => 
      item.type === 'file' && BoxFileOperations.isImageFile(item.name)
    );
    
    Logger.log(`✅ Found ${images.length} images in root folder`);
    
    if (images.length === 0) {
      Logger.log("⚠️ No images in root folder - try uploading a test image");
      return;
    }
    
    // Test metadata on first image
    Logger.log("\n3. Testing metadata on first image...");
    const testImage = images[0];
    Logger.log(`Testing with: ${testImage.name}`);
    
    // Check current metadata
    const metadataUrl = `${BOX_API_BASE_URL}/files/${testImage.id}/metadata/${BOX_METADATA_SCOPE}/${BOX_METADATA_TEMPLATE_KEY}`;
    const metadataResponse = UrlFetchApp.fetch(metadataUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      timeout: 10000
    });
    
    const metadataCode = metadataResponse.getResponseCode();
    if (metadataCode === 200) {
      const metadata = JSON.parse(metadataResponse.getContentText());
      Logger.log("✅ Image already has metadata");
      Logger.log(`Processing stage: ${metadata.processingStage || 'N/A'}`);
    } else if (metadataCode === 404) {
      Logger.log("⚠️ Image has no metadata yet");
    } else {
      Logger.log(`❌ Metadata check failed: ${metadataCode}`);
    }
    
    Logger.log("\n✅ Simple workflow test complete!");
    Logger.log("If this worked, the issue is likely in the cUseful retry logic");
    
  } catch (error) {
    Logger.log(`❌ Simple workflow error: ${error.toString()}`);
  }
}

/**
 * Alternative test folder ID finder using simple API calls
 */
function findWorkingFolderSimple() {
  Logger.log("=== Finding Working Folder (Simple Method) ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    // Get root folder contents
    const rootResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/0/items?limit=100', {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true,
      timeout: 15000
    });
    
    if (rootResponse.getResponseCode() !== 200) {
      Logger.log(`❌ Root folder failed: ${rootResponse.getResponseCode()}`);
      return;
    }
    
    const rootData = JSON.parse(rootResponse.getContentText());
    const folders = rootData.entries.filter(item => item.type === 'folder');
    
    Logger.log(`Found ${folders.length} folders in root`);
    
    // Test each folder for images
    for (let i = 0; i < Math.min(5, folders.length); i++) {
      const folder = folders[i];
      Logger.log(`\nTesting folder: ${folder.name} (ID: ${folder.id})`);
      
      try {
        const folderResponse = UrlFetchApp.fetch(BOX_API_BASE_URL + '/folders/' + folder.id + '/items?limit=20', {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true,
          timeout: 10000
        });
        
        if (folderResponse.getResponseCode() === 200) {
          const folderData = JSON.parse(folderResponse.getContentText());
          const images = folderData.entries.filter(item => 
            item.type === 'file' && BoxFileOperations.isImageFile(item.name)
          );
          
          if (images.length > 0) {
            Logger.log(`✅ Found ${images.length} images in ${folder.name}`);
            Logger.log(`Suggested ACTIVE_TEST_FOLDER_ID: '${folder.id}'`);
            
            // Show sample images
            images.slice(0, 3).forEach(img => 
              Logger.log(`  - ${img.name}`)
            );
            break;
          } else {
            Logger.log(`No images in ${folder.name}`);
          }
        } else {
          Logger.log(`Access denied to ${folder.name}: ${folderResponse.getResponseCode()}`);
        }
      } catch (error) {
        Logger.log(`Error accessing ${folder.name}: ${error.toString()}`);
      }
    }
    
  } catch (error) {
    Logger.log(`❌ Error finding folders: ${error.toString()}`);
  }
}

// File: BoxerComplete.gs
// ONE simple function that handles everything intelligently

/**
 * BOXER - Complete Image Metadata Processing
 * This is the ONLY function you need. It handles everything automatically.
 */
function runBoxer() {
  Logger.log("🥊 BOXER - Complete Image Metadata Processing\n");
  
  const startTime = Date.now();
  const MAX_RUN_TIME = 4 * 60 * 1000; // 4 minutes safe limit
  
  try {
    // Get access token
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log("❌ Authentication failed. Run setupBoxer() first.");
      return;
    }
    
    // Ensure template exists
    const template = getOrCreateImageTemplate(accessToken);
    if (!template) {
      Logger.log("❌ Template creation failed");
      return;
    }
    
    // Check Vision API availability
    let visionAvailable = false;
    try {
      visionAvailable = verifyVisionApiSetup();
      Logger.log(visionAvailable ? "✅ Vision API ready" : "⚠️ Vision API unavailable - using basic processing");
    } catch (error) {
      Logger.log("⚠️ Vision API check failed - using basic processing");
    }
    
    // Find files that need processing
    const filesToProcess = findFilesNeedingProcessing(accessToken);
    Logger.log(`📁 Found ${filesToProcess.length} files needing processing\n`);
    
    if (filesToProcess.length === 0) {
      Logger.log("✅ All files are up to date!");
      return;
    }
    
    // Process files intelligently
    let processed = 0;
    let enhanced = 0;
    let errors = 0;
    
    for (const file of filesToProcess) {
      // Check time limit
      if (Date.now() - startTime > MAX_RUN_TIME) {
        Logger.log("⏰ Time limit reached. Will continue next run.");
        break;
      }
      
      const result = processOneFileCompletely(file, accessToken, visionAvailable);
      
      if (result.success) {
        processed++;
        if (result.enhanced) enhanced++;
        Logger.log(`✅ ${file.name} (${result.stage})`);
      } else {
        errors++;
        Logger.log(`❌ ${file.name}: ${result.error}`);
      }
      
      // Smart delays
      if (result.enhanced) {
        Utilities.sleep(2000); // Longer delay after Vision API
      } else {
        Utilities.sleep(300);   // Short delay for basic processing
      }
    }
    
    // Save completion stats
    saveBoxerStats({
      timestamp: new Date().toISOString(),
      processed: processed,
      enhanced: enhanced,
      errors: errors,
      visionAvailable: visionAvailable
    });
    
    Logger.log(`\n🎉 BOXER Run Complete!`);
    Logger.log(`📊 Processed: ${processed} files`);
    Logger.log(`🤖 Enhanced (AI): ${enhanced} files`);
    Logger.log(`❌ Errors: ${errors} files`);
    
    if (processed > 0) {
      Logger.log(`\n💡 Next run will continue where this left off.`);
    }
    
  } catch (error) {
    Logger.log(`❌ BOXER error: ${error.toString()}`);
  }
}

/**
 * Find files that actually need processing (smart detection)
 */
function findFilesNeedingProcessing(accessToken) {
  const candidates = [];
  
  try {
    // Search for image files, prioritizing recent ones
    const searchQueries = [
      'type:file .jpg modified_at:>2024-01-01',  // Recent JPGs
      'type:file .png modified_at:>2024-01-01',  // Recent PNGs
      'type:file (.jpg OR .png OR .jpeg)'        // All images (fallback)
    ];
    
    const seenFiles = new Set();
    
    for (const query of searchQueries) {
      const searchUrl = `${BOX_API_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=100&fields=id,name,size,created_at,modified_at`;
      
      try {
        const response = UrlFetchApp.fetch(searchUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true,
          timeout: 15000
        });
        
        if (response.getResponseCode() === 200) {
          const data = JSON.parse(response.getContentText());
          
          for (const file of data.entries) {
            // Skip if already seen or not an image
            if (seenFiles.has(file.id) || !BoxFileOperations.isImageFile(file.name)) {
              continue;
            }
            
            seenFiles.add(file.id);
            
            // Quick check: does this file need processing?
            const needsProcessing = checkIfFileNeedsProcessing(file.id, accessToken);
            if (needsProcessing.needs) {
              candidates.push({
                id: file.id,
                name: file.name,
                size: file.size || 0,
                created_at: file.created_at,
                currentStage: needsProcessing.stage,
                priority: calculateFilePriority(file)
              });
            }
          }
          
          // Don't overwhelm - if we have enough candidates, stop searching
          if (candidates.length >= 50) break;
        }
      } catch (error) {
        Logger.log(`Search error for "${query}": ${error.toString()}`);
      }
      
      Utilities.sleep(500); // Rate limiting between searches
    }
    
    // Sort by priority (most important first)
    candidates.sort((a, b) => b.priority - a.priority);
    
    // Return top candidates
    return candidates.slice(0, 20); // Max 20 files per run
    
  } catch (error) {
    Logger.log(`Error finding files: ${error.toString()}`);
    return [];
  }
}

/**
 * Check if a file needs processing and what stage it's at
 */
function checkIfFileNeedsProcessing(fileId, accessToken) {
  try {
    const metadataUrl = `${BOX_API_BASE_URL}/files/${fileId}/metadata/${BOX_METADATA_SCOPE}/${BOX_METADATA_TEMPLATE_KEY}`;
    const response = UrlFetchApp.fetch(metadataUrl, {
      method: 'HEAD', // Just check existence
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 404) {
      // No metadata at all
      return { needs: true, stage: PROCESSING_STAGE_UNPROCESSED };
    } else if (response.getResponseCode() === 200) {
      // Has metadata - check the stage
      const getResponse = UrlFetchApp.fetch(metadataUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
      
      if (getResponse.getResponseCode() === 200) {
        const metadata = JSON.parse(getResponse.getContentText());
        const stage = metadata.processingStage || PROCESSING_STAGE_UNPROCESSED;
        
        // Needs processing if not complete or AI-processed
        const needsProcessing = ![PROCESSING_STAGE_AI, PROCESSING_STAGE_COMPLETE].includes(stage);
        return { needs: needsProcessing, stage: stage };
      }
    }
    
    return { needs: false, stage: 'unknown' };
    
  } catch (error) {
    // If we can't check, assume it needs processing
    return { needs: true, stage: PROCESSING_STAGE_UNPROCESSED };
  }
}

/**
 * Calculate priority score for file processing
 */
function calculateFilePriority(file) {
  let priority = 0;
  
  // Recent files get higher priority
  if (file.created_at || file.modified_at) {
    const fileDate = new Date(file.created_at || file.modified_at);
    const daysOld = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysOld <= 1) priority += 10;      // Last 24 hours
    else if (daysOld <= 7) priority += 5;  // Last week  
    else if (daysOld <= 30) priority += 2; // Last month
  }
  
  // Larger files often more important
  if (file.size) {
    if (file.size > 5 * 1024 * 1024) priority += 3;      // >5MB
    else if (file.size > 1 * 1024 * 1024) priority += 1; // >1MB
  }
  
  // Important content based on filename
  const fileName = file.name.toLowerCase();
  if (fileName.includes('logo') || fileName.includes('brand')) priority += 8;
  if (fileName.includes('portrait') || fileName.includes('headshot')) priority += 6;
  if (fileName.includes('artwork') || fileName.includes('piece')) priority += 6;
  if (fileName.includes('event') || fileName.includes('opening')) priority += 4;
  
  return priority;
}

/**
 * Process one file completely (basic + EXIF + Vision if available)
 */
function processOneFileCompletely(file, accessToken, visionAvailable) {
  const result = {
    success: false,
    enhanced: false,
    stage: PROCESSING_STAGE_UNPROCESSED,
    error: null
  };
  
  try {
    // Get full file details
    const fileDetailsUrl = `${BOX_API_BASE_URL}/files/${file.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
    const detailsResponse = UrlFetchApp.fetch(fileDetailsUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });
    
    if (detailsResponse.getResponseCode() !== 200) {
      result.error = "Could not get file details";
      return result;
    }
    
    const fileDetails = JSON.parse(detailsResponse.getContentText());
    
    // Start with basic metadata
    let metadata = MetadataExtraction.extractComprehensiveMetadata(fileDetails);
    
    // Add EXIF if possible
    try {
      const exifData = extractExifData(file.id, accessToken);
      if (exifData && exifData.hasExif) {
        if (exifData.cameraModel) metadata.cameraModel = exifData.cameraModel;
        if (exifData.dateTaken) metadata.dateTaken = exifData.dateTaken;
        metadata.processingStage = PROCESSING_STAGE_EXIF;
      }
    } catch (error) {
      // EXIF not critical, continue
    }
    
    // Add Vision API if available and file is suitable
    if (visionAvailable && 
        file.size <= MAX_VISION_API_FILE_SIZE_BYTES && 
        file.size > 1024) {
      
      try {
        const visionResult = analyzeImageWithVisionImproved(file.id, accessToken);
        
        if (visionResult && !visionResult.error) {
          // Add AI analysis results
          metadata.aiDetectedObjects = visionResult.objects ? 
            visionResult.objects.map(obj => `${obj.name} (${obj.confidence})`).join('; ') : '';
          
          metadata.aiSceneDescription = visionResult.sceneDescription || '';
          metadata.extractedText = visionResult.text ? 
            visionResult.text.replace(/\n/g, ' ').substring(0, MAX_TEXT_EXTRACTION_LENGTH) : '';
          
          metadata.dominantColors = visionResult.dominantColors ? 
            visionResult.dominantColors.map(c => `${c.rgb} (${c.score})`).join('; ') : '';
          
          metadata.aiConfidenceScore = visionResult.confidenceScore || 0;
          metadata.processingStage = PROCESSING_STAGE_AI;
          
          // Apply AI enhancements
          const aiEnhancements = enhanceContentAnalysisWithAI(metadata, visionResult, file.name, metadata.folderPath);
          Object.assign(metadata, aiEnhancements);
          
          result.enhanced = true;
        }
      } catch (error) {
        // Vision API failed, but we still have basic + EXIF
        metadata.notes = (metadata.notes || '') + `Vision API error: ${error.toString()}`;
      }
    }
    
    // Finalize metadata
    metadata.lastProcessedDate = new Date().toISOString();
    metadata.processingVersion = result.enhanced ? PROCESSING_VERSION_ENHANCED : PROCESSING_VERSION_BASIC;
    
    // Apply to Box
    const success = applyMetadataToFileFixed(file.id, metadata, accessToken);
    
    if (success) {
      result.success = true;
      result.stage = metadata.processingStage;
    } else {
      result.error = "Failed to save metadata to Box";
    }
    
  } catch (error) {
    result.error = error.toString();
  }
  
  return result;
}

/**
 * Save processing statistics
 */
function saveBoxerStats(stats) {
  const STATS_KEY = 'BOXER_STATS';
  let allStats = [];
  
  try {
    const existing = SCRIPT_PROPERTIES.getProperty(STATS_KEY);
    if (existing) {
      allStats = JSON.parse(existing);
    }
  } catch (error) {
    // Start fresh if corrupted
  }
  
  allStats.push(stats);
  
  // Keep only last 20 runs
  if (allStats.length > 20) {
    allStats = allStats.slice(-20);
  }
  
  SCRIPT_PROPERTIES.setProperty(STATS_KEY, JSON.stringify(allStats));
}

/**
 * ONE-TIME SETUP: Complete Boxer setup
 */
function setupBoxer() {
  Logger.log("🥊 BOXER Setup - Complete Image Metadata Processing\n");
  
  try {
    // 1. Test authentication
    Logger.log("1. Testing Box authentication...");
    const testResult = testBoxAccess();
    if (!testResult.success) {
      Logger.log("❌ Authentication failed. Run initializeBoxAuth() first.");
      return;
    }
    Logger.log("✅ Box connected");
    
    // 2. Create template
    Logger.log("\n2. Setting up metadata template...");
    const accessToken = getValidAccessToken();
    const template = getOrCreateImageTemplate(accessToken);
    if (!template) {
      Logger.log("❌ Template creation failed");
      return;
    }
    Logger.log("✅ Template ready: " + template.displayName);
    
    // 3. Test Vision API
    Logger.log("\n3. Testing Vision API...");
    try {
      const visionOk = verifyVisionApiSetup();
      if (visionOk) {
        Logger.log("✅ Vision API ready - will use complete processing");
      } else {
        Logger.log("⚠️ Vision API not available - will use basic processing only");
        Logger.log("   Add VISION_API_KEY to Script Properties for AI features");
      }
    } catch (error) {
      Logger.log("⚠️ Vision API error: " + error.toString());
    }
    
    // 4. Set up trigger
    Logger.log("\n4. Setting up automatic trigger...");
    
    // Remove any existing triggers
    ScriptApp.getProjectTriggers().forEach(trigger => {
      if (trigger.getHandlerFunction().includes('Box') || 
          trigger.getHandlerFunction().includes('runBoxer')) {
        ScriptApp.deleteTrigger(trigger);
        Logger.log("Removed old trigger: " + trigger.getHandlerFunction());
      }
    });
    
    // Create new trigger - every 3 days
    ScriptApp.newTrigger('runBoxer')
      .timeBased()
      .everyDays(3)
      .create();
    
    Logger.log("✅ Created trigger: runBoxer() every 3 days");
    
    // 5. Initial run
    Logger.log("\n5. Running initial processing...");
    runBoxer();
    
    Logger.log("\n🎉 BOXER Setup Complete!");
    Logger.log("\n📋 What happens now:");
    Logger.log("• runBoxer() runs automatically every 3 days");
    Logger.log("• Finds files needing processing intelligently"); 
    Logger.log("• Applies complete metadata (basic + EXIF + AI)");
    Logger.log("• Handles time limits and API quotas automatically");
    Logger.log("• Prioritizes important/recent files first");
    
    Logger.log("\n🔧 Manual controls:");
    Logger.log("• runBoxer() - Run processing manually");
    Logger.log("• showBoxerStats() - View processing history");
    
  } catch (error) {
    Logger.log("❌ Setup error: " + error.toString());
  }
}

/**
 * View processing history and statistics
 */
function showBoxerStats() {
  Logger.log("🥊 BOXER Processing Statistics\n");
  
  const STATS_KEY = 'BOXER_STATS';
  const statsStr = SCRIPT_PROPERTIES.getProperty(STATS_KEY);
  
  if (!statsStr) {
    Logger.log("No processing history available yet.");
    Logger.log("Run setupBoxer() or runBoxer() to start processing.");
    return;
  }
  
  try {
    const allStats = JSON.parse(statsStr);
    
    Logger.log(`📊 Last ${allStats.length} processing runs:\n`);
    
    let totalProcessed = 0;
    let totalEnhanced = 0;
    
    allStats.forEach((run, index) => {
      const date = new Date(run.timestamp);
      const dateStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
      
      Logger.log(`${index + 1}. ${dateStr}`);
      Logger.log(`   Processed: ${run.processed}, Enhanced: ${run.enhanced}, Errors: ${run.errors}`);
      Logger.log(`   Vision API: ${run.visionAvailable ? 'Available' : 'Not available'}`);
      
      totalProcessed += run.processed;
      totalEnhanced += run.enhanced;
    });
    
    Logger.log(`\n📈 Totals:`);
    Logger.log(`• Files processed: ${totalProcessed}`);
    Logger.log(`• AI-enhanced: ${totalEnhanced}`);
    Logger.log(`• Success rate: ${totalProcessed > 0 ? Math.round((totalProcessed / (totalProcessed + allStats.reduce((sum, run) => sum + run.errors, 0))) * 100) : 0}%`);
    
    const lastRun = allStats[allStats.length - 1];
    const daysSinceLastRun = Math.floor((Date.now() - new Date(lastRun.timestamp).getTime()) / (1000 * 60 * 60 * 24));
    Logger.log(`• Last run: ${daysSinceLastRun} days ago`);
    
  } catch (error) {
    Logger.log("Error reading statistics: " + error.toString());
  }
}