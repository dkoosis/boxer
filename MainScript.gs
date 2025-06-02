// File: MainScript.gs
// Main orchestrator for Box Image Metadata Processing System
// Uses Bruce McPherson's cGoa and cUseful libraries for robust operations
// Depends on: Config.gs, BoxAuth.gs, BoxMetadataTemplates.gs, BoxFileOperations.gs, MetadataExtraction.gs
/**
 * Boxer is a simple-as-possible Google Apps Script that periodically sweeps through our box.com storage and attempts 
 * to add useful metadata to media assets, primarily mage files. This is a utility for my personal use within a 200 person 
 * organization. I'm aiming for good quality, but do NOT want to invest significant effort in enterprise-level robustness. 
 * It will be run as a Google Apps Script on a timed trigger, a couple times a week.
 */

// ===============================================
// MAIN PROCESSING FUNCTIONS
// ===============================================

/**
 * Main function to trigger basic processing of images in predefined folders.
 * This processes images with basic metadata extraction only.
 */
function processBoxImages() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: processBoxImages - Failed to get valid access token");
    return;
  }
  
  Logger.log("🔄 Starting basic image processing");
  
  try {
    const foldersToProcess = [ACTIVE_TEST_FOLDER_ID];
    MetadataExtraction.processImagesInFoldersBasic(foldersToProcess, accessToken);
    Logger.log("✅ Basic image processing complete");
    
  } catch (error) {
    Logger.log(`Error in basic processing: ${error.toString()}`);
    console.error('Error in basic processing:', error);
  }
}

/**
 * Enhanced processing with EXIF extraction and Vision API analysis.
 * Processes images with comprehensive AI-driven metadata extraction.
 */
function processBoxImagesEnhanced() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: processBoxImagesEnhanced - Failed to get valid access token");
    return;
  }
  
  Logger.log("🔄 Starting ENHANCED image processing (EXIF and Vision API)");
  Logger.log(`⚠️  Note: This uses Google Vision API quota. Max file size: ${MAX_VISION_API_FILE_SIZE_BYTES/(1024*1024)}MB`);
  
  try {
    // Verify Vision API setup
    if (!verifyVisionApiSetup()) {
      Logger.log("❌ Vision API setup verification failed. Proceeding with limited functionality.");
    } else {
      Logger.log("✅ Vision API setup verified");
    }
    
    const foldersToProcess = [ACTIVE_TEST_FOLDER_ID];
    
    foldersToProcess.forEach(folderId => {
      Logger.log(`Enhanced processing for folder ID: ${folderId}`);
      
      const listUrl = `${BOX_API_BASE_URL}/folders/${folderId}/items?limit=${DEFAULT_API_ITEM_LIMIT}&fields=id,name,type,size`;
      const listOptions = { 
        headers: { 'Authorization': `Bearer ${accessToken}` }, 
        muteHttpExceptions: true 
      };
      
      const listResponse = UrlFetchApp.fetch(listUrl, listOptions);
      if (listResponse.getResponseCode() !== 200) {
        Logger.log(`ERROR: Failed to list items in folder ${folderId}`);
        return;
      }
      
      const listData = JSON.parse(listResponse.getContentText());
      const imageFileEntries = listData.entries.filter(item => 
        item.type === 'file' && BoxFileOperations.isImageFile(item.name)
      );
      
      Logger.log(`Found ${imageFileEntries.length} image(s) for enhanced processing`);
      
      let processedInBatch = 0;
      for (let i = 0; i < imageFileEntries.length; i++) {
        const fileEntry = imageFileEntries[i];
        
        // Skip very large files
        if (fileEntry.size > MAX_VISION_API_FILE_SIZE_BYTES * 1.2) {
          Logger.log(`Skipping ${fileEntry.name} (${Math.round(fileEntry.size/(1024*1024))}MB) - too large for Vision API`);
          continue;
        }

        processImageFileEnhanced(fileEntry, accessToken);
        processedInBatch++;
        
        // Rate limiting
        if (i < imageFileEntries.length - 1) {
          if (processedInBatch % ENHANCED_PROCESSING_BATCH_SIZE === 0) {
            Logger.log(`Pausing ${ENHANCED_PROCESSING_BATCH_DELAY_MS / 1000}s after batch of ${ENHANCED_PROCESSING_BATCH_SIZE}`);
            Utilities.sleep(ENHANCED_PROCESSING_BATCH_DELAY_MS);
            processedInBatch = 0;
          } else {
            Utilities.sleep(ENHANCED_PROCESSING_FILE_DELAY_MS);
          }
        }
      }
    });
    
    Logger.log("✅ Enhanced image processing cycle complete");
    
  } catch (error) {
    Logger.log(`Error in enhanced processing: ${error.toString()}`);
    console.error('Error in enhanced processing:', error);
  }
}

// ===============================================
// METADATA APPLICATION FUNCTIONS
// ===============================================

/**
 * Applies metadata to a file with create/update logic.
 * @param {string} fileId Box file ID
 * @param {object} metadata Metadata object to apply
 * @param {string} accessToken Valid Box access token
 * @param {string} templateKey Metadata template key
 * @returns {boolean} Success status
 */
function applyMetadataToFileFixed(fileId, metadata, accessToken, templateKey = BOX_METADATA_TEMPLATE_KEY) {
  if (!accessToken || !fileId || !metadata) {
    Logger.log('ERROR: applyMetadataToFileFixed - all parameters required');
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
    
    if (responseCode === 201) {
      return true;
    } else if (responseCode === 409) {
      // Metadata exists, try update
      return updateMetadataOnFileFixed(fileId, metadata, accessToken, templateKey);
    } else {
      const errorText = response.getContentText();
      Logger.log(`Error applying metadata to ${fileId}. Code: ${responseCode}, Response: ${errorText.substring(0,300)}`);
      return false;
    }
  } catch (error) {
    Logger.log(`Exception applying metadata to ${fileId}: ${error.toString()}`);
    return false;
  }
}

/**
 * Updates existing metadata using JSON Patch operations.
 * @param {string} fileId Box file ID
 * @param {object} metadataToUpdate Metadata updates
 * @param {string} accessToken Valid Box access token
 * @param {string} templateKey Metadata template key
 * @returns {boolean} Success status
 */
function updateMetadataOnFileFixed(fileId, metadataToUpdate, accessToken, templateKey = BOX_METADATA_TEMPLATE_KEY) {
  if (!accessToken || !fileId || !metadataToUpdate) {
    Logger.log('ERROR: updateMetadataOnFileFixed - all parameters required');
    return false;
  }
  
  try {
    const currentMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken, templateKey);
    if (!currentMetadata) {
      Logger.log(`Cannot update metadata for ${fileId}: no current instance found`);
      return false;
    }

    const updates = [];
    
    Object.keys(metadataToUpdate).forEach(key => {
      if (metadataToUpdate.hasOwnProperty(key)) {
        if (currentMetadata.hasOwnProperty(key)) {
          if (JSON.stringify(currentMetadata[key]) !== JSON.stringify(metadataToUpdate[key])) {
            updates.push({ op: 'replace', path: `/${key}`, value: metadataToUpdate[key] });
          }
        } else {
          updates.push({ op: 'add', path: `/${key}`, value: metadataToUpdate[key] });
        }
      }
    });

    if (updates.length === 0) {
      return true; // No changes needed
    }
    
    const url = `${BOX_API_BASE_URL}/files/${fileId}/metadata/${BOX_METADATA_SCOPE}/${templateKey}`;
    const options = {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json-patch+json'
      },
      payload: JSON.stringify(updates),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200 || responseCode === 201) {
      return true;
    } else {
      const errorText = response.getContentText();
      Logger.log(`Error updating metadata for ${fileId}. Code: ${responseCode}, Response: ${errorText.substring(0,300)}`);
      return false;
    }
  } catch (error) {
    Logger.log(`Exception updating metadata for ${fileId}: ${error.toString()}`);
    return false;
  }
}

// ===============================================
// ENHANCED PROCESSING FUNCTIONS
// ===============================================

/**
 * Processes a single image file with enhanced analysis (EXIF, Vision API).
 * @param {object} fileEntry File entry from Box API (id, name)
 * @param {string} accessToken Valid Box access token
 */
function processImageFileEnhanced(fileEntry, accessToken) {
  if (!accessToken || !fileEntry || !fileEntry.id) {
    Logger.log('ERROR: processImageFileEnhanced - fileEntry and accessToken required');
    return;
  }
  
  try {
    const currentMetadata = BoxFileOperations.getCurrentMetadata(fileEntry.id, accessToken);
    const currentStage = currentMetadata ? currentMetadata.processingStage : PROCESSING_STAGE_UNPROCESSED;
    
    // Skip if already fully processed
    if (currentStage === PROCESSING_STAGE_AI || currentStage === PROCESSING_STAGE_COMPLETE) {
      return;
    }
    
    // Fetch full file details
    const fileDetailsUrl = `${BOX_API_BASE_URL}/files/${fileEntry.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
    const detailsOptions = { 
      headers: { 'Authorization': `Bearer ${accessToken}` }, 
      muteHttpExceptions: true 
    };
    const fileDetailsResponse = UrlFetchApp.fetch(fileDetailsUrl, detailsOptions);

    if (fileDetailsResponse.getResponseCode() !== 200) {
      Logger.log(`ERROR: Failed to fetch details for ${fileEntry.name}`);
      return;
    }
    
    const fileDetails = JSON.parse(fileDetailsResponse.getContentText());
    
    // Check file size before processing
    if (fileDetails.size > MAX_VISION_API_FILE_SIZE_BYTES * 1.2) {
      Logger.log(`Skipping ${fileDetails.name} - file too large for Vision API`);
      return;
    }
    
    // Extract enhanced metadata
    const enhancedMetadata = extractEnhancedMetadata(fileDetails, accessToken);
    
    // Apply metadata
    const success = applyMetadataToFileFixed(fileDetails.id, enhancedMetadata, accessToken);
    
    if (success) {
      Logger.log(`✅ Enhanced processing complete: ${fileDetails.name} (Stage: ${enhancedMetadata.processingStage})`);
    } else {
      Logger.log(`❌ Failed enhanced processing: ${fileDetails.name}`);
    }
    
  } catch (error) {
    Logger.log(`EXCEPTION in enhanced processing for ${fileEntry.name}: ${error.toString()}`);
    console.error(`Error in enhanced processing for ${fileEntry.name}:`, error);
  }
}

/**
 * Extracts enhanced metadata combining basic info, EXIF, and Vision API analysis.
 * @param {object} fileDetails Full file details from Box API
 * @param {string} accessToken Valid Box access token
 * @returns {object} Enhanced metadata object
 */
function extractEnhancedMetadata(fileDetails, accessToken) {
  // Start with basic metadata
  const basicMetadata = MetadataExtraction.extractComprehensiveMetadata(fileDetails);
  let combinedMetadata = { ...basicMetadata };

  // Extract EXIF data
  const exifData = extractExifData(fileDetails.id, accessToken);
  if (exifData && exifData.hasExif) {
    combinedMetadata = {
      ...combinedMetadata,
      ...(exifData.cameraModel && { cameraModel: exifData.cameraModel }),
      ...(exifData.dateTaken && { dateTaken: exifData.dateTaken }),
      processingStage: PROCESSING_STAGE_EXIF
    };
  }
  
  // Analyze with Vision API
  const visionAnalysis = analyzeImageWithVisionImproved(fileDetails.id, accessToken);
  
  if (visionAnalysis && !visionAnalysis.error) {
    combinedMetadata = {
      ...combinedMetadata,
      aiDetectedObjects: visionAnalysis.objects ? 
        visionAnalysis.objects.map(obj => `${obj.name} (${obj.confidence})`).join('; ') : '',
      aiSceneDescription: visionAnalysis.sceneDescription || '',
      extractedText: visionAnalysis.text ? 
        visionAnalysis.text.replace(/\n/g, ' ').substring(0, MAX_TEXT_EXTRACTION_LENGTH) : '',
      dominantColors: visionAnalysis.dominantColors ? 
        visionAnalysis.dominantColors.map(c => `${c.rgb} (${c.score}, ${c.pixelFraction})`).join('; ') : '',
      aiConfidenceScore: visionAnalysis.confidenceScore || 0,
      processingStage: PROCESSING_STAGE_AI
    };
    
    // Apply AI-driven content enhancements
    const aiEnhancements = enhanceContentAnalysisWithAI(combinedMetadata, visionAnalysis, fileDetails.name, combinedMetadata.folderPath);
    combinedMetadata = { ...combinedMetadata, ...aiEnhancements };
    
  } else if (visionAnalysis && visionAnalysis.error) {
    Logger.log(`Vision API error for ${fileDetails.name}: ${visionAnalysis.message || visionAnalysis.error}`);
    combinedMetadata.notes = (combinedMetadata.notes ? combinedMetadata.notes + "; " : "") + 
      `Vision API Error: ${visionAnalysis.message || visionAnalysis.error}`;
  }

  // Finalize processing metadata
  combinedMetadata.lastProcessedDate = new Date().toISOString();
  combinedMetadata.processingVersion = PROCESSING_VERSION_ENHANCED;
  
  return combinedMetadata;
}

/**
 * Enhances metadata with AI-driven insights from Vision API.
 * @param {object} basicMetadata Base metadata object
 * @param {object} visionAnalysis Vision API analysis results
 * @param {string} filename Original filename for context
 * @param {string} folderPath Folder path for context
 * @returns {object} Enhanced metadata fields
 */
function enhanceContentAnalysisWithAI(basicMetadata, visionAnalysis, filename, folderPath) {
  const enhancements = {};
  
  if (!visionAnalysis || visionAnalysis.error) {
    return enhancements;
  }

  // Enhanced content type detection using AI labels
  if (visionAnalysis.labels && visionAnalysis.labels.length > 0) {
    const labelsLower = visionAnalysis.labels.map(l => l.description.toLowerCase());
    
    if (labelsLower.some(l => ['sculpture', 'art', 'statue', 'artwork', 'installation', 'painting', 'drawing'].includes(l))) {
      enhancements.contentType = 'artwork';
      if (basicMetadata.importance !== 'critical') enhancements.importance = 'high';
    } else if (labelsLower.some(l => ['person', 'people', 'human face', 'portrait', 'crowd', 'man', 'woman', 'child'].includes(l))) {
      enhancements.contentType = 'team_portrait';
      enhancements.needsReview = 'yes';
    } else if (labelsLower.some(l => ['tool', 'machine', 'equipment', 'vehicle', 'engine', 'machinery'].includes(l))) {
      enhancements.contentType = 'equipment';
      if (!basicMetadata.department || basicMetadata.department === 'general') enhancements.department = 'operations';
    } else if (labelsLower.some(l => ['building', 'room', 'interior', 'architecture', 'house', 'office building', 'factory'].includes(l))) {
      enhancements.contentType = basicMetadata.contentType === 'facility_exterior' ? 'facility_exterior' : 'facility_interior';
    }
  }
  
  // Enhanced subject identification
  if (visionAnalysis.objects && visionAnalysis.objects.length > 0) {
    const primaryObject = visionAnalysis.objects.sort((a,b) => b.confidence - a.confidence)[0];
    if (primaryObject && primaryObject.name) {
      enhancements.subject = primaryObject.name;
    }
  } else if (visionAnalysis.labels && visionAnalysis.labels.length > 0 && !enhancements.subject) {
    enhancements.subject = visionAnalysis.labels[0].description;
  }
  
  // Enhanced keywords with AI data
  const aiKeywordsList = [];
  if (visionAnalysis.labels) {
    visionAnalysis.labels.slice(0, 10).forEach(l => aiKeywordsList.push(l.description.toLowerCase()));
  }
  if (visionAnalysis.objects) {
    visionAnalysis.objects.slice(0, 5).forEach(o => aiKeywordsList.push(o.name.toLowerCase()));
  }
  
  if (aiKeywordsList.length > 0) {
    const existingKeywords = basicMetadata.manualKeywords ? basicMetadata.manualKeywords.split(',').map(k => k.trim()) : [];
    const combinedKeywords = [...new Set([...existingKeywords, ...aiKeywordsList])];
    enhancements.manualKeywords = combinedKeywords.join(', ');
  }
  
  // Detect text-heavy images
  if (visionAnalysis.text && visionAnalysis.text.length > 50) {
    if (basicMetadata.contentType === 'other' || basicMetadata.contentType === 'unknown') {
      enhancements.contentType = 'documentation';
    }
    if (basicMetadata.importance !== 'critical' && basicMetadata.importance !== 'high') {
      enhancements.importance = 'medium';
    }
  }
  
  return enhancements;
}

// ===============================================
// AUTOMATION AND SCHEDULING
// ===============================================

/**
 * Creates a time-driven trigger for automated processing.
 */
function createScheduledTrigger() {
  const triggerFunctionName = 'processBoxImagesEnhanced';

  // Delete existing triggers to avoid duplicates
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === triggerFunctionName) {
      ScriptApp.deleteTrigger(trigger);
      Logger.log(`Deleted existing trigger for ${triggerFunctionName}`);
    }
  });
  
  // Create new trigger
  ScriptApp.newTrigger(triggerFunctionName)
    .timeBased()
    .everyHours(1)
    .create();
    
  Logger.log(`✅ Scheduled trigger created for '${triggerFunctionName}' - runs every hour`);
}

// ===============================================
// SETUP AND REPORTING FUNCTIONS
// ===============================================

/**
 * Complete system setup orchestrator.
 */
function setupComplete() {
  Logger.log("=== Box Comprehensive Image Metadata Setup ===\n");
  
  Logger.log("1. Testing Box API connection...");
  if (!testBoxAccess().success) {
    Logger.log("❌ Box API connection failed. Check OAuth setup. Aborting.");
    return;
  }
  Logger.log("✅ Box API connected successfully\n");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
     Logger.log("❌ Failed to get valid access token. Aborting.");
     return;
  }

  Logger.log("2. Ensuring metadata template exists...");
  const template = getOrCreateImageTemplate(accessToken);
  if (template) {
    Logger.log(`✅ Template ready: ${template.displayName} (Key: ${template.templateKey})`);
    Logger.log(`   Template ID: ${template.id}, Fields: ${template.fields ? template.fields.length : 'N/A'}\n`);
  } else {
    Logger.log("❌ Metadata template setup failed. Aborting.\n");
    return;
  }
  
  Logger.log("3. Attaching template to all image files...");
  BoxFileOperations.attachTemplateToAllImages(accessToken);
  Logger.log("✅ Template attachment complete\n");
  
  Logger.log("4. Setting up automatic processing...");
  createScheduledTrigger();
  Logger.log("✅ Scheduled processing enabled\n");
  
  Logger.log("5. Running initial enhanced processing...");
  processBoxImagesEnhanced();
  
  Logger.log("\n=== Setup Complete! ===");
  Logger.log("🎉 Your comprehensive image metadata system is now active!");
  Logger.log("\n📋 What happens next:");
  Logger.log(`   • Template '${BOX_METADATA_TEMPLATE_KEY}' is attached to image files`);
  Logger.log("   • Enhanced metadata extraction runs automatically every hour");
  Logger.log("   • Images are categorized with AI analysis and technical metadata");
  Logger.log("   • Processing stages track completion status");
  Logger.log("\n🔧 Useful functions:");
  Logger.log("   • processBoxImages() - Basic metadata extraction");
  Logger.log("   • processBoxImagesEnhanced() - Full AI processing");
  Logger.log("   • getImageProcessingSummary() - Processing statistics");
  Logger.log("   • testVisionApiIntegration() - Vision API testing");
}

/**
 * Generates a summary report of basic processing status.
 */
function getImageProcessingSummary() {
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("ERROR: getImageProcessingSummary - Failed to get access token");
    return;
  }
  
  try {
    Logger.log("=== Basic Image Processing Summary ===\n");
    
    const allImages = BoxFileOperations.findAllImageFiles(DEFAULT_PROCESSING_FOLDER_ID, accessToken);
    Logger.log(`📁 Total image files found: ${allImages.length}`);
    
    if (allImages.length === 0) {
      Logger.log("No image files found");
      return;
    }
    
    let withTemplate = 0;
    let withoutTemplate = 0;
    const processingStages = {};
    const contentTypes = {};
    
    const sampleSize = Math.min(100, allImages.length);
    const imagesToAnalyze = allImages.slice(0, sampleSize);
    
    Logger.log(`📋 Analyzing sample of ${imagesToAnalyze.length} files\n`);
    
    imagesToAnalyze.forEach(image => {
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken, BOX_METADATA_TEMPLATE_KEY);
      if (metadata) {
        withTemplate++;
        const stage = metadata.processingStage || 'unknown';
        processingStages[stage] = (processingStages[stage] || 0) + 1;
        
        const contentType = metadata.contentType || 'unset';
        contentTypes[contentType] = (contentTypes[contentType] || 0) + 1;
      } else {
        withoutTemplate++;
      }
    });
    
    const processedPercentage = imagesToAnalyze.length > 0 ? Math.round((withTemplate / imagesToAnalyze.length) * 100) : 0;
    
    Logger.log(`✅ Files with metadata: ${withTemplate} (${processedPercentage}%)`);
    Logger.log(`⏳ Files without metadata: ${withoutTemplate}\n`);
    
    if (withTemplate > 0) {
      Logger.log("📈 Processing Stages:");
      Object.entries(processingStages).forEach(([stage, count]) => Logger.log(`   ${stage}: ${count}`));
      
      Logger.log("\n🏷️ Content Types:");
      Object.entries(contentTypes).forEach(([type, count]) => Logger.log(`   ${type}: ${count}`));
    }
    
    Logger.log("\n💡 Recommendations:");
    if (withoutTemplate > 0) {
      Logger.log("   📌 Run BoxFileOperations.attachTemplateToAllImages() to attach templates");
    }
    if (processingStages[PROCESSING_STAGE_UNPROCESSED] > 0) {
      Logger.log("   📌 Run processBoxImages() for basic metadata extraction");
    }
    if (processingStages[PROCESSING_STAGE_BASIC] > 0) {
      Logger.log("   📌 Run processBoxImagesEnhanced() for AI analysis");
    }
    
  } catch (error) {
    Logger.log(`Error getting processing summary: ${error.toString()}`);
    console.error("Error getting processing stats:", error);
  }
}