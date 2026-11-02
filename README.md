# kg-rail · 城市轨道交通运营管理课程平台

面向交通运输专业《城市轨道交通运营管理》课程的网络教学平台，将课程知识图谱、AI 问答、知识测试、课程资源和学生/教师管理集成在同一个站点中。

- 仓库地址：<https://github.com/dickwxyz/kg-rail>
- 运行方式：Node.js + Express 直接托管静态页面，无需构建步骤

## 功能

| 模块 | 页面 | 说明 |
| --- | --- | --- |
| 课程首页 | `index.html` | 课程简介、课程信息、学习目标、课程大纲、教师简介 |
| 知识图谱 | `knowledge-graph.html` | 基于 vis.js 的 GraphRAG 课程知识图谱可视化，支持节点搜索和多种布局 |
| AI 问答 | `aiqa.html` | 基于 DeepSeek 的问答，支持多话题、Markdown/代码/公式渲染 |
| 知识测试（暂未开放） | `test.html` | 导航入口保留，点击仅提示；服务端将直接访问重定向回首页 |
| 课程资源 | `resources.html` | 教材、章节文档、PPT、MOOC 视频、论文、作业与补充材料 |
| 登录 / 注册 | `login.html` / `register.html` | 按学号/工号长度区分学生与教师 |
| 用户中心 | `user-center.html` | 个人信息维护；学生查看学情（开发中）；教师筛选查看学生信息与教学建议（开发中） |

知识图谱、AI 问答和课程资源页面均要求登录后查看，未登录时显示登录提示卡片。

## 技术栈

- **后端**：Node.js + Express 4
- **数据库**：SQLite3（`user.db`）
- **前端**：原生 HTML / CSS / JavaScript，无构建流程
- **可视化**：vis.js 4.21
- **AI**：DeepSeek 官方 API，模型 `deepseek-flash`（DeepSeek-V4.1-Flash）
- **文档渲染**：markdown-it 14 + highlight.js 11 + MathJax 3

## 快速开始

环境要求：Node.js 18+（`sqlite3` 需要本地编译工具链）。

```bash
git clone git@github.com:dickwxyz/kg-rail.git
cd kg-rail
npm install
npm start
```

启动后访问：

- 本机：<http://localhost:5500>
- 局域网：`http://<本机IP>:5500`（服务监听 `0.0.0.0`）

自定义端口：

```bash
PORT=8080 npm start
```

### 配置 AI 密钥

```bash
cp .env.example .env
# 编辑 .env，填入 DEEPSEEK_API_KEY
```

`.env` 已被 `.gitignore` 排除。服务端读取后通过 `GET /api/config` 提供给页面，`aiqa.html` 加载时自动填入左侧输入框。

### 首次运行需要准备的数据

仓库通过 `.gitignore` 排除了以下内容，克隆后需要自行准备：

1. **`user.db`**：数据库文件不在仓库中。首次运行前需创建，表结构见下方[数据库](#数据库)。若文件不存在，`sqlite3` 会创建空文件，但登录、注册、测试等接口会因缺表而报错。
2. **`resources/`**：课程资源（教材 PDF、PPT、视频等）体积达数十 GB，未纳入版本库。需按 `resources.html` 中的链接路径放入对应目录，资源链接才能打开。

## 目录结构

```
kg-rail/
├── server.js                 # Express 服务：静态托管 + 认证/用户/测试接口
├── user.db                   # SQLite 数据库（未纳入版本库，静态访问已拦截）
├── .env.example              # 环境变量模板（复制为 .env 使用）
├── package.json
├── index.html                # 课程首页
├── login.html / register.html
├── knowledge-graph.html      # 知识图谱可视化
├── aiqa.html                 # AI 问答
├── test.html                 # 知识测试（入口保留，页面已关闭）
├── resources.html            # 课程资源导航
├── user-center.html          # 用户中心
├── data/
│   └── graph.json            # GraphRAG 图谱（85 节点 / 99 边 / 13 社区）
├── pic/                      # 首页图片素材
└── resources/                # 课程资源（未纳入版本库）
    ├── 城市轨道交通运营管理.pdf                # 主教材
    ├── 铁路站场及枢纽 第2版.pdf
    ├── markdown-book/        # 16 章 Markdown/HTML 文档
    ├── graph-rail/           # graphify 的输入 Markdown 与 graphify-out 输出
    ├── ppt/                  # 第 2~7、10~11 章课件（PDF，共 8 个）
    ├── video/                # 第 1~8、10~16 章 MOOC 视频（171 个）
    ├── paper/                # 学术论文
    ├── homework/             # 作业材料
    └── extra/                # 上海地铁线路图等补充材料
```

## 后端 API

服务端代码集中在 `server.js`，接口如下：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/register` | 注册。4 位工号注册为教师，9/10 位学号注册为学生 |
| `POST` | `/login` | 登录。按 ID 长度判定角色（4 位教师、10 位本科生、9 位研究生），返回 `userInfo` |
| `GET` | `/user-info?userId=` | 查询用户完整信息（用户中心使用） |
| `POST` | `/update-user-info` | 更新姓名、电话、邮箱、密码等资料 |
| `GET` | `/students?lesson=&grade=&teacher=` | 按课程/年级/教师筛选学生列表 |
| `GET` | `/student-filter-options?field=` | 获取筛选项去重值，`field` 仅允许 `lesson`、`grade`、`teacher` |
| `GET` | `/api/questions?limit=&type=&chapter=&difficulty=` | 随机抽取题目（默认 10 题），响应中已剔除 `answer` |
| `POST` | `/api/submit-test` | 提交答案，服务端评分并将作答记录写入 `answers` 表 |
| `GET` | `/api/config` | 返回服务端 `.env` 中的 DeepSeek API Key（供 AI 问答页使用） |

登录响应中的 `role` 为中文：`教师`、`本科生`、`研究生`。前端将 `userInfo`（`id`、`name`、`role`）存入 `localStorage`，服务端不维护会话或 Cookie。

## 数据库

`user.db` 包含以下表：

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `student` | `id`（主键）、`name`、`grade`、`phone`、`email`、`password`、`teacher`、`lesson` | 学号为 9~10 位数字 |
| `teacher` | `id`（主键）、`name`、`phone`、`email`、`password` | 工号为 4 位数字 |
| `questions` | `id`、`question`、`options`、`answer`、`type`、`lesson`、`difficulty`、`chapter`、`knowledge_point` | 题型：单选题、填空题、简答题、计算题 |
| `answers` | `id`、`test_id`、`datetime`、`user_id`、`question_id`、`input_answer`、`accuracy` | 每次提交按题目逐条记录 |
| `degree` | `x`、`y` | 历史遗留的图谱坐标表，当前代码未使用 |

评分规则（`POST /api/submit-test`）：

- 单选题：完全匹配得满分；
- 填空题：按分隔符拆分关键词，匹配率 ≥ 50% 计为正确，得分按匹配率折算；
- 简答题/计算题：按正确答案行拆分关键词，匹配率 > 30% 计为部分正确，得分按匹配率折算。

题目分值与题型、难度相关：单选 `2×难度`、填空 `3×难度`、简答 `5×难度`、计算 `10×难度`。

## 知识图谱

知识图谱由 graphify（GraphRAG）从 `resources/graph-rail/` 的 16 章 Markdown 中提取生成，`knowledge-graph.html` 通过 `fetch("./data/graph.json")` 加载并转换为 vis.js 的节点/边结构。

- **规模**：85 个节点（16 个文档节点 + 69 个概念节点）、99 条关系、13 个社区
- **置信度**：72 条 EXTRACTED、27 条 INFERRED；INFERRED 关系以虚线显示
- **社区**：按 13 个社区着色，社区名内联在页面中；`document` 节点为方框，`concept` 节点为圆点
- **关系映射**：graphify 输出的英文关系（contains、related_to 等）在页面上映射为中文
- **超边**：7 条 hyperedges 不渲染（vis.js 不支持原生超边）

页面提供节点搜索（支持节点名、来源文件、社区、说明）和五种布局：层次结构、力导向（ForceAtlas2）、Barnes-Hut、排斥布局（默认）、无物理（静态）。

更新图谱时，重新生成 `resources/graph-rail/graphify-out/graph.json` 后复制为 `data/graph.json`。`resources/` 不纳入版本库，页面只加载 `data/graph.json`。

## AI 问答配置

`aiqa.html` 直接调用 DeepSeek 官方 `chat/completions` 接口（`https://api.deepseek.com/chat/completions`），模型为 `deepseek-flash`（DeepSeek-V4.1-Flash）。

密钥保存在服务端 `.env` 的 `DEEPSEEK_API_KEY` 中，页面加载时通过 `GET /api/config` 自动填入左侧输入框，也可手动填写。前端源码中不再包含密钥。注意该接口对所有访问者开放，密钥仍可在浏览器网络请求中看到，仅适用于教学场景；生产环境应改为服务端代理调用，浏览器不接触密钥。对话历史仅存在于当前页面会话中，刷新后不保留。

系统提示词：`你是轨道交通领域的专家，能够回答相关专业性问题，语言能够体现专业性和逻辑性。`

## 课程章节

1. 绪论
2. 城市轨道交通系统技术经济特征
3. 列车运行和乘客出行的基本概念
4. 客流特性分析和服务设计原理
5. 运营计划编制技术
6. 城市轨道交通系统运输能力理论及计算
7. 能力加强技术与运营速度提高模式
8. 城市轨道交通系统运营调度指挥技术
9. 列车运行控制技术
10. 车站管理与客流组织技术
11. 城市轨道交通系统网络化运营组织技术
12. 城市轨道交通票务管理
13. 城市轨道交通运营设备维修管理
14. 城市轨道交通运营安全管理
15. 城市轨道交通企业运营组织机构与管理模式
16. 城市轨道交通政策和经营模式

## 已知安全问题

本项目为教学演示用途，以下问题在生产环境部署前必须处理：

1. **敏感文件访问**：已在 `server.js` 中加入静态路径拦截中间件，`/user.db`、`*.db`、`.env`、`server.js`、`package.json`、`node_modules/`、`.git/`、`.claude/`、`.vscode/` 均返回 404（已实测）。更彻底的做法是将静态目录拆分为独立的 `public/` 目录。
2. **密码明文存储与传输**：应使用 bcrypt 等算法加盐哈希，并强制 HTTPS。
3. **API Key 对外下发**：密钥已从源码移入 `.env`，但 `GET /api/config` 对所有访问者返回明文 Key。生产环境应改为服务端代理调用，浏览器不接触密钥。
4. **CORS 完全开放**：`origin: "*"`，任意站点均可调用接口。
5. **无会话与鉴权**：接口仅凭前端传入的 `userId` 操作数据，可越权查看/修改他人信息。
6. **无速率限制**：登录与注册接口可被暴力尝试。

## 许可

ISC
