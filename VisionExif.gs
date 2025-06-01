// File: VisionExif.gs
// EXIF extraction and Google Vision API integration functions
// Depends on: Config.gs, BoxAuth.gs

// ===============================================
// EXIF DATA EXTRACTION
// ===============================================

/**
 * Extracts basic EXIF data from image bytes (simplified JPEG parser).
 * @param {byte[]} imageBytes Byte array of the image
 * @returns {object|null} EXIF data object or null if not found
 */
function parseBasicExif(imageBytes) {
  const exifData = {
    hasExif: false,
    cameraModel: null,
    dateTaken: null,
    imageWidth: null,
    imageHeight: null,
    fNumber: null,
    exposureTime: null,
    iso: null,
    focalLength: null,
    flash: null
  };
  
  try {
    // Check for JPEG signature
    if (imageBytes[0] !== 0xFF || imageBytes[1] !== 0xD8) {
      return exifData; // Not a JPEG
    }
    
    let offset = 2; // Start after SOI marker
    const maxSearchOffset = Math.min(imageBytes.length - 4, 65536); // Search in first 64KB

    while (offset < maxSearchOffset) {
      if (imageBytes[offset] === 0xFF) {
        const markerType = imageBytes[offset + 1];
        
        if (markerType === 0xE1) { // APP1 marker (commonly EXIF)
          const exifHeaderOffset = offset + 4;
          // Check for "Exif" header
          if (imageBytes[exifHeaderOffset] === 0x45 && imageBytes[exifHeaderOffset+1] === 0x78 && 
              imageBytes[exifHeaderOffset+2] === 0x69 && imageBytes[exifHeaderOffset+3] === 0x66 && 
              imageBytes[exifHeaderOffset+4] === 0x00 && imageBytes[exifHeaderOffset+5] === 0x00) {
            
            exifData.hasExif = true;

            // Simplified camera model detection
            const searchEnd = Math.min(offset + 2 + (imageBytes[offset+2] << 8 | imageBytes[offset+3]), imageBytes.length);
            const exifSegment = imageBytes.slice(exifHeaderOffset + 6, Math.min(searchEnd, exifHeaderOffset + 6 + 500));
            const exifString = String.fromCharCode.apply(null, exifSegment);
            
            const cameraMatchers = [
              /Canon EOS [^\s,]+/i, /Canon PowerShot [^\s,]+/i, /Canon [^\s,]+/i,
              /NIKON D[^\s,]+/i, /NIKON [^\s,]+/i,
              /SONY ILCE-[^\s,]+/i, /SONY DSC-[^\s,]+/i, /SONY [^\s,]+/i,
              /iPhone [^\s,]+/i, /iPad [^\s,]+/i,
              /SM-[A-Z0-9]+/i, /GT-[A-Z0-9]+/i, /Galaxy [^\s,]+/i,
              /Pixel [^\s,]+/i,
              /OLYMPUS [^\s,]+/i, /E-M[0-9]+/i,
              /FUJIFILM X-[^\s,]+/i, /FUJIFILM GFX[^\s,]+/i,
              /Panasonic DMC-[^\s,]+/i, /Panasonic DC-[^\s,]+/i
            ];

            for (const regex of cameraMatchers) {
              const cameraMatch = exifString.match(regex);
              if (cameraMatch && cameraMatch[0].length < 100) {
                exifData.cameraModel = cameraMatch[0].trim();
                break; 
              }
            }
            return exifData;
          }
        }
        // Move to next segment
        const segmentLength = (imageBytes[offset+2] << 8) | imageBytes[offset+3];
        offset += segmentLength + 2;
      } else {
        offset++;
      }
    }
    
    return exifData;
  } catch (error) {
    console.error('Error parsing EXIF:', error);
    Logger.log(`Error parsing basic EXIF: ${error.toString()}`);
    return exifData;
  }
}

/**
 * Downloads a Box file and extracts EXIF information.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} EXIF data object or null on error
 */
function extractExifData(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log('ERROR: extractExifData - fileId and accessToken are required');
    return null;
  }
  
  try {
    const downloadUrl = `${BOX_API_BASE_URL}/files/${fileId}/content`;
    const response = UrlFetchApp.fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log(`Failed to download file ${fileId} for EXIF extraction. Code: ${responseCode}`);
      return null;
    }
    
    const imageBlob = response.getBlob();
    if (imageBlob.getContentType() !== 'image/jpeg' && imageBlob.getContentType() !== 'image/jpg') {
      return { hasExif: false }; // Only parsing JPEG EXIF
    }
    
    const imageBytes = imageBlob.getBytes();
    return parseBasicExif(imageBytes);
    
  } catch (error) {
    Logger.log(`Error extracting EXIF from file ${fileId}: ${error.toString()}`);
    console.error(`Error extracting EXIF from file ${fileId}:`, error);
    return null;
  }
}

// ===============================================
// GOOGLE VISION API INTEGRATION
// ===============================================

/**
 * Retrieves the Vision API key from Script Properties.
 * @returns {string} Vision API key
 * @throws {Error} If API key not found
 */
function getVisionApiKey() {
  const apiKey = SCRIPT_PROPERTIES.getProperty(VISION_API_KEY_PROPERTY);
  if (!apiKey) {
    const errMsg = `${VISION_API_KEY_PROPERTY} not found in Script Properties. Please add it.`;
    Logger.log(`ERROR: ${errMsg}`);
    throw new Error(errMsg);
  }
  return apiKey;
}

/**
 * Parses Vision API response into structured data.
 * @param {object} visionApiResponse Response from Vision API
 * @returns {object} Structured analysis object
 */
function parseVisionApiResponse(visionApiResponse) {
  const analysis = {
    objects: [],
    labels: [],
    text: '',
    dominantColors: [],
    sceneDescription: '',
    confidenceScore: 0,
    safeSearch: null
  };
  
  try {
    if (!visionApiResponse) return analysis;

    // Parse localized objects
    if (visionApiResponse.localizedObjectAnnotations) {
      analysis.objects = visionApiResponse.localizedObjectAnnotations.map(obj => ({
        name: obj.name,
        confidence: obj.score ? Math.round(obj.score * 100) / 100 : 0
      }));
    }
    
    // Parse labels
    if (visionApiResponse.labelAnnotations) {
      analysis.labels = visionApiResponse.labelAnnotations.map(label => ({
        description: label.description,
        confidence: label.score ? Math.round(label.score * 100) / 100 : 0
      }));
      
      if (analysis.labels.length > 0) {
        const totalConfidence = analysis.labels.reduce((sum, label) => sum + label.confidence, 0);
        analysis.confidenceScore = Math.round((totalConfidence / analysis.labels.length) * 100) / 100;
        
        const topLabels = analysis.labels.slice(0, 5).map(l => l.description);
        analysis.sceneDescription = `Image may contain: ${topLabels.join(', ')}`;
      }
    }
    
    // Parse text annotations
    if (visionApiResponse.textAnnotations && visionApiResponse.textAnnotations.length > 0) {
      analysis.text = visionApiResponse.textAnnotations[0].description || '';
    }
    
    // Parse dominant colors
    if (visionApiResponse.imagePropertiesAnnotation && 
        visionApiResponse.imagePropertiesAnnotation.dominantColors && 
        visionApiResponse.imagePropertiesAnnotation.dominantColors.colors) {
      const colors = visionApiResponse.imagePropertiesAnnotation.dominantColors.colors;
      analysis.dominantColors = colors.slice(0, 5).map(colorInfo => {
        const color = colorInfo.color;
        const rgb = `rgb(${Math.round(color.red || 0)}, ${Math.round(color.green || 0)}, ${Math.round(color.blue || 0)})`;
        return {
          rgb: rgb,
          score: colorInfo.score ? Math.round(colorInfo.score * 100) / 100 : 0,
          pixelFraction: colorInfo.pixelFraction ? Math.round(colorInfo.pixelFraction * 1000) / 1000 : 0
        };
      });
    }
    
    // Parse safe search
    if (visionApiResponse.safeSearchAnnotation) {
      analysis.safeSearch = visionApiResponse.safeSearchAnnotation;
    }
    
  } catch (error) {
    Logger.log(`Error parsing Vision API response: ${error.toString()}`);
    console.error('Error parsing Vision API response:', error);
  }
  
  return analysis;
}

/**
 * Analyzes an image with Google Vision API (improved version with error handling).
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Parsed analysis object or error object
 */
function analyzeImageWithVisionImproved(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log('ERROR: analyzeImageWithVisionImproved - fileId and accessToken required');
    return { error: 'MISSING_PARAMETERS', message: 'File ID and Access Token are required.' };
  }
  
  try {
    const visionApiKey = getVisionApiKey();
    
    const downloadUrl = `${BOX_API_BASE_URL}/files/${fileId}/content`;
    const downloadResponse = UrlFetchApp.fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });

    const downloadResponseCode = downloadResponse.getResponseCode();
    if (downloadResponseCode !== 200) {
      Logger.log(`Failed to download file ${fileId} for Vision API. Code: ${downloadResponseCode}`);
      return { error: 'BOX_DOWNLOAD_FAILED', code: downloadResponseCode, message: `Failed to download file from Box (ID: ${fileId}).`};
    }

    const imageBlob = downloadResponse.getBlob();
    const imageBytes = imageBlob.getBytes();
    const imageSize = imageBytes.length;
    
    if (imageSize > MAX_VISION_API_FILE_SIZE_BYTES) {
      const sizeMB = Math.round(imageSize / (1024 * 1024) * 10) / 10;
      Logger.log(`Image ${fileId} too large for Vision API (${sizeMB}MB)`);
      return { error: 'FILE_TOO_LARGE', sizeMB: sizeMB, message: `File size ${sizeMB}MB exceeds Vision API limit.` };
    }
    
    if (imageSize === 0) {
      Logger.log(`Image ${fileId} is empty (0 bytes)`);
      return { error: 'FILE_EMPTY', message: 'Image file is empty.'};
    }

    const base64Image = Utilities.base64Encode(imageBytes);
    
    const visionApiPayload = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
          { type: 'LABEL_DETECTION', maxResults: 20 },
          { type: 'TEXT_DETECTION', maxResults: 10 },
          { type: 'IMAGE_PROPERTIES' },
          { type: 'SAFE_SEARCH_DETECTION' }
        ]
      }]
    };
    
    const visionApiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(visionApiPayload),
      muteHttpExceptions: true
    };
    
    const visionResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${visionApiKey}`, visionApiOptions);
    const visionResponseCode = visionResponse.getResponseCode();
    const visionResponseText = visionResponse.getContentText();
    
    if (visionResponseCode === 200) {
      const visionData = JSON.parse(visionResponseText);
      if (visionData.responses && visionData.responses[0]) {
        if (visionData.responses[0].error) {
          Logger.log(`Vision API returned error for ${fileId}: ${JSON.stringify(visionData.responses[0].error)}`);
          return { error: 'VISION_API_RESPONSE_ERROR', details: visionData.responses[0].error, message: visionData.responses[0].error.message };
        }
        return parseVisionApiResponse(visionData.responses[0]);
      } else {
        Logger.log(`Vision API returned 200 but empty response for ${fileId}`);
        return { error: 'VISION_API_EMPTY_RESPONSE', message: 'Vision API returned 200 but response was empty or malformed.' };
      }
    } else {
      Logger.log(`Vision API HTTP Error ${visionResponseCode} for ${fileId}: ${visionResponseText.substring(0,500)}`);
      let errorDetails = visionResponseText;
      try {
        errorDetails = JSON.parse(visionResponseText).error || errorDetails;
      } catch (e) { /* Use raw text */ }
      return { error: 'VISION_API_HTTP_ERROR', code: visionResponseCode, message: `Vision API request failed with HTTP ${visionResponseCode}.`, details: errorDetails };
    }
    
  } catch (error) {
    Logger.log(`Exception during Vision API analysis for ${fileId}: ${error.toString()}`);
    console.error(`Exception analyzing image ${fileId} with Vision API:`, error);
    return { error: 'SCRIPT_EXCEPTION', message: error.toString() };
  }
}

// Alias for simpler calling
function analyzeImageWithVision(fileId, accessToken) {
  return analyzeImageWithVisionImproved(fileId, accessToken);
}

// ===============================================
// VISION API DIAGNOSTIC FUNCTIONS
// ===============================================

/**
 * Verifies Vision API setup with test calls.
 * @returns {boolean} True if setup correct, false otherwise
 */
function verifyVisionApiSetup() {
  Logger.log("=== Google Vision API Setup Verification ===\n");
  
  try {
    Logger.log("1. Checking API key presence...");
    const apiKey = getVisionApiKey();
    Logger.log(`✅ API key found (${VISION_API_KEY_PROPERTY}). Length: ${apiKey.length}`);
    
    if (!apiKey.startsWith('AIza') || apiKey.length !== 39) {
      Logger.log(`⚠️ API key format might be incorrect. Expected 39 chars starting with 'AIza'`);
    }
    
    Logger.log("\n2. Testing API key validity...");
    const testPayload = {
      requests: [{ image: { content: '' }, features: [{ type: 'LABEL_DETECTION', maxResults: 1 }] }]
    };
    const testOptions = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(testPayload),
      muteHttpExceptions: true
    };
    const testResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, testOptions);
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
      requests: [{ image: { content: tinyImageBase64 }, features: [{ type: 'LABEL_DETECTION', maxResults: 1 }] }]
    };
    const imageTestOptions = { ...testOptions, payload: JSON.stringify(imageTestPayload) };
    
    const imageTestResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, imageTestOptions);
    const imageTestResponseCode = imageTestResponse.getResponseCode();
    
    if (imageTestResponseCode === 200) {
      Logger.log("✅ Vision API is working correctly!");
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

/**
 * Provides troubleshooting guidance for Vision API errors.
 */
function troubleshootVisionApiError() {
  Logger.log("=== Vision API Troubleshooting Guide ===\n");
  Logger.log("Common causes for Vision API errors:\n");
  Logger.log("1. **Cloud Vision API Not Enabled**:");
  Logger.log("   - Go to Google Cloud Console: https://console.cloud.google.com/");
  Logger.log("   - Navigate to 'APIs & Services' > 'Library'");
  Logger.log("   - Search for 'Cloud Vision API' and ensure it's 'Enabled'\n");
  Logger.log("2. **Billing Not Enabled**:");
  Logger.log("   - Vision API requires a billing account, even for free tier");
  Logger.log("   - In Cloud Console, go to 'Billing' and link to active billing account\n");
  Logger.log("3. **API Key Issues**:");
  Logger.log(`   - Ensure key in '${VISION_API_KEY_PROPERTY}' is correct (no extra spaces)`);
  Logger.log("   - Check API Key Restrictions in Cloud Console > 'APIs & Services' > 'Credentials'");
  Logger.log("   - Ensure 'Cloud Vision API' is allowed in API restrictions\n");
  Logger.log("4. **Organization Policies**:");
  Logger.log("   - Google Workspace policies might restrict API usage");
  Logger.log("   - Check with Workspace administrator\n");
  Logger.log("🔧 Quick fixes to try:");
  Logger.log("   A. Run verifyVisionApiSetup() for automated check");
  Logger.log(`   B. Double-check '${VISION_API_KEY_PROPERTY}' in Script Properties`);
  Logger.log("   C. Create new, unrestricted API key in correct Google Cloud Project");
}

/**
 * Tests Vision API integration with a sample Box image.
 */
function testVisionApiIntegration() {
  Logger.log("=== Testing Vision API Integration with Box Image ===\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ Box access token not available");
    return;
  }

  try {
    Logger.log("1. Verifying Vision API setup...");
    if (!verifyVisionApiSetup()) {
      Logger.log("❌ Vision API setup failed. Aborting integration test.");
      return;
    }
    Logger.log("✅ Vision API setup verified\n");
    
    Logger.log(`2. Finding test image from folder: ${ACTIVE_TEST_FOLDER_ID}...`);
    const folderUrl = `${BOX_API_BASE_URL}/folders/${ACTIVE_TEST_FOLDER_ID}/items?limit=10&fields=id,name,type,size`;
    const folderOptions = { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true };
    const folderResponse = UrlFetchApp.fetch(folderUrl, folderOptions);

    if (folderResponse.getResponseCode() !== 200) {
      Logger.log(`❌ Could not list items in test folder ${ACTIVE_TEST_FOLDER_ID}`);
      return;
    }
    
    const folderData = JSON.parse(folderResponse.getContentText());
    const testImage = folderData.entries.find(item => 
      item.type === 'file' && 
      BoxFileOperations.isImageFile(item.name) && 
      item.size > 0 && 
      item.size < MAX_VISION_API_FILE_SIZE_BYTES
    );

    if (!testImage) {
      Logger.log(`❌ No suitable test image found in folder ${ACTIVE_TEST_FOLDER_ID}`);
      return;
    }
    Logger.log(`📸 Found test image: ${testImage.name} (${testImage.size} bytes)\n`);
    
    Logger.log("3. Analyzing with Vision API...");
    const visionResult = analyzeImageWithVisionImproved(testImage.id, accessToken);
    
    if (visionResult && !visionResult.error) {
      Logger.log("✅ Vision API analysis successful!");
      Logger.log(`   Labels: ${visionResult.labels ? visionResult.labels.length : 0}`);
      Logger.log(`   Objects: ${visionResult.objects ? visionResult.objects.length : 0}`);
      Logger.log(`   Text length: ${visionResult.text ? visionResult.text.length : 0}`);
      Logger.log(`   Colors: ${visionResult.dominantColors ? visionResult.dominantColors.length : 0}`);
      Logger.log(`   Confidence: ${visionResult.confidenceScore || 'N/A'}`);
      
      if (visionResult.labels && visionResult.labels.length > 0) {
        Logger.log(`   Top labels: ${visionResult.labels.slice(0,3).map(l=>l.description).join(', ')}`);
      }
    } else {
      Logger.log("❌ Vision API analysis failed");
      Logger.log(`   Error: ${visionResult ? visionResult.error : 'Unknown'}`);
      Logger.log(`   Message: ${visionResult ? (visionResult.message || JSON.stringify(visionResult.details)) : 'No details'}`);
      return;
    }

    Logger.log("\n4. Testing EXIF extraction...");
    const exifResult = extractExifData(testImage.id, accessToken);
    if (exifResult) {
      Logger.log("✅ EXIF extraction completed");
      Logger.log(`   Has EXIF: ${exifResult.hasExif}`);
      if (exifResult.hasExif) {
        Logger.log(`   Camera: ${exifResult.cameraModel || 'Not detected'}`);
      }
    } else {
      Logger.log("⚠️ EXIF extraction returned null");
    }
    
    Logger.log("\n🎉 Vision API and EXIF integration test complete!");
    
  } catch (error) {
    Logger.log(`❌ Exception during integration test: ${error.toString()}`);
    console.error("Integration test failed:", error);
  }
}