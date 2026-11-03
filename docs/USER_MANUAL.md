# Mise user manual

Mise plans your meals around what's already in your kitchen, writes the recipes, and keeps one shopping list for everything you're missing. This manual walks through each part of the app.

**Contents**

1. [Before you start](#1-before-you-start)
2. [Your first meal plan in five minutes](#2-your-first-meal-plan-in-five-minutes)
3. [My pantry](#3-my-pantry)
4. [Plan settings](#4-plan-settings)
5. [Your meal plan](#5-your-meal-plan)
6. [Recipes](#6-recipes)
7. [Ask while you cook](#7-ask-while-you-cook)
8. [Shopping list](#8-shopping-list)
9. [Create a recipe and What can I cook?](#9-create-a-recipe-and-what-can-i-cook)
10. [Your account](#10-your-account)
11. [Favorites](#11-favorites)
12. [Questions and answers](#12-questions-and-answers)

---

## 1. Before you start

Open Mise in your browser (if you run it on your own computer, the address is http://localhost:8000). The page has two parts:

- **On the left**, the tabs: **Meal plan**, **Create a recipe**, **What can I cook?**, **Shopping list** and **Favorites**.
- **On the right**, **My pantry**: the list of what you have at home. On a phone, the pantry sits at the top of the page; press **Hide** or **Show** to fold it away.

You don't need an account. Without one, everything is saved in the browser you're using. With one, your data follows you to any device (see [Your account](#10-your-account)).

Amounts are metric: grams (g), kilograms (kg), millilitres (ml) and litres (L), or a plain count ("eggs 6").

## 2. Your first meal plan in five minutes

1. **Fill your pantry.** In **Add what you have**, type what's in your kitchen, separated by commas, and press **Add**. For example: `rice 1 kg, eggs 12, chicken breast 500 g, onions 3, tomatoes`. Amounts are optional.
2. **Open Plan settings** in the **Meal plan** tab. Set **How many people**, tick any **Restrictions**, and choose how long to plan.
3. **Untick the meals you don't make** in **Which meals**, such as weekday lunches you eat at work.
4. **Press Create meal plan.** Each week appears as soon as it's ready (about 40 seconds per week).
5. **Press Add to shopping list** next to a week. Everything you're missing goes to the **Shopping list** tab.
6. **Click any meal** to read its recipe.

## 3. My pantry

Mise builds plans and recipes around your pantry, so the more it knows, the less you buy.

### Add ingredients

Type in **Add what you have** and press **Add**:

- One ingredient: `rice 1 kg`
- Several at once, separated by commas: `milk 1 l, eggs 6, garlic`
- The amount can go first or last: `500 g chicken` and `chicken 500 g` both work.
- A decimal can use a comma: `flour 1,5 kg`.

If the ingredient is already in your pantry with an amount, the new amount is added to it: `rice 1 kg` plus `rice 500 g` becomes `rice 1.5 kg`.

### Check whether you have something

Start typing in **Add what you have** and the list shows only what matches, with a note like "You have 2 matches for "tomato"". If you don't have it, the note says so: press **Add** to add it. Clear the field to see the whole list again.

In a long pantry, the **What you have** bar (with **Edit**, **Done** and **Edit as text**) stays at the top while you scroll.

### Change amounts or remove items

The pantry shows a plain list, so nothing changes by accident. To edit it:

1. Press **Edit** next to **What you have**.
2. Change the number, pick a unit (units, g, kg, ml or L), or use **−** and **+**. Switching between g and kg (or ml and L) converts the number for you: 500 g becomes 0.5 kg.
3. Press **✕** to remove an ingredient.
4. Press **Done** when you finish.

While editing, **Edit as text** (next to **Done**) opens the whole pantry as text, one ingredient per line. It's the quickest way to paste a long list. Press **Back to list** to return to the rows.

### I have basics

Leave **I have basics (salt, pepper, oil, water)** ticked if you always have them. Mise then never puts them on the shopping list.

## 4. Plan settings

Open **Plan settings** at the top of the **Meal plan** tab. Your choices are saved as you make them.

**Who's eating**

- **How many people**: everyone eats the same meals, and recipes are written for this many servings.
- **Restrictions**: tick everything that applies to anyone at the table (Vegetarian, Gluten-free, Nut allergy…). Every meal respects all of them.
- **Other restrictions or foods to avoid**: anything else, in your own words ("no mushrooms, mild spice for the kids").

**How long**: **1 week**, **2 weeks** or **1 month**, and the day it starts.

**Which meals**: a grid of days and meals. Untick any meal you don't need planned.

**Time and diet**

- **Cooking time on weekdays** and **on weekends**: the longest a meal can take, including preparation.
- **Diet to follow**: Mediterranean, high protein, low carb and more, or **Something else…** to describe your own.
- **Relaxed weekends**: comfort food and treats are fine on Saturday and Sunday.
- **Cook once, eat twice**: some dinners make enough for the next day's lunch.
- **Repeat favorites**: a breakfast or lunch can come back on other days, which keeps the shopping list short. Dinners always vary.

**Anything else**: free-text requirements, like "packable lunches" or "Mexican food on Fridays".

**Your tastes**: the dishes you marked **Like** or **Not for me** in any recipe. Press **✕** next to one to forget it.

Press **Create meal plan** when you're ready. If you already have a plan, Mise asks before replacing it.

## 5. Your meal plan

The plan shows one row per day, with its meals as cards. Each card shows the dish, its time and how many ingredients you still need to buy.

- **Open a meal**: click its card to read the recipe.
- **Swap a meal**: press the round arrows in the card's corner and Mise suggests a different dish straight away. With **Cook once, eat twice**, swapping a dinner also swaps the next day's leftovers lunch.
- **Swap with a reason**: open the meal, press **Swap this meal**, and say what you'd rather have ("not a fan of fish", "something lighter").
- **Cooked meals** show **✓ Cooked** in the corner.
- **Add to the shopping list**: press **Add to shopping list** next to a week, or **Add whole plan to shopping list** at the top.
- **Delete plan** removes the plan. Your shopping list stays as it is.

Mise plans one week at a time. If a week can't be planned (for example, the connection drops), the weeks before it are kept and a **Plan the remaining weeks** button appears. If a few meals are missing from a week, press **Plan the N missing meals**.

## 6. Recipes

A recipe shows the time, the servings, the ingredients and numbered steps.

**What you have and what you need**

- **✓** means the ingredient is in your pantry.
- A **highlighted** ingredient is one you need to buy. If you have some but not enough, it says how much more to buy ("buy 200 g").
- The marks update as soon as you change your pantry. When you have everything, the recipe says **You have everything you need**.

**Buttons under the recipe**

- **Add missing ingredients to shopping list**: adds only what you're missing.
- **Cooked it**: takes the amounts the recipe used out of your pantry and tells you what changed. Ingredients without an amount, or measured differently ("1 head" of garlic vs. "3 cloves"), are left for you to check by hand.
- **Undo cooked**: puts the pantry back as it was, except anything you've changed since.
- **♡ Save to favorites**: keeps the recipe in the **Favorites** tab (you need an account).
- **Like** and **Not for me**: tell Mise what you thought of the dish. Future plans, **What can I cook?** and **Create a recipe** take it into account: dishes you didn't like (and very similar ones) don't come back, and the ones you liked can return now and then. Press the same button again to undo. After **Not for me**, Mise asks **What didn't you like?**: tap any reasons that apply (too spicy, too bland, took too long, too heavy, an ingredient, not my kind of dish), add a few words if you like, and press **Save**, or **Skip**. The reason helps future plans avoid what you didn't like, not just that one dish. You can see and remove them in **Plan settings > Your tastes**.

## 7. Ask while you cook

At the bottom of every full recipe, press **Ask or change something** to open a chat about that recipe. Write in any language.

**Ask a question** and the recipe stays the same:

- "The first pancake breaks when I flip it, what do I do?"
- "The onions are golden, what's next?"
- "Can I use a regular pan instead of a wok?"

**Ask for a change** and Mise rewrites the recipe on the spot, saying what it changed:

- "I just realized I don't have bananas, can we adapt it?"
- "Make it for 6 people."
- "Make it dairy-free."
- "I only have 20 minutes."

When the recipe is from your meal plan, the plan updates too. If that meal's ingredients were on your shopping list, the list is updated to match the new recipe.

The conversation stays while the page is open, even if you close and reopen the recipe. It's cleared when you reload the page.

## 8. Shopping list

The **Shopping list** tab shows how many items are left, grouped by supermarket section (Produce, Meat & Fish, Dairy & Eggs…).

- **Amounts are added up**: if three recipes need onions, you see one line for all of them.
- **Recipes still need** shows the total the recipes use. **Buy** suggests how much to buy in the sizes stores sell: if the recipes need 1.4 l of milk, it suggests 2 l. You can change the number and unit.
- **Tick** each item as you put it in your basket.
- **Move checked to pantry**: adds what you ticked to your pantry, with the amounts in **Buy**, and takes it off the list.
- **Remove checked items**: takes ticked items off the list without adding them to the pantry.
- **✕** removes a single item. **Clear whole list** empties it, after asking you to confirm.
- **Download list** saves the list as a text file, handy for your phone.

When you swap a meal, its ingredients come off the list (except the ones you've already ticked).

## 9. Create a recipe and What can I cook?

**Create a recipe**: describe what you feel like ("a quick creamy pasta for a weeknight"), choose the servings and, if you want, add dietary needs. Mise writes a full recipe using your pantry first.

**What can I cook?**: Mise suggests three recipes made mostly from what's in your pantry, starting with the one that needs the fewest extra ingredients. Add a note if you like ("something healthy, under 30 minutes"). Your pantry can't be empty for this one.

Both include your household's restrictions from **Plan settings** automatically. Recipes from these tabs aren't saved when you reload the page; press **♡ Save to favorites** to keep one.

## 10. Your account

An account keeps your pantry, plan, settings and shopping list on any device, and lets you save favorite recipes. Without an account, everything stays in the browser you're using.

### Create an account

1. Press **Sign in** at the top of the page.
2. Type your email and a password (at least 6 characters). The eye button shows or hides what you typed.
3. Press **Create account**.
4. If Mise asks you to confirm your email, open the link in the email it sends (check your spam folder), then sign in.

The first time you sign in, whatever you already had in this browser is saved to your new account.

### Sign in

Press **Sign in**, type your email and password, and press **Sign in**. The page reloads with your saved data and a message confirms who you are. If you've used Mise on another device, that device's data is what you see.

### Forgot your password

1. Press **Sign in**, then **Forgot password?**
2. Type your email and press **Send reset link**.
3. Open the link in the email. Mise opens and asks you to choose a new password.

Links work once and expire after a while. If yours doesn't work, ask for a new one.

### The account panel

When you're signed in, the top button says **Account**. It opens a panel where you can:

- **Change password**: type your current password, then the new one twice.
- **Sign out**: your data stays in your account and is removed from this browser.
- **Delete account**: permanently deletes your account and everything in it (pantry, plans, shopping list and favorites). Mise asks you to confirm first. This can't be undone.

## 11. Favorites

Press **♡ Save to favorites** under any recipe to keep it. The heart fills in (**♥ Saved**). Press it again to remove the recipe.

The **Favorites** tab lists your saved recipes, newest first. Click one to open it. Its ✓ and to-buy marks follow your current pantry, and its chat works like any other recipe's.

Favorites need an account. If you're not signed in, the heart opens the sign-in window.

## 12. Questions and answers

**Do I have to fill in the pantry?**
No. With an empty pantry, Mise plans freely and you buy everything. The more it knows about your pantry, the shorter your shopping list.

**Why is an ingredient I have still highlighted?**
Either the pantry has less than the recipe needs (the recipe says how much more to buy), or the names are too different to match. Use the same name, for example "parmesan" for "parmesan cheese".

**How long does a plan take?**
About 40 seconds per week, so a month takes a few minutes. Each week shows up as soon as it's ready, and you can start reading recipes right away.

**Can I change the plan settings after making a plan?**
Yes, but the plan keeps the settings it was made with. To use the new ones, press **Create meal plan** again.

**I use Mise on my phone and my computer. Which data wins?**
With an account, the most recent change. Edits are saved to your account a moment after you make them, and the other device picks them up the next time you open Mise.

**What does Claude see?**
Only what each request needs: your pantry, your household's restrictions and preferences, and the recipe or plan you're working on. Your email and password go only to the sign-in service, never to Claude.

**The page looks odd after an update.**
Reload it with `Ctrl + F5` (or `Cmd + Shift + R` on a Mac).
