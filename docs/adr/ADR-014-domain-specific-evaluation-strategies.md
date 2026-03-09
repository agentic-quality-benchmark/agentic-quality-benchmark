# ADR-014: Domain-Specific Evaluation Strategies

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-014 |
| **Initiative** | Domain-Specific Evaluation |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** evaluating QE tools across 14 distinct domains that each have unique success criteria -- where test generation effectiveness is measured by mutation score rather than F1, accessibility evaluation requires WCAG violation recall rather than generic defect detection, and visual regression needs pixel-diff accuracy rather than line-based matching,

**facing** the challenge of defining fair, domain-appropriate evaluation strategies for each of the 14 domains while maintaining a unified harness architecture, where each domain has its own primary metric (beyond standard F1), its own category taxonomy, its own matching customizations (CWE mapping for security, mutation score for test-gen, WCAG mapping for accessibility), and its own corpus characteristics (language distribution, difficulty profile, sample count),

**we decided for** a domain-specific evaluation strategy framework that defines per-domain: (1) a primary metric beyond F1 (e.g., mutation score, WCAG recall, breaking change F1), (2) matching customizations (category mapping, location tolerance, scoring adjustments), (3) a category taxonomy defined in the corpus manifest, (4) domain-specific corpus requirements (sample count, language distribution, sourcing method priorities), and a domain extension mechanism that enables adding domain 15+ through manifest configuration and adapter implementation without modifying the harness core, plus a cross-domain composite evaluation that produces a weighted aggregate across all domains,

**and neglected** (a) treating all domains identically because it ignores the fundamental differences in what constitutes good performance per domain; (b) building 14 separate evaluation pipelines because it would create massive code duplication and make the harness unmaintainable; (c) letting each adapter define its own evaluation criteria because it would make cross-tool comparison within a domain impossible,

**to achieve** fair, domain-appropriate evaluation that measures what actually matters in each QE domain, a unified harness architecture that accommodates domain differences through configuration rather than code duplication, clear category taxonomies that enable consistent labeling and matching within each domain, and an extensible architecture that supports new domains without core harness changes,

**accepting that** 14 domain-specific strategies add complexity to the evaluation framework, some domains have subjective primary metrics (quality, requirements), the domain extension mechanism requires careful design to prevent fragmentation, and weighted cross-domain aggregation involves subjective weight choices.

---

## Problem Statement

The 14 QE domains have fundamentally different success criteria:

| Domain | What "Good" Looks Like | Why F1 Alone Is Insufficient |
|--------|----------------------|------------------------------|
| Security | High recall for critical CWEs, low fabrication | F1 does not weight by severity or CWE relevance |
| Defects | Accurate defect classification, AUC-ROC | F1 at a single threshold misses ranking quality |
| Test Generation | Tests that kill mutants, not just compile | F1 measures detection, not test quality |
| Coverage Analysis | Identify the riskiest uncovered paths | F1 does not measure risk prioritization |
| Quality | Agreement with expert quality assessments | F1 does not capture subjective quality agreement |
| Requirements | Identify ambiguous requirements accurately | F1 does not measure ambiguity-specific recall |
| Code Intelligence | Predict impact of changes | F1 does not measure impact prediction accuracy |
| Contracts | Detect breaking API changes | F1 does not measure backward compatibility analysis |
| Accessibility | Detect WCAG violations comprehensively | F1 does not map to WCAG conformance levels |
| Performance | Predict latency bottlenecks | F1 does not measure latency prediction accuracy |
| Chaos Resilience | Detect faults under stress | F1 does not measure fault detection under degradation |
| Enterprise Integration | Verify protocol compliance | F1 does not measure protocol-specific compliance |
| Flaky Tests | Identify truly flaky tests and root causes | F1 does not measure root cause accuracy |
| Visual Regression | Detect visual changes accurately | F1 does not measure pixel-level accuracy |

### Current Domain Configuration

The corpus manifest (`corpus/v0.1/manifest.json`) defines categories for 4 domains:

| Domain | Categories Defined | Target Samples | Status |
|--------|-------------------|----------------|--------|
| Security | sql-injection, xss, hardcoded-secrets, path-traversal, command-injection, crypto-weakness, ssrf | 200 | In progress |
| Defects | null-deref, race-condition, off-by-one, resource-leak, state-corruption, type-confusion | 150 | Planned |
| Test Generation | functions-with-edge-cases, mutation-seeded-variants, tdd-scenarios | 120 | Planned |
| Fabrication Stress Test | provably-correct-code, trivially-simple-code, formally-verified, expert-reviewed-clean | 100 | Planned |

10 domains have no categories or samples defined yet.

### Matching Customization Needs

| Domain | Matching Customization | Rationale |
|--------|----------------------|-----------|
| Security | CWE alias resolution; CVSS-aligned severity | CWE taxonomy is the standard for security; CVSS provides severity |
| Defects | Bug pattern family matching | Similar bug types should partially match |
| Test Generation | Mutation score as primary metric (not TP/FP matching) | Test quality measured by mutation killing |
| Coverage Analysis | Risk-weighted gap detection | Not all coverage gaps are equal |
| Quality | Expert agreement scoring (kappa) | Quality is subjective; inter-rater agreement matters |
| Requirements | Ambiguity type classification | Different ambiguity types (lexical, syntactic, semantic) |
| Accessibility | WCAG guideline mapping | Violations map to specific WCAG success criteria |
| Contracts | Schema diff matching | Breaking changes measured by API schema comparison |
| Visual Regression | Viewport and component-level matching | Pixel diffs at specific viewport sizes |
| Flaky Tests | Root cause categorization | Not just detection but cause classification |

---

## Opportunity

Domain-specific strategies transform AQB from a generic F1 benchmark into a domain-aware evaluation platform.

| Dimension | Before | After |
|-----------|--------|-------|
| Evaluation fairness | Same F1 metric for all domains | Domain-appropriate primary metrics |
| Category matching | Generic string comparison | Domain-specific taxonomy with alias resolution |
| Corpus requirements | Generic schema | Per-domain sample targets, language distributions, categories |
| Domain extensibility | Hard-coded 14 domains | Manifest-driven domain definition; domain 15+ via configuration |
| Cross-domain comparison | Not possible | Weighted aggregate with domain coverage requirements |
| Tool guidance | "F1 = 0.78" | "Security Recall@CWE-Top25 = 0.81, Test Gen Mutation Score = 0.65" |

### Domain Evaluation Strategy Template

Each domain defines its strategy through a configuration structure:

```
DomainEvaluationStrategy
|
+-- domain: Domain                    -- One of 14 domain identifiers
+-- primaryMetric: string             -- Domain-specific primary metric name
+-- primaryMetricFunction: Function   -- How to compute the primary metric
+-- matchingOverrides: MatcherConfig  -- Domain-specific matching thresholds
+-- categoryTaxonomy: CategoryMap     -- Valid categories with aliases
+-- corpusRequirements: DomainCorpusRequirements
|   +-- targetSamples: number
|   +-- languageDistribution: Record<Language, number>
|   +-- minAdversarialPct: number
|   +-- sourcingPriorities: SourcingMethod[]
+-- evaluationGates: EvaluationGate[] -- Prerequisites for valid evaluation
+-- crossDomainWeight: number         -- Weight in aggregate scoring (0.0-1.0)
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Per-domain primary metrics | Each domain has a primary metric beyond standard F1 |
| Matching customizations | Per-domain category aliases, location tolerances, scoring adjustments |
| Category taxonomies | Valid categories per domain defined in corpus manifest |
| Domain corpus requirements | Per-domain sample targets, language distributions, sourcing priorities |
| Evaluation gates | Prerequisites for valid domain evaluation (minimum samples, language coverage) |
| Domain extension mechanism | Add domain 15+ via manifest + adapter without core harness changes |
| Cross-domain aggregation | Weighted aggregate across evaluated domains |
| Domain-specific reporting | Per-domain sections in scorecard with domain-relevant metrics |

### All 14 Domains: Strategy Detail

#### Domain 1: Security

| Parameter | Value |
|-----------|-------|
| Primary metric | Recall@CWE-Top25 (recall limited to CWE Top 25 issues) |
| Secondary metrics | CVSS-aligned severity accuracy, CWE specificity (correct CWE ID vs. family) |
| Category taxonomy | CWE IDs (CWE-79, CWE-89, CWE-78, CWE-22, CWE-798, CWE-327, CWE-918, ...) |
| Category aliases | Full CWE alias map from ADR-005 (50+ entries) |
| Matching override | `lineProximity: 5`, `overlapThreshold: 0.5` (default) |
| Severity alignment | Map to CVSS: critical=CVSS 9.0+, high=7.0-8.9, medium=4.0-6.9, low=0.1-3.9 |
| Target samples | 200 |
| Language distribution | TS 30%, Python 25%, Java 20%, Go 15%, Other 10% |
| Sourcing priority | Real CVEs > Mutation seeding > Synthetic |

#### Domain 2: Defects

| Parameter | Value |
|-----------|-------|
| Primary metric | AUC-ROC (area under ROC curve across confidence thresholds) |
| Secondary metrics | Per-defect-type recall, precision at various thresholds |
| Category taxonomy | null-deref, race-condition, off-by-one, resource-leak, state-corruption, type-confusion, infinite-loop, dead-code, memory-leak, use-after-free |
| Category families | Memory (null-deref, use-after-free, memory-leak), Concurrency (race-condition, deadlock), Logic (off-by-one, infinite-loop), Resource (resource-leak, state-corruption) |
| Matching override | `lineProximity: 8` (defects often span wider code areas) |
| Target samples | 150 |
| Language distribution | Java 25%, Python 25%, TS 20%, Go 20%, Other 10% |
| Sourcing priority | Historical bugfix > Mutation seeding > Synthetic |

#### Domain 3: Test Generation

| Parameter | Value |
|-----------|-------|
| Primary metric | Mutation score (percentage of seeded mutants killed by generated tests) |
| Secondary metrics | Compilability rate, test execution success rate, branch coverage achieved |
| Evaluation method | Generate tests -> inject mutants -> run tests -> measure kills |
| Category taxonomy | functions-with-edge-cases, mutation-seeded-variants, tdd-scenarios, boundary-testing, exception-handling |
| Evaluation gate | Generated tests must compile before mutation scoring |
| Scoring | Mutation score replaces F1 as primary; F1 of "detected mutations" is secondary |
| Target samples | 120 |
| Language distribution | TS 40%, Python 30%, Java 20%, Go 10% |
| Sourcing priority | Mutation seeding > Historical bugfix > Synthetic |

#### Domain 4: Coverage Analysis

| Parameter | Value |
|-----------|-------|
| Primary metric | Gap detection accuracy (correct identification of uncovered code regions) |
| Secondary metrics | Risk prioritization NDCG (are high-risk gaps ranked higher?), coverage estimation error |
| Category taxonomy | uncovered-branch, uncovered-function, uncovered-exception-path, uncovered-error-handling, risk-hotspot |
| Matching override | `lineProximity: 10` (coverage gaps span ranges) |
| Risk scoring | Gaps in security-critical code weighted 3x, in error handling 2x |
| Target samples | 100 |
| Language distribution | TS 35%, Python 25%, Java 20%, Go 15%, Other 5% |
| Sourcing priority | Synthetic > Mutation seeding > Historical bugfix |

#### Domain 5: Quality

| Parameter | Value |
|-----------|-------|
| Primary metric | Expert agreement (Cohen's kappa between tool and expert quality assessment) |
| Secondary metrics | Quality score MAE (mean absolute error vs. expert scores), ranking correlation |
| Category taxonomy | code-smell, complexity, maintainability, readability, naming, documentation, design-pattern-violation |
| Evaluation method | Tool rates code quality 1-5; compared against expert ratings |
| Scoring | Kappa > 0.7 = excellent, 0.5-0.7 = good, 0.3-0.5 = fair, < 0.3 = poor |
| Target samples | 120 |
| Language distribution | TS 35%, Python 25%, Java 15%, Go 15%, Other 10% |
| Sourcing priority | Historical bugfix > Synthetic > Mutation seeding |

#### Domain 6: Requirements

| Parameter | Value |
|-----------|-------|
| Primary metric | Ambiguity F1 (detection of ambiguous requirements) |
| Secondary metrics | Testability correlation (predicted vs. actual testability), completeness detection |
| Category taxonomy | lexical-ambiguity, syntactic-ambiguity, semantic-ambiguity, incomplete-requirement, contradictory-requirement, untestable-requirement, missing-acceptance-criteria |
| Matching override | Document-level matching (not line-level); paragraph or section matching |
| Target samples | 200 |
| Language distribution | N/A (natural language requirements; tagged by spec format: user-story, BDD, traditional) |
| Sourcing priority | Synthetic > Real specifications > N/A |

#### Domain 7: Code Intelligence

| Parameter | Value |
|-----------|-------|
| Primary metric | Impact prediction F1 (correctly predict which files/tests are affected by a change) |
| Secondary metrics | Change risk scoring accuracy, dependency graph completeness |
| Category taxonomy | high-impact-change, low-impact-change, cross-module-dependency, breaking-internal-api, test-impacted |
| Evaluation method | Given a code change, predict impact; compare against actual impact (test failures, dependent changes) |
| Target samples | 80 |
| Language distribution | TS 30%, Python 25%, Java 20%, Go 20%, Other 5% |
| Sourcing priority | Historical bugfix > Mutation seeding > Synthetic |

#### Domain 8: Contracts

| Parameter | Value |
|-----------|-------|
| Primary metric | Breaking change F1 (detection of backward-incompatible API changes) |
| Secondary metrics | Schema validation accuracy, deprecation detection rate |
| Category taxonomy | breaking-field-removal, breaking-type-change, breaking-required-addition, non-breaking-addition, deprecation, version-mismatch |
| Evaluation method | Given API version pairs (v1, v2), detect breaking changes |
| Formats supported | OpenAPI 3.x, GraphQL SDL, gRPC protobuf, JSON Schema |
| Target samples | 80 |
| Language distribution | N/A (API schemas are language-independent; tagged by format) |
| Sourcing priority | Synthetic > Real API changelogs > N/A |

#### Domain 9: Accessibility

| Parameter | Value |
|-----------|-------|
| Primary metric | WCAG violation recall (recall against known WCAG violations) |
| Secondary metrics | Remediation quality score, WCAG conformance level accuracy (A/AA/AAA) |
| Category taxonomy | color-contrast, keyboard-navigation, screen-reader, alt-text, form-labels, focus-management, aria-attributes, heading-structure, language-declaration |
| WCAG mapping | Each category maps to WCAG 2.1 success criteria (e.g., color-contrast -> 1.4.3, alt-text -> 1.1.1) |
| Matching override | CSS selector matching (not line-based); component-level proximity |
| Target samples | 100 |
| Language distribution | HTML/CSS/JS 60%, React/TS 30%, Vue 10% |
| Sourcing priority | Real WCAG violations > Synthetic > Mutation seeding |

#### Domain 10: Performance

| Parameter | Value |
|-----------|-------|
| Primary metric | Latency prediction accuracy (MAE between predicted and actual latency) |
| Secondary metrics | Bottleneck detection recall, optimization suggestion quality |
| Category taxonomy | n-plus-one-query, inefficient-algorithm, unnecessary-allocation, blocking-io, missing-cache, excessive-logging, unoptimized-serialization |
| Evaluation method | Tool predicts latency/bottlenecks; compared against profiling data |
| Target samples | 60 |
| Language distribution | TS 30%, Python 25%, Java 25%, Go 15%, Other 5% |
| Sourcing priority | Synthetic (profiled) > Real performance bugs > N/A |

#### Domain 11: Chaos Resilience

| Parameter | Value |
|-----------|-------|
| Primary metric | Fault detection rate (detection of injected faults under degradation) |
| Secondary metrics | Recovery time prediction, cascading failure detection |
| Category taxonomy | service-timeout, circuit-breaker-missing, retry-without-backoff, no-fallback, cascading-failure, resource-exhaustion, partial-failure-handling |
| Evaluation method | Given microservice code with injected faults, detect resilience issues |
| Target samples | 60 |
| Language distribution | TS 30%, Java 25%, Go 25%, Python 15%, Other 5% |
| Sourcing priority | Synthetic > Real incident post-mortems > N/A |

#### Domain 12: Enterprise Integration

| Parameter | Value |
|-----------|-------|
| Primary metric | Protocol compliance score (conformance to messaging/integration standards) |
| Secondary metrics | Schema validation accuracy, message format compliance |
| Category taxonomy | soap-fault-handling, kafka-offset-management, grpc-error-codes, rest-hateoas, message-schema-violation, idempotency-missing, transaction-boundary |
| Formats | WSDL/SOAP, Kafka, gRPC, REST/OpenAPI, SAP RFC |
| Target samples | 80 |
| Language distribution | Java 35%, TS 25%, Go 20%, Python 15%, Other 5% |
| Sourcing priority | Synthetic > Real protocol issues > N/A |

#### Domain 13: Flaky Tests

| Parameter | Value |
|-----------|-------|
| Primary metric | Detection recall (recall of known flaky tests) |
| Secondary metrics | Root cause accuracy, fix suggestion quality |
| Category taxonomy | async-timing, shared-state, network-dependency, file-system-dependency, random-ordering, time-dependency, resource-contention, platform-dependency |
| Evaluation method | Given test suite, identify which tests are flaky and why |
| Root cause scoring | Correct flaky detection = 0.5 credit; correct root cause = full credit |
| Target samples | 80 |
| Language distribution | TS 30%, Python 30%, Java 25%, Go 10%, Other 5% |
| Sourcing priority | Historical (iDFlakies) > Real flaky test repos > Synthetic |

#### Domain 14: Visual Regression

| Parameter | Value |
|-----------|-------|
| Primary metric | Change detection F1 (detection of meaningful visual changes between screenshots) |
| Secondary metrics | Viewport coverage (detection at mobile/tablet/desktop), false change rate (ignoring anti-aliasing/rendering noise) |
| Category taxonomy | layout-shift, color-change, font-change, spacing-change, element-removal, element-addition, responsive-breakpoint-change |
| Evaluation method | Given screenshot pairs (before/after), detect and classify visual changes |
| Matching override | Bounding-box overlap matching (not line-based); IoU > 0.5 for spatial match |
| Target samples | 60 |
| Language distribution | N/A (screenshot pairs; tagged by viewport: mobile, tablet, desktop) |
| Sourcing priority | Synthetic (screenshot pairs) > Real UI regressions > N/A |

### Cross-Domain Aggregate Scoring

| Domain | Default Weight | Rationale |
|--------|---------------|-----------|
| Security | 1.0 | Core QE domain; highest sample count |
| Defects | 1.0 | Core QE domain |
| Test Generation | 0.8 | Important but specialized |
| Coverage Analysis | 0.7 | Supporting domain |
| Quality | 0.8 | Broadly applicable |
| Requirements | 0.8 | Upstream impact |
| Code Intelligence | 0.6 | Specialized |
| Contracts | 0.6 | Specialized |
| Accessibility | 0.8 | Regulatory importance |
| Performance | 0.6 | Specialized |
| Chaos Resilience | 0.5 | Niche domain |
| Enterprise Integration | 0.5 | Niche domain |
| Flaky Tests | 0.6 | Specialized |
| Visual Regression | 0.5 | Niche domain |

Weighted aggregate formula:

```
aggregate_score = sum(domain_f1_i * weight_i) / sum(weight_i)
  for all domains where the tool was evaluated
```

Only domains with sufficient evaluation coverage (>= 50% samples) are included in the aggregate.

### Domain Extension Mechanism

To add domain 15+, a contributor must:

1. Add domain to the `Domain` type union in `types.ts`
2. Add domain entry in corpus manifest with:
   - Category taxonomy
   - Target sample count
   - Language distribution
   - Sourcing priorities
3. Implement domain evaluation strategy (matching overrides, primary metric)
4. Contribute initial corpus samples (minimum 20 for provisional inclusion)
5. Implement or extend an adapter to support the domain

```
corpus/v0.2/manifest.json:
{
  "domains": {
    "new-domain-15": {
      "categories": ["cat-a", "cat-b", "cat-c"],
      "target_samples": 60,
      "current_samples": 20,
      "status": "provisional",
      "primary_metric": "custom-metric-name",
      "matching_overrides": {
        "lineProximity": 10,
        "overlapThreshold": 0.4
      },
      "cross_domain_weight": 0.5
    }
  }
}
```

---

## Options Considered

### Option 1: [Selected] -- Domain-Specific Evaluation Strategies with Unified Harness

**Description:** Each domain has a defined evaluation strategy (primary metric, matching customizations, category taxonomy, corpus requirements) configured through manifests and strategy objects, all executed through the same harness pipeline.

**Pros:**
- Domain-appropriate metrics measure what actually matters per domain
- Unified harness prevents code duplication across 14 domains
- Category taxonomies enable consistent labeling and matching
- Extension mechanism supports new domains without core changes
- Cross-domain aggregate enables overall tool comparison
- Configuration-driven approach keeps harness code domain-agnostic

**Cons:**
- 14 evaluation strategies add configuration complexity
- Some primary metrics are hard to automate (expert agreement, mutation score)
- Cross-domain weights are subjective
- Extension mechanism requires careful governance to prevent fragmentation

### Option 2: [Rejected] -- Identical Evaluation Across All Domains

**Description:** Use the same F1 metric, matching algorithm, and category approach for all 14 domains.

**Pros:**
- Simplest implementation
- Uniform comparison across domains
- No domain-specific configuration needed

**Cons:**
- F1 is meaningless for test generation (should be mutation score)
- F1 is meaningless for performance (should be latency prediction accuracy)
- Generic category matching misses domain-specific relationships
- Does not reflect what domain experts consider "good performance"
- Benchmark would not be taken seriously by domain experts

**Rejection rationale:** Treating all domains identically ignores the fundamental differences in what constitutes quality in each domain. A security tool that finds SQL injections should not be evaluated the same way as a test generation tool that produces mutation-killing tests.

### Option 3: [Rejected] -- 14 Separate Evaluation Pipelines

**Description:** Build a completely separate evaluation pipeline for each domain.

**Pros:**
- Maximum domain-specific flexibility
- No compromise needed between domain requirements
- Each pipeline can be optimized independently

**Cons:**
- Massive code duplication (14 matchers, 14 metrics modules, 14 runners)
- Maintenance nightmare (bug fixes must be applied 14 times)
- No cross-domain comparison possible
- No unified scorecard
- Over-engineered; most pipeline logic is shared

**Rejection rationale:** 90% of the evaluation pipeline (corpus loading, adapter invocation, finding collection, result aggregation) is identical across domains. Only the matching customization and primary metric differ. Configuration-driven domain strategies provide specialization without duplication.

---

## Consequences

### Positive
- Each domain is evaluated by the metric that best reflects tool quality in that domain
- Category taxonomies enable accurate, domain-specific finding classification
- Matching customizations reduce false negatives caused by domain-specific location patterns
- Domain extension mechanism enables community-driven domain growth
- Cross-domain aggregate provides overall tool ranking while preserving domain-specific detail
- Evaluation gates prevent misleading partial evaluations from affecting rankings

### Negative
- 14 domain strategies represent significant design and configuration effort
- Some primary metrics (mutation score, expert agreement) are expensive to compute
- Cross-domain weights are inherently subjective and may be contested
- Domain-specific matching overrides add configuration complexity
- Extension mechanism requires governance to maintain quality standards

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Domain-specific metrics are unfair to general-purpose tools | Medium | Medium | Always report standard F1 alongside domain metric; domain metrics are supplementary |
| Cross-domain weights create controversy | High | Low | Publish weights; accept community input; allow user-configurable weights |
| New domains dilute benchmark focus | Medium | Medium | Minimum quality bar for new domains (20 samples, 2 reviewers, clear primary metric) |
| Test generation mutation scoring is computationally expensive | Medium | Medium | Cache mutation results; parallelize mutation testing |
| Visual regression requires screenshot infrastructure | Medium | Medium | Pre-rendered screenshot pairs in corpus; no runtime rendering needed |
| Some domains have too few samples for meaningful evaluation | High (initially) | Medium | Start with "provisional" status; graduate to "full" at 50% of target |

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
| Parent | ADR-001 | Bounded Context Map | Domain strategies span Corpus, Matching, and Metrics contexts |
| Uses | ADR-002 | Corpus Aggregate Design | Per-domain corpus requirements defined here |
| Customizes | ADR-005 | Matching Engine Algorithm | Per-domain matching overrides |
| Extends | ADR-006 | Metrics and Scoring | Per-domain primary metrics beyond F1 |
| Configured by | ADR-008 | CLI and API Gateway | `--domain` flag selects domain evaluation |
| Informs | ADR-009 | Corpus Data Sourcing Strategy | Per-domain sourcing priorities |
| Ranked by | ADR-011 | Leaderboard and Results | Cross-domain aggregate used in rankings |
| Bias detected by | ADR-012 | Cross-Cutting Concerns | Per-domain performance variance analysis |
| Tested by | ADR-013 | Testing Strategy | Per-domain matching and metric tests |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Domain type definition | Source Code | `harness/src/types.ts` (lines 11-25) |
| REF-002 | Corpus manifest | Data | `corpus/v0.1/manifest.json` |
| REF-003 | Matcher configuration | Source Code | `harness/src/matcher.ts` (lines 19-28) |
| REF-004 | CWE Top 25 | Standard | https://cwe.mitre.org/top25/ |
| REF-005 | WCAG 2.1 | Standard | https://www.w3.org/TR/WCAG21/ |
| REF-006 | Mutation Testing | Methodology | https://en.wikipedia.org/wiki/Mutation_testing |
| REF-007 | NDCG (Normalized Discounted Cumulative Gain) | Metric | Information retrieval ranking metric |
| REF-008 | AUC-ROC | Metric | Area under receiver operating characteristic curve |
| REF-009 | IoU (Intersection over Union) | Metric | Object detection spatial matching metric |
