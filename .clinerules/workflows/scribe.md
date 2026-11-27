# Scribe

Run this ONLY after I have confirmed the live test PASSED and I have given you: the step id (e.g. 7), the code commit hash, the tag name, and the exact log lines / results I observed.

Rules for this task (they override anything else):
- Run each command ONCE; never retry. Do NOT run git config. Always use git --no-pager.
- Edit NOTES.md ONLY with the edit/write tools, never PowerShell redirection, Set-Content or Out-File. UTF-8, no BOM, ASCII only in what you write.
- Touch ONLY NOTES.md. No code files, no .clinerules, no dist.
- You never commit, push, or tag. I do that from my own PowerShell.

Steps:
1. Edit NOTES.md in place. Do not paste the whole file into the chat.
   - Hard cap: 150 lines. If you are over, condense wording; do NOT delete any Known Issue or Decision. Report the line count: (Get-Content NOTES.md).Count
   - Tick the finished step under Steps.
   - Add an entry at the top of Done Log: what changed, which files, dist size and git hash-object of each dist, test result in my words (use only the log lines I pasted; write "not tested" for anything I did not report), tag name and the CODE commit hash.
   - Update Current Step, Next Step, Known Issues, and any Decision that this step changed (e.g. say which decision is superseded and why).
   - Record docs-vs-types gaps found this step under Known Issues, labeled "types-only" or "not found in docs".
   - Set Last Working Version to the tag AND the code commit hash (not the notes commit).
   - Never write message text, model output, userId, api_url, keys, or provider/model names into NOTES.md.
2. Summarise what changed in NOTES.md in 3 lines max.
3. Give me exactly these commands to run myself, then STOP:
   git status --short                     (expect only NOTES.md)
   git --no-pager diff --stat
   git --no-pager diff NOTES.md           (I read the FULL diff, including deleted lines)
   git add NOTES.md
   git commit -m "Notes: step N <short result>"
   git push origin lumiverse-port
   NO tag on this commit. (Tag, if not yet done: git tag step-N <code-commit-hash>; git push origin step-N)
4. Do not start the next step.