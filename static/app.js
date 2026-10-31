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

// ---------- Saved data can be old or damaged: check it and fall back to defaults ----------
const isObject = (x) => x && typeof x === "object" && !Array.isArray(x);
const isIso = (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(parseDate(x));

function cleanSettings(saved) {
  const d = defaultSettings();
  if (!isObject(saved)) return d;
  const out = { ...d, ...saved };
  if (![7, 14, 30].includes(out.length)) out.length = d.length;
  if (!isIso(out.start)) out.start = d.start;
  out.meals = {};
  for (const m of MEALS) {
    const days = saved.meals?.[m];
    out.meals[m] = Array.isArray(days) && days.length === 7 ? days.map(Boolean) : d.meals[m];
  }
  const people = Array.isArray(saved.people) && saved.people.length ? saved.people.slice(0, 12) : d.people;
  out.people = people.map((x) => ({
    name: typeof x?.name === "string" ? x.name : "",
    restrictions: Array.isArray(x?.restrictions) ? x.restrictions.filter((r) => typeof r === "string") : [],
    notes: typeof x?.notes === "string" ? x.notes : "",
  }));
  for (const k of ["weekdayMinutes", "weekendMinutes"]) if (!MINUTES.includes(Number(out[k]))) out[k] = d[k];
  for (const k of ["relaxed", "leftovers", "repeats"]) if (typeof out[k] !== "boolean") out[k] = d[k];
  for (const k of ["diet", "dietOther", "requirements"]) if (typeof out[k] !== "string") out[k] = "";
  return out;
}

function cleanMeal(m) {
  return isObject(m) && isIso(m.date) && MEALS.includes(m.meal) && typeof m.title === "string" && Array.isArray(m.ingredients)
    ? { description: "", total_time_minutes: 0, ...m, ingredients: m.ingredients.filter((i) => isObject(i) && typeof i.name === "string") }
    : null;
}

function cleanPlan(saved) {
  if (!isObject(saved) || !isIso(saved.start) || !Array.isArray(saved.weeks) || !saved.weeks.length) return null;
  const weeks = saved.weeks.filter((w) => isObject(w) && isIso(w.start) && isIso(w.end)).map((w) => {
    const meals = Array.isArray(w.meals) ? w.meals.map(cleanMeal).filter(Boolean) : null;
    // A week with no readable meals is planned again.
    return { ...w, meals: meals || [], done: meals ? Boolean(w.done) : false,
             missing: Array.isArray(w.missing) ? w.missing : [] };
  });
  if (!weeks.length) return null;
  const length = [7, 14, 30].includes(saved.length) ? saved.length : weeks.length * 7;
  return { ...saved, length, weeks, servings: Number(saved.servings) || 1,
           people: Array.isArray(saved.people) ? saved.people.filter((x) => typeof x === "string") : [],
           settings: isObject(saved.settings) ? cleanSettings(saved.settings) : undefined };
}

// Every shopping item keeps three lists in step: one entry per recipe that needs it.
function fixItem(item) {
  const q = Array.isArray(item.quantities) ? item.quantities.map(String) : [];
  const recipes = Array.isArray(item.recipes) ? item.recipes.map(String) : [];
  item.quantities = q;
  item.sources = q.map((_, i) => String(item.sources?.[i] ?? `old|${i}`));
  item.labels = q.map((_, i) => String(item.labels?.[i] ?? recipes[i] ?? recipes[0] ?? ""));
  item.recipes = [...new Set(item.labels.filter(Boolean))];
  item.category = typeof item.category === "string" ? item.category : "Other";
  item.done = Boolean(item.done);
  return item;
}

function cleanShopping(saved) {
  if (!isObject(saved)) return {};
  const out = {};
  for (const [key, item] of Object.entries(saved)) {
    if (isObject(item) && typeof item.name === "string") out[key] = fixItem(item);
  }
  return out;
}

let settings = cleanSettings(store.load("settings", {}));
// shopping: { key: { name, category, package, quantities: [], sources: [], labels: [], recipes: [], done, buyAmount } }
let shopping = cleanShopping(store.load("shopping", {}));
// plan: { start, length, servings, people, settings, weeks: [{ start, end, done, meals: [...], missing: [] }] }
let plan = cleanPlan(store.load("plan", null));
// Full recipes opened from the plan, by "date|meal".
let planRecipes = isObject(store.load("planRecipes", {})) ? store.load("planRecipes", {}) : {};
let planning = false;
let planError = ""; // shown next to the week that couldn't be planned
const swapping = new Set(); // "date|meal" of meals being swapped right now

// The settings a plan was made with (later edits to the form don't change a plan in progress).
function planSettings() {
  return plan?.settings || settings;
}
function mealKey(meal) {
  return `${meal.date}|${meal.meal}`;
}
// Shopping-list source for a plan meal; the title makes a swapped meal a different source.
function mealSource(meal) {
  return `${meal.date}|${meal.meal}|${meal.title}`;
}

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
  // An open dialog covers the page, so show the message inside it.
  const host = document.querySelector("dialog[open]") || document.body;
  if (box.parentElement !== host) host.append(box);
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
// Turns cups, ounces, pounds and fractions into metric or decimals so amounts can be added up:
// "3/4 cup" -> "180 ml", "1 1/2 cups" -> "360 ml", "1/2 tsp" -> "0.5 tsp", "8 oz" -> "227 g".
// Older lists saved "3/4 cup" as "3 /4 cup", so a space before the slash is accepted too.
// Anything else comes back unchanged.
const VULGAR = { "½": " 1/2", "¼": " 1/4", "¾": " 3/4", "⅓": " 1/3", "⅔": " 2/3", "⅛": " 1/8" };
// Units that measure something. Any other word after a number ("2 eggs", "3 large") is a plain count.
const MEASURES = new Set(["g", "kg", "ml", "l", "tsp", "tbsp", "clove", "cloves", "head", "heads", "bunch", "bunches",
  "can", "cans", "jar", "jars", "bottle", "bottles", "pack", "packs", "packet", "packets", "slice", "slices",
  "pinch", "pinches", "sprig", "sprigs", "stalk", "stalks", "leaf", "leaves", "sheet", "sheets", "handful", "handfuls"]);
const TO_METRIC = {
  cup: [240, "ml"], cups: [240, "ml"], "fl oz": [30, "ml"],
  oz: [28.35, "g"], ounce: [28.35, "g"], ounces: [28.35, "g"],
  lb: [453.6, "g"], lbs: [453.6, "g"], pound: [453.6, "g"], pounds: [453.6, "g"],
};
function normalizeAmount(text) {
  let t = String(text ?? "").trim();
  for (const [k, v] of Object.entries(VULGAR)) t = t.replaceAll(k, v);
  t = t.trim().replace(/\s+/g, " ");
  const m = t.toLowerCase().match(/^(?:(\d+)\s+(?=\d+\s*\/))?(\d+(?:[.,]\d+)?)(?:\s*\/\s*(\d+))?\s*([a-z][a-z ]*?)?\.?$/);
  if (!m) return t;
  const den = m[3] ? Number(m[3]) : 1;
  if (!den) return t; // "1/0" isn't an amount
  const n = (m[1] ? Number(m[1]) : 0) + parseFloat(m[2].replace(",", ".")) / den;
  const unit = (m[4] || "").trim();
  const metric = TO_METRIC[unit];
  if (metric) return `${Math.round(n * metric[0])} ${metric[1]}`;
  if (!m[3] && !m[1]) return t; // nothing to change
  return `${Math.round(n * 100) / 100}${unit ? " " + unit : ""}`;
}

function addQuantities(list) {
  const totals = new Map();
  const other = [];
  for (const raw of list) {
    const q = normalizeAmount(raw);
    if (!q) continue;
    // Only "number + simple unit" can be added up; anything else is listed as it is.
    const m = String(q).trim().match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-Z]*)$/);
    if (!m) { other.push(q); continue; }
    let unit = m[2].trim().toLowerCase();
    if (!MEASURES.has(unit)) unit = ""; // "3 large" and "2 eggs" are counts
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
    // Only numbers are saved; anything else is marked and left out until it's fixed.
    const valid = !n || /^\d+(?:[.,]\d+)?$/.test(n);
    number.toggleAttribute("aria-invalid", !valid);
    if (!valid) { number.setAttribute("aria-invalid", "true"); return; }
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
    // Switching between g and kg (or ml and l) converts the number too: 40 g -> 0.04 kg.
    const n = value();
    const change = `${lastUnit}>${unit.value}`;
    const tidyFine = (x) => String(Math.round(x * 10000) / 10000);
    if (n > 0 && (change === "g>kg" || change === "ml>l")) number.value = tidyFine(n / 1000);
    if (n > 0 && (change === "kg>g" || change === "l>ml")) number.value = tidyFine(n * 1000);
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

// Pantry lines saved with cups or fractions ("milk 3 /4 cup") become metric ("milk 180 ml").
function tidyPantryText(text) {
  return text.split("\n").map((line) => {
    const i = line.search(/\d/);
    if (i <= 0) return line;
    const name = line.slice(0, i).trim();
    const amount = line.slice(i).trim();
    const fixed = normalizeAmount(amount);
    if (fixed === amount) return line; // already fine, leave it exactly as written
    return name && /^\d/.test(fixed) ? `${name} ${fixed}` : line;
  }).join("\n");
}

function setupPantry() {
  $("pantry-input").value = tidyPantryText(store.load("pantry", ""));
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
    const unclear = [];
    for (const f of fresh) {
      const same = items.find((it) => it.name.toLowerCase() === f.name.toLowerCase());
      if (!same) items.push(f);
      else if (!f.amount) already++;
      else if (!same.amount) same.amount = f.amount;
      else {
        const sum = mergeAmounts(same.amount, f.amount);
        if (sum) same.amount = sum; else unclear.push(f.name);
      }
    }
    writePantry(items);
    input.value = "";
    input.focus();
    toast(unclear.length
      ? `Couldn't add the amounts for ${unclear.join(", ")}. Change them in the list.`
      : already === fresh.length ? "Already in your pantry" : "Added to your pantry");
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
// Only the parts of an amount that are numbers: "500 g + to taste" -> ["500 g"].
function amountTerms(amount) {
  return String(amount ?? "").split("+").map((t) => normalizeAmount(t)).filter((t) => parseAmount(t));
}
// Adds two amounts when they add up cleanly ("200 g" + "500 g" = "700 g"); otherwise null.
function mergeAmounts(a, b) {
  const sum = addQuantities([...amountTerms(a), ...amountTerms(b)]);
  return sum && !sum.includes("+") ? sum : null;
}
// A bought amount as one clean amount, or "" if there isn't one.
function cleanAmount(amount) {
  const terms = amountTerms(amount);
  const sum = addQuantities(terms);
  return sum && !sum.includes("+") ? sum : terms[0] || "";
}

// Adds bought items ({ name, amount }) to the pantry. If the pantry already lists the same item
// with an amount ("rice 200 g"), the amounts are added up ("rice 700 g").
// Returns the names whose amounts couldn't be added up (they're left as they were).
function addToPantry(items) {
  const rows = pantry().map(splitPantryLine);
  const unclear = [];
  for (const { name, amount } of items) {
    const clean = cleanAmount(amount);
    const same = rows.find((r) => r.name.toLowerCase() === name.trim().toLowerCase());
    if (!same) rows.push({ name, amount: clean });
    // Without a known amount we can't add up, so leave that line as the user wrote it.
    else if (same.amount && clean) {
      const sum = mergeAmounts(same.amount, clean);
      if (sum) same.amount = sum; else unclear.push(name);
    }
  }
  writePantry(rows);
  return unclear;
}

// ---------- Cooked it: take what a recipe used out of the pantry ----------
// "200 g" -> { n: 200, unit: "g" }. kg and l become g and ml so they can be compared.
// Sizes like "3 large" count as plain numbers. Anything else ("to taste", "1/2 cup") -> null.
function parseAmount(text) {
  const m = normalizeAmount(text).toLowerCase().match(/^(\d+(?:[.,]\d+)?)\s*([a-z]*)\.?$/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(",", "."));
  let unit = m[2];
  if (unit === "kg" || unit === "l") [n, unit] = [n * 1000, unit === "kg" ? "g" : "ml"];
  if (!MEASURES.has(unit)) unit = ""; // "3 large", "2 eggs" and "6 pcs" are counts
  return { n, unit };
}

// "rice 700 g" -> { name: "rice", amount: "700 g" }; "onion" -> { name: "onion", amount: "" }
function splitPantryLine(line) {
  const t = String(line).trim();
  let m = t.match(/^(.*?)\s+(\d+(?:[.,]\d+)?\s*[a-zA-Z]*)$/);
  if (m) return { name: m[1], amount: m[2] };
  // Amount first: "500 g chicken", "2 onions", "1 kg rice"
  m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|tsp|tbsp)?\s+(.+)$/i);
  if (m) return { name: m[3], amount: m[2] ? `${m[1]} ${m[2].toLowerCase()}` : m[1] };
  return { name: t, amount: "" };
}

// Words that describe an ingredient without making it a different one
// ("basmati rice" is rice, "chicken breast" is chicken), unlike "coconut milk" or "bell pepper".
const DESCRIPTORS = new Set(["fresh", "large", "small", "medium", "ripe", "raw", "cooked", "uncooked", "dried", "dry",
  "frozen", "whole", "boneless", "skinless", "extra", "virgin", "plain", "basmati", "jasmine", "arborio", "long", "short",
  "grain", "breast", "breasts", "thigh", "thighs", "fillet", "fillets", "minced", "chopped", "sliced", "diced", "grated",
  "organic", "unsalted", "salted", "lean", "free", "range"]);
function singular(w) {
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (/(ch|sh|x|o)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}
function coreWords(name) {
  return new Set(name.toLowerCase().split(/[^a-z]+/).filter(Boolean).filter((w) => !DESCRIPTORS.has(w)).map(singular));
}
// Does the pantry item cover this recipe ingredient? Their main words have to be the same.
function sameItem(pantryName, recipeName) {
  const p = coreWords(pantryName);
  const r = coreWords(recipeName);
  return p.size > 0 && p.size === r.size && [...p].every((w) => r.has(w));
}
// The pantry row for an ingredient: an exact name first, then the same main words.
function findPantryIndex(rows, name) {
  const lower = name.trim().toLowerCase();
  const exact = rows.findIndex((r) => r.name.toLowerCase() === lower);
  return exact >= 0 ? exact : rows.findIndex((r) => sameItem(r.name, name));
}

// Subtracts the recipe's ingredients from the pantry. Returns what changed, including
// a list of line changes ({ before, after }) so it can be undone later.
function useFromPantry(ingredients) {
  const rows = pantry().map(splitPantryLine);
  const result = { updated: [], usedUp: [], unchanged: [], changes: [] };
  for (const ing of ingredients) {
    const i = findPantryIndex(rows, ing.name);
    if (i < 0) continue;
    const row = rows[i];
    const have = row.amount ? parseAmount(row.amount) : null;
    const need = parseAmount(ing.quantity);
    if (!have || !need || have.unit !== need.unit) {
      result.unchanged.push(row.name);
      continue;
    }
    const before = `${row.name} ${row.amount}`;
    const left = Math.round((have.n - need.n) * 100) / 100;
    if (left <= 0) {
      rows.splice(i, 1);
      result.usedUp.push(row.name);
      result.changes.push({ before, after: null });
    } else {
      row.amount = addQuantities([`${left}${have.unit ? " " + have.unit : ""}`]);
      result.updated.push(`${row.name} ${row.amount}`);
      result.changes.push({ before, after: `${row.name} ${row.amount}` });
    }
  }
  writePantry(rows);
  return result;
}

// Puts back what "Cooked it" took, without touching anything the user changed since.
// Returns the lines it couldn't put back.
function undoPantryChanges(changes) {
  const lines = pantry();
  const missed = [];
  for (const { before, after } of [...changes].reverse()) {
    if (after === null) { lines.push(before); continue; }
    const i = lines.indexOf(after);
    if (i >= 0) lines[i] = before; else missed.push(splitPantryLine(before).name);
  }
  writePantry(lines.map(splitPantryLine));
  return missed;
}

function cookedSummary({ updated, usedUp, unchanged }) {
  const parts = [];
  if (updated.length) parts.push(`Now in your pantry: ${updated.join(", ")}.`);
  if (usedUp.length) parts.push(`Used up and removed: ${usedUp.join(", ")}.`);
  if (unchanged.length) parts.push(`Check by hand (no amount to subtract): ${unchanged.join(", ")}.`);
  return parts.join(" ") || "None of these ingredients are in your pantry, so nothing changed.";
}

// What every request to the server includes.
function kitchen(people = settings.people) {
  return { pantry: pantry(), has_basics: $("basics").checked, people };
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
          const meal = planRecipes[sourceId] ? findMeal({ date: sourceId.split("|")[0], meal: sourceId.split("|")[1] }) : null;
          const source = meal ? mealSource(meal.week.meals[meal.index]) : sourceId;
          const added = addIngredients(recipe.ingredients, recipe.title, source).length;
          toast(added ? `Added ${plural(added, "item", "items")} to your shopping list` : "Already on your shopping list");
        },
      })
    : null;

  // "Cooked it" takes the ingredients out of the pantry. Plan meals remember it (and how to undo it).
  const inPlan = Boolean(planRecipes[sourceId]);
  let changes = inPlan ? planRecipes[sourceId].cookedChanges || [] : [];
  const cookedNote = el("div", { class: "cooked-note", role: "status" });
  const cookedButton = el("button", { class: "btn is-done", type: "button" });
  const undoButton = el("button", { class: "btn", type: "button", text: "Undo cooked" });
  const showCooked = (done) => {
    cookedButton.textContent = done ? "✓ Cooked" : "Cooked it";
    cookedButton.disabled = done;
    undoButton.hidden = !done;
  };
  showCooked(inPlan && planRecipes[sourceId].cooked);
  cookedButton.addEventListener("click", () => {
    const result = useFromPantry(recipe.ingredients);
    changes = result.changes;
    setCooked(sourceId, true, changes);
    showCooked(true);
    cookedNote.replaceChildren(el("p", { text: cookedSummary(result) }));
    toast("Pantry updated");
    undoButton.focus();
  });
  undoButton.addEventListener("click", () => {
    const missed = undoPantryChanges(changes);
    changes = [];
    setCooked(sourceId, false, []);
    showCooked(false);
    cookedNote.replaceChildren(missed.length
      ? el("p", { text: `Pantry restored, except ${missed.join(", ")}, which you've changed since. Check those by hand.` })
      : "");
    toast("Pantry restored");
    cookedButton.focus();
  });

  const action = recipe.steps.length
    ? el("div", {},
        missing.length ? null : el("p", { class: "all-set", text: "You have everything you need." }),
        el("div", { class: "recipe-actions" }, addButton, cookedButton, undoButton),
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
// Saves the list and returns the keys of the items it added to.
function addIngredients(ingredients, label, sourceId) {
  const keys = new Set();
  for (const ing of ingredients) {
    if (ing.have_it) continue;
    if (addPart(ing.name, ing.category, ing.package, ing.buy || ing.quantity, label, sourceId)) {
      keys.add(ing.name.trim().toLowerCase());
    }
  }
  saveShopping();
  return [...keys];
}

// One recipe's need for one item. Returns false if that recipe is already counted.
function addPart(name, category, pack, quantity, label, sourceId) {
  const key = name.trim().toLowerCase();
  const item = fixItem(shopping[key] ??= { name, category, quantities: [], done: false });
  if (item.sources.includes(sourceId)) return false;
  item.quantities.push(quantity); // older plans have no "buy"
  item.sources.push(sourceId);
  item.labels.push(label);
  item.recipes = [...new Set(item.labels.filter(Boolean))];
  if (!item.package && pack) item.package = pack;
  delete item.buyAmount; // the need changed, so the suggestion is worked out again
  item.done = false;
  return true;
}

// Takes a swapped-out meal's ingredients off the list (unless they're already bought).
function removeFromList(meal) {
  const ids = new Set([mealSource(meal), mealKey(meal)]); // older lists used "date|meal"
  for (const [key, item] of Object.entries(shopping)) {
    if (item.done) continue;
    fixItem(item);
    const keep = item.sources.map((s) => !ids.has(s));
    if (keep.every(Boolean)) continue;
    item.quantities = item.quantities.filter((_, i) => keep[i]);
    item.sources = item.sources.filter((_, i) => keep[i]);
    item.labels = item.labels.filter((_, i) => keep[i]);
    item.recipes = [...new Set(item.labels.filter(Boolean))];
    delete item.buyAmount;
    if (!item.quantities.length) delete shopping[key];
  }
}

// Claude checks the pantry meal by meal, so several meals can each "have" the same 500 g of rice.
// Adds up what these meals use from each pantry item and puts any shortfall on the list.
function addShortfalls(meals) {
  if (!meals.length) return [];
  const rows = pantry().map(splitPantryLine);
  const totals = new Map();
  for (const m of meals) {
    for (const ing of m.ingredients) {
      const i = findPantryIndex(rows, ing.name);
      if (i < 0 || !rows[i].amount) continue;
      const have = parseAmount(rows[i].amount);
      const need = parseAmount(ing.quantity);
      if (!have || !need || need.unit !== have.unit) continue;
      const t = totals.get(i) ?? { have: have.n, unit: have.unit, need: 0, buying: 0, ing };
      t.need += need.n;
      if (!ing.have_it) {
        const b = parseAmount(ing.buy || ing.quantity);
        if (b && b.unit === have.unit) t.buying += b.n;
      }
      totals.set(i, t);
    }
  }
  const source = `shortfall|${meals[0].date}|${meals[meals.length - 1].date}`;
  const keys = [];
  for (const t of totals.values()) {
    const short = Math.round((t.need - t.have - t.buying) * 100) / 100;
    if (short <= 0) continue;
    const amount = addQuantities([`${short}${t.unit ? " " + t.unit : ""}`]);
    if (addPart(t.ing.name, t.ing.category, t.ing.package, amount, "More than your pantry has", source)) {
      keys.push(t.ing.name.trim().toLowerCase());
    }
  }
  return keys;
}

// Adds plan meals to the list, plus whatever the pantry runs short of. Returns how many items changed.
function addMealsToList(meals) {
  const keys = new Set();
  for (const m of meals) for (const k of addIngredients(m.ingredients, m.title, mealSource(m))) keys.add(k);
  for (const k of addShortfalls(meals)) keys.add(k);
  saveShopping();
  return keys.size;
}

function saveShopping() {
  store.save("shopping", shopping);
  renderShopping();
}

// What the recipes need in total, e.g. "180 ml".
function needed(item) {
  return addQuantities(item.quantities); // also turns cups and fractions into metric
}

// Garlic is bought by the head (about 10 cloves).
const PER_PACK = { "clove>head": 10, "cloves>head": 10, "clove>heads": 10, "cloves>heads": 10 };
// Recipes that count containers ("2 cans") need that many packs, whatever the pack weighs.
const CONTAINERS = new Set(["can", "cans", "jar", "jars", "bottle", "bottles", "pack", "packs", "packet", "packets",
  "bunch", "bunches", "head", "heads"]);

// How much to buy: whole store packages that cover what's needed (180 ml of milk -> 1 l).
// When the amounts can't be compared, suggests what the recipes need, so nothing is under-bought.
function suggestedBuy(item) {
  const parts = item.quantities.flatMap(amountTerms).map(parseAmount);
  const need = addQuantities(item.quantities.flatMap(amountTerms));
  const pack = item.package ? parseAmount(item.package) : null;
  if (!pack || pack.n <= 0) return need || needed(item);
  if (!parts.length) return addQuantities([item.package]); // only "to taste": one pack
  const units = new Set(parts.map((x) => x.unit));
  if (units.size === 1) {
    const [unit] = units;
    const total = parts.reduce((sum, x) => sum + x.n, 0);
    let packs = 0;
    if (unit === pack.unit) packs = Math.ceil(total / pack.n - 1e-9);
    else if (PER_PACK[`${unit}>${pack.unit}`]) packs = Math.ceil(total / (PER_PACK[`${unit}>${pack.unit}`] * pack.n) - 1e-9);
    else if (CONTAINERS.has(unit)) packs = Math.ceil(total - 1e-9);
    if (packs) {
      const shown = item.package.trim().match(/^\S+\s*(.*)$/)[1]; // keep the store's unit word ("head")
      const amount = packs * (MEASURES.has(pack.unit) && pack.unit !== "g" && pack.unit !== "ml" ? parseFloat(item.package) : pack.n);
      return pack.unit === "g" || pack.unit === "ml"
        ? addQuantities([`${packs * pack.n} ${pack.unit}`])
        : `${Math.round(amount * 100) / 100}${shown ? " " + shown : ""}`;
    }
  }
  return need;
}

// The amount the user will buy: their own edit (even if they cleared it), or the suggestion.
function buyAmount(item) {
  return item.buyAmount != null ? normalizeAmount(item.buyAmount) : suggestedBuy(item);
}

// Number + unit box (same look as the pantry rows). Calls onChange("1.5 kg") as the user edits.
function amountBox(amount, name, onChange) {
  const start = splitAmount(amount, name);
  const number = el("input", {
    class: "pi-number", type: "text", inputmode: "decimal", value: start.n, placeholder: "–",
    maxlength: 8, autocomplete: "off", "aria-label": `How much ${name} to buy`,
  });
  const units = UNITS.includes(start.unit) ? UNITS : [...UNITS, start.unit];
  const unit = el("select", { class: "pi-unit", "aria-label": `Unit for ${name}` },
    ...units.map((u) => el("option", { value: u, text: UNIT_LABEL[u] ?? u })));
  unit.value = start.unit;
  const changed = () => {
    const n = number.value.trim().replace(/,(?!\d)/g, "");
    const valid = !n || /^\d+(?:[.,]\d+)?$/.test(n);
    if (valid) number.removeAttribute("aria-invalid"); else number.setAttribute("aria-invalid", "true");
    if (valid) onChange(n ? `${n}${unit.value ? " " + unit.value : ""}` : "");
  };
  number.addEventListener("input", changed);
  unit.addEventListener("change", changed);
  return el("span", { class: "pi-amount" }, number, unit);
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
      ...inCategory.map(([key, item]) => {
        const checkbox = el("input", { type: "checkbox", "data-key": key });
        checkbox.checked = item.done;
        checkbox.addEventListener("change", () => {
          item.done = checkbox.checked;
          saveShopping();
          // The list is drawn again; keep the keyboard on the same checkbox.
          $("list-content").querySelector(`input[data-key="${CSS.escape(key)}"]`)?.focus();
        });
        const remove = el("button", {
          class: "pi-btn pi-remove item-remove", type: "button", text: "✕", "aria-label": `Remove ${item.name}`,
          onclick: () => {
            const all = [...$("list-content").querySelectorAll(".item-remove")];
            const at = all.findIndex((b) => b.getAttribute("aria-label") === `Remove ${item.name}`);
            delete shopping[key];
            saveShopping();
            toast(`Removed ${item.name}`);
            const left = [...$("list-content").querySelectorAll(".item-remove")];
            (left[at] || left[at - 1] || $("tab-list")).focus();
          },
        });
        const forText = item.recipes.length > 3
          ? `For ${item.recipes.slice(0, 3).join(", ")} and ${item.recipes.length - 3} more`
          : `For ${item.recipes.join(", ")}`;
        const buy = amountBox(buyAmount(item), item.name, (value) => {
          item.buyAmount = value;
          store.save("shopping", shopping); // no redraw, so typing isn't interrupted
        });
        return el("li", { class: item.done ? "done" : "" },
          el("label", { class: "check" },
            checkbox,
            el("span", {},
              el("span", { class: "label", text: item.name }),
              el("span", { class: "for", text: `Recipes still need ${needed(item)}. ${forText}` }),
            ),
          ),
          el("span", { class: "buy-box" }, el("span", { class: "buy-label", text: "Buy" }), buy, remove),
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
        const unclear = addToPantry(done.map(([, v]) => ({ name: v.name, amount: buyAmount(v) })));
        for (const [key] of done) delete shopping[key];
        saveShopping();
        toast(`Moved ${plural(done.length, "item", "items")} to your pantry`
          + (unclear.length ? `. Check the amount of ${unclear.join(", ")} there, it couldn't be added up` : ""));
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
    const items = Object.values(shopping)
      .filter((v) => (CATEGORY_ORDER.includes(v.category) ? v.category : "Other") === category && !v.done);
    if (!items.length) continue;
    lines.push(category.toUpperCase());
    for (const v of items) lines.push(`[ ] ${v.name} - ${buyAmount(v)} (recipes need ${needed(v)})`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const link = el("a", { href: URL.createObjectURL(blob), download: "shopping-list.txt" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000); // give the download time to start
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
function buildSlots(start = settings.start, length = settings.length, cfg = settings) {
  const slots = [];
  for (let d = 0; d < length; d++) {
    const date = addDays(start, d);
    const wd = weekdayIndex(date);
    const weekend = wd >= 5;
    for (const meal of MEALS) {
      if (!cfg.meals[meal][wd]) continue;
      slots.push(slotFor(date, meal, cfg));
    }
  }
  return slots;
}

function slotFor(date, meal, cfg) {
  const wd = weekdayIndex(date);
  const weekend = wd >= 5;
  return {
    date, weekday: WEEKDAYS[wd], meal,
    max_minutes: weekend ? cfg.weekendMinutes : cfg.weekdayMinutes,
    relaxed: weekend && cfg.relaxed,
  };
}

// Asks Claude to plan these slots with the plan's settings.
function requestMeals(slots, extra = {}) {
  const cfg = planSettings();
  return post("/api/plan", {
    ...kitchen(cfg.people),
    slots,
    diet: cfg.diet === "other" ? cfg.dietOther : cfg.diet,
    requirements: cfg.requirements,
    leftovers: cfg.leftovers,
    repeats: cfg.repeats,
    avoid: plan.weeks.flatMap((w) => w.meals.map((m) => m.title)).slice(-150),
    ...extra,
  });
}

// Slots Claude didn't fill.
function unfilled(slots, meals) {
  const got = new Set(meals.map(mealKey));
  return slots.filter((x) => !got.has(mealKey(x)));
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
    settings: JSON.parse(JSON.stringify(settings)), // later edits to the form don't change this plan
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
    const current = plan;
    for (const [n, week] of plan.weeks.entries()) {
      if (week.done) continue;
      const days = Math.round((parseDate(week.end) - parseDate(week.start)) / 86400000) + 1;
      const slots = buildSlots(week.start, days, planSettings());
      if (slots.length) {
        showMessage("plan-message", `Planning week ${n + 1} of ${plan.weeks.length}...`);
        let { meals } = await requestMeals(slots);
        if (plan !== current) return; // the plan was deleted or replaced meanwhile
        // Claude sometimes leaves a meal out: ask once more for just those.
        let missing = unfilled(slots, meals);
        if (missing.length) {
          week.meals = meals;
          const again = await requestMeals(missing);
          if (plan !== current) return;
          meals = [...meals, ...again.meals.filter((m) => missing.some((x) => mealKey(x) === mealKey(m)))];
          missing = unfilled(slots, meals);
        }
        week.meals = meals;
        week.missing = missing;
      }
      week.done = true;
      savePlan();
      renderPlan();
    }
    const left = plan.weeks.reduce((sum, w) => sum + (w.missing?.length || 0), 0);
    showMessage("plan-message", "");
    toast(left ? `Your plan is ready, but ${plural(left, "meal", "meals")} couldn't be planned` : "Your meal plan is ready");
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

// How many different ingredients this week needs to buy.
function weekMissing(week) {
  return new Set(week.meals.flatMap((m) => m.ingredients.filter((i) => !i.have_it).map((i) => i.name.trim().toLowerCase()))).size;
}

// Plans the meals Claude left out of a week.
async function planMissing(week) {
  if (planning || !week.missing?.length) return;
  planning = true;
  const current = plan;
  renderPlan();
  try {
    const { meals } = await requestMeals(week.missing);
    if (plan !== current) return;
    const wanted = new Set(week.missing.map(mealKey));
    week.meals = [...week.meals, ...meals.filter((m) => wanted.has(mealKey(m)))];
    week.missing = unfilled(week.missing, meals);
    savePlan();
    toast(week.missing.length ? `${plural(week.missing.length, "meal", "meals")} still couldn't be planned` : "The missing meals are planned");
  } catch (err) {
    toast(err.message);
  } finally {
    planning = false;
    renderPlan();
  }
}

function addWeekToList(week, n) {
  const added = addMealsToList(week.meals);
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
              const added = addMealsToList(plan.weeks.flatMap((w) => w.meals));
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
            el("button", { class: "btn small", type: "button", text: "Add to shopping list", onclick: () => addWeekToList(week, n) }),
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

    const missingNote = week.missing?.length
      ? el("div", { class: "week-missing" },
          el("p", { text: `${plural(week.missing.length, "meal", "meals")} couldn't be planned this week.` }),
          el("button", {
            class: "btn small", type: "button", disabled: planning,
            text: `Plan the ${plural(week.missing.length, "missing meal", "missing meals")}`,
            onclick: () => planMissing(week),
          }))
      : null;

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
          wd >= 5 && planSettings().relaxed ? el("span", { class: "tag", text: "Relaxed" }) : null,
        ),
        meals.length
          ? el("div", { class: "day-meals", style: `--cols: ${types.length}` },
              ...meals.map((m) => { const card = mealCard(m); card.style.gridColumn = String(types.indexOf(m.meal) + 1); return card; }))
          : el("p", { class: "day-empty", text: "Nothing planned" }),
      ));
    }
    return el("section", { class: "week" }, weekHead, missingNote, ...days);
  });

  box.replaceChildren(head, ...weeks);
}

// A small "swap" icon (two arrows going round), drawn as SVG.
function swapIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M4 12a8 8 0 0 1 13.66-5.66L20 8.5", "M20 3.5v5h-5", "M20 12a8 8 0 0 1-13.66 5.66L4 15.5", "M4 20.5v-5h5"]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

// One meal in the plan: the card opens the recipe; the corner shows "Cooked",
// or a button that swaps the meal for another suggestion straight away.
function mealCard(meal) {
  const toBuy = meal.ingredients.filter((i) => !i.have_it).length;
  const key = mealKey(meal);
  const cooked = planRecipes[key]?.cooked;
  const busy = swapping.has(key);
  const card = el("button", {
    type: "button",
    class: "meal-card",
    "aria-label": `${meal.meal} on ${longDate(meal.date)}: ${meal.title}${cooked ? ", cooked" : ""}. Open recipe`,
    onclick: () => openMeal(meal),
  },
    el("span", { class: "which", text: meal.meal }),
    el("span", { class: "title", text: busy ? "Finding another meal..." : meal.title }),
    el("span", { class: "facts" },
      `${meal.total_time_minutes} min`,
      toBuy ? ", " : ", nothing to buy",
      toBuy ? el("span", { class: "tobuy", text: `${toBuy} to buy` }) : null,
    ),
  );

  const slot = el("div", { class: "meal-slot" + (cooked ? " is-cooked" : "") + (busy ? " is-swapping" : ""), "data-key": key }, card);
  if (cooked) {
    slot.append(el("span", { class: "corner cooked-mark", "aria-hidden": "true", text: "✓ Cooked" }));
  } else {
    const swap = el("button", {
      type: "button",
      class: "corner swap-btn",
      title: "Swap for another meal",
      "aria-label": busy ? `Finding another ${meal.meal.toLowerCase()}` : `Swap ${meal.title} for another ${meal.meal.toLowerCase()}`,
      disabled: planning || busy,
    }, swapIcon());
    swap.addEventListener("click", async () => {
      try {
        await replaceMeal(meal, "");
      } catch (err) {
        toast(err.message);
      }
      // The plan was drawn again: put the keyboard back on this meal.
      const again = document.querySelector(`.meal-slot[data-key="${CSS.escape(key)}"]`);
      (again?.querySelector(".swap-btn:not(:disabled)") || again?.querySelector(".meal-card"))?.focus();
    });
    slot.append(swap);
  }
  return slot;
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
  $("swap-toggle").hidden = !findMeal(meal) || Boolean(planRecipes[key]?.cooked);
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
    const recipe = await post("/api/plan/recipe", { ...kitchen(planSettings().people), meal });
    // The meal may have been swapped (or the plan replaced) while the recipe was being written.
    const spot = findMeal(meal);
    if (!spot || spot.week.meals[spot.index] !== meal) return;
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

// Marks a plan meal as cooked (its full recipe is stored in planRecipes), with what to undo.
function setCooked(key, done, changes = []) {
  if (!planRecipes[key]) return;
  planRecipes[key].cooked = done;
  planRecipes[key].cookedChanges = changes;
  store.save("planRecipes", planRecipes);
  const dialog = $("meal-dialog");
  if (dialog.open && dialog.dataset.key === key) {
    $("swap-toggle").hidden = done; // a cooked meal isn't swapped
    if (done) $("swap-panel").hidden = true;
  }
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

// Asks Claude for a different dish for one slot of the plan and puts it in the plan.
// With "cook once, eat twice", swapping a dinner also re-plans the next day's leftovers lunch.
// Throws an Error with a message for the user if it can't.
async function replaceMeal(meal, reason) {
  const key = mealKey(meal);
  if (!findMeal(meal)) throw new Error("This meal is no longer in your plan.");
  if (planning) throw new Error("Wait until the plan is finished, then try again.");
  if (swapping.has(key)) throw new Error("Already finding another meal for this one.");
  const cfg = planSettings();
  const lunch = cfg.leftovers && meal.meal === "Dinner"
    ? plan.weeks.flatMap((w) => w.meals).find((m) => m.date === addDays(meal.date, 1) && m.meal === "Lunch"
        && !planRecipes[mealKey(m)]?.cooked)
    : null;
  const olds = lunch ? [meal, lunch] : [meal];
  const current = plan;
  olds.forEach((m) => swapping.add(mealKey(m)));
  renderPlan();
  try {
    const { meals } = await requestMeals(olds.map((m) => slotFor(m.date, m.meal, cfg)), {
      leftovers: Boolean(lunch),
      replace: olds.map((m) => m.title).join('" and "'),
      replace_reason: reason,
    });
    // The plan may have changed while waiting: deleted, replaced, or this meal swapped or cooked.
    const spots = olds.map(findMeal);
    if (plan !== current || spots.some((spot, i) => !spot || spot.week.meals[spot.index] !== olds[i])) {
      throw new Error("Your plan changed while finding a new meal, so nothing was swapped.");
    }
    const fresh = olds.map((m) => meals.find((x) => mealKey(x) === mealKey(m)));
    if (!fresh[0]) throw new Error("No new meal came back. Please try again.");
    olds.forEach((old, i) => {
      if (!fresh[i]) return;
      spots[i].week.meals[spots[i].index] = fresh[i];
      delete planRecipes[mealKey(old)];
      removeFromList(old);
    });
    store.save("planRecipes", planRecipes);
    saveShopping();
    savePlan();
    toast(fresh[1] ? `Swapped for ${fresh[0].title}, and the next day's lunch too` : `Swapped for ${fresh[0].title}`);
    return fresh[0];
  } finally {
    olds.forEach((m) => swapping.delete(mealKey(m)));
    if (plan) renderPlan();
  }
}

// The swap form inside the meal dialog.
async function swapMeal(meal, reason) {
  const button = $("swap-submit");
  const message = $("swap-message");
  button.disabled = true;
  message.classList.remove("error");
  message.textContent = "Finding something else...";
  try {
    const fresh = await replaceMeal(meal, reason);
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
