// Mise: everything the page does in the browser.
// Pantry, plan settings, the meal plan and the shopping list are saved in this
// browser (localStorage), so they are still there next time you open the app.
// When someone signs in, the same data is also saved in their account (Supabase),
// along with their favorite recipes, so it follows them to any device.

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
    queueCloudSave(key, value);
  },
  remove(key) {
    localStorage.removeItem("cooking-helper:" + key);
  },
};

// ---------- Account (Supabase): the saved data follows the user ----------
// The page always opens with this browser's copy, so it's quick. Then, for a signed-in user,
// it fetches the account's copy, and each change is sent to the account a moment later.
const SUPABASE_JS = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js";
const SYNCED = ["pantry", "basics", "shopping", "settings", "plan", "planRecipes"];
const cloud = { client: null, user: null, timers: {}, pending: {}, signingOut: false, checked: false };

// Keys changed here that the account doesn't have yet. They survive a reload, so a change
// made just before closing the page isn't overwritten by the account's older copy.
const unsent = {
  get: () => new Set(store.load("unsynced", [])),
  set(keys) { localStorage.setItem("cooking-helper:unsynced", JSON.stringify([...keys])); },
  add(key) { const k = this.get(); k.add(key); this.set(k); },
  remove(key) { const k = this.get(); k.delete(key); this.set(k); },
};

// When each key was last saved in the account, as this browser last saw it. If the account's
// time is different, another device changed it; otherwise this browser's copy is the newer one.
const syncedAt = {
  all: () => store.load("syncedAt", {}) || {},
  set(key, time) {
    const all = this.all();
    all[key] = time;
    localStorage.setItem("cooking-helper:syncedAt", JSON.stringify(all));
  },
};

function queueCloudSave(key, value) {
  if (!cloud.user || !SYNCED.includes(key)) return;
  unsent.add(key);
  cloud.pending[key] = value;
  clearTimeout(cloud.timers[key]);
  cloud.timers[key] = setTimeout(() => pushKey(key), 800);
}

async function pushKey(key) {
  if (!(key in cloud.pending) || !cloud.user) return;
  const value = cloud.pending[key];
  delete cloud.pending[key];
  let error, data;
  try {
    ({ data, error } = await cloud.client.from("user_data").upsert({
      user_id: cloud.user.id, key, value: { v: value ?? null }, updated_at: new Date().toISOString(),
    }).select("updated_at").single());
  } catch (err) {
    error = err;
  }
  // If it fails, the change stays in this browser and is sent next time the page opens.
  if (error) return toast("Couldn't save to your account. Your changes are kept in this browser for now.");
  syncedAt.set(key, data.updated_at);
  if (!(key in cloud.pending)) unsent.remove(key);
}

function flushCloud() {
  return Promise.all(Object.keys(cloud.pending).map((key) => {
    clearTimeout(cloud.timers[key]);
    return pushKey(key);
  }));
}

// The same JSON, whatever the order of the keys (the database sorts them).
function sameJSON(a, b) {
  const canon = (x) => Array.isArray(x) ? x.map(canon)
    : isObject(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, canon(x[k])])) : x;
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

// Brings the account's data into this browser. The first time an account is used here, an
// empty account takes what this browser already has, and otherwise the account's copy is used.
// After that, the account's copy only replaces this browser's when another device changed it;
// if this browser has something newer (like the plan's start date moved to today), it's sent up.
// Returns true if anything here changed.
async function pullAll() {
  const { data, error } = await cloud.client.from("user_data").select("key, value, updated_at");
  if (error) throw error;
  const rows = Object.fromEntries(data.map((r) => [r.key, r]));
  const known = store.load("owner", null) === cloud.user.id;
  const pendingHere = known ? unsent.get() : new Set();
  const seen = known ? syncedAt.all() : {};
  const has = (key) => localStorage.getItem("cooking-helper:" + key) !== null;
  let changed = false;

  if (!known) {
    unsent.set([]);
    localStorage.removeItem("cooking-helper:syncedAt");
  }
  for (const key of SYNCED) {
    const row = rows[key];
    const here = store.load(key, null);
    if (!known && !data.length) {
      if (has(key)) queueCloudSave(key, here);
    } else if (pendingHere.has(key)) {
      queueCloudSave(key, here);
    } else if (row) {
      const same = has(key) && sameJSON(here, row.value?.v);
      if (known && seen[key] === row.updated_at) {
        if (!same && has(key)) queueCloudSave(key, here); // only this browser changed it
      } else {
        if (!same) {
          localStorage.setItem("cooking-helper:" + key, JSON.stringify(row.value?.v));
          changed = true;
        }
        syncedAt.set(key, row.updated_at);
      }
    } else if (!known && has(key)) {
      store.remove(key);
      changed = true;
    }
  }
  localStorage.setItem("cooking-helper:owner", JSON.stringify(cloud.user.id));
  await flushCloud();
  return changed;
}

function clearLocalData() {
  for (const key of [...SYNCED, "owner", "unsynced", "syncedAt"]) store.remove(key);
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = el("script", { src });
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

// Asks before something that can't be undone easily. Resolves to true if the person agrees.
// Cancel, Escape and a click outside all mean no.
function askConfirm({ title, text, ok = "OK", danger = false }) {
  const dialog = $("confirm-dialog");
  $("confirm-title").textContent = title;
  $("confirm-text").textContent = text;
  const okButton = $("confirm-ok");
  okButton.textContent = ok;
  okButton.className = danger ? "btn danger-solid" : "btn primary";
  dialog.returnValue = "";
  dialog.showModal();
  $("confirm-cancel").focus(); // the safe choice is the default
  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "ok"), { once: true });
  });
}

// Closes a dialog when you click the dark area around it. A click that starts inside
// (like selecting text in a field and letting go outside) doesn't count.
function closeOnOutsideClick(dialog) {
  let startedOutside = false;
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  dialog.addEventListener("pointerdown", (e) => { startedOutside = e.target === dialog && outside(e); });
  dialog.addEventListener("click", (e) => {
    if (startedOutside && e.target === dialog && outside(e)) dialog.close();
    startedOutside = false;
  });
}

// Reloads the page by itself (not when the user signs in or out), at most once every 15 seconds,
// so nothing can keep reloading it.
function autoReload() {
  const last = Number(sessionStorage.getItem("mise:auto-reload")) || 0;
  if (Date.now() - last < 15000) return false;
  sessionStorage.setItem("mise:auto-reload", String(Date.now()));
  location.reload();
  return true;
}

// Runs after the page is drawn, so the account never slows down opening the app.
async function cloudStart(config) {
  if (!config) return;
  // An email link (confirm account, reset password) comes back with details after "#".
  const link = new URLSearchParams(location.hash.slice(1));
  if (link.get("type") === "recovery") sessionStorage.setItem("mise:recovery", "1");
  await loadScript(SUPABASE_JS);
  cloud.client = window.supabase.createClient(config.url, config.key);
  const { data } = await cloud.client.auth.getSession();
  cloud.user = data.session?.user || null;
  if (link.get("error_description") || link.get("error")) {
    history.replaceState(null, "", location.pathname);
    const expired = /expired|invalid/i.test(link.get("error_description") || link.get("error_code") || "");
    setTimeout(() => openAccount(expired
      ? "That email link has expired or was already used. Ask for a new one."
      : "That email link didn't work. Please try again.", true, expired ? "forgot" : "signin"), 0);
  } else if (link.get("type") === "signup" && cloud.user) {
    toast("Your email is confirmed. Welcome to Mise!");
  }
  if (!cloud.user && store.load("owner", null)) {
    clearLocalData(); // the session ended: don't keep showing the last user's data
    if (autoReload()) return;
  }
  renderAccount();
  renderFavorites();
  cloud.client.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT" && cloud.user && !cloud.signingOut) {
      clearLocalData();
      autoReload();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushCloud();
  });
  if (!cloud.user) return;
  if (sessionStorage.getItem("mise:welcome")) {
    sessionStorage.removeItem("mise:welcome");
    toast(`Signed in as ${cloud.user.email}`);
  }
  if (sessionStorage.getItem("mise:recovery")) openAccount();
  await loadFavorites();
  try {
    // Another device changed something: show the account's copy.
    if (await pullAll() && autoReload()) return;
    await loadTastes();
  } catch {
    toast("Couldn't reach your account. Showing what's saved in this browser.");
  }
}

function renderAccount() {
  $("account").hidden = !cloud.client;
  $("account-email").textContent = cloud.user?.email || "";
  $("account-button").textContent = cloud.user ? "Account" : "Sign in";
  document.querySelectorAll("#account-dialog .who").forEach((n) => { n.textContent = cloud.user?.email || ""; });
}

// The account dialog has four views: signin, forgot, newpass and manage (signed in).
function showAccountView(view) {
  const dialog = $("account-dialog");
  for (const part of dialog.querySelectorAll("[data-view]")) part.hidden = part.dataset.view !== view;
  const current = dialog.querySelector(`[data-view="${view}"]`);
  $("account-title").textContent = current.dataset.title;
  for (const m of current.querySelectorAll(".message")) { m.textContent = ""; m.classList.remove("error"); }
  current.querySelector("input:not([type=hidden])")?.focus();
  return current;
}

// Opens the dialog on the view that fits: a new password during a reset, the panel when signed in.
function openAccount(note = "", isError = false, view = null) {
  view ||= !cloud.user ? "signin" : sessionStorage.getItem("mise:recovery") ? "newpass" : "manage";
  const dialog = $("account-dialog");
  if (!dialog.open) dialog.showModal();
  const current = showAccountView(view);
  if (note) say(current.querySelector(".message"), note, isError);
}

function say(node, text, isError = false) {
  node.replaceChildren(...(isError ? [text] : dotted(text)));
  node.classList.toggle("error", isError);
}

function authMessage(error) {
  const text = error?.message || "";
  if (/invalid login credentials/i.test(text)) return "Wrong email or password.";
  if (/email not confirmed/i.test(text)) return "Confirm your email first: open the link we sent you, then sign in.";
  if (/already registered/i.test(text)) return "That email already has an account. Sign in instead.";
  if (/rate limit|too many|security purposes/i.test(text)) return "Too many tries. Wait a few minutes and try again.";
  if (/different from the old/i.test(text)) return "The new password has to be different from the old one.";
  if (/weak|at least/i.test(text)) return "That password is too weak. Use at least 6 characters, mixing letters and numbers.";
  if (/reauthenticat/i.test(text)) return "For safety, sign out and sign in again, then change your password.";
  if (/fetch|network/i.test(text)) return "Couldn't reach the server. Check your internet connection.";
  return text || "Something went wrong. Please try again.";
}

// Runs a form's work with its buttons turned off, showing errors in its message line.
async function accountTask(form, message, work) {
  const buttons = [...form.querySelectorAll("button")];
  buttons.forEach((b) => { b.disabled = true; });
  say(message, "");
  try {
    await work();
  } catch (err) {
    say(message, authMessage(err), true);
  } finally {
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function newPassword(a, b) {
  if ($(a).value !== $(b).value) throw new Error("The two new passwords don't match.");
  if ($(a).value.length < 6) throw new Error("Use at least 6 characters.");
  return $(a).value;
}

async function signOutEverywhere() {
  cloud.signingOut = true;
  await flushCloud();
  await cloud.client.auth.signOut().catch(() => {});
  sessionStorage.removeItem("mise:recovery");
  clearLocalData();
  location.reload();
}

function setupAccount() {
  closeOnOutsideClick($("confirm-dialog"));
  const dialog = $("account-dialog");
  $("account-close").addEventListener("click", () => dialog.close());
  closeOnOutsideClick(dialog);
  $("account-button").addEventListener("click", () => { if (cloud.client) openAccount(); });

  // The eye next to a password field: open while hidden (press to show), crossed out while shown.
  for (const button of dialog.querySelectorAll(".pw-show")) {
    const draw = (shown) => {
      const label = shown ? "Hide password" : "Show password";
      button.replaceChildren(eyeIcon(shown));
      button.setAttribute("aria-label", label);
      button.title = label;
    };
    draw(false);
    button.addEventListener("click", () => {
      const input = $(button.getAttribute("aria-controls"));
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      draw(show);
    });
  }
  for (const link of dialog.querySelectorAll("[data-goto]")) {
    link.addEventListener("click", () => showAccountView(link.dataset.goto));
  }
  $("forgot-link").addEventListener("click", () => {
    const email = $("account-email-input").value.trim();
    showAccountView("forgot");
    if (email) $("forgot-email").value = email;
  });

  // Sign in or create an account
  $("signin-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const signUp = e.submitter?.value === "up";
    const email = $("account-email-input").value.trim();
    const password = $("account-password").value;
    const message = $("account-message");
    accountTask(form, message, async () => {
      say(message, signUp ? "Creating your account..." : "Signing in...");
      const { data, error } = signUp
        ? await cloud.client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
        : await cloud.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (signUp && !data.session) {
        // The project asks new users to confirm their email (or the address is taken; Supabase doesn't say).
        say(message, data.user?.identities?.length === 0
          ? "That email already has an account. Sign in instead."
          : "Check your email and open the link to confirm your account. Then sign in here.");
        return;
      }
      cloud.user = data.user;
      say(message, "Signed in. Loading your saved data...");
      await pullAll();
      sessionStorage.setItem("mise:welcome", "1");
      location.reload();
    });
  });

  // Forgot password: Supabase emails a link back to this page.
  $("forgot-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const message = $("forgot-message");
    accountTask(e.currentTarget, message, async () => {
      const { error } = await cloud.client.auth.resetPasswordForEmail($("forgot-email").value.trim(), {
        redirectTo: location.origin,
      });
      if (error) throw error;
      // Same answer whether or not the account exists, so nobody can check who has one.
      say(message, "If there's an account for that email, a link to reset the password is on its way. Check your inbox and spam folder.");
    });
  });

  // New password, after opening the reset link
  $("newpass-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    accountTask(form, $("newpass-message"), async () => {
      const password = newPassword("newpass-1", "newpass-2");
      const { error } = await cloud.client.auth.updateUser({ password });
      if (error) throw error;
      sessionStorage.removeItem("mise:recovery");
      form.reset();
      dialog.close();
      toast("Your new password is saved");
    });
  });

  // Change password: check the current one first, so nobody at an open computer can change it.
  $("changepass-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const message = $("change-message");
    accountTask(form, message, async () => {
      const password = newPassword("change-1", "change-2");
      const check = await cloud.client.auth.signInWithPassword({ email: cloud.user.email, password: $("current-password").value });
      if (check.error) throw new Error(/invalid login/i.test(check.error.message) ? "Your current password isn't right." : check.error.message);
      const { error } = await cloud.client.auth.updateUser({ password });
      if (error) throw error;
      form.reset();
      say(message, "Password changed.");
    });
  });

  $("sign-out").addEventListener("click", () => {
    $("sign-out").disabled = true;
    signOutEverywhere();
  });

  // Delete account: a database function removes the user; their rows go with them.
  $("delete-account").addEventListener("click", async () => {
    const message = $("delete-message");
    if (!(await askConfirm({
      title: "Delete your account?",
      text: `This deletes ${cloud.user.email} and everything saved in it: pantry, plans, shopping list and favorites. It can't be undone.`,
      ok: "Delete account", danger: true,
    }))) return;
    $("delete-account").disabled = true;
    say(message, "Deleting...");
    const { error } = await cloud.client.rpc("delete_my_account");
    if (error) {
      $("delete-account").disabled = false;
      say(message, /could not find|does not exist|PGRST202/i.test(`${error.message} ${error.code}`)
        ? "Deleting accounts isn't set up on this server yet."
        : authMessage(error), true);
      return;
    }
    cloud.user = null; // nothing left to save
    toast("Your account was deleted");
    await signOutEverywhere();
  });
}

// ---------- Favorite recipes (saved in the account) ----------
let favorites = []; // [{ id, title, recipe, created_at }], newest first

async function loadFavorites() {
  const { data, error } = await cloud.client.from("favorites")
    .select("id, title, recipe, created_at").order("created_at", { ascending: false });
  if (error) return toast("Couldn't load your favorite recipes.");
  favorites = data;
  renderFavorites();
  document.querySelectorAll(".fav-btn").forEach((b) => b.update?.());
}

const favoriteFor = (title) => favorites.find((f) => f.title === title);

// Only the recipe itself, not whether it was cooked in a plan.
function plainRecipe(recipe) {
  const { title, description, total_time_minutes, servings, ingredients, steps } = recipe;
  return { title, description, total_time_minutes, servings, ingredients, steps };
}

function favoriteButton(recipe) {
  const button = el("button", { class: "btn fav-btn", type: "button" });
  button.update = () => {
    const on = Boolean(favoriteFor(recipe.title));
    button.textContent = on ? "♥ Saved" : "♡ Save to favorites";
    button.setAttribute("aria-pressed", String(on));
  };
  button.update();
  button.addEventListener("click", async () => {
    if (!cloud.client) return toast("Favorites need an account, and accounts aren't set up on this server.");
    if (!cloud.user) return openAccount("Sign in to save your favorite recipes.");
    button.disabled = true;
    const saved = favoriteFor(recipe.title);
    let result;
    try {
      result = saved
        ? await cloud.client.from("favorites").delete().eq("id", saved.id)
        : await cloud.client.from("favorites")
            .upsert({ title: recipe.title, recipe: plainRecipe(recipe) }, { onConflict: "user_id,title" })
            .select("id, title, recipe, created_at").single();
    } catch (err) {
      result = { error: err };
    }
    button.disabled = false;
    if (result.error) return toast("Couldn't update your favorites. Please try again.");
    favorites = saved ? favorites.filter((f) => f !== saved) : [result.data, ...favorites];
    toast(saved ? "Removed from favorites" : "Saved to favorites");
    document.querySelectorAll(".fav-btn").forEach((b) => b.update?.());
    renderFavorites();
    if (button.isConnected) button.focus();
  });
  return button;
}

function renderFavorites() {
  const box = $("favorites-content");
  if (!cloud.client) {
    // Still checking whether accounts are set up: show nothing yet.
    box.replaceChildren(cloud.checked ? el("p", { class: "intro",
      text: "Favorites are saved in your account, and accounts aren't set up on this server." }) : "");
    return;
  }
  if (!cloud.user) {
    box.replaceChildren(
      el("p", { class: "intro", text: "Sign in to save recipes you love and find them here on any device." }),
      el("button", { class: "btn primary", type: "button", text: "Sign in", onclick: () => openAccount() }),
    );
    return;
  }
  if (!favorites.length) {
    box.replaceChildren(el("p", { class: "intro", text: "No favorites yet. Open any recipe and press ♡ Save to favorites." }));
    return;
  }
  // Keep open the ones that were open (e.g. after removing another favorite).
  const open = new Set([...box.querySelectorAll("details[open]")].map((d) => d.dataset.id));
  box.replaceChildren(
    el("p", { class: "intro", text: plural(favorites.length, "saved recipe", "saved recipes") + "." }),
    ...favorites.map((f) => {
      const details = el("details", { class: "suggestion" },
        el("summary", {},
          el("span", { text: f.title }),
          el("span", { class: "tobuy" }),
        ),
        recipeCard(f.recipe, `fav|${f.id}`),
      );
      details.dataset.id = f.id;
      details.open = open.has(f.id);
      details.querySelector("article.recipe").refresh(); // fills in "N to buy"
      return details;
    }),
  );
}

function defaultSettings() {
  const allDays = () => [true, true, true, true, true, true, true];
  return {
    servings: 2, // how many people eat
    restrictions: [], // apply to every meal
    restrictionNotes: "",
    likes: [], // titles of dishes they liked
    dislikes: [], // and didn't
    dislikeNotes: {}, // why they didn't, by title (optional)
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
  // Settings saved before there was one household had a card per person: combine them.
  if (Array.isArray(saved.people) && saved.people.length && saved.servings === undefined) {
    const people = saved.people.filter(isObject);
    out.servings = people.length;
    out.restrictions = [...new Set(people.flatMap((x) => (Array.isArray(x.restrictions) ? x.restrictions : [])))];
    out.restrictionNotes = people
      .filter((x) => typeof x.notes === "string" && x.notes.trim())
      .map((x) => (typeof x.name === "string" && x.name.trim() ? `${x.name.trim()}: ${x.notes.trim()}` : x.notes.trim()))
      .join("; ");
  }
  delete out.people;
  out.servings = Math.min(20, Math.max(1, Math.round(Number(out.servings)) || d.servings));
  out.restrictions = Array.isArray(out.restrictions) ? out.restrictions.filter((r) => typeof r === "string").slice(0, 30) : [];
  out.restrictionNotes = typeof out.restrictionNotes === "string" ? out.restrictionNotes.slice(0, 300) : "";
  for (const k of ["likes", "dislikes"]) {
    out[k] = Array.isArray(out[k]) ? [...new Set(out[k].filter((t) => typeof t === "string" && t.trim()).map((t) => t.slice(0, 200)))].slice(-50) : [];
  }
  const notes = isObject(out.dislikeNotes) ? out.dislikeNotes : {};
  out.dislikeNotes = Object.fromEntries(out.dislikes
    .filter((t) => typeof notes[t] === "string" && notes[t].trim())
    .map((t) => [t, notes[t].trim().slice(0, 120)]));
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

// A short message at the bottom. With an action ({ label, run }) it gets a button, such as
// "Undo", and stays longer; it doesn't go away while the mouse or keyboard is on it.
let toastTimer;
function toast(message, action = null) {
  const box = $("toast");
  // An open dialog covers the page, so show the message inside it.
  const host = document.querySelector("dialog[open]") || document.body;
  if (box.parentElement !== host) host.append(box);
  const text = el("span", { class: "toast-text", text: message });
  if (action) {
    const button = el("button", { type: "button", class: "toast-action", text: action.label });
    button.addEventListener("click", () => {
      hideToast();
      action.run();
    });
    box.replaceChildren(text, button);
  } else {
    box.replaceChildren(text);
  }
  box.classList.toggle("has-action", Boolean(action));
  box.classList.add("show");
  box.wait = action ? 8000 : 2800;
  restartToastTimer();
}
function restartToastTimer() {
  const box = $("toast");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, box.wait || 2800);
}
function hideToast() {
  const box = $("toast");
  clearTimeout(toastTimer);
  // Keep the keyboard on the page if it was on the toast's button.
  if (box.contains(document.activeElement)) document.activeElement.blur();
  box.classList.remove("show", "has-action");
}
function setupToast() {
  const box = $("toast");
  const hold = () => clearTimeout(toastTimer);
  const resume = () => { if (box.classList.contains("show")) restartToastTimer(); };
  box.addEventListener("mouseenter", hold);
  box.addEventListener("mouseleave", resume);
  box.addEventListener("focusin", hold);
  box.addEventListener("focusout", resume);
}

function showMessage(id, text, isError = false) {
  const box = $(id);
  box.replaceChildren(...(isError ? [text] : dotted(text)));
  box.classList.toggle("error", isError);
}

// "Thinking..." -> "Thinking" followed by three dots that move while you wait.
function dotted(text) {
  if (!text.endsWith("...")) return [text];
  const dots = el("span", { class: "dots", "aria-hidden": "true" }, el("i"), el("i"), el("i"));
  return [text.slice(0, -3), dots];
}

// An eye (open, or crossed out) for the buttons that show or hide a password.
function eyeIcon(crossed) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const shapes = [
    ["path", { d: "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ];
  if (crossed) shapes.push(["path", { d: "M4 4l16 16" }]);
  for (const [tag, attrs] of shapes) {
    const shape = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v);
    svg.append(shape);
  }
  return svg;
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
  $("pantry-count").replaceChildren(plural(pantry().length, "ingredient", "ingredients"),
    el("span", { class: "count-extra", text: " in your pantry" }));
  store.save("pantry", $("pantry-input").value);
  store.save("basics", $("basics").checked);
  updatePantryTip();
  refreshRecipes();
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

// The pantry is a plain list until the user presses Edit.
let pantryEditing = false;
// What's being typed in "Add what you have": the list narrows to it, so you see at once
// whether you already have something. No extra field or button.
let pantryQuery = "";

// Does a pantry item match what's typed? Every typed word appears in its name ("tomato" finds "tomatoes").
function matchesQuery(name, query) {
  const words = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).map(singular);
  const text = name.toLowerCase();
  return words.length > 0 && words.every((w) => text.includes(w));
}

function renderPantryList() {
  const items = pantry().map(splitPantryLine);
  const textOpen = !$("pantry-text").hidden;
  $("pantry-empty").hidden = items.length > 0 || textOpen;
  $("pantry-list-head").hidden = !items.length && !pantryEditing;
  $("pantry-list-tools").hidden = !pantryEditing;
  $("pantry-list").classList.toggle("is-editing", pantryEditing);
  // Rows keep their place in the whole pantry (i), so editing a filtered row changes the right line.
  const shown = items.map((item, i) => [item, i]).filter(([item]) => !pantryQuery || matchesQuery(item.name, pantryQuery));
  $("pantry-list").replaceChildren(...shown.map(([item, i]) => {
    const row = pantryEditing ? pantryRow(item, i) : pantryView(item);
    row.dataset.i = i;
    return row;
  }));
  // While editing, adding happens from the floating bar ("+ Add"), not the field at the top.
  $("pantry-add-btn").hidden = textOpen;
  $("pantry-add-form").hidden = pantryEditing || textOpen;
  const note = $("pantry-find-note");
  if (!pantryQuery || !items.length || textOpen) note.replaceChildren();
  else if (shown.length) note.replaceChildren(`You have ${plural(shown.length, "match", "matches")} for “${pantryQuery}”.`);
  else note.replaceChildren(el("strong", { text: `No ${pantryQuery}` }), " in your pantry. Press Add to add it.");
}

// The last thing typed, without its amount: "rice 1 kg, sal" -> "sal".
function queryFromAddField() {
  const parts = $("pantry-add").value.split(/,(?!\d)/);
  return splitPantryLine(parts[parts.length - 1] || "").name.trim();
}

// "1100 g" reads as "1.1 kg"; litres as "L" so they don't look like a capital I.
function amountLabel(amount) {
  if (!amount) return "";
  const tidy = parseAmount(amount) ? addQuantities([amount]) : amount;
  return tidy.replace(/(\d)\s*l$/i, "$1 L");
}

// A row you can only read: the name and how much there is.
function pantryView(item) {
  return el("li", { class: "pantry-item is-view" },
    el("span", { class: "pi-name", text: item.name }),
    el("span", { class: "pi-qty", text: amountLabel(item.amount) }),
  );
}

// Scroll to a row of the pantry list and flash it, so you see where what you added went.
function revealPantryItem(i) {
  const row = i >= 0 && $("pantry-list").querySelector(`[data-i="${i}"]`);
  if (!row) return;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
  row.classList.add("just-added");
  setTimeout(() => row.classList.remove("just-added"), 2000);
}

// "+ Add" in the floating bar: an empty row at the end of the list, ready to type in.
function startNewPantryRow() {
  $("pantry-list").querySelector(".is-new")?.remove();
  // Same layout as the rows above: name, amount + unit, − + and ✕ (which cancels).
  const name = el("input", {
    class: "pi-new-input", type: "text", maxlength: 120, autocomplete: "off",
    placeholder: "New ingredient", "aria-label": "Name of the new ingredient",
  });
  const number = el("input", {
    class: "pi-number", type: "text", inputmode: "decimal", placeholder: "–",
    maxlength: 8, autocomplete: "off", "aria-label": "Amount of the new ingredient",
  });
  const unit = el("select", { class: "pi-unit", "aria-label": "Unit of the new ingredient" },
    ...UNITS.map((u) => el("option", { value: u, text: UNIT_LABEL[u] ?? u })));
  const confirm = el("button", { class: "pi-btn pi-less pi-confirm", type: "button", text: "✓", "aria-label": "Add this ingredient" });
  const cancel = el("button", { class: "pi-btn pi-remove pi-cancel", type: "button", text: "✕", "aria-label": "Cancel new ingredient" });
  const row = el("li", { class: "pantry-item is-new" },
    name, el("span", { class: "pi-amount" }, number, unit), confirm, cancel);

  const close = () => row.remove();
  const commit = () => {
    const n = number.value.trim().replace(",", ".");
    if (!name.value.trim()) return name.focus();
    if (n && !/^\d+(?:\.\d+)?$/.test(n)) { number.setAttribute("aria-invalid", "true"); return number.focus(); }
    addTypedToPantry(name, `${name.value.trim()}${n ? ` ${n}${unit.value ? " " + unit.value : ""}` : ""}`);
  };
  // A sensible unit follows the name until you pick one yourself.
  let picked = false;
  unit.addEventListener("change", () => { picked = true; });
  name.addEventListener("input", () => { if (!picked) unit.value = guessUnit(name.value); });
  number.addEventListener("input", () => number.removeAttribute("aria-invalid"));
  confirm.addEventListener("click", commit);
  cancel.addEventListener("click", close);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); commit(); }
    else if (e.key === "Escape") close();
  });
  $("pantry-list").append(row);
  row.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  name.focus({ preventScroll: true });
}

function setPantryEditing(on) {
  pantryEditing = on;
  const button = $("pantry-edit");
  button.textContent = on ? "Done" : "Edit";
  button.setAttribute("aria-pressed", String(on));
  // Leaving edit mode closes the text view too.
  if (!on && !$("pantry-text").hidden) $("pantry-text-toggle").click();
  renderPantryList();
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

// Adds what was typed ("milk 1 L, eggs") to the pantry, then scrolls to the last one added.
function addTypedToPantry(input, text = input.value) {
  const fresh = parsePantry(text).map(splitPantryLine);
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
  input.value = "";
  pantryQuery = "";
  $("pantry-add").value = "";
  writePantry(items);
  input.focus({ preventScroll: true });
  revealPantryItem(items.findIndex((it) => it.name.toLowerCase() === fresh[fresh.length - 1].name.toLowerCase()));
  toast(unclear.length
    ? `Couldn't add the amounts for ${unclear.join(", ")}. Change them in the list.`
    : already === fresh.length ? "Already in your pantry" : "Added to your pantry");
}

function setupPantry() {
  $("pantry-input").value = tidyPantryText(store.load("pantry", ""));
  $("basics").checked = store.load("basics", true);
  $("pantry-input").addEventListener("input", savePantry);
  $("basics").addEventListener("change", savePantry);

  $("pantry-add-form").addEventListener("submit", (e) => {
    e.preventDefault();
    addTypedToPantry($("pantry-add"));
  });
  $("pantry-add-btn").addEventListener("click", startNewPantryRow);

  $("pantry-edit").addEventListener("click", () => setPantryEditing(!pantryEditing));
  $("pantry-add").addEventListener("input", () => {
    const query = queryFromAddField();
    if (query === pantryQuery) return;
    pantryQuery = query;
    renderPantryList();
  });

  const textToggle = $("pantry-text-toggle");
  textToggle.addEventListener("click", () => {
    const opening = $("pantry-text").hidden;
    $("pantry-text").hidden = !opening;
    $("pantry-list").hidden = opening;
    $("pantry-add-form").hidden = opening;
    textToggle.textContent = opening ? "Back to list" : "Edit as text";
    textToggle.setAttribute("aria-expanded", String(opening));
    updatePantryCount();
    if (opening) $("pantry-input").focus();
  });

  // On small screens the pantry sits above the page as a slim bar, folded at first,
  // so the page itself (logo, tabs, plan) is what you see when it opens.
  const aside = $("pantry");
  const toggle = $("pantry-toggle");
  const setOpen = (open) => {
    aside.classList.toggle("collapsed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.textContent = open ? "Hide" : pantry().length ? "Show" : "Add";
  };
  toggle.addEventListener("click", () => {
    const opening = aside.classList.contains("collapsed");
    setOpen(opening);
    if (opening && !pantry().length) $("pantry-add").focus(); // "Add" goes straight to the field
  });
  setOpen(false);
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

// ---------- What you have: checked against the pantry as it is now ----------
// Claude marks each ingredient (have_it / buy) when it writes a recipe, but the pantry can
// change afterwards. These work the marks out again from the current pantry.
const BASICS = /^(?:(?:sea|kosher|table|fine)\s+)?salt(?:\s+and\s+(?:black\s+)?pepper)?$|^(?:freshly\s+)?(?:ground\s+)?(?:black\s+)?pepper$|^(?:(?:extra\s+virgin\s+)?olive|vegetable|cooking|canola|sunflower|neutral)?\s*oil$|^water$/i;

// Do the names share their main words one way or the other ("parmesan" and "parmesan cheese")?
function looseItem(a, b) {
  const p = coreWords(a);
  const r = coreWords(b);
  return p.size > 0 && r.size > 0 && ([...p].every((w) => r.has(w)) || [...r].every((w) => p.has(w)));
}

function checkIngredient(ing, rows, basics) {
  if (basics && BASICS.test(ing.name.trim())) return { have_it: true, buy: "" };
  const i = findPantryIndex(rows, ing.name);
  if (i < 0) {
    // Not clearly in the pantry. Trust Claude's "have it" only if something similar is still there.
    return ing.have_it && rows.some((r) => looseItem(r.name, ing.name))
      ? { have_it: true, buy: "" }
      : { have_it: false, buy: ing.quantity };
  }
  const need = parseAmount(ing.quantity);
  const have = rows[i].amount ? parseAmount(rows[i].amount) : null;
  // In the pantry without an amount we can compare ("rice", or "garlic 1 head" vs "3 cloves"): you have it.
  if (!need || !have || need.unit !== have.unit) return { have_it: true, buy: "" };
  const short = Math.round((need.n - have.n) * 100) / 100;
  if (short <= 0) return { have_it: true, buy: "" };
  return { have_it: false, buy: addQuantities([`${short}${need.unit ? " " + need.unit : ""}`]) };
}

// A copy of the ingredients with have_it and buy worked out from the current pantry.
function withPantry(ingredients) {
  const rows = pantry().map(splitPantryLine);
  const basics = $("basics").checked;
  return ingredients.map((ing) => ({ ...ing, ...checkIngredient(ing, rows, basics) }));
}

// A plan meal's ingredients: checked against the pantry, unless it's already cooked
// (then the pantry no longer has what it used, so its marks stay as they were).
function mealIngredients(meal) {
  return planRecipes[mealKey(meal)]?.cooked ? meal.ingredients : withPantry(meal.ingredients);
}

// When the pantry changes, open recipes and the plan show the new marks.
let recipeRefreshTimer;
function refreshRecipes() {
  clearTimeout(recipeRefreshTimer);
  recipeRefreshTimer = setTimeout(() => {
    document.querySelectorAll("article.recipe").forEach((card) => card.refresh?.());
    if (plan) renderPlan();
  }, 150);
}

function cookedSummary({ updated, usedUp, unchanged }) {
  const parts = [];
  if (updated.length) parts.push(`Now in your pantry: ${updated.join(", ")}.`);
  if (usedUp.length) parts.push(`Used up and removed: ${usedUp.join(", ")}.`);
  if (unchanged.length) parts.push(`Check by hand (no amount to subtract): ${unchanged.join(", ")}.`);
  return parts.join(" ") || "None of these ingredients are in your pantry, so nothing changed.";
}

// What every request to the server includes.
function kitchen(cfg = settings) {
  // The server reads restrictions as a list of people; the whole household is one entry.
  const people = [{ name: "Everyone", restrictions: cfg.restrictions, notes: cfg.restrictionNotes }];
  return { pantry: pantry(), has_basics: $("basics").checked, people, household_size: cfg.servings,
           likes: settings.likes,
           // "Okra Stew (too slimy)"; the server takes up to 200 characters per dish
           dislikes: settings.dislikes.map((t) => (settings.dislikeNotes[t] ? `${t} (${settings.dislikeNotes[t]})` : t).slice(0, 200)) };
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
  button.replaceChildren(...dotted(button.dataset.busyLabel));
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
// ---------- Nutrition (Claude's estimate per serving) ----------
function hasNutrition(item) {
  const n = item?.nutrition;
  return isObject(n) && Number.isFinite(n.calories) && n.calories > 0;
}
function formatNumber(n) {
  return Math.round(n).toLocaleString("en-US");
}

// Calories, protein, carbs and fat in a row, like the panel on a food label, then the rest in one line.
function nutritionFacts(n) {
  if (!hasNutrition({ nutrition: n })) return null;
  const main = [
    [formatNumber(n.calories), "kcal", "Calories"],
    [`${formatNumber(n.protein_g)} g`, "protein", "Protein"],
    [`${formatNumber(n.carbs_g)} g`, "carbs", "Carbohydrates"],
    [`${formatNumber(n.fat_g)} g`, "fat", "Fat"],
  ];
  return el("section", { class: "nutrition", "aria-label": "Nutrition per serving" },
    el("dl", { class: "macros" },
      ...main.map(([value, label, full]) => el("div", { class: "macro" },
        el("dt", { text: label, title: full }),
        el("dd", { text: value }),
      )),
    ),
    el("p", { class: "nutrition-more" },
      `Per serving, estimated · Fiber ${formatNumber(n.fiber_g)} g · Sugar ${formatNumber(n.sugar_g)} g · Sodium ${formatNumber(n.sodium_mg)} mg`),
  );
}

// "1,850 kcal" under a day's date: what one person eats that day, if every meal has numbers.
function dayTotal(meals) {
  if (!meals.length || !meals.every(hasNutrition)) return null;
  const kcal = meals.reduce((sum, m) => sum + m.nutrition.calories, 0);
  const protein = meals.reduce((sum, m) => sum + m.nutrition.protein_g, 0);
  return el("p", { class: "day-total" },
    el("span", { text: `${formatNumber(kcal)} kcal` }),
    el("span", { text: `${formatNumber(protein)} g protein` }),
  );
}

function recipeCard(recipe, sourceId = recipe.title) {
  const inPlan = Boolean(planRecipes[sourceId]);
  // Once cooked, the marks stay as they were: the pantry no longer has what the recipe used.
  let frozen = inPlan && Boolean(planRecipes[sourceId].cooked);
  let shown = recipe.ingredients; // the ingredients with the marks on screen

  const ingredients = el("ul", { class: "ings" });
  const steps = el("ol", { class: "steps" },
    ...recipe.steps.map((step) => el("li", {}, el("span", { text: step }))),
  );
  const legend = el("p", { class: "legend" },
    "✓ you have it   ", el("span", { class: "swatch", text: "highlighted" }), " to buy");

  const allSet = el("p", { class: "all-set", text: "You have everything you need." });
  const addButton = el("button", {
    class: "btn primary",
    type: "button",
    onclick: () => {
      const meal = planRecipes[sourceId] ? findMeal({ date: sourceId.split("|")[0], meal: sourceId.split("|")[1] }) : null;
      const source = meal ? mealSource(meal.week.meals[meal.index]) : sourceId;
      const added = addIngredients(shown, recipe.title, source).length;
      toast(added ? `Added ${plural(added, "item", "items")} to your shopping list` : "Already on your shopping list");
    },
  });

  // Draws the ingredient marks from the pantry as it is now.
  const draw = () => {
    if (!frozen) shown = withPantry(recipe.ingredients);
    const missing = shown.filter((i) => !i.have_it);
    ingredients.replaceChildren(...shown.map((ing) =>
      el("li", { class: ing.have_it ? "have" : "buy" },
        el("span", { class: "qty", text: ing.quantity }),
        el("span", { class: "name", text: ing.name }),
        // You have some already: say how much is missing.
        !ing.have_it && ing.buy && ing.buy !== ing.quantity
          ? el("span", { class: "buy-only", text: `buy ${ing.buy}` })
          : null,
      )));
    addButton.hidden = !missing.length;
    addButton.textContent = `Add ${plural(missing.length, "missing ingredient", "missing ingredients")} to shopping list`;
    allSet.hidden = missing.length > 0;
    // A suggestion's summary line says how many things to buy.
    const tobuy = card?.closest(".suggestion")?.querySelector("summary .tobuy");
    if (tobuy) tobuy.textContent = missing.length ? `${missing.length} to buy` : "you have everything";
  };
  let card = null;

  // "Cooked it" takes the ingredients out of the pantry. Plan meals remember it (and how to undo it).
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
    frozen = true;
    const result = useFromPantry(recipe.ingredients);
    changes = result.changes;
    setCooked(sourceId, true, changes);
    showCooked(true);
    cookedNote.replaceChildren(el("p", { text: cookedSummary(result) }));
    toast("Pantry updated");
    undoButton.focus();
  });
  undoButton.addEventListener("click", () => {
    frozen = false;
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
        allSet,
        el("div", { class: "recipe-actions" }, addButton, cookedButton, undoButton, favoriteButton(recipe), ...tasteButtons(recipe)),
        cookedNote,
      )
    : null;

  draw();
  card = el("article", { class: "recipe", "data-source": sourceId },
    el("h2", { text: recipe.title }),
    el("p", { class: "desc", text: recipe.description }),
    el("div", { class: "meta" },
      el("span", { text: `${recipe.total_time_minutes} min` }),
      el("span", { text: plural(recipe.servings, "serving", "servings") }),
    ),
    nutritionFacts(recipe.nutrition),
    el("div", { class: "cols" },
      el("section", {}, el("h3", { text: "Ingredients" }), ingredients, legend),
      el("section", {}, el("h3", { text: "Steps" }), steps),
    ),
    action,
    recipe.steps.length ? recipeChat(recipe, sourceId) : null,
  );
  card.refresh = draw;
  return card;
}

// ---------- Likes and dislikes: Mise remembers them for future plans and ideas ----------
function tasteOf(title) {
  if (settings.likes.includes(title)) return "like";
  if (settings.dislikes.includes(title)) return "dislike";
  return null;
}

function setTaste(title, taste) {
  settings.likes = settings.likes.filter((t) => t !== title);
  settings.dislikes = settings.dislikes.filter((t) => t !== title);
  delete settings.dislikeNotes[title];
  if (taste === "like") settings.likes = [...settings.likes, title].slice(-50);
  if (taste === "dislike") settings.dislikes = [...settings.dislikes, title].slice(-50);
  saveSettings();
  saveTasteToCloud(title);
  renderTastes();
  document.querySelectorAll(".taste").forEach((group) => group.update?.());
}

// ---------- Tastes in the account (table "tastes": one row per dish, with the reason) ----------
// Signed out, tastes live in this browser's settings. Signed in, the table is the record and
// this browser keeps a copy. If the table isn't set up yet, the settings copy is all there is.
function tasteRow(title) {
  const taste = tasteOf(title);
  return taste && { title, taste, reason: taste === "dislike" ? settings.dislikeNotes[title] || null : null,
                    updated_at: new Date().toISOString() };
}

const missingTable = (error) => /tastes|PGRST205|42P01|schema cache/i.test(`${error?.code} ${error?.message}`);

async function saveTasteToCloud(title) {
  if (!cloud.user || cloud.noTastesTable) return;
  const row = tasteRow(title);
  const { error } = row
    ? await cloud.client.from("tastes").upsert(row, { onConflict: "user_id,title" })
    : await cloud.client.from("tastes").delete().eq("title", title);
  if (!error) return;
  if (missingTable(error)) cloud.noTastesTable = true; // not set up yet: settings still keep them
  else toast("Couldn't save that to your account. It's kept in this browser.");
}

async function loadTastes() {
  if (!cloud.user) return;
  const { data, error } = await cloud.client.from("tastes").select("title, taste, reason").order("updated_at");
  if (error) {
    if (missingTable(error)) cloud.noTastesTable = true;
    return;
  }
  // First time with the table: copy what this browser already knows.
  if (!data.length) {
    const rows = [...settings.likes, ...settings.dislikes].map(tasteRow).filter(Boolean);
    if (rows.length) await cloud.client.from("tastes").upsert(rows, { onConflict: "user_id,title" });
    return;
  }
  settings.likes = data.filter((r) => r.taste === "like").map((r) => r.title).slice(-50);
  settings.dislikes = data.filter((r) => r.taste === "dislike").map((r) => r.title).slice(-50);
  settings.dislikeNotes = Object.fromEntries(data.filter((r) => r.taste === "dislike" && r.reason).map((r) => [r.title, r.reason]));
  saveSettings();
  renderTastes();
  document.querySelectorAll(".taste").forEach((group) => group.update?.());
}

// A thumb (up, or turned upside down with CSS for "not for me").
function thumbIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  for (const d of ["M7 10v11H3V10h4z", "M7 10l4-7a2 2 0 0 1 2 2v4h5.6a2 2 0 0 1 2 2.3l-1.3 8A2 2 0 0 1 17.3 21H7"]) {
    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

const DISLIKE_REASONS = ["Too spicy", "Too bland", "Took too long", "Too heavy", "An ingredient", "Not my kind of dish"];

// "What didn't you like?": quick reasons and a few words of your own. All optional.
function reasonPanel(recipe, done) {
  const picked = new Set();
  const chips = el("div", { class: "chips", role: "group", "aria-label": "Reasons" }, ...DISLIKE_REASONS.map((r) => {
    const box = el("input", { type: "checkbox" });
    box.addEventListener("change", () => {
      if (box.checked) picked.add(r); else picked.delete(r);
      if (r === "An ingredient" && box.checked) input.focus();
    });
    return el("label", { class: "chip" }, box, el("span", { text: r }));
  }));
  const input = el("input", {
    type: "text", maxlength: 100, autocomplete: "off", placeholder: "Which ingredient, or anything else (optional)",
    "aria-label": "Anything else you didn't like",
  });
  const save = el("button", { class: "btn primary small", type: "submit", text: "Save" });
  const skip = el("button", { class: "btn small", type: "button", text: "Skip" });
  const form = el("form", { class: "reason-panel" },
    el("p", { class: "reason-title", text: "What didn't you like?" }),
    chips, input,
    el("div", { class: "reason-actions" }, save, skip),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const parts = [...picked].filter((r) => r !== "An ingredient" || !input.value.trim()).map((r) => r.toLowerCase());
    if (input.value.trim()) parts.push(input.value.trim());
    const note = parts.join(", ").slice(0, 120);
    if (note) {
      settings.dislikeNotes[recipe.title] = note;
      saveSettings();
      saveTasteToCloud(recipe.title);
      renderTastes();
    }
    done(note);
  });
  skip.addEventListener("click", () => done(""));
  return form;
}

// Like / Not for me, plus the "why?" panel that opens after Not for me.
// Returns both, so the panel can take the full width under the buttons.
function tasteButtons(recipe) {
  const like = el("button", { class: "btn taste-btn", type: "button" }, thumbIcon(), el("span", { text: "Like" }));
  const dislike = el("button", { class: "btn taste-btn is-down", type: "button" }, thumbIcon(), el("span", { text: "Not for me" }));
  const group = el("div", { class: "taste", role: "group", "aria-label": "Did you like this dish?" }, like, dislike);
  const slot = el("div", { class: "reason-slot" });
  const closePanel = () => slot.replaceChildren();
  group.update = () => {
    const taste = tasteOf(recipe.title);
    like.setAttribute("aria-pressed", String(taste === "like"));
    dislike.setAttribute("aria-pressed", String(taste === "dislike"));
    if (taste !== "dislike") closePanel();
  };
  group.update();
  like.addEventListener("click", () => {
    const on = tasteOf(recipe.title) !== "like";
    setTaste(recipe.title, on ? "like" : null);
    toast(on ? "Glad you liked it. Mise will remember." : "Like removed");
  });
  dislike.addEventListener("click", () => {
    const on = tasteOf(recipe.title) !== "dislike";
    setTaste(recipe.title, on ? "dislike" : null);
    if (!on) return toast("Removed from dishes you don't like");
    const panel = reasonPanel(recipe, (note) => {
      closePanel();
      toast(note ? "Thanks. Future plans and ideas will keep that in mind." : "Noted. Future plans and ideas will skip it.");
      dislike.focus();
    });
    slot.replaceChildren(panel);
    panel.querySelector(".chip input").focus(); // a reason, not the text field: no keyboard pops up on phones
  });
  return [group, slot];
}

// The "Your tastes" part of Plan settings: what Mise remembers, with a way to take things back.
function renderTastes() {
  const list = (key, label) => {
    const items = settings[key];
    return el("div", { class: "taste-list" },
      el("p", { class: "taste-list-title", text: label }),
      items.length
        ? el("ul", {}, ...[...items].reverse().map((title) => el("li", {},
            el("span", {}, title,
              key === "dislikes" && settings.dislikeNotes[title]
                ? el("small", { class: "taste-why", text: settings.dislikeNotes[title] })
                : null),
            el("button", {
              type: "button", class: "pi-btn pi-remove", text: "✕", "aria-label": `Forget ${title}`,
              onclick: () => { setTaste(title, null); toast(`Forgot ${title}`); },
            }))))
        : el("p", { class: "help", text: "Nothing yet." }),
    );
  };
  $("tastes").replaceChildren(list("likes", "Liked"), list("dislikes", "Not for me"));
}

// ---------- Recipe chat: ask while you cook, or change the recipe ----------
// One conversation per recipe, kept while the page is open (closing and reopening a meal keeps it).
const chats = new Map(); // sourceId -> { messages: [{ role, content, changed }], open, busy, error, render }

function chatFor(sourceId) {
  if (!chats.has(sourceId)) chats.set(sourceId, { messages: [], open: false, busy: false, error: "" });
  return chats.get(sourceId);
}

function recipeChat(recipe, sourceId) {
  const chat = chatFor(sourceId);
  const log = el("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  const input = el("input", {
    type: "text", maxlength: 1000, autocomplete: "off",
    placeholder: "I'm out of bananas, can we adapt it?",
    "aria-label": "Ask a question or ask for a change",
  });
  const send = el("button", { class: "btn primary", type: "submit", text: "Send" });
  const form = el("form", { class: "chat-form" }, input, send);
  const box = el("details", { class: "recipe-chat" },
    el("summary", { text: "Ask or change something" }),
    el("div", { class: "chat-body" },
      el("p", { class: "help", text: "Missing an ingredient, cooking for more people, or not sure about a step? Ask here. If you ask for a change, the recipe updates." }),
      log, form),
  );
  box.open = chat.open;
  box.addEventListener("toggle", () => {
    chat.open = box.open;
    if (box.open) input.focus();
  });

  // The newest card for this recipe draws the conversation (an older one may be closed by now).
  chat.render = () => {
    log.replaceChildren(
      ...chat.messages.map((m) => el("div", { class: `chat-msg is-${m.role}` },
        el("p", { text: m.content }),
        m.changed ? el("p", { class: "chat-changed", text: "✓ Recipe updated" }) : null,
      )),
      chat.busy ? el("div", { class: "chat-msg is-assistant is-thinking" }, el("p", {}, ...dotted("Thinking..."))) : "",
      chat.error ? el("p", { class: "message error", text: chat.error }) : "",
    );
    log.hidden = !log.childElementCount;
    send.disabled = chat.busy;
    log.scrollTop = log.scrollHeight;
  };
  chat.render();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || chat.busy) return;
    chat.messages.push({ role: "user", content: text });
    chat.busy = true;
    chat.error = "";
    input.value = "";
    chat.render();
    try {
      const answer = await post("/api/recipe/chat", {
        ...kitchen(planRecipes[sourceId] ? planSettings() : settings),
        recipe: plainRecipe(planRecipes[sourceId] || recipe),
        messages: chat.messages.slice(-20).map(({ role, content }) => ({ role, content })),
      });
      chat.messages.push({ role: "assistant", content: answer.reply, changed: Boolean(answer.recipe) });
      if (answer.recipe) {
        chat.busy = false;
        adaptRecipe(answer.recipe, sourceId);
      }
    } catch (err) {
      // Take the question back so it can be sent again.
      chat.messages.pop();
      chat.error = err.message;
      if (input.isConnected && !input.value) input.value = text;
    } finally {
      chat.busy = false;
      chat.render();
    }
  });
  return box;
}

// Puts the recipe Claude changed in place of the old one: on screen, and in the plan if it's from there.
function adaptRecipe(fresh, sourceId) {
  if (planRecipes[sourceId]) {
    const { cooked, cookedChanges } = planRecipes[sourceId];
    planRecipes[sourceId] = { ...fresh, cooked, cookedChanges };
    const [date, meal] = sourceId.split("|");
    const spot = findMeal({ date, meal });
    if (spot) {
      const old = spot.week.meals[spot.index];
      const updated = { ...old, title: fresh.title, description: fresh.description,
                        total_time_minutes: fresh.total_time_minutes, ingredients: fresh.ingredients };
      // If the old version is on the shopping list, put the new one there instead.
      const listed = Object.values(shopping).some((item) => !item.done && fixItem(item).sources.includes(mealSource(old)));
      spot.week.meals[spot.index] = updated;
      if (listed) {
        removeFromList(old);
        addIngredients(withPantry(updated.ingredients), updated.title, mealSource(updated));
      }
      const dialog = $("meal-dialog");
      if (dialog.meal && mealKey(dialog.meal) === sourceId) dialog.meal = updated;
      savePlan();
      renderPlan();
    }
    store.save("planRecipes", planRecipes);
  }
  const live = document.querySelector(`article.recipe[data-source="${CSS.escape(sourceId)}"]`);
  if (live) {
    const next = recipeCard(fresh, sourceId);
    live.replaceWith(next);
    const summary = next.closest(".suggestion")?.querySelector("summary span");
    if (summary) summary.textContent = fresh.title;
    next.refresh(); // updates a suggestion's "N to buy"
    next.querySelector(".chat-form input")?.focus();
  }
  toast("Recipe updated");
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
    for (const ing of mealIngredients(m)) {
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
  for (const m of meals) for (const k of addIngredients(mealIngredients(m), m.title, mealSource(m))) keys.add(k);
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
      class: "btn danger", type: "button", text: "Clear whole list",
      onclick: async () => {
        if (!(await askConfirm({
          title: "Clear the shopping list?",
          text: "Every item comes off the list, including the ones you've ticked.",
          ok: "Clear list", danger: true,
        }))) return;
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
// Restrictions for everyone eating: one chip each.
function renderRestrictions() {
  $("restrictions").replaceChildren(...RESTRICTIONS.map((r) => {
    const box = el("input", { type: "checkbox" });
    box.checked = settings.restrictions.includes(r);
    box.addEventListener("change", () => {
      settings.restrictions = box.checked
        ? [...settings.restrictions, r]
        : settings.restrictions.filter((x) => x !== r);
      saveSettings();
    });
    return el("label", { class: "chip" }, box, el("span", { text: r }));
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
      // The whole cell is the target, so it's easy to hit with a thumb.
      return el("td", {}, el("label", { class: "cell" }, box));
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
  $("household-size").value = settings.servings;
  $("restriction-notes").value = settings.restrictionNotes;

  const read = () => {
    const size = Math.round(Number($("household-size").value));
    if (size >= 1 && size <= 20) settings.servings = size; // an empty or odd number keeps the last good one
    settings.restrictionNotes = $("restriction-notes").value;
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

  $("household-size").addEventListener("blur", () => { $("household-size").value = settings.servings; });

  $("pantry-tip-link").addEventListener("click", () => {
    openPantry();
    const add = $("pantry-add");
    add.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    add.focus({ preventScroll: true });
  });

  $("plan-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    read();
    if (!buildSlots().length) {
      showMessage("plan-message", "Tick at least one meal in Which meals.", true);
      return;
    }
    if (plan && !(await askConfirm({
      title: "Replace your meal plan?",
      text: "Mise will make a new plan with these settings. Your current plan and its recipes will be replaced; your shopping list stays as it is.",
      ok: "Replace plan",
    }))) return;
    startNewPlan();
  });

  renderRestrictions();
  renderTastes();
  renderMealGrid();
  saveSettings();
}

function saveSettings() {
  store.save("settings", settings);
  const meals = buildSlots().length;
  $("plan-summary").textContent =
    `${plural(meals, "meal", "meals")} for ${plural(settings.servings, "person", "people")}`;
  const hasRules = settings.restrictions.length > 0 || settings.restrictionNotes.trim() !== "";
  document.querySelectorAll(".household-note").forEach((n) => (n.hidden = !hasRules));
  $("more-what").textContent = moreOptionsText();
}

// Under "More options" while it's closed: what's chosen there, so nobody has to open it to check.
// "Vegetarian, Nut-free · Mediterranean · 21 meals a week"
function moreOptionsText() {
  const parts = [];
  const rules = [...settings.restrictions];
  if (settings.restrictionNotes.trim()) rules.push("your notes");
  if (rules.length) parts.push(rules.length > 3 ? `${rules.slice(0, 2).join(", ")} and ${rules.length - 2} more` : rules.join(", "));
  const diet = settings.diet === "other" ? settings.dietOther.trim() : settings.diet;
  if (diet) parts.push(diet);
  const perWeek = MEALS.reduce((n, meal) => n + settings.meals[meal].filter(Boolean).length, 0);
  parts.push(`${plural(perWeek, "meal", "meals")} a week`);
  return parts.length > 1 ? parts.join(" · ") : `Restrictions, diet, cooking time · ${parts[0]}`;
}

// "Add your pantry first" shows only before the first plan, while the pantry is empty.
function updatePantryTip() {
  $("pantry-tip").hidden = Boolean(plan) || pantry().length > 0;
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
    ...kitchen(cfg),
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
    servings: settings.servings,
    people: [],
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
// While a week is being planned, the message changes every few seconds so the wait feels alive.
// It's only text on the page: Claude is asked exactly the same thing.
const PLAN_STEPS = [
  "Looking through your pantry...",
  "Checking everyone's restrictions...",
  "Choosing breakfasts...",
  "Balancing lunches and dinners...",
  "Fitting meals to your cooking time...",
  "Keeping the shopping list short...",
  "Adding a few new ideas...",
  "Putting the week together...",
];
let planStep = 0;
let planTicker = null;

const planStepText = () => PLAN_STEPS[planStep % PLAN_STEPS.length];

// One small animated drawing per planning phase, in the same order as PLAN_STEPS.
// Drawn with SVG (createElementNS, never innerHTML).
function phaseIcon() {
  const NS = "http://www.w3.org/2000/svg";
  const make = (tag, attrs, ...kids) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    node.append(...kids);
    return node;
  };
  const icons = [
    // pantry: a magnifier sweeping along the shelf
    () => [
      make("path", { d: "M6 47h52" }),
      make("rect", { class: "fill soft", x: "10", y: "27", width: "12", height: "20", rx: "2" }),
      make("rect", { class: "fill soft", x: "26", y: "21", width: "12", height: "26", rx: "2" }),
      make("rect", { class: "fill soft", x: "42", y: "29", width: "12", height: "18", rx: "2" }),
      make("g", { class: "scan" }, make("circle", { cx: "18", cy: "22", r: "9" }), make("path", { d: "M25 29l8 8" })),
    ],
    // restrictions: a shield whose check mark draws itself
    () => [
      make("path", { d: "M32 5l20 7v14c0 13-9 21-20 25C21 47 12 39 12 26V12z" }),
      make("path", { class: "tick", d: "M22 27l7 7 13-14" }),
    ],
    // breakfasts: a fried egg with a pulsing yolk
    () => [
      make("path", { d: "M12 30c-2-11 8-17 19-15s21 5 19 17-13 14-23 12-13-4-15-14z" }),
      make("circle", { class: "fill yolk", cx: "31", cy: "30", r: "8" }),
    ],
    // lunches and dinners: scales that keep tipping
    () => [
      make("path", { d: "M32 12v34M21 48h22" }),
      make("g", { class: "beam" },
        make("path", { d: "M8 14h48" }),
        make("path", { d: "M8 14l-5 15h10zM56 14l-5 15h10z" })),
    ],
    // cooking time: a clock hand going round
    () => [
      make("circle", { cx: "32", cy: "28", r: "21" }),
      make("path", { class: "soft", d: "M32 28l9 5" }),
      make("path", { class: "hand", d: "M32 28V13" }),
    ],
    // shopping list: lines writing themselves
    () => [
      make("rect", { x: "15", y: "5", width: "34", height: "46", rx: "3" }),
      make("path", { class: "ln l1", d: "M22 17h20" }),
      make("path", { class: "ln l2", d: "M22 27h20" }),
      make("path", { class: "ln l3", d: "M22 37h12" }),
    ],
    // new ideas: a light bulb that glows
    () => [
      make("path", { class: "bulb", d: "M32 9a14 14 0 0 0-8 25v6h16v-6A14 14 0 0 0 32 9z" }),
      make("path", { d: "M26 46h12M28 51h8" }),
      make("path", { class: "ray soft", d: "M32 1v3M10 12l3 2M54 12l-3 2M6 28h3M55 28h3" }),
    ],
    // putting the week together: calendar days popping in
    () => [
      make("rect", { x: "9", y: "10", width: "46", height: "40", rx: "3" }),
      make("path", { d: "M9 21h46M20 5v9M44 5v9" }),
      ...[0, 1, 2, 3, 4, 5].map((i) => make("rect", {
        class: "fill day", x: String(15 + (i % 3) * 13), y: String(27 + Math.floor(i / 3) * 11),
        width: "8", height: "7", rx: "1.5", style: `animation-delay:${i * 0.25}s`,
      })),
    ],
  ];
  return make("svg", { class: "phase-icon", viewBox: "0 0 64 56", width: "64", height: "56", focusable: "false" },
    ...icons[planStep % icons.length]());
}

// The changing phrase shows inside the week being planned. Screen readers hear
// "Planning week 1 of 4" once, not every phrase.
function startPlanStatus(label) {
  stopPlanStatus();
  planStep = 0;
  const box = $("plan-message");
  box.classList.remove("error");
  box.replaceChildren(el("span", { class: "sr-only", text: `Planning ${label.toLowerCase()}` }));
  const draw = () => {
    const text = document.querySelector(".week-pending .planning-text");
    if (!text) return;
    document.querySelector(".week-pending .phase-icon")?.replaceWith(phaseIcon());
    text.replaceChildren(...dotted(planStepText()));
    text.classList.remove("fresh"); // restart the fade-in for each new phrase
    void text.offsetWidth;
    text.classList.add("fresh");
  };
  draw();
  planTicker = setInterval(() => { planStep++; draw(); }, 3500);
}

function stopPlanStatus() {
  clearInterval(planTicker);
  planTicker = null;
}

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
        startPlanStatus(`Week ${n + 1} of ${plan.weeks.length}`);
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
    stopPlanStatus();
    showMessage("plan-message", "");
    toast(left ? `Your plan is ready, but ${plural(left, "meal", "meals")} couldn't be planned` : "Your meal plan is ready");
  } catch (err) {
    stopPlanStatus();
    planError = err.message;
    showMessage("plan-message", err.message, true);
  } finally {
    stopPlanStatus();
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
  return new Set(week.meals.flatMap((m) => mealIngredients(m).filter((i) => !i.have_it).map((i) => i.name.trim().toLowerCase()))).size;
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
  updatePantryTip();
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
        onclick: async () => {
          if (!(await askConfirm({
            title: "Delete this meal plan?",
            text: "The plan and the recipes opened from it will be deleted. Your shopping list stays as it is.",
            ok: "Delete plan", danger: true,
          }))) return;
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
          planning && isNext
            ? el("div", { class: "planning", "aria-hidden": "true" }, phaseIcon(),
                el("p", { class: "planning-text" }, ...dotted(planStepText())))
            : el("p", { text: "Not planned yet." }),
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
        el("div", { class: "day-side" },
          el("div", { class: "day-date" },
            el("span", { class: "dow", text: WEEKDAYS[wd].slice(0, 3) }),
            el("span", { class: "num", text: String(parseDate(date).getDate()) }),
            wd >= 5 && planSettings().relaxed ? el("span", { class: "tag", text: "Relaxed" }) : null,
          ),
          dayTotal(meals),
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
  const toBuy = mealIngredients(meal).filter((i) => !i.have_it).length;
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
    el("span", { class: "title" }, ...(busy ? dotted("Finding another meal...") : [meal.title])),
    el("span", { class: "facts" },
      `${meal.total_time_minutes} min`,
      hasNutrition(meal) ? ` · ${formatNumber(meal.nutrition.calories)} kcal` : "",
      toBuy ? " · " : " · nothing to buy",
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
  preview.querySelector(".steps").replaceWith(el("p", { class: "loading-note" }, ...dotted("Writing the steps...")));
  body.replaceChildren(preview);
  if (!dialog.open) dialog.showModal();

  try {
    const recipe = await post("/api/plan/recipe", { ...kitchen(planSettings()), meal });
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
  closeOnOutsideClick(dialog);

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
    // What Undo needs: the old meals, their saved recipes, and the list as it was.
    const listBefore = JSON.stringify(shopping);
    const undo = [];
    olds.forEach((old, i) => {
      if (!fresh[i]) return;
      const before = JSON.stringify(shopping);
      spots[i].week.meals[spots[i].index] = fresh[i];
      undo.push({ old, fresh: fresh[i], recipe: planRecipes[mealKey(old)] });
      delete planRecipes[mealKey(old)];
      removeFromList(old);
      undo[undo.length - 1].wasOnList = JSON.stringify(shopping) !== before;
    });
    const listAfter = JSON.stringify(shopping);
    store.save("planRecipes", planRecipes);
    saveShopping();
    savePlan();
    toast(fresh[1] ? `Swapped for ${fresh[0].title}, and the next day's lunch too` : `Swapped for ${fresh[0].title}`,
      { label: "Undo", run: () => undoSwap(current, undo, listBefore, listAfter) });
    return fresh[0];
  } finally {
    olds.forEach((m) => swapping.delete(mealKey(m)));
    if (plan) renderPlan();
  }
}

// Puts the meals from before a swap back, with their recipes and shopping-list items.
// No call to Claude: everything comes from what was saved at swap time.
function undoSwap(swappedPlan, undo, listBefore, listAfter) {
  if (plan !== swappedPlan) return toast("This plan was replaced, so the swap can't be undone.");
  // Each new meal has to still be where the swap put it (not swapped again or cooked since).
  const spots = undo.map((u) => findMeal(u.fresh));
  if (spots.some((spot, i) => !spot || spot.week.meals[spot.index] !== undo[i].fresh || planRecipes[mealKey(undo[i].fresh)]?.cooked)) {
    return toast("This meal changed again, so the swap can't be undone.");
  }
  // If nothing else touched the list since the swap, put it back exactly; otherwise add the old meals again.
  const listUntouched = JSON.stringify(shopping) === listAfter;
  undo.forEach((u, i) => {
    removeFromList(u.fresh); // in case the new meal was added to the list meanwhile
    spots[i].week.meals[spots[i].index] = u.old;
    if (u.recipe) planRecipes[mealKey(u.old)] = u.recipe;
    else delete planRecipes[mealKey(u.old)];
  });
  if (listUntouched) shopping = JSON.parse(listBefore);
  else addMealsToList(undo.filter((u) => u.wasOnList).map((u) => u.old));
  store.save("planRecipes", planRecipes);
  saveShopping();
  savePlan();
  renderPlan();
  // A meal dialog showing the new dish now shows the old one again.
  const dialog = $("meal-dialog");
  if (dialog.open && dialog.meal === undo[0].fresh) openMeal(undo[0].old);
  else document.querySelector(`.meal-slot[data-key="${CSS.escape(mealKey(undo[0].old))}"] .meal-card`)?.focus();
  toast(`${undo[0].old.title} is back`);
}

// The swap form inside the meal dialog.
async function swapMeal(meal, reason) {
  const button = $("swap-submit");
  const message = $("swap-message");
  button.disabled = true;
  message.classList.remove("error");
  message.replaceChildren(...dotted("Finding something else..."));
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
    // On phones the tabs slide sideways: bring the chosen one into view.
    tab.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  // Fade the edge that has more tabs past it (CSS uses these only on phones).
  const bar = document.querySelector(".tabs");
  const edges = () => {
    bar.classList.toggle("more-left", bar.scrollLeft > 2);
    bar.classList.toggle("more-right", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 2);
  };
  bar.addEventListener("scroll", edges, { passive: true });
  addEventListener("resize", edges);
  edges();
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (step) select(tabs[(i + step + tabs.length) % tabs.length]);
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        select(e.key === "Home" ? tabs[0] : tabs[tabs.length - 1]);
      }
    });
  });
}

// ---------- Create a recipe / What can I cook? ----------
function setupForms() {
  $("servings").value = Math.min(20, settings.servings || 2);

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
        const missing = withPantry(recipe.ingredients).filter((i) => !i.have_it).length;
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
  setupToast();
  setupPantry();
  setupAccount();
  setupTabs();
  setupSettingsForm();
  setupForms();
  setupDialog();
  renderShopping();
  renderPlan();
  renderFavorites();

  let status = null;
  try {
    status = await fetch("/api/status").then((r) => r.json());
    $("key-alert").hidden = status.has_key;
  } catch {
    /* the forms will show a clear error if the server is down */
  }
  try {
    await cloudStart(status?.supabase);
  } catch {
    toast("Couldn't reach your account. Showing what's saved in this browser.");
  } finally {
    cloud.checked = true;
    if (!cloud.client) renderFavorites();
  }
}

start();
