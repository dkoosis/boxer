// File: Main.js
// Central orchestrator for the Boxer system
// All scheduled triggers should point to the functions in this file

/**
 * Ensures configuration is migrated and valid before any processing
 * @returns {boolean} True if system is ready
 */
function ensureSystemReady_() {
  // Check if migration is needed (presence of old properties)
  const oldProps = ['TRACKING_SHEET_ID', 'BOX_OAUTH_CLIENT_ID', 'VISION_API_KEY'];
  const needsMigration = oldProps.some(prop => 
    Config.SCRIPT_PROPERTIES.getProperty(prop) !== null
  );
  
  if (needsMigration) {
    Logger.log('🔄 Migrating configuration to new format...');
    const migrationResults = Config.migrate();
    Logger.log('✅ Migration complete: ' + migrationResults.migrated.length + ' properties migrated');
  }
  
  // Validate configuration
  const validation = Config.validate(true); // Auto-fix where possible
  
  if (!validation.valid) {
    Logger.log('❌ Configuration validation failed:');
    validation.errors.forEach(e => Logger.log('  ' + e));
    return false;
  }
  
  if (validation.fixed.length > 0) {
    Logger.log('🔧 Auto-fixed configuration issues:');
    validation.fixed.forEach(f => Logger.log('  ' + f));
  }
  
  return true;
}

/**
 * System health check
 * @returns {boolean} True if services are healthy
 */
function checkSystemHealth_() {
  try {
    // Test Script Properties
    Config.SCRIPT_PROPERTIES.getProperty('_health_check');
    
    // Test UrlFetch
    const response = UrlFetchApp.fetch('https://httpbin.org/status/200', {
      muteHttpExceptions: true,
      timeout: 10
    });
    
    return response.getResponseCode() === 200;
  } catch (error) {
    Logger.log('❌ Health check failed: ' + error.toString());
    return false;
  }
}

/**
 * ENTRY POINT 1: Process Box images with metadata
 * Recommended Trigger: Every 2-4 hours
 */
function add_metadata_to_images() {
  try {
    Logger.log('🐕 === BOXER: Starting Image Metadata Processing ===');
    Logger.log('⏰ ' + new Date().toISOString());
    
    // Ensure system is ready
    if (!ensureSystemReady_()) {
      Logger.log('❌ System not ready - check configuration');
      return { success: false, error: 'Configuration invalid' };
    }
    
    // Health check
    if (!checkSystemHealth_()) {
      Logger.log('❌ System health check failed');
      return { success: false, error: 'Health check failed' };
    }
    
    // Load checkpoint from cache
    const checkpoint = Config.getState('REPORT_CHECKPOINT') || {};
    
    // Run report-based processing
    const result = BoxReportManager.runReportBasedProcessing();
    
    // Save checkpoint
    if (result) {
      Config.setState('REPORT_CHECKPOINT', result.checkpoint);
    }
    
    Logger.log('✅ Processing complete');
    return result;
    
  } catch (error) {
    Logger.log('❌ Processing failed: ' + error.toString());
    if (typeof ErrorHandler !== 'undefined') {
      ErrorHandler.reportError(error, 'add_metadata_to_images');
    }
    return { success: false, error: error.toString() };
  }
}

/**
 * ENTRY POINT 2: Archive Airtable attachments
 * Recommended Trigger: Every 2-4 hours
 */
function archive_airtable_attachments() {
  try {
    Logger.log('📋 === BOXER: Starting Airtable Archival ===');
    
    if (!ensureSystemReady_()) {
      return { success: false, error: 'Configuration invalid' };
    }
    
    if (!checkSystemHealth_()) {
      return { success: false, error: 'Health check failed' };
    }
    
    // Check if Airtable is configured
    if (!Config.getProperty('AIRTABLE_API_KEY')) {
      Logger.log('⚠️ Airtable not configured - skipping');
      return { success: true, skipped: true };
    }
    
    const result = AirtableArchiver.archiveTable(Config.getProperty('AIRTABLE_DEFAULT_CONFIG'));
    
    // Store stats in tracking sheet
    if (result && Config.BOXER_TRACKING_SHEET_ID) {
      try {
        const sheet = SpreadsheetApp.openById(Config.BOXER_TRACKING_SHEET_ID)
          .getSheetByName(Config.PROCESSING_STATS_SHEET_NAME);
        
        sheet.appendRow([
          new Date().toISOString(),
          'Airtable Archival',
          result.recordsFound || 0,
          result.recordsProcessed || 0,
          result.recordsSkipped || 0,
          result.recordsErrored || 0,
          (result.executionTimeMs || 0) / 1000,
          Config.BUILD_NUMBER
        ]);
      } catch (e) {
        Logger.log('Could not log stats: ' + e.toString());
      }
    }
    
    return result;
    
  } catch (error) {
    Logger.log('❌ Airtable archival failed: ' + error.toString());
    if (typeof ErrorHandler !== 'undefined') {
      ErrorHandler.reportError(error, 'archive_airtable_attachments');
    }
    return { success: false, error: error.toString() };
  }
}

/**
 * ENTRY POINT 3: Detect legal documents
 * Recommended Trigger: Daily
 */
function add_metadata_to_legal_docs() {
  try {
    Logger.log('⚖️ === BOXER: Starting Legal Document Detection ===');
    
    if (!ensureSystemReady_()) {
      return { success: false, error: 'Configuration invalid' };
    }
    
    if (!checkSystemHealth_()) {
      return { success: false, error: 'Health check failed' };
    }
    
    const token = getValidAccessToken();
    const folderId = Config.BOX_PRIORITY_FOLDER_ID || '0';
    
    const result = LegalDocumentDetector.processLegalDocumentsInFolder(folderId, token);
    
    return result || { success: true };
    
  } catch (error) {
    Logger.log('❌ Legal detection failed: ' + error.toString());
    if (typeof ErrorHandler !== 'undefined') {
      ErrorHandler.reportError(error, 'add_metadata_to_legal_docs');
    }
    return { success: false, error: error.toString() };
  }
}

// === Setup and maintenance functions ===

/**
 * Main setup wizard
 */
function setupBoxer() {
  Logger.log('🐕 === Boxer Setup Wizard ===\n');
  
  // Run migration if needed
  const migrationResults = Config.migrate();
  if (migrationResults.migrated.length > 0) {
    Logger.log('✅ Migrated ' + migrationResults.migrated.length + ' old properties');
  }
  
  // Validate and auto-create resources
  const validation = Config.validate(true);
  
  if (validation.fixed.length > 0) {
    Logger.log('✅ Auto-created resources:');
    validation.fixed.forEach(f => Logger.log('  ' + f));
  }
  
  // Show status
  const status = Config.getStatus();
  
  Logger.log('\n📊 Configuration Status:');
  Logger.log('Required properties: ' + status.overall.valid + '/' + status.overall.required);
  
  // Show what's still needed
  const missing = [];
  Object.keys(status.categories).forEach(cat => {
    status.categories[cat].properties.forEach(prop => {
      if (prop.required && !prop.isValid) {
        missing.push(prop.key);
      }
    });
  });
  
  if (missing.length > 0) {
    Logger.log('\n❌ Still need to configure:');
    missing.forEach(key => {
      if (key === 'BOX_CLIENT_ID' || key === 'BOX_CLIENT_SECRET') {
        Logger.log('  ' + key + ' - Get from https://app.box.com/developers/console');
      } else if (key === 'BOX_REPORTS_FOLDER') {
        Logger.log('  ' + key + ' - Find in Box.com URL when viewing reports folder');
      } else {
        Logger.log('  ' + key);
      }
    });
    
    Logger.log('\n💡 Quick setup:');
    Logger.log('  setBoxCredentials("CLIENT_ID", "CLIENT_SECRET")');
    Logger.log('  setBoxReportsFolder("FOLDER_ID")');
  } else {
    Logger.log('\n✅ All required properties configured!');
    Logger.log('\n📝 Next steps:');
    Logger.log('1. Run initializeBoxAuth() to connect to Box');
    Logger.log('2. Set up time-based triggers for add_metadata_to_images()');
  }
}

/**
 * Set Box credentials
 */
function setBoxCredentials(clientId, clientSecret) {
  if (!clientId || !clientSecret) {
    Logger.log('❌ Both client ID and secret required');
    return;
  }
  
  Config.setProperty('BOX_CLIENT_ID', clientId);
  Config.setProperty('BOX_CLIENT_SECRET', clientSecret);
  Logger.log('✅ Box credentials saved');
}

/**
 * Set Box reports folder
 */
function setBoxReportsFolder(folderId) {
  if (!folderId) {
    Logger.log('❌ Folder ID required');
    return;
  }
  
  Config.setProperty('BOX_REPORTS_FOLDER', folderId);
  Logger.log('✅ Box reports folder saved');
}

/**
 * Test basic functionality
 */
function test_boxer_basic() {
  Logger.log('🧪 === Basic Boxer Test ===');
  
  const ready = ensureSystemReady_();
  Logger.log('System ready: ' + (ready ? '✅' : '❌'));
  
  const healthy = checkSystemHealth_();
  Logger.log('Health check: ' + (healthy ? '✅' : '❌'));
  
  try {
    const token = getValidAccessToken();
    Logger.log('Box auth: ' + (token ? '✅' : '❌'));
  } catch (e) {
    Logger.log('Box auth: ❌ (' + e.toString() + ')');
  }
  
  return { ready, healthy };
}