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
    } : null
  };
}

async function handleGetRecipes(env: Env): Promise<Response> {
  const results = await env.DB.prepare(
    'SELECT id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url FROM recipes WHERE published = 1 ORDER BY id ASC'
  ).all();
  
  const items = await Promise.all(results.results.map((r: any) => buildRecipeObject(env, r)));
  return jsonResponse({ success: true, data: items });
}

async function handleGetRecipeBySlug(env: Env, slug: string): Promise<Response> {
  const recipe = await env.DB.prepare(
    'SELECT id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url FROM recipes WHERE slug = ? AND published = 1'
  ).bind(slug).first();
  if (!recipe) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
  const item = await buildRecipeObject(env, recipe);
  return jsonResponse({ success: true, data: item });
}

// ==================== 知识库 ====================
async function handleGetKnowledge(env: Env, category?: string): Promise<Response> {
  let query = 'SELECT id, title, slug, category, content FROM knowledge_entries WHERE published = 1';
  const params: any[] = [];
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY id ASC';
  
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
  }));
  return jsonResponse({ success: true, data: items });
}

async function handleGetKnowledgeBySlug(env: Env, slug: string): Promise<Response> {
  const entry = await env.DB.prepare(
    'SELECT id, title, slug, category, content FROM knowledge_entries WHERE slug = ? AND published = 1'
  ).bind(slug).first();
  if (!entry) return jsonResponse({ success: false, error: '内容不存在' }, 404);
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
    return await handleGetRecipes(env);
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

  // Not a content route - return null to let main handler continue
  return null as any;
}
