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