import React, { useState } from 'react';
import { FileMetadata } from './MetadataDisplay';
import { TocItem, PageListItem } from './TableOfContentsDisplay';
import { accessibilityMappings } from '../utils/accessibilityMappings';

interface ExportButtonProps {
  fileName: string;
  metadata: FileMetadata | null;
  summary: string | null;
  toc: TocItem[] | null;
  pageList: PageListItem[] | null;
  isDark: boolean;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ fileName, metadata, summary, toc, pageList, isDark }) => {
  if (!metadata) {
    return null;
  }

  const [marcPreview, setMarcPreview] = useState<string>('');
  const [isMarcPreviewOpen, setIsMarcPreviewOpen] = useState<boolean>(true);

  const downloadTextFile = (content: string, extension: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    link.download = `${baseName}${extension}`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    const exportData = {
      sourceFile: fileName,
      generatedAt: new Date().toISOString(),
      details: metadata,
      analysis: {
        summary: summary,
      },
      navigation: {
        tableOfContents: toc,
        pageList: pageList,
      },
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const baseName = fileName.substring(0, fileName.lastIndexOf('.')) || fileName;
    link.download = `${baseName}_metadata.json`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const buildAuthorList = (authorText?: string): string[] => {
    if (!authorText) return [];
    return authorText
      .split(/\s+(?:and|&)\s+|\s*;\s*/i)
      .map(author => author.trim())
      .filter(author => author.length > 0);
  };

  const formatPersonalName = (author: string): string => {
    if (!author) return author;
    if (author.includes(',')) return author;

    const parts = author.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) return author;

    const lastName = parts[parts.length - 1];
    const firstName = parts.slice(0, -1).join(' ');
    return `${lastName}, ${firstName}`;
  };

  const formatMarcDate = (date: Date): string => {
    const year = date.getFullYear().toString().slice(-2);
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const extractYear = (dateValue?: string): string | undefined => {
    if (!dateValue) return undefined;
    const match = dateValue.match(/\d{4}/);
    return match ? match[0] : undefined;
  };

  const format245Title = (title?: string): { title: string; subtitle?: string } | null => {
    if (!title) return null;
    const parts = title.split(':');
    if (parts.length < 2) {
      return { title: title.trim() };
    }

    return {
      title: parts[0].trim(),
      subtitle: parts.slice(1).join(':').trim(),
    };
  };

  const formatLcsh = (heading: string): string => {
    const parts = heading.split(' -- ').map(part => part.trim()).filter(Boolean);
    if (parts.length === 0) return '';
    const subfields = [
      `$a${parts[0]}`,
      ...parts.slice(1).map(part => `$x${part}`),
    ];
    return subfields.join('');
  };

  const formatAccessibilityFeatures = (features: string[]): string => {
    const valueMap = accessibilityMappings.values.accessibilityFeatures;
    return features
      .map(feature => valueMap[feature] || feature)
      .join('; ');
  };

  const buildMarcAccessibilityContent = (blankIndicator: string): string | null => {
    const accessModes = metadata.accessModes ?? [];
    const features = metadata.accessibilityFeatures ?? [];

    if (accessModes.length === 0 && features.length === 0) {
      return null;
    }

    const subfields: string[] = [];
    accessModes.forEach(mode => {
      subfields.push(`$a${mode}`);
    });

    const textualFeatures: string[] = [];
    const visualFeatures: string[] = [];
    const auditoryFeatures: string[] = [];
    const tactileFeatures: string[] = [];

    features.forEach(feature => {
      switch (feature) {
        case 'alternativeText':
        case 'displayTransformability':
          visualFeatures.push(feature);
          break;
        case 'audioDescription':
        case 'captions':
        case 'closedCaptions':
          auditoryFeatures.push(feature);
          break;
        case 'braille':
        case 'tactile':
          tactileFeatures.push(feature);
          break;
        default:
          textualFeatures.push(feature);
          break;
      }
    });

    textualFeatures.forEach(feature => subfields.push(`$b${feature}`));
    visualFeatures.forEach(feature => subfields.push(`$c${feature}`));
    auditoryFeatures.forEach(feature => subfields.push(`$d${feature}`));
    tactileFeatures.forEach(feature => subfields.push(`$e${feature}`));

    return `=341  0${blankIndicator}${subfields.join('')}`;
  };

  const buildMarcRecord = (localControlNumber: string, marcOrgCode: string, resourceUrl?: string): string => {
    const now = new Date();
    const dateEntered = formatMarcDate(now);
    const publicationYear = extractYear(metadata.publicationDate) || now.getFullYear().toString();

    const authorList = buildAuthorList(metadata.author);
    const mainAuthor = authorList[0];
    const additionalAuthors = authorList.slice(1);

    const titleParts = format245Title(metadata.title);
    const hasTitle = !!titleParts;

    const pageCount = metadata.pageCount?.value;
    const pagesText = pageCount ? ` (${pageCount} pages)` : '';

    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    const fileFormat = fileExtension === 'pdf' ? 'PDF' : 'EPUB';

    const blankIndicator = '\\\\';
    const marcLines: string[] = [];
    marcLines.push('=LDR  00000nam a2200000 i 4500');
    marcLines.push('=006  m     o  d');
    marcLines.push('=007  cr |||||||||||');
    marcLines.push(`=008  ${dateEntered}s${publicationYear}    xxu     ob    001 0 eng d`);
    marcLines.push(`=001  ${localControlNumber}`);
    marcLines.push(`=003  ${marcOrgCode}`);

    if (metadata.identifier?.value) {
      marcLines.push(`=020  ${blankIndicator}$a${metadata.identifier.value}`);
      marcLines.push(`=024  3${blankIndicator}$a${metadata.identifier.value}`);
    }

    marcLines.push(`=040  ${blankIndicator}$a${marcOrgCode}$beng$erda$c${marcOrgCode}`);

    if (mainAuthor) {
      marcLines.push(`=100  1${blankIndicator}$a${formatPersonalName(mainAuthor)}$eauthor.`);
    }

    if (hasTitle && titleParts) {
      const indicator1 = mainAuthor ? '1' : '0';
      const titleField = [`=245  ${indicator1}0$a${titleParts.title}`];
      if (titleParts.subtitle) {
        titleField.push(`$b${titleParts.subtitle}`);
      }
      if (metadata.author) {
        titleField.push(`$c${metadata.author}`);
      }
      titleField[0] = titleField[0] + (titleParts.subtitle ? ' :' : '');
      marcLines.push(titleField.join(''));
    }

    if (metadata.publisher || publicationYear) {
      const publisherText = metadata.publisher ? `$b${metadata.publisher}` : '';
      const yearText = publicationYear ? `$c${publicationYear}.` : '';
      marcLines.push(`=264  ${blankIndicator}1$a[Place of publication not identified] :${publisherText}${yearText}`);
    }

    marcLines.push(`=300  ${blankIndicator}$a1 online resource${pagesText}`);
    marcLines.push(`=336  ${blankIndicator}$atext$btxt$2rdacontent`);
    marcLines.push(`=337  ${blankIndicator}$acomputer$bc$2rdamedia`);
    marcLines.push(`=338  ${blankIndicator}$aonline resource$bcr$2rdacarrier`);
    marcLines.push(`=347  ${blankIndicator}$atext file$b${fileFormat}$2rda`);

    const accessibilityContent = buildMarcAccessibilityContent(blankIndicator);
    if (accessibilityContent) {
      marcLines.push(accessibilityContent);
    }

    if (metadata.epubVersion) {
      marcLines.push(`=500  ${blankIndicator}$aEPUB version ${metadata.epubVersion}.`);
    }

    if (metadata.accessibilityFeatures && metadata.accessibilityFeatures.length > 0) {
      const featuresText = formatAccessibilityFeatures(metadata.accessibilityFeatures);
      if (featuresText) {
        marcLines.push(`=500  ${blankIndicator}$aAccessibility features: ${featuresText}.`);
      }
    }

    if (summary) {
      marcLines.push(`=520  ${blankIndicator}$a${summary}`);
    }

    const aiAssistedFields: string[] = [];
    if (summary) aiAssistedFields.push('520');
    if (metadata.lcsh && metadata.lcsh.length > 0) aiAssistedFields.push('650');

    const aiFieldNote =
      aiAssistedFields.length > 0
        ? `AI assistance was used to generate metadata for MARC field(s): ${aiAssistedFields.join(', ')}.`
        : 'Cataloging metadata was generated with AI assistance.';
    marcLines.push(`=588  ${blankIndicator}$a${aiFieldNote}`);

    if (metadata.lcsh && metadata.lcsh.length > 0) {
      metadata.lcsh.forEach(heading => {
        const lcshText = formatLcsh(heading);
        if (lcshText) {
          marcLines.push(`=650  ${blankIndicator}0${lcshText}`);
        }
      });
    }

    marcLines.push(`=655  ${blankIndicator}7$aElectronic books.$2lcgft`);

    additionalAuthors.forEach(author => {
      marcLines.push(`=700  1${blankIndicator}$a${formatPersonalName(author)}$eauthor.`);
    });

    if (resourceUrl) {
      marcLines.push(`=856  40$u${resourceUrl}$yAvailable online`);
    }

    return marcLines.join('\n');
  };

  const handleMarcExport = () => {
    const localControlNumber = window.prompt('Enter local control number for =001');
    if (!localControlNumber) return;

    const marcOrgCode = window.prompt('Enter MARC organization code for =003');
    if (!marcOrgCode) return;

    const resourceUrl = window.prompt('Enter URL for =856 40$u (Available online)');
    if (!resourceUrl) return;

    const marcRecord = buildMarcRecord(localControlNumber, marcOrgCode, resourceUrl);
    setMarcPreview(marcRecord);
    setIsMarcPreviewOpen(true);
  };

  const handleMarcDownload = () => {
    if (!marcPreview) return;
    downloadTextFile(marcPreview, '_metadata.mrk');
    setIsMarcPreviewOpen(false);
  };

  const handleClearMarcPreview = () => {
    setMarcPreview('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <button
          onClick={handleExport}
          className={`bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-cyan-500 disabled:cursor-not-allowed transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 shadow-lg inline-flex items-center gap-2 ${isDark ? 'disabled:bg-slate-600 focus:ring-offset-slate-800' : 'disabled:bg-slate-400 focus:ring-offset-slate-50'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
          Export JSON
        </button>
        <button
          onClick={handleMarcExport}
          className={`bg-emerald-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-emerald-500 disabled:cursor-not-allowed transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 shadow-lg inline-flex items-center gap-2 ${isDark ? 'disabled:bg-slate-600 focus:ring-offset-slate-800' : 'disabled:bg-slate-400 focus:ring-offset-slate-50'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2a1 1 0 011 1v7h3a1 1 0 01.707 1.707l-4 4a1 1 0 01-1.414 0l-4-4A1 1 0 016 10h3V3a1 1 0 011-1z" />
            <path d="M4 15a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1z" />
          </svg>
          Download MARC 21
        </button>
      </div>

      {marcPreview && (
        <div className={`border rounded-lg p-4 transition-colors ${isDark ? 'bg-slate-900/70 border-slate-700' : 'bg-slate-100 border-slate-200'}`}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              onClick={() => setIsMarcPreviewOpen(prev => !prev)}
              className={`text-sm font-semibold inline-flex items-center gap-2 focus:outline-none ${isDark ? 'text-emerald-300' : 'text-emerald-700'}`}
              type="button"
            >
              <span>{isMarcPreviewOpen ? 'Hide' : 'Show'} MARC 21 Preview</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-4 w-4 transition-transform ${isMarcPreviewOpen ? 'rotate-180' : 'rotate-0'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.94a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleMarcDownload}
                className={`bg-emerald-600 text-white text-sm font-semibold py-2 px-4 rounded-md hover:bg-emerald-500 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 ${isDark ? 'focus:ring-offset-slate-800' : 'focus:ring-offset-slate-50'}`}
              >
                Download .mrk
              </button>
              <button
                onClick={handleClearMarcPreview}
                className={`text-sm font-semibold py-2 px-4 rounded-md transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-500 ${isDark ? 'bg-slate-700 text-white hover:bg-slate-600 focus:ring-offset-slate-800' : 'bg-slate-300 text-slate-900 hover:bg-slate-400 focus:ring-offset-slate-50'}`}
              >
                Clear Preview
              </button>
            </div>
          </div>
          {isMarcPreviewOpen && (
            <pre className={`mt-3 text-xs sm:text-sm whitespace-pre-wrap break-words max-h-80 overflow-auto ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
              {marcPreview}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};
