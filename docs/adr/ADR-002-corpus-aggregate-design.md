# ADR-002: Corpus Aggregate Design

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-002 |
| **Initiative** | Corpus Domain Model |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** managing a labeled defect corpus of 1,680+ samples across 14 QE domains, 5 programming languages, and 5 difficulty levels, with strict quality requirements including 2+ reviewer verification and 20% adversarial negative minimums,

**facing** the challenge of ensuring corpus integrity (no mislabeled data), supporting versioned releases (v0.1, v0.2), isolating a 30% held-out set that must never be published, validating every sample against a strict schema, and enabling a pipeline for sourcing samples from five distinct methods (real CVEs, historical bugfixes, mutation seeding, synthetic generation, adversarial negatives),

**we decided for** a DDD aggregate design with `CorpusSample` as the aggregate root, value objects for `GroundTruth`, `Location`, `SampleMetadata`, and `FalsePositiveMarker`, a repository pattern backed by file-based JSON with an optional SQLite index, Zod validation schemas for all types, and explicit domain invariants enforced at the aggregate boundary,

**and neglected** (a) a flat-file directory structure with no validation layer because it would allow invalid or mislabeled samples to enter the corpus undetected; (b) a database-first approach using only SQLite because it would lose the human-readable JSON format that enables Git-based review workflows; (c) a document database (MongoDB) because it adds operational complexity without benefit for a file-distributable benchmark,

**to achieve** guaranteed corpus integrity through schema validation at every write, human-readable samples that support Git-based peer review, versioned corpus releases with clear upgrade paths, held-out set isolation enforced by the repository layer, and a domain model that makes sourcing methods, verification status, and adversarial negatives first-class concepts,

**accepting that** JSON files are slower to query than a database for large-scale analysis, the optional SQLite index adds a secondary consistency concern, and Zod schema validation adds build-time dependency and runtime overhead on corpus loading.

---

## Problem Statement

The AQB corpus is the foundation of the entire benchmark. Any defect in the corpus -- a mislabeled sample, an incorrect ground truth location, a missing adversarial negative, an improperly verified sample -- directly corrupts evaluation results for every tool tested against it.

### Current State

| Aspect | Status | Gap |
|--------|--------|-----|
| Sample schema | `CorpusSample` interface in `types.ts` | No runtime validation; TypeScript types are compile-time only |
| Corpus storage | `corpus/v0.1/manifest.json` with 0 samples | No repository layer; no CRUD operations |
| Validation | None implemented | No schema enforcement on sample files |
| Versioning | Version field in manifest | No versioning strategy or migration path |
| Held-out isolation | `corpus/held-out/` directory exists | No enforcement mechanism; anyone with repo access can read |
| Verification tracking | `metadata.verified_by` field defined | No enforcement of 2+ reviewer minimum |
| Adversarial negatives | `adversarial_negative` sourcing method defined | No enforcement of 20% minimum per domain |
| Domain coverage | 4 domains in manifest (security, defects, test-generation, fabrication-stress-test) | 10 domains not yet represented |

### Data Integrity Risks

| Risk | Severity | Current Mitigation |
|------|----------|-------------------|
| Mislabeled ground truth (wrong CWE, wrong location) | Critical | None |
| Sample without required 2 reviewers merged | High | None |
| Adversarial negative percentage drops below 20% | High | None |
| Held-out samples accidentally included in public corpus | Critical | Directory separation only |
| Duplicate sample IDs across domains | Medium | None |
| Invalid JSON structure in sample files | High | None |
| Ground truth location references non-existent file | High | None |
| Difficulty rating self-assessed instead of independent | Medium | None |

---

## Opportunity

A formal aggregate design transforms the corpus from a passive file collection into an actively validated domain model.

| Dimension | Before | After |
|-----------|--------|-------|
| Schema validation | Compile-time TypeScript only | Runtime Zod validation on every load and save |
| Invariant enforcement | Manual review | Automated: 2+ reviewers, 20% adversarial, unique IDs |
| Corpus operations | Direct file manipulation | Repository pattern with transactional semantics |
| Versioning | Implicit (directory name) | Explicit semantic versioning with migration support |
| Held-out isolation | Directory convention | Repository-level access control with separate store |
| Querying | Read all files, filter manually | SQLite index for fast domain/language/difficulty queries |
| Review workflow | Ad-hoc JSON review | Structured validation in CI before merge |

### Aggregate Structure

```
CorpusSample (Aggregate Root)
|
+-- id: string (format: "{domain}-{category}-{NNN}")
+-- domain: Domain (1 of 14)
+-- category: string
+-- language: Language
+-- difficulty: Difficulty (1-5)
|
+-- files: SampleFile[] (Value Object collection)
|   +-- path: string
|   +-- content: string
|
+-- ground_truth: GroundTruth (Value Object)
|   +-- issues: GroundTruthIssue[] (Value Object collection)
|   |   +-- type: string (CWE-ID or defect type)
|   |   +-- severity: Severity
|   |   +-- location: Location (Value Object)
|   |   |   +-- file: string
|   |   |   +-- line_start: number
|   |   |   +-- line_end: number
|   |   |   +-- column_start?: number
|   |   |   +-- column_end?: number
|   |   +-- description: string
|   |   +-- fix_available: boolean
|   |   +-- fix_file?: string
|   |
|   +-- false_positives: FalsePositiveMarker[] (Value Object collection)
|       +-- location: Location (Value Object)
|       +-- reason: string
|
+-- metadata: SampleMetadata (Value Object)
    +-- source: string
    +-- sourcing_method: SourcingMethod
    +-- human_verified: boolean
    +-- verification_date: string (ISO 8601)
    +-- verified_by: string[] (minimum 2)
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Aggregate root | `CorpusSample` enforces all invariants at the boundary |
| Value objects | `GroundTruth`, `Location`, `SampleMetadata`, `FalsePositiveMarker` are immutable and validated |
| Zod schemas | Runtime validation for every corpus type, matching `types.ts` interfaces |
| Repository pattern | `CorpusRepository` interface with file-based JSON and optional SQLite index |
| Corpus versioning | Semantic versioning (v0.1, v0.2) with manifest-driven releases |
| Held-out isolation | Separate repository instance for held-out set with restricted access |
| Domain invariants | 2+ reviewers, 20% adversarial negatives, unique IDs, valid ground truth references |
| Sourcing methods | Five methods as domain concept with per-domain priority configuration |

### Zod Schema Definitions

The following Zod schemas will be defined in `harness/src/corpus/schemas.ts`:

| Schema | Validates | Key Constraints |
|--------|-----------|-----------------|
| `LocationSchema` | `Location` value object | `line_start >= 1`, `line_end >= line_start`, optional columns |
| `GroundTruthIssueSchema` | `GroundTruthIssue` entity | `severity` must be valid enum, `location.file` must exist in sample files |
| `FalsePositiveMarkerSchema` | `FalsePositiveMarker` value object | `reason` non-empty, `location` valid |
| `GroundTruthSchema` | `GroundTruth` value object | At least one issue OR sourcing_method is `adversarial_negative` |
| `SampleMetadataSchema` | `SampleMetadata` value object | `verified_by.length >= 2` when `human_verified` is true |
| `SampleFileSchema` | `SampleFile` value object | `path` is relative, `content` non-empty |
| `CorpusSampleSchema` | `CorpusSample` aggregate root | `id` matches `{domain}-{category}-{NNN}` pattern, all cross-references valid |

### Repository Interface

```
CorpusRepository
|
+-- loadSample(id: string): CorpusSample
+-- saveSample(sample: CorpusSample): void
+-- listSamples(filter?: CorpusFilter): CorpusSample[]
+-- countByDomain(): Record<Domain, number>
+-- countAdversarialNegatives(domain: Domain): number
+-- validateCorpus(): ValidationResult[]
+-- getVersion(): string
|
+-- FileCorpusRepository (JSON files in corpus/v0.1/)
+-- IndexedCorpusRepository (JSON files + SQLite index)
+-- HeldOutRepository (restricted access, corpus/held-out/)
```

### Corpus File Layout

```
corpus/
  v0.1/
    manifest.json                    -- Version metadata, domain catalog
    security/
      sql-injection/
        security-sql-injection-001.json
        security-sql-injection-002.json
      xss/
        security-xss-001.json
    defects/
      null-deref/
        defects-null-deref-001.json
    ...
  held-out/
    manifest.json                    -- Held-out version metadata
    security/
      ...                            -- 30% of samples, never published
```

---

## Options Considered

### Option 1: [Selected] -- DDD Aggregate with File-based JSON + Optional SQLite Index

**Description:** Model `CorpusSample` as an aggregate root with value objects, Zod validation, repository pattern using JSON files as the primary store with an optional SQLite index for querying.

**Pros:**
- Human-readable JSON enables Git-based review workflow (diff, PR review)
- Zod schemas provide runtime validation that TypeScript interfaces cannot
- Repository pattern abstracts storage, enabling future migration
- SQLite index enables fast queries without changing primary storage
- Aggregate boundary enforces invariants (reviewer count, adversarial %, unique IDs)
- Git tracks corpus changes with full history
- Aligns with benchmark distribution model (clone repo, get corpus)

**Cons:**
- JSON files are slow for large-scale queries (mitigated by SQLite index)
- Dual storage (JSON + SQLite) requires consistency management
- File-per-sample creates many small files (1,680+ files)
- No built-in concurrency control for parallel sample writes

### Option 2: [Rejected] -- SQLite-Only Storage

**Description:** Store all corpus data in a SQLite database, eliminating JSON files.

**Pros:**
- Fast queries across all dimensions
- Atomic transactions for writes
- Single file for entire corpus

**Cons:**
- Binary format prevents Git-based diff and review
- Cannot browse individual samples without tooling
- Database migrations required for schema changes
- Does not align with benchmark distribution model (users expect readable files)
- Merge conflicts in binary database file are unresolvable

**Rejection rationale:** The corpus must be human-reviewable and Git-friendly. Binary database storage fundamentally conflicts with the peer review workflow essential for corpus quality.

### Option 3: [Rejected] -- Flat File Directory with No Validation Layer

**Description:** Store JSON files in a directory structure with validation only in CI scripts.

**Pros:**
- Simplest implementation
- No additional dependencies
- Easy to understand

**Cons:**
- No runtime validation -- invalid samples can be loaded without error
- No enforcement of domain invariants (reviewer count, adversarial %)
- No repository abstraction -- loading logic scattered across codebase
- No querying capability without loading all files
- Invalid samples discovered only during CI, not at write time

**Rejection rationale:** For a benchmark where data quality is the primary value proposition, relying on CI-only validation is insufficient. Invalid samples must be rejected at the domain layer, not discovered downstream.

---

## Consequences

### Positive
- Every corpus sample is validated against Zod schemas at load time, preventing mislabeled data from entering evaluation
- The 2+ reviewer invariant is enforced programmatically, not just by convention
- Per-domain adversarial negative percentages are tracked and enforced by the repository
- Corpus versioning is a first-class concept with manifest-driven releases
- Held-out samples are isolated through a separate repository instance with restricted access patterns
- The `CorpusSampleSchema` cross-validates ground truth file references against sample files
- Git-based workflow preserved: every sample is a readable JSON file that can be diffed and reviewed

### Negative
- 1,680+ JSON files create a large number of small files in the repository
- Optional SQLite index adds a secondary data store that must be kept in sync
- Zod schemas must be maintained in parallel with TypeScript interfaces in `types.ts`
- File I/O for loading the full corpus (all 1,680 samples) is slower than database access

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Zod schemas drift from TypeScript interfaces | Medium | High | Generate Zod schemas from TS types or vice versa; CI check for consistency |
| SQLite index becomes stale relative to JSON files | Low | Medium | Rebuild index on every corpus load; treat SQLite as cache, not source of truth |
| Large file count causes Git performance issues | Low | Low | Git handles millions of small files; use shallow clone for consumers who don't need history |
| Held-out samples leaked through repository pattern bypass | Low | Critical | Held-out repository uses separate directory; CI verifies no held-out references in public corpus |
| Sample ID collisions across domains | Low | High | Repository enforces uniqueness; ID format `{domain}-{category}-{NNN}` provides namespace |

### Domain Invariants (Enforced by Aggregate)

| Invariant | Enforcement Point | Failure Mode |
|-----------|-------------------|--------------|
| Sample ID matches `{domain}-{category}-{NNN}` pattern | `CorpusSampleSchema` | Zod validation error on save |
| `ground_truth.issues[].location.file` exists in `sample.files[].path` | `CorpusSampleSchema` refinement | Zod validation error on save |
| `metadata.verified_by.length >= 2` when `human_verified` is true | `SampleMetadataSchema` refinement | Zod validation error on save |
| Adversarial negatives >= 20% per domain | `CorpusRepository.validateCorpus()` | Corpus-level validation warning |
| No duplicate sample IDs within corpus | `CorpusRepository.saveSample()` | Repository throws `DuplicateIdError` |
| `difficulty` independently rated (metadata field) | `SampleMetadataSchema` | Tracked in metadata, warned if self-assessed |
| Ground truth is empty only for `adversarial_negative` samples | `CorpusSampleSchema` refinement | Zod validation error on save |

### Versioning Strategy

| Version | Trigger | Migration |
|---------|---------|-----------|
| v0.1 | Initial corpus release (security MVP) | N/A |
| v0.2 | Add 5+ domains, 500+ samples | Schema backward-compatible; add new domain categories to manifest |
| v1.0 | All 14 domains populated, 1,680+ samples | Potential breaking schema changes; migration script provided |
| v1.x | Incremental sample additions | Backward-compatible; new samples only |
| v2.0 | Major schema revision (new fields, restructured ground truth) | Breaking; requires re-evaluation of all tools |

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
| Parent | ADR-001 | Bounded Context Map | Corpus Management is a bounded context defined in ADR-001 |
| Consumed by | ADR-003 | Evaluation Engine Runner Architecture | Runner loads samples via repository |
| Consumed by | ADR-005 | Matching Engine Algorithm | Matcher uses CorpusSample ground truth |
| Informed by | ADR-009 | Corpus Data Sourcing Strategy | Sourcing methods define how samples enter the corpus |
| Related | ADR-013 | Testing Strategy | Corpus validation tests verify schema compliance |
| Related | ADR-014 | Domain-Specific Evaluation | Per-domain category taxonomies defined in corpus manifest |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Core Types | Source Code | `harness/src/types.ts` (lines 42-91) |
| REF-002 | Corpus Manifest | Data | `corpus/v0.1/manifest.json` |
| REF-003 | Zod Documentation | Library | https://zod.dev |
| REF-004 | DDD Aggregates Pattern | Pattern | Eric Evans, DDD Ch. 6 |
| REF-005 | Repository Pattern | Pattern | Eric Evans, DDD Ch. 6 |
| REF-006 | AQB Proposal - Corpus Design | Design Document | `docs/proposal.md` |
