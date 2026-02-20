import React, { useEffect } from 'react';

interface HowToGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDark: boolean;
}

const GuideSection: React.FC<{ icon: string; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <section className="space-y-2">
    <h3 className="text-base font-semibold text-blue-700 flex items-center gap-2">
      <i className={`fa-solid ${icon} text-blue-500`}></i>
      {title}
    </h3>
    <div className="space-y-1 text-slate-700">{children}</div>
  </section>
);

export const HowToGuideModal: React.FC<HowToGuideModalProps> = ({ isOpen, onClose }) => {
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

      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-auto rounded-xl border border-slate-200 shadow-2xl p-6 md:p-8 bg-white text-slate-900">
        <div className="flex items-start justify-between gap-4">
          <h2 id="how-to-guide-title" className="text-2xl font-bold text-blue-700 flex items-center gap-2">
            <i className="fa-solid fa-book text-blue-500"></i>
            AI Assisted Ebook Cataloger: One-Page How-To Guide
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-semibold border border-slate-300 bg-slate-100 hover:bg-slate-200"
          >
            Close
          </button>
        </div>

        <div className="mt-6 space-y-5 text-sm leading-6">
          <GuideSection icon="fa-wand-magic-sparkles" title="What This App Does">
            <p>
              This app analyzes PDF or EPUB books and generates catalog-ready metadata, AI summary text, library classifications
              (LCC, LCSH, BISAC), readability metrics, and optional navigation details like table of contents and page lists.
            </p>
          </GuideSection>

          <GuideSection icon="fa-database" title="Where Catalog Data Comes From">
            <p>
              `Extracted metadata`: title, author, publisher, identifiers, and accessibility fields read from the uploaded file.
              `AI analysis`: summary, LCC/LCSH/BISAC classification, field of study, and discipline inferred from book content.
            </p>
            <p>
              `Authority enrichment (optional)`: Library of Congress authority candidates can be used to ground subject/name choices.
              `Open Library enrichment (optional)`: bibliographic metadata can be looked up by identifier or title for additional context.
            </p>
          </GuideSection>

          <GuideSection icon="fa-play" title="Quick Start">
            <p>1. Select `PDF` or `EPUB` in the upload panel.</p>
            <p>2. Upload a valid ebook file (drag/drop or click).</p>
            <p>3. Click `Generate Analysis`.</p>
            <p>4. Review results in the summary and metadata sections.</p>
          </GuideSection>

          <GuideSection icon="fa-microscope" title="Source Transparency in Results">
            <p>
              In `Book Details`, look for enrichment fields such as `locAuthority`, `openLibrary`, and related candidate data.
              These indicate whether authority/bibliographic sources were used and how confident the match was.
            </p>
            <p>
              `authorityAlignment` indicates which authority-backed headings or names the model actually used in its final classification output.
            </p>
          </GuideSection>

          <GuideSection icon="fa-sliders" title="Open Library Enrichment Modes">
            <p>
              `shadow` mode: fetches Open Library data and shows provenance without changing extracted metadata fields.
              `apply` mode: fills missing bibliographic fields (such as title, author, publisher, publication date, page count, or identifier)
              when high-confidence Open Library data is available.
            </p>
          </GuideSection>

          <GuideSection icon="fa-chart-simple" title="Understanding Results">
            <p>
              `Summary`: reader-facing description of the book. `Book Details`: extracted and inferred fields like title, author,
              ISBN, page count, classifications, discipline, and accessibility data. `Contents & Navigation`: TOC/page references when available.
            </p>
          </GuideSection>

          <GuideSection icon="fa-file-export" title="Export Options">
            <p>
              Use `Export JSON` for integration workflows. Use `Download MARC 21` for catalog records in `.mrk` format.
              The MARC export prompts for local control number, organization code, and online URL before generating output.
            </p>
          </GuideSection>

          <GuideSection icon="fa-universal-access" title="Accessibility Notes">
            <p>
              Accessibility metadata is extracted when present and mapped into catalog-friendly fields to support discovery and patron access.
            </p>
          </GuideSection>

          <GuideSection icon="fa-screwdriver-wrench" title="Common Troubleshooting">
            <p>
              `Failed to parse file`: verify file is valid and not password-protected/corrupted. `No text content found`: file may be image-only.
              `AI analysis failed`: check server API key and retry. `Too many requests`: wait for the rate-limit window to reset.
            </p>
          </GuideSection>
        </div>
      </div>
    </div>
  );
};
