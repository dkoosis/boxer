// File: MetadataExtraction.gs (Refactored with Bruce McPherson's patterns)
// Depends on: Config.gs, BoxFileOperations.gs, cUseful library
// Following Bruce McPherson's organizational patterns with proper error handling

/**
 * MetadataExtraction namespace following Bruce's patterns
 * Provides robust metadata extraction with utility functions from cUseful
 */
var MetadataExtraction = (function() {
  'use strict';
  
  // Private namespace
  var ns = {};
  
  // Initialize cUseful utilities once
  var utils_ = null;
  
  /**
   * Initialize utilities following Bruce's dependency-free pattern
   * @returns {object} cUseful utilities object
   * @private
   */
  function initUtils_() {
    if (!utils_) {
      try {
        utils_ = cUseful;
        Logger.log('MetadataExtraction: cUseful library initialized');
      } catch (e) {
        Logger.log('ERROR: MetadataExtraction - cUseful library not available: ' + e.toString());
        throw new Error('cUseful library is required but not available');
      }
    }
    return utils_;
  }
  
  /**
   * Mathematical utilities using Bruce's approach
   * @private
   */
  var MathUtils_ = {
    /**
     * Calculates GCD using Bruce's functional style
     * @param {number} a First number
     * @param {number} b Second number
     * @returns {number} Greatest common divisor
     */
    gcd: function(a, b) {
      return b === 0 ? a : MathUtils_.gcd(b, a % b);
    },
    
    /**
     * Calculates aspect ratio
     * @param {number} width Image width
     * @param {number} height Image height
     * @returns {string|null} Aspect ratio as string or null
     */
    calculateAspectRatio: function(width, height) {
      if (!width || !height || width <= 0 || height <= 0) {
        return null;
      }
      var divisor = MathUtils_.gcd(width, height);
      return (width / divisor) + ':' + (height / divisor);
    }
  };
  
  /**
   * Content analysis utilities using Bruce's patterns
   * @private
   */
  var ContentAnalyzer_ = {
    /**
     * Maps location keywords to enum values
     * @private
     */
    locationKeywordMap_: {
      'main_lobby': ['lobby', 'reception', 'front desk'],
      'studio_1': ['studio 1', 'studio one', 'studio-1'],
      'fabrication_workshop': ['fabrication', 'workshop', 'fab shop', 'fab_shop'],
      'metal_shop': ['metal shop', 'metalwork', 'metal_shop'],
      'wood_shop': ['wood shop', 'carpentry', 'wood_shop'],
      'paint_booth': ['paint booth', 'paint_booth'],
      'assembly_area': ['assembly', 'assembly area'],
      'storage_warehouse': ['storage', 'warehouse'],
      'office_space': ['office', 'office space'],
      'conference_room': ['conference', 'meeting room'],
      'gallery_space': ['gallery', 'exhibition'],
      'outdoor_yard': ['outdoor', 'yard', 'outside'],
      'loading_dock': ['loading', 'dock'],
      'unknown': []
    },
    
    /**
     * Analyzes content type based on path and filename
     * @param {string} folderPath Folder path
     * @param {string} filename Filename
     * @returns {object} Analysis results
     */
    analyzeContent: function(folderPath, filename) {
      var lowerPath = folderPath.toLowerCase();
      var lowerName = filename.toLowerCase();
      
      var analysis = {
        contentType: 'other',
        facilityLocation: 'unknown',
        department: 'general',
        keywords: '',
        usageRights: 'internal_only',
        importance: 'medium',
        needsReview: 'no',
        projectName: null
      };
      
      // Content type rules using Bruce's approach to rule-based analysis
      var contentRules = [
        {
          test: function() { 
            return lowerPath.includes('logo') || lowerName.includes('logo') || 
                   lowerPath.includes('brand') || lowerName.includes('brand'); 
          },
          apply: function() {
            analysis.contentType = 'marketing_material';
            analysis.department = 'marketing';
            analysis.usageRights = 'marketing_approved';
            analysis.importance = 'high';
          }
        },
        {
          test: function() { 
            return lowerPath.includes('team') || lowerPath.includes('staff') || 
                   lowerName.includes('portrait'); 
          },
          apply: function() {
            analysis.contentType = 'team_portrait';
            analysis.department = 'administration';
          }
        },
        {
          test: function() { 
            return lowerPath.includes('event') || lowerName.includes('event') || 
                   lowerPath.includes('opening') || lowerPath.includes('ceremony'); 
          },
          apply: function() {
            analysis.contentType = 'event_photo';
            analysis.importance = 'high';
          }
        },
        {
          test: function() { 
            return lowerPath.includes('fabrication') || lowerPath.includes('workshop') || 
                   lowerName.includes('fab') || lowerName.includes('wip'); 
          },
          apply: function() {
            analysis.contentType = 'fabrication_process';
            analysis.department = 'fabrication';
            analysis.facilityLocation = 'fabrication_workshop';
          }
        },
        {
          test: function() { 
            return lowerPath.includes('artwork') || lowerName.includes('art') || 
                   lowerPath.includes('piece') || lowerPath.includes('sculpture'); 
          },
          apply: function() {
            analysis.contentType = 'artwork';
            analysis.department = 'design';
            analysis.importance = 'high';
          }
        }
      ];
      
      // Apply first matching rule
      contentRules.some(function(rule) {
        if (rule.test()) {
          rule.apply();
          return true; // Stop at first match
        }
        return false;
      });
      
      // Location analysis
      Object.keys(ContentAnalyzer_.locationKeywordMap_).some(function(locKey) {
        var keywords = ContentAnalyzer_.locationKeywordMap_[locKey];
        var matchFound = keywords.some(function(keyword) {
          return lowerPath.includes(keyword) || lowerName.includes(keyword);
        });
        
        if (matchFound) {
          analysis.facilityLocation = locKey;
          return true; // Stop at first match
        }
        return false;
      });
      
      // Generate keywords using Bruce's functional approach
      var pathSegments = folderPath.split('/').filter(function(p) {
        return p.length > 2 && 
               p.toLowerCase() !== 'files' && 
               p.toLowerCase() !== 'all files' && 
               p.toLowerCase() !== 'root';
      });
      
      var nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
      var cleanedName = nameWithoutExt
        .replace(/(\d+)[xX](\d+)/g, '') // Remove dimensions
        .replace(/[_-]/g, ' ')          // Replace separators
        .replace(/\s+/g, ' ')           // Normalize spaces
        .trim();
      
      var nameKeywords = cleanedName.split(' ').filter(function(k) {
        return k.length > 2;
      });
      
      // Use Set-like behavior for deduplication (Bruce's approach)
      var allKeywords = pathSegments.concat(nameKeywords);
      var uniqueKeywords = [];
      var seen = {};
      
      allKeywords.forEach(function(keyword) {
        var lower = keyword.toLowerCase();
        if (lower && !seen[lower]) {
          seen[lower] = true;
          uniqueKeywords.push(lower);
        }
      });
      
      analysis.keywords = uniqueKeywords.join(', ');
      analysis.subject = cleanedName || nameWithoutExt;
      
      return analysis;
    }
  };
  
  /**
   * Extracts comprehensive metadata from file details
   * @param {object} fileDetails File details from Box API
   * @returns {object} Extracted metadata
   */
  ns.extractComprehensiveMetadata = function(fileDetails) {
    if (!fileDetails || !fileDetails.id || !fileDetails.name) {
      throw new Error('MetadataExtraction: fileDetails with id and name required');
    }
    
    var utils = initUtils_();
    
    try {
      // Build folder path using Bruce's approach
      var folderPathString = 'N/A';
      
      if (fileDetails.path_collection && fileDetails.path_collection.entries) {
        if (fileDetails.path_collection.entries.length > 1) {
          folderPathString = fileDetails.path_collection.entries.slice(1)
            .map(function(p) { return p.name; })
            .join('/');
        } else if (fileDetails.path_collection.entries.length === 1 && 
                   fileDetails.path_collection.entries[0].id !== '0') {
          folderPathString = fileDetails.path_collection.entries[0].name;
        } else if (fileDetails.parent) {
          folderPathString = fileDetails.parent.id === '0' ? '' : 
                            (fileDetails.parent.name || 'N/A');
        }
      } else if (fileDetails.parent) {
        folderPathString = fileDetails.parent.id === '0' ? '' : 
                          (fileDetails.parent.name || 'N/A');
      }
      
      // Extract file format
      var fileFormat = fileDetails.name.includes('.') ? 
        fileDetails.name.split('.').pop().toUpperCase() : 'UNKNOWN';
      
      // Extract dimensions from filename (basic approach)
      var imageWidth = null;
      var imageHeight = null;
      var aspectRatio = null;
      var megapixels = null;
      
      var dimensionMatch = fileDetails.name.match(/(\d+)[xX](\d+)/);
      if (dimensionMatch) {
        imageWidth = parseInt(dimensionMatch[1], 10);
        imageHeight = parseInt(dimensionMatch[2], 10);
        
        if (imageWidth && imageHeight && imageWidth > 0 && imageHeight > 0) {
          aspectRatio = MathUtils_.calculateAspectRatio(imageWidth, imageHeight);
          megapixels = Math.round((imageWidth * imageHeight) / 1000000 * 10) / 10;
        } else {
          imageWidth = null;
          imageHeight = null;
        }
      }
      
      // Analyze content
      var contentAnalysis = ContentAnalyzer_.analyzeContent(folderPathString, fileDetails.name);
      
      // Build metadata object using Bruce's conditional property pattern
      var metadata = {
        originalFilename: fileDetails.name,
        folderPath: folderPathString,
        fileSizeMB: fileDetails.size ? 
          Math.round(fileDetails.size / (1024 * 1024) * 100) / 100 : null,
        fileFormat: fileFormat,
        contentType: contentAnalysis.contentType,
        subject: contentAnalysis.subject,
        facilityLocation: contentAnalysis.facilityLocation,
        department: contentAnalysis.department,
        manualKeywords: contentAnalysis.keywords,
        usageRights: contentAnalysis.usageRights,
        importance: contentAnalysis.importance,
        processingStage: PROCESSING_STAGE_BASIC,
        lastProcessedDate: new Date().toISOString(),
        processingVersion: PROCESSING_VERSION_BASIC,
        needsReview: contentAnalysis.needsReview || 'no'
      };
      
      // Conditionally add properties (Bruce's approach)
      if (imageWidth !== null) metadata.imageWidth = imageWidth;
      if (imageHeight !== null) metadata.imageHeight = imageHeight;
      if (aspectRatio) metadata.aspectRatio = aspectRatio;
      if (megapixels !== null) metadata.megapixels = megapixels;
      if (contentAnalysis.projectName) metadata.projectName = contentAnalysis.projectName;
      if (fileDetails.created_at) metadata.dateTaken = fileDetails.created_at;
      
      return metadata;
      
    } catch (error) {
      Logger.log('MetadataExtraction: Error extracting metadata for ' + 
                fileDetails.name + ': ' + error.toString());
      throw error;
    }
  };
  
  /**
   * Processes a single image with basic metadata extraction
   * @param {object} fileEntry File entry from Box API
   * @param {string} accessToken Valid Box access token
   */
  ns.processSingleImageBasic = function(fileEntry, accessToken) {
    if (!accessToken || !fileEntry || !fileEntry.id) {
      throw new Error('MetadataExtraction: fileEntry and accessToken required');
    }
    
    var utils = initUtils_();
    
    try {
      // Check current metadata state
      var currentMetadata = BoxFileOperations.getCurrentMetadata(fileEntry.id, accessToken);
      var currentStage = currentMetadata ? currentMetadata.processingStage : 
                        PROCESSING_STAGE_UNPROCESSED;
      
      // Skip if already processed
      var skipStages = [
        PROCESSING_STAGE_COMPLETE,
        PROCESSING_STAGE_AI,
        PROCESSING_STAGE_EXIF,
        PROCESSING_STAGE_BASIC
      ];
      
      if (skipStages.indexOf(currentStage) !== -1) {
        return; // Already processed
      }
      
      // Fetch full file details with robust error handling
      var fileDetailsUrl = BOX_API_BASE_URL + '/files/' + fileEntry.id + 
                          '?fields=id,name,size,path_collection,created_at,parent';
      
      var response = utils.rateLimitExpBackoff(function() {
        return UrlFetchApp.fetch(fileDetailsUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log('MetadataExtraction: Failed to fetch details for ' + fileEntry.name);
        return;
      }
      
      var fileDetails = JSON.parse(response.getContentText());
      var metadataToApply = ns.extractComprehensiveMetadata(fileDetails);
      
      // Apply metadata using the new namespace
      var success = BoxFileOperations.applyMetadata(fileEntry.id, metadataToApply, accessToken);
      
      if (success) {
        Logger.log('✅ Basic processing successful for: ' + fileEntry.name);
      } else {
        Logger.log('❌ Failed basic processing for: ' + fileEntry.name);
      }
      
    } catch (error) {
      Logger.log('MetadataExtraction: Exception processing ' + fileEntry.name + 
                ': ' + error.toString());
      throw error;
    }
  };
  
  /**
   * Processes images in folders with proper batching and delays
   * @param {string[]} folderIdsToProcess Array of folder IDs
   * @param {string} accessToken Valid Box access token
   */
  ns.processImagesInFoldersBasic = function(folderIdsToProcess, accessToken) {
    if (!accessToken) {
      throw new Error('MetadataExtraction: accessToken required');
    }
    
    if (!folderIdsToProcess || !Array.isArray(folderIdsToProcess) || 
        folderIdsToProcess.length === 0) {
      throw new Error('MetadataExtraction: folderIdsToProcess must be non-empty array');
    }
    
    var utils = initUtils_();
    
    folderIdsToProcess.forEach(function(folderId) {
      Logger.log('MetadataExtraction: Processing folder ID: ' + folderId);
      
      try {
        var listUrl = BOX_API_BASE_URL + '/folders/' + folderId + '/items?limit=' + 
                     DEFAULT_API_ITEM_LIMIT + '&fields=id,name,type';
        
        var response = utils.rateLimitExpBackoff(function() {
          return UrlFetchApp.fetch(listUrl, {
            headers: { 'Authorization': 'Bearer ' + accessToken },
            muteHttpExceptions: true
          });
        });
        
        if (response.getResponseCode() !== 200) {
          Logger.log('MetadataExtraction: Failed to list items in folder ' + folderId);
          return;
        }
        
        var listData = JSON.parse(response.getContentText());
        var imageFileEntries = listData.entries.filter(function(item) {
          return item.type === 'file' && BoxFileOperations.isImageFile(item.name);
        });
        
        Logger.log('Found ' + imageFileEntries.length + ' image(s) in folder ' + folderId);
        
        imageFileEntries.forEach(function(fileEntry, index) {
          ns.processSingleImageBasic(fileEntry, accessToken);
          
          // Add delay every 10 files
          if ((index + 1) % 10 === 0 && imageFileEntries.length > (index + 1)) {
            Logger.log('Pausing ' + (IMAGE_PROCESSING_FILE_DELAY_MS / 1000) + 
                      's after processing 10 images...');
            Utilities.sleep(IMAGE_PROCESSING_FILE_DELAY_MS);
          }
        });
        
      } catch (error) {
        Logger.log('MetadataExtraction: Error processing folder ' + folderId + 
                  ': ' + error.toString());
      }
    });
  };
  
  // Return public interface
  return ns;
})();
