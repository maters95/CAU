// TEST/scripts/constants.js
// scripts/constants.js - Shared constants for the extension (v1.17 - Added backup disabled key)
'use strict';

// --- Action Types for Message Passing ---
export const ACTION_RUN_SCRIPTS = 'runScripts';
export const ACTION_STOP_PROCESSING = 'stopProcessing';
export const ACTION_CSV_DETECTED = 'csvContentDetected';
export const ACTION_UPDATE_PROGRESS = 'updateProgress';
export const ACTION_PROCESSING_COMPLETE = 'processingComplete';
export const ACTION_GENERATE_REPORTS = 'generateReports';
export const ACTION_REPORTS_GENERATED = 'reportsGenerated';
export const ACTION_DELETE_DATA = 'deleteStoredData';
export const ACTION_DELETE_COMPLETE = 'deleteComplete';
export const ACTION_DATA_UPDATED = 'dataUpdated';
export const ACTION_CLEAR_ALL_DATA = 'clearAllData';
export const ACTION_EXPORT_ALL_DATA = 'exportAllData';
export const ACTION_IMPORT_ALL_DATA = 'importAllData';
export const ACTION_IMPORT_FROM_OBJECTIVE_URLS = 'IMPORT_FROM_OBJECTIVE_URLS';
export const ACTION_PROMPT_FOLDER_TYPE_SELECTION = 'PROMPT_FOLDER_TYPE_SELECTION';
export const ACTION_PROCESS_SELECTED_FOLDER_TYPES = 'PROCESS_SELECTED_FOLDER_TYPES';
export const ACTION_OBJECTIVE_IMPORT_COMPLETE = 'OBJECTIVE_IMPORT_COMPLETE';
export const ACTION_OBJECTIVE_SUBFOLDER_RESULT = 'objectiveSubFolderResult';
export const ACTION_OBJECTIVE_MONTHLY_RESULT = 'objectiveMonthlyResult';
export const ACTION_OBJECTIVE_IMPORT_ERROR = 'objectiveImportError';
export const ACTION_LOG_ERROR = 'logError';
export const ACTION_LOG_FROM_SCRIPT = 'logFromScript';
export const ACTION_GET_HOLIDAYS = 'getHolidays';
export const ACTION_EXECUTE_OBJECTIVE_SCRAPE = 'EXECUTE_OBJECTIVE_SCRAPE';
export const ACTION_CONTENT_SCRIPT_READY = 'CONTENT_SCRIPT_READY';
export const ACTION_LOG_FROM_CONTENT_SCRIPT = 'LOG_FROM_CONTENT_SCRIPT';
export const ACTION_SET_LOGGING = 'setLogging';
export const ACTION_SET_DAILY_FETCH = 'setDailyFetch';
export const ACTION_GET_DAILY_FETCH_STATUS = 'getDailyFetchStatus';
export const ACTION_TRIGGER_DAILY_FETCH = 'triggerDailyFetch';

// --- Status Codes / Payloads ---
export const STATUS_SUCCESS = 'success';
export const STATUS_ERROR = 'error';
export const STATUS_ACK_PROCESSING = 'processing_acknowledged';
export const STATUS_ACK_GENERATION = 'generation_acknowledged';
export const STATUS_ACK_ERROR_LOGGED = 'error_logged';
export const STATUS_ERR_UNKNOWN_ACTION = 'unknown_action';

// --- Storage Keys ---
export const STORAGE_KEY_DATA = 'objectiveCumulativeData';
export const STORAGE_KEY_LOGS = 'ecmExecutionLogs';
export const STORAGE_KEY_ERRORS = 'errorLog';
export const STORAGE_KEY_FOLDERS_CONFIG = 'ecmFolders';
export const STORAGE_KEY_HOLIDAYS = 'nswPublicHolidays';
export const STORAGE_KEY_HOLIDAYS_FETCHED = 'nswPublicHolidaysLastFetched';
export const STORAGE_KEY_BACKUPS = 'ecmBackups';
export const STORAGE_KEY_LAST_BACKUP = 'ecmLastBackup';
export const STORAGE_KEY_VERSION = 'ecmExtensionVersion';
export const STORAGE_KEY_NOTIFICATIONS = 'ecmNotifications';
export const STORAGE_KEY_LAST_AUTO_FETCH = 'ecmLastAutoFetchTimestamp';
export const STORAGE_KEY_QUEUE_DATA = 'queueData';
export const STORAGE_KEY_LOGGING_CONFIG = 'loggingConfig';
export const STORAGE_KEY_DAILY_FETCH_CONFIG = 'dailyFetchConfig';
// FIX: Added the missing constant to be exported for use in other scripts.
export const STORAGE_KEY_BACKUPS_DISABLED = 'ecmAutoBackupsDisabled';

// --- Alarm Names ---
export const ALARM_ARCHIVING = 'dataArchiving';
export const ALARM_HOLIDAY_CHECK = 'holidayCheck';
export const ALARM_DAILY_BACKUP = 'dailyBackup';
export const ALARM_WEEKLY_MAINTENANCE = 'weeklyMaintenance';
export const ALARM_MONTHLY_ARCHIVING = 'monthlyArchiving';
export const ALARM_DAILY_FETCH = 'dailyStatFetch';

// --- Error Severity ---
export const ERROR_SEVERITY = { INFO: 'info', WARNING: 'warning', ERROR: 'error', CRITICAL: 'critical' };
export const ERROR_SEVERITY_CRITICAL = 'critical';
export const ERROR_SEVERITY_ERROR = 'error';
export const ERROR_SEVERITY_WARNING = 'warning';
export const ERROR_SEVERITY_INFO = 'info';

// --- Script Types ---
export const SCRIPT_TYPE_A = 'A';
export const SCRIPT_TYPE_B = 'B';

// --- Date & Time Constants ---
export const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// --- Folder Names & Mappings ---
const COMPLETED_ROI_REQUESTS = 'Completed ROI Requests';
export const BATCH_FOLDER_DISPLAY_NAMES_TO_EXCLUDE = new Set([ "Personals", "Police", "Completed ROI Requests", "Personals Batch", "Police Batch" ]);

// *** ADDED THESE CONSTANTS FOR LABEL FORMATTING ***
export const ORIGINAL_SUBPOENA_NAME = "TfNSW Team - Legal - Subpoenas CAU, GIPAs, Court Orders (inc FRS)";
export const SHORT_SUBPOENA_NAME = "Subpoenas CAU";

export const FOLDER_ORDER = [ "Sanctions Lifts", "Driver Licence Renewal - Online Block Removal", "VDP/Suspension/Cancellation", "Create New Licence/Customer Number", "Dishonoured Payments", "TAG", "TfNSW Team - Legal - Subpoenas CAU", "Form 943 - Access to Own Personal Records", "Form 5672 - Deceased Estate", "Form 5632 - Vehicle Search Liquidator", "Form 5633 - Vehicle Buyer Liquidator", "Form 5656 - Vehicle Search Bankruptcy", "Form 5657 - Vehicle Buyer Bankruptcy", "Form 1046 - Solicitor", "Form 5376 - Council", "Form 5689 - TfNSW Teams", "ROI - Revenue NSW", "Audit Office", COMPLETED_ROI_REQUESTS, "Personals", "Police" ];
export const FOLDER_NAME_MAPPINGS = { "fine default - manual sanction lifts": "Sanctions Lifts", "administration - driver licence renewal - online block removal": "Driver Licence Renewal - Online Block Removal", "revenue nsw requested suspension of nsw visitor driver privileges": "VDP/Suspension/Cancellation", "administration - create new licencecustomer number": "Create New Licence/Customer Number", "general enquiries - dishonoured payments - drives": "Dishonoured Payments", "nsw trustee and guardian": "TAG", "tfnsw team - legal - subpoenas, court orders, gipas, statutory notices & search warrants": "TfNSW Team - Legal - Subpoenas CAU", "form 943 - access to own personal records": "Form 943 - Access to Own Personal Records", "form 5672 - vehicle ownership search - deceased estate": "Form 5672 - Deceased Estate", "form 5632 - vehicle ownershipsale search for liquidators, administrators & receivers": "Form 5632 - Vehicle Search Liquidator", "form 5633 - vehicle buyer search for liquidators, administrators & receivers": "Form 5633 - Vehicle Buyer Liquidator", "form 5656 - bankruptcy vehicle ownership search for trustee or receiver in bankruptcy": "Form 5656 - Vehicle Search Bankruptcy", "form 5657 - bankruptcy vehicle buyer serach for trustee or receiver in bankruptcy": "Form 5657 - Vehicle Buyer Bankruptcy", "form 5657 - bankruptcy vehicle buyer search for trustee or receiver in bankruptcy": "Form 5657 - Vehicle Buyer Bankruptcy", "bankruptcy vehicle buyer": "Form 5657 - Vehicle Buyer Bankruptcy", "form 1046 - request for information by solicitor": "Form 1046 - Solicitor", "form 5376 - request for vehicle ownership details (parking offences)": "Form 5376 - Council", "form 5689 - tfnsw teams - drives information request": "Form 5689 - TfNSW Teams", "revenue nsw": "ROI - Revenue NSW", "audit office of nsw requests": "Audit Office", "interstate requests for licence or registration transfer": COMPLETED_ROI_REQUESTS, "interstate requests": COMPLETED_ROI_REQUESTS, "roi requests": COMPLETED_ROI_REQUESTS, "completed roi requests": COMPLETED_ROI_REQUESTS, "online requests via service nsw driving record portal (personals) batch sheets": "Personals", "online requests via online information release portal - (police) batch sheets": "Police", "online requests via online information release portal -(oir) batch sheets": "Police" };
export const INITIALS_TO_NAME = { 'MB': 'Michael Bourke', 'ZM': 'Zak Masters', 'AD': 'Ashleigh Dykes', 'DL': 'Di Leask', 'KV': 'Kellie Vereyken', 'JLR': 'Jessica Ricketts', 'JC': 'Jethro Carthew', 'BF': 'Blake Foley', 'JB': 'Jennifer Bowe', 'JR': 'Jessica Ronalds', 'BB': 'Ben Burrows', 'CW': 'Cheryl Warren', 'AC': 'Angela Clarke', 'DK': 'Dina Kosso', 'NS': 'Nathan Sweeney', };