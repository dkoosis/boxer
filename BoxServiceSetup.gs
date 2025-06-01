// File: BoxServiceSetup.gs
// Add this to configure Box service for cGoa

/**
 * Adds Box service configuration to cGoa
 * Call this once to register Box as a custom service
 */
function setupBoxService() {
  // Add Box service to cGoa's service registry
  if (typeof cGoa !== 'undefined' && cGoa.Service && cGoa.Service.pockage) {
    cGoa.Service.pockage.box = {
      authUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token", 
      refreshUrl: "https://api.box.com/oauth2/token"
    };
    Logger.log('✅ Box service registered with cGoa');
  } else {
    Logger.log('❌ cGoa not available or Service not found');
  }
}

/**
 * Alternative method: Create Box package directly
 * This bypasses the service registry and creates a custom package
 */
function createBoxPackage() {
  const clientId = SCRIPT_PROPERTIES.getProperty('OAUTH_CLIENT_ID');
  const clientSecret = SCRIPT_PROPERTIES.getProperty('OAUTH_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    throw new Error('Box Client ID and Secret must be set in Script Properties first');
  }
  
  // Create the package
  const boxPackage = {
    clientId: clientId,
    clientSecret: clientSecret,
    scopes: ["root_readwrite", "manage_enterprise_properties"],
    service: 'custom', // Use custom service type
    packageName: 'boxService',
    serviceParameters: {
      authUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      refreshUrl: "https://api.box.com/oauth2/token"
    }
  };
  
  // Store the package
  cGoa.GoaApp.setPackage(SCRIPT_PROPERTIES, boxPackage);
  Logger.log('✅ Box package created and stored');
  
  return boxPackage;
}