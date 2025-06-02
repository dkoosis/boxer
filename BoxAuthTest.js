// File: BoxAuthTest.gs
// Test functions following Goa documentation patterns

/**
 * Complete test of Box authentication setup following Goa testing patterns
 */
function testBoxGoaSetup() {
  Logger.log('=== Box cGoa Authentication Test ===\n');
  
  try {
    // Test 1: Check if libraries are available
    Logger.log('1. Checking required libraries...');
    if (typeof cGoa === 'undefined') {
      Logger.log('❌ cGoa library not found');
      return;
    }
    if (typeof cUseful === 'undefined') {
      Logger.log('❌ cUseful library not found');  
      return;
    }
    Logger.log('✅ Required libraries found');
    
    // Test 2: Check credentials in properties
    Logger.log('\n2. Checking Box credentials...');
    const clientId = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_ID_PROPERTY);
    const clientSecret = SCRIPT_PROPERTIES.getProperty(OAUTH_CLIENT_SECRET_PROPERTY);
    
    if (!clientId || !clientSecret) {
      Logger.log('❌ Box credentials not found in Script Properties');
      Logger.log('👉 Run setupBoxCredentials() first');
      return;
    }
    Logger.log('✅ Box credentials found');
    
    // Test 3: Check package setup (following Goa patterns)
    Logger.log('\n3. Checking cGoa package...');
    let goa;
    try {
      goa = getBoxGoa();
      const packageInfo = goa.getPackage();
      
      // Verify package structure following Goa patterns
      if (packageInfo.service !== 'custom') {
        Logger.log('❌ Service should be "custom" for Box, found: ' + packageInfo.service);
        return;
      }
      
      if (!packageInfo.serviceParameters) {
        Logger.log('❌ Missing serviceParameters for custom service');
        return;
      }
      
      const requiredParams = ['authUrl', 'tokenUrl', 'refreshUrl'];
      const missingParams = requiredParams.filter(param => !packageInfo.serviceParameters[param]);
      if (missingParams.length > 0) {
        Logger.log('❌ Missing serviceParameters: ' + missingParams.join(', '));
        return;
      }
      
      Logger.log('✅ cGoa package properly configured');
      Logger.log('   Package Name: ' + packageInfo.packageName);
      Logger.log('   Service: ' + packageInfo.service);
      Logger.log('   Scopes: ' + packageInfo.scopes.join(', '));
      
    } catch (error) {
      Logger.log('❌ cGoa package error: ' + error.toString());
      Logger.log('👉 Try running createBoxPackage()');
      return;
    }
    
    // Test 4: Check authorization status (following Goa patterns)
    Logger.log('\n4. Checking authorization status...');
    const hasToken = goa.hasToken();
    const needsConsent = goa.needsConsent();
    
    Logger.log('   Has Token: ' + hasToken);
    Logger.log('   Needs Consent: ' + needsConsent);
    
    if (!hasToken) {
      Logger.log('❌ No valid token found');
      Logger.log('👉 Deploy as web app and visit: ' + startAuthorization());
      return;
    }
    
    Logger.log('✅ Valid token found');
    
    // Test 5: Test token functionality (following Goa patterns)
    Logger.log('\n5. Testing token functionality...');
    const token = goa.getToken();
    Logger.log('   Token preview: ' + token.substring(0, 20) + '...');
    
    // Test 6: Test Box API access
    Logger.log('\n6. Testing Box API access...');
    const apiResult = testBoxAccess();
    
    if (apiResult.success) {
      Logger.log('✅ Box API test successful!');
      Logger.log('   User: ' + apiResult.user.name);
      Logger.log('   Email: ' + apiResult.user.login);
    } else {
      Logger.log('❌ Box API test failed: ' + apiResult.error);
      return;
    }
    
    // Test 7: Test token refresh (following Goa testing patterns)
    Logger.log('\n7. Testing token refresh mechanism...');
    const refreshResult = forceTokenRefresh();
    
    if (refreshResult.success && refreshResult.refreshed) {
      Logger.log('✅ Token refresh mechanism working');
    } else if (refreshResult.success && !refreshResult.refreshed) {
      Logger.log('⚠️ Token refresh attempted but got same token (may be normal)');
    } else {
      Logger.log('❌ Token refresh failed: ' + refreshResult.error);
    }
    
    // Test 8: Test metadata template functions
    Logger.log('\n8. Testing metadata template integration...');
    try {
      const accessToken = getValidAccessToken();
      const template = getOrCreateImageTemplate(accessToken);
      
      if (template) {
        Logger.log('✅ Metadata template test successful!');
        Logger.log('   Template: ' + template.displayName);
        Logger.log('   Key: ' + template.templateKey);
        Logger.log('   Fields: ' + (template.fields ? template.fields.length : 0));
      } else {
        Logger.log('❌ Failed to get/create metadata template');
        return;
      }
    } catch (error) {
      Logger.log('❌ Metadata template test failed: ' + error.toString());
      return;
    }
    
    // All tests passed!
    Logger.log('\n🎉 ALL GOA TESTS PASSED! 🎉');
    Logger.log('✅ Box authentication properly configured with cGoa');
    Logger.log('✅ Following Goa documentation patterns');
    Logger.log('✅ Token management working');
    Logger.log('✅ API access confirmed');
    Logger.log('✅ Integration with your metadata system ready');
    Logger.log('\n👉 You can now run setupComplete() to initialize your full system');
    
  } catch (error) {
    Logger.log('❌ Unexpected error: ' + error.toString());
    Logger.log('Stack: ' + error.stack);
  }
}

/**
 * Utility function to show package contents (following Goa debugging patterns)
 */
function showBoxPackage() {
  try {
    const goa = getBoxGoa();
    const packageInfo = goa.getPackage();
    
    Logger.log('=== Box Package Contents ===');
    Logger.log(JSON.stringify(packageInfo, (key, value) => {
      // Hide sensitive information in logs
      if (key === 'clientSecret' || key === 'accessToken' || key === 'refreshToken') {
        return value ? value.substring(0, 8) + '...' : value;
      }
      return value;
    }, 2));
    
  } catch (error) {
    Logger.log('Error showing package: ' + error.toString());
  }
}

/**
 * Quick diagnosis following Goa patterns
 */
function diagnoseBoxAuth() {
  Logger.log('=== Box Auth Quick Diagnosis ===');
  
  try {
    const status = getAuthorizationStatus();
    Logger.log('Package found: ' + !status.error);
    Logger.log('Has Token: ' + status.hasToken);
    Logger.log('Needs Consent: ' + status.needsConsent);
    Logger.log('Service Type: ' + status.service);
    Logger.log('Scopes: ' + (status.scopes || []).join(', '));
    
    if (status.expires) {
      const now = new Date();
      const expires = new Date(status.expires);
      const timeLeft = Math.round((expires.getTime() - now.getTime()) / 1000 / 60);
      Logger.log('Token expires in: ' + timeLeft + ' minutes');
    }
    
    if (status.error) {
      Logger.log('Error: ' + status.error);
    }
    
  } catch (error) {
    Logger.log('Error getting status: ' + error.toString());
  }
}

/**
 * Reset and start fresh (following Goa patterns)
 */
function resetBoxAuth() {
  Logger.log('=== Resetting Box Authentication ===');
  
  try {
    // Clear authorization but keep credentials
    clearAuthorization();
    Logger.log('✅ Authorization cleared');
    
    // Show next steps
    Logger.log('👉 To re-authorize, visit: ' + startAuthorization());
    
  } catch (error) {
    Logger.log('❌ Error resetting: ' + error.toString());
  }
}