// File: Main.js
// Central orchestrator for the Boxer system.
// All scheduled triggers should point to the functions in this file.
// Depends on: Config.js, BoxAuth.js, Diagnostics.js, BoxReportManager.js, AirtableArchivalManager.js, LegalDocumentDetector.js

/**
 * ENTRY POINT 1: Sweeps Box.com for image files and enhances their metadata.
 * This is your main image processing workflow using the robust report-based approach.
 * Recommended Trigger: Every 2-4 hours
 */
function add_metadata_to_images() {
  try {
    Logger.log('🐕 === BOXER: Starting Image Metadata Processing ===');
    Logger.log('⏰ Start time: ' + new Date().toISOString());
    
    // Health check first
    const health_check_passed = Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      Logger.log('🔄 Boxer will retry when services recover');
      return { success: false, error: 'Google Services outage detected' };
    }

    Logger.log('✅ Google Services healthy - proceeding with processing');

    // Use the report-based processing (most robust method)
    const result = BoxReportManager.runReportBasedProcessing();
    
    if (result && result.success !== false) {
      Logger.log('✅ === BOXER: Image Metadata Processing Complete ===');
      Logger.log('📊 Files processed: ' + (result.filesProcessed || 0));
      Logger.log('⏰ End time: ' + new Date().toISOString());
    }
    
    return result;

  } catch (error) {
    const error_msg = 'add_metadata_to_images failed: ' + error.toString();
    Logger.log('❌ ' + error_msg);
    ErrorHandler.reportError(error, 'add_metadata_to_images');
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
    
    // Health check first
    const health_check_passed = Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
    }

    // Run Airtable archival with default configuration
    const result = AirtableArchivalManager.runAirtableArchival();
    
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
    ErrorHandler.reportError(error, 'archive_airtable_attachments');
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
    
    // Health check first
    const health_check_passed = Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
    }

    const access_token = getValidAccessToken();
    if (!access_token) {
      const error_msg = 'No valid Box access token available';
      Logger.log('❌ ' + error_msg);
      return { success: false, error: error_msg };
    }

    // Process legal documents (currently processes a configured folder)
    // This can be expanded to sweep all folders as needed
    const result = LegalDocumentDetector.processLegalDocumentsInFolder(
      Config.ACTIVE_TEST_FOLDER_ID, // Change to '0' for root folder sweep
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
    ErrorHandler.reportError(error, 'add_metadata_to_legal_docs');
    return { success: false, error: error_msg };
  }
}

/**
 * VARIANT: Archive Airtable attachments with custom configuration.
 * Use this for processing specific bases/tables that differ from default config.
 * @param {object} custom_config Custom Airtable configuration
 */
function archive_airtable_attachments_custom(custom_config) {
  try {
    Logger.log('📋 === BOXER: Starting Custom Airtable Archival ===');
    Logger.log('🔧 Custom config: ' + JSON.stringify(custom_config));
    
    const health_check_passed = Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
    }

    const result = AirtableArchivalManager.runAirtableArchival(custom_config);
    
    if (result && result.success !== false) {
      Logger.log('✅ === BOXER: Custom Airtable Archival Complete ===');
    }
    
    return result;

  } catch (error) {
    const error_msg = 'archive_airtable_attachments_custom failed: ' + error.toString();
    Logger.log('❌ ' + error_msg);
    ErrorHandler.reportError(error, 'archive_airtable_attachments_custom');
    return { success: false, error: error_msg };
  }
}

/**
 * VARIANT: Process only a specific folder for image metadata.
 * Use this for targeted processing of specific folders.
 * @param {string} folder_id Box folder ID to process
 */
function add_metadata_to_images_folder_only(folder_id) {
  try {
    Logger.log('🐕 === BOXER: Starting Targeted Folder Processing ===');
    Logger.log('📁 Target folder: ' + folder_id);
    
    const health_check_passed = Diagnostics.check_critical_services();
    if (!health_check_passed) {
      Logger.log('🛑 PROCESSING ABORTED: Critical Google Services are not responding.');
      return { success: false, error: 'Google Services outage detected' };
    }

    const access_token = getValidAccessToken();
    if (!access_token) {
      const error_msg = 'No valid Box access token available';
      Logger.log('❌ ' + error_msg);
      return { success: false, error: error_msg };
    }

    // Process images in the specific folder
    const images = BoxFileOperations.findAllImageFiles(folder_id, access_token);
    let processed = 0;
    let errors = 0;

    Logger.log('📊 Found ' + images.length + ' images in folder');

    for (let i = 0; i < images.length && i < 20; i++) { // Limit to prevent timeouts
      try {
        const image = images[i];
        Logger.log('🔄 Processing: ' + image.name);
        
        const result = MetadataExtraction.processSingleImageBasic(image, access_token);
        if (result && result.success !== false) {
          processed++;
          Logger.log('✅ Processed: ' + image.name);
        } else {
          errors++;
          Logger.log('❌ Failed: ' + image.name);
        }
        
        Utilities.sleep(1000); // Rate limiting
      } catch (error) {
        errors++;
        Logger.log('❌ Error processing ' + images[i].name + ': ' + error.toString());
      }
    }

    const result = {
      success: true,
      filesProcessed: processed,
      errors: errors,
      totalFound: images.length,
      folderProcessed: folder_id
    };

    Logger.log('✅ === BOXER: Targeted Folder Processing Complete ===');
    Logger.log('📊 Processed: ' + processed + ', Errors: ' + errors);
    
    return result;

  } catch (error) {
    const error_msg = 'add_metadata_to_images_folder_only failed: ' + error.toString();
    Logger.log('❌ ' + error_msg);
    ErrorHandler.reportError(error, 'add_metadata_to_images_folder_only');
    return { success: false, error: error_msg };
  }
}

/**
 * Show comprehensive status of all Boxer systems.
 * Useful for monitoring and troubleshooting.
 */
function show_boxer_status() {
  Logger.log('🐕 === BOXER SYSTEM STATUS ===');
  Logger.log('⏰ Status check time: ' + new Date().toISOString());
  
  try {
    // Check authentication
    Logger.log('\n🔐 Authentication Status:');
    const auth_status = getAuthStatus();
    Logger.log('  Has token: ' + auth_status.hasToken);
    Logger.log('  Credentials set: ' + auth_status.credentialsSet);
    
    // Check Google Services
    Logger.log('\n🌐 Google Services Health:');
    const services_healthy = Diagnostics.check_critical_services();
    Logger.log('  Services status: ' + (services_healthy ? '✅ Healthy' : '❌ Issues detected'));
    
    // Show recent processing stats
    Logger.log('\n📊 Recent Processing Stats:');
    try {
      BoxReportManager.showProcessingStats();
    } catch (error) {
      Logger.log('  BoxReportManager stats unavailable: ' + error.toString());
    }
    
    try {
      AirtableArchivalManager.showStats();
    } catch (error) {
      Logger.log('  Airtable stats unavailable: ' + error.toString());
    }
    
    // Check current build
    Logger.log('\n🔧 Version Info:');
    const version_info = Config.getVersionInfo();
    Logger.log('  Script version: ' + version_info.scriptVersion);
    Logger.log('  Build number: ' + version_info.buildNumber);
    
    Logger.log('\n✅ Status check complete');
    
  } catch (error) {
    Logger.log('❌ Error during status check: ' + error.toString());
  }
}