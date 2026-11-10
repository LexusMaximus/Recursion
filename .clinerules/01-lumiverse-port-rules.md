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
