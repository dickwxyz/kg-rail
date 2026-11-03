// 教学建议演示数据播种脚本
// 用法：
//   node scripts/seed-teaching-demo.js           # 首次播种；已存在则跳过
//   node scripts/seed-teaching-demo.js --reset   # 删除并重建全部演示数据
// 只操作 teacher='演示教师' / id 以 9900001 开头的学生，不影响真实班级。
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const { createTeachingModule, shanghaiDay } = require("../lib/teaching");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "user.db");
const RESET = process.argv.includes("--reset");
const DEMO_TEACHER = {
  id: "9999",
  name: "演示教师",
  phone: "13800009999",
  email: "demo@example.com",
  password: "1234",
};

const COURSES = [
  {
    key: "weak",
    lesson: "运营管理（演示·基础薄弱）",
    count: 12,
    currentChapter: 6,
    note: "第6章折返能力讲得较快，部分学生反应慢；沉默学生需要单独联系。",
    nextPlan: "下节课讲第7章，先用 15 分钟复习第6章折返能力。",
  },
  {
    key: "effort",
    lesson: "运营管理（演示·高投入低产出）",
    count: 12,
    currentChapter: 6,
    note: "学生提问非常多，但测试正确率偏低，可能只看答案没有回到教材。",
    nextPlan: "第7章前用 20 分钟讲透折返能力与发车间隔的关系。",
  },
  {
    key: "good",
    lesson: "运营管理（演示·整体良好）",
    count: 12,
    currentChapter: 9,
    note: "整体掌握较好，可以增加拓展题和同伴互助。",
    nextPlan: "进入第10章车站管理与客流组织，安排一次案例讨论。",
  },
  {
    key: "empty",
    lesson: "运营管理（演示·数据不足）",
    count: 5,
    currentChapter: 3,
    note: "新开课，尚无测试与提问，主要用于展示冷启动状态。",
    nextPlan: "先完成第3章随堂测试，再观察学习行为。",
  },
];

const NAMES = [
  "张伟", "王芳", "李娜", "刘洋", "陈晨", "杨帆", "赵磊", "黄敏", "周杰", "吴静",
  "徐鹏", "孙悦", "马超", "朱琳", "胡军", "郭婷", "何平", "高翔", "林雪", "罗强",
  "郑爽", "梁宇", "谢婷", "宋佳", "唐磊", "许静", "韩雪", "冯涛", "曹敏", "邓超",
  "彭飞", "曾丽", "萧然", "田甜", "董浩", "袁媛", "潘婷", "蒋涛", "蔡颖", "余波", "杜鹏",
];

const GRADES = ["24级本", "24级硕", "23级本"];

const RESOURCES = [
  { path: "resources/markdown-book/3列车运行和乘客出行的基本概念.html", label: "第3章 列车运行和乘客出行基本概念", type: "chapter_doc", chapter: 3 },
  { path: "resources/markdown-book/5运营计划编制技术.html", label: "第5章 运营计划编制技术", type: "chapter_doc", chapter: 5 },
  { path: "resources/markdown-book/6城市轨道交通系统运输能力理论及计算.html", label: "第6章 运输能力理论及计算", type: "chapter_doc", chapter: 6 },
  { path: "resources/markdown-book/10车站管理与客流组织技术.html", label: "第10章 车站管理与客流组织", type: "chapter_doc", chapter: 10 },
  { path: "resources/ppt/第5章 运营计划编制技术.pdf", label: "第5章 运营计划编制技术（课件）", type: "ppt", chapter: 5 },
  { path: "resources/ppt/第6章 运输能力理论及计算.pdf", label: "第6章 运输能力理论及计算（课件）", type: "ppt", chapter: 6 },
  { path: "resources/ppt/第10章 车站管理与客流组织.pdf", label: "第10章 车站管理与客流组织（课件）", type: "ppt", chapter: 10 },
  { path: "resources/video/3.2 运营速度与旅行速度.mp4", label: "3.2 运营速度与旅行速度", type: "video", chapter: 3 },
  { path: "resources/video/5.3 列车运行图.mp4", label: "5.3 列车运行图", type: "video", chapter: 5 },
  { path: "resources/video/6.2 折返能力.mp4", label: "6.2 折返能力", type: "video", chapter: 6 },
  { path: "resources/video/10.2 车站客流组织.mp4", label: "10.2 车站客流组织", type: "video", chapter: 10 },
  { path: "resources/paper/城市轨道交通网络化运营组织研究.pdf", label: "城市轨道交通网络化运营组织研究", type: "paper", chapter: null },
  { path: "resources/homework/第6章 运输能力计算作业.pdf", label: "第6章 运输能力计算作业", type: "homework", chapter: 6 },
];

const TOPIC_TEMPLATES = [
  {
    chapter: 6,
    title: "折返能力为什么限制通过能力",
    themes: ["折返能力", "通过能力", "发车间隔"],
    question: "为什么折返时间会限制通过能力？",
    followUps: ["那折返时间和发车间隔是什么关系？", "如果终点站有两条折返线，能力会提高多少？", "公式里的折返间隔怎么取？"],
    answer: "折返能力受折返线布置、列车停站时间和信号控制影响，是通过能力的限制环节之一。",
  },
  {
    chapter: 5,
    title: "列车运行图怎么画",
    themes: ["列车运行图", "运行线", "发车间隔"],
    question: "列车运行图里的运行线怎么确定？",
    followUps: ["发车间隔变了以后运行线怎么调整？", "大小交路在图上怎么表示？"],
    answer: "运行线由列车在各站的到发时刻决定，需满足区间运行时分和车站间隔时间。",
  },
  {
    chapter: 3,
    title: "运营速度和旅行速度的区别",
    themes: ["运营速度", "旅行速度", "站间距"],
    question: "运营速度和旅行速度到底有什么区别？",
    followUps: ["站间距越小，旅行速度是不是越低？", "那运营速度为什么不包括停站时间？"],
    answer: "运营速度通常按线路长度与运行时间计算，旅行速度还需计入中间站停站时间。",
  },
  {
    chapter: 10,
    title: "换乘站的客流组织",
    themes: ["换乘", "车站", "客流组织"],
    question: "换乘站高峰期客流组织有哪些原则？",
    followUps: ["换乘通道太窄时优先限流还是分流？"],
    answer: "换乘组织要遵循分流、限流、导向清晰和应急疏散优先的原则。",
  },
  {
    chapter: 9,
    title: "ATP 和 ATO 的区别",
    themes: ["ATP", "ATO", "列车自动控制"],
    question: "ATP 和 ATO 分别负责什么？",
    followUps: ["那 ATS 和它们是什么关系？"],
    answer: "ATP 负责安全防护，ATO 负责自动驾驶，ATS 负责行车调度与监控。",
  },
  {
    chapter: 4,
    title: "断面客流怎么计算",
    themes: ["客流", "断面客流", "不均衡"],
    question: "断面客流和车站上下车人数是什么关系？",
    followUps: ["单向不均衡系数怎么用？", "断面客流超过运能时怎么调整？"],
    answer: "断面客流由沿线各站上下车人数逐区间累加得到，需区分上下行方向。",
  },
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}
function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}
function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function scoreFor(type, difficulty) {
  const d = Number(difficulty) || 1;
  switch (type) {
    case "单选题": return 2 * d;
    case "填空题": return 3 * d;
    case "简答题": return 5 * d;
    case "计算题": return 10 * d;
    default: return d;
  }
}

function shuffle(list, rng) {
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pick(list, rng) {
  return list[Math.floor(rng() * list.length)];
}

function chapterOfFile(file) {
  const base = String(file || "").split("/").pop() || "";
  const m = base.match(/^(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

async function main() {
  const db = new sqlite3.Database(DB_PATH);
  const graph = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "data", "graph.json"), "utf8")
  );
  const teaching = createTeachingModule({
    db,
    graphNodes: graph.nodes || [],
    graphLinks: graph.links || [],
    env: process.env,
  });
  await teaching.ready;

  const demoStudentIds = [];
  for (const course of COURSES) {
    for (let i = 0; i < course.count; i += 1) {
      demoStudentIds.push(`9900001${String(demoStudentIds.length + 1).padStart(2, "0")}`);
    }
  }

  const existing = await dbGet(
    db,
    "SELECT COUNT(*) AS c FROM student WHERE teacher=?",
    [DEMO_TEACHER.name]
  );
  if (existing && existing.c > 0 && !RESET) {
    console.log("演示数据已存在，跳过。需要重建请加 --reset。");
    await new Promise((resolve) => db.close(resolve));
    return;
  }

  console.log(RESET ? "重建演示数据..." : "开始播种演示数据...");

  // 清空旧演示数据
  if (demoStudentIds.length) {
    const inSql = demoStudentIds.map(() => "?").join(",");
    await dbRun(db, `DELETE FROM learning_events WHERE user_id IN (${inSql})`, demoStudentIds);
    await dbRun(db, `DELETE FROM answers WHERE user_id IN (${inSql})`, demoStudentIds);
    await dbRun(db, `DELETE FROM test_attempts WHERE user_id IN (${inSql})`, demoStudentIds);
    await dbRun(
      db,
      `DELETE FROM chat_messages WHERE topic_id IN (
         SELECT id FROM chat_topics WHERE user_id IN (${inSql})
       )`,
      demoStudentIds
    );
    await dbRun(db, `DELETE FROM chat_topics WHERE user_id IN (${inSql})`, demoStudentIds);
    await dbRun(db, `DELETE FROM ai_topic_analysis WHERE user_id IN (${inSql})`, demoStudentIds);
  }
  await dbRun(db, "DELETE FROM student WHERE teacher=?", [DEMO_TEACHER.name]);
  await dbRun(db, "DELETE FROM teaching_reports WHERE teacher_id='9999'");
  await dbRun(db, "DELETE FROM course_progress WHERE teacher_id='9999'");

  await dbRun(
    db,
    `INSERT OR REPLACE INTO teacher (id, name, phone, email, password) VALUES (?, ?, ?, ?, ?)`,
    [DEMO_TEACHER.id, DEMO_TEACHER.name, DEMO_TEACHER.phone, DEMO_TEACHER.email, DEMO_TEACHER.password]
  );

  // 题目与章节映射
  const questions = await dbAll(
    db,
    "SELECT id, question, answer, type, difficulty, lesson FROM questions ORDER BY id"
  );
  if (!questions.length) {
    console.error("questions 表为空，无法生成演示测试数据。");
    await new Promise((resolve) => db.close(resolve));
    process.exitCode = 1;
    return;
  }
  await teaching.classifyQuestions({ lesson: questions[0].lesson || "运营管理" });
  const qcRows = await dbAll(db, "SELECT * FROM question_chapters");
  const qChapter = new Map();
  for (const row of qcRows) {
    if (!qChapter.has(row.question_id)) qChapter.set(row.question_id, row.chapter_no);
  }

  const graphNodes = (graph.nodes || []).filter((n) => n.id && n.source_file);
  const nodesByChapter = new Map();
  for (const node of graphNodes) {
    const ch = chapterOfFile(node.source_file);
    if (!ch) continue;
    if (!nodesByChapter.has(ch)) nodesByChapter.set(ch, []);
    nodesByChapter.get(ch).push(node);
  }

  const profiles = {
    weak: {
      target: [0.35, 0.55],
      chapterBias: { 3: 0.25, 5: 0.3, 6: 0.25, default: 0.55 },
      sessions: [3, 7],
      silentRatio: 0.25,
      topics: [0, 1],
      followUps: [0, 1],
      depth: [1.4, 2.6],
      unresolved: 0.35,
    },
    effort: {
      target: [0.45, 0.62],
      chapterBias: { 3: 0.4, 5: 0.45, 6: 0.3, default: 0.6 },
      sessions: [16, 26],
      silentRatio: 0,
      topics: [2, 3],
      followUps: [2, 4],
      depth: [3.4, 4.8],
      unresolved: 0.7,
    },
    good: {
      target: [0.8, 0.92],
      chapterBias: { 3: 0.85, 5: 0.86, 6: 0.75, default: 0.9 },
      sessions: [9, 16],
      silentRatio: 0,
      topics: [1, 2],
      followUps: [1, 3],
      depth: [2.8, 4.2],
      unresolved: 0.15,
    },
    empty: {
      target: [0, 0],
      chapterBias: { default: 0 },
      sessions: [0, 1],
      silentRatio: 0.8,
      topics: [0, 0],
      followUps: [0, 0],
      depth: [0, 0],
      unresolved: 0,
    },
  };

  let studentSeq = 0;
  let totalEvents = 0;
  let totalAttempts = 0;
  let totalTopics = 0;

  for (const course of COURSES) {
    const profile = profiles[course.key];
    const rng = mulberry32(
      course.key.split("").reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
    );
    const now = Date.now();
    const students = [];

    for (let i = 0; i < course.count; i += 1) {
      const id = `9900001${String(studentSeq + 1).padStart(2, "0")}`;
      studentSeq += 1;
      const name = NAMES[(studentSeq - 1) % NAMES.length];
      const grade = GRADES[studentSeq % GRADES.length];
      const student = { id, name, grade, lesson: course.lesson };
      students.push(student);
      await dbRun(
        db,
        `INSERT OR REPLACE INTO student (id, name, grade, phone, email, password, teacher, lesson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          name,
          grade,
          `138${String(10000000 + studentSeq).slice(0, 8)}`,
          `demo${studentSeq}@example.com`,
          "1234",
          DEMO_TEACHER.name,
          course.lesson,
        ]
      );
    }

    // 测试场次
    if (course.key !== "empty") {
      for (let i = 0; i < students.length; i += 1) {
        const student = students[i];
        const attempts = course.key === "weak" ? 1 : 2;
        for (let a = 0; a < attempts; a += 1) {
          const selected = shuffle(questions, rng).slice(0, 10);
          const graded = [];
          let correct = 0;
          let score = 0;
          for (const q of selected) {
            const chapter = qChapter.get(q.id) || 1;
            const bias =
              profile.chapterBias[chapter] !== undefined
                ? profile.chapterBias[chapter]
                : profile.chapterBias.default;
            const ok = rng() < bias;
            let input = "";
            let accuracy = 0;
            let earned = 0;
            if (ok) {
              input = q.answer;
              accuracy = 1;
              earned = scoreFor(q.type, q.difficulty);
              correct += 1;
            } else if (q.type === "单选题") {
              input = ["A", "B", "C", "D"].find((x) => x !== q.answer) || "A";
            } else {
              input = "不太清楚";
            }
            graded.push({
              questionId: q.id,
              inputAnswer: input,
              accuracy,
              correct: ok,
              earned,
              answered: true,
            });
            score += earned;
          }
          const daysAgo = 3 + Math.floor(rng() * 24);
          const submittedAt = now - daysAgo * 24 * 3600 * 1000 + Math.floor(rng() * 6 * 3600 * 1000);
          const durationMs = Math.floor((8 + rng() * 18) * 60 * 1000);
          const testId = `demo_${course.key}_${i + 1}_${a + 1}`;
          const result = {
            testId,
            userId: student.id,
            score,
            percentageScore: Math.round((correct / selected.length) * 100),
            totalQuestions: selected.length,
            correctCount: correct,
            wrongCount: selected.length - correct,
            timestamp: new Date(submittedAt).toISOString(),
          };
          await teaching.persistTestAttempt({
            testId,
            userId: student.id,
            lesson: course.lesson,
            startedAt: submittedAt - durationMs,
            submittedAt,
            durationMs,
            questions: selected,
            graded,
            result,
          });
          totalAttempts += 1;

          // 测试相关事件
          await insertEvent(db, {
            event: "test_start",
            userId: student.id,
            lesson: course.lesson,
            page: "test",
            ts: submittedAt - durationMs,
            payload: { testId, questionCount: selected.length },
          });
          await insertEvent(db, {
            event: "test_submit",
            userId: student.id,
            lesson: course.lesson,
            page: "test",
            ts: submittedAt,
            payload: { testId, score, percentage: result.percentageScore, durationMs },
          });
          totalEvents += 2;
        }
      }
    }

    // 学习行为
    for (let i = 0; i < students.length; i += 1) {
      const student = students[i];
      const silent = course.key === "empty" ? rng() < profile.silentRatio : rng() < profile.silentRatio;
      const sessions = silent
        ? 0
        : profile.sessions[0] + Math.floor(rng() * (profile.sessions[1] - profile.sessions[0] + 1));
      for (let s = 0; s < sessions; s += 1) {
        const daysAgo = Math.floor(rng() * 29);
        const baseTs = now - daysAgo * 24 * 3600 * 1000 + Math.floor(rng() * 10 * 3600 * 1000);
        const sessionId = `demo_${course.key}_${i + 1}_${s + 1}`;
        let seq = 0;
        const push = async (event, page, payload, offsetMs) => {
          seq += 1;
          await insertEvent(db, {
            event,
            userId: student.id,
            lesson: course.lesson,
            page,
            ts: baseTs + offsetMs,
            sessionId,
            uid: `${sessionId}_${seq}`,
            payload,
          });
          totalEvents += 1;
        };

        await push("page_view", pick(["index", "knowledge_graph", "aiqa", "resources"], rng), {}, 0);
        const durationMs = Math.floor((5 + rng() * 30) * 60 * 1000);
        await push("page_leave", "resources", { durationMs, visibleMs: durationMs, maxScrollPct: Math.floor(rng() * 100) }, durationMs);

        const graphCount = course.key === "effort" ? 4 + Math.floor(rng() * 8) : 1 + Math.floor(rng() * 4);
        for (let g = 0; g < graphCount; g += 1) {
          const chapter = pick(Object.keys(nodesByChapter), rng) || 6;
          const node = pick(nodesByChapter.get(Number(chapter)) || graphNodes, rng);
          if (!node) continue;
          await push("graph_node_open", "knowledge_graph", {
            nodeId: node.id,
            label: node.label,
            sourceFile: node.source_file,
            community: node.community,
            dwellMs: Math.floor(rng() * 120000),
          }, 1000 + g * 2000);
        }

        if (rng() < 0.55) {
          const keyword = pick(["折返能力", "发车间隔", "通过能力", "运行图", "断面客流"], rng);
          await push("graph_search", "knowledge_graph", {
            queryText: keyword,
            resultCount: 1 + Math.floor(rng() * 5),
            topNodeIds: [],
          }, 3000);
        }

        const resourceCount = course.key === "effort" ? 2 + Math.floor(rng() * 3) : Math.floor(rng() * 3);
        for (let r = 0; r < resourceCount; r += 1) {
          const resource = pick(RESOURCES, rng);
          const isDownload = rng() < 0.3;
          await push(isDownload ? "resource_download" : "resource_open", "resources", {
            path: resource.path,
            label: resource.label,
            resourceType: resource.type,
            chapter: resource.chapter,
            isDownload,
          }, 5000 + r * 1500);
          if (isDownload) {
            await push("resource_open", "resources", {
              path: resource.path,
              label: resource.label,
              resourceType: resource.type,
              chapter: resource.chapter,
              isDownload: false,
            }, 5500 + r * 1500);
          }
        }

        if (rng() < (course.key === "effort" ? 0.7 : 0.35)) {
          await push("ai_question", "aiqa", {
            topicId: "",
            mode: rng() < 0.3 ? "graph" : "normal",
            questionLen: 10 + Math.floor(rng() * 40),
          }, 8000);
        }
      }
    }

    // AI 对话
    if (course.key !== "empty") {
      for (let i = 0; i < students.length; i += 1) {
        const student = students[i];
        const topicCount =
          profile.topics[0] + Math.floor(rng() * (profile.topics[1] - profile.topics[0] + 1));
        for (let t = 0; t < topicCount; t += 1) {
          const template = pick(TOPIC_TEMPLATES, rng);
          const followUpCount =
            profile.followUps[0] +
            Math.floor(rng() * (profile.followUps[1] - profile.followUps[0] + 1));
          const createdAt = now - Math.floor(rng() * 28) * 24 * 3600 * 1000 - Math.floor(rng() * 8 * 3600 * 1000);
          const topicResult = await dbRun(
            db,
            `INSERT INTO chat_topics (user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
            [student.id, template.title, createdAt, createdAt + (followUpCount + 1) * 60000]
          );
          const topicId = topicResult.lastID;
          let msgTs = createdAt;
          const addMessage = async (role, content) => {
            await dbRun(
              db,
              `INSERT INTO chat_messages (topic_id, role, content, created_at, meta) VALUES (?, ?, ?, ?, ?)`,
              [topicId, role, content, msgTs, null]
            );
            msgTs += 45000;
          };
          await addMessage("user", template.question);
          await addMessage("assistant", template.answer);
          const userMessages = [template.question];
          const followUpTypes = { clarify: 0, new_question: 0, confirm: 0, challenge: 0 };
          for (let f = 0; f < followUpCount; f += 1) {
            const text = template.followUps[f % template.followUps.length];
            await addMessage("user", text);
            userMessages.push(text);
            if (/为什么|怎么|那|如果|是不是|关系|多少/.test(text)) followUpTypes.clarify += 1;
            else followUpTypes.new_question += 1;
            await addMessage(
              "assistant",
              f === followUpCount - 1 && profile.unresolved > 0.5
                ? "这个问题涉及线路条件和信号能力，建议结合第6章的具体参数再计算一次。"
                : "可以结合运行图与能力计算公式，分步骤看区间和折返两个环节。"
            );
          }
          const unresolved = rng() < profile.unresolved ? 1 : 0;
          const depth = profile.depth[0] + rng() * (profile.depth[1] - profile.depth[0]);
          await dbRun(
            db,
            `INSERT OR REPLACE INTO ai_topic_analysis
             (topic_id, user_id, course, chapter_no, title, user_message_count, assistant_message_count,
              follow_up_count, follow_up_types, depth_score, unresolved, themes, representative_question,
              summary, model, message_count_at_analysis, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', ?, ?)`,
            [
              topicId,
              student.id,
              course.lesson,
              template.chapter,
              template.title,
              userMessages.length,
              userMessages.length - 1 + 1,
              followUpCount,
              JSON.stringify(followUpTypes),
              Math.round(depth * 10) / 10,
              unresolved,
              JSON.stringify(template.themes),
              template.question,
              `共 ${userMessages.length} 次提问、${followUpCount} 次追问，主题：${template.themes.join("、")}${unresolved ? "；末轮仍未解决" : "。"}`,
              userMessages.length * 2,
              createdAt + (followUpCount + 1) * 60000,
            ]
          );
          totalTopics += 1;
        }
      }
    }

    // 教学进度
    await dbRun(
      db,
      `INSERT OR REPLACE INTO course_progress
       (teacher_id, course, current_chapter, note, next_plan, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [DEMO_TEACHER.id, course.lesson, course.currentChapter, course.note, course.nextPlan, Date.now()]
    );
  }

  // 预生成规则报告，保证无 DeepSeek Key 也能看到建议
  for (const course of COURSES) {
    const built = await teaching.buildTeachingFacts({
      teacherId: DEMO_TEACHER.id,
      lesson: course.lesson,
      range: "30d",
    });
    if (!built) continue;
    const report = teaching.buildRuleReport(built.facts);
    const now = Date.now();
    await dbRun(
      db,
      `INSERT OR REPLACE INTO teaching_reports
       (cache_key, teacher_id, course, range_key, current_chapter, facts_json, result_json,
        llm_status, model, prompt_version, created_at, expires_at)
       VALUES (?, ?, ?, '30d', ?, ?, ?, 'fallback', 'rule', 'teaching-v1', ?, ?)`,
      [
        `demo_${course.key}_${now}`,
        DEMO_TEACHER.id,
        course.lesson,
        course.currentChapter,
        JSON.stringify(built.facts),
        JSON.stringify(report),
        now,
        now + 365 * 24 * 3600 * 1000,
      ]
    );
  }

  await dbRun(
    db,
    `INSERT OR REPLACE INTO teaching_meta (key, value, updated_at) VALUES ('demo_seeded_at', ?, ?)`,
    [new Date().toISOString(), Date.now()]
  );

  console.log("演示数据播种完成：");
  console.log(`- 教师：${DEMO_TEACHER.name} / ${DEMO_TEACHER.id}，密码 ${DEMO_TEACHER.password}`);
  console.log(`- 课程：${COURSES.length} 门，学生：${studentSeq} 人`);
  console.log(`- 事件：${totalEvents} 条，测试场次：${totalAttempts} 次，AI 话题：${totalTopics} 个`);
  console.log("登录后进入「个人中心 → 教学建议」查看。");

  await new Promise((resolve) => db.close(resolve));
}

async function insertEvent(db, params) {
  const ts = params.ts || Date.now();
  const sessionId = params.sessionId || `demo_sess_${Math.random().toString(36).slice(2, 10)}`;
  const uid = params.uid || `${sessionId}_${Math.random().toString(36).slice(2, 10)}`;
  const chapterNo =
    params.event === "graph_node_open"
      ? chapterOfFile(params.payload && params.payload.sourceFile)
      : params.event === "resource_open" || params.event === "resource_download" || params.event === "link_click"
      ? Number((params.payload && params.payload.chapter) || 0) || null
      : null;
  await dbRun(
    db,
    `INSERT OR IGNORE INTO learning_events
     (event_uid, session_id, user_id, role, course, page, event, chapter_no, ref_type, ref_id,
      duration_ms, value_num, payload, client_ts, server_ts, day)
     VALUES (?, ?, ?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      uid,
      sessionId,
      params.userId,
      params.lesson,
      params.page,
      params.event,
      chapterNo,
      params.event === "graph_node_open" ? "node" : params.event.startsWith("resource") ? "resource" : null,
      params.event === "graph_node_open"
        ? String((params.payload && params.payload.nodeId) || "")
        : params.event.startsWith("resource")
        ? String((params.payload && params.payload.path) || "")
        : null,
      Number((params.payload && (params.payload.durationMs || params.payload.dwellMs)) || 0) || null,
      Number((params.payload && (params.payload.score || params.payload.percentage)) || 0) || null,
      JSON.stringify(params.payload || {}),
      ts,
      ts + 100,
      shanghaiDay(ts),
    ]
  );
}

main().catch((err) => {
  console.error("播种演示数据失败:", err);
  process.exitCode = 1;
});
