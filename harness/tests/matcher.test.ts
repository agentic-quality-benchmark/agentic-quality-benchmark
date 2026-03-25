/**
 * Unit tests for matcher.ts
 *
 * Covers: CWE alias matching, domain inference, location matching,
 * full matchFindings() flow, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import { matchFindings } from '../src/matcher.js';
import type {
  Finding,
  CorpusSample,
  GroundTruthIssue,
  Domain,
  Severity,
  Location,
} from '../src/types.js';

// ─── Factory Helpers ─────────────────────────────────────────────────────────

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    file: 'src/app.ts',
    line_start: 10,
    line_end: 10,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'finding-1',
    domain: 'security',
    category: 'CWE-89',
    severity: 'high',
    confidence: 0.9,
    location: makeLocation(),
    description: 'SQL injection vulnerability',
    ...overrides,
  };
}

function makeGroundTruth(overrides: Partial<GroundTruthIssue> = {}): GroundTruthIssue {
  return {
    type: 'CWE-89',
    severity: 'high',
    location: makeLocation(),
    description: 'SQL injection in query builder',
    fix_available: true,
    ...overrides,
  };
}

function makeCorpusSample(overrides: Partial<CorpusSample> = {}): CorpusSample {
  return {
    id: 'security-sqli-001',
    domain: 'security',
    category: 'sql-injection',
    language: 'typescript',
    difficulty: 3,
    files: [{ path: 'src/app.ts', content: 'const q = "SELECT * FROM users WHERE id=" + input;' }],
    ground_truth: {
      issues: [makeGroundTruth()],
      false_positives: [],
    },
    metadata: {
      source: 'synthetic',
      sourcing_method: 'synthetic',
      human_verified: true,
      verification_date: '2025-01-01',
      verified_by: ['reviewer-1', 'reviewer-2'],
    },
    ...overrides,
  };
}

// ─── 1. CWE Alias Matching ──────────────────────────────────────────────────

describe('CWE Alias Matching', () => {
  it('should_match_CWE89_to_sql_injection_category', () => {
    const finding = makeFinding({ category: 'CWE-89' });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({ type: 'sql-injection' })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('full');
  });

  it('should_match_CWE79_to_xss_category', () => {
    const finding = makeFinding({ category: 'CWE-79' });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({ type: 'xss' })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('full');
  });

  it('should_match_bidirectional_category_string_to_CWE_alias', () => {
    // Finding uses category name, GT uses CWE code
    const finding = makeFinding({ category: 'sql-injection' });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({ type: 'CWE-89' })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('full');
  });

  const allCweAliases: [string, string[]][] = [
    ['CWE-89', ['sql-injection', 'sqli']],
    ['CWE-79', ['xss', 'cross-site-scripting']],
    ['CWE-78', ['command-injection', 'os-injection']],
    ['CWE-22', ['path-traversal', 'directory-traversal']],
    ['CWE-798', ['hardcoded-secrets', 'hardcoded-credentials']],
    ['CWE-327', ['crypto-weakness', 'weak-cryptography']],
    ['CWE-918', ['ssrf', 'server-side-request-forgery']],
    ['CWE-20', ['input-validation', 'improper-input-validation']],
    ['CWE-77', ['command-injection-generic']],
    ['CWE-94', ['code-injection']],
    ['CWE-119', ['buffer-overflow', 'buffer-overrun']],
    ['CWE-125', ['out-of-bounds-read', 'buffer-over-read']],
    ['CWE-190', ['integer-overflow', 'integer-wrap']],
    ['CWE-200', ['information-exposure', 'info-leak']],
    ['CWE-269', ['privilege-escalation', 'improper-privilege']],
    ['CWE-287', ['improper-authentication', 'auth-bypass']],
    ['CWE-306', ['missing-authentication']],
    ['CWE-352', ['csrf', 'cross-site-request-forgery']],
    ['CWE-416', ['use-after-free', 'dangling-pointer']],
    ['CWE-434', ['unrestricted-upload', 'file-upload']],
    ['CWE-476', ['null-pointer-dereference', 'null-deref']],
    ['CWE-502', ['deserialization', 'insecure-deserialization']],
    ['CWE-611', ['xxe', 'xml-external-entity']],
    ['CWE-732', ['incorrect-permission', 'permission-assignment']],
    ['CWE-787', ['out-of-bounds-write', 'buffer-overflow-write']],
    ['CWE-862', ['missing-authorization', 'authz-missing']],
    ['CWE-863', ['incorrect-authorization', 'authz-incorrect']],
  ];

  describe('all 26 CWE aliases', () => {
    for (const [cwe, aliases] of allCweAliases) {
      for (const alias of aliases) {
        it(`should_match_${cwe}_to_${alias}`, () => {
          const finding = makeFinding({ category: cwe });
          const sample = makeCorpusSample({
            ground_truth: {
              issues: [makeGroundTruth({ type: alias })],
              false_positives: [],
            },
          });

          const result = matchFindings([finding], sample);

          expect(result.true_positives).toHaveLength(1);
          expect(result.true_positives[0].match_type).toBe('full');
        });
      }
    }
  });

  it('should_not_match_unknown_CWE_to_unrelated_category', () => {
    const finding = makeFinding({ category: 'CWE-89' });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({ type: 'buffer-overflow' })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    // CWE-89 is sql-injection; buffer-overflow is CWE-119 alias.
    // They are both in the security domain (CWE-89 finding has domain "security",
    // and buffer-overflow is in categoryAliases under CWE-119), so they are in
    // the same alias system -- this should produce a partial match or low-score
    // match but NOT a full match with score 1.0.
    if (result.true_positives.length > 0) {
      expect(result.true_positives[0].match_type).toBe('partial');
      expect(result.true_positives[0].match_score).toBeLessThan(1.0);
    } else {
      // If no match at all, that is also acceptable (no false TP)
      expect(result.false_positives).toHaveLength(1);
    }
  });
});

// ─── 2. Domain Inference (domainFromType) ────────────────────────────────────
// domainFromType is not exported, so we test it indirectly through matchFindings
// by using findings in a specific domain and ground truth with types from that domain.

describe('Domain Inference via matchFindings', () => {
  it('should_treat_CWE_prefixed_types_as_security_domain', () => {
    // Finding with domain=security but category doesn't alias-match the GT type.
    // GT type starts with CWE- so domainFromType returns 'security'.
    // If the finding.domain === 'security', they share domain => categoryScore > 0.
    const finding = makeFinding({
      domain: 'security',
      category: 'some-unknown-security-issue',
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({ type: 'CWE-999' })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    // Since they share domain (security), categoryScore = 0.3, producing a partial match
    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('partial');
  });

  it('should_treat_defect_types_as_defects_domain', () => {
    const defectTypes = ['null-deref', 'race-condition', 'off-by-one', 'resource-leak', 'state-corruption', 'type-confusion'];

    for (const defectType of defectTypes) {
      const finding = makeFinding({
        domain: 'defects',
        category: 'some-defect-category',
      });
      const sample = makeCorpusSample({
        ground_truth: {
          issues: [makeGroundTruth({ type: defectType })],
          false_positives: [],
        },
      });

      const result = matchFindings([finding], sample);

      // Domain match => categoryScore = 0.3 => partial match
      expect(result.true_positives.length).toBeGreaterThanOrEqual(1);
      expect(result.true_positives[0].match_type).toBe('partial');
    }
  });

  const domainTypeMappings: [Domain, string][] = [
    ['test-generation', 'mutation-score'],
    ['test-generation', 'edge-case'],
    ['coverage-analysis', 'uncovered-branch'],
    ['coverage-analysis', 'dead-code'],
    ['requirements', 'ambiguity'],
    ['requirements', 'incompleteness'],
    ['contracts', 'breaking-change'],
    ['contracts', 'schema-violation'],
    ['quality', 'code-smell'],
    ['quality', 'complexity'],
    ['accessibility', 'wcag-violation'],
    ['accessibility', 'aria-misuse'],
    ['performance', 'latency-regression'],
    ['performance', 'memory-leak'],
    ['chaos-resilience', 'cascade-failure'],
    ['chaos-resilience', 'timeout-handling'],
    ['code-intelligence', 'impact-prediction'],
    ['code-intelligence', 'dependency-risk'],
    ['enterprise-integration', 'protocol-violation'],
    ['enterprise-integration', 'schema-mismatch'],
    ['flaky-tests', 'non-deterministic'],
    ['flaky-tests', 'timing-dependent'],
    ['visual-regression', 'layout-shift'],
    ['visual-regression', 'visual-diff'],
  ];

  describe('all 14 domains reachable via type prefixes', () => {
    for (const [domain, type] of domainTypeMappings) {
      it(`should_infer_${domain}_from_type_${type}`, () => {
        const finding = makeFinding({
          domain: domain,
          category: 'unrelated-category-for-domain-test',
        });
        const sample = makeCorpusSample({
          domain: domain,
          ground_truth: {
            issues: [makeGroundTruth({ type })],
            false_positives: [],
          },
        });

        const result = matchFindings([finding], sample);

        // Domain match between finding.domain and domainFromType(gt.type) gives 0.3
        expect(result.true_positives).toHaveLength(1);
        expect(result.true_positives[0].match_type).toBe('partial');
      });
    }
  });

  it('should_also_infer_domains_from_type_prefixes', () => {
    // Test prefix-based inference (e.g., "mutation-foo" -> "test-generation")
    const prefixMappings: [Domain, string][] = [
      ['test-generation', 'mutation-killed'],
      ['coverage-analysis', 'coverage-delta'],
      ['requirements', 'requirement-gap'],
      ['contracts', 'contract-breach'],
      ['quality', 'quality-metric'],
      ['accessibility', 'a11y-error'],
      ['performance', 'perf-spike'],
      ['chaos-resilience', 'chaos-network-partition'],
      ['chaos-resilience', 'fault-disk-full'],
      ['code-intelligence', 'code-intel-graph'],
      ['enterprise-integration', 'integration-failure'],
      ['flaky-tests', 'flaky-env-dependent'],
      ['visual-regression', 'visual-overlap'],
    ];

    for (const [domain, type] of prefixMappings) {
      const finding = makeFinding({
        domain: domain,
        category: 'irrelevant',
      });
      const sample = makeCorpusSample({
        domain: domain,
        ground_truth: {
          issues: [makeGroundTruth({ type })],
          false_positives: [],
        },
      });

      const result = matchFindings([finding], sample);

      expect(result.true_positives).toHaveLength(1);
      expect(result.true_positives[0].match_type).toBe('partial');
    }
  });

  it('should_return_unknown_for_unrecognized_types_preventing_domain_match', () => {
    // GT type that maps to 'unknown' domain shouldn't match finding domain 'security'
    const finding = makeFinding({
      domain: 'security',
      category: 'totally-made-up',
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({ type: 'completely-unknown-type' })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    // domain mismatch (security vs unknown) => categoryScore = 0 => no match
    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
  });
});

// ─── 3. Location Matching ────────────────────────────────────────────────────

describe('Location Matching', () => {
  it('should_match_exact_same_line', () => {
    const finding = makeFinding({
      location: makeLocation({ line_start: 10, line_end: 10 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_score).toBe(1.0);
    expect(result.true_positives[0].match_type).toBe('full');
  });

  it('should_match_within_plus_minus_5_lines_for_single_line_issues', () => {
    const finding = makeFinding({
      location: makeLocation({ line_start: 13, line_end: 13 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    // Distance is 3, so location score = 1 - (3/6) = 0.5
    expect(result.true_positives[0].match_score).toBeCloseTo(0.5, 5);
  });

  it('should_not_match_beyond_5_lines_for_single_line_issues', () => {
    const finding = makeFinding({
      location: makeLocation({ line_start: 16, line_end: 16 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
  });

  it('should_match_at_exactly_5_lines_distance', () => {
    const finding = makeFinding({
      location: makeLocation({ line_start: 15, line_end: 15 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    // Distance is 5, score = 1 - (5/6) = 1/6
    expect(result.true_positives[0].match_score).toBeCloseTo(1 / 6, 5);
  });

  it('should_match_overlapping_multi_line_ranges_above_50_percent', () => {
    // GT range: lines 10-19 (10 lines)
    // Finding range: lines 14-25 (overlap: 14-19 = 6 lines)
    // Overlap ratio = 6/10 = 0.6 >= 0.5
    const finding = makeFinding({
      location: makeLocation({ line_start: 14, line_end: 25 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 19 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_score).toBeCloseTo(0.6, 5);
  });

  it('should_not_match_non_overlapping_ranges', () => {
    const finding = makeFinding({
      location: makeLocation({ line_start: 30, line_end: 40 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 19 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
  });

  it('should_not_match_overlap_below_50_percent', () => {
    // GT range: lines 10-19 (10 lines)
    // Finding range: lines 16-25 (overlap: 16-19 = 4 lines)
    // Overlap ratio = 4/10 = 0.4 < 0.5
    const finding = makeFinding({
      location: makeLocation({ line_start: 16, line_end: 25 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 19 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
  });

  it('should_match_exactly_50_percent_overlap', () => {
    // GT range: lines 10-19 (10 lines)
    // Finding range: lines 15-25 (overlap: 15-19 = 5 lines)
    // Overlap ratio = 5/10 = 0.5 >= 0.5
    const finding = makeFinding({
      location: makeLocation({ line_start: 15, line_end: 25 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 19 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_score).toBeCloseTo(0.5, 5);
  });

  it('should_normalize_file_paths_stripping_leading_dot_slash', () => {
    const finding = makeFinding({
      location: makeLocation({ file: './src/app.ts' }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ file: 'src/app.ts' }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
  });

  it('should_normalize_backslashes_to_forward_slashes', () => {
    const finding = makeFinding({
      location: makeLocation({ file: 'src\\app.ts' }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ file: 'src/app.ts' }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
  });

  it('should_not_match_different_files', () => {
    const finding = makeFinding({
      location: makeLocation({ file: 'src/other.ts' }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ file: 'src/app.ts' }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
  });
});

// ─── 4. Full matchFindings() Function ────────────────────────────────────────

describe('matchFindings', () => {
  it('should_classify_perfect_match_as_true_positive', () => {
    const finding = makeFinding({
      category: 'CWE-89',
      location: makeLocation({ line_start: 10, line_end: 10 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-89',
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('full');
    expect(result.true_positives[0].match_score).toBe(1.0);
    expect(result.false_positives).toHaveLength(0);
    expect(result.false_negatives).toHaveLength(0);
  });

  it('should_classify_partial_match_with_nearby_line_and_same_domain', () => {
    // Same file, nearby line but different (non-alias) category, same domain
    const finding = makeFinding({
      domain: 'security',
      category: 'generic-vuln',
      location: makeLocation({ line_start: 12, line_end: 12 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-89',
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('partial');
    expect(result.true_positives[0].match_score).toBeLessThan(1.0);
    expect(result.true_positives[0].match_score).toBeGreaterThan(0);
  });

  it('should_classify_unmatched_finding_as_false_positive', () => {
    const finding = makeFinding({
      location: makeLocation({ file: 'src/different.ts', line_start: 100, line_end: 100 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ file: 'src/app.ts', line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.false_positives).toHaveLength(1);
    expect(result.false_positives[0].reason).toBe('no_ground_truth');
    expect(result.false_negatives).toHaveLength(1);
  });

  it('should_classify_unmatched_ground_truth_as_false_negative', () => {
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [
          makeGroundTruth({ type: 'CWE-89' }),
          makeGroundTruth({ type: 'CWE-79', location: makeLocation({ line_start: 50, line_end: 50 }) }),
        ],
        false_positives: [],
      },
    });

    // Only find one issue
    const finding = makeFinding({ category: 'CWE-89' });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.false_negatives).toHaveLength(1);
    expect(result.false_negatives[0].ground_truth.type).toBe('CWE-79');
    expect(result.false_negatives[0].sample_id).toBe('security-sqli-001');
    expect(result.false_negatives[0].domain).toBe('security');
  });

  it('should_classify_finding_on_adversarial_negative_as_fabrication', () => {
    const finding = makeFinding();
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [], // Clean code: no real issues
        false_positives: [],
      },
      metadata: {
        source: 'synthetic',
        sourcing_method: 'adversarial_negative',
        human_verified: true,
        verification_date: '2025-01-01',
        verified_by: ['reviewer-1', 'reviewer-2'],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.false_positives).toHaveLength(1);
    expect(result.false_positives[0].reason).toBe('fabrication');
  });

  it('should_handle_multiple_findings_against_multiple_ground_truths', () => {
    const findings: Finding[] = [
      makeFinding({
        id: 'f1',
        category: 'CWE-89',
        location: makeLocation({ line_start: 10, line_end: 10 }),
      }),
      makeFinding({
        id: 'f2',
        category: 'CWE-79',
        location: makeLocation({ line_start: 25, line_end: 25 }),
      }),
      makeFinding({
        id: 'f3',
        category: 'CWE-22',
        location: makeLocation({ file: 'src/other.ts', line_start: 5, line_end: 5 }),
      }),
    ];

    const sample = makeCorpusSample({
      ground_truth: {
        issues: [
          makeGroundTruth({
            type: 'CWE-89',
            location: makeLocation({ line_start: 10, line_end: 10 }),
          }),
          makeGroundTruth({
            type: 'CWE-79',
            location: makeLocation({ line_start: 25, line_end: 25 }),
          }),
        ],
        false_positives: [],
      },
    });

    const result = matchFindings(findings, sample);

    expect(result.true_positives).toHaveLength(2);
    expect(result.false_positives).toHaveLength(1);
    expect(result.false_negatives).toHaveLength(0);
  });

  it('should_handle_empty_findings', () => {
    const sample = makeCorpusSample();

    const result = matchFindings([], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(0);
    expect(result.false_negatives).toHaveLength(1); // GT issue not found
  });

  it('should_handle_empty_ground_truth', () => {
    const finding = makeFinding();
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
    expect(result.false_negatives).toHaveLength(0);
  });

  it('should_handle_both_empty_findings_and_ground_truth', () => {
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [],
        false_positives: [],
      },
    });

    const result = matchFindings([], sample);

    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(0);
    expect(result.false_negatives).toHaveLength(0);
  });

  it('should_not_match_finding_with_wrong_domain_and_unrelated_category', () => {
    const finding = makeFinding({
      domain: 'accessibility',
      category: 'wcag-violation',
      location: makeLocation({ line_start: 10, line_end: 10 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-89',
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    // accessibility domain vs CWE-89 => security domain => no domain match
    // wcag-violation has no alias overlap with CWE-89 aliases
    expect(result.true_positives).toHaveLength(0);
    expect(result.false_positives).toHaveLength(1);
    expect(result.false_negatives).toHaveLength(1);
  });

  it('should_use_no_ground_truth_reason_for_FP_on_non_adversarial_sample', () => {
    const finding = makeFinding({
      location: makeLocation({ file: 'src/other.ts' }),
    });
    const sample = makeCorpusSample({
      metadata: {
        source: 'synthetic',
        sourcing_method: 'synthetic',
        human_verified: true,
        verification_date: '2025-01-01',
        verified_by: ['reviewer-1', 'reviewer-2'],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.false_positives).toHaveLength(1);
    expect(result.false_positives[0].reason).toBe('no_ground_truth');
  });
});

// ─── 5. Edge Cases ───────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should_handle_empty_file_paths', () => {
    const finding = makeFinding({
      location: makeLocation({ file: '' }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ file: '' }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    // Empty paths should match each other after normalization
    expect(result.true_positives).toHaveLength(1);
  });

  it('should_only_match_one_finding_to_one_ground_truth_when_duplicates', () => {
    // Two findings pointing at the same ground truth; only one should be a TP
    const findings: Finding[] = [
      makeFinding({
        id: 'f1',
        category: 'CWE-89',
        location: makeLocation({ line_start: 10, line_end: 10 }),
      }),
      makeFinding({
        id: 'f2',
        category: 'CWE-89',
        location: makeLocation({ line_start: 10, line_end: 10 }),
      }),
    ];

    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-89',
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings(findings, sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.false_positives).toHaveLength(1);
    expect(result.false_negatives).toHaveLength(0);
  });

  it('should_preserve_severity_in_matched_findings', () => {
    const finding = makeFinding({
      severity: 'critical',
      category: 'CWE-89',
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-89',
          severity: 'high',
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].finding.severity).toBe('critical');
    expect(result.true_positives[0].ground_truth.severity).toBe('high');
  });

  it('should_use_custom_config_for_line_proximity', () => {
    const finding = makeFinding({
      location: makeLocation({ line_start: 20, line_end: 20 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    // Default proximity (5) should not match distance=10
    const resultDefault = matchFindings([finding], sample);
    expect(resultDefault.true_positives).toHaveLength(0);

    // Custom proximity of 10 should match
    const resultCustom = matchFindings([finding], sample, { lineProximity: 10 });
    expect(resultCustom.true_positives).toHaveLength(1);
  });

  it('should_use_custom_config_for_overlap_threshold', () => {
    // GT range: lines 10-19 (10 lines)
    // Finding range: lines 17-25 (overlap: 17-19 = 3 lines)
    // Overlap ratio = 3/10 = 0.3
    const finding = makeFinding({
      location: makeLocation({ line_start: 17, line_end: 25 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          location: makeLocation({ line_start: 10, line_end: 19 }),
        })],
        false_positives: [],
      },
    });

    // Default threshold (0.5) should not match 0.3 overlap
    const resultDefault = matchFindings([finding], sample);
    expect(resultDefault.true_positives).toHaveLength(0);

    // Custom threshold of 0.2 should match
    const resultCustom = matchFindings([finding], sample, { overlapThreshold: 0.2 });
    expect(resultCustom.true_positives).toHaveLength(1);
  });

  it('should_pick_best_match_when_finding_could_match_multiple_ground_truths', () => {
    // Finding matches two GTs but one is a better match (exact line vs nearby)
    const finding = makeFinding({
      category: 'CWE-89',
      location: makeLocation({ line_start: 10, line_end: 10 }),
    });

    const sample = makeCorpusSample({
      ground_truth: {
        issues: [
          makeGroundTruth({
            type: 'CWE-89',
            location: makeLocation({ line_start: 13, line_end: 13 }),
          }),
          makeGroundTruth({
            type: 'CWE-89',
            location: makeLocation({ line_start: 10, line_end: 10 }),
          }),
        ],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_score).toBe(1.0);
    // The exact match should be preferred over the nearby match
    expect(result.true_positives[0].ground_truth.location.line_start).toBe(10);
    expect(result.false_negatives).toHaveLength(1);
  });

  it('should_handle_partial_match_weight_in_scoring', () => {
    // Same file, same line, but only domain match (no alias or category match)
    // categoryScore = 0.3, partialMatchWeight = 0.5
    // Expected score: locationScore * 0.3 * 0.5 = 1.0 * 0.3 * 0.5 = 0.15
    const finding = makeFinding({
      domain: 'security',
      category: 'some-unaliased-category',
      location: makeLocation({ line_start: 10, line_end: 10 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-999',
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample);

    expect(result.true_positives).toHaveLength(1);
    expect(result.true_positives[0].match_type).toBe('partial');
    expect(result.true_positives[0].match_score).toBeCloseTo(0.15, 5);
  });

  it('should_handle_custom_partial_match_weight', () => {
    const finding = makeFinding({
      domain: 'security',
      category: 'some-unaliased-category',
      location: makeLocation({ line_start: 10, line_end: 10 }),
    });
    const sample = makeCorpusSample({
      ground_truth: {
        issues: [makeGroundTruth({
          type: 'CWE-999',
          location: makeLocation({ line_start: 10, line_end: 10 }),
        })],
        false_positives: [],
      },
    });

    const result = matchFindings([finding], sample, { partialMatchWeight: 0.8 });

    expect(result.true_positives).toHaveLength(1);
    // locationScore * 0.3 * 0.8 = 0.24
    expect(result.true_positives[0].match_score).toBeCloseTo(0.24, 5);
  });

  it('should_assign_sample_id_and_domain_to_false_negatives', () => {
    const sample = makeCorpusSample({
      id: 'test-sample-42',
      domain: 'defects',
      ground_truth: {
        issues: [makeGroundTruth({ type: 'null-deref' })],
        false_positives: [],
      },
    });

    const result = matchFindings([], sample);

    expect(result.false_negatives).toHaveLength(1);
    expect(result.false_negatives[0].sample_id).toBe('test-sample-42');
    expect(result.false_negatives[0].domain).toBe('defects');
  });

  it('should_not_double_match_ground_truth_across_findings', () => {
    // Three findings, two GTs: only two TPs should be produced, one FP
    const findings: Finding[] = [
      makeFinding({
        id: 'f1',
        category: 'CWE-89',
        location: makeLocation({ line_start: 10, line_end: 10 }),
      }),
      makeFinding({
        id: 'f2',
        category: 'CWE-79',
        location: makeLocation({ line_start: 20, line_end: 20 }),
      }),
      makeFinding({
        id: 'f3',
        category: 'CWE-89',
        location: makeLocation({ line_start: 11, line_end: 11 }),
      }),
    ];

    const sample = makeCorpusSample({
      ground_truth: {
        issues: [
          makeGroundTruth({
            type: 'CWE-89',
            location: makeLocation({ line_start: 10, line_end: 10 }),
          }),
          makeGroundTruth({
            type: 'CWE-79',
            location: makeLocation({ line_start: 20, line_end: 20 }),
          }),
        ],
        false_positives: [],
      },
    });

    const result = matchFindings(findings, sample);

    expect(result.true_positives).toHaveLength(2);
    expect(result.false_positives).toHaveLength(1);
    expect(result.false_negatives).toHaveLength(0);
  });
});
