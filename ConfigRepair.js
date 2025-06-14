// File: ConfigRepair.js
// Utilities to repair configuration issues when resources are deleted or inaccessible

var ConfigRepair = (function() {
  'use strict';
  
  var ns = {};
  
  /**
   * Clear invalid Script Properties that point to deleted resources
   */
  ns.clearInvalidProperties = function() {
    Logger.log('🔧 === Clearing Invalid Properties ===');
    
    var props = PropertiesService.getScriptProperties();
    var cleared = [];
    
    // Check and clear invalid Drive folder
    var driveId = props.getProperty('DRIVE_CACHE_FOLDER_ID');
    if (driveId) {
      try {
        DriveApp.getFolderById(driveId);
        Logger.log('✅ DRIVE_CACHE_FOLDER_ID is valid');
      } catch (e) {
        props.deleteProperty('DRIVE_CACHE_FOLDER_ID');
        cleared.push('DRIVE_CACHE_FOLDER_ID');
        Logger.log('🗑️ Cleared invalid DRIVE_CACHE_FOLDER_ID: ' + driveId);
      }
    }
    
    // Check and clear invalid tracking sheet
    var sheetId = props.getProperty('TRACKING_SHEET_ID');
    if (sheetId) {
      try {
        SpreadsheetApp.openById(sheetId);
        Logger.log('✅ TRACKING_SHEET_ID is valid');
      } catch (e) {
        props.deleteProperty('TRACKING_SHEET_ID');
        cleared.push('TRACKING_SHEET_ID');
        Logger.log('🗑️ Cleared invalid TRACKING_SHEET_ID: ' + sheetId);
      }
    }
    
    if (cleared.length > 0) {
      Logger.log('\n✅ Cleared ' + cleared.length + ' invalid properties');
      Logger.log('💡 Run setupBoxer() to create new resources');
    } else {
      Logger.log('✅ All properties are valid');
    }
    
    return cleared;
  };
  
  /**
   * Force create new resources even if properties exist
   */
  ns.forceCreateResources = function() {
    Logger.log('🔨 === Force Creating Resources ===');
    
    var props = PropertiesService.getScriptProperties();
    var created = {};
    
    try {
      // Force create cache folder
      Logger.log('📁 Creating new cache folder...');
      var cacheFolder = DriveApp.createFolder('Boxer_Cache_' + new Date().getTime());
      cacheFolder.setDescription('Cache folder for Boxer report processing');
      props.setProperty('DRIVE_CACHE_FOLDER_ID', cacheFolder.getId());
      created.cacheFolder = cacheFolder.getId();
      Logger.log('✅ Created cache folder: ' + cacheFolder.getId());
    } catch (e) {
      Logger.log('❌ Failed to create cache folder: ' + e.toString());
      
      // Try using root folder as fallback
      props.setProperty('DRIVE_CACHE_FOLDER_ID', DriveApp.getRootFolder().getId());
      created.cacheFolder = 'root';
      Logger.log('⚠️ Using root folder as cache location');
    }
    
    try {
      // Force create tracking sheet
      Logger.log('📊 Creating new tracking sheet...');
      var sheet = SpreadsheetApp.create('Boxer_Analytics_' + new Date().getTime());
      
      // Set up sheets
      var errorSheet = sheet.getActiveSheet();
      errorSheet.setName('Error_Log');
      errorSheet.getRange(1, 1, 1, 6).setValues([[
        'Timestamp', 'Function', 'Error Message', 'Context', 'Stack Trace', 'Build Number'
      ]]);
      
      var statsSheet = sheet.insertSheet('Processing_Stats');
      statsSheet.getRange(1, 1, 1, 8).setValues([[
        'Timestamp', 'Run Type', 'Files Found', 'Files Processed', 'Files Skipped', 
        'Errors', 'Duration (sec)', 'Build Number'
      ]]);
      
      props.setProperty('TRACKING_SHEET_ID', sheet.getId());
      created.trackingSheet = sheet.getId();
      Logger.log('✅ Created tracking sheet: ' + sheet.getId());
      Logger.log('   URL: ' + sheet.getUrl());
      
    } catch (e) {
      Logger.log('❌ Failed to create tracking sheet: ' + e.toString());
    }
    
    return created;
  };
  
  /**
   * Diagnose configuration issues
   */
  ns.diagnoseConfiguration = function() {
    Logger.log('🔍 === Configuration Diagnosis ===');
    
    var props = PropertiesService.getScriptProperties().getProperties();
    var issues = [];
    
    // Check each property
    Object.keys(props).forEach(function(key) {
      var value = props[key];
      
      if (key === 'DRIVE_CACHE_FOLDER_ID') {
        try {
          var folder = DriveApp.getFolderById(value);
          Logger.log('✅ ' + key + ': Valid (' + folder.getName() + ')');
        } catch (e) {
          issues.push(key);
          Logger.log('❌ ' + key + ': Invalid - ' + e.toString());
        }
      } else if (key === 'TRACKING_SHEET_ID') {
        try {
          var sheet = SpreadsheetApp.openById(value);
          Logger.log('✅ ' + key + ': Valid (' + sheet.getName() + ')');
        } catch (e) {
          issues.push(key);
          Logger.log('❌ ' + key + ': Invalid - ' + e.toString());
        }
      } else if (key.includes('FOLDER_ID') && value && value !== '0') {
        // Check other folder IDs
        try {
          var testFolder = DriveApp.getFolderById(value);
          Logger.log('✅ ' + key + ': Valid');
        } catch (e) {
          Logger.log('⚠️ ' + key + ': May be invalid (could be a Box ID)');
        }
      }
    });
    
    if (issues.length > 0) {
      Logger.log('\n🔧 Found ' + issues.length + ' issue(s)');
      Logger.log('💡 Run repairConfiguration() to fix');
    } else {
      Logger.log('\n✅ No configuration issues found');
    }
    
    return issues;
  };
  
  return ns;
})();

/**
 * Main repair function - diagnose and fix configuration issues
 */
function repairConfiguration() {
  Logger.log('🛠️ === Boxer Configuration Repair ===\n');
  
  // Step 1: Diagnose issues
  var issues = ConfigRepair.diagnoseConfiguration();
  
  if (issues.length === 0) {
    Logger.log('No issues found - configuration is healthy');
    return;
  }
  
  // Step 2: Clear invalid properties
  Logger.log('\nClearing invalid properties...');
  ConfigRepair.clearInvalidProperties();
  
  // Step 3: Run setup to create new resources
  Logger.log('\nRunning setup wizard...');
  setupBoxer();
  
  Logger.log('\n✅ Configuration repair complete');
}

/**
 * Nuclear option - force recreate all resources
 */
function forceRecreateResources() {
  Logger.log('⚠️ === Force Recreating All Resources ===');
  Logger.log('This will create new folders/sheets even if current ones exist\n');
  
  var created = ConfigRepair.forceCreateResources();
  
  Logger.log('\n✅ Resources created:');
  Object.keys(created).forEach(function(key) {
    Logger.log('  ' + key + ': ' + created[key]);
  });
  
  Logger.log('\n💡 Your old resources are still in Drive if you need them');
}

/**
 * Quick diagnostic function
 */
function checkConfigHealth() {
  ConfigRepair.diagnoseConfiguration();
}

/**
 * Emergency fix when Google services are acting up
 */
function emergencyConfigFix() {
  Logger.log('🚨 === Emergency Configuration Fix ===');
  Logger.log('Using minimal configuration to get Boxer running\n');
  
  var props = PropertiesService.getScriptProperties();
  
  // Clear problematic properties
  props.deleteProperty('DRIVE_CACHE_FOLDER_ID');
  props.deleteProperty('TRACKING_SHEET_ID');
  
  // Set to use root folder (always accessible)
  props.setProperty('DRIVE_CACHE_FOLDER_ID', DriveApp.getRootFolder().getId());
  Logger.log('✅ Set cache to root folder');
  
  // Disable error tracking temporarily
  props.setProperty('TRACKING_SHEET_ID', '');
  Logger.log('✅ Disabled error tracking temporarily');
  
  Logger.log('\n⚠️ Boxer will run with minimal configuration');
  Logger.log('💡 Run setupBoxer() later to properly configure resources');
}

// 1. First, diagnose the issue
function diagnoseBoxerIssues() {
  checkConfigHealth();  // This will show you what's invalid
}

// 2. Then repair the configuration
function fixBoxerNow() {
  repairConfiguration();  // This will clear invalid IDs and recreate resources
}

// 3. If that doesn't work, use the emergency fix
function emergencyFix() {
  emergencyConfigFix();  // This will use minimal config to get you running
}