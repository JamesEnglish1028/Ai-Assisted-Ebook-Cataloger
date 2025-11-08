import express from 'express';
import multer from 'multer';
import { query, validationResult } from 'express-validator';
import { analyzeBook } from '../controllers/bookAnalysisController';

const router = express.Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB limit (increased for large textbooks)
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['application/pdf', 'application/epub+zip'];
    const isPdf = file.mimetype === 'application/pdf';
    const isEpub = file.mimetype === 'application/epub+zip' || file.originalname.toLowerCase().endsWith('.epub');
    
    if (isPdf || isEpub) {
      cb(null, true);
    } else {
      const error = new Error(`Invalid file type: ${file.mimetype}. Only PDF and EPUB files are allowed.`);
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
 * Analyzes an uploaded ebook file (PDF or EPUB) and returns:
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
  validateAnalyzeBookQuery,
  handleValidationErrors,
  upload.single('file'), 
  analyzeBook
);

export default router;
