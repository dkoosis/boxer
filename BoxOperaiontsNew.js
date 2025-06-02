// File: BoxOperations.gs
// Box API operations using Bruce McPherson's cUseful library
// Robust file operations with exponential backoff and proper error handling
// Depends on: Config.gs, BoxAuth.gs

/**
 * BoxOperations namespace following Bruce McPherson's patterns.
 * Provides robust Box API operations using cUseful utilities.
 */
var BoxOperations = (function() {
  'use strict';
  
  var ns = {};
  var utils_ = null;
  
  /**
   * Initialize cUseful utilities following Bruce's dependency pattern.
   * @returns {object} cUseful utilities
   * @private
   */
  function initUtils_() {
    if (!utils_) {
      try {
        utils_ = cUseful;
        Logger.log('BoxOperations: cUseful library initialized');
      } catch (e) {
        Logger.log('ERROR: BoxOperations - cUseful library not available: ' + e.toString());
        throw new Error('cUseful library is required but not available');
      }
    }
    return utils_;
  }
  
  /**
   * Make robust API calls with Bruce's exponential backoff pattern.
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
        Logger.log('BoxOperations: API call failed in ' + context + ': ' + error.toString());
        throw error;
      }
    }, undefined, undefined, undefined, undefined, function(result) {
      // Custom checker for Box API specific retryable errors
      if (result && typeof result.getResponseCode === 'function') {
        var code = result.getResponseCode();
        if (code === 429 || code === 500 || code === 502 || code === 503 || code === 504) {
          Logger.log('BoxOperations: Retryable HTTP error ' + code + ' in ' + context);
          throw utils.rateLimitExpBackoff.TRYAGAIN; // Signal retry
        }
      }
      return result;
    });
  }
  
  /**
   * Find image files using Box search API (more efficient than folder traversal).
   * @param {number} limit Maximum number of files to return
   * @returns {object[]} Array of image file objects
   */
  ns.findImageFiles = function(limit) {
    limit = limit || 100;
    var accessToken = BoxAuth.getAccessToken();
    var allFiles = [];
    var seenIds = new Set();
    
    // Search queries for different image types
    var searchQueries = [
      'type:file .jpg',
      'type:file .png', 
      'type:file .jpeg',
      'type:file .gif'
    ];
    
    try {
      for (var i = 0; i < searchQueries.length && allFiles.length < limit; i++) {
        var query = searchQueries[i];
        var searchLimit = Math.min(50, limit - allFiles.length);
        var searchUrl = Config.BOX_API_BASE_URL + '/search?query=' + encodeURIComponent(query) + 
                       '&limit=' + searchLimit + '&fields=id,name,size,created_at,modified_at,parent';
        
        var response = makeRobustApiCall_(function() {
          return UrlFetchApp.fetch(searchUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
          });
        }, 'findImageFiles search for ' + query);
        
        if (response.getResponseCode() === 200) {
          var data = JSON.parse(response.getContentText());
          
          for (var j = 0; j < data.entries.length; j++) {
            var file = data.entries[j];
            
            if (!seenIds.has(file.id) && Config.isImageFile(file.name)) {
              seenIds.add(file.id);
              allFiles.push(file);
              
              if (allFiles.length >= limit) break;
            }
          }
        } else {
          Logger.log('BoxOperations: Search failed for "' + query + '": ' + response.getResponseCode());
        }
        
        // Rate limiting between searches
        Utilities.sleep(Config.IMAGE_PROCESSING_FILE_DELAY_MS);
      }
      
      Logger.log('BoxOperations: Found ' + allFiles.length + ' image files');
      return allFiles;
      
    } catch (error) {
      Logger.log('BoxOperations: Exception in findImageFiles: ' + error.toString());
      return allFiles; // Return what we found so far
    }
  };
  
  /**
   * Get detailed file information.
   * @param {string} fileId Box file ID
   * @returns {object|null} File details or null on failure
   */
  ns.getFileDetails = function(fileId) {
    if (!fileId) {
      throw new Error('BoxOperations.getFileDetails: fileId is required');
    }
    
    var accessToken = BoxAuth.getAccessToken();
    
    try {
      var fieldsToFetch = 'id,name,size,path_collection,created_at,modified_at,parent';
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '?fields=' + fieldsToFetch;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'getFileDetails for ' + fileId);
      
      if (response.getResponseCode() === 200) {
        return JSON.parse(response.getContentText());
      } else {
        Logger.log('BoxOperations: Failed to get file details for ' + fileId + ': ' + response.getResponseCode());
        return null;
      }
      
    } catch (error) {
      Logger.log('BoxOperations: Exception getting file details for ' + fileId + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Check if file has metadata following Bruce's patterns.
   * @param {string} fileId Box file ID
   * @returns {boolean} True if metadata exists
   */
  ns.hasMetadata = function(fileId) {
    if (!fileId) {
      Logger.log('BoxOperations.hasMetadata: fileId is required');
      return false;
    }
    
    var accessToken = BoxAuth.getAccessToken();
    
    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + Config.BOX_METADATA_TEMPLATE_KEY;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'HEAD', // Just check existence
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'hasMetadata for ' + fileId);
      
      return response.getResponseCode() === 200;
      
    } catch (error) {
      Logger.log('BoxOperations: Exception checking metadata for ' + fileId + ': ' + error.toString());
      return false;
    }
  };
  
  /**
   * Get current metadata for a file.
   * @param {string} fileId Box file ID
   * @returns {object|null} Metadata object or null
   */
  ns.getCurrentMetadata = function(fileId) {
    if (!fileId) {
      Logger.log('BoxOperations.getCurrentMetadata: fileId is required');
      return null;
    }
    
    var accessToken = BoxAuth.getAccessToken();
    
    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + Config.BOX_METADATA_TEMPLATE_KEY;
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          method: 'GET',
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'getCurrentMetadata for ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 200) {
        return JSON.parse(response.getContentText());
      } else if (responseCode === 404) {
        return null; // No metadata found
      } else {
        Logger.log('BoxOperations: Error getting metadata for ' + fileId + ': ' + responseCode);
        return null;
      }
      
    } catch (error) {
      Logger.log('BoxOperations: Exception getting metadata for ' + fileId + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Apply metadata to file with create/update logic following Bruce's patterns.
   * @param {string} fileId Box file ID
   * @param {object} metadata Metadata to apply
   * @returns {boolean} Success status
   */
  ns.applyMetadata = function(fileId, metadata) {
    if (!fileId || !metadata) {
      Logger.log('BoxOperations.applyMetadata: fileId and metadata are required');
      return false;
    }
    
    var accessToken = BoxAuth.getAccessToken();
    
    try {
      var url = Config.BOX_API_BASE_URL + '/files/' + fileId + '/metadata/' + 
                Config.BOX_METADATA_SCOPE + '/' + Config.BOX_METADATA_TEMPLATE_KEY;
      
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
      }, 'applyMetadata POST for ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 201) {
        return true;
      } else if (responseCode === 409) {
        // Conflict - metadata exists, try update
        return ns.updateMetadata(fileId, metadata);
      } else {
        var errorText = response.getContentText();
        Logger.log('BoxOperations: Error applying metadata to ' + fileId + 
                  '. Code: ' + responseCode + ', Response: ' + errorText.substring(0, 300));
        return false;
      }
      
    } catch (error) {
      Logger.log('BoxOperations: Exception applying metadata to ' + fileId + ': ' + error.toString());
      return false;
    }
  };
  
  /**
   * Update existing metadata using JSON Patch operations.
   * @param {string} fileId Box file ID
   * @param {object} metadataToUpdate Metadata updates
   * @returns {boolean} Success status
   */
  ns.updateMetadata = function(fileId, metadataToUpdate) {
    if (!fileId || !metadataToUpdate) {
      Logger.log('BoxOperations.updateMetadata: fileId and metadataToUpdate are required');
      return false;
    }
    
    try {
      var currentMetadata = ns.getCurrentMetadata(fileId);
      if (!currentMetadata) {
        Logger.log('BoxOperations: Cannot update - no current metadata for ' + fileId);
        return false;
      }
      
      var updates = [];
      var accessToken = BoxAuth.getAccessToken();
      
      // Build JSON patch operations following Box API patterns
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
                Config.BOX_METADATA_SCOPE + '/' + Config.BOX_METADATA_TEMPLATE_KEY;
      
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
      }, 'updateMetadata PUT for ' + fileId);
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 200 || responseCode === 201) {
        return true;
      } else {
        var errorText = response.getContentText();
        Logger.log('BoxOperations: Error updating metadata for ' + fileId + 
                  '. Code: ' + responseCode + ', Response: ' + errorText.substring(0, 300));
        return false;
      }
      
    } catch (error) {
      Logger.log('BoxOperations: Exception updating metadata for ' + fileId + ': ' + error.toString());
      return false;
    }
  };
  
  /**
   * Download file content for processing (e.g., EXIF extraction, Vision API).
   * @param {string} fileId Box file ID
   * @returns {object|null} Blob object or null on failure
   */
  ns.downloadFile = function(fileId) {
    if (!fileId) {
      throw new Error('BoxOperations.downloadFile: fileId is required');
    }
    
    var accessToken = BoxAuth.getAccessToken();
    
    try {
      var downloadUrl = Config.BOX_API_BASE_URL + '/files/' + fileId + '/content';
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(downloadUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'downloadFile for ' + fileId);
      
      if (response.getResponseCode() === 200) {
        return response.getBlob();
      } else {
        Logger.log('BoxOperations: Failed to download file ' + fileId + ': ' + response.getResponseCode());
        return null;
      }
      
    } catch (error) {
      Logger.log('BoxOperations: Exception downloading file ' + fileId + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Get files in a specific folder (fallback when search doesn't work).
   * @param {string} folderId Box folder ID
   * @param {number} limit Maximum number of items to return
   * @returns {object[]} Array of image files in folder
   */
  ns.getImagesInFolder = function(folderId, limit) {
    folderId = folderId || Config.DEFAULT_PROCESSING_FOLDER_ID;
    limit = limit || Config.DEFAULT_API_ITEM_LIMIT;
    
    var accessToken = BoxAuth.getAccessToken();
    var imageFiles = [];
    
    try {
      var url = Config.BOX_API_BASE_URL + '/folders/' + folderId + '/items?limit=' + 
                limit + '&fields=id,name,type,size,created_at,modified_at';
      
      var response = makeRobustApiCall_(function() {
        return UrlFetchApp.fetch(url, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      }, 'getImagesInFolder for ' + folderId);
      
      if (response.getResponseCode() === 200) {
        var data = JSON.parse(response.getContentText());
        
        data.entries.forEach(function(item) {
          if (item.type === 'file' && Config.isImageFile(item.name)) {
            imageFiles.push(item);
          }
        });
        
        Logger.log('BoxOperations: Found ' + imageFiles.length + ' images in folder ' + folderId);
      } else {
        Logger.log('BoxOperations: Failed to list folder ' + folderId + ': ' + response.getResponseCode());
      }
      
      return imageFiles;
      
    } catch (error) {
      Logger.log('BoxOperations: Exception listing folder ' + folderId + ': ' + error.toString());
      return imageFiles;
    }
  };
  
  return ns;
})();