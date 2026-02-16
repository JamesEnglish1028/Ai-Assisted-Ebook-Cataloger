import React, { useState, useCallback, useEffect, useRef } from 'react';
import { FileUpload } from './components/FileUpload';
import { Loader } from './components/Loader';
import { SummaryDisplay } from './components/SummaryDisplay';
import { ErrorMessage } from './components/ErrorMessage';
import { MetadataDisplay, FileMetadata } from './components/MetadataDisplay';
import { TableOfContentsDisplay, TocItem, PageListItem } from './components/TableOfContentsDisplay';
import { ExportButton } from './components/ExportButton';
import { HowToGuideModal } from './components/HowToGuideModal';
import { calculateFleschKincaid, calculateGunningFog } from './utils/textAnalysis';
import { convertPdfToMarkdown, PdfConversionCancelledError, PdfMdProgress } from './services/extract2mdService';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;


type Status = 'idle' | 'parsing' | 'summarizing' | 'success' | 'error';
type FileType = 'pdf' | 'epub';
type AIProvider = 'google' | 'openai' | 'anthropic';
type PdfWorkflow = 'server-parser' | 'browser-text';
type PdfMdMode = 'quick' | 'ocr';
type ToastLevel = 'info' | 'success' | 'error';

type OmittedMetadata = 'lcc' | 'bisac' | 'lcsh' | 'fieldOfStudy' | 'discipline' | 'readingLevel' | 'gunningFog';

type ParseResult = {
    text: string;
    coverImageUrl: string | null;
    metadata: Omit<FileMetadata, OmittedMetadata>;
    toc?: TocItem[] | null;
    pageList?: PageListItem[] | null;
};

type ToastMessage = {
  id: number;
  message: string;
  level: ToastLevel;
};

const statusMessages: Record<Status, string> = {
  idle: '',
  parsing: 'Parsing your ebook... This may take a moment for large files.',
  summarizing: 'Analyzing and classifying with AI...',
  success: 'Analysis generated!',
  error: 'An error occurred.',
};

const AI_PROVIDER_OPTIONS: Array<{ value: AIProvider; label: string }> = [
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
];

const AI_MODEL_OPTIONS: Record<AIProvider, string[]> = {
  google: ['gemini-2.5-flash', 'gemini-2.5-pro'],
  openai: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini'],
  anthropic: ['claude-3-5-haiku-latest', 'claude-3-7-sonnet-latest'],
};

const PDF_WORKFLOW_OPTIONS: Array<{ value: PdfWorkflow; label: string }> = [
  { value: 'server-parser', label: 'Server Parser (Current)' },
  { value: 'browser-text', label: 'Browser Text -> AI (Incremental)' },
];

const PDF_MD_MODE_OPTIONS: Array<{ value: PdfMdMode; label: string }> = [
  { value: 'quick', label: 'Fast (PDF text layer)' },
  { value: 'ocr', label: 'High Accuracy OCR (slower)' },
];


// Helper function to find a valid ISBN-10 or ISBN-13 from a string.
const findIsbnInString = (text: string | null | undefined): string | undefined => {
    if (!text) return undefined;
    
    // Loosely look for isbn-like patterns. Normalize by removing hyphens and spaces.
    const cleanedText = text.replace(/[-\s]/g, '');

    // Look for ISBN-13 (13 digits starting with 978 or 979)
    const isbn13Match = cleanedText.match(/(97(8|9)\d{10})/);
    if (isbn13Match) return isbn13Match[0];

    // Look for ISBN-10 (10 digits, last can be X)
    const isbn10Match = cleanedText.match(/(\d{9}[\dX])/);
    if (isbn10Match) return isbn10Match[0];

    return undefined;
};


export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [fileType, setFileType] = useState<FileType>('pdf');
  const [pdfWorkflow, setPdfWorkflow] = useState<PdfWorkflow>('server-parser');
  const [pdfMdMode, setPdfMdMode] = useState<PdfMdMode>('quick');
  const [enableOcrFallback, setEnableOcrFallback] = useState<boolean>(true);
  const [pdfConversionProgress, setPdfConversionProgress] = useState<number>(0);
  const [pdfConversionMessage, setPdfConversionMessage] = useState<string>('');
  const [aiProvider, setAiProvider] = useState<AIProvider>('google');
  const [aiModel, setAiModel] = useState<string>(AI_MODEL_OPTIONS.google[0]);
  const [status, setStatus] = useState<Status>('idle');
  const [summary, setSummary] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [tableOfContents, setTableOfContents] = useState<TocItem[] | null>(null);
  const [pageList, setPageList] = useState<PageListItem[] | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isPdfWorkflowInfoOpen, setIsPdfWorkflowInfoOpen] = useState<boolean>(false);
  const [isAiProviderInfoOpen, setIsAiProviderInfoOpen] = useState<boolean>(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const activeConversionAbortRef = useRef<AbortController | null>(null);
  const toastIdRef = useRef(0);
  const toastTimeoutsRef = useRef<number[]>([]);
  const isDark = false;

  useEffect(() => {
    return () => {
      if (coverImageUrl && coverImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(coverImageUrl);
      }
    };
  }, [coverImageUrl]);

  useEffect(() => {
    return () => {
      activeConversionAbortRef.current?.abort();
      toastTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
      toastTimeoutsRef.current = [];
    };
  }, []);

  const pushToast = useCallback((message: string, level: ToastLevel = 'info') => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, level }]);
    const timeoutId = window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 4200);
    toastTimeoutsRef.current.push(timeoutId);
  }, []);

  useEffect(() => {
    const models = AI_MODEL_OPTIONS[aiProvider];
    if (!models.includes(aiModel)) {
      setAiModel(models[0]);
    }
  }, [aiProvider, aiModel]);


  const handleFileTypeChange = (newType: FileType) => {
    if (fileType !== newType) {
      setFileType(newType);
      setFile(null); // Reset file when type changes
      setErrorMessage('');
      setSummary('');
      setCoverImageUrl(null);
      setMetadata(null);
      setTableOfContents(null);
      setPageList(null);
      setStatus('idle');
      setPdfConversionProgress(0);
      setPdfConversionMessage('');
    }
  };

  const handleFileChange = (selectedFile: File | null) => {
    if (selectedFile) {
        const isPdf = selectedFile.type === 'application/pdf' && fileType === 'pdf';
        // EPUB mime type can be inconsistent, so check extension too
        const isEpub = (selectedFile.type === 'application/epub+zip' || selectedFile.name.toLowerCase().endsWith('.epub')) && fileType === 'epub';

        if (isPdf || isEpub) {
            setFile(selectedFile);
            setStatus('idle');
            setSummary('');
            setCoverImageUrl(null);
            setMetadata(null);
            setTableOfContents(null);
            setPageList(null);
            setErrorMessage('');
            setPdfConversionProgress(0);
            setPdfConversionMessage('');
        } else {
            setErrorMessage(`Invalid file type. Expected a ${fileType.toUpperCase()} file.`);
            setStatus('error');
            setFile(null);
        }
    } else {
        setFile(null);
    }
  };

  const parsePdfDate = (dateStr: string | null | undefined): string | undefined => {
      if (!dateStr || !dateStr.startsWith('D:')) return undefined;
      // D:YYYYMMDD...
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
  
  const parsePdf = (fileToParse: File): Promise<ParseResult> => {
    const PDF_PARSE_TIMEOUT_MS = 30000; // 30 seconds

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`PDF processing timed out after ${PDF_PARSE_TIMEOUT_MS / 1000} seconds. The file might be too large or complex.`));
      }, PDF_PARSE_TIMEOUT_MS);
    });

    const parsingPromise = (async (): Promise<ParseResult> => {
      try {
        const arrayBuffer = await fileToParse.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const numPages = pdf.numPages;
        let fullText = '';
        let coverImageUrl: string | null = null;
        let foundIdentifier: FileMetadata['identifier'] | undefined = undefined;
        let textFoundAuthor: string | undefined = undefined;
        let textFoundPublisher: string | undefined = undefined;
        
        // --- High-priority search: Scan first 5 pages of text for metadata ---
        const pagesToScan = Math.min(5, numPages);
        for (let i = 1; i <= pagesToScan; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');

            // Find ISBN
            if (!foundIdentifier) {
                const isbnMatch = pageText.match(/(?:ISBN|e-ISBN)\s*:?\s*([\d\-X]+)/i);
                if (isbnMatch && isbnMatch[1]) {
                    const isbn = findIsbnInString(isbnMatch[1]);
                    if (isbn) {
                        foundIdentifier = { value: isbn, source: 'text' };
                    }
                }
            }

            // Find Author/Editor
            if (!textFoundAuthor) {
                // This regex is intentionally case-sensitive on the name part to avoid matching common phrases.
                const authorMatch = pageText.match(/(?:[Bb]y|[Aa]uthor(?:s)?|[Ww]ritten [Bb]y)\s*:?\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)*)/);
                if (authorMatch && authorMatch[1]) {
                    const potentialAuthor = authorMatch[1].trim();
                    if (potentialAuthor.length < 70) { // Basic sanity check
                        textFoundAuthor = potentialAuthor;
                    }
                }
            }
            
            // Find Publisher
            if (!textFoundPublisher) {
                // Prioritize copyright line for publisher info
                const copyrightMatch = pageText.match(/(?:©|\(c\))\s*\d{4}\s*([^\n\r]+)/i);
                if (copyrightMatch && copyrightMatch[1]) {
                    const copyrightLine = copyrightMatch[1].trim();
                    // If the line starts with "by", it's an author, not a publisher.
                    if (!copyrightLine.toLowerCase().startsWith('by ')) {
                         if (!/author/i.test(copyrightLine) && copyrightLine.length < 100) {
                            textFoundPublisher = copyrightLine;
                        }
                    }
                }

                // Fallback to searching for publisher keywords
                if (!textFoundPublisher) {
                    const publisherKeywords = ['Press', 'Publishing', 'Books', 'Group', 'Inc', 'LLC', 'Ltd', 'Publications', 'University'];
                    // We check the full page text, as publisher info can be anywhere
                    if (publisherKeywords.some(keyword => pageText.includes(keyword))) {
                        // A simple heuristic: find a line containing a keyword.
                        const lines = pageText.split(/(?:\.|\n)/); // split by sentence or line
                        for (const line of lines) {
                            if (publisherKeywords.some(keyword => line.includes(keyword))) {
                                if (!/author|by/i.test(line) && line.trim().length < 100 && line.trim().length > 3) {
                                    textFoundPublisher = line.trim();
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (foundIdentifier && textFoundAuthor && textFoundPublisher) {
                break;
            }
        }
        
        // Extract metadata from file properties as a fallback
        const { info } = await pdf.getMetadata();
        const pdfInfo = info as any; // Type assertion for PDF metadata

        // --- Fallback search: Look in metadata if not found in text ---
        if (!foundIdentifier) {
            for (const value of Object.values(pdfInfo)) {
                if (typeof value === 'string') {
                    const isbn = findIsbnInString(value);
                    if (isbn) {
                        foundIdentifier = { value: isbn, source: 'metadata' };
                        break;
                    }
                }
            }
        }

        const metadata: Omit<FileMetadata, OmittedMetadata> = {
            title: pdfInfo.Title || undefined,
            author: textFoundAuthor || pdfInfo.Author || undefined,
            subject: pdfInfo.Subject || undefined,
            keywords: pdfInfo.Keywords || undefined,
            publisher: textFoundPublisher || pdfInfo.Producer || undefined,
            publicationDate: parsePdfDate(pdfInfo.CreationDate),
            identifier: foundIdentifier,
            pageCount: { value: numPages, type: 'actual' },
        };

        // Try to extract the first page as a cover image
        if (numPages > 0) {
            try {
                const coverPage = await pdf.getPage(1);
                const viewport = coverPage.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                if (context) {
                    await coverPage.render({ canvasContext: context, viewport: viewport, canvas: canvas } as any).promise;
                    coverImageUrl = canvas.toDataURL('image/jpeg', 0.8);
                }
            } catch (coverError) {
                console.warn("Could not extract cover image from PDF:", coverError);
            }
        }
        
        // Extract text content from all pages
        for (let i = 1; i <= numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(' ');
          fullText += pageText + '\n\n';
        }
        
        const maxChars = 200000; 
        if (fullText.length > maxChars) {
          console.warn(`PDF text truncated to ${maxChars} characters for API request.`);
          fullText = fullText.substring(0, maxChars);
        }
        
        return { text: fullText, coverImageUrl, metadata };
      } catch (error: any) {
          console.error("Error parsing PDF:", error);
          if (error.name === 'PasswordException') {
            throw new Error('Failed to parse PDF: The file is password-protected.');
          } else if (error.name === 'InvalidPDFException') {
            throw new Error('Failed to parse PDF: The file is invalid or corrupted.');
          }
          throw new Error('Failed to parse the PDF. The file may be corrupted or in an unsupported format.');
      }
    })();
    
    return Promise.race([parsingPromise, timeoutPromise]);
  };

  const extractPdfCoverImage = async (fileToParse: File): Promise<string | null> => {
    try {
      const arrayBuffer = await fileToParse.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
      if (pdf.numPages < 1) {
        return null;
      }

      const coverPage = await pdf.getPage(1);
      const viewport = coverPage.getViewport({ scale: 1.3 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        return null;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await coverPage.render({ canvasContext: context, viewport, canvas } as any).promise;
      return canvas.toDataURL('image/jpeg', 0.82);
    } catch (error) {
      console.warn('Could not extract PDF cover image in browser workflow:', error);
      return null;
    }
  };

  const parseEpub = (fileToParse: File): Promise<ParseResult> => {
    const EPUB_PARSE_TIMEOUT_MS = 30000;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`EPUB processing timed out after ${EPUB_PARSE_TIMEOUT_MS / 1000} seconds.`));
      }, EPUB_PARSE_TIMEOUT_MS);
    });

    const parsingPromise = (async (): Promise<ParseResult> => {
      try {
        const zip = await JSZip.loadAsync(fileToParse);
        let coverImageUrl: string | null = null;
        let ncxPath: string | undefined;

        // Find OPF file path from container.xml
        const containerFile = zip.file("META-INF/container.xml");
        if (!containerFile) throw new Error("META-INF/container.xml not found in EPUB.");
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

        // Get EPUB version from package element
        const packageElement = opfDoc.getElementsByTagName("package")[0];
        const epubVersion = packageElement?.getAttribute("version") || undefined;

        // Extract metadata
        const getDcElement = (name: string): string | undefined => {
            const element = opfDoc.getElementsByTagName(`dc:${name}`)[0];
            return element?.textContent?.trim() || undefined;
        }

        const getMetaPropertyValues = (name: string): string[] => {
            const elements = opfDoc.querySelectorAll(`meta[property="${name}"]`);
            const values: string[] = [];
            elements.forEach(el => {
                const content = el.textContent?.trim();
                if (content) values.push(content);
            });
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
                                const body = chapterDoc.body;
                                return body ? (body.textContent || '').trim().replace(/\s+/g, ' ') : '';
                            })
                        );
                    }
                }
            }
        }

        const chaptersText = await Promise.all(contentPromises);
        let fullText = chaptersText.join('\n\n');

        const pageCount = await (async (): Promise<FileMetadata['pageCount']> => {
            // 1. Try to find highest page number from pagelist in NCX
            if (ncxPath) {
                const ncxFile = zip.file(ncxPath);
                if (ncxFile) {
                    try {
                        const ncxXmlText = await ncxFile.async("string");
                        const ncxDoc = parser.parseFromString(ncxXmlText, "application/xml");
                        const pageList = ncxDoc.querySelector("pageList");
                        if (pageList) {
                            const pageTargets = pageList.querySelectorAll("pageTarget");
                            let maxPage = 0;
                            pageTargets.forEach(target => {
                                const value = target.getAttribute("value") || target.getAttribute("playOrder");
                                if (value) {
                                    const pageNum = parseInt(value, 10);
                                    if (!isNaN(pageNum) && pageNum > maxPage) {
                                        maxPage = pageNum;
                                    }
                                }
                            });
                            if (maxPage > 0) return { value: maxPage, type: 'actual' };
                        }
                    } catch (e) {
                        console.warn("Could not parse NCX pagelist", e);
                    }
                }
            }

            // 2. Fallback to schema:numberOfPages meta property
            const pageEl = opfDoc.querySelector('meta[property="schema:numberOfPages"]');
            const pageStr = pageEl?.textContent?.trim();
            if (pageStr) {
                const pages = parseInt(pageStr, 10);
                if (!isNaN(pages)) return { value: pages, type: 'actual' };
            }

            // 3. Estimate based on character count
            const CHARS_PER_PAGE = 1500;
            const estimatedPages = Math.round(fullText.length / CHARS_PER_PAGE);
            return { value: estimatedPages > 0 ? estimatedPages : 1, type: 'estimated' };
        })();
        
        let toc: TocItem[] | null = null;
        let pageList: PageListItem[] | null = null;
        try {
            const navManifestItem = Array.from(manifestItems).find(item => item.getAttribute('properties')?.split(' ').includes('nav'));

            if (navManifestItem) { // EPUB 3 Nav Document
                const navId = navManifestItem.getAttribute('id');
                if (navId) {
                    const navPath = manifest.get(navId)?.href;
                    if (navPath) {
                        const navFile = zip.file(navPath);
                        if (navFile) {
                            const navHtmlText = await navFile.async('string');
                            const navDoc = parser.parseFromString(navHtmlText, 'application/xhtml+xml');
                            
                            // More robustly find the TOC nav element
                            let tocNav: Element | null = null;
                            const navElements = navDoc.querySelectorAll('nav');
                            for (const navEl of Array.from(navElements)) {
                                const epubType = navEl.getAttribute('epub:type');
                                if (epubType && epubType.toLowerCase() === 'toc') {
                                    tocNav = navEl;
                                    break;
                                }
                            }
                            
                            if (tocNav) {
                                const tocOl = tocNav.querySelector('ol');
                                if (tocOl) {
                                    const parseNavList = (listElement: HTMLOListElement): TocItem[] => {
                                        const items: TocItem[] = [];
                                        const children = Array.from(listElement.children);
                                        for (const child of children) {
                                            if (child.tagName.toLowerCase() === 'li') {
                                                const anchor = child.querySelector('a');
                                                if (anchor) {
                                                    const label = anchor.textContent?.trim() || '';
                                                    const href = anchor.getAttribute('href') || '';
                                                    const nestedOl = child.querySelector('ol');
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
            } else if (ncxPath) { // EPUB 2 NCX
                const ncxFile = zip.file(ncxPath);
                if (ncxFile) {
                    const ncxXmlText = await ncxFile.async("string");
                    const ncxDoc = parser.parseFromString(ncxXmlText, "application/xml");
                    
                    // Parse NavMap for main TOC
                    const navMap = ncxDoc.querySelector("navMap");
                    if (navMap) {
                        const parseNavPoints = (parentElement: Element): TocItem[] => {
                            const items: TocItem[] = [];
                            const children = Array.from(parentElement.children);
                            for (const child of children) {
                                if (child.tagName.toLowerCase() === 'navpoint') {
                                    const labelEl = child.querySelector('navLabel > text');
                                    const contentEl = child.querySelector('content');
                                    if (labelEl && contentEl) {
                                        const label = labelEl.textContent?.trim() || '';
                                        const href = contentEl.getAttribute('src') || '';
                                        items.push({
                                            label,
                                            href,
                                            children: parseNavPoints(child),
                                        });
                                    }
                                }
                            }
                            return items;
                        };
                        toc = parseNavPoints(navMap);
                    }

                    // Parse PageList for page numbers
                    const pageListEl = ncxDoc.querySelector("pageList");
                    if (pageListEl) {
                        const pageTargets = Array.from(pageListEl.querySelectorAll("pageTarget"));
                        const extractedPages = pageTargets.map(target => {
                            const label = target.querySelector("navLabel > text")?.textContent?.trim() || '';
                            const pageNumber = target.getAttribute("value") || '';
                            return { label, pageNumber };
                        }).filter(item => item.label && item.pageNumber);
                        
                        if (extractedPages.length > 0) {
                            pageList = extractedPages;
                        }
                    }
                }
            }
        } catch (tocError) {
            console.warn("Could not parse Table of Contents:", tocError);
        }

        const metadata: Omit<FileMetadata, OmittedMetadata> = {
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
                    return dateStr; // return original string if parsing fails
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
            // Accessibility Metadata
            accessibilityFeatures: getMetaPropertyValues('schema:accessibilityFeature'),
            accessModes: getMetaPropertyValues('schema:accessMode'),
            accessModesSufficient: getMetaPropertyValues('schema:accessModeSufficient'),
            hazards: getMetaPropertyValues('schema:accessibilityHazard'),
            certification: (() => {
                const el = opfDoc.querySelector(`meta[property="dcterms:conformsTo"]`);
                return el?.textContent?.trim();
            })(),
        };

        // Find cover image
        const coverMeta = opfDoc.querySelector('meta[name="cover"]');
        const coverId = coverMeta ? coverMeta.getAttribute('content') : (opfDoc.querySelector('item[properties~="cover-image"]')?.getAttribute('id'));

        if (coverId) {
            const coverItem = manifest.get(coverId);
            if (coverItem) {
                const coverFile = zip.file(coverItem.href);
                if (coverFile) {
                    const imageBlob = await coverFile.async('blob');
                    coverImageUrl = URL.createObjectURL(imageBlob);
                }
            }
        }

        const maxChars = 200000;
        if (fullText.length > maxChars) {
          console.warn(`EPUB text truncated to ${maxChars} characters.`);
          fullText = fullText.substring(0, maxChars);
        }

        return { text: fullText, coverImageUrl, metadata, toc, pageList };
      } catch (error: any) {
        console.error("Error parsing EPUB with JSZip:", error);
        throw new Error("Failed to parse the EPUB. The file may be corrupted, DRM-protected, or in an unsupported format.");
      }
    })();

    return Promise.race([parsingPromise, timeoutPromise]);
  };


  const handleSubmit = useCallback(async () => {
    if (!file) {
      setErrorMessage(`Please select a ${fileType.toUpperCase()} file first.`);
      setStatus('error');
      return;
    }

    setSummary('');
    setErrorMessage('');
    setCoverImageUrl(null);
    setMetadata(null);
    setTableOfContents(null);
    setPageList(null);
    setPdfConversionProgress(0);
    setPdfConversionMessage('');
    
    try {
      const abortController = new AbortController();
      activeConversionAbortRef.current = abortController;
      setStatus('parsing');
      pushToast(
        fileType === 'pdf' && pdfWorkflow === 'browser-text'
          ? 'Starting browser PDF conversion...'
          : 'Uploading file to API parser...',
        'info',
      );
      
      // Debug: Log file details
      console.log('📁 File to upload:', {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      });
      
      let response: Response;
      const apiBase = import.meta.env.VITE_API_BASE_URL || '';

      if (fileType === 'pdf' && pdfWorkflow === 'browser-text') {
        console.log('📄 Using browser markdown extraction workflow for PDF (extract2md)');
        const conversionStartedAt = Date.now();
        let usedOcrFallback = false;
        let coverImageDataUrl: string | null = null;
        pushToast('PDF conversion started (extract2md).', 'info');

        const handlePdfProgress = (progress: PdfMdProgress) => {
          setPdfConversionProgress(Math.round(progress.percent));
          setPdfConversionMessage(progress.message);
        };

        const runConversion = async (mode: PdfMdMode) => {
          try {
            return await convertPdfToMarkdown(file, mode, handlePdfProgress, abortController.signal);
          } catch (error: any) {
            if (mode === 'quick' && enableOcrFallback) {
              console.warn('Fast conversion failed, retrying with OCR fallback:', error?.message || error);
              usedOcrFallback = true;
              pushToast('Fast mode failed. Retrying with OCR fallback.', 'info');
              return await convertPdfToMarkdown(file, 'ocr', handlePdfProgress, abortController.signal);
            }
            throw error;
          }
        };

        let markdownText = '';
        let sourceType = 'pdf-extract2md';
        let derivedMetadata: any = {
          title: file.name.replace(/\.pdf$/i, ''),
          pageCount: {
            value: 0,
            type: 'actual',
          },
        };
        let telemetryExtra: Record<string, unknown> = {};

        let shouldFallbackToServerParser = false;

        try {
          const conversionResult = await runConversion(pdfMdMode);
          markdownText = conversionResult.markdown;
          derivedMetadata = {
            title: file.name.replace(/\.pdf$/i, ''),
            pageCount: {
              value: conversionResult.totalPages || conversionResult.pagesProcessed || 0,
              type: 'actual',
            },
          };
        } catch (error: any) {
          const errorMessage = String(error?.message || error);
          const loadFailure = /dynamically imported module|extract2md library is unavailable/i.test(errorMessage);
          if (!loadFailure) {
            throw error;
          }

          pushToast('extract2md failed to load. Falling back to built-in browser extraction.', 'info');
          try {
            const parsedPdfFallback = await parsePdf(file);
            markdownText = parsedPdfFallback.text;
            sourceType = 'pdf-browser-fallback-text';
            derivedMetadata = parsedPdfFallback.metadata;
            telemetryExtra = {
              extract2mdLoadFailed: true,
              extract2mdError: errorMessage.slice(0, 400),
            };
          } catch (browserFallbackError: any) {
            shouldFallbackToServerParser = true;
            telemetryExtra = {
              extract2mdLoadFailed: true,
              extract2mdError: errorMessage.slice(0, 400),
              browserFallbackParseError: String(browserFallbackError?.message || browserFallbackError).slice(0, 400),
            };
            pushToast('Browser PDF fallback failed. Switching to backend parser.', 'info');
          }
        }

        if (shouldFallbackToServerParser) {
          const formData = new FormData();
          formData.append('file', file);
          formData.append('aiProvider', aiProvider);
          formData.append('aiModel', aiModel);
          setStatus('summarizing');
          response = await fetch(`${apiBase}/api/analyze-book?extractCover=true`, {
            method: 'POST',
            body: formData,
            signal: abortController.signal,
          }).catch((error) => {
            console.error('❌ Fetch error:', error);
            if (error?.name === 'AbortError') {
              throw new PdfConversionCancelledError();
            }
            throw new Error(`Network error: ${error.message}. This might be due to a corrupted or incompatible file format.`);
          });
        } else {
          setPdfConversionMessage('Extracting cover preview from first page...');
          coverImageDataUrl = await extractPdfCoverImage(file);

          setStatus('summarizing');
          setPdfConversionMessage('Markdown generated. Sending text to API for analysis...');
          setPdfConversionProgress(100);
          pushToast('Markdown extraction complete. Sending telemetry + text to API.', 'success');

          response = await fetch(`${apiBase}/api/analyze-text?maxTextLength=200000`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: markdownText,
              sourceType,
              metadata: derivedMetadata,
              fileName: file.name,
              fileType: 'pdf',
              coverImage: coverImageDataUrl,
              aiProvider,
              aiModel,
              telemetry: {
                conversionDurationMs: Date.now() - conversionStartedAt,
                usedOcrFallback,
                markdownLength: markdownText.length,
                modeRequested: pdfMdMode,
                ...telemetryExtra,
              },
            }),
            signal: abortController.signal,
          }).catch((error) => {
            console.error('❌ Fetch error:', error);
            if (error?.name === 'AbortError') {
              throw new PdfConversionCancelledError();
            }
            throw new Error(`Network error: ${error.message}. This might be due to a corrupted or incompatible file format.`);
          });
        }
      } else {
        // Use the API file-upload parser path
        const formData = new FormData();
        formData.append('file', file);
        formData.append('aiProvider', aiProvider);
        formData.append('aiModel', aiModel);

        console.log('📦 FormData created, ready to send');
        pushToast('File upload prepared. Sending to backend parser...', 'info');

        setStatus('summarizing');

        response = await fetch(`${apiBase}/api/analyze-book?extractCover=true`, {
          method: 'POST',
          body: formData,
          signal: abortController.signal,
        }).catch((error) => {
          console.error('❌ Fetch error:', error);
          if (error?.name === 'AbortError') {
            throw new Error('Request cancelled by user.');
          }
          throw new Error(`Network error: ${error.message}. This might be due to a corrupted or incompatible file format.`);
        });
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.message || errorData.error || `Server error: ${response.status}`);
      }
      
      const result = await response.json();
      
      setSummary(result.summary);
      setMetadata(result.metadata);
      setTableOfContents(result.tableOfContents ?? null);
      setPageList(result.pageList ?? null);
      setCoverImageUrl(result.coverImage);
      setStatus('success');
      if (fileType === 'pdf' && pdfWorkflow === 'browser-text') {
        pushToast('PDF telemetry captured and analysis completed.', 'success');
      } else {
        pushToast('Analysis completed successfully.', 'success');
      }
      activeConversionAbortRef.current = null;

    } catch (err) {
      console.error(err);
      if (err instanceof PdfConversionCancelledError) {
        setErrorMessage('PDF conversion cancelled.');
        setStatus('idle');
        pushToast('PDF conversion cancelled.', 'info');
        activeConversionAbortRef.current = null;
        return;
      }
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setErrorMessage(`Failed to generate analysis. ${message}`);
      setStatus('error');
      if (fileType === 'pdf' && pdfWorkflow === 'browser-text') {
        pushToast(`PDF processing failed: ${message}`, 'error');
      } else {
        pushToast(`Analysis failed: ${message}`, 'error');
      }
      activeConversionAbortRef.current = null;
    }
  }, [file, fileType, aiProvider, aiModel, pdfWorkflow, pdfMdMode, enableOcrFallback, pushToast]);

  const handleCancelConversion = useCallback(() => {
    if (!activeConversionAbortRef.current) return;
    activeConversionAbortRef.current.abort();
    activeConversionAbortRef.current = null;
    setPdfConversionMessage('Cancelling conversion...');
    pushToast('Cancelling PDF conversion...', 'info');
  }, [pushToast]);

  const isLoading = status === 'parsing' || status === 'summarizing';

  return (
    <div className={`max-w-6xl mx-auto p-4 md:p-8 space-y-8 pb-20 text-slate-900`}>
      <div className="fixed top-4 right-4 z-[9999] space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`min-w-[280px] max-w-[420px] rounded-lg border px-3 py-2 text-sm shadow-md bg-white ${
              toast.level === 'success'
                ? 'border-emerald-200 text-emerald-700'
                : toast.level === 'error'
                  ? 'border-red-200 text-red-700'
                  : 'border-blue-200 text-blue-700'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>
      <div className="w-full">
        <header className="space-y-3 mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <i className="fa-solid fa-book-open text-xl"></i>
            </div>
            <h1 className={`text-3xl font-extrabold tracking-tight`}>
              AI Assisted Ebook Cataloger
            </h1>
          </div>
          <p className="text-slate-500 font-medium">
            Upload your ebook to automatically extract metadata, generate summaries, and determine classifications.
          </p>
          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
          >
            <i className="fa-solid fa-book"></i>
            Open One-Page How-To Guide
          </button>
        </header>

        <main className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex flex-col lg:flex-row items-start gap-6">
            <div className="w-full lg:w-1/3 flex-shrink-0">
              <FileUpload 
                file={file}
                fileType={fileType}
                onFileChange={handleFileChange}
                onFileTypeChange={handleFileTypeChange}
                disabled={isLoading}
                isDark={isDark}
              />
              <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {fileType === 'pdf' && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <label htmlFor="pdf-workflow" className={`block text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                        PDF Workflow
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsPdfWorkflowInfoOpen(true)}
                        className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                        aria-label="Learn about PDF workflow options"
                        title="Learn about PDF workflow options"
                      >
                        <i className="fa-solid fa-circle-info text-xs"></i>
                      </button>
                    </div>
                    <select
                      id="pdf-workflow"
                      value={pdfWorkflow}
                      onChange={(event) => setPdfWorkflow(event.target.value as PdfWorkflow)}
                      disabled={isLoading}
                      className={`w-full rounded-md border px-3 py-2 text-sm ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                    >
                      {PDF_WORKFLOW_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Browser mode uses extract2md and posts Markdown text to `/api/analyze-text`.
                    </p>
                    {pdfWorkflow === 'browser-text' && (
                      <div className="mt-3 space-y-2">
                        <div>
                          <label htmlFor="pdf-md-mode" className="block text-xs font-semibold mb-1 text-slate-700">
                            Conversion Mode
                          </label>
                          <select
                            id="pdf-md-mode"
                            value={pdfMdMode}
                            onChange={(event) => setPdfMdMode(event.target.value as PdfMdMode)}
                            disabled={isLoading}
                            className={`w-full rounded-md border px-3 py-2 text-sm ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                          >
                            {PDF_MD_MODE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </div>
                        <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={enableOcrFallback}
                            onChange={(event) => setEnableOcrFallback(event.target.checked)}
                            disabled={isLoading || pdfMdMode !== 'quick'}
                          />
                          Retry with OCR if fast mode fails
                        </label>
                        {isLoading && status === 'parsing' && (
                          <div className="space-y-1">
                            <div className="h-2 w-full rounded bg-slate-200 overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${Math.max(2, pdfConversionProgress)}%` }}
                              />
                            </div>
                            <p className="text-[11px] text-slate-500">
                              {pdfConversionMessage || 'Preparing PDF conversion...'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <label htmlFor="ai-provider" className={`block text-xs font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      AI Provider
                    </label>
                    <button
                      type="button"
                      onClick={() => setIsAiProviderInfoOpen(true)}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                      aria-label="Learn about AI provider options"
                      title="Learn about AI provider options"
                    >
                      <i className="fa-solid fa-circle-info text-xs"></i>
                    </button>
                  </div>
                  <select
                    id="ai-provider"
                    value={aiProvider}
                    onChange={(event) => setAiProvider(event.target.value as AIProvider)}
                    disabled={isLoading}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    {AI_PROVIDER_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ai-model" className={`block text-xs font-semibold mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    Model
                  </label>
                  <select
                    id="ai-model"
                    value={aiModel}
                    onChange={(event) => setAiModel(event.target.value)}
                    disabled={isLoading}
                    className={`w-full rounded-md border px-3 py-2 text-sm ${isDark ? 'bg-slate-800 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-900'}`}
                  >
                    {AI_MODEL_OPTIONS[aiProvider].map((modelOption) => (
                      <option key={modelOption} value={modelOption}>{modelOption}</option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={handleSubmit}
                disabled={!file || isLoading}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-all shadow-md shadow-blue-100"
              >
                {isLoading ? 'Processing...' : 'Generate Analysis'}
              </button>
              {isLoading && fileType === 'pdf' && pdfWorkflow === 'browser-text' && status === 'parsing' && (
                <button
                  type="button"
                  onClick={handleCancelConversion}
                  className="w-full mt-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold py-2 px-4 rounded-xl transition-colors"
                >
                  Cancel Conversion
                </button>
              )}
              <MetadataDisplay metadata={metadata} isDark={isDark} />
            </div>
            
            <div className="w-full lg:w-2/3 flex flex-col gap-6">
              <div className="min-h-[220px] bg-slate-50 border border-slate-200 rounded-xl p-6 flex items-center justify-center">
                {isLoading && (
                  <Loader
                    message={status === 'summarizing'
                      ? `Analyzing and classifying with ${AI_PROVIDER_OPTIONS.find(option => option.value === aiProvider)?.label || 'AI'}...`
                      : (fileType === 'pdf' && pdfWorkflow === 'browser-text' && pdfConversionMessage)
                        ? pdfConversionMessage
                        : statusMessages[status]}
                    isDark={isDark}
                  />
                )}
                {!isLoading && status === 'error' && <ErrorMessage message={errorMessage} isDark={isDark} />}
                {!isLoading && status === 'success' && <SummaryDisplay summary={summary} coverImageUrl={coverImageUrl} isDark={isDark} />}
                {!isLoading && (status === 'idle' && !errorMessage) && (
                  <div className="text-center text-slate-500">
                    <p className="text-base font-medium">Your generated analysis will appear here.</p>
                  </div>
                )}
              </div>

              {status === 'success' && (
                <>
                  <TableOfContentsDisplay toc={tableOfContents} pageList={pageList} isDark={isDark} />
                  <ExportButton 
                    fileName={file?.name || 'ebook_metadata'}
                    metadata={metadata}
                    summary={summary}
                    toc={tableOfContents}
                    pageList={pageList}
                    isDark={isDark}
                  />
                </>
              )}

            </div>
          </div>
        </main>

        <footer className="text-center mt-8 text-slate-500 text-sm">
          <p>Powered by Google Gemini and React.</p>
        </footer>
      </div>
      <HowToGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} isDark={isDark} />
      {isPdfWorkflowInfoOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Choosing a PDF Workflow</h2>
              <button
                type="button"
                onClick={() => setIsPdfWorkflowInfoOpen(false)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label="Close PDF workflow help"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-slate-900">Server Parser (Current)</p>
                <p>
                  Best when you want the fastest, simplest upload-to-result flow. This path is usually very reliable
                  for standard, text-based PDFs and requires the fewest choices.
                </p>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li><span className="font-semibold">Pros:</span> Fast, simple, predictable for common PDFs.</li>
                  <li><span className="font-semibold">Cons:</span> Can be weaker on image-only scans where text extraction is limited.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-slate-900">Browser Text -&gt; AI (Incremental)</p>
                <p>
                  Best when you need stronger extraction for difficult PDFs. This path can use OCR fallback, which may
                  recover more readable content from scanned/image-heavy files and improve downstream analysis quality.
                </p>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li><span className="font-semibold">Pros:</span> Better chance of useful text on hard/scanned PDFs (with OCR fallback).</li>
                  <li><span className="font-semibold">Cons:</span> Slower, more browser memory/CPU use, and can still vary by file quality.</li>
                </ul>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-blue-900">
                <p className="font-semibold">Quick Guidance</p>
                <p>
                  Start with <span className="font-semibold">Server Parser</span>. If results look thin, incomplete, or
                  your PDF is scan-like, switch to <span className="font-semibold">Browser Text -&gt; AI</span> for a
                  higher-effort extraction path.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
      {isAiProviderInfoOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl max-h-[85vh] overflow-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900">Choosing an AI Provider and Model</h2>
              <button
                type="button"
                onClick={() => setIsAiProviderInfoOpen(false)}
                className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                aria-label="Close AI provider help"
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 text-sm text-slate-700">
              <div>
                <p className="font-semibold text-slate-900">Google (Gemini)</p>
                <p>
                  A strong default for general cataloging workflows, especially when you want a balanced mix of speed and quality.
                </p>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li><span className="font-semibold">Pros:</span> Good overall quality, good speed options (`Flash`) and stronger depth options (`Pro`).</li>
                  <li><span className="font-semibold">Cons:</span> For nuanced edge cases, you may still want to compare outputs with another provider.</li>
                  <li><span className="font-semibold">Best for:</span> Everyday metadata enrichment, mixed content, and broad first-pass analysis.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-900">OpenAI</p>
                <p>
                  Often a strong choice when you need precise instruction-following and consistent structured outputs for downstream use.
                </p>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li><span className="font-semibold">Pros:</span> Strong formatting reliability, strong coding/logic behavior, dependable schema-style outputs.</li>
                  <li><span className="font-semibold">Cons:</span> Higher-capability models may cost more depending on your volume and selected model.</li>
                  <li><span className="font-semibold">Best for:</span> Technical/nonfiction content, strict output shape needs, and repeatable processing pipelines.</li>
                </ul>
              </div>

              <div>
                <p className="font-semibold text-slate-900">Anthropic (Claude)</p>
                <p>
                  Often preferred for careful long-form reading and nuanced narrative understanding where tone and context matter.
                </p>
                <ul className="mt-2 space-y-1 list-disc pl-5">
                  <li><span className="font-semibold">Pros:</span> Strong long-context handling and nuanced interpretation on dense passages.</li>
                  <li><span className="font-semibold">Cons:</span> Depending on prompt and model, may be slower or more expensive than faster-tier alternatives.</li>
                  <li><span className="font-semibold">Best for:</span> Literary analysis, thematic synthesis, and subtle subject/tone classification.</li>
                </ul>
              </div>

              <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-blue-900">
                <p className="font-semibold">Practical Selection Strategy</p>
                <p>
                  Start with a fast model for first pass. If the summary or classifications look shallow, rerun the same file with a higher-capability model
                  or a different provider and compare outputs before finalizing catalog records.
                </p>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-slate-700">
                <p className="font-semibold">Note</p>
                <p>
                  Model quality can vary by domain, prompt, and document type. The best choice is often empirical: test 2 providers on representative samples
                  and standardize on what gives your team the most accurate metadata and subject classification quality.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
