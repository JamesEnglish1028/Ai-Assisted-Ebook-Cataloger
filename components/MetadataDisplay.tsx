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
  subject?: string;
  keywords?: string;
  identifier?: {
    value: string;
    source: 'text' | 'metadata';
  };
  publisher?: string;
  publicationDate?: string;
  epubVersion?: string;
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
}

const Section: React.FC<{ title: string; children: React.ReactNode; hasContent?: boolean }> = ({ title, children, hasContent = true }) => {
  if (!hasContent) return null;

  return (
    <div className="mt-6 pt-4 border-t border-slate-700">
      <h4 className="text-base font-semibold text-cyan-400 mb-3">{title}</h4>
      {children}
    </div>
  );
};

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

const LccDisplay: React.FC<{ classifications: LccClassification[] }> = ({ classifications }) => {
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
            <dt className="text-sm font-medium text-slate-400">LCC Headings</dt>
            <dd className="mt-1 text-sm text-slate-200 space-y-2">
                {Object.entries(grouped).map(([designator, data]) => (
                    <div key={designator}>
                        <p className="font-semibold flex items-center">
                          <span className="bg-cyan-800 text-cyan-200 text-xs font-mono rounded px-1.5 py-0.5 mr-2">{designator}</span>
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

const BisacDisplay: React.FC<{ headings: string[] }> = ({ headings }) => {
    if (!headings || headings.length === 0) return null;

    return (
        <div>
            <dt className="text-sm font-medium text-slate-400">BISAC Headings</dt>
            <dd className="mt-1 text-sm text-slate-200">
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
                                <span className="bg-cyan-800 text-cyan-200 text-xs font-mono rounded px-1.5 py-0.5 mr-2">{code}</span>
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
}> = ({ property, values }) => {
  // Get the human-readable label for the property (e.g., "Features" for "accessibilityFeatures")
  const label = accessibilityMappings.properties[property] || property;
  
  // Get the map for this property's values
  const valueMap = accessibilityMappings.values[property];

  // Convert the technical values to human-readable strings, falling back to original value if no mapping exists
  const mappedValues = values.map(value => (valueMap && valueMap[value]) ? valueMap[value] : value);
  
  return <MetadataListItem label={label} values={mappedValues} />;
};


export const MetadataDisplay: React.FC<MetadataDisplayProps> = ({ metadata }) => {
  if (!metadata || Object.values(metadata).every(v => !v || (Array.isArray(v) && v.length === 0))) {
    return null;
  }

  const hasCoreInfo = metadata.title || metadata.author || metadata.publisher || metadata.publicationDate || metadata.identifier || metadata.pageCount || metadata.subject || metadata.keywords || metadata.epubVersion;
  // FIX: Coerce truthy/falsy values to actual booleans to match the 'hasContent' prop type of the Section component.
  const hasClassificationInfo = !!(metadata.fieldOfStudy || metadata.discipline || (metadata.lcc && metadata.lcc.length > 0) || (metadata.bisac && metadata.bisac.length > 0) || (metadata.lcsh && metadata.lcsh.length > 0));
  const hasReadabilityInfo = !!(metadata.readingLevel || metadata.gunningFog);
  const hasAccessibilityInfo = !!(metadata.certification || (metadata.accessibilityFeatures && metadata.accessibilityFeatures.length > 0) || (metadata.accessModes && metadata.accessModes.length > 0) || (metadata.accessModesSufficient && metadata.accessModesSufficient.length > 0) || (metadata.hazards && metadata.hazards.length > 0));

  return (
    <div className="w-full mt-6 bg-slate-900/50 p-4 rounded-lg border border-slate-700 animate-fade-in">
      <h3 className="text-lg font-semibold text-cyan-400 mb-3">Book Details</h3>
      
      {hasCoreInfo && (
        <dl className="space-y-4">
          {metadata.title && <MetadataItem label="Title" value={metadata.title} />}
          {metadata.author && <MetadataItem label="Author" value={metadata.author} />}
          {metadata.publisher && <MetadataItem label="Publisher" value={metadata.publisher} />}
          {metadata.publicationDate && <MetadataItem label="Publication Date" value={metadata.publicationDate} />}
          {metadata.epubVersion && <MetadataItem label="EPUB Version" value={metadata.epubVersion} />}
          
          {metadata.pageCount && (
            <MetadataItem 
              label="Pages" 
              value={
                <>
                  {metadata.pageCount.type === 'estimated' && '~'}
                  {metadata.pageCount.value}
                  {metadata.pageCount.type === 'estimated' && <span className="text-xs text-slate-400 ml-2">(estimated)</span>}
                </>
              } 
            />
          )}

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
          {metadata.keywords && <MetadataItem label="Keywords" value={metadata.keywords} />}
        </dl>
      )}

      <Section title="Classification" hasContent={hasClassificationInfo}>
        <dl className="space-y-4">
          {metadata.fieldOfStudy && <MetadataItem label="Field of Study" value={metadata.fieldOfStudy} />}
          {metadata.discipline && <MetadataItem label="Discipline" value={metadata.discipline} />}
          {metadata.lcc && metadata.lcc.length > 0 && <LccDisplay classifications={metadata.lcc} />}
          {metadata.lcsh && metadata.lcsh.length > 0 && <MetadataListItem label="LCSH Headings" values={metadata.lcsh} />}
          {metadata.bisac && metadata.bisac.length > 0 && <BisacDisplay headings={metadata.bisac} />}
        </dl>
      </Section>
      
      <Section title="Readability Analysis" hasContent={hasReadabilityInfo}>
        <dl className="space-y-4">
          {metadata.readingLevel && <MetadataItem label="Readability (Flesch-Kincaid)" value={`${metadata.readingLevel.level} (Score: ${metadata.readingLevel.score.toFixed(1)})`} />}
          {metadata.gunningFog && <MetadataItem label="Readability (Gunning FOG)" value={`${metadata.gunningFog.level} (Score: ${metadata.gunningFog.score.toFixed(1)})`} />}
        </dl>
      </Section>

      <Section title="Accessibility Details" hasContent={hasAccessibilityInfo}>
        <dl className="space-y-4">
          {metadata.certification && <MetadataItem label={accessibilityMappings.properties.certification || 'Certification'} value={metadata.certification} />}
          {metadata.accessibilityFeatures && metadata.accessibilityFeatures.length > 0 && <AccessibilityListItem property="accessibilityFeatures" values={metadata.accessibilityFeatures} />}
          {metadata.accessModes && metadata.accessModes.length > 0 && <AccessibilityListItem property="accessModes" values={metadata.accessModes} />}
          {metadata.accessModesSufficient && metadata.accessModesSufficient.length > 0 && <AccessibilityListItem property="accessModesSufficient" values={metadata.accessModesSufficient} />}
          {metadata.hazards && metadata.hazards.length > 0 && <AccessibilityListItem property="hazards" values={metadata.hazards} />}
        </dl>
      </Section>
    </div>
  );
};