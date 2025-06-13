// File: Main.js
// Central orchestrator for the Boxer system.
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
    
    const Boxer = loadAllModules_(); // Ensures all modules are loaded before execution.
    
    // Health check first (use fallback if Diagnostics not available)
    var health_check_passed = false;
    if (Boxer.Diagnostics && typeof Boxer.Diagnostics.check_critical_services === 'function') {
      health_check_passed = Boxer.Diagnostics.check_critical_services();
    } else {
      Logger.log('⚠️ Diagnostics module not available, using basic health check');
      health_check_passed = basicHealthCheck_();
    }
    
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      Logger.log('🔄 Boxer will retry when services recover');
      return { success: false, error: 'Google Services outage detected' };
    }

    Logger.log('✅ Google Services healthy - proceeding with processing');

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
    
    const Boxer = loadAllModules_(); // Ensures all modules are loaded before execution.
    
    // Health check first
    var health_check_passed = false;
    if (Boxer.Diagnostics && typeof Boxer.Diagnostics.check_critical_services === 'function') {
      health_check_passed = Boxer.Diagnostics.check_critical_services();
    } else {
      Logger.log('⚠️ Diagnostics module not available, using basic health check');
      health_check_passed = basicHealthCheck_();
    }
    
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
    }

    // Check if AirtableArchivalManager is available
    if (!Boxer.AirtableArchivalManager || typeof Boxer.AirtableArchivalManager.runAirtableArchival !== 'function') {
      Logger.log('❌ AirtableArchivalManager not available - cannot proceed');
      return { success: false, error: 'AirtableArchivalManager module not available' };
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
    
    const Boxer = loadAllModules_(); // Ensures all modules are loaded before execution.
    
    // Health check first
    var health_check_passed = false;
    if (Boxer.Diagnostics && typeof Boxer.Diagnostics.check_critical_services === 'function') {
      health_check_passed = Boxer.Diagnostics.check_critical_services();
    } else {
      Logger.log('⚠️ Diagnostics module not available, using basic health check');
      health_check_passed = basicHealthCheck_();
    }
    
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
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
 * Simple test function to verify basic functionality
 */
function test_boxer_basic() {
  Logger.log('🧪 === Basic Boxer Test ===');
  
  try {
    const Boxer = loadAllModules_();
    
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
    return { success: true, health_ok: health_ok };
    
  } catch (error) {
    Logger.log('❌ Basic test failed: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}