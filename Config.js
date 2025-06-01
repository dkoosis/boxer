// File: Config.gs



/** @constant {object} SCRIPT_PROPERTIES Access to script properties for secure storage. */

const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();



// --- Box API General ---
/** @constant {string} BOX_API_BASE_URL Base URL for the Box API. */
const BOX_API_BASE_URL = 'https://api.box.com/2.0';

/** @constant {number} DEFAULT_API_ITEM_LIMIT Default limit for paginated Box API calls (e.g., listing folder items). */
const DEFAULT_API_ITEM_LIMIT = 1000;

// --- Box OAuth 2.0 ---
/** @constant {string} OAUTH_CLIENT_ID_PROPERTY Key for storing Box OAuth Client ID in Script Properties. */
const OAUTH_CLIENT_ID_PROPERTY = 'OAUTH_CLIENT_ID';

/** @constant {string} OAUTH_CLIENT_SECRET_PROPERTY Key for storing Box OAuth Client Secret in Script Properties. */
const OAUTH_CLIENT_SECRET_PROPERTY = 'OAUTH_CLIENT_SECRET';

/** @constant {string} BOX_ACCESS_TOKEN_PROPERTY Key for storing Box Access Token in Script Properties. */
const BOX_ACCESS_TOKEN_PROPERTY = 'BOX_ACCESS_TOKEN';

/** @constant {string} BOX_REFRESH_TOKEN_PROPERTY Key for storing Box Refresh Token in Script Properties. */
const BOX_REFRESH_TOKEN_PROPERTY = 'BOX_REFRESH_TOKEN';

/** @constant {string} BOX_OAUTH_AUTH_URL Box authorization endpoint. */
const BOX_OAUTH_AUTH_URL = 'https://account.box.com/api/oauth2/authorize';

/** @constant {string} BOX_OAUTH_TOKEN_URL Box token exchange endpoint. */
const BOX_OAUTH_TOKEN_URL = 'https://api.box.com/oauth2/token';

/** @constant {string} APPS_SCRIPT_REDIRECT_URI The specific redirect URI for your Apps Script project. */
const APPS_SCRIPT_REDIRECT_URI = `https://script.google.com/macros/d/${ScriptApp.getScriptId()}/usercallback`;

// --- Box Metadata Template ---
/** @constant {string} BOX_METADATA_TEMPLATE_KEY The unique key for the Box metadata template. */
const BOX_METADATA_TEMPLATE_KEY = 'comprehensiveImageMetadata';

/** @constant {string} BOX_METADATA_SCOPE The scope for the Box metadata template (usually 'enterprise'). */
const BOX_METADATA_SCOPE = 'enterprise';

/** @constant {string} BOX_METADATA_TEMPLATE_DISPLAY_NAME Display name for the Box metadata template. */
const BOX_METADATA_TEMPLATE_DISPLAY_NAME = 'Comprehensive Image Metadata';

// --- Google Cloud Vision API ---
/** @constant {string} VISION_API_ENDPOINT URL for Google Cloud Vision API. */
const VISION_API_ENDPOINT = 'https://vision.googleapis.com/v1/images:annotate';

/** @constant {string} VISION_API_KEY_PROPERTY Name of the script property storing the Vision API Key. */
const VISION_API_KEY_PROPERTY = 'VISION_API_KEY';

/** @constant {number} MAX_VISION_API_FILE_SIZE_BYTES Vision API image size limit (20MB). */
const MAX_VISION_API_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB

/** @constant {number} MAX_TEXT_EXTRACTION_LENGTH Max characters for extracted text to store from Vision API. */
const MAX_TEXT_EXTRACTION_LENGTH = 500;

// --- Script Processing Configuration ---
/** @constant {string} DEFAULT_PROCESSING_FOLDER_ID Box folder ID for root or default processing (e.g., '0' for root). */
const DEFAULT_PROCESSING_FOLDER_ID = '0';

/** @constant {string} ACTIVE_TEST_FOLDER_ID Specific Box folder ID used in many test/processing functions. */
const ACTIVE_TEST_FOLDER_ID = '323509823918'; // As used in your examples

// --- Processing Stages & Versions ---
/** @constant {string} PROCESSING_STAGE_UNPROCESSED Marker for unprocessed files. */
const PROCESSING_STAGE_UNPROCESSED = 'unprocessed';

/** @constant {string} PROCESSING_STAGE_BASIC Marker for basic info extracted. */
const PROCESSING_STAGE_BASIC = 'basic_extracted';

/** @constant {string} PROCESSING_STAGE_EXIF Marker for EXIF extracted. */
const PROCESSING_STAGE_EXIF = 'exif_extracted';

/** @constant {string} PROCESSING_STAGE_AI Marker for AI analyzed. */
const PROCESSING_STAGE_AI = 'ai_analyzed';

/** @constant {string} PROCESSING_STAGE_REVIEW Marker for human review needed. */
const PROCESSING_STAGE_REVIEW = 'human_reviewed'; // Example, expand if used

/** @constant {string} PROCESSING_STAGE_COMPLETE Marker for completed processing. */
const PROCESSING_STAGE_COMPLETE = 'complete';

/** @constant {string} PROCESSING_VERSION_BASIC Version tag for basic metadata extraction. */
const PROCESSING_VERSION_BASIC = 'v1.0';

/** @constant {string} PROCESSING_VERSION_ENHANCED Version tag for enhanced processing (EXIF/Vision). */
const PROCESSING_VERSION_ENHANCED = 'v2.0';

/** @constant {string} PROCESSING_VERSION_EXIF_ONLY Version tag for EXIF-only enhanced processing. */
const PROCESSING_VERSION_EXIF_ONLY = 'v2.0-exif';

// --- Batch Processing & Delay Configurations ---

/** @constant {number} METADATA_ATTACHMENT_BATCH_SIZE Number of files to process in a batch for template attachment. */
const METADATA_ATTACHMENT_BATCH_SIZE = 50;

/** @constant {number} METADATA_ATTACHMENT_FILE_DELAY_MS Delay in milliseconds between individual file operations within a template attachment batch. */
const METADATA_ATTACHMENT_FILE_DELAY_MS = 100; // ms

/** @constant {number} METADATA_ATTACHMENT_BATCH_DELAY_MS Delay in milliseconds between batches of template attachments. */
const METADATA_ATTACHMENT_BATCH_DELAY_MS = 2000; // ms

/** @constant {number} IMAGE_PROCESSING_FILE_DELAY_MS Delay in ms after processing a small number of images in basic loops. */
const IMAGE_PROCESSING_FILE_DELAY_MS = 1000; // ms (used after every 10 files in processImagesInFoldersBasic)

/** @constant {number} ENHANCED_PROCESSING_BATCH_SIZE Number of files to process in a batch for enhanced (Vision API) processing. */
const ENHANCED_PROCESSING_BATCH_SIZE = 5;

/** @constant {number} ENHANCED_PROCESSING_FILE_DELAY_MS Delay in milliseconds between individual file operations (e.g., Vision API calls) within an enhanced processing batch. */
const ENHANCED_PROCESSING_FILE_DELAY_MS = 2000; // ms

/** @constant {number} ENHANCED_PROCESSING_BATCH_DELAY_MS Delay in milliseconds between batches of enhanced processing. */
const ENHANCED_PROCESSING_BATCH_DELAY_MS = 5000; // ms

// --- File Types ---
/** @constant {string[]} IMAGE_EXTENSIONS List of common image file extensions. Case-insensitive matching is typically applied. */
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp', '.heic', '.heif'];