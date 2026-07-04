# Index — Claude Code setup for Astropress (Git Bash + VS Code)

A complete, Astropress-specific Claude Code bundle for **Windows / Git Bash**, with
**VS Code** + the **Claude Code extension**, tailored to Astropress's real toolchain
(bun, Biome, Vitest, Playwright, cargo, lefthook) and its **`/ap-admin` User Interface**.

This bundle **adds to** the repo — it does **not** replace Astropress's existing
`CLAUDE.md`, `AGENTS.md`, or `llms.txt`. It supplies the `.claude/` machinery (permissions,
hooks, skills, path-scoped rules, slash commands) plus a `.vscode/` config and two
Git-Bash-safe scripts.

---

## 0. Fastest path

```bash
# In Git Bash, from the cloned repo root:
git clone https://github.com/Astropress/astropress.git
cd astropress

# (a) drop this bundle's contents into the repo root, then:
bash scripts/install-claude-bundle.sh     # copies .claude/ + .vscode/ in, chmod hooks, seeds .gitignore

# (b) make sure toolchains are present + bootstrap the repo (Git-Bash-safe):
bash scripts/bootstrap-gitbash.sh         # version-checks, prints winget hints, bun install, etc.
```

Then open the repo in VS Code (`code .`), accept the recommended extensions, sign in to
Claude Code, and start with `/doctor`. **Full step-by-step is in `RUNBOOK.md` and the
Word runbook.**

> **Windows install (read this):** Astropress ships a complete, self-contained
> **PowerShell** installer at `tooling/scripts/install.ps1` — this is the supported,
> working Windows path. Run it once (`pwsh tooling/scripts/install.ps1`) and it installs
> Python/Node/Bun/Rust (winget/scoop/choco with `.msi`/rustup fallbacks), Playwright,
> generates `.env`, runs `bun install`, builds the CLI, and tests. It does **not** use
> Git Bash. The Bash installer `tooling/scripts/install.sh` is **macOS/Linux/BSD only** —
> it still aborts in Git Bash (`uname -s` → `MINGW64_NT-…` → "Unsupported OS"). So:
> **install with `install.ps1` in PowerShell, then use Git Bash for the dev loop** (`git`,
> `bun`, `cargo`, `bun run …` all work there). `scripts/bootstrap-gitbash.sh` is an
> optional Git-Bash-native bootstrap/check, not a replacement for `install.ps1`.

---

## 1. Read-me-first documents

- **`Astropress_Claude_Code_Runbook.docx`** — the headline deliverable (Word). Git Bash
  install reality, Claude Code + VS Code extension setup, the `.claude/` bundle, the
  Claude-Code-native workflow including the **User Interface** (`/admin-page`), the
  Astropress-specific rules, signing, command reference, and course-correction prompts.
- **`RUNBOOK.md`** — the same content in Markdown (read it in the editor / on GitHub).

---

## 2. The setup bundle (place in the repo root)

```
repo/
  CLAUDE.append.md                  # OPTIONAL pointer to append to the repo's existing CLAUDE.md
  RUNBOOK.md                        # markdown how-to for this bundle
  .claude/
    settings.json                   # permissions + hooks (acceptEdits; allow bun/cargo/git/gh; deny .env/secrets/bare `bun test`/force-push)
    skills/                         # two tracks (Claude loads whichever fits the task)
      # Track A — build the app builder (the Astropress framework)
      project-architecture/SKILL.md # monorepo, Vite alias seam, arch-lint, no-speculative-providers
      cli-and-scaffolding/SKILL.md  # Rust CLI, scaffold templates, js_bridge, providers catalogue
      runtime-and-adapters/SKILL.md # host-runtime-module contract, platform-contracts, store seam
      admin-ui/SKILL.md             # the /ap-admin User Interface: security, a11y, i18n, design tokens
      security/SKILL.md             # invariants, Argon2id/KMAC256/ML-DSA-65, GHAS verification
      testing/SKILL.md              # BDD->integration->unit, never bare `bun test`, mutation conventions
      release-and-packaging/SKILL.md # exports/files, Changesets, consumer/tarball smoke, llms.txt
      # Track B — build an app ON Astropress (consumer)
      app-scaffold-and-wiring/SKILL.md  # astropress new, astro.config integration, host runtime modules
      app-content-modeling/SKILL.md     # registerCms (templateKeys/seedPages/archives/i18n), plugins
      app-providers-and-deploy/SKILL.md # data services, astropress add, deploy targets, prod .env
    rules/                          # path-scoped: load only when matching files are touched
      admin-pages.md  adapters.md  integrations.md  security-boundary.md  tests.md  cli-rust.md  docs.md
    hooks/
      secret-guard.sh               # PreToolUse  — chmod +x
      format-changed.sh             # PostToolUse — chmod +x
      verify.sh                     # Stop (fast gate) — chmod +x
    commands/                       # Track A + Track B (see section 3)
      # Track A: doctor  bdd  slice  new-adapter  new-integration  admin-page
      #          review  security-review  a11y  verify  pr-ready  docs-sync
      # Track B: scaffold-app  wire-host-runtime  content-model  add-provider  deploy-app
  .vscode/
    extensions.json                 # claude-code + biome + astro + rust-analyzer + playwright + gherkin + toml
    settings.json                   # Biome formatter/format-on-save, rust-analyzer clippy, Claude Code acceptEdits
  scripts/
    bootstrap-gitbash.sh            # Git-Bash-safe repo bootstrap (the install.sh gap-filler)
    install-claude-bundle.sh        # copies .claude/ + .vscode/ in, chmod hooks, seeds .gitignore
```

After placing the three `.sh` hooks (if you copied by hand): `chmod +x .claude/hooks/*.sh`

---

## 3. Slash commands (issue these to drive the work)

**Track A — build the app builder (framework dev):**
- **Setup/health:** `/doctor`
- **Build:** `/bdd <behaviour>` · `/slice <area>` · `/new-adapter <service>` · `/new-integration <tool>` · `/admin-page <screen>`
- **Review:** `/review [path]` · `/security-review [path]` · `/a11y [page]`
- **Ship:** `/verify` · `/pr-ready` · `/docs-sync`

**Track B — build an app on Astropress (consumer):**
- `/scaffold-app <name + provider>` · `/wire-host-runtime <module>` · `/content-model <model>` · `/add-provider <provider>` · `/deploy-app <target>`

The **User Interface** is first-class on Track A: `/admin-page` builds/edits `/ap-admin`
screens with the security (no inline JS / no raw HTML), action-wrapper, store-seam, WCAG
2.2 AA, and i18n invariants enforced; `/a11y` runs the axe + admin-harness review. On
Track B, `/scaffold-app` + `/wire-host-runtime` stand up a consumer app and its DB/auth
runtime, `/content-model` drives `registerCms()`, and `/deploy-app` ships it.

---

## 4. Setup order

1. `git clone` the repo in **Git Bash**; place this bundle's contents in the repo root.
2. `bash scripts/install-claude-bundle.sh` (or copy `.claude/` + `.vscode/` by hand, then
   `chmod +x .claude/hooks/*.sh`).
3. Install the toolchains + bootstrap the repo. **Recommended:** in PowerShell run
   `pwsh tooling/scripts/install.ps1` (Python/Node ≥ 24.8/Bun/Rust + Playwright + `.env` +
   `bun install` + CLI build + tests). *Or*, from Git Bash, `bash scripts/bootstrap-gitbash.sh`
   (version-checks with winget hints, then `bun install`, Playwright, `.env`, `cargo build`,
   `audit:arch`). Do **not** run `install.sh` in Git Bash — it's macOS/Linux/BSD only.
4. Install **Claude Code** (PowerShell: `irm https://claude.ai/install.ps1 | iex`, or
   `winget install Anthropic.ClaudeCode`). Set `CLAUDE_CODE_GIT_BASH_PATH` if needed
   (already in `settings.json`).
5. Open the repo in **VS Code**, accept the recommended extensions, sign in to the Claude
   Code extension.
6. `git add .claude .vscode .gitignore && git commit -S -m "chore: Claude Code setup"`
   (signed — `main` requires it).
7. Drive the loop: `/doctor` → `/bdd` → `/slice` (or `/admin-page` for UI) → `/verify` →
   `/review` + `/security-review` + `/a11y` → `/pr-ready`.

---

## Notes

- **Windows unzip + dotfolders:** some Windows archive tools hide or skip dot-prefixed
  entries (`.claude/`, `.vscode/`). If those folders look missing after extracting, enable
  "show hidden items", or extract with Git Bash: `unzip astropress_claude_code_runbook.zip`.
  `scripts/install-claude-bundle.sh` also re-creates/copies them into place.
- **Hooks are jq-free** (grep/sed only) and fail safe — they work in Git Bash and before
  `bun install` finishes. `format-changed.sh` uses the **repo-local** Biome (not `bunx`),
  matching the pin.
- **The hooks are deliberately light.** `verify.sh` runs only a fast gate (Biome check +
  `audit:arch`). The heavy ~10-min suite (arch + BDD + 1500+ Vitest + Playwright +
  mutation) stays in the **lefthook pre-push** hook and CI, where it belongs.
- **`CLAUDE.append.md` is optional.** The repo's existing `CLAUDE.md`/`AGENTS.md` already
  carry the core rules; append the pointer only if you want the `.claude/` bundle
  explicitly referenced.
- **Verify your Claude Code version** recognizes `.claude/commands/` frontmatter (`/help`).
  The workflow in `RUNBOOK.md` §6 works regardless of command support.
- **MinTTY caveat:** if the interactive `claude` REPL throws "Raw mode is not supported"
  in the classic Git Bash window, launch `claude` from Windows Terminal / PowerShell — it
  still uses Git Bash under the hood for bash commands.
- **Signed commits** are required on `main` (branch ruleset + `verify-signing` lefthook) —
  see `RUNBOOK.md` §8.
