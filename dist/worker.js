// src/content.ts
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400"
    }
  });
}
async function handleGetCuisines(env) {
  const results = await env.DB.prepare(
    "SELECT id, name, slug, description, cover_url FROM cuisines WHERE id > 0 ORDER BY sort_order ASC"
  ).all();
  const items = results.results.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    cover: c.cover_url ? {
      url: c.cover_url,
      formats: { small: { url: c.cover_url } }
    } : null
  }));
  return jsonResponse({ success: true, data: items });
}
async function handleGetCuisineBySlug(env, slug) {
  const cuisine = await env.DB.prepare(
    "SELECT id, name, slug, description, cover_url FROM cuisines WHERE slug = ?"
  ).bind(slug).first();
  if (!cuisine) return jsonResponse({ success: false, error: "\u83DC\u7CFB\u4E0D\u5B58\u5728" }, 404);
  const item = {
    id: cuisine.id,
    name: cuisine.name,
    slug: cuisine.slug,
    description: cuisine.description,
    cover: cuisine.cover_url ? {
      url: cuisine.cover_url,
      formats: { small: { url: cuisine.cover_url } }
    } : null
  };
  return jsonResponse({ success: true, data: item });
}
async function handleGetTags(env) {
  const results = await env.DB.prepare(
    "SELECT id, name, slug, icon FROM tags WHERE id > 0 ORDER BY sort_order ASC"
  ).all();
  return jsonResponse({ success: true, data: results.results });
}
async function handleGetMethods(env) {
  const results = await env.DB.prepare("SELECT id, name FROM methods").all();
  return jsonResponse({ success: true, data: results.results });
}
async function handleGetRegions(env) {
  const results = await env.DB.prepare("SELECT id, name FROM regions").all();
  return jsonResponse({ success: true, data: results.results });
}
async function buildRecipeObject(env, recipe) {
  const [ingredients, steps, tags, methods, regions] = await Promise.all([
    env.DB.prepare("SELECT name, amount FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC").bind(recipe.id).all(),
    env.DB.prepare("SELECT step_number, text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC").bind(recipe.id).all(),
    env.DB.prepare("SELECT t.id, t.name, t.slug, t.icon FROM tags t JOIN recipe_tags rt ON t.id = rt.tag_id WHERE rt.recipe_id = ?").bind(recipe.id).all(),
    env.DB.prepare("SELECT m.id, m.name FROM methods m JOIN recipe_methods rm ON m.id = rm.method_id WHERE rm.recipe_id = ?").bind(recipe.id).all(),
    env.DB.prepare("SELECT r.id, r.name FROM regions r JOIN recipe_regions rr ON r.id = rr.region_id WHERE rr.recipe_id = ?").bind(recipe.id).all()
  ]);
  let cuisine = null;
  if (recipe.cuisine_id) {
    const c = await env.DB.prepare("SELECT name, slug FROM cuisines WHERE id = ?").bind(recipe.cuisine_id).first();
    if (c) cuisine = { name: c.name, slug: c.slug };
  }
  return {
    id: recipe.id,
    title: recipe.title,
    slug: recipe.slug,
    description: recipe.description,
    difficulty: recipe.difficulty,
    cookTime: recipe.cook_time,
    servings: recipe.servings,
    calories: recipe.calories,
    cuisine,
    methods: methods.results.map((m) => ({ name: m.name })),
    tags: tags.results.map((t) => ({ name: t.name, slug: t.slug, icon: t.icon })),
    regions: regions.results.map((r) => ({ name: r.name })),
    ingredients: ingredients.results.map((ing) => ({ name: ing.name, amount: ing.amount, isMain: true })),
    steps: steps.results.map((s) => ({ stepNumber: s.step_number, description: s.text })),
    cover: recipe.cover_url ? {
      url: recipe.cover_url,
      formats: { small: { url: recipe.cover_url } }
    } : null,
    nutrition: recipe.nutrition || "",
    common_mistakes: recipe.common_mistakes || "",
    success_tips: recipe.success_tips || "",
    ingredient_substitutes: recipe.ingredient_substitutes || "",
    suitable_for: recipe.suitable_for || "",
    required_tools: recipe.required_tools || ""
  };
}
async function handleGetRecipes(env) {
  const results = await env.DB.prepare(
    "SELECT id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url, nutrition, common_mistakes, success_tips, ingredient_substitutes, suitable_for, required_tools FROM recipes WHERE published = 1 ORDER BY id DESC"
  ).all();
  const items = await Promise.all(results.results.map((r) => buildRecipeObject(env, r)));
  return jsonResponse({ success: true, data: items });
}
async function handleGetRecipeBySlug(env, slug) {
  const recipe = await env.DB.prepare(
    "SELECT id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url, nutrition, common_mistakes, success_tips, ingredient_substitutes, suitable_for, required_tools FROM recipes WHERE slug = ? AND published = 1"
  ).bind(slug).first();
  if (!recipe) return jsonResponse({ success: false, error: "\u98DF\u8C31\u4E0D\u5B58\u5728" }, 404);
  const item = await buildRecipeObject(env, recipe);
  return jsonResponse({ success: true, data: item });
}
async function handleGetKnowledge(env, category) {
  let query = "SELECT id, title, slug, category, content, author, is_original, published_at, summary, keywords FROM knowledge_entries WHERE published = 1";
  const params = [];
  if (category) {
    query += " AND category = ?";
    params.push(category);
  }
  query += " ORDER BY id DESC";
  const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
  const results = await stmt.all();
  const items = results.results.map((k) => ({
    id: k.id,
    title: k.title,
    slug: k.slug,
    category: k.category,
    content: k.content,
    author: k.author,
    is_original: k.is_original,
    published_at: k.published_at,
    summary: k.summary,
    keywords: k.keywords
  }));
  return jsonResponse({ success: true, data: items });
}
async function handleGetKnowledgeBySlug(env, slug) {
  const entry = await env.DB.prepare(
    "SELECT id, title, slug, category, content, author, is_original, published_at, summary, keywords FROM knowledge_entries WHERE slug = ? AND published = 1"
  ).bind(slug).first();
  if (!entry) return jsonResponse({ success: false, error: "\u5185\u5BB9\u4E0D\u5B58\u5728" }, 404);
  return jsonResponse({ success: true, data: entry });
}
async function handleContentRequest(path, request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400"
      }
    });
  }
  if (path === "/api/content/cuisines" && request.method === "GET") {
    return await handleGetCuisines(env);
  }
  const cuisineMatch = path.match(/^\/api\/content\/cuisines\/([^/]+)$/);
  if (cuisineMatch && request.method === "GET") {
    return await handleGetCuisineBySlug(env, decodeURIComponent(cuisineMatch[1]));
  }
  if (path === "/api/content/recipes" && request.method === "GET") {
    return await handleGetRecipes(env);
  }
  const recipeMatch = path.match(/^\/api\/content\/recipes\/([^/]+)$/);
  if (recipeMatch && request.method === "GET") {
    return await handleGetRecipeBySlug(env, decodeURIComponent(recipeMatch[1]));
  }
  if (path === "/api/content/knowledge" && request.method === "GET") {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || void 0;
    return await handleGetKnowledge(env, category);
  }
  const knowledgeMatch = path.match(/^\/api\/content\/knowledge\/([^/]+)$/);
  if (knowledgeMatch && request.method === "GET") {
    return await handleGetKnowledgeBySlug(env, decodeURIComponent(knowledgeMatch[1]));
  }
  if (path === "/api/content/secrets" && request.method === "GET") {
    return await handleGetKnowledge(env, "secret");
  }
  const secretMatch = path.match(/^\/api\/content\/secrets\/([^/]+)$/);
  if (secretMatch && request.method === "GET") {
    return await handleGetKnowledgeBySlug(env, decodeURIComponent(secretMatch[1]));
  }
  if (path === "/api/content/tags" && request.method === "GET") {
    return await handleGetTags(env);
  }
  if (path === "/api/content/methods" && request.method === "GET") {
    return await handleGetMethods(env);
  }
  if (path === "/api/content/regions" && request.method === "GET") {
    return await handleGetRegions(env);
  }
  if (path === "/api/content/ingredients" && request.method === "GET") {
    const url = new URL(request.url);
    const category = url.searchParams.get("category") || void 0;
    return await handleGetIngredients(env, category);
  }
  const ingredientMatch = path.match(/^\/api\/content\/ingredients\/([^/]+)$/);
  if (ingredientMatch && request.method === "GET") {
    return await handleGetIngredientBySlug(env, decodeURIComponent(ingredientMatch[1]));
  }
  if (path === "/api/content/search" && request.method === "GET") {
    return await handleSearch(env, request);
  }
  return null;
}
async function handleGetIngredients(env, category) {
  let query = "SELECT id, name, slug, category, description, image_url, nutrition, tips, aliases, season, origin, storage_method, pairing_suggestions, avoid_with FROM ingredients WHERE published = 1";
  const params = [];
  if (category) {
    query += " AND category = ?";
    params.push(category);
  }
  query += " ORDER BY id DESC";
  const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
  const results = await stmt.all();
  const items = results.results.map((ing) => ({
    id: ing.id,
    name: ing.name,
    slug: ing.slug,
    category: ing.category,
    description: ing.description,
    imageUrl: ing.image_url,
    nutrition: ing.nutrition,
    tips: ing.tips,
    aliases: ing.aliases,
    season: ing.season,
    origin: ing.origin,
    storageMethod: ing.storage_method,
    pairingSuggestions: ing.pairing_suggestions,
    avoidWith: ing.avoid_with
  }));
  return jsonResponse({ success: true, data: items });
}
async function handleGetIngredientBySlug(env, slug) {
  const ing = await env.DB.prepare(
    "SELECT id, name, slug, category, description, image_url, nutrition, tips, aliases, season, origin, storage_method, pairing_suggestions, avoid_with FROM ingredients WHERE slug = ? AND published = 1"
  ).bind(slug).first();
  if (!ing) return jsonResponse({ success: false, error: "\u98DF\u6750\u4E0D\u5B58\u5728" }, 404);
  const recipes = await env.DB.prepare(
    "SELECT r.id, r.title, r.slug, r.difficulty, r.cook_time, r.cover_url FROM recipes r JOIN recipe_ingredients ri ON r.id = ri.recipe_id WHERE ri.name = ? AND r.published = 1 ORDER BY r.id ASC"
  ).bind(ing.name).all();
  const item = {
    id: ing.id,
    name: ing.name,
    slug: ing.slug,
    category: ing.category,
    description: ing.description,
    imageUrl: ing.image_url,
    nutrition: ing.nutrition,
    tips: ing.tips,
    aliases: ing.aliases,
    season: ing.season,
    origin: ing.origin,
    storageMethod: ing.storage_method,
    pairingSuggestions: ing.pairing_suggestions,
    avoidWith: ing.avoid_with,
    relatedRecipes: recipes.results.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      difficulty: r.difficulty,
      cookTime: r.cook_time,
      cover: r.cover_url ? { url: r.cover_url, formats: { small: { url: r.cover_url } } } : null
    }))
  };
  return jsonResponse({ success: true, data: item });
}
async function handleSearch(env, request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const type = url.searchParams.get("type") || "all";
  if (!q || q.trim().length === 0) {
    return jsonResponse({ success: true, data: { recipes: [], knowledge: [], ingredients: [], total: 0 } });
  }
  const keyword = `%${q.trim()}%`;
  const results = { query: q, recipes: [], knowledge: [], ingredients: [], total: 0 };
  if (type === "all" || type === "recipes") {
    const recipes = await env.DB.prepare(
      "SELECT id, title, slug, description, difficulty, cook_time, cover_url FROM recipes WHERE (title LIKE ? OR description LIKE ?) AND published = 1 ORDER BY id ASC LIMIT 20"
    ).bind(keyword, keyword).all();
    results.recipes = recipes.results.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      difficulty: r.difficulty,
      cookTime: r.cook_time,
      cover: r.cover_url ? { url: r.cover_url, formats: { small: { url: r.cover_url } } } : null,
      type: "recipe"
    }));
  }
  if (type === "secrets") {
    const secrets = await env.DB.prepare(
      "SELECT id, title, slug, category FROM knowledge_entries WHERE (title LIKE ? OR content LIKE ?) AND published = 1 AND category = ? ORDER BY id ASC LIMIT 20"
    ).bind(keyword, keyword, "secret").all();
    results.secrets = secrets.results.map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      category: s.category,
      type: "secret"
    }));
  }
  if (type === "all" || type === "knowledge") {
    const knowledge = await env.DB.prepare(
      "SELECT id, title, slug, category FROM knowledge_entries WHERE (title LIKE ? OR content LIKE ?) AND published = 1 AND category != ? ORDER BY id ASC LIMIT 20"
    ).bind(keyword, keyword, "secret").all();
    const secrets = await env.DB.prepare(
      "SELECT id, title, slug, category FROM knowledge_entries WHERE (title LIKE ? OR content LIKE ?) AND published = 1 AND category = ? ORDER BY id ASC LIMIT 20"
    ).bind(keyword, keyword, "secret").all();
    results.secrets = secrets.results.map((s) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      category: s.category,
      type: "secret"
    }));
    results.knowledge = knowledge.results.map((k) => ({
      id: k.id,
      title: k.title,
      slug: k.slug,
      category: k.category,
      type: "knowledge"
    }));
  }
  if (type === "all" || type === "ingredients") {
    const ingredients = await env.DB.prepare(
      "SELECT id, name, slug, category, description, image_url FROM ingredients WHERE (name LIKE ? OR description LIKE ? OR aliases LIKE ?) AND published = 1 ORDER BY id ASC LIMIT 20"
    ).bind(keyword, keyword, keyword).all();
    results.ingredients = ingredients.results.map((ing) => ({
      id: ing.id,
      name: ing.name,
      slug: ing.slug,
      category: ing.category,
      description: ing.description,
      imageUrl: ing.image_url,
      type: "ingredient"
    }));
  }
  results.total = results.recipes.length + results.knowledge.length + (results.secrets?.length || 0) + results.ingredients.length;
  return jsonResponse({ success: true, data: results });
}

// src/migrate.ts
function jsonResponse2(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
async function runSQL(env, sql) {
  await env.DB.prepare(sql).run();
}
async function createTables(env) {
  await runSQL(env, "CREATE TABLE IF NOT EXISTS cuisines (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT DEFAULT '', cover_url TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_cuisines_slug ON cuisines(slug)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, icon TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS regions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS methods (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS recipes (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, description TEXT DEFAULT '', difficulty TEXT DEFAULT 'simple', cook_time INTEGER DEFAULT 0, servings INTEGER DEFAULT 1, calories INTEGER DEFAULT 0, cuisine_id INTEGER, cover_url TEXT DEFAULT '', published INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE SET NULL)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes(slug)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes(cuisine_id)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS recipe_ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER NOT NULL, name TEXT NOT NULL, amount TEXT DEFAULT '', sort_order INTEGER DEFAULT 0, FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipe_id)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS recipe_steps (id INTEGER PRIMARY KEY AUTOINCREMENT, recipe_id INTEGER NOT NULL, step_number INTEGER NOT NULL, text TEXT NOT NULL, FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_rs_recipe ON recipe_steps(recipe_id)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS recipe_tags (recipe_id INTEGER NOT NULL, tag_id INTEGER NOT NULL, PRIMARY KEY (recipe_id, tag_id), FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE, FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS recipe_methods (recipe_id INTEGER NOT NULL, method_id INTEGER NOT NULL, PRIMARY KEY (recipe_id, method_id), FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE, FOREIGN KEY (method_id) REFERENCES methods(id) ON DELETE CASCADE)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS recipe_regions (recipe_id INTEGER NOT NULL, region_id INTEGER NOT NULL, PRIMARY KEY (recipe_id, region_id), FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE, FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE)");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS knowledge_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, category TEXT NOT NULL DEFAULT 'flavor', content TEXT DEFAULT '', author TEXT DEFAULT '', is_original INTEGER DEFAULT 0, published_at TEXT DEFAULT '', published INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
  try {
    await runSQL(env, "ALTER TABLE knowledge_entries ADD COLUMN author TEXT DEFAULT ''");
  } catch (e) {
  }
  try {
    await runSQL(env, "ALTER TABLE knowledge_entries ADD COLUMN is_original INTEGER DEFAULT 0");
  } catch (e) {
  }
  try {
    await runSQL(env, "ALTER TABLE knowledge_entries ADD COLUMN published_at TEXT DEFAULT ''");
  } catch (e) {
  }
  await runSQL(env, "CREATE TABLE IF NOT EXISTS ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, category TEXT NOT NULL DEFAULT 'ingredient', description TEXT DEFAULT '', image_url TEXT DEFAULT '', nutrition TEXT DEFAULT '', tips TEXT DEFAULT '', aliases TEXT DEFAULT '', season TEXT DEFAULT '', origin TEXT DEFAULT '', storage_method TEXT DEFAULT '', published INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_ingredients_slug ON ingredients(slug)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_knowledge_slug ON knowledge_entries(slug)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category)");
}
async function handleAdminInit(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== env.ADMIN_SECRET) {
    return jsonResponse2({ success: false, error: "\u65E0\u6743\u64CD\u4F5C" }, 403);
  }
  const results = [];
  try {
    results.push("Creating tables...");
    await createTables(env);
    results.push("Tables created successfully");
    const existing = await env.DB.prepare("SELECT COUNT(*) as count FROM cuisines").first();
    if (existing && existing.count > 0) {
      const coverUpdates = [
        { id: 1, cover_url: "/images/cuisines/chuan.jpg" },
        { id: 2, cover_url: "/images/cuisines/yue.jpg" },
        { id: 3, cover_url: "/images/cuisines/xiang.jpg" },
        { id: 4, cover_url: "/images/cuisines/zhe.jpg" },
        { id: 5, cover_url: "/images/cuisines/lu.jpg" },
        { id: 6, cover_url: "/images/cuisines/su.jpg" },
        { id: 7, cover_url: "/images/cuisines/min.jpg" },
        { id: 8, cover_url: "/images/cuisines/hui.jpg" },
        { id: 9, cover_url: "/images/cuisines/dongbei.jpg" },
        { id: 10, cover_url: "/images/cuisines/riliao.jpg" },
        { id: 11, cover_url: "/images/cuisines/jianzhi.jpg" },
        { id: 12, cover_url: "/images/cuisines/ertong.jpg" }
      ];
      for (const c of coverUpdates) {
        await env.DB.prepare("UPDATE cuisines SET cover_url = ? WHERE id = ?").bind(c.cover_url, c.id).run();
      }
      results.push("Updated cover URLs for " + coverUpdates.length + " cuisines");
      return jsonResponse2({ success: true, data: results });
    }
    results.push("Seeding data...");
    const cuisines = [
      { id: 1, name: "\u5DDD\u83DC", slug: "chuan-cai", description: "\u9EBB\u8FA3\u9C9C\u9999\uFF0C\u767E\u83DC\u767E\u5473", cover_url: "/images/cuisines/chuan.jpg", sort: 1 },
      { id: 2, name: "\u7CA4\u83DC", slug: "yue-cai", description: "\u6E05\u9C9C\u5AE9\u6ED1\uFF0C\u98DF\u4E0D\u538C\u7CBE", cover_url: "/images/cuisines/yue.jpg", sort: 2 },
      { id: 3, name: "\u6E58\u83DC", slug: "xiang-cai", description: "\u9999\u8FA3\u6D53\u70C8\uFF0C\u6ECB\u5473\u60A0\u957F", cover_url: "/images/cuisines/xiang.jpg", sort: 3 },
      { id: 4, name: "\u6D59\u83DC", slug: "zhe-cai", description: "\u6E05\u9C9C\u8106\u5AE9\uFF0C\u539F\u6C41\u539F\u5473", cover_url: "/images/cuisines/zhe.jpg", sort: 4 },
      { id: 5, name: "\u9C81\u83DC", slug: "lu-cai", description: "\u54B8\u9C9C\u4E3A\u4E3B\uFF0C\u9187\u539A\u5927\u6C14", cover_url: "/images/cuisines/lu.jpg", sort: 5 },
      { id: 6, name: "\u82CF\u83DC", slug: "su-cai", description: "\u751C\u54B8\u9002\u4E2D\uFF0C\u9165\u70C2\u53EF\u53E3", cover_url: "/images/cuisines/su.jpg", sort: 6 },
      { id: 7, name: "\u95FD\u83DC", slug: "min-cai", description: "\u9C9C\u9999\u6E05\u751C\uFF0C\u6C64\u83DC\u5C45\u591A", cover_url: "/images/cuisines/min.jpg", sort: 7 },
      { id: 8, name: "\u5FBD\u83DC", slug: "hui-cai", description: "\u91CD\u6CB9\u91CD\u8272\uFF0C\u706B\u529F\u8BB2\u7A76", cover_url: "/images/cuisines/hui.jpg", sort: 8 },
      { id: 9, name: "\u4E1C\u5317\u83DC", slug: "dongbei-cai", description: "\u91CF\u5927\u5B9E\u5728\uFF0C\u6D53\u9999\u9187\u539A", cover_url: "/images/cuisines/dongbei.jpg", sort: 9 },
      { id: 10, name: "\u65E5\u6599", slug: "ri-liao", description: "\u7CBE\u81F4\u7EC6\u817B\uFF0C\u5C0A\u91CD\u98DF\u6750\u672C\u5473", cover_url: "/images/cuisines/riliao.jpg", sort: 10 },
      { id: 11, name: "\u51CF\u8102\u9910", slug: "jianzhi-can", description: "\u4F4E\u5361\u7F8E\u5473\uFF0C\u5065\u5EB7\u642D\u914D", cover_url: "/images/cuisines/jianzhi.jpg", sort: 11 },
      { id: 12, name: "\u513F\u7AE5\u9910", slug: "ertong-can", description: "\u8425\u517B\u5747\u8861\uFF0C\u8272\u5F69\u7F24\u7EB7", cover_url: "/images/cuisines/ertong.jpg", sort: 12 }
    ];
    for (const c of cuisines) {
      await env.DB.prepare("INSERT OR IGNORE INTO cuisines (id, name, slug, description, cover_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)").bind(c.id, c.name, c.slug, c.description, c.cover_url, c.sort).run();
    }
    for (const c of cuisines) {
      await env.DB.prepare("UPDATE cuisines SET cover_url = ? WHERE id = ?").bind(c.cover_url, c.id).run();
    }
    results.push("Inserted " + cuisines.length + " cuisines");
    const tags = [
      { id: 1, name: "\u5FEB\u624B\u83DC", slug: "quick", icon: "\u26A1", sort: 1 },
      { id: 2, name: "\u591C\u5BB5", slug: "latesnack", icon: "\u{1F319}", sort: 2 },
      { id: 3, name: "\u51CF\u8102", slug: "diet", icon: "\u{1F957}", sort: 3 },
      { id: 4, name: "\u70D8\u7119", slug: "baking", icon: "\u{1F9C1}", sort: 4 },
      { id: 5, name: "\u4E0B\u996D\u83DC", slug: "xiaban", icon: "\u{1F35A}", sort: 5 },
      { id: 6, name: "\u5BB6\u5E38\u83DC", slug: "homecook", icon: "\u{1F3E0}", sort: 6 }
    ];
    for (const t of tags) {
      await env.DB.prepare("INSERT OR IGNORE INTO tags (id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)").bind(t.id, t.name, t.slug, t.icon, t.sort).run();
    }
    results.push("Inserted " + tags.length + " tags");
    const regions = ["\u56DB\u5DDD", "\u5E7F\u4E1C", "\u6E56\u5357", "\u6D59\u6C5F", "\u5C71\u4E1C", "\u4E1C\u5317"];
    const regionIds = {};
    for (let i = 0; i < regions.length; i++) {
      const id = i + 1;
      regionIds[regions[i]] = id;
      await env.DB.prepare("INSERT OR IGNORE INTO regions (id, name) VALUES (?, ?)").bind(id, regions[i]).run();
    }
    results.push("Inserted " + regions.length + " regions");
    const methods = ["\u7092", "\u84B8", "\u7096", "\u70E4"];
    const methodIds = {};
    for (let i = 0; i < methods.length; i++) {
      const id = i + 1;
      methodIds[methods[i]] = id;
      await env.DB.prepare("INSERT OR IGNORE INTO methods (id, name) VALUES (?, ?)").bind(id, methods[i]).run();
    }
    results.push("Inserted " + methods.length + " methods");
    const recipes = [
      {
        id: 1,
        title: "\u9EBB\u5A46\u8C46\u8150",
        slug: "mapo-doufu",
        description: "\u7ECF\u5178\u5DDD\u83DC\uFF0C\u9EBB\u8FA3\u9C9C\u9999\uFF0C\u5AE9\u8C46\u8150\u88F9\u7740\u7EA2\u6CB9\u8089\u672B\uFF0C\u4E0B\u996D\u4E00\u7EDD\u3002",
        difficulty: "easy",
        cookTime: 20,
        servings: 2,
        calories: 280,
        cuisineId: 1,
        ingredients: [{ name: "\u5AE9\u8C46\u8150", amount: "1\u5757(\u7EA6400g)" }, { name: "\u732A\u8089\u672B", amount: "100g" }, { name: "\u90EB\u53BF\u8C46\u74E3\u9171", amount: "1.5\u5927\u52FA" }, { name: "\u82B1\u6912\u7C89", amount: "1\u5C0F\u52FA" }, { name: "\u849C\u672B", amount: "3\u74E3" }, { name: "\u8471\u82B1", amount: "\u9002\u91CF" }, { name: "\u751F\u62BD", amount: "1\u5927\u52FA" }, { name: "\u6C34\u6DC0\u7C89", amount: "2\u5927\u52FA" }],
        steps: [{ num: 1, text: "\u8C46\u8150\u5207\u62102cm\u89C1\u65B9\u7684\u5C0F\u5757\uFF0C\u51B7\u6C34\u4E0B\u9505\u52A0\u5C11\u8BB8\u76D0\uFF0C\u716E\u5F00\u540E\u635E\u51FA\u6CA5\u5E72\u3002" }, { num: 2, text: "\u9505\u4E2D\u5012\u6CB9\u70E7\u70ED\uFF0C\u4E0B\u8089\u672B\u7092\u6563\u81F3\u53D8\u8272\u3002" }, { num: 3, text: "\u52A0\u5165\u90EB\u53BF\u8C46\u74E3\u9171\u7092\u51FA\u7EA2\u6CB9\uFF0C\u4E0B\u849C\u672B\u7092\u9999\u3002" }, { num: 4, text: "\u52A0\u5165\u534A\u7897\u6C34\u70E7\u5F00\uFF0C\u653E\u5165\u8C46\u8150\u5757\uFF0C\u5C0F\u706B\u716E3\u5206\u949F\u8BA9\u8C46\u8150\u5165\u5473\u3002" }, { num: 5, text: "\u6DCB\u5165\u6C34\u6DC0\u7C89\u52FE\u82A1\uFF0C\u6492\u82B1\u6912\u7C89\u548C\u8471\u82B1\u5373\u53EF\u51FA\u9505\u3002" }],
        tagIds: [1, 5],
        methodIds: [1],
        regionIds: [1]
      },
      {
        id: 2,
        title: "\u756A\u8304\u7092\u86CB",
        slug: "fanqie-chaodan",
        description: "\u56FD\u6C11\u5BB6\u5E38\u83DC\uFF0C\u9178\u751C\u53EF\u53E3\uFF0C\u65B0\u624B\u4E5F\u80FD\u8F7B\u677E\u641E\u5B9A\u3002",
        difficulty: "easy",
        cookTime: 10,
        servings: 2,
        calories: 220,
        cuisineId: 6,
        ingredients: [{ name: "\u756A\u8304", amount: "2\u4E2A" }, { name: "\u9E21\u86CB", amount: "3\u4E2A" }, { name: "\u767D\u7CD6", amount: "1\u5C0F\u52FA" }, { name: "\u76D0", amount: "\u9002\u91CF" }, { name: "\u8471\u82B1", amount: "\u5C11\u8BB8" }],
        steps: [{ num: 1, text: "\u756A\u8304\u5207\u5757\uFF0C\u9E21\u86CB\u6253\u6563\u52A0\u5C11\u8BB8\u76D0\u6405\u5300\u3002" }, { num: 2, text: "\u9505\u70ED\u5012\u6CB9\uFF0C\u5012\u5165\u86CB\u6DB2\uFF0C\u5FEB\u901F\u7FFB\u7092\u81F3\u51DD\u56FA\u540E\u76DB\u51FA\u3002" }, { num: 3, text: "\u518D\u52A0\u5C11\u8BB8\u6CB9\uFF0C\u4E0B\u756A\u8304\u5757\u7092\u81F3\u51FA\u6C41\u3002" }, { num: 4, text: "\u52A0\u5165\u767D\u7CD6\u548C\u76D0\u8C03\u5473\uFF0C\u5012\u56DE\u9E21\u86CB\u7FFB\u7092\u5747\u5300\uFF0C\u6492\u8471\u82B1\u51FA\u9505\u3002" }],
        tagIds: [1, 6],
        methodIds: [1],
        regionIds: []
      },
      {
        id: 3,
        title: "\u7EA2\u70E7\u8089",
        slug: "hongshao-rou",
        description: "\u6D53\u6CB9\u8D64\u9171\uFF0C\u80A5\u800C\u4E0D\u817B\uFF0C\u5165\u53E3\u5373\u5316\u7684\u7ECF\u5178\u786C\u83DC\u3002",
        difficulty: "medium",
        cookTime: 90,
        servings: 4,
        calories: 650,
        cuisineId: 5,
        ingredients: [{ name: "\u4E94\u82B1\u8089", amount: "500g" }, { name: "\u51B0\u7CD6", amount: "30g" }, { name: "\u751F\u62BD", amount: "2\u5927\u52FA" }, { name: "\u8001\u62BD", amount: "1\u5927\u52FA" }, { name: "\u6599\u9152", amount: "2\u5927\u52FA" }, { name: "\u516B\u89D2", amount: "2\u4E2A" }, { name: "\u6842\u76AE", amount: "1\u5C0F\u6BB5" }, { name: "\u59DC\u7247", amount: "3\u7247" }, { name: "\u8471\u6BB5", amount: "2\u6839" }],
        steps: [{ num: 1, text: "\u4E94\u82B1\u8089\u52073cm\u89C1\u65B9\u7684\u5757\uFF0C\u51B7\u6C34\u4E0B\u9505\u712F\u6C34\u53BB\u8840\u6CAB\uFF0C\u635E\u51FA\u6CA5\u5E72\u3002" }, { num: 2, text: "\u9505\u4E2D\u653E\u5C11\u8BB8\u6CB9\uFF0C\u4E0B\u51B0\u7CD6\u5C0F\u706B\u7092\u51FA\u7CD6\u8272\u81F3\u67A3\u7EA2\u8272\u3002" }, { num: 3, text: "\u4E0B\u8089\u5757\u7FFB\u7092\u4E0A\u8272\uFF0C\u52A0\u5165\u6599\u9152\u3001\u751F\u62BD\u3001\u8001\u62BD\u7FFB\u7092\u5747\u5300\u3002" }, { num: 4, text: "\u52A0\u5165\u6CA1\u8FC7\u8089\u7684\u5F00\u6C34\uFF0C\u653E\u516B\u89D2\u3001\u6842\u76AE\u3001\u59DC\u7247\u3001\u8471\u6BB5\u3002" }, { num: 5, text: "\u5927\u706B\u70E7\u5F00\u540E\u8F6C\u5C0F\u706B\u709660-80\u5206\u949F\uFF0C\u6700\u540E\u5927\u706B\u6536\u6C41\u5373\u53EF\u3002" }],
        tagIds: [5, 6],
        methodIds: [1],
        regionIds: [5]
      },
      {
        id: 4,
        title: "\u6E05\u84B8\u9C88\u9C7C",
        slug: "qingzheng-luyu",
        description: "\u7CA4\u5F0F\u7ECF\u5178\uFF0C\u9C7C\u8089\u5AE9\u6ED1\u9C9C\u751C\uFF0C\u4FDD\u7559\u98DF\u6750\u6700\u672C\u771F\u7684\u5473\u9053\u3002",
        difficulty: "simple",
        cookTime: 15,
        servings: 2,
        calories: 180,
        cuisineId: 2,
        ingredients: [{ name: "\u9C88\u9C7C", amount: "1\u6761(\u7EA6500g)" }, { name: "\u8471\u4E1D", amount: "\u9002\u91CF" }, { name: "\u59DC\u4E1D", amount: "\u9002\u91CF" }, { name: "\u84B8\u9C7C\u8C49\u6CB9", amount: "2\u5927\u52FA" }, { name: "\u6599\u9152", amount: "1\u5927\u52FA" }, { name: "\u82B1\u751F\u6CB9", amount: "2\u5927\u52FA" }],
        steps: [{ num: 1, text: "\u9C88\u9C7C\u5904\u7406\u5E72\u51C0\uFF0C\u9C7C\u8EAB\u4E24\u9762\u5212\u51E0\u5200\uFF0C\u62B9\u5C11\u8BB8\u6599\u9152\u548C\u76D0\u814C\u523610\u5206\u949F\u3002" }, { num: 2, text: "\u9C7C\u8EAB\u4E0B\u57AB\u59DC\u7247\u548C\u8471\u6BB5\uFF0C\u653E\u5165\u84B8\u9505\u5927\u706B\u84B88-10\u5206\u949F\u3002" }, { num: 3, text: "\u84B8\u597D\u540E\u5012\u6389\u76D8\u4E2D\u79EF\u6C34\uFF0C\u94FA\u4E0A\u8471\u4E1D\u59DC\u4E1D\u3002" }, { num: 4, text: "\u6DCB\u4E0A\u84B8\u9C7C\u8C49\u6CB9\uFF0C\u5C06\u70E7\u81F3\u5192\u70DF\u7684\u82B1\u751F\u6CB9\u6D47\u5728\u8471\u59DC\u4E1D\u4E0A\u5373\u53EF\u3002" }],
        tagIds: [3, 6],
        methodIds: [2],
        regionIds: [2]
      },
      {
        id: 5,
        title: "\u849C\u84C9\u897F\u5170\u82B1",
        slug: "suanrong-xilanhua",
        description: "\u6E05\u6DE1\u8425\u517B\uFF0C\u849C\u9999\u6D53\u90C1\uFF0C\u51CF\u8102\u671F\u5FC5\u5907\u7684\u5065\u5EB7\u83DC\u54C1\u3002",
        difficulty: "easy",
        cookTime: 8,
        servings: 2,
        calories: 85,
        cuisineId: 11,
        ingredients: [{ name: "\u897F\u5170\u82B1", amount: "1\u9897(\u7EA6300g)" }, { name: "\u849C\u672B", amount: "4\u74E3" }, { name: "\u76D0", amount: "\u9002\u91CF" }, { name: "\u869D\u6CB9", amount: "1\u5C0F\u52FA" }],
        steps: [{ num: 1, text: "\u897F\u5170\u82B1\u63B0\u6210\u5C0F\u6735\uFF0C\u6E05\u6C34\u6D78\u6CE110\u5206\u949F\u540E\u6D17\u51C0\u3002" }, { num: 2, text: "\u70E7\u5F00\u6C34\uFF0C\u52A0\u5C11\u8BB8\u76D0\u548C\u6CB9\uFF0C\u712F\u6C341\u5206\u949F\u635E\u51FA\u6CA5\u5E72\u3002" }, { num: 3, text: "\u9505\u4E2D\u5012\u5C11\u8BB8\u6CB9\uFF0C\u7206\u9999\u849C\u672B\u3002" }, { num: 4, text: "\u4E0B\u897F\u5170\u82B1\u5FEB\u901F\u7FFB\u7092\uFF0C\u52A0\u869D\u6CB9\u548C\u76D0\u8C03\u5473\u51FA\u9505\u3002" }],
        tagIds: [1, 3],
        methodIds: [1],
        regionIds: []
      },
      {
        id: 6,
        title: "\u53EF\u4E50\u9E21\u7FC5",
        slug: "kele-jichi",
        description: "\u751C\u9999\u5165\u5473\uFF0C\u9E21\u7FC5\u8F6F\u70C2\u8131\u9AA8\uFF0C\u5927\u4EBA\u5C0F\u5B69\u90FD\u7231\u3002",
        difficulty: "easy",
        cookTime: 30,
        servings: 3,
        calories: 350,
        cuisineId: 6,
        ingredients: [{ name: "\u9E21\u7FC5\u4E2D", amount: "12\u4E2A" }, { name: "\u53EF\u4E50", amount: "1\u7F50(330ml)" }, { name: "\u751F\u62BD", amount: "2\u5927\u52FA" }, { name: "\u8001\u62BD", amount: "1\u5C0F\u52FA" }, { name: "\u59DC\u7247", amount: "3\u7247" }, { name: "\u6599\u9152", amount: "1\u5927\u52FA" }],
        steps: [{ num: 1, text: "\u9E21\u7FC5\u4E24\u9762\u5212\u5200\uFF0C\u51B7\u6C34\u4E0B\u9505\u52A0\u6599\u9152\u712F\u6C34\uFF0C\u635E\u51FA\u6CA5\u5E72\u3002" }, { num: 2, text: "\u9505\u4E2D\u5C11\u8BB8\u6CB9\uFF0C\u4E0B\u9E21\u7FC5\u714E\u81F3\u4E24\u9762\u91D1\u9EC4\u3002" }, { num: 3, text: "\u52A0\u5165\u59DC\u7247\u3001\u751F\u62BD\u3001\u8001\u62BD\u7FFB\u7092\u4E0A\u8272\u3002" }, { num: 4, text: "\u5012\u5165\u53EF\u4E50\u6CA1\u8FC7\u9E21\u7FC5\uFF0C\u5927\u706B\u70E7\u5F00\u540E\u8F6C\u5C0F\u706B\u709620\u5206\u949F\u3002" }, { num: 5, text: "\u5927\u706B\u6536\u6C41\u81F3\u6D53\u7A20\u6302\u6EE1\u9E21\u7FC5\u5373\u53EF\u3002" }],
        tagIds: [1, 5],
        methodIds: [1],
        regionIds: []
      },
      {
        id: 7,
        title: "\u5BAB\u4FDD\u9E21\u4E01",
        slug: "gongbao-jiding",
        description: "\u5DDD\u83DC\u540D\u54C1\uFF0C\u8354\u679D\u5473\u578B\uFF0C\u9EBB\u8FA3\u751C\u9178\u4EA4\u7EC7\uFF0C\u82B1\u751F\u9165\u8106\u3002",
        difficulty: "medium",
        cookTime: 20,
        servings: 2,
        calories: 320,
        cuisineId: 1,
        ingredients: [{ name: "\u9E21\u80F8\u8089", amount: "250g" }, { name: "\u82B1\u751F\u7C73", amount: "50g" }, { name: "\u5E72\u8FA3\u6912", amount: "8-10\u4E2A" }, { name: "\u82B1\u6912", amount: "1\u5C0F\u52FA" }, { name: "\u8471\u6BB5", amount: "2\u6839" }, { name: "\u849C\u672B", amount: "2\u74E3" }, { name: "\u751F\u62BD", amount: "2\u5927\u52FA" }, { name: "\u918B", amount: "1\u5927\u52FA" }, { name: "\u767D\u7CD6", amount: "1\u5927\u52FA" }, { name: "\u6DC0\u7C89", amount: "1\u5927\u52FA" }],
        steps: [{ num: 1, text: "\u9E21\u80F8\u8089\u5207\u4E01\uFF0C\u52A0\u751F\u62BD\u3001\u6599\u9152\u3001\u6DC0\u7C89\u814C\u523615\u5206\u949F\u3002\u82B1\u751F\u7C73\u5C0F\u706B\u7092\u719F\u5907\u7528\u3002" }, { num: 2, text: "\u8C03\u7897\u6C41\uFF1A\u751F\u62BD\u3001\u918B\u3001\u767D\u7CD6\u3001\u6DC0\u7C89\u52A02\u52FA\u6C34\u6405\u5300\u3002" }, { num: 3, text: "\u9505\u70ED\u5012\u6CB9\uFF0C\u4E0B\u9E21\u4E01\u6ED1\u6563\u81F3\u53D8\u8272\u76DB\u51FA\u3002" }, { num: 4, text: "\u7559\u5E95\u6CB9\uFF0C\u5C0F\u706B\u7178\u9999\u5E72\u8FA3\u6912\u548C\u82B1\u6912\uFF0C\u4E0B\u8471\u6BB5\u849C\u672B\u7092\u9999\u3002" }, { num: 5, text: "\u5012\u56DE\u9E21\u4E01\uFF0C\u6DCB\u7897\u6C41\u5927\u706B\u7FFB\u7092\u81F3\u6536\u6C41\uFF0C\u6700\u540E\u6492\u82B1\u751F\u7C73\u7FFB\u5300\u51FA\u9505\u3002" }],
        tagIds: [5, 6],
        methodIds: [1],
        regionIds: [1]
      },
      {
        id: 8,
        title: "\u9178\u83DC\u9C7C",
        slug: "suancai-yu",
        description: "\u9C7C\u8089\u5AE9\u6ED1\uFF0C\u9178\u83DC\u723D\u53E3\uFF0C\u6C64\u6C41\u9178\u8FA3\u5F00\u80C3\uFF0C\u8D8A\u5403\u8D8A\u4E0A\u763E\u3002",
        difficulty: "medium",
        cookTime: 30,
        servings: 3,
        calories: 280,
        cuisineId: 1,
        ingredients: [{ name: "\u8349\u9C7C", amount: "1\u6761(\u7EA6750g)" }, { name: "\u9178\u83DC", amount: "250g" }, { name: "\u6CE1\u6912", amount: "5-6\u4E2A" }, { name: "\u59DC\u7247", amount: "4\u7247" }, { name: "\u849C\u672B", amount: "4\u74E3" }, { name: "\u82B1\u6912", amount: "1\u5C0F\u52FA" }, { name: "\u86CB\u6E05", amount: "1\u4E2A" }, { name: "\u6DC0\u7C89", amount: "1\u5927\u52FA" }, { name: "\u6599\u9152", amount: "1\u5927\u52FA" }],
        steps: [{ num: 1, text: "\u8349\u9C7C\u5904\u7406\u5E72\u51C0\uFF0C\u7247\u4E0B\u9C7C\u8089\u659C\u5200\u5207\u8584\u7247\uFF0C\u9C7C\u9AA8\u5207\u6BB5\u3002" }, { num: 2, text: "\u9C7C\u7247\u52A0\u86CB\u6E05\u3001\u6599\u9152\u3001\u6DC0\u7C89\u6293\u5300\u814C\u523610\u5206\u949F\u3002" }, { num: 3, text: "\u9178\u83DC\u6D17\u51C0\u5207\u6BB5\uFF0C\u6324\u5E72\u6C34\u5206\u3002" }, { num: 4, text: "\u9505\u70ED\u5012\u6CB9\uFF0C\u4E0B\u9C7C\u9AA8\u714E\u81F3\u4E24\u9762\u91D1\u9EC4\uFF0C\u52A0\u5F00\u6C34\u5927\u706B\u716E10\u5206\u949F\u81F3\u6C64\u8272\u5976\u767D\uFF0C\u635E\u51FA\u9C7C\u9AA8\u3002" }, { num: 5, text: "\u53E6\u8D77\u9505\u7092\u9999\u9178\u83DC\u548C\u6CE1\u6912\uFF0C\u5012\u5165\u9C7C\u6C64\u716E\u6CB8\u3002" }, { num: 6, text: "\u4E0B\u9C7C\u7247\uFF0C\u8F7B\u8F7B\u62E8\u6563\uFF0C\u9C7C\u7247\u53D8\u767D\u5373\u719F\u3002\u6492\u849C\u672B\u3001\u82B1\u6912\uFF0C\u6D47\u70ED\u6CB9\u6FC0\u9999\u3002" }],
        tagIds: [2, 5],
        methodIds: [1],
        regionIds: [1]
      }
    ];
    for (const r of recipes) {
      await env.DB.prepare("INSERT OR IGNORE INTO recipes (id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(r.id, r.title, r.slug, r.description, r.difficulty, r.cookTime, r.servings, r.calories, r.cuisineId, "").run();
      for (let i = 0; i < r.ingredients.length; i++) {
        const ing = r.ingredients[i];
        await env.DB.prepare("INSERT INTO recipe_ingredients (recipe_id, name, amount, sort_order) VALUES (?, ?, ?, ?)").bind(r.id, ing.name, ing.amount, i + 1).run();
      }
      for (const s of r.steps) {
        await env.DB.prepare("INSERT INTO recipe_steps (recipe_id, step_number, text) VALUES (?, ?, ?)").bind(r.id, s.num, s.text).run();
      }
      for (const tid of r.tagIds) {
        await env.DB.prepare("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(r.id, tid).run();
      }
      for (const mid of r.methodIds) {
        await env.DB.prepare("INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)").bind(r.id, mid).run();
      }
      for (const rid of r.regionIds) {
        await env.DB.prepare("INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)").bind(r.id, rid).run();
      }
    }
    results.push("Inserted " + recipes.length + " recipes");
    const knowledge = [
      { id: 1, title: "\u5DDD\u83DC\u7684\u5473\u578B\u4F53\u7CFB", slug: "chuan-cai-wei-xing", category: "flavor", content: '<h3>\u5DDD\u83DC\u6709\u591A\u5C11\u79CD\u5473\u578B\uFF1F</h3><p>\u5DDD\u83DC\u53F7\u79F0"\u4E00\u83DC\u4E00\u683C\uFF0C\u767E\u83DC\u767E\u5473"\uFF0C\u5473\u578B\u6570\u91CF\u4E4B\u591A\u5728\u5168\u56FD\u83DC\u7CFB\u4E2D\u9996\u5C48\u4E00\u6307\u3002\u5F88\u591A\u4EBA\u4EE5\u4E3A\u5DDD\u83DC\u5C31\u662F\u8FA3\uFF0C\u5176\u5B9E\u8FA3\u53EA\u662F\u5176\u4E2D\u4E00\u79CD\u3002</p><h3>\u516D\u5927\u7ECF\u5178\u5473\u578B</h3><p><strong>\u9EBB\u8FA3\u5473\u578B</strong>\u2014\u2014\u5DDD\u83DC\u7684\u62DB\u724C\u9762\u5B54\u3002\u82B1\u6912\u8D1F\u8D23"\u9EBB"\uFF0C\u8FA3\u6912\u8D1F\u8D23"\u8FA3"\uFF0C\u4E24\u8005\u642D\u5728\u4E00\u8D77\u4EA7\u751F\u4E86\u5947\u5999\u7684\u5316\u5B66\u53CD\u5E94\u3002\u9EBB\u5A46\u8C46\u8150\u3001\u6C34\u716E\u725B\u8089\u3001\u706B\u9505\uFF0C\u90FD\u662F\u8FD9\u4E2A\u5473\u578B\u7684\u4EE3\u8868\u4F5C\u3002</p><p><strong>\u9C7C\u9999\u5473\u578B</strong>\u2014\u2014\u8DDF\u9C7C\u6CA1\u5173\u7CFB\uFF0C\u540D\u5B57\u6765\u81EA\u56DB\u5DDD\u6CE1\u8FA3\u6912\u7279\u6709\u7684"\u9C7C\u9999"\u6C14\u606F\u3002\u6CE1\u8FA3\u6912\u3001\u59DC\u3001\u849C\u3001\u7CD6\u3001\u918B\u4E00\u9505\u7092\uFF0C\u54B8\u751C\u9178\u8FA3\u4FF1\u5168\u3002\u9C7C\u9999\u8089\u4E1D\u3001\u9C7C\u9999\u8304\u5B50\uFF0C\u5403\u8D77\u6765\u5C42\u6B21\u5206\u660E\u3002</p><p><strong>\u5BAB\u4FDD\u5473\u578B</strong>\u2014\u2014\u56E0\u4E01\u5B9D\u6862\uFF08\u5C01\u5BAB\u4FDD\uFF09\u5F97\u540D\u3002\u5E72\u8FA3\u6912\u7092\u51FA\u7CCA\u9999\uFF0C\u82B1\u6912\u70B9\u5230\u4E3A\u6B62\uFF0C\u82B1\u751F\u6700\u540E\u653E\u4FDD\u6301\u9165\u8106\u3002\u597D\u7684\u5BAB\u4FDD\u9E21\u4E01\uFF0C\u8354\u679D\u5473\uFF08\u5FAE\u9178\u751C\uFF09\u662F\u7075\u9B42\u3002</p><p><strong>\u5BB6\u5E38\u5473\u578B</strong>\u2014\u2014\u8C46\u74E3\u9171\u6253\u5E95\uFF0C\u54B8\u9C9C\u5FAE\u8FA3\uFF0C\u662F\u56DB\u5DDD\u4EBA\u9910\u684C\u4E0A\u7684\u65E5\u5E38\u5473\u9053\u3002\u56DE\u9505\u8089\u5C31\u662F\u5178\u578B\u3002</p><p><strong>\u602A\u5473\u5473\u578B</strong>\u2014\u2014\u5DDD\u83DC\u72EC\u6709\u3002\u54B8\u751C\u9EBB\u8FA3\u9178\u9C9C\u9999\u4E03\u5473\u540C\u65F6\u5B58\u5728\uFF0C\u4F46\u8C01\u4E5F\u4E0D\u538B\u8C01\uFF0C\u8FD9\u5F88\u8003\u9A8C\u8C03\u5473\u529F\u5E95\u3002</p><p><strong>\u7CCA\u8FA3\u5473\u578B</strong>\u2014\u2014\u5E72\u8FA3\u6912\u5728\u9505\u91CC\u7092\u5230\u5FAE\u5FAE\u53D1\u7CCA\uFF0C\u8FA3\u5473\u53D8\u5F97\u6E29\u67D4\uFF0C\u53D6\u800C\u4EE3\u4E4B\u7684\u662F\u4E00\u80A1\u7126\u9999\u3002</p><h3>\u5473\u578B\u7684\u79D8\u5BC6</h3><p>\u5DDD\u83DC\u8C03\u5473\u4E0D\u662F\u7B80\u5355\u5730\u628A\u5404\u79CD\u8C03\u6599\u5806\u5728\u4E00\u8D77\u3002\u6BCF\u4E00\u79CD\u5473\u578B\u90FD\u6709\u4E3B\u6B21\u4E4B\u5206\uFF0C\u5C31\u50CF\u4EA4\u54CD\u4E50\uFF0C\u4E0D\u662F\u6240\u6709\u4E50\u5668\u540C\u65F6\u54CD\uFF0C\u800C\u662F\u6709\u8282\u594F\u6709\u5C42\u6B21\u3002</p>' },
      { id: 2, title: "\u7CA4\u83DC\u7684\u70F9\u996A\u54F2\u5B66", slug: "yue-cai-peng-ren-zhe-xue", category: "culture", content: '<h3>\u7CA4\u83DC\u7684\u6838\u5FC3\uFF1A\u9C9C</h3><p>\u7CA4\u83DC\u8BB2\u7A76"\u98DF\u4E0D\u538C\u7CBE"\uFF0C\u4F46\u8FD9\u4EFD"\u7CBE"\u4E0D\u662F\u82B1\u91CC\u80E1\u54E8\uFF0C\u800C\u662F\u5BF9\u98DF\u6750\u672C\u5473\u7684\u6781\u81F4\u8FFD\u6C42\u3002\u5E7F\u4E1C\u4EBA\u5E38\u8BF4"\u9E21\u6709\u9E21\u5473\uFF0C\u9C7C\u6709\u9C7C\u5473"\uFF0C\u8FD9\u53E5\u8BDD\u9053\u51FA\u4E86\u7CA4\u83DC\u7684\u7CBE\u9AD3\u3002</p><h3>\u8C03\u5473\u7684\u514B\u5236</h3><p>\u7CA4\u83DC\u53A8\u5E08\u7528\u8C03\u5473\u6599\u6781\u4E3A\u514B\u5236\u3002\u767D\u707C\u867E\u53EA\u8638\u9171\u6CB9\u548C\u82A5\u672B\uFF0C\u6E05\u84B8\u9C7C\u53EA\u6DCB\u84B8\u9C7C\u8C49\u6CB9\uFF0C\u8FDE\u59DC\u8471\u90FD\u53EA\u662F\u914D\u89D2\u3002\u8D8A\u7B80\u5355\u7684\u505A\u6CD5\uFF0C\u8D8A\u80FD\u770B\u51FA\u98DF\u6750\u7684\u54C1\u8D28\uFF0C\u4E5F\u8D8A\u80FD\u770B\u51FA\u53A8\u5E08\u7684\u624B\u827A\u3002</p><h3>\u706B\u5019\u7684\u529F\u592B</h3><p>\u7CA4\u83DC\u7684\u956C\u6C14\uFF08wok hei\uFF09\u662F\u522B\u7684\u83DC\u7CFB\u5F88\u96BE\u590D\u5236\u7684\u3002\u731B\u706B\u5FEB\u7092\uFF0C\u98DF\u6750\u5728\u9AD8\u6E29\u4E0B\u77AC\u95F4\u9501\u4F4F\u6C34\u5206\u548C\u9C9C\u5473\uFF0C\u8868\u9762\u5FAE\u7126\u800C\u5185\u91CC\u5AE9\u6ED1\u3002\u8FD9\u9700\u8981\u6781\u5F3A\u7684\u706B\u5019\u638C\u63A7\u80FD\u529B\u3002</p><h3>\u6C64\u7684\u5B66\u95EE</h3><p>\u7CA4\u83DC\u91CC\u7684\u6C64\uFF0C\u4E0D\u662F\u968F\u968F\u4FBF\u4FBF\u716E\u716E\u5C31\u884C\u3002\u8001\u706B\u9753\u6C64\u52A8\u8F84\u7172\u56DB\u4E94\u4E2A\u5C0F\u65F6\uFF0C\u8BB2\u7A76"\u7172\u4E09\u7096\u56DB"\u2014\u2014\u7172\u6C64\u4E09\u5C0F\u65F6\uFF0C\u7096\u6C64\u56DB\u5C0F\u65F6\u3002\u6BCF\u79CD\u6C64\u90FD\u6709\u7279\u5B9A\u7684\u98DF\u6750\u642D\u914D\u548C\u65F6\u4EE4\u8BB2\u7A76\u3002</p>' },
      { id: 3, title: "\u4E2D\u56FD\u516B\u5927\u83DC\u7CFB", slug: "zhong-guo-ba-da-cai-xi", category: "culture", content: '<h3>\u4EC0\u4E48\u662F\u516B\u5927\u83DC\u7CFB\uFF1F</h3><p>\u4E2D\u56FD\u83DC\u7CFB\u5212\u5206\u6709\u4E0D\u540C\u8BF4\u6CD5\uFF0C\u4F46\u6700\u5E7F\u4E3A\u4EBA\u77E5\u7684\u662F"\u516B\u5927\u83DC\u7CFB"\uFF1A\u9C81\u3001\u5DDD\u3001\u7CA4\u3001\u82CF\u3001\u95FD\u3001\u6D59\u3001\u6E58\u3001\u5FBD\u3002\u8FD9\u4E2A\u8BF4\u6CD5\u5927\u81F4\u6210\u578B\u4E8E\u6E05\u672B\u6C11\u521D\uFF0C\u4F46\u83DC\u7CFB\u672C\u8EAB\u7684\u5386\u53F2\u8981\u4E45\u8FDC\u5F97\u591A\u3002</p><h3>\u56DB\u5927\u83DC\u7CFB\uFF08\u6BCD\u83DC\u7CFB\uFF09</h3><p><strong>\u9C81\u83DC</strong>\u2014\u2014\u5317\u65B9\u83DC\u4E4B\u6BCD\u3002\u5BAB\u5EF7\u83DC\u7684\u57FA\u7840\uFF0C\u8BB2\u7A76\u5236\u6C64\u548C\u706B\u5019\u3002\u7CD6\u918B\u9CA4\u9C7C\u3001\u4E5D\u8F6C\u5927\u80A0\u3001\u8471\u70E7\u6D77\u53C2\u662F\u4EE3\u8868\u3002</p><p><strong>\u5DDD\u83DC</strong>\u2014\u2014\u5473\u578B\u6700\u4E30\u5BCC\u3002\u4E0D\u662F\u7B80\u5355\u7684\u8FA3\uFF0C\u800C\u662F\u9EBB\u8FA3\u3001\u9C7C\u9999\u3001\u5BAB\u4FDD\u3001\u5BB6\u5E38\u7B4920\u591A\u79CD\u5473\u578B\u5404\u5177\u7279\u8272\u3002</p><p><strong>\u7CA4\u83DC</strong>\u2014\u2014\u9C9C\u5B57\u5F53\u5934\u3002\u767D\u5207\u9E21\u3001\u6E05\u84B8\u9C7C\u3001\u7172\u6C64\uFF0C\u5BF9\u98DF\u6750\u672C\u5473\u7684\u8FFD\u6C42\u5230\u4E86\u6781\u81F4\u3002</p><p><strong>\u82CF\u83DC</strong>\u2014\u2014\u6DEE\u626C\u83DC\u4E3A\u4EE3\u8868\u3002\u5200\u5DE5\u7CBE\u7EC6\uFF0C\u53E3\u5473\u6E05\u9C9C\u5E73\u548C\uFF0C\u5927\u716E\u5E72\u4E1D\u3001\u677E\u9F20\u6842\u9C7C\u662F\u7ECF\u5178\u3002</p><h3>\u56DB\u5927\u5B50\u83DC\u7CFB</h3><p><strong>\u95FD\u83DC</strong>\u2014\u2014\u4EE5\u6C64\u83DC\u89C1\u957F\uFF0C\u4F5B\u8DF3\u5899\u3001\u8354\u679D\u8089\u3002</p><p><strong>\u6D59\u83DC</strong>\u2014\u2014\u9F99\u4E95\u867E\u4EC1\u3001\u897F\u6E56\u918B\u9C7C\uFF0C\u6E05\u9C9C\u4E0D\u817B\u3002</p><p><strong>\u6E58\u83DC</strong>\u2014\u2014\u5241\u6912\u9C7C\u5934\u3001\u5C0F\u7092\u8089\uFF0C\u8FA3\u5F97\u8FC7\u763E\u3002</p><p><strong>\u5FBD\u83DC</strong>\u2014\u2014\u81ED\u9CDC\u9C7C\u3001\u6BDB\u8C46\u8150\uFF0C\u91CD\u6CB9\u91CD\u8272\u91CD\u706B\u529F\u3002</p>' },
      { id: 4, title: "\u5E38\u89C1\u70F9\u996A\u6280\u6CD5", slug: "chang-jian-peng-ren-ji-fa", category: "technique", content: '<h3>\u7092</h3><p>\u4E2D\u9910\u6700\u6838\u5FC3\u7684\u70F9\u996A\u6280\u6CD5\u3002\u731B\u706B\u5FEB\u7092\uFF0C\u98DF\u6750\u5728\u9AD8\u6E29\u4E0B\u8FC5\u901F\u6210\u719F\uFF0C\u4FDD\u6301\u8106\u5AE9\u53E3\u611F\u3002\u5173\u952E\u5728\u4E8E"\u956C\u6C14"\u2014\u2014\u9505\u8981\u591F\u70ED\uFF0C\u52A8\u4F5C\u8981\u591F\u5FEB\u3002</p><h3>\u84B8</h3><p>\u6700\u80FD\u4FDD\u7559\u98DF\u6750\u539F\u5473\u7684\u505A\u6CD5\u3002\u7CA4\u83DC\u6E05\u84B8\u9C7C\u3001\u5DDD\u83DC\u7C89\u84B8\u8089\u3001\u6D59\u83DC\u84B8\u86CB\uFF0C\u5357\u5317\u5404\u6709\u7CBE\u5F69\u3002\u84B8\u7684\u5173\u952E\u662F\u706B\u5019\u548C\u65F6\u95F4\uFF0C\u8FC7\u5219\u8001\uFF0C\u4E0D\u53CA\u5219\u751F\u3002</p><h3>\u7096</h3><p>\u5C0F\u706B\u6162\u7096\u662F\u4E2D\u5F0F\u70F9\u996A\u7684\u6D6A\u6F2B\u3002\u4E1C\u5317\u4E71\u7096\u3001\u5E7F\u4E1C\u7172\u6C64\u3001\u56DB\u5DDD\u7802\u9505\uFF0C\u4E0D\u540C\u5730\u57DF\u6709\u4E0D\u540C\u7684\u7096\u6CD5\uFF0C\u4F46\u5171\u540C\u70B9\u662F\u8010\u5FC3\u3002\u597D\u6C64\u90FD\u662F\u7B49\u51FA\u6765\u7684\u3002</p><h3>\u7EA2\u70E7</h3><p>\u4E2D\u5F0F\u70F9\u996A\u7684"\u4E07\u80FD\u516C\u5F0F"\u3002\u5148\u714E\u540E\u7096\uFF0C\u51B0\u7CD6\u4E0A\u8272\uFF0C\u9171\u6CB9\u8C03\u5473\uFF0C\u5C0F\u706B\u6162\u6536\u3002\u7EA2\u70E7\u8089\u3001\u7EA2\u70E7\u9C7C\u3001\u7EA2\u70E7\u8304\u5B50\uFF0C\u4E07\u7269\u7686\u53EF\u7EA2\u70E7\u3002</p><h3>\u767D\u707C</h3><p>\u7CA4\u83DC\u72EC\u6709\u6280\u6CD5\u3002\u5F00\u6C34\u712F\u719F\uFF0C\u8638\u6599\u800C\u98DF\u3002\u770B\u4F3C\u7B80\u5355\uFF0C\u5B9E\u5219\u5BF9\u98DF\u6750\u54C1\u8D28\u548C\u706B\u5019\u628A\u63A7\u8981\u6C42\u6781\u9AD8\u3002\u767D\u707C\u867E\u3001\u767D\u707C\u83DC\u5FC3\uFF0C\u9C9C\u751C\u5168\u9760\u98DF\u6750\u672C\u8EAB\u3002</p>' },
      { id: 5, title: "\u53A8\u623F\u5FC5\u5907\u8C03\u5473\u6599", slug: "chu-fang-bi-bei-tiao-wei-liao", category: "ingredient", content: "<h3>\u9171\u6CB9\u5BB6\u65CF</h3><p><strong>\u751F\u62BD</strong>\u2014\u2014\u76D0\u5473\u4E3B\u89D2\uFF0C\u989C\u8272\u6D45\u3001\u54B8\u5473\u8DB3\u3001\u9C9C\u5473\u660E\u663E\u3002\u7092\u83DC\u8C03\u5473\u3001\u8638\u6599\u90FD\u79BB\u4E0D\u5F00\u3002</p><p><strong>\u8001\u62BD</strong>\u2014\u2014\u4E0A\u8272\u4E13\u7528\uFF0C\u54B8\u5473\u8F7B\u4F46\u989C\u8272\u6DF1\u3002\u7EA2\u70E7\u8089\u3001\u5364\u5473\u8981\u9760\u5B83\u4E0A\u8272\uFF0C\u7528\u91CF\u4E0D\u5B9C\u591A\u3002</p><p><strong>\u84B8\u9C7C\u8C49\u6CB9</strong>\u2014\u2014\u751F\u62BD\u7684\u5347\u7EA7\u7248\uFF0C\u4E13\u95E8\u914D\u84B8\u9C7C\uFF0C\u54B8\u751C\u9002\u4E2D\u6709\u8C46\u9999\u3002</p><h3>\u918B</h3><p><strong>\u9648\u918B</strong>\u2014\u2014\u5C71\u897F\u8001\u9648\u918B\uFF0C\u9178\u5473\u9187\u539A\uFF0C\u9002\u5408\u62CC\u51C9\u83DC\u548C\u505A\u7CD6\u918B\u83DC\u3002</p><p><strong>\u7C73\u918B</strong>\u2014\u2014\u9178\u5473\u6E29\u548C\uFF0C\u7092\u83DC\u3001\u8638\u997A\u5B50\u90FD\u4E0D\u9519\u3002</p><p><strong>\u9999\u918B</strong>\u2014\u2014\u9547\u6C5F\u9999\u918B\uFF0C\u9178\u4E2D\u5E26\u751C\uFF0C\u8638\u87F9\u3001\u62CC\u83DC\u6700\u4F73\u3002</p><h3>\u9171\u6599</h3><p><strong>\u90EB\u53BF\u8C46\u74E3\u9171</strong>\u2014\u2014\u5DDD\u83DC\u7075\u9B42\u3002\u505A\u9EBB\u5A46\u8C46\u8150\u3001\u56DE\u9505\u8089\u6CA1\u5B83\u4E0D\u884C\uFF0C\u8981\u5148\u7092\u51FA\u7EA2\u6CB9\u3002</p><p><strong>\u751C\u9762\u9171</strong>\u2014\u2014\u5317\u4EAC\u70E4\u9E2D\u7684\u6807\u914D\uFF0C\u4EAC\u9171\u8089\u4E1D\u4E5F\u9760\u5B83\u3002</p><p><strong>\u869D\u6CB9</strong>\u2014\u2014\u7CA4\u83DC\u63D0\u9C9C\u795E\u5668\uFF0C\u7092\u83DC\u6536\u5C3E\u52A0\u4E00\u70B9\uFF0C\u9C9C\u5473\u7ACB\u5347\u3002</p>" }
    ];
    for (const k of knowledge) {
      await env.DB.prepare("INSERT OR IGNORE INTO knowledge_entries (id, title, slug, category, content) VALUES (?, ?, ?, ?, ?)").bind(k.id, k.title, k.slug, k.category, k.content).run();
    }
    results.push("Inserted " + knowledge.length + " knowledge entries");
    const secrets = [
      { id: 6, title: "\u6F6E\u6C55\u5364\u6C34\u7ECF\u5178\u914D\u65B9", slug: "chaoshan-luoshui", category: "secret", content: '<h3>\u6838\u5FC3\u914D\u65B9</h3><p>\u6F6E\u6C55\u5364\u6C34\u4EE5\u5176"\u9C9C\u4E2D\u5E26\u751C\u3001\u6CB9\u800C\u4E0D\u817B"\u7684\u72EC\u7279\u98CE\u5473\u95FB\u540D\uFF0C\u5176\u6838\u5FC3\u5728\u4E8E"\u8001\u5364"\u7684\u4F20\u627F\u4E0E\u8FD0\u7528\u3002\u4EE5\u4E0B\u914D\u65B9\u57FA\u4E8E\u591A\u6E90\u4EA4\u53C9\u9A8C\u8BC1\uFF0C\u4EE510\u65A4\u5364\u6C41\u4E3A\u57FA\u51C6\uFF1A</p><h4>\u9999\u6599\u914D\u6BD4</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF\uFF08\u514B\uFF09</th><th>\u4E3B\u8981\u4F5C\u7528</th></tr><tr><td>\u516B\u89D2</td><td>20-30</td><td>\u63D0\u4F9B\u6D53\u90C1\u7684\u8334\u9999\u6C14</td></tr><tr><td>\u6842\u76AE</td><td>15-25</td><td>\u589E\u52A0\u5364\u6C41\u7684\u9187\u539A\u611F</td></tr><tr><td>\u5E72\u5357\u59DC</td><td>75</td><td>\u6F6E\u6C55\u5364\u7684\u7075\u9B42\uFF0C\u53BB\u8165\u63D0\u9C9C</td></tr><tr><td>\u5C0F\u8334\u9999</td><td>10-20</td><td>\u589E\u6DFB\u6E05\u65B0\u7684\u9999\u6C14</td></tr><tr><td>\u8349\u679C</td><td>5-20</td><td>\u53BB\u9664\u98DF\u6750\u7684\u8165\u81BB\u5473</td></tr><tr><td>\u9648\u76AE</td><td>20-40</td><td>\u89E3\u817B\u589E\u9999\uFF0C\u5E26\u6765\u56DE\u7518</td></tr><tr><td>\u4E01\u9999</td><td>3-5</td><td>\u63D0\u5347\u9999\u6C14\u7684\u7A7F\u900F\u529B\uFF08\u5B81\u5C11\u52FF\u591A\uFF09</td></tr><tr><td>\u9999\u53F6</td><td>5-10</td><td>\u589E\u9999</td></tr><tr><td>\u767D\u853B</td><td>8-15</td><td>\u89E3\u817B\u589E\u9999</td></tr><tr><td>\u7518\u8349</td><td>10-30</td><td>\u8C03\u548C\u8BF8\u5473\uFF0C\u7F13\u89E3\u523A\u6FC0\u6027</td></tr></table><h4>\u8C03\u5473\u914D\u6BD4</h4><p>\u751F\u62BD\uFF1A1.5-2\u65A4 | \u8001\u62BD\uFF1A300-500ml | \u51B0\u7CD6\uFF1A0.8-1.5\u65A4 | \u6599\u9152\uFF1A0.5-1\u65A4 | \u9C7C\u9732\uFF1A200-500ml</p><h3>\u5173\u952E\u6B65\u9AA4</h3><p><strong>1. \u9AD8\u6C64\u5E95\u5236\u4F5C\uFF1A</strong>\u8001\u6BCD\u9E211\u53EA\u3001\u732A\u7B52\u9AA85kg\u3001\u732A\u76AE2kg\uFF0C\u712F\u6C34\u540E\u5C0F\u706B\u6162\u71AC8-12\u5C0F\u65F6\uFF0C\u81F3\u6C64\u8272\u4E73\u767D\u3002</p><p><strong>2. \u9999\u6599\u5904\u7406\uFF1A</strong>\u516B\u89D2\u3001\u6842\u76AE\u3001\u9999\u53F6\u7B49\u9700\u7092\u5236\u6FC0\u53D1\u9999\u5473\uFF1B\u7518\u8349\u3001\u4E01\u9999\u7B49\u4E0D\u5B9C\u7092\u5236\uFF0C\u76F4\u63A5\u4F7F\u7528\u4EE5\u4FDD\u7559\u6E05\u751C\u3002\u9999\u6599\u9700\u7528\u7EB1\u5E03\u888B\u5206\u88C5\u3002</p><p><strong>3. \u9E45\u6CB9\u5C01\u9876\u5DE5\u827A\uFF1A</strong>\u9E45\u6CB9\u4E0E\u5357\u59DC\u3001\u849C\u5934\u3001\u8471\u6BB5\u70B8\u9999\u540E\u5012\u5165\u5364\u6C64\uFF0C\u5F62\u6210\u6CB9\u819C\u9694\u7EDD\u7A7A\u6C14\uFF0C\u9501\u4F4F\u9999\u6C14\u3002\u8FD9\u662F\u6F6E\u6C55\u5364\u6C34\u7684\u6838\u5FC3\u6280\u672F\u3002</p><p><strong>4. \u7CD6\u8272\u8C03\u5236\uFF1A</strong>\u51B0\u7CD6\u7092\u81F3\u67A3\u7EA2\u8272\uFF0C\u4E0E\u9AD8\u6C64\u6DF7\u5408\u540E\u52A0\u5165\u9999\u6599\u5305\uFF0C\u5C0F\u706B\u6162\u71722\u5C0F\u65F6\u3002</p><h3>\u6838\u5FC3\u6280\u5DE7</h3><p>\u2022 <strong>\u4E09\u6D78\u4E09\u540A\u5DE5\u827A\uFF1A</strong>\u5173\u706B\u540E\u6D78\u6CE11\u5C0F\u65F6\u2192\u590D\u70ED\u5FAE\u6CB8\u6D7830\u5206\u949F\u2192\u6DCB\u5364\u6C41\u8865\u5473\uFF0C\u63D0\u5347\u5165\u5473\u5C42\u6B21\u3002</p><p>\u2022 <strong>\u8001\u5364\u517B\u62A4\uFF1A</strong>\u6BCF\u65E5\u8FC7\u6EE4\u6B8B\u6E23\u3001\u716E\u6CB8\u540E\u51B7\u85CF\uFF1B\u6BCF3\u4E2A\u6708\u8865\u5145\u65B0\u9999\u6599\u3002</p>' },
      { id: 7, title: "\u5DDD\u5473\u7EA2\u70E7\u6C34\u914D\u65B9", slug: "chuanwei-honglushui", category: "secret", content: '<h3>\u914D\u65B9\u6982\u8981</h3><p>\u5DDD\u5473\u7EA2\u70E7\u6C34\u662F\u5DDD\u83DC\u53A8\u623F\u7684\u4E07\u80FD\u5E95\u6599\uFF0C\u638C\u63E1\u5B83\u5C31\u80FD\u505A\u51FA\u7EA2\u70E7\u8089\u3001\u7EA2\u70E7\u9C7C\u3001\u7EA2\u70E7\u8C46\u8150\u7B49\u4E00\u7CFB\u5217\u7ECF\u5178\u5DDD\u5473\u7EA2\u70E7\u83DC\u3002\u4EE5\u4E0B\u4E3A2\u5347\u7EA2\u70E7\u6C34\u914D\u65B9\uFF1A</p><h4>\u9999\u6599\u5305</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF</th><th>\u4F5C\u7528</th></tr><tr><td>\u516B\u89D2</td><td>3-4\u4E2A</td><td>\u4E3B\u9999</td></tr><tr><td>\u6842\u76AE</td><td>1\u5C0F\u6BB5(5g)</td><td>\u589E\u539A</td></tr><tr><td>\u8349\u679C</td><td>1\u4E2A(\u62CD\u7834)</td><td>\u53BB\u8165</td></tr><tr><td>\u5C71\u5948</td><td>3-4\u7247</td><td>\u589E\u9999</td></tr><tr><td>\u5C0F\u8334\u9999</td><td>5g</td><td>\u6E05\u751C</td></tr><tr><td>\u9999\u53F6</td><td>3-4\u7247</td><td>\u8C03\u548C</td></tr></table><h4>\u8C03\u5473\u914D\u6BD4</h4><p>\u90EB\u53BF\u8C46\u74E3\u917150g\uFF08\u7092\u51FA\u7EA2\u6CB9\uFF09| \u51B0\u7CD630g\uFF08\u7092\u7CD6\u8272\uFF09| \u751F\u62BD3\u5927\u52FA | \u8001\u62BD1\u5927\u52FA | \u6599\u91522\u5927\u52FA | \u59DC\u72475\u7247 | \u8471\u6BB53\u6839</p><h3>\u5173\u952E\u6B65\u9AA4</h3><p>1. \u5148\u7092\u7CD6\u8272\uFF0C\u51B0\u7CD6\u5C0F\u706B\u7092\u81F3\u67A3\u7EA2\u8272\u8D77\u5927\u6CE1\u3002</p><p>2. \u4E0B\u8C46\u74E3\u9171\u7092\u51FA\u7EA2\u6CB9\u548C\u9999\u6C14\u3002</p><p>3. \u52A0\u5165\u5F00\u6C34\uFF08\u4E0D\u662F\u51B7\u6C34\uFF09\u70E7\u5F00\u3002</p><p>4. \u653E\u5165\u9999\u6599\u5305\u3001\u59DC\u7247\u3001\u8471\u6BB5\uFF0C\u5C0F\u706B\u71AC20\u5206\u949F\u8BA9\u9999\u5473\u878D\u5408\u3002</p>' },
      { id: 8, title: "\u5364\u725B\u8089\u8FDB\u9762\u6761\u79D8\u8BC0", slug: "luniurou-jinmantiao", category: "secret", content: '<h3>\u6838\u5FC3\u8981\u70B9</h3><p>\u5364\u725B\u8089\u914D\u9762\u6761\uFF0C\u5173\u952E\u4E0D\u5728\u4E8E\u5364\u591A\u957F\u65F6\u95F4\uFF0C\u800C\u5728\u4E8E\u6D78\u6CE1\u5165\u5473\u7684\u6280\u5DE7\u3002</p><h3>\u725B\u8089\u5364\u5236\u914D\u65B9\uFF081kg\u725B\u8171\u5B50\uFF09</h3><table border="1" cellpadding="5"><tr><th>\u8C03\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u751F\u62BD</td><td>100ml</td></tr><tr><td>\u8001\u62BD</td><td>30ml</td></tr><tr><td>\u6599\u9152</td><td>50ml</td></tr><tr><td>\u51B0\u7CD6</td><td>20g</td></tr><tr><td>\u516B\u89D2</td><td>2\u4E2A</td></tr><tr><td>\u6842\u76AE</td><td>1\u5C0F\u6BB5</td></tr><tr><td>\u9999\u53F6</td><td>3\u7247</td></tr><tr><td>\u82B1\u6912</td><td>10\u7C92</td></tr></table><h3>\u9762\u6761\u5165\u5473\u6280\u5DE7</h3><p>1. \u5364\u597D\u7684\u725B\u8089\u5173\u706B\u540E\u4E0D\u8981\u53D6\u51FA\uFF0C\u8BA9\u5B83\u5728\u5364\u6C41\u4E2D\u6D78\u6CE1\u81F3\u5C114\u5C0F\u65F6\u3002</p><p>2. \u716E\u597D\u7684\u9762\u6761\u76F4\u63A5\u635E\u5165\u70ED\u5364\u6C64\u4E2D\u6D78\u6CE130\u79D2\uFF0C\u8BA9\u9762\u6761\u5438\u9971\u5364\u9999\u3002</p><p>3. \u5207\u725B\u8089\u8981\u9006\u7EB9\u5207\u8584\u7247\uFF0C\u53E3\u611F\u66F4\u5AE9\u3002</p>' },
      { id: 9, title: "\u5546\u7528\u8FA3\u5364\u516B\u5B9D\u914D\u65B9", slug: "shangyong-lalubabo", category: "secret", content: '<h3>\u8FA3\u5364\u6C64\u5E95\u914D\u65B9\uFF0810\u65A4\u5364\u6C41\uFF09</h3><p>\u5546\u7528\u8FA3\u5364\u7684\u6838\u5FC3\u662F"\u8FA3\u800C\u4E0D\u71E5\uFF0C\u9999\u800C\u4E0D\u817B"\u3002</p><h4>\u9999\u6599\u5305</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF\uFF08\u514B\uFF09</th></tr><tr><td>\u516B\u89D2</td><td>15</td></tr><tr><td>\u6842\u76AE</td><td>10</td></tr><tr><td>\u8349\u679C</td><td>8</td></tr><tr><td>\u5C71\u5948</td><td>6</td></tr><tr><td>\u767D\u82B7</td><td>5</td></tr><tr><td>\u4E01\u9999</td><td>2</td></tr><tr><td>\u5C0F\u8334\u9999</td><td>10</td></tr><tr><td>\u9999\u53F6</td><td>5</td></tr></table><h4>\u8FA3\u6599\u914D\u6BD4</h4><p>\u5E72\u8FA3\u6912\u6BB5200g | \u82B1\u691250g | \u90EB\u53BF\u8C46\u74E3\u9171100g | \u706B\u9505\u5E95\u659980g</p><h3>\u5173\u952E\u6280\u5DE7</h3><p>1. \u9999\u6599\u5148\u7528\u6E29\u6C34\u6CE120\u5206\u949F\u53BB\u9664\u82E6\u5473\u3002</p><p>2. \u5E72\u8FA3\u6912\u548C\u82B1\u6912\u5148\u7528\u6CB9\u7092\u9999\u518D\u5165\u5364\u6C64\u3002</p><p>3. \u8C46\u74E3\u9171\u5FC5\u987B\u7092\u51FA\u7EA2\u6CB9\u624D\u80FD\u5165\u9505\u3002</p>' },
      { id: 10, title: "\u91CD\u5E86\u5C0F\u9762\u8C03\u6599\u914D\u65B9", slug: "chongqing-xiaomian-tiaoliao", category: "secret", content: '<h3>\u4E00\u7897\u6B63\u5B97\u91CD\u5E86\u5C0F\u9762\u7684\u8C03\u6599</h3><p>\u91CD\u5E86\u5C0F\u9762\u7684\u7075\u9B42\u4E0D\u5728\u9762\u6761\uFF0C\u5728\u90A3\u4E00\u7897\u8C03\u6599\u3002</p><h4>\u5E95\u6599\u914D\u65B9</h4><table border="1" cellpadding="5"><tr><th>\u8C03\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u6CB9\u8FA3\u5B50</td><td>2\u5927\u52FA</td></tr><tr><td>\u82B1\u6912\u9762</td><td>1\u5C0F\u52FA</td></tr><tr><td>\u9171\u6CB9</td><td>1.5\u5927\u52FA</td></tr><tr><td>\u918B</td><td>\u534A\u5C0F\u52FA</td></tr><tr><td>\u849C\u6C34</td><td>1\u5927\u52FA</td></tr><tr><td>\u59DC\u6C34</td><td>1\u5C0F\u52FA</td></tr><tr><td>\u829D\u9EBB\u9171</td><td>\u534A\u5C0F\u52FA</td></tr><tr><td>\u82B1\u751F\u788E</td><td>1\u5C0F\u52FA</td></tr><tr><td>\u69A8\u83DC\u7C92</td><td>1\u5927\u52FA</td></tr><tr><td>\u8471\u82B1</td><td>\u9002\u91CF</td></tr><tr><td>\u82BD\u83DC</td><td>1\u5C0F\u52FA</td></tr><tr><td>\u732A\u6CB9</td><td>1\u5C0F\u52FA</td></tr></table><h3>\u6CB9\u8FA3\u5B50\u505A\u6CD5</h3><p>1. \u4E8C\u8346\u6761\u5E72\u8FA3\u6912\u3001\u5B50\u5F39\u5934\u5E72\u8FA3\u69121:1\u6DF7\u5408\uFF0C\u5C0F\u706B\u7092\u8106\u540E\u78BE\u6210\u7C97\u788E\u3002</p><p>2. \u83DC\u7C7D\u6CB9\u70E7\u81F3\u4E03\u6210\u70ED\uFF0C\u5206\u4E09\u6B21\u6D47\u6CB9\u662F\u5173\u952E\u3002</p>' },
      { id: 11, title: "\u6B66\u6C49\u70ED\u5E72\u9762\u829D\u9EBB\u9171\u914D\u65B9", slug: "wuhan-reganmian-zhimajiang", category: "secret", content: '<h3>\u829D\u9EBB\u9171\u7684\u8C03\u6CD5</h3><p>\u6B66\u6C49\u70ED\u5E72\u9762\u7684\u7075\u9B42\u662F\u829D\u9EBB\u9171\uFF0C\u9700\u8981"\u6FA5"\u5F00\uFF1A</p><h4>\u6807\u51C6\u8C03\u914D\u6CD5</h4><table border="1" cellpadding="5"><tr><th>\u539F\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u7EAF\u829D\u9EBB\u9171</td><td>200g</td></tr><tr><td>\u9999\u6CB9</td><td>30ml</td></tr><tr><td>\u6E29\u5F00\u6C34</td><td>\u9002\u91CF</td></tr><tr><td>\u751F\u62BD</td><td>1\u5927\u52FA</td></tr><tr><td>\u76D0</td><td>2g</td></tr></table><h3>\u6FA5\u9171\u6280\u5DE7</h3><p>1. \u5148\u52A0\u9999\u6CB9\u6405\u62CC\uFF0C\u8BA9\u829D\u9EBB\u9171"\u5316\u5F00"\u3002</p><p>2. \u518D\u5206\u6B21\u52A0\u6E29\u6C34\uFF0C\u671D\u4E00\u4E2A\u65B9\u5411\u6405\u2014\u2014\u8FD9\u662F\u5173\u952E\u3002</p><p>3. \u6405\u5230\u829D\u9EBB\u9171\u80FD\u6302\u4F4F\u7B77\u5B50\u7F13\u7F13\u6D41\u4E0B\u7684\u72B6\u6001\u5C31\u5BF9\u4E86\u3002</p>' },
      { id: 12, title: "\u67F3\u5DDE\u87BA\u86F3\u7C89\u6C64\u5E95\u914D\u65B9", slug: "liuzhou-luosifen-tangdi", category: "secret", content: '<h3>\u87BA\u86F3\u6C64\u5E95\u914D\u65B9</h3><p>\u67F3\u5DDE\u87BA\u86F3\u7C89\u7684\u7075\u9B42\u5728\u90A3\u7897"\u81ED"\u5F97\u8FF7\u4EBA\u7684\u9178\u7B0B\u87BA\u86F3\u6C64\u3002</p><h4>\u4E3B\u6599</h4><table border="1" cellpadding="5"><tr><th>\u539F\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u77F3\u87BA</td><td>2\u65A4</td></tr><tr><td>\u732A\u7B52\u9AA8</td><td>1\u65A4</td></tr><tr><td>\u9E21\u67B6</td><td>1\u4E2A</td></tr><tr><td>\u9178\u7B0B</td><td>200g</td></tr></table><h4>\u9999\u6599\u5305</h4><p>\u516B\u89D23\u4E2A | \u6842\u76AE1\u5C0F\u6BB5 | \u8349\u679C1\u4E2A | \u6C99\u59DC5\u7247 | \u4E01\u99992\u7C92 | \u5C0F\u8334\u999910g | \u9999\u53F63\u7247</p><h3>\u71AC\u5236\u6B65\u9AA4</h3><p>1. \u77F3\u87BA\u517B2\u5929\u5410\u6C99\uFF0C\u526A\u5C3E\u6D17\u51C0\uFF0C\u7206\u7092\u81F3\u76D6\u6253\u5F00\u3002</p><p>2. \u732A\u7B52\u9AA8\u3001\u9E21\u67B6\u712F\u6C34\u540E\u5C0F\u706B\u71AC2\u5C0F\u65F6\u3002</p><p>3. \u7092\u597D\u7684\u87BA\u86F3\u52A0\u5165\u9AA8\u6C64\uFF0C\u653E\u9178\u7B0B\u548C\u9999\u6599\u5305\uFF0C\u7EE7\u7EED\u5C0F\u706B\u71722\u5C0F\u65F6\u3002</p>' },
      { id: 13, title: "\u8001\u575B\u9178\u83DC\u963F\u51B2\u914D\u65B9", slug: "laotan-suancai-achong", category: "secret", content: '<h3>\u8001\u575B\u9178\u83DC\u53D1\u9175\u8981\u70B9</h3><p>\u6B63\u5B97\u8001\u575B\u9178\u83DC\u7684\u5173\u952E\u5728\u4E8E\u4E73\u9178\u83CC\u7684\u81EA\u7136\u53D1\u9175\u3002</p><h4>\u814C\u6599\u914D\u6BD4\uFF085kg\u82A5\u83DC\uFF09</h4><table border="1" cellpadding="5"><tr><th>\u539F\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u7C97\u76D0</td><td>250g</td></tr><tr><td>\u767D\u9152</td><td>50ml</td></tr><tr><td>\u51B0\u7CD6</td><td>30g</td></tr><tr><td>\u82B1\u6912</td><td>10g</td></tr><tr><td>\u8001\u59DC</td><td>50g</td></tr><tr><td>\u51C9\u5F00\u6C34</td><td>\u9002\u91CF</td></tr></table><h3>\u64CD\u4F5C\u6B65\u9AA4</h3><p>1. \u82A5\u83DC\u6652\u852B\uFF08\u7EA61\u5929\uFF09\uFF0C\u6D17\u51C0\u667E\u5E72\u6C34\u5206\u3002</p><p>2. \u575B\u5B50\u6D17\u51C0\u667E\u5E72\uFF0C\u7528\u767D\u9152\u5185\u58C1\u6D88\u6BD2\u3002</p><p>3. \u82A5\u83DC\u4E00\u5C42\u5C42\u7801\u5165\u575B\u4E2D\uFF0C\u6BCF\u5C42\u6492\u76D0\u3002</p><p>4. \u575B\u6CBF\u52A0\u6C34\u5BC6\u5C01\uFF0C7-10\u5929\u5373\u53EF\u3002</p>' },
      { id: 14, title: "\u814A\u8089\u814C\u5236\u914D\u65B9", slug: "larou-yanzhi", category: "secret", content: '<h3>\u4F20\u7EDF\u814A\u8089\u814C\u5236\u6CD5</h3><p>\u814A\u8089\u7684"\u814A"\u4E0D\u5728\u4E8E\u814A\u6708\uFF0C\u800C\u5728\u4E8E\u98CE\u5E72\u548C\u70DF\u718F\u3002</p><h4>\u814C\u5236\u914D\u6BD4\uFF085kg\u4E94\u82B1\u8089\uFF09</h4><table border="1" cellpadding="5"><tr><th>\u8C03\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u7C97\u76D0</td><td>150g</td></tr><tr><td>\u82B1\u6912</td><td>20g</td></tr><tr><td>\u767D\u9152</td><td>50ml</td></tr><tr><td>\u516B\u89D2</td><td>5\u4E2A</td></tr><tr><td>\u6842\u76AE</td><td>2\u5C0F\u6BB5</td></tr></table><h3>\u6B65\u9AA4</h3><p>1. \u82B1\u6912\u548C\u76D0\u4E00\u8D77\u5C0F\u706B\u7092\u81F3\u5FAE\u9EC4\u51FA\u9999\uFF0C\u667E\u51C9\u3002</p><p>2. \u4E94\u82B1\u8089\u4E0D\u6D17\uFF0C\u7528\u767D\u9152\u62B9\u4E00\u904D\u6D88\u6BD2\u3002</p><p>3. \u7092\u597D\u7684\u6912\u76D0\u5747\u5300\u6D82\u62B9\u5728\u8089\u4E0A\uFF0C\u653E\u5165\u5BB9\u5668\u4E2D\uFF0C\u91CD\u7269\u538B\u4F4F\u3002</p><p>4. \u814C\u52367\u5929\uFF0C\u6BCF\u5929\u7FFB\u9762\u4E00\u6B21\u3002</p><p>5. \u53D6\u51FA\u6302\u5728\u901A\u98CE\u5904\u667E\u66527-10\u5929\uFF0C\u81F3\u8089\u8868\u9762\u5E72\u786C\u51FA\u6CB9\u3002</p>' },
      { id: 15, title: "\u5317\u65B9\u4E94\u9999\u9171\u5364\u914D\u65B9", slug: "beifang-wuxiang-jianglu", category: "secret", content: '<h3>\u4E94\u9999\u9171\u5364\u57FA\u7840\u914D\u65B9</h3><p>\u5317\u65B9\u9171\u5364\u4EE5\u9171\u9999\u6D53\u90C1\u3001\u54B8\u751C\u9002\u4E2D\u4E3A\u7279\u8272\u3002</p><h4>\u9999\u6599\u5305\uFF0810\u65A4\u5364\u6C41\uFF09</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u516B\u89D2</td><td>20g</td></tr><tr><td>\u6842\u76AE</td><td>15g</td></tr><tr><td>\u82B1\u6912</td><td>10g</td></tr><tr><td>\u5C0F\u8334\u9999</td><td>10g</td></tr><tr><td>\u4E01\u9999</td><td>3g</td></tr><tr><td>\u7802\u4EC1</td><td>5g</td></tr><tr><td>\u8349\u679C</td><td>8g</td></tr><tr><td>\u767D\u82B7</td><td>5g</td></tr></table><h4>\u9171\u6599</h4><p>\u751C\u9762\u9171100g | \u9EC4\u917150g | \u751F\u62BD100ml | \u8001\u62BD30ml | \u51B0\u7CD650g</p><h3>\u5173\u952E\u6280\u5DE7</h3><p>1. \u751C\u9762\u9171\u548C\u9EC4\u9171\u5148\u7528\u6CB9\u7092\u9999\u518D\u5165\u6C64\u3002</p><p>2. \u8001\u6C64\u8D8A\u7528\u8D8A\u9999\uFF0C\u6BCF\u6B21\u7528\u5B8C\u8FC7\u6EE4\u51B7\u85CF\u3002</p>' },
      { id: 16, title: "\u8862\u5DDE\u9E2D\u5934\u79D8\u65B9", slug: "quzhou-duck-head-secret", category: "secret", content: '<h3>\u8862\u5DDE\u9E2D\u5934\u5364\u5236\u914D\u65B9</h3><p>\u8862\u5DDE\u9E2D\u5934\u4EE5"\u8FA3\u3001\u9C9C\u3001\u9999"\u4E09\u5B57\u8457\u79F0\uFF0C\u5173\u952E\u5728\u4E8E\u5148\u5364\u540E\u70E4\u7684\u5DE5\u827A\u3002</p><h4>\u5364\u6599\u914D\u6BD4\uFF0850\u4E2A\u9E2D\u5934\uFF09</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u516B\u89D2</td><td>15g</td></tr><tr><td>\u6842\u76AE</td><td>10g</td></tr><tr><td>\u5E72\u8FA3\u6912</td><td>100g</td></tr><tr><td>\u82B1\u6912</td><td>30g</td></tr><tr><td>\u8349\u679C</td><td>5g</td></tr><tr><td>\u5C71\u5948</td><td>5g</td></tr></table><h3>\u5173\u952E\u6B65\u9AA4</h3><p>1. \u9E2D\u5934\u5904\u7406\u5E72\u51C0\uFF0C\u712F\u6C34\u53BB\u8165\u3002</p><p>2. \u5165\u5364\u6C64\u5C0F\u706B\u536420\u5206\u949F\uFF0C\u5173\u706B\u6D78\u6CE130\u5206\u949F\u3002</p><p>3. \u635E\u51FA\u6CA5\u5E72\uFF0C\u8868\u9762\u5237\u8584\u6CB9\uFF0C\u5165\u70E4\u7BB1200\xB0C\u70E45-8\u5206\u949F\u3002</p>' },
      { id: 17, title: "\u732A\u5934\u8089\u79D8\u5236\u914D\u65B9", slug: "pig-head-meat-secret", category: "secret", content: '<h3>\u732A\u5934\u8089\u5364\u5236\u914D\u65B9</h3><p>\u732A\u5934\u8089\u8BB2\u7A76"\u76AE\u7CEF\u8089\u70C2\u3001\u80A5\u800C\u4E0D\u817B"\u3002</p><h4>\u5364\u6599\u914D\u6BD4\uFF081\u4E2A\u732A\u5934\uFF09</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u516B\u89D2</td><td>20g</td></tr><tr><td>\u6842\u76AE</td><td>15g</td></tr><tr><td>\u9999\u53F6</td><td>8g</td></tr><tr><td>\u82B1\u6912</td><td>15g</td></tr><tr><td>\u8349\u679C</td><td>8g</td></tr><tr><td>\u767D\u82B7</td><td>5g</td></tr></table><h4>\u8C03\u5473</h4><p>\u751F\u62BD300ml | \u8001\u62BD80ml | \u51B0\u7CD6100g | \u6599\u9152200ml | \u751C\u9762\u917150g</p><h3>\u8981\u70B9</h3><p>1. \u732A\u5934\u9700\u5148\u706B\u71CE\u53BB\u6BDB\uFF0C\u522E\u6D17\u5E72\u51C0\u3002</p><p>2. \u5288\u5F00\u540E\u712F\u6C34\uFF0C\u5927\u706B\u716E10\u5206\u949F\u635E\u51FA\u518D\u6D17\u4E00\u904D\u3002</p><p>3. \u5364\u52362-3\u5C0F\u65F6\u81F3\u7B77\u5B50\u80FD\u8F7B\u677E\u63D2\u5165\u3002</p>' },
      { id: 18, title: "\u7F8A\u8E44\u79D8\u5236\u914D\u65B9", slug: "lamb-trotter-secret", category: "secret", content: '<h3>\u7EA2\u70E7\u7F8A\u8E44\u914D\u65B9</h3><p>\u7F8A\u8E44\u8981\u505A\u5F97\u597D\uFF0C\u5173\u952E\u5728\u53BB\u81BB\u548C\u7096\u70C2\u3002</p><h4>\u53BB\u81BB\u9884\u5904\u7406</h4><p>1. \u7F8A\u8E44\u706B\u71CE\u53BB\u6BDB\uFF0C\u522E\u6D17\u5E72\u51C0\u3002</p><p>2. \u51B7\u6C34\u52A0\u6599\u9152\u3001\u59DC\u7247\u712F\u6C34\uFF0C\u6487\u53BB\u6D6E\u6CAB\u540E\u635E\u51FA\u3002</p><h4>\u7EA2\u70E7\u8C03\u6599</h4><table border="1" cellpadding="5"><tr><th>\u8C03\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u751F\u62BD</td><td>3\u5927\u52FA</td></tr><tr><td>\u8001\u62BD</td><td>1\u5927\u52FA</td></tr><tr><td>\u6599\u9152</td><td>2\u5927\u52FA</td></tr><tr><td>\u51B0\u7CD6</td><td>30g</td></tr><tr><td>\u8C46\u74E3\u9171</td><td>1\u5927\u52FA</td></tr><tr><td>\u5E72\u8FA3\u6912</td><td>5-8\u4E2A</td></tr><tr><td>\u82B1\u6912</td><td>15\u7C92</td></tr></table><h3>\u8981\u70B9</h3><p>1. \u5C0F\u706B\u70962-3\u5C0F\u65F6\u81F3\u9AA8\u8089\u5206\u79BB\u3002</p><p>2. \u6700\u540E\u5927\u706B\u6536\u6C41\u81F3\u6D53\u7A20\u3002</p>' },
      { id: 19, title: "\u5154\u5934\u79D8\u5236\u914D\u65B9", slug: "rabbit-head-secret", category: "secret", content: '<h3>\u53CC\u6D41\u5154\u5934\u5364\u5236\u914D\u65B9</h3><p>\u56DB\u5DDD\u53CC\u6D41\u5154\u5934\u662F\u5BB5\u591C\u4E4B\u738B\uFF0C\u9EBB\u8FA3\u9C9C\u9999\uFF0C\u5543\u7740\u8FC7\u763E\u3002</p><h4>\u5364\u6599\u914D\u6BD4\uFF0820\u4E2A\u5154\u5934\uFF09</h4><table border="1" cellpadding="5"><tr><th>\u9999\u6599</th><th>\u7528\u91CF</th></tr><tr><td>\u516B\u89D2</td><td>10g</td></tr><tr><td>\u6842\u76AE</td><td>8g</td></tr><tr><td>\u8349\u679C</td><td>5g</td></tr><tr><td>\u5E72\u8FA3\u6912</td><td>80g</td></tr><tr><td>\u82B1\u6912</td><td>40g</td></tr><tr><td>\u5C0F\u8334\u9999</td><td>8g</td></tr><tr><td>\u5C71\u5948</td><td>5g</td></tr></table><h4>\u8C03\u5473</h4><p>\u90EB\u53BF\u8C46\u74E3\u917150g | \u751F\u62BD100ml | \u51B0\u7CD640g | \u6599\u915250ml</p><h3>\u5173\u952E\u6B65\u9AA4</h3><p>1. \u5154\u5934\u5904\u7406\u5E72\u51C0\uFF0C\u53BB\u6DCB\u5DF4\uFF0C\u712F\u6C34\u53BB\u8165\u3002</p><p>2. \u8C46\u74E3\u9171\u7092\u51FA\u7EA2\u6CB9\u540E\u52A0\u5165\u5364\u6C64\u3002</p><p>3. \u5364\u523630\u5206\u949F\uFF0C\u5173\u706B\u6D78\u6CE11\u5C0F\u65F6\u8BA9\u5176\u5165\u5473\u3002</p><p>4. \u98DF\u7528\u65F6\u5BF9\u534A\u5288\u5F00\uFF0C\u6492\u5E72\u8FA3\u6912\u9762\u548C\u82B1\u6912\u9762\u3002</p>' }
    ];
    for (const s of secrets) {
      await env.DB.prepare("INSERT OR IGNORE INTO knowledge_entries (id, title, slug, category, content) VALUES (?, ?, ?, ?, ?)").bind(s.id, s.title, s.slug, s.category, s.content).run();
    }
    results.push("Inserted " + secrets.length + " secrets");
    return jsonResponse2({ success: true, data: results });
  } catch (err) {
    console.error("Migration error:", err);
    return jsonResponse2({ success: false, error: "Migration failed: " + err.message, data: results }, 500);
  }
}

// src/admin.ts
function jsonResponse3(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    }
  });
}
async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
function base64UrlDecode(str) {
  const padded = str + "=".repeat((4 - str.length % 4) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}
async function verifyToken(token, secret) {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expectedBuffer = await crypto.subtle.sign("HMAC", signature, encoder.encode(signingInput));
    const expectedHex = Array.from(new Uint8Array(expectedBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const expectedEncoded = base64UrlEncode(expectedHex);
    if (encodedSignature !== expectedEncoded) return null;
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
}
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
async function requireAdmin(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { user: null, error: jsonResponse3({ success: false, error: "\u672A\u767B\u5F55" }, 401) };
  }
  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) {
    return { user: null, error: jsonResponse3({ success: false, error: "\u767B\u5F55\u5DF2\u8FC7\u671F\uFF0C\u8BF7\u91CD\u65B0\u767B\u5F55" }, 401) };
  }
  const user = await env.DB.prepare("SELECT id, email, nickname, avatar_url, role FROM users WHERE id = ?").bind(payload.userId).first();
  if (!user) {
    return { user: null, error: jsonResponse3({ success: false, error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404) };
  }
  if (user.role !== "admin") {
    return { user: null, error: jsonResponse3({ success: false, error: "\u65E0\u6743\u8BBF\u95EE\u7BA1\u7406\u540E\u53F0" }, 403) };
  }
  return { user, error: void 0 };
}
async function handleGetStats(env) {
  const [recipes, ingredients, knowledge, cuisines, tags, users, likes, favorites] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as count FROM recipes").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM ingredients").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM knowledge_entries").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM cuisines").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM tags").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM likes").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM favorites").first()
  ]);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1e3).toISOString().slice(0, 10);
  const [newRecipes, newUsers] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as count FROM recipes WHERE DATE(created_at) >= ?").bind(sevenDaysAgo).first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE DATE(created_at) >= ?").bind(sevenDaysAgo).first()
  ]);
  return jsonResponse3({
    success: true,
    data: {
      recipes: recipes.count,
      ingredients: ingredients.count,
      knowledge: knowledge.count,
      cuisines: cuisines.count,
      tags: tags.count,
      users: users.count,
      likes: likes.count,
      favorites: favorites.count,
      newRecipes7d: newRecipes.count,
      newUsers7d: newUsers.count
    }
  });
}
async function handleGetRecipes2(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const keyword = url.searchParams.get("keyword") || "";
  const published = url.searchParams.get("published");
  const offset = (page - 1) * limit;
  let countQuery = "SELECT COUNT(*) as count FROM recipes WHERE 1=1";
  let listQuery = `
    SELECT r.id, r.title, r.slug, r.description, r.difficulty, r.cook_time, 
           r.servings, r.calories, r.cover_url, r.published, r.created_at,
           c.name as cuisine_name
    FROM recipes r
    LEFT JOIN cuisines c ON r.cuisine_id = c.id
    WHERE 1=1
  `;
  const params = [];
  if (keyword) {
    countQuery += " AND (r.title LIKE ? OR r.slug LIKE ? OR r.description LIKE ?)";
    listQuery += " AND (r.title LIKE ? OR r.slug LIKE ? OR r.description LIKE ?)";
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (published !== null && published !== "") {
    countQuery += " AND r.published = ?";
    listQuery += " AND r.published = ?";
    params.push(published === "1" ? 1 : 0);
  }
  listQuery += " ORDER BY r.id DESC LIMIT ? OFFSET ?";
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all()
  ]);
  const total = countResult.count;
  return jsonResponse3({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
}
async function handleGetRecipeDetail(env, id) {
  const recipe = await env.DB.prepare(`
    SELECT id, title, slug, description, difficulty, cook_time, servings, 
           calories, cuisine_id, cover_url, nutrition, common_mistakes, 
           success_tips, ingredient_substitutes, suitable_for, required_tools, 
           published, created_at
    FROM recipes WHERE id = ?
  `).bind(id).first();
  if (!recipe) return jsonResponse3({ success: false, error: "\u98DF\u8C31\u4E0D\u5B58\u5728" }, 404);
  const [ingredients, steps, tags, methods, regions] = await Promise.all([
    env.DB.prepare("SELECT id, name, amount, sort_order FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC").bind(id).all(),
    env.DB.prepare("SELECT id, step_number, text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC").bind(id).all(),
    env.DB.prepare("SELECT t.id, t.name, t.slug FROM tags t JOIN recipe_tags rt ON t.id = rt.tag_id WHERE rt.recipe_id = ?").bind(id).all(),
    env.DB.prepare("SELECT m.id, m.name FROM methods m JOIN recipe_methods rm ON m.id = rm.method_id WHERE rm.recipe_id = ?").bind(id).all(),
    env.DB.prepare("SELECT r.id, r.name FROM regions r JOIN recipe_regions rr ON r.id = rr.region_id WHERE rr.recipe_id = ?").bind(id).all()
  ]);
  return jsonResponse3({
    success: true,
    data: {
      ...recipe,
      ingredients: ingredients.results,
      steps: steps.results,
      tags: tags.results,
      methods: methods.results,
      regions: regions.results
    }
  });
}
async function handleCreateRecipe(request, env) {
  const body = await parseJson(request);
  if (!body) return jsonResponse3({ success: false, error: "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF" }, 400);
  if (!body.title || !body.slug) {
    return jsonResponse3({ success: false, error: "\u6807\u9898\u548Cslug\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM recipes WHERE slug = ?").bind(body.slug).first();
  if (existing) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  try {
    const result = await env.DB.prepare(`
      INSERT INTO recipes (title, slug, description, difficulty, cook_time, servings, 
                          calories, cuisine_id, cover_url, nutrition, common_mistakes, 
                          success_tips, ingredient_substitutes, suitable_for, required_tools, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.title,
      body.slug,
      body.description || "",
      body.difficulty || "easy",
      body.cook_time || 0,
      body.servings || 1,
      body.calories || 0,
      body.cuisine_id || null,
      body.cover_url || "",
      body.nutrition || "",
      body.common_mistakes || "",
      body.success_tips || "",
      body.ingredient_substitutes || "",
      body.suitable_for || "",
      body.required_tools || "",
      body.published ?? 1
    ).run();
    const recipeId = result.meta.last_row_id;
    await insertRecipeRelations(env, recipeId, body);
    return jsonResponse3({ success: true, data: { id: recipeId } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateRecipe(request, env, id) {
  const body = await parseJson(request);
  if (!body) return jsonResponse3({ success: false, error: "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u98DF\u8C31\u4E0D\u5B58\u5728" }, 404);
  if (body.slug) {
    const slugExists = await env.DB.prepare("SELECT id FROM recipes WHERE slug = ? AND id != ?").bind(body.slug, id).first();
    if (slugExists) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  }
  try {
    const updates = [];
    const values = [];
    const fields = [
      "title",
      "slug",
      "description",
      "difficulty",
      "cook_time",
      "servings",
      "calories",
      "cuisine_id",
      "cover_url",
      "nutrition",
      "common_mistakes",
      "success_tips",
      "ingredient_substitutes",
      "suitable_for",
      "required_tools",
      "published"
    ];
    for (const field of fields) {
      if (body[field] !== void 0) {
        updates.push(`${field} = ?`);
        values.push(field === "cuisine_id" ? body[field] || null : body[field]);
      }
    }
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE recipes SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    if (body.ingredients !== void 0 || body.steps !== void 0 || body.tags !== void 0 || body.methods !== void 0 || body.regions !== void 0) {
      await insertRecipeRelations(env, id, body, true);
    }
    return jsonResponse3({ success: true, data: { id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteRecipe(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u98DF\u8C31\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM recipe_methods WHERE recipe_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM recipe_regions WHERE recipe_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM likes WHERE recipe_slug = (SELECT slug FROM recipes WHERE id = ?)").bind(id).run();
    await env.DB.prepare("DELETE FROM favorites WHERE recipe_slug = (SELECT slug FROM recipes WHERE id = ?)").bind(id).run();
    await env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleToggleRecipePublish(env, id, published) {
  const existing = await env.DB.prepare("SELECT id FROM recipes WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u98DF\u8C31\u4E0D\u5B58\u5728" }, 404);
  await env.DB.prepare("UPDATE recipes SET published = ? WHERE id = ?").bind(published, id).run();
  return jsonResponse3({ success: true, data: { id, published } });
}
async function insertRecipeRelations(env, recipeId, data, replace = false) {
  if (replace) {
    if (data.ingredients !== void 0) {
      await env.DB.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(recipeId).run();
    }
    if (data.steps !== void 0) {
      await env.DB.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").bind(recipeId).run();
    }
    if (data.tags !== void 0) {
      await env.DB.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(recipeId).run();
    }
    if (data.methods !== void 0) {
      await env.DB.prepare("DELETE FROM recipe_methods WHERE recipe_id = ?").bind(recipeId).run();
    }
    if (data.regions !== void 0) {
      await env.DB.prepare("DELETE FROM recipe_regions WHERE recipe_id = ?").bind(recipeId).run();
    }
  }
  if (data.ingredients && Array.isArray(data.ingredients)) {
    for (let i = 0; i < data.ingredients.length; i++) {
      const ing = data.ingredients[i];
      await env.DB.prepare(
        "INSERT INTO recipe_ingredients (recipe_id, name, amount, sort_order) VALUES (?, ?, ?, ?)"
      ).bind(recipeId, ing.name, ing.amount || "", ing.sort_order || i + 1).run();
    }
  }
  if (data.steps && Array.isArray(data.steps)) {
    for (const step of data.steps) {
      await env.DB.prepare(
        "INSERT INTO recipe_steps (recipe_id, step_number, text) VALUES (?, ?, ?)"
      ).bind(recipeId, step.step_number || 0, step.text || "").run();
    }
  }
  if (data.tags && Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      const tagId = tag.id || tag;
      if (tagId) {
        await env.DB.prepare("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(recipeId, tagId).run();
      }
    }
  }
  if (data.methods && Array.isArray(data.methods)) {
    for (const method of data.methods) {
      const methodId = method.id || method;
      if (methodId) {
        await env.DB.prepare("INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)").bind(recipeId, methodId).run();
      }
    }
  }
  if (data.regions && Array.isArray(data.regions)) {
    for (const region of data.regions) {
      const regionId = region.id || region;
      if (regionId) {
        await env.DB.prepare("INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)").bind(recipeId, regionId).run();
      }
    }
  }
}
async function handleGetIngredients2(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const keyword = url.searchParams.get("keyword") || "";
  const category = url.searchParams.get("category") || "";
  const offset = (page - 1) * limit;
  let countQuery = "SELECT COUNT(*) as count FROM ingredients WHERE 1=1";
  let listQuery = `
    SELECT id, name, slug, category, description, image_url, nutrition, 
           tips, aliases, season, origin, storage_method, pairing_suggestions, 
           avoid_with, published, created_at
    FROM ingredients WHERE 1=1
  `;
  const params = [];
  if (keyword) {
    countQuery += " AND (name LIKE ? OR slug LIKE ? OR description LIKE ?)";
    listQuery += " AND (name LIKE ? OR slug LIKE ? OR description LIKE ?)";
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (category) {
    countQuery += " AND category = ?";
    listQuery += " AND category = ?";
    params.push(category);
  }
  listQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all()
  ]);
  const total = countResult.count;
  return jsonResponse3({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
}
async function handleGetIngredientDetail(env, id) {
  const ingredient = await env.DB.prepare(`
    SELECT id, name, slug, category, description, image_url, nutrition, 
           tips, aliases, season, origin, storage_method, pairing_suggestions, 
           avoid_with, published, created_at
    FROM ingredients WHERE id = ?
  `).bind(id).first();
  if (!ingredient) return jsonResponse3({ success: false, error: "\u98DF\u6750\u4E0D\u5B58\u5728" }, 404);
  return jsonResponse3({ success: true, data: ingredient });
}
async function handleCreateIngredient(request, env) {
  const body = await parseJson(request);
  if (!body?.name || !body?.slug) {
    return jsonResponse3({ success: false, error: "\u540D\u79F0\u548Cslug\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM ingredients WHERE slug = ?").bind(body.slug).first();
  if (existing) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  try {
    const result = await env.DB.prepare(`
      INSERT INTO ingredients (name, slug, category, description, image_url, nutrition, 
                              tips, aliases, season, origin, storage_method, 
                              pairing_suggestions, avoid_with, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name,
      body.slug,
      body.category || "ingredient",
      body.description || "",
      body.image_url || "",
      body.nutrition || "",
      body.tips || "",
      body.aliases || "",
      body.season || "",
      body.origin || "",
      body.storage_method || "",
      body.pairing_suggestions || "",
      body.avoid_with || "",
      body.published ?? 1
    ).run();
    return jsonResponse3({ success: true, data: { id: result.meta.last_row_id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateIngredient(request, env, id) {
  const body = await parseJson(request);
  if (!body) return jsonResponse3({ success: false, error: "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM ingredients WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u98DF\u6750\u4E0D\u5B58\u5728" }, 404);
  if (body.slug) {
    const slugExists = await env.DB.prepare("SELECT id FROM ingredients WHERE slug = ? AND id != ?").bind(body.slug, id).first();
    if (slugExists) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  }
  try {
    const updates = [];
    const values = [];
    const fields = [
      "name",
      "slug",
      "category",
      "description",
      "image_url",
      "nutrition",
      "tips",
      "aliases",
      "season",
      "origin",
      "storage_method",
      "pairing_suggestions",
      "avoid_with",
      "published"
    ];
    for (const field of fields) {
      if (body[field] !== void 0) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE ingredients SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    return jsonResponse3({ success: true, data: { id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteIngredient(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM ingredients WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u98DF\u6750\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("DELETE FROM ingredients WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleGetKnowledge2(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const keyword = url.searchParams.get("keyword") || "";
  const category = url.searchParams.get("category") || "";
  const offset = (page - 1) * limit;
  let countQuery = "SELECT COUNT(*) as count FROM knowledge_entries WHERE 1=1";
  let listQuery = `
    SELECT id, title, slug, category, content, author, is_original, 
           published_at, summary, keywords, published, created_at
    FROM knowledge_entries WHERE 1=1
  `;
  const params = [];
  if (keyword) {
    countQuery += " AND (title LIKE ? OR slug LIKE ? OR summary LIKE ?)";
    listQuery += " AND (title LIKE ? OR slug LIKE ? OR summary LIKE ?)";
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  if (category) {
    countQuery += " AND category = ?";
    listQuery += " AND category = ?";
    params.push(category);
  }
  listQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all()
  ]);
  const total = countResult.count;
  return jsonResponse3({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
}
async function handleGetKnowledgeDetail(env, id) {
  const entry = await env.DB.prepare(`
    SELECT id, title, slug, category, content, author, is_original, 
           published_at, summary, keywords, published, created_at
    FROM knowledge_entries WHERE id = ?
  `).bind(id).first();
  if (!entry) return jsonResponse3({ success: false, error: "\u77E5\u8BC6\u6761\u76EE\u4E0D\u5B58\u5728" }, 404);
  return jsonResponse3({ success: true, data: entry });
}
async function handleCreateKnowledge(request, env) {
  const body = await parseJson(request);
  if (!body?.title || !body?.slug) {
    return jsonResponse3({ success: false, error: "\u6807\u9898\u548Cslug\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM knowledge_entries WHERE slug = ?").bind(body.slug).first();
  if (existing) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  try {
    const result = await env.DB.prepare(`
      INSERT INTO knowledge_entries (title, slug, category, content, author, is_original, 
                                     published_at, summary, keywords, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.title,
      body.slug,
      body.category || "flavor",
      body.content || "",
      body.author || "",
      body.is_original || 0,
      body.published_at || "",
      body.summary || "",
      body.keywords || "",
      body.published ?? 1
    ).run();
    return jsonResponse3({ success: true, data: { id: result.meta.last_row_id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateKnowledge(request, env, id) {
  const body = await parseJson(request);
  if (!body) return jsonResponse3({ success: false, error: "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM knowledge_entries WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u77E5\u8BC6\u6761\u76EE\u4E0D\u5B58\u5728" }, 404);
  if (body.slug) {
    const slugExists = await env.DB.prepare("SELECT id FROM knowledge_entries WHERE slug = ? AND id != ?").bind(body.slug, id).first();
    if (slugExists) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  }
  try {
    const updates = [];
    const values = [];
    const fields = [
      "title",
      "slug",
      "category",
      "content",
      "author",
      "is_original",
      "published_at",
      "summary",
      "keywords",
      "published"
    ];
    for (const field of fields) {
      if (body[field] !== void 0) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE knowledge_entries SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    return jsonResponse3({ success: true, data: { id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteKnowledge(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM knowledge_entries WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u77E5\u8BC6\u6761\u76EE\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("DELETE FROM knowledge_entries WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleGetCuisines2(request, env) {
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  let query = "SELECT id, name, slug, description, cover_url, sort_order, created_at FROM cuisines";
  if (!all) query += " WHERE id > 0";
  query += " ORDER BY sort_order ASC, id ASC";
  const result = await env.DB.prepare(query).all();
  return jsonResponse3({ success: true, data: result.results });
}
async function handleCreateCuisine(request, env) {
  const body = await parseJson(request);
  if (!body?.name || !body?.slug) {
    return jsonResponse3({ success: false, error: "\u540D\u79F0\u548Cslug\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM cuisines WHERE slug = ?").bind(body.slug).first();
  if (existing) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  try {
    const maxSort = await env.DB.prepare("SELECT MAX(sort_order) as max_sort FROM cuisines").first();
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    const result = await env.DB.prepare(`
      INSERT INTO cuisines (name, slug, description, cover_url, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(body.name, body.slug, body.description || "", body.cover_url || "", sortOrder).run();
    return jsonResponse3({ success: true, data: { id: result.meta.last_row_id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateCuisine(request, env, id) {
  const body = await parseJson(request);
  if (!body) return jsonResponse3({ success: false, error: "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM cuisines WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u83DC\u7CFB\u4E0D\u5B58\u5728" }, 404);
  if (body.slug) {
    const slugExists = await env.DB.prepare("SELECT id FROM cuisines WHERE slug = ? AND id != ?").bind(body.slug, id).first();
    if (slugExists) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  }
  try {
    const updates = [];
    const values = [];
    for (const field of ["name", "slug", "description", "cover_url", "sort_order"]) {
      if (body[field] !== void 0) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE cuisines SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    return jsonResponse3({ success: true, data: { id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteCuisine(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM cuisines WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u83DC\u7CFB\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("UPDATE recipes SET cuisine_id = NULL WHERE cuisine_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM cuisines WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleGetTags2(request, env) {
  const url = new URL(request.url);
  const all = url.searchParams.get("all") === "1";
  let query = "SELECT id, name, slug, icon, sort_order, created_at FROM tags";
  if (!all) query += " WHERE id > 0";
  query += " ORDER BY sort_order ASC, id ASC";
  const result = await env.DB.prepare(query).all();
  return jsonResponse3({ success: true, data: result.results });
}
async function handleCreateTag(request, env) {
  const body = await parseJson(request);
  if (!body?.name || !body?.slug) {
    return jsonResponse3({ success: false, error: "\u540D\u79F0\u548Cslug\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM tags WHERE slug = ?").bind(body.slug).first();
  if (existing) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  try {
    const maxSort = await env.DB.prepare("SELECT MAX(sort_order) as max_sort FROM tags").first();
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    const result = await env.DB.prepare(`
      INSERT INTO tags (name, slug, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `).bind(body.name, body.slug, body.icon || "", sortOrder).run();
    return jsonResponse3({ success: true, data: { id: result.meta.last_row_id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateTag(request, env, id) {
  const body = await parseJson(request);
  if (!body) return jsonResponse3({ success: false, error: "\u8BF7\u6C42\u53C2\u6570\u9519\u8BEF" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM tags WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u6807\u7B7E\u4E0D\u5B58\u5728" }, 404);
  if (body.slug) {
    const slugExists = await env.DB.prepare("SELECT id FROM tags WHERE slug = ? AND id != ?").bind(body.slug, id).first();
    if (slugExists) return jsonResponse3({ success: false, error: "slug\u5DF2\u5B58\u5728" }, 400);
  }
  try {
    const updates = [];
    const values = [];
    for (const field of ["name", "slug", "icon", "sort_order"]) {
      if (body[field] !== void 0) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE tags SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
    }
    return jsonResponse3({ success: true, data: { id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteTag(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM tags WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u6807\u7B7E\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("DELETE FROM recipe_tags WHERE tag_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleGetRegions2(env) {
  const result = await env.DB.prepare("SELECT id, name, created_at FROM regions ORDER BY id ASC").all();
  return jsonResponse3({ success: true, data: result.results });
}
async function handleCreateRegion(request, env) {
  const body = await parseJson(request);
  if (!body?.name) return jsonResponse3({ success: false, error: "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM regions WHERE name = ?").bind(body.name).first();
  if (existing) return jsonResponse3({ success: false, error: "\u5730\u533A\u5DF2\u5B58\u5728" }, 400);
  try {
    const result = await env.DB.prepare("INSERT INTO regions (name) VALUES (?)").bind(body.name).run();
    return jsonResponse3({ success: true, data: { id: result.meta.last_row_id, name: body.name } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateRegion(request, env, id) {
  const body = await parseJson(request);
  if (!body?.name) return jsonResponse3({ success: false, error: "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM regions WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u5730\u533A\u4E0D\u5B58\u5728" }, 404);
  const nameExists = await env.DB.prepare("SELECT id FROM regions WHERE name = ? AND id != ?").bind(body.name, id).first();
  if (nameExists) return jsonResponse3({ success: false, error: "\u5730\u533A\u540D\u79F0\u5DF2\u5B58\u5728" }, 400);
  try {
    await env.DB.prepare("UPDATE regions SET name = ? WHERE id = ?").bind(body.name, id).run();
    return jsonResponse3({ success: true, data: { id, name: body.name } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteRegion(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM regions WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u5730\u533A\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("DELETE FROM recipe_regions WHERE region_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM regions WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleGetMethods2(env) {
  const result = await env.DB.prepare("SELECT id, name, created_at FROM methods ORDER BY id ASC").all();
  return jsonResponse3({ success: true, data: result.results });
}
async function handleCreateMethod(request, env) {
  const body = await parseJson(request);
  if (!body?.name) return jsonResponse3({ success: false, error: "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM methods WHERE name = ?").bind(body.name).first();
  if (existing) return jsonResponse3({ success: false, error: "\u505A\u6CD5\u5DF2\u5B58\u5728" }, 400);
  try {
    const result = await env.DB.prepare("INSERT INTO methods (name) VALUES (?)").bind(body.name).run();
    return jsonResponse3({ success: true, data: { id: result.meta.last_row_id, name: body.name } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateMethod(request, env, id) {
  const body = await parseJson(request);
  if (!body?.name) return jsonResponse3({ success: false, error: "\u540D\u79F0\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM methods WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u505A\u6CD5\u4E0D\u5B58\u5728" }, 404);
  const nameExists = await env.DB.prepare("SELECT id FROM methods WHERE name = ? AND id != ?").bind(body.name, id).first();
  if (nameExists) return jsonResponse3({ success: false, error: "\u505A\u6CD5\u540D\u79F0\u5DF2\u5B58\u5728" }, 400);
  try {
    await env.DB.prepare("UPDATE methods SET name = ? WHERE id = ?").bind(body.name, id).run();
    return jsonResponse3({ success: true, data: { id, name: body.name } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteMethod(env, id) {
  const existing = await env.DB.prepare("SELECT id FROM methods WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u505A\u6CD5\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("DELETE FROM recipe_methods WHERE method_id = ?").bind(id).run();
    await env.DB.prepare("DELETE FROM methods WHERE id = ?").bind(id).run();
    return jsonResponse3({ success: true, data: { deleted: id } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleGetUsers(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "20");
  const keyword = url.searchParams.get("keyword") || "";
  const role = url.searchParams.get("role") || "";
  const offset = (page - 1) * limit;
  let countQuery = "SELECT COUNT(*) as count FROM users WHERE 1=1";
  let listQuery = `
    SELECT id, email, nickname, avatar_url, phone, birthday, role, created_at
    FROM users WHERE 1=1
  `;
  const params = [];
  if (keyword) {
    countQuery += " AND (email LIKE ? OR nickname LIKE ?)";
    listQuery += " AND (email LIKE ? OR nickname LIKE ?)";
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }
  if (role) {
    countQuery += " AND role = ?";
    listQuery += " AND role = ?";
    params.push(role);
  }
  listQuery += " ORDER BY id DESC LIMIT ? OFFSET ?";
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all()
  ]);
  const total = countResult.count;
  return jsonResponse3({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
}
async function handleUpdateUserRole(request, env, id) {
  const body = await parseJson(request);
  if (!body?.role || !["user", "admin"].includes(body.role)) {
    return jsonResponse3({ success: false, error: "\u89D2\u8272\u4E0D\u5408\u6CD5" }, 400);
  }
  const existing = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(id).first();
  if (!existing) return jsonResponse3({ success: false, error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
  try {
    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(body.role, id).run();
    return jsonResponse3({ success: true, data: { id, role: body.role } });
  } catch (err) {
    return jsonResponse3({ success: false, error: err.message }, 500);
  }
}
async function handleAdminRequest(path, request, env) {
  if (!path.startsWith("/api/admin/")) return null;
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization"
      }
    });
  }
  if (path !== "/api/admin/login") {
    const { error } = await requireAdmin(request, env);
    if (error) return error;
  }
  if (path === "/api/admin/stats" && request.method === "GET") {
    return await handleGetStats(env);
  }
  if (path === "/api/admin/recipes" && request.method === "GET") {
    return await handleGetRecipes2(request, env);
  }
  if (path === "/api/admin/recipes" && request.method === "POST") {
    return await handleCreateRecipe(request, env);
  }
  const recipeDetailMatch = path.match(/^\/api\/admin\/recipes\/(\d+)$/);
  if (recipeDetailMatch && request.method === "GET") {
    return await handleGetRecipeDetail(env, parseInt(recipeDetailMatch[1]));
  }
  if (recipeDetailMatch && request.method === "PUT") {
    return await handleUpdateRecipe(request, env, parseInt(recipeDetailMatch[1]));
  }
  if (recipeDetailMatch && request.method === "DELETE") {
    return await handleDeleteRecipe(env, parseInt(recipeDetailMatch[1]));
  }
  const recipePublishMatch = path.match(/^\/api\/admin\/recipes\/(\d+)\/publish$/);
  if (recipePublishMatch && request.method === "PUT") {
    const body = await parseJson(request);
    return await handleToggleRecipePublish(env, parseInt(recipePublishMatch[1]), body?.published ? 1 : 0);
  }
  if (path === "/api/admin/ingredients" && request.method === "GET") {
    return await handleGetIngredients2(request, env);
  }
  if (path === "/api/admin/ingredients" && request.method === "POST") {
    return await handleCreateIngredient(request, env);
  }
  const ingredientDetailMatch = path.match(/^\/api\/admin\/ingredients\/(\d+)$/);
  if (ingredientDetailMatch && request.method === "GET") {
    return await handleGetIngredientDetail(env, parseInt(ingredientDetailMatch[1]));
  }
  if (ingredientDetailMatch && request.method === "PUT") {
    return await handleUpdateIngredient(request, env, parseInt(ingredientDetailMatch[1]));
  }
  if (ingredientDetailMatch && request.method === "DELETE") {
    return await handleDeleteIngredient(env, parseInt(ingredientDetailMatch[1]));
  }
  if (path === "/api/admin/knowledge" && request.method === "GET") {
    return await handleGetKnowledge2(request, env);
  }
  if (path === "/api/admin/knowledge" && request.method === "POST") {
    return await handleCreateKnowledge(request, env);
  }
  const knowledgeDetailMatch = path.match(/^\/api\/admin\/knowledge\/(\d+)$/);
  if (knowledgeDetailMatch && request.method === "GET") {
    return await handleGetKnowledgeDetail(env, parseInt(knowledgeDetailMatch[1]));
  }
  if (knowledgeDetailMatch && request.method === "PUT") {
    return await handleUpdateKnowledge(request, env, parseInt(knowledgeDetailMatch[1]));
  }
  if (knowledgeDetailMatch && request.method === "DELETE") {
    return await handleDeleteKnowledge(env, parseInt(knowledgeDetailMatch[1]));
  }
  if (path === "/api/admin/cuisines" && request.method === "GET") {
    return await handleGetCuisines2(request, env);
  }
  if (path === "/api/admin/cuisines" && request.method === "POST") {
    return await handleCreateCuisine(request, env);
  }
  const cuisineDetailMatch = path.match(/^\/api\/admin\/cuisines\/(\d+)$/);
  if (cuisineDetailMatch && request.method === "PUT") {
    return await handleUpdateCuisine(request, env, parseInt(cuisineDetailMatch[1]));
  }
  if (cuisineDetailMatch && request.method === "DELETE") {
    return await handleDeleteCuisine(env, parseInt(cuisineDetailMatch[1]));
  }
  if (path === "/api/admin/tags" && request.method === "GET") {
    return await handleGetTags2(request, env);
  }
  if (path === "/api/admin/tags" && request.method === "POST") {
    return await handleCreateTag(request, env);
  }
  const tagDetailMatch = path.match(/^\/api\/admin\/tags\/(\d+)$/);
  if (tagDetailMatch && request.method === "PUT") {
    return await handleUpdateTag(request, env, parseInt(tagDetailMatch[1]));
  }
  if (tagDetailMatch && request.method === "DELETE") {
    return await handleDeleteTag(env, parseInt(tagDetailMatch[1]));
  }
  if (path === "/api/admin/regions" && request.method === "GET") {
    return await handleGetRegions2(env);
  }
  if (path === "/api/admin/regions" && request.method === "POST") {
    return await handleCreateRegion(request, env);
  }
  const regionDetailMatch = path.match(/^\/api\/admin\/regions\/(\d+)$/);
  if (regionDetailMatch && request.method === "PUT") {
    return await handleUpdateRegion(request, env, parseInt(regionDetailMatch[1]));
  }
  if (regionDetailMatch && request.method === "DELETE") {
    return await handleDeleteRegion(env, parseInt(regionDetailMatch[1]));
  }
  if (path === "/api/admin/methods" && request.method === "GET") {
    return await handleGetMethods2(env);
  }
  if (path === "/api/admin/methods" && request.method === "POST") {
    return await handleCreateMethod(request, env);
  }
  const methodDetailMatch = path.match(/^\/api\/admin\/methods\/(\d+)$/);
  if (methodDetailMatch && request.method === "PUT") {
    return await handleUpdateMethod(request, env, parseInt(methodDetailMatch[1]));
  }
  if (methodDetailMatch && request.method === "DELETE") {
    return await handleDeleteMethod(env, parseInt(methodDetailMatch[1]));
  }
  if (path === "/api/admin/users" && request.method === "GET") {
    return await handleGetUsers(request, env);
  }
  const userRoleMatch = path.match(/^\/api\/admin\/users\/(\d+)\/role$/);
  if (userRoleMatch && request.method === "PUT") {
    return await handleUpdateUserRole(request, env, parseInt(userRoleMatch[1]));
  }
  return null;
}

// src/index.ts
async function hashPassword(password) {
  const salt = crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${salt}:${hashHex}`;
}
async function verifyPassword(password, storedHash) {
  const [salt, hash] = storedHash.split(":");
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hash === hashHex;
}
function generateDefaultNickname() {
  const prefixes = ["\u5C0F\u998B\u732B", "\u8D2A\u5403\u732B", "\u5E72\u996D\u732B", "\u89C5\u98DF\u732B", "\u5403\u8D27\u732B", "\u7F8E\u5473\u732B", "\u5BFB\u5473\u732B", "\u54C1\u9C9C\u732B"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(Math.random() * 9e3) + 1e3;
  return `${prefix}${num}`;
}
function base64UrlEncode2(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function base64UrlDecode2(str) {
  const padded = str + "=".repeat((4 - str.length % 4) % 4);
  return atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
}
async function createToken(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode2(JSON.stringify(header));
  const encodedPayload = base64UrlEncode2(JSON.stringify(payload));
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign("HMAC", signature, encoder.encode(signingInput));
  const signatureHex = Array.from(new Uint8Array(signatureBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const encodedSignature = base64UrlEncode2(signatureHex);
  return `${signingInput}.${encodedSignature}`;
}
async function verifyToken2(token, secret) {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const expectedBuffer = await crypto.subtle.sign("HMAC", signature, encoder.encode(signingInput));
    const expectedHex = Array.from(new Uint8Array(expectedBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const expectedEncoded = base64UrlEncode2(expectedHex);
    if (encodedSignature !== expectedEncoded) return null;
    return JSON.parse(base64UrlDecode2(encodedPayload));
  } catch {
    return null;
  }
}
async function authenticateRequest(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  return await verifyToken2(authHeader.substring(7), env.JWT_SECRET);
}
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "https://chanmaoyoupu.com",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Credentials": "true"
  };
}
function jsonResponse4(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}
async function parseJson2(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
async function handleCheckNickname(request, env) {
  const url = new URL(request.url);
  const nickname = url.searchParams.get("nickname");
  if (!nickname) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9B\u6635\u79F0" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM users WHERE nickname = ?").bind(nickname).first();
  return jsonResponse4({ success: true, data: { available: !existing } });
}
async function handleRegister(request, env) {
  const body = await parseJson2(request);
  if (!body?.email || !body?.password) return jsonResponse4({ success: false, error: "\u90AE\u7BB1\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return jsonResponse4({ success: false, error: "\u90AE\u7BB1\u683C\u5F0F\u4E0D\u6B63\u786E" }, 400);
  if (body.password.length < 6) return jsonResponse4({ success: false, error: "\u5BC6\u7801\u81F3\u5C116\u4F4D" }, 400);
  if (body.phone && !/^1\d{10}$/.test(body.phone)) return jsonResponse4({ success: false, error: "\u624B\u673A\u53F7\u683C\u5F0F\u4E0D\u6B63\u786E" }, 400);
  if (body.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) return jsonResponse4({ success: false, error: "\u751F\u65E5\u683C\u5F0F\u5E94\u4E3AYYYY-MM-DD" }, 400);
  const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(body.email).first();
  if (existingUser) return jsonResponse4({ success: false, error: "\u8BE5\u90AE\u7BB1\u5DF2\u88AB\u6CE8\u518C" }, 400);
  let nickname;
  if (body.nickname) {
    const existingNickname = await env.DB.prepare("SELECT id FROM users WHERE nickname = ?").bind(body.nickname).first();
    if (existingNickname) return jsonResponse4({ success: false, error: "\u8BE5\u6635\u79F0\u5DF2\u88AB\u4F7F\u7528\uFF0C\u8BF7\u6362\u4E00\u4E2A" }, 400);
    nickname = body.nickname;
  } else {
    let attempts = 0;
    nickname = generateDefaultNickname();
    while (attempts < 10) {
      const dup = await env.DB.prepare("SELECT id FROM users WHERE nickname = ?").bind(nickname).first();
      if (!dup) break;
      nickname = generateDefaultNickname();
      attempts++;
    }
  }
  const passwordHash = await hashPassword(body.password);
  const phone = body.phone || "";
  const birthday = body.birthday || "";
  try {
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, nickname, phone, birthday, role) VALUES (?, ?, ?, ?, ?, "user") RETURNING id, email, nickname, avatar_url, phone, birthday, role, created_at'
    ).bind(body.email, passwordHash, nickname, phone, birthday).first();
    const token = await createToken({ userId: result.id, email: result.email }, env.JWT_SECRET);
    return jsonResponse4({
      success: true,
      data: {
        user: { id: result.id, email: result.email, nickname: result.nickname, avatar_url: result.avatar_url, phone: result.phone, birthday: result.birthday, role: result.role || "user" },
        token
      }
    });
  } catch (err) {
    return jsonResponse4({ success: false, error: "\u6CE8\u518C\u5931\u8D25" }, 500);
  }
}
async function handleLogin(request, env) {
  const body = await parseJson2(request);
  if (!body?.email || !body?.password) return jsonResponse4({ success: false, error: "\u90AE\u7BB1\u548C\u5BC6\u7801\u4E0D\u80FD\u4E3A\u7A7A" }, 400);
  let user;
  try {
    user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(body.email).first();
  } catch (err) {
    if (err.message?.includes("no such column") || err.message?.includes("role")) {
      await migrateRoleColumn(env);
      user = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(body.email).first();
    } else {
      throw err;
    }
  }
  if (!user) return jsonResponse4({ success: false, error: "\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF" }, 401);
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return jsonResponse4({ success: false, error: "\u90AE\u7BB1\u6216\u5BC6\u7801\u9519\u8BEF" }, 401);
  const token = await createToken({ userId: user.id, email: user.email }, env.JWT_SECRET);
  return jsonResponse4({
    success: true,
    data: {
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, phone: user.phone || "", birthday: user.birthday || "", role: user.role || "user" },
      token
    }
  });
}
async function migrateRoleColumn(env) {
  try {
    await env.DB.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"');
    await env.DB.prepare('UPDATE users SET role = "admin" WHERE id = (SELECT MIN(id) FROM users)').run();
  } catch (err) {
    if (!err.message?.includes("duplicate column name") && !err.message?.includes("already exists")) {
      throw err;
    }
  }
}
async function handleGetMe(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse4({ success: false, error: "\u672A\u767B\u5F55" }, 401);
  let user;
  try {
    user = await env.DB.prepare("SELECT id, email, nickname, avatar_url, phone, birthday, role, created_at FROM users WHERE id = ?").bind(auth.userId).first();
  } catch (err) {
    if (err.message?.includes("no such column") || err.message?.includes("role")) {
      await migrateRoleColumn(env);
      user = await env.DB.prepare("SELECT id, email, nickname, avatar_url, phone, birthday, role, created_at FROM users WHERE id = ?").bind(auth.userId).first();
    } else {
      throw err;
    }
  }
  if (!user) return jsonResponse4({ success: false, error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
  return jsonResponse4({ success: true, data: { ...user, role: user.role || "user" } });
}
async function handleUpdateProfile(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse4({ success: false, error: "\u672A\u767B\u5F55" }, 401);
  const body = await parseJson2(request);
  const updates = [];
  const values = [];
  if (body?.nickname) {
    const dup = await env.DB.prepare("SELECT id FROM users WHERE nickname = ? AND id != ?").bind(body.nickname, auth.userId).first();
    if (dup) return jsonResponse4({ success: false, error: "\u8BE5\u6635\u79F0\u5DF2\u88AB\u4F7F\u7528\uFF0C\u8BF7\u6362\u4E00\u4E2A" }, 400);
    updates.push("nickname = ?");
    values.push(body.nickname);
  }
  if (body?.avatar_url) {
    updates.push("avatar_url = ?");
    values.push(body.avatar_url);
  }
  if (body?.phone !== void 0) {
    updates.push("phone = ?");
    values.push(body.phone);
  }
  if (body?.birthday !== void 0) {
    updates.push("birthday = ?");
    values.push(body.birthday);
  }
  if (updates.length === 0) return jsonResponse4({ success: false, error: "\u6CA1\u6709\u9700\u8981\u66F4\u65B0\u7684\u5B57\u6BB5" }, 400);
  values.push(auth.userId);
  await env.DB.prepare(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`).bind(...values).run();
  const user = await env.DB.prepare("SELECT id, email, nickname, avatar_url, phone, birthday, created_at FROM users WHERE id = ?").bind(auth.userId).first();
  return jsonResponse4({ success: true, data: user });
}
async function handleChangePassword(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse4({ success: false, error: "\u672A\u767B\u5F55" }, 401);
  const body = await parseJson2(request);
  if (!body?.old_password || !body?.new_password) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9B\u5F53\u524D\u5BC6\u7801\u548C\u65B0\u5BC6\u7801" }, 400);
  if (body.new_password.length < 6) return jsonResponse4({ success: false, error: "\u65B0\u5BC6\u7801\u81F3\u5C116\u4F4D" }, 400);
  const user = await env.DB.prepare("SELECT password_hash FROM users WHERE id = ?").bind(auth.userId).first();
  if (!user) return jsonResponse4({ success: false, error: "\u7528\u6237\u4E0D\u5B58\u5728" }, 404);
  const valid = await verifyPassword(body.old_password, user.password_hash);
  if (!valid) return jsonResponse4({ success: false, error: "\u5F53\u524D\u5BC6\u7801\u4E0D\u6B63\u786E" }, 400);
  const newHash = await hashPassword(body.new_password);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(newHash, auth.userId).run();
  return jsonResponse4({ success: true, data: { success: true } });
}
async function handleOAuth(request, env, provider) {
  if (!["wechat", "douyin", "kuaishou"].includes(provider)) return jsonResponse4({ success: false, error: "\u4E0D\u652F\u6301\u7684OAuth\u63D0\u4F9B\u5546" }, 400);
  return jsonResponse4({ success: false, error: `${provider} OAuth\u529F\u80FD\u6B63\u5728\u5F00\u53D1\u4E2D`, data: { provider, status: "pending" } });
}
async function handleLike(request, env, slug) {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse4({ success: false, error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  if (!slug) return jsonResponse4({ success: false, error: "\u7F3A\u5C11\u98DF\u8C31slug" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM likes WHERE user_id = ? AND recipe_slug = ?").bind(auth.userId, slug).first();
  if (existing) {
    await env.DB.prepare("DELETE FROM likes WHERE user_id = ? AND recipe_slug = ?").bind(auth.userId, slug).run();
  } else {
    await env.DB.prepare("INSERT INTO likes (user_id, recipe_slug) VALUES (?, ?)").bind(auth.userId, slug).run();
  }
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?").bind(slug).first();
  return jsonResponse4({ success: true, data: { liked: !existing, count } });
}
async function handleGetLikes(request, env, slug) {
  if (!slug) return jsonResponse4({ success: false, error: "\u7F3A\u5C11\u98DF\u8C31slug" }, 400);
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?").bind(slug).first();
  let liked = false;
  const auth = await authenticateRequest(request, env);
  if (auth) {
    const e = await env.DB.prepare("SELECT id FROM likes WHERE user_id = ? AND recipe_slug = ?").bind(auth.userId, slug).first();
    liked = !!e;
  }
  return jsonResponse4({ success: true, data: { count, liked } });
}
async function handleFavorite(request, env, slug) {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse4({ success: false, error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  if (!slug) return jsonResponse4({ success: false, error: "\u7F3A\u5C11\u98DF\u8C31slug" }, 400);
  const existing = await env.DB.prepare("SELECT id FROM favorites WHERE user_id = ? AND recipe_slug = ?").bind(auth.userId, slug).first();
  if (existing) {
    await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND recipe_slug = ?").bind(auth.userId, slug).run();
  } else {
    await env.DB.prepare("INSERT INTO favorites (user_id, recipe_slug) VALUES (?, ?)").bind(auth.userId, slug).run();
  }
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?").bind(slug).first();
  return jsonResponse4({ success: true, data: { favorited: !existing, count } });
}
async function handleGetFavorites(request, env, slug) {
  if (!slug) return jsonResponse4({ success: false, error: "\u7F3A\u5C11\u98DF\u8C31slug" }, 400);
  const { count } = await env.DB.prepare("SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?").bind(slug).first();
  let favorited = false;
  const auth = await authenticateRequest(request, env);
  if (auth) {
    const e = await env.DB.prepare("SELECT id FROM favorites WHERE user_id = ? AND recipe_slug = ?").bind(auth.userId, slug).first();
    favorited = !!e;
  }
  return jsonResponse4({ success: true, data: { count, favorited } });
}
async function handleGetMyFavorites(request, env) {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse4({ success: false, error: "\u8BF7\u5148\u767B\u5F55" }, 401);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const limit = parseInt(url.searchParams.get("limit") || "10");
  const offset = (page - 1) * limit;
  const favorites = await env.DB.prepare("SELECT recipe_slug, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(auth.userId, limit, offset).all();
  const { total } = await env.DB.prepare("SELECT COUNT(*) as total FROM favorites WHERE user_id = ?").bind(auth.userId).first();
  return jsonResponse4({ success: true, data: { items: favorites.results, total, page, limit, pages: Math.ceil(total / limit) } });
}
async function handleLikesRanking(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const cuisine = url.searchParams.get("cuisine") || "";
  const region = url.searchParams.get("region") || "";
  const tag = url.searchParams.get("tag") || "";
  let query = "SELECT l.recipe_slug, COUNT(*) as like_count FROM likes l";
  const conditions = [];
  const params = [];
  if (cuisine || region || tag) {
    query += " JOIN recipes r ON l.recipe_slug = r.slug";
  }
  if (region) {
    query += " JOIN recipe_regions rr ON r.id = rr.recipe_id JOIN regions rg ON rr.region_id = rg.id";
  }
  if (tag) {
    query += " JOIN recipe_tags rt ON r.id = rt.recipe_id JOIN tags t ON rt.tag_id = t.id";
  }
  if (cuisine) {
    query += " JOIN cuisines c ON r.cuisine_id = c.id";
    conditions.push("c.name = ?");
    params.push(cuisine);
  }
  if (region) {
    conditions.push("rg.name = ?");
    params.push(region);
  }
  if (tag) {
    conditions.push("t.name = ?");
    params.push(tag);
  }
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " GROUP BY l.recipe_slug ORDER BY like_count DESC LIMIT ?";
  params.push(limit);
  const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
  const ranking = await stmt.all();
  const enriched = await Promise.all(ranking.results.map(async (item) => {
    const recipe = await env.DB.prepare("SELECT r.id, r.title, r.slug, r.cover_url, r.difficulty, r.cook_time FROM recipes r WHERE r.slug = ?").bind(item.recipe_slug).first();
    let cuisineInfo = null;
    let regions = [];
    let tags = [];
    if (recipe) {
      const c = await env.DB.prepare("SELECT cu.name FROM cuisines cu WHERE cu.id = (SELECT cuisine_id FROM recipes WHERE id = ?)").bind(recipe.id).first();
      if (c) cuisineInfo = c.name;
      const rRes = await env.DB.prepare("SELECT rg.name FROM regions rg JOIN recipe_regions rr ON rg.id = rr.region_id WHERE rr.recipe_id = ?").bind(recipe.id).all();
      regions = rRes.results.map((x) => x.name);
      const tRes = await env.DB.prepare("SELECT tg.name FROM tags tg JOIN recipe_tags tt ON tg.id = tt.tag_id WHERE tt.recipe_id = ?").bind(recipe.id).all();
      tags = tRes.results.map((x) => x.name);
    }
    return { ...item, title: recipe?.title || "", cover_url: recipe?.cover_url || "", difficulty: recipe?.difficulty || "", cook_time: recipe?.cook_time || "", cuisine: cuisineInfo, regions, tags };
  }));
  return jsonResponse4({ success: true, data: enriched });
}
async function handleFavoritesRanking(request, env) {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const cuisine = url.searchParams.get("cuisine") || "";
  const region = url.searchParams.get("region") || "";
  const tag = url.searchParams.get("tag") || "";
  let query = "SELECT f.recipe_slug, COUNT(*) as favorite_count FROM favorites f";
  const conditions = [];
  const params = [];
  if (cuisine || region || tag) {
    query += " JOIN recipes r ON f.recipe_slug = r.slug";
  }
  if (region) {
    query += " JOIN recipe_regions rr ON r.id = rr.recipe_id JOIN regions rg ON rr.region_id = rg.id";
  }
  if (tag) {
    query += " JOIN recipe_tags rt ON r.id = rt.recipe_id JOIN tags t ON rt.tag_id = t.id";
  }
  if (cuisine) {
    query += " JOIN cuisines c ON r.cuisine_id = c.id";
    conditions.push("c.name = ?");
    params.push(cuisine);
  }
  if (region) {
    conditions.push("rg.name = ?");
    params.push(region);
  }
  if (tag) {
    conditions.push("t.name = ?");
    params.push(tag);
  }
  if (conditions.length > 0) {
    query += " WHERE " + conditions.join(" AND ");
  }
  query += " GROUP BY f.recipe_slug ORDER BY favorite_count DESC LIMIT ?";
  params.push(limit);
  const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
  const ranking = await stmt.all();
  const enriched = await Promise.all(ranking.results.map(async (item) => {
    const recipe = await env.DB.prepare("SELECT r.id, r.title, r.slug, r.cover_url, r.difficulty, r.cook_time FROM recipes r WHERE r.slug = ?").bind(item.recipe_slug).first();
    let cuisineInfo = null;
    let regions = [];
    let tags = [];
    if (recipe) {
      const c = await env.DB.prepare("SELECT cu.name FROM cuisines cu WHERE cu.id = (SELECT cuisine_id FROM recipes WHERE id = ?)").bind(recipe.id).first();
      if (c) cuisineInfo = c.name;
      const rRes = await env.DB.prepare("SELECT rg.name FROM regions rg JOIN recipe_regions rr ON rg.id = rr.region_id WHERE rr.recipe_id = ?").bind(recipe.id).all();
      regions = rRes.results.map((x) => x.name);
      const tRes = await env.DB.prepare("SELECT tg.name FROM tags tg JOIN recipe_tags tt ON tg.id = tt.tag_id WHERE tt.recipe_id = ?").bind(recipe.id).all();
      tags = tRes.results.map((x) => x.name);
    }
    return { ...item, title: recipe?.title || "", cover_url: recipe?.cover_url || "", difficulty: recipe?.difficulty || "", cook_time: recipe?.cook_time || "", cuisine: cuisineInfo, regions, tags };
  }));
  return jsonResponse4({ success: true, data: enriched });
}
var index_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders() });
    try {
      if (path === "/api/auth/check-nickname" && request.method === "GET") return await handleCheckNickname(request, env);
      if (path === "/api/auth/register" && request.method === "POST") return await handleRegister(request, env);
      if (path === "/api/auth/login" && request.method === "POST") return await handleLogin(request, env);
      if (path === "/api/auth/me" && request.method === "GET") return await handleGetMe(request, env);
      if (path === "/api/auth/profile" && request.method === "PUT") return await handleUpdateProfile(request, env);
      if (path === "/api/auth/change-password" && request.method === "POST") return await handleChangePassword(request, env);
      const oauthMatch = path.match(/^\/api\/oauth\/(\w+)$/);
      if (oauthMatch && request.method === "POST") return await handleOAuth(request, env, oauthMatch[1]);
      const likeMatch = path.match(/^\/api\/recipes\/([^/]+)\/like$/);
      if (likeMatch && request.method === "POST") return await handleLike(request, env, decodeURIComponent(likeMatch[1]));
      const getLikesMatch = path.match(/^\/api\/recipes\/([^/]+)\/likes$/);
      if (getLikesMatch && request.method === "GET") return await handleGetLikes(request, env, decodeURIComponent(getLikesMatch[1]));
      const favoriteMatch = path.match(/^\/api\/recipes\/([^/]+)\/favorite$/);
      if (favoriteMatch && request.method === "POST") return await handleFavorite(request, env, decodeURIComponent(favoriteMatch[1]));
      const getFavoritesMatch = path.match(/^\/api\/recipes\/([^/]+)\/favorites$/);
      if (getFavoritesMatch && request.method === "GET") return await handleGetFavorites(request, env, decodeURIComponent(getFavoritesMatch[1]));
      if (path === "/api/users/me/favorites" && request.method === "GET") return await handleGetMyFavorites(request, env);
      if (path === "/api/rankings/likes" && request.method === "GET") return await handleLikesRanking(request, env);
      if (path === "/api/rankings/favorites" && request.method === "GET") return await handleFavoritesRanking(request, env);
      if (path === "/api/health") return jsonResponse4({ success: true, data: { status: "ok", timestamp: (/* @__PURE__ */ new Date()).toISOString() } });
      if (path === "/api/admin/import-knowledge" && request.method === "POST") return await handleImportKnowledge(request, env);
      if (path === "/api/admin/delete-knowledge" && request.method === "POST") return await handleDeleteKnowledge2(request, env);
      if (path === "/api/admin/update-recipe-covers" && request.method === "POST") return await handleUpdateRecipeCovers(request, env);
      if (path === "/api/admin/import-recipes" && request.method === "POST") return await handleImportRecipes(request, env);
      if (path === "/api/admin/reset-recipes" && request.method === "POST") return await handleResetRecipes(request, env);
      if (path === "/api/admin/import-ingredients" && request.method === "POST") return await handleImportIngredients(request, env);
      if (path === "/api/admin/delete-ingredient" && request.method === "POST") return await handleDeleteIngredient2(request, env);
      if (path === "/api/admin/import-cuisines" && request.method === "POST") return await handleImportCuisines(request, env);
      if (path === "/api/admin/import-tags" && request.method === "POST") return await handleImportTags(request, env);
      if (path === "/api/admin/delete-recipe" && request.method === "POST") return await handleDeleteRecipe2(request, env);
      if (path === "/api/admin/delete-tag" && request.method === "POST") return await handleDeleteTag2(request, env);
      if (path === "/api/admin/import-regions" && request.method === "POST") return await handleImportRegions(request, env);
      if (path === "/api/admin/import-methods" && request.method === "POST") return await handleImportMethods(request, env);
      if (path === "/api/admin/delete-cuisine" && request.method === "POST") return await handleDeleteCuisine2(request, env);
      if (path === "/api/admin/sync-recipe-classifications" && request.method === "POST") return await handleSyncRecipeClassifications(request, env);
      if (path === "/api/admin/init" && request.method === "POST") return await handleAdminInit(request, env);
      if (path === "/api/admin/sql" && request.method === "POST") return await handleAdminSQL(request, env);
      const adminResponse = await handleAdminRequest(path, request, env);
      if (adminResponse) return adminResponse;
      if (path.startsWith("/api/content/")) {
        const contentResponse = await handleContentRequest(path, request, env);
        if (contentResponse) return contentResponse;
      }
      return jsonResponse4({ success: false, error: "\u672A\u627E\u5230\u8BE5\u63A5\u53E3" }, 404);
    } catch (err) {
      console.error("API Error:", err);
      return jsonResponse4({ success: false, error: "\u670D\u52A1\u5668\u5185\u90E8\u9519\u8BEF" }, 500);
    }
  }
};
async function handleImportKnowledge(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.entries || !Array.isArray(body.entries)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bentries\u6570\u7EC4" }, 400);
  const results = [];
  let inserted = 0;
  let skipped = 0;
  for (const entry of body.entries) {
    if (!entry.title || !entry.slug || !entry.category || !entry.content) {
      results.push(`\u8DF3\u8FC7\u65E0\u6548\u6761\u76EE: ${entry.slug || "no-slug"}`);
      skipped++;
      continue;
    }
    try {
      const existing = await env.DB.prepare("SELECT id FROM knowledge_entries WHERE slug = ?").bind(entry.slug).first();
      const author = entry.author || "";
      const isOriginal = entry.is_original ? 1 : 0;
      const publishedAt = entry.published_at || "";
      const summary = entry.summary || "";
      const keywords = entry.keywords || "";
      if (existing) {
        await env.DB.prepare("UPDATE knowledge_entries SET title = ?, category = ?, content = ?, author = ?, is_original = ?, published_at = ?, summary = ?, keywords = ? WHERE slug = ?").bind(entry.title, entry.category, entry.content, author, isOriginal, publishedAt, summary, keywords, entry.slug).run();
        results.push(`\u66F4\u65B0: ${entry.slug}`);
      } else {
        await env.DB.prepare("INSERT INTO knowledge_entries (title, slug, category, content, author, is_original, published_at, summary, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(entry.title, entry.slug, entry.category, entry.content, author, isOriginal, publishedAt, summary, keywords).run();
        results.push(`\u65B0\u589E: ${entry.slug}`);
      }
      inserted++;
    } catch (err) {
      results.push(`\u9519\u8BEF: ${entry.slug} - ${err.message}`);
      skipped++;
    }
  }
  return jsonResponse4({ success: true, data: { inserted, skipped, details: results } });
}
async function handleDeleteKnowledge2(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await request.json();
  if (!body.id && !body.slug) {
    return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9B id \u6216 slug" }, 400);
  }
  try {
    let result;
    if (body.id) {
      result = await env.DB.prepare("DELETE FROM knowledge_entries WHERE id = ?").bind(body.id).run();
    } else {
      result = await env.DB.prepare("DELETE FROM knowledge_entries WHERE slug = ?").bind(body.slug).run();
    }
    return jsonResponse4({ success: true, data: { deleted: result.meta?.changes || 0 } });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
async function handleUpdateRecipeCovers(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.covers || !Array.isArray(body.covers)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bcovers\u6570\u7EC4 [{slug, cover_url}]" }, 400);
  const results = [];
  let updated = 0;
  let skipped = 0;
  for (const item of body.covers) {
    if (!item.slug || !item.cover_url) {
      results.push(`\u8DF3\u8FC7\u65E0\u6548\u6761\u76EE: ${item.slug || "no-slug"}`);
      skipped++;
      continue;
    }
    try {
      const existing = await env.DB.prepare("SELECT id FROM recipes WHERE slug = ?").bind(item.slug).first();
      if (existing) {
        await env.DB.prepare("UPDATE recipes SET cover_url = ? WHERE slug = ?").bind(item.cover_url, item.slug).run();
        results.push(`\u66F4\u65B0: ${item.slug} -> ${item.cover_url}`);
        updated++;
      } else {
        results.push(`\u8DF3\u8FC7(\u4E0D\u5B58\u5728): ${item.slug}`);
        skipped++;
      }
    } catch (err) {
      results.push(`\u9519\u8BEF: ${item.slug} - ${err.message}`);
      skipped++;
    }
  }
  return jsonResponse4({ success: true, data: { updated, skipped, details: results } });
}
async function handleResetRecipes(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  try {
    await env.DB.prepare("DELETE FROM recipe_ingredients").run();
    await env.DB.prepare("DELETE FROM recipe_steps").run();
    await env.DB.prepare("DELETE FROM recipe_tags").run();
    await env.DB.prepare("DELETE FROM recipe_methods").run();
    await env.DB.prepare("DELETE FROM recipe_regions").run();
    await env.DB.prepare("DELETE FROM recipes").run();
    return jsonResponse4({ success: true, data: { message: "All recipe data deleted" } });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
async function handleImportRecipes(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.recipes || !Array.isArray(body.recipes)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Brecipes\u6570\u7EC4" }, 400);
  const results = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const recipe of body.recipes) {
    if (!recipe.title || !recipe.slug) {
      results.push({ title: recipe.title || "\u672A\u77E5", status: "skipped", message: "\u7F3A\u5C11title\u6216slug" });
      skipped++;
      continue;
    }
    try {
      let cuisineId = null;
      const cuisineName = typeof recipe.cuisine === "string" ? recipe.cuisine : recipe.cuisine?.name;
      if (cuisineName) {
        const c = await env.DB.prepare("SELECT id FROM cuisines WHERE name = ?").bind(cuisineName).first();
        if (c) cuisineId = c.id;
      }
      const existing = await env.DB.prepare("SELECT id FROM recipes WHERE slug = ?").bind(recipe.slug).first();
      let recipeId;
      if (existing) {
        await env.DB.prepare(
          "UPDATE recipes SET title = ?, description = ?, difficulty = ?, cook_time = ?, servings = ?, calories = ?, cuisine_id = ?, cover_url = ?, nutrition = ?, common_mistakes = ?, success_tips = ?, ingredient_substitutes = ?, suitable_for = ?, required_tools = ? WHERE slug = ?"
        ).bind(
          recipe.title,
          recipe.description || "",
          recipe.difficulty || "easy",
          recipe.cookTime || recipe.cook_time || 0,
          recipe.servings || 2,
          recipe.calories || 0,
          cuisineId,
          recipe.cover_url || recipe.cover?.url || null,
          recipe.nutrition || "",
          recipe.common_mistakes || "",
          recipe.success_tips || "",
          recipe.ingredient_substitutes || "",
          recipe.suitable_for || "",
          recipe.required_tools || "",
          recipe.slug
        ).run();
        recipeId = existing.id;
        await env.DB.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(recipeId).run();
        await env.DB.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").bind(recipeId).run();
        await env.DB.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(recipeId).run();
        await env.DB.prepare("DELETE FROM recipe_methods WHERE recipe_id = ?").bind(recipeId).run();
        await env.DB.prepare("DELETE FROM recipe_regions WHERE recipe_id = ?").bind(recipeId).run();
        updated++;
      } else {
        const result = await env.DB.prepare(
          "INSERT INTO recipes (title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url, nutrition, common_mistakes, success_tips, ingredient_substitutes, suitable_for, required_tools, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING id"
        ).bind(
          recipe.title,
          recipe.slug,
          recipe.description || "",
          recipe.difficulty || "easy",
          recipe.cookTime || recipe.cook_time || 0,
          recipe.servings || 2,
          recipe.calories || 0,
          cuisineId,
          recipe.cover_url || recipe.cover?.url || null,
          recipe.nutrition || "",
          recipe.common_mistakes || "",
          recipe.success_tips || "",
          recipe.ingredient_substitutes || "",
          recipe.suitable_for || "",
          recipe.required_tools || ""
        ).first();
        recipeId = result.id;
        inserted++;
      }
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        for (let i = 0; i < recipe.ingredients.length; i++) {
          const ing = recipe.ingredients[i];
          await env.DB.prepare(
            "INSERT INTO recipe_ingredients (recipe_id, name, amount, sort_order) VALUES (?, ?, ?, ?)"
          ).bind(recipeId, ing.name, ing.amount || "", i + 1).run();
        }
      }
      if (recipe.steps && recipe.steps.length > 0) {
        for (const step of recipe.steps) {
          const stepNum = step.stepNumber || step.step_number || 0;
          const stepText = step.description || step.text || "";
          await env.DB.prepare(
            "INSERT INTO recipe_steps (recipe_id, step_number, text) VALUES (?, ?, ?)"
          ).bind(recipeId, stepNum, stepText).run();
        }
      }
      if (recipe.tags && recipe.tags.length > 0) {
        for (const t of recipe.tags) {
          const tagName = typeof t === "string" ? t : t.name;
          const tagRow = await env.DB.prepare("SELECT id FROM tags WHERE name = ?").bind(tagName).first();
          if (tagRow) {
            await env.DB.prepare("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(recipeId, tagRow.id).run();
          }
        }
      }
      if (recipe.methods && recipe.methods.length > 0) {
        for (const m of recipe.methods) {
          const methodName = typeof m === "string" ? m : m.name;
          const methodRow = await env.DB.prepare("SELECT id FROM methods WHERE name = ?").bind(methodName).first();
          if (methodRow) {
            await env.DB.prepare("INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)").bind(recipeId, methodRow.id).run();
          }
        }
      }
      if (recipe.regions && recipe.regions.length > 0) {
        for (const r of recipe.regions) {
          const regionName = typeof r === "string" ? r : r.name;
          const regionRow = await env.DB.prepare("SELECT id FROM regions WHERE name = ?").bind(regionName).first();
          if (regionRow) {
            await env.DB.prepare("INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)").bind(recipeId, regionRow.id).run();
          }
        }
      }
      results.push({ title: recipe.title, status: existing ? "updated" : "inserted", id: recipeId });
    } catch (err) {
      results.push({ title: recipe.title, status: "error", message: err.message });
      skipped++;
    }
  }
  return jsonResponse4({ success: true, data: { inserted, updated, skipped, details: results } });
}
async function handleImportIngredients(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.ingredients || !Array.isArray(body.ingredients)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bingredients\u6570\u7EC4" }, 400);
  const results = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  for (const ing of body.ingredients) {
    if (!ing.name || !ing.slug) {
      results.push({ name: ing.name || "\u672A\u77E5", status: "skipped", message: "\u7F3A\u5C11name\u6216slug" });
      skipped++;
      continue;
    }
    try {
      const existing = await env.DB.prepare("SELECT id FROM ingredients WHERE slug = ?").bind(ing.slug).first();
      if (existing) {
        await env.DB.prepare(
          "UPDATE ingredients SET name = ?, category = ?, description = ?, image_url = ?, nutrition = ?, tips = ?, aliases = ?, season = ?, origin = ?, storage_method = ?, pairing_suggestions = ?, avoid_with = ? WHERE slug = ?"
        ).bind(
          ing.name,
          ing.category || "ingredient",
          ing.description || "",
          ing.image_url || ing.imageUrl || "",
          ing.nutrition || "",
          ing.tips || "",
          ing.aliases || "",
          ing.season || "",
          ing.origin || "",
          ing.storageMethod || ing.storage_method || "",
          ing.pairingSuggestions || ing.pairing_suggestions || "",
          ing.avoidWith || ing.avoid_with || "",
          ing.slug
        ).run();
        updated++;
      } else {
        await env.DB.prepare(
          "INSERT INTO ingredients (name, slug, category, description, image_url, nutrition, tips, aliases, season, origin, storage_method, pairing_suggestions, avoid_with, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)"
        ).bind(
          ing.name,
          ing.slug,
          ing.category || "ingredient",
          ing.description || "",
          ing.image_url || ing.imageUrl || "",
          ing.nutrition || "",
          ing.tips || "",
          ing.aliases || "",
          ing.season || "",
          ing.origin || "",
          ing.storageMethod || ing.storage_method || "",
          ing.pairingSuggestions || ing.pairing_suggestions || "",
          ing.avoidWith || ing.avoid_with || ""
        ).run();
        inserted++;
      }
      results.push({ name: ing.name, status: existing ? "updated" : "inserted" });
    } catch (err) {
      results.push({ name: ing.name, status: "error", message: err.message });
      skipped++;
    }
  }
  return jsonResponse4({ success: true, data: { inserted, updated, skipped, details: results } });
}
async function handleDeleteIngredient2(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.slug && !body?.id) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bslug\u6216id" }, 400);
  try {
    let result;
    if (body.slug) {
      result = await env.DB.prepare("DELETE FROM ingredients WHERE slug = ?").bind(body.slug).run();
    } else {
      result = await env.DB.prepare("DELETE FROM ingredients WHERE id = ?").bind(body.id).run();
    }
    return jsonResponse4({ success: true, deleted: result.meta.changes });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteRecipe2(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.id && !body?.slug) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bid\u6216slug" }, 400);
  try {
    let recipeId = body.id;
    if (!recipeId && body.slug) {
      const row = await env.DB.prepare("SELECT id FROM recipes WHERE slug = ?").bind(body.slug).first();
      if (!row) return jsonResponse4({ success: false, error: "\u98DF\u8C31\u4E0D\u5B58\u5728" }, 404);
      recipeId = row.id;
    }
    await env.DB.prepare("DELETE FROM recipe_ingredients WHERE recipe_id = ?").bind(recipeId).run();
    await env.DB.prepare("DELETE FROM recipe_steps WHERE recipe_id = ?").bind(recipeId).run();
    await env.DB.prepare("DELETE FROM recipe_tags WHERE recipe_id = ?").bind(recipeId).run();
    await env.DB.prepare("DELETE FROM recipe_methods WHERE recipe_id = ?").bind(recipeId).run();
    await env.DB.prepare("DELETE FROM recipe_regions WHERE recipe_id = ?").bind(recipeId).run();
    await env.DB.prepare("DELETE FROM recipes WHERE id = ?").bind(recipeId).run();
    return jsonResponse4({ success: true, deleted: recipeId });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
async function handleDeleteTag2(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.id && !body?.slug) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bid\u6216slug" }, 400);
  try {
    let tagId = body.id;
    if (!tagId && body.slug) {
      const row = await env.DB.prepare("SELECT id FROM tags WHERE slug = ?").bind(body.slug).first();
      if (!row) return jsonResponse4({ success: false, error: "\u6807\u7B7E\u4E0D\u5B58\u5728" }, 404);
      tagId = row.id;
    }
    await env.DB.prepare("DELETE FROM recipe_tags WHERE tag_id = ?").bind(tagId).run();
    await env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(tagId).run();
    return jsonResponse4({ success: true, deleted: tagId });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
async function handleImportTags(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.tags || !Array.isArray(body.tags)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Btags\u6570\u7EC4" }, 400);
  const results = [];
  for (const t of body.tags) {
    if (!t.name || !t.slug) continue;
    try {
      const existing = await env.DB.prepare("SELECT id FROM tags WHERE slug = ?").bind(t.slug).first();
      if (existing) {
        await env.DB.prepare("UPDATE tags SET name = ?, icon = ? WHERE slug = ?").bind(t.name, t.icon || "", t.slug).run();
        results.push({ name: t.name, status: "updated", id: existing.id });
      } else {
        const maxId = await env.DB.prepare("SELECT MAX(id) as maxId FROM tags").first();
        const nextId = (maxId?.maxId || 0) + 1;
        await env.DB.prepare("INSERT INTO tags (id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)").bind(nextId, t.name, t.slug, t.icon || "", nextId).run();
        results.push({ name: t.name, status: "inserted", id: nextId });
      }
    } catch (err) {
      results.push({ name: t.name, status: "error", message: err.message });
    }
  }
  return jsonResponse4({ success: true, results });
}
async function handleImportCuisines(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.cuisines || !Array.isArray(body.cuisines)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bcuisines\u6570\u7EC4" }, 400);
  const results = [];
  for (const c of body.cuisines) {
    if (!c.name || !c.slug) continue;
    try {
      await env.DB.prepare("DELETE FROM cuisines WHERE slug = ?").bind(c.slug).run();
      const maxId = await env.DB.prepare("SELECT MAX(id) as maxId FROM cuisines").first();
      const nextId = c.id || (maxId?.maxId || 0) + 1;
      await env.DB.prepare("INSERT INTO cuisines (id, name, slug, description, cover_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)").bind(nextId, c.name, c.slug, c.description || "", c.cover_url || "", c.sort_order || nextId).run();
      results.push({ name: c.name, status: "inserted", id: nextId });
    } catch (err) {
      results.push({ name: c.name, status: "error", message: err.message });
    }
  }
  return jsonResponse4({ success: true, results });
}
async function handleImportRegions(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.regions || !Array.isArray(body.regions)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bregions\u6570\u7EC4 [{name}]" }, 400);
  const results = [];
  for (const r of body.regions) {
    if (!r.name) continue;
    try {
      const existing = await env.DB.prepare("SELECT id FROM regions WHERE name = ?").bind(r.name).first();
      if (existing) {
        results.push({ name: r.name, status: "exists", id: existing.id });
      } else {
        const result = await env.DB.prepare("INSERT INTO regions (name) VALUES (?) RETURNING id").bind(r.name).first();
        results.push({ name: r.name, status: "inserted", id: result.id });
      }
    } catch (err) {
      results.push({ name: r.name, status: "error", message: err.message });
    }
  }
  return jsonResponse4({ success: true, results });
}
async function handleImportMethods(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.methods || !Array.isArray(body.methods)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bmethods\u6570\u7EC4 [{name}]" }, 400);
  const results = [];
  for (const m of body.methods) {
    if (!m.name) continue;
    try {
      const existing = await env.DB.prepare("SELECT id FROM methods WHERE name = ?").bind(m.name).first();
      if (existing) {
        results.push({ name: m.name, status: "exists", id: existing.id });
      } else {
        const result = await env.DB.prepare("INSERT INTO methods (name) VALUES (?) RETURNING id").bind(m.name).first();
        results.push({ name: m.name, status: "inserted", id: result.id });
      }
    } catch (err) {
      results.push({ name: m.name, status: "error", message: err.message });
    }
  }
  return jsonResponse4({ success: true, results });
}
async function handleDeleteCuisine2(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.id && !body?.slug) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bid\u6216slug" }, 400);
  try {
    let cuisineId = body.id;
    if (!cuisineId && body.slug) {
      const row = await env.DB.prepare("SELECT id FROM cuisines WHERE slug = ?").bind(body.slug).first();
      if (!row) return jsonResponse4({ success: false, error: "\u83DC\u7CFB\u4E0D\u5B58\u5728" }, 404);
      cuisineId = row.id;
    }
    await env.DB.prepare("UPDATE recipes SET cuisine_id = NULL WHERE cuisine_id = ?").bind(cuisineId).run();
    await env.DB.prepare("DELETE FROM cuisines WHERE id = ?").bind(cuisineId).run();
    return jsonResponse4({ success: true, deleted: cuisineId });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
async function handleSyncRecipeClassifications(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.updates || !Array.isArray(body.updates)) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bupdates\u6570\u7EC4" }, 400);
  const results = [];
  for (const u of body.updates) {
    try {
      const recipe = await env.DB.prepare("SELECT id FROM recipes WHERE slug = ?").bind(u.recipeSlug).first();
      if (!recipe) {
        results.push({ slug: u.recipeSlug, status: "not_found" });
        continue;
      }
      const recipeId = recipe.id;
      if (u.cuisine !== void 0) {
        if (u.cuisine === "") {
          await env.DB.prepare("UPDATE recipes SET cuisine_id = NULL WHERE id = ?").bind(recipeId).run();
        } else {
          const c = await env.DB.prepare("SELECT id FROM cuisines WHERE name = ?").bind(u.cuisine).first();
          if (c) await env.DB.prepare("UPDATE recipes SET cuisine_id = ? WHERE id = ?").bind(c.id, recipeId).run();
        }
      }
      if (u.addTags && u.addTags.length > 0) {
        for (const tagName of u.addTags) {
          const t = await env.DB.prepare("SELECT id FROM tags WHERE name = ?").bind(tagName).first();
          if (t) await env.DB.prepare("INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)").bind(recipeId, t.id).run();
        }
      }
      if (u.removeTags && u.removeTags.length > 0) {
        for (const tagName of u.removeTags) {
          const t = await env.DB.prepare("SELECT id FROM tags WHERE name = ?").bind(tagName).first();
          if (t) await env.DB.prepare("DELETE FROM recipe_tags WHERE recipe_id = ? AND tag_id = ?").bind(recipeId, t.id).run();
        }
      }
      if (u.addRegions && u.addRegions.length > 0) {
        for (const regionName of u.addRegions) {
          const r = await env.DB.prepare("SELECT id FROM regions WHERE name = ?").bind(regionName).first();
          if (r) await env.DB.prepare("INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)").bind(recipeId, r.id).run();
        }
      }
      if (u.removeRegions && u.removeRegions.length > 0) {
        for (const regionName of u.removeRegions) {
          const r = await env.DB.prepare("SELECT id FROM regions WHERE name = ?").bind(regionName).first();
          if (r) await env.DB.prepare("DELETE FROM recipe_regions WHERE recipe_id = ? AND region_id = ?").bind(recipeId, r.id).run();
        }
      }
      if (u.addMethods && u.addMethods.length > 0) {
        for (const methodName of u.addMethods) {
          const m = await env.DB.prepare("SELECT id FROM methods WHERE name = ?").bind(methodName).first();
          if (m) await env.DB.prepare("INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)").bind(recipeId, m.id).run();
        }
      }
      if (u.removeMethods && u.removeMethods.length > 0) {
        for (const methodName of u.removeMethods) {
          const m = await env.DB.prepare("SELECT id FROM methods WHERE name = ?").bind(methodName).first();
          if (m) await env.DB.prepare("DELETE FROM recipe_methods WHERE recipe_id = ? AND method_id = ?").bind(recipeId, m.id).run();
        }
      }
      results.push({ slug: u.recipeSlug, status: "updated" });
    } catch (err) {
      results.push({ slug: u.recipeSlug, status: "error", message: err.message });
    }
  }
  return jsonResponse4({ success: true, results });
}
async function handleAdminSQL(request, env) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret") || request.headers.get("X-Admin-Secret") || "";
  if (secret !== "cmpy2024secret") return jsonResponse4({ success: false, error: "Unauthorized" }, 401);
  const body = await parseJson2(request);
  if (!body?.sql) return jsonResponse4({ success: false, error: "\u8BF7\u63D0\u4F9Bsql\u53C2\u6570" }, 400);
  try {
    const result = await env.DB.exec(body.sql);
    return jsonResponse4({ success: true, result });
  } catch (err) {
    return jsonResponse4({ success: false, error: err.message }, 500);
  }
}
export {
  index_default as default
};
