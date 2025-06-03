// File: BoxMetadataTemplates.gs
// Box metadata template management for comprehensive image metadata
// Depends on: Config.gs, BoxAuth.gs

/**
 * Creates the comprehensive image metadata template in Box.
 * Requires admin-level access token with enterprise metadata permissions.
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Created template object or null on failure
 */
function createOptimalImageMetadataTemplate(accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: createOptimalImageMetadataTemplate - accessToken is required');
    return null;
  }
  
  Logger.log(`Creating metadata template: ${Config.BOX_METADATA_TEMPLATE_KEY}, Scope: ${Config.BOX_METADATA_SCOPE}`);
  
  const templateData = {
    scope: Config.BOX_METADATA_SCOPE,
    templateKey: Config.BOX_METADATA_TEMPLATE_KEY,
    displayName: Config.BOX_METADATA_TEMPLATE_DISPLAY_NAME,
    fields: [
      // === CORE FILE INFORMATION ===
      { key: 'originalFilename', displayName: 'Original Filename', type: 'string', description: 'Original file name before processing' },
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
      { key: 'dateTaken', displayName: 'Date Taken', type: 'date', description: 'When the photo was taken (from EXIF)' },
      { key: 'photographer', displayName: 'Photographer', type: 'string', description: 'Person who took the photo' },
      
      // === CONTENT CATEGORIZATION ===
      { key: 'contentType', displayName: 'Content Type', type: 'enum', description: 'Primary category of image content',
        options: [
          { key: 'artwork', displayName: 'Artwork' },
          { key: 'fabrication_process', displayName: 'Fabrication Process' },
          { key: 'marketing_material', displayName: 'Marketing Material'},
          { key: 'team_portrait', displayName: 'Team Portrait'},
          { key: 'event_photo', displayName: 'Event Photo'},
          { key: 'equipment', displayName: 'Equipment'},
          { key: 'facility_interior', displayName: 'Facility Interior'},
          { key: 'facility_exterior', displayName: 'Facility Exterior'},
          { key: 'documentation', displayName: 'Documentation'},
          { key: 'other', displayName: 'Other' }
        ]},
      { key: 'subject', displayName: 'Primary Subject', type: 'string', description: 'Main subject or focus of the image' },
      
      // === LOCATION & CONTEXT ===
      { key: 'facilityLocation', displayName: 'Facility Location', type: 'enum', description: 'Specific location within facility',
        options: [
          { key: 'main_lobby', displayName: 'Main Lobby'},
          { key: 'studio_1', displayName: 'Studio 1'},
          { key: 'fabrication_workshop', displayName: 'Fabrication Workshop'},
          { key: 'metal_shop', displayName: 'Metal Shop'},
          { key: 'wood_shop', displayName: 'Wood Shop'},
          { key: 'paint_booth', displayName: 'Paint Booth'},
          { key: 'assembly_area', displayName: 'Assembly Area'},
          { key: 'storage_warehouse', displayName: 'Storage/Warehouse'},
          { key: 'office_space', displayName: 'Office Space'},
          { key: 'conference_room', displayName: 'Conference Room'},
          { key: 'gallery_space', displayName: 'Gallery Space'},
          { key: 'outdoor_yard', displayName: 'Outdoor Yard'},
          { key: 'loading_dock', displayName: 'Loading Dock'},
          { key: 'unknown', displayName: 'Unknown' }
        ]},
      { key: 'department', displayName: 'Department', type: 'enum', description: 'Department or team associated with image',
        options: [
          { key: 'fabrication', displayName: 'Fabrication'},
          { key: 'design', displayName: 'Design'},
          { key: 'marketing', displayName: 'Marketing'},
          { key: 'administration', displayName: 'Administration'},
          { key: 'operations', displayName: 'Operations'},
          { key: 'general', displayName: 'General' }
        ]},
      
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
      
      // === GPS/LOCATION DATA ===
      { key: 'gpsLatitude', displayName: 'GPS Latitude', type: 'float', description: 'GPS Latitude coordinate' },
      { key: 'gpsLongitude', displayName: 'GPS Longitude', type: 'float', description: 'GPS Longitude coordinate' },
      { key: 'gpsAltitude', displayName: 'GPS Altitude', type: 'float', description: 'GPS Altitude in meters' },
      
      // === BUSINESS METADATA ===
      { key: 'usageRights', displayName: 'Usage Rights', type: 'enum', description: 'Permissions for image usage',
        options: [
          { key: 'internal_only', displayName: 'Internal Only'},
          { key: 'marketing_approved', displayName: 'Marketing Approved'},
          { key: 'client_shared', displayName: 'Client Shared'},
          { key: 'public_domain', displayName: 'Public Domain'},
          { key: 'pending_approval', displayName: 'Pending Approval' }
        ]},
      { key: 'qualityRating', displayName: 'Quality Rating', type: 'enum', description: 'Image quality assessment',
        options: [
          { key: 'excellent', displayName: 'Excellent'},
          { key: 'good', displayName: 'Good'},
          { key: 'fair', displayName: 'Fair'},
          { key: 'poor', displayName: 'Poor'},
          { key: 'unrated', displayName: 'Unrated' }
        ]},
      { key: 'importance', displayName: 'Importance Level', type: 'enum', description: 'Business importance of image',
        options: [
          { key: 'critical', displayName: 'Critical'},
          { key: 'high', displayName: 'High'},
          { key: 'medium', displayName: 'Medium'},
          { key: 'low', displayName: 'Low'},
          { key: 'archive', displayName: 'Archive Only' }
        ]},
      
      // === PROCESSING METADATA ===
      { key: 'processingStage', displayName: 'Processing Stage', type: 'enum', description: 'Current processing status',
        options: [
          { key: Config.PROCESSING_STAGE_UNPROCESSED, displayName: 'Unprocessed' },
          { key: Config.PROCESSING_STAGE_BASIC, displayName: 'Basic Info Extracted' },
          { key: Config.PROCESSING_STAGE_EXIF, displayName: 'EXIF Extracted' },
          { key: Config.PROCESSING_STAGE_AI, displayName: 'AI Analyzed' },
          { key: Config.PROCESSING_STAGE_REVIEW, displayName: 'Human Reviewed' },
          { key: Config.PROCESSING_STAGE_COMPLETE, displayName: 'Complete' }
        ]},
      { key: 'aiConfidenceScore', displayName: 'AI Confidence Score', type: 'float', description: 'AI analysis confidence (0.0-1.0)' },
      { key: 'lastProcessedDate', displayName: 'Last Processed', type: 'date', description: 'When metadata was last updated' },
      { key: 'processingVersion', displayName: 'Processing Version', type: 'string', description: 'Version of processing algorithm used' },
      { key: 'buildNumber', displayName: 'Build Number', type: 'string', description: 'Boxer build that processed this file' },
      { key: 'needsReview', displayName: 'Needs Human Review', type: 'enum', description: 'Flags for manual review',
        options: [
          { key: 'yes', displayName: 'Yes' },
          { key: 'no', displayName: 'No' },
          { key: 'completed', displayName: 'Review Completed' }
        ]},
      
      // === NOTES & COMMENTS ===
      { key: 'notes', displayName: 'Notes', type: 'string', description: 'Additional notes or comments' }
    ]
  };

  const url = `${Config.BOX_API_BASE_URL}/metadata_templates/schema`;
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

    if (responseCode === 201) {
      const createdTemplate = JSON.parse(responseText);
      Logger.log(`✅ Created metadata template: ${createdTemplate.displayName} (Key: ${createdTemplate.templateKey})`);
      return createdTemplate;
    } else if (responseCode === 409) {
      Logger.log(`Template '${templateData.templateKey}' already exists. Fetching existing template.`);
      return checkTemplateExists(templateData.templateKey, accessToken);
    } else {
      Logger.log(`ERROR: Failed to create template '${templateData.templateKey}'. HTTP Code: ${responseCode}, Response: ${responseText}`);
      return null;
    }
  } catch (error) {
    Logger.log(`EXCEPTION creating template '${templateData.templateKey}': ${error.toString()}`);
    return null;
  }
}

/**
 * Lists all existing enterprise metadata templates.
 * @param {string} accessToken Valid Box access token
 * @returns {object[]} Array of template objects or empty array on failure
 */
function listExistingTemplates(accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: listExistingTemplates - accessToken is required');
    return [];
  }
  
  Logger.log(`Listing existing templates in scope: ${Config.BOX_METADATA_SCOPE}`);
  
  const url = `${Config.BOX_API_BASE_URL}/metadata_templates/${Config.BOX_METADATA_SCOPE}`;
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
      Logger.log(`Found ${templates.entries.length} template(s) in scope '${Config.BOX_METADATA_SCOPE}'`);
      templates.entries.forEach(template => {
        Logger.log(`  - ${template.displayName} (Key: ${template.templateKey}, Fields: ${template.fields ? template.fields.length : 'N/A'})`);
      });
      return templates.entries;
    } else {
      Logger.log(`ERROR: Failed to list templates. HTTP Code: ${responseCode}, Response: ${responseText}`);
      return [];
    }
  } catch (error) {
    Logger.log(`EXCEPTION listing templates: ${error.toString()}`);
    return [];
  }
}

/**
 * Checks if a specific metadata template exists by key and scope.
 * @param {string} templateKey Template key to check
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Template object if exists, null otherwise
 */
function checkTemplateExists(templateKey, accessToken) {
  if (!accessToken || !templateKey) {
    Logger.log('ERROR: checkTemplateExists - accessToken and templateKey are required');
    return null;
  }
  
  const url = `${Config.BOX_API_BASE_URL}/metadata_templates/${Config.BOX_METADATA_SCOPE}/${templateKey}/schema`;
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
      Logger.log(`Template '${templateKey}' found: ${template.displayName}`);
      return template;
    } else if (responseCode === 404) {
      Logger.log(`Template '${templateKey}' not found`);
      return null;
    } else {
      Logger.log(`Error fetching template '${templateKey}'. HTTP Code: ${responseCode}`);
      return null;
    }
  } catch (error) {
    Logger.log(`EXCEPTION checking template '${templateKey}': ${error.toString()}`);
    return null;
  }
}

/**
 * Gets the image metadata template, creating it if it doesn't exist.
 * @param {string} accessToken Valid Box access token
 * @returns {object|null} Template object or null on failure
 */
function getOrCreateImageTemplate(accessToken) {
  if (!accessToken) {
    Logger.log('ERROR: getOrCreateImageTemplate - accessToken is required');
    return null;
  }
  
  Logger.log(`Ensuring metadata template '${Config.BOX_METADATA_TEMPLATE_KEY}' exists`);
  let template = checkTemplateExists(Config.BOX_METADATA_TEMPLATE_KEY, accessToken);
  
  if (!template) {
    Logger.log(`Template '${Config.BOX_METADATA_TEMPLATE_KEY}' not found, creating`);
    template = createOptimalImageMetadataTemplate(accessToken);
  }
  
  if (template) {
    Logger.log(`Using template: ${template.displayName} (Key: ${template.templateKey})`);
  } else {
    Logger.log(`ERROR: Failed to get or create template '${Config.BOX_METADATA_TEMPLATE_KEY}'. Check admin permissions.`);
  }
  
  return template;
}

/**
 * Fetches and logs the schema (structure) of ALL metadata templates within a given scope.
 * @param {string} scope Optional. The scope of the metadata templates (e.g., 'enterprise'). 
 * Defaults to Config.BOX_METADATA_SCOPE.
 */
function showAllMetadataTemplateSchemas(scope) {
  const accessToken = getValidAccessToken(); // From BoxAuth.gs
  if (!accessToken) {
    Logger.log('ERROR: Could not get a valid access token. Please ensure Box authentication is complete.');
    console.error('ERROR: Could not get a valid access token.');
    return;
  }

  const effectiveScope = scope || Config.BOX_METADATA_SCOPE;

  Logger.log(`Attempting to fetch all template schemas for Scope: ${effectiveScope}`);

  const listUrl = `${Config.BOX_API_BASE_URL}/metadata_templates/${effectiveScope}`;
  const listOptions = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    muteHttpExceptions: true
  };

  try {
    const listResponse = UrlFetchApp.fetch(listUrl, listOptions);
    const listResponseCode = listResponse.getResponseCode();
    const listResponseText = listResponse.getContentText();

    if (listResponseCode === 200) {
      const templatesList = JSON.parse(listResponseText);
      if (templatesList.entries && templatesList.entries.length > 0) {
        Logger.log(`Found ${templatesList.entries.length} template(s) in scope '${effectiveScope}'. Fetching schemas...`);
        Logger.log('------------------------------------------------------');

        templatesList.entries.forEach(function(templateEntry, index) {
          Logger.log(`SCHEMA ${index + 1} of ${templatesList.entries.length}`);
          // Now fetch and display the schema for each templateKey
          // Reusing the logic from the single schema display function for clarity
          fetchAndLogSingleTemplateSchema(templateEntry.templateKey, effectiveScope, accessToken);
          Logger.log('------------------------------------------------------');
          if (index < templatesList.entries.length - 1) {
             Utilities.sleep(500); // Small delay between fetching each schema to be kind to the API
          }
        });
        Logger.log('All template schemas displayed.');

      } else {
        Logger.log(`No metadata templates found in scope '${effectiveScope}'.`);
      }
    } else {
      Logger.log(`ERROR: Failed to list metadata templates for scope '${effectiveScope}'. HTTP Code: ${listResponseCode}`);
      Logger.log(`Response: ${listResponseText}`);
    }
  } catch (error) {
    Logger.log(`EXCEPTION: An error occurred while trying to list or fetch template schemas for scope '${effectiveScope}': ${error.toString()}`);
    console.error(`EXCEPTION for scope '${effectiveScope}': `, error);
  }
}

/**
 * Helper function to fetch and log a single template's schema.
 * @param {string} templateKey
 * @param {string} scope
 * @param {string} accessToken
 */
function fetchAndLogSingleTemplateSchema(templateKey, scope, accessToken) {
  const schemaUrl = `${Config.BOX_API_BASE_URL}/metadata_templates/${scope}/${templateKey}/schema`;
  const schemaOptions = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    muteHttpExceptions: true
  };

  try {
    const schemaResponse = UrlFetchApp.fetch(schemaUrl, schemaOptions);
    const schemaResponseCode = schemaResponse.getResponseCode();
    const schemaResponseText = schemaResponse.getContentText();

    if (schemaResponseCode === 200) {
      const templateSchema = JSON.parse(schemaResponseText);
      Logger.log(`  Template Key: ${templateSchema.templateKey}`);
      Logger.log(`  Display Name: ${templateSchema.displayName}`);
      Logger.log(`  Scope: ${templateSchema.scope}`);
      Logger.log(`  Hidden: ${templateSchema.hidden || false}`);
      Logger.log(`  Copy Instance On Item Copy: ${templateSchema.copyInstanceOnItemCopy || false}`);

      if (templateSchema.fields && templateSchema.fields.length > 0) {
        Logger.log(`  Fields (${templateSchema.fields.length}):`);
        templateSchema.fields.forEach(function(field, index) {
          Logger.log(`    Field ${index + 1}:`);
          Logger.log(`      - Key: ${field.key}`);
          Logger.log(`      - Display Name: ${field.displayName}`);
          Logger.log(`      - Type: ${field.type}`);
          Logger.log(`      - Hidden: ${field.hidden || false}`);
          if (field.description) {
            Logger.log(`      - Description: ${field.description}`);
          }
          if (field.type === 'enum' && field.options) {
            Logger.log(`      - Options (${field.options.length}):`);
            field.options.forEach(function(option, optIndex) {
              Logger.log(`        Option ${optIndex + 1}: { key: "${option.key}", displayName: "${option.displayName || option.key}" }`);
            });
          }
        });
      } else {
        Logger.log('  Fields: None defined.');
      }
    } else {
      Logger.log(`  ERROR fetching schema for '${templateKey}'. HTTP Code: ${schemaResponseCode}. Response: ${schemaResponseText.substring(0, 200)}...`);
    }
  } catch (e) {
    Logger.log(`  EXCEPTION fetching schema for '${templateKey}': ${e.toString()}`);
  }
}

function runTestShowAllTemplateSchemas() {
  showAllMetadataTemplateSchemas();
}