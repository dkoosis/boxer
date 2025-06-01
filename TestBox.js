/**
 * @file TestBox.gs
 * @description Simple test functions for BoxOAuth.gs using cGoa.
 */

// --- Configuration for Testing ---
// Ensure these Script Property names match what's in your BoxOAuth.gs
const TEST_BOX_CLIENT_ID_PROPERTY = 'BOX_CLIENT_ID';
const TEST_BOX_CLIENT_SECRET_PROPERTY = 'BOX_CLIENT_SECRET';

/**
 * SETUP STEP 1: Run this function once to ensure your Box Client ID and Secret
 * are stored in Script Properties.
 *
 * REPLACE 'YOUR_BOX_CLIENT_ID' and 'YOUR_BOX_CLIENT_SECRET' with your actual credentials.
 */
// In TestBox.gs

/**
 * SETUP STEP 1: Run this function once to ensure your Box Client ID and Secret
 * are stored in Script Properties.
 *
 * REPLACE 'YOUR_BOX_CLIENT_ID' and 'YOUR_BOX_CLIENT_SECRET' with your actual credentials.
 */
function setupBoxCredentialsForTest() {
  const scriptProperties = PropertiesService.getScriptProperties();
  
  const clientId = 'YOUR_BOX_CLIENT_ID'; // <--- REPLACE THIS
  const clientSecret = 'YOUR_BOX_CLIENT_SECRET'; // <--- REPLACE THIS

  if (clientId === 'YOUR_BOX_CLIENT_ID' || clientSecret === 'YOUR_BOX_CLIENT_SECRET') {
    Logger.log('ERROR: Please replace placeholder credentials in setupBoxCredentialsForTest() before running.');
    // Since it's a standalone script, an error in the logs is the main feedback here.
    // You could throw an error to halt execution if desired:
    // throw new Error('Placeholder credentials not replaced in setupBoxCredentialsForTest.');
    return;
  }
  
  scriptProperties.setProperty(TEST_BOX_CLIENT_ID_PROPERTY, clientId);
  scriptProperties.setProperty(TEST_BOX_CLIENT_SECRET_PROPERTY, clientSecret);
  
  Logger.log('Box Client ID and Secret have been set in Script Properties.');
  Logger.log('Property "' + TEST_BOX_CLIENT_ID_PROPERTY + '" set.');
  Logger.log('Property "' + TEST_BOX_CLIENT_SECRET_PROPERTY + '" set.');
  Logger.log('You can now proceed with testing.');
}
/**
 * TEST STEP 1: Get and log the Box Authorization URL.
 * Copy the URL from the logs, paste it into your browser, and authorize the application.
 * You will be redirected to a URL ending in /usercallback. This is expected.
 */
function test_1_ShowBoxAuthorizationUrl() {
  Logger.log('Attempting to get Box Authorization URL...');
  try {
    // This function is defined in your BoxOAuth.gs
    BoxOAuth.showAuthorizationUrl(); 
    Logger.log('Check the logs above for the Authorization URL. Open it in a browser to authorize.');
    Logger.log('After authorizing, you will be redirected. Then run test_2_TestBoxConnection().');
  } catch (e) {
    Logger.log('Error in test_1_ShowBoxAuthorizationUrl: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
  }
}

/**
 * TEST STEP 2: Test the connection to Box.
 * Run this AFTER you have successfully authorized via the URL from test_1.
 */
function test_2_TestBoxConnection() {
  Logger.log('Attempting to test Box connection...');
  try {
    // This function is defined in your BoxOAuth.gs
    const result = BoxOAuth.testConnection(); 
    
    if (result) {
      Logger.log('Test Connection Result:');
      Logger.log('Success: ' + result.success);
      if (result.userInfo) {
        Logger.log('User Name: ' + result.userInfo.name);
        Logger.log('User Login: ' + result.userInfo.login);
      }
      if (result.error) {
        Logger.log('Error: ' + result.error);
      }
    } else {
      Logger.log('BoxOAuth.testConnection() did not return a result.');
    }
  } catch (e) {
    Logger.log('Error in test_2_TestBoxConnection: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
  }
}

/**
 * OPTIONAL: Get an Access Token.
 * Run this after successful authorization.
 */
function test_GetBoxAccessToken() {
  Logger.log('Attempting to get Box Access Token...');
  try {
    // This function is defined in your BoxOAuth.gs
    const token = BoxOAuth.getValidAccessToken(); 
    if (token) {
      Logger.log('Access Token: ' + token);
    } else {
      Logger.log('Failed to get access token. Ensure you have authorized.');
    }
  } catch (e) {
    Logger.log('Error in test_GetBoxAccessToken: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
  }
}

/**
 * OPTIONAL: Clear stored Box authorization.
 * Useful if you want to re-authorize or test the flow from scratch.
 */
function test_ClearBoxAuthorization() {
  Logger.log('Attempting to clear Box authorization...');
  try {
    // This function is defined in your BoxOAuth.gs
    BoxOAuth.clearAuthorization(); 
    Logger.log('Box authorization should be cleared. Run test_1_ShowBoxAuthorizationUrl() to re-authorize.');
  } catch (e) {
    Logger.log('Error in test_ClearBoxAuthorization: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
  }
}

/**
 * OPTIONAL: Check the status of the BoxOAuth service.
 */
function test_GetBoxStatus() {
  Logger.log('Getting BoxOAuth status...');
  try {
    const status = BoxOAuth.getStatus();
    Logger.log('Status: \n' + JSON.stringify(status, null, 2));
  } catch (e) {
    Logger.log('Error in test_GetBoxStatus: ' + e.toString());
    Logger.log('Stack: ' + e.stack);
  }
}

/**
 * This is the global callback function cGoa will look for.
 * Ensure your BoxOAuth.gs also calls this from its global authCallback.
 * Or, if BoxOAuth.gs has its own global authCallback, ensure it's correctly
 * invoking BoxOAuth.handleAuthCallback(request).
 * The version in your BoxOAuth.gs should be sufficient.
 */
// function authCallback(request) {
//   Logger.log('Global authCallback in TestBox.gs received request.');
//   return BoxOAuth.handleAuthCallback(request); // Delegate to your BoxOAuth module
// }

/**
 * Creates a custom menu in the Google Sheet/Doc/Slide to run tests easily.
 */
function onOpen() {
  SpreadsheetApp.getUi() // Or DocumentApp or SlidesApp
      .createMenu('Box OAuth Tests')
      .addItem('SETUP: Store Credentials', 'setupBoxCredentialsForTest')
      .addSeparator()
      .addItem('Test 1: Show Auth URL', 'test_1_ShowBoxAuthorizationUrl')
      .addItem('Test 2: Test Connection', 'test_2_TestBoxConnection')
      .addSeparator()
      .addItem('Get Access Token', 'test_GetBoxAccessToken')
      .addItem('Clear Authorization', 'test_ClearBoxAuthorization')
      .addItem('Get Status', 'test_GetBoxStatus')
      .addToUi();
}
