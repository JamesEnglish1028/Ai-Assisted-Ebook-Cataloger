import express from 'express';
import multer from 'multer';
import { analyzeBook } from '../controllers/bookAnalysisController';

const router = express.Router();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/epub+zip'];
    const isPdf = file.mimetype === 'application/pdf';
    const isEpub = file.mimetype === 'application/epub+zip' || file.originalname.toLowerCase().endsWith('.epub');
    
    if (isPdf || isEpub) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF and EPUB files are allowed.'));
    }
  }
});

/**
 * POST /api/analyze-book
 * 
 * Analyzes an uploaded ebook file (PDF or EPUB) and returns:
 * - Metadata (title, author, ISBN, etc.)
 * - AI-generated summary
 * - Classifications (LCC, BISAC, LCSH)
 * - Table of Contents
 * - Cover image (as base64)
 * 
 * Request: multipart/form-data with 'file' field
 * Response: JSON with analysis results
 */
router.post('/analyze-book', upload.single('file'), analyzeBook);

export default router;
