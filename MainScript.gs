// File: MainScript.gs
// Depends on: Config.gs (for almost all constants)
// Depends on: BoxOAuth.gs (for getValidAccessToken)
// Depends on: BoxMetadataTemplates.gs (for getOrCreateImageTemplate)
// Depends on: BoxFileOperations.gs (for findAllImageFiles, getCurrentMetadata, isImageFile, etc.)
// Depends on: MetadataExtraction.gs (for extractComprehensiveMetadata, analyzeImageContent, calculateAspectRatio)
// Note: EXIF and Vision API specific functions are included here.

// ===============================================
// BOX IMAGE METADATA PROCESSOR - PRODUCTION VERSION
// ===============================================

// (PropertiesService is accessed via SCRIPT_PROPERTIES in Config.gs)

// Example of how a developer might test OAuth token exchange with a new code
// This 'go' function was in your original script. It's best managed in BoxOAuth.gs or removed for production.
/*
function go() {
  // This function should ideally call the one in BoxOAuth.gs or be for temporary dev use.
  // Example: BoxOAuth.go_exchangeAuthCode('YOUR_NEW_CODE_HERE'); // Assuming go_ in BoxOAuth.gs
  const acode = "qAzdSi1oyFb4dppoE6u0cVl0vo6na1WS"; // DANGER: Example auth code, expires quickly.
  Logger.log(`WARNING: Running 'go()' function in MainScript.gs with a hardcoded auth code. This is for development/testing only.`);
  exchangeCodeForTokens(acode); // Assumes exchangeCodeForTokens is accessible, better to centralize OAuth calls
}
*/


// ===============================================
// IMAGE PROCESSING AND METADATA EXTRACTION (BASIC)
// ===============================================

/**
 * Main function to trigger basic processing of images in predefined folders.
 * This is an orchestrator function.
 */
function processBoxImages() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: processBoxImages - Failed to get valid access token. Aborting.");
    return;
  }
  
  Logger.log("🔄 Starting comprehensive basic image processing...");
  
  try {
    // Use ACTIVE_TEST_FOLDER_ID or a configurable list of folders
    const foldersToProcess = [ACTIVE_TEST_FOLDER_ID]; // From Config.gs
    
    // Delegate to the specific basic processing loop
    processImagesInFoldersBasic(foldersToProcess, accessToken); // This function is in MetadataExtraction.gs
    
    Logger.log("✅ Basic image processing triggered for specified folders!");
    
  } catch (error) {
    Logger.log(`Error in main basic processing (processBoxImages): ${error.toString()}`);
    console.error('Error in main basic processing:', error);
  }
}

// processFolderImages (basic version) is effectively handled by processImagesInFoldersBasic
// processImageFile (basic version) is effectively handled by processSingleImageBasic

// ===============================================
// METADATA APPLICATION (CREATE/UPDATE LOGIC)
// These are the "Fixed" versions previously mentioned.
// ===============================================

/**
 * Applies metadata to a file. If metadata already exists, it attempts to update it.
 * This is the primary function for setting metadata after extraction.
 * @param {string} fileId The ID of the Box file.
 * @param {object} metadata The metadata object to apply.
 * @param {string} accessToken A valid Box access token.
 * @param {string} [templateKey=BOX_METADATA_TEMPLATE_KEY] The key of the metadata template.
 * @returns {boolean} True if metadata was successfully applied or updated, false otherwise.
 */
function applyMetadataToFileFixed(fileId, metadata, accessToken, templateKey = BOX_METADATA_TEMPLATE_KEY) {
  if (!accessToken || !fileId || !metadata) {
    Logger.log(`ERROR: ${arguments.callee.name} - accessToken, fileId, and metadata are required.`);
    return false;
  }
  try {
    const url = `${BOX_API_BASE_URL}/files/${fileId}/metadata/${BOX_METADATA_SCOPE}/${templateKey}`;
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(metadata),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 201) { // Created
      // Logger.log(`Successfully applied new metadata to ${fileId} using template ${templateKey}.`);
      return true;
    } else if (responseCode === 409) { // Conflict - metadata instance already exists
      // Logger.log(`Metadata instance already exists for ${fileId}, template ${templateKey}. Attempting update...`);
      return updateMetadataOnFileFixed(fileId, metadata, accessToken, templateKey);
    } else {
      const errorText = response.getContentText();
      Logger.log(`Error applying metadata to ${fileId} (template ${templateKey}). Code: ${responseCode}, Response: ${errorText.substring(0,300)}`);
      console.error(`Error applying metadata (${responseCode}):`, errorText);
       if (responseCode === 404 && errorText.includes("instance_not_found")) {
         Logger.log(`Template '${templateKey}' might not be attached to file ${fileId} or template itself not found. Consider running attachTemplateToAllImages or verifying template existence.`);
       }
      return false;
    }
  } catch (error) {
    Logger.log(`Exception applying metadata to ${fileId} (template ${templateKey}): ${error.toString()}`);
    console.error(`Exception applying metadata to ${fileId}:`, error);
    return false;
  }
}

/**
 * Updates an existing metadata instance on a file using JSON Patch operations.
 * @param {string} fileId The ID of the Box file.
 * @param {object} metadataToUpdate The metadata object containing new/updated values.
 * @param {string} accessToken A valid Box access token.
 * @param {string} [templateKey=BOX_METADATA_TEMPLATE_KEY] The key of the metadata template.
 * @returns {boolean} True if metadata was successfully updated, false otherwise.
 */
function updateMetadataOnFileFixed(fileId, metadataToUpdate, accessToken, templateKey = BOX_METADATA_TEMPLATE_KEY) {
  if (!accessToken || !fileId || !metadataToUpdate) {
    Logger.log(`ERROR: ${arguments.callee.name} - accessToken, fileId, and metadataToUpdate are required.`);
    return false;
  }
  try {
    // It's generally safer to fetch current metadata to build precise patch operations,
    // but for simplicity if all fields in metadataToUpdate should replace existing ones,
    // Box API for enterprise metadata PUT with 'application/json-patch+json' expects patch operations.
    // If simply replacing all values sent, a simpler approach for Box is often to GET, merge, then POST (if no 'add'/'remove' op needed).
    // However, to truly "update" and handle adding new fields not previously on the instance, json-patch is better.

    const currentMetadata = getCurrentMetadata(fileId, accessToken, templateKey); // From BoxFileOperations.gs
    const updates = [];

    if (!currentMetadata) {
      // This case should ideally be handled by applyMetadataToFileFixed trying POST first.
      // If we reach here, it implies an issue or that the instance was deleted between checks.
      // Fallback to attempting a full create might be an option, or log error.
      Logger.log(`Cannot update metadata for ${fileId}: current metadata instance not found for template ${templateKey}. Attempting to create instead.`);
      // This is essentially a create operation now. The Box API for PUT on metadata requires it to exist.
      // A true 'upsert' is POST, then PUT on 409. Our applyMetadataToFileFixed handles this.
      // For this specific update function, if it doesn't exist, it's an error for "update".
      // However, the prompt's original `updateMetadataOnFileFixed` had a fallback to recreate if PUT failed with 400.
      // Let's stick to JSON Patch for updating existing.
       Logger.log(`Current metadata for ${fileId} is null. Cannot form JSON Patch. Consider using applyMetadataToFileFixed.`);
       return false; // Or attempt a POST if that's desired behavior for "update" when not found
    }

    for (const key in metadataToUpdate) {
      if (metadataToUpdate.hasOwnProperty(key)) {
        if (currentMetadata.hasOwnProperty(key)) {
          // Field exists, use 'replace' if value is different
          if (JSON.stringify(currentMetadata[key]) !== JSON.stringify(metadataToUpdate[key])) { // Deep compare for objects/arrays
            updates.push({ op: 'replace', path: `/${key}`, value: metadataToUpdate[key] });
          }
        } else {
          // Field doesn't exist, use 'add'
          updates.push({ op: 'add', path: `/${key}`, value: metadataToUpdate[key] });
        }
      }
    }
     // Check for fields in currentMetadata that are NOT in metadataToUpdate, if they should be removed (optional)
     // for (const key in currentMetadata) {
     //   if (currentMetadata.hasOwnProperty(key) && !metadataToUpdate.hasOwnProperty(key) && !key.startsWith('$')) {
     //     updates.push({ op: 'remove', path: `/${key}` });
     //   }
     // }

    if (updates.length === 0) {
      // Logger.log(`No metadata changes detected for ${fileId}, template ${templateKey}. Update skipped.`);
      return true; // No changes needed, considered a success.
    }
    
    // Logger.log(`Updating ${updates.length} metadata fields for file ${fileId} (template ${templateKey}).`);
    
    const url = `${BOX_API_BASE_URL}/files/${fileId}/metadata/${BOX_METADATA_SCOPE}/${templateKey}`;
    const options = {
      method: 'PUT', // HTTP PUT for JSON Patch
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json-patch+json'
      },
      payload: JSON.stringify(updates),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200 || responseCode === 201) { // 200 OK for update, 201 if it somehow created (though PUT usually is 200)
      // Logger.log(`Successfully updated metadata for ${fileId} (template ${templateKey}).`);
      return true;
    } else {
      const errorText = response.getContentText();
      Logger.log(`Error updating metadata for ${fileId} (template ${templateKey}). Code: ${responseCode}, Patch: ${JSON.stringify(updates)}, Response: ${errorText.substring(0,300)}`);
      console.error(`Error updating metadata (${responseCode}):`, errorText);
      // Original code had a fallback to delete and recreate if PUT failed with 400.
      // This can be risky if the template has fields not in metadataToUpdate.
      // For now, a failed PUT is a failed update.
      return false;
    }
  } catch (error) {
    Logger.log(`Exception updating metadata on ${fileId} (template ${templateKey}): ${error.toString()}`);
    console.error(`Exception updating metadata on ${fileId}:`, error);
    return false;
  }
}


// ===============================================
// AUTOMATION AND SCHEDULING
// ===============================================

/**
 * Creates or updates a time-driven trigger to run `processBoxImagesEnhanced` (or a basic version) hourly.
 */
function createScheduledTrigger() {
  const triggerFunctionName = 'processBoxImagesEnhanced'; // Or 'processBoxImages' for basic

  // Delete existing triggers for this function to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === triggerFunctionName) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Deleted existing trigger for ${triggerFunctionName}.`);
    }
  });
  
  // Create a new trigger
  ScriptApp.newTrigger(triggerFunctionName)
    .timeBased()
    .everyHours(1) // Configurable
    .create();
    
  Logger.log(`✅ Scheduled trigger created for '${triggerFunctionName}' - will run every hour.`);
}

// ===============================================
// MAIN SETUP AND REPORTING FUNCTIONS
// ===============================================

/**
 * Orchestrates the complete setup process for the image metadata system.
 */
function setupComplete() {
  Logger.log("=== Box Comprehensive Image Metadata Setup ===\n");
  
  Logger.log("1. Testing Box API connection...");
  if (!testBoxAccess()) { // Assumes testBoxAccess is in BoxOAuth.gs
    Logger.log("❌ Box API connection failed. Check OAuth setup and credentials in Script Properties. Aborting setup.");
    return;
  }
  Logger.log("✅ Box API connected successfully.\n");
  
  const accessToken = getValidAccessToken(); // Get token once for setup operations
  if (!accessToken) {
     Logger.log("❌ Failed to get valid access token for setup operations. Aborting.");
     return;
  }

  Logger.log("2. Ensuring comprehensive metadata template exists...");
  const template = getOrCreateImageTemplate(accessToken); // Assumes getOrCreateImageTemplate is in BoxMetadataTemplates.gs
  if (template) {
    Logger.log(`✅ Template ready: ${template.displayName} (Key: ${template.templateKey})`);
    Logger.log(`   Template ID: ${template.id}`);
    Logger.log(`   Total Fields: ${template.fields ? template.fields.length : 'N/A'}\n`);
  } else {
    Logger.log("❌ Metadata template creation or retrieval failed. Aborting setup.\n");
    return;
  }
  
  Logger.log("3. Attaching template to all image files (if not already attached)...");
  Logger.log("   (This may take a few minutes for large collections)\n");
  attachTemplateToAllImages(accessToken); // Assumes attachTemplateToAllImages is in BoxFileOperations.gs
  Logger.log("✅ Template attachment process complete.\n");
  
  Logger.log("4. Setting up automatic hourly processing...");
  createScheduledTrigger(); // Uses processBoxImagesEnhanced by default
  Logger.log("✅ Scheduled processing enabled.\n");
  
  Logger.log("5. Processing initial batch of images (Enhanced - EXIF & Vision API)...");
  // Consider running a specific, smaller initial batch or just basic here to avoid long first run.
  // For full initial processing:
  processBoxImagesEnhanced(); // This is the enhanced version defined later in this file.
  // Or for basic initial processing:
  // processBoxImages(); // This calls processImagesInFoldersBasic
  
  Logger.log("\n=== Setup Complete! ===");
  Logger.log("🎉 Your comprehensive image metadata system is now active!");
  Logger.log("\n📋 What happens next:");
  Logger.log(`   • Template '${BOX_METADATA_TEMPLATE_KEY}' is available and attached to image files.`);
  Logger.log("   • Enhanced metadata extraction (including AI analysis) runs automatically every hour (via processBoxImagesEnhanced).");
  Logger.log("   • Images are categorized, and technical/content metadata is extracted.");
  Logger.log("   • Processing stages track completion status for each image.");
  Logger.log("\n🔧 Useful functions to run manually from the editor:");
  Logger.log("   • processBoxImages() - Run basic metadata extraction immediately.");
  Logger.log("   • processBoxImagesEnhanced() - Run enhanced (EXIF & Vision API) processing immediately.");
  Logger.log("   • getImageProcessingSummary() - See basic processing statistics.");
  Logger.log("   • getEnhancedProcessingSummary() - See AI analysis statistics.");
  Logger.log("   • listExistingTemplates(getValidAccessToken()) - View all metadata templates.");
  Logger.log("   • testVisionApiIntegration() - Verify Vision API setup and a sample image analysis.");
  Logger.log("   • verifyVisionApiSetup() - Check Vision API key and basic connectivity.");
  Logger.log("   • troubleshootVisionApiError() - Guide for common Vision API issues.");
  Logger.log("   • checkVisionApiQuota() - Quick check if Vision API quota might be an issue.");
}

/**
 * Generates a summary report of image processing status based on basic metadata.
 */
function getImageProcessingSummary() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: getImageProcessingSummary - Failed to get valid access token.");
    return;
  }
  
  try {
    Logger.log("=== Basic Image Processing Summary ===\n");
    
    // Using DEFAULT_PROCESSING_FOLDER_ID from Config.gs to scan all.
    // For very large repos, consider sampling or focusing on specific folders.
    const allImages = findAllImageFiles(DEFAULT_PROCESSING_FOLDER_ID, accessToken);
    Logger.log(`📁 Total image files found (scanned from root): ${allImages.length}`);
    
    if (allImages.length === 0) {
      Logger.log("No image files found in the scanned locations.");
      return;
    }
    
    let withTemplate = 0;
    let withoutTemplate = 0; // Technically, means without THIS template instance
    const processingStages = {};
    const contentTypes = {};
    const locations = {};
    const departments = {};
    
    // Analyze a sample or all images. For large counts, sampling is faster for a summary.
    const sampleSize = Math.min(100, allImages.length); // Configurable sample size
    const imagesToAnalyze = allImages.slice(0, sampleSize); // Or allImages for full analysis
    
    Logger.log(`📋 Analyzing metadata for a sample of ${imagesToAnalyze.length} files (template: ${BOX_METADATA_TEMPLATE_KEY})...\n`);
    
    imagesToAnalyze.forEach(image => {
      const metadata = getCurrentMetadata(image.id, accessToken, BOX_METADATA_TEMPLATE_KEY);
      if (metadata) {
        withTemplate++;
        const stage = metadata.processingStage || 'unknown'; // 'unknown' if field is missing
        processingStages[stage] = (processingStages[stage] || 0) + 1;
        
        const contentType = metadata.contentType || 'unset';
        contentTypes[contentType] = (contentTypes[contentType] || 0) + 1;
        
        const location = metadata.facilityLocation || 'unset';
        locations[location] = (locations[location] || 0) + 1;
        
        const departmentVal = metadata.department || 'unset'; // Renamed from 'department' to avoid conflict
        departments[departmentVal] = (departments[departmentVal] || 0) + 1;
      } else {
        withoutTemplate++;
      }
    });
    
    const processedPercentage = imagesToAnalyze.length > 0 ? Math.round((withTemplate / imagesToAnalyze.length) * 100) : 0;
    
    Logger.log(`✅ Files with '${BOX_METADATA_TEMPLATE_KEY}' metadata (in sample): ${withTemplate} (${processedPercentage}%)`);
    Logger.log(`⏳ Files without '${BOX_METADATA_TEMPLATE_KEY}' metadata (in sample): ${withoutTemplate}\n`);
    
    if (withTemplate > 0) {
      Logger.log("📈 Processing Stages (from sample):");
      Object.entries(processingStages).forEach(([stage, count]) => Logger.log(`   ${stage}: ${count}`));
      
      Logger.log("\n🏷️ Content Types (from sample):");
      Object.entries(contentTypes).forEach(([type, count]) => Logger.log(`   ${type}: ${count}`));
      
      Logger.log("\n📍 Facility Locations (from sample):");
      Object.entries(locations).forEach(([location, count]) => Logger.log(`   ${location}: ${count}`));
      
      Logger.log("\n🏢 Departments (from sample):");
      Object.entries(departments).forEach(([dept, count]) => Logger.log(`   ${dept}: ${count}`));
    }
    
    Logger.log("\n💡 Recommendations:");
    if (withoutTemplate > 0 || (allImages.length > sampleSize && (allImages.length - sampleSize + withoutTemplate > 0))) {
      Logger.log(`   📌 Run attachTemplateToAllImages(getValidAccessToken()) to ensure the template '${BOX_METADATA_TEMPLATE_KEY}' is attached to all images.`);
    }
    if (processingStages[PROCESSING_STAGE_UNPROCESSED] > 0 || processingStages['unknown'] > 0) {
      Logger.log("   📌 Run processBoxImages() or processImagesInFoldersBasic() to extract basic metadata for unprocessed files.");
    }
    if (processingStages[PROCESSING_STAGE_BASIC] > 0) {
      Logger.log(`   📌 Consider running processBoxImagesEnhanced() to perform AI analysis for files at stage '${PROCESSING_STAGE_BASIC}'.`);
    }
    
  } catch (error) {
    Logger.log(`Error getting processing summary: ${error.toString()}`);
    console.error("Error getting processing stats:", error);
  }
}

// ===============================================
// EXIF DATA EXTRACTION (Simplified)
// ===============================================

/**
 * Extracts basic EXIF data from image bytes.
 * This is a very simplified parser focusing on JPEG and common markers.
 * @param {byte[]} imageBytes Byte array of the image.
 * @returns {object|null} An object with extracted EXIF data or null if not JPEG or no EXIF found.
 */
function parseBasicExif(imageBytes) {
  const exifData = {
    hasExif: false,
    cameraModel: null,
    dateTaken: null, // Placeholder, more complex to parse fully
    imageWidth: null, // Placeholder
    imageHeight: null, // Placeholder
    // Additional common fields can be added if parsing logic is expanded
    fNumber: null, 
    exposureTime: null, 
    iso: null, 
    focalLength: null,
    flash: null
  };
  
  try {
    // Check for JPEG file signature (SOI marker)
    if (imageBytes[0] !== 0xFF || imageBytes[1] !== 0xD8) {
      // Logger.log("Not a JPEG file based on signature.");
      return exifData; // Not a JPEG
    }
    
    let offset = 2; // Start after SOI marker
    // Max offset to search for APP1 to avoid very long loops on corrupt files
    const maxSearchOffset = Math.min(imageBytes.length - 4, 65536); // Search in first 64KB

    while (offset < maxSearchOffset) {
      if (imageBytes[offset] === 0xFF) { // Found a marker
        const markerType = imageBytes[offset + 1];
        
        if (markerType === 0xE1) { // APP1 marker, commonly EXIF
          // Logger.log("Found APP1 Marker (potential EXIF) at offset: " + offset);
          // Next 2 bytes are segment length (Motorola/Intel byte order matters for full parsing)
          // Next 4 bytes should be "Exif" (0x45786966) followed by 0x0000
          const exifHeaderOffset = offset + 4;
          if (imageBytes[exifHeaderOffset] === 0x45 && imageBytes[exifHeaderOffset+1] === 0x78 && // E x
              imageBytes[exifHeaderOffset+2] === 0x69 && imageBytes[exifHeaderOffset+3] === 0x66 && // i f
              imageBytes[exifHeaderOffset+4] === 0x00 && imageBytes[exifHeaderOffset+5] === 0x00) {
            
            exifData.hasExif = true;
            // Logger.log("Confirmed EXIF header.");

            // Simplified parsing: Scan a portion of the EXIF segment for known camera model strings
            // A full EXIF parser would read TIFF structure (IFDs, tags, values)
            const searchEnd = Math.min(offset + 2 + (imageBytes[offset+2] << 8 | imageBytes[offset+3]), imageBytes.length); // Segment length
            const exifSegmentForStringSearch = imageBytes.slice(exifHeaderOffset + 6, Math.min(searchEnd, exifHeaderOffset + 6 + 500)); // Search in ~500 bytes post "Exif\0\0"
            const exifString = String.fromCharCode.apply(null, exifSegmentForStringSearch);
            
            const cameraMatchers = [
                /Canon EOS [^\s,]+/i, /Canon PowerShot [^\s,]+/i, /Canon [^\s,]+/i, // Canon models
                /NIKON D[^\s,]+/i, /NIKON [^\s,]+/i, // Nikon models
                /SONY ILCE-[^\s,]+/i, /SONY DSC-[^\s,]+/i, /SONY [^\s,]+/i, // Sony models
                /iPhone [^\s,]+/i, /iPad [^\s,]+/i, // Apple devices
                /SM-[A-Z0-9]+/i, /GT-[A-Z0-9]+/i, /Galaxy [^\s,]+/i, // Samsung models (examples)
                /Pixel [^\s,]+/i, // Google Pixel
                /OLYMPUS [^\s,]+/i, /E-M[0-9]+/i, // Olympus
                /FUJIFILM X-[^\s,]+/i, /FUJIFILM GFX[^\s,]+/i, // Fujifilm
                /Panasonic DMC-[^\s,]+/i, /Panasonic DC-[^\s,]+/i // Panasonic
            ];

            for (const regex of cameraMatchers) {
                const cameraMatch = exifString.match(regex);
                if (cameraMatch && cameraMatch[0].length < 100) { // Basic sanity check on length
                    exifData.cameraModel = cameraMatch[0].trim();
                    // Logger.log("Found Camera Model (simplified): " + exifData.cameraModel);
                    break; 
                }
            }
            // To get dateTaken, width, height etc., a full TIFF tag parser is needed here.
            // This basic version only confirms EXIF presence and tries a simple camera model sniff.
            return exifData; // Found EXIF, even if model not parsed
          }
        }
        // Move to the next segment: current offset + 2 (for marker) + segment length
        // Segment length is in the 2 bytes following the marker type (imageBytes[offset+2] and imageBytes[offset+3])
        const segmentLength = (imageBytes[offset+2] << 8) | imageBytes[offset+3];
        offset += segmentLength + 2;
      } else {
        offset++; // Should not happen in a valid JPEG after SOI, but good for safety
      }
    }
    // Logger.log("No EXIF APP1 segment found or EXIF header mismatch.");
    return exifData;
  } catch (error) {
    console.error('Error parsing EXIF (simplified):', error);
    Logger.log(`Error parsing basic EXIF: ${error.toString()}`);
    return exifData; // Return default data (hasExif: false)
  }
}


/**
 * Downloads a Box file and attempts to extract basic EXIF information.
 * @param {string} fileId The ID of the Box file.
 * @param {string} accessToken A valid Box access token.
 * @returns {object|null} An object with extracted EXIF data, or null on error/no EXIF.
 */
function extractExifData(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log(`ERROR: ${arguments.callee.name} - fileId and accessToken are required.`);
    return null;
  }
  // Logger.log(`Extracting EXIF data for file ${fileId}`);
  try {
    const downloadUrl = `${BOX_API_BASE_URL}/files/${fileId}/content`;
    const response = UrlFetchApp.fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true // Important for handling non-200 responses
    });

    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log(`Failed to download file ${fileId} for EXIF extraction. Code: ${responseCode}, Response: ${response.getContentText().substring(0,200)}`);
      return null;
    }
    
    const imageBlob = response.getBlob();
    // Check content type if necessary, e.g., imageBlob.getContentType() should be 'image/jpeg' for this parser
    if (imageBlob.getContentType() !== 'image/jpeg' && imageBlob.getContentType() !== 'image/jpg') {
        // Logger.log(`Skipping EXIF for file ${fileId}, content type is ${imageBlob.getContentType()}, not JPEG.`);
        return { hasExif: false }; // Only parsing JPEG EXIF for now
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
 * @returns {string} The Vision API key.
 * @throws {Error} If the API key is not found.
 */
function getVisionApiKey() {
  const apiKey = SCRIPT_PROPERTIES.getProperty(VISION_API_KEY_PROPERTY); // From Config.gs
  if (!apiKey) {
    const errMsg = `${VISION_API_KEY_PROPERTY} not found in Script Properties. Please add it.`;
    Logger.log(`ERROR: ${errMsg}`);
    throw new Error(errMsg);
  }
  return apiKey;
}

/**
 * Parses the response from Google Vision API into a structured object.
 * @param {object} visionApiResponse The 'response' object from Vision API for a single image.
 * @returns {object} A structured object containing labels, objects, text, etc.
 */
function parseVisionApiResponse(visionApiResponse) {
  const analysis = {
    objects: [],        // Localized objects
    labels: [],         // General labels
    text: '',           // OCR'd text
    dominantColors: [], // Dominant colors of the image
    sceneDescription: '', // Generated from top labels
    confidenceScore: 0, // Average confidence of labels
    safeSearch: null    // Safe search annotation
  };
  
  try {
    if (!visionApiResponse) return analysis;

    // Parse localized object annotations
    if (visionApiResponse.localizedObjectAnnotations) {
      analysis.objects = visionApiResponse.localizedObjectAnnotations.map(obj => ({
        name: obj.name,
        confidence: obj.score ? Math.round(obj.score * 100) / 100 : 0
      }));
    }
    
    // Parse label annotations
    if (visionApiResponse.labelAnnotations) {
      analysis.labels = visionApiResponse.labelAnnotations.map(label => ({
        description: label.description,
        confidence: label.score ? Math.round(label.score * 100) / 100 : 0
      }));
      
      if (analysis.labels.length > 0) {
        const totalConfidence = analysis.labels.reduce((sum, label) => sum + label.confidence, 0);
        analysis.confidenceScore = Math.round((totalConfidence / analysis.labels.length) * 100) / 100;
        
        const topLabels = analysis.labels.slice(0, 5).map(l => l.description); // Top 5 labels
        analysis.sceneDescription = `Image may contain: ${topLabels.join(', ')}`;
      }
    }
    
    // Parse text annotations (full text)
    if (visionApiResponse.textAnnotations && visionApiResponse.textAnnotations.length > 0) {
      analysis.text = visionApiResponse.textAnnotations[0].description || '';
    }
    
    // Parse image properties (dominant colors)
    if (visionApiResponse.imagePropertiesAnnotation && visionApiResponse.imagePropertiesAnnotation.dominantColors && visionApiResponse.imagePropertiesAnnotation.dominantColors.colors) {
      const colors = visionApiResponse.imagePropertiesAnnotation.dominantColors.colors;
      analysis.dominantColors = colors.slice(0, 5).map(colorInfo => { // Top 5 colors
        const color = colorInfo.color;
        const rgb = `rgb(${Math.round(color.red || 0)}, ${Math.round(color.green || 0)}, ${Math.round(color.blue || 0)})`;
        return {
          rgb: rgb,
          score: colorInfo.score ? Math.round(colorInfo.score * 100) / 100 : 0,
          pixelFraction: colorInfo.pixelFraction ? Math.round(colorInfo.pixelFraction * 1000) / 1000 : 0
        };
      });
    }
    
    // Parse safe search annotations
    if (visionApiResponse.safeSearchAnnotation) {
      analysis.safeSearch = visionApiResponse.safeSearchAnnotation;
    }
    
  } catch (error) {
    Logger.log(`Error parsing Vision API response: ${error.toString()}`);
    console.error('Error parsing Vision API response:', error, JSON.stringify(visionApiResponse));
    // Return partially parsed data or default analysis object
  }
  return analysis;
}


/**
 * Analyzes an image file from Box with Google Vision API.
 * Includes improved error handling and file size check.
 * @param {string} fileId The ID of the Box file.
 * @param {string} accessToken A valid Box access token for downloading the file.
 * @returns {object|null} Parsed Vision API analysis object, or an error object if analysis fails.
 */
function analyzeImageWithVisionImproved(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log(`ERROR: ${arguments.callee.name} - fileId and accessToken are required.`);
    return { error: 'MISSING_PARAMETERS', message: 'File ID and Access Token are required.' };
  }
  // Logger.log(`Analyzing image ${fileId} with Google Vision API (Improved)`);
  
  try {
    const visionApiKey = getVisionApiKey(); // Throws error if not found
    
    const downloadUrl = `${BOX_API_BASE_URL}/files/${fileId}/content`;
    const downloadFileResponse = UrlFetchApp.fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });

    const downloadResponseCode = downloadFileResponse.getResponseCode();
    if (downloadResponseCode !== 200) {
        Logger.log(`Failed to download file ${fileId} for Vision API. Code: ${downloadResponseCode}, Msg: ${downloadFileResponse.getContentText().substring(0,200)}`);
        return { error: 'BOX_DOWNLOAD_FAILED', code: downloadResponseCode, message: `Failed to download file from Box (ID: ${fileId}).`};
    }

    const imageBlob = downloadFileResponse.getBlob();
    const imageBytes = imageBlob.getBytes(); // Get bytes once
    const imageSize = imageBytes.length;
    
    if (imageSize > MAX_VISION_API_FILE_SIZE_BYTES) { // From Config.gs
      const sizeMB = Math.round(imageSize / (1024 * 1024) * 10) / 10;
      Logger.log(`Image ${fileId} too large for Vision API (${sizeMB}MB). Limit is ${MAX_VISION_API_FILE_SIZE_BYTES/(1024*1024)}MB.`);
      return { error: 'FILE_TOO_LARGE', sizeMB: sizeMB, message: `File size ${sizeMB}MB exceeds Vision API limit.` };
    }
    if (imageSize === 0) {
        Logger.log(`Image ${fileId} is empty (0 bytes). Skipping Vision API.`);
        return { error: 'FILE_EMPTY', message: 'Image file is empty.'};
    }

    const base64Image = Utilities.base64Encode(imageBytes);
    
    const visionApiRequestPayload = {
      requests: [{
        image: { content: base64Image },
        features: [
          { type: 'OBJECT_LOCALIZATION', maxResults: 20 },
          { type: 'LABEL_DETECTION', maxResults: 20 },
          { type: 'TEXT_DETECTION', maxResults: 10 }, // TEXT_DETECTION is generally for dense text; DOCUMENT_TEXT_DETECTION for sparse.
          { type: 'IMAGE_PROPERTIES' }, // For dominant colors
          { type: 'SAFE_SEARCH_DETECTION' }
        ]
      }]
    };
    
    const visionApiOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      payload: JSON.stringify(visionApiRequestPayload),
      muteHttpExceptions: true
    };
    
    const visionApiResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${visionApiKey}`, visionApiOptions); // VISION_API_ENDPOINT from Config.gs
    const visionResponseCode = visionApiResponse.getResponseCode();
    const visionResponseText = visionApiResponse.getContentText();
    
    if (visionResponseCode === 200) {
      const visionData = JSON.parse(visionResponseText);
      if (visionData.responses && visionData.responses[0]) {
        if (visionData.responses[0].error) { // Check for errors within a 200 response from Vision API
          Logger.log(`Vision API returned an error for image ${fileId}: ${JSON.stringify(visionData.responses[0].error)}`);
          return { error: 'VISION_API_RESPONSE_ERROR', details: visionData.responses[0].error, message: visionData.responses[0].error.message };
        }
        return parseVisionApiResponse(visionData.responses[0]); // Return parsed data
      } else {
        Logger.log(`Vision API returned 200 but with empty or invalid response for image ${fileId}. Resp: ${visionResponseText.substring(0,300)}`);
        return { error: 'VISION_API_EMPTY_RESPONSE', message: 'Vision API returned 200 but response was empty or malformed.' };
      }
    } else {
      // Handle HTTP errors from Vision API
      Logger.log(`Vision API HTTP Error ${visionResponseCode} for image ${fileId}: ${visionResponseText.substring(0,500)}`);
      let errorDetails = visionResponseText;
      try {
        errorDetails = JSON.parse(visionResponseText).error || errorDetails;
      } catch (e) { /* Ignore parse error, use raw text */ }
      return { error: 'VISION_API_HTTP_ERROR', code: visionResponseCode, message: `Vision API request failed with HTTP ${visionResponseCode}.`, details: errorDetails };
    }
    
  } catch (error) {
    Logger.log(`Exception during Vision API analysis for image ${fileId}: ${error.toString()}`);
    console.error(`Exception analyzing image ${fileId} with Vision API:`, error);
    return { error: 'SCRIPT_EXCEPTION', message: error.toString() };
  }
}

// Alias for simpler calling if preferred, pointing to the improved version.
function analyzeImageWithVision(fileId, accessToken) {
  return analyzeImageWithVisionImproved(fileId, accessToken);
}


// ===============================================
// ENHANCED METADATA EXTRACTION & CONTENT ANALYSIS
// ===============================================

/**
 * Enhances basic metadata with AI-driven insights from Vision API.
 * @param {object} basicMetadata The metadata object from extractComprehensiveMetadata.
 * @param {object} visionAnalysis The parsed analysis results from Google Vision API.
 * @param {string} filename The original filename, for context.
 * @param {string} folderPath The folder path, for context.
 * @returns {object} An enhanced analysis object with new/updated fields.
 */
function enhanceContentAnalysisWithAI(basicMetadata, visionAnalysis, filename, folderPath) {
  const enhancements = {};
  
  if (!visionAnalysis || visionAnalysis.error) {
    Logger.log(`enhanceContentAnalysisWithAI: Vision analysis has errors or is missing for ${filename}. Skipping AI enhancements.`);
    return enhancements;
  }

  // Enhance content type detection using AI labels
  if (visionAnalysis.labels && visionAnalysis.labels.length > 0) {
    const labelsLower = visionAnalysis.labels.map(l => l.description.toLowerCase());
    
    // More specific rules can be added based on your template's enum options for contentType
    if (labelsLower.some(l => ['sculpture', 'art', 'statue', 'artwork', 'installation', 'painting', 'drawing'].includes(l))) {
      enhancements.contentType = 'artwork'; // Assumes 'artwork' is an enum key in your template
      if (basicMetadata.importance !== 'critical') enhancements.importance = 'high'; // Elevate importance for art
    } else if (labelsLower.some(l => ['person', 'people', 'human face', 'portrait', 'crowd', 'man', 'woman', 'child'].includes(l))) {
      enhancements.contentType = 'team_portrait'; // Or 'people_generic', 'event_attendees' etc.
      enhancements.needsReview = 'yes'; // Potential privacy, consent, or tagging review
    } else if (labelsLower.some(l => ['tool', 'machine', 'equipment', 'vehicle', 'engine', 'machinery'].includes(l))) {
      enhancements.contentType = 'equipment';
      if (!basicMetadata.department || basicMetadata.department === 'general') enhancements.department = 'operations';
    } else if (labelsLower.some(l => ['building', 'room', 'interior', 'architecture', 'house', 'office building', 'factory'].includes(l))) {
      enhancements.contentType = basicMetadata.contentType === 'facility_exterior' ? 'facility_exterior' : 'facility_interior';
    }
    // Add more rules based on your specific content types and AI labels
  }
  
  // Enhance subject identification using primary localized object
  if (visionAnalysis.objects && visionAnalysis.objects.length > 0) {
    // Sort by confidence, pick the highest (or largest bounding box if available and relevant)
    const primaryObject = visionAnalysis.objects.sort((a,b) => b.confidence - a.confidence)[0];
    if (primaryObject && primaryObject.name) {
        enhancements.subject = primaryObject.name; // Overrides basic subject from filename if AI is more specific
    }
  } else if (visionAnalysis.labels && visionAnalysis.labels.length > 0 && !enhancements.subject) {
      // Fallback to top label if no objects detected
      enhancements.subject = visionAnalysis.labels[0].description;
  }
  
  // Enhance keywords with AI-detected labels and objects
  const aiKeywordsList = [];
  if (visionAnalysis.labels) {
    visionAnalysis.labels.slice(0, 10).forEach(l => aiKeywordsList.push(l.description.toLowerCase())); // Top 10 labels
  }
  if (visionAnalysis.objects) {
    visionAnalysis.objects.slice(0, 5).forEach(o => aiKeywordsList.push(o.name.toLowerCase())); // Top 5 objects
  }
  
  if (aiKeywordsList.length > 0) {
    const existingKeywords = basicMetadata.manualKeywords ? basicMetadata.manualKeywords.split(',').map(k => k.trim()) : [];
    // Combine and deduplicate, keeping existing manual keywords first
    const combinedKeywords = [...new Set([...existingKeywords, ...aiKeywordsList])];
    enhancements.manualKeywords = combinedKeywords.join(', ');
  }
  
  // Detect text-heavy images (e.g., documentation, signs) based on OCR results
  if (visionAnalysis.text && visionAnalysis.text.length > 50) { // Threshold for "text-heavy"
    if (basicMetadata.contentType === 'other' || basicMetadata.contentType === 'unknown') {
        enhancements.contentType = 'documentation'; // Or 'text_document', 'signage'
    }
    if (basicMetadata.importance !== 'critical' && basicMetadata.importance !== 'high') {
        enhancements.importance = 'medium';
    }
  }
  
  return enhancements;
}


/**
 * Extracts enhanced metadata by combining basic info, EXIF, and Vision API analysis.
 * @param {object} fileDetails Full file details object from Box API.
 * @param {string} accessToken Valid Box access token.
 * @returns {object} The combined and enhanced metadata object.
 */
function extractEnhancedMetadata(fileDetails, accessToken) {
  // Logger.log(`Starting enhanced metadata extraction for: ${fileDetails.name} (ID: ${fileDetails.id})`);
  
  // 1. Get basic metadata (already sets processingStage to basic_extracted)
  const basicMetadata = extractComprehensiveMetadata(fileDetails); // From MetadataExtraction.gs
  let combinedMetadata = { ...basicMetadata }; // Start with basic

  // 2. Attempt to extract EXIF data
  const exifData = extractExifData(fileDetails.id, accessToken); // Defined in this file
  if (exifData && exifData.hasExif) {
    // Logger.log(`EXIF data found for ${fileDetails.name}. Merging.`);
    combinedMetadata = {
      ...combinedMetadata,
      ...(exifData.cameraModel && { cameraModel: exifData.cameraModel }),
      ...(exifData.dateTaken && { dateTaken: exifData.dateTaken }), // More reliable dateTaken if EXIF provides
      // ...(exifData.imageWidth && { imageWidth: exifData.imageWidth }), // Vision API might also provide this
      // ...(exifData.imageHeight && { imageHeight: exifData.imageHeight }),
      processingStage: PROCESSING_STAGE_EXIF // Update stage if EXIF found
    };
  }
  
  // 3. Analyze with Google Vision API
  const visionAnalysis = analyzeImageWithVisionImproved(fileDetails.id, accessToken); // Defined in this file
  
  if (visionAnalysis && !visionAnalysis.error) {
    // Logger.log(`Vision API analysis successful for ${fileDetails.name}. Merging.`);
    combinedMetadata = {
      ...combinedMetadata,
      aiDetectedObjects: visionAnalysis.objects ? visionAnalysis.objects.map(obj => `${obj.name} (${obj.confidence})`).join('; ') : '', // Semicolon separated
      aiSceneDescription: visionAnalysis.sceneDescription || '',
      extractedText: visionAnalysis.text ? visionAnalysis.text.replace(/\n/g, ' ').substring(0, MAX_TEXT_EXTRACTION_LENGTH) : '', // MAX_TEXT_EXTRACTION_LENGTH from Config.gs
      dominantColors: visionAnalysis.dominantColors ? visionAnalysis.dominantColors.map(c => `${c.rgb} (${c.score}, ${c.pixelFraction})`).join('; ') : '',
      aiConfidenceScore: visionAnalysis.confidenceScore || 0,
      // Consider adding safeSearch results if relevant to your template:
      // safeSearchAdult: visionAnalysis.safeSearch ? visionAnalysis.safeSearch.adult : null,
      // safeSearchSpoof: visionAnalysis.safeSearch ? visionAnalysis.safeSearch.spoof : null,
      // safeSearchMedical: visionAnalysis.safeSearch ? visionAnalysis.safeSearch.medical : null,
      // safeSearchViolence: visionAnalysis.safeSearch ? visionAnalysis.safeSearch.violence : null,
      // safeSearchRacy: visionAnalysis.safeSearch ? visionAnalysis.safeSearch.racy : null,
      processingStage: PROCESSING_STAGE_AI // Update stage to AI analyzed
    };
    
    // 4. Perform content analysis enhancements based on AI data
    const aiEnhancements = enhanceContentAnalysisWithAI(combinedMetadata, visionAnalysis, fileDetails.name, combinedMetadata.folderPath);
    combinedMetadata = { ...combinedMetadata, ...aiEnhancements };
    
  } else if (visionAnalysis && visionAnalysis.error) {
    Logger.log(`Vision API analysis for ${fileDetails.name} failed or returned error: ${visionAnalysis.message || JSON.stringify(visionAnalysis.details)}. Metadata will not include AI fields.`);
    // `processingStage` remains as `basic_extracted` or `exif_extracted`
    combinedMetadata.notes = (combinedMetadata.notes ? combinedMetadata.notes + "; " : "") + `Vision API Error: ${visionAnalysis.message || visionAnalysis.error}`;
  }

  // 5. Finalize processing metadata
  combinedMetadata.lastProcessedDate = new Date().toISOString();
  combinedMetadata.processingVersion = PROCESSING_VERSION_ENHANCED; // From Config.gs
  
  return combinedMetadata;
}


// ===============================================
// ENHANCED IMAGE PROCESSING FUNCTIONS (EXIF & VISION API)
// ===============================================

/**
 * Processes a single image file with enhanced analysis (EXIF, Vision API).
 * Includes fallbacks and updates metadata.
 * @param {object} fileEntry A summary file object from Box API (id, name).
 * @param {string} accessToken Valid Box access token.
 */
function processImageFileEnhanced(fileEntry, accessToken) {
  if (!accessToken || !fileEntry || !fileEntry.id) {
    Logger.log(`ERROR: ${arguments.callee.name} - accessToken and fileEntry (with id) are required.`);
    return;
  }
  // Logger.log(`Starting enhanced processing for ${fileEntry.name} (ID: ${fileEntry.id})...`);
  
  try {
    const currentMetadataInstance = getCurrentMetadata(fileEntry.id, accessToken); // From BoxFileOperations.gs
    const currentStage = currentMetadataInstance ? currentMetadataInstance.processingStage : PROCESSING_STAGE_UNPROCESSED;
    
    // Skip if already fully processed by AI or marked as complete
    if (currentStage === PROCESSING_STAGE_AI || currentStage === PROCESSING_STAGE_COMPLETE) {
      // Logger.log(`Skipping ${fileEntry.name} - already processed to stage: ${currentStage}.`);
      return;
    }
    
    // Fetch full file details needed for enhanced extraction
    const fileDetailsUrl = `${BOX_API_BASE_URL}/files/${fileEntry.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
    const detailsOptions = { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true };
    const fileDetailsResponse = UrlFetchApp.fetch(fileDetailsUrl, detailsOptions);

    if (fileDetailsResponse.getResponseCode() !== 200) {
      Logger.log(`ERROR: Failed to fetch full details for ${fileEntry.name} (ID: ${fileEntry.id}) for enhanced processing. Code: ${fileDetailsResponse.getResponseCode()}`);
      return;
    }
    const fileDetails = JSON.parse(fileDetailsResponse.getContentText());
    
    // Check file size before attempting download for Vision API (already done in analyzeImageWithVisionImproved, but good for early exit)
    if (fileDetails.size > MAX_VISION_API_FILE_SIZE_BYTES * 1.2) { // Add a little buffer
        Logger.log(`Skipping enhanced processing for ${fileDetails.name} - file size (${Math.round(fileDetails.size/(1024*1024))}MB) likely too large for Vision API.`);
        // Optionally, update metadata to indicate skipped due to size
        let sizeSkipMetadata = currentMetadataInstance || extractComprehensiveMetadata(fileDetails);
        sizeSkipMetadata.processingStage = currentMetadataInstance ? currentStage : PROCESSING_STAGE_BASIC; // Keep current stage or basic
        sizeSkipMetadata.notes = (sizeSkipMetadata.notes ? sizeSkipMetadata.notes + "; " : "") + "Enhanced AI processing skipped due to large file size.";
        sizeSkipMetadata.lastProcessedDate = new Date().toISOString();
        applyMetadataToFileFixed(fileDetails.id, sizeSkipMetadata, accessToken);
        return;
    }
    
    // Extract enhanced metadata (this function handles EXIF and Vision API calls)
    const enhancedMetadata = extractEnhancedMetadata(fileDetails, accessToken);
    
    // Apply the combined metadata
    const success = applyMetadataToFileFixed(fileDetails.id, enhancedMetadata, accessToken);
    
    if (success) {
      Logger.log(`✅ Enhanced processing complete for: ${fileDetails.name} (Final Stage: ${enhancedMetadata.processingStage})`);
      // Optional: Log specific AI results if needed
      // if (enhancedMetadata.processingStage === PROCESSING_STAGE_AI) {
      //   Logger.log(`   AI Objects: ${enhancedMetadata.aiDetectedObjects ? enhancedMetadata.aiDetectedObjects.split(';').length : 0}, Confidence: ${enhancedMetadata.aiConfidenceScore || 'N/A'}`);
      // }
    } else {
      Logger.log(`❌ Failed to apply enhanced metadata for: ${fileDetails.name}`);
    }
    
  } catch (error) {
    Logger.log(`EXCEPTION during enhanced processing of ${fileEntry.name} (ID: ${fileEntry.id}): ${error.toString()}`);
    console.error(`Error in enhanced processing for ${fileEntry.name}:`, error);
    // Fallback: attempt to save at least basic or EXIF stage if AI failed mid-way
    // This is complex because extractEnhancedMetadata tries to build progressively.
    // If an exception happens outside extractEnhancedMetadata, but after some data was gathered,
    // that data might be lost unless explicitly saved here.
    // For now, rely on extractEnhancedMetadata to return the best possible metadata before any exception.
  }
}


/**
 * Main orchestrator for enhanced image processing (EXIF & Vision API).
 * Processes images in specified folders.
 */
function processBoxImagesEnhanced() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: processBoxImagesEnhanced - Failed to get valid access token. Aborting.");
    return;
  }
  
  Logger.log("🔄 Starting ENHANCED image processing (EXIF and Vision API)...");
  Logger.log(`⚠️  Note: This process will use Google Vision API quota. Max file size for Vision: ${MAX_VISION_API_FILE_SIZE_BYTES/(1024*1024)}MB.`);
  
  try {
    // Test Vision API setup first (optional, but good for a full run)
    if (!verifyVisionApiSetup()) { // verifyVisionApiSetup defined later in this file
      Logger.log("❌ Vision API setup verification failed. Enhanced processing may not work correctly for AI features.");
      Logger.log("Proceeding with EXIF extraction and basic metadata where possible. AI features will be skipped if Vision API is misconfigured.");
      // Decide: Abort or proceed with limited functionality? For now, proceed.
    } else {
      Logger.log("✅ Vision API setup appears OK.");
    }
    
    const foldersToProcess = [ACTIVE_TEST_FOLDER_ID]; // From Config.gs, or make configurable
    
    foldersToProcess.forEach(folderId => {
      Logger.log(`Enhanced processing for folder ID: ${folderId}`);
      const listUrl = `${BOX_API_BASE_URL}/folders/${folderId}/items?limit=${DEFAULT_API_ITEM_LIMIT}&fields=id,name,type,size`; // Get size for early skip
      const listOptions = { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true };
      
      const listResponse = UrlFetchApp.fetch(listUrl, listOptions);
      if (listResponse.getResponseCode() !== 200) {
        Logger.log(`ERROR: Failed to list items in folder ${folderId} for enhanced processing. Skipping.`);
        return; // continue to next folderId
      }
      
      const listData = JSON.parse(listResponse.getContentText());
      const imageFileEntries = listData.entries.filter(item => item.type === 'file' && isImageFile(item.name));
      
      Logger.log(`Found ${imageFileEntries.length} image(s) in folder ${folderId} for potential enhanced processing.`);
      
      let processedInBatch = 0;
      for (let i = 0; i < imageFileEntries.length; i++) {
        const fileEntry = imageFileEntries[i];
        
        // Skip very large files early before attempting detailed processing
        if (fileEntry.size > MAX_VISION_API_FILE_SIZE_BYTES * 1.2) { // Check size from initial listing
             Logger.log(`Skipping ${fileEntry.name} (${Math.round(fileEntry.size/(1024*1024))}MB) - too large for Vision API, before full detail fetch.`);
             // Optionally update metadata to reflect this skip if not already processed
             const currentMeta = getCurrentMetadata(fileEntry.id, accessToken);
             if (!currentMeta || (currentMeta.processingStage !== PROCESSING_STAGE_AI && currentMeta.processingStage !== PROCESSING_STAGE_COMPLETE)) {
                const skipMeta = currentMeta || { processingStage: PROCESSING_STAGE_UNPROCESSED }; // Minimal data if no meta
                skipMeta.notes = (skipMeta.notes || "") + " AI processing skipped (large file).";
                skipMeta.lastProcessedDate = new Date().toISOString();
                if (!skipMeta.originalFilename) skipMeta.originalFilename = fileEntry.name; // Ensure basic field if creating new
                applyMetadataToFileFixed(fileEntry.id, skipMeta, accessToken);
             }
             continue;
        }

        processImageFileEnhanced(fileEntry, accessToken); // Process one by one
        processedInBatch++;
        
        // Rate limiting
        if (i < imageFileEntries.length - 1) { // If not the last file
          if (processedInBatch % ENHANCED_PROCESSING_BATCH_SIZE === 0) {
            Logger.log(`Pausing for ${ENHANCED_PROCESSING_BATCH_DELAY_MS / 1000}s after a batch of ${ENHANCED_PROCESSING_BATCH_SIZE} files...`);
            Utilities.sleep(ENHANCED_PROCESSING_BATCH_DELAY_MS); // From Config.gs
            processedInBatch = 0; // Reset batch counter
          } else {
            Utilities.sleep(ENHANCED_PROCESSING_FILE_DELAY_MS); // From Config.gs
          }
        }
      }
    });
    
    Logger.log("✅ Enhanced image processing cycle complete!");
    
  } catch (error) {
    Logger.log(`Error in main enhanced processing (processBoxImagesEnhanced): ${error.toString()}`);
    console.error('Error in enhanced processing:', error);
    // Consider a fallback to basic processing if enhanced fails catastrophically
    // Logger.log("Attempting to fall back to basic processing...");
    // processBoxImages(); 
  }
}


// ===============================================
// DIAGNOSTIC AND TESTING FUNCTIONS
// ===============================================

/**
 * Verifies Vision API setup by checking API key and making test calls.
 * @returns {boolean} True if setup seems correct, false otherwise.
 */
function verifyVisionApiSetup() {
  Logger.log("=== Google Vision API Setup Verification ===\n");
  let apiKey;
  try {
    // Step 1: Check API key presence
    Logger.log("1. Checking API key presence in Script Properties...");
    apiKey = getVisionApiKey(); // Throws error if VISION_API_KEY_PROPERTY not found
    Logger.log(`✅ API key found (property: ${VISION_API_KEY_PROPERTY}). Length: ${apiKey.length}`);
    if (!apiKey.startsWith('AIza') || apiKey.length !== 39) {
        Logger.log(`⚠️ API key format might be incorrect. Expected 39 chars starting with 'AIza'. Actual: ${apiKey.substring(0,10)}...`);
    }
    
    // Step 2: Test API key with a minimal, non-billable or very low-cost request (e.g., empty image content check)
    Logger.log("\n2. Testing API key validity with an empty image request...");
    const testAuthPayload = {
      requests: [{ image: { content: '' }, features: [{ type: 'LABEL_DETECTION', maxResults: 1 }] }]
    };
    const testAuthOptions = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(testAuthPayload),
      muteHttpExceptions: true
    };
    const testAuthResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, testAuthOptions);
    const testAuthResponseCode = testAuthResponse.getResponseCode();
    const testAuthResponseText = testAuthResponse.getContentText();
    
    Logger.log(`   Empty image request response code: ${testAuthResponseCode}`);
    
    if (testAuthResponseCode === 400) { // Bad Request (e.g. "Invalid image content") is expected for empty image, means auth worked.
      Logger.log("✅ API key is valid for authentication (400 error for empty image is expected and OK for this test).");
    } else if (testAuthResponseCode === 403) {
      Logger.log(`❌ API key authentication failed (403 Forbidden). Response: ${testAuthResponseText.substring(0,500)}`);
      Logger.log("   Troubleshooting: Verify API key string, Vision API enabled in Cloud Console, billing enabled, and no restrictive API key settings.");
      return false;
    } else {
      Logger.log(`⚠️ Unexpected response code for empty image test: ${testAuthResponseCode}. Response: ${testAuthResponseText.substring(0,500)}`);
      // Could be a more general issue, but proceed to actual image test if not 403.
    }
    
    // Step 3: Test with a tiny valid sample image (if previous tests didn't fail on auth)
    Logger.log("\n3. Testing with a minimal sample image (1x1 pixel)...");
    const tinyImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='; // 1x1 red pixel PNG
    const testImagePayload = {
      requests: [{ image: { content: tinyImageBase64 }, features: [{ type: 'LABEL_DETECTION', maxResults: 1 }] }]
    };
    const testImageOptions = { ...testAuthOptions, payload: JSON.stringify(testImagePayload) }; // Reuse options, change payload
    
    const testImageResponse = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, testImageOptions);
    const testImageResponseCode = testImageResponse.getResponseCode();
    const testImageResponseText = testImageResponse.getContentText();
    
    if (testImageResponseCode === 200) {
      Logger.log("✅ Vision API is working correctly! Received 200 OK for sample image.");
      // Logger.log(`   Sample response: ${testImageResponseText.substring(0, 200)}...`); // Optional: log part of response
      return true;
    } else {
      Logger.log(`❌ Test image analysis failed. Code: ${testImageResponseCode}, Response: ${testImageResponseText.substring(0,500)}`);
      Logger.log("   Troubleshooting: Check API enablement, billing, quotas, and API key restrictions in Google Cloud Console.");
      return false;
    }
    
  } catch (error) {
    Logger.log(`❌ EXCEPTION during Vision API setup verification: ${error.toString()}`);
    if (error.message.includes(VISION_API_KEY_PROPERTY)) {
       Logger.log(`   Ensure '${VISION_API_KEY_PROPERTY}' is correctly set in Project Settings > Script Properties.`);
    }
    console.error("Vision API setup verification failed:", error);
    return false;
  }
}


/**
 * Provides troubleshooting steps for common Vision API errors, particularly 403.
 */
function troubleshootVisionApiError() {
  Logger.log("=== Vision API Troubleshooting Guide ===\n");
  Logger.log("Common causes for Vision API errors (especially 403 Forbidden or permission denied):\n");
  Logger.log("1. **Cloud Vision API Not Enabled**: ");
  Logger.log("   - Go to Google Cloud Console: https://console.cloud.google.com/");
  Logger.log("   - Select the correct project.");
  Logger.log("   - Navigate to 'APIs & Services' > 'Library'.");
  Logger.log("   - Search for 'Cloud Vision API' and ensure it is 'Enabled'.\n");
  Logger.log("2. **Billing Not Enabled or Account Issue**: ");
  Logger.log("   - Vision API requires a billing account, even for the free tier.");
  Logger.log("   - In Cloud Console, go to 'Billing'. Ensure your project is linked to an active billing account with a valid payment method.\n");
  Logger.log("3. **API Key Issues**: ");
  Logger.log(`   - Ensure the key stored in Script Properties under '${VISION_API_KEY_PROPERTY}' is exactly correct (no extra spaces, etc.).`);
  Logger.log("   - API Key Restrictions: In Cloud Console > 'APIs & Services' > 'Credentials', select your API key.");
  Logger.log("     - 'API restrictions': Ensure 'Cloud Vision API' is allowed. 'Don't restrict key' is easiest for testing, then restrict as needed.");
  Logger.log("     - 'Application restrictions': For Apps Script (server-side), 'None' or specific IP addresses (if your script has static outbound IPs, rare for Apps Script) might be needed. 'HTTP referrers' is for client-side usage.\n");
  Logger.log("4. **Incorrect Google Cloud Project**: ");
  Logger.log("   - The API key must belong to the Google Cloud Project where Vision API is enabled and billing is set up.\n");
  Logger.log("5. **Organization Policies**: ");
  Logger.log("   - If using a Google Workspace account, organizational policies might restrict API usage. Check with your Workspace administrator.\n");
  
  Logger.log("🔧 Quick Checks & Fixes to Try:");
  Logger.log("   A. Run `verifyVisionApiSetup()` from the Apps Script editor for an automated check.");
  Logger.log(`   B. Double-check the value of '${VISION_API_KEY_PROPERTY}' in File > Project Properties > Script Properties.`);
  Logger.log("   C. Try creating a new, unrestricted API key in the correct Google Cloud Project and update it in Script Properties.");
  Logger.log("   D. Check the Google Cloud Console for any notifications or errors related to your project, billing, or the Vision API service status.\n");
  Logger.log("If issues persist, review the detailed error message from the logs when `analyzeImageWithVisionImproved` fails.");
}

/**
 * Checks if the Vision API quota might have been exceeded by making a minimal request.
 * @returns {boolean|null} True if quota seems available, false if quota exceeded (429), null for other errors.
 */
function checkVisionApiQuota() {
  Logger.log("=== Vision API Quota Check (Simplified) ===\n");
  try {
    const apiKey = getVisionApiKey();
    // A minimal request to check for 429 (Too Many Requests)
    const payload = { requests: [{ image: { content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=' }, features: [{ type: 'TYPE_UNSPECIFIED' }] }] }; // Minimal valid-ish request
    const options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    // Adding quotaUser to a test call can sometimes help isolate project-based quotas, but not strictly necessary for just checking 429
    // const response = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}&quotaUser=apps-script-quota-check`, options);
    const response = UrlFetchApp.fetch(`${VISION_API_ENDPOINT}?key=${apiKey}`, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      Logger.log("✅ Vision API quota seems available (received 200 OK for minimal request).");
      return true;
    } else if (responseCode === 429) {
      Logger.log("❌ Vision API quota likely exceeded (HTTP 429 - Too Many Requests). Check Google Cloud Console for usage details.");
      return false;
    } else if (responseCode === 403) {
      Logger.log(`❌ Vision API access denied (HTTP 403). This is likely an auth/permission issue, not quota. Details: ${response.getContentText().substring(0,300)}`);
      return null; // Indicates an issue other than quota
    } else {
      Logger.log(`⚠️ Unexpected response code during quota check: ${responseCode}. Response: ${response.getContentText().substring(0,300)}`);
      return null; // Undetermined
    }
  } catch (error) {
    Logger.log(`Error checking Vision API quota: ${error.toString()}`);
    console.error("Error checking Vision API quota:", error);
    return null;
  }
}

/**
 * Tests Vision API integration with a sample image from Box.
 */
function testVisionApiIntegration() {
  Logger.log("=== Testing Full Vision API Integration with a Box Image ===\n");
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ Box access token not available. Cannot proceed with Box image test.");
    return;
  }

  try {
    Logger.log("1. Verifying Vision API general setup...");
    if (!verifyVisionApiSetup()) {
      Logger.log("❌ Vision API general setup verification failed. See previous logs for details. Aborting full integration test.");
      return;
    }
    Logger.log("✅ Vision API general setup seems OK.\n");
    
    Logger.log(`2. Finding a test image from Box folder: ${ACTIVE_TEST_FOLDER_ID}...`); // ACTIVE_TEST_FOLDER_ID from Config.gs
    // Fetch a single image file for testing
    const folderItemsUrl = `${BOX_API_BASE_URL}/folders/${ACTIVE_TEST_FOLDER_ID}/items?limit=10&fields=id,name,type,size`;
    const folderOptions = { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true };
    const folderResponse = UrlFetchApp.fetch(folderItemsUrl, folderOptions);

    if (folderResponse.getResponseCode() !== 200) {
        Logger.log(`❌ Could not list items in test folder ${ACTIVE_TEST_FOLDER_ID}. Code: ${folderResponse.getResponseCode()}`);
        return;
    }
    const folderData = JSON.parse(folderResponse.getContentText());
    const testImageFileEntry = folderData.entries.find(item => item.type === 'file' && isImageFile(item.name) && item.size > 0 && item.size < MAX_VISION_API_FILE_SIZE_BYTES);

    if (!testImageFileEntry) {
      Logger.log(`❌ No suitable test image found in folder ${ACTIVE_TEST_FOLDER_ID} (or files are too large/small). Please add a small image to this folder.`);
      return;
    }
    Logger.log(`📸 Found test image: ${testImageFileEntry.name} (ID: ${testImageFileEntry.id}, Size: ${testImageFileEntry.size} bytes).\n`);
    
    Logger.log(`3. Analyzing '${testImageFileEntry.name}' with Vision API...`);
    const visionResult = analyzeImageWithVisionImproved(testImageFileEntry.id, accessToken);
    
    if (visionResult && !visionResult.error) {
      Logger.log("✅ Vision API analysis successful for Box image!");
      Logger.log(`   Detected Labels: ${visionResult.labels ? visionResult.labels.length : 0}`);
      Logger.log(`   Detected Objects: ${visionResult.objects ? visionResult.objects.length : 0}`);
      Logger.log(`   Extracted Text Length: ${visionResult.text ? visionResult.text.length : 0}`);
      Logger.log(`   Dominant Colors Found: ${visionResult.dominantColors ? visionResult.dominantColors.length : 0}`);
      Logger.log(`   Average Label Confidence: ${visionResult.confidenceScore || 'N/A'}`);
      // Logger.log(`   Raw Vision Result (sample): ${JSON.stringify(visionResult).substring(0, 300)}...`);
      if (visionResult.labels && visionResult.labels.length > 0) {
        Logger.log(`   Top 3 Labels: ${visionResult.labels.slice(0,3).map(l=>l.description).join(', ')}`);
      }
       if (visionResult.text) {
        Logger.log(`   Extracted Text (sample): "${visionResult.text.substring(0, 100)}${visionResult.text.length > 100 ? '...' : ''}"`);
      }
    } else {
      Logger.log("❌ Vision API analysis FAILED for the Box image.");
      Logger.log(`   Error Type: ${visionResult ? visionResult.error : 'Unknown'}`);
      Logger.log(`   Message: ${visionResult ? (visionResult.message || JSON.stringify(visionResult.details)) : 'No details'}`);
      return;
    }

    Logger.log("\n4. Testing EXIF extraction for the same image...");
    const exifResult = extractExifData(testImageFileEntry.id, accessToken);
    if (exifResult) {
      Logger.log("✅ EXIF extraction attempt completed.");
      Logger.log(`   Has EXIF Data: ${exifResult.hasExif}`);
      if (exifResult.hasExif) {
        Logger.log(`   Camera Model (Simplified): ${exifResult.cameraModel || 'Not detected/parsed'}`);
      }
    } else {
      Logger.log("⚠️ EXIF extraction function returned null (may indicate an issue or non-JPEG image).");
    }
    
    Logger.log("\n🎉 Full Vision API and EXIF integration test with Box image complete!");
    Logger.log("If all checks are green, you should be able to run `processBoxImagesEnhanced()` for full processing.");
    
  } catch (error) {
    Logger.log(`❌ EXCEPTION during full Vision API integration test: ${error.toString()}`);
    console.error("Full Vision API integration test failed:", error);
  }
}


/**
 * Generates a summary report of image processing status, focusing on enhanced/AI metadata.
 */
function getEnhancedProcessingSummary() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: getEnhancedProcessingSummary - Failed to get valid access token.");
    return;
  }
  
  try {
    Logger.log("=== Enhanced Processing (AI) Summary ===\n");
    
    const allImages = findAllImageFiles(DEFAULT_PROCESSING_FOLDER_ID, accessToken); // Scan from root
    Logger.log(`📁 Total image files found (scanned from root): ${allImages.length}`);
    
    if (allImages.length === 0) {
      Logger.log("No image files found.");
      return;
    }
    
    const sampleSize = Math.min(50, allImages.length); // Configurable sample size
    const imagesToAnalyze = allImages.slice(0, sampleSize);
    
    let aiAnalyzedCount = 0;
    let filesWithAIDetectedObjects = 0;
    let filesWithAIExtractedText = 0;
    let filesWithAIDominantColors = 0;
    let sumAIConfidenceScore = 0;
    let countAIConfidenceScores = 0;
    const processingStages = {};
    
    Logger.log(`📋 Analyzing metadata for a sample of ${imagesToAnalyze.length} files (template: ${BOX_METADATA_TEMPLATE_KEY})...\n`);
    
    imagesToAnalyze.forEach(image => {
      const metadata = getCurrentMetadata(image.id, accessToken, BOX_METADATA_TEMPLATE_KEY);
      if (metadata) {
        const stage = metadata.processingStage || 'unknown';
        processingStages[stage] = (processingStages[stage] || 0) + 1;
        
        if (stage === PROCESSING_STAGE_AI) { // From Config.gs
          aiAnalyzedCount++;
          if (metadata.aiDetectedObjects && metadata.aiDetectedObjects.length > 0) filesWithAIDetectedObjects++;
          if (metadata.extractedText && metadata.extractedText.length > 0) filesWithAIExtractedText++;
          if (metadata.dominantColors && metadata.dominantColors.length > 0) filesWithAIDominantColors++;
          if (typeof metadata.aiConfidenceScore === 'number') { // Check if it's a number
            sumAIConfidenceScore += metadata.aiConfidenceScore;
            countAIConfidenceScores++;
          }
        }
      }
    });
    
    Logger.log("📈 Processing Stages (from sample):");
    Object.entries(processingStages).forEach(([stage, count]) => Logger.log(`   ${stage}: ${count}`));
    
    if (aiAnalyzedCount > 0) {
      const avgConfidence = countAIConfidenceScores > 0 ? Math.round((sumAIConfidenceScore / countAIConfidenceScores) * 100) / 100 : 'N/A';
      Logger.log(`\n🤖 AI Analysis Results (for ${aiAnalyzedCount} 'ai_analyzed' files in sample):`);
      Logger.log(`   Files with AI Detected Objects: ${filesWithAIDetectedObjects}`);
      Logger.log(`   Files with AI Extracted Text: ${filesWithAIExtractedText}`);
      Logger.log(`   Files with AI Dominant Colors: ${filesWithAIDominantColors}`);
      Logger.log(`   Average AI Label Confidence Score: ${avgConfidence}`);
    } else {
      Logger.log("\nNo files found with 'ai_analyzed' stage in the current sample.");
    }
    
    Logger.log("\n💡 Next Steps & Recommendations:");
    if (processingStages[PROCESSING_STAGE_UNPROCESSED] > 0 || processingStages[PROCESSING_STAGE_BASIC] > 0 || processingStages[PROCESSING_STAGE_EXIF] > 0) {
      Logger.log("   📌 Run `processBoxImagesEnhanced()` to analyze more images with EXIF & Vision API.");
    }
    if (aiAnalyzedCount === 0 && (processingStages[PROCESSING_STAGE_UNPROCESSED] > 0 || processingStages[PROCESSING_STAGE_BASIC] > 0)) {
      Logger.log("   📌 Run `testVisionApiIntegration()` if you haven't already, to ensure Vision API is correctly set up.");
    } else if (aiAnalyzedCount > 0) {
       Logger.log("   🎉 AI processing appears to be working for some files!");
    }
    
  } catch (error) {
    Logger.log(`Error getting enhanced processing summary: ${error.toString()}`);
    console.error("Error getting enhanced processing stats:", error);
  }
}


/**
 * Processes a single image from the ACTIVE_TEST_FOLDER_ID for quick testing of the full enhanced pipeline.
 * Corrected to remove setTimeout.
 */
function testSingleImageProcessing() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log(`ERROR: ${arguments.callee.name} - Failed to get valid access token.`);
    return;
  }
  
  Logger.log(`🧪 Testing single image processing with enhanced pipeline (EXIF & Vision)...`);
  Logger.log(`📁 Using test folder: ${ACTIVE_TEST_FOLDER_ID}`); // From Config.gs
  
  try {
    const folderItemsUrl = `${BOX_API_BASE_URL}/folders/${ACTIVE_TEST_FOLDER_ID}/items?limit=10&fields=id,name,type,size`;
    const folderOptions = { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true };
    const folderResponse = UrlFetchApp.fetch(folderItemsUrl, folderOptions);

    if (folderResponse.getResponseCode() !== 200) {
        Logger.log(`❌ Could not list items in test folder ${ACTIVE_TEST_FOLDER_ID}. Code: ${folderResponse.getResponseCode()}`);
        return;
    }
    const folderData = JSON.parse(folderResponse.getContentText());
    
    // Find first suitable image (not too big, actually an image)
    let testImageEntry = folderData.entries.find(item => 
        item.type === 'file' && 
        isImageFile(item.name) &&
        item.size > 0 && // Not empty
        item.size < MAX_VISION_API_FILE_SIZE_BYTES * 1.1 // Not excessively large
    );

    if (!testImageEntry) {
      Logger.log(`No suitable unprocessed or partially processed image found in folder ${ACTIVE_TEST_FOLDER_ID} for testing. Trying the first available image.`);
      testImageEntry = folderData.entries.find(item => item.type === 'file' && isImageFile(item.name));
      if (!testImageEntry) {
          Logger.log(`No image files at all found in folder ${ACTIVE_TEST_FOLDER_ID}. Aborting test.`);
          return;
      }
      Logger.log(`Warning: Using first available image '${testImageEntry.name}', which might already be fully processed.`);
    }
    
    Logger.log(`🎯 Testing with: ${testImageEntry.name} (ID: ${testImageEntry.id}, Size: ${testImageEntry.size} bytes)`);
    
    // Call the enhanced processing function for this single file entry
    processImageFileEnhanced(testImageEntry, accessToken); 
    
    Logger.log("✅ Single image enhanced processing attempt complete!");
    
    // Fetch and display the results immediately
    Logger.log("\n📊 Fetching and displaying updated metadata for the test image...");
    const updatedMetadata = getCurrentMetadata(testImageEntry.id, accessToken); // From BoxFileOperations.gs
    
    if (updatedMetadata) {
      Logger.log("--- Updated Metadata ---");
      Logger.log(`  File Name: ${updatedMetadata.originalFilename || testImageEntry.name}`);
      Logger.log(`  Processing Stage: ${updatedMetadata.processingStage || 'unknown'}`);
      Logger.log(`  Processing Version: ${updatedMetadata.processingVersion || 'N/A'}`);
      Logger.log(`  Last Processed: ${updatedMetadata.lastProcessedDate || 'N/A'}`);
      Logger.log(`  Camera Model: ${updatedMetadata.cameraModel || 'N/A (or not JPEG)'}`);
      Logger.log(`  AI Scene Description: ${updatedMetadata.aiSceneDescription || 'N/A'}`);
      Logger.log(`  AI Detected Objects: ${updatedMetadata.aiDetectedObjects ? updatedMetadata.aiDetectedObjects.split(';').length : 0} found`);
      Logger.log(`  AI Extracted Text Length: ${updatedMetadata.extractedText ? updatedMetadata.extractedText.length : 0} chars`);
      Logger.log(`  AI Dominant Colors: ${updatedMetadata.dominantColors || 'N/A'}`);
      Logger.log(`  AI Confidence Score: ${updatedMetadata.aiConfidenceScore || 'N/A'}`);
      Logger.log(`  Needs Review: ${updatedMetadata.needsReview || 'N/A'}`);
      Logger.log(`  Notes: ${updatedMetadata.notes || ''}`);
      Logger.log("----------------------");
    } else {
      Logger.log("⚠️ Could not retrieve updated metadata for the test image immediately after processing.");
    }
    
  } catch (error) {
    Logger.log(`Error in single image test (testSingleImageProcessing): ${error.toString()}`);
    console.error("Error in single image test:", error);
  }
}


/**
 * Shows a summary of processing for images within the ACTIVE_TEST_FOLDER_ID.
 */
function showTestFolderSummary() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log(`ERROR: ${arguments.callee.name} - Failed to get valid access token.`);
    return;
  }
  
  Logger.log(`=== Test Folder Processing Summary for Folder: ${ACTIVE_TEST_FOLDER_ID} ===\n`);
  
  try {
    const folderItemsUrl = `${BOX_API_BASE_URL}/folders/${ACTIVE_TEST_FOLDER_ID}/items?limit=${DEFAULT_API_ITEM_LIMIT}&fields=id,name,type`;
    const folderOptions = { headers: { 'Authorization': `Bearer ${accessToken}` }, muteHttpExceptions: true };
    const folderResponse = UrlFetchApp.fetch(folderItemsUrl, folderOptions);

    if (folderResponse.getResponseCode() !== 200) {
      Logger.log(`❌ Failed to list items in test folder ${ACTIVE_TEST_FOLDER_ID}. Code: ${folderResponse.getResponseCode()}`);
      return;
    }
    
    const folderData = JSON.parse(folderResponse.getContentText());
    const imageFiles = folderData.entries.filter(item => item.type === 'file' && isImageFile(item.name));
    
    Logger.log(`📸 Total image files in folder ${ACTIVE_TEST_FOLDER_ID}: ${imageFiles.length}`);
    if (imageFiles.length === 0) {
      Logger.log("No images found to summarize.");
      return;
    }
    
    Logger.log("\n📋 Analyzing metadata for all images in this test folder...\n");
    
    let filesWithAnyMetadata = 0;
    const stageCounts = {};
    const aiResultsSummary = {
      analyzed: 0, objects: 0, text: 0, colors: 0, totalConfidence: 0, confidenceCount: 0
    };

    imageFiles.forEach((image, index) => {
      // Logger.log(`Checking ${index + 1}. ${image.name}`);
      const metadata = getCurrentMetadata(image.id, accessToken, BOX_METADATA_TEMPLATE_KEY);
      if (metadata) {
        filesWithAnyMetadata++;
        const stage = metadata.processingStage || 'unknown';
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
        
        if (stage === PROCESSING_STAGE_AI) {
          aiResultsSummary.analyzed++;
          if (metadata.aiDetectedObjects) aiResultsSummary.objects++;
          if (metadata.extractedText) aiResultsSummary.text++;
          if (metadata.dominantColors) aiResultsSummary.colors++;
          if (typeof metadata.aiConfidenceScore === 'number') {
            aiResultsSummary.totalConfidence += metadata.aiConfidenceScore;
            aiResultsSummary.confidenceCount++;
          }
        }
        // Simple log per file for test folder
        // Logger.log(`   ${image.name} - Stage: ${stage}, AI Objects: ${metadata.aiDetectedObjects ? metadata.aiDetectedObjects.split(';').length : 'N/A'}`);
      } else {
        // Logger.log(`   ${image.name} - No '${BOX_METADATA_TEMPLATE_KEY}' metadata found.`);
         stageCounts['no_metadata'] = (stageCounts['no_metadata'] || 0) + 1;
      }
    });
    
    const processedPercentage = imageFiles.length > 0 ? Math.round((filesWithAnyMetadata / imageFiles.length) * 100) : 0;
    
    Logger.log(`\n📊 Summary for Folder ${ACTIVE_TEST_FOLDER_ID}:`);
    Logger.log(`   Files with '${BOX_METADATA_TEMPLATE_KEY}' metadata: ${filesWithAnyMetadata} / ${imageFiles.length} (${processedPercentage}%)`);
    
    Logger.log("\n📈 Processing Stages Distribution:");
    Object.entries(stageCounts).forEach(([stage, count]) => Logger.log(`   ${stage}: ${count}`));
    
    if (aiResultsSummary.analyzed > 0) {
      const avgConfidence = aiResultsSummary.confidenceCount > 0 ? Math.round((aiResultsSummary.totalConfidence / aiResultsSummary.confidenceCount) * 100) / 100 : 'N/A';
      Logger.log(`\n🤖 AI Analysis Results (for ${aiResultsSummary.analyzed} 'ai_analyzed' files):`);
      Logger.log(`   Images with AI Detected Objects: ${aiResultsSummary.objects}`);
      Logger.log(`   Images with AI Extracted Text: ${aiResultsSummary.text}`);
      Logger.log(`   Images with AI Dominant Colors: ${aiResultsSummary.colors}`);
      Logger.log(`   Average AI Label Confidence: ${avgConfidence}`);
    }
    
    Logger.log("\n💡 Next Steps for this Test Folder:");
    if (stageCounts['no_metadata'] > 0 || stageCounts[PROCESSING_STAGE_UNPROCESSED] > 0) {
      Logger.log("   📌 Run `attachTemplateToAllImages(getValidAccessToken())` if templates are missing.");
      Logger.log("   📌 Run `processBoxImagesEnhanced()` to process these files.");
    } else if (stageCounts[PROCESSING_STAGE_BASIC] > 0 || stageCounts[PROCESSING_STAGE_EXIF] > 0) {
      Logger.log("   📌 Run `processBoxImagesEnhanced()` to apply AI analysis.");
    } else if (aiResultsSummary.analyzed === imageFiles.length && imageFiles.length > 0) {
       Logger.log("   🎉 All images in the test folder appear to be AI analyzed!");
    }
    Logger.log("   📌 Use `testSingleImageProcessing()` to re-process a specific image if needed.");

  } catch (error) {
    Logger.log(`Error getting test folder summary: ${error.toString()}`);
    console.error("Error getting test folder summary:", error);
  }
}