/**
 * 馋猫有谱 - 管理后台 API
 * 包含权限系统、内容CRUD、分类管理、统计数据等
 */

import { D1Database } from '@cloudflare/workers-types';

// ==================== 类型定义 ====================
interface Env {
  DB: D1Database;
  JWT_SECRET: string;
}

interface User {
  id: number;
  email: string;
  nickname: string;
  avatar_url: string;
  role: string;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ==================== 工具函数 ====================
function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try { return await request.json(); } catch { return null; }
}

// ==================== JWT 验证 ====================
function base64UrlDecode(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function verifyToken(token: string, secret: string): Promise<{ userId: number; email: string } | null> {
  try {
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const signature = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const expectedBuffer = await crypto.subtle.sign('HMAC', signature, encoder.encode(signingInput));
    const expectedHex = Array.from(new Uint8Array(expectedBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const expectedEncoded = base64UrlEncode(expectedHex);
    if (encodedSignature !== expectedEncoded) return null;
    return JSON.parse(base64UrlDecode(encodedPayload));
  } catch { return null; }
}

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ==================== 管理员中间件 ====================
async function requireAdmin(request: Request, env: Env): Promise<{ user: User; error?: Response }> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null as any, error: jsonResponse({ success: false, error: '未登录' }, 401) };
  }
  
  const token = authHeader.substring(7);
  const payload = await verifyToken(token, env.JWT_SECRET);
  if (!payload) {
    return { user: null as any, error: jsonResponse({ success: false, error: '登录已过期，请重新登录' }, 401) };
  }
  
  const user = await env.DB.prepare('SELECT id, email, nickname, avatar_url, role FROM users WHERE id = ?').bind(payload.userId).first() as User | null;
  if (!user) {
    return { user: null as any, error: jsonResponse({ success: false, error: '用户不存在' }, 404) };
  }
  
  if (user.role !== 'admin') {
    return { user: null as any, error: jsonResponse({ success: false, error: '无权访问管理后台' }, 403) };
  }
  
  return { user, error: undefined };
}

// ==================== 统计数据 API ====================
async function handleGetStats(env: Env): Promise<Response> {
  const [recipes, ingredients, knowledge, cuisines, tags, users, likes, favorites] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM recipes').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM ingredients').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM knowledge_entries').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM cuisines').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM tags').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM users').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM likes').first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM favorites').first(),
  ]);
  
  // 获取最近7天新增数据
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [newRecipes, newUsers] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as count FROM recipes WHERE DATE(created_at) >= ?').bind(sevenDaysAgo).first(),
    env.DB.prepare('SELECT COUNT(*) as count FROM users WHERE DATE(created_at) >= ?').bind(sevenDaysAgo).first(),
  ]);
  
  return jsonResponse({
    success: true,
    data: {
      recipes: (recipes as any).count,
      ingredients: (ingredients as any).count,
      knowledge: (knowledge as any).count,
      cuisines: (cuisines as any).count,
      tags: (tags as any).count,
      users: (users as any).count,
      likes: (likes as any).count,
      favorites: (favorites as any).count,
      newRecipes7d: (newRecipes as any).count,
      newUsers7d: (newUsers as any).count,
    },
  });
}

// ==================== 食谱 CRUD ====================
async function handleGetRecipes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const keyword = url.searchParams.get('keyword') || '';
  const published = url.searchParams.get('published');
  
  const offset = (page - 1) * limit;
  
  let countQuery = 'SELECT COUNT(*) as count FROM recipes WHERE 1=1';
  let listQuery = `
    SELECT r.id, r.title, r.slug, r.description, r.difficulty, r.cook_time, 
           r.servings, r.calories, r.cover_url, r.published, r.created_at,
           c.name as cuisine_name
    FROM recipes r
    LEFT JOIN cuisines c ON r.cuisine_id = c.id
    WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (keyword) {
    countQuery += ' AND (r.title LIKE ? OR r.slug LIKE ? OR r.description LIKE ?)';
    listQuery += ' AND (r.title LIKE ? OR r.slug LIKE ? OR r.description LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  
  if (published !== null && published !== '') {
    countQuery += ' AND r.published = ?';
    listQuery += ' AND r.published = ?';
    params.push(published === '1' ? 1 : 0);
  }
  
  listQuery += ' ORDER BY r.id DESC LIMIT ? OFFSET ?';
  
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all(),
  ]);
  
  const total = (countResult as any).count;
  
  return jsonResponse({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

async function handleGetRecipeDetail(env: Env, id: number): Promise<Response> {
  const recipe = await env.DB.prepare(`
    SELECT id, title, slug, description, difficulty, cook_time, servings, 
           calories, cuisine_id, cover_url, nutrition, common_mistakes, 
           success_tips, ingredient_substitutes, suitable_for, required_tools, 
           published, created_at
    FROM recipes WHERE id = ?
  `).bind(id).first();
  
  if (!recipe) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
  
  // 获取关联数据
  const [ingredients, steps, tags, methods, regions] = await Promise.all([
    env.DB.prepare('SELECT id, name, amount, sort_order FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC').bind(id).all(),
    env.DB.prepare('SELECT id, step_number, text FROM recipe_steps WHERE recipe_id = ? ORDER BY step_number ASC').bind(id).all(),
    env.DB.prepare('SELECT t.id, t.name, t.slug FROM tags t JOIN recipe_tags rt ON t.id = rt.tag_id WHERE rt.recipe_id = ?').bind(id).all(),
    env.DB.prepare('SELECT m.id, m.name FROM methods m JOIN recipe_methods rm ON m.id = rm.method_id WHERE rm.recipe_id = ?').bind(id).all(),
    env.DB.prepare('SELECT r.id, r.name FROM regions r JOIN recipe_regions rr ON r.id = rr.region_id WHERE rr.recipe_id = ?').bind(id).all(),
  ]);
  
  return jsonResponse({
    success: true,
    data: {
      ...recipe,
      ingredients: ingredients.results,
      steps: steps.results,
      tags: tags.results,
      methods: methods.results,
      regions: regions.results,
    },
  });
}

async function handleCreateRecipe(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  if (!body.title || !body.slug) {
    return jsonResponse({ success: false, error: '标题和slug不能为空' }, 400);
  }
  
  // 检查slug是否已存在
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE slug = ?').bind(body.slug).first();
  if (existing) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO recipes (title, slug, description, difficulty, cook_time, servings, 
                          calories, cuisine_id, cover_url, nutrition, common_mistakes, 
                          success_tips, ingredient_substitutes, suitable_for, required_tools, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.title, body.slug, body.description || '', body.difficulty || 'easy',
      body.cook_time || 0, body.servings || 1, body.calories || 0,
      body.cuisine_id || null, body.cover_url || '', body.nutrition || '',
      body.common_mistakes || '', body.success_tips || '', body.ingredient_substitutes || '',
      body.suitable_for || '', body.required_tools || '', body.published ?? 1
    ).run();
    
    const recipeId = (result.meta as any).last_row_id;
    
    // 插入关联数据
    await insertRecipeRelations(env, recipeId, body);
    
    return jsonResponse({ success: true, data: { id: recipeId } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateRecipe(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
  
  // 如果修改了slug，检查新slug是否冲突
  if (body.slug) {
    const slugExists = await env.DB.prepare('SELECT id FROM recipes WHERE slug = ? AND id != ?').bind(body.slug, id).first();
    if (slugExists) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  }
  
  try {
    // 构建更新语句
    const updates: string[] = [];
    const values: any[] = [];
    
    const fields = ['title', 'slug', 'description', 'difficulty', 'cook_time', 'servings', 
                    'calories', 'cuisine_id', 'cover_url', 'nutrition', 'common_mistakes',
                    'success_tips', 'ingredient_substitutes', 'suitable_for', 'required_tools', 'published'];
    
    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(field === 'cuisine_id' ? (body[field] || null) : body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE recipes SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    // 如果有传入关联数据，更新关联表
    if (body.ingredients !== undefined || body.steps !== undefined || 
        body.tags !== undefined || body.methods !== undefined || 
        body.regions !== undefined) {
      await insertRecipeRelations(env, id, body, true);
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteRecipe(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
  
  try {
    // 删除关联数据
    await env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM recipe_methods WHERE recipe_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM recipe_regions WHERE recipe_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM likes WHERE recipe_slug = (SELECT slug FROM recipes WHERE id = ?)').bind(id).run();
    await env.DB.prepare('DELETE FROM favorites WHERE recipe_slug = (SELECT slug FROM recipes WHERE id = ?)').bind(id).run();
    
    // 删除食谱
    await env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(id).run();
    
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleToggleRecipePublish(env: Env, id: number, published: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM recipes WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
  
  await env.DB.prepare('UPDATE recipes SET published = ? WHERE id = ?').bind(published, id).run();
  return jsonResponse({ success: true, data: { id, published } });
}

// 插入食谱关联数据
async function insertRecipeRelations(env: Env, recipeId: number, data: any, replace: boolean = false): Promise<void> {
  if (replace) {
    // 先清理旧数据
    if (data.ingredients !== undefined) {
      await env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(recipeId).run();
    }
    if (data.steps !== undefined) {
      await env.DB.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').bind(recipeId).run();
    }
    if (data.tags !== undefined) {
      await env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(recipeId).run();
    }
    if (data.methods !== undefined) {
      await env.DB.prepare('DELETE FROM recipe_methods WHERE recipe_id = ?').bind(recipeId).run();
    }
    if (data.regions !== undefined) {
      await env.DB.prepare('DELETE FROM recipe_regions WHERE recipe_id = ?').bind(recipeId).run();
    }
  }
  
  // 插入食材
  if (data.ingredients && Array.isArray(data.ingredients)) {
    for (let i = 0; i < data.ingredients.length; i++) {
      const ing = data.ingredients[i];
      await env.DB.prepare(
        'INSERT INTO recipe_ingredients (recipe_id, name, amount, sort_order) VALUES (?, ?, ?, ?)'
      ).bind(recipeId, ing.name, ing.amount || '', ing.sort_order || i + 1).run();
    }
  }
  
  // 插入步骤
  if (data.steps && Array.isArray(data.steps)) {
    for (const step of data.steps) {
      await env.DB.prepare(
        'INSERT INTO recipe_steps (recipe_id, step_number, text) VALUES (?, ?, ?)'
      ).bind(recipeId, step.step_number || 0, step.text || '').run();
    }
  }
  
  // 插入标签
  if (data.tags && Array.isArray(data.tags)) {
    for (const tag of data.tags) {
      const tagId = tag.id || tag;
      if (tagId) {
        await env.DB.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').bind(recipeId, tagId).run();
      }
    }
  }
  
  // 插入做法
  if (data.methods && Array.isArray(data.methods)) {
    for (const method of data.methods) {
      const methodId = method.id || method;
      if (methodId) {
        await env.DB.prepare('INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)').bind(recipeId, methodId).run();
      }
    }
  }
  
  // 插入地区
  if (data.regions && Array.isArray(data.regions)) {
    for (const region of data.regions) {
      const regionId = region.id || region;
      if (regionId) {
        await env.DB.prepare('INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)').bind(recipeId, regionId).run();
      }
    }
  }
}

// ==================== 食材 CRUD ====================
async function handleGetIngredients(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const keyword = url.searchParams.get('keyword') || '';
  const category = url.searchParams.get('category') || '';
  
  const offset = (page - 1) * limit;
  
  let countQuery = 'SELECT COUNT(*) as count FROM ingredients WHERE 1=1';
  let listQuery = `
    SELECT id, name, slug, category, description, image_url, nutrition, 
           tips, aliases, season, origin, storage_method, pairing_suggestions, 
           avoid_with, published, created_at
    FROM ingredients WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (keyword) {
    countQuery += ' AND (name LIKE ? OR slug LIKE ? OR description LIKE ?)';
    listQuery += ' AND (name LIKE ? OR slug LIKE ? OR description LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  
  if (category) {
    countQuery += ' AND category = ?';
    listQuery += ' AND category = ?';
    params.push(category);
  }
  
  listQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all(),
  ]);
  
  const total = (countResult as any).count;
  
  return jsonResponse({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

async function handleGetIngredientDetail(env: Env, id: number): Promise<Response> {
  const ingredient = await env.DB.prepare(`
    SELECT id, name, slug, category, description, image_url, nutrition, 
           tips, aliases, season, origin, storage_method, pairing_suggestions, 
           avoid_with, published, created_at
    FROM ingredients WHERE id = ?
  `).bind(id).first();
  
  if (!ingredient) return jsonResponse({ success: false, error: '食材不存在' }, 404);
  
  return jsonResponse({ success: true, data: ingredient });
}

async function handleCreateIngredient(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name || !body?.slug) {
    return jsonResponse({ success: false, error: '名称和slug不能为空' }, 400);
  }
  
  const existing = await env.DB.prepare('SELECT id FROM ingredients WHERE slug = ?').bind(body.slug).first();
  if (existing) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO ingredients (name, slug, category, description, image_url, nutrition, 
                              tips, aliases, season, origin, storage_method, 
                              pairing_suggestions, avoid_with, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.name, body.slug, body.category || 'ingredient', body.description || '',
      body.image_url || '', body.nutrition || '', body.tips || '', body.aliases || '',
      body.season || '', body.origin || '', body.storage_method || '',
      body.pairing_suggestions || '', body.avoid_with || '', body.published ?? 1
    ).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateIngredient(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM ingredients WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '食材不存在' }, 404);
  
  if (body.slug) {
    const slugExists = await env.DB.prepare('SELECT id FROM ingredients WHERE slug = ? AND id != ?').bind(body.slug, id).first();
    if (slugExists) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  }
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    const fields = ['name', 'slug', 'category', 'description', 'image_url', 'nutrition',
                    'tips', 'aliases', 'season', 'origin', 'storage_method',
                    'pairing_suggestions', 'avoid_with', 'published'];
    
    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE ingredients SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteIngredient(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM ingredients WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '食材不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM ingredients WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 知识库 CRUD ====================
async function handleGetKnowledge(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const keyword = url.searchParams.get('keyword') || '';
  const category = url.searchParams.get('category') || '';
  
  const offset = (page - 1) * limit;
  
  let countQuery = 'SELECT COUNT(*) as count FROM knowledge_entries WHERE 1=1';
  let listQuery = `
    SELECT id, title, slug, category, content, author, is_original, 
           published_at, summary, keywords, published, created_at
    FROM knowledge_entries WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (keyword) {
    countQuery += ' AND (title LIKE ? OR slug LIKE ? OR summary LIKE ?)';
    listQuery += ' AND (title LIKE ? OR slug LIKE ? OR summary LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw, kw);
  }
  
  if (category) {
    countQuery += ' AND category = ?';
    listQuery += ' AND category = ?';
    params.push(category);
  }
  
  listQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all(),
  ]);
  
  const total = (countResult as any).count;
  
  return jsonResponse({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

async function handleGetKnowledgeDetail(env: Env, id: number): Promise<Response> {
  const entry = await env.DB.prepare(`
    SELECT id, title, slug, category, content, author, is_original, 
           published_at, summary, keywords, published, created_at
    FROM knowledge_entries WHERE id = ?
  `).bind(id).first();
  
  if (!entry) return jsonResponse({ success: false, error: '知识条目不存在' }, 404);
  
  return jsonResponse({ success: true, data: entry });
}

async function handleCreateKnowledge(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.title || !body?.slug) {
    return jsonResponse({ success: false, error: '标题和slug不能为空' }, 400);
  }
  
  const existing = await env.DB.prepare('SELECT id FROM knowledge_entries WHERE slug = ?').bind(body.slug).first();
  if (existing) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  
  try {
    const result = await env.DB.prepare(`
      INSERT INTO knowledge_entries (title, slug, category, content, author, is_original, 
                                     published_at, summary, keywords, published)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      body.title, body.slug, body.category || 'flavor', body.content || '',
      body.author || '', body.is_original || 0, body.published_at || '',
      body.summary || '', body.keywords || '', body.published ?? 1
    ).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateKnowledge(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM knowledge_entries WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '知识条目不存在' }, 404);
  
  if (body.slug) {
    const slugExists = await env.DB.prepare('SELECT id FROM knowledge_entries WHERE slug = ? AND id != ?').bind(body.slug, id).first();
    if (slugExists) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  }
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    const fields = ['title', 'slug', 'category', 'content', 'author', 'is_original',
                    'published_at', 'summary', 'keywords', 'published'];
    
    for (const field of fields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE knowledge_entries SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteKnowledge(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM knowledge_entries WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '知识条目不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM knowledge_entries WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 分类管理 - 菜系 ====================
async function handleGetCuisines(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === '1';
  
  let query = 'SELECT id, name, slug, description, cover_url, sort_order, created_at FROM cuisines';
  if (!all) query += ' WHERE id > 0';
  query += ' ORDER BY sort_order ASC, id ASC';
  
  const result = await env.DB.prepare(query).all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateCuisine(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name || !body?.slug) {
    return jsonResponse({ success: false, error: '名称和slug不能为空' }, 400);
  }
  
  const existing = await env.DB.prepare('SELECT id FROM cuisines WHERE slug = ?').bind(body.slug).first();
  if (existing) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  
  try {
    const maxSort = await env.DB.prepare('SELECT MAX(sort_order) as max_sort FROM cuisines').first() as any;
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    
    const result = await env.DB.prepare(`
      INSERT INTO cuisines (name, slug, description, cover_url, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).bind(body.name, body.slug, body.description || '', body.cover_url || '', sortOrder).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateCuisine(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM cuisines WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '菜系不存在' }, 404);
  
  if (body.slug) {
    const slugExists = await env.DB.prepare('SELECT id FROM cuisines WHERE slug = ? AND id != ?').bind(body.slug, id).first();
    if (slugExists) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  }
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    for (const field of ['name', 'slug', 'description', 'cover_url', 'sort_order']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE cuisines SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteCuisine(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM cuisines WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '菜系不存在' }, 404);
  
  try {
    // 将使用该菜系的食谱的cuisine_id设为NULL
    await env.DB.prepare('UPDATE recipes SET cuisine_id = NULL WHERE cuisine_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM cuisines WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 分类管理 - 标签 ====================
async function handleGetTags(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === '1';
  
  let query = 'SELECT id, name, slug, icon, sort_order, created_at FROM tags';
  if (!all) query += ' WHERE id > 0';
  query += ' ORDER BY sort_order ASC, id ASC';
  
  const result = await env.DB.prepare(query).all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateTag(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name || !body?.slug) {
    return jsonResponse({ success: false, error: '名称和slug不能为空' }, 400);
  }
  
  const existing = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(body.slug).first();
  if (existing) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  
  try {
    const maxSort = await env.DB.prepare('SELECT MAX(sort_order) as max_sort FROM tags').first() as any;
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    
    const result = await env.DB.prepare(`
      INSERT INTO tags (name, slug, icon, sort_order)
      VALUES (?, ?, ?, ?)
    `).bind(body.name, body.slug, body.icon || '', sortOrder).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateTag(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '标签不存在' }, 404);
  
  if (body.slug) {
    const slugExists = await env.DB.prepare('SELECT id FROM tags WHERE slug = ? AND id != ?').bind(body.slug, id).first();
    if (slugExists) return jsonResponse({ success: false, error: 'slug已存在' }, 400);
  }
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    for (const field of ['name', 'slug', 'icon', 'sort_order']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteTag(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM tags WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '标签不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM recipe_tags WHERE tag_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 分类管理 - 地区 ====================
async function handleGetRegions(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT id, name, created_at FROM regions ORDER BY id ASC').all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateRegion(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name) return jsonResponse({ success: false, error: '名称不能为空' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM regions WHERE name = ?').bind(body.name).first();
  if (existing) return jsonResponse({ success: false, error: '地区已存在' }, 400);
  
  try {
    const result = await env.DB.prepare('INSERT INTO regions (name) VALUES (?)').bind(body.name).run();
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id, name: body.name } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateRegion(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name) return jsonResponse({ success: false, error: '名称不能为空' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM regions WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '地区不存在' }, 404);
  
  const nameExists = await env.DB.prepare('SELECT id FROM regions WHERE name = ? AND id != ?').bind(body.name, id).first();
  if (nameExists) return jsonResponse({ success: false, error: '地区名称已存在' }, 400);
  
  try {
    await env.DB.prepare('UPDATE regions SET name = ? WHERE id = ?').bind(body.name, id).run();
    return jsonResponse({ success: true, data: { id, name: body.name } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteRegion(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM regions WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '地区不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM recipe_regions WHERE region_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM regions WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 分类管理 - 做法 ====================
async function handleGetMethods(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT id, name, created_at FROM methods ORDER BY id ASC').all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateMethod(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name) return jsonResponse({ success: false, error: '名称不能为空' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM methods WHERE name = ?').bind(body.name).first();
  if (existing) return jsonResponse({ success: false, error: '做法已存在' }, 400);
  
  try {
    const result = await env.DB.prepare('INSERT INTO methods (name) VALUES (?)').bind(body.name).run();
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id, name: body.name } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateMethod(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name) return jsonResponse({ success: false, error: '名称不能为空' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM methods WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '做法不存在' }, 404);
  
  const nameExists = await env.DB.prepare('SELECT id FROM methods WHERE name = ? AND id != ?').bind(body.name, id).first();
  if (nameExists) return jsonResponse({ success: false, error: '做法名称已存在' }, 400);
  
  try {
    await env.DB.prepare('UPDATE methods SET name = ? WHERE id = ?').bind(body.name, id).run();
    return jsonResponse({ success: true, data: { id, name: body.name } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteMethod(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM methods WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '做法不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM recipe_methods WHERE method_id = ?').bind(id).run();
    await env.DB.prepare('DELETE FROM methods WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 用户管理 ====================
async function handleGetUsers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const keyword = url.searchParams.get('keyword') || '';
  const role = url.searchParams.get('role') || '';
  
  const offset = (page - 1) * limit;
  
  let countQuery = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
  let listQuery = `
    SELECT id, email, nickname, avatar_url, phone, birthday, role, created_at
    FROM users WHERE 1=1
  `;
  
  const params: any[] = [];
  
  if (keyword) {
    countQuery += ' AND (email LIKE ? OR nickname LIKE ?)';
    listQuery += ' AND (email LIKE ? OR nickname LIKE ?)';
    const kw = `%${keyword}%`;
    params.push(kw, kw);
  }
  
  if (role) {
    countQuery += ' AND role = ?';
    listQuery += ' AND role = ?';
    params.push(role);
  }
  
  listQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
  
  const [countResult, listResult] = await Promise.all([
    env.DB.prepare(countQuery).bind(...params).first(),
    env.DB.prepare(listQuery).bind(...params, limit, offset).all(),
  ]);
  
  const total = (countResult as any).count;
  
  return jsonResponse({
    success: true,
    data: {
      items: listResult.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

async function handleUpdateUserRole(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.role || !['user', 'admin'].includes(body.role)) {
    return jsonResponse({ success: false, error: '角色不合法' }, 400);
  }
  
  const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '用户不存在' }, 404);
  
  try {
    await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id).run();
    return jsonResponse({ success: true, data: { id, role: body.role } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 运营配置 - 友情链接 ====================
async function handleGetFriendLinks(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === '1';
  
  let query = 'SELECT id, name, url, logo, description, sort_order, status, created_at FROM friend_links';
  if (!all) query += ' WHERE status = 1';
  query += ' ORDER BY sort_order ASC, id DESC';
  
  const result = await env.DB.prepare(query).all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateFriendLink(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name || !body?.url) {
    return jsonResponse({ success: false, error: '名称和链接不能为空' }, 400);
  }
  
  try {
    const maxSort = await env.DB.prepare('SELECT MAX(sort_order) as max_sort FROM friend_links').first() as any;
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    
    const result = await env.DB.prepare(`
      INSERT INTO friend_links (name, url, logo, description, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(body.name, body.url, body.logo || '', body.description || '', sortOrder, body.status ?? 1).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateFriendLink(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM friend_links WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '友情链接不存在' }, 404);
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    for (const field of ['name', 'url', 'logo', 'description', 'sort_order', 'status']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE friend_links SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteFriendLink(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM friend_links WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '友情链接不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM friend_links WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 运营配置 - 导航菜单 ====================
async function handleGetNavMenus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === '1';
  
  let query = 'SELECT id, name, link, sort_order, status, parent_id, created_at FROM nav_menus';
  if (!all) query += ' WHERE status = 1';
  query += ' ORDER BY sort_order ASC, id ASC';
  
  const result = await env.DB.prepare(query).all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateNavMenu(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.name || !body?.link) {
    return jsonResponse({ success: false, error: '名称和链接不能为空' }, 400);
  }
  
  try {
    const maxSort = await env.DB.prepare('SELECT MAX(sort_order) as max_sort FROM nav_menus').first() as any;
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    
    const result = await env.DB.prepare(`
      INSERT INTO nav_menus (name, link, sort_order, status, parent_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(body.name, body.link, sortOrder, body.status ?? 1, body.parent_id || 0).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateNavMenu(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM nav_menus WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '导航菜单不存在' }, 404);
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    for (const field of ['name', 'link', 'sort_order', 'status', 'parent_id']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE nav_menus SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteNavMenu(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM nav_menus WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '导航菜单不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM nav_menus WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 运营配置 - 首页推荐位 ====================
async function handleGetBanners(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const all = url.searchParams.get('all') === '1';
  
  let query = 'SELECT id, title, image_url, link, sort_order, status, created_at FROM home_banners';
  if (!all) query += ' WHERE status = 1';
  query += ' ORDER BY sort_order ASC, id DESC';
  
  const result = await env.DB.prepare(query).all();
  return jsonResponse({ success: true, data: result.results });
}

async function handleCreateBanner(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body?.title) {
    return jsonResponse({ success: false, error: '标题不能为空' }, 400);
  }
  
  try {
    const maxSort = await env.DB.prepare('SELECT MAX(sort_order) as max_sort FROM home_banners').first() as any;
    const sortOrder = body.sort_order ?? (maxSort?.max_sort || 0) + 1;
    
    const result = await env.DB.prepare(`
      INSERT INTO home_banners (title, image_url, link, sort_order, status)
      VALUES (?, ?, ?, ?, ?)
    `).bind(body.title, body.image_url || '', body.link || '', sortOrder, body.status ?? 1).run();
    
    return jsonResponse({ success: true, data: { id: (result.meta as any).last_row_id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleUpdateBanner(request: Request, env: Env, id: number): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  const existing = await env.DB.prepare('SELECT id FROM home_banners WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '推荐位不存在' }, 404);
  
  try {
    const updates: string[] = [];
    const values: any[] = [];
    
    for (const field of ['title', 'image_url', 'link', 'sort_order', 'status']) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }
    
    if (updates.length > 0) {
      values.push(id);
      await env.DB.prepare(`UPDATE home_banners SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    }
    
    return jsonResponse({ success: true, data: { id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

async function handleDeleteBanner(env: Env, id: number): Promise<Response> {
  const existing = await env.DB.prepare('SELECT id FROM home_banners WHERE id = ?').bind(id).first();
  if (!existing) return jsonResponse({ success: false, error: '推荐位不存在' }, 404);
  
  try {
    await env.DB.prepare('DELETE FROM home_banners WHERE id = ?').bind(id).run();
    return jsonResponse({ success: true, data: { deleted: id } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 运营配置 - 网站设置 ====================
async function handleGetSiteSettings(env: Env): Promise<Response> {
  const result = await env.DB.prepare('SELECT setting_key, setting_value FROM site_settings').all();
  
  const settings: Record<string, string> = {};
  result.results.forEach((item: any) => {
    settings[item.setting_key] = item.setting_value;
  });
  
  return jsonResponse({ success: true, data: settings });
}

async function handleUpdateSiteSettings(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<any>(request);
  if (!body) return jsonResponse({ success: false, error: '请求参数错误' }, 400);
  
  try {
    for (const [key, value] of Object.entries(body)) {
      if (typeof key === 'string') {
        const existing = await env.DB.prepare('SELECT id FROM site_settings WHERE setting_key = ?').bind(key).first();
        if (existing) {
          await env.DB.prepare('UPDATE site_settings SET setting_value = ?, updated_at = datetime(\'now\') WHERE setting_key = ?')
            .bind(String(value || ''), key).run();
        } else {
          await env.DB.prepare('INSERT INTO site_settings (setting_key, setting_value) VALUES (?, ?)')
            .bind(key, String(value || '')).run();
        }
      }
    }
    
    return jsonResponse({ success: true, data: { updated: true } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 效率工具 - 数据备份 ====================
async function handleExportBackup(env: Env): Promise<Response> {
  try {
    const tables = [
      'cuisines', 'tags', 'regions', 'methods',
      'recipes', 'recipe_ingredients', 'recipe_steps', 
      'recipe_tags', 'recipe_methods', 'recipe_regions',
      'knowledge_entries', 'ingredients',
      'friend_links', 'nav_menus', 'home_banners', 'site_settings'
    ];
    
    const data: Record<string, any[]> = {};
    
    for (const table of tables) {
      const result = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      data[table] = result.results;
    }
    
    const backup = {
      version: '1.0',
      export_time: new Date().toISOString(),
      tables: data
    };
    
    return new Response(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="chanmaoyoupu_backup_' + Date.now() + '.json"',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 路由分发 ====================
export async function handleAdminRequest(path: string, request: Request, env: Env): Promise<Response | null> {
  // 只处理 /api/admin/ 开头的路由
  if (!path.startsWith('/api/admin/')) return null;
  
  // OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }
  
  // 管理员认证中间件（登录接口除外）
  if (path !== '/api/admin/login') {
    const { error } = await requireAdmin(request, env);
    if (error) return error;
  }
  
  // 统计数据
  if (path === '/api/admin/stats' && request.method === 'GET') {
    return await handleGetStats(env);
  }
  
  // 食谱 CRUD
  if (path === '/api/admin/recipes' && request.method === 'GET') {
    return await handleGetRecipes(request, env);
  }
  if (path === '/api/admin/recipes' && request.method === 'POST') {
    return await handleCreateRecipe(request, env);
  }
  const recipeDetailMatch = path.match(/^\/api\/admin\/recipes\/(\d+)$/);
  if (recipeDetailMatch && request.method === 'GET') {
    return await handleGetRecipeDetail(env, parseInt(recipeDetailMatch[1]));
  }
  if (recipeDetailMatch && request.method === 'PUT') {
    return await handleUpdateRecipe(request, env, parseInt(recipeDetailMatch[1]));
  }
  if (recipeDetailMatch && request.method === 'DELETE') {
    return await handleDeleteRecipe(env, parseInt(recipeDetailMatch[1]));
  }
  
  // 食谱上下架
  const recipePublishMatch = path.match(/^\/api\/admin\/recipes\/(\d+)\/publish$/);
  if (recipePublishMatch && request.method === 'PUT') {
    const body = await parseJson<any>(request);
    return await handleToggleRecipePublish(env, parseInt(recipePublishMatch[1]), body?.published ? 1 : 0);
  }
  
  // 食材 CRUD
  if (path === '/api/admin/ingredients' && request.method === 'GET') {
    return await handleGetIngredients(request, env);
  }
  if (path === '/api/admin/ingredients' && request.method === 'POST') {
    return await handleCreateIngredient(request, env);
  }
  const ingredientDetailMatch = path.match(/^\/api\/admin\/ingredients\/(\d+)$/);
  if (ingredientDetailMatch && request.method === 'GET') {
    return await handleGetIngredientDetail(env, parseInt(ingredientDetailMatch[1]));
  }
  if (ingredientDetailMatch && request.method === 'PUT') {
    return await handleUpdateIngredient(request, env, parseInt(ingredientDetailMatch[1]));
  }
  if (ingredientDetailMatch && request.method === 'DELETE') {
    return await handleDeleteIngredient(env, parseInt(ingredientDetailMatch[1]));
  }
  
  // 知识库 CRUD
  if (path === '/api/admin/knowledge' && request.method === 'GET') {
    return await handleGetKnowledge(request, env);
  }
  if (path === '/api/admin/knowledge' && request.method === 'POST') {
    return await handleCreateKnowledge(request, env);
  }
  const knowledgeDetailMatch = path.match(/^\/api\/admin\/knowledge\/(\d+)$/);
  if (knowledgeDetailMatch && request.method === 'GET') {
    return await handleGetKnowledgeDetail(env, parseInt(knowledgeDetailMatch[1]));
  }
  if (knowledgeDetailMatch && request.method === 'PUT') {
    return await handleUpdateKnowledge(request, env, parseInt(knowledgeDetailMatch[1]));
  }
  if (knowledgeDetailMatch && request.method === 'DELETE') {
    return await handleDeleteKnowledge(env, parseInt(knowledgeDetailMatch[1]));
  }
  
  // 分类管理 - 菜系
  if (path === '/api/admin/cuisines' && request.method === 'GET') {
    return await handleGetCuisines(request, env);
  }
  if (path === '/api/admin/cuisines' && request.method === 'POST') {
    return await handleCreateCuisine(request, env);
  }
  const cuisineDetailMatch = path.match(/^\/api\/admin\/cuisines\/(\d+)$/);
  if (cuisineDetailMatch && request.method === 'PUT') {
    return await handleUpdateCuisine(request, env, parseInt(cuisineDetailMatch[1]));
  }
  if (cuisineDetailMatch && request.method === 'DELETE') {
    return await handleDeleteCuisine(env, parseInt(cuisineDetailMatch[1]));
  }
  
  // 分类管理 - 标签
  if (path === '/api/admin/tags' && request.method === 'GET') {
    return await handleGetTags(request, env);
  }
  if (path === '/api/admin/tags' && request.method === 'POST') {
    return await handleCreateTag(request, env);
  }
  const tagDetailMatch = path.match(/^\/api\/admin\/tags\/(\d+)$/);
  if (tagDetailMatch && request.method === 'PUT') {
    return await handleUpdateTag(request, env, parseInt(tagDetailMatch[1]));
  }
  if (tagDetailMatch && request.method === 'DELETE') {
    return await handleDeleteTag(env, parseInt(tagDetailMatch[1]));
  }
  
  // 分类管理 - 地区
  if (path === '/api/admin/regions' && request.method === 'GET') {
    return await handleGetRegions(env);
  }
  if (path === '/api/admin/regions' && request.method === 'POST') {
    return await handleCreateRegion(request, env);
  }
  const regionDetailMatch = path.match(/^\/api\/admin\/regions\/(\d+)$/);
  if (regionDetailMatch && request.method === 'PUT') {
    return await handleUpdateRegion(request, env, parseInt(regionDetailMatch[1]));
  }
  if (regionDetailMatch && request.method === 'DELETE') {
    return await handleDeleteRegion(env, parseInt(regionDetailMatch[1]));
  }
  
  // 分类管理 - 做法
  if (path === '/api/admin/methods' && request.method === 'GET') {
    return await handleGetMethods(env);
  }
  if (path === '/api/admin/methods' && request.method === 'POST') {
    return await handleCreateMethod(request, env);
  }
  const methodDetailMatch = path.match(/^\/api\/admin\/methods\/(\d+)$/);
  if (methodDetailMatch && request.method === 'PUT') {
    return await handleUpdateMethod(request, env, parseInt(methodDetailMatch[1]));
  }
  if (methodDetailMatch && request.method === 'DELETE') {
    return await handleDeleteMethod(env, parseInt(methodDetailMatch[1]));
  }
  
  // 用户管理
  if (path === '/api/admin/users' && request.method === 'GET') {
    return await handleGetUsers(request, env);
  }
  const userRoleMatch = path.match(/^\/api\/admin\/users\/(\d+)\/role$/);
  if (userRoleMatch && request.method === 'PUT') {
    return await handleUpdateUserRole(request, env, parseInt(userRoleMatch[1]));
  }
  
  // 友情链接
  if (path === '/api/admin/friend-links' && request.method === 'GET') {
    return await handleGetFriendLinks(request, env);
  }
  if (path === '/api/admin/friend-links' && request.method === 'POST') {
    return await handleCreateFriendLink(request, env);
  }
  const friendLinkMatch = path.match(/^\/api\/admin\/friend-links\/(\d+)$/);
  if (friendLinkMatch && request.method === 'PUT') {
    return await handleUpdateFriendLink(request, env, parseInt(friendLinkMatch[1]));
  }
  if (friendLinkMatch && request.method === 'DELETE') {
    return await handleDeleteFriendLink(env, parseInt(friendLinkMatch[1]));
  }
  
  // 导航菜单
  if (path === '/api/admin/nav-menus' && request.method === 'GET') {
    return await handleGetNavMenus(request, env);
  }
  if (path === '/api/admin/nav-menus' && request.method === 'POST') {
    return await handleCreateNavMenu(request, env);
  }
  const navMenuMatch = path.match(/^\/api\/admin\/nav-menus\/(\d+)$/);
  if (navMenuMatch && request.method === 'PUT') {
    return await handleUpdateNavMenu(request, env, parseInt(navMenuMatch[1]));
  }
  if (navMenuMatch && request.method === 'DELETE') {
    return await handleDeleteNavMenu(env, parseInt(navMenuMatch[1]));
  }
  
  // 首页推荐位
  if (path === '/api/admin/banners' && request.method === 'GET') {
    return await handleGetBanners(request, env);
  }
  if (path === '/api/admin/banners' && request.method === 'POST') {
    return await handleCreateBanner(request, env);
  }
  const bannerMatch = path.match(/^\/api\/admin\/banners\/(\d+)$/);
  if (bannerMatch && request.method === 'PUT') {
    return await handleUpdateBanner(request, env, parseInt(bannerMatch[1]));
  }
  if (bannerMatch && request.method === 'DELETE') {
    return await handleDeleteBanner(env, parseInt(bannerMatch[1]));
  }
  
  // 网站设置
  if (path === '/api/admin/settings/site' && request.method === 'GET') {
    return await handleGetSiteSettings(env);
  }
  if (path === '/api/admin/settings/site' && request.method === 'PUT') {
    return await handleUpdateSiteSettings(request, env);
  }
  
  // 数据备份
  if (path === '/api/admin/backup/export' && request.method === 'GET') {
    return await handleExportBackup(env);
  }
  
  // 未匹配到路由
  return null;
}
