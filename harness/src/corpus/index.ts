/**
 * Corpus Module - Barrel Exports
 *
 * Provides corpus loading, validation, and reporting utilities.
 */

import type { CorpusSample } from '../types.js';
import {
  validateCorpus,
  type ValidationResult,
  type ValidationError,
  type ValidationWarning,
  type ValidationStats,
  type Manifest,
  type ManifestDomain,
  validateSample,
} from './validator.js';
import { loadCorpusFromDirectory, loadManifest } from './loader.js';

// Re-export all public APIs
export {
  validateCorpus,
  validateSample,
  loadCorpusFromDirectory,
  loadManifest,
};

export type {
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationStats,
  Manifest,
  ManifestDomain,
};

/**
 * Load corpus from a directory, validate it, and print a human-readable report.
 *
 * @param dir - Path to the corpus directory
 */
export function validateAndReport(dir: string): void {
  const samples = loadCorpusFromDirectory(dir);
  const manifest = loadManifest(dir);
  const result = validateCorpus(samples, manifest);

  printReport(result);
}

// ─── Report Formatting ─────────────────────────────────────────────────────

function printReport(result: ValidationResult): void {
  const { stats, errors, warnings } = result;

  console.log('');
  console.log('=== AQB Corpus Validation Report ===');
  console.log('');

  // Summary
  console.log(`Status: ${result.valid ? 'VALID' : 'INVALID'}`);
  console.log(`Total samples:   ${stats.total_samples}`);
  console.log(`Valid samples:   ${stats.valid_samples}`);
  console.log(`Invalid samples: ${stats.invalid_samples}`);
  console.log('');

  // Domain coverage
  console.log('--- Domain Coverage ---');
  console.log(`Covered: ${stats.domains_covered.length}/14`);
  if (stats.domains_covered.length > 0) {
    console.log(`  Present: ${stats.domains_covered.join(', ')}`);
  }
  if (stats.domains_missing.length > 0) {
    console.log(`  Missing: ${stats.domains_missing.join(', ')}`);
  }
  console.log('');

  // Adversarial negative ratios
  const ratioEntries = Object.entries(stats.adversarial_negative_ratio);
  if (ratioEntries.length > 0) {
    console.log('--- Adversarial Negative Ratios ---');
    for (const [domain, ratio] of ratioEntries) {
      const pct = (ratio * 100).toFixed(1);
      const status = ratio >= 0.2 ? 'OK' : 'BELOW 20%';
      console.log(`  ${domain}: ${pct}% [${status}]`);
    }
    console.log('');
  }

  // Reviewer coverage
  console.log('--- Reviewer Coverage ---');
  if (stats.reviewer_coverage.meets_minimum) {
    console.log('  All samples meet the minimum 2-reviewer requirement.');
  } else {
    console.log(
      `  ${stats.reviewer_coverage.samples_below_threshold.length} sample(s) below threshold:`,
    );
    for (const id of stats.reviewer_coverage.samples_below_threshold) {
      console.log(`    - ${id}`);
    }
  }
  console.log('');

  // Errors
  if (errors.length > 0) {
    console.log(`--- Errors (${errors.length}) ---`);
    for (const err of errors) {
      console.log(`  [${err.sample_id}] ${err.field}: ${err.message}`);
    }
    console.log('');
  }

  // Warnings
  if (warnings.length > 0) {
    console.log(`--- Warnings (${warnings.length}) ---`);
    for (const warn of warnings) {
      console.log(`  [${warn.sample_id}] ${warn.field}: ${warn.message}`);
    }
    console.log('');
  }

  if (result.valid && warnings.length === 0) {
    console.log('No issues found. Corpus is valid.');
  }

  console.log('');
}
