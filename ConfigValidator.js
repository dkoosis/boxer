// File: ConfigValidator.js
// Proactive configuration validation and setup assistance for Boxer
// This module ensures all required configurations exist and helps create missing resources

var ConfigValidator = (function() {
  'use strict';
  
  var ns = {};
  
  // Define all required configurations and their setup methods
  var REQUIRED_CONFIGS = {
    // Google Drive Resources - All auto-created with sensible defaults
    DRIVE_CACHE_FOLDER_ID: {
      description: 'Google Drive folder for caching Box reports',
      validator: validateDriveFolderId,
      autoSetup: setupCacheFolder,
      category: 'drive'
    },
    
    TRACKING_SHEET_ID: {
      description: 'Google Sheet for error tracking and analytics',
      validator: validateSpreadsheetId,
      autoSetup: setupTrackingSheet,
      category: 'sheets'
    },
    
    // Box Resources  
    BOX_OAUTH_CLIENT_ID: {
      description: 'Box OAuth Client ID from Box Developer Console',
      validator: validateNonEmpty,
      autoSetup: null, // Manual setup required - external service
      category: 'box_auth'
    },
    
    BOX_OAUTH_CLIENT_SECRET: {
      description: 'Box OAuth Client Secret from Box Developer Console',
      validator: validateNonEmpty,
      autoSetup: null, // Manual setup required - external service
      category: 'box_auth'
    },
    
    // Box Configuration - Auto-setup where possible
    BOX_METADATA_SCOPE: {
      description: 'Box metadata scope (usually enterprise_[id])',
      validator: validateNonEmpty,
      autoSetup: setupBoxMetadataScope, // Will try to auto-detect
      category: 'box_config'
    },
    
    IMAGE_METADATA_TEMPLATE_KEY: {
      description: 'Box metadata template key for images',
      validator: validateNonEmpty,
      autoSetup: setupDefaultMetadataKeys,
      defaultValue: 'boxerImageMetadata',
      category: 'box_config'
    },
    
    LEGAL_METADATA_TEMPLATE_KEY: {
      description: 'Box metadata template key for legal documents',
      validator: validateNonEmpty,
      autoSetup: setupLegalMetadataKey,
      defaultValue: 'boxerLegalMetadata',
      category: 'box_config'
    },
    
    BOX_REPORTS_FOLDER_ID: {
      description: 'Box folder ID containing CSV reports',
      validator: validateNonEmpty,
      autoSetup: null, // Manual required - needs user to identify their reports folder
      category: 'box_folders'
    },
    
    ACTIVE_TEST_FOLDER_ID: {
      description: 'Box folder ID for priority processing',
      validator: allowEmptyOrValid,
      autoSetup: setupEmptyDefault, // Just sets empty string
      category: 'box_folders',
      optional: true
    },
    
    // API Keys - Optional features
    VISION_API_KEY: {
      description: 'Google Vision API key for image analysis',
      validator: allowEmptyOrValid,
      autoSetup: setupEmptyDefault,
      category: 'api_keys',
      optional: true
    },
    
    AIRTABLE_API_KEY: {
      description: 'Airtable API key for archival features',
      validator: allowEmptyOrValid,
      autoSetup: setupEmptyDefault,
      category: 'api_keys',
      optional: true
    },
    
    // Airtable Configuration - Set sensible defaults
    AIRTABLE_DEFAULT_BASE_ID: {
      description: 'Default Airtable base ID',
      validator: allowEmptyOrValid,
      autoSetup: setupEmptyDefault,
      category: 'airtable',
      optional: true
    },
    
    AIRTABLE_DEFAULT_TABLE_NAME: {
      description: 'Default Airtable table name',
      validator: allowEmptyOrValid,
      autoSetup: setupEmptyDefault,
      category: 'airtable',
      optional: true
    },
    
    AIRTABLE_ROOT_FOLDER_ID: {
      description: 'Box folder ID for Airtable archives',
      validator: allowEmptyOrValid,
      autoSetup: setupBoxRootFolder, // Will use root if not specified
      defaultValue: '0',
      category: 'airtable',
      optional: true
    },
    
    // System Configuration
    BUILD_NUMBER: {
      description: 'Current build number for version tracking',
      validator: validateNonEmpty,
      autoSetup: setupBuildNumber,
      defaultValue: new Date().toISOString().slice(0,10).replace(/-/g,'') + '.001',
      category: 'system'
    },
    
    ERROR_LOG_SHEET_NAME: {
      description: 'Sheet name within tracking spreadsheet for errors',
      validator: validateNonEmpty,
      autoSetup: setupDefaultSheetName,
      defaultValue: 'Error_Log',
      category: 'system'
    },
    
    TRACKING_SHEET_NAME: {
      description: 'Sheet name within tracking spreadsheet for analytics',
      validator: validateNonEmpty,
      autoSetup: setupTrackingSheetName,
      defaultValue: 'Processing_Stats',
      category: 'system'
    }
  };
  
  // Validation functions
  function validateNonEmpty(value) {
    return value && value.trim().length > 0;
  }
  
  function allowEmptyOrValid(value) {
    // For optional fields - empty string is valid
    return value !== null && value !== undefined;
  }
  
  function validateDriveFolderId(value) {
    if (!validateNonEmpty(value)) return false;
    try {
      var folder = DriveApp.getFolderById(value);
      return folder.getName() !== null; // If we can get the name, it exists
    } catch (e) {
      return false;
    }
  }
  
  function validateSpreadsheetId(value) {
    if (!validateNonEmpty(value)) return false;
    try {
      var sheet = SpreadsheetApp.openById(value);
      return sheet.getName() !== null;
    } catch (e) {
      return false;
    }
  }
  
  // Auto-setup functions
  function setupCacheFolder() {
    try {
      // Create a well-organized folder structure
      var boxerFolder = getOrCreateBoxerFolder();
      
      // Look for existing cache folder within Boxer folder
      var folders = boxerFolder.getFoldersByName('Report_Cache');
      var cacheFolder;
      
      if (folders.hasNext()) {
        cacheFolder = folders.next();
        Logger.log('📁 Found existing Report_Cache folder');
      } else {
        cacheFolder = boxerFolder.createFolder('Report_Cache');
        cacheFolder.setDescription('Cache for Box.com CSV reports used by Boxer metadata processing');
        Logger.log('📁 Created new Report_Cache folder');
      }
      
      return cacheFolder.getId();
    } catch (e) {
      Logger.log('❌ Failed to create cache folder: ' + e.toString());
      return null;
    }
  }
  
  function setupTrackingSheet() {
    try {
      var boxerFolder = getOrCreateBoxerFolder();
      
      // Look for existing tracking sheet
      var files = boxerFolder.getFilesByName('Boxer_Analytics');
      var sheet;
      
      if (files.hasNext()) {
        var file = files.next();
        sheet = SpreadsheetApp.open(file);
        Logger.log('📊 Found existing Boxer_Analytics sheet');
      } else {
        sheet = SpreadsheetApp.create('Boxer_Analytics');
        
        // Set up multiple sheets for different tracking purposes
        var errorSheet = sheet.getActiveSheet();
        errorSheet.setName('Error_Log');
        errorSheet.getRange(1, 1, 1, 6).setValues([[
          'Timestamp', 'Function', 'Error Message', 'Context', 'Stack Trace', 'Build Number'
        ]]);
        errorSheet.getRange(1, 1, 1, 6).setFontWeight('bold');
        errorSheet.setFrozenRows(1);
        
        // Add processing stats sheet
        var statsSheet = sheet.insertSheet('Processing_Stats');
        statsSheet.getRange(1, 1, 1, 8).setValues([[
          'Timestamp', 'Run Type', 'Files Found', 'Files Processed', 'Files Skipped', 
          'Errors', 'Duration (sec)', 'Build Number'
        ]]);
        statsSheet.getRange(1, 1, 1, 8).setFontWeight('bold');
        statsSheet.setFrozenRows(1);
        
        // Move to Boxer folder
        DriveApp.getFileById(sheet.getId()).moveTo(boxerFolder);
        
        Logger.log('📊 Created new Boxer_Analytics sheet with Error_Log and Processing_Stats tabs');
      }
      
      return sheet.getId();
    } catch (e) {
      Logger.log('❌ Failed to create tracking sheet: ' + e.toString());
      return null;
    }
  }
  
  function setupBoxMetadataScope() {
    try {
      // Try to auto-detect from Box API
      var token = getValidAccessToken();
      if (!token) {
        // If no token yet, set a placeholder that will be updated on first successful run
        return 'enterprise_pending';
      }
      
      // Get enterprise info from Box
      var response = UrlFetchApp.fetch('https://api.box.com/2.0/users/me', {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var userData = JSON.parse(response.getContentText());
        if (userData.enterprise && userData.enterprise.id) {
          var scope = 'enterprise_' + userData.enterprise.id;
          Logger.log('🔍 Auto-detected Box metadata scope: ' + scope);
          return scope;
        }
      }
    } catch (e) {
      Logger.log('⚠️ Could not auto-detect Box metadata scope: ' + e.toString());
    }
    
    // Fallback
    return 'enterprise';
  }
  
  function setupDefaultMetadataKeys() {
    return 'boxerImageMetadata';
  }
  
  function setupLegalMetadataKey() {
    return 'boxerLegalMetadata';
  }
  
  function setupEmptyDefault() {
    return '';
  }
  
  function setupBoxRootFolder() {
    return '0'; // Box root folder
  }
  
  function setupBuildNumber() {
    return new Date().toISOString().slice(0,10).replace(/-/g,'') + '.001';
  }
  
  function setupDefaultSheetName() {
    return 'Error_Log';
  }
  
  function setupTrackingSheetName() {
    return 'Processing_Stats';
  }
  
  /**
   * Get or create the main Boxer folder in Google Drive
   * @returns {GoogleAppsScript.Drive.Folder} The Boxer folder
   */
  function getOrCreateBoxerFolder() {
    // Look for existing Boxer folder in root
    var folders = DriveApp.getFoldersByName('Boxer_Files');
    
    if (folders.hasNext()) {
      return folders.next();
    } else {
      var boxerFolder = DriveApp.createFolder('Boxer_Files');
      boxerFolder.setDescription('Automated folder for Boxer metadata system - contains cache files and analytics');
      boxerFolder.setColor('#4285f4'); // Google Blue
      Logger.log('📁 Created main Boxer_Files folder');
      return boxerFolder;
    }
  }
  
  /**
   * Main validation function - checks all configurations
   * @param {boolean} autoFix - Whether to automatically fix issues
   * @returns {object} Validation results
   */
  ns.validateConfiguration = function(autoFix) {
    Logger.log('🔍 === Configuration Validation Started ===');
    
    var results = {
      valid: true,
      fixed: 0,
      errors: [],
      warnings: [],
      categories: {}
    };
    
    var scriptProps = PropertiesService.getScriptProperties();
    
    // Group by category for organized reporting
    Object.keys(REQUIRED_CONFIGS).forEach(function(key) {
      var config = REQUIRED_CONFIGS[key];
      var category = config.category;
      
      if (!results.categories[category]) {
        results.categories[category] = {
          valid: 0,
          invalid: 0,
          fixed: 0,
          configs: []
        };
      }
      
      var value = scriptProps.getProperty(key);
      var isValid = config.validator ? config.validator(value) : false;
      
      var configResult = {
        key: key,
        description: config.description,
        hasValue: !!value,
        isValid: isValid,
        isOptional: config.optional || false,
        canAutoFix: !!config.autoSetup
      };
      
      if (!isValid && !config.optional) {
        results.valid = false;
        
        if (autoFix && config.autoSetup) {
          Logger.log('🔧 Auto-fixing: ' + key);
          var newValue = config.autoSetup();
          if (newValue) {
            scriptProps.setProperty(key, newValue);
            configResult.isValid = true;
            configResult.autoFixed = true;
            configResult.newValue = newValue;
            results.fixed++;
            results.categories[category].fixed++;
            Logger.log('✅ Fixed ' + key + ' = ' + newValue);
          } else {
            results.errors.push('Failed to auto-fix ' + key);
          }
        } else if (!config.optional) {
          results.errors.push(key + ' is missing or invalid');
        }
      }
      
      if (isValid) {
        results.categories[category].valid++;
      } else {
        results.categories[category].invalid++;
      }
      
      results.categories[category].configs.push(configResult);
    });
    
    return results;
  };
  
  /**
   * Generate a user-friendly setup guide based on validation results
   * @param {object} results - Results from validateConfiguration
   * @returns {string} Setup instructions
   */
  ns.generateSetupGuide = function(results) {
    var guide = [];
    
    guide.push('📋 === Boxer Configuration Status ===\n');
    
    if (results.valid && results.errors.length === 0) {
      guide.push('✅ All configurations are valid!');
      
      // Show summary of what's configured
      guide.push('\n📊 Configuration Summary:');
      Object.keys(results.categories).forEach(function(cat) {
        var catData = results.categories[cat];
        if (catData.valid > 0) {
          guide.push('  ' + getCategoryName(cat) + ': ' + catData.valid + ' configured');
        }
      });
      
      return guide.join('\n');
    }
    
    // Show what was auto-fixed
    if (results.fixed > 0) {
      guide.push('🔧 Auto-configured ' + results.fixed + ' setting(s):\n');
      Object.keys(results.categories).forEach(function(cat) {
        var catData = results.categories[cat];
        catData.configs.forEach(function(config) {
          if (config.autoFixed) {
            guide.push('  ✅ ' + config.key + ' = ' + config.newValue);
          }
        });
      });
      guide.push('');
    }
    
    // Only show manual setup for truly required items
    var manualRequired = false;
    Object.keys(results.categories).forEach(function(cat) {
      var catData = results.categories[cat];
      catData.configs.forEach(function(config) {
        if (!config.isValid && !config.isOptional && !config.autoFixed && !config.canAutoFix) {
          manualRequired = true;
        }
      });
    });
    
    if (manualRequired) {
      guide.push('⚠️ Manual setup required for external services:\n');
      
      // Group instructions by category
      Object.keys(results.categories).forEach(function(category) {
        var catData = results.categories[category];
        var hasManualItems = false;
        
        catData.configs.forEach(function(config) {
          if (!config.isValid && !config.isOptional && !config.autoFixed && !config.canAutoFix) {
            if (!hasManualItems) {
              guide.push(getCategoryName(category) + ':');
              hasManualItems = true;
            }
            
            guide.push('  ❌ ' + config.key);
            guide.push('     ' + config.description);
            
            // Add specific instructions
            if (config.key === 'BOX_OAUTH_CLIENT_ID' || config.key === 'BOX_OAUTH_CLIENT_SECRET') {
              guide.push('     → Run: setBoxCredentials("YOUR_CLIENT_ID", "YOUR_CLIENT_SECRET")');
            } else if (config.key === 'BOX_REPORTS_FOLDER_ID') {
              guide.push('     → Run: setBoxReportsFolder("YOUR_FOLDER_ID")');
              guide.push('     💡 Find the ID in your Box.com URL when viewing the reports folder');
            }
            guide.push('');
          }
        });
      });
    }
    
    // Show optional features that could be enabled
    var hasOptional = false;
    Object.keys(results.categories).forEach(function(cat) {
      var catData = results.categories[cat];
      catData.configs.forEach(function(config) {
        if (config.isOptional && !config.hasValue) {
          if (!hasOptional) {
            guide.push('\n💡 Optional features (currently disabled):');
            hasOptional = true;
          }
          
          if (config.key === 'VISION_API_KEY') {
            guide.push('  • AI image analysis - Run: setVisionApiKey("YOUR_KEY")');
          } else if (config.key === 'AIRTABLE_API_KEY') {
            guide.push('  • Airtable archival - Run: setAirtableApiKey("YOUR_KEY")');
          } else if (config.key === 'ACTIVE_TEST_FOLDER_ID') {
            guide.push('  • Priority folder processing - Run: setBoxTestFolder("FOLDER_ID")');
          }
        }
      });
    });
    
    return guide.join('\n');
  };
  
  /**
   * Get friendly category name
   * @private
   */
  function getCategoryName(category) {
    var names = {
      'box_auth': '🔐 Box Authentication',
      'box_config': '📦 Box Configuration', 
      'box_folders': '📁 Box Folders',
      'drive': '💾 Google Drive',
      'sheets': '📊 Google Sheets',
      'api_keys': '🔑 API Keys',
      'system': '⚙️ System',
      'airtable': '📋 Airtable'
    };
    return names[category] || category;
  }
  
  /**
   * Interactive setup wizard - guides through manual configurations
   * @returns {boolean} Success status
   */
  ns.runSetupWizard = function() {
    Logger.log('🚀 === Boxer Setup Wizard ===');
    Logger.log('Creating default configurations and resources...\n');
    
    // First validate and auto-fix what we can
    var results = ns.validateConfiguration(true);
    
    // Generate and display the setup guide
    var guide = ns.generateSetupGuide(results);
    Logger.log(guide);
    
    // Count what still needs manual setup
    var manualRequired = 0;
    Object.keys(results.categories).forEach(function(cat) {
      results.categories[cat].configs.forEach(function(config) {
        if (!config.isValid && !config.isOptional && !config.autoFixed) {
          manualRequired++;
        }
      });
    });
    
    // If everything is valid after auto-fix, we're done
    if (results.valid) {
      Logger.log('\n🎉 Configuration complete! Boxer is ready to use.');
      Logger.log('\n📊 Resources created:');
      Logger.log('  • Google Drive folder: Boxer_Files/Report_Cache');
      Logger.log('  • Analytics spreadsheet: Boxer_Analytics');
      Logger.log('  • Metadata templates: boxerImageMetadata, boxerLegalMetadata');
      Logger.log('  • Build tracking: ' + Config.getCurrentBuild());
      return true;
    }
    
    // Provide clear next steps
    if (manualRequired > 0) {
      Logger.log('\n📝 === Next Steps ===');
      Logger.log('You need to provide ' + manualRequired + ' external configuration(s):\n');
      
      // Check what's missing and provide targeted help
      var hasBoxAuth = results.categories.box_auth && 
                      results.categories.box_auth.configs.every(c => c.isValid);
      var hasReportsFolder = Config.SCRIPT_PROPERTIES.getProperty('BOX_REPORTS_FOLDER_ID');
      
      if (!hasBoxAuth) {
        Logger.log('1️⃣ Box OAuth Setup:');
        Logger.log('   quickSetupBox("CLIENT_ID", "CLIENT_SECRET", "REPORTS_FOLDER_ID")');
        Logger.log('   - Get credentials from: https://app.box.com/developers/console');
        Logger.log('   - Reports folder ID is in the URL when viewing the folder\n');
      } else if (!hasReportsFolder) {
        Logger.log('1️⃣ Box Reports Folder:');
        Logger.log('   setBoxReportsFolder("YOUR_FOLDER_ID")');
        Logger.log('   - Find the ID in the URL when viewing your reports folder\n');
      }
      
      Logger.log('After setting these, run setupBoxer() again to complete setup.');
    }
    
    return results.valid;
  };
  
  return ns;
})();

// ============================================
// HELPER FUNCTIONS FOR MANUAL CONFIGURATION
// ============================================

/**
 * Set Box OAuth credentials
 */
function setBoxCredentials(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    Logger.log('❌ Both Client ID and Client Secret are required');
    return;
  }
  
  var props = PropertiesService.getScriptProperties();
  props.setProperty('BOX_OAUTH_CLIENT_ID', clientId);
  props.setProperty('BOX_OAUTH_CLIENT_SECRET', clientSecret);
  Logger.log('✅ Box credentials saved');
}

/**
 * Set Box reports folder with validation
 */
function setBoxReportsFolder(folderId) {
  if (!folderId) {
    Logger.log('❌ Folder ID is required');
    Logger.log('💡 To find your reports folder ID:');
    Logger.log('   1. Open the reports folder in Box.com');
    Logger.log('   2. Look at the URL - it will end with /folder/YOUR_FOLDER_ID');
    Logger.log('   3. Copy that number and run: setBoxReportsFolder("YOUR_FOLDER_ID")');
    return;
  }
  
  // Validate the folder exists and is accessible
  try {
    var token = getValidAccessToken();
    if (token) {
      var response = UrlFetchApp.fetch('https://api.box.com/2.0/folders/' + folderId + '?fields=name', {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        var folder = JSON.parse(response.getContentText());
        Logger.log('✅ Found folder: "' + folder.name + '"');
        PropertiesService.getScriptProperties().setProperty('BOX_REPORTS_FOLDER_ID', folderId);
        Logger.log('✅ Box reports folder configured successfully');
        return;
      } else if (response.getResponseCode() === 404) {
        Logger.log('❌ Folder not found. Please check the ID and try again.');
        return;
      }
    }
  } catch (e) {
    Logger.log('⚠️ Could not validate folder (Box auth may not be complete yet)');
  }
  
  // Set it anyway if we can't validate
  PropertiesService.getScriptProperties().setProperty('BOX_REPORTS_FOLDER_ID', folderId);
  Logger.log('✅ Box reports folder set to: ' + folderId);
  Logger.log('⚠️ Note: Could not validate folder exists (complete Box auth first)');
}

/**
 * Set Box test folder for priority processing
 */
function setBoxTestFolder(folderId) {
  PropertiesService.getScriptProperties().setProperty('ACTIVE_TEST_FOLDER_ID', folderId || '');
  Logger.log('✅ Box test folder set to: ' + (folderId || 'none'));
}

/**
 * Set Vision API key
 */
function setVisionApiKey(apiKey) {
  if (!apiKey) {
    Logger.log('❌ API key is required');
    return;
  }
  
  PropertiesService.getScriptProperties().setProperty('VISION_API_KEY', apiKey);
  Logger.log('✅ Vision API key saved');
}

/**
 * Set Airtable API key
 */
function setAirtableApiKey(apiKey) {
  if (!apiKey) {
    Logger.log('❌ API key is required');
    return;
  }
  
  PropertiesService.getScriptProperties().setProperty('AIRTABLE_API_KEY', apiKey);
  Logger.log('✅ Airtable API key saved');
}

/**
 * Main setup function - run this first!
 */
function setupBoxer() {
  Logger.log('🐕 === Welcome to Boxer Setup ===\n');
  
  var wizard = ConfigValidator.runSetupWizard();
  
  if (wizard) {
    Logger.log('\n🎉 Setup complete! Next steps:');
    Logger.log('1. Run initializeBoxAuth() to connect to Box');
    Logger.log('2. Run test_boxer_basic() to verify everything works');
    Logger.log('3. Set up triggers for add_metadata_to_images()');
  } else {
    Logger.log('\n⚠️ Some manual configuration still needed');
    Logger.log('Follow the instructions above, then run setupBoxer() again');
  }
}

/**
 * Check current configuration status
 */
function checkConfiguration() {
  var results = ConfigValidator.validateConfiguration(false);
  var guide = ConfigValidator.generateSetupGuide(results);
  Logger.log(guide);
  
  if (!results.valid) {
    Logger.log('\n💡 Run setupBoxer() to fix issues automatically where possible');
  }
}

/**
 * Quick setup for minimal Box configuration
 * Use this if you just want to get started with basic functionality
 */
function quickSetupBox(clientId, clientSecret, reportsFolderId) {
  Logger.log('🚀 === Boxer Quick Setup ===');
  
  if (!clientId || !clientSecret || !reportsFolderId) {
    Logger.log('❌ All three parameters are required:');
    Logger.log('   quickSetupBox("CLIENT_ID", "CLIENT_SECRET", "REPORTS_FOLDER_ID")');
    Logger.log('\n📝 To get these values:');
    Logger.log('1. Box OAuth credentials: https://app.box.com/developers/console');
    Logger.log('2. Reports folder ID: Open the folder in Box.com and copy ID from URL');
    return;
  }
  
  // Set the required Box properties
  setBoxCredentials(clientId, clientSecret);
  setBoxReportsFolder(reportsFolderId);
  
  // Run the setup wizard to create all other resources
  Logger.log('\n🔧 Creating Google Drive resources...');
  setupBoxer();
}

/**
 * Clear all Boxer settings (use with caution!)
 */
function resetBoxerConfiguration() {
  Logger.log('⚠️ === Resetting Boxer Configuration ===');
  Logger.log('This will clear all settings but preserve your Box data');
  
  var props = PropertiesService.getScriptProperties();
  var allProps = props.getProperties();
  
  var boxerProps = [];
  Object.keys(allProps).forEach(function(key) {
    // Only clear Boxer-specific properties
    if (key.includes('BOX') || key.includes('DRIVE') || key.includes('TRACKING') || 
        key.includes('AIRTABLE') || key.includes('VISION') || key === 'BUILD_NUMBER') {
      boxerProps.push(key);
    }
  });
  
  Logger.log('Found ' + boxerProps.length + ' Boxer properties to clear');
  
  boxerProps.forEach(function(key) {
    props.deleteProperty(key);
  });
  
  Logger.log('✅ Configuration cleared. Run setupBoxer() to reconfigure.');
}

/**
 * Helper function to find Box folders that might contain reports
 * This helps users find their reports folder ID
 */
function findBoxReportsFolders() {
  Logger.log('🔍 === Searching for Box Reports Folders ===');
  
  try {
    var token = getValidAccessToken();
    if (!token) {
      Logger.log('❌ Box authentication required. Run initializeBoxAuth() first.');
      return;
    }
    
    // Search for folders with "report" in the name
    var searchUrl = 'https://api.box.com/2.0/search?query=report&type=folder&limit=20';
    var response = UrlFetchApp.fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      Logger.log('❌ Search failed. Make sure you have Box access.');
      return;
    }
    
    var results = JSON.parse(response.getContentText());
    var folders = results.entries || [];
    
    if (folders.length === 0) {
      Logger.log('No folders with "report" in the name found.');
      Logger.log('💡 Try searching manually in Box.com for your reports folder.');
      return;
    }
    
    Logger.log('Found ' + folders.length + ' folder(s) with "report" in the name:\n');
    
    folders.forEach(function(folder, index) {
      var path = 'Root';
      if (folder.path_collection && folder.path_collection.entries) {
        path = folder.path_collection.entries
          .map(function(p) { return p.name; })
          .join(' > ');
      }
      
      Logger.log((index + 1) + '. ' + folder.name);
      Logger.log('   Path: ' + path);
      Logger.log('   ID: ' + folder.id);
      Logger.log('   To use: setBoxReportsFolder("' + folder.id + '")');
      Logger.log('');
    });
    
    Logger.log('💡 Look for folders containing CSV reports from Box analytics.');
    Logger.log('   These usually have names like "Reports" or "Analytics Reports"');
    
  } catch (error) {
    Logger.log('❌ Error searching for folders: ' + error.toString());
  }
}