# StudentFlow

StudentFlow is a lightweight productivity/study app for students — notes, tasks, community posts, wellbeing tracking, and an AI assistant.

## Run locally

1. Create and activate a virtual environment (PowerShell):

```pwsh
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

2. Install Python dependencies:

```pwsh
pip install -r requirements.txt
```

3. Run the app:

```pwsh
python app.py
```

Open http://localhost:8080 in your browser.

## Repo

Remote (your GitHub): https://github.com/Nandish-GH/StudentFlow

## Notes

- The project serves the static frontend from `frontend/` and the FastAPI backend from `app.py`.
- Add your `GEMINI_API_KEY` and `SECRET_KEY` to a `.env` file in the project root to enable AI features and JWT signing.

## Example `.env` (do NOT commit this file)

```
SECRET_KEY=replace_with_secure_value
GEMINI_API_KEY=your_gemini_api_key_here
```

If you want, I can create the initial git commit files here; however I cannot run your local `git` commands or push to your GitHub from this environment — run the commands you listed in your shell to push the repo.

Suggested next steps (run locally):

```pwsh
cd C:\Users\mihir\OneDrive\Desktop\hack\studentflow
# initialize and push
git init
git add .
git commit -m "first commit"
git branch -M main
git remote add origin https://github.com/Nandish-GH/StudentFlow.git
git push -u origin main
```

If you need, I can prepare files (README, .gitignore) and show exact commands; tell me if you want me to also create a release-ready `.gitignore` or other metadata.