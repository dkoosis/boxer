// File: ErrorHandler.js
// Centralized error handling and reporting for the Boxer system

/**
 * ErrorHandler namespace for centralized error management
 */
const ErrorHandler = (function() {
  'use strict';
  
  const ns = {};
  
  /**
   * Creates a standardized error object
   * @private
   */
  function createErrorObject_(error, functionName, context) {
    return {
      timestamp: new Date().toISOString(),
      functionName: functionName || 'unknown',
      errorMessage: error.message || error.toString() || 'No message',
      stackTrace: error.stack || 'No stack trace',
      context: JSON.stringify(context || {}),
      buildNumber: ConfigManager.BUILD_NUMBER
    };
  }
  
  /**
   * Logs an error to the Apps Script logger
   */
  ns.logError = function(error, functionName, context) {
    try {
      const errorObject = createErrorObject_(error, functionName, context);
      
      Logger.log(`❌ ERROR in ${errorObject.functionName}: ${errorObject.errorMessage}`);
      Logger.log(`   Context: ${errorObject.context}`);
      if (errorObject.stackTrace !== 'No stack trace') {
        Logger.log(`   Stack: ${errorObject.stackTrace}`);
      }
    } catch (e) {
      Logger.log(`❌ ERROR: ${error ? error.toString() : 'Unknown error'}`);
    }
  };
  
  /**
   * Reports an error to the tracking sheet
   */
  ns.reportError = function(error, functionName, context) {
    // Always log first
    ns.logError(error, functionName, context);
    
    try {
      const sheetId = ConfigManager.BOXER_TRACKING_SHEET_ID;
      if (!sheetId) {
        return; // No tracking sheet configured
      }
      
      const sheet = SpreadsheetApp.openById(sheetId)
        .getSheetByName(ConfigManager.ERROR_LOG_SHEET_NAME);
      
      if (!sheet) {
        Logger.log('⚠️ Error log sheet not found');
        return;
      }
      
      const errorObject = createErrorObject_(error, functionName, context);
      
      sheet.appendRow([
        errorObject.timestamp,
        errorObject.functionName,
        errorObject.errorMessage,
        errorObject.context,
        errorObject.stackTrace,
        errorObject.buildNumber
      ]);
      
    } catch (e) {
      Logger.log(`⚠️ Could not log to sheet: ${e.toString()}`);
    }
  };

  /**
   * Sends a critical error notification via email
   * Only for truly critical errors that need immediate attention
   */
  ns.notifyCriticalError = function(error, functionName, context) {
    // Report to sheet first
    ns.reportError(error, functionName, context);
    
    try {
      // Check if email notifications are configured
      const email = ConfigManager.getProperty('CRITICAL_ERROR_EMAIL');
      if (!email) {
        return; // No email configured
      }
      
      const errorObject = createErrorObject_(error, functionName, context);
      const subject = `Boxer Critical Error: ${errorObject.functionName}`;
      const body = `
A critical error occurred in the Boxer script.

Timestamp: ${errorObject.timestamp}
Function: ${errorObject.functionName}
Error: ${errorObject.errorMessage}

Context:
${errorObject.context}

Stack Trace:
${errorObject.stackTrace}

Build: ${errorObject.buildNumber}
      `;
      
      MailApp.sendEmail(email, subject, body);
      Logger.log('📧 Critical error notification sent');
      
    } catch (e) {
      Logger.log(`⚠️ Could not send email: ${e.toString()}`);
    }
  };

  return ns;
})();