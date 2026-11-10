# Rollback referee

STOP. Do not attempt another fix on top of the current code. Do not edit any file.

1. Read-only check: `git status` and `git diff --stat`. Read "Last Working Version" in NOTES.md (a tag such as `step-3`).
2. Tell me which version to go back to, and the exact command, but do NOT run it:
   - Only uncommitted changes to existing files: `git restore .`
   - New untracked files left behind: first `git clean -nd` (dry run, shows what would go), then `git clean -fd` only if I approve
   - Already committed bad work: `git reset --hard step-N`
3. Diagnose in 4 lines: what we expected, what happened, your single best hypothesis, and what was unclear or missing in my instruction or in the docs.
4. Rewrite the failed step with a clearer instruction, a narrower scope and a sharper test.
5. Wait for my approval before touching any code.
6. If this is the second failed attempt at this step, tell me to take a break and restart the step in a fresh task (start with NOTES.md).
