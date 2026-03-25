/**
 * Corpus Validation Rules
 *
 * Contains constants, sub-validators, and helper functions used
 * by the main corpus validator. Separated to keep files under 500 lines.
 */

import type { ValidationError, ValidationWarning } from './validator.js';

// ─── Valid Values ───────────────────────────────────────────────────────────

export const VALID_DOMAINS: readonly string[] = [
  'security',
  'defects',
  'test-generation',
  'coverage-analysis',
  'requirements',
  'contracts',
  'quality',
  'accessibility',
  'performance',
  'chaos-resilience',
  'code-intelligence',
  'enterprise-integration',
  'flaky-tests',
  'visual-regression',
] as const;

export const VALID_LANGUAGES: readonly string[] = [
  'typescript',
  'javascript',
  'python',
  'java',
  'go',
  'rust',
  'csharp',
  'other',
] as const;

export const VALID_DIFFICULTIES: readonly number[] = [1, 2, 3, 4, 5] as const;

export const VALID_SOURCING_METHODS: readonly string[] = [
  'real_cve',
  'historical_bugfix',
  'mutation_seeded',
  'synthetic',
  'adversarial_negative',
] as const;

export const VALID_SEVERITIES: readonly string[] = [
  'critical',
  'high',
  'medium',
  'low',
  'info',
] as const;

/** Minimum number of reviewers per sample (ADR-002 requirement) */
export const MIN_REVIEWERS = 2;

/** Minimum adversarial negative ratio per domain */
export const MIN_ADVERSARIAL_RATIO = 0.2;

// ─── Ground Truth Validation ────────────────────────────────────────────────

export function validateGroundTruth(
  sampleId: string,
  gt: Record<string, unknown>,
  sample: Record<string, unknown>,
  errors: ValidationError[],
  _warnings: ValidationWarning[],
): void {
  const issues = gt.issues;
  const falsePositives = gt.false_positives;

  if (!Array.isArray(issues)) {
    errors.push({
      sample_id: sampleId,
      field: 'ground_truth.issues',
      message: 'ground_truth.issues must be an array',
      severity: 'error',
    });
    return;
  }

  if (!Array.isArray(falsePositives) && falsePositives !== undefined) {
    errors.push({
      sample_id: sampleId,
      field: 'ground_truth.false_positives',
      message: 'ground_truth.false_positives must be an array if present',
      severity: 'error',
    });
  }

  // Rule 5: Must have at least one issue OR be adversarial negative
  const meta = sample.metadata as Record<string, unknown> | undefined;
  const isAdversarialNeg = meta?.sourcing_method === 'adversarial_negative';

  if (issues.length === 0 && !isAdversarialNeg) {
    errors.push({
      sample_id: sampleId,
      field: 'ground_truth.issues',
      message: 'Must have at least one issue unless sourcing_method is adversarial_negative',
      severity: 'error',
    });
  }

  // Rule 6: Location validation for each issue
  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i] as Record<string, unknown>;
    if (!issue) continue;

    validateIssueSeverity(sampleId, issue, i, errors);
    validateIssueLocation(sampleId, issue, i, errors);
  }
}

function validateIssueSeverity(
  sampleId: string,
  issue: Record<string, unknown>,
  index: number,
  errors: ValidationError[],
): void {
  if (typeof issue.severity === 'string' && !VALID_SEVERITIES.includes(issue.severity)) {
    errors.push({
      sample_id: sampleId,
      field: `ground_truth.issues[${index}].severity`,
      message: `Invalid severity: "${issue.severity}". Must be one of: ${VALID_SEVERITIES.join(', ')}`,
      severity: 'error',
    });
  }
}

function validateIssueLocation(
  sampleId: string,
  issue: Record<string, unknown>,
  index: number,
  errors: ValidationError[],
): void {
  const loc = issue.location as Record<string, unknown> | undefined;
  if (!loc || typeof loc !== 'object') {
    errors.push({
      sample_id: sampleId,
      field: `ground_truth.issues[${index}].location`,
      message: 'Each issue must have a location object',
      severity: 'error',
    });
    return;
  }

  if (typeof loc.file !== 'string' || !loc.file) {
    errors.push({
      sample_id: sampleId,
      field: `ground_truth.issues[${index}].location.file`,
      message: 'Location must have a non-empty file path',
      severity: 'error',
    });
  }

  const lineStart = loc.line_start;
  const lineEnd = loc.line_end;

  if (typeof lineStart !== 'number' || typeof lineEnd !== 'number') {
    errors.push({
      sample_id: sampleId,
      field: `ground_truth.issues[${index}].location`,
      message: 'Location must have numeric line_start and line_end',
      severity: 'error',
    });
  } else if (lineStart > lineEnd) {
    errors.push({
      sample_id: sampleId,
      field: `ground_truth.issues[${index}].location`,
      message: `line_start (${lineStart}) must be <= line_end (${lineEnd})`,
      severity: 'error',
    });
  } else if (lineStart < 1) {
    errors.push({
      sample_id: sampleId,
      field: `ground_truth.issues[${index}].location.line_start`,
      message: `line_start must be >= 1, got ${lineStart}`,
      severity: 'error',
    });
  }
}

// ─── Metadata Validation ────────────────────────────────────────────────────

export function validateMetadata(
  sampleId: string,
  meta: Record<string, unknown>,
  errors: ValidationError[],
  _warnings: ValidationWarning[],
): void {
  if (typeof meta.sourcing_method === 'string') {
    if (!VALID_SOURCING_METHODS.includes(meta.sourcing_method)) {
      errors.push({
        sample_id: sampleId,
        field: 'metadata.sourcing_method',
        message: `Invalid sourcing_method: "${meta.sourcing_method}". ` +
          `Must be one of: ${VALID_SOURCING_METHODS.join(', ')}`,
        severity: 'error',
      });
    }
  } else {
    errors.push({
      sample_id: sampleId,
      field: 'metadata.sourcing_method',
      message: 'metadata.sourcing_method is required and must be a string',
      severity: 'error',
    });
  }

  if (typeof meta.source !== 'string' || !meta.source) {
    errors.push({
      sample_id: sampleId,
      field: 'metadata.source',
      message: 'metadata.source is required and must be a non-empty string',
      severity: 'error',
    });
  }

  if (typeof meta.human_verified !== 'boolean') {
    errors.push({
      sample_id: sampleId,
      field: 'metadata.human_verified',
      message: 'metadata.human_verified must be a boolean',
      severity: 'error',
    });
  }

  if (typeof meta.verification_date !== 'string' || !meta.verification_date) {
    errors.push({
      sample_id: sampleId,
      field: 'metadata.verification_date',
      message: 'metadata.verification_date is required',
      severity: 'error',
    });
  }

  if (!Array.isArray(meta.verified_by)) {
    errors.push({
      sample_id: sampleId,
      field: 'metadata.verified_by',
      message: 'metadata.verified_by must be an array',
      severity: 'error',
    });
  } else if (meta.verified_by.length < MIN_REVIEWERS) {
    errors.push({
      sample_id: sampleId,
      field: 'metadata.verified_by',
      message: `Must have at least ${MIN_REVIEWERS} reviewers, got ${meta.verified_by.length}`,
      severity: 'error',
    });
  }
}

// ─── ID Format Validation ───────────────────────────────────────────────────

/**
 * Rule 10: ID must match pattern `domain-category-NNN`.
 * Example: security-sql-injection-001
 */
export function validateIdFormat(
  sampleId: string,
  sample: Record<string, unknown>,
  errors: ValidationError[],
): void {
  if (typeof sample.id !== 'string') return;

  const domain = sample.domain as string;
  const category = sample.category as string;

  if (typeof domain !== 'string' || typeof category !== 'string') return;

  const expectedPrefix = `${domain}-${category}-`;
  if (!sample.id.startsWith(expectedPrefix)) {
    errors.push({
      sample_id: sampleId,
      field: 'id',
      message: `ID must start with "${expectedPrefix}" (pattern: domain-category-NNN)`,
      severity: 'error',
    });
    return;
  }

  const suffix = sample.id.slice(expectedPrefix.length);
  if (!/^\d{3,}$/.test(suffix)) {
    errors.push({
      sample_id: sampleId,
      field: 'id',
      message: `ID suffix "${suffix}" must be a zero-padded numeric sequence (e.g., 001, 042)`,
      severity: 'error',
    });
  }
}
