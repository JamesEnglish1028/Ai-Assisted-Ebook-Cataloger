import React from 'react';

interface AccessibilityViolation {
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  rule: string;
  description: string;
  location: string;
  fileTitle: string;
  rulesetTags: string[];
  kbUrl?: string;
  kbTitle?: string;
}

interface AccessibilityMetadata {
  hasAccessibilityFeatures: boolean;
  accessibilityFeatures: string[];
  accessibilityHazards: string[];
  accessibilityAPI: string[];
  accessibilitySummary: string | null;
  conformsTo: string[];
}

interface AccessibilityReport {
  title: string;
  identifier: string;
  language: string;
  publisher: string;
  published: string;
  modified: string;
  epubVersion: string;
  outcome: 'pass' | 'fail';
  totalViolations: number;
  violationsByImpact: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  violationsByRuleset: {
    [key: string]: number;
  };
  violations: AccessibilityViolation[];
  metadata: AccessibilityMetadata;
  outlines?: {
    toc?: string;
    headings?: string;
    html?: string;
  };
  images?: Array<{
    src: string;
    alt?: string;
    role?: string;
    describedby?: string;
  }>;
  generatedAt: string;
  aceVersion: string;
}

interface AccessibilityReportProps {
  report: AccessibilityReport;
  fileName: string;
}

const AccessibilityReportDisplay: React.FC<AccessibilityReportProps> = ({ report, fileName }) => {
  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'critical': return 'text-red-300 bg-red-900/30 border-red-700';
      case 'serious': return 'text-orange-300 bg-orange-900/30 border-orange-700';
      case 'moderate': return 'text-yellow-300 bg-yellow-900/30 border-yellow-700';
      case 'minor': return 'text-blue-300 bg-blue-900/30 border-blue-700';
      default: return 'text-slate-300 bg-slate-900/30 border-slate-700';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'critical': return '🔴';
      case 'serious': return '🟠';
      case 'moderate': return '🟡';
      case 'minor': return '🔵';
      default: return '⚪';
    }
  };

  const downloadReport = () => {
    const dataStr = JSON.stringify(report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `accessibility-report-${fileName.replace(/\.epub$/i, '')}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const totalIssues = report.totalViolations;
  const outcomeIcon = report.outcome === 'pass' ? '✅' : '❌';

  return (
    <div className="bg-slate-800 rounded-lg shadow-xl p-6 border border-slate-700">
      <div className="border-b border-slate-600 pb-4 mb-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
            ♿ Accessibility Report
            <span className="text-xl">{outcomeIcon}</span>
          </h2>
          <button
            onClick={downloadReport}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-800"
          >
            📥 Download Report
          </button>
        </div>
        
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
            <div className="text-sm text-slate-400">Book Title</div>
            <div className="font-medium text-slate-200">{report.title || 'Unknown Title'}</div>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
            <div className="text-sm text-slate-400">Overall Result</div>
            <div className={`font-medium ${report.outcome === 'pass' ? 'text-green-400' : 'text-red-400'}`}>
              {report.outcome.toUpperCase()}
            </div>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
            <div className="text-sm text-slate-400">Total Violations</div>
            <div className="font-medium text-2xl text-slate-200">{totalIssues}</div>
          </div>
          <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-600">
            <div className="text-sm text-slate-400">EPUB Version</div>
            <div className="font-medium text-slate-200">{report.epubVersion || 'Unknown'}</div>
          </div>
        </div>
      </div>

      {/* Violation Summary */}
      {totalIssues > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-3">Violations by Impact Level</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(report.violationsByImpact).map(([impact, count]) => (
              <div key={impact} className={`p-4 rounded-lg border ${getImpactColor(impact)}`}>
                <div className="flex items-center gap-2">
                  <span>{getImpactIcon(impact)}</span>
                  <span className="font-medium capitalize text-slate-200">{impact}</span>
                </div>
                <div className="text-2xl font-bold mt-1">{count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Success Message */}
      {totalIssues === 0 && (
        <div className="mb-6">
          <div className="bg-green-900/30 border border-green-700 p-6 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <h3 className="text-lg font-semibold text-green-400">Excellent Accessibility!</h3>
                <p className="text-green-300 mt-1">No accessibility violations were found in this EPUB. It meets WCAG standards.</p>
                <div className="mt-3 text-sm text-green-200">
                  This EPUB follows accessibility best practices and should be usable by readers with disabilities using assistive technologies.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* WCAG Summary */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-3">WCAG 2.1 Compliance Summary</h3>
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-600">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-2xl mb-2">
                {totalIssues === 0 ? '🟢' : report.violationsByImpact.critical === 0 && report.violationsByImpact.serious === 0 ? '🟡' : '🔴'}
              </div>
              <div className="text-sm font-medium text-slate-300">
                {totalIssues === 0 ? 'Fully Compliant' : report.violationsByImpact.critical === 0 && report.violationsByImpact.serious === 0 ? 'Mostly Compliant' : 'Needs Improvement'}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl text-slate-200 font-bold">{report.violationsByImpact.critical + report.violationsByImpact.serious}</div>
              <div className="text-sm text-slate-400">Critical & Serious Issues</div>
            </div>
            <div className="text-center">
              <div className="text-xl text-slate-200 font-bold">{report.violationsByImpact.moderate + report.violationsByImpact.minor}</div>
              <div className="text-sm text-slate-400">Moderate & Minor Issues</div>
            </div>
          </div>
          {report.summary && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <p className="text-sm text-slate-300">{report.summary}</p>
            </div>
          )}
          {report.recommendations && report.recommendations.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-600">
              <h4 className="text-sm font-medium text-slate-300 mb-2">Recommendations:</h4>
              <ul className="list-disc list-inside space-y-1">
                {report.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-slate-400">{rec}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* WCAG Compliance */}
      {Object.keys(report.violationsByRuleset).length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-3">Standards Compliance</h3>
          <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-600">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(report.violationsByRuleset).map(([ruleset, count]) => (
                <div key={ruleset} className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-300">{ruleset.toUpperCase()}</span>
                  <span className={`px-2 py-1 rounded text-sm ${(count as number) > 0 ? 'bg-red-900/50 text-red-300 border border-red-700' : 'bg-green-900/50 text-green-300 border border-green-700'}`}>
                    {count} issues
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Accessibility Metadata */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-3">Accessibility Metadata</h3>
        <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-600">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-medium text-slate-400">Has Accessibility Features</div>
              <div className={`mt-1 ${report.metadata.hasAccessibilityFeatures ? 'text-green-400' : 'text-red-400'}`}>
                {report.metadata.hasAccessibilityFeatures ? '✅ Yes' : '❌ No'}
              </div>
            </div>
            
            {report.metadata.accessibilityFeatures.length > 0 && (
              <div>
                <div className="text-sm font-medium text-slate-400">Accessibility Features</div>
                <div className="mt-1 text-sm text-slate-300">
                  {report.metadata.accessibilityFeatures.join(', ')}
                </div>
              </div>
            )}
            
            {report.metadata.accessibilityHazards.length > 0 && (
              <div>
                <div className="text-sm font-medium text-slate-400">Accessibility Hazards</div>
                <div className="mt-1 text-sm text-orange-300">
                  {report.metadata.accessibilityHazards.join(', ')}
                </div>
              </div>
            )}
            
            {report.metadata.accessibilitySummary && (
              <div className="md:col-span-2">
                <div className="text-sm font-medium text-slate-400">Accessibility Summary</div>
                <div className="mt-1 text-sm text-slate-300">{report.metadata.accessibilitySummary}</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Violations */}
      {report.violations.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-slate-100 mb-3">Detailed Violations ({report.violations.length})</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {report.violations.map((violation, index) => (
              <div key={index} className="border border-slate-600 bg-slate-900/30 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium border ${getImpactColor(violation.impact)}`}>
                      {getImpactIcon(violation.impact)} {violation.impact.toUpperCase()}
                    </span>
                    <span className="text-sm text-slate-400">
                      {violation.rulesetTags.join(', ')}
                    </span>
                  </div>
                </div>
                
                <h4 className="font-medium text-slate-200 mb-1">{violation.rule}</h4>
                <p className="text-sm text-slate-300 mb-2">{violation.description}</p>
                
                <div className="text-xs text-slate-400 space-y-1">
                  <div><span className="font-medium">Location:</span> {violation.location}</div>
                  {violation.fileTitle && <div><span className="font-medium">File:</span> {violation.fileTitle}</div>}
                </div>
                
                {violation.kbUrl && (
                  <div className="mt-2">
                    <a 
                      href={violation.kbUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors"
                    >
                      📖 Learn more: {violation.kbTitle || 'View documentation'}
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Report Info */}
      <div className="border-t border-slate-600 pt-4 mt-6">
        <div className="text-xs text-slate-400 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <strong className="text-slate-300">Generated:</strong> {new Date().toLocaleString()}
          </div>
          <div>
            <strong className="text-slate-300">Analysis by:</strong> DAISY Ace
          </div>
          <div>
            <strong className="text-slate-300">File:</strong> {fileName}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessibilityReportDisplay;