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
        utils_ = cUseful;
        Logger.log('ℹ️ BoxFileOperations: cUseful library initialized');
      } catch (e) {
        Logger.log('ERROR: BoxFileOperations - cUseful library not available: ' + e.toString());
        throw new Error('cUseful library is required but not available');
      }
    }
    return utils_;
  }
  
  /**
   * Makes API calls with Bruce McPherson's exponential backoff pattern.
   * @param {function} apiCall Function that makes the API call
   * @param {string} context Description for logging
   * @returns {object} API response or throws error
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
      // Custom checker for Box API specific retryable errors
      if (result && typeof result.getResponseCode === 'function') {
        var code = result.getResponseCode();
        if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) {
          Logger.log('BoxFileOperations: Retryable HTTP error ' + code + ' in ' + context);
          throw utils.TRYAGAIN; // Bruce's pattern for signaling retry
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
    return Config.isImageFile(filename);
  };
  
  /**
   * Recursively finds all image files with robust error handling.
   * @param {string} folderId Box folder ID to start scanning from
   * @param {string} accessToken Valid Box access token
   * @param {object[]} allImages Accumulator array for recursion
   * @returns {object[]} Array of image file objects
   */
  ns.findAllImageFiles = function(folderId, accessToken, allImages) {
    folderId = folderId || Config.DEFAULT_PROCESSING_FOLDER_ID;
    allImages = allImages || [];
    
    if (!accessToken) {
      throw new Error('BoxFileOperations.findAllImageFiles: accessToken is required');
    }
    
    var utils = initUtils_();
    
    try {
      var fieldsToFetch = 'id,name,type,size,path_collection,created_at,modified_at,parent';
      var url = Config.BOX_API_BASE_URL + '/folders/' + folderId + '/items?limit=' + 
                Config.DEFAULT_API_ITEM_LIMIT + '&fields=' + fieldsToFetch;
                
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'findAllImageFiles for folder ' + folderId);
      
      var responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        Logger.log('BoxFileOperations: Failed to list items in folder ' + folderId + 
                  '. HTTP Code: ' + responseCode);
        return allImages;
      }
      
      var data = JSON.parse(response.getContentText());
      
      data.entries.forEach(function(item) {
        if (item.type === 'file' && ns.isImageFile(item.name)) {
          // Build path string using Bruce's approach to object manipulation
          var pathString = 'All Files';
          if (item.path_collection && item.path_collection.entries.length > 1) {
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
          // Recursive call
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
  ns.hasExistingMetadata = function(fileId, accessToken, templateKey) {
    templateKey = templateKey || Config.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId) {
      Logger.log('BoxFileOperations.hasExistingMetadata: fileId and accessToken required');
      return false;
    }
    
    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + templateKey;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'hasExistingMetadata for file ' + fileId);
      
      return response.getResponseCode() === 200;
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception checking metadata for file ' + 
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
    templateKey = templateKey || Config.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId) {
      Logger.log('BoxFileOperations.getCurrentMetadata: fileId and accessToken required');
      return null;
    }
    
    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + templateKey;
      
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
                  '. Code: ' + responseCode);
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
   * @param {string} fileId Box file ID
   * @param {object} metadata Metadata to apply
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {boolean} Success status
   */
  ns.applyMetadata = function(fileId, metadata, accessToken, templateKey) {
    templateKey = templateKey || Config.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId || !metadata) {
      Logger.log('BoxFileOperations.applyMetadata: all parameters required');
      return false;
    }
    
    var utils = initUtils_();
    Logger.log('BoxFileOperations.applyMetadata: Attempting to apply to fileId: ' + fileId + '. Metadata PAYLOAD to be sent: ' + JSON.stringify(metadata, null, 2));

    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + templateKey;
      
      // Try POST first (create)
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
      }, 'applyMetadata POST for file ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 201) {
        return true;
      } else if (responseCode === 409) {
        // Conflict - metadata exists, try update
        return ns.updateMetadata(fileId, metadata, accessToken, templateKey);
      } else {
        var errorText = response.getContentText();
        Logger.log('BoxFileOperations: Error applying metadata to ' + fileId + 
                  '. Code: ' + responseCode + ', Response: ' + errorText.substring(0, 300));
        return false;
      }
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception applying metadata to ' + fileId + 
                ': ' + error.toString());
      return false;
    }
  };
  
  /**
   * Updates metadata using JSON Patch operations with robust error handling.
   * @param {string} fileId Box file ID
   * @param {object} metadataToUpdate Metadata updates
   * @param {string} accessToken Valid Box access token
   * @param {string} templateKey Metadata template key
   * @returns {boolean} Success status
   */
  ns.updateMetadata = function(fileId, metadataToUpdate, accessToken, templateKey) {
    templateKey = templateKey || Config.BOX_METADATA_TEMPLATE_KEY;
    
    if (!accessToken || !fileId || !metadataToUpdate) {
      Logger.log('BoxFileOperations.updateMetadata: all parameters required');
      return false;
    }
    
    try {
      var currentMetadata = ns.getCurrentMetadata(fileId, accessToken, templateKey);
      if (!currentMetadata) {
        Logger.log('BoxFileOperations: Cannot update - no current metadata for file ' + fileId);
        return false;
      }
      
      var updates = [];
      
      // Build JSON patch operations
      Object.keys(metadataToUpdate).forEach(function(key) {
        if (metadataToUpdate.hasOwnProperty(key)) {
          if (currentMetadata.hasOwnProperty(key)) {
            // Field exists, check if different
            if (JSON.stringify(currentMetadata[key]) !== JSON.stringify(metadataToUpdate[key])) {
              updates.push({ 
                op: 'replace', 
                path: '/' + key, 
                value: metadataToUpdate[key] 
              });
            }
          } else {
            // Field doesn't exist, add it
            updates.push({ 
              op: 'add', 
              path: '/' + key, 
              value: metadataToUpdate[key] 
            });
          }
        }
      });
      
      if (updates.length === 0) {
        return true; // No changes needed
      }
      
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + templateKey;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': 'Bearer ' + accessToken,
            'Content-Type': 'application/json-patch+json'
          },
          payload: JSON.stringify(updates),
          muteHttpExceptions: true
        });
      }, 'updateMetadata PUT for file ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 200 || responseCode === 201) {
        return true;
      } else {
        var errorText = response.getContentText();
        Logger.log('BoxFileOperations: Error updating metadata for ' + fileId + 
                  '. Code: ' + responseCode + ', Response: ' + errorText.substring(0, 300));
        return false;
      }
      
    } catch (error) {
      Logger.log('BoxFileOperations: Exception updating metadata for ' + fileId + 
                ': ' + error.toString());
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
    if (!accessToken || !imageFile || !imageFile.id) {
      Logger.log('BoxFileOperations.attachTemplateToImage: imageFile and accessToken required');
      return 'error';
    }
    
    try {
      if (ns.hasExistingMetadata(imageFile.id, accessToken, Config.BOX_METADATA_TEMPLATE_KEY)) {
        return 'skipped';
      }
      
      var emptyMetadata = {
        processingStage: Config.PROCESSING_STAGE_UNPROCESSED,
        lastProcessedDate: new Date().toISOString()
      };
      
      var url = Config.BOX_API_BASE_URL + '/files/' + imageFile.id + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + Config.BOX_METADATA_TEMPLATE_KEY;
      
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
      }, 'attachTemplateToImage for ' + imageFile.name);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 201) {
        return 'attached';
      } else if (responseCode === 409) {
        return 'skipped'; // Already exists
      } else {
        Logger.log('BoxFileOperations: Failed to attach template to ' + imageFile.name + 
                  '. Code: ' + responseCode);
        return 'error';
      }
      
    } catch (error) {
      var errorStr = error.toString();
      if (errorStr.includes('item_already_has_metadata_instance') || 
          errorStr.includes('constraint_violated')) {
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
    if (!accessToken) {
      throw new Error('BoxFileOperations.attachTemplateToAllImages: accessToken required');
    }
    
    var utils = initUtils_();
    
    Logger.log('=== BoxFileOperations: Attaching Template to All Images ===');
    
    try {
      // Get template first
      var template = getOrCreateImageTemplate(accessToken);
      if (!template) {
        throw new Error('Could not create or find template');
      }
      
      Logger.log('✅ Using template: ' + template.displayName);
      
      var allImages = ns.findAllImageFiles(Config.DEFAULT_PROCESSING_FOLDER_ID, accessToken);
      Logger.log('📊 Found ' + allImages.length + ' image files total');
      
      if (allImages.length === 0) {
        Logger.log('No image files found to process');
        return;
      }
      
      var stats = { processed: 0, attached: 0, skipped: 0, errors: 0 };
      
      // Process in batches
      for (var i = 0; i < allImages.length; i += Config.METADATA_ATTACHMENT_BATCH_SIZE) {
        var batch = allImages.slice(i, i + Config.METADATA_ATTACHMENT_BATCH_SIZE);
        var batchNum = Math.floor(i / Config.METADATA_ATTACHMENT_BATCH_SIZE) + 1;
        var totalBatches = Math.ceil(allImages.length / Config.METADATA_ATTACHMENT_BATCH_SIZE);
        
        Logger.log('Processing batch ' + batchNum + ' of ' + totalBatches + 
                  ' (' + batch.length + ' files)');
        
        batch.forEach(function(image, indexInBatch) {
          try {
            var result = ns.attachTemplateToImage(image, accessToken);
            stats.processed++;
            
            if (result === 'attached') stats.attached++;
            else if (result === 'skipped') stats.skipped++;
            else stats.errors++;
            
            if (stats.processed % 10 === 0) {
              Logger.log('Progress: ' + stats.processed + '/' + allImages.length + 
                        ' (Attached: ' + stats.attached + ', Skipped: ' + stats.skipped + 
                        ', Errors: ' + stats.errors + ')');
            }
            
            // Delay between files
            if (indexInBatch > 0 && (indexInBatch + 1) % 5 === 0) {
              Utilities.sleep(Config.METADATA_ATTACHMENT_FILE_DELAY_MS);
            }
            
          } catch (error) {
            Logger.log('BoxFileOperations: Error processing ' + image.name + 
                      ': ' + error.toString());
            stats.errors++;
            stats.processed++;
          }
        });
        
        // Delay between batches
        if (i + Config.METADATA_ATTACHMENT_BATCH_SIZE < allImages.length) {
          Logger.log('Pausing ' + (Config.METADATA_ATTACHMENT_BATCH_DELAY_MS / 1000) + 
                    's between batches...');
          Utilities.sleep(Config.METADATA_ATTACHMENT_BATCH_DELAY_MS);
        }
      }
      
      Logger.log('\n=== Template Attachment Complete ===');
      Logger.log('📊 Total processed: ' + stats.processed);
      Logger.log('✅ Successfully attached: ' + stats.attached);
      Logger.log('⏭️ Skipped (already had template): ' + stats.skipped);
      Logger.log('❌ Errors: ' + stats.errors);
      
    } catch (error) {
      Logger.log('BoxFileOperations: Fatal error in attachTemplateToAllImages: ' + 
                error.toString());
      throw error;
    }
  };
  
  // Return the public interface
  return ns;
})();