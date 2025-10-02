import React from 'react';

export interface PageListItem {
  label: string;
  pageNumber: string;
}

export interface TocItem {
  label: string;
  href: string;
  children: TocItem[];
}

interface TableOfContentsDisplayProps {
  toc: TocItem[] | null;
  pageList: PageListItem[] | null;
}

const TocList: React.FC<{ items: TocItem[] }> = ({ items }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <ul className="pl-5 space-y-2 list-disc list-inside">
      {items.map((item, index) => (
        <li key={index} className="text-slate-300">
          <span>{item.label}</span>
          <TocList items={item.children} />
        </li>
      ))}
    </ul>
  );
};

export const TableOfContentsDisplay: React.FC<TableOfContentsDisplayProps> = ({ toc, pageList }) => {
  const hasToc = toc && toc.length > 0;
  const hasPageList = pageList && pageList.length > 0;

  if (!hasToc && !hasPageList) {
    return null;
  }

  return (
    <div className="w-full animate-fade-in">
      <div className="bg-slate-800/50 rounded-2xl shadow-2xl shadow-indigo-500/10 p-6 md:p-8 border border-slate-700">
        <h2 className="text-2xl font-bold mb-6 text-center text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">
          Contents &amp; Navigation
        </h2>
        <div className="max-h-96 overflow-y-auto pr-2 text-sm">
          {hasToc && (
            <>
              <h3 className="text-lg font-semibold text-cyan-400 mb-2 mt-4 first:mt-0">Table of Contents</h3>
              <TocList items={toc} />
            </>
          )}
          {hasPageList && (
            <>
              <h3 className="text-lg font-semibold text-cyan-400 mb-2 mt-4 first:mt-0">Page List</h3>
              <ul className="space-y-1.5">
                {pageList.map((item, index) => (
                  <li key={index} className="text-slate-300 flex justify-between border-b border-slate-700/50 py-1">
                    <span>{item.label}</span>
                    <span className="text-slate-400 font-mono">Page {item.pageNumber}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
};