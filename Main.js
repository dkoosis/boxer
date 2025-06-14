// File: Main.js (Enhanced Version)
// Central orchestrator for the Boxer system with integrated configuration validation
// All scheduled triggers should point to the functions in this file.

/**
 * Ensures all script modules (namespaces) are loaded and available under a single global object.
 * This function solves the Google Apps Script file loading order problem by explicitly
 * defining all namespaces before any other code runs.
 * @returns {object} The global Boxer namespace.
 */
function loadAllModules_() {
  const Boxer = {};
  
  // --- Load all modules onto the Boxer namespace ---
  // Use try-catch for each module to handle missing modules gracefully
  try { if (typeof Config !== 'undefined') Boxer.Config = Config; } catch (e) { Logger.log('Config module not available'); }
  try { if (typeof ConfigValidator !== 'undefined') Boxer.ConfigValidator = ConfigValidator; } catch (e) { Logger.log('ConfigValidator module not available'); }
  try { if (typeof OAuthServices !== 'undefined') Boxer.OAuthServices = OAuthServices; } catch (e) { Logger.log('OAuthServices module not available'); }
  try { if (typeof ErrorHandler !== 'undefined') Boxer.ErrorHandler = ErrorHandler; } catch (e) { Logger.log('ErrorHandler module not available'); }
  try { if (typeof BoxAuth !== 'undefined') Boxer.BoxAuth = BoxAuth; } catch (e) { Logger.log('BoxAuth module not available'); }
  try { if (typeof Diagnostics !== 'undefined') Boxer.Diagnostics = Diagnostics; } catch (e) { Logger.log('Diagnostics module not available'); }
  try { if (typeof BoxUtils !== 'undefined') Boxer.BoxUtils = BoxUtils; } catch (e) { Logger.log('BoxUtils module not available'); }
  try { if (typeof BoxFileOperations !== 'undefined') Boxer.BoxFileOperations = BoxFileOperations; } catch (e) { Logger.log('BoxFileOperations module not available'); }
  try { if (typeof BoxMetadataTemplates !== 'undefined') Boxer.BoxMetadataTemplates = BoxMetadataTemplates; } catch (e) { Logger.log('BoxMetadataTemplates module not available'); }
  try { if (typeof ExifProcessor !== 'undefined') Boxer.ExifProcessor = ExifProcessor; } catch (e) { Logger.log('ExifProcessor module not available'); }
  try { if (typeof VisionAnalysis !== 'undefined') Boxer.VisionAnalysis = VisionAnalysis; } catch (e) { Logger.log('VisionAnalysis module not available'); }
  try { if (typeof MetadataExtraction !== 'undefined') Boxer.MetadataExtraction = MetadataExtraction; } catch (e) { Logger.log('MetadataExtraction module not available'); }
  try { if (typeof LegalDocumentDetector !== 'undefined') Boxer.LegalDocumentDetector = LegalDocumentDetector; } catch (e) { Logger.log('LegalDocumentDetector module not available'); }
  try { if (typeof AirtableArchivalManager !== 'undefined') Boxer.AirtableArchivalManager = AirtableArchivalManager; } catch (e) { Logger.log('AirtableArchivalManager module not available'); }
  try { if (typeof BoxReportManager !== 'undefined') Boxer.BoxReportManager = BoxReportManager; } catch (e) { Logger.log('BoxReportManager module not available'); }
  try { if (typeof VersionManager !== 'undefined') Boxer.VersionManager = VersionManager; } catch (e) { Logger.log('VersionManager module not available'); }

  // Log what modules were successfully loaded
  var loadedModules = Object.keys(Boxer);
  Logger.log('📦 Loaded modules: ' + loadedModules.join(', '));
  
  return Boxer;
}

/**
 * Validates configuration and attempts auto-repair if needed
 * @returns {object} Validation results with status and any errors
 */
function validateAndRepairConfiguration_() {
  try {
    if (typeof ConfigValidator === 'undefined') {
      Logger.log('⚠️ ConfigValidator not available - skipping validation');
      return { valid: true, warnings: ['ConfigValidator module not loaded'] };
    }
    
    // Run validation with auto-fix enabled
    var results = ConfigValidator.validateConfiguration(true);
    
    if (!results.valid) {
      // Log the setup guide for manual intervention
      var guide = ConfigValidator.generateSetupGuide(results);
      Logger.log(guide);
      
      // If we fixed some issues, re-validate to check final status
      if (results.fixed > 0) {
        Logger.log('🔄 Re-validating after auto-fixes...');
        results = ConfigValidator.validateConfiguration(false);
      }
    }
    
    if (results.fixed > 0) {
      Logger.log('✅ Auto-fixed ' + results.fixed + ' configuration issue(s)');
    }
    
    return results;
    
  } catch (error) {
    Logger.log('❌ Configuration validation failed: ' + error.toString());
    return { valid: false, errors: ['Configuration validation error: ' + error.toString()] };
  }
}

/**
 * Enhanced health check that includes configuration validation
 * @returns {boolean} True if system is ready to process
 */
function performSystemHealthCheck_(Boxer) {
  Logger.log('🏥 === System Health Check ===');
  
  // Step 1: Validate and repair configuration
  var configResults = validateAndRepairConfiguration_();
  
  if (!configResults.valid) {
    Logger.log('❌ Configuration validation failed');
    Logger.log('🛑 CRITICAL: Required configurations are missing');
    Logger.log('💡 Run setupBoxer() to complete configuration');
    
    // Report this as a critical error
    if (typeof ErrorHandler !== 'undefined' && ErrorHandler.notifyCriticalError) {
      var configError = new Error('Required configurations missing: ' + configResults.errors.join(', '));
      ErrorHandler.notifyCriticalError(configError, 'System Health Check', configResults);
    }
    
    return false;
  }
  
  // Step 2: Check Google Services health
  var health_check_passed = false;
  if (Boxer.Diagnostics && typeof Boxer.Diagnostics.check_critical_services === 'function') {
    health_check_passed = Boxer.Diagnostics.check_critical_services();
  } else {
    Logger.log('⚠️ Diagnostics module not available, using basic health check');
    health_check_passed = basicHealthCheck_();
  }
  
  if (!health_check_passed) {
    Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
    
    // Run detailed diagnostics
    if (Boxer.Diagnostics && typeof Boxer.Diagnostics.detailed_health_check === 'function') {
      Logger.log('🩺 Running detailed health check...');
      var detailed_status = Boxer.Diagnostics.detailed_health_check();
      Logger.log('Detailed Health Status: ' + JSON.stringify(detailed_status, null, 2));
    }
    
    return false;
  }
  
  Logger.log('✅ System health check passed');
  return true;
}

/**
 * Fallback health check function in case Diagnostics module isn't available
 * @returns {boolean} True if basic services are working
 */
function basicHealthCheck_() {
  try {
    // Test basic Google Apps Script services
    PropertiesService.getScriptProperties().getProperty('_test');
    
    var testResponse = UrlFetchApp.fetch('https://httpbin.org/status/200', {
      muteHttpExceptions: true,
      timeout: 10
    });
    
    return testResponse.getResponseCode() === 200;
  } catch (error) {
    Logger.log('❌ Basic health check failed: ' + error.toString());
    return false;
  }
}

/**
 * ENTRY POINT 1: Sweeps Box.com for image files and enhances their metadata.
 * This is your main image processing workflow using the robust report-based approach.
 * Recommended Trigger: Every 2-4 hours
 */
function add_metadata_to_images() {
  try {
    Logger.log('🐕 === BOXER: Starting Image Metadata Processing ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    const Boxer = loadAllModules_();
    
    // Perform comprehensive system health check (includes config validation)
    if (!performSystemHealthCheck_(Boxer)) {
      Logger.log('🔄 Boxer will retry when system is healthy');
      return { success: false, error: 'System health check failed' };
    }

    Logger.log('✅ All systems healthy - proceeding with processing');

    // Use the report-based processing (most robust method)
    if (!Boxer.BoxReportManager || typeof Boxer.BoxReportManager.runReportBasedProcessing !== 'function') {
      Logger.log('❌ BoxReportManager not available - cannot proceed');
      return { success: false, error: 'BoxReportManager module not available' };
    }
    
    const result = Boxer.BoxReportManager.runReportBasedProcessing();
    
    if (result && result.success !== false) {
      Logger.log('✅ === BOXER: Image Metadata Processing Complete ===');
      Logger.log('📊 Files processed: ' + (result.filesProcessed || 0));
      Logger.log('⏰ End time: ' + new Date().toISOString());
    }
    
    return result;

  } catch (error) {
    const error_msg = 'add_metadata_to_images failed: ' + error.toString();
    Logger.log('❌ ' + error_msg);
    
    // Try to report error, but don't fail if error reporting fails
    try {
      if (typeof ErrorHandler !== 'undefined' && ErrorHandler.reportError) {
        ErrorHandler.reportError(error, 'add_metadata_to_images');
      }
    } catch (reportError) {
      Logger.log('⚠️ Could not report error: ' + reportError.toString());
    }
    
    return { success: false, error: error_msg };
  }
}

/**
 * ENTRY POINT 2: Archives image attachments from Airtable records to Box.com.
 * Processes a small batch each run (Roomba-style) to avoid timeouts.
 * Recommended Trigger: Every 2-4 hours
 */
function archive_airtable_attachments() {
  try {
    Logger.log('📋 === BOXER: Starting Airtable Archival ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    const Boxer = loadAllModules_();
    
    // Perform comprehensive system health check
    if (!performSystemHealthCheck_(Boxer)) {
      Logger.log('🔄 Boxer will retry when system is healthy');
      return { success: false, error: 'System health check failed' };
    }

    // Check if AirtableArchivalManager is available
    if (!Boxer.AirtableArchivalManager || typeof Boxer.AirtableArchivalManager.runAirtableArchival !== 'function') {
      Logger.log('❌ AirtableArchivalManager not available - cannot proceed');
      return { success: false, error: 'AirtableArchivalManager module not available' };
    }

    // Check if Airtable API key is configured
    var airtableKey = PropertiesService.getScriptProperties().getProperty('AIRTABLE_API_KEY');
    if (!airtableKey) {
      Logger.log('⚠️ Airtable API key not configured - skipping archival');
      Logger.log('💡 Run setAirtableApiKey("YOUR_API_KEY") to enable this feature');
      return { success: false, error: 'Airtable API key not configured' };
    }

    // Run Airtable archival with default configuration
    const result = Boxer.AirtableArchivalManager.runAirtableArchival();
    
    if (result && result.success !== false) {
      Logger.log('✅ === BOXER: Airtable Archival Complete ===');
      Logger.log('📊 Records processed: ' + (result.recordsProcessed || 0));
      Logger.log('📦 Files uploaded: ' + (result.filesUploaded || 0));
      Logger.log('⏰ End time: ' + new Date().toISOString());
    }
    
    return result;

  } catch (error) {
    const error_msg = 'archive_airtable_attachments failed: ' + error.toString();
    Logger.log('❌ ' + error_msg);
    
    // Try to report error, but don't fail if error reporting fails
    try {
      if (typeof ErrorHandler !== 'undefined' && ErrorHandler.reportError) {
        ErrorHandler.reportError(error, 'archive_airtable_attachments');
      }
    } catch (reportError) {
      Logger.log('⚠️ Could not report error: ' + reportError.toString());
    }
    
    return { success: false, error: error_msg };
  }
}

/**
 * ENTRY POINT 3: Scans Box.com for legal documents and applies legal metadata.
 * Identifies contracts, NDAs, and other legal documents using filename and content analysis.
 * Recommended Trigger: Daily
 */
function add_metadata_to_legal_docs() {
  try {
    Logger.log('⚖️ === BOXER: Starting Legal Document Scan ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    const Boxer = loadAllModules_();
    
    // Perform comprehensive system health check
    if (!performSystemHealthCheck_(Boxer)) {
      Logger.log('🔄 Boxer will retry when system is healthy');
      return { success: false, error: 'System health check failed' };
    }

    // Check if required modules are available
    if (!Boxer.BoxAuth || typeof getValidAccessToken !== 'function') {
      Logger.log('❌ BoxAuth not available - cannot proceed');
      return { success: false, error: 'BoxAuth module not available' };
    }
    
    if (!Boxer.LegalDocumentDetector || typeof Boxer.LegalDocumentDetector.processLegalDocumentsInFolder !== 'function') {
      Logger.log('❌ LegalDocumentDetector not available - cannot proceed');
      return { success: false, error: 'LegalDocumentDetector module not available' };
    }

    const access_token = getValidAccessToken();
    if (!access_token) {
      const error_msg = 'No valid Box access token available';
      Logger.log('❌ ' + error_msg);
      return { success: false, error: error_msg };
    }

    // Process legal documents (currently processes a configured folder)
    // This can be expanded to sweep all folders as needed
    const folderId = (Boxer.Config && Boxer.Config.ACTIVE_TEST_FOLDER_ID) ? Boxer.Config.ACTIVE_TEST_FOLDER_ID : '0';
    const result = Boxer.LegalDocumentDetector.processLegalDocumentsInFolder(folderId, access_token);
    
    if (result && result.success !== false) {
      Logger.log('✅ === BOXER: Legal Document Scan Complete ===');
      Logger.log('📊 Documents processed: ' + (result.documentsProcessed || 0));
      Logger.log('⚖️ Legal docs identified: ' + (result.legalDocsIdentified || 0));
      Logger.log('⏰ End time: ' + new Date().toISOString());
    }
    
    return result;

  } catch (error) {
    const error_msg = 'add_metadata_to_legal_docs failed: ' + error.toString();
    Logger.log('❌ ' + error_msg);
    
    // Try to report error, but don't fail if error reporting fails
    try {
      if (typeof ErrorHandler !== 'undefined' && ErrorHandler.reportError) {
        ErrorHandler.reportError(error, 'add_metadata_to_legal_docs');
      }
    } catch (reportError) {
      Logger.log('⚠️ Could not report error: ' + reportError.toString());
    }
    
    return { success: false, error: error_msg };
  }
}

/**
 * Enhanced test function that includes configuration check
 */
function test_boxer_basic() {
  Logger.log('🧪 === Basic Boxer Test ===');
  
  try {
    const Boxer = loadAllModules_();
    
    // Test configuration first
    Logger.log('\n📋 Configuration Check:');
    var configResults = validateAndRepairConfiguration_();
    Logger.log('Configuration valid: ' + (configResults.valid ? '✅' : '❌'));
    
    if (!configResults.valid) {
      Logger.log('⚠️ Configuration issues found. Run setupBoxer() to fix.');
      return { success: false, configuration_valid: false };
    }
    
    // Test basic health check
    var health_ok = false;
    if (Boxer.Diagnostics && typeof Boxer.Diagnostics.check_critical_services === 'function') {
      health_ok = Boxer.Diagnostics.check_critical_services();
    } else {
      health_ok = basicHealthCheck_();
    }
    
    Logger.log('Health check: ' + (health_ok ? '✅' : '❌'));
    
    // Test Box auth if available
    if (typeof getValidAccessToken === 'function') {
      try {
        var token = getValidAccessToken();
        Logger.log('Box auth: ' + (token ? '✅' : '❌'));
      } catch (e) {
        Logger.log('Box auth: ❌ (' + e.toString() + ')');
      }
    }
    
    Logger.log('🎉 Basic test complete');
    return { success: true, health_ok: health_ok, configuration_valid: configResults.valid };
    
  } catch (error) {
    Logger.log('❌ Basic test failed: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}