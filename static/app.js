// Cooking Helper: everything the page does in the browser.
// The pantry and the shopping list are saved in this browser (localStorage),
// so they are still there next time you open the app.

const CATEGORY_ORDER = [
  "Produce", "Meat & Fish", "Dairy & Eggs", "Bakery", "Pantry",
  "Spices & Sauces", "Frozen", "Drinks", "Other",
];

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
    localStorage.setItem("cooking-helper:" + key, JSON.stringify(value));
  },
};

// shopping: { key: { name, quantities: [], category, recipes: [], done } }
let shopping = store.load("shopping", {});

// ---------- Small helpers ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children) {
    if (child != null) node.append(child);
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

// ---------- Pantry ----------
function parsePantry(text) {
  return text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

function pantry() {
  return parsePantry($("pantry-input").value);
}

function updatePantryCount() {
  $("pantry-count").textContent = `${plural(pantry().length, "ingredient", "ingredients")} in your pantry`;
  store.save("pantry", $("pantry-input").value);
  store.save("basics", $("basics").checked);
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
    throw new Error("Couldn't reach the Cooking Helper server. Check that it's still running.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Something went wrong. Please try again.");
  }
  return data;
}

// Shows a busy label on the button while waiting for Claude.
async function withBusyButton(form, messageEl, work) {
  const button = form.querySelector("button[type=submit]");
  const label = button.textContent;
  button.disabled = true;
  button.textContent = button.dataset.busyLabel;
  messageEl.textContent = "";
  messageEl.classList.remove("error");
  try {
    await work();
  } catch (err) {
    messageEl.textContent = err.message;
    messageEl.classList.add("error");
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// ---------- Recipe card ----------
function recipeCard(recipe) {
  const missing = recipe.ingredients.filter((i) => !i.have_it);

  const ingredients = el("ul", { class: "ings" },
    ...recipe.ingredients.map((ing) =>
      el("li", { class: ing.have_it ? "have" : "buy" },
        el("span", { class: "qty", text: ing.quantity }),
        el("span", { class: "name", text: ing.name }),
      )
    ),
  );

  const steps = el("ol", { class: "steps" },
    ...recipe.steps.map((step) => el("li", {}, el("span", { text: step }))),
  );

  const legend = el("p", { class: "legend" },
    "✓ you have it   ", el("span", { class: "swatch", text: "highlighted" }), " to buy");

  let action;
  if (missing.length) {
    action = el("div", { class: "recipe-actions" },
      el("button", {
        class: "btn primary",
        type: "button",
        text: `Add ${plural(missing.length, "missing ingredient", "missing ingredients")} to shopping list`,
        onclick: () => {
          const added = addToShoppingList(recipe);
          toast(added ? `Added ${plural(added, "item", "items")} to your shopping list` : "Already on your shopping list");
        },
      }),
    );
  } else {
    action = el("p", { class: "all-set", text: "You have everything you need." });
  }

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
function addToShoppingList(recipe) {
  let added = 0;
  for (const ing of recipe.ingredients) {
    if (ing.have_it) continue;
    const key = ing.name.trim().toLowerCase();
    const item = (shopping[key] ??= {
      name: ing.name, quantities: [], category: ing.category, recipes: [], done: false,
    });
    if (item.recipes.includes(recipe.title)) continue; // already added from this recipe
    item.quantities.push(ing.quantity);
    item.recipes.push(recipe.title);
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
      text: "Your shopping list is empty. Create a recipe, then add its missing ingredients here with one click.",
    }));
    return;
  }

  box.append(el("p", { class: "count", text: `${left} of ${plural(items.length, "item", "items")} left to buy` }));

  for (const category of CATEGORY_ORDER) {
    const inCategory = items
      .filter(([, v]) => v.category === category)
      .sort(([a], [b]) => a.localeCompare(b));
    if (!inCategory.length) continue;

    box.append(el("h3", { class: "section-name", text: category }));
    box.append(el("ul", { class: "items" },
      ...inCategory.map(([key, item]) => {
        const checkbox = el("input", { type: "checkbox" });
        checkbox.checked = item.done;
        checkbox.addEventListener("change", () => {
          item.done = checkbox.checked;
          saveShopping();
        });
        return el("li", { class: item.done ? "done" : "" },
          el("label", { class: "check" },
            checkbox,
            el("span", {},
              el("span", { class: "label", text: `${item.name}, ${item.quantities.join(" + ")}` }),
              el("span", { class: "for", text: "For " + item.recipes.join(", ") }),
            ),
          ),
        );
      }),
    ));
  }

  box.append(el("div", { class: "list-actions" },
    el("button", {
      class: "btn", type: "button", text: "Remove checked items",
      onclick: () => {
        const before = Object.keys(shopping).length;
        shopping = Object.fromEntries(Object.entries(shopping).filter(([, v]) => !v.done));
        const removed = before - Object.keys(shopping).length;
        saveShopping();
        toast(removed ? `Removed ${plural(removed, "item", "items")}` : "Nothing is checked yet");
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
    el("button", { class: "btn primary", type: "button", text: "Download list", onclick: downloadList }),
  ));
}

function downloadList() {
  const lines = [];
  for (const category of CATEGORY_ORDER) {
    const items = Object.values(shopping).filter((v) => v.category === category && !v.done);
    if (!items.length) continue;
    lines.push(category.toUpperCase());
    for (const v of items) lines.push(`[ ] ${v.name} - ${v.quantities.join(" + ")}`);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const link = el("a", { href: URL.createObjectURL(blob), download: "shopping-list.txt" });
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---------- Tabs ----------
function setupTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    }
    tab.focus();
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) select(tabs[(i + step + tabs.length) % tabs.length]);
    });
  });
}

// ---------- Forms ----------
function setupForms() {
  const createForm = $("create-form");
  createForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = $("create-message");
    const request = $("request").value.trim();
    if (!request) {
      message.textContent = "Type what you'd like to cook, then press Create recipe.";
      message.classList.add("error");
      $("request").focus();
      return;
    }
    withBusyButton(createForm, message, async () => {
      const recipe = await post("/api/recipe", {
        request,
        servings: Number($("servings").value) || 2,
        diet: $("diet").value.trim(),
        pantry: pantry(),
        has_basics: $("basics").checked,
      });
      $("create-result").replaceChildren(recipeCard(recipe));
    });
  });

  const suggestForm = $("suggest-form");
  suggestForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const message = $("suggest-message");
    if (!pantry().length) {
      message.textContent = "Add some ingredients to My pantry first.";
      message.classList.add("error");
      $("pantry-input").focus();
      return;
    }
    withBusyButton(suggestForm, message, async () => {
      const { recipes } = await post("/api/suggest", {
        pantry: pantry(),
        has_basics: $("basics").checked,
        notes: $("notes").value.trim(),
      });
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
  $("pantry-input").value = store.load("pantry", "");
  $("basics").checked = store.load("basics", true);
  $("pantry-input").addEventListener("input", updatePantryCount);
  $("basics").addEventListener("change", updatePantryCount);
  updatePantryCount();

  setupTabs();
  setupForms();
  renderShopping();

  try {
    const status = await fetch("/api/status").then((r) => r.json());
    $("key-alert").hidden = status.has_key;
  } catch {
    /* the forms will show a clear error if the server is down */
  }
}

start();
