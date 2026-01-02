// 应用：用户注册/登录 API 服务（Express + SQLite）
// 结构：数据库初始化 / 中间件与跨域 / 注册接口 / 登录接口 / 辅助函数 / 启动服务
const express = require("express");   
const bodyParser = require("body-parser");    
const sqlite3 = require("sqlite3").verbose();   
const cors = require("cors"); // 引入 CORS    
const app = express();    
const port = parseInt(process.env.PORT || "5500", 10);    

process.on('unhandledRejection', (reason) => {
  console.error('未处理的 Promise 拒绝:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error);
});

// 数据库初始化：连接本地 SQLite 文件（user.db）
const db = new sqlite3.Database("./user.db", (err) => { 
  if (err) console.error("数据库连接失败:", err.message);
  else console.log("已连接到 SQLite 数据库");   
});
// 中间件与跨域配置：启用 CORS、解析 JSON 请求体、统一响应头
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(bodyParser.json());
app.use(express.static(__dirname)); // 静态文件服务
// 预检请求处理（符合跨域场景的浏览器预检）
// 为所有路由处理预检请求
app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.sendStatus(200);
});
// 允许跨域请求（如果前端与后端不同端口）
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// 注册接口：参数校验 → 按用户类型选择表 → 唯一性检查 → 插入 → 响应
// 注意：密码目前为明文存储，生产环境应使用加盐哈希（如 bcrypt）
app.post("/register", (req, res) => {
  const { userId, name, grade, phone, email, password, userType, teacherName, lessonName } =
    req.body;

    if (!userId || !name || !phone || !email || !password || !userType) {
      return res.status(400).json({ success: false, message: '所有字段都必须填写！' });
    }

  // 根据学号/工号长度决定注册到哪个表
  let tableName = "";
  let userIdLength = userId.length;

  if ((userIdLength === 10 || userIdLength === 9) && userType === "student") {
    tableName = "student";
  } else if (userIdLength === 4 && userType === "teacher") {
    tableName = "teacher";
  } else {
    return res
      .status(400)
      .json({ success: false, message: "学号/工号格式不正确！" });
  }

  // 检查邮箱和学号/工号是否已存在
  db.get(`SELECT * FROM ${tableName} WHERE id = ? `, (err, row) => {
    if (err) {
      return res
        .status(500)
        .json({ success: false, message: "数据库查询出错！" });
    }

    if (row) {
      return res
        .status(400)
        .json({ success: false, message: "学号/工号已被注册！" });
    }

    // 插入新用户数据（教师不插入年级字段）
    let sql = "";
    let params = [];
    if (userType === "teacher") {
      sql = `INSERT INTO ${tableName} (id, name, phone, email, password) VALUES (?, ?, ?, ?, ?)`;
      params = [userId, name, phone, email, password];
    } else {
      sql = `INSERT INTO ${tableName} (id, name, grade, phone, email, password, teacher, lesson) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      params = [userId, name, grade, phone, email, password, teacherName, lessonName];
    }

    db.run(sql, params, function (err) {
      if (err) {
        console.error("数据库插入错误:", err.message);
        return res
          .status(500)
          .json({ success: false, message: "注册失败，请稍后重试！" });
      }

      res
        .status(200)
        .json({ success: true, message: "注册成功！", userId: this.lastID });
    });
  });
});

// 登录接口：按 ID 长度判定用户类型（教师/本科生/研究生）并验证密码
app.post('/login', (req, res) => {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ success: false, message: '学号/工号和密码不能为空！' });
    }

    // 根据ID长度判断用户类型并校验
    const idLength = userId.length;
    if (idLength === 4) {
      // 教师登录
      return handleLogin('teacher', 'id', userId, password, '教师', res);
    }
    if (idLength === 10) {
      // 本科生登录
      return handleLogin('student', 'id', userId, password, '本科生', res);
    }
    if (idLength === 9) {
      // 研究生登录
      return handleLogin('student', 'id', userId, password, '研究生', res);
    }

    return res.status(400).json({ success: false, message: '学号/工号格式不正确！' });
});

// 登录辅助函数：查询指定表，统一 userInfo 返回结构
function handleLogin(tableName, idColumn, userId, password, userType, res) {
  db.get(`SELECT * FROM ${tableName} WHERE ${idColumn} = ?`, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: '数据库查询失败！' });
    }

    if (!row || row.password !== password) {
      return res.status(400).json({ success: false, message: '学号/工号或密码错误！' });
    }

    // 统一返回字段以匹配前端 localStorage 结构
    const userInfo = {
      id: row[idColumn],
      name: row.name,
      role: userType,
    };

    // 返回用户信息（不依赖 cookie）
    return res.status(200).json({ success: true, message: '登录成功！', userInfo });
  });
}

// 获取用户信息接口
app.get('/user-info', (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ success: false, message: '用户ID不能为空！' });
  }

  // 根据ID长度判断用户类型
  const idLength = userId.length;
  let tableName = '';

  if (idLength === 4) {
    tableName = 'teacher';
  } else if (idLength === 10 || idLength === 9) {
    tableName = 'student';
  } else {
    return res.status(400).json({ success: false, message: '用户ID格式不正确！' });
  }

  db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [userId], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: '数据库查询失败！' });
    }

    if (!row) {
      return res.status(404).json({ success: false, message: '用户不存在！' });
    }

    return res.status(200).json({ success: true, userInfo: row });
  });
});

// 更新用户信息接口
app.post('/update-user-info', (req, res) => {
  const { userId, name, phone, email, password, grade, teacher, lesson } = req.body;

  if (!userId || !name || !phone || !email || !password) {
    return res.status(400).json({ success: false, message: '必填字段不能为空！' });
  }

  // 根据ID长度判断用户类型
  const idLength = userId.length;
  let tableName = '';
  let sql = '';
  let params = [];

  if (idLength === 4) {
    tableName = 'teacher';
    sql = `UPDATE ${tableName} SET name = ?, phone = ?, email = ?, password = ? WHERE id = ?`;
    params = [name, phone, email, password, userId];
  } else if (idLength === 10 || idLength === 9) {
    tableName = 'student';
    sql = `UPDATE ${tableName} SET name = ?, phone = ?, email = ?, password = ?, grade = ?, teacher = ?, lesson = ? WHERE id = ?`;
    params = [name, phone, email, password, grade, teacher, lesson, userId];
  } else {
    return res.status(400).json({ success: false, message: '用户ID格式不正确！' });
  }

  db.run(sql, params, function(err) {
    if (err) {
      console.error('更新用户信息失败:', err.message);
      return res.status(500).json({ success: false, message: '更新失败！' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ success: false, message: '用户不存在！' });
    }

    return res.status(200).json({ success: true, message: '更新成功！' });
  });
});

// 获取学生信息接口（教师功能）
app.get('/students', (req, res) => {
  const { lesson, grade, teacher } = req.query;

  let sql = 'SELECT id, name, grade, phone, email, teacher, lesson FROM student WHERE 1=1';
  const params = [];

  // 根据筛选条件构建查询
  if (lesson) {
    sql += ' AND lesson = ?';
    params.push(lesson);
  }

  if (grade) {
    sql += ' AND grade = ?';
    params.push(grade);
  }

  if (teacher) {
    sql += ' AND teacher = ?';
    params.push(teacher);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('查询学生信息失败:', err.message);
      return res.status(500).json({ success: false, message: '查询失败！' });
    }

    return res.status(200).json({ success: true, students: rows || [] });
  });
});

// 获取学生表字段去重值接口（用于筛选下拉菜单）
app.get('/student-filter-options', (req, res) => {
  const { field } = req.query;

  // 只允许查询特定字段
  const allowedFields = ['lesson', 'grade', 'teacher'];
  if (!field || !allowedFields.includes(field)) {
    return res.status(400).json({ success: false, message: '无效的字段名！' });
  }

  const sql = `SELECT DISTINCT ${field} FROM student WHERE ${field} IS NOT NULL AND ${field} != '' ORDER BY ${field}`;

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error('查询字段选项失败:', err.message);
      return res.status(500).json({ success: false, message: '查询失败！' });
    }

    // 提取字段值到数组
    const options = rows.map(row => row[field]);
    return res.status(200).json({ success: true, options });
  });
});

// 获取测试题目接口
app.get('/api/questions', (req, res) => {
  // 获取请求参数，可以根据需要添加过滤条件
  const { limit = 10, type, chapter, difficulty } = req.query;

  let sql = 'SELECT id, question, options, answer, type, chapter, difficulty, knowledge_point FROM questions WHERE 1=1';
  const params = [];

  // 根据筛选条件构建查询
  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }

  if (chapter) {
    sql += ' AND chapter = ?';
    params.push(chapter);
  }

  if (difficulty) {
    sql += ' AND difficulty = ?';
    params.push(difficulty);
  }

  // 随机排序并限制数量
  sql += ' ORDER BY RANDOM() LIMIT ?';
  params.push(parseInt(limit, 10));

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error('获取测试题目失败:', err.message);
      return res.status(500).json({ success: false, message: '获取题目失败！' });
    }

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '未找到题目！' });
    }

    // 确保选项是有效的JSON字符串并移除答案字段
    const questions = rows.map(q => {
      // 创建一个不包含答案的对象
      const { answer, ...questionWithoutAnswer } = q;

      // 如果选项是JSON字符串，尝试解析它
      if (questionWithoutAnswer.options) {
        try {
          const optionsObj = JSON.parse(questionWithoutAnswer.options);
          questionWithoutAnswer.options = JSON.stringify(optionsObj); // 再次转换确保是有效的JSON
        } catch (e) {
          // 如果解析失败，保持原样
          console.warn('选项解析失败:', questionWithoutAnswer.id, e.message);
        }
      }
      return questionWithoutAnswer;
    });

    return res.status(200).json({ success: true, questions });
  });
});

// 提交测试答案接口
app.post('/api/submit-test', (req, res) => {
  const { userId, userType, answers } = req.body;

  if (!userId || !answers) {
    return res.status(400).json({ success: false, message: '参数不完整！' });
  }

  // 获取所有回答的题目ID
  const questionIds = Object.keys(answers);

  if (questionIds.length === 0) {
    return res.status(400).json({ success: false, message: '没有提交任何答案！' });
  }

  // 查询这些题目的正确答案
  const placeholders = questionIds.map(() => '?').join(',');
  const sql = `SELECT id, answer, type, difficulty FROM questions WHERE id IN (${placeholders})`;

  db.all(sql, questionIds, (err, rows) => {
    if (err) {
      console.error('查询题目答案失败:', err.message);
      return res.status(500).json({ success: false, message: '评分失败！' });
    }

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '未找到相关题目！' });
    }

    // 计算得分
    let correctCount = 0;
    let totalScore = 0;
    let wrongCount = 0;

    // 生成一个唯一的test_id (时间戳+随机数)
    const testId = Date.now() + Math.floor(Math.random() * 1000);
    const currentDateTime = new Date().toISOString();

    // 准备批量插入答案的语句
    const insertAnswersSql = `INSERT INTO answers (test_id, datetime, user_id, question_id, input_answer, accuracy) VALUES (?, ?, ?, ?, ?, ?)`;
    const answerValues = [];

    rows.forEach(question => {
      const userAnswer = answers[question.id];
      const correctAnswer = question.answer;

      // 根据题型和难度计算该题分值
      let questionScore = 0;
      switch(question.type) {
        case '单选题':
          questionScore = 2 * (question.difficulty || 1);
          break;
        case '填空题':
          questionScore = 3 * (question.difficulty || 1);
          break;
        case '简答题':
          questionScore = 5 * (question.difficulty || 1);
          break;
        case '计算题':
          questionScore = 10 * (question.difficulty || 1);
          break;
        default:
          questionScore = question.difficulty || 1;
      }

      // 评分逻辑：单选题完全匹配，填空题和简答题部分匹配也可以得分
      let isCorrect = false;
      let accuracy = 0; // 正确率，0-1之间的值

      if (question.type === '单选题') {
        // 单选题必须完全匹配
        isCorrect = userAnswer === correctAnswer;
        accuracy = isCorrect ? 1 : 0;
      } else if (question.type === '填空题') {
        // 填空题允许部分匹配（包含关键词）
        if (userAnswer && correctAnswer) {
          const userAnswerWords = userAnswer.split(/[,，、\s]+/);
          const correctAnswerWords = correctAnswer.split(/[,，、\s]+/);

          // 计算正确匹配的关键词数量
          const matchedWords = userAnswerWords.filter(word =>
            correctAnswerWords.some(correct => correct.includes(word) || word.includes(correct))
          );

          // 计算匹配率
          accuracy = correctAnswerWords.length > 0 ? matchedWords.length / correctAnswerWords.length : 0;

          // 如果匹配率超过50%，判定为正确
          if (accuracy >= 0.5) {
            isCorrect = true;
            questionScore = Math.round(questionScore * accuracy);
          }
        }
      } else if (question.type === '简答题' || question.type === '计算题') {
        // 简答题和计算题目前简单实现：包含关键词即可得分
        if (userAnswer && correctAnswer) {
          // 把正确答案分解成多行
          const correctLines = correctAnswer.split(/[\n\r]+/);

          // 检查用户答案是否包含每一行中的关键词
          const matchedLines = correctLines.filter(line => {
            const keyWords = line.split(/[,，:：、\s]+/).filter(w => w.length > 1);
            return keyWords.some(word => userAnswer.includes(word));
          });

          // 计算匹配率
          accuracy = correctLines.length > 0 ? matchedLines.length / correctLines.length : 0;

          if (accuracy > 0.3) { // 至少匹配30%才算部分正确
            isCorrect = true;
            questionScore = Math.round(questionScore * accuracy);
          }
        }
      }

      // 将答案记录添加到批量插入数组中
      answerValues.push([
        testId,
        currentDateTime,
        userId,
        question.id,
        userAnswer || '',
        accuracy
      ]);

      if (isCorrect) {
        correctCount++;
        totalScore += questionScore;
      } else {
        wrongCount++;
      }
    });

    // 计算总分和百分比
    const totalQuestions = rows.length;
    const percentageScore = Math.round((correctCount / totalQuestions) * 100);

    // 构建测试结果
    const testResult = {
      testId,
      userId,
      score: totalScore,
      percentageScore,
      totalQuestions,
      correctCount,
      wrongCount,
      timestamp: currentDateTime
    };

    // 将所有答案批量插入数据库
    const insertPromises = answerValues.map(values => {
      return new Promise((resolve, reject) => {
        db.run(insertAnswersSql, values, function(err) {
          if (err) {
            console.error('插入答案失败:', err.message, values);
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });

    Promise.all(insertPromises)
      .then(() => {
        // 所有答案保存成功
        return res.status(200).json({
          success: true,
          message: '评分完成！',
          ...testResult
        });
      })
      .catch(err => {
        // 有答案保存失败
        console.error('保存答案失败:', err.message);
        return res.status(500).json({
          success: false,
          message: '部分答案保存失败，请稍后重试！',
          ...testResult
        });
      });
  });
});

// 启动服务：监听本地端口
app.use((err, req, res, next) => {
  console.error('服务器错误:', err.message);
  res.status(500).json({ success: false, message: '服务器内部错误' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`服务器运行在 http://0.0.0.0:${port}`);
  console.log(`局域网可通过 http://<本机IP地址>:${port} 访问`);
});
