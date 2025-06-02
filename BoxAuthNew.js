// File: BoxAuth.gs
// Box authentication using Bruce McPherson's cGoa library
// Follows Bruce's patterns for OAuth2 service management
// Depends on: Config.gs

/**
 * BoxAuth namespace following Bruce McPherson's cGoa patterns.
 * Handles all Box API authentication using cGoa library.
 */
var BoxAuth = (function() {
  'use strict';
  
  var ns = {};
  var goa_ = null;
  
  /**
   * Get cGoa instance following Bruce's lazy initialization pattern.
   * @returns {object} cGoa instance for Box
   * @private
   */
  function getGoa_() {
    if (!goa_) {
      try {
        var packageConfig = Config.getBoxGoaPackage();
        goa_ = cGoa.GoaApp.createPackage(packageConfig);
        Logger.log('BoxAuth: cGoa package initialized for Box');
      } catch (e) {
        Logger.log('ERROR: BoxAuth - Failed to initialize cGoa: ' + e.toString());
        throw new Error('cGoa initialization failed: ' + e.toString());
      }
    }
    return goa_;
  }
  
  /**
   * Initialize Box authentication following Bruce's cGoa patterns.
   * This handles the OAuth2 flow and guides user through consent.
   * @returns {boolean} True if authentication is ready
   */
  ns.initialize = function() {
    Logger.log('BoxAuth: Initializing Box authentication');
    
    try {
      var goa = getGoa_();
      
      // Check if we already have a valid token
      if (goa.hasToken()) {
        Logger.log('BoxAuth: Valid token found, testing connection');
        return ns.testConnection();
      }
      
      // Check if we need user consent
      if (goa.needsConsent()) {
        var authUrl = goa.getAuthUrl();
        Logger.log('');
        Logger.log('=== Box Authentication Required ===');
        Logger.log('Please visit this URL to authorize Boxer:');
        Logger.log('');
        Logger.log(authUrl);
        Logger.log('');
        Logger.log('After authorization, run BoxAuth.initialize() again');
        Logger.log('=====================================');
        return false;
      }
      
      // Token should be available now
      if (goa.hasToken()) {
        Logger.log('BoxAuth: Authentication completed successfully');
        return ns.testConnection();
      } else {
        Logger.log('ERROR: BoxAuth - Authentication failed for unknown reason');
        return false;
      }
      
    } catch (error) {
      Logger.log('ERROR: BoxAuth - Exception during initialization: ' + error.toString());
      return false;
    }
  };
  
  /**
   * Get valid access token following Bruce's patterns.
   * @returns {string} Valid Box access token
   * @throws {Error} If no valid token available
   */
  ns.getAccessToken = function() {
    try {
      var goa = getGoa_();
      
      if (!goa.hasToken()) {
        throw new Error('No valid Box access token. Run BoxAuth.initialize() first.');
      }
      
      return goa.getToken();
      
    } catch (error) {
      Logger.log('ERROR: BoxAuth - Failed to get access token: ' + error.toString());
      throw error;
    }
  };
  
  /**
   * Test Box API connection using current token.
   * @returns {boolean} True if connection successful
   */
  ns.testConnection = function() {
    try {
      var token = ns.getAccessToken();
      var testUrl = Config.BOX_API_BASE_URL + '/users/me';
      
      var response = UrlFetchApp.fetch(testUrl, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      
      var responseCode = response.getResponseCode();
      
      if (responseCode === 200) {
        var user = JSON.parse(response.getContentText());
        Logger.log('BoxAuth: Connected to Box as ' + user.name + ' (' + user.login + ')');
        return true;
      } else {
        Logger.log('ERROR: BoxAuth - Box API test failed with code: ' + responseCode);
        return false;
      }
      
    } catch (error) {
      Logger.log('ERROR: BoxAuth - Connection test failed: ' + error.toString());
      return false;
    }
  };
  
  /**
   * Get authentication status following Bruce's patterns.
   * @returns {object} Status object with authentication details
   */
  ns.getStatus = function() {
    var status = {
      hasPackage: false,
      hasToken: false,
      needsConsent: false,
      connectionWorking: false,
      error: null
    };
    
    try {
      var goa = getGoa_();
      status.hasPackage = true;
      status.hasToken = goa.hasToken();
      status.needsConsent = goa.needsConsent();
      
      if (status.hasToken) {
        status.connectionWorking = ns.testConnection();
      }
      
    } catch (error) {
      status.error = error.toString();
    }
    
    return status;
  };
  
  /**
   * Reset authentication (clears stored tokens).
   * Useful for troubleshooting or switching accounts.
   */
  ns.reset = function() {
    Logger.log('BoxAuth: Resetting authentication');
    
    try {
      // Clear the cGoa package tokens
      if (goa_) {
        var packageName = 'boxService';
        var tokenProperty = 'cGoa.' + packageName + '.token';
        Config.SCRIPT_PROPERTIES.deleteProperty(tokenProperty);
        Logger.log('BoxAuth: Cleared stored tokens');
      }
      
      // Reset internal state
      goa_ = null;
      
      Logger.log('BoxAuth: Reset complete. Run BoxAuth.initialize() to re-authenticate');
      
    } catch (error) {
      Logger.log('ERROR: BoxAuth - Reset failed: ' + error.toString());
    }
  };
  
  /**
   * Get user information from Box API.
   * @returns {object|null} User object or null on failure
   */
  ns.getUserInfo = function() {
    try {
      var token = ns.getAccessToken();
      var userUrl = Config.BOX_API_BASE_URL + '/users/me';
      
      var response = UrlFetchApp.fetch(userUrl, {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        return JSON.parse(response.getContentText());
      } else {
        Logger.log('ERROR: BoxAuth - Failed to get user info: ' + response.getResponseCode());
        return null;
      }
      
    } catch (error) {
      Logger.log('ERROR: BoxAuth - Exception getting user info: ' + error.toString());
      return null;
    }
  };
  
  /**
   * Diagnostic function following Bruce's debugging patterns.
   * @returns {object} Comprehensive diagnostic information
   */
  ns.diagnose = function() {
    Logger.log('=== BoxAuth Diagnostics ===');
    
    var diagnostics = {
      timestamp: new Date().toISOString(),
      cGoaAvailable: typeof cGoa !== 'undefined',
      credentialsSet: false,
      packageCreated: false,
      hasToken: false,
      connectionWorking: false,
      userInfo: null,
      errors: []
    };
    
    // Check if cGoa is available
    if (!diagnostics.cGoaAvailable) {
      var error = 'cGoa library not available';
      diagnostics.errors.push(error);
      Logger.log('❌ ' + error);
      return diagnostics;
    }
    Logger.log('✅ cGoa library available');
    
    // Check credentials
    try {
      Config.getBoxGoaPackage();
      diagnostics.credentialsSet = true;
      Logger.log('✅ Box OAuth credentials found');
    } catch (error) {
      diagnostics.errors.push(error.toString());
      Logger.log('❌ ' + error.toString());
      return diagnostics;
    }
    
    // Check package creation
    try {
      var goa = getGoa_();
      diagnostics.packageCreated = true;
      Logger.log('✅ cGoa package created successfully');
      
      // Check token
      diagnostics.hasToken = goa.hasToken();
      Logger.log(diagnostics.hasToken ? '✅ Valid token found' : '⚠️ No token found');
      
      if (diagnostics.hasToken) {
        // Test connection
        diagnostics.connectionWorking = ns.testConnection();
        Logger.log(diagnostics.connectionWorking ? '✅ Box connection working' : '❌ Box connection failed');
        
        if (diagnostics.connectionWorking) {
          diagnostics.userInfo = ns.getUserInfo();
        }
      }
      
    } catch (error) {
      diagnostics.errors.push(error.toString());
      Logger.log('❌ Package creation failed: ' + error.toString());
    }
    
    Logger.log('=== End Diagnostics ===');
    return diagnostics;
  };
  
  return ns;
})();