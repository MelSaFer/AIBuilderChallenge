"""Cooking Helper server. Run with:  python server.py   (then open http://localhost:8000)

The web page (static/) is plain HTML, CSS and JavaScript. This server only does two things:
serve those files, and talk to Claude so the API key never reaches the browser.
"""

import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from cooking import CookingError, Recipe, create_recipe, suggest_recipes

load_dotenv()

STATIC = Path(__file__).parent / "static"
app = FastAPI(title="Cooking Helper")


class CreateRequest(BaseModel):
    request: str = Field(min_length=1, max_length=500)
    servings: int = Field(default=2, ge=1, le=20)
    diet: str = Field(default="", max_length=200)
    pantry: List[str] = Field(default_factory=list, max_length=200)
    has_basics: bool = True


class SuggestRequest(BaseModel):
    pantry: List[str] = Field(min_length=1, max_length=200)
    has_basics: bool = True
    notes: str = Field(default="", max_length=300)


def _error(message: str, status: int = 502) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


@app.get("/api/status")
def status():
    return {"has_key": bool(os.getenv("ANTHROPIC_API_KEY"))}


@app.post("/api/recipe")
def api_recipe(body: CreateRequest):
    if not body.request.strip():
        return _error("Type what you'd like to cook first.", 400)
    try:
        recipe: Recipe = create_recipe(body.request, body.servings, body.diet, body.pantry, body.has_basics)
    except CookingError as e:
        return _error(str(e))
    return recipe.model_dump()


@app.post("/api/suggest")
def api_suggest(body: SuggestRequest):
    try:
        recipes = suggest_recipes(body.pantry, body.has_basics, body.notes)
    except CookingError as e:
        return _error(str(e))
    return {"recipes": [r.model_dump() for r in recipes]}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/", StaticFiles(directory=STATIC), name="static")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("server:app", host="127.0.0.1", port=8000)
