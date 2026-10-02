# NZ Data Answer

[![CI](https://github.com/olitreadwell/nz-data-answer/actions/workflows/ci.yml/badge.svg)](https://github.com/olitreadwell/nz-data-answer/actions/workflows/ci.yml)

**Live:** <https://nz-data-answer.vercel.app>

Ask a question about Aotearoa New Zealand public data and get an answer that
names the datasets behind it. Two keyless sources are searched live, the
matching datasets are handed to a model as fenced evidence, and the answer
comes back with its citations and what the call cost.

- **Answer only from evidence.** The model sees the dataset titles, URLs and
  descriptions the connectors returned, and nothing else. If the sources do
  not answer the question, the site says so and spends no model call.
- **Citations you can follow.** Every answer lists the datasets it used,
  with a link to the catalogue entry or the Aotearoa Data Explorer.
- **Honest failures.** A source that returns an error is named on the page
  instead of being dropped from the answer.
- **Cost on the page.** Model, prompt fingerprint, input and output tokens,
  estimated cost, and latency are shown for every answer, and the client
  refuses a call estimated above a configured per-request cap.
- **Untrusted text stays untrusted.** Source text is wrapped in an
  `<untrusted>` fence, obvious personal data is redacted before it reaches a
  model, and injection signals in source text are logged.

## How it works

1. `POST /api/ask` validates the question (8 to 280 characters) and applies a
   per-IP rate limit of 10 questions per 5 minutes.
2. `searchNzSources()` asks the data.govt.nz CKAN catalogue and the Aotearoa
   Data Explorer search index in parallel, and turns the results into at most
   eight excerpts.
3. No excerpts means no model call: the response says no datasets matched.
4. Otherwise the excerpts are fenced with `fenceUntrustedContent()` and sent
   to an OpenAI-compatible endpoint through the template's AI seam, with the
   prompt fingerprint `nz-data-answer@1` attached.
5. The answer returns with citations, any source failures, and the telemetry
   block the page renders under the text.

With no `AI_API_KEY` set, the endpoint still returns the datasets it found and
says answers are disabled, so the site is useful before it is configured.

## Data sources

The two connectors are vendored from
[nz-open-data-connectors](https://github.com/olitreadwell/nz-open-data-connectors)
into `packages/nz-sources`, because npm git dependencies cannot target a
subpackage inside a workspace monorepo. The copy is regenerated, never edited:

```bash
pnpm run sync:connectors            # uses ../open-data/nz-open-data-connectors
node scripts/sync-connectors.mjs --from /path/to/checkout
```

| Connector | Source | Key |
| --- | --- | --- |
| `data-govt-nz` | data.govt.nz CKAN catalogue search | none |
| `ade-search` | Aotearoa Data Explorer table index (Stats NZ) | none |

## Evals

A prompt change is a behaviour change, so it ships with an eval.

```bash
pnpm run evals                    # deterministic checks
pnpm run evals -- --with-judge    # adds the rubric grade
```

`evals/cases/` holds the cases, `evals/report.json` is the last run. With no
provider key the run prints `evals skipped` and exits 0. See
[evals/README.md](evals/README.md).

## Quick start

```bash
pnpm install
cp .env.example .env      # then set AI_API_KEY to turn answers on
pnpm run dev              # http://localhost:3000
```

## Commands

| Command | Purpose | CI gate |
| --- | --- | --- |
| `pnpm run dev` | Dev server | |
| `pnpm run build` | Production build | Blocking |
| `pnpm run typecheck` | `tsc --noEmit` | Blocking |
| `pnpm run lint` | ESLint | Blocking |
| `pnpm run format:check` | Prettier check | Blocking |
| `pnpm test` | Vitest unit/component | Blocking |
| `pnpm run test:coverage` | Coverage gate | Blocking |
| `pnpm run test:e2e` | Playwright | Blocking |
| `pnpm run test:a11y` | axe route audit (WCAG 2.2 A/AA) | Blocking (in e2e) |
| `pnpm run perf` | Lighthouse budgets (local) | Blocking |
| `pnpm run smoke` | Boot + curl routes | Blocking |
| `pnpm run check:links` | Internal link integrity | Blocking |
| `pnpm run llms:check` | `llms.txt` matches the route tree | Blocking |
| `pnpm run evals` | Prompt evals against a live provider | When a prompt changes |
| **`pnpm run check`** | All of the above except `evals` | Mirrored 1:1 |

## Quality gates (CI)

- **CI** — `pnpm run check` mirrored 1:1 (format, lint, typecheck,
  coverage, setup, build, smoke, e2e incl. axe, links).
- **Code review** — `alibaba/open-code-review` on every PR (deterministic
  rules; LLM-assisted when `LLM_API_KEY` is set). See
  [docs/audits.md](docs/audits.md).
- **Security** — blocking `pnpm audit` (high/critical) + committed-secret
  scan. See [docs/contributing/06-security.md](docs/contributing/06-security.md).
- **Quality** — Lighthouse budgets (a11y ≥ 0.95, perf/SEO ≥ 0.90,
  best-practices ≥ 0.95, FCP/LCP/TBT/CLS budgets) via
  `treosh/lighthouse-ci-action`.
- **Accessibility** — axe on every route (A/AA + best practice) in e2e,
  plus a documented manual AAA pass in [docs/a11y.md](docs/a11y.md).
- **Cost & speed** — path-aware triggers, `[skip ci]` token, in-flight
  cancellation, Docker layer caching, sharded e2e, 3-day artifact
  retention, local pre-push audit. See
  [docs/ci-optimization.md](docs/ci-optimization.md).

## Contact, feedback, help

- [Help center / FAQ](/help) — answers, plus how to reach a human
- [Contact](/contact) — validated, rate-limited form to the project inbox
- [Report feedback](/feedback) — files a labelled GitHub issue with full
  context (browser, page, repro steps)

Abuse protection (proof of work + per-IP rate limit + honeypot) is on by
default. The contract is documented in [docs/contact.md](docs/contact.md)
and published machine-readably at `/.well-known/feedback.json`.

## API

- OpenAPI 3.1 spec: `/api/openapi.json` (generated from the zod schemas)
- Swagger UI: `/docs`
- A contract test keeps the spec and the running server in agreement; see
  [docs/api.md](docs/api.md)

## AI features

The template ships an AI seam that is off until you set `AI_API_KEY`: an
OpenAI-compatible client, a cost ledger with a per-request cap, guardrails
for redaction and untrusted text, versioned prompts, and a prompt eval suite.
Nothing in `pnpm run check` needs a provider key.

```bash
pnpm run evals      # grade the prompts in evals/cases
```

Read [docs/ai.md](docs/ai.md) before adding a feature. The quality bar is
[CONSTRAINTS.md](CONSTRAINTS.md); `public/llms.txt` is generated from the
route tree by `pnpm run llms:generate`.

## Tech stack

- Next.js App Router, React 19, TypeScript strict
- Tailwind CSS 4 + Radix UI primitives in `src/components/ui`
- Passwordless auth: Better Auth email OTP (`/login`, SQLite + Drizzle)
- Vitest + Testing Library + vitest-axe; Playwright e2e
- pnpm (lockfile committed, frozen installs in CI); ESLint 9 flat config +
  Prettier; husky pre-commit/pre-push
- Zod validation at the boundary, pino structured logs, centralized errors
- OpenAPI 3.1 + Swagger UI at `/docs`, contract-tested; type-fest types
- Multi-stage Dockerfile with `HEALTHCHECK` on `/health`
- PWA manifest + production-only service worker, `llms.txt` for AI
  crawlers, hreflang (`en`/`x-default`) declared in the root layout

## Documentation

- [Onboarding](docs/onboarding.md)
- [Engineering standards](docs/engineering.md)
- [Style guide](docs/style-guide.md)
- [LLM-agent-optimized writing](docs/llm-agent-optimization.md)
- [Testing guide](docs/testing.md)
- [Deployment](docs/deploy.md)
- [Philosophy](docs/philosophy.md)
- [FAQ](docs/faq.md)
- [Contact & feedback mechanisms](docs/contact.md)
- [API contract](docs/api.md)
- [Accessibility policy](docs/a11y.md)
- [Passwordless auth](docs/auth.md)
- [Audit gates](docs/audits.md)
- [CI cost & speed](docs/ci-optimization.md)
- [Contributing guide](docs/contributing/00-index.md)

## Agent-first repo

`AGENTS.md` + `CLAUDE.md` tell AI agents exactly how this repo works, what
the quality bar is, and how to verify changes. See
[docs/llm-agent-optimization.md](docs/llm-agent-optimization.md) for why the
repo is written the way it is.
