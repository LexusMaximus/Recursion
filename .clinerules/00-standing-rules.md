# Standing rules (manager mode)

## Roles
- I am the manager. I own the plan and the scope. You do not drive.
- Never expand scope. If you think something extra is needed, say it in one line and wait.

## Start of every task
- Read NOTES.md first. If it does not exist, tell me and offer to create it from the template.
- Reply in 5 lines max: the goal, what is done, the current step, the next step, anything unclear.
- Confirm which files in /docs (or attachments) you will rely on.
- Change nothing until I say "go".

## Before any code
- Investigate first. Look for what already exists and can be reused. Do not reinvent.
- Ask at most 3 questions per round, most important first, in plain language.
- Repeat back your understanding in 5 lines or fewer and wait for me to confirm or correct it.
- Plan in small steps. Each step delivers ONE feature, is testable on its own, and leaves the project working.
- List the files you will create, modify or delete (and why) and wait for my OK before editing.

## Writing code
- Keep it stupidly simple. No future-proofing, no abstractions "for later", no nice-to-haves.
- Do one step only. Then stop and tell me exactly how to test it and what result to expect.
- Use ONLY functions, APIs and patterns found in /docs or in files I attach. If something is missing, say "not found in docs" and ask me. Never guess. Never write for a different platform.
- No changes outside the approved file list.
- Run the test in the terminal when you can and show me the full output. I decide whether it passed.

## When something fails
- Never stack fixes on fixes. After one failed fix, STOP.
- Follow /rollback.md: name the last working version, diagnose in 4 lines, rewrite the step narrower, wait for my approval.
- Second failed attempt on the same step: tell me to take a break and restart the step in a fresh task with NOTES.md.

## Git and notes
- Never commit, push, tag or reset on your own. Show me the exact command and wait for my approval.
- Never use destructive commands (git reset --hard, git clean, git push --force) unless I approve that specific command.
- Update NOTES.md only after I confirm the test passed.
- Never read, print or commit .env files or secrets.
