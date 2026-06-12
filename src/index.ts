import { handleContentRequest } from './content';
import { handleAdminInit } from './migrate';
import { handleAdminRequest } from './admin';
/**
 * Cloudflare Workers - 馋猫有谱 API
 * 包含用户认证、点赞、收藏、排行榜功能
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
  phone: string;
  birthday: string;
  created_at: string;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// ==================== 密码加密 ====================
async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${salt}:${hashHex}`;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hash === hashHex;
}

// ==================== 生成默认昵称 ====================
function generateDefaultNickname(): string {
  const prefixes = ['小馋猫', '贪吃猫', '干饭猫', '觅食猫', '吃货猫', '美味猫', '寻味猫', '品鲜猫'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}${num}`;
}

// ==================== JWT工具 ====================
function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
  const padded = str + '='.repeat((4 - (str.length % 4)) % 4);
  return atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
}

async function createToken(payload: { userId: number; email: string }, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', signature, encoder.encode(signingInput));
  const signatureHex = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
  const encodedSignature = base64UrlEncode(signatureHex);
  return `${signingInput}.${encodedSignature}`;
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

// ==================== 中间件 ====================
async function authenticateRequest(request: Request, env: Env): Promise<{ userId: number; email: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return await verifyToken(authHeader.substring(7), env.JWT_SECRET);
}

// ==================== CORS响应头 ====================
function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': 'https://chanmaoyoupu.com',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
  };
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

async function parseJson<T>(request: Request): Promise<T | null> {
  try { return await request.json(); } catch { return null; }
}

// ==================== 检查昵称 ====================
async function handleCheckNickname(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const nickname = url.searchParams.get('nickname');
  if (!nickname) return jsonResponse({ success: false, error: '请提供昵称' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM users WHERE nickname = ?').bind(nickname).first();
  return jsonResponse({ success: true, data: { available: !existing } });
}

// ==================== 注册 ====================
async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ email: string; password: string; nickname?: string; phone?: string; birthday?: string }>(request);
  
  if (!body?.email || !body?.password) return jsonResponse({ success: false, error: '邮箱和密码不能为空' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return jsonResponse({ success: false, error: '邮箱格式不正确' }, 400);
  if (body.password.length < 6) return jsonResponse({ success: false, error: '密码至少6位' }, 400);
  if (body.phone && !/^1\d{10}$/.test(body.phone)) return jsonResponse({ success: false, error: '手机号格式不正确' }, 400);
  if (body.birthday && !/^\d{4}-\d{2}-\d{2}$/.test(body.birthday)) return jsonResponse({ success: false, error: '生日格式应为YYYY-MM-DD' }, 400);
  
  const existingUser = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(body.email).first();
  if (existingUser) return jsonResponse({ success: false, error: '该邮箱已被注册' }, 400);
  
  let nickname: string;
  if (body.nickname) {
    const existingNickname = await env.DB.prepare('SELECT id FROM users WHERE nickname = ?').bind(body.nickname).first();
    if (existingNickname) return jsonResponse({ success: false, error: '该昵称已被使用，请换一个' }, 400);
    nickname = body.nickname;
  } else {
    let attempts = 0;
    nickname = generateDefaultNickname();
    while (attempts < 10) {
      const dup = await env.DB.prepare('SELECT id FROM users WHERE nickname = ?').bind(nickname).first();
      if (!dup) break;
      nickname = generateDefaultNickname();
      attempts++;
    }
  }
  
  const passwordHash = await hashPassword(body.password);
  const phone = body.phone || '';
  const birthday = body.birthday || '';
  
  try {
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, nickname, phone, birthday, role) VALUES (?, ?, ?, ?, ?, "user") RETURNING id, email, nickname, avatar_url, phone, birthday, role, created_at'
    ).bind(body.email, passwordHash, nickname, phone, birthday).first();
    
    const token = await createToken({ userId: result.id, email: result.email }, env.JWT_SECRET);
    return jsonResponse({
      success: true,
      data: {
        user: { id: result.id, email: result.email, nickname: result.nickname, avatar_url: result.avatar_url, phone: result.phone, birthday: result.birthday, role: (result as any).role || 'user' },
        token,
      },
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: '注册失败' }, 500);
  }
}

// ==================== 登录 ====================
async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ email: string; password: string }>(request);
  if (!body?.email || !body?.password) return jsonResponse({ success: false, error: '邮箱和密码不能为空' }, 400);
  
  // 尝试获取用户信息，如果role列不存在则自动迁移
  let user: any;
  try {
    user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first();
  } catch (err: any) {
    // role列不存在，执行迁移
    if (err.message?.includes('no such column') || err.message?.includes('role')) {
      await migrateRoleColumn(env);
      user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first();
    } else {
      throw err;
    }
  }
  if (!user) return jsonResponse({ success: false, error: '邮箱或密码错误' }, 401);
  
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) return jsonResponse({ success: false, error: '邮箱或密码错误' }, 401);
  
  const token = await createToken({ userId: user.id, email: user.email }, env.JWT_SECRET);
  return jsonResponse({
    success: true,
    data: {
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar_url: user.avatar_url, phone: user.phone || '', birthday: user.birthday || '', role: user.role || 'user' },
      token,
    },
  });
}

// ==================== 迁移：添加role字段 ====================
async function migrateRoleColumn(env: Env): Promise<void> {
  try {
    // 添加role列
    await env.DB.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"');
    // 将第一个注册的用户设为admin（焕军）
    await env.DB.prepare('UPDATE users SET role = "admin" WHERE id = (SELECT MIN(id) FROM users)').run();
  } catch (err: any) {
    // 忽略已存在的错误
    if (!err.message?.includes('duplicate column name') && !err.message?.includes('already exists')) {
      throw err;
    }
  }
}

// ==================== 获取当前用户 ====================
async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse({ success: false, error: '未登录' }, 401);
  let user: any;
  try {
    user = await env.DB.prepare('SELECT id, email, nickname, avatar_url, phone, birthday, role, created_at FROM users WHERE id = ?').bind(auth.userId).first();
  } catch (err: any) {
    if (err.message?.includes('no such column') || err.message?.includes('role')) {
      await migrateRoleColumn(env);
      user = await env.DB.prepare('SELECT id, email, nickname, avatar_url, phone, birthday, role, created_at FROM users WHERE id = ?').bind(auth.userId).first();
    } else { throw err; }
  }
  if (!user) return jsonResponse({ success: false, error: '用户不存在' }, 404);
  return jsonResponse({ success: true, data: { ...user, role: user.role || 'user' } });
}

// ==================== 更新用户信息 ====================
async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse({ success: false, error: '未登录' }, 401);
  
  const body = await parseJson<{ nickname?: string; avatar_url?: string; phone?: string; birthday?: string }>(request);
  const updates: string[] = [];
  const values: any[] = [];
  
  if (body?.nickname) {
    const dup = await env.DB.prepare('SELECT id FROM users WHERE nickname = ? AND id != ?').bind(body.nickname, auth.userId).first();
    if (dup) return jsonResponse({ success: false, error: '该昵称已被使用，请换一个' }, 400);
    updates.push('nickname = ?'); values.push(body.nickname);
  }
  if (body?.avatar_url) { updates.push('avatar_url = ?'); values.push(body.avatar_url); }
  if (body?.phone !== undefined) { updates.push('phone = ?'); values.push(body.phone); }
  if (body?.birthday !== undefined) { updates.push('birthday = ?'); values.push(body.birthday); }
  
  if (updates.length === 0) return jsonResponse({ success: false, error: '没有需要更新的字段' }, 400);
  values.push(auth.userId);
  await env.DB.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
  const user = await env.DB.prepare('SELECT id, email, nickname, avatar_url, phone, birthday, created_at FROM users WHERE id = ?').bind(auth.userId).first();
  return jsonResponse({ success: true, data: user });
}



// ==================== 修改密码 ====================
async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse({ success: false, error: '未登录' }, 401);
  
  const body = await parseJson<{ old_password: string; new_password: string }>(request);
  if (!body?.old_password || !body?.new_password) return jsonResponse({ success: false, error: '请提供当前密码和新密码' }, 400);
  if (body.new_password.length < 6) return jsonResponse({ success: false, error: '新密码至少6位' }, 400);
  
  const user = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(auth.userId).first();
  if (!user) return jsonResponse({ success: false, error: '用户不存在' }, 404);
  
  const valid = await verifyPassword(body.old_password, user.password_hash as string);
  if (!valid) return jsonResponse({ success: false, error: '当前密码不正确' }, 400);
  
  const newHash = await hashPassword(body.new_password);
  await env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, auth.userId).run();
  return jsonResponse({ success: true, data: { success: true } });
}
// ==================== OAuth预留 ====================
async function handleOAuth(request: Request, env: Env, provider: string): Promise<Response> {
  if (!['wechat', 'douyin', 'kuaishou'].includes(provider)) return jsonResponse({ success: false, error: '不支持的OAuth提供商' }, 400);
  return jsonResponse({ success: false, error: `${provider} OAuth功能正在开发中`, data: { provider, status: 'pending' } });
}

// ==================== 点赞 ====================
async function handleLike(request: Request, env: Env, slug: string): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse({ success: false, error: '请先登录' }, 401);
  if (!slug) return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM likes WHERE user_id = ? AND recipe_slug = ?').bind(auth.userId, slug).first();
  if (existing) {
    await env.DB.prepare('DELETE FROM likes WHERE user_id = ? AND recipe_slug = ?').bind(auth.userId, slug).run();
  } else {
    await env.DB.prepare('INSERT INTO likes (user_id, recipe_slug) VALUES (?, ?)').bind(auth.userId, slug).run();
  }
  const { count } = await env.DB.prepare('SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?').bind(slug).first() as { count: number };
  return jsonResponse({ success: true, data: { liked: !existing, count } });
}

// ==================== 获取点赞 ====================
async function handleGetLikes(request: Request, env: Env, slug: string): Promise<Response> {
  if (!slug) return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  const { count } = await env.DB.prepare('SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?').bind(slug).first() as { count: number };
  let liked = false;
  const auth = await authenticateRequest(request, env);
  if (auth) { const e = await env.DB.prepare('SELECT id FROM likes WHERE user_id = ? AND recipe_slug = ?').bind(auth.userId, slug).first(); liked = !!e; }
  return jsonResponse({ success: true, data: { count, liked } });
}

// ==================== 收藏 ====================
async function handleFavorite(request: Request, env: Env, slug: string): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse({ success: false, error: '请先登录' }, 401);
  if (!slug) return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  const existing = await env.DB.prepare('SELECT id FROM favorites WHERE user_id = ? AND recipe_slug = ?').bind(auth.userId, slug).first();
  if (existing) {
    await env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND recipe_slug = ?').bind(auth.userId, slug).run();
  } else {
    await env.DB.prepare('INSERT INTO favorites (user_id, recipe_slug) VALUES (?, ?)').bind(auth.userId, slug).run();
  }
  const { count } = await env.DB.prepare('SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?').bind(slug).first() as { count: number };
  return jsonResponse({ success: true, data: { favorited: !existing, count } });
}

// ==================== 获取收藏 ====================
async function handleGetFavorites(request: Request, env: Env, slug: string): Promise<Response> {
  if (!slug) return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  const { count } = await env.DB.prepare('SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?').bind(slug).first() as { count: number };
  let favorited = false;
  const auth = await authenticateRequest(request, env);
  if (auth) { const e = await env.DB.prepare('SELECT id FROM favorites WHERE user_id = ? AND recipe_slug = ?').bind(auth.userId, slug).first(); favorited = !!e; }
  return jsonResponse({ success: true, data: { count, favorited } });
}

// ==================== 我的收藏 ====================
async function handleGetMyFavorites(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) return jsonResponse({ success: false, error: '请先登录' }, 401);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const offset = (page - 1) * limit;
  const favorites = await env.DB.prepare('SELECT recipe_slug, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(auth.userId, limit, offset).all();
  const { total } = await env.DB.prepare('SELECT COUNT(*) as total FROM favorites WHERE user_id = ?').bind(auth.userId).first() as { total: number };
  return jsonResponse({ success: true, data: { items: favorites.results, total, page, limit, pages: Math.ceil(total / limit) } });
}

// ==================== 排行榜 ====================
async function handleLikesRanking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const cuisine = url.searchParams.get('cuisine') || '';
  const region = url.searchParams.get('region') || '';
  const tag = url.searchParams.get('tag') || '';

  let query = 'SELECT l.recipe_slug, COUNT(*) as like_count FROM likes l';
  const conditions: string[] = [];
  const params: any[] = [];

  if (cuisine || region || tag) {
    query += ' JOIN recipes r ON l.recipe_slug = r.slug';
  }
  if (region) {
    query += ' JOIN recipe_regions rr ON r.id = rr.recipe_id JOIN regions rg ON rr.region_id = rg.id';
  }
  if (tag) {
    query += ' JOIN recipe_tags rt ON r.id = rt.recipe_id JOIN tags t ON rt.tag_id = t.id';
  }

  if (cuisine) {
    query += ' JOIN cuisines c ON r.cuisine_id = c.id';
    conditions.push('c.name = ?');
    params.push(cuisine);
  }
  if (region) {
    conditions.push('rg.name = ?');
    params.push(region);
  }
  if (tag) {
    conditions.push('t.name = ?');
    params.push(tag);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' GROUP BY l.recipe_slug ORDER BY like_count DESC LIMIT ?';
  params.push(limit);

  const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
  const ranking = await stmt.all();

  // Enrich with recipe metadata
  const enriched = await Promise.all(ranking.results.map(async (item: any) => {
    const recipe = await env.DB.prepare('SELECT r.id, r.title, r.slug, r.cover_url, r.difficulty, r.cook_time FROM recipes r WHERE r.slug = ?').bind(item.recipe_slug).first();
    let cuisineInfo = null;
    let regions: string[] = [];
    let tags: string[] = [];
    if (recipe) {
      const c = await env.DB.prepare('SELECT cu.name FROM cuisines cu WHERE cu.id = (SELECT cuisine_id FROM recipes WHERE id = ?)').bind(recipe.id).first();
      if (c) cuisineInfo = c.name;
      const rRes = await env.DB.prepare('SELECT rg.name FROM regions rg JOIN recipe_regions rr ON rg.id = rr.region_id WHERE rr.recipe_id = ?').bind(recipe.id).all();
      regions = rRes.results.map((x: any) => x.name);
      const tRes = await env.DB.prepare('SELECT tg.name FROM tags tg JOIN recipe_tags tt ON tg.id = tt.tag_id WHERE tt.recipe_id = ?').bind(recipe.id).all();
      tags = tRes.results.map((x: any) => x.name);
    }
    return { ...item, title: recipe?.title || '', cover_url: recipe?.cover_url || '', difficulty: recipe?.difficulty || '', cook_time: recipe?.cook_time || '', cuisine: cuisineInfo, regions, tags };
  }));

  return jsonResponse({ success: true, data: enriched });
}

async function handleFavoritesRanking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const cuisine = url.searchParams.get('cuisine') || '';
  const region = url.searchParams.get('region') || '';
  const tag = url.searchParams.get('tag') || '';

  let query = 'SELECT f.recipe_slug, COUNT(*) as favorite_count FROM favorites f';
  const conditions: string[] = [];
  const params: any[] = [];

  if (cuisine || region || tag) {
    query += ' JOIN recipes r ON f.recipe_slug = r.slug';
  }
  if (region) {
    query += ' JOIN recipe_regions rr ON r.id = rr.recipe_id JOIN regions rg ON rr.region_id = rg.id';
  }
  if (tag) {
    query += ' JOIN recipe_tags rt ON r.id = rt.recipe_id JOIN tags t ON rt.tag_id = t.id';
  }

  if (cuisine) {
    query += ' JOIN cuisines c ON r.cuisine_id = c.id';
    conditions.push('c.name = ?');
    params.push(cuisine);
  }
  if (region) {
    conditions.push('rg.name = ?');
    params.push(region);
  }
  if (tag) {
    conditions.push('t.name = ?');
    params.push(tag);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' GROUP BY f.recipe_slug ORDER BY favorite_count DESC LIMIT ?';
  params.push(limit);

  const stmt = params.length > 0 ? env.DB.prepare(query).bind(...params) : env.DB.prepare(query);
  const ranking = await stmt.all();

  const enriched = await Promise.all(ranking.results.map(async (item: any) => {
    const recipe = await env.DB.prepare('SELECT r.id, r.title, r.slug, r.cover_url, r.difficulty, r.cook_time FROM recipes r WHERE r.slug = ?').bind(item.recipe_slug).first();
    let cuisineInfo = null;
    let regions: string[] = [];
    let tags: string[] = [];
    if (recipe) {
      const c = await env.DB.prepare('SELECT cu.name FROM cuisines cu WHERE cu.id = (SELECT cuisine_id FROM recipes WHERE id = ?)').bind(recipe.id).first();
      if (c) cuisineInfo = c.name;
      const rRes = await env.DB.prepare('SELECT rg.name FROM regions rg JOIN recipe_regions rr ON rg.id = rr.region_id WHERE rr.recipe_id = ?').bind(recipe.id).all();
      regions = rRes.results.map((x: any) => x.name);
      const tRes = await env.DB.prepare('SELECT tg.name FROM tags tg JOIN recipe_tags tt ON tg.id = tt.tag_id WHERE tt.recipe_id = ?').bind(recipe.id).all();
      tags = tRes.results.map((x: any) => x.name);
    }
    return { ...item, title: recipe?.title || '', cover_url: recipe?.cover_url || '', difficulty: recipe?.difficulty || '', cook_time: recipe?.cook_time || '', cuisine: cuisineInfo, regions, tags };
  }));

  return jsonResponse({ success: true, data: enriched });
}

// ==================== 主入口 ====================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
    try {
      if (path === '/api/auth/check-nickname' && request.method === 'GET') return await handleCheckNickname(request, env);
      if (path === '/api/auth/register' && request.method === 'POST') return await handleRegister(request, env);
      if (path === '/api/auth/login' && request.method === 'POST') return await handleLogin(request, env);
      if (path === '/api/auth/me' && request.method === 'GET') return await handleGetMe(request, env);
      if (path === '/api/auth/profile' && request.method === 'PUT') return await handleUpdateProfile(request, env);
      if (path === '/api/auth/change-password' && request.method === 'POST') return await handleChangePassword(request, env);
      const oauthMatch = path.match(/^\/api\/oauth\/(\w+)$/);
      if (oauthMatch && request.method === 'POST') return await handleOAuth(request, env, oauthMatch[1]);
      const likeMatch = path.match(/^\/api\/recipes\/([^/]+)\/like$/);
      if (likeMatch && request.method === 'POST') return await handleLike(request, env, decodeURIComponent(likeMatch[1]));
      const getLikesMatch = path.match(/^\/api\/recipes\/([^/]+)\/likes$/);
      if (getLikesMatch && request.method === 'GET') return await handleGetLikes(request, env, decodeURIComponent(getLikesMatch[1]));
      const favoriteMatch = path.match(/^\/api\/recipes\/([^/]+)\/favorite$/);
      if (favoriteMatch && request.method === 'POST') return await handleFavorite(request, env, decodeURIComponent(favoriteMatch[1]));
      const getFavoritesMatch = path.match(/^\/api\/recipes\/([^/]+)\/favorites$/);
      if (getFavoritesMatch && request.method === 'GET') return await handleGetFavorites(request, env, decodeURIComponent(getFavoritesMatch[1]));
      if (path === '/api/users/me/favorites' && request.method === 'GET') return await handleGetMyFavorites(request, env);
      if (path === '/api/rankings/likes' && request.method === 'GET') return await handleLikesRanking(request, env);
      if (path === '/api/rankings/favorites' && request.method === 'GET') return await handleFavoritesRanking(request, env);
      if (path === '/api/health') return jsonResponse({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });

      // Admin batch import routes (legacy secret auth) - must come before JWT admin routes
      if (path === '/api/admin/import-knowledge' && request.method === 'POST') return await handleImportKnowledge(request, env);
      if (path === '/api/admin/delete-knowledge' && request.method === 'POST') return await handleDeleteKnowledge(request, env);
      if (path === '/api/admin/update-recipe-covers' && request.method === 'POST') return await handleUpdateRecipeCovers(request, env);
      if (path === '/api/admin/import-recipes' && request.method === 'POST') return await handleImportRecipes(request, env);
      if (path === '/api/admin/reset-recipes' && request.method === 'POST') return await handleResetRecipes(request, env);
      if (path === '/api/admin/import-ingredients' && request.method === 'POST') return await handleImportIngredients(request, env);
      if (path === '/api/admin/delete-ingredient' && request.method === 'POST') return await handleDeleteIngredient(request, env);
      if (path === '/api/admin/import-cuisines' && request.method === 'POST') return await handleImportCuisines(request, env);
      if (path === '/api/admin/import-tags' && request.method === 'POST') return await handleImportTags(request, env);
      if (path === '/api/admin/delete-recipe' && request.method === 'POST') return await handleDeleteRecipe(request, env);
      if (path === '/api/admin/delete-tag' && request.method === 'POST') return await handleDeleteTag(request, env);
      if (path === '/api/admin/import-regions' && request.method === 'POST') return await handleImportRegions(request, env);
      if (path === '/api/admin/import-methods' && request.method === 'POST') return await handleImportMethods(request, env);
      if (path === '/api/admin/delete-cuisine' && request.method === 'POST') return await handleDeleteCuisine(request, env);
      if (path === '/api/admin/sync-recipe-classifications' && request.method === 'POST') return await handleSyncRecipeClassifications(request, env);
      if (path === '/api/admin/init' && request.method === 'POST') return await handleAdminInit(request, env);
      if (path === '/api/admin/sql' && request.method === 'POST') return await handleAdminSQL(request, env);

      // Admin CRUD routes (JWT + role auth)
      const adminResponse = await handleAdminRequest(path, request, env);
      if (adminResponse) return adminResponse;

      // Content API routes
      if (path.startsWith('/api/content/')) {
        const contentResponse = await handleContentRequest(path, request, env);
        if (contentResponse) return contentResponse;
      }

      return jsonResponse({ success: false, error: '未找到该接口' }, 404);
    } catch (err: any) {
      console.error('API Error:', err);
      return jsonResponse({ success: false, error: '服务器内部错误' }, 500);
    }
  },
};

// ==================== 批量导入知识库 ====================
async function handleImportKnowledge(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await parseJson<{ entries: Array<{ id?: number; title: string; slug: string; category: string; content: string }> }>(request);
  if (!body?.entries || !Array.isArray(body.entries)) return jsonResponse({ success: false, error: '请提供entries数组' }, 400);

  const results: string[] = [];
  let inserted = 0;
  let skipped = 0;

  for (const entry of body.entries) {
    if (!entry.title || !entry.slug || !entry.category || !entry.content) {
      results.push(`跳过无效条目: ${entry.slug || 'no-slug'}`);
      skipped++;
      continue;
    }
    try {
      const existing = await env.DB.prepare('SELECT id FROM knowledge_entries WHERE slug = ?').bind(entry.slug).first();
      const author = entry.author || '';
      const isOriginal = entry.is_original ? 1 : 0;
      const publishedAt = entry.published_at || '';
      const summary = entry.summary || '';
      const keywords = entry.keywords || '';
      if (existing) {
        // Update existing
        await env.DB.prepare('UPDATE knowledge_entries SET title = ?, category = ?, content = ?, author = ?, is_original = ?, published_at = ?, summary = ?, keywords = ? WHERE slug = ?')
          .bind(entry.title, entry.category, entry.content, author, isOriginal, publishedAt, summary, keywords, entry.slug).run();
        results.push(`更新: ${entry.slug}`);
      } else {
        // Insert new
        await env.DB.prepare('INSERT INTO knowledge_entries (title, slug, category, content, author, is_original, published_at, summary, keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(entry.title, entry.slug, entry.category, entry.content, author, isOriginal, publishedAt, summary, keywords).run();
        results.push(`新增: ${entry.slug}`);
      }
      inserted++;
    } catch (err: any) {
      results.push(`错误: ${entry.slug} - ${err.message}`);
      skipped++;
    }
  }

  return jsonResponse({ success: true, data: { inserted, skipped, details: results } });
}


// ==================== 删除知识库条目 ====================
async function handleDeleteKnowledge(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await request.json() as { id?: number; slug?: string };
  if (!body.id && !body.slug) {
    return jsonResponse({ success: false, error: '请提供 id 或 slug' }, 400);
  }

  try {
    let result;
    if (body.id) {
      result = await env.DB.prepare('DELETE FROM knowledge_entries WHERE id = ?').bind(body.id).run();
    } else {
      result = await env.DB.prepare('DELETE FROM knowledge_entries WHERE slug = ?').bind(body.slug).run();
    }
    return jsonResponse({ success: true, data: { deleted: result.meta?.changes || 0 } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 批量更新食谱封面 ====================
async function handleUpdateRecipeCovers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await parseJson<{ covers: Array<{ slug: string; cover_url: string }> }>(request);
  if (!body?.covers || !Array.isArray(body.covers)) return jsonResponse({ success: false, error: '请提供covers数组 [{slug, cover_url}]' }, 400);

  const results: string[] = [];
  let updated = 0;
  let skipped = 0;

  for (const item of body.covers) {
    if (!item.slug || !item.cover_url) {
      results.push(`跳过无效条目: ${item.slug || 'no-slug'}`);
      skipped++;
      continue;
    }
    try {
      const existing = await env.DB.prepare('SELECT id FROM recipes WHERE slug = ?').bind(item.slug).first();
      if (existing) {
        await env.DB.prepare('UPDATE recipes SET cover_url = ? WHERE slug = ?').bind(item.cover_url, item.slug).run();
        results.push(`更新: ${item.slug} -> ${item.cover_url}`);
        updated++;
      } else {
        results.push(`跳过(不存在): ${item.slug}`);
        skipped++;
      }
    } catch (err: any) {
      results.push(`错误: ${item.slug} - ${err.message}`);
      skipped++;
    }
  }

  return jsonResponse({ success: true, data: { updated, skipped, details: results } });
}

// ==================== 重置食谱数据 ====================
async function handleResetRecipes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  try {
    // Delete all recipe-related data in correct order (respecting FK constraints)
    await env.DB.prepare('DELETE FROM recipe_ingredients').run();
    await env.DB.prepare('DELETE FROM recipe_steps').run();
    await env.DB.prepare('DELETE FROM recipe_tags').run();
    await env.DB.prepare('DELETE FROM recipe_methods').run();
    await env.DB.prepare('DELETE FROM recipe_regions').run();
    await env.DB.prepare('DELETE FROM recipes').run();
    return jsonResponse({ success: true, data: { message: 'All recipe data deleted' } });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 批量导入食谱 ====================
async function handleImportRecipes(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await parseJson<{ recipes: Array<any> }>(request);
  if (!body?.recipes || !Array.isArray(body.recipes)) return jsonResponse({ success: false, error: '请提供recipes数组' }, 400);

  const results: any[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const recipe of body.recipes) {
    if (!recipe.title || !recipe.slug) {
      results.push({ title: recipe.title || '未知', status: 'skipped', message: '缺少title或slug' });
      skipped++;
      continue;
    }
    try {
      // Resolve cuisine_id
      let cuisineId: number | null = null;
      const cuisineName = typeof recipe.cuisine === 'string' ? recipe.cuisine : recipe.cuisine?.name;
      if (cuisineName) {
        const c = await env.DB.prepare('SELECT id FROM cuisines WHERE name = ?').bind(cuisineName).first() as any;
        if (c) cuisineId = c.id;
      }

      const existing = await env.DB.prepare('SELECT id FROM recipes WHERE slug = ?').bind(recipe.slug).first() as any;
      let recipeId: number;

      if (existing) {
        // Update existing recipe
        await env.DB.prepare(
          'UPDATE recipes SET title = ?, description = ?, difficulty = ?, cook_time = ?, servings = ?, calories = ?, cuisine_id = ?, cover_url = ?, nutrition = ?, common_mistakes = ?, success_tips = ?, ingredient_substitutes = ?, suitable_for = ?, required_tools = ? WHERE slug = ?'
        ).bind(
          recipe.title,
          recipe.description || '',
          recipe.difficulty || 'easy',
          recipe.cookTime || recipe.cook_time || 0,
          recipe.servings || 2,
          recipe.calories || 0,
          cuisineId,
          recipe.cover_url || recipe.cover?.url || null,
          recipe.nutrition || '',
          recipe.common_mistakes || '',
          recipe.success_tips || '',
          recipe.ingredient_substitutes || '',
          recipe.suitable_for || '',
          recipe.required_tools || '',
          recipe.slug
        ).run();
        recipeId = existing.id;

        // Clean up old related data
        await env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(recipeId).run();
        await env.DB.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').bind(recipeId).run();
        await env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(recipeId).run();
        await env.DB.prepare('DELETE FROM recipe_methods WHERE recipe_id = ?').bind(recipeId).run();
        await env.DB.prepare('DELETE FROM recipe_regions WHERE recipe_id = ?').bind(recipeId).run();
        updated++;
      } else {
        // Insert new recipe
        const result = await env.DB.prepare(
          'INSERT INTO recipes (title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url, nutrition, common_mistakes, success_tips, ingredient_substitutes, suitable_for, required_tools, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1) RETURNING id'
        ).bind(
          recipe.title,
          recipe.slug,
          recipe.description || '',
          recipe.difficulty || 'easy',
          recipe.cookTime || recipe.cook_time || 0,
          recipe.servings || 2,
          recipe.calories || 0,
          cuisineId,
          recipe.cover_url || recipe.cover?.url || null,
          recipe.nutrition || '',
          recipe.common_mistakes || '',
          recipe.success_tips || '',
          recipe.ingredient_substitutes || '',
          recipe.suitable_for || '',
          recipe.required_tools || ''
        ).first() as any;
        recipeId = result.id;
        inserted++;
      }

      // Insert ingredients
      if (recipe.ingredients && recipe.ingredients.length > 0) {
        for (let i = 0; i < recipe.ingredients.length; i++) {
          const ing = recipe.ingredients[i];
          await env.DB.prepare(
            'INSERT INTO recipe_ingredients (recipe_id, name, amount, sort_order) VALUES (?, ?, ?, ?)'
          ).bind(recipeId, ing.name, ing.amount || '', i + 1).run();
        }
      }

      // Insert steps
      if (recipe.steps && recipe.steps.length > 0) {
        for (const step of recipe.steps) {
          const stepNum = step.stepNumber || step.step_number || 0;
          const stepText = step.description || step.text || '';
          await env.DB.prepare(
            'INSERT INTO recipe_steps (recipe_id, step_number, text) VALUES (?, ?, ?)'
          ).bind(recipeId, stepNum, stepText).run();
        }
      }

      // Insert tags (resolve by name)
      if (recipe.tags && recipe.tags.length > 0) {
        for (const t of recipe.tags) {
          const tagName = typeof t === 'string' ? t : t.name;
          const tagRow = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first() as any;
          if (tagRow) {
            await env.DB.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').bind(recipeId, tagRow.id).run();
          }
        }
      }

      // Insert methods (resolve by name)
      if (recipe.methods && recipe.methods.length > 0) {
        for (const m of recipe.methods) {
          const methodName = typeof m === 'string' ? m : m.name;
          const methodRow = await env.DB.prepare('SELECT id FROM methods WHERE name = ?').bind(methodName).first() as any;
          if (methodRow) {
            await env.DB.prepare('INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)').bind(recipeId, methodRow.id).run();
          }
        }
      }

      // Insert regions (resolve by name)
      if (recipe.regions && recipe.regions.length > 0) {
        for (const r of recipe.regions) {
          const regionName = typeof r === 'string' ? r : r.name;
          const regionRow = await env.DB.prepare('SELECT id FROM regions WHERE name = ?').bind(regionName).first() as any;
          if (regionRow) {
            await env.DB.prepare('INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)').bind(recipeId, regionRow.id).run();
          }
        }
      }

      results.push({ title: recipe.title, status: existing ? 'updated' : 'inserted', id: recipeId });
    } catch (err: any) {
      results.push({ title: recipe.title, status: 'error', message: err.message });
      skipped++;
    }
  }

  return jsonResponse({ success: true, data: { inserted, updated, skipped, details: results } });
}

// ==================== 批量导入食材调料 ====================
async function handleImportIngredients(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await parseJson<{ ingredients: Array<any> }>(request);
  if (!body?.ingredients || !Array.isArray(body.ingredients)) return jsonResponse({ success: false, error: '请提供ingredients数组' }, 400);

  const results: any[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  for (const ing of body.ingredients) {
    if (!ing.name || !ing.slug) {
      results.push({ name: ing.name || '未知', status: 'skipped', message: '缺少name或slug' });
      skipped++;
      continue;
    }
    try {
      const existing = await env.DB.prepare('SELECT id FROM ingredients WHERE slug = ?').bind(ing.slug).first() as any;
      if (existing) {
        await env.DB.prepare(
          'UPDATE ingredients SET name = ?, category = ?, description = ?, image_url = ?, nutrition = ?, tips = ?, aliases = ?, season = ?, origin = ?, storage_method = ?, pairing_suggestions = ?, avoid_with = ? WHERE slug = ?'
        ).bind(
          ing.name,
          ing.category || 'ingredient',
          ing.description || '',
          ing.image_url || ing.imageUrl || '',
          ing.nutrition || '',
          ing.tips || '',
          ing.aliases || '',
          ing.season || '',
          ing.origin || '',
          ing.storageMethod || ing.storage_method || '',
          ing.pairingSuggestions || ing.pairing_suggestions || '',
          ing.avoidWith || ing.avoid_with || '',
          ing.slug
        ).run();
        updated++;
      } else {
        await env.DB.prepare(
          'INSERT INTO ingredients (name, slug, category, description, image_url, nutrition, tips, aliases, season, origin, storage_method, pairing_suggestions, avoid_with, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
        ).bind(
          ing.name,
          ing.slug,
          ing.category || 'ingredient',
          ing.description || '',
          ing.image_url || ing.imageUrl || '',
          ing.nutrition || '',
          ing.tips || '',
          ing.aliases || '',
          ing.season || '',
          ing.origin || '',
          ing.storageMethod || ing.storage_method || '',
          ing.pairingSuggestions || ing.pairing_suggestions || '',
          ing.avoidWith || ing.avoid_with || ''
        ).run();
        inserted++;
      }
      results.push({ name: ing.name, status: existing ? 'updated' : 'inserted' });
    } catch (err: any) {
      results.push({ name: ing.name, status: 'error', message: err.message });
      skipped++;
    }
  }

  return jsonResponse({ success: true, data: { inserted, updated, skipped, details: results } });
}


async function handleDeleteIngredient(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await parseJson<{ slug?: string; id?: number }>(request);
  if (!body?.slug && !body?.id) return jsonResponse({ success: false, error: '请提供slug或id' }, 400);

  try {
    let result;
    if (body.slug) {
      result = await env.DB.prepare('DELETE FROM ingredients WHERE slug = ?').bind(body.slug).run();
    } else {
      result = await env.DB.prepare('DELETE FROM ingredients WHERE id = ?').bind(body.id).run();
    }
    return jsonResponse({ success: true, deleted: result.meta.changes });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}




// ==================== 删除单条食谱 ====================
async function handleDeleteRecipe(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ id?: number; slug?: string }>(request);
  if (!body?.id && !body?.slug) return jsonResponse({ success: false, error: '请提供id或slug' }, 400);
  try {
    let recipeId = body.id;
    if (!recipeId && body.slug) {
      const row = await env.DB.prepare('SELECT id FROM recipes WHERE slug = ?').bind(body.slug).first() as any;
      if (!row) return jsonResponse({ success: false, error: '食谱不存在' }, 404);
      recipeId = row.id;
    }
    // Delete related data first
    await env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(recipeId).run();
    await env.DB.prepare('DELETE FROM recipe_steps WHERE recipe_id = ?').bind(recipeId).run();
    await env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(recipeId).run();
    await env.DB.prepare('DELETE FROM recipe_methods WHERE recipe_id = ?').bind(recipeId).run();
    await env.DB.prepare('DELETE FROM recipe_regions WHERE recipe_id = ?').bind(recipeId).run();
    await env.DB.prepare('DELETE FROM recipes WHERE id = ?').bind(recipeId).run();
    return jsonResponse({ success: true, deleted: recipeId });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}


// ==================== 删除标签 ====================
async function handleDeleteTag(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ id?: number; slug?: string }>(request);
  if (!body?.id && !body?.slug) return jsonResponse({ success: false, error: '请提供id或slug' }, 400);
  try {
    let tagId = body.id;
    if (!tagId && body.slug) {
      const row = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(body.slug).first() as any;
      if (!row) return jsonResponse({ success: false, error: '标签不存在' }, 404);
      tagId = row.id;
    }
    await env.DB.prepare('DELETE FROM recipe_tags WHERE tag_id = ?').bind(tagId).run();
    await env.DB.prepare('DELETE FROM tags WHERE id = ?').bind(tagId).run();
    return jsonResponse({ success: true, deleted: tagId });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 批量导入标签 ====================
async function handleImportTags(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ tags: Array<{ name: string; slug: string; icon?: string }> }>(request);
  if (!body?.tags || !Array.isArray(body.tags)) return jsonResponse({ success: false, error: '请提供tags数组' }, 400);
  const results: any[] = [];
  for (const t of body.tags) {
    if (!t.name || !t.slug) continue;
    try {
      const existing = await env.DB.prepare('SELECT id FROM tags WHERE slug = ?').bind(t.slug).first() as any;
      if (existing) {
        await env.DB.prepare('UPDATE tags SET name = ?, icon = ? WHERE slug = ?').bind(t.name, t.icon || '', t.slug).run();
        results.push({ name: t.name, status: 'updated', id: existing.id });
      } else {
        const maxId = await env.DB.prepare('SELECT MAX(id) as maxId FROM tags').first() as any;
        const nextId = (maxId?.maxId || 0) + 1;
        await env.DB.prepare('INSERT INTO tags (id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)').bind(nextId, t.name, t.slug, t.icon || '', nextId).run();
        results.push({ name: t.name, status: 'inserted', id: nextId });
      }
    } catch (err: any) {
      results.push({ name: t.name, status: 'error', message: err.message });
    }
  }
  return jsonResponse({ success: true, results });
}

async function handleImportCuisines(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ cuisines: Array<{ id?: number; name: string; slug: string; description?: string; cover_url?: string; sort_order?: number }> }>(request);
  if (!body?.cuisines || !Array.isArray(body.cuisines)) return jsonResponse({ success: false, error: '请提供cuisines数组' }, 400);
  const results: any[] = [];
  for (const c of body.cuisines) {
    if (!c.name || !c.slug) continue;
    try {
      await env.DB.prepare('DELETE FROM cuisines WHERE slug = ?').bind(c.slug).run();
      const maxId = await env.DB.prepare('SELECT MAX(id) as maxId FROM cuisines').first() as any;
      const nextId = c.id || (maxId?.maxId || 0) + 1;
      await env.DB.prepare('INSERT INTO cuisines (id, name, slug, description, cover_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)').bind(nextId, c.name, c.slug, c.description || '', c.cover_url || '', c.sort_order || nextId).run();
      results.push({ name: c.name, status: 'inserted', id: nextId });
    } catch (err: any) {
      results.push({ name: c.name, status: 'error', message: err.message });
    }
  }
  return jsonResponse({ success: true, results });
}

// ==================== 批量导入地区 ====================
async function handleImportRegions(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ regions: Array<{ name: string }> }>(request);
  if (!body?.regions || !Array.isArray(body.regions)) return jsonResponse({ success: false, error: '请提供regions数组 [{name}]' }, 400);
  const results: any[] = [];
  for (const r of body.regions) {
    if (!r.name) continue;
    try {
      const existing = await env.DB.prepare('SELECT id FROM regions WHERE name = ?').bind(r.name).first() as any;
      if (existing) {
        results.push({ name: r.name, status: 'exists', id: existing.id });
      } else {
        const result = await env.DB.prepare('INSERT INTO regions (name) VALUES (?) RETURNING id').bind(r.name).first() as any;
        results.push({ name: r.name, status: 'inserted', id: result.id });
      }
    } catch (err: any) {
      results.push({ name: r.name, status: 'error', message: err.message });
    }
  }
  return jsonResponse({ success: true, results });
}

// ==================== 批量导入做法 ====================
async function handleImportMethods(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ methods: Array<{ name: string }> }>(request);
  if (!body?.methods || !Array.isArray(body.methods)) return jsonResponse({ success: false, error: '请提供methods数组 [{name}]' }, 400);
  const results: any[] = [];
  for (const m of body.methods) {
    if (!m.name) continue;
    try {
      const existing = await env.DB.prepare('SELECT id FROM methods WHERE name = ?').bind(m.name).first() as any;
      if (existing) {
        results.push({ name: m.name, status: 'exists', id: existing.id });
      } else {
        const result = await env.DB.prepare('INSERT INTO methods (name) VALUES (?) RETURNING id').bind(m.name).first() as any;
        results.push({ name: m.name, status: 'inserted', id: result.id });
      }
    } catch (err: any) {
      results.push({ name: m.name, status: 'error', message: err.message });
    }
  }
  return jsonResponse({ success: true, results });
}

// ==================== 删除菜系 ====================
async function handleDeleteCuisine(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{ id?: number; slug?: string }>(request);
  if (!body?.id && !body?.slug) return jsonResponse({ success: false, error: '请提供id或slug' }, 400);
  try {
    let cuisineId = body.id;
    if (!cuisineId && body.slug) {
      const row = await env.DB.prepare('SELECT id FROM cuisines WHERE slug = ?').bind(body.slug).first() as any;
      if (!row) return jsonResponse({ success: false, error: '菜系不存在' }, 404);
      cuisineId = row.id;
    }
    // Set recipes with this cuisine_id to NULL
    await env.DB.prepare('UPDATE recipes SET cuisine_id = NULL WHERE cuisine_id = ?').bind(cuisineId).run();
    // Delete the cuisine
    await env.DB.prepare('DELETE FROM cuisines WHERE id = ?').bind(cuisineId).run();
    return jsonResponse({ success: true, deleted: cuisineId });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}

// ==================== 同步食谱分类 ====================
async function handleSyncRecipeClassifications(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  const body = await parseJson<{
    updates: Array<{
      recipeSlug: string;
      cuisine?: string;
      addTags?: string[];
      removeTags?: string[];
      addRegions?: string[];
      removeRegions?: string[];
      addMethods?: string[];
      removeMethods?: string[];
    }>
  }>(request);
  if (!body?.updates || !Array.isArray(body.updates)) return jsonResponse({ success: false, error: '请提供updates数组' }, 400);
  const results: any[] = [];
  for (const u of body.updates) {
    try {
      const recipe = await env.DB.prepare('SELECT id FROM recipes WHERE slug = ?').bind(u.recipeSlug).first() as any;
      if (!recipe) { results.push({ slug: u.recipeSlug, status: 'not_found' }); continue; }
      const recipeId = recipe.id;
      // Update cuisine
      if (u.cuisine !== undefined) {
        if (u.cuisine === '') {
          await env.DB.prepare('UPDATE recipes SET cuisine_id = NULL WHERE id = ?').bind(recipeId).run();
        } else {
          const c = await env.DB.prepare('SELECT id FROM cuisines WHERE name = ?').bind(u.cuisine).first() as any;
          if (c) await env.DB.prepare('UPDATE recipes SET cuisine_id = ? WHERE id = ?').bind(c.id, recipeId).run();
        }
      }
      // Add tags
      if (u.addTags && u.addTags.length > 0) {
        for (const tagName of u.addTags) {
          const t = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first() as any;
          if (t) await env.DB.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').bind(recipeId, t.id).run();
        }
      }
      // Remove tags
      if (u.removeTags && u.removeTags.length > 0) {
        for (const tagName of u.removeTags) {
          const t = await env.DB.prepare('SELECT id FROM tags WHERE name = ?').bind(tagName).first() as any;
          if (t) await env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ? AND tag_id = ?').bind(recipeId, t.id).run();
        }
      }
      // Add regions
      if (u.addRegions && u.addRegions.length > 0) {
        for (const regionName of u.addRegions) {
          const r = await env.DB.prepare('SELECT id FROM regions WHERE name = ?').bind(regionName).first() as any;
          if (r) await env.DB.prepare('INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)').bind(recipeId, r.id).run();
        }
      }
      // Remove regions
      if (u.removeRegions && u.removeRegions.length > 0) {
        for (const regionName of u.removeRegions) {
          const r = await env.DB.prepare('SELECT id FROM regions WHERE name = ?').bind(regionName).first() as any;
          if (r) await env.DB.prepare('DELETE FROM recipe_regions WHERE recipe_id = ? AND region_id = ?').bind(recipeId, r.id).run();
        }
      }
      // Add methods
      if (u.addMethods && u.addMethods.length > 0) {
        for (const methodName of u.addMethods) {
          const m = await env.DB.prepare('SELECT id FROM methods WHERE name = ?').bind(methodName).first() as any;
          if (m) await env.DB.prepare('INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)').bind(recipeId, m.id).run();
        }
      }
      // Remove methods
      if (u.removeMethods && u.removeMethods.length > 0) {
        for (const methodName of u.removeMethods) {
          const m = await env.DB.prepare('SELECT id FROM methods WHERE name = ?').bind(methodName).first() as any;
          if (m) await env.DB.prepare('DELETE FROM recipe_methods WHERE recipe_id = ? AND method_id = ?').bind(recipeId, m.id).run();
        }
      }
      results.push({ slug: u.recipeSlug, status: 'updated' });
    } catch (err: any) {
      results.push({ slug: u.recipeSlug, status: 'error', message: err.message });
    }
  }
  return jsonResponse({ success: true, results });
}


// ==================== 执行SQL（临时管理接口） ====================
async function handleAdminSQL(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== 'cmpy2024secret') return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

  const body = await parseJson<{ sql: string }>(request);
  if (!body?.sql) return jsonResponse({ success: false, error: '请提供sql参数' }, 400);

  try {
    const result = await env.DB.exec(body.sql);
    return jsonResponse({ success: true, result });
  } catch (err: any) {
    return jsonResponse({ success: false, error: err.message }, 500);
  }
}
