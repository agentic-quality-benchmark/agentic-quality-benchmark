# ADR-013: Testing Strategy for the Harness

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-013 |
| **Initiative** | Testing Strategy |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** ensuring the AQB evaluation harness itself is reliable, correct, and maintainable, where the harness code (matcher, metrics, runner, adapters, CLI) is the measurement instrument for the entire benchmark and any bug in the harness corrupts all evaluation results,

**facing** the challenge of testing a system that evaluates other systems -- where matcher bugs produce incorrect true/false positive classifications, metrics bugs produce incorrect scores, adapter bugs produce incorrect findings, runner bugs produce non-deterministic execution, and corpus validation bugs allow invalid samples -- while maintaining a fast CI feedback loop, achieving meaningful coverage, and testing at multiple levels of abstraction (unit, integration, property-based, snapshot, corpus validation),

**we decided for** a multi-level testing strategy using Vitest as the test framework with seven testing categories: (1) unit tests for matcher, metrics, type validation, and individual components, (2) integration tests for the adapter-to-scorecard pipeline, (3) property-based tests for matcher invariants and metric bounds, (4) corpus validation tests for schema conformance, (5) snapshot tests for scorecard JSON output stability, (6) test fixtures using a minimal corpus (5 samples, 2 domains) for fast testing, and (7) a CI pipeline ordering build -> lint -> unit -> integration -> corpus-validate, targeting 80% line coverage for `harness/src/`,

**and neglected** (a) testing only at the integration level because it is too slow for CI and does not isolate the component under test; (b) testing only at the unit level because it misses integration failures between components; (c) end-to-end Docker-based tests in CI because they require Docker daemon and are slow; (d) manual testing because the harness must be verifiably correct as a measurement instrument,

**to achieve** high confidence that the harness produces correct evaluation results, fast CI feedback (unit tests complete in < 30 seconds), regression detection through snapshot tests, mathematical correctness of metrics through property-based tests, corpus integrity through schema validation tests, and a clear testing strategy that contributors can follow,

**accepting that** 80% coverage does not guarantee correctness, property-based tests add execution time, snapshot tests require maintenance when output format changes, and Docker-based integration tests are excluded from CI (run manually or in scheduled jobs).

---

## Problem Statement

The AQB harness is a measurement instrument. If the instrument is inaccurate, every measurement it produces is wrong:

| Harness Component | Correctness Requirement | Consequence of Bug |
|-------------------|------------------------|-------------------|
| Matcher (`matcher.ts`) | Correctly classifies TP/FP/FN | Tools unfairly penalized or rewarded |
| Metrics (`metrics.ts`) | Correctly computes P/R/F1/SWR | Scorecard numbers are wrong |
| Adapter normalization | Correctly translates tool output | Findings lost or fabricated during translation |
| Runner lifecycle | Deterministic execution | Non-reproducible results |
| Corpus validation | Correctly validates schemas | Invalid samples enter corpus |
| CLI output | Correctly formats results | Users make decisions on wrong information |

### Current Testing State

| Component | Test Coverage | Test Types | Gap |
|-----------|-------------|------------|-----|
| `matcher.ts` | None | None | No tests for fuzzy matching logic |
| `metrics.ts` | None | None | No tests for metric computation |
| `types.ts` | N/A (interfaces only) | N/A | No Zod schema validation tests |
| `adapters/` | None | None | No adapter translation tests |
| `index.ts` | None | None | No barrel export tests |
| CI pipeline | None | None | No CI configuration |

### Test Framework

| Component | Tool | Version | Notes |
|-----------|------|---------|-------|
| Test runner | Vitest | ^3.0.0 | Already in devDependencies |
| Assertion | Vitest built-in (expect) | -- | chai-compatible |
| Mocking | Vitest built-in (vi.mock) | -- | London School TDD |
| Property-based | fast-check (to be added) | ^3.0.0 | For invariant testing |
| Snapshot | Vitest built-in (toMatchSnapshot) | -- | For output stability |
| Coverage | c8 via Vitest | -- | `vitest --coverage` |

---

## Opportunity

A comprehensive testing strategy transforms the harness from untested code into a verified measurement instrument.

| Dimension | Before | After |
|-----------|--------|-------|
| Matcher correctness | Assumed | Verified: unit tests for all matching scenarios, property tests for invariants |
| Metrics accuracy | Assumed | Verified: unit tests with known inputs and expected outputs |
| Adapter reliability | Untested | Verified: fixture-based translation tests per adapter |
| Corpus integrity | Unchecked | Verified: schema validation for every sample |
| Output stability | Unknown | Verified: snapshot tests detect unintended output changes |
| Regression detection | None | Automated: CI runs all tests on every commit |
| Coverage tracking | None | Measured: 80% line coverage target |

### Test Architecture

```
tests/
  unit/
    matcher/
      matcher.test.ts              -- Core matching logic
      location-scoring.test.ts     -- Location proximity/overlap
      category-scoring.test.ts     -- Category compatibility
      file-matching.test.ts        -- Path normalization
    metrics/
      metrics.test.ts              -- Standard IR metrics
      severity-weighted.test.ts    -- Severity-weighted recall
      cost-efficiency.test.ts      -- Cost metrics
      domain-metrics.test.ts       -- Per-domain breakdown
      difficulty-metrics.test.ts   -- Per-difficulty breakdown
    corpus/
      schema-validation.test.ts    -- Zod schema tests
      repository.test.ts           -- Repository pattern tests
    adapters/
      semgrep-adapter.test.ts      -- Semgrep output translation
      eslint-adapter.test.ts       -- ESLint output translation
      codeql-adapter.test.ts       -- CodeQL SARIF translation
      axe-adapter.test.ts          -- axe-core output translation
    cli/
      command-parsing.test.ts      -- CLI argument parsing
      output-formatting.test.ts    -- Output format rendering
  integration/
    pipeline.test.ts               -- Adapter -> matcher -> metrics -> scorecard
    runner-integration.test.ts     -- Runner with mock adapter (no Docker)
  property/
    matcher-properties.test.ts     -- Matcher invariants (fast-check)
    metrics-properties.test.ts     -- Metric bound invariants
  snapshot/
    scorecard-output.test.ts       -- Scorecard JSON stability
    table-output.test.ts           -- Table format stability
  fixtures/
    corpus/
      minimal-corpus/              -- 5 samples, 2 domains
        security-sql-injection-001.json
        security-xss-001.json
        defects-null-deref-001.json
        defects-race-condition-001.json
        adversarial-clean-001.json
      manifest.json
    adapter-output/
      semgrep-output.json          -- Real Semgrep JSON output fixture
      eslint-output.json           -- Real ESLint JSON output fixture
      codeql-sarif.json            -- Real CodeQL SARIF output fixture
      axe-results.json             -- Real axe-core results fixture
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Unit tests | Matcher, metrics, schema validation, adapter translation, CLI parsing |
| Integration tests | Full pipeline: adapter -> matcher -> metrics -> scorecard |
| Property-based tests | Matcher invariants, metric bounds using fast-check |
| Corpus validation tests | Zod schema conformance for every corpus sample |
| Snapshot tests | Scorecard JSON and table output stability |
| Test fixtures | Minimal corpus (5 samples, 2 domains) for fast, deterministic testing |
| CI pipeline | build -> lint -> unit -> integration -> corpus-validate |
| Coverage target | 80% line coverage for harness/src/ |

### Test Categories Detail

#### 1. Unit Tests

| Test File | Component | Test Cases | Priority |
|-----------|-----------|------------|----------|
| `matcher.test.ts` | `matchFindings()` | Exact match, no match, partial match, multiple findings, greedy assignment | Critical |
| `location-scoring.test.ts` | `computeLocationScore()` | Single-line exact, single-line proximity, multi-line overlap, multi-line below threshold, boundary cases | Critical |
| `category-scoring.test.ts` | `computeCategoryScore()` | Exact category, CWE alias, same family, same domain, no match | Critical |
| `file-matching.test.ts` | `filesMatch()` | Exact path, leading `./`, backslash normalization, case sensitivity | High |
| `metrics.test.ts` | `computeMetrics()` | Zero findings, all TP, all FP, mixed, edge cases (0 denominators) | Critical |
| `severity-weighted.test.ts` | SWR calculation | All critical, all info, mixed severity, partial match scores | Critical |
| `cost-efficiency.test.ts` | Cost metrics | Zero cost (Infinity), non-zero cost, zero TP | High |
| `domain-metrics.test.ts` | `computeDomainMetrics()` | Single domain, multiple domains, empty domain | High |
| `difficulty-metrics.test.ts` | `computeDifficultyMetrics()` | All difficulties, single difficulty, empty | Medium |
| `schema-validation.test.ts` | Zod schemas | Valid sample, missing required fields, invalid types, cross-validation (file refs) | Critical |
| `semgrep-adapter.test.ts` | Semgrep -> Finding[] | SARIF output, native JSON, severity mapping, rule ID -> category | High |
| `eslint-adapter.test.ts` | ESLint -> Finding[] | JSON formatter output, severity mapping, rule -> category | High |
| `command-parsing.test.ts` | CLI argument parsing | All flags, required flags missing, invalid values, defaults | Medium |
| `output-formatting.test.ts` | Table/JSON/report output | Each format renders correctly, handles edge cases | Medium |

#### 2. Integration Tests

| Test | Scope | What It Verifies |
|------|-------|-----------------|
| Full pipeline | Adapter -> Matcher -> Metrics -> Scorecard | End-to-end correctness with known inputs and expected outputs |
| Runner with mock adapter | Runner -> Mock Adapter -> Results | Runner lifecycle management, event ordering, result aggregation |
| Corpus load -> evaluate | Repository -> Runner -> Results | File loading, filtering, evaluation |
| Comparison mode | Two results -> Delta analysis | Comparison computation and formatting |

Integration test approach:
- Use test fixtures (minimal corpus + adapter output fixtures)
- Mock Docker (no actual container execution in CI)
- Verify complete pipeline produces expected scorecard

#### 3. Property-based Tests

| Property | Component | Generator | Assertion |
|----------|-----------|-----------|-----------|
| File matching is reflexive | `filesMatch()` | Any file path string | `filesMatch(p, p) === true` |
| Location score is in [0, 1] | `computeLocationScore()` | Random line numbers | `0 <= score <= 1` |
| Category score is in {0, 0.3, 0.7, 1.0} | `computeCategoryScore()` | Random categories | Score is one of the four values |
| Precision is in [0, 1] | `computeMetrics()` | Random TP/FP/FN counts | `0 <= precision <= 1` |
| Recall is in [0, 1] | `computeMetrics()` | Random TP/FP/FN counts | `0 <= recall <= 1` |
| F1 is in [0, 1] | `computeMetrics()` | Random TP/FP/FN counts | `0 <= f1 <= 1` |
| F1 <= max(P, R) | `computeMetrics()` | Random TP/FP/FN counts | F1 is harmonic mean, always <= arithmetic mean |
| TP + FP = total findings | `matchFindings()` | Random findings + ground truth | All findings classified as TP or FP |
| TP + FN = total ground truth | `matchFindings()` | Random findings + ground truth | All GT classified as matched or missed |
| No double-counting | `matchFindings()` | Random findings + ground truth | Each GT matched at most once |
| SWR is in [0, 1] | `computeMetrics()` | Random severities | `0 <= swr <= 1` |
| Fabrication rate in [0, 1] | `computeMetrics()` | Random fabrication counts | `0 <= fab_rate <= 1` |

#### 4. Corpus Validation Tests

| Test | What It Validates | When Run |
|------|------------------|----------|
| Schema conformance | Every sample in corpus/v0.1/ passes CorpusSampleSchema | CI + pre-commit |
| ID uniqueness | No duplicate sample IDs across entire corpus | CI |
| File reference integrity | Every GT issue location.file exists in sample.files | CI |
| Domain consistency | sample.domain matches ID prefix | CI |
| Adversarial percentage | Each domain has >= 20% adversarial negatives | CI (when domain has enough samples) |
| Reviewer minimum | All verified samples have >= 2 reviewers | CI |
| Manifest consistency | Manifest sample counts match actual file counts | CI |

#### 5. Snapshot Tests

| Test | What It Snapshots | When Updated |
|------|------------------|-------------|
| Scorecard JSON | Full scorecard output from fixture evaluation | When Scorecard schema changes |
| Table output | Table-formatted evaluation summary | When table format changes |
| Error messages | Structured error output for each error code | When error messages change |
| CLI help text | `aqb --help` output | When commands change |

#### 6. Test Fixtures

Minimal corpus for testing (5 samples, 2 domains):

| Sample ID | Domain | Category | Language | Difficulty | Issues | Adversarial |
|-----------|--------|----------|----------|------------|--------|-------------|
| `security-sql-injection-001` | security | sql-injection | typescript | 2 | 1 (CWE-89) | No |
| `security-xss-001` | security | xss | typescript | 3 | 1 (CWE-79) | No |
| `defects-null-deref-001` | defects | null-deref | python | 2 | 1 | No |
| `defects-race-condition-001` | defects | race-condition | java | 4 | 2 | No |
| `adversarial-clean-001` | security | adversarial | typescript | 1 | 0 | Yes |

### CI Pipeline

```
+----------+     +--------+     +--------+     +-------------+     +------------------+
|  Build   | --> |  Lint  | --> |  Unit  | --> | Integration | --> | Corpus Validate  |
| tsc      |     | eslint |     | vitest |     | vitest      |     | aqb validate     |
|          |     |        |     | (fast) |     | (mock deps) |     | (schema check)   |
+----------+     +--------+     +--------+     +-------------+     +------------------+
                                    |
                              +----------+
                              | Coverage |
                              | c8 report|
                              | >= 80%   |
                              +----------+
```

| Stage | Duration | Failure Behavior |
|-------|----------|-----------------|
| Build | ~10s | Fail fast; no point running tests if code does not compile |
| Lint | ~5s | Fail fast; code style issues should be fixed |
| Unit | ~15s | Report all failures; do not stop on first failure |
| Integration | ~30s | Report all failures |
| Corpus Validate | ~10s | Report all validation errors with sample IDs |
| Coverage | ~5s (computed during unit) | Warn if below 80%; fail if below 60% |

Total CI time target: < 90 seconds

### Coverage Requirements

| Directory | Target | Rationale |
|-----------|--------|-----------|
| `harness/src/matcher.ts` | 95% | Core algorithm; must be thoroughly tested |
| `harness/src/metrics.ts` | 95% | Core computation; must be thoroughly tested |
| `harness/src/corpus/` | 85% | Data integrity layer; high coverage needed |
| `harness/src/adapters/` | 80% | Translation logic; tested with fixtures |
| `harness/src/runner/` | 75% | Docker integration; some paths hard to test without Docker |
| `harness/src/cli/` | 70% | Presentation layer; lower priority |
| `harness/src/` (overall) | 80% | Aggregate target |

---

## Options Considered

### Option 1: [Selected] -- Multi-level Testing with Vitest, Property-based Tests, and Fixtures

**Description:** Seven testing categories (unit, integration, property, corpus validation, snapshot, fixtures, CI pipeline) using Vitest, fast-check for property-based tests, minimal corpus fixtures, and an ordered CI pipeline targeting 80% coverage.

**Pros:**
- Multiple test levels catch different types of bugs
- Property-based tests verify mathematical invariants
- Fixtures enable fast, deterministic testing without Docker
- Snapshot tests detect unintended output changes
- CI pipeline provides fast feedback (< 90 seconds)
- 80% coverage target balances thoroughness with pragmatism

**Cons:**
- Seven testing categories require significant initial test-writing effort
- Property-based tests add fast-check dependency
- Snapshot tests require maintenance when output format changes
- Minimal corpus fixture must be maintained alongside real corpus

### Option 2: [Rejected] -- Integration Tests Only

**Description:** Test only at the integration level, running full pipeline tests with real adapters.

**Pros:**
- High confidence in end-to-end behavior
- Tests reflect actual usage patterns
- Fewer test files to maintain

**Cons:**
- Slow: each integration test takes seconds (adapter execution)
- Difficult to isolate component bugs
- Requires Docker for adapter tests (not available in all CI)
- Does not verify mathematical properties of metrics
- Coverage gaps in edge cases

**Rejection rationale:** Integration-only testing is too slow for CI, does not isolate component bugs, and cannot verify mathematical invariants of the matching and metrics algorithms.

### Option 3: [Rejected] -- Unit Tests Only

**Description:** Test only at the unit level, mocking all dependencies.

**Pros:**
- Fast execution (< 10 seconds)
- Easy to isolate component behavior
- No external dependencies (Docker, files)

**Cons:**
- Misses integration failures (e.g., matcher output format incompatible with metrics input)
- Mocks may not reflect actual dependency behavior
- No pipeline-level verification
- No corpus validation

**Rejection rationale:** Unit-only testing misses the critical integration points where most benchmark bugs occur (e.g., matcher output feeding metrics computation). Multi-level testing is necessary for a measurement instrument.

---

## Consequences

### Positive
- Matcher correctness verified through unit tests (all matching scenarios) and property tests (invariants)
- Metrics accuracy verified through known-input/expected-output unit tests and property tests (bounds)
- Adapter translation verified through fixture-based unit tests with real tool output
- Corpus integrity verified through Zod schema validation on every sample
- Output stability verified through snapshot tests
- CI provides fast feedback (< 90 seconds) on every commit
- 80% coverage target ensures most code paths are exercised

### Negative
- Test-writing effort is significant (estimated 40+ test files)
- fast-check dependency added for property-based tests
- Snapshot tests generate maintenance burden when output format evolves
- Minimal corpus fixture must be kept in sync with corpus schema changes
- Docker-based tests excluded from CI (must be run manually)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Test fixtures become stale | Medium | Medium | Fixture generation script; regenerate when schema changes |
| Property-based tests find bugs that are hard to reproduce | Low | Low | fast-check provides shrinking; log seed for reproduction |
| Snapshot tests break on every formatting change | Medium | Low | Group snapshot updates with formatting changes; document snapshot update process |
| 80% coverage gives false confidence | Medium | Medium | Coverage is necessary but not sufficient; prioritize critical-path coverage |
| CI becomes too slow as test suite grows | Low | Medium | Parallelize test suites; split unit and integration into separate CI jobs |

---

## Governance

| Review Board | Date | Outcome | Review Cadence | Next Review |
|--------------|------|---------|----------------|-------------|
| AQB Architecture Team | 2026-03-09 | Proposed | 6 months | 2026-09-09 |

---

## Status History

| Status | Approver | Date |
|--------|----------|------|
| Proposed | Architecture Team | 2026-03-09 |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Tests | ADR-002 | Corpus Aggregate Design | Corpus validation tests and Zod schema tests |
| Tests | ADR-003 | Evaluation Engine Runner Architecture | Runner integration tests |
| Tests | ADR-004 | Adapter Layer Anti-Corruption Pattern | Adapter translation unit tests with fixtures |
| Tests | ADR-005 | Matching Engine Algorithm | Matcher unit tests and property tests |
| Tests | ADR-006 | Metrics and Scoring | Metrics unit tests and property tests |
| Tests | ADR-008 | CLI and API Gateway | CLI parsing and output formatting tests |
| Tests | ADR-010 | Docker Isolation and Reproducibility | Docker conformance tests (manual, not CI) |
| Tests | ADR-012 | Cross-Cutting Concerns | Error taxonomy and logging tests |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Vitest | Test Framework | https://vitest.dev/ (v3.x in package.json) |
| REF-002 | fast-check | Library | https://fast-check.dev/ (property-based testing) |
| REF-003 | Package.json test script | Configuration | `harness/package.json` ("test": "vitest run") |
| REF-004 | London School TDD | Methodology | Mock-first, outside-in testing approach |
| REF-005 | Matcher implementation | Source Code | `harness/src/matcher.ts` |
| REF-006 | Metrics implementation | Source Code | `harness/src/metrics.ts` |
| REF-007 | c8 code coverage | Tool | https://github.com/bcoe/c8 |
