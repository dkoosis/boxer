# Box Image Metadata Processing System

A comprehensive Google Apps Script system for extracting, analyzing, and managing metadata for images stored in Box. Uses **Bruce McPherson's excellent cGoa and cUseful libraries** for robust OAuth2 authentication and utility functions.

## Features

- **Comprehensive Metadata Extraction**: Basic file info, EXIF data, AI-powered analysis
- **Google Vision API Integration**: Object detection, label recognition, OCR, color analysis
- **Robust Authentication**: Uses Bruce McPherson's cGoa library for OAuth2
- **Automated Processing**: Scheduled triggers for continuous processing
- **Content Analysis**: Smart categorization based on folder paths and AI insights
- **Enterprise Metadata Templates**: Structured metadata storage in Box
- **Rate Limiting**: Built-in delays and exponential backoff using cUseful

## File Structure

```
├── Config.gs                    # Configuration constants
├── BoxAuth.gs                   # Authentication using cGoa
├── Service.gs                   # OAuth service definitions
├── BoxMetadataTemplates.gs      # Metadata template management
├── BoxFileOperations.gs         # File operations with cUseful utilities
├── MetadataExtraction.gs        # Basic metadata extraction
├── VisionExif.gs                # EXIF and Vision API functions
├── MainScript.gs                # Main orchestrator and enhanced processing
├── EnhancedUtilities.gs         # Additional utilities following Bruce's patterns
├── BoxTests.gs                  # Comprehensive test functions
└── README.md                    # This file
```

## Setup Guide

### Step 1: Add Required Libraries

In Apps Script, go to **Libraries** and add these by Bruce McPherson:

| Library | ID | Identifier | Description |
|---------|----|-----------| ----------- |
| **cGoa** | `1v_l4xN3ICa0lAW315NQEzAHPSoNiFdWHsMEwj2qA5t9cgZ5VWci2Qxv2` | `cGoa` | OAuth2 authentication |
| **cUseful** | `1EbLSESpiGkI3PYmJqWh3-rmLkYKAtCNPi1L2YCtMgo2Ut8xMThfJ41Ex` | `cUseful` | Utility functions |

> **Note**: cUseful is a dependency of cGoa, so adding cGoa should automatically include it.

### Step 2: Configure Script Properties

In **Project Settings > Script Properties**, add:

| Property | Value | Description |
|----------|-------|-------------|
| `OAUTH_CLIENT_ID` | Your Box OAuth Client ID | From Box Developer Console |
| `OAUTH_CLIENT_SECRET` | Your Box OAuth Client Secret | From Box Developer Console |
| `VISION_API_KEY` | Your Google Cloud Vision API Key | Optional, for AI features |

### Step 3: Box Developer Console Setup

1. Create a Custom App in [Box Developer Console](https://developer.box.com/)
2. Set **Redirect URI** to: `https://script.google.com/macros/s/YOUR_SCRIPT_ID/usercallback`
3. Enable scopes: **Read and write all files and folders**, **Manage enterprise properties**
4. Get Client ID and Secret for Script Properties

### Step 4: Initialize Authentication

Run this **once** to complete OAuth2 setup:

```javascript
initializeBoxAuth()
```

This will show you instructions to:
1. Deploy as web app (temporarily)
2. Visit the web app URL to authorize
3. Complete Box OAuth consent
4. Undeploy web app (optional)

### Step 5: Verify Setup

```javascript
testBoxGoaSetup()  // Comprehensive authentication test
testCompleteSetup() // Full system test
```

## Basic Usage

### Manual Processing

```javascript
// Basic metadata extraction
processBoxImages()

// Enhanced processing with EXIF and Vision API
processBoxImagesEnhanced()

// Process specific folder
MetadataExtraction.processImagesInFoldersBasic(['folder_id'], getValidAccessToken())
```

### Automated Processing

```javascript
// Set up hourly automated processing
createScheduledTrigger()

// Complete system setup (templates, automation, initial processing)
setupComplete()
```

### Monitoring and Reports

```javascript
// Basic processing statistics
getImageProcessingSummary()

// Enhanced/AI processing statistics
getEnhancedProcessingSummary()

// Test folder specific summary
showTestFolderSummary()
```

## Advanced Features

### Vision API Integration

```javascript
// Test Vision API setup
verifyVisionApiSetup()
testVisionApiIntegration()

// Troubleshoot Vision API issues
troubleshootVisionApiError()
```

### Template Management

```javascript
// Get or create metadata template
const template = getOrCreateImageTemplate(getValidAccessToken())

// List all templates
listExistingTemplates(getValidAccessToken())

// Attach template to all images
BoxFileOperations.attachTemplateToAllImages(getValidAccessToken())
```

### File Operations

```javascript
// Find all images
const images = BoxFileOperations.findAllImageFiles('folder_id', getValidAccessToken())

// Check/get metadata
const metadata = BoxFileOperations.getCurrentMetadata('file_id', getValidAccessToken())

// Apply metadata with create/update logic
BoxFileOperations.applyMetadata('file_id', metadataObject, getValidAccessToken())
```

## Configuration

### Processing Folders

Update in `Config.gs`:

```javascript
const ACTIVE_TEST_FOLDER_ID = 'your_folder_id';  // For testing
const DEFAULT_PROCESSING_FOLDER_ID = '0';        // Root folder or specific ID
```

### Rate Limiting

Adjust delays in `Config.gs`:

```javascript
const ENHANCED_PROCESSING_BATCH_SIZE = 5;         // Files per batch
const ENHANCED_PROCESSING_FILE_DELAY_MS = 2000;   // Delay between files
const ENHANCED_PROCESSING_BATCH_DELAY_MS = 5000;  // Delay between batches
```

### Content Analysis Rules

Customize content categorization in `MetadataExtraction.gs`:

```javascript
// Add custom content type rules in ContentAnalyzer_.analyzeContent()
var contentRules = [
  {
    test: function() { return lowerPath.includes('your_keyword'); },
    apply: function() { analysis.contentType = 'your_type'; }
  }
  // Add more rules...
];
```

## Metadata Template Fields

The system creates a comprehensive metadata template with these categories:

- **Core File Info**: filename, path, size, format
- **Technical Specs**: dimensions, aspect ratio, megapixels
- **Camera/EXIF**: camera model, date taken, photographer
- **Content**: type, subject, location, department
- **Project Info**: project name, client, event details
- **AI Analysis**: detected objects, scene description, extracted text, colors
- **Business**: usage rights, quality rating, importance level
- **Processing**: stage tracking, version, review flags
- **Notes**: additional comments

## Troubleshooting

### Authentication Issues

```javascript
// Check auth status
getAuthStatus()
diagnoseBoxAuth()

// Reset and re-authorize
resetBoxAuth()
initializeBoxAuth()
```

### Vision API Issues

```javascript
// Verify setup
verifyVisionApiSetup()

// Get troubleshooting guide
troubleshootVisionApiError()

// Check quota status
checkVisionApiQuota()
```

### Processing Issues

```javascript
// Test single image processing
testSingleImageProcessing()

// Test basic workflow
testBasicProcessingWorkflow()

// Test enhanced features
testEnhancedProcessingFeatures()
```

## Credits

This system is built using **Bruce McPherson's excellent libraries**:

- **[cGoa](https://github.com/brucemcpherson/cGoa)** - Robust OAuth2 authentication for Google Apps Script
- **[cUseful](https://github.com/brucemcpherson/cUseful)** - Essential utility functions including exponential backoff

Bruce McPherson's libraries provide the foundation for reliable, production-ready Google Apps Script applications. Learn more at [h