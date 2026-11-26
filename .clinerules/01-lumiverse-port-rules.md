# Lumiverse port rules (in addition to 00-standing-rules.md)

## Source of truth
- Spindle APIs come ONLY from docs/lumiverse/ref/ and docs/lumiverse/ref-later/
  (verbatim copies of the Lumiverse developer-docs). Cite the file for every API call,
  manifest field and permission you use.
- Not in those files = say "not found in docs" and ask me. Never guess a function,
  parameter, event name or manifest field. A probe script may be proposed, but it goes
  in the file list and waits for my OK.
- Type declarations installed as described in ref/getting-started/typescript-setup.md may
  be used to CHECK a signature the docs show. They never justify an API the docs omit.
- reference/LumiWorld/ is a PATTERN reference only (different license). Describe its
  patterns; do not copy its code wholesale.

## Recursion source
- Recursion is a SillyTavern extension. Its AGENTS.md describes that project, not this
  port. Read it in /adopt.md and /analyze.md 1 only. Where it conflicts with these rules,
  these rules win. Do not run Recursion's own build or test commands unless a step says so.

## Scope control
- Existing Recursion files (src/, styles/, schemas/, tests/, docs/ except docs/port/ and
  docs/lumiverse/) are read-only until a step names a specific module or section.
- New Lumiverse code goes only where PLAN.md says (see "Code location").
- Port only the module(s) named in the current step. No Recursion logic beyond it.
- Analysis tasks (/analyze.md) write ONLY into docs/port/. They never touch src/.

## Known Lumiverse hazards (confirm details in the docs before use)
- Interceptors have a timeout; late changes are dropped silently. Check the current
  limit in interceptors.md before designing any model call inside one.
- A handler on a swipe/edit event that calls updateMessage can retrigger itself.
  Show me the loop guard before implementing any such handler.
- Never read, store or log connection credentials or API keys.

## Before any step
- Read NOTES.md, then docs/port/MAPPING.md (once it exists).
- Attach/read only the docs the current step lists in PLAN.md.

## Command discipline (Windows output capture is unreliable)
- Never run the same command twice. If output is empty, truncated, or "exit 1", do NOT
  retry: say so and STOP.
- Never run: git config, any git command without --no-pager, or interactive commands.
- For anything whose output matters, redirect it to a file and read it with the read tool:
  <command> *> "$env:TEMP\out.txt"; "done"
  then read $env:TEMP\out.txt. One attempt only.
- If that file is also empty, STOP and give me the exact command to run in my own PowerShell.
- Maximum 2 failed commands in a row, then STOP and report.
- Edit files ONLY with the edit/write tools, never PowerShell redirection, Set-Content or
  Out-File (Step 7 corrupted UTF-8 into mojibake that way). Files are UTF-8 without BOM.
  Use ASCII only in anything you write (comments, log strings, UI text).
- For verification, run the single script verify-step.ps1 once and read its report file
  ($env:TEMP\recursion-verify.txt). Do not re-run the individual commands.
