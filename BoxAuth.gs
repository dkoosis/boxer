// File: BoxAuth.gs
// Corrected Box Authentication using cGoa with existing Script Properties

/**
 * Creates and stores the Box package for cGoa using existing credentials
 * Uses your existing Script Properties setup - no hardcoding needed
 */
function createBoxPackage() {
  // Use your existing credential access logic
  const clientId = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY);
  const clientSecret = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY);
  
  if (!clientId || !clientSecret) {
    throw new Error('Box credentials not found in Script Properties. Please set ' + 
                   OAUTH_CLIENT_ID_PROPERTY + ' and ' + OAUTH_CLIENT_SECRET_PROPERTY);
  }
  
  // Following Goa documentation pattern for custom services
  const boxPackage = {
    clientId: clientId,
    clientSecret: clientSecret,
    scopes: ["root_readwrite", "manage_enterprise_properties"],
    service: 'custom', // Must be 'custom' for non-built-in services
    packageName: 'boxService',
    // serviceParameters required for custom services
    serviceParameters: {
      authUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token", 
      refreshUrl: "https://api.box.com/oauth2/token"
    }
  };
  
  // Store the package using the property store
  cGoa.GoaApp.setPackage(SCRIPT_PROPERTIES, boxPackage);
  Logger.log('✅ Box package created using existing Script Properties');
  
  return boxPackage;
}

/**
 * Initialize Box package if it doesn't exist
 * Call this once to set up the cGoa package with your existing credentials
 */
function initializeBoxPackage() {
  try {
    // Try to get existing package
    const existingPackage = cGoa.GoaApp.getPackage(SCRIPT_PROPERTIES, 'boxService');
    
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
 * Get a cGoa instance for Box
 */
function getBoxGoa(e) {
  // Ensure package exists before creating Goa instance
  initializeBoxPackage();
  
  return cGoa.make(
    'boxService',           // packageName 
    SCRIPT_PROPERTIES,      // propertyStore
    e                       // event parameter (can be undefined for server-side calls)
  );
}

/**
 * Get a valid access token for Box API calls
 * This is what your existing code should call
 */
function getValidAccessToken() {
  try {
    const goa = getBoxGoa();
    
    if (!goa.hasToken()) {
      throw new Error('No Box token available. You need to complete OAuth2 authorization first. See initializeBoxAuth()');
    }
    
    return goa.getToken();
  } catch (error) {
    Logger.log('❌ Error getting access token: ' + error.toString());
    throw error;
  }
}

/**
 * Check if Box authentication is ready for your trigger scripts
 * Call this to verify auth status without triggering OAuth flow
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
 * ONE-TIME SETUP: Initialize Box authentication
 * You need to run this ONCE to complete the OAuth2 flow
 */
function initializeBoxAuth() {
  Logger.log('=== Box Authentication Initialization ===');
  
  try {
    // Step 1: Initialize package
    if (!initializeBoxPackage()) {
      return;
    }
    
    // Step 2: Check if already authorized
    if (isBoxAuthReady()) {
      Logger.log('✅ Box authentication already complete!');
      
      // Test the connection
      const testResult = testBoxAccess();
      if (testResult.success) {
        Logger.log('✅ Box API access confirmed');
        Logger.log('👤 User: ' + testResult.user.name);
        Logger.log('🎉 Your trigger scripts are ready to run!');
      }
      return;
    }
    
    // Step 3: Need authorization - show instructions
    Logger.log('❌ Box authorization required');
    Logger.log('');
    Logger.log('📋 TO COMPLETE SETUP:');
    Logger.log('1. Deploy this script as a web app (just for initial auth):');
    Logger.log('   - Go to Deploy → New deployment');
    Logger.log('   - Type: Web app');
    Logger.log('   - Execute as: Me');
    Logger.log('   - Who has access: Anyone');
    Logger.log('   - Click Deploy');
    Logger.log('');
    Logger.log('2. Copy the web app URL and visit it in your browser');
    Logger.log('3. Complete the Box authorization process');
    Logger.log('4. Once authorized, you can undeploy the web app if desired');
    Logger.log('5. Your trigger scripts will then work automatically');
    
    const scriptId = ScriptApp.getScriptId();
    const webAppUrl = `https://script.google.com/macros/s/${scriptId}/exec`;
    Logger.log('');
    Logger.log('🌐 Web App URL will be: ' + webAppUrl);
    
  } catch (error) {
    Logger.log('❌ Error initializing auth: ' + error.toString());
  }
}

/**
 * OAuth callback handler - ONLY needed for initial setup
 * This is the doGet function that handles the OAuth redirect
 */
function doGet(e) {
  try {
    const goa = getBoxGoa(e);
    
    // Check if consent is needed
    if (goa.needsConsent()) {
      Logger.log('🔐 User consent needed - showing consent screen');
      return goa.getConsent();
    }
    
    // Get a token
    const token = goa.getToken();
    
    // Check if we have a token
    if (!goa.hasToken()) {
      throw new Error('Something went wrong with OAuth - no token received');
    }
    
    // Success response
    Logger.log('✅ Box authorization successful!');
    return HtmlService.createHtmlOutput(`
      <div style="font-family: Arial, sans-serif; padding: 20px;">
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
 * Test Box API connection
 */
function testBoxAccess() {
  try {
    const token = getValidAccessToken();
    
    const response = UrlFetchApp.fetch(BOX_API_BASE_URL + '/users/me', {
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
 * Get authorization status for debugging
 */
function getAuthStatus() {
  try {
    const goa = getBoxGoa();
    const packageInfo = goa.getPackage();
    
    return {
      hasToken: goa.hasToken(),
      needsConsent: goa.needsConsent(),
      packageExists: !!packageInfo,
      credentialsSet: !!(SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY) && 
                        SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY))
    };
  } catch (error) {
    return {
      error: error.toString(),
      hasToken: false,
      needsConsent: true,
      packageExists: false,
      credentialsSet: !!(SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY) && 
                        SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY))
    };
  }
}