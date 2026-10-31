# AIBuilderChallenge

[Project Documentation](https://melanysf01.atlassian.net/wiki/external/MjRmYmQyM2NhNGIzNGNhM2FmYTcwODNkMDhmZjgzNzI)

## Cooking Helper

A web app that uses Claude to help you cook:

- **Create a recipe**: describe what you want to eat and get a full recipe.
- **Shopping list**: add a recipe's missing ingredients to a list grouped by supermarket section. Check items off or download the list.
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
streamlit run app.py
```

The app opens in your browser.
