// File: Main.js
// Central orchestrator for the Boxer system
// All scheduled triggers should point to the functions in this file

/**
 * BoxerApp namespace - all public functions organized here
 */
const BoxerApp = {
  
  // === MAIN ENTRY POINTS (for triggers) ===
  
  /**
   * Build processing queue from weekly Box report
   * Recommended Trigger: Weekly (e.g., Monday 2 AM)
   */
  buildQueue() {
    return withSystemChecks_('Queue Building', () => {
      return BoxReportManager.buildProcessingQueue();
    });
  },
  
  /**
   * Process Box images with metadata (for time-based trigger)
   * Recommended Trigger: Every 2-4 hours
   */
  processImages() {
    return withSystemChecks_('Image Metadata Processing', () => {
      return BoxReportManager.runReportBasedProcessing();
    });
  },
  
  /**
   * Archive Airtable attachments (for time-based trigger)
   * This runs weekly to archive old attachments and then sends a usage report.
   * Recommended Trigger: Weekly
   */
  archiveAirtable() {
    return withSystemChecks_('Airtable Weekly Archival & Report', () => {
      const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
      if (!apiKey) {
        Logger.log('⚠️ Airtable not configured - skipping');
        return { success: true, skipped: true };
      }
      
      // Get list of bases to archive from configuration
      const basesToArchive = ConfigManager.getProperty('AIRTABLE_BASES_TO_ARCHIVE');
      if (!basesToArchive) {
        Logger.log('⚠️ No bases configured for archival');
        Logger.log('💡 Configure with: BoxerApp.configureAirtableArchival(["Base Name 1", "Base Name 2"])');
        return { success: true, skipped: true };
      }
      
      const baseIds = basesToArchive.split(',').map(id => id.trim());
      const boxToken = getValidAccessToken();
      const results = [];
      
      Logger.log(`📦 Processing ${baseIds.length} configured base(s)`);
      
      // Archive each configured base
      for (let i = 0; i < baseIds.length; i++) {
        const baseId = baseIds[i];
        const config = { baseId };
        Logger.log(`\n🔄 [${i + 1}/${baseIds.length}] Processing base: ${baseId}`);
        
        const result = AirtableManager.archiveBase(config, apiKey, boxToken);
        results.push(result);
        
        // Log space recovered for this base
        if (result.success && result.totalFilesArchived > 0) {
          Logger.log(`\n✅ BASE COMPLETE: ${result.baseName || baseId}`);
          Logger.log(`   📦 Files archived: ${result.totalFilesArchived}`);
          Logger.log(`   💾 Space recovered: ${formatBytes(result.totalBytesArchived)}`);
          Logger.log(`   ⏱️ Time taken: ${(result.executionTimeMs/1000).toFixed(1)}s`);
        } else if (result.success) {
          Logger.log(`\n✅ BASE COMPLETE: ${result.baseName || baseId} - No files needed archiving`);
        } else {
          Logger.log(`\n❌ BASE FAILED: ${result.baseName || baseId} - ${result.error || 'Unknown error'}`);
        }
      }      
      // Summary
      const totalFiles = results.reduce((sum, r) => sum + (r.totalFilesArchived || 0), 0);
      const totalBytes = results.reduce((sum, r) => sum + (r.totalBytesArchived || 0), 0);
      
      Logger.log(`\n📊 Weekly Archival Complete:`);
      Logger.log(`   📚 Bases processed: ${results.length}`);
      Logger.log(`   📦 Total files archived: ${totalFiles}`);
      Logger.log(`   💾 Total space recovered: ${formatBytes(totalBytes)}`);

      if (totalBytes > 0) {
        Logger.log(`\n✨ Freed up ${formatBytes(totalBytes)} in Airtable!`);
      }
      
      // After archival, send the usage report.
      Logger.log('\n📧 Sending Airtable usage report...');
      this.sendAirtableUsageReport();

      return {
        success: true,
        basesProcessed: results.length,
        totalFilesArchived: totalFiles,
        totalBytesArchived: totalBytes,
        results: results
      };
    });
  },

  /**
   * Generates and emails the Airtable usage report.
   * Can be run on a separate trigger.
   */
  sendAirtableUsageReport() {
    return withSystemChecks_('Airtable Usage Report', () => {
      const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
      const recipientEmail = ConfigManager.getProperty('AIRTABLE_REPORT_RECIPIENT');
      
      if (!apiKey || !recipientEmail) {
        Logger.log('⚠️ Airtable API key or recipient email not configured. Skipping report.');
        return { success: false, error: 'Airtable not configured for reporting.' };
      }
      
      return AirtableManager.generateUsageReportAndEmail(apiKey, recipientEmail);
    });
  },
  
  /**
   * Detect legal documents (for time-based trigger)
   * Recommended Trigger: Daily
   */
  processLegalDocs() {
    return withSystemChecks_('Legal Document Detection', () => {
      const token = getValidAccessToken();
      const folderId = ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0';
      const result = LegalDocumentDetector.processLegalDocumentsInFolder(folderId, token);
      return result || { success: true };
    });
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
      Logger.log('2. Set up triggers:');
      Logger.log('   - Weekly: runQueueBuildingTrigger()');
      Logger.log('   - Every 2-4 hours: runImageProcessingTrigger()');
      Logger.log('   - Weekly: runAirtableArchivalTrigger()');
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
   * Configure Airtable bases for weekly archival
   * @param {string|string[]} baseIdsOrNames Base IDs or names to archive weekly
   */
  configureAirtableArchival(baseIdsOrNames) {
    Logger.log('🔧 === Configuring Airtable Archival ===');
    
    const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
    if (!apiKey) {
      Logger.log('❌ Set Airtable API key first with: BoxerApp.setAirtableApiKey("YOUR_KEY")');
      return;
    }
    
    // If passed names, resolve to IDs
    const baseIds = [];
    const names = Array.isArray(baseIdsOrNames) ? baseIdsOrNames : [baseIdsOrNames];
    
    for (const nameOrId of names) {
      if (nameOrId.startsWith('app')) {
        baseIds.push(nameOrId);
        Logger.log(`✅ Added base ID: ${nameOrId}`);
      } else {
        // Look up by name
        const id = findBaseIdByName(nameOrId, apiKey);
        if (id) {
          baseIds.push(id);
          Logger.log(`✅ Found "${nameOrId}" → ${id}`);
        } else {
          Logger.log(`❌ Base "${nameOrId}" not found`);
        }
      }
    }
    
    if (baseIds.length > 0) {
      ConfigManager.setProperty('AIRTABLE_BASES_TO_ARCHIVE', baseIds.join(','));
      Logger.log(`\n✅ Configured ${baseIds.length} bases for weekly archival`);
      Logger.log('These will be processed by the weekly trigger');
      
      // Set default age if not already set
      if (!ConfigManager.getProperty('ARCHIVE_AGE_MONTHS')) {
        ConfigManager.setProperty('ARCHIVE_AGE_MONTHS', '12'); // Default to 1 year
        Logger.log('📅 Set default archive age to 12 months (1 year)');
      }
    }
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
    
    // Show Airtable-specific configuration
    const basesToArchive = ConfigManager.getProperty('AIRTABLE_BASES_TO_ARCHIVE');
    if (basesToArchive) {
      Logger.log('\n📦 AIRTABLE ARCHIVAL:');
      Logger.log(`  Configured bases: ${basesToArchive.split(',').length}`);
      Logger.log(`  Archive age: ${ConfigManager.getProperty('ARCHIVE_AGE_MONTHS') || '6'} months`);
      Logger.log(`  Report Recipient: ${ConfigManager.getProperty('AIRTABLE_REPORT_RECIPIENT')}`);
    }
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
   * Build new processing queue manually
   * (Usually runs automatically weekly)
   */
  rebuildQueue() {
    Logger.log('🔄 Manually rebuilding processing queue...');
    return BoxReportManager.buildProcessingQueue();
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
   * List configured bases for archival
   */
  showAirtableConfig() {
    Logger.log('📦 === Airtable Archival Configuration ===');
    
    const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
    if (!apiKey) {
      Logger.log('❌ Airtable API key not configured');
      return;
    }
    
    const basesToArchive = ConfigManager.getProperty('AIRTABLE_BASES_TO_ARCHIVE');
    if (!basesToArchive) {
      Logger.log('⚠️ No bases configured for archival');
      Logger.log('💡 Configure with: BoxerApp.configureAirtableArchival(["Base Name"])');
      return;
    }
    
    const baseIds = basesToArchive.split(',');
    Logger.log(`\n📋 Configured bases (${baseIds.length}):`);
    
    baseIds.forEach((baseId, i) => {
      const baseName = getBaseName_(baseId, apiKey);
      Logger.log(`${i+1}. ${baseName} (${baseId})`);
    });
    
    Logger.log(`\n📅 Archive age: ${ConfigManager.getProperty('ARCHIVE_AGE_MONTHS') || '6'} months`);
    Logger.log('\n💡 These bases will be processed by the weekly trigger');
  },
  
  /**
   * Manually archive a specific base (for testing or one-off runs)
   */
  archiveSpecificBase(baseNameOrId) {
    const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
    const boxToken = getValidAccessToken();
    
    if (!apiKey || !boxToken) {
      Logger.log('❌ Missing credentials');
      return;
    }
    
    // Resolve name to ID if needed
    let baseId = baseNameOrId;
    if (!baseNameOrId.startsWith('app')) {
      baseId = findBaseIdByName(baseNameOrId, apiKey);
      if (!baseId) {
        Logger.log(`❌ Base "${baseNameOrId}" not found`);
        return;
      }
    }
    
    return AirtableManager.archiveBase({ baseId }, apiKey, boxToken);
  }
};

// === PRIVATE HELPER FUNCTIONS ===

/**
 * Find base ID by name
 * @private
 */
function findBaseIdByName(baseName, apiKey) {
  try {
    const response = UrlFetchApp.fetch('https://api.airtable.com/v0/meta/bases', {
      headers: { 'Authorization': `Bearer ${apiKey}` },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      Logger.log(`❌ Failed to list bases: ${response.getResponseCode()}`);
      return null;
    }
    
    const bases = JSON.parse(response.getContentText()).bases || [];
    const base = bases.find(b => b.name === baseName);
    
    if (!base) {
      Logger.log(`Available bases: ${bases.map(b => b.name).join(', ')}`);
    }
    
    return base ? base.id : null;
  } catch (error) {
    Logger.log(`Error finding base: ${error.toString()}`);
    return null;
  }
}

/**
 * Get base name from ID (helper for display)
 * @private
 */
function getBaseName_(baseId, apiKey) {
  try {
    const response = UrlFetchApp.fetch('https://api.airtable.com/v0/meta/bases', {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });
    
    const bases = JSON.parse(response.getContentText()).bases || [];
    const base = bases.find(b => b.id === baseId);
    return base ? base.name : baseId;
  } catch (error) {
    return baseId;
  }
}

/**
 * Format bytes to human readable
 * @private
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Executes a given processing function within a standard block of system checks and logging.
 * @param {string} functionName The name of the process for logging purposes.
 * @param {function} processingFunction The core function to execute.
 * @returns {object} The result of the processing function or an error object.
 * @private
 */
function withSystemChecks_(functionName, processingFunction) {
  try {
    Logger.log(`🐕 === BOXER: Starting ${functionName} ===`);
    Logger.log(`⏰ ${new Date().toISOString()}`);

    if (!ensureSystemReady_()) {
      const errorMsg = 'System not ready - check configuration';
      Logger.log(`❌ ${errorMsg}`);
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.notifyCriticalError(new Error(errorMsg), `withSystemChecks_ startup`);
      }
      return { success: false, error: errorMsg };
    }

    if (!checkSystemHealth_()) {
      const errorMsg = 'System health check failed';
      Logger.log(`❌ ${errorMsg}`);
      if (typeof ErrorHandler !== 'undefined') {
        ErrorHandler.notifyCriticalError(new Error(errorMsg), `withSystemChecks_ health`);
      }
      return { success: false, error: errorMsg };
    }

    const result = processingFunction();
    Logger.log(`✅ ${functionName} complete`);
    return result;

  } catch (error) {
    Logger.log(`❌ ${functionName} failed: ${error.toString()}`);
    if (typeof ErrorHandler !== 'undefined') {
      const simpleName = functionName.replace(/ /g, '');
      ErrorHandler.reportError(error, `BoxerApp.${simpleName}`);
    }
    return { success: false, error: error.toString() };
  }
}

/**
 * Ensures configuration is migrated and valid before any processing
 * @private
 */
function ensureSystemReady_() {

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

// === GLOBAL TRIGGER FUNCTIONS ===
// Use these functions to set up your time-based triggers in the Apps Script editor.

/**
 * Weekly trigger to build processing queue
 * Set this to run weekly (e.g., Monday 2 AM)
 */
function runQueueBuildingTrigger() {
  return BoxerApp.buildQueue();
}

/**
 * Regular trigger to process images
 * Set this to run every 2-4 hours
 */
function runImageProcessingTrigger() {
  return BoxerApp.processImages();
}

/**
 * Weekly trigger for Airtable archival and reporting
 * Set this to run weekly (e.g., Sunday night)
 */
function runAirtableArchivalTrigger() {
  return BoxerApp.archiveAirtable();
}

/**
 * Standalone trigger for sending the Airtable usage report
 * Set to run on its own schedule if desired (e.g., daily or weekly)
 */
function runAirtableUsageReportTrigger() {
  return BoxerApp.sendAirtableUsageReport();
}


/**
 * Daily trigger for legal document detection
 * Set this to run daily
 */
function runLegalDocDetectionTrigger() {
  return BoxerApp.processLegalDocs();
}

/**
 * Makes the BoxerApp.test() method executable from the Apps Script IDE.
 */
function runBoxerTest() {
  return BoxerApp.test();
}

/**
 * Run Airtable analysis
 */
function runAirtableAnalysis() {
  return BoxerApp.analyzeAirtable();
}

/**
 * Check Airtable setup
 */
function checkAirtableSetup() {
  Logger.log('🔍 === Checking Airtable Setup ===');
  
  // Check API key
  const apiKey = ConfigManager.getProperty('AIRTABLE_API_KEY');
  Logger.log(`API Key: ${apiKey ? '✅ Set' : '❌ Missing'}`);
  
  // Check Box token
  try {
    const token = getValidAccessToken();
    Logger.log(`Box Auth: ${token ? '✅ Valid' : '❌ Invalid'}`);
  } catch (e) {
    Logger.log(`Box Auth: ❌ Error - ${e.toString()}`);
  }
  
  // Check archive folder
  const archiveFolder = ConfigManager.getProperty('BOX_AIRTABLE_ARCHIVE_FOLDER');
  Logger.log(`Archive Folder: ${archiveFolder ? `✅ Set (${archiveFolder})` : '⚠️ Not set (will use root)'}`);
  
  // Check field names
  Logger.log(`Attachment Field: ${ConfigManager.getProperty('AIRTABLE_ATTACHMENT_FIELD') || 'Attachments'}`);
  Logger.log(`Link Field: ${ConfigManager.getProperty('AIRTABLE_LINK_FIELD') || 'Box_Link'}`);
  
  // Check shared link access level
  const linkAccess = ConfigManager.getProperty('BOX_AIRTABLE_SHARED_LINK_ACCESS') || 'company';
  Logger.log(`Shared Link Access: ${linkAccess}`);
  
  // Check configured bases
  const basesToArchive = ConfigManager.getProperty('AIRTABLE_BASES_TO_ARCHIVE');
  Logger.log(`\nConfigured Bases: ${basesToArchive ? basesToArchive.split(',').length + ' bases' : '❌ None configured'}`);
  
  Logger.log('\n💡 If anything is missing, set it with:');
  Logger.log('  ConfigManager.setProperty("PROPERTY_NAME", "value")');
  Logger.log('  BoxerApp.configureAirtableArchival(["Base Name"])');
}

/**
 * Test archiving the CP CRM base
 */
function testArchiveCPCRM() {
  // First configure it
  BoxerApp.configureAirtableArchival('CP CRM - Production Database_Current');
  
  // Then run the archival
  return BoxerApp.archiveAirtable();
}

/**
 * Run image processing test
 */
function runImageProcessingTest() {
  return withSystemChecks_('Test Image Processing', () => {
    return Diagnostics.runImageProcessingTest();
  });
}

