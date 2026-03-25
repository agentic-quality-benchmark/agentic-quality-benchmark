/**
 * Zod Schemas for AQB Shared Kernel Types
 *
 * Runtime validation for all shared kernel types defined in types.ts.
 * Used at bounded context boundaries (Corpus Management, Adapter Layer)
 * to ensure data integrity per ADR-001.
 */

import { z } from 'zod';
import type { CorpusSample, Finding } from './types.js';

// ─── Enums & Literals ───────────────────────────────────────────────────────

export const DomainSchema = z.enum([
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
]);

export const SeveritySchema = z.enum([
  'critical',
  'high',
  'medium',
  'low',
  'info',
]);

export const DifficultySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

export const LanguageSchema = z.enum([
  'typescript',
  'javascript',
  'python',
  'java',
  'go',
  'rust',
  'csharp',
  'other',
]);

export const SourcingMethodSchema = z.enum([
  'real_cve',
  'historical_bugfix',
  'mutation_seeded',
  'synthetic',
  'adversarial_negative',
]);

export const MatchTypeSchema = z.enum(['full', 'partial', 'none']);

// ─── Corpus Types ───────────────────────────────────────────────────────────

export const LocationSchema = z.object({
  file: z.string().min(1, 'Location file path must not be empty'),
  line_start: z.number().int().nonnegative('line_start must be a non-negative integer'),
  line_end: z.number().int().nonnegative('line_end must be a non-negative integer'),
  column_start: z.number().int().nonnegative().optional(),
  column_end: z.number().int().nonnegative().optional(),
}).refine(
  (loc) => loc.line_end >= loc.line_start,
  { message: 'line_end must be >= line_start' },
);

export const GroundTruthIssueSchema = z.object({
  type: z.string().min(1, 'Issue type must not be empty'),
  severity: SeveritySchema,
  location: LocationSchema,
  description: z.string().min(1, 'Issue description must not be empty'),
  fix_available: z.boolean(),
  fix_file: z.string().optional(),
});

export const FalsePositiveMarkerSchema = z.object({
  location: LocationSchema,
  reason: z.string().min(1, 'False positive reason must not be empty'),
});

export const GroundTruthSchema = z.object({
  issues: z.array(GroundTruthIssueSchema),
  false_positives: z.array(FalsePositiveMarkerSchema),
});

export const SampleFileSchema = z.object({
  path: z.string().min(1, 'File path must not be empty'),
  content: z.string(),
});

export const SampleMetadataSchema = z.object({
  source: z.string().min(1, 'Metadata source must not be empty'),
  sourcing_method: SourcingMethodSchema,
  human_verified: z.boolean(),
  verification_date: z.string().min(1, 'Verification date must not be empty'),
  verified_by: z.array(z.string().min(1)).min(2, 'At least 2 reviewers required'),
});

export const CorpusSampleSchema = z.object({
  id: z.string().min(1, 'Sample ID must not be empty'),
  domain: DomainSchema,
  category: z.string().min(1, 'Category must not be empty'),
  language: LanguageSchema,
  difficulty: DifficultySchema,
  files: z.array(SampleFileSchema).min(1, 'At least one file required'),
  ground_truth: GroundTruthSchema,
  metadata: SampleMetadataSchema,
});

// ─── Finding Types ──────────────────────────────────────────────────────────

export const FindingSchema = z.object({
  id: z.string().min(1, 'Finding ID must not be empty'),
  domain: DomainSchema,
  category: z.string().min(1, 'Finding category must not be empty'),
  severity: SeveritySchema,
  confidence: z.number().min(0, 'Confidence must be >= 0').max(1, 'Confidence must be <= 1'),
  location: LocationSchema,
  description: z.string().min(1, 'Finding description must not be empty'),
  suggestion: z.string().optional(),
  fix: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ─── Matching Types ─────────────────────────────────────────────────────────

export const MatchedFindingSchema = z.object({
  finding: FindingSchema,
  ground_truth: GroundTruthIssueSchema,
  match_type: MatchTypeSchema,
  match_score: z.number().min(0).max(1),
});

export const UnmatchedFindingSchema = z.object({
  finding: FindingSchema,
  reason: z.enum([
    'no_ground_truth',
    'wrong_location',
    'wrong_type',
    'fabrication',
  ]),
});

export const MissedIssueSchema = z.object({
  ground_truth: GroundTruthIssueSchema,
  sample_id: z.string().min(1),
  domain: DomainSchema,
});

// ─── Metrics Types ──────────────────────────────────────────────────────────

export const AQBMetricsSchema = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
  false_positive_rate: z.number().min(0).max(1),
  fabrication_rate: z.number().min(0).max(1),
  severity_weighted_recall: z.number().min(0).max(1),
  mean_time_to_detect_ms: z.number().nonnegative(),
  total_latency_ms: z.number().nonnegative(),
  token_cost_usd: z.number().nonnegative(),
  findings_per_dollar: z.number().nonnegative(),
});

export const DomainMetricsSchema = z.object({
  precision: z.number().min(0).max(1),
  recall: z.number().min(0).max(1),
  f1: z.number().min(0).max(1),
  samples_evaluated: z.number().int().nonnegative(),
  avg_latency_ms: z.number().nonnegative(),
});

// ─── Validation Functions ───────────────────────────────────────────────────

/**
 * Validate and parse unknown data as a CorpusSample.
 * Throws ZodError with detailed messages on validation failure.
 */
export function validateCorpusSample(data: unknown): CorpusSample {
  return CorpusSampleSchema.parse(data) as CorpusSample;
}

/**
 * Validate and parse unknown data as a Finding.
 * Throws ZodError with detailed messages on validation failure.
 */
export function validateFinding(data: unknown): Finding {
  return FindingSchema.parse(data) as Finding;
}
