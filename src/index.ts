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
  created_at: string;
}

interface ApiResponse {
  success: boolean;
  data?: any;
  error?: string;
}

// ==================== 密码加密 ====================
// 使用Web Crypto API进行SHA-256+salt加密
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
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
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
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const expectedSignatureBuffer = await crypto.subtle.sign('HMAC', signature, encoder.encode(signingInput));
    const expectedSignatureHex = Array.from(new Uint8Array(expectedSignatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    const expectedEncodedSignature = base64UrlEncode(expectedSignatureHex);
    
    if (encodedSignature !== expectedEncodedSignature) {
      return null;
    }
    
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    return payload;
  } catch {
    return null;
  }
}

// ==================== 中间件 ====================
async function authenticateRequest(request: Request, env: Env): Promise<{ userId: number; email: string } | null> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7);
  return await verifyToken(token, env.JWT_SECRET);
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
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(),
    },
  });
}

// ==================== 请求解析 ====================
async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ==================== 路由处理 ====================

// 注册
async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ email: string; password: string; nickname?: string }>(request);
  
  if (!body?.email || !body?.password) {
    return jsonResponse({ success: false, error: '邮箱和密码不能为空' }, 400);
  }
  
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return jsonResponse({ success: false, error: '邮箱格式不正确' }, 400);
  }
  
  if (body.password.length < 6) {
    return jsonResponse({ success: false, error: '密码至少6位' }, 400);
  }
  
  const existingUser = await env.DB.prepare(
    'SELECT id FROM users WHERE email = ?'
  ).bind(body.email).first();
  
  if (existingUser) {
    return jsonResponse({ success: false, error: '该邮箱已被注册' }, 400);
  }
  
  const passwordHash = await hashPassword(body.password);
  const nickname = body.nickname || body.email.split('@')[0];
  
  try {
    const result = await env.DB.prepare(
      'INSERT INTO users (email, password_hash, nickname) VALUES (?, ?, ?) RETURNING id, email, nickname, avatar_url, created_at'
    ).bind(body.email, passwordHash, nickname).first();
    
    const token = await createToken({ userId: result.id, email: result.email }, env.JWT_SECRET);
    
    return jsonResponse({
      success: true,
      data: {
        user: {
          id: result.id,
          email: result.email,
          nickname: result.nickname,
          avatar_url: result.avatar_url,
        },
        token,
      },
    });
  } catch (err: any) {
    return jsonResponse({ success: false, error: '注册失败' }, 500);
  }
}

// 登录
async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await parseJson<{ email: string; password: string }>(request);
  
  if (!body?.email || !body?.password) {
    return jsonResponse({ success: false, error: '邮箱和密码不能为空' }, 400);
  }
  
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE email = ?'
  ).bind(body.email).first();
  
  if (!user) {
    return jsonResponse({ success: false, error: '邮箱或密码错误' }, 401);
  }
  
  const valid = await verifyPassword(body.password, user.password_hash);
  if (!valid) {
    return jsonResponse({ success: false, error: '邮箱或密码错误' }, 401);
  }
  
  const token = await createToken({ userId: user.id, email: user.email }, env.JWT_SECRET);
  
  return jsonResponse({
    success: true,
    data: {
      user: {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
      },
      token,
    },
  });
}

// 获取当前用户信息
async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return jsonResponse({ success: false, error: '未登录' }, 401);
  }
  
  const user = await env.DB.prepare(
    'SELECT id, email, nickname, avatar_url, created_at FROM users WHERE id = ?'
  ).bind(auth.userId).first();
  
  if (!user) {
    return jsonResponse({ success: false, error: '用户不存在' }, 404);
  }
  
  return jsonResponse({ success: true, data: user });
}

// 更新用户信息
async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return jsonResponse({ success: false, error: '未登录' }, 401);
  }
  
  const body = await parseJson<{ nickname?: string; avatar_url?: string }>(request);
  
  const updates: string[] = [];
  const values: any[] = [];
  
  if (body?.nickname) {
    updates.push('nickname = ?');
    values.push(body.nickname);
  }
  if (body?.avatar_url) {
    updates.push('avatar_url = ?');
    values.push(body.avatar_url);
  }
  
  if (updates.length === 0) {
    return jsonResponse({ success: false, error: '没有需要更新的字段' }, 400);
  }
  
  values.push(auth.userId);
  
  await env.DB.prepare(
    `UPDATE users SET ${updates.join(', ')} WHERE id = ?`
  ).bind(...values).run();
  
  const user = await env.DB.prepare(
    'SELECT id, email, nickname, avatar_url, created_at FROM users WHERE id = ?'
  ).bind(auth.userId).first();
  
  return jsonResponse({ success: true, data: user });
}

// OAuth预留接口
async function handleOAuth(request: Request, env: Env, provider: string): Promise<Response> {
  const allowedProviders = ['wechat', 'douyin', 'kuaishou'];
  if (!allowedProviders.includes(provider)) {
    return jsonResponse({ success: false, error: '不支持的OAuth提供商' }, 400);
  }
  
  return jsonResponse({
    success: false,
    error: `${provider} OAuth功能正在开发中`,
    data: { provider, status: 'pending' },
  });
}

// 点赞/取消点赞
async function handleLike(request: Request, env: Env, slug: string): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return jsonResponse({ success: false, error: '请先登录' }, 401);
  }
  
  if (!slug) {
    return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  }
  
  const existing = await env.DB.prepare(
    'SELECT id FROM likes WHERE user_id = ? AND recipe_slug = ?'
  ).bind(auth.userId, slug).first();
  
  if (existing) {
    await env.DB.prepare(
      'DELETE FROM likes WHERE user_id = ? AND recipe_slug = ?'
    ).bind(auth.userId, slug).run();
    
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?'
    ).bind(slug).first() as { count: number };
    
    return jsonResponse({ success: true, data: { liked: false, count } });
  } else {
    await env.DB.prepare(
      'INSERT INTO likes (user_id, recipe_slug) VALUES (?, ?)'
    ).bind(auth.userId, slug).run();
    
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?'
    ).bind(slug).first() as { count: number };
    
    return jsonResponse({ success: true, data: { liked: true, count } });
  }
}

// 获取点赞数
async function handleGetLikes(request: Request, env: Env, slug: string): Promise<Response> {
  if (!slug) {
    return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  }
  
  const auth = await authenticateRequest(request, env);
  
  const { count } = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM likes WHERE recipe_slug = ?'
  ).bind(slug).first() as { count: number };
  
  let liked = false;
  if (auth) {
    const existing = await env.DB.prepare(
      'SELECT id FROM likes WHERE user_id = ? AND recipe_slug = ?'
    ).bind(auth.userId, slug).first();
    liked = !!existing;
  }
  
  return jsonResponse({ success: true, data: { count, liked } });
}

// 收藏/取消收藏
async function handleFavorite(request: Request, env: Env, slug: string): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return jsonResponse({ success: false, error: '请先登录' }, 401);
  }
  
  if (!slug) {
    return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  }
  
  const existing = await env.DB.prepare(
    'SELECT id FROM favorites WHERE user_id = ? AND recipe_slug = ?'
  ).bind(auth.userId, slug).first();
  
  if (existing) {
    await env.DB.prepare(
      'DELETE FROM favorites WHERE user_id = ? AND recipe_slug = ?'
    ).bind(auth.userId, slug).run();
    
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?'
    ).bind(slug).first() as { count: number };
    
    return jsonResponse({ success: true, data: { favorited: false, count } });
  } else {
    await env.DB.prepare(
      'INSERT INTO favorites (user_id, recipe_slug) VALUES (?, ?)'
    ).bind(auth.userId, slug).run();
    
    const { count } = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?'
    ).bind(slug).first() as { count: number };
    
    return jsonResponse({ success: true, data: { favorited: true, count } });
  }
}

// 获取收藏数
async function handleGetFavorites(request: Request, env: Env, slug: string): Promise<Response> {
  if (!slug) {
    return jsonResponse({ success: false, error: '缺少食谱slug' }, 400);
  }
  
  const auth = await authenticateRequest(request, env);
  
  const { count } = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM favorites WHERE recipe_slug = ?'
  ).bind(slug).first() as { count: number };
  
  let favorited = false;
  if (auth) {
    const existing = await env.DB.prepare(
      'SELECT id FROM favorites WHERE user_id = ? AND recipe_slug = ?'
    ).bind(auth.userId, slug).first();
    favorited = !!existing;
  }
  
  return jsonResponse({ success: true, data: { count, favorited } });
}

// 获取我的收藏列表
async function handleGetMyFavorites(request: Request, env: Env): Promise<Response> {
  const auth = await authenticateRequest(request, env);
  if (!auth) {
    return jsonResponse({ success: false, error: '请先登录' }, 401);
  }
  
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = parseInt(url.searchParams.get('limit') || '10');
  const offset = (page - 1) * limit;
  
  const favorites = await env.DB.prepare(
    'SELECT recipe_slug, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
  ).bind(auth.userId, limit, offset).all();
  
  const { total } = await env.DB.prepare(
    'SELECT COUNT(*) as total FROM favorites WHERE user_id = ?'
  ).bind(auth.userId).first() as { total: number };
  
  return jsonResponse({
    success: true,
    data: {
      items: favorites.results,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
}

// 点赞排行榜
async function handleLikesRanking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  
  const ranking = await env.DB.prepare(
    `SELECT recipe_slug, COUNT(*) as like_count 
     FROM likes 
     GROUP BY recipe_slug 
     ORDER BY like_count DESC 
     LIMIT ?`
  ).bind(limit).all();
  
  return jsonResponse({ success: true, data: ranking.results });
}

// 收藏排行榜
async function handleFavoritesRanking(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  
  const ranking = await env.DB.prepare(
    `SELECT recipe_slug, COUNT(*) as favorite_count 
     FROM favorites 
     GROUP BY recipe_slug 
     ORDER BY favorite_count DESC 
     LIMIT ?`
  ).bind(limit).all();
  
  return jsonResponse({ success: true, data: ranking.results });
}

// ==================== 主入口 ====================
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    
    try {
      if (path === '/api/auth/register' && request.method === 'POST') {
        return await handleRegister(request, env);
      }
      
      if (path === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      
      if (path === '/api/auth/me' && request.method === 'GET') {
        return await handleGetMe(request, env);
      }
      
      if (path === '/api/auth/profile' && request.method === 'PUT') {
        return await handleUpdateProfile(request, env);
      }
      
      const oauthMatch = path.match(/^\/api\/oauth\/(\w+)$/);
      if (oauthMatch && request.method === 'POST') {
        return await handleOAuth(request, env, oauthMatch[1]);
      }
      
      const likeMatch = path.match(/^\/api\/recipes\/([^/]+)\/like$/);
      if (likeMatch && request.method === 'POST') {
        const slug = decodeURIComponent(likeMatch[1]);
        return await handleLike(request, env, slug);
      }
      
      const getLikesMatch = path.match(/^\/api\/recipes\/([^/]+)\/likes$/);
      if (getLikesMatch && request.method === 'GET') {
        const slug = decodeURIComponent(getLikesMatch[1]);
        return await handleGetLikes(request, env, slug);
      }
      
      const favoriteMatch = path.match(/^\/api\/recipes\/([^/]+)\/favorite$/);
      if (favoriteMatch && request.method === 'POST') {
        const slug = decodeURIComponent(favoriteMatch[1]);
        return await handleFavorite(request, env, slug);
      }
      
      const getFavoritesMatch = path.match(/^\/api\/recipes\/([^/]+)\/favorites$/);
      if (getFavoritesMatch && request.method === 'GET') {
        const slug = decodeURIComponent(getFavoritesMatch[1]);
        return await handleGetFavorites(request, env, slug);
      }
      
      if (path === '/api/users/me/favorites' && request.method === 'GET') {
        return await handleGetMyFavorites(request, env);
      }
      
      if (path === '/api/rankings/likes' && request.method === 'GET') {
        return await handleLikesRanking(request, env);
      }
      
      if (path === '/api/rankings/favorites' && request.method === 'GET') {
        return await handleFavoritesRanking(request, env);
      }
      
      if (path === '/api/health') {
        return jsonResponse({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
      }
      
      return jsonResponse({ success: false, error: '未找到该接口' }, 404);
      
    } catch (err: any) {
      console.error('API Error:', err);
      return jsonResponse({ success: false, error: '服务器内部错误' }, 500);
    }
  },
};
