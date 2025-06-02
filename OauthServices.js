// File: OAuthServices.gs
// OAuth2 service provider configurations for cGoa library
// Based on Bruce McPherson's Service definition patterns
// Extends cGoa with Box and other custom service configurations

/**
 * OAuth Service configuration namespace following Bruce McPherson's patterns.
 * Defines OAuth2 endpoints and settings for various service providers.
 */
var OAuthServices = (function (service) {
  'use strict';

  /**
   * Helper functions following Bruce McPherson's utility patterns
   * @private
   */
  const isUndefined_ = (item) => typeof item === typeof undefined;
  const isNull_ = (item) => item === null;
  const isNullOrUndefined_ = (item) => isNull_(item) || isUndefined_(item);
  const arrify_ = (item) => Array.isArray(item) ? item : (isNullOrUndefined_(item) ? [] : [item]);
  const encodeURIComponent_ = (str) => encodeURIComponent(str);

  /**
   * Converts parameters to URL query string following Bruce's patterns
   * @param {Object|Array<Object>} params Parameters to convert
   * @returns {string} Query string
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

  /**
   * Service provider configurations.
   * Each key represents a service with its OAuth2 endpoints and settings.
   */
  service.pockage = {
    
    // --- Box Configuration (Primary) ---
    "box": {
      authUrl: "https://account.box.com/api/oauth2/authorize",
      tokenUrl: "https://api.box.com/oauth2/token",
      refreshUrl: "https://api.box.com/oauth2/token",
      basic: false // Box expects client credentials in POST body
    },

    // --- Google Services ---
    "google": {
      authUrl: "https://accounts.google.com/o/oauth2/auth",
      tokenUrl: "https://accounts.google.com/o/oauth2/token",
      refreshUrl: "https://accounts.google.com/o/oauth2/token",
      checkUrl: "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token="
    },
    
    "google_service": {
      authUrl: "https://www.googleapis.com/oauth2/v3/token",
      tokenUrl: "https://www.googleapis.com/oauth2/v3/token",
      defaultDuration: 3600,
      accountType: 'serviceaccount',
      checkUrl: "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token="
    },

    // --- Business & Productivity Services ---
    "github": {
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      refreshUrl: "https://github.com/login/oauth/access_token",
      accept: "application/json"
    },

    "linkedin": {
      authUrl: "https://www.linkedin.com/oauth/v2/authorization",
      tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
      refreshUrl: "https://www.linkedin.com/oauth/v2/accessToken"
    },

    "asana": {
      authUrl: "https://app.asana.com/-/oauth_authorize",
      tokenUrl: "https://app.asana.com/-/oauth_token",
      refreshUrl: "https://app.asana.com/-/oauth_token"
    },

    "quickbooks": {
      authUrl: "https://appcenter.intuit.com/connect/oauth2",
      tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
      refreshUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer"
    },

    // --- Social & Media Services ---
    "twitter": {
      authUrl: "https://twitter.com/i/oauth2/authorize",
      tokenUrl: "https://api.twitter.com/2/oauth2/token",
      refreshUrl: "https://api.twitter.com/2/oauth2/token",
      basic: true,
      customizeOptions: {
        codeVerify: (url, pockage) => {
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
          return {
            ...options,
            contentType: 'application/x-www-form-urlencoded',
            payload: {
              ...payload,
              code_verifier: pockage.id,
              client_id: pockage.clientId
            }
          };
        }
      }
    },

    "reddit": {
      authUrl: "https://ssl.reddit.com/api/v1/authorize",
      tokenUrl: "https://ssl.reddit.com/api/v1/access_token",
      refreshUrl: "https://ssl.reddit.com/api/v1/access_token",
      basic: true,
      duration: 'permanent'
    },

    // --- Payment Services ---
    "paypal_sandbox": {
      authUrl: "https://api.sandbox.paypal.com/v1/oauth2/token",
      tokenUrl: "https://api.sandbox.paypal.com/v1/oauth2/token",
      refreshUrl: "https://api.sandbox.paypal.com/v1/oauth2/token",
      basic: true,
      accountType: "credential",
      accept: "application/json"
    },

    "paypal_live": {
      authUrl: "https://api.paypal.com/v1/oauth2/token",
      tokenUrl: "https://api.paypal.com/v1/oauth2/token",
      refreshUrl: "https://api.paypal.com/v1/oauth2/token",
      basic: true,
      accountType: "credential",
      accept: "application/json"
    },

    // --- Other Services ---
    "vimeo": {
      authUrl: "https://api.vimeo.com/oauth/authorize",
      tokenUrl: "https://api.vimeo.com/oauth/access_token",
      refreshUrl: "https://api.vimeo.com/oauth/access_token"
    },

    "firebase": {
      accountType: 'firebase'
    }
  };

  return service;

})(OAuthServices || {});