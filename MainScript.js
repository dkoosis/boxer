// File: MainScript.gs
// Main orchestrator for Box Image Metadata Processing System
// Uses Bruce McPherson's cGoa and cUseful libraries for robust operations
// Depends on: Config.gs, BoxAuth.gs, BoxMetadataTemplates.gs, BoxFileOperations.gs, MetadataExtraction.gs
/**
 * Boxer is a simple-as-possible Google Apps Script that periodically sweeps through our box.com storage and attempts 
 * to add useful metadata to media assets, primarily image files. This is a utility for my personal use within a 200 person 
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
    const foldersToProcess = [Config.ACTIVE_TEST_FOLDER_ID];
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
  Logger.log(`⚠️  Note: This uses Google Vision API quota. Max file size: ${Config.MAX_VISION_API_FILE_SIZE_BYTES/(1024*1024)}MB`);
  
  try {
    // Verify Vision API setup
    if (!verifyVisionApiSetup()) {
      Logger.log("❌ Vision API setup verification failed. Proceeding with limited functionality.");
    } else {
      Logger.log("✅ Vision API setup verified");
    }
    
    const foldersToProcess = [Config.ACTIVE_TEST_FOLDER_ID];
    
    foldersToProcess.forEach(folderId => {
      Logger.log(`Enhanced processing for folder ID: ${folderId}`);
      
      const listUrl = `${Config.BOX_API_BASE_URL}/folders/${folderId}/items?limit=${Config.DEFAULT_API_ITEM_LIMIT}&fields=id,name,type,size`;
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
        if (fileEntry.size > Config.MAX_VISION_API_FILE_SIZE_BYTES * 1.2) {
          Logger.log(`Skipping ${fileEntry.name} (${Math.round(fileEntry.size/(1024*1024))}MB) - too large for Vision API`);
          continue;
        }

        processImageFileEnhanced(fileEntry, accessToken);
        processedInBatch++;
        
        // Rate limiting
        if (i < imageFileEntries.length - 1) {
          if (processedInBatch % Config.ENHANCED_PROCESSING_BATCH_SIZE === 0) {
            Logger.log(`Pausing ${Config.ENHANCED_PROCESSING_BATCH_DELAY_MS / 1000}s after batch of ${Config.ENHANCED_PROCESSING_BATCH_SIZE}`);
            Utilities.sleep(Config.ENHANCED_PROCESSING_BATCH_DELAY_MS);
            processedInBatch = 0;
          } else {
            Utilities.sleep(Config.ENHANCED_PROCESSING_FILE_DELAY_MS);
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
    const currentStage = currentMetadata ? currentMetadata.processingStage : Config.PROCESSING_STAGE_UNPROCESSED;
    
    // Skip if already fully processed
    if (currentStage === Config.PROCESSING_STAGE_AI || currentStage === Config.PROCESSING_STAGE_COMPLETE) {
      return;
    }
    
    // Fetch full file details
    const fileDetailsUrl = `${Config.BOX_API_BASE_URL}/files/${fileEntry.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
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
    if (fileDetails.size > Config.MAX_VISION_API_FILE_SIZE_BYTES * 1.2) {
      Logger.log(`Skipping ${fileDetails.name} - file too large for Vision API`);
      return;
    }
    
    // Extract enhanced metadata
    const enhancedMetadata = MetadataExtraction.extractEnhancedMetadata(fileDetails, accessToken);
    
    // Apply metadata
    const success = BoxFileOperations.applyMetadata(fileDetails.id, enhancedMetadata, accessToken);
    
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
  Logger.log(`   • Template '${Config.BOX_METADATA_TEMPLATE_KEY}' is attached to image files`);
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
    
    const allImages = BoxFileOperations.findAllImageFiles(Config.DEFAULT_PROCESSING_FOLDER_ID, accessToken);
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
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken, Config.BOX_METADATA_TEMPLATE_KEY);
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
    if (processingStages[Config.PROCESSING_STAGE_UNPROCESSED] > 0) {
      Logger.log("   📌 Run processBoxImages() for basic metadata extraction");
    }
    if (processingStages[Config.PROCESSING_STAGE_BASIC] > 0) {
      Logger.log("   📌 Run processBoxImagesEnhanced() for AI analysis");
    }
    
  } catch (error) {
    Logger.log(`Error getting processing summary: ${error.toString()}`);
    console.error("Error getting processing stats:", error);
  }
}