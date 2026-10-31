# AIBuilderChallenge

[Project Documentation](https://melanysf01.atlassian.net/wiki/external/MjRmYmQyM2NhNGIzNGNhM2FmYTcwODNkMDhmZjgzNzI)

## Mise

Mise is a web app that uses Claude to help you plan meals and cook. The name comes from *mise en place*, the kitchen habit of getting everything ready before you start. The page is plain HTML, CSS and JavaScript; a small Python server talks to Claude so your API key stays private.

- **Meal plan**: set up who's eating (each person's restrictions, like vegetarian or a nut allergy), how long to plan (1 week, 2 weeks or 1 month), which meals to plan each day, cooking time on weekdays and weekends, a diet to follow, relaxed weekends and any other requirements. Claude builds the plan around what's already in your pantry, adding only a few new ingredients (and trying something new once or twice a week). You can let favorite breakfasts and lunches repeat. Click a meal to get the full recipe. Don't like it? Press the arrows in its corner to swap it for another suggestion, or open it and say what you'd rather have. Cooked meals are marked in the corner.
- **Shopping list**: add a week, the whole plan or any recipe to a list grouped by supermarket section. Amounts of the same ingredient are added up, and each item suggests how much to buy in the sizes stores sell (a 1 l carton of milk, not 3/4 cup); you can change it. Tick what you bought and move it to your pantry.
- **My pantry**: list what you already have, with amounts if you like ("rice 1 kg"). Change amounts with − and +, remove items, or switch to a text view to paste a long list. Plans and recipes use it first and only shop for what's missing. Press **Cooked it** on a recipe to take what you used out of the pantry.
- **Create a recipe**: describe what you want to eat and get a full recipe.
- **What can I cook?**: get recipe ideas that use what's in your pantry.

- **Accounts and favorites**: sign in with an email and password to keep your pantry, plan, settings and shopping list on any device. Press **Save to favorites** on any recipe to find it later in the Favorites tab.

Without an account, everything is saved in your browser. The page works on phones, tablets and computers.

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

### Accounts (optional)

Accounts use [Supabase](https://supabase.com). Without these steps the app still works; it just saves everything in the browser.

1. Create a Supabase project.
2. In the project, open **SQL Editor**, paste everything in `supabase/schema.sql` and press **Run**.
3. In **Project Settings > API**, copy the project URL and the publishable key, and add them to `.env`:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

New users get an email to confirm their account. To skip that, turn off **Confirm email** in **Authentication > Sign In / Providers > Email**. If you keep it, set **Authentication > URL Configuration > Site URL** to the address of your app (for example `http://localhost:8000`) so the link in the email opens it.

## Run

```powershell
.venv\Scripts\Activate.ps1
python server.py
```

Then open http://localhost:8000 in your browser. To stop the app, press `Ctrl + C` in PowerShell.

## Project files

- `server.py`: the Python server. Serves the page and sends requests to Claude.
- `cooking.py`: the prompts and the recipe and meal plan formats Claude answers with.
- `static/`: the web page (`index.html`, `style.css`, `app.js`).
- `supabase/schema.sql`: the database tables for accounts and favorites.
