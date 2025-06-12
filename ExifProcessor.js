// File: ExifProcessor.js
// Comprehensive EXIF data extraction and parsing functions.
// Merges the logic from former EXIFParser.js and ExifExtraction.js.
// Depends on: Config.js, BoxAuth.js

/**
 * ExifProcessor namespace - comprehensive metadata extraction for multiple image formats.
 * Provides comprehensive metadata extraction with sophisticated parsing and fallback mechanisms.
 */
var ExifProcessor = (function() {
  'use strict';
  
  var ns = {};
  var utils_ = null; // For cUseful library
  
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
    0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0008: 'GPSSatellites',
    0x0009: 'GPSStatus', 0x000A: 'GPSMeasureMode', 0x000B: 'GPSDOP',
    0x000C: 'GPSSpeedRef', 0x000D: 'GPSSpeed', 0x000E: 'GPSTrackRef',
    0x000F: 'GPSTrack', 0x0010: 'GPSImgDirectionRef', 0x0011: 'GPSImgDirection',
    0x0012: 'GPSMapDatum', 0x0013: 'GPSDestLatitudeRef', 0x0014: 'GPSDestLatitude',
    0x0015: 'GPSDestLongitudeRef', 0x0016: 'GPSDestLongitude', 0x0017: 'GPSDestBearingRef',
    0x0018: 'GPSDestBearing', 0x0019: 'GPSDestDistanceRef', 0x001A: 'GPSDestDistance',
    0x001B: 'GPSProcessingMethod', 0x001C: 'GPSAreaInformation', 0x001D: 'GPSDateStamp',
    0x001E: 'GPSDifferential', 0x001F: 'GPSHPositioningError'
  };

  /**
   * Initialize cUseful library utilities
   * @private
   */
  function init_utils_() {
    if (utils_ === null) {
      if (typeof cUseful !== 'undefined') {
        utils_ = cUseful.Utils;
      } else {
        // Fallback object with basic rate limiting
        utils_ = {
          rateLimitExpBackoff: function(func) {
            return func();
          }
        };
      }
    }
    return utils_;
  }

  /**
   * Extract basic file information from image bytes
   * @private
   */
  function extract_basic_file_info_(image_bytes) {
    var basic_info = {
      fileSize: image_bytes.length,
      format: 'Unknown'
    };
    
    // Detect file format
    for (var format in FILE_SIGNATURES) {
      var signature = FILE_SIGNATURES[format];
      var matches = true;
      
      for (var i = 0; i < signature.length; i++) {
        if (signature[i] !== null && image_bytes[i] !== signature[i]) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        if (format.startsWith('TIFF')) {
          basic_info.format = 'TIFF';
        } else {
          basic_info.format = format;
        }
        break;
      }
    }
    
    return basic_info;
  }

  /**
   * Find EXIF segment in JPEG/TIFF data
   * @private
   */
  function find_exif_segment_(image_bytes) {
    try {
      if (image_bytes.length < 12) return null;
      
      // For JPEG files
      if (image_bytes[0] === 0xFF && image_bytes[1] === 0xD8) {
        var offset = 2;
        var max_search_offset = Math.min(image_bytes.length - 4, 65536);
        
        while (offset < max_search_offset) {
          if (image_bytes[offset] === 0xFF) {
            var marker_type = image_bytes[offset + 1];
            
            if (marker_type === 0xE1) { // APP1 marker (commonly EXIF)
              var length = (image_bytes[offset + 2] << 8) | image_bytes[offset + 3];
              var exif_header_offset = offset + 4;
              
              // Check for "Exif" identifier
              if (exif_header_offset + 6 < image_bytes.length &&
                  image_bytes[exif_header_offset] === 0x45 && // 'E'
                  image_bytes[exif_header_offset + 1] === 0x78 && // 'x'
                  image_bytes[exif_header_offset + 2] === 0x69 && // 'i'
                  image_bytes[exif_header_offset + 3] === 0x66) { // 'f'
                
                // Return TIFF header part (skip "Exif\0\0")
                return image_bytes.slice(exif_header_offset + 6, offset + 2 + length);
              }
            }
            
            // Move to next marker
            var segment_length = (image_bytes[offset + 2] << 8) | image_bytes[offset + 3];
            offset += 2 + segment_length;
          } else {
            offset++;
          }
        }
      }
      
      // For TIFF files - the whole file is the EXIF data
      if ((image_bytes[0] === 0x49 && image_bytes[1] === 0x49) || // Little endian
          (image_bytes[0] === 0x4D && image_bytes[1] === 0x4D)) { // Big endian
        return image_bytes;
      }
      
      return null;
    } catch (error) {
      Logger.log('Error finding EXIF segment: ' + error.toString());
      return null;
    }
  }

  /**
   * Parse TIFF structure from EXIF data
   * @private
   */
  function parse_tiff_structure_(exif_data) {
    try {
      if (!exif_data || exif_data.length < 8) return null;
      
      var is_little_endian = exif_data[0] === 0x49 && exif_data[1] === 0x49;
      var tiff_magic = is_little_endian ? 
        (exif_data[2] | (exif_data[3] << 8)) :
        ((exif_data[2] << 8) | exif_data[3]);
      
      if (tiff_magic !== 42) return null; // Not valid TIFF
      
      var first_ifd_offset = is_little_endian ?
        (exif_data[4] | (exif_data[5] << 8) | (exif_data[6] << 16) | (exif_data[7] << 24)) :
        ((exif_data[4] << 24) | (exif_data[5] << 16) | (exif_data[6] << 8) | exif_data[7]);
      
      var parsed_data = {
        endianness: is_little_endian ? 'little' : 'big',
        ifd0: parse_ifd_(exif_data, first_ifd_offset, is_little_endian),
        exif_ifd: null,
        gps_ifd: null
      };
      
      // Look for EXIF and GPS sub-IFDs
      if (parsed_data.ifd0) {
        if (parsed_data.ifd0['34665']) { // EXIF IFD pointer
          var exif_offset = parsed_data.ifd0['34665'].value;
          parsed_data.exif_ifd = parse_ifd_(exif_data, exif_offset, is_little_endian);
        }
        
        if (parsed_data.ifd0['34853']) { // GPS IFD pointer
          var gps_offset = parsed_data.ifd0['34853'].value;
          parsed_data.gps_ifd = parse_ifd_(exif_data, gps_offset, is_little_endian);
        }
      }
      
      return parsed_data;
    } catch (error) {
      Logger.log('Error parsing TIFF structure: ' + error.toString());
      return null;
    }
  }

  /**
   * Parse Individual IFD (Image File Directory)
   * @private
   */
  function parse_ifd_(data, offset, is_little_endian) {
    try {
      if (offset + 2 >= data.length) return null;
      
      var entry_count = is_little_endian ?
        (data[offset] | (data[offset + 1] << 8)) :
        ((data[offset] << 8) | data[offset + 1]);
      
      var entries = {};
      var entry_offset = offset + 2;
      
      for (var i = 0; i < entry_count; i++) {
        if (entry_offset + 12 > data.length) break;
        
        var tag = is_little_endian ?
          (data[entry_offset] | (data[entry_offset + 1] << 8)) :
          ((data[entry_offset] << 8) | data[entry_offset + 1]);
        
        var type = is_little_endian ?
          (data[entry_offset + 2] | (data[entry_offset + 3] << 8)) :
          ((data[entry_offset + 2] << 8) | data[entry_offset + 3]);
        
        var count = is_little_endian ?
          (data[entry_offset + 4] | (data[entry_offset + 5] << 8) | 
           (data[entry_offset + 6] << 16) | (data[entry_offset + 7] << 24)) :
          ((data[entry_offset + 4] << 24) | (data[entry_offset + 5] << 16) | 
           (data[entry_offset + 6] << 8) | data[entry_offset + 7]);
        
        var value_offset = entry_offset + 8;
        var value = parse_tag_value_(data, type, count, value_offset, is_little_endian);
        
        entries[tag] = {
          tag: tag,
          type: type,
          count: count,
          value: value,
          tagName: EXIF_TAGS[tag] || ('Unknown_' + tag)
        };
        
        entry_offset += 12;
      }
      
      return entries;
    } catch (error) {
      Logger.log('Error parsing IFD: ' + error.toString());
      return null;
    }
  }

  /**
   * Parse tag value based on type
   * @private
   */
  function parse_tag_value_(data, type, count, value_offset, is_little_endian) {
    try {
      var type_size = TYPE_SIZES[type] || 1;
      var total_size = type_size * count;
      
      // If value fits in 4 bytes, it's stored directly
      if (total_size <= 4) {
        if (type === EXIF_TYPES.ASCII) {
          var str = '';
          for (var i = 0; i < Math.min(count, 4); i++) {
            var char_code = data[value_offset + i];
            if (char_code === 0) break;
            str += String.fromCharCode(char_code);
          }
          return str;
        } else if (type === EXIF_TYPES.SHORT) {
          return is_little_endian ?
            (data[value_offset] | (data[value_offset + 1] << 8)) :
            ((data[value_offset] << 8) | data[value_offset + 1]);
        } else if (type === EXIF_TYPES.LONG) {
          return is_little_endian ?
            (data[value_offset] | (data[value_offset + 1] << 8) | 
             (data[value_offset + 2] << 16) | (data[value_offset + 3] << 24)) :
            ((data[value_offset] << 24) | (data[value_offset + 1] << 16) | 
             (data[value_offset + 2] << 8) | data[value_offset + 3]);
        } else {
          return data[value_offset];
        }
      } else {
        // Value is stored at offset
        var actual_offset = is_little_endian ?
          (data[value_offset] | (data[value_offset + 1] << 8) | 
           (data[value_offset + 2] << 16) | (data[value_offset + 3] << 24)) :
          ((data[value_offset] << 24) | (data[value_offset + 1] << 16) | 
           (data[value_offset + 2] << 8) | data[value_offset + 3]);
        
        if (actual_offset + total_size > data.length) return null;
        
        if (type === EXIF_TYPES.ASCII) {
          var str = '';
          for (var i = 0; i < count; i++) {
            var char_code = data[actual_offset + i];
            if (char_code === 0) break;
            str += String.fromCharCode(char_code);
          }
          return str;
        } else if (type === EXIF_TYPES.RATIONAL) {
          var numerator = is_little_endian ?
            (data[actual_offset] | (data[actual_offset + 1] << 8) | 
             (data[actual_offset + 2] << 16) | (data[actual_offset + 3] << 24)) :
            ((data[actual_offset] << 24) | (data[actual_offset + 1] << 16) | 
             (data[actual_offset + 2] << 8) | data[actual_offset + 3]);
          
          var denominator = is_little_endian ?
            (data[actual_offset + 4] | (data[actual_offset + 5] << 8) | 
             (data[actual_offset + 6] << 16) | (data[actual_offset + 7] << 24)) :
            ((data[actual_offset + 4] << 24) | (data[actual_offset + 5] << 16) | 
             (data[actual_offset + 6] << 8) | data[actual_offset + 7]);
          
          return denominator !== 0 ? numerator / denominator : 0;
        }
      }
      
      return null;
    } catch (error) {
      Logger.log('Error parsing tag value: ' + error.toString());
      return null;
    }
  }

  /**
   * Organize parsed TIFF data into meaningful metadata
   * @private
   */
  function organize_metadata_(tiff_structure, basic_info) {
    try {
      var organized = {
        hasExif: true,
        fileInfo: basic_info,
        camera: {},
        image: {},
        settings: {},
        gps: {},
        technical: {}
      };
      
      if (!tiff_structure) {
        organized.hasExif = false;
        return organized;
      }
      
      // Process IFD0 (main image data)
      if (tiff_structure.ifd0) {
        process_ifd_data_(tiff_structure.ifd0, organized);
      }
      
      // Process EXIF IFD (camera settings)
      if (tiff_structure.exif_ifd) {
        process_ifd_data_(tiff_structure.exif_ifd, organized);
      }
      
      // Process GPS IFD
      if (tiff_structure.gps_ifd) {
        process_gps_data_(tiff_structure.gps_ifd, organized);
      }
      
      return organized;
    } catch (error) {
      Logger.log('Error organizing metadata: ' + error.toString());
      return { hasExif: false, fileInfo: basic_info };
    }
  }

  /**
   * Process IFD data into organized structure
   * @private
   */
  function process_ifd_data_(ifd, organized) {
    for (var tag in ifd) {
      var entry = ifd[tag];
      var tag_name = entry.tagName;
      var value = entry.value;
      
      if (!value) continue;
      
      // Camera information
      if (tag_name === 'Make') organized.camera.make = value;
      else if (tag_name === 'Model') organized.camera.model = value;
      else if (tag_name === 'Software') organized.camera.software = value;
      else if (tag_name === 'LensMake') organized.camera.lensMake = value;
      else if (tag_name === 'LensModel') organized.camera.lensModel = value;
      
      // Image dimensions and properties
      else if (tag_name === 'ImageWidth') organized.image.width = value;
      else if (tag_name === 'ImageLength') organized.image.height = value;
      else if (tag_name === 'PixelXDimension') organized.image.pixelWidth = value;
      else if (tag_name === 'PixelYDimension') organized.image.pixelHeight = value;
      else if (tag_name === 'Orientation') organized.image.orientation = value;
      
      // Camera settings
      else if (tag_name === 'ExposureTime') organized.settings.exposureTime = value;
      else if (tag_name === 'FNumber') organized.settings.fNumber = value;
      else if (tag_name === 'ISOSpeedRatings') organized.settings.iso = value;
      else if (tag_name === 'FocalLength') organized.settings.focalLength = value;
      else if (tag_name === 'Flash') organized.settings.flash = value;
      else if (tag_name === 'WhiteBalance') organized.settings.whiteBalance = value;
      
      // Date/time
      else if (tag_name === 'DateTime') organized.technical.dateTime = value;
      else if (tag_name === 'DateTimeOriginal') organized.technical.dateTimeOriginal = value;
      else if (tag_name === 'DateTimeDigitized') organized.technical.dateTimeDigitized = value;
    }
  }

  /**
   * Process GPS data from GPS IFD
   * @private
   */
  function process_gps_data_(gps_ifd, organized) {
    try {
      var gps_lat = null, gps_lon = null, gps_alt = null;
      var lat_ref = '', lon_ref = '', alt_ref = '';
      
      for (var tag in gps_ifd) {
        var entry = gps_ifd[tag];
        var tag_name = entry.tagName;
        var value = entry.value;
        
        if (tag_name === 'GPSLatitudeRef') lat_ref = value;
        else if (tag_name === 'GPSLongitudeRef') lon_ref = value;
        else if (tag_name === 'GPSAltitudeRef') alt_ref = value;
        else if (tag_name === 'GPSLatitude') gps_lat = value;
        else if (tag_name === 'GPSLongitude') gps_lon = value;
        else if (tag_name === 'GPSAltitude') gps_alt = value;
      }
      
      // Convert GPS coordinates to decimal degrees
      if (gps_lat && lat_ref) {
        var lat_decimal = convert_gps_coordinate_(gps_lat);
        if (lat_ref === 'S') lat_decimal = -lat_decimal;
        organized.gps.latitude = lat_decimal;
      }
      
      if (gps_lon && lon_ref) {
        var lon_decimal = convert_gps_coordinate_(gps_lon);
        if (lon_ref === 'W') lon_decimal = -lon_decimal;
        organized.gps.longitude = lon_decimal;
      }
      
      if (gps_alt !== null) {
        organized.gps.altitude = alt_ref === 1 ? -gps_alt : gps_alt;
      }
      
    } catch (error) {
      Logger.log('Error processing GPS data: ' + error.toString());
    }
  }

  /**
   * Convert GPS coordinate from degrees/minutes/seconds to decimal
   * @private
   */
  function convert_gps_coordinate_(coordinate) {
    if (typeof coordinate === 'number') return coordinate;
    if (Array.isArray(coordinate) && coordinate.length >= 3) {
      return coordinate[0] + (coordinate[1] / 60) + (coordinate[2] / 3600);
    }
    return coordinate;
  }

  /**
   * Convert organized metadata to Box-compatible format
   * @private
   */
  function convert_to_box_format_(metadata) {
    try {
      var box_metadata = {
        processingStage: Config.PROCESSING_STAGE_EXIF,
        lastProcessedDate: new Date().toISOString(),
        processingVersion: Config.PROCESSING_VERSION_ENHANCED,
        buildNumber: Config.getCurrentBuild()
      };
      
      if (!metadata.hasExif) {
        box_metadata.processingStage = Config.PROCESSING_STAGE_FAILED;
        box_metadata.technicalNotes = 'No EXIF data found in file';
        return box_metadata;
      }
      
      // File information
      if (metadata.fileInfo) {
        if (metadata.fileInfo.filename) box_metadata.filename = metadata.fileInfo.filename;
        if (metadata.fileInfo.fileSize) box_metadata.fileSize = metadata.fileInfo.fileSize;
        if (metadata.fileInfo.format) box_metadata.fileFormat = metadata.fileInfo.format;
      }
      
      // Camera information
      if (metadata.camera) {
        if (metadata.camera.make && metadata.camera.model) {
          box_metadata.cameraModel = metadata.camera.make + ' ' + metadata.camera.model;
        } else if (metadata.camera.model) {
          box_metadata.cameraModel = metadata.camera.model;
        }
        
        if (metadata.camera.software) box_metadata.cameraSoftware = metadata.camera.software;
        if (metadata.camera.lensMake || metadata.camera.lensModel) {
          box_metadata.lensModel = (metadata.camera.lensMake || '') + ' ' + (metadata.camera.lensModel || '');
        }
      }
      
      // Image dimensions
      if (metadata.image) {
        var width = metadata.image.pixelWidth || metadata.image.width;
        var height = metadata.image.pixelHeight || metadata.image.height;
        
        if (width && height) {
          box_metadata.imageWidth = width;
          box_metadata.imageHeight = height;
          
          // Calculate aspect ratio and megapixels
          var gcd = calculate_gcd_(width, height);
          box_metadata.aspectRatio = (width / gcd) + ':' + (height / gcd);
          box_metadata.megapixels = Math.round((width * height) / 1000000 * 10) / 10;
        }
        
        if (metadata.image.orientation) box_metadata.orientation = metadata.image.orientation;
      }
      
      // Camera settings
      if (metadata.settings) {
        if (metadata.settings.exposureTime) box_metadata.exposureTime = metadata.settings.exposureTime;
        if (metadata.settings.fNumber) box_metadata.fNumber = metadata.settings.fNumber;
        if (metadata.settings.iso) box_metadata.isoSpeed = metadata.settings.iso;
        if (metadata.settings.focalLength) box_metadata.focalLength = metadata.settings.focalLength;
        if (metadata.settings.flash !== undefined) box_metadata.flashUsed = metadata.settings.flash > 0;
        if (metadata.settings.whiteBalance !== undefined) box_metadata.whiteBalance = metadata.settings.whiteBalance;
      }
      
      // Date taken (prefer DateTimeOriginal)
      if (metadata.technical) {
        var date_taken = metadata.technical.dateTimeOriginal || 
                         metadata.technical.dateTimeDigitized || 
                         metadata.technical.dateTime;
        if (date_taken) {
          box_metadata.dateTaken = date_taken;
        }
      }
      
      // GPS coordinates
      if (metadata.gps) {
        if (typeof metadata.gps.latitude === 'number') box_metadata.gpsLatitude = metadata.gps.latitude;
        if (typeof metadata.gps.longitude === 'number') box_metadata.gpsLongitude = metadata.gps.longitude;
        if (typeof metadata.gps.altitude === 'number') box_metadata.gpsAltitude = metadata.gps.altitude;
      }
      
      // Technical notes
      var technical_notes = [];
      if (metadata.fileInfo && metadata.fileInfo.format) {
        technical_notes.push('Format: ' + metadata.fileInfo.format);
      }
      
      if (technical_notes.length > 0) {
        box_metadata.technicalNotes = (box_metadata.technicalNotes ? 
          box_metadata.technicalNotes + "; " : "") + technical_notes.join('; ');
      }
      
      return box_metadata;
    } catch (error) {
      Logger.log('Error converting to Box format: ' + error.toString());
      return {
        processingStage: Config.PROCESSING_STAGE_FAILED,
        technicalNotes: 'EXIF Processing Error: ' + String(error.message || error).substring(0, 100)
      };
    }
  }

  /**
   * Calculate Greatest Common Divisor for aspect ratio
   * @private
   */
  function calculate_gcd_(a, b) {
    return b === 0 ? a : calculate_gcd_(b, a % b);
  }

  /**
   * Extract JPEG/TIFF metadata
   * @private
   */
  function extract_jpeg_metadata_(image_bytes, basic_info) {
    try {
      var exif_data_segment = find_exif_segment_(image_bytes);
      if (!exif_data_segment) {
        Logger.log(' ⚠️ No EXIF APP1 segment found in JPEG/TIFF structure for ' + basic_info.filename);
        return { hasExif: false, fileInfo: basic_info };
      }
      
      var tiff_structure = parse_tiff_structure_(exif_data_segment);
      return organize_metadata_(tiff_structure, basic_info);
    } catch (error) {
      Logger.log('Error extracting JPEG/TIFF EXIF metadata for ' + basic_info.filename + ': ' + error.toString());
      return { hasExif: false, fileInfo: basic_info };
    }
  }

  /**
   * Extract metadata from other formats (PNG, WebP, etc.)
   * @private
   */
  function extract_other_format_metadata_(image_bytes, basic_info) {
    Logger.log(' ⚠️ Advanced EXIF extraction for ' + basic_info.format + ' not fully implemented. Checking for common patterns.');
    
    // Try a generic search for TIFF header within the file as fallback
    // This is speculative and might not be standard for these formats
    for (var i = 0; i < Math.min(image_bytes.length - 8, 1024); i++) {
      if ((image_bytes[i] === 0x49 && image_bytes[i + 1] === 0x49) || // Little endian TIFF
          (image_bytes[i] === 0x4D && image_bytes[i + 1] === 0x4D)) { // Big endian TIFF
        try {
          var potential_tiff = image_bytes.slice(i);
          var tiff_structure = parse_tiff_structure_(potential_tiff);
          if (tiff_structure) {
            Logger.log(' ✅ Found embedded TIFF structure in ' + basic_info.format + ' file');
            return organize_metadata_(tiff_structure, basic_info);
          }
        } catch (error) {
          // Continue searching
        }
      }
    }
    
    return { hasExif: false, fileInfo: basic_info };
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Main function to extract and parse metadata from a file.
   * This is the primary interface that replaces both the old EXIFParser and ExifExtraction.
   * @param {string} file_id Box file ID
   * @param {string} access_token Valid Box access token
   * @param {string} filename The name of the file for logging
   * @returns {object|null} Box-formatted metadata object with enhanced EXIF data or null on error
   */
  ns.extract_metadata = function(file_id, access_token, filename) {
    var file_display_name = filename || file_id;
    
    if (!file_id || !access_token) {
      Logger.log('ERROR: ExifProcessor.extract_metadata requires file_id and access_token');
      return null;
    }
    
    var utils = init_utils_();
    var image_bytes;
    
    try {
      Logger.log(' > Parsing comprehensive EXIF data from ' + file_display_name + '...');
      
      var download_url = (Config.BOX_API_BASE_URL || 'https://api.box.com/2.0') + '/files/' + file_id + '/content';
      var response = utils.rateLimitExpBackoff(function() {
        return UrlFetchApp.fetch(download_url, {
          headers: { 'Authorization': 'Bearer ' + access_token },
          muteHttpExceptions: true
        });
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log('    Failed to download ' + file_display_name + ' for metadata extraction. HTTP Code: ' + 
                  response.getResponseCode() + " Response: " + response.getContentText().substring(0, 200));
        return null;
      }
      
      var image_blob = response.getBlob();
      image_bytes = new Uint8Array(image_blob.getBytes());
      
      var basic_info = extract_basic_file_info_(image_bytes);
      basic_info.filename = file_display_name;
      
      Logger.log(' > Format detected: ' + (basic_info.format || 'Unknown') + ' for ' + file_display_name + 
                '. Size: ' + image_bytes.length + ' bytes.');

      var metadata_from_parser = null;
      
      if (basic_info.format === 'JPEG' || basic_info.format === 'TIFF') {
        metadata_from_parser = extract_jpeg_metadata_(image_bytes, basic_info);
      } else if (['PNG', 'WEBP', 'HEIC', 'AVIF'].indexOf(basic_info.format) !== -1) {
        metadata_from_parser = extract_other_format_metadata_(image_bytes, basic_info); 
      } else {
        // Fallback for unknown formats - try to find EXIF anyway
        metadata_from_parser = extract_jpeg_metadata_(image_bytes, basic_info);
        if (!metadata_from_parser || !metadata_from_parser.hasExif) {
          metadata_from_parser = { hasExif: false, fileInfo: basic_info };
        }
      }

      if (metadata_from_parser) {
        Logger.log(' > File parsed. EXIF found: ' + metadata_from_parser.hasExif + ' for ' + file_display_name + '.');
        return convert_to_box_format_(metadata_from_parser);
      } else {
        Logger.log(' ⚠️ No processable EXIF structure identified in ' + file_display_name + '. Returning basic info.');
        return convert_to_box_format_({ hasExif: false, fileInfo: basic_info });
      }
      
    } catch (error) {
      Logger.log('    ERROR: Parsing EXIF from ' + file_display_name + ' failed: ' + error.toString() + 
                (error.stack ? '\nStack: ' + error.stack : ''));
      
      var error_basic_info = { 
        filename: file_display_name, 
        fileSize: (image_bytes ? image_bytes.length : 0), 
        format: 'unknown' 
      };
      var box_error_format = convert_to_box_format_({ hasExif: false, fileInfo: error_basic_info });
      
      // Ensure technicalNotes exists before appending
      box_error_format.technicalNotes = (box_error_format.technicalNotes || '') + 
        ' EXIF Parsing Error: ' + String(error.message || error).substring(0, 100);
      
      return box_error_format;
    }
  };

  /**
   * Legacy compatibility function - enhanced metadata extraction.
   * @param {string} file_id Box file ID
   * @param {string} access_token Valid Box access token
   * @param {string} filename The name of the file for logging
   * @returns {object|null} Enhanced EXIF data object for compatibility
   */
  ns.extract_enhanced_metadata = function(file_id, access_token, filename) {
    var box_formatted_metadata = ns.extract_metadata(file_id, access_token, filename);
    
    if (!box_formatted_metadata) {
      return null;
    }
    
    // Return in legacy format for compatibility
    return {
      hasExif: box_formatted_metadata.processingStage !== Config.PROCESSING_STAGE_FAILED,
      enhanced: true,
      metadata: box_formatted_metadata,
      extractionMethod: 'comprehensive_parser'
    };
  };

  return ns;
})();

// =============================================================================
// LEGACY COMPATIBILITY FUNCTIONS
// =============================================================================

/**
 * Legacy function name for compatibility with existing code.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @param {string} filename The name of the file for logging
 * @returns {object|null} Enhanced EXIF data object
 */
function extractMetadata(fileId, accessToken, filename) {
  return ExifProcessor.extract_enhanced_metadata(fileId, accessToken, filename);
}