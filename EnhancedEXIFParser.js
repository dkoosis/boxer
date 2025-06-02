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
    RATIONAL: 5,  // 64-bit unsigned fraction (two LONGs)
    SBYTE: 6,     // 8-bit signed integer
    UNDEFINED: 7, // 8-bit untyped data
    SSHORT: 8,    // 16-bit signed integer
    SLONG: 9,     // 32-bit signed integer
    SRATIONAL: 10,// 64-bit signed fraction (two SLONGs)
    FLOAT: 11,    // 32-bit IEEE floating point
    DOUBLE: 12    // 64-bit IEEE floating point
  };
  
  // Size lookup for EXIF data types in bytes
  var TYPE_SIZES = [
    undefined, // 0
    1, // BYTE
    1, // ASCII
    2, // SHORT
    4, // LONG
    8, // RATIONAL
    1, // SBYTE
    1, // UNDEFINED
    2, // SSHORT
    4, // SLONG
    8, // SRATIONAL
    4, // FLOAT
    8  // DOUBLE
  ];
  
  // Endianness constants
  var TIFF_LITTLE_ENDIAN = 0x4949; // 'II'
  var TIFF_BIG_ENDIAN = 0x4D4D;   // 'MM'
  
  // EXIF tag definitions (expanded set)
  var EXIF_TAGS = {
    // IFD0 tags (Primary Image Data)
    0x0100: 'ImageWidth',
    0x0101: 'ImageHeight',
    0x0102: 'BitsPerSample',
    0x0103: 'Compression',
    0x0106: 'PhotometricInterpretation',
    0x010E: 'ImageDescription',
    0x010F: 'Make',
    0x0110: 'Model',
    0x0111: 'StripOffsets', // For TIFF, not typically used for JPEG EXIF directly by this parser
    0x0112: 'Orientation',
    0x0115: 'SamplesPerPixel',
    0x0116: 'RowsPerStrip',
    0x0117: 'StripByteCounts',
    0x011A: 'XResolution',
    0x011B: 'YResolution',
    0x011C: 'PlanarConfiguration',
    0x0128: 'ResolutionUnit',
    0x012D: 'TransferFunction',
    0x0131: 'Software',
    0x0132: 'DateTime', // Modification date/time
    0x013B: 'Artist',
    0x013E: 'WhitePoint',
    0x013F: 'PrimaryChromaticities',
    0x0201: 'JPEGInterchangeFormat', // Offset to JPEG SOI, IFD1 in TIFF
    0x0202: 'JPEGInterchangeFormatLength', // Length of JPEG data, IFD1 in TIFF
    0x0211: 'YCbCrCoefficients',
    0x0212: 'YCbCrSubSampling',
    0x0213: 'YCbCrPositioning',
    0x0214: 'ReferenceBlackWhite',
    0x02BC: 'XMLPacket', // XMP Metadata (raw bytes) - NEW
    0x8298: 'Copyright',
    0x83BB: 'IPTCNAA', // IPTC Metadata (raw bytes) - NEW
    0x8769: 'ExifIFD', // Pointer to Exif SubIFD
    0x8773: 'ICCProfile', // ICC Profile (raw bytes) - NEW
    0x8825: 'GPSIFD',   // Pointer to GPS Info IFD
    0xA005: 'InteropIFD', // Pointer to Interoperability IFD - NEW (can be in IFD0 or ExifIFD)

    // Exif SubIFD tags
    0x829A: 'ExposureTime',
    0x829D: 'FNumber',
    0x8822: 'ExposureProgram',
    0x8824: 'SpectralSensitivity',
    0x8827: 'ISOSpeedRatings', // Often referred to as ISO
    0x8828: 'OECF', // Optoelectric Conversion Function
    0x8830: 'SensitivityType', // NEW
    0x8832: 'RecommendedExposureIndex', // NEW
    0x9000: 'ExifVersion', // EXIF version
    0x9003: 'DateTimeOriginal', // Date/time of original image generation
    0x9004: 'DateTimeDigitized', // Date/time of digital data generation (CreateDate)
    0x9010: 'OffsetTime', // NEW
    0x9011: 'OffsetTimeOriginal', // NEW
    0x9012: 'OffsetTimeDigitized', // NEW
    0x9101: 'ComponentsConfiguration', // Meaning of each component
    0x9102: 'CompressedBitsPerPixel', // Compressed BPP
    0x9201: 'ShutterSpeedValue', // Shutter speed
    0x9202: 'ApertureValue', // Aperture
    0x9203: 'BrightnessValue', // Brightness
    0x9204: 'ExposureBiasValue', // Exposure bias (compensation)
    0x9205: 'MaxApertureValue', // Maximum lens aperture
    0x9206: 'SubjectDistance', // Subject distance
    0x9207: 'MeteringMode', // Metering mode
    0x9208: 'LightSource', // Light source
    0x9209: 'Flash', // Flash status
    0x920A: 'FocalLength', // Lens focal length
    0x9214: 'SubjectArea', // NEW
    0x927C: 'MakerNote', // Manufacturer notes (raw bytes) - NEW
    0x9286: 'UserComment', // User comments - DECODING ENHANCED
    0x9290: 'SubSecTime', // NEW
    0x9291: 'SubSecTimeOriginal', // NEW
    0x9292: 'SubSecTimeDigitized', // NEW
    0xA000: 'FlashpixVersion', // Supported Flashpix version
    0xA001: 'ColorSpace', // Color space information
    0xA002: 'PixelXDimension', // Valid image width (ExifImageWidth)
    0xA003: 'PixelYDimension', // Valid image height (ExifImageHeight)
    0xA004: 'RelatedSoundFile', // Name of related sound file
    // 0xA005: 'InteropIFD', // Interoperability IFD pointer - already listed in IFD0, handled there
    0xA20B: 'FlashEnergy', // NEW
    0xA20C: 'SpatialFrequencyResponse', // NEW
    0xA20E: 'FocalPlaneXResolution', // NEW
    0xA20F: 'FocalPlaneYResolution', // NEW
    0xA210: 'FocalPlaneResolutionUnit', // NEW
    0xA214: 'SubjectLocation', // NEW
    0xA215: 'ExposureIndex', // NEW
    0xA217: 'SensingMethod', // Image sensor type
    0xA300: 'FileSource', // File source (DSC, SCN, Other)
    0xA301: 'SceneType', // Scene type (Directly photographed)
    0xA302: 'CFAPattern', // NEW
    0xA401: 'CustomRendered', // Custom image processing
    0xA402: 'ExposureMode', // Exposure mode
    0xA403: 'WhiteBalance', // White balance
    0xA404: 'DigitalZoomRatio', // Digital zoom ratio
    0xA405: 'FocalLengthIn35mmFilm', // Focal length in 35mm film
    0xA406: 'SceneCaptureType', // Scene capture type
    0xA407: 'GainControl', // NEW
    0xA408: 'Contrast', // NEW
    0xA409: 'Saturation', // NEW
    0xA40A: 'Sharpness', // NEW
    0xA40B: 'DeviceSettingDescription', // NEW
    0xA40C: 'SubjectDistanceRange', // NEW
    0xA420: 'ImageUniqueID', // Unique image ID
    0xA430: 'CameraOwnerName', // NEW (formerly OwnerName)
    0xA431: 'BodySerialNumber', // NEW (formerly SerialNumber)
    0xA432: 'LensSpecification', // NEW (formerly LensInfo)
    0xA433: 'LensMake', // Lens manufacturer
    0xA434: 'LensModel', // Lens model
    0xA435: 'LensSerialNumber', // NEW
    
    // GPS Info IFD tags
    0x0000: 'GPSVersionID',
    0x0001: 'GPSLatitudeRef', // N or S
    0x0002: 'GPSLatitude', // D,M,S
    0x0003: 'GPSLongitudeRef', // E or W
    0x0004: 'GPSLongitude', // D,M,S
    0x0005: 'GPSAltitudeRef', // 0=above sea level, 1=below
    0x0006: 'GPSAltitude', // Altitude in meters
    0x0007: 'GPSTimeStamp', // UTC time H,M,S
    0x0008: 'GPSSatellites', // NEW
    0x0009: 'GPSStatus', // NEW 'A' = measurement in progress, 'V' = interoperability
    0x000A: 'GPSMeasureMode', // NEW '2' = 2D, '3' = 3D
    0x000B: 'GPSDOP', // GPS Degree of Precision (Dilution of Precision) NEW
    0x000C: 'GPSSpeedRef', // NEW 'K' km/h, 'M' mph, 'N' knots
    0x000D: 'GPSSpeed', // NEW
    0x000E: 'GPSTrackRef', // NEW 'T' true direction, 'M' magnetic
    0x000F: 'GPSTrack', // NEW
    0x0010: 'GPSImgDirectionRef', // NEW
    0x0011: 'GPSImgDirection', // NEW
    0x0012: 'GPSMapDatum', // Geodetic survey data used NEW
    0x0013: 'GPSDestLatitudeRef', // NEW
    0x0014: 'GPSDestLatitude', // NEW
    0x0015: 'GPSDestLongitudeRef', // NEW
    0x0016: 'GPSDestLongitude', // NEW
    0x0017: 'GPSDestBearingRef', // NEW
    0x0018: 'GPSDestBearing', // NEW
    0x0019: 'GPSDestDistanceRef', // NEW
    0x001A: 'GPSDestDistance', // NEW
    0x001B: 'GPSProcessingMethod', // Name of method, e.g., GPS, DGPS etc. NEW
    0x001C: 'GPSAreaInformation', // Name of GPS area NEW
    0x001D: 'GPSDateStamp', // YYYY:MM:DD
    0x001E: 'GPSDifferential', // Differential correction applied NEW
    0x001F: 'GPSHPositioningError' // NEW Horizontal positioning error
  };
  
  // Value interpretations for specific tags
  var TAG_VALUES = {
    0x0112: { // Orientation
      1: 'Horizontal (normal)', 2: 'Mirror horizontal', 3: 'Rotate 180', 4: 'Mirror vertical',
      5: 'Mirror horizontal and rotate 270 CW', 6: 'Rotate 90 CW',
      7: 'Mirror horizontal and rotate 90 CW', 8: 'Rotate 270 CW'
    },
    0x0128: { // ResolutionUnit
        1: 'None', 2: 'inches', 3: 'cm'
    },
    0x8822: { // ExposureProgram
      0: 'Not defined', 1: 'Manual', 2: 'Normal program', 3: 'Aperture priority',
      4: 'Shutter priority', 5: 'Creative program', 6: 'Action program',
      7: 'Portrait mode', 8: 'Landscape mode'
    },
    0x9207: { // MeteringMode
      0: 'Unknown', 1: 'Average', 2: 'CenterWeightedAverage', 3: 'Spot',
      4: 'MultiSpot', 5: 'Pattern', 6: 'Partial', 255: 'Other'
    },
    0x9208: { // LightSource
      0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten (incandescent light)',
      4: 'Flash', 9: 'Fine weather', 10: 'Cloudy weather', 11: 'Shade',
      12: 'Daylight fluorescent (D 5700 - 7100K)', 13: 'Day white fluorescent (N 4600 - 5400K)',
      14: 'Cool white fluorescent (W 3900 - 4500K)', 15: 'White fluorescent (WW 3200 - 3700K)',
      17: 'Standard light A', 18: 'Standard light B', 19: 'Standard light C',
      20: 'D55', 21: 'D65', 22: 'D75', 23: 'D50', 24: 'ISO studio tungsten', 255: 'Other'
    },
    0x9209: { // Flash
        0x0000: 'Flash did not fire', 0x0001: 'Flash fired',
        0x0005: 'Strobe return light not detected', 0x0007: 'Strobe return light detected',
        // ... (more flash values can be added from EXIF spec)
    },
    0xA001: { // ColorSpace
        1: 'sRGB', 0xFFFF: 'Uncalibrated'
    },
    0xA210: { // FocalPlaneResolutionUnit
        1: 'None', 2: 'Inch', 3: 'Centimeter'
    },
    0xA217: { // SensingMethod
        1: 'Not defined', 2: 'One-chip color area sensor', 3: 'Two-chip color area sensor',
        4: 'Three-chip color area sensor', 5: 'Color sequential area sensor',
        7: 'Trilinear sensor', 8: 'Color sequential linear sensor'
    },
    0xA300: { // FileSource
        1: 'Film Scanner', 2: 'Reflection Print Scanner', 3: 'Digital Still Camera (DSC)'
    },
    0xA301: { // SceneType
        1: 'Directly photographed image'
    },
    0xA401: { // CustomRendered
        0: 'Normal process', 1: 'Custom process'
    },
    0xA402: { // ExposureMode
        0: 'Auto exposure', 1: 'Manual exposure', 2: 'Auto bracket'
    },
    0xA403: { // WhiteBalance
        0: 'Auto white balance', 1: 'Manual white balance'
    },
    0xA406: { // SceneCaptureType
        0: 'Standard', 1: 'Landscape', 2: 'Portrait', 3: 'Night scene'
    },
    0xA407: { // GainControl
        0: 'None', 1: 'Low gain up', 2: 'High gain up', 3: 'Low gain down', 4: 'High gain down'
    },
    0xA408: { // Contrast
        0: 'Normal', 1: 'Soft', 2: 'Hard'
    },
    0xA409: { // Saturation
        0: 'Normal', 1: 'Low saturation', 2: 'High saturation'
    },
    0xA40A: { // Sharpness
        0: 'Normal', 1: 'Soft', 2: 'Hard'
    },
    0xA40C: { // SubjectDistanceRange
        0: 'Unknown', 1: 'Macro', 2: 'Close view', 3: 'Distant view'
    },
    0x0005: { // GPSAltitudeRef
        0: 'Above Sea Level', 1: 'Below Sea Level'
    }
    // Add more interpretations as needed
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
   * Mimics a DataView-like interface for Uint8Array.
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
      var dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      return {
        bytes: bytes, // Keep original bytes for direct access if needed
        dataView: dataView,
        littleEndian: littleEndian || false,
        byteLength: bytes.length,
        
        getUint8: function(offset) {
          return this.dataView.getUint8(offset);
        },
        getInt8: function(offset) { // NEW
          return this.dataView.getInt8(offset);
        },
        getUint16: function(offset) {
          return this.dataView.getUint16(offset, this.littleEndian);
        },
        getInt16: function(offset) { // NEW
          return this.dataView.getInt16(offset, this.littleEndian);
        },
        getUint32: function(offset) {
          return this.dataView.getUint32(offset, this.littleEndian);
        },
        getInt32: function(offset) { // NEW
          return this.dataView.getInt32(offset, this.littleEndian);
        },
        getFloat32: function(offset) { // NEW
          return this.dataView.getFloat32(offset, this.littleEndian);
        },
        getFloat64: function(offset) { // NEW
          return this.dataView.getFloat64(offset, this.littleEndian);
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

        getUnicodeString: function(offset, length, isUCS2BigEndian) { // NEW - for UserComment UNICODE
          var u16array;
          // UCS-2 is typically UTF-16. Check for BOM or assume based on TIFF endian.
          // A more robust approach would involve checking byte order mark (BOM) if present.
          // For simplicity here, we rely on overall TIFF endianness for non-BOM UCS-2.
          // If isUCS2BigEndian is explicitly passed (e.g. from a BOM), use that.
          var useLittleEndian = (isUCS2BigEndian === undefined) ? this.littleEndian : !isUCS2BigEndian;

          var charCodes = [];
          for (var i = 0; i < length; i += 2) {
            if (offset + i + 1 >= this.byteLength) break;
            var charCode = useLittleEndian 
                            ? (this.bytes[offset + i] | (this.bytes[offset + i + 1] << 8))
                            : ((this.bytes[offset + i] << 8) | this.bytes[offset + i + 1]);
            if (charCode === 0 && i === length -2 ) break; // Null terminator for string, not char
            charCodes.push(charCode);
          }
          return String.fromCharCode.apply(null, charCodes);
        },

        getJISString: function(offset, length) { // NEW - placeholder for UserComment JIS
            // Actual JIS decoding is complex and requires a mapping table.
            // For now, returning raw bytes as a hex string or placeholder.
            Logger.log('EnhancedExifParser: JIS decoding not fully implemented. Returning placeholder for UserComment.');
            var rawBytes = this.bytes.slice(offset, offset + length);
            var hexString = Array.from(rawBytes).map(function(byte) {
                return ('0' + byte.toString(16)).slice(-2);
            }).join('');
            return "[JIS Encoded: " + hexString.substring(0, 50) + "...]";
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
      interop: {}, // NEW
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
      
      var exifDataSegment = ns.findExifSegment_(imageBytes); // This is the TIFF structure
      if (!exifDataSegment) {
        Logger.log('EnhancedExifParser: No EXIF segment found');
        return result;
      }
      
      result.hasExif = true;
      
      // Parse TIFF header and IFDs
      var tiffStructure = ns.parseTiffStructure_(exifDataSegment);
      if (tiffStructure) {
        result = ns.organizeExifData_(result, tiffStructure);
      }
      
      Logger.log('EnhancedExifParser: Successfully extracted comprehensive EXIF data');
      return result;
      
    } catch (error) {
      Logger.log('EnhancedExifParser: Error extracting EXIF: ' + error.toString());
      result.hasExif = false; // Ensure hasExif is false on error
      return result;
    }
  };
  
  ns.findExifSegment_ = function(imageBytes) { /* ... (implementation unchanged) ... */ };
  
  ns.parseTiffStructure_ = function(tiffData) {
    try {
      var byteOrder = (tiffData[0] << 8) | tiffData[1];
      var littleEndian = byteOrder === TIFF_LITTLE_ENDIAN;
      
      if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
        Logger.log('EnhancedExifParser: Invalid TIFF byte order: ' + byteOrder.toString(16));
        return null;
      }
      
      var view = BufferView_.create(tiffData, littleEndian);
      
      var magic = view.getUint16(2);
      if (magic !== 42) {
        Logger.log('EnhancedExifParser: Invalid TIFF magic number: ' + magic);
        return null;
      }
      
      var ifd0Offset = view.getUint32(4);
      
      var parsedData = {
        littleEndian: littleEndian,
        ifd0: {},
        exif: {},
        gps: {},
        interop: {} // NEW
      };
      
      if (ifd0Offset < tiffData.length && ifd0Offset > 0) { // Added > 0 check
        parsedData.ifd0 = ns.parseIFD_(view, ifd0Offset, 'IFD0');
        
        var exifOffset = parsedData.ifd0[0x8769]; // ExifIFD pointer
        if (exifOffset && exifOffset < tiffData.length) {
          parsedData.exif = ns.parseIFD_(view, exifOffset, 'ExifIFD');
        }
        
        var gpsOffset = parsedData.ifd0[0x8825]; // GPSIFD pointer
        if (gpsOffset && gpsOffset < tiffData.length) {
          parsedData.gps = ns.parseIFD_(view, gpsOffset, 'GPSIFD');
        }

        // Check for InteropIFD pointer in IFD0 first, then in ExifIFD
        var interopOffset = parsedData.ifd0[0xA005] || (parsedData.exif ? parsedData.exif[0xA005] : undefined);
        if (interopOffset && interopOffset < tiffData.length) {
            parsedData.interop = ns.parseIFD_(view, interopOffset, 'InteropIFD');
        }
      } else {
        Logger.log('EnhancedExifParser: Invalid IFD0 offset: ' + ifd0Offset);
      }
      
      return parsedData;
      
    } catch (error) {
      Logger.log('EnhancedExifParser: Error parsing TIFF structure: ' + error.toString());
      return null;
    }
  };
  
  ns.parseIFD_ = function(view, offset, ifdName) { // Added ifdName for logging
    var tags = {};
    
    try {
      if (offset + 2 > view.byteLength) {
        Logger.log('EnhancedExifParser: Offset for ' + ifdName + ' entry count is out of bounds: ' + offset);
        return tags;
      }
      var entryCount = view.getUint16(offset);
      offset += 2;
      
      for (var i = 0; i < entryCount; i++) {
        if (offset + 12 > view.byteLength) {
            Logger.log('EnhancedExifParser: Attempting to read ' + ifdName + ' entry ' + (i+1) + '/' + entryCount + ' past buffer end.');
            break;
        }

        var tagId = view.getUint16(offset);
        var type = view.getUint16(offset + 2);
        var count = view.getUint32(offset + 4);
        var valueDataOffset = offset + 8; // Where the 4 bytes of data/offset are stored
        
        var typeSize = TYPE_SIZES[type] || 0; // Default to 0 if unknown type
        if (typeSize === 0 && type !== EXIF_TYPES.UNDEFINED && type !== EXIF_TYPES.ASCII) { // Allow UNDEFINED and ASCII to proceed with size 1
            Logger.log('EnhancedExifParser: Unknown EXIF data type ' + type + ' for tag 0x' + tagId.toString(16) + ' in ' + ifdName + '. Skipping tag.');
            offset += 12;
            continue;
        }
        typeSize = typeSize || 1; // Ensure typeSize is at least 1 for UNDEFINED/ASCII

        var totalValueBytes = typeSize * count;
        var actualValueOffset = valueDataOffset;

        if (totalValueBytes > 4) {
          if (valueDataOffset + 4 > view.byteLength) {
            Logger.log('EnhancedExifParser: Offset for value pointer of tag 0x' + tagId.toString(16) + ' in ' + ifdName + ' is out of bounds.');
            offset += 12;
            continue;
          }
          actualValueOffset = view.getUint32(valueDataOffset);
        }
        
        // Check if the actualValueOffset and totalValueBytes are within buffer bounds
        if (actualValueOffset + totalValueBytes > view.byteLength) {
            Logger.log('EnhancedExifParser: Value for tag 0x' + tagId.toString(16) + ' in ' + ifdName + 
                       ' (offset:' + actualValueOffset + ', length:' + totalValueBytes + ') extends beyond buffer length (' + view.byteLength + '). Skipping tag.');
            offset += 12;
            continue;
        }

        var value = ns.parseTagValue_(view, type, actualValueOffset, count, tagId); // Pass tagId for UserComment
        if (value !== null) {
          var tagName = EXIF_TAGS[tagId] || ('UnknownTag0x' + tagId.toString(16));
          tags[tagName] = value; // Store by name for easier access
          tags[tagId] = value;   // Also store by ID for completeness / sub-IFD pointers
        }
        
        offset += 12;
      }
    } catch (error) {
      Logger.log('EnhancedExifParser: Error parsing ' + ifdName + ' at offset ' + offset + ': ' + error.toString());
    }
    
    return tags;
  };
  
  ns.parseTagValue_ = function(view, type, offset, count, tagId) { // Added tagId
    try {
      var values = []; // Always prepare for multiple values, then simplify if count is 1
      var i;

      // Specific handling for UserComment
      if (tagId === 0x9286) { // UserComment
        if (count >= 8) { // Encoding prefix is 8 bytes
            var encodingBytes = view.getUint8Array(offset, 8);
            var encoding = String.fromCharCode.apply(null, encodingBytes).toUpperCase().trim();
            var commentOffset = offset + 8;
            var commentLength = count - 8;

            if (encoding.startsWith("ASCII")) {
                return view.getString(commentOffset, commentLength);
            } else if (encoding.startsWith("UNICODE")) {
                // Check for BOM (Byte Order Mark)
                var isUCS2BE = undefined; // default to TIFF endianness
                if (commentLength >= 2) {
                    var bom1 = view.getUint8(commentOffset);
                    var bom2 = view.getUint8(commentOffset+1);
                    if (bom1 === 0xFE && bom2 === 0xFF) { // Big Endian BOM
                        isUCS2BE = true;
                        commentOffset += 2;
                        commentLength -= 2;
                    } else if (bom1 === 0xFF && bom2 === 0xFE) { // Little Endian BOM
                        isUCS2BE = false;
                        commentOffset += 2;
                        commentLength -= 2;
                    }
                }
                return view.getUnicodeString(commentOffset, commentLength, isUCS2BE);
            } else if (encoding.startsWith("JIS")) {
                return view.getJISString(commentOffset, commentLength);
            } else { // Includes "UNDEFINED" or unknown encoding
                // Treat as string, but could be binary. Best effort.
                return view.getString(commentOffset, commentLength) + " (Encoding: " + encoding.substring(0,8) + ")";
            }
        } else {
             // Not enough bytes for encoding + data, treat as raw or simple string
            return view.getString(offset, count) + " (UserComment encoding undetermined)";
        }
      }


      switch (type) {
        case EXIF_TYPES.BYTE:
        case EXIF_TYPES.UNDEFINED: // Often used for MakerNotes, UserComment without clear encoding
            if (tagId === 0x927C) { // MakerNote - return raw bytes
                return view.getUint8Array(offset, count);
            }
            // For other UNDEFINED or BYTE types, if count is large, might be better as byte array
            if (count > 16 && type === EXIF_TYPES.UNDEFINED) return view.getUint8Array(offset, count); 
            for (i = 0; i < count; i++) values.push(view.getUint8(offset + i));
            return count === 1 ? values[0] : (type === EXIF_TYPES.BYTE ? values : view.getString(offset, count));

        case EXIF_TYPES.ASCII:
          return view.getString(offset, count);
          
        case EXIF_TYPES.SHORT:
          for (i = 0; i < count; i++) values.push(view.getUint16(offset + i * 2));
          return count === 1 ? values[0] : values;
          
        case EXIF_TYPES.LONG:
          for (i = 0; i < count; i++) values.push(view.getUint32(offset + i * 4));
          return count === 1 ? values[0] : values;
          
        case EXIF_TYPES.RATIONAL:
          for (i = 0; i < count; i++) {
            var num = view.getUint32(offset + i * 8);
            var den = view.getUint32(offset + i * 8 + 4);
            values.push(den === 0 ? 0 : num / den);
          }
          return count === 1 ? values[0] : values;

        case EXIF_TYPES.SBYTE: // NEW
            for (i = 0; i < count; i++) values.push(view.getInt8(offset + i));
            return count === 1 ? values[0] : values;

        case EXIF_TYPES.SSHORT: // NEW
            for (i = 0; i < count; i++) values.push(view.getInt16(offset + i * 2));
            return count === 1 ? values[0] : values;

        case EXIF_TYPES.SLONG: // NEW
            for (i = 0; i < count; i++) values.push(view.getInt32(offset + i * 4));
            return count === 1 ? values[0] : values;

        case EXIF_TYPES.SRATIONAL: // NEW
            for (i = 0; i < count; i++) {
                var num = view.getInt32(offset + i * 8);
                var den = view.getInt32(offset + i * 8 + 4);
                values.push(den === 0 ? 0 : num / den);
            }
            return count === 1 ? values[0] : values;

        case EXIF_TYPES.FLOAT: // NEW
            for (i = 0; i < count; i++) values.push(view.getFloat32(offset + i * 4));
            return count === 1 ? values[0] : values;
            
        case EXIF_TYPES.DOUBLE: // NEW
            for (i = 0; i < count; i++) values.push(view.getFloat64(offset + i * 8));
            return count === 1 ? values[0] : values;
          
        default:
          Logger.log('EnhancedExifParser: Unsupported EXIF data type for parsing value: ' + type);
          return view.getUint8Array(offset, Math.min(count * (TYPE_SIZES[type] || 1) , 16)); // Return raw snippet
      }
    } catch (error) {
      Logger.log('EnhancedExifParser: Error parsing tag value type ' + type + ' at offset ' + offset + ': ' + error.toString());
      return null;
    }
  };
  
  ns.organizeExifData_ = function(result, tiffStructure) {
    try {
      // Process IFD0 tags
      ns.processIfd0Tags_(result, tiffStructure.ifd0);
      
      // Process EXIF IFD tags
      ns.processExifTags_(result, tiffStructure.exif);
      
      // Process GPS tags
      ns.processGpsTags_(result, tiffStructure.gps);

      // Process Interop tags (NEW) - mainly for reference, actual values might not be needed for Box template
      if (tiffStructure.interop) {
        Object.keys(tiffStructure.interop).forEach(function(tagIdOrName) {
            if (typeof tiffStructure.interop[tagIdOrName] !== 'function' && !EXIF_TAGS[tagIdOrName]) { // Avoid copying functions or numeric keys if name exists
                result.interop[tagIdOrName] = tiffStructure.interop[tagIdOrName];
            }
        });
      }
      
      // Derive additional information
      ns.deriveAdditionalInfo_(result);
      
      return result;
    } catch (error) {
      Logger.log('EnhancedExifParser: Error organizing EXIF data: ' + error.toString());
      return result;
    }
  };
  
  ns.processIfd0Tags_ = function(result, ifd0) {
    if (!ifd0) return;
    
    Object.keys(ifd0).forEach(function(key) {
        var value = ifd0[key];
        var tagName = isNaN(parseInt(key)) ? key : EXIF_TAGS[parseInt(key)]; // Prefer named key if available
        if (!tagName) tagName = key; // Fallback to key if not in EXIF_TAGS (e.g. unknown numeric tag)

        switch (tagName) {
            case 'Make': result.camera.make = value; break;
            case 'Model': result.camera.model = value; break;
            case 'Software': result.camera.software = value; break;
            case 'Orientation':
                result.technical.orientation = value;
                result.technical.orientationDesc = TAG_VALUES[0x0112] ? TAG_VALUES[0x0112][value] : 'Unknown';
                break;
            case 'XResolution': result.technical.xResolution = value; break;
            case 'YResolution': result.technical.yResolution = value; break;
            case 'ResolutionUnit':
                result.technical.resolutionUnit = value;
                result.technical.resolutionUnitDesc = TAG_VALUES[0x0128] ? TAG_VALUES[0x0128][value] : 'Unknown';
                break;
            case 'DateTime': result.datetime.modifyDate = value; break;
            case 'Artist': result.camera.artist = value; break;
            case 'Copyright': result.camera.copyright = value; break;
            case 'ImageDescription': result.ifd0.imageDescription = value; break;
            case 'XMLPacket': result.ifd0.xmpRaw = value; break; // Store raw XMP
            case 'IPTCNAA': result.ifd0.iptcRaw = value; break; // Store raw IPTC
            case 'ICCProfile': result.ifd0.iccProfileRaw = value; break; // Store raw ICC
            // Pointers are handled by parseTiffStructure_
            case 'ExifIFD': case 'GPSIFD': case 'InteropIFD': break; 
            default:
                // Store other IFD0 tags directly in ifd0 object if they are named
                if (isNaN(parseInt(key))) result.ifd0[key] = value;
                break;
        }
    });
  };
  
  ns.processExifTags_ = function(result, exif) {
    if (!exif) return;

    Object.keys(exif).forEach(function(key) {
        var value = exif[key];
        var tagName = isNaN(parseInt(key)) ? key : EXIF_TAGS[parseInt(key)];
        if (!tagName) tagName = key;

        switch (tagName) {
            case 'ExposureTime': result.settings.exposureTime = value; break;
            case 'FNumber': result.settings.fNumber = value; break;
            case 'ISOSpeedRatings': result.settings.iso = Array.isArray(value) ? value[0] : value; break;
            case 'FocalLength': result.settings.focalLength = value; break;
            case 'ShutterSpeedValue': result.settings.shutterSpeedValue = value; break;
            case 'ApertureValue': result.settings.apertureValue = value; break;
            case 'ExposureBiasValue': result.settings.exposureCompensation = value; break;
            case 'ExposureProgram':
                result.settings.exposureProgram = value;
                result.settings.exposureProgramDesc = TAG_VALUES[0x8822] ? TAG_VALUES[0x8822][value] : 'Unknown';
                break;
            case 'MeteringMode':
                result.settings.meteringMode = value;
                result.settings.meteringModeDesc = TAG_VALUES[0x9207] ? TAG_VALUES[0x9207][value] : 'Unknown';
                break;
            case 'LightSource':
                result.settings.lightSource = value;
                result.settings.lightSourceDesc = TAG_VALUES[0x9208] ? TAG_VALUES[0x9208][value] : 'Unknown';
                break;
            case 'Flash':
                result.settings.flash = value;
                result.settings.flashDesc = TAG_VALUES[0x9209] ? TAG_VALUES[0x9209][value] : 'Unknown';
                 break;
            case 'ExposureMode':
                result.settings.exposureMode = value;
                result.settings.exposureModeDesc = TAG_VALUES[0xA402] ? TAG_VALUES[0xA402][value] : 'Unknown';
                break;
            case 'WhiteBalance':
                result.settings.whiteBalance = value;
                result.settings.whiteBalanceDesc = TAG_VALUES[0xA403] ? TAG_VALUES[0xA403][value] : 'Unknown';
                break;
            case 'SceneCaptureType':
                result.settings.sceneCaptureType = value;
                result.settings.sceneCaptureTypeDesc = TAG_VALUES[0xA406] ? TAG_VALUES[0xA406][value] : 'Unknown';
                break;
            case 'PixelXDimension': result.technical.exifImageWidth = value; break;
            case 'PixelYDimension': result.technical.exifImageHeight = value; break;
            case 'DateTimeOriginal': result.datetime.dateTimeOriginal = value; break;
            case 'DateTimeDigitized': result.datetime.createDate = value; break; // Often same as DateTimeOriginal
            case 'LensSpecification': result.camera.lensInfo = value; break; // Array of 4 rationals
            case 'LensMake': result.camera.lensMake = value; break;
            case 'LensModel': result.camera.lensModel = value; break;
            case 'FocalLengthIn35mmFilm': result.settings.focalLengthIn35mm = value; break;
            case 'CameraOwnerName': result.camera.ownerName = value; break;
            case 'BodySerialNumber': result.camera.serialNumber = value; break;
            case 'ExifVersion': result.camera.exifVersion = typeof value === 'object' ? String.fromCharCode.apply(null, value) : value; break;
            case 'FlashpixVersion': result.camera.flashpixVersion = typeof value === 'object' ? String.fromCharCode.apply(null, value) : value; break;
            case 'UserComment': 
                result.exif.userComment = value; // Already decoded
                result.exif.userCommentRaw = exif[0x9286]; // Store raw UserComment from original tags
                break; 
            case 'MakerNote': result.exif.makerNoteRaw = value; break; // Store raw MakerNote
            case 'ColorSpace':
                result.technical.colorSpace = value;
                result.technical.colorSpaceDesc = TAG_VALUES[0xA001] ? TAG_VALUES[0xA001][value] : 'Unknown';
                break;
            case 'SensingMethod':
                result.technical.sensingMethod = value;
                result.technical.sensingMethodDesc = TAG_VALUES[0xA217] ? TAG_VALUES[0xA217][value] : 'Unknown';
                break;
            case 'FileSource':
                result.technical.fileSource = value;
                result.technical.fileSourceDesc = TAG_VALUES[0xA300] ? TAG_VALUES[0xA300][value] : 'Unknown';
                break;
            case 'SceneType':
                 result.technical.sceneType = value;
                 result.technical.sceneTypeDesc = TAG_VALUES[0xA301] ? TAG_VALUES[0xA301][value] : 'Unknown';
                 break;
            case 'CustomRendered':
                 result.settings.customRendered = value;
                 result.settings.customRenderedDesc = TAG_VALUES[0xA401] ? TAG_VALUES[0xA401][value] : 'Unknown';
                 break;
            // Add other EXIF tags as needed
            default:
                if (isNaN(parseInt(key))) result.exif[key] = value;
                break;
        }
    });
  };
  
  ns.processGpsTags_ = function(result, gps) {
    if (!gps) return;

    Object.keys(gps).forEach(function(key) {
        var value = gps[key];
        var tagName = isNaN(parseInt(key)) ? key : EXIF_TAGS[parseInt(key)];
        if (!tagName) tagName = key;

        switch (tagName) {
            case 'GPSLatitudeRef': result.location.latitudeRef = value; break;
            case 'GPSLatitude': result.location.rawLatitude = value; break; // Store raw DMS
            case 'GPSLongitudeRef': result.location.longitudeRef = value; break;
            case 'GPSLongitude': result.location.rawLongitude = value; break; // Store raw DMS
            case 'GPSAltitudeRef':
                result.location.altitudeRef = value;
                result.location.altitudeRefDesc = TAG_VALUES[0x0005] ? TAG_VALUES[0x0005][value] : 'Unknown';
                break;
            case 'GPSAltitude': result.location.altitude = value; break;
            case 'GPSTimeStamp': result.location.gpsTimeStamp = value; break; // Array of 3 rationals H,M,S
            case 'GPSDateStamp': result.location.gpsDateStamp = value; break; // YYYY:MM:DD
            // Store other GPS tags directly
            default:
                if (isNaN(parseInt(key))) result.gps[key] = value;
                break;
        }
    });

    // Convert DMS to DD after all raw GPS tags are processed
    if (result.location.rawLatitude && result.location.latitudeRef) {
        result.location.latitude = ns.convertDMSToDD_(result.location.rawLatitude, result.location.latitudeRef);
    }
    if (result.location.rawLongitude && result.location.longitudeRef) {
        result.location.longitude = ns.convertDMSToDD_(result.location.rawLongitude, result.location.longitudeRef);
    }
  };
  
  ns.convertDMSToDD_ = function(dms, ref) { /* ... (implementation unchanged) ... */ };
  ns.deriveAdditionalInfo_ = function(result) { /* ... (implementation mostly unchanged, ensure it uses new field names if any) ... */ };
  ns.extractEnhancedMetadataForBox = function(fileId, accessToken) { /* ... (implementation unchanged, relies on updated extractComprehensiveExif) ... */ };
  ns.convertToBoxMetadata_ = function(exifData) { /* ... (implementation unchanged, but will benefit from more detailed exifData) ... */ };
  ns.calculateGCD_ = function(a,b) { /* ... (implementation unchanged) ... */ };
  ns.testEnhancedExtraction = function(testFileId) { /* ... (implementation unchanged) ... */ };

  // ... (rest of the helper functions: findExifSegment_, convertDMSToDD_, deriveAdditionalInfo_, etc. remain largely the same but benefit from more detailed inputs)

  return ns;
})();