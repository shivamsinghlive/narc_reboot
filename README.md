# Narc — tech-debt radar

Paste any GitHub repo. Narc maps it into architecture layers and builds the real import-dependency graph. It reads every **unmerged PR diff** and your **Jira board / design docs / GitHub Issues**, then forecasts tech debt per layer over 90 days. The forecast includes the debt each layer **inherits from the layers it depends on**.

```bash
npm start            # → http://localhost:4317   (Node 18+, zero dependencies)
```

Click **Demo** for a full AI-mode sample, or paste a repo URL. Add your OpenAI key in **Settings** (or `.env`) to switch on the AI layer.

## What it does

| Stage | How |
|---|---|
| Source | Downloads the default branch as one tarball (doesn't count against the GitHub API rate limit). Skips vendored, built and generated folders. |
| Layers | Assigns each file to UI · API · AI/ML · Services · Integrations · Data · Shared · Infra · Config · Tests, using path rules plus **what it imports** (e.g. importing `openai`, `langchain` or `torch` puts a file in AI/ML). With a key, the model corrects directories that were assigned wrongly. |
| Dependency graph | Resolves imports for JS/TS (incl. `@/` aliases and workspaces), Python, Go, Java/Kotlin, C#, PHP, Ruby, C/C++, Rust. Finds import cycles (Tarjan SCC) and **layering violations**, e.g. Data importing Services. |
| Static debt | Per file: complexity, size, nesting, fan-in, TODO/FIXME, lint/type suppressions, `any`, test linkage. These roll up into a per-layer score with an explanation of what drives it. |
| Unmerged PRs | Parses each diff and checks 16 debt signals: no tests, deleted tests, new upward imports, hard-coded secrets, inline prompts, pinned model ids, copy-paste, new deps, hotspot growth, staleness, overlapping PRs… With a key, the model writes a PR review (debt items, how they compound, merge advice). |
| Backlog | Jira Cloud (JQL), pasted PRD/markdown, Jira/Linear CSV export, in-repo ADRs/roadmaps, GitHub Issues. Each task is mapped to layers and scored as accrual or paydown. |
| Forecast | `own(d) = static + interest drift + Σ P(merge by d)·PR debt + Σ progress(d)·task Δ`. PR merge odds come from the repo's actual merge rate and median time-to-merge. |
| Ripple | Walks the graph breadth-first (BFS) up to 4 layers deep. A layer inherits the debt each dependency carries above a healthy baseline, scaled by how tightly they're coupled and fading with each step. *Blast radius* = how many layers transitively depend on it. |
| Security | ~30 static rules (secrets, SQL/NoSQL/command injection, SSRF, path traversal, XSS, JWT, TLS, weak crypto, CI/CD script injection, unpinned images/actions, LLM prompt injection and output execution), committed key files, and known CVEs for every declared dependency version via **OSV.dev** (free). Each finding is mapped to a CWE and to **MITRE ATT&CK**, or **MITRE ATLAS** for AI-specific attacks. |
| Attack surface | Detects routes (Express, Fastify, Next.js, FastAPI, Flask, Django, Go, Spring, Rails) and whether each has a visible auth check, so you can see where an attacker would probe. |
| Threat model | The Threat Modeler agent chains findings, CVEs and endpoints into attack scenarios that follow the dependency graph, step by step, each mapped to MITRE, with detection and mitigation. Optional **Tavily / Exa** search adds exploit and advisory intel. |
| People | Recent commits, contributors, releases, and who last changed each risky file (with PR number and commit). |
| Snapshots | Every analysis is saved. The Timeline shows what changed since the last run: per-layer scores, new and fixed findings, new CVEs, opened and closed PRs. |
| AI (optional) | Executive briefing, top risks, per-layer narratives, and an on-demand **Deep dive** that reads the code of a layer's top hotspots. |

## UI

* **Architecture** — clickable layer graph. Fill and border colour = debt; pink halo = PR debt waiting to land; red dashed edges = layering violations. Click a layer to highlight what it depends on (cyan) and what depends on it (orange). Double-click to open its module graph. Drag the **timeline** (or ▶) to watch the 90-day forecast. You can colour by total, PR or inherited debt.
* **Inspector** — score gauge, debt breakdown, stacked forecast chart with an "all PRs merged today" line, dependency chains with inherited points, blast radius, score drivers, PR debt items, backlog items, hotspots, modules, AI deep dive.
* **Pull requests**, **Backlog forecast**, **Hotspots**, **Report** (exportable JSON).
* **Investigations** — live from GitHub for the analyzed repo. Every CI break on the default branch (a workflow that passed, then failed) and every open PR whose CI fails becomes a case. Narc scores three suspects with clues that link to the real evidence: **bad change** (the commits between the last green and first red run, or the PR's diff; whether the error annotation or job log names a changed file), **vendor outage** (GitHub/npm/PyPI error signatures, the same commit passing on a re-run, unrelated pipelines failing together, and the vendor's own status-page incidents), **attack** (hidden instructions for AI agents, CI pipeline edits by outside contributors, `pull_request_target`, secrets sent to the network, packages missing from npm/PyPI or barely used). **Re-check** reads GitHub again. The built-in demo uses the Acme Cloud synthetic logs instead.
* **MITRE map** — attack signs from the investigations plus this repo's security scan on one ATT&CK / ATLAS matrix (the demo also shows its attack chain before and after removing an AI agent's unused permissions).
* **Blast radius** — for this repo: every layer that imports the one you pick, directly or through others. For each CI failure: the layers its change touched and every layer that depends on them, from the same import graph.

## Config (`.env` or Settings drawer)

```
OPENAI_API_KEY=        OPENAI_MODEL=gpt-5-mini     OPENAI_BASE_URL=   # any OpenAI-compatible endpoint
GITHUB_TOKEN=          # private repos + higher limits; also traces more files to their authors
OPENAI_FAST_MODEL=     # optional cheaper/faster model for light agent calls
TAVILY_API_KEY= EXA_API_KEY=   # optional threat intel
JIRA_SITE= JIRA_EMAIL= JIRA_TOKEN= JIRA_JQL=
```

Keys typed into Settings stay in your browser's localStorage. They're sent only to this local server, which forwards them to OpenAI, GitHub or Jira.

## Layout

```
server.js            HTTP + SSE job stream, static files
lib/github.js        repo meta, tarball, PRs, diffs, issues
lib/ingest.js        tar.gz reader + file filtering
lib/deps.js          import extraction + multi-language resolver
lib/layers.js        layer taxonomy, classifier, LLM refinement
lib/metrics.js       per-file metrics
lib/graph.js         SCCs, hotspots, layer/module graphs, static scores
lib/prs.js           diff parsing, PR heuristics, LLM PR review
lib/backlog.js       Jira / doc / CSV / issues → tasks, heuristics + LLM
lib/forecast.js      time series + dependency propagation
lib/pipeline.js      orchestration, exec summary, deep dive
lib/demo.js          synthetic AI-mode dataset (same assemble() path)
lib/investigate.js   live CI investigations: runs, jobs, annotations, logs, compare, status pages, registries
data/incidents.json  demo-only incident investigations (Acme Cloud synthetic logs)
scripts/export_incidents.py  regenerates it from the Python Narc engine
public/              UI (vanilla JS + Cytoscape)
```
