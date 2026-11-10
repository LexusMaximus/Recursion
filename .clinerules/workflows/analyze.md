# Analysis task (read-only)

Usage: `/analyze.md N` where N is 1, 2, 3 or 4. Write ONLY the one output file named
below, inside docs/port/. Do not edit src/, NOTES.md or anything else.

1. Read NOTES.md (and AGENTS.md for analysis 1 only). Reply in 5 lines max: which analysis,
   which files you will read, the output file. Then STOP and wait for "go".
2. After "go", do the analysis. Write "unknown" or "not found in docs" instead of guessing.
   Use tables where possible. Line cap: 300 for analysis 2, 200 for the others.

## 1: ST touchpoints -> docs/port/ST_TOUCHPOINTS.md
Read first, in this order: docs/DOCUMENTATION_INDEX.md, docs/technical/HOST_INTEGRATION_MANUAL.md,
PROMPT_PACKET_AND_INJECTION.md, MODEL_CALLS_AND_PROVIDER_ROUTING.md, RUNTIME_TURN_SEQUENCE.md,
CARD_DECK_AND_HAND.md (all in docs/technical/). Then verify each claim in src/ and cite
file + line range. Start by listing the files in src/ with their line counts. If src/ is one
large file, read it in line ranges and describe logical sections instead of modules.
For each module or section give: location, one-line role, class (PURE = no host dependency,
HOST-BOUND = uses SillyTavern), and for host-bound ones the host APIs it uses (name +
location). Cover at least: host globals/imports, events, settings and storage, connection
profiles, quiet generation, prompt-entry installation, message/swipe edits, DOM/UI hooks.
Say whether any real unit tests exist (tests/ may hold only evaluation scenarios).
Do not read .env files.

## 2: Lumiverse capabilities -> docs/port/LUMIVERSE_CAPABILITIES.md
Read ONLY docs/lumiverse/ref/ and docs/lumiverse/ref-later/. For each API/area give:
signature, required permission, constraints (timeouts, limits), source file. Include the
manifest fields, permissions list, lifecycle and runtime notes. Also answer, from the docs:
- the interceptor timeout and what happens when it is exceeded
- how an extension is installed and updated: where spindle.json must be, whether a
  subfolder works, whether a build runs on install or built output must be committed
- how to run a model call on a chosen connection, and what decisions.md covers
- any native feature that already does pre-generation guidance or multi-step reasoning
  (e.g. council, context handlers): facts only, no opinion

## 3: LumiWorld patterns -> docs/port/LUMIWORLD_PATTERNS.md
Read reference/LumiWorld/: spindle.json, package.json, tsconfig.json, build scripts,
src/backend.ts, frontend.ts, shared.ts, types.ts. For each pattern give the file and a
short description (no code blocks over 10 lines): manifest and permissions, build and
dist handling (is dist committed?), interceptor registration and prompt-block naming,
backend<->frontend messaging, storage layout (per user / per chat), committing state only
after a generation ends, settings autosave, error and timeout fallback.

## 4: Mapping -> docs/port/MAPPING.md
Requires files 1-3 to exist; stop and tell me if not. Make one table:
Recursion feature | ST touchpoint | Lumiverse doc/API | Permission | Status | Notes
Status is one of: direct, partial, needs redesign, no equivalent, not found in docs.
Cover at least: pre-process packet injection, Utility/Reasoner provider lanes, deck and
card state storage, resumable checkpoints and cache, post-process rewrite with swipes,
Last Brief / progress / Full Viewer UI, privacy and redaction rules, settings, plus three
design rows: where the multi-call pipeline runs relative to the interceptor timeout,
install/build layout, overlap with native Lumiverse features.
Then a short "Tier 0" list: the fewest rows that satisfy the done-when in NOTES.md, using
ONE pipeline mode and a small fixed deck.
End with: (a) questions for me, max 3, most important first; (b) a suggested step order,
smallest first, host-independent logic before host-bound logic.

3. STOP. Say which file you wrote and what I should check. Do not start the next analysis.
4. When I confirm it is good, run /scribe.md with N = 0a, 0b, 0c or 0d for analysis 1-4
   (the tag becomes step-0a etc.). If I reject it, rerun the same analysis with my
   corrections (no rollback needed, nothing but docs/port/ changed).
