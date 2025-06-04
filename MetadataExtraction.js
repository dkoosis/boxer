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
        Logger.log('ℹ️ MetadataExtraction: cUseful library initialized');
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
   * Gets the Geocoding API key from Script Properties.
   * @returns {string|null} API key or null if not found
   * @private
   */
  function getGeocodingApiKey_() {
    try {
      return Config.SCRIPT_PROPERTIES.getProperty('GEOCODE_API_KEY');
    } catch (error) {
      Logger.log('Error getting geocoding API key: ' + error.toString());
      return null;
    }
  }
  
  /**
   * Reverse geocodes GPS coordinates to human-readable location.
   * @param {number} latitude GPS latitude
   * @param {number} longitude GPS longitude
   * @returns {object|null} Location data or null on error
   * @private
   */
  function reverseGeocode_(latitude, longitude) {
    var apiKey = getGeocodingApiKey_();
    if (!apiKey) {
      Logger.log('⚠️ No GEOCODE_API_KEY found - skipping reverse geocoding');
      return null;
    }
    
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      Logger.log('⚠️ Invalid GPS coordinates for geocoding');
      return null;
    }
    
    try {
      Logger.log('🗺️ Reverse geocoding: ' + latitude + ', ' + longitude);
      
      var geocodeUrl = 'https://maps.googleapis.com/maps/api/geocode/json?' +
                      'latlng=' + latitude + ',' + longitude +
                      '&key=' + apiKey;
      
      var utils = initUtils_();
      var response = utils.rateLimitExpBackoff(function() {
        return UrlFetchApp.fetch(geocodeUrl, {
          method: 'GET',
          muteHttpExceptions: true
        });
      });
      
      var responseCode = response.getResponseCode();
      if (responseCode !== 200) {
        Logger.log('❌ Geocoding API error: HTTP ' + responseCode);
        return null;
      }
      
      var data = JSON.parse(response.getContentText());
      if (data.status !== 'OK' || !data.results || data.results.length === 0) {
        Logger.log('❌ Geocoding failed: ' + (data.status || 'No results'));
        return null;
      }
      
      // Parse the best result (first one is usually most accurate)
      var result = data.results[0];
      var location = {
        gpsLocation: result.formatted_address || '',
        gpsVenue: '',
        gpsNeighborhood: '', 
        gpsCity: '',
        gpsRegion: '',
        gpsCountry: ''
      };
      
      // Parse address components for fine-grained location data
      if (result.address_components) {
        result.address_components.forEach(function(component) {
          var types = component.types || [];
          var longName = component.long_name || '';
          var shortName = component.short_name || '';
          
          // Venue/Address (street number + route)
          if (types.indexOf('street_number') !== -1) {
            location.gpsVenue = longName + ' ';
          } else if (types.indexOf('route') !== -1) {
            location.gpsVenue += longName;
          } else if (types.indexOf('premise') !== -1 || types.indexOf('establishment') !== -1) {
            location.gpsVenue = longName;
          }
          
          // Neighborhood
          if (types.indexOf('neighborhood') !== -1 || types.indexOf('sublocality') !== -1) {
            location.gpsNeighborhood = longName;
          }
          
          // City
          if (types.indexOf('locality') !== -1) {
            location.gpsCity = longName;
          }
          
          // Region (State, Borough, etc.)
          if (types.indexOf('administrative_area_level_1') !== -1) {
            location.gpsRegion = longName;
          } else if (types.indexOf('sublocality_level_1') !== -1 && !location.gpsRegion) {
            // For NYC boroughs, which sometimes appear as sublocality_level_1
            location.gpsRegion = longName;
          }
          
          // Country
          if (types.indexOf('country') !== -1) {
            location.gpsCountry = longName;
          }
        });
      }
      
      // Clean up venue field
      location.gpsVenue = location.gpsVenue.trim();
      
      Logger.log('✅ Geocoded to: ' + location.gpsLocation);
      if (location.gpsVenue) Logger.log('   📍 Venue: ' + location.gpsVenue);
      if (location.gpsNeighborhood) Logger.log('   🏘️ Neighborhood: ' + location.gpsNeighborhood);
      if (location.gpsCity) Logger.log('   🏙️ City: ' + location.gpsCity);
      if (location.gpsRegion) Logger.log('   🗺️ Region: ' + location.gpsRegion);
      if (location.gpsCountry) Logger.log('   🌍 Country: ' + location.gpsCountry);
      
      return location;
      
    } catch (error) {
      Logger.log('❌ Reverse geocoding error: ' + error.toString());
      return null;
    }
  }
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
   * Validates and sanitizes metadata before sending to Box
   * @param {object} metadata Raw metadata object
   * @returns {object} Clean metadata object
   */
  ns.sanitizeMetadataForBox = function(metadata) {
    var clean = {};
    
    try {
      // String fields
      if (metadata.originalFilename) clean.originalFilename = String(metadata.originalFilename);
      if (metadata.folderPath) clean.folderPath = String(metadata.folderPath);
      if (metadata.fileFormat) clean.fileFormat = String(metadata.fileFormat);
      if (metadata.cameraModel) clean.cameraModel = String(metadata.cameraModel);
      if (metadata.subject) clean.subject = String(metadata.subject);
      if (metadata.aspectRatio) clean.aspectRatio = String(metadata.aspectRatio);
      
      // Float fields - ensure they're numbers
      if (typeof metadata.fileSizeMB === 'number' && !isNaN(metadata.fileSizeMB)) {
        clean.fileSizeMB = Number(metadata.fileSizeMB);
      }
      if (typeof metadata.imageWidth === 'number' && !isNaN(metadata.imageWidth)) {
        clean.imageWidth = Number(metadata.imageWidth);
      }
      if (typeof metadata.imageHeight === 'number' && !isNaN(metadata.imageHeight)) {
        clean.imageHeight = Number(metadata.imageHeight);
      }
      if (typeof metadata.megapixels === 'number' && !isNaN(metadata.megapixels)) {
        clean.megapixels = Number(metadata.megapixels);
      }
      
      // GPS coordinates
      if (typeof metadata.gpsLatitude === 'number' && !isNaN(metadata.gpsLatitude)) {
        clean.gpsLatitude = Number(metadata.gpsLatitude);
      }
      if (typeof metadata.gpsLongitude === 'number' && !isNaN(metadata.gpsLongitude)) {
        clean.gpsLongitude = Number(metadata.gpsLongitude);
      }
      if (typeof metadata.gpsAltitude === 'number' && !isNaN(metadata.gpsAltitude)) {
        clean.gpsAltitude = Number(metadata.gpsAltitude);
      }
      
      // GPS location fields (human-readable)
      if (metadata.gpsLocation) clean.gpsLocation = String(metadata.gpsLocation);
      if (metadata.gpsVenue) clean.gpsVenue = String(metadata.gpsVenue);
      if (metadata.gpsNeighborhood) clean.gpsNeighborhood = String(metadata.gpsNeighborhood);
      if (metadata.gpsCity) clean.gpsCity = String(metadata.gpsCity);
      if (metadata.gpsRegion) clean.gpsRegion = String(metadata.gpsRegion);
      if (metadata.gpsCountry) clean.gpsCountry = String(metadata.gpsCountry);
      
      // Date fields - Box expects full ISO datetime for date type fields
      if (metadata.dateTaken) {
        try {
          var date = new Date(metadata.dateTaken);
          if (!isNaN(date.getTime())) {
            clean.dateTaken = date.toISOString(); // Full ISO string for Box date fields
          }
        } catch (e) {
          // Skip invalid dates
        }
      }
      
      if (metadata.lastProcessedDate) {
        try {
          var procDate = new Date(metadata.lastProcessedDate);
          if (!isNaN(procDate.getTime())) {
            clean.lastProcessedDate = procDate.toISOString(); // Full ISO string for Box date fields
          }
        } catch (e) {
          clean.lastProcessedDate = new Date().toISOString();
        }
      } else {
        // Always provide a valid date for required field
        clean.lastProcessedDate = new Date().toISOString();
      }
      
      // Enum fields - ensure valid values
      var validContentTypes = ['artwork', 'fabrication_process', 'marketing_material', 'team_portrait', 'event_photo', 'equipment', 'facility_interior', 'facility_exterior', 'documentation', 'other'];
      if (validContentTypes.indexOf(metadata.contentType) !== -1) {
        clean.contentType = metadata.contentType;
      } else {
        clean.contentType = 'other';
      }
      
      var validStages = ['unprocessed', 'basic_extracted', 'exif_extracted', 'ai_analyzed', 'human_reviewed', 'complete'];
      if (validStages.indexOf(metadata.processingStage) !== -1) {
        clean.processingStage = metadata.processingStage;
      } else {
        clean.processingStage = 'basic_extracted';
      }
      
      var validDepartments = ['fabrication', 'design', 'marketing', 'administration', 'operations', 'general'];
      if (validDepartments.indexOf(metadata.department) !== -1) {
        clean.department = metadata.department;
      } else {
        clean.department = 'general';
      }
      
      // Add other essential fields
      if (metadata.processingVersion) clean.processingVersion = String(metadata.processingVersion);
      if (metadata.buildNumber) clean.buildNumber = String(metadata.buildNumber);
      
      return clean;
      
    } catch (error) {
      Logger.log('Error sanitizing metadata: ' + error.toString());
      return {
        originalFilename: metadata.originalFilename || 'unknown',
        processingStage: 'basic_extracted',
        contentType: 'other',
        department: 'general',
        lastProcessedDate: new Date().toISOString().split('T')[0]
      };
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
        lastProcessedDate: new Date().toISOString(), // Full ISO datetime
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
    // Extract filename and fileId from fileDetails for use in logging and calls
    var filename = fileDetails.name;
    var fileId = fileDetails.id;

    // Start with basic metadata
    var basicMetadata = ns.extractComprehensiveMetadata(fileDetails);
    var combinedMetadata = JSON.parse(JSON.stringify(basicMetadata)); // Deep copy

    // Extract EXIF data, passing filename for logging
    var exifData = extractMetadata(fileId, accessToken, filename);
    if (exifData && exifData.hasExif) {
      if (exifData.metadata) {
        if (exifData.metadata.cameraModel) combinedMetadata.cameraModel = exifData.metadata.cameraModel;
        if (exifData.metadata.dateTaken) combinedMetadata.dateTaken = exifData.metadata.dateTaken;
        if (exifData.metadata.imageWidth) combinedMetadata.imageWidth = exifData.metadata.imageWidth;
        if (exifData.metadata.imageHeight) combinedMetadata.imageHeight = exifData.metadata.imageHeight;
        if (exifData.metadata.aspectRatio) combinedMetadata.aspectRatio = exifData.metadata.aspectRatio;
        if (exifData.metadata.megapixels) combinedMetadata.megapixels = exifData.metadata.megapixels;
        
        // GPS coordinates - all three values
        if (typeof exifData.metadata.gpsLatitude === 'number') {
          combinedMetadata.gpsLatitude = exifData.metadata.gpsLatitude;
        }
        if (typeof exifData.metadata.gpsLongitude === 'number') {
          combinedMetadata.gpsLongitude = exifData.metadata.gpsLongitude;
        }
        if (typeof exifData.metadata.gpsAltitude === 'number') {
          combinedMetadata.gpsAltitude = exifData.metadata.gpsAltitude;
        }
        
        // Camera settings
        if (exifData.metadata.cameraSettings) {
          combinedMetadata.cameraSettings = exifData.metadata.cameraSettings;
        }
        
        // Technical notes
        if (exifData.metadata.technicalNotes) {
          combinedMetadata.technicalNotes = exifData.metadata.technicalNotes;
        }
      }
      combinedMetadata.processingStage = Config.PROCESSING_STAGE_EXIF;
    }

    // Reverse geocode GPS coordinates if available
    if (typeof combinedMetadata.gpsLatitude === 'number' && typeof combinedMetadata.gpsLongitude === 'number') {
      Logger.log('🗺️ GPS coordinates found, performing reverse geocoding...');
      var locationData = reverseGeocode_(combinedMetadata.gpsLatitude, combinedMetadata.gpsLongitude);
      
      if (locationData) {
        // Add all the geocoded location fields
        if (locationData.gpsLocation) combinedMetadata.gpsLocation = locationData.gpsLocation;
        if (locationData.gpsVenue) combinedMetadata.gpsVenue = locationData.gpsVenue;
        if (locationData.gpsNeighborhood) combinedMetadata.gpsNeighborhood = locationData.gpsNeighborhood;
        if (locationData.gpsCity) combinedMetadata.gpsCity = locationData.gpsCity;
        if (locationData.gpsRegion) combinedMetadata.gpsRegion = locationData.gpsRegion;
        if (locationData.gpsCountry) combinedMetadata.gpsCountry = locationData.gpsCountry;
        
        Logger.log('✅ Location data added to metadata');
      } else {
        Logger.log('⚠️ Reverse geocoding failed - GPS coordinates preserved');
      }
      
      // Small delay to be respectful to Google's API
      Utilities.sleep(500);
    }

    // Analyze with Vision API, passing filename for logging
// Analyze with Vision API - skip HEIC/HEIF (not supported)
    var skipVisionFormats = ['HEIC', 'HEIF', 'TIFF'];
    
    if (skipVisionFormats.indexOf(combinedMetadata.fileFormat) !== -1) {
      Logger.log('⏭️ Skipping Vision API for ' + combinedMetadata.fileFormat + ' format: ' + filename);
      combinedMetadata.notes = (combinedMetadata.notes ? combinedMetadata.notes + "; " : "") + 
        'Vision API skipped - ' + combinedMetadata.fileFormat + ' format not supported';
    } else {
      var visionAnalysis = analyzeImageWithVisionImproved(fileId, accessToken, filename);

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
        var aiEnhancements = ns.enhanceContentAnalysisWithAI(combinedMetadata, visionAnalysis, filename, combinedMetadata.folderPath);
        Object.keys(aiEnhancements).forEach(function(key) {
          combinedMetadata[key] = aiEnhancements[key];
        });

      } else if (visionAnalysis && visionAnalysis.error) {
        Logger.log('  Vision API error for ' + filename + ': ' + (visionAnalysis.message || visionAnalysis.error));
        combinedMetadata.notes = (combinedMetadata.notes ? combinedMetadata.notes + "; " : "") + 
          'Vision API Error: ' + (visionAnalysis.message || visionAnalysis.error);
      }
    }
    // Finalize processing metadata
    combinedMetadata.lastProcessedDate = new Date().toISOString(); // Use current timestamp
    combinedMetadata.processingVersion = Config.PROCESSING_VERSION_ENHANCED;
    combinedMetadata.buildNumber = Config.getCurrentBuild();

    // Apply sanitization and return
    return ns.sanitizeMetadataForBox(combinedMetadata);
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
  
  /**
   * Test function for reverse geocoding functionality.
   * @param {number} testLat Optional test latitude (defaults to NYC)
   * @param {number} testLng Optional test longitude (defaults to NYC)
   */
  ns.testReverseGeocoding = function(testLat, testLng) {
    Logger.log('=== Testing Reverse Geocoding ===');
    
    // Default to NYC coordinates if not provided
    var lat = testLat || 40.7580;  // Times Square
    var lng = testLng || -73.9855;
    
    Logger.log('🧪 Testing with coordinates: ' + lat + ', ' + lng);
    
    var apiKey = getGeocodingApiKey_();
    if (!apiKey) {
      Logger.log('❌ GEOCODE_API_KEY not found in Script Properties');
      Logger.log('💡 Add your Google Geocoding API key to Script Properties');
      return;
    }
    
    Logger.log('✅ API key found: ' + apiKey.substring(0, 10) + '...');
    
    var result = reverseGeocode_(lat, lng);
    
    if (result) {
      Logger.log('🎉 Reverse geocoding successful!');
      Logger.log('📍 Results:');
      Object.keys(result).forEach(function(key) {
        if (result[key]) {
          Logger.log('   ' + key + ': ' + result[key]);
        }
      });
    } else {
      Logger.log('❌ Reverse geocoding failed');
    }
  };
  
  // Return public interface
  return ns;
})();

/**
 * Quick test functions for easy access
 */
function testReverseGeocodingNYC() {
  MetadataExtraction.testReverseGeocoding(40.7580, -73.9855); // Times Square
}

function testReverseGeocodingKyoto() {
  MetadataExtraction.testReverseGeocoding(35.014377, 135.669015); // From your sample
}