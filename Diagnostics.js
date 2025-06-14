/**
 * Diagnostics for Box OAuth2 Authentication
 */

/**
 * Run comprehensive diagnostics
 */
function runDiagnostics() {
  Logger.log('=== 🔧 Box OAuth2 Diagnostics ===');
  Logger.log('Timestamp: ' + new Date().toISOString());
  
  // Test 1: Check OAuth2 library
  Logger.log('\n1. Checking OAuth2 library...');
  try {
    if (typeof OAuth2 === 'undefined') {
      Logger.log('❌ OAuth2 library not found');
      Logger.log('   Add library: 1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF');
    } else {
      Logger.log('✅ OAuth2 library loaded');
    }
  } catch (e) {
    Logger.log('❌ OAuth2 library error: ' + e.toString());
  }
  
  // Test 2: Check credentials
  Logger.log('\n2. Checking Box credentials...');
  const clientId = Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_ID_PROPERTY);
  const clientSecret = Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY);
  
  if (!clientId || !clientSecret) {
    Logger.log('❌ Box credentials not found in Script Properties');
    Logger.log('   Set ' + Config.BOX_OAUTH_CLIENT_ID_PROPERTY + ' and ' + Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY);
  } else {
    Logger.log('✅ Box credentials found');
    Logger.log('   Client ID: ' + clientId.substring(0, 10) + '...');
  }
  
  // Test 3: Check service configuration
  Logger.log('\n3. Checking OAuth2 service...');
  try {
    const service = getBoxService();
    Logger.log('✅ Box service created successfully');
    
    // Test 4: Check authorization status
    Logger.log('\n4. Checking authorization status...');
    if (service.hasAccess()) {
      Logger.log('✅ Valid token found');
      
      // Test 5: Test actual Box API call
      Logger.log('\n5. Testing Box API connection...');
      const result = testBoxAccess();
      if (result.success) {
        Logger.log('✅ API test successful');
      } else {
        Logger.log('❌ API test failed: ' + result.error);
      }
    } else {
      Logger.log('❌ Not authorized - need to complete OAuth flow');
      Logger.log('   Run initializeBoxAuth() to get authorization URL');
    }
    
    // Show service URLs
    Logger.log('\n📍 Service URLs:');
    Logger.log('   Authorization URL: https://account.box.com/api/oauth2/authorize');
    Logger.log('   Token URL: https://api.box.com/oauth2/token');
    Logger.log('   Callback Function: authCallback');
    
  } catch (error) {
    Logger.log('❌ Service error: ' + error.toString());
  }
  
  Logger.log('\n=== Diagnostics Complete ===');
}

/**
 * Get detailed authorization status
 */
function getAuthStatus() {
  try {
    const service = getBoxService();
    return {
      hasAccess: service.hasAccess(),
      serviceName: service.serviceName_,
      credentialsSet: !!(Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_ID_PROPERTY) && 
                        Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY))
    };
  } catch (error) {
    return {
      error: error.toString(),
      hasAccess: false,
      credentialsSet: !!(Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_ID_PROPERTY) && 
                        Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY))
    };
  }
}

/**
 * Debug token information
 */
function debugToken() {
  Logger.log('=== 🔍 Token Debug ===');
  
  try {
    const service = getBoxService();
    
    if (!service.hasAccess()) {
      Logger.log('❌ No valid token found');
      Logger.log('   Run initializeBoxAuth() to authorize');
      return;
    }
    
    const token = service.getAccessToken();
    Logger.log('✅ Token found');
    Logger.log('   Token preview: ' + token.substring(0, 20) + '...');
    Logger.log('   Token length: ' + token.length);
    
    // Check token with Box API
    const response = UrlFetchApp.fetch('https://api.box.com/2.0/users/me', {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    Logger.log('   API Response: ' + response.getResponseCode());
    
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
  }
}

/**
 * Show authorization URL for manual testing
 */
function showAuthUrl() {
  const service = getBoxService();
  const authUrl = service.getAuthorizationUrl();
  Logger.log('🔗 Authorization URL:');
  Logger.log(authUrl);
  return authUrl;
}

function testReportsFolder() {
  const token = getValidAccessToken();
  const response = UrlFetchApp.fetch('https://api.box.com/2.0/folders/196526595372', {
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  });
  Logger.log('Status: ' + response.getResponseCode());
  if (response.getResponseCode() === 200) {
    const folder = JSON.parse(response.getContentText());
    Logger.log('Folder: ' + folder.name);
    Logger.log('Contains ' + folder.item_collection.total_count + ' items');
  }
}