# pdfedit

PDF editor/signer: React + Vite renderer (`src/`), Electron shell (`electron/`). pdf.js renders, pdf-lib writes; placed signatures/text are PNG overlays flattened on save. Certificate signing runs in Electron main (`electron/sign.cjs`) via IPC (`preload.cjs` → `window.pdfedit`); the web build hides it.

## Team rule: sr / jr

Classify every task before starting and delegate with the Agent tool:

- **Easy → `jr`** (Haiku): well-specified, low-risk, usually one file — wording/labels, small CSS, docs/README, renames, running build/test.
- **Hard → `sr`** (Opus): multi-file features, design decisions, Electron main/IPC, signing, auto-update/release, security, performance, unknown-cause bugs.
- Mixed task: split it — sr does the hard core, jr the easy leftovers.
- The main session plans, writes the brief, reviews what comes back (diff + build/test output), and reports to the user. If jr reports the task is harder than expected, re-assign to sr.
- Tiny lookups or one-line fixes the main session can do in a couple of tool calls don't need delegation.

## Release rule

Before every release (`npm run release`, bumping `version`, or creating a `v*` tag) **ask the user which version number to use** — suggest one (patch for fixes, minor for features) but never pick it yourself, even if they said "release" or approved a previous release. The user's scheme is `<พ.ศ. date YYYYMMDD>.<n>.<patch>`, e.g. `25691111.1.0`. Also set `build.buildVersion` to the Windows-safe form (each part ≤ 65535): `<YYYY>.<MMDD>.<n>.<patch>`, e.g. `2569.1111.1.0`. Then: `npm version <x.y.z> --no-git-tag-version` → commit → `git tag v<x.y.z>` → push with tags → `npm run release` → remind the user to publish the draft on GitHub.
`npm run release` (scripts/release.cjs) takes the token only from `.release-token` (gitignored), never from the machine-wide `GH_TOKEN` — that one belongs to the user's other project. Never print or commit the token.

## Commands

- `npm run dev` — browser dev server · `npm run build:web` — web app into `dist/`
- `npm start` — build + run Electron · `npm run dist` — Windows installer into `release/`
- `npm test` — certificate-signing test

## Gotchas

- Claude's shell sets `ELECTRON_RUN_AS_NODE=1`; prefix Electron commands with `env -u ELECTRON_RUN_AS_NODE`.
- Close any running "PDF Edit" process before `npm run dist` (EPERM on release/win-unpacked).
- Runtime deps used only by the renderer (react, pdfjs-dist) stay in devDependencies (Vite bundles them). Anything `require`d by `electron/` must be in dependencies.
- Users talk in Thai; UI text is Thai.
