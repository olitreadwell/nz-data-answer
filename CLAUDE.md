# CLAUDE.md

Stack-specific notes for this template.

- Node 22 (`.nvmrc` is the source of truth; `mise` and `asdf` read it).
- pnpm with a committed `pnpm-lock.yaml`; `pnpm install --frozen-lockfile`
  in CI and Docker. Pick one package manager per repo.
- Next.js standalone output; the Dockerfile runs `server.js`.
- Vitest coverage gates live in `vitest.config.ts` (v8, 80% lines).
- Playwright config in `playwright.config.ts`; specs in `e2e/`.
- Tailwind 4 via `@tailwindcss/postcss`; Radix UI primitives in
  `src/components/ui` (shadcn aliases in `components.json`).
- `src/lib` = pure domain logic + shared services; `src/server` = contracts;
  `src/app` = routes only.
- AI features go through `src/lib/ai/`: config, client, usage ledger,
  guardrails, prompt registry. Read `docs/ai.md` before adding one. The seam
  is off unless `AI_API_KEY` is set, so `pnpm run check` never needs a key.
- Prompt changes need an eval: add or update a case in `evals/cases/` and run
  `pnpm run evals`. A prompt change without one is an unverified change.

## Agent skills

### Issue tracker

Issues live as GitHub issues, driven with the `gh` CLI. See
`docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles map onto labels with the same names. See
`docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and one `docs/adr/`. See
`docs/agents/domain.md`.
