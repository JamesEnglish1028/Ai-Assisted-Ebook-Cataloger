import React from 'react';
import { accessibilityMappings } from '../utils/accessibilityMappings';

interface ReadingLevel {
  score: number;
  level: string;
}

interface LccClassification {
  designator: string;
  mainClass: string;
  subClass: string;
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
  // Calculated
  readingLevel?: ReadingLevel;
  gunningFog?: ReadingLevel;
}

interface MetadataDisplayProps {
  metadata: FileMetadata | null;
  isDark: boolean;
}

const Section: React.FC<{ title: string; children: React.ReactNode; hasContent?: boolean; isDark: boolean }> = ({ title, children, hasContent = true, isDark }) => {
  if (!hasContent) return null;

  return (
    <div className={`mt-6 pt-4 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
      <h4 className={`text-base font-semibold mb-3 ${isDark ? 'text-cyan-400' : 'text-cyan-600'}`}>{title}</h4>
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


export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({ metadata, isDark }) => {
  if (!metadata || Object.values(metadata).every(v => !v || (Array.isArray(v) && v.length === 0))) {
    return null;
  }

  const isAudiobook = metadata.sourceFormat === 'audiobook';
  const hasCoreInfo = metadata.title || metadata.author || metadata.narrator || metadata.publisher || metadata.publicationDate || metadata.identifier || metadata.pageCount || metadata.subject || metadata.keywords || metadata.epubVersion || metadata.language || metadata.duration || metadata.audioFormat || metadata.audioTrackCount;
  // FIX: Coerce truthy/falsy values to actual booleans to match the 'hasContent' prop type of the Section component.
  const hasClassificationInfo = !!(metadata.fieldOfStudy || metadata.discipline || (metadata.lcc && metadata.lcc.length > 0) || (metadata.bisac && metadata.bisac.length > 0) || (metadata.lcsh && metadata.lcsh.length > 0));
  const hasReadabilityInfo = !isAudiobook && !!(metadata.readingLevel || metadata.gunningFog);
  const hasAccessibilityInfo = !isAudiobook && !!(metadata.certification || (metadata.accessibilityFeatures && metadata.accessibilityFeatures.length > 0) || (metadata.accessModes && metadata.accessModes.length > 0) || (metadata.accessModesSufficient && metadata.accessModesSufficient.length > 0) || (metadata.hazards && metadata.hazards.length > 0));

  return (
    <div className="w-full mt-6 p-4 rounded-xl border border-slate-200 bg-white animate-fade-in">
      <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest mb-3">Publication Details</h3>
      
      {hasCoreInfo && (
        <dl className="space-y-4">
          {metadata.title && <MetadataItem label="Title" value={metadata.title} isDark={isDark} />}
          {metadata.author && <MetadataItem label="Author" value={metadata.author} isDark={isDark} />}
          {metadata.narrator && <MetadataItem label="Narrator" value={metadata.narrator} isDark={isDark} />}
          {metadata.publisher && <MetadataItem label="Publisher" value={metadata.publisher} isDark={isDark} />}
          {metadata.publicationDate && <MetadataItem label="Publication Date" value={metadata.publicationDate} isDark={isDark} />}
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

      <Section title="Classification" hasContent={hasClassificationInfo} isDark={isDark}>
        <dl className="space-y-4">
          {metadata.fieldOfStudy && <MetadataItem label="Field of Study" value={metadata.fieldOfStudy} isDark={isDark} />}
          {metadata.discipline && <MetadataItem label="Discipline" value={metadata.discipline} isDark={isDark} />}
          {metadata.lcc && metadata.lcc.length > 0 && <LccDisplay classifications={metadata.lcc} isDark={isDark} />}
          {metadata.lcsh && metadata.lcsh.length > 0 && <MetadataListItem label="LCSH Headings" values={metadata.lcsh} isDark={isDark} />}
          {metadata.bisac && metadata.bisac.length > 0 && <BisacDisplay headings={metadata.bisac} isDark={isDark} />}
        </dl>
      </Section>
      
      <Section title="Readability Analysis" hasContent={hasReadabilityInfo} isDark={isDark}>
        <dl className="space-y-4">
          {metadata.readingLevel && <MetadataItem label="Readability (Flesch-Kincaid)" value={`${metadata.readingLevel.level} (Score: ${metadata.readingLevel.score.toFixed(1)})`} isDark={isDark} />}
          {metadata.gunningFog && <MetadataItem label="Readability (Gunning FOG)" value={`${metadata.gunningFog.level} (Score: ${metadata.gunningFog.score.toFixed(1)})`} isDark={isDark} />}
        </dl>
      </Section>

      <Section title="Accessibility Details" hasContent={hasAccessibilityInfo} isDark={isDark}>
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
