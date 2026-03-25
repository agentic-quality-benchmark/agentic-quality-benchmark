/**
 * AQB Harness - Agentic Quality Benchmark
 *
 * Evaluation harness for measuring QE agent effectiveness.
 */

export * from './types.js';
export { matchFindings } from './matcher.js';
export type { MatcherConfig } from './matcher.js';
export { computeMetrics, computeDomainMetrics, computeDifficultyMetrics } from './metrics.js';
export type { MetricsInput } from './metrics.js';
export {
  DomainSchema,
  SeveritySchema,
  DifficultySchema,
  LanguageSchema,
  SourcingMethodSchema,
  MatchTypeSchema,
  LocationSchema,
  GroundTruthIssueSchema,
  FalsePositiveMarkerSchema,
  GroundTruthSchema,
  SampleFileSchema,
  SampleMetadataSchema,
  CorpusSampleSchema,
  FindingSchema,
  MatchedFindingSchema,
  UnmatchedFindingSchema,
  MissedIssueSchema,
  AQBMetricsSchema,
  DomainMetricsSchema,
  validateCorpusSample,
  validateFinding,
} from './schemas.js';
export { validateCorpus, validateSample, loadCorpusFromDirectory, loadManifest, validateAndReport } from './corpus/index.js';
export type { ValidationResult, ValidationError, ValidationWarning, ValidationStats, Manifest, ManifestDomain } from './corpus/index.js';
