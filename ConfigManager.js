// File: ConfigManager.js
// Unified configuration management for Boxer
// Consolidates Config.js, ConfigValidator.js, and ConfigRepair.js

const ConfigManager = (function() {
  'use strict';
  
  const ns = {};
  
  // Core services
  ns.SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  ns.CACHE_SERVICE = CacheService.getScriptCache();
  
  // API endpoints
  ns.BOX_API_BASE_URL = 'https://api.box.com/2.0';
  ns.VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
  ns.AIRTABLE_API_BASE_URL = 'https://api.airtable.com/v0';
  
  // Internal constants
  ns.ERROR_LOG_SHEET_NAME = 'Error_Log';
  ns.PROCESSING_STATS_SHEET_NAME = 'Processing_Stats';
  ns.SCRIPT_VERSION = '3.0';
  
  // Processing constants
  ns.IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'];
  ns.MAX_VISION_API_FILE_SIZE_BYTES = 20 * 1024 * 1024;
  ns.DEFAULT_API_ITEM_LIMIT = 1000;
  
  // Processing stages
  ns.PROCESSING_STAGE_UNPROCESSED = 'unprocessed';
  ns.PROCESSING_STAGE_BASIC = 'basic_extracted';
  ns.PROCESSING_STAGE_EXIF = 'exif_extracted';
  ns.PROCESSING_STAGE_AI = 'ai_analyzed';
  ns.PROCESSING_STAGE_COMPLETE = 'complete';
  ns.PROCESSING_STAGE_FAILED = 'failed';
  
  // Property definitions with metadata
  const PROPERTY_DEFINITIONS = {
    // Google Resources
    BOXER_CACHE_FOLDER: {
      required: true,
      category: 'google',
      description: 'Google Drive folder for Box report cache',
      validate: id => {
        if (!id) return false;
        try {
          DriveApp.getFolderById(id);
          return true;
        } catch (e) {
          return false;
        }
      },
      autoCreate: () => {
        const folder = getOrCreateBoxerFolder();
        const cacheFolder = getOrCreateSubfolder(folder, 'Report_Cache');
        return cacheFolder.getId();
      }
    },
    
    BOXER_TRACKING_SHEET: {
      required: true,
      category: 'google',
      description: 'Google Sheet for analytics and error tracking',
      validate: id => {
        if (!id) return false;
        try {
          SpreadsheetApp.openById(id);
          return true;
        } catch (e) {
          return false;
        }
      },
      autoCreate: () => createTrackingSheet()
    },
    
    // Box Authentication
    BOX_CLIENT_ID: {
      required: true,
      category: 'box_auth',
      description: 'Box OAuth client ID',
      validate: val => val && val.length > 0
    },
    
    BOX_CLIENT_SECRET: {
      required: true,
      category: 'box_auth',
      description: 'Box OAuth client secret',
      validate: val => val && val.length > 0
    },
    
    // Box Configuration
    BOX_ENTERPRISE_ID: {
      required: true,
      category: 'box_config',
      description: 'Box enterprise ID (numbers only)',
      validate: val => val && /^\d+$/.test(val),
      autoDetect: () => autoDetectEnterpriseId()
    },
    
    BOX_IMAGE_METADATA_ID: {
      required: true,
      category: 'box_config',
      description: 'Box metadata template key for images',
      default: 'boxerImageMetadata',
      validate: val => val && val.length > 0
    },
    
    BOX_LEGAL_METADATA_ID: {
      required: false,
      category: 'box_config',
      description: 'Box metadata template key for legal documents',
      default: 'boxerLegalMetadata',
      validate: val => !val || val.length > 0
    },
    
    BOX_REPORTS_FOLDER: {
      required: true,
      category: 'box_config',
      description: 'Box folder ID containing CSV reports',
      validate: val => val && val.length > 0
    },

    BOX_REPORT_FOLDER_PREFIX: {
      required: false,
      category: 'box_config',
      description: 'The text that weekly report folders begin with.',
      default: 'Folder and File Tree run on',
      validate: val => val && val.length > 0
    },
    
    BOX_PRIORITY_FOLDER: {
      required: false,
      category: 'box_config',
      description: 'Box folder ID for priority processing',
      default: '',
      validate: () => true
    },
    
    // External APIs
    GOOGLE_VISION_API_KEY: {
      required: false,
      category: 'apis',
      description: 'Google Vision API key for AI image analysis',
      default: '',
      validate: () => true
    },
    
    GOOGLE_GEOCODE_API_KEY: {
      required: false,
      category: 'apis',
      description: 'Google Geocoding API key for GPS location names',
      default: '',
      validate: () => true
    },

    CRITICAL_ERROR_EMAIL: {
      required: false,
      category: 'apis',
      description: 'Email address for critical error notifications',
      default: '',
      validate: () => true
    },
    
    AIRTABLE_API_KEY: {
      required: false,
      category: 'apis',
      description: 'Airtable API key for archival features',
      default: '',
      validate: () => true
    },
    
    // Airtable Configuration
    AIRTABLE_BASE_ID: {
      required: false,
      category: 'airtable',
      description: 'Airtable base ID',
      default: '',
      validate: () => true
    },
    
    AIRTABLE_TABLE_NAME: {
      required: false,
      category: 'airtable',
      description: 'Airtable table name',
      default: '',
      validate: () => true
    },

    AIRTABLE_ATTACHMENT_FIELD: {
      required: false,
      category: 'airtable',
      description: 'The name of the attachment field in Airtable',
      default: 'Attachments',
      validate: () => true
    },

    AIRTABLE_LINK_FIELD: {
      required: false,
      category: 'airtable',
      description: 'The name of the field to store the Box link in Airtable',
      default: 'Box_Link',
      validate: () => true
    },

    BOX_AIRTABLE_ARCHIVE_FOLDER: {
      required: false,
      category: 'airtable',
      description: 'Box folder ID for Airtable archives',
      default: '0',
      validate: () => true
    },

    BOX_AIRTABLE_SHARED_LINK_ACCESS: {
      required: false,
      category: 'airtable',
      description: "Access level for shared links created for archived files ('open', 'company', 'collaborators')",
      default: 'company',
      validate: val => ['open', 'company', 'collaborators'].includes(val)
    },

    // Throttling Controls
    AIRTABLE_PROCESSING_BATCH_SIZE: {
      required: false, category: 'throttling', description: 'Number of Airtable records to process per run.',
      default: 5, validate: val => !isNaN(parseInt(val))
    },
    AIRTABLE_SLEEP_DELAY_MS: {
      required: false, category: 'throttling', description: 'Delay between processing Airtable records in ms.',
      default: 2000, validate: val => !isNaN(parseInt(val))
    },
    METADATA_ATTACH_BATCH_SIZE: {
      required: false, category: 'throttling', description: 'Number of files to attach metadata templates to in a batch.',
      default: 50, validate: val => !isNaN(parseInt(val))
    },
    METADATA_ATTACH_FILE_DELAY_MS: {
        required: false, category: 'throttling', description: 'Delay between individual file template attachments in ms.',
        default: 100, validate: val => !isNaN(parseInt(val))
    },
    METADATA_ATTACH_BATCH_DELAY_MS: {
        required: false, category: 'throttling', description: 'Delay between batches of template attachments in ms.',
        default: 2000, validate: val => !isNaN(parseInt(val))
    }
  };
  
  // Migration map from old to new property names
  const MIGRATION_MAP = {
    'DRIVE_CACHE_FOLDER_ID': 'BOXER_CACHE_FOLDER',
    'TRACKING_SHEET_ID': 'BOXER_TRACKING_SHEET',
    'BOX_OAUTH_CLIENT_ID': 'BOX_CLIENT_ID',
    'BOX_OAUTH_CLIENT_SECRET': 'BOX_CLIENT_SECRET',
    'BOX_METADATA_SCOPE': 'BOX_ENTERPRISE_ID',
    'BOX_METADATA_TEMPLATE_KEY': 'BOX_IMAGE_METADATA_ID',
    'IMAGE_METADATA_TEMPLATE_KEY': 'BOX_IMAGE_METADATA_ID',
    'LEGAL_METADATA_TEMPLATE_KEY': 'BOX_LEGAL_METADATA_ID',
    'BOX_REPORTS_FOLDER_ID': 'BOX_REPORTS_FOLDER',
    'ACTIVE_TEST_FOLDER_ID': 'BOX_PRIORITY_FOLDER',
    'VISION_API_KEY': 'GOOGLE_VISION_API_KEY',
    'GEOCODE_API_KEY': 'GOOGLE_GEOCODE_API_KEY',
    'AIRTABLE_DEFAULT_BASE_ID': 'AIRTABLE_BASE_ID',
    'AIRTABLE_DEFAULT_TABLE_NAME': 'AIRTABLE_TABLE_NAME',
    'AIRTABLE_ROOT_FOLDER_ID': 'BOX_AIRTABLE_ARCHIVE_FOLDER'
  };
  
  // Properties to remove
  const DEPRECATED_PROPERTIES = [
    'BUILD_NUMBER', 'BOXER_REPORT_CHECKPOINT', 'BOXER_REPORT_STATS',
    'BOXER_AIRTABLE_STATS', 'BOXER_AIRTABLE_ERRORS', 
    'ERROR_LOG_SHEET_NAME', 'TRACKING_SHEET_NAME'
  ];
  
  // Helper functions
  function getOrCreateBoxerFolder() {
    const folders = DriveApp.getFoldersByName('Boxer');
    if (folders.hasNext()) {
      return folders.next();
    }
    const folder = DriveApp.createFolder('Boxer');
    folder.setDescription('Automated folder for Boxer metadata system');
    folder.setColor('#4285f4');
    return folder;
  }
  
  function getOrCreateSubfolder(parentFolder, name) {
    const folders = parentFolder.getFoldersByName(name);
    if (folders.hasNext()) {
      return folders.next();
    }
    return parentFolder.createFolder(name);
  }
  
  function createTrackingSheet() {
    const boxerFolder = getOrCreateBoxerFolder();
    const sheet = SpreadsheetApp.create('Boxer_Analytics');
    
    // Set up error log sheet
    const errorSheet = sheet.getActiveSheet();
    errorSheet.setName(ns.ERROR_LOG_SHEET_NAME);
    errorSheet.getRange(1, 1, 1, 5).setValues([[
      'Timestamp', 'Function', 'Error Message', 'Context', 'Stack Trace'
    ]]);
    errorSheet.setFrozenRows(1);
    
    // Set up stats sheet
    const statsSheet = sheet.insertSheet(ns.PROCESSING_STATS_SHEET_NAME);
    statsSheet.getRange(1, 1, 1, 7).setValues([[
      'Timestamp', 'Run Type', 'Files Found', 'Files Processed', 'Files Skipped', 
      'Errors', 'Duration (sec)'
    ]]);
    statsSheet.setFrozenRows(1);
    
    // Move to Boxer folder
    DriveApp.getFileById(sheet.getId()).moveTo(boxerFolder);
    
    return sheet.getId();
  }
  
  function autoDetectEnterpriseId() {
    try {
      if (typeof getValidAccessToken === 'function') {
        const token = getValidAccessToken();
        const response = UrlFetchApp.fetch(`${ns.BOX_API_BASE_URL}/users/me`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const userData = JSON.parse(response.getContentText());
        return userData.enterprise ? userData.enterprise.id : null;
      }
    } catch (e) {
      Logger.log(`Could not auto-detect enterprise ID: ${e.toString()}`);
    }
    return null;
  }
  
  // Public API
  
  /**
   * Get a property value with validation
   */
  ns.getProperty = function(key) {
    const def = PROPERTY_DEFINITIONS[key];
    if (!def) {
      throw new Error(`Unknown property: ${key}`);
    }
    
    let value = ns.SCRIPT_PROPERTIES.getProperty(key);
    
    if (value === null && def.default !== undefined) {
      value = def.default;
    }
    
    if (value !== null && def.validate && !def.validate(value)) {
      Logger.log(`⚠️ Invalid value for ${key}: ${value}`);
      return null;
    }
    
    return value;
  };
  
  /**
   * Set a property value
   */
  ns.setProperty = function(key, value) {
    const def = PROPERTY_DEFINITIONS[key];
    if (!def) {
      throw new Error(`Unknown property: ${key}`);
    }
    
    if (def.validate && !def.validate(value)) {
      Logger.log(`❌ Invalid value for ${key}: ${value}`);
      return false;
    }
    
    ns.SCRIPT_PROPERTIES.setProperty(key, value);
    return true;
  };
  
  /**
   * Get Box metadata scope
   */
  ns.getBoxMetadataScope = function() {
    const enterpriseId = ns.getProperty('BOX_ENTERPRISE_ID');
    return enterpriseId ? `enterprise_${enterpriseId}` : 'enterprise';
  };
  
  /**
   * Validate all configuration
   */
  ns.validate = function(autoFix = false) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      fixed: []
    };
    
    Object.keys(PROPERTY_DEFINITIONS).forEach(key => {
      const def = PROPERTY_DEFINITIONS[key];
      const value = ns.SCRIPT_PROPERTIES.getProperty(key);
      
      if (def.required && !value) {
        if (autoFix && def.autoCreate) {
          try {
            const newValue = def.autoCreate();
            ns.setProperty(key, newValue);
            results.fixed.push(`${key} (created: ${newValue})`);
          } catch (e) {
            results.valid = false;
            results.errors.push(`${key} is required but could not auto-create: ${e.toString()}`);
          }
        } else if (autoFix && def.autoDetect) {
          try {
            const detected = def.autoDetect();
            if (detected) {
              ns.setProperty(key, detected);
              results.fixed.push(`${key} (detected: ${detected})`);
            } else {
              results.valid = false;
              results.errors.push(`${key} is required but could not auto-detect`);
            }
          } catch (e) {
            results.valid = false;
            results.errors.push(`${key} is required but auto-detect failed: ${e.toString()}`);
          }
        } else {
          results.valid = false;
          results.errors.push(`${key} is required but not set`);
        }
      } else if (value && def.validate && !def.validate(value)) {
        results.valid = false;
        results.errors.push(`${key} has invalid value: ${value}`);
      }
    });
    
    return results;
  };
  
  /**
   * Migrate from old property names
   */
  ns.migrate = function() {
    const results = {
      migrated: [],
      removed: [],
      special: []
    };
    
    // Migrate renamed properties
    Object.keys(MIGRATION_MAP).forEach(oldKey => {
      const oldValue = ns.SCRIPT_PROPERTIES.getProperty(oldKey);
      if (oldValue) {
        const newKey = MIGRATION_MAP[oldKey];
        
        // Special handling for BOX_METADATA_SCOPE
        if (oldKey === 'BOX_METADATA_SCOPE') {
          const match = oldValue.match(/enterprise_(\d+)/);
          if (match) {
            ns.setProperty('BOX_ENTERPRISE_ID', match[1]);
            results.special.push('Extracted enterprise ID from ' + oldKey);
          }
        } else {
          ns.setProperty(newKey, oldValue);
        }
        
        ns.SCRIPT_PROPERTIES.deleteProperty(oldKey);
        results.migrated.push(`${oldKey} → ${newKey}`);
      }
    });
    
    // Remove deprecated properties
    DEPRECATED_PROPERTIES.forEach(key => {
      if (ns.SCRIPT_PROPERTIES.getProperty(key)) {
        ns.SCRIPT_PROPERTIES.deleteProperty(key);
        results.removed.push(key);
      }
    });
    
    return results;
  };
  
  /**
   * Repair configuration issues
   */
  ns.repair = function() {
    Logger.log('🛠️ === Repairing Configuration ===');
    
    const issues = [];
    
    // Check each property
    Object.keys(PROPERTY_DEFINITIONS).forEach(key => {
      const value = ns.SCRIPT_PROPERTIES.getProperty(key);
      const def = PROPERTY_DEFINITIONS[key];
      
      if (value && def.validate && !def.validate(value)) {
        issues.push(key);
        ns.SCRIPT_PROPERTIES.deleteProperty(key);
        Logger.log(`🗑️ Cleared invalid ${key}`);
      }
    });
    
    if (issues.length > 0) {
      Logger.log(`✅ Cleared ${issues.length} invalid properties`);
      Logger.log('💡 Run BoxerApp.setup() to recreate');
    } else {
      Logger.log('✅ No invalid properties found');
    }
    
    return issues;
  };
  
  /**
   * Get configuration status
   */
  ns.getStatus = function() {
    const status = {
      categories: {},
      overall: { required: 0, set: 0, valid: 0 }
    };
    
    Object.keys(PROPERTY_DEFINITIONS).forEach(key => {
      const def = PROPERTY_DEFINITIONS[key];
      const value = ns.getProperty(key);
      const category = def.category || 'other';
      
      if (!status.categories[category]) {
        status.categories[category] = {
          required: 0,
          optional: 0,
          set: 0,
          valid: 0,
          properties: []
        };
      }
      
      const propStatus = {
        key: key,
        required: def.required,
        hasValue: value !== null,
        isValid: value !== null && (!def.validate || def.validate(value))
      };
      
      status.categories[category].properties.push(propStatus);
      
      if (def.required) {
        status.categories[category].required++;
        status.overall.required++;
      } else {
        status.categories[category].optional++;
      }
      
      if (propStatus.hasValue) {
        status.categories[category].set++;
        status.overall.set++;
      }
      
      if (propStatus.isValid) {
        status.categories[category].valid++;
        status.overall.valid++;
      }
    });
    
    return status;
  };
  
  /**
   * Store runtime state
   */
  ns.setState = function(key, value, expirationInSeconds = 21600) {
    ns.CACHE_SERVICE.put(key, JSON.stringify(value), expirationInSeconds);
  };
  
  /**
   * Get runtime state
   */
  ns.getState = function(key) {
    const value = ns.CACHE_SERVICE.get(key);
    return value ? JSON.parse(value) : null;
  };
  
  /**
   * Get current script version
   */
  ns.getCurrentVersion = () => ns.SCRIPT_VERSION;
  
  /**
   * Check if file is an image
   */
  ns.isImageFile = function(filename) {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return ns.IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
  };
  
  return ns;
})();