import express from 'express';
import multer from 'multer';
import { body, query, validationResult } from 'express-validator';
import { analyzeBook, analyzeExtractedText } from '../controllers/bookAnalysisController';

const router = express.Router();

// Configure multer for file uploads (store in memory) - general analysis
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (increased for large textbooks)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'application/epub+zip',
      'audio/mpeg',
      'audio/mp4',
      'audio/x-m4a',
      'audio/wav',
      'audio/x-wav',
      'application/audiobook+zip',
    ];
    const lowerName = file.originalname.toLowerCase();
    const isPdf = file.mimetype === 'application/pdf';
    const isEpub = file.mimetype === 'application/epub+zip' || lowerName.endsWith('.epub');
    const isAudiobook =
      file.mimetype === 'audio/mpeg' ||
      file.mimetype === 'audio/mp4' ||
      file.mimetype === 'audio/x-m4a' ||
      file.mimetype === 'audio/wav' ||
      file.mimetype === 'audio/x-wav' ||
      file.mimetype === 'application/audiobook+zip' ||
      lowerName.endsWith('.mp3') ||
      lowerName.endsWith('.m4b') ||
      lowerName.endsWith('.wav') ||
      lowerName.endsWith('.audiobook');
    
    if (isPdf || isEpub || isAudiobook) {
      cb(null, true);
    } else {
      const error = new Error(`Invalid file type: ${file.mimetype}. Only PDF, EPUB, MP3, M4B, WAV, and .audiobook files are allowed.`);
      error.name = 'ValidationError';
      cb(error);
    }
  }
});


// Validation middleware for query parameters
const validateAnalyzeBookQuery = [
  query('extractCover')
    .optional()
    .isBoolean()
    .withMessage('extractCover must be a boolean value (true/false)'),
  query('maxTextLength')
    .optional()
    .isInt({ min: 1000, max: 500000 })
    .withMessage('maxTextLength must be between 1000 and 500000 characters'),
  body('aiProvider')
    .optional()
    .isIn(['google', 'gemini', 'openai', 'anthropic', 'claude'])
    .withMessage('aiProvider must be one of: google, openai, anthropic'),
  body('aiModel')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('aiModel must be a non-empty string up to 100 characters'),
  body('transcriptionMode')
    .optional()
    .isIn(['metadata-only', 'transcribe-preview', 'transcribe-full'])
    .withMessage('transcriptionMode must be one of: metadata-only, transcribe-preview, transcribe-full'),
  body('transcriptionMaxMinutes')
    .optional()
    .isInt({ min: 1, max: 240 })
    .withMessage('transcriptionMaxMinutes must be between 1 and 240'),
  body('transcriptionIncludeTimestamps')
    .optional()
    .isBoolean()
    .withMessage('transcriptionIncludeTimestamps must be true/false'),
];

const validateAnalyzeTextBody = [
  query('maxTextLength')
    .optional()
    .isInt({ min: 1000, max: 500000 })
    .withMessage('maxTextLength must be between 1000 and 500000 characters'),
  body('text')
    .isString()
    .isLength({ min: 1, max: 2000000 })
    .withMessage('text is required and must be between 1 and 2000000 characters'),
  body('sourceType')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('sourceType must be a non-empty string up to 100 characters'),
  body('fileName')
    .optional()
    .isString()
    .isLength({ min: 1, max: 255 })
    .withMessage('fileName must be a non-empty string up to 255 characters'),
  body('fileType')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('fileType must be a non-empty string up to 50 characters'),
  body('coverImage')
    .optional({ values: 'falsy' })
    .isString()
    .withMessage('coverImage must be a base64 image string when provided'),
  body('metadata')
    .optional()
    .isObject()
    .withMessage('metadata must be an object when provided'),
  body('telemetry')
    .optional()
    .isObject()
    .withMessage('telemetry must be an object when provided'),
  body('telemetry.conversionDurationMs')
    .optional()
    .isInt({ min: 0, max: 3600000 })
    .withMessage('telemetry.conversionDurationMs must be between 0 and 3600000'),
  body('telemetry.usedOcrFallback')
    .optional()
    .isBoolean()
    .withMessage('telemetry.usedOcrFallback must be a boolean'),
  body('telemetry.markdownLength')
    .optional()
    .isInt({ min: 0, max: 5000000 })
    .withMessage('telemetry.markdownLength must be between 0 and 5000000'),
  body('telemetry.modeRequested')
    .optional()
    .isIn(['quick', 'ocr'])
    .withMessage('telemetry.modeRequested must be one of: quick, ocr'),
  body('aiProvider')
    .optional()
    .isIn(['google', 'gemini', 'openai', 'anthropic', 'claude'])
    .withMessage('aiProvider must be one of: google, openai, anthropic'),
  body('aiModel')
    .optional()
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('aiModel must be a non-empty string up to 100 characters'),
];

// Validation error handler
const handleValidationErrors = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : 'query',
        message: err.msg,
        value: err.type === 'field' ? (err as any).value : undefined
      }))
    });
  }
  next();
};

/**
 * POST /api/analyze-book
 * 
 * Analyzes an uploaded book file (PDF, EPUB, or audiobook) and returns:
 * - Metadata (title, author, ISBN, etc.)
 * - AI-generated summary
 * - Classifications (LCC, BISAC, LCSH)
 * - Table of Contents
 * - Cover image (as base64, optional)
 * 
 * Query Parameters:
 * - extractCover (boolean, optional): Whether to extract cover image (default: true)
 * - maxTextLength (number, optional): Maximum text length for analysis (default: 200000)
 * 
 * Request: multipart/form-data with 'file' field
 * Response: JSON with analysis results
 */
router.post('/analyze-book', 
  upload.single('file'),
  validateAnalyzeBookQuery,
  handleValidationErrors,
  analyzeBook
);

/**
 * POST /api/analyze-text
 *
 * Analyze pre-extracted text/markdown (used for browser-side PDF -> MD workflows).
 */
router.post('/analyze-text',
  validateAnalyzeTextBody,
  handleValidationErrors,
  analyzeExtractedText
);

// Multer and file validation error handler
router.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError || err?.name === 'ValidationError') {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error: 'File too large',
        code: 'FILE_TOO_LARGE',
        message: 'File size must be less than 100MB'
      });
    }

    return res.status(400).json({
      error: err.message || 'File upload validation failed',
      code: 'FILE_VALIDATION_ERROR',
      message: err.message || 'File upload validation failed'
    });
  }
  return next(err);
});

export default router;
