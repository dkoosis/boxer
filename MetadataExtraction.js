// File: MetadataExtraction.gs
// Metadata extraction using Bruce McPherson's organizational patterns
// Uses cUseful library by Bruce McPherson for robust operations
// Depends on: Config.gs, BoxFileOperations.gs

/**
 * MetadataExtraction namespace following Bruce McPherson's patterns.
 * Provides robust metadata extraction with utility functions from cUseful.
 */
var MetadataExtraction = (function() {
  'use strict';
  
  var ns = {};
  var utils_ = null;
  
  /**
   * Initialize utilities following Bruce's dependency-free pattern.
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
   * Mathematical utilities using Bruce's approach.
   * @private
   */
  var MathUtils_ = {
    /**
     * Calculates GCD using Bruce's functional style.
     * @param {number} a First number
     * @param {number} b Second number
     * @returns {number} Greatest common divisor
     */
    gcd: function(a, b) {
      return b === 0 ? a : MathUtils_.gcd(b, a % b);
    },
    
    /**
     * Calculates aspect ratio.
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
   * Content analysis utilities using Bruce's patterns.
   * @private
   */
  var ContentAnalyzer_ = {
    /**
     * Maps location keywords to enum values.
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
     * Analyzes content type based on path and filename.
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
   * Extracts comprehensive metadata from file details.
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
        processingStage: Config.PROCESSING_STAGE_BASIC,
        lastProcessedDate: new Date().toISOString(),
        processingVersion: Config.PROCESSING_VERSION_BASIC,
        buildNumber: Config.getCurrentBuild(),
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
   * Processes a single image with basic metadata extraction.
   * @param {object} fileEntry File entry from Box API
   * @param {string} accessToken Valid Box access token
   */
  ns.processSingleImageBasic = function(fileEntry, accessToken) {
    if (!accessToken || !fileEntry || !fileEntry.id) {
      throw new Error('MetadataExtraction: fileEntry and accessToken required');
    }
    
    var utils = initUtils_();
    
    try {
      // Check if processing needed (including build updates)
      var currentMetadata = BoxFileOperations.getCurrentMetadata(fileEntry.id, accessToken);
      var needsProcessing = !currentMetadata || 
                           currentMetadata.processingStage === Config.PROCESSING_STAGE_UNPROCESSED ||
                           Config.shouldReprocessForBuild(currentMetadata.buildNumber);
      
      if (!needsProcessing) {
        return; // Skip if up-to-date
      }
      
      var reason = !currentMetadata ? 'new' : 
                   Config.shouldReprocessForBuild(currentMetadata.buildNumber) ? 'build_update' : 'incomplete';
      Logger.log('🐕 Processing ' + fileEntry.name + ' (' + reason + ')');
      
      // Fetch full file details with robust error handling
      var fileDetailsUrl = Config.BOX_API_BASE_URL + '/files/' + fileEntry.id + 
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
      
      // Apply metadata using the namespace
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
   * Processes images in folders with proper batching and delays.
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
        var listUrl = Config.BOX_API_BASE_URL + '/folders/' + folderId + '/items?limit=' + 
                     Config.DEFAULT_API_ITEM_LIMIT + '&fields=id,name,type';
        
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
            Logger.log('Pausing ' + (Config.IMAGE_PROCESSING_FILE_DELAY_MS / 1000) + 
                      's after processing 10 images...');
            Utilities.sleep(Config.IMAGE_PROCESSING_FILE_DELAY_MS);
          }
        });
        
      } catch (error) {
        Logger.log('MetadataExtraction: Error processing folder ' + folderId + 
                  ': ' + error.toString());
      }
    });
  };
  
  /**
   * Extracts metadata combining basic info, EXIF, and Vision API analysis.
   * @param {object} fileDetails Full file details from Box API
   * @param {string} accessToken Valid Box access token
   * @returns {object} Enhanced metadata object
   */
  ns.extractMetadata = function(fileDetails, accessToken) {
    // Start with basic metadata
    var basicMetadata = ns.extractComprehensiveMetadata(fileDetails);
    var combinedMetadata = JSON.parse(JSON.stringify(basicMetadata)); // Deep copy

    // Extract EXIF data
    var exifData = extractMetadata(fileDetails.id, accessToken);
    if (exifData && exifData.hasExif) {
      if (exifData.cameraModel) combinedMetadata.cameraModel = exifData.cameraModel;
      if (exifData.dateTaken) combinedMetadata.dateTaken = exifData.dateTaken;
      combinedMetadata.processingStage = Config.PROCESSING_STAGE_EXIF;
    }
    
    // Analyze with Vision API
    var visionAnalysis = analyzeImageWithVisionImproved(fileDetails.id, accessToken);
    
    if (visionAnalysis && !visionAnalysis.error) {
      combinedMetadata.aiDetectedObjects = visionAnalysis.objects ? 
        visionAnalysis.objects.map(function(obj) { return obj.name + ' (' + obj.confidence + ')'; }).join('; ') : '';
      combinedMetadata.aiSceneDescription = visionAnalysis.sceneDescription || '';
      combinedMetadata.extractedText = visionAnalysis.text ? 
        visionAnalysis.text.replace(/\n/g, ' ').substring(0, Config.MAX_TEXT_EXTRACTION_LENGTH) : '';
      combinedMetadata.dominantColors = visionAnalysis.dominantColors ? 
        visionAnalysis.dominantColors.map(function(c) { return c.rgb + ' (' + c.score + ', ' + c.pixelFraction + ')'; }).join('; ') : '';
      combinedMetadata.aiConfidenceScore = visionAnalysis.confidenceScore || 0;
      combinedMetadata.processingStage = Config.PROCESSING_STAGE_AI;
      
      // Apply AI-driven content enhancements
      var aiEnhancements = ns.enhanceContentAnalysisWithAI(combinedMetadata, visionAnalysis, fileDetails.name, combinedMetadata.folderPath);
      Object.keys(aiEnhancements).forEach(function(key) {
        combinedMetadata[key] = aiEnhancements[key];
      });
      
    } else if (visionAnalysis && visionAnalysis.error) {
      Logger.log('Vision API error for ' + fileDetails.name + ': ' + (visionAnalysis.message || visionAnalysis.error));
      combinedMetadata.notes = (combinedMetadata.notes ? combinedMetadata.notes + "; " : "") + 
        'Vision API Error: ' + (visionAnalysis.message || visionAnalysis.error);
    }

    // Finalize processing metadata
    combinedMetadata.lastProcessedDate = new Date().toISOString();
    combinedMetadata.processingVersion = Config.PROCESSING_VERSION_ENHANCED;
    combinedMetadata.buildNumber = Config.getCurrentBuild();
    
    return combinedMetadata;
  };
  
  /**
   * Enhances metadata with AI-driven insights from Vision API.
   * @param {object} basicMetadata Base metadata object
   * @param {object} visionAnalysis Vision API analysis results
   * @param {string} filename Original filename for context
   * @param {string} folderPath Folder path for context
   * @returns {object} Enhanced metadata fields
   */
  ns.enhanceContentAnalysisWithAI = function(basicMetadata, visionAnalysis, filename, folderPath) {
    var enhancements = {};
    
    if (!visionAnalysis || visionAnalysis.error) {
      return enhancements;
    }

    // Enhanced content type detection using AI labels
    if (visionAnalysis.labels && visionAnalysis.labels.length > 0) {
      var labelsLower = visionAnalysis.labels.map(function(l) { return l.description.toLowerCase(); });
      
      if (labelsLower.some(function(l) { return ['sculpture', 'art', 'statue', 'artwork', 'installation', 'painting', 'drawing'].indexOf(l) !== -1; })) {
        enhancements.contentType = 'artwork';
        if (basicMetadata.importance !== 'critical') enhancements.importance = 'high';
      } else if (labelsLower.some(function(l) { return ['person', 'people', 'human face', 'portrait', 'crowd', 'man', 'woman', 'child'].indexOf(l) !== -1; })) {
        enhancements.contentType = 'team_portrait';
        enhancements.needsReview = 'yes';
      } else if (labelsLower.some(function(l) { return ['tool', 'machine', 'equipment', 'vehicle', 'engine', 'machinery'].indexOf(l) !== -1; })) {
        enhancements.contentType = 'equipment';
        if (!basicMetadata.department || basicMetadata.department === 'general') enhancements.department = 'operations';
      } else if (labelsLower.some(function(l) { return ['building', 'room', 'interior', 'architecture', 'house', 'office building', 'factory'].indexOf(l) !== -1; })) {
        enhancements.contentType = basicMetadata.contentType === 'facility_exterior' ? 'facility_exterior' : 'facility_interior';
      }
    }
    
    // Enhanced subject identification
    if (visionAnalysis.objects && visionAnalysis.objects.length > 0) {
      var primaryObject = visionAnalysis.objects.sort(function(a,b) { return b.confidence - a.confidence; })[0];
      if (primaryObject && primaryObject.name) {
        enhancements.subject = primaryObject.name;
      }
    } else if (visionAnalysis.labels && visionAnalysis.labels.length > 0 && !enhancements.subject) {
      enhancements.subject = visionAnalysis.labels[0].description;
    }
    
    // Enhanced keywords with AI data
    var aiKeywordsList = [];
    if (visionAnalysis.labels) {
      visionAnalysis.labels.slice(0, 10).forEach(function(l) { 
        aiKeywordsList.push(l.description.toLowerCase()); 
      });
    }
    if (visionAnalysis.objects) {
      visionAnalysis.objects.slice(0, 5).forEach(function(o) { 
        aiKeywordsList.push(o.name.toLowerCase()); 
      });
    }
    
    if (aiKeywordsList.length > 0) {
      var existingKeywords = basicMetadata.manualKeywords ? basicMetadata.manualKeywords.split(',').map(function(k) { return k.trim(); }) : [];
      var combinedKeywords = [];
      var seen = {};
      
      existingKeywords.concat(aiKeywordsList).forEach(function(keyword) {
        if (!seen[keyword]) {
          seen[keyword] = true;
          combinedKeywords.push(keyword);
        }
      });
      
      enhancements.manualKeywords = combinedKeywords.join(', ');
    }
    
    // Detect text-heavy images
    if (visionAnalysis.text && visionAnalysis.text.length > 50) {
      if (basicMetadata.contentType === 'other' || basicMetadata.contentType === 'unknown') {
        enhancements.contentType = 'documentation';
      }
      if (basicMetadata.importance !== 'critical' && basicMetadata.importance !== 'high') {
        enhancements.importance = 'medium';
      }
    }
    
    return enhancements;
  };
  
  // Return public interface
  return ns;
})();