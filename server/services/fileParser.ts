import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';

export interface FileMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  publisher?: string;
  publicationDate?: string;
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

/**
 * Parse a PDF file from a buffer using pdf-parse (Node.js optimized)
 */
export async function parsePdfFile(buffer: Buffer, options: ParseOptions = {}): Promise<ParseResult> {
  // TODO: PDF parsing temporarily disabled due to pdf-parse import issues
  // Will implement alternative solution (pdfjs-dist or pdf-lib)
  throw new Error('PDF parsing is temporarily unavailable. Please use EPUB files.');
}

/**
 * Parse an EPUB file from a buffer
 */
export async function parseEpubFile(buffer: Buffer, options: ParseOptions = {}): Promise<ParseResult> {
  const { extractCover = false } = options; // Default false - must explicitly request
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
      
      const maxChars = 200000;
      if (fullText.length > maxChars) {
        console.warn(`EPUB text truncated to ${maxChars} characters.`);
        fullText = fullText.substring(0, maxChars);
      }
      
      return { text: fullText, coverImageUrl, metadata, toc, pageList };
    } catch (error: any) {
      console.error("Error parsing EPUB:", error);
      throw new Error("Failed to parse the EPUB. The file may be corrupted, DRM-protected, or in an unsupported format.");
    }
  })();
  
  return Promise.race([parsingPromise, timeoutPromise]);
}
