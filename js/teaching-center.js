// 个人中心「教学建议」前端控制器
// 依赖：/api/teaching/*、/api/teaching/report、/js/tracker.js
// 图表全部手写 SVG/CSS，不引入第三方图表库。
(function () {
  "use strict";

  var T = {
    teacherId: "",
    lesson: "",
    range: "30d",
    courses: [],
    chapterList: [],
    initialized: false,
    loading: false,
    data: {},
    report: null,
    reportMeta: null,
    studentSort: "risk",
    detailEscBound: false,
  };

  var COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#64748b"];
  var RESOURCE_NAMES = {
    chapter_doc: "章节文档",
    ppt: "PPT 课件",
    video: "课程视频",
    paper: "学术论文",
    homework: "作业材料",
    textbook: "教材",
    archive: "压缩包",
    extra: "补充材料",
    other: "其他",
  };
  var FOLLOWUP_NAMES = {
    clarify: "澄清",
    new_question: "新问题",
    confirm: "确认",
    challenge: "质疑",
  };
  var RISK_NAMES = { high: "高风险", medium: "需关注", low: "待验证", none: "正常" };
  var LEVEL_NAMES = { high: "高", medium: "中", low: "低", none: "—" };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value === null || value === undefined ? "" : value).replace(
      /[&<>"']/g,
      function (ch) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
      }
    );
  }

  function pct(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return Math.round(Number(value) * 100) + "%";
  }

  function num(value, digits) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    return Number(value).toFixed(digits === undefined ? 0 : digits);
  }

  function formatDate(ts) {
    if (!ts) return "—";
    var d = new Date(Number(ts));
    if (Number.isNaN(d.getTime())) return "—";
    var pad = function (n) {
      return String(n).padStart(2, "0");
    };
    return (
      d.getFullYear() +
      "-" +
      pad(d.getMonth() + 1) +
      "-" +
      pad(d.getDate()) +
      " " +
      pad(d.getHours()) +
      ":" +
      pad(d.getMinutes())
    );
  }

  function showMessage(text, type) {
    var el = $("teaching-message");
    if (!el) return;
    el.textContent = text;
    el.className = "message " + (type || "success");
    el.style.display = "block";
    clearTimeout(showMessage._timer);
    showMessage._timer = setTimeout(function () {
      el.style.display = "none";
    }, 4500);
  }

  async function api(url, options) {
    var response = await fetch(url, options);
    var data;
    try {
      data = await response.json();
    } catch (e) {
      throw new Error("服务返回格式异常");
    }
    if (!response.ok || !data.success) {
      throw new Error(data.message || "请求失败");
    }
    return data;
  }

  function getTeacher() {
    try {
      var user = JSON.parse(localStorage.getItem("userInfo") || "null");
      if (user && user.role === "教师") return user;
    } catch (e) {
      return null;
    }
    return null;
  }

  function buildQuery(extra) {
    var parts = [
      "teacherId=" + encodeURIComponent(T.teacherId),
      "lesson=" + encodeURIComponent(T.lesson),
      "range=" + encodeURIComponent(T.range),
    ];
    if (extra) parts.push(extra);
    return "?" + parts.join("&");
  }

  // ---------- 入口 ----------

  async function loadSection() {
    var user = getTeacher();
    if (!user) return;
    T.teacherId = user.id;
    if (!T.initialized) {
      var ok = await init();
      if (!ok) return;
    }
    await loadAll();
  }

  async function init() {
    setLoading(true);
    try {
      var data = await api("/api/teaching/courses?teacher=" + encodeURIComponent(T.teacherId));
      T.courses = data.courses || [];
      var select = $("teaching-course");
      if (!select) return false;
      select.innerHTML = "";
      T.courses.forEach(function (course) {
        var option = document.createElement("option");
        option.value = course.lesson;
        option.textContent = course.lesson + "（" + course.studentCount + " 人）";
        select.appendChild(option);
      });
      if (!T.courses.length) {
        showEmpty("当前教师名下还没有学生课程，暂时无法生成教学分析。");
        setLoading(false);
        return false;
      }
      var requestedLesson = new URLSearchParams(location.search).get("lesson");
      T.lesson =
        requestedLesson &&
        T.courses.some(function (course) {
          return course.lesson === requestedLesson;
        })
          ? requestedLesson
          : T.courses[0].lesson;
      select.value = T.lesson;
      T.initialized = true;
      return true;
    } catch (err) {
      showEmpty("加载课程失败：" + err.message);
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    if (!T.lesson) return;
    setLoading(true);
    hideEmpty();
    try {
      var q = buildQuery();
      var results = await Promise.all([
        api("/api/teaching/overview" + q),
        api("/api/teaching/chapters" + q),
        api("/api/teaching/students" + q + "&sort=" + encodeURIComponent(T.studentSort)),
        api("/api/teaching/dialogues" + q),
        api("/api/teaching/resources" + q),
        api("/api/teaching/trend" + q),
        api("/api/teaching/progress" + q),
        api("/api/teaching/report/latest" + q),
        api("/api/teaching/questions/attribution" + q),
      ]);
      T.data = {
        overview: results[0],
        chapters: results[1],
        students: results[2],
        dialogues: results[3],
        resources: results[4],
        trend: results[5],
        progress: results[6],
        latest: results[7],
        attribution: results[8],
      };
      T.report = T.data.latest.report || null;
      T.reportMeta = T.data.latest.meta || null;
      T.chapterList = T.data.attribution.chapters || [];
      renderAll();
      updateUpdatedAt();
      var course = T.courses.find(function (item) {
        return item.lesson === T.lesson;
      });
      var banner = $("teaching-demo-banner");
      if (banner) banner.style.display = course && course.isDemo ? "block" : "none";
    } catch (err) {
      showEmpty("加载教学数据失败：" + err.message);
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    T.loading = loading;
    var section = $("teaching-section");
    if (section) section.classList.toggle("kg-loading", !!loading);
    var btn = $("teaching-generate-btn");
    if (btn && loading) btn.disabled = true;
    if (btn && !loading) btn.disabled = false;
  }

  function showEmpty(text) {
    var el = $("teaching-empty");
    if (!el) return;
    el.textContent = text;
    el.style.display = "block";
    el.className = "kg-empty";
  }

  function hideEmpty() {
    var el = $("teaching-empty");
    if (el) el.style.display = "none";
  }

  function updateUpdatedAt() {
    var el = $("teaching-updated-at");
    if (el) el.textContent = "更新于 " + formatDate(Date.now());
  }

  // ---------- 渲染总入口 ----------

  function renderAll() {
    renderKpis();
    renderProgress();
    renderChapters();
    renderTrend();
    renderDialogue();
    renderResources();
    renderStudents();
    renderReport();
    renderAttribution();
  }

  // ---------- KPI ----------

  function sparkline(values, color) {
    var arr = (values || []).map(Number).filter(function (v) {
      return Number.isFinite(v);
    });
    if (!arr.length) return "";
    var w = 120;
    var h = 34;
    var pad = 3;
    var max = Math.max.apply(null, arr);
    var min = Math.min.apply(null, arr);
    var span = max - min || 1;
    var points = arr.map(function (v, i) {
      var x = pad + ((w - pad * 2) * i) / (arr.length - 1 || 1);
      var y = h - pad - ((h - pad * 2) * (v - min)) / span;
      return [x, y];
    });
    var d = points
      .map(function (p, i) {
        return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
      })
      .join(" ");
    return (
      '<svg class="kg-spark" viewBox="0 0 ' +
      w +
      " " +
      h +
      '" aria-hidden="true"><path d="' +
      d +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );
  }

  function renderKpis() {
    var container = $("teaching-kpis");
    if (!container) return;
    var k = (T.data.overview && T.data.overview.kpis) || {};
    var trend = (T.data.trend && T.data.trend.buckets) || [];
    var cards = [
      {
        label: "学生数",
        value: num(k.classSize),
        sub: "活跃率 " + pct(k.activeRate),
        spark: trend.map(function (x) { return x.activeStudents; }),
        color: COLORS[0],
      },
      {
        label: "活跃人数",
        value: num(k.activeStudents),
        sub: "人均 " + num(k.avgActiveDays, 1) + " 天",
        spark: trend.map(function (x) { return x.activeStudents; }),
        color: COLORS[0],
      },
      {
        label: "平均正确率",
        value: pct(k.avgAccuracy),
        sub: "答题 " + num(k.testAttempts) + " 场",
        spark: trend.map(function (x) { return (x.avgScoreRate || 0) * 100; }),
        color: COLORS[1],
      },
      {
        label: "测试得分率",
        value: pct(k.avgScoreRate),
        sub: "参与 " + num(k.testStudents) + " 人",
        spark: trend.map(function (x) { return (x.avgScoreRate || 0) * 100; }),
        color: COLORS[1],
      },
      {
        label: "AI 话题 / 追问",
        value: num(k.aiTopics) + " / " + num(k.aiFollowUps),
        sub: "深度话题 " + num(k.deepTopicCount),
        spark: trend.map(function (x) { return x.aiQuestions; }),
        color: COLORS[2],
      },
      {
        label: "图谱查看",
        value: num(k.graphViews),
        sub: "资源打开 " + num(k.resourceOpens),
        spark: trend.map(function (x) { return x.graphViews; }),
        color: COLORS[4],
      },
      {
        label: "资源下载",
        value: num(k.resourceDownloads),
        sub: "打开 " + num(k.resourceOpens) + " 次",
        spark: trend.map(function (x) { return x.resourceOpens; }),
        color: COLORS[5],
      },
      {
        label: "高风险学生",
        value: num(k.highRiskCount),
        sub: "需关注 " + num(k.mediumRiskCount),
        spark: trend.map(function (x) { return x.activeStudents; }),
        color: COLORS[3],
      },
    ];
    container.innerHTML = cards
      .map(function (card) {
        return (
          '<div class="kg-kpi"><div class="kg-kpi-label">' +
          esc(card.label) +
          '</div><div class="kg-kpi-value">' +
          esc(card.value) +
          '</div><div class="kg-kpi-foot"><span>' +
          esc(card.sub) +
          "</span>" +
          sparkline(card.spark, card.color) +
          "</div></div>"
        );
      })
      .join("");
  }

  // ---------- 教学进度 ----------

  function renderProgress() {
    var progress = (T.data.progress && T.data.progress.progress) || {};
    var select = $("teaching-current-chapter");
    if (!select) return;
    var options = ['<option value="0">未开始</option>'];
    var list = T.chapterList.length
      ? T.chapterList
      : Array.from({ length: 16 }, function (_, i) {
          return { chapterNo: i + 1, name: "第" + (i + 1) + "章" };
        });
    list.forEach(function (ch) {
      options.push(
        '<option value="' +
          ch.chapterNo +
          '">第' +
          ch.chapterNo +
          "章 " +
          esc(ch.name || "") +
          "</option>"
      );
    });
    select.innerHTML = options.join("");
    select.value = String(progress.currentChapter === undefined ? 16 : progress.currentChapter);
    var note = $("teaching-note");
    var next = $("teaching-next-plan");
    if (note) note.value = progress.note || "";
    if (next) next.value = progress.nextPlan || "";
    var hint = $("teaching-progress-hint");
    if (hint) {
      hint.textContent = progress.defaulted
        ? "尚未设置进度，默认按全部章节已学分析"
        : progress.updatedAt
        ? "更新于 " + formatDate(progress.updatedAt)
        : "";
    }
  }

  // ---------- 章节掌握度 ----------

  function masteryClass(chapter) {
    if (!chapter.taught) return "kg-cell-untaught";
    if (chapter.mastery === null || chapter.mastery === undefined || !chapter.dataSufficient) {
      return "kg-cell-untested";
    }
    if (chapter.mastery < 0.5) return "kg-cell-low";
    if (chapter.mastery < 0.7) return "kg-cell-mid";
    return "kg-cell-good";
  }

  function renderChapters() {
    var chapters = (T.data.chapters && T.data.chapters.chapters) || [];
    var heat = $("teaching-heatmap");
    var list = $("teaching-chapters");
    if (!heat || !list) return;
    if (!chapters.length) {
      heat.innerHTML = "";
      list.innerHTML = '<div class="kg-empty">暂无章节数据</div>';
      return;
    }
    heat.innerHTML = chapters
      .map(function (ch) {
        return (
          '<div class="kg-heat-cell ' +
          masteryClass(ch) +
          '" title="第' +
          ch.chapterNo +
          "章 " +
          esc(ch.name) +
          "：" +
          (ch.mastery === null || !ch.dataSufficient ? "样本不足" : pct(ch.mastery)) +
          '"><span class="kg-heat-no">' +
          ch.chapterNo +
          '</span><span class="kg-heat-val">' +
          (ch.mastery === null || !ch.dataSufficient ? "—" : pct(ch.mastery)) +
          "</span></div>"
        );
      })
      .join("");

    list.innerHTML = chapters
      .map(function (ch) {
        var reliable = ch.dataSufficient && ch.mastery !== null && ch.mastery !== undefined;
        var value = reliable ? ch.mastery : null;
        var width = value === null ? 0 : Math.max(2, Math.round(value * 100));
        var badge =
          ch.taught && !ch.dataSufficient
            ? '<span class="kg-badge kg-badge-none">样本不足</span>'
            : ch.taught && ch.priority === "高"
            ? '<span class="kg-badge kg-badge-high">高优先级</span>'
            : ch.taught && ch.priority === "中"
            ? '<span class="kg-badge kg-badge-medium">中优先级</span>'
            : ch.taught && ch.mastery !== null
            ? '<span class="kg-badge kg-badge-low">低优先级</span>'
            : ch.taught
            ? '<span class="kg-badge kg-badge-none">缺少测试证据</span>'
            : '<span class="kg-badge kg-badge-none">未教</span>';
        var detail =
          '<div class="kg-chapter-detail" id="chapter-detail-' +
          ch.chapterNo +
          '" hidden>' +
          '<div class="kg-detail-grid">' +
          '<span>测试正确率：<b>' +
          pct(ch.accuracy) +
          "</b></span>" +
          '<span>测试得分率：<b>' +
          pct(ch.scoreRate) +
          "</b></span>" +
          '<span>答题量：<b>' +
          num(ch.answerCount) +
          " 人次</b></span>" +
          '<span>覆盖学生：<b>' +
          num(ch.answerStudents) +
          " 人</b></span>" +
          '<span>图谱查看：<b>' +
          num(ch.graphViews) +
          "</b></span>" +
          '<span>资源打开：<b>' +
          num(ch.resourceOpens) +
          "</b></span>" +
          '<span>AI 话题：<b>' +
          num(ch.aiTopics) +
          "</b></span>" +
          '<span>澄清追问：<b>' +
          num(ch.clarifyFollowUps) +
          "</b></span>" +
          '<span>困惑热度：<b>' +
          pct(ch.confusionHeat) +
          "</b></span>" +
          "</div></div>";
        return (
          '<div class="kg-bar-row" data-chapter="' +
          ch.chapterNo +
          '" onclick="TeachingCenter.toggleChapterDetail(' +
          ch.chapterNo +
          ')">' +
          '<span class="kg-bar-label"><b>第' +
          ch.chapterNo +
          "章</b> " +
          esc(ch.name) +
          "</span>" +
          '<div class="kg-bar-track' +
          (ch.taught ? "" : " kg-bar-untaught") +
          (value === null ? " kg-bar-untested" : "") +
          '"><div class="kg-bar-fill" style="width:' +
          width +
          "%\"></div></div>" +
          '<span class="kg-bar-value">' +
          (value === null ? "—" : pct(value)) +
          "</span>" +
          badge +
          "</div>" +
          detail
        );
      })
      .join("");
  }

  function toggleChapterDetail(chapterNo) {
    var el = $("chapter-detail-" + chapterNo);
    if (el) el.hidden = !el.hidden;
  }

  // ---------- 趋势图 ----------

  function renderTrend() {
    var container = $("teaching-trend");
    if (!container) return;
    var buckets = (T.data.trend && T.data.trend.buckets) || [];
    if (!buckets.length) {
      container.innerHTML = '<div class="kg-empty">暂无趋势数据</div>';
      return;
    }
    var total = buckets.reduce(function (sum, b) {
      return sum + (b.activeStudents || 0) + (b.events || 0);
    }, 0);
    if (!total) {
      container.innerHTML = '<div class="kg-empty">近 ' + buckets.length + " 天暂无学习行为</div>";
      return;
    }
    container.innerHTML = lineChart(buckets);
  }

  function lineChart(buckets) {
    var w = 680;
    var h = 240;
    var pad = { l: 42, r: 46, t: 18, b: 34 };
    var innerW = w - pad.l - pad.r;
    var innerH = h - pad.t - pad.b;
    var n = buckets.length;
    var activeMax = Math.max(
      1,
      Math.max.apply(null, buckets.map(function (b) { return b.activeStudents || 0; })),
      Math.max.apply(null, buckets.map(function (b) { return b.aiFollowUps || 0; }))
    );
    var x = function (i) {
      return pad.l + (innerW * i) / Math.max(1, n - 1);
    };
    var yLeft = function (v) {
      return pad.t + innerH - (innerH * (v || 0)) / activeMax;
    };
    var yRight = function (v) {
      return pad.t + innerH - innerH * (v || 0);
    };
    var grid = "";
    for (var g = 0; g <= 4; g += 1) {
      var gy = pad.t + (innerH * g) / 4;
      var leftVal = Math.round(activeMax * (1 - g / 4));
      grid +=
        '<line x1="' +
        pad.l +
        '" y1="' +
        gy +
        '" x2="' +
        (w - pad.r) +
        '" y2="' +
        gy +
        '" stroke="#e2e8f0" stroke-width="1"/>' +
        '<text x="' +
        (pad.l - 8) +
        '" y="' +
        (gy + 4) +
        '" text-anchor="end" font-size="10" fill="#64748b">' +
        leftVal +
        "</text>" +
        '<text x="' +
        (w - pad.r + 8) +
        '" y="' +
        (gy + 4) +
        '" text-anchor="start" font-size="10" fill="#64748b">' +
        Math.round((1 - g / 4) * 100) +
        "%</text>";
    }
    var labelStep = Math.max(1, Math.ceil(n / 6));
    var labels = buckets
      .map(function (b, i) {
        if (i % labelStep !== 0 && i !== n - 1) return "";
        return (
          '<text x="' +
          x(i) +
          '" y="' +
          (h - 10) +
          '" text-anchor="middle" font-size="10" fill="#64748b">' +
          esc(b.label || b.date) +
          "</text>"
        );
      })
      .join("");

    var activePoints = buckets.map(function (b, i) {
      return [x(i), yLeft(b.activeStudents || 0)];
    });
    var followPoints = buckets.map(function (b, i) {
      return [x(i), yLeft(b.aiFollowUps || 0)];
    });
    var scorePoints = buckets.map(function (b, i) {
      return [x(i), yRight(b.avgScoreRate || 0)];
    });
    var path = function (points) {
      return points
        .map(function (p, i) {
          return (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1);
        })
        .join(" ");
    };
    var area =
      "M" +
      activePoints[0][0] +
      " " +
      (pad.t + innerH) +
      " " +
      activePoints.map(function (p) { return "L" + p[0].toFixed(1) + " " + p[1].toFixed(1); }).join(" ") +
      " L" +
      activePoints[n - 1][0] +
      " " +
      (pad.t + innerH) +
      " Z";

    var dots = function (points, color, label, formatter) {
      return points
        .map(function (p, i) {
          var b = buckets[i];
          return (
            '<circle cx="' +
            p[0].toFixed(1) +
            '" cy="' +
            p[1].toFixed(1) +
            '" r="2.5" fill="' +
            color +
            '"><title>' +
            esc((b.date || "") + " " + label + "：" + formatter(b)) +
            "</title></circle>"
          );
        })
        .join("");
    };

    return (
      '<div class="kg-chart-wrap"><svg viewBox="0 0 ' +
      w +
      " " +
      h +
      '" class="kg-chart" role="img" aria-label="学习活跃趋势">' +
      grid +
      '<path d="' +
      area +
      '" fill="rgba(37,99,235,.10)"/>' +
      '<path d="' +
      path(activePoints) +
      '" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path d="' +
      path(followPoints) +
      '" fill="none" stroke="#f59e0b" stroke-width="1.8" stroke-dasharray="5 4"/>' +
      '<path d="' +
      path(scorePoints) +
      '" fill="none" stroke="#16a34a" stroke-width="2"/>' +
      labels +
      dots(activePoints, "#2563eb", "活跃学生", function (b) { return b.activeStudents + " 人"; }) +
      dots(followPoints, "#f59e0b", "AI 追问", function (b) { return b.aiFollowUps + " 次"; }) +
      dots(scorePoints, "#16a34a", "得分率", function (b) { return pct(b.avgScoreRate); }) +
      "</svg>" +
      '<div class="kg-legend"><span><i style="background:#2563eb"></i>活跃学生</span><span><i style="background:#f59e0b"></i>AI 追问</span><span><i style="background:#16a34a"></i>测试得分率</span></div></div>'
    );
  }

  // ---------- 环形图 ----------

  function donut(items, centerLabel) {
    var list = (items || []).filter(function (item) {
      return Number(item.value) > 0;
    });
    var total = list.reduce(function (sum, item) {
      return sum + Number(item.value);
    }, 0);
    if (!total) return '<div class="kg-empty">暂无数据</div>';
    var size = 180;
    var r = 64;
    var c = 2 * Math.PI * r;
    var offset = 0;
    var circles = list
      .map(function (item, i) {
        var len = (Number(item.value) / total) * c;
        var el =
          '<circle cx="90" cy="90" r="' +
          r +
          '" fill="none" stroke="' +
          (item.color || COLORS[i % COLORS.length]) +
          '" stroke-width="20" stroke-dasharray="' +
          len.toFixed(2) +
          " " +
          (c - len).toFixed(2) +
          '" stroke-dashoffset="' +
          (-offset).toFixed(2) +
          '" transform="rotate(-90 90 90)"><title>' +
          esc(item.label + "：" + item.value) +
          "</title></circle>";
        offset += len;
        return el;
      })
      .join("");
    var legend = list
      .map(function (item, i) {
        return (
          '<li><i style="background:' +
          (item.color || COLORS[i % COLORS.length]) +
          '"></i><span>' +
          esc(item.label) +
          '</span><b>' +
          esc(item.value) +
          "</b></li>"
        );
      })
      .join("");
    return (
      '<div class="kg-donut-wrap"><svg viewBox="0 0 180 180" class="kg-donut-svg" role="img" aria-label="' +
      esc(centerLabel) +
      '">' +
      circles +
      '<text x="90" y="86" text-anchor="middle" font-size="22" font-weight="600" fill="#1f2937">' +
      esc(total) +
      '</text><text x="90" y="106" text-anchor="middle" font-size="11" fill="#64748b">' +
      esc(centerLabel) +
      "</text></svg><ul class=\"kg-donut-legend\">" +
      legend +
      "</ul></div>"
    );
  }

  function renderDialogue() {
    var d = (T.data.dialogues && T.data.dialogues.dialogues) || {};
    var kpiEl = $("teaching-dialogue-kpis");
    var metaEl = $("teaching-dialogue-meta");
    var donutEl = $("teaching-followup-donut");
    var themeEl = $("teaching-themes");
    var unresolvedEl = $("teaching-unresolved");
    if (!kpiEl || !donutEl || !themeEl || !unresolvedEl) return;

    var types = d.followUpTypes || {};
    donutEl.innerHTML = donut(
      [
        { label: "澄清", value: types.clarify || 0, color: "#dc2626" },
        { label: "新问题", value: types.new_question || 0, color: "#2563eb" },
        { label: "确认", value: types.confirm || 0, color: "#16a34a" },
        { label: "质疑", value: types.challenge || 0, color: "#f59e0b" },
      ],
      "追问次数"
    );
    if (metaEl) {
      metaEl.textContent = d.topicCount
        ? "共 " + d.topicCount + " 个话题，" + d.followUpCount + " 次追问"
        : "";
    }
    kpiEl.innerHTML = [
      ["话题数", num(d.topicCount)],
      ["追问率", pct(d.followUpRate)],
      ["深度话题", num(d.deepTopicCount)],
      ["未解决率", pct(d.unresolvedRate)],
      ["平均深度", num(d.avgDepth, 1) + " / 5"],
    ]
      .map(function (item) {
        return (
          '<div class="kg-mini-kpi"><span>' +
          esc(item[0]) +
          "</span><b>" +
          esc(item[1]) +
          "</b></div>"
        );
      })
      .join("");

    var themes = d.topThemes || [];
    themeEl.innerHTML = themes.length
      ? themes
          .map(function (theme) {
            var question = (theme.representativeQuestions || [])[0];
            return (
              '<div class="kg-theme-item"><div class="kg-theme-head"><b>' +
              esc(theme.theme) +
              "</b>" +
              (theme.chapterNo ? '<span class="kg-chip">第' + theme.chapterNo + "章</span>" : "") +
              '<span class="kg-muted">' +
              theme.students +
              " 人 · " +
              theme.clarifyFollowUps +
              " 次澄清追问</span></div>" +
              (question
                ? '<p class="kg-theme-quote">“' + esc(question) + "”</p>"
                : "") +
              "</div>"
            );
          })
          .join("")
      : '<div class="kg-empty">暂无追问主题</div>';

    var unresolved = d.unresolvedTopics || [];
    unresolvedEl.innerHTML = unresolved.length
      ? unresolved
          .map(function (item) {
            return (
              '<div class="kg-unresolved"><div><b>' +
              esc(studentName(item.studentKey)) +
              "</b> · " +
              esc(item.title || "未命名话题") +
              '</div><p>' +
              esc(item.summary || "") +
              "</p></div>"
            );
          })
          .join("")
      : '<div class="kg-empty">暂无未解决话题</div>';
  }

  function studentName(key) {
    var map =
      (T.reportMeta && T.reportMeta.studentKeyMap) ||
      (T.data.latest && T.data.latest.meta && T.data.latest.meta.studentKeyMap) ||
      null;
    if (map && map[key] && map[key].name) return map[key].name;
    var students = (T.data.students && T.data.students.students) || [];
    var found = students.find(function (s) {
      return s.studentKey === key;
    });
    return found ? found.name : key;
  }

  // ---------- 资源使用 ----------

  function renderResources() {
    var container = $("teaching-resources");
    if (!container) return;
    var r = (T.data.resources && T.data.resources.resources) || {};
    if (!r.totalOpens && !r.totalDownloads) {
      container.innerHTML = '<div class="kg-empty">暂无资源使用数据</div>';
      return;
    }
    var byType = (r.byType || []).map(function (item, i) {
      return {
        label: RESOURCE_NAMES[item.type] || item.type,
        value: item.opens + item.downloads,
        color: COLORS[i % COLORS.length],
      };
    });
    var resourceDonut = $("teaching-resource-donut");
    if (resourceDonut) resourceDonut.innerHTML = donut(byType, "资源使用");
    var topItems = (r.topItems || [])
      .map(function (item) {
        return (
          '<div class="kg-resource-item"><div><b>' +
          esc(item.label) +
          '</b><span class="kg-muted">' +
          esc(RESOURCE_NAMES[item.type] || item.type) +
          (item.chapterNo ? " · 第" + item.chapterNo + "章" : "") +
          '</span></div><div class="kg-resource-nums"><span>打开 ' +
          item.opens +
          "</span><span>下载 " +
          item.downloads +
          "</span></div></div>"
        );
      })
      .join("");
    var studentRows = (r.byStudent || [])
      .slice(0, 8)
      .map(function (s) {
        var top = (s.topItems || [])[0];
        return (
          "<tr><td>" +
          esc(studentName(s.studentKey)) +
          "</td><td>" +
          s.opens +
          "</td><td>" +
          s.downloads +
          "</td><td>" +
          esc(top ? top.label : "—") +
          "</td></tr>"
        );
      })
      .join("");
    container.innerHTML =
      '<div class="kg-resource-top"><h3>Top 资源</h3>' +
      (topItems || '<div class="kg-empty">暂无</div>') +
      "</div>" +
      (studentRows
        ? '<h3 class="kg-subtitle">学生资源使用</h3><div class="kg-table-wrap"><table class="kg-table"><thead><tr><th>学生</th><th>打开</th><th>下载</th><th>最常使用</th></tr></thead><tbody>' +
          studentRows +
          "</tbody></table></div>"
        : "");
  }

  // ---------- 学生明细 ----------

  function riskBadge(level, tags) {
    var tagText = (tags || []).slice(0, 2).join(" / ");
    return (
      '<span class="kg-risk kg-risk-' +
      esc(level || "none") +
      '">' +
      esc(RISK_NAMES[level] || "正常") +
      (tagText ? " · " + esc(tagText) : "") +
      "</span>"
    );
  }

  function renderStudents() {
    var container = $("teaching-students");
    if (!container) return;
    var students = (T.data.students && T.data.students.students) || [];
    if (!students.length) {
      container.innerHTML = '<div class="kg-empty">本课程暂无学生</div>';
      return;
    }
    var rows = students
      .map(function (s) {
        return (
          '<tr class="kg-student-row" onclick="TeachingCenter.openStudentDetail(\'' +
          esc(s.userId) +
          "')\">" +
          "<td><b>" +
          esc(s.name) +
          "</b><div class=\"kg-muted kg-tiny\">" +
          esc(s.grade || "") +
          "</div></td>" +
          '<td class="kg-num">' +
          esc(String(s.userId).slice(-4)) +
          "</td>" +
          '<td class="kg-num">' +
          num(s.activeDays) +
          "</td>" +
          '<td class="kg-num">' +
          num(s.events) +
          "</td>" +
          '<td class="kg-num">' +
          pct(s.accuracy) +
          "</td>" +
          '<td class="kg-num">' +
          pct(s.avgScoreRate) +
          "</td>" +
          '<td class="kg-num">' +
          num(s.testAttempts) +
          "</td>" +
          '<td class="kg-num">' +
          num(s.aiTopics) +
          " / " +
          num(s.aiFollowUps) +
          "</td>" +
          '<td class="kg-num">' +
          num(s.graphViews) +
          "</td>" +
          '<td class="kg-num">' +
          num(s.resourceOpens) +
          " / " +
          num(s.resourceDownloads) +
          "</td>" +
          '<td class="kg-num">' +
          formatDate(s.lastActive) +
          "</td>" +
          "<td>" +
          riskBadge(s.riskLevel, s.riskTags) +
          "</td></tr>"
        );
      })
      .join("");
    container.innerHTML =
      '<div class="kg-table-wrap"><table class="kg-table kg-table-students"><thead><tr>' +
      "<th>学生</th><th>学号后四位</th><th>活跃天</th><th>事件</th><th>正确率</th><th>得分率</th><th>测试</th><th>AI 话题/追问</th><th>图谱</th><th>资源开/下</th><th>最近活跃</th><th>风险</th>" +
      "</tr></thead><tbody>" +
      rows +
      "</tbody></table></div>";
  }

  async function loadStudentsOnly() {
    try {
      var data = await api(
        "/api/teaching/students" +
          buildQuery("&sort=" + encodeURIComponent(T.studentSort))
      );
      T.data.students = data;
      renderStudents();
    } catch (err) {
      showMessage("学生列表刷新失败：" + err.message, "error");
    }
  }

  function sortStudents(value) {
    T.studentSort = value;
    loadStudentsOnly();
  }

  async function openStudentDetail(userId) {
    var modal = $("student-detail-modal");
    var content = $("student-detail-content");
    if (!modal || !content) return;
    modal.hidden = false;
    document.body.classList.add("kg-modal-open");
    content.innerHTML = '<div class="kg-skeleton kg-skeleton-block"></div>';
    if (!T.detailEscBound) {
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") closeStudentDetail();
      });
      T.detailEscBound = true;
    }
    try {
      var data = await api(
        "/api/teaching/student/" + encodeURIComponent(userId) + buildQuery()
      );
      content.innerHTML = renderStudentDetail(data);
    } catch (err) {
      content.innerHTML = '<div class="kg-empty">加载学生详情失败：' + esc(err.message) + "</div>";
    }
  }

  function renderStudentDetail(data) {
    var s = data.student || {};
    var m = data.metrics || {};
    var flags = (m.flags || [])
      .map(function (f) {
        return '<span class="kg-chip kg-chip-' + esc(f.level) + '">' + esc(f.tag) + "</span>";
      })
      .join("");
    var chapters = (data.chapterAccuracy || [])
      .map(function (c) {
        var width = c.accuracy === null ? 0 : Math.max(2, Math.round(c.accuracy * 100));
        return (
          '<div class="kg-bar-row kg-bar-row-compact"><span class="kg-bar-label">第' +
          c.chapterNo +
          "章 " +
          esc(c.name) +
          '</span><div class="kg-bar-track' +
          (c.accuracy === null ? " kg-bar-untested" : "") +
          '"><div class="kg-bar-fill" style="width:' +
          width +
          '%"></div></div><span class="kg-bar-value">' +
          pct(c.accuracy) +
          "</span></div>"
        );
      })
      .join("");
    var attempts = (data.attempts || [])
      .map(function (a) {
        return (
          "<tr><td>" +
          formatDate(a.submittedAt) +
          "</td><td>" +
          pct(a.scoreRate) +
          "</td><td>" +
          num(a.correctCount) +
          "/" +
          num(a.totalQuestions) +
          "</td><td>" +
          (a.durationMs ? Math.round(a.durationMs / 60000) + " 分钟" : "—") +
          "</td></tr>"
        );
      })
      .join("");
    var topics = (data.topics || [])
      .map(function (t) {
        return (
          '<div class="kg-unresolved"><div><b>' +
          esc(t.title) +
          "</b> · " +
          t.userMessages +
          " 次提问 / " +
          t.followUps +
          " 次追问" +
          (t.unresolved ? ' <span class="kg-chip kg-chip-high">未解决</span>' : "") +
          "</div><p>" +
          esc(t.summary || (t.themes || []).join("、")) +
          "</p></div>"
        );
      })
      .join("");
    var resources = (data.resources || [])
      .slice(0, 12)
      .map(function (r) {
        return (
          '<div class="kg-resource-item"><div><b>' +
          esc(r.label) +
          '</b><span class="kg-muted">' +
          esc(RESOURCE_NAMES[r.type] || r.type) +
          (r.chapterNo ? " · 第" + r.chapterNo + "章" : "") +
          '</span></div><span class="kg-chip">' +
          (r.download ? "下载" : "打开") +
          "</span></div>"
        );
      })
      .join("");
    return (
      '<div class="kg-modal-head"><div><h2>' +
      esc(s.name) +
      '</h2><span class="kg-muted">' +
      esc(s.id) +
      " · " +
      esc(s.grade || "") +
      "</span></div>" +
      riskBadge(m.riskLevel, (m.flags || []).map(function (f) { return f.tag; })) +
      "</div>" +
      '<div class="kg-mini-kpis kg-modal-kpis">' +
      [
        ["活跃天数", num(m.activeDays)],
        ["事件数", num(m.events)],
        ["测试场次", num(m.testAttempts)],
        ["正确率", pct(m.accuracy)],
        ["得分率", pct(m.avgScoreRate)],
        ["AI 话题/追问", num(m.aiTopics) + " / " + num(m.aiFollowUps)],
        ["图谱查看", num(m.graphViews)],
        ["资源开/下", num(m.resourceOpens) + " / " + num(m.resourceDownloads)],
      ]
        .map(function (item) {
          return '<div class="kg-mini-kpi"><span>' + esc(item[0]) + "</span><b>" + esc(item[1]) + "</b></div>";
        })
        .join("") +
      "</div>" +
      (flags ? '<div class="kg-flags">' + flags + "</div>" : "") +
      '<h3 class="kg-subtitle">章节正确率</h3>' +
      (chapters || '<div class="kg-empty">暂无章节数据</div>') +
      '<h3 class="kg-subtitle">最近测试</h3>' +
      (attempts
        ? '<div class="kg-table-wrap"><table class="kg-table"><thead><tr><th>时间</th><th>得分率</th><th>正确/总数</th><th>用时</th></tr></thead><tbody>' +
          attempts +
          "</tbody></table></div>"
        : '<div class="kg-empty">暂无测试记录</div>') +
      '<h3 class="kg-subtitle">AI 对话</h3>' +
      (topics || '<div class="kg-empty">暂无对话记录</div>') +
      '<h3 class="kg-subtitle">资源使用</h3>' +
      (resources || '<div class="kg-empty">暂无资源记录</div>')
    );
  }

  function closeStudentDetail() {
    var modal = $("student-detail-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("kg-modal-open");
  }

  // ---------- 教学建议报告 ----------

  async function generateReport() {
    if (!T.lesson) return;
    var btn = $("teaching-generate-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "生成中…";
    }
    try {
      var data = await api("/api/teaching/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: T.teacherId,
          lesson: T.lesson,
          range: T.range,
          force: true,
        }),
      });
      T.report = data.report;
      T.reportMeta = data.meta;
      renderReport();
      showMessage(
        data.meta.llmStatus === "ok"
          ? "教学建议已生成（DeepSeek 叙述）"
          : data.meta.llmStatus === "cached"
          ? "已加载缓存建议"
          : "AI 暂不可用，已生成规则建议",
        "success"
      );
    } catch (err) {
      showMessage("生成教学建议失败：" + err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "生成教学建议";
      }
    }
  }

  function renderReport() {
    var container = $("teaching-report");
    if (!container) return;
    var report = T.report;
    if (!report) {
      container.innerHTML =
        '<div class="kg-card kg-report-empty"><h2>教学建议</h2><p class="kg-muted">点击上方「生成教学建议」，系统会结合当前进度、章节掌握度、AI 追问与资源使用生成建议。</p></div>';
      return;
    }
    var meta = T.reportMeta || {};
    var level = (report.overall && report.overall.level) || "需关注";
    var levelClass =
      level === "良好" ? "kg-level-good" : level === "风险" ? "kg-level-risk" : "kg-level-mid";
    var findings = ((report.overall && report.overall.key_findings) || [])
      .map(function (item) {
        return (
          "<li>" +
          esc(item.text) +
          (item.evidence_refs && item.evidence_refs.length
            ? '<span class="kg-evidence-badge">' + item.evidence_refs.map(esc).join("、") + "</span>"
            : "") +
          "</li>"
        );
      })
      .join("");
    var reteach = (report.reteach || [])
      .map(function (item) {
        return (
          '<div class="kg-report-item kg-reteach-item">' +
          '<div class="kg-report-item-head"><b>第' +
          item.chapter_no +
          "章 " +
          esc(item.chapter_name) +
          '</b><span class="kg-badge kg-badge-' +
          (item.priority === "高" ? "high" : item.priority === "中" ? "medium" : "low") +
          '">' +
          esc(item.priority) +
          "优先级</span></div>" +
          '<p class="kg-muted">' +
          esc(item.reason) +
          " · 建议 " +
          item.suggested_minutes +
          " 分钟</p>" +
          '<ul class="kg-plain-list">' +
          (item.activities || []).map(function (a) { return "<li>" + esc(a) + "</li>"; }).join("") +
          "</ul></div>"
        );
      })
      .join("");
    var confusion = (report.confusion_points || [])
      .map(function (item) {
        return (
          '<div class="kg-report-item"><div class="kg-report-item-head"><b>' +
          esc(item.theme) +
          "</b>" +
          (item.chapter_no ? '<span class="kg-chip">第' + item.chapter_no + "章</span>" : "") +
          '<span class="kg-muted">' +
          item.student_count +
          " 人 · " +
          item.follow_up_count +
          " 次追问</span></div><p>" +
          esc(item.suggested_explanation) +
          "</p></div>"
        );
      })
      .join("");
    var resourceAdvice = (report.resource_advice || [])
      .map(function (item) {
        return (
          '<div class="kg-report-item"><p><b>' +
          esc(item.observation) +
          "</b></p><p>" +
          esc(item.suggestion) +
          "</p></div>"
        );
      })
      .join("");
    var next = report.next_session || {};
    var flow = (next.flow || [])
      .map(function (step) {
        return (
          '<div class="kg-timeline-item"><span class="kg-timeline-min">' +
          step.minutes +
          "′</span><div><b>" +
          esc(step.activity) +
          "</b><p>" +
          esc(step.content) +
          "</p></div></div>"
        );
      })
      .join("");
    var groups = (report.student_groups || [])
      .map(function (group) {
        var names = (group.student_keys || [])
          .map(function (key) {
            return studentName(key);
          })
          .join("、");
        return (
          '<div class="kg-report-item"><div class="kg-report-item-head"><b>' +
          esc(group.group) +
          '</b><span class="kg-muted">' +
          (group.student_keys || []).length +
          " 人</span></div><p>" +
          esc(group.advice) +
          '</p><p class="kg-muted">' +
          esc(names) +
          "</p></div>"
        );
      })
      .join("");
    var practice = (report.practice || [])
      .map(function (item) {
        return (
          '<span class="kg-chip">第' +
          item.chapter_no +
          "章 · " +
          esc(item.type) +
          " × " +
          item.count +
          " · " +
          esc(item.difficulty) +
          "</span>"
        );
      })
      .join("");
    var gaps = (report.data_gaps || [])
      .map(function (gap) {
        return "<li>" + esc(gap) + "</li>";
      })
      .join("");
    var evidence = (meta.evidence || [])
      .map(function (item) {
        return (
          "<li><b>" +
          esc(item.id) +
          "</b> " +
          esc(item.metric) +
          "：" +
          esc(item.value === null ? "—" : item.value) +
          (item.chapterNo ? "（第" + item.chapterNo + "章）" : "") +
          (item.theme ? "（" + esc(item.theme) + "）" : "") +
          "</li>"
        );
      })
      .join("");
    var statusText =
      meta.llmStatus === "ok"
        ? "DeepSeek 叙述"
        : meta.llmStatus === "cached"
        ? "缓存结果"
        : "规则生成";

    container.innerHTML =
      '<div class="kg-card kg-report">' +
      '<div class="kg-card-head"><h2>教学建议</h2><span class="kg-report-meta">' +
      esc(statusText) +
      " · " +
      esc(meta.model || "rule") +
      " · " +
      formatDate(meta.generatedAt) +
      "</span></div>" +
      '<div class="kg-report-summary"><span class="kg-level ' +
      levelClass +
      '">' +
      esc(level) +
      "</span><p>" +
      esc(report.summary) +
      "</p></div>" +
      (findings ? '<h3 class="kg-subtitle">关键发现</h3><ul class="kg-plain-list kg-findings">' + findings + "</ul>" : "") +
      (gaps ? '<div class="kg-gap"><b>数据缺口</b><ul class="kg-plain-list">' + gaps + "</ul></div>" : "") +
      (reteach ? '<h3 class="kg-subtitle">需要重讲的章节</h3>' + reteach : "") +
      (confusion ? '<h3 class="kg-subtitle">困惑点与建议讲法</h3>' + confusion : "") +
      (resourceAdvice ? '<h3 class="kg-subtitle">资源使用观察</h3>' + resourceAdvice : "") +
      '<h3 class="kg-subtitle">下节课安排</h3><div class="kg-report-item"><b>' +
      esc(next.title || "下一节课") +
      '</b><ul class="kg-plain-list">' +
      (next.objectives || []).map(function (o) { return "<li>" + esc(o) + "</li>"; }).join("") +
      "</ul>" +
      flow +
      ((next.homework || []).length
        ? '<p class="kg-muted">作业：' + (next.homework || []).map(esc).join("；") + "</p>"
        : "") +
      "</div>" +
      (groups ? '<h3 class="kg-subtitle">分层关注</h3>' + groups : "") +
      (practice ? '<h3 class="kg-subtitle">练习建议</h3><div class="kg-chips">' + practice + "</div>" : "") +
      (evidence
        ? '<details class="kg-evidence"><summary>证据数字（' + (meta.evidence || []).length + " 项）</summary><ul class=\"kg-plain-list\">" + evidence + "</ul></details>"
        : "") +
      '<p class="kg-disclaimer">' +
      esc(report.disclaimer || "本建议基于平台行为数据，仅供教学参考。") +
      "</p></div>";
  }

  // ---------- 题目归因 ----------

  function renderAttribution() {
    var container = $("teaching-questions");
    var summary = $("teaching-attribution-summary");
    if (!container) return;
    var data = (T.data.attribution && T.data.attribution.questions) || [];
    var chapters = T.chapterList;
    if (!data.length) {
      container.innerHTML = '<div class="kg-empty">暂无题目数据</div>';
      return;
    }
    var mapped = data.filter(function (q) {
      return q.mappings && q.mappings.length;
    }).length;
    var low = data.filter(function (q) {
      return q.mappings && q.mappings.some(function (m) { return m.confidence < 0.6; });
    }).length;
    if (summary) {
      summary.textContent = "共 " + data.length + " 题，已归因 " + mapped + " 题，低置信 " + low + " 题";
    }
    var options = chapters
      .map(function (ch) {
        return '<option value="' + ch.chapterNo + '">第' + ch.chapterNo + "章 " + esc(ch.name) + "</option>";
      })
      .join("");
    container.innerHTML =
      '<div class="kg-table-wrap"><table class="kg-table"><thead><tr><th>题目</th><th>题型</th><th>当前章节</th><th>来源</th><th>操作</th></tr></thead><tbody>' +
      data
        .map(function (q) {
          var primary = (q.mappings || []).sort(function (a, b) { return b.weight - a.weight; })[0];
          var current = primary ? primary.chapterNo : "";
          var source = primary
            ? (primary.source === "manual" ? "人工" : primary.source === "llm" ? "AI" : "图谱") +
              (primary.confidence < 0.6 ? " · 低置信" : "")
            : "未归因";
          return (
            '<tr><td class="kg-question-text">' +
            q.id +
            ". " +
            esc(q.question) +
            '</td><td class="kg-num">' +
            esc(q.type) +
            "</td><td>" +
            '<select class="kg-select" id="question-chapter-' +
            q.id +
            '"><option value="">未归因</option>' +
            options +
            "</select>" +
            '</td><td><span class="kg-chip' +
            (primary && primary.confidence < 0.6 ? " kg-chip-high" : "") +
            '">' +
            esc(source) +
            "</span></td><td>" +
            '<button class="btn btn-small" onclick="TeachingCenter.saveQuestionChapter(' +
            q.id +
            ')">保存</button></td></tr>'
          );
        })
        .join("") +
      "</tbody></table></div>";
    data.forEach(function (q) {
      var select = $("question-chapter-" + q.id);
      if (!select) return;
      var primary = (q.mappings || []).sort(function (a, b) { return b.weight - a.weight; })[0];
      select.value = primary ? String(primary.chapterNo) : "";
    });
  }

  async function saveQuestionChapter(questionId) {
    var select = $("question-chapter-" + questionId);
    if (!select || !select.value) {
      showMessage("请选择章节", "error");
      return;
    }
    try {
      await api("/api/teaching/questions/" + questionId + "/chapter", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: T.teacherId,
          lesson: T.lesson,
          chapters: [{ chapterNo: Number(select.value), weight: 1 }],
        }),
      });
      showMessage("第 " + questionId + " 题章节已保存", "success");
      await reloadAttributionAndChapters();
    } catch (err) {
      showMessage("保存失败：" + err.message, "error");
    }
  }

  async function classifyQuestions() {
    var btn = $("teaching-classify-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "标注中…";
    }
    try {
      var result = await api("/api/teaching/classify-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teacherId: T.teacherId, lesson: T.lesson, force: false }),
      });
      showMessage(
        "已完成标注：规则 " + result.annotated + " 题，AI " + result.llmAnnotated + " 题",
        "success"
      );
      await reloadAttributionAndChapters();
    } catch (err) {
      showMessage("自动标注失败：" + err.message, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "AI 自动标注";
      }
    }
  }

  async function reloadAttributionAndChapters() {
    var q = buildQuery();
    var results = await Promise.all([
      api("/api/teaching/questions/attribution" + q),
      api("/api/teaching/chapters" + q),
    ]);
    T.data.attribution = results[0];
    T.data.chapters = results[1];
    T.chapterList = results[0].chapters || T.chapterList;
    renderAttribution();
    renderChapters();
  }

  // ---------- 进度保存与切换 ----------

  async function saveProgress() {
    var select = $("teaching-current-chapter");
    var note = $("teaching-note");
    var next = $("teaching-next-plan");
    if (!select) return;
    try {
      await api("/api/teaching/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: T.teacherId,
          lesson: T.lesson,
          currentChapter: Number(select.value),
          note: note ? note.value : "",
          nextPlan: next ? next.value : "",
        }),
      });
      showMessage("教学进度已保存，建议重新生成教学建议", "success");
      var progressData = await api("/api/teaching/progress" + buildQuery());
      T.data.progress = progressData;
      renderProgress();
    } catch (err) {
      showMessage("保存进度失败：" + err.message, "error");
    }
  }

  function switchCourse(lesson) {
    T.lesson = lesson;
    T.report = null;
    T.reportMeta = null;
    loadAll();
  }

  function switchRange(range) {
    T.range = range;
    loadAll();
  }

  window.TeachingCenter = {
    load: loadSection,
    refresh: loadAll,
    switchCourse: switchCourse,
    switchRange: switchRange,
    saveProgress: saveProgress,
    generateReport: generateReport,
    sortStudents: sortStudents,
    openStudentDetail: openStudentDetail,
    closeStudentDetail: closeStudentDetail,
    toggleChapterDetail: toggleChapterDetail,
    saveQuestionChapter: saveQuestionChapter,
    classifyQuestions: classifyQuestions,
  };
})();
