# ADR-003: Evaluation Engine -- Runner Architecture

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-003 |
| **Initiative** | Evaluation Engine |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** evaluating QE tools against the AQB corpus by running each tool adapter against every applicable sample and collecting findings for matching and metrics,

**facing** the challenge of ensuring deterministic, reproducible evaluation runs across diverse tools (static analyzers, LLM agents, accessibility scanners) that have different runtime requirements (Node.js, Python, Java, Go), while managing execution timeouts, resource limits, parallel orchestration, and result aggregation across 1,680+ samples,

**we decided for** a Docker-based isolated runner architecture with configurable parallelism (default: 4 concurrent containers), per-sample container lifecycle (load, inject, execute, collect, teardown), timeout policies stratified by complexity (30s/120s/300s), resource limits per container, an event-driven lifecycle model, and a non-Docker fallback mode for lightweight adapters,

**and neglected** (a) a bare-metal runner executing all tools in the host process because it cannot guarantee isolation between tools or reproducibility across environments; (b) a Kubernetes-based orchestrator because it adds cluster management overhead that is unjustified for a CLI benchmark tool; (c) a serverless/Lambda runner because cold start latency and execution time limits conflict with tool evaluation needs,

**to achieve** deterministic execution regardless of host environment, reproducible results through pinned Docker images and locked tool versions, safe parallel execution without resource contention, configurable resource policies that prevent runaway tools from affecting other evaluations, and a clean event model for progress reporting and result aggregation,

**accepting that** Docker adds startup overhead per sample (approximately 1-3 seconds per container), requires Docker daemon availability on the host, increases disk usage for base images, and the non-Docker fallback creates a two-path code that must be tested independently.

---

## Problem Statement

Tool evaluation requires executing diverse external tools against code samples. Each tool has distinct requirements:

| Tool | Runtime | Dependencies | Typical Execution Time | Resource Needs |
|------|---------|-------------|----------------------|----------------|
| Semgrep | Python | semgrep CLI + rules | 2-10s per file | Low (200MB RAM) |
| ESLint | Node.js | eslint + plugins | 1-5s per file | Low (150MB RAM) |
| SonarQube | Java | SonarQube scanner + server | 30-120s per project | High (2GB+ RAM) |
| CodeQL | Multi | CodeQL CLI + database | 60-300s per project | High (4GB+ RAM) |
| axe-core | Node.js | puppeteer/playwright + axe | 5-30s per page | Medium (512MB RAM) |
| AQE Agent | Node.js | LLM API access | 10-60s per sample | Medium (network-bound) |
| LLM Raw | None | LLM API access | 5-30s per sample | Low (network-bound) |

### Current Gaps

| Aspect | Status | Gap |
|--------|--------|-----|
| Docker execution | `dockerode` dependency in `package.json` | No runner implementation |
| Container lifecycle | Not defined | No load/inject/execute/collect/teardown pipeline |
| Parallelism | Not implemented | No concurrent execution support |
| Timeout handling | Not implemented | Runaway tools can block indefinitely |
| Resource limits | Not defined | Tools can consume unbounded host resources |
| Result aggregation | `AQBResult` type defined | No pipeline from per-sample to aggregate results |
| Progress reporting | Not implemented | No visibility into long-running evaluations |
| Non-Docker mode | Not considered | Lightweight tools forced through Docker overhead |

### Execution Flow Gap Analysis

```
Current:  CorpusSample --> [???] --> Finding[]
                           No runner pipeline exists

Required: CorpusSample --> Runner --> Docker Container --> Adapter --> Finding[]
                           |              |                    |
                           +-- Timeout    +-- Resource Limits  +-- Output Normalization
                           +-- Parallel   +-- File Injection   +-- Error Isolation
                           +-- Events     +-- Teardown         +-- Crash Recovery
```

---

## Opportunity

A well-designed runner architecture transforms AQB from a library into a complete evaluation platform.

| Dimension | Before | After |
|-----------|--------|-------|
| Tool execution | Manual/ad-hoc | Automated per-sample Docker execution |
| Reproducibility | Depends on host | Deterministic via pinned Docker images |
| Parallelism | Sequential only | Configurable concurrent execution (1-16) |
| Resource control | Unbounded | Per-container memory and CPU limits |
| Timeout safety | None | Per-sample timeout with graceful kill |
| Progress visibility | None | Event stream with progress bar and ETA |
| Error isolation | Tool crash kills evaluation | Container crash contained, run continues |
| Result pipeline | Manual aggregation | Automatic per-sample to aggregate pipeline |

### Runner Lifecycle (Per Sample)

```
  +--[1. Load Sample]
  |  Read CorpusSample from repository
  |  Filter by domain/language/difficulty
  |
  +--[2. Start Container]
  |  Pull/use cached Docker image for adapter
  |  Apply resource limits (memory, CPU)
  |  Mount sample files read-only
  |
  +--[3. Inject Files]
  |  Write sample.files[] to container /workspace/
  |  Set environment variables (sample ID, domain)
  |
  +--[4. Execute Adapter]
  |  Run adapter analyze() inside container
  |  Stream stdout/stderr for logging
  |  Enforce timeout (kill container if exceeded)
  |
  +--[5. Collect Findings]
  |  Read Finding[] from container stdout (JSON)
  |  Validate findings against Zod schema
  |  Record execution latency
  |
  +--[6. Teardown]
  |  Stop and remove container
  |  Clean up temporary volumes
  |  Emit SampleCompleted or SampleFailed event
  |
  +--[7. Continue or Aggregate]
     If more samples: go to step 1
     If all done: aggregate results
```

### Event Model

| Event | Payload | When |
|-------|---------|------|
| `RunStarted` | `{ run_id, adapter, corpus_version, total_samples, config }` | Evaluation begins |
| `SampleQueued` | `{ sample_id, domain, position_in_queue }` | Sample enters execution queue |
| `SampleStarted` | `{ sample_id, container_id, start_time }` | Container started for sample |
| `SampleCompleted` | `{ sample_id, findings_count, latency_ms, container_id }` | Adapter finished successfully |
| `SampleFailed` | `{ sample_id, error, error_type, latency_ms }` | Adapter crashed or timed out |
| `SampleSkipped` | `{ sample_id, reason }` | Sample filtered out or adapter not applicable |
| `RunCompleted` | `{ run_id, total_evaluated, total_failed, total_skipped, elapsed_ms }` | All samples processed |

---

## Summary

| Capability | Description |
|------------|-------------|
| Docker isolation | Each sample evaluated in a dedicated container for deterministic execution |
| Configurable parallelism | 1-16 concurrent containers (default: 4) using semaphore-based concurrency control |
| Timeout policies | 30s default, 120s for complex tools (SonarQube), 300s for multi-agent scenarios |
| Resource limits | Per-container memory (512MB default, 2GB for Java) and CPU (1 core default) limits |
| Event-driven lifecycle | Seven event types enable progress reporting, logging, and error tracking |
| Result aggregation | Per-sample findings aggregated through matcher and metrics pipeline |
| Non-Docker fallback | Lightweight adapters (ESLint, llm-raw) can run in-process without Docker |
| Crash recovery | Container failures isolated; run continues with remaining samples |
| Reproducibility | Pinned image tags, locked tool versions, deterministic sample ordering |

### Resource Limit Profiles

| Profile | Memory | CPU | Timeout | Used By |
|---------|--------|-----|---------|---------|
| `lightweight` | 256MB | 0.5 | 30s | eslint, llm-raw |
| `standard` | 512MB | 1.0 | 60s | semgrep, axe-core, aqe |
| `heavy` | 2GB | 2.0 | 120s | sonarqube, codeql |
| `agentic` | 1GB | 1.0 | 300s | Multi-agent scenarios |

### Parallel Execution Strategy

```
Concurrency Pool (default: 4 slots)
+--------+--------+--------+--------+
| Slot 1 | Slot 2 | Slot 3 | Slot 4 |
| sec-001| sec-002| def-001| acc-001|
+--------+--------+--------+--------+
     |        |        |        |
     v        v        v        v
  [Done]   [Done]   [Done]   [Done]
     |        |        |        |
     v        v        v        v
| sec-003| sec-004| def-002| acc-002|  <-- next samples fill freed slots
+--------+--------+--------+--------+
```

---

## Options Considered

### Option 1: [Selected] -- Docker-based Isolated Runner with Non-Docker Fallback

**Description:** Use Docker containers for full isolation with configurable resource limits and timeouts, while providing a non-Docker execution path for lightweight adapters that don't need isolation.

**Pros:**
- Full isolation between tool executions prevents cross-contamination
- Reproducible across environments (same Docker image = same behavior)
- Resource limits prevent runaway tools from affecting host or other samples
- Timeout enforcement via container kill is reliable
- `dockerode` already in package dependencies
- Non-Docker path enables quick development iteration for simple adapters
- Supports heterogeneous tool runtimes (Node.js, Python, Java, Go)

**Cons:**
- Docker adds 1-3 seconds startup overhead per container
- Requires Docker daemon on host machine
- Base images consume disk space (node:20-slim ~200MB, eclipse-temurin:21 ~400MB)
- Non-Docker fallback creates dual execution paths to test
- Docker-in-Docker not supported (CI runners that are themselves containers)

### Option 2: [Rejected] -- Bare-metal Host Execution

**Description:** Run all tool adapters directly in the host Node.js process without isolation.

**Pros:**
- Zero startup overhead
- No Docker dependency
- Simplest implementation

**Cons:**
- No isolation -- tool crashes kill the entire evaluation
- Resource limits impossible to enforce
- Environment differences between hosts produce different results
- Java/Go tools cannot run in Node.js process
- State leakage between sample evaluations possible

**Rejection rationale:** Without isolation, a single adapter crash terminates the entire evaluation run, and environment differences make results non-reproducible. This is unacceptable for a benchmark.

### Option 3: [Rejected] -- Kubernetes Job Orchestration

**Description:** Submit each sample evaluation as a Kubernetes Job, using the cluster scheduler for parallelism and resource management.

**Pros:**
- Built-in resource management and scheduling
- Horizontal scaling across cluster nodes
- Built-in retry and failure handling
- Centralized logging

**Cons:**
- Requires a Kubernetes cluster (massive overhead for a CLI tool)
- Not suitable for local developer execution
- Adds etcd, API server, scheduler dependencies
- Network latency between pods and corpus storage
- Over-engineered for the use case

**Rejection rationale:** AQB's primary use case is `npx aqb run` on a developer machine. Requiring a Kubernetes cluster is antithetical to the benchmark's accessibility goals.

---

## Consequences

### Positive
- Every sample evaluation is isolated in its own container, preventing state leakage
- Tools written in different languages (Python, Java, Go) are supported through language-specific Docker images
- Timeout enforcement is reliable: `container.kill()` is a guaranteed termination mechanism
- Parallel execution reduces total evaluation time from (N * avg_time) to approximately (N / concurrency * avg_time)
- Event model enables rich progress reporting (progress bar, ETA, live domain metrics)
- Non-Docker fallback enables fast iteration during adapter development
- Result aggregation pipeline is automatic: per-sample -> per-domain -> aggregate -> scorecard

### Negative
- Docker startup overhead increases total evaluation time by approximately (N * 2 seconds)
- For 1,680 samples at 4 concurrency: overhead is approximately (1680 / 4 * 2s) = 14 minutes of container startup
- Requires Docker daemon installed and running on host
- Dual execution paths (Docker and non-Docker) increase testing surface
- Large Docker images must be pulled on first run (total ~2GB for all base images)

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Docker daemon unavailable on host | Medium | High | Clear error message with setup instructions; non-Docker fallback for supported adapters |
| Container startup overhead unacceptable | Low | Medium | Use pre-warmed container pool; reuse containers for same adapter across samples |
| Docker image pull fails (network issue) | Medium | Medium | Pre-pull images during `aqb setup`; cache images locally |
| Resource limits too restrictive for tool | Medium | Low | Configurable per-adapter profiles; `--unlimited` flag for debugging |
| Non-Docker fallback produces different results | Low | High | Run conformance tests comparing Docker and non-Docker execution |
| Parallel execution causes port conflicts | Low | Low | Assign random ports per container; use Docker networking |

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
| Parent | ADR-001 | Bounded Context Map | Evaluation Engine is a bounded context defined in ADR-001 |
| Consumes | ADR-002 | Corpus Aggregate Design | Runner loads samples via CorpusRepository |
| Integrates | ADR-004 | Adapter Layer Anti-Corruption Pattern | Runner invokes adapters through ACL interface |
| Feeds | ADR-005 | Matching Engine Algorithm | Runner passes findings to matcher |
| Feeds | ADR-006 | Metrics and Scoring | Matcher results flow to metrics computation |
| Extended by | ADR-007 | Agentic Evaluation Protocol | Multi-phase agentic protocol orchestrates multiple runner invocations |
| Uses | ADR-010 | Docker Isolation and Reproducibility | Docker configuration and image management |
| Exposed by | ADR-008 | CLI and API Gateway | CLI invokes runner through programmatic API |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | dockerode npm package | Library | https://www.npmjs.com/package/dockerode |
| REF-002 | AQBToolAdapter interface | Source Code | `harness/src/types.ts` (lines 110-122) |
| REF-003 | AQBResult type | Source Code | `harness/src/types.ts` (lines 147-167) |
| REF-004 | Package.json dependencies | Configuration | `harness/package.json` |
| REF-005 | Docker resource constraints | Documentation | https://docs.docker.com/config/containers/resource_constraints/ |
