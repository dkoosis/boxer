// File: BoxOAuth.gs (Refactored with Bruce McPherson's patterns)
// Depends on: Config.gs, cGoa library
// Clean, greenfield implementation following Bruce's organizational patterns

/**
 * BoxOAuth namespace following Bruce McPherson's patterns
 * Provides robust OAuth2 authentication for Box API using cGoa
 */
var BoxOAuth = (function () {
  "use strict";

  // Private namespace
  var ns = {};

  // Private variables following Bruce's singleton pattern
  var goaService_ = null;
  var isInitialized_ = false;

  /**
   * Box scopes configuration - centralized and easily maintainable
   * @private
   */
  var BOX_SCOPES_ = ["root_readwrite", "manage_enterprise_properties"];

  /**
   * Initialize the cGoa service following Bruce's lazy initialization pattern
   * @returns {object} Configured Goa service
   * @private
   */
  function initializeGoaService_() {
    if (goaService_) {
      return goaService_;
    }

    try {
      var clientId = PropertiesService.getScriptProperties().getProperty(
        OAUTH_CLIENT_ID_PROPERTY
      );
      var clientSecret = PropertiesService.getScriptProperties().getProperty(
        OAUTH_CLIENT_SECRET_PROPERTY
      );

      if (!clientId || !clientSecret) {
        throw new Error(
          "OAuth credentials not configured in Script Properties"
        );
      }

      if (!BOX_SCOPES_ || BOX_SCOPES_.length === 0) {
        throw new Error("Box scopes not defined");
      }

      goaService_ = cGoa.GoaApp.createGoa("box")
        .setTokenUrl(BOX_OAUTH_TOKEN_URL)
        .setAuthorizationUrl(BOX_OAUTH_AUTH_URL)
        .setClientId(clientId)
        .setClientSecret(clientSecret)
        .setScope(BOX_SCOPES_.join(" "))
        .setRedirectUri(APPS_SCRIPT_REDIRECT_URI)
        .setCache(PropertiesService.getScriptProperties())
        .setLock(LockService.getScriptLock())
        .setTokenMethod(cGoa.GoaApp.TokenMethod.POST)
        .setCallback(ns.handleAuthCallback);

      isInitialized_ = true;
      Logger.log("BoxOAuth: cGoa service initialized successfully");

      return goaService_;
    } catch (error) {
      Logger.log(
        "BoxOAuth: Failed to initialize cGoa service: " + error.toString()
      );
      throw new Error(
        "Box OAuth service initialization failed: " + error.message
      );
    }
  }

  /**
   * Gets the configured Box OAuth service
   * @returns {object} cGoa service instance
   */
  ns.getService = function () {
    return initializeGoaService_();
  };

  /**
   * Checks if the OAuth service is healthy and has access
   * @returns {boolean} True if service is healthy and authorized
   */
  ns.isHealthy = function () {
    try {
      var service = ns.getService();
      return service.hasAccess();
    } catch (error) {
      Logger.log("BoxOAuth: Health check failed: " + error.toString());
      return false;
    }
  };

  /**
   * Gets a valid access token with automatic refresh
   * @returns {string|null} Valid access token or null if unavailable
   */
  ns.getValidAccessToken = function () {
    try {
      var service = ns.getService();

      if (!service.hasAccess()) {
        Logger.log("BoxOAuth: No access granted. Authorization required.");
        Logger.log(
          "BoxOAuth: Run showAuthorizationUrl() to get authorization URL"
        );
        return null;
      }

      return service.getAccessToken();
    } catch (error) {
      Logger.log("BoxOAuth: Failed to get access token: " + error.toString());

      // Check if re-authorization is needed
      if (
        error.message &&
        (error.message.includes("access_denied") ||
          error.message.includes("invalid_grant") ||
          error.message.includes("token_expired"))
      ) {
        Logger.log(
          "BoxOAuth: Re-authorization required. Run showAuthorizationUrl()"
        );
      }

      return null;
    }
  };

  /**
   * Generates and logs the authorization URL for manual authorization
   * Following Bruce's pattern for clear user guidance
   */
  ns.showAuthorizationUrl = function () {
    try {
      var service = ns.getService();

      // Check current authorization state
      if (service.hasAccess()) {
        Logger.log("BoxOAuth: Already authorized. Current access is valid.");
        Logger.log(
          "BoxOAuth: To force re-authorization, run clearAuthorization() first."
        );
        return;
      }

      var authUrl = service.getAuthorizationUrl();

      Logger.log("");
      Logger.log(
        "================================================================================"
      );
      Logger.log("BOX OAUTH2 AUTHORIZATION REQUIRED");
      Logger.log(
        "================================================================================"
      );
      Logger.log("");
      Logger.log("1. Copy this URL and open it in your browser:");
      Logger.log("");
      Logger.log(authUrl);
      Logger.log("");
      Logger.log("2. Grant permissions to the Box application");
      Logger.log("3. You will be redirected to a success/failure page");
      Logger.log("4. Run testConnection() to verify the authorization worked");
      Logger.log("");
      Logger.log(
        "================================================================================"
      );
      Logger.log("");
    } catch (error) {
      Logger.log(
        "BoxOAuth: Error generating authorization URL: " + error.toString()
      );
      throw error;
    }
  };

  /**
   * Handles the OAuth callback - required by cGoa
   * @param {object} request The callback request object
   * @returns {GoogleAppsScript.HTML.HtmlOutput} Response to display to user
   */
  ns.handleAuthCallback = function (request) {
    try {
      var service = ns.getService();
      var authorized = service.handleCallback(request);

      if (authorized) {
        Logger.log("BoxOAuth: Authorization callback successful");
        return HtmlService.createHtmlOutput(
          '<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">' +
            '<h2 style="color: #0061D5;">✅ Box Authorization Successful!</h2>' +
            "<p>You can now close this tab and return to Google Apps Script.</p>" +
            "<p>Your Box integration is ready to use.</p>" +
            "</div>"
        );
      } else {
        Logger.log("BoxOAuth: Authorization callback failed");
        return HtmlService.createHtmlOutput(
          '<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">' +
            '<h2 style="color: #D73502;">❌ Box Authorization Failed</h2>' +
            "<p>Authorization was denied or an error occurred.</p>" +
            "<p>Please try the authorization process again.</p>" +
            "</div>"
        );
      }
    } catch (error) {
      Logger.log("BoxOAuth: Exception in auth callback: " + error.toString());
      return HtmlService.createHtmlOutput(
        '<div style="font-family: Arial, sans-serif; padding: 20px; text-align: center;">' +
          '<h2 style="color: #D73502;">❌ Authorization Error</h2>' +
          "<p>An error occurred during authorization:</p>" +
          "<p><code>" +
          error.message +
          "</code></p>" +
          "</div>"
      );
    }
  };

  /**
   * Tests the Box API connection with comprehensive diagnostics
   * @returns {object} Test result with detailed information
   */
  ns.testConnection = function () {
    Logger.log("BoxOAuth: Testing Box API connection...");

    var result = {
      success: false,
      hasAccess: false,
      tokenValid: false,
      apiCallSuccessful: false,
      userInfo: null,
      error: null,
      timestamp: new Date().toISOString(),
    };

    try {
      // Step 1: Check if service has access
      var service = ns.getService();
      result.hasAccess = service.hasAccess();

      if (!result.hasAccess) {
        result.error =
          "No access granted. Run showAuthorizationUrl() to authorize.";
        Logger.log("❌ BoxOAuth: " + result.error);
        return result;
      }

      // Step 2: Get access token
      var accessToken = service.getAccessToken();
      result.tokenValid = !!accessToken;

      if (!result.tokenValid) {
        result.error = "Failed to obtain valid access token";
        Logger.log("❌ BoxOAuth: " + result.error);
        return result;
      }

      // Step 3: Test API call
      var apiUrl = BOX_API_BASE_URL + "/users/me";
      var response = UrlFetchApp.fetch(apiUrl, {
        method: "GET",
        headers: { Authorization: "Bearer " + accessToken },
        muteHttpExceptions: true,
      });

      var responseCode = response.getResponseCode();
      var responseText = response.getContentText();

      if (responseCode === 200) {
        result.apiCallSuccessful = true;
        result.userInfo = JSON.parse(responseText);
        result.success = true;

        Logger.log("✅ BoxOAuth: Connection test successful!");
        Logger.log(
          "   Connected as: " +
            result.userInfo.name +
            " (" +
            result.userInfo.login +
            ")"
        );
        Logger.log("   User ID: " + result.userInfo.id);
        Logger.log(
          "   Account type: " +
            (result.userInfo.enterprise
              ? result.userInfo.enterprise.name
              : "Personal")
        );
      } else {
        result.error =
          "API call failed with HTTP " +
          responseCode +
          ": " +
          responseText.substring(0, 200);
        Logger.log("❌ BoxOAuth: " + result.error);

        // Provide specific guidance for common errors
        if (responseCode === 401) {
          Logger.log(
            "   This typically means the access token is invalid or expired."
          );
          Logger.log("   Try running showAuthorizationUrl() to re-authorize.");
        } else if (responseCode === 403) {
          Logger.log("   This typically means insufficient permissions.");
          Logger.log("   Check your Box app configuration and granted scopes.");
        }
      }
    } catch (error) {
      result.error = "Exception during connection test: " + error.toString();
      Logger.log("❌ BoxOAuth: " + result.error);
    }

    return result;
  };

  /**
   * Clears the current authorization
   * Useful for testing or when switching accounts
   */
  ns.clearAuthorization = function () {
    try {
      var service = ns.getService();

      // cGoa doesn't have a direct clearToken method, but we can clear from properties
      var tokenKeys = [
        "box_access_token",
        "box_refresh_token",
        "box_token_expires",
      ];

      tokenKeys.forEach(function (key) {
        PropertiesService.getScriptProperties().deleteProperty(key);
      });

      // Reset the service instance
      goaService_ = null;
      isInitialized_ = false;

      Logger.log("✅ BoxOAuth: Authorization cleared successfully");
      Logger.log("   Run showAuthorizationUrl() to re-authorize");
    } catch (error) {
      Logger.log("BoxOAuth: Error clearing authorization: " + error.toString());
      throw error;
    }
  };

  /**
   * Gets comprehensive service status information
   * @returns {object} Detailed status information
   */
  ns.getStatus = function () {
    var status = {
      initialized: isInitialized_,
      hasAccess: false,
      scopes: BOX_SCOPES_,
      credentialsConfigured: false,
      timestamp: new Date().toISOString(),
    };

    try {
      // Check if credentials are configured
      var clientId = PropertiesService.getScriptProperties().getProperty(
        OAUTH_CLIENT_ID_PROPERTY
      );
      var clientSecret = PropertiesService.getScriptProperties().getProperty(
        OAUTH_CLIENT_SECRET_PROPERTY
      );
      status.credentialsConfigured = !!(clientId && clientSecret);

      if (status.credentialsConfigured) {
        var service = ns.getService();
        status.hasAccess = service.hasAccess();
        status.initialized = true;
      }
    } catch (error) {
      status.error = error.toString();
    }

    return status;
  };

  // Alias for backward compatibility with your existing code
  ns.authCallback = ns.handleAuthCallback;

  // Return the public interface
  return ns;
})();

// Global functions required by cGoa callback mechanism
function authCallback(request) {
  return BoxOAuth.handleAuthCallback(request);
}

// Main functions for easy access
function getValidBoxAccessToken() {
  return BoxOAuth.getValidAccessToken();
}

function showBoxAuthorizationUrl() {
  return BoxOAuth.showAuthorizationUrl();
}

function testBoxAccessWithGoa() {
  return BoxOAuth.testConnection();
}
