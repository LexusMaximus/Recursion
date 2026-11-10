# Scribe

Run this ONLY after I have confirmed the test PASSED.

1. Edit NOTES.md in place. Do not paste the whole file into the chat.
   - Keep it under 150 lines, factual and terse.
   - Tick the finished step under Steps.
   - Add an entry at the top of Done Log: what changed, which files, test result, tag name.
   - Update Current Step, Next Step and Known Issues.
   - Set Last Working Version to the new tag, `step-N` (N = the step number just finished).
2. Summarise what changed in NOTES.md in 3 lines max.
3. Propose a one-line commit message and show me these exact commands, then wait for my approval before running anything:
   git add -A
   git status
   git commit -m "Step N: <one-line message>"
   git tag step-N
4. If a GitHub remote exists, also propose: `git push origin main --tags`. Wait for my approval.
5. Stop. Do not start the next step.
