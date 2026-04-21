# Phase 0 Completion — Repo Foundation

**Status:** complete
**Scope:** [scaffolding-plan.md § Phase 0](../executing/scaffolding-plan.md)
**Smoke check:** `pnpm install && pnpm lint && pnpm typecheck` — all green.

This doc records exactly what was done, where, and why, so future phases (and
contributors) can build on the foundation without re-deriving decisions.

---

## Goal

Stand up an empty-but-well-shaped pnpm monorepo that installs, lints, and
typechecks cleanly, with nine peer workspaces ready to be filled in by later
phases. No feature code, no dependencies beyond tooling.

## Final repo shape

```
brandfactory/
├── .editorconfig
├── .gitattributes
├── .gitignore
├── .husky/pre-commit
├── .nvmrc
├── .prettierignore
├── .prettierrc
├── eslint.config.js
├── LICENSE
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── docs/
│   ├── architecture.md
│   ├── highlevel-vision.md
│   ├── vision.md
│   ├── completions/phase0.md          ← this file
│   ├── executing/scaffolding-plan.md
│   └── ref/example-brand-wikis.md
├── packages/
│   ├── web/         { package.json, tsconfig.json, src/index.ts }
│   ├── server/      { package.json, tsconfig.json, src/index.ts }
│   ├── shared/      { package.json, tsconfig.json, src/index.ts }
│   ├── db/          { package.json, tsconfig.json, src/index.ts }
│   ├── agent/       { package.json, tsconfig.json, src/index.ts }
│   └── adapters/
│       ├── auth/       { package.json, tsconfig.json, src/index.ts }
│       ├── storage/    { package.json, tsconfig.json, src/index.ts }
│       ├── realtime/   { package.json, tsconfig.json, src/index.ts }
│       └── llm/        { package.json, tsconfig.json, src/index.ts }
└── scripts/
    └── dev.sh
```

## Files created

### Root tooling

| File                   | Purpose                                                                                                                                                                                                                                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`         | Root workspace manifest. Declares `packageManager: pnpm@10.28.2`, `engines.node: >=20.11.0`, dev-only tooling deps (ESLint 9, Prettier 3, TypeScript 5.6, typescript-eslint 8, husky 9, lint-staged 15), and the root scripts: `dev`, `build`, `lint`, `lint:fix`, `format`, `format:check`, `typecheck`, `test`, `prepare`. Lint-staged config is inlined under `lint-staged`. |
| `pnpm-workspace.yaml`  | Declares workspace globs `packages/*` and `packages/adapters/*` — the nested second glob is what lets the adapter sub-grouping live under `packages/adapters/` while still being peer workspaces.                                                               |
| `.nvmrc`               | Pins Node 20 LTS as the minimum supported runtime. Host machine can be newer; this is the floor.                                                                                                                                                                |
| `.editorconfig`        | LF line endings, UTF-8, 2-space indent, final newline, trim trailing whitespace. Markdown opts out of trailing-whitespace trim (line breaks in md).                                                                                                             |
| `.gitignore`           | Standard ignores: `node_modules`, build outputs (`dist`, `build`, `out`, `*.tsbuildinfo`), env files, logs, OS junk, editor dirs, coverage, `.turbo`, `.eslintcache`.                                                                                           |
| `.gitattributes`       | Forces LF line endings cross-platform; marks common binary file types.                                                                                                                                                                                          |
| `.prettierrc`          | `semi: false`, `singleQuote: true`, `trailingComma: all`, `printWidth: 100`, `arrowParens: always`. Modern-TS defaults; change later if the team wants.                                                                                                         |
| `.prettierignore`      | Excludes `node_modules`, build outputs, `pnpm-lock.yaml`, and — intentionally — `docs/`. Authored prose should not be auto-rewrapped. READMEs inside packages can opt back in later if needed.                                                                  |
| `tsconfig.base.json`   | Shared strict compiler settings (see below).                                                                                                                                                                                                                    |
| `tsconfig.json`        | Root tsconfig extending the base with empty `include`. Exists for IDE root-dir convenience; package-level tsconfigs do the real work.                                                                                                                           |
| `eslint.config.js`     | Flat ESLint 9 config. Combines `@eslint/js` recommended, `typescript-eslint` recommended, then `eslint-config-prettier` last (disables stylistic rules that Prettier owns). Adds one rule tweak: unused vars prefixed with `_` are ignored.                     |
| `.husky/pre-commit`    | Runs `pnpm lint-staged` on commit. Installed at `pnpm install` time via the `prepare` script (`husky` v9).                                                                                                                                                     |
| `scripts/dev.sh`       | Placeholder dev entrypoint — lists workspaces and notes that per-package `dev` scripts land in Phases 4 (server) and 7 (web). Marked executable.                                                                                                                |

### `tsconfig.base.json` — key decisions

```json
{
  "target": "ES2022",
  "lib": ["ES2022"],
  "module": "ESNext",
  "moduleResolution": "Bundler",
  "strict": true,
  "noUncheckedIndexedAccess": true,
  "noImplicitOverride": true,
  "noFallthroughCasesInSwitch": true,
  "esModuleInterop": true,
  "skipLibCheck": true,
  "isolatedModules": true,
  "verbatimModuleSyntax": true,
  "resolveJsonModule": true,
  "forceConsistentCasingInFileNames": true,
  "allowSyntheticDefaultImports": true,
  "noEmit": true
}
```

Why these:

- **`moduleResolution: "Bundler"`** — works for Vite (web) and is a valid
  typecheck-only setting for Node packages. Keeps one base across the
  monorepo. When the server adds a build step later, it can override.
- **`strict: true` plus `noUncheckedIndexedAccess`** — catches "array lookup
  might be undefined" at compile time, which is the single biggest bug
  source in TS code.
- **`verbatimModuleSyntax: true`** — forces explicit `import type` usage.
  Prevents accidentally bundling types as runtime imports and aligns with
  ESM-only packages.
- **`isolatedModules: true`** — required for Vite (and many tsx/esbuild
  pipelines) to transpile files independently.
- **`noEmit: true`** — Phase 0 only typechecks. Later phases that need emit
  (e.g. building the server for Docker) override.

### Per-package files (repeated pattern for all 9 workspaces)

Each workspace is a near-identical stub:

- **`package.json`** — scoped name `@brandfactory/<pkg>` (adapter packages
  use `@brandfactory/adapter-<name>`), `private: true`, `type: "module"`,
  `main` + `exports` pointing at `./src/index.ts`, and two scripts:
  `typecheck` (`tsc --noEmit`) and `lint` (`eslint .`).
- **`tsconfig.json`** — extends `../../tsconfig.base.json` (or three levels
  up for adapters), sets `rootDir: "src"`, includes `src/**/*.ts`. Node-side
  packages (`server`, `db`, `agent`, all adapters) add `"types": ["node"]`
  to pick up `@types/node` from the root. `web` adds `"DOM", "DOM.Iterable"`
  to `lib` and includes `.tsx`.
- **`src/index.ts`** — contains `export {}` so `tsc` has something to check.

### Why `exports` / `main` point at `.ts` source, not built `.js`

Phase 0 has no build step. During development the server will run via
`tsx`, the web app via Vite; both consume TypeScript sources directly.
Shipping built output is a concern for Docker images (Phase 8), at which
point individual packages gain `build` scripts and `exports` can be
widened to a conditional form (`{"types": "./dist/*.d.ts", "default":
"./dist/*.js"}`). Keeping it simple now avoids premature build complexity.

### `@types/node` at the root

Installed once at the root instead of per-package. Any package that wants
it references it via `"types": ["node"]` in its tsconfig. Avoids version
drift across the monorepo.

---

## Decisions made during execution

A few small calls that deviated from or refined the plan:

### No TypeScript project references in the root tsconfig

The plan implied a possible references setup. Project references require
`"composite": true` in every referenced tsconfig and a build orchestration
step. It's useful for incremental builds once the monorepo is large, but
right now `pnpm -r --parallel typecheck` runs each package's `tsc` in
parallel and is perfectly fast. Deferred — can add later if typecheck
latency becomes a real problem.

### `docs/` added to `.prettierignore`

The initial Prettier check flagged `docs/architecture.md`,
`docs/executing/scaffolding-plan.md`, and `docs/ref/example-brand-wikis.md`
for rewrapping. These are authored prose with deliberate paragraph breaks
and hand-managed line lengths — Prettier's markdown wrap would mangle them.
Excluded `docs/` wholesale. Individual READMEs inside packages can opt back
in later if we want them formatted.

### `pnpm-workspace.yaml` rewritten by Prettier

Prettier normalized the YAML to single-quoted strings (`'packages/*'`
instead of `"packages/*"`). Left as-is — it's a single-source format
choice, no functional difference.

### Husky pre-commit hook uses only `lint-staged`

No separate `tsc` in the hook. Typecheck stays in CI and in the
`typecheck` script. Pre-commit must be fast, and `lint-staged` already
runs `eslint --fix` on staged TS files, which catches the bulk of problems
locally.

### Scripts shape

- `typecheck` uses `pnpm -r --parallel typecheck`, not a single-invocation
  `tsc -b`. Matches the "each package is independent" model and doesn't
  require `composite: true`.
- `lint` runs at the root (ESLint discovers all files via its own ignores)
  rather than per-package, because one root flat config covers everything.
- `build`, `test` also use `pnpm -r --parallel` so they fan out to
  per-package scripts as those get defined in later phases. Safe no-op now.
- `dev` delegates to `scripts/dev.sh`, which is a placeholder until
  packages have real dev targets.

---

## Verification

All three phase-gate checks pass on a fresh install:

```
$ pnpm install        # resolves, installs tooling, runs husky prepare
$ pnpm lint           # ESLint → 0 problems
$ pnpm typecheck      # 9/9 workspaces pass tsc --noEmit in parallel
```

Bonus check:

```
$ pnpm format:check   # Prettier clean (docs excluded)
```

## What this does NOT include (and why)

- **Real code in any package.** Every `src/index.ts` is `export {}`. Types,
  schemas, DB bindings, server routes, UI components — all land in their
  respective later phases.
- **Runtime dependencies.** No `hono`, `drizzle`, `react`, `ai`, `zod`,
  etc. Those come in when the phase that needs them lands, so dep
  versions are pinned next to their first actual use.
- **CI config.** GitHub Actions is Phase 8.
- **Docker.** Also Phase 8.
- **`.env.example`.** Also Phase 8, when we know which env vars matter.
- **`README.md` at root.** Deferred to Phase 8 per the plan. Until then,
  `docs/` is authoritative.
- **Project references / incremental build.** Deferred until scale demands
  it.

## Ready for Phase 1

The repo now installs, lints, and typechecks with a flat workspace layout
matching the architecture doc. Phase 1 (the `@brandfactory/shared` package
— domain types and Zod schemas) can land directly on top without any
restructuring.
