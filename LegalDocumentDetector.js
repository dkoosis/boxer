// File: LegalDocumentDetector.gs
// Legal document detection for Box files
// Depends on: ConfigManager.gs, BoxAuth.gs, BoxFileOperations.gs

/**
 * LegalDocumentDetector namespace for identifying legal documents in Box
 */
const LegalDocumentDetector = (function() {
  'use strict';
  
  const ns = {};
  
  // Detection configuration
  const DETECTION_VERSION = 'v1.0';
  const CONFIDENCE_THRESHOLD = 50;
  let LEGAL_DOC_TEMPLATE_KEY = null; // Will be loaded from Config
  
  // Legal entities and patterns
  const LEGAL_ENTITIES = [
    // Major law firms
    'Cooley LLP', 'Wilson Sonsini', 'Latham & Watkins', 'Skadden', 'Kirkland & Ellis',
    'DLA Piper', 'Baker McKenzie', 'White & Case', 'Freshfields', 'Allen & Overy',
    
    // Internal legal
    'General Counsel', 'Legal Department', 'Chief Legal Officer', 'Legal Affairs',
    'Corporate Counsel', 'In-House Counsel',
    
    // Common legal titles/suffixes
    'Esq.', 'Attorney', 'Counsel', 'Legal Advisor'
  ];
  
  const LEGAL_ENTITY_PATTERNS = [
    /\b\w+\s+(Law|Legal)\s+(Group|Firm|LLP|LLC|PC|PLLC)\b/gi,
    /\bGeneral\s+Counsel\b/gi,
    /\bChief\s+Legal\s+Officer\b/gi,
    /\bCorporate\s+Counsel\b/gi,
    /\bAttorneys?\s+at\s+Law\b/gi,
    /\b\w+,?\s+Esq\.?\b/gi
  ];
  
  const CONTRACT_KEYWORDS = [
    'agreement', 'contract', 'license', 'nda', 'mou', 'sow', 'msa',
    'amendment', 'addendum', 'exhibit', 'terms', 'conditions',
    'subscription', 'renewal', 'software license', 'service agreement'
  ];
  
  const LEGAL_CONTENT_PATTERNS = [
    /\bwhereas\b/gi,
    /\bparty of the first part\b/gi,
    /\bexecuted\s+and\s+delivered\b/gi,
    /\beffective\s+date\b/gi,
    /\bin\s+witness\s+whereof\b/gi,
    /\bsignature\s+page\b/gi,
    /\b\/s\/\s*\w+/gi,  // Electronic signatures
    /\bthis\s+agreement\s+is\s+executed\b/gi,
    /\bsubject\s+to\s+the\s+terms\s+and\s+conditions\b/gi
  ];
  
  const ESIGNATURE_INDICATORS = [
    'Box Sign', 'Adobe Sign', 'DocuSign', 'HelloSign', 'PandaDoc',
    'Electronically signed', 'Digital signature', 'E-signature'
  ];
  
  /**
   * Get the legal document template key from Config
   * @private
   */
  function getLegalTemplateKey_() {
    if (!LEGAL_DOC_TEMPLATE_KEY) {
      LEGAL_DOC_TEMPLATE_KEY = ConfigManager.getProperty('BOX_LEGAL_METADATA_ID') || 'legalAgreement';
    }
    return LEGAL_DOC_TEMPLATE_KEY;
  }
  
  /**
   * Check if file type is relevant for legal document detection
   * @param {string} filename 
   * @returns {boolean}
   */
  ns.isRelevantFileType = function(filename) {
    if (!filename) return false;
    const lowerName = filename.toLowerCase();
    return lowerName.endsWith('.pdf') || 
           lowerName.endsWith('.docx') || 
           lowerName.endsWith('.doc') || 
           lowerName.endsWith('.txt');
  };
  
  /**
   * Analyze filename and path for legal indicators
   * @param {string} filename 
   * @param {string} folderPath 
   * @returns {object} Analysis results
   */
  function analyzeFileNameAndPath_(filename, folderPath) {
    let score = 0;
    const indicators = [];
    
    const lowerName = filename.toLowerCase();
    const lowerPath = folderPath.toLowerCase();
    const combined = (lowerName + ' ' + lowerPath);
    
    // Check for contract keywords
    CONTRACT_KEYWORDS.forEach(function(keyword) {
      if (combined.includes(keyword)) {
        score += 20;
        indicators.push(`keyword:${keyword}`);
      }
    });
    
    // Legal folder paths
    const legalFolders = ['legal', 'contracts', 'agreements', 'compliance', 'licenses'];
    legalFolders.forEach(function(folder) {
      if (lowerPath.includes(folder)) {
        score += 15;
        indicators.push(`folder:${folder}`);
      }
    });
    
    // Prefer PDFs for legal documents
    if (lowerName.endsWith('.pdf')) {
      score += 10;
      indicators.push('pdf_format');
    }
    
    return { score: score, indicators: indicators };
  }
  
  /**
   * Extract text content from document and analyze for legal patterns
   * @param {string} fileId Box file ID
   * @param {string} accessToken Valid access token
   * @param {string} filename For logging
   * @returns {object} Content analysis results
   */
  function analyzeDocumentContent_(fileId, accessToken, filename) {
    let score = 0;
    const indicators = [];
    let extractedText = '';
    
    try {
      // Use Vision API to extract text (works for PDFs too)
      const visionResult = VisionAnalysis.analyzeImageWithVision(fileId, accessToken, filename);
      
      if (visionResult && !visionResult.error && visionResult.text) {
        extractedText = visionResult.text;
        
        // Check for legal entities
        let entityMatches = 0;
        LEGAL_ENTITIES.forEach(function(entity) {
          if (extractedText.toLowerCase().includes(entity.toLowerCase())) {
            score += 50; // High weight for known legal entities
            indicators.push(`entity:${entity}`);
            entityMatches++;
          }
        });
        
        // Check for legal entity patterns
        LEGAL_ENTITY_PATTERNS.forEach(function(pattern) {
          const matches = extractedText.match(pattern);
          if (matches) {
            score += 30;
            indicators.push(`entity_pattern:${matches[0]}`);
            entityMatches++;
          }
        });
        
        // Check for e-signature indicators
        ESIGNATURE_INDICATORS.forEach(function(indicator) {
          if (extractedText.toLowerCase().includes(indicator.toLowerCase())) {
            score += 40;
            indicators.push(`esignature:${indicator}`);
          }
        });
        
        // Check for legal content patterns
        let legalPatternMatches = 0;
        LEGAL_CONTENT_PATTERNS.forEach(function(pattern) {
          if (pattern.test(extractedText)) {
            legalPatternMatches++;
          }
        });
        
        if (legalPatternMatches >= 2) {
          score += 25;
          indicators.push(`legal_language:${legalPatternMatches}_patterns`);
        }
        
        // Bonus for multiple entity matches (strong signal)
        if (entityMatches >= 2) {
          score += 20;
          indicators.push('multiple_entities');
        }
      }
      
    } catch (error) {
      Logger.log(`Error analyzing document content for ${filename}: ${error.toString()}`);
    }
    
    return {
      score: score,
      indicators: indicators,
      textExtracted: extractedText.length > 0,
      textLength: extractedText.length
    };
  }
  
  /**
   * Main detection function - analyze if file is likely a legal document
   * @param {object} fileDetails File details from Box API
   * @param {string} accessToken Valid access token
   * @returns {object|null} Detection results or null if not relevant
   */
  ns.detectLegalDocument = function(fileDetails, accessToken) {
    if (!fileDetails || !fileDetails.name || !ns.isRelevantFileType(fileDetails.name)) {
      return null;
    }
    
    Logger.log(`🔍 Analyzing legal document potential: ${fileDetails.name}`);
    
    try {
      let folderPath = 'N/A';
      if (fileDetails.path_collection && fileDetails.path_collection.entries) {
        folderPath = fileDetails.path_collection.entries.slice(1)
          .map(function(p) { return p.name; })
          .join('/');
      }
      
      // Analyze filename and path
      const fileAnalysis = analyzeFileNameAndPath_(fileDetails.name, folderPath);
      
      // Analyze document content
      const contentAnalysis = analyzeDocumentContent_(fileDetails.id, accessToken, fileDetails.name);
      
      // Calculate total confidence
      const totalScore = fileAnalysis.score + contentAnalysis.score;
      const confidence = Math.min(100, totalScore); // Cap at 100
      
      const result = {
        isLegalDocument: confidence >= CONFIDENCE_THRESHOLD,
        confidence: confidence,
        detectionVersion: DETECTION_VERSION,
        indicators: fileAnalysis.indicators.concat(contentAnalysis.indicators),
        textExtracted: contentAnalysis.textExtracted,
        textLength: contentAnalysis.textLength,
        analysisDate: new Date().toISOString()
      };
      
      Logger.log(`📊 Legal detection result: ${fileDetails.name} - Confidence: ${confidence}% (${result.isLegalDocument ? 'LEGAL' : 'NOT LEGAL'})`);
      
      if (result.indicators.length > 0) {
        Logger.log(`   Indicators: ${result.indicators.join(', ')}`);
      }
      
      return result;
      
    } catch (error) {
      Logger.log(`❌ Error in legal document detection for ${fileDetails.name}: ${error.toString()}`);
      return null;
    }
  };
  
  /**
   * Create metadata for legal documents
   * @param {object} fileDetails File details from Box API
   * @param {object} detectionResult Legal detection results
   * @returns {object} Legal document metadata
   */
  ns.createLegalMetadata = function(fileDetails, detectionResult) {
    if (!fileDetails || !detectionResult) {
      throw new Error('File details and detection result required');
    }
    
    let folderPath = 'N/A';
    if (fileDetails.path_collection && fileDetails.path_collection.entries) {
      folderPath = fileDetails.path_collection.entries.slice(1)
        .map(function(p) { return p.name; })
        .join('/');
    }
    
    return {
      // Enhanced template fields
      originalFilename: fileDetails.name,
      folderPath: folderPath,
      
      // Detection metadata (matches enhanced template)
      detectionConfidence: detectionResult.confidence,
      detectionReviewed: 'pending',
      detectionVersion: detectionResult.detectionVersion,
      detectionIndicators: detectionResult.indicators.join('; '),
      
      // Processing metadata
      processingStage: 'detected',
      lastProcessedDate: new Date().toISOString(),
      
      // Keywords from detection
      keywords: detectionResult.indicators.filter(function(i) { 
        return i.startsWith('keyword:'); 
      }).map(function(k) { 
        return k.replace('keyword:', ''); 
      }).join(', ')
    };
  };
  
  /**
   * Process legal documents in a folder
   * @param {string} folderId Box folder ID
   * @param {string} accessToken Valid access token
   * @param {number} maxFiles Maximum files to process
   */
  ns.processLegalDocumentsInFolder = function(folderId, accessToken, maxFiles) {
    maxFiles = maxFiles || 50;
    
    Logger.log(`=== 📋 Processing Legal Documents in Folder: ${folderId} ===`);
    
    try {
      const listUrl = `${ConfigManager.BOX_API_BASE_URL}/folders/${folderId}/items?limit=${Math.min(maxFiles, 1000)}&fields=id,name,type,size,path_collection,created_at,parent`;
      
      const response = UrlFetchApp.fetch(listUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        muteHttpExceptions: true
      });
      
      if (response.getResponseCode() !== 200) {
        Logger.log(`❌ Failed to list items in folder ${folderId}`);
        return;
      }
      
      const listData = JSON.parse(response.getContentText());
      const relevantFiles = listData.entries.filter(function(item) {
        return item.type === 'file' && ns.isRelevantFileType(item.name);
      });
      
      Logger.log(`📄 Found ${relevantFiles.length} relevant files for legal analysis`);
      
      let processed = 0;
      let detected = 0;
      
      relevantFiles.slice(0, maxFiles).forEach(function(file) {
        try {
          const detectionResult = ns.detectLegalDocument(file, accessToken);
          
          if (detectionResult && detectionResult.isLegalDocument) {
            const legalMetadata = ns.createLegalMetadata(file, detectionResult);
            
            // Apply metadata using the configured template key
            const success = BoxFileOperations.applyMetadata(
              file.id, legalMetadata, accessToken, getLegalTemplateKey_()
            );
            
            if (success) {
              detected++;
              Logger.log(`✅ Legal document detected and tagged: ${file.name}`);
            } else {
              Logger.log(`⚠️ Failed to apply legal metadata: ${file.name}`);
            }
          }
          
          processed++;
          
          // Rate limiting
          if (processed % 10 === 0) {
            Utilities.sleep(2000);
          }
          
        } catch (error) {
          Logger.log(`❌ Error processing ${file.name}: ${error.toString()}`);
        }
      });
      
      Logger.log('\n📊 Legal Document Processing Complete:');
      Logger.log(`   Files analyzed: ${processed}`);
      Logger.log(`   Legal documents detected: ${detected}`);
      Logger.log(`   Detection rate: ${Math.round(detected / processed * 100)}%`);
      
    } catch (error) {
      ErrorHandler.reportError(error, 'LegalDocumentDetector.processLegalDocumentsInFolder', 
        { folderId, maxFiles });
    }
  };
  
  /**
   * Test function for manual verification
   * @param {string} testFileId Optional specific file ID to test
   */
  ns.testLegalDetection = function(testFileId) {
    Logger.log('=== 🧪 Testing Legal Document Detection ===');
    
    const accessToken = getValidAccessToken();
    if (!accessToken) {
      Logger.log('❌ No access token available');
      return;
    }
    
    try {
      if (!testFileId) {
        // Find a test file
        Logger.log('🔍 Finding test files...');
        const testFolderId = ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0';
        ns.processLegalDocumentsInFolder(testFolderId, accessToken, 5);
        return;
      }
      
      // Test specific file
      const fileDetailsUrl = `${ConfigManager.BOX_API_BASE_URL}/files/${testFileId}?fields=id,name,size,path_collection,created_at,parent`;
      const response = UrlFetchApp.fetch(fileDetailsUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (response.getResponseCode() === 200) {
        const fileDetails = JSON.parse(response.getContentText());
        const result = ns.detectLegalDocument(fileDetails, accessToken);
        
        if (result) {
          Logger.log(`🎯 Detection Results for: ${fileDetails.name}`);
          Logger.log(`   Legal Document: ${result.isLegalDocument ? 'YES' : 'NO'}`);
          Logger.log(`   Confidence: ${result.confidence}%`);
          Logger.log(`   Indicators: ${result.indicators.join(', ')}`);
        } else {
          Logger.log('⚠️ File not relevant for legal detection');
        }
      }
      
    } catch (error) {
      Logger.log(`❌ Test failed: ${error.toString()}`);
    }
  };
  
  return ns;
})();

// Quick access functions
function testLegalDetection(fileId) {
  return LegalDocumentDetector.testLegalDetection(fileId);
}

function processLegalDocsInTestFolder() {
  const accessToken = getValidAccessToken();
  const testFolderId = ConfigManager.getProperty('BOX_PRIORITY_FOLDER') || '0';
  return LegalDocumentDetector.processLegalDocumentsInFolder(testFolderId, accessToken, 20);
}