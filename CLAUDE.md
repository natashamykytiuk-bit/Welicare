@AGENTS.md

## Git / GitHub workflow

Whenever I ask you to save, push, or commit my changes to GitHub (in any phrasing or capitalization), do the following:

1. Run git add .
2. Run git commit -m "..." with a short, descriptive commit message summarizing what changed
3. Run git push

Always show me the commit message before pushing, in case I want to edit it.

## Cloud Functions deploys

After every `firebase deploy --only functions`, verify the generateSuggestions Cloud Run service allows public access. If AI suggestions stop working after a deploy, run:

```
gcloud run services add-iam-policy-binding generatesuggestions --region=us-central1 --member=allUsers --role=roles/run.invoker --project=welicare
```



\## Code comments



Always comment the code you write — explain what each function/component

does, and add inline comments for any non-obvious logic (e.g. why a

particular Firebase query is structured a certain way, or why a screen

navigates somewhere unexpected). Match the comment style already used

throughout the codebase (see the header comments in ModeSelectionScreen.js,

PINEntryScreen.js, and SettingsScreen.js as examples) — comments should

explain \*why\*, not just restate \*what\* the code does line by line.

