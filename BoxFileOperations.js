// File: BoxFileOperations.gs
// Box file operations with robust error handling using Bruce McPherson's patterns
// Uses cUseful library by Bruce McPherson for exponential backoff and utilities
// Depends on: ConfigManager.gs, BoxAuth.gs, BoxMetadataTemplates.gs

/**
 * BoxFileOperations namespace following Bruce McPherson's organizational patterns.
 * Provides robust file operations with exponential backoff and proper error handling.
 */
const BoxFileOperations = (function() {
  'use strict';
  
  const ns = {};
  let utils_ = null;
  
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
        Logger.log(`ERROR: BoxFileOperations - cUseful library not available: ${e.toString()}`);
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
    const utils = initUtils_();
    
    return utils.rateLimitExpBackoff(function() {
      try {
        return apiCall();
      } catch (error) {
        Logger.log(`BoxFileOperations: API call failed in ${context}: ${error.toString()}`);
        throw error; 
      }
    }, undefined, undefined, undefined, undefined, function(result) {
      if (result && typeof result.getResponseCode === 'function') {
        const code = result.getResponseCode();
        if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) {
          Logger.log(`BoxFileOperations: Retryable HTTP error ${code} in ${context}. Retrying...`);
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
    return ConfigManager.isImageFile(filename);
  };
  
  /**
   * Recursively finds all image files with robust error handling.
   * @param {string} folderId Box folder ID to start scanning from
   * @param {string} accessToken Valid Box access token
   * @param {object[]} allImages Accumulator array for recursion
   * @returns {object[]} Array of image file objects
   */
  ns.findAllImageFiles = function(folderId, accessToken, allImages) {
    folderId = folderId || ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0';
    allImages = allImages || [];
    
    if (!accessToken) {
      throw new Error('BoxFileOperations.findAllImageFiles: accessToken is required');
    }
        
    try {
      const fieldsToFetch = 'id,name,type,size,path_collection,created_at,modified_at,parent';
      const url = `${ConfigManager.BOX_API_BASE_URL}/folders/${folderId}/items?limit=${ConfigManager.DEFAULT_API_ITEM_LIMIT}&fields=${fieldsToFetch}`;
                
      const response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
      }, `findAllImageFiles for folder ${folderId}`);
      
      const responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        Logger.log(`BoxFileOperations: Failed to list items in folder ${folderId}. HTTP Code: ${responseCode}. Response: ${response.getContentText().substring(0,500)}`);
        return allImages;
      }
      
      const data = JSON.parse(response.getContentText());
      
      data.entries.forEach(function(item) {
        if (item.type === 'file' && ns.isImageFile(item.name)) {
          let pathString = 'All Files';
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
      ErrorHandler.reportError(error, 'BoxFileOperations.findAllImageFiles', { folderId });
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
  ns.hasExistingMetadata = function(fileId, accessToken, templateKey) {
    templateKey = templateKey || ConfigManager.getProperty('BOX_IMAGE_METADATA_ID');
    
    if (!accessToken || !fileId) {
      Logger.log('BoxFileOperations.hasExistingMetadata: fileId and accessToken required');
      return false;
    }
    
    try {
      const url = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/metadata/${ConfigManager.getBoxMetadataScope()}/${templateKey}`;
      
      const response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
      }, `hasExistingMetadata (GET) for file ${fileId}`);
      
      return response.getResponseCode() === 200;
      
    } catch (error) {
      Logger.log(`BoxFileOperations: Exception checking metadata (GET) for file ${fileId}: ${error.toString()}`);
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
    templateKey = templateKey || ConfigManager.getProperty('BOX_IMAGE_METADATA_ID');
    
    if (!accessToken || !fileId) {
      Logger.log('BoxFileOperations.getCurrentMetadata: fileId and accessToken required');
      return null;
    }
    
    try {
      const url = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/metadata/${ConfigManager.getBoxMetadataScope()}/${templateKey}`;
      
      const response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
      }, `getCurrentMetadata for file ${fileId}`);
      
      const responseCode = response.getResponseCode();
      
      if (responseCode === 200) {
        return JSON.parse(response.getContentText());
      } else if (responseCode === 404) {
        return null;
      } else {
        Logger.log(`BoxFileOperations: Error getting metadata for file ${fileId}. Code: ${responseCode}. Response: ${response.getContentText().substring(0,500)}`);
        return null;
      }
      
    } catch (error) {
      Logger.log(`BoxFileOperations: Exception getting metadata for file ${fileId}: ${error.toString()}`);
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
    templateKey = templateKey || ConfigManager.getProperty('BOX_IMAGE_METADATA_ID');
    
    if (!accessToken || !fileId || !metadata || typeof metadata !== 'object') {
      Logger.log('BoxFileOperations.applyMetadata: fileId, accessToken, and a metadata object are required.');
      return false;
    }
    
    try {
      const url = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/metadata/${ConfigManager.getBoxMetadataScope()}/${templateKey}`;
      
      const response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(metadata),
          muteHttpExceptions: true
        });
      }, `applyMetadata (POST) for file ${fileId}`);
      
      const responseCode = response.getResponseCode();
      
      if (responseCode === 201) { // Successfully created
        return true;
      } else if (responseCode === 409) { // Conflict - metadata instance already exists
        Logger.log(' > Update existing metadata...');
        return ns.updateMetadata(fileId, metadata, accessToken, templateKey); // Delegate to updateMetadata
      } else {
        const errorText = response.getContentText();
        Logger.log(`BoxFileOperations: Error applying (POST) metadata to ${fileId}. Code: ${responseCode}, Response: ${errorText.substring(0, 300)}`);
        return false;
      }
      
    } catch (error) {
      ErrorHandler.reportError(error, 'BoxFileOperations.applyMetadata', { fileId });
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
    templateKey = templateKey || ConfigManager.getProperty('BOX_IMAGE_METADATA_ID');
    
    if (!accessToken || !fileId || !metadataToUpdate || typeof metadataToUpdate !== 'object') {
      Logger.log('BoxFileOperations.updateMetadata: fileId, accessToken, and metadataToUpdate object are required');
      return false;
    }
    
    try {
      const currentMetadata = ns.getCurrentMetadata(fileId, accessToken, templateKey);
      if (!currentMetadata) {
        Logger.log(`BoxFileOperations.updateMetadata: No current metadata to update for file ${fileId}. Attempting to create with the provided payload.`);
         const createUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/metadata/${ConfigManager.getBoxMetadataScope()}/${templateKey}`;
        const createResponse = makeRobustApiCall_(function() {
            return UrlFetchApp.fetch(createUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            payload: JSON.stringify(metadataToUpdate),
            muteHttpExceptions: true
            });
        }, `updateMetadata (attempting create via POST) for file ${fileId}`);
        
        if (createResponse.getResponseCode() === 201) return true;
        else {
            Logger.log(`BoxFileOperations.updateMetadata: Failed to create metadata for ${fileId}. Code: ${createResponse.getResponseCode()}. Response: ${createResponse.getContentText().substring(0,300)}`);
            return false;
        }
      }
      
      const patchOperations = [];
      
      Object.keys(metadataToUpdate).forEach(function(key) {
        const path = '/' + key;
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
        return true; 
      }
      
      const url = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/metadata/${ConfigManager.getBoxMetadataScope()}/${templateKey}`;
      
      const response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json-patch+json'
          },
          payload: JSON.stringify(patchOperations),
          muteHttpExceptions: true
        });
      }, `updateMetadata (JSON Patch PUT) for file ${fileId}`);
      
      const responseCode = response.getResponseCode();
      
      if (responseCode === 200 || responseCode === 201) {
        return true;
      } else {
        const errorText = response.getContentText();
        Logger.log(`BoxFileOperations: Error updating metadata (JSON Patch) for ${fileId}. Code: ${responseCode}. Patch: ${JSON.stringify(patchOperations)}. Response: ${errorText.substring(0, 300)}`);
        return false;
      }
      
    } catch (error) {
      ErrorHandler.reportError(error, 'BoxFileOperations.updateMetadata', { fileId });
      return false;
    }
  };

/**
 * Marks a file's metadata to indicate processing has failed.
 * @param {string} fileId Box file ID.
 * @param {string} accessToken Valid Box access token.
 * @param {string} errorMessage The error message to record (will be truncated).
 * @returns {boolean} True if metadata was successfully updated/applied, false otherwise.
 */
ns.markFileAsFailed = function(fileId, accessToken, errorMessage) {
  const templateKey = ConfigManager.getProperty('BOX_IMAGE_METADATA_ID');

  if (!fileId || !accessToken) {
    Logger.log('BoxFileOperations.markFileAsFailed: fileId and accessToken are required.');
    return false;
  }

  try {
    const metadataUpdatePayload = {};
    metadataUpdatePayload.processingStage = ConfigManager.PROCESSING_STAGE_FAILED;
    metadataUpdatePayload.lastProcessingError = (errorMessage || "Unknown error").substring(0, 250);
    metadataUpdatePayload.lastErrorTimestamp = new Date().toISOString();
    
    Logger.log(`Attempting to mark file ${fileId} as FAILED. Error: ${(errorMessage || "").substring(0,50)}...`);

    return ns.applyMetadata(fileId, metadataUpdatePayload, accessToken, templateKey);
    
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
    const templateKey = ConfigManager.getProperty('BOX_IMAGE_METADATA_ID');

    if (!accessToken || !imageFile || !imageFile.id || !imageFile.name) {
      Logger.log('BoxFileOperations.attachTemplateToImage: imageFile (with id and name) and accessToken required');
      return 'error';
    }
    
    try {
      if (ns.hasExistingMetadata(imageFile.id, accessToken, templateKey)) {
        return 'skipped';
      }
      
      const emptyMetadata = {
        processingStage: ConfigManager.PROCESSING_STAGE_UNPROCESSED,
        lastProcessedDate: new Date().toISOString()
      };
      
      const url = `${ConfigManager.BOX_API_BASE_URL}/files/${imageFile.id}/metadata/${ConfigManager.getBoxMetadataScope()}/${templateKey}`;
      
      const response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(emptyMetadata),
          muteHttpExceptions: true
        });
      }, `attachTemplateToImage (POST) for ${imageFile.name}`);
      
      const responseCode = response.getResponseCode();
      
      if (responseCode === 201) {
        return 'attached';
      } else if (responseCode === 409) {
        return 'skipped'; 
      } else {
        Logger.log(`BoxFileOperations: Failed to attach template to ${imageFile.name}. Code: ${responseCode}. Response: ${response.getContentText().substring(0,300)}`);
        return 'error';
      }
      
    } catch (error) {
      const errorStr = error.toString();
      if (errorStr.includes('item_already_has_metadata_instance') || 
          errorStr.includes('constraint_violated') ||
          (error.message && typeof error.message.includes === 'function' && error.message.includes('409'))
         ) {
        return 'skipped';
      }
      Logger.log(`BoxFileOperations: Exception attaching template to ${imageFile.name}: ${errorStr}`);
      return 'error';
    }
  };
  
  /**
   * Processes template attachment in batches with proper delays.
   * @param {string} accessToken Valid Box access token
   */
  ns.attachTemplateToAllImages = function(accessToken) {
    const METADATA_ATTACHMENT_BATCH_SIZE = 50;
    const METADATA_ATTACHMENT_FILE_DELAY_MS = 100;
    const METADATA_ATTACHMENT_BATCH_DELAY_MS = 2000;
    
    const getTemplateFn = (typeof getOrCreateImageTemplate === 'function') ? getOrCreateImageTemplate : function(){ Logger.log("Warning: getOrCreateImageTemplate not available!"); return {displayName: "Mock Template"}; };


    if (!accessToken) {
      throw new Error('BoxFileOperations.attachTemplateToAllImages: accessToken required');
    }
    
    initUtils_();
    
    Logger.log('=== BoxFileOperations: Attaching Template to All Images ===');
    
    try {
      const template = getTemplateFn(accessToken);
      if (!template) {
        Logger.log('ERROR: Could not get or create metadata template. Aborting attachment process.');
        throw new Error('Failed to ensure metadata template exists.');
      }
      Logger.log(`✅ Using template: ${template.displayName}`);
      
      const allImages = ns.findAllImageFiles(ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0', accessToken);
      Logger.log(`📊 Found ${allImages.length} image files total.`);
      
      if (allImages.length === 0) {
        Logger.log('No image files found to process for template attachment.');
        return;
      }
      
      const stats = { processed: 0, attached: 0, skipped: 0, errors: 0, totalFiles: allImages.length };
      
      for (let i = 0; i < allImages.length; i += METADATA_ATTACHMENT_BATCH_SIZE) {
        const batch = allImages.slice(i, i + METADATA_ATTACHMENT_BATCH_SIZE);
        const batchNum = Math.floor(i / METADATA_ATTACHMENT_BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allImages.length / METADATA_ATTACHMENT_BATCH_SIZE);
        
        Logger.log(`Processing batch ${batchNum} of ${totalBatches} for template attachment (${batch.length} files)`);
        
        batch.forEach(function(imageFile, indexInBatch) {
          stats.processed++;
          try {
            const result = ns.attachTemplateToImage(imageFile, accessToken);
            
            if (result === 'attached') stats.attached++;
            else if (result === 'skipped') stats.skipped++;
            else stats.errors++;
            
            if ((indexInBatch + 1) % 10 === 0 || (indexInBatch + 1) === batch.length) {
              Logger.log(`Batch ${batchNum} progress: ${indexInBatch + 1}/${batch.length} (Overall: ${stats.processed}/${stats.totalFiles} | Attached: ${stats.attached}, Skipped: ${stats.skipped}, Errors: ${stats.errors})`);
            }
            
            if (indexInBatch < batch.length - 1) {
                 Utilities.sleep(METADATA_ATTACHMENT_FILE_DELAY_MS);
            }
            
          } catch (batchError) { 
            Logger.log(`BoxFileOperations: Critical error processing ${imageFile.name || 'unknown file'} in attachTemplateToAllImages batch: ${batchError.toString()}`);
            stats.errors++;
          }
        });
        
        if (i + METADATA_ATTACHMENT_BATCH_SIZE < allImages.length) {
          Logger.log(`Pausing ${METADATA_ATTACHMENT_BATCH_DELAY_MS / 1000}s after batch ${batchNum}...`);
          Utilities.sleep(METADATA_ATTACHMENT_BATCH_DELAY_MS);
        }
      }
      
      Logger.log('\n=== Template Attachment Complete ===');
      Logger.log(`📊 Total files checked: ${stats.processed} (out of ${stats.totalFiles} found)`);
      Logger.log(`✅ Templates successfully attached: ${stats.attached}`);
      Logger.log(`⏭️ Skipped (template already existed or other skip): ${stats.skipped}`);
      Logger.log(`❌ Errors during attachment: ${stats.errors}`);
      
    } catch (error) { 
      ErrorHandler.reportError(error, 'BoxFileOperations.attachTemplateToAllImages');
      throw error; 
    }
  };
  
  return ns;
})();