# ADR-009: Corpus Data Sourcing Strategy

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-009 |
| **Initiative** | Corpus Sourcing |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** building a corpus of 1,680+ labeled samples across 14 QE domains, 5 programming languages, and 5 difficulty levels, where each sample must be accurately labeled, independently verified, and resistant to data contamination from LLM training sets,

**facing** the challenge of sourcing high-quality, diverse samples that cover the full spectrum of real-world defects without relying on a single sourcing method that could introduce systematic bias, while ensuring at least 20% adversarial negatives per domain, preventing data contamination from LLM training data, and maintaining a 70/30 public/held-out split,

**we decided for** a five-method sourcing strategy -- (1) real CVEs from NVD and GitHub Security Advisories, (2) historical bug-fix commits from OSS repositories, (3) mutation seeding with known defect injection, (4) synthetic generation via LLM with mandatory human verification, (5) adversarial negatives of provably clean code that looks suspicious -- with per-domain priority assignments, a human verification protocol requiring 2+ independent reviewers with inter-rater reliability (Cohen's kappa > 0.7), language distribution targets (TS 35%, Python 25%, Java 15%, Go 15%, Other 10%), independent difficulty rating, and data contamination prevention through post-training-cutoff code and synthetic obfuscation,

**and neglected** (a) relying solely on existing benchmark datasets (Juliet, Defects4J, BugsInPy) because they are already in LLM training data and cover only 2-3 of our 14 domains; (b) purely synthetic corpus generation because synthetic samples may not represent real-world defect patterns and are harder to validate; (c) crowd-sourced labeling because quality control at scale is difficult and corpus integrity is paramount,

**to achieve** a diverse, high-quality corpus that covers all 14 domains with realistic defect patterns, resistance to data contamination through multi-method sourcing and post-cutoff selection, guaranteed minimum adversarial negative coverage, reproducible difficulty ratings through independent assessment, and a held-out set that can reliably rank tools without gaming,

**accepting that** sourcing 1,680+ samples across 14 domains is a multi-month effort, human verification creates a bottleneck (2+ reviewers per sample), post-cutoff code selection limits the available pool of real CVEs, and synthetic samples require additional validation effort compared to naturally occurring defects.

---

## Problem Statement

The corpus is the foundation of the benchmark. Its quality, diversity, and integrity determine whether AQB evaluations are meaningful or misleading.

### Current Corpus State

| Metric | Target | Current | Gap |
|--------|--------|---------|-----|
| Total samples | 1,680+ | 0 | 1,680+ |
| Domains covered | 14 | 4 (manifest only, no samples) | 10 domains not started |
| Languages | 5 | 0 | All 5 languages needed |
| Adversarial negatives | 20% per domain | 0 | ~336 adversarial samples needed |
| Verified samples | 100% (2+ reviewers) | 0 | Verification pipeline needed |
| Held-out samples | 30% | 0 | ~504 held-out samples needed |

### Sourcing Challenges

| Challenge | Impact | Without Strategy |
|-----------|--------|-----------------|
| Data contamination | LLMs trained on existing benchmarks will "know" the answers | Inflated recall for LLM-based tools |
| Domain coverage | Some domains (chaos-resilience, enterprise-integration) have no public datasets | Domains remain empty |
| Language distribution | Most security datasets are Java-focused | Unbalanced language coverage |
| Difficulty calibration | Self-assessed difficulty is unreliable | Difficulty breakdowns are meaningless |
| Adversarial negatives | Clean code samples rarely included in defect datasets | Fabrication rate cannot be measured |
| Held-out integrity | If tools train on held-out data, rankings are invalid | Leaderboard is unreliable |

### Existing Dataset Coverage

| Domain | Existing Dataset | Coverage | Contamination Risk |
|--------|-----------------|----------|-------------------|
| Security | Juliet Test Suite, SARD, SastBench | Good (200+ samples available) | High (widely used in training) |
| Defects | Defects4J, BugsInPy | Good (150+ bugs) | High (published datasets) |
| Test Generation | TestGenEval, EvoSuite benchmarks | Medium (100+ functions) | Medium |
| Coverage Analysis | LCOV reports from OSS projects | Low (must be constructed) | Low |
| Quality | SonarQube rule databases | Medium | Medium |
| Requirements | PURE dataset, requirements specs | Low (mostly synthetic) | Low |
| Code Intelligence | Annotated repos | Low (must be constructed) | Low |
| Contracts | API changelogs (OpenAPI/GraphQL) | Low (must be constructed) | Low |
| Accessibility | axe-core test fixtures, WCAG examples | Medium | Medium |
| Performance | Profiled application traces | Low (must be constructed) | Low |
| Chaos Resilience | Chaos engineering datasets | Very Low (niche domain) | Low |
| Enterprise Integration | WSDL/SOAP/Kafka configurations | Very Low (niche domain) | Low |
| Flaky Tests | iDFlakies, DeFlaker datasets | Medium | Medium |
| Visual Regression | Screenshot pair datasets | Low (must be constructed) | Low |

---

## Opportunity

A structured sourcing strategy ensures corpus quality, diversity, and contamination resistance.

| Dimension | Before | After |
|-----------|--------|-------|
| Sample quality | Ad-hoc collection | Verified by 2+ independent reviewers with kappa > 0.7 |
| Contamination resistance | Unknown | Multi-method sourcing with post-cutoff and synthetic obfuscation |
| Domain coverage | 4 domains partially covered | All 14 domains with per-domain sourcing plans |
| Adversarial negatives | 0% | >= 20% per domain (336+ samples) |
| Difficulty calibration | Self-assessed | Independent assessment by 2+ reviewers |
| Language distribution | Unknown | Tracked against targets (TS 35%, Py 25%, Java 15%, Go 15%, Other 10%) |
| Held-out integrity | Directory separation only | Separate sourcing pipeline with access control |

### Five Sourcing Methods

```
+-------------------+     +-------------------+     +-------------------+
| Method 1:         |     | Method 2:         |     | Method 3:         |
| Real CVEs         |     | Historical Bugfix |     | Mutation Seeding  |
|                   |     |                   |     |                   |
| NVD, GHSA         |     | Git bisect, OSS   |     | Inject known      |
| Post-cutoff only  |     | commit analysis   |     | defects into      |
| Security primary  |     | Defects primary   |     | clean code        |
+-------------------+     +-------------------+     +-------------------+
         |                         |                         |
         v                         v                         v
+---------------------------------------------------------------+
|                    Sourcing Pipeline                           |
|                                                               |
|  1. Candidate selection (per-method criteria)                 |
|  2. Extraction and formatting (CorpusSample JSON)             |
|  3. Ground truth labeling (issue type, severity, location)    |
|  4. Independent verification (2+ reviewers, kappa > 0.7)     |
|  5. Difficulty rating (independent assessment)                |
|  6. Adversarial negative check (>= 20% per domain)           |
|  7. Language distribution check (against targets)             |
|  8. Assignment to public or held-out set (70/30 random)       |
+---------------------------------------------------------------+
         |                         |
         v                         v
+-------------------+     +-------------------+
| Method 4:         |     | Method 5:         |
| Synthetic (LLM)   |     | Adversarial       |
|                   |     | Negatives          |
| LLM generates     |     |                   |
| + human verifies  |     | Clean code that   |
| Requirements,     |     | looks suspicious  |
| contracts primary |     | All domains       |
+-------------------+     +-------------------+
```

### Per-Domain Sourcing Priority

| # | Domain | Primary Method | Secondary Method | Tertiary Method | Target |
|---|--------|---------------|-----------------|-----------------|--------|
| 1 | Security | Real CVEs (NVD, GHSA) | Mutation seeding | Synthetic | 200 |
| 2 | Defects | Historical bugfix | Mutation seeding | Synthetic | 150 |
| 3 | Test Generation | Mutation seeding | Historical bugfix | Synthetic | 120 |
| 4 | Coverage Analysis | Synthetic | Mutation seeding | Historical bugfix | 100 |
| 5 | Quality | Historical bugfix | Synthetic | Mutation seeding | 120 |
| 6 | Requirements | Synthetic | Real specifications | N/A | 200 |
| 7 | Code Intelligence | Historical bugfix | Mutation seeding | Synthetic | 80 |
| 8 | Contracts | Synthetic | Real API changelogs | N/A | 80 |
| 9 | Accessibility | Real WCAG violations | Synthetic | Mutation seeding | 100 |
| 10 | Performance | Synthetic (profiled) | Real performance bugs | N/A | 60 |
| 11 | Chaos Resilience | Synthetic | Real incident post-mortems | N/A | 60 |
| 12 | Enterprise Integration | Synthetic | Real protocol issues | N/A | 80 |
| 13 | Flaky Tests | Historical (iDFlakies) | Real flaky test repos | Synthetic | 80 |
| 14 | Visual Regression | Synthetic (screenshot pairs) | Real UI regressions | N/A | 60 |
| -- | Fabrication Stress Test | Adversarial negatives | Clean code from verified repos | N/A | 100 |
| -- | Composite Scenarios | Synthetic (multi-domain) | Real multi-issue files | N/A | 30 |
| **Total** | | | | | **1,680+** |

---

## Summary

| Capability | Description |
|------------|-------------|
| Five sourcing methods | Real CVEs, historical bugfix, mutation seeding, synthetic, adversarial negatives |
| Per-domain priorities | Each domain has primary, secondary, tertiary sourcing methods |
| Human verification | 2+ independent reviewers per sample with inter-rater kappa > 0.7 |
| Contamination prevention | Post-training-cutoff code, synthetic obfuscation, novel code patterns |
| Language distribution | TS 35%, Python 25%, Java 15%, Go 15%, Other 10% (tracked per domain) |
| Difficulty calibration | Independent assessment by reviewers, not self-assessed |
| Adversarial minimum | >= 20% adversarial negatives per domain |
| Held-out isolation | 30% random assignment to held-out set during sourcing |

### Method 1: Real CVEs

| Parameter | Value |
|-----------|-------|
| Sources | NVD (National Vulnerability Database), GitHub Security Advisories (GHSA) |
| Selection criteria | Post-LLM-training-cutoff (after 2024-01), PoC or reproducer available, affects supported languages |
| Extraction | Clone vulnerable version, extract affected file(s), create ground truth from CVE description |
| Ground truth | CWE ID, severity from CVSS, location from patch diff (before/after comparison) |
| Applicable domains | Security (primary), defects (secondary) |
| Target count | ~100 samples (50% of security domain from this method) |
| Contamination risk | Low (post-cutoff reduces training data overlap) |

### Method 2: Historical Bug-fix Commits

| Parameter | Value |
|-----------|-------|
| Sources | Top-1000 GitHub repos by language, filtered for bug-fix commits |
| Selection criteria | Commit message contains "fix", "bug", "resolve"; diff is self-contained; post-2024 preferred |
| Extraction | Extract pre-fix version as sample, create ground truth from diff |
| Ground truth | Defect type inferred from fix pattern, severity estimated from impact analysis |
| Applicable domains | Defects (primary), quality (primary), code-intelligence (primary) |
| Target count | ~200 samples across applicable domains |
| Contamination risk | Medium (public repos may be in training data; prefer recent commits) |

### Method 3: Mutation Seeding

| Parameter | Value |
|-----------|-------|
| Technique | Inject known defects into verified-clean code using mutation operators |
| Mutation operators | Statement deletion, condition negation, boundary shift, null injection, type confusion, race condition injection |
| Base code | Verified-clean code from Method 5 pipeline (before adversarial labeling) |
| Ground truth | Exact: mutation location and type are known by construction |
| Applicable domains | All domains (mutations tailored per domain) |
| Target count | ~400 samples across all domains |
| Contamination risk | Very low (novel code + novel mutations not in training data) |

### Method 4: Synthetic (LLM-generated)

| Parameter | Value |
|-----------|-------|
| Technique | Prompt LLM to generate code samples with specific defect patterns |
| Verification | Mandatory human verification by 2+ reviewers (synthetic samples are untrusted by default) |
| Obfuscation | Variable renaming, code restructuring, style variation to prevent memorization |
| Ground truth | LLM proposes ground truth; human reviewers verify and correct |
| Applicable domains | Requirements (primary), contracts (primary), coverage-analysis, performance, chaos, enterprise |
| Target count | ~500 samples across applicable domains |
| Contamination risk | Low (synthetic code is novel by construction; obfuscation further reduces) |

### Method 5: Adversarial Negatives

| Parameter | Value |
|-----------|-------|
| Technique | Select clean code that appears suspicious but has no actual defects |
| Selection criteria | Code uses patterns that trigger false positives (eval() used safely, dynamic SQL that is parameterized, complex but correct concurrency) |
| Ground truth | Empty issues array; any finding is a false positive (fabrication) |
| Verification | 2+ reviewers confirm code is genuinely clean; formal verification where possible |
| Applicable domains | All domains (>= 20% per domain) |
| Target count | ~336 samples (20% of 1,680) minimum |
| Purpose | Measure fabrication rate; penalize tools that hallucinate findings |

### Human Verification Protocol

| Step | Description | Criterion |
|------|-------------|-----------|
| 1. Assign | Sample assigned to 2+ independent reviewers | Reviewers have domain expertise |
| 2. Review independently | Each reviewer verifies: ground truth accuracy, severity, location, category | No inter-reviewer communication until step 4 |
| 3. Rate difficulty | Each reviewer rates difficulty 1-5 independently | Based on: code complexity, defect subtlety, domain expertise required |
| 4. Reconcile | Reviewers compare assessments; resolve disagreements | Must reach consensus on all ground truth fields |
| 5. Compute kappa | Inter-rater reliability computed across domain batch | Cohen's kappa > 0.7 required; below 0.7 triggers re-review |
| 6. Approve | Sample approved for corpus inclusion | Both reviewers sign off; metadata updated |

### Data Contamination Prevention

| Strategy | Implementation | Effectiveness |
|----------|---------------|---------------|
| Post-cutoff selection | Real CVEs and bugfixes from after LLM training cutoff (2024-01+) | High for real-world samples |
| Synthetic obfuscation | Variable renaming, code restructuring, style variation | Medium (LLM may still pattern-match) |
| Novel code patterns | Mutation seeding on novel base code | High (code does not exist in training data) |
| Held-out isolation | 30% never published; not in repo; not in any public dataset | High for leaderboard integrity |
| Canary detection | Include 10 intentionally distinctive "canary" samples; check if tools show memorization | Medium (detection mechanism for contamination) |

---

## Options Considered

### Option 1: [Selected] -- Five-Method Sourcing with Human Verification

**Description:** Diversified sourcing across five methods with per-domain priorities, mandatory human verification, contamination prevention, and adversarial negative minimums.

**Pros:**
- Diversity: no single sourcing bias
- Quality: 2+ reviewer verification ensures label accuracy
- Contamination resistance: multi-method approach with post-cutoff and synthetic options
- Coverage: all 14 domains have viable sourcing paths
- Adversarial: 20% minimum ensures fabrication testing
- Scalable: methods can be applied independently and in parallel

**Cons:**
- High effort: 1,680+ samples at 2+ reviewers each = significant human effort
- Coordination: five methods require different tooling and expertise
- Synthetic quality: LLM-generated samples may not capture real-world complexity
- Post-cutoff constraint limits real CVE pool

### Option 2: [Rejected] -- Reuse Existing Benchmarks Only

**Description:** Source corpus entirely from existing benchmark datasets (Juliet, Defects4J, BugsInPy, iDFlakies, TestGenEval).

**Pros:**
- Fast: datasets already exist and are labeled
- Proven: widely used in research
- Low effort: no new sample creation needed

**Cons:**
- Contamination: these datasets are in LLM training data; LLM-based tools will "know" the answers
- Limited domain coverage: only covers 3-4 of 14 domains
- No adversarial negatives: existing datasets focus on defective code
- Stale: difficulty levels not aligned with AQB scale
- No post-cutoff guarantee

**Rejection rationale:** Reusing contaminated datasets undermines the benchmark's core purpose of fairly evaluating tools. LLM-based tools would show artificially inflated performance.

### Option 3: [Rejected] -- Purely Synthetic Corpus

**Description:** Generate the entire corpus synthetically using LLMs, with human verification.

**Pros:**
- Fast generation at scale
- Complete contamination prevention (novel code)
- Full control over difficulty, domain, and language distribution
- Can generate adversarial negatives easily

**Cons:**
- Synthetic defects may not represent real-world patterns
- LLM-generated code has stylistic patterns that may bias evaluation
- Massive human verification effort (all 1,680+ samples need review)
- Lack of real-world grounding reduces benchmark credibility
- Synthetic requirements and contracts may be simplistic

**Rejection rationale:** A purely synthetic corpus lacks the real-world grounding that makes a benchmark credible. The best defect samples come from actual software defects, not simulated ones.

---

## Consequences

### Positive
- Multi-method sourcing provides diverse, realistic samples across all 14 domains
- Post-cutoff selection and synthetic obfuscation mitigate data contamination
- 20% adversarial negative minimum enables meaningful fabrication rate measurement
- Human verification protocol (2+ reviewers, kappa > 0.7) ensures label accuracy
- Independent difficulty rating prevents self-assessment bias
- Per-domain sourcing priorities ensure efficient use of each method
- 70/30 public/held-out split enables both open evaluation and anti-gaming

### Negative
- Sourcing 1,680+ samples is a multi-month effort requiring domain expertise
- Human verification creates a bottleneck (approximately 3,360+ individual reviews)
- Post-cutoff constraint limits the pool of real CVEs and bug-fixes
- Synthetic samples, while contamination-resistant, may not capture real-world complexity
- Maintaining inter-rater kappa > 0.7 requires reviewer calibration and training

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Insufficient reviewers for verification bottleneck | Medium | High | Recruit domain experts early; incentivize reviewing; stagger domain sourcing |
| Post-cutoff CVE pool too small for 200 security samples | Medium | Medium | Supplement with mutation seeding on post-cutoff code; extend cutoff to 2023-06 if needed |
| Synthetic samples flagged as unrealistic by community | Medium | Medium | Publish sourcing method per sample; allow community challenges; replace contested samples |
| Inter-rater kappa below 0.7 for subjective domains (quality, requirements) | High | Medium | Detailed rubric per domain; reviewer training; accept kappa > 0.6 for subjective domains |
| Held-out set leaked through contributor access | Low | Critical | Separate repository/branch; restricted access; access logging; canary samples |
| Data contamination despite prevention measures | Medium | High | Canary detection; periodic re-evaluation with new models; version corpus for freshness |

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
| Informs | ADR-002 | Corpus Aggregate Design | Sourcing methods are a domain concept in the corpus aggregate |
| Samples consumed by | ADR-003 | Evaluation Engine Runner Architecture | Runner evaluates sourced samples |
| Adversarial samples tested by | ADR-007 | Agentic Evaluation Protocol | Phase 4 uses adversarial negatives from fabrication stress test |
| Domain coverage | ADR-014 | Domain-Specific Evaluation | Per-domain category taxonomies guide sourcing |
| Validated by | ADR-013 | Testing Strategy | Corpus validation tests verify sourced samples |
| Anti-gaming | ADR-011 | Leaderboard and Results | Held-out set prevents leaderboard gaming |
| Cross-cutting | ADR-012 | Cross-Cutting Concerns | Fabrication stress test and composite scenarios sourced here |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Corpus manifest | Data | `corpus/v0.1/manifest.json` |
| REF-002 | SourcingMethod type | Source Code | `harness/src/types.ts` (lines 33-38) |
| REF-003 | SampleMetadata interface | Source Code | `harness/src/types.ts` (lines 85-91) |
| REF-004 | NVD (National Vulnerability Database) | Data Source | https://nvd.nist.gov/ |
| REF-005 | GitHub Security Advisories | Data Source | https://github.com/advisories |
| REF-006 | Juliet Test Suite | Dataset | https://samate.nist.gov/SARD/test-suites/111 |
| REF-007 | Defects4J | Dataset | https://github.com/rjust/defects4j |
| REF-008 | BugsInPy | Dataset | https://github.com/soarsmu/BugsInPy |
| REF-009 | iDFlakies | Dataset | https://github.com/UT-SE-Research/iDFlakies |
| REF-010 | Cohen's kappa | Statistical Method | https://en.wikipedia.org/wiki/Cohen%27s_kappa |
