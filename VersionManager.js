// File: VersionManager.js
// Build and script version management utilities
// Consolidates VersionManager.js and VersionUtilities.js

const VersionManager = (function() {
  'use strict';
  
  const ns = {};

  /**
   * Display current build information
   */
  ns.showCurrentBuild = function() {
    const versionInfo = {
      scriptVersion: ConfigManager.SCRIPT_VERSION,
      buildNumber: ConfigManager.BUILD_NUMBER,
      buildDate: ConfigManager.BUILD_NUMBER.split('.')[0],
      fullVersion: `${ConfigManager.SCRIPT_VERSION}_${ConfigManager.BUILD_NUMBER}`
    };
    
    Logger.log('=== 🐕 Boxer Build Information ===');
    Logger.log(`Script Version: ${versionInfo.scriptVersion}`);
    Logger.log(`Build Number: ${versionInfo.buildNumber}`);
    Logger.log(`Build Date: ${versionInfo.buildDate}`);
    Logger.log(`Full Version: ${versionInfo.fullVersion}`);
    Logger.log('=====================================');
    
    return versionInfo;
  };

  /**
   * Increment build number
   */
  ns.incrementBuild = function() {
    const current = ConfigManager.getCurrentBuild();
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const parts = current.split('.');
    const increment = parts[0] === today ? String(parseInt(parts[1]) + 1).padStart(3, '0') : '001';
    const newBuild = `${today}.${increment}`;
    
    ConfigManager.SCRIPT_PROPERTIES.setProperty('BUILD_NUMBER', newBuild);
    Logger.log(`🐕 Boxer build updated: ${current} → ${newBuild}`);
    return newBuild;
  };

  /**
   * Check how many files need build updates
   */
  ns.checkBuildStatus = function(sampleSize = 20) {
    Logger.log(`Current build: ${ConfigManager.getCurrentBuild()}`);
    
    const accessToken = getValidAccessToken();
    const images = BoxFileOperations.findAllImageFiles(
      ConfigManager.BOX_PRIORITY_FOLDER_ID || '0', 
      accessToken
    );
    
    let needsUpdate = 0;
    let upToDate = 0;
    let noMetadata = 0;
    
    images.slice(0, sampleSize).forEach(image => {
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
      if (!metadata) {
        noMetadata++;
      } else if (metadata.buildNumber !== ConfigManager.getCurrentBuild()) {
        needsUpdate++;
      } else {
        upToDate++;
      }
    });
    
    const result = {
      sampleSize: Math.min(sampleSize, images.length),
      upToDate,
      needsUpdate,
      noMetadata,
      currentBuild: ConfigManager.getCurrentBuild()
    };
    
    Logger.log(`Build Status (sample of ${result.sampleSize} files):`);
    Logger.log(`  Up-to-date: ${upToDate}`);
    Logger.log(`  Needs update: ${needsUpdate}`); 
    Logger.log(`  No metadata: ${noMetadata}`);
    
    return result;
  };

  /**
   * Analyze version distribution across processed files
   */
  ns.analyzeVersionDistribution = function(accessToken) {
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    Logger.log('=== 🔍 Boxer Version Distribution Analysis ===\n');
    
    try {
      const searchQueries = ['type:file .jpg', 'type:file .png', 'type:file .jpeg'];
      const versionCounts = {};
      let totalProcessed = 0;
      let totalUnprocessed = 0;
      let needsUpdate = 0;
      
      const currentVersion = `${ConfigManager.SCRIPT_VERSION}_${ConfigManager.BUILD_NUMBER}`;
      
      Logger.log(`🎯 Current version: ${currentVersion}`);
      Logger.log('🔍 Analyzing file versions...\n');
      
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
              if (BoxFileOperations.isImageFile(file.name)) {
                const metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
                
                if (metadata) {
                  totalProcessed++;
                  const fileVersion = metadata.processingVersion || metadata.scriptVersion || 'unknown';
                  
                  versionCounts[fileVersion] = (versionCounts[fileVersion] || 0) + 1;
                  
                  if (metadata.buildNumber !== ConfigManager.getCurrentBuild()) {
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
      Logger.log(`Files needing version update: ${needsUpdate}\n`);
      
      if (Object.keys(versionCounts).length > 0) {
        Logger.log('🏷️ VERSION DISTRIBUTION:');
        
        Object.keys(versionCounts)
          .sort((a, b) => versionCounts[b] - versionCounts[a])
          .forEach(version => {
            const count = versionCounts[version];
            const isCurrent = version === currentVersion;
            const status = isCurrent ? '✅ CURRENT' : '⚠️ OLD';
            
            Logger.log(`  ${version}: ${count} files ${status}`);
          });
      }
      
      Logger.log('\n💡 RECOMMENDATIONS:');
      if (needsUpdate > 0) {
        Logger.log(`🦴 Run version update processing for ${needsUpdate} outdated files`);
        Logger.log('   Use: VersionManager.processOutdatedFiles()');
      }
      if (totalUnprocessed > 0) {
        Logger.log(`📦 Process ${totalUnprocessed} unprocessed files`);
      }
      if (needsUpdate === 0 && totalUnprocessed === 0) {
        Logger.log('🎉 All files are up-to-date with current Boxer version!');
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
   * Process files with outdated versions
   */
  ns.processOutdatedFiles = function(maxFiles = 10) {
    Logger.log('🔄 Processing files with outdated build numbers...');
    Logger.log(`Maximum files to process: ${maxFiles}`);
    
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    try {
      const images = BoxFileOperations.findAllImageFiles(
        ConfigManager.BOX_PRIORITY_FOLDER_ID || '0', 
        accessToken
      );
      let processed = 0;
      let skipped = 0;
      let errors = 0;
      
      for (let i = 0; i < images.length && processed < maxFiles; i++) {
        const image = images[i];
        const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
        
        if (!metadata) {
          Logger.log(`⏭️ Skipping ${image.name} (no existing metadata)`);
          skipped++;
          continue;
        }
        
        if (metadata.buildNumber === ConfigManager.getCurrentBuild()) {
          skipped++;
          continue;
        }
        
        try {
          Logger.log(`🔄 Updating: ${image.name}`);
          const result = MetadataExtraction.processSingleImageBasic(image, accessToken);
          if (result && result.success !== false) {
            processed++;
            Logger.log(`✅ Updated: ${image.name}`);
          } else {
            errors++;
            Logger.log(`❌ Failed: ${image.name}`);
          }
        } catch (error) {
          errors++;
          Logger.log(`❌ Error updating ${image.name}: ${error.toString()}`);
        }
        
        Utilities.sleep(1000); // Rate limiting
      }
      
      Logger.log('\n📊 Processing complete:');
      Logger.log(`  Processed: ${processed}`);
      Logger.log(`  Skipped: ${skipped}`);
      Logger.log(`  Errors: ${errors}`);
      
      if (processed === maxFiles) {
        Logger.log(`⚠️ Reached processing limit. Run again to process more files.`);
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
   * Process all files that have outdated versions
   */
  ns.processAllOutdatedFiles = function(maxFiles = 25) {
    Logger.log('🔄 === Processing All Outdated Files ===');
    Logger.log(`Maximum files to process: ${maxFiles}`);
    
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return null;
    }
    
    try {
      const searchQueries = ['type:file .jpg', 'type:file .png', 'type:file .jpeg'];
      let processed = 0;
      let skipped = 0;
      let errors = 0;
      
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
              
              if (!BoxFileOperations.isImageFile(file.name)) continue;
              
              const metadata = BoxFileOperations.getCurrentMetadata(file.id, accessToken);
              if (!metadata) {
                skipped++;
                continue;
              }
              
              const fileVersion = metadata.processingVersion || metadata.scriptVersion || 'unknown';
              if (metadata.buildNumber === ConfigManager.getCurrentBuild()) {
                skipped++;
                continue;
              }
              
              try {
                Logger.log(`🔄 Updating outdated file: ${file.name} (version: ${fileVersion})`);
                
                const result = MetadataExtraction.processSingleImageBasic(
                  { id: file.id, name: file.name }, 
                  accessToken
                );
                
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
      Logger.log(`❌ Error in processAllOutdatedFiles: ${error.toString()}`);
      return null;
    }
  };

  /**
   * Test version tracking on a single file
   */
  ns.testVersionTracking = function(fileId) {
    Logger.log('=== 🧪 Testing Version Tracking ===');
    
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return { success: false, error: 'No access token' };
    }
    
    try {
      // Find a test file if not specified
      if (!fileId) {
        const testImages = BoxFileOperations.findAllImageFiles(
          ConfigManager.BOX_PRIORITY_FOLDER_ID || '0', 
          accessToken
        );
        if (testImages.length === 0) {
          Logger.log('❌ No test images found');
          return { success: false, error: 'No test images found' };
        }
        fileId = testImages[0].id;
        Logger.log(`🎯 Testing with: ${testImages[0].name}`);
      }
      
      Logger.log('🔍 Analyzing current metadata...');
      
      // Get current metadata
      const currentMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken);
      const currentVersion = `${ConfigManager.SCRIPT_VERSION}_${ConfigManager.BUILD_NUMBER}`;
      
      if (currentMetadata) {
        const fileVersion = currentMetadata.processingVersion || currentMetadata.scriptVersion || 'none';
        const processingCount = currentMetadata.processingCount || 0;
        const firstProcessed = currentMetadata.firstProcessedDate || 'never';
        const lastProcessed = currentMetadata.lastProcessedDate || 'never';
        
        Logger.log('📋 Current Status:');
        Logger.log(`  File version: ${fileVersion}`);
        Logger.log(`  Current version: ${currentVersion}`);
        Logger.log(`  Processing count: ${processingCount}`);
        Logger.log(`  First processed: ${firstProcessed}`);
        Logger.log(`  Last processed: ${lastProcessed}`);
        Logger.log(`  Needs update: ${currentMetadata.buildNumber !== ConfigManager.getCurrentBuild()}`);
        
        if (currentMetadata.processingNotes) {
          Logger.log(`  Processing notes: ${currentMetadata.processingNotes.substring(0, 100)}...`);
        }
      } else {
        Logger.log('📋 No existing metadata found');
      }
      
      Logger.log('\n🔄 Testing version-aware processing...');
      
      // Test the version-aware processing
      const processResult = MetadataExtraction.processSingleImageBasic({ id: fileId, name: 'test-file' }, accessToken);
      
      Logger.log('\n🔍 Checking updated metadata...');
      
      // Get updated metadata
      const updatedMetadata = BoxFileOperations.getCurrentMetadata(fileId, accessToken);
      
      if (updatedMetadata) {
        Logger.log('📋 Updated Status:');
        Logger.log(`  New version: ${updatedMetadata.processingVersion || 'none'}`);
        Logger.log(`  New processing count: ${updatedMetadata.processingCount || 0}`);
        Logger.log(`  Script version: ${updatedMetadata.scriptVersion || 'none'}`);
        Logger.log(`  Build number: ${updatedMetadata.buildNumber || 'none'}`);
        
        if (updatedMetadata.processingNotes) {
          Logger.log(`  Updated notes: ${updatedMetadata.processingNotes.substring(0, 150)}...`);
        }
        
        Logger.log('\n✅ Version tracking test complete!');
        
        return {
          success: true,
          before: currentMetadata,
          after: updatedMetadata,
          processingResult: processResult
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

  /**
   * Get build history from recent processing
   */
  ns.getBuildHistory = function() {
    const accessToken = getValidAccessToken();
    const images = BoxFileOperations.findAllImageFiles(
      ConfigManager.BOX_PRIORITY_FOLDER_ID || '0', 
      accessToken
    );
    
    const builds = new Set();
    
    images.slice(0, 50).forEach(image => {
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
      if (metadata && metadata.buildNumber) {
        builds.add(metadata.buildNumber);
      }
    });
    
    const buildArray = Array.from(builds).sort().reverse();
    
    Logger.log('Recent builds found:');
    buildArray.forEach(build => {
      Logger.log(`  ${build}`);
    });
    
    return buildArray;
  };

  /**
   * Generate a suggested build number based on current date
   */
  ns.generateBuildNumber = function() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const increment = '001';
    const suggested = `${dateStr}.${increment}`;
    
    Logger.log(`💡 Suggested build number for today: ${suggested}`);
    Logger.log('Format: YYYYMMDD.increment');
    Logger.log(`Current: ${ConfigManager.BUILD_NUMBER}`);
    
    return suggested;
  };

  return ns;
})();