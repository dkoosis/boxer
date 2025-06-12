// File: BoxerHealthCheck.gs
// Simple health check that aborts processing if Google Services are down
// Add this to your project

/**
 * Simple health check for critical Google Services
 * Returns true if safe to proceed, false if services are down
 */
function checkCriticalServices() {
  Logger.log('🔍 Checking critical Google Services...');
  
  try {
    // Test Properties Service (most critical for Boxer)
    var testKey = 'HEALTH_CHECK_' + Date.now();
    var testValue = 'test_' + Math.random();
    
    PropertiesService.getScriptProperties().setProperty(testKey, testValue);
    var readValue = PropertiesService.getScriptProperties().getProperty(testKey);
    PropertiesService.getScriptProperties().deleteProperty(testKey);
    
    if (readValue !== testValue) {
      Logger.log('❌ Google Properties Service: Read/write failed');
      return false;
    }
    
    // Test UrlFetch Service (needed for Box API)
    var response = UrlFetchApp.fetch('https://httpbin.org/status/200', {
      method: 'GET',
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() !== 200) {
      Logger.log('❌ Google UrlFetch Service: HTTP request failed');
      return false;
    }
    
    Logger.log('✅ Critical Google Services: All operational');
    return true;
    
  } catch (error) {
    Logger.log('❌ Google Services Health Check Failed: ' + error.toString());
    Logger.log('🛑 This usually means Google is having service issues');
    Logger.log('💡 Try again in a few minutes when services recover');
    return false;
  }
}

/**
 * Enhanced main processing function with service health check
 * Only runs if Google Services are healthy
 */
function runBoxerWithHealthCheck() {
  Logger.log('🐕 === BOXER PROCESSING START ===');
  Logger.log('⏰ ' + new Date().toISOString());
  
  // Quick health check first
  if (!checkCriticalServices()) {
    Logger.log('\n🚨 === PROCESSING ABORTED ===');
    Logger.log('❌ Google Services are currently experiencing issues');
    Logger.log('🔄 Boxer will not process files during service outages');
    Logger.log('⏰ Please try again later when Google Services recover');
    Logger.log('🌐 Check Google Workspace Status: https://www.google.com/appsstatus/dashboard/');
    
    return {
      success: false,
      error: 'Google Services outage detected',
      recommendation: 'Wait for Google Services to recover and try again'
    };
  }
  
  // Services are healthy, proceed with normal processing
  Logger.log('✅ Google Services healthy - proceeding with processing\n');
  
  try {
    // Run your normal processing
    var result = runBoxReportProcessingNormal();
    
    // Add beautiful summary at the end
    if (result && result.success !== false) {
      generateProcessingSummary(result);
    }
    
    return result;
    
  } catch (error) {
    Logger.log('❌ Processing error: ' + error.toString());
    return {
      success: false,
      error: error.toString()
    };
  }
}

/**
 * Your normal processing function (rename your existing one to this)
 * This is what actually does the work when services are healthy
 */
function runBoxReportProcessingNormal() {
  // Try BoxReportManager first, then fallback
  try {
    if (typeof BoxReportManager !== 'undefined') {
      return BoxReportManager.runReportBasedProcessing();
    }
  } catch (error) {
    Logger.log('⚠️ BoxReportManager unavailable: ' + error.toString());
  }
  
  // Fallback to OptimizedProcessing
  try {
    if (typeof OptimizedProcessing !== 'undefined') {
      return OptimizedProcessing.processBoxImagesOptimized();
    }
  } catch (error) {
    Logger.log('❌ OptimizedProcessing also failed: ' + error.toString());
  }
  
  return {
    success: false,
    error: 'No processing methods available',
    filesProcessed: 0
  };
}

/**
 * Beautiful summary report with file counts and percentages
 */
function generateProcessingSummary(processingResults) {
  Logger.log('\n' + '='.repeat(50));
  Logger.log('🎯 BOXER PROCESSING SUMMARY');
  Logger.log('='.repeat(50));
  
  try {
    // Get current file statistics
    var stats = getCurrentFileStats();
    
    // This run results
    Logger.log('\n🔄 THIS RUN:');
    if (processingResults.filesProcessed !== undefined) {
      Logger.log('   ✅ Files Processed: ' + processingResults.filesProcessed);
    }
    if (processingResults.filesSkipped !== undefined) {
      Logger.log('   ⏭️ Files Skipped: ' + processingResults.filesSkipped);
    }
    if (processingResults.filesErrored !== undefined) {
      Logger.log('   ❌ Files with Errors: ' + processingResults.filesErrored);
    }
    if (processingResults.executionTimeMs) {
      Logger.log('   ⏱️ Execution Time: ' + (processingResults.executionTimeMs / 1000).toFixed(1) + 's');
    }
    
    // Overall statistics
    if (stats.totalFiles && stats.totalFiles !== 0) {
      Logger.log('\n📊 OVERALL STATUS (' + stats.dataSource + '):');
      Logger.log('   📁 Total Image Files: ' + (typeof stats.totalFiles === 'number' ? stats.totalFiles.toLocaleString() : stats.totalFiles));
      Logger.log('   ✅ With Metadata: ' + (typeof stats.withMetadata === 'number' ? stats.withMetadata.toLocaleString() : stats.withMetadata));
      Logger.log('   ❌ Without Metadata: ' + (typeof stats.withoutMetadata === 'number' ? stats.withoutMetadata.toLocaleString() : stats.withoutMetadata));
      
      // Only show progress bar and estimates if we have real numbers
      if (typeof stats.totalFiles === 'number' && typeof stats.withMetadata === 'number' && stats.totalFiles > 0) {
        var withMetadataPercent = Math.round((stats.withMetadata / stats.totalFiles) * 100);
        var withoutMetadataPercent = 100 - withMetadataPercent;
        
        // Progress bar
        var progressBar = createProgressBar(withMetadataPercent);
        Logger.log('\n📈 PROGRESS:');
        Logger.log('   ' + progressBar + ' ' + withMetadataPercent + '%');
        
        // Estimates
        if (processingResults.filesProcessed > 0 && stats.withoutMetadata > 0) {
          var estimatedRuns = Math.ceil(stats.withoutMetadata / processingResults.filesProcessed);
          Logger.log('\n🎯 ESTIMATES:');
          Logger.log('   🔄 Runs to completion: ~' + estimatedRuns);
          Logger.log('   ⏰ Time to completion: ~' + (estimatedRuns * 2) + ' hours (if run every 2 hours)');
        }
        
        // Final message
        if (withMetadataPercent >= 100) {
          Logger.log('\n🎉 CONGRATULATIONS! ALL FILES HAVE METADATA! 🎉');
        } else if (withMetadataPercent >= 90) {
          Logger.log('\n🌟 Almost there! ' + stats.withoutMetadata + ' files remaining!');
        } else {
          Logger.log('\n🚀 Processing continues - ' + stats.withoutMetadata + ' files to go!');
        }
      } else {
        Logger.log('\n💡 Run BoxReportManager for accurate file counts and progress tracking');
      }
    } else {
      Logger.log('\n📊 OVERALL STATUS: Unable to determine current file statistics');
      Logger.log('💡 This may be due to Google Services issues or missing BoxReportManager data');
    }
    
  } catch (error) {
    Logger.log('\n⚠️ Could not generate detailed summary: ' + error.toString());
    Logger.log('📊 Basic result: ' + (processingResults.filesProcessed || 0) + ' files processed');
  }
  
  Logger.log('\n' + '='.repeat(50));
  Logger.log('🏁 Run complete at ' + new Date().toLocaleString());
  Logger.log('='.repeat(50));
}

/**
 * Get current file statistics for summary
 * Uses real BoxReportManager data when available, falls back to estimation
 */
function getCurrentFileStats() {
  try {
    // First, try to get real data from BoxReportManager
    if (typeof BoxReportManager !== 'undefined' && BoxReportManager.getCachedReportData) {
      try {
        var reportData = BoxReportManager.getCachedReportData();
        if (reportData && reportData.files && reportData.files.length > 0) {
          var withMetadata = 0;
          var withoutMetadata = 0;
          
          reportData.files.forEach(function(file) {
            if (file.hasMetadata) {
              withMetadata++;
            } else {
              withoutMetadata++;
            }
          });
          
          Logger.log('📊 Using actual report data (not estimates)');
          return {
            totalFiles: reportData.files.length,
            withMetadata: withMetadata,
            withoutMetadata: withoutMetadata,
            dataSource: 'BoxReportManager'
          };
        }
      } catch (error) {
        Logger.log('⚠️ Could not get BoxReportManager data: ' + error.toString());
      }
    }
    
    // Fallback: Try to get from most recent processing results
    try {
      var checkpointStr = PropertiesService.getScriptProperties().getProperty('BOXER_REPORT_CHECKPOINT');
      if (checkpointStr) {
        var checkpoint = JSON.parse(checkpointStr);
        if (checkpoint.processedFileIds) {
          Logger.log('📊 Using checkpoint data (processed files count)');
          return {
            totalFiles: 'Unknown',
            withMetadata: checkpoint.processedFileIds.length + ' processed',
            withoutMetadata: 'Unknown remaining',
            dataSource: 'Checkpoint'
          };
        }
      }
    } catch (error) {
      // Properties Service might be having issues
    }
    
    // Last resort: Sample-based estimation (warn user it's an estimate)
    Logger.log('⚠️ Using sample-based estimation (may be inaccurate)');
    var accessToken = getValidAccessToken();
    if (!accessToken) {
      return { totalFiles: 0, withMetadata: 0, withoutMetadata: 0, dataSource: 'No access token' };
    }
    
    var sampleSize = 50;
    var sampleFiles = getSampleImageFiles(accessToken, sampleSize);
    
    if (sampleFiles.length === 0) {
      return { totalFiles: 0, withMetadata: 0, withoutMetadata: 0, dataSource: 'No files found' };
    }
    
    var withMetadata = 0;
    
    // Check metadata status for sample
    for (var i = 0; i < sampleFiles.length; i++) {
      try {
        var metadata = BoxFileOperations.getCurrentMetadata(sampleFiles[i].id, accessToken);
        if (metadata) {
          withMetadata++;
        }
      } catch (error) {
        // Skip files we can't check
      }
    }
    
    // Estimate totals (rough approximation)
    var metadataPercentage = withMetadata / sampleFiles.length;
    var estimatedTotal = Math.round(sampleFiles.length * 20); // Rough estimate
    var estimatedWithMetadata = Math.round(estimatedTotal * metadataPercentage);
    var estimatedWithoutMetadata = estimatedTotal - estimatedWithMetadata;
    
    return {
      totalFiles: '~' + estimatedTotal + ' (estimated)',
      withMetadata: '~' + estimatedWithMetadata + ' (estimated)',
      withoutMetadata: '~' + estimatedWithoutMetadata + ' (estimated)',
      dataSource: 'Sample estimation',
      sampleSize: sampleFiles.length
    };
    
  } catch (error) {
    Logger.log('⚠️ Error getting file stats: ' + error.toString());
    return { 
      totalFiles: 'Error', 
      withMetadata: 'Error', 
      withoutMetadata: 'Error',
      dataSource: 'Error: ' + error.toString()
    };
  }
}

/**
 * Get sample image files for statistics
 */
function getSampleImageFiles(accessToken, limit) {
  try {
    var searchUrl = Config.BOX_API_BASE_URL + '/search?query=.jpg OR .png OR .jpeg&type=file&limit=' + limit;
    
    var response = UrlFetchApp.fetch(searchUrl, {
      headers: { 'Authorization': 'Bearer ' + accessToken },
      muteHttpExceptions: true
    });
    
    if (response.getResponseCode() === 200) {
      var data = JSON.parse(response.getContentText());
      return data.entries.filter(function(file) {
        return Config.isImageFile(file.name);
      });
    }
    
  } catch (error) {
    Logger.log('⚠️ Error getting sample files: ' + error.toString());
  }
  
  return [];
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(percentage) {
  var width = 30;
  var filled = Math.round((percentage / 100) * width);
  var empty = width - filled;
  
  return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
}

/**
 * Simple health check function you can run anytime
 */
function checkGoogleServicesHealth() {
  Logger.log('🔍 === GOOGLE SERVICES HEALTH CHECK ===');
  
  var isHealthy = checkCriticalServices();
  
  if (isHealthy) {
    Logger.log('\n🎉 All systems operational!');
    Logger.log('✅ Safe to run Boxer processing');
  } else {
    Logger.log('\n🚨 Service issues detected!');
    Logger.log('❌ Do not run Boxer until services recover');
    Logger.log('🌐 Check: https://www.google.com/appsstatus/dashboard/');
  }
  
  return isHealthy;
}

// =============================================================================
// UPDATED MAIN FUNCTIONS - Replace your existing trigger functions with these
// =============================================================================

/**
 * Main function for your triggers - replaces runBoxReportProcessing()
 * This is what you should set as your trigger function
 */
function runBoxReportProcessing() {
  return runBoxerWithHealthCheck();
}

/**
 * Alternative main function name for backward compatibility
 */
function processBoxImagesOptimized() {
  return runBoxerWithHealthCheck();
}

/**
 * Manual testing function
 */
function testBoxerHealthCheck() {
  Logger.log('🧪 Testing Boxer with health checks...');
  return runBoxerWithHealthCheck();
}