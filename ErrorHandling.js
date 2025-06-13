// File: ErrorHandling.js
// Centralized error handling and reporting for the Boxer system.

/**
 * ErrorHandler namespace for centralized error management.
 */
var ErrorHandler = (function() {
  'use strict';
  
  var ns = {};
  
  /**
   * Creates a standardized error object.
   * @param {Error} error The original error object.
   * @param {string} functionName The name of the function where the error occurred.
   * @param {object} context Additional context for debugging (e.g., fileId, folderId).
   * @returns {object} A standardized error object.
   * @private
   */
  function createErrorObject_(error, functionName, context) {
    var buildNumber = 'unknown';
    try {
      buildNumber = Config.getCurrentBuild();
    } catch (e) {
      // Config might not be available
    }
    
    return {
      timestamp: new Date().toISOString(),
      functionName: functionName || 'unknown_function',
      errorMessage: error.message || error.toString() || 'No message',
      stackTrace: error.stack || 'No stack trace',
      context: JSON.stringify(context || {}) || '{}',
      buildNumber: buildNumber
    };
  }
  
  /**
   * Logs an error to the Apps Script logger with a standardized format.
   * @param {Error} error The error object.
   * @param {string} functionName The name of the function where the error occurred.
   * @param {object} context Additional context.
   */
  ns.logError = function(error, functionName, context) {
    try {
      const errorObject = createErrorObject_(error, functionName, context);
      
      Logger.log(`❌ ERROR in ${errorObject.functionName}: ${errorObject.errorMessage}`);
      Logger.log(`   Context: ${errorObject.context}`);
      Logger.log(`   Stack: ${errorObject.stackTrace}`);
    } catch (e) {
      // If we can't even log, just try basic logging
      Logger.log('❌ ERROR: ' + (error ? error.toString() : 'Unknown error'));
    }
  };
  
  /**
   * Reports an error to a central Google Sheet for tracking and analysis.
   * @param {Error} error The error object.
   * @param {string} functionName The name of the function where the error occurred.
   * @param {object} context Additional context.
   */
  ns.reportError = function(error, functionName, context) {
    // Always log it to the standard logger first
    ns.logError(error, functionName, context);
    
    try {
      // Check if Config is available and has the required properties
      if (typeof Config === 'undefined' || !Config.TRACKING_SHEET_ID) {
        Logger.log('⚠️ No Google Sheet configured for error tracking - using log only');
        return;
      }
      
      const errorObject = createErrorObject_(error, functionName, context);
      
      const sheet = SpreadsheetApp.openById(Config.TRACKING_SHEET_ID).getSheetByName(Config.ERROR_LOG_SHEET_NAME || 'Error_Log');
      
      if (!sheet) {
        Logger.log(`⚠️ Could not find error log sheet: ${Config.ERROR_LOG_SHEET_NAME || 'Error_Log'}`);
        return;
      }
      
      // Append the error as a new row
      sheet.appendRow([
        errorObject.timestamp,
        errorObject.functionName,
        errorObject.errorMessage,
        errorObject.context,
        errorObject.stackTrace,
        errorObject.buildNumber
      ]);
      
      Logger.log('📊 Error logged to tracking sheet');
      
    } catch (e) {
      Logger.log(`⚠️ Failed to report error to Google Sheet: ${e.toString()}`);
      // Don't throw here - we don't want error reporting to break the main flow
    }
  };

  /**
   * Sends a critical error notification via email.
   * @param {Error} error The error object.
   * @param {string} functionName The name of the function where the error occurred.
   * @param {object} context Additional context.
   */
  ns.notifyCriticalError = function(error, functionName, context) {
    // Report the error to the sheet first
    ns.reportError(error, functionName, context);
    
    try {
      // Check if Config and email are available
      if (typeof Config === 'undefined' || !Config.CENTRAL_ERROR_EMAIL) {
        Logger.log('⚠️ No email configured for critical error notifications');
        return;
      }
      
      const errorObject = createErrorObject_(error, functionName, context);
      const email = Config.CENTRAL_ERROR_EMAIL;

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
      `;
      
      MailApp.sendEmail(email, subject, body);
      Logger.log('📧 Critical error notification sent');
      
    } catch (e) {
      Logger.log(`⚠️ Failed to send error notification email: ${e.toString()}`);
      // Don't throw here - we don't want email sending to break the main flow
    }
  };

  return ns;
})();