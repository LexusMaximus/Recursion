# Step executor

Do ONLY the step I name after the command (for example `/step.md 3`). If I give no number, use "Current Step" in NOTES.md.

1. Read NOTES.md, then the details of this step in PLAN.md.
2. Reply in 5 lines max: the goal, what is done, this step, anything unclear. Confirm which /docs files you will rely on.
3. List every file you will create, modify or delete, and why. Then STOP and wait for my OK.
   - If I am in Plan mode, stop here and remind me to switch to Act mode.
4. After my OK, implement the step. No refactors, no extras, no future-proofing, nothing outside the approved list. Use only functions found in /docs or attachments. If one is missing, ask me.
5. Tell me exactly how to test it (the action and the expected result). Run the test in the terminal if you can and show me the full output.
6. STOP. Do not start the next step. Do not edit NOTES.md yet.
7. When I say the test passed, run /scribe.md. If it failed, run /rollback.md.
