// File: BoxAuth.gs
// Box Authentication using Bruce McPherson's cGoa library
// Depends on: Config.gs, cGoa library (by Bruce McPherson)

/**
 * Creates and stores the Box package for cGoa using existing credentials from Script Properties.
 * Uses Bruce McPherson's cGoa library for robust OAuth2 handling.
 * @returns {object} The created Box package configuration
 */
// In BoxAuth.js

/**
 * Creates and stores the Box package for cGoa using existing credentials from Script Properties.
 * It now sources its service endpoint URLs from the global OAuthServices.pockage.
 * Uses Bruce McPherson's cGoa library for robust OAuth2 handling.
 * @returns {object} The created Box package configuration
 */
function createBoxPackage() {
  const clientId = Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_ID_PROPERTY);
  const clientSecret = Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_SECRET_PROPERTY);

  if (!clientId || !clientSecret) {
    throw new Error('Box credentials not found in Script Properties. Please set ' +
                   Config.OAUTH_CLIENT_ID_PROPERTY + ' and ' + Config.OAUTH_CLIENT_SECRET_PROPERTY);
  }

  // Ensure OAuthServices.pockage and its 'box' definition are available
  if (typeof OAuthServices === 'undefined' || !OAuthServices.pockage || !OAuthServices.pockage.box) {
    throw new Error('OAuthServices.pockage.box definition is not available. Ensure OAuthServices.js is loaded before BoxAuth.js and defines the "box" service.');
  }
  const boxServiceEndpoints = OAuthServices.pockage.box;

  const boxPackage = {
    clientId: clientId,
    clientSecret: clientSecret,
    scopes: ["root_readwrite", "manage_enterprise_properties"],
    service: 'custom', // We keep 'custom' because we are providing all params to cGoa.
                       // cGoa uses these directly when service is 'custom'.
    packageName: 'boxService',
    serviceParameters: { // These URLs are now sourced from OAuthServices.js
      authUrl: boxServiceEndpoints.authUrl,
      tokenUrl: boxServiceEndpoints.tokenUrl,
      refreshUrl: boxServiceEndpoints.refreshUrl
      // If OAuthServices.pockage.box also defined 'basic' or other params cGoa respects
      // under serviceParameters for a 'custom' type, you could add them here too.
      // For instance, if 'basic' was relevant:
      // basic: boxServiceEndpoints.basic
    }
  };

  cGoa.GoaApp.setPackage(Config.SCRIPT_PROPERTIES, boxPackage);
  Logger.log('✅ Box package created using credentials from Script Properties and service URLs from OAuthServices.js');

  return boxPackage;
}

/**
 * Initialize Box package if it doesn't exist.
 * Call this once to set up the cGoa package with your existing credentials.
 * @returns {boolean} True if successful, false otherwise
 */
function initializeBoxPackage() {
  try {
    const existingPackage = cGoa.GoaApp.getPackage(Config.SCRIPT_PROPERTIES, 'boxService');
    
    if (!existingPackage) {
      Logger.log('No existing Box package found, creating new one...');
      createBoxPackage();
      Logger.log('✅ Box package initialized successfully');
    } else {
      Logger.log('✅ Box package already exists');
    }
    
    return true;
  } catch (error) {
    Logger.log('❌ Error initializing Box package: ' + error.toString());
    return false;
  }
}

/**
 * Get a cGoa instance for Box operations.
 * @param {object} e Event parameter (can be undefined for server-side calls)
 * @returns {object} cGoa instance for Box
 */
function getBoxGoa(e) {
  initializeBoxPackage();
  
  return cGoa.make(
    'boxService',           
    Config.SCRIPT_PROPERTIES,      
    e                       
  );
}

/**
 * Get a valid access token for Box API calls.
 * This is the main function your processing scripts should use.
 * @returns {string} Valid Box access token
 * @throws {Error} If no token available or OAuth not complete
 */
function getValidAccessToken() {
  try {
    const goa = getBoxGoa();
    
    if (!goa.hasToken()) {
      throw new Error('No Box token available. Complete OAuth2 authorization first. Run initializeBoxAuth() for setup instructions.');
    }
    
    return goa.getToken();
  } catch (error) {
    Logger.log('❌ Error getting access token: ' + error.toString());
    throw error;
  }
}

/**
 * Check if Box authentication is ready for automated scripts.
 * @returns {boolean} True if token available, false otherwise
 */
function isBoxAuthReady() {
  try {
    const goa = getBoxGoa();
    return goa.hasToken();
  } catch (error) {
    Logger.log('❌ Error checking auth status: ' + error.toString());
    return false;
  }
}

/**
 * ONE-TIME SETUP: Initialize Box authentication.
 * Run this once to complete the OAuth2 flow, then you can undeploy the web app.
 */
function initializeBoxAuth() {
  Logger.log('=== Box Authentication Initialization ===');
  
  try {
    if (!initializeBoxPackage()) {
      return;
    }
    
    if (isBoxAuthReady()) {
      Logger.log('✅ Box authentication already complete!');
      
      const testResult = testBoxAccess();
      if (testResult.success) {
        Logger.log('✅ Box API access confirmed');
        Logger.log('👤 User: ' + testResult.user.name);
        Logger.log('🎉 Your trigger scripts are ready to run!');
      }
      return;
    }
    
    Logger.log('❌ Box authorization required');
    Logger.log('');
    Logger.log('📋 TO COMPLETE SETUP:');
    Logger.log('1. Deploy this script as a web app (temporarily):');
    Logger.log('   - Go to Deploy → New deployment');
    Logger.log('   - Type: Web app');
    Logger.log('   - Execute as: Me');
    Logger.log('   - Who has access: Anyone');
    Logger.log('   - Click Deploy');
    Logger.log('');
    Logger.log('2. Visit the web app URL and complete Box authorization');
    Logger.log('3. Once authorized, you can undeploy the web app');
    Logger.log('4. Your trigger scripts will then work automatically');
    
    const scriptId = ScriptApp.getScriptId();
    const webAppUrl = `https://script.google.com/macros/s/${scriptId}/exec`;
    Logger.log('');
    Logger.log('🌐 Web App URL will be: ' + webAppUrl);
    
  } catch (error) {
    Logger.log('❌ Error initializing auth: ' + error.toString());
  }
}

/**
 * OAuth callback handler for initial setup.
 * This handles the OAuth redirect when you visit the web app URL.
 * @param {object} e Event object from web app request
 * @returns {HtmlOutput} HTML response for the user
 */
function doGet(e) {
  try {
    const goa = getBoxGoa(e);
    
    if (goa.needsConsent()) {
      Logger.log('🔐 User consent needed - showing consent screen');
      return goa.getConsent();
    }
    
    const token = goa.getToken();
    
    if (!goa.hasToken()) {
      throw new Error('OAuth flow completed but no token received');
    }
    
    Logger.log('✅ Box authorization successful!');
    return HtmlService.createHtmlOutput(`
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2>✅ Box Authorization Complete!</h2>
        <p>Your Apps Script now has access to Box.</p>
        <p><strong>Setup Complete!</strong> You can now:</p>
        <ul>
          <li>Close this browser tab</li>
          <li>Return to Apps Script</li>
          <li>Undeploy the web app if desired (auth is saved)</li>
          <li>Your trigger scripts will now work automatically</li>
        </ul>
        <p><em>Token preview: ${token.substring(0, 20)}...</em></p>
        <hr>
        <small>Powered by <a href="https://github.com/brucemcpherson" target="_blank">Bruce McPherson's cGoa library</a></small>
      </div>
    `);
    
  } catch (error) {
    Logger.log('❌ Error in OAuth callback: ' + error.toString());
    return HtmlService.createHtmlOutput(`
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>❌ Authorization Error</h2>
        <p>Error: ${error.message}</p>
        <p>Please check the Apps Script logs and try again.</p>
      </div>
    `);
  }
}

/**
 * Test Box API connection with current token.
 * @returns {object} Test result with success status and user info
 */
function testBoxAccess() {
  try {
    const token = getValidAccessToken();
    
    const response = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/users/me', {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    const responseCode = response.getResponseCode();
    if (responseCode === 200) {
      const user = JSON.parse(response.getContentText());
      Logger.log('✅ Box connection successful!');
      Logger.log('👤 User: ' + user.name + ' (' + user.login + ')');
      return { success: true, user: user };
    } else {
      Logger.log('❌ Box API error: ' + responseCode);
      Logger.log('Response: ' + response.getContentText());
      return { success: false, error: 'HTTP ' + responseCode };
    }
  } catch (error) {
    Logger.log('❌ Box connection error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Get detailed authorization status for debugging.
 * @returns {object} Status object with auth details
 */
function getAuthStatus() {
  try {
    const goa = getBoxGoa();
    const packageInfo = goa.getPackage();
    
    return {
      hasToken: goa.hasToken(),
      needsConsent: goa.needsConsent(),
      packageExists: !!packageInfo,
      credentialsSet: !!(Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_ID_PROPERTY) && 
                        Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_SECRET_PROPERTY))
    };
  } catch (error) {
    return {
      error: error.toString(),
      hasToken: false,
      needsConsent: true,
      packageExists: false,
      credentialsSet: !!(Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_ID_PROPERTY) && 
                        Config.SCRIPT_PROPERTIES.getProperty(Config.OAUTH_CLIENT_SECRET_PROPERTY))
    };
  }
}