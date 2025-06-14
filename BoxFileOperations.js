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
   * Iteratively finds all image files with robust error handling.
   * This is safer than recursion for deep folder structures.
   * @param {string} folderId Box folder ID to start scanning from
   * @param {string} accessToken Valid Box access token
   * @returns {object[]} Array of image file objects
   */
  ns.findAllImageFiles = function(folderId, accessToken) {
    const startFolderId = folderId || ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0';
    const allImages = [];
    const folderQueue = [startFolderId];
    const processedFolders = new Set();
    
    if (!accessToken) {
      throw new Error('BoxFileOperations.findAllImageFiles: accessToken is required');
    }
    
    while (folderQueue.length > 0) {
      const currentFolderId = folderQueue.shift();
      if (processedFolders.has(currentFolderId)) {
        continue;
      }
      processedFolders.add(currentFolderId);
      
      try {
        const fieldsToFetch = 'id,name,type,size,path_collection,created_at,modified_at,parent';
        const url = `${ConfigManager.BOX_API_BASE_URL}/folders/${currentFolderId}/items?limit=${ConfigManager.DEFAULT_API_ITEM_LIMIT}&fields=${fieldsToFetch}`;
                  
        const response = makeRobustApiCall_(function() {
          return UrlFetchApp.fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            muteHttpExceptions: true
          });
        }, `findAllImageFiles for folder ${currentFolderId}`);
        
        const responseCode = response.getResponseCode();
        if (responseCode !== 200) {
          Logger.log(`BoxFileOperations: Failed to list items in folder ${currentFolderId}. HTTP Code: ${responseCode}. Response: ${response.getContentText().substring(0,500)}`);
          continue; // Skip this folder on error
        }
        
        const data = JSON.parse(response.getContentText());
        
        data.entries.forEach(function(item) {
          if (item.type === 'file' && ns.isImageFile(item.name)) {
            let pathString = 'All Files';
            if (item.path_collection && item.path_collection.entries && item.path_collection.entries.length > 1) {
              pathString = item.path_collection.entries.slice(1).map(p => p.name).join('/');
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
            folderQueue.push(item.id);
          }
        });
        
      } catch (error) {
        ErrorHandler.reportError(error, 'BoxFileOperations.findAllImageFiles', { folderId: currentFolderId });
        continue; // Continue to next folder in queue
      }
    }
    
    return allImages;
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
      
      // If no metadata exists, delegate to applyMetadata to create it.
      if (!currentMetadata) {
        Logger.log(`BoxFileOperations.updateMetadata: No current metadata for file ${fileId}. Delegating to create.`);
        return ns.applyMetadata(fileId, metadataToUpdate, accessToken, templateKey);
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
    const BATCH_SIZE = ConfigManager.getProperty('METADATA_ATTACH_BATCH_SIZE');
    const FILE_DELAY_MS = ConfigManager.getProperty('METADATA_ATTACH_FILE_DELAY_MS');
    const BATCH_DELAY_MS = ConfigManager.getProperty('METADATA_ATTACH_BATCH_DELAY_MS');
    
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
      
      for (let i = 0; i < allImages.length; i += BATCH_SIZE) {
        const batch = allImages.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        const totalBatches = Math.ceil(allImages.length / BATCH_SIZE);
        
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
                 Utilities.sleep(FILE_DELAY_MS);
            }
            
          } catch (batchError) { 
            Logger.log(`BoxFileOperations: Critical error processing ${imageFile.name || 'unknown file'} in attachTemplateToAllImages batch: ${batchError.toString()}`);
            stats.errors++;
          }
        });
        
        if (i + BATCH_SIZE < allImages.length) {
          Logger.log(`Pausing ${BATCH_DELAY_MS / 1000}s after batch ${batchNum}...`);
          Utilities.sleep(BATCH_DELAY_MS);
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