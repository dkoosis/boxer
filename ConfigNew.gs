// File: Config.gs
// Configuration constants for Boxer - Box Image Metadata Processing System
// Following Bruce McPherson's organizational patterns
// Uses cGoa and cUseful libraries by Bruce McPherson

/**
 * Configuration namespace following Bruce McPherson's patterns.
 * Centralizes all configuration to avoid scattered constants.
 */
var Config = (function() {
  'use strict';
  
  var ns = {};
  
  // Script Properties access
  ns.SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  
  // Box API Configuration
  ns.BOX_API_BASE_URL = 'https://api.box.com/2.0';
  ns.DEFAULT_API_ITEM_LIMIT = 1000;
  
  // Box OAuth 2.0 Credentials (used by cGoa)
  ns.OAUTH_CLIENT_ID_PROPERTY = 'OAUTH_CLIENT_ID';
  ns.OAUTH_CLIENT_SECRET_PROPERTY = 'OAUTH_CLIENT_SECRET';
  
  // Box Metadata Template Configuration
  ns.BOX_METADATA_TEMPLATE_KEY = 'comprehensiveImageMetadata';
  ns.BOX_METADATA_SCOPE = 'enterprise';
  ns.BOX_METADATA_TEMPLATE_DISPLAY_NAME = 'Comprehensive Image Metadata';
  
  // Google Cloud Vision API Configuration
  ns.VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
  ns.VISION_API_KEY_PROPERTY = 'VISION_API_KEY';
  ns.MAX_VISION_API_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
  ns.MAX_TEXT_EXTRACTION_LENGTH = 500;
  
  // Processing Folder Configuration
  ns.DEFAULT_PROCESSING_FOLDER_ID = '0'; // Root folder
  ns.ACTIVE_TEST_FOLDER_ID = '187704768929';
  
  // Processing Stages (enum-like constants)
  ns.PROCESSING_STAGE_UNPROCESSED = 'unprocessed';
  ns.PROCESSING_STAGE_BASIC = 'basic_extracted';
  ns.PROCESSING_STAGE_EXIF = 'exif_extracted';
  ns.PROCESSING_STAGE_AI = 'ai_analyzed';
  ns.PROCESSING_STAGE_REVIEW = 'human_reviewed';
  ns.PROCESSING_STAGE_COMPLETE = 'complete';
  
  // Processing Version Tags
  ns.PROCESSING_VERSION_BASIC = 'v2.0-basic';
  ns.PROCESSING_VERSION_ENHANCED = 'v2.0-enhanced';
  
  // Batch Processing & Rate Limiting Configuration
  ns.METADATA_ATTACHMENT_BATCH_SIZE = 50;
  ns.METADATA_ATTACHMENT_FILE_DELAY_MS = 100;
  ns.METADATA_ATTACHMENT_BATCH_DELAY_MS = 2000;
  
  ns.IMAGE_PROCESSING_FILE_DELAY_MS = 300;
  ns.ENHANCED_PROCESSING_BATCH_SIZE = 5;
  ns.ENHANCED_PROCESSING_FILE_DELAY_MS = 2000;
  ns.ENHANCED_PROCESSING_BATCH_DELAY_MS = 5000;
  
  // BOXER Configuration
  ns.BOXER_MAX_EXECUTION_TIME_MS = 4 * 60 * 1000; // 4 minutes safe margin
  ns.BOXER_MAX_FILES_PER_RUN = 20;
  ns.BOXER_STATS_PROPERTY = 'BOXER_STATS';
  
  // File Type Configuration
  ns.IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'];
  
  /**
   * Get cGoa package configuration for Box following Bruce's Service patterns.
   * @returns {object} Package configuration for cGoa
   */
  ns.getBoxGoaPackage = function() {
    var clientId = ns.SCRIPT_PROPERTIES.getProperty(ns.OAUTH_CLIENT_ID_PROPERTY);
    var clientSecret = ns.SCRIPT_PROPERTIES.getProperty(ns.OAUTH_CLIENT_SECRET_PROPERTY);
    
    if (!clientId || !clientSecret) {
      throw new Error('Box OAuth credentials not found. Set ' + 
        ns.OAUTH_CLIENT_ID_PROPERTY + ' and ' + ns.OAUTH_CLIENT_SECRET_PROPERTY + 
        ' in Script Properties.');
    }
    
    return {
      packageName: 'boxService',
      service: 'custom',
      clientId: clientId,
      clientSecret: clientSecret,
      scopes: ['root_readonly', 'root_readwrite', 'manage_enterprise_properties'],
      serviceParameters: {
        authUrl: 'https://account.box.com/api/oauth2/authorize',
        tokenUrl: 'https://api.box.com/oauth2/token',
        refreshUrl: 'https://api.box.com/oauth2/token'
      }
    };
  };
  
  /**
   * Check if filename represents an image file.
   * @param {string} filename The filename to check
   * @returns {boolean} True if recognized image extension
   */
  ns.isImageFile = function(filename) {
    if (!filename || typeof filename !== 'string') return false;
    var lowerFilename = filename.toLowerCase();
    return ns.IMAGE_EXTENSIONS.some(function(ext) { 
      return lowerFilename.endsWith(ext); 
    });
  };
  
  /**
   * Get Vision API key if available.
   * @returns {string|null} Vision API key or null if not configured
   */
  ns.getVisionApiKey = function() {
    return ns.SCRIPT_PROPERTIES.getProperty(ns.VISION_API_KEY_PROPERTY);
  };
  
  /**
   * Check if Vision API is configured.
   * @returns {boolean} True if Vision API key is available
   */
  ns.isVisionApiAvailable = function() {
    return !!ns.getVisionApiKey();
  };
  
  return ns;
})();