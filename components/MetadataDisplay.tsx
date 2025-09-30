import React from 'react';

interface ReadingLevel {
  score: number;
  level: string;
}

export interface FileMetadata {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  identifier?: {
    value: string;
    source: 'text' | 'metadata';
  };
  publisher?: string;
  publicationDate?: string;
  // Accessibility
  accessibilityFeatures?: string[];
  accessModes?: string[];
  accessModesSufficient?: string[];
  hazards?: string[];
  certification?: string;
  // AI Generated
  lcc?: string[];
  bisac?: string[];
  // Calculated
  readingLevel?: ReadingLevel;
  gunningFog?: ReadingLevel;
}

interface MetadataDisplayProps {
  metadata: FileMetadata | null;
}

const MetadataItem: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-sm font-medium text-slate-400 truncate">{label}</dt>
    <dd className="mt-1 text-sm text-slate-200">{value}</dd>
  </div>
);

const MetadataListItem: React.FC<{ label: string; values: string[] }> = ({ label, values }) => (
    <div>
      <dt className="text-sm font-medium text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200">
        <ul className="list-disc list-inside space-y-1">
          {values.map((value, index) => <li key={index}>{value}</li>)}
        </ul>
      </dd>
    </div>
  );

export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({ metadata }) => {
  if (!metadata || Object.values(metadata).every(v => !v || (Array.isArray(v) && v.length === 0))) {
    return null;
  }

  return (
    <div className="w-full mt-6 bg-slate-900/50 p-4 rounded-lg border border-slate-700 animate-fade-in">
      <h3 className="text-lg font-semibold text-cyan-400 mb-3">Book Details</h3>
      <dl className="space-y-4">
        {metadata.title && <MetadataItem label="Title" value={metadata.title} />}
        {metadata.author && <MetadataItem label="Author" value={metadata.author} />}
        {metadata.publisher && <MetadataItem label="Publisher" value={metadata.publisher} />}
        {metadata.publicationDate && <MetadataItem label="Publication Date" value={metadata.publicationDate} />}
        {metadata.identifier && (
            <MetadataItem 
                label="Identifier / ISBN" 
                value={
                    <>
                        {metadata.identifier.value}
                        {metadata.identifier.source === 'text' && <span className="text-xs text-slate-400 ml-2">(from text)</span>}
                    </>
                } 
            />
        )}
        {metadata.subject && <MetadataItem label="Subject" value={metadata.subject} />}
        {metadata.readingLevel && <MetadataItem label="Readability (Flesch-Kincaid)" value={`${metadata.readingLevel.level} (Score: ${metadata.readingLevel.score.toFixed(1)})`} />}
        {metadata.gunningFog && <MetadataItem label="Readability (Gunning FOG)" value={`${metadata.gunningFog.level} (Score: ${metadata.gunningFog.score.toFixed(1)})`} />}
        {metadata.keywords && <MetadataItem label="Keywords" value={metadata.keywords} />}
        {metadata.lcc && metadata.lcc.length > 0 && <MetadataListItem label="LCC Headings" values={metadata.lcc} />}
        {metadata.bisac && metadata.bisac.length > 0 && <MetadataListItem label="BISAC Headings" values={metadata.bisac} />}
      </dl>

      <h3 className="text-lg font-semibold text-cyan-400 mb-3 mt-6 pt-4 border-t border-slate-700">Accessibility Details</h3>
      <dl className="space-y-4">
        <MetadataItem label="Certification" value={metadata.certification || 'Unknown'} />
        <MetadataListItem label="Features" values={metadata.accessibilityFeatures?.length ? metadata.accessibilityFeatures : ['Unknown']} />
        <MetadataListItem label="Access Modes" values={metadata.accessModes?.length ? metadata.accessModes : ['Unknown']} />
        <MetadataListItem label="Sufficient Access Modes" values={metadata.accessModesSufficient?.length ? metadata.accessModesSufficient : ['Unknown']} />
        <MetadataListItem label="Hazards" values={metadata.hazards?.length ? metadata.hazards : ['Unknown']} />
      </dl>
    </div>
  );
};