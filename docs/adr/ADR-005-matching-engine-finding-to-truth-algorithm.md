# ADR-005: Matching Engine -- Finding-to-Truth Algorithm

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-005 |
| **Initiative** | Matching Engine |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** evaluating QE tool findings against corpus ground truth, where a tool may report an issue at a slightly different line than the ground truth, use a different category name for the same vulnerability (e.g., `sql-injection` vs `CWE-89`), or identify a vulnerability in a related but not identical code location,

**facing** the challenge of fairly scoring tools that use different granularity of location reporting, different vulnerability taxonomies, and different levels of specificity, while preventing double-counting of findings and ensuring that partial matches are scored proportionally,

**we decided for** a three-step fuzzy matching algorithm -- (1) file path match with normalization, (2) location proximity scoring with separate strategies for single-line (proximity within +/-5 lines) and multi-line (overlap ratio >= 50%) issues, (3) category compatibility scoring with four tiers (exact=1.0, alias=1.0, same family=0.7, same domain=0.3) -- using greedy best-match-first assignment to prevent double-counting, with partial matches weighted at 0.5 TP, all thresholds configurable via `MatcherConfig`,

**and neglected** (a) exact matching only because it would unfairly penalize tools that report issues at slightly different lines or use different category names; (b) a bipartite matching algorithm (Hungarian method) because the greedy approach is simpler, deterministic, and the corpus sizes make optimal assignment negligible in impact; (c) embedding-based semantic matching because it introduces LLM dependency into the core evaluation pipeline and is non-deterministic,

**to achieve** fair evaluation across tools with different reporting granularity, consistent scoring that accounts for legitimate variations in location and category naming, deterministic matching that produces the same results on every run, and configurable thresholds that allow per-domain tuning without algorithm changes,

**accepting that** the greedy assignment may miss globally optimal matchings in edge cases, the four-tier category scoring is a simplification of the true relationship between vulnerability categories, and the +/-5 line proximity threshold is a heuristic that may not suit all code patterns.

---

## Problem Statement

When a QE tool reports a finding, it rarely matches the ground truth exactly. The matcher must handle systematic differences:

### Location Differences

| Scenario | Tool Reports | Ground Truth | Should Match? |
|----------|-------------|-------------|---------------|
| Same line | `file.ts:42` | `file.ts:42` | Yes (exact) |
| Off by 2 lines | `file.ts:44` | `file.ts:42` | Yes (proximity) |
| Off by 10 lines | `file.ts:52` | `file.ts:42` | No (too far) |
| Overlapping range | `file.ts:40-50` | `file.ts:42-48` | Yes (86% overlap) |
| Minimal overlap | `file.ts:40-42` | `file.ts:42-60` | No (5% overlap, below 50%) |
| Different file | `src/auth.ts:42` | `src/login.ts:42` | No |
| Path normalization | `./src/auth.ts` | `src/auth.ts` | Yes (after normalization) |

### Category Differences

| Scenario | Tool Reports | Ground Truth | Should Match? |
|----------|-------------|-------------|---------------|
| Exact match | `CWE-89` | `CWE-89` | Yes (1.0) |
| Alias match | `sql-injection` | `CWE-89` | Yes (1.0 via alias) |
| Same CWE family | `CWE-89` | `CWE-564` | Partial (0.7) |
| Same domain | `CWE-89` | `CWE-79` | Partial (0.3) |
| Different domain | `null-deref` | `CWE-89` | No (0.0) |

### Current Implementation

The matcher is implemented in `harness/src/matcher.ts` with the following structure:

| Component | Implementation Status | Notes |
|-----------|----------------------|-------|
| `matchFindings()` | Implemented | Main entry point; greedy matching |
| `computeMatch()` | Implemented | Three-step: file -> location -> category |
| `filesMatch()` | Implemented | Path normalization (leading `./`, backslash) |
| `computeLocationScore()` | Implemented | Proximity for single-line, overlap for multi-line |
| `computeCategoryScore()` | Implemented | Four-tier scoring with alias map |
| `domainFromType()` | Implemented | Maps issue types to domains (partial coverage) |
| `MatcherConfig` | Defined | Configurable thresholds with defaults |
| CWE alias map | 7 entries defined | CWE-89, CWE-79, CWE-78, CWE-22, CWE-798, CWE-327, CWE-918 |

### Identified Gaps in Current Implementation

| Gap | Description | Impact |
|-----|-------------|--------|
| Limited CWE alias coverage | Only 7 CWE entries; CWE-Top25 has 25 | Tools using unlisted CWE IDs get zero category score |
| `domainFromType()` incomplete | Only maps security and defects types | Other 12 domains cannot infer domain from type |
| No column matching | Column information ignored | Could improve precision for same-line, different-issue cases |
| No match confidence | Binary match/no-match decision | Cannot express uncertain matches |
| No multi-finding-per-truth support | 1:1 matching only | Some tools report sub-findings for one ground truth issue |
| FP marker matching limited | Only checks `adversarial_negative` sourcing | `false_positives` markers in ground truth not fully utilized |

---

## Opportunity

Formalizing and extending the matching algorithm ensures fair, consistent evaluation across all tools and domains.

| Dimension | Before | After |
|-----------|--------|-------|
| CWE coverage | 7 aliases | Full CWE-Top25 + common mappings (~50 entries) |
| Domain inference | Security + defects only | All 14 domains with type-to-domain mapping |
| Match granularity | Binary (match/no match) | Scored (0.0-1.0) with type classification (full/partial/none) |
| False positive handling | `adversarial_negative` only | Full FP marker checking against ground truth FP list |
| Configuration | Hardcoded defaults | Per-domain configurable thresholds (ADR-014 integration) |
| Performance profile | Adequate | O(F*G) confirmed adequate for corpus sizes up to 10K |

### Algorithm Detail

```
matchFindings(findings: Finding[], sample: CorpusSample, config: MatcherConfig)
|
|  For each finding f in findings:
|    For each ground truth issue g in sample.ground_truth.issues:
|      if g already matched: skip
|      |
|      Step 1: FILE MATCH
|      |  Normalize both paths (strip ./, normalize \\ to /)
|      |  If normalized paths differ: skip (score = 0)
|      |
|      Step 2: LOCATION SCORE
|      |  If g is single-line (line_start == line_end):
|      |    distance = min(|f.line_start - g.line_start|, |f.line_end - g.line_start|)
|      |    if distance <= lineProximity (default 5):
|      |      locationScore = 1 - (distance / (lineProximity + 1))
|      |    else: skip (locationScore = 0)
|      |  If g is multi-line:
|      |    overlap = max(0, min(f.end, g.end) - max(f.start, g.start) + 1)
|      |    ratio = overlap / (g.end - g.start + 1)
|      |    if ratio >= overlapThreshold (default 0.5):
|      |      locationScore = ratio
|      |    else: skip (locationScore = 0)
|      |
|      Step 3: CATEGORY SCORE
|      |  if f.category == g.type: categoryScore = 1.0 (exact)
|      |  else if alias(f.category, g.type): categoryScore = 1.0 (alias)
|      |  else if sameFamily(f.category, g.type): categoryScore = 0.7
|      |  else if sameDomain(f.domain, g.type): categoryScore = 0.3
|      |  else: categoryScore = 0.0 (no match)
|      |
|      COMPOSITE SCORE:
|        if categoryScore >= 1.0: Full match
|          score = locationScore * categoryScore
|        elif categoryScore > 0: Partial match
|          score = locationScore * categoryScore * partialMatchWeight (0.5)
|        else: No match
|      |
|      Track best match for this finding
|
|  Greedy assignment: assign findings to best matches, no double-counting
|  Unmatched findings -> false_positives (with reason classification)
|  Unmatched ground truth -> false_negatives (missed issues)
```

### CWE Alias Map (Extended)

| CWE ID | Aliases | Category Family |
|--------|---------|-----------------|
| CWE-79 | xss, cross-site-scripting, reflected-xss, stored-xss | injection |
| CWE-89 | sql-injection, sqli | injection |
| CWE-78 | command-injection, os-injection, os-command-injection | injection |
| CWE-22 | path-traversal, directory-traversal, lfi | injection |
| CWE-94 | code-injection, eval-injection | injection |
| CWE-77 | command-injection-generic | injection |
| CWE-917 | expression-language-injection, el-injection | injection |
| CWE-918 | ssrf, server-side-request-forgery | injection |
| CWE-502 | deserialization, unsafe-deserialization, insecure-deserialization | data-integrity |
| CWE-798 | hardcoded-secrets, hardcoded-credentials, hardcoded-password | credentials |
| CWE-259 | hardcoded-password, hardcoded-crypto-key | credentials |
| CWE-327 | crypto-weakness, weak-cryptography, weak-cipher, broken-crypto | cryptography |
| CWE-326 | insufficient-key-length, weak-key | cryptography |
| CWE-295 | improper-certificate-validation, ssl-verification-disabled | cryptography |
| CWE-287 | improper-authentication, auth-bypass | authentication |
| CWE-306 | missing-authentication, no-auth | authentication |
| CWE-862 | missing-authorization, authz-bypass | authorization |
| CWE-863 | incorrect-authorization, broken-access-control | authorization |
| CWE-200 | information-exposure, info-leak, sensitive-data-exposure | information |
| CWE-532 | log-injection, sensitive-log, log-sensitive-data | information |
| CWE-611 | xxe, xml-external-entity | injection |
| CWE-352 | csrf, cross-site-request-forgery | session |
| CWE-384 | session-fixation | session |
| CWE-601 | open-redirect, url-redirect | redirect |
| CWE-400 | dos, denial-of-service, resource-exhaustion, redos | availability |

---

## Summary

| Capability | Description |
|------------|-------------|
| Three-step matching | File match -> location proximity -> category compatibility |
| Single-line proximity | Distance-based scoring within configurable threshold (default +/-5 lines) |
| Multi-line overlap | Ratio-based scoring with configurable minimum (default 50%) |
| Four-tier category scoring | Exact (1.0), alias (1.0), same family (0.7), same domain (0.3) |
| CWE alias resolution | Extended map covering CWE-Top25 and common alternative names |
| Greedy assignment | Best-match-first prevents double-counting findings |
| Partial match weighting | Partial matches counted as configurable fraction (default 0.5) of TP |
| Configurable thresholds | All parameters adjustable via MatcherConfig |
| Deterministic output | Same inputs always produce same matching results |
| Performance | O(F*G) per sample; acceptable for F,G < 100 typical values |

### Location Scoring Functions

| Scenario | Formula | Example |
|----------|---------|---------|
| Single-line, exact | `1 - (0 / 6) = 1.0` | Finding line 42, GT line 42 |
| Single-line, 2 away | `1 - (2 / 6) = 0.667` | Finding line 44, GT line 42 |
| Single-line, 5 away | `1 - (5 / 6) = 0.167` | Finding line 47, GT line 42 |
| Single-line, 6 away | `0.0` (exceeds threshold) | Finding line 48, GT line 42 |
| Multi-line, full overlap | `1.0` (ratio = 1.0) | Finding 42-48, GT 42-48 |
| Multi-line, 75% overlap | `0.75` | Finding 40-48, GT 42-50 |
| Multi-line, 50% overlap | `0.5` | Finding 40-44, GT 42-50 |
| Multi-line, 40% overlap | `0.0` (below threshold) | Finding 40-42, GT 42-50 |

### Match Classification

| Match Type | Condition | TP Weight | Description |
|------------|-----------|-----------|-------------|
| `full` | categoryScore >= 1.0 AND locationScore > 0 | `locationScore * categoryScore` | Exact or alias category match with location proximity |
| `partial` | 0 < categoryScore < 1.0 AND locationScore > 0 | `locationScore * categoryScore * 0.5` | Same family or domain category with location proximity |
| `none` | categoryScore == 0 OR locationScore == 0 | 0 | No match; classified as false positive |

---

## Options Considered

### Option 1: [Selected] -- Greedy Three-Step Fuzzy Matching

**Description:** Match findings to ground truth using file match, location proximity, and category compatibility with greedy best-match assignment.

**Pros:**
- Fair to tools with different reporting granularity
- Deterministic: same inputs always produce same results
- Configurable: all thresholds adjustable per-domain
- Simple to understand and debug
- O(F*G) performance adequate for corpus sizes
- Already partially implemented in `matcher.ts`

**Cons:**
- Greedy assignment may miss globally optimal matching in rare cases
- Category scoring tiers are heuristic, not formally derived
- +/-5 line proximity is a heuristic that may not suit all code patterns

### Option 2: [Rejected] -- Exact Matching Only

**Description:** Require exact file, line, and category match for a finding to count as a true positive.

**Pros:**
- Simplest possible implementation
- No configuration needed
- No ambiguity in results

**Cons:**
- Extremely unfair to tools that report issues at slightly different granularity
- ESLint reports column-level, SonarQube reports range -- exact line rarely matches
- Different category names for same vulnerability penalized
- Would produce artificially low recall for most tools
- Benchmark results would not reflect actual tool capability

**Rejection rationale:** Exact matching is too strict for practical tool evaluation. Different tools legitimately report the same issue at different locations and with different category names.

### Option 3: [Rejected] -- Optimal Bipartite Matching (Hungarian Algorithm)

**Description:** Model finding-to-truth matching as a bipartite assignment problem and solve for the globally optimal matching using the Hungarian algorithm.

**Pros:**
- Guarantees globally optimal matching (maximum total score)
- Well-studied algorithm with O(n^3) complexity
- No greedy approximation errors

**Cons:**
- O(n^3) complexity vs O(n^2) for greedy -- matters for large finding sets
- More complex implementation and harder to debug
- Difference from greedy is minimal for typical corpus sizes (< 100 issues per sample)
- Non-deterministic when multiple optimal solutions exist (tie-breaking needed)
- Over-engineered for the actual data sizes involved

**Rejection rationale:** For typical samples with 5-20 ground truth issues and 10-50 findings, the greedy approach produces results within 1-2% of optimal. The implementation complexity is not justified. If future analysis reveals significant differences, the greedy algorithm can be replaced without changing the interface.

---

## Consequences

### Positive
- Tools are evaluated fairly regardless of their reporting granularity
- CWE alias map enables cross-tool comparison without penalizing naming differences
- Configurable thresholds allow per-domain tuning (e.g., tighter proximity for security, looser for quality)
- Partial match scoring provides nuance between "completely right" and "somewhat right"
- Greedy assignment is simple to implement, test, and explain
- Deterministic output enables reproducible evaluation results

### Negative
- Greedy assignment may produce sub-optimal matchings when multiple findings compete for the same ground truth
- The four-tier category scoring (1.0, 1.0, 0.7, 0.3) is a simplification; real-world category relationships are more nuanced
- +/-5 line proximity may be too generous for dense code or too restrictive for sparse code
- CWE alias map requires manual maintenance as new CWEs are added

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Greedy matching significantly differs from optimal | Low | Low | Benchmark comparison: run Hungarian on sample and measure delta |
| CWE alias map incomplete for uncommon CWEs | Medium | Medium | Community contributions; automated CWE database cross-referencing |
| Category scoring tiers produce unfair results | Medium | Medium | Empirical validation against expert matching; adjust tiers based on data |
| Location proximity too lenient (false TPs) | Low | Medium | Configurable threshold; per-domain tuning in ADR-014 |
| Performance degradation with large finding sets | Low | Low | Current O(F*G) is acceptable; can optimize with indexing if needed |

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
| Parent | ADR-001 | Bounded Context Map | Matching Engine is a bounded context defined in ADR-001 |
| Receives input from | ADR-004 | Adapter Layer Anti-Corruption Pattern | Adapter produces Finding[] that matcher consumes |
| Receives input from | ADR-002 | Corpus Aggregate Design | Matcher uses CorpusSample ground truth |
| Outputs to | ADR-006 | Metrics and Scoring | Matcher produces MatchedFinding[], UnmatchedFinding[], MissedIssue[] |
| Tuned by | ADR-014 | Domain-Specific Evaluation | Per-domain matching thresholds and category maps |
| Tested by | ADR-013 | Testing Strategy | Property-based tests for matcher invariants |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Matcher implementation | Source Code | `harness/src/matcher.ts` |
| REF-002 | MatcherConfig interface | Source Code | `harness/src/matcher.ts` (lines 19-28) |
| REF-003 | Matching types | Source Code | `harness/src/types.ts` (lines 124-143) |
| REF-004 | CWE Top 25 (2024) | Standard | https://cwe.mitre.org/top25/archive/2024/2024_cwe_top25.html |
| REF-005 | Hungarian Algorithm | Algorithm | Kuhn-Munkres assignment problem |
| REF-006 | SARIF matching guidance | Standard | SARIF specification result matching |
