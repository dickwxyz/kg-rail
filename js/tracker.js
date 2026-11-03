// 学习行为埋点（零依赖）
// 设计原则：
// 1. 只记录学习行为与节奏，不读取答题输入正文、不记录按键、剪贴板、IME 候选词；
// 2. 批量上报 + sendBeacon 兜底，失败静默，不影响业务；
// 3. 课程归属由服务端按学生/教师反查，客户端字段不可信。
(function () {
  "use strict";

  var user = null;
  try {
    user = JSON.parse(localStorage.getItem("userInfo") || "null");
  } catch (e) {
    user = null;
  }

  var state = {
    enabled: !!(user && user.id),
    userId: user ? String(user.id) : "",
    page: "index",
    sessionId: "",
    queue: [],
    flushTimer: null,
    startedAt: Date.now(),
    visibleStart: Date.now(),
    visibleMs: 0,
    maxScrollPct: 0,
    leaveSent: false,
  };

  function getSessionId() {
    if (state.sessionId) return state.sessionId;
    var key = "kg_tracker_session";
    try {
      var existing = sessionStorage.getItem(key);
      if (existing) {
        state.sessionId = existing;
        return existing;
      }
      var id =
        (window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10));
      sessionStorage.setItem(key, id);
      state.sessionId = id;
      return id;
    } catch (e) {
      state.sessionId = "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
      return state.sessionId;
    }
  }

  function makeUid() {
    return "e_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function track(event, payload, opts) {
    if (!state.enabled || !event) return;
    opts = opts || {};
    state.queue.push({
      uid: makeUid(),
      event: String(event),
      ts: Date.now(),
      payload: payload && typeof payload === "object" ? payload : {},
    });
    if (state.queue.length >= (opts.immediate ? 1 : 20)) {
      flush();
    }
  }

  function flush(options) {
    options = options || {};
    if (!state.enabled || !state.queue.length) return;
    var events = state.queue.splice(0, 50);
    var body = {
      sessionId: getSessionId(),
      userId: state.userId,
      page: state.page,
      events: events,
    };
    var text = JSON.stringify(body);
    if (options.beacon && navigator.sendBeacon) {
      try {
        navigator.sendBeacon("/api/events", new Blob([text], { type: "application/json" }));
        return;
      } catch (e) {
        // 落到 fetch
      }
    }
    try {
      fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: text,
        keepalive: true,
      }).catch(function () {
        // 静默丢弃
      });
    } catch (e) {
      // 静默丢弃
    }
  }

  function classifyResource(path) {
    var p = String(path || "");
    if (/markdown-book\//.test(p)) return "chapter_doc";
    if (/\/ppt\//.test(p)) return "ppt";
    if (/\/video\//.test(p)) return "video";
    if (/\/paper\//.test(p)) return "paper";
    if (/\/homework\//.test(p)) return "homework";
    if (/\/extra\//.test(p)) return "extra";
    if (/城市轨道交通运营管理\.pdf$/.test(p)) return "textbook";
    if (/\.zip$/i.test(p)) return "archive";
    return "other";
  }

  function chapterFromPath(path) {
    var text = String(path || "").replace(/^\.\//, "");
    var base = text.split("/").pop() || "";
    var m = base.match(/^(\d{1,2})/);
    if (m) {
      var n = Number(m[1]);
      if (n >= 1 && n <= 16) return n;
    }
    var chinese = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12, 十三: 13, 十四: 14, 十五: 15, 十六: 16 };
    m = base.match(/第\s*([一二三四五六七八九十]+|\d{1,2})\s*章/);
    if (m) {
      if (chinese[m[1]]) return chinese[m[1]];
      if (/^\d{1,2}$/.test(m[1])) return Number(m[1]);
    }
    return null;
  }

  function safePath(href) {
    try {
      var url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) {
        return { path: url.hostname + url.pathname, external: true };
      }
      var path = url.pathname;
      if (path.charAt(0) === "/") path = "." + path;
      return { path: path, external: false, hash: url.hash || "" };
    } catch (e) {
      return { path: String(href || "").slice(0, 300), external: false };
    }
  }

  function onClick(event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-track], a[href]") : null;
    if (!target) return;

    var trackName = target.getAttribute && target.getAttribute("data-track");
    if (trackName) {
      track("button_click", {
        label: (target.textContent || "").trim().slice(0, 60),
        action: trackName,
        sectionId: target.getAttribute("data-section") || "",
      });
    }

    if (target.tagName !== "A") return;
    var href = target.getAttribute("href") || "";
    if (!href || href.charAt(0) === "#" || /^javascript:/i.test(href)) return;
    var info = safePath(href);
    var label = (target.textContent || "").trim().slice(0, 60);
    var resourceType = classifyResource(info.path);
    var isResource = resourceType !== "other" && /resources\//.test(info.path);
    if (!isResource) {
      track("link_click", {
        path: info.path.slice(0, 300),
        label: label,
        resourceType: resourceType,
        anchor: info.hash || "",
      });
      return;
    }

    var isDownload = !!target.hasAttribute("download") || /\.zip$/i.test(info.path);
    track(isDownload ? "resource_download" : "resource_open", {
      path: info.path.slice(0, 300),
      label: label,
      resourceType: resourceType,
      chapter: chapterFromPath(info.path),
      isDownload: isDownload,
      anchor: info.hash || "",
    });
    if (isDownload) {
      track("resource_open", {
        path: info.path.slice(0, 300),
        label: label,
        resourceType: resourceType,
        chapter: chapterFromPath(info.path),
        isDownload: false,
      });
    }
  }

  // 输入节奏：只记录长度、粘贴、停留时长，不读取输入内容
  function setupInputTracking() {
    if (state.page !== "test" && state.page !== "aiqa") return;
    var focusState = new WeakMap();

    function fieldName(el) {
      return (
        el.getAttribute("data-track-field") ||
        el.id ||
        el.name ||
        el.getAttribute("placeholder") ||
        "input"
      ).slice(0, 60);
    }

    function refOf(el) {
      var card = el.closest ? el.closest("[data-question-id]") : null;
      if (card) return { type: "question", id: card.getAttribute("data-question-id") };
      return { type: state.page === "aiqa" ? "ai_input" : "input", id: "" };
    }

    function send(el, final) {
      var s = focusState.get(el);
      if (!s) return;
      var now = Date.now();
      if (!final && now - s.lastSentAt < 15000) return;
      var len = typeof el.value === "string" ? el.value.length : 0;
      var ref = refOf(el);
      track("input_activity", {
        field: fieldName(el),
        lengthDelta: len - s.baseline,
        totalLength: len,
        paste: s.pasted,
        focusMs: now - s.focusAt,
        changeCount: s.changeCount,
        type: ref.type,
        questionId: ref.id,
      });
      s.lastSentAt = now;
      s.pasted = false;
      s.changeCount = 0;
      s.baseline = len;
    }

    document.addEventListener(
      "focusin",
      function (event) {
        var el = event.target;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
        if (el.type === "password") return;
        focusState.set(el, {
          focusAt: Date.now(),
          baseline: typeof el.value === "string" ? el.value.length : 0,
          changeCount: 0,
          pasted: false,
          lastSentAt: 0,
        });
      },
      true
    );

    document.addEventListener(
      "input",
      function (event) {
        var el = event.target;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
        var s = focusState.get(el);
        if (!s) return;
        s.changeCount += 1;
        send(el, false);
      },
      true
    );

    document.addEventListener(
      "paste",
      function (event) {
        var el = event.target;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
        var s = focusState.get(el);
        if (s) s.pasted = true;
      },
      true
    );

    document.addEventListener(
      "focusout",
      function (event) {
        var el = event.target;
        if (!el || !/^(INPUT|TEXTAREA)$/.test(el.tagName)) return;
        send(el, true);
        focusState.delete(el);
      },
      true
    );
  }

  function setupScroll() {
    var update = function () {
      var doc = document.documentElement;
      var height = Math.max(1, doc.scrollHeight - window.innerHeight);
      var pct = Math.round((window.scrollY / height) * 100);
      if (pct > state.maxScrollPct) state.maxScrollPct = Math.min(100, pct);
    };
    window.addEventListener("scroll", update, { passive: true });
    update();
  }

  function sendPageLeave() {
    if (state.leaveSent || !state.enabled) return;
    state.leaveSent = true;
    if (!document.hidden) {
      state.visibleMs += Date.now() - state.visibleStart;
    }
    track(
      "page_leave",
      {
        durationMs: Math.min(2 * 3600 * 1000, Date.now() - state.startedAt),
        visibleMs: Math.min(2 * 3600 * 1000, state.visibleMs),
        maxScrollPct: state.maxScrollPct,
      },
      { immediate: true }
    );
    flush({ beacon: true });
  }

  function init(options) {
    options = options || {};
    state.page = options.page || state.page;
    if (!state.enabled) return;
    getSessionId();
    track("page_view", {
      page: state.page,
      referrerPage: document.referrer ? safePath(document.referrer).path : "",
    });
    document.addEventListener("click", onClick, true);
    setupInputTracking();
    setupScroll();
    state.flushTimer = window.setInterval(function () {
      flush();
    }, 10000);
    window.addEventListener("pagehide", sendPageLeave);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        state.visibleMs += Date.now() - state.visibleStart;
        flush();
      } else {
        state.visibleStart = Date.now();
      }
    });
  }

  window.KGTracker = {
    init: init,
    track: track,
    flush: flush,
    getSessionId: getSessionId,
  };
})();
