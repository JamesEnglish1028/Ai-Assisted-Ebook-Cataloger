import { Request, Response, NextFunction } from 'express';
import { parsePdfFile, parseEpubFile } from '../services/fileParser';
import { generateBookAnalysis } from '../services/geminiService';
import { calculateFleschKincaid, calculateGunningFog } from '../services/textAnalysis';

/**
 * Controller to handle book analysis requests
 */
export async function analyzeBook(req: Request, res: Response, next: NextFunction) {
  console.log('🎯 analyzeBook controller called');
  try {
    console.log('📁 Checking for uploaded file...');
    if (!req.file) {
      console.log('❌ No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    console.log('📄 File received:', file.originalname, 'Size:', file.size, 'MimeType:', file.mimetype);
    const isPdf = file.mimetype === 'application/pdf';
    const isEpub = file.mimetype === 'application/epub+zip' || file.originalname.toLowerCase().endsWith('.epub');

    if (!isPdf && !isEpub) {
      console.log('❌ Invalid file type');
      return res.status(400).json({ error: 'Invalid file type. Only PDF and EPUB files are supported.' });
    }

    console.log(`📖 Processing ${isPdf ? 'PDF' : 'EPUB'}: ${file.originalname}`);

    // Parse options from query parameters
    // Default: false (don't extract cover unless explicitly requested)
    const extractCover = req.query.extractCover === 'true';
    const parseOptions = { extractCover };

    console.log('⚙️ Parse options:', parseOptions);

    // Parse the file
    const parseResult = isPdf 
      ? await parsePdfFile(file.buffer, parseOptions)
      : await parseEpubFile(file.buffer, parseOptions);

    if (!parseResult.text.trim()) {
      return res.status(400).json({ 
        error: 'Could not extract text from the file. The file might be image-based or empty.' 
      });
    }

    console.log(`✅ Extracted ${parseResult.text.length} characters from ${file.originalname}`);

    // Calculate reading level metrics
    const fleschKincaid = calculateFleschKincaid(parseResult.text);
    const gunningFog = calculateGunningFog(parseResult.text);

    console.log('🤖 Analyzing with Gemini AI...');

    // Generate AI analysis
    const analysis = await generateBookAnalysis(parseResult.text);

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
    };

    res.json(result);
  } catch (error: any) {
    console.error('Error analyzing book:', error);
    next(error);
  }
}
