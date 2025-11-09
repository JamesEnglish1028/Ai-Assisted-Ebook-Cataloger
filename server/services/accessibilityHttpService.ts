import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';

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

export class AccessibilityService {
  private static readonly ACE_SERVICE_URL = 'http://localhost:8000';
  
  /**
   * Analyzes EPUB accessibility using the DAISY Ace HTTP service
   */
  static async analyzeAccessibility(epubPath: string): Promise<AccessibilityReport> {
    try {
      winston.info(`Starting accessibility analysis for: ${epubPath}`);
      
      // First check if ACE service is available
      await this.checkServiceAvailability();
      
      // Upload EPUB to DAISY Ace service
      const jobId = await this.submitAnalysisJob(epubPath);
      winston.info(`Analysis job submitted with ID: ${jobId}`);
      
      // Poll for results
      const aceResults = await this.waitForResults(jobId);
      winston.info('Analysis completed, processing results');
      
      // Process and format the results
      const report = await this.processAceResults(aceResults, epubPath);
      
      return report;
    } catch (error: any) {
      winston.error('Accessibility analysis failed:', error);
      throw new Error(`Accessibility analysis failed: ${error.message}`);
    }
  }

  /**
   * Check if DAISY Ace HTTP service is available
   */
  private static async checkServiceAvailability(): Promise<void> {
    try {
      const fetch = (await import('node-fetch')).default;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${this.ACE_SERVICE_URL}/jobs`, {
        method: 'GET',
        signal: controller.signal as any
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Service not available: HTTP ${response.status}`);
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error(`DAISY Ace service timeout at ${this.ACE_SERVICE_URL}`);
      }
      throw new Error(`DAISY Ace service is not available at ${this.ACE_SERVICE_URL}. Please ensure the service is running with: npx ace-http -p 8000`);
    }
  }

  /**
   * Submit EPUB file to DAISY Ace HTTP service
   */
  private static async submitAnalysisJob(epubPath: string): Promise<string> {
    try {
      const FormData = (await import('form-data')).default;
      const fetch = (await import('node-fetch')).default;
      
      const form = new FormData();
      form.append('epub', fs.createReadStream(epubPath));
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${this.ACE_SERVICE_URL}/jobs`, {
        method: 'POST',
        body: form as any,
        headers: {
          ...form.getHeaders(),
        },
        signal: controller.signal as any
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }
      
      const result = await response.json() as any;
      
      if (!result.job) {
        throw new Error('No job URL returned from DAISY Ace service');
      }
      
      // Extract job ID from the job URL (e.g., "http://localhost:8000/jobs/uuid" -> "uuid")
      const jobId = result.job.split('/').pop();
      if (!jobId) {
        throw new Error('Invalid job URL format from DAISY Ace service');
      }
      
      return jobId;
    } catch (error: any) {
      winston.error('Failed to submit analysis job:', error);
      throw error;
    }
  }

  /**
   * Poll DAISY Ace service for analysis results
   */
  private static async waitForResults(jobId: string, maxAttempts: number = 60, interval: number = 2000): Promise<any> {
    const fetch = (await import('node-fetch')).default;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch(`${this.ACE_SERVICE_URL}/jobs/${jobId}`, {
          signal: controller.signal as any
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const result = await response.json() as any;
        
        // Status 0 = completed, 1 = processing, -1 = error
        if (result.status === 0) {
          // Fetch the actual JSON report
          if (result.report && result.report.json) {
            const reportResponse = await fetch(result.report.json, {
              signal: controller.signal as any
            });
            if (!reportResponse.ok) {
              throw new Error(`Failed to fetch report: HTTP ${reportResponse.status}`);
            }
            return await reportResponse.json();
          } else {
            throw new Error('No JSON report URL available');
          }
        } else if (result.status === -1) {
          throw new Error(`Analysis failed: ${result.error || 'Unknown error'}`);
        }
        
        // Job still processing, wait and try again
        winston.info(`Analysis job ${jobId} still processing... (attempt ${attempt}/${maxAttempts})`);
        await this.sleep(interval);
        
      } catch (error: any) {
        if (attempt === maxAttempts) {
          throw new Error(`Failed to get results after ${maxAttempts} attempts: ${error.message}`);
        }
        winston.warn(`Attempt ${attempt} failed, retrying: ${error.message}`);
        await this.sleep(interval);
      }
    }
    
    throw new Error(`Analysis timed out after ${maxAttempts} attempts`);
  }

  /**
   * Process DAISY Ace results into our format
   */
  private static async processAceResults(aceResults: any, epubPath: string): Promise<AccessibilityReport> {
    const violations = this.processViolations(aceResults.assertions || []);
    const metadata = this.extractMetadata(aceResults);
    const violationsByImpact = this.categorizeViolationsByImpact(violations);
    const violationsByRuleset = this.categorizeViolationsByRuleset(violations);
    const wcagCompliance = this.assessWCAGCompliance(violations, aceResults);
    
    const report: AccessibilityReport = {
      title: metadata.title,
      identifier: metadata.identifier,
      language: metadata.language,
      publisher: metadata.publisher,
      published: metadata.published,
      modified: metadata.modified,
      epubVersion: metadata.epubVersion,
      outcome: violations.length === 0 ? 'pass' : 'fail',
      totalViolations: violations.length,
      violationsByImpact,
      violationsByRuleset,
      violations,
      metadata,
      summary: this.generateSummary(violations, wcagCompliance),
      recommendations: this.generateRecommendations(violations),
      wcagCompliance
    };

    return report;
  }

  private static processViolations(assertions: any[]): AccessibilityViolation[] {
    const violations: AccessibilityViolation[] = [];
    
    for (const assertion of assertions) {
      if (assertion.assertions) {
        for (const subAssertion of assertion.assertions) {
          if (subAssertion.result === 'fail' && subAssertion.violations) {
            for (const violation of subAssertion.violations) {
              violations.push({
                impact: violation.impact || 'moderate',
                rule: subAssertion.rule?.ruleId || 'unknown',
                description: violation.description || subAssertion.rule?.description || 'No description available',
                help: subAssertion.rule?.help || 'No help available',
                helpUrl: subAssertion.rule?.helpUrl || '',
                location: assertion.source || 'unknown',
                element: violation.target ? violation.target.join(', ') : 'unknown'
              });
            }
          }
        }
      }
    }
    
    return violations;
  }

  private static extractMetadata(aceResults: any): AccessibilityMetadata {
    const metadata = aceResults.properties || {};
    
    return {
      title: metadata.title || 'Unknown Title',
      identifier: metadata.identifier || 'Unknown',
      language: metadata.language || 'en',
      publisher: metadata.publisher || 'Unknown Publisher',
      published: metadata.published || 'Unknown',
      modified: metadata.modified || 'Unknown',
      epubVersion: metadata.renditionLayout || 'Unknown',
      hasAccessibilityMetadata: Boolean(metadata.accessibilityFeatures?.length),
      accessibilityFeatures: metadata.accessibilityFeatures || [],
      accessibilityHazards: metadata.accessibilityHazards || [],
      accessibilitySummary: metadata.accessibilitySummary || '',
      conformsTo: metadata.conformsTo || []
    };
  }

  private static categorizeViolationsByImpact(violations: AccessibilityViolation[]): {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  } {
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

  private static assessWCAGCompliance(violations: AccessibilityViolation[], aceResults: any) {
    const criticalViolations = violations.filter(v => v.impact === 'critical').length;
    const seriousViolations = violations.filter(v => v.impact === 'serious').length;
    const totalTests = violations.length + (aceResults.passedTests || 0);
    
    let level: 'A' | 'AA' | 'AAA' | 'None' = 'None';
    if (criticalViolations === 0 && seriousViolations === 0) {
      level = 'AA';
      if (violations.length === 0) {
        level = 'AAA';
      }
    } else if (criticalViolations === 0) {
      level = 'A';
    }

    return {
      level,
      passedTests: totalTests - violations.length,
      failedTests: violations.length,
      totalTests,
      conformanceLevel: `WCAG 2.1 ${level}`
    };
  }

  private static generateSummary(violations: AccessibilityViolation[], wcag: any): string {
    if (violations.length === 0) {
      return 'This EPUB passes all accessibility checks and meets WCAG AAA standards.';
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
    
    summary += `. Current WCAG compliance level: ${wcag.level}.`;
    
    return summary;
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
      if (violation.rule.includes('link')) {
        recommendations.add('Ensure all links have descriptive text');
      }
      if (violation.rule.includes('table')) {
        recommendations.add('Add proper table headers and captions');
      }
    }
    
    if (recommendations.size === 0) {
      recommendations.add('Continue following accessibility best practices');
    }
    
    return Array.from(recommendations);
  }

  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}