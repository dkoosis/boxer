// File: ExifProcessor.js
// Comprehensive EXIF data extraction and parsing functions.
// Merges the logic from former EXIFParser.js and ExifExtraction.js.
// Depends on: ConfigManager.js, BoxAuth.js

/**
 * ExifProcessor namespace - comprehensive metadata extraction for multiple image formats.
 * Provides comprehensive metadata extraction with sophisticated parsing and fallback mechanisms.
 */
const ExifProcessor = (function() {
  'use strict';
  
  const ns = {};
  let utils_ = null; // For cUseful library
  
  // Enhanced file format signatures
  const FILE_SIGNATURES = {
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
  const EXIF_TYPES = {
    BYTE: 1, ASCII: 2, SHORT: 3, LONG: 4, RATIONAL: 5,
    SBYTE: 6, UNDEFINED: 7, SSHORT: 8, SLONG: 9, SRATIONAL: 10,
    FLOAT: 11, DOUBLE: 12
  };
  
  const TYPE_SIZES = [undefined, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];
  
  // Comprehensive EXIF tags with enhanced mappings
  const EXIF_TAGS = {
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
  function initUtils_() {
    if (utils_ === null) {
      if (typeof cUseful !== 'undefined') {
        utils_ = cUseful;
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
  function extractBasicFileInfo_(imageBytes) {
    const basicInfo = {
      fileSize: imageBytes.length,
      format: 'Unknown'
    };
    
    // Detect file format
    for (const format in FILE_SIGNATURES) {
      const signature = FILE_SIGNATURES[format];
      let matches = true;
      
      for (let i = 0; i < signature.length; i++) {
        if (signature[i] !== null && imageBytes[i] !== signature[i]) {
          matches = false;
          break;
        }
      }
      
      if (matches) {
        if (format.startsWith('TIFF')) {
          basicInfo.format = 'TIFF';
        } else {
          basicInfo.format = format;
        }
        break;
      }
    }
    
    return basicInfo;
  }

  /**
   * Find EXIF segment in JPEG/TIFF data
   * @private
   */
  function findExifSegment_(imageBytes) {
    try {
      if (imageBytes.length < 12) return null;
      
      // For JPEG files
      if (imageBytes[0] === 0xFF && imageBytes[1] === 0xD8) {
        let offset = 2;
        const maxSearchOffset = Math.min(imageBytes.length - 4, 65536);
        
        while (offset < maxSearchOffset) {
          if (imageBytes[offset] === 0xFF) {
            const markerType = imageBytes[offset + 1];
            
            if (markerType === 0xE1) { // APP1 marker (commonly EXIF)
              const length = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
              const exifHeaderOffset = offset + 4;
              
              // Check for "Exif" identifier
              if (exifHeaderOffset + 6 < imageBytes.length &&
                  imageBytes[exifHeaderOffset] === 0x45 && // 'E'
                  imageBytes[exifHeaderOffset + 1] === 0x78 && // 'x'
                  imageBytes[exifHeaderOffset + 2] === 0x69 && // 'i'
                  imageBytes[exifHeaderOffset + 3] === 0x66) { // 'f'
                
                // Return TIFF header part (skip "Exif\0\0")
                return imageBytes.slice(exifHeaderOffset + 6, offset + 2 + length);
              }
            }
            
            // Move to next marker
            const segmentLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
            offset += 2 + segmentLength;
          } else {
            offset++;
          }
        }
      }
      
      // For TIFF files - the whole file is the EXIF data
      if ((imageBytes[0] === 0x49 && imageBytes[1] === 0x49) || // Little endian
          (imageBytes[0] === 0x4D && imageBytes[1] === 0x4D)) { // Big endian
        return imageBytes;
      }
      
      return null;
    } catch (error) {
      Logger.log(`Error finding EXIF segment: ${error.toString()}`);
      return null;
    }
  }

  /**
   * Parse TIFF structure from EXIF data
   * @private
   */
  function parseTiffStructure_(exifData) {
    try {
      if (!exifData || exifData.length < 8) return null;
      
      const isLittleEndian = exifData[0] === 0x49 && exifData[1] === 0x49;
      const tiffMagic = isLittleEndian ? 
        (exifData[2] | (exifData[3] << 8)) :
        ((exifData[2] << 8) | exifData[3]);
      
      if (tiffMagic !== 42) return null; // Not valid TIFF
      
      const firstIfdOffset = isLittleEndian ?
        (exifData[4] | (exifData[5] << 8) | (exifData[6] << 16) | (exifData[7] << 24)) :
        ((exifData[4] << 24) | (exifData[5] << 16) | (exifData[6] << 8) | exifData[7]);
      
      const parsedData = {
        endianness: isLittleEndian ? 'little' : 'big',
        ifd0: parseIfd_(exifData, firstIfdOffset, isLittleEndian),
        exifIfd: null,
        gpsIfd: null
      };
      
      // Look for EXIF and GPS sub-IFDs
      if (parsedData.ifd0) {
        if (parsedData.ifd0['34665']) { // EXIF IFD pointer
          const exifOffset = parsedData.ifd0['34665'].value;
          parsedData.exifIfd = parseIfd_(exifData, exifOffset, isLittleEndian);
        }
        
        if (parsedData.ifd0['34853']) { // GPS IFD pointer
          const gpsOffset = parsedData.ifd0['34853'].value;
          parsedData.gpsIfd = parseIfd_(exifData, gpsOffset, isLittleEndian);
        }
      }
      
      return parsedData;
    } catch (error) {
      Logger.log(`Error parsing TIFF structure: ${error.toString()}`);
      return null;
    }
  }

  /**
   * Parse Individual IFD (Image File Directory)
   * @private
   */
  function parseIfd_(data, offset, isLittleEndian) {
    try {
      if (offset + 2 >= data.length) return null;
      
      const entryCount = isLittleEndian ?
        (data[offset] | (data[offset + 1] << 8)) :
        ((data[offset] << 8) | data[offset + 1]);
      
      const entries = {};
      let entryOffset = offset + 2;
      
      for (let i = 0; i < entryCount; i++) {
        if (entryOffset + 12 > data.length) break;
        
        const tag = isLittleEndian ?
          (data[entryOffset] | (data[entryOffset + 1] << 8)) :
          ((data[entryOffset] << 8) | data[entryOffset + 1]);
        
        const type = isLittleEndian ?
          (data[entryOffset + 2] | (data[entryOffset + 3] << 8)) :
          ((data[entryOffset + 2] << 8) | data[entryOffset + 3]);
        
        const count = isLittleEndian ?
          (data[entryOffset + 4] | (data[entryOffset + 5] << 8) | 
           (data[entryOffset + 6] << 16) | (data[entryOffset + 7] << 24)) :
          ((data[entryOffset + 4] << 24) | (data[entryOffset + 5] << 16) | 
           (data[entryOffset + 6] << 8) | data[entryOffset + 7]);
        
        const valueOffset = entryOffset + 8;
        const value = parseTagValue_(data, type, count, valueOffset, isLittleEndian);
        
        entries[tag] = {
          tag: tag,
          type: type,
          count: count,
          value: value,
          tagName: EXIF_TAGS[tag] || ('Unknown_' + tag)
        };
        
        entryOffset += 12;
      }
      
      return entries;
    } catch (error) {
      Logger.log(`Error parsing IFD: ${error.toString()}`);
      return null;
    }
  }

  /**
   * Parse tag value based on type
   * @private
   */
  function parseTagValue_(data, type, count, valueOffset, isLittleEndian) {
    try {
      const typeSize = TYPE_SIZES[type] || 1;
      const totalSize = typeSize * count;
      
      // If value fits in 4 bytes, it's stored directly
      if (totalSize <= 4) {
        if (type === EXIF_TYPES.ASCII) {
          let str = '';
          for (let i = 0; i < Math.min(count, 4); i++) {
            const charCode = data[valueOffset + i];
            if (charCode === 0) break;
            str += String.fromCharCode(charCode);
          }
          return str;
        } else if (type === EXIF_TYPES.SHORT) {
          return isLittleEndian ?
            (data[valueOffset] | (data[valueOffset + 1] << 8)) :
            ((data[valueOffset] << 8) | data[valueOffset + 1]);
        } else if (type === EXIF_TYPES.LONG) {
          return isLittleEndian ?
            (data[valueOffset] | (data[valueOffset + 1] << 8) | 
             (data[valueOffset + 2] << 16) | (data[valueOffset + 3] << 24)) :
            ((data[valueOffset] << 24) | (data[valueOffset + 1] << 16) | 
             (data[valueOffset + 2] << 8) | data[valueOffset + 3]);
        } else {
          return data[valueOffset];
        }
      } else {
        // Value is stored at offset
        const actualOffset = isLittleEndian ?
          (data[valueOffset] | (data[valueOffset + 1] << 8) | 
           (data[valueOffset + 2] << 16) | (data[valueOffset + 3] << 24)) :
          ((data[valueOffset] << 24) | (data[valueOffset + 1] << 16) | 
           (data[valueOffset + 2] << 8) | data[valueOffset + 3]);
        
        if (actualOffset + totalSize > data.length) return null;
        
        if (type === EXIF_TYPES.ASCII) {
          let str = '';
          for (let i = 0; i < count; i++) {
            const charCode = data[actualOffset + i];
            if (charCode === 0) break;
            str += String.fromCharCode(charCode);
          }
          return str;
        } else if (type === EXIF_TYPES.RATIONAL) {
          const numerator = isLittleEndian ?
            (data[actualOffset] | (data[actualOffset + 1] << 8) | 
             (data[actualOffset + 2] << 16) | (data[actualOffset + 3] << 24)) :
            ((data[actualOffset] << 24) | (data[actualOffset + 1] << 16) | 
             (data[actualOffset + 2] << 8) | data[actualOffset + 3]);
          
          const denominator = isLittleEndian ?
            (data[actualOffset + 4] | (data[actualOffset + 5] << 8) | 
             (data[actualOffset + 6] << 16) | (data[actualOffset + 7] << 24)) :
            ((data[actualOffset + 4] << 24) | (data[actualOffset + 5] << 16) | 
             (data[actualOffset + 6] << 8) | data[actualOffset + 7]);
          
          return denominator !== 0 ? numerator / denominator : 0;
        }
      }
      
      return null;
    } catch (error) {
      Logger.log(`Error parsing tag value: ${error.toString()}`);
      return null;
    }
  }

  /**
   * Organize parsed TIFF data into meaningful metadata
   * @private
   */
  function organizeMetadata_(tiffStructure, basicInfo) {
    try {
      const organized = {
        hasExif: true,
        fileInfo: basicInfo,
        camera: {},
        image: {},
        settings: {},
        gps: {},
        technical: {}
      };
      
      if (!tiffStructure) {
        organized.hasExif = false;
        return organized;
      }
      
      // Process IFD0 (main image data)
      if (tiffStructure.ifd0) {
        processIfdData_(tiffStructure.ifd0, organized);
      }
      
      // Process EXIF IFD (camera settings)
      if (tiffStructure.exifIfd) {
        processIfdData_(tiffStructure.exifIfd, organized);
      }
      
      // Process GPS IFD
      if (tiffStructure.gpsIfd) {
        processGpsData_(tiffStructure.gpsIfd, organized);
      }
      
      return organized;
    } catch (error) {
      Logger.log(`Error organizing metadata: ${error.toString()}`);
      return { hasExif: false, fileInfo: basicInfo };
    }
  }

  /**
   * Process IFD data into organized structure
   * @private
   */
  function processIfdData_(ifd, organized) {
    for (const tag in ifd) {
      const entry = ifd[tag];
      const tagName = entry.tagName;
      const value = entry.value;
      
      if (!value) continue;
      
      // Camera information
      if (tagName === 'Make') organized.camera.make = value;
      else if (tagName === 'Model') organized.camera.model = value;
      else if (tagName === 'Software') organized.camera.software = value;
      else if (tagName === 'LensMake') organized.camera.lensMake = value;
      else if (tagName === 'LensModel') organized.camera.lensModel = value;
      
      // Image dimensions and properties
      else if (tagName === 'ImageWidth') organized.image.width = value;
      else if (tagName === 'ImageLength') organized.image.height = value;
      else if (tagName === 'PixelXDimension') organized.image.pixelWidth = value;
      else if (tagName === 'PixelYDimension') organized.image.pixelHeight = value;
      else if (tagName === 'Orientation') organized.image.orientation = value;
      
      // Camera settings
      else if (tagName === 'ExposureTime') organized.settings.exposureTime = value;
      else if (tagName === 'FNumber') organized.settings.fNumber = value;
      else if (tagName === 'ISOSpeedRatings') organized.settings.iso = value;
      else if (tagName === 'FocalLength') organized.settings.focalLength = value;
      else if (tagName === 'Flash') organized.settings.flash = value;
      else if (tagName === 'WhiteBalance') organized.settings.whiteBalance = value;
      
      // Date/time
      else if (tagName === 'DateTime') organized.technical.dateTime = value;
      else if (tagName === 'DateTimeOriginal') organized.technical.dateTimeOriginal = value;
      else if (tagName === 'DateTimeDigitized') organized.technical.dateTimeDigitized = value;
    }
  }

  /**
   * Process GPS data from GPS IFD
   * @private
   */
  function processGpsData_(gpsIfd, organized) {
    try {
      let gpsLat = null, gpsLon = null, gpsAlt = null;
      let latRef = '', lonRef = '', altRef = '';
      
      for (const tag in gpsIfd) {
        const entry = gpsIfd[tag];
        const tagName = entry.tagName;
        const value = entry.value;
        
        if (tagName === 'GPSLatitudeRef') latRef = value;
        else if (tagName === 'GPSLongitudeRef') lonRef = value;
        else if (tagName === 'GPSAltitudeRef') altRef = value;
        else if (tagName === 'GPSLatitude') gpsLat = value;
        else if (tagName === 'GPSLongitude') gpsLon = value;
        else if (tagName === 'GPSAltitude') gpsAlt = value;
      }
      
      // Convert GPS coordinates to decimal degrees
      if (gpsLat && latRef) {
        const latDecimal = convertGpsCoordinate_(gpsLat);
        if (latRef === 'S') latDecimal = -latDecimal;
        organized.gps.latitude = latDecimal;
      }
      
      if (gpsLon && lonRef) {
        let lonDecimal = convertGpsCoordinate_(gpsLon);
        if (lonRef === 'W') lonDecimal = -lonDecimal;
        organized.gps.longitude = lonDecimal;
      }
      
      if (gpsAlt !== null) {
        organized.gps.altitude = altRef === 1 ? -gpsAlt : gpsAlt;
      }
      
    } catch (error) {
      Logger.log(`Error processing GPS data: ${error.toString()}`);
    }
  }

  /**
   * Convert GPS coordinate from degrees/minutes/seconds to decimal
   * @private
   */
  function convertGpsCoordinate_(coordinate) {
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
  function convertToBoxFormat_(metadata) {
    try {
      const boxMetadata = {
        processingStage: ConfigManager.PROCESSING_STAGE_EXIF,
        lastProcessedDate: new Date().toISOString(),
        processingVersion: ConfigManager.getCurrentVersion() + '_enhanced'
      };
      
      if (!metadata.hasExif) {
        boxMetadata.processingStage = ConfigManager.PROCESSING_STAGE_FAILED;
        boxMetadata.technicalNotes = 'No EXIF data found in file';
        return boxMetadata;
      }
      
      // File information
      if (metadata.fileInfo) {
        if (metadata.fileInfo.filename) boxMetadata.filename = metadata.fileInfo.filename;
        if (metadata.fileInfo.fileSize) boxMetadata.fileSize = metadata.fileInfo.fileSize;
        if (metadata.fileInfo.format) boxMetadata.fileFormat = metadata.fileInfo.format;
      }
      
      // Camera information
      if (metadata.camera) {
        if (metadata.camera.make && metadata.camera.model) {
          boxMetadata.cameraModel = `${metadata.camera.make} ${metadata.camera.model}`;
        } else if (metadata.camera.model) {
          boxMetadata.cameraModel = metadata.camera.model;
        }
        
        if (metadata.camera.software) boxMetadata.cameraSoftware = metadata.camera.software;
        if (metadata.camera.lensMake || metadata.camera.lensModel) {
          boxMetadata.lensModel = `${metadata.camera.lensMake || ''} ${metadata.camera.lensModel || ''}`;
        }
      }
      
      // Image dimensions
      if (metadata.image) {
        const width = metadata.image.pixelWidth || metadata.image.width;
        const height = metadata.image.pixelHeight || metadata.image.height;
        
        if (width && height) {
          boxMetadata.imageWidth = width;
          boxMetadata.imageHeight = height;
          
          // Calculate aspect ratio and megapixels
          const gcd = calculateGcd_(width, height);
          boxMetadata.aspectRatio = `${width / gcd}:${height / gcd}`;
          boxMetadata.megapixels = Math.round((width * height) / 1000000 * 10) / 10;
        }
        
        if (metadata.image.orientation) boxMetadata.orientation = metadata.image.orientation;
      }
      
      // Camera settings
      if (metadata.settings) {
        if (metadata.settings.exposureTime) boxMetadata.exposureTime = metadata.settings.exposureTime;
        if (metadata.settings.fNumber) boxMetadata.fNumber = metadata.settings.fNumber;
        if (metadata.settings.iso) boxMetadata.isoSpeed = metadata.settings.iso;
        if (metadata.settings.focalLength) boxMetadata.focalLength = metadata.settings.focalLength;
        if (metadata.settings.flash !== undefined) boxMetadata.flashUsed = metadata.settings.flash > 0;
        if (metadata.settings.whiteBalance !== undefined) boxMetadata.whiteBalance = metadata.settings.whiteBalance;
      }
      
      // Date taken (prefer DateTimeOriginal)
      if (metadata.technical) {
        const dateTaken = metadata.technical.dateTimeOriginal || 
                         metadata.technical.dateTimeDigitized || 
                         metadata.technical.dateTime;
        if (dateTaken) {
          boxMetadata.dateTaken = dateTaken;
        }
      }
      
      // GPS coordinates
      if (metadata.gps) {
        if (typeof metadata.gps.latitude === 'number') boxMetadata.gpsLatitude = metadata.gps.latitude;
        if (typeof metadata.gps.longitude === 'number') boxMetadata.gpsLongitude = metadata.gps.longitude;
        if (typeof metadata.gps.altitude === 'number') boxMetadata.gpsAltitude = metadata.gps.altitude;
      }
      
      // Technical notes
      const technicalNotes = [];
      if (metadata.fileInfo && metadata.fileInfo.format) {
        technicalNotes.push(`Format: ${metadata.fileInfo.format}`);
      }
      
      if (technicalNotes.length > 0) {
        boxMetadata.technicalNotes = (boxMetadata.technicalNotes ? 
          boxMetadata.technicalNotes + "; " : "") + technicalNotes.join('; ');
      }
      
      return boxMetadata;
    } catch (error) {
      Logger.log(`Error converting to Box format: ${error.toString()}`);
      return {
        processingStage: ConfigManager.PROCESSING_STAGE_FAILED,
        technicalNotes: `EXIF Processing Error: ${String(error.message || error).substring(0, 100)}`
      };
    }
  }

  /**
   * Calculate Greatest Common Divisor for aspect ratio
   * @private
   */
  function calculateGcd_(a, b) {
    return b === 0 ? a : calculateGcd_(b, a % b);
  }

  /**
   * Extract JPEG/TIFF metadata
   * @private
   */
  function extractJpegMetadata_(imageBytes, basicInfo) {
    try {
      const exifDataSegment = findExifSegment_(imageBytes);
      if (!exifDataSegment) {
        Logger.log(` ⚠️ No EXIF APP1 segment found in JPEG/TIFF structure for ${basicInfo.filename}`);
        return { hasExif: false, fileInfo: basicInfo };
      }
      
      const tiffStructure = parseTiffStructure_(exifDataSegment);
      return organizeMetadata_(tiffStructure, basicInfo);
    } catch (error) {
      Logger.log(`Error extracting JPEG/TIFF EXIF metadata for ${basicInfo.filename}: ${error.toString()}`);
      return { hasExif: false, fileInfo: basicInfo };
    }
  }

  /**
   * Extract metadata from other formats (PNG, WebP, etc.)
   * @private
   */
  function extractOtherFormatMetadata_(imageBytes, basicInfo) {
    Logger.log(` ⚠️ Advanced EXIF extraction for ${basicInfo.format} not fully implemented. Checking for common patterns.`);
    
    // Try a generic search for TIFF header within the file as fallback
    // This is speculative and might not be standard for these formats
    for (let i = 0; i < Math.min(imageBytes.length - 8, 1024); i++) {
      if ((imageBytes[i] === 0x49 && imageBytes[i + 1] === 0x49) || // Little endian TIFF
          (imageBytes[i] === 0x4D && imageBytes[i + 1] === 0x4D)) { // Big endian TIFF
        try {
          const potentialTiff = imageBytes.slice(i);
          const tiffStructure = parseTiffStructure_(potentialTiff);
          if (tiffStructure) {
            Logger.log(` ✅ Found embedded TIFF structure in ${basicInfo.format} file`);
            return organizeMetadata_(tiffStructure, basicInfo);
          }
        } catch (error) {
          // Continue searching
        }
      }
    }
    
    return { hasExif: false, fileInfo: basicInfo };
  }

  // =============================================================================
  // PUBLIC API
  // =============================================================================

  /**
   * Main function to extract and parse EXIF metadata from a file.
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid Box access token
   * @param {string} filename The name of the file for logging
   * @returns {object|null} Box-formatted metadata object with enhanced EXIF data or null on error
   */
  ns.extractExifData = function(fileId, accessToken, filename) {
    const fileDisplayName = filename || fileId;
    
    if (!fileId || !accessToken) {
      Logger.log('ERROR: ExifProcessor.extractExifData requires fileId and accessToken');
      return null;
    }
    
    const utils = initUtils_();
    let imageBytes;
    
    try {
      Logger.log(` > Parsing comprehensive EXIF data from ${fileDisplayName}...`);
      
      const downloadUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${fileId}/content`;
      const response = utils.rateLimitExpBackoff(function() {
        return UrlFetchApp.fetch(downloadUrl, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
          muteHttpExceptions: true
        });
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`    Failed to download ${fileDisplayName} for metadata extraction. HTTP Code: ${response.getResponseCode()} Response: ${response.getContentText().substring(0, 200)}`);
        return null;
      }
      
      const imageBlob = response.getBlob();
      imageBytes = new Uint8Array(imageBlob.getBytes());
      
      const basicInfo = extractBasicFileInfo_(imageBytes);
      basicInfo.filename = fileDisplayName;
      
      Logger.log(` > Format detected: ${basicInfo.format || 'Unknown'} for ${fileDisplayName}. Size: ${imageBytes.length} bytes.`);

      let metadataFromParser = null;
      
      if (basicInfo.format === 'JPEG' || basicInfo.format === 'TIFF') {
        metadataFromParser = extractJpegMetadata_(imageBytes, basicInfo);
      } else if (['PNG', 'WEBP', 'HEIC', 'AVIF'].indexOf(basicInfo.format) !== -1) {
        metadataFromParser = extractOtherFormatMetadata_(imageBytes, basicInfo); 
      } else {
        // Fallback for unknown formats - try to find EXIF anyway
        metadataFromParser = extractJpegMetadata_(imageBytes, basicInfo);
        if (!metadataFromParser || !metadataFromParser.hasExif) {
          metadataFromParser = { hasExif: false, fileInfo: basicInfo };
        }
      }

      if (metadataFromParser) {
        Logger.log(` > File parsed. EXIF found: ${metadataFromParser.hasExif} for ${fileDisplayName}.`);
        const converted = convertToBoxFormat_(metadataFromParser);
        // This is a special case to create a combined return object for MetadataExtraction.js
        return {
            hasExif: metadataFromParser.hasExif,
            metadata: converted
        };
      } else {
        Logger.log(` ⚠️ No processable EXIF structure identified in ${fileDisplayName}. Returning basic info.`);
        return { 
            hasExif: false,
            metadata: convertToBoxFormat_({ hasExif: false, fileInfo: basicInfo })
        };
      }
      
    } catch (error) {
      Logger.log(`    ERROR: Parsing EXIF from ${fileDisplayName} failed: ${error.toString()}${error.stack ? '\nStack: ' + error.stack : ''}`);
      
      const errorBasicInfo = { 
        filename: fileDisplayName, 
        fileSize: (imageBytes ? imageBytes.length : 0), 
        format: 'unknown' 
      };
      const boxErrorFormat = convertToBoxFormat_({ hasExif: false, fileInfo: errorBasicInfo });
      
      boxErrorFormat.technicalNotes = (boxErrorFormat.technicalNotes || '') + 
        ` EXIF Parsing Error: ${String(error.message || error).substring(0, 100)}`;
      
      return {
          hasExif: false,
          metadata: boxErrorFormat
      };
    }
  };

  return ns;
})();