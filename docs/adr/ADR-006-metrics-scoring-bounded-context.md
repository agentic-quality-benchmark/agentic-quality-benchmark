# ADR-006: Metrics and Scoring Bounded Context

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-006 |
| **Initiative** | Metrics and Scoring |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** quantifying QE tool effectiveness across 14 domains, 5 difficulty levels, and 5+ languages, where stakeholders need both aggregate scores for tool comparison and detailed breakdowns for understanding tool strengths and weaknesses,

**facing** the challenge of defining metrics that are fair across tools with different architectures (rule-based vs LLM-based vs multi-agent), account for issue severity (a missed critical vulnerability is worse than a missed info-level warning), measure cost efficiency (LLM-based tools consume tokens and dollars), detect fabrication (findings on clean code), and produce statistically meaningful comparisons between tools,

**we decided for** a comprehensive metrics framework with three tiers -- (1) standard IR metrics (precision, recall, F1, false positive rate), (2) AQB-specific metrics (fabrication rate, severity-weighted recall with critical=3x/high=2x/medium=1x/low=0.5x/info=0.25x, cost efficiency as findings per dollar and cost per true positive), and (3) breakdown dimensions (per-domain DomainMetrics, per-difficulty recall, per-language precision and recall) -- aggregated into a Scorecard as the final deliverable, with bootstrap confidence intervals for statistical significance and a comparison mode for delta analysis between tool runs,

**and neglected** (a) a single aggregate score (like a grade letter) because it obscures important performance differences across domains and difficulty levels; (b) domain-specific metrics only because it prevents cross-tool comparison at the aggregate level; (c) raw count-based metrics (total findings, total matches) because they do not normalize for corpus size differences across domains,

**to achieve** fair cross-tool comparison through normalized metrics, actionable insights through multi-dimensional breakdowns, cost-aware evaluation that accounts for the economic reality of LLM-based tools, fabrication detection that penalizes tools that hallucinate findings, and statistically rigorous comparisons through confidence intervals,

**accepting that** the severity weight ratios (3x/2x/1x/0.5x/0.25x) are somewhat arbitrary and may need empirical calibration, bootstrap confidence intervals add computational cost, and the Scorecard format may evolve as the benchmark matures.

---

## Problem Statement

Evaluating QE tools requires more than simple true/false positive counts. Different stakeholders need different views:

| Stakeholder | Question | Required Metric |
|-------------|----------|-----------------|
| Tool developer | How accurate is my tool overall? | Precision, recall, F1 |
| Security team | Does this tool miss critical vulns? | Severity-weighted recall |
| Engineering manager | Is this tool cost-effective? | Findings per dollar, cost per TP |
| Benchmark committee | Is this tool fabricating findings? | Fabrication rate |
| Researcher | Is this improvement statistically significant? | Bootstrap CI on F1 |
| Domain expert | How does this tool perform on my domain? | DomainMetrics (per-domain P/R/F1) |
| Language team | Does this tool work for our language? | Per-language precision and recall |

### Current Implementation State

| Component | Status | Implementation |
|-----------|--------|----------------|
| `computeMetrics()` | Implemented | P, R, F1, FPR, fabrication rate, SWR, cost metrics |
| `computeDomainMetrics()` | Implemented | Per-domain P/R/F1, sample count, avg latency |
| `computeDifficultyMetrics()` | Implemented | Per-difficulty recall |
| Per-language metrics | Type defined in `AQBResult` | Not yet computed (missing function) |
| Scorecard generation | Type defined | No assembly function |
| Bootstrap CI | Not designed | No implementation |
| Comparison mode | Not designed | No delta analysis |
| Metric visualization | Not designed | No formatted output |

### Gaps in Current Metrics Implementation

| Gap | Impact |
|-----|--------|
| `computeDomainMetrics()` false negative filtering is approximate | Per-domain recall may be inaccurate for non-security domains |
| No per-language metrics computation function | Language breakdown unavailable |
| No Scorecard assembly function | Final deliverable cannot be produced |
| No statistical significance testing | Cannot determine if Tool A is truly better than Tool B |
| No comparison/delta mode | Cannot track improvement between tool versions |
| Severity weights hardcoded in function | Cannot be adjusted per evaluation |
| No metric serialization format | Cannot save/load evaluation results |

---

## Opportunity

A comprehensive metrics framework transforms raw matching results into actionable evaluation intelligence.

| Dimension | Before | After |
|-----------|--------|-------|
| Comparison fairness | Raw counts favor tools that report more | Normalized P/R/F1 adjusts for volume |
| Severity awareness | All findings weighted equally | Critical vulns weighted 3x in recall |
| Cost awareness | No cost tracking | Findings per dollar enables economic comparison |
| Fabrication detection | Binary (finds something on clean code or not) | Rate-based (proportion of fabricated findings) |
| Domain insight | Single aggregate score | 14 domain-specific P/R/F1 breakdowns |
| Statistical rigor | Point estimates only | Bootstrap 95% CI on all metrics |
| Trend analysis | No history | Comparison mode shows delta between runs |

### Metrics Taxonomy

```
Scorecard
|
+-- overall: AQBMetrics
|   +-- Standard IR Metrics
|   |   +-- precision        = TP / (TP + FP)
|   |   +-- recall           = TP / (TP + FN)
|   |   +-- f1               = 2 * P * R / (P + R)
|   |   +-- false_positive_rate = FP / (FP + TN)
|   |
|   +-- AQB-Specific Metrics
|   |   +-- fabrication_rate  = fabrications / total_findings
|   |   +-- severity_weighted_recall = weighted_TP / weighted_total
|   |   +-- mean_time_to_detect_ms = total_latency / TP_count
|   |
|   +-- Cost Efficiency
|       +-- token_cost_usd
|       +-- findings_per_dollar = TP / cost_usd
|       +-- total_latency_ms
|
+-- domains: Record<Domain, DomainMetrics>
|   +-- [14 entries, one per domain]
|   +-- Each: precision, recall, f1, samples_evaluated, avg_latency_ms
|
+-- difficulty: Record<1|2|3|4|5, { recall }>
|   +-- [5 entries, recall at each difficulty level]
|
+-- languages: Record<Language, { precision, recall }>
|   +-- [per-language breakdown]
|
+-- agentic?: AgenticMetrics
    +-- [see ADR-007]
```

### Severity Weight Rationale

| Severity | Weight | Rationale |
|----------|--------|-----------|
| `critical` | 3.0 | Exploitable vulnerabilities with RCE/data breach potential; missing these is 3x worse |
| `high` | 2.0 | Significant issues requiring immediate attention; missing these is 2x worse |
| `medium` | 1.0 | Baseline weight; typical code quality issues |
| `low` | 0.5 | Minor issues; missing these is half as bad as missing medium |
| `info` | 0.25 | Informational findings; missing these has minimal impact |

The severity-weighted recall formula:

```
SWR = sum(weight_i * match_score_i for i in TPs) / sum(weight_j for j in TPs + FNs)

Where weight_i = { critical: 3, high: 2, medium: 1, low: 0.5, info: 0.25 }
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Standard IR metrics | Precision, recall, F1, false positive rate |
| Fabrication rate | Proportion of findings on adversarial negative samples |
| Severity-weighted recall | Recall weighted by issue severity (critical=3x, high=2x) |
| Cost efficiency | Findings per dollar, cost per true positive, total token cost |
| Per-domain breakdown | P/R/F1 for each of 14 domains independently |
| Per-difficulty recall | Recall at each difficulty level (1-5) |
| Per-language breakdown | Precision and recall for each programming language |
| Scorecard aggregate | Single JSON document combining all metrics |
| Bootstrap confidence intervals | 95% CI on F1 and other metrics via bootstrapping |
| Comparison mode | Delta analysis between two evaluation runs |

### Bootstrap Confidence Interval Method

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Bootstrap samples | 1,000 | Standard for benchmark comparisons |
| Confidence level | 95% | Standard in information retrieval evaluation |
| Resampling unit | Per-sample results (not per-finding) | Preserves within-sample correlation |
| Metrics bootstrapped | F1, precision, recall, SWR | Key comparison metrics |
| Comparison test | Overlapping CIs = not significant | Conservative test for tool comparison |

```
Bootstrap F1 CI:

For b = 1 to 1000:
  Resample N per-sample results with replacement
  Compute F1_b from resampled results
Sort {F1_1, ..., F1_1000}
CI_lower = F1_{25}   (2.5th percentile)
CI_upper = F1_{975}  (97.5th percentile)
```

### Comparison Mode

| Delta Metric | Formula | Interpretation |
|--------------|---------|----------------|
| `delta_f1` | `f1_new - f1_old` | Positive = improvement |
| `delta_recall` | `recall_new - recall_old` | Positive = finds more bugs |
| `delta_precision` | `precision_new - precision_old` | Positive = fewer false positives |
| `delta_fabrication` | `fab_new - fab_old` | Negative = less fabrication (improvement) |
| `delta_cost` | `cost_new - cost_old` | Negative = cheaper (improvement) |
| `significant` | CIs do not overlap | True = statistically significant difference |

---

## Options Considered

### Option 1: [Selected] -- Comprehensive Multi-tier Metrics Framework

**Description:** Three tiers of metrics (standard IR, AQB-specific, breakdowns) aggregated into a Scorecard with bootstrap CIs and comparison mode.

**Pros:**
- Serves all stakeholder needs (developer, security, management, research)
- Severity weighting reflects real-world impact priorities
- Cost efficiency enables economic comparison of LLM-based tools
- Fabrication rate specifically targets hallucination problems
- Bootstrap CIs enable statistically rigorous tool comparison
- Scorecard provides a single, comprehensive evaluation artifact
- Multi-dimensional breakdowns reveal tool strengths and weaknesses

**Cons:**
- Complexity: many metrics to compute and present
- Severity weights are somewhat arbitrary
- Bootstrap CI adds computational cost (~1000x metric computation)
- Scorecard format may need to evolve as benchmark matures

### Option 2: [Rejected] -- Single Aggregate Score

**Description:** Combine all metrics into a single score (e.g., weighted average) for easy ranking.

**Pros:**
- Simple to compare: Tool A = 0.78, Tool B = 0.82
- Easy to rank for leaderboard
- Low cognitive load

**Cons:**
- Obscures critical differences (tool with 90% security recall but 20% accessibility recall gets same score as balanced tool)
- Weight assignment for combining metrics is subjective and contentious
- Cannot answer "which tool is best for my domain?"
- Loss of information prevents actionable insights

**Rejection rationale:** A single score hides the very information that makes a benchmark useful. The Scorecard provides both the detail and, through F1 as primary ranking metric (ADR-011), a simple comparison path.

### Option 3: [Rejected] -- Domain-Specific Metrics Only

**Description:** Define custom metrics per domain (e.g., mutation score for test-generation, WCAG recall for accessibility) without aggregate metrics.

**Pros:**
- Maximum relevance per domain
- No need for cross-domain normalization
- Domain experts can define their own metrics

**Cons:**
- Cannot compare tools across domains
- No aggregate view for tool ranking
- 14 separate metric sets to understand
- Leaderboard requires cross-domain aggregation

**Rejection rationale:** While domain-specific metrics are valuable (and addressed in ADR-014), they must complement, not replace, the standard aggregate metrics that enable cross-tool comparison.

---

## Consequences

### Positive
- Stakeholders at every level have relevant metrics for their decisions
- Severity-weighted recall surfaces tools that are better at finding critical issues
- Cost efficiency metrics enable ROI analysis for LLM-based tool adoption
- Fabrication rate directly measures the hallucination problem unique to AI tools
- Bootstrap CIs prevent over-interpretation of small metric differences
- Comparison mode supports tool version tracking and regression detection
- Scorecard JSON format enables programmatic consumption and visualization

### Negative
- Many metrics can be overwhelming; good visualization is essential
- Severity weights (3x/2x/1x/0.5x/0.25x) may be contested by tool vendors
- Bootstrap resampling adds ~10 seconds to metric computation (1000 iterations over 1680 samples)
- Metric definitions must be precisely documented to prevent misinterpretation

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Severity weights produce unfair rankings | Medium | High | Publish weights prominently; allow user-configurable weights for local evaluation |
| Fabrication rate gaming (tools return zero on clean code) | Low | Medium | Include fabrication-like samples that are almost-clean but have subtle issues |
| Bootstrap CI too conservative (everything "not significant") | Medium | Low | Also report effect size (Cohen's d); use paired bootstrap for direct comparison |
| Cost tracking inaccurate (different LLM pricing) | Medium | Medium | Standardize on OpenAI API pricing; report tokens alongside dollars |
| Scorecard format changes break consumers | Medium | Medium | Semantic versioning on Scorecard schema; backward-compatible additions only |

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
| Parent | ADR-001 | Bounded Context Map | Metrics and Scoring is a bounded context defined in ADR-001 |
| Receives input from | ADR-005 | Matching Engine Algorithm | Matcher produces TP/FP/FN that metrics consume |
| Consumed by | ADR-007 | Agentic Evaluation Protocol | Agentic metrics extend the base metrics framework |
| Consumed by | ADR-011 | Leaderboard and Results | Leaderboard ranks tools by Scorecard metrics |
| Exposed by | ADR-008 | CLI and API Gateway | CLI formats and displays Scorecard |
| Extended by | ADR-014 | Domain-Specific Evaluation | Domain-specific metrics beyond standard P/R/F1 |
| Tested by | ADR-013 | Testing Strategy | Metric calculation accuracy tests |
| Cross-cutting | ADR-012 | Cross-Cutting Concerns | Fabrication stress test and composite scenarios |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Metrics implementation | Source Code | `harness/src/metrics.ts` |
| REF-002 | AQBMetrics interface | Source Code | `harness/src/types.ts` (lines 169-180) |
| REF-003 | DomainMetrics interface | Source Code | `harness/src/types.ts` (lines 182-188) |
| REF-004 | Scorecard interface | Source Code | `harness/src/types.ts` (lines 235-245) |
| REF-005 | AgenticMetrics interface | Source Code | `harness/src/types.ts` (lines 192-231) |
| REF-006 | Bootstrap methods for IR | Paper | Efron & Tibshirani, An Introduction to the Bootstrap (1993) |
| REF-007 | TREC evaluation methodology | Standard | NIST Text REtrieval Conference evaluation practices |
