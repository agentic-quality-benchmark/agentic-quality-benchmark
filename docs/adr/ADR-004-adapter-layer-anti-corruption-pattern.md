# ADR-004: Adapter Layer -- Anti-Corruption Pattern

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-004 |
| **Initiative** | Adapter Layer |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** integrating seven diverse QE tools (AQE, Semgrep, ESLint, SonarQube, CodeQL, axe-core, llm-raw) into the AQB evaluation harness, where each tool has its own output format, severity taxonomy, category naming conventions, and error reporting style,

**facing** the challenge of translating heterogeneous tool outputs into the unified AQB `Finding[]` format without allowing external tool API changes to propagate into the core domain model, while supporting dynamic adapter discovery, versioning of both adapters and underlying tools, crash isolation, and a clear extension path for community-contributed adapters,

**we decided for** an Anti-Corruption Layer (ACL) pattern where each adapter implementation translates between its tool's native output format and the AQB `Finding` interface, with an adapter registry for dynamic discovery, a three-stage normalization pipeline (raw output -> parsed intermediate -> validated Finding[]), per-adapter configuration schemas, and error isolation boundaries that prevent adapter failures from corrupting evaluation results,

**and neglected** (a) a direct integration approach where tools are invoked and their output parsed inline in the evaluation engine because it creates tight coupling between the engine and every tool's output format; (b) a universal output format that all tools must conform to because tool vendors will not adopt an AQB-specific format; (c) a plugin architecture with dynamic loading because it adds runtime complexity and security concerns without clear benefit over static adapter registration,

**to achieve** complete isolation between external tool volatility and the AQB domain model, a consistent `Finding[]` output regardless of which tool produced it, clear error attribution when tool integration fails, a straightforward path for adding new adapters, and the ability to version adapters independently of the harness,

**accepting that** each new tool requires a dedicated adapter implementation, the normalization pipeline adds latency (typically 10-50ms per sample, negligible relative to tool execution time), and adapter authors must understand both the tool's output format and the AQB Finding schema.

---

## Problem Statement

Each QE tool produces output in a unique format with different conventions for severity, location, and issue categorization:

| Tool | Output Format | Severity Scale | Location Format | Category Convention |
|------|--------------|----------------|-----------------|---------------------|
| Semgrep | JSON (SARIF or native) | ERROR, WARNING, INFO | file:line:column | Rule ID (e.g., `python.lang.security.audit.exec-detected`) |
| ESLint | JSON | error, warn, off | file:line:column | Rule ID (e.g., `no-eval`, `security/detect-eval-with-expression`) |
| SonarQube | JSON via Web API | BLOCKER, CRITICAL, MAJOR, MINOR, INFO | file:startLine:startOffset:endLine:endOffset | Rule key (e.g., `typescript:S3649`) |
| CodeQL | SARIF JSON | error, warning, note | file:startLine:startColumn:endLine:endColumn | Query ID (e.g., `js/sql-injection`) |
| axe-core | JSON | critical, serious, moderate, minor | CSS selector + HTML snippet | Rule ID (e.g., `color-contrast`, `image-alt`) |
| AQE Agent | JSON (AQE protocol) | critical, high, medium, low, info | file:line_start:line_end | Domain-specific categories |
| LLM Raw | Unstructured text or JSON | Variable | Variable | Variable |

### Translation Challenges

| Challenge | Example | Impact Without ACL |
|-----------|---------|--------------------|
| Severity mapping | SonarQube BLOCKER -> AQB critical? | Inconsistent severity-weighted recall across tools |
| Category normalization | Semgrep `exec-detected` vs CWE-78 vs CodeQL `js/code-injection` | Matcher cannot compare findings across tools |
| Location format differences | axe-core uses CSS selectors, not line numbers | Location matching impossible for accessibility domain |
| Output format parsing | LLM raw output may be unstructured text | Finding extraction requires LLM-specific parsing |
| Error handling | SonarQube API timeout vs Semgrep parse failure | Error attribution lost if handled generically |
| Version coupling | Semgrep 1.x vs 2.x output format changes | Tool update breaks evaluation without adapter update |

### Current State

| Component | Status | Gap |
|-----------|--------|-----|
| `AQBToolAdapter` interface | Defined in `types.ts` | Interface only; no implementations |
| `adapter.interface.ts` | Re-exports interface from `types.ts` | No registry, no discovery, no normalization pipeline |
| Adapter implementations | None | All 7 adapters need to be built |
| Output normalization | Not designed | No pipeline for raw -> parsed -> Finding[] |
| Error isolation | Not designed | No crash boundary between adapter and runner |
| Adapter configuration | Not designed | No schema for per-adapter settings |

---

## Opportunity

The ACL pattern transforms adapter integration from ad-hoc parsing into a structured translation layer.

| Dimension | Before | After |
|-----------|--------|-------|
| Output format changes | Breaks evaluation pipeline | Contained within adapter's translation logic |
| New tool integration | Modify evaluation engine | Implement adapter interface + register |
| Severity consistency | Each tool's scale used as-is | Unified AQB severity through mapping tables |
| Category normalization | Manual CWE lookup | Adapter maps tool categories to AQB categories |
| Error attribution | Generic "tool failed" | Specific adapter error with tool context |
| Testing | Full integration required | Unit test adapter translation in isolation |

### Normalization Pipeline

```
+-------------------+     +-------------------+     +-------------------+
| Stage 1: Raw      |     | Stage 2: Parsed   |     | Stage 3: Validated|
|                   |     |                   |     |                   |
| Tool executes     | --> | Adapter parses    | --> | Zod validates     |
| Native output     |     | tool-specific     |     | Finding[] against |
| (SARIF, JSON,     |     | format into       |     | schema            |
|  text, API resp)  |     | intermediate      |     |                   |
|                   |     | representation    |     | Invalid findings  |
| Collected from    |     |                   |     | logged + dropped  |
| container stdout  |     | Maps severity,    |     |                   |
| or API response   |     | category, location|     | Valid Finding[]   |
|                   |     | to AQB types      |     | returned          |
+-------------------+     +-------------------+     +-------------------+
```

### Adapter Registry

```
AdapterRegistry
|
+-- register(name: string, factory: AdapterFactory): void
+-- get(name: string): AQBToolAdapter
+-- list(): AdapterInfo[]
+-- has(name: string): boolean
|
+-- Built-in adapters (registered at startup):
|   +-- "aqe"       -> AQEAdapter
|   +-- "semgrep"   -> SemgrepAdapter
|   +-- "eslint"    -> ESLintAdapter
|   +-- "sonarqube" -> SonarQubeAdapter
|   +-- "codeql"    -> CodeQLAdapter
|   +-- "axe"       -> AxeAdapter
|   +-- "llm-raw"   -> LLMRawAdapter
|
+-- External adapters (discovered from config):
    +-- Loaded from node_modules or local path
    +-- Must export AQBToolAdapter implementation
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Anti-corruption layer | Each adapter translates between native tool output and AQB Finding format |
| Three-stage normalization | Raw output -> parsed intermediate -> validated Finding[] |
| Adapter registry | Dynamic discovery and registration of built-in and external adapters |
| Severity mapping tables | Tool-specific severity values mapped to AQB Severity enum |
| Category mapping | Tool rule IDs mapped to AQB categories (with CWE aliases from ADR-005) |
| Error isolation | Adapter failures contained by try/catch boundary with structured error reporting |
| Per-adapter configuration | Zod-validated config schemas for tool-specific settings |
| Adapter versioning | Adapter version (AQB harness) + tool version (underlying tool) tracked independently |

### Severity Mapping Tables

| AQB Severity | Semgrep | ESLint | SonarQube | CodeQL | axe-core |
|-------------|---------|--------|-----------|--------|----------|
| `critical` | ERROR (security rules) | error (security) | BLOCKER | error | critical |
| `high` | ERROR (other) | error (other) | CRITICAL | error | serious |
| `medium` | WARNING | warn | MAJOR | warning | moderate |
| `low` | INFO | off (when reported) | MINOR | note | minor |
| `info` | -- | -- | INFO | -- | -- |

### Seven Built-in Adapters

| Adapter | Tool | Docker Image | Key Translation Logic |
|---------|------|-------------|----------------------|
| `aqe` | AQE Agent | `node:20-slim` | AQE Finding format -> AQB Finding (minimal translation; shared domain model) |
| `semgrep` | Semgrep OSS | `returntocorp/semgrep:latest` | SARIF/JSON output -> Finding[]; rule ID -> CWE/category mapping |
| `eslint` | ESLint | `node:20-slim` (non-Docker ok) | ESLint JSON formatter output -> Finding[]; rule -> category mapping |
| `sonarqube` | SonarQube | `sonarqube:lts-community` | Web API issues endpoint -> Finding[]; SonarQube severity -> AQB severity |
| `codeql` | CodeQL | `ghcr.io/github/codeql-action` | SARIF output -> Finding[]; query ID -> CWE mapping |
| `axe` | axe-core | `node:20-slim` | axe-core results -> Finding[]; CSS selector -> line number estimation |
| `llm-raw` | Any LLM | `node:20-slim` (non-Docker ok) | Unstructured LLM output -> Finding[]; structured extraction with fallback parsing |

### Adapter Configuration Schema

```
AdapterConfig
|
+-- name: string              -- Adapter identifier
+-- toolVersion: string       -- Underlying tool version constraint
+-- dockerImage?: string      -- Override default Docker image
+-- resourceProfile?: string  -- Override resource limits (lightweight/standard/heavy)
+-- timeout?: number          -- Override default timeout (ms)
+-- toolConfig?: object       -- Tool-specific configuration passed through
|   +-- Semgrep: { rules: string[], config: string }
|   +-- ESLint: { config: string, plugins: string[] }
|   +-- SonarQube: { serverUrl: string, token: string, qualityProfile: string }
|   +-- CodeQL: { language: string, queries: string[] }
|   +-- axe: { standard: "WCAG2A" | "WCAG2AA" | "WCAG2AAA", tags: string[] }
|   +-- LLM: { model: string, provider: string, temperature: number, systemPrompt: string }
```

---

## Options Considered

### Option 1: [Selected] -- Anti-Corruption Layer with Adapter Registry

**Description:** Each adapter is a dedicated class implementing `AQBToolAdapter` that translates between its tool's native output and the AQB Finding format. An adapter registry enables dynamic discovery and configuration.

**Pros:**
- Tool output format changes are contained within the adapter
- Each adapter can be unit tested with fixture data
- Registry pattern supports community-contributed adapters
- Three-stage normalization catches errors at each stage
- Severity and category mapping tables are explicit and auditable
- Adapter versioning separates harness version from tool version

**Cons:**
- Each new tool requires a full adapter implementation
- Mapping tables must be maintained as tools evolve
- Adapter code may duplicate common patterns (extractable to base class)

### Option 2: [Rejected] -- Direct Tool Invocation in Evaluation Engine

**Description:** Parse tool output directly in the runner/evaluation engine without a separate adapter layer.

**Pros:**
- Fewer files and abstractions
- No adapter interface to implement

**Cons:**
- Runner becomes coupled to every tool's output format
- Adding a new tool requires modifying the runner
- Testing requires running actual tools
- No clear error attribution

**Rejection rationale:** Tight coupling between the runner and tool output formats violates the bounded context separation established in ADR-001 and makes the system fragile to tool updates.

### Option 3: [Rejected] -- Dynamic Plugin Architecture with Runtime Loading

**Description:** Load adapter implementations at runtime from node_modules or specified paths using `require()` or `import()`.

**Pros:**
- Maximum flexibility for external adapters
- No rebuild required to add adapters
- Community can publish adapter packages

**Cons:**
- Security risk: arbitrary code execution from loaded modules
- Difficult to type-check at compile time
- Version compatibility challenges between harness and plugins
- Debugging runtime loading issues is complex
- Over-engineered for seven known adapters

**Rejection rationale:** The seven built-in adapters cover the primary use case. Static registration with factory pattern provides adequate extensibility without the security and debugging complexity of dynamic loading.

---

## Consequences

### Positive
- External tool output format changes are absorbed by the adapter layer without affecting the matching engine or metrics
- The `Finding[]` contract is guaranteed at the adapter boundary via Zod validation
- New tools can be integrated by implementing a single interface and registering with the registry
- Adapter unit tests with fixture data provide fast feedback without running actual tools
- Severity mapping tables make cross-tool comparison fair and auditable
- Error isolation prevents adapter crashes from terminating evaluation runs

### Negative
- Seven adapter implementations represent significant initial development effort
- Severity mapping tables are subjective (is SonarQube BLOCKER equivalent to AQB critical?)
- LLM-raw adapter is inherently unreliable due to unstructured output
- axe-core CSS selector to line number translation is approximate

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Tool output format changes break adapter | Medium | Medium | Pin tool versions in Docker images; adapter tests with real tool output fixtures |
| Severity mapping disagreement | Medium | Low | Document mapping rationale; allow per-adapter severity override in config |
| LLM-raw adapter fails to parse output | High | Low | Graceful degradation: return empty findings with warning; structured prompt engineering |
| axe-core line number estimation inaccurate | Medium | Medium | Use source-mapped HTML for line correlation; accept approximate matching for accessibility domain |
| Community adapter quality varies | Low | Medium | Adapter conformance test suite; require Zod validation pass before findings accepted |
| Adapter configuration contains secrets (API keys) | Medium | High | Never log adapter config; support environment variable references in config |

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
| Parent | ADR-001 | Bounded Context Map | Adapter Layer is a bounded context defined in ADR-001 |
| Consumed by | ADR-003 | Evaluation Engine Runner Architecture | Runner invokes adapters through ACL interface |
| Feeds | ADR-005 | Matching Engine Algorithm | Adapter output (Finding[]) is input to matcher |
| Uses categories from | ADR-005 | Matching Engine Algorithm | CWE alias map used for category normalization |
| Configured by | ADR-008 | CLI and API Gateway | CLI passes adapter selection and configuration |
| Dockerized by | ADR-010 | Docker Isolation and Reproducibility | Each adapter has a Docker image definition |
| Tested by | ADR-013 | Testing Strategy | Adapter tests with fixture data |
| Domain-specific by | ADR-014 | Domain-Specific Evaluation | Per-domain adapter behavior customization |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | AQBToolAdapter interface | Source Code | `harness/src/types.ts` (lines 110-122) |
| REF-002 | Finding interface | Source Code | `harness/src/types.ts` (lines 95-106) |
| REF-003 | Adapter interface re-export | Source Code | `harness/src/adapters/adapter.interface.ts` |
| REF-004 | SARIF specification | Standard | https://sarifweb.azurewebsites.net/ |
| REF-005 | Anti-Corruption Layer pattern | Pattern | Eric Evans, DDD Ch. 14 |
| REF-006 | Semgrep output format | Documentation | https://semgrep.dev/docs/writing-rules/rule-syntax |
| REF-007 | axe-core API | Documentation | https://www.deque.com/axe/core-documentation/api-documentation/ |
