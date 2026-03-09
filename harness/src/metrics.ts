/**
 * AQB Metrics Calculator
 *
 * Computes precision, recall, F1, fabrication rate, and other metrics
 * from matched findings.
 */

import type {
  AQBMetrics,
  DomainMetrics,
  Domain,
  Difficulty,
  Language,
  MatchedFinding,
  UnmatchedFinding,
  MissedIssue,
} from './types.js';

export interface MetricsInput {
  true_positives: MatchedFinding[];
  false_positives: UnmatchedFinding[];
  false_negatives: MissedIssue[];
  true_negatives: number;
  total_latency_ms: number;
  token_cost_usd: number;
}

/**
 * Compute aggregate AQB metrics from matching results.
 */
export function computeMetrics(input: MetricsInput): AQBMetrics {
  const tp = input.true_positives.length;
  const fp = input.false_positives.length;
  const fn = input.false_negatives.length;
  const tn = input.true_negatives;

  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const fpr = fp + tn > 0 ? fp / (fp + tn) : 0;

  // Fabrication rate: findings on adversarial negatives
  const fabrications = input.false_positives.filter(f => f.reason === 'fabrication').length;
  const totalFindings = tp + fp;
  const fabrication_rate = totalFindings > 0 ? fabrications / totalFindings : 0;

  // Severity-weighted recall: critical=3x, high=2x, medium=1x, low=0.5x
  const severityWeights: Record<string, number> = {
    critical: 3,
    high: 2,
    medium: 1,
    low: 0.5,
    info: 0.25,
  };

  let weightedTP = 0;
  let weightedTotal = 0;

  for (const match of input.true_positives) {
    const w = severityWeights[match.ground_truth.severity] || 1;
    weightedTP += w * match.match_score;
    weightedTotal += w;
  }
  for (const miss of input.false_negatives) {
    const w = severityWeights[miss.ground_truth.severity] || 1;
    weightedTotal += w;
  }

  const severity_weighted_recall = weightedTotal > 0 ? weightedTP / weightedTotal : 0;

  // Cost efficiency
  const findings_per_dollar = input.token_cost_usd > 0 ? tp / input.token_cost_usd : Infinity;

  // Mean time to detect (average latency per true positive)
  const mean_time_to_detect_ms = tp > 0 ? input.total_latency_ms / tp : 0;

  return {
    precision,
    recall,
    f1,
    false_positive_rate: fpr,
    fabrication_rate,
    severity_weighted_recall,
    mean_time_to_detect_ms,
    total_latency_ms: input.total_latency_ms,
    token_cost_usd: input.token_cost_usd,
    findings_per_dollar,
  };
}

/**
 * Compute per-domain metrics breakdown.
 */
export function computeDomainMetrics(
  true_positives: MatchedFinding[],
  false_positives: UnmatchedFinding[],
  false_negatives: MissedIssue[],
  domainLatencies: Record<Domain, number[]>,
  domainSampleCounts: Record<Domain, number>,
): Record<Domain, DomainMetrics> {
  const domains = new Set<Domain>();

  for (const tp of true_positives) domains.add(tp.finding.domain);
  for (const fp of false_positives) domains.add(fp.finding.domain);

  const result: Partial<Record<Domain, DomainMetrics>> = {};

  for (const domain of domains) {
    const domainTP = true_positives.filter(tp => tp.finding.domain === domain);
    const domainFP = false_positives.filter(fp => fp.finding.domain === domain);
    const domainFN = false_negatives.filter(fn => fn.domain === domain);

    const tp = domainTP.length;
    const fp = domainFP.length;
    const fn = domainFN.length;

    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    const latencies = domainLatencies[domain] || [];
    const avg_latency_ms = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    result[domain] = {
      precision,
      recall,
      f1,
      samples_evaluated: domainSampleCounts[domain] || 0,
      avg_latency_ms,
    };
  }

  return result as Record<Domain, DomainMetrics>;
}

/**
 * Compute per-difficulty recall breakdown.
 */
export function computeDifficultyMetrics(
  true_positives: MatchedFinding[],
  false_negatives: MissedIssue[],
  sampleDifficulties: Map<string, Difficulty>,
): Record<Difficulty, { recall: number }> {
  const result: Record<number, { tp: number; total: number }> = {
    1: { tp: 0, total: 0 },
    2: { tp: 0, total: 0 },
    3: { tp: 0, total: 0 },
    4: { tp: 0, total: 0 },
    5: { tp: 0, total: 0 },
  };

  // Count by difficulty (approximate - using sample difficulty for TPs)
  for (const tp of true_positives) {
    const difficulty = sampleDifficulties.get(tp.finding.id) || 3;
    result[difficulty].tp++;
    result[difficulty].total++;
  }

  for (const fn of false_negatives) {
    const difficulty = sampleDifficulties.get(fn.sample_id) || 3;
    result[difficulty].total++;
  }

  return {
    1: { recall: result[1].total > 0 ? result[1].tp / result[1].total : 0 },
    2: { recall: result[2].total > 0 ? result[2].tp / result[2].total : 0 },
    3: { recall: result[3].total > 0 ? result[3].tp / result[3].total : 0 },
    4: { recall: result[4].total > 0 ? result[4].tp / result[4].total : 0 },
    5: { recall: result[5].total > 0 ? result[5].tp / result[5].total : 0 },
  } as Record<Difficulty, { recall: number }>;
}
