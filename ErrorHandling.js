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
    return {
      timestamp: new Date().toISOString(),
      functionName: functionName || 'unknown_function',
      errorMessage: error.message || 'No message',
      stackTrace: error.stack || 'No stack trace',
      context: JSON.stringify(context) || '{}',
      buildNumber: Config.getCurrentBuild()
    };
  }
  
  /**
   * Logs an error to the Apps Script logger with a standardized format.
   * @param {Error} error The error object.
   * @param {string} functionName The name of the function where the error occurred.
   * @param {object} context Additional context.
   */
  ns.logError = function(error, functionName, context) {
    const errorObject = createErrorObject_(error, functionName, context);
    
    Logger.log(`❌ ERROR in ${errorObject.functionName}: ${errorObject.errorMessage}`);
    Logger.log(`   Context: ${errorObject.context}`);
    Logger.log(`   Stack: ${errorObject.stackTrace}`);
  };
  
  /**
   * Reports an error to a central Google Sheet for tracking and analysis.
   * @param {Error} error The error object.
   * @param {string} functionName The name of the function where the error occurred.
   * @param {object} context Additional context.
   */
  ns.reportError = function(error, functionName, context) {
    // Also log it to the standard logger
    ns.logError(error, functionName, context);
    
    try {
      const errorObject = createErrorObject_(error, functionName, context);
      
      const sheet = SpreadsheetApp.openById(Config.TRACKING_SHEET_ID).getSheetByName(Config.ERROR_LOG_SHEET_NAME);
      
      if (!sheet) {
        Logger.log(`ERROR: Could not find error log sheet: ${Config.ERROR_LOG_SHEET_NAME}`);
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
      
    } catch (e) {
      Logger.log(`CRITICAL: Failed to report error to Google Sheet: ${e.toString()}`);
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
      const errorObject = createErrorObject_(error, functionName, context);
      const email = Config.CENTRAL_ERROR_EMAIL;

      if (email) {
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
      }
    } catch (e) {
      Logger.log(`CRITICAL: Failed to send error notification email: ${e.toString()}`);
    }
  };

  return ns;
})();