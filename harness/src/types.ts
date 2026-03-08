/**
 * AQB Core Types
 *
 * These types define the interfaces for the Agentic Quality Benchmark.
 * Tool adapters, corpus samples, findings, and evaluation results
 * all conform to these schemas.
 */

// ─── Domains ────────────────────────────────────────────────────────────────

export type Domain =
  | 'security'
  | 'defects'
  | 'test-generation'
  | 'coverage-analysis'
  | 'requirements'
  | 'contracts'
  | 'quality'
  | 'accessibility'
  | 'performance'
  | 'chaos-resilience'
  | 'code-intelligence'
  | 'enterprise-integration'
  | 'flaky-tests'
  | 'visual-regression';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type Difficulty = 1 | 2 | 3 | 4 | 5;

export type Language = 'typescript' | 'javascript' | 'python' | 'java' | 'go' | 'rust' | 'csharp' | 'other';

export type SourcingMethod =
  | 'real_cve'
  | 'historical_bugfix'
  | 'mutation_seeded'
  | 'synthetic'
  | 'adversarial_negative';

// ─── Corpus ─────────────────────────────────────────────────────────────────

export interface CorpusSample {
  id: string;
  domain: Domain;
  category: string;
  language: Language;
  difficulty: Difficulty;
  files: SampleFile[];
  ground_truth: GroundTruth;
  metadata: SampleMetadata;
}

export interface SampleFile {
  path: string;
  content: string;
}

export interface GroundTruth {
  issues: GroundTruthIssue[];
  false_positives: FalsePositiveMarker[];
}

export interface GroundTruthIssue {
  type: string;            // CWE-89, null-deref, etc.
  severity: Severity;
  location: Location;
  description: string;
  fix_available: boolean;
  fix_file?: string;       // Path to patch file
}

export interface FalsePositiveMarker {
  location: Location;
  reason: string;           // Why this is NOT an issue
}

export interface Location {
  file: string;
  line_start: number;
  line_end: number;
  column_start?: number;
  column_end?: number;
}

export interface SampleMetadata {
  source: string;           // CVE ID, commit hash, or "synthetic"
  sourcing_method: SourcingMethod;
  human_verified: boolean;
  verification_date: string;
  verified_by?: string[];
}

// ─── Findings ───────────────────────────────────────────────────────────────

export interface Finding {
  id: string;
  domain: Domain;
  category: string;
  severity: Severity;
  confidence: number;       // 0-1
  location: Location;
  description: string;
  suggestion?: string;
  fix?: string;
  metadata?: Record<string, unknown>;
}

// ─── Adapter Interface ──────────────────────────────────────────────────────

export interface AQBToolAdapter {
  name: string;
  version: string;

  /** Run the tool against a single corpus sample */
  analyze(sample: CorpusSample): Promise<Finding[]>;

  /** Optional setup before evaluation run */
  setup?(): Promise<void>;

  /** Optional teardown after evaluation run */
  teardown?(): Promise<void>;
}

// ─── Matching ───────────────────────────────────────────────────────────────

export type MatchType = 'full' | 'partial' | 'none';

export interface MatchedFinding {
  finding: Finding;
  ground_truth: GroundTruthIssue;
  match_type: MatchType;
  match_score: number;       // 0-1
}

export interface UnmatchedFinding {
  finding: Finding;
  reason: 'no_ground_truth' | 'wrong_location' | 'wrong_type' | 'fabrication';
}

export interface MissedIssue {
  ground_truth: GroundTruthIssue;
  sample_id: string;
}

// ─── Results ────────────────────────────────────────────────────────────────

export interface AQBResult {
  tool: string;
  version: string;
  run_id: string;
  timestamp: string;
  corpus_version: string;

  findings: Finding[];

  matches: {
    true_positives: MatchedFinding[];
    false_positives: UnmatchedFinding[];
    false_negatives: MissedIssue[];
    true_negatives: number;
  };

  metrics: AQBMetrics;
  domain_metrics: Record<Domain, DomainMetrics>;
  difficulty_metrics: Record<Difficulty, { recall: number }>;
  language_metrics: Record<Language, { precision: number; recall: number }>;
}

export interface AQBMetrics {
  precision: number;
  recall: number;
  f1: number;
  false_positive_rate: number;
  fabrication_rate: number;             // Findings on clean code / total findings
  severity_weighted_recall: number;     // Critical weighted 3x
  mean_time_to_detect_ms: number;
  total_latency_ms: number;
  token_cost_usd: number;
  findings_per_dollar: number;
}

export interface DomainMetrics {
  precision: number;
  recall: number;
  f1: number;
  samples_evaluated: number;
  avg_latency_ms: number;
}

// ─── Agentic Metrics ────────────────────────────────────────────────────────

export interface AgenticMetrics {
  learning_transfer: {
    cold_start_recall: number;
    warm_start_recall: number;
    delta_recall: number;
  };
  multi_agent: {
    single_agent_recall: number;
    swarm_recall: number;
    unique_findings_per_agent: number;
    coordination_overhead_ms: number;
  };
  explanation_quality: {
    llm_judge_score: number;         // 1-5
    human_validation_score?: number; // 1-5 (on sample)
    inter_rater_kappa?: number;
  };
  fix_quality: {
    fixes_attempted: number;
    fixes_compiled: number;
    fixes_passed_tests: number;
    fix_success_rate: number;
  };
  severity_calibration: {
    spearman_rho: number;
    kendall_tau: number;
  };
  cost_efficiency: {
    total_tokens: number;
    total_cost_usd: number;
    findings_per_dollar: number;
    cost_per_true_positive: number;
  };
  temporal_decay?: {
    recall_t0: number;
    recall_t3m: number;
    recall_t6m: number;
    decay_rate: number;
  };
}

// ─── Scorecard ──────────────────────────────────────────────────────────────

export interface Scorecard {
  tool: string;
  version: string;
  corpus_version: string;
  timestamp: string;
  overall: AQBMetrics;
  domains: Record<Domain, DomainMetrics>;
  difficulty: Record<Difficulty, { recall: number }>;
  languages: Record<Language, { precision: number; recall: number }>;
  agentic?: AgenticMetrics;
}
