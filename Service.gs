/**
 * @file Service.gs
 * @description This file defines the known OAuth2 service providers and their specific URL configurations
 * for use with the cGoa library. It follows the patterns established by Bruce McPherson.
 * To add a new service, extend the 'service.pockage' object with the provider's details.
 */

var Service = (function (service) {
  'use strict';

  // --- Private Helper Functions ---
  // These helpers are scoped to this Service module, similar to cGoa's internal utilities.

  /**
   * Checks if an item is undefined.
   * @param {*} item The item to check.
   * @return {boolean} True if the item is undefined, false otherwise.
   * @private
   */
  const isUndefined_ = (item) => typeof item === typeof undefined;

  /**
   * Checks if an item is null.
   * @param {*} item The item to check.
   * @return {boolean} True if the item is null, false otherwise.
   * @private
   */
  const isNull_ = (item) => item === null;

  /**
   * Checks if an item is null or undefined.
   * @param {*} item The item to check.
   * @return {boolean} True if the item is null or undefined, false otherwise.
   * @private
   */
  const isNullOrUndefined_ = (item) => isNull_(item) || isUndefined_(item);

  /**
   * Ensures an item is an array. If not, wraps it in an array.
   * Handles null or undefined by returning an empty array.
   * @param {*} item The item to arrayify.
   * @return {Array} The item as an array.
   * @private
   */
  const arrify_ = (item) => Array.isArray(item) ? item : (isNullOrUndefined_(item) ? [] : [item]);

  /**
   * URL-encodes a string.
   * @param {string} str The string to encode.
   * @return {string} The URL-encoded string.
   * @private
   */
  const encodeURIComponent_ = (str) => encodeURIComponent(str);

  /**
   * Converts an object or array of objects into a URL query string.
   * @param {Object|Array<Object>} params The parameters to convert.
   * @return {string} The URL query string (e.g., "?key1=value1&key2=value2").
   * @private
   */
  const objectToQueryString_ = (params) => {
    const paramArray = arrify_(params);
    const queryParams = paramArray.reduce((p, c) => {
      Object.keys(c).forEach(k => p.push([k, encodeURIComponent_(c[k])].join('=')));
      return p;
    }, []);
    return queryParams.length ? `?${queryParams.join('&')}` : '';
  };

  // --- Public Service Definitions ---

  /**
   * @property {Object} pockage - Defines configurations for various OAuth2 service providers.
   * Each key is a service name (e.g., "google", "twitter", "box"), and its value is an object
   * containing URLs and settings for that service.
   *
   * Required properties for each service:
   * - authUrl {string}: The authorization endpoint URL.
   * - tokenUrl {string}: The token endpoint URL.
   *
   * Optional properties:
   * - refreshUrl {string}: The URL to refresh an access token. Defaults to tokenUrl if not provided by cGoa.
   * - basic {boolean}: True if client credentials for token requests should be sent via HTTP Basic Auth.
   * False or omitted if sent in request body. (Default: false)
   * - accountType {string}: Specifies the type of account (e.g., "serviceaccount", "firebase", "credential").
   * Used by cGoa for special handling. (Default: standard web flow)
   * - checkUrl {string}: URL to validate an access token (e.g., Google's tokeninfo endpoint).
   * - defaultDuration {number}: Default token expiry in seconds if not provided by the service.
   * - customizeOptions {Object}: Functions to customize parts of the OAuth flow for specific services.
   * - scopes {function(Array<string>): Object|Array<string>}: Modifies scopes. Can return an array or an object {online:[], offline:[]}.
   * - codeVerify {function(string, Object): string}: Modifies auth URL for PKCE or similar.
   * - token {function(Object, Object, Object): Object}: Modifies token request options.
   * - duration {string}: Used by some services (e.g., Reddit's 'permanent') for refresh token requests.
   * - accept {string}: Value for the 'Accept' header in token requests (e.g., "application/json").
   */
  service.pockage = {
    // --- Box Configuration ---
    "box": {
      authUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      refreshUrl: "https://api.box.com/oauth2/token", // Box uses the same URL for refresh
      basic: false, // Box expects client_id & client_secret in the POST body for token requests
      // No specific accountType needed for standard web server flow.
      // No standard checkUrl like Google's tokeninfo; token validation is usually by using it.
      // customizeOptions might be needed if Box has very specific requirements not covered by standard OAuth2.
      // For now, a basic setup is provided.
    },

    // --- Other Services (from your original Service.txt) ---
    "twitterAppOnly": {
      tokenUrl: "https://api.twitter.com/oauth2/token",
      basic: true,
      accountType: "credential",
    },
    "twitter": {
      authUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      refreshUrl: "https://api.twitter.com/2/oauth2/token",
      basic: true,
      customizeOptions: {
        codeVerify: (url, pockage) => {
          // Helper to add query param if URL doesn't have one, or append if it does
          const qiffyUrl_ = (u) => u.includes('?') ? '&' : '?';
          return `${url}${qiffyUrl_(url)}code_challenge=${pockage.id}&code_challenge_method=plain`;
        },
        scopes: (scopes) => {
          const offline = 'offline.access';
          const online = scopes.filter(f => f !== offline);
          return {
            offline: online.concat([offline]),
            online
          };
        },
        token: (options = {}, pockage) => {
          const { payload = {} } = options || {};
          const newOptions = {
            ...options,
            contentType: 'application/x-www-form-urlencoded',
            payload: {
              ...payload,
              code_verifier: pockage.id,
              client_id: pockage.clientId // Twitter needs client_id in body even with Basic Auth for some flows
            }
          };
          return newOptions;
        }
      }
    },
    "google_service": {
      authUrl: "https://www.googleapis.com/oauth2/v3/token", // Note: This is token URL, typical for service accounts
      tokenUrl: "https://www.googleapis.com/oauth2/v3/token",
      defaultDuration: 3600, // Service account tokens are typically short-lived (1 hour)
      accountType: 'serviceaccount',
      checkUrl: "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token="
    },
    "google": {
      authUrl: "https://accounts.google.com/o/oauth2/auth",
      tokenUrl: "https://accounts.google.com/o/oauth2/token", // v4 is common: "https://oauth2.googleapis.com/token"
      refreshUrl: "https://accounts.google.com/o/oauth2/token", // v4 is common: "https://oauth2.googleapis.com/token"
      checkUrl: "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=" // v3 is also common: "https://www.googleapis.com/oauth2/v3/tokeninfo"
    },
    "linkedin": {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      refreshUrl: "https://www.linkedin.com/oauth/v2/accessToken"
    },
    "soundcloud": {
      authUrl: "https://soundcloud.com/connect",
      tokenUrl: "https://api.soundcloud.com/oauth2/token",
      refreshUrl: "https://api.soundcloud.com/oauth2/token"
    },
    "podio": {
      authUrl: "https://podio.com/oauth/authorize",
      tokenUrl: "https://podio.com/oauth/token",
      refreshUrl: "https://podio.com/oauth/token"
    },
    "shoeboxed": {
      authUrl: "https://id.shoeboxed.com/oauth/authorize",
      tokenUrl: "https://id.shoeboxed.com/oauth/token",
      refreshUrl: "https://id.shoeboxed.com/oauth/token"
    },
    "github": {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      refreshUrl: "https://github.com/login/oauth/access_token",
      accept: "application/json" // GitHub token endpoint returns form-encoded by default
    },
    "reddit": {
      authUrl: "https://ssl.reddit.com/api/v1/authorize",
      tokenUrl: "https://ssl.reddit.com/api/v1/access_token",
      refreshUrl: "https://ssl.reddit.com/api/v1/access_token",
      basic: true,
      duration: 'permanent' // Reddit specific parameter for long-lived refresh tokens
    },
    "asana": {
      authUrl: "https://app.asana.com/-/oauth_authorize",
      tokenUrl: "https://app.asana.com/-/oauth_token",
      refreshUrl: "https://app.asana.com/-/oauth_token",
    },
    "live": { // Microsoft Live / Outlook
      authUrl: "https://login.live.com/oauth20_authorize.srf",
      tokenUrl: "https://login.live.com/oauth20_token.srf",
      refreshUrl: "https://login.live.com/oauth20_token.srf",
    },
    "paypal_sandbox": {
      authUrl: "https://api.sandbox.paypal.com/v1/oauth2/token", // PayPal uses client_credentials, direct token URL
      tokenUrl: "https://api.sandbox.paypal.com/v1/oauth2/token",
      refreshUrl: "https://api.sandbox.paypal.com/v1/oauth2/token", // Not typical for client_credentials
      basic: true,
      accountType: "credential",
      accept: "application/json"
    },
    "paypal_live": {
      authUrl: "https://api.paypal.com/v1/oauth2/token", // PayPal uses client_credentials, direct token URL
      tokenUrl: "https://api.paypal.com/v1/oauth2/token",
      refreshUrl: "https://api.paypal.com/v1/oauth2/token", // Not typical for client_credentials
      basic: true,
      accountType: "credential",
      accept: "application/json"
    },
    "classy": {
      authUrl: "https://api.classy.org/oauth2/auth", // Often client_credentials for server-to-server
      tokenUrl: "https://api.classy.org/oauth2/auth",
      refreshUrl: "https://api.classy.org/oauth2/auth",
      accountType: "credential" // Assuming client_credentials flow
    },
    "quickbooks": {
      authUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      refreshUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    },
    "firebase": { // This is a placeholder for cGoa's JWT generation for Firebase, not standard OAuth2
      accountType: 'firebase'
    },
    "vimeo": {
      authUrl: "https://api.vimeo.com/oauth/authorize",
      tokenUrl: "https://api.vimeo.com/oauth/access_token",
      refreshUrl: "https://api.vimeo.com/oauth/access_token"
      // Vimeo often requires specific 'Accept' headers for API calls,
      // but token endpoint itself is usually standard.
    }
    // Add other services here following the same pattern
  };

  return service;

})(Service || {});
