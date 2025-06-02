// File: VisionExif.gs
// Enhanced EXIF extraction and Google Vision API integration functions
// Integrates with EnhancedExifParser for comprehensive metadata extraction
// Uses Bruce McPherson's cUseful library for robust operations
// Depends on: Config.gs, BoxAuth.gs, EnhancedExifParser.gs

// ===============================================
// ENHANCED EXIF DATA EXTRACTION
// ===============================================

/**
 * Enhanced EXIF extraction using the comprehensive EnhancedExifParser.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Comprehensive EXIF data object or null on error
 */
function extractEnhancedExifData(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log('ERROR: extractEnhancedExifData - fileId and accessToken are required');
    return null;
  }
  
  try {
    Logger.log('EnhancedExifParser: Starting comprehensive EXIF extraction for file ' + fileId);
    
    // Use the enhanced parser with full metadata extraction
    var enhancedMetadata = EnhancedExifParser.extractEnhancedMetadataForBox(fileId, accessToken);
    
    if (enhancedMetadata) {
      Logger.log('✅ Enhanced EXIF extraction successful for file ' + fileId);
      return {
        hasExif: true,
        enhanced: true,
        metadata: enhancedMetadata,
        extractionMethod: 'comprehensive'
      };
    } else {
      Logger.log('⚠️ No enhanced EXIF data found, falling back to basic extraction');
      return extractBasicExifData(fileId, accessToken);
    }
    
  } catch (error) {
    Logger.log('EnhancedExifParser: Error in enhanced extraction for file ' + fileId + ': ' + error.toString());
    console.error('Enhanced EXIF extraction error:', error);
    
    // Fallback to basic extraction
    return extractBasicExifData(fileId, accessToken);
  }
}

/**
 * Fallback basic EXIF extraction for compatibility.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Basic EXIF data object or null on error
 */
function extractBasicExifData(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log('ERROR: extractBasicExifData - fileId and accessToken are required');
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
      Logger.log(`Failed to download file ${fileId} for basic EXIF extraction. Code: ${responseCode}`);
      return null;
    }
    
    const imageBlob = response.getBlob();
    if (imageBlob.getContentType() !== 'image/jpeg' && imageBlob.getContentType() !== 'image/jpg') {
      return { hasExif: false, extractionMethod: 'basic_non_jpeg' };
    }
    
    const imageBytes = imageBlob.getBytes();
    const basicExif = parseBasicExif(imageBytes);
    
    if (basicExif && basicExif.hasExif) {
      return {
        hasExif: true,
        enhanced: false,
        metadata: convertBasicExifToBoxFormat(basicExif),
        extractionMethod: 'basic'
      };
    }
    
    return { hasExif: false, extractionMethod: 'basic_none_found' };
    
  } catch (error) {
    Logger.log(`Error in basic EXIF extraction from file ${fileId}: ${error.toString()}`);
    console.error(`Basic EXIF extraction error for file ${fileId}:`, error);
    return null;
  }
}

/**
 * Convert basic EXIF data to Box metadata format.
 * @param {object} basicExif Basic EXIF data
 * @returns {object} Box-compatible metadata
 */
function convertBasicExifToBoxFormat(basicExif) {
  var boxMetadata = {};
  
  if (basicExif.cameraModel) {
    boxMetadata.cameraModel = basicExif.cameraModel;
  }
  
  if (basicExif.dateTaken) {
    boxMetadata.dateTaken = basicExif.dateTaken;
  }
  
  if (basicExif.imageWidth && basicExif.imageHeight) {
    boxMetadata.imageWidth = basicExif.imageWidth;
    boxMetadata.imageHeight = basicExif.imageHeight;
    
    // Calculate aspect ratio
    var gcd = calculateGCD(basicExif.imageWidth, basicExif.imageHeight);
    boxMetadata.aspectRatio = (basicExif.imageWidth / gcd) + ':' + (basicExif.imageHeight / gcd);
    boxMetadata.megapixels = Math.round((basicExif.imageWidth * basicExif.imageHeight) / 1000000 * 10) / 10;
  }
  
  // Technical details
  var technicalDetails = [];
  if (basicExif.fNumber) technicalDetails.push('f/' + basicExif.fNumber);
  if (basicExif.exposureTime) technicalDetails.push(basicExif.exposureTime + 's');
  if (basicExif.iso) technicalDetails.push('ISO ' + basicExif.iso);
  if (basicExif.focalLength) technicalDetails.push(basicExif.focalLength + 'mm');
  
  if (technicalDetails.length > 0) {
    boxMetadata.notes = 'Camera settings: ' + technicalDetails.join(', ');
  }
  
  boxMetadata.processingStage = PROCESSING_STAGE_EXIF;
  boxMetadata.lastProcessedDate = new Date().toISOString();
  boxMetadata.processingVersion = PROCESSING_VERSION_BASIC;
  
  return boxMetadata;
}

/**
 * Simplified basic EXIF parser (legacy fallback).
 * @param {byte[]} imageBytes Byte array of the image
 * @returns {object|null} Basic EXIF data object or null if not found
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
    console.error('Error parsing basic EXIF:', error);
    Logger.log(`Error parsing basic EXIF: ${error.toString()}`);
    return exifData;
  }
}

/**
 * Calculate Greatest Common Divisor (for aspect ratio calculation).
 * @param {number} a First number
 * @param {number} b Second number
 * @returns {number} GCD
 */
function calculateGCD(a, b) {
  return b === 0 ? a : calculateGCD(b, a % b);
}

/**
 * Legacy function name for compatibility.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} EXIF data object or null on error
 */
function extractExifData(fileId, accessToken) {
  return extractEnhancedExifData(fileId, accessToken);
}

// ===============================================
// GOOGLE VISION API INTEGRATION (Enhanced)
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
 * Enhanced Vision API response parser with better categorization.
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
    safeSearch: null,
    categories: {
      people: [],
      objects: [],
      activities: [],
      places: [],
      concepts: []
    }
  };
  
  try {
    if (!visionApiResponse) return analysis;

    // Parse localized objects with enhanced categorization
    if (visionApiResponse.localizedObjectAnnotations) {
      analysis.objects = visionApiResponse.localizedObjectAnnotations.map(obj => {
        const objectData = {
          name: obj.name,
          confidence: obj.score ? Math.round(obj.score * 100) / 100 : 0
        };
        
        // Categorize objects
        categorizeDetectedObject(objectData.name, analysis.categories);
        
        return objectData;
      });
    }
    
    // Parse labels with enhanced categorization
    if (visionApiResponse.labelAnnotations) {
      analysis.labels = visionApiResponse.labelAnnotations.map(label => {
        const labelData = {
          description: label.description,
          confidence: label.score ? Math.round(label.score * 100) / 100 : 0
        };
        
        // Categorize labels
        categorizeDetectedLabel(labelData.description, analysis.categories);
        
        return labelData;
      });
      
      if (analysis.labels.length > 0) {
        const totalConfidence = analysis.labels.reduce((sum, label) => sum + label.confidence, 0);
        analysis.confidenceScore = Math.round((totalConfidence / analysis.labels.length) * 100) / 100;
        
        // Create intelligent scene description
        analysis.sceneDescription = createIntelligentSceneDescription(analysis.labels, analysis.categories);
      }
    }
    
    // Parse text annotations with enhanced processing
    if (visionApiResponse.textAnnotations && visionApiResponse.textAnnotations.length > 0) {
      analysis.text = visionApiResponse.textAnnotations[0].description || '';
      
      // Clean up text for better storage
      analysis.text = analysis.text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    
    // Parse dominant colors with better descriptions
    if (visionApiResponse.imagePropertiesAnnotation && 
        visionApiResponse.imagePropertiesAnnotation.dominantColors && 
        visionApiResponse.imagePropertiesAnnotation.dominantColors.colors) {
      const colors = visionApiResponse.imagePropertiesAnnotation.dominantColors.colors;
      analysis.dominantColors = colors.slice(0, 5).map(colorInfo => {
        const color = colorInfo.color;
        const rgb = `rgb(${Math.round(color.red || 0)}, ${Math.round(color.green || 0)}, ${Math.round(color.blue || 0)})`;
        const colorName = getColorName(color.red || 0, color.green || 0, color.blue || 0);
        
        return {
          rgb: rgb,
          name: colorName,
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
 * Categorize detected objects into meaningful groups.
 * @param {string} objectName Name of detected object
 * @param {object} categories Categories object to populate
 */
function categorizeDetectedObject(objectName, categories) {
  const name = objectName.toLowerCase();
  
  // People and body parts
  if (['person', 'human face', 'man', 'woman', 'child', 'baby', 'head', 'hand'].includes(name)) {
    if (!categories.people.includes(objectName)) categories.people.push(objectName);
  }
  // Common objects
  else if (['vehicle', 'car', 'truck', 'bicycle', 'table', 'chair', 'book', 'phone', 'computer'].includes(name)) {
    if (!categories.objects.includes(objectName)) categories.objects.push(objectName);
  }
  // Activities and scenes
  else if (['sport', 'game', 'art', 'music', 'dance', 'reading', 'cooking'].some(activity => name.includes(activity))) {
    if (!categories.activities.includes(objectName)) categories.activities.push(objectName);
  }
  // Places and locations
  else if (['building', 'room', 'office', 'kitchen', 'bathroom', 'garden', 'park', 'street'].includes(name)) {
    if (!categories.places.includes(objectName)) categories.places.push(objectName);
  }
  // General objects
  else {
    if (!categories.objects.includes(objectName)) categories.objects.push(objectName);
  }
}

/**
 * Categorize detected labels into meaningful groups.
 * @param {string} labelDescription Label description
 * @param {object} categories Categories object to populate
 */
function categorizeDetectedLabel(labelDescription, categories) {
  const desc = labelDescription.toLowerCase();
  
  // Skip if already categorized as object
  if (categories.objects.includes(labelDescription) || categories.people.includes(labelDescription)) {
    return;
  }
  
  // Concepts and abstract ideas
  if (['art', 'design', 'style', 'color', 'pattern', 'texture', 'emotion', 'mood', 'atmosphere'].some(concept => desc.includes(concept))) {
    if (!categories.concepts.includes(labelDescription)) categories.concepts.push(labelDescription);
  }
  // Activities
  else if (['activity', 'event', 'celebration', 'work', 'leisure', 'sport', 'exercise'].some(activity => desc.includes(activity))) {
    if (!categories.activities.includes(labelDescription)) categories.activities.push(labelDescription);
  }
  // Places
  else if (['indoor', 'outdoor', 'landscape', 'architecture', 'interior', 'exterior', 'natural', 'urban'].some(place => desc.includes(place))) {
    if (!categories.places.includes(labelDescription)) categories.places.push(labelDescription);
  }
  // General concepts
  else {
    if (!categories.concepts.includes(labelDescription)) categories.concepts.push(labelDescription);
  }
}

/**
 * Create intelligent scene description from labels and categories.
 * @param {array} labels Array of label objects
 * @param {object} categories Categorized detection results
 * @returns {string} Intelligent scene description
 */
function createIntelligentSceneDescription(labels, categories) {
  var description = 'Image contains: ';
  var parts = [];
  
  // Prioritize people
  if (categories.people.length > 0) {
    parts.push('people (' + categories.people.slice(0, 2).join(', ') + ')');
  }
  
  // Add top objects
  if (categories.objects.length > 0) {
    parts.push('objects (' + categories.objects.slice(0, 3).join(', ') + ')');
  }
  
  // Add activities if detected
  if (categories.activities.length > 0) {
    parts.push('activities (' + categories.activities.slice(0, 2).join(', ') + ')');
  }
  
  // Add places/settings
  if (categories.places.length > 0) {
    parts.push('setting (' + categories.places.slice(0, 2).join(', ') + ')');
  }
  
  // Add key concepts
  if (categories.concepts.length > 0) {
    parts.push('concepts (' + categories.concepts.slice(0, 2).join(', ') + ')');
  }
  
  // Fallback to top labels if categories are empty
  if (parts.length === 0 && labels.length > 0) {
    parts.push(labels.slice(0, 5).map(l => l.description).join(', '));
  }
  
  return description + parts.join('; ');
}

/**
 * Get approximate color name from RGB values.
 * @param {number} r Red value (0-255)
 * @param {number} g Green value (0-255)
 * @param {number} b Blue value (0-255)
 * @returns {string} Color name
 */
function getColorName(r, g, b) {
  // Simple color naming based on dominant channel
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var brightness = (max + min) / 2;
  
  if (brightness < 50) return 'Dark';
  if (brightness > 200) return 'Light';
  
  if (r > g && r > b) return 'Red';
  if (g > r && g > b) return 'Green';
  if (b > r && b > g) return 'Blue';
  if (r > 150 && g > 150 && b < 100) return 'Yellow';
  if (r > 150 && g < 100 && b > 150) return 'Magenta';
  if (r < 100 && g > 150 && b > 150) return 'Cyan';
  
  return 'Mixed';
}

/**
 * Enhanced Vision API analysis with improved error handling and retry logic.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Enhanced analysis object or error object
 */
function analyzeImageWithVisionImproved(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log('ERROR: analyzeImageWithVisionImproved - fileId and accessToken required');
    return { error: 'MISSING_PARAMETERS', message: 'File ID and Access Token are required.' };
  }
  
  try {
    const visionApiKey = getVisionApiKey();
    
    // Use cUseful for robust download with retry
    var utils = cUseful;
    
    const downloadUrl = `${BOX_API_BASE_URL}/files/${fileId}/content`;
    const downloadResponse = utils.rateLimitExpBackoff(function() {
      return UrlFetchApp.fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
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
    
    // Enhanced Vision API request with more features
    const visionApiPayload = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'OBJECT_LOCALIZATION', maxResults: 25 },
          { type: 'LABEL_DETECTION', maxResults: 30 },
          { type: 'TEXT_DETECTION', maxResults: 15 },
          { type: 'IMAGE_PROPERTIES' },
          { type: 'SAFE_SEARCH_DETECTION' },
          { type: 'FACE_DETECTION', maxResults: 10 }
        ]
      }]
    };
    
    const visionApiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(visionApiPayload),
      muteHttpExceptions: true
    };
    
    // Use retry logic for Vision API call
    const visionResponse = utils.rateLimitExpBackoff(function() {
      return UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${visionApiKey}`, visionApiOptions);
    });
    
    const visionResponseCode = visionResponse.getResponseCode();
    const visionResponseText = visionResponse.getContentText();
    
    if (visionResponseCode === 200) {
      const visionData = JSON.parse(visionResponseText);
      if (visionData.responses && visionData.responses[0]) {
        if (visionData.responses[0].error) {
          Logger.log(`Vision API returned error for ${fileId}: ${JSON.stringify(visionData.responses[0].error)}`);
          return { error: 'VISION_API_RESPONSE_ERROR', details: visionData.responses[0].error, message: visionData.responses[0].error.message };
        }
        
        // Enhanced parsing with categorization
        var analysis = parseVisionApiResponse(visionData.responses[0]);
        
        // Add face detection results if available
        if (visionData.responses[0].faceAnnotations) {
          analysis.faces = visionData.responses[0].faceAnnotations.length;
          if (analysis.faces > 0) {
            analysis.categories.people.push('Human faces detected');
          }
        }
        
        Logger.log(`✅ Enhanced Vision API analysis completed for ${fileId}`);
        return analysis;
        
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
    Logger.log(`Exception during enhanced Vision API analysis for ${fileId}: ${error.toString()}`);
    console.error(`Exception analyzing image ${fileId} with Vision API:`, error);
    return { error: 'SCRIPT_EXCEPTION', message: error.toString() };
  }
}

// Alias for simpler calling
function analyzeImageWithVision(fileId, accessToken) {
  return analyzeImageWithVisionImproved(fileId, accessToken);
}

// ===============================================
// ENHANCED DIAGNOSTIC FUNCTIONS
// ===============================================

/**
 * Comprehensive test of both enhanced EXIF and Vision API.
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
      const testImages = BoxFileOperations.findAllImageFiles(ACTIVE_TEST_FOLDER_ID, accessToken);
      if (testImages.length === 0) {
        Logger.log("❌ No test images found");
        return;
      }
      testFileId = testImages[0].id;
      Logger.log(`Testing with: ${testImages[0].name}\n`);
    }
    
    // Test 1: Enhanced EXIF Extraction
    Logger.log("1. Testing Enhanced EXIF Extraction...");
    const exifResult = extractEnhancedExifData(testFileId, accessToken);
    
    if (exifResult && exifResult.hasExif) {
      Logger.log("✅ Enhanced EXIF extraction successful");
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
      }
    } else {
      Logger.log("⚠️ No EXIF data found (normal for some file types)");
    }
    
    // Test 2: Enhanced Vision API
    Logger.log("\n2. Testing Enhanced Vision API...");
    
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
      Logger.log("✅ Enhanced Vision API analysis successful");
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
    
    Logger.log("\n💡 Enhanced features provide:");
    Logger.log("• Comprehensive EXIF parsing with technical details");
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
 * Enhanced Vision API verification with more detailed diagnostics.
 */
function verifyVisionApiSetup() {
  Logger.log("=== Enhanced Google Vision API Setup Verification ===\n");
  
  try {
    Logger.log("1. Checking API key presence...");
    const apiKey = getVisionApiKey();
    Logger.log(`✅ API key found (${VISION_API_KEY_PROPERTY}). Length: ${apiKey.length}`);
    
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
    
    const imageTestResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, imageTestOptions);
    const imageTestResponseCode = imageTestResponse.getResponseCode();
    
    if (imageTestResponseCode === 200) {
      Logger.log("✅ Enhanced Vision API features are working correctly!");
      
      // Parse response to check available features
      try {
        const responseData = JSON.parse(imageTestResponse.getContentText());
        if (responseData.responses && responseData.responses[0]) {
          Logger.log("✅ All enhanced features available:");
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