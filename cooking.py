"""Talks to Claude to create recipes and suggest recipes from your pantry."""

from typing import List, Literal

import os

import anthropic
from pydantic import BaseModel, ValidationError

MODEL = "claude-haiku-5-5"

Category = Literal[
    "Produce", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
    "Spices & Sauces", "Frozen", "Drinks", "Other",
]


class Ingredient(BaseModel):
    name: str  # e.g. "red onion"
    quantity: str  # e.g. "1 large", "200 g"
    category: Category  # supermarket section, used to group the shopping list
    have_it: bool  # True if the user already has enough of it in their pantry
    buy: str  # how much to buy: "" when have_it is true, else the missing amount (often the full quantity)
    package: str  # the usual store size, as a plain amount: "1 l", "12", "250 g", "1 head"


class Recipe(BaseModel):
    title: str
    description: str
    servings: int
    total_time_minutes: int
    ingredients: List[Ingredient]
    steps: List[str]


class RecipeSuggestions(BaseModel):
    recipes: List[Recipe]


MealName = Literal["Breakfast", "Lunch", "Dinner"]


class PlannedMeal(BaseModel):
    """One meal in the plan. Steps are written later, when the user opens it."""
    date: str  # YYYY-MM-DD, copied from the slot
    meal: MealName
    title: str
    description: str  # one short sentence
    total_time_minutes: int
    ingredients: List[Ingredient]


class MealPlan(BaseModel):
    meals: List[PlannedMeal]


SYSTEM_PROMPT = """You are a friendly home-cooking assistant.
You write clear, realistic recipes that a home cook can make with normal kitchen equipment.

Rules:
- Give every ingredient a quantity in metric units or as a count: "200 g", "180 ml", "2", "3 cloves".
  Use tsp or tbsp only for small amounts of seasonings, sauces and oil. Never use cups, ounces,
  pounds or fractions: write "180 ml", not "3/4 cup".
- Keep ingredient names plain ("garlic", "heavy cream") and quantities short, amount only
  ("3 cloves", "200 g", "to taste"). Put preparation details (minced, grated, reserved) in the steps.
- package is the size the ingredient is usually sold in at a supermarket, as a plain amount with no
  words like "carton" or "bag": milk "1 l", eggs "12", butter "250 g", flour "1 kg", garlic "1 head",
  soy sauce "150 ml", fresh herbs "1 bunch", canned beans "400 g". Fruit and vegetables that are
  bought loose are counted: onion "1", lemons "1", tomatoes "1". Fill it in for every ingredient.
- Leave water out of the ingredient list.
- Steps should be short, numbered actions in the order you do them (do not number them yourself).
- Set have_it to true only for ingredients that appear in the user's pantry list
  (match sensibly: "chicken breast" in the pantry covers "chicken breast" in the recipe).
  Everything else gets have_it false, so it goes on the shopping list.
- Pantry items may include an amount ("rice 1 kg", "eggs 6"). If the pantry has less than the
  recipe needs, set have_it false and put only the missing amount in buy (pantry "chicken 200 g",
  recipe needs "600 g": buy "400 g"). If it has enough, or no amount is given, have_it is true.
- buy is "" when have_it is true. When the ingredient isn't in the pantry at all, buy is the full quantity.
- Respect any dietary needs the user mentions."""


class CookingError(Exception):
    """Something went wrong getting an answer from Claude."""


def _client() -> anthropic.Anthropic:
    return anthropic.Anthropic()


def _pantry_text(pantry: List[str], has_basics: bool) -> str:
    items = list(pantry)
    if has_basics:
        items += ["salt", "black pepper", "cooking oil", "water"]
    if not items:
        return "The user's pantry is empty (they need to buy everything)."
    return "The user's pantry contains: " + ", ".join(items)


def _ask(prompt: str, output_type: type[BaseModel], effort: str = "medium") -> BaseModel:
    if not os.getenv("ANTHROPIC_API_KEY"):
        raise CookingError("No API key found. Add ANTHROPIC_API_KEY to the .env file and restart the server.")
    try:
        response = _client().messages.parse(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            output_format=output_type,
            output_config={"effort": effort},
        )
    except ValidationError:
        # The answer was cut off before the JSON was complete.
        raise CookingError("The answer came back incomplete. Please try again.")
    except anthropic.AuthenticationError:
        raise CookingError("Your API key was rejected. Check ANTHROPIC_API_KEY in the .env file.")
    except anthropic.RateLimitError:
        raise CookingError("Too many requests right now. Wait a minute and try again.")
    except anthropic.APIStatusError as e:
        raise CookingError(f"Claude returned an error ({e.status_code}). Please try again in a moment.")
    except anthropic.APIConnectionError:
        raise CookingError("Couldn't reach Claude. Check your internet connection.")
    except anthropic.AnthropicError:
        raise CookingError("Something went wrong talking to Claude. Please try again.")

    if response.stop_reason == "refusal":
        raise CookingError("Claude declined this request. Try rewording it.")
    if response.stop_reason == "max_tokens" or response.parsed_output is None:
        raise CookingError("The answer came back incomplete. Please try again.")
    return response.parsed_output


def create_recipe(request: str, servings: int, diet: str, pantry: List[str], has_basics: bool) -> Recipe:
    prompt = f"""Create one recipe.

What the user wants: {request}
Servings: {servings}
Dietary needs: {diet or "none"}
{_pantry_text(pantry, has_basics)}"""
    return _ask(prompt, Recipe)


def suggest_recipes(pantry: List[str], has_basics: bool, notes: str, count: int = 3) -> List[Recipe]:
    prompt = f"""Suggest {count} different recipes the user can cook mainly with what they already have.
Prefer recipes that need few or no extra ingredients, and use as much of the pantry as makes sense.
Order them from fewest to most missing ingredients.

{_pantry_text(pantry, has_basics)}
Extra notes from the user: {notes or "none"}"""
    result = _ask(prompt, RecipeSuggestions)
    return result.recipes


def plan_meals(
    slots: List[dict],
    household: str,
    servings: int,
    diet: str,
    requirements: str,
    leftovers: bool,
    pantry: List[str],
    has_basics: bool,
    avoid: List[str],
    repeats: bool = False,
    replace: str = "",
    replace_reason: str = "",
) -> List[PlannedMeal]:
    """Fill each slot ({date, weekday, meal, max_minutes, relaxed}) with one meal.

    repeats: the same breakfast or lunch may come back on other days.
    replace: the title of a meal the user didn't like (when swapping a single meal).
    """
    slot_lines = "\n".join(
        f"- {s['date']} ({s['weekday']}) {s['meal']}: up to {s['max_minutes']} min total"
        + ("; relaxed day, comfort food or a treat is fine" if s["relaxed"] else "")
        for s in slots
    )
    leftovers_text = (
        "Cook once, eat twice: when it fits, make a dinner that also covers the next day's lunch "
        "(say so in that lunch's description and list only the extra ingredients it needs, if any)."
        if leftovers else ""
    )
    if repeats:
        variety_text = (
            "- Repeating is fine: a breakfast or lunch the household likes can come back on other days "
            "of the week (that keeps the shopping list short). Keep dinners varied."
        )
        avoid_text = "Dishes already in the plan (you may reuse breakfasts and lunches): " + "; ".join(avoid) if avoid else ""
    else:
        variety_text = "- Vary proteins, cuisines and cooking methods across the plan. Don't repeat a dish."
        avoid_text = "These dishes are already in the plan, so don't repeat them: " + "; ".join(avoid) if avoid else ""
    if pantry:
        pantry_rule = """- Build the plan around the pantry. Most meals should be made mainly from what the user
  already has, adding only a few new ingredients.
- Pantry amounts are shared by all the meals below, so budget them across the plan: if the pantry
  has "rice 500 g" and several meals use 200 g each, the first two are covered and from the third
  on set have_it false with buy = the shortfall (e.g. "100 g", then "200 g"). Plan the shopping as a short list of fresh
  items reused across several meals, not a different set of ingredients for every meal.
- Once or twice a week, it's fine to try something new that needs more shopping."""
    else:
        pantry_rule = """- The pantry is empty, so suggest whatever fits best, but reuse the same fresh
  ingredients across meals so the shopping list stays short and nothing goes to waste."""
    replace_text = (
        f"The user doesn't want \"{replace}\" and asked for something different instead"
        + (f" (their reason: {replace_reason})" if replace_reason else "")
        + ". Suggest a clearly different dish that still follows every rule above."
        if replace else ""
    )
    prompt = f"""Plan meals for a household. Fill every slot below with exactly one meal,
copying its date and meal name exactly.

Everyone eats the same meal, so every meal must respect ALL of these restrictions:
{household}

Servings per meal: {servings} (ingredient quantities are for all of them)
Diet to follow: {diet or "no specific diet; balanced and varied"}
Other requirements: {requirements or "none"}
{_pantry_text(pantry, has_basics)}
{leftovers_text}

Guidelines:
- Stay within each slot's time limit (total time, including prep).
- Breakfasts are breakfast foods. Lunches and dinners are full meals.
{variety_text}
{pantry_rule}
- Descriptions are one short sentence.
{avoid_text}
{replace_text}

Slots:
{slot_lines}"""
    # Low effort: a plan is a long list, and less thinking leaves room for the whole answer.
    plan = _ask(prompt, MealPlan, effort="low")
    wanted = {(s["date"], s["meal"]) for s in slots}
    seen = set()
    meals = []
    for meal in plan.meals:
        key = (meal.date, meal.meal)
        if key in wanted and key not in seen:
            seen.add(key)
            meals.append(meal)
    return meals


def plan_recipe(meal: PlannedMeal, servings: int, household: str, pantry: List[str], has_basics: bool) -> Recipe:
    """Write the full recipe for a meal from the plan, keeping its ingredients."""
    ingredient_lines = "\n".join(f"- {i.quantity} {i.name}" for i in meal.ingredients)
    prompt = f"""Write the full recipe for this meal from the user's meal plan.
Keep the same title. Use these ingredients and quantities; only add small staples if truly needed.

Title: {meal.title}
About: {meal.description}
Time: about {meal.total_time_minutes} minutes
Servings: {servings}
Ingredients:
{ingredient_lines}

Restrictions everyone must respect:
{household}
{_pantry_text(pantry, has_basics)}"""
    return _ask(prompt, Recipe)
