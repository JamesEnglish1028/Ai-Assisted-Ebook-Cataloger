import React from 'react';
import { FileMetadata } from './MetadataDisplay';
import { TocItem, PageListItem } from './TableOfContentsDisplay';

interface ExportButtonProps {
  fileName: string;
  metadata: FileMetadata | null;
  summary: string | null;
  toc: TocItem[] | null;
  pageList: PageListItem[] | null;
}

export const ExportButton: React.FC<ExportButtonProps> = ({ fileName, metadata, summary, toc, pageList }) => {
  if (!metadata) {
    return null;
  }

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

  return (
    <div className="flex justify-center">
      <button
        onClick={handleExport}
        className="bg-cyan-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-800 focus:ring-cyan-500 shadow-lg inline-flex items-center gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
        Export JSON
      </button>
    </div>
  );
};