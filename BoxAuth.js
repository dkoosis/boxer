// File: BoxAuth.js
// Box OAuth2 Authentication Module
// Uses Google's OAuth2 library: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF

/**
 * Get the Box OAuth2 service
 */
function getBoxService() {
  const clientId = ConfigManager.getProperty('BOX_CLIENT_ID');
  const clientSecret = ConfigManager.getProperty('BOX_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Box OAuth credentials not found. Run BoxerApp.setup() to configure.');
  }
  
  return OAuth2.createService('Box')
    .setAuthorizationBaseUrl('https://account.box.com/api/oauth2/authorize')
    .setTokenUrl('https://api.box.com/oauth2/token')
    .setClientId(clientId)
    .setClientSecret(clientSecret)
    .setCallbackFunction('authCallback')
    .setPropertyStore(ConfigManager.SCRIPT_PROPERTIES)
    .setScope('root_readwrite')
    .setParam('access_type', 'offline')
    .setParam('approval_prompt', 'force')
    .setTokenHeaders({
      'Authorization': `Basic ${Utilities.base64Encode(`${clientId}:${clientSecret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    });
}

/**
 * OAuth callback handler
 * NOTE: This function now uses an HTML file for the output.
 * Please ensure you have created "AuthSuccess.html" in your project.
 */
function doGet(e) {
  // This function is still useful for testing the deployed web app URL.
  return HtmlService.createHtmlOutput(
    isBoxAuthReady() ? 
    'Box authorization is already complete. You can close this window.' :
    'This is the Boxer authorization endpoint. Please follow the authorization URL from the script logs to complete setup.'
  );
}

/**
 * Handle the OAuth callback.
 * NOTE: This function now uses HTML files for output.
 * Please ensure you have created "AuthSuccess.html" and "AuthFailure.html".
 */
function authCallback(request) {
  const service = getBoxService();
  const isAuthorized = service.handleCallback(request);
  
  if (isAuthorized) {
    // Auto-detect enterprise ID after successful auth
    try {
      const token = service.getAccessToken();
      const response = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/users/me`, {
        headers: { 'Authorization': `Bearer ${token}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() === 200) {
        const userData = JSON.parse(response.getContentText());
        if (userData.enterprise && userData.enterprise.id && !ConfigManager.getProperty('BOX_ENTERPRISE_ID')) {
          ConfigManager.setProperty('BOX_ENTERPRISE_ID', userData.enterprise.id);
          Logger.log(`✅ Auto-detected Box Enterprise ID: ${userData.enterprise.id}`);
        }
      }
    } catch (e) {
      Logger.log(`Could not auto-detect enterprise ID: ${e.toString()}`);
    }
    
    return HtmlService.createHtmlOutputFromFile('AuthSuccess');
  } else {
    return HtmlService.createHtmlOutputFromFile('AuthFailure');
  }
}

/**
 * Get a valid Box access token, refreshing if needed
 */
function getValidAccessToken() {
  const service = getBoxService();
  
  if (!service.hasAccess()) {
    throw new Error('Box authorization required. Run BoxerApp.initializeBoxAuth() for setup instructions.');
  }
  
  return service.getAccessToken();
}

/**
 * Check if Box authentication is ready
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
  Logger.log(`   ${authorizationUrl}`);
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
    const response = UrlFetchApp.fetch(`${ConfigManager.BOX_API_BASE_URL}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const user = JSON.parse(response.getContentText());
      Logger.log('✅ Box connection successful!');
      Logger.log(`👤 User: ${user.name} (${user.login})`);
      return { success: true, user };
    } else {
      Logger.log(`❌ Box API error: ${response.getResponseCode()}`);
      return { success: false, error: `HTTP ${response.getResponseCode()}` };
    }
  } catch (error) {
    Logger.log(`❌ Box connection error: ${error.toString()}`);
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