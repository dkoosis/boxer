// File: Main.js
// Central orchestrator for the Boxer system
// All scheduled triggers should point to the functions in this file

/**
 * BoxerApp namespace - all public functions organized here
 */
const BoxerApp = {
  
  // === MAIN ENTRY POINTS (for triggers) ===
  
  /**
   * Process Box images with metadata (for time-based trigger)
   * Recommended Trigger: Every 2-4 hours
   */
  processImages() {
    try {
      Logger.log('🐕 === BOXER: Starting Image Metadata Processing ===');
      Logger.log(`⏰ ${new Date().toISOString()}`);
      
      if (!ensureSystemReady_()) {
        Logger.log('❌ System not ready - check configuration');
        return { success: false, error: 'Configuration invalid' };
      }
      
      if (!checkSystemHealth_()) {
        Logger.log('❌ System health check failed');
        return { success: false, error: 'Health check failed' };
      }
      
      const checkpoint = ConfigManager.getState('REPORT_CHECKPOINT') || {};
      const result = BoxReportManager.runReportBasedProcessing();
      
      if (result) {
        ConfigManager.setState('REPORT_CHECKPOINT', result.checkpoint);
      }
      
      Logger.log('✅ Processing complete');
      return result;
      
    } catch (error) {
      Logger.log(`❌ Processing failed: ${error.toString()}`);
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.reportError(error, 'BoxerApp.processImages');
      }
      return { success: false, error: error.toString() };
    }
  },
  
  /**
   * Archive Airtable attachments (for time-based trigger)
   * Recommended Trigger: Every 2-4 hours
   */
  archiveAirtable() {
    try {
      Logger.log('📋 === BOXER: Starting Airtable Archival ===');
      
      if (!ensureSystemReady_()) {
        return { success: false, error: 'Configuration invalid' };
      }
      
      if (!checkSystemHealth_()) {
        return { success: false, error: 'Health check failed' };
      }
      
      const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
      if (!apiKey) {
        Logger.log('⚠️ Airtable not configured - skipping');
        return { success: true, skipped: true };
      }
      
      const config = {
        baseId: ConfigManager.getProperty('AIRTABLE_BASE_ID'),
        tableName: ConfigManager.getProperty('AIRTABLE_TABLE_NAME'),
        attachmentFieldName: ConfigManager.getProperty('AIRTABLE_ATTACHMENT_FIELD'),
        linkFieldName: ConfigManager.getProperty('AIRTABLE_LINK_FIELD'),
        maxRecords: 5
      };
      
      const boxToken = getValidAccessToken();
      return AirtableManager.archiveTable(config, apiKey, boxToken);
      
    } catch (error) {
      Logger.log(`❌ Airtable archival failed: ${error.toString()}`);
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.reportError(error, 'BoxerApp.archiveAirtable');
      }
      return { success: false, error: error.toString() };
    }
  },
  
  /**
   * Detect legal documents (for time-based trigger)
   * Recommended Trigger: Daily
   */
  processLegalDocs() {
    try {
      Logger.log('⚖️ === BOXER: Starting Legal Document Detection ===');
      
      if (!ensureSystemReady_()) {
        return { success: false, error: 'Configuration invalid' };
      }
      
      if (!checkSystemHealth_()) {
        return { success: false, error: 'Health check failed' };
      }
      
      const token = getValidAccessToken();
      const folderId = ConfigManager.BOX_PRIORITY_FOLDER_ID || '0';
      
      const result = LegalDocumentDetector.processLegalDocumentsInFolder(folderId, token);
      
      return result || { success: true };
      
    } catch (error) {
      Logger.log(`❌ Legal detection failed: ${error.toString()}`);
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.reportError(error, 'BoxerApp.processLegalDocs');
      }
      return { success: false, error: error.toString() };
    }
  },
  
  // === SETUP AND CONFIGURATION ===
  
  /**
   * Main setup wizard
   */
  setup() {
    Logger.log('🐕 === Boxer Setup Wizard ===\n');
    
    const migrationResults = ConfigManager.migrate();
    if (migrationResults.migrated.length > 0) {
      Logger.log(`✅ Migrated ${migrationResults.migrated.length} old properties`);
    }
    
    const validation = ConfigManager.validate(true);
    
    if (validation.fixed.length > 0) {
      Logger.log('✅ Auto-created resources:');
      validation.fixed.forEach(f => Logger.log(`  ${f}`));
    }
    
    const status = ConfigManager.getStatus();
    
    Logger.log('\n📊 Configuration Status:');
    Logger.log(`Required properties: ${status.overall.valid}/${status.overall.required}`);
    
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
          Logger.log(`  ${key} - Get from https://app.box.com/developers/console`);
        } else if (key === 'BOX_REPORTS_FOLDER') {
          Logger.log(`  ${key} - Find in Box.com URL when viewing reports folder`);
        } else {
          Logger.log(`  ${key}`);
        }
      });
      
      Logger.log('\n💡 Quick setup:');
      Logger.log('  BoxerApp.setBoxCredentials("CLIENT_ID", "CLIENT_SECRET")');
      Logger.log('  BoxerApp.setBoxReportsFolder("FOLDER_ID")');
    } else {
      Logger.log('\n✅ All required properties configured!');
      Logger.log('\n📝 Next steps:');
      Logger.log('1. Run BoxerApp.initializeBoxAuth() to connect to Box');
      Logger.log('2. Set up time-based triggers for BoxerApp.processImages()');
    }
  },
  
  /**
   * Set Box credentials
   */
  setBoxCredentials(clientId, clientSecret) {
    if (!clientId || !clientSecret) {
      Logger.log('❌ Both client ID and secret required');
      return;
    }
    
    ConfigManager.setProperty('BOX_CLIENT_ID', clientId);
    ConfigManager.setProperty('BOX_CLIENT_SECRET', clientSecret);
    Logger.log('✅ Box credentials saved');
  },
  
  /**
   * Set Box reports folder
   */
  setBoxReportsFolder(folderId) {
    if (!folderId) {
      Logger.log('❌ Folder ID required');
      return;
    }
    
    ConfigManager.setProperty('BOX_REPORTS_FOLDER', folderId);
    Logger.log('✅ Box reports folder saved');
  },
  
  /**
   * Set Airtable API key
   */
  setAirtableApiKey(apiKey) {
    if (!apiKey) {
      Logger.log('❌ API key required');
      return;
    }
    
    ConfigManager.setProperty('AIRTABLE_API_KEY', apiKey);
    Logger.log('✅ Airtable API key saved');
  },
  
  /**
   * Initialize Box authentication
   */
  initializeBoxAuth() {
    return initializeBoxAuth();
  },
  
  // === TESTING AND DIAGNOSTICS ===
  
  /**
   * Test basic functionality
   */
  test() {
    Logger.log('🧪 === Basic Boxer Test ===');
    
    const ready = ensureSystemReady_();
    Logger.log(`System ready: ${ready ? '✅' : '❌'}`);
    
    const healthy = checkSystemHealth_();
    Logger.log(`Health check: ${healthy ? '✅' : '❌'}`);
    
    try {
      const token = getValidAccessToken();
      Logger.log(`Box auth: ${token ? '✅' : '❌'}`);
    } catch (e) {
      Logger.log(`Box auth: ❌ (${e.toString()})`);
    }
    
    return { ready, healthy };
  },
  
  /**
   * Run quick diagnostics
   */
  diagnose() {
    return Diagnostics.runQuickTest();
  },
  
  /**
   * Show configuration status
   */
  showStatus() {
    const status = ConfigManager.getStatus();
    
    Logger.log('📊 === Configuration Status ===');
    Logger.log(`Overall: ${status.overall.valid}/${status.overall.required} required properties set`);
    
    Object.keys(status.categories).forEach(cat => {
      const catData = status.categories[cat];
      Logger.log(`\n${cat.toUpperCase()}:`);
      catData.properties.forEach(prop => {
        const icon = prop.isValid ? '✅' : (prop.hasValue ? '⚠️' : '❌');
        const req = prop.required ? ' (required)' : '';
        Logger.log(`  ${icon} ${prop.key}${req}`);
      });
    });
  },
  
  // === VERSION MANAGEMENT ===
  
  /**
   * Show current script version
   */
  showVersion() {
    return VersionManager.showCurrentVersion();
  },
  
  /**
   * Analyze version distribution
   */
  analyzeVersions() {
    const accessToken = getValidAccessToken();
    return VersionManager.analyzeVersionDistribution(accessToken);
  },
  
  /**
   * Process outdated files
   */
  updateOutdatedFiles(maxFiles = 25) {
    const accessToken = getValidAccessToken();
    return VersionManager.processOutdatedFiles(accessToken, maxFiles);
  },
  
  // === REPORT MANAGEMENT ===
  
  /**
   * Show processing statistics
   */
  showStats() {
    BoxReportManager.showProcessingStats();
    Logger.log('\n');
    AirtableManager.showStats();
  },
  
  /**
   * Reset processing checkpoint
   */
  resetCheckpoint() {
    return BoxReportManager.resetProcessingCheckpoint();
  },
  
  // === AIRTABLE MANAGEMENT ===
  
  /**
   * Analyze Airtable workspace
   */
  analyzeAirtable() {
    const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
    return AirtableManager.analyzeWorkspace(apiKey);
  },
  
  /**
   * Archive specific Airtable table
   */
  archiveTable(baseId, tableName, maxRecords = 5) {
    const config = {
      baseId,
      tableName,
      attachmentFieldName: ConfigManager.getProperty('AIRTABLE_ATTACHMENT_FIELD'),
      linkFieldName: ConfigManager.getProperty('AIRTABLE_LINK_FIELD'),
      maxRecords
    };
    const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
    const boxToken = getValidAccessToken();
    return AirtableManager.archiveTable(config, apiKey, boxToken);
  }
};

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Ensures configuration is migrated and valid before any processing
 * @private
 */
function ensureSystemReady_() {
  // Check if migration is needed
  const oldProps = ['TRACKING_SHEET_ID', 'BOX_OAUTH_CLIENT_ID', 'VISION_API_KEY'];
  const needsMigration = oldProps.some(prop => 
    ConfigManager.SCRIPT_PROPERTIES.getProperty(prop) !== null
  );
  
  if (needsMigration) {
    Logger.log('🔄 Migrating configuration to new format...');
    const migrationResults = ConfigManager.migrate();
    Logger.log(`✅ Migration complete: ${migrationResults.migrated.length} properties migrated`);
  }
  
  // Validate configuration
  const validation = ConfigManager.validate(true);
  
  if (!validation.valid) {
    Logger.log('❌ Configuration validation failed:');
    validation.errors.forEach(e => Logger.log(`  ${e}`));
    return false;
  }
  
  if (validation.fixed.length > 0) {
    Logger.log('🔧 Auto-fixed configuration issues:');
    validation.fixed.forEach(f => Logger.log(`  ${f}`));
  }
  
  return true;
}

/**
 * System health check
 * @private
 */
function checkSystemHealth_() {
  try {
    // Test Script Properties
    ConfigManager.SCRIPT_PROPERTIES.getProperty('_health_check');
    
    // Test UrlFetch
    const response = UrlFetchApp.fetch('https://httpbin.org/status/200', {
      muteHttpExceptions: true,
      timeout: 10
    });
    
    return response.getResponseCode() === 200;
  } catch (error) {
    Logger.log(`❌ Health check failed: ${error.toString()}`);
    return false;
  }
}

/**
 * Makes the BoxerApp.test() method executable from the Apps Script IDE.
 */
function runBoxerTest() {
  return BoxerApp.test();
}