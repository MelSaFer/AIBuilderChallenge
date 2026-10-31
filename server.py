"""Mise server. Run with:  python server.py   (then open http://localhost:8000)

The web page (static/) is plain HTML, CSS and JavaScript. This server only does two things:
serve those files, and talk to Claude so the API key never reaches the browser.
"""

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, model_validator

from cooking import (
    CookingError, MealName, PlannedMeal, Recipe,
    create_recipe, plan_meals, plan_recipe, suggest_recipes,
)

load_dotenv()

STATIC = Path(__file__).parent / "static"
app = FastAPI(title="Mise")


# ---------- What the page sends ----------
class Person(BaseModel):
    name: str = Field(default="", max_length=60)
    restrictions: List[str] = Field(default_factory=list, max_length=30)
    notes: str = Field(default="", max_length=300)


class PantryInfo(BaseModel):
    pantry: List[str] = Field(default_factory=list, max_length=300)
    has_basics: bool = True
    people: List[Person] = Field(default_factory=list, max_length=12)


class CreateRequest(PantryInfo):
    request: str = Field(min_length=1, max_length=500)
    servings: int = Field(default=2, ge=1, le=20)
    diet: str = Field(default="", max_length=200)


class SuggestRequest(PantryInfo):
    notes: str = Field(default="", max_length=300)


class Slot(BaseModel):
    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    weekday: str = Field(max_length=10)
    meal: MealName
    max_minutes: int = Field(ge=5, le=300)
    relaxed: bool = False


class PlanRequest(PantryInfo):
    slots: List[Slot] = Field(min_length=1, max_length=21)  # one week at most
    diet: str = Field(default="", max_length=200)
    requirements: str = Field(default="", max_length=600)
    leftovers: bool = False
    avoid: List[str] = Field(default_factory=list, max_length=150)
    repeats: bool = False
    replace: str = Field(default="", max_length=200)  # a meal the user wants swapped
    replace_reason: str = Field(default="", max_length=300)


class PlanRecipeRequest(PantryInfo):
    meal: PlannedMeal

    @model_validator(mode="before")
    @classmethod
    def fill_buy(cls, data):
        # Plans saved before "buy" or "package" existed don't have them: fill in sensible values.
        meal = data.get("meal") if isinstance(data, dict) else None
        if isinstance(meal, dict):
            for ing in meal.get("ingredients") or []:
                if isinstance(ing, dict) and "buy" not in ing:
                    ing["buy"] = "" if ing.get("have_it") else ing.get("quantity", "")
                if isinstance(ing, dict) and "package" not in ing:
                    ing["package"] = ""
        return data


# ---------- Helpers ----------
def household_text(people: List[Person]) -> str:
    """Everyone's restrictions in one block, e.g. 'Ana: vegetarian, no nuts'."""
    lines = []
    for n, person in enumerate(people, 1):
        name = person.name.strip() or f"Person {n}"
        rules = [r.strip() for r in person.restrictions if r.strip()]
        if person.notes.strip():
            rules.append(person.notes.strip())
        lines.append(f"- {name}: {', '.join(rules) if rules else 'no restrictions'}")
    return "\n".join(lines) or "- No restrictions."


def has_restrictions(people: List[Person]) -> bool:
    return any(p.restrictions or p.notes.strip() for p in people)


def _error(message: str, status: int = 502) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


@app.exception_handler(RequestValidationError)
def bad_request(_, __):
    return _error("Some of the details sent were invalid. Check the form and try again.", 400)


# ---------- Routes ----------
@app.get("/api/status")
def status():
    return {"has_key": bool(os.getenv("ANTHROPIC_API_KEY"))}


@app.post("/api/recipe")
def api_recipe(body: CreateRequest):
    if not body.request.strip():
        return _error("Type what you'd like to cook first.", 400)
    diet = body.diet
    if has_restrictions(body.people):
        diet = f"{diet}\nEveryone eating has these restrictions:\n{household_text(body.people)}".strip()
    try:
        recipe: Recipe = create_recipe(body.request, body.servings, diet, body.pantry, body.has_basics)
    except CookingError as e:
        return _error(str(e))
    return recipe.model_dump()


@app.post("/api/suggest")
def api_suggest(body: SuggestRequest):
    if not body.pantry:
        return _error("Add some ingredients to My pantry first.", 400)
    notes = body.notes
    if has_restrictions(body.people):
        notes = f"{notes}\nEveryone eating has these restrictions:\n{household_text(body.people)}".strip()
    try:
        recipes = suggest_recipes(body.pantry, body.has_basics, notes)
    except CookingError as e:
        return _error(str(e))
    return {"recipes": [r.model_dump() for r in recipes]}


@app.post("/api/plan")
def api_plan(body: PlanRequest):
    try:
        meals = plan_meals(
            [s.model_dump() for s in body.slots],
            household_text(body.people),
            max(1, len(body.people)),
            body.diet,
            body.requirements,
            body.leftovers,
            body.pantry,
            body.has_basics,
            body.avoid,
            body.repeats,
            body.replace,
            body.replace_reason,
        )
    except CookingError as e:
        return _error(str(e))
    return {"meals": [m.model_dump() for m in meals]}


@app.post("/api/plan/recipe")
def api_plan_recipe(body: PlanRecipeRequest):
    try:
        recipe = plan_recipe(
            body.meal, max(1, len(body.people)), household_text(body.people), body.pantry, body.has_basics
        )
    except CookingError as e:
        return _error(str(e))
    return recipe.model_dump()


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/", StaticFiles(directory=STATIC), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000)
