import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { parsePdfFile, parseEpubFile } from '../services/fileParser';
import { generateBookAnalysis } from '../services/geminiService';
import { calculateFleschKincaid, calculateGunningFog } from '../services/textAnalysis';

// Simple in-memory cache (in production, use Redis or similar)
const analysisCache = new Map<string, any>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Controller to handle book analysis requests
 */
export async function analyzeBook(req: Request, res: Response, next: NextFunction) {
  console.log('🎯 analyzeBook controller called');
  const startTime = Date.now();
  
  try {
    // File validation
    console.log('📁 Validating uploaded file...');
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ 
        error: 'No file uploaded',
        code: 'FILE_REQUIRED',
        message: 'Please upload a PDF or EPUB file'
      });
    }

    const file = req.file;
    
    // Enhanced file validation
    if (file.size === 0) {
      return res.status(400).json({
        error: 'Empty file uploaded',
        code: 'FILE_EMPTY',
        message: 'The uploaded file appears to be empty'
      });
    }

    if (file.size > 100 * 1024 * 1024) { // 100MB
      return res.status(413).json({
        error: 'File too large',
        code: 'FILE_TOO_LARGE',
        message: 'File size must be less than 100MB'
      });
    }

    console.log('📄 File received:', {
      name: file.originalname,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      mimeType: file.mimetype
    });

    const isPdf = file.mimetype === 'application/pdf';
    const isEpub = file.mimetype === 'application/epub+zip' || file.originalname.toLowerCase().endsWith('.epub');

    if (!isPdf && !isEpub) {
      console.log('❌ Invalid file type');
      return res.status(400).json({ 
        error: `Invalid file type: ${file.mimetype}`,
        code: 'INVALID_FILE_TYPE',
        message: 'Only PDF and EPUB files are supported',
        supportedTypes: ['application/pdf', 'application/epub+zip']
      });
    }

    // Generate cache key from file hash
    const fileHash = crypto.createHash('md5').update(file.buffer).digest('hex');
    const extractCover = req.query.extractCover === 'true';
    const requestedMaxTextLength = typeof req.query.maxTextLength === 'string'
      ? parseInt(req.query.maxTextLength, 10)
      : NaN;
    const maxTextLength = Number.isFinite(requestedMaxTextLength) ? requestedMaxTextLength : 200000;
    const cacheKey = `${fileHash}_${extractCover}_${maxTextLength}`;
    
    // Check cache first
    const cached = analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('🎯 Returning cached result');
      return res.json({
        ...cached.result,
        cached: true,
        cacheAge: Math.round((Date.now() - cached.timestamp) / 1000 / 60) // minutes
      });
    }

    console.log(`📖 Processing ${isPdf ? 'PDF' : 'EPUB'}: ${file.originalname}`);

    const parseOptions = { extractCover, maxTextLength };
    console.log('⚙️ Parse options:', parseOptions);

    // Parse the file
    let parseResult;
    try {
      parseResult = isPdf 
        ? await parsePdfFile(file.buffer, parseOptions)
        : await parseEpubFile(file.buffer, parseOptions);
    } catch (parseError: any) {
      console.error('❌ File parsing failed:', parseError.message);
      return res.status(422).json({
        error: 'Failed to parse file',
        code: 'PARSE_ERROR',
        message: parseError.message,
        fileType: isPdf ? 'pdf' : 'epub'
      });
    }

    if (!parseResult.text.trim()) {
      return res.status(422).json({ 
        error: 'No text content found',
        code: 'NO_TEXT_CONTENT',
        message: 'Could not extract readable text from the file. The file might be image-based, corrupted, or empty.'
      });
    }

    console.log(`✅ Extracted ${parseResult.text.length} characters from ${file.originalname}`);

    // Calculate reading level metrics
    const fleschKincaid = calculateFleschKincaid(parseResult.text);
    const gunningFog = calculateGunningFog(parseResult.text);

    console.log('🤖 Analyzing with Gemini AI...');

    // Generate AI analysis with error handling
    let analysis;
    try {
      analysis = await generateBookAnalysis(parseResult.text);
    } catch (aiError: any) {
      console.error('❌ AI analysis failed:', aiError.message);
      return res.status(503).json({
        error: 'AI analysis failed',
        code: 'AI_SERVICE_ERROR',
        message: 'Unable to generate analysis at this time. Please try again later.'
      });
    }

    console.log('✨ Analysis complete!');

    // Combine all results
    const result = {
      metadata: {
        ...parseResult.metadata,
        lcc: analysis.lcc,
        bisac: analysis.bisac,
        lcsh: analysis.lcsh,
        fieldOfStudy: analysis.fieldOfStudy,
        discipline: analysis.discipline,
        readingLevel: fleschKincaid ?? undefined,
        gunningFog: gunningFog ?? undefined,
      },
      summary: analysis.summary,
      tableOfContents: parseResult.toc ?? null,
      pageList: parseResult.pageList ?? null,
      coverImage: parseResult.coverImageUrl ?? null,
      fileName: file.originalname,
      fileType: isPdf ? 'pdf' : 'epub',
      processedAt: new Date().toISOString(),
      processingTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    };

    // Cache the result
    analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    // Clean old cache entries periodically
    if (Math.random() < 0.1) { // 10% chance
      for (const [key, value] of analysisCache.entries()) {
        if (Date.now() - value.timestamp > CACHE_TTL) {
          analysisCache.delete(key);
        }
      }
    }

    res.json(result);
  } catch (error: any) {
    console.error('❌ Unexpected error analyzing book:', error);
    
    // Enhanced error response
    const errorResponse: any = {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while processing your request'
    };

    // Include error details in development
    if (process.env.NODE_ENV === 'development') {
      errorResponse.details = {
        message: error.message,
        stack: error.stack
      };
    }

    res.status(500).json(errorResponse);
  }
}
