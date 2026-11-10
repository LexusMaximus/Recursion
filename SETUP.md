# Setup: Recursion -> Lumiverse with Cline

## 1. Install
1. Work in your fork on a branch: `git switch -c lumiverse-port`.
2. Install the vibe-kit into the fork root, but DO NOT overwrite the fork's existing
   `.gitignore`, `README.md` or `docs/README.md`. Add the kit's secrets block
   (`.env`, `.env.*`, `!.env.example`, `*.pem`, `*.key`, `secrets/`) to the existing
   `.gitignore` instead. Do not copy the kit's `NOTES.md`/`PLAN.md`: the overlay's versions replace them.
3. Copy this overlay over the root, keeping hidden items. It adds `.clinerules/01-...`,
   `.clinerules/workflows/analyze.md`, `NOTES.md`, `PLAN.md`, `SETUP.md`, `.clineignore`,
   `tools/`, `docs/lumiverse/README.md`, `docs/port/README.md`.
   If your kit already has a `.clineignore`, compare before overwriting; mine keeps the kit's
   secret patterns and adds history folders and lock files.
4. Append to `.gitignore`:
   ```
   reference/
   docs/lumiverse/ref/
   docs/lumiverse/ref-later/
   docs/lumiverse/COPIED.txt
   ```
   (Keeps third-party docs out of your fork, and `git reset`/`git clean` will not delete them.)
5. `git clone <LumiWorld repo URL> reference/LumiWorld`

## 2. Copy the Lumiverse docs
Source = `<Lumiverse clone>/developer-docs/docs`.
```
bash tools/copy-lumiverse-docs.sh "/path/to/Lumiverse/developer-docs/docs"
# Windows:
powershell -File tools/copy-lumiverse-docs.ps1 -Src "C:\path\to\Lumiverse\developer-docs\docs"
```
Expect `0 missing`. A MISSING line means your docs differ from the list: fix the lists in the script.

## 3. Step 0 and run order
1. Skim NOTES.md and PLAN.md. Then commit and tag (Cline shows the commands, you approve):
   `git add -A`, `git commit -m "Step 0: port scaffold"`, `git tag step-0`.
2. New Cline task: `/adopt.md`. NOTES.md already exists, so tell it: "Propose corrections only."
3. Then, one new task each, confirming each output before the next:
   `/analyze.md 1` -> `/scribe.md` (N = 0a), `/analyze.md 2` (0b), `/analyze.md 3` (0c), `/analyze.md 4` (0d).
4. Rewrite PLAN.md steps from MAPPING.md, then use `/step.md 1` and the normal loop.

## 4. What to attach per task
- Analysis 1: nothing (Cline reads Recursion docs/src itself).
- Analysis 2: `@docs/lumiverse`
- Analysis 3: `@reference/LumiWorld`
- Analysis 4: `@docs/port`
- Build steps: NOTES.md + MAPPING.md + only the docs the step lists.

## 5. Watch items
- /scribe.md says "step number": N = 0a gives tag `step-0a`. Fine for git, check it does that.
- Kit .gitignore ignores `dist/`. If Lumiverse needs built output committed, add a `!` exception.
- Check Lumiverse's license before publishing anything derived from its docs or LumiWorld.
- Verify Recursion's LICENSE in its repo before relying on any license assumption.
- AGENTS.md may be auto-loaded by Cline; rule 01 says the port rules win on conflict.

## 6. Cline settings
Plan mode: strong reasoning model. Act mode: faster model. File-edit auto-approve OFF at first.
Analysis tasks are read-only: Plan mode is enough.
