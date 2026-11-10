# PLAN.md

## Project Brief
- Goal: port Recursion (SillyTavern) to a Lumiverse Spindle extension.
- Platform and docs provided: docs/lumiverse/ (API truth), reference/LumiWorld/ (patterns),
  Recursion's own docs/ and src/ (read-only source of behaviour).
- Inputs and samples: tests/evaluation/scenarios/ (model-evaluation fixtures, not unit tests).
- Expected output: a Lumiverse extension installable from a repo URL.
- Constraints: documented APIs only; one step at a time; first cut is pre-process only.
- Done-when (testable): see NOTES.md. Confirm after analysis 4.
- Out of scope: see NOTES.md.
- Assumptions to confirm:
  1. New code lives in lumiverse/ during development; spindle.json location for install is
     confirmed in analysis 2 (a separate repo is the alternative).
  2. The pipeline's model calls may not fit inside the interceptor timeout. Decide after
     analysis 2: precompute before generation, or keep the interceptor read-only.
  3. First cut uses ONE pipeline mode. Choose it after analysis 1.
  4. Kit .gitignore ignores dist/. Confirm whether built output must be committed.

## Approved Plan (max 10 lines)
(Fill after MAPPING.md is approved.)

## Steps
DRAFT. Rewrite after /analyze.md 4 is approved. Docs paths are under docs/lumiverse/.

### Step 1: Minimal extension loads
- What changes: manifest + empty backend that logs one line on load.
- Docs: ref/getting-started/manifest.md, permissions.md, quick-start.md, ref/examples/minimal-backend.md
- Files touched:
- How I test it (exact action, expected result):
- Checkpoint: after the test passes, run /scribe.md (commit and tag step-1)

### Step 2: Settings stub
- What changes: store and read one setting.
- Docs: ref/backend-api/storage.md
- Files touched:
- How I test it (exact action, expected result):
- Checkpoint: after the test passes, run /scribe.md (commit and tag step-2)

### Step 3: Read a bounded chat window
- What changes: backend reads the last N messages of the current chat.
- Docs: ref/backend-api/chats.md, characters.md
- Files touched:
- How I test it (exact action, expected result):
- Checkpoint: after the test passes, run /scribe.md (commit and tag step-3)

### Step 4: One model call returning JSON
- What changes: one call on a chosen connection, parsed to JSON.
- Docs: ref/backend-api/generation.md and decisions.md (which one fits is decided in LUMIVERSE_CAPABILITIES.md)
- Files touched:
- How I test it (exact action, expected result):
- Checkpoint: after the test passes, run /scribe.md (commit and tag step-4)

### Step 5: Port host-independent logic
- What changes: the PURE modules/sections named in ST_TOUCHPOINTS.md, one per step. Tests only if analysis 1 found any.
- Docs: docs/port/ST_TOUCHPOINTS.md, MAPPING.md
- Files touched:
- How I test it (exact action, expected result):
- Checkpoint: after the test passes, run /scribe.md (commit and tag step-5)

### Step 6: Inject the packet
- What changes: interceptor adds one named prompt block from stored state.
- Docs: ref/backend-api/interceptors.md, ref/examples/prompt-interceptor.md
- Files touched:
- How I test it (exact action, expected result): the block appears in Prompt Breakdown on one real chat.
- Checkpoint: after the test passes, run /scribe.md (commit and tag step-6)

### Step 7+: Minimal UI, then deferred features (from MAPPING.md)
