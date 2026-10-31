"""Talks to Claude to create recipes and suggest recipes from your pantry."""

from typing import List, Literal

import anthropic
from pydantic import BaseModel

MODEL = "claude-haiku-5-5"

Category = Literal[
    "Produce", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
    "Spices & Sauces", "Frozen", "Drinks", "Other",
]


class Ingredient(BaseModel):
    name: str  # e.g. "red onion"
    quantity: str  # e.g. "1 large", "200 g"
    category: Category  # supermarket section, used to group the shopping list
    have_it: bool  # True if the user already has it in their pantry


class Recipe(BaseModel):
    title: str
    description: str
    servings: int
    total_time_minutes: int
    ingredients: List[Ingredient]
    steps: List[str]


class RecipeSuggestions(BaseModel):
    recipes: List[Recipe]


SYSTEM_PROMPT = """You are a friendly home-cooking assistant.
You write clear, realistic recipes that a home cook can make with normal kitchen equipment.

Rules:
- Use common measurements and give every ingredient a quantity.
- Keep ingredient names plain ("garlic", "heavy cream") and quantities short, amount only
  ("3 cloves", "200 g", "to taste"). Put preparation details (minced, grated, reserved) in the steps.
- Leave water out of the ingredient list.
- Steps should be short, numbered actions in the order you do them (do not number them yourself).
- Set have_it to true only for ingredients that appear in the user's pantry list
  (match sensibly: "chicken breast" in the pantry covers "chicken breast" in the recipe).
  Everything else gets have_it false, so it goes on the shopping list.
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


def _ask(prompt: str, output_type: type[BaseModel]) -> BaseModel:
    try:
        response = _client().messages.parse(
            model=MODEL,
            max_tokens=16000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            output_format=output_type,
            output_config={"effort": "medium"},
        )
    except anthropic.AuthenticationError:
        raise CookingError("Your API key was rejected. Check ANTHROPIC_API_KEY in the .env file.")
    except anthropic.RateLimitError:
        raise CookingError("Too many requests right now. Wait a minute and try again.")
    except anthropic.APIStatusError as e:
        raise CookingError(f"Claude returned an error ({e.status_code}): {e.message}")
    except anthropic.APIConnectionError:
        raise CookingError("Couldn't reach Claude. Check your internet connection.")

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
