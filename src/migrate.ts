/**
 * 数据库迁移和种子数据初始化
 * 通过 /api/admin/init 调用，需要 ADMIN_SECRET 验证
 */

import { D1Database } from '@cloudflare/workers-types';

interface Env {
  DB: D1Database;
  ADMIN_SECRET: string;
}

function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function runSQL(env: Env, sql: string): Promise<void> {
  await env.DB.prepare(sql).run();
}

async function createTables(env: Env): Promise<void> {
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
  await runSQL(env, "CREATE TABLE IF NOT EXISTS knowledge_entries (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, category TEXT NOT NULL DEFAULT 'flavor', content TEXT DEFAULT '', published INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE TABLE IF NOT EXISTS ingredients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, slug TEXT UNIQUE NOT NULL, category TEXT NOT NULL DEFAULT 'ingredient', description TEXT DEFAULT '', image_url TEXT DEFAULT '', nutrition TEXT DEFAULT '', tips TEXT DEFAULT '', aliases TEXT DEFAULT '', season TEXT DEFAULT '', origin TEXT DEFAULT '', storage_method TEXT DEFAULT '', published INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_ingredients_slug ON ingredients(slug)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_ingredients_category ON ingredients(category)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_knowledge_slug ON knowledge_entries(slug)");
  await runSQL(env, "CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category)");
}

export async function handleAdminInit(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const secret = url.searchParams.get('secret') || request.headers.get('X-Admin-Secret') || '';
  if (secret !== env.ADMIN_SECRET) {
    return jsonResponse({ success: false, error: '无权操作' }, 403);
  }

  const results: string[] = [];

  try {
    // Step 1: Create tables
    results.push('Creating tables...');
    await createTables(env);
    results.push('Tables created successfully');

    // Step 2: Check if data already exists
    const existing = await env.DB.prepare('SELECT COUNT(*) as count FROM cuisines').first() as any;
    if (existing && existing.count > 0) {
      // Always update cover URLs (e.g., .svg -> .jpg migration)
      const coverUpdates = [
        { id: 1, cover_url: '/images/cuisines/chuan.jpg' },
        { id: 2, cover_url: '/images/cuisines/yue.jpg' },
        { id: 3, cover_url: '/images/cuisines/xiang.jpg' },
        { id: 4, cover_url: '/images/cuisines/zhe.jpg' },
        { id: 5, cover_url: '/images/cuisines/lu.jpg' },
        { id: 6, cover_url: '/images/cuisines/su.jpg' },
        { id: 7, cover_url: '/images/cuisines/min.jpg' },
        { id: 8, cover_url: '/images/cuisines/hui.jpg' },
        { id: 9, cover_url: '/images/cuisines/dongbei.jpg' },
        { id: 10, cover_url: '/images/cuisines/riliao.jpg' },
        { id: 11, cover_url: '/images/cuisines/jianzhi.jpg' },
        { id: 12, cover_url: '/images/cuisines/ertong.jpg' },
      ];
      for (const c of coverUpdates) {
        await env.DB.prepare('UPDATE cuisines SET cover_url = ? WHERE id = ?').bind(c.cover_url, c.id).run();
      }
      results.push("Updated cover URLs for " + coverUpdates.length + " cuisines");
      return jsonResponse({ success: true, data: results });
    }

    // Step 3: Seed data
    results.push('Seeding data...');

    // Cuisines
    const cuisines = [
      { id: 1, name: '川菜', slug: 'chuan-cai', description: '麻辣鲜香，百菜百味', cover_url: '/images/cuisines/chuan.jpg', sort: 1 },
      { id: 2, name: '粤菜', slug: 'yue-cai', description: '清鲜嫩滑，食不厌精', cover_url: '/images/cuisines/yue.jpg', sort: 2 },
      { id: 3, name: '湘菜', slug: 'xiang-cai', description: '香辣浓烈，滋味悠长', cover_url: '/images/cuisines/xiang.jpg', sort: 3 },
      { id: 4, name: '浙菜', slug: 'zhe-cai', description: '清鲜脆嫩，原汁原味', cover_url: '/images/cuisines/zhe.jpg', sort: 4 },
      { id: 5, name: '鲁菜', slug: 'lu-cai', description: '咸鲜为主，醇厚大气', cover_url: '/images/cuisines/lu.jpg', sort: 5 },
      { id: 6, name: '苏菜', slug: 'su-cai', description: '甜咸适中，酥烂可口', cover_url: '/images/cuisines/su.jpg', sort: 6 },
      { id: 7, name: '闽菜', slug: 'min-cai', description: '鲜香清甜，汤菜居多', cover_url: '/images/cuisines/min.jpg', sort: 7 },
      { id: 8, name: '徽菜', slug: 'hui-cai', description: '重油重色，火功讲究', cover_url: '/images/cuisines/hui.jpg', sort: 8 },
      { id: 9, name: '东北菜', slug: 'dongbei-cai', description: '量大实在，浓香醇厚', cover_url: '/images/cuisines/dongbei.jpg', sort: 9 },
      { id: 10, name: '日料', slug: 'ri-liao', description: '精致细腻，尊重食材本味', cover_url: '/images/cuisines/riliao.jpg', sort: 10 },
      { id: 11, name: '减脂餐', slug: 'jianzhi-can', description: '低卡美味，健康搭配', cover_url: '/images/cuisines/jianzhi.jpg', sort: 11 },
      { id: 12, name: '儿童餐', slug: 'ertong-can', description: '营养均衡，色彩缤纷', cover_url: '/images/cuisines/ertong.jpg', sort: 12 },
    ];
    for (const c of cuisines) {
      await env.DB.prepare('INSERT OR IGNORE INTO cuisines (id, name, slug, description, cover_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(c.id, c.name, c.slug, c.description, c.cover_url, c.sort).run();
    }
    // Update cover URLs for existing cuisines (in case they changed from .svg to .jpg)
    for (const c of cuisines) {
      await env.DB.prepare("UPDATE cuisines SET cover_url = ? WHERE id = ?")
        .bind(c.cover_url, c.id).run();
    }
    results.push("Inserted " + cuisines.length + " cuisines");

    // Tags
    const tags = [
      { id: 1, name: '快手菜', slug: 'quick', icon: '⚡', sort: 1 },
      { id: 2, name: '夜宵', slug: 'latesnack', icon: '🌙', sort: 2 },
      { id: 3, name: '减脂', slug: 'diet', icon: '🥗', sort: 3 },
      { id: 4, name: '烘焙', slug: 'baking', icon: '🧁', sort: 4 },
      { id: 5, name: '下饭菜', slug: 'xiaban', icon: '🍚', sort: 5 },
      { id: 6, name: '家常菜', slug: 'homecook', icon: '🏠', sort: 6 },
    ];
    for (const t of tags) {
      await env.DB.prepare('INSERT OR IGNORE INTO tags (id, name, slug, icon, sort_order) VALUES (?, ?, ?, ?, ?)')
        .bind(t.id, t.name, t.slug, t.icon, t.sort).run();
    }
    results.push("Inserted " + tags.length + " tags");

    // Regions
    const regions = ['四川', '广东', '湖南', '浙江', '山东', '东北'];
    const regionIds: Record<string, number> = {};
    for (let i = 0; i < regions.length; i++) {
      const id = i + 1;
      regionIds[regions[i]] = id;
      await env.DB.prepare('INSERT OR IGNORE INTO regions (id, name) VALUES (?, ?)').bind(id, regions[i]).run();
    }
    results.push("Inserted " + regions.length + " regions");

    // Methods
    const methods = ['炒', '蒸', '炖', '烤'];
    const methodIds: Record<string, number> = {};
    for (let i = 0; i < methods.length; i++) {
      const id = i + 1;
      methodIds[methods[i]] = id;
      await env.DB.prepare('INSERT OR IGNORE INTO methods (id, name) VALUES (?, ?)').bind(id, methods[i]).run();
    }
    results.push("Inserted " + methods.length + " methods");

    // Recipes
    const recipes = [
      { id: 1, title: '麻婆豆腐', slug: 'mapo-doufu', description: '经典川菜，麻辣鲜香，嫩豆腐裹着红油肉末，下饭一绝。', difficulty: 'easy', cookTime: 20, servings: 2, calories: 280, cuisineId: 1,
        ingredients: [{name:'嫩豆腐',amount:'1块(约400g)'},{name:'猪肉末',amount:'100g'},{name:'郫县豆瓣酱',amount:'1.5大勺'},{name:'花椒粉',amount:'1小勺'},{name:'蒜末',amount:'3瓣'},{name:'葱花',amount:'适量'},{name:'生抽',amount:'1大勺'},{name:'水淀粉',amount:'2大勺'}],
        steps: [{num:1,text:'豆腐切成2cm见方的小块，冷水下锅加少许盐，煮开后捞出沥干。'},{num:2,text:'锅中倒油烧热，下肉末炒散至变色。'},{num:3,text:'加入郫县豆瓣酱炒出红油，下蒜末炒香。'},{num:4,text:'加入半碗水烧开，放入豆腐块，小火煮3分钟让豆腐入味。'},{num:5,text:'淋入水淀粉勾芡，撒花椒粉和葱花即可出锅。'}],
        tagIds: [1,5], methodIds: [1], regionIds: [1] },
      { id: 2, title: '番茄炒蛋', slug: 'fanqie-chaodan', description: '国民家常菜，酸甜可口，新手也能轻松搞定。', difficulty: 'easy', cookTime: 10, servings: 2, calories: 220, cuisineId: 6,
        ingredients: [{name:'番茄',amount:'2个'},{name:'鸡蛋',amount:'3个'},{name:'白糖',amount:'1小勺'},{name:'盐',amount:'适量'},{name:'葱花',amount:'少许'}],
        steps: [{num:1,text:'番茄切块，鸡蛋打散加少许盐搅匀。'},{num:2,text:'锅热倒油，倒入蛋液，快速翻炒至凝固后盛出。'},{num:3,text:'再加少许油，下番茄块炒至出汁。'},{num:4,text:'加入白糖和盐调味，倒回鸡蛋翻炒均匀，撒葱花出锅。'}],
        tagIds: [1,6], methodIds: [1], regionIds: [] },
      { id: 3, title: '红烧肉', slug: 'hongshao-rou', description: '浓油赤酱，肥而不腻，入口即化的经典硬菜。', difficulty: 'medium', cookTime: 90, servings: 4, calories: 650, cuisineId: 5,
        ingredients: [{name:'五花肉',amount:'500g'},{name:'冰糖',amount:'30g'},{name:'生抽',amount:'2大勺'},{name:'老抽',amount:'1大勺'},{name:'料酒',amount:'2大勺'},{name:'八角',amount:'2个'},{name:'桂皮',amount:'1小段'},{name:'姜片',amount:'3片'},{name:'葱段',amount:'2根'}],
        steps: [{num:1,text:'五花肉切3cm见方的块，冷水下锅焯水去血沫，捞出沥干。'},{num:2,text:'锅中放少许油，下冰糖小火炒出糖色至枣红色。'},{num:3,text:'下肉块翻炒上色，加入料酒、生抽、老抽翻炒均匀。'},{num:4,text:'加入没过肉的开水，放八角、桂皮、姜片、葱段。'},{num:5,text:'大火烧开后转小火炖60-80分钟，最后大火收汁即可。'}],
        tagIds: [5,6], methodIds: [1], regionIds: [5] },
      { id: 4, title: '清蒸鲈鱼', slug: 'qingzheng-luyu', description: '粤式经典，鱼肉嫩滑鲜甜，保留食材最本真的味道。', difficulty: 'simple', cookTime: 15, servings: 2, calories: 180, cuisineId: 2,
        ingredients: [{name:'鲈鱼',amount:'1条(约500g)'},{name:'葱丝',amount:'适量'},{name:'姜丝',amount:'适量'},{name:'蒸鱼豉油',amount:'2大勺'},{name:'料酒',amount:'1大勺'},{name:'花生油',amount:'2大勺'}],
        steps: [{num:1,text:'鲈鱼处理干净，鱼身两面划几刀，抹少许料酒和盐腌制10分钟。'},{num:2,text:'鱼身下垫姜片和葱段，放入蒸锅大火蒸8-10分钟。'},{num:3,text:'蒸好后倒掉盘中积水，铺上葱丝姜丝。'},{num:4,text:'淋上蒸鱼豉油，将烧至冒烟的花生油浇在葱姜丝上即可。'}],
        tagIds: [3,6], methodIds: [2], regionIds: [2] },
      { id: 5, title: '蒜蓉西兰花', slug: 'suanrong-xilanhua', description: '清淡营养，蒜香浓郁，减脂期必备的健康菜品。', difficulty: 'easy', cookTime: 8, servings: 2, calories: 85, cuisineId: 11,
        ingredients: [{name:'西兰花',amount:'1颗(约300g)'},{name:'蒜末',amount:'4瓣'},{name:'盐',amount:'适量'},{name:'蚝油',amount:'1小勺'}],
        steps: [{num:1,text:'西兰花掰成小朵，清水浸泡10分钟后洗净。'},{num:2,text:'烧开水，加少许盐和油，焯水1分钟捞出沥干。'},{num:3,text:'锅中倒少许油，爆香蒜末。'},{num:4,text:'下西兰花快速翻炒，加蚝油和盐调味出锅。'}],
        tagIds: [1,3], methodIds: [1], regionIds: [] },
      { id: 6, title: '可乐鸡翅', slug: 'kele-jichi', description: '甜香入味，鸡翅软烂脱骨，大人小孩都爱。', difficulty: 'easy', cookTime: 30, servings: 3, calories: 350, cuisineId: 6,
        ingredients: [{name:'鸡翅中',amount:'12个'},{name:'可乐',amount:'1罐(330ml)'},{name:'生抽',amount:'2大勺'},{name:'老抽',amount:'1小勺'},{name:'姜片',amount:'3片'},{name:'料酒',amount:'1大勺'}],
        steps: [{num:1,text:'鸡翅两面划刀，冷水下锅加料酒焯水，捞出沥干。'},{num:2,text:'锅中少许油，下鸡翅煎至两面金黄。'},{num:3,text:'加入姜片、生抽、老抽翻炒上色。'},{num:4,text:'倒入可乐没过鸡翅，大火烧开后转小火炖20分钟。'},{num:5,text:'大火收汁至浓稠挂满鸡翅即可。'}],
        tagIds: [1,5], methodIds: [1], regionIds: [] },
      { id: 7, title: '宫保鸡丁', slug: 'gongbao-jiding', description: '川菜名品，荔枝味型，麻辣甜酸交织，花生酥脆。', difficulty: 'medium', cookTime: 20, servings: 2, calories: 320, cuisineId: 1,
        ingredients: [{name:'鸡胸肉',amount:'250g'},{name:'花生米',amount:'50g'},{name:'干辣椒',amount:'8-10个'},{name:'花椒',amount:'1小勺'},{name:'葱段',amount:'2根'},{name:'蒜末',amount:'2瓣'},{name:'生抽',amount:'2大勺'},{name:'醋',amount:'1大勺'},{name:'白糖',amount:'1大勺'},{name:'淀粉',amount:'1大勺'}],
        steps: [{num:1,text:'鸡胸肉切丁，加生抽、料酒、淀粉腌制15分钟。花生米小火炒熟备用。'},{num:2,text:'调碗汁：生抽、醋、白糖、淀粉加2勺水搅匀。'},{num:3,text:'锅热倒油，下鸡丁滑散至变色盛出。'},{num:4,text:'留底油，小火煸香干辣椒和花椒，下葱段蒜末炒香。'},{num:5,text:'倒回鸡丁，淋碗汁大火翻炒至收汁，最后撒花生米翻匀出锅。'}],
        tagIds: [5,6], methodIds: [1], regionIds: [1] },
      { id: 8, title: '酸菜鱼', slug: 'suancai-yu', description: '鱼肉嫩滑，酸菜爽口，汤汁酸辣开胃，越吃越上瘾。', difficulty: 'medium', cookTime: 30, servings: 3, calories: 280, cuisineId: 1,
        ingredients: [{name:'草鱼',amount:'1条(约750g)'},{name:'酸菜',amount:'250g'},{name:'泡椒',amount:'5-6个'},{name:'姜片',amount:'4片'},{name:'蒜末',amount:'4瓣'},{name:'花椒',amount:'1小勺'},{name:'蛋清',amount:'1个'},{name:'淀粉',amount:'1大勺'},{name:'料酒',amount:'1大勺'}],
        steps: [{num:1,text:'草鱼处理干净，片下鱼肉斜刀切薄片，鱼骨切段。'},{num:2,text:'鱼片加蛋清、料酒、淀粉抓匀腌制10分钟。'},{num:3,text:'酸菜洗净切段，挤干水分。'},{num:4,text:'锅热倒油，下鱼骨煎至两面金黄，加开水大火煮10分钟至汤色奶白，捞出鱼骨。'},{num:5,text:'另起锅炒香酸菜和泡椒，倒入鱼汤煮沸。'},{num:6,text:'下鱼片，轻轻拨散，鱼片变白即熟。撒蒜末、花椒，浇热油激香。'}],
        tagIds: [2,5], methodIds: [1], regionIds: [1] },
    ];

    for (const r of recipes) {
      await env.DB.prepare('INSERT OR IGNORE INTO recipes (id, title, slug, description, difficulty, cook_time, servings, calories, cuisine_id, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(r.id, r.title, r.slug, r.description, r.difficulty, r.cookTime, r.servings, r.calories, r.cuisineId, '').run();
      for (let i = 0; i < r.ingredients.length; i++) {
        const ing = r.ingredients[i];
        await env.DB.prepare('INSERT INTO recipe_ingredients (recipe_id, name, amount, sort_order) VALUES (?, ?, ?, ?)')
          .bind(r.id, ing.name, ing.amount, i + 1).run();
      }
      for (const s of r.steps) {
        await env.DB.prepare('INSERT INTO recipe_steps (recipe_id, step_number, text) VALUES (?, ?, ?)')
          .bind(r.id, s.num, s.text).run();
      }
      for (const tid of r.tagIds) {
        await env.DB.prepare('INSERT OR IGNORE INTO recipe_tags (recipe_id, tag_id) VALUES (?, ?)').bind(r.id, tid).run();
      }
      for (const mid of r.methodIds) {
        await env.DB.prepare('INSERT OR IGNORE INTO recipe_methods (recipe_id, method_id) VALUES (?, ?)').bind(r.id, mid).run();
      }
      for (const rid of r.regionIds) {
        await env.DB.prepare('INSERT OR IGNORE INTO recipe_regions (recipe_id, region_id) VALUES (?, ?)').bind(r.id, rid).run();
      }
    }
    results.push("Inserted " + recipes.length + " recipes");

    // Knowledge entries (5 regular + 14 secrets = 19 total)
    const knowledge = [
      { id: 1, title: '川菜的味型体系', slug: 'chuan-cai-wei-xing', category: 'flavor', content: '<h3>川菜有多少种味型？</h3><p>川菜号称"一菜一格，百菜百味"，味型数量之多在全国菜系中首屈一指。很多人以为川菜就是辣，其实辣只是其中一种。</p><h3>六大经典味型</h3><p><strong>麻辣味型</strong>——川菜的招牌面孔。花椒负责"麻"，辣椒负责"辣"，两者搭在一起产生了奇妙的化学反应。麻婆豆腐、水煮牛肉、火锅，都是这个味型的代表作。</p><p><strong>鱼香味型</strong>——跟鱼没关系，名字来自四川泡辣椒特有的"鱼香"气息。泡辣椒、姜、蒜、糖、醋一锅炒，咸甜酸辣俱全。鱼香肉丝、鱼香茄子，吃起来层次分明。</p><p><strong>宫保味型</strong>——因丁宝桢（封宫保）得名。干辣椒炒出糊香，花椒点到为止，花生最后放保持酥脆。好的宫保鸡丁，荔枝味（微酸甜）是灵魂。</p><p><strong>家常味型</strong>——豆瓣酱打底，咸鲜微辣，是四川人餐桌上的日常味道。回锅肉就是典型。</p><p><strong>怪味味型</strong>——川菜独有。咸甜麻辣酸鲜香七味同时存在，但谁也不压谁，这很考验调味功底。</p><p><strong>糊辣味型</strong>——干辣椒在锅里炒到微微发糊，辣味变得温柔，取而代之的是一股焦香。</p><h3>味型的秘密</h3><p>川菜调味不是简单地把各种调料堆在一起。每一种味型都有主次之分，就像交响乐，不是所有乐器同时响，而是有节奏有层次。</p>' },
      { id: 2, title: '粤菜的烹饪哲学', slug: 'yue-cai-peng-ren-zhe-xue', category: 'culture', content: '<h3>粤菜的核心：鲜</h3><p>粤菜讲究"食不厌精"，但这份"精"不是花里胡哨，而是对食材本味的极致追求。广东人常说"鸡有鸡味，鱼有鱼味"，这句话道出了粤菜的精髓。</p><h3>调味的克制</h3><p>粤菜厨师用调味料极为克制。白灼虾只蘸酱油和芥末，清蒸鱼只淋蒸鱼豉油，连姜葱都只是配角。越简单的做法，越能看出食材的品质，也越能看出厨师的手艺。</p><h3>火候的功夫</h3><p>粤菜的镬气（wok hei）是别的菜系很难复制的。猛火快炒，食材在高温下瞬间锁住水分和鲜味，表面微焦而内里嫩滑。这需要极强的火候掌控能力。</p><h3>汤的学问</h3><p>粤菜里的汤，不是随随便便煮煮就行。老火靓汤动辄煲四五个小时，讲究"煲三炖四"——煲汤三小时，炖汤四小时。每种汤都有特定的食材搭配和时令讲究。</p>' },
      { id: 3, title: '中国八大菜系', slug: 'zhong-guo-ba-da-cai-xi', category: 'culture', content: '<h3>什么是八大菜系？</h3><p>中国菜系划分有不同说法，但最广为人知的是"八大菜系"：鲁、川、粤、苏、闽、浙、湘、徽。这个说法大致成型于清末民初，但菜系本身的历史要久远得多。</p><h3>四大菜系（母菜系）</h3><p><strong>鲁菜</strong>——北方菜之母。宫廷菜的基础，讲究制汤和火候。糖醋鲤鱼、九转大肠、葱烧海参是代表。</p><p><strong>川菜</strong>——味型最丰富。不是简单的辣，而是麻辣、鱼香、宫保、家常等20多种味型各具特色。</p><p><strong>粤菜</strong>——鲜字当头。白切鸡、清蒸鱼、煲汤，对食材本味的追求到了极致。</p><p><strong>苏菜</strong>——淮扬菜为代表。刀工精细，口味清鲜平和，大煮干丝、松鼠桂鱼是经典。</p><h3>四大子菜系</h3><p><strong>闽菜</strong>——以汤菜见长，佛跳墙、荔枝肉。</p><p><strong>浙菜</strong>——龙井虾仁、西湖醋鱼，清鲜不腻。</p><p><strong>湘菜</strong>——剁椒鱼头、小炒肉，辣得过瘾。</p><p><strong>徽菜</strong>——臭鳜鱼、毛豆腐，重油重色重火功。</p>' },
      { id: 4, title: '常见烹饪技法', slug: 'chang-jian-peng-ren-ji-fa', category: 'technique', content: '<h3>炒</h3><p>中餐最核心的烹饪技法。猛火快炒，食材在高温下迅速成熟，保持脆嫩口感。关键在于"镬气"——锅要够热，动作要够快。</p><h3>蒸</h3><p>最能保留食材原味的做法。粤菜清蒸鱼、川菜粉蒸肉、浙菜蒸蛋，南北各有精彩。蒸的关键是火候和时间，过则老，不及则生。</p><h3>炖</h3><p>小火慢炖是中式烹饪的浪漫。东北乱炖、广东煲汤、四川砂锅，不同地域有不同的炖法，但共同点是耐心。好汤都是等出来的。</p><h3>红烧</h3><p>中式烹饪的"万能公式"。先煎后炖，冰糖上色，酱油调味，小火慢收。红烧肉、红烧鱼、红烧茄子，万物皆可红烧。</p><h3>白灼</h3><p>粤菜独有技法。开水焯熟，蘸料而食。看似简单，实则对食材品质和火候把控要求极高。白灼虾、白灼菜心，鲜甜全靠食材本身。</p>' },
      { id: 5, title: '厨房必备调味料', slug: 'chu-fang-bi-bei-tiao-wei-liao', category: 'ingredient', content: '<h3>酱油家族</h3><p><strong>生抽</strong>——盐味主角，颜色浅、咸味足、鲜味明显。炒菜调味、蘸料都离不开。</p><p><strong>老抽</strong>——上色专用，咸味轻但颜色深。红烧肉、卤味要靠它上色，用量不宜多。</p><p><strong>蒸鱼豉油</strong>——生抽的升级版，专门配蒸鱼，咸甜适中有豆香。</p><h3>醋</h3><p><strong>陈醋</strong>——山西老陈醋，酸味醇厚，适合拌凉菜和做糖醋菜。</p><p><strong>米醋</strong>——酸味温和，炒菜、蘸饺子都不错。</p><p><strong>香醋</strong>——镇江香醋，酸中带甜，蘸蟹、拌菜最佳。</p><h3>酱料</h3><p><strong>郫县豆瓣酱</strong>——川菜灵魂。做麻婆豆腐、回锅肉没它不行，要先炒出红油。</p><p><strong>甜面酱</strong>——北京烤鸭的标配，京酱肉丝也靠它。</p><p><strong>蚝油</strong>——粤菜提鲜神器，炒菜收尾加一点，鲜味立升。</p>' },
    ];
    for (const k of knowledge) {
      await env.DB.prepare('INSERT OR IGNORE INTO knowledge_entries (id, title, slug, category, content) VALUES (?, ?, ?, ?, ?)')
        .bind(k.id, k.title, k.slug, k.category, k.content).run();
    }
    results.push("Inserted " + knowledge.length + " knowledge entries");

    // Secrets
    const secrets = [
      { id: 6, title: '潮汕卤水经典配方', slug: 'chaoshan-luoshui', category: 'secret', content: '<h3>核心配方</h3><p>潮汕卤水以其"鲜中带甜、油而不腻"的独特风味闻名，其核心在于"老卤"的传承与运用。以下配方基于多源交叉验证，以10斤卤汁为基准：</p><h4>香料配比</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量（克）</th><th>主要作用</th></tr><tr><td>八角</td><td>20-30</td><td>提供浓郁的茴香气</td></tr><tr><td>桂皮</td><td>15-25</td><td>增加卤汁的醇厚感</td></tr><tr><td>干南姜</td><td>75</td><td>潮汕卤的灵魂，去腥提鲜</td></tr><tr><td>小茴香</td><td>10-20</td><td>增添清新的香气</td></tr><tr><td>草果</td><td>5-20</td><td>去除食材的腥膻味</td></tr><tr><td>陈皮</td><td>20-40</td><td>解腻增香，带来回甘</td></tr><tr><td>丁香</td><td>3-5</td><td>提升香气的穿透力（宁少勿多）</td></tr><tr><td>香叶</td><td>5-10</td><td>增香</td></tr><tr><td>白蔻</td><td>8-15</td><td>解腻增香</td></tr><tr><td>甘草</td><td>10-30</td><td>调和诸味，缓解刺激性</td></tr></table><h4>调味配比</h4><p>生抽：1.5-2斤 | 老抽：300-500ml | 冰糖：0.8-1.5斤 | 料酒：0.5-1斤 | 鱼露：200-500ml</p><h3>关键步骤</h3><p><strong>1. 高汤底制作：</strong>老母鸡1只、猪筒骨5kg、猪皮2kg，焯水后小火慢熬8-12小时，至汤色乳白。</p><p><strong>2. 香料处理：</strong>八角、桂皮、香叶等需炒制激发香味；甘草、丁香等不宜炒制，直接使用以保留清甜。香料需用纱布袋分装。</p><p><strong>3. 鹅油封顶工艺：</strong>鹅油与南姜、蒜头、葱段炸香后倒入卤汤，形成油膜隔绝空气，锁住香气。这是潮汕卤水的核心技术。</p><p><strong>4. 糖色调制：</strong>冰糖炒至枣红色，与高汤混合后加入香料包，小火慢煲2小时。</p><h3>核心技巧</h3><p>• <strong>三浸三吊工艺：</strong>关火后浸泡1小时→复热微沸浸30分钟→淋卤汁补味，提升入味层次。</p><p>• <strong>老卤养护：</strong>每日过滤残渣、煮沸后冷藏；每3个月补充新香料。</p>' },
      { id: 7, title: '川味红烧水配方', slug: 'chuanwei-honglushui', category: 'secret', content: '<h3>配方概要</h3><p>川味红烧水是川菜厨房的万能底料，掌握它就能做出红烧肉、红烧鱼、红烧豆腐等一系列经典川味红烧菜。以下为2升红烧水配方：</p><h4>香料包</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量</th><th>作用</th></tr><tr><td>八角</td><td>3-4个</td><td>主香</td></tr><tr><td>桂皮</td><td>1小段(5g)</td><td>增厚</td></tr><tr><td>草果</td><td>1个(拍破)</td><td>去腥</td></tr><tr><td>山奈</td><td>3-4片</td><td>增香</td></tr><tr><td>小茴香</td><td>5g</td><td>清甜</td></tr><tr><td>香叶</td><td>3-4片</td><td>调和</td></tr></table><h4>调味配比</h4><p>郫县豆瓣酱50g（炒出红油）| 冰糖30g（炒糖色）| 生抽3大勺 | 老抽1大勺 | 料酒2大勺 | 姜片5片 | 葱段3根</p><h3>关键步骤</h3><p>1. 先炒糖色，冰糖小火炒至枣红色起大泡。</p><p>2. 下豆瓣酱炒出红油和香气。</p><p>3. 加入开水（不是冷水）烧开。</p><p>4. 放入香料包、姜片、葱段，小火熬20分钟让香味融合。</p>' },
      { id: 8, title: '卤牛肉进面条秘诀', slug: 'luniurou-jinmantiao', category: 'secret', content: '<h3>核心要点</h3><p>卤牛肉配面条，关键不在于卤多长时间，而在于浸泡入味的技巧。</p><h3>牛肉卤制配方（1kg牛腱子）</h3><table border="1" cellpadding="5"><tr><th>调料</th><th>用量</th></tr><tr><td>生抽</td><td>100ml</td></tr><tr><td>老抽</td><td>30ml</td></tr><tr><td>料酒</td><td>50ml</td></tr><tr><td>冰糖</td><td>20g</td></tr><tr><td>八角</td><td>2个</td></tr><tr><td>桂皮</td><td>1小段</td></tr><tr><td>香叶</td><td>3片</td></tr><tr><td>花椒</td><td>10粒</td></tr></table><h3>面条入味技巧</h3><p>1. 卤好的牛肉关火后不要取出，让它在卤汁中浸泡至少4小时。</p><p>2. 煮好的面条直接捞入热卤汤中浸泡30秒，让面条吸饱卤香。</p><p>3. 切牛肉要逆纹切薄片，口感更嫩。</p>' },
      { id: 9, title: '商用辣卤八宝配方', slug: 'shangyong-lalubabo', category: 'secret', content: '<h3>辣卤汤底配方（10斤卤汁）</h3><p>商用辣卤的核心是"辣而不燥，香而不腻"。</p><h4>香料包</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量（克）</th></tr><tr><td>八角</td><td>15</td></tr><tr><td>桂皮</td><td>10</td></tr><tr><td>草果</td><td>8</td></tr><tr><td>山奈</td><td>6</td></tr><tr><td>白芷</td><td>5</td></tr><tr><td>丁香</td><td>2</td></tr><tr><td>小茴香</td><td>10</td></tr><tr><td>香叶</td><td>5</td></tr></table><h4>辣料配比</h4><p>干辣椒段200g | 花椒50g | 郫县豆瓣酱100g | 火锅底料80g</p><h3>关键技巧</h3><p>1. 香料先用温水泡20分钟去除苦味。</p><p>2. 干辣椒和花椒先用油炒香再入卤汤。</p><p>3. 豆瓣酱必须炒出红油才能入锅。</p>' },
      { id: 10, title: '重庆小面调料配方', slug: 'chongqing-xiaomian-tiaoliao', category: 'secret', content: '<h3>一碗正宗重庆小面的调料</h3><p>重庆小面的灵魂不在面条，在那一碗调料。</p><h4>底料配方</h4><table border="1" cellpadding="5"><tr><th>调料</th><th>用量</th></tr><tr><td>油辣子</td><td>2大勺</td></tr><tr><td>花椒面</td><td>1小勺</td></tr><tr><td>酱油</td><td>1.5大勺</td></tr><tr><td>醋</td><td>半小勺</td></tr><tr><td>蒜水</td><td>1大勺</td></tr><tr><td>姜水</td><td>1小勺</td></tr><tr><td>芝麻酱</td><td>半小勺</td></tr><tr><td>花生碎</td><td>1小勺</td></tr><tr><td>榨菜粒</td><td>1大勺</td></tr><tr><td>葱花</td><td>适量</td></tr><tr><td>芽菜</td><td>1小勺</td></tr><tr><td>猪油</td><td>1小勺</td></tr></table><h3>油辣子做法</h3><p>1. 二荆条干辣椒、子弹头干辣椒1:1混合，小火炒脆后碾成粗碎。</p><p>2. 菜籽油烧至七成热，分三次浇油是关键。</p>' },
      { id: 11, title: '武汉热干面芝麻酱配方', slug: 'wuhan-reganmian-zhimajiang', category: 'secret', content: '<h3>芝麻酱的调法</h3><p>武汉热干面的灵魂是芝麻酱，需要"澥"开：</p><h4>标准调配法</h4><table border="1" cellpadding="5"><tr><th>原料</th><th>用量</th></tr><tr><td>纯芝麻酱</td><td>200g</td></tr><tr><td>香油</td><td>30ml</td></tr><tr><td>温开水</td><td>适量</td></tr><tr><td>生抽</td><td>1大勺</td></tr><tr><td>盐</td><td>2g</td></tr></table><h3>澥酱技巧</h3><p>1. 先加香油搅拌，让芝麻酱"化开"。</p><p>2. 再分次加温水，朝一个方向搅——这是关键。</p><p>3. 搅到芝麻酱能挂住筷子缓缓流下的状态就对了。</p>' },
      { id: 12, title: '柳州螺蛳粉汤底配方', slug: 'liuzhou-luosifen-tangdi', category: 'secret', content: '<h3>螺蛳汤底配方</h3><p>柳州螺蛳粉的灵魂在那碗"臭"得迷人的酸笋螺蛳汤。</p><h4>主料</h4><table border="1" cellpadding="5"><tr><th>原料</th><th>用量</th></tr><tr><td>石螺</td><td>2斤</td></tr><tr><td>猪筒骨</td><td>1斤</td></tr><tr><td>鸡架</td><td>1个</td></tr><tr><td>酸笋</td><td>200g</td></tr></table><h4>香料包</h4><p>八角3个 | 桂皮1小段 | 草果1个 | 沙姜5片 | 丁香2粒 | 小茴香10g | 香叶3片</p><h3>熬制步骤</h3><p>1. 石螺养2天吐沙，剪尾洗净，爆炒至盖打开。</p><p>2. 猪筒骨、鸡架焯水后小火熬2小时。</p><p>3. 炒好的螺蛳加入骨汤，放酸笋和香料包，继续小火煲2小时。</p>' },
      { id: 13, title: '老坛酸菜阿冲配方', slug: 'laotan-suancai-achong', category: 'secret', content: '<h3>老坛酸菜发酵要点</h3><p>正宗老坛酸菜的关键在于乳酸菌的自然发酵。</p><h4>腌料配比（5kg芥菜）</h4><table border="1" cellpadding="5"><tr><th>原料</th><th>用量</th></tr><tr><td>粗盐</td><td>250g</td></tr><tr><td>白酒</td><td>50ml</td></tr><tr><td>冰糖</td><td>30g</td></tr><tr><td>花椒</td><td>10g</td></tr><tr><td>老姜</td><td>50g</td></tr><tr><td>凉开水</td><td>适量</td></tr></table><h3>操作步骤</h3><p>1. 芥菜晒蔫（约1天），洗净晾干水分。</p><p>2. 坛子洗净晾干，用白酒内壁消毒。</p><p>3. 芥菜一层层码入坛中，每层撒盐。</p><p>4. 坛沿加水密封，7-10天即可。</p>' },
      { id: 14, title: '腊肉腌制配方', slug: 'larou-yanzhi', category: 'secret', content: '<h3>传统腊肉腌制法</h3><p>腊肉的"腊"不在于腊月，而在于风干和烟熏。</p><h4>腌制配比（5kg五花肉）</h4><table border="1" cellpadding="5"><tr><th>调料</th><th>用量</th></tr><tr><td>粗盐</td><td>150g</td></tr><tr><td>花椒</td><td>20g</td></tr><tr><td>白酒</td><td>50ml</td></tr><tr><td>八角</td><td>5个</td></tr><tr><td>桂皮</td><td>2小段</td></tr></table><h3>步骤</h3><p>1. 花椒和盐一起小火炒至微黄出香，晾凉。</p><p>2. 五花肉不洗，用白酒抹一遍消毒。</p><p>3. 炒好的椒盐均匀涂抹在肉上，放入容器中，重物压住。</p><p>4. 腌制7天，每天翻面一次。</p><p>5. 取出挂在通风处晾晒7-10天，至肉表面干硬出油。</p>' },
      { id: 15, title: '北方五香酱卤配方', slug: 'beifang-wuxiang-jianglu', category: 'secret', content: '<h3>五香酱卤基础配方</h3><p>北方酱卤以酱香浓郁、咸甜适中为特色。</p><h4>香料包（10斤卤汁）</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量</th></tr><tr><td>八角</td><td>20g</td></tr><tr><td>桂皮</td><td>15g</td></tr><tr><td>花椒</td><td>10g</td></tr><tr><td>小茴香</td><td>10g</td></tr><tr><td>丁香</td><td>3g</td></tr><tr><td>砂仁</td><td>5g</td></tr><tr><td>草果</td><td>8g</td></tr><tr><td>白芷</td><td>5g</td></tr></table><h4>酱料</h4><p>甜面酱100g | 黄酱50g | 生抽100ml | 老抽30ml | 冰糖50g</p><h3>关键技巧</h3><p>1. 甜面酱和黄酱先用油炒香再入汤。</p><p>2. 老汤越用越香，每次用完过滤冷藏。</p>' },
      { id: 16, title: '衢州鸭头秘方', slug: 'quzhou-duck-head-secret', category: 'secret', content: '<h3>衢州鸭头卤制配方</h3><p>衢州鸭头以"辣、鲜、香"三字著称，关键在于先卤后烤的工艺。</p><h4>卤料配比（50个鸭头）</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量</th></tr><tr><td>八角</td><td>15g</td></tr><tr><td>桂皮</td><td>10g</td></tr><tr><td>干辣椒</td><td>100g</td></tr><tr><td>花椒</td><td>30g</td></tr><tr><td>草果</td><td>5g</td></tr><tr><td>山奈</td><td>5g</td></tr></table><h3>关键步骤</h3><p>1. 鸭头处理干净，焯水去腥。</p><p>2. 入卤汤小火卤20分钟，关火浸泡30分钟。</p><p>3. 捞出沥干，表面刷薄油，入烤箱200°C烤5-8分钟。</p>' },
      { id: 17, title: '猪头肉秘制配方', slug: 'pig-head-meat-secret', category: 'secret', content: '<h3>猪头肉卤制配方</h3><p>猪头肉讲究"皮糯肉烂、肥而不腻"。</p><h4>卤料配比（1个猪头）</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量</th></tr><tr><td>八角</td><td>20g</td></tr><tr><td>桂皮</td><td>15g</td></tr><tr><td>香叶</td><td>8g</td></tr><tr><td>花椒</td><td>15g</td></tr><tr><td>草果</td><td>8g</td></tr><tr><td>白芷</td><td>5g</td></tr></table><h4>调味</h4><p>生抽300ml | 老抽80ml | 冰糖100g | 料酒200ml | 甜面酱50g</p><h3>要点</h3><p>1. 猪头需先火燎去毛，刮洗干净。</p><p>2. 劈开后焯水，大火煮10分钟捞出再洗一遍。</p><p>3. 卤制2-3小时至筷子能轻松插入。</p>' },
      { id: 18, title: '羊蹄秘制配方', slug: 'lamb-trotter-secret', category: 'secret', content: '<h3>红烧羊蹄配方</h3><p>羊蹄要做得好，关键在去膻和炖烂。</p><h4>去膻预处理</h4><p>1. 羊蹄火燎去毛，刮洗干净。</p><p>2. 冷水加料酒、姜片焯水，撇去浮沫后捞出。</p><h4>红烧调料</h4><table border="1" cellpadding="5"><tr><th>调料</th><th>用量</th></tr><tr><td>生抽</td><td>3大勺</td></tr><tr><td>老抽</td><td>1大勺</td></tr><tr><td>料酒</td><td>2大勺</td></tr><tr><td>冰糖</td><td>30g</td></tr><tr><td>豆瓣酱</td><td>1大勺</td></tr><tr><td>干辣椒</td><td>5-8个</td></tr><tr><td>花椒</td><td>15粒</td></tr></table><h3>要点</h3><p>1. 小火炖2-3小时至骨肉分离。</p><p>2. 最后大火收汁至浓稠。</p>' },
      { id: 19, title: '兔头秘制配方', slug: 'rabbit-head-secret', category: 'secret', content: '<h3>双流兔头卤制配方</h3><p>四川双流兔头是宵夜之王，麻辣鲜香，啃着过瘾。</p><h4>卤料配比（20个兔头）</h4><table border="1" cellpadding="5"><tr><th>香料</th><th>用量</th></tr><tr><td>八角</td><td>10g</td></tr><tr><td>桂皮</td><td>8g</td></tr><tr><td>草果</td><td>5g</td></tr><tr><td>干辣椒</td><td>80g</td></tr><tr><td>花椒</td><td>40g</td></tr><tr><td>小茴香</td><td>8g</td></tr><tr><td>山奈</td><td>5g</td></tr></table><h4>调味</h4><p>郫县豆瓣酱50g | 生抽100ml | 冰糖40g | 料酒50ml</p><h3>关键步骤</h3><p>1. 兔头处理干净，去淋巴，焯水去腥。</p><p>2. 豆瓣酱炒出红油后加入卤汤。</p><p>3. 卤制30分钟，关火浸泡1小时让其入味。</p><p>4. 食用时对半劈开，撒干辣椒面和花椒面。</p>' },
    ];
    for (const s of secrets) {
      await env.DB.prepare('INSERT OR IGNORE INTO knowledge_entries (id, title, slug, category, content) VALUES (?, ?, ?, ?, ?)')
        .bind(s.id, s.title, s.slug, s.category, s.content).run();
    }
    results.push("Inserted " + secrets.length + " secrets");

    return jsonResponse({ success: true, data: results });
  } catch (err: any) {
    console.error('Migration error:', err);
    return jsonResponse({ success: false, error: "Migration failed: " + (err as Error).message, data: results }, 500);
  }
}
