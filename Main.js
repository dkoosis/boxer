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
  if (typeof Config !== 'undefined') Boxer.Config = Config;
  if (typeof OAuthServices !== 'undefined') Boxer.OAuthServices = OAuthServices;
  if (typeof ErrorHandler !== 'undefined') Boxer.ErrorHandler = ErrorHandler;
  if (typeof BoxAuth !== 'undefined') Boxer.BoxAuth = BoxAuth;
  if (typeof Diagnostics !== 'undefined') Boxer.Diagnostics = Diagnostics;
  if (typeof BoxUtils !== 'undefined') Boxer.BoxUtils = BoxUtils;
  if (typeof BoxFileOperations !== 'undefined') Boxer.BoxFileOperations = BoxFileOperations;
  if (typeof BoxMetadataTemplates !== 'undefined') Boxer.BoxMetadataTemplates = BoxMetadataTemplates;
  if (typeof ExifProcessor !== 'undefined') Boxer.ExifProcessor = ExifProcessor;
  if (typeof VisionAnalysis !== 'undefined') Boxer.VisionAnalysis = VisionAnalysis;
  if (typeof MetadataExtraction !== 'undefined') Boxer.MetadataExtraction = MetadataExtraction;
  if (typeof LegalDocumentDetector !== 'undefined') Boxer.LegalDocumentDetector = LegalDocumentDetector;
  if (typeof AirtableArchivalManager !== 'undefined') Boxer.AirtableArchivalManager = AirtableArchivalManager;
  if (typeof BoxReportManager !== 'undefined') Boxer.BoxReportManager = BoxReportManager;
  if (typeof VersionManager !== 'undefined') Boxer.VersionManager = VersionManager;

  return Boxer;
}


/**
 * ENTRY POINT 1: Sweeps Box.com for image files and enhances their metadata.
 * This is your main image processing workflow using the robust report-based approach.
 * Recommended Trigger: Every 2-4 hours
 */
function add_metadata_to_images() {
  const Boxer = loadAllModules_(); // Ensures all modules are loaded before execution.

  try {
    Logger.log('🐕 === BOXER: Starting Image Metadata Processing ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    // Health check first
    const health_check_passed = Boxer.Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      Logger.log('🔄 Boxer will retry when services recover');
      return { success: false, error: 'Google Services outage detected' };
    }

    Logger.log('✅ Google Services healthy - proceeding with processing');

    // Use the report-based processing (most robust method)
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
    Boxer.ErrorHandler.reportError(error, 'add_metadata_to_images');
    return { success: false, error: error_msg };
  }
}

/**
 * ENTRY POINT 2: Archives image attachments from Airtable records to Box.com.
 * Processes a small batch each run (Roomba-style) to avoid timeouts.
 * Recommended Trigger: Every 2-4 hours
 */
function archive_airtable_attachments() {
  const Boxer = loadAllModules_(); // Ensures all modules are loaded before execution.
  
  try {
    Logger.log('📋 === BOXER: Starting Airtable Archival ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    // Health check first
    const health_check_passed = Boxer.Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
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
    Boxer.ErrorHandler.reportError(error, 'archive_airtable_attachments');
    return { success: false, error: error_msg };
  }
}

/**
 * ENTRY POINT 3: Scans Box.com for legal documents and applies legal metadata.
 * Identifies contracts, NDAs, and other legal documents using filename and content analysis.
 * Recommended Trigger: Daily
 */
function add_metadata_to_legal_docs() {
    const Boxer = loadAllModules_(); // Ensures all modules are loaded before execution.

  try {
    Logger.log('⚖️ === BOXER: Starting Legal Document Scan ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    // Health check first
    const health_check_passed = Boxer.Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
    }

    const access_token = Boxer.BoxAuth.getValidAccessToken();
    if (!access_token) {
      const error_msg = 'No valid Box access token available';
      Logger.log('❌ ' + error_msg);
      return { success: false, error: error_msg };
    }

    // Process legal documents (currently processes a configured folder)
    // This can be expanded to sweep all folders as needed
    const result = Boxer.LegalDocumentDetector.processLegalDocumentsInFolder(
      Boxer.Config.ACTIVE_TEST_FOLDER_ID, // Change to '0' for root folder sweep
      access_token
    );
    
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
    Boxer.ErrorHandler.reportError(error, 'add_metadata_to_legal_docs');
    return { success: false, error: error_msg };
  }
}
