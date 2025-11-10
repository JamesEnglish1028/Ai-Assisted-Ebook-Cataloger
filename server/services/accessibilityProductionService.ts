import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface AccessibilityViolation {
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  rule: string;
  description: string;
  help: string;
  helpUrl: string;
  location: string;
  element: string;
}

export interface AccessibilityMetadata {
  title: string;
  identifier: string;
  language: string;
  publisher: string;
  published: string;
  modified: string;
  epubVersion: string;
  hasAccessibilityMetadata: boolean;
  accessibilityFeatures: string[];
  accessibilityHazards: string[];
  accessibilitySummary: string;
  conformsTo: string[];
}

export interface AccessibilityReport {
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
  summary: string;
  recommendations: string[];
  wcagCompliance: {
    level: 'A' | 'AA' | 'AAA' | 'None';
    passedTests: number;
    failedTests: number;
    totalTests: number;
    conformanceLevel: string;
  };
}

export class AccessibilityProductionService {
  private static isProductionEnvironment(): boolean {
    return process.env.NODE_ENV === 'production';
  }

  private static isAccessibilityEnabled(): boolean {
    return process.env.ACCESSIBILITY_ENABLED === 'true';
  }

  /**
   * Analyzes EPUB accessibility using either direct DAISY Ace or HTTP service
   */
  static async analyzeAccessibility(epubPath: string): Promise<AccessibilityReport> {
    console.log(`♿ Starting accessibility analysis for: ${path.basename(epubPath)}`);
    
    if (!this.isAccessibilityEnabled()) {
      console.log('♿ Accessibility analysis disabled in production');
      return this.generateMockReport(epubPath);
    }

    try {
      if (this.isProductionEnvironment()) {
        return await this.runDirectAceAnalysis(epubPath);
      } else {
        // In development, try HTTP service first, fallback to direct
        try {
          const { AccessibilityService } = await import('./accessibilityHttpService.js');
          return await AccessibilityService.analyzeAccessibility(epubPath);
        } catch (error: any) {
          console.log('♿ HTTP service unavailable, falling back to direct analysis');
          return await this.runDirectAceAnalysis(epubPath);
        }
      }
    } catch (error: any) {
      console.error('❌ Accessibility analysis failed:', error.message);
      
      // Return a failure report instead of throwing
      return this.generateFailureReport(epubPath, error.message);
    }
  }

  /**
   * Run DAISY Ace analysis directly (production mode)
   */
  private static async runDirectAceAnalysis(epubPath: string): Promise<AccessibilityReport> {
    try {
      console.log('♿ Running direct DAISY Ace analysis...');
      
      // Dynamic import to handle potential missing dependencies
      const ace = await this.loadAceDependencies();
      
      const tempDir = path.join(os.tmpdir(), 'ace-reports', uuidv4());
      fs.mkdirSync(tempDir, { recursive: true });

      console.log('♿ Starting Ace analysis...');
      const result = await ace.analyze(epubPath, {
        cwd: process.cwd(),
        outdir: tempDir,
        tmpdir: path.join(os.tmpdir(), 'ace-tmp'),
        verbose: false,
        silent: true,
      });

      console.log('♿ Processing Ace results...');
      const report = await this.processAceResults(result, epubPath);
      
      // Cleanup temp directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {} // Ignore cleanup errors

      return report;
    } catch (error: any) {
      console.error('❌ Direct Ace analysis failed:', error.message);
      throw new Error(`Direct accessibility analysis failed: ${error.message}`);
    }
  }

  /**
   * Load ACE dependencies with fallback handling
   */
  private static async loadAceDependencies(): Promise<any> {
    try {
      // Try to import DAISY Ace core
      const { createRequire } = await import('module');
      const require = createRequire(import.meta.url);
      
      const ace = require('@daisy/ace-core');
      const axeRunner = require('@daisy/ace-axe-runner-puppeteer');
      
      // Configure Puppeteer for production
      if (this.isProductionEnvironment()) {
        const puppeteerConfig = {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
          ]
        };
        
        // Initialize runner with production config
        await axeRunner.launch(puppeteerConfig);
      } else {
        await axeRunner.launch();
      }

      return {
        analyze: async (epubPath: string, options: any) => {
          try {
            const result = await ace(epubPath, options, axeRunner);
            return Array.isArray(result) && result.length >= 2 ? result[1] : result;
          } finally {
            await axeRunner.close();
          }
        }
      };
    } catch (error: any) {
      console.error('❌ Failed to load ACE dependencies:', error.message);
      throw new Error('DAISY Ace dependencies not available in this environment');
    }
  }

  /**
   * Process DAISY Ace results into our format
   */
  private static async processAceResults(aceResults: any, epubPath: string): Promise<AccessibilityReport> {
    const testSubject = aceResults['earl:testSubject'] || {};
    const violations = this.processViolations(aceResults.assertions || []);
    const metadata = this.extractMetadata(testSubject);
    
    const report: AccessibilityReport = {
      title: testSubject.title || 'Unknown Title',
      identifier: testSubject.identifier || '',
      language: testSubject.language || 'en',
      publisher: testSubject.publisher || '',
      published: testSubject.published || '',
      modified: testSubject.modified || '',
      epubVersion: testSubject.epubVersion || '3.0',
      outcome: violations.length === 0 ? 'pass' : 'fail',
      totalViolations: violations.length,
      violationsByImpact: this.categorizeViolationsByImpact(violations),
      violationsByRuleset: this.categorizeViolationsByRuleset(violations),
      violations,
      metadata,
      summary: this.generateSummary(violations),
      recommendations: this.generateRecommendations(violations),
      wcagCompliance: this.assessWCAGCompliance(violations)
    };

    return report;
  }

  private static processViolations(assertions: any[]): AccessibilityViolation[] {
    const violations: AccessibilityViolation[] = [];
    
    for (const assertion of assertions) {
      if (assertion['earl:result']?.['earl:outcome'] === 'fail') {
        const testCase = assertion['earl:test'];
        const result = assertion['earl:result'];
        
        violations.push({
          impact: testCase['earl:impact'] || 'moderate',
          rule: testCase['dct:title'] || 'Unknown rule',
          description: testCase['dct:description'] || result['dct:description'] || '',
          help: testCase.help || '',
          helpUrl: testCase.helpUrl || '',
          location: result['earl:pointer']?.cfi || assertion['earl:testSubject'] || 'Unknown location',
          element: result.element || ''
        });
      }
    }
    
    return violations;
  }

  private static extractMetadata(testSubject: any): AccessibilityMetadata {
    const metadata = testSubject?.metadata || {};
    
    return {
      title: testSubject.title || 'Unknown Title',
      identifier: testSubject.identifier || '',
      language: testSubject.language || 'en',
      publisher: testSubject.publisher || '',
      published: testSubject.published || '',
      modified: testSubject.modified || '',
      epubVersion: testSubject.epubVersion || '3.0',
      hasAccessibilityMetadata: !!metadata['schema:accessibilityFeature'],
      accessibilityFeatures: Array.isArray(metadata['schema:accessibilityFeature']) 
        ? metadata['schema:accessibilityFeature']
        : metadata['schema:accessibilityFeature'] ? [metadata['schema:accessibilityFeature']] : [],
      accessibilityHazards: Array.isArray(metadata['schema:accessibilityHazard'])
        ? metadata['schema:accessibilityHazard']
        : metadata['schema:accessibilityHazard'] ? [metadata['schema:accessibilityHazard']] : [],
      accessibilitySummary: metadata['schema:accessibilitySummary'] || '',
      conformsTo: testSubject?.links?.['dcterms:conformsTo'] ? 
        (Array.isArray(testSubject.links['dcterms:conformsTo']) 
          ? testSubject.links['dcterms:conformsTo'] 
          : [testSubject.links['dcterms:conformsTo']]) : []
    };
  }

  private static categorizeViolationsByImpact(violations: AccessibilityViolation[]) {
    return violations.reduce((acc, violation) => {
      acc[violation.impact] = (acc[violation.impact] || 0) + 1;
      return acc;
    }, {
      critical: 0,
      serious: 0,
      moderate: 0,
      minor: 0
    });
  }

  private static categorizeViolationsByRuleset(violations: AccessibilityViolation[]) {
    return violations.reduce((acc, violation) => {
      const ruleset = violation.rule.split('-')[0] || 'other';
      acc[ruleset] = (acc[ruleset] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private static assessWCAGCompliance(violations: AccessibilityViolation[]) {
    const criticalViolations = violations.filter(v => v.impact === 'critical').length;
    const seriousViolations = violations.filter(v => v.impact === 'serious').length;
    
    let level: 'A' | 'AA' | 'AAA' | 'None' = 'None';
    if (criticalViolations === 0 && seriousViolations === 0) {
      level = violations.length === 0 ? 'AAA' : 'AA';
    } else if (criticalViolations === 0) {
      level = 'A';
    }

    return {
      level,
      passedTests: 0, // Would need to calculate from full Ace results
      failedTests: violations.length,
      totalTests: violations.length,
      conformanceLevel: `WCAG 2.1 ${level}`
    };
  }

  private static generateSummary(violations: AccessibilityViolation[]): string {
    if (violations.length === 0) {
      return 'This EPUB passes accessibility checks and meets WCAG standards.';
    }

    const critical = violations.filter(v => v.impact === 'critical').length;
    const serious = violations.filter(v => v.impact === 'serious').length;

    let summary = `This EPUB has ${violations.length} accessibility issue${violations.length > 1 ? 's' : ''}`;
    
    if (critical > 0) {
      summary += ` including ${critical} critical issue${critical > 1 ? 's' : ''}`;
    }
    if (serious > 0) {
      summary += ` and ${serious} serious issue${serious > 1 ? 's' : ''}`;
    }
    
    return summary + '.';
  }

  private static generateRecommendations(violations: AccessibilityViolation[]): string[] {
    const recommendations = new Set<string>();
    
    for (const violation of violations) {
      if (violation.rule.includes('color-contrast')) {
        recommendations.add('Improve color contrast ratios to meet WCAG standards');
      }
      if (violation.rule.includes('image-alt')) {
        recommendations.add('Add alternative text descriptions for all images');
      }
      if (violation.rule.includes('heading')) {
        recommendations.add('Use proper heading structure and hierarchy');
      }
    }
    
    if (recommendations.size === 0) {
      recommendations.add('Continue following accessibility best practices');
    }
    
    return Array.from(recommendations);
  }

  /**
   * Generate a mock report when accessibility is disabled
   */
  private static generateMockReport(epubPath: string): AccessibilityReport {
    console.log('♿ Generating mock accessibility report (service disabled)');
    
    return {
      title: 'Accessibility Analysis Disabled',
      identifier: '',
      language: 'en',
      publisher: '',
      published: '',
      modified: '',
      epubVersion: '3.0',
      outcome: 'pass',
      totalViolations: 0,
      violationsByImpact: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      violationsByRuleset: {},
      violations: [],
      metadata: {
        title: 'Accessibility Analysis Disabled',
        identifier: '',
        language: 'en',
        publisher: '',
        published: '',
        modified: '',
        epubVersion: '3.0',
        hasAccessibilityMetadata: false,
        accessibilityFeatures: [],
        accessibilityHazards: [],
        accessibilitySummary: 'Accessibility analysis is disabled in this environment',
        conformsTo: []
      },
      summary: 'Accessibility analysis is currently disabled in production. Enable with ACCESSIBILITY_ENABLED=true environment variable.',
      recommendations: ['Enable accessibility analysis to get detailed recommendations'],
      wcagCompliance: {
        level: 'None',
        passedTests: 0,
        failedTests: 0,
        totalTests: 0,
        conformanceLevel: 'Analysis Disabled'
      }
    };
  }

  /**
   * Generate a failure report when analysis fails
   */
  private static generateFailureReport(epubPath: string, errorMessage: string): AccessibilityReport {
    console.log('♿ Generating failure accessibility report');
    
    return {
      title: 'Accessibility Analysis Failed',
      identifier: '',
      language: 'en',
      publisher: '',
      published: '',
      modified: '',
      epubVersion: '3.0',
      outcome: 'fail',
      totalViolations: 1,
      violationsByImpact: { critical: 1, serious: 0, moderate: 0, minor: 0 },
      violationsByRuleset: { 'analysis-error': 1 },
      violations: [{
        impact: 'critical',
        rule: 'analysis-error',
        description: `Accessibility analysis failed: ${errorMessage}`,
        help: 'Contact support for assistance with accessibility analysis',
        helpUrl: '',
        location: 'analysis-service',
        element: 'service'
      }],
      metadata: {
        title: 'Analysis Failed',
        identifier: '',
        language: 'en',
        publisher: '',
        published: '',
        modified: '',
        epubVersion: '3.0',
        hasAccessibilityMetadata: false,
        accessibilityFeatures: [],
        accessibilityHazards: [],
        accessibilitySummary: 'Accessibility analysis could not be completed',
        conformsTo: []
      },
      summary: `Accessibility analysis failed: ${errorMessage}`,
      recommendations: ['Try again later', 'Contact support if the problem persists'],
      wcagCompliance: {
        level: 'None',
        passedTests: 0,
        failedTests: 1,
        totalTests: 1,
        conformanceLevel: 'Analysis Failed'
      }
    };
  }
}