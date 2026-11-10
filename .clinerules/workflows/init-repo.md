# Init repo (Step 0 for a brand-new project)

Use in an empty project folder that already contains this kit. Write no app code.

1. Read-only checks: `git --version`, `gh --version`, `gh auth status`. Tell me what is missing and how to fix it. Stop if git is missing.
2. Ask me (max 3 questions): project name (lowercase-with-dashes), a one-line description, private or public (default: private).
3. Fill in only these: the title and description in README.md, the "What It Does" lines in NOTES.md, and set Last Working Version in NOTES.md to `step-0`. Nothing else.
4. Check that .gitignore and .clineignore cover .env files and secrets.
5. Show me these exact commands and wait for my OK before running them:
   git init -b main
   git add -A
   git commit -m "Step 0: project scaffold"
   git tag step-0
6. If gh is installed and logged in, propose:
   gh repo create <name> --<private|public> --source=. --remote=origin --description "<description>" --push
   then: git push origin --tags
   If gh is not available, give me the manual steps instead:
   create an EMPTY repo on github.com (no README, no .gitignore, no license), then
   git remote add origin <URL>
   git push -u origin main
   git push origin --tags
7. Stop. Give me the repo URL and say the next move is the interview and plan.
