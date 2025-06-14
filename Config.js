// File: Config.js
// Unified configuration management for Boxer
// Handles property definitions, validation, migration, and access

var Config = (function() {
  'use strict';
  
  const ns = {};
  
  // Core services
  ns.SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
  ns.CACHE_SERVICE = CacheService.getScriptCache();
  
  // API endpoints
  ns.BOX_API_BASE_URL = 'https://api.box.com/2.0';
  ns.VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';
  ns.AIRTABLE_API_BASE_URL = 'https://api.airtable.com/v0';
  
  // Internal constants (not user-configurable)
  ns.ERROR_LOG_SHEET_NAME = 'Error_Log';
  ns.PROCESSING_STATS_SHEET_NAME = 'Processing_Stats';
  ns.SCRIPT_VERSION = '3.0';
  ns.BUILD_NUMBER = '20241219.001';
  
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
      validate: function(id) {
        if (!id) return false;
        try {
          DriveApp.getFolderById(id);
          return true;
        } catch (e) {
          return false;
        }
      },
      autoCreate: function() {
        const folder = DriveApp.createFolder('Boxer_Cache');
        folder.setDescription('Cache for Box CSV reports');
        return folder.getId();
      }
    },
    
    BOXER_TRACKING_SHEET: {
      required: true,
      category: 'google',
      description: 'Google Sheet for analytics and error tracking',
      validate: function(id) {
        if (!id) return false;
        try {
          SpreadsheetApp.openById(id);
          return true;
        } catch (e) {
          return false;
        }
      },
      autoCreate: function() {
        const sheet = SpreadsheetApp.create('Boxer_Analytics');
        
        // Set up error log sheet
        const errorSheet = sheet.getActiveSheet();
        errorSheet.setName(ns.ERROR_LOG_SHEET_NAME);
        errorSheet.getRange(1, 1, 1, 6).setValues([[
          'Timestamp', 'Function', 'Error Message', 'Context', 'Stack Trace', 'Build Number'
        ]]);
        errorSheet.setFrozenRows(1);
        
        // Set up stats sheet
        const statsSheet = sheet.insertSheet(ns.PROCESSING_STATS_SHEET_NAME);
        statsSheet.getRange(1, 1, 1, 8).setValues([[
          'Timestamp', 'Run Type', 'Files Found', 'Files Processed', 'Files Skipped', 
          'Errors', 'Duration (sec)', 'Build Number'
        ]]);
        statsSheet.setFrozenRows(1);
        
        return sheet.getId();
      }
    },
    
    // Box Authentication
    BOX_CLIENT_ID: {
      required: true,
      category: 'box_auth',
      description: 'Box OAuth client ID',
      validate: function(val) { return val && val.length > 0; }
    },
    
    BOX_CLIENT_SECRET: {
      required: true,
      category: 'box_auth',
      description: 'Box OAuth client secret',
      validate: function(val) { return val && val.length > 0; }
    },
    
    // Box Configuration
    BOX_ENTERPRISE_ID: {
      required: true,
      category: 'box_config',
      description: 'Box enterprise ID (numbers only)',
      validate: function(val) { return val && /^\d+$/.test(val); },
      autoDetect: function() {
        try {
          if (typeof getValidAccessToken === 'function') {
            const token = getValidAccessToken();
            const response = UrlFetchApp.fetch(ns.BOX_API_BASE_URL + '/users/me', {
              headers: { 'Authorization': 'Bearer ' + token }
            });
            const userData = JSON.parse(response.getContentText());
            return userData.enterprise ? userData.enterprise.id : null;
          }
        } catch (e) {
          Logger.log('Could not auto-detect enterprise ID: ' + e.toString());
        }
        return null;
      }
    },
    
    BOX_IMAGE_METADATA_ID: {
      required: true,
      category: 'box_config',
      description: 'Box metadata template key for images',
      default: 'boxerImageMetadata',
      validate: function(val) { return val && val.length > 0; }
    },
    
    BOX_LEGAL_METADATA_ID: {
      required: false,
      category: 'box_config',
      description: 'Box metadata template key for legal documents',
      default: 'boxerLegalMetadata',
      validate: function(val) { return !val || val.length > 0; }
    },
    
    BOX_REPORTS_FOLDER: {
      required: true,
      category: 'box_config',
      description: 'Box folder ID containing CSV reports',
      validate: function(val) { return val && val.length > 0; }
    },
    
    BOX_PRIORITY_FOLDER: {
      required: false,
      category: 'box_config',
      description: 'Box folder ID for priority processing',
      default: '',
      validate: function(val) { return true; } // Empty is valid
    },
    
    // External APIs
    GOOGLE_VISION_API_KEY: {
      required: false,
      category: 'apis',
      description: 'Google Vision API key for AI image analysis',
      default: '',
      validate: function(val) { return true; }
    },
    
    GOOGLE_GEOCODE_API_KEY: {
      required: false,
      category: 'apis',
      description: 'Google Geocoding API key for GPS location names',
      default: '',
      validate: function(val) { return true; }
    },
    
    AIRTABLE_API_KEY: {
      required: false,
      category: 'apis',
      description: 'Airtable API key for archival features',
      default: '',
      validate: function(val) { return true; }
    },
    
    // Airtable Configuration
    AIRTABLE_BASE_ID: {
      required: false,
      category: 'airtable',
      description: 'Airtable base ID',
      default: '',
      validate: function(val) { return true; }
    },
    
    AIRTABLE_TABLE_NAME: {
      required: false,
      category: 'airtable',
      description: 'Airtable table name',
      default: '',
      validate: function(val) { return true; }
    },
    
    BOX_AIRTABLE_ARCHIVE_FOLDER: {
      required: false,
      category: 'airtable',
      description: 'Box folder ID for Airtable archives',
      default: '0', // Box root
      validate: function(val) { return true; }
    }
  };
  
  // Migration map from old to new property names
  const MIGRATION_MAP = {
    'DRIVE_CACHE_FOLDER_ID': 'BOXER_CACHE_FOLDER',
    'TRACKING_SHEET_ID': 'BOXER_TRACKING_SHEET',
    'BOX_OAUTH_CLIENT_ID': 'BOX_CLIENT_ID',
    'BOX_OAUTH_CLIENT_SECRET': 'BOX_CLIENT_SECRET',
    'BOX_METADATA_SCOPE': 'BOX_ENTERPRISE_ID', // Will need to extract ID
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
  
  // Properties to remove (moved to other storage)
  const DEPRECATED_PROPERTIES = [
    'BUILD_NUMBER',
    'BOXER_REPORT_CHECKPOINT',
    'BOXER_REPORT_STATS',
    'BOXER_AIRTABLE_STATS',
    'BOXER_AIRTABLE_ERRORS',
    'ERROR_LOG_SHEET_NAME',
    'TRACKING_SHEET_NAME'
  ];
  
  /**
   * Get a property value with validation
   * @param {string} key Property key
   * @returns {string|null} Property value or null if invalid
   */
  ns.getProperty = function(key) {
    const def = PROPERTY_DEFINITIONS[key];
    if (!def) {
      throw new Error('Unknown property: ' + key);
    }
    
    let value = ns.SCRIPT_PROPERTIES.getProperty(key);
    
    // If not found and has default, use it
    if (value === null && def.default !== undefined) {
      value = def.default;
    }
    
    // Validate if we have a value
    if (value !== null && def.validate && !def.validate(value)) {
      Logger.log('⚠️ Invalid value for ' + key + ': ' + value);
      return null;
    }
    
    return value;
  };
  
  /**
   * Set a property value
   * @param {string} key Property key
   * @param {string} value Property value
   * @returns {boolean} Success
   */
  ns.setProperty = function(key, value) {
    const def = PROPERTY_DEFINITIONS[key];
    if (!def) {
      throw new Error('Unknown property: ' + key);
    }
    
    // Validate before setting
    if (def.validate && !def.validate(value)) {
      Logger.log('❌ Invalid value for ' + key + ': ' + value);
      return false;
    }
    
    ns.SCRIPT_PROPERTIES.setProperty(key, value);
    return true;
  };
  
  /**
   * Get Box metadata scope (computed from enterprise ID)
   * @returns {string} Full scope like 'enterprise_12345'
   */
  ns.getBoxMetadataScope = function() {
    const enterpriseId = ns.getProperty('BOX_ENTERPRISE_ID');
    return enterpriseId ? 'enterprise_' + enterpriseId : 'enterprise';
  };
  
  /**
   * Validate all configuration
   * @param {boolean} autoFix Whether to auto-create missing resources
   * @returns {object} Validation results
   */
  ns.validate = function(autoFix) {
    const results = {
      valid: true,
      errors: [],
      warnings: [],
      fixed: []
    };
    
    Object.keys(PROPERTY_DEFINITIONS).forEach(function(key) {
      const def = PROPERTY_DEFINITIONS[key];
      const value = ns.SCRIPT_PROPERTIES.getProperty(key);
      
      // Check required properties
      if (def.required && !value) {
        if (autoFix && def.autoCreate) {
          try {
            const newValue = def.autoCreate();
            ns.setProperty(key, newValue);
            results.fixed.push(key + ' (created: ' + newValue + ')');
          } catch (e) {
            results.valid = false;
            results.errors.push(key + ' is required but could not auto-create: ' + e.toString());
          }
        } else if (autoFix && def.autoDetect) {
          try {
            const detected = def.autoDetect();
            if (detected) {
              ns.setProperty(key, detected);
              results.fixed.push(key + ' (detected: ' + detected + ')');
            } else {
              results.valid = false;
              results.errors.push(key + ' is required but could not auto-detect');
            }
          } catch (e) {
            results.valid = false;
            results.errors.push(key + ' is required but auto-detect failed: ' + e.toString());
          }
        } else {
          results.valid = false;
          results.errors.push(key + ' is required but not set');
        }
      } else if (value && def.validate && !def.validate(value)) {
        results.valid = false;
        results.errors.push(key + ' has invalid value: ' + value);
      }
    });
    
    return results;
  };
  
  /**
   * Migrate from old property names
   * @returns {object} Migration results
   */
  ns.migrate = function() {
    const results = {
      migrated: [],
      removed: [],
      special: []
    };
    
    // Migrate renamed properties
    Object.keys(MIGRATION_MAP).forEach(function(oldKey) {
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
        results.migrated.push(oldKey + ' → ' + newKey);
      }
    });
    
    // Remove deprecated properties
    DEPRECATED_PROPERTIES.forEach(function(key) {
      if (ns.SCRIPT_PROPERTIES.getProperty(key)) {
        ns.SCRIPT_PROPERTIES.deleteProperty(key);
        results.removed.push(key);
      }
    });
    
    return results;
  };
  
  /**
   * Get configuration status summary
   * @returns {object} Status by category
   */
  ns.getStatus = function() {
    const status = {
      categories: {},
      overall: { required: 0, set: 0, valid: 0 }
    };
    
    Object.keys(PROPERTY_DEFINITIONS).forEach(function(key) {
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
   * Store runtime state (replaces old Script Properties usage)
   * @param {string} key State key
   * @param {object} value State value (will be JSON stringified)
   * @param {number} expirationInSeconds Optional expiration (default 6 hours)
   */
  ns.setState = function(key, value, expirationInSeconds) {
    const expiration = expirationInSeconds || 21600; // 6 hours default
    ns.CACHE_SERVICE.put(key, JSON.stringify(value), expiration);
  };
  
  /**
   * Get runtime state
   * @param {string} key State key
   * @returns {object|null} Parsed state value or null
   */
  ns.getState = function(key) {
    const value = ns.CACHE_SERVICE.get(key);
    return value ? JSON.parse(value) : null;
  };
  
/**
 * Get current build number
 * @returns {string}
 */
ns.getCurrentBuild = function() {
  return ns.BUILD_NUMBER;
};

/**
 * Get Box metadata template key (legacy support)
 * @returns {string}
 */
  ns.BOX_METADATA_TEMPLATE_KEY = ns.BOX_IMAGE_METADATA_KEY;

  /**
   * Utility function to check if file is an image
   * @param {string} filename
   * @returns {boolean}
   */
  ns.isImageFile = function(filename) {
    if (!filename) return false;
    const lower = filename.toLowerCase();
    return ns.IMAGE_EXTENSIONS.some(ext => lower.endsWith(ext));
  };
  
  // Convenience getters for commonly used properties
  Object.defineProperty(ns, 'BOXER_CACHE_FOLDER_ID', {
    get: function() { return ns.getProperty('BOXER_CACHE_FOLDER'); }
  });
  
  Object.defineProperty(ns, 'BOXER_TRACKING_SHEET_ID', {
    get: function() { return ns.getProperty('BOXER_TRACKING_SHEET'); }
  });
  
  Object.defineProperty(ns, 'BOX_REPORTS_FOLDER_ID', {
    get: function() { return ns.getProperty('BOX_REPORTS_FOLDER'); }
  });
  
  Object.defineProperty(ns, 'BOX_PRIORITY_FOLDER_ID', {
    get: function() { return ns.getProperty('BOX_PRIORITY_FOLDER'); }
  });
  
  Object.defineProperty(ns, 'BOX_IMAGE_METADATA_KEY', {
    get: function() { return ns.getProperty('BOX_IMAGE_METADATA_ID'); }
  });
  
  Object.defineProperty(ns, 'BOX_LEGAL_METADATA_KEY', {
    get: function() { return ns.getProperty('BOX_LEGAL_METADATA_ID'); }
  });
  
  return ns;
})();

// Setup functions
function runConfigMigration() {
  Logger.log('🔄 === Configuration Migration ===');
  const results = Config.migrate();
  
  if (results.migrated.length > 0) {
    Logger.log('✅ Migrated properties:');
    results.migrated.forEach(m => Logger.log('  ' + m));
  }
  
  if (results.removed.length > 0) {
    Logger.log('🗑️ Removed deprecated properties:');
    results.removed.forEach(r => Logger.log('  ' + r));
  }
  
  if (results.special.length > 0) {
    Logger.log('⚙️ Special migrations:');
    results.special.forEach(s => Logger.log('  ' + s));
  }
  
  Logger.log('\nValidating configuration...');
  const validation = Config.validate(true);
  
  if (validation.valid) {
    Logger.log('✅ Configuration is valid');
  } else {
    Logger.log('❌ Configuration errors:');
    validation.errors.forEach(e => Logger.log('  ' + e));
  }
  
  if (validation.fixed.length > 0) {
    Logger.log('🔧 Auto-fixed:');
    validation.fixed.forEach(f => Logger.log('  ' + f));
  }
}

function showConfigStatus() {
  Logger.log('📊 === Configuration Status ===');
  const status = Config.getStatus();
  
  Logger.log('\nOverall: ' + status.overall.valid + '/' + status.overall.required + ' required properties set');
  
  Object.keys(status.categories).forEach(function(cat) {
    const catData = status.categories[cat];
    Logger.log('\n' + cat.toUpperCase() + ':');
    catData.properties.forEach(function(prop) {
      const icon = prop.isValid ? '✅' : (prop.hasValue ? '⚠️' : '❌');
      const req = prop.required ? ' (required)' : '';
      Logger.log('  ' + icon + ' ' + prop.key + req);
    });
  });
}