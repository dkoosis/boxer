// File: EXIFParser.gs
// Robust metadata extraction from multiple image formats
// Depends on: Config.gs, BoxAuth.gs

/**
 * EnhancedExifParser namespace - comprehensive metadata extraction for multiple image formats.
 * Provides comprehensive metadata extraction with sophisticated parsing and fallback mechanisms.
 */
var EnhancedExifParser = (function() {
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
    0xA002: 'PixelXDimension', 0xA003: 'PixelYDimension', // EXIF specific dimensions
    0xA430: 'CameraOwnerName', 0xA431: 'BodySerialNumber',
    0xA433: 'LensMake', 0xA434: 'LensModel', 0xA435: 'LensSerialNumber',
    
    // GPS data
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x001D: 'GPSDateStamp',
    
    // Maker notes and metadata
    0x927C: 'MakerNote', 0x9286: 'UserComment', 0x83BB: 'IPTC',
    0x8773: 'ICC_Profile', 0x02BC: 'XMLPacket' // XMP
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
    // Add more interpretations as needed
  };
  
  function initUtils_() {
    if (!utils_) {
      try {
        utils_ = cUseful;
        Logger.log('ℹ️ EnhancedExifParser: cUseful library initialized.');
      } catch (e) {
        Logger.log('❌ ERROR: EnhancedExifParser - cUseful library not available: ' + e.toString());
        throw new Error('cUseful library is required but not available.');
      }
    }
    return utils_;
  }
  
  function detectFileFormat_(bytes) {
    if (!bytes || bytes.length < 12) return null;
    try {
      if (bytes[0] === 0xFF && bytes[1] === 0xD8) return 'JPEG';
      if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'PNG';
      if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
          bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'WEBP';
      if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
        var brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
        if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'iso8'].indexOf(brand.toLowerCase()) !== -1) return 'HEIC';
        if (brand.toLowerCase() === 'avif') return 'AVIF';
      }
      if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'GIF';
      if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
          (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) return 'TIFF';
      if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'BMP';
      return null;
    } catch (error) {
      Logger.log('Error detecting file format: ' + error.toString());
      return null;
    }
  }

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

  function findExifSegment_(imageBytes) {
    if (!imageBytes || imageBytes.length < 20) return null;
    try {
      var offset = 2; 
      var maxSearchOffset = Math.min(imageBytes.length - 4, 65536); 
      while (offset < maxSearchOffset) {
        if (imageBytes[offset] === 0xFF) {
          var markerType = imageBytes[offset + 1];
          if (markerType === 0xE1) { 
            var segmentLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
            if (segmentLength < 8) { 
               if (offset + 2 < imageBytes.length) { // Check if we can read the length for next segment
                 offset += ((imageBytes[offset+2] << 8) | imageBytes[offset+3]) + 2;
               } else { break; }
               continue;
            }
            var exifHeaderOffset = offset + 4;
            if (exifHeaderOffset + 6 <= imageBytes.length &&
                imageBytes[exifHeaderOffset] === 0x45 && imageBytes[exifHeaderOffset + 1] === 0x78 &&
                imageBytes[exifHeaderOffset + 2] === 0x69 && imageBytes[exifHeaderOffset + 3] === 0x66 &&
                imageBytes[exifHeaderOffset + 4] === 0x00 && imageBytes[exifHeaderOffset + 5] === 0x00) {
              var tiffDataStart = exifHeaderOffset + 6;
              var tiffDataLength = segmentLength - 2 - 6; 
              if (tiffDataLength > 0 && tiffDataStart + tiffDataLength <= imageBytes.length) {
                return imageBytes.slice(tiffDataStart, tiffDataStart + tiffDataLength);
              }
            }
          }
          if (offset + 3 < imageBytes.length) {
            var segLength = (imageBytes[offset + 2] << 8) | imageBytes[offset + 3];
            if (segLength < 2) { offset++; continue;}
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

  function parseTiffStructure_(tiffData) {
    if (!tiffData || tiffData.length < 8) return null;
    try {
      var byteOrderMarker = (tiffData[0] << 8) | tiffData[1];
      var littleEndian = byteOrderMarker === 0x4949; 
      if (byteOrderMarker !== 0x4949 && byteOrderMarker !== 0x4D4D) {
        Logger.log('Invalid TIFF byte order marker: 0x' + byteOrderMarker.toString(16));
        return null;
      }
      var view = createSafeBufferView_(tiffData, littleEndian);
      var tiffMagicNumber = view.safeGetUint16(2); 
      if (tiffMagicNumber !== 42) {
        Logger.log('Invalid TIFF magic number: ' + tiffMagicNumber);
        return null;
      }
      var ifd0Offset = view.safeGetUint32(4);
      if (ifd0Offset === null || ifd0Offset === 0 || ifd0Offset >= tiffData.length) { // IFD0 offset cannot be 0
        Logger.log('Invalid IFD0 offset: ' + ifd0Offset);
        return null;
      }
      var parsedData = {
        littleEndian: littleEndian,
        ifd0: {}, exif: {}, gps: {}
      };
      parsedData.ifd0 = parseIFD_(view, ifd0Offset, 'IFD0');
      var exifOffsetTag = parsedData.ifd0[0x8769]; 
      if (typeof exifOffsetTag === 'number' && exifOffsetTag > 0 && exifOffsetTag < tiffData.length) {
        parsedData.exif = parseIFD_(view, exifOffsetTag, 'ExifIFD');
      }
      var gpsOffsetTag = parsedData.ifd0[0x8825]; 
      if (typeof gpsOffsetTag === 'number' && gpsOffsetTag > 0 && gpsOffsetTag < tiffData.length) {
        parsedData.gps = parseIFD_(view, gpsOffsetTag, 'GPSIFD');
      }
      return parsedData;
    } catch (error) {
      Logger.log('Error parsing TIFF structure: ' + error.toString());
      return null;
    }
  }

  function parseIFD_(view, ifdOffset, ifdName) {
    var tags = {};
    try {
      var entryCount = view.safeGetUint16(ifdOffset);
      if (entryCount === null || entryCount > 500) { // Max reasonable entries
        Logger.log('Invalid or excessive entry count for ' + ifdName + ': ' + entryCount);
        return tags;
      }
      var currentOffset = ifdOffset + 2; 
      for (var i = 0; i < entryCount; i++) {
        if (currentOffset + 12 > view.byteLength) {
          Logger.log('Error parsing ' + ifdName + ': Not enough data for directory entry ' + (i + 1));
          break;
        }
        var tagId = view.safeGetUint16(currentOffset);
        var type = view.safeGetUint16(currentOffset + 2);
        var count = view.safeGetUint32(currentOffset + 4);
        var valueDataBytes = view.safeGetBytes(currentOffset + 8, 4); 

        if (tagId === null || type === null || count === null || valueDataBytes.length < 4 || type === 0 || type > 12) {
          Logger.log('Error parsing ' + ifdName + ': Invalid tag field(s) for entry ' + (i+1) + 
                      ' TagID: ' + tagId + ' Type: ' + type + ' Count: ' + count);
          currentOffset += 12;
          continue;
        }
        var typeSize = TYPE_SIZES[type];
        var totalValueBytes = typeSize * count;
        var valueBuffer;
        var actualValueOffsetInItsBuffer = 0;

        if (totalValueBytes > 4) {
          var offsetFromTiffStart = createSafeBufferView_(valueDataBytes, view.littleEndian).safeGetUint32(0);
          if (offsetFromTiffStart === null || offsetFromTiffStart + totalValueBytes > view.bytes.length) { // Check against main view's original byte array length
            Logger.log('Error parsing ' + ifdName + ': Invalid offset 0x' + (offsetFromTiffStart !== null ? offsetFromTiffStart.toString(16) : 'null') + ' for tag 0x' + tagId.toString(16) + ' (totalValueBytes: ' + totalValueBytes + ')');
            currentOffset += 12;
            continue;
          }
          valueBuffer = view.bytes.slice(offsetFromTiffStart, offsetFromTiffStart + totalValueBytes);
        } else {
          valueBuffer = valueDataBytes.slice(0, totalValueBytes); // Use only necessary bytes
        }
        
        var valueView = createSafeBufferView_(valueBuffer, view.littleEndian);
        var value = parseTagValue_(valueView, type, actualValueOffsetInItsBuffer, count, tagId);
        
        if (value !== null) {
          var tagName = EXIF_TAGS[tagId] || ('Tag0x' + tagId.toString(16).toUpperCase());
          tags[tagName] = value;
          tags[tagId] = value; 
        }
        currentOffset += 12; 
      }
    } catch (error) {
      Logger.log('Exception parsing ' + ifdName + ': ' + error.toString());
    }
    return tags;
  }

  function parseTagValue_(view, type, offset, count, tagId) {
    try {
      var values = [];
      var typeSize = TYPE_SIZES[type];
      if (!typeSize) return null; 

      for (var i = 0; i < count; i++) {
        var currentValOffset = offset + (i * typeSize);
        var val = null;
        if (currentValOffset + typeSize > view.byteLength) {
          Logger.log('Error parsing tag 0x' + tagId.toString(16) + ': Attempt to read past buffer for value ' + (i+1));
          break; 
        }
        switch (type) {
          case EXIF_TYPES.BYTE:       val = view.safeGetUint8(currentValOffset); break;
          case EXIF_TYPES.UNDEFINED:  val = view.safeGetUint8(currentValOffset); break;
          case EXIF_TYPES.ASCII:      return view.safeGetString(offset, count); 
          case EXIF_TYPES.SHORT:      val = view.safeGetUint16(currentValOffset); break;
          case EXIF_TYPES.LONG:       val = view.safeGetUint32(currentValOffset); break;
          case EXIF_TYPES.RATIONAL:
             if (currentValOffset + 8 <= view.byteLength) {
                var num = view.safeGetUint32(currentValOffset);
                var den = view.safeGetUint32(currentValOffset + 4);
                if (num !== null && den !== null) val = (den === 0) ? 0 : num / den;
             }
            break;
          default: Logger.log(' ⚠️ Unsupported EXIF type ' + type + ' for tag 0x' + tagId.toString(16)); return null;
        }
        if (val !== null) values.push(val);
        else if (type !== EXIF_TYPES.RATIONAL) break; 
      }
      if (values.length === 0 && type !== EXIF_TYPES.ASCII) return null; // ASCII can be empty string
      if (type === EXIF_TYPES.ASCII) return values.join(""); // Should be handled by safeGetString already
      return count === 1 && values.length === 1 ? values[0] : values;
    } catch (error) {
      Logger.log('Error parsing value for tag 0x' + tagId.toString(16) + ', type ' + type + ': ' + error.toString());
      return null;
    }
  }
  
  function extractBasicFileInfo_(imageBytes) {
    var info = {
      fileSize: imageBytes.length,
      format: detectFileFormat_(imageBytes),
      width: null, height: null,
      hasMetadata: false 
    };
    try {
      if (info.format === 'PNG' && imageBytes.length >= 24) {
        var pngView = new DataView(imageBytes.buffer, imageBytes.byteOffset + 16, 8); 
        info.width = pngView.getUint32(0, false); 
        info.height = pngView.getUint32(4, false);
      } else if (info.format === 'GIF' && imageBytes.length >= 10) {
        var gifView = new DataView(imageBytes.buffer, imageBytes.byteOffset + 6, 4);
        info.width = gifView.getUint16(0, true); 
        info.height = gifView.getUint16(2, true);
      } else if (info.format === 'BMP' && imageBytes.length >= 26) {
        var bmpView = new DataView(imageBytes.buffer, imageBytes.byteOffset + 18, 8);
        info.width = bmpView.getInt32(0, true); 
        info.height = Math.abs(bmpView.getInt32(4, true)); // Height can be negative for top-down bitmaps
      }
    } catch (error) {
      Logger.log('Error extracting basic file info (dimensions): ' + error.toString());
    }
    return info;
  }

  function convertDMSToDD_(dms, ref) {
    if (!Array.isArray(dms) || dms.length === 0) return null;
    var degrees = Number(dms[0]) || 0;
    var minutes = dms.length > 1 ? (Number(dms[1]) || 0) : 0;
    var seconds = dms.length > 2 ? (Number(dms[2]) || 0) : 0;
    if (isNaN(degrees) || isNaN(minutes) || isNaN(seconds)) return null;
    var dd = degrees + (minutes / 60) + (seconds / 3600);
    if (ref === 'S' || ref === 'W') dd = -dd;
    return dd;
  }

  function calculateAspectRatio_(width, height) {
    if (!width || !height || width <= 0 || height <= 0) return null;
    var gcd = function(a, b) { return b === 0 ? a : gcd(b, a % b); };
    var divisor = gcd(Math.round(width), Math.round(height));
    return (Math.round(width) / divisor) + ':' + (Math.round(height) / divisor);
  }

  function organizeMetadata_(tiffStructure, basicInfo) {
    var result = {
      hasExif: false, fileInfo: basicInfo, camera: {}, settings: {}, image: {},
      datetime: {}, location: {}, technical: {}, other: {}
    };
    if (!tiffStructure) {
      Logger.log("organizeMetadata_: No TIFF structure provided.");
      return result;
    }
    result.hasExif = true;
    try {
      var allTags = {};
      Object.keys(tiffStructure.ifd0 || {}).forEach(function(key) { allTags[key] = tiffStructure.ifd0[key]; });
      Object.keys(tiffStructure.exif || {}).forEach(function(key) { if(!allTags[key]) allTags[key] = tiffStructure.exif[key]; });
      Object.keys(tiffStructure.gps || {}).forEach(function(key) { if(!allTags[key]) allTags[key] = tiffStructure.gps[key]; });

      Object.keys(allTags).forEach(function(key) {
        var value = allTags[key];
        var tagIdNum = parseInt(key);
        var tagName = (EXIF_TAGS[tagIdNum] && !isNaN(tagIdNum)) ? EXIF_TAGS[tagIdNum] : key;
        var lowerTagName = tagName.toLowerCase();

        if (['make', 'model', 'software', 'lensmake', 'lensmodel', 'cameraownername', 'bodyserialnumber', 'artist', 'copyright'].indexOf(lowerTagName) !== -1) {
          result.camera[lowerTagName] = value;
        } else if (['exposuretime', 'fnumber', 'isospeedratings', 'focallength', 'flash', 'meteringmode', 'exposureprogram', 'whitebalance', 'shutterspeedvalue', 'aperturevalue', 'exposurebiasvalue', 'lightsource', 'focallengthin35mmfilm', 'exposuremode', 'scenecapturetype', 'contrast', 'saturation', 'sharpness'].indexOf(lowerTagName) !== -1) {
          result.settings[lowerTagName] = value;
          if (TAG_INTERPRETATIONS[tagIdNum] && TAG_INTERPRETATIONS[tagIdNum][value] !== undefined) {
            result.settings[lowerTagName + 'desc'] = TAG_INTERPRETATIONS[tagIdNum][value];
          }
        } else if (['imagewidth', 'imagelength', 'orientation', 'colorspace', 'pixelxdimension', 'pixelydimension', 'bitspersample'].indexOf(lowerTagName) !== -1) {
          result.image[lowerTagName] = value;
          if (lowerTagName === 'orientation' && TAG_INTERPRETATIONS[0x0112] && TAG_INTERPRETATIONS[0x0112][value] !== undefined) {
            result.image.orientationdesc = TAG_INTERPRETATIONS[0x0112][value];
          }
        } else if (['datetime', 'datetimeoriginal', 'datetimedigitized'].indexOf(lowerTagName) !== -1) {
          result.datetime[lowerTagName] = value;
        } else if (tagName.startsWith('GPS')) { 
          result.location[lowerTagName] = value;
        } else if (['xresolution', 'yresolution', 'resolutionunit', 'compression', 'photometricinterpretation'].indexOf(lowerTagName) !== -1) {
          result.technical[lowerTagName] = value;
        } else {
          result.other[lowerTagName] = value;
        }
      });

      if (result.location.gpslatitude && result.location.gpslatituderef &&
          result.location.gpslongitude && result.location.gpslongituderef) {
        result.location.latitude = convertDMSToDD_(result.location.gpslatitude, result.location.gpslatituderef);
        result.location.longitude = convertDMSToDD_(result.location.gpslongitude, result.location.gpslongituderef);
      }
      if (result.location.gpsaltitude && (typeof result.location.gpsaltitude === 'number' || (Array.isArray(result.location.gpsaltitude) && result.location.gpsaltitude.length > 0))) {
        var altValue = Array.isArray(result.location.gpsaltitude) ? result.location.gpsaltitude[0] : result.location.gpsaltitude;
        result.location.altitude = Number(altValue) * (result.location.gpsaltituderef === 1 ? -1 : 1);
      }

      var w = null, h = null;
      if (typeof result.image.pixelxdimension === 'number' && result.image.pixelxdimension > 0) w = result.image.pixelxdimension;
      else if (typeof result.image.imagewidth === 'number' && result.image.imagewidth > 0) w = result.image.imagewidth;
      if (typeof result.image.pixelydimension === 'number' && result.image.pixelydimension > 0) h = result.image.pixelydimension;
      else if (typeof result.image.imagelength === 'number' && result.image.imagelength > 0) h = result.image.imagelength;
      
      if (w && h) {
        result.image.finalWidth = Number(w);
        result.image.finalHeight = Number(h);
        result.image.aspectRatio = calculateAspectRatio_(Number(w), Number(h));
        result.image.megapixels = Math.round((Number(w) * Number(h)) / 1000000 * 10) / 10;
      }
    } catch (error) {
      Logger.log('Error in organizeMetadata_: ' + error.toString());
    }
    return result;
  }

  function convertToBoxFormat_(metadata) {
    var boxMetadata = {
      processingStage: metadata.hasExif ? (Config.PROCESSING_STAGE_EXIF || 'exif_extracted') : (Config.PROCESSING_STAGE_BASIC || 'basic_extracted'),
      lastProcessedDate: new Date().toISOString(),
      processingVersion: metadata.hasExif ? (Config.PROCESSING_VERSION_ENHANCED || 'v_enh_exif') : (Config.PROCESSING_VERSION_BASIC || 'v_basic')
    };

    try {
      if (metadata.fileInfo) {
        if (metadata.fileInfo.filename) boxMetadata.originalFilename = String(metadata.fileInfo.filename);
        if (metadata.fileInfo.format) boxMetadata.fileFormat = String(metadata.fileInfo.format);
      }

      if (metadata.camera) {
        var make = metadata.camera.make || '';
        var model = metadata.camera.model || '';
        if (make || model) boxMetadata.cameraModel = (String(make) + ' ' + String(model)).trim();
        if (metadata.camera.software) boxMetadata.software = String(metadata.camera.software);
        if (metadata.camera.artist) boxMetadata.photographer = String(metadata.camera.artist);
        if (metadata.camera.copyright) boxMetadata.copyright = String(metadata.camera.copyright);
      }

      if (metadata.image) {
        if (typeof metadata.image.finalWidth === 'number' && metadata.image.finalWidth > 0) {
          boxMetadata.imageWidth = metadata.image.finalWidth;
        }
        if (typeof metadata.image.finalHeight === 'number' && metadata.image.finalHeight > 0) {
          boxMetadata.imageHeight = metadata.image.finalHeight;
        }
        if (metadata.image.aspectRatio) {
          boxMetadata.aspectRatio = metadata.image.aspectRatio;
        }
        if (typeof metadata.image.megapixels === 'number') {
          boxMetadata.megapixels = metadata.image.megapixels;
        }
        var techNotesOrientation = metadata.image.orientationdesc ? 'Orientation: ' + metadata.image.orientationdesc : '';
      }
      
      if ((!boxMetadata.imageWidth || boxMetadata.imageWidth <= 0) && metadata.fileInfo && metadata.fileInfo.width > 0) {
        boxMetadata.imageWidth = metadata.fileInfo.width;
      }
      if ((!boxMetadata.imageHeight || boxMetadata.imageHeight <= 0) && metadata.fileInfo && metadata.fileInfo.height > 0) {
        boxMetadata.imageHeight = metadata.fileInfo.height;
      }
      if (boxMetadata.imageWidth && boxMetadata.imageHeight && boxMetadata.imageWidth > 0 && boxMetadata.imageHeight > 0) {
        if (!boxMetadata.aspectRatio) boxMetadata.aspectRatio = calculateAspectRatio_(boxMetadata.imageWidth, boxMetadata.imageHeight);
        if (typeof boxMetadata.megapixels !== 'number') boxMetadata.megapixels = Math.round((boxMetadata.imageWidth * boxMetadata.imageHeight) / 1000000 * 10) / 10;
      }

      if (metadata.datetime) {
        var dateTakenStr = metadata.datetime.datetimeoriginal || metadata.datetime.datetime || metadata.datetime.datetimedigitized;
        if (dateTakenStr && typeof dateTakenStr === 'string') {
          try {
            var isoDateStr = dateTakenStr.substring(0, 10).replace(/:/g, '-') + dateTakenStr.substring(10);
            var parsedDate = new Date(isoDateStr);
            if (!isNaN(parsedDate.getTime())) boxMetadata.dateTaken = parsedDate.toISOString();
          } catch (e) { Logger.log('Error parsing dateTaken string: ' + dateTakenStr + ' - ' + e.toString()); }
        }
      }

      var settingsSummaryParts = [];
      if (metadata.settings) {
        if (metadata.settings.fnumber) settingsSummaryParts.push('f/' + metadata.settings.fnumber);
        if (typeof metadata.settings.exposuretime === 'number') {
          var et = metadata.settings.exposuretime;
          settingsSummaryParts.push((et >= 0.25 ? et.toFixed(2) + 's' : '1/' + Math.round(1 / et) + 's'));
        }
        if (metadata.settings.isospeedratings) settingsSummaryParts.push('ISO ' + (Array.isArray(metadata.settings.isospeedratings) ? metadata.settings.isospeedratings[0] : metadata.settings.isospeedratings));
        if (metadata.settings.focallength) settingsSummaryParts.push(metadata.settings.focallength + 'mm');
        if (metadata.settings.flash !== undefined && metadata.settings.flash !== null) settingsSummaryParts.push('Flash: ' + metadata.settings.flash);
        if (metadata.settings.exposureprogramdesc) settingsSummaryParts.push(metadata.settings.exposureprogramdesc);
         if (metadata.settings.whitebalancedesc) settingsSummaryParts.push('WB: ' + metadata.settings.whitebalancedesc); // Added WhiteBalanceDesc
         if (metadata.settings.meteringmodedesc) settingsSummaryParts.push('Metering: ' + metadata.settings.meteringmodedesc); // Added MeteringModeDesc
      }
       if (settingsSummaryParts.length > 0) boxMetadata.cameraSettings = settingsSummaryParts.join(', ');


      if (metadata.location) {
        if (typeof metadata.location.latitude === 'number') boxMetadata.gpsLatitude = metadata.location.latitude;
        if (typeof metadata.location.longitude === 'number') boxMetadata.gpsLongitude = metadata.location.longitude;
        if (typeof metadata.location.altitude === 'number') boxMetadata.gpsAltitude = metadata.location.altitude;
      }

      var technicalNotesParts = [];
      if (techNotesOrientation) technicalNotesParts.push(techNotesOrientation);
      // Add other technical notes from metadata.technical if needed for your Box template
      if (metadata.technical && metadata.technical.xresolution) technicalNotesParts.push(`XRes: ${metadata.technical.xresolution}`);
      if (metadata.technical && metadata.technical.yresolution) technicalNotesParts.push(`YRes: ${metadata.technical.yresolution}`);
      if (metadata.technical && metadata.technical.resolutionunit) {
           const resUnitMap = {1: 'None', 2: 'Inch', 3: 'cm'};
           technicalNotesParts.push(`ResUnit: ${resUnitMap[metadata.technical.resolutionunit] || metadata.technical.resolutionunit}`);
      }

      if (technicalNotesParts.length > 0) {
        boxMetadata.technicalNotes = (boxMetadata.technicalNotes ? boxMetadata.technicalNotes + "; " : "") + technicalNotesParts.join('; ');
      }

    } catch (error) {
      Logger.log('Error during convertToBoxFormat_: ' + error.toString() + '\nInput Metadata: ' + JSON.stringify(metadata).substring(0, 500));
    }
    return boxMetadata;
  }
  
  ns.extractMetadata = function(fileId, accessToken, filename) {
    var fileDisplayName = filename || fileId;
    if (!fileId || !accessToken) {
      Logger.log('ERROR: EnhancedExifParser.extractMetadata requires fileId and accessToken');
      return null;
    }
    var utils = initUtils_();
    var imageBytes; // Define higher to be in scope for catch block
    try {
      Logger.log(' > Parsing file structure for EXIF data from ' + fileDisplayName + '...');
      var downloadUrl = (Config.BOX_API_BASE_URL || 'https://api.box.com/2.0') + '/files/' + fileId + '/content';
      var response = utils.rateLimitExpBackoff(function() {
        return UrlFetchApp.fetch(downloadUrl, {
          headers: { 'Authorization': 'Bearer ' + accessToken },
          muteHttpExceptions: true
        });
      });
      if (response.getResponseCode() !== 200) {
        Logger.log('    Failed to download ' + fileDisplayName + ' for metadata extraction. HTTP Code: ' + response.getResponseCode() + " Response: " + response.getContentText().substring(0,200));
        return null;
      }
      var imageBlob = response.getBlob();
      imageBytes = new Uint8Array(imageBlob.getBytes()); // Now imageBytes is assigned
      var basicInfo = extractBasicFileInfo_(imageBytes);
      basicInfo.filename = fileDisplayName; 
      Logger.log(' > Format detected: ' + (basicInfo.format || 'Unknown') + ' for ' + fileDisplayName + '. Size: ' + imageBytes.length + ' bytes.');

      var metadataFromParser = null;
      if (basicInfo.format === 'JPEG' || basicInfo.format === 'TIFF') { // TIFF can contain EXIF directly
        metadataFromParser = extractJpegMetadata_(imageBytes, basicInfo); // findExifSegment_ works for TIFF structure too
      } else if (['PNG', 'WEBP', 'HEIC', 'AVIF'].indexOf(basicInfo.format) !== -1) {
        // These formats might embed EXIF in different ways (e.g., 'exif' chunk in PNG/WebP)
        // For now, this parser primarily handles EXIF in JPEG/TIFF structure.
        metadataFromParser = extractOtherFormatMetadata_(imageBytes, basicInfo); 
      } else { // Fallback for unknown or other formats, try to find EXIF anyway
        metadataFromParser = extractJpegMetadata_(imageBytes, basicInfo);
        if (!metadataFromParser || !metadataFromParser.hasExif) {
          metadataFromParser = { hasExif: false, fileInfo: basicInfo };
        }
      }

      if (metadataFromParser) {
        Logger.log(' > File parsed. EXIF found: ' + metadataFromParser.hasExif + ' for ' + fileDisplayName + '.');
        return convertToBoxFormat_(metadataFromParser);
      } else {
        Logger.log(' ⚠️ No processable EXIF structure identified in ' + fileDisplayName + '. Returning basic info.');
        return convertToBoxFormat_({ hasExif: false, fileInfo: basicInfo });
      }
    } catch (error) {
      Logger.log('    ERROR: Parsing EXIF from ' + fileDisplayName + ' failed: ' + error.toString() + (error.stack ? '\nStack: ' + error.stack : ''));
      var errorBasicInfo = { filename: fileDisplayName, fileSize: (imageBytes ? imageBytes.length : 0), format: 'unknown' };
      var boxErrorFormat = convertToBoxFormat_({ hasExif: false, fileInfo: errorBasicInfo });
      // Ensure technicalNotes exists before appending
      boxErrorFormat.technicalNotes = (boxErrorFormat.technicalNotes || '') + ' EXIF Parsing Error: ' + String(error.message || error).substring(0,100);
      return boxErrorFormat;
    }
  };

  function extractJpegMetadata_(imageBytes, basicInfo) {
    try {
      var exifDataSegment = findExifSegment_(imageBytes); // This is the TIFF-structured EXIF data
      if (!exifDataSegment) {
        Logger.log(' ⚠️ No EXIF APP1 segment found in JPEG/TIFF structure for ' + basicInfo.filename);
        return { hasExif: false, fileInfo: basicInfo };
      }
      var tiffStructure = parseTiffStructure_(exifDataSegment);
      return organizeMetadata_(tiffStructure, basicInfo);
    } catch (error) {
      Logger.log('Error extracting JPEG/TIFF EXIF metadata for ' + basicInfo.filename + ': ' + error.toString());
      return { hasExif: false, fileInfo: basicInfo };
    }
  }
  
  function extractOtherFormatMetadata_(imageBytes, basicInfo) {
    // Placeholder: For PNG, WebP, HEIC, one would need to find specific chunks ('eXIf' for PNG/WebP)
    // and then pass that chunk's data (after removing chunk header) to parseTiffStructure_.
    // This is a simplified version.
    Logger.log(' ⚠️ Advanced EXIF extraction for ' + basicInfo.format + ' not fully implemented. Checking for common patterns.');
    // Try a generic search for TIFF header within the first part of the file as a fallback
    // This is speculative and might not be standard for these formats.
    const searchLimit = Math.min(imageBytes.length, 2048); // Search in first 2KB
    for (let i = 0; i < searchLimit - 8; i++) {
        if ((imageBytes[i] === 0x49 && imageBytes[i+1] === 0x49 && imageBytes[i+2] === 0x2A && imageBytes[i+3] === 0x00) ||
            (imageBytes[i] === 0x4D && imageBytes[i+1] === 0x4D && imageBytes[i+2] === 0x00 && imageBytes[i+3] === 0x2A)) {
            Logger.log('Found potential TIFF header in ' + basicInfo.format + ' at offset ' + i);
            // Be careful with the length of data to pass to parseTiffStructure_
            // This part is highly experimental and likely needs proper chunk parsing for these formats
            const potentialTiffData = imageBytes.slice(i); 
            const tiffStructure = parseTiffStructure_(potentialTiffData);
            if (tiffStructure && (Object.keys(tiffStructure.ifd0).length > 0 || Object.keys(tiffStructure.exif).length > 0)) {
                return organizeMetadata_(tiffStructure, basicInfo);
            }
        }
    }
    return { hasExif: false, fileInfo: basicInfo };
  }
  
  ns.testMetadataExtraction = function(testFileId) {
    Logger.log("=== Comprehensive Metadata Extraction Test ===");
    var accessToken = getValidAccessToken(); // Assumes getValidAccessToken is available globally
    if (!accessToken) {
      Logger.log("❌ No access token available for test.");
      return;
    }
    try {
      var fileToTest = testFileId;
      var fileNameToTest = "testFile"; // Default if no ID

      if (!fileToTest && typeof BoxFileOperations !== 'undefined' && BoxFileOperations.findAllImageFiles) {
        // Attempt to find a test file if BoxFileOperations is available
        var testImages = BoxFileOperations.findAllImageFiles(Config.ACTIVE_TEST_FOLDER_ID || '0', accessToken);
        if (testImages.length === 0) {
          Logger.log("❌ No test images found in default test folder. Provide a fileId or ensure test folder has images.");
          return;
        }
        fileToTest = testImages[0].id;
        fileNameToTest = testImages[0].name;
        Logger.log("Testing with file: " + fileNameToTest + " (ID: " + fileToTest + ")");
      } else if (!fileToTest) {
         Logger.log("❌ No testFileId provided and BoxFileOperations not available to find one. Aborting test.");
         return;
      }
      
      var result = ns.extractMetadata(fileToTest, accessToken, fileNameToTest);
      
      if (result) {
        Logger.log("✅ Extraction completed for " + fileNameToTest + "!");
        Logger.log("Extracted Box-formatted metadata keys: " + Object.keys(result).join(', '));
        // Log some key values if they exist
        if(result.cameraModel) Logger.log("  Camera Model: " + result.cameraModel);
        if(result.imageWidth && result.imageHeight) Logger.log("  Dimensions: " + result.imageWidth + "x" + result.imageHeight);
        if(result.dateTaken) Logger.log("  Date Taken: " + result.dateTaken);
        if(result.gpsLatitude && result.gpsLongitude) Logger.log("  GPS: " + result.gpsLatitude + ", " + result.gpsLongitude);

      } else {
        Logger.log("❌ No metadata extracted or extraction failed for " + fileNameToTest);
      }
    } catch (error) {
      Logger.log("❌ Test failed for " + fileNameToTest + ": " + error.toString() + (error.stack ? "\nStack: " + error.stack : ""));
    }
  };
  
  ns.extractComprehensiveExif = function(imageBytes) { // Kept for potential internal use or legacy
    if (!imageBytes || imageBytes.length === 0) return { hasExif: false, fileInfo: {fileSize: 0, format: null} };
    var basicInfo = extractBasicFileInfo_(imageBytes);
    var metadata = extractJpegMetadata_(imageBytes, basicInfo); // Assumes JPEG/TIFF like structure
    return metadata || { hasExif: false, fileInfo: basicInfo };
  };
  
  return ns;
})();