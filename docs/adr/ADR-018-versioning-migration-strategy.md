# ADR-018: Versioning and Migration Strategy

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-018 |
| **Initiative** | Versioning and Migration Strategy |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** a benchmark system (AQB) where the shared kernel types, corpus schema, adapter API, and scorecard format will all evolve over time across multiple bounded contexts, and where historical evaluation results must remain interpretable and comparable to produce meaningful leaderboard rankings,

**facing** the problem that uncontrolled schema evolution will break adapter integrations, invalidate historical results, make cross-version leaderboard comparisons meaningless, and create silent data corruption when corpus samples are loaded against incompatible harness versions -- all without any detection mechanism in place today,

**we decided for** semantic versioning (SemVer) applied independently to the shared kernel, corpus, adapter API, and scorecard schema, enforced by automated breaking-change detection in CI, supported by migration tooling for corpus upgrades between versions, and governed by a deprecation policy requiring 6-month notice before removing any public API or corpus field,

**and neglected** (a) calendar-based versioning (CalVer) because it provides no signal about compatibility and forces consumers to read changelogs to determine upgrade safety; (b) treating the entire project as pre-1.0 with no formal versioning because it would prevent any meaningful leaderboard comparison and discourage adapter authors from building against an unstable target,

**to achieve** predictable upgrade paths for adapter authors and corpus contributors, trustworthy cross-version result comparisons on the leaderboard, automated detection of accidental breaking changes before they reach consumers, and a clear social contract about stability guarantees,

**accepting that** semantic versioning requires discipline in classifying changes, the migration tooling adds development and maintenance burden, independent version numbers for each artifact create coordination complexity, and the deprecation policy constrains the speed at which we can remove legacy features.

---

## Problem Statement

AQB has multiple independently evolving artifacts that downstream consumers depend on:

| Artifact | Current State | Consumers | Breaking Change Risk |
|----------|---------------|-----------|---------------------|
| Shared kernel (`types.ts`) | Single unversioned file | All 8 bounded contexts, all adapters | Any type change cascades to every consumer |
| Corpus schema | Implicit v0.1 directory convention | Harness loader, validators, contributors | Field additions/removals break sample loading |
| Adapter API (`AQBToolAdapter`) | Interface in `types.ts`, no stability guarantee | 7+ built-in adapters, external adapter authors | Method signature changes break all adapters |
| Scorecard schema | `Scorecard` interface in `types.ts` | Leaderboard, results storage, comparison tools | Schema changes invalidate stored results |
| Evaluation results (`AQBResult`) | `AQBResult` interface in `types.ts` | Leaderboard submissions, historical comparison | Metric additions/removals break result parsing |

Without a versioning strategy, these problems compound:

1. **Silent incompatibility**: A harness built against corpus v0.2 loads a v0.1 sample and silently ignores missing fields, producing incorrect metrics.
2. **Adapter breakage**: A type change in `Finding` or `CorpusSample` breaks every adapter at compile time with no migration path.
3. **Leaderboard corruption**: Results generated with different metric formulas (ADR-006) are ranked together as if comparable.
4. **Contributor friction**: Corpus contributors do not know which fields are required, optional, or deprecated.
5. **No rollback path**: Without version pinning, there is no way to reproduce a previous evaluation run exactly.

### Versioning Scope Diagram

```
+-------------------------------------------------------------+
|                     AQB VERSION MATRIX                       |
+-------------------------------------------------------------+
|                                                              |
|  Shared Kernel (types.ts)          v1.0.0  v1.1.0  v2.0.0  |
|  +--------------------------+                                |
|  | Domain, Severity, Finding|  <-- Governs all below         |
|  | CorpusSample, Location   |                                |
|  | AQBToolAdapter, Scorecard|                                |
|  +--------------------------+                                |
|        |          |         |                                |
|        v          v         v                                |
|  +-----------+ +-------+ +----------+                        |
|  |  Corpus   | |Adapter| |Scorecard |                        |
|  |  v0.1     | |API v1 | |Schema v1 |                        |
|  |  v0.2     | |API v2 | |Schema v2 |                        |
|  |  v1.0     | |       | |          |                        |
|  +-----------+ +-------+ +----------+                        |
|        |          |         |                                |
|        +----------+---------+                                |
|                   |                                          |
|                   v                                          |
|  +----------------------------------+                        |
|  |  Evaluation Run Manifest         |                        |
|  |  harness: 1.2.0                  |                        |
|  |  corpus: v0.2                    |                        |
|  |  adapter_api: v1                 |                        |
|  |  scorecard_schema: v1            |                        |
|  |  run_id: uuid                    |                        |
|  +----------------------------------+                        |
+-------------------------------------------------------------+
```

---

## Opportunity

A formal versioning and migration strategy enables:

| Dimension | Before (No Versioning) | After (SemVer + Migration Tooling) |
|-----------|------------------------|-------------------------------------|
| Adapter stability | Breaking changes discovered at compile time | SemVer contract: patch = safe, minor = additive, major = breaking |
| Corpus evolution | Manual field-by-field comparison of sample files | Automated migration scripts between corpus versions |
| Result comparability | No way to know if two results used same metric formulas | Version manifest pinned to every evaluation run |
| Leaderboard integrity | Results from different corpus/harness versions mixed | Comparability rules enforce apples-to-apples ranking |
| Breaking change detection | Discovered after merge by downstream failures | CI check blocks PRs that introduce unintended breaks |
| Deprecation communication | No notice before removal | 6-month deprecation window with compile-time warnings |
| Reproducibility | Cannot recreate historical evaluation environment | Version-pinned manifests enable exact reproduction |

---

## Summary

| Capability | Description |
|------------|-------------|
| Independent SemVer for four artifacts | Shared kernel, corpus, adapter API, and scorecard each carry their own version |
| Automated breaking change detection | CI compares TypeScript declarations against baseline to flag breaking changes |
| Corpus migration tooling | CLI command `aqb corpus migrate --from v0.1 --to v0.2` transforms samples |
| Evaluation run manifest | Every run records exact versions of harness, corpus, adapter API, and scorecard schema |
| Result comparability rules | Results are only comparable when corpus version AND scorecard schema version match |
| Deprecation policy | 6-month notice, compile-time deprecation warnings, removal only in major versions |
| Backward compatibility window | Minimum 1 prior major version supported for adapter API and scorecard schema |
| Version pinning in results | `AQBResult` and `Scorecard` carry `harness_version` and `corpus_version` fields |

### Versioning Policy by Artifact

| Artifact | Version Scheme | Current Version | Stability Guarantee | Breaking Changes Allowed In |
|----------|---------------|-----------------|---------------------|-----------------------------|
| Shared kernel (`types.ts`) | SemVer `MAJOR.MINOR.PATCH` | 0.1.0 (pre-release) | None until 1.0.0 | Minor (pre-1.0), Major (post-1.0) |
| Corpus schema | SemVer directory `vMAJOR.MINOR` | v0.1 | Additive changes only within minor | Major version only |
| Adapter API (`AQBToolAdapter`) | Integer major version | v1 (at 1.0.0 release) | Stable within major version | New major version only |
| Scorecard schema | Integer major version | v1 (at 1.0.0 release) | Backward-compatible reads within major | New major version only |
| Harness package (`@aqb/harness`) | SemVer `MAJOR.MINOR.PATCH` | 0.1.0 (pre-release) | npm SemVer contract | Major version only (post-1.0) |

### Corpus Version Roadmap

```
v0.1 (current)              v0.2 (planned)              v1.0 (target)
+---------------------+     +---------------------+     +---------------------+
| 1,680+ samples      |     | 2,500+ samples      |     | 3,500+ samples      |
| 14 domains          | --> | 14 domains          | --> | 14+ domains         |
| Basic metadata      |     | + confidence scores  |     | + provenance chain  |
| 2-reviewer minimum  |     | + difficulty calibr. |     | + cross-ref links   |
| JSON format         |     | + Zod validation    |     | + schema version    |
+---------------------+     +---------------------+     +---------------------+
        |                           |                           |
        v                           v                           v
  Migration: N/A             migrate_v01_v02.ts          migrate_v02_v10.ts
                             (additive fields,           (schema formalization,
                              default values)             breaking changes OK)
```

### Version Compatibility Matrix

| Harness Version | Corpus v0.1 | Corpus v0.2 | Corpus v1.0 | Adapter API v1 | Adapter API v2 |
|-----------------|-------------|-------------|-------------|----------------|----------------|
| 0.x (pre-release) | Yes | Yes | No | Yes | No |
| 1.x | Yes (read-only) | Yes | Yes | Yes | Yes |
| 2.x | No | Yes (read-only) | Yes | No | Yes |

---

## Options Considered

### Option 1: [Selected] -- Semantic Versioning with Automated Breaking Change Detection

**Description:** Apply SemVer independently to each versioned artifact (shared kernel, corpus, adapter API, scorecard). Use `api-extractor` or `ts-morph`-based CI checks to detect breaking changes in TypeScript declarations. Provide migration scripts for corpus version upgrades. Pin exact versions in every evaluation run manifest.

**Pros:**
- SemVer is universally understood by the TypeScript/npm ecosystem
- Independent versioning allows corpus to evolve without forcing harness major bumps
- Automated detection catches accidental breaks before merge
- Migration scripts provide deterministic upgrade paths for corpus contributors
- Version-pinned manifests enable exact reproduction of any historical evaluation
- Adapter authors can depend on stability guarantees within a major version
- Leaderboard comparability rules prevent apples-to-oranges ranking

**Cons:**
- Maintaining independent version numbers for four artifacts adds coordination overhead
- Migration scripts must be written and tested for every corpus version transition
- CI breaking-change detection requires initial setup and baseline management
- SemVer pre-1.0 semantics allow breaking changes in minor versions, which may confuse early adopters
- Version compatibility matrix grows combinatorially as versions accumulate

### Option 2: [Rejected] -- Calendar-Based Versioning (CalVer)

**Description:** Use date-based version identifiers (e.g., `2026.03`, `2026.09`) for all artifacts. Each release is identified by its date, with no semantic meaning attached to the version number.

**Pros:**
- Simple to generate -- no debates about major vs. minor classification
- Clear temporal ordering of releases
- Used successfully by projects like Ubuntu and pip

**Cons:**
- No compatibility signal -- consumers cannot determine if upgrading from `2026.03` to `2026.09` will break their adapter without reading the full changelog
- Does not communicate the severity of changes
- Makes it impossible to express "this is a patch fix" vs. "this is a breaking redesign"
- Adapter authors have no version range to depend on (no equivalent of `^1.0.0`)
- Leaderboard comparability rules would need a separate mechanism since version numbers carry no compatibility semantics

**Rejection rationale:** AQB's primary consumers are adapter authors and leaderboard operators who need to reason about compatibility programmatically. CalVer forces every consumer to manually inspect changelogs, which does not scale.

### Option 3: [Rejected] -- No Formal Versioning (Pre-1.0 Forever)

**Description:** Treat the entire project as perpetually pre-release. Make no compatibility guarantees. Adapters and corpus consumers accept that anything can change at any time.

**Pros:**
- Maximum flexibility for the development team
- No versioning overhead or migration script maintenance
- Faster iteration without classification debates

**Cons:**
- No adapter author will invest in building against an unstable target
- Leaderboard results are never comparable across time periods
- Corpus contributors cannot know which fields are stable
- Reproducibility of historical evaluations is impossible
- Undermines the benchmark's credibility -- a benchmark must be stable enough to produce trustworthy measurements

**Rejection rationale:** A benchmark that cannot guarantee measurement stability is not a benchmark. The entire value proposition of AQB depends on producing comparable, reproducible evaluations over time.

---

## Consequences

### Positive

- Adapter authors receive a clear stability contract: within a major adapter API version, their code will not break from harness upgrades
- Corpus contributors know exactly which fields are required, optional, and deprecated at each version
- The leaderboard can enforce comparability rules, only ranking results that share the same corpus version and scorecard schema version
- Historical evaluation runs can be reproduced exactly by using the version-pinned manifest
- Breaking changes are caught in CI before merge, preventing accidental downstream breakage
- The 6-month deprecation policy gives consumers time to migrate without surprise removals
- Migration scripts provide a deterministic path from one corpus version to the next, reducing contributor friction
- The version compatibility matrix serves as a quick reference for which combinations are supported

### Negative

- Four independent version numbers create coordination complexity -- a harness release must document which corpus, adapter API, and scorecard versions it supports
- Migration scripts are additional code that must be written, tested, and maintained for every corpus version transition
- The breaking-change detection CI check requires initial setup (baseline declaration files, `api-extractor` or equivalent configuration)
- Pre-1.0 SemVer allows breaking changes in minor versions, which may cause confusion despite being semantically correct
- The deprecation policy constrains development velocity -- removing a problematic field requires waiting 6 months after deprecation notice
- Backward compatibility for 1 prior major version means maintaining compatibility shims and conditional logic in the harness

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Version coordination errors (e.g., releasing harness that claims corpus v0.2 support but has bugs with v0.2 samples) | Medium | High | Integration test suite runs against all supported corpus versions in CI |
| Migration scripts introduce data corruption | Low | Critical | Migration scripts produce output in a new directory; originals are never modified in-place; diff-based review before commit |
| Breaking change detector produces false positives, blocking valid PRs | Medium | Medium | Allowlist mechanism for intentional breaking changes with ADR reference required |
| Adapter authors ignore major version bumps and continue using deprecated API | High | Medium | Compile-time deprecation warnings; hard removal only after 6-month window plus 1 minor release with error message |
| Version compatibility matrix becomes too complex to maintain | Low | Medium | Automated compatibility matrix generation from CI test results; limit supported version combinations |
| Pre-1.0 instability discourages early adapter adoption | Medium | Medium | Publish stability tiers: `AQBToolAdapter.analyze()` is stable even pre-1.0; document which pre-1.0 types are considered frozen |

---

## Detailed Design

### 1. Shared Kernel Versioning (`types.ts`)

The shared kernel version is the `version` field in `harness/package.json`. All types in `types.ts` are governed by this version.

**Change classification:**

| Change Type | SemVer Bump | Example |
|-------------|-------------|---------|
| Add optional field to interface | MINOR | Add `tags?: string[]` to `CorpusSample` |
| Add new type export | MINOR | Export new `ConfidenceInterval` interface |
| Add new literal to union type | MINOR | Add `'ml-inference'` to `Domain` |
| Remove field from interface | MAJOR | Remove `fix_available` from `GroundTruthIssue` |
| Change field type | MAJOR | Change `confidence: number` to `confidence: Confidence` |
| Rename interface | MAJOR | Rename `Finding` to `ToolFinding` |
| Remove literal from union type | MAJOR | Remove `'enterprise-integration'` from `Domain` |
| Fix typo in description/JSDoc | PATCH | Update JSDoc comment |
| Add Zod validation (no type change) | PATCH | Add runtime validation matching existing types |

### 2. Corpus Versioning

Corpus versions use directory-based SemVer: `corpus/v0.1/`, `corpus/v0.2/`, `corpus/v1.0/`.

**Schema version field:** Starting with v0.2, every corpus sample JSON file includes a top-level `schema_version` field:

```json
{
  "schema_version": "0.2",
  "id": "security-sqli-001",
  "domain": "security",
  ...
}
```

**Migration rules:**

| Transition | Migration Type | Automated | Manual Review Required |
|------------|---------------|-----------|----------------------|
| v0.1 to v0.2 | Additive (new optional fields with defaults) | Yes | No |
| v0.2 to v1.0 | Breaking (field renames, required fields, schema formalization) | Yes (script) | Yes (spot-check 10% of samples) |
| v1.x to v1.y | Additive only | Yes | No |
| v1.x to v2.0 | Breaking | Yes (script) | Yes |

**Migration script interface:**

```bash
# Migrate all samples in a corpus directory
npx aqb corpus migrate --from v0.1 --to v0.2 --input corpus/v0.1/ --output corpus/v0.2/

# Dry run (report changes without writing)
npx aqb corpus migrate --from v0.1 --to v0.2 --input corpus/v0.1/ --dry-run

# Validate migrated samples against target schema
npx aqb corpus validate --version v0.2 --input corpus/v0.2/
```

Migration scripts live in `scripts/migrations/` with the naming convention `migrate_vX_vY.ts`.

### 3. Adapter API Versioning

The `AQBToolAdapter` interface is the primary contract with external adapter authors. It receives an integer major version that increments only when the interface signature changes in a backward-incompatible way.

**Stability tiers (pre-1.0):**

| Method/Property | Stability | Rationale |
|----------------|-----------|-----------|
| `name: string` | Frozen | Identity field, will not change |
| `version: string` | Frozen | Identity field, will not change |
| `analyze(sample: CorpusSample): Promise<Finding[]>` | Frozen | Core contract, will not change signature |
| `setup?(): Promise<void>` | Frozen | Lifecycle hook, will not change signature |
| `teardown?(): Promise<void>` | Frozen | Lifecycle hook, will not change signature |

**Future expansion mechanism:** New optional methods may be added in minor versions without breaking existing adapters:

```typescript
export interface AQBToolAdapter {
  // ... existing frozen methods ...

  /** @since 1.1.0 - Optional batch analysis for performance */
  analyzeBatch?(samples: CorpusSample[]): Promise<Finding[][]>;

  /** @since 1.2.0 - Optional capability declaration */
  capabilities?(): AdapterCapabilities;
}
```

Adapters that do not implement optional methods will have the harness fall back to default behavior (e.g., sequential `analyze()` calls for `analyzeBatch`).

### 4. Scorecard Schema Versioning

The `Scorecard` interface carries an integer schema version. Stored scorecard JSON files include a `schema_version` field:

```json
{
  "schema_version": 1,
  "tool": "aqe",
  "version": "3.0.0",
  "corpus_version": "v0.2",
  ...
}
```

**Backward compatibility for reads:** The harness must be able to read scorecards from the current and 1 prior schema version. A scorecard reader function handles version detection and normalization:

```typescript
function readScorecard(raw: unknown): Scorecard {
  const version = detectSchemaVersion(raw);
  if (version < MINIMUM_SUPPORTED_SCHEMA_VERSION) {
    throw new ScorecardVersionError(version, MINIMUM_SUPPORTED_SCHEMA_VERSION);
  }
  return normalizeScorecard(raw, version);
}
```

### 5. Breaking Change Detection in CI

A CI pipeline step runs on every pull request that modifies files in `harness/src/`:

```
PR opened/updated
    |
    v
[Extract .d.ts from base branch] --> baseline.d.ts
    |
    v
[Extract .d.ts from PR branch]   --> current.d.ts
    |
    v
[Compare declarations]
    |
    +--> No changes: PASS
    +--> Additive only: PASS (log as MINOR change)
    +--> Breaking change detected:
         |
         +--> PR title contains "BREAKING:" --> PASS (with warning)
         +--> No breaking change acknowledgment --> FAIL
              (comment on PR with specific breaks found)
```

**Implementation options:**

| Tool | Approach | Maturity |
|------|----------|----------|
| `@microsoft/api-extractor` | Official TypeScript API surface extraction | Production-ready |
| `ts-morph` + custom diff | AST-based comparison of declarations | Flexible but custom |
| `publint` + `arethetypeswrong` | npm package publishing checks | Focused on package compat |

The recommended approach is `@microsoft/api-extractor` for generating `.api.md` report files, with a custom diff script that classifies changes as additive or breaking.

### 6. Evaluation Run Manifest (Version Pinning)

Every evaluation run produces a manifest that records the exact versions used:

```json
{
  "manifest_version": 1,
  "run_id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2026-03-09T14:30:00Z",
  "versions": {
    "harness": "1.2.0",
    "corpus": "v0.2",
    "adapter_api": 1,
    "scorecard_schema": 1,
    "node": "20.11.0",
    "typescript": "5.4.0"
  },
  "adapter": {
    "name": "aqe",
    "version": "3.0.0"
  },
  "corpus_hash": "sha256:abcdef1234567890...",
  "configuration": {
    "domains": ["security", "defects"],
    "timeout_ms": 300000,
    "parallel": true
  }
}
```

The `corpus_hash` field is a SHA-256 hash of the sorted concatenation of all sample files used, enabling detection of corpus tampering or modification.

### 7. Result Comparability Rules

Two evaluation results are **directly comparable** if and only if all of the following conditions hold:

| Condition | Rationale |
|-----------|-----------|
| Same `corpus_version` | Different samples produce different difficulty distributions |
| Same `scorecard_schema` version | Different metric formulas produce incomparable numbers |
| Same `domains` evaluated | Partial evaluations are not comparable to full evaluations |
| Same corpus hash (if available) | Detects mid-version corpus corrections |

Results that differ only in `harness` patch or minor version are comparable, because metric formulas are stable within a scorecard schema version.

**Leaderboard enforcement:** The leaderboard groups results by `(corpus_version, scorecard_schema)` pair. Cross-group comparisons are displayed with a warning and are excluded from official rankings.

### 8. Deprecation Policy

| Phase | Duration | Action |
|-------|----------|--------|
| Deprecation notice | Day 0 | Add `@deprecated` JSDoc tag with migration instructions; add to CHANGELOG |
| Compile-time warning | Day 0 | TypeScript `@deprecated` tag triggers IDE warnings |
| Runtime warning | Day 0 (optional) | `console.warn` on first use of deprecated API in evaluation run |
| Removal eligible | 6 months after notice | May be removed in the next MAJOR version release |
| Actual removal | Next MAJOR release after eligibility | Field/method removed; migration guide published |

**Deprecation in corpus schema:**

Deprecated corpus fields are marked in the Zod schema with `.describe('DEPRECATED since v0.2: use X instead')` and are accepted but ignored during validation. They are removed in the next major corpus version.

**Deprecation in adapter API:**

Deprecated adapter methods continue to function but log a warning. The harness provides a compatibility shim that translates deprecated method calls to their replacements.

### 9. Backward Compatibility Window

| Artifact | Backward Compatibility | Meaning |
|----------|----------------------|---------|
| Adapter API | Current + 1 prior major version | Harness 2.x supports adapters written for API v1 and API v2 |
| Scorecard schema | Current + 1 prior major version | Leaderboard reads schema v1 and v2 scorecards |
| Corpus schema | Current + 1 prior major version for reading | Harness 2.x loads v1.x and v2.x corpus samples |
| Harness package | Standard npm SemVer | `^1.0.0` guarantees no breaks within 1.x |

When a major version drops support for a prior version, the release notes include a migration guide and the `aqb corpus migrate` command supports the transition.

---

## Governance

| Review Board | Date | Outcome | Review Cadence | Next Review |
|--------------|------|---------|----------------|-------------|
| AQB Architecture Team | 2026-03-09 | Proposed | 6 months | 2026-09-09 |

**Version release authority:**

| Decision | Authority | Process |
|----------|-----------|---------|
| PATCH release | Any maintainer | Merge PR, CI publishes |
| MINOR release | 2 maintainer approvals | PR with CHANGELOG update |
| MAJOR release | Architecture Team consensus | ADR amendment + migration guide + 6-month deprecation window honored |
| Corpus version bump | Architecture Team + 2 corpus reviewers | New corpus directory created, migration script tested, validation passing |

---

## Status History

| Status | Approver | Date |
|--------|----------|------|
| Proposed | Architecture Team | 2026-03-09 |

---

## Dependencies

| Relationship | ADR ID | Title | Notes |
|--------------|--------|-------|-------|
| Depends on | ADR-001 | Bounded Context Map | Shared kernel is the primary versioned artifact; context boundaries define version scope |
| Depends on | ADR-002 | Corpus Aggregate Design | Corpus aggregate root (`CorpusSample`) is the subject of corpus versioning |
| Depends on | ADR-006 | Metrics and Scoring | Scorecard schema versioning ensures metric formula changes are tracked |
| Depends on | ADR-011 | Leaderboard and Results | Result comparability rules govern leaderboard ranking across versions |
| Related | ADR-004 | Adapter Layer Anti-Corruption Pattern | Adapter API versioning builds on the ACL pattern to provide stability guarantees |
| Related | ADR-009 | Corpus Data Sourcing Strategy | New sourcing methods may be added as MINOR changes to the corpus schema |
| Related | ADR-012 | Cross-Cutting Concerns | Versioning is a cross-cutting concern that spans all bounded contexts |
| Related | ADR-013 | Testing Strategy | CI breaking-change detection extends the testing strategy |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Semantic Versioning 2.0.0 | Specification | https://semver.org/ |
| REF-002 | AQB Shared Kernel Types | Source Code | `harness/src/types.ts` |
| REF-003 | Microsoft API Extractor | Tool Documentation | https://api-extractor.com/ |
| REF-004 | AQB Proposal | Design Document | `docs/proposal.md` |
| REF-005 | npm SemVer Calculator | Tool | https://semver.npmjs.com/ |
| REF-006 | CalVer Specification | Specification | https://calver.org/ |
| REF-007 | Corpus v0.1 Directory | Data | `corpus/v0.1/` |
| REF-008 | Adapter Interface | Source Code | `harness/src/adapters/adapter.interface.ts` |
