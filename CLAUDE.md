# CLAUDE.md

本文件为 Claude Code（claude.ai/code）提供在此代码库中工作时的指导说明。

## 项目概述

城市轨道交通运营管理课程的网络教学平台，包含知识图谱、AI 问答、知识测试、课程资源以及学生/教师管理。仓库地址：<https://github.com/dickwxyz/kg-rail>。面向用户的说明见 `README.md`。

## 技术栈

- **后端**：Node.js + Express 4
- **数据库**：SQLite3（`user.db`），通过 `sqlite3` 包的 `db.get` / `db.run` / `db.all` 访问
- **前端**：原生 HTML/CSS/JavaScript，无构建流程、无打包器，文件由 Express 直接托管
- **图谱可视化**：vis.js 4.21（CDN 引入）
- **AI**：DeepSeek 官方 API（`https://api.deepseek.com`），模型为 `deepseek-flash`（DeepSeek-V4.1-Flash）
- **知识图谱问答**：服务端基于 graphify 生成的 `data/graph.json`（优先 `resources/graph-rail/graphify-out/graph.json`）匹配节点并补充邻域关系，必要时调用 `graphify query` 做节点发现；再从 `resources/graph-rail/*.md` 选相关章节原文做“文档落地”；最后用原生 `claude -p` 循证生成回答（先引原文标注章节号，再说明图谱关系）；claude 子进程禁用全部工具
- **文档渲染**：marked 5、highlight.js 9、MathJax 3.2.2（均在 `vendor/` 本地托管，不依赖外网 CDN）
- **教学分析**：`lib/teaching.js` 负责行为事件、章节归因、班级统计与教学建议；前端埋点 `js/tracker.js`；教学建议页图表全部手写 SVG/CSS，不引入图表库

## 命令

```bash
# 安装依赖
npm install

# 启动服务器，默认 5500 端口，监听 0.0.0.0
npm start
# 或
node server.js

# 自定义端口
PORT=8080 node server.js

# 使用非默认数据库文件（测试/演示）
DB_PATH=/tmp/kg-rail-test.db node server.js

# 教学建议演示数据（教师 9999 / 密码 1234，4 个演示班级）
node scripts/seed-teaching-demo.js
node scripts/seed-teaching-demo.js --reset   # 删除并重建演示数据
```

没有测试脚本（`npm test` 仅为占位）。修改后端后可用 curl 直接验证接口，例如：

```bash
PORT=5599 node server.js &
curl -s "http://localhost:5599/api/questions?limit=2"
curl -s -X POST http://localhost:5599/login \
  -H 'Content-Type: application/json' \
  -d '{"userId":"0000","password":"x"}'
```

## 架构

### server.js 结构

单文件服务，按顺序为：数据库初始化（含 AI 问答表幂等创建）→ CORS/静态中间件 → AI 配置 → 话题/消息接口 → 知识图谱问答接口 → 注册 → 登录 → 用户信息 → 学生查询 → 测试题目 → 提交测试 → 错误处理 → 启动监听。

- 环境变量：启动时用内置的 `loadEnvFile()` 读取项目根目录 `.env`（零依赖，不覆盖已有环境变量），主要用于 `DEEPSEEK_API_KEY`
- 静态安全：`express.static` 之前有拦截中间件，拒绝 `.db/.sqlite`、`.env*`、`.git/`、`.claude/`、`.vscode/`、`server.js`、`package(-lock).json`、`node_modules/`，命中返回 404
- 静态文件：`app.use(express.static(__dirname))`，以项目根目录为静态目录
- 监听：`app.listen(port, "0.0.0.0")`，支持局域网访问
- 全局处理 `unhandledRejection` 与 `uncaughtException`，仅打印日志

### 后端接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/register` | 注册；4 位工号 → `teacher`，9/10 位学号 → `student` |
| POST | `/login` | 登录；按 ID 长度判定角色，明文比对密码，返回 `userInfo{id,name,role}` |
| GET | `/user-info?userId=` | 查询完整用户记录（包含密码字段） |
| POST | `/update-user-info` | 更新资料；4 位 ID 更新 `teacher`，9/10 位更新 `student` |
| GET | `/students?lesson=&grade=&teacher=` | 教师端筛选学生列表 |
| GET | `/student-filter-options?field=` | 筛选项去重值；`field` 白名单为 `lesson`/`grade`/`teacher` |
| GET | `/api/questions?limit=&type=&chapter=&difficulty=` | 随机抽题，默认 10 题，响应剔除 `answer` |
| POST | `/api/submit-test` | 服务端评分，并按题目逐条写入 `answers` 表 |
| GET | `/api/config` | 返回 `.env` 中的 `DEEPSEEK_API_KEY`、`DEEPSEEK_API_BASE_URL` 和 `DEEPSEEK_MODEL`，供 AI 问答页使用 |
| POST | `/api/graph-ask` | 知识图谱问答：graph.json 子图检索 → 课程 Markdown 原文片段 → `claude -p` 循证生成，返回 `answer` 与 `evidence{nodes,edges,sources}`；并发上限 2、默认 180s 超时 |
| GET | `/api/topics?userId=` | 用户话题列表，按 `updated_at DESC`，附 `messageCount` |
| POST | `/api/topics` | 新建话题（`userId`、`title`） |
| PUT | `/api/topics/:id` | 重命名话题（校验 `user_id`） |
| DELETE | `/api/topics/:id?userId=` | 删除话题及其全部消息 |
| GET | `/api/topics/:id/messages?userId=` | 话题下的全部消息（按 `id ASC`） |
| POST | `/api/topics/:id/messages` | 追加消息（`role` 仅 `user`/`assistant`），并更新话题 `updated_at` |
| PUT | `/api/topics/:id/messages/:messageId` | 覆盖消息内容（AI 重新生成） |
| DELETE | `/api/topics/:id/messages/:messageId?userId=` | 删除单条消息 |

### 教学分析接口（`lib/teaching.js` 注册）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/events` | 批量行为埋点；白名单事件、payload 过滤、每分钟限流、按 `(session_id,event_uid)` 去重 |
| GET | `/api/teaching/courses?teacher=` | 教师名下课程、学生数与已录进度 |
| GET | `/api/teaching/overview?teacherId=&lesson=&range=` | 班级 KPI、数据质量、高风险学生 |
| GET | `/api/teaching/chapters?...` | 16 章掌握度、覆盖率、困惑热度、重讲优先级 |
| GET | `/api/teaching/students?...&sort=` | 学生明细、班级均值、风险标签 |
| GET | `/api/teaching/student/:userId?...` | 单生详情：章节正确率、测试、对话、资源 |
| GET | `/api/teaching/dialogues?...` | AI 话题数、追问率、深度、困惑主题、未解决话题 |
| GET | `/api/teaching/resources?...` | 资源类型/章节分布、Top 条目、学生使用 |
| GET | `/api/teaching/trend?...` | 按天活跃、测试、AI 提问、图谱、资源趋势 |
| GET/POST | `/api/teaching/progress` | 教师当前章节、备注、下节课计划 |
| POST | `/api/teaching/report` | 生成/缓存教学建议（DeepSeek + 规则兜底） |
| GET | `/api/teaching/report/latest?teacherId=&lesson=` | 最近一次建议与证据 |
| GET | `/api/teaching/questions/attribution?...` | 题目—章节映射与复核列表 |
| PUT | `/api/teaching/questions/:id/chapter` | 教师人工修正题目章节 |
| POST | `/api/teaching/classify-questions` | 图谱匹配 + DeepSeek 预填题目章节 |
| POST | `/api/teaching/analyze-dialogues` | 按话题分析追问类型、深度与未解决状态 |

`range` 取 `7d|30d|90d|all`，默认 `30d`；所有教学接口只做“教师存在 + 课程归属”校验，项目没有服务端会话，这不是安全边界。

注册时按前端提交的 `userType`（`student`/`teacher`）与 ID 长度共同判定表名；登录时仅按 ID 长度判定。登录返回的 `role` 为中文「教师」「本科生」「研究生」，前端用户中心依赖该值切换侧边栏。

### 数据库结构

`user.db` 包含：

- **student**：`id`（主键，9~10 位数字）、`name`、`grade`、`phone`、`email`、`password`、`teacher`、`lesson`
- **teacher**：`id`（主键，4 位数字）、`name`、`phone`、`email`、`password`
- **questions**：`id`、`question`、`options`（JSON 字符串）、`answer`、`type`（单选题/填空题/简答题/计算题）、`lesson`、`difficulty`、`chapter`、`knowledge_point`
- **answers**：`id`、`test_id`、`datetime`、`user_id`、`question_id`、`input_answer`、`accuracy`
- **chat_topics**：`id`、`user_id`、`title`、`created_at`、`updated_at`（毫秒时间戳）
- **chat_messages**：`id`、`topic_id`、`role`（`user`/`assistant`）、`content`、`created_at`（毫秒时间戳）、`meta`（JSON 文本，存图谱证据）；旧库启动时自动 `ALTER TABLE` 补列
- **chapters**：16 章字典（`chapter_no`、`name`、`source_file`、`graph_node_id`、`keywords`），启动时由 `data/graph.json` 的 document 节点幂等写入
- **question_chapters**：题目→章节映射（`question_id`、`chapter_no`、`weight`、`knowledge_point`、`confidence`、`source∈graph/llm/manual`、`reviewed`），支持一题多章
- **learning_events**：行为事件（`event_uid`、`session_id`、`user_id`、`role`、`course`、`page`、`event`、`chapter_no`、`payload`、`client_ts`、`server_ts`、`day`）；唯一索引 `(session_id,event_uid)` 去重，默认保留 365 天
- **test_attempts**：测试场次汇总（`test_id`、`user_id`、`course`、`score`、`full_score`、`score_rate`、`chapter_breakdown`、`duration_ms`）；由 `/api/submit-test` 与 `answers` 同一事务写入
- **ai_topic_analysis**：按话题缓存追问数、追问类型、深度分、未解决、主题与代表性原话；消息数变化才重新分析
- **course_progress**：教师当前章节、备注、下节课计划，主键 `(teacher_id, course)`
- **teaching_reports**：教学建议缓存（`cache_key`、`facts_json`、`result_json`、`llm_status∈ok/cached/fallback`）
- **teaching_meta**：演示数据播种时间等元信息
- **degree**：`x`、`y`，历史遗留的图谱坐标表，当前代码没有使用

`server.js` 启动时幂等创建 `chat_topics` / `chat_messages` 以及上述教学表（`lib/teaching.js` 的 `ensureTeachingTables()`）；其余 `student` / `teacher` / `questions` / `answers` 仍需已有 `user.db` 自带。

### 评分逻辑（`/api/submit-test`）

- 单选题：完全匹配；
- 填空题：按 `[,，、\s]` 拆分关键词，匹配率 ≥ 50% 判对，得分按匹配率折算；
- 简答题/计算题：按正确答案的行拆分关键词，匹配率 > 30% 判部分正确，得分折算；
- 题面分值：单选 `2×难度`、填空 `3×难度`、简答 `5×难度`、计算 `10×难度`（难度缺省为 1）。

### 会话管理

无服务端登录会话。登录成功后前端将 `userInfo` 写入 `localStorage`，各页面加载时读取以切换登录/用户 UI；退出即删除该键。测试页还会把当前测试状态写入 `localStorage` 的 `currentTest`，保留 24 小时。

AI 问答的话题与消息按 `userId` 存在服务端 `chat_topics` / `chat_messages` 表中，刷新或换设备登录同一账号后可恢复。话题接口同样只信任请求里的 `userId`，所有 SQL 都带 `user_id` 条件做归属校验，但知道他人学号/工号仍可越权访问。

### 前端页面

- **index.html**：课程首页，导航栏根据 `localStorage` 显示登录/退出；内容公开
- **login.html / register.html**：认证页；注册表单随用户类型切换学生/教师字段
- **knowledge-graph.html**：知识图谱。登录后加载 `./data/graph.json`（GraphRAG 输出），转换为 vis.js 节点/边；未登录显示提示卡片并隐藏图谱
- **aiqa.html**：AI 问答。登录后可用；左侧切换模型，页面加载时 `loadApiConfig()` 从 `/api/config` 读取 Key 并填入输入框，也可手动填写；前端源码不包含密钥；公式先统一为 `$`/`$$` 定界符，再由本地 MathJax 排版。话题列表来自 `/api/topics`，显示创建时间（`YYYY-MM-DD HH:mm:ss`）；新建话题先创建本地草稿，首条消息发出时才 `POST /api/topics` 落库，空草稿离开即丢弃；支持切换、重命名、删除话题，并同步单条消息的删除与 AI 重新生成。`viewToken` 用于丢弃切换话题后返回的过期 AI 回复。工具栏“知识图谱”按钮是持续开关：开启后按钮加 `.active`、显示提示条，提问改走 `POST /api/graph-ask`；回答下方渲染可折叠的“知识图谱检索依据”（节点、关系、章节原文片段），并用 `<mark class="kg-hl">` 高亮答案中的节点名。证据存入 assistant 消息的 `meta`，刷新后恢复；图谱失败只显示错误，不回退 DeepSeek
- **test.html**：知识测试。登录后点击「开始测试」调用 `/api/questions` 随机抽题（默认 10 题），渲染 `.question-card`；提交后调用 `/api/submit-test` 由服务端评分。测试状态写入 `localStorage.currentTest`，保留 24 小时
- **resources.html**：课程资源导航，按教材/章节文档/PPT/视频/论文/作业/补充材料分区；未登录显示提示
- **user-center.html**：个人信息编辑；学生显示「学情检测」（开发中）；教师显示「学生信息」筛选表格与「教学建议」。教学建议页包含课程/时间范围切换、教学进度录入、KPI、章节掌握度条形图与热力格、SVG 活跃趋势、追问类型/资源类型环形图、AI 提问与追问、资源使用、学生明细与详情弹层、题目章节复核、DeepSeek/规则建议卡片；支持 `#teaching-section` 深链
- **js/tracker.js**：共享埋点，记录页面停留、链接/资源打开下载、按钮点击、图谱节点/搜索、AI 提问与回答、测试节奏、输入长度/粘贴/停留；**不记录输入正文、按键、剪贴板**
- **js/teaching-center.js**：教学建议页控制器与手写 SVG 图表（sparkline、折线/面积、环形、热力格）；样式内联在 `user-center.html`

统一的登录守卫模式：页面内 `#login-reminder` 卡片默认隐藏，`checkLogin()` 在未登录时显示卡片并隐藏内容容器。新增受保护页面应沿用该模式。

### 知识图谱数据

- 数据来源：graphify（GraphRAG）从 `resources/graph-rail/*.md` 提取，原始输出在 `resources/graph-rail/graphify-out/graph.json`
- 仓库内副本：`data/graph.json`；`resources/` 被 `.gitignore` 排除，页面只能加载 `data/graph.json`
- 规模：85 节点（16 个 `document` + 69 个 `concept`）、99 条边、13 个社区、7 条 hyperedges（忽略）
- 结构：`{nodes:[{id,label,norm_label,file_type,community,source_file,...}], links:[{source,target,relation,confidence,confidence_score,...}]}`
- 社区名：`.graphify_labels.json` 是 dotfile，`express.static` 默认不提供，因此 13 个社区名内联在 `COMMUNITY_NAMES`
- 关系：英文 `relation` 经 `RELATION_ZH` 映射为中文显示，未知类型回退英文
- 渲染：`convertGraphJsonToVisFormat()` 转换为 `{nodes, edges}`；`setupNetwork()` 只补缺失字段，不覆盖转换时生成的样式
- 视觉编码：按社区着色、`document` 为方框、`concept` 为圆点、INFERRED 边为虚线、无箭头（数据是无向图）
- 布局：固定使用 graph.html 原生的 `forceAtlas2Based` 力导向（`gravitationalConstant: -60`、`springLength: 120`、`springConstant: 0.08`、`damping: 0.4`）；`stabilization` 200 次后关闭物理引擎；不再提供布局切换

更新图谱时，重新生成后执行 `cp resources/graph-rail/graphify-out/graph.json data/graph.json`，并检查 `COMMUNITY_NAMES`/`COMMUNITY_COLORS`（社区编号可能变化）。

### 课程资源

`resources/` 由 `.gitignore` 排除（约 37 GB），不随仓库分发，包含：

- `城市轨道交通运营管理.pdf`：主教材
- `markdown-book/`：16 章的 `.md` 与 `.html`，另有 `image/` 图片目录
- `graph-rail/`：graphify 的输入 Markdown 与 `graphify-out/` 输出
- `ppt/`：第 2~7、10~11 章课件（8 个 PDF；课程本身没有第 8、9 章课件）
- `video/`：第 1~8、10~16 章 MOOC 视频（171 个 mp4；第 9 章本身没有视频）
- `paper/`：学术论文
- `homework/`：作业材料
- `extra/`：上海地铁线路图（PNG / shp 压缩包）

`resources.html` 中大量写死了资源路径与章节名，调整目录结构时需同步更新该页面。

### 课程章节

共 16 章：绪论、系统技术经济特征、列车运行与乘客出行基本概念、客流特性与服务设计、运营计划编制、运输能力理论与计算、能力加强与速度提高、运营调度指挥、列车运行控制、车站管理与客流组织、网络化运营组织、票务管理、设备维护管理、安全管理、企业组织结构与管理模式、政策和商业模式。

## 开发注意事项

- 所有 HTML 页面各自内联样式与脚本，导航结构复制粘贴，修改导航或页头时需逐页同步
- 用户类型判定强依赖 ID 长度：4 位 = 教师，10 位 = 本科生，9 位 = 研究生；改动前先确认前后端一致
- 前端所有接口均使用相对路径（`/login`、`/api/questions` 等），必须通过服务器访问，直接打开 HTML 文件会失败
- 中文内容与注释为项目惯例，新增文档和注释默认使用中文
- `resources/`、`user.db`、`.env`、`node_modules/` 均不纳入版本库，不要提交；新增密钥一律写入 `.env` 并同步更新 `.env.example`
- 前端第三方库统一放在 `vendor/`，不要引用外网 CDN（学校网络可能无法访问 jsdelivr）
- AI 问答的 SQL 必须始终带 `user_id` 条件（话题归属）并参数化；消息操作同时校验 `topic_id`
- 调试图谱检索可直接运行 `graphify query "发车间隔" --budget 800 --graph data/graph.json`；`claude -p` 子进程保持 `--tools ""`，不要为图省事放开 Bash/Python 权限
- 图谱问答的“文档落地”依赖 `resources/graph-rail/*.md`：按节点 `source_file` 和问题词元匹配章节片段；移动或重命名章节文件时需同步图谱 `source_file`
- 教学分析代码集中在 `lib/teaching.js`，`server.js` 只实例化并注册路由；该目录已被静态拦截。新增教学接口时保持“统计由服务端计算、LLM 只做叙述”的边界
- 教学建议的演示数据由 `scripts/seed-teaching-demo.js` 生成，只操作 `teacher='演示教师'` / `9900001` 开头的学生；真实班级数据不受影响。演示教师 `9999 / 1234`
- 埋点事件必须先加入 `EVENT_TYPES` 与 `PAYLOAD_KEYS` 白名单；新增字段不要记录答题正文或个人敏感信息
- 教学建议页图表全部手写 SVG/CSS，不要引入 ECharts/Chart.js/D3 或构建工具；新增图表沿用 `js/teaching-center.js` 的 `render*` 风格

## 安全考虑

- **静态目录暴露**：已用拦截中间件修复（`/user.db`、`.env`、`server.js`、`/lib/`、`/scripts/` 等实测返回 404）；静态服务根目录仍是项目根，新增敏感文件时需同步加入 `isBlockedStaticPath()`，更彻底的做法是拆分 `public/` 目录
- **密码明文**：数据库中明文存储、明文比对，应改为 bcrypt 等加盐哈希
- **DeepSeek Key 下发**：密钥已从源码移入 `.env`，经 `/api/config` 明文返回给任何访问者，仅适用于教学场景；生产环境应改为服务端代理
- **知识图谱问答子进程**：`/api/graph-ask` 无鉴权，会 spawn `claude -p`。已用 `--tools ""` 禁用全部工具、`execFile` 运行 graphify（不拼接 shell）、并发上限 2 与默认 180s 超时；仍可能被滥用消耗本机 Claude 配额，建议只在本机或可信网络开放
- **CORS 全开放**：`origin: "*"`，任意来源可调用接口
- **无鉴权**：接口只信任请求中的 `userId`，可越权读取或修改他人资料；`/user-info` 还会返回密码字段。AI 问答话题接口已按 `user_id` 校验归属，但知道他人学号/工号仍可读写其话题；教学分析接口同样只校验教师工号与课程归属，知道工号即可查询班级分析
- **行为埋点与教学分析**：`POST /api/events` 无鉴权，只接受白名单事件与用户表内存在的 ID，并按用户限流；payload 过滤掉答题正文等非白名单字段。AI 提问正文已在 `chat_messages` 中，教学分析会把它作为课程内容送入 DeepSeek，并做提示注入防护；送给模型的事实用匿名 `student_key`，不传姓名、学号、手机、邮箱
- **SQL 拼接**：表名与字段名由长度判定或白名单控制，值均使用参数化占位符；新增动态 SQL 时保持白名单 + 参数化
- **无速率限制、未强制 HTTPS**
