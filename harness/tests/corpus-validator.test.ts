/**
 * Corpus Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { validateCorpus, validateSample } from '../src/corpus/validator.js';
import type { CorpusSample } from '../src/types.js';
import type { Manifest } from '../src/corpus/validator.js';

// ─── Test Fixtures ──────────────────────────────────────────────────────────

function makeValidSample(overrides?: Partial<CorpusSample>): CorpusSample {
  return {
    id: 'security-sql-injection-001',
    domain: 'security',
    category: 'sql-injection',
    language: 'typescript',
    difficulty: 3,
    files: [
      { path: 'src/db.ts', content: 'const query = `SELECT * FROM users WHERE id = ${id}`;' },
    ],
    ground_truth: {
      issues: [
        {
          type: 'CWE-89',
          severity: 'critical',
          location: { file: 'src/db.ts', line_start: 1, line_end: 1 },
          description: 'SQL injection via string interpolation',
          fix_available: true,
        },
      ],
      false_positives: [],
    },
    metadata: {
      source: 'synthetic',
      sourcing_method: 'synthetic',
      human_verified: true,
      verification_date: '2026-01-15',
      verified_by: ['reviewer-a', 'reviewer-b'],
    },
    ...overrides,
  };
}

function makeAdversarialNegative(id: string, domain: string, category: string): CorpusSample {
  return {
    id,
    domain: domain as CorpusSample['domain'],
    category,
    language: 'typescript',
    difficulty: 2,
    files: [
      { path: 'src/safe.ts', content: 'const x = 1;' },
    ],
    ground_truth: {
      issues: [],
      false_positives: [],
    },
    metadata: {
      source: 'synthetic',
      sourcing_method: 'adversarial_negative',
      human_verified: true,
      verification_date: '2026-01-15',
      verified_by: ['reviewer-a', 'reviewer-b'],
    },
  };
}

const TEST_MANIFEST: Manifest = {
  security: {
    categories: [
      'sql-injection', 'xss', 'hardcoded-secrets',
      'path-traversal', 'command-injection', 'crypto-weakness', 'ssrf',
    ],
    target_samples: 200,
    current_samples: 0,
    status: 'in-progress',
  },
  defects: {
    categories: [
      'null-deref', 'race-condition', 'off-by-one',
      'resource-leak', 'state-corruption', 'type-confusion',
    ],
    target_samples: 150,
    current_samples: 0,
    status: 'planned',
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Corpus Validator', () => {
  describe('validateSample', () => {
    it('should pass for a valid sample', () => {
      const sample = makeValidSample();
      const raw = sample as unknown as Record<string, unknown>;
      const { errors, warnings } = validateSample(raw);

      expect(errors).toHaveLength(0);
      expect(warnings).toHaveLength(0);
    });

    it('should fail when required fields are missing', () => {
      const incomplete = { id: 'test-001' } as unknown as Record<string, unknown>;
      const { errors } = validateSample(incomplete);

      expect(errors.length).toBeGreaterThanOrEqual(1);
      const missingFields = errors.map(e => e.field);
      expect(missingFields).toContain('domain');
      expect(missingFields).toContain('category');
      expect(missingFields).toContain('language');
      expect(missingFields).toContain('difficulty');
      expect(missingFields).toContain('files');
      expect(missingFields).toContain('ground_truth');
      expect(missingFields).toContain('metadata');
    });

    it('should fail for an invalid domain', () => {
      const sample = makeValidSample();
      const raw = { ...sample, domain: 'not-a-domain' } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const domainError = errors.find(e => e.field === 'domain');
      expect(domainError).toBeDefined();
      expect(domainError!.message).toContain('Invalid domain');
      expect(domainError!.message).toContain('not-a-domain');
    });

    it('should fail when difficulty is out of range', () => {
      const sample = makeValidSample();
      const raw = { ...sample, difficulty: 7 } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const diffError = errors.find(e => e.field === 'difficulty');
      expect(diffError).toBeDefined();
      expect(diffError!.message).toContain('Invalid difficulty');
    });

    it('should fail when difficulty is not an integer', () => {
      const sample = makeValidSample();
      const raw = { ...sample, difficulty: 2.5 } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const diffError = errors.find(e => e.field === 'difficulty');
      expect(diffError).toBeDefined();
    });

    it('should fail when difficulty is 0', () => {
      const sample = makeValidSample();
      const raw = { ...sample, difficulty: 0 } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const diffError = errors.find(e => e.field === 'difficulty');
      expect(diffError).toBeDefined();
    });

    it('should fail for an invalid language', () => {
      const sample = makeValidSample();
      const raw = { ...sample, language: 'haskell' } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const langError = errors.find(e => e.field === 'language');
      expect(langError).toBeDefined();
      expect(langError!.message).toContain('Invalid language');
    });

    it('should fail when files array is empty', () => {
      const sample = makeValidSample();
      const raw = { ...sample, files: [] } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const fileError = errors.find(e => e.field === 'files');
      expect(fileError).toBeDefined();
      expect(fileError!.message).toContain('must not be empty');
    });

    it('should fail when ground_truth has no issues and is not adversarial negative', () => {
      const sample = makeValidSample();
      const raw = {
        ...sample,
        ground_truth: { issues: [], false_positives: [] },
      } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const gtError = errors.find(e => e.field === 'ground_truth.issues');
      expect(gtError).toBeDefined();
      expect(gtError!.message).toContain('at least one issue');
    });

    it('should pass when ground_truth has no issues but is adversarial negative', () => {
      const sample = makeAdversarialNegative(
        'security-sql-injection-099',
        'security',
        'sql-injection',
      );
      const raw = sample as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      expect(errors).toHaveLength(0);
    });

    it('should fail when issue location has line_start > line_end', () => {
      const sample = makeValidSample();
      const raw = {
        ...sample,
        ground_truth: {
          issues: [{
            type: 'CWE-89',
            severity: 'critical',
            location: { file: 'src/db.ts', line_start: 10, line_end: 5 },
            description: 'Bad location',
            fix_available: false,
          }],
          false_positives: [],
        },
      } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const locError = errors.find(e => e.field.includes('location'));
      expect(locError).toBeDefined();
      expect(locError!.message).toContain('line_start');
    });

    it('should fail when issue location has line_start < 1', () => {
      const sample = makeValidSample();
      const raw = {
        ...sample,
        ground_truth: {
          issues: [{
            type: 'CWE-89',
            severity: 'critical',
            location: { file: 'src/db.ts', line_start: 0, line_end: 5 },
            description: 'Zero-based line',
            fix_available: false,
          }],
          false_positives: [],
        },
      } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const locError = errors.find(e => e.field.includes('line_start'));
      expect(locError).toBeDefined();
    });

    it('should fail when metadata has fewer than 2 reviewers', () => {
      const sample = makeValidSample();
      const raw = {
        ...sample,
        metadata: {
          ...sample.metadata,
          verified_by: ['only-one'],
        },
      } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const reviewError = errors.find(e => e.field === 'metadata.verified_by');
      expect(reviewError).toBeDefined();
      expect(reviewError!.message).toContain('at least 2 reviewers');
    });

    it('should fail when metadata has empty verified_by array', () => {
      const sample = makeValidSample();
      const raw = {
        ...sample,
        metadata: {
          ...sample.metadata,
          verified_by: [],
        },
      } as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw);

      const reviewError = errors.find(e => e.field === 'metadata.verified_by');
      expect(reviewError).toBeDefined();
    });

    it('should fail when category is not in manifest', () => {
      const sample = makeValidSample({
        category: 'buffer-overflow',
      });
      const raw = sample as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw, TEST_MANIFEST);

      const catError = errors.find(e => e.field === 'category');
      expect(catError).toBeDefined();
      expect(catError!.message).toContain('buffer-overflow');
      expect(catError!.message).toContain('not in the manifest');
    });

    it('should pass when category is in manifest', () => {
      const sample = makeValidSample();
      const raw = sample as unknown as Record<string, unknown>;
      const { errors } = validateSample(raw, TEST_MANIFEST);

      const catError = errors.find(e => e.field === 'category');
      expect(catError).toBeUndefined();
    });

    describe('ID format validation', () => {
      it('should pass for valid ID format: domain-category-NNN', () => {
        const sample = makeValidSample({
          id: 'security-sql-injection-001',
        });
        const raw = sample as unknown as Record<string, unknown>;
        const { errors } = validateSample(raw);

        const idError = errors.find(e => e.field === 'id');
        expect(idError).toBeUndefined();
      });

      it('should fail when ID does not start with domain-category-', () => {
        const sample = makeValidSample({
          id: 'wrong-prefix-001',
        });
        const raw = sample as unknown as Record<string, unknown>;
        const { errors } = validateSample(raw);

        const idError = errors.find(e => e.field === 'id');
        expect(idError).toBeDefined();
        expect(idError!.message).toContain('domain-category-NNN');
      });

      it('should fail when ID suffix is not numeric', () => {
        const sample = makeValidSample({
          id: 'security-sql-injection-abc',
        });
        const raw = sample as unknown as Record<string, unknown>;
        const { errors } = validateSample(raw);

        const idError = errors.find(e => e.field === 'id');
        expect(idError).toBeDefined();
        expect(idError!.message).toContain('numeric sequence');
      });

      it('should fail when ID suffix is too short', () => {
        const sample = makeValidSample({
          id: 'security-sql-injection-01',
        });
        const raw = sample as unknown as Record<string, unknown>;
        const { errors } = validateSample(raw);

        const idError = errors.find(e => e.field === 'id');
        expect(idError).toBeDefined();
      });

      it('should pass for longer numeric suffixes like 1000', () => {
        const sample = makeValidSample({
          id: 'security-sql-injection-1000',
        });
        const raw = sample as unknown as Record<string, unknown>;
        const { errors } = validateSample(raw);

        const idError = errors.find(e => e.field === 'id');
        expect(idError).toBeUndefined();
      });
    });
  });

  describe('validateCorpus', () => {
    it('should return valid for a set of valid samples', () => {
      const samples = [
        makeValidSample(),
        makeValidSample({
          id: 'security-sql-injection-002',
        }),
      ];

      const result = validateCorpus(samples);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.stats.total_samples).toBe(2);
      expect(result.stats.valid_samples).toBe(2);
      expect(result.stats.invalid_samples).toBe(0);
    });

    it('should count invalid samples correctly', () => {
      const validSample = makeValidSample();
      const invalidSample = makeValidSample({
        id: 'security-sql-injection-002',
        domain: 'invalid-domain' as any,
      });

      const result = validateCorpus([validSample, invalidSample]);

      expect(result.valid).toBe(false);
      expect(result.stats.valid_samples).toBe(1);
      expect(result.stats.invalid_samples).toBe(1);
    });

    it('should detect duplicate IDs', () => {
      const sample1 = makeValidSample();
      const sample2 = makeValidSample(); // same ID

      const result = validateCorpus([sample1, sample2]);

      expect(result.valid).toBe(false);
      const dupError = result.errors.find(e => e.message.includes('Duplicate ID'));
      expect(dupError).toBeDefined();
    });

    it('should track domain coverage', () => {
      const samples = [
        makeValidSample(),
        makeValidSample({
          id: 'defects-null-deref-001',
          domain: 'defects',
          category: 'null-deref',
        }),
      ];

      const result = validateCorpus(samples);

      expect(result.stats.domains_covered).toContain('security');
      expect(result.stats.domains_covered).toContain('defects');
      expect(result.stats.domains_missing).toContain('accessibility');
      expect(result.stats.domains_missing).toContain('performance');
      expect(result.stats.domains_missing.length).toBe(12); // 14 - 2
    });

    it('should warn when adversarial negative ratio is below 20%', () => {
      // 4 regular samples, 0 adversarial = 0% ratio
      const samples = [
        makeValidSample({ id: 'security-sql-injection-001' }),
        makeValidSample({ id: 'security-sql-injection-002' }),
        makeValidSample({ id: 'security-sql-injection-003' }),
        makeValidSample({ id: 'security-sql-injection-004' }),
      ];

      const result = validateCorpus(samples);

      const ratioWarning = result.warnings.find(
        w => w.field === 'adversarial_negative_ratio',
      );
      expect(ratioWarning).toBeDefined();
      expect(ratioWarning!.message).toContain('security');
      expect(ratioWarning!.message).toContain('below');
      expect(result.stats.adversarial_negative_ratio['security']).toBe(0);
    });

    it('should not warn when adversarial negative ratio meets 20%', () => {
      // 3 regular + 1 adversarial = 25% ratio
      const samples = [
        makeValidSample({ id: 'security-sql-injection-001' }),
        makeValidSample({ id: 'security-sql-injection-002' }),
        makeValidSample({ id: 'security-sql-injection-003' }),
        makeAdversarialNegative('security-sql-injection-004', 'security', 'sql-injection'),
      ];

      const result = validateCorpus(samples);

      const ratioWarning = result.warnings.find(
        w => w.field === 'adversarial_negative_ratio',
      );
      expect(ratioWarning).toBeUndefined();
      expect(result.stats.adversarial_negative_ratio['security']).toBe(0.25);
    });

    it('should track reviewer coverage stats', () => {
      const sampleLowReviewers = makeValidSample({
        id: 'security-sql-injection-002',
        metadata: {
          source: 'synthetic',
          sourcing_method: 'synthetic',
          human_verified: true,
          verification_date: '2026-01-15',
          verified_by: ['only-one'],
        },
      });

      const result = validateCorpus([makeValidSample(), sampleLowReviewers]);

      expect(result.stats.reviewer_coverage.meets_minimum).toBe(false);
      expect(result.stats.reviewer_coverage.samples_below_threshold).toContain(
        'security-sql-injection-002',
      );
    });

    it('should validate against manifest when provided', () => {
      const sample = makeValidSample({
        category: 'buffer-overflow',
      });

      const result = validateCorpus([sample], TEST_MANIFEST);

      expect(result.valid).toBe(false);
      const catError = result.errors.find(e => e.field === 'category');
      expect(catError).toBeDefined();
    });

    it('should return valid with empty samples array', () => {
      const result = validateCorpus([]);

      expect(result.valid).toBe(true);
      expect(result.stats.total_samples).toBe(0);
      expect(result.stats.domains_missing.length).toBe(14);
    });
  });
});
