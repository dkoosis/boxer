// File: QuickAuthTest.gs
// Quick test to verify your existing setup will work

/**
 * Quick test of your current authentication setup
 * Run this to see exactly what needs to be done
 */
function quickBoxAuthTest() {
  Logger.log('=== Quick Box Auth Test ===\n');
  
  // Test 1: Check libraries
  Logger.log('1. Checking libraries...');
  if (typeof cGoa === 'undefined') {
    Logger.log('❌ cGoa library missing - add library ID: 1v_l4xN3ICa0lAW315NQEzAHPSoNiFdWHsMEwj2qA5t9cgZ5VWci2Qxv2');
    return;
  }
  Logger.log('✅ cGoa library found');
  
  // Test 2: Check your existing credentials
  Logger.log('\n2. Checking your Script Properties credentials...');
  const clientId = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY);
  const clientSecret = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY);
  
  if (!clientId) {
    Logger.log('❌ Missing: ' + OAUTH_CLIENT_ID_PROPERTY);
    return;
  }
  if (!clientSecret) {
    Logger.log('❌ Missing: ' + OAUTH_CLIENT_SECRET_PROPERTY);
    return;
  }
  Logger.log('✅ Credentials found in Script Properties');
  Logger.log('   ' + OAUTH_CLIENT_ID_PROPERTY + ': ' + clientId.substring(0, 8) + '...');
  
  // Test 3: Check/create cGoa package
  Logger.log('\n3. Checking cGoa package...');
  try {
    const initialized = initializeBoxPackage();
    if (initialized) {
      Logger.log('✅ cGoa package ready');
    } else {
      Logger.log('❌ Failed to initialize package');
      return;
    }
  } catch (error) {
    Logger.log('❌ Package error: ' + error.toString());
    return;
  }
  
  // Test 4: Check auth status
  Logger.log('\n4. Checking authorization status...');
  const authStatus = getAuthStatus();
  
  Logger.log('   Package exists: ' + authStatus.packageExists);
  Logger.log('   Has token: ' + authStatus.hasToken);
  Logger.log('   Needs consent: ' + authStatus.needsConsent);
  
  if (authStatus.hasToken) {
    Logger.log('✅ Already authorized!');
    
    // Test API access
    Logger.log('\n5. Testing Box API...');
    const apiTest = testBoxAccess();
    if (apiTest.success) {
      Logger.log('🎉 SETUP COMPLETE! Your trigger scripts are ready!');
      Logger.log('👤 Connected as: ' + apiTest.user.name);
      Logger.log('\n👉 You can now run setupComplete() or your trigger functions');
    } else {
      Logger.log('❌ API test failed: ' + apiTest.error);
    }
  } else {
    Logger.log('❌ Authorization needed');
    Logger.log('\n📋 NEXT STEPS:');
    Logger.log('1. Run: initializeBoxAuth() - for detailed setup instructions');
    Logger.log('2. Or just deploy as web app temporarily and visit the URL');
    Logger.log('3. Complete Box authorization in browser');
    Logger.log('4. Run this test again to verify');
  }
}

/**
 * Simple function to check if your auth is ready for production use
 */
function isReadyForTriggers() {
  try {
    const ready = isBoxAuthReady();
    if (ready) {
      Logger.log('🎉 Ready! Your trigger scripts can use getValidAccessToken()');
      return true;
    } else {
      Logger.log('❌ Not ready. Run quickBoxAuthTest() for setup steps');
      return false;
    }
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
    return false;
  }
}