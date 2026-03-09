# ADR-010: Docker Isolation and Reproducibility

| Field | Value |
|-------|-------|
| **Decision ID** | ADR-010 |
| **Initiative** | Docker Isolation |
| **Proposed By** | Architecture Team |
| **Date** | 2026-03-09 |
| **Status** | Proposed |

---

## ADR (WH(Y) Statement format)

**In the context of** executing diverse QE tools (static analyzers, LLM agents, accessibility scanners) against corpus samples in a way that produces identical results regardless of the host environment, operating system, installed toolchains, or execution order,

**facing** the challenge of supporting tools written in four different runtimes (Node.js, Python, Java, Go), preventing resource contention between concurrent evaluations, enforcing timeout and memory limits that prevent runaway processes from affecting the host, ensuring that tool state from one sample evaluation does not leak into the next, and supporting both local development (where Docker overhead should be minimizable) and CI/CD (where reproducibility is paramount),

**we decided for** per-sample Docker container isolation using language-specific base images (node:20-slim, python:3.12-slim, eclipse-temurin:21, golang:1.22) with pinned image tags, tool-specific Dockerfiles in the `docker/` directory, configurable resource limits (memory and CPU per container), timeout enforcement via container kill with grace period, read-only volume mounting for corpus files with writable /tmp for tool output, a non-Docker fallback for lightweight adapters, and reproducibility guarantees through pinned image tags, locked tool versions, and deterministic sample ordering,

**and neglected** (a) virtual machine isolation because VMs have unacceptable startup overhead (30-60 seconds vs 1-3 seconds for containers); (b) process-level isolation (cgroups/namespaces directly) because it requires root access and platform-specific code; (c) WebAssembly sandboxing because most QE tools do not compile to WASM and the ecosystem is immature for this use case,

**to achieve** deterministic, reproducible evaluation results across all host environments, safe parallel execution with resource limits that prevent container interference, support for heterogeneous tool runtimes through language-specific images, clean isolation between sample evaluations with no state leakage, and a practical non-Docker path for rapid adapter development,

**accepting that** Docker adds 1-3 seconds startup overhead per container, requires Docker daemon installation on the host, consumes disk space for base images (approximately 2GB total for all base images), and the non-Docker fallback does not provide the same level of isolation or reproducibility.

---

## Problem Statement

QE tools have diverse runtime requirements and execution characteristics that create reproducibility challenges:

| Tool | Runtime | System Dependencies | Execution Model | State |
|------|---------|-------------------|-----------------|-------|
| Semgrep | Python 3.9+ | semgrep CLI binary, rules packages | CLI subprocess | Stateless per-run |
| ESLint | Node.js 18+ | eslint package, plugins, config | In-process | Stateless per-run |
| SonarQube | Java 17+ | SonarQube server + scanner CLI | Client-server | Server has persistent state |
| CodeQL | Multi-runtime | CodeQL CLI + database extraction | CLI with database | Database per-project |
| axe-core | Node.js 18+ | Puppeteer/Playwright, Chromium | Browser automation | Stateless per-page |
| AQE Agent | Node.js 20+ | LLM API client, memory store | API calls + local state | Stateful (memory) |
| LLM Raw | Any | HTTP client | API calls | Stateless |

### Reproducibility Risks Without Docker

| Risk | Description | Impact |
|------|-------------|--------|
| Tool version mismatch | Host has Semgrep 1.50, CI has 1.60 | Different findings |
| Missing dependencies | Host lacks Java 17 for SonarQube | Adapter fails on some machines |
| State leakage | Tool writes temp files that affect next run | Non-deterministic results |
| Resource contention | Four parallel tools exhaust host memory | OOM kills, partial results |
| OS differences | macOS vs Linux vs Windows path handling | Different file matching behavior |
| Environment variables | JAVA_HOME, NODE_PATH differ | Tool behavior changes |
| Concurrent port conflicts | Two SonarQube instances bind same port | Adapter failures |

### Current State

| Component | Status | Location |
|-----------|--------|----------|
| dockerode dependency | In package.json | `harness/package.json` line 33 |
| Docker directory | Not created | `docker/` does not exist |
| Dockerfiles | None | No tool-specific Dockerfiles |
| Resource limit configuration | Not defined | No profiles or defaults |
| Timeout enforcement | Not implemented | No container kill mechanism |
| Volume mounting | Not designed | No corpus file injection strategy |
| Image tag pinning | Not defined | No version pinning strategy |
| Non-Docker fallback | Not implemented | No alternative execution path |

---

## Opportunity

Docker-based isolation transforms AQB from an environment-dependent tool into a reproducible benchmark platform.

| Dimension | Before | After |
|-----------|--------|-------|
| Reproducibility | Depends on host environment | Identical results across all environments |
| Tool versioning | Host-installed tools may vary | Pinned versions in Docker images |
| Resource control | Unbounded host resource usage | Per-container memory and CPU limits |
| State isolation | Potential leakage between runs | Clean container per sample; no shared state |
| Parallel safety | Port conflicts, file locks possible | Container networking isolates each execution |
| Multi-language | Must install all runtimes on host | Each image has its runtime pre-installed |
| CI/CD | Complex setup scripts required | `docker pull` + `npx aqb run` |

### Docker Image Architecture

```
Base Images (language-specific)
+---------------------+  +---------------------+  +---------------------+  +---------------------+
| node:20-slim        |  | python:3.12-slim    |  | eclipse-temurin:21  |  | golang:1.22         |
| ~200MB              |  | ~150MB              |  | ~400MB              |  | ~350MB              |
| For: ESLint, axe,   |  | For: Semgrep        |  | For: SonarQube,     |  | For: Go adapters    |
|   AQE, LLM-raw      |  |                     |  |   CodeQL (Java)     |  |                     |
+---------------------+  +---------------------+  +---------------------+  +---------------------+
         |                         |                         |                         |
         v                         v                         v                         v
Tool-Specific Dockerfiles (docker/ directory)
+---------------------+  +---------------------+  +---------------------+  +---------------------+
| docker/eslint/      |  | docker/semgrep/     |  | docker/sonarqube/   |  | docker/codeql/      |
|   Dockerfile        |  |   Dockerfile        |  |   Dockerfile        |  |   Dockerfile        |
|   .eslintrc.json    |  |   rules.yaml        |  |   sonar-scanner     |  |   queries/          |
| Installs ESLint +   |  | Installs Semgrep +  |  | Installs scanner +  |  | Installs CodeQL +   |
|   security plugins  |  |   rule packages     |  |   connects to SQ    |  |   language packs    |
+---------------------+  +---------------------+  +---------------------+  +---------------------+
```

### Container Lifecycle Per Sample

```
1. IMAGE SELECTION
   Select Docker image based on adapter name
   Pull if not cached (or use cached image)

2. CONTAINER CREATION
   docker.createContainer({
     Image: "aqb/semgrep:1.60.0",
     Cmd: ["node", "/adapter/run.js"],
     HostConfig: {
       Memory: 512 * 1024 * 1024,    // 512MB
       NanoCpus: 1000000000,          // 1 CPU
       ReadonlyRootfs: false,
       Binds: [
         "/tmp/aqb/sample-123:/workspace:ro",  // Corpus files (read-only)
         "/tmp/aqb/output-123:/output:rw"       // Output directory (writable)
       ],
       NetworkMode: "none"             // No network (unless adapter needs API)
     },
     Env: [
       "AQB_SAMPLE_ID=security-sql-injection-001",
       "AQB_DOMAIN=security",
       "AQB_LANGUAGE=typescript"
     ]
   })

3. FILE INJECTION
   Write sample.files[] to /tmp/aqb/sample-123/
   Each SampleFile.path -> corresponding file path in temp directory

4. CONTAINER START + EXECUTION
   container.start()
   Set timeout timer (default 60s)
   Stream stdout/stderr to log buffer

5. OUTPUT COLLECTION
   Wait for container to finish (or timeout)
   Read /output/findings.json from output volume
   Parse Finding[] from JSON
   Validate against Zod schema

6. CLEANUP
   container.stop() if still running (with 10s grace)
   container.remove()
   Delete /tmp/aqb/sample-123/ and /tmp/aqb/output-123/
```

---

## Summary

| Capability | Description |
|------------|-------------|
| Per-sample containers | Each sample evaluated in a dedicated Docker container |
| Language-specific base images | node:20-slim, python:3.12-slim, eclipse-temurin:21, golang:1.22 |
| Pinned image tags | All images use specific version tags, not `:latest` |
| Tool-specific Dockerfiles | `docker/` directory with per-adapter Dockerfile and configuration |
| Resource limits | Configurable memory (default 512MB) and CPU (default 1 core) per container |
| Timeout enforcement | Container killed after timeout + 10s grace period |
| Read-only corpus mounting | Sample files mounted read-only; tool writes to separate output volume |
| Network isolation | `NetworkMode: "none"` for tools that do not need network access |
| Non-Docker fallback | Lightweight adapters (ESLint, llm-raw) can run in-process |
| Deterministic ordering | Samples processed in stable sorted order for reproducibility |

### Docker Image Inventory

| Image | Base | Pinned Tag | Size | Used By | Network Required |
|-------|------|-----------|------|---------|-----------------|
| `aqb/eslint` | `node:20-slim` | `node:20.11.1-slim` | ~250MB | ESLint adapter | No |
| `aqb/semgrep` | `python:3.12-slim` | `python:3.12.2-slim` | ~400MB | Semgrep adapter | No |
| `aqb/sonarqube-scanner` | `eclipse-temurin:21` | `eclipse-temurin:21.0.2_13-jdk` | ~600MB | SonarQube adapter | Yes (SQ server) |
| `aqb/codeql` | `ubuntu:22.04` | `ubuntu:22.04` | ~800MB | CodeQL adapter | No |
| `aqb/axe` | `node:20-slim` | `node:20.11.1-slim` | ~500MB | axe-core adapter (includes Chromium) | No |
| `aqb/aqe` | `node:20-slim` | `node:20.11.1-slim` | ~300MB | AQE agent adapter | Yes (LLM API) |
| `aqb/llm-raw` | `node:20-slim` | `node:20.11.1-slim` | ~250MB | LLM raw adapter | Yes (LLM API) |

### Resource Limit Profiles

| Profile | Memory | CPU (NanoCPUs) | Timeout | Applicable Adapters |
|---------|--------|---------------|---------|---------------------|
| `lightweight` | 256MB | 500,000,000 (0.5 cores) | 30s | eslint, llm-raw |
| `standard` | 512MB | 1,000,000,000 (1 core) | 60s | semgrep, axe-core, aqe |
| `heavy` | 2GB | 2,000,000,000 (2 cores) | 120s | sonarqube, codeql |
| `agentic` | 1GB | 1,000,000,000 (1 core) | 300s | Multi-agent scenarios |
| `unlimited` | Host limit | Host limit | 600s | Debugging only (`--unlimited`) |

### Non-Docker Fallback

| Adapter | Docker Required | Fallback Mode | Rationale |
|---------|----------------|---------------|-----------|
| ESLint | No | In-process Node.js | Pure Node.js; no system dependencies |
| LLM Raw | No | In-process Node.js | HTTP client only; no system dependencies |
| AQE Agent | No | In-process Node.js | HTTP client + local state; works in-process |
| Semgrep | Yes | N/A | Requires Python + semgrep binary |
| SonarQube | Yes | N/A | Requires Java + SonarQube server |
| CodeQL | Yes | N/A | Requires CodeQL CLI + database extraction |
| axe-core | Recommended | In-process (if Chromium installed) | Requires Chromium; Docker simplifies installation |

### Reproducibility Guarantees

| Guarantee | Mechanism | Verification |
|-----------|-----------|-------------|
| Same tool version | Pinned Docker image tags (not `:latest`) | Image digest logged in results |
| Same runtime | Language-specific base images with exact version | Runtime version logged |
| Same configuration | Adapter config injected via environment variables | Config hash logged |
| Same sample ordering | Deterministic sort by sample ID | Ordering is alphabetical by ID |
| No state leakage | Fresh container per sample; volumes destroyed after | Container creation verified |
| No host interference | Resource limits prevent OOM; network isolation prevents conflict | Resource metrics logged |

### Docker Directory Structure

```
docker/
  eslint/
    Dockerfile                   -- FROM node:20.11.1-slim + ESLint installation
    .eslintrc.json              -- Default ESLint config for AQB evaluation
    package.json                -- ESLint + security plugins
  semgrep/
    Dockerfile                   -- FROM python:3.12.2-slim + Semgrep installation
    rules/                       -- Default Semgrep rule packs
  sonarqube/
    Dockerfile                   -- FROM eclipse-temurin:21 + SonarScanner
    sonar-project.properties    -- Default SonarQube project config
  codeql/
    Dockerfile                   -- FROM ubuntu:22.04 + CodeQL CLI
    queries/                     -- Default CodeQL query suites
  axe/
    Dockerfile                   -- FROM node:20.11.1-slim + Playwright + axe-core
    playwright.config.ts        -- Playwright configuration
  aqe/
    Dockerfile                   -- FROM node:20.11.1-slim + AQE runtime
  llm-raw/
    Dockerfile                   -- FROM node:20.11.1-slim + HTTP client
  common/
    entrypoint.sh               -- Shared entrypoint script for all adapters
    adapter-runner.js            -- Node.js adapter runner that invokes analyze()
```

---

## Options Considered

### Option 1: [Selected] -- Docker Container Isolation with Non-Docker Fallback

**Description:** Per-sample Docker containers using language-specific base images with pinned tags, configurable resource limits, timeout enforcement, and a non-Docker fallback for lightweight adapters.

**Pros:**
- Complete isolation between tool executions
- Reproducible across all host environments
- Supports heterogeneous tool runtimes (Node.js, Python, Java, Go)
- Resource limits prevent container interference
- Timeout enforcement via container kill is reliable
- `dockerode` already in dependencies
- Non-Docker fallback enables rapid adapter development
- Pinned image tags ensure version consistency

**Cons:**
- Docker adds 1-3 seconds startup overhead per container
- Requires Docker daemon on host
- Base images consume ~2GB total disk space
- Building custom Dockerfiles requires Docker build infrastructure
- Non-Docker fallback weakens reproducibility for those adapters

### Option 2: [Rejected] -- Virtual Machine Isolation

**Description:** Run each sample evaluation in a lightweight VM (Firecracker, QEMU) for stronger isolation.

**Pros:**
- Stronger isolation than containers (hardware-level)
- Better security boundary
- Full OS-level reproducibility

**Cons:**
- VM startup time is 30-60 seconds vs 1-3 seconds for containers
- For 1,680 samples: VMs add ~14-28 hours of overhead vs ~1 hour for Docker
- Requires VM management infrastructure (images, networking)
- Overkill for benchmark evaluation (not running untrusted code)
- Complex setup on developer machines

**Rejection rationale:** VM startup overhead makes the benchmark impractically slow. Docker provides sufficient isolation for a benchmark where the tools being evaluated are known and trusted (not arbitrary user code).

### Option 3: [Rejected] -- Direct Process Execution with cgroups

**Description:** Use Linux cgroups and namespaces directly for process-level isolation without Docker.

**Pros:**
- No Docker dependency
- Lower overhead than Docker containers
- Fine-grained resource control

**Cons:**
- Linux-only (no macOS or Windows support)
- Requires root or sudo access for cgroup management
- Platform-specific code (different cgroup v1 vs v2)
- No built-in image management (must install tools on host)
- Significantly more implementation effort

**Rejection rationale:** Platform-specific code and root access requirements are antithetical to a cross-platform CLI tool. Docker abstracts these concerns.

---

## Consequences

### Positive
- Every evaluation produces identical results regardless of host environment
- Tool version consistency is guaranteed through pinned Docker image tags
- Resource limits prevent any single evaluation from affecting the host or other containers
- Container-per-sample ensures zero state leakage between evaluations
- Network isolation prevents tools from interfering with each other
- Non-Docker fallback enables rapid adapter development without Docker overhead
- Docker images serve as documentation of tool dependencies

### Negative
- Docker startup overhead: approximately (1680 / concurrency * 2s) = 14 minutes at concurrency 4
- Total Docker image disk usage: approximately 2-3 GB for all base images
- Docker daemon must be installed and running (not always available in CI containers)
- Building custom images requires Docker build infrastructure
- Non-Docker fallback reduces reproducibility guarantees for those adapters

### Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Docker not available in CI environment | Medium | High | Document CI Docker setup; provide GitHub Actions workflow with Docker support |
| Pinned image tags become outdated | Medium | Low | Quarterly image update cycle; security patch images immediately |
| Docker-in-Docker not supported | Medium | Medium | Use Docker socket mounting or sidecar pattern in CI |
| Container storage fills up (many containers created) | Low | Medium | Automatic cleanup after each sample; periodic prune in long runs |
| Non-Docker results differ from Docker results | Medium | Medium | Conformance test suite comparing both paths; document divergence risks |
| Image pull failure (network issues) | Medium | Medium | `aqb setup` command pre-pulls all images; offline mode uses cached images |

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
| Used by | ADR-003 | Evaluation Engine Runner Architecture | Runner uses Docker containers for isolated execution |
| Used by | ADR-004 | Adapter Layer Anti-Corruption Pattern | Each adapter has a corresponding Docker image |
| Used by | ADR-007 | Agentic Evaluation Protocol | Fix verification uses Docker build toolchains |
| Configured by | ADR-008 | CLI and API Gateway | `--no-docker` flag and Docker configuration in .aqbrc.json |
| Tested by | ADR-013 | Testing Strategy | Docker conformance tests comparing Docker and non-Docker paths |
| Cross-cutting | ADR-012 | Cross-Cutting Concerns | Logging and observability within containers |

---

## References

| Reference ID | Title | Type | Location |
|--------------|-------|------|----------|
| REF-001 | dockerode npm package | Library | https://www.npmjs.com/package/dockerode |
| REF-002 | Package.json dependencies | Configuration | `harness/package.json` (dockerode v4.x) |
| REF-003 | Docker resource constraints | Documentation | https://docs.docker.com/config/containers/resource_constraints/ |
| REF-004 | Docker SDK for Node.js | Library | https://github.com/apocas/dockerode |
| REF-005 | OCI Image Specification | Standard | https://github.com/opencontainers/image-spec |
| REF-006 | Node.js Docker best practices | Guide | https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md |
