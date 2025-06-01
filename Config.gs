// File: Config.gs
// Configuration constants for Box Image Metadata Processing System
// Uses cGoa and cUseful libraries by Bruce McPherson

/** @constant {object} SCRIPT_PROPERTIES Access to script properties for secure storage. */
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();

// --- Box API Configuration ---
/** @constant {string} BOX_API_BASE_URL Base URL for the Box API. */
const BOX_API_BASE_URL = 'https://api.box.com/2.0';

/** @constant {number} DEFAULT_API_ITEM_LIMIT Default limit for paginated Box API calls. */
const DEFAULT_API_ITEM_LIMIT = 1000;

// --- Box OAuth 2.0 Credentials (used by cGoa) ---
/** @constant {string} OAUTH_CLIENT_ID_PROPERTY Key for storing Box OAuth Client ID in Script Properties. */
const OAUTH_CLIENT_ID_PROPERTY = 'OAUTH_CLIENT_ID';

/** @constant {string} OAUTH_CLIENT_SECRET_PROPERTY Key for storing Box OAuth Client Secret in Script Properties. */
const OAUTH_CLIENT_SECRET_PROPERTY = 'OAUTH_CLIENT_SECRET';

// --- Box Metadata Template Configuration ---
/** @constant {string} BOX_METADATA_TEMPLATE_KEY The unique key for the Box metadata template. */
const BOX_METADATA_TEMPLATE_KEY = 'comprehensiveImageMetadata';

/** @constant {string} BOX_METADATA_SCOPE The scope for the Box metadata template (usually 'enterprise'). */
const BOX_METADATA_SCOPE = 'enterprise';

/** @constant {string} BOX_METADATA_TEMPLATE_DISPLAY_NAME Display name for the Box metadata template. */
const BOX_METADATA_TEMPLATE_DISPLAY_NAME = 'Comprehensive Image Metadata';

// --- Google Cloud Vision API Configuration ---
/** @constant {string} VISION_API_ENDPOINT URL for Google Cloud Vision API. */
const VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

/** @constant {string} VISION_API_KEY_PROPERTY Name of the script property storing the Vision API Key. */
const VISION_API_KEY_PROPERTY = 'VISION_API_KEY';

/** @constant {number} MAX_VISION_API_FILE_SIZE_BYTES Vision API image size limit (20MB). */
const MAX_VISION_API_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** @constant {number} MAX_TEXT_EXTRACTION_LENGTH Max characters for extracted text to store from Vision API. */
const MAX_TEXT_EXTRACTION_LENGTH = 500;

// --- Processing Folder Configuration ---
/** @constant {string} DEFAULT_PROCESSING_FOLDER_ID Box folder ID for root processing ('0' for root). */
const DEFAULT_PROCESSING_FOLDER_ID = '0';

/** @constant {string} ACTIVE_TEST_FOLDER_ID Specific Box folder ID used for testing and examples. */
const ACTIVE_TEST_FOLDER_ID = '323509823918';

// --- Processing Stages ---
/** @constant {string} PROCESSING_STAGE_UNPROCESSED Marker for unprocessed files. */
const PROCESSING_STAGE_UNPROCESSED = 'unprocessed';

/** @constant {string} PROCESSING_STAGE_BASIC Marker for basic info extracted. */
const PROCESSING_STAGE_BASIC = 'basic_extracted';

/** @constant {string} PROCESSING_STAGE_EXIF Marker for EXIF extracted. */
const PROCESSING_STAGE_EXIF = 'exif_extracted';

/** @constant {string} PROCESSING_STAGE_AI Marker for AI analyzed. */
const PROCESSING_STAGE_AI = 'ai_analyzed';

/** @constant {string} PROCESSING_STAGE_REVIEW Marker for human review needed. */
const PROCESSING_STAGE_REVIEW = 'human_reviewed';

/** @constant {string} PROCESSING_STAGE_COMPLETE Marker for completed processing. */
const PROCESSING_STAGE_COMPLETE = 'complete';

// --- Processing Version Tags ---
/** @constant {string} PROCESSING_VERSION_BASIC Version tag for basic metadata extraction. */
const PROCESSING_VERSION_BASIC = 'v1.0';

/** @constant {string} PROCESSING_VERSION_ENHANCED Version tag for enhanced processing (EXIF/Vision). */
const PROCESSING_VERSION_ENHANCED = 'v2.0';

/** @constant {string} PROCESSING_VERSION_EXIF_ONLY Version tag for EXIF-only enhanced processing. */
const PROCESSING_VERSION_EXIF_ONLY = 'v2.0-exif';

// --- Batch Processing & Rate Limiting Configuration ---
/** @constant {number} METADATA_ATTACHMENT_BATCH_SIZE Number of files to process in a batch for template attachment. */
const METADATA_ATTACHMENT_BATCH_SIZE = 50;

/** @constant {number} METADATA_ATTACHMENT_FILE_DELAY_MS Delay between individual template attachment operations. */
const METADATA_ATTACHMENT_FILE_DELAY_MS = 100;

/** @constant {number} METADATA_ATTACHMENT_BATCH_DELAY_MS Delay between batches of template attachments. */
const METADATA_ATTACHMENT_BATCH_DELAY_MS = 2000;

/** @constant {number} IMAGE_PROCESSING_FILE_DELAY_MS Delay after processing small batches in basic loops. */
const IMAGE_PROCESSING_FILE_DELAY_MS = 1000;

/** @constant {number} ENHANCED_PROCESSING_BATCH_SIZE Number of files to process in enhanced (Vision API) batches. */
const ENHANCED_PROCESSING_BATCH_SIZE = 5;

/** @constant {number} ENHANCED_PROCESSING_FILE_DELAY_MS Delay between individual Vision API calls. */
const ENHANCED_PROCESSING_FILE_DELAY_MS = 2000;

/** @constant {number} ENHANCED_PROCESSING_BATCH_DELAY_MS Delay between enhanced processing batches. */
const ENHANCED_PROCESSING_BATCH_DELAY_MS = 5000;

// --- File Type Configuration ---
/** @constant {string[]} IMAGE_EXTENSIONS List of supported image file extensions. */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'];