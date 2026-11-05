# Mise

[Project Documentation](https://melanysf01.atlassian.net/wiki/external/MjRmYmQyM2NhNGIzNGNhM2FmYTcwODNkMDhmZjgzNzI)

## Mise

Mise plans your meals around what's already in your kitchen. Tell it who's eating and what's in your pantry, and Claude plans a week (or a month) of breakfasts, lunches and dinners that use those ingredients first. Every meal opens into a full recipe, and everything you're missing goes on one shopping list.

The name comes from *mise en place*, the kitchen habit of getting everything ready before you start cooking.

**New to Mise?** Read the [User manual](docs/USER_MANUAL.md).

## What it does

| | |
|---|---|
| **Meal plan** | Plans 1 week, 2 weeks or 1 month for your household: how many people, their restrictions (vegetarian, nut allergy…), a diet, how much time you have to cook, and which meals you make. Swap any meal you don't like with one click. |
| **My pantry** | The list of what you have, with amounts ("rice 1 kg"). Plans and recipes use it first, and every recipe shows what you already have (✓) and what you need to buy (highlighted). It updates as soon as the pantry changes. |
| **Recipes** | Open any meal for the full recipe. **Cooked it** takes what you used out of the pantry. |
| **Ask while you cook** | Every recipe has a chat. Ask about a step, or ask for a change ("I'm out of bananas") and the recipe rewrites itself. |
| **Shopping list** | Grouped by supermarket section, with amounts added up and rounded to the sizes stores sell. Tick what you bought and move it to the pantry. |
| **Create a recipe / What can I cook?** | A recipe for anything you describe, or three ideas from what's in your pantry. |
| **Accounts and favorites** | Optional. Sign in to keep everything on any device and save favorite recipes. Includes password reset by email, change password and delete account. |

The page works on phones, tablets and computers.

## How it works

```
Browser (static/)                    Python server (server.py)          Claude
HTML + CSS + JavaScript  ── /api ──▶  FastAPI, checks every request ──▶  Haiku 5.5
        │                            (the API key stays here)
        └──── Supabase (optional): sign-in and each user's saved data
```

- **The page** is plain HTML, CSS and JavaScript, with no build step. It keeps your data in the browser (`localStorage`), so it opens instantly and works without an account.
- **The server** serves the page and is the only part that talks to Claude, so your Anthropic API key never reaches the browser. It checks the size and format of everything the page sends.
- **Claude** (`claude-haiku-5-5`, chosen for speed and cost) answers in a fixed JSON format (structured outputs), so recipes and plans always have the same shape. Plans are requested one week at a time: about 40 seconds per week.
- **Supabase** (optional) handles sign-in and stores each user's data. Database rules let every user reach only their own rows.

## Setup (one time)

You need [Python 3.10 or newer](https://www.python.org/downloads/) and an Anthropic API key from https://console.anthropic.com.

Open PowerShell in this folder and run:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Then create a file named `.env` in this folder with this line, using your own key:

```
ANTHROPIC_API_KEY=your-key-here
```

Keep `.env` private: it's in `.gitignore`, so Git won't upload it.

### Accounts (optional)

Accounts use [Supabase](https://supabase.com). Skip this and the app still works; it just saves everything in the browser.

1. Create a Supabase project.
2. In the project, open **SQL Editor > New query**, paste everything in `supabase/schema.sql` and press **Run**.
3. In **Project Settings > API**, copy the project URL and the publishable key, and add them to `.env`:

   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```

4. In **Authentication > URL Configuration**, set **Site URL** to your app's address (for example `http://localhost:8000`) and add the same address under **Redirect URLs**. The links in "confirm your account" and "reset your password" emails open it.
5. Decide whether new users confirm their email. To skip it, turn off **Confirm email** in **Authentication > Sign In / Providers > Email**.

Supabase's built-in email service sends only a few emails per hour. For more, add your own provider in **Authentication > Emails > SMTP Settings**.

The publishable key is meant to be public: it's sent to the browser, and the database rules in `schema.sql` keep each user's data private.

## Run

```powershell
.venv\Scripts\Activate.ps1
python server.py
```

Open http://localhost:8000. To stop the app, press `Ctrl + C` in PowerShell.

## Your data

- **Without an account**, everything stays in your browser: pantry, plan settings, meal plan, recipes opened from the plan and shopping list. Clearing the browser's site data deletes it.
- **With an account**, the same data is also saved in Supabase, together with your favorite recipes and the dishes you liked or didn't (table `tastes`, with the reason when you give one). Changes are sent a moment after you make them. Signing out removes the copy from that browser; **Delete account** removes everything for good.
- **Claude** receives only what it needs for each request: your pantry, your household's restrictions and the recipe or plan you're working on.

## Troubleshooting

| Problem | What to do |
|---|---|
| A red box says "No API key found" | Create `.env` with `ANTHROPIC_API_KEY=...` (see Setup) and restart the server. |
| "Your API key was rejected" | Check the key in `.env` at https://console.anthropic.com, then restart the server. |
| A plan stops halfway | Press **Plan the remaining weeks** (or **Plan the N missing meals**). The weeks already planned are kept. |
| No **Sign in** button | `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are missing from `.env`, or the server wasn't restarted after adding them. |
| "Confirm your email first" | Open the link Supabase emailed you (check spam), or turn off **Confirm email** (step 5 above). |
| A reset link says it expired | Links work once and expire. Press **Forgot password?** again to get a new one. |
| "Deleting accounts isn't set up" | Run `supabase/schema.sql` again: it adds the `delete_my_account` function. |
| The page looks out of date after an update | Reload with `Ctrl + F5`. |

## Project files

| File | What's in it |
|---|---|
| `server.py` | The web server: serves the page, checks requests and passes them to Claude. Routes: `/api/status`, `/api/recipe`, `/api/suggest`, `/api/plan`, `/api/plan/recipe`, `/api/recipe/chat`. |
| `cooking.py` | Everything about Claude: the prompts, the model, and the recipe and plan formats it answers in. |
| `static/index.html` | The page's structure. |
| `static/style.css` | The look: steel, paper and masking-tape labels. |
| `static/app.js` | Everything the page does: pantry, plan, recipes, chat, shopping list, accounts and sync. |
| `supabase/schema.sql` | Database tables, access rules and the delete-account function. |
| `docs/USER_MANUAL.md` | How to use Mise, step by step. |
| `requirements.txt` | The Python packages the server needs. |
