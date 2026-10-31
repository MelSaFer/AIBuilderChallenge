"""Cooking helper web app. Run with:  streamlit run app.py"""

import html
import os
import re

import streamlit as st
from dotenv import load_dotenv

from cooking import CookingError, Recipe, create_recipe, suggest_recipes

load_dotenv()

st.set_page_config(page_title="Cooking Helper", page_icon="🍳", layout="wide")

CATEGORY_ORDER = [
    "Produce", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
    "Spices & Sauces", "Frozen", "Drinks", "Other",
]

# ---------- Look and feel (colors and fonts also live in .streamlit/config.toml) ----------
st.html("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap');

:root {
  --celery: #EEF2E6;
  --pine: #1E3328;
  --basil: #2F6B4F;
  --yolk: #F2C14E;
  --paper: #FFFFFF;
  --sage: #5F7266;
  --display: 'Bricolage Grotesque', sans-serif;
}

.block-container { max-width: 1100px; padding-top: 4.5rem; }

/* Page header */
.ch-header { margin: 0 0 1.75rem; }
.ch-header h1 {
  font-family: var(--display);
  font-variation-settings: "wdth" 78, "opsz" 96;
  font-weight: 800;
  font-size: clamp(2.6rem, 6vw, 4.5rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--pine);
  margin: 0;
  padding: 0;
}
.ch-header p {
  font-size: 1.15rem;
  line-height: 1.5;
  color: var(--sage);
  max-width: 34em;
  margin: 0.75rem 0 0;
}

/* Tabs */
.stTabs [role="tablist"] { gap: 1.75rem; border-bottom: 2px solid #C9D4BE; }
.stTabs [data-testid="stTab"] { padding: 0.6rem 0; }
.stTabs [data-testid="stTab"] p {
  font-family: var(--display) !important;
  font-size: 1.15rem !important;
  font-weight: 600 !important;
}
.stTabs .react-aria-SelectionIndicator { background: var(--basil); height: 3px; }

/* Sidebar: the pantry shelf */
[data-testid="stSidebar"] h2 {
  font-family: var(--display);
  font-variation-settings: "wdth" 80;
  font-size: 2rem;
  font-weight: 800;
}

/* Recipe */
.ch-recipe {
  background: var(--paper);
  border-radius: 18px;
  padding: clamp(1.25rem, 3vw, 2.25rem);
  margin: 0.5rem 0 1rem;
  color: var(--pine);
}
.ch-recipe h2 {
  font-family: var(--display);
  font-variation-settings: "wdth" 82, "opsz" 72;
  font-weight: 800;
  font-size: clamp(1.9rem, 4vw, 2.8rem);
  line-height: 1;
  letter-spacing: -0.015em;
  margin: 0;
  padding: 0;
}
.ch-desc { font-size: 1.1rem; line-height: 1.55; max-width: 38em; margin: 0.75rem 0 1rem; }
.ch-meta { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1.75rem; }
.ch-meta span {
  background: var(--celery);
  border-radius: 999px;
  padding: 0.25rem 0.8rem;
  font-weight: 700;
  font-size: 0.95rem;
}
.ch-cols { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 2.5rem; }
@media (max-width: 760px) { .ch-cols { grid-template-columns: 1fr; gap: 1.75rem; } }
.ch-recipe h3 {
  font-family: var(--display);
  font-size: 1.3rem;
  font-weight: 700;
  margin: 0 0 0.75rem;
  padding: 0;
}
.ch-recipe ul.ch-ings, .ch-recipe ol.ch-steps { list-style: none; margin: 0 !important; padding: 0 !important; }
.ch-recipe li { margin: 0 !important; }
.ch-ings li {
  display: flex;
  gap: 0.6rem;
  align-items: baseline;
  padding: 0.35rem 0;
  border-bottom: 1px solid #E4EADC;
  line-height: 1.4;
}
.ch-qty { color: var(--sage); white-space: nowrap; min-width: 4.5em; }
.ch-have .ch-name::before { content: "✓ "; color: var(--basil); font-weight: 700; }
.ch-buy .ch-name {
  background: linear-gradient(transparent 45%, var(--yolk) 45%, var(--yolk) 92%, transparent 92%);
  padding: 0 0.15em;
  font-weight: 700;
}
.ch-legend { color: var(--sage); font-size: 0.9rem; margin-top: 0.75rem; }
.ch-legend .ch-swatch {
  background: linear-gradient(transparent 45%, var(--yolk) 45%, var(--yolk) 92%, transparent 92%);
  font-weight: 700;
  color: var(--pine);
}
.ch-steps { counter-reset: step; }
.ch-steps li {
  counter-increment: step;
  display: grid;
  grid-template-columns: 2.25rem 1fr;
  gap: 0.5rem;
  padding: 0.5rem 0;
  line-height: 1.55;
  max-width: 40em;
}
.ch-steps li::before {
  content: counter(step);
  font-family: var(--display);
  font-weight: 800;
  font-size: 1.5rem;
  line-height: 1.1;
  color: var(--basil);
}

/* Shopping list */
.ch-section {
  font-family: var(--display);
  font-weight: 700;
  font-size: 1.25rem;
  color: var(--pine);
  margin: 1.25rem 0 0.25rem;
}
.ch-count { color: var(--sage); margin: 0.25rem 0 0.5rem; }
.ch-empty {
  font-size: 1.1rem;
  color: var(--sage);
  padding: 2rem 0;
  max-width: 30em;
}

/* Expander titles for suggestions */
[data-testid="stExpander"] summary p { font-family: var(--display); font-size: 1.2rem; font-weight: 700; }

/* Keyboard focus that is easy to see */
button:focus-visible, input:focus-visible, textarea:focus-visible, summary:focus-visible,
[data-testid="stTab"]:focus-visible, [data-testid="stTab"][data-focus-visible] {
  outline: 3px solid var(--yolk) !important;
  outline-offset: 2px;
}
</style>
""")

# ---------- App memory (lasts while the browser tab is open) ----------
state = st.session_state
state.setdefault("shopping", {})  # key -> {name, quantities, category, recipes, done}
state.setdefault("created_recipe", None)
state.setdefault("suggestions", [])
if "toast" in state:
    st.toast(state.pop("toast"))


def parse_pantry(text: str) -> list[str]:
    """Split the pantry box into items (one per line or separated by commas)."""
    return [item.strip() for item in re.split(r"[,\n]", text) if item.strip()]


def add_to_shopping_list(recipe: Recipe) -> int:
    added = 0
    for ing in recipe.ingredients:
        if ing.have_it:
            continue
        key = ing.name.strip().lower()
        item = state.shopping.setdefault(
            key,
            {"name": ing.name, "quantities": [], "category": ing.category, "recipes": [], "done": False},
        )
        if recipe.title in item["recipes"]:
            continue  # already added from this recipe
        item["quantities"].append(ing.quantity)
        item["recipes"].append(recipe.title)
        item["done"] = False
        added += 1
    return added


def recipe_html(recipe: Recipe) -> str:
    """The recipe as one HTML card. Everything from Claude is escaped."""
    e = html.escape
    ingredients = "".join(
        f'<li class="{"ch-have" if ing.have_it else "ch-buy"}">'
        f'<span class="ch-qty">{e(ing.quantity)}</span><span class="ch-name">{e(ing.name)}</span></li>'
        for ing in recipe.ingredients
    )
    steps = "".join(f"<li><span>{e(step)}</span></li>" for step in recipe.steps)
    return (
        '<article class="ch-recipe">'
        f"<h2>{e(recipe.title)}</h2>"
        f'<p class="ch-desc">{e(recipe.description)}</p>'
        f'<div class="ch-meta"><span>{recipe.total_time_minutes} min</span>'
        f"<span>{recipe.servings} servings</span></div>"
        '<div class="ch-cols">'
        f'<section><h3>Ingredients</h3><ul class="ch-ings">{ingredients}</ul>'
        '<p class="ch-legend">✓ you have it &nbsp; <span class="ch-swatch">highlighted</span> to buy</p></section>'
        f'<section><h3>Steps</h3><ol class="ch-steps">{steps}</ol></section>'
        "</div></article>"
    )


def show_recipe(recipe: Recipe, key: str) -> None:
    st.html(recipe_html(recipe))
    missing = [i for i in recipe.ingredients if not i.have_it]
    if missing:
        noun = "ingredient" if len(missing) == 1 else "ingredients"
        if st.button(f"Add {len(missing)} missing {noun} to shopping list", key=f"add_{key}", type="primary"):
            added = add_to_shopping_list(recipe)
            state.toast = f"Added {added} items to your shopping list" if added else "Already on your shopping list"
            st.rerun()  # refresh the item count on the Shopping list tab
    else:
        st.success("You have everything you need.")


# ---------- Sidebar: pantry ----------
with st.sidebar:
    st.header("My pantry")
    pantry_text = st.text_area(
        "What ingredients do you have?",
        placeholder="eggs\nrice\nchicken breast\ntomatoes, onion, garlic",
        height=220,
        help="One per line or separated by commas. Recipes will mark these as 'you have it'.",
    )
    has_basics = st.checkbox("I have basics (salt, pepper, oil, water)", value=True)
    pantry = parse_pantry(pantry_text)
    st.caption(f"{len(pantry)} {'ingredient' if len(pantry) == 1 else 'ingredients'} in your pantry")

st.html(
    '<header class="ch-header"><h1>Cooking Helper</h1>'
    "<p>Say what you feel like eating, or what's already in your kitchen. "
    "You get a recipe and a shopping list for whatever's missing.</p></header>"
)

if not os.getenv("ANTHROPIC_API_KEY"):
    st.error(
        "No API key found. Create a file named `.env` in this folder with this line:\n\n"
        "`ANTHROPIC_API_KEY=your-key-here`\n\nThen restart the app. "
        "You can get a key at https://console.anthropic.com."
    )
    st.stop()

list_count = sum(not v["done"] for v in state.shopping.values())
list_label = f"Shopping list ({list_count})" if list_count else "Shopping list"
tab_create, tab_suggest, tab_list = st.tabs(["Create a recipe", "What can I cook?", list_label])

# ---------- Tab 1: create a recipe ----------
with tab_create:
    with st.form("create_form", border=False):
        request = st.text_input("What do you want to cook?", placeholder="A quick creamy pasta for a weeknight")
        c1, c2 = st.columns([1, 2])
        servings = c1.number_input("Servings", min_value=1, max_value=20, value=2)
        diet = c2.text_input("Dietary needs (optional)", placeholder="vegetarian, no nuts...")
        submitted = st.form_submit_button("Create recipe", type="primary")

    if submitted:
        if not request.strip():
            st.warning("Type what you'd like to cook, then press Create recipe.")
        else:
            with st.spinner("Writing your recipe..."):
                try:
                    state.created_recipe = create_recipe(request, int(servings), diet, pantry, has_basics)
                except CookingError as e:
                    st.error(str(e))

    if state.created_recipe:
        show_recipe(state.created_recipe, "created")

# ---------- Tab 2: suggest recipes from the pantry ----------
with tab_suggest:
    st.write(
        "Get three recipe ideas that use what's in **My pantry**, "
        "starting with the one that needs the fewest extra ingredients."
    )
    notes = st.text_input("Anything else? (optional)", placeholder="something healthy, under 30 minutes...")

    if st.button("Suggest recipes", type="primary"):
        if not pantry:
            st.warning("Add some ingredients to **My pantry** in the sidebar first.")
        else:
            with st.spinner("Looking through your pantry..."):
                try:
                    state.suggestions = suggest_recipes(pantry, has_basics, notes)
                except CookingError as e:
                    st.error(str(e))

    for n, recipe in enumerate(state.suggestions):
        missing = sum(not i.have_it for i in recipe.ingredients)
        label = "you have everything" if missing == 0 else f"{missing} to buy"
        with st.expander(f"{recipe.title} ({label})", expanded=(n == 0)):
            show_recipe(recipe, f"suggestion_{n}")

# ---------- Tab 3: shopping list ----------
with tab_list:
    if not state.shopping:
        st.html(
            '<p class="ch-empty">Your shopping list is empty. Create a recipe, then add its '
            "missing ingredients here with one click.</p>"
        )
    else:
        left = sum(not v["done"] for v in state.shopping.values())
        st.html(f'<p class="ch-count">{left} of {len(state.shopping)} items left to buy</p>')
        for category in CATEGORY_ORDER:
            items = {k: v for k, v in state.shopping.items() if v["category"] == category}
            if not items:
                continue
            st.html(f'<p class="ch-section">{html.escape(category)}</p>')
            for key, item in sorted(items.items()):
                text = f"{item['name']}, {' + '.join(item['quantities'])}"
                item["done"] = st.checkbox(
                    text, value=item["done"], key=f"item_{key}", help="For: " + ", ".join(item["recipes"])
                )

        st.divider()
        c1, c2, c3 = st.columns(3)
        if c1.button("Remove checked items", use_container_width=True):
            for key in [k for k, v in state.shopping.items() if v["done"]]:
                del state.shopping[key]
                state.pop(f"item_{key}", None)
            st.rerun()
        if c2.button("Clear whole list", use_container_width=True):
            for key in list(state.shopping):
                state.pop(f"item_{key}", None)
            state.shopping = {}
            st.rerun()

        lines = []
        for category in CATEGORY_ORDER:
            items = [v for v in state.shopping.values() if v["category"] == category and not v["done"]]
            if items:
                lines.append(category.upper())
                lines += [f"[ ] {v['name']} - {' + '.join(v['quantities'])}" for v in items]
                lines.append("")
        c3.download_button(
            "Download list", "\n".join(lines), file_name="shopping-list.txt",
            type="primary", use_container_width=True,
        )
