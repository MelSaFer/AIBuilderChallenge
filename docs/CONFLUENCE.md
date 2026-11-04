# Mise: meal planning around your pantry

> **In one sentence:** Mise is a web app that plans a household's meals for the week around what's already in the pantry, writes the recipes, and builds one shopping list for everything that's missing. It uses Claude for the planning and the recipes.

| | |
|---|---|
| **Project** | AI Builder Challenge |
| **Status** | Working prototype, runs locally |
| **Repository** | https://github.com/MelSaFer/AIBuilderChallenge (branch `main`) |
| **User manual** | `docs/USER_MANUAL.md` in the repository |
| **Stack** | HTML, CSS and JavaScript · Python (FastAPI) · Claude API (Haiku 5.5) · Supabase |

---

## 1. The problem

Every household runs into the same three problems each week:

1. **Deciding what to eat takes time.** Planning a week of breakfasts, lunches and dinners, with everyone's restrictions, eats an evening.
2. **Food goes to waste.** What's already in the fridge and the pantry gets forgotten while we keep buying more.
3. **Shopping is messy.** Ingredients are scattered across recipes, amounts don't add up, and things get bought twice.

## 2. The solution

The name comes from *mise en place*: everything prepared before you start cooking. Mise acts as a prep cook:

- It **plans the whole week** for everyone at the table, within their restrictions, diet and cooking time.
- It **uses the pantry first**, and every ingredient says whether you have it or how much more to buy.
- It writes **one shopping list**, grouped by supermarket aisle, with amounts added up and sized to store packages.
- While you cook, it gives you the **full recipe, nutrition per serving and a chat** to ask questions or change the recipe.

## 3. Features

| Feature | What it does |
|---|---|
| **Meal plan** | 1 week, 2 weeks or 1 month. Choose which meals to plan each day, the cooking time on weekdays and weekends, a diet, restrictions and free-text requirements. Options: relaxed weekends, "cook once, eat twice" (leftovers for the next day's lunch) and "repeat favorites". Each week appears as soon as it's ready (about 40 seconds per week). |
| **Swap a meal** | One tap on a meal card for a different dish, or "Swap this meal" with a reason. **Undo** brings the old meal back with its recipe and shopping-list items. |
| **Recipes** | The full recipe opens from any meal: ingredients with "you have it" ticks or highlighted amounts to buy, numbered steps, and a **nutrition panel** (calories, protein, carbs, fat, fiber, sugar and sodium per serving). |
| **Recipe chat** | "Ask or change something": questions while cooking ("is this brown enough?") or changes ("I don't have bananas"). If the recipe changes, the plan and the shopping list update too. |
| **My pantry** | Add items in plain text ("rice 1 kg, eggs 12"), edit amounts and units, search, or edit the whole list as text. "Cooked it" subtracts what a recipe used, with undo. Can be hidden on any screen. |
| **Shopping list** | Per week, per plan or per recipe. Grouped by aisle, amounts added up, with a suggested amount to buy in store sizes. Tick items, then "Move checked to pantry". |
| **Create a recipe / What can I cook?** | A recipe from a request ("a quick creamy pasta"), or three ideas that use the pantry, the one needing the fewest extra ingredients first. |
| **Likes and dislikes** | "Like" and "Not for me" on every recipe, with an optional reason. Future plans avoid what you didn't like and can bring back what you liked. |
| **Accounts** | Optional email and password. The pantry, plan, recipes, shopping list, settings, favorites and tastes sync across devices. Includes password reset, password change and account deletion. |

## 4. How it works

### Architecture

```
 Browser (HTML, CSS, JavaScript)  ──►  Python server (FastAPI)  ──►  Claude API (Haiku 5.5)
          │
          └──►  Supabase (accounts, sync, row-level security)
```

| Part | Responsibility |
|---|---|
| **Browser** (`static/`) | The whole interface. Works out "have it / buy" marks and amounts locally, every time the pantry changes, with no extra calls. Saves everything in `localStorage` and, when signed in, in Supabase. |
| **Python server** (`server.py`) | Serves the page and the `/api/*` endpoints. Keeps the Claude API key on the server, so it never reaches the browser. Validates every request (sizes, limits, dates) with Pydantic. |
| **Claude logic** (`cooking.py`) | Prompts, data models and calls to Claude. Each answer comes back as **structured output**: JSON that matches a Pydantic model (`Recipe`, `MealPlan`, `Nutrition`…), so the app never parses free text. |
| **Supabase** (`supabase/schema.sql`) | Email and password accounts. Tables `user_data`, `favorites` and `tastes`, all with row-level security, so each user only sees their own rows. |

### How a plan is made

1. The browser splits the plan into weeks and sends **one request per week** (at most 21 meals), with the pantry, household restrictions, diet, cooking times, likes and dislikes.
2. The server builds the prompt and calls Claude with **low effort**, which keeps a long week fast and stops it from being cut off.
3. Claude returns the meals as typed JSON: title, time, ingredients with `have_it` / `buy` / `package`, and nutrition per serving.
4. If a meal is missing, the browser asks once more for just those slots. Each week is shown as soon as it arrives.
5. The full steps of a recipe are only written when the user opens that meal, so nothing is paid for before it's needed.

### Claude usage

| Setting | Value | Why |
|---|---|---|
| Model | `claude-haiku-5-5` | Fast and inexpensive, good enough for recipes |
| Output | Structured output (Pydantic models) | Reliable JSON, no free-text parsing |
| Effort | `low` for plans and the chat, `medium` for recipes | Plans are long lists; recipes need more care |
| Max tokens | 32,000 (streamed) | A full week fits without being cut off; only the tokens used are billed |
| Prompt rules | Real dishes that people enjoy; the pantry matters, but never more than flavor; metric amounts; store package sizes; nutrition estimated per serving | |

### Cost

Claude Haiku 5.5 costs **$0.10 per million input tokens and $0.50 per million output tokens** (prompts under 100K tokens). Output tokens include Claude's thinking, so most of the cost comes from what Claude writes, not from what it reads.

These numbers were measured with real calls, using the app's own prompts and a typical household: two people, one restriction, 14 items in the pantry, and a full week of breakfast, lunch and dinner.

| Action | Input tokens | Output tokens | Cost | Time |
|---|---|---|---|---|
| **Create one recipe** ("Create a recipe" tab) | 2,618 | 3,412 | **$0.0020** | ~15 s |
| **Plan one week** (21 meals, one call) | 3,888 | 12,453 | **$0.0066** | ~45 s |
| Open one meal of the plan (writes its full recipe) | 2,636 | 3,068 | $0.0018 | ~15 s |
| **A full week, with all 21 recipes opened** | 59,244 | 76,881 | **≈ $0.044** | |

In practice:

- **One recipe costs about a fifth of a cent.** One dollar pays for about 500 recipes.
- **Planning a week costs less than a cent**, about 150 week plans per dollar. Recipe steps are only written when a meal is opened, so a meal you never open costs nothing extra.
- Even if every recipe of the week is opened, a household's whole week costs **under 5 cents**.

**Real bill.** The Claude Console cost report for this project's API key, from October 6 to November 4, 2026, shows a total of **$0.35**. It matches the Console's token usage export for the same period at the prices above:

| Day (UTC) | Model | Input tokens | Output tokens | Cost |
|---|---|---|---|---|
| Oct 30 | Claude Opus 5.5 ($4 / $20 per million) | 5,835 | 6,654 | $0.156 |
| Oct 30 | Claude Haiku 5.5 | 2,451 | 4,368 | $0.002 |
| Oct 31 | Claude Haiku 5.5 | 64,831 | 161,168 | $0.087 |
| Nov 3 | Claude Haiku 5.5 | 125,310 | 175,025 | $0.100 |
| **Total** | | **198,427** | **347,215** | **$0.35** |

The first day's Opus calls cost almost as much as all the later Haiku use put together. That is why the app uses Haiku: for this task it's about 40 times cheaper per token, and fast enough to plan a week in under a minute.

### API endpoints

| Method and path | Purpose |
|---|---|
| `GET /api/status` | Whether an API key is set, and the public Supabase config |
| `POST /api/plan` | Plan up to 21 meal slots (one week), or replace one meal (`replace`, `replace_reason`) |
| `POST /api/plan/recipe` | Full recipe for one meal of the plan |
| `POST /api/recipe` | A recipe from a free-text request |
| `POST /api/suggest` | Three recipe ideas from the pantry |
| `POST /api/recipe/chat` | The recipe chat: returns `{reply, recipe or null}` |

Every request includes `pantry`, `has_basics`, `people` (restrictions), `household_size`, `likes` and `dislikes`. Errors come back as `{"error": "..."}`.

## 5. Data and privacy

- **Without an account**, everything stays in the browser's `localStorage`.
- **With an account**, changes are sent to Supabase about a second after they happen. Changes not yet sent survive a page reload, and a newer copy from another device replaces the local one.
- **Row-level security** on every table: a user can only read and change their own rows. "Delete account" removes the user and, through cascading deletes, all their data.
- The **Claude API key** lives only in the server's `.env` file and is never sent to the browser or saved in git.

| Table | Contents |
|---|---|
| `user_data` | One row per user and key: `pantry`, `basics`, `shopping`, `settings`, `plan`, `planRecipes` (JSON) |
| `favorites` | Saved recipes (title and full recipe JSON) |
| `tastes` | One row per rated dish: like or dislike, with an optional reason |

## 6. Design

The look is a professional kitchen: steel counters, paper tickets, a strip of yellow masking tape and a blue marker.

| Token | Color | Used for |
|---|---|---|
| Steel | `#E3E6E6` | Page background |
| Paper | `#FCFCFA` | Cards, recipes, dialogs |
| Ink | `#1C2631` | Text |
| Marker blue | `#1F5FA8` | Buttons, links, focus, step numbers |
| Tape yellow | `#F5D466` | Logo, "My pantry", plan dates only |
| Tomato | `#D2462C` | Only what you need to buy, and dangerous actions |

Fonts: **Archivo** (condensed headings) and **Literata** (text). The interface is accessible: visible keyboard focus, labels for screen readers, touch targets of at least 44 px on phones, and respect for "reduce motion".

## 7. Run it locally

1. Install Python 3.13.
2. In the project folder:
   ```
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
3. Create a `.env` file with `ANTHROPIC_API_KEY=...`. Optionally add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` to turn on accounts.
4. For accounts, run `supabase/schema.sql` once in the Supabase SQL Editor.
5. Start it with `python server.py` and open http://localhost:8000.

## 8. Project structure

| File | Purpose |
|---|---|
| `server.py` | FastAPI server: endpoints, validation, serves the page |
| `cooking.py` | Prompts, Pydantic models and calls to Claude |
| `static/index.html`, `style.css`, `app.js` | The interface (no framework) |
| `supabase/schema.sql` | Tables, row-level security and `delete_my_account()` |
| `docs/USER_MANUAL.md` | Step-by-step user manual |
| `docs/Mise-demo.pptx` | The 5-minute demo deck |

## 9. How it was tested

- **No API cost for UI tests:** the browser was driven headless (Microsoft Edge over the DevTools protocol) with sample plans and recipes, and Claude's answers were replaced with fake ones.
- **Desktop (1440 px) and phone (390 px)** screenshots were checked after each change, plus measurements of touch-target sizes, animations and overflow.
- **A design review and audit** were run with the Impeccable design plugin: they covered heuristics, accessibility, responsiveness and consistency, and led to a simpler first plan, Undo for swaps and a better phone layout.
- **Real calls** were made only to confirm new data, such as the nutrition values.

## 10. Limitations and next steps

**Limitations**

- Nutrition values are Claude's estimates, not exact like a food label.
- The app runs locally; it isn't published online yet.
- A week takes about 40 seconds to plan.

**Next steps**

- Publish it online (for example on Render or Railway, with the keys as environment variables).
- Export the plan to a calendar or a printable PDF.
- A cooking mode: one step at a time, large text, the screen stays on.
- Make the six buttons at the end of each recipe simpler.
