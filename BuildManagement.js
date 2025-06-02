// File: BuildManagement.gs
// Build version management and update tracking
// Depends on: Config.gs, BoxAuth.gs, BoxFileOperations.gs

/**
 * BuildManagement namespace for version tracking
 */
var BuildManagement = (function() {
  'use strict';
  
  var ns = {};
  
  /**
   * Increment build number (run after making processing changes)
   * @returns {string} New build number
   */
  ns.incrementBuild = function() {
    const current = Config.getCurrentBuild();
    const today = new Date().toISOString().slice(0,10).replace(/-/g, '');
    const parts = current.split('.');
    const increment = parts[0] === today ? String(parseInt(parts[1]) + 1).padStart(3, '0') : '001';
    const newBuild = today + '.' + increment;
    
    Config.SCRIPT_PROPERTIES.setProperty('BUILD_NUMBER', newBuild);
    Logger.log('🐕 Boxer build updated: ' + current + ' → ' + newBuild);
    return newBuild;
  };
  
  /**
   * Check how many files need build updates
   * @param {number} sampleSize Number of files to check (default 20)
   * @returns {object} Status counts
   */
  ns.checkBuildStatus = function(sampleSize) {
    sampleSize = sampleSize || 20;
    
    Logger.log('Current build: ' + Config.getCurrentBuild());
    
    const accessToken = getValidAccessToken();
    const images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
    
    let needsUpdate = 0;
    let upToDate = 0;
    let noMetadata = 0;
    
    images.slice(0, sampleSize).forEach(image => {
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
      if (!metadata) {
        noMetadata++;
      } else if (Config.shouldReprocessForBuild(metadata.buildNumber)) {
        needsUpdate++;
      } else {
        upToDate++;
      }
    });
    
    const result = {
      sampleSize: Math.min(sampleSize, images.length),
      upToDate: upToDate,
      needsUpdate: needsUpdate,
      noMetadata: noMetadata,
      currentBuild: Config.getCurrentBuild()
    };
    
    Logger.log('Build Status (sample of ' + result.sampleSize + ' files):');
    Logger.log('  Up-to-date: ' + upToDate);
    Logger.log('  Needs update: ' + needsUpdate); 
    Logger.log('  No metadata: ' + noMetadata);
    
    return result;
  };
  
  /**
   * Process files with outdated build numbers
   * @param {number} maxFiles Maximum files to process (default 10)
   * @returns {object} Processing results
   */
  ns.processOutdatedFiles = function(maxFiles) {
    maxFiles = maxFiles || 10;
    
    const accessToken = getValidAccessToken();
    const images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    Logger.log('Processing up to ' + maxFiles + ' outdated files...');
    
    for (const image of images) {
      if (processed >= maxFiles) break;
      
      try {
        const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
        
        if (metadata && Config.shouldReprocessForBuild(metadata.buildNumber)) {
          MetadataExtraction.processSingleImageBasic(image, accessToken);
          processed++;
          Logger.log('✅ Updated: ' + image.name);
          Utilities.sleep(1000);
        } else {
          skipped++;
        }
      } catch (error) {
        errors++;
        Logger.log('❌ Error processing ' + image.name + ': ' + error.toString());
      }
    }
    
    const result = {
      processed: processed,
      skipped: skipped, 
      errors: errors,
      newBuild: Config.getCurrentBuild()
    };
    
    Logger.log('\nBuild update complete:');
    Logger.log('  Processed: ' + processed);
    Logger.log('  Skipped: ' + skipped);
    Logger.log('  Errors: ' + errors);
    Logger.log('  Updated to build: ' + result.newBuild);
    
    return result;
  };
  
  /**
   * Create a new build and process outdated files
   * @param {number} maxFiles Maximum files to process after build increment
   * @returns {object} Complete results
   */
  ns.createNewBuildAndProcess = function(maxFiles) {
    maxFiles = maxFiles || 5;
    
    Logger.log('=== Creating New Build and Processing Outdated Files ===');
    
    // Increment build first
    const oldBuild = Config.getCurrentBuild();
    const newBuild = ns.incrementBuild();
    
    Logger.log('Build incremented: ' + oldBuild + ' → ' + newBuild);
    
    // Check how many files need updating
    const status = ns.checkBuildStatus(50);
    
    if (status.needsUpdate === 0) {
      Logger.log('✅ No files need build updates');
      return { build: newBuild, processing: null };
    }
    
    // Process some outdated files
    const processingResults = ns.processOutdatedFiles(maxFiles);
    
    return {
      build: newBuild,
      oldBuild: oldBuild,
      status: status,
      processing: processingResults
    };
  };
  
  /**
   * Get build history from recent processing
   * @returns {array} Recent builds found in files
   */
  ns.getBuildHistory = function() {
    const accessToken = getValidAccessToken();
    const images = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
    
    const builds = new Set();
    
    images.slice(0, 50).forEach(image => {
      const metadata = BoxFileOperations.getCurrentMetadata(image.id, accessToken);
      if (metadata && metadata.buildNumber) {
        builds.add(metadata.buildNumber);
      }
    });
    
    const buildArray = Array.from(builds).sort().reverse();
    
    Logger.log('Recent builds found:');
    buildArray.forEach(build => Logger.log('  ' + build));
    
    return buildArray;
  };
  
  return ns;
})();

// Convenience functions for easy access
function incrementBuild() {
  return BuildManagement.incrementBuild();
}

function checkBuildStatus() {
  return BuildManagement.checkBuildStatus();
}

function processOutdatedFiles(maxFiles) {
  return BuildManagement.processOutdatedFiles(maxFiles);
}