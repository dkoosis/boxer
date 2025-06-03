// File: ExifExtraction.gs
// EXIF data extraction functions
// Uses cUseful library by Bruce McPherson for robust operations
// Depends on: Config.gs, BoxAuth.gs, EnhancedExifParser.gs

/**
 * Enhanced EXIF extraction using the comprehensive EnhancedExifParser.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Comprehensive EXIF data object or null on error
 */
function extractMetadata(fileId, accessToken, filename) {
  const fileDisplayName = filename || fileId; // Use filename if provided, else fileId

  if (!accessToken || !fileId) {
    Logger.log('ERROR: extractMetadata - fileId and accessToken are required');
    return null;
  }

  try {
    Logger.log(` > Extracting EXIF data for ${fileDisplayName}...`);

    // Use the enhanced parser with full metadata extraction, passing filename
    var enhancedMetadataContainer = EnhancedExifParser.extractMetadata(fileId, accessToken, filename); // Pass filename here

    if (enhancedMetadataContainer) { // This is the Box-formatted metadata from the parser
      Logger.log(` > EXIF data processed for ${fileDisplayName}.`);
      // The container from EnhancedExifParser is already Box-formatted
      // but we need to add hasExif, enhanced, extractionMethod for this function's contract
      return {
        hasExif: true, // Or determine this based on actual data in enhancedMetadataContainer
        enhanced: true, // Assuming parser is always "enhanced"
        metadata: enhancedMetadataContainer, // This is the payload for Box
        extractionMethod: 'comprehensive_parser'
      };
    } else {
      Logger.log(`⚠️ No EXIF data found or parser error for ${fileDisplayName}, falling back if basic extraction was intended.`);
      // Fallback to basic extraction (if you still want it, otherwise remove)
      // return extractBasicExifData(fileId, accessToken, filename); // Pass filename if basic is kept
      return { hasExif: false, fileInfo: {filename: fileDisplayName}, extractionMethod: 'parser_returned_null' };
    }

  } catch (error) {
    Logger.log(`Error during EXIF data extraction for ${fileDisplayName}: ${error.toString()}`);
    console.error(`EXIF extraction error for ${fileDisplayName}:`, error);

    // Fallback to basic extraction (if you still want it, otherwise remove)
    // return extractBasicExifData(fileId, accessToken, filename); // Pass filename if basic is kept
    return { hasExif: false, fileInfo: {filename: fileDisplayName}, error: error.toString() };
  }
}

/**
 * Fallback basic EXIF extraction for compatibility.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Basic EXIF data object or null on error
 */
function extractBasicExifData(fileId, accessToken) {
  if (!accessToken || !fileId) {
    Logger.log('ERROR: extractBasicExifData - fileId and accessToken are required');
    return null;
  }
  
  try {
    const downloadUrl = `${Config.BOX_API_BASE_URL}/files/${fileId}/content`;
    const response = UrlFetchApp.fetch(downloadUrl, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      muteHttpExceptions: true
    });

    const responseCode = response.getResponseCode();
    if (responseCode !== 200) {
      Logger.log(`Failed to download file ${fileId} for basic EXIF extraction. Code: ${responseCode}`);
      return null;
    }
    
    const imageBlob = response.getBlob();
    if (imageBlob.getContentType() !== 'image/jpeg' && imageBlob.getContentType() !== 'image/jpg') {
      return { hasExif: false, extractionMethod: 'basic_non_jpeg' };
    }
    
    const imageBytes = imageBlob.getBytes();
    const basicExif = parseBasicExif(imageBytes);
    
    if (basicExif && basicExif.hasExif) {
      return {
        hasExif: true,
        enhanced: false,
        metadata: convertBasicExifToBoxFormat(basicExif),
        extractionMethod: 'basic'
      };
    }
    
    return { hasExif: false, extractionMethod: 'basic_none_found' };
    
  } catch (error) {
    Logger.log(`Error in basic EXIF extraction from file ${fileId}: ${error.toString()}`);
    console.error(`Basic EXIF extraction error for file ${fileId}:`, error);
    return null;
  }
}

/**
 * Convert basic EXIF data to Box metadata format.
 * @param {object} basicExif Basic EXIF data
 * @returns {object} Box-compatible metadata
 */
function convertBasicExifToBoxFormat(basicExif) {
  var boxMetadata = {};
  
  if (basicExif.cameraModel) {
    boxMetadata.cameraModel = basicExif.cameraModel;
  }
  
  if (basicExif.dateTaken) {
    boxMetadata.dateTaken = basicExif.dateTaken;
  }
  
  if (basicExif.imageWidth && basicExif.imageHeight) {
    boxMetadata.imageWidth = basicExif.imageWidth;
    boxMetadata.imageHeight = basicExif.imageHeight;
    
    // Calculate aspect ratio
    var gcd = calculateGCD(basicExif.imageWidth, basicExif.imageHeight);
    boxMetadata.aspectRatio = (basicExif.imageWidth / gcd) + ':' + (basicExif.imageHeight / gcd);
    boxMetadata.megapixels = Math.round((basicExif.imageWidth * basicExif.imageHeight) / 1000000 * 10) / 10;
  }
  
  // GPS data - all three coordinates if available
  if (basicExif.gpsLatitude && basicExif.gpsLongitude) {
    boxMetadata.gpsLatitude = basicExif.gpsLatitude;
    boxMetadata.gpsLongitude = basicExif.gpsLongitude;
  }
  
  if (typeof basicExif.gpsAltitude === 'number') {
    boxMetadata.gpsAltitude = basicExif.gpsAltitude;
  }
  
  // Technical details
  var technicalDetails = [];
  if (basicExif.fNumber) technicalDetails.push('f/' + basicExif.fNumber);
  if (basicExif.exposureTime) technicalDetails.push(basicExif.exposureTime + 's');
  if (basicExif.iso) technicalDetails.push('ISO ' + basicExif.iso);
  if (basicExif.focalLength) technicalDetails.push(basicExif.focalLength + 'mm');
  
  if (technicalDetails.length > 0) {
    boxMetadata.notes = 'Camera settings: ' + technicalDetails.join(', ');
  }
  
  boxMetadata.processingStage = Config.PROCESSING_STAGE_EXIF;
  boxMetadata.lastProcessedDate = new Date().toISOString();
  boxMetadata.processingVersion = Config.PROCESSING_VERSION_BASIC;
  
  return boxMetadata;
}

/**
 * Simplified basic EXIF parser (legacy fallback).
 * @param {byte[]} imageBytes Byte array of the image
 * @returns {object|null} Basic EXIF data object or null if not found
 */
function parseBasicExif(imageBytes) {
  const exifData = {
    hasExif: false,
    cameraModel: null,
    dateTaken: null,
    imageWidth: null,
    imageHeight: null,
    fNumber: null,
    exposureTime: null,
    iso: null,
    focalLength: null,
    flash: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitude: null
  };
  
  try {
    // Check for JPEG signature
    if (imageBytes[0] !== 0xFF || imageBytes[1] !== 0xD8) {
      return exifData; // Not a JPEG
    }
    
    let offset = 2; // Start after SOI marker
    const maxSearchOffset = Math.min(imageBytes.length - 4, 65536); // Search in first 64KB

    while (offset < maxSearchOffset) {
      if (imageBytes[offset] === 0xFF) {
        const markerType = imageBytes[offset + 1];
        
        if (markerType === 0xE1) { // APP1 marker (commonly EXIF)
          const exifHeaderOffset = offset + 4;
          // Check for "Exif" header
          if (imageBytes[exifHeaderOffset] === 0x45 && imageBytes[exifHeaderOffset+1] === 0x78 && 
              imageBytes[exifHeaderOffset+2] === 0x69 && imageBytes[exifHeaderOffset+3] === 0x66 && 
              imageBytes[exifHeaderOffset+4] === 0x00 && imageBytes[exifHeaderOffset+5] === 0x00) {
            
            exifData.hasExif = true;

            // Simplified camera model detection
            const searchEnd = Math.min(offset + 2 + (imageBytes[offset+2] << 8 | imageBytes[offset+3]), imageBytes.length);
            const exifSegment = imageBytes.slice(exifHeaderOffset + 6, Math.min(searchEnd, exifHeaderOffset + 6 + 500));
            const exifString = String.fromCharCode.apply(null, exifSegment);
            
            const cameraMatchers = [
              /Canon EOS [^\s,]+/i, /Canon PowerShot [^\s,]+/i, /Canon [^\s,]+/i,
              /NIKON D[^\s,]+/i, /NIKON [^\s,]+/i,
              /SONY ILCE-[^\s,]+/i, /SONY DSC-[^\s,]+/i, /SONY [^\s,]+/i,
              /iPhone [^\s,]+/i, /iPad [^\s,]+/i,
              /SM-[A-Z0-9]+/i, /GT-[A-Z0-9]+/i, /Galaxy [^\s,]+/i,
              /Pixel [^\s,]+/i,
              /OLYMPUS [^\s,]+/i, /E-M[0-9]+/i,
              /FUJIFILM X-[^\s,]+/i, /FUJIFILM GFX[^\s,]+/i,
              /Panasonic DMC-[^\s,]+/i, /Panasonic DC-[^\s,]+/i
            ];

            for (const regex of cameraMatchers) {
              const cameraMatch = exifString.match(regex);
              if (cameraMatch && cameraMatch[0].length < 100) {
                exifData.cameraModel = cameraMatch[0].trim();
                break; 
              }
            }
            return exifData;
          }
        }
        // Move to next segment
        const segmentLength = (imageBytes[offset+2] << 8) | imageBytes[offset+3];
        offset += segmentLength + 2;
      } else {
        offset++;
      }
    }
    
    return exifData;
  } catch (error) {
    console.error('Error parsing basic EXIF:', error);
    Logger.log(`Error parsing basic EXIF: ${error.toString()}`);
    return exifData;
  }
}

/**
 * Calculate Greatest Common Divisor (for aspect ratio calculation).
 * @param {number} a First number
 * @param {number} b Second number
 * @returns {number} GCD
 */
function calculateGCD(a, b) {
  return b === 0 ? a : calculateGCD(b, a % b);
}

/**
 * Legacy function name for compatibility.
 * @param {string} fileId Box file ID
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} EXIF data object or null on error
 */
function extractExifData(fileId, accessToken) {
  return extractMetadata(fileId, accessToken);
}