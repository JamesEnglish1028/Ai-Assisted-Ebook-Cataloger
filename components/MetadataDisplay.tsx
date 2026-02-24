import React from 'react';
import { accessibilityMappings } from '../utils/accessibilityMappings';
import { AnalysisSourceBadge } from './AnalysisSourceBadge';

interface ReadingLevel {
  score: number;
  level: string;
}

interface LccClassification {
  designator: string;
  mainClass: string;
  subClass: string;
}

interface AuthorityAlignment {
  usedAuthorityHeadings: string[];
  usedNameAuthorities: string[];
  notes?: string;
}

interface LocAuthoritySummary {
  provider: string;
  lcshCandidateCount: number;
  nameCandidateCount: number;
  itemLink?: {
    itemId: string;
    itemUrl: string;
  };
  recordLinks?: {
    lccn: string;
    permalinkUrl: string;
    marcXmlUrl: string;
    modsUrl: string;
    bibframe2Url: string;
  };
  warnings?: string[];
}

interface LocAuthorityHeadingCandidate {
  heading?: string;
  label?: string;
}

interface OpenLibrarySummary {
  provider: string;
  mode: 'shadow' | 'apply';
  matchType: 'identifier' | 'title' | 'none';
  confidence: number;
  warnings?: string[];
}

interface OpenLibraryBook {
  title?: string;
  subtitle?: string;
  authors?: string[];
  publishers?: string[];
  publishDate?: string;
  numberOfPages?: number;
  isbn10?: string[];
  isbn13?: string[];
  lccn?: string[];
  oclc?: string[];
  olid?: string[];
  coverUrl?: string;
  workKey?: string;
  editionKey?: string;
}

interface HardcoverSummary {
  provider: string;
  mode: 'shadow' | 'apply';
  matchType: 'identifier' | 'title' | 'none';
  confidence: number;
  warnings?: string[];
}

interface HardcoverBook {
  hardcoverBookId?: number;
  hardcoverEditionId?: number;
  title?: string;
  description?: string;
  authors?: string[];
  publishers?: string[];
  publicationDate?: string;
  numberOfPages?: number;
  isbn10?: string[];
  isbn13?: string[];
  asin?: string;
  series?: {
    name?: string;
    position?: number;
  } | null;
  slug?: string;
}

export interface FileMetadata {
  title?: string;
  author?: string;
  narrator?: string;
  subject?: string;
  keywords?: string;
  identifier?: {
    value: string;
    source: 'text' | 'metadata';
  };
  publisher?: string;
  publicationDate?: string;
  epubVersion?: string;
  language?: string;
  duration?: string;
  durationSeconds?: number;
  audioFormat?: string;
  audioTrackCount?: number;
  mediaType?: string;
  sourceFormat?: 'pdf' | 'epub' | 'audiobook';
  pageCount?: {
    value: number;
    type: 'actual' | 'estimated';
  };
  // Accessibility
  accessibilityFeatures?: string[];
  accessModes?: string[];
  accessModesSufficient?: string[];
  hazards?: string[];
  certification?: string;
  // AI Generated
  lcc?: LccClassification[];
  bisac?: string[];
  lcsh?: string[];
  fieldOfStudy?: string;
  discipline?: string;
  locAuthority?: LocAuthoritySummary;
  lcshAuthorityCandidates?: LocAuthorityHeadingCandidate[];
  authorityAlignment?: AuthorityAlignment;
  openLibrary?: OpenLibrarySummary;
  openLibraryBook?: OpenLibraryBook;
  hardcover?: HardcoverSummary;
  hardcoverBook?: HardcoverBook;
  series?: string;
  seriesPosition?: number;
  // Calculated
  readingLevel?: ReadingLevel;
  gunningFog?: ReadingLevel;
}

interface MetadataDisplayProps {
  metadata: FileMetadata | null;
  isDark: boolean;
  aiProvider?: 'google' | 'openai' | 'anthropic' | string;
  aiModel?: string;
}

const Section: React.FC<{
  title: string;
  children: React.ReactNode;
  hasContent?: boolean;
  isDark: boolean;
  headerBadge?: React.ReactNode;
}> = ({ title, children, hasContent = true, isDark, headerBadge }) => {
  if (!hasContent) return null;

  return (
    <div className={`mt-6 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className={`text-base font-semibold ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>{title}</h4>
        {headerBadge}
      </div>
      {children}
    </div>
  );
};

const MetadataItem: React.FC<{ label: string; value: React.ReactNode; isDark: boolean }> = ({ label, value, isDark }) => (
  <div>
    <dt className={`text-sm font-medium truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</dt>
    <dd className={`mt-1 text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>{value}</dd>
  </div>
);

const MetadataListItem: React.FC<{ label: string; values: string[]; isDark: boolean }> = ({ label, values, isDark }) => (
    <div>
      <dt className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{label}</dt>
      <dd className={`mt-1 text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
        <ul className="list-disc list-inside space-y-1">
          {values.map((value, index) => <li key={index}>{value}</li>)}
        </ul>
      </dd>
    </div>
  );

const normalizeHeadingForMatch = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const LcshDisplay: React.FC<{
  headings: string[];
  authorityCandidates?: LocAuthorityHeadingCandidate[];
  usedAuthorityHeadings?: string[];
  isDark: boolean;
}> = ({ headings, authorityCandidates, usedAuthorityHeadings, isDark }) => {
  if (!headings || headings.length === 0) return null;

  const authorityMatchPool = [
    ...(authorityCandidates || [])
      .map((candidate) => (candidate.heading || candidate.label || '').trim())
      .filter((value) => value.length > 0)
      .map(normalizeHeadingForMatch),
    ...((usedAuthorityHeadings || []).map(normalizeHeadingForMatch)),
  ].filter(Boolean);

  const isAuthorityHeadingMatch = (heading: string): boolean => {
    const normalizedHeading = normalizeHeadingForMatch(heading);
    if (!normalizedHeading) return false;

    return authorityMatchPool.some((candidate) => (
      candidate === normalizedHeading
      || candidate.includes(normalizedHeading)
      || normalizedHeading.includes(candidate)
    ));
  };

  const parseLcshParts = (heading: string): Array<{ label: string; value: string }> => {
    const parts = heading.split(' -- ').map((part) => part.trim()).filter(Boolean);
    if (parts.length === 0) return [];
    if (parts.length === 1) return [{ label: 'Main', value: parts[0] }];
    if (parts.length === 2) {
      return [
        { label: 'Main', value: parts[0] },
        { label: 'Subdivision', value: parts[1] },
      ];
    }

    const formatted: Array<{ label: string; value: string }> = [
      { label: 'Main', value: parts[0] },
      { label: 'Geographic', value: parts[1] },
    ];

    for (let i = 2; i < parts.length - 1; i += 1) {
      formatted.push({ label: 'Subdivision', value: parts[i] });
    }

    formatted.push({ label: 'Form', value: parts[parts.length - 1] });
    return formatted;
  };

  return (
    <div>
      <dt className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>LCSH Headings</dt>
      <dd className={`mt-1 text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
        <ul className="space-y-2">
          {headings.map((heading, index) => {
            const isAuthorityMatch = isAuthorityHeadingMatch(heading);
            const parsedParts = parseLcshParts(heading);
            return (
              <li
                key={`${heading}-${index}`}
                className={`rounded-md border px-2 py-1 ${
                  isDark ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-slate-50'
                } ${isAuthorityMatch ? (isDark ? 'text-cyan-300' : 'text-cyan-700') : ''}`}
              >
                <dl className="space-y-0.5">
                  {parsedParts.map((part) => (
                    <div key={`${heading}-${part.label}-${part.value}`}>
                      <dt className={`inline text-xs font-semibold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{part.label}:</dt>{' '}
                      <dd className={`inline ${isAuthorityMatch ? 'font-bold' : ''}`}>{part.value}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      </dd>
    </div>
  );
};

const LccDisplay: React.FC<{ classifications: LccClassification[]; isDark: boolean }> = ({ classifications, isDark }) => {
    const grouped: { [key: string]: { mainClass: string; subClasses: string[] } } = {};

    classifications.forEach(c => {
        if (!grouped[c.designator]) {
            grouped[c.designator] = { mainClass: c.mainClass, subClasses: [] };
        }
        grouped[c.designator].subClasses.push(c.subClass);
    });

    if (Object.keys(grouped).length === 0) return null;

    return (
        <div>
            <dt className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>LCC Headings</dt>
            <dd className={`mt-1 text-sm space-y-2 ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                {Object.entries(grouped).map(([designator, data]) => (
                    <div key={designator}>
                        <p className="font-semibold flex items-center">
                          <span className={`text-xs font-mono rounded px-1.5 py-0.5 mr-2 ${isDark ? 'bg-cyan-800 text-cyan-200' : 'bg-cyan-100 text-cyan-700'}`}>{designator}</span>
                          {data.mainClass}
                        </p>
                        <ul className="list-disc list-inside pl-4 mt-1 space-y-1">
                            {data.subClasses.map((sub, index) => <li key={index}>{sub}</li>)}
                        </ul>
                    </div>
                ))}
            </dd>
        </div>
    );
};

const BisacDisplay: React.FC<{ headings: string[]; isDark: boolean }> = ({ headings, isDark }) => {
    if (!headings || headings.length === 0) return null;

    return (
        <div>
            <dt className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>BISAC Headings</dt>
            <dd className={`mt-1 text-sm ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                <ul className="space-y-1.5">
                    {headings.map((heading, index) => {
                        const parts = heading.split(' - ');
                        if (parts.length < 2) {
                            return <li key={index}>{heading}</li>;
                        }
                        const code = parts[0];
                        const description = parts.slice(1).join(' - ');

                        return (
                            <li key={index}>
                                <span className={`text-xs font-mono rounded px-1.5 py-0.5 mr-2 ${isDark ? 'bg-cyan-800 text-cyan-200' : 'bg-cyan-100 text-cyan-700'}`}>{code}</span>
                                {description}
                            </li>
                        );
                    })}
                </ul>
            </dd>
        </div>
    );
};

const AccessibilityListItem: React.FC<{
  property: 'accessibilityFeatures' | 'accessModes' | 'accessModesSufficient' | 'hazards';
  values: string[];
  isDark: boolean;
}> = ({ property, values, isDark }) => {
  // Get the human-readable label for the property (e.g., "Features" for "accessibilityFeatures")
  const label = accessibilityMappings.properties[property] || property;
  
  // Get the map for this property's values
  const valueMap = accessibilityMappings.values[property];

  // Convert the technical values to human-readable strings, falling back to original value if no mapping exists
  const mappedValues = values.map(value => (valueMap && valueMap[value]) ? valueMap[value] : value);
  
  return <MetadataListItem label={label} values={mappedValues} isDark={isDark} />;
};

const ProvenanceNote: React.FC<{ text: string; isDark: boolean }> = ({ text, isDark }) => (
  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{text}</p>
);


export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({ metadata, isDark, aiProvider, aiModel }) => {
  if (!metadata || Object.values(metadata).every(v => !v || (Array.isArray(v) && v.length === 0))) {
    return null;
  }

  const isAudiobook = metadata.sourceFormat === 'audiobook';
  const hasCoreInfo = metadata.title || metadata.author || metadata.narrator || metadata.publisher || metadata.publicationDate || metadata.identifier || metadata.pageCount || metadata.subject || metadata.keywords || metadata.epubVersion || metadata.language || metadata.duration || metadata.audioFormat || metadata.audioTrackCount || metadata.series || metadata.seriesPosition;
  // FIX: Coerce truthy/falsy values to actual booleans to match the 'hasContent' prop type of the Section component.
  const hasClassificationInfo = !!(metadata.fieldOfStudy || metadata.discipline || (metadata.lcc && metadata.lcc.length > 0) || (metadata.bisac && metadata.bisac.length > 0) || (metadata.lcsh && metadata.lcsh.length > 0));
  const hasProvenanceInfo = !!(metadata.locAuthority || metadata.openLibrary || metadata.hardcover || metadata.authorityAlignment);
  const hasReadabilityInfo = !isAudiobook && !!(metadata.readingLevel || metadata.gunningFog);
  const hasAccessibilityInfo = !isAudiobook && !!(metadata.certification || (metadata.accessibilityFeatures && metadata.accessibilityFeatures.length > 0) || (metadata.accessModes && metadata.accessModes.length > 0) || (metadata.accessModesSufficient && metadata.accessModesSufficient.length > 0) || (metadata.hazards && metadata.hazards.length > 0));

  return (
    <div className="w-full mt-6 p-4 rounded-xl border border-slate-200 bg-white animate-fade-in">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Publication Details</h3>
        <AnalysisSourceBadge source="system" isDark={isDark} />
      </div>
      
      {hasCoreInfo && (
        <dl className="space-y-4">
          {metadata.title && <MetadataItem label="Title" value={metadata.title} isDark={isDark} />}
          {metadata.author && <MetadataItem label="Author" value={metadata.author} isDark={isDark} />}
          {metadata.narrator && <MetadataItem label="Narrator" value={metadata.narrator} isDark={isDark} />}
          {metadata.publisher && <MetadataItem label="Publisher" value={metadata.publisher} isDark={isDark} />}
          {metadata.publicationDate && <MetadataItem label="Publication Date" value={metadata.publicationDate} isDark={isDark} />}
          {metadata.series && <MetadataItem label="Series" value={metadata.series} isDark={isDark} />}
          {typeof metadata.seriesPosition === 'number' && <MetadataItem label="Series Position" value={metadata.seriesPosition} isDark={isDark} />}
          {metadata.language && <MetadataItem label="Language" value={metadata.language} isDark={isDark} />}
          {metadata.duration && <MetadataItem label="Duration" value={metadata.duration} isDark={isDark} />}
          {metadata.audioFormat && <MetadataItem label="Audio Format" value={metadata.audioFormat} isDark={isDark} />}
          {metadata.audioTrackCount && <MetadataItem label="Audio Tracks" value={metadata.audioTrackCount} isDark={isDark} />}
          {metadata.mediaType && <MetadataItem label="Media Type" value={metadata.mediaType} isDark={isDark} />}
          {metadata.epubVersion && <MetadataItem label="EPUB Version" value={metadata.epubVersion} isDark={isDark} />}
          
          {metadata.pageCount && (
            <MetadataItem 
              label="Pages" 
              value={
                <>
                  {metadata.pageCount.type === 'estimated' && '~'}
                  {metadata.pageCount.value}
                  {metadata.pageCount.type === 'estimated' && <span className={`text-xs ml-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>(estimated)</span>}
                </>
              }
              isDark={isDark}
            />
          )}

          {metadata.identifier && (
              <MetadataItem 
                  label="Identifier / ISBN" 
                  value={
                      <>
                          {metadata.identifier.value}
                          {metadata.identifier.source === 'text' && <span className={`text-xs ml-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>(from text)</span>}
                      </>
                  }
                  isDark={isDark}
              />
          )}
          {metadata.subject && <MetadataItem label="Subject" value={metadata.subject} isDark={isDark} />}
          {metadata.keywords && <MetadataItem label="Keywords" value={metadata.keywords} isDark={isDark} />}
        </dl>
      )}

      <Section
        title="Classification"
        hasContent={hasClassificationInfo}
        isDark={isDark}
        headerBadge={<AnalysisSourceBadge source="ai" aiProvider={aiProvider} aiModel={aiModel} isDark={isDark} />}
      >
        <dl className="space-y-4">
          {metadata.fieldOfStudy && <MetadataItem label="Field of Study" value={metadata.fieldOfStudy} isDark={isDark} />}
          {metadata.discipline && <MetadataItem label="Discipline" value={metadata.discipline} isDark={isDark} />}
          {metadata.lcc && metadata.lcc.length > 0 && <LccDisplay classifications={metadata.lcc} isDark={isDark} />}
          {metadata.lcsh && metadata.lcsh.length > 0 && (
            <LcshDisplay
              headings={metadata.lcsh}
              authorityCandidates={metadata.lcshAuthorityCandidates}
              usedAuthorityHeadings={metadata.authorityAlignment?.usedAuthorityHeadings}
              isDark={isDark}
            />
          )}
          {metadata.bisac && metadata.bisac.length > 0 && <BisacDisplay headings={metadata.bisac} isDark={isDark} />}
        </dl>
      </Section>

      <Section
        title="Catalog Provenance"
        hasContent={hasProvenanceInfo}
        isDark={isDark}
        headerBadge={<AnalysisSourceBadge source="system" isDark={isDark} />}
      >
        <dl className="space-y-4">
          {metadata.locAuthority && (
            <MetadataItem
              label="Library of Congress Authority"
              value={
                <div className="space-y-1">
                  <p>
                    {metadata.locAuthority.lcshCandidateCount} subject candidates, {metadata.locAuthority.nameCandidateCount} name candidates.
                  </p>
                  {metadata.locAuthority.itemLink && (
                    <div className="space-y-1">
                      <ProvenanceNote text={`LOC Item ID: ${metadata.locAuthority.itemLink.itemId}`} isDark={isDark} />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={metadata.locAuthority.itemLink.itemUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${
                            isDark ? 'bg-cyan-900 text-cyan-200 hover:bg-cyan-800' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                          }`}
                        >
                          LOC Item
                        </a>
                      </div>
                    </div>
                  )}
                  {metadata.locAuthority.recordLinks && (
                    <div className="space-y-1">
                      <ProvenanceNote text={`LCCN: ${metadata.locAuthority.recordLinks.lccn}`} isDark={isDark} />
                      <div className="flex flex-wrap gap-2 pt-1">
                        <a
                          href={metadata.locAuthority.recordLinks.permalinkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${
                            isDark ? 'bg-cyan-900 text-cyan-200 hover:bg-cyan-800' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                          }`}
                        >
                          LOC Record
                        </a>
                        <a
                          href={metadata.locAuthority.recordLinks.marcXmlUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${
                            isDark ? 'bg-cyan-900 text-cyan-200 hover:bg-cyan-800' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                          }`}
                        >
                          MARCXML
                        </a>
                        <a
                          href={metadata.locAuthority.recordLinks.modsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${
                            isDark ? 'bg-cyan-900 text-cyan-200 hover:bg-cyan-800' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                          }`}
                        >
                          MODS
                        </a>
                        <a
                          href={metadata.locAuthority.recordLinks.bibframe2Url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`inline-flex items-center rounded px-2 py-1 text-xs font-medium ${
                            isDark ? 'bg-cyan-900 text-cyan-200 hover:bg-cyan-800' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'
                          }`}
                        >
                          BIBFRAME2
                        </a>
                      </div>
                    </div>
                  )}
                  {metadata.locAuthority.warnings && metadata.locAuthority.warnings.length > 0 && (
                    <ProvenanceNote text={`Warnings: ${metadata.locAuthority.warnings.join(' | ')}`} isDark={isDark} />
                  )}
                </div>
              }
              isDark={isDark}
            />
          )}
          {metadata.openLibrary && (
            <MetadataItem
              label="Open Library Enrichment"
              value={
                <div className="space-y-1">
                  <p>
                    Mode: {metadata.openLibrary.mode} | Match: {metadata.openLibrary.matchType} | Confidence: {metadata.openLibrary.confidence.toFixed(2)}
                  </p>
                  {metadata.openLibraryBook?.title && (
                    <ProvenanceNote text={`Matched title: ${metadata.openLibraryBook.title}`} isDark={isDark} />
                  )}
                  {metadata.openLibraryBook?.authors && metadata.openLibraryBook.authors.length > 0 && (
                    <ProvenanceNote text={`Matched authors: ${metadata.openLibraryBook.authors.join(', ')}`} isDark={isDark} />
                  )}
                  {metadata.openLibrary.warnings && metadata.openLibrary.warnings.length > 0 && (
                    <ProvenanceNote text={`Warnings: ${metadata.openLibrary.warnings.join(' | ')}`} isDark={isDark} />
                  )}
                </div>
              }
              isDark={isDark}
            />
          )}
          {metadata.hardcover && (
            <MetadataItem
              label="Hardcover Enrichment"
              value={
                <div className="space-y-1">
                  <p>
                    Mode: {metadata.hardcover.mode} | Match: {metadata.hardcover.matchType} | Confidence: {metadata.hardcover.confidence.toFixed(2)}
                  </p>
                  {metadata.hardcoverBook?.title && (
                    <ProvenanceNote text={`Matched title: ${metadata.hardcoverBook.title}`} isDark={isDark} />
                  )}
                  {metadata.hardcoverBook?.authors && metadata.hardcoverBook.authors.length > 0 && (
                    <ProvenanceNote text={`Matched authors: ${metadata.hardcoverBook.authors.join(', ')}`} isDark={isDark} />
                  )}
                  {metadata.hardcoverBook?.series?.name && (
                    <ProvenanceNote
                      text={`Series: ${metadata.hardcoverBook.series.name}${typeof metadata.hardcoverBook.series.position === 'number' ? ` (#${metadata.hardcoverBook.series.position})` : ''}`}
                      isDark={isDark}
                    />
                  )}
                  {metadata.hardcover.warnings && metadata.hardcover.warnings.length > 0 && (
                    <ProvenanceNote text={`Warnings: ${metadata.hardcover.warnings.join(' | ')}`} isDark={isDark} />
                  )}
                </div>
              }
              isDark={isDark}
            />
          )}
          {metadata.authorityAlignment && (
            <MetadataItem
              label="Model Authority Alignment"
              value={
                <div className="space-y-1">
                  {metadata.authorityAlignment.usedAuthorityHeadings.length > 0 && (
                    <ProvenanceNote
                      text={`Used authority headings: ${metadata.authorityAlignment.usedAuthorityHeadings.join(' | ')}`}
                      isDark={isDark}
                    />
                  )}
                  {metadata.authorityAlignment.usedNameAuthorities.length > 0 && (
                    <ProvenanceNote
                      text={`Used authority names: ${metadata.authorityAlignment.usedNameAuthorities.join(' | ')}`}
                      isDark={isDark}
                    />
                  )}
                  {metadata.authorityAlignment.notes && (
                    <ProvenanceNote text={metadata.authorityAlignment.notes} isDark={isDark} />
                  )}
                </div>
              }
              isDark={isDark}
            />
          )}
        </dl>
      </Section>
      
      <Section
        title="Readability Analysis"
        hasContent={hasReadabilityInfo}
        isDark={isDark}
        headerBadge={<AnalysisSourceBadge source="system" isDark={isDark} />}
      >
        <dl className="space-y-4">
          {metadata.readingLevel && <MetadataItem label="Readability (Flesch-Kincaid)" value={`${metadata.readingLevel.level} (Score: ${metadata.readingLevel.score.toFixed(1)})`} isDark={isDark} />}
          {metadata.gunningFog && <MetadataItem label="Readability (Gunning FOG)" value={`${metadata.gunningFog.level} (Score: ${metadata.gunningFog.score.toFixed(1)})`} isDark={isDark} />}
        </dl>
      </Section>

      <Section
        title="Accessibility Details"
        hasContent={hasAccessibilityInfo}
        isDark={isDark}
        headerBadge={<AnalysisSourceBadge source="system" isDark={isDark} />}
      >
        <dl className="space-y-4">
          {metadata.certification && <MetadataItem label={accessibilityMappings.properties.certification || 'Certification'} value={metadata.certification} isDark={isDark} />}
          {metadata.accessibilityFeatures && metadata.accessibilityFeatures.length > 0 && <AccessibilityListItem property="accessibilityFeatures" values={metadata.accessibilityFeatures} isDark={isDark} />}
          {metadata.accessModes && metadata.accessModes.length > 0 && <AccessibilityListItem property="accessModes" values={metadata.accessModes} isDark={isDark} />}
          {metadata.accessModesSufficient && metadata.accessModesSufficient.length > 0 && <AccessibilityListItem property="accessModesSufficient" values={metadata.accessModesSufficient} isDark={isDark} />}
          {metadata.hazards && metadata.hazards.length > 0 && <AccessibilityListItem property="hazards" values={metadata.hazards} isDark={isDark} />}
        </dl>
      </Section>
    </div>
  );
};
