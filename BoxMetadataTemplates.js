// File: BoxMetadataTemplates.gs
// Depends on: Config.gs (for BOX_API_BASE_URL, BOX_METADATA_SCOPE, BOX_METADATA_TEMPLATE_KEY, BOX_METADATA_TEMPLATE_DISPLAY_NAME, and PROCESSING_STAGE_* constants)
// Depends on: BoxOAuth.gs (indirectly, as it expects a valid accessToken)

/**
 * Creates the defined metadata template in Box.
 * Requires an admin-level access token with permissions to manage enterprise metadata templates.
 * @param {string} accessToken A valid Box access token.
 * @returns {object|null} The created template object from Box API, or null on failure.
 */
function createOptimalImageMetadataTemplate(accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: createOptimalImageMetadataTemplate - accessToken is required.');
    return null;
  }
  Logger.log(`Attempting to create metadata template: Key: ${BOX_METADATA_TEMPLATE_KEY}, Scope: ${BOX_METADATA_SCOPE}`);
  
  const templateData = {
    scope: BOX_METADATA_SCOPE, // From Config.gs
    templateKey: BOX_METADATA_TEMPLATE_KEY, // From Config.gs
    displayName: BOX_METADATA_TEMPLATE_DISPLAY_NAME, // From Config.gs
    fields: [
      // === CORE FILE INFORMATION ===
      { key: 'originalFilename', displayName: 'Original Filename', type: 'string', description: 'Original file name before any processing' },
      { key: 'folderPath', displayName: 'Folder Path', type: 'string', description: 'Full Box folder path for context' },
      { key: 'fileSizeMB', displayName: 'File Size (MB)', type: 'float', description: 'File size in megabytes' },
      { key: 'fileFormat', displayName: 'File Format', type: 'string', description: 'Image file format (JPG, PNG, etc.)' },
      // === IMAGE TECHNICAL SPECS ===
      { key: 'imageWidth', displayName: 'Image Width', type: 'float', description: 'Width in pixels' },
      { key: 'imageHeight', displayName: 'Image Height', type: 'float', description: 'Height in pixels' },
      { key: 'aspectRatio', displayName: 'Aspect Ratio', type: 'string', description: 'Width:Height ratio (e.g., 16:9, 4:3)' },
      { key: 'megapixels', displayName: 'Megapixels', type: 'float', description: 'Total megapixels (width × height / 1M)' },
      // === CAMERA/CAPTURE INFO ===
      { key: 'cameraModel', displayName: 'Camera Model', type: 'string', description: 'Camera or device used' },
      { key: 'dateTaken', displayName: 'Date Taken', type: 'date', description: 'When the photo was actually taken (from EXIF)' },
      { key: 'photographer', displayName: 'Photographer', type: 'string', description: 'Person who took the photo' },
      // === CONTENT CATEGORIZATION ===
      // Note: Populate 'options' for enum fields based on your specific business needs.
      { key: 'contentType', displayName: 'Content Type', type: 'enum', description: 'Primary category of image content',
        options: [ { key: 'artwork', displayName: 'Artwork' }, { key: 'fabrication_process', displayName: 'Fabrication Process' }, { key: 'marketing_material', displayName: 'Marketing Material'}, {key: 'team_portrait', displayName: 'Team Portrait'}, {key: 'event_photo', displayName: 'Event Photo'}, {key: 'equipment', displayName: 'Equipment'}, {key: 'facility_interior', displayName: 'Facility Interior'}, {key: 'facility_exterior', displayName: 'Facility Exterior'}, {key: 'documentation', displayName: 'Documentation'}, { key: 'other', displayName: 'Other' } ]},
      { key: 'subject', displayName: 'Primary Subject', type: 'string', description: 'Main subject or focus of the image' },
      // === LOCATION & CONTEXT ===
      { key: 'facilityLocation', displayName: 'Facility Location', type: 'enum', description: 'Specific location within facility',
        options: [ { key: 'main_lobby', displayName: 'Main Lobby'}, { key: 'studio_1', displayName: 'Studio 1'}, {key: 'fabrication_workshop', displayName: 'Fabrication Workshop'}, {key: 'metal_shop', displayName: 'Metal Shop'}, {key: 'wood_shop', displayName: 'Wood Shop'}, {key: 'paint_booth', displayName: 'Paint Booth'}, {key: 'assembly_area', displayName: 'Assembly Area'}, {key: 'storage_warehouse', displayName: 'Storage/Warehouse'}, {key: 'office_space', displayName: 'Office Space'}, {key: 'conference_room', displayName: 'Conference Room'}, {key: 'gallery_space', displayName: 'Gallery Space'}, {key: 'outdoor_yard', displayName: 'Outdoor Yard'}, {key: 'loading_dock', displayName: 'Loading Dock'}, { key: 'unknown', displayName: 'Unknown' } ]},
      { key: 'department', displayName: 'Department', type: 'enum', description: 'Department or team associated with image',
        options: [ { key: 'fabrication', displayName: 'Fabrication'}, { key: 'design', displayName: 'Design'}, { key: 'marketing', displayName: 'Marketing'}, { key: 'administration', displayName: 'Administration'}, { key: 'operations', displayName: 'Operations'}, { key: 'general', displayName: 'General' } ]},
      // === PROJECT & EVENT INFO ===
      { key: 'projectName', displayName: 'Project Name', type: 'string', description: 'Associated project or commission' },
      { key: 'clientName', displayName: 'Client Name', type: 'string', description: 'Client or organization (if applicable)' },
      { key: 'eventName', displayName: 'Event Name', type: 'string', description: 'Event or occasion (if applicable)' },
      { key: 'eventDate', displayName: 'Event Date', type: 'date', description: 'Date of event or milestone' },
      // === PEOPLE & CREDITS ===
      { key: 'peopleInImage', displayName: 'People in Image', type: 'string', description: 'Names of people visible in image' },
      { key: 'artistName', displayName: 'Artist Name', type: 'string', description: 'Artist or creator (for artwork)' },
      // === SEARCHABLE CONTENT ===
      { key: 'manualKeywords', displayName: 'Manual Keywords', type: 'string', description: 'Human-added searchable keywords' },
      { key: 'aiDetectedObjects', displayName: 'AI Detected Objects', type: 'string', description: 'Objects identified by AI analysis (comma-separated)' },
      { key: 'aiSceneDescription', displayName: 'AI Scene Description', type: 'string', description: 'AI-generated description of scene' },
      { key: 'extractedText', displayName: 'Extracted Text', type: 'string', description: 'Text found in image (OCR)' },
      { key: 'dominantColors', displayName: 'Dominant Colors', type: 'string', description: 'Primary colors in the image (comma-separated RGB values)' },
      // === BUSINESS METADATA ===
      { key: 'usageRights', displayName: 'Usage Rights', type: 'enum', description: 'Permissions for image usage',
        options: [ {key: 'internal_only', displayName: 'Internal Only'}, {key: 'marketing_approved', displayName: 'Marketing Approved'}, {key: 'client_shared', displayName: 'Client Shared'}, {key: 'public_domain', displayName: 'Public Domain'}, { key: 'pending_approval', displayName: 'Pending Approval' } ]},
      { key: 'qualityRating', displayName: 'Quality Rating', type: 'enum', description: 'Image quality assessment',
        options: [ {key: 'excellent', displayName: 'Excellent'}, {key: 'good', displayName: 'Good'}, {key: 'fair', displayName: 'Fair'}, {key: 'poor', displayName: 'Poor'}, { key: 'unrated', displayName: 'Unrated' } ]},
      { key: 'importance', displayName: 'Importance Level', type: 'enum', description: 'Business importance of image',
        options: [ {key: 'critical', displayName: 'Critical'}, {key: 'high', displayName: 'High'}, {key: 'medium', displayName: 'Medium'}, {key: 'low', displayName: 'Low'}, { key: 'archive', displayName: 'Archive Only' } ]},
      // === PROCESSING METADATA ===
      { key: 'processingStage', displayName: 'Processing Stage', type: 'enum', description: 'Current processing status',
        options: [ 
          { key: PROCESSING_STAGE_UNPROCESSED, displayName: 'Unprocessed' }, 
          { key: PROCESSING_STAGE_BASIC, displayName: 'Basic Info Extracted' }, 
          { key: PROCESSING_STAGE_EXIF, displayName: 'EXIF Extracted' }, 
          { key: PROCESSING_STAGE_AI, displayName: 'AI Analyzed' }, 
          { key: PROCESSING_STAGE_REVIEW, displayName: 'Human Reviewed' }, 
          { key: PROCESSING_STAGE_COMPLETE, displayName: 'Complete' } 
        ]},
      { key: 'aiConfidenceScore', displayName: 'AI Confidence Score', type: 'float', description: 'AI analysis confidence (0.0-1.0 or 0-100 scale)' },
      { key: 'lastProcessedDate', displayName: 'Last Processed', type: 'date', description: 'When metadata was last updated' },
      { key: 'processingVersion', displayName: 'Processing Version', type: 'string', description: 'Version of processing algorithm used' },
      { key: 'needsReview', displayName: 'Needs Human Review', type: 'enum', description: 'Flags for manual review (e.g., privacy, quality check)',
        options: [ { key: 'yes', displayName: 'Yes' }, { key: 'no', displayName: 'No' }, { key: 'completed', displayName: 'Review Completed' } ]},
      // === NOTES & COMMENTS ===
      { key: 'notes', displayName: 'Notes', type: 'string', description: 'Additional notes or comments' }
    ]
  };

  const url = `${BOX_API_BASE_URL}/metadata_templates/schema`; // BOX_API_BASE_URL from Config.gs
  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(templateData),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 201) { // 201 is 'Created'
      const createdTemplate = JSON.parse(responseText);
      Logger.log(`✅ Successfully created metadata template: ${createdTemplate.displayName} (Key: ${createdTemplate.templateKey}, ID: ${createdTemplate.id})`);
      return createdTemplate;
    } else if (responseCode === 409) { // Conflict - template already exists
      Logger.log(`Template '${templateData.templateKey}' already exists (HTTP 409). Attempting to fetch existing template. Response: ${responseText}`);
      return checkTemplateExists(templateData.templateKey, accessToken);
    } else {
      Logger.log(`ERROR: Failed to create metadata template '${templateData.templateKey}'. HTTP Code: ${responseCode}, Response: ${responseText}`);
      console.error(`Error creating template '${templateData.templateKey}' (${responseCode}):`, responseText);
      return null;
    }
  } catch (error) {
    const errorMessage = `EXCEPTION during template creation for '${templateData.templateKey}': ${error.toString()} ${error.stack ? '- Stack: ' + error.stack : ''}`;
    Logger.log(errorMessage);
    console.error(errorMessage);
    return null;
  }
}

/**
 * Lists all existing enterprise metadata templates.
 * @param {string} accessToken A valid Box access token.
 * @returns {object[]} An array of template entry objects from Box, or an empty array on failure.
 */
function listExistingTemplates(accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: listExistingTemplates - accessToken is required.');
    return [];
  }
  Logger.log(`Listing existing templates in scope: ${BOX_METADATA_SCOPE}...`); // BOX_METADATA_SCOPE from Config.gs
  
  const url = `${BOX_API_BASE_URL}/metadata_templates/${BOX_METADATA_SCOPE}`; // BOX_API_BASE_URL and BOX_METADATA_SCOPE from Config.gs
  const options = {
    headers: { 'Authorization': `Bearer ${accessToken}` },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const templates = JSON.parse(responseText);
      Logger.log(`Found ${templates.entries.length} template(s) in scope '${BOX_METADATA_SCOPE}'.`);
      templates.entries.forEach(template => {
        Logger.log(`  - DisplayName: "${template.displayName}", Key: "${template.templateKey}", Fields: ${template.fields ? template.fields.length : 'N/A'}`);
      });
      return templates.entries;
    } else {
      Logger.log(`ERROR: Failed to list templates. HTTP Code: ${responseCode}, Response: ${responseText}`);
      console.error(`Error listing templates (${responseCode}):`, responseText);
      return [];
    }
  } catch (error) {
    const errorMessage = `EXCEPTION during listing templates: ${error.toString()} ${error.stack ? '- Stack: ' + error.stack : ''}`;
    Logger.log(errorMessage);
    console.error(errorMessage);
    return [];
  }
}

/**
 * Checks if a specific metadata template exists by its key and scope.
 * @param {string} templateKey The key of the template to check.
 * @param {string} accessToken A valid Box access token.
 * @returns {object|null} The template object if it exists, null otherwise (or on error).
 */
function checkTemplateExists(templateKey, accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: checkTemplateExists - accessToken is required.');
    return null;
  }
  if (!templateKey) {
    Logger.log('ERROR: checkTemplateExists - templateKey is required.');
    return null;
  }
  
  const url = `${BOX_API_BASE_URL}/metadata_templates/${BOX_METADATA_SCOPE}/${templateKey}/schema`; // Constants from Config.gs
  Logger.log(`checkTemplateExists: Attempting to GET template schema from URL: ${url}`);

  const options = {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
    muteHttpExceptions: true
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();

    if (responseCode === 200) {
      const template = JSON.parse(responseText);
      Logger.log(`checkTemplateExists: Template '${templateKey}' (scope: ${BOX_METADATA_SCOPE}) found. DisplayName: '${template.displayName}'.`);
      return template;
    } else if (responseCode === 404) {
      Logger.log(`checkTemplateExists: Template '${templateKey}' (scope: ${BOX_METADATA_SCOPE}) was NOT found (404).`);
      return null;
    } else {
      Logger.log(`checkTemplateExists: Error fetching template '${templateKey}'. HTTP Code: ${responseCode}. Response from Box: ${responseText.substring(0, 500)}...`);
      console.error(`Error fetching template '${templateKey}' (${responseCode}):`, responseText);
      return null;
    }
  } catch (e) {
    const errorMessage = `checkTemplateExists: EXCEPTION checking for template '${templateKey}': ${e.toString()} ${e.stack ? '- Stack: ' + e.stack : ''}`;
    Logger.log(errorMessage);
    console.error(errorMessage);
    return null;
  }
}

/**
 * Gets the specified image metadata template, creating it if it doesn't exist.
 * @param {string} accessToken A valid Box access token.
 * @returns {object|null} The template object, or null if creation/retrieval fails.
 */
function getOrCreateImageTemplate(accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: getOrCreateImageTemplate - accessToken is required.');
    return null;
  }
  Logger.log(`Ensuring metadata template '${BOX_METADATA_TEMPLATE_KEY}' exists...`); // Constant from Config.gs
  let template = checkTemplateExists(BOX_METADATA_TEMPLATE_KEY, accessToken); // Constant from Config.gs
  
  if (!template) {
    Logger.log(`Template '${BOX_METADATA_TEMPLATE_KEY}' not found, attempting to create...`); // Constant from Config.gs
    template = createOptimalImageMetadataTemplate(accessToken);
  }
  
  if (template) {
    Logger.log(`Using template: ${template.displayName} (Key: ${template.templateKey})`);
  } else {
    Logger.log(`ERROR: Failed to get or create template '${BOX_METADATA_TEMPLATE_KEY}'. Check admin permissions for template creation if this persists.`); // Constant from Config.gs
  }
  return template;
}