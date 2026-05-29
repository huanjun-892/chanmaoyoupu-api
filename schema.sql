-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT UNIQUE NOT NULL DEFAULT '',
  avatar_url TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  birthday TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- OAuth连接表（预留微信/抖音/快手）
CREATE TABLE IF NOT EXISTS oauth_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  provider_data TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(provider, provider_user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 点赞表
CREATE TABLE IF NOT EXISTS likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recipe_slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 收藏表
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recipe_slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_likes_recipe_slug ON likes(recipe_slug);
CREATE INDEX IF NOT EXISTS idx_favorites_recipe_slug ON favorites(recipe_slug);
CREATE INDEX IF NOT EXISTS idx_oauth_provider ON oauth_connections(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
-- ==========================================
-- 馋猫有谱 内容表（D1 Database）
-- ==========================================

-- 菜系
CREATE TABLE IF NOT EXISTS cuisines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  cover_url TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cuisines_slug ON cuisines(slug);

-- 标签
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  icon TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);

-- 地区
CREATE TABLE IF NOT EXISTS regions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 烹饪方法
CREATE TABLE IF NOT EXISTS methods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 食谱
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT DEFAULT '',
  difficulty TEXT DEFAULT 'simple',
  cook_time INTEGER DEFAULT 0,
  servings INTEGER DEFAULT 1,
  calories INTEGER DEFAULT 0,
  cuisine_id INTEGER,
  cover_url TEXT DEFAULT '',
  published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (cuisine_id) REFERENCES cuisines(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_recipes_slug ON recipes(slug);
CREATE INDEX IF NOT EXISTS idx_recipes_cuisine ON recipes(cuisine_id);

-- 食谱用料
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  amount TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipe_id);

-- 食谱步骤
CREATE TABLE IF NOT EXISTS recipe_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  recipe_id INTEGER NOT NULL,
  step_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_rs_recipe ON recipe_steps(recipe_id);

-- 食谱-标签关联
CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, tag_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- 食谱-烹饪方法关联
CREATE TABLE IF NOT EXISTS recipe_methods (
  recipe_id INTEGER NOT NULL,
  method_id INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, method_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (method_id) REFERENCES methods(id) ON DELETE CASCADE
);

-- 食谱-地区关联
CREATE TABLE IF NOT EXISTS recipe_regions (
  recipe_id INTEGER NOT NULL,
  region_id INTEGER NOT NULL,
  PRIMARY KEY (recipe_id, region_id),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id) ON DELETE CASCADE,
  FOREIGN KEY (region_id) REFERENCES regions(id) ON DELETE CASCADE
);

-- 知识库/秘方
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT NOT NULL DEFAULT 'flavor',
  content TEXT DEFAULT '',
  published INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_knowledge_slug ON knowledge_entries(slug);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category);
