import React, { useEffect } from 'react';

interface HowToGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

export const HowToGuideModal: React.FC<HowToGuideModalProps> = ({ isOpen, onClose, isDark }) => {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="how-to-guide-title"
    >
      <button
        type="button"
        aria-label="Close guide"
        onClick={onClose}
        className="absolute inset-0 bg-black/50"
      />

      <div className={`relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border shadow-2xl p-6 md:p-8 ${isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-900'}`}>
        <div className="flex items-start justify-between gap-4">
          <h2 id="how-to-guide-title" className={`text-2xl font-bold ${isDark ? 'text-cyan-300' : 'text-cyan-700'}`}>
            AI Assisted Ebook Cataloger: One-Page How-To Guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold border transition-colors ${isDark ? 'bg-slate-800 border-slate-600 hover:bg-slate-700' : 'bg-slate-100 border-slate-300 hover:bg-slate-200'}`}
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5 text-sm leading-6">
          <section>
            <h3 className={`text-base font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>1. What This App Does</h3>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              This app analyzes PDF or EPUB books and generates catalog-ready metadata, AI summary text, library classifications
              (LCC, LCSH, BISAC), readability metrics, and optional navigation details like table of contents and page lists.
            </p>
          </section>

          <section>
            <h3 className={`text-base font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>2. Quick Start</h3>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>1. Select `PDF` or `EPUB` in the upload panel.</p>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>2. Upload a valid ebook file (drag/drop or click).</p>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>3. Click `Generate Analysis`.</p>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>4. Review results in the summary and metadata sections.</p>
          </section>

          <section>
            <h3 className={`text-base font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>3. Understanding Results</h3>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              `Summary`: reader-facing description of the book. `Book Details`: extracted and inferred fields like title, author,
              ISBN, page count, classifications, discipline, and accessibility data. `Contents & Navigation`: TOC/page references when available.
            </p>
          </section>

          <section>
            <h3 className={`text-base font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>4. Export Options</h3>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              Use `Export JSON` for integration workflows. Use `Download MARC 21` for catalog records in `.mrk` format.
              The MARC export prompts for local control number, organization code, and online URL before generating output.
            </p>
          </section>

          <section>
            <h3 className={`text-base font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>5. Theme and Accessibility</h3>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              Use the header toggle to switch between Light and Dark modes at any time. Your selection is saved for future sessions.
            </p>
          </section>

          <section>
            <h3 className={`text-base font-semibold ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>6. Common Troubleshooting</h3>
            <p className={isDark ? 'text-slate-300' : 'text-slate-700'}>
              `Failed to parse file`: verify file is valid and not password-protected/corrupted. `No text content found`: file may be image-only.
              `AI analysis failed`: check server API key and retry. `Too many requests`: wait for the rate-limit window to reset.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};
