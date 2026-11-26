/* IMRC panel — client logic.
 * One script for the whole panel. No inline handlers: everything goes through
 * data-act / data-page / data-toggle attributes and delegated listeners.
 * Local data (history, favourites, notes, matches) lives in localStorage under IMRC_*.
 * Server calls: /api/me, /api/config/create, /api/configs/*, /api/chat, /api/status, /api/track.
 */
(function () {
  "use strict";

  /* ============================== helpers ============================== */
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const FA = "۰۱۲۳۴۵۶۷۸۹";
  const fa = (v) => String(v).replace(/\d/g, (d) => FA[+d]);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const DAY = 86400000;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const dateStr = (ts) => {
    const t = typeof ts === "number" ? ts : Date.parse(ts);
    if (!t || isNaN(t)) return "—";
    try { return new Date(t).toLocaleString("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "short" }); } catch (e) { return new Date(t).toLocaleString("fa-IR"); }
  };
  const daysLeft = (ts) => Math.max(0, Math.ceil((ts - Date.now()) / DAY));

  /* ============================== data ============================== */
  // ping = تخمین پایه از فهرست (نه اندازه‌گیری زنده)
  const COUNTRIES = [
    { code: "tr", name: "ترکیه", flag: "🇹🇷", ping: 38, status: "green", codm: true, games: ["CODM Ranked", "BR"] },
    { code: "de", name: "آلمان", flag: "🇩🇪", ping: 52, status: "green", codm: true, games: ["CODM", "CS2"] },
    { code: "ae", name: "امارات", flag: "🇦🇪", ping: 58, status: "green", codm: true, games: ["CODM", "PUBG"] },
    { code: "fr", name: "فرانسه", flag: "🇫🇷", ping: 64, status: "yellow", codm: true, games: ["CODM"] },
    { code: "jp", name: "ژاپن", flag: "🇯🇵", ping: 45, status: "green", codm: false, games: ["Valorant"] },
    { code: "sa", name: "عربستان", flag: "🇸🇦", ping: 68, status: "yellow", codm: true, games: ["CODM"] },
    { code: "gb", name: "انگلیس", flag: "🇬🇧", ping: 61, status: "yellow", codm: true, games: ["CODM"] },
    { code: "om", name: "عمان", flag: "🇴🇲", ping: 55, status: "green", codm: true, games: ["CODM"] },
    { code: "kr", name: "کره", flag: "🇰🇷", ping: 48, status: "green", codm: false, games: ["Valorant"] },
    { code: "us", name: "آمریکا", flag: "🇺🇸", ping: 130, status: "red", codm: false, games: ["Fortnite"] },
  ];
  const DNS_ELEKTRO = "10.202.10.10, 78.157.42.101";
  const DNS_CF = "1.1.1.1, 1.0.0.1";
  const MODE_FA = { ranked: "رنکد", br: "بتل‌رویال", mp: "مالتی‌پلیر" };
  const ROLE_FA = { attacker: "Attacker (تهاجمی)", defender: "Defender (دفاعی)", support: "Support (پشتیبانی)" };
  const ROLE_SHORT = { attacker: "Attacker", defender: "Defender", support: "Support" };
  const THEMES = [
    ["vice", "نئون میامی", "#08050f", "#ff2d95", "#22d3ee"],
    ["crimson", "قرمز نئون", "#06060a", "#ff2b45", "#ff9aa8"],
    ["light", "روشن", "#f3f5f9", "#ffffff", "#2347f0"],
    ["dark", "تیره", "#0a0e16", "#111827", "#6d8cff"],
    ["gold", "طلایی", "#0b0904", "#16120a", "#ffc53d"],
    ["red", "قرمز", "#11060a", "#1c0c11", "#e0394b"],
    ["neon", "نئون", "#090720", "#13102f", "#5cf2e0"],
    ["green", "سبز", "#061009", "#0d1a10", "#6bff3d"],
  ];
  const THEME_IDS = THEMES.map((t) => t[0]);
  const PAGES = {
    home: "خانه", build: "ساخت کانفیگ", tools: "ابزارهای کمکی", whatsnew: "قابلیت‌های جدید",
    stats: "آمار و سوابق", support: "پشتیبانی آنلاین", help: "راهنما", settings: "تنظیمات",
  };
  const HIST_MAX = 20;
  const MTU_OPTS = ["1280", "1350", "1400", "1420", "1450"];

  const FAQ = [
    ["این سایت دقیقاً چیست؟", "یک فایل کانفیگ WireGuard برای بازی می‌سازد. فایل را در اپ رسمی WireGuard وارد می‌کنی و وصل می‌شوی."],
    ["چرا باید اپ WireGuard نصب کنم؟", "کانفیگ فقط با اپ WireGuard کار می‌کند. نسخه‌ی رسمی را از Google Play یا wireguard.com نصب کن."],
    ["کشور را چطور انتخاب کنم؟", "کشوری با کمترین پینگ را انتخاب کن. اگر تازه‌کاری، دکمه‌ی «پیشنهاد بده» در کارت شروع را بزن."],
    ["فایل دانلود شد، حالا چه کنم؟", "فایل را در WireGuard انتخاب کن (Import)، سپس تونل را روشن کن. کادر «وصل شدم» را هم تیک بزن."],
    ["وصل نمی‌شود، چه کنم؟", "از «عیب‌یاب» در همین صفحه استفاده کن؛ علامت مشکل را انتخاب کن تا مراحل را ببینی."],
    ["کانفیگ‌هایم کجا می‌مانند؟", "فایل کامل کانفیگ تا ۳۰ روز در حساب تو می‌ماند و بعد حذف می‌شود. از «آمار و سوابق» دوباره دانلودش کن."],
    ["کلید خصوصی را به کسی بدهم؟", "نه. هر کسی کلید را داشته باشد می‌تواند با آن وصل شود. برای پشتیبانی از «کپی بی‌کلید» استفاده کن."],
    ["حالت ساده یعنی چه؟", "تنظیمات پیشرفته مثل MTU و DNS پنهان می‌شوند و فقط مواردی که لازم داری می‌مانند."],
    ["چرا بعضی کشورها قفل هستند؟", "کاربران رایگان به چند کشور محدود دارند. برای باز شدن بقیه، اشتراک تهیه کن."],
    ["پینگ‌های نمایش‌داده‌شده دقیق‌اند؟", "پینگ‌های فهرست تخمینی‌اند. برای سنجش واقعی اتصال خودت، «ابزارهای کمکی ← تست پینگ» را بزن."],
  ];
  const TROUBLE = [
    ["وصل نمی‌شود", ["مطمئن شو تونل در اپ WireGuard روشن است و خطایی نشان نمی‌دهد.", "از جدیدترین فایل استفاده کن؛ اگر فایل بیش از ۳۰ روز پیش ساخته شده، کانفیگ جدید بساز.", "MTU و DNS را روی مقدار پیش‌فرض بگذار.", "کشور دیگری را امتحان کن."]],
    ["پینگ بالاست", ["کشوری نزدیک‌تر یا با پینگ کمتر را از فهرست انتخاب کن.", "برنامه‌های دانلود و آپلود را موقت ببند.", "از وای‌فای به جای اینترنت موبایل استفاده کن.", "کانفیگ جدید با کشور دیگر بساز و دوباره امتحان کن."]],
    ["اینترنت کند است", ["MTU را روی ۱۲۸۰ بگذار (در حالت پیشرفته).", "DNS را روی مقدار پیش‌فرض نگه دار.", "تونل را خاموش و دوباره روشن کن.", "وضعیت سرویس را از نشان بالای صفحه ببین."]],
    ["فایل دانلود نشد", ["از «کپی کل کانفیگ» استفاده کن و متن را در اپ WireGuard با گزینه‌ی Create from scratch بچسبان.", "اگر صفحه داخل تلگرام یا اینستاگرام باز شده، لینک را در مرورگر اصلی باز کن.", "اجازه‌ی دانلود فایل را در مرورگر بده."]],
    ["خطای محدودیت یا قفل", ["سهمیه‌ی امروزت را ببین؛ هر دوره محدود است.", "کشورهای رایگان محدودند؛ کشور دیگری را امتحان کن.", "برای گزینه‌های بیشتر اشتراک تهیه کن."]],
  ];
  const GLOSS = [
    ["WireGuard", "پروتکل VPN سبک و سریع. کانفیگ این سایت برای همین اپ ساخته می‌شود."],
    ["کانفیگ (Config)", "فایل تنظیمات اتصال. کلیدها و آدرس سرور داخل آن است."],
    ["کلید خصوصی (PrivateKey)", "کلید مخفی دستگاه تو. آن را هرگز برای کسی نفرست."],
    ["Endpoint", "آدرس و پورت سروری که به آن وصل می‌شوی."],
    ["DNS", "سرویسی که نام سایت‌ها را به آدرس تبدیل می‌کند."],
    ["MTU", "بزرگ‌ترین اندازه‌ی بسته‌ی شبکه. مقدار پیش‌فرض معمولاً مناسب است."],
    ["AllowedIPs", "مشخص می‌کند کدام ترافیک از تونل عبور کند."],
    ["Peer", "طرف مقابل تونل؛ یعنی سرور."],
    ["پینگ", "زمان رفت‌وبرگشت داده به سرور بر حسب میلی‌ثانیه. کمتر بهتر است."],
    ["جیتر", "میزان نوسان پینگ. جیتر کم یعنی اتصال پایدارتر."],
    ["پکت‌لاست (افت بسته)", "درصد بسته‌هایی که به مقصد نمی‌رسند. کمتر بهتر است."],
    ["پریست", "مجموعه‌ی تنظیمات آماده برای یک هدف مشخص."],
  ];
  const CHECKS = ["شارژ گوشی بالای ۵۰٪", "اپ‌های پس‌زمینه بسته شد", "وای‌فای/دیتا پایدار است", "پینگ تست شد", "حساسیت و گرافیک چک شد", "آب و استراحت آماده است"];
  const ACH = [
    ["اولین کانفیگ", (s) => s.cfg >= 1],
    ["۵ کانفیگ", (s) => s.cfg >= 5],
    ["۱۰ کانفیگ", (s) => s.cfg >= 10],
    ["کم‌پینگ (۳ سرور زیر ۵۵)", (s) => s.low >= 3],
    ["سرور ترکیه", (s) => s.tr],
    ["۱۰ کانفیگ در یک ماه", (s) => s.cfg >= 10 && s.low >= 1],
  ];

  /* ============================== state ============================== */
  const S = {
    mode: "ranked", role: "attacker", code: "",
    favOnly: false, free: null, buyText: "", unlock: false,
    last: null, building: false, srvItems: [],
    pinging: false,
    chatBusy: false, chatTimer: null, chatIds: "", reactState: 0, reactT: 0, reactTo: null,
  };

  /* ============================== core UI ============================== */
  let toastTimer = null;
  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), ms || 2600);
  }
  function playSound(kind) {
    if (!store.get("IMRC_sound", true)) return;
    try {
      const ac = new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.connect(g); g.connect(ac.destination);
      o.type = "sine";
      o.frequency.value = kind === "ok" ? 740 : kind === "warn" ? 300 : 520;
      g.gain.value = 0.05;
      o.start();
      g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
      o.stop(ac.currentTime + 0.24);
      setTimeout(() => ac.close && ac.close(), 400);
    } catch (e) {}
  }
  function vibrate(ms) { if (store.get("IMRC_vib", true) && navigator.vibrate) navigator.vibrate(ms || 40); }

  function track(type, data) {
    try {
      let vid = "";
      try { vid = localStorage.getItem("imrc_vid") || ""; } catch (e) {}
      if (!/^[a-zA-Z0-9-]{8,40}$/.test(vid)) {
        vid = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
        try { localStorage.setItem("imrc_vid", vid); } catch (e) {}
      }
      const body = JSON.stringify({ vid, type, data: data || {} });
      if (navigator.sendBeacon && navigator.sendBeacon("/api/track", new Blob([body], { type: "application/json" }))) return;
      fetch("/api/track", { method: "POST", body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(() => {});
    } catch (e) {}
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg || "✅ کپی شد");
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.top = "-9999px";
      document.body.appendChild(ta); ta.select();
      let ok = false;
      try { ok = document.execCommand("copy"); } catch (e) {}
      document.body.removeChild(ta);
      ok ? done() : toast("❌ کپی نشد");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done).catch(fallback);
    else fallback();
  }

  function forceDownload(text, filename) {
    try {
      const blob = new Blob([text], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.rel = "noopener";
      a.style.display = "none";
      document.body.appendChild(a); a.click();
      setTimeout(() => { try { document.body.removeChild(a); } catch (e) {} try { URL.revokeObjectURL(url); } catch (e) {} }, 2500);
      return true;
    } catch (e) {
      toast("❌ دانلود ناموفق؛ از «کپی کل کانفیگ» استفاده کن", 3800);
      return false;
    }
  }

  /* ---------- dialog ---------- */
  let dlgPrev = null;
  function dlgOpen(title, html) {
    $("dlgTitle").textContent = title;
    $("dlgBody").innerHTML = html;
    const d = $("dlg");
    dlgPrev = document.activeElement;
    d.classList.add("on");
    d.setAttribute("aria-hidden", "false");
    const first = d.querySelector("button, input, select, textarea, a[href]");
    if (first) setTimeout(() => first.focus(), 30);
  }
  function dlgClose() {
    const d = $("dlg");
    d.classList.remove("on");
    d.setAttribute("aria-hidden", "true");
    if (dlgPrev && dlgPrev.focus) dlgPrev.focus();
  }

  /* ---------- palette ---------- */
  let cmdList = [], cmdIdx = 0;
  function paletteOpen() {
    const p = $("cmdPalette");
    p.classList.add("on");
    p.setAttribute("aria-hidden", "false");
    $("cmdInput").value = "";
    paletteFilter();
    setTimeout(() => $("cmdInput").focus(), 30);
  }
  function paletteClose() {
    const p = $("cmdPalette");
    p.classList.remove("on");
    p.setAttribute("aria-hidden", "true");
  }
  function paletteFilter() {
    const q = $("cmdInput").value.trim().toLowerCase();
    cmdList = COMMANDS.filter((c) => !q || c.label.toLowerCase().includes(q));
    cmdIdx = 0;
    paletteRender();
  }
  function paletteRender() {
    const box = $("cmdList");
    box.innerHTML = cmdList.map((c, i) =>
      `<button role="option" aria-selected="${i === cmdIdx}" data-idx="${i}">${esc(c.label)}</button>`
    ).join("") || '<div class="hint" style="padding:.8rem">دستوری پیدا نشد</div>';
  }
  function paletteRun(i) {
    const c = cmdList[i];
    if (!c) return;
    paletteClose();
    c.run();
  }

  /* ============================== themes / prefs ============================== */
  function applyTheme(name) {
    const id = THEME_IDS.includes(name) ? name : "vice";
    document.documentElement.dataset.theme = id;
    $$(".theme-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.themeSet === id)));
    return id;
  }
  function cycleTheme() {
    const cur = document.documentElement.dataset.theme || "vice";
    const next = THEME_IDS[(THEME_IDS.indexOf(cur) + 1) % THEME_IDS.length];
    store.set("IMRC_theme", next);
    applyTheme(next);
    toast("تم: " + THEMES.find((t) => t[0] === next)[1]);
  }
  function renderThemes() {
    $("themeList").innerHTML = THEMES.map(([id, label, a, b, c]) =>
      `<button class="theme-btn" data-act="theme" data-theme-set="${id}" aria-pressed="false">
         <span class="swatch"><i style="background:${a}"></i><i style="background:${b}"></i><i style="background:${c}"></i></span>
         <span>${esc(label)}</span></button>`
    ).join("");
    applyTheme(store.get("IMRC_theme", null));
  }
  function applyFont(n) {
    const v = clamp(Math.round(Number(n) || 15), 13, 18);
    document.documentElement.style.fontSize = v + "px";
    document.documentElement.style.setProperty("--fs", v + "px");
    $("fontLabel").textContent = v + "px";
    store.set("IMRC_font", v);
  }
  function applyPrefs() {
    const on = {
      simple: store.get("IMRC_bx_simple", false),
      hc: store.get("IMRC_bx_hc", false),
      focus: store.get("IMRC_bx_focus", false),
    };
    Object.keys(on).forEach((k) => document.body.classList.toggle(k, !!on[k]));
    $("btnFocusExit").hidden = !on.focus;
    $("tgSimple").checked = !!on.simple;
    $("tgHc").checked = !!on.hc;
    $("tgFocus").checked = !!on.focus;
    $("tgSound").checked = store.get("IMRC_sound", true);
    $("tgVibrate").checked = store.get("IMRC_vib", true);
    const hideGuide = store.get("IMRC_bx_hide", false);
    $("tgGuide").checked = !hideGuide;
    $("bxStart").hidden = hideGuide;
    $("bxShowBtn").hidden = !hideGuide;
  }

  /* ============================== routing ============================== */
  function pageFromHash() {
    const m = location.hash.match(/^#\/([a-z]+)$/);
    return m && PAGES[m[1]] ? m[1] : null;
  }
  function go(page, opts) {
    if (!PAGES[page]) page = "home";
    const tr = $(".page-transition");
    if (tr && !opts?.silent) { tr.classList.add("active"); setTimeout(() => tr.classList.remove("active"), 500); }
    opts = opts || {};
    $$(".page").forEach((p) => p.classList.toggle("active", p.id === "page-" + page));
    $$(".nav-i[data-page], .bottom-nav [data-page]").forEach((b) => {
      if (b.dataset.page === page) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    $("crumb").textContent = PAGES[page];
    document.title = "IMRC • " + PAGES[page];
    if (location.hash !== "#/" + page) history.replaceState(null, "", "#/" + page);
    if (!opts.silent) {
      track("action", { name: "switchTab", detail: page });
      window.scrollTo(0, 0);
    }
    if (page === "stats") { renderStats(); renderHistory(); }
    if (page === "support") loadChat(true);
    scheduleChat();
    if (page === "tools") renderToolsToolbar();
    if (page === "whatsnew") markWhatsNewSeen();
    if (page === "home") renderStart();
    if (page === "help") renderFaq();
    if (page === "settings") { renderToolsCustomize(); const lab=$("tgLab"); const lf=$("labFlags"); if(lab&&lf) lf.style.display = lab.checked ? "block" : "none"; }
    return page;
  }

  /* ============================== quota / account ============================== */
  function plural(n) { return fa(n); }
  function applyQuota(q) {
    if (!q || q.limit == null) return;
    const bar = $("quotaBar");
    const who = q.name || (q.username ? "@" + q.username : "");
    if (who) $("userChip").textContent = who;
    const per = { day: "امروز", week: "این هفته", month: "این ماه" }[q.period || "day"] || "امروز";
    const plan = q.sub && q.sub_until ? "⭐ اشتراک تا " + new Date(q.sub_until).toLocaleDateString("fa-IR") : (q.custom ? "سقف اختصاصی" : "رایگان");
    $("quotaText").textContent = per + ": " + plural(q.used) + " از " + plural(q.limit) + " کانفیگ • " + plan;
    $("quotaMeter").style.width = Math.min(100, Math.round((q.used / Math.max(1, q.limit)) * 100)) + "%";
    $("quotaBar").querySelector("[data-act='buy']").hidden = !!q.sub;
    $("homePlan").textContent = plan;
    $("homeUsed").textContent = plural(q.used);
    $("homeLeft").textContent = plural(Math.max(0, q.limit - q.used));
    if (q.buy_text) S.buyText = q.buy_text;
    if (Array.isArray(q.free_countries)) S.free = q.free_countries.map((c) => String(c).toLowerCase());
    S.unlock = !!q.unlock || !!q.sub;
    bar.hidden = false;
    renderServers();
  }
  async function loadQuota() {
    try {
      const r = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) { location.href = "/login.html"; return; }
      if (r.status === 403) { location.href = "/login.html?join=1"; return; }
      if (r.ok) applyQuota(await r.json());
    } catch (e) {}
  }
  function showLimit(d) {
    const per = { day: "روزانه", week: "هفتگی", month: "ماهانه" }[d.period || "day"] || "روزانه";
    dlgOpen("سقف " + per + " تموم شد (" + fa(d.used) + " از " + fa(d.limit) + ")", "<p>" + esc(d.message || "") + "</p>" +
      '<div class="row" style="margin-top:.8rem"><button class="btn primary" data-act="buy">⭐ خرید اشتراک</button></div>');
  }
  function showBuy() {
    const card = (S.buyText.match(/\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}/) || [])[0];
    dlgOpen("⭐ خرید اشتراک", '<p style="white-space:pre-wrap">' + esc(S.buyText || "برای خرید اشتراک، از ربات تلگرام دستور /plans را بفرست.") + "</p>" +
      (card ? '<div class="row" style="margin-top:.8rem"><button class="btn" data-act="copyText" data-text="' + esc(card.replace(/\D/g, "")) + '">📋 کپی شماره کارت</button></div>' : ""));
  }

  /* ============================== servers ============================== */
  const byCode = (c) => COUNTRIES.find((x) => x.code === c);
  const favs = () => store.get("IMRC_favs", []).filter((c) => byCode(c));
  function isLocked(c) { return !!(S.free && !S.unlock && !S.free.includes(c.code)); }
  function pingColor(p) { return p <= 55 ? "var(--ok)" : p <= 70 ? "var(--warn)" : "var(--danger)"; }
  function renderServers() {
    const q = $("srvSearch").value.trim().toLowerCase();
    const f = favs();
    let list = COUNTRIES.slice().sort((a, b) => a.ping - b.ping);
    if (S.favOnly) list = list.filter((c) => f.includes(c.code));
    if (q) list = list.filter((c) => c.name.includes(q) || c.code.includes(q) || c.flag === q);
    $("srvList").innerHTML = list.map((c) => `
      <div class="srv" role="option" tabindex="0" data-code="${c.code}" aria-selected="${c.code === S.code}">
        <span class="flag" aria-hidden="true">${c.flag}</span>
        <div style="min-width:0"><div class="nm">${esc(c.name)} ${isLocked(c) ? '<span class="lock">🔒 اشتراک</span>' : ""}</div>
          <small>${esc(c.games.join("، "))}</small></div>
        <span class="dot ${c.status}" title="وضعیت ${c.status}"></span>
        <span class="ms" style="color:${pingColor(c.ping)}">${fa(c.ping)} ms</span>
        <button class="btn sm ghost" data-fav="${c.code}" aria-label="علاقه‌مندی ${esc(c.name)}" aria-pressed="${f.includes(c.code)}">${f.includes(c.code) ? "★" : "☆"}</button>
      </div>`).join("") || '<div class="empty"><b>سروری پیدا نشد</b>جستجو را پاک کن یا فیلتر ستاره را بردار.</div>';
    const picks = COUNTRIES.filter((c) => c.codm).sort((a, b) => a.ping - b.ping).slice(0, 4);
    $("recRow").innerHTML = picks.map((c) => `<button class="chip" data-act="pick" data-code="${c.code}">${c.flag} ${esc(c.name)} · ${fa(c.ping)}ms</button>`).join("");
    updateSummary();
    renderStart();
  }
  function selectServer(code) {
    const c = byCode(code);
    if (!c) return;
    S.code = code;
    $$("#srvList .srv").forEach((el) => el.setAttribute("aria-selected", String(el.dataset.code === code)));
    $("pingWarn").hidden = c.ping <= 75;
    updateSummary();
    renderStart();
  }
  function toggleFav(code) {
    let f = favs();
    f = f.includes(code) ? f.filter((x) => x !== code) : f.concat(code);
    store.set("IMRC_favs", f);
    renderServers();
    toast(f.includes(code) ? "⭐ به علاقه‌مندی‌ها اضافه شد" : "از علاقه‌مندی‌ها حذف شد");
  }
  function currentMtu() {
    const c = parseInt($("mtuCustom").value, 10);
    return c >= 576 && c <= 1500 ? String(c) : $("mtuSel").value;
  }
  function dnsName(v) {
    const o = Array.from($("dnsSel").options).find((x) => x.value === v);
    return o ? o.textContent : v;
  }
  function updateSummary() {
    const c = byCode(S.code);
    const parts = [
      c ? c.flag + " " + c.name : "سروری انتخاب نشده",
      MODE_FA[S.mode], ROLE_SHORT[S.role],
      "MTU " + fa(currentMtu()),
    ];
    $("buildSummary").textContent = parts.join(" • ");
  }

  /* ============================== mode / role / presets ============================== */
  function setMode(m) {
    if (!MODE_FA[m]) return;
    S.mode = m;
    $$("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
    updateSummary();
    track("action", { name: "setMode", detail: m });
  }
  function setRole(r) {
    if (!ROLE_FA[r]) return;
    S.role = r;
    $$("[data-role]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.role === r)));
    updateSummary();
    track("action", { name: "setRole", detail: r });
  }
  function setMtu(v) {
    const sel = $("mtuSel");
    if (MTU_OPTS.includes(String(v))) sel.value = String(v);
    $("mtuCustom").value = "";
    $("useMtu").checked = true;
    updateSummary();
  }
  const PRESETS = {
    ranked: { mode: "ranked", code: "tr", mtu: "1280", dns: DNS_ELEKTRO, label: "رنکد حرفه‌ای" },
    br: { mode: "br", code: "ae", mtu: "1400", label: "بتل‌رویال" },
    lowping: { mode: "ranked", code: "tr", mtu: "1280", dns: DNS_CF, label: "کم‌پینگ" },
    tournament: { mode: "ranked", code: "de", mtu: "1350", label: "تورنمنت" },
  };
  function applyPreset(type) {
    const p = PRESETS[type];
    if (!p) return;
    setMode(p.mode);
    selectServer(p.code);
    setMtu(p.mtu);
    if (p.dns) { $("dnsSel").value = p.dns; $("useDns").checked = true; }
    if (!$("cfgName").value.trim()) setName(autoName());
    updateSummary();
    playSound("ok");
    toast("پریست «" + p.label + "» اعمال شد");
    track("action", { name: "applyPreset", detail: type });
  }
  /* ============================== naming ============================== */
  const NAME_MAX = 15;
  function imrcName(v) {
    let rest = String(v == null ? "" : v).replace(/[\u0000-\u001f<>\/\\:*?"|]/g, "").trim().replace(/^imrc/i, "");
    const sep = /^[-_]/.test(rest) ? rest[0] : "-";
    rest = rest.replace(/^[\s_-]+/, "").trim();
    return (rest ? "IMRC" + sep + rest : "IMRC").slice(0, NAME_MAX);
  }
  function g2j(gy, gm, gd) {
    const g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy > 1600) ? 979 : 0; gy -= (gy > 1600) ? 1600 : 621;
    const gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g[gm - 1];
    jy += 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jm, jd];
  }
  function shamsiMD() {
    const d = new Date();
    try {
      const p = new Intl.DateTimeFormat("en-u-ca-persian-nu-latn", { month: "numeric", day: "numeric" }).formatToParts(d);
      const m = p.find((x) => x.type === "month").value, dd = p.find((x) => x.type === "day").value;
      if (/^\d+$/.test(m) && /^\d+$/.test(dd)) return [+m, +dd];
    } catch (e) {}
    return g2j(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  function autoName() { const t = shamsiMD(); return "IMRC-" + t[0] + "-" + t[1]; }
  function setName(v) { $("cfgName").value = imrcName(v); }

  /* ============================== build & result ============================== */
  async function build() {
    if (S.building) return;
    if (!S.code) {
      go("build");
      toast("اول یک سرور از فهرست انتخاب کن");
      return;
    }
    if (!$("cfgName").value.trim()) setName(autoName());
    const name = imrcName($("cfgName").value);
    $("cfgName").value = name;
    const useDns = $("useDns").checked, useMtu = $("useMtu").checked;
    const body = {
      name, region: S.code,
      dns: useDns ? $("dnsSel").value : "",
      mtu: useMtu ? currentMtu() : "",
      mode: S.mode, role: S.role,
    };
    S.building = true;
    $("btnBuild").disabled = true; $("btnQuick").disabled = true;
    $("resIdle").hidden = true; $("resBox").hidden = true; $("resLoading").hidden = false;
    try {
      const res = await fetch("/api/config/create", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) { location.href = "/login.html"; return; }
      if (res.status === 403 && d.error === "join") { location.href = "/login.html?join=1"; return; }
      if (res.status === 403 && d.error === "premium") { $("resLoading").hidden = true; $("resIdle").hidden = false; dlgOpen("🔒 مخصوص اشتراک", '<p style="white-space:pre-wrap">' + esc(d.message || "") + "</p>"); return; }
      if (res.status === 429) { $("resLoading").hidden = true; $("resIdle").hidden = false; showLimit(d); applyQuota(d); return; }
      if (!res.ok) throw new Error(d.error || d.message || "خطا در ساخت کانفیگ");
      applyQuota(d);
      const c = byCode(S.code);
      const item = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name, code: S.code, date: Date.now(), mode: S.mode, role: S.role,
        mtu: body.mtu, dns: body.dns, ping: c ? c.ping : null, config: d.config,
        note: "", tags: "",
      };
      S.last = item;
      const fname = name + "_" + S.code + ".conf";
      const saved = saveHistory(item);
      const downloaded = forceDownload(d.config, fname);
      renderResult(item);
      playSound("ok"); vibrate(60);
      if (downloaded) toast("✅ کانفیگ دانلود شد: " + fname, 3400);
      else toast("⚠️ دانلود خودکار نشد — از «کپی کل کانفیگ» استفاده کن", 4200);
      if (!saved) toast("⚠️ فضای ذخیره‌سازی پر است؛ کانفیگ‌های قدیمی را از تاریخچه پاک کن", 4200);
      if (c && c.ping > 75) $("pingWarn").hidden = false;
    } catch (e) {
      $("resLoading").hidden = true; $("resIdle").hidden = false;
      toast("❌ " + (e.message || "خطا در ارتباط با سرور"), 3600);
    } finally {
      S.building = false;
      $("btnBuild").disabled = false; $("btnQuick").disabled = false;
      renderStart();
    }
  }
  function keyOf(text, re) { const m = String(text || "").match(re); return m ? m[1].trim() : ""; }
  function redact(text) { return String(text || "").replace(/^(\s*PrivateKey\s*=\s*).+$/m, "$1<کلید خصوصی پنهان شد>"); }
  function renderResult(item) {
    const c = byCode(item.code);
    $("resLoading").hidden = true; $("resIdle").hidden = true; $("resBox").hidden = false;
    $("resName").textContent = item.name;
    $("resWhen").textContent = dateStr(item.date);
    const tags = [];
    if (c) {
      if (c.codm) tags.push('<span class="badge ok">🎮 مناسب بازی رقابتی</span>');
      tags.push('<span class="badge">' + esc(c.flag + " " + c.name) + "</span>");
      c.games.forEach((g) => tags.push('<span class="badge">' + esc(g) + "</span>"));
    }
    tags.push('<span class="badge">' + esc(MODE_FA[item.mode] || item.mode) + "</span>");
    tags.push('<span class="badge">' + esc(ROLE_SHORT[item.role] || item.role) + "</span>");
    $("resTags").innerHTML = tags.join("");
    $("estPing").textContent = c ? fa(c.ping) + " ms" : "—";
    $("estMtu").textContent = item.mtu ? fa(item.mtu) : "پیش‌فرض";
    $("estDns").textContent = item.dns ? dnsName(item.dns) : "پیش‌فرض";
    $("resExpiry").textContent = "این فایل تا ۳۰ روز در حساب تو می‌ماند؛ بعد از آن از «آمار و سوابق» قابل دانلود نیست.";
    $("cfgText").textContent = item.config;
    const qr = $("qrBox");
    qr.innerHTML = "";
    if (window.QRCode) { try { new QRCode(qr, { text: item.config, width: 140, height: 140, correctLevel: QRCode.CorrectLevel.M }); } catch (e) {} }
    $("noteText").value = item.note || "";
    $("noteTags").value = item.tags || "";
    S.last = item;
    renderStart();
  }

  /* ============================== history ============================== */
  function validHist(h) {
    return h && typeof h === "object" && typeof h.config === "string" && h.config.includes("[Interface]") &&
      typeof h.code === "string" && !!byCode(h.code) && typeof h.name === "string";
  }
  function hist() {
    const h = store.get("IMRC_hist", []);
    return Array.isArray(h) ? h.filter(validHist) : [];
  }
  function saveHistory(item) {
    const list = hist();
    list.unshift(item);
    return store.set("IMRC_hist", list.slice(0, HIST_MAX));
  }
  function updateHistItem(id, patch) {
    const list = hist();
    const i = list.findIndex((h) => h.id === id);
    if (i < 0) return false;
    Object.assign(list[i], patch);
    store.set("IMRC_hist", list);
    return true;
  }
  function renderHistory() {
    const q = $("histSearch").value.trim().toLowerCase();
    let list = hist();
    if (q) list = list.filter((h) => [h.name, h.code, h.note, h.tags].join(" ").toLowerCase().includes(q));
    $("histList").innerHTML = list.length ? list.map((h) => {
      const c = byCode(h.code);
      return `<div class="item">
        <div style="min-width:0"><b>${esc((c ? c.flag : "") + " " + h.name)}</b>
          <div class="meta">${esc(dateStr(h.date))} • ${esc(MODE_FA[h.mode] || "")} • ${esc(ROLE_SHORT[h.role] || "")}${h.note ? " • " + esc(h.note) : ""}${h.tags ? " • " + esc(h.tags) : ""}</div></div>
        <div class="acts">
          <button class="btn sm" data-act="histOpen" data-id="${esc(h.id)}">نمایش</button>
          <button class="btn sm" data-act="histDl" data-id="${esc(h.id)}">دانلود</button>
        </div></div>`;
    }).join("") : '<div class="empty"><b>هنوز کانفیگی ساخته نشده</b>از صفحه‌ی «ساخت کانفیگ» شروع کن.</div>';
  }
  function openHistory(id) {
    const h = hist().find((x) => x.id === id);
    if (!h) return;
    S.code = h.code;
    $("cfgName").value = h.name;
    S.mode = MODE_FA[h.mode] ? h.mode : S.mode;
    S.role = ROLE_FA[h.role] ? h.role : S.role;
    setMode(S.mode); setRole(S.role);
    go("build");
    renderServers();
    renderResult({ id: h.id, name: h.name, code: h.code, date: h.date, mode: h.mode, role: h.role, mtu: h.mtu, dns: h.dns, config: h.config, note: h.note, tags: h.tags });
  }

  /* ============================== stats & achievements ============================== */
  function statsSnapshot() {
    const h = hist();
    return {
      cfg: h.length,
      low: h.filter((x) => (byCode(x.code) || {}).ping < 55).length,
      tr: h.some((x) => x.code === "tr"),
    };
  }
  function renderStats() {
    const list = hist();
    const pings = list.map((h) => h.ping != null ? h.ping : (byCode(h.code) || {}).ping).filter((p) => p != null);
    $("kpiCount").textContent = fa(list.length);
    $("kpiPing").textContent = pings.length ? fa(Math.round(pings.reduce((a, b) => a + b, 0) / pings.length)) + " ms" : "–";
    const counts = {};
    list.forEach((h) => { counts[h.code] = (counts[h.code] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    $("kpiTop").textContent = top.length ? (byCode(top[0][0]) || {}).name || "–" : "–";
    const snap = statsSnapshot();
    const earned = ACH.filter((a) => a[1](snap));
    $("kpiAch").textContent = fa(earned.length);
    $("achList").innerHTML = ACH.map(([label, fn]) => `<span class="badge ${fn(snap) ? "ok" : ""}">${fn(snap) ? "✓ " : ""}${esc(label)}</span>`).join("") ;

    const recent = list.slice(0, 7).reverse();
    const maxP = Math.max(1, ...recent.map((h) => h.ping || 0));
    $("pingChart").innerHTML = recent.length ? recent.map((h) => `<i style="height:${Math.max(6, Math.round(((h.ping || 0) / maxP) * 100))}%" title="${esc(h.name)}: ${fa(h.ping || 0)} ms"></i>`).join("") : '<span class="hint">هنوز کانفیگی نساختی</span>';

    const max = top.length ? top[0][1] : 1;
    $("countryChart").innerHTML = top.slice(0, 5).map(([code, n]) => {
      const c = byCode(code) || { name: code, flag: "" };
      return `<div class="bar-row"><span>${esc(c.flag + " " + c.name)}</span><div class="track"><i style="width:${Math.round((n / max) * 100)}%"></i></div><b>${fa(n)}</b></div>`;
    }).join("") || '<span class="hint">هنوز داده‌ای نیست</span>';

    const goal = store.get("IMRC_goal", null);
    const avg = pings.length ? Math.round(pings.reduce((a, b) => a + b, 0) / pings.length) : null;
    $("goalStatus").textContent = goal == null ? "هدفی ثبت نشده" :
      (avg == null ? "هنوز کانفیگی نساختی" : "میانگین فعلی: " + fa(avg) + " ms • هدف: " + fa(goal) + " ms " + (avg <= goal ? "✅ رسیده" : "⏳ هنوز نرسیده"));
    if (goal != null) $("goalInput").value = goal;
  }

  /* ---------- server-side history (last 30 days) ---------- */
  function daysLeftLabel(ts) { const d = daysLeft(ts); return d ? fa(d) + " روز مانده" : "امروز حذف می‌شود"; }
  function renderExpiry() {
    const soon = S.srvItems.filter((h) => h.file_id && h.file_expires && daysLeft(h.file_expires) <= 3);
    const box = $("bxExp");
    if (!soon.length) { box.hidden = true; return; }
    box.hidden = false;
    box.textContent = "⚠️ " + fa(soon.length) + " فایل کانفیگ " + (daysLeft(soon[0].file_expires) ? "تا " + fa(daysLeft(soon[0].file_expires)) + " روز دیگر حذف می‌شود" : "امروز حذف می‌شود") + ". اگر لازم داری از «آمار و سوابق» دانلودش کن.";
  }
  async function loadServerHistory() {
    const box = $("srvHistList");
    try {
      const r = await fetch("/api/configs/history", { credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) { box.innerHTML = '<div class="empty">برای دیدن سابقه دوباره وارد شو</div>'; return; }
      if (!r.ok) throw new Error();
      const d = await r.json();
      S.srvItems = d.items || [];
      renderServerHistory();
      renderExpiry();
    } catch (e) {
      box.innerHTML = '<div class="empty">خطا در دریافت سابقه؛ بعداً دوباره امتحان کن</div>';
    }
  }
  function renderServerHistory() {
    const box = $("srvHistList");
    if (!S.srvItems.length) { box.innerHTML = '<div class="empty"><b>هنوز کانفیگی روی این حساب ثبت نشده</b></div>'; return; }
    box.innerHTML = S.srvItems.map((h, i) => {
      const c = byCode(String(h.region || "").toLowerCase());
      const file = h.file_id && h.file_expires && h.file_expires > Date.now();
      const warn = file && daysLeft(h.file_expires) <= 3;
      return `<div class="item">
        <div style="min-width:0"><b>${esc((c ? c.flag + " " : "") + (h.name || "بدون نام"))}</b> <span class="badge">${esc(String(h.region || "").toUpperCase())}</span>
          <div class="meta">${esc(MODE_FA[h.mode] || h.mode || "")} • ${esc(ROLE_SHORT[h.role] || h.role || "")} • ${esc(dateStr(h.ts))}</div>
          <span class="badge ${warn ? "warn" : file ? "ok" : ""}">${file ? "فایل: " + daysLeftLabel(h.file_expires) : "فایل حذف شده"}</span></div>
        <div class="acts">
          ${file ? `<button class="btn sm" data-act="srvDl" data-id="${h.file_id}">دانلود فایل</button>` : ""}
          <button class="btn sm" data-act="srvRebuild" data-idx="${i}">ساخت مجدد</button>
        </div></div>`;
    }).join("");
  }
  async function downloadStoredConfig(id) {
    try {
      const r = await fetch("/api/configs/file/" + encodeURIComponent(id), { credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) { toast("برای دانلود دوباره وارد شو"); return; }
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast(e.message || "فایل پیدا نشد"); return; }
      const text = await r.text();
      const m = (r.headers.get("Content-Disposition") || "").match(/filename="([^"]+)"/);
      forceDownload(text, m ? m[1] : "IMRC.conf");
    } catch (e) { toast("خطا در دریافت فایل"); }
  }
  function rebuildFromServer(i) {
    const h = S.srvItems[i];
    if (!h) return;
    const code = String(h.region || "").toLowerCase();
    if (!byCode(code)) { toast("این کشور دیگر در فهرست نیست"); return; }
    S.code = code;
    if (MODE_FA[h.mode]) setMode(h.mode);
    if (ROLE_FA[h.role]) setRole(h.role);
    if (h.name) setName(h.name);
    renderServers();
    go("build");
    build();
  }

  /* ============================== CSV / backup ============================== */
  const csvCell = (v) => {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  function exportCsv() {
    const list = hist();
    if (!list.length) { toast("تاریخچه‌ای نیست"); return; }
    const rows = [["Name", "Code", "Date", "Mode", "Role", "MTU", "Ping", "Note", "Tags"].join(",")];
    list.forEach((h) => rows.push([h.name, h.code, dateStr(h.date), h.mode, h.role, h.mtu, h.ping, h.note, h.tags].map(csvCell).join(",")));
    forceDownload("\ufeff" + rows.join("\r\n"), "IMRC_History.csv");
    toast("فایل CSV ساخته شد");
  }
  function backup() {
    const data = {
      v: 2,
      hist: hist(), favs: favs(), theme: store.get("IMRC_theme", null), font: store.get("IMRC_font", 15),
      goal: store.get("IMRC_goal", null),
      notes: store.get("IMRC_notes", ""), checks: store.get("IMRC_chk", {}),
    toolUse: store.get("IMRC_toolUse", {}), toolHist: store.get("IMRC_toolHist", []),
    toolLayout: store.get("IMRC_toolLayout", { hidden: [] }),
    labEnabled: store.get("IMRC_labEnabled", false),
    labGraph: store.get("IMRC_lab_graph", false),
    labExport: store.get("IMRC_lab_export", false),
    labShortcuts: store.get("IMRC_lab_shortcuts", false),
    };
    forceDownload(JSON.stringify(data, null, 2), "IMRC_Backup.json");
    toast("بکاپ دانلود شد");
  }
  function sanitizeHist(list) {
    return list.filter(validHist).slice(0, HIST_MAX).map((h) => ({
      id: String(h.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 40),
      name: String(h.name).slice(0, NAME_MAX), code: h.code, date: typeof h.date === "number" || typeof h.date === "string" ? h.date : Date.now(),
      mode: MODE_FA[h.mode] ? h.mode : "ranked", role: ROLE_FA[h.role] ? h.role : "attacker",
      mtu: MTU_OPTS.includes(String(h.mtu)) ? String(h.mtu) : "", dns: typeof h.dns === "string" ? h.dns.slice(0, 80) : "",
      ping: Number.isFinite(h.ping) ? h.ping : null, config: h.config.slice(0, 8000),
      note: String(h.note || "").slice(0, 500), tags: String(h.tags || "").slice(0, 200),
    }));
  }
  function restore(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let d;
      try { d = JSON.parse(String(reader.result)); } catch (e) { toast("❌ فایل بکاپ معتبر نیست"); return; }
      if (!d || typeof d !== "object" || Array.isArray(d)) { toast("❌ فایل بکاپ معتبر نیست"); return; }
      if (Array.isArray(d.hist)) store.set("IMRC_hist", sanitizeHist(d.hist));
      if (Array.isArray(d.favs)) store.set("IMRC_favs", d.favs.filter((c) => typeof c === "string" && byCode(c)));
      if (THEME_IDS.includes(d.theme)) store.set("IMRC_theme", d.theme);
      if (Number.isFinite(d.font)) store.set("IMRC_font", clamp(Math.round(d.font), 13, 18));
      if (Number.isFinite(d.goal) && d.goal >= 10 && d.goal <= 300) store.set("IMRC_goal", Math.round(d.goal));
      if (typeof d.notes === "string") store.set("IMRC_notes", d.notes.slice(0, 5000));
      if (d.checks && typeof d.checks === "object") store.set("IMRC_chk", Object.fromEntries(Object.entries(d.checks).filter(([k, v]) => /^\d+$/.test(k) && typeof v === "boolean")));
      if (d.toolUse && typeof d.toolUse === "object") store.set("IMRC_toolUse", d.toolUse);
      if (Array.isArray(d.toolHist)) store.set("IMRC_toolHist", d.toolHist.slice(0, TOOL_HIST_MAX));
      if (d.toolLayout && typeof d.toolLayout === "object") store.set("IMRC_toolLayout", d.toolLayout);
      if (typeof d.labEnabled === "boolean") store.set("IMRC_labEnabled", d.labEnabled);
      if (typeof d.labGraph === "boolean") store.set("IMRC_lab_graph", d.labGraph);
      if (typeof d.labExport === "boolean") store.set("IMRC_lab_export", d.labExport);
      if (typeof d.labShortcuts === "boolean") store.set("IMRC_lab_shortcuts", d.labShortcuts);
      toast("✅ بازگردانی انجام شد");
      setTimeout(() => location.reload(), 600);
    };
    reader.readAsText(file);
  }
  function restoreFromPicker() {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "application/json,.json";
    input.onchange = () => { if (input.files && input.files[0]) restore(input.files[0]); };
    input.click();
  }
  function clearAll() {
    if (!confirm("همه‌ی داده‌های این مرورگر (تاریخچه، علاقه‌مندی‌ها، تنظیمات) پاک شود؟")) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("IMRC_")).forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    toast("همه‌ی داده‌ها پاک شد");
    setTimeout(() => location.reload(), 700);
  }

  /* ============================== tools data ============================== */
  const TOOL_HIST_MAX = 60;
  const TOOLS = [
    { id: "ping", title: "تست پینگ زنده", tags: ["شبکه", "پینگ"] },
    { id: "net", title: "اطلاعات اتصال", tags: ["شبکه"] },
    { id: "cfg", title: "بررسی کانفیگ", tags: ["کانفیگ", "ایمن"] },
    { id: "sen", title: "پیشنهاد حساسیت", tags: ["حساسیت"] },
    { id: "react", title: "تست زمان واکنش", tags: ["واکنش"] },
    { id: "check", title: "چک‌لیست قبل از مچ", tags: ["آماده‌سازی"] },
    { id: "notes", title: "یادداشت مچ", tags: ["یادداشت"] },
  ];
  const GUIDES = {
    ping: "۱۲ درخواست به سرویس‌های عمومی (Cloudflare و Google) می‌فرستد و میانگین، جیتر وافت بسته را نشان می‌دهد. این عدد نشان‌دهندهٔ اتصال شما است، نه سرور بازی.",
    net: "نوع اتصال، سرعت تقریبی، تأخیر (RTT), صرفه‌جویی داده، منطقه‌ی زمانی و زبان مرورگر را نمایش می‌دهد.",
    cfg: "ساختاری فایل کانفیگ WireGuard را چک می‌کند: داشتن بخش‌های Interface و Peer، معتبر بودن کلیدها، آدرس و این‌پوینت.",
    sen: "بر اساس نوع دستگاه و سبک بازی (تهاجمی/متعادل/اسنایپر)، حساسیت-role پیشنهادی دوربین را می‌دهد. نقطه‌ی شروع است؛ بعداً ۵٪ ۵٪ تنظیم کنید.",
    react: "زمان واکنش را به میلی‌ثانیه اندازه می‌گیرد. دکمه را بزنید، وقتی جعبه سبز شد سریعاً دوباره بزنید؛ بهترین نتيجه ثبت می‌شود.",
    check: "لیستresources قبل از شروع مچ (شارژ، اپ‌های پس‌زمینه، وای‌فای، پینگ، حساسیت). موارد انجام‌شده را تیک بزنید.",
    notes: "یادداشت متنی برای لودات، حساسیت‌ها و نکته‌های مچ. هر تغییر روی همین مرورگر ذخیره می‌شود.",
  };
  function trackTool(id) {
    const u = store.get("IMRC_toolUse", {});
    const e = u[id] || { count: 0, lastRun: 0 };
    e.count = (e.count || 0) + 1; e.lastRun = Date.now(); u[id] = e;
    store.set("IMRC_toolUse", u);
    const h = store.get("IMRC_toolHist", []);
    h.push({ id, ts: Date.now() });
    while (h.length > TOOL_HIST_MAX) h.shift();
    store.set("IMRC_toolHist", h);
  }
  const TOOL_RUN = {
    ping: () => { trackTool("ping"); pingRun(); },
    net: () => { trackTool("net"); netInfo(); },
    cfg: () => { trackTool("cfg"); cfgRun(); },
    sen: () => { trackTool("sen"); senRun(); },
    react: () => { trackTool("react"); reactClick(); },
    check: () => { trackTool("check"); renderChecklist(); },
    notes: () => { trackTool("notes"); $("notesText").focus(); },
  };

  function markWhatsNewSeen() {
    store.set("IMRC_whatsNewSeen", "2.0");
    const b = $("whatsNewBadge");
    if (b) b.hidden = true;
  }
  if (store.get("IMRC_whatsNewSeen") === "2.0") {
    const b = $("whatsNewBadge");
    if (b) b.hidden = true;
  }

  function renderToolsToolbar() {
    if (!$("toolFilter")) return;
    const q = ($("toolFilter").value || "").toLowerCase();
    const use = store.get("IMRC_toolUse", {});
    const top = Object.entries(use).sort((a, b) => (b[1].count || 0) - (a[1].count || 0)).slice(0, 4).map(([id]) => id);
    const hist = store.get("IMRC_toolHist", []);
    const lastId = hist.length ? hist[hist.length - 1].id : null;
    const suggest = [];
    if (S.last && !suggest.includes("cfg")) suggest.push("cfg");
    if (lastId && !suggest.includes(lastId)) suggest.push(lastId);
    for (const id of top) { if (!suggest.includes(id)) suggest.push(id); if (suggest.length >= 3) break; }
    const chips = (ids, container, label) => {
      const el = $(container); if (!el) return;
      el.innerHTML = '<span class="hint" style="margin-right:.4rem">' + label + '</span>' + ids.map((id) => {
        const t = TOOLS.find((x) => x.id === id); if (!t) return "";
        return '<button class="chip tool-chip" data-act="runTool" data-tool="' + id + '" title="' + esc(t.title) + '">' + esc(t.title) + '</button>';
      }).join("");
    };
    chips(suggest, "toolSuggest", "پیشنهادی:");
    chips(top, "toolUsed", "پرکاربرد:");
    const layout = store.get("IMRC_toolLayout", { hidden: [] });
    const hidden = Array.isArray(layout.hidden) ? layout.hidden : [];
    $$(".tool-card").forEach((card) => {
      const id = card.id.replace("tool-", "");
      const t = TOOLS.find((x) => x.id === id);
      const match = !q || (t && (t.title.includes(q) || t.tags.some((tag) => tag.includes(q))));
      card.hidden = !match || hidden.includes(id);
    });
    if ($("toolCustomize")) renderToolsCustomize();
  }

  /* ============================== tools ============================== */
  function renderToolsCustomize() {
    const box = $("toolCustomize");
    if (!box) return;
    const layout = store.get("IMRC_toolLayout", { hidden: [] });
    const hidden = Array.isArray(layout.hidden) ? layout.hidden : [];
    box.innerHTML = TOOLS.map((t) => {
      const h = hidden.includes(t.id);
      return '<label class="check"><input type="checkbox" data-act="toolHide" data-tool="' + t.id + '" ' + (!h ? "checked" : "") + '/> ' + esc(t.title) + '</label>';
    }).join("");
  }
  function toggleToolHide(id, checked) {
    const layout = store.get("IMRC_toolLayout", { hidden: [] });
    const hidden = Array.isArray(layout.hidden) ? layout.hidden : [];
    if (checked) { const i = hidden.indexOf(id); if (i >= 0) hidden.splice(i, 1); }
    else { if (!hidden.includes(id)) hidden.push(id); }
    layout.hidden = hidden;
    store.set("IMRC_toolLayout", layout);
    renderToolsToolbar();
    renderToolsCustomize();
    toast(hidden.length ? "ابزار پنهان شد" : "ابزار نمایش داده شد");
  }

  function renderBars(vals) {
    const mx = Math.max(60, ...vals);
    $("pingBars").innerHTML = vals.map((v) => `<i style="height:${Math.max(4, Math.round((v / mx) * 100))}%" title="${v} ms"></i>`).join("");
  }
  async function pingRun() {
    trackTool("ping");
    if (S.pinging) return;
    S.pinging = true;
    $("pingRun").disabled = true;
    const urls = ["https://www.cloudflare.com/cdn-cgi/trace", "https://www.google.com/generate_204", "https://one.one.one.one/cdn-cgi/trace"];
    const N = 12, vals = [];
    let lost = 0;
    $("pingBars").innerHTML = "";
    $("pingVerdict").hidden = true;
    for (let i = 0; i < N; i++) {
      const t = performance.now();
      try {
        const c = new AbortController();
        const to = setTimeout(() => c.abort(), 2500);
        await fetch(urls[i % urls.length] + "?n=" + Math.random(), { mode: "no-cors", cache: "no-store", signal: c.signal });
        clearTimeout(to);
        vals.push(Math.round(performance.now() - t));
      } catch (e) { lost++; }
      renderBars(vals);
      $("pingState").textContent = fa(i + 1) + " از " + fa(N);
    }
    const avg = vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
    let jit = null;
    if (vals.length > 1) {
      let s = 0;
      for (let i = 1; i < vals.length; i++) s += Math.abs(vals[i] - vals[i - 1]);
      jit = Math.round(s / (vals.length - 1));
    }
    const loss = Math.round((lost / N) * 100);
    $("pingAvg").textContent = avg == null ? "–" : fa(avg);
    $("pingJit").textContent = jit == null ? "–" : fa(jit);
    $("pingLoss").textContent = fa(loss);
    const v = $("pingVerdict");
    if (avg == null) { v.className = "verdict bad"; v.textContent = "اتصال برقرار نشد؛ اینترنت یا تونل را بررسی کن."; }
    else if (avg < 60 && loss < 2) { v.className = "verdict ok"; v.textContent = "اتصال عالی است."; }
    else if (avg < 100 && loss < 5) { v.className = "verdict warn"; v.textContent = "اتصال قابل قبول است."; }
    else { v.className = "verdict bad"; v.textContent = "پینگ یا افت بالاست؛ از وای‌فای استفاده کن یا کشور دیگری را امتحان کن."; }
    v.hidden = false;
    $("pingState").textContent = "تمام شد";
    $("pingRun").disabled = false;
    S.pinging = false;
  }
  function netInfo() {
    trackTool("net");
    const c = navigator.connection || {};
    let tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
    $("netInfo").textContent = [
      "وضعیت: " + (navigator.onLine ? "آنلاین" : "آفلاین"),
      "نوع اتصال: " + (c.effectiveType || "نامشخص"),
      "سرعت تقریبی: " + (c.downlink ? c.downlink + " Mbps" : "نامشخص"),
      "تأخیر تقریبی (RTT): " + (c.rtt != null ? c.rtt + " ms" : "نامشخص"),
      "صرفه‌جویی داده: " + (c.saveData ? "روشن" : "خاموش"),
      "منطقه‌ی زمانی: " + (tz || "نامشخص"),
      "زبان: " + (navigator.language || "نامشخص"),
    ].join("\n");
  }
  function checkConfig(text) {
    const sec = {};
    let cur = "";
    String(text || "").split(/\r?\n/).forEach((line) => {
      const t = line.trim();
      if (!t || t.startsWith("#")) return;
      const h = t.match(/^\[(\w+)\]$/);
      if (h) { cur = h[1].toLowerCase(); sec[cur] = sec[cur] || {}; return; }
      const kv = t.match(/^([A-Za-z]+)\s*=\s*(.+)$/);
      if (kv && cur) sec[cur][kv[1].toLowerCase()] = kv[2].trim();
    });
    const I = sec.interface || {}, P = sec.peer || {};
    const keyOk = (v) => /^[A-Za-z0-9+/]{43}=$/.test(v || "");
    const epOk = (v) => { const m = (v || "").match(/^(\[[^\]]+\]|[^\s:]+):(\d{1,5})$/); return !!m && +m[2] >= 1 && +m[2] <= 65535; };
    const out = [
      { ok: !!sec.interface, lvl: "req", t: "بخش [Interface] وجود دارد" },
      { ok: !!sec.peer, lvl: "req", t: "بخش [Peer] وجود دارد" },
      { ok: keyOk(I.privatekey), lvl: "req", t: "PrivateKey معتبر است (۴۴ کاراکتر base64)" },
      { ok: !!I.address, lvl: "req", t: "Address تعریف شده است" },
      { ok: keyOk(P.publickey), lvl: "req", t: "PublicKey سرور معتبر است" },
      { ok: epOk(P.endpoint), lvl: "req", t: "Endpoint به شکل آدرس:پورت است" },
    ];
    if (I.dns !== undefined) out.push({ ok: /^[0-9a-fA-F:.,\/ ]+$/.test(I.dns), lvl: "warn", t: "DNS معتبر است" });
    if (I.mtu !== undefined) { const m = +I.mtu; out.push({ ok: m >= 576 && m <= 1500, lvl: "warn", t: "MTU بین ۵۷۶ تا ۱۵۰۰ است" }); }
    return out;
  }
  function cfgRun() {
    trackTool("cfg");
    const res = checkConfig($("cfgIn").value);
    const bad = res.filter((r) => r.lvl === "req" && !r.ok).length;
    const warn = res.filter((r) => r.lvl === "warn" && !r.ok).length;
    const head = bad
      ? "❌ کانفیگ ناقص است: " + fa(bad) + " مورد اشکال دارد"
      : "✅ کانفیگ معتبر است" + (warn ? " • ⚠️ " + fa(warn) + " هشدار" : "");
    $("cfgOut").innerHTML = '<li class="' + (bad ? "bad" : "ok") + '"><b>' + esc(head) + "</b></li>" +
      res.map((r) => {
        const cls = r.ok ? "ok" : (r.lvl === "req" ? "bad" : "warn");
        const ic = r.ok ? "✅" : (r.lvl === "req" ? "❌" : "⚠️");
        return '<li class="' + cls + '">' + ic + " " + esc(r.t) + "</li>";
      }).join("");
  }
  function cfgFromLast() {
    if (!S.last) { toast("کانفیگی در همین مرورگر نیست؛ اول یک کانفیگ بساز"); return; }
    $("cfgIn").value = S.last.config;
    cfgRun();
  }
  function senRun() {
    trackTool("sen");
    const d = +$("senDev").value, s = $("senStyle").value;
    const base = { a: [120, 95, 80], b: [100, 80, 65], c: [75, 60, 48] }[s];
    const f = [1.15, 1, 0.85][d - 1];
    const r = (n) => Math.round(Math.min(200, n * f));
    const out = document.getElementById("senOut");
    out.textContent = [
      "دوربین (عادی): " + r(base[0]) + "%",
      "دوربین (ردداد): " + r(base[1]) + "%",
      "دوربین (اسکوپ): " + r(base[2]) + "%",
      "ژیروسکوپ: " + (s === "c" ? "روشن، ۷۰٪" : "فقط اسکوپ، ۱۰۰٪"),
      "اندازه دکمه شلیک: " + (d === 1 ? "بزرگ" : "متوسط"),
      "(نقطه شروع است؛ ۵٪ ۵٪ تنظیم کنید.)",
    ].join("\n");
    out.hidden = false;
  }
  function reactClick() {
    trackTool("react");
    const b = $("reactBox");
    if (S.reactState === 0) {
      S.reactState = 1;
      b.textContent = "صبر کن…";
      b.style.background = "";
      S.reactTo = setTimeout(() => {
        S.reactState = 2; S.reactT = performance.now();
        b.textContent = "الان بزن!";
        b.style.background = "var(--ok)";
      }, 1000 + Math.random() * 3000);
    } else if (S.reactState === 1) {
      clearTimeout(S.reactTo); S.reactState = 0;
      b.textContent = "زود زدی! دوباره بزن";
    } else {
      const ms = Math.round(performance.now() - S.reactT);
      S.reactState = 0;
      const best = Math.min(ms, store.get("IMRC_react", 9999));
      store.set("IMRC_react", best);
      b.textContent = "دوباره بزن";
      b.style.background = "";
      $("reactOut").textContent = fa(ms) + " ms • بهترین: " + fa(best) + " ms";
    }
  }
  function renderChecklist() {
    const st = store.get("IMRC_chk", {});
    $("checkList").innerHTML = CHECKS.map((t, i) =>
      `<label class="check"><input type="checkbox" data-check="${i}" ${st[i] ? "checked" : ""}/> ${esc(t)}</label>`
    ).join("");
  }

  /* ============================== build wizard ============================== */
  const wiz = { step: 1 };
  function wizMarkMtu() {
    const cur = $("#useMtu").checked ? $("#mtuSel").value : "";
    $$("#wizStep2 [data-act='wizMtu']").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mtu === cur)));
  }
  function wizSummary() {
    const c = byCode(S.code) || { name: "—", flag: "" };
    const mtu = $("#useMtu").checked ? $("#mtuSel").value : "خودکار";
    const dns = $("#useDns").checked ? "سفارشی" : "پیش‌فرض";
    const html = `<span>سرور:</span><b>${esc((c.flag ? c.flag + " " : "") + c.name)}</b>` +
      `<span>حالت:</span><b>${esc(MODE_FA[S.mode] || "—")}</b>` +
      `<span>نقش:</span><b>${esc(ROLE_SHORT[S.role] || "—")}</b>` +
      `<span>MTU:</span><b>${esc(mtu)}</b><span>DNS:</span><b>${esc(dns)}</b>`;
    const a = $("wizSummary1"), b = $("wizSummary2");
    if (a) a.innerHTML = html;
    if (b) b.innerHTML = html;
  }
  function wizRender() {
    const q = ($("wizSearch").value || "").trim().toLowerCase();
    const list = COUNTRIES.filter((c) => !q || c.name.includes(q) || c.code.includes(q)).sort((a, b) => a.ping - b.ping);
    $("wizSrv").innerHTML = list.map((c) => {
      const locked = isLocked(c);
      return `<button class="srv" type="button" role="option" data-wiz="${c.code}" aria-selected="${S.code === c.code}" ${locked ? 'aria-disabled="true"' : ""}>
        <span class="flag" aria-hidden="true">${c.flag}</span>
        <span class="nm">${esc(c.name)}${locked ? ' <span class="lock">🔒 اشتراک</span>' : ""}</span>
        <span class="ms">${fa(c.ping)} ms</span></button>`;
    }).join("") || '<div class="empty">کشوری با این جستجو پیدا نشد.</div>';
    const picks = COUNTRIES.filter((c) => !isLocked(c)).sort((a, b) => a.ping - b.ping).slice(0, 3);
    $("wizRec").innerHTML = picks.map((c) => `<button class="chip" type="button" data-wiz="${c.code}">${c.flag} ${esc(c.name)} · ${fa(c.ping)}ms</button>`).join("");
    wizMarkMtu();
    wizSummary();
  }
  function wizPick(code) {
    const c = byCode(code);
    if (!c) return;
    if (isLocked(c)) { toast("🔒 این سرور مخصوص کاربران اشتراکی است"); return; }
    selectServer(code);
    wizRender();
    playSound("ok");
  }
  function wizGo(n) {
    wiz.step = clamp(n, 1, 3);
    [1, 2, 3].forEach((i) => { $("wizStep" + i).hidden = i !== wiz.step; });
    $("wizBar").style.width = Math.round((wiz.step / 3) * 100) + "%";
    $("wizBack").hidden = wiz.step === 1;
    $("wizNext").textContent = wiz.step === 3 ? "ساخت و دانلود فایل" : "مرحله بعد";
    $("wizTitle").textContent = "مرحله " + fa(wiz.step) + " از ۳ — " + ["انتخاب سرور", "تنظیمات", "تأیید و ساخت"][wiz.step - 1];
    if (wiz.step === 2) { wizMarkMtu(); wizSummary(); }
    if (wiz.step === 3) wizSummary();
  }
  function openWizard() {
    if (!S.code) {
      const best = COUNTRIES.filter((c) => !isLocked(c)).sort((a, b) => a.ping - b.ping)[0];
      if (best) selectServer(best.code);
    }
    $("wizSearch").value = "";
    wizRender();
    $("wizDlg").classList.add("on");
    $("wizDlg").setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    wizGo(1);
    setTimeout(() => $("wizSearch").focus(), 60);
    track("action", { name: "wizardOpen", detail: "" });
  }
  function closeWizard() {
    $("wizDlg").classList.remove("on");
    $("wizDlg").setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
  function wizNextAction() {
    if (wiz.step < 3) return wizGo(wiz.step + 1);
    closeWizard();
    build();
  }

  /* ============================== service incidents ============================== */
  const STATUS_FA = { ok: "سرویس آماده است", degraded: "سرویس کمی کند است", down: "سرویس قطع است" };
  function pushReady() { return ("Notification" in window) && ("PushManager" in window) && ("serviceWorker" in navigator); }
  function renderIncident(d) {
    const box = $("incidentBanner");
    if (!box) return;
    const inc = d && d.incident;
    const notice = d && d.notice;
    const overall = d && d.overall;
    let level = "ok", key = "", title = "", body = "";
    if (inc) {
      level = inc.level === "down" ? "down" : "degraded";
      key = "inc:" + inc.id;
      title = inc.title;
      body = inc.body || "";
      if (inc.started) body = (body ? body + " • " : "") + "شروع: " + dateStr(inc.started);
    } else if (notice && (notice.level !== "ok" || notice.text)) {
      level = notice.level === "down" ? "down" : "degraded";
      key = "notice:" + String(notice.text || "").slice(0, 60);
      title = "اطلاعیه سرویس";
      body = notice.text || "";
    } else if (overall && overall !== "ok") {
      level = overall === "down" ? "down" : "degraded";
      key = "overall:" + overall;
      title = STATUS_FA[overall] || "وضعیت سرویس";
      body = "اگر وصل نمی‌شوی چند دقیقه صبر کن و دوباره امتحان کن.";
    }
    if (!level || level === "ok" || !key || store.get("IMRC_inc_hidden", "") === key) { box.hidden = true; return; }
    S.incKey = key;
    box.hidden = false;
    box.dataset.level = level;
    $("incidentTitle").textContent = (level === "down" ? "🔴 " : "🟠 ") + (title || "وضعیت سرویس");
    $("incidentBody").textContent = body;
    if ($("incidentPush")) $("incidentPush").hidden = !pushReady();
  }
  function incidentHide() {
    if (S.incKey) store.set("IMRC_inc_hidden", S.incKey);
    $("incidentBanner").hidden = true;
  }

  /* ============================== chat (support) ============================== */
  function renderChat(msgs) {
    const log = $("chatLog");
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 60;
    const sig = msgs.map((m) => m.id + ":" + m.from).join(",");
    if (sig === S.chatIds) return;
    S.chatIds = sig;
    log.innerHTML = "";
    if (!msgs.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.innerHTML = "<b>هنوز پیامی نداری</b>سوالت را بنویس؛ تیم پشتیبانی جواب می‌دهد.";
      log.appendChild(e);
      return;
    }
    msgs.forEach((m) => {
      const b = document.createElement("div");
      b.className = "bubble " + (m.from === "admin" ? "admin" : "user");
      b.textContent = m.text;
      const t = document.createElement("time");
      t.textContent = (m.from === "admin" ? "پشتیبانی • " : "") + dateStr(m.ts);
      b.appendChild(t);
      log.appendChild(b);
    });
    if (atBottom || msgs.length <= 3) log.scrollTop = log.scrollHeight;
  }
  function setChatBadge(n) {
    $$("[data-chat-badge]").forEach((b) => { b.textContent = fa(n); b.hidden = !n; });
  }
  async function loadChat(markRead) {
    try {
      const r = await fetch("/api/chat" + (markRead ? "?read=1" : ""), { credentials: "same-origin", cache: "no-store" });
      if (r.status === 401) { location.href = "/login.html"; return; }
      if (!r.ok) throw new Error();
      const d = await r.json();
      renderChat(d.messages || []);
      setChatBadge(markRead ? 0 : (d.unread || 0));
    } catch (e) {
      $("chatHint").textContent = "خطا در دریافت پیام‌ها؛ دوباره تلاش می‌شود";
    }
  }
  function chatCount() {
    const n = $("chatIn").value.length;
    $("chatCount").textContent = fa(n) + " / ۱۰۰۰";
  }
  async function chatSend() {
    const ta = $("chatIn");
    const text = ta.value.trim();
    if (!text || S.chatBusy) return;
    S.chatBusy = true;
    $("chatSend").disabled = true;
    $("chatHint").textContent = "در حال ارسال…";
    try {
      const r = await fetch("/api/chat", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.status === 401) { location.href = "/login.html"; return; }
      if (!r.ok) { $("chatHint").textContent = d.message || d.error || "ارسال نشد"; return; }
      ta.value = "";
      chatCount();
      $("chatHint").textContent = "ارسال شد ✓";
      S.chatIds = "";
      await loadChat(true);
    } catch (e) {
      $("chatHint").textContent = "اتصال برقرار نشد؛ دوباره امتحان کن";
    } finally {
      S.chatBusy = false;
      $("chatSend").disabled = false;
      ta.focus();
    }
  }
  function scheduleChat() {
    clearTimeout(S.chatTimer);
    const onSupport = $("page-support").classList.contains("active");
    S.chatTimer = setTimeout(() => {
      if (onSupport) loadChat(true); else loadChat(false);
      scheduleChat();
    }, onSupport ? 6000 : 45000);
  }

  /* ============================== status & start card ============================== */
  async function pollStatus() {
    const pills = [$("statusPill"), $("bxStatus"), $("homeStatus")];
    const map = { ok: ["سرویس: آماده", "ok"], degraded: ["سرویس: کمی کند", "warn"], down: ["سرویس: قطع است", "bad"] };
    try {
      const r = await fetch("/api/status", { cache: "no-store" });
      const d = await r.json();
      const [t, c] = map[d.overall] || ["سرویس: نامشخص", "warn"];
      pills.forEach((p, i) => { if (!p) return; p.textContent = i === 2 ? t.replace("سرویس: ", "") : t; p.className = "pill " + c; });
      renderIncident(d);
    } catch (e) {
      pills.forEach((p, i) => { if (!p) return; p.textContent = i === 2 ? "نامشخص" : "سرویس: نامشخص"; p.className = "pill warn"; });
      renderIncident(null);
    }
  }
  function renderStart() {
    const s1 = !!S.code;
    const s2 = !!S.last || hist().length > 0;
    const s3 = !!store.get("IMRC_bx_done3", false);
    [["bxS1", s1], ["bxS2", s2], ["bxS3", s3]].forEach(([id, ok]) => $(id).classList.toggle("ok", ok));
    const n = [s1, s2, s3].filter(Boolean).length;
    let msg = "انجام شده: " + fa(n) + " از ۳";
    if (n === 3) msg = "🎉 همه‌ی قدم‌ها انجام شد. اگر وصل شدی، عالیه!";
    else if (s2 && !s3) msg = "فایل آماده است. حالا مرحله‌ی ۳ را انجام بده.";
    $("bxProg").textContent = msg;
    $("bxDone3").checked = s3;
  }
  function showStart() {
    store.set("IMRC_bx_hide", false);
    applyPrefs();
    go("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function hideStart() {
    store.set("IMRC_bx_hide", true);
    applyPrefs();
    toast("راهنمای شروع پنهان شد؛ از «خانه» دوباره نشانش بده.", 3200);
  }
  function goRegion() {
    go("build");
    $("srvList").scrollIntoView({ behavior: "smooth", block: "center" });
    toast("یک کشور از فهرست انتخاب کن");
  }
  function beginnerBuild() {
    if (!S.code) { goRegion(); return; }
    build();
  }
  function suggestDialog() {
    dlgOpen("پیشنهاد کشور",
      '<label class="label" for="sugPrio">اولویت تو چیست؟</label>' +
      '<select id="sugPrio" class="input" data-act-change="suggest" style="margin:.4rem 0 .8rem">' +
      '<option value="fast">کمترین پینگ</option><option value="codm">مناسب بازی رقابتی</option><option value="balanced">متعادل (پینگ زیر ۶۰)</option></select>' +
      '<div id="sugOut" class="list"></div>');
    suggestRun();
  }
  function suggestRun() {
    const sel = $("sugPrio");
    if (!sel) return;
    const p = sel.value;
    let list = COUNTRIES.slice();
    if (p === "codm") list = list.filter((c) => c.codm);
    if (p === "balanced") { const b = list.filter((c) => c.codm && c.ping <= 60); list = b.length ? b : list; }
    list.sort((a, b) => a.ping - b.ping);
    $("sugOut").innerHTML = list.slice(0, 3).map((c, i) =>
      `<div class="item"><div><b>${i + 1}. ${esc(c.flag + " " + c.name)}</b><div class="meta">پینگ پایه ${fa(c.ping)} ms${c.codm ? " • مناسب بازی رقابتی" : ""}</div></div>
       <button class="btn sm" data-act="pick" data-code="${c.code}">انتخاب</button></div>`).join("") || '<p class="hint">موردی نیست.</p>';
  }
  function pick(code) {
    selectServer(code);
    toast("کشور انتخاب شد: " + ((byCode(code) || {}).name || code));
    if (dlgIsOpen()) dlgClose();
  }
  function dlgIsOpen() { return $("dlg").classList.contains("on"); }
  function postDownloadChecklist() {
    dlgOpen("فایل ساخته شد ✅ حالا این ۴ کار را بکن",
      '<ol class="stack" style="padding-inline-start:1.2rem">' +
      "<li>فایل <b>.conf</b> را در پوشه‌ی Downloads یا فایل‌های گوشی پیدا کن.</li>" +
      "<li>اپ رسمی <b>WireGuard</b> را باز کن؛ اگر نداری، از لینک‌های زیر نصبش کن.</li>" +
      "<li>گزینه‌ی <b>Import</b> یا <b>Add a tunnel</b> را بزن و همان فایل را انتخاب کن.</li>" +
      "<li>کلید کنار تونل را روشن کن. اگر وصل شدی، کادر «وصل شدم» را در «شروع اینجا» تیک بزن.</li></ol>" +
      '<div class="row" style="margin-top:.8rem">' +
      '<a class="btn" href="https://play.google.com/store/apps/details?id=com.wireguard.android" target="_blank" rel="noopener">Google Play</a>' +
      '<a class="btn" href="https://www.wireguard.com/install/" target="_blank" rel="noopener">wireguard.com</a>' +
      '<button class="btn" data-act="copySafe">کپی برای پشتیبانی (بی‌کلید)</button></div>' +
      '<p class="hint" style="margin-top:.8rem">این فایل تا ۳۰ روز در حساب تو می‌ماند؛ بعد از آن از «آمار و سوابق» قابل دانلود نیست.</p>');
  }

  /* ============================== help ============================== */
  function renderFaq() {
    const q = $("faqSearch").value.trim().toLowerCase();
    const list = FAQ.filter(([a, b]) => !q || (a + " " + b).toLowerCase().includes(q));
    $("faqList").innerHTML = list.map(([a, b]) => `<details><summary>${esc(a)}</summary><p>${esc(b)}</p></details>`).join("");
    $("faqEmpty").hidden = list.length > 0;
  }
  function renderTrouble() {
    $("troubleBtns").innerHTML = TROUBLE.map((t, i) => `<button class="btn" data-act="trouble" data-i="${i}">${esc(t[0])}</button>`).join("");
  }
  function showTrouble(i) {
    const t = TROUBLE[i];
    if (!t) return;
    $("troubleOut").innerHTML = t[1].map((s) => "<li>" + esc(s) + "</li>").join("");
  }
  function renderGloss() {
    $("glossary").innerHTML = GLOSS.map(([t, d]) => "<dt>" + esc(t) + "</dt><dd>" + esc(d) + "</dd>").join("");
  }
  function fillCompare() {
    const opts = COUNTRIES.map((c) => `<option value="${esc(c.code)}">${esc(c.flag + " " + c.name)}</option>`).join("");
    $("cmpA").innerHTML = opts;
    $("cmpB").innerHTML = opts;
    $("cmpB").selectedIndex = 1;
    cmpRun();
  }
  function cmpRun() {
    const a = byCode($("cmpA").value), b = byCode($("cmpB").value);
    if (!a || !b) return;
    const row = (label, x, y) => "<tr><td>" + label + "</td><td>" + x + "</td><td>" + y + "</td></tr>";
    const win = a.ping === b.ping ? "پینگ هر دو برابر است" : (a.ping < b.ping ? a.name : b.name) + " کم‌پینگ‌تر است";
    $("cmpOut").innerHTML = '<table class="check-list" style="width:100%;border-collapse:collapse"><tr><th></th><th>' + esc(a.name) + "</th><th>" + esc(b.name) + "</th></tr>" +
      row("پینگ پایه", fa(a.ping) + " ms", fa(b.ping) + " ms") +
      row("مناسب بازی رقابتی", a.codm ? "بله" : "خیر", b.codm ? "بله" : "خیر") +
      row("بازی‌ها", esc(a.games.join("، ")), esc(b.games.join("، "))) +
      '</table><p class="hint" style="margin-top:.6rem"><b>' + esc(win) + "</b>. پینگ‌ها تخمینی‌اند؛ برای سنجش واقعی از تست پینگ استفاده کن.</p>";
  }

  /* ============================== share ============================== */
  const b64u = (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64u = (s) => {
    const p = s.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(p + "=".repeat((4 - (p.length % 4)) % 4));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  };
  function shareLink() {
    const data = { r: S.code, m: S.mode, o: S.role, d: $("dnsSel").value, t: currentMtu(), n: $("cfgName").value.trim().slice(0, 15) };
    copyText(location.origin + location.pathname + "#s=" + b64u(JSON.stringify(data)), "🔗 لینک تنظیمات کپی شد (بدون کلید خصوصی)");
  }
  function applyShared() {
    const m = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/);
    if (!m) return;
    let d;
    try { d = JSON.parse(unb64u(m[1])); } catch (e) { toast("لینک تنظیمات معتبر نیست"); return; }
    if (d.r && byCode(d.r)) S.code = d.r;
    if (MODE_FA[d.m]) setMode(d.m);
    if (ROLE_FA[d.o]) setRole(d.o);
    if (MTU_OPTS.includes(String(d.t))) setMtu(String(d.t));
    if (d.d && Array.from($("dnsSel").options).some((o) => o.value === d.d)) $("dnsSel").value = d.d;
    if (d.n) setName(String(d.n));
    history.replaceState(null, "", location.pathname + "#/build");
    go("build", { silent: true });
    renderServers();
    toast("تنظیمات از لینک اعمال شد");
  }
  function shareMessage() {
    return S.last ? redact(S.last.config).slice(0, 800) : "";
  }

  /* ============================== push / install ============================== */
  let deferredInstall = null;
  function b64uToBytes(s) {
    const p = "=".repeat((4 - s.length % 4) % 4);
    const b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(b, (c) => c.charCodeAt(0));
  }
  async function enablePush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { toast("این مرورگر اعلان را پشتیبانی نمی‌کند"); return; }
      const k = await fetch("/api/push/key", { cache: "no-store" });
      if (!k.ok) { toast("اعلان فعلاً فعال نیست"); return; }
      const { key } = await k.json();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { toast("اجازه‌ی اعلان داده نشد"); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
      const j = sub.toJSON();
      const r = await fetch("/api/push/subscribe", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: j.endpoint, keys: j.keys }) });
      if (!r.ok) { toast("ثبت نشد؛ دوباره وارد شو"); return; }
      toast("✅ اعلان‌ها فعال شد");
    } catch (e) { toast("❌ فعال‌سازی اعلان انجام نشد"); }
  }
  async function initPush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
      const k = await fetch("/api/push/key", { cache: "no-store" });
      if (!k.ok) return;
      const me = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" });
      if (!me.ok) return;
      $("btnPush").hidden = false;
    } catch (e) {}
  }
  function installApp() {
    if (deferredInstall) { deferredInstall.prompt(); deferredInstall.userChoice.finally(() => { deferredInstall = null; $("btnInstall").hidden = true; }); }
    else toast("آیفون: دکمه‌ی Share ← Add to Home Screen. اندروید: منوی ⋮ ← نصب برنامه", 4200);
  }
  async function logoutAll() {
    if (!confirm("از همه‌ی دستگاه‌ها خارج می‌شوی؟")) return;
    try {
      const r = await fetch("/api/logout-all", { method: "POST", credentials: "same-origin" });
      if (!r.ok) throw new Error();
      location.href = "/login.html";
    } catch (e) { toast("❌ خروج انجام نشد، دوباره امتحان کن"); }
  }

  /* ============================== commands ============================== */
  const COMMANDS = [
    { label: "⚡ ساخت و دانلود کانفیگ", run: () => build() },
    { label: "🏠 خانه", run: () => go("home") },
    { label: "⚡ ساخت کانفیگ", run: () => go("build") },
    { label: "🧰 ابزارهای کمکی", run: () => go("tools") },
    { label: "📊 آمار و سوابق", run: () => go("stats") },
    { label: "💬 پشتیبانی آنلاین", run: () => go("support") },
    { label: "📘 راهنما", run: () => go("help") },
    { label: "⚙️ تنظیمات", run: () => go("settings") },
    { label: "پریست رنکد حرفه‌ای", run: () => applyPreset("ranked") },
    { label: "پریست کم‌پینگ", run: () => applyPreset("lowping") },
    { label: "پریست بتل‌رویال", run: () => applyPreset("br") },
    { label: "📋 کپی کل کانفیگ", run: () => copyLast("config") },
    { label: "📈 تست پینگ زنده", run: () => { go("tools"); pingRun(); } },
    { label: "🔍 بررسی کانفیگ", run: () => { go("tools"); cfgRun(); } },
    { label: "🎯 پیشنهاد حساسیت", run: () => { go("tools"); senRun(); } },
    { label: "⚡ زمان واکنش", run: () => { go("tools"); reactClick(); } },
    { label: "✨ قابلیت‌های جدید", run: () => go("whatsnew") },
    { label: "📘 شروع اینجا", run: () => showStart() },
    { label: "🌓 تغییر تم", run: () => cycleTheme() },
  ];

  function copyLast(what) {
    if (!S.last) { toast("اول یک کانفیگ بساز"); return; }
    if (what === "config") copyText(S.last.config, "✅ کل کانفیگ کپی شد");
    else if (what === "key") { const k = keyOf(S.last.config, /PrivateKey\s*=\s*(.+)/); k ? copyText(k, "✅ PrivateKey کپی شد") : toast("کلید پیدا نشد"); }
    else if (what === "ep") { const k = keyOf(S.last.config, /Endpoint\s*=\s*(.+)/); k ? copyText(k, "✅ Endpoint کپی شد") : toast("Endpoint پیدا نشد"); }
    else if (what === "safe") copyText(redact(S.last.config), "✅ کپی شد (بدون کلید خصوصی)");
  }

  function summaryText() {
    const c = byCode(S.code);
    return [
      "📋 خلاصه‌ی تنظیمات IMRC",
      "کشور: " + (c ? c.name : "انتخاب نشده"),
      "حالت: " + (MODE_FA[S.mode] || S.mode),
      "نقش: " + (ROLE_FA[S.role] || S.role),
      "DNS: " + ($("useDns").checked ? dnsName($("dnsSel").value) : "پیش‌فرض"),
      "MTU: " + ($("useMtu").checked ? currentMtu() : "پیش‌فرض"),
      "نام: " + ($("cfgName").value.trim() || "خودکار"),
    ].join("\n");
  }

  /* ============================== actions (data-act) ============================== */
  const ACTIONS = {
    build: () => build(),
    beginnerBuild: () => beginnerBuild(),
    pick: (el) => pick(el.dataset.code),
    preset: (el) => applyPreset(el.dataset.preset),
    role: (el) => setRole(el.dataset.role),
    mtu: (el) => { setMtu(el.dataset.mtu); toast("MTU روی " + fa(el.dataset.mtu) + " تنظیم شد"); },
    autoName: () => { setName(autoName()); updateSummary(); playSound("click"); },
    favOnly: (el) => { S.favOnly = !S.favOnly; el.setAttribute("aria-pressed", String(S.favOnly)); renderServers(); },
    copyAll: () => copyLast("config"),
    copyKey: () => copyLast("key"),
    copyEp: () => copyLast("ep"),
    copySafe: () => copyLast("safe"),
    copyText: (el) => copyText(el.dataset.text),
    shareTg: () => { if (!S.last) return toast("اول یک کانفیگ بساز"); window.open("https://t.me/share/url?url=" + encodeURIComponent("https://t.me/") + "&text=" + encodeURIComponent("IMRC config (بدون کلید خصوصی)\n" + shareMessage()), "_blank", "noopener"); },
    shareWa: () => { if (!S.last) return toast("اول یک کانفیگ بساز"); window.open("https://wa.me/?text=" + encodeURIComponent("IMRC config (بدون کلید خصوصی):\n" + shareMessage()), "_blank", "noopener"); },
    dlAgain: () => { if (!S.last) return toast("اول یک کانفیگ بساز"); forceDownload(S.last.config, S.last.name + "_" + S.last.code + ".conf"); },
    shareLink: () => shareLink(),
    summary: () => copyText(summaryText(), "✅ خلاصه کپی شد"),
    checklist: () => postDownloadChecklist(),
    noteSave: () => {
      if (!S.last) return;
      const ok = updateHistItem(S.last.id, { note: $("noteText").value.slice(0, 500), tags: $("noteTags").value.slice(0, 200) });
      S.last.note = $("noteText").value; S.last.tags = $("noteTags").value;
      toast(ok ? "یادداشت ذخیره شد" : "این کانفیگ در تاریخچه نیست");
      renderHistory();
    },
    histOpen: (el) => openHistory(el.dataset.id),
    histDl: (el) => { const h = hist().find((x) => x.id === el.dataset.id); if (h) forceDownload(h.config, h.name + "_" + h.code + ".conf"); },
    srvDl: (el) => downloadStoredConfig(el.dataset.id),
    srvRebuild: (el) => rebuildFromServer(+el.dataset.idx),
    srvRefresh: () => loadServerHistory(),
    goalSave: () => {
      const g = +$("goalInput").value;
      if (!(g >= 10 && g <= 300)) { toast("هدف باید بین ۱۰ تا ۳۰۰ میلی‌ثانیه باشد"); return; }
      store.set("IMRC_goal", Math.round(g));
      renderStats();
      toast("هدف ثبت شد");
    },
    csv: () => exportCsv(),
    goRegion: () => goRegion(),
    suggest: () => suggestDialog(),
    hideStart: () => hideStart(),
    showStart: () => showStart(),
    // wizard
    wizOpen: () => openWizard(),
    wizClose: () => closeWizard(),
    wizBack: () => wizGo(wiz.step - 1),
    wizNext: () => wizNextAction(),
    wizMode: (el) => { setMode(el.dataset.mode); wizSummary(); },
    wizRole: (el) => { setRole(el.dataset.role); wizSummary(); },
    wizMtu: (el) => { setMtu(el.dataset.mtu); wizMarkMtu(); wizSummary(); },
    incidentHide: () => incidentHide(),
    // tools
    pingRun: () => pingRun(),
    netRefresh: () => netInfo(),
    cfgRun: () => cfgRun(),
    cfgFromLast: () => cfgFromLast(),
    senRun: () => senRun(),
    react: () => reactClick(),
    runTool: (el) => { const f=TOOL_RUN[el.dataset.tool]; if(f){ go("tools"); f(); } },
    toolHide: (el) => { toggleToolHide(el.dataset.tool, el.checked); },
    toolGuide: (el) => { const id=el.dataset.tool; const t=TOOLS.find((x)=>x.id===id); $("dlgTitle").textContent=t?t.title:"راهنمای ابزار"; $("dlgBody").innerHTML="<b>"+esc(t?t.title:"راهنمای ابزار")+"</b><div style='margin-top:.5rem'>"+esc(GUIDES[id]||"").replace(/\n/g,"<br>")+"</div>"; $("dlg").classList.add("on"); $("dlg").setAttribute("aria-hidden","false"); },
    checkReset: () => { store.del("IMRC_chk"); renderChecklist(); },
    trouble: (el) => showTrouble(+el.dataset.i),
    printGuide: () => window.print(),
    // chat
    chatSend: () => chatSend(),
    // settings
    theme: (el) => { store.set("IMRC_theme", el.dataset.themeSet); applyTheme(el.dataset.themeSet); },
    fontDec: () => applyFont((+store.get("IMRC_font", 15)) - 1),
    fontInc: () => applyFont((+store.get("IMRC_font", 15)) + 1),
    push: () => enablePush(),
    install: () => installApp(),
    lang: () => { if (window.toggleLang) window.toggleLang(); },
    backup: () => backup(),
    restore: () => restoreFromPicker(),
    clearAll: () => clearAll(),
    logoutAll: () => logoutAll(),
    // shell
    palette: () => paletteOpen(),
    cycleTheme: () => cycleTheme(),
    focusExit: () => { store.set("IMRC_bx_focus", false); applyPrefs(); },
    buy: () => showBuy(),
    close: () => dlgClose(),
    whatsNewSeen: () => markWhatsNewSeen(),
  };

  function bindEvents() {
    document.addEventListener("click", (e) => {
      const fav = e.target.closest("[data-fav]");
      if (fav) { e.preventDefault(); e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
      const srv = e.target.closest("#srvList .srv");
      if (srv) { selectServer(srv.dataset.code); return; }
      const wz = e.target.closest("[data-wiz]");
      if (wz) { wizPick(wz.dataset.wiz); return; }
      const act = e.target.closest("[data-act]");
      if (act && ACTIONS[act.dataset.act]) {
        if (act.tagName === "A") e.preventDefault();
        ACTIONS[act.dataset.act](act, e);
        return;
      }
      const pg = e.target.closest("[data-page]");
      if (pg) { e.preventDefault(); go(pg.dataset.page); return; }
      const md = e.target.closest("[data-mode]");
      if (md) { setMode(md.dataset.mode); return; }
      const pal = e.target.closest("#cmdList [data-idx]");
      if (pal) { paletteRun(+pal.dataset.idx); return; }
      if (e.target.id === "dlg") dlgClose();
      if (e.target.id === "cmdPalette") paletteClose();
    });
    document.addEventListener("dblclick", (e) => {
      const srv = e.target.closest("#srvList .srv");
      if (srv) toggleFav(srv.dataset.code);
    });
    document.addEventListener("change", (e) => {
      const t = e.target;
      if (t.dataset.actChange === "done3") { store.set("IMRC_bx_done3", t.checked); renderStart(); return; }
      if (t.dataset.actChange === "suggest") { suggestRun(); return; }
      if (t.id === "cmpA" || t.id === "cmpB") { cmpRun(); return; }
      if (t.dataset.toggle) {
        const map = { simple: "IMRC_bx_simple", hc: "IMRC_bx_hc", focus: "IMRC_bx_focus" };
        if (map[t.dataset.toggle]) { store.set(map[t.dataset.toggle], t.checked); applyPrefs(); return; }
        if (t.dataset.toggle === "guide") { store.set("IMRC_bx_hide", !t.checked); applyPrefs(); return; }
        if (t.dataset.toggle === "sound") { store.set("IMRC_sound", t.checked); return; }
        if (t.dataset.toggle === "vibrate") { store.set("IMRC_vib", t.checked); if (t.checked) vibrate(50); return; }
      if (t.dataset.toggle === "lab") { store.set("IMRC_labEnabled", t.checked); const lf=$("labFlags"); if(lf) lf.style.display = t.checked ? "block" : "none"; return; }
      if (t.dataset.toggle === "labgraph") { store.set("IMRC_lab_graph", t.checked); return; }
      if (t.dataset.toggle === "labexport") { store.set("IMRC_lab_export", t.checked); return; }
      if (t.dataset.toggle === "labshortcuts") { store.set("IMRC_lab_shortcuts", t.checked); return; }
      }
      if (t.dataset.check !== undefined) {
        const st = store.get("IMRC_chk", {});
        st[t.dataset.check] = t.checked;
        store.set("IMRC_chk", st);
        if (CHECKS.every((_, i) => st[i])) toast("🔥 آماده‌ی مچ!");
        return;
      }
      if (t.id === "cfgName") { t.value = imrcName(t.value); updateSummary(); return; }
      if (["mtuSel", "dnsSel", "useDns", "useMtu", "cfgUsers", "mtuCustom"].includes(t.id)) updateSummary();
    });
    document.addEventListener("input", (e) => {
      const t = e.target;
      if (t.id === "srvSearch") renderServers();
      else if (t.id === "histSearch") renderHistory();
      else if (t.id === "faqSearch") renderFaq();
      else if (t.id === "chatIn") chatCount();
      else if (t.id === "notesText") { store.set("IMRC_notes", t.value.slice(0, 5000)); }
      else if (t.id === "toolFilter") renderToolsToolbar();
      else if (t.id === "mtuCustom") updateSummary();
      else if (t.id === "cmdInput") paletteFilter();
    });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) { e.preventDefault(); $("cmdPalette").classList.contains("on") ? paletteClose() : paletteOpen(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !$("cmdPalette").classList.contains("on")) { e.preventDefault(); build(); return; }
      if (e.key === "Escape") { if ($("cmdPalette").classList.contains("on")) paletteClose(); else if (dlgIsOpen()) dlgClose(); return; }
      if ($("cmdPalette").classList.contains("on")) {
        if (e.key === "ArrowDown") { e.preventDefault(); cmdIdx = Math.min(cmdIdx + 1, cmdList.length - 1); paletteRender(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); cmdIdx = Math.max(cmdIdx - 1, 0); paletteRender(); }
        else if (e.key === "Enter") { e.preventDefault(); paletteRun(cmdIdx); }
      }
      if (e.key === "Escape" && $("wizDlg").classList.contains("on")) { e.preventDefault(); closeWizard(); return; }
      if (e.target && e.target.id === "chatIn" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); chatSend(); }
      if (e.target && e.target.dataset && e.target.classList && e.target.classList.contains("srv") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault(); selectServer(e.target.dataset.code);
      }
    });
    $("wizSearch").addEventListener("input", wizRender);
    $("wizDlg").addEventListener("click", (e) => { if (e.target.id === "wizDlg") closeWizard(); });
    $("cmdList").addEventListener("mousemove", (e) => {
      const b = e.target.closest("[data-idx]");
      if (b && +b.dataset.idx !== cmdIdx) { cmdIdx = +b.dataset.idx; paletteRender(); }
    });
    window.addEventListener("hashchange", () => { const p = pageFromHash(); if (p) go(p, { silent: true }); });
    window.addEventListener("online", () => toast("🟢 اینترنت وصل شد"));
    window.addEventListener("offline", () => toast("🔴 اینترنت قطع شد"));
    window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredInstall = e; $("btnInstall").hidden = false; });
    window.addEventListener("appinstalled", () => { deferredInstall = null; $("btnInstall").hidden = true; });
  }

  /* ============================== init ============================== */
  function init() {
    initModernEffects();
    applyFont(store.get("IMRC_font", 15));
    renderThemes();
    applyPrefs();
    bindEvents();
    renderChecklist();
    renderTrouble();
    renderGloss();
    fillCompare();
    $("cfgName").value = "";
    setMode(S.mode);
    setRole(S.role);
    renderServers();
    renderHistory();
    renderStats();
    renderFaq();
    renderStart();
    const notes = store.get("IMRC_notes", "");
    $("notesText").value = typeof notes === "string" ? notes : "";
    const savedGoal = store.get("IMRC_goal", null);
    if (savedGoal != null) $("goalInput").value = savedGoal;
    // شکل صفحه‌ی ساخت: بعد از تست پینگ، هرگز عدد ساختگی نشان نمی‌دهیم
    applyShared();
    go(pageFromHash() || "home", { silent: true });
    loadQuota();
    pollStatus();
    setInterval(pollStatus, 60000);
    loadServerHistory();
    loadChat(false);
    scheduleChat();
    initPush();
    track("visit");
    setInterval(() => { if (!document.hidden) track("ping"); }, 30000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) track("ping"); });
    if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  /* ============================== modern effects ============================== */
  function initModernEffects() {
    // Scroll reveal
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("active");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -50px 0px" });
    $$(".card, .page-h, .wiz, .incident, .build-hero").forEach((el) => {
      el.classList.add("reveal");
      observer.observe(el);
    });

    // Cursor glow follower
    const glow = document.createElement("div");
    glow.className = "cursor-glow";
    document.body.appendChild(glow);
    let mouseX = 0, mouseY = 0, glowX = 0, glowY = 0;
    document.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; glow.classList.add("active"); });
    document.addEventListener("mouseleave", () => { glow.classList.remove("active"); });
    function animateGlow() {
      glowX += (mouseX - glowX) * 0.15;
      glowY += (mouseY - glowY) * 0.15;
      glow.style.left = glowX + "px";
      glow.style.top = glowY + "px";
      requestAnimationFrame(animateGlow);
    }
    animateGlow();

    // Magnetic buttons
    $$(".btn.magnetic, button.magnetic, .build-hero-btn, .nav-i.nav-cta, .bottom-build").forEach((btn) => {
      btn.addEventListener("mousemove", (e) => {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left - rect.width / 2;
        const y = e.clientY - rect.top - rect.height / 2;
        btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px) scale(1.05)`;
      });
      btn.addEventListener("mouseleave", () => { btn.style.transform = ""; });
    });

    // Page transition on nav clicks (delegated via existing click handler)
    const tr = document.createElement("div");
    tr.className = "page-transition";
    tr.innerHTML = '<div class="ring"></div>';
    document.body.appendChild(tr);
    function showTransition() { tr.classList.add("active"); }
    setTimeout(() => tr.classList.remove("active"), 400);

    // Floating particles
    const particlesContainer = document.createElement("div");
    particlesContainer.className = "particles";
    document.body.appendChild(particlesContainer);
    const particleCount = 22;
    for (let i = 0; i < particleCount; i++) {
      const p = document.createElement("div");
      p.className = "particle";
      const size = Math.random() * 10 + 4;
      p.style.width = size + "px";
      p.style.height = size + "px";
      p.style.left = Math.random() * 100 + "vw";
      p.style.top = Math.random() * 100 + "vh";
      p.style.animationDuration = (Math.random() * 10 + 8) + "s";
      p.style.animationDelay = (Math.random() * 5) + "s";
      const hues = ["ff2d95", "22d3ee", "8b5cf6", "ff8a3d"];
      p.style.background = "color-mix(in srgb, #" + hues[Math.floor(Math.random() * hues.length)] + " 50%, transparent)";
      p.style.boxShadow = "0 0 15px color-mix(in srgb, #" + hues[Math.floor(Math.random() * hues.length)] + " 70%, transparent)";
      particlesContainer.appendChild(p);
    }
  }

  init();
})();
