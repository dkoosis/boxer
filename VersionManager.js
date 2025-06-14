// File: VersionManager.js
// Script version management utilities.

const VersionManager = (function() {
  'use strict';
  
  const ns = {};

  /**
   * Display current script version information
   */
  ns.showCurrentVersion = function() {
    const versionInfo = {
      scriptVersion: ConfigManager.getCurrentVersion()
    };
    
    Logger.log('=== 🐕 Boxer Version Information ===');
    Logger.log(`Script Version: ${versionInfo.scriptVersion}`);
    Logger.log('===================================');
    
    return versionInfo;
  };

  /**
   * Analyze version distribution across processed files
   * @param {string} accessToken A valid Box access token.
   */
  ns.analyzeVersionDistribution = function(accessToken) {
    if (!accessToken) {
      Logger.log('❌ No access token available for version analysis.');
      return null;
    }
    
    Logger.log('=== 🔍 Boxer Version Distribution Analysis ===\n');
    
    try {
      const imageExtensions = ConfigManager.IMAGE_EXTENSIONS;
      const searchQueries = imageExtensions.map(ext => `type:file ${ext}`);
      const versionCounts = {};
      let totalProcessed = 0;
      let totalUnprocessed = 0;
      let needsUpdate = 0;
      
      const currentVersion = ConfigManager.getCurrentVersion();
      
      Logger.log(`🎯 Current script version: ${currentVersion}`);
      Logger.log('🔍 Analyzing file versions and processing stages...\n');
      
      searchQueries.forEach(query => {
        try {
          const searchUrl = `${ConfigManager.BOX_API_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=200&fields=id,name`;
          
          const response = UrlFetchApp.fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            muteHttpExceptions: true
          });
          
          if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());
            
            data.entries.forEach(file => {
              if (ConfigManager.isImageFile(file.name)) {
                const metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
                
                if (metadata) {
                  totalProcessed++;
                  const fileVersion = metadata.processingVersion || 'unknown';
                  versionCounts[fileVersion] = (versionCounts[fileVersion] || 0) + 1;
                  
                  const finalStages = [ConfigManager.PROCESSING_STAGE_AI, ConfigManager.PROCESSING_STAGE_COMPLETE, 'human_reviewed'];
                  if (!finalStages.includes(metadata.processingStage)) {
                    needsUpdate++;
                  }
                } else {
                  totalUnprocessed++;
                }
              }
            });
          }
          Utilities.sleep(200); // Rate limiting
        } catch (error) {
          Logger.log(`Error searching ${query}: ${error.toString()}`);
        }
      });
      
      // Display results
      Logger.log('📊 ANALYSIS RESULTS:');
      Logger.log(`Total processed files: ${totalProcessed}`);
      Logger.log(`Total unprocessed files: ${totalUnprocessed}`);
      Logger.log(`Files needing update (incomplete stage): ${needsUpdate}\n`);
      
      if (Object.keys(versionCounts).length > 0) {
        Logger.log('🏷️ VERSION DISTRIBUTION:');
        Object.keys(versionCounts)
          .sort((a, b) => versionCounts[b] - versionCounts[a])
          .forEach(version => {
            const count = versionCounts[version];
            Logger.log(`  ${version}: ${count} files`);
          });
      }
      
      Logger.log('\n💡 RECOMMENDATIONS:');
      if (needsUpdate > 0) {
        Logger.log(`🦴 Run update processing for ${needsUpdate} incompletely processed files.`);
        Logger.log('   Use: BoxerApp.updateOutdatedFiles()');
      }
      if (totalUnprocessed > 0) {
        Logger.log(`📦 Process ${totalUnprocessed} unprocessed files.`);
      }
      if (needsUpdate === 0 && totalUnprocessed === 0) {
        Logger.log('🎉 All files appear to be fully processed!');
      }
      
      return {
        currentVersion,
        totalProcessed,
        totalUnprocessed,
        needsUpdate,
        versionDistribution: versionCounts
      };
      
    } catch (error) {
      Logger.log(`❌ Error analyzing versions: ${error.toString()}`);
      return null;
    }
  };

  /**
   * Process files that are incompletely processed.
   * @param {string} accessToken A valid Box access token.
   * @param {number} maxFiles The maximum number of files to process in this run.
   */
  ns.processOutdatedFiles = function(accessToken, maxFiles = 25) {
    Logger.log('🔄 Processing files with incomplete stages...');
    Logger.log(`Maximum files to process: ${maxFiles}`);
    
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    try {
      const imageExtensions = ConfigManager.IMAGE_EXTENSIONS;
      const searchQueries = imageExtensions.map(ext => `type:file ${ext}`);
      let processed = 0;
      let skipped = 0;
      let errors = 0;
      
      const finalStages = [ConfigManager.PROCESSING_STAGE_AI, ConfigManager.PROCESSING_STAGE_COMPLETE, 'human_reviewed'];

      for (const query of searchQueries) {
        if (processed >= maxFiles) break;
        
        try {
          const searchUrl = `${ConfigManager.BOX_API_BASE_URL}/search?query=${encodeURIComponent(query)}&limit=100&fields=id,name`;
          
          const response = UrlFetchApp.fetch(searchUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            muteHttpExceptions: true
          });
          
          if (response.getResponseCode() === 200) {
            const data = JSON.parse(response.getContentText());
            
            for (const file of data.entries) {
              if (processed >= maxFiles) break;
              if (!ConfigManager.isImageFile(file.name)) continue;
              
              const metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
              
              // Skip if no metadata or if processing is already complete
              if (!metadata || finalStages.includes(metadata.processingStage)) {
                skipped++;
                continue;
              }
              
              try {
                Logger.log(`🔄 Updating file with stage '${metadata.processingStage}': ${file.name}`);
                
                const result = MetadataExtraction.processSingleImageBasic({ id: file.id, name: file.name }, accessToken);
                
                if (result && result.success !== false) {
                  processed++;
                  Logger.log(`✅ Updated: ${file.name}`);
                } else {
                  errors++;
                  Logger.log(`❌ Failed: ${file.name}`);
                }
                Utilities.sleep(1000); // Rate limiting
                
              } catch (error) {
                errors++;
                Logger.log(`❌ Error processing ${file.name}: ${error.toString()}`);
              }
            }
          }
          Utilities.sleep(200); // Rate limiting between searches
        } catch (error) {
          Logger.log(`Error with search query ${query}: ${error.toString()}`);
        }
      }
      
      Logger.log('\n📊 Processing Summary:');
      Logger.log(`  Files updated: ${processed}`);
      Logger.log(`  Files skipped: ${skipped}`);
      Logger.log(`  Errors: ${errors}`);
      
      if (processed === maxFiles) {
        Logger.log(`⚠️ Reached processing limit of ${maxFiles} files.`);
        Logger.log('💡 Run again to process more files.');
      }
      
      return {
        processed,
        skipped,
        errors,
        reachedLimit: processed === maxFiles
      };
      
    } catch (error) {
      Logger.log(`❌ Error in processOutdatedFiles: ${error.toString()}`);
      return null;
    }
  };

  /**
   * Test version tracking on a single file
   * @param {string} accessToken A valid Box access token.
   * @param {string} fileId The ID of the file to test.
   */
  ns.testVersionTracking = function(accessToken, fileId) {
    Logger.log('=== 🧪 Testing Version & Stage Tracking ===');
    
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return { success: false, error: 'No access token' };
    }
    
    try {
      // Find a test file if not specified
      if (!fileId) {
        const testImages = BoxFileOperations.findAllImageFiles('0', accessToken);
        if (testImages.length === 0) {
          Logger.log('❌ No test images found');
          return { success: false, error: 'No test images found' };
        }
        fileId = testImages[0].id;
        Logger.log(`🎯 Testing with: ${testImages[0].name}`);
      }
      
      Logger.log('🔍 Analyzing current metadata...');
      
      const currentMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken);
      const currentVersion = ConfigManager.getCurrentVersion();
      
      if (currentMetadata) {
        Logger.log('📋 Current Status:');
        Logger.log(`  File version: ${currentMetadata.processingVersion || 'none'}`);
        Logger.log(`  Current script version: ${currentVersion}`);
        Logger.log(`  Processing stage: ${currentMetadata.processingStage || 'unknown'}`);
        
      } else {
        Logger.log('📋 No existing metadata found');
      }
      
      Logger.log('\n🔄 Testing version-aware processing...');
      
      MetadataExtraction.processSingleImageBasic({ id: fileId, name: 'test-file' }, accessToken);
      
      Logger.log('\n🔍 Checking updated metadata...');
      
      const updatedMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken);
      
      if (updatedMetadata) {
        Logger.log('📋 Updated Status:');
        Logger.log(`  New version: ${updatedMetadata.processingVersion || 'none'}`);
        Logger.log(`  New stage: ${updatedMetadata.processingStage || 'none'}`);
        
        Logger.log('\n✅ Version tracking test complete!');
        
        return {
          success: true,
          before: currentMetadata,
          after: updatedMetadata
        };
      } else {
        Logger.log('❌ No metadata found after processing');
        return { success: false, error: 'No metadata after processing' };
      }
      
    } catch (error) {
      Logger.log(`❌ Version tracking test failed: ${error.toString()}`);
      return { success: false, error: error.toString() };
    }
  };

  return ns;
})();