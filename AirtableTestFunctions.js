// File: AirtableTestFunctions.js
// Testing and integration helper functions for Airtable archival
// Use these functions to test and validate your setup

/**
 * Complete setup validation function
 * Run this first to verify everything is configured correctly
 */
function validateAirtableSetup() {
  Logger.log('🧪 === Airtable Setup Validation ===');
  Logger.log('⏰ Validation started: ' + new Date().toISOString());
  
  var issues = [];
  var warnings = [];
  
  try {
    // Test 1: Check Airtable API key
    Logger.log('\n1️⃣ Testing Airtable API key...');
    var apiKey = Config.getAirtableApiKey();
    if (!apiKey) {
      issues.push('❌ No Airtable API key found. Run: setupAirtableApiKey("your_key_here")');
    } else {
      Logger.log('✅ Airtable API key is configured');
    }
    
    // Test 2: Check Box authentication
    Logger.log('\n2️⃣ Testing Box authentication...');
    var boxToken = getValidAccessToken();
    if (!boxToken) {
      issues.push('❌ No valid Box access token. Check your Box authentication setup.');
    } else {
      Logger.log('✅ Box authentication is working');
    }
    
    // Test 3: Validate configuration
    Logger.log('\n3️⃣ Validating Airtable configuration...');
    var config = Config.AIRTABLE_DEFAULT_CONFIG;
    if (!Config.validateAirtableConfig(config)) {
      issues.push('❌ Invalid Airtable configuration. Check Config.AIRTABLE_DEFAULT_CONFIG');
    } else {
      Logger.log('✅ Airtable configuration is valid');
      Logger.log('   📋 Base ID: ' + config.baseId);
      Logger.log('   📊 Table: ' + config.tableName);
      Logger.log('   👁️ View: ' + config.viewName);
      Logger.log('   📎 Attachment Field: ' + config.attachmentFieldName);
      Logger.log('   🔗 Link Field: ' + config.linkFieldName);
    }
    
    // Test 4: Check Box root folder
    Logger.log('\n4️⃣ Testing Box root folder...');
    var rootFolderId = Config.AIRTABLE_ROOT_FOLDER_ID;
    if (!rootFolderId || rootFolderId === 'YOUR_BOX_FOLDER_ID_HERE') {
      warnings.push('⚠️ Box root folder ID not configured. Update Config.AIRTABLE_ROOT_FOLDER_ID');
    } else {
      Logger.log('✅ Box root folder ID is configured: ' + rootFolderId);
    }
    
    // Test 5: Test Airtable API connection (if we have the key)
    if (apiKey && Config.validateAirtableConfig(config)) {
      Logger.log('\n5️⃣ Testing Airtable API connection...');
      try {
        var testRecords = AirtableArchivalManager.fetchRecordsFromView(config, apiKey);
        Logger.log('✅ Successfully connected to Airtable');
        Logger.log('   📋 Found ' + testRecords.length + ' records in "' + config.viewName + '" view');
        
        if (testRecords.length === 0) {
          Logger.log('   💡 No records need archiving (this is normal if already processed)');
        } else {
          Logger.log('   🎯 Ready to process ' + testRecords.length + ' records');
        }
      } catch (error) {
        issues.push('❌ Failed to connect to Airtable: ' + error.toString());
      }
    }
    
    // Test 6: Test Box folder creation (if we have Box auth)
    if (boxToken && rootFolderId && rootFolderId !== 'YOUR_BOX_FOLDER_ID_HERE') {
      Logger.log('\n6️⃣ Testing Box folder structure...');
      try {
        var testFolderId = AirtableArchivalManager.ensureBoxFolderStructure(config, boxToken);
        if (testFolderId) {
          Logger.log('✅ Box folder structure verified');
          Logger.log('   📁 Target folder ID: ' + testFolderId);
        } else {
          issues.push('❌ Failed to create/verify Box folder structure');
        }
      } catch (error) {
        issues.push('❌ Box folder test failed: ' + error.toString());
      }
    }
    
    // Summary
    Logger.log('\n📊 === Validation Summary ===');
    
    if (issues.length === 0) {
      Logger.log('🎉 Setup validation PASSED!');
      Logger.log('✅ Your Airtable archival system is ready to use');
      
      if (warnings.length > 0) {
        Logger.log('\n⚠️ Warnings to address:');
        warnings.forEach(function(warning) {
          Logger.log('   ' + warning);
        });
      }
      
      Logger.log('\n🚀 Next steps:');
      Logger.log('   1. Run testAirtableArchivalSafely() to test with 1 record');
      Logger.log('   2. Set up automatic trigger with createAirtableArchivalTrigger()');
      
    } else {
      Logger.log('❌ Setup validation FAILED');
      Logger.log('\n🔧 Issues to fix:');
      issues.forEach(function(issue) {
        Logger.log('   ' + issue);
      });
      
      if (warnings.length > 0) {
        Logger.log('\n⚠️ Additional warnings:');
        warnings.forEach(function(warning) {
          Logger.log('   ' + warning);
        });
      }
    }
    
    return {
      success: issues.length === 0,
      issues: issues,
      warnings: warnings
    };
    
  } catch (error) {
    Logger.log('💥 Validation crashed: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Safe test function - processes only 1 record for testing
 */
function testAirtableArchivalSafely() {
  Logger.log('🧪 === Safe Airtable Archival Test ===');
  Logger.log('ℹ️ This will process maximum 1 record for testing');
  
  try {
    // Override batch size for safety
    var originalBatchSize = Config.AIRTABLE_BATCH_SIZE;
    Config.AIRTABLE_BATCH_SIZE = 1;
    
    var result = AirtableArchivalManager.runAirtableArchival();
    
    // Restore original batch size
    Config.AIRTABLE_BATCH_SIZE = originalBatchSize;
    
    Logger.log('\n📊 Test Results:');
    Logger.log('   Records Found: ' + result.recordsFound);
    Logger.log('   Records Processed: ' + result.recordsProcessed);
    Logger.log('   Files Uploaded: ' + result.filesUploaded);
    Logger.log('   Errors: ' + result.recordsErrored);
    
    if (result.recordsProcessed > 0) {
      Logger.log('🎉 Test SUCCESSFUL! Your system is working correctly.');
      Logger.log('💡 You can now run the full archival with runAirtableArchival()');
    } else if (result.recordsFound === 0) {
      Logger.log('ℹ️ No records found in queue - this is normal if everything is already archived');
    } else {
      Logger.log('⚠️ Records found but none processed - check the logs for issues');
    }
    
    return result;
    
  } catch (error) {
    Logger.log('💥 Test failed: ' + error.toString());
    return { error: error.toString() };
  }
}

/**
 * Create time-driven trigger for automatic archival
 */
function createAirtableArchivalTrigger() {
  Logger.log('⏰ Creating automatic trigger for Airtable archival...');
  
  try {
    // Delete existing triggers for this function to avoid duplicates
    var existingTriggers = ScriptApp.getProjectTriggers();
    existingTriggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'runAirtableArchival') {
        ScriptApp.deleteTrigger(trigger);
        Logger.log('🗑️ Deleted existing trigger');
      }
    });
    
    // Create new trigger - runs every 2 hours
    var trigger = ScriptApp.newTrigger('runAirtableArchival')
      .timeBased()
      .everyHours(2)
      .create();
    
    Logger.log('✅ Created new trigger: runs every 2 hours');
    Logger.log('🔄 Trigger ID: ' + trigger.getUniqueId());
    Logger.log('⏰ Next execution: ' + new Date(Date.now() + 2 * 60 * 60 * 1000).toLocaleString());
    
    return trigger;
    
  } catch (error) {
    Logger.log('❌ Failed to create trigger: ' + error.toString());
    return null;
  }
}

/**
 * Integrated Boxer processing - combines Box and Airtable processing
 */
function runIntegratedBoxerProcessing() {
  Logger.log('🐕 === Integrated Boxer Processing Started ===');
  Logger.log('⏰ Start time: ' + new Date().toISOString());
  
  var results = {
    box: null,
    airtable: null,
    startTime: new Date().toISOString(),
    totalExecutionTime: 0
  };
  
  var startTime = Date.now();
  
  try {
    // Phase 1: Box Image Processing
    Logger.log('\n📦 === Phase 1: Box Image Processing ===');
    results.box = runBoxReportProcessing();
    
    if (results.box) {
      Logger.log('✅ Box processing completed');
      Logger.log('   Files in report: ' + (results.box.filesInReport || 0));
      Logger.log('   Files processed: ' + (results.box.filesProcessed || 0));
    } else {
      Logger.log('⚠️ Box processing returned no results');
    }
    
    // Brief pause between phases
    Utilities.sleep(2000);
    
    // Phase 2: Airtable Archival
    Logger.log('\n📋 === Phase 2: Airtable Archival ===');
    results.airtable = AirtableArchivalManager.runAirtableArchival();
    
    if (results.airtable) {
      Logger.log('✅ Airtable archival completed');
      Logger.log('   Records found: ' + (results.airtable.recordsFound || 0));
      Logger.log('   Records processed: ' + (results.airtable.recordsProcessed || 0));
      Logger.log('   Files uploaded: ' + (results.airtable.filesUploaded || 0));
    } else {
      Logger.log('⚠️ Airtable archival returned no results');
    }
    
    results.totalExecutionTime = Date.now() - startTime;
    
    Logger.log('\n📊 === Integrated Processing Summary ===');
    Logger.log('📦 Box: ' + (results.box ? 'SUCCESS' : 'NO RESULTS'));
    Logger.log('📋 Airtable: ' + (results.airtable ? 'SUCCESS' : 'NO RESULTS'));
    Logger.log('⏱️ Total execution time: ' + (results.totalExecutionTime / 1000).toFixed(1) + 's');
    
    return results;
    
  } catch (error) {
    results.totalExecutionTime = Date.now() - startTime;
    results.error = error.toString();
    Logger.log('💥 Integrated processing failed: ' + error.toString());
    return results;
  }
}

/**
 * Show comprehensive status of both Box and Airtable systems
 */
function showBoxerComprehensiveStatus() {
  Logger.log('📊 === Comprehensive Boxer Status ===');
  Logger.log('⏰ Status check: ' + new Date().toISOString());
  
  try {
    // Box processing status
    Logger.log('\n📦 === Box Processing Status ===');
    showBoxerStats();
    
    // Airtable archival status
    Logger.log('\n📋 === Airtable Archival Status ===');
    showAirtableStats();
    
    // Current queue status
    Logger.log('\n🔍 === Current Queue Status ===');
    
    var config = Config.AIRTABLE_DEFAULT_CONFIG;
    var apiKey = Config.getAirtableApiKey();
    
    if (apiKey && Config.validateAirtableConfig(config)) {
      try {
        var queueRecords = AirtableArchivalManager.fetchRecordsFromView(config, apiKey);
        Logger.log('📋 Records in archival queue: ' + queueRecords.length);
        
        if (queueRecords.length > 0) {
          var estimatedTime = Math.ceil(queueRecords.length / Config.AIRTABLE_BATCH_SIZE) * 2; // hours
          Logger.log('⏱️ Estimated time to clear queue: ' + estimatedTime + ' hours');
        } else {
          Logger.log('✅ Archival queue is empty - all caught up!');
        }
      } catch (error) {
        Logger.log('❌ Could not check queue status: ' + error.toString());
      }
    } else {
      Logger.log('⚠️ Airtable not configured or API key missing');
    }
    
    // Trigger status
    Logger.log('\n⏰ === Trigger Status ===');
    var triggers = ScriptApp.getProjectTriggers();
    var airtableTriggers = triggers.filter(function(t) {
      return t.getHandlerFunction() === 'runAirtableArchival' || 
             t.getHandlerFunction() === 'runIntegratedBoxerProcessing';
    });
    
    if (airtableTriggers.length > 0) {
      Logger.log('✅ Found ' + airtableTriggers.length + ' active trigger(s)');
      airtableTriggers.forEach(function(trigger) {
        Logger.log('   📅 ' + trigger.getHandlerFunction() + ' - ' + trigger.getEventType());
      });
    } else {
      Logger.log('⚠️ No automatic triggers found for Airtable processing');
      Logger.log('💡 Run createAirtableArchivalTrigger() to set up automation');
    }
    
  } catch (error) {
    Logger.log('💥 Status check failed: ' + error.toString());
  }
}

/**
 * Emergency stop function - deletes all Airtable triggers
 */
function stopAirtableArchival() {
  Logger.log('🛑 === Emergency Stop: Airtable Archival ===');
  
  try {
    var triggers = ScriptApp.getProjectTriggers();
    var deletedCount = 0;
    
    triggers.forEach(function(trigger) {
      if (trigger.getHandlerFunction() === 'runAirtableArchival' || 
          trigger.getHandlerFunction() === 'runIntegratedBoxerProcessing') {
        ScriptApp.deleteTrigger(trigger);
        deletedCount++;
        Logger.log('🗑️ Deleted trigger: ' + trigger.getHandlerFunction());
      }
    });
    
    if (deletedCount > 0) {
      Logger.log('✅ Stopped ' + deletedCount + ' trigger(s)');
      Logger.log('ℹ️ Airtable archival will no longer run automatically');
      Logger.log('💡 You can still run it manually with runAirtableArchival()');
    } else {
      Logger.log('ℹ️ No active Airtable triggers found');
    }
    
    return deletedCount;
    
  } catch (error) {
    Logger.log('❌ Failed to stop triggers: ' + error.toString());
    return 0;
  }
}

/**
 * Quick configuration helper
 */
function quickAirtableSetup(baseId, tableName, attachmentField, linkField) {
  Logger.log('⚡ === Quick Airtable Setup ===');
  
  if (!baseId || !tableName || !attachmentField || !linkField) {
    Logger.log('❌ Missing required parameters');
    Logger.log('💡 Usage: quickAirtableSetup("appXXXXXX", "Table Name", "Images", "Box_Links")');
    return false;
  }
  
  try {
    // Update the configuration
    Config.AIRTABLE_DEFAULT_CONFIG.baseId = baseId;
    Config.AIRTABLE_DEFAULT_CONFIG.tableName = tableName;
    Config.AIRTABLE_DEFAULT_CONFIG.attachmentFieldName = attachmentField;
    Config.AIRTABLE_DEFAULT_CONFIG.linkFieldName = linkField;
    
    Logger.log('✅ Configuration updated:');
    Logger.log('   📋 Base ID: ' + baseId);
    Logger.log('   📊 Table: ' + tableName);
    Logger.log('   📎 Attachment Field: ' + attachmentField);
    Logger.log('   🔗 Link Field: ' + linkField);
    
    Logger.log('\n🔄 Next steps:');
    Logger.log('   1. Set your API key: setupAirtableApiKey("your_key")');
    Logger.log('   2. Set Box folder: Config.AIRTABLE_ROOT_FOLDER_ID = "folder_id"');
    Logger.log('   3. Run validation: validateAirtableSetup()');
    
    return true;
    
  } catch (error) {
    Logger.log('❌ Setup failed: ' + error.toString());
    return false;
  }
}

/**
 * Development helper - shows detailed configuration
 */
function showDetailedConfig() {
  Logger.log('🔧 === Detailed Configuration ===');
  
  Logger.log('\n📋 Airtable Configuration:');
  var config = Config.AIRTABLE_DEFAULT_CONFIG;
  Object.keys(config).forEach(function(key) {
    Logger.log('   ' + key + ': ' + config[key]);
  });
  
  Logger.log('\n🔑 API Keys:');
  Logger.log('   Airtable API Key: ' + (Config.getAirtableApiKey() ? 'CONFIGURED' : 'NOT SET'));
  Logger.log('   Box Access Token: ' + (getValidAccessToken() ? 'VALID' : 'INVALID'));
  
  Logger.log('\n📁 Box Configuration:');
  Logger.log('   Root Folder ID: ' + Config.AIRTABLE_ROOT_FOLDER_ID);
  
  Logger.log('\n⚙️ Processing Settings:');
  Logger.log('   Batch Size: ' + Config.AIRTABLE_BATCH_SIZE);
  Logger.log('   Max Execution Time: ' + (Config.AIRTABLE_MAX_EXECUTION_TIME_MS / 1000 / 60).toFixed(1) + ' minutes');
  Logger.log('   Max File Size: ' + (Config.AIRTABLE_MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0) + ' MB');
}