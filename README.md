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

# 🐕 Boxer - Your Faithful Box.com Image Metadata Companion

*Meet Boxer: The goodest boy who never tires of fetching, organizing, and cataloging your image files!*

A Google Apps Script that automatically adds comprehensive metadata to image files stored in Box.com. Like a well-trained boxer dog, this script is loyal, energetic, and never gets tired of doing the same job over and over again with enthusiasm.

## 🎾 What Makes Boxer Special?

Boxer is a hardworking pup that periodically patrols your Box storage and enriches image files with:
- **📏 Technical metadata** (dimensions, file format, camera info from EXIF) - *Boxer's got a keen eye for details!*
- **🧠 AI-generated content analysis** (objects, scene description, text extraction) - *Smart doggy with special vision goggles!*
- **🏷️ Smart categorization** (content type, location, department) - *Boxer knows where everything belongs!*
- **🔍 Searchable keywords** derived from filenames and folder paths - *Like a bloodhound for your files!*

*Why "Boxer"? Because this script is loyal, energetic, intelligent, and great with kids (and adults). Plus, it works with Box! 📦🐕*

## 🦴 What Boxer Needs to Get Started

### Required Accounts & Services
- **Box.com account** with admin/enterprise metadata permissions *(Boxer needs access to the whole yard!)*
- **Google Cloud Platform account** with Vision API enabled *(Boxer's special vision goggles - optional but recommended)*
- **Google Apps Script** access *(Boxer's training ground)*

### Required Libraries *(Boxer's favorite toys)*
Add these libraries to your Google Apps Script project:
- **cGoa** by Bruce McPherson: `1v_l3DWh-gSWJQF2KcyKAhPr71jNS0JOhL4kKJ-PCtb9zIZFKbEjYRNWu` *(Authentication training collar)*
- **cUseful** by Bruce McPherson: `1EbLSESpiGkI3PYmJqWh3-rmLkYKAtCNPi1L2YCtMgo2Ut8xMThfJ41Ex` *(Utility toolkit)*

## 🎓 Training Your Boxer (Setup Instructions)

### 1. Create Boxer's Box App *(Getting a dog license)*
1. Go to [Box Developer Console](https://developer.box.com/)
2. Create new Custom App with OAuth 2.0 *(Boxer's ID tags)*
3. Set these scopes *(What Boxer is allowed to do)*:
   - Read and write all files and folders *(Full yard access)*
   - Manage enterprise properties *(Organize the toys)*
4. Note your Client ID and Client Secret *(Boxer's credentials)*

### 2. Get Boxer's Special Vision Goggles *(Optional but Recommended)*
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Enable Vision API *(Install Boxer's AI goggles)*
3. Create API key *(Goggles activation code)*
4. Note your API key *(Keep it safe!)*

### 3. Set Up Boxer's Training Ground *(Configure Apps Script)*

#### Set Script Properties *(Boxer's personal info)*
In Apps Script: Project Settings → Script Properties, add:
- `OAUTH_CLIENT_ID`: Your Box app Client ID *(Boxer's name tag)*
- `OAUTH_CLIENT_SECRET`: Your Box app Client Secret *(Boxer's secret)*  
- `VISION_API_KEY`: Your Google Cloud Vision API key *(Goggles code - optional)*

#### Add Boxer's Training Files *(Required Scripts)*
Copy all the provided `.js` files into your Apps Script project:
- `Config.js` *(Boxer's rule book)*
- `BoxAuth.js` *(Authentication trainer)*
- `BoxMetadataTemplates.js` *(Template trainer)*
- `BoxFileOperations.js` *(File fetch trainer)*
- `MetadataExtraction.js` *(Sniffing skills trainer)*
- `VisionEXIF.js` *(Vision goggles trainer)*
- `EnhancedEXIFParser.js` *(Advanced sniffing trainer)*
- `MainScript.js` *(Master trainer)*
- `OptimizedProcessing.js` *(Efficiency trainer)*
- `BoxTests.js` *(Trick tester)*
- `Service.js` *(Service trainer)*
- `EnhancedUtilities.js` *(Utility belt)*

### 4. Boxer's First Day Training *(Initial Setup & Testing)*

#### Complete Authentication *(Teaching Boxer to shake hands with Box)*
```javascript
// Run this once to set up Box authentication
initializeBoxAuth(); // Boxer learns to say "hello" to Box
```
This will provide a web app URL. Visit it to complete OAuth authorization *(like introducing Boxer to the neighbors)*.

#### Test Boxer's Skills *(Making sure he's a good boy)*
```javascript
// Verify everything is working
testBoxGoaSetup(); // Basic obedience test

// Check file access
diagnoseFolderAccess(); // Can Boxer reach all his toys?

// Get overview of your images  
listAllImageFileStatus(); // Boxer's inventory of the yard

// Test processing on 3 files
testProcessThreeFiles(); // Boxer shows off his best tricks! 🎪
```

#### Complete Boxer's Training *(Full system setup)*
```javascript
// Run full setup (creates templates, attaches to files, sets up triggers)
setupComplete(); // Boxer graduates from puppy school! 🎓
```

### 5. Set Up Boxer's Daily Routine *(Automation)*

Create a time-based trigger for automatic processing:

```javascript
// Set up optimized processing trigger
setupOptimizedProcessing(); // Boxer learns his daily schedule
```

**🏆 Recommended trigger function**: `processBoxImagesOptimized`

This function makes Boxer the smartest pup because he:
- Only processes files that need processing *(doesn't re-fetch the same stick)*
- Respects execution time limits *(knows when it's nap time)*
- Uses efficient search instead of scanning all folders *(smart sniffing strategy)*
- Saves progress between runs *(remembers where he buried his bones)*

## 🎾 How to Work with Boxer (Usage)

### Manual Training Commands *(When you want to play with Boxer)*

#### Basic Training *(Good boy basics)*
```javascript
processBoxImages(); // Boxer does basic fetch
```

#### Advanced Training *(Show off time)*  
```javascript
processBoxImagesEnhanced(); // Boxer uses his special goggles and super sniffing
```

#### Smart Training *(Boxer's PhD performance - Recommended)*
```javascript
processBoxImagesOptimized(); // Boxer uses all his intelligence efficiently
```

### Checking on Boxer *(Monitoring Functions)*

#### See How Boxer's Doing *(Status reports)*
```javascript
listAllImageFileStatus(); // Boxer's comprehensive report card 🐕📊
```

#### View Boxer's Progress *(Statistics)*
```javascript
showOptimizedProcessingStats(); // Boxer's work history
getImageProcessingSummary(); // Quick summary of Boxer's achievements
```

#### Test Boxer's Specific Skills *(Feature testing)*
```javascript
testProcessThreeFiles(); // Watch Boxer perform his best tricks! 🎪
testVisionApiIntegration(); // Test Boxer's special goggles
testBasicProcessingWorkflow(); // Basic obedience check
```

### Boxer's Advanced Training *(Configuration Functions)*

#### Get Boxer's Professional Opinion *(Processing recommendations)*
```javascript
recommendProcessingStrategy(); // Boxer analyzes your yard and suggests the best approach
```

#### Start Fresh *(Reset if needed)*
```javascript
resetBoxAuth(); // Send Boxer back to puppy school for re-training
```

## 🏠 How Boxer Organizes Your Yard (File Organization)

### Boxer's Territory Rules *(Folder Structure)*
Boxer analyzes folder paths to automatically categorize content:
- `logo/` or `brand/` → Marketing Material *(Boxer's fancy collar)*
- `team/` or `staff/` → Team Portrait *(Pack photos)*
- `fabrication/` → Fabrication Process *(Where the magic happens)*
- `artwork/` → Artwork *(Pretty things Boxer admires)*

### Boxer's Filing System *(Metadata Template)*
Creates a comprehensive Box metadata template with fields for:
- **📄 File Info**: Original filename, path, size, format *(Boxer's inventory)*
- **🔧 Technical**: Dimensions, aspect ratio, camera info *(Technical specs)*
- **🎯 Content**: Type, subject, location, department *(What Boxer found)*
- **🤖 AI Analysis**: Detected objects, scene description, text *(Boxer's smart observations)*
- **💼 Business**: Usage rights, quality rating, importance *(Important stuff)*
- **📋 Processing**: Stage, version, review status *(Boxer's work log)*

## 🚨 When Boxer Needs Help (Troubleshooting)

### Authentication Issues *(Boxer can't get into the yard)*
```javascript
diagnoseBoxAuth(); // Check Boxer's credentials
testBoxAccess(); // Test if Boxer can say "hello" to Box
```

### Processing Issues *(Boxer is confused)*
```javascript
diagnoseFolderAccess(); // Check if Boxer can reach all areas
testComprehensiveMetadataExtraction(); // Test Boxer's sniffing abilities
```

### Vision API Issues *(Boxer's goggles are foggy)*  
```javascript
verifyVisionApiSetup(); // Clean Boxer's special goggles
```

## ⚙️ Boxer's Training Settings (Configuration Options)

### Processing Settings *(How Boxer works)*
Edit `Config.js` to customize:
- `ACTIVE_TEST_FOLDER_ID`: Boxer's favorite playground *(default: test folder)*
- `MAX_VISION_API_FILE_SIZE_BYTES`: How big toys Boxer can handle with goggles
- `PROCESSING_BATCH_SIZE`: How many toys Boxer carries at once
- Rate limiting delays *(Boxer's rest time)*

### Content Categorization *(Teaching Boxer new tricks)*
Modify `MetadataExtraction.js` to customize:
- Content type rules *(What different things look like)*
- Location keywords mapping *(Where things belong)*
- Department assignments *(Who owns what)*

## 🎖️ Best Practices (Training Your Boxer Right)

### For Small Collections (<100 images) *(Boxer's cozy apartment)*
- Use `processBoxImagesEnhanced()` *(Boxer can handle everything easily)*
- Run every 6 hours *(Regular walks)*

### For Medium Collections (100-1000 images) *(Boxer's suburban house)*  
- Use `processBoxImagesOptimized()` *(Smart Boxer strategy)*
- Run every 2 hours *(Frequent yard patrols)*

### For Large Collections (1000+ images) *(Boxer's mansion with huge yard)*
- Use `processBoxImagesOptimized()` *(Essential smart strategy)*
- Run hourly *(Boxer is always on duty)*
- Monitor with `showOptimizedProcessingStats()` *(Check on Boxer regularly)*

### Performance Tips *(Keeping Boxer healthy and happy)*
- Vision API has daily quotas - monitor usage *(Don't overwork Boxer's special goggles)*
- Large files (>20MB) are skipped for AI analysis *(Some toys are too big for the goggles)*
- Processing stages track completion to avoid reprocessing *(Boxer remembers what he's already done)*

## 📅 Scheduled Trigger Recommendation (Boxer's Daily Schedule)

**🏆 Use this function for your scheduled trigger**: `processBoxImagesOptimized`

This function makes Boxer the smartest pup because he automatically adapts his strategy based on:
- Time since last patrol *(How long since Boxer's last walk)*
- Account size and activity *(Size of the yard and how busy it is)*
- Processing history *(What Boxer learned from previous rounds)*

Set trigger frequency based on your yard size:
- **Small**: Every 6 hours *(Relaxed suburban dog)*
- **Medium**: Every 2 hours *(Active neighborhood watch dog)*
- **Large**: Every hour *(Professional guard dog)*

## 🐕‍🦺 Support (When You Need to Call the Vet)

This script uses Bruce McPherson's excellent cGoa and cUseful libraries for robust OAuth and utility functions *(Boxer's professional training tools)*. 

When Boxer needs help:
1. Check the Apps Script logs *(Boxer's diary)*
2. Run diagnostic functions *(Boxer's health checkup)*
3. Verify Box app permissions *(Make sure Boxer can access his territory)*
4. Confirm API keys are correct *(Check Boxer's ID tags)*

*Remember: Boxer is a good dog who wants to help! If he's not performing well, it's usually because he needs clearer instructions or his tools need adjustment.* 🐕❤️

## 📜 License

This is a utility script for personal/organizational use. Uses open-source libraries by Bruce McPherson. 

*Built with ❤️ and lots of virtual dog treats.* 🦴

---

*🐕 "A dog is the only thing on earth that loves you more than he loves himself." - Josh Billings*

*Boxer loves organizing your files almost as much as he loves you!* 📦🐕💕