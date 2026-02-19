import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import type { PDFParse as PDFParseType } from 'pdf-parse';

export interface FileMetadata {
  title?: string;
  author?: string;
  narrator?: string;
  subject?: string;
  keywords?: string;
  publisher?: string;
  publicationDate?: string;
  language?: string;
  duration?: string;
  durationSeconds?: number;
  audioFormat?: string;
  audioTrackCount?: number;
  mediaType?: string;
  sourceFormat?: 'pdf' | 'epub' | 'audiobook';
  epubVersion?: string;
  pageCount?: {
    value: number;
    type: 'actual' | 'estimated';
  };
  identifier?: {
    value: string;
    source: 'metadata' | 'text';
  };
  accessibilityFeatures?: string[];
  accessModes?: string[];
  accessModesSufficient?: string[];
  hazards?: string[];
  certification?: string;
}

export interface TocItem {
  label: string;
  href: string;
  children: TocItem[];
}

export interface PageListItem {
  label: string;
  pageNumber: string;
}

export interface ParseOptions {
  extractCover?: boolean; // Default: false for API, true for UI
  maxTextLength?: number; // Default: 200000
}

export interface ParseResult {
  text: string;
  coverImageUrl: string | null;
  metadata: FileMetadata;
  toc?: TocItem[] | null;
  pageList?: PageListItem[] | null;
}

// Helper function to find ISBN
const findIsbnInString = (text: string | null | undefined): string | undefined => {
  if (!text) return undefined;
  
  const cleanedText = text.replace(/[-\s]/g, '');
  
  // Look for ISBN-13
  const isbn13Match = cleanedText.match(/(97(8|9)\d{10})/);
  if (isbn13Match) return isbn13Match[0];
  
  // Look for ISBN-10
  const isbn10Match = cleanedText.match(/(\d{9}[\dX])/);
  if (isbn10Match) return isbn10Match[0];
  
  return undefined;
};

// Helper to parse PDF date format
const parsePdfDate = (dateStr: string | null | undefined): string | undefined => {
  if (!dateStr || !dateStr.startsWith('D:')) return undefined;
  const year = dateStr.substring(2, 6);
  const month = dateStr.substring(6, 8);
  const day = dateStr.substring(8, 10);
  if (year && month && day) {
    const parsedDate = new Date(`${year}-${month}-${day}`);
    if (!isNaN(parsedDate.getTime())) {
      return parsedDate.toLocaleDateString();
    }
  }
  return undefined;
};

const toDurationLabel = (seconds: number | undefined): string | undefined => {
  if (!seconds || Number.isNaN(seconds) || seconds <= 0) return undefined;
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = rounded % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
};

const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter((item) => !!item);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return [];
};

const toContributorNames = (value: unknown): string[] => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>;
          return pickLocalizedValue(record.name) || pickLocalizedValue(record);
        }
        return '';
      })
      .filter((item): item is string => !!item);
  }
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (typeof value === 'object' && value !== null) {
    const asRecord = value as Record<string, unknown>;
    const resolved = pickLocalizedValue(asRecord.name) || pickLocalizedValue(asRecord);
    return resolved ? [resolved] : [];
  }
  return [];
};

const pickLocalizedValue = (value: unknown): string | undefined => {
  if (!value) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    if (typeof record.en === 'string' && record.en.trim()) return record.en.trim();
    const firstString = Object.values(record).find((entry) => typeof entry === 'string' && (entry as string).trim());
    if (typeof firstString === 'string') return firstString.trim();
  }
  return undefined;
};

/**
 * Parse a PDF file from a buffer using pdf-parse (Node.js optimized)
 */
export async function parsePdfFile(buffer: Buffer, options: ParseOptions = {}): Promise<ParseResult> {
  const { extractCover = false, maxTextLength = 200000 } = options;
  const PDF_PARSE_TIMEOUT_MS = 30000;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`PDF processing timed out after ${PDF_PARSE_TIMEOUT_MS / 1000} seconds.`));
    }, PDF_PARSE_TIMEOUT_MS);
  });

  const parsingPromise = (async (): Promise<ParseResult> => {
    let parser: PDFParseType | null = null;

    try {
      const pdfParseModule = await import('pdf-parse/node') as {
        PDFParse: new (options: { data: Buffer }) => PDFParseType;
      };
      parser = new pdfParseModule.PDFParse({ data: buffer });

      // Text extraction is required for downstream AI analysis.
      // Metadata extraction is best-effort to avoid rejecting valid PDFs
      // that have malformed/unsupported metadata sections.
      const textResult = await parser.getText();
      let infoResult: Awaited<ReturnType<PDFParseType['getInfo']>> | null = null;
      try {
        infoResult = await parser.getInfo();
      } catch (infoError) {
        console.warn('Could not extract PDF metadata, continuing with text only:', infoError);
      }

      let fullText = (textResult?.text || '').trim();
      const pdfInfo = (infoResult?.info || {}) as Record<string, unknown>;
      const totalPages = infoResult?.total || textResult?.total || 0;

      let foundIdentifier: FileMetadata['identifier'] | undefined;

      for (const value of Object.values(pdfInfo)) {
        if (typeof value === 'string') {
          const isbn = findIsbnInString(value);
          if (isbn) {
            foundIdentifier = { value: isbn, source: 'metadata' };
            break;
          }
        }
      }

      if (!foundIdentifier && Array.isArray(textResult?.pages)) {
        const firstPagesText = textResult.pages
          .slice(0, 5)
          .map(page => page.text)
          .join(' ');

        const isbnMatch = firstPagesText.match(/(?:ISBN|e-ISBN)\s*:?\s*([\d\-X]+)/i);
        const isbn = findIsbnInString(isbnMatch?.[1] || isbnMatch?.[0]);
        if (isbn) {
          foundIdentifier = { value: isbn, source: 'text' };
        }
      }

      let coverImageUrl: string | null = null;
      if (extractCover && totalPages > 0) {
        try {
          const screenshot = await parser.getScreenshot({
            first: 1,
            imageBuffer: false,
            imageDataUrl: true,
            desiredWidth: 600,
          });
          coverImageUrl = screenshot.pages[0]?.dataUrl || null;
        } catch (coverError) {
          // Cover extraction is optional; parsing should still succeed without it.
          console.warn('Could not extract PDF cover image, continuing without cover:', coverError);
        }
      }

      if (fullText.length > maxTextLength) {
        console.warn(`PDF text truncated to ${maxTextLength} characters.`);
        fullText = fullText.substring(0, maxTextLength);
      }

      const metadata: FileMetadata = {
        sourceFormat: 'pdf',
        title: (pdfInfo.Title as string) || undefined,
        author: (pdfInfo.Author as string) || undefined,
        subject: (pdfInfo.Subject as string) || undefined,
        keywords: (pdfInfo.Keywords as string) || undefined,
        publisher: (pdfInfo.Producer as string) || undefined,
        publicationDate: parsePdfDate(pdfInfo.CreationDate as string | undefined),
        identifier: foundIdentifier,
        pageCount: {
          value: totalPages,
          type: 'actual',
        },
      };

      return { text: fullText, coverImageUrl, metadata, toc: null, pageList: null };
    } catch (error: any) {
      const rawMessage = String(error?.message || '');
      console.error('Error parsing PDF:', rawMessage);

      if (rawMessage.includes('PasswordException') || /password-protected/i.test(rawMessage)) {
        throw new Error('Failed to parse PDF: The file is password-protected.');
      }
      if (
        rawMessage.includes('InvalidPDFException') ||
        /invalid|corrupt|malformed/i.test(rawMessage)
      ) {
        throw new Error('Failed to parse PDF: The file is invalid or corrupted.');
      }
      if (/worker/i.test(rawMessage)) {
        throw new Error('Failed to parse PDF due to a PDF worker initialization error on the server.');
      }

      throw new Error('Failed to parse the PDF. The file may be corrupted or in an unsupported format.');
    } finally {
      if (parser) {
        await parser.destroy().catch((destroyError) => {
          console.warn('Failed to destroy PDF parser cleanly:', destroyError);
        });
      }
    }
  })();

  try {
    return await Promise.race([parsingPromise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Parse audiobook media (RWPM .audiobook packages and standalone audio files).
 * Phase 1 is metadata-first and does not transcribe audio content yet.
 */
export async function parseAudioFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const { extractCover = false, maxTextLength = 200000 } = options;
  const AUDIO_PARSE_TIMEOUT_MS = 30000;
  const lowerName = originalName.toLowerCase();

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Audio processing timed out after ${AUDIO_PARSE_TIMEOUT_MS / 1000} seconds.`));
    }, AUDIO_PARSE_TIMEOUT_MS);
  });

  const parsingPromise = (async (): Promise<ParseResult> => {
    let coverImageUrl: string | null = null;
    const metadata: FileMetadata = {
      sourceFormat: 'audiobook',
      mediaType: mimeType || undefined,
      audioFormat: mimeType || undefined,
    };

    const textSegments: string[] = [];

    // RWPM Audiobook package parsing
    if (mimeType === 'application/audiobook+zip' || lowerName.endsWith('.audiobook')) {
      const zip = await JSZip.loadAsync(buffer);
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        throw new Error('RWPM audiobook package is missing manifest.json.');
      }

      const manifestRaw = await manifestFile.async('string');
      let manifest: any;
      try {
        manifest = JSON.parse(manifestRaw);
      } catch {
        throw new Error('RWPM manifest.json is not valid JSON.');
      }

      const contributors = toContributorNames(manifest?.metadata?.author || manifest?.author);
      const narratorCandidates = toContributorNames(manifest?.metadata?.readBy || manifest?.readBy);
      const subjects = toStringArray(manifest?.subject);
      const keywords = toStringArray(manifest?.keywords);
      const readingOrder = Array.isArray(manifest?.readingOrder) ? manifest.readingOrder : [];
      const resources = Array.isArray(manifest?.resources) ? manifest.resources : [];
      const links = Array.isArray(manifest?.links) ? manifest.links : [];

      const durationSeconds = typeof manifest?.duration === 'number' ? manifest.duration : undefined;
      const durationLabel = toDurationLabel(durationSeconds);

      metadata.title = pickLocalizedValue(manifest?.metadata?.title) || pickLocalizedValue(manifest?.title) || originalName.replace(/\.[^.]+$/, '');
      metadata.author = contributors.length > 0 ? contributors.join(', ') : pickLocalizedValue(manifest?.metadata?.author);
      metadata.narrator = narratorCandidates.length > 0 ? narratorCandidates.join(', ') : undefined;
      metadata.publisher = pickLocalizedValue(manifest?.metadata?.publisher) || pickLocalizedValue(manifest?.publisher);
      metadata.language = pickLocalizedValue(manifest?.metadata?.language) || pickLocalizedValue(manifest?.language);
      metadata.publicationDate = pickLocalizedValue(manifest?.metadata?.published) || pickLocalizedValue(manifest?.published);
      metadata.subject = subjects.length > 0 ? subjects.join('; ') : undefined;
      metadata.keywords = keywords.length > 0 ? keywords.join('; ') : undefined;
      metadata.durationSeconds = durationSeconds;
      metadata.duration = durationLabel;
      metadata.audioTrackCount = readingOrder.length || undefined;
      metadata.identifier = (() => {
        const id = pickLocalizedValue(manifest?.metadata?.identifier) || pickLocalizedValue(manifest?.identifier);
        return id ? { value: id, source: 'metadata' as const } : undefined;
      })();

      if (extractCover) {
        const coverHref = [...links, ...resources, ...readingOrder]
          .find((entry: any) => {
            const rel = Array.isArray(entry?.rel) ? entry.rel : (typeof entry?.rel === 'string' ? [entry.rel] : []);
            return rel.includes('cover') || rel.includes('http://opds-spec.org/image');
          })?.href;

        if (typeof coverHref === 'string' && coverHref.trim()) {
          const coverFile = zip.file(coverHref.replace(/^\.\//, ''));
          if (coverFile) {
            const imageBuffer = await coverFile.async('nodebuffer');
            const mediaType = coverHref.endsWith('.png') ? 'image/png' : 'image/jpeg';
            coverImageUrl = `data:${mediaType};base64,${imageBuffer.toString('base64')}`;
          }
        }
      }

      const chapterLabels = readingOrder
        .map((entry: any) => pickLocalizedValue(entry?.title))
        .filter((entry: string | undefined): entry is string => !!entry);

      textSegments.push(
        `Audiobook title: ${metadata.title || 'Unknown title'}`,
        metadata.author ? `Author: ${metadata.author}` : '',
        metadata.narrator ? `Narrator: ${metadata.narrator}` : '',
        metadata.publisher ? `Publisher: ${metadata.publisher}` : '',
        metadata.language ? `Language: ${metadata.language}` : '',
        metadata.duration ? `Duration: ${metadata.duration}` : '',
        metadata.subject ? `Subjects: ${metadata.subject}` : '',
        metadata.keywords ? `Keywords: ${metadata.keywords}` : '',
        chapterLabels.length ? `Chapters/Tracks: ${chapterLabels.join('; ')}` : '',
      );
    } else {
      // Standalone audio metadata fallback (without transcription in Phase 1)
      metadata.title = originalName.replace(/\.[^.]+$/, '');
      metadata.audioFormat = mimeType || (lowerName.endsWith('.m4b') ? 'audio/mp4' : undefined);
      metadata.mediaType = mimeType || undefined;
      metadata.audioTrackCount = 1;

      textSegments.push(
        `Audiobook file title: ${metadata.title}`,
        `Detected audio format: ${metadata.audioFormat || 'unknown'}`,
        `Original filename: ${originalName}`,
      );
    }

    let analysisText = textSegments.filter(Boolean).join('\n');
    if (!analysisText.trim()) {
      analysisText = `Audiobook file: ${originalName}`;
    }
    if (analysisText.length > maxTextLength) {
      analysisText = analysisText.substring(0, maxTextLength);
    }

    return {
      text: analysisText,
      coverImageUrl,
      metadata,
      toc: null,
      pageList: null,
    };
  })();

  return Promise.race([parsingPromise, timeoutPromise]);
}

/**
 * Parse an EPUB file from a buffer
 */
export async function parseEpubFile(buffer: Buffer, options: ParseOptions = {}): Promise<ParseResult> {
  const { extractCover = false, maxTextLength = 200000 } = options; // Default false - must explicitly request
  const EPUB_PARSE_TIMEOUT_MS = 30000;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`EPUB processing timed out after ${EPUB_PARSE_TIMEOUT_MS / 1000} seconds.`));
    }, EPUB_PARSE_TIMEOUT_MS);
  });
  
  const parsingPromise = (async (): Promise<ParseResult> => {
    try {
      console.log('📚 Starting EPUB parsing, buffer size:', buffer.length, 'bytes');
      const zip = await JSZip.loadAsync(buffer);
      console.log('✅ EPUB zip loaded successfully');
      let coverImageUrl: string | null = null;
      let ncxPath: string | undefined;
      
      // Find OPF file
      console.log('🔍 Looking for META-INF/container.xml...');
      const containerFile = zip.file("META-INF/container.xml");
      console.log('📄 Container file found:', !!containerFile);
      if (!containerFile) {
        console.error('❌ META-INF/container.xml not found in EPUB');
        throw new Error("META-INF/container.xml not found in EPUB.");
      }
      
      const containerXmlText = await containerFile.async("string");
      const parser = new DOMParser();
      const containerDoc = parser.parseFromString(containerXmlText, "application/xml");
      const opfPath = containerDoc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
      if (!opfPath) throw new Error("Could not find OPF file path in container.xml.");
      
      const opfDirectory = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
      const opfFile = zip.file(opfPath);
      if (!opfFile) throw new Error("OPF file not found at path: " + opfPath);
      
      const opfXmlText = await opfFile.async("string");
      const opfDoc = parser.parseFromString(opfXmlText, "application/xml");
      
      const packageElement = opfDoc.getElementsByTagName("package")[0];
      const epubVersion = packageElement?.getAttribute("version") || undefined;
      
      // Extract metadata
      const getDcElement = (name: string): string | undefined => {
        const element = opfDoc.getElementsByTagName(`dc:${name}`)[0];
        return element?.textContent?.trim() || undefined;
      };
      
      const getMetaPropertyValues = (name: string): string[] => {
        const elements = opfDoc.getElementsByTagName("meta");
        const values: string[] = [];
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          if (el.getAttribute("property") === name) {
            const content = el.textContent?.trim();
            if (content) values.push(content);
          }
        }
        return values;
      };
      
      const manifest = new Map<string, { href: string; mediaType: string }>();
      const manifestItems = opfDoc.getElementsByTagName("item");
      for (let i = 0; i < manifestItems.length; i++) {
        const item = manifestItems[i];
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        const mediaType = item.getAttribute("media-type");
        if (id && href && mediaType) {
          const fullHref = opfDirectory + href;
          manifest.set(id, { href: fullHref, mediaType });
          if (mediaType === 'application/x-dtbncx+xml') {
            ncxPath = fullHref;
          }
        }
      }
      
      // Extract text content
      const spineItems = opfDoc.getElementsByTagName("itemref");
      const contentPromises: Promise<string>[] = [];
      
      for (let i = 0; i < spineItems.length; i++) {
        const idref = spineItems[i].getAttribute("idref");
        if (idref) {
          const item = manifest.get(idref);
          if (item && item.href) {
            const chapterFile = zip.file(item.href);
            if (chapterFile) {
              contentPromises.push(
                chapterFile.async("string").then(chapterHtml => {
                  const chapterDoc = parser.parseFromString(chapterHtml, 'application/xhtml+xml');
                  const body = chapterDoc.documentElement.getElementsByTagName('body')[0];
                  return body ? (body.textContent || '').trim().replace(/\s+/g, ' ') : '';
                })
              );
            }
          }
        }
      }
      
      const chaptersText = await Promise.all(contentPromises);
      let fullText = chaptersText.join('\n\n');
      
      // Calculate page count
      const pageCount = await (async (): Promise<FileMetadata['pageCount']> => {
        if (ncxPath) {
          const ncxFile = zip.file(ncxPath);
          if (ncxFile) {
            try {
              const ncxXmlText = await ncxFile.async("string");
              const ncxDoc = parser.parseFromString(ncxXmlText, "application/xml");
              const pageLists = ncxDoc.getElementsByTagName("pageList");
              if (pageLists.length > 0) {
                const pageList = pageLists[0];
                const pageTargets = pageList.getElementsByTagName("pageTarget");
                let maxPage = 0;
                for (let i = 0; i < pageTargets.length; i++) {
                  const target = pageTargets[i];
                  const value = target.getAttribute("value") || target.getAttribute("playOrder");
                  if (value) {
                    const pageNum = parseInt(value, 10);
                    if (!isNaN(pageNum) && pageNum > maxPage) {
                      maxPage = pageNum;
                    }
                  }
                }
                if (maxPage > 0) return { value: maxPage, type: 'actual' };
              }
            } catch (e) {
              console.warn("Could not parse NCX pagelist", e);
            }
          }
        }
        
        // Look for schema:numberOfPages in meta elements
        const metas = opfDoc.getElementsByTagName('meta');
        for (let i = 0; i < metas.length; i++) {
          if (metas[i].getAttribute('property') === 'schema:numberOfPages') {
            const pageStr = metas[i].textContent?.trim();
            if (pageStr) {
              const pages = parseInt(pageStr, 10);
              if (!isNaN(pages)) return { value: pages, type: 'actual' };
            }
            break;
          }
        }
        
        const CHARS_PER_PAGE = 1500;
        const estimatedPages = Math.round(fullText.length / CHARS_PER_PAGE);
        return { value: estimatedPages > 0 ? estimatedPages : 1, type: 'estimated' };
      })();
      
      // Extract TOC and page list
      let toc: TocItem[] | null = null;
      let pageList: PageListItem[] | null = null;
      
      console.log('📚 Starting TOC extraction...');
      
      try {
        const navManifestItem = Array.from(manifestItems).find((item: any) => 
          item.getAttribute('properties')?.split(' ').includes('nav')
        );
        
        console.log('📖 Nav manifest item found:', !!navManifestItem);
        
        if (navManifestItem) {
          const navId = navManifestItem.getAttribute('id');
          console.log('📖 Nav ID:', navId);
          if (navId) {
            const navPath = manifest.get(navId)?.href;
            console.log('📖 Nav path:', navPath);
            if (navPath) {
              const navFile = zip.file(navPath);
              console.log('📖 Nav file found:', !!navFile);
              if (navFile) {
                const navHtmlText = await navFile.async('string');
                const navDoc = parser.parseFromString(navHtmlText, 'application/xhtml+xml');
                console.log('📖 Nav doc parsed successfully');
                
                let tocNav: any = null;
                const navElements = navDoc.getElementsByTagName('nav');
                console.log('📖 Found nav elements:', navElements.length);
                for (let i = 0; i < navElements.length; i++) {
                  const navEl = navElements[i];
                  const epubType = navEl.getAttribute('epub:type');
                  console.log('📖 Nav element', i, 'epub:type:', epubType);
                  if (epubType && epubType.toLowerCase() === 'toc') {
                    tocNav = navEl;
                    break;
                  }
                }
                
                console.log('📖 TOC nav found:', !!tocNav);
                
                if (tocNav) {
                  // Find first <ol> element
                  let tocOl = null;
                  const olElements = tocNav.getElementsByTagName('ol');
                  if (olElements.length > 0) {
                    tocOl = olElements[0];
                  }
                  
                  if (tocOl) {
                    const parseNavList = (listElement: any): TocItem[] => {
                      const items: TocItem[] = [];
                      const children = Array.from(listElement.childNodes);
                      for (const child of children) {
                        const childEl = child as any;
                        if (childEl.tagName && childEl.tagName.toLowerCase() === 'li') {
                          // Find first <a> element in this <li>
                          let anchor = null;
                          const anchors = childEl.getElementsByTagName('a');
                          if (anchors.length > 0) {
                            anchor = anchors[0];
                          }
                          
                          if (anchor) {
                            const label = anchor.textContent?.trim() || '';
                            const href = anchor.getAttribute('href') || '';
                            
                            // Find nested <ol> element
                            let nestedOl = null;
                            const nestedOls = childEl.getElementsByTagName('ol');
                            if (nestedOls.length > 0) {
                              nestedOl = nestedOls[0];
                            }
                            
                            items.push({
                              label,
                              href,
                              children: nestedOl ? parseNavList(nestedOl) : [],
                            });
                          }
                        }
                      }
                      return items;
                    };
                    toc = parseNavList(tocOl);
                  }
                }
              }
            }
          }
        } else if (ncxPath) {
          const ncxFile = zip.file(ncxPath);
          if (ncxFile) {
            const ncxXmlText = await ncxFile.async("string");
            const ncxDoc = parser.parseFromString(ncxXmlText, "application/xml");
            
            // Find navMap element
            const navMapElements = ncxDoc.getElementsByTagName("navMap");
            const navMap = navMapElements.length > 0 ? navMapElements[0] : null;
            
            if (navMap) {
              const parseNavPoints = (parentElement: any): TocItem[] => {
                const items: TocItem[] = [];
                const children = Array.from(parentElement.childNodes);
                for (const child of children) {
                  const childEl = child as any;
                  if (childEl.tagName && childEl.tagName.toLowerCase() === 'navpoint') {
                    // Find navLabel > text
                    let labelEl = null;
                    const navLabels = childEl.getElementsByTagName('navLabel');
                    if (navLabels.length > 0) {
                      const textElements = navLabels[0].getElementsByTagName('text');
                      if (textElements.length > 0) {
                        labelEl = textElements[0];
                      }
                    }
                    
                    // Find content element
                    let contentEl = null;
                    const contentElements = childEl.getElementsByTagName('content');
                    if (contentElements.length > 0) {
                      contentEl = contentElements[0];
                    }
                    
                    if (labelEl && contentEl) {
                      const label = labelEl.textContent?.trim() || '';
                      const href = contentEl.getAttribute('src') || '';
                      items.push({
                        label,
                        href,
                        children: parseNavPoints(childEl),
                      });
                    }
                  }
                }
                return items;
              };
              toc = parseNavPoints(navMap);
            }
            
            const pageListEls = ncxDoc.getElementsByTagName("pageList");
            if (pageListEls.length > 0) {
              const pageListEl = pageListEls[0];
              const pageTargets = pageListEl.getElementsByTagName("pageTarget");
              const extractedPages: PageListItem[] = [];
              for (let i = 0; i < pageTargets.length; i++) {
                const target = pageTargets[i];
                const navLabels = target.getElementsByTagName("navLabel");
                let label = '';
                if (navLabels.length > 0) {
                  const textEls = navLabels[0].getElementsByTagName("text");
                  if (textEls.length > 0) {
                    label = textEls[0].textContent?.trim() || '';
                  }
                }
                const pageNumber = target.getAttribute("value") || '';
                if (label && pageNumber) {
                  extractedPages.push({ label, pageNumber });
                }
              }
              
              if (extractedPages.length > 0) {
                pageList = extractedPages;
              }
            }
          }
        }
      } catch (tocError) {
        console.warn("Could not parse Table of Contents:", tocError);
      }
      
      const metadata: FileMetadata = {
        sourceFormat: 'epub',
        title: getDcElement('title'),
        author: getDcElement('creator'),
        subject: getDcElement('subject'),
        publisher: getDcElement('publisher'),
        publicationDate: (() => {
          const dateStr = getDcElement('date');
          if (!dateStr) return undefined;
          try {
            return new Date(dateStr).toLocaleDateString();
          } catch {
            return dateStr;
          }
        })(),
        epubVersion: epubVersion,
        pageCount: pageCount,
        identifier: (() => {
          const identifiers = opfDoc.getElementsByTagName('dc:identifier');
          let foundIsbn: string | undefined;
          let firstIdentifier: string | undefined;
          
          for (let i = 0; i < identifiers.length; i++) {
            const el = identifiers[i];
            const idText = el.textContent?.trim();
            if (!firstIdentifier && idText) {
              firstIdentifier = idText;
            }
            const scheme = el.getAttribute('opf:scheme') || el.getAttribute('scheme');
            if (scheme === 'ISBN' && idText) {
              foundIsbn = idText;
              break;
            }
          }
          const isbnToUse = findIsbnInString(foundIsbn || firstIdentifier);
          return isbnToUse ? { value: isbnToUse, source: 'metadata' } : undefined;
        })(),
        accessibilityFeatures: getMetaPropertyValues('schema:accessibilityFeature'),
        accessModes: getMetaPropertyValues('schema:accessMode'),
        accessModesSufficient: getMetaPropertyValues('schema:accessModeSufficient'),
        hazards: getMetaPropertyValues('schema:accessibilityHazard'),
        certification: (() => {
          const metas = opfDoc.getElementsByTagName('meta');
          for (let i = 0; i < metas.length; i++) {
            if (metas[i].getAttribute('property') === 'dcterms:conformsTo') {
              return metas[i].textContent?.trim();
            }
          }
          return undefined;
        })(),
      };
      
      // Find cover image (if requested)
      if (extractCover) {
        let coverId: string | null = null;
        const metas = opfDoc.getElementsByTagName('meta');
        for (let i = 0; i < metas.length; i++) {
          if (metas[i].getAttribute('name') === 'cover') {
            coverId = metas[i].getAttribute('content');
            break;
          }
        }
        
        if (!coverId) {
          // Look for cover-image in manifest items
          for (const [id, item] of manifest) {
            if (manifestItems) {
              for (let i = 0; i < manifestItems.length; i++) {
                const el = manifestItems[i];
                if (el.getAttribute('id') === id) {
                  const props = el.getAttribute('properties') || '';
                  if (props.includes('cover-image')) {
                    coverId = id;
                    break;
                  }
                }
              }
            }
            if (coverId) break;
          }
        }
        
        if (coverId) {
          const coverItem = manifest.get(coverId);
          if (coverItem) {
            const coverFile = zip.file(coverItem.href);
            if (coverFile) {
              const imageBuffer = await coverFile.async('nodebuffer');
              coverImageUrl = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            }
          }
        }
      }
      
      if (fullText.length > maxTextLength) {
        console.warn(`EPUB text truncated to ${maxTextLength} characters.`);
        fullText = fullText.substring(0, maxTextLength);
      }
      
      return { text: fullText, coverImageUrl, metadata, toc, pageList };
    } catch (error: any) {
      console.error("Error parsing EPUB:", error);
      throw new Error("Failed to parse the EPUB. The file may be corrupted, DRM-protected, or in an unsupported format.");
    }
  })();
  
  return Promise.race([parsingPromise, timeoutPromise]);
}
