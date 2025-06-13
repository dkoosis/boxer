// File: Config.js
// Configuration constants for the Boxer system.
// This version is designed to read all environment-specific values from Script Properties
// for better security and easier management.

var Config = {
  // --- Core Services ---
  SCRIPT_PROPERTIES: PropertiesService.getScriptProperties(),
  BOX_API_BASE_URL: 'https://api.box.com/2.0',
  VISION_API_ENDPOINT: 'https://vision.googleapis.com/v1/images:annotate',
  AIRTABLE_API_BASE_URL: 'https://api.airtable.com/v0',

  // --- Property Keys ---
  // These keys map to the values stored in Project Settings > Script Properties.
  // This keeps the code clean and separates configuration from logic.

  // API Keys & Auth
  BOX_OAUTH_CLIENT_ID_PROPERTY: 'BOX_OAUTH_CLIENT_ID', // Note the more specific name
  BOX_OAUTH_CLIENT_SECRET_PROPERTY: 'BOX_OAUTH_CLIENT_SECRET', // Note the more specific name
  VISION_API_KEY_PROPERTY: 'VISION_API_KEY',
  AIRTABLE_API_KEY_PROPERTY: 'AIRTABLE_API_KEY',
  
  // Configuration IDs (read from properties)
  get TRACKING_SHEET_ID() { return this.SCRIPT_PROPERTIES.getProperty('TRACKING_SHEET_ID'); },
  get ACTIVE_TEST_FOLDER_ID() { return this.SCRIPT_PROPERTIES.getProperty('ACTIVE_TEST_FOLDER_ID'); },
  get REPORTS_FOLDER_ID() { return this.SCRIPT_PROPERTIES.getProperty('REPORTS_FOLDER_ID'); },
  get AIRTABLE_ROOT_FOLDER_ID() { return this.SCRIPT_PROPERTIES.getProperty('AIRTABLE_ROOT_FOLDER_ID'); },
  get DRIVE_CACHE_FOLDER_ID() { return this.SCRIPT_PROPERTIES.getProperty('DRIVE_CACHE_FOLDER_ID'); },

  // Application-Specific Config (read from properties)
  get BOX_METADATA_SCOPE() { return this.SCRIPT_PROPERTIES.getProperty('BOX_METADATA_SCOPE'); },
  get IMAGE_METADATA_TEMPLATE_KEY() { return this.SCRIPT_PROPERTIES.getProperty('IMAGE_METADATA_TEMPLATE_KEY'); },
  get LEGAL_METADATA_TEMPLATE_KEY() { return this.SCRIPT_PROPERTIES.getProperty('LEGAL_METADATA_TEMPLATE_KEY'); },
  get TRACKING_SHEET_NAME() { return this.SCRIPT_PROPERTIES.getProperty('TRACKING_SHEET_NAME'); },
  
  // Default Airtable Settings
  get AIRTABLE_DEFAULT_CONFIG() {
    return {
      baseId: this.SCRIPT_PROPERTIES.getProperty('AIRTABLE_DEFAULT_BASE_ID'),
      tableName: this.SCRIPT_PROPERTIES.getProperty('AIRTABLE_DEFAULT_TABLE_NAME'),
      viewName: 'Ready for Archiving',       // This can remain hardcoded if it's standard practice
      attachmentFieldName: 'Images',         // Field containing image attachments
      linkFieldName: 'Archived_Image_Link',  // Field where Box links will be stored
      notesFieldName: 'Notes'                // Optional: field for additional context
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
    return this.SCRIPT_PROPERTIES.getProperty('BUILD_NUMBER') || '20240101.001';
  },

  /**
   * Check if file needs reprocessing due to build change
   * @param {string} fileBuildNumber Build number from file metadata
   * @returns {boolean} True if file should be reprocessed
   */
  shouldReprocessForBuild: function(fileBuildNumber) {
    return !fileBuildNumber || fileBuildNumber !== this.getCurrentBuild();
  }
};
