// File: Config.gs
// Configuration constants for Box Image Metadata Processing System

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
  
  // --- NEW REPORT & TRACKING CONFIGURATION ---

  // Folder where weekly Box reports are stored
  REPORTS_FOLDER_ID: '196526595372',

  // Google Sheet for tracking processing status
  TRACKING_SHEET_ID: '185JyV0hC1r_jiCFw2zLR2Fd1u6JoH0Q_r2vDtUgMkLk',
  TRACKING_SHEET_NAME: 'ProcessingLog',
  
  // (Optional) Google Drive folder to cache the large report file. 
  // Create a folder in your Drive and put its ID here. If blank, caches in root folder.
  DRIVE_CACHE_FOLDER_ID: '', 

  // Checkpoint property for report processing state
  REPORT_PROCESSING_CHECKPOINT: 'BOXER_REPORT_CHECKPOINT',


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
  }
};