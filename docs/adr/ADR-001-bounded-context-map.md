# ADR-001: Bounded Context Map -- AQB Domain Model

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-001 |
| **Initiative** | AQB Domain Model |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** building a multi-domain benchmark (AQB) that spans 14 QE domains, a seeded defect corpus, an evaluation harness, and agentic behavior measurement,

**facing** the challenge of organizing a complex system with many interacting concerns -- corpus management, tool evaluation, fuzzy matching, metrics computation, agentic protocol orchestration, leaderboard ranking, and CLI/API exposure -- into a maintainable, evolvable architecture that prevents coupling between unrelated concerns,

**we decided for** a Domain-Driven Design bounded context map with eight explicitly defined bounded contexts (Corpus Management, Evaluation Engine, Adapter Layer, Matching Engine, Metrics and Scoring, Agentic Evaluation, Leaderboard and Results, CLI and API Gateway) connected through well-defined relationships (upstream/downstream, anti-corruption layers, shared kernel),

**and neglected** (a) a monolithic single-module design because it would create tight coupling between corpus management, evaluation logic, and metrics computation making independent evolution impossible; (b) a microservices architecture because AQB is primarily a CLI benchmark tool, not a distributed system, and microservices would add deployment complexity without benefit; (c) a pure hexagonal architecture without explicit bounded contexts because it would not capture the domain relationships and translation needs between contexts,

**to achieve** clear separation of concerns enabling independent development and testing of each context, explicit translation boundaries between external tools and AQB domain types, a shared kernel of core types that ensures consistency without coupling, and a domain model that directly reflects QE benchmark terminology,

**accepting that** bounded context boundaries add indirection through mapping layers, the shared kernel creates a coordination point that requires careful governance, and the eight-context decomposition may feel over-engineered for the current codebase size but provides necessary scaffolding for the 14-domain corpus and multi-adapter ecosystem.

---

## Problem Statement

AQB encompasses multiple distinct problem domains that interact in complex ways. Without explicit boundaries, these domains tend to become entangled:

| Concern | Current State | Risk Without Boundaries |
|---------|---------------|------------------------|
| Corpus sample structure | Defined in `types.ts` as `CorpusSample` | Corpus validation logic leaks into evaluation engine |
| Tool adapter output | Each tool has unique output format | Raw tool output contaminates domain model |
| Finding-to-truth matching | Implemented in `matcher.ts` | Matching config couples to adapter-specific concerns |
| Metrics computation | Implemented in `metrics.ts` | Metrics formulas entangle with matching internals |
| Agentic evaluation | `AgenticMetrics` type defined, protocol unimplemented | Four-phase protocol couples to single-sample runner |
| Leaderboard ranking | Not yet implemented | Result storage format couples to metrics calculation |
| CLI presentation | Not yet implemented | Output formatting couples to domain logic |
| Docker execution | `dockerode` dependency exists, runner unimplemented | Container lifecycle couples to adapter logic |

The system already has nascent boundaries visible in the file structure:

```
harness/src/
  types.ts              -- Shared kernel types
  matcher.ts            -- Matching engine
  metrics.ts            -- Metrics and scoring
  adapters/
    adapter.interface.ts -- Adapter layer interface
  index.ts              -- Barrel (CLI/API gateway)
```

These need to be formalized into explicit bounded contexts with defined relationships.

### Coupling Risks

| Risk | Impact | Likelihood |
|------|--------|------------|
| Adapter output format changes break matcher | Evaluation results become unreliable | High -- tools update frequently |
| Corpus schema changes cascade to all contexts | Expensive refactoring across codebase | Medium -- schema evolves with corpus versions |
| Metrics formula changes affect leaderboard rankings | Historical comparisons become invalid | High -- metrics will be refined |
| Agentic protocol adds state that evaluation engine does not expect | Multi-phase runs produce incorrect metrics | High -- agentic eval is novel and exploratory |
| Docker runner internals leak into adapter interface | Adapters become non-portable | Medium -- abstraction boundaries unclear |

---

## Opportunity

A well-defined bounded context map enables:

| Dimension | Before (Implicit) | After (Explicit Contexts) |
|-----------|-------------------|---------------------------|
| Development parallelism | Sequential -- changes ripple | Independent context development |
| Testing isolation | Full integration tests required | Unit tests per context + integration at boundaries |
| Adapter development | Must understand entire harness | Only implement `AQBToolAdapter` interface |
| Metrics evolution | Risk breaking evaluation pipeline | Isolated change within Metrics context |
| Agentic protocol development | Must coordinate with runner internals | Clean event-driven integration |
| Corpus versioning | Ad-hoc file management | Formal aggregate with repository pattern |
| External contribution | Steep learning curve | Contribute to single context |

### Context Map Diagram (ASCII)

```
+------------------------------------------------------------------+
|                        SHARED KERNEL                              |
|  Domain, Severity, Difficulty, Language, Location, Finding,       |
|  CorpusSample, SourcingMethod, MatchType                         |
|  (harness/src/types.ts)                                          |
+------------------------------------------------------------------+
      |           |            |          |          |         |
      v           v            v          v          v         v
+-----------+ +----------+ +--------+ +--------+ +-------+ +--------+
|  CORPUS   | |EVALUATION| |ADAPTER | |MATCHING| |METRICS| |AGENTIC |
|MANAGEMENT | |  ENGINE   | | LAYER  | | ENGINE | |  &    | |  EVAL  |
|           | |          | |        | |        | |SCORING| |        |
| Aggregate | | Runner   | | ACL    | | Fuzzy  | |       | | 4-Phase|
| root:     | | Docker   | | 7 built| | match  | | P/R/F1| | Proto- |
| Corpus-   | | lifecycle| | -in    | | CWE    | | SWR   | | col    |
| Sample    | | parallel | | adapts | | alias  | | Cost  | | Learn  |
|           | | events   | |        | |        | | Cards | | Swarm  |
+-----------+ +----------+ +--------+ +--------+ +-------+ +--------+
      |           |  ^           |          ^         ^         |
      |           |  |           |          |         |         |
      |           +--+-----------+          |         |         |
      |           |  Conformist             |         |         |
      |           |  (adapts to adapter     |         |         |
      |           |   output)               |         |         |
      |           +-------------------------+         |         |
      |           |  Customer/Supplier                |         |
      |           |  (feeds matches to metrics)       |         |
      |           +-----------------------------------+         |
      |           |  Customer/Supplier                          |
      |           |  (agentic wraps evaluation)                 |
      |           +---------------------------------------------+
      |
+-----------+ +---------+
|LEADERBOARD| |  CLI &  |
| & RESULTS | |   API   |
|           | | GATEWAY |
| Ranking   | |         |
| Submission| | aqb run |
| Versioned | | aqb     |
| Anti-game | |  score  |
+-----------+ +---------+
      ^           |
      |           |
      +-----------+
      Downstream consumer
      (CLI displays leaderboard)
```

### Context Relationships

| Upstream Context | Downstream Context | Relationship Type | Translation Mechanism |
|------------------|--------------------|-------------------|-----------------------|
| Corpus Management | Evaluation Engine | Customer/Supplier | Engine requests samples via repository interface |
| Adapter Layer | Evaluation Engine | Anti-Corruption Layer | Adapter normalizes tool output into `Finding[]` |
| Evaluation Engine | Matching Engine | Customer/Supplier | Engine passes `Finding[]` + `CorpusSample` to matcher |
| Matching Engine | Metrics and Scoring | Customer/Supplier | Matcher produces `MatchedFinding[]`, `UnmatchedFinding[]`, `MissedIssue[]` |
| Evaluation Engine | Agentic Evaluation | Conformist | Agentic protocol orchestrates multiple evaluation runs |
| Metrics and Scoring | Leaderboard and Results | Customer/Supplier | Metrics produces `Scorecard`, leaderboard ranks and stores |
| All Contexts | CLI and API Gateway | Published Language | Gateway consumes published interfaces from all contexts |
| Shared Kernel | All Contexts | Shared Kernel | Core types owned collectively, changes require consensus |

---

## Summary

| Capability | Description |
|------------|-------------|
| Eight bounded contexts | Corpus, Evaluation, Adapter, Matching, Metrics, Agentic, Leaderboard, CLI |
| Shared kernel | Core domain types in `harness/src/types.ts` shared by all contexts |
| Anti-corruption layer | Adapter context translates external tool output to AQB Finding format |
| Customer/supplier chains | Evaluation -> Matching -> Metrics -> Leaderboard pipeline |
| Event-driven integration | Runner lifecycle events decouple execution from metrics |
| Published language | CLI and API Gateway consume stable public interfaces |
| Independent testability | Each context testable in isolation with boundary mocks |
| Domain ubiquitous language | Terms from QE benchmark domain used consistently across contexts |

### Bounded Context Inventory

| # | Context | Aggregate Root | Key Entities | Value Objects |
|---|---------|----------------|--------------|---------------|
| 1 | Corpus Management | `CorpusSample` | `Corpus`, `SampleFile` | `GroundTruth`, `GroundTruthIssue`, `Location`, `SampleMetadata`, `FalsePositiveMarker` |
| 2 | Evaluation Engine | `EvaluationRun` | `SampleExecution`, `RunConfiguration` | `RunEvent`, `ExecutionResult`, `ResourceLimits`, `TimeoutPolicy` |
| 3 | Adapter Layer | `AdapterRegistration` | `AQBToolAdapter` implementations | `AdapterConfig`, `NormalizedOutput`, `ToolVersion` |
| 4 | Matching Engine | `MatchResult` | `MatchedFinding`, `UnmatchedFinding`, `MissedIssue` | `MatcherConfig`, `CategoryAlias`, `LocationScore` |
| 5 | Metrics and Scoring | `Scorecard` | `AQBMetrics`, `DomainMetrics` | `SeverityWeight`, `CostEfficiency`, `ConfidenceInterval` |
| 6 | Agentic Evaluation | `AgenticRun` | `AgenticPhase`, `LearningTransferResult` | `AgenticMetrics`, `SwarmConfig`, `ExplanationScore` |
| 7 | Leaderboard and Results | `LeaderboardEntry` | `ResultSubmission`, `Ranking` | `VersionedResult`, `RankingCriteria` |
| 8 | CLI and API Gateway | N/A (thin layer) | `CLICommand`, `OutputFormatter` | `CLIOptions`, `OutputFormat`, `ExitCode` |

### Directory Mapping

| Context | Directory | Key Files |
|---------|-----------|-----------|
| Corpus Management | `harness/src/corpus/` | `repository.ts`, `validator.ts`, `versioning.ts` |
| Evaluation Engine | `harness/src/runner/` | `runner.ts`, `docker.ts`, `events.ts`, `orchestrator.ts` |
| Adapter Layer | `harness/src/adapters/` | `registry.ts`, `normalizer.ts`, per-adapter files |
| Matching Engine | `harness/src/matcher/` | `matcher.ts`, `aliases.ts`, `location.ts` |
| Metrics and Scoring | `harness/src/metrics/` | `metrics.ts`, `scorecard.ts`, `bootstrap.ts` |
| Agentic Evaluation | `harness/src/agentic/` | `protocol.ts`, `phases.ts`, `learning.ts` |
| Leaderboard and Results | `harness/src/leaderboard/` | `rankings.ts`, `submission.ts`, `versioning.ts` |
| CLI and API Gateway | `harness/src/cli/` | `cli.ts`, `commands/`, `formatters/` |
| Shared Kernel | `harness/src/` | `types.ts` |

---

## Options Considered

### Option 1: [Selected] -- DDD Bounded Context Map with Eight Contexts

**Description:** Define eight bounded contexts with explicit upstream/downstream relationships, a shared kernel for core types, and anti-corruption layers at external tool boundaries.

**Pros:**
- Clear separation of concerns aligned with distinct problem domains
- Anti-corruption layer prevents external tool volatility from contaminating domain model
- Shared kernel ensures type consistency without coupling business logic
- Customer/supplier chains make data flow direction explicit
- Each context can be developed, tested, and evolved independently
- Maps naturally to team boundaries if project grows
- Context map serves as architectural documentation

**Cons:**
- More files and directories than current flat structure
- Mapping layers add some runtime overhead (negligible for batch processing)
- Shared kernel changes require cross-context coordination
- Eight contexts may feel like over-decomposition for current team size

### Option 2: [Rejected] -- Monolithic Module Design

**Description:** Keep all logic in a flat `harness/src/` directory with files grouped by technical layer (types, logic, CLI) rather than business domain.

**Pros:**
- Simpler directory structure
- No mapping layer overhead
- Easier to understand for single-developer workflows

**Cons:**
- No explicit boundaries between concerns -- coupling grows organically
- Adapter changes can break metrics computation
- Testing requires full integration setup
- Difficult for external contributors to understand scope of changes
- Does not scale with 14 domains and 7+ adapters

**Rejection rationale:** The 14-domain, 7-adapter scope guarantees rapid growth in complexity. Without explicit boundaries, the codebase will become a tangled monolith within two corpus versions.

### Option 3: [Rejected] -- Microservices Architecture

**Description:** Deploy each context as an independent service communicating via message queues or HTTP.

**Pros:**
- Maximum isolation and independent deployability
- Language-heterogeneous implementation possible
- Independent scaling per context

**Cons:**
- AQB is a CLI benchmark tool, not a web application
- Network overhead for tool evaluation pipeline is unacceptable
- Operational complexity (service discovery, health checks, distributed tracing) far exceeds benefit
- Docker-in-Docker complexity for runner service
- Single-user local execution is the primary use case

**Rejection rationale:** Microservices solve deployment and scaling problems that AQB does not have. The primary use case is `npx aqb run` on a developer machine.

---

## Consequences

### Positive
- Each bounded context has a clear owner and responsibility
- Anti-corruption layer in the Adapter context insulates AQB from external tool API changes
- Shared kernel types (`Domain`, `Finding`, `Location`, `Severity`) provide a ubiquitous language
- Customer/supplier relationships make the evaluation pipeline direction explicit: Corpus -> Runner -> Adapter -> Matcher -> Metrics -> Scorecard -> Leaderboard
- Context boundaries align with testing boundaries: unit tests within context, integration tests at boundaries
- New domains (15+) and new adapters can be added within their respective contexts without cross-cutting changes
- The context map serves as onboarding documentation for contributors

### Negative
- Eight contexts for a TypeScript monorepo may feel like architectural overhead
- Refactoring existing `matcher.ts` and `metrics.ts` into context directories requires migration effort
- Shared kernel governance requires discipline -- any type change in `types.ts` affects all contexts
- Anti-corruption layer in adapters adds translation code that could contain bugs

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Shared kernel type changes break multiple contexts | Medium | High | Zod schema validation at boundaries; CI runs all context tests on `types.ts` changes |
| Context boundaries drawn incorrectly | Low | Medium | Revisit context map at each corpus version release; ADR review cadence |
| Over-engineering slows initial development | Medium | Medium | Start with logical boundaries (directories), defer physical separation until needed |
| Anti-corruption layer in adapters becomes bottleneck | Low | Low | Keep translation simple; use Zod parse for validation, not complex mapping |

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
| Enables | ADR-002 | Corpus Aggregate Design | Defines the Corpus Management bounded context internals |
| Enables | ADR-003 | Evaluation Engine Runner Architecture | Defines the Evaluation Engine bounded context |
| Enables | ADR-004 | Adapter Layer Anti-Corruption Pattern | Defines the Adapter Layer bounded context |
| Enables | ADR-005 | Matching Engine Algorithm | Defines the Matching Engine bounded context |
| Enables | ADR-006 | Metrics and Scoring | Defines the Metrics and Scoring bounded context |
| Enables | ADR-007 | Agentic Evaluation Protocol | Defines the Agentic Evaluation bounded context |
| Enables | ADR-008 | CLI and API Gateway Design | Defines the CLI and API Gateway bounded context |
| Enables | ADR-011 | Leaderboard and Results | Defines the Leaderboard bounded context |
| Related | ADR-012 | Cross-Cutting Concerns | Concerns that span multiple contexts |
| Related | ADR-009 | Corpus Data Sourcing Strategy | Sourcing methods for corpus samples across all contexts |
| Related | ADR-010 | Docker Isolation and Reproducibility | Infrastructure isolation for evaluation engine |
| Related | ADR-013 | Testing Strategy | Testing approach spanning all bounded contexts |
| Related | ADR-014 | Domain-Specific Evaluation Strategies | Per-domain evaluation customization across contexts |
| Related | ADR-015 | Held-Out Corpus Security Model | Security model for held-out test set protection |
| Related | ADR-016 | Error Handling and Recovery Strategy | Error classification and recovery across bounded contexts |
| Related | ADR-017 | CI/CD Pipeline Design | Continuous integration and delivery for all contexts |
| Related | ADR-018 | Versioning and Migration Strategy | Version management across shared kernel and corpus |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | Eric Evans, Domain-Driven Design (2003) | Book | External |
| REF-002 | Vaughn Vernon, Implementing Domain-Driven Design (2013) | Book | External |
| REF-003 | AQB Proposal | Design Document | `docs/proposal.md` |
| REF-004 | Core Types | Source Code | `harness/src/types.ts` |
| REF-005 | Matcher Implementation | Source Code | `harness/src/matcher.ts` |
| REF-006 | Metrics Implementation | Source Code | `harness/src/metrics.ts` |
| REF-007 | Adapter Interface | Source Code | `harness/src/adapters/adapter.interface.ts` |
| REF-008 | Context Mapping Pattern | Pattern | Upstream/Downstream, ACL, Shared Kernel, Conformist |
