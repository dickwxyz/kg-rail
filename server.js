// 应用：用户注册/登录 API 服务（Express + SQLite）
// 结构：数据库初始化 / 中间件与跨域 / 注册接口 / 登录接口 / 辅助函数 / 启动服务
const express = require("express");   
const bodyParser = require("body-parser");    
const sqlite3 = require("sqlite3").verbose();   
const cors = require("cors"); // 引入 CORS    
const app = express();    
const port = 5500;    

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
// 预检请求处理（符合跨域场景的浏览器预检）
app.options("/register", (req, res) => {
  res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
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

// 启动服务：监听本地端口
app.listen(port, () => {
  console.log(`服务器运行在 http://127.0.0.1:${port}`);
});
