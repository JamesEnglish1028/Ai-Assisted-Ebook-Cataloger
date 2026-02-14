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
  isDark: boolean;
}

const TocList: React.FC<{ items: TocItem[]; isDark: boolean }> = ({ items, isDark }) => {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <ul className="pl-5 space-y-2 list-disc list-inside">
      {items.map((item, index) => (
        <li key={index} className={isDark ? 'text-slate-300' : 'text-slate-700'}>
          <span>{item.label}</span>
          <TocList items={item.children} isDark={isDark} />
        </li>
      ))}
    </ul>
  );
};

export const TableOfContentsDisplay: React.FC<TableOfContentsDisplayProps> = ({ toc, pageList, isDark }) => {
  const hasToc = toc && toc.length > 0;
  const hasPageList = pageList && pageList.length > 0;

  if (!hasToc && !hasPageList) {
    return null;
  }

  return (
    <div className="w-full animate-fade-in">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          Contents &amp; Navigation
        </h2>
        <div className="max-h-96 overflow-y-auto pr-2 text-sm">
          {hasToc && (
            <>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2 mt-4 first:mt-0">Table of Contents</h3>
              <TocList items={toc} isDark={isDark} />
            </>
          )}
          {hasPageList && (
            <>
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-2 mt-4 first:mt-0">Page List</h3>
              <ul className="space-y-1.5">
                {pageList.map((item, index) => (
                  <li key={index} className={`flex justify-between border-b py-1 ${isDark ? 'text-slate-300 border-slate-700/50' : 'text-slate-700 border-slate-200'}`}>
                    <span>{item.label}</span>
                    <span className={`font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Page {item.pageNumber}</span>
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
