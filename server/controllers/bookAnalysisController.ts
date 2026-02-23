import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { parsePdfFile, parseEpubFile, parseAudioFile } from '../services/fileParser';
import { generateBookAnalysisWithProvider, resolveAISelection } from '../services/aiProviderService';
import {
  AudioTranscriptionMode,
  getAudioModeSupport,
  transcribeAudioWithProvider,
} from '../services/audioTranscriptionService';
import { calculateFleschKincaid, calculateGunningFog } from '../services/textAnalysis';
import {
  buildLocAuthorityContext,
  getLocAuthorityFeatureCacheKey,
} from '../services/locAuthorityService';
import {
  buildOpenLibraryContext,
  getOpenLibraryFeatureCacheKey,
  mergeOpenLibraryMetadata,
} from '../services/openLibraryService';
import {
  buildHardcoverContext,
  buildHardcoverContributionCandidate,
  getHardcoverFeatureCacheKey,
  mergeHardcoverMetadata,
} from '../services/hardcoverService';

// Simple in-memory cache (in production, use Redis or similar)
const analysisCache = new Map<string, any>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_MAX_TEXT_LENGTH = 200000;

const parseRequestedMaxTextLength = (req: Request): number => {
  const requestedMaxTextLength = typeof req.query.maxTextLength === 'string'
    ? parseInt(req.query.maxTextLength, 10)
    : NaN;
  return Number.isFinite(requestedMaxTextLength) ? requestedMaxTextLength : DEFAULT_MAX_TEXT_LENGTH;
};

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
        message: 'Please upload a PDF, EPUB, or audiobook file'
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
    const isAudiobook =
      file.mimetype === 'audio/mpeg' ||
      file.mimetype === 'audio/mp4' ||
      file.mimetype === 'audio/x-m4a' ||
      file.mimetype === 'audio/wav' ||
      file.mimetype === 'audio/x-wav' ||
      file.mimetype === 'application/audiobook+zip' ||
      file.mimetype === 'application/json' ||
      file.mimetype === 'text/json' ||
      file.originalname.toLowerCase().endsWith('.mp3') ||
      file.originalname.toLowerCase().endsWith('.m4b') ||
      file.originalname.toLowerCase().endsWith('.wav') ||
      file.originalname.toLowerCase().endsWith('.audiobook') ||
      file.originalname.toLowerCase().endsWith('.json');
    const isAudiobookManifestJson =
      file.mimetype === 'application/json' ||
      file.mimetype === 'text/json' ||
      file.originalname.toLowerCase().endsWith('.json');

    if (!isPdf && !isEpub && !isAudiobook) {
      console.log('❌ Invalid file type');
      return res.status(400).json({ 
        error: `Invalid file type: ${file.mimetype}`,
        code: 'INVALID_FILE_TYPE',
        message: 'Only PDF, EPUB, MP3, M4B, WAV, .audiobook, and RWPM .json files are supported',
        supportedTypes: ['application/pdf', 'application/epub+zip', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'application/audiobook+zip', 'application/json']
      });
    }

    const aiSelection = resolveAISelection(
      typeof req.body?.aiProvider === 'string' ? req.body.aiProvider : undefined,
      typeof req.body?.aiModel === 'string' ? req.body.aiModel : undefined
    );
    const requestedTranscriptionMode = typeof req.body?.transcriptionMode === 'string'
      ? req.body.transcriptionMode
      : 'metadata-only';
    const transcriptionMode: AudioTranscriptionMode = requestedTranscriptionMode === 'transcribe-preview' || requestedTranscriptionMode === 'transcribe-full'
      ? requestedTranscriptionMode
      : 'metadata-only';
    const requestedTranscriptionMinutes = typeof req.body?.transcriptionMaxMinutes === 'string'
      ? parseInt(req.body.transcriptionMaxMinutes, 10)
      : typeof req.body?.transcriptionMaxMinutes === 'number'
        ? req.body.transcriptionMaxMinutes
        : 10;
    const transcriptionIncludeTimestamps = req.body?.transcriptionIncludeTimestamps === 'true' || req.body?.transcriptionIncludeTimestamps === true;

    // Generate cache key from file hash and options
    const fileHash = crypto.createHash('md5').update(file.buffer).digest('hex');
    const extractCover = req.query.extractCover === 'true';
    const maxTextLength = parseRequestedMaxTextLength(req);
    const locAuthorityFeatureKey = getLocAuthorityFeatureCacheKey();
    const openLibraryFeatureKey = getOpenLibraryFeatureCacheKey();
    const hardcoverFeatureKey = getHardcoverFeatureCacheKey();
    const cacheKey = `${fileHash}_${extractCover}_${maxTextLength}_${aiSelection.provider}_${aiSelection.model}_${locAuthorityFeatureKey}_${openLibraryFeatureKey}_${hardcoverFeatureKey}`;
    
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

    console.log(`📖 Processing ${isPdf ? 'PDF' : isEpub ? 'EPUB' : 'AUDIOBOOK'}: ${file.originalname}`);

    const parseOptions = { extractCover, maxTextLength };
    console.log('⚙️ Parse options:', parseOptions);

    // Parse the file
    let parseResult;
    let transcriptionInfo: any = null;
    try {
      parseResult = isPdf
        ? await parsePdfFile(file.buffer, parseOptions)
        : isEpub
          ? await parseEpubFile(file.buffer, parseOptions)
          : await parseAudioFile(file.buffer, file.originalname, file.mimetype, parseOptions);
    } catch (parseError: any) {
      console.error('❌ File parsing failed:', parseError.message);
      return res.status(422).json({
        error: 'Failed to parse file',
        code: 'PARSE_ERROR',
        message: parseError.message,
        fileType: isPdf ? 'pdf' : isEpub ? 'epub' : 'audiobook'
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

    let analysisText = parseResult.text;
    if (isAudiobook && transcriptionMode !== 'metadata-only') {
      if (isAudiobookManifestJson) {
        return res.status(400).json({
          error: 'Transcription mode not supported for manifest-only uploads',
          code: 'TRANSCRIPTION_MODE_UNSUPPORTED',
          message: 'Manifest JSON uploads do not contain audio bytes. Use metadata-only, or upload audio/.audiobook for transcription.',
        });
      }
      const support = getAudioModeSupport(aiSelection.provider);
      if (!support.supportsTranscription) {
        return res.status(400).json({
          error: 'Transcription mode not supported',
          code: 'TRANSCRIPTION_MODE_UNSUPPORTED',
          message: support.reason,
        });
      }

      try {
        const transcriptionResult = await transcribeAudioWithProvider(
          file.buffer,
          file.mimetype,
          file.originalname,
          aiSelection,
          {
            mode: transcriptionMode,
            maxMinutes: Number.isFinite(requestedTranscriptionMinutes) ? requestedTranscriptionMinutes : 10,
            includeTimestamps: transcriptionIncludeTimestamps,
          }
        );
        if (transcriptionResult.transcript.trim()) {
          analysisText = `${parseResult.text}\n\n---\nAudiobook transcript excerpt:\n${transcriptionResult.transcript}`.trim();
        }
        transcriptionInfo = {
          mode: transcriptionMode,
          provider: transcriptionResult.providerUsed,
          model: transcriptionResult.modelUsed,
          minutesUsed: transcriptionResult.minutesUsed,
          estimatedCostUsd: transcriptionResult.estimatedCostUsd,
          truncated: transcriptionResult.truncated,
          transcriptCharacters: transcriptionResult.transcript.length,
          includeTimestamps: transcriptionIncludeTimestamps,
        };
      } catch (transcriptionError: any) {
        return res.status(422).json({
          error: 'Failed to transcribe audiobook',
          code: 'AUDIO_TRANSCRIPTION_ERROR',
          message: transcriptionError?.message || 'Unable to transcribe uploaded audio with selected provider.',
        });
      }
    }

    const locAuthorityContext = await buildLocAuthorityContext({
      title: parseResult.metadata.title,
      author: parseResult.metadata.author,
      narrator: parseResult.metadata.narrator,
      subject: parseResult.metadata.subject,
      keywords: parseResult.metadata.keywords,
    });
    const openLibraryContext = await buildOpenLibraryContext({
      title: parseResult.metadata.title,
      author: parseResult.metadata.author,
      identifier: parseResult.metadata.identifier?.value,
    });
    const hardcoverContext = await buildHardcoverContext({
      title: parseResult.metadata.title,
      author: parseResult.metadata.author,
      identifier: parseResult.metadata.identifier?.value,
    });

    // Calculate reading level metrics
    const fleschKincaid = isAudiobook ? null : calculateFleschKincaid(analysisText);
    const gunningFog = isAudiobook ? null : calculateGunningFog(analysisText);

    console.log(`🤖 Analyzing with ${aiSelection.provider} (${aiSelection.model})...`);

    // Generate AI analysis with error handling
    let analysis;
    try {
      analysis = await generateBookAnalysisWithProvider(analysisText, aiSelection, {
        locAuthorityContext,
        openLibraryContext,
        hardcoverContext,
      });
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
    const baseMetadata = {
      ...parseResult.metadata,
      lcc: analysis.lcc,
      bisac: analysis.bisac,
      lcsh: analysis.lcsh,
      fieldOfStudy: analysis.fieldOfStudy,
      discipline: analysis.discipline,
      locAuthority: locAuthorityContext
        ? {
          provider: locAuthorityContext.provider,
          lcshCandidateCount: locAuthorityContext.lcshCandidates.length,
          nameCandidateCount: locAuthorityContext.nameCandidates.length,
          warnings: locAuthorityContext.warnings,
        }
        : undefined,
      lcshAuthorityCandidates: locAuthorityContext?.lcshCandidates ?? undefined,
      nameAuthorityCandidates: locAuthorityContext?.nameCandidates ?? undefined,
      authorityAlignment: analysis.authorityAlignment ?? undefined,
      openLibrary: openLibraryContext
        ? {
          provider: openLibraryContext.provider,
          mode: openLibraryContext.mode,
          matchType: openLibraryContext.matchType,
          confidence: openLibraryContext.confidence,
          warnings: openLibraryContext.warnings,
        }
        : undefined,
      openLibraryBook: openLibraryContext?.book ?? undefined,
      hardcover: hardcoverContext
        ? {
          provider: hardcoverContext.provider,
          mode: hardcoverContext.mode,
          matchType: hardcoverContext.matchType,
          confidence: hardcoverContext.confidence,
          warnings: hardcoverContext.warnings,
        }
        : undefined,
      hardcoverBook: hardcoverContext?.book ?? undefined,
      readingLevel: isAudiobook ? undefined : fleschKincaid ?? undefined,
      gunningFog: isAudiobook ? undefined : gunningFog ?? undefined,
    } as Record<string, unknown>;

    const metadataWithHardcoverCandidate = {
      ...baseMetadata,
      hardcoverContributionCandidate: buildHardcoverContributionCandidate(
        baseMetadata,
        analysis.summary,
        hardcoverContext,
      ) ?? undefined,
    } as Record<string, unknown>;

    const mergedOpenLibraryMetadata = mergeOpenLibraryMetadata(metadataWithHardcoverCandidate, openLibraryContext);
    const finalMetadata = mergeHardcoverMetadata(mergedOpenLibraryMetadata, hardcoverContext);

    const result = {
      metadata: {
        ...finalMetadata,
      },
      summary: analysis.summary,
      tableOfContents: parseResult.toc ?? null,
      pageList: parseResult.pageList ?? null,
      coverImage: parseResult.coverImageUrl ?? null,
      fileName: file.originalname,
      fileType: isPdf ? 'pdf' : isEpub ? 'epub' : 'audiobook',
      transcription: transcriptionInfo,
      aiProvider: aiSelection.provider,
      aiModel: aiSelection.model,
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

/**
 * Controller to analyze pre-extracted text/markdown payloads.
 * Incremental bridge for browser-based PDF -> MD workflows.
 */
export async function analyzeExtractedText(req: Request, res: Response, next: NextFunction) {
  console.log('🎯 analyzeExtractedText controller called');
  const startTime = Date.now();

  try {
    const rawText = typeof req.body?.text === 'string' ? req.body.text : '';
    const sourceType = typeof req.body?.sourceType === 'string' ? req.body.sourceType : 'text';
    const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : 'uploaded-text.md';
    const fileType = typeof req.body?.fileType === 'string' ? req.body.fileType : 'pdf';
    const coverImage = typeof req.body?.coverImage === 'string' ? req.body.coverImage : null;
    const maxTextLength = parseRequestedMaxTextLength(req);

    const aiSelection = resolveAISelection(
      typeof req.body?.aiProvider === 'string' ? req.body.aiProvider : undefined,
      typeof req.body?.aiModel === 'string' ? req.body.aiModel : undefined
    );

    let text = rawText.trim();
    if (!text) {
      return res.status(400).json({
        error: 'No extracted text provided',
        code: 'TEXT_REQUIRED',
        message: 'Provide non-empty extracted text or markdown in request body.text',
      });
    }

    if (text.length > maxTextLength) {
      console.warn(`Extracted text truncated to ${maxTextLength} characters.`);
      text = text.substring(0, maxTextLength);
    }

    const metadataInput = req.body?.metadata;
    const metadata = (metadataInput && typeof metadataInput === 'object' && !Array.isArray(metadataInput))
      ? metadataInput as Record<string, unknown>
      : {};
    const telemetryInput = req.body?.telemetry;
    const telemetry = (telemetryInput && typeof telemetryInput === 'object' && !Array.isArray(telemetryInput))
      ? telemetryInput as Record<string, unknown>
      : undefined;

    if (telemetry) {
      console.log('📊 Text extraction telemetry:', telemetry);
    }

    const hashInput = JSON.stringify({
      text,
      metadata,
      sourceType,
      provider: aiSelection.provider,
      model: aiSelection.model,
      maxTextLength,
    });
    const textHash = crypto.createHash('md5').update(hashInput).digest('hex');
    const locAuthorityFeatureKey = getLocAuthorityFeatureCacheKey();
    const openLibraryFeatureKey = getOpenLibraryFeatureCacheKey();
    const hardcoverFeatureKey = getHardcoverFeatureCacheKey();
    const cacheKey = `text_${textHash}_${locAuthorityFeatureKey}_${openLibraryFeatureKey}_${hardcoverFeatureKey}`;

    const cached = analysisCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('🎯 Returning cached text-analysis result');
      return res.json({
        ...cached.result,
        cached: true,
        cacheAge: Math.round((Date.now() - cached.timestamp) / 1000 / 60),
      });
    }

    const isAudiobook = fileType === 'audiobook';
    const locAuthorityContext = await buildLocAuthorityContext({
      title: typeof metadata.title === 'string' ? metadata.title : undefined,
      author: typeof metadata.author === 'string' ? metadata.author : undefined,
      narrator: typeof metadata.narrator === 'string' ? metadata.narrator : undefined,
      subject: typeof metadata.subject === 'string' ? metadata.subject : undefined,
      keywords: typeof metadata.keywords === 'string' ? metadata.keywords : undefined,
    });
    const openLibraryContext = await buildOpenLibraryContext({
      title: typeof metadata.title === 'string' ? metadata.title : undefined,
      author: typeof metadata.author === 'string' ? metadata.author : undefined,
      identifier: typeof (metadata.identifier as any)?.value === 'string'
        ? (metadata.identifier as any).value
        : undefined,
    });
    const hardcoverContext = await buildHardcoverContext({
      title: typeof metadata.title === 'string' ? metadata.title : undefined,
      author: typeof metadata.author === 'string' ? metadata.author : undefined,
      identifier: typeof (metadata.identifier as any)?.value === 'string'
        ? (metadata.identifier as any).value
        : undefined,
    });

    const fleschKincaid = isAudiobook ? null : calculateFleschKincaid(text);
    const gunningFog = isAudiobook ? null : calculateGunningFog(text);

    console.log(`🤖 Analyzing extracted text with ${aiSelection.provider} (${aiSelection.model})...`);

    let analysis;
    try {
      analysis = await generateBookAnalysisWithProvider(text, aiSelection, {
        locAuthorityContext,
        openLibraryContext,
        hardcoverContext,
      });
    } catch (aiError: any) {
      console.error('❌ AI analysis failed:', aiError.message);
      return res.status(503).json({
        error: 'AI analysis failed',
        code: 'AI_SERVICE_ERROR',
        message: 'Unable to generate analysis at this time. Please try again later.',
      });
    }

    const baseMetadata = {
      ...metadata,
      lcc: analysis.lcc,
      bisac: analysis.bisac,
      lcsh: analysis.lcsh,
      fieldOfStudy: analysis.fieldOfStudy,
      discipline: analysis.discipline,
      locAuthority: locAuthorityContext
        ? {
          provider: locAuthorityContext.provider,
          lcshCandidateCount: locAuthorityContext.lcshCandidates.length,
          nameCandidateCount: locAuthorityContext.nameCandidates.length,
          warnings: locAuthorityContext.warnings,
        }
        : undefined,
      lcshAuthorityCandidates: locAuthorityContext?.lcshCandidates ?? undefined,
      nameAuthorityCandidates: locAuthorityContext?.nameCandidates ?? undefined,
      authorityAlignment: analysis.authorityAlignment ?? undefined,
      openLibrary: openLibraryContext
        ? {
          provider: openLibraryContext.provider,
          mode: openLibraryContext.mode,
          matchType: openLibraryContext.matchType,
          confidence: openLibraryContext.confidence,
          warnings: openLibraryContext.warnings,
        }
        : undefined,
      openLibraryBook: openLibraryContext?.book ?? undefined,
      hardcover: hardcoverContext
        ? {
          provider: hardcoverContext.provider,
          mode: hardcoverContext.mode,
          matchType: hardcoverContext.matchType,
          confidence: hardcoverContext.confidence,
          warnings: hardcoverContext.warnings,
        }
        : undefined,
      hardcoverBook: hardcoverContext?.book ?? undefined,
      readingLevel: isAudiobook ? undefined : fleschKincaid ?? undefined,
      gunningFog: isAudiobook ? undefined : gunningFog ?? undefined,
    } as Record<string, unknown>;

    const metadataWithHardcoverCandidate = {
      ...baseMetadata,
      hardcoverContributionCandidate: buildHardcoverContributionCandidate(
        baseMetadata,
        analysis.summary,
        hardcoverContext,
      ) ?? undefined,
    } as Record<string, unknown>;

    const mergedOpenLibraryMetadata = mergeOpenLibraryMetadata(metadataWithHardcoverCandidate, openLibraryContext);
    const finalMetadata = mergeHardcoverMetadata(mergedOpenLibraryMetadata, hardcoverContext);

    const result = {
      metadata: {
        ...finalMetadata,
      },
      summary: analysis.summary,
      tableOfContents: null,
      pageList: null,
      coverImage,
      fileName,
      fileType,
      sourceType,
      extractionTelemetry: telemetry ?? null,
      aiProvider: aiSelection.provider,
      aiModel: aiSelection.model,
      processedAt: new Date().toISOString(),
      processingTime: `${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    };

    analysisCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
    });

    if (Math.random() < 0.1) {
      for (const [key, value] of analysisCache.entries()) {
        if (Date.now() - value.timestamp > CACHE_TTL) {
          analysisCache.delete(key);
        }
      }
    }

    return res.json(result);
  } catch (error: any) {
    console.error('❌ Unexpected error analyzing extracted text:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred while processing extracted text',
      ...(process.env.NODE_ENV === 'development' && {
        details: {
          message: error.message,
          stack: error.stack,
        },
      }),
    });
  }
}
