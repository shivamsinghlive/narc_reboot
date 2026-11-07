# Narc: find out who's watching your users

**Paste any GitHub repo. Narc shows you every company that app sends its users' data to, the exact line of code that sends it, what those companies do with it (researched live, with sources), and which open pull requests are about to make it worse.**

It's also a full tech-debt and security radar: architecture layers, dependency graph, unmerged-PR review, CVEs, MITRE ATT&CK mapping, live CI investigations and blast radius. Privacy debt is treated like any other debt: found in the code, traced through PRs, scored, and fixed before it ships.

```bash
npm start            # → http://localhost:4317   (Node 18+, zero dependencies)
```

Paste a repo URL, or click **Demo**. Open **Privacy** in the sidebar.

---

## Why

Most user-data leaks aren't hacks. They're ordinary code changes: someone adds an analytics SDK, passes `user.email` to a support tool, logs a phone number, or puts a patient's details into an AI prompt. Code review checks that the code *works*, not *where the data goes*, so nobody notices until a regulator or a journalist does.

Narc reads the code and answers the three questions a privacy reviewer asks:

| Question | What Narc shows |
|---|---|
| **What leaves?** | Every kind of personal data (email, phone, location, health, card, government ID…) that flows out of the app, and where in the code |
| **Who can read it?** | Every third party that receives it (analytics, ads, session recording, AI models, CRMs, email, payments), each researched with **Tavily + Exa**: do they sell it, use it for ads, train AI on it, how long they keep it, with links to their own policy |
| **Can you prove it?** | Every finding links to the exact file and line on GitHub. Narc's own outbound requests are listed too (**What Narc sent**) |

And it looks ahead: **open PRs that would add a new tracker or a new flow of personal data are flagged before they merge.**

## Privacy tab

* **Privacy score and grade**: A (Excellent) to F (Failing).
* **Telescreen**: personal data in the code on the left, the app in the middle, everyone who receives it on the right. Animated lines show real flows. Click a company for its dossier.
* **Recipient dossiers (Tavily + Exa)**: only the company name and website are searched, the company's own site first. Yes / No / Not stated for *sells data*, *ads* and *AI training*, the retention period when stated, and every source linked.
* **Data flows in the code**, grouped by kind: shared with third parties, sent to AI models, written to logs, stored unsafely (browser storage, unencrypted sensitive columns), leaked in URLs. Each one has *who can read it* and *how to fix it*.
* **Coming in open PRs**: new trackers and new personal-data flows in unmerged PRs.
* **Personal data inventory**: which kinds of personal data the app handles, by number of files.
* **What Narc sent**: every request Narc made for the report, grouped by destination with the exact search text. With **Local AI** on, it proves that 0 bytes of code left the laptop.

### Narc doesn't watch you either

* **Local AI** (Settings, or `NARC_LOCAL_AI=1`): every AI call runs on your machine through Ollama (`qwen2.5:7b` by default). Your code and PR text never leave it.
* Privacy analysis itself is static and local: no AI and no network.
* Outbound requests are limited to public data: GitHub (the repo you asked for), OSV.dev (package versions), status pages and package registries (CI investigations), and Tavily/Exa with public names only. All of them are listed in **What Narc sent**.
* Keys stay in `.env` or your browser's localStorage, and are only forwarded to the service they belong to.

### Example: `dubinc/dub`

Narc grades it **D · Poor**: 7 recipients (Plain, Anthropic, Tinybird, HubSpot, Segment, Stripe, Resend) and real flows such as *sends email and full name to Plain* (`apps/web/lib/plain/upsert-plain-customer.ts`), *puts email in a URL* and *writes email to logs*. Plain's dossier, from plain.com's own legal pages: sells data **No**, ads **No**, AI training **No**.

Detection is pattern-based static analysis, so treat findings as leads to review, not verdicts.

## Hackathon tracks (HACK1984)

| Track | How Narc fits |
|---|---|
| **Privacy-First** | It protects the end users of every app it scans, by catching data leaks in code and in PRs before they ship. Local AI plus *What Narc sent* answer "what leaves the device, who can read it, can you prove it" for Narc itself. |
| **Surge (Tavily / Exa)** | Every data recipient is researched live with cited sources. Threat intel for CVEs and frameworks also comes from Tavily/Exa. |
| **Most Startup-able** | Every company with GDPR, CCPA or HIPAA exposure needs to know where user data goes, and it changes with every PR. Narc is that check, per repo, per PR. |

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
| Privacy | Third-party recipients from manifests and code (~35 SDKs and endpoints), personal-data flows (to third parties, AI prompts, logs, browser storage, URLs, unencrypted columns), new recipients and flows in open-PR diffs, a privacy score, Tavily/Exa recipient dossiers. See `lib/privacy.js`. |
| AI (optional) | Executive briefing, top risks, per-layer narratives, and an on-demand **Deep dive** that reads the code of a layer's top hotspots. Runs on OpenAI or locally on Ollama. |

## UI

* **Architecture** — clickable layer graph. Fill and border colour = debt; pink halo = PR debt waiting to land; red dashed edges = layering violations. Click a layer to highlight what it depends on (cyan) and what depends on it (orange). Double-click to open its module graph. Drag the **timeline** (or ▶) to watch the 90-day forecast. You can colour by total, PR or inherited debt.
* **Inspector** — score gauge, debt breakdown, stacked forecast chart with an "all PRs merged today" line, dependency chains with inherited points, blast radius, score drivers, PR debt items, backlog items, hotspots, modules, AI deep dive.
* **Privacy**: see above.
* **Pull requests**, **Backlog forecast**, **Hotspots**, **Report** (exportable JSON).
* **Investigations** — live from GitHub for the analyzed repo. Every CI break on the default branch (a workflow that passed, then failed) and every open PR whose CI fails becomes a case. Narc scores three suspects with clues that link to the real evidence: **bad change** (the commits between the last green and first red run, or the PR's diff; whether the error annotation or job log names a changed file), **vendor outage** (GitHub/npm/PyPI error signatures, the same commit passing on a re-run, unrelated pipelines failing together, and the vendor's own status-page incidents), **attack** (hidden instructions for AI agents, CI pipeline edits by outside contributors, `pull_request_target`, secrets sent to the network, packages missing from npm/PyPI or barely used). **Re-check** reads GitHub again. The built-in demo uses the Acme Cloud synthetic logs instead.
* **MITRE map** — attack signs from the investigations plus this repo's security scan on one ATT&CK / ATLAS matrix (the demo also shows its attack chain before and after removing an AI agent's unused permissions).
* **Blast radius** — for this repo: every layer that imports the one you pick, directly or through others. For each CI failure: the layers its change touched and every layer that depends on them, from the same import graph.

## Config (`.env` or Settings drawer)

```
OPENAI_API_KEY=        OPENAI_MODEL=gpt-5-mini     OPENAI_BASE_URL=   # any OpenAI-compatible endpoint
GITHUB_TOKEN=          # private repos + higher limits; also traces more files to their authors
OPENAI_FAST_MODEL=     # optional cheaper/faster model for light agent calls
TAVILY_API_KEY= EXA_API_KEY=   # recipient dossiers + threat intel
NARC_LOCAL_AI=0  LOCAL_MODEL=qwen2.5:7b  LOCAL_BASE_URL=http://127.0.0.1:11434/v1   # run the AI on this laptop
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
lib/privacy.js       privacy debt: recipients, personal-data flows, PR changes, score, Tavily/Exa dossiers
lib/investigate.js   live CI investigations: runs, jobs, annotations, logs, compare, status pages, registries
data/incidents.json  demo-only incident investigations (Acme Cloud synthetic logs)
scripts/export_incidents.py  regenerates it from the Python Narc engine
public/privacy.js    Privacy tab (Telescreen, dossiers, flows, What Narc sent)
public/              UI (vanilla JS + Cytoscape)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

Built at HACK1984, Boston, November 2026.
