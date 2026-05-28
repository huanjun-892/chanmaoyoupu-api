# 馋猫有谱 - 会员系统部署指南

## 项目结构

```
/
├── chanmaoyoupu-web/          # 前端 (Astro SSG)
│   ├── src/
│   │   ├── components/       # 组件
│   │   │   ├── LoginModal.astro
│   │   │   ├── LikeButton.astro
│   │   │   ├── FavoriteButton.astro
│   │   │   └── Header.astro (已修改)
│   │   ├── lib/
│   │   │   └── auth.ts       # 认证工具函数
│   │   └── pages/
│   │       ├── rankings.astro
│   │       └── profile/favorites.astro
│   └── ...
│
└── chanmaoyoupu-api/          # 后端 (Cloudflare Workers)
    ├── src/index.ts           # API主文件
    ├── schema.sql             # D1数据库Schema
    ├── wrangler.toml          # Wrangler配置
    └── package.json
```

---

## 第一步：部署后端 (Cloudflare Workers + D1)

### 1.1 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 1.2 登录 Cloudflare

```bash
wrangler login
```

### 1.3 创建 D1 数据库

```bash
# 创建生产环境D1数据库
wrangler d1 create chanmaoyoupu --env production
```

**输出示例：**
```
⬧ Created D1 database 'chanmaoyoupu'
database_id: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**记录输出的 `database_id`，需要填入 wrangler.toml**

### 1.4 更新 wrangler.toml

编辑 `/tmp/chanmaoyoupu-api/wrangler.toml`:

```toml
name = "chanmaoyoupu-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production]
name = "chanmaoyoupu-api"
route = { pattern = "api.chanmaoyoupu.com", zone_name = "chanmaoyoupu.com" }

[[d1_databases]]
binding = "DB"
database_name = "chanmaoyoupu"
database_id = "这里填入上一步创建的database_id"
```

### 1.5 设置环境变量 (JWT密钥)

```bash
# 生成一个强密钥
wrangler secret put JWT_SECRET --env production
# 输入一个随机的32位以上字符串，例如: openssl rand -base64 32
```

### 1.6 执行数据库迁移

```bash
wrangler d1 execute chanmaoyoupu --env production --file=./schema.sql
```

### 1.7 部署 Worker

```bash
cd /tmp/chanmaoyoupu-api
wrangler deploy --env production
```

### 1.8 配置 DNS (Cloudflare)

在 Cloudflare DNS 设置中添加:

| Type  | Name | Content | Proxy |
|-------|------|---------|-------|
| CNAME | api  | xxx.workers.dev | DNS only |

### 1.9 验证部署

```bash
curl https://api.chanmaoyoupu.com/api/health
```

**预期输出：**
```json
{"success":true,"data":{"status":"ok","timestamp":"2024-01-01T00:00:00.000Z"}}
```

---

## 第二步：配置前端

前端代码已推送至 GitHub，Cloudflare Pages 会自动构建部署。

### 需要在 Cloudflare Pages 环境变量中配置

| Variable | Value | 说明 |
|----------|-------|------|
| `SITE_URL` | `https://chanmaoyoupu.com` | 生产环境URL |

---

## 第三步：API 接口验证

### 注册用户

```bash
curl -X POST https://api.chanmaoyoupu.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456","nickname":"测试用户"}'
```

### 登录

```bash
curl -X POST https://api.chanmaoyoupu.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"123456"}'
```

### 获取当前用户

```bash
curl https://api.chanmaoyoupu.com/api/auth/me \
  -H "Authorization: Bearer <token>"
```

### 点赞

```bash
curl -X POST https://api.chanmaoyoupu.com/api/recipes/红烧肉/like \
  -H "Authorization: Bearer <token>"
```

### 收藏

```bash
curl -X POST https://api.chanmaoyoupu.com/api/recipes/红烧肉/favorite \
  -H "Authorization: Bearer <token>"
```

### 获取收藏列表

```bash
curl https://api.chanmaoyoupu.com/api/users/me/favorites \
  -H "Authorization: Bearer <token>"
```

### 点赞排行榜

```bash
curl https://api.chanmaoyoupu.com/api/rankings/likes
```

### 收藏排行榜

```bash
curl https://api.chanmaoyoupu.com/api/rankings/favorites
```

---

## 完整 API 列表

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | 否 | 用户注册 |
| POST | `/api/auth/login` | 否 | 用户登录 |
| GET | `/api/auth/me` | 是 | 获取当前用户 |
| PUT | `/api/auth/profile` | 是 | 更新用户信息 |
| POST | `/api/oauth/:provider` | 否 | OAuth登录（预留） |
| POST | `/api/recipes/:slug/like` | 是 | 点赞/取消点赞 |
| GET | `/api/recipes/:slug/likes` | 否 | 获取点赞状态和数量 |
| POST | `/api/recipes/:slug/favorite` | 是 | 收藏/取消收藏 |
| GET | `/api/recipes/:slug/favorites` | 否 | 获取收藏状态和数量 |
| GET | `/api/users/me/favorites` | 是 | 我的收藏列表 |
| GET | `/api/rankings/likes` | 否 | 点赞排行榜 |
| GET | `/api/rankings/favorites` | 否 | 收藏排行榜 |
| GET | `/api/health` | 否 | 健康检查 |

---

## 数据库 Schema

```sql
-- 用户表
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nickname TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- OAuth连接表（预留微信/抖音/快手）
CREATE TABLE oauth_connections (
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
CREATE TABLE likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recipe_slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 收藏表
CREATE TABLE favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  recipe_slug TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 本地开发

### 后端本地开发

```bash
cd /tmp/chanmaoyoupu-api
npm install
wrangler dev --local
```

### 前端本地开发

```bash
cd /tmp/chanmaoyoupu-web
npm install
npm run dev
```

---

## 注意事项

1. **CORS 配置**：API 已配置允许 `https://chanmaoyoupu.com` 跨域访问
2. **密码加密**：使用 Web Crypto API 的 SHA-256 + salt 加密
3. **JWT 密钥**：生产环境务必设置复杂的 JWT_SECRET
4. **OAuth 预留**：微信/抖音/快手 OAuth 接口已预留，暂不实现具体流程
5. **SSG 模式**：点赞/收藏/排行榜等动态功能通过客户端 JS 调用 API

---

## 故障排查

### 1. CORS 错误
- 检查 API 域名为 `api.chanmaoyoupu.com`
- 检查 Cloudflare SSL 设置为"完全严格"

### 2. D1 数据库错误
- 确认 `database_id` 已正确配置在 wrangler.toml
- 确认已执行 `schema.sql` 创建表

### 3. 认证失败
- 检查 `JWT_SECRET` 环境变量已设置
- 检查 Authorization header 格式正确

---

## 后续优化建议

1. **OAuth 实现**：当微信/抖音/快手开放平台申请通过后，实现对应的 OAuth 流程
2. **邮箱验证**：添加注册邮箱验证功能
3. **密码重置**：实现密码找回功能
4. **登录日志**：记录用户登录历史
5. **数据分析**：基于收藏/点赞数据做推荐
