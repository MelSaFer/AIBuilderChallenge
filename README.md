# AIBuilderChallenge

[Project Documentation](https://melanysf01.atlassian.net/wiki/external/MjRmYmQyM2NhNGIzNGNhM2FmYTcwODNkMDhmZjgzNzI)

## Cooking Helper

A web app that uses Claude to help you cook. The page is plain HTML, CSS and JavaScript; a small Python server talks to Claude so your API key stays private.

- **Create a recipe**: describe what you want to eat and get a full recipe.
- **Shopping list**: add a recipe's missing ingredients to a list grouped by supermarket section. Check items off or download the list. Your pantry and list are saved in your browser.
- **What can I cook?**: enter the ingredients you already have and get recipe ideas that use them.

## Setup (one time)

Run these commands in PowerShell from this folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Then create a file named `.env` in this folder with this line, using your own API key (get one at https://console.anthropic.com):

```
ANTHROPIC_API_KEY=your-key-here
```

## Run

```powershell
.venv\Scripts\Activate.ps1
python server.py
```

Then open http://localhost:8000 in your browser. To stop the app, press `Ctrl + C` in PowerShell.

## Project files

- `server.py`: the Python server. Serves the page and sends requests to Claude.
- `cooking.py`: the prompts and the recipe format Claude answers with.
- `static/`: the web page (`index.html`, `style.css`, `app.js`).
