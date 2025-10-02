import React, { useState, useCallback, useEffect } from 'react';
import { generateBookAnalysis, BookAnalysis } from './services/geminiService';
import { FileUpload } from './components/FileUpload';
import { Loader } from './components/Loader';
import { SummaryDisplay } from './components/SummaryDisplay';
import { ErrorMessage } from './components/ErrorMessage';
import { MetadataDisplay, FileMetadata } from './components/MetadataDisplay';
import { TableOfContentsDisplay, TocItem, PageListItem } from './components/TableOfContentsDisplay';
import { ExportButton } from './components/ExportButton';
import { calculateFleschKincaid, calculateGunningFog } from './utils/textAnalysis';

// Dynamically import libraries
const pdfjsLib = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.min.mjs');
pdfjsLib.then(pdfjs => {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.3.136/pdf.worker.min.mjs`;
});
const jszipLib = import('https://esm.run/jszip');


type Status = 'idle' | 'parsing' | 'summarizing' | 'success' | 'error';
type FileType = 'pdf' | 'epub';

type OmittedMetadata = 'lcc' | 'bisac' | 'lcsh' | 'fieldOfStudy' | 'discipline' | 'readingLevel' | 'gunningFog';

type ParseResult = {
    text: string;
    coverImageUrl: string | null;
    metadata: Omit<FileMetadata, OmittedMetadata>;
    toc?: TocItem[] | null;
    pageList?: PageListItem[] | null;
};

const statusMessages: Record<Status, string> = {
  idle: '',
  parsing: 'Parsing your ebook... This may take a moment for large files.',
  summarizing: 'Analyzing and classifying with Gemini...',
  success: 'Analysis generated!',
  error: 'An error occurred.',
};

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
  const [status, setStatus] = useState<Status>('idle');
  const [summary, setSummary] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<FileMetadata | null>(null);
  const [tableOfContents, setTableOfContents] = useState<TocItem[] | null>(null);
  const [pageList, setPageList] = useState<PageListItem[] | null>(null);


  // Clean up blob URLs to prevent memory leaks
  useEffect(() => {
    return () => {
      if (coverImageUrl && coverImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(coverImageUrl);
      }
    };
  }, [coverImageUrl]);


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
        const pdfjs = await pdfjsLib;
        const arrayBuffer = await fileToParse.arrayBuffer();
        const pdf = await pdfjs.getDocument(arrayBuffer).promise;
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

        // --- Fallback search: Look in metadata if not found in text ---
        if (!foundIdentifier) {
            for (const value of Object.values(info)) {
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
            title: info.Title || undefined,
            author: textFoundAuthor || info.Author || undefined,
            subject: info.Subject || undefined,
            keywords: info.Keywords || undefined,
            publisher: textFoundPublisher || info.Producer || undefined,
            publicationDate: parsePdfDate(info.CreationDate),
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
                    await coverPage.render({ canvasContext: context, viewport: viewport }).promise;
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

  const parseEpub = (fileToParse: File): Promise<ParseResult> => {
    const EPUB_PARSE_TIMEOUT_MS = 30000;

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`EPUB processing timed out after ${EPUB_PARSE_TIMEOUT_MS / 1000} seconds.`));
      }, EPUB_PARSE_TIMEOUT_MS);
    });

    const parsingPromise = (async (): Promise<ParseResult> => {
      try {
        const JSZip = (await jszipLib).default;
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
    
    try {
      setStatus('parsing');
      const parser = fileType === 'pdf' ? parsePdf : parseEpub;
      const { text: extractedText, coverImageUrl: extractedCover, metadata: extractedMetadata, toc, pageList } = await parser(file);

      if (!extractedText.trim()) {
        throw new Error(`Could not extract text from the ${fileType.toUpperCase()}. The file might be image-based or empty.`);
      }
      
      const fleschKincaid = calculateFleschKincaid(extractedText);
      const gunningFog = calculateGunningFog(extractedText);
      
      setStatus('summarizing');
      const analysis = await generateBookAnalysis(extractedText);
      setSummary(analysis.summary);
      setMetadata({
        ...extractedMetadata,
        lcc: analysis.lcc,
        bisac: analysis.bisac,
        lcsh: analysis.lcsh,
        fieldOfStudy: analysis.fieldOfStudy,
        discipline: analysis.discipline,
        readingLevel: fleschKincaid ?? undefined,
        gunningFog: gunningFog ?? undefined,
      });
      setTableOfContents(toc ?? null);
      setPageList(pageList ?? null);
      setCoverImageUrl(extractedCover);
      setStatus('success');

    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setErrorMessage(`Failed to generate analysis. ${message}`);
      setStatus('error');
    }
  }, [file, fileType]);

  const isLoading = status === 'parsing' || status === 'summarizing';

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
            AI Assisted Ebook Cataloger
          </h1>
          <p className="mt-4 text-lg text-slate-400">
            Upload your ebook to automatically extract metadata, generate summaries, and determine classifications.
          </p>
        </header>

        <main className="bg-slate-800/50 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6 md:p-8 border border-slate-700">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-full md:w-1/3 flex-shrink-0">
              <FileUpload 
                file={file}
                fileType={fileType}
                onFileChange={handleFileChange}
                onFileTypeChange={handleFileTypeChange}
                disabled={isLoading} 
              />
              <button
                onClick={handleSubmit}
                disabled={!file || isLoading}
                className="w-full mt-4 bg-indigo-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-indigo-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-indigo-500 shadow-lg"
              >
                {isLoading ? 'Processing...' : 'Generate Analysis'}
              </button>
              <MetadataDisplay metadata={metadata} />
            </div>
            
            <div className="w-full md:w-2/3 flex flex-col gap-6">
              <div className="min-h-[200px] bg-slate-900 rounded-lg p-6 flex items-center justify-center border border-slate-700">
                {isLoading && <Loader message={statusMessages[status]} />}
                {!isLoading && status === 'error' && <ErrorMessage message={errorMessage} />}
                {!isLoading && status === 'success' && <SummaryDisplay summary={summary} coverImageUrl={coverImageUrl} />}
                {!isLoading && (status === 'idle' && !errorMessage) && (
                  <div className="text-center text-slate-500">
                    <p className="text-lg">Your generated analysis will appear here.</p>
                  </div>
                )}
              </div>

              {status === 'success' && (
                <>
                  <TableOfContentsDisplay toc={tableOfContents} pageList={pageList} />
                  <ExportButton 
                    fileName={file?.name || 'ebook_metadata'}
                    metadata={metadata}
                    summary={summary}
                    toc={tableOfContents}
                    pageList={pageList}
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
    </div>
  );
}