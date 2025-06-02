// File: EnhancedUtilities.gs
// Enhanced utilities following Bruce McPherson's patterns and principles
// Uses cUseful library by Bruce McPherson
// Contains utilities that could potentially contribute back to Bruce's ecosystem

/**
 * Enhanced utilities following Bruce McPherson's organizational patterns.
 * Provides specialized functions for Box operations and metadata processing.
 * These utilities could potentially be contributed to Bruce's library ecosystem.
 */
var EnhancedUtils = (function() {
  'use strict';
  
  var ns = {};
  var cUseful_ = null;
  
  /**
   * Get cUseful utilities following Bruce's pattern.
   * @returns {object} cUseful utilities
   * @private
   */
  function getCUseful_() {
    if (!cUseful_) {
      try {
        cUseful_ = cUseful;
      } catch (e) {
        throw new Error('cUseful library by Bruce McPherson is required: ' + e.toString());
      }
    }
    return cUseful_;
  }
  
  /**
   * Box API specific utilities.
   * These could potentially be contributed to Bruce's ecosystem as a "BoxUtils" library.
   */
  ns.BoxUtils = (function() {
    var boxNs = {};
    
    /**
     * Enhanced file type detection with MIME type validation.
     * @param {string} filename The filename to check
     * @param {string} mimeType Optional MIME type for validation
     * @returns {object} Detection result with type and confidence
     */
    boxNs.detectFileType = function(filename, mimeType) {
      if (!filename || typeof filename !== 'string') {
        return { type: 'unknown', confidence: 0, isImage: false };
      }
      
      var lowerFilename = filename.toLowerCase();
      var extension = '';
      var lastDotIndex = lowerFilename.lastIndexOf('.');
      
      if (lastDotIndex !== -1) {
        extension = lowerFilename.substring(lastDotIndex);
      }
      
      // Image extensions with confidence scoring
      var imageExtensions = {
        '.jpg': { confidence: 0.9, formats: ['JPEG'] },
        '.jpeg': { confidence: 1.0, formats: ['JPEG'] },
        '.png': { confidence: 1.0, formats: ['PNG'] },
        '.gif': { confidence: 0.8, formats: ['GIF'] },
        '.bmp': { confidence: 0.7, formats: ['BMP'] },
        '.tiff': { confidence: 0.8, formats: ['TIFF'] },
        '.tif': { confidence: 0.8, formats: ['TIFF'] },
        '.webp': { confidence: 0.9, formats: ['WebP'] },
        '.heic': { confidence: 0.8, formats: ['HEIC'] },
        '.heif': { confidence: 0.8, formats: ['HEIF'] },
        '.svg': { confidence: 0.6, formats: ['SVG'] } // Lower confidence for SVG as it's vector
      };
      
      var result = {
        type: 'unknown',
        confidence: 0,
        isImage: false,
        extension: extension,
        format: 'unknown'
      };
      
      if (imageExtensions[extension]) {
        var extInfo = imageExtensions[extension];
        result.type = 'image';
        result.isImage = true;
        result.confidence = extInfo.confidence;
        result.format = extInfo.formats[0];
        
        // Boost confidence if MIME type matches
        if (mimeType) {
          var expectedMimeTypes = {
            'JPEG': ['image/jpeg', 'image/jpg'],
            'PNG': ['image/png'],
            'GIF': ['image/gif'],
            'WebP': ['image/webp'],
            'TIFF': ['image/tiff'],
            'BMP': ['image/bmp']
          };
          
          var expectedMimes = expectedMimeTypes[result.format] || [];
          if (expectedMimes.indexOf(mimeType.toLowerCase()) !== -1) {
            result.confidence = Math.min(1.0, result.confidence + 0.1);
          }
        }
      }
      
      return result;
    };
    
    /**
     * Extracts dimensions from filename patterns.
     * @param {string} filename The filename to analyze
     * @returns {object|null} Dimensions object or null
     */
    boxNs.extractDimensionsFromFilename = function(filename) {
      if (!filename || typeof filename !== 'string') {
        return null;
      }
      
      // Common dimension patterns
      var patterns = [
        /(\d+)[xX×](\d+)/,           // 1920x1080, 1920X1080, 1920×1080
        /(\d+)[-_](\d+)/,            // 1920-1080, 1920_1080  
        /(\d+)w[xX×](\d+)h/i,        // 1920wx1080h
        /(\d+)px[xX×](\d+)px/i       // 1920px×1080px
      ];
      
      for (var i = 0; i < patterns.length; i++) {
        var match = filename.match(patterns[i]);
        if (match) {
          var width = parseInt(match[1], 10);
          var height = parseInt(match[2], 10);
          
          // Sanity check for reasonable dimensions
          if (width > 0 && height > 0 && width <= 50000 && height <= 50000) {
            return {
              width: width,
              height: height,
              aspectRatio: ns.MathUtils.calculateAspectRatio(width, height),
              megapixels: Math.round((width * height) / 1000000 * 10) / 10,
              patternUsed: patterns[i].toString()
            };
          }
        }
      }
      
      return null;
    };
    
    /**
     * Builds a robust Box API URL with parameter validation.
     * @param {string} baseUrl Base Box API URL
     * @param {string} endpoint API endpoint
     * @param {object} params Query parameters
     * @returns {string} Complete URL
     */
    boxNs.buildApiUrl = function(baseUrl, endpoint, params) {
      if (!baseUrl || !endpoint) {
        throw new Error('BoxUtils.buildApiUrl: baseUrl and endpoint required');
      }
      
      var url = baseUrl.replace(/\/$/, '') + '/' + endpoint.replace(/^\//, '');
      
      if (params && typeof params === 'object') {
        var queryParts = [];
        
        Object.keys(params).forEach(function(key) {
          var value = params[key];
          if (value !== null && value !== undefined && value !== '') {
            queryParts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
          }
        });
        
        if (queryParts.length > 0) {
          url += '?' + queryParts.join('&');
        }
      }
      
      return url;
    };
    
    return boxNs;
  })();
  
  /**
   * Enhanced math utilities that could extend cUseful.
   */
  ns.MathUtils = (function() {
    var mathNs = {};
    
    /**
     * Enhanced GCD calculation with input validation.
     * @param {number} a First number
     * @param {number} b Second number
     * @returns {number} Greatest common divisor
     */
    mathNs.gcd = function(a, b) {
      if (typeof a !== 'number' || typeof b !== 'number') {
        throw new Error('MathUtils.gcd: Both parameters must be numbers');
      }
      
      a = Math.abs(Math.floor(a));
      b = Math.abs(Math.floor(b));
      
      return b === 0 ? a : mathNs.gcd(b, a % b);
    };
    
    /**
     * Calculate aspect ratio with various output formats.
     * @param {number} width Width value
     * @param {number} height Height value
     * @param {string} format Output format: 'ratio', 'decimal', 'percentage'
     * @returns {string|number|null} Formatted aspect ratio
     */
    mathNs.calculateAspectRatio = function(width, height, format) {
      format = format || 'ratio';
      
      if (!width || !height || width <= 0 || height <= 0) {
        return null;
      }
      
      switch (format) {
        case 'decimal':
          return Math.round((width / height) * 100) / 100;
          
        case 'percentage':
          return Math.round((width / height) * 10000) / 100; // e.g., 177.78 for 16:9
          
        case 'ratio':
        default:
          var divisor = mathNs.gcd(width, height);
          return (width / divisor) + ':' + (height / divisor);
      }
    };
    
    /**
     * Round to specified decimal places (more robust than native rounding).
     * @param {number} value Value to round
     * @param {number} places Decimal places
     * @returns {number} Rounded value
     */
    mathNs.roundToPlaces = function(value, places) {
      if (typeof value !== 'number' || typeof places !== 'number') {
        return value;
      }
      
      var multiplier = Math.pow(10, places);
      return Math.round(value * multiplier) / multiplier;
    };
    
    return mathNs;
  })();
  
  /**
   * String utilities that could extend cUseful.
   */
  ns.StringUtils = (function() {
    var stringNs = {};
    
    /**
     * Clean filename for analysis (remove common noise).
     * @param {string} filename Original filename
     * @param {object} options Cleaning options
     * @returns {string} Cleaned filename
     */
    stringNs.cleanFilename = function(filename, options) {
      if (!filename || typeof filename !== 'string') {
        return '';
      }
      
      options = options || {};
      var removeExtension = options.removeExtension !== false; // Default true
      var removeDimensions = options.removeDimensions !== false; // Default true
      var normalizeSpaces = options.normalizeSpaces !== false; // Default true
      
      var cleaned = filename;
      
      // Remove file extension
      if (removeExtension) {
        var lastDot = cleaned.lastIndexOf('.');
        if (lastDot !== -1) {
          cleaned = cleaned.substring(0, lastDot);
        }
      }
      
      // Remove dimension patterns
      if (removeDimensions) {
        cleaned = cleaned.replace(/(\d+)[xX×](\d+)/g, '');
        cleaned = cleaned.replace(/(\d+)[-_](\d+)/g, '');
        cleaned = cleaned.replace(/(\d+)w[xX×](\d+)h/gi, '');
        cleaned = cleaned.replace(/(\d+)px[xX×](\d+)px/gi, '');
      }
      
      // Normalize separators and spaces
      if (normalizeSpaces) {
        cleaned = cleaned.replace(/[_-]+/g, ' ');        // Replace underscores/hyphens with spaces
        cleaned = cleaned.replace(/\s+/g, ' ');          // Normalize multiple spaces
        cleaned = cleaned.trim();                        // Remove leading/trailing spaces
      }
      
      return cleaned;
    };
    
    /**
     * Extract keywords from text with filtering.
     * @param {string} text Input text
     * @param {object} options Extraction options
     * @returns {string[]} Array of keywords
     */
    stringNs.extractKeywords = function(text, options) {
      if (!text || typeof text !== 'string') {
        return [];
      }
      
      options = options || {};
      var minLength = options.minLength || 2;
      var maxLength = options.maxLength || 50;
      var stopWords = options.stopWords || ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
      
      // Split on various separators and clean
      var words = text.toLowerCase()
        .split(/[\s,\/\\]+/)
        .map(function(word) { 
          return word.replace(/[^\w]/g, ''); 
        })
        .filter(function(word) {
          return word.length >= minLength && 
                 word.length <= maxLength && 
                 stopWords.indexOf(word) === -1 &&
                 !/^\d+$/.test(word); // Exclude pure numbers
        });
      
      // Remove duplicates using Bruce's approach
      var unique = [];
      var seen = {};
      
      words.forEach(function(word) {
        if (!seen[word]) {
          seen[word] = true;
          unique.push(word);
        }
      });
      
      return unique;
    };
    
    return stringNs;
  })();
  
  /**
   * Date utilities with enhanced formatting.
   */
  ns.DateUtils = (function() {
    var dateNs = {};
    
    /**
     * Format date for Box API (ISO 8601).
     * @param {Date|string} date Date to format
     * @returns {string} ISO formatted date string
     */
    dateNs.toISOString = function(date) {
      if (!date) {
        return new Date().toISOString();
      }
      
      if (typeof date === 'string') {
        date = new Date(date);
      }
      
      if (!(date instanceof Date) || isNaN(date.getTime())) {
        return new Date().toISOString();
      }
      
      return date.toISOString();
    };
    
    /**
     * Parse various date formats commonly found in EXIF/metadata.
     * @param {string} dateString Date string to parse
     * @returns {Date|null} Parsed date or null
     */
    dateNs.parseFlexibleDate = function(dateString) {
      if (!dateString || typeof dateString !== 'string') {
        return null;
      }
      
      // Try various formats
      var formats = [
        /^\d{4}[-\/]\d{2}[-\/]\d{2}/, // YYYY-MM-DD or YYYY/MM/DD
        /^\d{2}[-\/]\d{2}[-\/]\d{4}/, // MM-DD-YYYY or MM/DD/YYYY
        /^\d{4}:\d{2}:\d{2}/,         // YYYY:MM:DD (EXIF format)
      ];
      
      // First try direct parsing
      var direct = new Date(dateString);
      if (!isNaN(direct.getTime())) {
        return direct;
      }
      
      // Try format-specific parsing
      for (var i = 0; i < formats.length; i++) {
        if (formats[i].test(dateString)) {
          var normalized = dateString.replace(/[:\-\/]/g, '-');
          var parsed = new Date(normalized);
          if (!isNaN(parsed.getTime())) {
            return parsed;
          }
        }
      }
      
      return null;
    };
    
    return dateNs;
  })();
  
  /**
   * Validation utilities.
   */
  ns.ValidationUtils = (function() {
    var validationNs = {};
    
    /**
     * Validate Box file ID format.
     * @param {string} fileId File ID to validate
     * @returns {boolean} True if valid format
     */
    validationNs.isValidBoxFileId = function(fileId) {
      return typeof fileId === 'string' && 
             /^\d+$/.test(fileId) && 
             fileId.length > 0 && 
             fileId !== '0';
    };
    
    /**
     * Validate Box access token format.
     * @param {string} token Token to validate
     * @returns {boolean} True if appears to be valid format
     */
    validationNs.isValidBoxToken = function(token) {
      return typeof token === 'string' && 
             token.length > 20 && 
             /^[A-Za-z0-9_-]+$/.test(token);
    };
    
    /**
     * Validate image dimensions.
     * @param {number} width Width value
     * @param {number} height Height value
     * @returns {object} Validation result
     */
    validationNs.validateImageDimensions = function(width, height) {
      var result = {
        valid: false,
        errors: []
      };
      
      if (typeof width !== 'number' || typeof height !== 'number') {
        result.errors.push('Dimensions must be numbers');
        return result;
      }
      
      if (width <= 0 || height <= 0) {
        result.errors.push('Dimensions must be positive');
        return result;
      }
      
      if (width > 50000 || height > 50000) {
        result.errors.push('Dimensions seem unreasonably large');
        return result;
      }
      
      if (width < 1 || height < 1) {
        result.errors.push('Dimensions too small');
        return result;
      }
      
      result.valid = true;
      return result;
    };
    
    return validationNs;
  })();
  
  // Return the public interface
  return ns;
})();

/**
 * Library info function following Bruce McPherson's pattern.
 * @returns {object} Library information and dependencies
 */
function getLibraryInfo() {
  return {
    info: {
      name: 'EnhancedUtils',
      version: '1.0.0',
      description: 'Enhanced utilities following Bruce McPherson patterns for Box operations',
      author: 'Box Image Metadata System',
      dependencies: ['cUseful by Bruce McPherson']
    },
    dependencies: [
      'cUseful library by Bruce McPherson provides the foundational utility functions'
    ]
  };
}