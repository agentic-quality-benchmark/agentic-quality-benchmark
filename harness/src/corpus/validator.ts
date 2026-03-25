/**
 * Corpus Validator
 *
 * Validates corpus samples against the AQB schema and quality rules.
 * Checks structure, domain validity, difficulty ranges, reviewer counts,
 * adversarial negative ratios, and ID format conventions.
 */

import type { CorpusSample } from '../types.js';
import {
  VALID_DOMAINS,
  VALID_LANGUAGES,
  VALID_DIFFICULTIES,
  MIN_REVIEWERS,
  MIN_ADVERSARIAL_RATIO,
  validateGroundTruth,
  validateMetadata,
  validateIdFormat,
} from './rules.js';

// ─── Validation Result Types ────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  stats: ValidationStats;
}

export interface ValidationError {
  sample_id: string;
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  sample_id: string;
  field: string;
  message: string;
}

export interface ValidationStats {
  total_samples: number;
  valid_samples: number;
  invalid_samples: number;
  domains_covered: string[];
  domains_missing: string[];
  adversarial_negative_ratio: Record<string, number>;
  reviewer_coverage: {
    meets_minimum: boolean;
    samples_below_threshold: string[];
  };
}

// ─── Manifest Types ─────────────────────────────────────────────────────────

export interface ManifestDomain {
  categories: string[];
  target_samples: number;
  current_samples: number;
  status: string;
}

export type Manifest = Record<string, ManifestDomain>;

// ─── Single Sample Validation ───────────────────────────────────────────────

/**
 * Validate a single corpus sample against all schema and quality rules.
 */
export function validateSample(
  sample: Record<string, unknown>,
  manifest?: Manifest,
): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const sampleId = typeof sample.id === 'string' ? sample.id : '<unknown>';

  // Rule 1: Required fields
  const requiredFields = [
    'id', 'domain', 'category', 'language',
    'difficulty', 'files', 'ground_truth', 'metadata',
  ];

  for (const field of requiredFields) {
    if (sample[field] === undefined || sample[field] === null) {
      errors.push({
        sample_id: sampleId,
        field,
        message: `Missing required field: ${field}`,
        severity: 'error',
      });
    }
  }

  // If critical fields are missing, skip deeper validation
  if (errors.length > 0) {
    return { errors, warnings };
  }

  // Rule 2: Domain validation
  if (!VALID_DOMAINS.includes(sample.domain as string)) {
    errors.push({
      sample_id: sampleId,
      field: 'domain',
      message: `Invalid domain: "${sample.domain}". Must be one of: ${VALID_DOMAINS.join(', ')}`,
      severity: 'error',
    });
  }

  // Rule 3: Difficulty validation
  if (
    typeof sample.difficulty !== 'number' ||
    !VALID_DIFFICULTIES.includes(sample.difficulty) ||
    !Number.isInteger(sample.difficulty)
  ) {
    errors.push({
      sample_id: sampleId,
      field: 'difficulty',
      message: `Invalid difficulty: "${sample.difficulty}". Must be an integer 1-5`,
      severity: 'error',
    });
  }

  // Rule 4: Language validation
  if (!VALID_LANGUAGES.includes(sample.language as string)) {
    errors.push({
      sample_id: sampleId,
      field: 'language',
      message: `Invalid language: "${sample.language}". Must be one of: ${VALID_LANGUAGES.join(', ')}`,
      severity: 'error',
    });
  }

  // Validate files array
  validateFiles(sampleId, sample, errors);

  // Validate ground_truth
  const gt = sample.ground_truth as Record<string, unknown> | undefined;
  if (gt && typeof gt === 'object') {
    validateGroundTruth(sampleId, gt, sample, errors, warnings);
  } else {
    errors.push({
      sample_id: sampleId,
      field: 'ground_truth',
      message: 'ground_truth must be an object',
      severity: 'error',
    });
  }

  // Validate metadata
  const meta = sample.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta === 'object') {
    validateMetadata(sampleId, meta, errors, warnings);
  } else {
    errors.push({
      sample_id: sampleId,
      field: 'metadata',
      message: 'metadata must be an object',
      severity: 'error',
    });
  }

  // Rule 9: Category validation (against manifest)
  if (manifest && typeof sample.domain === 'string' && typeof sample.category === 'string') {
    const domainManifest = manifest[sample.domain];
    if (domainManifest && !domainManifest.categories.includes(sample.category)) {
      errors.push({
        sample_id: sampleId,
        field: 'category',
        message: `Category "${sample.category}" is not in the manifest for domain "${sample.domain}". ` +
          `Valid categories: ${domainManifest.categories.join(', ')}`,
        severity: 'error',
      });
    }
  }

  // Rule 10: ID format validation
  validateIdFormat(sampleId, sample, errors);

  return { errors, warnings };
}

// ─── Files Validation ───────────────────────────────────────────────────────

function validateFiles(
  sampleId: string,
  sample: Record<string, unknown>,
  errors: ValidationError[],
): void {
  if (!Array.isArray(sample.files)) {
    errors.push({
      sample_id: sampleId,
      field: 'files',
      message: 'files must be an array',
      severity: 'error',
    });
    return;
  }

  if (sample.files.length === 0) {
    errors.push({
      sample_id: sampleId,
      field: 'files',
      message: 'files array must not be empty',
      severity: 'error',
    });
    return;
  }

  for (let i = 0; i < sample.files.length; i++) {
    const file = sample.files[i] as Record<string, unknown>;
    if (!file || typeof file.path !== 'string' || typeof file.content !== 'string') {
      errors.push({
        sample_id: sampleId,
        field: `files[${i}]`,
        message: 'Each file must have a string path and string content',
        severity: 'error',
      });
    }
  }
}

// ─── Corpus-Level Validation ────────────────────────────────────────────────

/**
 * Validate a full corpus of samples, returning aggregate results and stats.
 */
export function validateCorpus(
  samples: CorpusSample[],
  manifest?: Manifest,
): ValidationResult {
  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];
  const invalidIds = new Set<string>();

  // Per-domain tracking for adversarial negative ratio
  const domainTotals: Record<string, number> = {};
  const domainAdversarial: Record<string, number> = {};

  // Reviewer coverage tracking
  const samplesBelowThreshold: string[] = [];

  // Validate each sample individually
  for (const sample of samples) {
    const raw = sample as unknown as Record<string, unknown>;
    const { errors, warnings } = validateSample(raw, manifest);

    allErrors.push(...errors);
    allWarnings.push(...warnings);

    if (errors.length > 0) {
      invalidIds.add(sample.id);
    }

    // Track domain counts
    if (typeof sample.domain === 'string') {
      domainTotals[sample.domain] = (domainTotals[sample.domain] || 0) + 1;
      if (sample.metadata?.sourcing_method === 'adversarial_negative') {
        domainAdversarial[sample.domain] = (domainAdversarial[sample.domain] || 0) + 1;
      }
    }

    // Track reviewer coverage
    if (
      sample.metadata?.verified_by &&
      Array.isArray(sample.metadata.verified_by) &&
      sample.metadata.verified_by.length < MIN_REVIEWERS
    ) {
      samplesBelowThreshold.push(sample.id);
    }
  }

  // Rule 8: Check adversarial negative ratio per domain
  const adversarialRatios: Record<string, number> = {};
  for (const domain of Object.keys(domainTotals)) {
    const total = domainTotals[domain];
    const adversarial = domainAdversarial[domain] || 0;
    const ratio = total > 0 ? adversarial / total : 0;
    adversarialRatios[domain] = ratio;

    if (ratio < MIN_ADVERSARIAL_RATIO) {
      allWarnings.push({
        sample_id: '*',
        field: 'adversarial_negative_ratio',
        message: `Domain "${domain}" has ${(ratio * 100).toFixed(1)}% adversarial negatives ` +
          `(${adversarial}/${total}), below the ${MIN_ADVERSARIAL_RATIO * 100}% minimum`,
      });
    }
  }

  // Compute domain coverage
  const domainsCovered: string[] = [...new Set(
    samples.map(s => s.domain as string).filter(d => VALID_DOMAINS.includes(d)),
  )];
  const domainsMissing = VALID_DOMAINS.filter(d => !domainsCovered.includes(d));

  // Check for duplicate IDs
  checkDuplicateIds(samples, allErrors, invalidIds);

  const stats: ValidationStats = {
    total_samples: samples.length,
    valid_samples: samples.length - invalidIds.size,
    invalid_samples: invalidIds.size,
    domains_covered: domainsCovered,
    domains_missing: domainsMissing,
    adversarial_negative_ratio: adversarialRatios,
    reviewer_coverage: {
      meets_minimum: samplesBelowThreshold.length === 0,
      samples_below_threshold: samplesBelowThreshold,
    },
  };

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    stats,
  };
}

function checkDuplicateIds(
  samples: CorpusSample[],
  errors: ValidationError[],
  invalidIds: Set<string>,
): void {
  const seenIds = new Map<string, number>();
  for (const sample of samples) {
    const count = seenIds.get(sample.id) || 0;
    seenIds.set(sample.id, count + 1);
  }
  for (const [id, count] of seenIds) {
    if (count > 1) {
      errors.push({
        sample_id: id,
        field: 'id',
        message: `Duplicate ID: "${id}" appears ${count} times`,
        severity: 'error',
      });
      invalidIds.add(id);
    }
  }
}
