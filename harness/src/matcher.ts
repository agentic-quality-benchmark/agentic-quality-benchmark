/**
 * Finding-to-Ground-Truth Matcher
 *
 * Implements fuzzy matching between tool findings and corpus ground truth.
 * Uses location proximity + issue type compatibility.
 */

import type {
  Finding,
  GroundTruthIssue,
  MatchedFinding,
  UnmatchedFinding,
  MissedIssue,
  MatchType,
  CorpusSample,
} from './types.js';

/** Configuration for matching behavior */
export interface MatcherConfig {
  /** Maximum line distance for single-line issues (default: 5) */
  lineProximity: number;
  /** Minimum line range overlap for multi-line issues (default: 0.5) */
  overlapThreshold: number;
  /** Partial match score (default: 0.5) */
  partialMatchWeight: number;
  /** Category compatibility map (e.g., CWE-89 matches sql-injection) */
  categoryAliases: Record<string, string[]>;
}

const DEFAULT_CONFIG: MatcherConfig = {
  lineProximity: 5,
  overlapThreshold: 0.5,
  partialMatchWeight: 0.5,
  categoryAliases: {
    'CWE-89': ['sql-injection', 'sqli'],
    'CWE-79': ['xss', 'cross-site-scripting'],
    'CWE-78': ['command-injection', 'os-injection'],
    'CWE-22': ['path-traversal', 'directory-traversal'],
    'CWE-798': ['hardcoded-secrets', 'hardcoded-credentials'],
    'CWE-327': ['crypto-weakness', 'weak-cryptography'],
    'CWE-918': ['ssrf', 'server-side-request-forgery'],
  },
};

/**
 * Match findings against ground truth for a corpus sample.
 */
export function matchFindings(
  findings: Finding[],
  sample: CorpusSample,
  config: Partial<MatcherConfig> = {},
): {
  true_positives: MatchedFinding[];
  false_positives: UnmatchedFinding[];
  false_negatives: MissedIssue[];
} {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const groundTruth = sample.ground_truth.issues;
  const fpMarkers = sample.ground_truth.false_positives;

  const true_positives: MatchedFinding[] = [];
  const false_positives: UnmatchedFinding[] = [];
  const matched_gt_indices = new Set<number>();

  // Match each finding to the best ground truth issue
  for (const finding of findings) {
    let bestMatch: { gt: GroundTruthIssue; idx: number; score: number; type: MatchType } | null = null;

    for (let i = 0; i < groundTruth.length; i++) {
      if (matched_gt_indices.has(i)) continue;

      const gt = groundTruth[i];
      const match = computeMatch(finding, gt, cfg);

      if (match && (!bestMatch || match.score > bestMatch.score)) {
        bestMatch = { gt, idx: i, ...match };
      }
    }

    if (bestMatch) {
      matched_gt_indices.add(bestMatch.idx);
      true_positives.push({
        finding,
        ground_truth: bestMatch.gt,
        match_type: bestMatch.type,
        match_score: bestMatch.score,
      });
    } else {
      // Check if this is a known false positive marker
      const isFabricatedOnClean = sample.metadata.sourcing_method === 'adversarial_negative';
      false_positives.push({
        finding,
        reason: isFabricatedOnClean ? 'fabrication' : 'no_ground_truth',
      });
    }
  }

  // Remaining unmatched ground truth = false negatives
  const false_negatives: MissedIssue[] = groundTruth
    .filter((_, i) => !matched_gt_indices.has(i))
    .map(gt => ({ ground_truth: gt, sample_id: sample.id }));

  return { true_positives, false_positives, false_negatives };
}

/**
 * Compute match between a finding and a ground truth issue.
 */
function computeMatch(
  finding: Finding,
  gt: GroundTruthIssue,
  cfg: MatcherConfig,
): { score: number; type: MatchType } | null {
  // Step 1: File must match
  if (!filesMatch(finding.location.file, gt.location.file)) {
    return null;
  }

  // Step 2: Location proximity
  const locationScore = computeLocationScore(finding.location, gt.location, cfg);
  if (locationScore === 0) {
    return null;
  }

  // Step 3: Domain/category compatibility
  const categoryScore = computeCategoryScore(finding, gt, cfg);

  if (categoryScore >= 1.0) {
    // Full match: location + category both match
    return { score: locationScore * categoryScore, type: 'full' };
  } else if (categoryScore > 0) {
    // Partial match: location matches but category is only compatible
    return {
      score: locationScore * categoryScore * cfg.partialMatchWeight,
      type: 'partial',
    };
  }

  return null;
}

function filesMatch(a: string, b: string): boolean {
  // Normalize paths for comparison
  const normalize = (p: string) => p.replace(/^\.\//, '').replace(/\\/g, '/');
  return normalize(a) === normalize(b);
}

function computeLocationScore(
  finding: { line_start: number; line_end: number },
  gt: { line_start: number; line_end: number },
  cfg: MatcherConfig,
): number {
  const fStart = finding.line_start;
  const fEnd = finding.line_end;
  const gStart = gt.line_start;
  const gEnd = gt.line_end;

  // Single-line issues: use proximity
  if (gStart === gEnd) {
    const distance = Math.min(Math.abs(fStart - gStart), Math.abs(fEnd - gStart));
    if (distance <= cfg.lineProximity) {
      return 1 - (distance / (cfg.lineProximity + 1));
    }
    return 0;
  }

  // Multi-line issues: use overlap
  const overlapStart = Math.max(fStart, gStart);
  const overlapEnd = Math.min(fEnd, gEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart + 1);
  const gtRange = gEnd - gStart + 1;
  const overlapRatio = overlap / gtRange;

  return overlapRatio >= cfg.overlapThreshold ? overlapRatio : 0;
}

function computeCategoryScore(
  finding: Finding,
  gt: GroundTruthIssue,
  cfg: MatcherConfig,
): number {
  // Exact match
  if (finding.category === gt.type) return 1.0;

  // Check aliases
  const findingAliases = cfg.categoryAliases[finding.category] || [];
  const gtAliases = cfg.categoryAliases[gt.type] || [];

  if (findingAliases.includes(gt.type) || gtAliases.includes(finding.category)) {
    return 1.0;
  }

  // Check if they share any alias group
  for (const [, aliases] of Object.entries(cfg.categoryAliases)) {
    const findingInGroup = aliases.includes(finding.category) || finding.category in cfg.categoryAliases;
    const gtInGroup = aliases.includes(gt.type) || gt.type in cfg.categoryAliases;
    if (findingInGroup && gtInGroup) {
      return 0.7; // Same family but not exact
    }
  }

  // Domain match but different category (e.g., both security but different vuln type)
  if (finding.domain === domainFromType(gt.type)) {
    return 0.3;
  }

  return 0;
}

function domainFromType(type: string): string {
  if (type.startsWith('CWE-')) return 'security';
  if (['null-deref', 'race-condition', 'off-by-one', 'resource-leak', 'state-corruption', 'type-confusion'].includes(type)) return 'defects';
  return 'unknown';
}
