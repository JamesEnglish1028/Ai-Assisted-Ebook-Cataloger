import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
// Helper function to find ISBN
const findIsbnInString = (text) => {
    if (!text)
        return undefined;
    const cleanedText = text.replace(/[-\s]/g, '');
    // Look for ISBN-13
    const isbn13Match = cleanedText.match(/(97(8|9)\d{10})/);
    if (isbn13Match)
        return isbn13Match[0];
    // Look for ISBN-10
    const isbn10Match = cleanedText.match(/(\d{9}[\dX])/);
    if (isbn10Match)
        return isbn10Match[0];
    return undefined;
};
// Helper to parse PDF date format
const parsePdfDate = (dateStr) => {
    if (!dateStr || !dateStr.startsWith('D:'))
        return undefined;
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
export async function parsePdfFile(buffer) {
    // TODO: PDF parsing temporarily disabled due to pdf-parse import issues
    // Will implement alternative solution (pdfjs-dist or pdf-lib)
    throw new Error('PDF parsing is temporarily unavailable. Please use EPUB files.');
}
/**
 * Parse an EPUB file from a buffer
 */
export async function parseEpubFile(buffer) {
    const EPUB_PARSE_TIMEOUT_MS = 30000;
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
            reject(new Error(`EPUB processing timed out after ${EPUB_PARSE_TIMEOUT_MS / 1000} seconds.`));
        }, EPUB_PARSE_TIMEOUT_MS);
    });
    const parsingPromise = (async () => {
        try {
            console.log('📚 Starting EPUB parsing, buffer size:', buffer.length, 'bytes');
            const zip = await JSZip.loadAsync(buffer);
            console.log('✅ EPUB zip loaded successfully');
            let coverImageUrl = null;
            let ncxPath;
            // Find OPF file
            const containerFile = zip.file("META-INF/container.xml");
            console.log('📄 Container file found:', !!containerFile);
            if (!containerFile)
                throw new Error("META-INF/container.xml not found in EPUB.");
            const containerXmlText = await containerFile.async("string");
            const parser = new DOMParser();
            const containerDoc = parser.parseFromString(containerXmlText, "application/xml");
            const opfPath = containerDoc.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
            if (!opfPath)
                throw new Error("Could not find OPF file path in container.xml.");
            const opfDirectory = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
            const opfFile = zip.file(opfPath);
            if (!opfFile)
                throw new Error("OPF file not found at path: " + opfPath);
            const opfXmlText = await opfFile.async("string");
            const opfDoc = parser.parseFromString(opfXmlText, "application/xml");
            const packageElement = opfDoc.getElementsByTagName("package")[0];
            const epubVersion = packageElement?.getAttribute("version") || undefined;
            // Extract metadata
            const getDcElement = (name) => {
                const element = opfDoc.getElementsByTagName(`dc:${name}`)[0];
                return element?.textContent?.trim() || undefined;
            };
            const getMetaPropertyValues = (name) => {
                const elements = opfDoc.querySelectorAll(`meta[property="${name}"]`);
                const values = [];
                elements.forEach((el) => {
                    const content = el.textContent?.trim();
                    if (content)
                        values.push(content);
                });
                return values;
            };
            const manifest = new Map();
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
            const contentPromises = [];
            for (let i = 0; i < spineItems.length; i++) {
                const idref = spineItems[i].getAttribute("idref");
                if (idref) {
                    const item = manifest.get(idref);
                    if (item && item.href) {
                        const chapterFile = zip.file(item.href);
                        if (chapterFile) {
                            contentPromises.push(chapterFile.async("string").then(chapterHtml => {
                                const chapterDoc = parser.parseFromString(chapterHtml, 'application/xhtml+xml');
                                const body = chapterDoc.documentElement.getElementsByTagName('body')[0];
                                return body ? (body.textContent || '').trim().replace(/\s+/g, ' ') : '';
                            }));
                        }
                    }
                }
            }
            const chaptersText = await Promise.all(contentPromises);
            let fullText = chaptersText.join('\n\n');
            // Calculate page count
            const pageCount = await (async () => {
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
                                pageTargets.forEach((target) => {
                                    const value = target.getAttribute("value") || target.getAttribute("playOrder");
                                    if (value) {
                                        const pageNum = parseInt(value, 10);
                                        if (!isNaN(pageNum) && pageNum > maxPage) {
                                            maxPage = pageNum;
                                        }
                                    }
                                });
                                if (maxPage > 0)
                                    return { value: maxPage, type: 'actual' };
                            }
                        }
                        catch (e) {
                            console.warn("Could not parse NCX pagelist", e);
                        }
                    }
                }
                const pageEl = opfDoc.querySelector('meta[property="schema:numberOfPages"]');
                const pageStr = pageEl?.textContent?.trim();
                if (pageStr) {
                    const pages = parseInt(pageStr, 10);
                    if (!isNaN(pages))
                        return { value: pages, type: 'actual' };
                }
                const CHARS_PER_PAGE = 1500;
                const estimatedPages = Math.round(fullText.length / CHARS_PER_PAGE);
                return { value: estimatedPages > 0 ? estimatedPages : 1, type: 'estimated' };
            })();
            // Extract TOC and page list
            let toc = null;
            let pageList = null;
            try {
                const navManifestItem = Array.from(manifestItems).find((item) => item.getAttribute('properties')?.split(' ').includes('nav'));
                if (navManifestItem) {
                    const navId = navManifestItem.getAttribute('id');
                    if (navId) {
                        const navPath = manifest.get(navId)?.href;
                        if (navPath) {
                            const navFile = zip.file(navPath);
                            if (navFile) {
                                const navHtmlText = await navFile.async('string');
                                const navDoc = parser.parseFromString(navHtmlText, 'application/xhtml+xml');
                                let tocNav = null;
                                const navElements = navDoc.getElementsByTagName('nav');
                                for (let i = 0; i < navElements.length; i++) {
                                    const navEl = navElements[i];
                                    const epubType = navEl.getAttribute('epub:type');
                                    if (epubType && epubType.toLowerCase() === 'toc') {
                                        tocNav = navEl;
                                        break;
                                    }
                                }
                                if (tocNav) {
                                    const tocOl = tocNav.querySelector('ol');
                                    if (tocOl) {
                                        const parseNavList = (listElement) => {
                                            const items = [];
                                            const children = Array.from(listElement.childNodes);
                                            for (const child of children) {
                                                const childEl = child;
                                                if (childEl.tagName && childEl.tagName.toLowerCase() === 'li') {
                                                    const anchor = childEl.querySelector('a');
                                                    if (anchor) {
                                                        const label = anchor.textContent?.trim() || '';
                                                        const href = anchor.getAttribute('href') || '';
                                                        const nestedOl = childEl.querySelector('ol');
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
                }
                else if (ncxPath) {
                    const ncxFile = zip.file(ncxPath);
                    if (ncxFile) {
                        const ncxXmlText = await ncxFile.async("string");
                        const ncxDoc = parser.parseFromString(ncxXmlText, "application/xml");
                        const navMap = ncxDoc.querySelector("navMap");
                        if (navMap) {
                            const parseNavPoints = (parentElement) => {
                                const items = [];
                                const children = Array.from(parentElement.childNodes);
                                for (const child of children) {
                                    const childEl = child;
                                    if (childEl.tagName && childEl.tagName.toLowerCase() === 'navpoint') {
                                        const labelEl = childEl.querySelector('navLabel > text');
                                        const contentEl = childEl.querySelector('content');
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
                        const pageListEl = ncxDoc.querySelector("pageList");
                        if (pageListEl) {
                            const pageTargets = Array.from(pageListEl.querySelectorAll("pageTarget"));
                            const extractedPages = pageTargets.map((target) => {
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
            }
            catch (tocError) {
                console.warn("Could not parse Table of Contents:", tocError);
            }
            const metadata = {
                title: getDcElement('title'),
                author: getDcElement('creator'),
                subject: getDcElement('subject'),
                publisher: getDcElement('publisher'),
                publicationDate: (() => {
                    const dateStr = getDcElement('date');
                    if (!dateStr)
                        return undefined;
                    try {
                        return new Date(dateStr).toLocaleDateString();
                    }
                    catch {
                        return dateStr;
                    }
                })(),
                epubVersion: epubVersion,
                pageCount: pageCount,
                identifier: (() => {
                    const identifiers = opfDoc.getElementsByTagName('dc:identifier');
                    let foundIsbn;
                    let firstIdentifier;
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
                    const el = opfDoc.querySelector(`meta[property="dcterms:conformsTo"]`);
                    return el?.textContent?.trim();
                })(),
            };
            // Find cover image
            const coverMeta = opfDoc.querySelector('meta[name="cover"]');
            const coverId = coverMeta ? coverMeta.getAttribute('content') :
                opfDoc.querySelector('item[properties~="cover-image"]')?.getAttribute('id');
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
            const maxChars = 200000;
            if (fullText.length > maxChars) {
                console.warn(`EPUB text truncated to ${maxChars} characters.`);
                fullText = fullText.substring(0, maxChars);
            }
            return { text: fullText, coverImageUrl, metadata, toc, pageList };
        }
        catch (error) {
            console.error("Error parsing EPUB:", error);
            throw new Error("Failed to parse the EPUB. The file may be corrupted, DRM-protected, or in an unsupported format.");
        }
    })();
    return Promise.race([parsingPromise, timeoutPromise]);
}
