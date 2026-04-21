<p align="center">
  <img src="assets/brandfactory-logo.png" alt="BrandFactory" width="200" />
</p>

<h1 align="center">BrandFactory</h1>

<p align="center">
  <strong>The open-source Brand Operating System.</strong><br/>
  One brand context. Endless consistent creative.
</p>

<p align="center">
  <em>Self-hosted · Privacy-first · Provider-agnostic · No lock-in</em>
</p>

<p align="center">
  <a href="https://github.com/philholke/brandfactory/actions/workflows/ci.yml"><img src="https://github.com/philholke/brandfactory/actions/workflows/ci.yml/badge.svg" alt="CI"/></a>
</p>

---

## The problem

Brand context lives in too many places — a deck in Figma, a voice doc in
Notion, personas on a slide somewhere, campaign notes in Slack, a dozen
half-remembered rules in the founder's head.

Every time someone opens a generic AI tool to draft an ad, name a product,
or plan a week of posts, they re-explain the brand from scratch — or skip
it, and get generic output that doesn't sound like the brand at all.

## The idea

**Define your brand once. Every creative surface inherits it automatically.**

- 🏠 **Workspaces** are the living home for each brand — audience, voice,
  positioning, visuals, messaging, and anything else that matters.
- 🎨 **Projects** are where work happens: a split-screen workspace with an
  agent chat on one side and a freeform multimodal canvas on the other.
- 🔁 **Ideate → Iterate → Finalize.** Brainstorm with full brand context,
  pin the ideas worth keeping, shortlist the winners, and promote them back
  into your brand guidelines.

There's no dedicated "naming agent" or "copy agent." One brainstorming
surface produces taglines, content calendars, packaging concepts, or
anything else — because the brand context always travels with it.

Full product vision: [`docs/vision.md`](docs/vision.md).

## Status

> 🚧 **Pre-alpha — scaffolding in progress.**
>
> The vision, architecture, and foundational packages are landing phase by
> phase. Follow the [changelog](docs/changelog.md) to track what's shipped.

**Shipped so far:** repo foundation · shared domain types · Postgres schema
& query layer · adapter ports (auth, storage, realtime, LLM) · Hono server
with streaming agent + realtime WS · Vite + React 19 frontend with
split-screen project workspace, brand editor, settings, and realtime
canvas · dev seed, root env template, CI, CORS gate for split-origin
deploys.

**Up next:** Playwright e2e (Phase 9), adapter docs, standardized project
templates.

## Quickstart

**Prerequisites:** Node 20, pnpm 10, Docker (for the dev Postgres; if you
already have a local Postgres you can skip the compose step and export
`DATABASE_URL` yourself).

```bash
pnpm install
docker compose -f docker/compose.yaml up -d          # Postgres :5432
cp .env.example .env                                  # server env
cp packages/web/.env.example packages/web/.env        # frontend env
pnpm -F @brandfactory/db db:migrate                   # apply schema
pnpm -F @brandfactory/db db:seed                      # prints the dev token
pnpm dev                                              # server :3001 + web :5173
```

Open <http://localhost:5173>, paste the UUID printed by `db:seed` into the
`/login` form, and you're in a populated demo workspace.

`pnpm dev` wraps `scripts/dev.sh`, which runs both packages' `dev` scripts
and tears both down on Ctrl-C (or if either one crashes).

## Configuration

### Server env (`.env`)

Every key is documented inline in [`.env.example`](.env.example). A drift
guard (`packages/server/src/env.example.test.ts`) fails CI if the schema
widens without the example following.

| Var                    | Required                             | Default            | Notes                                                            |
| ---------------------- | ------------------------------------ | ------------------ | ---------------------------------------------------------------- |
| `DATABASE_URL`         | yes                                  | —                  | Postgres 16+ connection string.                                  |
| `AUTH_PROVIDER`        | yes                                  | `local`            | `local` (dev UUID bearer) or `supabase` (JWT).                   |
| `STORAGE_PROVIDER`     | yes                                  | `local-disk`       | `local-disk` or `supabase`.                                      |
| `REALTIME_PROVIDER`    | yes                                  | `native-ws`        | Only impl shipping today.                                        |
| `LLM_PROVIDER`         | yes                                  | `openrouter`       | `openrouter` · `anthropic` · `openai` · `ollama`.                |
| `LLM_MODEL`            | yes                                  | —                  | Provider-specific model id (e.g. `anthropic/claude-sonnet-4.6`). |
| `OPENROUTER_API_KEY`   | when `LLM_PROVIDER=openrouter`       | —                  | Per-provider keys: set the one matching `LLM_PROVIDER`.          |
| `BLOB_LOCAL_DISK_ROOT` | when `STORAGE_PROVIDER=local-disk`   | —                  | Filesystem path for uploaded blobs.                              |
| `BLOB_SIGNING_SECRET`  | when `STORAGE_PROVIDER=local-disk`   | —                  | HMAC secret for signed URLs.                                     |
| `BLOB_PUBLIC_BASE_URL` | when `STORAGE_PROVIDER=local-disk`   | —                  | Base URL the signed `/blobs/:key?sig=…` route is served from.    |
| `BLOB_MAX_BYTES`       | no                                   | 25 MiB             | Hard cap on upload size; 413 before body is read.                |
| `SUPABASE_*`           | when matching provider is `supabase` | —                  | Auth + storage share these. See `.env.example` for the grouping. |
| `CORS_ALLOWED_ORIGINS` | no                                   | _(CORS off)_       | Comma-separated exact-match allowlist. Gates HTTP + WS upgrade.  |
| `PORT` / `HOST`        | no                                   | `3001` / `0.0.0.0` | Hono listener.                                                   |
| `LOG_LEVEL`            | no                                   | `info`             | `debug` · `info` · `warn` · `error`.                             |

### Frontend env (`packages/web/.env`)

Inlined into the client bundle at build time — never put secrets here.
See [`packages/web/README.md`](packages/web/README.md) for the full
reference and the Supabase magic-link walkthrough.

## Swapping the LLM provider

1. Edit `.env`: set `LLM_PROVIDER` to one of `openrouter` / `anthropic` /
   `openai` / `ollama`, `LLM_MODEL` to a model id the provider accepts,
   and the matching API key (e.g. `ANTHROPIC_API_KEY=sk-ant-…`).
2. Restart `pnpm dev` so the server re-reads the env.
3. (Optional) Override per workspace in the Settings UI
   (`/workspaces/:id/settings`). Per-workspace overrides shadow the env
   default; keys still come from the server environment.

The provider list is a compile-time union (`LLM_PROVIDER_IDS` in
`@brandfactory/shared`). Adding a new one widens the enum, the env
schema, the `buildAdapters` switch, and the settings dropdown in
lockstep.

## Deploying it yourself

BrandFactory doesn't ship an opinionated deploy recipe — every
self-hoster has a different proxy, TLS, and volume story. Here's what
you're packaging:

- **Server** — a plain Node app. `pnpm -F @brandfactory/server build`
  (once that lands) + `node dist/main.js`, with a Postgres 16 instance
  and the env vars from [`.env.example`](.env.example).
- **Web** — a static Vite build (`pnpm -F @brandfactory/web build` →
  `packages/web/dist`). Serve behind any static host; point
  `VITE_API_BASE_URL` / `VITE_RT_URL` at the server if they live on
  different origins.
- **Split-origin CORS** — set `CORS_ALLOWED_ORIGINS` to the exact web
  origin(s). Same allowlist gates the `/rt` WebSocket upgrade so HTTP
  and WS can't drift.
- **Scaling** — stay at **one server instance**. The realtime bus
  (`native-ws`) holds subscribers in-process, so running two+ instances
  silently breaks cross-instance fan-out: a canvas edit on Machine A
  never reaches a subscriber on Machine B. Vertical scaling (bigger VM)
  is safe. Horizontal scaling needs a cross-instance realtime adapter
  (Supabase Realtime / Redis pub-sub) to land first — see
  [hosted-deployment-plan.md Question 3](docs/executing/hosted-deployment-plan.md#questions-for-review).

Docker images, a production compose stack, and a `bootstrap.sh` are
intentionally deferred until a real self-hoster surfaces with a concrete
use case. If that's you, open a [GitHub
issue](https://github.com/philholke/brandfactory/issues) with your
setup — that'll shape the tooling better than guessing now.

## How it'll work (sneak peek)

Inside a project, the canvas is freeform and multimodal: Notion-style rich
text, drag-and-drop images, moodboard snippets, links. Every element can
be **pinned** to build a shortlist. The agent is live-aware of everything
on the canvas — so prompts like _"give me five more like the pinned ones"_
or _"turn this moodboard into three visual directions"_ just work.

Projects can be fully freeform, or use **standardized templates** for
common jobs. The first template is a minimalist social media content
calendar — calendar view, agent tuned for content ideation, drag-and-drop
scheduling. More templates welcome.

## Who it's for

- **Solo founders** shaping a brand from scratch without hiring an agency.
- **In-house marketers** juggling multiple brands or sub-brands who need
  consistency without rebuilding context every time they open an AI tool.
- **Creators** whose brand is themselves, and who want their voice baked
  into everything they make.
- **Small agencies** managing a portfolio of client brands, with each
  brand's context cleanly separated and instantly available.

## Why open source

- **Self-hosted.** Runs on your own infrastructure. Brand data stays where
  you put it.
- **Bring your own LLM.** OpenRouter, Anthropic, OpenAI, or local models
  via Ollama — mix and match per workspace.
- **Modular at the seams.** Database, storage, auth, and LLM providers sit
  behind thin ports. Defaults work; swap them freely.
- **No vendor lock-in.** Standard data formats, exportable at any time.
  No recurring fees.

## Explore the docs

- 📖 [`docs/vision.md`](docs/vision.md) — the full product vision
- ✨ [`docs/highlevel-vision.md`](docs/highlevel-vision.md) — the elevator pitch
- 🏛 [`docs/architecture.md`](docs/architecture.md) — technical blueprint
- 🗺 [`docs/executing/scaffolding-plan.md`](docs/executing/scaffolding-plan.md) — phase-by-phase plan
- 📜 [`docs/changelog.md`](docs/changelog.md) — what's shipped, and why

## Contributing

Every PR runs [CI](.github/workflows/ci.yml) against lint, typecheck,
format-check, and the full vitest suite (server + web + shared) on a
Postgres 16 sidecar. Keep PRs focused, include a test for anything
non-trivial, and let `main` stay green.

The best ways to help right now:

- **Read the vision docs and push back.** If a decision doesn't hold up,
  we'd rather revise it before it's load-bearing.
- **Sanity-check the scaffolding plan.** Phase ordering, missing pieces,
  smoke checks that don't actually prove what they claim — all fair game.
- **Build with it** once the first runnable phases land, and file what
  breaks.

## Tech stack

TypeScript end-to-end. Vite + React + Tailwind + shadcn on the frontend,
Hono + Drizzle + Postgres on the backend, Vercel AI SDK for LLM plumbing.
Full rationale in [`docs/architecture.md`](docs/architecture.md).

## License

[MIT](LICENSE) — yours to use, fork, and self-host.
