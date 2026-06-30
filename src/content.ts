/**
 * 馋猫有谱 内容 API
 * 提供菜系、食谱、知识库、秘方等内容的读取接口
 * 供前端 Astro 构建时调用
 */

import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    },
  });
}

// ==================== 菜系 ====================
async function handleGetCuisines(env: Env): Promise<Response> {
  const results = await env.DB.prepare(
    'SELECT id, name, slug, description, cover_url FROM cuisines WHERE id > 0 ORDER BY sort_order ASC'
  ).all();
  // Transform to match Strapi-style response for frontend compatibility
  const items = results.results.map((c: any) => ({
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

async function handleGetCuisineBySlug(env: Env, slug: string): Promise<Response> {
  const cuisine = await env.DB.prepare(
    'SELECT id, name, slug, description, cover_url FROM cuisines WHERE slug = ?'
  ).bind(slug).first();
  if (!cuisine) return jsonResponse({ success: false, error: '菜系不存在' }, 404);
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

// ==================== 标签 ====================
async function handleGetTags(env: Env): Promise<Response> {
  const results = await env.DB.prepare(
    'SELECT id, name, slug, icon FROM tags WHERE id > 0 ORDER BY sort_order ASC'
  ).all();
  return jsonResponse({ success: true, data: results.results });
}

// ==================== 烹饪方法 ====================
async function handleGetMethods(env: Env): Promise<Response> {
  const results = await env.DB.prepare('SELECT id, name FROM methods').all();
  return jsonResponse({ success: true, data: results.results });
}

// ==================== 地区 ====================
async function handleGetRegions(env: Env): Promise<Response> {
  const results = await env.DB.prepare('SELECT id, name FROM regions').all();
  return jsonResponse({ success: true, data: results.results });
}

// ==================== 食谱 ====================
async function buildRecipeObject(env: Env, recipe: any): Promise<any> {
  const [ingredients, steps, tags, methods, regions] = await Promise.all([
    env.DB.prepare('SELECT name, amount FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC').bind(recipe.id).all(),
    env.DB.prepare('SELECT step_number, text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC').bind(recipe.id).all(),
    env.DB.prepare('SELECT t.id, t.name, t.slug, t.icon FROM tags t JOIN recipe_tags rt ON t.id = rt.tag_id WHERE rt.recipe_id = ?').bind(recipe.id).all(),
    env.DB.prepare('SELECT m.id, m.name FROM methods m JOIN recipe_methods rm ON m.id = rm.method_id WHERE rm.recipe_id = ?').bind(recipe.id).all(),
    env.DB.prepare('SELECT r.id, r.name FROM regions r JOIN recipe_regions rr ON r.id = rr.region_id WHERE rr.recipe_id = ?').bind(recipe.id).all(),
  ]);

  // Get cuisine info
  let cuisine = null;
  if (recipe.cuisine_id) {
    const c = await env.DB.prepare('SELECT name, slug FROM cuisines WHERE id = ?').bind(recipe.cuisine_id).first();
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
    methods: methods.results.map((m: any) => ({ name: m.name })),
    tags: tags.results.map((t: any) => ({ name: t.name, slug: t.slug, icon: t.icon })),
    regions: regions.results.map((r: any) => ({ name: r.name })),
    ingredients: ingredients.results.map((ing: any) => ({ name: ing.name, amount: ing.amount, isMain: true })),
    steps: steps.results.map((s: any) => ({ stepNumber: s.step_number, description: s.text })),
    cover: recipe.cover_url ? {
      url: recipe.cover_url,
      formats: { small: { url: recipe.cover_url } }
    } : null,
    nutrition: recipe.nutrition || '',
    common_mistakes: recipe.common_mistakes || '',
    success_tips: recipe.success_tips || '',
    ingredient_substitutes: recipe.ingredient_substitutes || '',
    suitable_for: recipe.suitable_for || '',
    required_tools: recipe.required_tools || ''
  };
}

async function handleGetRecipes(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = (page - 1) * limit;
  
  // 先获取总数
  const { total } = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM recipes WHERE published = 1'
  ).first() as { total: number };
  
  const results = await env.DB.prepare(
    'SELECT id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url, nutrition, common_mistakes, success_tips, ingredient_substitutes, suitable_for, required_tools FROM recipes WHERE published = 1 ORDER BY id DESC LIMIT ? OFFSET ?'
  ).bind(limit, offset).all();
  
  const items = await Promise.all(results.results.map((r: any) => buildRecipeObject(env, r)));
  return jsonResponse({ 
    success: true, 
    data: {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
}

async function handleGetRecipeBySlug(env: Env, slug: string): Promise<Response> {
  const recipe = await env.DB.prepare(
    'SELECT id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url, nutrition, common_mistakes, success_tips, ingredient_substitutes, suitable_for, required_tools FROM recipes WHERE slug = ? AND published = 1'
  ).bind(slug).first();
  if (!recipe) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
  const item = await buildRecipeObject(env, recipe);
  return jsonResponse({ success: true, data: item });
}

// ==================== 知识库 ====================
async function handleGetKnowledge(env: Env, category?: string): Promise<Response> {
  let query = 'SELECT id, title, slug, category, content, author, is_original, published_at, summary, keywords, created_at FROM knowledge_entries WHERE published = 1';
  const params: any[] = [];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY id DESC';
  
  const stmt = params.length > 0 
    ? env.DB.prepare(query).bind(...params) 
    : env.DB.prepare(query);
  const results = await stmt.all();
  
  const items = results.results.map((k: any) => ({
    id: k.id,
    title: k.title,
    slug: k.slug,
    category: k.category,
    content: k.content,
    author: k.author,
    is_original: k.is_original,
    published_at: k.published_at || k.created_at || '',
    summary: k.summary,
    keywords: k.keywords,
  }));
  return jsonResponse({ success: true, data: items });
}

async function handleGetKnowledgeBySlug(env: Env, slug: string): Promise<Response> {
  const entry = await env.DB.prepare(
    'SELECT id, title, slug, category, content, author, is_original, published_at, summary, keywords, created_at FROM knowledge_entries WHERE slug = ? AND published = 1'
  ).bind(slug).first();
  if (!entry) return jsonResponse({ success: false, error: '内容不存在' }, 404);
  // 兜底：如果published_at为空，用created_at
  if (entry && !entry.published_at && entry.created_at) {
    entry.published_at = entry.created_at;
  }
  return jsonResponse({ success: true, data: entry });
}

// ==================== 路由分发 ====================
export async function handleContentRequest(path: string, request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // GET /api/content/cuisines
  if (path === '/api/content/cuisines' && request.method === 'GET') {
    return await handleGetCuisines(env);
  }
  // GET /api/content/cuisines/:slug
  const cuisineMatch = path.match(/^\/api\/content\/cuisines\/([^/]+)$/);
  if (cuisineMatch && request.method === 'GET') {
    return await handleGetCuisineBySlug(env, decodeURIComponent(cuisineMatch[1]));
  }
  
  // GET /api/content/recipes
  if (path === '/api/content/recipes' && request.method === 'GET') {
    return await handleGetRecipes(env, request);
  }
  // GET /api/content/recipes/:slug
  const recipeMatch = path.match(/^\/api\/content\/recipes\/([^/]+)$/);
  if (recipeMatch && request.method === 'GET') {
    return await handleGetRecipeBySlug(env, decodeURIComponent(recipeMatch[1]));
  }
  
  // GET /api/content/knowledge
  if (path === '/api/content/knowledge' && request.method === 'GET') {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || undefined;
    return await handleGetKnowledge(env, category);
  }
  // GET /api/content/knowledge/:slug
  const knowledgeMatch = path.match(/^\/api\/content\/knowledge\/([^/]+)$/);
  if (knowledgeMatch && request.method === 'GET') {
    return await handleGetKnowledgeBySlug(env, decodeURIComponent(knowledgeMatch[1]));
  }
  
  // GET /api/content/secrets (knowledge with category=secret)
  if (path === '/api/content/secrets' && request.method === 'GET') {
    return await handleGetKnowledge(env, 'secret');
  }
  // GET /api/content/secrets/:slug
  const secretMatch = path.match(/^\/api\/content\/secrets\/([^/]+)$/);
  if (secretMatch && request.method === 'GET') {
    return await handleGetKnowledgeBySlug(env, decodeURIComponent(secretMatch[1]));
  }
  
  // GET /api/content/tags
  if (path === '/api/content/tags' && request.method === 'GET') {
    return await handleGetTags(env);
  }
  
  // GET /api/content/methods
  if (path === '/api/content/methods' && request.method === 'GET') {
    return await handleGetMethods(env);
  }
  
  // GET /api/content/regions
  if (path === '/api/content/regions' && request.method === 'GET') {
    return await handleGetRegions(env);
  }

  // GET /api/content/ingredients
  if (path === '/api/content/ingredients' && request.method === 'GET') {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || undefined;
    return await handleGetIngredients(env, category);
  }
  // GET /api/content/ingredients/:slug
  const ingredientMatch = path.match(/^\/api\/content\/ingredients\/([^/]+)$/);
  if (ingredientMatch && request.method === 'GET') {
    return await handleGetIngredientBySlug(env, decodeURIComponent(ingredientMatch[1]));
  }
  // GET /api/content/search
  if (path === '/api/content/search' && request.method === 'GET') {
    return await handleSearch(env, request);
  }
  // Not a content route - return null to let main handler continue
  return null as any;
}

// ==================== 食材调料 ====================
async function handleGetIngredients(env: Env, category?: string): Promise<Response> {
  let query = 'SELECT id, name, slug, category, description, image_url, nutrition, tips, aliases, season, origin, storage_method, pairing_suggestions, avoid_with FROM ingredients WHERE published = 1';
  const params: any[] = [];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY id DESC';
  
  const stmt = params.length > 0 
    ? env.DB.prepare(query).bind(...params) 
    : env.DB.prepare(query);
  const results = await stmt.all();
  
  const items = results.results.map((ing: any) => ({
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
  }));
  return jsonResponse({ success: true, data: items });
}

async function handleGetIngredientBySlug(env: Env, slug: string): Promise<Response> {
  const ing = await env.DB.prepare(
    'SELECT id, name, slug, category, description, image_url, nutrition, tips, aliases, season, origin, storage_method, pairing_suggestions, avoid_with FROM ingredients WHERE slug = ? AND published = 1'
  ).bind(slug).first();
  if (!ing) return jsonResponse({ success: false, error: '食材不存在' }, 404);
  
  // Find recipes that use this ingredient
  const recipes = await env.DB.prepare(
    'SELECT r.id, r.title, r.slug, r.difficulty, r.cook_time, r.cover_url FROM recipes r JOIN recipe_ingredients ri ON r.id = ri.recipe_id WHERE ri.name = ? AND r.published = 1 ORDER BY r.id ASC'
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
    relatedRecipes: recipes.results.map((r: any) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      difficulty: r.difficulty,
      cookTime: r.cook_time,
      cover: r.cover_url ? { url: r.cover_url, formats: { small: { url: r.cover_url } } } : null,
    })),
  };
  return jsonResponse({ success: true, data: item });
}

// ==================== 全站搜索 ====================
async function handleSearch(env: Env, request: Request): Promise<Response> {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || 'all'; // all, recipes, knowledge, secrets, ingredients
  
  if (!q || q.trim().length === 0) {
    return jsonResponse({ success: true, data: { recipes: [], knowledge: [], ingredients: [], total: 0 } });
  }
  
  const keyword = `%${q.trim()}%`;
  const results: any = { query: q, recipes: [], knowledge: [], ingredients: [], total: 0 };
  
  if (type === 'all' || type === 'recipes') {
    const recipes = await env.DB.prepare(
      'SELECT id, title, slug, description, difficulty, cook_time, cover_url FROM recipes WHERE (title LIKE ? OR description LIKE ?) AND published = 1 ORDER BY id ASC LIMIT 20'
    ).bind(keyword, keyword).all();
    results.recipes = recipes.results.map((r: any) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      description: r.description,
      difficulty: r.difficulty,
      cookTime: r.cook_time,
      cover: r.cover_url ? { url: r.cover_url, formats: { small: { url: r.cover_url } } } : null,
      type: 'recipe',
    }));
  }
  
  if (type === 'secrets') {
    const secrets = await env.DB.prepare(
      'SELECT id, title, slug, category FROM knowledge_entries WHERE (title LIKE ? OR content LIKE ?) AND published = 1 AND category = ? ORDER BY id ASC LIMIT 20'
    ).bind(keyword, keyword, 'secret').all();
    results.secrets = secrets.results.map((s: any) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      category: s.category,
      type: 'secret',
    }));
  }

  if (type === 'all' || type === 'knowledge') {
    const knowledge = await env.DB.prepare(
      'SELECT id, title, slug, category FROM knowledge_entries WHERE (title LIKE ? OR content LIKE ?) AND published = 1 AND category != ? ORDER BY id ASC LIMIT 20'
    ).bind(keyword, keyword, 'secret').all();

    const secrets = await env.DB.prepare(
      'SELECT id, title, slug, category FROM knowledge_entries WHERE (title LIKE ? OR content LIKE ?) AND published = 1 AND category = ? ORDER BY id ASC LIMIT 20'
    ).bind(keyword, keyword, 'secret').all();
    results.secrets = secrets.results.map((s: any) => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      category: s.category,
      type: 'secret',
    }));
    results.knowledge = knowledge.results.map((k: any) => ({
      id: k.id,
      title: k.title,
      slug: k.slug,
      category: k.category,
      type: 'knowledge',
    }));
  }
  
  if (type === 'all' || type === 'ingredients') {
    const ingredients = await env.DB.prepare(
      'SELECT id, name, slug, category, description, image_url FROM ingredients WHERE (name LIKE ? OR description LIKE ? OR aliases LIKE ?) AND published = 1 ORDER BY id ASC LIMIT 20'
    ).bind(keyword, keyword, keyword).all();
    results.ingredients = ingredients.results.map((ing: any) => ({
      id: ing.id,
      name: ing.name,
      slug: ing.slug,
      category: ing.category,
      description: ing.description,
      imageUrl: ing.image_url,
      type: 'ingredient',
    }));
  }
  
  results.total = results.recipes.length + results.knowledge.length + (results.secrets?.length || 0) + results.ingredients.length;
  return jsonResponse({ success: true, data: results });
}
