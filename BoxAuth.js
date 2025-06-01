// file: BoxAuth
function getBoxGoa(e) {
  return cGoa.make(
    'boxService',
    PropertiesService.getScriptProperties(),
    e
  );
}

function getValidAccessToken() {
  const goa = getBoxGoa();
  if (!goa.hasToken()) {
    throw new Error('No token - need consent first');
  }
  return goa.getToken();
}

function doGet(e) {
  const goa = getBoxGoa(e);
  if (goa.needsConsent()) {
    return goa.getConsent();
  }
  return HtmlService.createHtmlOutput('Authorized!');
}

// Simple Box Auth using cGoa properly

function setupBoxCredentials() {
  const clientId = SCRIPT_PROPERTIES.getProperty('OAUTH_CLIENT_ID');
  const clientSecret = SCRIPT_PROPERTIES.getProperty('OAUTH_CLIENT_SECRET');
  
  cGoa.GoaApp.setPackage(SCRIPT_PROPERTIES, {
    clientId: clientId,
    clientSecret: clientSecret,
    scopes: ["root_readwrite", "manage_enterprise_properties"],
    service: 'box',
    packageName: 'boxService'
  });
}

function getBoxGoa(e) {
  return cGoa.make('boxService', SCRIPT_PROPERTIES, e);
}

function getValidAccessToken() {
  const goa = getBoxGoa();
  if (!goa.hasToken()) {
    throw new Error('No Box token - run doGet() first for consent');
  }
  return goa.getToken();
}

function doGet(e) {
  const goa = getBoxGoa(e);
  if (goa.needsConsent()) {
    return goa.getConsent();
  }
  return HtmlService.createHtmlOutput('Box authorized successfully!');
}

function testBoxAccess() {
  try {
    const token = getValidAccessToken();
    const response = UrlFetchApp.fetch('https://api.box.com/2.0/users/me', {
      headers: { 'Authorization': 'Bearer ' + token },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      const user = JSON.parse(response.getContentText());
      Logger.log('✅ Box connection successful! User: ' + user.name);
      return true;
    } else {
      Logger.log('❌ Box API error: ' + response.getResponseCode());
      return false;
    }
  } catch (error) {
    Logger.log('❌ Box auth error: ' + error.toString());
    return false;
  }
}