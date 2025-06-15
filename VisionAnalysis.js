// File: VisionAnalysis.gs
// Google Vision API integration functions
// Uses cUseful library by Bruce McPherson for robust operations
// Depends on: ConfigManager.gs, BoxAuth.gs

/**
 * Retrieves the Vision API key from Script Properties.
 * @returns {string} Vision API key
 * @throws {Error} If API key not found
 */
function getVisionApiKey() {
  const apiKey = ConfigManager.getProperty('GOOGLE_VISION_API_KEY');
  if (!apiKey) {
    const errMsg = 'GOOGLE_VISION_API_KEY not found. Please configure it.';
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
      
      Logger.log(`  📝 Extracted text (${analysis.text.length} chars): "${analysis.text.substring(0, 100)}${analysis.text.length > 100 ? '...' : ''}"`);
    } else {
      Logger.log('  📝 No text detected in image');
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
  let description = 'Image contains: ';
  const parts = [];
  
  // Prioritize people
  if (categories.people.length > 0) {
    parts.push(`people (${categories.people.slice(0, 2).join(', ')})`);
  }
  
  // Add top objects
  if (categories.objects.length > 0) {
    parts.push(`objects (${categories.objects.slice(0, 3).join(', ')})`);
  }
  
  // Add activities if detected
  if (categories.activities.length > 0) {
    parts.push(`activities (${categories.activities.slice(0, 2).join(', ')})`);
  }
  
  // Add places/settings
  if (categories.places.length > 0) {
    parts.push(`setting (${categories.places.slice(0, 2).join(', ')})`);
  }
  
  // Add key concepts
  if (categories.concepts.length > 0) {
    parts.push(`concepts (${categories.concepts.slice(0, 2).join(', ')})`);
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
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (max + min) / 2;
  
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
 * Main Vision API analysis function with error handling and retry logic.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @param {string} filename Optional filename for logging
 * @returns {object|null} Enhanced analysis object or error object
 */
function analyzeImageWithVision(fileId, accessToken, filename) {
  const fileDisplayName = filename || fileId; // Use filename if provided, else fileId

  if (!accessToken || !fileId) {
    Logger.log('ERROR: analyzeImageWithVision - fileId and accessToken required');
    return { error: 'MISSING_PARAMETERS', message: 'File ID and Access Token are required.' };
  }

  try {
    const visionApiKey = getVisionApiKey();
    const utils = cUseful; // Assuming cUseful is globally available
    const downloadUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/content`;
    const downloadResponse = utils.rateLimitExpBackoff(function() {
      return UrlFetchApp.fetch(downloadUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
    });

    const downloadResponseCode = downloadResponse.getResponseCode();
    if (downloadResponseCode !== 200) {
      Logger.log(`  Failed to download ${fileDisplayName} for Vision API. Code: ${downloadResponseCode}`);
      return { error: 'BOX_DOWNLOAD_FAILED', code: downloadResponseCode, message: `Failed to download file from Box (ID: ${fileId}, Name: ${fileDisplayName}).`};
    }

    const imageBlob = downloadResponse.getBlob();
    const imageBytes = imageBlob.getBytes();
    
    // Check if file is empty before processing
    if (imageBytes.length === 0) {
      Logger.log(`  Image ${fileDisplayName} is empty (0 bytes)`);
      return { error: 'FILE_EMPTY', message: `Image file ${fileDisplayName} is empty.`};
    }

    // Check if this is a HEIC/HEIF file that needs conversion
    const fileExtension = filename ? filename.split('.').pop().toUpperCase() : '';
    const needsConversion = ['HEIC', 'HEIF'].includes(fileExtension);
    
    let base64Image;
    let imageSize;
    
    if (needsConversion) {
      Logger.log(`  🔄 HEIC/HEIF detected - requesting JPEG representation from Box...`);
      
      try {
        // Request JPEG representation from Box
        const representationUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}?fields=representations`;
        const repResponse = utils.rateLimitExpBackoff(function() {
          return UrlFetchApp.fetch(representationUrl, {
            headers: { 
              'Authorization': `Bearer ${accessToken}`,
              'X-Rep-Hints': '[jpg?dimensions=2048x2048]' // Request JPEG up to 2048x2048
            },
            muteHttpExceptions: true
          });
        });
        
        if (repResponse.getResponseCode() !== 200) {
          Logger.log(`  ❌ Failed to get representation info: ${repResponse.getResponseCode()}`);
          Logger.log(`  Response: ${repResponse.getContentText().substring(0, 500)}`);
          return { error: 'REPRESENTATION_FAILED', message: `Could not get JPEG representation for HEIC file ${fileDisplayName}` };
        }
        
        const repData = JSON.parse(repResponse.getContentText());
        const representations = repData.representations ? repData.representations.entries : [];
        const jpegRep = representations.find(r => r.representation === 'jpg');
        
        if (!jpegRep) {
          Logger.log(`  ❌ No JPEG representation available for this file`);
          Logger.log(`  Available representations: ${representations.map(r => r.representation).join(', ')}`);
          return { error: 'NO_JPEG_REPRESENTATION', message: `Box cannot create JPEG representation for ${fileDisplayName}` };
        }
        
        if (!jpegRep || jpegRep.status.state !== 'success') {
          Logger.log(`  ⏳ JPEG representation not ready, waiting...`);
          Utilities.sleep(2000); // Wait for representation to generate
          
          // Try to fetch the actual representation
          const jpegUrl = jpegRep ? jpegRep.content.url_template.replace('{+asset_path}', '') : null;
          if (!jpegUrl) {
            return { error: 'NO_JPEG_URL', message: `No JPEG URL available for ${fileDisplayName}` };
          }
          
          const jpegResponse = utils.rateLimitExpBackoff(function() {
            return UrlFetchApp.fetch(jpegUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
              muteHttpExceptions: true
            });
          });
          
          if (jpegResponse.getResponseCode() !== 200) {
            Logger.log(`  ❌ Failed to download JPEG representation: ${jpegResponse.getResponseCode()}`);
            return { error: 'JPEG_DOWNLOAD_FAILED', message: `Could not download JPEG representation for ${fileDisplayName}` };
          }
          
          const jpegBytes = jpegResponse.getBlob().getBytes();
          imageSize = jpegBytes.length;
          base64Image = Utilities.base64Encode(jpegBytes);
          Logger.log(`  ✅ Successfully converted HEIC to JPEG (${Math.round(imageSize / 1024)} KB)`);
          
        } else if (jpegRep.status.state === 'success') {
          // Representation is ready, fetch it
          const jpegUrl = jpegRep.content.url_template.replace('{+asset_path}', '');
          const jpegResponse = utils.rateLimitExpBackoff(function() {
            return UrlFetchApp.fetch(jpegUrl, {
              headers: { 'Authorization': `Bearer ${accessToken}` },
              muteHttpExceptions: true
            });
          });
          
          if (jpegResponse.getResponseCode() !== 200) {
            Logger.log(`  ❌ Failed to download ready JPEG: ${jpegResponse.getResponseCode()}`);
            return { error: 'JPEG_DOWNLOAD_FAILED', message: `Could not download JPEG representation for ${fileDisplayName}` };
          }
          
          const jpegBytes = jpegResponse.getBlob().getBytes();
          imageSize = jpegBytes.length;
          base64Image = Utilities.base64Encode(jpegBytes);
          Logger.log(`  ✅ Used existing JPEG representation (${Math.round(imageSize / 1024)} KB)`);
        }
        
      } catch (conversionError) {
        Logger.log(`  ❌ HEIC conversion error: ${conversionError.toString()}`);
        return { error: 'CONVERSION_ERROR', message: `Failed to convert HEIC file ${fileDisplayName}: ${conversionError.toString()}` };
      }
      
    } else {
      // Original flow for non-HEIC files
      imageSize = imageBytes.length;
      base64Image = Utilities.base64Encode(imageBytes);
    }

    if (imageSize > ConfigManager.MAX_VISION_API_FILE_SIZE_BYTES) {
      const sizeMB = Math.round(imageSize / (1024 * 1024) * 10) / 10;
      Logger.log(`  Image ${fileDisplayName} too large for Vision API ${sizeMB}MB)`);
      return { error: 'FILE_TOO_LARGE', sizeMB: sizeMB, message: `File ${fileDisplayName} size ${sizeMB}MB exceeds Vision API limit.` };
    }

    if (imageSize === 0) {
      Logger.log(`  Image ${fileDisplayName} is empty (0 bytes)`);
      return { error: 'FILE_EMPTY', message: `Image file ${fileDisplayName} is empty.`};
    }

    const visionApiPayload = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'OBJECT_LOCALIZATION', maxResults: 25 },
          { type: 'LABEL_DETECTION', maxResults: 30 },
          { type: 'TEXT_DETECTION', maxResults: 50 },
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


    const visionResponse = utils.rateLimitExpBackoff(function() {
      return UrlFetchApp.fetch(`${ConfigManager.VISION_API_ENDPOINT}?key=${visionApiKey}`, visionApiOptions);
    });


    const visionResponseCode = visionResponse.getResponseCode();
    const visionResponseText = visionResponse.getContentText();

    if (visionResponseCode === 200) {
      const visionData = JSON.parse(visionResponseText);
      if (visionData.responses && visionData.responses[0]) {
        if (visionData.responses[0].error) {
          Logger.log(`  Vision API returned error for ${fileDisplayName}: ${JSON.stringify(visionData.responses[0].error)}`);
          return { error: 'VISION_API_RESPONSE_ERROR', details: visionData.responses[0].error, message: visionData.responses[0].error.message };
        }

        let analysis = parseVisionApiResponse(visionData.responses[0]);
        
        // Debug logging for text detection
        const responseKeys = Object.keys(visionData.responses[0]);
        Logger.log(`  🔍 Vision API response contains: ${responseKeys.join(', ')}`);
        
        if (visionData.responses[0].textAnnotations) {
          Logger.log(`  📝 Text detection found ${visionData.responses[0].textAnnotations.length} text regions`);
        } else if (visionData.responses[0].fullTextAnnotation) {
          Logger.log(`  📝 Full text annotation found`);
        } else {
          Logger.log(`  📝 No text annotations in response`);
        }

        if (visionData.responses[0].faceAnnotations) {
          analysis.faces = visionData.responses[0].faceAnnotations.length;
          if (analysis.faces > 0 && analysis.categories && analysis.categories.people) { // Check categories.people exists
            analysis.categories.people.push('Human faces detected');
          } else if (analysis.faces > 0 && analysis.categories) { // If categories.people doesn't exist, initialize it
            analysis.categories.people = ['Human faces detected'];
          } else if (analysis.faces > 0 && !analysis.categories) { // If categories itself doesn't exist
             analysis.categories = { people: ['Human faces detected']};
          }
        }

        Logger.log(` > Vision API analysis completed for ${fileDisplayName}.`);
        return analysis;

      } else {
        Logger.log(`  Vision API returned 200 but empty/malformed response for ${fileDisplayName}.`);
        return { error: 'VISION_API_EMPTY_RESPONSE', message: `Vision API returned 200 for ${fileDisplayName} but response was empty or malformed.` };
      }
    } else {
      Logger.log(`  Vision API HTTP Error ${visionResponseCode} for ${fileDisplayName}: ${visionResponseText.substring(0,500)}`);
      let errorDetails = visionResponseText;
      try {
        errorDetails = JSON.parse(visionResponseText).error || errorDetails;
      } catch (e) { /* Use raw text */ }
      return { error: 'VISION_API_HTTP_ERROR', code: visionResponseCode, message: `Vision API request for ${fileDisplayName} failed with HTTP ${visionResponseCode}.`, details: errorDetails };
    }

  } catch (error) {
    ErrorHandler.reportError(error, 'analyzeImageWithVision', 
      { fileId, filename: fileDisplayName });
    return { error: 'SCRIPT_EXCEPTION', message: error.toString() };
  }
}