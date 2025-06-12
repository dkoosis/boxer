// File: Config.gs
// Configuration constants for Box Image Metadata Processing System
// Updated with Airtable Archival Configuration

var Config = {
  // Script Properties access
  SCRIPT_PROPERTIES: PropertiesService.getScriptProperties(),
  
  // Box API Configuration
  BOX_API_BASE_URL: 'https://api.box.com/2.0',
  DEFAULT_API_ITEM_LIMIT: 1000,
  
  // Box OAuth 2.0 Credentials (used by cGoa)
  OAUTH_CLIENT_ID_PROPERTY: 'OAUTH_CLIENT_ID',
  OAUTH_CLIENT_SECRET_PROPERTY: 'OAUTH_CLIENT_SECRET',
  
  // Box Metadata Template Configuration
  BOX_METADATA_TEMPLATE_KEY: 'comprehensiveImageMetadata',
  BOX_METADATA_SCOPE: 'enterprise',
  BOX_METADATA_TEMPLATE_DISPLAY_NAME: 'Comprehensive Image Metadata',
  
  // Box Reports Configuration
  REPORTS_FOLDER_ID: '196526595372',
  TRACKING_SHEET_ID: '185JyV0hC1r_jiCFw2zLR2Fd1u6JoH0Q_r2vDtUgMkLk',
  TRACKING_SHEET_NAME: 'ProcessingLog',
  DRIVE_CACHE_FOLDER_ID: '',
  REPORT_PROCESSING_CHECKPOINT: 'BOXER_REPORT_CHECKPOINT',

  // === NEW AIRTABLE ARCHIVAL CONFIGURATION ===
  
  // Airtable API Configuration
  AIRTABLE_API_BASE_URL: 'https://api.airtable.com/v0',
  AIRTABLE_API_KEY_PROPERTY: 'AIRTABLE_API_KEY', // Store in Script Properties
  
  // Default Airtable Settings (can be overridden per base)
  AIRTABLE_DEFAULT_CONFIG: {
    baseId: 'YOUR_BASE_ID_HERE',           // Replace with your Airtable Base ID
    tableName: 'YOUR_TABLE_NAME_HERE',     // Replace with your table name
    viewName: 'Ready for Archiving',       // View that filters unarchived records
    attachmentFieldName: 'Images',         // Field containing image attachments
    linkFieldName: 'Archived_Image_Link',  // Field where Box links will be stored
    notesFieldName: 'Notes'                // Optional: field for additional context
  },
  
  // Box Folder Configuration for Airtable Archives
  AIRTABLE_ROOT_FOLDER_ID: 'YOUR_BOX_FOLDER_ID_HERE', // Replace with Box folder ID for Airtable archives
  
  // Processing Configuration
  AIRTABLE_BATCH_SIZE: 5,                  // Records to process per run (Roomba-style)
  AIRTABLE_MAX_EXECUTION_TIME_MS: 4 * 60 * 1000, // 4 minutes safety margin
  AIRTABLE_DELAY_BETWEEN_RECORDS_MS: 2000, // Delay between processing records
  AIRTABLE_DELAY_BETWEEN_FILES_MS: 1000,   // Delay between uploading files
  
  // File Size Limits
  AIRTABLE_MAX_FILE_SIZE_BYTES: 50 * 1024 * 1024, // 50MB limit for uploads
  
  // State Management
  AIRTABLE_STATS_PROPERTY: 'BOXER_AIRTABLE_STATS',
  AIRTABLE_ERROR_LOG_PROPERTY: 'BOXER_AIRTABLE_ERRORS',
  
  // === EXISTING CONFIGURATION ===
  
  // Google Cloud Vision API Configuration
  VISION_API_ENDPOINT: 'https://vision.googleapis.com/v1/images:annotate',
  VISION_API_KEY_PROPERTY: 'VISION_API_KEY',
  MAX_VISION_API_FILE_SIZE_BYTES: 20 * 1024 * 1024,
  MAX_TEXT_EXTRACTION_LENGTH: 500,
  
  // Processing Folder Configuration
  DEFAULT_PROCESSING_FOLDER_ID: '0',
  ACTIVE_TEST_FOLDER_ID: '122988400901',
  
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
  PROCESSING_VERSION_EXIF_ONLY: 'v2.0-exif',
  
  // Batch Processing & Rate Limiting Configuration
  METADATA_ATTACHMENT_BATCH_SIZE: 50,
  METADATA_ATTACHMENT_FILE_DELAY_MS: 100,
  METADATA_ATTACHMENT_BATCH_DELAY_MS: 2000,
  IMAGE_PROCESSING_FILE_DELAY_MS: 1000,
  ENHANCED_PROCESSING_BATCH_SIZE: 5,
  ENHANCED_PROCESSING_FILE_DELAY_MS: 2000,
  ENHANCED_PROCESSING_BATCH_DELAY_MS: 5000,
  
  // File Type Configuration
  IMAGE_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'],
  
  /**
   * Check if filename represents an image file.
   * @param {string} filename The filename to check
   * @returns {boolean} True if recognized image extension
   */
  isImageFile: function(filename) {
    if (!filename || typeof filename !== 'string') return false;
    var lowerFilename = filename.toLowerCase();
    return this.IMAGE_EXTENSIONS.some(function(ext) { 
      return lowerFilename.endsWith(ext); 
    });
  },
  
  /**
   * Get current build number from Script Properties
   * @returns {string} Current build number
   */
  getCurrentBuild: function() {
    return this.SCRIPT_PROPERTIES.getProperty('BUILD_NUMBER') || '20241202.001';
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
   * Get Airtable API key from Script Properties
   * @returns {string|null} API key or null if not found
   */
  getAirtableApiKey: function() {
    //dk FIXME
    Logger.log("FIXME: GAS is having get/set problems with script properties...")
    return "patWSZ6NjaXeF1uRd.7343a7c4c2abef4e4e6c05adc79c664a82d3f9e685ab7d30805e7ee86af1bc80"
    return this.SCRIPT_PROPERTIES.getProperty(this.AIRTABLE_API_KEY_PROPERTY);
  },
  
  /**
   * Set Airtable API key in Script Properties
   * @param {string} apiKey The Airtable API key
   */
  setAirtableApiKey: function(apiKey) {
    this.SCRIPT_PROPERTIES.setProperty(this.AIRTABLE_API_KEY_PROPERTY, apiKey);
  },
  
  /**
   * Validate Airtable configuration
   * @param {object} config Configuration object to validate
   * @returns {boolean} True if configuration is valid
   */
  validateAirtableConfig: function(config) {
    var required = ['baseId', 'tableName', 'viewName', 'attachmentFieldName', 'linkFieldName'];
    return required.every(function(field) {
      return config[field] && typeof config[field] === 'string' && config[field].length > 0;
    });
  }
};