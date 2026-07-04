# Astropress — Claude Code Runbook (Git Bash + VS Code)

A complete, Astropress-specific setup for driving development with **Claude Code** on
**Windows using Git Bash (Git for Windows)**, with **VS Code** and the **Claude Code
extension**, and a drop-in `.claude/` config bundle. The workflow is Claude-Code-native:
it drives behaviour through the product's mechanisms (plan mode, permission modes,
hooks, skills, slash commands) rather than one giant pasted prompt — and it is tailored
to Astropress's real toolchain (bun, Biome, Vitest, Playwright, cargo, lefthook) and its
admin **User Interface**.

> Repo reviewed: `https://github.com/Astropress/astropress` — a TypeScript + Rust
> monorepo (Astro-based web framework) with a headless **`/ap-admin`** UI, a REST API,
> a SQLite runtime, provider adapters, an MCP server, and heavy quality gates.

---

## 0. What this bundle adds (and what it deliberately leaves alone)

The repo already ships an excellent `CLAUDE.md`, a deep `AGENTS.md`, and `llms.txt`.
**This bundle does not replace them.** It adds the `.claude/` machinery around them:

```
.claude/
  settings.json                 permissions + hooks (committed, team-shared)
  hooks/
    secret-guard.sh             PreToolUse: block private keys / tokens (jq-free, Git Bash safe)
    format-changed.sh           PostToolUse: format edited file with the repo-local Biome
    verify.sh                   Stop: FAST gate (Biome check + audit:arch) — not the 10-min suite
  skills/
    # Track A — building the app builder (the Astropress framework itself)
    project-architecture/SKILL.md   monorepo, Vite alias seam, arch-lint rules, no-speculative-providers
    cli-and-scaffolding/SKILL.md    the Rust CLI, templates, js_bridge, providers catalogue, deploy/import
    runtime-and-adapters/SKILL.md   host-runtime-module contract, platform-contracts, store seam, provider-purity
    admin-ui/SKILL.md               the /ap-admin User Interface: security, a11y, i18n, design tokens
    security/SKILL.md               invariants, Argon2id/KMAC256/ML-DSA-65, GHAS verification
    testing/SKILL.md                BDD->integration->unit, never bare `bun test`, mutation conventions
    release-and-packaging/SKILL.md  exports/files, Changesets, npm-consumer/tarball smoke, llms.txt honesty
    # Track B — building an app ON Astropress (consumer)
    app-scaffold-and-wiring/SKILL.md  astropress new, astro.config integration, host runtime modules
    app-content-modeling/SKILL.md     registerCms (templateKeys/seedPages/archives/i18n), plugins, pages
    app-providers-and-deploy/SKILL.md data services, astropress add, deploy targets, prod .env
  rules/                         path-scoped, load only when matching files are touched
    admin-pages.md  adapters.md  integrations.md  security-boundary.md  tests.md  cli-rust.md  docs.md
  commands/                      slash commands — Track A + Track B (see the reference below)
.vscode/
  extensions.json  settings.json   Claude Code + Biome + Astro + rust-analyzer + Playwright + Gherkin
scripts/
  bootstrap-gitbash.sh           Git-Bash-safe repo bootstrap (the install.sh gap-filler)
  install-claude-bundle.sh       copies .claude/ + .vscode/ in and makes hooks executable
CLAUDE.append.md                 optional pointer to append to the repo's CLAUDE.md
```

**Why the split:** `CLAUDE.md` and unscoped rules load every turn and cost context, so
they stay small. Skills load only when relevant; path-scoped rules load only when Claude
opens matching files; hooks **enforce** what instructions can only request.

### Two skill tracks

The skills are organized into two tracks, because "working on Astropress" means two
very different jobs:

- **Track A — build the app builder.** You are developing the Astropress framework
  itself: the monorepo, the Rust CLI and its scaffold templates, the host-runtime and
  platform contracts, the admin UI engine, the test/security gates, and the published
  package. Skills: `project-architecture`, `cli-and-scaffolding`, `runtime-and-adapters`,
  `admin-ui`, `security`, `testing`, `release-and-packaging`.
- **Track B — build an app on Astropress.** You are a consumer using
  `@astropress-diy/astropress` as a dependency to build your own site with a built-in
  admin: scaffold with `astropress new`, wire `astro.config.mjs`, provide the host
  runtime modules (DB/auth), model content with `registerCms()`, add providers, and
  deploy. Skills: `app-scaffold-and-wiring`, `app-content-modeling`,
  `app-providers-and-deploy`.

Claude loads whichever track's skills the current files and request call for; you don't
choose manually. The slash commands are likewise grouped — `/slice`, `/new-adapter`,
`/admin-page`, `/security-review`, `/pr-ready` etc. for Track A; `/scaffold-app`,
`/wire-host-runtime`, `/content-model`, `/add-provider`, `/deploy-app` for Track B.

---

## 1. Prerequisites (Windows)

| Tool | Version | Why | Install (PowerShell/CMD, then reopen the shell) |
|------|---------|-----|--------------------------------------------------|
| **Git for Windows** | latest | Provides Git **and** Git Bash; also required by Claude Code's Bash tool | `winget install --id Git.Git -e` |
| **Node.js** | **≥ 24.8** | Runtime floor | `winget install --id OpenJS.NodeJS -e` |
| **Bun** | **1.3.x** | The package manager + script runner Astropress uses | `winget install --id Oven-sh.Bun -e` |
| **Rust (rustup)** | stable | Builds the `astropress-cli` crate | `winget install --id Rustlang.Rustup -e` then `rustup default stable` |
| **VS Code** | **≥ 1.98** | IDE + Claude Code extension | `winget install --id Microsoft.VisualStudioCode -e` |

When you install Git for Windows, keep **"Add Git to PATH"** checked (default).

---

## 2. Install Astropress (Windows: PowerShell installer, then Git Bash for the loop)

### The recommended path: the PowerShell installer

Astropress ships a complete, self-contained Windows installer at
`tooling/scripts/install.ps1`. **This is the supported, working Windows path** — run it
once from PowerShell and it does everything:

```powershell
# From the repo root, in PowerShell (5.1 or 7+)
git clone https://github.com/Astropress/astropress.git
cd astropress
pwsh tooling/scripts/install.ps1        # or:  powershell -ExecutionPolicy Bypass -File tooling\scripts\install.ps1
#   flags: -SkipTests   -SkipPlaywright
```

It checks/installs Python, Node ≥ 24.8, Bun 1.3.x, and Rust (via winget/scoop/choco,
falling back to the Node `.msi` and `rustup-init.exe` when no package manager is present),
installs Playwright browsers, generates `.env` with a fresh session secret, runs
`bun install`, builds the Rust CLI, and runs the test suite. It does **not** depend on
Git Bash at all.

### Why not just run install.sh in Git Bash?

Because `tooling/scripts/install.sh` is the **macOS / Linux / BSD** installer and still
won't run under Git Bash:

- Its OS detection switches on `uname -s`; in Git Bash that returns `MINGW64_NT-…`, which
  hits the `*) die "Unsupported OS"` branch and stops immediately.
- Even past that, it assumes **nvm**, **sudo apt/dnf/pacman**, and the Unix **rustup
  shell script** — none of which work cleanly on Windows / Git Bash.

So on Windows you run `install.ps1` (PowerShell) for the one-time toolchain + bootstrap,
and then **use Git Bash for day-to-day work** — `git`, `bun`, `cargo`, and the
`bun run …` scripts all work there because they're Windows binaries MSYS resolves
normally. That's the split: PowerShell installs, Git Bash drives.

### Optional: a Git-Bash-native bootstrap/check

If you'd rather not open PowerShell (or want a quick environment check from Git Bash),
the bundle includes `scripts/bootstrap-gitbash.sh` as a convenience gap-filler. It does
**not** replace `install.ps1` — it version-checks each tool, prints the exact `winget`
commands for anything missing, then runs the Git-Bash-safe repo steps (`bun install`,
Playwright browsers, `.env`, `cargo build`, `audit:arch`). Use it when the toolchains are
already installed and you just want to bootstrap/verify from Bash:

```bash
# In Git Bash, only if you prefer it over install.ps1
git clone https://github.com/Astropress/astropress.git
cd astropress
bash scripts/bootstrap-gitbash.sh
#    flags: --skip-playwright  --skip-build
```

`bootstrap-gitbash.sh` detects MSYS, checks versions, prints the precise `winget`
commands for anything missing, then performs the
Git-Bash-safe bootstrap and a light `audit:arch` check.

### Scaffold and run a site

```bash
cargo run --bin astropress-cli -- new my-site --provider sqlite
cd my-site && bun install
../target/debug/astropress-cli dev --project-dir .
# Admin UI:  http://localhost:4321/ap-admin    (admin / admin123 from .env)
```

> Contributing to the framework itself? `bun run test` runs arch-lint (TS + Rust) + BDD
> + the Vitest suite. The full pre-push gate (lefthook) is ~10 minutes.

---

## 3. Install Claude Code (Windows)

The current recommended install is the **native installer** (no Node required). Run it
in **PowerShell**:

```powershell
irm https://claude.ai/install.ps1 | iex
```

Alternatives: `winget install Anthropic.ClaudeCode` (update with
`winget upgrade Anthropic.ClaudeCode`), or the **deprecated** npm route
`npm install -g @anthropic-ai/claude-code` (needs Node 18+). After installing, **close
and reopen** the terminal so PATH updates, then check `claude --version`.

**Git for Windows is required.** Claude Code uses Git Bash internally for its Bash tool.
If it can't find it, set the path (the bundle's `.claude/settings.json` already includes
this `env`; adjust if Git is elsewhere):

```
CLAUDE_CODE_GIT_BASH_PATH=C:\Program Files\Git\bin\bash.exe
```

**Running the session:** the bundle is built for Git Bash workflows, but if launching the
interactive `claude` REPL **inside the classic Git Bash (MinTTY) window** throws
*"Raw mode is not supported"*, start `claude` from **Windows Terminal** or **PowerShell**
instead. Claude Code still uses Git Bash under the hood for bash commands, and all the
hooks/scripts in this bundle are Git-Bash-safe.

---

## 4. Set up VS Code + the Claude Code extension

1. Open the repo folder in VS Code (`code .`).
2. VS Code will prompt to install the **recommended extensions** from
   `.vscode/extensions.json`:
   - **`anthropic.claude-code`** — the official Claude Code extension (inline diffs,
     plan review, @-mentions, conversation history). Requires VS Code **≥ 1.98**.
   - `biomejs.biome`, `astro-build.astro-vscode`, `rust-lang.rust-analyzer`,
     `ms-playwright.playwright`, `alexkrechik.cucumberautocomplete` (Gherkin),
     `tamasfe.even-better-toml`.
   To install manually: `Ctrl+Shift+X` → search **"Claude Code"** (by Anthropic) →
   Install. (Forks like Cursor: install from Open VSX, or `cursor:extension/anthropic.claude-code`.)
3. Open a file and click the **✱ Claude Code** spark icon (top-right editor toolbar), or
   the Status Bar chip, or `Ctrl+Shift+P → "Claude Code"`. Sign in with your paid Claude
   plan (Pro/Max/Team/Enterprise) or Console account on first launch.
4. The extension bundles its own CLI for the panel. To also run `claude` in VS Code's
   integrated terminal, keep the standalone CLI from step 3 installed.

`.vscode/settings.json` sets **Biome** as the formatter with format-on-save and
organize-imports, points rust-analyzer at `crates/Cargo.toml` with clippy, wires the
Gherkin helper to `tooling/bdd`, and starts Claude Code in `acceptEdits` mode.

---

## 5. Place the bundle and commit it

If you extracted this package **inside** the repo root, the `.claude/` and `.vscode/`
folders are already in place — just make the hooks executable. Otherwise:

```bash
bash scripts/install-claude-bundle.sh        # copies .claude/ + .vscode/ in, chmod hooks, seeds .gitignore
chmod +x .claude/hooks/*.sh                   # if you copied by hand

git add .claude .vscode .gitignore
git commit -S -m "chore: Claude Code setup"   # signed — main requires it
```

Commit the team config so everyone shares the same rules and hooks. (`-S` signs the
commit; the repo's branch ruleset and the `verify-signing` lefthook hook require signed
commits on `main` — see §8.)

---

## 6. The Claude-Code-native workflow

### Permission modes (stop the constant prompts) — pick per phase

- **Design / planning:** launch in plan mode — `claude --permission-mode plan`. Claude
  analyzes and proposes; nothing is written until you approve.
- **Implementation:** the committed `defaultMode: "acceptEdits"` auto-approves edits, and
  the allow-list covers the common `bun run …`, `cargo …`, and `git …` commands so they
  don't prompt. (Bare `bun test` is **denied** on purpose — see §7.)
- **Long autonomous runs:** switch to `auto` mode. Reserve `bypassPermissions` for
  disposable containers only.

### The loop

1. **Behaviour first (`/bdd`).** Capture the user-visible behaviour as a Gherkin scenario
   in `tooling/bdd/*.feature` before touching code. `bun run bdd:lint`.
2. **Plan the slice.** In plan mode, agree on the package/layer and the vertical slice.
   Respect the Vite alias seam and arch-lint boundaries (see the project-architecture
   skill).
3. **Build one vertical slice (`/slice`).** BDD → integration/contract test (real SQLite,
   no mocks) → unit → code. Keep files < 600 lines; split pure-data constants into
   `*-data.ts` siblings.
4. **For UI work, use `/admin-page`.** It enforces the admin-ui invariants automatically
   (next section).
5. **Verify (`/verify`)**, then **review (`/review`, `/security-review`, `/a11y`)**, then
   **ship (`/pr-ready`)**.

### Building the User Interface (`/admin-page`)

The admin panel under **`/ap-admin`** is server-rendered Astro with progressive
enhancement. `/admin-page <screen>` builds or edits it with the guardrails baked in:

- **No inline JS** (`<script is:inline>`, `on<event>=`), **no `contenteditable`** in
  admin/auth surfaces, **no `set:html` of untrusted content**, **no raw `innerHTML =`** —
  content is sanitized. (`bun run audit:security` fails CI on violations.)
- **Every form action** in `pages/ap-admin/actions/*.ts` is wrapped with
  `withAdminFormAction` / `requireAdminFormAction` (auth + CSRF + authorization + audit).
- **Data goes through `withAdminStore()`** — pages never import `sqlite-runtime/`
  directly, which is what lets the same UI run on SQLite, D1, Supabase, etc.
- **Localized** (no hardcoded English — `audit:admin-i18n-leaks`), **WCAG 2.2 AA**
  (axe + the `admin-harness` Playwright projects), **design tokens** (no hardcoded
  colours), and **specific microcopy** (no banned generic phrases).

### Verification (automatic + on demand)

- The **hooks** do the routine work: `format-changed.sh` formats every edited file with
  the repo-pinned Biome; `verify.sh` runs a fast gate (Biome check + `audit:arch`) at the
  end of each turn and blocks finishing if it fails.
- The **heavy gates stay where they belong** — the lefthook **pre-push** suite (~10 min:
  arch + BDD + 1500+ Vitest + Playwright + mutation) and CI. The hooks here intentionally
  do **not** duplicate them.

### Parallel work with worktrees (optional)

Give each stream its own git worktree so several people (or sessions) build without merge
collisions. The committed `.claude/` travels with the repo, so every worktree inherits the
same rules and hooks:

```bash
git worktree add ../ap-admin-ui  -b feat/admin-ui
git worktree add ../ap-adapters  -b feat/adapters
cd ../ap-admin-ui && claude
```

### Pull requests & CI

Claude commits to the branch (signed), opens a PR (`gh pr create`), and waits for checks.
Required checks: `lint`, `test-unit`, `test-cli`. For any security-relevant change, run
`/pr-ready` → `bun run check:pr-ghas` against the **PR merge ref** before declaring it
fixed (the branch-ref scan can be stale).

---

## 7. The Astropress-specific rules Claude follows

These are encoded in the skills/rules and matter most:

- **bun, not npm.** Scripts run via `bun run …`. **Never bare `bun test`** (Bun's native
  runner lacks `vi.hoisted`/`vi.stubGlobal`) — use `bun run --filter astropress test`.
  This form is **deny-listed** in `settings.json`.
- **Biome, not Prettier/ESLint** — and via the **repo-local** binary, never `bunx`
  (registry-latest can disagree with the pin).
- **Arch boundaries fail CI:** no `.js` in `src/`, files ≤ 600 lines, SQL containment,
  dispatch containment, dependency direction, Rust command-isolation / provider-purity.
- **No speculative providers/integrations.** A service must exist at a real URL and be in
  `tooling/verified-providers.json` (`audit:providers`) before any adapter code.
- **Crypto naming:** Argon2id (passwords), KMAC256 (token/privacy digests), ML-DSA-65
  (outbound webhook signatures). Don't use SHA-2/PBKDF2 names for Astropress's own crypto.
- **Honesty + microcopy:** no maturity overclaims, no banned generic error phrases.
- **Signed commits**, linear history, no force-push.

---

## 8. Signing setup (required for `main`)

All commits to `main` must be **signed** (branch ruleset + `verify-signing` lefthook).
One-time:

```bash
# SSH signing (simplest if you already push over SSH)
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
# then add the key at GitHub → Settings → SSH and GPG keys → New SIGNING key
```

Also recommended: `git config --global fetch.prune true`.

---

## 9. Command reference

**Track A — building the app builder (framework dev):**

| Command | Purpose |
|---------|---------|
| `/doctor` | Verify the local env (Git Bash friendly) and project health |
| `/bdd <behaviour>` | Write/update the Gherkin scenario first |
| `/slice <area>` | Implement one vertical slice end-to-end with the gates |
| `/new-adapter <service>` | Scaffold a storage adapter (verified-providers gate first) |
| `/new-integration <tool>` | Scaffold an external-tool integration |
| `/admin-page <screen>` | Build/modify an `/ap-admin` UI screen (security + a11y + i18n) |
| `/review [path]` | Adversarial pre-PR review (arch + UI/security + tests) |
| `/security-review [path]` | Deep security review against the threat model |
| `/a11y [page]` | WCAG 2.2 AA review with axe + admin-harness |
| `/verify` | Run the local gates for the current change set |
| `/pr-ready` | Full pre-push checklist incl. signed commit + GHAS merge-ref check |
| `/docs-sync` | Regenerate derived docs; fix honesty/links/API drift |

**Track B — building an app on Astropress (consumer):**

| Command | Purpose |
|---------|---------|
| `/scaffold-app <name + provider>` | `astropress new` + wire `astro.config.mjs` and host runtime modules |
| `/wire-host-runtime <module>` | Implement/fix the DB/auth/CMS-registry host runtime modules |
| `/content-model <model>` | Define `registerCms()` (templateKeys, seedPages, archives, i18n, plugins) |
| `/add-provider <provider>` | Add a data service or analytics/AB/heatmap via `astropress add` |
| `/deploy-app <target>` | Deploy to github-pages / vercel / netlify / cloudflare / gitlab-pages / render-static |

Useful repo scripts: `bun run test`, `bun run --filter @astropress-diy/astropress test`,
`bun run test:coverage`, `bun run test:acceptance` (Playwright UI), `bun run test:cli`,
`bun run test:consumer-smoke`, `bun run test:tarball-smoke`,
`bun run audit:arch` / `audit:arch:rust` / `audit:security` / `audit:providers` /
`audit:admin-i18n-leaks`, `bun run docs:api:check`, `bun run check:pr-ghas`,
`bun run repo:clean`. Consumer CLI: `astropress new`, `astropress add`, `astropress dev`,
`astropress deploy --target <t>`, `astropress doctor [--strict]`, `astropress list providers`.

---

## 10. Course-correction prompts (if Claude drifts)

- Jumps into code: *"Stop. Write the BDD scenario and agree the slice first; we're in plan mode."*
- Bare `bun test`: *"Use `bun run --filter astropress test` — never bare `bun test`."*
- Adds an unrequested provider: *"Remove it. No speculative providers — it must be in verified-providers.json and audit:providers must pass first."*
- Inline handler / raw HTML in admin: *"No inline JS or raw innerHTML/set:html in admin surfaces. Sanitize and use the action wrapper + store seam."*
- Hardcoded English in the UI: *"Localize via the label/i18n helpers; audit:admin-i18n-leaks must pass."*
- Wrong crypto name: *"Astropress uses Argon2id / KMAC256 / ML-DSA-65 — fix the naming."*
- Claims a security fix is done: *"Push, wait for checks, then run `bun run check:pr-ghas` on the merge ref before declaring it fixed."*

---

## Core principle

Behaviour first (BDD), then a real-DB test, then the slice, with the security and
accessibility invariants as acceptance criteria — and let plan mode, hooks, skills, and
the pre-push/CI gates enforce it rather than hoping a prompt will.
