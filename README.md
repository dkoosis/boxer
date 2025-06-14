# 🐕 Boxer - Box.com Metadata Manager

A Google Apps Script utility that automatically enriches Box.com files with metadata.

## ⚠️ Files to Delete
- `Config.js` - Replaced by ConfigManager.js
- `OauthServices.js` - Not used (we use Google OAuth2 library)

## Overview
Boxer sweeps through Box.com storage and adds metadata to image files, making them searchable and organized. It extracts EXIF data, uses Google Vision API for AI analysis, and can detect legal documents.

## Prerequisites
- Google Apps Script environment
- Box.com developer application (OAuth2 credentials)
- Optional: Google Vision API key for AI features
- Optional: Airtable API key for archival features

## File Structure
```
Main.js                 # Central orchestrator and entry points
BoxAuth.js             # Box OAuth2 authentication (using Google OAuth2 library)
ConfigManager.js       # Configuration management and validation
BoxFileOperations.js   # Core Box file operations
BoxMetadataTemplates.js # Box metadata template management
BoxReportManager.js    # Process files from Box reports
MetadataExtraction.js  # Extract metadata from files
ExifProcessor.js       # EXIF data extraction
VisionAnalysis.js      # Google Vision API integration
LegalDocumentDetector.js # Legal document detection
AirtableManager.js     # Airtable archival features
VersionManager.js      # Version tracking
Diagnostics.js         # System diagnostics
ErrorHandler.js        # Centralized error handling
```

## Installation

1. **Create a new Google Apps Script project**
2. **Add the OAuth2 library**: `1B7FSrk5Zi6L1rSxxTDgDEUsPzlukDsi4KGuTMorsTQHhGBzBkMun4iDF`
3. **Copy all .js files into your project**
4. **Run initial setup**: `BoxerApp.setup()`

## Configuration

### Required Settings
```javascript
// Set Box OAuth credentials
BoxerApp.setBoxCredentials("YOUR_CLIENT_ID", "YOUR_CLIENT_SECRET");

// Set Box reports folder ID
BoxerApp.setBoxReportsFolder("FOLDER_ID");

// Initialize Box authentication
BoxerApp.initializeBoxAuth();
```

### Optional Settings
```javascript
// Enable AI features
BoxerApp.setProperty('GOOGLE_VISION_API_KEY', 'YOUR_API_KEY');

// Enable Airtable archival
BoxerApp.setAirtableApiKey('YOUR_AIRTABLE_KEY');
```

## Usage

### Time-Based Triggers
Set up these functions to run periodically:
- `BoxerApp.processImages()` - Process image metadata (every 2-4 hours)
- `BoxerApp.archiveAirtable()` - Archive Airtable attachments (optional)
- `BoxerApp.processLegalDocs()` - Detect legal documents (daily)

### Manual Commands
```javascript
BoxerApp.diagnose()           // Run system diagnostics
BoxerApp.showStats()          // View processing statistics
BoxerApp.analyzeVersions()    // Check file version distribution
BoxerApp.resetCheckpoint()    // Reset processing checkpoint
```

## Metadata Fields
Boxer extracts and manages:
- Basic info (filename, size, format)
- EXIF data (camera, GPS, settings)
- AI analysis (objects, text, colors)
- Business metadata (department, project, usage rights)
- Processing tracking (version, build number)

## Build System
Boxer tracks which version processed each file, enabling incremental updates when the script improves.

---

# 🦴 Boxer User Guide

*Woof! I'm Boxer, your faithful metadata companion!*

## What I Do
I'm a good dog who fetches information about your Box.com files! I sniff out details like:
- 📸 Camera settings from photos
- 📍 GPS locations 
- 🏷️ AI-detected objects and text
- 📄 Legal documents

## Training Commands
- **"Boxer, fetch!"** → `BoxerApp.processImages()`
- **"Boxer, find legal docs!"** → `BoxerApp.processLegalDocs()`
- **"Boxer, show me what you found!"** → `BoxerApp.showStats()`

## Treats (Optional Features)
Give me API keys and I'll do extra tricks:
- 🎾 **Vision API** - I'll describe what's in photos!
- 📍 **Geocoding API** - I'll name GPS locations!
- 📦 **Airtable** - I'll archive your attachments!

*Remember: I'm a simple dog. I do my best, but I'm not meant for enterprise kennels!*