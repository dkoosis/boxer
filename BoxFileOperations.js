// File: BoxFileOperations.gs
// Box file operations with robust error handling using Bruce McPherson's patterns
// Uses cUseful library by Bruce McPherson for exponential backoff and utilities
// Depends on: Config.gs, BoxAuth.gs, BoxMetadataTemplates.gs

/**
 * BoxFileOperations namespace following Bruce McPherson's organizational patterns.
 * Provides robust file operations with exponential backoff and proper error handling.
 */
var BoxFileOperations = (function() {
  'use strict';
  
  var ns = {};
  var utils_ = null;
  
  /**
   * Initialize cUseful utilities following Bruce's dependency-free pattern.
   * @returns {object} cUseful utilities
   * @private
   */
  function initUtils_() {
    if (!utils_) {
      try {
        utils_ = cUseful; // Assuming cUseful is globally available
        Logger.log('ℹ️ BoxFileOperations: cUseful library initialized');
      } catch (e) {
        Logger.log('ERROR: BoxFileOperations - cUseful library not available: ' + e.toString());
        // Fallback for environments where cUseful might not be linked (e.g. local testing without full setup)
        // This mock won't provide actual backoff but prevents script from breaking on cUseful calls.
        if (typeof cUseful === 'undefined') {
            Logger.log('WARNING: cUseful library not found. Using mock for syntax. Exponential backoff will not work.');
            utils_ = {
                rateLimitExpBackoff: function(callback) { return callback(); },
                TRYAGAIN: 'TRYAGAIN_MOCK_CU' // Distinguish from potential other TRYAGAIN constants
            };
        } else {
             utils_ = cUseful;
        }
      }
    }
    return utils_;
  }
  
  /**
   * Makes API calls with Bruce McPherson's exponential backoff pattern.
   * @param {function} apiCall Function that makes the API call
   * @param {string} context Description for logging
   * @returns {GoogleAppsScript.URL_Fetch.HTTPResponse} API response or throws error
   * @private
   */
  function makeRobustApiCall_(apiCall, context) {
    var utils = initUtils_();
    
    return utils.rateLimitExpBackoff(function() {
      try {
        return apiCall();
      } catch (error) {
        Logger.log('BoxFileOperations: API call failed in ' + context + ': ' + error.toString());
        throw error; 
      }
    }, undefined, undefined, undefined, undefined, function(result) {
      if (result && typeof result.getResponseCode === 'function') {
        var code = result.getResponseCode();
        if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) {
          Logger.log('BoxFileOperations: Retryable HTTP error ' + code + ' in ' + context + '. Retrying...');
          throw utils.TRYAGAIN; 
        }
      }
      return result; 
    });
  }
  
  /**
   * Checks if a filename represents an image file.
   * @param {string} filename The filename to check
   * @returns {boolean} True if recognized image extension
   */
  ns.isImageFile = function(filename) {
    if (!filename || typeof filename !== 'string') return false;
    // Assuming Config is globally available
    if (typeof Config !== 'undefined' && typeof Config.isImageFile === 'function') {
        return Config.isImageFile(filename);
    }
    Logger.log('Warning: Config.isImageFile not available. Using fallback image check.');
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'];
    const lowerFilename = filename.toLowerCase();
    return imageExtensions.some(ext => lowerFilename.endsWith(ext));
  };
  
  /**
   * Recursively finds all image files with robust error handling.
   * @param {string} folderId Box folder ID to start scanning from
   * @param {string} accessToken Valid Box access token
   * @param {object[]} allImages Accumulator array for recursion
   * @returns {object[]} Array of image file objects
   */
  ns.findAllImageFiles = function(folderId, accessToken, allImages) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { DEFAULT_PROCESSING_FOLDER_ID: '0', DEFAULT_API_ITEM_LIMIT: 1000, BOX_API_BASE_URL: 'https://api.box.com/2.0' };
    folderId = folderId || currentConfig.DEFAULT_PROCESSING_FOLDER_ID;
    allImages = allImages || [];
    
    if (!accessToken) {
      throw new Error('BoxFileOperations.findAllImageFiles: accessToken is required');
    }
        
    try {
      var fieldsToFetch = 'id,name,type,size,path_collection,created_at,modified_at,parent';
      var url = currentConfig.BOX_API_BASE_URL + '/folders/' + folderId + '/items?limit=' + 
                currentConfig.DEFAULT_API_ITEM_LIMIT + '&fields=' + fieldsToFetch;
                
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'findAllImageFiles for folder ' + folderId);
      
      var responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        Logger.log('BoxFileOperations: Failed to list items in folder ' + folderId + 
                  '. HTTP Code: ' + responseCode + '. Response: ' + response.getContentText().substring(0,500));
        return allImages;
      }
      
      var data = JSON.parse(response.getContentText());
      
      data.entries.forEach(function(item) {
        if (item.type === 'file' && ns.isImageFile(item.name)) {
          var pathString = 'All Files';
          if (item.path_collection && item.path_collection.entries && item.path_collection.entries.length > 1) {
            pathString = item.path_collection.entries.slice(1)
              .map(function(p) { return p.name; })
              .join('/');
          } else if (item.parent && item.parent.name && item.parent.id !== '0') {
            pathString = item.parent.name;
          } else if (item.parent && item.parent.id === '0') {
            pathString = ''; 
          }
          
          allImages.push({
            id: item.id,
            name: item.name,
            size: item.size,
            path: pathString,
            created_at: item.created_at,
            modified_at: item.modified_at
          });
        } else if (item.type === 'folder') {
          ns.findAllImageFiles(item.id, accessToken, allImages);
        }
      });
      
      return allImages;
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception in findAllImageFiles for folder ' + 
                folderId + ': ' + error.toString());
      return allImages;
    }
  };
  
  /**
   * Checks if a file has existing metadata with robust error handling.
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {boolean} True if metadata exists
   */
/**
   * Checks if a file has existing metadata with robust error handling.
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {boolean} True if metadata exists
   */
  ns.hasExistingMetadata = function(fileId, accessToken, templateKey) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata', BOX_METADATA_SCOPE: 'enterprise', BOX_API_BASE_URL: 'https://api.box.com/2.0' };
    templateKey = templateKey || currentConfig.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId) {
      Logger.log('BoxFileOperations.hasExistingMetadata: fileId and accessToken required');
      return false;
    }
    
    try {
      var url = currentConfig.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                currentConfig.BOX_METADATA_SCOPE + '/' + templateKey;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'GET', // Changed from HEAD to GET - Google Apps Script doesn't support HEAD
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'hasExistingMetadata (GET) for file ' + fileId);
      
      return response.getResponseCode() === 200;
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception checking metadata (GET) for file ' + 
                fileId + ': ' + error.toString());
      return false;
    }
  };  
  /**
   * Gets current metadata with robust error handling.
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {object|null} Metadata object or null
   */
  ns.getCurrentMetadata = function(fileId, accessToken, templateKey) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata', BOX_METADATA_SCOPE: 'enterprise', BOX_API_BASE_URL: 'https://api.box.com/2.0' };
    templateKey = templateKey || currentConfig.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId) {
      Logger.log('BoxFileOperations.getCurrentMetadata: fileId and accessToken required');
      return null;
    }
    
    try {
      var url = currentConfig.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                currentConfig.BOX_METADATA_SCOPE + '/' + templateKey;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'getCurrentMetadata for file ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 200) {
        return JSON.parse(response.getContentText());
      } else if (responseCode === 404) {
        return null;
      } else {
        Logger.log('BoxFileOperations: Error getting metadata for file ' + fileId + 
                  '. Code: ' + responseCode + '. Response: ' + response.getContentText().substring(0,500));
        return null;
      }
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception getting metadata for file ' + 
                fileId + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Applies metadata with create/update logic and robust error handling.
   * If metadata instance exists, it delegates to updateMetadata for a JSON Patch update.
   * @param {string} fileId Box file ID
   * @param {object} metadata Metadata to apply
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {boolean} Success status
   */
  ns.applyMetadata = function(fileId, metadata, accessToken, templateKey) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata', BOX_METADATA_SCOPE: 'enterprise', BOX_API_BASE_URL: 'https://api.box.com/2.0' };
    templateKey = templateKey || currentConfig.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId || !metadata || typeof metadata !== 'object') {
      Logger.log('BoxFileOperations.applyMetadata: fileId, accessToken, and a metadata object are required.');
      return false;
    }
    
    try {
      var url = currentConfig.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                currentConfig.BOX_METADATA_SCOPE + '/' + templateKey;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(metadata),
          muteHttpExceptions: true
        });
      }, 'applyMetadata (POST) for file ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 201) { // Successfully created
        return true;
      } else if (responseCode === 409) { // Conflict - metadata instance already exists
        Logger.log(' > Update existing metadata...');
        return ns.updateMetadata(fileId, metadata, accessToken, templateKey); // Delegate to updateMetadata
      } else {
        var errorText = response.getContentText();
        Logger.log('BoxFileOperations: Error applying (POST) metadata to ' + fileId + 
                  '. Code: ' + responseCode + ', Response: ' + errorText.substring(0, 300));
        return false;
      }
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception in applyMetadata for file ' + fileId + 
                ': ' + error.toString());
      return false;
    }
  };
  
  /**
   * Updates metadata using JSON Patch operations with robust error handling.
   * @param {string} fileId Box file ID
   * @param {object} metadataToUpdate An object where keys are metadata fields and values are their new values.
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {boolean} Success status
   */
  ns.updateMetadata = function(fileId, metadataToUpdate, accessToken, templateKey) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata', BOX_METADATA_SCOPE: 'enterprise', BOX_API_BASE_URL: 'https://api.box.com/2.0' };
    templateKey = templateKey || currentConfig.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId || !metadataToUpdate || typeof metadataToUpdate !== 'object') {
      Logger.log('BoxFileOperations.updateMetadata: fileId, accessToken, and metadataToUpdate object are required');
      return false;
    }
    
    try {
      var currentMetadata = ns.getCurrentMetadata(fileId, accessToken, templateKey);
      // If no current metadata, we can't "update". applyMetadata should handle creation.
      // However, if applyMetadata calls this, metadataToUpdate is the full payload.
      // We need to build patch operations relative to what's currently there if currentMetadata is available.
      // If currentMetadata is null, it means the instance doesn't exist, so this update call might be inappropriate,
      // or we should attempt a create (though applyMetadata should have done that).
      // For robustness, if currentMetadata is null, attempt to create it with metadataToUpdate.
      if (!currentMetadata) {
        Logger.log('BoxFileOperations.updateMetadata: No current metadata to update for file ' + fileId + '. Attempting to create with the provided payload.');
        // This is effectively a create operation if applyMetadata's POST failed for reasons other than 409,
        // or if updateMetadata is called directly on a file without metadata.
        // Re-using the POST logic from applyMetadata:
         var createUrl = currentConfig.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                currentConfig.BOX_METADATA_SCOPE + '/' + templateKey;
        var createResponse = makeRobustApiCall_(function() {
            return UrlFetchApp.fetch(createUrl, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify(metadataToUpdate), // Use the full metadataToUpdate as the creation payload
            muteHttpExceptions: true
            });
        }, 'updateMetadata (attempting create via POST) for file ' + fileId);
        
        if (createResponse.getResponseCode() === 201) return true;
        else {
            Logger.log('BoxFileOperations.updateMetadata: Failed to create metadata (after finding no current metadata to update) for ' + fileId + 
                      '. Code: ' + createResponse.getResponseCode() + '. Response: ' + createResponse.getContentText().substring(0,300));
            return false;
        }
      }
      
      var patchOperations = []; // Changed from 'updates' to 'patchOperations' for clarity
      
      Object.keys(metadataToUpdate).forEach(function(key) {
        var path = '/' + key; // Assumes keys don't need escaping for JSON Patch path
        if (metadataToUpdate.hasOwnProperty(key)) {
          if (currentMetadata.hasOwnProperty(key)) {
            if (JSON.stringify(currentMetadata[key]) !== JSON.stringify(metadataToUpdate[key])) {
              patchOperations.push({ op: 'replace', path: path, value: metadataToUpdate[key] });
            }
          } else {
            patchOperations.push({ op: 'add', path: path, value: metadataToUpdate[key] });
          }
        }
      });
      
      if (patchOperations.length === 0) {
        // Logger.log('BoxFileOperations.updateMetadata: No changes needed for file ' + fileId);
        return true; 
      }
      
      var url = currentConfig.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                currentConfig.BOX_METADATA_SCOPE + '/' + templateKey;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json-patch+json' // Correct for JSON Patch
          },
          payload: JSON.stringify(patchOperations), // Send the array of patch operations
          muteHttpExceptions: true
        });
      }, 'updateMetadata (JSON Patch PUT) for file ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 200 || responseCode === 201) { // 200 OK for update
        return true;
      } else {
        var errorText = response.getContentText();
        Logger.log('BoxFileOperations: Error updating metadata (JSON Patch) for ' + fileId + 
                  '. Code: ' + responseCode + '. Patch: ' + JSON.stringify(patchOperations) +
                  '. Response: ' + errorText.substring(0, 300));
        return false;
      }
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception in updateMetadata for file ' + fileId + 
                ': ' + error.toString());
      return false;
    }
  };

/**
 * Marks a file's metadata to indicate processing has failed, and records the build number.
 * @param {string} fileId Box file ID.
 * @param {string} accessToken Valid Box access token.
 * @param {string} errorMessage The error message to record (will be truncated).
 * @param {string} currentBuildNo The current script build number when the failure occurred.
 * @returns {boolean} True if metadata was successfully updated/applied, false otherwise.
 */
ns.markFileAsFailed = function(fileId, accessToken, errorMessage, currentBuildNo) {
  // Ensure Config object and its properties are accessible
  const currentConfig = (typeof Config !== 'undefined') ? Config : { 
      BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata', 
      BOX_METADATA_SCOPE: 'enterprise', 
      PROCESSING_STAGE_FAILED: 'failed', 
      METADATA_KEY_LAST_ERROR: 'lastProcessingError',
      METADATA_KEY_LAST_ERROR_TIMESTAMP: 'lastErrorTimestamp'
      // Assuming 'buildNumber' is a standard field key, not needing specific METADATA_KEY_ prefix
  };

  if (!fileId || !accessToken || !currentBuildNo) {
    Logger.log('BoxFileOperations.markFileAsFailed: fileId, accessToken, and currentBuildNo are required.');
    return false;
  }

  try {
    const metadataUpdatePayload = {};
    metadataUpdatePayload.processingStage = currentConfig.PROCESSING_STAGE_FAILED;
    metadataUpdatePayload[currentConfig.METADATA_KEY_LAST_ERROR] = (errorMessage || "Unknown error").substring(0, 250);
    metadataUpdatePayload[currentConfig.METADATA_KEY_LAST_ERROR_TIMESTAMP] = new Date().toISOString();
    metadataUpdatePayload.buildNumber = currentBuildNo;

    Logger.log(`Attempting to mark file ${fileId} as FAILED. Error: ${metadataUpdatePayload[currentConfig.METADATA_KEY_LAST_ERROR].substring(0,50)}..., Build: ${currentBuildNo}`);

    // Use applyMetadata which handles POST (create) or PUT (update via patch) if instance exists (due to 409->updateMetadata)
    return ns.applyMetadata(fileId, metadataUpdatePayload, accessToken, currentConfig.BOX_METADATA_TEMPLATE_KEY);
    
  } catch (e) {
    Logger.log(`BoxFileOperations: Exception while marking file ${fileId} as failed: ${e.toString()}`);
    return false;
  }
};
  
  /**
   * Attaches template to single image with robust retry logic.
   * @param {object} imageFile Image file object with id and name
   * @param {string} accessToken Valid Box access token
   * @returns {string} Status: 'attached', 'skipped', or 'error'
   */
  ns.attachTemplateToImage = function(imageFile, accessToken) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { 
        BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata', 
        BOX_METADATA_SCOPE: 'enterprise', 
        PROCESSING_STAGE_UNPROCESSED: 'unprocessed',
        BOX_API_BASE_URL: 'https://api.box.com/2.0'
    };
     const currentBuild = (typeof Config !== 'undefined' && typeof Config.getCurrentBuild === 'function') ? Config.getCurrentBuild() : 'unknown_build';


    if (!accessToken || !imageFile || !imageFile.id || !imageFile.name) { // Check imageFile.name as well
      Logger.log('BoxFileOperations.attachTemplateToImage: imageFile (with id and name) and accessToken required');
      return 'error';
    }
    
    try {
      if (ns.hasExistingMetadata(imageFile.id, accessToken, currentConfig.BOX_METADATA_TEMPLATE_KEY)) {
        return 'skipped';
      }
      
      var emptyMetadata = {
        processingStage: currentConfig.PROCESSING_STAGE_UNPROCESSED,
        lastProcessedDate: new Date().toISOString(),
        buildNumber: currentBuild // Add current build number when attaching template
      };
      
      var url = currentConfig.BOX_API_BASE_URL + '/files/' + imageFile.id + '/metadata/' + 
                currentConfig.BOX_METADATA_SCOPE + '/' + currentConfig.BOX_METADATA_TEMPLATE_KEY;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(emptyMetadata),
          muteHttpExceptions: true
        });
      }, 'attachTemplateToImage (POST) for ' + imageFile.name);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 201) {
        return 'attached';
      } else if (responseCode === 409) {
        return 'skipped'; 
      } else {
        Logger.log('BoxFileOperations: Failed to attach template to ' + imageFile.name + 
                  '. Code: ' + responseCode + '. Response: ' + response.getContentText().substring(0,300));
        return 'error';
      }
      
    } catch (error) {
      var errorStr = error.toString();
      if (errorStr.includes('item_already_has_metadata_instance') || 
          errorStr.includes('constraint_violated') ||
          (error.message && typeof error.message.includes === 'function' && error.message.includes('409'))
         ) {
        return 'skipped';
      }
      Logger.log('BoxFileOperations: Exception attaching template to ' + imageFile.name + 
                ': ' + errorStr);
      return 'error';
    }
  };
  
  /**
   * Processes template attachment in batches with proper delays.
   * @param {string} accessToken Valid Box access token
   */
  ns.attachTemplateToAllImages = function(accessToken) {
    const currentConfig = (typeof Config !== 'undefined') ? Config : { 
        DEFAULT_PROCESSING_FOLDER_ID: '0', 
        METADATA_ATTACHMENT_BATCH_SIZE: 50,
        METADATA_ATTACHMENT_FILE_DELAY_MS: 100,
        METADATA_ATTACHMENT_BATCH_DELAY_MS: 2000
    };
    const getTemplateFn = (typeof getOrCreateImageTemplate === 'function') ? getOrCreateImageTemplate : function(){ Logger.log("Warning: getOrCreateImageTemplate not available!"); return {displayName: "Mock Template"}; };


    if (!accessToken) {
      throw new Error('BoxFileOperations.attachTemplateToAllImages: accessToken required');
    }
    
    initUtils_(); // Ensure cUseful is available for Utilities.sleep
    
    Logger.log('=== BoxFileOperations: Attaching Template to All Images ===');
    
    try {
      var template = getTemplateFn(accessToken);
      if (!template) {
        Logger.log('ERROR: Could not get or create metadata template. Aborting attachment process.');
        throw new Error('Failed to ensure metadata template exists.');
      }
      Logger.log('✅ Using template: ' + template.displayName);
      
      var allImages = ns.findAllImageFiles(currentConfig.DEFAULT_PROCESSING_FOLDER_ID, accessToken);
      Logger.log('📊 Found ' + allImages.length + ' image files total.');
      
      if (allImages.length === 0) {
        Logger.log('No image files found to process for template attachment.');
        return;
      }
      
      var stats = { processed: 0, attached: 0, skipped: 0, errors: 0, totalFiles: allImages.length };
      
      for (var i = 0; i < allImages.length; i += currentConfig.METADATA_ATTACHMENT_BATCH_SIZE) {
        var batch = allImages.slice(i, i + currentConfig.METADATA_ATTACHMENT_BATCH_SIZE);
        var batchNum = Math.floor(i / currentConfig.METADATA_ATTACHMENT_BATCH_SIZE) + 1;
        var totalBatches = Math.ceil(allImages.length / currentConfig.METADATA_ATTACHMENT_BATCH_SIZE);
        
        Logger.log('Processing batch ' + batchNum + ' of ' + totalBatches + 
                  ' for template attachment (' + batch.length + ' files)');
        
        batch.forEach(function(imageFile, indexInBatch) {
          stats.processed++;
          try {
            var result = ns.attachTemplateToImage(imageFile, accessToken);
            
            if (result === 'attached') stats.attached++;
            else if (result === 'skipped') stats.skipped++;
            else stats.errors++;
            
            if ((indexInBatch + 1) % 10 === 0 || (indexInBatch + 1) === batch.length) {
              Logger.log('Batch ' + batchNum + ' progress: ' + (indexInBatch + 1) + '/' + batch.length + 
                        ' (Overall: ' + stats.processed + '/' + stats.totalFiles +
                        ' | Attached: ' + stats.attached + ', Skipped: ' + stats.skipped + 
                        ', Errors: ' + stats.errors + ')');
            }
            
            if (indexInBatch < batch.length - 1) {
                 Utilities.sleep(currentConfig.METADATA_ATTACHMENT_FILE_DELAY_MS);
            }
            
          } catch (batchError) { 
            Logger.log('BoxFileOperations: Critical error processing ' + (imageFile.name || 'unknown file') + 
                      ' in attachTemplateToAllImages batch: ' + batchError.toString());
            stats.errors++;
          }
        });
        
        if (i + currentConfig.METADATA_ATTACHMENT_BATCH_SIZE < allImages.length) {
          Logger.log('Pausing ' + (currentConfig.METADATA_ATTACHMENT_BATCH_DELAY_MS / 1000) + 
                    's after batch ' + batchNum + '...');
          Utilities.sleep(currentConfig.METADATA_ATTACHMENT_BATCH_DELAY_MS);
        }
      }
      
      Logger.log('\n=== Template Attachment Complete ===');
      Logger.log('📊 Total files checked: ' + stats.processed + ' (out of ' + stats.totalFiles + ' found)');
      Logger.log('✅ Templates successfully attached: ' + stats.attached);
      Logger.log('⏭️ Skipped (template already existed or other skip): ' + stats.skipped);
      Logger.log('❌ Errors during attachment: ' + stats.errors);
      
    } catch (error) { 
      Logger.log('BoxFileOperations: Fatal error in attachTemplateToAllImages: ' + 
                error.toString());
      throw error; 
    }
  };
  
  // Return the public interface
  return ns;
})();