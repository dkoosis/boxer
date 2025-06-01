// File: BoxOAuth.gs
// Depends on: cGoa library, (and your Config.gs if still used for constants)

/**
 * BoxOAuth namespace for Box API OAuth2 authentication using cGoa
 */
var BoxOAuth = (function() {
  'use strict';
  
  var ns = {};
  
  // --- Configuration ---
  // 'boxService' is a unique name for this particular Box configuration/pockage.
  // You might have multiple if connecting to different Box accounts or with different permissions.
  var BOX_POCKAGE_NAME = 'boxService'; 
  var SCRIPT_PROPERTIES = PropertiesService.getScriptProperties(); // Or getUserProperties() for user-specific tokens

  // Define these in your Script Properties or a Config.gs
  var OAUTH_CLIENT_ID_PROPERTY = 'BOX_CLIENT_ID'; // Name of script property holding Box Client ID
  var OAUTH_CLIENT_SECRET_PROPERTY = 'BOX_CLIENT_SECRET'; // Name of script property holding Box Client Secret
  // var APPS_SCRIPT_REDIRECT_URI is handled by cGoa via ScriptApp.getService().getUrl() for usercallback

  var BOX_SCOPES_ = [
    'root_readwrite', // Ensure these are the correct scopes you need
    'manage_enterprise_properties' 
  ];

  var goa_ = null; // Singleton for our Goa instance for Box

  /**
   * Initializes and/or retrieves the Goa instance for Box.
   * This follows cGoa's pattern of creating a Goa object for a specific service configuration.
   * @private
   * @return {Goa} The Goa instance.
   */
  function getGoaInstance_() {
    if (goa_) {
      return goa_;
    }

    // Ensure essential pockage info is in PropertiesService.
    // This is a one-time setup or can be done externally.
    // For this refactor, we'll ensure it here if not present.
    var boxPockage = GoaApp.getPackage(SCRIPT_PROPERTIES, BOX_POCKAGE_NAME);
    if (!boxPockage) {
      var clientId = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY);
      var clientSecret = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY);

      if (!clientId || !clientSecret) {
        throw new Error('Box OAuth Client ID or Secret not found in Script Properties.');
      }

      boxPockage = {
        service: 'box', // This MUST match the key you added in Service.txt
        clientId: clientId,
        clientSecret: clientSecret,
        scopes: BOX_SCOPES_,
        packageName: BOX_POCKAGE_NAME
        // cGoa will add other necessary properties like redirectUri automatically
      };
      GoaApp.setPackage(SCRIPT_PROPERTIES, boxPockage);
      Logger.log('BoxOAuth: Initial Box pockage configured in Properties.');
    }
    
    // Create the Goa instance for our Box Pockage
    // optTimeout (e.g., 300 seconds) and impersonate (for service accounts) are optional
    goa_ = new Goa(BOX_POCKAGE_NAME, SCRIPT_PROPERTIES /*, optTimeout, impersonate*/);
    
    // Set the callback function that cGoa should use for the OAuth redirect.
    // This MUST be a globally accessible function name.
    goa_.setCallback('authCallback'); // Assumes global function authCallback(e) exists

    // If you have a function to call *after* a token is successfully obtained/refreshed:
    // goa_.setOnToken(function(token, packageName, params) {
    //   Logger.log('Token obtained for ' + packageName + ': ' + token);
    //   // You can use params if you passed any user arguments via goa.execute()
    // });

    return goa_;
  }

  /**
   * Handles the OAuth2 callback from Box.
   * This function is called by the global authCallback function.
   * @param {object} request The callback request object from Google Apps Script.
   * @return {HtmlOutput} HTML response for the browser.
   */
  ns.handleAuthCallback = function(request) {
    var goa = getGoaInstance_();
    goa.execute(request); // cGoa's execute handles the callback parameters

    var htmlOutput;
    if (goa.hasToken()) {
      Logger.log('BoxOAuth: Authorization callback successful.');
      htmlOutput = HtmlService.createHtmlOutput(
        '<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">' +
        '<h2 style="color: #0061D5;">✅ Box Authorization Successful!</h2>' +
        '<p>You can now close this tab and return to Google Apps Script.</p>' +
        '</div>'
      );
    } else {
      Logger.log('BoxOAuth: Authorization callback failed.');
      // goa.getConsent() might provide a more detailed error screen from cGoa if needed
      htmlOutput = HtmlService.createHtmlOutput(
        '<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">' +
        '<h2 style="color: #D73502;">❌ Box Authorization Failed</h2>' +
        '<p>Authorization was denied or an error occurred. Check logs.</p>' +
        '</div>'
      );
    }
    // Optionally use goa.done() which provides a standard "you can close this window"
    // return goa.done(); 
    return htmlOutput;
  };

  /**
   * Initiates the OAuth2 authorization flow if needed, or returns an already authorized Goa instance.
   * @param {object} [e] Optional event parameter, passed if called directly from doGet(e) or similar.
   * @return {Goa} The Goa instance. May trigger consent screen.
   */
  function executeFlow_(e) {
    var goa = getGoaInstance_();
    goa.execute(e); // Main cGoa execution point
    return goa;
  }

  /**
   * Displays the authorization screen if consent is required.
   * Call this from a doGet(e) if you want to manually start the flow or show UI.
   */
  ns.authorize = function() {
    var goa = executeFlow_(); // Pass an empty object or null if no event 'e'
    if (goa.needsConsent()) {
      // This will show the consent screen. In a web app, you'd return this.
      // For non-webapp, user needs to be directed via showAuthorizationUrl().
      var consentHtml = goa.getConsent(); 
      // If in a web app: return consentHtml;
      // If in editor: Use showAuthorizationUrl() guidance.
      Logger.log("BoxOAuth: Authorization required. Use 'showBoxAuthorizationUrl' or trigger from a web app context.");
      return consentHtml; // Example, adapt to your context
    } else if (goa.hasToken()) {
      Logger.log("BoxOAuth: Already authorized.");
      // Optionally return a success message for web app context
      return HtmlService.createHtmlOutput("Already authorized.");
    } else {
      Logger.log("BoxOAuth: Could not authorize and no consent needed? Check logs.");
      // Handle unexpected state
      return HtmlService.createHtmlOutput("Authorization state unclear. Check logs.");
    }
  };
  
  /**
   * Checks if the service has a valid, non-expired access token.
   * @return {boolean} True if authorized.
   */
  ns.isHealthy = function() {
    try {
      var goa = getGoaInstance_();
      // goa.execute(); // Ensure latest state, might attempt refresh
      return goa.hasToken(); // hasToken checks for expiry
    } catch (error) {
      Logger.log('BoxOAuth: Health check failed: ' + error.toString());
      return false;
    }
  };

  /**
   * Gets a valid access token. cGoa handles refresh automatically if possible.
   * @return {string|null} Valid access token or null.
   */
  ns.getValidAccessToken = function() {
    try {
      var goa = getGoaInstance_();
      // goa.execute(); // Ensure latest state, crucial for token refresh if needed before getToken
      var token = goa.getToken(); // getToken attempts refresh
      
      if (!token) {
        Logger.log('BoxOAuth: No access token available. Authorization may be required.');
        Logger.log('BoxOAuth: Run showBoxAuthorizationUrl() or trigger the .authorize() method.');
        return null;
      }
      return token;
    } catch (error) {
      Logger.log('BoxOAuth: Failed to get access token: ' + error.toString());
      return null;
    }
  };

  /**
   * Generates and logs the authorization URL for manual authorization.
   */
  ns.showAuthorizationUrl = function() {
    try {
      var goa = getGoaInstance_();
      // We need to ensure the 'init' phase of execute has run to set up parameters
      // for createAuthenticationUrl.
      // A bit of a workaround if not in the main execute flow:
      if (!goa.needsConsent()) {
         // Temporarily simulate the 'init' conditions if not already in consent flow.
         // This is to get the auth URL. cGoa typically generates this as part of .execute()
         // when .needsConsent() is true.
         
         // To construct the URL, cGoa's GoaApp.createAuthenticationUrl is used.
         // It needs a "pockage" and a "scriptPackage"
         var pockage = goa.fetchPackage(); // Get the current pockage
         if (!pockage) {
            Logger.log("BoxOAuth: Pockage not found. Cannot generate Auth URL.");
            return;
         }

         // The ID should be stable if you want to resume a flow, or unique if starting fresh.
         // cGoa's execute() typically handles this ID via cache.
         var tempId = Utils.generateUniqueString(); 
         var scriptPackage = {
           callback: goa_.getCallback ? goa_.getCallback() : 'authCallback', // Ensure you have getCallback or hardcode
           timeout: 300, // or from goa instance if available
           offline: Utils.applyDefault(pockage.offline, true),
           force: true
         };
         var userArgsToPreserve = { // These become part of the state token
           goaid: tempId,
           goaphase: 'fetch', // Directs cGoa to the token exchange phase on callback
           goaname: pockage.packageName
         };
         
         // Store minimal info in cache for cGoa's execute on callback (if this URL were used)
         GoaApp.cachePut(tempId, pockage.packageName, {}, null); // Minimal cache for this manual URL case

         var authUrls = GoaApp.createAuthenticationUrl(pockage, scriptPackage, userArgsToPreserve);
         var authUrl = authUrls.offline; // Or .online, depending on what you need

         Logger.log('BoxOAuth: Authorization URL: ' + authUrl);
         // ... (rest of your logging)
         // (This manual construction is more complex than letting goa.execute() and goa.getConsent() handle it)
      } else {
         // If goa.needsConsent() is true, the consent screen from goa.getConsent() will have the URL.
         var consentHtmlOutput = goa.getConsent();
         var consentHtml = consentHtmlOutput.getContent();
         // Extract URL from HTML (can be fragile) or guide user to trigger .authorize() in a web app.
         Logger.log("BoxOAuth: Consent is needed. The authorization URL is part of the consent screen generated by .authorize() or when doGet/doPost triggers the flow.");
         Logger.log("Run the script in a way that `BoxOAuth.authorize()` can render its HTML, or inspect its output.");
         // A simplified way if you just need to log:
         // Manually call createAuthenticationUrl as shown above.
         // This part is less straightforward with cGoa if you're not in the webapp flow.
         // For a pure "log the URL" cGoa expects you to be in a state where `_needsConsent` is set
         // by the `goa.execute()` method, then `goa.getConsent()` provides the HTML with the link.
      }

      // Simplified approach for logging if not in full web flow:
      // (Requires pockage and callback details to be available on `goa_` or fetched)
      var currentPockage = goa_.fetchPackage();
      if (!currentPockage) { Logger.log("Pockage not loaded for URL."); return; }
      var scriptPckg = {
          callback: goa_.getCallback ? goa_.getCallback() : 'authCallback',
          timeout: goa_.getTimeout ? goa_.getTimeout() : 300,
          offline: true, force: true
      };
      var userArgs = { goaid: Utils.generateUniqueString(), goaphase: 'fetch', goaname: currentPockage.packageName };
      var authUrls = GoaApp.createAuthenticationUrl(currentPockage, scriptPckg, userArgs);
      var finalAuthUrl = authUrls.offline; // Or .online as configured/needed

      Logger.log('');
      Logger.log('================================================================================');
      Logger.log('BOX OAUTH2 AUTHORIZATION REQUIRED (cGoa Style)');
      Logger.log('================================================================================');
      Logger.log('1. Copy this URL and open it in your browser:');
      Logger.log(finalAuthUrl);
      Logger.log('2. Grant permissions...');
      Logger.log('================================================================================');


    } catch (error) {
      Logger.log('BoxOAuth: Error generating authorization URL: ' + error.toString());
    }
  };

  /**
   * Tests the Box API connection.
   * @return {object} Test result.
   */
  ns.testConnection = function() {
    Logger.log('BoxOAuth: Testing Box API connection (cGoa)...');
    var result = { success: false, userInfo: null, error: null };

    var accessToken = ns.getValidAccessToken();
    if (!accessToken) {
      result.error = 'Failed to get access token. Authorize first.';
      Logger.log('❌ BoxOAuth: ' + result.error);
      return result;
    }

    var apiUrl = 'https://api.box.com/2.0/users/me'; // Ensure this is the correct Box API URL
    try {
      var response = UrlFetchApp.fetch(apiUrl, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
      
      var responseCode = response.getResponseCode();
      var responseText = response.getContentText();

      if (responseCode === 200) {
        result.success = true;
        result.userInfo = JSON.parse(responseText);
        Logger.log('✅ BoxOAuth: Connection test successful! User: ' + result.userInfo.name);
      } else {
        result.error = 'API call failed (HTTP ' + responseCode + '): ' + responseText.substring(0,200);
        Logger.log('❌ BoxOAuth: ' + result.error);
      }
    } catch (e) {
      result.error = 'Exception during API call: ' + e.toString();
      Logger.log('❌ BoxOAuth: ' + result.error);
    }
    return result;
  };

  /**
   * Clears stored OAuth tokens for Box.
   */
  ns.clearAuthorization = function() {
    try {
      var goa = getGoaInstance_();
      goa.kill().writePackage(); // Clears token info from the pockage and saves it
      // If you want to remove the entire pockage configuration:
      // goa.remove(); 
      goa_ = null; // Reset the singleton instance to force re-init
      Logger.log('✅ BoxOAuth: Authorization cleared.');
    } catch (error) {
      Logger.log('BoxOAuth: Error clearing authorization: ' + error.toString());
    }
  };
  
  /**
   * Gets comprehensive service status information
   * @returns {object} Detailed status information
   */
  ns.getStatus = function() {
    var status = {
      pockageName: BOX_POCKAGE_NAME,
      hasAccess: false,
      scopes: BOX_SCOPES_, // Intended scopes
      pockageConfigured: false,
      clientIdConfigured: !!SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY),
      timestamp: new Date().toISOString(),
      serviceFileEntry: null,
      pockageDetails: null
    };
    
    try {
      status.serviceFileEntry = Service.pockage.box; // Check if 'box' is in Service.txt
    } catch (e) { /* 'box' not in Service.txt */ }

    try {
      var goa = getGoaInstance_(); // Initializes pockage if needed
      status.pockageDetails = goa.fetchPackage();
      if (status.pockageDetails) {
        status.pockageConfigured = true;
        status.hasAccess = goa.hasToken();
        status.scopes = status.pockageDetails.scopes; // Actual scopes in use
      }
    } catch (error) {
      status.error = error.toString();
    }
    return status;
  };

  return ns;
})();

// --- Global Callback for cGoa ---
// This function MUST be globally accessible for cGoa's redirect.
function authCallback(request) {
  return BoxOAuth.handleAuthCallback(request);
}

// --- Convenience global functions ---
function getValidBoxAccessToken() {
  return BoxOAuth.getValidAccessToken();
}

function showBoxAuthorizationUrl() {
  return BoxOAuth.showAuthorizationUrl();
}

function testBoxAccess() { // Renamed to avoid conflict if you have old test
  return BoxOAuth.testConnection();
}

function clearBoxAuthorizationGoa() {
  return BoxOAuth.clearAuthorization();
}

function getBoxStatusGoa() {
  return BoxOAuth.getStatus();
}

function checkGlobalLibraryAccess() {
  try {
    Logger.log('--- Checking cGoa Library Access ---');
    Logger.log('typeof cGoa: ' + typeof cGoa); // Should be 'object' if library is loaded

    if (typeof cGoa === 'object' && cGoa !== null) {
      Logger.log('typeof cGoa.GoaApp: ' + typeof cGoa.GoaApp);
      if (cGoa.GoaApp && typeof cGoa.GoaApp.createAuthenticationUrl === 'function') {
        Logger.log('cGoa.GoaApp.createAuthenticationUrl seems available.');
      } else {
        Logger.log('cGoa.GoaApp or cGoa.GoaApp.createAuthenticationUrl is MISSING or not a function.');
      }

      Logger.log('typeof cGoa.Utils: ' + typeof cGoa.Utils);
      if (cGoa.Utils && typeof cGoa.Utils.generateUniqueString === 'function') {
        Logger.log('cGoa.Utils.generateUniqueString seems available.');
      } else {
        Logger.log('cGoa.Utils or cGoa.Utils.generateUniqueString is MISSING or not a function.');
      }
    } else {
      Logger.log('cGoa library identifier is not defined or not an object.');
    }

    // If you also use cUseful directly in these test/setup scripts:
    // Logger.log('--- Checking cUseful Library Access ---');
    // Logger.log('typeof cUseful: ' + typeof cUseful);
    // if (typeof cUseful === 'object' && cUseful !== null) {
    //   // Add checks for specific cUseful functions if needed
    //   Logger.log('cUseful library seems available.');
    // } else {
    //   Logger.log('cUseful library identifier is not defined or not an object.');
    // }

  } catch (e) {
    Logger.log('Error during global library access check: ' + e.toString());
  }
}

// Add this function if you don't have it from the previous turn
function inspectLibraryProperties(libraryIdentifier, libraryName) {
  Logger.log('--- Inspecting library: ' + libraryName + ' (Identifier: ' + (libraryIdentifier ? libraryIdentifier.toString() : 'NOT FOUND') + ') ---');
  
  // Check if the libraryIdentifier itself is defined globally
  if (typeof libraryIdentifier === 'undefined') {
    Logger.log(libraryName + ' identifier is not defined in the global scope.');
    return;
  }
  
  if (typeof libraryIdentifier === 'object' && libraryIdentifier !== null) {
    const properties = [];
    for (var key in libraryIdentifier) {
      // For Apps Script libraries, hasOwnProperty might not always be what we want,
      // as properties are often on the prototype or exposed differently.
      // Listing all enumerable keys is generally more informative here.
      properties.push(key + ' (typeof: ' + typeof libraryIdentifier[key] + ')');
    }
    
    if (properties.length > 0) {
      Logger.log('Available properties on ' + libraryName + ':');
      properties.sort().forEach(function(prop) {
        Logger.log('  ' + prop);
      });
    } else {
      Logger.log('No enumerable properties found directly on the ' + libraryName + ' identifier.');
    }
    
    // If we suspect a nested Utils namespace in cUseful
    if (typeof libraryIdentifier.Utils === 'object' && libraryIdentifier.Utils !== null) {
        Logger.log('--- Inspecting ' + libraryName + '.Utils ---');
        const utilsProperties = [];
        for (var utilKey in libraryIdentifier.Utils) {
            utilsProperties.push(utilKey + ' (typeof: ' + typeof libraryIdentifier.Utils[utilKey] + ')');
        }
        if (utilsProperties.length > 0) {
            Logger.log('Available properties on ' + libraryName + '.Utils:');
            utilsProperties.sort().forEach(function(prop) {
                Logger.log('    ' + prop);
            });
        } else {
            Logger.log('No enumerable properties found on ' + libraryName + '.Utils.');
        }
    } else {
        Logger.log(libraryName + '.Utils is typeof: ' + typeof libraryIdentifier.Utils);
    }

  } else {
    Logger.log(libraryName + ' identifier is not an object or is null. Actual type: ' + typeof libraryIdentifier);
  }
}

// Now, run this specifically for cUseful:
function runCUsefulInspection() {
  // First, ensure cUseful is indeed globally available by its identifier
  if (typeof cUseful === 'undefined') {
    Logger.log('ERROR: The identifier "cUseful" is not defined in the global scope. Check your library setup.');
    return;
  }
  inspectLibraryProperties(cUseful, 'cUseful');
}
// Example of how you might trigger authorization from a menu item or doGet
// function showBoxAuthScreen() {
//   var html = BoxOAuth.authorize();
//   if (typeof html !== "string" && html.getContent) { // Check if it's HtmlOutput
//      SpreadsheetApp.getUi().showModalDialog(html, "Box Authorization"); // Or DocumentApp, etc.
//   }
// }