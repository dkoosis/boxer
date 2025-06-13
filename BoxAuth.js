// File: BoxAuth.gs
// Box Authentication using Bruce McPherson's cGoa library
// FIXED VERSION - Auto-detects correct redirect URI
// Depends on: Config.gs, cGoa library (by Bruce McPherson)

/**
 * Creates and stores the Box package for cGoa using existing credentials from Script Properties.
 * ENHANCED: Automatically detects the correct redirect URI for deployed web apps.
 */
function createBoxPackage() {
  const clientId = Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_ID_PROPERTY);
  const clientSecret = Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY);

  if (!clientId || !clientSecret) {
    throw new Error('Box credentials not found in Script Properties. Please set ' +
                   Config.BOX_OAUTH_CLIENT_ID_PROPERTY + ' and ' + Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY);
  }

  // Ensure OAuthServices.pockage and its 'box' definition are available
  if (typeof OAuthServices === 'undefined' || !OAuthServices.pockage || !OAuthServices.pockage.box) {
    throw new Error('OAuthServices.pockage.box definition is not available. Ensure OAuthServices.js is loaded before BoxAuth.js and defines the "box" service.');
  }
  const boxServiceEndpoints = OAuthServices.pockage.box;

  // AUTO-DETECT the correct redirect URI
  let redirectUri;
  try {
    // Try to get the deployed web app URL
    redirectUri = ScriptApp.getService().getUrl();
    if (redirectUri) {
      // Convert /exec to /usercallback for OAuth
      redirectUri = redirectUri.replace('/exec', '/usercallback');
      Logger.log('✅ Auto-detected redirect URI: ' + redirectUri);
    }
  } catch (e) {
    Logger.log('⚠️ Could not auto-detect redirect URI: ' + e.toString());
  }

  const boxPackage = {
    clientId: clientId,
    clientSecret: clientSecret,
    scopes: ["root_readwrite", "manage_enterprise_properties"],
    service: 'custom',
    packageName: 'boxService',
    serviceParameters: {
      authUrl: boxServiceEndpoints.authUrl,
      tokenUrl: boxServiceEndpoints.tokenUrl,
      refreshUrl: boxServiceEndpoints.refreshUrl
    }
  };

  // Add redirect URI if we detected one
  if (redirectUri) {
    boxPackage.redirectUri = redirectUri;
    Logger.log('📍 Using redirect URI: ' + redirectUri);
  }

  cGoa.GoaApp.setPackage(Config.SCRIPT_PROPERTIES, boxPackage);
  Logger.log('✅ Box package created with auto-detected redirect URI');

  return boxPackage;
}

/**
 * Initialize Box package if it doesn't exist.
 */
function initializeBoxPackage() {
  try {
    const existingPackage = cGoa.GoaApp.getPackage(Config.SCRIPT_PROPERTIES, 'boxService');
    
    if (!existingPackage) {
      Logger.log('No existing Box package found, creating new one...');
      createBoxPackage();
      Logger.log('ℹ️ Box package initialized successfully');
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
 * ENHANCED: Automatically sets correct redirect URI if needed.
 */
function getBoxGoa(e) {
  initializeBoxPackage();
  
  const goa = cGoa.make(
    'boxService',           
    Config.SCRIPT_PROPERTIES,      
    e                       
  );

  // ENHANCEMENT: Log redirect URI info for debugging
  if (e && typeof ScriptApp.getService === 'function') {
    try {
      const webAppUrl = ScriptApp.getService().getUrl();
      if (webAppUrl) {
        const correctRedirectUri = webAppUrl.replace('/exec', '/usercallback');
        Logger.log('📍 Expected redirect URI: ' + correctRedirectUri);
        
        // Note: cGoa handles redirect URI internally, we don't need to set it manually
        // unless there's a specific issue
      }
    } catch (error) {
      Logger.log('⚠️ Could not check redirect URI: ' + error.toString());
    }
  }

  return goa;
}

/**
 * OAuth callback handler for initial setup.
 * ENHANCED: Better error handling and debugging info.
 */
/**
 * OAuth callback handler for initial setup.
 * FIXED: Forces the correct redirect URI to prevent /d/ vs /s/ issues
 */
function doGet(e) {
  try {
    Logger.log('🌐 OAuth callback received');
    Logger.log('📋 Event parameters: ' + JSON.stringify(e.parameter || {}));
    
    const goa = getBoxGoa(e);
    
    // CRITICAL FIX: Force the correct deployed redirect URI
    const correctRedirectUri = 'https://script.google.com/macros/s/AKfycbzi5i7r-wtnMeLAiDIPVqM6VaIR_B45DRrvqS82SUYQoypsGj15eGDI8D50Z50ttHm2/usercallback';
    
    Logger.log('🔧 Forcing correct redirect URI: ' + correctRedirectUri);
    
    // Force the redirect URI (this overrides whatever cGoa auto-detects)
    try {
      // Method 1: Try setRedirectUri if it exists
      if (typeof goa.setRedirectUri === 'function') {
        goa.setRedirectUri(correctRedirectUri);
        Logger.log('✅ Set redirect URI via setRedirectUri()');
      } else {
        // Method 2: Update the package directly
        const packageInfo = goa.getPackage();
        packageInfo.redirectUri = correctRedirectUri;
        cGoa.GoaApp.setPackage(Config.SCRIPT_PROPERTIES, packageInfo);
        Logger.log('✅ Set redirect URI via package update');
        
        // Get a fresh goa instance with the updated package
        const updatedGoa = getBoxGoa(e);
        
        if (updatedGoa.needsConsent()) {
          Logger.log('🔐 User consent needed - showing consent screen with correct URI');
          return updatedGoa.getConsent();
        }
        
        const token = updatedGoa.getToken();
        
        if (!updatedGoa.hasToken()) {
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
      }
    } catch (redirectError) {
      Logger.log('⚠️ Could not set redirect URI: ' + redirectError.toString());
    }
    
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
        <p><strong>Debug Info:</strong></p>
        <ul>
          <li>Error: ${error.toString()}</li>
          <li>Timestamp: ${new Date().toISOString()}</li>
          <li>Script ID: ${ScriptApp.getScriptId()}</li>
        </ul>
        <p>Please check the Apps Script logs and try again.</p>
        <p><em>Tip: Try visiting this URL in an incognito window.</em></p>
      </div>
    `);
  }
}
/**
 * DIAGNOSTIC: Check what redirect URIs are being used
 */
function debugRedirectUris() {
  Logger.log('=== 🔍 Redirect URI Diagnostic ===');
  
  try {
    // Check what Apps Script thinks the web app URL is
    const webAppUrl = ScriptApp.getService().getUrl();
    Logger.log('📍 Apps Script web app URL: ' + webAppUrl);
    
    const expectedRedirectUri = webAppUrl ? webAppUrl.replace('/exec', '/usercallback') : 'Could not detect';
    Logger.log('📍 Expected redirect URI: ' + expectedRedirectUri);
    
    // Check what cGoa thinks
    try {
      const goa = getBoxGoa();
      const cgoaRedirectUri = goa.getRedirectUri();
      Logger.log('📍 cGoa redirect URI: ' + cgoaRedirectUri);
      
      const match = expectedRedirectUri === cgoaRedirectUri;
      Logger.log('🎯 URIs match: ' + (match ? '✅ YES' : '❌ NO'));
      
      if (!match) {
        Logger.log('');
        Logger.log('🔧 SOLUTION: The redirect URIs don\'t match!');
        Logger.log('   1. Go to Box Developer Console');
        Logger.log('   2. Update your app\'s redirect URI to: ' + expectedRedirectUri);
        Logger.log('   3. Or run fixRedirectUri() to force the correct one');
      }
      
    } catch (error) {
      Logger.log('❌ Could not get cGoa redirect URI: ' + error.toString());
    }
    
  } catch (error) {
    Logger.log('❌ Diagnostic failed: ' + error.toString());
  }
}

/**
 * DIAGNOSTIC: Reset the Box package and recreate it
 */
function resetBoxPackage() {
  Logger.log('🔄 Safely resetting Box package (preserving credentials)...');
  
  try {
    // Check deployment first
    const webAppUrl = ScriptApp.getService().getUrl();
    
    if (!webAppUrl || webAppUrl.includes('/dev')) {
      Logger.log('❌ Cannot reset - need proper web app deployment first');
      Logger.log('🔧 Deploy as web app first, then run this function');
      return;
    }
    
    // Only clear cGoa-specific properties, NOT credentials
    const properties = Config.SCRIPT_PROPERTIES;
    const existingKeys = properties.getKeys();
    
    let clearedCount = 0;
    existingKeys.forEach(function(key) {
      // Only clear cGoa/OAuth package data, NOT the credentials themselves
      if (key.includes('EzyOauth2') || 
          key.startsWith('cGoa') || 
          key.includes('GoaApp') ||
          (key.includes('boxService') && !key.includes('CLIENT'))) {
        properties.deleteProperty(key);
        Logger.log('🗑️ Cleared: ' + key);
        clearedCount++;
      }
    });
    
    Logger.log('🗑️ Cleared ' + clearedCount + ' cGoa properties (credentials preserved)');
    
    // Check that credentials still exist
    const clientId = properties.getProperty('BOX_OAUTH_CLIENT_ID');
    const clientSecret = properties.getProperty('BOX_OAUTH_CLIENT_SECRET');
    
    if (!clientId || !clientSecret) {
      Logger.log('❌ Box credentials missing! Add them to Script Properties:');
      Logger.log('   BOX_OAUTH_CLIENT_ID = [your client ID]');
      Logger.log('   BOX_OAUTH_CLIENT_SECRET = [your client secret]');
      return;
    }
    
    Logger.log('✅ Credentials verified');
    
    // Recreate the package with correct redirect URI
    const redirectUri = webAppUrl.replace('/exec', '/usercallback');
    Logger.log('📍 Creating package with redirect URI: ' + redirectUri);
    
    createBoxPackage();
    
    Logger.log('✅ Box package safely reset and recreated');
    Logger.log('');
    Logger.log('🔧 NEXT STEPS:');
    Logger.log('   1. Update Box Developer Console redirect URI to: ' + redirectUri);
    Logger.log('   2. Visit: ' + webAppUrl);
    Logger.log('   3. Complete authorization');
    
  } catch (error) {
    Logger.log('❌ Safe reset failed: ' + error.toString());
  }
}

/**
 * Quick check - do we have the basic requirements?
 */
function checkCredentials() {
  Logger.log('=== 🔍 Credential Check ===');
  
  const properties = Config.SCRIPT_PROPERTIES;
  const clientId = properties.getProperty('BOX_OAUTH_CLIENT_ID');
  const clientSecret = properties.getProperty('BOX_OAUTH_CLIENT_SECRET');
  
  if (clientId && clientSecret) {
    Logger.log('✅ Box credentials found');
    Logger.log('   Client ID: ' + clientId.substring(0, 10) + '...');
    Logger.log('   Secret: ' + clientSecret.substring(0, 10) + '...');
    
    const webAppUrl = ScriptApp.getService().getUrl();
    if (webAppUrl && !webAppUrl.includes('/dev')) {
      Logger.log('✅ Web app properly deployed');
      Logger.log('🎯 Ready to create Box package!');
      return true;
    } else {
      Logger.log('❌ Web app deployment issue');
      return false;
    }
  } else {
    Logger.log('❌ Missing Box credentials');
    Logger.log('🔧 Add to Script Properties:');
    Logger.log('   BOX_OAUTH_CLIENT_ID = [your client ID]');
    Logger.log('   BOX_OAUTH_CLIENT_SECRET = [your client secret]');
    return false;
  }
}

/**
 * SIMPLE FIX: Force recreate the Box package
 * Use this if you're having redirect URI issues
 */
function fixBoxPackage() {
  Logger.log('🔧 Recreating Box package...');
  
  try {
    // Check if we have a proper deployment
    const webAppUrl = ScriptApp.getService().getUrl();
    if (!webAppUrl || webAppUrl.includes('/dev')) {
      Logger.log('❌ Cannot fix - need proper web app deployment first');
      Logger.log('🔧 Deploy as web app first');
      return;
    }
    
    // Clear and recreate
    resetBoxPackage();
    
  } catch (error) {
    Logger.log('❌ Fix failed: ' + error.toString());
  }
}

/**
 * Get a valid access token for Box API calls.
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
 * Test Box API connection with current token.
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
 */
function getAuthStatus() {
  try {
    const goa = getBoxGoa();
    const packageInfo = goa.getPackage();
    
    return {
      hasToken: goa.hasToken(),
      needsConsent: goa.needsConsent(),
      packageExists: !!packageInfo,
      credentialsSet: !!(Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_ID_PROPERTY) && 
                        Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY))
    };
  } catch (error) {
    return {
      error: error.toString(),
      hasToken: false,
      needsConsent: true,
      packageExists: false,
      credentialsSet: !!(Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_ID_PROPERTY) && 
                        Config.SCRIPT_PROPERTIES.getProperty(Config.BOX_OAUTH_CLIENT_SECRET_PROPERTY))
    };
  }
}