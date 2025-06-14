// File: GoogleDriveCleanup.js
// Reorganize Google Drive storage for Boxer

function reorganizeBoxerDrive() {
  Logger.log('🧹 === Reorganizing Boxer Google Drive Storage ===');
  
  try {
    // Get current folder ID
    var currentFolderId = Config.getProperty('BOXER_CACHE_FOLDER');
    if (!currentFolderId) {
      Logger.log('❌ No existing folder found');
      return;
    }
    
    // Get the folder and rename it
    var boxerFolder = DriveApp.getFolderById(currentFolderId);
    boxerFolder.setName('Boxer');
    Logger.log('✅ Renamed folder to "Boxer"');
    
    // Find existing files that need organizing
    var existingFiles = boxerFolder.getFiles();
    var renamedCount = 0;
    
    // Don't rename Box CSV files - leave them as-is
    Logger.log('📁 Files in folder:');
    while (existingFiles.hasNext()) {
      var file = existingFiles.next();
      Logger.log('  - ' + file.getName());
    }
    
    // Find the analytics spreadsheet
    var trackingSheetId = Config.getProperty('BOXER_TRACKING_SHEET');
    if (trackingSheetId) {
      try {
        var analyticsSheet = DriveApp.getFileById(trackingSheetId);
        
        // Rename if needed
        if (analyticsSheet.getName() !== 'Boxer_Analytics') {
          analyticsSheet.setName('Boxer_Analytics');
          Logger.log('✅ Renamed analytics sheet');
        }
        
        // Move to Boxer folder if not already there
        var parents = analyticsSheet.getParents();
        var inBoxerFolder = false;
        while (parents.hasNext()) {
          if (parents.next().getId() === currentFolderId) {
            inBoxerFolder = true;
            break;
          }
        }
        
        if (!inBoxerFolder) {
          analyticsSheet.moveTo(boxerFolder);
          Logger.log('✅ Moved analytics sheet to Boxer folder');
        }
        
      } catch (e) {
        Logger.log('⚠️ Could not move analytics sheet: ' + e.toString());
      }
    }
    
    Logger.log('\n📊 Summary:');
    Logger.log('  Folder renamed to: Boxer');
    Logger.log('  Files renamed: ' + renamedCount);
    Logger.log('  Location: ' + boxerFolder.getUrl());
    
    // Create README file with folder structure
    createBoxerReadme(boxerFolder);
    
  } catch (error) {
    Logger.log('❌ Error: ' + error.toString());
  }
}

function createBoxerReadme(folder) {
  var readmeContent = `# Boxer Work Folder

This folder contains all Google Drive files used by the Boxer metadata system.

## Contents

- **Boxer_Analytics** - Tracking spreadsheet with error logs and processing stats
- **Box CSV Reports** - Original report files from Box.com (unchanged names)
- **README.txt** - This file

## File Naming Convention

Files created by Boxer:
- Boxer_Analytics - Main analytics and error tracking spreadsheet
- README.txt - This documentation

Box.com report files are kept with their original names.

Last updated: ${new Date().toISOString()}
`;
  
  // Check if README exists
  var files = folder.getFilesByName('README.txt');
  if (files.hasNext()) {
    files.next().setContent(readmeContent);
    Logger.log('✅ Updated README.txt');
  } else {
    folder.createFile('README.txt', readmeContent);
    Logger.log('✅ Created README.txt');
  }
}

// Run this once to clean up
function cleanupBoxerDrive() {
  reorganizeBoxerDrive();
}