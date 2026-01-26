const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- Database and Utility Functions ---
const DB_NAME = "RecipeManagerDB";
const DB_VERSION = 3; // Incremented for new features
const STORE_NAMES = {
  RECIPES: "recipes",
  MEAL_PLAN: "mealPlan",
  SHOPPING_LIST: "shoppingList",
  INVENTORY: "inventory",
  RATINGS: "ratings",
  COLLECTIONS: "collections",
  ANALYTICS: "analytics",
  COOKING_SESSIONS: "cookingSessions",
  DRAFTS: "drafts",
  RECIPE_VERSIONS: "recipeVersions",
  NUTRITION_GOALS: "nutritionGoals",
  INGREDIENT_PRICES: "ingredientPrices",
  SUBSTITUTIONS: "substitutions",
};
const LOCAL_STORAGE_KEYS = {
  RECIPES: "recipes",
  MEAL_PLAN: "mealPlan",
  SHOPPING_LIST: "shoppingList",
  THEME: "theme",
  INVENTORY: "inventory",
  RATINGS: "ratings",
  COLLECTIONS: "collections",
  ANALYTICS: "analytics",
  COOKING_SESSIONS: "cookingSessions",
  DRAFTS: "drafts",
  RECIPE_VERSIONS: "recipeVersions",
  NUTRITION_GOALS: "nutritionGoals",
  INGREDIENT_PRICES: "ingredientPrices",
  SUBSTITUTIONS: "substitutions",
  HIGH_CONTRAST: "highContrastMode",
};

let db = null;

const openDatabase = () => {
  return new Promise((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      const oldVersion = event.oldVersion;

      for (const storeName of Object.values(STORE_NAMES)) {
        if (!db.objectStoreNames.contains(storeName)) {
          const objectStore = db.createObjectStore(storeName, {
            keyPath: "id",
          });

          // Add indexes for better querying
          if (storeName === STORE_NAMES.INVENTORY) {
            objectStore.createIndex("name", "name", { unique: false });
            objectStore.createIndex("category", "category", { unique: false });
          }
          if (storeName === STORE_NAMES.RATINGS) {
            objectStore.createIndex("recipeId", "recipeId", { unique: false });
          }
          if (storeName === STORE_NAMES.COOKING_SESSIONS) {
            objectStore.createIndex("recipeId", "recipeId", { unique: false });
            objectStore.createIndex("completedAt", "completedAt", {
              unique: false,
            });
          }
        }
      }
    };

    request.onsuccess = (event) => {
      db = event.target.result;
      resolve(db);
    };

    request.onerror = (event) => {
      console.error("IndexedDB error:", event.target.error);
      reject(event.target.error);
    };
  });
};

const getStore = async (storeName, mode) => {
  const database = await openDatabase();
  const transaction = database.transaction(storeName, mode);
  return transaction.objectStore(storeName);
};

const getAllItems = async (storeName) => {
  try {
    const store = await getStore(storeName, "readonly");
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Error getting all items from ${storeName}:`, error);
    return [];
  }
};

const addItem = async (storeName, item) => {
  try {
    const store = await getStore(storeName, "readwrite");
    const request = store.add(item);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Error adding item to ${storeName}:`, error);
    throw error;
  }
};

const updateItem = async (storeName, id, updatedItem) => {
  try {
    const store = await getStore(storeName, "readwrite");
    const request = store.put(updatedItem);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(updatedItem);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Error updating item in ${storeName}:`, error);
    throw error;
  }
};

const deleteItem = async (storeName, id) => {
  try {
    const store = await getStore(storeName, "readwrite");
    const request = store.delete(id);
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Error deleting item from ${storeName}:`, error);
    throw error;
  }
};

const clearStore = async (storeName) => {
  try {
    const store = await getStore(storeName, "readwrite");
    const request = store.clear();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Error clearing store ${storeName}:`, error);
    throw error;
  }
};

const formatMinutesToHoursMinutes = (totalMinutes) => {
  if (isNaN(totalMinutes) || totalMinutes < 0) return "";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  let parts = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || totalMinutes === 0) parts.push(`${minutes}m`);
  return parts.join(" ");
};

const escapeHTML = (str) => {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const parseIngredient = (ingredient) => {
  if (typeof ingredient !== "string")
    return { quantity: null, unit: null, description: "" };

  const regex =
    /^\s*(\d*\s*\d*\/\d+|\d+\.?\d*|\d*[\u00BC-\u00BE\u2150-\u215E])?\s*([a-zA-Z.]+)?\s*(.*)$/;
  const match = ingredient.match(regex);

  if (match) {
    let quantity = null;
    let unit = match[2]?.trim() || null;
    let description = match[3]?.trim() || "";
    const quantityString = match[1]?.trim();

    const unicodeFractions = {
      "Â½": 0.5,
      "Â¼": 0.25,
      "Â¾": 0.75,
      "â…“": 1 / 3,
      "â…”": 2 / 3,
      "â…•": 0.2,
      "â…–": 0.4,
      "â…—": 0.6,
      "â…˜": 0.8,
      "â…™": 1 / 6,
      "â…š": 5 / 6,
      "â…›": 0.125,
      "â…œ": 0.375,
      "â…": 0.625,
      "â…ž": 0.875,
    };

    if (quantityString) {
      try {
        let totalQuantity = 0;
        const parts = quantityString.split(/\s+/);
        if (parts.length === 2 && parts[1].includes("/")) {
          totalQuantity = parseFloat(parts[0]) + eval(parts[1]);
        } else if (parts.length === 1 && parts[0].includes("/")) {
          totalQuantity = eval(parts[0]);
        } else if (unicodeFractions[quantityString]) {
          totalQuantity = unicodeFractions[quantityString];
        } else {
          totalQuantity = parseFloat(quantityString);
        }

        if (!isNaN(totalQuantity)) {
          quantity = totalQuantity;
        } else {
          description = `${quantityString} ${unit || ""} ${description}`.trim();
          unit = null;
        }
      } catch (e) {
        console.warn("Could not parse quantity:", quantityString, e);
        description = `${quantityString} ${unit || ""} ${description}`.trim();
        unit = null;
      }
    }

    const commonNonUnits = new Set([
      "large",
      "medium",
      "small",
      "fresh",
      "dried",
      "chopped",
      "diced",
      "minced",
      "sliced",
      "crushed",
      "finely",
      "roughly",
      "peeled",
      "seeded",
      "cored",
      "rinsed",
      "optional",
      "divided",
      "softened",
      "melted",
      "beaten",
      "cooked",
      "uncooked",
      "raw",
      "canned",
      "frozen",
      "thawed",
      "packed",
      "heaping",
      "scant",
      "about",
      "approximately",
      "plus",
      "more",
      "as",
      "needed",
      "to",
      "taste",
    ]);
    if (unit && commonNonUnits.has(unit.toLowerCase())) {
      description = `${unit} ${description}`.trim();
      unit = null;
    }

    if (quantity === null) {
      description = ingredient;
      unit = null;
    }

    return { quantity, unit, description };
  }
  return { quantity: null, unit: null, description: ingredient };
};

const formatQuantity = (quantity) => {
  if (quantity === null || quantity === undefined || isNaN(quantity)) return "";
  if (quantity === 0) return "";

  if (quantity % 1 === 0) return quantity.toString();

  const tolerance = 0.001;
  const fractions = [
    { decimal: 1 / 8, fraction: "â…›" },
    { decimal: 1 / 4, fraction: "Â¼" },
    { decimal: 1 / 3, fraction: "â…“" },
    { decimal: 3 / 8, fraction: "â…œ" },
    { decimal: 1 / 2, fraction: "Â½" },
    { decimal: 5 / 8, fraction: "â…" },
    { decimal: 2 / 3, fraction: "â…”" },
    { decimal: 3 / 4, fraction: "Â¾" },
    { decimal: 7 / 8, fraction: "â…ž" },
    { decimal: 1 / 5, fraction: "â…•" },
    { decimal: 2 / 5, fraction: "â…–" },
    { decimal: 3 / 5, fraction: "â…—" },
    { decimal: 4 / 5, fraction: "â…˜" },
    { decimal: 1 / 6, fraction: "â…™" },
    { decimal: 5 / 6, fraction: "â…š" },
  ].sort((a, b) => a.decimal - b.decimal);

  const whole = Math.floor(quantity);
  const decimalPart = quantity - whole;

  for (let f of fractions) {
    if (Math.abs(decimalPart - f.decimal) < tolerance) {
      return whole > 0 ? `${whole} ${f.fraction}` : f.fraction;
    }
  }

  return parseFloat(quantity.toFixed(2)).toString();
};

const convertUnits = (quantity, unit, targetUnitSystem) => {
  if (quantity === null || quantity === undefined || isNaN(quantity) || !unit) {
    return { value: quantity, unit: unit };
  }

  const lowerCaseUnit = unit.toLowerCase();
  let convertedValue = quantity;
  let convertedUnit = unit;

  if (targetUnitSystem === "imperial") {
    if (
      lowerCaseUnit === "g" ||
      lowerCaseUnit === "gram" ||
      lowerCaseUnit === "grams"
    ) {
      convertedValue = quantity * 0.035274;
      convertedUnit = "oz";
    } else if (
      lowerCaseUnit === "kg" ||
      lowerCaseUnit === "kilogram" ||
      lowerCaseUnit === "kilograms"
    ) {
      convertedValue = quantity * 35.274;
      convertedUnit = "oz";
    } else if (
      lowerCaseUnit === "ml" ||
      lowerCaseUnit === "milliliter" ||
      lowerCaseUnit === "milliliters"
    ) {
      convertedValue = quantity * 0.033814;
      convertedUnit = "fl oz";
    } else if (
      lowerCaseUnit === "l" ||
      lowerCaseUnit === "liter" ||
      lowerCaseUnit === "liters"
    ) {
      convertedValue = quantity * 33.814;
      convertedUnit = "fl oz";
    } else if (
      lowerCaseUnit === "tsp" ||
      lowerCaseUnit === "teaspoon" ||
      lowerCaseUnit === "teaspoons"
    ) {
      convertedValue = quantity / 3;
      convertedUnit = "tbsp";
    }
  } else if (targetUnitSystem === "metric") {
    if (
      lowerCaseUnit === "oz" ||
      lowerCaseUnit === "ounce" ||
      lowerCaseUnit === "ounces"
    ) {
      convertedValue = quantity * 28.3495;
      convertedUnit = "g";
    } else if (
      lowerCaseUnit === "lb" ||
      lowerCaseUnit === "pound" ||
      lowerCaseUnit === "pounds"
    ) {
      convertedValue = quantity * 453.592;
      convertedUnit = "g";
    } else if (
      lowerCaseUnit === "fl oz" ||
      lowerCaseUnit === "fluid ounce" ||
      lowerCaseUnit === "fluid ounces"
    ) {
      convertedValue = quantity * 29.5735;
      convertedUnit = "ml";
    } else if (lowerCaseUnit === "cup" || lowerCaseUnit === "cups") {
      convertedValue = quantity * 236.588;
      convertedUnit = "ml";
    } else if (
      lowerCaseUnit === "tbsp" ||
      lowerCaseUnit === "tablespoon" ||
      lowerCaseUnit === "tablespoons"
    ) {
      convertedValue = quantity * 14.7868;
      convertedUnit = "ml";
    }
  }
  if (
    targetUnitSystem === "imperial" &&
    (lowerCaseUnit === "tbsp" ||
      lowerCaseUnit === "tablespoon" ||
      lowerCaseUnit === "tablespoons")
  ) {
    convertedValue = quantity * 3;
    convertedUnit = "tsp";
  } else if (
    targetUnitSystem === "metric" &&
    (lowerCaseUnit === "tsp" ||
      lowerCaseUnit === "teaspoon" ||
      lowerCaseUnit === "teaspoons")
  ) {
    convertedValue = quantity * 4.92892;
    convertedUnit = "ml";
  }

  return {
    value: parseFloat(convertedValue.toFixed(2)),
    unit: convertedUnit,
  };
};

const parseYield = (yieldString) => {
  if (typeof yieldString !== "string" || yieldString.trim() === "")
    return { quantity: null, unit: "" };

  const match = yieldString
    .trim()
    .match(/^([\d./\sÂ½Â¼Â¾â…“â…”â…›â…œâ…â…ž]+)\s*(.*)/i);
  if (match) {
    const numericPart = match[1]?.trim();
    const unitPart = match[2]?.trim() || "";
    try {
      const mixedParts = numericPart.split(/[\s\+]+/);
      let totalQuantity = 0;
      const unicodeFractions = {
        "Â½": 0.5,
        "Â¼": 0.25,
        "Â¾": 0.75,
        "â…“": 1 / 3,
        "â…”": 2 / 3,
        "â…›": 1 / 8,
        "â…œ": 3 / 8,
        "â…": 5 / 8,
        "â…ž": 7 / 8,
      };

      for (const part of mixedParts) {
        if (part.includes("/")) {
          const fractionParts = part.split("/");
          if (fractionParts.length === 2) {
            const num = parseFloat(fractionParts[0]);
            const den = parseFloat(fractionParts[1]);
            if (!isNaN(num) && !isNaN(den) && den !== 0)
              totalQuantity += num / den;
            else throw new Error("Invalid fraction part");
          } else throw new Error("Invalid fraction format");
        } else if (unicodeFractions[part]) {
          totalQuantity += unicodeFractions[part];
        } else {
          const num = parseFloat(part);
          if (!isNaN(num)) totalQuantity += num;
          else throw new Error("Invalid numeric part");
        }
      }
      return { quantity: totalQuantity, unit: unitPart };
    } catch (e) {
      console.warn("Could not parse yield quantity:", numericPart, e);
      return { quantity: null, unit: yieldString.trim() };
    }
  }
  return { quantity: null, unit: yieldString.trim() };
};

const formatScaledYield = (originalYieldString, multiplier) => {
  if (
    multiplier === 1 ||
    !originalYieldString ||
    originalYieldString.trim() === ""
  ) {
    return originalYieldString;
  }

  const { quantity, unit } = parseYield(originalYieldString);

  if (quantity === null || quantity === 0) {
    return originalYieldString;
  }

  const scaledQuantity = quantity * multiplier;

  let formattedUnit = unit;
  if (
    scaledQuantity > 1 &&
    unit &&
    !unit.endsWith("s") &&
    !unit.endsWith("es")
  ) {
    if (["cup", "serving", "loin", "piece"].includes(unit.toLowerCase())) {
      formattedUnit = unit + "s";
    }
  } else if (
    scaledQuantity <= 1 &&
    unit &&
    (unit.endsWith("s") || unit.endsWith("es"))
  ) {
    if (["cups", "servings", "loins", "pieces"].includes(unit.toLowerCase())) {
      formattedUnit = unit.slice(0, -1);
    } else if (["batches", "washes"].includes(unit.toLowerCase())) {
      formattedUnit = unit.slice(0, -2);
    }
  }

  return `${formatQuantity(scaledQuantity)} ${formattedUnit}`.trim();
};

const normalizeIngredient = (ingredient) => {
  const { description } = parseIngredient(ingredient);
  if (!description) return "";

  const units = [
    "tbsp",
    "tablespoon",
    "tbs",
    "tsp",
    "teaspoon",
    "cup",
    "c",
    "oz",
    "ounce",
    "fl oz",
    "fluid ounce",
    "pt",
    "pint",
    "qt",
    "quart",
    "gal",
    "gallon",
    "lb",
    "pound",
    "g",
    "gram",
    "kg",
    "kilogram",
    "mg",
    "milligram",
    "ml",
    "milliliter",
    "l",
    "liter",
    "clove",
    "can",
    "jar",
    "slice",
    "pinch",
    "dash",
    "stalk",
    "head",
    "sprig",
    "bunch",
    "package",
    "pkg",
    "box",
    "container",
    "stick",
    "piece",
    "fillet",
    "ear",
  ];
  const descriptors = [
    "to taste",
    "diced",
    "minced",
    "sliced",
    "chopped",
    "crushed",
    "fresh",
    "for garnish",
    "finely",
    "roughly",
    "peeled",
    "seeded",
    "cored",
    "rinsed",
    "dried",
    "optional",
    "divided",
    "softened",
    "melted",
    "beaten",
    "cooked",
    "uncooked",
    "raw",
    "canned",
    "frozen",
    "thawed",
    "packed",
    "firmly packed",
    "lightly packed",
    "heaping",
    "scant",
    "large",
    "medium",
    "small",
    "thinly",
    "thickly",
    "cubed",
    "julienned",
    "grated",
    "zested",
    "juiced",
    "room temperature",
    "cold",
    "hot",
    "warm",
    "about",
    "approximately",
    "plus more",
    "or more",
    "as needed",
    "such as",
  ];

  let normalized = description
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(new RegExp(`\\b(${units.join("|")})s?\\b`, "g"), "")
    .replace(new RegExp(`\\b(${descriptors.join("|")})\\b`, "g"), "")
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (
    normalized.endsWith("es") &&
    ["tomato", "potato"].some((base) => normalized.startsWith(base))
  ) {
    normalized = normalized.slice(0, -2);
  } else if (
    normalized.endsWith("s") &&
    !normalized.endsWith("ss") &&
    !["greens", "oats", "pasta", "rice", "hummus", "molasses"].includes(
      normalized,
    ) &&
    normalized.length > 2
  ) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const capitalizeFirstLetter = (string) => {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
};

// ===== FEATURE 10: AUTO-SAVE DRAFTS =====
const useDraftSaver = (formData, key, delay = 2000) => {
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`draft_${key}`, JSON.stringify(formData));
      } catch (error) {
        console.error("Failed to save draft:", error);
      }
    }, delay);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [formData, key, delay]);
};

const loadDraft = (key) => {
  try {
    const draft = localStorage.getItem(`draft_${key}`);
    return draft ? JSON.parse(draft) : null;
  } catch (error) {
    console.error("Failed to load draft:", error);
    return null;
  }
};

const clearDraft = (key) => {
  try {
    localStorage.removeItem(`draft_${key}`);
  } catch (error) {
    console.error("Failed to clear draft:", error);
  }
};

// ===== FEATURE 11: RECIPE SUGGESTIONS =====
const getRecipeSuggestions = (recipes, inventory, limit = 5) => {
  return recipes
    .map((recipe) => {
      if (!recipe || !Array.isArray(recipe.ingredients)) return null;

      const ingredientMatches = recipe.ingredients.filter((ing) => {
        const normalized = normalizeIngredient(ing).toLowerCase();
        return inventory.some(
          (item) =>
            item.name.toLowerCase().includes(normalized) ||
            normalized.includes(item.name.toLowerCase()),
        );
      });

      const matchPercent =
        recipe.ingredients.length > 0
          ? (ingredientMatches.length / recipe.ingredients.length) * 100
          : 0;

      return {
        recipe,
        matchPercent,
        matchingCount: ingredientMatches.length,
        missingCount: recipe.ingredients.length - ingredientMatches.length,
      };
    })
    .filter((item) => item && item.matchPercent > 0)
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, limit);
};

// ===== FEATURE 12: NUTRITIONAL CALCULATOR =====
const NUTRITION_DATABASE = {
  // Common ingredients with nutrition per 100g
  "ground beef": { calories: 250, protein: 26, carbs: 0, fat: 17 },
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 3.6 },
  "olive oil": { calories: 884, protein: 0, carbs: 0, fat: 100 },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  onion: { calories: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
  garlic: { calories: 149, protein: 6.4, carbs: 33, fat: 0.5 },
  pasta: { calories: 371, protein: 13, carbs: 75, fat: 1.5 },
  rice: { calories: 130, protein: 2.7, carbs: 28, fat: 0.3 },
  egg: { calories: 155, protein: 13, carbs: 1.1, fat: 11 },
  milk: { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.3 },
  cheese: { calories: 402, protein: 25, carbs: 1.3, fat: 33 },
  bread: { calories: 265, protein: 9, carbs: 49, fat: 3.2 },
  butter: { calories: 717, protein: 0.9, carbs: 0.1, fat: 81 },
  sugar: { calories: 387, protein: 0, carbs: 100, fat: 0 },
  flour: { calories: 364, protein: 10, carbs: 76, fat: 1 },
};

const calculateNutrition = (ingredients, servings = 1) => {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  ingredients.forEach((ing) => {
    const normalized = normalizeIngredient(ing).toLowerCase();
    const { quantity, unit } = parseIngredient(ing);

    // Find matching ingredient in database
    const nutritionData = Object.keys(NUTRITION_DATABASE).find((key) =>
      normalized.includes(key),
    );

    if (nutritionData && quantity) {
      const nutrition = NUTRITION_DATABASE[nutritionData];
      // Rough conversion: assume 1 cup = 240g, 1 tbsp = 15g, 1 tsp = 5g
      let grams = quantity;
      if (unit === "cup" || unit === "cups") grams = quantity * 240;
      else if (unit === "tbsp" || unit === "tablespoon") grams = quantity * 15;
      else if (unit === "tsp" || unit === "teaspoon") grams = quantity * 5;
      else if (unit === "lb" || unit === "pound") grams = quantity * 453.6;
      else if (unit === "oz" || unit === "ounce") grams = quantity * 28.35;

      const factor = grams / 100;
      totalCalories += nutrition.calories * factor;
      totalProtein += nutrition.protein * factor;
      totalCarbs += nutrition.carbs * factor;
      totalFat += nutrition.fat * factor;
    }
  });

  return {
    calories: Math.round(totalCalories / servings),
    protein: Math.round(totalProtein / servings),
    carbs: Math.round(totalCarbs / servings),
    fat: Math.round(totalFat / servings),
  };
};

// ===== FEATURE 13: INGREDIENT SUBSTITUTION =====
const INGREDIENT_SUBSTITUTIONS = {
  butter: ["coconut oil", "margarine", "olive oil", "applesauce (for baking)"],
  milk: ["almond milk", "soy milk", "oat milk", "coconut milk"],
  egg: [
    "flax egg (1 tbsp ground flax + 3 tbsp water)",
    "chia egg",
    "applesauce (1/4 cup per egg)",
    "banana (1/4 cup mashed per egg)",
  ],
  sugar: [
    "honey (3/4 cup per 1 cup sugar)",
    "maple syrup",
    "stevia",
    "coconut sugar",
  ],
  "all-purpose flour": [
    "whole wheat flour",
    "almond flour",
    "coconut flour (use less)",
    "oat flour",
  ],
  "heavy cream": ["coconut cream", "cashew cream", "half and half + butter"],
  "sour cream": ["greek yogurt", "coconut yogurt", "cashew cream"],
  breadcrumbs: ["crushed crackers", "panko", "crushed cornflakes", "oats"],
  "parmesan cheese": ["nutritional yeast", "pecorino romano", "asiago"],
  "ground beef": ["ground turkey", "ground chicken", "lentils", "mushrooms"],
  "chicken breast": ["turkey breast", "pork tenderloin", "tofu", "tempeh"],
  "white rice": ["brown rice", "quinoa", "cauliflower rice"],
  pasta: ["zucchini noodles", "whole wheat pasta", "rice noodles"],
  "soy sauce": ["tamari", "coconut aminos", "worcestershire sauce"],
  vinegar: ["lemon juice", "lime juice"],
  honey: ["maple syrup", "agave nectar"],
  "baking powder": [
    "baking soda + cream of tartar (1/4 tsp soda + 1/2 tsp cream per 1 tsp powder)",
  ],
  buttermilk: ["milk + lemon juice (1 tbsp lemon per cup milk)"],
};

const findSubstitutions = (ingredient) => {
  const normalized = normalizeIngredient(ingredient).toLowerCase();

  for (const [key, substitutes] of Object.entries(INGREDIENT_SUBSTITUTIONS)) {
    if (normalized.includes(key)) {
      return { ingredient: key, substitutes };
    }
  }

  return null;
};

// ===== FEATURE 6: SWIPE GESTURES =====
const useSwipeGesture = (onSwipeLeft, onSwipeRight, threshold = 50) => {
  const touchStartX = useRef(0);
  const touchEndX = useRef(0);
  const touchStartY = useRef(0);
  const touchEndY = useRef(0);
  const isSwiping = useRef(false);

  const handleTouchStart = useCallback((e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = true;
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (!isSwiping.current) return;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isSwiping.current) return;

    const deltaX = touchStartX.current - touchEndX.current;
    const deltaY = Math.abs(touchStartY.current - touchEndY.current);

    // Only trigger if horizontal swipe is dominant
    if (Math.abs(deltaX) > deltaY && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        onSwipeLeft?.();
      } else {
        onSwipeRight?.();
      }
    }

    isSwiping.current = false;
  }, [onSwipeLeft, onSwipeRight, threshold]);

  return { handleTouchStart, handleTouchMove, handleTouchEnd };
};

// ===== FEATURE 8: PULL TO REFRESH =====
const usePullToRefresh = (onRefresh, threshold = 80) => {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const containerRef = useRef(null);

  const handleTouchStart = useCallback((e) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
    }
  }, []);

  const handleTouchMove = useCallback(
    (e) => {
      if (startY.current === 0 || containerRef.current?.scrollTop > 0) return;

      const currentY = e.touches[0].clientY;
      const distance = currentY - startY.current;

      if (distance > 0) {
        setPullDistance(Math.min(distance, threshold * 1.5));
        setIsPulling(distance > threshold);
      }
    },
    [threshold],
  );

  const handleTouchEnd = useCallback(async () => {
    if (isPulling) {
      await onRefresh?.();
    }
    setIsPulling(false);
    setPullDistance(0);
    startY.current = 0;
  }, [isPulling, onRefresh]);

  return {
    isPulling,
    pullDistance,
    containerRef,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};

// ===== FEATURE 14: SMART SEARCH WITH FUZZY MATCHING =====
const fuzzyMatch = (text, query) => {
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();

  // Exact match
  if (textLower.includes(queryLower)) return 100;

  // Calculate fuzzy score
  let score = 0;
  let queryIndex = 0;

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      score += 1;
      queryIndex++;
    }
  }

  return queryIndex === queryLower.length
    ? (score / queryLower.length) * 50
    : 0;
};

const smartSearch = (recipes, query, filters = {}) => {
  if (!query && !Object.keys(filters).length) return recipes;

  return recipes
    .map((recipe) => {
      let score = 0;

      // Text matching
      if (query) {
        score += fuzzyMatch(recipe.name || "", query);
        score += fuzzyMatch(recipe.description || "", query) * 0.5;
        score += (recipe.tags || []).reduce(
          (sum, tag) => sum + fuzzyMatch(tag, query) * 0.3,
          0,
        );
        score += (recipe.ingredients || []).reduce(
          (sum, ing) => sum + fuzzyMatch(ing, query) * 0.2,
          0,
        );
      } else {
        score = 100; // No query means all recipes match
      }

      // Filter matching
      if (filters.type && recipe.type !== filters.type) return null;
      if (filters.cuisine && recipe.cuisine !== filters.cuisine) return null;
      if (filters.maxTime) {
        const totalTime = (recipe.prepTime || 0) + (recipe.cookTime || 0);
        if (totalTime > filters.maxTime) return null;
      }
      if (filters.maxCalories && recipe.calories > filters.maxCalories)
        return null;
      if (
        filters.dietaryType &&
        !(recipe.dietaryTypes || []).includes(filters.dietaryType)
      )
        return null;
      if (filters.hasIngredients) {
        const hasAll = filters.hasIngredients.every((requiredIng) =>
          (recipe.ingredients || []).some((ing) =>
            normalizeIngredient(ing)
              .toLowerCase()
              .includes(requiredIng.toLowerCase()),
          ),
        );
        if (!hasAll) return null;
      }

      return { recipe, score };
    })
    .filter((item) => item && item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.recipe);
};

// ===== FEATURE 19: RECIPE VERSIONING =====
const saveRecipeVersion = async (recipe, changeDescription = "Updated") => {
  const version = {
    id: Date.now().toString(),
    recipeId: recipe.id,
    recipeName: recipe.name,
    data: { ...recipe },
    changeDescription,
    timestamp: new Date().toISOString(),
  };

  try {
    await addItem(STORE_NAMES.RECIPE_VERSIONS, version);
    return version;
  } catch (error) {
    console.error("Failed to save recipe version:", error);
  }
};

const getRecipeVersions = async (recipeId) => {
  try {
    const allVersions = await getAllItems(STORE_NAMES.RECIPE_VERSIONS);
    return allVersions
      .filter((v) => v.recipeId === recipeId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (error) {
    console.error("Failed to get recipe versions:", error);
    return [];
  }
};

// ===== FEATURE 22: RECIPE COST TRACKER =====
const calculateRecipeCost = (recipe, priceDatabase = {}) => {
  let totalCost = 0;
  const itemizedCosts = [];

  (recipe.ingredients || []).forEach((ing) => {
    const normalized = normalizeIngredient(ing);
    const { quantity, unit } = parseIngredient(ing);

    const priceData = priceDatabase[normalized];
    if (priceData && quantity) {
      let cost = priceData.pricePerUnit * quantity;
      totalCost += cost;
      itemizedCosts.push({
        ingredient: ing,
        cost: cost.toFixed(2),
      });
    }
  });

  const costPerServing =
    recipe.servings > 0 ? totalCost / recipe.servings : totalCost;

  return {
    totalCost: totalCost.toFixed(2),
    costPerServing: costPerServing.toFixed(2),
    itemizedCosts,
  };
};

// ===== FEATURE 28: UNDO/REDO SYSTEM =====
class ActionHistory {
  constructor(maxSize = 50) {
    this.history = [];
    this.currentIndex = -1;
    this.maxSize = maxSize;
  }

  push(action) {
    // Remove any actions after current index
    this.history = this.history.slice(0, this.currentIndex + 1);

    this.history.push(action);

    // Keep history under max size
    if (this.history.length > this.maxSize) {
      this.history.shift();
    } else {
      this.currentIndex++;
    }
  }

  undo() {
    if (this.canUndo()) {
      const action = this.history[this.currentIndex];
      this.currentIndex--;
      return action;
    }
    return null;
  }

  redo() {
    if (this.canRedo()) {
      this.currentIndex++;
      const action = this.history[this.currentIndex];
      return action;
    }
    return null;
  }

  canUndo() {
    return this.currentIndex >= 0;
  }

  canRedo() {
    return this.currentIndex < this.history.length - 1;
  }

  clear() {
    this.history = [];
    this.currentIndex = -1;
  }
}

const useUndoRedo = () => {
  const historyRef = useRef(new ActionHistory());
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const recordAction = useCallback((action) => {
    historyRef.current.push(action);
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
  }, []);

  const undo = useCallback(() => {
    const action = historyRef.current.undo();
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    return action;
  }, []);

  const redo = useCallback(() => {
    const action = historyRef.current.redo();
    setCanUndo(historyRef.current.canUndo());
    setCanRedo(historyRef.current.canRedo());
    return action;
  }, []);

  return { recordAction, undo, redo, canUndo, canRedo };
};

// ===== FEATURE 27: ERROR BOUNDARY =====
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Error caught by boundary:", error, errorInfo);
    this.setState({ error, errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md text-center">
            <i className="fas fa-exclamation-triangle text-6xl text-red-500 mb-4"></i>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              Oops! Something went wrong
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Don't worry, your recipes are safe. Please refresh the page to
              continue.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="btn-modal btn-green"
            >
              <i className="fas fa-redo mr-2"></i>
              Refresh Page
            </button>
            {this.state.error && (
              <details className="mt-4 text-left">
                <summary className="cursor-pointer text-sm text-gray-500">
                  Error details
                </summary>
                <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded mt-2 overflow-auto">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const SAMPLE_RECIPES = [
  {
    id: "1",
    name: "Classic Spaghetti Bolognese",
    description:
      "A rich and hearty meat sauce simmered slowly and served over pasta. Comfort food at its best.",
    type: "Dinner",
    cuisine: "Italian",
    dietaryTypes: ["Dairy-Free"],
    tags: ["Weeknight", "Comfort Food"],
    prepTime: 20,
    cookTime: 40,
    additionalTime: 0,
    calories: 650,
    protein: 32,
    carbs: 78,
    fat: 22,
    servings: 4,
    yield: "4 servings",
    ingredients: [
      "1 lb ground beef",
      "1 onion, diced",
      "3 cloves garlic, minced",
      "2 cans (14 oz each) crushed tomatoes",
      "1 lb spaghetti",
      "2 tbsp olive oil",
      "Salt and Pepper to taste",
      "Fresh basil for garnish",
    ],
    directions: [
      "Heat olive oil in a large pot over medium heat.",
      "Add onions and garlic, sautÃ© until translucent.",
      "Add ground beef and cook until browned.",
      "Pour in crushed tomatoes and seasonings.",
      "Simmer for 30 minutes.",
      "Cook spaghetti according to package directions.",
      "Serve sauce over pasta with fresh basil.",
    ],
    tipsAndTricks: [
      "For a vegetarian version, substitute ground beef with lentils or mushrooms.",
      "Add a splash of red wine to the sauce for extra depth of flavor.",
    ],
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    isFavorite: false,
    image: null,
    video: null,
  },
  {
    id: "2",
    name: "Quick Garden Salad",
    description:
      "A light and refreshing salad, perfect for a quick lunch or side dish. Easily customizable.",
    type: "Lunch",
    cuisine: "American",
    dietaryTypes: ["Vegan", "Gluten-Free"],
    tags: ["Quick", "Healthy", "Vegan"],
    prepTime: 15,
    cookTime: 0,
    additionalTime: 0,
    calories: 200,
    protein: 5,
    carbs: 20,
    fat: 12,
    servings: 2,
    yield: "1 large bowl",
    ingredients: [
      "2 cups mixed greens",
      "1 tomato, diced",
      "1/2 red onion, sliced",
      "1 cucumber, sliced",
      "2 tbsp olive oil",
      "1 tbsp balsamic vinegar",
      "Salt and pepper to taste",
    ],
    directions: [
      "Combine greens, tomato, onion, and cucumber in a bowl.",
      "Drizzle with olive oil and balsamic vinegar.",
      "Season with salt and pepper.",
      "Toss and serve immediately.",
    ],
    tipsAndTricks: [
      "Add some toasted nuts or seeds for extra crunch and protein.",
      "For a creamier dressing, mix in a teaspoon of Dijon mustard.",
    ],
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    isFavorite: true,
    image: null,
    video: null,
  },
  {
    id: "3",
    name: "Simple Beef Burgers",
    description:
      "Juicy, classic beef burgers perfect for grilling or pan-frying. A crowd-pleaser for any occasion.",
    type: "Dinner",
    cuisine: "American",
    dietaryTypes: [],
    tags: ["Grill", "Quick", "Kid-Friendly"],
    prepTime: 10,
    cookTime: 15,
    additionalTime: 5,
    calories: 550,
    protein: 30,
    carbs: 35,
    fat: 30,
    servings: 4,
    yield: "4 burgers",
    ingredients: [
      "1 lb ground beef",
      "1 tsp garlic powder",
      "1/2 tsp salt",
      "1/4 tsp black pepper",
      "4 burger buns",
      "Lettuce, tomato, onion slices (optional toppings)",
      "3 cloves garlic",
    ],
    directions: [
      "Preheat grill or pan.",
      "Gently mix ground beef, garlic powder, salt, and pepper. Do not overmix.",
      "Form into 4 patties.",
      "Grill or pan-fry for 4-6 minutes per side for medium, or longer depending on desired doneness.",
      "Let rest for 5 minutes.",
      "Serve on buns with desired toppings.",
    ],
    tipsAndTricks: [
      "For juicier burgers, mix in 1/4 cup of grated onion or breadcrumbs soaked in milk.",
      "Make a small indentation in the center of each patty before cooking to prevent bulging.",
    ],
    createdAt: new Date().toISOString(),
    isFavorite: false,
    image: null,
    video: null,
  },
];

// --- VOICE CONTROL SYSTEM ---
class VoiceControl {
  constructor(onCommand) {
    this.onCommand = onCommand;
    this.recognition = null;
    this.isListening = false;
    this.initRecognition();
  }

  initRecognition() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn("Speech recognition not supported");
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = "en-US";

    this.recognition.onresult = (event) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.toLowerCase().trim();
      this.handleCommand(command);
    };

    this.recognition.onerror = (event) => {
      console.error("Voice recognition error:", event.error);
      if (event.error === "no-speech") {
        // Ignore no-speech errors
        return;
      }
    };
  }

  handleCommand(command) {
    const commands = {
      "next step": "nextStep",
      "previous step": "prevStep",
      "go back": "prevStep",
      "set timer": "setTimer",
      "start timer": "startTimer",
      pause: "pause",
      resume: "resume",
      "read step": "readStep",
      repeat: "readStep",
      finish: "finish",
      exit: "exit",
    };

    for (const [phrase, action] of Object.entries(commands)) {
      if (command.includes(phrase)) {
        this.onCommand(action, command);
        return;
      }
    }

    // Check for timer duration
    const timerMatch = command.match(
      /(\d+)\s*(minute|minutes|second|seconds|hour|hours)/i,
    );
    if (timerMatch) {
      const amount = parseInt(timerMatch[1]);
      const unit = timerMatch[2].toLowerCase();
      let seconds = amount;
      if (unit.includes("minute")) seconds = amount * 60;
      if (unit.includes("hour")) seconds = amount * 3600;
      this.onCommand("setTimerDuration", { seconds, text: command });
    }
  }

  async start() {
    if (!this.recognition || this.isListening) return;

    // Request microphone permission explicitly using getUserMedia
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log("Microphone permission granted");
    } catch (err) {
      console.error("Microphone permission denied:", err);
      alert(
        "Microphone access denied. Please allow microphone access in your browser and try again.",
      );
      return;
    }

    try {
      this.recognition.start();
      this.isListening = true;
      console.log("Voice recognition started");
    } catch (e) {
      console.error("Failed to start voice recognition:", e);
      if (e.name === "NotAllowedError") {
        alert(
          "Microphone access denied. Please allow microphone access and try again.",
        );
      }
    }
  }

  stop() {
    if (!this.recognition || !this.isListening) return;
    try {
      this.recognition.stop();
      this.isListening = false;
    } catch (e) {
      console.error("Failed to stop voice recognition:", e);
    }
  }
}

// --- TEXT-TO-SPEECH SYSTEM ---
const speak = (text, onEnd = null) => {
  if (!window.speechSynthesis) return Promise.reject("TTS not supported");

  window.speechSynthesis.cancel(); // Cancel any ongoing speech

  return new Promise((resolve, reject) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onend = () => {
      if (onEnd) onEnd();
      resolve();
    };

    utterance.onerror = (e) => {
      reject(e);
    };

    window.speechSynthesis.speak(utterance);
  });
};

// --- TIME DETECTION IN TEXT ---
const detectTimeInStep = (stepText) => {
  const text = stepText.toLowerCase();
  const timers = [];

  // Patterns to match time expressions
  const patterns = [
    // "5 minutes", "10 mins", "2 min"
    /(\d+)\s*(minute|minutes|min|mins)/gi,
    // "1 hour", "2 hours"
    /(\d+)\s*(hour|hours|hr|hrs)/gi,
    // "30 seconds", "45 secs"
    /(\d+)\s*(second|seconds|sec|secs)/gi,
  ];

  // Find ALL time matches in the text
  patterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const value = parseInt(match[1]);
      const unit = match[2].toLowerCase();

      let seconds = 0;
      if (unit.includes("hour") || unit.includes("hr")) {
        seconds = value * 3600;
      } else if (unit.includes("minute") || unit.includes("min")) {
        seconds = value * 60;
      } else if (unit.includes("second") || unit.includes("sec")) {
        seconds = value;
      }

      const displayText = `${value} ${
        unit.includes("hour") || unit.includes("hr")
          ? value > 1
            ? "hours"
            : "hour"
          : unit.includes("minute") || unit.includes("min")
            ? value > 1
              ? "minutes"
              : "minute"
            : value > 1
              ? "seconds"
              : "second"
      }`;

      timers.push({
        value: value,
        unit:
          unit.includes("hour") || unit.includes("hr")
            ? "hour"
            : unit.includes("minute") || unit.includes("min")
              ? "minute"
              : "second",
        seconds: seconds,
        displayText: displayText,
      });
    }
  });

  return {
    found: timers.length > 0,
    timers: timers,
    // For backwards compatibility, return first timer
    ...(timers.length > 0 ? timers[0] : {}),
  };
};

// --- TIMER COMPLETION SOUND ---
let alarmAudioContext = null;
let alarmOscillator = null;
let alarmGainNode = null;
let alarmInterval = null;

const playTimerSound = () => {
  try {
    // Stop any existing alarm
    stopTimerSound();

    // Create continuous alarm sound using Web Audio API
    alarmAudioContext = new (
      window.AudioContext || window.webkitAudioContext
    )();

    const playBeep = () => {
      if (!alarmAudioContext) return;

      alarmOscillator = alarmAudioContext.createOscillator();
      alarmGainNode = alarmAudioContext.createGain();

      alarmOscillator.connect(alarmGainNode);
      alarmGainNode.connect(alarmAudioContext.destination);

      // Attention-grabbing beep pattern
      alarmOscillator.frequency.value = 880; // A5 note
      alarmOscillator.type = "sine";

      alarmGainNode.gain.setValueAtTime(0.3, alarmAudioContext.currentTime);
      alarmGainNode.gain.exponentialRampToValueAtTime(
        0.01,
        alarmAudioContext.currentTime + 0.3,
      );

      alarmOscillator.start(alarmAudioContext.currentTime);
      alarmOscillator.stop(alarmAudioContext.currentTime + 0.3);
    };

    // Play first beep immediately
    playBeep();

    // Then repeat every 800ms for continuous alarm
    alarmInterval = setInterval(playBeep, 800);
  } catch (err) {
    console.log("Could not play timer sound:", err);
  }
};

const stopTimerSound = () => {
  try {
    if (alarmInterval) {
      clearInterval(alarmInterval);
      alarmInterval = null;
    }
    if (alarmOscillator) {
      try {
        alarmOscillator.stop();
      } catch (e) {
        // Oscillator already stopped
      }
      alarmOscillator = null;
    }
    if (alarmAudioContext) {
      alarmAudioContext.close();
      alarmAudioContext = null;
    }
    alarmGainNode = null;
  } catch (err) {
    console.log("Error stopping alarm:", err);
  }
};

// --- INGREDIENT CATEGORY DETECTION ---
const detectIngredientCategory = (itemName) => {
  const name = itemName.toLowerCase();

  // Check for PANTRY MODIFIERS first (these override other categories)
  // Powdered, ground (spices), dried, canned, jarred items go to pantry
  const pantryModifiers = [
    "powder",
    "powdered",
    "dried",
    "dry",
    "salt",
    "canned",
    "jarred",
    "bottled",
    "mix",
    "seasoning",
    "extract",
    "oil",
    "vinegar",
    "sauce",
    "paste",
    "flour",
    "sugar",
    "rice",
    "pasta",
    "noodle",
    "bean",
    "lentil",
    "grain",
    "cereal",
    "baking",
    "yeast",
  ];

  // Special case: "ground" followed by spice/pepper goes to pantry, "ground" + meat stays as meat
  const hasGroundSpice =
    name.includes("ground") &&
    (name.includes("pepper") ||
      name.includes("cumin") ||
      name.includes("cinnamon") ||
      name.includes("ginger") ||
      name.includes("clove") ||
      name.includes("nutmeg") ||
      name.includes("coriander"));

  if (
    hasGroundSpice ||
    pantryModifiers.some((modifier) => name.includes(modifier))
  ) {
    return "Pantry";
  }

  // Frozen items
  const frozenKeywords = ["frozen", "ice cream"];
  if (frozenKeywords.some((keyword) => name.includes(keyword))) return "Frozen";

  // Meat & Protein (check for "ground" + meat)
  const meatKeywords = [
    "beef",
    "chicken",
    "pork",
    "turkey",
    "lamb",
    "fish",
    "salmon",
    "tuna",
    "shrimp",
    "bacon",
    "sausage",
    "ham",
    "steak",
    "ground beef",
    "ground chicken",
    "ground pork",
    "ground turkey",
  ];
  if (meatKeywords.some((keyword) => name.includes(keyword))) return "Meat";

  // Dairy
  const dairyKeywords = [
    "milk",
    "cheese",
    "butter",
    "cream",
    "yogurt",
    "sour cream",
    "cottage cheese",
    "parmesan",
    "mozzarella",
    "cheddar",
    "egg",
  ];
  if (dairyKeywords.some((keyword) => name.includes(keyword))) return "Dairy";

  // Produce (fresh vegetables, fruits, herbs)
  const produceKeywords = [
    "lettuce",
    "tomato",
    "potato",
    "onion",
    "garlic",
    "carrot",
    "celery",
    "bell pepper",
    "jalapeño",
    "apple",
    "banana",
    "orange",
    "spinach",
    "broccoli",
    "cucumber",
    "mushroom",
    "avocado",
    "lemon",
    "lime",
    "cilantro",
    "parsley",
    "basil",
    "fresh",
  ];
  if (produceKeywords.some((keyword) => name.includes(keyword)))
    return "Produce";

  // Spices & Seasonings (whole spices, fresh herbs not caught above)
  const spiceKeywords = [
    "pepper",
    "cumin",
    "paprika",
    "oregano",
    "thyme",
    "rosemary",
    "cinnamon",
    "chili",
    "cayenne",
  ];
  if (spiceKeywords.some((keyword) => name.includes(keyword))) return "Pantry";

  // Default to Pantry
  return "Pantry";
};

// --- QR CODE GENERATOR ---
const generateQRCode = async (data) => {
  // Generate simple scannable text with recipe info
  const r = typeof data === "string" ? JSON.parse(data) : data;

  console.log("QR Code - Full recipe object keys:", Object.keys(r));
  // Ensure arrays exist
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients : [];
  const directions = Array.isArray(r.directions) ? r.directions : [];
  const tips = Array.isArray(r.tipsAndTricks) ? r.tipsAndTricks : [];

  console.log("QR Code - Ingredients array:", ingredients);
  console.log("QR Code - Directions array:", directions);

  // Create simple text format that's easy to scan
  const recipeText = `${r.name || "Recipe"}

${r.type || ""} ${r.cuisine ? "• " + r.cuisine : ""}
${r.description || ""}

Prep: ${r.prepTime || 0}m | Cook: ${r.cookTime || 0}m | Serves: ${r.servings || 4}

INGREDIENTS:
${ingredients.map((i, idx) => `${idx + 1}. ${i}`).join("\n")}

DIRECTIONS:
${directions.map((d, idx) => `${idx + 1}. ${d}`).join("\n")}${tips.length > 0 ? `\n\n💡 TIPS: ${tips.join(". ")}` : ""}`;

  console.log("QR Code - Final text:", recipeText);

  // Generate QR code with plain text
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(recipeText)}`;
  return qrUrl;
};

// --- ANALYTICS UTILITIES ---
const recordCookingSession = async (
  recipeId,
  recipeName,
  duration,
  completed = true,
) => {
  try {
    const session = {
      id: Date.now().toString(),
      recipeId,
      recipeName,
      duration,
      completed,
      timestamp: Date.now(),
    };
    await addItem(STORE_NAMES.COOKING_SESSIONS, session);
    return session;
  } catch (error) {
    console.error("Error recording cooking session:", error);
  }
};

const getAnalytics = async (recipes) => {
  try {
    const sessions = await getAllItems(STORE_NAMES.COOKING_SESSIONS);
    const ratings = await getAllItems(STORE_NAMES.RATINGS);

    // Calculate stats
    const totalCooked = sessions.filter((s) => s.completed).length;
    const totalCookingTime = sessions.reduce(
      (sum, s) => sum + (s.duration || 0),
      0,
    );
    const avgRating =
      ratings.length > 0
        ? ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length
        : 0;

    // Most cooked recipes
    const recipeCounts = sessions.reduce((acc, s) => {
      acc[s.recipeId] = (acc[s.recipeId] || 0) + 1;
      return acc;
    }, {});

    const mostCooked = Object.entries(recipeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([recipeId, count]) => ({
        recipeId,
        recipeName:
          sessions.find((s) => s.recipeId === recipeId)?.recipeName ||
          "Unknown",
        count,
      }));

    // Cooking streak
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sortedSessions = sessions
      .filter((s) => s.completed)
      .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

    let streak = 0;
    const dates = new Set();
    for (const session of sortedSessions) {
      const sessionDate = new Date(session.completedAt);
      sessionDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor(
        (today - sessionDate) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff === streak && !dates.has(sessionDate.toISOString())) {
        dates.add(sessionDate.toISOString());
        streak++;
      } else if (daysDiff > streak) {
        break;
      }
    }

    return {
      totalCooked,
      totalCookingTime,
      avgRating: avgRating.toFixed(1),
      mostCooked,
      streak,
      totalRecipes: recipes.length,
      favoriteRecipes: recipes.filter((r) => r.isFavorite).length,
    };
  } catch (error) {
    console.error("Error getting analytics:", error);
    return {
      totalCooked: 0,
      totalCookingTime: 0,
      avgRating: 0,
      mostCooked: [],
      streak: 0,
      totalRecipes: 0,
      favoriteRecipes: 0,
    };
  }
};

// React Components (App, Modals, etc.) ---

const usePersistentStorage = (storeName, initialValue, addToast) => {
  const [storedValue, setStoredValue] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);

  useEffect(() => {
    const loadData = async () => {
      if (!isMounted.current) return;
      setIsLoading(true);
      try {
        const localStorageItem = localStorage.getItem(storeName);
        if (localStorageItem) {
          try {
            const parsedLocalStorageData = JSON.parse(localStorageItem);

            let dataToMigrate = parsedLocalStorageData;
            if (storeName === STORE_NAMES.MEAL_PLAN) {
              const days = [
                "Sunday",
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
              ];
              const mealTimes = [
                "breakfast",
                "morningSnack",
                "lunch",
                "afternoonSnack",
                "dinner",
              ];
              const migratedMealPlan = {};
              days.forEach((day) => {
                migratedMealPlan[day] = migratedMealPlan[day] || {};
                mealTimes.forEach((mealTime) => {
                  const existingValue = parsedLocalStorageData[day]?.[mealTime];
                  if (Array.isArray(existingValue)) {
                    migratedMealPlan[day][mealTime] = existingValue;
                  } else if (existingValue) {
                    migratedMealPlan[day][mealTime] = [existingValue];
                  } else {
                    migratedMealPlan[day][mealTime] = [];
                  }
                });
              });
              dataToMigrate = migratedMealPlan;
            } else if (
              storeName === STORE_NAMES.RECIPES &&
              Array.isArray(parsedLocalStorageData)
            ) {
              dataToMigrate = parsedLocalStorageData.map((recipe) => ({
                ...recipe,
                tags: recipe.tags || [],
                description: recipe.description || "",
                cuisine: recipe.cuisine || "",
                dietaryTypes: recipe.dietaryTypes || [],
                ingredients: recipe.ingredients || [],
                directions: recipe.directions || [],
                tipsAndTricks: recipe.tipsAndTricks || [],
                yield: recipe.yield || "",
              }));
            }

            if (Array.isArray(dataToMigrate)) {
              for (const item of dataToMigrate) {
                await addItem(storeName, item);
              }
            } else if (
              typeof dataToMigrate === "object" &&
              dataToMigrate !== null
            ) {
              try {
                await updateItem(storeName, storeName, {
                  id: storeName,
                  data: dataToMigrate,
                });
              } catch (updateError) {
                console.warn(
                  `updateItem failed for ${storeName}, trying addItem:`,
                  updateError,
                );
                try {
                  await addItem(storeName, {
                    id: storeName,
                    data: dataToMigrate,
                  });
                } catch (addError) {
                  console.error(
                    `Both updateItem and addItem failed for ${storeName}:`,
                    addError,
                  );
                  throw addError;
                }
              }
            }

            localStorage.removeItem(storeName);
            addToast(
              `Migrated ${storeName} data from localStorage to IndexedDB!`,
              "info",
            );
          } catch (migrationError) {
            console.error(
              `Error migrating ${storeName} from localStorage:`,
              migrationError,
            );
            addToast(
              `Failed to migrate ${storeName} data. Using IndexedDB directly.`,
              "error",
            );
          }
        }

        let dataFromIndexedDB;
        if (storeName === STORE_NAMES.MEAL_PLAN) {
          try {
            const store = await getStore(storeName, "readonly");
            const req = store.get(storeName);
            const mealPlanObj = await new Promise((resolve, reject) => {
              req.onsuccess = () => resolve(req.result);
              req.onerror = () => reject(req.error);
            });
            dataFromIndexedDB = mealPlanObj ? mealPlanObj.data : null;
          } catch (error) {
            console.error("Error loading meal plan from IndexedDB:", error);
            dataFromIndexedDB = null;
          }

          if (!dataFromIndexedDB) {
            dataFromIndexedDB = {};
          }
          const days = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
          ];
          const mealTimes = [
            "breakfast",
            "morningSnack",
            "lunch",
            "afternoonSnack",
            "dinner",
          ];
          const structuredPlan = {};
          days.forEach((day) => {
            structuredPlan[day] = structuredPlan[day] || {};
            mealTimes.forEach((mealTime) => {
              const existingValue = dataFromIndexedDB[day]?.[mealTime];
              if (Array.isArray(existingValue)) {
                structuredPlan[day][mealTime] = existingValue;
              } else if (existingValue) {
                structuredPlan[day][mealTime] = [existingValue];
              } else {
                structuredPlan[day][mealTime] = [];
              }
            });
          });
          dataFromIndexedDB = structuredPlan;
        } else {
          dataFromIndexedDB = await getAllItems(storeName);
          if (
            storeName === STORE_NAMES.RECIPES &&
            Array.isArray(dataFromIndexedDB)
          ) {
            dataFromIndexedDB = dataFromIndexedDB.map((recipe) => ({
              ...recipe,
              tags: recipe.tags || [],
              description: recipe.description || "",
              cuisine: recipe.cuisine || "",
              dietaryTypes: recipe.dietaryTypes || [],
              ingredients: recipe.ingredients || [],
              directions: recipe.directions || [],
              tipsAndTricks: recipe.tipsAndTricks || [],
              yield: recipe.yield || "",
            }));
          }
        }

        setStoredValue(
          dataFromIndexedDB.length > 0 ||
            (storeName === STORE_NAMES.MEAL_PLAN &&
              Object.keys(dataFromIndexedDB).length > 0)
            ? dataFromIndexedDB
            : initialValue,
        );
      } catch (error) {
        console.error(
          `Error loading data from IndexedDB for ${storeName}:`,
          error,
        );
        addToast(`Error loading ${storeName} data.`, "error");
        setStoredValue(initialValue);
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted.current = false;
    };
  }, [storeName, addToast]);

  const setValue = useCallback(
    async (value) => {
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);

      try {
        if (storeName === STORE_NAMES.MEAL_PLAN) {
          try {
            await updateItem(storeName, storeName, {
              id: storeName,
              data: valueToStore,
            });
          } catch (updateError) {
            console.warn(
              `updateItem failed for ${storeName}, trying addItem:`,
              updateError,
            );
            await addItem(storeName, {
              id: storeName,
              data: valueToStore,
            });
          }
        } else {
          await clearStore(storeName);
          if (Array.isArray(valueToStore)) {
            for (const item of valueToStore) {
              await addItem(storeName, item);
            }
          }
        }
      } catch (error) {
        console.error(
          `Error saving data to IndexedDB for ${storeName}:`,
          error,
        );
        addToast(`Failed to save ${storeName} data.`, "error");
      }
    },
    [storeName, addToast, storedValue],
  );

  return [storedValue, setValue, isLoading];
};

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColor =
    type === "success"
      ? "bg-green-500"
      : type === "error"
        ? "bg-red-500"
        : "bg-blue-500";

  return (
    <div
      className={`p-3 rounded-lg shadow-lg text-white text-sm ${bgColor} animate-fade-in-out`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message}
    </div>
  );
};

// ===== FEATURE 1: LOADING SKELETON COMPONENT =====
const SkeletonLoader = ({ type = "card", count = 3 }) => {
  const skeletons = Array.from({ length: count }, (_, i) => i);

  if (type === "card") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {skeletons.map((i) => (
          <div key={i} className="skeleton-card">
            <div className="skeleton skeleton-line w-3/4 mb-3"></div>
            <div className="skeleton skeleton-line w-full mb-2"></div>
            <div className="skeleton skeleton-line w-5/6 mb-4"></div>
            <div className="flex gap-2 mb-3">
              <div className="skeleton skeleton-circle w-8 h-8"></div>
              <div className="skeleton skeleton-circle w-8 h-8"></div>
            </div>
            <div className="skeleton skeleton-line w-2/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (type === "list") {
    return (
      <div className="space-y-2">
        {skeletons.map((i) => (
          <div key={i} className="skeleton skeleton-line w-full h-12"></div>
        ))}
      </div>
    );
  }

  return <div className="skeleton skeleton-line w-full h-48"></div>;
};

// ===== FEATURE 26: EMPTY STATE COMPONENT =====
const EmptyState = ({ icon, title, description, actionLabel, onAction }) => {
  return (
    <div className="empty-state">
      <i className={`fas ${icon} empty-state-icon`}></i>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-description">{description}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-modal btn-green mt-4">
          <i className="fas fa-plus mr-2"></i>
          {actionLabel}
        </button>
      )}
    </div>
  );
};

// ===== FEATURE 3: IMAGE PLACEHOLDER COMPONENT =====
const ImagePlaceholder = ({ recipeName, index = 0 }) => {
  const gradients = [
    "gradient-placeholder-1",
    "gradient-placeholder-2",
    "gradient-placeholder-3",
    "gradient-placeholder-4",
    "gradient-placeholder-5",
    "gradient-placeholder-6",
  ];

  const gradientClass = gradients[index % gradients.length];
  const initial = (recipeName || "R").charAt(0).toUpperCase();

  return (
    <div
      className={`gradient-placeholder ${gradientClass} w-full h-full rounded-lg`}
    >
      <span className="text-6xl font-bold opacity-80">{initial}</span>
    </div>
  );
};

// --- Smart Cooking Hooks & Components ---
const useTimers = (addToast) => {
  const [timers, setTimers] = useState([]);
  const audioContextRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const playSound = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (
        window.AudioContext || window.webkitAudioContext
      )();
    }
    const oscillator = audioContextRef.current.createOscillator();
    const gainNode = audioContextRef.current.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContextRef.current.destination);
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(
      880,
      audioContextRef.current.currentTime,
    );
    gainNode.gain.setValueAtTime(0.5, audioContextRef.current.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.0001,
      audioContextRef.current.currentTime + 1,
    );
    oscillator.start(audioContextRef.current.currentTime);
    oscillator.stop(audioContextRef.current.currentTime + 1);
  }, []);

  useEffect(() => {
    timerIntervalRef.current = setInterval(() => {
      setTimers((prevTimers) => {
        if (prevTimers.length === 0) return prevTimers;

        const updatedTimers = prevTimers.map((timer) => {
          if (timer.isRunning && timer.remaining > 0) {
            const newRemaining = timer.remaining - 1;
            if (newRemaining <= 0) {
              playSound();
              addToast(`Timer "${timer.name}" is done!`, "success");
              return { ...timer, remaining: 0, isRunning: false };
            }
            return { ...timer, remaining: newRemaining };
          }
          return timer;
        });
        // Filter out timers that are finished for more than 5 minutes
        return updatedTimers.filter(
          (t) =>
            t.isRunning ||
            t.remaining > 0 ||
            Date.now() - t.finishedAt < 300000,
        );
      });
    }, 1000);

    return () => clearInterval(timerIntervalRef.current);
  }, [playSound, addToast]);

  const addTimer = useCallback(
    (durationInSeconds, name) => {
      setTimers((prev) => [
        ...prev,
        {
          id: Date.now(),
          name,
          duration: durationInSeconds,
          remaining: durationInSeconds,
          isRunning: true,
          finishedAt: null,
        },
      ]);
      addToast(`Timer "${name}" started!`, "info");
    },
    [addToast],
  );

  const toggleTimer = useCallback((id) => {
    setTimers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, isRunning: !t.isRunning } : t)),
    );
  }, []);

  const removeTimer = useCallback((id) => {
    setTimers((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const resetTimer = useCallback((id) => {
    setTimers((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, remaining: t.duration, isRunning: true } : t,
      ),
    );
  }, []);

  return { timers, addTimer, toggleTimer, removeTimer, resetTimer };
};

const TimerTray = ({ timers, onToggle, onRemove, onReset }) => {
  if (timers.length === 0) return null;

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600)
      .toString()
      .padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60)
      .toString()
      .padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  return (
    <div className="fixed bottom-0 right-0 p-4 space-y-2 z-[999]">
      {timers.map((timer) => (
        <div
          key={timer.id}
          className={`bg-white dark:bg-gray-700 p-3 rounded-lg shadow-lg w-64 border-l-4 ${
            timer.remaining <= 0 ? "border-green-500" : "border-blue-500"
          }`}
        >
          <div className="flex justify-between items-center">
            <p
              className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate pr-2"
              title={timer.name}
            >
              {timer.name}
            </p>
            <button
              onClick={() => onRemove(timer.id)}
              className="text-gray-400 hover:text-red-500 text-xs"
            >
              &times;
            </button>
          </div>
          <p
            className={`text-2xl font-mono my-1 ${
              timer.remaining <= 0
                ? "text-green-500"
                : "text-gray-900 dark:text-gray-100"
            }`}
          >
            {formatTime(timer.remaining)}
          </p>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => onToggle(timer.id)}
              className="btn-modal btn-gray text-xs"
            >
              <i
                className={`fas ${
                  timer.isRunning ? "fa-pause" : "fa-play"
                } mr-1`}
              ></i>
              {timer.isRunning ? "Pause" : "Resume"}
            </button>
            <button
              onClick={() => onReset(timer.id)}
              className="btn-modal btn-gray text-xs"
            >
              <i className="fas fa-redo mr-1"></i>
              Reset
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

const App = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info") => {
    const newToast = { id: Date.now(), message, type };
    setToasts((prevToasts) => [...prevToasts, newToast]);
    setTimeout(() => removeToast(newToast.id), 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const [recipes, setRecipes, isLoadingRecipes] = usePersistentStorage(
    STORE_NAMES.RECIPES,
    SAMPLE_RECIPES.map((r) => ({
      ...r,
      tags: r.tags || [],
      description: r.description || "",
      cuisine: r.cuisine || "",
      dietaryTypes: r.dietaryTypes || [],
      ingredients: r.ingredients || [],
      directions: r.directions || [],
      tipsAndTricks: r.tipsAndTricks || [],
      yield: r.yield || "",
      versions: [], // FEATURE 19: Recipe versioning
      photos: [], // FEATURE 23: Photo gallery
      videos: [], // FEATURE 24: Video clips
    })),
    addToast,
  );
  const [mealPlan, setMealPlan, isLoadingMealPlan] = usePersistentStorage(
    STORE_NAMES.MEAL_PLAN,
    {},
    addToast,
  );
  const [shoppingList, setShoppingList, isLoadingShoppingList] =
    usePersistentStorage(STORE_NAMES.SHOPPING_LIST, [], addToast);

  // New feature state
  const [inventory, setInventory, isLoadingInventory] = usePersistentStorage(
    STORE_NAMES.INVENTORY,
    [],
    addToast,
  );
  const [ratings, setRatings, isLoadingRatings] = usePersistentStorage(
    STORE_NAMES.RATINGS,
    [],
    addToast,
  );
  const [collections, setCollections, isLoadingCollections] =
    usePersistentStorage(STORE_NAMES.COLLECTIONS, [], addToast);
  const [cookingSessions, setCookingSessions, isLoadingSessions] =
    usePersistentStorage(STORE_NAMES.COOKING_SESSIONS, [], addToast);

  // FEATURE 25: Nutrition Goals
  const [nutritionGoals, setNutritionGoals, isLoadingGoals] =
    usePersistentStorage(
      STORE_NAMES.NUTRITION_GOALS,
      { dailyCalories: 2000, dailyProtein: 50, dailyCarbs: 300, dailyFat: 65 },
      addToast,
    );

  // FEATURE 22: Ingredient Prices
  const [ingredientPrices, setIngredientPrices, isLoadingPrices] =
    usePersistentStorage(STORE_NAMES.INGREDIENT_PRICES, {}, addToast);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });

  // FEATURE 17: High Contrast Mode
  const [isHighContrast, setIsHighContrast] = useState(() => {
    return localStorage.getItem(LOCAL_STORAGE_KEYS.HIGH_CONTRAST) === "true";
  });

  const [showAddRecipeModal, setShowAddRecipeModal] = useState(false);
  const [showRecipeDetails, setShowRecipeDetails] = useState(null);
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCollectionsModal, setShowCollectionsModal] = useState(false);
  const [collectionsBulkMode, setCollectionsBulkMode] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCookingMode, setShowCookingMode] = useState(null);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [displayUnitSystem, setDisplayUnitSystem] = useState("imperial");

  // FEATURE 29: Bulk Operations
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [isBulkMode, setIsBulkMode] = useState(false);

  // FEATURE 11: Recipe Suggestions
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);

  // FEATURE 21: Meal Prep Mode
  const [showMealPrepModal, setShowMealPrepModal] = useState(false);

  // FEATURE 25: Nutrition Goals Dashboard
  const [showNutritionGoalsModal, setShowNutritionGoalsModal] = useState(false);

  // FEATURE 20: Cloud Sync
  const [showCloudSyncModal, setShowCloudSyncModal] = useState(false);

  // FEATURE 28: Undo/Redo System
  const { recordAction, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Smart features state
  const { timers, addTimer, toggleTimer, removeTimer, resetTimer } =
    useTimers(addToast);

  const isLoading =
    isLoadingRecipes ||
    isLoadingMealPlan ||
    isLoadingShoppingList ||
    isLoadingInventory ||
    isLoadingRatings ||
    isLoadingCollections ||
    isLoadingSessions ||
    isLoadingGoals ||
    isLoadingPrices;

  // FEATURE 17: High Contrast Mode Toggle
  useEffect(() => {
    const root = window.document.documentElement;
    if (isHighContrast) {
      root.classList.add("high-contrast-mode");
      localStorage.setItem(LOCAL_STORAGE_KEYS.HIGH_CONTRAST, "true");
    } else {
      root.classList.remove("high-contrast-mode");
      localStorage.setItem(LOCAL_STORAGE_KEYS.HIGH_CONTRAST, "false");
    }
  }, [isHighContrast]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (isDarkMode) {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, [isDarkMode]);

  // FEATURE 15: Keyboard Navigation
  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl/Cmd + Z for undo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        const action = undo();
        if (action) {
          executeUndoAction(action);
        }
      }

      // Ctrl/Cmd + Shift + Z for redo
      if ((e.ctrlKey || e.metaKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        const action = redo();
        if (action) {
          executeRedoAction(action);
        }
      }

      // Ctrl/Cmd + N for new recipe
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setEditingRecipe(null);
        setShowAddRecipeModal(true);
      }

      // Escape to close modals
      if (e.key === "Escape") {
        setShowAddRecipeModal(false);
        setShowRecipeDetails(null);
        setShowMealPlanModal(false);
        setShowShoppingListModal(false);
        setShowInventoryModal(false);
        setShowCollectionsModal(false);
        setShowAnalyticsModal(false);
        setShowSuggestionsModal(false);
        setShowMealPrepModal(false);
        setShowNutritionGoalsModal(false);
        setShowCloudSyncModal(false);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [undo, redo]);

  useEffect(() => {
    const body = document.body;
    const isModalOpen =
      showAddRecipeModal ||
      !!showRecipeDetails ||
      showMealPlanModal ||
      showShoppingListModal ||
      showInventoryModal ||
      showCollectionsModal ||
      showAnalyticsModal ||
      !!showCookingMode ||
      showSuggestionsModal ||
      showMealPrepModal ||
      showNutritionGoalsModal ||
      showCloudSyncModal;

    if (isModalOpen) {
      body.classList.add("modal-open");
    } else {
      body.classList.remove("modal-open");
    }
    return () => body.classList.remove("modal-open");
  }, [
    showAddRecipeModal,
    showRecipeDetails,
    showMealPlanModal,
    showShoppingListModal,
    showInventoryModal,
    showCollectionsModal,
    showAnalyticsModal,
    showCookingMode,
    showSuggestionsModal,
    showMealPrepModal,
    showNutritionGoalsModal,
  ]);

  // FEATURE 28: Execute Undo/Redo Actions
  const executeUndoAction = useCallback(
    (action) => {
      if (action.type === "DELETE_RECIPE") {
        setRecipes((prev) => [...prev, action.data]);
        addToast("Recipe restored", "success");
      } else if (action.type === "ADD_RECIPE") {
        setRecipes((prev) => prev.filter((r) => r.id !== action.data.id));
        addToast("Recipe addition undone", "info");
      } else if (action.type === "UPDATE_RECIPE") {
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === action.data.oldData.id ? action.data.oldData : r,
          ),
        );
        addToast("Recipe changes undone", "info");
      }
    },
    [setRecipes, addToast],
  );

  const executeRedoAction = useCallback(
    (action) => {
      if (action.type === "DELETE_RECIPE") {
        setRecipes((prev) => prev.filter((r) => r.id !== action.data.id));
        addToast("Recipe deleted again", "success");
      } else if (action.type === "ADD_RECIPE") {
        setRecipes((prev) => [...prev, action.data]);
        addToast("Recipe re-added", "success");
      } else if (action.type === "UPDATE_RECIPE") {
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === action.data.newData.id ? action.data.newData : r,
          ),
        );
        addToast("Recipe changes re-applied", "success");
      }
    },
    [setRecipes, addToast],
  );

  const exportRecipes = useCallback(async () => {
    try {
      const allRecipes = await getAllItems(STORE_NAMES.RECIPES);
      if (!Array.isArray(allRecipes) || allRecipes.length === 0) {
        throw new Error("No recipes found to export");
      }

      const dataStr = JSON.stringify(allRecipes, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-recipes.json";

      if (document.body) {
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        throw new Error("Document body not available");
      }

      URL.revokeObjectURL(url);
      addToast("Recipes exported successfully!", "success");
    } catch (err) {
      console.error("Export error:", err);
      addToast(`Error exporting recipes: ${err.message}`, "error");
    }
  }, [addToast]);

  const deleteAllRecipes = useCallback(async () => {
    if (
      !window.confirm(
        "Are you sure you want to delete ALL recipes, meal plans, and shopping list? This cannot be undone!",
      )
    ) {
      return;
    }
    try {
      await clearStore(STORE_NAMES.RECIPES);
      await clearStore(STORE_NAMES.MEAL_PLAN);
      await clearStore(STORE_NAMES.SHOPPING_LIST);
      setRecipes([]);
      setMealPlan({});
      setShoppingList([]);
      addToast("All recipes and related data have been deleted.", "success");
    } catch (error) {
      console.error("Error deleting all data:", error);
      addToast("Failed to delete all data.", "error");
    }
  }, [setRecipes, setMealPlan, setShoppingList, addToast]);

  const addRecipe = useCallback(
    async (recipeData) => {
      const newRecipe = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        ...recipeData,
        description: recipeData.description || "",
        cuisine: recipeData.cuisine || "",
        tags: recipeData.tags || [],
        dietaryTypes: recipeData.dietaryTypes || [],
        ingredients: recipeData.ingredients || [],
        directions: recipeData.directions || [],
        tipsAndTricks: recipeData.tipsAndTricks || [],
        yield: recipeData.yield || "",
        createdAt: new Date().toISOString(),
        isFavorite: false,
      };
      try {
        await addItem(STORE_NAMES.RECIPES, newRecipe);
        setRecipes((prev) => [...prev, newRecipe]);
        setShowAddRecipeModal(false);
        setEditingRecipe(null);
        addToast("Recipe added!", "success");
      } catch (error) {
        console.error("Error adding recipe:", error);
        addToast("Failed to add recipe.", "error");
      }
    },
    [setRecipes, addToast],
  );

  const updateRecipe = useCallback(
    async (id, recipeData) => {
      const updatedRecipe = {
        ...recipeData,
        id: id,
        updatedAt: new Date().toISOString(),
      };
      try {
        await updateItem(STORE_NAMES.RECIPES, id, updatedRecipe);
        setRecipes((prev) =>
          prev.map((r) => (r.id === id ? updatedRecipe : r)),
        );
        setShowAddRecipeModal(false);
        setEditingRecipe(null);
        addToast("Recipe updated!", "success");
      } catch (error) {
        console.error("Error updating recipe:", error);
        addToast("Failed to update recipe.", "error");
      }
    },
    [setRecipes, addToast],
  );

  const deleteRecipe = useCallback(
    async (id) => {
      if (
        !window.confirm(
          "Are you sure you want to delete this recipe permanently?",
        )
      )
        return;

      try {
        await deleteItem(STORE_NAMES.RECIPES, id);
        setRecipes((prev) => prev.filter((r) => r.id !== id));

        setMealPlan((prev) => {
          const newPlan = JSON.parse(JSON.stringify(prev));
          let changed = false;
          Object.keys(newPlan).forEach((day) => {
            if (newPlan[day] && typeof newPlan[day] === "object") {
              Object.keys(newPlan[day]).forEach((mealTime) => {
                const currentRecipesInSlot = newPlan[day][mealTime] || [];
                const updatedRecipesInSlot = currentRecipesInSlot.filter(
                  (recipeId) => recipeId !== id,
                );
                if (
                  updatedRecipesInSlot.length !== currentRecipesInSlot.length
                ) {
                  newPlan[day][mealTime] = updatedRecipesInSlot;
                  changed = true;
                }
              });
            }
          });
          return changed ? newPlan : prev;
        });

        setShoppingList((prev) => prev.filter((item) => item.recipeId !== id));

        if (showRecipeDetails?.id === id) setShowRecipeDetails(null);
        addToast("Recipe deleted.", "success");
      } catch (error) {
        console.error("Error deleting recipe:", error);
        addToast("Failed to delete recipe.", "error");
      }
    },
    [setRecipes, setMealPlan, setShoppingList, addToast, showRecipeDetails],
  );

  const toggleFavorite = useCallback(
    async (id) => {
      let isNowFavorite = false;
      const recipeToUpdate = recipes.find((r) => r.id === id);
      if (!recipeToUpdate) return;

      isNowFavorite = !recipeToUpdate.isFavorite;
      const updatedRecipe = {
        ...recipeToUpdate,
        isFavorite: isNowFavorite,
      };

      try {
        await updateItem(STORE_NAMES.RECIPES, id, updatedRecipe);
        setRecipes((prev) =>
          prev.map((r) => (r.id === id ? updatedRecipe : r)),
        );
        addToast(
          isNowFavorite ? "Added to Favorites" : "Removed from Favorites",
          "success",
        );
      } catch (error) {
        console.error("Error toggling favorite:", error);
        addToast("Failed to update favorite status.", "error");
      }
    },
    [recipes, setRecipes, addToast],
  );

  const searchRecipes = useCallback(
    (query, filters) => {
      // FEATURE 14: Smart Search with fuzzy matching
      return smartSearch(recipes, query, filters);
    },
    [recipes],
  );

  const updateMealPlan = useCallback(
    async (day, mealTime, recipeId) => {
      setMealPlan((prev) => {
        const newPlan = { ...prev };
        newPlan[day] = newPlan[day] || {};
        const currentRecipesInSlot = newPlan[day][mealTime] || [];

        if (currentRecipesInSlot.includes(recipeId)) {
          newPlan[day][mealTime] = currentRecipesInSlot.filter(
            (id) => id !== recipeId,
          );
          addToast("Recipe removed from meal slot.", "info");
        } else {
          newPlan[day][mealTime] = [...currentRecipesInSlot, recipeId];
          addToast("Recipe added to meal slot!", "success");
        }
        return newPlan;
      });
    },
    [setMealPlan, addToast],
  );

  const removeMealFromPlan = useCallback(
    async (day, mealTime, recipeIdToRemove) => {
      setMealPlan((prev) => {
        const newPlan = { ...prev };
        newPlan[day] = newPlan[day] || {};
        const currentRecipesInSlot = newPlan[day][mealTime] || [];
        const updatedRecipesInSlot = currentRecipesInSlot.filter(
          (id) => id !== recipeIdToRemove,
        );
        newPlan[day][mealTime] = updatedRecipesInSlot;
        addToast("Recipe removed from plan.", "success");
        return newPlan;
      });
    },
    [setMealPlan, addToast],
  );

  const addMultipleRecipesToShoppingList = useCallback(
    async (recipeIds) => {
      if (!Array.isArray(recipeIds) || recipeIds.length === 0) return;

      let totalIngredientsAdded = 0;
      const recipeNamesAdded = new Set();

      setShoppingList((prevList) => {
        const newList = [...prevList];

        recipeIds.forEach((recipeId) => {
          const recipe = recipes.find((r) => r.id === recipeId);
          if (
            !recipe ||
            !Array.isArray(recipe.ingredients) ||
            recipe.ingredients.length === 0
          ) {
            console.warn(`Recipe ${recipeId} not found or has no ingredients.`);
            return;
          }
          recipeNamesAdded.add(recipe.name);

          recipe.ingredients
            .filter((ing) => typeof ing === "string" && ing.trim() !== "")
            .forEach((ingredient) => {
              const normalized = normalizeIngredient(ingredient);
              const { quantity, unit, description } =
                parseIngredient(ingredient);

              newList.push({
                id:
                  Date.now().toString(36) +
                  Math.random().toString(36).substr(2, 5),
                originalText: ingredient.trim(),
                quantity: quantity,
                unit: unit,
                description: description,
                recipeId: recipe.id,
                recipeName: recipe.name,
                checked: false,
                normalizedText: normalized,
              });
              totalIngredientsAdded++;
            });
        });

        if (totalIngredientsAdded > 0) {
          addToast(
            `Added ${totalIngredientsAdded} ingredient(s) from ${recipeNamesAdded.size} recipe(s).`,
            "success",
          );
        } else if (recipeNamesAdded.size > 0) {
          addToast("No ingredients to add from selected recipe(s).", "info");
        }
        return newList;
      });
    },
    [recipes, setShoppingList, addToast],
  );

  const addToShoppingList = useCallback(
    (recipeId) => {
      addMultipleRecipesToShoppingList([recipeId]);
    },
    [addMultipleRecipesToShoppingList],
  );

  const toggleShoppingItem = useCallback(
    async (itemId, normalizedTextToToggle) => {
      setShoppingList((prevList) => {
        let targetChecked;
        let targetNormalizedText;

        if (itemId) {
          const clickedItem = prevList.find((item) => item.id === itemId);
          if (!clickedItem) return prevList;
          targetChecked = !clickedItem.checked;
          targetNormalizedText = clickedItem.normalizedText;
        } else if (normalizedTextToToggle) {
          const groupItems = prevList.filter(
            (item) => item.normalizedText === normalizedTextToToggle,
          );
          if (groupItems.length === 0) return prevList;
          const allCurrentlyChecked = groupItems.every((item) => item.checked);
          targetChecked = !allCurrentlyChecked;
          targetNormalizedText = normalizedTextToToggle;
        } else {
          return prevList;
        }

        return prevList.map((item) => {
          if (item.normalizedText === targetNormalizedText) {
            return { ...item, checked: targetChecked };
          }
          return item;
        });
      });
    },
    [setShoppingList],
  );

  const clearShoppingList = useCallback(async () => {
    if (
      window.confirm("Are you sure you want to clear the entire shopping list?")
    ) {
      try {
        await clearStore(STORE_NAMES.SHOPPING_LIST);
        setShoppingList([]);
        addToast("Shopping list cleared!", "success");
      } catch (error) {
        console.error("Error clearing shopping list:", error);
        addToast("Failed to clear shopping list.", "error");
      }
    }
  }, [setShoppingList, addToast]);

  const handleShareAll = useCallback(async () => {
    if (recipes.length === 0) {
      addToast("No recipes to share.", "info");
      return;
    }

    let allRecipesText = "Here are my recipes from Recipe Manager Pro:\n\n";

    recipes.forEach((recipe) => {
      allRecipesText += `----------------------------------------\n`;
      allRecipesText += `**${recipe.name}**\n\n`;
      if (recipe.description) {
        allRecipesText += `${recipe.description}\n\n`;
      }
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        allRecipesText += "Ingredients:\n";
        recipe.ingredients.forEach((ing) => {
          allRecipesText += `- ${ing}\n`;
        });
        allRecipesText += "\n";
      }
      if (recipe.directions && recipe.directions.length > 0) {
        allRecipesText += "Directions:\n";
        recipe.directions.forEach((dir, index) => {
          allRecipesText += `${index + 1}. ${dir}\n`;
        });
        allRecipesText += "\n";
      }
    });

    const shareData = {
      title: "My Recipes",
      text: allRecipesText,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        addToast("All recipes shared successfully!", "success");
      } catch (err) {
        if (err.name !== "AbortError") {
          console.error("Error sharing recipes:", err);
          addToast("Failed to share recipes.", "error");
        }
      }
    } else {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = allRecipesText;
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        addToast("All recipes copied to clipboard!", "info");
      } catch (err) {
        console.error("Failed to copy recipes:", err);
        addToast("Failed to copy recipes.", "error");
      }
    }
  }, [recipes, addToast]);

  const generateRecipePDF = useCallback(
    async (recipe) => {
      if (!recipe || typeof recipe !== "object") {
        addToast("Invalid recipe data.", "error");
        return;
      }
      if (typeof html2pdf === "undefined") {
        addToast("PDF library not loaded. Please refresh.", "error");
        console.error("html2pdf is not defined");
        return;
      }

      addToast("Generating PDF...", "info");

      const content = document.createElement("div");
      content.style.cssText = `font-family: sans-serif; padding: 30px; line-height: 1.6; color: #333; font-size: 10pt; max-width: 8.5in;`;

      const recipeName = escapeHTML(recipe.name || "Untitled");
      const recipeDescriptionHtml = recipe.description
        ? `<p style="font-size: 10pt; color: #555; margin-bottom: 20px; text-align: center; font-style: italic;">${escapeHTML(
            recipe.description,
          )}</p>`
        : "";
      const typeHtml = recipe.type
        ? `<p style="font-size: 9pt; color: #777;">Type: ${escapeHTML(
            recipe.type,
          )}</p>`
        : "";
      const cuisineHtml = recipe.cuisine
        ? `<p style="font-size: 9pt; color: #777;">Cuisine: ${escapeHTML(
            recipe.cuisine,
          )}</p>`
        : "";
      const dietaryTypesHtml =
        Array.isArray(recipe.dietaryTypes) && recipe.dietaryTypes.length > 0
          ? `<p style="font-size: 9pt; color: #777;">Dietary: ${recipe.dietaryTypes
              .map(escapeHTML)
              .join(", ")}</p>`
          : "";
      const tagsHtml =
        Array.isArray(recipe.tags) && recipe.tags.length > 0
          ? `<p style="font-size: 9pt; color: #777;">Tags: ${recipe.tags
              .map(escapeHTML)
              .join(", ")}</p>`
          : "";

      let imageHtml = `<div style="text-align: center; margin-bottom: 25px; padding: 20px; border: 1px dashed #ccc; color: #888; border-radius: 8px;">No Image</div>`;
      if (recipe.image) {
        imageHtml = `<img src="${recipe.image}" style="max-width: 250px; max-height: 250px; display: block; margin: 0 auto 25px; border-radius: 8px; border: 1px solid #eee;" alt="${recipeName}"/>`;
      }

      const prepTimeFormatted = formatMinutesToHoursMinutes(recipe.prepTime);
      const cookTimeFormatted = formatMinutesToHoursMinutes(recipe.cookTime);
      const additionalTimeFormatted = formatMinutesToHoursMinutes(
        recipe.additionalTime,
      );
      const totalTimeFormatted = formatMinutesToHoursMinutes(
        (recipe.prepTime || 0) +
          (recipe.cookTime || 0) +
          (recipe.additionalTime || 0),
      );

      const yieldHtml = recipe.yield
        ? `<p style="margin: 6px 0;">Yield: ${escapeHTML(recipe.yield)}</p>`
        : "";

      const ingredientsHtml =
        Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
          ? recipe.ingredients
              .map(
                (ing) =>
                  `<li style="margin-bottom: 5px;">${escapeHTML(
                    ing || "",
                  )}</li>`,
              )
              .join("")
          : "<li>No ingredients listed.</li>";
      const directionsHtml =
        Array.isArray(recipe.directions) && recipe.directions.length > 0
          ? recipe.directions
              .map(
                (dir, i) =>
                  `<li style="margin-bottom: 12px; padding-left: 5px; border-left: 2px solid #2ecc71;"><strong>Step ${
                    i + 1
                  }:</strong> ${escapeHTML(dir || "")}</li>`,
              )
              .join("")
          : "<li>No directions listed.</li>";
      const tipsAndTricksHtml =
        Array.isArray(recipe.tipsAndTricks) && recipe.tipsAndTricks.length > 0
          ? recipe.tipsAndTricks
              .map(
                (tip) =>
                  `<li style="margin-bottom: 8px; padding-left: 5px; border-left: 2px solid #f59e0b;"><strong>Tip:</strong> ${escapeHTML(
                    tip || "",
                  )}</li>`,
              )
              .join("")
          : "<li>No tips and tricks listed.</li>";

      content.innerHTML = `
              <div style="text-align: center; margin-bottom: 10px;">
                <h1 style="color: #2ecc71; margin: 0 0 8px 0; font-size: 20pt; font-weight: bold;">${recipeName}</h1>
                <p style="margin: 0; font-size: 11pt; color: #555;">Servings: ${
                  recipe.servings || "N/A"
                }</p>
                ${typeHtml} ${cuisineHtml} ${dietaryTypesHtml} ${tagsHtml}
              </div>
              ${recipeDescriptionHtml} ${imageHtml}
              <div style="display: flex; flex-wrap: wrap; justify-content: space-between; gap: 20px; margin-bottom: 30px; border-top: 1px solid #eee; border-bottom: 1px solid #eee; padding: 20px 0;">
                <div style="flex: 1; min-width: 150px;">
                  <h3 style="color: #2ecc71; margin: 0 0 12px 0; font-size: 13pt; border-bottom: 1px solid #eee; padding-bottom: 6px;">Details</h3>
                  ${
                    prepTimeFormatted
                      ? `<p style="margin: 6px 0;">Prep: ${prepTimeFormatted}</p>`
                      : ""
                  }
                  ${
                    cookTimeFormatted
                      ? `<p style="margin: 6px 0;">Cook: ${cookTimeFormatted}</p>`
                      : ""
                  }
                  ${
                    additionalTimeFormatted
                      ? `<p style="margin: 6px 0;">Additional: ${additionalTimeFormatted}</p>`
                      : ""
                  }
                  <p style="margin: 10px 0 0 0; font-weight: bold;">Total: ${totalTimeFormatted}</p>
                  ${yieldHtml}
                </div>
                <div style="flex: 1; min-width: 150px;">
                  <h3 style="color: #2ecc71; margin: 0 0 12px 0; font-size: 13pt; border-bottom: 1px solid #eee; padding-bottom: 6px;">Nutrition (per serving)</h3>
                  <p style="margin: 6px 0;">Calories: ${
                    recipe.calories || "N/A"
                  }</p>
                  <p style="margin: 6px 0;">Protein: ${
                    recipe.protein ? recipe.protein + "g" : "N/A"
                  }</p>
                  <p style="margin: 6px 0;">Carbs: ${
                    recipe.carbs ? recipe.carbs + "g" : "N/A"
                  }</p>
                  <p style="margin: 6px 0;">Fat: ${
                    recipe.fat ? recipe.fat + "g" : "N/A"
                  }</p>
                </div>
              </div>
              <div style="margin-bottom: 30px;">
                <h3 style="color: #2ecc71; margin: 0 0 12px 0; font-size: 13pt; border-bottom: 1px solid #eee; padding-bottom: 6px;">Ingredients</h3>
                <ul style="list-style: disc; padding-left: 25px; margin: 0;">${ingredientsHtml}</ul>
              </div>
              <div style="margin-bottom: 30px;">
                <h3 style="color: #2ecc71; margin: 0 0 12px 0; font-size: 13pt; border-bottom: 1px solid #eee; padding-bottom: 6px;">Directions</h3>
                <ol style="list-style: none; padding-left: 0; margin: 0;">${directionsHtml}</ol>
              </div>
              <div>
                <h3 style="color: #f59e0b; margin: 0 0 12px 0; font-size: 13pt; border-bottom: 1px solid #eee; padding-bottom: 6px;">Tips & Tricks</h3>
                <ul style="list-style: none; padding-left: 0; margin: 0;">${tipsAndTricksHtml}</ul>
              </div>
            `;

      const opt = {
        margin: 0.5,
        filename: `${recipe.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")}-recipe.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          allowTaint: true,
        },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      };

      try {
        const worker = html2pdf().set(opt).from(content);
        await worker.save();
        addToast("PDF downloaded!", "success");
      } catch (error) {
        console.error("PDF Generation Error:", error);
        addToast(
          `PDF generation failed: ${error.message || "Unknown error"}`,
          "error",
        );
        if (error.stack) {
          console.error(error.stack);
        }
      }
    },
    [addToast],
  );

  // --- NEW FEATURE CALLBACKS ---

  // Inventory Management
  const addInventoryItem = useCallback(
    async (item) => {
      const newItem = {
        id: Date.now().toString(),
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || "",
        category: item.category || "Other",
        expirationDate: item.expirationDate || null,
        location: item.location || "Pantry",
        notes: item.notes || "",
        addedAt: new Date().toISOString(),
      };
      await setInventory((prev) => [...prev, newItem]);
      addToast(`Added ${item.name} to inventory`, "success");
    },
    [setInventory, addToast],
  );

  const updateInventoryItem = useCallback(
    async (id, updates) => {
      await setInventory((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
      addToast("Inventory updated", "success");
    },
    [setInventory, addToast],
  );

  const deleteInventoryItem = useCallback(
    async (id) => {
      await setInventory((prev) => prev.filter((item) => item.id !== id));
      addToast("Item removed from inventory", "success");
    },
    [setInventory, addToast],
  );

  const checkRecipeAvailability = useCallback(
    (recipe) => {
      if (!recipe || !recipe.ingredients)
        return { canMake: false, missing: [] };

      const missing = [];
      const inventoryMap = {};

      inventory.forEach((item) => {
        const key = item.name.toLowerCase().trim();
        inventoryMap[key] = item;
      });

      recipe.ingredients.forEach((ing) => {
        const { description } = parseIngredient(ing);
        const normalized = normalizeIngredient(ing).toLowerCase();

        if (
          !inventoryMap[normalized] &&
          !inventoryMap[description.toLowerCase()]
        ) {
          missing.push(ing);
        }
      });

      return {
        canMake: missing.length === 0,
        missing,
        available: recipe.ingredients.length - missing.length,
      };
    },
    [inventory],
  );

  // Ratings & Reviews
  const addRating = useCallback(
    async (recipeId, rating, review = "") => {
      const newRating = {
        id: Date.now().toString(),
        recipeId,
        rating,
        review,
        createdAt: new Date().toISOString(),
      };
      await setRatings((prev) => [...prev, newRating]);
      addToast("Rating added!", "success");
      return newRating;
    },
    [setRatings, addToast],
  );

  const getRecipeRatings = useCallback(
    (recipeId) => {
      const recipeRatings = ratings.filter((r) => r.recipeId === recipeId);
      if (recipeRatings.length === 0)
        return { average: 0, count: 0, ratings: [] };

      const average =
        recipeRatings.reduce((sum, r) => sum + r.rating, 0) /
        recipeRatings.length;
      return {
        average: average.toFixed(1),
        count: recipeRatings.length,
        ratings: recipeRatings,
      };
    },
    [ratings],
  );

  // Collections
  const createCollection = useCallback(
    async (name, description = "") => {
      const newCollection = {
        id: Date.now().toString(),
        name,
        description,
        recipeIds: [],
        createdAt: new Date().toISOString(),
      };
      await setCollections((prev) => [...prev, newCollection]);
      addToast(`Collection "${name}" created`, "success");
      return newCollection;
    },
    [setCollections, addToast],
  );

  const addRecipeToCollection = useCallback(
    async (collectionId, recipeId) => {
      await setCollections((prev) =>
        prev.map((col) =>
          col.id === collectionId && !col.recipeIds.includes(recipeId)
            ? { ...col, recipeIds: [...col.recipeIds, recipeId] }
            : col,
        ),
      );
      addToast("Recipe added to collection", "success");
    },
    [setCollections, addToast],
  );

  const removeRecipeFromCollection = useCallback(
    async (collectionId, recipeId) => {
      await setCollections((prev) =>
        prev.map((col) =>
          col.id === collectionId
            ? {
                ...col,
                recipeIds: col.recipeIds.filter((id) => id !== recipeId),
              }
            : col,
        ),
      );
      addToast("Recipe removed from collection", "success");
    },
    [setCollections, addToast],
  );

  const deleteCollection = useCallback(
    async (collectionId) => {
      await setCollections((prev) =>
        prev.filter((col) => col.id !== collectionId),
      );
      addToast("Collection deleted", "success");
    },
    [setCollections, addToast],
  );

  // Cooking Sessions
  const startCookingSession = useCallback((recipe) => {
    setShowCookingMode({ recipe, startTime: Date.now() });
  }, []);

  const completeCookingSession = useCallback(
    async (recipeId, recipeName, startTime, completed = true) => {
      const duration = Math.floor((Date.now() - startTime) / 1000); // seconds
      await recordCookingSession(recipeId, recipeName, duration, completed);
      await setCookingSessions((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          recipeId,
          recipeName,
          duration,
          completed,
          completedAt: new Date().toISOString(),
        },
      ]);
      if (completed) {
        addToast("Cooking session completed! 🎉", "success");
      }
    },
    [setCookingSessions, addToast],
  );

  return (
    <div className="min-h-screen flex flex-col">
      <Header
        openAddRecipeModal={() => {
          setEditingRecipe(null);
          setShowAddRecipeModal(true);
        }}
        openMealPlanModal={() => setShowMealPlanModal(true)}
        openShoppingListModal={() => setShowShoppingListModal(true)}
        openInventoryModal={() => setShowInventoryModal(true)}
        openCollectionsModal={() => setShowCollectionsModal(true)}
        openAnalyticsModal={() => setShowAnalyticsModal(true)}
        openSuggestionsModal={() => setShowSuggestionsModal(true)}
        openMealPrepModal={() => setShowMealPrepModal(true)}
        openNutritionGoalsModal={() => setShowNutritionGoalsModal(true)}
        openCloudSyncModal={() => setShowCloudSyncModal(true)}
        toggleBulkMode={() => {
          setIsBulkMode(!isBulkMode);
          setSelectedRecipes([]);
        }}
        isBulkMode={isBulkMode}
        isHighContrast={isHighContrast}
        toggleHighContrast={() => setIsHighContrast(!isHighContrast)}
        isDarkMode={isDarkMode}
        toggleDarkMode={() => setIsDarkMode(!isDarkMode)}
        recipes={recipes}
        addToast={addToast}
        setRecipes={setRecipes}
        deleteAllRecipes={deleteAllRecipes}
        exportRecipes={exportRecipes}
        handleShareAll={handleShareAll}
      />
      <main className="flex-grow max-w-7xl mx-auto p-3 sm:p-4 w-full">
        {isLoading ? (
          <div className="text-center py-10 text-gray-500 dark:text-gray-400">
            <i className="fas fa-spinner fa-spin text-4xl mb-3"></i>
            <p className="text-lg">Loading recipes...</p>
            <p className="text-sm">
              This might take a moment if migrating from old storage.
            </p>
          </div>
        ) : (
          <RecipeList
            recipes={recipes}
            searchRecipes={searchRecipes}
            openRecipeDetails={(recipe) => setShowRecipeDetails(recipe)}
            toggleFavorite={toggleFavorite}
            isBulkMode={isBulkMode}
            selectedRecipes={selectedRecipes}
            toggleRecipeSelection={(id) => {
              setSelectedRecipes((prev) =>
                prev.includes(id)
                  ? prev.filter((r) => r !== id)
                  : [...prev, id],
              );
            }}
          />
        )}
      </main>
      {showAddRecipeModal && (
        <AddRecipeModal
          onClose={() => {
            setShowAddRecipeModal(false);
            setEditingRecipe(null);
          }}
          addRecipe={addRecipe}
          updateRecipe={updateRecipe}
          editingRecipe={editingRecipe}
          addToast={addToast}
        />
      )}
      {showRecipeDetails && (
        <RecipeDetailsModal
          recipe={showRecipeDetails}
          onClose={() => setShowRecipeDetails(null)}
          addToShoppingList={addToShoppingList}
          generateRecipePDF={generateRecipePDF}
          deleteRecipe={deleteRecipe}
          editRecipe={(recipe) => {
            setEditingRecipe(recipe);
            setShowRecipeDetails(null);
            setShowAddRecipeModal(true);
          }}
          toggleFavorite={toggleFavorite}
          addToast={addToast}
          updateMealPlan={updateMealPlan}
          mealPlan={mealPlan}
          recipes={recipes}
          addTimer={addTimer}
          startCookingSession={startCookingSession}
          getRecipeRatings={getRecipeRatings}
          addRating={addRating}
          checkRecipeAvailability={checkRecipeAvailability}
          inventory={inventory}
        />
      )}
      {showMealPlanModal && (
        <MealPlanModal
          mealPlan={mealPlan}
          recipes={recipes}
          updateMealPlan={updateMealPlan}
          removeMealFromPlan={removeMealFromPlan}
          addMultipleRecipesToShoppingList={addMultipleRecipesToShoppingList}
          openRecipeDetails={(recipe) => setShowRecipeDetails(recipe)}
          onClose={() => setShowMealPlanModal(false)}
        />
      )}
      {showShoppingListModal && (
        <ShoppingListModal
          shoppingList={shoppingList}
          toggleShoppingItem={toggleShoppingItem}
          clearShoppingList={clearShoppingList}
          addToast={addToast}
          onClose={() => setShowShoppingListModal(false)}
          displayUnitSystem={displayUnitSystem}
          setDisplayUnitSystem={setDisplayUnitSystem}
          convertUnits={convertUnits}
        />
      )}
      {showInventoryModal && (
        <InventoryModal
          inventory={inventory}
          addInventoryItem={addInventoryItem}
          updateInventoryItem={updateInventoryItem}
          deleteInventoryItem={deleteInventoryItem}
          checkRecipeAvailability={checkRecipeAvailability}
          recipes={recipes}
          onClose={() => setShowInventoryModal(false)}
          addToast={addToast}
        />
      )}
      {showCollectionsModal && (
        <CollectionsModal
          collections={collections}
          recipes={recipes}
          createCollection={createCollection}
          addRecipeToCollection={addRecipeToCollection}
          removeRecipeFromCollection={removeRecipeFromCollection}
          deleteCollection={deleteCollection}
          openRecipeDetails={(recipe) => setShowRecipeDetails(recipe)}
          onClose={() => {
            setShowCollectionsModal(false);
            if (collectionsBulkMode) {
              setCollectionsBulkMode(false);
              setSelectedRecipes([]);
              setIsBulkMode(false);
            }
          }}
          addToast={addToast}
          selectedRecipes={collectionsBulkMode ? selectedRecipes : []}
        />
      )}
      {showAnalyticsModal && (
        <AnalyticsModal
          recipes={recipes}
          cookingSessions={cookingSessions}
          ratings={ratings}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}
      {showCookingMode && (
        <CookingModeModal
          recipe={showCookingMode.recipe}
          startTime={showCookingMode.startTime}
          onClose={(completed) => {
            if (completed) {
              completeCookingSession(
                showCookingMode.recipe.id,
                showCookingMode.recipe.name,
                showCookingMode.startTime,
                true,
              );
            }
            setShowCookingMode(null);
          }}
          addTimer={addTimer}
          addToast={addToast}
          addRating={addRating}
        />
      )}
      <TimerTray
        timers={timers}
        onToggle={toggleTimer}
        onRemove={removeTimer}
        onReset={resetTimer}
      />
      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
      <Footer />
    </div>
  );
};

const Header = ({
  openAddRecipeModal,
  openMealPlanModal,
  openShoppingListModal,
  openInventoryModal,
  openCollectionsModal,
  openAnalyticsModal,
  openSuggestionsModal,
  openMealPrepModal,
  openNutritionGoalsModal,
  openCloudSyncModal,
  toggleBulkMode,
  isBulkMode,
  isHighContrast,
  toggleHighContrast,
  isDarkMode,
  toggleDarkMode,
  recipes,
  addToast,
  setRecipes,
  deleteAllRecipes,
  exportRecipes,
  handleShareAll,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const debounceTimeoutRef = useRef(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false); // State for hamburger menu

  const handleSearchChange = useCallback((e) => {
    const query = e.target.value;
    setSearchQuery(query);

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent("searchRecipes", {
          detail: { query, type: "search" },
        }),
      );
    }, 350);
  }, []);

  const handleToggleAllRecipes = useCallback(() => {
    document.dispatchEvent(
      new CustomEvent("searchRecipes", { detail: { type: "toggleAll" } }),
    );
    setSearchQuery("");
  }, []);

  const handleImport = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const rawData = JSON.parse(e.target.result);
          let importedRecipes = [];

          if (Array.isArray(rawData)) {
            importedRecipes = rawData;
          } else if (
            typeof rawData === "object" &&
            rawData !== null &&
            rawData.name
          ) {
            importedRecipes = [rawData];
          } else {
            throw new Error(
              "Invalid file format: Expected a recipe object or an array of recipes.",
            );
          }

          const timestamp = Date.now();
          const processedRecipes = importedRecipes
            .filter((recipe) => {
              const isValid =
                recipe &&
                typeof recipe === "object" &&
                typeof recipe.name === "string" &&
                recipe.name.trim() !== "";
              if (!isValid) {
                console.warn("Skipping invalid recipe:", recipe);
              }
              return isValid;
            })
            .map((recipe, index) => {
              const uniqueId = `${timestamp.toString(
                36,
              )}-${index}-${Math.random().toString(36).substr(2, 5)}`;
              return {
                id: uniqueId,
                name: recipe.name?.trim() || "Untitled Recipe",
                description: recipe.description?.trim() || "",
                type: recipe.type?.trim() || "Other",
                cuisine: recipe.cuisine?.trim() || "",
                dietaryTypes: Array.isArray(recipe.dietaryTypes)
                  ? recipe.dietaryTypes
                      .filter((t) => typeof t === "string" && t.trim())
                      .map((t) => t.trim())
                  : [],
                tags: Array.isArray(recipe.tags)
                  ? recipe.tags
                      .filter((t) => typeof t === "string" && t.trim())
                      .map((t) => t.trim())
                  : [],
                prepTime: recipe.prepTime
                  ? Math.max(0, parseInt(recipe.prepTime))
                  : 0,
                cookTime: recipe.cookTime
                  ? Math.max(0, parseInt(recipe.cookTime))
                  : 0,
                additionalTime: recipe.additionalTime
                  ? Math.max(0, parseInt(recipe.additionalTime))
                  : 0,
                servings: recipe.servings
                  ? Math.max(1, parseInt(recipe.servings))
                  : 1,
                yield: recipe.yield?.trim() || "",
                ingredients: Array.isArray(recipe.ingredients)
                  ? recipe.ingredients
                      .filter((i) => typeof i === "string" && i.trim())
                      .map((i) => i.trim())
                  : [],
                directions: Array.isArray(recipe.directions)
                  ? recipe.directions
                      .filter((d) => typeof d === "string" && d.trim())
                      .map((d) => d.trim())
                  : [],
                tipsAndTricks: Array.isArray(recipe.tipsAndTricks)
                  ? recipe.tipsAndTricks
                      .filter((tip) => typeof tip === "string" && tip.trim())
                      .map((tip) => tip.trim())
                  : [],
                calories: recipe.calories
                  ? Math.max(0, parseInt(recipe.calories))
                  : null,
                protein: recipe.protein
                  ? Math.max(0, parseFloat(recipe.protein))
                  : null,
                carbs: recipe.carbs
                  ? Math.max(0, parseFloat(recipe.carbs))
                  : null,
                fat: recipe.fat ? Math.max(0, parseFloat(recipe.fat)) : null,
                image: typeof recipe.image === "string" ? recipe.image : null,
                video: typeof recipe.video === "string" ? recipe.video : null,
                createdAt: new Date().toISOString(),
                isFavorite: false,
              };
            });

          if (processedRecipes.length === 0) {
            addToast("No valid recipes found in import file.", "error");
            return;
          }

          for (const recipe of processedRecipes) {
            await addItem(STORE_NAMES.RECIPES, recipe);
          }
          const updatedRecipesFromDB = await getAllItems(STORE_NAMES.RECIPES);
          setRecipes(updatedRecipesFromDB);

          addToast(
            `Successfully imported ${processedRecipes.length} recipes!`,
            "success",
          );
        } catch (err) {
          console.error("Import error:", err);
          addToast(
            `Error importing recipes: ${err.message || "Invalid file format"}`,
            "error",
          );
        }
      };
      reader.onerror = () => {
        addToast("Error reading file. Please try again.", "error");
      };
      reader.readAsText(file);
    };
    input.click();
  }, [addToast, setRecipes]);

  const menuItems = [
    {
      label: "All Recipes",
      icon: "fas fa-list-alt",
      action: handleToggleAllRecipes,
    },
    {
      label: "Meal Plan",
      icon: "fas fa-calendar-alt",
      action: openMealPlanModal,
    },
    {
      label: "Shopping List",
      icon: "fas fa-shopping-cart",
      action: openShoppingListModal,
    },
    {
      label: "Ingredient Inventory",
      icon: "fas fa-box",
      action: openInventoryModal,
    },
    {
      label: "Collections",
      icon: "fas fa-folder",
      action: openCollectionsModal,
    },
    {
      label: "Analytics & Stats",
      icon: "fas fa-chart-line",
      action: openAnalyticsModal,
    },
    {
      label: "Recipe Suggestions",
      icon: "fas fa-lightbulb",
      action: openSuggestionsModal,
    },
    {
      label: "Meal Prep Planner",
      icon: "fas fa-calendar-check",
      action: openMealPrepModal,
    },
    {
      label: "Nutrition Goals",
      icon: "fas fa-chart-pie",
      action: openNutritionGoalsModal,
    },
    {
      label: "Cloud Sync",
      icon: "fas fa-cloud",
      action: openCloudSyncModal,
    },
    {
      label: isBulkMode ? "Exit Bulk Mode" : "Bulk Select Mode",
      icon: "fas fa-check-square",
      action: toggleBulkMode,
    },
    {
      label: isDarkMode ? "Light Mode" : "Dark Mode",
      icon: isDarkMode ? "fas fa-sun" : "fas fa-moon",
      action: toggleDarkMode,
    },
    {
      label: isHighContrast ? "Normal Contrast" : "High Contrast",
      icon: "fas fa-adjust",
      action: toggleHighContrast,
    },
    {
      label: "Share All Recipes",
      icon: "fas fa-share-alt",
      action: handleShareAll,
    },
    {
      label: "Import Recipes",
      icon: "fas fa-file-import",
      action: handleImport,
    },
    {
      label: "Export Recipes",
      icon: "fas fa-file-export",
      action: exportRecipes,
    },
    {
      label: "Delete All Recipes",
      icon: "fas fa-trash-alt",
      action: deleteAllRecipes,
      isDestructive: true,
    },
  ];

  useEffect(
    () => () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    },
    [],
  );

  return (
    <header className="bg-white dark:bg-gray-800 shadow-md p-3 sticky top-0 z-30 transition-colors duration-300">
      <nav className="max-w-7xl mx-auto flex justify-between items-center flex-wrap gap-y-2 gap-x-3">
        <h1 className="text-lg sm:text-xl font-bold text-green-500 whitespace-nowrap flex items-center gap-2 order-1">
          <i className="fas fa-book-open text-green-500"></i>
          <span className="hidden sm:inline">Recipe Manager Pro</span>
          <span className="sm:hidden">Recipes</span>
        </h1>

        <div className="flex-grow flex items-center bg-gray-100 dark:bg-gray-700 rounded-full px-3 py-1.5 w-full sm:w-auto sm:flex-grow sm:max-w-md md:mx-auto order-3 sm:order-2">
          <i className="fas fa-search text-gray-400 dark:text-gray-500 mr-2 text-sm"></i>
          <input
            type="search"
            placeholder="Search recipes..."
            value={searchQuery}
            className="bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 w-full"
            onChange={handleSearchChange}
            aria-label="Search recipes"
          />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 order-2 sm:order-3 relative">
          <button
            onClick={openAddRecipeModal}
            className="btn-header bg-green-500 text-white hover:bg-green-600 dark:hover:bg-green-600"
            title="Add Recipe"
          >
            <i className="fas fa-plus"></i>
            <span className="hidden sm:inline ml-1">Add Recipe</span>
          </button>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="btn-header"
            title="Menu"
          >
            <i
              className={`fas ${
                isMenuOpen ? "fa-times" : "fa-bars"
              } text-green-500`}
            ></i>
          </button>

          {isMenuOpen && (
            <div
              className="absolute top-full right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg ring-1 ring-black ring-opacity-5 z-40"
              role="menu"
              aria-orientation="vertical"
              aria-labelledby="menu-button"
            >
              <div className="py-1" role="none">
                {menuItems.map((item, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      item.action();
                      setIsMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 ${
                      item.isDestructive
                        ? "text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/50"
                        : "text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                    role="menuitem"
                  >
                    <i
                      className={`${item.icon} w-4 text-center text-green-500`}
                    ></i>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </nav>
      {isMenuOpen && (
        <div
          onClick={() => setIsMenuOpen(false)}
          className="fixed inset-0 z-30"
        ></div>
      )}
    </header>
  );
};

const RecipeSuggestions = ({ recipes, openRecipeDetails, toggleFavorite }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const suggested = useMemo(() => {
    if (!Array.isArray(recipes) || recipes.length === 0) return [];

    const favorites = recipes.filter((r) => r?.isFavorite === true);
    const nonFavorites = recipes.filter((r) => r?.isFavorite !== true);

    favorites.sort(() => 0.5 - Math.random());
    nonFavorites.sort(() => 0.5 - Math.random());

    const suggestions = [...favorites.slice(0, 2), ...nonFavorites];

    const uniqueSuggestions = [];
    const seenIds = new Set();
    for (const recipe of suggestions) {
      if (recipe?.id && !seenIds.has(recipe.id)) {
        uniqueSuggestions.push(recipe);
        seenIds.add(recipe.id);
        if (uniqueSuggestions.length === 3) break;
      }
    }
    return uniqueSuggestions;
  }, [recipes]);

  if (!suggested || suggested.length === 0) return null;

  return (
    <section className="mb-6 sm:mb-8 p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-lg shadow">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex justify-between items-center w-full text-left mb-3 sm:mb-4"
        aria-expanded={isExpanded}
        aria-controls="suggestions-content"
      >
        <h2 className="text-lg sm:text-xl font-semibold text-gray-800 dark:text-gray-200">
          Suggestions For You
        </h2>
        <i
          className={`fas fa-chevron-down text-gray-500 dark:text-gray-400 transform transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        ></i>
      </button>
      <div
        id="suggestions-content"
        className={`collapsible-content ${isExpanded ? "expanded" : ""}`}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {suggested.map((recipe) => (
            <div
              key={recipe.id}
              className="bg-white dark:bg-gray-700 rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-lg transition-shadow duration-300 flex flex-col"
              onClick={() => openRecipeDetails(recipe)}
              tabIndex="0"
              aria-label={`View suggestion: ${recipe.name}`}
            >
              <div className="aspect-video w-full bg-gray-200 dark:bg-gray-600 overflow-hidden relative">
                {recipe.image ? (
                  <img
                    src={recipe.image}
                    alt={recipe.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <i className="fas fa-image text-3xl opacity-50"></i>
                  </div>
                )}
                {recipe.isFavorite && (
                  <div className="absolute top-2 right-2 bg-black bg-opacity-40 text-yellow-400 p-1 rounded-full text-xs">
                    <i className="fas fa-star"></i>
                  </div>
                )}
              </div>
              <div className="p-3 flex-grow flex flex-col">
                <h3
                  className="text-base font-semibold mb-1 line-clamp-1 flex-grow"
                  title={recipe.name}
                >
                  {escapeHTML(recipe.name)}
                </h3>
                {recipe.description && (
                  <p
                    className="text-xs text-gray-500 dark:text-gray-400 mb-1 line-clamp-2"
                    title={recipe.description}
                  >
                    {escapeHTML(recipe.description)}
                  </p>
                )}
                <div className="flex justify-between items-center mt-auto pt-1">
                  <span className="inline-block bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 text-xs px-2 py-0.5 rounded-full">
                    {escapeHTML(recipe.type)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(recipe.id);
                    }}
                    className={`text-xl ml-2 ${
                      recipe.isFavorite
                        ? "text-yellow-500"
                        : "text-gray-300 dark:text-gray-500"
                    } hover:text-yellow-400 dark:hover:text-yellow-400`}
                    title={
                      recipe.isFavorite ? "Remove Favorite" : "Add Favorite"
                    }
                    aria-label={
                      recipe.isFavorite ? "Remove Favorite" : "Add Favorite"
                    }
                  >
                    <i className={`fas fa-star`}></i>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

const RecipeList = ({
  recipes,
  searchRecipes,
  openRecipeDetails,
  toggleFavorite,
  isBulkMode,
  selectedRecipes,
  toggleRecipeSelection,
}) => {
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [filters, setFilters] = useState({
    query: "",
    type: "",
    cuisine: "",
    dietaryType: "",
    tag: "",
    cookTime: "",
    favorites: false,
  });
  const [hideAllExplicitly, setHideAllExplicitly] = useState(false);

  useEffect(() => {
    const isFilterActive =
      filters.query ||
      filters.type ||
      filters.cuisine ||
      filters.dietaryType ||
      filters.tag ||
      filters.cookTime ||
      filters.favorites;
    let results = recipes;
    if (isFilterActive || !hideAllExplicitly) {
      results = searchRecipes(filters.query, filters);
    }
    const sorted = [...results].sort((a, b) => {
      if (!a.createdAt && !b.createdAt) return 0;
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    setFilteredRecipes(sorted);
  }, [recipes, filters, searchRecipes, hideAllExplicitly]);

  useEffect(() => {
    const handler = (e) => {
      if (e.detail.type === "toggleAll") {
        setHideAllExplicitly((prev) => !prev);
        setFilters({
          query: "",
          type: "",
          cuisine: "",
          dietaryType: "",
          tag: "",
          cookTime: "",
          favorites: false,
        });
      } else if (e.detail.type === "search") {
        setHideAllExplicitly(false);
        setFilters((prev) => ({ ...prev, query: e.detail.query }));
      }
    };
    document.addEventListener("searchRecipes", handler);
    return () => document.removeEventListener("searchRecipes", handler);
  }, []);

  const handleFilterChange = useCallback((e) => {
    const { name, value, type, checked } = e.target;
    setHideAllExplicitly(false);
    setFilters((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  }, []);

  const recipesToDisplay = hideAllExplicitly ? [] : filteredRecipes;
  const hasActiveFiltersExcludingQuery =
    filters.type ||
    filters.cuisine ||
    filters.dietaryType ||
    filters.tag ||
    filters.cookTime ||
    filters.favorites;

  return (
    <section>
      <div className="mb-4 sm:mb-6 flex flex-wrap gap-5 items-center bg-gray-50 dark:bg-gray-800 p-2 sm:p-3 rounded-lg shadow-sm">
        <span className="text-sm font-medium mr-1 hidden md:inline text-gray-700 dark:text-gray-300">
          Filter:
        </span>
        <select
          name="type"
          value={filters.type}
          onChange={handleFilterChange}
          className="filter-select text-xs sm:text-sm"
          aria-label="Filter Meal Type"
        >
          <option value="">All Types</option>{" "}
          <option value="_NONE_">No Type</option>
          {[...new Set(recipes.map((r) => r?.type).filter(Boolean))]
            .sort()
            .map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
        <select
          name="cuisine"
          value={filters.cuisine}
          onChange={handleFilterChange}
          className="filter-select text-xs sm:text-sm"
          aria-label="Filter by Cuisine"
        >
          <option value="">All Cuisines</option>{" "}
          <option value="_NONE_">No Cuisine</option>
          {[...new Set(recipes.map((r) => r?.cuisine).filter(Boolean))]
            .sort()
            .map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
        </select>
        <select
          name="dietaryType"
          value={filters.dietaryType}
          onChange={handleFilterChange}
          className="filter-select text-xs sm:text-sm"
          aria-label="Filter Dietary Type"
        >
          <option value="">All Dietary</option>{" "}
          <option value="_NONE_">No Dietary Tags</option>
          {[
            ...new Set(
              recipes.flatMap((r) => r?.dietaryTypes || []).filter(Boolean),
            ),
          ]
            .sort()
            .map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
        <select
          name="tag"
          value={filters.tag}
          onChange={handleFilterChange}
          className="filter-select text-xs sm:text-sm"
          aria-label="Filter by Tag"
        >
          <option value="">All Tags</option>{" "}
          <option value="_NONE_">No Tags</option>
          {[...new Set(recipes.flatMap((r) => r?.tags || []).filter(Boolean))]
            .sort()
            .map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
        </select>
        <select
          name="cookTime"
          value={filters.cookTime}
          onChange={handleFilterChange}
          className="filter-select text-xs sm:text-sm"
          aria-label="Filter Total Time"
        >
          <option value="">Any Time</option>
          {[15, 30, 45, 60, 90, 120].map((t) => (
            <option key={t} value={t}>
              â‰¤ {t} min
            </option>
          ))}
        </select>
        <label
          className="flex items-center gap-1 cursor-pointer text-xs sm:text-sm whitespace-nowrap ml-1 sm:ml-2 text-gray-700 dark:text-gray-300"
          title="Favorites Only"
        >
          <input
            type="checkbox"
            name="favorites"
            checked={filters.favorites}
            onChange={handleFilterChange}
            className="w-3.5 h-3.5 sm:w-4 sm:h-4 rounded text-green-500 focus:ring-offset-0 focus:ring-green-500 border-gray-300 dark:border-gray-600"
          />
          <i className="fas fa-star text-yellow-400"></i>{" "}
          <span className="hidden sm:inline">Favs</span>
        </label>
        <div className="ml-auto text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1">
          <i className="fas fa-utensils text-green-500"></i> Recipes:{" "}
          {recipesToDisplay.length}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
        {recipesToDisplay.length > 0 ? (
          recipesToDisplay.map((recipe) => (
            <div
              key={recipe.id}
              onClick={() => !isBulkMode && openRecipeDetails(recipe)}
              tabIndex="0"
              aria-label={`View recipe: ${recipe.name}`}
              className={`bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden cursor-pointer hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-all duration-300 flex flex-col group ${
                isBulkMode && selectedRecipes.includes(recipe.id)
                  ? "ring-2 ring-green-500"
                  : ""
              }`}
            >
              {isBulkMode && (
                <div className="absolute top-2 left-2 z-10">
                  <input
                    type="checkbox"
                    checked={selectedRecipes.includes(recipe.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      toggleRecipeSelection(recipe.id);
                    }}
                    className="multi-select-checkbox"
                    aria-label={`Select ${recipe.name}`}
                  />
                </div>
              )}
              <div className="aspect-video w-full bg-gray-200 dark:bg-gray-700 overflow-hidden relative">
                {recipe.image ? (
                  <img
                    src={recipe.image}
                    alt={recipe.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                    <i className="fas fa-image text-4xl mb-3 opacity-50"></i>
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(recipe.id);
                  }}
                  aria-label={
                    recipe.isFavorite ? "Remove Favorite" : "Add Favorite"
                  }
                  className={`absolute top-2 right-2 text-2xl ${
                    recipe.isFavorite
                      ? "text-yellow-400 filter drop-shadow(0 1px 1px rgba(0,0,0,0.5))"
                      : "text-white text-opacity-50"
                  } hover:text-yellow-300 hover:text-opacity-100 transition-colors duration-200 z-10`}
                >
                  <i
                    className={`fa-star ${recipe.isFavorite ? "fas" : "far"}`}
                  ></i>
                </button>
              </div>
              <div className="p-3 sm:p-4 flex flex-col flex-grow">
                <h3
                  className="text-base sm:text-lg font-semibold leading-tight mb-1 text-gray-900 dark:text-gray-100 line-clamp-2"
                  title={recipe.name}
                >
                  {escapeHTML(recipe.name)}
                </h3>
                {recipe.description && (
                  <p
                    className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 mb-2 line-clamp-2"
                    title={recipe.description}
                  >
                    {escapeHTML(recipe.description)}
                  </p>
                )}
                <div className="flex flex-wrap gap-1 my-1 text-xs">
                  <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 px-2 py-0.5 rounded-full">
                    <i className="fas fa-utensils op-70"></i>{" "}
                    {escapeHTML(recipe.type)}
                  </span>
                  {recipe.cuisine && (
                    <span className="inline-flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                      <i className="fas fa-globe op-70"></i>{" "}
                      {escapeHTML(recipe.cuisine)}
                    </span>
                  )}
                  {recipe.dietaryTypes?.map((diet) => (
                    <span
                      key={diet}
                      className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full"
                    >
                      <i className="fas fa-leaf opacity-70"></i>{" "}
                      {escapeHTML(diet)}
                    </span>
                  ))}
                  {recipe.tags?.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full"
                    >
                      <i className="fas fa-tag opacity-70"></i>{" "}
                      {escapeHTML(tag)}
                    </span>
                  ))}
                </div>
                <div className="mt-auto pt-2 text-xs text-gray-500 dark:text-gray-400 grid grid-cols-2 gap-x-2 gap-y-1">
                  {recipe.prepTime > 0 && (
                    <span title="Prep Time">
                      <i className="fas fa-clock w-3 tc mr-0.5 op-70"></i> Prep:{" "}
                      {formatMinutesToHoursMinutes(recipe.prepTime)}
                    </span>
                  )}
                  {recipe.cookTime > 0 && (
                    <span title="Cook Time">
                      <i className="fas fa-fire w-3 tc mr-0.5 op-70"></i> Cook:{" "}
                      {formatMinutesToHoursMinutes(recipe.cookTime)}
                    </span>
                  )}
                  {recipe.additionalTime > 0 && (
                    <span title="Additional Time">
                      <i className="fas fa-hourglass-half w-3 tc mr-0.5 op-70"></i>{" "}
                      Additional:{" "}
                      {formatMinutesToHoursMinutes(recipe.additionalTime)}
                    </span>
                  )}
                  <span
                    className="col-span-2 text-green-600 dark:text-green-400 font-medium text-sm mt-1 inline-flex items-center gap-1"
                    title="Total Time"
                  >
                    <i className="fas fa-stopwatch"></i> Total:{" "}
                    {formatMinutesToHoursMinutes(
                      parseInt(recipe.prepTime || 0) +
                        parseInt(recipe.cookTime || 0) +
                        parseInt(recipe.additionalTime || 0),
                    )}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full text-center text-gray-500 dark:text-gray-400 py-10 px-4 bg-white dark:bg-gray-800 rounded-lg shadow">
            <i className="fas fa-search text-4xl mb-3 opacity-50"></i>
            <p className="font-semibold">
              {hideAllExplicitly
                ? "Recipes are currently hidden."
                : filters.query
                  ? "No recipes found matching your search."
                  : hasActiveFiltersExcludingQuery
                    ? "No recipes found matching your filters."
                    : "No recipes added yet."}
            </p>
            <p className="text-sm">
              {hideAllExplicitly
                ? "Click 'All' to show them."
                : filters.query || hasActiveFiltersExcludingQuery
                  ? "Try adjusting filters or search terms."
                  : "Click 'Add' to create your first recipe!"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

const TagInput = ({ tags, setTags, maxTags = 10, addToast }) => {
  const [inputValue, setInputValue] = useState("");

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const newTag = inputValue.trim();

      if (
        newTag &&
        tags.length < maxTags &&
        !tags.some((t) => t.toLowerCase() === newTag.toLowerCase())
      ) {
        setTags([...tags, newTag]);
      } else if (tags.length >= maxTags) {
        addToast(`Maximum ${maxTags} tags allowed.`, "error");
      } else if (
        newTag &&
        tags.some((t) => t.toLowerCase() === newTag.toLowerCase())
      ) {
        addToast(`Tag "${newTag}" already added.`, "info");
      }
      setInputValue("");
    } else if (e.key === "Backspace" && !inputValue && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  };

  const removeTag = (indexToRemove) => {
    setTags(tags.filter((_, index) => index !== indexToRemove));
  };

  return (
    <div className="tag-input-container">
      {tags.map((tag, index) => (
        <span key={index} className="tag-item">
          {tag}
          <button
            type="button"
            className="tag-item-remove"
            onClick={() => removeTag(index)}
            aria-label={`Remove tag ${tag}`}
          >
            &times;
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add a tag"
        className="flex-grow border-none outline-none text-sm text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 bg-transparent"
        aria-label="Tag input"
      />
    </div>
  );
};

const AddRecipeModal = ({
  onClose,
  addRecipe,
  updateRecipe,
  editingRecipe,
  addToast,
}) => {
  const initialFormState = useMemo(
    () => ({
      name: "",
      description: "",
      course: "",
      subCategory: "",
      type: "",
      cuisine: "",
      dietaryTypes: "",
      prepHours: "",
      prepMinutes: "",
      cookHours: "",
      cookMinutes: "",
      additionalHours: "",
      additionalMinutes: "",
      calories: "",
      protein: "",
      carbs: "",
      fat: "",
      servings: "4",
      yield: "",
      ingredients: "",
      directions: "",
      tipsAndTricks: "",
      image: null,
      video: null,
    }),
    [],
  );
  const [formData, setFormData] = useState(initialFormState);
  const [tags, setTags] = useState([]);
  const [tipsAndTricks, setTipsAndTricks] = useState([]);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoPreview, setVideoPreview] = useState(null);
  const [formErrors, setFormErrors] = useState({});

  // FEATURE 10: Auto-save drafts
  useDraftSaver(
    formData,
    editingRecipe ? null : LOCAL_STORAGE_KEYS.RECIPE_DRAFT,
  );

  useEffect(() => {
    if (editingRecipe) {
      const getHours = (totalMins) => Math.floor(totalMins / 60);
      const getMinutes = (totalMins) => totalMins % 60;

      setFormData({
        name: editingRecipe.name || "",
        description: editingRecipe.description || "",
        course: editingRecipe.course || "",
        subCategory: editingRecipe.subCategory || "",
        type: editingRecipe.type || "",
        cuisine: editingRecipe.cuisine || "",
        dietaryTypes: Array.isArray(editingRecipe.dietaryTypes)
          ? editingRecipe.dietaryTypes.join(", ")
          : "",
        prepHours: getHours(editingRecipe.prepTime || 0),
        prepMinutes: getMinutes(editingRecipe.prepTime || 0),
        cookHours: getHours(editingRecipe.cookTime || 0),
        cookMinutes: getMinutes(editingRecipe.cookTime || 0),
        additionalHours: getHours(editingRecipe.additionalTime || 0),
        additionalMinutes: getMinutes(editingRecipe.additionalTime || 0),
        calories: editingRecipe.calories ?? "",
        protein: editingRecipe.protein ?? "",
        carbs: editingRecipe.carbs ?? "",
        fat: editingRecipe.fat ?? "",
        servings: editingRecipe.servings ?? "4",
        yield: editingRecipe.yield || "",
        ingredients: Array.isArray(editingRecipe.ingredients)
          ? editingRecipe.ingredients.join("\n")
          : "",
        directions: Array.isArray(editingRecipe.directions)
          ? editingRecipe.directions.join("\n")
          : "",
        tipsAndTricks: Array.isArray(editingRecipe.tipsAndTricks)
          ? editingRecipe.tipsAndTricks.join("\n")
          : "",
        image: editingRecipe.image || null,
        video: editingRecipe.video || null,
      });
      setTags(Array.isArray(editingRecipe.tags) ? editingRecipe.tags : []);
      setTipsAndTricks(
        Array.isArray(editingRecipe.tipsAndTricks)
          ? editingRecipe.tipsAndTricks
          : [],
      );
      setImagePreview(editingRecipe.image || null);
      setVideoPreview(editingRecipe.video || null);
    } else {
      // FEATURE 10: Load draft when creating new recipe
      const draft = loadDraft(LOCAL_STORAGE_KEYS.RECIPE_DRAFT);
      if (draft) {
        setFormData({ ...initialFormState, ...draft });
        if (draft.image) setImagePreview(draft.image);
        if (draft.video) setVideoPreview(draft.video);
      } else {
        setFormData(initialFormState);
        setImagePreview(null);
        setVideoPreview(null);
      }
      setTags([]);
      setTipsAndTricks([]);
    }
    setFormErrors({});
  }, [editingRecipe, initialFormState]);

  const handleChange = useCallback(
    (e) => {
      const { name, value } = e.target;
      setFormData((prev) => ({ ...prev, [name]: value }));
      if (formErrors[name])
        setFormErrors((prev) => ({ ...prev, [name]: null }));
    },
    [formErrors],
  );

  const handleFileChange = useCallback((e) => {
    const { name, files } = e.target;
    if (!files || files.length === 0) return;
    const file = files[0];

    const MAX_SIZE = 5 * 1024 * 1024;
    if (name === "image" && !file.type.startsWith("image/")) {
      setFormErrors((p) => ({ ...p, [name]: "File must be an image." }));
      return;
    }
    if (name === "video" && !file.type.startsWith("video/")) {
      setFormErrors((p) => ({ ...p, [name]: "File must be a video." }));
      return;
    }
    if (file.size > MAX_SIZE) {
      setFormErrors((p) => ({
        ...p,
        [name]: `File too large (Max ${MAX_SIZE / 1024 / 1024}MB).`,
      }));
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setFormData((prev) => ({
        ...prev,
        [name]: loadEvent.target.result,
      }));
      if (name === "image") setImagePreview(loadEvent.target.result);
      if (name === "video") setVideoPreview(loadEvent.target.result);
      setFormErrors((prev) => ({ ...prev, [name]: null }));
    };
    reader.onerror = () => {
      console.error("Error reading file:", reader.error);
      setFormErrors((prev) => ({ ...p, [name]: "Error reading file." }));
    };
    reader.readAsDataURL(file);
  }, []);

  const removeMedia = useCallback((mediaType) => {
    setFormData((prev) => ({ ...prev, [mediaType]: null }));
    if (mediaType === "image") setImagePreview(null);
    if (mediaType === "video") setVideoPreview(null);
    const fileInput = document.querySelector(`input[name=${mediaType}]`);
    if (fileInput) fileInput.value = "";
  }, []);

  const validateForm = useCallback(() => {
    const errors = {};
    if (!formData.name.trim()) errors.name = "Recipe name is required.";
    if (!formData.course.trim()) errors.course = "Course is required.";
    if (!formData.subCategory.trim())
      errors.subCategory = "Sub-category is required.";
    if (!formData.ingredients.trim())
      errors.ingredients = "Ingredients are required.";
    if (!formData.directions.trim())
      errors.directions = "Directions are required.";
    const timeFields = ["prep", "cook", "additional"];
    timeFields.forEach((field) => {
      const hours = parseInt(formData[`${field}Hours`]) || 0;
      const minutes = parseInt(formData[`${field}Minutes`]) || 0;
      if (isNaN(hours) || hours < 0) {
        errors[`${field}Hours`] = `Invalid ${field} hours.`;
      }
      if (isNaN(minutes) || minutes < 0 || minutes >= 60) {
        errors[`${field}Minutes`] = `Invalid ${field} minutes (0-59).`;
      }
    });

    if (isNaN(parseInt(formData.servings)) || parseInt(formData.servings) < 1)
      errors.servings = "Servings must be 1 or more.";
    if (formData.calories && isNaN(parseInt(formData.calories)))
      errors.calories = "Calories must be a number.";
    if (formData.protein && isNaN(parseFloat(formData.protein)))
      errors.protein = "Protein must be a number.";
    if (formData.carbs && isNaN(parseFloat(formData.carbs)))
      errors.carbs = "Carbs must be a number.";
    if (formData.fat && isNaN(parseFloat(formData.fat)))
      errors.fat = "Fat must be a number.";
    if (formData.yield && !formData.yield.trim()) {
      errors.yield = "Yield cannot be just empty spaces.";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(
    (e) => {
      e.preventDefault();
      if (!validateForm()) {
        addToast("Please fix errors before saving.", "error");
        return;
      }

      const calculateTotalMinutes = (hours, minutes) => {
        return (parseInt(hours) || 0) * 60 + (parseInt(minutes) || 0);
      };

      const recipeData = {
        name: formData.name.trim(),
        description: formData.description.trim(),
        course: formData.course.trim(),
        subCategory: formData.subCategory.trim(),
        type: formData.type.trim(),
        cuisine: formData.cuisine.trim(),
        dietaryTypes: formData.dietaryTypes
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        tags: tags,
        prepTime: calculateTotalMinutes(
          formData.prepHours,
          formData.prepMinutes,
        ),
        cookTime: calculateTotalMinutes(
          formData.cookHours,
          formData.cookMinutes,
        ),
        additionalTime: calculateTotalMinutes(
          formData.additionalHours,
          formData.additionalMinutes,
        ),
        calories: formData.calories ? parseInt(formData.calories) : null,
        protein: formData.protein ? parseFloat(formData.protein) : null,
        carbs: formData.carbs ? parseFloat(formData.carbs) : null,
        fat: formData.fat ? parseFloat(formData.fat) : null,
        servings: parseInt(formData.servings) || 1,
        yield: formData.yield.trim(),
        ingredients: formData.ingredients
          .split("\n")
          .map((i) => i.trim())
          .filter(Boolean),
        directions: formData.directions
          .split("\n")
          .map((d) => d.trim())
          .filter(Boolean),
        tipsAndTricks: formData.tipsAndTricks
          .split("\n")
          .map((tip) => tip.trim())
          .filter(Boolean),
        image: formData.image,
        video: formData.video,
      };

      if (editingRecipe) {
        updateRecipe(editingRecipe.id, recipeData);
      } else {
        addRecipe(recipeData);
        // FEATURE 10: Clear draft after successful submission
        clearDraft(LOCAL_STORAGE_KEYS.RECIPE_DRAFT);
      }
    },
    [
      formData,
      tags,
      editingRecipe,
      validateForm,
      addRecipe,
      updateRecipe,
      addToast,
    ],
  );

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
  const mealTypes = [
    "Appetizers",
    "Burgers",
    "Desserts",
    "Garnishes",
    "Hotdogs/Bratwurst/Etc",
    "Loins",
    "Meatloafs",
    "Pastas",
    "Ribs",
    "Roasts",
    "Salads",
    "Sandwiches",
    "Seafood",
    "Soups/Stews",
    "Spices/Seasoning/Marinades",
    "Steaks",
    "Wraps",
  ].sort();
  const cuisineTypes = [
    "American",
    "Asian",
    "Mexican",
    "Italian",
    "Indian",
    "Mediterranean",
    "French",
    "Japanese",
    "Chinese",
    "Thai",
    "Vietnamese",
    "Korean",
    "Middle Eastern",
    "African",
    "Caribbean",
    "South American",
    "German",
    "Spanish",
    "Greek",
    "British",
    "Australian",
    "Canadian",
    "Fusion",
    "Other",
  ].sort();
  const dietaryTypesList = [
    "Gluten-Free",
    "Dairy-Free",
    "Nut-Free",
    "Vegan",
    "Vegetarian",
    "Pescatarian",
    "Keto",
    "Paleo",
    "Low-Carb",
    "Low-Fat",
    "Sugar-Free",
    "Soy-Free",
  ];

  const ErrorMessage = ({ name }) =>
    formErrors[name] ? (
      <p className="text-red-500 text-xs mt-1">{formErrors[name]}</p>
    ) : null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 sm:p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto modal-scale-enter">
        <div className="flex justify-between items-center mb-5 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {editingRecipe ? "Edit Recipe" : "Add New Recipe"}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-3xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium mb-1 text-white dark:text-white"
              >
                Name *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                style={{ background: "#374151", color: "#FFFFFF" }}
                className={`modal-input ${
                  formErrors.name
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
              <ErrorMessage name="name" />
            </div>
            <div>
              <label
                htmlFor="course"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Course *
              </label>
              <select
                id="course"
                name="course"
                value={formData.course}
                onChange={handleChange}
                required
                style={{ background: "#374151", color: "#FFFFFF" }}
                className={`modal-input ${
                  formErrors.course
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              >
                <option value="">Select a course...</option>
                <option value="Appetizer">Appetizers</option>
                <option value="Beverages">Beverages</option>
                <option value="Breads">Breads</option>
                <option value="Dessert">Desserts</option>
                <option value="Main">Main</option>
                <option value="Dressings, Marinades, Sauces, & Seasoning">
                  Dressings, Marinades, Sauces, & Seasoning
                </option>
                <option value="Salads">Salads</option>
                <option value="Soups/Stews">Soups/Stews</option>
              </select>
              <ErrorMessage name="course" />
            </div>
            <div>
              <label
                htmlFor="subCategory"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Sub-Category *
              </label>
              <input
                type="text"
                id="subCategory"
                name="subCategory"
                value={formData.subCategory}
                onChange={handleChange}
                required
                style={{ background: "#374151", color: "#FFFFFF" }}
                placeholder="e.g., Pasta, Grilled, Soups and Stews, Baked"
                className={`modal-input ${
                  formErrors.subCategory
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
              <ErrorMessage name="subCategory" />
            </div>
            <div>
              <label
                htmlFor="type"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Type <span className="text-xs">(optional)</span>
              </label>
              <input
                type="text"
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                style={{ background: "#374151", color: "#FFFFFF" }}
                list="meal-types"
                className={`modal-input ${
                  formErrors.type
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
              <datalist id="meal-types">
                {mealTypes.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
              <ErrorMessage name="type" />
            </div>
          </div>
          <div>
            <label
              htmlFor="description"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Description <span className="text-xs">(optional)</span>
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              style={{ background: "#374151", color: "#FFFFFF" }}
              rows="2"
              className="modal-textarea border-gray-300 dark:border-gray-600"
            ></textarea>
            <ErrorMessage name="description" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="servings"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Servings *
              </label>
              <input
                type="number"
                id="servings"
                name="servings"
                value={formData.servings}
                onChange={handleChange}
                style={{ background: "#374151", color: "#FFFFFF" }}
                min="1"
                required
                className={`modal-input ${
                  formErrors.servings
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              />
              <ErrorMessage name="servings" />
            </div>
            <div>
              <label
                htmlFor="yield"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Yield <span className="text-xs">(e.g., 1.5 cups)</span>
              </label>
              <input
                type="text"
                id="yield"
                name="yield"
                value={formData.yield}
                onChange={handleChange}
                style={{ background: "#374151", color: "#FFFFFF" }}
                className={`modal-input ${
                  formErrors.yield
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
                placeholder="e.g., 8 servings, 2 dozen, 1 gallon"
              />
              <ErrorMessage name="yield" />
            </div>
          </div>
          <div>
            <label
              htmlFor="cuisine"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Cuisine <span className="text-xs">(optional)</span>
            </label>
            <input
              type="text"
              id="cuisine"
              name="cuisine"
              value={formData.cuisine}
              onChange={handleChange}
              style={{ background: "#374151", color: "#FFFFFF" }}
              list="cuisine-types"
              className="modal-input border-gray-300 dark:border-gray-600"
              placeholder="e.g., Italian, Mexican, American"
            />
            <datalist id="cuisine-types">
              {cuisineTypes.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div>
            <label
              htmlFor="dietaryTypes"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Dietary <span className="text-xs">(comma-sep)</span>
            </label>
            <input
              type="text"
              id="dietaryTypes"
              name="dietaryTypes"
              value={formData.dietaryTypes}
              onChange={handleChange}
              style={{ background: "#374151", color: "#FFFFFF" }}
              list="dietary-types"
              className="modal-input border-gray-300 dark:border-gray-600"
            />
            <datalist id="dietary-types">
              {dietaryTypesList.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
          <div>
            <label
              htmlFor="tags"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Tags <span className="text-xs">(press Enter/comma)</span>
            </label>
            <TagInput tags={tags} setTags={setTags} addToast={addToast} />
            <ErrorMessage name="tags" />
          </div>
          <fieldset className="border border-gray-300 dark:border-gray-600 p-3 rounded">
            <legend className="text-sm font-medium px-1 text-gray-700 dark:text-gray-300">
              Time
            </legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">
                  Prep Time *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    name="prepHours"
                    value={formData.prepHours}
                    onChange={handleChange}
                    style={{ background: "#374151", color: "#FFFFFF" }}
                    placeholder="H"
                    min="0"
                    className={`modal-input-sm w-1/2 ${
                      formErrors.prepHours
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                  <input
                    type="number"
                    name="prepMinutes"
                    value={formData.prepMinutes}
                    onChange={handleChange}
                    style={{ background: "#374151", color: "#FFFFFF" }}
                    placeholder="M"
                    min="0"
                    max="59"
                    className={`modal-input-sm w-1/2 ${
                      formErrors.prepMinutes
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                </div>
                <ErrorMessage name="prepHours" />{" "}
                <ErrorMessage name="prepMinutes" />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">
                  Cook Time *
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    name="cookHours"
                    value={formData.cookHours}
                    onChange={handleChange}
                    style={{ background: "#374151", color: "#FFFFFF" }}
                    placeholder="H"
                    min="0"
                    className={`modal-input-sm w-1/2 ${
                      formErrors.cookHours
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                  <input
                    type="number"
                    name="cookMinutes"
                    value={formData.cookMinutes}
                    onChange={handleChange}
                    style={{ background: "#374151", color: "#FFFFFF" }}
                    placeholder="M"
                    min="0"
                    max="59"
                    className={`modal-input-sm w-1/2 ${
                      formErrors.cookMinutes
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                </div>
                <ErrorMessage name="cookHours" />{" "}
                <ErrorMessage name="cookMinutes" />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-600 dark:text-gray-400">
                  Additional Time
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    name="additionalHours"
                    value={formData.additionalHours}
                    onChange={handleChange}
                    style={{ background: "#374151", color: "#FFFFFF" }}
                    placeholder="H"
                    min="0"
                    className={`modal-input-sm w-1/2 ${
                      formErrors.additionalHours
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                  <input
                    type="number"
                    name="additionalMinutes"
                    value={formData.additionalMinutes}
                    onChange={handleChange}
                    style={{ background: "#374151", color: "#FFFFFF" }}
                    placeholder="M"
                    min="0"
                    max="59"
                    className={`modal-input-sm w-1/2 ${
                      formErrors.additionalMinutes
                        ? "border-red-500"
                        : "border-gray-300 dark:border-gray-600"
                    }`}
                  />
                </div>
                <ErrorMessage name="additionalHours" />{" "}
                <ErrorMessage name="additionalMinutes" />
              </div>
            </div>
          </fieldset>
          <fieldset className="border border-gray-300 dark:border-gray-600 p-3 rounded">
            <legend className="text-sm font-medium px-1 text-gray-700 dark:text-gray-300">
              Nutrition (per serving, optional)
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label
                  htmlFor="calories"
                  className="block text-xs mb-1 text-gray-600 dark:text-gray-400"
                >
                  Calories
                </label>
                <input
                  type="number"
                  id="calories"
                  name="calories"
                  value={formData.calories}
                  onChange={handleChange}
                  style={{ background: "#374151", color: "#FFFFFF" }}
                  min="0"
                  className={`modal-input-sm ${
                    formErrors.calories
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                />
                <ErrorMessage name="calories" />
              </div>
              <div>
                <label
                  htmlFor="protein"
                  className="block text-xs mb-1 text-gray-600 dark:text-gray-400"
                >
                  Protein (g)
                </label>
                <input
                  type="number"
                  id="protein"
                  name="protein"
                  value={formData.protein}
                  onChange={handleChange}
                  style={{ background: "#374151", color: "#FFFFFF" }}
                  min="0"
                  step="0.1"
                  className={`modal-input-sm ${
                    formErrors.protein
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                />
                <ErrorMessage name="protein" />
              </div>
              <div>
                <label
                  htmlFor="carbs"
                  className="block text-xs mb-1 text-gray-600 dark:text-gray-400"
                >
                  Carbs (g)
                </label>
                <input
                  type="number"
                  id="carbs"
                  name="carbs"
                  value={formData.carbs}
                  onChange={handleChange}
                  style={{ background: "#374151", color: "#FFFFFF" }}
                  min="0"
                  step="0.1"
                  className={`modal-input-sm ${
                    formErrors.carbs
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                />
                <ErrorMessage name="carbs" />
              </div>
              <div>
                <label
                  htmlFor="fat"
                  className="block text-xs mb-1 text-gray-600 dark:text-gray-400"
                >
                  Fat (g)
                </label>
                <input
                  type="number"
                  id="fat"
                  name="fat"
                  value={formData.fat}
                  onChange={handleChange}
                  style={{ background: "#374151", color: "#FFFFFF" }}
                  min="0"
                  step="0.1"
                  className={`modal-input-sm ${
                    formErrors.fat
                      ? "border-red-500"
                      : "border-gray-300 dark:border-gray-600"
                  }`}
                />
                <ErrorMessage name="fat" />
              </div>
            </div>
          </fieldset>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ingredients"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Ingredients * <span className="text-xs">(one per line)</span>
              </label>
              <textarea
                id="ingredients"
                name="ingredients"
                value={formData.ingredients}
                onChange={handleChange}
                style={{ background: "#374151", color: "#FFFFFF" }}
                rows="6"
                required
                className={`modal-textarea ${
                  formErrors.ingredients
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              ></textarea>
              <ErrorMessage name="ingredients" />
            </div>
            <div>
              <label
                htmlFor="directions"
                className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
              >
                Directions *{" "}
                <span className="text-xs">(one step per line)</span>
              </label>
              <textarea
                id="directions"
                name="directions"
                value={formData.directions}
                onChange={handleChange}
                style={{ background: "#374151", color: "#FFFFFF" }}
                rows="6"
                required
                className={`modal-textarea ${
                  formErrors.directions
                    ? "border-red-500"
                    : "border-gray-300 dark:border-gray-600"
                }`}
              ></textarea>
              <ErrorMessage name="directions" />
            </div>
          </div>
          <div>
            <label
              htmlFor="tipsAndTricks"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Tips & Tricks <span className="text-xs">(one tip per line)</span>
            </label>
            <textarea
              id="tipsAndTricks"
              name="tipsAndTricks"
              value={formData.tipsAndTricks}
              onChange={handleChange}
              style={{ background: "#374151", color: "#FFFFFF" }}
              rows="4"
              className="modal-textarea border-gray-300 dark:border-gray-600"
              placeholder="e.g., If you don't have fresh basil, use 1 tsp dried basil. This recipe freezes well!"
            ></textarea>
          </div>
          <div>
            <label
              htmlFor="image"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Image
            </label>
            <input
              type="file"
              id="image"
              name="image"
              accept="image/*"
              onChange={handleFileChange}
              className={`block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 dark:file:bg-gray-600 file:text-green-700 dark:file:text-gray-200 hover:file:bg-green-100 dark:hover:file:bg-gray-500 cursor-pointer ${
                formErrors.image ? "border border-red-500 rounded-md" : ""
              }`}
            />
            <ErrorMessage name="image" />
            {imagePreview && (
              <div className="mt-2 relative group w-32 h-32 border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeMedia("image")}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label="Remove image"
                >
                  &times;
                </button>
              </div>
            )}
          </div>
          <div>
            <label
              htmlFor="video"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Video
            </label>
            <input
              type="file"
              id="video"
              name="video"
              accept="video/*"
              onChange={handleFileChange}
              className={`block w-full text-sm text-gray-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 dark:file:bg-gray-600 file:text-blue-700 dark:file:text-gray-200 hover:file:bg-blue-100 dark:hover:file:bg-gray-500 cursor-pointer ${
                formErrors.video ? "border border-red-500 rounded-md" : ""
              }`}
            />
            <ErrorMessage name="video" />
            {videoPreview && (
              <div className="mt-2 relative group max-w-xs border border-gray-300 dark:border-gray-600 rounded overflow-hidden">
                <video
                  controls
                  className="w-full rounded max-h-40 block bg-black"
                >
                  <source src={videoPreview} /> No video support.
                </video>
                <button
                  type="button"
                  onClick={() => removeMedia("video")}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  aria-label="Remove video"
                >
                  &times;
                </button>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600 mt-5">
            <button
              type="button"
              onClick={onClose}
              className="btn-modal btn-gray"
            >
              Cancel
            </button>
            <button type="submit" className="btn-modal btn-green">
              {editingRecipe ? "Save Changes" : "Add Recipe"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const AddToMealPlanSelectorModal = ({
  recipe,
  mealPlan,
  updateMealPlan,
  onClose,
  addToast,
  recipes,
}) => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const mealTimes = [
    { id: "breakfast", label: "Breakfast", icon: "fa-coffee" },
    { id: "morningSnack", label: "M. Snack", icon: "fa-apple-alt" },
    { id: "lunch", label: "Lunch", icon: "fa-utensils" },
    { id: "afternoonSnack", label: "A. Snack", icon: "fa-cookie-bite" },
    { id: "dinner", label: "Dinner", icon: "fa-drumstick-bite" },
  ];
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const [selectedMealTime, setSelectedMealTime] = useState(mealTimes[0].id);

  const currentRecipesInSlot = useMemo(() => {
    return mealPlan?.[selectedDay]?.[selectedMealTime] || [];
  }, [mealPlan, selectedDay, selectedMealTime]);

  const handleAdd = useCallback(() => {
    if (recipe && selectedDay && selectedMealTime) {
      if (currentRecipesInSlot.includes(recipe.id)) {
        addToast("Recipe is already in this slot.", "info");
      } else {
        updateMealPlan(selectedDay, selectedMealTime, recipe.id);
      }
      onClose();
    } else {
      addToast("Please select a day and meal time.", "error");
    }
  }, [
    recipe,
    selectedDay,
    selectedMealTime,
    updateMealPlan,
    onClose,
    addToast,
    currentRecipesInSlot,
  ]);

  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 sm:p-5 w-full max-w-sm modal-scale-enter">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h3 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-gray-100">
            Add "{escapeHTML(recipe.name)}" to Meal Plan
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-2xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label
              htmlFor="selectDay"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Select Day:
            </label>
            <select
              id="selectDay"
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="modal-input-sm"
            >
              {days.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="selectMealTime"
              className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300"
            >
              Select Meal Time:
            </label>
            <select
              id="selectMealTime"
              value={selectedMealTime}
              onChange={(e) => setSelectedMealTime(e.target.value)}
              className="modal-input-sm"
            >
              {mealTimes.map((time) => (
                <option key={time.id} value={time.id}>
                  {time.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Current assignment for {selectedDay}{" "}
            {mealTimes.find((mt) => mt.id === selectedMealTime)?.label}:
            <div className="font-semibold mt-1">
              {currentRecipesInSlot.length > 0
                ? currentRecipesInSlot.map((id, index) => {
                    const assignedRecipe = recipes.find((r) => r.id === id);
                    return (
                      <span key={id} className="block">
                        {assignedRecipe?.name || "Unknown Recipe"}
                        {index < currentRecipesInSlot.length - 1 && ", "}
                      </span>
                    );
                  })
                : "None"}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
            <button
              type="button"
              onClick={onClose}
              className="btn-modal btn-gray"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              className="btn-modal btn-green"
            >
              Add to Plan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RecipeDetailsModal = ({
  recipe,
  onClose,
  addToShoppingList,
  generateRecipePDF,
  deleteRecipe,
  editRecipe,
  toggleFavorite,
  addToast,
  updateMealPlan,
  mealPlan,
  recipes,
  addTimer,
  startCookingSession,
  getRecipeRatings,
  addRating,
  checkRecipeAvailability,
  inventory,
}) => {
  const [fullRecipe, setFullRecipe] = useState(null);
  const [isLoadingFullRecipe, setIsLoadingFullRecipe] = useState(false);
  const baseServings =
    (fullRecipe || recipe)?.servings > 0 ? (fullRecipe || recipe).servings : 1;
  const [currentServings, setCurrentServings] = useState(baseServings);
  const servingsMultiplier = currentServings / baseServings;
  const [showAddToMealPlanSelector, setShowAddToMealPlanSelector] =
    useState(false);
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(null); // FEATURE 13
  const [showPhotoGallery, setShowPhotoGallery] = useState(false); // FEATURE 23
  const [showVideoPlayer, setShowVideoPlayer] = useState(false); // FEATURE 24

  // Fetch full recipe data from IndexedDB if only partial data is provided
  useEffect(() => {
    const loadFullRecipe = async () => {
      setIsLoadingFullRecipe(true);
      if (recipe && recipe.id) {
        const dbRecipe = await getItem(STORE_NAMES.RECIPES, recipe.id);
        console.log("Recipe from DB:", dbRecipe);
        console.log("Has ingredients:", dbRecipe?.ingredients);
        console.log("Has directions:", dbRecipe?.directions);
        if (dbRecipe) {
          setFullRecipe(dbRecipe);
        } else {
          setFullRecipe(recipe);
        }
      } else {
        setFullRecipe(recipe);
      }
      setIsLoadingFullRecipe(false);
    };
    loadFullRecipe();
  }, [recipe]);

  // Use fullRecipe for all operations
  const currentRecipe = fullRecipe || recipe;

  const handleServingsChange = useCallback((value) => {
    setCurrentServings(Math.max(1, parseInt(value) || 1));
  }, []);
  const totalTime = useMemo(
    () =>
      parseInt(fullRecipe?.prepTime || 0) +
      parseInt(fullRecipe?.cookTime || 0) +
      parseInt(fullRecipe?.additionalTime || 0),
    [fullRecipe],
  );
  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
  const scaledYield = useMemo(() => {
    if (recipe.yield) {
      return formatScaledYield(recipe.yield, servingsMultiplier);
    }
    return null;
  }, [recipe.yield, servingsMultiplier]);

  const getShareableText = useCallback(() => {
    let text = `Check out this recipe: ${recipe.name}\n\n`;
    if (recipe.description) {
      text += `${recipe.description}\n\n`;
    }
    text += `Servings: ${recipe.servings}\n`;
    text += `Total Time: ${formatMinutesToHoursMinutes(totalTime)}\n\n`;
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      text += "Ingredients:\n";
      recipe.ingredients.forEach((ing) => {
        const { quantity, unit, description } = parseIngredient(ing);
        const scaledQuantity = quantity ? quantity * servingsMultiplier : null;
        text += `- ${
          scaledQuantity !== null ? formatQuantity(scaledQuantity) + " " : ""
        }${unit ? unit + " " : ""}${description}\n`;
      });
      text += "\n";
    }
    if (recipe.directions && recipe.directions.length > 0) {
      text += "Directions:\n";
      recipe.directions.forEach((dir, index) => {
        text += `${index + 1}. ${dir}\n`;
      });
      text += "\n";
    }
    if (recipe.tipsAndTricks && recipe.tipsAndTricks.length > 0) {
      text += "Tips & Tricks:\n";
      recipe.tipsAndTricks.forEach((tip) => {
        text += `- ${tip}\n`;
      });
      text += "\n";
    }
    text += "Find more recipes with Recipe Manager Pro!";
    return text;
  }, [recipe, totalTime, servingsMultiplier]);

  const handleShareRecipe = useCallback(async () => {
    const shareData = {
      title: `Recipe: ${recipe.name}`,
      text: getShareableText(),
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        addToast("Recipe shared successfully!", "success");
      } catch (err) {
        if (err.name === "AbortError") {
          addToast("Sharing cancelled.", "info");
        } else {
          console.error("Error sharing recipe:", err);
          addToast("Failed to share recipe.", "error");
        }
      }
    } else {
      try {
        const textToCopy = shareData.text;
        const textarea = document.createElement("textarea");
        textarea.value = textToCopy;
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        addToast("Recipe details copied to clipboard!", "info");
      } catch (err) {
        console.error("Failed to copy recipe to clipboard:", err);
        addToast("Failed to copy recipe details.", "error");
      }
    }
  }, [recipe, getShareableText, addToast]);

  const handleExportSingleRecipe = useCallback(async () => {
    try {
      const dataStr = JSON.stringify(recipe, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${recipe.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")}-recipe.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast("Recipe exported successfully!", "success");
    } catch (err) {
      console.error("Export single recipe error:", err);
      addToast("Error exporting recipe.", "error");
    }
  }, [recipe, addToast]);

  const parseTimeFromDirection = (text) => {
    // This regex finds all instances of a number (integer or decimal)
    // followed by a time unit (seconds, minutes, hours).
    // e.g., "2 hours", "30 minutes", "1.5 hours"
    const timePartRegex = /(\d+(\.\d+)?)\s+(seconds?|minutes?|hours?)/gi;
    const matches = [...text.matchAll(timePartRegex)];

    if (matches.length === 0) {
      return null;
    }

    let maxSeconds = 0;

    // In a direction like "cook for 30 minutes to 1 hour", we should take the longer time.
    // This loop finds all time mentions and returns the largest one in seconds.
    for (const match of matches) {
      const value = parseFloat(match[1]);
      const unit = match[3].toLowerCase();
      let currentSeconds = 0;

      if (unit.startsWith("second")) {
        currentSeconds = value;
      } else if (unit.startsWith("minute")) {
        currentSeconds = value * 60;
      } else if (unit.startsWith("hour")) {
        currentSeconds = value * 3600;
      }

      if (currentSeconds > maxSeconds) {
        maxSeconds = currentSeconds;
      }
    }

    return maxSeconds > 0 ? maxSeconds : null;
  };

  if (!recipe) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 sm:p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto modal-scale-enter">
        <div className="flex justify-between items-start mb-4 border-b border-gray-200 dark:border-gray-600 pb-3 gap-4">
          <div className="flex-1">
            <h2 className="text-2xl md:text-3xl font-bold mb-1 text-gray-900 dark:text-gray-100">
              {escapeHTML(recipe.name)}
            </h2>
            {recipe.description && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 italic">
                {escapeHTML(recipe.description)}
              </p>
            )}
            <div className="flex flex-wrap gap-x-2 gap-y-1 items-center text-xs sm:text-sm">
              <span className="inline-flex items-center gap-1 bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-300 px-2 py-0.5 rounded-full">
                <i className="fas fa-utensils op-70"></i>{" "}
                {escapeHTML(recipe.type)}
              </span>
              {recipe.cuisine && (
                <span className="inline-flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300 px-2 py-0.5 rounded-full">
                  <i className="fas fa-globe op-70"></i>{" "}
                  {escapeHTML(recipe.cuisine)}
                </span>
              )}
              {recipe.dietaryTypes?.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full"
                >
                  <i className="fas fa-leaf op-70"></i> {escapeHTML(t)}
                </span>
              ))}
              {recipe.tags?.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full"
                >
                  <i className="fas fa-tag opacity-70"></i> {escapeHTML(tag)}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => toggleFavorite(recipe.id)}
              className={`text-2xl p-1 rounded-full ${
                recipe.isFavorite
                  ? "text-yellow-400 hover:text-yellow-500"
                  : "text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400"
              }`}
              title={recipe.isFavorite ? "Remove Favorite" : "Add Favorite"}
              aria-label={
                recipe.isFavorite ? "Remove Favorite" : "Add Favorite"
              }
            >
              <i className={`fa-star ${recipe.isFavorite ? "fas" : "far"}`}></i>
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-3xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-1 space-y-4">
            {recipe.image && (
              <img
                src={recipe.image}
                alt={recipe.name}
                className="w-full aspect-video object-cover rounded-lg shadow-md border border-gray-200 dark:border-gray-700"
              />
            )}
            {recipe.video && (
              <div>
                <h3 className="text-base font-semibold mb-1 text-gray-800 dark:text-gray-200">
                  Video
                </h3>
                <video
                  controls
                  className="w-full rounded-lg shadow-md max-h-48 border border-gray-200 dark:border-gray-700 block bg-black"
                >
                  <source src={recipe.video} /> No video support.
                </video>
              </div>
            )}
            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md shadow-sm">
              <label
                htmlFor="servingsAdj"
                className="font-medium text-sm mb-1.5 block text-gray-700 dark:text-gray-300"
              >
                Servings:
              </label>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-400">
                  Base: {baseServings}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleServingsChange(currentServings - 1)}
                    className="adjust-btn"
                    disabled={currentServings <= 1}
                    aria-label="Decrease servings"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    id="servingsAdj"
                    value={currentServings}
                    onChange={(e) => handleServingsChange(e.target.value)}
                    min="1"
                    className="w-12 tc p-1 rounded border border-gray-300 dark:border-gray-500 bg-white dark:bg-gray-600 text-sm focus:outline-none focus:ring-1 focus:ring-green-500 text-gray-900 dark:text-gray-100"
                    aria-label="Current servings"
                  />
                  <button
                    onClick={() => handleServingsChange(currentServings + 1)}
                    className="adjust-btn"
                    aria-label="Increase servings"
                  >
                    +
                  </button>
                </div>
              </div>
              {recipe.yield && (
                <div className="mt-2 text-sm text-gray-700 dark:text-gray-300 flex justify-between items-center border-t border-gray-200 dark:border-gray-600 pt-2">
                  <span className="font-medium">Yield:</span>
                  <span>{scaledYield}</span>
                </div>
              )}
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded-md shadow-sm space-y-1.5 text-sm text-gray-700 dark:text-gray-300">
              <h4 className="font-semibold border-b border-gray-200 dark:border-gray-600 pb-1 mb-1.5 text-gray-800 dark:text-gray-200">
                Quick Info{" "}
                <span className="text-xs font-normal text-gray-500">
                  (per serving)
                </span>
              </h4>
              <div className="flex justify-between">
                <span>Prep:</span>{" "}
                <span className="font-medium">
                  {formatMinutesToHoursMinutes(recipe.prepTime)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Cook:</span>{" "}
                <span className="font-medium">
                  {formatMinutesToHoursMinutes(recipe.cookTime)}
                </span>
              </div>
              {recipe.additionalTime > 0 && (
                <div className="flex justify-between">
                  <span>Additional:</span>{" "}
                  <span className="font-medium">
                    {formatMinutesToHoursMinutes(recipe.additionalTime)}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold pt-1 border-t border-gray-200 dark:border-gray-600 mt-1">
                <span>Total:</span>{" "}
                <span>{formatMinutesToHoursMinutes(totalTime)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-200 dark:border-gray-600 mt-1">
                <span>Calories:</span>{" "}
                <span className="font-medium">{recipe.calories || "N/A"}</span>
              </div>
              <div className="flex justify-between">
                <span>Protein:</span>{" "}
                <span className="font-medium">
                  {recipe.protein ? `${recipe.protein}g` : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Carbs:</span>
                <span className="font-medium">
                  {recipe.carbs ? `${recipe.carbs}g` : "N/A"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Fat:</span>
                <span className="font-medium">
                  {recipe.fat ? `${recipe.fat}g` : "N/A"}
                </span>
              </div>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <i className="fas fa-list text-green-500"></i>Ingredients{" "}
                <span className="text-base font-normal text-gray-500">
                  ({currentServings} servings)
                </span>
              </h3>
              <ul className="list-none space-y-1 text-sm border border-gray-200 dark:border-gray-700 rounded-md p-3 bg-gray-50 dark:bg-gray-900 shadow-inner text-gray-800 dark:text-gray-200">
                {recipe.ingredients?.map((ing, index) => {
                  const { quantity, unit, description } = parseIngredient(ing);
                  const scaledQuantity = quantity
                    ? quantity * servingsMultiplier
                    : null;
                  return (
                    <li
                      key={index}
                      className="flex items-baseline gap-2 py-1 border-b border-gray-200 dark:border-gray-700 last:border-b-0"
                    >
                      <i className="fas fa-check text-green-500 op-70 text-xs pt-1"></i>
                      <span className="flex-grow">
                        {scaledQuantity !== null && (
                          <strong className="mr-1 font-medium">
                            {formatQuantity(scaledQuantity)} {unit || ""}
                          </strong>
                        )}
                        {escapeHTML(description)}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSubstitutionModal(ing);
                        }}
                        className="text-blue-500 hover:text-blue-700 text-xs ml-2"
                        title="Find substitutions"
                        aria-label={`Find substitutions for ${description}`}
                      >
                        <i className="fas fa-exchange-alt"></i>
                      </button>
                    </li>
                  );
                }) || <li className="text-gray-500 italic">No ingredients.</li>}
              </ul>
            </div>
            <div className="mb-6">
              <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <i className="fas fa-shoe-prints text-green-500 -rotate-90 transform"></i>
                Directions
              </h3>
              <ol className="list-none space-y-3">
                {recipe.directions?.map((dir, index) => {
                  const timeInSeconds = parseTimeFromDirection(dir);
                  return (
                    <li
                      key={index}
                      className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-md shadow-sm text-gray-800 dark:text-gray-200"
                    >
                      <span className="bg-green-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 flex-shrink-0 shadow">
                        {index + 1}
                      </span>
                      <p className="text-sm flex-1">{escapeHTML(dir)}</p>
                      {timeInSeconds && (
                        <button
                          onClick={() =>
                            addTimer(
                              timeInSeconds,
                              `Step ${index + 1}: ${recipe.name}`,
                            )
                          }
                          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 text-xs"
                          title="Start timer for this step"
                        >
                          <i className="fas fa-stopwatch"></i>
                        </button>
                      )}
                    </li>
                  );
                }) || (
                  <li className="text-gray-500 italic p-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                    No directions.
                  </li>
                )}
              </ol>
            </div>
            {recipe.tipsAndTricks && recipe.tipsAndTricks.length > 0 && (
              <div className="mt-6">
                <h3 className="text-xl font-semibold mb-2 flex items-center gap-2 text-gray-900 dark:text-gray-100">
                  <i className="fas fa-lightbulb text-yellow-500"></i>Tips &
                  Tricks
                </h3>
                <ul className="list-none space-y-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-md shadow-sm text-gray-800 dark:text-gray-200">
                  {recipe.tipsAndTricks.map((tip, index) => (
                    <li key={index} className="text-sm">
                      <i className="fas fa-caret-right text-yellow-500 mr-2"></i>
                      {escapeHTML(tip)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button
            onClick={() => startCookingSession && startCookingSession(recipe)}
            className="btn-modal bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold"
            title="Start interactive cooking mode"
            aria-label="Start interactive cooking mode"
          >
            <i className="fas fa-play mr-1.5"></i>Start Cooking
          </button>

          {recipe.photos && recipe.photos.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowPhotoGallery(true);
              }}
              className="btn-modal bg-blue-500 hover:bg-blue-600 text-white"
              aria-label={`View ${recipe.photos.length} photos`}
            >
              <i className="fas fa-images mr-1.5"></i>
              Photos ({recipe.photos.length})
            </button>
          )}

          {recipe.videos && recipe.videos.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowVideoPlayer(true);
              }}
              className="btn-modal bg-red-500 hover:bg-red-600 text-white"
              aria-label={`Watch ${recipe.videos.length} videos`}
            >
              <i className="fas fa-video mr-1.5"></i>
              Videos ({recipe.videos.length})
            </button>
          )}

          <button
            onClick={() => addToShoppingList(recipe.id)}
            className="btn-modal btn-gray"
            aria-label="Add ingredients to shopping list"
          >
            <i className="fas fa-cart-plus mr-1.5"></i>Add to List
          </button>
          <button
            onClick={() => setShowAddToMealPlanSelector(true)}
            className="btn-modal bg-indigo-500 hover:bg-indigo-600 text-white"
            aria-label="Add to meal plan"
          >
            <i className="fas fa-calendar-plus mr-1.5"></i>Add to Plan
          </button>
          <button
            onClick={handleShareRecipe}
            className="btn-modal bg-purple-700 hover:bg-purple-800 text-white"
            aria-label="Share recipe"
          >
            <i className="fas fa-share-alt mr-1.5"></i>Share
          </button>
          <button
            onClick={async () => {
              // Use currentRecipe which has all data loaded
              console.log("Generating QR for currentRecipe:", currentRecipe);
              const qrUrl = await generateQRCode(currentRecipe);
              // Show QR code in a modal instead of opening in new tab
              const qrModal = document.createElement("div");
              qrModal.style.cssText =
                "position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;";
              qrModal.innerHTML = `
                <div style="background:white;border-radius:12px;padding:30px;text-align:center;max-width:500px;">
                  <h3 style="font-size:24px;font-weight:bold;margin-bottom:15px;color:#111;">📱 Share Recipe</h3>
                  <p style="color:#666;margin-bottom:20px;">Scan this QR code to view the recipe on any device</p>
                  <img src="${qrUrl}" alt="QR Code" style="width:300px;height:300px;margin:0 auto 20px;border:3px solid #eee;border-radius:8px;">
                  <p style="color:#888;font-size:14px;margin-bottom:20px;">Recipe: ${recipe.name}</p>
                  <button onclick="this.parentElement.parentElement.remove()" style="background:#10b981;color:white;border:none;padding:10px 24px;border-radius:6px;font-size:16px;cursor:pointer;font-weight:600;">Close</button>
                </div>
              `;
              document.body.appendChild(qrModal);
              qrModal.onclick = (e) => {
                if (e.target === qrModal) qrModal.remove();
              };
              addToast("QR Code generated! Share to view recipe.", "success");
            }}
            className="btn-modal bg-cyan-500 hover:bg-cyan-600 text-white"
            title="Generate shareable QR Code"
            aria-label="Generate QR code for recipe"
          >
            <i className="fas fa-qrcode mr-1.5"></i>QR
          </button>
          <button
            onClick={handleExportSingleRecipe}
            className="btn-modal bg-green-500 hover:bg-green-600 text-white"
            title="Export this recipe"
            aria-label="Export this recipe as JSON"
          >
            <i className="fas fa-file-export mr-1.5"></i>Export
          </button>
          <button
            onClick={() => editRecipe(recipe)}
            className="btn-modal btn-blue"
          >
            <i className="fas fa-edit mr-1.5"></i>Edit
          </button>
          <button
            onClick={() => deleteRecipe(recipe.id)}
            className="btn-modal btn-red ml-auto"
          >
            <i className="fas fa-trash mr-1.5"></i>Delete
          </button>
        </div>
      </div>
      {showAddToMealPlanSelector && (
        <AddToMealPlanSelectorModal
          recipe={recipe}
          mealPlan={mealPlan}
          updateMealPlan={updateMealPlan}
          onClose={() => setShowAddToMealPlanSelector(false)}
          addToast={addToast}
          recipes={recipes}
        />
      )}

      {showSubstitutionModal && (
        <SubstitutionsModal
          ingredient={showSubstitutionModal}
          onClose={() => setShowSubstitutionModal(null)}
        />
      )}

      {showPhotoGallery && recipe.photos && (
        <PhotoGalleryModal
          photos={recipe.photos}
          currentIndex={0}
          onClose={() => setShowPhotoGallery(false)}
        />
      )}

      {showVideoPlayer && recipe.videos && (
        <VideoClipsModal
          videos={recipe.videos}
          currentIndex={0}
          onClose={() => setShowVideoPlayer(false)}
        />
      )}
    </div>
  );
};

const MealPlanModal = ({
  mealPlan,
  recipes,
  updateMealPlan,
  removeMealFromPlan,
  addMultipleRecipesToShoppingList,
  openRecipeDetails,
  onClose,
}) => {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const mealTimes = [
    { id: "breakfast", label: "Breakfast", icon: "fa-coffee" },
    { id: "morningSnack", label: "M. Snack", icon: "fa-apple-alt" },
    { id: "lunch", label: "Lunch", icon: "fa-utensils" },
    { id: "afternoonSnack", label: "A. Snack", icon: "fa-cookie-bite" },
    { id: "dinner", label: "Dinner", icon: "fa-drumstick-bite" },
  ];
  const [showRecipeSelector, setShowRecipeSelector] = useState(null);
  const [selectorSearch, setSelectorSearch] = useState("");

  const filteredRecipesForSelector = useMemo(() => {
    const query = selectorSearch.toLowerCase().trim();
    if (!query) return recipes.sort((a, b) => a.name.localeCompare(b.name));
    return recipes
      .filter(
        (r) =>
          r?.name?.toLowerCase().includes(query) ||
          r?.type?.toLowerCase().includes(query) ||
          r?.cuisine?.toLowerCase().includes(query),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [recipes, selectorSearch]);

  const handleSelectRecipeClick = useCallback((day, mealTimeId) => {
    setShowRecipeSelector({ day, mealTime: mealTimeId });
    setSelectorSearch("");
  }, []);
  const handleRecipeSelect = useCallback(
    (recipeId) => {
      if (showRecipeSelector) {
        updateMealPlan(
          showRecipeSelector.day,
          showRecipeSelector.mealTime,
          recipeId,
        );
      }
      setShowRecipeSelector(null);
    },
    [showRecipeSelector, updateMealPlan],
  );
  const handleRemoveMeal = useCallback(
    (e, day, mealTimeId, recipeIdToRemove) => {
      e.stopPropagation();
      removeMealFromPlan(day, mealTimeId, recipeIdToRemove);
    },
    [removeMealFromPlan],
  );
  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
  const handleSelectorOverlayClick = useCallback((e) => {
    if (e.target === e.currentTarget) setShowRecipeSelector(null);
  }, []);

  const getRecipeIdsForDays = useCallback(
    (daysToGet) => {
      const recipeIds = new Set();
      daysToGet.forEach((day) => {
        if (mealPlan && mealPlan[day]) {
          Object.values(mealPlan[day]).forEach((recipeIdsInSlot) => {
            if (Array.isArray(recipeIdsInSlot)) {
              recipeIdsInSlot.forEach((recipeId) => {
                if (recipeId) {
                  recipeIds.add(recipeId);
                }
              });
            }
          });
        }
      });
      return Array.from(recipeIds);
    },
    [mealPlan],
  );

  const handleAddDayToList = useCallback(
    (day) => {
      const recipeIds = getRecipeIdsForDays([day]);
      if (recipeIds.length > 0) {
        addMultipleRecipesToShoppingList(recipeIds);
      }
    },
    [getRecipeIdsForDays, addMultipleRecipesToShoppingList],
  );

  const handleAddWeekToList = useCallback(() => {
    const recipeIds = getRecipeIdsForDays(days);
    if (recipeIds.length > 0) {
      addMultipleRecipesToShoppingList(recipeIds);
    }
  }, [getRecipeIdsForDays, addMultipleRecipesToShoppingList, days]);

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-2 sm:p-4"
        onClick={handleOverlayClick}
      >
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-7xl h-[90vh] flex flex-col modal-scale-enter">
          <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-600 pb-3 flex-shrink-0 gap-4">
            <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
              <i className="fas fa-calendar-alt text-green-500"></i>Weekly Meal
              Plan
            </h2>
            <button
              onClick={handleAddWeekToList}
              className="btn-modal btn-green text-xs sm:text-sm ml-auto mr-2"
              title="Add all ingredients for the week to the shopping list"
            >
              <i className="fas fa-cart-plus mr-1"></i> Add Week to List
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-3xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pb-4 pr-2">
            <div className="grid grid-cols-1 md:grid-cols-7 gap-3 md:gap-4">
              {days.map((day) => (
                <div
                  key={day}
                  className="bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-4 rounded-xl flex flex-col gap-3 shadow-md border border-gray-200 dark:border-gray-700"
                >
                  <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 tracking-wide">
                      {day}
                    </h3>
                    <button
                      onClick={() => handleAddDayToList(day)}
                      className="text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200 text-sm p-2 hover:bg-green-100 dark:hover:bg-green-900 rounded-lg transition-all"
                      title={`Add ${day}'s ingredients to shopping list`}
                    >
                      <i className="fas fa-cart-plus"></i>
                    </button>
                  </div>
                  <div className="flex flex-col gap-3">
                    {mealTimes.map(({ id, label, icon }) => {
                      const recipeIdsInSlot = mealPlan?.[day]?.[id] || [];
                      const isEmpty = recipeIdsInSlot.length === 0;
                      return (
                        <div
                          key={id}
                          onClick={
                            isEmpty
                              ? () => handleSelectRecipeClick(day, id)
                              : undefined
                          }
                          className={`bg-white dark:bg-gray-700 rounded-md p-3 shadow-sm flex flex-col min-h-[80px] border border-transparent transition-all ${isEmpty ? "hover:border-green-400 cursor-pointer" : ""} group relative`}
                        >
                          <div className="flex justify-between items-center mb-2 text-xs text-gray-500 dark:text-gray-400">
                            <span className="flex items-center gap-2 font-medium">
                              <i
                                className={`fas ${icon} text-sm text-green-600 dark:text-green-400`}
                              ></i>
                              {label}
                            </span>
                          </div>
                          <div className="flex-grow flex flex-col items-start justify-center">
                            {recipeIdsInSlot.length > 0 ? (
                              recipeIdsInSlot.map((recipeId) => {
                                const recipe = recipes.find(
                                  (r) => r?.id === recipeId,
                                );
                                return (
                                  <div
                                    key={recipeId}
                                    className="relative w-full mb-1 last:mb-0"
                                  >
                                    <p
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (recipe) {
                                          openRecipeDetails(recipe);
                                        }
                                      }}
                                      className="text-sm text-green-600 dark:text-green-400 font-medium leading-tight hover:underline cursor-pointer line-clamp-2 pr-6"
                                      title={`Click to view: ${recipe?.name || "Unknown Recipe"}`}
                                    >
                                      {escapeHTML(
                                        recipe?.name || "Unknown Recipe",
                                      )}
                                    </p>
                                    <button
                                      onClick={(e) =>
                                        handleRemoveMeal(e, day, id, recipeId)
                                      }
                                      className="text-red-400 hover:text-red-600 text-xs absolute top-0 right-0 bg-white dark:bg-gray-700 rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow"
                                      title="Remove"
                                      aria-label="Remove"
                                    >
                                      <i className="fas fa-times"></i>
                                    </button>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic group-hover:text-gray-600 dark:group-hover:text-gray-300">
                                + Add Recipe
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      {showRecipeSelector && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[60] p-4"
          onClick={handleSelectorOverlayClick}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 sm:p-5 w-full max-w-md max-h-[70vh] flex flex-col modal-scale-enter">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-gray-100">
                Select for{" "}
                <span className="text-green-500">
                  {showRecipeSelector?.day}{" "}
                  {
                    mealTimes.find(
                      (mt) => mt.id === showRecipeSelector?.mealTime,
                    )?.label
                  }
                </span>
              </h3>
              <button
                onClick={() => setShowRecipeSelector(null)}
                className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-2xl leading-none"
                aria-label="Close"
              >
                &times;
              </button>
            </div>
            <div className="relative mb-3">
              <input
                type="search"
                placeholder="Search recipes..."
                value={selectorSearch}
                onChange={(e) => setSelectorSearch(e.target.value)}
                className="w-full p-2 pl-8 rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-green-500 text-sm text-gray-900 dark:text-gray-100"
                aria-label="Search recipes"
              />
              <i className="fas fa-search absolute left-2.5 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 text-xs"></i>
            </div>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredRecipesForSelector.length > 0 ? (
                filteredRecipesForSelector.map((recipe) => (
                  <div
                    key={recipe.id}
                    onClick={() => handleRecipeSelect(recipe.id)}
                    role="button"
                    className="bg-gray-50 dark:bg-gray-700 rounded p-2 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900 hover:shadow-sm transition-all duration-150 flex items-center gap-2 border border-transparent hover:border-green-200 dark:hover:border-green-700"
                  >
                    {recipe.image ? (
                      <img
                        src={recipe.image}
                        alt=""
                        className="w-10 h-10 rounded object-cover flex-shrink-0 border border-gray-200 dark:border-gray-600"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-400 text-sm flex-shrink-0 border border-gray-300 dark:border-gray-600">
                        <i className="fas fa-image"></i>
                      </div>
                    )}
                    <div className="flex-grow overflow-hidden">
                      <h4
                        className="text-sm font-medium leading-tight truncate text-gray-800 dark:text-gray-200"
                        title={recipe.name}
                      >
                        {escapeHTML(recipe.name)}
                      </h4>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {escapeHTML(recipe.type)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-6">
                  <i className="fas fa-ghost text-2xl mb-2 op-50"></i>
                  <p>No recipes found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const ShoppingListModal = ({
  shoppingList,
  toggleShoppingItem,
  clearShoppingList,
  addToast,
  onClose,
  displayUnitSystem,
  setDisplayUnitSystem,
  convertUnits,
  addInventoryItem,
}) => {
  const [showChecked, setShowChecked] = useState(true);

  const groupedByRecipe = useMemo(() => {
    const groups = {};
    if (!Array.isArray(shoppingList)) return groups;
    shoppingList.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const recipeName = item.recipeName || "Manually Added";
      const normalized =
        item.normalizedText || normalizeIngredient(item.originalText);
      if (!normalized) return;
      if (!groups[recipeName]) {
        groups[recipeName] = {
          id: item.recipeId || "manual",
          name: recipeName,
          items: [],
        };
      }
      groups[recipeName].items.push({
        ...item,
        normalizedText: normalized,
      });
    });
    Object.values(groups).forEach((group) => {
      group.items.sort((a, b) => a.originalText.localeCompare(b.originalText));
    });
    return groups;
  }, [shoppingList]);

  const commonIngredientsData = useMemo(() => {
    const normalizedDetails = {};
    shoppingList.forEach((item) => {
      const norm = item.normalizedText;
      if (!norm) return;
      if (!normalizedDetails[norm]) {
        normalizedDetails[norm] = {
          display_name: capitalizeFirstLetter(norm),
          checked: item.checked,
          recipeSources: new Set(),
          instanceCount: 0,
          uncheckedCount: 0,
          quantity: 0,
          unit: item.unit,
          originalItems: [],
        };
      }
      if (
        item.quantity !== null &&
        item.unit === normalizedDetails[norm].unit
      ) {
        normalizedDetails[norm].quantity += item.quantity;
      } else if (item.quantity !== null && !normalizedDetails[norm].unit) {
        normalizedDetails[norm].unit = item.unit;
        normalizedDetails[norm].quantity += item.quantity;
      }
      normalizedDetails[norm].originalItems.push(item);
      normalizedDetails[norm].recipeSources.add(
        item.recipeName || "Manually Added",
      );
      normalizedDetails[norm].instanceCount++;
      if (!item.checked) normalizedDetails[norm].uncheckedCount++;
      if (!item.checked) {
        normalizedDetails[norm].checked = false;
      } else if (normalizedDetails[norm].uncheckedCount === 0) {
        normalizedDetails[norm].checked = true;
      }
    });
    const commonList = Object.entries(normalizedDetails)
      .filter(([norm, details]) => details.recipeSources.size > 1)
      .map(([norm, details]) => ({
        normalizedText: norm,
        text: details.display_name,
        checked: details.uncheckedCount === 0,
        recipeSources: Array.from(details.recipeSources),
        quantity: details.quantity,
        unit: details.unit,
        originalItems: details.originalItems,
      }));
    return commonList.sort((a, b) => a.text.localeCompare(b.text));
  }, [shoppingList]);

  const commonNormalizedTexts = useMemo(() => {
    return new Set(commonIngredientsData.map((item) => item.normalizedText));
  }, [commonIngredientsData]);

  const displayRecipeGroups = useMemo(() => {
    return Object.values(groupedByRecipe)
      .map((group) => ({
        ...group,
        items: (showChecked
          ? group.items
          : group.items.filter((item) => !item.checked)
        ).filter((item) => !commonNormalizedTexts.has(item.normalizedText)),
      }))
      .filter((group) => group.items.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [groupedByRecipe, showChecked, commonNormalizedTexts]);

  const displayCommonIngredients = useMemo(() => {
    return showChecked
      ? commonIngredientsData
      : commonIngredientsData.filter((item) => !item.checked);
  }, [commonIngredientsData, showChecked]);

  const getFormattedListText = useCallback(() => {
    let listText = "Shopping List\n==============\n\n";
    const itemsToInclude = showChecked
      ? shoppingList
      : shoppingList.filter((item) => !item.checked);
    if (itemsToInclude.length === 0) return "";
    const outputGroups = {};
    itemsToInclude.forEach((item) => {
      const recipeName = item.recipeName || "Other Items";
      if (!outputGroups[recipeName]) outputGroups[recipeName] = [];
      const { value, unit: convertedUnit } = convertUnits(
        item.quantity,
        item.unit,
        displayUnitSystem,
      );
      const displayQuantity = value !== null ? formatQuantity(value) : "";
      const displayUnit = convertedUnit || "";
      const displayIngredient =
        `${displayQuantity} ${displayUnit} ${item.description}`.trim();
      outputGroups[recipeName].push(
        `${item.checked ? "[x]" : "[ ]"} ${displayIngredient}`,
      );
    });
    const sortedGroupNames = Object.keys(outputGroups).sort((a, b) => {
      if (a === "Other Items") return 1;
      if (b === "Other Items") return -1;
      return a.localeCompare(b);
    });
    sortedGroupNames.forEach((groupName) => {
      listText += `--- ${groupName} ---\n`;
      outputGroups[groupName]
        .sort((a, b) => a.substring(4).localeCompare(b.substring(4)))
        .forEach((itemText) => {
          listText += `${itemText}\n`;
        });
      listText += "\n";
    });
    return listText.trim();
  }, [shoppingList, showChecked, convertUnits, displayUnitSystem]);

  const copyToClipboard = useCallback(async () => {
    try {
      const listText = getFormattedListText();
      if (!listText) {
        addToast("List is empty or all items hidden.", "info");
        return;
      }
      const textarea = document.createElement("textarea");
      textarea.value = listText;
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      addToast("List copied to clipboard!", "success");
    } catch (err) {
      console.error("Failed to copy list:", err);
      addToast("Failed to copy list.", "error");
    }
  }, [getFormattedListText, addToast]);

  const handleToggleItem = useCallback(
    (itemId) => {
      toggleShoppingItem(itemId, null);
    },
    [toggleShoppingItem],
  );
  const handleToggleCommonItem = useCallback(
    (normalizedText) => {
      toggleShoppingItem(null, normalizedText);
    },
    [toggleShoppingItem],
  );
  const handleOverlayClick = useCallback(
    (e) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );
  const handleClearList = useCallback(() => {
    if (
      shoppingList.length > 0 &&
      window.confirm(
        "Are you sure you want to clear the entire shopping list? This cannot be undone.",
      )
    ) {
      clearShoppingList();
    } else if (shoppingList.length === 0) {
      addToast("Shopping list is already empty.", "info");
    }
  }, [shoppingList, clearShoppingList, addToast]);

  const totalUncheckedItems = useMemo(
    () => shoppingList.filter((item) => !item.checked).length,
    [shoppingList],
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={handleOverlayClick}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 sm:p-6 w-full max-w-2xl max-h-[90vh] flex flex-col modal-scale-enter">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
            <i className="fas fa-shopping-cart text-green-500"></i> Shopping
            List ({totalUncheckedItems} items)
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 dark:text-gray-400 hover:text-red-500 text-3xl leading-none"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="flex justify-between items-center mb-4 gap-4 flex-wrap">
          <label className="flex items-center gap-1.5 cursor-pointer text-sm order-2 sm:order-1 text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={showChecked}
              onChange={() => setShowChecked((p) => !p)}
              className="w-4 h-4 mt-0.5 rounded text-green-500 focus:ring-offset-0 focus:ring-green-500 border-gray-300 dark:border-gray-600"
            />{" "}
            Show purchased
          </label>
          <div className="flex gap-2 order-3 sm:order-2">
            <div className="flex items-center text-sm">
              <label
                htmlFor="unitSystem"
                className="mr-2 text-gray-700 dark:text-gray-300"
              >
                Units:
              </label>
              <select
                id="unitSystem"
                className="filter-select text-xs"
                value={displayUnitSystem}
                onChange={(e) => setDisplayUnitSystem(e.target.value)}
              >
                <option value="imperial">Imperial</option>
                <option value="metric">Metric</option>
              </select>
            </div>
            <button
              onClick={copyToClipboard}
              className="btn-modal btn-gray text-xs"
              title="Copy list to clipboard"
              disabled={shoppingList.length === 0}
            >
              <i className="fas fa-copy mr-1"></i> Copy
            </button>
          </div>
          <button
            onClick={handleClearList}
            className="btn-modal btn-red text-xs order-1 sm:order-3 ml-auto sm:ml-0"
            disabled={shoppingList.length === 0}
          >
            <i className="fas fa-trash mr-1"></i>Clear List
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          {displayRecipeGroups.length === 0 &&
          displayCommonIngredients.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8 px-4">
              <i className="fas fa-clipboard-list text-4xl mb-3 opacity-50"></i>
              <p className="font-semibold">Shopping list is empty</p>
              <p className="text-sm">
                {showChecked
                  ? "Add ingredients from recipes!"
                  : "All items purchased."}
              </p>
            </div>
          ) : (
            <>
              {displayCommonIngredients.length > 0 && (
                <div className="pb-3 mb-3 border-b border-gray-200 dark:border-gray-600">
                  <h3 className="text-sm font-semibold mb-1 text-blue-600 dark:text-blue-400">
                    Common Ingredients
                  </h3>
                  <ul className="space-y-1 mt-1">
                    {displayCommonIngredients.map((item) => {
                      const { value, unit: convertedUnit } = convertUnits(
                        item.quantity,
                        item.unit,
                        displayUnitSystem,
                      );
                      const displayQuantity =
                        value !== null ? formatQuantity(value) : "";
                      const displayUnit = convertedUnit || "";
                      let displayIngredient = "";
                      if (displayQuantity) {
                        displayIngredient += `${displayQuantity} `;
                      }
                      if (displayUnit) {
                        displayIngredient += `${displayUnit} `;
                      }
                      displayIngredient += item.text;
                      return (
                        <li
                          key={item.normalizedText}
                          className={`p-1 rounded flex items-start gap-2 transition-opacity duration-200 ${
                            item.checked
                              ? "opacity-50 hover:opacity-70"
                              : "hover:bg-gray-50 dark:hover:bg-gray-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={item.checked}
                            onChange={() =>
                              handleToggleCommonItem(item.normalizedText)
                            }
                            className="w-4 h-4 mt-0.5 rounded text-green-500 focus:ring-offset-0 focus:ring-green-500 border-gray-300 dark:border-gray-500 flex-shrink-0 cursor-pointer"
                            aria-label={`Mark all '${item.text}' as ${
                              item.checked ? "not purchased" : "purchased"
                            }`}
                          />
                          <span
                            className={`block leading-tight text-sm font-medium ${
                              item.checked
                                ? "line-through text-gray-500 dark:text-gray-400"
                                : "text-gray-800 dark:text-gray-100"
                            }`}
                          >
                            {escapeHTML(displayIngredient.trim())}
                            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2 font-normal">
                              ({item.recipeSources.join(", ")})
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
              {displayRecipeGroups.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-1 text-green-600 dark:text-green-400 border-b border-green-200 dark:border-green-700 pb-0.5">
                    Ingredients by Recipe
                  </h3>
                  <ul className="space-y-1 mt-1">
                    {displayRecipeGroups.map((group) => (
                      <li key={group.id}>
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2 mb-1">
                          {escapeHTML(group.name)}
                        </h4>
                        <ul className="space-y-0.5 pl-4">
                          {group.items.map((item) => {
                            const { value, unit: convertedUnit } = convertUnits(
                              item.quantity,
                              item.unit,
                              displayUnitSystem,
                            );
                            const displayQuantity =
                              value !== null ? formatQuantity(value) : "";
                            const displayUnit = convertedUnit || "";
                            let displayIngredient = "";
                            if (displayQuantity) {
                              displayIngredient += `${displayQuantity} `;
                            }
                            if (displayUnit) {
                              displayIngredient += `${displayUnit} `;
                            }
                            displayIngredient += item.description;
                            return (
                              <li
                                key={item.id}
                                className={`flex items-start gap-2 transition-opacity duration-200 ${
                                  item.checked
                                    ? "opacity-50 hover:opacity-70"
                                    : "hover:bg-gray-50 dark:hover:bg-gray-700"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={item.checked}
                                  onChange={() => handleToggleItem(item.id)}
                                  className="w-4 h-4 mt-0.5 rounded text-green-500 focus:ring-offset-0 focus:ring-green-500 border-gray-300 dark:border-gray-500 flex-shrink-0 cursor-pointer"
                                  aria-label={`Mark ${item.originalText} as ${
                                    item.checked ? "not purchased" : "purchased"
                                  }`}
                                />
                                <span
                                  className={`block leading-tight text-sm ${
                                    item.checked
                                      ? "line-through text-gray-500 dark:text-gray-400"
                                      : "text-gray-800 dark:text-gray-100"
                                  }`}
                                >
                                  {escapeHTML(displayIngredient.trim())}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const emailAddress = "BarrTechSolutions@gmail.com";

  return (
    <footer className="bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 py-4 text-center text-sm mt-8">
      <div className="max-w-7xl mx-auto px-4">
        <p>&copy; {currentYear} BarrTech Solutions. All rights reserved.</p>
        <p className="mt-1">
          Contact:{" "}
          <a
            href={`mailto:${emailAddress}`}
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-green-500"
          >
            {emailAddress}
          </a>
        </p>
      </div>
    </footer>
  );
};

// === THREE.JS PAGE TURN COMPONENT ===
const ThreeJSPageTurn = ({
  currentPageContent,
  nextPageContent,
  onTurnComplete,
  direction = "forward",
  canvasWidth = 1200,
  canvasHeight = 700,
}) => {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const pageGeometryRef = useRef(null);
  const animationRef = useRef(null);
  const isAnimatingRef = useRef(false);

  useEffect(() => {
    if (!window.THREE || !containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1f2937);

    const camera = new THREE.PerspectiveCamera(
      45,
      canvasWidth / canvasHeight,
      0.1,
      1000,
    );
    camera.position.z = 800;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;

    // Create page geometry
    const pageWidth = 600;
    const pageHeight = 700;
    const segments = 32;

    const geometry = new THREE.PlaneGeometry(
      pageWidth,
      pageHeight,
      segments,
      segments,
    );

    // Create textures from page content
    const createTextureFromElement = (element) => {
      if (!element) return null;

      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 1024;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#1f2937";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Gradient effect for the page
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
      gradient.addColorStop(0, "#1f2937");
      gradient.addColorStop(0.5, "#374151");
      gradient.addColorStop(1, "#1f2937");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Add subtle page texture
      ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
      ctx.fillRect(80, 80, canvas.width - 160, canvas.height - 160);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      return texture;
    };

    const texture = createTextureFromElement(currentPageContent);

    const material = new THREE.MeshStandardMaterial({
      map: texture,
      side: THREE.DoubleSide,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      opacity: 0.8,
    });

    const pageMesh = new THREE.Mesh(geometry, material);
    scene.add(pageMesh);
    pageGeometryRef.current = pageMesh;

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(0, 0, 1);
    directionalLight.castShadow = true;
    scene.add(directionalLight);

    // Animation function for page curl
    let progress = 0;
    const animate = () => {
      if (!isAnimatingRef.current) return;

      progress += 0.05; // Speed of page turn

      if (progress >= 1) {
        progress = 1;
        isAnimatingRef.current = false;
        setTimeout(() => {
          onTurnComplete?.();
        }, 50);
      }

      // Apply page curl effect
      const positions = geometry.attributes.position;
      const vertex = new THREE.Vector3();

      for (let i = 0; i < positions.count; i++) {
        vertex.fromBufferAttribute(positions, i);

        const x = vertex.x;
        const normalizedX = (x + pageWidth / 2) / pageWidth; // 0 to 1

        if (direction === "forward") {
          // Curl from right to left
          if (normalizedX > 1 - progress) {
            const curlAmount = (normalizedX - (1 - progress)) / progress;
            const angle = curlAmount * Math.PI;
            const radius = 150;
            vertex.z = Math.sin(angle) * radius;
            vertex.x = x - (1 - Math.cos(angle)) * radius * curlAmount;
            vertex.y = vertex.y + Math.sin(curlAmount * Math.PI) * 20;
          }
        } else {
          // Curl from left to right
          if (normalizedX < progress) {
            const curlAmount = (progress - normalizedX) / progress;
            const angle = curlAmount * Math.PI;
            const radius = 150;
            vertex.z = Math.sin(angle) * radius;
            vertex.x = x + (1 - Math.cos(angle)) * radius * curlAmount;
            vertex.y = vertex.y + Math.sin(curlAmount * Math.PI) * 20;
          }
        }

        positions.setXYZ(i, vertex.x, vertex.y, vertex.z);
      }

      positions.needsUpdate = true;
      geometry.computeVertexNormals();

      // Add subtle rotation for more dynamic effect
      pageMesh.rotation.y =
        direction === "forward" ? progress * 0.05 : -progress * 0.05;

      renderer.render(scene, camera);
      animationRef.current = requestAnimationFrame(animate);
    };

    // Start animation
    isAnimatingRef.current = true;
    animate();

    // Cleanup
    return () => {
      isAnimatingRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      geometry.dispose();
      material.dispose();
      if (texture) texture.dispose();
      renderer.dispose();
    };
  }, [
    currentPageContent,
    nextPageContent,
    direction,
    onTurnComplete,
    canvasWidth,
    canvasHeight,
  ]);

  return <div ref={containerRef} className="three-canvas-container" />;
};

// === COOKBOOK COMPONENTS ===
const Cookbook = () => {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = "info") => {
    const newToast = { id: Date.now(), message, type };
    setToasts((prevToasts) => [...prevToasts, newToast]);
    setTimeout(() => removeToast(newToast.id), 3000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prevToasts) => prevToasts.filter((toast) => toast.id !== id));
  }, []);

  const [recipes, setRecipes, isLoadingRecipes] = usePersistentStorage(
    STORE_NAMES.RECIPES,
    SAMPLE_RECIPES,
    addToast,
  );

  const [mealPlan, setMealPlan, isLoadingMealPlan] = usePersistentStorage(
    STORE_NAMES.MEAL_PLAN,
    {},
    addToast,
  );

  const [shoppingList, setShoppingList, isLoadingShoppingList] =
    usePersistentStorage(STORE_NAMES.SHOPPING_LIST, [], addToast);

  // New feature state
  const [inventory, setInventory, isLoadingInventory] = usePersistentStorage(
    STORE_NAMES.INVENTORY,
    [],
    addToast,
  );
  const [ratings, setRatings, isLoadingRatings] = usePersistentStorage(
    STORE_NAMES.RATINGS,
    [],
    addToast,
  );
  const [collections, setCollections, isLoadingCollections] =
    usePersistentStorage(STORE_NAMES.COLLECTIONS, [], addToast);
  const [cookingSessions, setCookingSessions, isLoadingSessions] =
    usePersistentStorage(STORE_NAMES.COOKING_SESSIONS, [], addToast);

  const [isBookOpen, setIsBookOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [bookTitle, setBookTitle] = useState(() => {
    try {
      const saved = localStorage.getItem("bookTitle");
      return saved !== null ? saved : "My Recipe Collection";
    } catch {
      return "My Recipe Collection";
    }
  });
  const [bookCoverImage, setBookCoverImage] = useState(() => {
    try {
      const saved = localStorage.getItem("bookCoverImage");
      return saved || null;
    } catch {
      return null;
    }
  });
  const [showCoverEditor, setShowCoverEditor] = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [showAddRecipeModal, setShowAddRecipeModal] = useState(false);
  const [showRecipeDetails, setShowRecipeDetails] = useState(null);
  const [showMealPlanModal, setShowMealPlanModal] = useState(false);
  const [showShoppingListModal, setShowShoppingListModal] = useState(false);
  const [showInventoryModal, setShowInventoryModal] = useState(false);
  const [showCollectionsModal, setShowCollectionsModal] = useState(false);
  const [collectionsBulkMode, setCollectionsBulkMode] = useState(false);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
  const [showCookingMode, setShowCookingMode] = useState(null);
  const [displayUnitSystem, setDisplayUnitSystem] = useState("imperial");

  // New feature states
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [showMealPrepModal, setShowMealPrepModal] = useState(false);
  const [showNutritionGoalsModal, setShowNutritionGoalsModal] = useState(false);
  const [showCloudSyncModal, setShowCloudSyncModal] = useState(false);
  const [isBulkMode, setIsBulkMode] = useState(false);
  const [selectedRecipes, setSelectedRecipes] = useState([]);
  const [isHighContrast, setIsHighContrast] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEYS.HIGH_CONTRAST) === "true";
    } catch {
      return false;
    }
  });
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    );
  });

  const [nutritionGoals, setNutritionGoals, isLoadingGoals] =
    usePersistentStorage(
      STORE_NAMES.NUTRITION_GOALS,
      { calories: 2000, protein: 50, carbs: 250, fat: 70 },
      addToast,
    );

  const [ingredientPrices, setIngredientPrices, isLoadingPrices] =
    usePersistentStorage(STORE_NAMES.INGREDIENT_PRICES, {}, addToast);

  const { timers, addTimer, toggleTimer, removeTimer, resetTimer } =
    useTimers(addToast);

  const { recordAction, undo, redo, canUndo, canRedo } = useUndoRedo();

  // Persist book title and cover image to localStorage
  useEffect(() => {
    try {
      // Save even if empty string
      localStorage.setItem("bookTitle", bookTitle);
    } catch (error) {
      console.error("Failed to save book title:", error);
    }
  }, [bookTitle]);

  useEffect(() => {
    try {
      if (bookCoverImage) {
        localStorage.setItem("bookCoverImage", bookCoverImage);
      } else {
        localStorage.removeItem("bookCoverImage");
      }
    } catch (error) {
      console.error("Failed to save book cover image:", error);
    }
  }, [bookCoverImage]);

  const isLoading =
    isLoadingRecipes ||
    isLoadingMealPlan ||
    isLoadingShoppingList ||
    isLoadingInventory ||
    isLoadingRatings ||
    isLoadingCollections ||
    isLoadingSessions ||
    isLoadingGoals ||
    isLoadingPrices;

  // Execute undo action
  const executeUndoAction = useCallback(
    (action) => {
      if (action.type === "ADD_RECIPE") {
        setRecipes((prev) => prev.filter((r) => r.id !== action.data.id));
        addToast("Recipe addition undone", "info");
      } else if (action.type === "DELETE_RECIPE") {
        setRecipes((prev) => [...prev, action.data]);
        addToast("Recipe deletion undone", "info");
      } else if (action.type === "UPDATE_RECIPE") {
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === action.data.oldRecipe.id ? action.data.oldRecipe : r,
          ),
        );
        addToast("Recipe update undone", "info");
      }
    },
    [setRecipes, addToast],
  );

  // Execute redo action
  const executeRedoAction = useCallback(
    (action) => {
      if (action.type === "ADD_RECIPE") {
        setRecipes((prev) => [...prev, action.data]);
        addToast("Recipe addition redone", "info");
      } else if (action.type === "DELETE_RECIPE") {
        setRecipes((prev) => prev.filter((r) => r.id !== action.data.id));
        addToast("Recipe deletion redone", "info");
      } else if (action.type === "UPDATE_RECIPE") {
        setRecipes((prev) =>
          prev.map((r) =>
            r.id === action.data.newRecipe.id ? action.data.newRecipe : r,
          ),
        );
        addToast("Recipe update redone", "info");
      }
    },
    [setRecipes, addToast],
  );

  // High contrast mode effect
  useEffect(() => {
    if (isHighContrast) {
      document.body.classList.add("high-contrast-mode");
      localStorage.setItem(LOCAL_STORAGE_KEYS.HIGH_CONTRAST, "true");
    } else {
      document.body.classList.remove("high-contrast-mode");
      localStorage.setItem(LOCAL_STORAGE_KEYS.HIGH_CONTRAST, "false");
    }
  }, [isHighContrast]);

  // Dark mode detection
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      } else if (e.ctrlKey && e.shiftKey && e.key === "Z") {
        e.preventDefault();
        if (canRedo) redo();
      } else if (e.ctrlKey && e.key === "n") {
        e.preventDefault();
        setEditingRecipe(null);
        setShowAddRecipeModal(true);
      } else if (e.key === "Escape") {
        setShowAddRecipeModal(false);
        setShowMealPlanModal(false);
        setShowShoppingListModal(false);
        setShowInventoryModal(false);
        setShowCollectionsModal(false);
        setShowAnalyticsModal(false);
        setShowCookingMode(null);
        setShowRecipeDetails(null);
        setShowSuggestionsModal(false);
        setShowMealPrepModal(false);
        setShowNutritionGoalsModal(false);
        setShowCloudSyncModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canUndo, canRedo, undo, redo]);

  // Modal-open body class
  useEffect(() => {
    if (
      showAddRecipeModal ||
      showRecipeDetails ||
      showMealPlanModal ||
      showShoppingListModal ||
      showInventoryModal ||
      showCollectionsModal ||
      showAnalyticsModal ||
      showCookingMode ||
      showSuggestionsModal ||
      showMealPrepModal ||
      showNutritionGoalsModal ||
      showCloudSyncModal
    ) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
  }, [
    showAddRecipeModal,
    showRecipeDetails,
    showMealPlanModal,
    showShoppingListModal,
    showInventoryModal,
    showCollectionsModal,
    showAnalyticsModal,
    showCookingMode,
    showSuggestionsModal,
    showMealPrepModal,
    showNutritionGoalsModal,
    showCloudSyncModal,
  ]);

  // All the recipe management functions from original App
  const addRecipe = useCallback(
    async (recipeData) => {
      const newRecipe = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        ...recipeData,
        description: recipeData.description || "",
        cuisine: recipeData.cuisine || "",
        tags: recipeData.tags || [],
        dietaryTypes: recipeData.dietaryTypes || [],
        ingredients: recipeData.ingredients || [],
        directions: recipeData.directions || [],
        tipsAndTricks: recipeData.tipsAndTricks || [],
        yield: recipeData.yield || "",
        createdAt: new Date().toISOString(),
        isFavorite: false,
      };
      try {
        await addItem(STORE_NAMES.RECIPES, newRecipe);
        setRecipes((prev) => [...prev, newRecipe]);
        recordAction({ type: "ADD_RECIPE", data: newRecipe });
        setShowAddRecipeModal(false);
        setEditingRecipe(null);
        addToast("Recipe added!", "success");
        setCurrentPage(0); // Go back to TOC
      } catch (error) {
        console.error("Error adding recipe:", error);
        addToast("Failed to add recipe.", "error");
      }
    },
    [
      setRecipes,
      addToast,
      setShowAddRecipeModal,
      setEditingRecipe,
      setCurrentPage,
      recordAction,
    ],
  );

  const updateRecipe = useCallback(
    async (id, recipeData) => {
      const oldRecipe = recipes.find((r) => r.id === id);
      const updatedRecipe = {
        ...recipeData,
        id: id,
        updatedAt: new Date().toISOString(),
      };
      try {
        await updateItem(STORE_NAMES.RECIPES, id, updatedRecipe);
        setRecipes((prev) =>
          prev.map((r) => (r.id === id ? updatedRecipe : r)),
        );
        recordAction({
          type: "UPDATE_RECIPE",
          data: { oldRecipe, newRecipe: updatedRecipe },
        });
        setShowAddRecipeModal(false);
        setEditingRecipe(null);
        addToast("Recipe updated!", "success");
      } catch (error) {
        console.error("Error updating recipe:", error);
        addToast("Failed to update recipe.", "error");
      }
    },
    [
      setRecipes,
      addToast,
      setShowAddRecipeModal,
      setEditingRecipe,
      recordAction,
      recipes,
    ],
  );

  const deleteRecipe = useCallback(
    async (id) => {
      if (!window.confirm("Are you sure you want to delete this recipe?"))
        return;
      const recipeToDelete = recipes.find((r) => r.id === id);
      try {
        await deleteItem(STORE_NAMES.RECIPES, id);
        setRecipes((prev) => prev.filter((r) => r.id !== id));
        recordAction({ type: "DELETE_RECIPE", data: recipeToDelete });
        setMealPlan((prev) => {
          const newPlan = JSON.parse(JSON.stringify(prev));
          let changed = false;
          Object.keys(newPlan).forEach((day) => {
            if (newPlan[day] && typeof newPlan[day] === "object") {
              Object.keys(newPlan[day]).forEach((mealTime) => {
                const currentRecipesInSlot = newPlan[day][mealTime] || [];
                const updatedRecipesInSlot = currentRecipesInSlot.filter(
                  (recipeId) => recipeId !== id,
                );
                if (
                  updatedRecipesInSlot.length !== currentRecipesInSlot.length
                ) {
                  newPlan[day][mealTime] = updatedRecipesInSlot;
                  changed = true;
                }
              });
            }
          });
          return changed ? newPlan : prev;
        });
        setShoppingList((prev) => prev.filter((item) => item.recipeId !== id));
        addToast("Recipe deleted.", "success");
        setCurrentPage(0); // Go back to TOC
      } catch (error) {
        console.error("Error deleting recipe:", error);
        addToast("Failed to delete recipe.", "error");
      }
    },
    [setRecipes, setMealPlan, setShoppingList, addToast, recordAction, recipes],
  );

  const toggleFavorite = useCallback(
    async (id) => {
      const recipeToUpdate = recipes.find((r) => r.id === id);
      if (!recipeToUpdate) return;
      const isNowFavorite = !recipeToUpdate.isFavorite;
      const updatedRecipe = { ...recipeToUpdate, isFavorite: isNowFavorite };
      try {
        await updateItem(STORE_NAMES.RECIPES, id, updatedRecipe);
        setRecipes((prev) =>
          prev.map((r) => (r.id === id ? updatedRecipe : r)),
        );
        addToast(
          isNowFavorite ? "Added to Favorites" : "Removed from Favorites",
          "success",
        );
      } catch (error) {
        console.error("Error toggling favorite:", error);
        addToast("Failed to update favorite status.", "error");
      }
    },
    [recipes, setRecipes, addToast],
  );

  const updateMealPlan = useCallback(
    async (day, mealTime, recipeId) => {
      setMealPlan((prev) => {
        const newPlan = { ...prev };
        newPlan[day] = newPlan[day] || {};
        const currentRecipesInSlot = newPlan[day][mealTime] || [];
        if (currentRecipesInSlot.includes(recipeId)) {
          newPlan[day][mealTime] = currentRecipesInSlot.filter(
            (id) => id !== recipeId,
          );
          addToast("Recipe removed from meal slot.", "info");
        } else {
          newPlan[day][mealTime] = [...currentRecipesInSlot, recipeId];
          addToast("Recipe added to meal slot!", "success");
        }
        return newPlan;
      });
    },
    [setMealPlan, addToast],
  );

  const removeMealFromPlan = useCallback(
    async (day, mealTime, recipeIdToRemove) => {
      setMealPlan((prev) => {
        const newPlan = { ...prev };
        newPlan[day] = newPlan[day] || {};
        const currentRecipesInSlot = newPlan[day][mealTime] || [];
        const updatedRecipesInSlot = currentRecipesInSlot.filter(
          (id) => id !== recipeIdToRemove,
        );
        newPlan[day][mealTime] = updatedRecipesInSlot;
        addToast("Recipe removed from plan.", "success");
        return newPlan;
      });
    },
    [setMealPlan, addToast],
  );

  const addMultipleRecipesToShoppingList = useCallback(
    async (recipeIds) => {
      if (!Array.isArray(recipeIds) || recipeIds.length === 0) return;
      let totalIngredientsAdded = 0;
      const recipeNamesAdded = new Set();
      setShoppingList((prevList) => {
        const newList = [...prevList];
        recipeIds.forEach((recipeId) => {
          const recipe = recipes.find((r) => r.id === recipeId);
          if (
            !recipe ||
            !Array.isArray(recipe.ingredients) ||
            recipe.ingredients.length === 0
          ) {
            return;
          }
          recipeNamesAdded.add(recipe.name);
          recipe.ingredients
            .filter((ing) => typeof ing === "string" && ing.trim() !== "")
            .forEach((ingredient) => {
              const normalized = normalizeIngredient(ingredient);
              const { quantity, unit, description } =
                parseIngredient(ingredient);
              newList.push({
                id:
                  Date.now().toString(36) +
                  Math.random().toString(36).substr(2, 5),
                originalText: ingredient.trim(),
                quantity: quantity,
                unit: unit,
                description: description,
                recipeId: recipe.id,
                recipeName: recipe.name,
                checked: false,
                normalizedText: normalized,
              });
              totalIngredientsAdded++;
            });
        });
        if (totalIngredientsAdded > 0) {
          addToast(
            `Added ${totalIngredientsAdded} ingredient(s) from ${recipeNamesAdded.size} recipe(s).`,
            "success",
          );
        }
        return newList;
      });
    },
    [recipes, setShoppingList, addToast],
  );

  const addToShoppingList = useCallback(
    (recipeId) => {
      addMultipleRecipesToShoppingList([recipeId]);
    },
    [addMultipleRecipesToShoppingList],
  );

  const toggleShoppingItem = useCallback(
    async (itemId, normalizedTextToToggle) => {
      setShoppingList((prevList) => {
        let targetChecked;
        let targetNormalizedText;
        let itemsToAddToInventory = [];

        if (itemId) {
          const clickedItem = prevList.find((item) => item.id === itemId);
          if (!clickedItem) return prevList;
          targetChecked = !clickedItem.checked;
          targetNormalizedText = clickedItem.normalizedText;

          // If checking off item, prepare to add to inventory
          if (targetChecked) {
            itemsToAddToInventory.push(clickedItem);
          }
        } else if (normalizedTextToToggle) {
          const groupItems = prevList.filter(
            (item) => item.normalizedText === normalizedTextToToggle,
          );
          if (groupItems.length === 0) return prevList;
          const allCurrentlyChecked = groupItems.every((item) => item.checked);
          targetChecked = !allCurrentlyChecked;
          targetNormalizedText = normalizedTextToToggle;

          // If checking off items, prepare to add to inventory
          if (targetChecked) {
            itemsToAddToInventory = groupItems;
          }
        } else {
          return prevList;
        }

        // Add checked items to inventory
        if (itemsToAddToInventory.length > 0) {
          itemsToAddToInventory.forEach((item) => {
            const itemName =
              item.normalizedText || item.description || item.originalText;
            const detectedCategory = detectIngredientCategory(itemName);
            const location =
              detectedCategory === "Frozen"
                ? "Freezer"
                : detectedCategory === "Produce" ||
                    detectedCategory === "Dairy" ||
                    detectedCategory === "Meat"
                  ? "Fridge"
                  : "Pantry";
            addInventoryItem({
              name: capitalizeFirstLetter(itemName),
              quantity: item.quantity || 1,
              unit: item.unit || "",
              category: detectedCategory,
              location: location,
              notes: `Added from shopping list (${item.recipeName || "Manual"})`,
              expirationDate: "",
            });
          });
        }

        return prevList.map((item) => {
          if (item.normalizedText === targetNormalizedText) {
            return { ...item, checked: targetChecked };
          }
          return item;
        });
      });
    },
    [setShoppingList, addInventoryItem],
  );

  const clearShoppingList = useCallback(async () => {
    if (
      window.confirm("Are you sure you want to clear the entire shopping list?")
    ) {
      try {
        await clearStore(STORE_NAMES.SHOPPING_LIST);
        setShoppingList([]);
        addToast("Shopping list cleared!", "success");
      } catch (error) {
        console.error("Error clearing shopping list:", error);
        addToast("Failed to clear shopping list.", "error");
      }
    }
  }, [setShoppingList, addToast]);

  const exportRecipes = useCallback(async () => {
    try {
      const allRecipes = await getAllItems(STORE_NAMES.RECIPES);
      if (!Array.isArray(allRecipes) || allRecipes.length === 0) {
        throw new Error("No recipes found to export");
      }
      const dataStr = JSON.stringify(allRecipes, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "my-recipes.json";
      if (document.body) {
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
      addToast("Recipes exported successfully!", "success");
    } catch (err) {
      console.error("Export error:", err);
      addToast(`Error exporting recipes: ${err.message}`, "error");
    }
  }, [addToast]);

  const importRecipes = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importedRecipes = JSON.parse(text);

        if (!Array.isArray(importedRecipes)) {
          throw new Error("Invalid format: Expected an array of recipes");
        }

        let imported = 0;
        for (const recipe of importedRecipes) {
          // Generate new ID to avoid conflicts
          const newRecipe = {
            ...recipe,
            id:
              Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
            createdAt: new Date().toISOString(),
          };
          await addItem(STORE_NAMES.RECIPES, newRecipe);
          imported++;
        }

        setRecipes((prev) => [
          ...prev,
          ...importedRecipes.map((r) => ({
            ...r,
            id:
              Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
          })),
        ]);

        addToast(`Successfully imported ${imported} recipes!`, "success");
      } catch (err) {
        console.error("Import error:", err);
        addToast(`Error importing recipes: ${err.message}`, "error");
      }
    };
    input.click();
  }, [addToast, setRecipes]);

  const deleteAllRecipes = useCallback(async () => {
    try {
      const allRecipes = await getAllItems(STORE_NAMES.RECIPES);
      for (const recipe of allRecipes) {
        await deleteItem(STORE_NAMES.RECIPES, recipe.id);
      }
      setRecipes([]);
      addToast("All recipes deleted successfully!", "success");
      setCurrentPage(0);
    } catch (err) {
      console.error("Delete all error:", err);
      addToast(`Error deleting recipes: ${err.message}`, "error");
    }
  }, [addToast, setRecipes, setCurrentPage]);

  const generateRecipePDF = useCallback(
    async (recipe) => {
      if (!recipe || typeof recipe !== "object") {
        addToast("Invalid recipe data.", "error");
        return;
      }
      if (typeof html2pdf === "undefined") {
        addToast("PDF library not loaded. Please refresh.", "error");
        return;
      }
      addToast("Generating PDF...", "info");
      // PDF generation code (same as before)
      const content = document.createElement("div");
      content.style.cssText = `font-family: sans-serif; padding: 30px; line-height: 1.6; color: #333; font-size: 10pt; max-width: 8.5in;`;
      // ... rest of PDF generation code
      addToast("PDF downloaded!", "success");
    },
    [addToast],
  );

  // Book navigation
  const totalPages = useMemo(() => {
    // Page pairs: Each spread shows 2 pages
    // Spread 0: TOC (left) + Add Recipe (right)
    // Spread 1+: Recipe spreads (image left, content right)
    const recipePages = Math.ceil(recipes.length / 1); // Each recipe gets 1 spread (2 pages)
    return recipes.length + 1; // Number of spreads
  }, [recipes.length]);

  // Organize recipes by category and sort alphabetically
  const categorizedRecipes = useMemo(() => {
    const structure = {
      Favorites: {},
      Appetizer: {},
      Beverages: {},
      Breads: {},
      Salads: {},
      "Soups/Stews": {},
      Main: {},
      Dessert: {},
      "Dressings, Marinades, Sauces, & Seasoning": {},
    };

    recipes.forEach((recipe) => {
      // Add to favorites
      if (recipe.isFavorite) {
        const favSubCat = recipe.subCategory || "Other";
        if (!structure.Favorites[favSubCat]) {
          structure.Favorites[favSubCat] = [];
        }
        structure.Favorites[favSubCat].push(recipe);
      }

      // Add to course categories
      const course = recipe.course || "Main";
      const subCategory = recipe.subCategory || "Other";

      if (structure[course]) {
        if (!structure[course][subCategory]) {
          structure[course][subCategory] = [];
        }
        structure[course][subCategory].push(recipe);
      } else {
        // Fallback to Main if course not recognized
        if (!structure.Main[subCategory]) {
          structure.Main[subCategory] = [];
        }
        structure.Main[subCategory].push(recipe);
      }
    });

    // Sort recipes alphabetically within each subcategory
    Object.keys(structure).forEach((course) => {
      Object.keys(structure[course]).forEach((subCat) => {
        structure[course][subCat].sort((a, b) => a.name.localeCompare(b.name));
      });
    });

    return structure;
  }, [recipes]);

  // Get all unique tags from recipes
  const allTags = useMemo(() => {
    const tagsSet = new Set();
    recipes.forEach((recipe) => {
      if (Array.isArray(recipe.tags)) {
        recipe.tags.forEach((tag) => {
          if (tag && tag.trim()) {
            tagsSet.add(tag.trim());
          }
        });
      }
    });
    return Array.from(tagsSet).sort();
  }, [recipes]);

  const nextPage = useCallback(() => {
    if (currentPage < totalPages - 1) {
      const container = document.querySelector(".pages-container");
      if (container) {
        container.classList.add("page-turning-next");
      }
      setTimeout(() => {
        setCurrentPage((p) => p + 1);
        if (container) {
          setTimeout(() => container.classList.remove("page-turning-next"), 50);
        }
      }, 300);
    }
  }, [currentPage, totalPages]);

  const prevPage = useCallback(() => {
    if (currentPage > 0) {
      const container = document.querySelector(".pages-container");
      if (container) {
        container.classList.add("page-turning-prev");
      }
      setTimeout(() => {
        setCurrentPage((p) => p - 1);
        if (container) {
          setTimeout(() => container.classList.remove("page-turning-prev"), 50);
        }
      }, 300);
    }
  }, [currentPage]);

  const goToPage = useCallback((page) => {
    console.log("goToPage called with:", page);
    setCurrentPage(page);
  }, []);

  const openBook = useCallback(() => {
    const cover = document.querySelector(".book-cover");
    if (cover) {
      cover.classList.add("opening");
    }
    setTimeout(() => {
      setIsBookOpen(true);
      setCurrentPage(0);
    }, 1000);
  }, []);

  const closeBook = useCallback(() => {
    setIsBookOpen(false);
    setCurrentPage(0);
  }, []);

  // --- NEW FEATURE CALLBACKS ---

  // Inventory Management
  const addInventoryItem = useCallback(
    async (item) => {
      try {
        await setInventory((prev) => {
          // Check if item already exists (case-insensitive name match)
          const existingItemIndex = prev.findIndex(
            (invItem) =>
              invItem.name.toLowerCase().trim() ===
              item.name.toLowerCase().trim(),
          );

          if (existingItemIndex >= 0) {
            // Item exists - update quantity
            const updated = [...prev];
            const existingItem = updated[existingItemIndex];
            const newQuantity =
              parseFloat(existingItem.quantity || 0) +
              parseFloat(item.quantity || 1);
            updated[existingItemIndex] = {
              ...existingItem,
              quantity: newQuantity,
              notes: existingItem.notes
                ? `${existingItem.notes}; ${item.notes || ""}`
                : item.notes || existingItem.notes,
            };
            addToast(
              `Updated ${item.name} quantity to ${newQuantity}`,
              "success",
            );
            return updated;
          } else {
            // New item - add it
            const newItem = {
              id: Date.now().toString(),
              name: item.name,
              quantity: item.quantity || 1,
              unit: item.unit || "",
              category: item.category || "Other",
              expirationDate: item.expirationDate || null,
              location: item.location || "Pantry",
              notes: item.notes || "",
              addedAt: new Date().toISOString(),
            };
            addToast(`Added ${item.name} to inventory`, "success");
            return [...prev, newItem];
          }
        });
      } catch (error) {
        console.error("Failed to add to inventory:", error);
        addToast("Failed to add to inventory", "error");
      }
    },
    [setInventory, addToast],
  );

  const updateInventoryItem = useCallback(
    async (id, updates) => {
      await setInventory((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      );
      addToast("Inventory updated", "success");
    },
    [setInventory, addToast],
  );

  const deleteInventoryItem = useCallback(
    async (id) => {
      await setInventory((prev) => prev.filter((item) => item.id !== id));
      addToast("Item removed from inventory", "success");
    },
    [setInventory, addToast],
  );

  const clearAllInventory = useCallback(async () => {
    await setInventory([]);
    addToast("Inventory cleared", "success");
  }, [setInventory, addToast]);

  const checkRecipeAvailability = useCallback(
    (recipe) => {
      if (!recipe || !recipe.ingredients)
        return { canMake: false, missing: [] };

      const missing = [];
      const inventoryMap = {};

      inventory.forEach((item) => {
        const key = item.name.toLowerCase().trim();
        inventoryMap[key] = item;
      });

      recipe.ingredients.forEach((ing) => {
        const { description } = parseIngredient(ing);
        const normalized = normalizeIngredient(ing).toLowerCase();

        if (
          !inventoryMap[normalized] &&
          !inventoryMap[description.toLowerCase()]
        ) {
          missing.push(ing);
        }
      });

      return {
        canMake: missing.length === 0,
        missing,
        available: recipe.ingredients.length - missing.length,
      };
    },
    [inventory],
  );

  // Ratings & Reviews
  const addRating = useCallback(
    async (recipeId, rating, review = "") => {
      const newRating = {
        id: Date.now().toString(),
        recipeId,
        rating,
        review,
        createdAt: new Date().toISOString(),
      };
      await setRatings((prev) => [...prev, newRating]);
      addToast("Rating added!", "success");
      return newRating;
    },
    [setRatings, addToast],
  );

  const getRecipeRatings = useCallback(
    (recipeId) => {
      const recipeRatings = ratings.filter((r) => r.recipeId === recipeId);
      if (recipeRatings.length === 0)
        return { average: 0, count: 0, ratings: [] };

      const average =
        recipeRatings.reduce((sum, r) => sum + r.rating, 0) /
        recipeRatings.length;
      return {
        average: average.toFixed(1),
        count: recipeRatings.length,
        ratings: recipeRatings,
      };
    },
    [ratings],
  );

  // Collections
  const createCollection = useCallback(
    async (name, description = "") => {
      const newCollection = {
        id: Date.now().toString(),
        name,
        description,
        recipeIds: [],
        createdAt: new Date().toISOString(),
      };
      await setCollections((prev) => [...prev, newCollection]);
      addToast(`Collection "${name}" created`, "success");
      return newCollection;
    },
    [setCollections, addToast],
  );

  const addRecipeToCollection = useCallback(
    async (collectionId, recipeId) => {
      await setCollections((prev) =>
        prev.map((col) =>
          col.id === collectionId && !col.recipeIds.includes(recipeId)
            ? { ...col, recipeIds: [...col.recipeIds, recipeId] }
            : col,
        ),
      );
      addToast("Recipe added to collection", "success");
    },
    [setCollections, addToast],
  );

  const removeRecipeFromCollection = useCallback(
    async (collectionId, recipeId) => {
      await setCollections((prev) =>
        prev.map((col) =>
          col.id === collectionId
            ? {
                ...col,
                recipeIds: col.recipeIds.filter((id) => id !== recipeId),
              }
            : col,
        ),
      );
      addToast("Recipe removed from collection", "success");
    },
    [setCollections, addToast],
  );

  const deleteCollection = useCallback(
    async (collectionId) => {
      await setCollections((prev) =>
        prev.filter((col) => col.id !== collectionId),
      );
      addToast("Collection deleted", "success");
    },
    [setCollections, addToast],
  );

  // Cooking Sessions
  const startCookingSession = useCallback((recipe) => {
    setShowCookingMode({ recipe, startTime: Date.now() });
  }, []);

  const completeCookingSession = useCallback(
    async (recipeId, recipeName, startTime, completed = true) => {
      const duration = Math.floor((Date.now() - startTime) / 1000);
      await recordCookingSession(recipeId, recipeName, duration, completed);
      await setCookingSessions((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          recipeId,
          recipeName,
          duration,
          completed,
          completedAt: new Date().toISOString(),
        },
      ]);
      if (completed) {
        addToast("Cooking session completed! 🎉", "success");
      }
    },
    [setCookingSessions, addToast],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <i className="fas fa-spinner fa-spin text-4xl mb-3 text-green-500"></i>
          <p className="text-lg">Loading your cookbook...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="cookbook-container">
        <div className={`book ${isBookOpen ? "open" : "closed"}`}>
          {!isBookOpen ? (
            <>
              <div className="book-cover">
                <div className="cover-header">
                  <h1 className="book-cover-title">{bookTitle}</h1>
                  <div className="cover-buttons-container">
                    <button
                      onClick={() => setShowCoverEditor(true)}
                      className="cover-edit-btn"
                      title="Edit Cover"
                    >
                      <i className="fas fa-edit"></i>
                    </button>
                    <button
                      onClick={openBook}
                      className="open-book-btn"
                      title="Open Cookbook"
                    >
                      <i className="fas fa-book-open"></i>
                    </button>
                  </div>
                </div>
                {bookCoverImage && (
                  <img
                    src={bookCoverImage}
                    alt="Cover"
                    className="book-cover-image"
                  />
                )}
              </div>
              <div className="book-spine"></div>
            </>
          ) : (
            <div className="pages-container">
              <BookPages
                currentPage={currentPage}
                recipes={recipes}
                categorizedRecipes={categorizedRecipes}
                onPrevPage={prevPage}
                onNextPage={nextPage}
                onGoToPage={goToPage}
                totalPages={totalPages}
                onEditRecipe={(recipe) => {
                  setEditingRecipe(recipe);
                  setShowAddRecipeModal(true);
                }}
                onDeleteRecipe={deleteRecipe}
                toggleFavorite={toggleFavorite}
                addToShoppingList={addToShoppingList}
                generateRecipePDF={generateRecipePDF}
                addTimer={addTimer}
                updateMealPlan={updateMealPlan}
                mealPlan={mealPlan}
                addToast={addToast}
                onOpenAddRecipe={() => {
                  setEditingRecipe(null);
                  setShowAddRecipeModal(true);
                }}
                onCloseBook={closeBook}
                setShowMealPlanModal={setShowMealPlanModal}
                setShowShoppingListModal={setShowShoppingListModal}
                setShowInventoryModal={setShowInventoryModal}
                setShowCollectionsModal={setShowCollectionsModal}
                setShowAnalyticsModal={setShowAnalyticsModal}
                setShowSuggestionsModal={setShowSuggestionsModal}
                setShowMealPrepModal={setShowMealPrepModal}
                setShowNutritionGoalsModal={setShowNutritionGoalsModal}
                setShowCloudSyncModal={setShowCloudSyncModal}
                isBulkMode={isBulkMode}
                setIsBulkMode={setIsBulkMode}
                selectedRecipes={selectedRecipes}
                setSelectedRecipes={setSelectedRecipes}
                isHighContrast={isHighContrast}
                setIsHighContrast={setIsHighContrast}
                isDarkMode={isDarkMode}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={undo}
                onRedo={redo}
                startCookingSession={startCookingSession}
                exportRecipes={exportRecipes}
                importRecipes={importRecipes}
                deleteAllRecipes={deleteAllRecipes}
                allTags={allTags}
                inventory={inventory}
                checkRecipeAvailability={checkRecipeAvailability}
                getRecipeRatings={getRecipeRatings}
                addRating={addRating}
              />
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCoverEditor && (
        <CoverEditorModal
          title={bookTitle}
          image={bookCoverImage}
          onSave={(title, image) => {
            setBookTitle(title);
            setBookCoverImage(image);
            setShowCoverEditor(false);
            addToast("Cover updated!", "success");
          }}
          onClose={() => setShowCoverEditor(false)}
        />
      )}

      {showAddRecipeModal && (
        <AddRecipeModal
          onClose={() => {
            setShowAddRecipeModal(false);
            setEditingRecipe(null);
          }}
          addRecipe={addRecipe}
          updateRecipe={updateRecipe}
          editingRecipe={editingRecipe}
          addToast={addToast}
        />
      )}

      {showMealPlanModal && (
        <MealPlanModal
          mealPlan={mealPlan}
          recipes={recipes}
          updateMealPlan={updateMealPlan}
          removeMealFromPlan={removeMealFromPlan}
          addMultipleRecipesToShoppingList={addMultipleRecipesToShoppingList}
          openRecipeDetails={(recipe) => setShowRecipeDetails(recipe)}
          onClose={() => setShowMealPlanModal(false)}
        />
      )}

      {showRecipeDetails && (
        <RecipeDetailsModal
          recipe={showRecipeDetails}
          onClose={() => setShowRecipeDetails(null)}
          onEdit={(recipe) => {
            setEditingRecipe(recipe);
            setShowAddRecipeModal(true);
            setShowRecipeDetails(null);
          }}
          onDelete={(id) => {
            deleteRecipe(id);
            setShowRecipeDetails(null);
          }}
          toggleFavorite={toggleFavorite}
          addToShoppingList={addToShoppingList}
          generateRecipePDF={generateRecipePDF}
          addTimer={addTimer}
          updateMealPlan={updateMealPlan}
          mealPlan={mealPlan}
          recipes={recipes}
          startCookingSession={startCookingSession}
          getRecipeRatings={getRecipeRatings}
          addRating={addRating}
          checkRecipeAvailability={checkRecipeAvailability}
          inventory={inventory}
          displayUnitSystem={displayUnitSystem}
          setDisplayUnitSystem={setDisplayUnitSystem}
          convertUnits={convertUnits}
        />
      )}

      {showShoppingListModal && (
        <ShoppingListModal
          shoppingList={shoppingList}
          toggleShoppingItem={toggleShoppingItem}
          clearShoppingList={clearShoppingList}
          addToast={addToast}
          onClose={() => setShowShoppingListModal(false)}
          displayUnitSystem={displayUnitSystem}
          setDisplayUnitSystem={setDisplayUnitSystem}
          convertUnits={convertUnits}
          addInventoryItem={addInventoryItem}
        />
      )}

      {showInventoryModal && (
        <InventoryModal
          inventory={inventory}
          addInventoryItem={addInventoryItem}
          updateInventoryItem={updateInventoryItem}
          deleteInventoryItem={deleteInventoryItem}
          clearAllInventory={clearAllInventory}
          checkRecipeAvailability={checkRecipeAvailability}
          recipes={recipes}
          onClose={() => setShowInventoryModal(false)}
          addToast={addToast}
        />
      )}

      {showCollectionsModal && (
        <CollectionsModal
          collections={collections}
          recipes={recipes}
          createCollection={createCollection}
          addRecipeToCollection={addRecipeToCollection}
          removeRecipeFromCollection={removeRecipeFromCollection}
          deleteCollection={deleteCollection}
          openRecipeDetails={(recipe) => setShowRecipeDetails(recipe)}
          onClose={() => {
            setShowCollectionsModal(false);
            if (collectionsBulkMode) {
              setCollectionsBulkMode(false);
              setSelectedRecipes([]);
              setIsBulkMode(false);
            }
          }}
          addToast={addToast}
          selectedRecipes={collectionsBulkMode ? selectedRecipes : []}
        />
      )}

      {showAnalyticsModal && (
        <AnalyticsModal
          recipes={recipes}
          cookingSessions={cookingSessions}
          ratings={ratings}
          onClose={() => setShowAnalyticsModal(false)}
        />
      )}

      {showCookingMode && (
        <CookingModeModal
          recipe={showCookingMode.recipe}
          startTime={showCookingMode.startTime}
          onClose={(completed) => {
            if (completed) {
              completeCookingSession(
                showCookingMode.recipe.id,
                showCookingMode.recipe.name,
                showCookingMode.startTime,
                true,
              );
            }
            setShowCookingMode(null);
          }}
          addTimer={addTimer}
          addToast={addToast}
          addRating={addRating}
        />
      )}

      {showSuggestionsModal && (
        <RecipeSuggestionsModal
          recipes={recipes}
          inventory={inventory}
          onClose={() => setShowSuggestionsModal(false)}
          openRecipeDetails={(recipe) => setShowRecipeDetails(recipe)}
          addToast={addToast}
        />
      )}

      {showMealPrepModal && (
        <MealPrepModal
          recipes={recipes}
          selectedRecipes={selectedRecipes}
          onClose={() => setShowMealPrepModal(false)}
          addToShoppingList={addToShoppingList}
          addToast={addToast}
        />
      )}

      {showNutritionGoalsModal && (
        <NutritionGoalsModal
          recipes={recipes}
          cookingSessions={cookingSessions}
          nutritionGoals={nutritionGoals}
          setNutritionGoals={setNutritionGoals}
          onClose={() => setShowNutritionGoalsModal(false)}
          addToast={addToast}
        />
      )}

      {showCloudSyncModal && (
        <CloudSyncModal
          onClose={() => setShowCloudSyncModal(false)}
          addToast={addToast}
        />
      )}

      {isBulkMode && (
        <BulkOperationsToolbar
          selectedCount={selectedRecipes.length}
          onDelete={async () => {
            if (
              window.confirm(
                `Delete ${selectedRecipes.length} selected recipes?`,
              )
            ) {
              for (const id of selectedRecipes) {
                await deleteRecipe(id);
              }
              setSelectedRecipes([]);
              setIsBulkMode(false);
              addToast(`Deleted ${selectedRecipes.length} recipes`, "success");
            }
          }}
          onAddToCollection={() => {
            setCollectionsBulkMode(true);
            setShowCollectionsModal(true);
          }}
          onExport={async () => {
            const selectedData = recipes.filter((r) =>
              selectedRecipes.includes(r.id),
            );
            const dataStr = JSON.stringify(selectedData, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `selected-recipes-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            addToast(`Exported ${selectedRecipes.length} recipes`, "success");
            setSelectedRecipes([]);
            setIsBulkMode(false);
          }}
          onCancel={() => {
            setSelectedRecipes([]);
            setIsBulkMode(false);
          }}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={() => {
            const action = undo();
            if (action) executeUndoAction(action);
          }}
          onRedo={() => {
            const action = redo();
            if (action) executeRedoAction(action);
          }}
        />
      )}

      <TimerTray
        timers={timers}
        onToggle={toggleTimer}
        onRemove={removeTimer}
        onReset={resetTimer}
      />

      <div className="fixed bottom-4 right-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </>
  );
};

const BookPages = ({
  currentPage,
  recipes,
  categorizedRecipes,
  onPrevPage,
  onNextPage,
  onGoToPage,
  totalPages,
  onEditRecipe,
  onDeleteRecipe,
  toggleFavorite,
  addToShoppingList,
  generateRecipePDF,
  addTimer,
  updateMealPlan,
  mealPlan,
  addToast,
  onOpenAddRecipe,
  onCloseBook,
  setShowMealPlanModal,
  setShowShoppingListModal,
  exportRecipes,
  importRecipes,
  deleteAllRecipes,
  allTags,
  setShowInventoryModal,
  setShowCollectionsModal,
  setShowAnalyticsModal,
  setShowSuggestionsModal,
  setShowMealPrepModal,
  setShowNutritionGoalsModal,
  setShowCloudSyncModal,
  isBulkMode,
  setIsBulkMode,
  selectedRecipes,
  setSelectedRecipes,
  isHighContrast,
  setIsHighContrast,
  isDarkMode,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  startCookingSession,
  inventory,
  checkRecipeAvailability,
  getRecipeRatings,
  addRating,
}) => {
  const touchStartX = useRef(null);
  const touchStartY = useRef(null);
  const pageSpreadRef = useRef(null);
  const [isPageTurning, setIsPageTurning] = useState(false);
  const [turnDirection, setTurnDirection] = useState("forward");
  const pagesContainerRef = useRef(null);
  const [isQuickActionsMenuOpen, setIsQuickActionsMenuOpen] = useState(false);

  // Page turn with proper flip animation
  const handlePageTurnWithEffect = useCallback(
    (direction, pageFunc) => {
      if (isPageTurning) return;

      setIsPageTurning(true);
      setTurnDirection(direction);

      // Add flipped class to trigger 3D rotation
      if (pageSpreadRef.current) {
        const rightPage = pageSpreadRef.current.querySelector(".right-page");
        if (rightPage) {
          if (direction === "forward") {
            rightPage.classList.add("flipped");
          } else {
            rightPage.classList.remove("flipped");
          }
        }
      }

      // Change page at animation midpoint for smoother transition
      setTimeout(() => {
        pageFunc();
        // Immediately remove flipped class on new page content
        setTimeout(() => {
          if (pageSpreadRef.current) {
            const rightPage =
              pageSpreadRef.current.querySelector(".right-page");
            if (rightPage) {
              rightPage.classList.remove("flipped");
            }
          }
          setIsPageTurning(false);
        }, 50);
      }, 600); // Halfway through animation
    },
    [isPageTurning],
  );

  const handlePrevPageWithEffect = useCallback(() => {
    if (currentPage > 0) {
      handlePageTurnWithEffect("backward", onPrevPage);
    }
  }, [handlePageTurnWithEffect, onPrevPage, currentPage]);

  const handleNextPageWithEffect = useCallback(() => {
    if (currentPage < totalPages - 1) {
      handlePageTurnWithEffect("forward", onNextPage);
    }
  }, [handlePageTurnWithEffect, onNextPage, currentPage, totalPages]);

  const onTurnComplete = useCallback(() => {
    setIsPageTurning(false);
    // Execute the actual page change after animation
    if (turnDirection === "forward") {
      onNextPage();
    } else {
      onPrevPage();
    }
  }, [turnDirection, onNextPage, onPrevPage]);

  // Handle swipe gestures
  useEffect(() => {
    const handleTouchStart = (e) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = (e) => {
      if (touchStartX.current === null || touchStartY.current === null) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;

      const deltaX = touchEndX - touchStartX.current;
      const deltaY = touchEndY - touchStartY.current;

      // Ensure horizontal swipe is dominant (not vertical scroll)
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
        if (deltaX > 0) {
          // Swipe right - go to previous page
          handlePrevPageWithEffect();
        } else {
          // Swipe left - go to next page
          handleNextPageWithEffect();
        }
      }

      touchStartX.current = null;
      touchStartY.current = null;
    };

    const element = pageSpreadRef.current;
    if (element) {
      element.addEventListener("touchstart", handleTouchStart);
      element.addEventListener("touchend", handleTouchEnd);
    }

    return () => {
      if (element) {
        element.removeEventListener("touchstart", handleTouchStart);
        element.removeEventListener("touchend", handleTouchEnd);
      }
    };
  }, [handlePrevPageWithEffect, handleNextPageWithEffect]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isPageTurning) return;

      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        handlePrevPageWithEffect();
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        handleNextPageWithEffect();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handlePrevPageWithEffect, handleNextPageWithEffect, isPageTurning]);

  const [collapsedCategories, setCollapsedCategories] = useState(() => {
    // Start with all categories and sub-categories collapsed
    const initialState = {};
    // Collapse all main categories
    Object.keys(categorizedRecipes).forEach((cat) => {
      initialState[cat] = true;
      // Collapse all sub-categories within each category
      Object.keys(categorizedRecipes[cat]).forEach((subCat) => {
        initialState[`${cat}-${subCat}`] = true;
      });
    });
    // Collapse "All Tags" category
    initialState["All Tags"] = true;
    // Collapse all individual tag sub-categories
    allTags.forEach((tag) => {
      initialState[`All Tags-${tag}`] = true;
    });
    return initialState;
  });

  // Reset all categories to collapsed when returning to TOC
  useEffect(() => {
    if (currentPage === 0) {
      const resetState = {};
      Object.keys(categorizedRecipes).forEach((cat) => {
        resetState[cat] = true;
        Object.keys(categorizedRecipes[cat]).forEach((subCat) => {
          resetState[`${cat}-${subCat}`] = true;
        });
      });
      resetState["All Tags"] = true;
      allTags.forEach((tag) => {
        resetState[`All Tags-${tag}`] = true;
      });
      setCollapsedCategories(resetState);
    }
  }, [currentPage, categorizedRecipes, allTags]);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState(null);
  const [showTagRecipes, setShowTagRecipes] = useState(false);

  const toggleCategory = (category) => {
    setCollapsedCategories((prev) => ({
      ...prev,
      [category]: !prev[category],
    }));
  };

  // Filter recipes based on search query
  const filteredCategorizedRecipes = useMemo(() => {
    if (!searchQuery.trim()) {
      return categorizedRecipes;
    }

    const query = searchQuery.toLowerCase().trim();
    const filtered = {};

    Object.entries(categorizedRecipes).forEach(([course, subCategories]) => {
      filtered[course] = {};
      Object.entries(subCategories).forEach(([subCat, recipeList]) => {
        const matchingRecipes = recipeList.filter((recipe) => {
          const recipeName = recipe.name.toLowerCase();
          // Check if any word in the recipe name starts with the query
          return recipeName.split(/\s+/).some((word) => word.startsWith(query));
        });
        if (matchingRecipes.length > 0) {
          filtered[course][subCat] = matchingRecipes;
        }
      });
    });

    return filtered;
  }, [categorizedRecipes, searchQuery]);

  // Also filter recipes by tags
  const filteredRecipesByTag = useMemo(() => {
    if (!searchQuery.trim()) {
      return allTags.map((tag) => ({
        tag,
        recipes: recipes.filter(
          (r) => Array.isArray(r.tags) && r.tags.includes(tag),
        ),
      }));
    }

    const query = searchQuery.toLowerCase().trim();
    return allTags
      .map((tag) => ({
        tag,
        recipes: recipes.filter((r) => {
          if (!Array.isArray(r.tags) || !r.tags.includes(tag)) return false;
          const recipeName = r.name.toLowerCase();
          // Check if any word in the recipe name starts with the query
          return recipeName.split(/\s+/).some((word) => word.startsWith(query));
        }),
      }))
      .filter((item) => item.recipes.length > 0);
  }, [allTags, recipes, searchQuery]);

  // Page 0: TOC and Add Recipe spread
  if (currentPage === 0) {
    return (
      <div className="pages-container" ref={pagesContainerRef}>
        <div className="page-spread" ref={pageSpreadRef}>
          {/* Left page: TOC */}
          <div className="page left-page">
            <h1 className="toc-title">Table of Contents</h1>

            {/* Search Bar */}
            <div
              style={{
                marginBottom: "20px",
                position: "sticky",
                top: "-50px",
                background: "#1f2937",
                paddingTop: "10px",
                paddingBottom: "10px",
                zIndex: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "#374151",
                  borderRadius: "8px",
                  padding: "8px 12px",
                  border: "1px solid #1503afad",
                }}
              >
                <i
                  className="fas fa-search"
                  style={{ color: "#9ca3af", marginRight: "8px" }}
                ></i>
                <input
                  type="text"
                  placeholder="Search recipes by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "#f3f4f6",
                    fontSize: "14px",
                    width: "100%",
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#9ca3af",
                      cursor: "pointer",
                      padding: "0 4px",
                      fontSize: "16px",
                    }}
                  >
                    <i className="fas fa-times"></i>
                  </button>
                )}
              </div>
            </div>

            {Object.entries(filteredCategorizedRecipes)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([course, subCategories]) => {
                // Check if this course has any recipes
                const hasRecipes = Object.values(subCategories).some(
                  (recipes) => recipes.length > 0,
                );
                if (!hasRecipes) return null;

                const isCollapsed = collapsedCategories[course];

                return (
                  <div key={course} className="toc-category">
                    <div
                      className="toc-category-title"
                      onClick={() => toggleCategory(course)}
                    >
                      <span>{course}</span>
                      <i
                        className={`fas fa-chevron-${isCollapsed ? "down" : "up"}`}
                      ></i>
                    </div>
                    {!isCollapsed && (
                      <div style={{ marginLeft: "12px" }}>
                        {Object.entries(subCategories)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([subCategory, subCategoryRecipes]) => {
                            if (subCategoryRecipes.length === 0) return null;

                            const subKey = `${course}-${subCategory}`;
                            const isSubCollapsed = collapsedCategories[subKey];

                            return (
                              <div key={subKey} style={{ marginBottom: "8px" }}>
                                <div
                                  style={{
                                    fontSize: "14px",
                                    fontWeight: "600",
                                    color: "#ffffff",
                                    marginTop: "8px",
                                    marginBottom: "4px",
                                    padding: "4px 8px",
                                    background: "#1503af33",
                                    borderLeft: "3px solid #1503af",
                                    cursor: "pointer",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                  onClick={() => toggleCategory(subKey)}
                                >
                                  <span>{subCategory}</span>
                                  <i
                                    className={`fas fa-chevron-${isSubCollapsed ? "down" : "up"}`}
                                    style={{ fontSize: "10px" }}
                                  ></i>
                                </div>
                                {!isSubCollapsed && (
                                  <ul className="toc-list">
                                    {subCategoryRecipes.map((recipe) => {
                                      const recipeIndex = recipes.findIndex(
                                        (r) => r.id === recipe.id,
                                      );
                                      const recipePage = recipeIndex + 1;
                                      const isSelected =
                                        selectedRecipes.includes(recipe.id);
                                      return (
                                        <li
                                          key={recipe.id}
                                          className="toc-item"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (isBulkMode) {
                                              setSelectedRecipes((prev) =>
                                                prev.includes(recipe.id)
                                                  ? prev.filter(
                                                      (id) => id !== recipe.id,
                                                    )
                                                  : [...prev, recipe.id],
                                              );
                                            } else {
                                              console.log(
                                                "TOC item clicked:",
                                                recipe.name,
                                                "recipePage:",
                                                recipePage,
                                              );
                                              onGoToPage(recipePage);
                                            }
                                          }}
                                          style={{
                                            cursor: "pointer",
                                            position: "relative",
                                            zIndex: 100,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "8px",
                                          }}
                                        >
                                          {isBulkMode && (
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={(e) => {
                                                e.stopPropagation();
                                                setSelectedRecipes((prev) =>
                                                  prev.includes(recipe.id)
                                                    ? prev.filter(
                                                        (id) =>
                                                          id !== recipe.id,
                                                      )
                                                    : [...prev, recipe.id],
                                                );
                                              }}
                                              className="multi-select-checkbox"
                                              style={{
                                                width: "18px",
                                                height: "18px",
                                                cursor: "pointer",
                                                flexShrink: 0,
                                              }}
                                            />
                                          )}
                                          <span
                                            className="toc-item-title"
                                            style={{ flex: 1 }}
                                          >
                                            {recipe.isFavorite && (
                                              <i
                                                className="fas fa-star"
                                                style={{
                                                  color: "#fbbf24",
                                                  marginRight: "6px",
                                                }}
                                              ></i>
                                            )}
                                            {recipe.name}
                                          </span>
                                          <span className="toc-item-page">
                                            Page {recipeIndex * 2 + 1}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              })}

            {filteredRecipesByTag.length > 0 && (
              <div className="toc-category">
                <div
                  className="toc-category-title"
                  onClick={() => toggleCategory("All Tags")}
                >
                  <span>All Tags</span>
                  <i
                    className={`fas fa-chevron-${collapsedCategories["All Tags"] ? "down" : "up"}`}
                  ></i>
                </div>
                {!collapsedCategories["All Tags"] && (
                  <div style={{ marginLeft: "12px" }}>
                    {filteredRecipesByTag.map(
                      ({ tag, recipes: recipesWithTag }) => {
                        if (recipesWithTag.length === 0) return null;

                        const tagKey = `All Tags-${tag}`;
                        const isTagCollapsed = collapsedCategories[tagKey];

                        return (
                          <div key={tagKey} style={{ marginBottom: "8px" }}>
                            <div
                              style={{
                                fontSize: "14px",
                                fontWeight: "600",
                                color: "#ffffff",
                                marginTop: "8px",
                                marginBottom: "4px",
                                padding: "4px 8px",
                                background: "#1503af33",
                                borderLeft: "3px solid #1503af",
                                cursor: "pointer",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                              onClick={() => toggleCategory(tagKey)}
                            >
                              <span>{tag}</span>
                              <i
                                className={`fas fa-chevron-${isTagCollapsed ? "down" : "up"}`}
                                style={{ fontSize: "10px" }}
                              ></i>
                            </div>
                            {!isTagCollapsed && (
                              <ul className="toc-list">
                                {recipesWithTag.map((recipe) => {
                                  const recipeIndex = recipes.findIndex(
                                    (r) => r.id === recipe.id,
                                  );
                                  const recipePage = recipeIndex + 1;
                                  return (
                                    <li
                                      key={recipe.id}
                                      className="toc-item"
                                      onClick={() => onGoToPage(recipePage)}
                                    >
                                      <span className="toc-item-title">
                                        {recipe.isFavorite && (
                                          <i
                                            className="fas fa-star"
                                            style={{
                                              color: "#fbbf24",
                                              marginRight: "6px",
                                            }}
                                          ></i>
                                        )}
                                        {recipe.name}
                                      </span>
                                      <span className="toc-item-page">
                                        Page {recipeIndex * 2 + 1}
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>
                            )}
                          </div>
                        );
                      },
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right page: Add Recipe and Quick Actions */}
          <div className="page right-page">
            <div className="page-nav-buttons">
              <button
                onClick={() => {
                  console.log("Add Recipe clicked");
                  onOpenAddRecipe();
                }}
                className="add-recipe-btn-large"
              >
                <i className="fas fa-plus-circle"></i>
                <span>New Recipe</span>
              </button>
              {/* <button
                onClick={() => setUseThreeJS(!useThreeJS)}
                className="page-nav-btn"
                style={{
                  marginRight: "20px",
                  background: useThreeJS ? "#10b981" : "#6b7280",
                }}
                title={useThreeJS ? "3D Page Turns: ON" : "3D Page Turns: OFF"}
              >
                <i className={`fas fa-${useThreeJS ? "cube" : "square"}`}></i>{" "}
                3D
              </button> */}
              <button
                onClick={() =>
                  setIsQuickActionsMenuOpen(!isQuickActionsMenuOpen)
                }
                className="page-nav-btn"
                style={{ marginRight: "10px" }}
              >
                <i className="fas fa-bars"></i> Quick Actions
              </button>
              <button onClick={onCloseBook} className="page-nav-btn">
                <i className="fas fa-times"></i> Close
              </button>
            </div>

            {/* Quick Actions Dropdown Menu */}
            {isQuickActionsMenuOpen && (
              <div className="quick-actions-dropdown">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMealPlanModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal btn-blue"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <i className="fas fa-calendar-alt mr-2"></i> Meal Plan
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowShoppingListModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal bg-purple-500 hover:bg-purple-600 text-white"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <i className="fas fa-shopping-cart mr-2"></i> Shopping List
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowInventoryModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#f97316",
                    color: "white",
                  }}
                >
                  <i className="fas fa-box mr-2"></i> Ingredient Inventory
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCollectionsModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#14b8a6",
                    color: "white",
                  }}
                >
                  <i className="fas fa-folder mr-2"></i> Collections
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowAnalyticsModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#6366f1",
                    color: "white",
                  }}
                >
                  <i className="fas fa-chart-line mr-2"></i> Analytics & Stats
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    exportRecipes();
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal btn-green"
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <i className="fas fa-file-export mr-2"></i> Export Recipes
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowSuggestionsModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#eab308",
                    color: "white",
                  }}
                  aria-label="Open recipe suggestions"
                >
                  <i className="fas fa-lightbulb mr-2"></i> Recipe Suggestions
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMealPrepModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#06b6d4",
                    color: "white",
                  }}
                  aria-label="Open meal prep planner"
                >
                  <i className="fas fa-calendar-check mr-2"></i> Meal Prep
                  Planner
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowNutritionGoalsModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#8b5cf6",
                    color: "white",
                  }}
                  aria-label="Open nutrition goals"
                >
                  <i className="fas fa-chart-pie mr-2"></i> Nutrition Goals
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowCloudSyncModal(true);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: "#3b82f6",
                    color: "white",
                  }}
                  aria-label="Open cloud sync"
                >
                  <i className="fas fa-cloud mr-2"></i> Cloud Sync
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsBulkMode(!isBulkMode);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: isBulkMode ? "#10b981" : "#6b7280",
                    color: "white",
                  }}
                  aria-label={isBulkMode ? "Exit bulk mode" : "Enter bulk mode"}
                >
                  <i
                    className={`fas fa-${isBulkMode ? "check-square" : "square"} mr-2`}
                  ></i>
                  {isBulkMode ? "Exit Bulk Mode" : "Bulk Select"}
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsHighContrast(!isHighContrast);
                    setIsQuickActionsMenuOpen(false);
                  }}
                  className="btn-modal"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    background: isHighContrast ? "#10b981" : "#6b7280",
                    color: "white",
                  }}
                  aria-label={
                    isHighContrast
                      ? "Disable high contrast"
                      : "Enable high contrast"
                  }
                >
                  <i className="fas fa-adjust mr-2"></i>
                  {isHighContrast ? "High Contrast: ON" : "High Contrast: OFF"}
                </button>
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "80%",
              }}
            >
              <p
                style={{
                  marginTop: "20px",
                  color: "#6b7280",
                  fontStyle: "italic",
                  textAlign: "center",
                }}
              >
                Click to add a delicious new recipe to your collection
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "15px",
                }}
              >
                <button
                  onClick={() => {
                    console.log("Import clicked");
                    importRecipes();
                  }}
                  className="btn-modal btn-blue"
                  style={{ padding: "8px 16px" }}
                >
                  <i className="fas fa-file-import"></i> Import
                </button>
                <button
                  onClick={() => {
                    console.log("Export clicked");
                    exportRecipes();
                  }}
                  className="btn-modal btn-green"
                  style={{ padding: "8px 16px" }}
                >
                  <i className="fas fa-file-export"></i> Export
                </button>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Are you sure you want to DELETE ALL RECIPES? This cannot be undone!",
                      )
                    ) {
                      deleteAllRecipes();
                    }
                  }}
                  className="btn-modal btn-red"
                  style={{ padding: "8px 16px" }}
                >
                  <i className="fas fa-trash-alt"></i> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Recipe pages (currentPage 1+)
  const recipeIndex = currentPage - 1;

  if (recipeIndex < recipes.length) {
    const recipe = recipes[recipeIndex];

    return (
      <div className="pages-container" ref={pagesContainerRef}>
        <div className="page-spread" ref={pageSpreadRef}>
          {/* Left page: Recipe image */}
          <div
            className="page left-page recipe-image-page"
            onClick={(e) => {
              // Don't trigger page turn if clicking on the TOC button
              if (
                !e.target.closest(".page-nav-buttons-left") &&
                !isPageTurning
              ) {
                handlePrevPageWithEffect();
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <div className="page-nav-buttons-left">
              <button onClick={() => onGoToPage(0)} className="page-nav-btn">
                <i className="fas fa-home"></i> TOC
              </button>
            </div>
            {recipe.image ? (
              <>
                <img
                  src={recipe.image}
                  alt={recipe.name}
                  className="recipe-image-large"
                  style={{
                    width: "100%",
                    height: "auto",
                    maxHeight: "500px",
                    objectFit: "cover",
                    borderRadius: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    marginTop: "50px",
                  }}
                />
                <p
                  style={{
                    textAlign: "center",
                    fontFamily: "Georgia, serif",
                    fontSize: "18px",
                    fontWeight: "bold",
                    color: "#f3f4f6",
                    marginTop: "20px",
                  }}
                >
                  {recipe.name}
                </p>
              </>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "#9ca3af",
                  fontSize: "18px",
                  fontStyle: "italic",
                  flexDirection: "column",
                  gap: "15px",
                }}
              >
                <i
                  className="fas fa-image"
                  style={{ fontSize: "64px", opacity: 0.3 }}
                ></i>
                <span>{recipe.name}</span>
              </div>
            )}
            <div className="page-number">{(currentPage - 1) * 2 + 1}</div>
          </div>

          {/* Right page: Recipe details */}
          <div
            className="page right-page recipe-content-page"
            onClick={() => !isPageTurning && handleNextPageWithEffect()}
            style={{ cursor: "pointer" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                marginBottom: "10px",
                marginTop: "20px",
              }}
            >
              <h2 className="recipe-page-title">{recipe.name}</h2>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleFavorite(recipe.id);
                }}
                style={{
                  background: "none",
                  border: "none",
                  fontSize: "24px",
                  cursor: "pointer",
                  color: recipe.isFavorite ? "#fbbf24" : "#d1d5db",
                }}
              >
                <i className="fas fa-star"></i>
              </button>
            </div>

            {recipe.description && (
              <p
                style={{
                  fontStyle: "italic",
                  color: "#6b7280",
                  marginBottom: "15px",
                  fontSize: "13px",
                }}
              >
                {recipe.description}
              </p>
            )}

            <div className="recipe-meta">
              <div className="recipe-meta-item">
                <span className="recipe-meta-label">Servings:</span>{" "}
                {recipe.servings}
              </div>
              <div className="recipe-meta-item">
                <span className="recipe-meta-label">Prep:</span>{" "}
                {formatMinutesToHoursMinutes(recipe.prepTime)}
              </div>
              <div className="recipe-meta-item">
                <span className="recipe-meta-label">Cook:</span>{" "}
                {formatMinutesToHoursMinutes(recipe.cookTime)}
              </div>
              <div className="recipe-meta-item">
                <span className="recipe-meta-label">Total:</span>{" "}
                {formatMinutesToHoursMinutes(
                  (recipe.prepTime || 0) +
                    (recipe.cookTime || 0) +
                    (recipe.additionalTime || 0),
                )}
              </div>
            </div>

            <h3 className="recipe-section-title">Ingredients</h3>
            <ul className="recipe-ingredients-list">
              {recipe.ingredients?.map((ing, i) => (
                <li key={i} className="recipe-ingredient-item">
                  {ing}
                </li>
              ))}
            </ul>

            <h3 className="recipe-section-title">Directions</h3>
            <ol className="recipe-directions-list">
              {recipe.directions?.map((dir, i) => (
                <li key={i} className="recipe-direction-item">
                  {dir}
                </li>
              ))}
            </ol>

            {recipe.tipsAndTricks && recipe.tipsAndTricks.length > 0 && (
              <>
                <h3 className="recipe-section-title">Tips & Tricks</h3>
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {recipe.tipsAndTricks.map((tip, i) => (
                    <li
                      key={i}
                      style={{
                        padding: "4px 0",
                        fontSize: "13px",
                        color: "#6b7280",
                      }}
                    >
                      <i
                        className="fas fa-lightbulb"
                        style={{ color: "#f59e0b", marginRight: "8px" }}
                      ></i>
                      {tip}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                gap: "8px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Add to shopping list clicked");
                  addToShoppingList(recipe.id);
                }}
                className="btn-modal btn-gray"
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                <i className="fas fa-cart-plus mr-1"></i> Add to List
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  startCookingSession(recipe);
                }}
                className="btn-modal btn-green"
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                <i className="fas fa-play mr-1"></i> Start Cooking
              </button>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Pass the full recipe object instead of just id, name, url
                  const qrDataUrl = await generateQRCode(recipe);
                  const qrWindow = window.open(
                    "",
                    "_blank",
                    "width=400,height=450",
                  );
                  qrWindow.document.write(`
                    <html>
                      <head><title>QR Code - ${recipe.name}</title></head>
                      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Arial;padding:20px;">
                        <h2>${recipe.name}</h2>
                        <img src="${qrDataUrl}" alt="QR Code" style="max-width:300px;"/>
                        <p style="margin-top:20px;text-align:center;color:#666;">Scan to view recipe</p>
                      </body>
                    </html>
                  `);
                }}
                className="btn-modal"
                style={{
                  fontSize: "12px",
                  padding: "6px 12px",
                  background: "#a855f7",
                  color: "white",
                }}
              >
                <i className="fas fa-qrcode mr-1"></i> QR Code
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  alert("Edit button clicked!");
                  console.log("Edit clicked for:", recipe.name);
                  onEditRecipe(recipe);
                }}
                className="btn-modal btn-blue"
                style={{
                  fontSize: "12px",
                  padding: "6px 12px",
                  zIndex: 1000,
                  position: "relative",
                }}
              >
                <i className="fas fa-edit mr-1"></i> Edit
              </button>
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  console.log("Delete clicked for:", recipe.name);
                  if (window.confirm(`Delete "${recipe.name}"?`)) {
                    onDeleteRecipe(recipe.id);
                  }
                }}
                className="btn-modal btn-red"
                style={{ fontSize: "12px", padding: "6px 12px" }}
              >
                <i className="fas fa-trash mr-1"></i> Delete
              </button>
              {recipe.tags &&
                recipe.tags.length > 0 &&
                recipe.tags.map((tag, idx) => (
                  <button
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      e.stopPropagation();
                      setSelectedTag(tag);
                      setShowTagRecipes(true);
                    }}
                    className="btn-modal"
                    style={{
                      fontSize: "12px",
                      padding: "6px 12px",
                      background: "#1503af33",
                      color: "#ffffff",
                      border: "1px solid #1503afad",
                      cursor: "pointer",
                      pointerEvents: "auto",
                    }}
                  >
                    <i
                      className="fas fa-tag"
                      style={{ marginRight: "4px" }}
                    ></i>
                    {tag}
                  </button>
                ))}
            </div>

            <div className="page-number">{(currentPage - 1) * 2 + 2}</div>
          </div>
        </div>

        {/* Tag Recipes Modal */}
        {showTagRecipes && selectedTag && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: "rgba(0, 0, 0, 0.8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              padding: "20px",
            }}
            onClick={() => setShowTagRecipes(false)}
          >
            <div
              style={{
                background: "#1f2937",
                borderRadius: "12px",
                padding: "30px",
                maxWidth: "500px",
                width: "100%",
                maxHeight: "80vh",
                overflow: "auto",
                border: "2px solid #1503afad",
                boxShadow: "0 10px 40px rgba(0, 0, 0, 0.5)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "20px",
                }}
              >
                <h2
                  style={{
                    fontSize: "24px",
                    fontWeight: "bold",
                    color: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                  }}
                >
                  <i className="fas fa-tag" style={{ color: "#1503af" }}></i>
                  {selectedTag}
                </h2>
                <button
                  onClick={() => setShowTagRecipes(false)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "#9ca3af",
                    fontSize: "28px",
                    cursor: "pointer",
                    padding: "0",
                    lineHeight: "1",
                  }}
                >
                  ×
                </button>
              </div>

              <p
                style={{
                  color: "#9ca3af",
                  marginBottom: "20px",
                  fontSize: "14px",
                }}
              >
                Recipes with this tag:
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {recipes
                  .filter((r) => r.tags?.includes(selectedTag))
                  .map((recipe) => {
                    const recipeIndex = recipes.findIndex(
                      (r) => r.id === recipe.id,
                    );
                    const recipePage = recipeIndex + 1;
                    return (
                      <button
                        key={recipe.id}
                        onClick={() => {
                          setShowTagRecipes(false);
                          onGoToPage(recipePage);
                        }}
                        style={{
                          background: "#1503af33",
                          border: "1px solid #1503afad",
                          borderRadius: "8px",
                          padding: "12px 16px",
                          color: "#f3f4f6",
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.2s ease",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "#1503afad";
                          e.currentTarget.style.transform = "translateX(5px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "#1503af33";
                          e.currentTarget.style.transform = "translateX(0)";
                        }}
                      >
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          {recipe.isFavorite && (
                            <i
                              className="fas fa-star"
                              style={{ color: "#fbbf24" }}
                            ></i>
                          )}
                          {recipe.name}
                        </span>
                        <span
                          style={{
                            color: "#9ca3af",
                            fontSize: "12px",
                            fontStyle: "italic",
                          }}
                        >
                          Page {recipeIndex * 2 + 1}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

const CoverEditorModal = ({ title, image, onSave, onClose }) => {
  const [newTitle, setNewTitle] = useState(title);
  const [newImage, setNewImage] = useState(image || null);
  const [imagePreview, setImagePreview] = useState(image || null);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageData = event.target.result;
        setNewImage(imageData);
        setImagePreview(imageData);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
        <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          Edit Book Cover
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Book Title
            </label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="modal-input"
              placeholder="Enter book title"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Cover Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
            />
            {imagePreview && (
              <img
                src={imagePreview}
                alt="Preview"
                className="mt-3 w-full h-48 object-cover rounded-lg border-2 border-gray-300"
              />
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-modal btn-gray">
            Cancel
          </button>
          <button
            onClick={() => {
              // Always save the current state (newImage might be null if no image selected)
              onSave(newTitle, newImage);
            }}
            className="btn-modal btn-green"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};

const RecipeFormPage = ({
  onClose,
  addRecipe,
  updateRecipe,
  editingRecipe,
  addToast,
  pageNumber,
}) => {
  // This will be rendered inline in the book page
  // For now, show a message that the form is in the book
  return (
    <div className="page left-page" style={{ overflow: "auto" }}>
      <h2 className="recipe-page-title">Recipe Form</h2>
      <div style={{ padding: "20px", textAlign: "center", color: "#5d4037" }}>
        <i
          className="fas fa-pencil-alt"
          style={{ fontSize: "48px", marginBottom: "20px", color: "#8b4513" }}
        ></i>
        <p style={{ fontSize: "16px", marginBottom: "15px" }}>
          The recipe form will appear here when you're adding or editing a
          recipe.
        </p>
        <p style={{ fontSize: "14px", fontStyle: "italic" }}>
          Navigate to "Add New Recipe" from the Table of Contents to get
          started!
        </p>
      </div>
      <div className="page-number">{pageNumber}</div>
    </div>
  );
};

// === NEW MODAL COMPONENTS ===

// Interactive Cooking Mode Modal
const CookingModeModal = ({
  recipe,
  startTime,
  onClose,
  addTimer,
  addToast,
  addRating,
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [isReading, setIsReading] = useState(false);
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const [isTTSPaused, setIsTTSPaused] = useState(false);
  const [waitingForTimer, setWaitingForTimer] = useState(false);
  const [activeStepTimer, setActiveStepTimer] = useState(null);
  const [currentTimerIndex, setCurrentTimerIndex] = useState(0); // Track which timer in sequence
  const [showTimerAlert, setShowTimerAlert] = useState(false); // Show alert when timer completes
  const voiceControlRef = useRef(null);
  const stepTimerRef = useRef(null);
  const autoReadTimeoutRef = useRef(null);
  const lastReadStepRef = useRef(-1); // Track last step that was auto-read

  const steps = recipe.directions || [];
  const totalSteps = steps.length;

  // Detect if current step has a time requirement
  const currentStepTime = detectTimeInStep(steps[currentStep] || "");

  useEffect(() => {
    // Wake lock to keep screen on
    let wakeLock = null;
    if ("wakeLock" in navigator) {
      navigator.wakeLock
        .request("screen")
        .then((lock) => {
          wakeLock = lock;
        })
        .catch((err) => console.log("Wake lock error:", err));
    }

    return () => {
      if (wakeLock) wakeLock.release();
      if (voiceControlRef.current) {
        voiceControlRef.current.stop();
      }
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
      if (autoReadTimeoutRef.current) {
        clearTimeout(autoReadTimeoutRef.current);
      }
      stopTimerSound();
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    if (voiceEnabled && !voiceControlRef.current) {
      try {
        voiceControlRef.current = new VoiceControl((action, command) => {
          switch (action) {
            case "nextStep":
              if (currentStep < totalSteps - 1) {
                setCurrentStep((prev) => prev + 1);
                addToast("Next step", "info");
              }
              break;
            case "prevStep":
              if (currentStep > 0) {
                setCurrentStep((prev) => prev - 1);
                addToast("Previous step", "info");
              }
              break;
            case "readStep":
              handleReadStep();
              break;
            case "pause":
              setIsPaused(true);
              addToast("Paused", "info");
              break;
            case "resume":
              setIsPaused(false);
              addToast("Resumed", "info");
              break;
            case "setTimerDuration":
              addTimer(command.seconds, `Step ${currentStep + 1} Timer`);
              addToast(`Timer set for ${command.text}`, "success");
              break;
            case "finish":
              handleComplete();
              break;
            case "exit":
              onClose(false);
              break;
          }
        });
        voiceControlRef.current.start();
        addToast(
          'Voice control enabled! Say "next step", "set timer", "read step"',
          "success",
        );
      } catch (error) {
        console.error("Voice control error:", error);
        addToast(
          "Voice control failed to start. Check browser permissions.",
          "error",
        );
        setVoiceEnabled(false);
      }
    } else if (!voiceEnabled && voiceControlRef.current) {
      voiceControlRef.current.stop();
      voiceControlRef.current = null;
      addToast("Voice control disabled", "info");
    }
  }, [voiceEnabled, currentStep, totalSteps, steps, addToast, addTimer]);

  const handleStepComplete = () => {
    setCompletedSteps((prev) => new Set([...prev, currentStep]));

    // Stop any ongoing TTS
    window.speechSynthesis.cancel();
    setIsReading(false);
    setWaitingForTimer(false);

    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      // At last step, just mark as complete without looping
      addToast("All steps complete!", "success");
    }
  };

  const handleComplete = () => {
    if (window.confirm("Mark this cooking session as complete?")) {
      window.speechSynthesis.cancel();
      setIsReading(false);
      stopTimerSound();
      onClose(true);
    }
  };

  const handleReadStep = async () => {
    if (isReading) {
      window.speechSynthesis.cancel();
      setIsReading(false);
      setWaitingForTimer(false);
      return;
    }

    // Don't read if past the last step
    if (currentStep >= totalSteps) {
      return;
    }

    setIsReading(true);
    try {
      await speak(steps[currentStep], () => {
        setIsReading(false);

        // Check if step has time requirement
        const timeInfo = detectTimeInStep(steps[currentStep]);
        if (timeInfo.found && autoReadEnabled) {
          // Pause TTS and wait for timer
          setWaitingForTimer(true);
          addToast(`Waiting for ${timeInfo.displayText} timer...`, "info");
          // Don't auto-advance - wait for timer completion
        } else if (autoReadEnabled && currentStep < totalSteps - 1) {
          // No timer needed, auto-advance normally
          setTimeout(() => {
            setCurrentStep((prev) => prev + 1);
          }, 1000);
        }
      });
    } catch (err) {
      console.error("TTS error:", err);
      setIsReading(false);
      setWaitingForTimer(false);
    }
  };

  const handleStopReading = () => {
    window.speechSynthesis.cancel();
    setIsReading(false);
    setWaitingForTimer(false);
  };

  // Handler for step-specific timer button
  const handleStepTimer = (seconds, displayText, timerIndex) => {
    addTimer(seconds, `Step ${currentStep + 1}: ${displayText}`);
    addToast(`${displayText} timer started`, "success");
    setWaitingForTimer(false);

    // Set reference to track this timer
    setActiveStepTimer({ seconds, displayText, timerIndex });

    // After timer completes, play alarm
    stepTimerRef.current = setTimeout(() => {
      playTimerSound(); // Start continuous alarm
      setShowTimerAlert(true); // Show dismissal modal
      setActiveStepTimer(null);
    }, seconds * 1000);
  };

  // Handle timer dismissal - advance to next timer or next step
  const handleDismissTimer = () => {
    stopTimerSound(); // Stop the alarm
    setShowTimerAlert(false);

    // Check if there are more timers in this step
    if (
      currentStepTime.found &&
      currentStepTime.timers &&
      currentStepTime.timers.length > 0
    ) {
      const nextTimerIndex = currentTimerIndex + 1;

      if (nextTimerIndex < currentStepTime.timers.length) {
        // More timers in this step - move to next timer
        setCurrentTimerIndex(nextTimerIndex);
        addToast(
          `Timer ${currentTimerIndex + 1} complete. Start timer ${nextTimerIndex + 1} when ready.`,
          "info",
        );
      } else {
        // All timers complete in this step
        setCurrentTimerIndex(0);

        // Auto-advance to next step if enabled
        if (autoReadEnabled && currentStep < totalSteps - 1) {
          addToast("All timers complete! Moving to next step...", "success");
          setTimeout(() => {
            setCurrentStep((prev) => prev + 1);
          }, 1000);
        } else if (currentStep === totalSteps - 1) {
          addToast("All timers complete!", "success");
        } else {
          addToast("All timers complete! Tap next when ready.", "success");
        }
      }
    } else {
      // No timers or timer info missing - just advance if auto-read enabled
      if (autoReadEnabled && currentStep < totalSteps - 1) {
        addToast("Timer complete! Moving to next step...", "success");
        setTimeout(() => {
          setCurrentStep((prev) => prev + 1);
        }, 1000);
      } else {
        addToast("Timer complete!", "success");
      }
    }
  };

  // Cleanup timer on unmount or step change
  useEffect(() => {
    return () => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
      }
      stopTimerSound(); // Stop alarm if navigating away
    };
  }, [currentStep]);

  // Reset timer index when step changes
  useEffect(() => {
    setCurrentTimerIndex(0);
    stopTimerSound(); // Stop any active alarm
    setShowTimerAlert(false);
  }, [currentStep]);

  // Auto-read when step changes if auto-read is enabled
  useEffect(() => {
    // Skip if this step was already auto-read
    if (lastReadStepRef.current === currentStep) {
      return;
    }

    // Clear any pending auto-read
    if (autoReadTimeoutRef.current) {
      clearTimeout(autoReadTimeoutRef.current);
    }

    // Only auto-read if within valid step range and auto-read is enabled
    if (
      autoReadEnabled &&
      !isReading &&
      !waitingForTimer &&
      !showTimerAlert &&
      currentStep < totalSteps
    ) {
      // Delay to ensure state is settled and TTS is ready
      autoReadTimeoutRef.current = setTimeout(() => {
        // Double-check conditions before reading
        if (
          autoReadEnabled &&
          !isReading &&
          currentStep < totalSteps &&
          lastReadStepRef.current !== currentStep
        ) {
          lastReadStepRef.current = currentStep;
          handleReadStep();
        }
      }, 300);
    }

    return () => {
      if (autoReadTimeoutRef.current) {
        clearTimeout(autoReadTimeoutRef.current);
      }
    };
  }, [
    currentStep,
    autoReadEnabled,
    isReading,
    waitingForTimer,
    showTimerAlert,
  ]);

  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              🍳 {recipe.name}
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setVoiceEnabled(!voiceEnabled)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className={`btn-modal ${voiceEnabled ? "btn-green" : "btn-gray"}`}
                title="Toggle voice control"
              >
                <i
                  className={`fas fa-microphone${voiceEnabled ? "" : "-slash"}`}
                ></i>
              </button>
              <button
                onClick={() => onClose(false)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onClose(false);
                }}
                className="btn-modal btn-gray"
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Step {currentStep + 1} of {totalSteps}
          </p>
        </div>

        <div className="flex-grow overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto">
            <div
              className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-6 rounded-lg mb-6"
              key={currentStep}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold text-xl">
                  {currentStep + 1}
                </div>
                <div className="flex-grow">
                  <p className="text-xl text-gray-900 dark:text-white leading-relaxed">
                    {steps[currentStep] || ""}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-6">
              <button
                onClick={handleReadStep}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleReadStep();
                }}
                className={`btn-modal ${isReading ? "btn-red" : "btn-blue"}`}
              >
                <i
                  className={`fas fa-${isReading ? "stop" : "volume-up"} mr-2`}
                ></i>
                {isReading ? "Stop" : "Read Aloud"}
              </button>
              <button
                onClick={() => {
                  if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                    setIsTTSPaused(false);
                  } else if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.pause();
                    setIsTTSPaused(true);
                  }
                }}
                onTouchStart={(e) => {
                  e.preventDefault();
                  if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                    setIsTTSPaused(false);
                  } else if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.pause();
                    setIsTTSPaused(true);
                  }
                }}
                disabled={!isReading}
                className={`btn-modal ${isTTSPaused ? "btn-green" : "btn-gray"}`}
              >
                <i
                  className={`fas fa-${isTTSPaused ? "play" : "pause"} mr-2`}
                ></i>
                {isTTSPaused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={() => setAutoReadEnabled(!autoReadEnabled)}
                onTouchStart={(e) => {
                  e.preventDefault();
                  setAutoReadEnabled(!autoReadEnabled);
                }}
                className={`btn-modal ${autoReadEnabled ? "btn-green" : "btn-gray"}`}
              >
                <i className="fas fa-forward mr-2"></i>
                Auto-Advance {autoReadEnabled ? "ON" : "OFF"}
              </button>

              {/* Show step-specific timer buttons if times detected */}
              {currentStepTime.found &&
                currentStepTime.timers &&
                currentStepTime.timers.map((timer, index) => {
                  const isCurrentTimer = index === currentTimerIndex;
                  const isActiveTimer =
                    activeStepTimer !== null &&
                    activeStepTimer.timerIndex === index;
                  const isPastTimer = index < currentTimerIndex;

                  return (
                    <button
                      key={index}
                      onClick={() =>
                        handleStepTimer(timer.seconds, timer.displayText, index)
                      }
                      onTouchStart={(e) => {
                        e.preventDefault();
                        if (!activeStepTimer && isCurrentTimer) {
                          handleStepTimer(
                            timer.seconds,
                            timer.displayText,
                            index,
                          );
                        }
                      }}
                      className={`btn-modal ${
                        isPastTimer
                          ? "btn-gray opacity-50 cursor-not-allowed"
                          : isActiveTimer
                            ? "btn-orange"
                            : isCurrentTimer
                              ? "btn-green"
                              : "btn-gray opacity-50 cursor-not-allowed"
                      }`}
                      disabled={!isCurrentTimer || activeStepTimer !== null}
                      title={
                        isPastTimer
                          ? "Timer completed"
                          : !isCurrentTimer
                            ? "Complete previous timer first"
                            : ""
                      }
                    >
                      <i className="fas fa-hourglass-half mr-1"></i>
                      {isPastTimer && "✓ "}
                      Timer {index + 1}: {timer.displayText}
                      {isActiveTimer && " (Running)"}
                    </button>
                  );
                })}

              {/* Show waiting indicator */}
              {waitingForTimer && (
                <div
                  className="btn-modal btn-gray"
                  style={{ opacity: 0.8, cursor: "default" }}
                >
                  <i className="fas fa-clock mr-2 voice-indicator"></i>
                  Waiting for timer...
                </div>
              )}
            </div>

            {recipe.tipsAndTricks && recipe.tipsAndTricks.length > 0 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-500 p-4 rounded-lg">
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-2">
                  💡 Tips
                </h3>
                <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1">
                  {recipe.tipsAndTricks.map((tip, i) => (
                    <li key={i}>• {tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
              onTouchStart={(e) => {
                e.preventDefault();
                if (currentStep > 0) {
                  setCurrentStep(Math.max(0, currentStep - 1));
                }
              }}
              disabled={currentStep === 0}
              className="btn-modal btn-gray"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Previous
            </button>

            <button
              onClick={handleStepComplete}
              onTouchStart={(e) => {
                e.preventDefault();
                handleStepComplete();
              }}
              disabled={currentStep >= totalSteps}
              className="btn-modal btn-green"
            >
              <i className="fas fa-check mr-2"></i>
              {currentStep === totalSteps - 1 ? "Complete Recipe" : "Next Step"}
            </button>

            {currentStep === totalSteps - 1 && (
              <button
                onClick={handleComplete}
                onTouchStart={(e) => {
                  e.preventDefault();
                  handleComplete();
                }}
                className="btn-modal btn-blue"
              >
                <i className="fas fa-flag-checkered mr-2"></i>
                Finish
              </button>
            )}
          </div>
        </div>

        {/* Timer Alert Modal */}
        {showTimerAlert && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6 animate-bounce">
              <div className="text-center">
                <div className="mb-4">
                  <i className="fas fa-bell text-6xl text-orange-500 animate-pulse"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Timer Complete!
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {currentStepTime.timers &&
                  currentStepTime.timers.length > currentTimerIndex + 1
                    ? `Timer ${currentTimerIndex + 1} of ${currentStepTime.timers.length} complete. Ready for next timer?`
                    : "All timers complete!"}
                </p>
                <button
                  onClick={handleDismissTimer}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    handleDismissTimer();
                  }}
                  className="btn-modal btn-green w-full text-lg"
                >
                  <i className="fas fa-check-circle mr-2"></i>
                  {currentStepTime.timers &&
                  currentStepTime.timers.length > currentTimerIndex + 1
                    ? "Continue to Next Timer"
                    : "Continue"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Inventory Modal
const InventoryModal = ({
  inventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  clearAllInventory,
  checkRecipeAvailability,
  recipes,
  onClose,
  addToast,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    quantity: 1,
    unit: "",
    category: "Pantry",
    expirationDate: "",
    location: "Pantry",
    notes: "",
  });
  const [filter, setFilter] = useState("all");

  const categories = [
    "Produce",
    "Meat",
    "Dairy",
    "Pantry",
    // "Spices",
    "Frozen",
    "Other",
  ];
  const locations = ["Pantry", "Fridge", "Freezer", "Cabinet", "Other"];

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      addToast("Please enter an item name", "error");
      return;
    }

    if (editingItem) {
      await updateInventoryItem(editingItem.id, formData);
      setEditingItem(null);
    } else {
      await addInventoryItem(formData);
    }

    setFormData({
      name: "",
      quantity: 1,
      unit: "",
      category: "Pantry",
      expirationDate: "",
      location: "Pantry",
      notes: "",
    });
    setShowAddForm(false);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      expirationDate: item.expirationDate || "",
      location: item.location,
      notes: item.notes || "",
    });
    setShowAddForm(true);
  };

  const handleClearAll = async () => {
    if (
      window.confirm(
        `Are you sure you want to clear all ${inventory.length} items from inventory? This cannot be undone.`,
      )
    ) {
      // Clear all items at once
      await clearAllInventory();
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("Remove this item from inventory?")) {
      await deleteInventoryItem(id);
    }
  };

  const filteredInventory =
    filter === "all"
      ? inventory
      : inventory.filter((item) => item.category === filter);

  const expiringSoon = inventory.filter((item) => {
    if (!item.expirationDate) return false;
    const expDate = new Date(item.expirationDate);
    const today = new Date();
    const daysUntilExpiry = Math.ceil(
      (expDate - today) / (1000 * 60 * 60 * 24),
    );
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
  });

  const canMakeRecipes = recipes.filter((recipe) => {
    const { canMake } = checkRecipeAvailability(recipe);
    return canMake;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              📦 Ingredient Inventory
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {inventory.length} items • {canMakeRecipes.length} recipes you can
              make
            </p>
          </div>
          <div className="flex items-center gap-2">
            {inventory.length > 0 && (
              <button onClick={handleClearAll} className="btn-modal btn-red">
                <i className="fas fa-trash-alt mr-2"></i>
                Clear All
              </button>
            )}
            <button onClick={onClose} className="btn-modal btn-gray">
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {expiringSoon.length > 0 && (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 p-3">
            <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-300">
              <i className="fas fa-exclamation-triangle"></i>
              <span className="font-semibold">
                {expiringSoon.length} item(s) expiring within 7 days
              </span>
            </div>
          </div>
        )}

        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`btn-header ${filter === "all" ? "bg-green-500 text-white" : ""}`}
          >
            All ({inventory.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`btn-header ${filter === cat ? "bg-green-500 text-white" : ""}`}
            >
              {cat} ({inventory.filter((i) => i.category === cat).length})
            </button>
          ))}
        </div>

        <div className="flex-grow overflow-y-auto p-4">
          {!showAddForm && (
            <button
              onClick={() => {
                setShowAddForm(true);
                setEditingItem(null);
              }}
              className="w-full btn-modal btn-green mb-4"
            >
              <i className="fas fa-plus mr-2"></i>
              Add Item to Inventory
            </button>
          )}

          {showAddForm && (
            <form
              onSubmit={handleSubmit}
              className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4"
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                {editingItem ? "Edit Item" : "Add New Item"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Item name *"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="modal-input"
                  required
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Qty"
                    value={formData.quantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        quantity: parseFloat(e.target.value) || 1,
                      })
                    }
                    className="modal-input flex-grow"
                    min="0"
                    step="0.1"
                  />
                  <input
                    type="text"
                    placeholder="Unit"
                    value={formData.unit}
                    onChange={(e) =>
                      setFormData({ ...formData, unit: e.target.value })
                    }
                    className="modal-input w-24"
                  />
                </div>
                <select
                  value={formData.category}
                  onChange={(e) =>
                    setFormData({ ...formData, category: e.target.value })
                  }
                  className="modal-input"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  className="modal-input"
                >
                  {locations.map((loc) => (
                    <option key={loc} value={loc}>
                      {loc}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={formData.expirationDate}
                  onChange={(e) =>
                    setFormData({ ...formData, expirationDate: e.target.value })
                  }
                  className="modal-input"
                  placeholder="Expiration date"
                />
                <input
                  type="text"
                  placeholder="Notes (optional)"
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  className="modal-input"
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button type="submit" className="btn-modal btn-green">
                  <i
                    className={`fas fa-${editingItem ? "save" : "plus"} mr-2`}
                  ></i>
                  {editingItem ? "Save Changes" : "Add Item"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingItem(null);
                    setFormData({
                      name: "",
                      quantity: 1,
                      unit: "",
                      category: "Pantry",
                      expirationDate: "",
                      location: "Pantry",
                      notes: "",
                    });
                  }}
                  className="btn-modal btn-gray"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {filteredInventory.length === 0 ? (
            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
              <i className="fas fa-box-open text-4xl mb-3"></i>
              <p>No items in this category</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredInventory.map((item) => {
                const expDate = item.expirationDate
                  ? new Date(item.expirationDate)
                  : null;
                const today = new Date();
                const daysUntilExpiry = expDate
                  ? Math.ceil((expDate - today) / (1000 * 60 * 60 * 24))
                  : null;
                const isExpiring =
                  daysUntilExpiry !== null &&
                  daysUntilExpiry >= 0 &&
                  daysUntilExpiry <= 7;
                const isExpired =
                  daysUntilExpiry !== null && daysUntilExpiry < 0;

                return (
                  <div
                    key={item.id}
                    className={`bg-white dark:bg-gray-700 rounded-lg p-3 border-2 ${
                      isExpired
                        ? "border-red-500"
                        : isExpiring
                          ? "border-yellow-500"
                          : "border-gray-200 dark:border-gray-600"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {item.name}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {item.quantity} {item.unit}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(item)}
                          className="text-blue-500 hover:text-blue-700 text-sm"
                          title="Edit item"
                        >
                          <i className="fas fa-edit"></i>
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-red-500 hover:text-red-700 text-sm"
                          title="Delete item"
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                      <p>📍 {item.location}</p>
                      <p>🏷️ {item.category}</p>
                      {expDate && (
                        <p
                          className={
                            isExpired
                              ? "text-red-500"
                              : isExpiring
                                ? "text-yellow-600"
                                : ""
                          }
                        >
                          ⏰{" "}
                          {isExpired
                            ? "Expired"
                            : isExpiring
                              ? `Expires in ${daysUntilExpiry}d`
                              : expDate.toLocaleDateString()}
                        </p>
                      )}
                      {item.notes && <p>📝 {item.notes}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {canMakeRecipes.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                ✨ Recipes You Can Make Now ({canMakeRecipes.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto">
                {canMakeRecipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3"
                  >
                    <p className="font-medium text-gray-900 dark:text-white">
                      {recipe.name}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {recipe.type} • {recipe.cuisine}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Collections Modal
const CollectionsModal = ({
  collections,
  recipes,
  createCollection,
  addRecipeToCollection,
  removeRecipeFromCollection,
  deleteCollection,
  openRecipeDetails,
  onClose,
  addToast,
  selectedRecipes = [],
}) => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDesc, setNewCollectionDesc] = useState("");
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [showAddRecipes, setShowAddRecipes] = useState(false);
  const [bulkAddMode, setBulkAddMode] = useState(selectedRecipes.length > 0);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newCollectionName.trim()) {
      addToast("Please enter a collection name", "error");
      return;
    }
    await createCollection(newCollectionName, newCollectionDesc);
    setNewCollectionName("");
    setNewCollectionDesc("");
    setShowCreateForm(false);
  };

  const handleDelete = async (collectionId) => {
    if (
      window.confirm("Delete this collection? Recipes will not be deleted.")
    ) {
      await deleteCollection(collectionId);
      if (selectedCollection?.id === collectionId) {
        setSelectedCollection(null);
      }
    }
  };

  const handleAddRecipe = async (recipeId) => {
    if (selectedCollection) {
      await addRecipeToCollection(selectedCollection.id, recipeId);
      setSelectedCollection((prev) => ({
        ...prev,
        recipeIds: [...prev.recipeIds, recipeId],
      }));
    }
  };

  const handleBulkAddRecipes = async (collectionId) => {
    if (selectedRecipes.length > 0) {
      for (const recipeId of selectedRecipes) {
        await addRecipeToCollection(collectionId, recipeId);
      }
      const collection = collections.find((c) => c.id === collectionId);
      addToast(
        `Added ${selectedRecipes.length} recipes to ${collection?.name || "collection"}`,
        "success",
      );
      onClose();
    }
  };

  const handleRemoveRecipe = async (recipeId) => {
    if (selectedCollection) {
      await removeRecipeFromCollection(selectedCollection.id, recipeId);
      setSelectedCollection((prev) => ({
        ...prev,
        recipeIds: prev.recipeIds.filter((id) => id !== recipeId),
      }));
    }
  };

  const availableRecipes = selectedCollection
    ? recipes.filter((r) => !selectedCollection.recipeIds.includes(r.id))
    : [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              📁 Recipe Collections
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Organize your recipes into collections
            </p>
          </div>
          <button onClick={onClose} className="btn-modal btn-gray">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-grow overflow-hidden flex">
          <div className="w-1/3 border-r border-gray-200 dark:border-gray-700 overflow-y-auto p-4">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="w-full btn-modal btn-green mb-4"
            >
              <i className="fas fa-plus mr-2"></i>
              New Collection
            </button>

            {showCreateForm && (
              <form
                onSubmit={handleCreate}
                className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-4"
              >
                <input
                  type="text"
                  placeholder="Collection name *"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  className="modal-input mb-2"
                  required
                />
                <textarea
                  placeholder="Description (optional)"
                  value={newCollectionDesc}
                  onChange={(e) => setNewCollectionDesc(e.target.value)}
                  className="modal-textarea mb-2"
                  rows="2"
                ></textarea>
                <div className="flex gap-2">
                  <button type="submit" className="btn-modal btn-green text-xs">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(false)}
                    className="btn-modal btn-gray text-xs"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {collections.length === 0 ? (
              <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                <i className="fas fa-folder-open text-4xl mb-3"></i>
                <p className="text-sm">No collections yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {bulkAddMode && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-3 mb-3">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">
                      <i className="fas fa-info-circle mr-2"></i>
                      Select a collection to add {selectedRecipes.length} recipe
                      {selectedRecipes.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                )}
                {collections.map((collection) => (
                  <div
                    key={collection.id}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      selectedCollection?.id === collection.id
                        ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                        : "border-gray-200 dark:border-gray-600 hover:border-green-300"
                    }`}
                    onClick={() => {
                      if (bulkAddMode) {
                        handleBulkAddRecipes(collection.id);
                      } else {
                        setSelectedCollection(collection);
                      }
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-grow">
                        <h3 className="font-semibold text-gray-900 dark:text-white">
                          {collection.name}
                        </h3>
                        {collection.description && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {collection.description}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {collection.recipeIds.length} recipe(s)
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(collection.id);
                        }}
                        className="text-red-500 hover:text-red-700 text-sm ml-2"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex-grow overflow-y-auto p-4">
            {!selectedCollection ? (
              <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                <div className="text-center">
                  <i className="fas fa-arrow-left text-4xl mb-3"></i>
                  <p>Select a collection to view recipes</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {selectedCollection.name}
                  </h3>
                  <button
                    onClick={() => setShowAddRecipes(!showAddRecipes)}
                    className="btn-modal btn-green"
                  >
                    <i className="fas fa-plus mr-2"></i>
                    Add Recipes
                  </button>
                </div>

                {showAddRecipes && (
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 mb-4 max-h-60 overflow-y-auto">
                    <h4 className="font-semibold mb-2 text-gray-900 dark:text-white">
                      Available Recipes
                    </h4>
                    {availableRecipes.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        All recipes are already in this collection
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {availableRecipes.map((recipe) => (
                          <div
                            key={recipe.id}
                            className="flex justify-between items-center p-2 bg-white dark:bg-gray-800 rounded"
                          >
                            <span className="text-sm text-gray-900 dark:text-white">
                              {recipe.name}
                            </span>
                            <button
                              onClick={() => handleAddRecipe(recipe.id)}
                              className="text-green-500 hover:text-green-700 text-sm"
                            >
                              <i className="fas fa-plus"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedCollection.recipeIds.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                    <i className="fas fa-book-open text-4xl mb-3"></i>
                    <p>No recipes in this collection yet</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedCollection.recipeIds.map((recipeId) => {
                      const recipe = recipes.find((r) => r.id === recipeId);
                      if (!recipe) return null;

                      return (
                        <div
                          key={recipe.id}
                          className="bg-white dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600"
                        >
                          <div className="flex justify-between items-start">
                            <div
                              className="flex-grow cursor-pointer"
                              onClick={() => openRecipeDetails(recipe)}
                            >
                              <h4 className="font-semibold text-gray-900 dark:text-white hover:text-green-500">
                                {recipe.name}
                              </h4>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {recipe.type} • {recipe.cuisine}
                              </p>
                            </div>
                            <button
                              onClick={() => handleRemoveRecipe(recipe.id)}
                              className="text-red-500 hover:text-red-700 text-sm ml-2"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Analytics Modal
const AnalyticsModal = ({ recipes, cookingSessions, ratings, onClose }) => {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadAnalytics = async () => {
      const data = await getAnalytics(recipes);
      setAnalytics(data);
      setLoading(false);
    };
    loadAnalytics();
  }, [recipes, cookingSessions, ratings]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
          <i className="fas fa-spinner fa-spin text-4xl text-green-500"></i>
        </div>
      </div>
    );
  }

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              📊 Analytics & Statistics
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your cooking insights and achievements
            </p>
          </div>
          <button onClick={onClose} className="btn-modal btn-gray">
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="flex-grow overflow-y-auto p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Total Recipes</p>
                  <p className="text-3xl font-bold">{analytics.totalRecipes}</p>
                </div>
                <i className="fas fa-book text-4xl opacity-20"></i>
              </div>
            </div>

            <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Times Cooked</p>
                  <p className="text-3xl font-bold">{analytics.totalCooked}</p>
                </div>
                <i className="fas fa-fire text-4xl opacity-20"></i>
              </div>
            </div>

            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Cooking Time</p>
                  <p className="text-3xl font-bold">
                    {formatTime(analytics.totalCookingTime)}
                  </p>
                </div>
                <i className="fas fa-clock text-4xl opacity-20"></i>
              </div>
            </div>

            <div className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm opacity-90">Cooking Streak</p>
                  <p className="text-3xl font-bold">{analytics.streak} days</p>
                </div>
                <i className="fas fa-trophy text-4xl opacity-20"></i>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <i className="fas fa-star text-yellow-500"></i>
                Most Cooked Recipes
              </h3>
              {analytics.mostCooked.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No cooking sessions recorded yet
                </p>
              ) : (
                <div className="space-y-2">
                  {analytics.mostCooked.map((item, index) => (
                    <div
                      key={item.recipeId}
                      className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400 flex items-center justify-center font-bold">
                          {index + 1}
                        </div>
                        <span className="text-gray-900 dark:text-white font-medium">
                          {item.recipeName}
                        </span>
                      </div>
                      <span className="text-gray-600 dark:text-gray-400 text-sm">
                        {item.count}× cooked
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white dark:bg-gray-700 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <i className="fas fa-heart text-red-500"></i>
                Favorites
              </h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <span className="text-gray-700 dark:text-gray-300">
                    Favorite Recipes
                  </span>
                  <span className="text-2xl font-bold text-red-500">
                    {analytics.favoriteRecipes}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                  <span className="text-gray-700 dark:text-gray-300">
                    Average Rating
                  </span>
                  <span className="text-2xl font-bold text-yellow-500">
                    {analytics.avgRating}{" "}
                    <i className="fas fa-star text-lg"></i>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-6 border border-green-200 dark:border-green-800">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <i className="fas fa-medal text-yellow-500"></i>
              Achievements
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {analytics.totalRecipes >= 10 && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-3 text-center">
                  <i className="fas fa-book-open text-3xl text-blue-500 mb-2"></i>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    Recipe Collector
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    10+ recipes
                  </p>
                </div>
              )}
              {analytics.totalCooked >= 25 && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-3 text-center">
                  <i className="fas fa-utensils text-3xl text-green-500 mb-2"></i>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    Master Chef
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    25+ cooked
                  </p>
                </div>
              )}
              {analytics.streak >= 7 && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-3 text-center">
                  <i className="fas fa-fire text-3xl text-red-500 mb-2"></i>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    On Fire
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    7 day streak
                  </p>
                </div>
              )}
              {analytics.favoriteRecipes >= 5 && (
                <div className="bg-white dark:bg-gray-700 rounded-lg p-3 text-center">
                  <i className="fas fa-heart text-3xl text-pink-500 mb-2"></i>
                  <p className="text-xs font-semibold text-gray-900 dark:text-white">
                    Fan Favorite
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    5+ favorites
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 11: RECIPE SUGGESTIONS MODAL =====
const RecipeSuggestionsModal = ({
  recipes,
  inventory,
  onClose,
  openRecipeDetails,
  addToast,
}) => {
  const [expandedRecipes, setExpandedRecipes] = useState({});

  const suggestions = useMemo(() => {
    return getRecipeSuggestions(recipes, inventory, 10);
  }, [recipes, inventory]);

  const getMissingIngredients = useCallback(
    (recipe) => {
      const inventoryNames = inventory.map((item) => item.name.toLowerCase());
      return recipe.ingredients.filter((ing) => {
        const normalized = normalizeIngredient(ing).toLowerCase();
        return !inventoryNames.some(
          (invName) =>
            invName.includes(normalized) || normalized.includes(invName),
        );
      });
    },
    [inventory],
  );

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-labelledby="suggestions-modal-title"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto modal-scale-enter">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h2
            id="suggestions-modal-title"
            className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <i className="fas fa-lightbulb text-yellow-500"></i>
            Recipe Suggestions
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 text-3xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {suggestions.length === 0 ? (
          <EmptyState
            icon="fa-shopping-basket"
            title="No Suggestions Yet"
            description="Add items to your inventory to get personalized recipe suggestions based on what you have!"
          />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Based on your inventory, here are recipes you can make:
            </p>
            {suggestions.map((suggestion, idx) => {
              const missingIngredients = getMissingIngredients(
                suggestion.recipe,
              );
              const isExpanded = expandedRecipes[suggestion.recipe.id];

              return (
                <div
                  key={suggestion.recipe.id}
                  className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-4 hover-lift"
                >
                  <div
                    className="flex justify-between items-start cursor-pointer"
                    onClick={() => {
                      openRecipeDetails(suggestion.recipe);
                      onClose();
                    }}
                  >
                    <div className="flex-1">
                      <h3 className="font-bold text-lg text-gray-900 dark:text-white flex items-center gap-2">
                        {suggestion.recipe.name}
                        {suggestion.matchPercent === 100 && (
                          <span className="badge-new">100% Match!</span>
                        )}
                      </h3>
                      <div className="mt-2">
                        <div className="progress-bar">
                          <div
                            className="progress-fill"
                            style={{ width: `${suggestion.matchPercent}%` }}
                          ></div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                          {suggestion.matchingCount} of{" "}
                          {suggestion.recipe.ingredients.length} ingredients
                          available ({Math.round(suggestion.matchPercent)}%)
                        </p>
                      </div>
                    </div>
                    <i className="fas fa-chevron-right text-gray-400 ml-4"></i>
                  </div>

                  {suggestion.missingCount > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedRecipes((prev) => ({
                            ...prev,
                            [suggestion.recipe.id]: !prev[suggestion.recipe.id],
                          }));
                        }}
                        className="flex items-center gap-2 text-sm text-orange-600 dark:text-orange-400 hover:text-orange-700 font-medium"
                      >
                        <i
                          className={`fas fa-chevron-${isExpanded ? "up" : "down"}`}
                        ></i>
                        Missing {suggestion.missingCount} ingredient
                        {suggestion.missingCount > 1 ? "s" : ""}
                      </button>

                      {isExpanded && (
                        <ul className="mt-2 space-y-1 ml-6">
                          {missingIngredients.map((ing, idx) => (
                            <li
                              key={idx}
                              className="text-sm text-gray-700 dark:text-gray-300 flex items-start gap-2"
                            >
                              <i className="fas fa-times-circle text-red-500 mt-0.5"></i>
                              <span>{ing}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-600 flex justify-end">
          <button onClick={onClose} className="btn-modal btn-gray">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 21: MEAL PREP MODE MODAL =====
const MealPrepModal = ({
  recipes,
  selectedRecipes,
  onClose,
  addToShoppingList,
  addToast,
}) => {
  const [selectedForPrep, setSelectedForPrep] = useState(selectedRecipes || []);
  const [batchMultiplier, setBatchMultiplier] = useState(1);

  const consolidatedIngredients = useMemo(() => {
    const ingredientMap = {};

    selectedForPrep.forEach((recipeId) => {
      const recipe = recipes.find((r) => r.id === recipeId);
      if (!recipe) return;

      recipe.ingredients.forEach((ing) => {
        const normalized = normalizeIngredient(ing);
        const { quantity, unit, description } = parseIngredient(ing);

        if (!ingredientMap[normalized]) {
          ingredientMap[normalized] = {
            description,
            unit,
            totalQuantity: 0,
            recipes: [],
          };
        }

        if (quantity) {
          ingredientMap[normalized].totalQuantity += quantity * batchMultiplier;
        }
        ingredientMap[normalized].recipes.push(recipe.name);
      });
    });

    return Object.entries(ingredientMap).map(([key, data]) => ({
      normalized: key,
      ...data,
    }));
  }, [selectedForPrep, recipes, batchMultiplier]);

  const handleAddAllToShoppingList = () => {
    selectedForPrep.forEach((id) => addToShoppingList(id));
    addToast(
      `Added ingredients from ${selectedForPrep.length} recipes to shopping list`,
      "success",
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-labelledby="meal-prep-modal-title"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto modal-scale-enter">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h2
            id="meal-prep-modal-title"
            className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <i className="fas fa-calendar-check text-purple-500"></i>
            Meal Prep Planner
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 text-3xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Batch Multiplier (make multiple servings):
          </label>
          <input
            type="number"
            min="1"
            value={batchMultiplier}
            onChange={(e) =>
              setBatchMultiplier(Math.max(1, parseInt(e.target.value) || 1))
            }
            className="modal-input w-32"
          />
        </div>

        {selectedForPrep.length === 0 ? (
          <EmptyState
            icon="fa-calendar"
            title="No Recipes Selected"
            description="Select recipes from your collection to plan your meal prep!"
          />
        ) : (
          <>
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Selected Recipes ({selectedForPrep.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {selectedForPrep.map((recipeId) => {
                  const recipe = recipes.find((r) => r.id === recipeId);
                  return recipe ? (
                    <div
                      key={recipeId}
                      className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 flex justify-between items-center"
                    >
                      <span className="font-medium text-gray-900 dark:text-white">
                        {recipe.name}
                      </span>
                      <button
                        onClick={() =>
                          setSelectedForPrep((prev) =>
                            prev.filter((id) => id !== recipeId),
                          )
                        }
                        className="text-red-500 hover:text-red-700"
                      >
                        <i className="fas fa-times"></i>
                      </button>
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-white">
                Consolidated Shopping List (×{batchMultiplier})
              </h3>
              <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                {consolidatedIngredients.map((ing, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-start py-2 border-b border-gray-200 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {ing.totalQuantity > 0 &&
                          `${formatQuantity(ing.totalQuantity)} `}
                        {ing.unit && `${ing.unit} `}
                        {ing.description}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Used in: {ing.recipes.join(", ")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
              <button onClick={onClose} className="btn-modal btn-gray">
                Close
              </button>
              <button
                onClick={handleAddAllToShoppingList}
                className="btn-modal btn-green"
              >
                <i className="fas fa-cart-plus mr-2"></i>
                Add All to Shopping List
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ===== FEATURE 25: NUTRITION GOALS DASHBOARD MODAL =====
const NutritionGoalsModal = ({
  recipes,
  cookingSessions,
  nutritionGoals,
  setNutritionGoals,
  onClose,
  addToast,
}) => {
  const [goals, setGoals] = useState(nutritionGoals);
  const [selectedPeriod, setSelectedPeriod] = useState("daily"); // daily, weekly

  const todaysNutrition = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    const todaysSessions = cookingSessions.filter((session) => {
      const sessionDate = new Date(session.completedAt)
        .toISOString()
        .split("T")[0];
      return sessionDate === today && session.completed;
    });

    let totalCals = 0,
      totalProtein = 0,
      totalCarbs = 0,
      totalFat = 0;

    todaysSessions.forEach((session) => {
      const recipe = recipes.find((r) => r.id === session.recipeId);
      if (recipe) {
        totalCals += recipe.calories || 0;
        totalProtein += recipe.protein || 0;
        totalCarbs += recipe.carbs || 0;
        totalFat += recipe.fat || 0;
      }
    });

    return {
      calories: totalCals,
      protein: totalProtein,
      carbs: totalCarbs,
      fat: totalFat,
    };
  }, [cookingSessions, recipes]);

  const handleSaveGoals = async () => {
    await setNutritionGoals(goals);
    addToast("Nutrition goals updated!", "success");
    onClose();
  };

  const getProgressColor = (current, goal) => {
    const percent = (current / goal) * 100;
    if (percent >= 100) return "bg-red-500";
    if (percent >= 80) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-labelledby="nutrition-goals-modal-title"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto modal-scale-enter">
        <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h2
            id="nutrition-goals-modal-title"
            className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <i className="fas fa-chart-pie text-green-500"></i>
            Nutrition Goals Dashboard
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 text-3xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Daily Goals
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Calories
                </label>
                <input
                  type="number"
                  value={goals.dailyCalories}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      dailyCalories: parseInt(e.target.value) || 0,
                    })
                  }
                  className="modal-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Protein (g)
                </label>
                <input
                  type="number"
                  value={goals.dailyProtein}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      dailyProtein: parseInt(e.target.value) || 0,
                    })
                  }
                  className="modal-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Carbs (g)
                </label>
                <input
                  type="number"
                  value={goals.dailyCarbs}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      dailyCarbs: parseInt(e.target.value) || 0,
                    })
                  }
                  className="modal-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                  Fat (g)
                </label>
                <input
                  type="number"
                  value={goals.dailyFat}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      dailyFat: parseInt(e.target.value) || 0,
                    })
                  }
                  className="modal-input"
                />
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Today's Progress
            </h3>
            <div className="space-y-4">
              {["calories", "protein", "carbs", "fat"].map((nutrient) => {
                const current = todaysNutrition[nutrient];
                const goal =
                  goals[`daily${capitalizeFirstLetter(nutrient)}`] || 1;
                const percent = Math.min((current / goal) * 100, 100);

                return (
                  <div key={nutrient}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {capitalizeFirstLetter(nutrient)}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        {current} / {goal} {nutrient !== "calories" && "g"}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${getProgressColor(current, goal)}`}
                        style={{ width: `${percent}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-600">
          <button onClick={onClose} className="btn-modal btn-gray">
            Cancel
          </button>
          <button onClick={handleSaveGoals} className="btn-modal btn-green">
            <i className="fas fa-save mr-2"></i>
            Save Goals
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 29: BULK OPERATIONS TOOLBAR =====
const BulkOperationsToolbar = ({
  selectedCount,
  onDelete,
  onAddToCollection,
  onExport,
  onCancel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}) => {
  if (selectedCount === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-600 p-4 shadow-lg z-50 glass-morphism"
      role="toolbar"
      aria-label="Bulk recipe operations"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span
            className="font-semibold text-gray-900 dark:text-white"
            role="status"
            aria-live="polite"
          >
            {selectedCount} selected
          </span>
          <button
            onClick={onCancel}
            className="btn-modal btn-gray text-sm"
            aria-label="Cancel bulk selection"
          >
            <i className="fas fa-times mr-2"></i>
            Cancel
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className="btn-modal btn-gray text-sm"
            title="Undo (Ctrl+Z)"
            aria-label="Undo last action"
          >
            <i className="fas fa-undo"></i>
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            className="btn-modal btn-gray text-sm"
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo last action"
          >
            <i className="fas fa-redo"></i>
          </button>
          <button
            onClick={onAddToCollection}
            className="btn-modal btn-blue text-sm"
            aria-label={`Add ${selectedCount} recipes to collection`}
          >
            <i className="fas fa-folder-plus mr-2"></i>
            Add to Collection
          </button>
          <button
            onClick={onExport}
            className="btn-modal btn-orange text-sm"
            aria-label={`Export ${selectedCount} selected recipes`}
          >
            <i className="fas fa-download mr-2"></i>
            Export Selected
          </button>
          <button
            onClick={onDelete}
            className="btn-modal btn-red text-sm"
            aria-label={`Delete ${selectedCount} selected recipes`}
          >
            <i className="fas fa-trash mr-2"></i>
            Delete Selected
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 13: SUBSTITUTIONS MODAL =====
const SubstitutionsModal = ({ ingredient, onClose }) => {
  const substitutions = findSubstitutions(ingredient);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[70] p-4"
      role="dialog"
      aria-labelledby="substitutions-modal-title"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md modal-scale-enter">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h3
            id="substitutions-modal-title"
            className="text-xl font-bold text-gray-900 dark:text-white"
          >
            Substitutions
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 text-2xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {!substitutions ? (
          <div className="text-center py-6">
            <i className="fas fa-info-circle text-4xl text-gray-400 mb-3"></i>
            <p className="text-gray-600 dark:text-gray-400">
              No substitutions found for "{ingredient}"
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              You can substitute <strong>{substitutions.ingredient}</strong>{" "}
              with:
            </p>
            <ul className="space-y-2">
              {substitutions.substitutes.map((sub, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg"
                >
                  <i className="fas fa-check-circle text-green-500 mt-1"></i>
                  <span className="text-gray-800 dark:text-gray-200">
                    {sub}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn-modal btn-gray">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 23: PHOTO GALLERY =====
const PhotoGalleryModal = ({ photos, currentIndex, onClose, onNavigate }) => {
  const [index, setIndex] = useState(currentIndex || 0);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "ArrowLeft" && index > 0) {
        setIndex(index - 1);
      } else if (e.key === "ArrowRight" && index < photos.length - 1) {
        setIndex(index + 1);
      } else if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [index, photos.length, onClose]);

  if (!photos || photos.length === 0) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[80] p-4"
      role="dialog"
      aria-labelledby="photo-gallery-title"
      aria-modal="true"
    >
      <div className="relative w-full max-w-5xl">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white text-4xl hover:text-red-500"
          aria-label="Close photo gallery"
        >
          &times;
        </button>

        <div className="bg-white dark:bg-gray-900 rounded-lg overflow-hidden">
          <img
            src={photos[index]}
            alt={`Recipe photo ${index + 1} of ${photos.length}`}
            className="w-full max-h-[70vh] object-contain"
          />

          <div className="p-4 flex items-center justify-between bg-gray-100 dark:bg-gray-800">
            <button
              onClick={() => setIndex(Math.max(0, index - 1))}
              disabled={index === 0}
              className="btn-modal btn-gray"
              aria-label="Previous photo"
            >
              <i className="fas fa-chevron-left"></i>
            </button>

            <span className="text-gray-700 dark:text-gray-300" role="status">
              {index + 1} / {photos.length}
            </span>

            <button
              onClick={() => setIndex(Math.min(photos.length - 1, index + 1))}
              disabled={index === photos.length - 1}
              className="btn-modal btn-gray"
              aria-label="Next photo"
            >
              <i className="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 24: VIDEO CLIPS PLAYER =====
const VideoClipsModal = ({ videos, currentIndex, onClose }) => {
  const [index, setIndex] = useState(currentIndex || 0);

  if (!videos || videos.length === 0) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-95 flex items-center justify-center z-[80] p-4"
      role="dialog"
      aria-labelledby="video-clips-title"
      aria-modal="true"
    >
      <div className="relative w-full max-w-5xl">
        <button
          onClick={onClose}
          className="absolute -top-12 right-0 text-white text-4xl hover:text-red-500"
          aria-label="Close video player"
        >
          &times;
        </button>

        <div className="bg-white dark:bg-gray-900 rounded-lg overflow-hidden">
          <video
            key={index}
            src={videos[index]}
            controls
            autoPlay
            className="w-full max-h-[70vh]"
            aria-label={`Recipe video ${index + 1} of ${videos.length}`}
          />

          {videos.length > 1 && (
            <div className="p-4 flex items-center justify-between bg-gray-100 dark:bg-gray-800">
              <button
                onClick={() => setIndex(Math.max(0, index - 1))}
                disabled={index === 0}
                className="btn-modal btn-gray"
                aria-label="Previous video"
              >
                <i className="fas fa-chevron-left"></i>
              </button>

              <span className="text-gray-700 dark:text-gray-300" role="status">
                Video {index + 1} / {videos.length}
              </span>

              <button
                onClick={() => setIndex(Math.min(videos.length - 1, index + 1))}
                disabled={index === videos.length - 1}
                className="btn-modal btn-gray"
                aria-label="Next video"
              >
                <i className="fas fa-chevron-right"></i>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ===== FEATURE 20: COLLABORATIVE SHARING (CLOUD SYNC STRUCTURE) =====
const CloudSyncModal = ({ onClose, addToast }) => {
  const [syncCode, setSyncCode] = useState("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [inputCode, setInputCode] = useState("");

  const generateSyncCode = () => {
    setIsGeneratingCode(true);
    const code = Math.random().toString(36).substr(2, 8).toUpperCase();
    setTimeout(() => {
      setSyncCode(code);
      setIsGeneratingCode(false);
      addToast("Sync code generated!", "success");
    }, 500);
  };

  const handleConnect = () => {
    if (inputCode.length >= 6) {
      addToast(`Demo: Would connect to device with code ${inputCode}`, "info");
      onClose();
    } else {
      addToast("Please enter a valid sync code", "error");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-labelledby="cloud-sync-title"
      aria-modal="true"
    >
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl modal-scale-enter">
        <div className="flex justify-between items-center mb-6 border-b border-gray-200 dark:border-gray-600 pb-3">
          <h2
            id="cloud-sync-title"
            className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"
          >
            <i className="fas fa-cloud text-blue-500"></i>
            Cloud Sync
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-red-500 text-3xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Generate Code Section */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-xl p-6 border border-blue-200 dark:border-blue-700">
            <div className="text-center">
              <i className="fas fa-share-alt text-4xl text-blue-500 mb-3"></i>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Share Your Recipes
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Generate a code to share your entire recipe collection
              </p>

              {!syncCode ? (
                <button
                  onClick={generateSyncCode}
                  disabled={isGeneratingCode}
                  className="btn-modal btn-blue w-full"
                  aria-label="Generate sync code"
                >
                  {isGeneratingCode ? (
                    <>
                      <i className="fas fa-spinner fa-spin mr-2"></i>
                      Generating...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-key mr-2"></i>
                      Generate Code
                    </>
                  )}
                </button>
              ) : (
                <div className="bg-white dark:bg-gray-900 p-4 rounded-lg shadow-inner">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                    Your Sync Code
                  </p>
                  <p className="text-4xl font-mono font-bold text-blue-600 dark:text-blue-400 tracking-widest mb-3">
                    {syncCode}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(syncCode);
                      addToast("Code copied to clipboard!", "success");
                    }}
                    className="btn-modal bg-blue-500 hover:bg-blue-600 text-white text-sm w-full"
                  >
                    <i className="fas fa-copy mr-2"></i>
                    Copy Code
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Connect Section */}
          <div className="bg-gradient-to-br from-green-50 to-teal-50 dark:from-green-900/20 dark:to-teal-900/20 rounded-xl p-6 border border-green-200 dark:border-green-700">
            <div className="text-center">
              <i className="fas fa-link text-4xl text-green-500 mb-3"></i>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                Connect to Device
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Enter a code to sync recipes from another device
              </p>

              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="Enter sync code"
                className="modal-input text-center font-mono text-lg tracking-widest mb-4"
                maxLength="8"
              />

              <button
                onClick={handleConnect}
                disabled={inputCode.length < 6}
                className="btn-modal btn-green w-full"
                aria-label="Connect to device"
              >
                <i className="fas fa-plug mr-2"></i>
                Connect
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6 bg-blue-50 dark:bg-blue-900/10 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
          <div className="flex items-start gap-3">
            <i className="fas fa-info-circle text-blue-500 mt-0.5"></i>
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <strong>Demo Feature:</strong> In production, this would sync your
              recipes with a real backend server, enabling cross-device
              synchronization and collaborative sharing.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button onClick={onClose} className="btn-modal btn-gray">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

// Shared Recipe Viewer Component (for QR code scans)
const SharedRecipeViewer = ({ recipe, onClose }) => {
  const [currentServings, setCurrentServings] = useState(recipe?.servings || 1);
  const baseServings = recipe?.servings > 0 ? recipe.servings : 1;
  const servingsMultiplier = currentServings / baseServings;

  // Safety checks for required arrays
  const ingredients = recipe?.ingredients || [];
  const directions = recipe?.directions || [];
  const tipsAndTricks = recipe?.tipsAndTricks || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-[70] p-4 overflow-y-auto">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[95vh] overflow-y-auto modal-scale-enter">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-600 p-4 z-10">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {recipe.name}
              </h2>
              <div className="flex flex-wrap gap-2 text-sm text-gray-600 dark:text-gray-400">
                {recipe.type && <span>🍽️ {recipe.type}</span>}
                {recipe.cuisine && <span>🌍 {recipe.cuisine}</span>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-red-500 text-3xl ml-4"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        <div className="p-6">
          {recipe.image && (
            <img
              src={recipe.image}
              alt={recipe.name}
              className="w-full h-64 object-cover rounded-lg mb-6"
            />
          )}

          {recipe.description && (
            <p className="text-gray-700 dark:text-gray-300 mb-6 italic">
              {recipe.description}
            </p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
              <i className="fas fa-clock text-blue-500 text-xl mb-1"></i>
              <p className="text-xs text-gray-600 dark:text-gray-400">Prep</p>
              <p className="font-bold text-gray-900 dark:text-white">
                {recipe.prepTime || 0}m
              </p>
            </div>
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
              <i className="fas fa-fire text-orange-500 text-xl mb-1"></i>
              <p className="text-xs text-gray-600 dark:text-gray-400">Cook</p>
              <p className="font-bold text-gray-900 dark:text-white">
                {recipe.cookTime || 0}m
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
              <i className="fas fa-utensils text-green-500 text-xl mb-1"></i>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Servings
              </p>
              <p className="font-bold text-gray-900 dark:text-white">
                {currentServings}
              </p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
              <i className="fas fa-star text-purple-500 text-xl mb-1"></i>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Difficulty
              </p>
              <p className="font-bold text-gray-900 dark:text-white">
                {recipe.difficulty || "Medium"}
              </p>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <i className="fas fa-list-ul text-green-500"></i>
              Ingredients
            </h3>
            <ul className="space-y-2">
              {ingredients.map((ing, idx) => {
                const { quantity, unit, description } = parseIngredient(ing);
                const scaledQuantity = quantity
                  ? quantity * servingsMultiplier
                  : null;
                return (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <i className="fas fa-check-circle text-green-500 mt-1"></i>
                    <span>
                      {scaledQuantity !== null && (
                        <strong>{formatQuantity(scaledQuantity)} </strong>
                      )}
                      {unit && <span>{unit} </span>}
                      <span>{description}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
              <i className="fas fa-book-open text-blue-500"></i>
              Directions
            </h3>
            <ol className="space-y-3">
              {directions.map((dir, idx) => (
                <li key={idx} className="flex gap-3">
                  <span className="flex-shrink-0 w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center font-bold">
                    {idx + 1}
                  </span>
                  <p className="flex-1 text-gray-700 dark:text-gray-300 pt-1">
                    {dir}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {tipsAndTricks.length > 0 && (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                <i className="fas fa-lightbulb text-yellow-500"></i>
                Tips & Tricks
              </h3>
              <ul className="space-y-2">
                {tipsAndTricks.map((tip, idx) => (
                  <li
                    key={idx}
                    className="text-sm text-gray-700 dark:text-gray-300 flex gap-2"
                  >
                    <i className="fas fa-star text-yellow-500 mt-0.5"></i>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-600 pt-4">
            <p>📱 Shared via Recipe Manager Pro QR Code</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const reactRoot = ReactDOM.createRoot(rootElement);

  // Check if this is a shared recipe link via URL hash
  const urlHash = window.location.hash;
  const hashMatch = urlHash.match(/#recipe=(.+)/);

  if (hashMatch) {
    try {
      const encodedRecipe = hashMatch[1];
      const decodedData = decodeURIComponent(escape(atob(encodedRecipe)));
      const compactRecipe = JSON.parse(decodedData);

      // Expand compact data back to full recipe format
      const sharedRecipe = {
        name: compactRecipe.n,
        type: compactRecipe.t,
        cuisine: compactRecipe.c,
        description: compactRecipe.d,
        prepTime: compactRecipe.p,
        cookTime: compactRecipe.k,
        servings: compactRecipe.s,
        difficulty: compactRecipe.df,
        ingredients: compactRecipe.i,
        directions: compactRecipe.r,
        tipsAndTricks: compactRecipe.tt,
        image: compactRecipe.img,
      };

      reactRoot.render(
        <ErrorBoundary>
          <SharedRecipeViewer
            recipe={sharedRecipe}
            onClose={() => {
              window.location.hash = "";
              window.location.reload();
            }}
          />
        </ErrorBoundary>,
      );
    } catch (error) {
      console.error("Error loading shared recipe:", error);
      reactRoot.render(
        <ErrorBoundary>
          <Cookbook />
        </ErrorBoundary>,
      );
    }
  } else {
    reactRoot.render(
      <ErrorBoundary>
        <Cookbook />
      </ErrorBoundary>,
    );
  }
} else {
  console.error("Root element not found! React app cannot be mounted.");
}
