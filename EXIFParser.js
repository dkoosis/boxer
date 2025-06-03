// File: ExifParser.gs
// Robust metadata extraction from multiple image formats
// Depends on: Config.gs, BoxAuth.gs

/**
 * EnhancedExifParser namespace - comprehensive metadata extraction for multiple image formats.
 * Provides comprehensive metadata extraction with sophisticated parsing and fallback mechanisms.
 */
var EnhancedExifParser = (function() {
  'use strict';
  
  var ns = {};
  var utils_ = null;
  
  // Enhanced file format signatures
  var FILE_SIGNATURES = {
    JPEG: [0xFF, 0xD8],
    PNG: [0x89, 0x50, 0x4E, 0x47],
    WEBP: [0x52, 0x49, 0x46, 0x46], // followed by WEBP at offset 8
    HEIC: [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70], // ftyp box
    AVIF: [0x00, 0x00, 0x00, null, 0x66, 0x74, 0x79, 0x70], // ftyp box
    GIF: [0x47, 0x49, 0x46], // GIF
    TIFF_LE: [0x49, 0x49, 0x2A, 0x00], // Little endian TIFF
    TIFF_BE: [0x4D, 0x4D, 0x00, 0x2A], // Big endian TIFF
    BMP: [0x42, 0x4D],
    ICO: [0x00, 0x00, 0x01, 0x00]
  };
  
  // EXIF data type constants
  var EXIF_TYPES = {
    BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5,
    SBYTE: 6, UNDEFINED: 7, SSHORT: 8, SLONG: 9, SRATIONAL: 10,
    FLOAT: 11, DOUBLE: 12
  };
  
  var TYPE_SIZES = [undefined, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  
  // Comprehensive EXIF tags with enhanced mappings
  var EXIF_TAGS = {
    // Camera and capture info
    0x010F: 'Make', 0x0110: 'Model', 0x0131: 'Software',
    0x0132: 'DateTime', 0x013B: 'Artist', 0x8298: 'Copyright',
    
    // Image dimensions and format
    0x0100: 'ImageWidth', 0x0101: 'ImageLength', 0x0102: 'BitsPerSample',
    0x0103: 'Compression', 0x0106: 'PhotometricInterpretation',
    0x0112: 'Orientation', 0x011A: 'XResolution', 0x011B: 'YResolution',
    0x0128: 'ResolutionUnit',
    
    // Camera settings
    0x829A: 'ExposureTime', 0x829D: 'FNumber', 0x8822: 'ExposureProgram',
    0x8827: 'ISOSpeedRatings', 0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue',
    0x9204: 'ExposureBiasValue', 0x9207: 'MeteringMode', 0x9208: 'LightSource',
    0x9209: 'Flash', 0x920A: 'FocalLength', 0xA405: 'FocalLengthIn35mmFilm',
    
    // Date/time
    0x9003: 'DateTimeOriginal', 0x9004: 'DateTimeDigitized',
    
    // Color and quality
    0xA001: 'ColorSpace', 0xA402: 'ExposureMode', 0xA403: 'WhiteBalance',
    0xA406: 'SceneCaptureType', 0xA408: 'Contrast', 0xA409: 'Saturation',
    0xA40A: 'Sharpness',
    
    // Advanced camera info
    0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension',
    0xA430: 'CameraOwnerName', 0xA431: 'BodySerialNumber',
    0xA433: 'LensMake', 0xA434: 'LensModel', 0xA435: 'LensSerialNumber',
    
    // GPS data
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x001D: 'GPSDateStamp',
    
    // Maker notes and metadata
    0x927C: 'MakerNote', 0x9286: 'UserComment', 0x83BB: 'IPTC',
    0x8773: 'ICC_Profile', 0x02BC: 'XMLPacket'
  };
  
  // Value interpretations for specific tags
  var TAG_INTERPRETATIONS = {
    0x0112: { // Orientation
      1: 'Normal', 2: 'Mirror horizontal', 3: 'Rotate 180°', 4: 'Mirror vertical',
      5: 'Mirror horizontal + rotate 270°', 6: 'Rotate 90°',
      7: 'Mirror horizontal + rotate 90°', 8: 'Rotate 270°'
    },
    0x8822: { // ExposureProgram
      0: 'Not defined', 1: 'Manual', 2: 'Normal program', 3: 'Aperture priority',
      4: 'Shutter priority', 5: 'Creative program', 6: 'Action program',
      7: 'Portrait mode', 8: 'Landscape mode'
    },
    0x9207: { // MeteringMode
      0: 'Unknown', 1: 'Average', 2: 'Center-weighted average', 3: 'Spot',
      4: 'Multi-spot', 5: 'Pattern', 6: 'Partial', 255: 'Other'
    },
    0xA001: { // ColorSpace
      1: 'sRGB', 0xFFFF: 'Uncalibrated'
    }
  };
  
  /**
   * Initialize cUseful utilities
   * @private
   */
  function initUtils_() {
    if (!utils_) {
      try {
        utils_ = cUseful;
        Logger.log('ℹ️ ExifParser: cUseful library initialized');
      } catch (e) {
        Logger.log('❌ ERROR: EnhancedExifParser - cUseful library not available');
        throw new Error('cUseful library is required but not available');
      }
    }
    return utils_;
  }
  
  /**
   * Enhanced file format detection with multiple signatures
   * @param {Uint8Array} bytes Image data
   * @returns {string|null} Detected format
   */
  function detectFileFormat_(bytes) {
    if (!bytes || bytes.length < 12) return null;
    
    try {
      // JPEG
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'JPEG';
      
      // PNG
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'PNG';
      
      // WebP (RIFF + WEBP)
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'WEBP';
      
      // HEIC/HEIF (check ftyp box)
      if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        var brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1'].indexOf(brand) !== -1) {
          return 'HEIC';
        }
        if (brand === 'avif') return 'AVIF';
      }
      
      // GIF
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'GIF';
      
      // TIFF
      if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
          (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) return 'TIFF';
      
      // BMP
      if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'BMP';
      
      return null;
    } catch (error) {
      Logger.log('Error detecting file format: ' + error.toString());
      return null;
    }
  }
  
  /**
   * Safe buffer view creation with enhanced error handling
   * @param {Uint8Array} bytes Raw byte data
   * @param {boolean} littleEndian Endianness flag
   * @returns {object} Buffer view object
   */
  function createSafeBufferView_(bytes, littleEndian) {
    if (!bytes || bytes.length === 0) {
      throw new Error('Invalid or empty byte array');
    }
    
    try {
      var dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return {
        bytes: bytes,
        dataView: dataView,
        littleEndian: littleEndian || false,
        byteLength: bytes.length,
        
        safeGetUint8: function(offset) {
          if (offset < 0 || offset >= this.byteLength) return null;
          try { return this.dataView.getUint8(offset); } catch (e) { return null; }
        },
        
        safeGetUint16: function(offset) {
          if (offset < 0 || offset + 1 >= this.byteLength) return null;
          try { return this.dataView.getUint16(offset, this.littleEndian); } catch (e) { return null; }
        },
        
        safeGetUint32: function(offset) {
          if (offset < 0 || offset + 3 >= this.byteLength) return null;
          try { return this.dataView.getUint32(offset, this.littleEndian); } catch (e) { return null; }
        },
        
        safeGetString: function(offset, length) {
          if (offset < 0 || offset + length > this.byteLength || length <= 0) return '';
          try {
            var chars = [];
            for (var i = 0; i < length; i++) {
              var charCode = this.bytes[offset + i];
              if (charCode === 0) break;
              if (charCode >= 32 && charCode <= 126) chars.push(String.fromCharCode(charCode));
            }
            return chars.join('');
          } catch (e) { return ''; }
        },
        
        safeGetBytes: function(offset, length) {
          if (offset < 0 || offset + length > this.byteLength || length <= 0) return new Uint8Array(0);
          try { return this.bytes.slice(offset, offset + length); } catch (e) { return new Uint8Array(0); }
        }
      };
    } catch (error) {
      throw new Error('Failed to create buffer view: ' + error.toString());
    }
  }
  
  /**
   * Find EXIF segment in JPEG with enhanced error handling
   * @param {Uint8Array} imageBytes JPEG image data
   * @returns {Uint8Array|null} EXIF data segment
   */
  function findExifSegment_(imageBytes) {
    if (!imageBytes || imageBytes.length < 20) return null;
    
    try {
      var offset = 2; // Skip SOI marker
      var maxSearchOffset = Math.min(imageBytes.length - 4, 65536); // Search in first 64KB
      
      while (offset < maxSearchOffset) {
        if (imageBytes[offset] === 0xFF) {
          var markerType = imageBytes[offset + 1];
          
          if (markerType === 0xE1) { // APP1 marker
            var segmentLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
            var exifHeaderOffset = offset + 4;
            
            // Check for "Exif\0\0" header
            if (exifHeaderOffset + 6 <= imageBytes.length &&
                imageBytes[exifHeaderOffset] === 0x45 && imageBytes[exifHeaderOffset + 1] === 0x78 &&
                imageBytes[exifHeaderOffset + 2] === 0x69 && imageBytes[exifHeaderOffset + 3] === 0x66 &&
                imageBytes[exifHeaderOffset + 4] === 0x00 && imageBytes[exifHeaderOffset + 5] === 0x00) {
              
              var tiffDataStart = exifHeaderOffset + 6;
              var tiffDataLength = segmentLength - 8; // Subtract APP1 header and "Exif\0\0"
              
              if (tiffDataStart + tiffDataLength <= imageBytes.length) {
                return imageBytes.slice(tiffDataStart, tiffDataStart + tiffDataLength);
              }
            }
          }
          
          // Move to next segment
          if (offset + 2 < imageBytes.length) {
            var segLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
            offset += segLength + 2;
          } else {
            break;
          }
        } else {
          offset++;
        }
      }
      
      return null;
    } catch (error) {
      Logger.log('Error finding EXIF segment: ' + error.toString());
      return null;
    }
  }
  
  /**
   * Parse TIFF structure with comprehensive error handling
   * @param {Uint8Array} tiffData TIFF/EXIF data
   * @returns {object|null} Parsed TIFF structure
   */
  function parseTiffStructure_(tiffData) {
    if (!tiffData || tiffData.length < 8) return null;
    
    try {
      var byteOrder = (tiffData[0] << 8) | tiffData[1];
      var littleEndian = byteOrder === 0x4949;
      
      if (byteOrder !== 0x4949 && byteOrder !== 0x4D4D) {
        Logger.log('Invalid TIFF byte order: ' + byteOrder.toString(16));
        return null;
      }
      
      var view = createSafeBufferView_(tiffData, littleEndian);
      var magic = view.safeGetUint16(2);
      
      if (magic !== 42) {
        Logger.log('Invalid TIFF magic number: ' + magic);
        return null;
      }
      
      var ifd0Offset = view.safeGetUint32(4);
      if (!ifd0Offset || ifd0Offset >= tiffData.length) {
        Logger.log('Invalid IFD0 offset: ' + ifd0Offset);
        return null;
      }
      
      var parsedData = {
        littleEndian: littleEndian,
        ifd0: {},
        exif: {},
        gps: {}
      };
      
      // Parse IFD0
      parsedData.ifd0 = parseIFD_(view, ifd0Offset, 'IFD0');
      
      // Parse EXIF IFD if present
      var exifOffset = parsedData.ifd0[0x8769];
      if (exifOffset && exifOffset < tiffData.length) {
        parsedData.exif = parseIFD_(view, exifOffset, 'ExifIFD');
      }
      
      // Parse GPS IFD if present
      var gpsOffset = parsedData.ifd0[0x8825];
      if (gpsOffset && gpsOffset < tiffData.length) {
        parsedData.gps = parseIFD_(view, gpsOffset, 'GPSIFD');
      }
      
      return parsedData;
      
    } catch (error) {
      Logger.log('Error parsing TIFF structure: ' + error.toString());
      return null;
    }
  }
  
  /**
   * Parse IFD with enhanced error handling
   * @param {object} view Buffer view
   * @param {number} offset IFD offset
   * @param {string} ifdName IFD name for logging
   * @returns {object} Parsed tags
   */
  function parseIFD_(view, offset, ifdName) {
    var tags = {};
    
    try {
      var entryCount = view.safeGetUint16(offset);
      if (!entryCount || entryCount > 1000) { // Reasonable limit
        Logger.log('Invalid entry count for ' + ifdName + ': ' + entryCount);
        return tags;
      }
      
      offset += 2;
      
      for (var i = 0; i < entryCount; i++) {
        if (offset + 12 > view.byteLength) break;
        
        var tagId = view.safeGetUint16(offset);
        var type = view.safeGetUint16(offset + 2);
        var count = view.safeGetUint32(offset + 4);
        var valueDataOffset = offset + 8;
        
        if (!tagId || !type || type > 12 || !count || count > 100000) {
          offset += 12;
          continue;
        }
        
        var typeSize = TYPE_SIZES[type] || 1;
        var totalValueBytes = typeSize * count;
        var actualValueOffset = valueDataOffset;
        
        if (totalValueBytes > 4) {
          actualValueOffset = view.safeGetUint32(valueDataOffset);
          if (!actualValueOffset || actualValueOffset + totalValueBytes > view.byteLength) {
            offset += 12;
            continue;
          }
        }
        
        var value = parseTagValue_(view, type, actualValueOffset, count, tagId);
        if (value !== null) {
          var tagName = EXIF_TAGS[tagId] || ('Tag0x' + tagId.toString(16));
          tags[tagName] = value;
          tags[tagId] = value; // Also store by ID
        }
        
        offset += 12;
      }
    } catch (error) {
      Logger.log('Error parsing ' + ifdName + ': ' + error.toString());
    }
    
    return tags;
  }
  
  /**
   * Parse tag value with enhanced type handling
   * @param {object} view Buffer view
   * @param {number} type Data type
   * @param {number} offset Value offset
   * @param {number} count Value count
   * @param {number} tagId Tag identifier
   * @returns {*} Parsed value
   */
  function parseTagValue_(view, type, offset, count, tagId) {
    try {
      var values = [];
      
      switch (type) {
        case EXIF_TYPES.BYTE:
        case EXIF_TYPES.UNDEFINED:
          if (count > 1000) return null; // Reasonable limit
          for (var i = 0; i < count; i++) {
            var val = view.safeGetUint8(offset + i);
            if (val !== null) values.push(val);
          }
          break;
          
        case EXIF_TYPES.ASCII:
          return view.safeGetString(offset, Math.min(count, 1000));
          
        case EXIF_TYPES.SHORT:
          if (count > 500) return null;
          for (var i = 0; i < count; i++) {
            var val = view.safeGetUint16(offset + i * 2);
            if (val !== null) values.push(val);
          }
          break;
          
        case EXIF_TYPES.LONG:
          if (count > 250) return null;
          for (var i = 0; i < count; i++) {
            var val = view.safeGetUint32(offset + i * 4);
            if (val !== null) values.push(val);
          }
          break;
          
        case EXIF_TYPES.RATIONAL:
          if (count > 125) return null;
          for (var i = 0; i < count; i++) {
            var num = view.safeGetUint32(offset + i * 8);
            var den = view.safeGetUint32(offset + i * 8 + 4);
            if (num !== null && den !== null) {
              values.push(den === 0 ? 0 : num / den);
            }
          }
          break;
          
        default:
          return null;
      }
      
      return count === 1 ? (values[0] || 0) : values;
      
    } catch (error) {
      Logger.log('Error parsing tag value: ' + error.toString());
      return null;
    }
  }
  
  /**
   * Extract basic file information
   * @param {Uint8Array} imageBytes Image data
   * @returns {object} Basic file info
   */
  function extractBasicFileInfo_(imageBytes) {
    var info = {
      fileSize: imageBytes.length,
      format: detectFileFormat_(imageBytes),
      width: null,
      height: null,
      hasMetadata: false
    };
    
    try {
      // Try to extract basic dimensions based on format
      if (info.format === 'PNG' && imageBytes.length >= 24) {
        var view = new DataView(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength);
        info.width = view.getUint32(16);
        info.height = view.getUint32(20);
      } else if (info.format === 'GIF' && imageBytes.length >= 10) {
        var view = new DataView(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength);
        info.width = view.getUint16(6, true); // Little endian
        info.height = view.getUint16(8, true);
      } else if (info.format === 'BMP' && imageBytes.length >= 26) {
        var view = new DataView(imageBytes.buffer, imageBytes.byteOffset, imageBytes.byteLength);
        info.width = view.getUint32(18, true);
        info.height = view.getUint32(22, true);
      }
    } catch (error) {
      Logger.log('Error extracting basic file info: ' + error.toString());
    }
    
    return info;
  }
  
  /**
   * Organize extracted EXIF data into useful categories
   * @param {object} tiffStructure Parsed TIFF structure
   * @param {object} basicInfo Basic file information
   * @returns {object} Organized metadata
   */
  function organizeMetadata_(tiffStructure, basicInfo) {
    var result = {
      hasExif: false,
      fileInfo: basicInfo,
      camera: {},
      settings: {},
      image: {},
      datetime: {},
      location: {},
      technical: {},
      other: {}
    };
    
    if (!tiffStructure) return result;
    
    result.hasExif = true;
    
    try {
      // Combine all tags
      var allTags = {};
      Object.keys(tiffStructure.ifd0 || {}).forEach(function(key) {
        allTags[key] = tiffStructure.ifd0[key];
      });
      Object.keys(tiffStructure.exif || {}).forEach(function(key) {
        allTags[key] = tiffStructure.exif[key];
      });
      Object.keys(tiffStructure.gps || {}).forEach(function(key) {
        allTags[key] = tiffStructure.gps[key];
      });
      
      // Organize by category
      Object.keys(allTags).forEach(function(key) {
        var value = allTags[key];
        var tagName = EXIF_TAGS[parseInt(key)] || key;
        
        // Camera information
        if (['Make', 'Model', 'Software', 'LensMake', 'LensModel', 'CameraOwnerName', 'BodySerialNumber'].indexOf(tagName) !== -1) {
          result.camera[tagName.toLowerCase()] = value;
        }
        // Camera settings
        else if (['ExposureTime', 'FNumber', 'ISOSpeedRatings', 'FocalLength', 'Flash', 'MeteringMode', 'ExposureProgram', 'WhiteBalance'].indexOf(tagName) !== -1) {
          result.settings[tagName.toLowerCase()] = value;
          // Add interpreted values
          var tagId = parseInt(key);
          if (TAG_INTERPRETATIONS[tagId] && TAG_INTERPRETATIONS[tagId][value]) {
            result.settings[tagName.toLowerCase() + 'Desc'] = TAG_INTERPRETATIONS[tagId][value];
          }
        }
        // Image properties
        else if (['ImageWidth', 'ImageLength', 'Orientation', 'ColorSpace', 'PixelXDimension', 'PixelYDimension'].indexOf(tagName) !== -1) {
          result.image[tagName.toLowerCase()] = value;
          if (tagName === 'Orientation' && TAG_INTERPRETATIONS[0x0112] && TAG_INTERPRETATIONS[0x0112][value]) {
            result.image.orientationDesc = TAG_INTERPRETATIONS[0x0112][value];
          }
        }
        // Date/time
        else if (['DateTime', 'DateTimeOriginal', 'DateTimeDigitized'].indexOf(tagName) !== -1) {
          result.datetime[tagName.toLowerCase()] = value;
        }
        // GPS/location
        else if (tagName.startsWith('GPS')) {
          result.location[tagName.toLowerCase()] = value;
        }
        // Technical details
        else if (['XResolution', 'YResolution', 'ResolutionUnit', 'Compression', 'PhotometricInterpretation'].indexOf(tagName) !== -1) {
          result.technical[tagName.toLowerCase()] = value;
        }
        // Everything else
        else {
          result.other[tagName.toLowerCase()] = value;
        }
      });
      
      // Process GPS coordinates if available
      if (result.location.gpslatitude && result.location.gpslatituderef && 
          result.location.gpslongitude && result.location.gpslongituderef) {
        try {
          result.location.latitude = convertDMSToDD_(result.location.gpslatitude, result.location.gpslatituderef);
          result.location.longitude = convertDMSToDD_(result.location.gpslongitude, result.location.gpslongituderef);
        } catch (e) {
          Logger.log('Error converting GPS coordinates: ' + e.toString());
        }
      }
      
      // Process GPS altitude if available
      if (result.location.gpsaltitude && typeof result.location.gpsaltitude === 'number') {
        result.location.altitude = result.location.gpsaltitude;
        // Check altitude reference (0 = above sea level, 1 = below sea level)
        if (result.location.gpsaltituderef === 1) {
          result.location.altitude = -result.location.altitude;
        }
      }
      
      // Calculate useful derived values
      if (result.image.imagewidth && result.image.imagelength) {
        result.image.aspectRatio = calculateAspectRatio_(result.image.imagewidth, result.image.imagelength);
        result.image.megapixels = Math.round(result.image.imagewidth * result.image.imagelength / 1000000 * 10) / 10;
      }
      
    } catch (error) {
      Logger.log('Error organizing metadata: ' + error.toString());
    }
    
    return result;
  }
  
  /**
   * Convert DMS (Degrees, Minutes, Seconds) to decimal degrees
   * @param {Array} dms DMS array [degrees, minutes, seconds]
   * @param {string} ref Reference (N/S for latitude, E/W for longitude)
   * @returns {number} Decimal degrees
   */
  function convertDMSToDD_(dms, ref) {
    if (!Array.isArray(dms) || dms.length < 3) return 0;
    var dd = dms[0] + dms[1] / 60 + dms[2] / 3600;
    return (ref === 'S' || ref === 'W') ? -dd : dd;
  }
  
  /**
   * Calculate aspect ratio
   * @param {number} width Image width
   * @param {number} height Image height
   * @returns {string} Aspect ratio as string
   */
  function calculateAspectRatio_(width, height) {
    if (!width || !height) return null;
    var gcd = function(a, b) { return b === 0 ? a : gcd(b, a % b); };
    var divisor = gcd(width, height);
    return (width / divisor) + ':' + (height / divisor);
  }
  
  /**
   * Convert metadata to Box-compatible format
   * @param {object} metadata Organized metadata
   * @returns {object} Box-compatible metadata
   */
function convertToBoxFormat_(metadata) {
  var boxMetadata = {
    // Initialize with defaults, but consider what's appropriate if no EXIF found
    processingStage: metadata.hasExif ? Config.PROCESSING_STAGE_EXIF : Config.PROCESSING_STAGE_BASIC,
    lastProcessedDate: new Date().toISOString(),
    processingVersion: metadata.hasExif ? Config.PROCESSING_VERSION_ENHANCED : Config.PROCESSING_VERSION_BASIC 
  };

  try {
    // Camera and technical info
    if (metadata.camera && (metadata.camera.make || metadata.camera.model)) {
      boxMetadata.cameraModel = [metadata.camera.make, metadata.camera.model].filter(Boolean).join(' ');
    }

    // Image dimensions
// In convertToBoxFormat_, ensure numeric fields are numbers:
if (metadata.image && metadata.image.imagewidth) {
  boxMetadata.imageWidth = Number(metadata.image.imagewidth);
  boxMetadata.imageHeight = Number(metadata.image.imagelength);
}
if (typeof metadata.location.latitude === 'number') {
  boxMetadata.gpsLatitude = Number(metadata.location.latitude);
}



    if (metadata.image && metadata.image.imagewidth && metadata.image.imagelength) {
      boxMetadata.imageWidth = metadata.image.imagewidth;
      boxMetadata.imageHeight = metadata.image.imagelength;
      if (metadata.image.aspectRatio) boxMetadata.aspectRatio = metadata.image.aspectRatio;
      if (metadata.image.megapixels) boxMetadata.megapixels = metadata.image.megapixels;
    } else if (metadata.fileInfo && metadata.fileInfo.width && metadata.fileInfo.height) {
      // Fallback to basicInfo if available (e.g., from PNG header parsing in extractBasicFileInfo_)
      boxMetadata.imageWidth = metadata.fileInfo.width;
      boxMetadata.imageHeight = metadata.fileInfo.height;
    }

    // Date taken
// In EXIFParser.js, fix the date conversion:
if (metadata.datetime && metadata.datetime.datetimeoriginal) {
  const dateValue = metadata.datetime.datetimeoriginal;
  if (typeof dateValue === 'string') {
    try {
      const isoDate = dateValue.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const parsedDate = new Date(isoDate);
      if (!isNaN(parsedDate.getTime())) {
        boxMetadata.dateTaken = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    } catch (e) {
      // Skip invalid dates
    }
  }
}


 if (metadata.datetime && metadata.datetime.datetimeoriginal) {
  const dateValue = metadata.datetime.datetimeoriginal;
  if (typeof dateValue === 'string') {
    try {
      const isoDate = dateValue.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const parsedDate = new Date(isoDate);
      if (!isNaN(parsedDate.getTime())) {
        boxMetadata.dateTaken = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    } catch (e) {
      // Skip invalid dates
    }
  }
} else if (metadata.datetime && metadata.datetime.datetime) {
  const dateValue = metadata.datetime.datetime;
  if (typeof dateValue === 'string') {
    try {
      const isoDate = dateValue.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
      const parsedDate = new Date(isoDate);
      if (!isNaN(parsedDate.getTime())) {
        boxMetadata.dateTaken = parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      }
    } catch (e) {
      // Skip invalid dates
    }
  }
}

    // Camera settings summary
    if (metadata.settings) {
        var settings = [];
        if (metadata.settings.fnumber) settings.push('f/' + metadata.settings.fnumber);
        if (metadata.settings.exposuretime) {
            var et = metadata.settings.exposuretime;
            settings.push((et > 0.25 ? et + 's' : '1/' + Math.round(1/et) + 's'));
        }
        if (metadata.settings.isospeedratings) settings.push('ISO ' + metadata.settings.isospeedratings);
        if (metadata.settings.focallength) settings.push(metadata.settings.focallength + 'mm');
        
        if (settings.length > 0) {
            boxMetadata.cameraSettings = settings.join(', ');
        }
    }

    // GPS coordinates - ALL THREE VALUES
    if (metadata.location) {
      if (metadata.location.latitude && metadata.location.longitude) {
        boxMetadata.gpsLatitude = metadata.location.latitude;
        boxMetadata.gpsLongitude = metadata.location.longitude;
      }
      
      // GPS altitude
      if (typeof metadata.location.altitude === 'number') {
        boxMetadata.gpsAltitude = metadata.location.altitude;
      }
    }

    // File format
    if (metadata.fileInfo && metadata.fileInfo.format) {
      boxMetadata.fileFormat = metadata.fileInfo.format;
    }

    // Technical notes
    var notes = [];
    if (metadata.image && metadata.image.orientationDesc) notes.push('Orientation: ' + metadata.image.orientationDesc);
    if (metadata.settings && metadata.settings.exposureprogramdesc) notes.push('Mode: ' + metadata.settings.exposureprogramdesc);
    if (metadata.settings && metadata.settings.whitebalancedesc) notes.push('WB: ' + metadata.settings.whitebalancedesc);
    
    if (notes.length > 0) {
      boxMetadata.technicalNotes = notes.join('; ');
    }

  } catch (error) {
    // Log the error but avoid crashing the main flow if metadata is partially processed.
    // The calling function should decide how to handle this.
    Logger.log('Error during convertToBoxFormat_: ' + error.toString() + ' - Metadata from parser: ' + JSON.stringify(metadata));
    // Consider adding a specific error field to boxMetadata if needed.
  }

  return boxMetadata;
}
  
  /**
   * Main extraction function - comprehensive metadata extraction from image files
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid Box access token
   * @returns {object|null} Comprehensive metadata or null on error
   */
ns.extractMetadata = function(fileId, accessToken, filename) {
  const fileDisplayName = filename || fileId;

  if (!fileId || !accessToken) {
    Logger.log('ERROR: EnhancedExifParser.extractMetadata requires fileId and accessToken');
    return null;
  }

  var utils = initUtils_();

  try {
    Logger.log(` > Parsing file structure for EXIF data from ${fileDisplayName}...`);

    var downloadUrl = Config.BOX_API_BASE_URL + '/files/' + fileId + '/content';
    var response = utils.rateLimitExpBackoff(function() {
      return UrlFetchApp.fetch(downloadUrl, {
        headers: { 'Authorization': 'Bearer ' + accessToken },
        muteHttpExceptions: true
      });
    });

    if (response.getResponseCode() !== 200) {
      Logger.log(`    Failed to download ${fileDisplayName} for metadata extraction. HTTP Code: ${response.getResponseCode()}`);
      return null;
    }

    var imageBlob = response.getBlob();
    var imageBytes = new Uint8Array(imageBlob.getBytes());

    var basicInfo = extractBasicFileInfo_(imageBytes);
    basicInfo.filename = fileDisplayName; // Add filename to basicInfo for convertToBoxFormat_
    Logger.log(` > Format detected: ${(basicInfo.format || 'Unknown')} for ${fileDisplayName}.`);

    var metadataFromParser = null; // Renamed to avoid conflict

    if (basicInfo.format === 'JPEG') {
      metadataFromParser = extractJpegMetadata_(imageBytes, basicInfo);
    } else if (['PNG', 'WEBP', 'HEIC', 'AVIF', 'TIFF'].indexOf(basicInfo.format) !== -1) {
      metadataFromParser = extractOtherFormatMetadata_(imageBytes, basicInfo);
    } else {
      metadataFromParser = extractJpegMetadata_(imageBytes, basicInfo);
      if (!metadataFromParser || !metadataFromParser.hasExif) {
        metadataFromParser = { hasExif: false, fileInfo: basicInfo };
      }
    }

    if (metadataFromParser) {
      Logger.log(` > File parsed and EXIF structure processed for ${fileDisplayName}.`);
      return convertToBoxFormat_(metadataFromParser); // This now returns the Box-ready metadata
    } else {
      Logger.log(` ⚠️ No processable EXIF structure found in ${fileDisplayName}.`);
      // Return a minimal Box-formatted object even if no EXIF, based on basicInfo
      return convertToBoxFormat_({ hasExif: false, fileInfo: basicInfo });
    }

  } catch (error) {
    Logger.log(`    ERROR: Parsing EXIF from ${fileDisplayName} failed: ${error.toString()}`);
    // Return a minimal Box-formatted object on error, possibly with an error note
    const errorBasicInfo = { filename: fileDisplayName, fileSize: imageBytes ? imageBytes.length : 0, format: 'unknown' };
    let boxErrorFormat = convertToBoxFormat_({ hasExif: false, fileInfo: errorBasicInfo });
    boxErrorFormat.technicalNotes = (boxErrorFormat.technicalNotes || "") + ` EXIF Parsing Error: ${error.message}`;
    return boxErrorFormat;
  }
};

  /**
   * Extract metadata from JPEG files
   * @param {Uint8Array} imageBytes Image data
   * @param {object} basicInfo Basic file info
   * @returns {object|null} Extracted metadata
   */
  function extractJpegMetadata_(imageBytes, basicInfo) {
    try {
      var exifData = findExifSegment_(imageBytes);
      if (!exifData) {
        Logger.log(' ⚠️ No EXIF data found in JPEG');
        return { hasExif: false, fileInfo: basicInfo };
      }
      
      var tiffStructure = parseTiffStructure_(exifData);
      return organizeMetadata_(tiffStructure, basicInfo);
      
    } catch (error) {
      Logger.log('Error extracting JPEG metadata: ' + error.toString());
      return { hasExif: false, fileInfo: basicInfo };
    }
  }
  
  /**
   * Extract metadata from other formats (basic implementation)
   * @param {Uint8Array} imageBytes Image data
   * @param {object} basicInfo Basic file info
   * @returns {object} Basic metadata
   */
  function extractOtherFormatMetadata_(imageBytes, basicInfo) {
    // For now, return basic file info
    // TODO: Implement format-specific metadata extraction for PNG, WEBP, etc.
    Logger.log(' ⚠️ Format-specific extraction not yet implemented for ' + basicInfo.format);
    return { hasExif: false, fileInfo: basicInfo };
  }
  
  /**
   * Comprehensive test function
   * @param {string} testFileId Optional test file ID
   */
  ns.testMetadataExtraction = function(testFileId) {
    Logger.log("=== Comprehensive Metadata Extraction Test ===");
    
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log("❌ No access token available");
      return;
    }
    
    try {
      if (!testFileId) {
        var testImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID, accessToken);
        if (testImages.length === 0) {
          Logger.log("❌ No test images found");
          return;
        }
        testFileId = testImages[0].id;
        Logger.log("Testing with: " + testImages[0].name);
      }
      
      var result = ns.extractMetadata(testFileId, accessToken);
      
      if (result) {
        Logger.log("✅ Extraction successful!");
        Logger.log("Extracted metadata:");
        Object.keys(result).forEach(function(key) {
          if (typeof result[key] !== 'object') {
            Logger.log("  " + key + ": " + result[key]);
          }
        });
      } else {
        Logger.log("❌ No metadata extracted");
      }
      
    } catch (error) {
      Logger.log("❌ Test failed: " + error.toString());
    }
  };
  
  // Legacy function for compatibility
  ns.extractComprehensiveExif = function(imageBytes) {
    if (!imageBytes) return { hasExif: false };
    
    var basicInfo = extractBasicFileInfo_(imageBytes);
    var metadata = extractJpegMetadata_(imageBytes, basicInfo);
    
    return metadata || { hasExif: false, fileInfo: basicInfo };
  };
  
  return ns;
})();