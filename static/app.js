// Mise: everything the page does in the browser.
// Pantry, plan settings, the meal plan and the shopping list are saved in this
// browser (localStorage), so they are still there next time you open the app.

const CATEGORY_ORDER = [
  "Produce", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
  "Spices & Sauces", "Frozen", "Drinks", "Other",
];
const MEALS = ["Breakfast", "Lunch", "Dinner"];
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const RESTRICTIONS = [
  "Vegetarian", "Vegan", "Pescatarian", "Gluten-free", "Dairy-free", "Lactose-free",
  "Nut allergy", "Shellfish allergy", "Egg-free", "No pork", "Low sodium", "Diabetic-friendly",
];
const MINUTES = [15, 20, 30, 45, 60, 90, 120];

const $ = (id) => document.getElementById(id);

// ---------- Saved data ----------
const store = {
  load(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem("cooking-helper:" + key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  },
  save(key, value) {
    try {
      localStorage.setItem("cooking-helper:" + key, JSON.stringify(value));
    } catch {
      toast("Couldn't save in this browser. It may be out of space.");
    }
  },
};

function defaultSettings() {
  const allDays = () => [true, true, true, true, true, true, true];
  return {
    people: [{ name: "", restrictions: [], notes: "" }],
    length: 7,
    start: isoDate(new Date()),
    meals: { Breakfast: allDays(), Lunch: allDays(), Dinner: allDays() },
    weekdayMinutes: 30,
    weekendMinutes: 60,
    diet: "",
    dietOther: "",
    relaxed: true,
    leftovers: false,
    repeats: true,
    requirements: "",
  };
}

let settings = { ...defaultSettings(), ...store.load("settings", {}) };
// shopping: { key: { name, quantities: [], category, recipes: [], sources: [], done } }
let shopping = store.load("shopping", {});
// plan: { start, length, servings, weeks: [{ start, end, done, meals: [...] }] }
let plan = store.load("plan", null);
// Full recipes opened from the plan, by "date|meal".
let planRecipes = store.load("planRecipes", {});
let planning = false;
let planError = ""; // shown next to the week that couldn't be planned

// ---------- Small helpers ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const child of children) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

let toastTimer;
function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove("show"), 2800);
}

function showMessage(id, text, isError = false) {
  const box = $(id);
  box.textContent = text;
  box.classList.toggle("error", isError);
}

// ---------- Dates (always local time) ----------
function isoDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}
function weekdayIndex(iso) {
  return (parseDate(iso).getDay() + 6) % 7; // Monday = 0
}
function shortDate(iso) {
  return parseDate(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function longDate(iso) {
  return parseDate(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

// ---------- Quantities: "200 g" + "150 g" becomes "350 g" ----------
function addQuantities(list) {
  const totals = new Map();
  const other = [];
  for (const q of list) {
    const m = String(q).trim().match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (!m) { other.push(q); continue; }
    let unit = m[2].trim().toLowerCase();
    let n = parseFloat(m[1].replace(",", "."));
    // Count kg as g and l as ml so "1 kg" + "500 g" adds up to "1.5 kg".
    if (unit === "kg" || unit === "l") [n, unit] = [n * 1000, unit === "kg" ? "g" : "ml"];
    totals.set(unit, (totals.get(unit) || 0) + n);
  }
  const bigger = { g: "kg", ml: "l" };
  const parts = [...totals].map(([unit, n]) => {
    if (bigger[unit] && n >= 1000) [n, unit] = [n / 1000, bigger[unit]];
    return `${Math.round(n * 100) / 100}${unit ? " " + unit : ""}`;
  });
  return [...parts, ...[...new Set(other)]].join(" + ");
}

// ---------- Pantry ----------
// One item per line or comma. A comma between digits ("1,5 kg") is a decimal, not a separator.
function parsePantry(text) {
  return text.split(/\n|,(?!\d)/).map((s) => s.trim()).filter(Boolean);
}
function pantry() {
  return parsePantry($("pantry-input").value);
}
// The hidden text box (#pantry-input) holds the pantry; the list is drawn from it.
function savePantry() {
  $("pantry-count").textContent = `${plural(pantry().length, "ingredient", "ingredients")} in your pantry`;
  store.save("pantry", $("pantry-input").value);
  store.save("basics", $("basics").checked);
}
function updatePantryCount() {
  savePantry();
  renderPantryList();
}
function writePantry(items, redraw = true) {
  $("pantry-input").value = items
    .filter((it) => it.name.trim())
    .map((it) => (it.amount.trim() ? `${it.name.trim()} ${it.amount.trim()}` : it.name.trim()))
    .join("\n");
  if (redraw) updatePantryCount();
  else savePantry();
}

// ---------- Pantry rows: amount + unit ----------
const UNITS = ["", "g", "kg", "ml", "l"]; // "" means a plain count ("eggs 6")
const UNIT_LABEL = { "": "units", l: "L" }; // "L" so litres don't look like a capital I

// A sensible starting unit for an ingredient, which the user can change.
const LIQUIDS = /\b(milk|oil|juice|stock|broth|cream|vinegar|wine|sauce|syrup|water|beer|coconut milk)\b/i;
const BY_WEIGHT = /\b(rice|pasta|spaghetti|noodles?|flour|sugar|oats?|lentils?|quinoa|couscous|beans?|chickpeas?|nuts?|almonds?|chicken|beef|pork|lamb|turkey|mince|ground|steak|bacon|ham|sausages?|fish|salmon|cod|shrimps?|prawns?|tofu|cheese|cheddar|mozzarella|parmesan|butter|yogurt|yoghurt|spinach|mushrooms?|coffee|cereal|chocolate|bread)\b/i;
function guessUnit(name) {
  if (LIQUIDS.test(name)) return "ml";
  if (BY_WEIGHT.test(name)) return "g";
  return "";
}

// "1.5 kg" -> { n: "1.5", unit: "kg" }; "6" -> { n: "6", unit: "" }; "" -> { n: "", unit: guess }
function splitAmount(amount, name) {
  const m = String(amount).trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)$/);
  if (!m) return { n: "", unit: guessUnit(name) };
  return { n: m[1], unit: m[2].toLowerCase() };
}

// How much the − and + buttons change an amount, in the unit shown.
function stepFor(n, unit) {
  if (unit === "g" || unit === "ml") return n > 200 ? 100 : 50;
  if (unit === "kg" || unit === "l") return 0.1;
  return 1;
}

function renderPantryList() {
  const items = pantry().map(splitPantryLine);
  $("pantry-empty").hidden = items.length > 0 || !$("pantry-text").hidden;
  $("pantry-list").replaceChildren(...items.map((item, i) => pantryRow(item, i)));
}

function pantryRow(item, i) {
  const start = splitAmount(item.amount, item.name);
  const number = el("input", {
    class: "pi-number", type: "text", inputmode: "decimal", value: start.n, placeholder: "–",
    maxlength: 8, autocomplete: "off", "aria-label": `Amount of ${item.name}`,
  });
  // Units this row can use; keeps an unusual one the user typed, like "head" or "can".
  const units = UNITS.includes(start.unit) ? UNITS : [...UNITS, start.unit];
  const unit = el("select", { class: "pi-unit", "aria-label": `Unit for ${item.name}` },
    ...units.map((u) => el("option", { value: u, text: UNIT_LABEL[u] ?? u })));
  unit.value = start.unit;
  let lastUnit = start.unit;

  const less = el("button", { class: "pi-btn pi-less", type: "button", text: "−", "aria-label": `Less ${item.name}` });
  const more = el("button", { class: "pi-btn pi-more", type: "button", text: "+", "aria-label": `More ${item.name}` });
  const remove = el("button", { class: "pi-btn pi-remove", type: "button", text: "✕", "aria-label": `Remove ${item.name}` });

  const value = () => parseFloat(number.value.replace(",", "."));
  const refresh = () => {
    const n = value();
    less.disabled = !(n > 0) || n - stepFor(n, unit.value) <= 0;
  };
  const save = () => {
    const items = pantry().map(splitPantryLine);
    if (!items[i]) return;
    const n = number.value.trim().replace(/,(?!\d)/g, "");
    items[i].amount = n ? `${n}${unit.value ? " " + unit.value : ""}` : "";
    writePantry(items, false);
    refresh();
  };
  const tidy = (n) => String(Math.round(n * 100) / 100);
  const step = (dir) => {
    const n = value() || 0;
    const next = n + dir * stepFor(n, unit.value);
    if (next <= 0) return;
    number.value = tidy(next);
    save();
  };

  number.addEventListener("input", save);
  unit.addEventListener("change", () => {
    // Switching between g and kg (or ml and l) converts the number too, but only when the number
    // fits the old unit: 500 g -> 0.5 kg, yet "1" + ml -> l just means the user meant 1 l.
    const n = value();
    const change = `${lastUnit}>${unit.value}`;
    const toBig = (change === "g>kg" || change === "ml>l") && n >= 50;
    const toSmall = (change === "kg>g" || change === "l>ml") && n < 50;
    if (n > 0 && toBig) number.value = tidy(n / 1000);
    if (n > 0 && toSmall) number.value = tidy(n * 1000);
    lastUnit = unit.value;
    save();
  });
  less.addEventListener("click", () => step(-1));
  more.addEventListener("click", () => step(1));
  remove.addEventListener("click", () => {
    const items = pantry().map(splitPantryLine);
    items.splice(i, 1);
    writePantry(items);
    toast(`Removed ${item.name}`);
    // Keep the keyboard in the list: focus the next row's remove button, or the add field.
    const rows = $("pantry-list").children;
    const next = (rows[i] || rows[i - 1])?.querySelector(".pi-remove");
    (next || $("pantry-add")).focus();
  });
  refresh();

  return el("li", { class: "pantry-item" },
    el("span", { class: "pi-name", text: item.name }),
    el("span", { class: "pi-amount" }, number, unit),
    less, more, remove,
  );
}

let openPantry = () => {};

function setupPantry() {
  $("pantry-input").value = store.load("pantry", "");
  $("basics").checked = store.load("basics", true);
  $("pantry-input").addEventListener("input", savePantry);
  $("basics").addEventListener("change", savePantry);

  $("pantry-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("pantry-add");
    const fresh = parsePantry(input.value).map(splitPantryLine);
    if (!fresh.length) return input.focus();
    const items = pantry().map(splitPantryLine);
    let already = 0;
    for (const f of fresh) {
      const same = items.find((it) => it.name.toLowerCase() === f.name.toLowerCase());
      if (!same) items.push(f);
      else if (f.amount) same.amount = same.amount ? addQuantities([same.amount, f.amount]) : f.amount;
      else already++;
    }
    writePantry(items);
    input.value = "";
    input.focus();
    toast(already === fresh.length ? "Already in your pantry" : "Added to your pantry");
  });

  const textToggle = $("pantry-text-toggle");
  textToggle.addEventListener("click", () => {
    const opening = $("pantry-text").hidden;
    $("pantry-text").hidden = !opening;
    $("pantry-list").hidden = opening;
    $("pantry-add-form").hidden = opening;
    textToggle.textContent = opening ? "Done editing text" : "Edit as text";
    textToggle.setAttribute("aria-expanded", String(opening));
    updatePantryCount();
    if (opening) $("pantry-input").focus();
  });

  // On small screens the pantry sits above the page, so it can fold away.
  const aside = $("pantry");
  const toggle = $("pantry-toggle");
  const setOpen = (open) => {
    aside.classList.toggle("collapsed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide" : "Show";
  };
  toggle.addEventListener("click", () => setOpen(aside.classList.contains("collapsed")));
  setOpen(pantry().length === 0);
  openPantry = () => setOpen(true);

  updatePantryCount();
}
// Adds bought items ({ name, amount }) to the pantry. If the pantry already lists the item
// with an amount ("rice 200 g"), the amounts are added up ("rice 700 g").
function addToPantry(items) {
  const lines = pantry();
  let changed = false;
  for (const { name, amount } of items) {
    const lower = name.toLowerCase();
    const i = lines.findIndex((l) => l.toLowerCase() === lower || l.toLowerCase().startsWith(lower + " "));
    if (i < 0) {
      lines.push(amount ? `${name} ${amount}` : name);
      changed = true;
    } else {
      const had = lines[i].slice(name.length).trim();
      // Without a known amount we can't add up, so leave that line as the user wrote it.
      if (had && amount) {
        lines[i] = `${lines[i].slice(0, name.length)} ${addQuantities([had, amount])}`;
        changed = true;
      }
    }
  }
  if (changed) {
    $("pantry-input").value = lines.join("\n");
    updatePantryCount();
  }
}

// ---------- Cooked it: take what a recipe used out of the pantry ----------
// "200 g" -> { n: 200, unit: "g" }. kg and l become g and ml so they can be compared.
// Sizes like "3 large" count as plain numbers. Anything else ("to taste", "1/2 cup") -> null.
function parseAmount(text) {
  const m = String(text).trim().toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z]*)\.?$/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  let unit = m[2];
  if (unit === "kg" || unit === "l") [n, unit] = [n * 1000, unit === "kg" ? "g" : "ml"];
  if (["large", "medium", "small", "whole", "pcs", "pieces", "piece"].includes(unit)) unit = "";
  return { n, unit };
}

// "rice 700 g" -> { name: "rice", amount: "700 g" }; "onion" -> { name: "onion", amount: "" }
function splitPantryLine(line) {
  const m = line.match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*[a-zA-Z]*)$/);
  return m ? { name: m[1], amount: m[2] } : { name: line, amount: "" };
}

// Does the pantry item cover this recipe ingredient? "rice" covers "basmati rice", "egg" covers "eggs".
function sameItem(pantryName, recipeName) {
  const words = (s) => s.toLowerCase().split(/[^a-z]+/).filter(Boolean).map((w) => w.replace(/(es|s)$/, ""));
  const recipeWords = words(recipeName);
  const pantryWords = words(pantryName);
  return pantryWords.length > 0 && pantryWords.every((w) => recipeWords.includes(w));
}

// Subtracts the recipe's ingredients from the pantry. Returns what changed.
function useFromPantry(ingredients) {
  const lines = pantry();
  const result = { updated: [], usedUp: [], unchanged: [] };
  for (const ing of ingredients) {
    const i = lines.findIndex((l) => sameItem(splitPantryLine(l).name, ing.name));
    if (i < 0) continue;
    const { name, amount } = splitPantryLine(lines[i]);
    const have = amount ? parseAmount(amount) : null;
    const need = parseAmount(ing.quantity);
    if (!have || !need || have.unit !== need.unit) {
      result.unchanged.push(name);
      continue;
    }
    const left = Math.round((have.n - need.n) * 100) / 100;
    if (left <= 0) {
      lines.splice(i, 1);
      result.usedUp.push(name);
    } else {
      const shown = addQuantities([`${left}${have.unit ? " " + have.unit : ""}`]);
      lines[i] = `${name} ${shown}`;
      result.updated.push(`${name} ${shown}`);
    }
  }
  $("pantry-input").value = lines.join("\n");
  updatePantryCount();
  return result;
}

function cookedSummary({ updated, usedUp, unchanged }) {
  const parts = [];
  if (updated.length) parts.push(`Now in your pantry: ${updated.join(", ")}.`);
  if (usedUp.length) parts.push(`Used up and removed: ${usedUp.join(", ")}.`);
  if (unchanged.length) parts.push(`Check by hand (no amount to subtract): ${unchanged.join(", ")}.`);
  return parts.join(" ") || "None of these ingredients are in your pantry, so nothing changed.";
}

// What every request to the server includes.
function kitchen() {
  return { pantry: pantry(), has_basics: $("basics").checked, people: settings.people };
}

// ---------- Talking to the server ----------
async function post(url, body) {
  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Couldn't reach the Mise server. Check that it's still running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

// Shows a busy label on the button while waiting for Claude.
async function withBusyButton(form, messageId, work) {
  const button = form.querySelector("button[type=submit]");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = button.dataset.busyLabel;
  showMessage(messageId, "");
  try {
    await work();
  } catch (err) {
    showMessage(messageId, err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// ---------- Recipe card ----------
function recipeCard(recipe, sourceId = recipe.title) {
  const missing = recipe.ingredients.filter((i) => !i.have_it);

  const ingredients = el("ul", { class: "ings" },
    ...recipe.ingredients.map((ing) =>
      el("li", { class: ing.have_it ? "have" : "buy" },
        el("span", { class: "qty", text: ing.quantity }),
        el("span", { class: "name", text: ing.name }),
        // You have some already: say how much is missing.
        !ing.have_it && ing.buy && ing.buy !== ing.quantity
          ? el("span", { class: "buy-only", text: `buy ${ing.buy}` })
          : null,
      )
    ),
  );
  const steps = el("ol", { class: "steps" },
    ...recipe.steps.map((step) => el("li", {}, el("span", { text: step }))),
  );
  const legend = el("p", { class: "legend" },
    "✓ you have it   ", el("span", { class: "swatch", text: "highlighted" }), " to buy");

  const addButton = missing.length
    ? el("button", {
        class: "btn primary",
        type: "button",
        text: `Add ${plural(missing.length, "missing ingredient", "missing ingredients")} to shopping list`,
        onclick: () => {
          const added = addIngredients(recipe.ingredients, recipe.title, sourceId);
          toast(added ? `Added ${plural(added, "item", "items")} to your shopping list` : "Already on your shopping list");
        },
      })
    : null;

  // "Cooked it" takes the ingredients out of the pantry. Plan meals remember it.
  const inPlan = Boolean(planRecipes[sourceId]);
  const cookedNote = el("div", { class: "cooked-note", role: "status" });
  const cookedButton = el("button", { class: "btn is-done", type: "button" });
  const showCooked = (done) => {
    cookedButton.textContent = done ? "✓ Cooked" : "Cooked it";
    cookedButton.disabled = done;
  };
  showCooked(inPlan && planRecipes[sourceId].cooked);
  cookedButton.addEventListener("click", () => {
    const before = $("pantry-input").value;
    const result = useFromPantry(recipe.ingredients);
    setCooked(sourceId, true);
    showCooked(true);
    cookedNote.replaceChildren(
      el("p", { text: cookedSummary(result) }),
      el("button", {
        class: "btn small", type: "button", text: "Undo",
        onclick: () => {
          $("pantry-input").value = before;
          updatePantryCount();
          setCooked(sourceId, false);
          showCooked(false);
          cookedNote.replaceChildren();
          toast("Pantry restored");
        },
      }),
    );
    toast("Pantry updated");
  });

  const action = recipe.steps.length
    ? el("div", {},
        missing.length ? null : el("p", { class: "all-set", text: "You have everything you need." }),
        el("div", { class: "recipe-actions" }, addButton, cookedButton),
        cookedNote,
      )
    : null;

  return el("article", { class: "recipe" },
    el("h2", { text: recipe.title }),
    el("p", { class: "desc", text: recipe.description }),
    el("div", { class: "meta" },
      el("span", { text: `${recipe.total_time_minutes} min` }),
      el("span", { text: plural(recipe.servings, "serving", "servings") }),
    ),
    el("div", { class: "cols" },
      el("section", {}, el("h3", { text: "Ingredients" }), ingredients, legend),
      el("section", {}, el("h3", { text: "Steps" }), steps),
    ),
    action,
  );
}

// ---------- Shopping list ----------
// Adds the ingredients you don't have. sourceId stops the same meal being added twice.
function addIngredients(ingredients, label, sourceId) {
  let added = 0;
  for (const ing of ingredients) {
    if (ing.have_it) continue;
    const key = ing.name.trim().toLowerCase();
    const item = (shopping[key] ??= {
      name: ing.name, quantities: [], category: ing.category, recipes: [], sources: [], done: false,
    });
    item.sources ??= [...item.recipes];
    if (item.sources.includes(sourceId)) continue;
    item.sources.push(sourceId);
    item.quantities.push(ing.buy || ing.quantity); // older plans have no "buy"
    if (!item.recipes.includes(label)) item.recipes.push(label);
    item.done = false;
    added++;
  }
  saveShopping();
  return added;
}

function saveShopping() {
  store.save("shopping", shopping);
  renderShopping();
}

function renderShopping() {
  const items = Object.entries(shopping);
  const left = items.filter(([, v]) => !v.done).length;
  $("list-badge").textContent = left ? String(left) : "";
  $("tab-list").setAttribute("aria-label", left ? `Shopping list, ${left} left` : "Shopping list");

  const box = $("list-content");
  box.replaceChildren();

  if (!items.length) {
    box.append(el("p", {
      class: "empty",
      text: "Your shopping list is empty. Add groceries from your meal plan, or from any recipe, with one click.",
    }));
    return;
  }

  box.append(el("p", { class: "count", text: `${left} of ${plural(items.length, "item", "items")} left to buy` }));

  for (const category of CATEGORY_ORDER) {
    const inCategory = items
      .filter(([, v]) => (CATEGORY_ORDER.includes(v.category) ? v.category : "Other") === category)
      .sort(([a], [b]) => a.localeCompare(b));
    if (!inCategory.length) continue;

    box.append(el("h3", { class: "section-name", text: category }));
    box.append(el("ul", { class: "items" },
      ...inCategory.map(([, item]) => {
        const checkbox = el("input", { type: "checkbox" });
        checkbox.checked = item.done;
        checkbox.addEventListener("change", () => {
          item.done = checkbox.checked;
          saveShopping();
        });
        const forText = item.recipes.length > 3
          ? `For ${item.recipes.slice(0, 3).join(", ")} and ${item.recipes.length - 3} more`
          : `For ${item.recipes.join(", ")}`;
        return el("li", { class: item.done ? "done" : "" },
          el("label", { class: "check" },
            checkbox,
            el("span", {},
              el("span", { class: "label", text: `${item.name}, ${addQuantities(item.quantities)}` }),
              el("span", { class: "for", text: forText }),
            ),
          ),
        );
      }),
    ));
  }

  const checked = () => Object.entries(shopping).filter(([, v]) => v.done);
  box.append(el("div", { class: "list-actions" },
    el("button", {
      class: "btn primary", type: "button", text: "Move checked to pantry",
      onclick: () => {
        const done = checked();
        if (!done.length) return toast("Tick the items you bought first");
        addToPantry(done.map(([, v]) => ({ name: v.name, amount: addQuantities(v.quantities) })));
        for (const [key] of done) delete shopping[key];
        saveShopping();
        toast(`Moved ${plural(done.length, "item", "items")} to your pantry`);
      },
    }),
    el("button", {
      class: "btn", type: "button", text: "Remove checked items",
      onclick: () => {
        const done = checked();
        if (!done.length) return toast("Nothing is checked yet");
        for (const [key] of done) delete shopping[key];
        saveShopping();
        toast(`Removed ${plural(done.length, "item", "items")}`);
      },
    }),
    el("button", {
      class: "btn", type: "button", text: "Clear whole list",
      onclick: () => {
        if (!confirm("Remove every item from your shopping list?")) return;
        shopping = {};
        saveShopping();
        toast("Shopping list cleared");
      },
    }),
    el("button", { class: "btn", type: "button", text: "Download list", onclick: downloadList }),
  ));
}

function downloadList() {
  const lines = [];
  for (const category of CATEGORY_ORDER) {
    const items = Object.values(shopping).filter((v) => v.category === category && !v.done);
    if (!items.length) continue;
    lines.push(category.toUpperCase());
    for (const v of items) lines.push(`[ ] ${v.name} - ${addQuantities(v.quantities)}`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const link = el("a", { href: URL.createObjectURL(blob), download: "shopping-list.txt" });
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---------- Plan settings form ----------
function renderPeople() {
  const box = $("people");
  box.replaceChildren(...settings.people.map((person, i) => {
    const name = el("input", {
      type: "text", maxlength: 60, placeholder: `Person ${i + 1}`, "aria-label": `Name of person ${i + 1}`,
    });
    name.value = person.name;
    name.addEventListener("input", () => { person.name = name.value; saveSettings(); });

    const notes = el("input", {
      type: "text", maxlength: 300, placeholder: "Other restrictions or foods they don't eat",
      "aria-label": `Other restrictions for person ${i + 1}`,
    });
    notes.value = person.notes;
    notes.addEventListener("input", () => { person.notes = notes.value; saveSettings(); });

    const chips = el("div", { class: "chips", role: "group", "aria-label": `Restrictions for person ${i + 1}` },
      ...RESTRICTIONS.map((r) => {
        const box = el("input", { type: "checkbox" });
        box.checked = person.restrictions.includes(r);
        box.addEventListener("change", () => {
          person.restrictions = box.checked
            ? [...person.restrictions, r]
            : person.restrictions.filter((x) => x !== r);
          saveSettings();
        });
        return el("label", { class: "chip" }, box, el("span", { text: r }));
      }),
    );

    const remove = settings.people.length > 1
      ? el("button", {
          type: "button", class: "btn small", text: "Remove",
          "aria-label": `Remove person ${i + 1}`,
          onclick: () => { settings.people.splice(i, 1); saveSettings(); renderPeople(); },
        })
      : null;

    return el("div", { class: "person" }, el("div", { class: "person-top" }, name, remove), chips, notes);
  }));
}

function renderMealGrid() {
  const table = $("meal-grid");
  const head = el("tr", {}, el("th", { scope: "col", text: "" }),
    ...WEEKDAYS.map((d, i) => el("th", { scope: "col", class: i >= 5 ? "weekend" : null, title: d, text: d.slice(0, 3) })));
  const rows = MEALS.map((meal) => el("tr", {},
    el("th", { scope: "row", text: meal }),
    ...WEEKDAYS.map((day, i) => {
      const box = el("input", { type: "checkbox", "aria-label": `${meal} on ${day}` });
      box.checked = settings.meals[meal][i];
      box.addEventListener("change", () => { settings.meals[meal][i] = box.checked; saveSettings(); });
      return el("td", {}, box);
    }),
  ));
  table.replaceChildren(el("thead", {}, head), el("tbody", {}, ...rows));
}

function setupSettingsForm() {
  for (const id of ["weekday-minutes", "weekend-minutes"]) {
    $(id).replaceChildren(...MINUTES.map((m) => el("option", { value: m, text: m < 60 ? `Up to ${m} min` : `Up to ${m / 60 === 1 ? "1 hour" : m / 60 + " hours"}` })));
  }
  $("weekday-minutes").value = settings.weekdayMinutes;
  $("weekend-minutes").value = settings.weekendMinutes;
  document.querySelector(`input[name=length][value="${settings.length}"]`).checked = true;
  if (settings.start < isoDate(new Date())) settings.start = isoDate(new Date());
  $("start").value = settings.start;
  $("diet-select").value = settings.diet;
  $("diet-other").value = settings.dietOther;
  $("diet-other").hidden = settings.diet !== "other";
  $("relaxed").checked = settings.relaxed;
  $("leftovers").checked = settings.leftovers;
  $("repeats").checked = settings.repeats;
  $("requirements").value = settings.requirements;

  const read = () => {
    settings.length = Number(document.querySelector("input[name=length]:checked").value);
    settings.start = $("start").value || isoDate(new Date());
    settings.weekdayMinutes = Number($("weekday-minutes").value);
    settings.weekendMinutes = Number($("weekend-minutes").value);
    settings.diet = $("diet-select").value;
    settings.dietOther = $("diet-other").value;
    settings.relaxed = $("relaxed").checked;
    settings.leftovers = $("leftovers").checked;
    settings.repeats = $("repeats").checked;
    settings.requirements = $("requirements").value;
    $("diet-other").hidden = settings.diet !== "other";
    saveSettings();
  };
  $("plan-form").addEventListener("change", read);
  $("plan-form").addEventListener("input", read);

  $("add-person").addEventListener("click", () => {
    if (settings.people.length >= 12) return toast("You can add up to 12 people");
    settings.people.push({ name: "", restrictions: [], notes: "" });
    saveSettings();
    renderPeople();
    $("people").lastElementChild.querySelector("input").focus();
  });

  $("plan-form").addEventListener("submit", (e) => {
    e.preventDefault();
    read();
    if (!buildSlots().length) {
      showMessage("plan-message", "Tick at least one meal in Which meals.", true);
      return;
    }
    if (plan && !confirm("Replace your current meal plan with a new one?")) return;
    startNewPlan();
  });

  renderPeople();
  renderMealGrid();
  saveSettings();
}

function saveSettings() {
  store.save("settings", settings);
  const meals = buildSlots().length;
  $("plan-summary").textContent =
    `${plural(meals, "meal", "meals")} for ${plural(settings.people.length, "person", "people")}`;
  const hasRules = settings.people.some((p) => p.restrictions.length || p.notes.trim());
  document.querySelectorAll(".household-note").forEach((n) => (n.hidden = !hasRules));
}

// Every meal to plan, in date order.
function buildSlots(start = settings.start, length = settings.length) {
  const slots = [];
  for (let d = 0; d < length; d++) {
    const date = addDays(start, d);
    const wd = weekdayIndex(date);
    const weekend = wd >= 5;
    for (const meal of MEALS) {
      if (!settings.meals[meal][wd]) continue;
      slots.push({
        date,
        weekday: WEEKDAYS[wd],
        meal,
        max_minutes: weekend ? settings.weekendMinutes : settings.weekdayMinutes,
        relaxed: weekend && settings.relaxed,
      });
    }
  }
  return slots;
}

// ---------- Making the plan ----------
function startNewPlan() {
  const weeks = [];
  for (let d = 0; d < settings.length; d += 7) {
    const start = addDays(settings.start, d);
    const days = Math.min(7, settings.length - d);
    weeks.push({ start, end: addDays(start, days - 1), done: false, meals: [] });
  }
  plan = {
    start: settings.start,
    length: settings.length,
    servings: settings.people.length,
    people: settings.people.map((p) => p.name.trim()).filter(Boolean),
    weeks,
  };
  planRecipes = {};
  store.save("planRecipes", planRecipes);
  savePlan();
  $("settings").open = false;
  fillPlan();
}

// Plans the weeks that aren't done yet, one at a time, showing each as it arrives.
async function fillPlan() {
  if (planning || !plan) return;
  planning = true;
  planError = "";
  showMessage("plan-message", "");
  const button = $("plan-button");
  button.disabled = true;
  renderPlan();
  try {
    for (const [n, week] of plan.weeks.entries()) {
      if (week.done) continue;
      const days = Math.round((parseDate(week.end) - parseDate(week.start)) / 86400000) + 1;
      const slots = buildSlots(week.start, days);
      if (slots.length) {
        showMessage("plan-message", `Planning week ${n + 1} of ${plan.weeks.length}...`);
        const avoid = plan.weeks.flatMap((w) => w.meals.map((m) => m.title)).slice(-150);
        const { meals } = await post("/api/plan", {
          ...kitchen(),
          slots,
          diet: settings.diet === "other" ? settings.dietOther : settings.diet,
          requirements: settings.requirements,
          leftovers: settings.leftovers,
          repeats: settings.repeats,
          avoid,
        });
        week.meals = meals;
      }
      week.done = true;
      savePlan();
      renderPlan();
    }
    showMessage("plan-message", "");
    toast("Your meal plan is ready");
  } catch (err) {
    planError = err.message;
    showMessage("plan-message", err.message, true);
  } finally {
    planning = false;
    button.disabled = false;
    renderPlan();
  }
}

function savePlan() {
  store.save("plan", plan);
}

function weekMissing(week) {
  return week.meals.reduce((n, m) => n + m.ingredients.filter((i) => !i.have_it).length, 0);
}

function addWeekToList(week, n) {
  let added = 0;
  for (const meal of week.meals) {
    added += addIngredients(meal.ingredients, meal.title, `${meal.date}|${meal.meal}`);
  }
  toast(added
    ? `Added ${plural(added, "item", "items")} for week ${n + 1} to your shopping list`
    : `Week ${n + 1} is already on your shopping list`);
}

function renderPlan() {
  const box = $("plan-result");
  if (!plan) {
    box.replaceChildren();
    $("settings").open = true;
    return;
  }

  const allDone = plan.weeks.every((w) => w.done);
  const who = plan.people?.length ? plan.people.join(", ") : plural(plan.servings, "person", "people");
  const head = el("div", { class: "plan-head" },
    el("div", {},
      el("h2", { text: `${shortDate(plan.start)} to ${shortDate(addDays(plan.start, plan.length - 1))}` }),
      el("p", { text: `Meal plan for ${who}` }),
    ),
    el("div", { class: "plan-actions" },
      allDone && plan.weeks.length > 1
        ? el("button", {
            class: "btn primary", type: "button", text: "Add whole plan to shopping list",
            onclick: () => {
              let added = 0;
              for (const w of plan.weeks) for (const m of w.meals) added += addIngredients(m.ingredients, m.title, `${m.date}|${m.meal}`);
              toast(added ? `Added ${plural(added, "item", "items")} to your shopping list` : "The whole plan is already on your list");
            },
          })
        : null,
      el("button", {
        class: "btn", type: "button", text: "Delete plan", disabled: planning,
        onclick: () => {
          if (!confirm("Delete this meal plan? Your shopping list stays as it is.")) return;
          plan = null;
          planRecipes = {};
          store.save("planRecipes", planRecipes);
          savePlan();
          renderPlan();
        },
      }),
    ),
  );

  const weeks = plan.weeks.map((week, n) => {
    const missing = weekMissing(week);
    const weekHead = el("div", { class: "week-head" },
      el("h3", {}, `Week ${n + 1}`, el("small", { text: `${shortDate(week.start)} to ${shortDate(week.end)}` })),
      week.done && week.meals.length
        ? el("div", { class: "week-tools" },
            el("span", { text: `${plural(week.meals.length, "meal", "meals")}, ${plural(missing, "ingredient", "ingredients")} to buy` }),
            missing
              ? el("button", { class: "btn small", type: "button", text: "Add to shopping list", onclick: () => addWeekToList(week, n) })
              : null,
          )
        : null,
    );

    if (!week.done) {
      const isNext = plan.weeks.findIndex((w) => !w.done) === n;
      return el("section", { class: "week" }, weekHead,
        el("div", { class: "week-pending" },
          el("p", { text: planning && isNext ? "Planning this week..." : "Not planned yet." }),
          !planning && isNext && planError ? el("p", { class: "message error", text: planError }) : null,
          !planning && isNext
            ? el("button", { class: "btn primary", type: "button", text: "Plan the remaining weeks", onclick: fillPlan })
            : null,
        ));
    }

    // Each meal type keeps its own column, so dinners line up even on days without lunch.
    const types = MEALS.filter((name) => plan.weeks.some((w) => w.meals.some((m) => m.meal === name)));
    const days = [];
    const length = Math.round((parseDate(week.end) - parseDate(week.start)) / 86400000) + 1;
    for (let d = 0; d < length; d++) {
      const date = addDays(week.start, d);
      const wd = weekdayIndex(date);
      const meals = MEALS.map((name) => week.meals.find((m) => m.date === date && m.meal === name)).filter(Boolean);
      days.push(el("div", { class: "day" },
        el("div", { class: "day-date" },
          el("span", { class: "dow", text: WEEKDAYS[wd].slice(0, 3) }),
          el("span", { class: "num", text: String(parseDate(date).getDate()) }),
          wd >= 5 && settings.relaxed ? el("span", { class: "tag", text: "Relaxed" }) : null,
        ),
        meals.length
          ? el("div", { class: "day-meals", style: `--cols: ${types.length}` },
              ...meals.map((m) => { const card = mealCard(m); card.style.gridColumn = String(types.indexOf(m.meal) + 1); return card; }))
          : el("p", { class: "day-empty", text: "Nothing planned" }),
      ));
    }
    return el("section", { class: "week" }, weekHead, ...days);
  });

  box.replaceChildren(head, ...weeks);
}

function mealCard(meal) {
  const toBuy = meal.ingredients.filter((i) => !i.have_it).length;
  return el("button", {
    type: "button",
    class: "meal-card",
    "aria-label": `${meal.meal} on ${longDate(meal.date)}: ${meal.title}. Open recipe`,
    onclick: () => openMeal(meal),
  },
    el("span", { class: "which" }, meal.meal,
      planRecipes[`${meal.date}|${meal.meal}`]?.cooked ? el("span", { class: "cooked-tag", text: "✓ Cooked" }) : null),
    el("span", { class: "title", text: meal.title }),
    el("span", { class: "facts" },
      `${meal.total_time_minutes} min`,
      toBuy ? ", " : ", nothing to buy",
      toBuy ? el("span", { class: "tobuy", text: `${toBuy} to buy` }) : null,
    ),
  );
}

// ---------- Meal dialog ----------
async function openMeal(meal) {
  const key = `${meal.date}|${meal.meal}`;
  const dialog = $("meal-dialog");
  dialog.dataset.key = key;
  $("dialog-title").textContent = `${meal.meal}, ${longDate(meal.date)}`;
  const body = $("dialog-body");

  dialog.meal = meal;
  $("swap-panel").hidden = true;
  $("swap-reason").value = "";
  $("swap-toggle").hidden = !findMeal(meal);
  $("swap-toggle").setAttribute("aria-expanded", "false");
  $("swap-message").textContent = "";

  if (planRecipes[key]) {
    body.replaceChildren(recipeCard(planRecipes[key], key));
    if (!dialog.open) dialog.showModal();
    return;
  }

  // Show what we already know while Claude writes the steps.
  const preview = recipeCard({ ...meal, servings: plan?.servings || 1, steps: [] }, key);
  preview.querySelector(".steps").replaceWith(el("p", { class: "loading-note", text: "Writing the steps..." }));
  body.replaceChildren(preview);
  if (!dialog.open) dialog.showModal();

  try {
    const recipe = await post("/api/plan/recipe", { ...kitchen(), meal });
    planRecipes[key] = recipe;
    store.save("planRecipes", planRecipes);
    if (dialog.open && dialog.dataset.key === key) {
      body.replaceChildren(recipeCard(recipe, key));
    }
  } catch (err) {
    const note = body.querySelector(".loading-note");
    if (note) {
      note.textContent = err.message;
      note.classList.add("message", "error");
    }
  }
}

function setupDialog() {
  const dialog = $("meal-dialog");
  $("dialog-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  $("swap-toggle").addEventListener("click", () => {
    const panel = $("swap-panel");
    panel.hidden = !panel.hidden;
    $("swap-toggle").setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) $("swap-reason").focus();
  });
  $("swap-panel").addEventListener("submit", (e) => {
    e.preventDefault();
    if (dialog.meal) swapMeal(dialog.meal, $("swap-reason").value.trim());
  });
}

// Marks a plan meal as cooked (its full recipe is stored in planRecipes).
function setCooked(key, done) {
  if (!planRecipes[key]) return;
  planRecipes[key].cooked = done;
  store.save("planRecipes", planRecipes);
  if (plan) renderPlan();
}

// Where a meal sits in the plan, so it can be replaced.
function findMeal(meal) {
  if (!plan) return null;
  for (const week of plan.weeks) {
    const index = week.meals.findIndex((m) => m.date === meal.date && m.meal === meal.meal);
    if (index >= 0) return { week, index };
  }
  return null;
}

// Ask Claude for a different dish for one slot of the plan.
async function swapMeal(meal, reason) {
  const spot = findMeal(meal);
  if (!spot) return;
  if (planning) { $("swap-message").textContent = "Wait until the plan is finished, then try again."; return; }
  const button = $("swap-submit");
  const message = $("swap-message");
  const wd = weekdayIndex(meal.date);
  const weekend = wd >= 5;
  button.disabled = true;
  message.classList.remove("error");
  message.textContent = "Finding something else...";
  try {
    const { meals } = await post("/api/plan", {
      ...kitchen(),
      slots: [{
        date: meal.date,
        weekday: WEEKDAYS[wd],
        meal: meal.meal,
        max_minutes: weekend ? settings.weekendMinutes : settings.weekdayMinutes,
        relaxed: weekend && settings.relaxed,
      }],
      diet: settings.diet === "other" ? settings.dietOther : settings.diet,
      requirements: settings.requirements,
      leftovers: false,
      repeats: settings.repeats,
      avoid: plan.weeks.flatMap((w) => w.meals.map((m) => m.title)).slice(-150),
      replace: meal.title,
      replace_reason: reason,
    });
    if (!meals.length) throw new Error("No new meal came back. Please try again.");
    const fresh = meals[0];
    spot.week.meals[spot.index] = fresh;
    delete planRecipes[`${meal.date}|${meal.meal}`];
    store.save("planRecipes", planRecipes);
    savePlan();
    renderPlan();
    toast(`Swapped for ${fresh.title}`);
    if ($("meal-dialog").open) openMeal(fresh);
  } catch (err) {
    message.textContent = err.message;
    message.classList.add("error");
  } finally {
    button.disabled = false;
  }
}

// ---------- Tabs ----------
function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab, focus = true) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    }
    if (focus) tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) select(tabs[(i + step + tabs.length) % tabs.length]);
    });
  });
}

// ---------- Create a recipe / What can I cook? ----------
function setupForms() {
  $("servings").value = Math.min(20, settings.people.length || 2);

  const createForm = $("create-form");
  createForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const request = $("request").value.trim();
    if (!request) {
      showMessage("create-message", "Type what you'd like to cook, then press Create recipe.", true);
      $("request").focus();
      return;
    }
    withBusyButton(createForm, "create-message", async () => {
      const recipe = await post("/api/recipe", {
        ...kitchen(),
        request,
        servings: Number($("servings").value) || 2,
        diet: $("diet").value.trim(),
      });
      $("create-result").replaceChildren(recipeCard(recipe));
    });
  });

  const suggestForm = $("suggest-form");
  suggestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!pantry().length) {
      showMessage("suggest-message", "Add some ingredients to My pantry first.", true);
      openPantry();
      $("pantry-add").focus();
      return;
    }
    withBusyButton(suggestForm, "suggest-message", async () => {
      const { recipes } = await post("/api/suggest", { ...kitchen(), notes: $("notes").value.trim() });
      $("suggest-result").replaceChildren(...recipes.map((recipe, n) => {
        const missing = recipe.ingredients.filter((i) => !i.have_it).length;
        const details = el("details", { class: "suggestion" },
          el("summary", {},
            el("span", { text: recipe.title }),
            el("span", { class: "tobuy", text: missing ? `${missing} to buy` : "you have everything" }),
          ),
          recipeCard(recipe),
        );
        details.open = n === 0;
        return details;
      }));
    });
  });
}

// ---------- Start ----------
async function start() {
  setupPantry();

  setupTabs();
  setupSettingsForm();
  setupForms();
  setupDialog();
  renderShopping();
  renderPlan();

  try {
    const status = await fetch("/api/status").then((r) => r.json());
    $("key-alert").hidden = status.has_key;
  } catch {
    /* the forms will show a clear error if the server is down */
  }
}

start();
