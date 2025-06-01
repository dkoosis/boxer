# Simple Box Authentication Setup for Trigger Scripts

## One-Time Setup Process

### Step 1: Verify Your Existing Setup
Your credentials are already in Script Properties, so you're good there.

### Step 2: Initialize Package
Run this once in Apps Script:
```javascript
initializeBoxAuth()
```

This will:
- ✅ Create the cGoa package using your existing credentials
- ✅ Check if auth is already complete
- ✅ Give you next steps if auth is needed

### Step 3: Complete OAuth (One-Time Only)

**IF** `initializeBoxAuth()` shows you need authorization:

1. **Deploy as Web App** (temporarily):
   - Go to Deploy → New deployment
   - Type: Web app
   - Execute as: Me  
   - Who has access: Anyone
   - Click Deploy
   - Copy the web app URL

2. **Complete Authorization**:
   - Visit the web app URL in your browser
   - Click through the Box consent process
   - You'll see "Authorization Complete!"

3. **Clean Up** (optional):
   - Go back to Apps Script
   - You can undeploy the web app now
   - The authorization is permanently saved in Script Properties

### Step 4: Verify Setup
Run this to confirm everything works:
```javascript
testBoxAccess()
```

### Step 5: Use in Your Trigger Scripts
Your existing code will now work:
```javascript
function yourTriggerFunction() {
  const accessToken = getValidAccessToken(); // Now works!
  
  // Your existing Box API calls...
  const template = getOrCreateImageTemplate(accessToken);
  // etc.
}
```

## Why This Works

- **cGoa stores tokens in Script Properties** (where your credentials are)
- **Tokens automatically refresh** when they expire
- **No web app needed** for ongoing operations
- **Your trigger scripts run independently**

## Troubleshooting

If `getValidAccessToken()` throws an error:
1. Run `getAuthStatus()` to see what's missing
2. Run `initializeBoxAuth()` to see setup steps
3. Check that your Script Properties have the OAuth credentials

## Box Developer Console Setup

You still need to configure your Box app with the redirect URI:
- **Redirect URI**: `https://script.google.com/macros/s/YOUR_SCRIPT_ID/usercallback`
- Replace `YOUR_SCRIPT_ID` with your actual script ID from the web app URL

## Summary

✅ **Your approach is correct** - standalone trigger script  
✅ **No hardcoded credentials** - uses your existing Script Properties  
✅ **Web app only for initial OAuth** - then undeploy if you want  
✅ **Trigger scripts work independently** after setup