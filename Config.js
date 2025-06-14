// File: Config.js (Enhanced Version)
// Configuration constants for the Boxer system with smart defaults.
// This version provides sensible fallbacks when Script Properties aren't set.

var Config = {
  // --- Core Services ---
  SCRIPT_PROPERTIES: PropertiesService.getScriptProperties(),
  BOX_API_BASE_URL: 'https://api.box.com/2.0',
  VISION_API_ENDPOINT: 'https://vision.googleapis.com/v1/images:annotate',
  AIRTABLE_API_BASE_URL: 'https://api.airtable.com/v0',

  // --- Property Keys ---
  // These keys map to the values stored in Project Settings > Script Properties.
  BOX_OAUTH_CLIENT_ID_PROPERTY: 'BOX_OAUTH_CLIENT_ID',
  BOX_OAUTH_CLIENT_SECRET_PROPERTY: 'BOX_OAUTH_CLIENT_SECRET',
  VISION_API_KEY_PROPERTY: 'VISION_API_KEY',
  AIRTABLE_API_KEY_PROPERTY: 'AIRTABLE_API_KEY',
  
  // --- Smart Property Getters with Defaults ---
  // These will return sensible defaults if properties aren't set
  
  get TRACKING_SHEET_ID() { 
    var stored = this.SCRIPT_PROPERTIES.getProperty('TRACKING_SHEET_ID');
    
    // If we have a value, validate it first
    if (stored) {
      try {
        SpreadsheetApp.openById(stored);
        return stored; // Valid, use it
      } catch (e) {
        // Invalid ID, clear it
        Logger.log('⚠️ Invalid TRACKING_SHEET_ID detected, clearing...');
        this.SCRIPT_PROPERTIES.deleteProperty('TRACKING_SHEET_ID');
      }
    }
    
    // No value or invalid, try to create
    return this._getOrCreateDefault('TRACKING_SHEET_ID');
  },
  
  get ACTIVE_TEST_FOLDER_ID() { 
    return this.SCRIPT_PROPERTIES.getProperty('ACTIVE_TEST_FOLDER_ID') || '';
  },
  
  get REPORTS_FOLDER_ID() { 
    return this.SCRIPT_PROPERTIES.getProperty('BOX_REPORTS_FOLDER_ID') || '';
  },
  
  get AIRTABLE_ROOT_FOLDER_ID() { 
    return this.SCRIPT_PROPERTIES.getProperty('AIRTABLE_ROOT_FOLDER_ID') || '0';
  },
  
  get DRIVE_CACHE_FOLDER_ID() { 
    var stored = this.SCRIPT_PROPERTIES.getProperty('DRIVE_CACHE_FOLDER_ID');
    
    // If we have a value, validate it first
    if (stored) {
      try {
        DriveApp.getFolderById(stored);
        return stored; // Valid, use it
      } catch (e) {
        // Invalid ID, clear it
        Logger.log('⚠️ Invalid DRIVE_CACHE_FOLDER_ID detected, clearing...');
        this.SCRIPT_PROPERTIES.deleteProperty('DRIVE_CACHE_FOLDER_ID');
      }
    }
    
    // No value or invalid, try to create
    return this._getOrCreateDefault('DRIVE_CACHE_FOLDER_ID');
  },

  // Box Configuration with Defaults
  get BOX_METADATA_SCOPE() { 
    var stored = this.SCRIPT_PROPERTIES.getProperty('BOX_METADATA_SCOPE');
    if (stored && stored !== 'enterprise_pending') return stored;
    
    // Try to auto-detect
    try {
      if (typeof getValidAccessToken === 'function') {
        var token = getValidAccessToken();
        if (token) {
          var response = UrlFetchApp.fetch(this.BOX_API_BASE_URL + '/users/me', {
            headers: { 'Authorization': 'Bearer ' + token },
            muteHttpExceptions: true
          });
          if (response.getResponseCode() === 200) {
            var userData = JSON.parse(response.getContentText());
            if (userData.enterprise && userData.enterprise.id) {
              var scope = 'enterprise_' + userData.enterprise.id;
              this.SCRIPT_PROPERTIES.setProperty('BOX_METADATA_SCOPE', scope);
              return scope;
            }
          }
        }
      }
    } catch (e) {
      // Fall through to default
    }
    
    return 'enterprise';
  },
  
  get BOX_METADATA_TEMPLATE_KEY() {
    // Backwards compatibility - support both old and new property names
    return this.SCRIPT_PROPERTIES.getProperty('IMAGE_METADATA_TEMPLATE_KEY') || 
           this.SCRIPT_PROPERTIES.getProperty('BOX_METADATA_TEMPLATE_KEY') || 
           'boxerImageMetadata';
  },
  
  // Alias for consistency
  get IMAGE_METADATA_TEMPLATE_KEY() {
    return this.BOX_METADATA_TEMPLATE_KEY;
  },
  
  get LEGAL_METADATA_TEMPLATE_KEY() { 
    return this.SCRIPT_PROPERTIES.getProperty('LEGAL_METADATA_TEMPLATE_KEY') || 'boxerLegalMetadata';
  },
  
  get TRACKING_SHEET_NAME() { 
    return this.SCRIPT_PROPERTIES.getProperty('TRACKING_SHEET_NAME') || 'Processing_Stats';
  },
  
  get ERROR_LOG_SHEET_NAME() {
    return this.SCRIPT_PROPERTIES.getProperty('ERROR_LOG_SHEET_NAME') || 'Error_Log';
  },
  
  // Default Airtable Settings
  get AIRTABLE_DEFAULT_CONFIG() {
    return {
      baseId: this.SCRIPT_PROPERTIES.getProperty('AIRTABLE_DEFAULT_BASE_ID') || '',
      tableName: this.SCRIPT_PROPERTIES.getProperty('AIRTABLE_DEFAULT_TABLE_NAME') || '',
      viewName: 'Ready for Archiving',
      attachmentFieldName: 'Images',
      linkFieldName: 'Archived_Image_Link',
      notesFieldName: 'Notes'
    };
  },

  // --- Static Configuration (values that rarely change) ---
  
  // Processing Parameters
  DEFAULT_API_ITEM_LIMIT: 1000,
  MAX_VISION_API_FILE_SIZE_BYTES: 20 * 1024 * 1024,
  MAX_TEXT_EXTRACTION_LENGTH: 500,
  
  // Processing Stages
  PROCESSING_STAGE_UNPROCESSED: 'unprocessed',
  PROCESSING_STAGE_BASIC: 'basic_extracted',
  PROCESSING_STAGE_EXIF: 'exif_extracted',
  PROCESSING_STAGE_AI: 'ai_analyzed',
  PROCESSING_STAGE_REVIEW: 'human_reviewed',
  PROCESSING_STAGE_COMPLETE: 'complete',
  PROCESSING_STAGE_FAILED: 'failed',
  
  // Processing Version Tags
  PROCESSING_VERSION_BASIC: 'v1.0',
  PROCESSING_VERSION_ENHANCED: 'v2.0',
  
  // File Type Configuration
  IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'],
  
  // Batch Processing Configuration
  METADATA_ATTACHMENT_BATCH_SIZE: 50,
  METADATA_ATTACHMENT_FILE_DELAY_MS: 100,
  METADATA_ATTACHMENT_BATCH_DELAY_MS: 2000,
  IMAGE_PROCESSING_FILE_DELAY_MS: 1000,
  
  // Airtable Processing Configuration
  AIRTABLE_MAX_EXECUTION_TIME_MS: 4 * 60 * 1000,
  AIRTABLE_BATCH_SIZE: 5,
  AIRTABLE_STATS_PROPERTY: 'BOXER_AIRTABLE_STATS',
  AIRTABLE_ERROR_LOG_PROPERTY: 'BOXER_AIRTABLE_ERRORS',
  AIRTABLE_DELAY_BETWEEN_RECORDS_MS: 2000,
  AIRTABLE_DELAY_BETWEEN_FILES_MS: 1000,
  AIRTABLE_MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024,

  /**
   * Check if filename represents an image file.
   * @param {string} filename The filename to check
   * @returns {boolean} True if recognized image extension
   */
  isImageFile: function(filename) {
    if (!filename || typeof filename !== 'string') return false;
    const lowerFilename = filename.toLowerCase();
    return this.IMAGE_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
  },
  
  /**
   * Get current build number from Script Properties
   * @returns {string} Current build number
   */
  getCurrentBuild: function() {
    var stored = this.SCRIPT_PROPERTIES.getProperty('BUILD_NUMBER');
    if (stored) return stored;
    
    // Generate and store a default
    var defaultBuild = new Date().toISOString().slice(0,10).replace(/-/g,'') + '.001';
    this.SCRIPT_PROPERTIES.setProperty('BUILD_NUMBER', defaultBuild);
    return defaultBuild;
  },

  /**
   * Check if file needs reprocessing due to build change
   * @param {string} fileBuildNumber Build number from file metadata
   * @returns {boolean} True if file should be reprocessed
   */
  shouldReprocessForBuild: function(fileBuildNumber) {
    return !fileBuildNumber || fileBuildNumber !== this.getCurrentBuild();
  },
  
  /**
   * Get version information
   * @returns {object} Version info object
   */
  getVersionInfo: function() {
    return {
      scriptVersion: this.SCRIPT_PROPERTIES.getProperty('SCRIPT_VERSION') || '2.0',
      buildNumber: this.getCurrentBuild(),
      buildDate: new Date().toISOString().slice(0,10),
      fullVersion: (this.SCRIPT_PROPERTIES.getProperty('SCRIPT_VERSION') || '2.0') + '-' + this.getCurrentBuild()
    };
  },
  
  /**
   * Get current version string for comparison
   * @returns {string} Version string
   */
  getCurrentVersionString: function() {
    return this.getVersionInfo().fullVersion;
  },
  
  /**
   * Check if file needs reprocessing based on version
   * @param {string} fileVersion Version from file metadata
   * @returns {boolean} True if should reprocess
   */
  shouldReprocessForVersion: function(fileVersion) {
    return !fileVersion || fileVersion !== this.getCurrentVersionString();
  },
  
  /**
   * Internal helper to create defaults when needed
   * @private
   */
  _getOrCreateDefault: function(propertyName) {
    // Only create defaults for things we can safely auto-create
    if (propertyName === 'TRACKING_SHEET_ID') {
      try {
        // Create the tracking sheet if it doesn't exist
        var sheet = SpreadsheetApp.create('Boxer_Analytics');
        var sheetId = sheet.getId();
        this.SCRIPT_PROPERTIES.setProperty('TRACKING_SHEET_ID', sheetId);
        Logger.log('Auto-created Boxer_Analytics sheet: ' + sheetId);
        return sheetId;
      } catch (e) {
        Logger.log('Could not auto-create tracking sheet: ' + e.toString());
        // Return empty string to disable tracking rather than fail
        return '';
      }
    } else if (propertyName === 'DRIVE_CACHE_FOLDER_ID') {
      try {
        // Create the cache folder if it doesn't exist
        var folder = DriveApp.createFolder('Boxer_Cache');
        var folderId = folder.getId();
        this.SCRIPT_PROPERTIES.setProperty('DRIVE_CACHE_FOLDER_ID', folderId);
        Logger.log('Auto-created Boxer_Cache folder: ' + folderId);
        return folderId;
      } catch (e) {
        Logger.log('Could not auto-create cache folder: ' + e.toString());
        // Use root folder as fallback
        var rootId = DriveApp.getRootFolder().getId();
        Logger.log('Using root folder as cache location');
        this.SCRIPT_PROPERTIES.setProperty('DRIVE_CACHE_FOLDER_ID', rootId);
        return rootId;
      }
    }
    
    return null;
  }
};