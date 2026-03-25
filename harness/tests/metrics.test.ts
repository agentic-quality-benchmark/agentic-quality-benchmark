/**
 * Unit tests for harness/src/metrics.ts
 *
 * Covers computeMetrics, computeDomainMetrics, and computeDifficultyMetrics
 * with comprehensive edge-case coverage.
 */

import { describe, it, expect } from 'vitest';
import {
  computeMetrics,
  computeDomainMetrics,
  computeDifficultyMetrics,
  type MetricsInput,
} from '../src/metrics.js';
import type {
  MatchedFinding,
  UnmatchedFinding,
  MissedIssue,
  Finding,
  GroundTruthIssue,
  Severity,
  Domain,
  Difficulty,
} from '../src/types.js';

// ─── Test Data Factories ───────────────────────────────────────────────────

let idCounter = 0;

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  idCounter++;
  return {
    id: `finding-${idCounter}`,
    domain: 'security',
    category: 'sql-injection',
    severity: 'medium',
    confidence: 0.9,
    location: {
      file: 'src/app.ts',
      line_start: 10,
      line_end: 15,
    },
    description: 'Test finding',
    ...overrides,
  };
}

function makeGroundTruth(overrides: Partial<GroundTruthIssue> = {}): GroundTruthIssue {
  return {
    type: 'CWE-89',
    severity: 'medium',
    location: {
      file: 'src/app.ts',
      line_start: 10,
      line_end: 15,
    },
    description: 'SQL injection',
    fix_available: false,
    ...overrides,
  };
}

function makeMatchedFinding(overrides: Partial<MatchedFinding> = {}): MatchedFinding {
  return {
    finding: makeFinding(),
    ground_truth: makeGroundTruth(),
    match_type: 'full',
    match_score: 1.0,
    ...overrides,
  };
}

function makeUnmatchedFinding(overrides: Partial<UnmatchedFinding> = {}): UnmatchedFinding {
  return {
    finding: makeFinding(),
    reason: 'no_ground_truth',
    ...overrides,
  };
}

function makeMissedIssue(overrides: Partial<MissedIssue> = {}): MissedIssue {
  return {
    ground_truth: makeGroundTruth(),
    sample_id: 'sample-001',
    domain: 'security',
    ...overrides,
  };
}

function makeMetricsInput(overrides: Partial<MetricsInput> = {}): MetricsInput {
  return {
    true_positives: [],
    false_positives: [],
    false_negatives: [],
    true_negatives: 0,
    total_latency_ms: 0,
    token_cost_usd: 0,
    ...overrides,
  };
}

// ─── computeMetrics ────────────────────────────────────────────────────────

describe('computeMetrics', () => {
  describe('precision', () => {
    it('should_compute_precision_as_TP_over_TP_plus_FP_when_given_known_values', () => {
      // Arrange: 3 TP, 2 FP => precision = 3/5 = 0.6
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding(), makeMatchedFinding()],
        false_positives: [makeUnmatchedFinding(), makeUnmatchedFinding()],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.precision).toBeCloseTo(0.6, 5);
    });

    it('should_return_precision_0_when_no_TP_and_all_FP', () => {
      // Arrange: 0 TP, 5 FP => precision = 0/5 = 0
      const input = makeMetricsInput({
        false_positives: Array.from({ length: 5 }, () => makeUnmatchedFinding()),
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.precision).toBe(0);
    });

    it('should_return_precision_1_when_all_TP_and_no_FP', () => {
      // Arrange: 4 TP, 0 FP => precision = 4/4 = 1
      const input = makeMetricsInput({
        true_positives: Array.from({ length: 4 }, () => makeMatchedFinding()),
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.precision).toBe(1);
    });
  });

  describe('recall', () => {
    it('should_compute_recall_as_TP_over_TP_plus_FN_when_given_known_values', () => {
      // Arrange: 2 TP, 3 FN => recall = 2/5 = 0.4
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding()],
        false_negatives: [makeMissedIssue(), makeMissedIssue(), makeMissedIssue()],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.recall).toBeCloseTo(0.4, 5);
    });

    it('should_return_recall_0_when_no_TP_and_all_FN', () => {
      // Arrange: 0 TP, 3 FN => recall = 0
      const input = makeMetricsInput({
        false_negatives: [makeMissedIssue(), makeMissedIssue(), makeMissedIssue()],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.recall).toBe(0);
    });

    it('should_return_recall_1_when_all_TP_and_no_FN', () => {
      // Arrange: 3 TP, 0 FN => recall = 1
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding(), makeMatchedFinding()],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.recall).toBe(1);
    });
  });

  describe('f1', () => {
    it('should_compute_F1_as_harmonic_mean_of_precision_and_recall', () => {
      // Arrange: 3 TP, 1 FP, 1 FN
      // precision = 3/4 = 0.75, recall = 3/4 = 0.75
      // F1 = 2*0.75*0.75 / (0.75+0.75) = 0.75
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding(), makeMatchedFinding()],
        false_positives: [makeUnmatchedFinding()],
        false_negatives: [makeMissedIssue()],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.f1).toBeCloseTo(0.75, 5);
    });

    it('should_compute_F1_correctly_when_precision_and_recall_differ', () => {
      // Arrange: 2 TP, 2 FP, 3 FN
      // precision = 2/4 = 0.5, recall = 2/5 = 0.4
      // F1 = 2*0.5*0.4 / (0.5+0.4) = 0.4/0.9 = 0.4444...
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding()],
        false_positives: [makeUnmatchedFinding(), makeUnmatchedFinding()],
        false_negatives: [makeMissedIssue(), makeMissedIssue(), makeMissedIssue()],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      const expectedF1 = (2 * 0.5 * 0.4) / (0.5 + 0.4);
      expect(metrics.f1).toBeCloseTo(expectedF1, 5);
    });
  });

  describe('zero division', () => {
    it('should_return_all_zero_metrics_when_all_counts_are_zero', () => {
      // Arrange: no TP, no FP, no FN, no TN
      const input = makeMetricsInput();

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.precision).toBe(0);
      expect(metrics.recall).toBe(0);
      expect(metrics.f1).toBe(0);
      expect(metrics.false_positive_rate).toBe(0);
      expect(metrics.fabrication_rate).toBe(0);
      expect(metrics.severity_weighted_recall).toBe(0);
      expect(metrics.mean_time_to_detect_ms).toBe(0);
      // Verify no NaN or Infinity
      expect(Number.isNaN(metrics.precision)).toBe(false);
      expect(Number.isNaN(metrics.recall)).toBe(false);
      expect(Number.isNaN(metrics.f1)).toBe(false);
      expect(Number.isNaN(metrics.false_positive_rate)).toBe(false);
      expect(Number.isFinite(metrics.precision)).toBe(true);
      expect(Number.isFinite(metrics.recall)).toBe(true);
    });
  });

  describe('perfect scores', () => {
    it('should_return_precision_1_recall_1_F1_1_when_all_are_TP', () => {
      // Arrange: 5 TP, 0 FP, 0 FN
      const input = makeMetricsInput({
        true_positives: Array.from({ length: 5 }, () => makeMatchedFinding()),
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.precision).toBe(1);
      expect(metrics.recall).toBe(1);
      expect(metrics.f1).toBe(1);
    });
  });

  describe('false_positive_rate', () => {
    it('should_compute_FPR_as_FP_over_FP_plus_TN', () => {
      // Arrange: 2 FP, 8 TN => FPR = 2/10 = 0.2
      const input = makeMetricsInput({
        false_positives: [makeUnmatchedFinding(), makeUnmatchedFinding()],
        true_negatives: 8,
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.false_positive_rate).toBeCloseTo(0.2, 5);
    });

    it('should_return_FPR_0_when_no_FP', () => {
      // Arrange: 0 FP, 10 TN => FPR = 0/10 = 0
      const input = makeMetricsInput({
        true_negatives: 10,
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.false_positive_rate).toBe(0);
    });

    it('should_return_FPR_1_when_all_FP_and_no_TN', () => {
      // Arrange: 5 FP, 0 TN => FPR = 5/5 = 1
      const input = makeMetricsInput({
        false_positives: Array.from({ length: 5 }, () => makeUnmatchedFinding()),
        true_negatives: 0,
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.false_positive_rate).toBe(1);
    });

    it('should_return_FPR_0_when_both_FP_and_TN_are_zero', () => {
      const input = makeMetricsInput();

      const metrics = computeMetrics(input);

      expect(metrics.false_positive_rate).toBe(0);
    });
  });

  describe('fabrication_rate', () => {
    it('should_compute_fabrication_rate_as_fabrication_FP_over_total_findings', () => {
      // Arrange: 2 TP, 1 fabrication FP, 2 non-fabrication FP
      // fabrication_rate = 1 / (2+3) = 0.2
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding()],
        false_positives: [
          makeUnmatchedFinding({ reason: 'fabrication' }),
          makeUnmatchedFinding({ reason: 'no_ground_truth' }),
          makeUnmatchedFinding({ reason: 'wrong_location' }),
        ],
      });

      // Act
      const metrics = computeMetrics(input);

      // Assert
      expect(metrics.fabrication_rate).toBeCloseTo(0.2, 5);
    });

    it('should_return_fabrication_rate_0_when_no_fabrications', () => {
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding()],
        false_positives: [makeUnmatchedFinding({ reason: 'wrong_type' })],
      });

      const metrics = computeMetrics(input);

      expect(metrics.fabrication_rate).toBe(0);
    });

    it('should_return_fabrication_rate_0_when_no_findings_at_all', () => {
      const input = makeMetricsInput();

      const metrics = computeMetrics(input);

      expect(metrics.fabrication_rate).toBe(0);
    });

    it('should_compute_high_fabrication_rate_when_all_FP_are_fabrications', () => {
      // Arrange: 0 TP, 3 fabrication FP => fabrication_rate = 3/3 = 1.0
      const input = makeMetricsInput({
        false_positives: Array.from({ length: 3 }, () =>
          makeUnmatchedFinding({ reason: 'fabrication' }),
        ),
      });

      const metrics = computeMetrics(input);

      expect(metrics.fabrication_rate).toBe(1);
    });
  });

  describe('severity_weighted_recall', () => {
    it('should_weight_critical_3x_high_2x_medium_1x_low_0.5x_info_0.25x', () => {
      // Arrange: 1 critical TP (match_score=1), 1 high FN
      // weightedTP = 3*1 = 3
      // weightedTotal = 3 + 2 = 5
      // severity_weighted_recall = 3/5 = 0.6
      const input = makeMetricsInput({
        true_positives: [
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'critical' }),
            match_score: 1.0,
          }),
        ],
        false_negatives: [
          makeMissedIssue({
            ground_truth: makeGroundTruth({ severity: 'high' }),
          }),
        ],
      });

      const metrics = computeMetrics(input);

      expect(metrics.severity_weighted_recall).toBeCloseTo(0.6, 5);
    });

    it('should_use_match_score_in_weighted_TP_calculation', () => {
      // Arrange: 1 critical TP with match_score=0.5
      // weightedTP = 3 * 0.5 = 1.5
      // weightedTotal = 3
      // severity_weighted_recall = 1.5/3 = 0.5
      const input = makeMetricsInput({
        true_positives: [
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'critical' }),
            match_score: 0.5,
          }),
        ],
      });

      const metrics = computeMetrics(input);

      expect(metrics.severity_weighted_recall).toBeCloseTo(0.5, 5);
    });

    it('should_handle_all_severity_levels_together', () => {
      // Arrange: 1 of each severity as TP (all match_score=1), no FN
      // weightedTP = 3 + 2 + 1 + 0.5 + 0.25 = 6.75
      // weightedTotal = 6.75
      // severity_weighted_recall = 1.0
      const input = makeMetricsInput({
        true_positives: [
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'critical' }),
            match_score: 1.0,
          }),
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'high' }),
            match_score: 1.0,
          }),
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'medium' }),
            match_score: 1.0,
          }),
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'low' }),
            match_score: 1.0,
          }),
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'info' }),
            match_score: 1.0,
          }),
        ],
      });

      const metrics = computeMetrics(input);

      expect(metrics.severity_weighted_recall).toBeCloseTo(1.0, 5);
    });

    it('should_weight_missed_critical_issues_more_heavily', () => {
      // Arrange: 1 low TP (match_score=1), 1 critical FN
      // weightedTP = 0.5 * 1 = 0.5
      // weightedTotal = 0.5 + 3 = 3.5
      // severity_weighted_recall = 0.5/3.5 = ~0.1429
      const input = makeMetricsInput({
        true_positives: [
          makeMatchedFinding({
            ground_truth: makeGroundTruth({ severity: 'low' }),
            match_score: 1.0,
          }),
        ],
        false_negatives: [
          makeMissedIssue({
            ground_truth: makeGroundTruth({ severity: 'critical' }),
          }),
        ],
      });

      const metrics = computeMetrics(input);

      expect(metrics.severity_weighted_recall).toBeCloseTo(0.5 / 3.5, 5);
    });

    it('should_return_0_when_no_issues_exist', () => {
      const input = makeMetricsInput();

      const metrics = computeMetrics(input);

      expect(metrics.severity_weighted_recall).toBe(0);
    });
  });

  describe('findings_per_dollar', () => {
    it('should_compute_findings_per_dollar_with_known_token_costs', () => {
      // Arrange: 4 TP, cost = $2.00 => findings_per_dollar = 2.0
      const input = makeMetricsInput({
        true_positives: Array.from({ length: 4 }, () => makeMatchedFinding()),
        token_cost_usd: 2.0,
      });

      const metrics = computeMetrics(input);

      expect(metrics.findings_per_dollar).toBeCloseTo(2.0, 5);
    });

    it('should_return_Infinity_when_cost_is_0', () => {
      // Arrange: 3 TP, cost = $0 => Infinity
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding(), makeMatchedFinding()],
        token_cost_usd: 0,
      });

      const metrics = computeMetrics(input);

      expect(metrics.findings_per_dollar).toBe(Infinity);
    });

    it('should_only_count_TP_not_FP_in_findings_per_dollar', () => {
      // Arrange: 2 TP, 5 FP, cost = $1.00 => findings_per_dollar = 2.0
      const input = makeMetricsInput({
        true_positives: [makeMatchedFinding(), makeMatchedFinding()],
        false_positives: Array.from({ length: 5 }, () => makeUnmatchedFinding()),
        token_cost_usd: 1.0,
      });

      const metrics = computeMetrics(input);

      expect(metrics.findings_per_dollar).toBeCloseTo(2.0, 5);
    });
  });

  describe('mean_time_to_detect_ms', () => {
    it('should_compute_average_latency_per_true_positive', () => {
      // Arrange: 4 TP, total_latency_ms = 1000 => 250ms per TP
      const input = makeMetricsInput({
        true_positives: Array.from({ length: 4 }, () => makeMatchedFinding()),
        total_latency_ms: 1000,
      });

      const metrics = computeMetrics(input);

      expect(metrics.mean_time_to_detect_ms).toBeCloseTo(250, 5);
    });

    it('should_return_0_when_no_TP', () => {
      const input = makeMetricsInput({
        total_latency_ms: 500,
      });

      const metrics = computeMetrics(input);

      expect(metrics.mean_time_to_detect_ms).toBe(0);
    });
  });

  describe('passthrough fields', () => {
    it('should_pass_through_total_latency_ms_and_token_cost_usd', () => {
      const input = makeMetricsInput({
        total_latency_ms: 1234,
        token_cost_usd: 5.67,
      });

      const metrics = computeMetrics(input);

      expect(metrics.total_latency_ms).toBe(1234);
      expect(metrics.token_cost_usd).toBe(5.67);
    });
  });
});

// ─── computeDomainMetrics ──────────────────────────────────────────────────

describe('computeDomainMetrics', () => {
  it('should_compute_correct_metrics_for_single_domain', () => {
    // Arrange: security domain — 2 TP, 1 FP, 1 FN
    // precision = 2/3, recall = 2/3, F1 = 2/3
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [
      makeUnmatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fns: MissedIssue[] = [
      makeMissedIssue({ domain: 'security' }),
    ];
    const latencies: Record<Domain, number[]> = { security: [100, 200, 300] } as Record<Domain, number[]>;
    const sampleCounts: Record<Domain, number> = { security: 5 } as Record<Domain, number>;

    // Act
    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    // Assert
    expect(result.security).toBeDefined();
    expect(result.security.precision).toBeCloseTo(2 / 3, 5);
    expect(result.security.recall).toBeCloseTo(2 / 3, 5);
    expect(result.security.f1).toBeCloseTo(2 / 3, 5);
    expect(result.security.samples_evaluated).toBe(5);
    expect(result.security.avg_latency_ms).toBeCloseTo(200, 5);
  });

  it('should_compute_separate_metrics_for_multiple_domains', () => {
    // Arrange: 2 security TP, 1 defects TP, 1 defects FP
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
      makeMatchedFinding({ finding: makeFinding({ domain: 'defects' }) }),
    ];
    const fps: UnmatchedFinding[] = [
      makeUnmatchedFinding({ finding: makeFinding({ domain: 'defects' }) }),
    ];
    const fns: MissedIssue[] = [
      makeMissedIssue({ domain: 'security' }),
    ];
    const latencies = {
      security: [100],
      defects: [200, 400],
    } as Record<Domain, number[]>;
    const sampleCounts = {
      security: 3,
      defects: 2,
    } as Record<Domain, number>;

    // Act
    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    // Assert — security: 2 TP, 0 FP, 1 FN
    expect(result.security.precision).toBe(1); // 2/(2+0)
    expect(result.security.recall).toBeCloseTo(2 / 3, 5); // 2/(2+1)
    expect(result.security.samples_evaluated).toBe(3);
    expect(result.security.avg_latency_ms).toBeCloseTo(100, 5);

    // Assert — defects: 1 TP, 1 FP, 0 FN
    expect(result.defects.precision).toBeCloseTo(0.5, 5); // 1/(1+1)
    expect(result.defects.recall).toBe(1); // 1/(1+0)
    expect(result.defects.samples_evaluated).toBe(2);
    expect(result.defects.avg_latency_ms).toBeCloseTo(300, 5);
  });

  it('should_return_precision_1_when_domain_has_no_FP_and_some_TP', () => {
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [];
    const fns: MissedIssue[] = [];
    const latencies = { security: [50] } as Record<Domain, number[]>;
    const sampleCounts = { security: 1 } as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    expect(result.security.precision).toBe(1);
  });

  it('should_return_precision_0_and_recall_0_when_domain_has_no_TP', () => {
    const tps: MatchedFinding[] = [];
    const fps: UnmatchedFinding[] = [
      makeUnmatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fns: MissedIssue[] = [
      makeMissedIssue({ domain: 'security' }),
    ];
    const latencies = { security: [] } as Record<Domain, number[]>;
    const sampleCounts = { security: 2 } as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    expect(result.security.precision).toBe(0); // 0/(0+1)
    expect(result.security.recall).toBe(0); // 0/(0+1)
    expect(result.security.f1).toBe(0);
  });

  it('should_filter_FN_by_domain_not_inflate_across_domains', () => {
    // Arrange: security TP, defects FP; FN only in "defects"
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [
      makeUnmatchedFinding({ finding: makeFinding({ domain: 'defects' }) }),
    ];
    const fns: MissedIssue[] = [
      makeMissedIssue({ domain: 'defects' }),
      makeMissedIssue({ domain: 'defects' }),
    ];
    const latencies = {
      security: [100],
      defects: [200],
    } as Record<Domain, number[]>;
    const sampleCounts = {
      security: 1,
      defects: 3,
    } as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    // security should not see the defects FNs
    expect(result.security.recall).toBe(1); // 1/(1+0)
    // defects has 0 TP, 1 FP, 2 FN
    expect(result.defects.recall).toBe(0); // 0/(0+2)
    expect(result.defects.precision).toBe(0); // 0/(0+1)
  });

  it('should_compute_avg_latency_ms_per_domain', () => {
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [];
    const fns: MissedIssue[] = [];
    const latencies = { security: [100, 200, 300, 400] } as Record<Domain, number[]>;
    const sampleCounts = { security: 4 } as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    expect(result.security.avg_latency_ms).toBeCloseTo(250, 5);
  });

  it('should_return_avg_latency_0_when_no_latencies_recorded', () => {
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [];
    const fns: MissedIssue[] = [];
    const latencies = {} as Record<Domain, number[]>;
    const sampleCounts = { security: 1 } as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    expect(result.security.avg_latency_ms).toBe(0);
  });

  it('should_return_samples_evaluated_from_sampleCounts', () => {
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [];
    const fns: MissedIssue[] = [];
    const latencies = { security: [] } as Record<Domain, number[]>;
    const sampleCounts = { security: 42 } as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    expect(result.security.samples_evaluated).toBe(42);
  });

  it('should_return_samples_evaluated_0_when_domain_not_in_sampleCounts', () => {
    const tps: MatchedFinding[] = [
      makeMatchedFinding({ finding: makeFinding({ domain: 'security' }) }),
    ];
    const fps: UnmatchedFinding[] = [];
    const fns: MissedIssue[] = [];
    const latencies = {} as Record<Domain, number[]>;
    const sampleCounts = {} as Record<Domain, number>;

    const result = computeDomainMetrics(tps, fps, fns, latencies, sampleCounts);

    expect(result.security.samples_evaluated).toBe(0);
  });
});

// ─── computeDifficultyMetrics ──────────────────────────────────────────────

describe('computeDifficultyMetrics', () => {
  it('should_compute_recall_by_difficulty_level', () => {
    // Arrange: difficulty 1 has 2 TP, 1 FN => recall = 2/3
    //          difficulty 3 has 1 TP, 0 FN => recall = 1.0
    const difficulties = new Map<string, Difficulty>();
    const tp1a = makeMatchedFinding({ finding: makeFinding({ id: 'tp-d1a' }) });
    const tp1b = makeMatchedFinding({ finding: makeFinding({ id: 'tp-d1b' }) });
    const tp3 = makeMatchedFinding({ finding: makeFinding({ id: 'tp-d3' }) });

    difficulties.set('tp-d1a', 1);
    difficulties.set('tp-d1b', 1);
    difficulties.set('tp-d3', 3);

    const fn1 = makeMissedIssue({ sample_id: 'fn-d1' });
    difficulties.set('fn-d1', 1);

    // Act
    const result = computeDifficultyMetrics([tp1a, tp1b, tp3], [fn1], difficulties);

    // Assert
    expect(result[1].recall).toBeCloseTo(2 / 3, 5);
    expect(result[2].recall).toBe(0); // no samples at difficulty 2
    expect(result[3].recall).toBe(1.0);
    expect(result[4].recall).toBe(0);
    expect(result[5].recall).toBe(0);
  });

  it('should_default_difficulty_to_3_for_unknown_samples', () => {
    // Arrange: TP with unknown id => defaults to difficulty 3
    const tp = makeMatchedFinding({ finding: makeFinding({ id: 'unknown-id' }) });
    const difficulties = new Map<string, Difficulty>();
    // Do NOT set difficulty for 'unknown-id'

    // Act
    const result = computeDifficultyMetrics([tp], [], difficulties);

    // Assert — should fall into difficulty 3
    expect(result[3].recall).toBe(1.0);
    expect(result[1].recall).toBe(0);
  });

  it('should_return_recall_1_when_all_TP_at_difficulty_1', () => {
    const difficulties = new Map<string, Difficulty>();
    const tps = Array.from({ length: 3 }, (_, i) => {
      const finding = makeFinding({ id: `d1-tp-${i}` });
      difficulties.set(`d1-tp-${i}`, 1);
      return makeMatchedFinding({ finding });
    });

    const result = computeDifficultyMetrics(tps, [], difficulties);

    expect(result[1].recall).toBe(1.0);
  });

  it('should_return_recall_0_when_all_FN_at_difficulty_5', () => {
    const difficulties = new Map<string, Difficulty>();
    const fns = Array.from({ length: 3 }, (_, i) => {
      const fn = makeMissedIssue({ sample_id: `d5-fn-${i}` });
      difficulties.set(`d5-fn-${i}`, 5);
      return fn;
    });

    const result = computeDifficultyMetrics([], fns, difficulties);

    expect(result[5].recall).toBe(0);
    // total at level 5 is 3, tp is 0 => 0/3 = 0
  });

  it('should_handle_mixed_difficulties_correctly', () => {
    const difficulties = new Map<string, Difficulty>();

    // Difficulty 2: 1 TP, 1 FN => recall = 0.5
    const tp2 = makeMatchedFinding({ finding: makeFinding({ id: 'mix-tp2' }) });
    difficulties.set('mix-tp2', 2);
    const fn2 = makeMissedIssue({ sample_id: 'mix-fn2' });
    difficulties.set('mix-fn2', 2);

    // Difficulty 4: 3 TP, 1 FN => recall = 0.75
    const tp4s = Array.from({ length: 3 }, (_, i) => {
      const f = makeFinding({ id: `mix-tp4-${i}` });
      difficulties.set(`mix-tp4-${i}`, 4);
      return makeMatchedFinding({ finding: f });
    });
    const fn4 = makeMissedIssue({ sample_id: 'mix-fn4' });
    difficulties.set('mix-fn4', 4);

    const result = computeDifficultyMetrics([tp2, ...tp4s], [fn2, fn4], difficulties);

    expect(result[1].recall).toBe(0);
    expect(result[2].recall).toBeCloseTo(0.5, 5);
    expect(result[3].recall).toBe(0);
    expect(result[4].recall).toBeCloseTo(0.75, 5);
    expect(result[5].recall).toBe(0);
  });

  it('should_return_all_zeros_when_given_empty_arrays', () => {
    const difficulties = new Map<string, Difficulty>();

    const result = computeDifficultyMetrics([], [], difficulties);

    expect(result[1].recall).toBe(0);
    expect(result[2].recall).toBe(0);
    expect(result[3].recall).toBe(0);
    expect(result[4].recall).toBe(0);
    expect(result[5].recall).toBe(0);
  });
});

// ─── Edge Cases ────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should_handle_empty_arrays_for_all_inputs', () => {
    const input = makeMetricsInput();

    const metrics = computeMetrics(input);

    expect(metrics.precision).toBe(0);
    expect(metrics.recall).toBe(0);
    expect(metrics.f1).toBe(0);
    expect(metrics.false_positive_rate).toBe(0);
    expect(metrics.fabrication_rate).toBe(0);
    expect(metrics.severity_weighted_recall).toBe(0);
    expect(metrics.mean_time_to_detect_ms).toBe(0);
    expect(metrics.findings_per_dollar).toBe(Infinity);
  });

  it('should_handle_single_element_arrays', () => {
    const input = makeMetricsInput({
      true_positives: [makeMatchedFinding()],
      false_positives: [makeUnmatchedFinding()],
      false_negatives: [makeMissedIssue()],
      true_negatives: 1,
      total_latency_ms: 100,
      token_cost_usd: 0.5,
    });

    const metrics = computeMetrics(input);

    // 1 TP, 1 FP => precision = 0.5
    expect(metrics.precision).toBeCloseTo(0.5, 5);
    // 1 TP, 1 FN => recall = 0.5
    expect(metrics.recall).toBeCloseTo(0.5, 5);
    // F1 = 2*0.5*0.5 / (0.5+0.5) = 0.5
    expect(metrics.f1).toBeCloseTo(0.5, 5);
    // FPR = 1 / (1+1) = 0.5
    expect(metrics.false_positive_rate).toBeCloseTo(0.5, 5);
    // mean_time = 100 / 1 = 100
    expect(metrics.mean_time_to_detect_ms).toBeCloseTo(100, 5);
    // findings_per_dollar = 1 / 0.5 = 2
    expect(metrics.findings_per_dollar).toBeCloseTo(2, 5);
  });

  it('should_handle_large_numbers_of_findings', () => {
    const count = 1000;
    const input = makeMetricsInput({
      true_positives: Array.from({ length: count }, () => makeMatchedFinding()),
      false_positives: Array.from({ length: count }, () => makeUnmatchedFinding()),
      false_negatives: Array.from({ length: count }, () => makeMissedIssue()),
      true_negatives: count,
      total_latency_ms: 50000,
      token_cost_usd: 10.0,
    });

    const metrics = computeMetrics(input);

    // precision = 1000/2000 = 0.5
    expect(metrics.precision).toBeCloseTo(0.5, 5);
    // recall = 1000/2000 = 0.5
    expect(metrics.recall).toBeCloseTo(0.5, 5);
    // F1 = 0.5
    expect(metrics.f1).toBeCloseTo(0.5, 5);
    // FPR = 1000/2000 = 0.5
    expect(metrics.false_positive_rate).toBeCloseTo(0.5, 5);
    // mean_time = 50000/1000 = 50
    expect(metrics.mean_time_to_detect_ms).toBeCloseTo(50, 5);
    // findings_per_dollar = 1000/10 = 100
    expect(metrics.findings_per_dollar).toBeCloseTo(100, 5);
  });

  it('should_use_match_score_in_severity_weighted_recall_not_just_count', () => {
    // Arrange: 2 critical TP with different match_scores
    // TP1: critical, match_score=1.0 => weighted contribution = 3 * 1.0 = 3
    // TP2: critical, match_score=0.5 => weighted contribution = 3 * 0.5 = 1.5
    // total weighted TP = 4.5, total weighted = 6
    // severity_weighted_recall = 4.5/6 = 0.75
    const input = makeMetricsInput({
      true_positives: [
        makeMatchedFinding({
          ground_truth: makeGroundTruth({ severity: 'critical' }),
          match_score: 1.0,
        }),
        makeMatchedFinding({
          ground_truth: makeGroundTruth({ severity: 'critical' }),
          match_score: 0.5,
        }),
      ],
    });

    const metrics = computeMetrics(input);

    expect(metrics.severity_weighted_recall).toBeCloseTo(0.75, 5);
  });

  it('should_handle_findings_per_dollar_as_Infinity_with_zero_cost_and_zero_TP', () => {
    // 0 TP, 0 cost => code does tp / cost => 0/0 but cost check is first
    // token_cost_usd > 0 is false, so returns Infinity
    const input = makeMetricsInput({
      token_cost_usd: 0,
    });

    const metrics = computeMetrics(input);

    expect(metrics.findings_per_dollar).toBe(Infinity);
  });

  it('should_compute_domain_metrics_correctly_with_empty_inputs', () => {
    const result = computeDomainMetrics(
      [],
      [],
      [],
      {} as Record<Domain, number[]>,
      {} as Record<Domain, number>,
    );

    // No domains detected => empty result
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('should_compute_difficulty_metrics_with_all_FN_defaulting_to_difficulty_3', () => {
    // FN with unknown sample_id defaults to difficulty 3
    const difficulties = new Map<string, Difficulty>();
    const fns = [
      makeMissedIssue({ sample_id: 'unknown-1' }),
      makeMissedIssue({ sample_id: 'unknown-2' }),
    ];

    const result = computeDifficultyMetrics([], fns, difficulties);

    expect(result[3].recall).toBe(0); // 0 TP, 2 FN at level 3 => 0/2 = 0
    expect(result[1].recall).toBe(0);
    expect(result[5].recall).toBe(0);
  });
});
