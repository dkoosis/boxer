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

// Add these functions to MainScript.js

/**
 * Lists all processed and unprocessed image files with their status.
 * Provides a comprehensive overview of the current processing state.
 * Boxer is sniffing out all the image files! 🐕
 */
function listAllImageFileStatus() {
  Logger.log("=== 🐕 Boxer's Image File Status Report ===\n");
  Logger.log("🔍 Boxer is sniffing through all the files...");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    // Find all image files
    const allImages = BoxFileOperations.findAllImageFiles(Config.DEFAULT_PROCESSING_FOLDER_ID, accessToken);
    Logger.log(`🐾 Boxer found ${allImages.length} image files to investigate!\n`);
    
    if (allImages.length === 0) {
      Logger.log("🐕 No image files found - Boxer needs more bones to fetch!");
      return;
    }
    
    let processed = [];
    let unprocessed = [];
    let partiallyProcessed = [];
    let errors = [];
    
    const processingStages = {};
    const contentTypes = {};
    
    // Check each file's processing status
    allImages.forEach((image, index) => {
      try {
        const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
        
        if (metadata) {
          const stage = metadata.processingStage || 'unknown';
          const contentType = metadata.contentType || 'unset';
          
          processingStages[stage] = (processingStages[stage] || 0) + 1;
          contentTypes[contentType] = (contentTypes[contentType] || 0) + 1;
          
          const fileInfo = {
            name: image.name,
            id: image.id,
            path: image.path || 'N/A',
            stage: stage,
            contentType: contentType,
            lastProcessed: metadata.lastProcessedDate || 'N/A',
            processingVersion: metadata.processingVersion || 'N/A'
          };
          
          if (stage === Config.PROCESSING_STAGE_COMPLETE || stage === Config.PROCESSING_STAGE_AI) {
            processed.push(fileInfo);
          } else if (stage === Config.PROCESSING_STAGE_UNPROCESSED) {
            unprocessed.push(fileInfo);
          } else {
            partiallyProcessed.push(fileInfo);
          }
        } else {
          unprocessed.push({
            name: image.name,
            id: image.id,
            path: image.path || 'N/A',
            stage: 'no_metadata',
            contentType: 'unknown',
            lastProcessed: 'Never',
            processingVersion: 'N/A'
          });
        }
        
        // Progress indicator for large collections
        if ((index + 1) % 50 === 0) {
          Logger.log(`🐕 Boxer is still working hard: ${index + 1}/${allImages.length} files sniffed`);
        }
        
      } catch (error) {
        errors.push({
          name: image.name,
          id: image.id,
          error: error.toString()
        });
      }
    });
    
    // Summary Statistics
    Logger.log("📊 BOXER'S FETCH REPORT:");
    Logger.log(`✅ Fully Processed (Good boy!): ${processed.length} files`);
    Logger.log(`⏳ Unprocessed (Still need walkies): ${unprocessed.length} files`);
    Logger.log(`🔄 Partially Processed (Boxer's still chewing): ${partiallyProcessed.length} files`);
    Logger.log(`❌ Errors (Oops, dropped the bone): ${errors.length} files\n`);
    
    // Processing Stages Breakdown
    if (Object.keys(processingStages).length > 0) {
      Logger.log("📈 PROCESSING STAGES:");
      Object.entries(processingStages)
        .sort(([,a], [,b]) => b - a)
        .forEach(([stage, count]) => {
          Logger.log(`   ${stage}: ${count} files`);
        });
      Logger.log("");
    }
    
    // Content Types Breakdown
    if (Object.keys(contentTypes).length > 0) {
      Logger.log("🏷️ CONTENT TYPES:");
      Object.entries(contentTypes)
        .sort(([,a], [,b]) => b - a)
        .forEach(([type, count]) => {
          Logger.log(`   ${type}: ${count} files`);
        });
      Logger.log("");
    }
    
    // Sample Unprocessed Files
    if (unprocessed.length > 0) {
      Logger.log("📋 FILES WAITING FOR BOXER'S ATTENTION:");
      unprocessed.slice(0, 10).forEach(file => {
        Logger.log(`   🦴 ${file.name} (${file.path})`);
      });
      if (unprocessed.length > 10) {
        Logger.log(`   🐕 ... and ${unprocessed.length - 10} more treats to fetch!`);
      }
      Logger.log("");
    }
    
    // Sample Processed Files
    if (processed.length > 0) {
      Logger.log("📋 BOXER'S GOOD WORK (proud pup!):");
      processed.slice(0, 5).forEach(file => {
        Logger.log(`   🏆 ${file.name} [${file.contentType}] - ${file.stage}`);
      });
      if (processed.length > 5) {
        Logger.log(`   🐕 ... and ${processed.length - 5} more victories!`);
      }
      Logger.log("");
    }
    
    // Errors
    if (errors.length > 0) {
      Logger.log("❌ FILES WITH ERRORS:");
      errors.forEach(file => {
        Logger.log(`   • ${file.name}: ${file.error}`);
      });
      Logger.log("");
    }
    
    // Recommendations
    Logger.log("💡 BOXER'S TRAINING SUGGESTIONS:");
    const unprocessedCount = unprocessed.length;
    const partialCount = partiallyProcessed.length;
    
    if (unprocessedCount > 0) {
      Logger.log(`🦴 Give Boxer a treat: Run processBoxImagesOptimized() to fetch ${unprocessedCount} unprocessed files`);
    }
    if (partialCount > 0) {
      Logger.log(`🎾 Throw the ball again: Run processBoxImagesEnhanced() to finish ${partialCount} partially processed files`);
    }
    if (unprocessedCount === 0 && partialCount === 0) {
      Logger.log("🐕 Woof! Boxer is the goodest boy - all files are processed! Time for belly rubs! 🎉");
    }
    
    // Return summary for programmatic use
    return {
      total: allImages.length,
      processed: processed.length,
      unprocessed: unprocessed.length,
      partiallyProcessed: partiallyProcessed.length,
      errors: errors.length,
      processingStages: processingStages,
      contentTypes: contentTypes
    };
    
  } catch (error) {
    Logger.log(`❌ Error generating status report: ${error.toString()}`);
    return null;
  }
}

/**
 * Test function that finds and completely processes exactly 3 image files.
 * Demonstrates the full enhanced processing pipeline.
 * Time for Boxer to show off his best tricks! 🐕🎪
 */
function testProcessThreeFiles() {
  Logger.log("=== 🎪 Boxer's Trick Performance: Processing 3 Files ===\n");
  Logger.log("🐕 Boxer is ready to demonstrate his best moves!");
  
  const accessToken = getValidAccessToken();
  if (!accessToken) {
    Logger.log("❌ No access token available");
    return;
  }
  
  try {
    // Verify Vision API setup first
    Logger.log("1. Checking if Boxer has his special vision goggles...");
    const visionSetup = verifyVisionApiSetup();
    if (!visionSetup) {
      Logger.log("⚠️ Boxer's special goggles are missing - proceeding with regular doggy vision");
    } else {
      Logger.log("✅ Boxer's AI goggles are on and ready for enhanced sniffing!");
    }
    
    // Find candidate files for processing
    Logger.log("\n2. Boxer is sniffing around for the perfect files...");
    const allImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
    Logger.log(`Boxer's nose detected ${allImages.length} total images in the yard`);
    
    if (allImages.length === 0) {
      Logger.log("❌ No bones found in the yard! Check your Config.ACTIVE_TEST_FOLDER_ID");
      return;
    }
    
    // Filter to unprocessed or lightly processed files
    const candidateFiles = [];
    for (let i = 0; i < Math.min(allImages.length, 10); i++) { // Check first 10 files
      const image = allImages[i];
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
      const currentStage = metadata ? metadata.processingStage : Config.PROCESSING_STAGE_UNPROCESSED;
      
      // Include files that are unprocessed or only have basic processing
      if (currentStage === Config.PROCESSING_STAGE_UNPROCESSED || 
          currentStage === Config.PROCESSING_STAGE_BASIC ||
          !metadata) {
        
        // Check file size for Vision API compatibility
        if (image.size && image.size < Config.MAX_VISION_API_FILE_SIZE_BYTES) {
          candidateFiles.push({
            ...image,
            currentStage: currentStage
          });
        }
      }
      
      if (candidateFiles.length >= 3) break;
    }
    
    if (candidateFiles.length < 3) {
      Logger.log(`⚠️ Boxer only found ${candidateFiles.length} suitable treats to play with`);
      Logger.log("🐕 Boxer will do his best with what he's got!");
    }
    
    const filesToProcess = candidateFiles.slice(0, 3);
    Logger.log(`\n3. Boxer has selected his favorite ${filesToProcess.length} toys for the show:`);
    
    filesToProcess.forEach((file, index) => {
      const sizeMB = file.size ? Math.round(file.size / (1024 * 1024) * 10) / 10 : 'Unknown';
      Logger.log(`   🎾 ${index + 1}. ${file.name} (${sizeMB}MB) - Current: ${file.currentStage}`);
    });
    
    // Process each file with full enhanced processing
    Logger.log("\n4. 🎪 Showtime! Boxer is performing his best tricks...");
    
    const results = [];
    
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      Logger.log(`\n--- 🎭 Trick ${i + 1}: ${file.name} ---`);
      
      try {
        const startTime = Date.now();
        
        // Get full file details
        const fileDetailsUrl = `${Config.BOX_API_BASE_URL}/files/${file.id}?fields=id,name,size,path_collection,created_at,modified_at,parent`;
        const response = UrlFetchApp.fetch(fileDetailsUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
        
        if (response.getResponseCode() !== 200) {
          throw new Error(`Boxer dropped the ball: HTTP ${response.getResponseCode()}`);
        }
        
        const fileDetails = JSON.parse(response.getContentText());
        
        // Extract enhanced metadata (includes basic, EXIF, and Vision API)
        Logger.log("  🔍 Boxer is sniffing out all the details...");
        const enhancedMetadata = MetadataExtraction.extractEnhancedMetadata(fileDetails, accessToken);
        
        // Apply metadata to file
        Logger.log("  💾 Boxer is burying the treasure in Box...");
        const success = BoxFileOperations.applyMetadata(file.id, enhancedMetadata, accessToken);
        
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        
        if (success) {
          Logger.log(`  ✅ Boxer nailed it! Perfect performance (${processingTime}s)`);
          Logger.log(`     🏆 Stage: ${enhancedMetadata.processingStage}`);
          Logger.log(`     🎯 Content Type: ${enhancedMetadata.contentType}`);
          Logger.log(`     🔍 Subject: ${enhancedMetadata.subject || 'N/A'}`);
          
          if (enhancedMetadata.aiDetectedObjects) {
            const objects = enhancedMetadata.aiDetectedObjects.substring(0, 100);
            Logger.log(`     👁️ Boxer spotted: ${objects}${objects.length === 100 ? '...' : ''}`);
          }
          
          results.push({
            name: file.name,
            success: true,
            processingTime: processingTime,
            finalStage: enhancedMetadata.processingStage,
            contentType: enhancedMetadata.contentType
          });
        } else {
          throw new Error("Boxer couldn't bury the bone properly");
        }
        
        // Add delay between files to avoid rate limits
        if (i < filesToProcess.length - 1) {
          Logger.log("  ⏳ Boxer is taking a quick water break...");
          Utilities.sleep(2000);
        }
        
      } catch (error) {
        Logger.log(`  ❌ Oops! Boxer tripped over his paws: ${error.toString()}`);
        results.push({
          name: file.name,
          success: false,
          error: error.toString()
        });
      }
    }
    
    // Final summary
    Logger.log("\n=== 🎪 BOXER'S PERFORMANCE REVIEW ===");
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    Logger.log(`✅ Successful tricks (good boy!): ${successful.length} files`);
    Logger.log(`❌ Dropped tricks (oops!): ${failed.length} files`);
    
    if (successful.length > 0) {
      Logger.log("\n🏆 Boxer's winning performances:");
      successful.forEach(result => {
        Logger.log(`  🎾 ${result.name} - ${result.finalStage} (${result.processingTime}s)`);
      });
    }
    
    if (failed.length > 0) {
      Logger.log("\n🙈 Tricks that need more practice:");
      failed.forEach(result => {
        Logger.log(`  💔 ${result.name} - ${result.error}`);
      });
    }
    
    if (successful.length === filesToProcess.length) {
      Logger.log("\n🎉 WOOF! Boxer is the champion! All tricks performed perfectly!");
      Logger.log("🦴 Time for treats - your system is ready for the big leagues!");
    } else if (successful.length > 0) {
      Logger.log("\n⚠️ Boxer did pretty well but needs a little more training");
    } else {
      Logger.log("\n❌ Boxer needs to go back to puppy school - check the setup");
    }
    
    return {
      total: filesToProcess.length,
      successful: successful.length,
      failed: failed.length,
      results: results
    };
    
  } catch (error) {
    Logger.log(`❌ Test function error: ${error.toString()}`);
    return null;
  }
}