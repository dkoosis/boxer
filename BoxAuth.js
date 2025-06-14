// File: BoxAuth.js
// Box OAuth2 Authentication Module
// Uses Google's OAuth2 library: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF

/**
 * Get the Box OAuth2 service
 * @returns {OAuth2.Service} The configured Box OAuth2 service
 */
function getBoxService() {
  const clientId = Config.getProperty('BOX_CLIENT_ID');
  const clientSecret = Config.getProperty('BOX_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Box OAuth credentials not found. Run setupBoxer() to configure.');
  }
  
  return OAuth2.createService('Box')
    .setAuthorizationBaseUrl('https://account.box.com/api/oauth2/authorize')
    .setTokenUrl('https://api.box.com/oauth2/token')
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setCallbackFunction('authCallback')
    .setPropertyStore(Config.SCRIPT_PROPERTIES)
    .setScope('root_readwrite')
    .setParam('access_type', 'offline')
    .setParam('approval_prompt', 'force')
    .setTokenHeaders({
      'Authorization': 'Basic ' + Utilities.base64Encode(clientId + ':' + clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded'
    });
}

/**
 * OAuth callback handler
 */
function doGet(e) {
  return HtmlService.createHtmlOutput(
    isBoxAuthReady() ? 
    'Box authorization already complete. You can close this window.' :
    'Visit the authorization URL to complete setup.'
  );
}

/**
 * Handle the OAuth callback
 */
function authCallback(request) {
  const service = getBoxService();
  const isAuthorized = service.handleCallback(request);
  
  if (isAuthorized) {
    // Auto-detect enterprise ID after successful auth
    try {
      const token = service.getAccessToken();
      const response = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/users/me', {
        headers: { 'Authorization': 'Bearer ' + token },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const userData = JSON.parse(response.getContentText());
        if (userData.enterprise && userData.enterprise.id && !Config.getProperty('BOX_ENTERPRISE_ID')) {
          Config.setProperty('BOX_ENTERPRISE_ID', userData.enterprise.id);
          Logger.log('✅ Auto-detected Box Enterprise ID: ' + userData.enterprise.id);
        }
      }
    } catch (e) {
      Logger.log('Could not auto-detect enterprise ID: ' + e.toString());
    }
    
    return HtmlService.createHtmlOutput(`
      <div style="font-family: Arial, sans-serif; padding: 20px; max-width: 600px;">
        <h2>✅ Box Authorization Complete!</h2>
        <p>Your Apps Script now has access to Box.</p>
        <p>You can close this window and return to Apps Script.</p>
      </div>
    `);
  } else {
    return HtmlService.createHtmlOutput(`
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>❌ Authorization Failed</h2>
        <p>Box authorization was denied or failed.</p>
      </div>
    `);
  }
}

/**
 * Get a valid Box access token, refreshing if needed
 * @returns {string} Valid access token
 */
function getValidAccessToken() {
  const service = getBoxService();
  
  if (!service.hasAccess()) {
    throw new Error('Box authorization required. Run initializeBoxAuth() for setup instructions.');
  }
  
  return service.getAccessToken();
}

/**
 * Check if Box authentication is ready
 * @returns {boolean} True if authenticated
 */
function isBoxAuthReady() {
  try {
    return getBoxService().hasAccess();
  } catch (error) {
    return false;
  }
}

/**
 * Initialize Box authentication
 */
function initializeBoxAuth() {
  Logger.log('=== Box Authentication Setup ===');
  
  const service = getBoxService();
  
  if (service.hasAccess()) {
    Logger.log('✅ Box authentication already complete!');
    testBoxAccess();
    return;
  }
  
  const authorizationUrl = service.getAuthorizationUrl();
  
  Logger.log('📋 TO COMPLETE SETUP:');
  Logger.log('1. Visit this URL to authorize:');
  Logger.log('   ' + authorizationUrl);
  Logger.log('');
  Logger.log('2. Complete the Box authorization');
  Logger.log('3. Your scripts will then work automatically');
}

/**
 * Test Box API connection
 */
function testBoxAccess() {
  try {
    const token = getValidAccessToken();
    const response = UrlFetchApp.fetch(Config.BOX_API_BASE_URL + '/users/me', {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const user = JSON.parse(response.getContentText());
      Logger.log('✅ Box connection successful!');
      Logger.log('👤 User: ' + user.name + ' (' + user.login + ')');
      return { success: true, user: user };
    } else {
      Logger.log('❌ Box API error: ' + response.getResponseCode());
      return { success: false, error: 'HTTP ' + response.getResponseCode() };
    }
  } catch (error) {
    Logger.log('❌ Box connection error: ' + error.toString());
    return { success: false, error: error.toString() };
  }
}

/**
 * Clear Box authorization (for troubleshooting)
 */
function clearBoxAuth() {
  getBoxService().reset();
  Logger.log('Box authorization cleared');
}