// File: EnhancedExifParser.gs
// Enhanced EXIF and metadata extraction following Bruce McPherson's patterns
// Inspired by the exifr library for comprehensive metadata parsing
// Uses cUseful library by Bruce McPherson for robust operations
// Depends on: Config.gs, BoxAuth.gs

/**
 * EnhancedExifParser namespace following Bruce McPherson's organizational patterns.
 * Provides comprehensive EXIF and metadata extraction with sophisticated parsing.
 */
var EnhancedExifParser = (function() {
  'use strict';
  
  var ns = {};
  var utils_ = null;
  
  // EXIF data type constants (from TIFF specification)
  var EXIF_TYPES = {
    BYTE: 1,      // 8-bit unsigned integer
    ASCII: 2,     // 8-bit bytes w/ last byte null
    SHORT: 3,     // 16-bit unsigned integer
    LONG: 4,      // 32-bit unsigned integer
    RATIONAL: 5,  // 64-bit unsigned fraction
    SBYTE: 6,     // 8-bit signed integer
    UNDEFINED: 7, // 8-bit untyped data
    SSHORT: 8,    // 16-bit signed integer
    SLONG: 9,     // 32-bit signed integer
    SRATIONAL: 10,// 64-bit signed fraction
    FLOAT: 11,    // 32-bit IEEE floating point
    DOUBLE: 12    // 64-bit IEEE floating point
  };
  
  // Size lookup for EXIF data types
  var TYPE_SIZES = [
    undefined, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8
  ];
  
  // Endianness constants
  var TIFF_LITTLE_ENDIAN = 0x4949;
  var TIFF_BIG_ENDIAN = 0x4D4D;
  
  // EXIF tag definitions (comprehensive set)
  var EXIF_TAGS = {
    // IFD0 tags
    0x010F: 'Make',
    0x0110: 'Model',
    0x0112: 'Orientation',
    0x011A: 'XResolution',
    0x011B: 'YResolution',
    0x0128: 'ResolutionUnit',
    0x0131: 'Software',
    0x0132: 'DateTime',
    0x013B: 'Artist',
    0x8298: 'Copyright',
    0x8769: 'ExifIFD',
    0x8825: 'GPSIFD',
    
    // EXIF IFD tags
    0x829A: 'ExposureTime',
    0x829D: 'FNumber',
    0x8822: 'ExposureProgram',
    0x8827: 'ISO',
    0x9000: 'ExifVersion',
    0x9003: 'DateTimeOriginal',
    0x9004: 'CreateDate',
    0x9101: 'ComponentsConfiguration',
    0x9201: 'ShutterSpeedValue',
    0x9202: 'ApertureValue',
    0x9204: 'ExposureCompensation',
    0x9207: 'MeteringMode',
    0x9208: 'LightSource',
    0x9209: 'Flash',
    0x920A: 'FocalLength',
    0x9286: 'UserComment',
    0xA000: 'FlashpixVersion',
    0xA001: 'ColorSpace',
    0xA002: 'ExifImageWidth',
    0xA003: 'ExifImageHeight',
    0xA217: 'SensingMethod',
    0xA300: 'FileSource',
    0xA401: 'CustomRendered',
    0xA402: 'ExposureMode',
    0xA403: 'WhiteBalance',
    0xA404: 'DigitalZoomRatio',
    0xA405: 'FocalLengthIn35mmFormat',
    0xA406: 'SceneCaptureType',
    0xA430: 'OwnerName',
    0xA431: 'SerialNumber',
    0xA432: 'LensInfo',
    0xA433: 'LensMake',
    0xA434: 'LensModel',
    
    // GPS tags
    0x0001: 'GPSLatitudeRef',
    0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef',
    0x0004: 'GPSLongitude',
    0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude',
    0x0007: 'GPSTimeStamp',
    0x001D: 'GPSDateStamp'
  };
  
  // Value interpretations for specific tags
  var TAG_VALUES = {
    0x0112: { // Orientation
      1: 'Horizontal (normal)',
      2: 'Mirror horizontal',
      3: 'Rotate 180',
      4: 'Mirror vertical',
      5: 'Mirror horizontal and rotate 270 CW',
      6: 'Rotate 90 CW',
      7: 'Mirror horizontal and rotate 90 CW',
      8: 'Rotate 270 CW'
    },
    0x8822: { // ExposureProgram
      0: 'Not defined',
      1: 'Manual',
      2: 'Normal program',
      3: 'Aperture priority',
      4: 'Shutter priority',
      5: 'Creative program',
      6: 'Action program',
      7: 'Portrait mode',
      8: 'Landscape mode'
    },
    0x9207: { // MeteringMode
      0: 'Unknown',
      1: 'Average',
      2: 'CenterWeightedAverage',
      3: 'Spot',
      4: 'MultiSpot',
      5: 'Pattern',
      6: 'Partial',
      255: 'Other'
    },
    0x9208: { // LightSource
      0: 'Unknown',
      1: 'Daylight',
      2: 'Fluorescent',
      3: 'Tungsten',
      4: 'Flash',
      9: 'Fine weather',
      10: 'Cloudy weather',
      11: 'Shade',
      17: 'Standard light A',
      18: 'Standard light B',
      19: 'Standard light C',
      20: 'D55',
      21: 'D65',
      22: 'D75',
      255: 'Other'
    }
  };
  
  /**
   * Initialize cUseful utilities following Bruce's dependency pattern.
   * @returns {object} cUseful utilities
   * @private
   */
  function initUtils_() {
    if (!utils_) {
      try {
        utils_ = cUseful;
        Logger.log('EnhancedExifParser: cUseful library initialized');
      } catch (e) {
        Logger.log('ERROR: EnhancedExifParser - cUseful library not available: ' + e.toString());
        throw new Error('cUseful library is required but not available');
      }
    }
    return utils_;
  }
  
  /**
   * Enhanced BufferView implementation for EXIF parsing.
   * @private
   */
  var BufferView_ = {
    /**
     * Create a view from byte array with endianness support.
     * @param {Uint8Array} bytes Raw byte data
     * @param {boolean} littleEndian Endianness flag
     * @returns {object} Buffer view object
     */
    create: function(bytes, littleEndian) {
      return {
        bytes: bytes,
        littleEndian: littleEndian || false,
        byteLength: bytes.length,
        
        getUint8: function(offset) {
          return this.bytes[offset];
        },
        
        getUint16: function(offset) {
          if (this.littleEndian) {
            return this.bytes[offset] | (this.bytes[offset + 1] << 8);
          } else {
            return (this.bytes[offset] << 8) | this.bytes[offset + 1];
          }
        },
        
        getUint32: function(offset) {
          if (this.littleEndian) {
            return this.bytes[offset] | 
                   (this.bytes[offset + 1] << 8) | 
                   (this.bytes[offset + 2] << 16) | 
                   (this.bytes[offset + 3] << 24);
          } else {
            return (this.bytes[offset] << 24) | 
                   (this.bytes[offset + 1] << 16) | 
                   (this.bytes[offset + 2] << 8) | 
                   this.bytes[offset + 3];
          }
        },
        
        getString: function(offset, length) {
          var chars = [];
          for (var i = 0; i < length; i++) {
            var charCode = this.bytes[offset + i];
            if (charCode === 0) break; // Null terminator
            chars.push(String.fromCharCode(charCode));
          }
          return chars.join('');
        },
        
        getUint8Array: function(offset, length) {
          return this.bytes.slice(offset, offset + length);
        }
      };
    }
  };
  
  /**
   * Extract comprehensive EXIF data from image bytes.
   * @param {Uint8Array} imageBytes Raw image data
   * @returns {object} Comprehensive EXIF data object
   */
  ns.extractComprehensiveExif = function(imageBytes) {
    var result = {
      hasExif: false,
      ifd0: {},
      exif: {},
      gps: {},
      technical: {},
      camera: {},
      settings: {},
      datetime: {},
      location: {}
    };
    
    try {
      // Check for JPEG signature
      if (imageBytes[0] !== 0xFF || imageBytes[1] !== 0xD8) {
        Logger.log('EnhancedExifParser: Not a JPEG file');
        return result;
      }
      
      var exifData = ns.findExifSegment_(imageBytes);
      if (!exifData) {
        Logger.log('EnhancedExifParser: No EXIF segment found');
        return result;
      }
      
      result.hasExif = true;
      
      // Parse TIFF header and IFDs
      var tiffData = ns.parseTiffStructure_(exifData);
      if (tiffData) {
        result = ns.organizeExifData_(result, tiffData);
      }
      
      Logger.log('EnhancedExifParser: Successfully extracted comprehensive EXIF data');
      return result;
      
    } catch (error) {
      Logger.log('EnhancedExifParser: Error extracting EXIF: ' + error.toString());
      result.hasExif = false;
      return result;
    }
  };
  
  /**
   * Find and extract EXIF segment from JPEG.
   * @param {Uint8Array} imageBytes JPEG image data
   * @returns {Uint8Array|null} EXIF data or null
   * @private
   */
  ns.findExifSegment_ = function(imageBytes) {
    var offset = 2; // Skip SOI marker
    var maxSearchOffset = Math.min(imageBytes.length - 4, 65536);
    
    while (offset < maxSearchOffset) {
      if (imageBytes[offset] === 0xFF) {
        var markerType = imageBytes[offset + 1];
        
        if (markerType === 0xE1) { // APP1 marker
          var segmentLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
          var exifHeaderOffset = offset + 4;
          
          // Check for "Exif\0\0" header
          if (imageBytes[exifHeaderOffset] === 0x45 && // 'E'
              imageBytes[exifHeaderOffset + 1] === 0x78 && // 'x'
              imageBytes[exifHeaderOffset + 2] === 0x69 && // 'i'
              imageBytes[exifHeaderOffset + 3] === 0x66 && // 'f'
              imageBytes[exifHeaderOffset + 4] === 0x00 && 
              imageBytes[exifHeaderOffset + 5] === 0x00) {
            
            // Extract TIFF data (after "Exif\0\0")
            var tiffStart = exifHeaderOffset + 6;
            var tiffLength = segmentLength - 8; // Subtract APP1 header and "Exif\0\0"
            return imageBytes.slice(tiffStart, tiffStart + tiffLength);
          }
        }
        
        // Move to next segment
        var segmentLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
        offset += segmentLength + 2;
      } else {
        offset++;
      }
    }
    
    return null;
  };
  
  /**
   * Parse TIFF structure and extract IFD data.
   * @param {Uint8Array} tiffData TIFF format data
   * @returns {object|null} Parsed TIFF structure
   * @private
   */
  ns.parseTiffStructure_ = function(tiffData) {
    try {
      // Read TIFF header
      var byteOrder = (tiffData[0] << 8) | tiffData[1];
      var littleEndian = byteOrder === TIFF_LITTLE_ENDIAN;
      
      if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
        Logger.log('EnhancedExifParser: Invalid TIFF byte order: ' + byteOrder.toString(16));
        return null;
      }
      
      var view = BufferView_.create(tiffData, littleEndian);
      
      // Check TIFF magic number (should be 42)
      var magic = view.getUint16(2);
      if (magic !== 42) {
        Logger.log('EnhancedExifParser: Invalid TIFF magic number: ' + magic);
        return null;
      }
      
      // Get IFD0 offset
      var ifd0Offset = view.getUint32(4);
      
      var result = {
        littleEndian: littleEndian,
        ifd0: {},
        exif: {},
        gps: {}
      };
      
      // Parse IFD0
      if (ifd0Offset < tiffData.length) {
        result.ifd0 = ns.parseIFD_(view, ifd0Offset);
        
        // Parse EXIF IFD if present
        if (result.ifd0[0x8769]) {
          result.exif = ns.parseIFD_(view, result.ifd0[0x8769]);
        }
        
        // Parse GPS IFD if present
        if (result.ifd0[0x8825]) {
          result.gps = ns.parseIFD_(view, result.ifd0[0x8825]);
        }
      }
      
      return result;
      
    } catch (error) {
      Logger.log('EnhancedExifParser: Error parsing TIFF structure: ' + error.toString());
      return null;
    }
  };
  
  /**
   * Parse an Image File Directory (IFD).
   * @param {object} view BufferView of TIFF data
   * @param {number} offset Offset to IFD
   * @returns {object} Parsed IFD tags
   * @private
   */
  ns.parseIFD_ = function(view, offset) {
    var tags = {};
    
    try {
      var entryCount = view.getUint16(offset);
      offset += 2;
      
      for (var i = 0; i < entryCount; i++) {
        var tag = view.getUint16(offset);
        var type = view.getUint16(offset + 2);
        var count = view.getUint32(offset + 4);
        var valueOffset = offset + 8;
        
        var typeSize = TYPE_SIZES[type] || 1;
        var totalSize = typeSize * count;
        
        // If value is larger than 4 bytes, it's stored at the offset
        if (totalSize > 4) {
          valueOffset = view.getUint32(offset + 8);
        }
        
        var value = ns.parseTagValue_(view, type, valueOffset, count);
        if (value !== null) {
          tags[tag] = value;
        }
        
        offset += 12; // Each IFD entry is 12 bytes
      }
    } catch (error) {
      Logger.log('EnhancedExifParser: Error parsing IFD at offset ' + offset + ': ' + error.toString());
    }
    
    return tags;
  };
  
  /**
   * Parse tag value based on EXIF data type.
   * @param {object} view BufferView of TIFF data
   * @param {number} type EXIF data type
   * @param {number} offset Value offset
   * @param {number} count Number of values
   * @returns {*} Parsed value
   * @private
   */
  ns.parseTagValue_ = function(view, type, offset, count) {
    try {
      switch (type) {
        case EXIF_TYPES.BYTE:
        case EXIF_TYPES.UNDEFINED:
          return count === 1 ? view.getUint8(offset) : view.getUint8Array(offset, count);
          
        case EXIF_TYPES.ASCII:
          return view.getString(offset, count);
          
        case EXIF_TYPES.SHORT:
          if (count === 1) {
            return view.getUint16(offset);
          } else {
            var values = [];
            for (var i = 0; i < count; i++) {
              values.push(view.getUint16(offset + i * 2));
            }
            return values;
          }
          
        case EXIF_TYPES.LONG:
          if (count === 1) {
            return view.getUint32(offset);
          } else {
            var values = [];
            for (var i = 0; i < count; i++) {
              values.push(view.getUint32(offset + i * 4));
            }
            return values;
          }
          
        case EXIF_TYPES.RATIONAL:
          if (count === 1) {
            var numerator = view.getUint32(offset);
            var denominator = view.getUint32(offset + 4);
            return denominator === 0 ? 0 : numerator / denominator;
          } else {
            var values = [];
            for (var i = 0; i < count; i++) {
              var numerator = view.getUint32(offset + i * 8);
              var denominator = view.getUint32(offset + i * 8 + 4);
              values.push(denominator === 0 ? 0 : numerator / denominator);
            }
            return values;
          }
          
        default:
          Logger.log('EnhancedExifParser: Unsupported EXIF data type: ' + type);
          return null;
      }
    } catch (error) {
      Logger.log('EnhancedExifParser: Error parsing tag value type ' + type + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Organize raw EXIF data into meaningful categories.
   * @param {object} result Result object to populate
   * @param {object} tiffData Parsed TIFF data
   * @returns {object} Organized EXIF data
   * @private
   */
  ns.organizeExifData_ = function(result, tiffData) {
    try {
      // Process IFD0 tags
      ns.processIfd0Tags_(result, tiffData.ifd0);
      
      // Process EXIF IFD tags
      ns.processExifTags_(result, tiffData.exif);
      
      // Process GPS tags
      ns.processGpsTags_(result, tiffData.gps);
      
      // Derive additional information
      ns.deriveAdditionalInfo_(result);
      
      return result;
    } catch (error) {
      Logger.log('EnhancedExifParser: Error organizing EXIF data: ' + error.toString());
      return result;
    }
  };
  
  /**
   * Process IFD0 tags (basic image information).
   * @param {object} result Result object
   * @param {object} ifd0 IFD0 tag data
   * @private
   */
  ns.processIfd0Tags_ = function(result, ifd0) {
    if (!ifd0) return;
    
    // Camera information
    if (ifd0[0x010F]) result.camera.make = ifd0[0x010F];
    if (ifd0[0x0110]) result.camera.model = ifd0[0x0110];
    if (ifd0[0x0131]) result.camera.software = ifd0[0x0131];
    
    // Image technical details
    if (ifd0[0x0112]) {
      result.technical.orientation = ifd0[0x0112];
      result.technical.orientationDesc = TAG_VALUES[0x0112] ? TAG_VALUES[0x0112][ifd0[0x0112]] : 'Unknown';
    }
    if (ifd0[0x011A]) result.technical.xResolution = ifd0[0x011A];
    if (ifd0[0x011B]) result.technical.yResolution = ifd0[0x011B];
    if (ifd0[0x0128]) result.technical.resolutionUnit = ifd0[0x0128];
    
    // Datetime information
    if (ifd0[0x0132]) result.datetime.modifyDate = ifd0[0x0132];
    
    // Copyright and artist
    if (ifd0[0x013B]) result.camera.artist = ifd0[0x013B];
    if (ifd0[0x8298]) result.camera.copyright = ifd0[0x8298];
  };
  
  /**
   * Process EXIF IFD tags (detailed camera settings).
   * @param {object} result Result object
   * @param {object} exif EXIF IFD tag data
   * @private
   */
  ns.processExifTags_ = function(result, exif) {
    if (!exif) return;
    
    // Exposure settings
    if (exif[0x829A]) result.settings.exposureTime = exif[0x829A];
    if (exif[0x829D]) result.settings.fNumber = exif[0x829D];
    if (exif[0x8827]) result.settings.iso = exif[0x8827];
    if (exif[0x920A]) result.settings.focalLength = exif[0x920A];
    if (exif[0x9201]) result.settings.shutterSpeedValue = exif[0x9201];
    if (exif[0x9202]) result.settings.apertureValue = exif[0x9202];
    if (exif[0x9204]) result.settings.exposureCompensation = exif[0x9204];
    
    // Camera modes and settings
    if (exif[0x8822]) {
      result.settings.exposureProgram = exif[0x8822];
      result.settings.exposureProgramDesc = TAG_VALUES[0x8822] ? TAG_VALUES[0x8822][exif[0x8822]] : 'Unknown';
    }
    if (exif[0x9207]) {
      result.settings.meteringMode = exif[0x9207];
      result.settings.meteringModeDesc = TAG_VALUES[0x9207] ? TAG_VALUES[0x9207][exif[0x9207]] : 'Unknown';
    }
    if (exif[0x9208]) {
      result.settings.lightSource = exif[0x9208];
      result.settings.lightSourceDesc = TAG_VALUES[0x9208] ? TAG_VALUES[0x9208][exif[0x9208]] : 'Unknown';
    }
    if (exif[0x9209]) result.settings.flash = exif[0x9209];
    if (exif[0xA402]) result.settings.exposureMode = exif[0xA402];
    if (exif[0xA403]) result.settings.whiteBalance = exif[0xA403];
    if (exif[0xA406]) result.settings.sceneCaptureType = exif[0xA406];
    
    // Image dimensions
    if (exif[0xA002]) result.technical.exifImageWidth = exif[0xA002];
    if (exif[0xA003]) result.technical.exifImageHeight = exif[0xA003];
    
    // Datetime information
    if (exif[0x9003]) result.datetime.dateTimeOriginal = exif[0x9003];
    if (exif[0x9004]) result.datetime.createDate = exif[0x9004];
    
    // Lens information
    if (exif[0xA432]) result.camera.lensInfo = exif[0xA432];
    if (exif[0xA433]) result.camera.lensMake = exif[0xA433];
    if (exif[0xA434]) result.camera.lensModel = exif[0xA434];
    if (exif[0xA405]) result.settings.focalLengthIn35mm = exif[0xA405];
    
    // Additional camera info
    if (exif[0xA430]) result.camera.ownerName = exif[0xA430];
    if (exif[0xA431]) result.camera.serialNumber = exif[0xA431];
    
    // Version information
    if (exif[0x9000]) result.camera.exifVersion = exif[0x9000];
    if (exif[0xA000]) result.camera.flashpixVersion = exif[0xA000];
    
    // User comment
    if (exif[0x9286]) result.camera.userComment = exif[0x9286];
  };
  
  /**
   * Process GPS tags (location information).
   * @param {object} result Result object
   * @param {object} gps GPS IFD tag data
   * @private
   */
  ns.processGpsTags_ = function(result, gps) {
    if (!gps) return;
    
    // GPS coordinates
    if (gps[0x0002] && gps[0x0001]) { // Latitude
      result.location.latitude = ns.convertDMSToDD_(gps[0x0002], gps[0x0001]);
      result.location.latitudeRef = gps[0x0001];
    }
    if (gps[0x0004] && gps[0x0003]) { // Longitude
      result.location.longitude = ns.convertDMSToDD_(gps[0x0004], gps[0x0003]);
      result.location.longitudeRef = gps[0x0003];
    }
    
    // GPS altitude
    if (gps[0x0006]) {
      result.location.altitude = gps[0x0006];
      if (gps[0x0005]) {
        result.location.altitudeRef = gps[0x0005] === 0 ? 'Above Sea Level' : 'Below Sea Level';
      }
    }
    
    // GPS timestamp
    if (gps[0x0007]) result.location.gpsTimeStamp = gps[0x0007];
    if (gps[0x001D]) result.location.gpsDateStamp = gps[0x001D];
  };
  
  /**
   * Convert GPS DMS (Degrees Minutes Seconds) to DD (Decimal Degrees).
   * @param {number[]} dms Array of [degrees, minutes, seconds]
   * @param {string} ref Reference (N/S for latitude, E/W for longitude)
   * @returns {number} Decimal degrees
   * @private
   */
  ns.convertDMSToDD_ = function(dms, ref) {
    if (!dms || dms.length < 3) return null;
    
    var dd = dms[0] + (dms[1] / 60) + (dms[2] / 3600);
    if (ref === 'S' || ref === 'W') dd *= -1;
    
    return Math.round(dd * 1000000) / 1000000; // 6 decimal places precision
  };
  
  /**
   * Derive additional information from parsed EXIF data.
   * @param {object} result Result object to enhance
   * @private
   */
  ns.deriveAdditionalInfo_ = function(result) {
    // Create camera description
    if (result.camera.make && result.camera.model) {
      result.camera.description = result.camera.make + ' ' + result.camera.model;
    } else if (result.camera.model) {
      result.camera.description = result.camera.model;
    }
    
    // Create lens description
    if (result.camera.lensMake && result.camera.lensModel) {
      result.camera.lensDescription = result.camera.lensMake + ' ' + result.camera.lensModel;
    } else if (result.camera.lensModel) {
      result.camera.lensDescription = result.camera.lensModel;
    }
    
    // Calculate exposure value if possible
    if (result.settings.apertureValue && result.settings.shutterSpeedValue) {
      result.settings.exposureValue = result.settings.apertureValue - result.settings.shutterSpeedValue;
    }
    
    // Format exposure time as fraction if needed
    if (result.settings.exposureTime && result.settings.exposureTime < 1) {
      result.settings.exposureTimeFraction = '1/' + Math.round(1 / result.settings.exposureTime);
    }
    
    // Create comprehensive datetime
    if (result.datetime.dateTimeOriginal) {
      result.datetime.primaryDateTime = result.datetime.dateTimeOriginal;
    } else if (result.datetime.createDate) {
      result.datetime.primaryDateTime = result.datetime.createDate;
    } else if (result.datetime.modifyDate) {
      result.datetime.primaryDateTime = result.datetime.modifyDate;
    }
    
    // Create location description
    if (result.location.latitude && result.location.longitude) {
      result.location.coordinates = result.location.latitude + ', ' + result.location.longitude;
      result.location.hasLocation = true;
    } else {
      result.location.hasLocation = false;
    }
  };
  
  /**
   * Enhanced extraction that integrates with existing Box metadata pipeline.
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid Box access token
   * @returns {object} Enhanced metadata compatible with Box template
   */
  ns.extractEnhancedMetadataForBox = function(fileId, accessToken) {
    var utils = initUtils_();
    
    try {
      // Download file with robust retry
      var downloadUrl = BOX_API_BASE_URL + '/files/' + fileId + '/content';
      
      var response = utils.rateLimitExpBackoff(function() {
        return UrlFetchApp.fetch(downloadUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log('EnhancedExifParser: Failed to download file ' + fileId + ' for metadata extraction');
        return null;
      }
      
      var imageBlob = response.getBlob();
      var imageBytes = imageBlob.getBytes();
      
      // Extract comprehensive EXIF
      var exifData = ns.extractComprehensiveExif(imageBytes);
      
      if (!exifData.hasExif) {
        Logger.log('EnhancedExifParser: No EXIF data found in file ' + fileId);
        return null;
      }
      
      // Convert to Box metadata format
      return ns.convertToBoxMetadata_(exifData);
      
    } catch (error) {
      Logger.log('EnhancedExifParser: Error extracting enhanced metadata for ' + fileId + ': ' + error.toString());
      return null;
    }
  };
  
  /**
   * Convert comprehensive EXIF data to Box metadata template format.
   * @param {object} exifData Comprehensive EXIF data
   * @returns {object} Box-compatible metadata
   * @private
   */
  ns.convertToBoxMetadata_ = function(exifData) {
    var boxMetadata = {};
    
    // Camera information
    if (exifData.camera.description) {
      boxMetadata.cameraModel = exifData.camera.description;
    }
    if (exifData.camera.artist) {
      boxMetadata.photographer = exifData.camera.artist;
    }
    if (exifData.camera.ownerName) {
      boxMetadata.photographer = boxMetadata.photographer || exifData.camera.ownerName;
    }
    if (exifData.camera.serialNumber) {
      boxMetadata.notes = (boxMetadata.notes ? boxMetadata.notes + '; ' : '') + 
        'Camera Serial: ' + exifData.camera.serialNumber;
    }
    if (exifData.camera.lensDescription) {
      boxMetadata.notes = (boxMetadata.notes ? boxMetadata.notes + '; ' : '') + 
        'Lens: ' + exifData.camera.lensDescription;
    }
    
    // Image technical specifications
    if (exifData.technical.exifImageWidth) {
      boxMetadata.imageWidth = exifData.technical.exifImageWidth;
    }
    if (exifData.technical.exifImageHeight) {
      boxMetadata.imageHeight = exifData.technical.exifImageHeight;
    }
    
    // Calculate aspect ratio and megapixels if dimensions available
    if (boxMetadata.imageWidth && boxMetadata.imageHeight) {
      var gcd = ns.calculateGCD_(boxMetadata.imageWidth, boxMetadata.imageHeight);
      boxMetadata.aspectRatio = (boxMetadata.imageWidth / gcd) + ':' + (boxMetadata.imageHeight / gcd);
      boxMetadata.megapixels = Math.round((boxMetadata.imageWidth * boxMetadata.imageHeight) / 1000000 * 10) / 10;
    }
    
    // DateTime information
    if (exifData.datetime.primaryDateTime) {
      boxMetadata.dateTaken = exifData.datetime.primaryDateTime;
    }
    
    // Camera settings for advanced users
    var technicalDetails = [];
    if (exifData.settings.iso) technicalDetails.push('ISO ' + exifData.settings.iso);
    if (exifData.settings.exposureTimeFraction) technicalDetails.push(exifData.settings.exposureTimeFraction + 's');
    if (exifData.settings.fNumber) technicalDetails.push('f/' + exifData.settings.fNumber);
    if (exifData.settings.focalLength) technicalDetails.push(exifData.settings.focalLength + 'mm');
    if (exifData.settings.focalLengthIn35mm) technicalDetails.push('(' + exifData.settings.focalLengthIn35mm + 'mm equiv)');
    
    if (technicalDetails.length > 0) {
      boxMetadata.notes = (boxMetadata.notes ? boxMetadata.notes + '; ' : '') + 
        'Settings: ' + technicalDetails.join(', ');
    }
    
    // Exposure and shooting mode descriptions
    var shootingInfo = [];
    if (exifData.settings.exposureProgramDesc && exifData.settings.exposureProgramDesc !== 'Unknown') {
      shootingInfo.push(exifData.settings.exposureProgramDesc);
    }
    if (exifData.settings.meteringModeDesc && exifData.settings.meteringModeDesc !== 'Unknown') {
      shootingInfo.push('Metering: ' + exifData.settings.meteringModeDesc);
    }
    if (exifData.settings.lightSourceDesc && exifData.settings.lightSourceDesc !== 'Unknown') {
      shootingInfo.push('Light: ' + exifData.settings.lightSourceDesc);
    }
    
    if (shootingInfo.length > 0) {
      boxMetadata.notes = (boxMetadata.notes ? boxMetadata.notes + '; ' : '') + 
        shootingInfo.join(', ');
    }
    
    // Location information (if available)
    if (exifData.location.hasLocation) {
      boxMetadata.notes = (boxMetadata.notes ? boxMetadata.notes + '; ' : '') + 
        'GPS: ' + exifData.location.coordinates;
      
      if (exifData.location.altitude) {
        boxMetadata.notes += ' Alt: ' + Math.round(exifData.location.altitude) + 'm';
      }
    }
    
    // Processing stage
    boxMetadata.processingStage = PROCESSING_STAGE_EXIF;
    boxMetadata.lastProcessedDate = new Date().toISOString();
    boxMetadata.processingVersion = PROCESSING_VERSION_ENHANCED;
    
    return boxMetadata;
  };
  
  /**
   * Calculate Greatest Common Divisor (Euclidean algorithm).
   * @param {number} a First number
   * @param {number} b Second number
   * @returns {number} GCD
   * @private
   */
  ns.calculateGCD_ = function(a, b) {
    return b === 0 ? a : ns.calculateGCD_(b, a % b);
  };
  
  /**
   * Test function for enhanced EXIF extraction.
   * @param {string} testFileId Box file ID to test with
   */
  ns.testEnhancedExtraction = function(testFileId) {
    Logger.log('=== Testing Enhanced EXIF Extraction ===\n');
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    testFileId = testFileId || ACTIVE_TEST_FOLDER_ID;
    
    try {
      // If testFileId is a folder, find an image in it
      if (testFileId === ACTIVE_TEST_FOLDER_ID) {
        var images = BoxFileOperations.findAllImageFiles(testFileId, accessToken);
        if (images.length === 0) {
          Logger.log('❌ No images found in test folder');
          return;
        }
        testFileId = images[0].id;
        Logger.log('Testing with file: ' + images[0].name);
      }
      
      Logger.log('Extracting enhanced metadata from file ID: ' + testFileId);
      
      var enhancedMetadata = ns.extractEnhancedMetadataForBox(testFileId, accessToken);
      
      if (enhancedMetadata) {
        Logger.log('✅ Enhanced EXIF extraction successful!');
        Logger.log('\nExtracted metadata:');
        
        Object.keys(enhancedMetadata).forEach(function(key) {
          Logger.log('  ' + key + ': ' + enhancedMetadata[key]);
        });
        
        Logger.log('\n📊 Enhanced extraction provides:');
        Logger.log('• Comprehensive camera information');
        Logger.log('• Detailed shooting settings');
        Logger.log('• Precise image dimensions and ratios');
        Logger.log('• GPS location data (if available)');
        Logger.log('• Technical metadata organized for Box template');
        
      } else {
        Logger.log('❌ No enhanced metadata extracted (file may not have EXIF data)');
      }
      
    } catch (error) {
      Logger.log('❌ Test failed: ' + error.toString());
    }
  };
  
  return ns;
})();