// ==UserScript==
// @name         BYPASS KING ULTIMATE VIP
// @namespace    https://bypass-king.local/
// @version      2.0.0
// @description  Trợ lý thao tác thủ công cho GTraffic: nhận diện nhiệm vụ, OCR ảnh do bạn chọn, phát hiện mã hiển thị, đồng hồ, lịch sử link. Không giải CAPTCHA, không tạo tương tác giả.
// @author       BYPASS KING
// @homepageURL  https://github.com/__GH_USER__/__GH_REPO__
// @supportURL    https://github.com/__GH_USER__/__GH_REPO__/issues
// @downloadURL   https://raw.githubusercontent.com/__GH_USER__/__GH_REPO__/main/BYPASS_KING.user.js
// @updateURL     https://raw.githubusercontent.com/__GH_USER__/__GH_REPO__/main/BYPASS_KING.user.js
// @icon          https://raw.githubusercontent.com/__GH_USER__/__GH_REPO__/main/assets/icon.png
// @match        https://gtraffic.io/*
// @match        https://*.gtraffic.io/*
// @match        http://*/*
// @match        https://*/*
// @noframes
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_setClipboard
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @require      https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js
// ==/UserScript==

(() => {
  'use strict';

  /* =====================================================================
   * 0. HẰNG SỐ & TIỆN ÍCH
   * ===================================================================== */
  const VERSION = '2.0.0';
  const NS = 'bk2_';
  const HOST = location.hostname;
  const IS_GT = /(^|\.)gtraffic\.io$/i.test(HOST);
  const IS_GOOGLE = /(^|\.)google\.[a-z.]{2,6}$/i.test(HOST);
  const SESSION_TTL = 45 * 60 * 1000; // phiên tự hết hạn sau 45 phút
  const DEFAULTS = Object.freeze({
    seconds: 68, ocr: true, ocrLang: 'eng', autoSave: true, taskRecognition: true,
    codeWatch: true, notify: true, autoKeyword: false,
    accent: 'gold', fontScale: 1, opacity: 0.97
  });
  const ACCENTS = { gold: '#f5c542', emerald: '#34d399', sky: '#38bdf8', rose: '#fb7185' };

  const now = () => Date.now();
  const uid = () => Math.random().toString(36).slice(2, 10) + now().toString(36).slice(-4);
  const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
  const fmtClock = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const fmtDate = t => { try { return new Date(t).toLocaleString('vi-VN'); } catch { return ''; } };
  const fmtDur = ms => { const s = Math.round(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}p${String(s % 60).padStart(2, '0')}s` : `${s}s`; };
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }
  /** Tạo phần tử DOM an toàn: chỉ dùng textContent, không dùng innerHTML. */
  function h(tag, props, ...kids) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const c of kids.flat()) {
      if (c == null || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }

  /* =====================================================================
   * 1. StorageManager – GM_getValue / GM_setValue + migrate từ v1.x
   * ===================================================================== */
  class StorageManager {
    get(k, d) { try { const v = GM_getValue(NS + k); return v === undefined ? d : v; } catch { return d; } }
    set(k, v) { try { GM_setValue(NS + k, v); return true; } catch (e) { console.warn('[BK] storage', e); return false; } }
    del(k) { try { GM_deleteValue(NS + k); } catch { /* bỏ qua */ } }
    /** Nhập lịch sử/cài đặt từ bản 1.x (chỉ chạy một lần, không xóa dữ liệu cũ). */
    migrate() {
      if (this.get('migrated', false)) return;
      try {
        const oldSettings = GM_getValue('bk_settings_v1');
        if (oldSettings && typeof oldSettings === 'object' && !this.get('settings')) {
          this.set('settings', {
            seconds: clamp(Number(oldSettings.seconds) || 68, 5, 3600),
            autoSave: oldSettings.autoSave !== false
          });
        }
        const oldHistory = GM_getValue('bk_history_v1');
        if (Array.isArray(oldHistory) && !this.get('history')) {
          const items = oldHistory.slice(0, 100).map(x => {
            const url = SecurityManager.safeUrl(x && x.url);
            return url ? {
              id: uid(), url, keyword: '', taskId: '', host: SecurityManager.cleanText(x.page, 80),
              status: 'pending', note: 'Nhập từ v1.x', createdAt: now(), startedAt: 0, finishedAt: 0, duration: 0, attempts: 0, code: ''
            } : null;
          }).filter(Boolean);
          this.set('history', items);
        }
        const oldKw = GM_getValue('bk_task_keyword_v1');
        if (oldKw && !this.get('lastKeyword')) this.set('lastKeyword', SecurityManager.cleanText(oldKw, 60));
      } catch (e) { console.warn('[BK] migrate', e); }
      this.set('migrated', true);
    }
  }

  /* =====================================================================
   * 2. SecurityManager – kiểm tra URL, làm sạch dữ liệu, kiểm tra mã
   * ===================================================================== */
  class SecurityManager {
    static cleanText(s, max = 200) {
      return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
    }
    /** Chỉ cho phép http/https, không chứa user:pass. Trả về href chuẩn hóa hoặc null. */
    static safeUrl(raw) {
      try {
        const u = new URL(String(raw == null ? '' : raw).trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        if (u.username || u.password) return null;
        return u.href;
      } catch { return null; }
    }
    static normUrl(raw) {
      const s = SecurityManager.safeUrl(raw);
      if (!s) return '';
      const u = new URL(s); u.hash = '';
      return u.href.replace(/\/$/, '').toLowerCase();
    }
    static hostMatches(host, target) {
      host = String(host || '').toLowerCase(); target = String(target || '').toLowerCase().replace(/^www\./, '');
      if (!host || !target) return false;
      const bare = host.replace(/^www\./, '');
      return bare === target || bare.endsWith('.' + target);
    }
    static openTab(url) {
      const safe = SecurityManager.safeUrl(url);
      if (!safe) return false;
      window.open(safe, '_blank', 'noopener,noreferrer');
      return true;
    }
    static googleUrl(keyword) { return 'https://www.google.com/search?q=' + encodeURIComponent(keyword); }
    static cleanKeyword(k) {
      const s = SecurityManager.cleanText(k, 60);
      return s.length >= 2 ? s : '';
    }
    /** Có giống từ khóa nhiệm vụ không (loại các nhãn UI như "Bước 01", "Google"...) */
    static keywordOk(k) {
      if (!k || k.length < 2 || k.length > 60) return false;
      if (/^(b[ưu][ớo]c|step|google|t[ìi]m|search|copy|sao ch[eé]p|đ[ổo]i|g[õo]|v[àa]o|nh[ậa]p|l[ưu]u|m[ãa]|code|ok|x[áa]c)\b/i.test(k)) return false;
      if (/^https?:\/\//i.test(k)) return false;
      if (!/[\p{L}\d]/u.test(k)) return false;
      return true;
    }
    static codeFormat(v, hasLabel) {
      if (typeof v !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9-]{3,19}$/.test(v)) return false;
      if (/^(.)\1+$/.test(v)) return false;
      if (/^(GOOGLE|SUBMIT|BUTTON|VERIFY|CONTINUE|COPYRIGHT|LOADING|PASSWORD|USERNAME|WEBSITE|SEARCH|ACCEPT|CANCEL)$/i.test(v)) return false;
      const hasDigit = /\d/.test(v);
      if (hasDigit) return true;
      return hasLabel && /^[A-Z-]{5,20}$/.test(v); // chỉ chữ: bắt buộc viết HOA + có nhãn
    }
  }

  /* =====================================================================
   * 3. NotificationManager – toast trong giao diện + thông báo hệ thống
   * ===================================================================== */
  class NotificationManager {
    constructor(settings) { this.settings = settings; this.sink = null; }
    setSink(fn) { this.sink = fn; }
    toast(msg, level = 'info', action = null) { if (this.sink) this.sink(msg, level, action); }
    system(title, text) {
      if (!this.settings.notify) return;
      try { GM_notification({ title, text, timeout: 6000 }); } catch { /* người dùng có thể chưa cấp quyền */ }
      try { if (navigator.vibrate) navigator.vibrate(120); } catch { /* bỏ qua */ }
    }
  }

  /* =====================================================================
   * 4. PageWatcher – MỘT MutationObserver duy nhất, debounce + throttle
   * ===================================================================== */
  class PageWatcher {
    constructor() {
      this.subs = new Set(); this.obs = null; this.t = null; this.last = 0;
      this.onVis = () => { if (!document.hidden) this.kick(); };
    }
    add(fn) { this.subs.add(fn); this._sync(); }
    remove(fn) { this.subs.delete(fn); this._sync(); }
    _sync() {
      if (this.subs.size && !this.obs) {
        this.obs = new MutationObserver(() => this.kick());
        this.obs.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        document.addEventListener('visibilitychange', this.onVis);
      } else if (!this.subs.size && this.obs) { this.destroy(); }
    }
    kick() {
      if (document.hidden) return;
      clearTimeout(this.t);
      this.t = setTimeout(() => this.run(), Math.max(700, 2000 - (now() - this.last)));
    }
    run() {
      this.last = now();
      for (const fn of [...this.subs]) { try { fn(); } catch (e) { console.warn('[BK] watcher', e); } }
    }
    destroy() {
      if (this.obs) this.obs.disconnect();
      this.obs = null; clearTimeout(this.t);
      document.removeEventListener('visibilitychange', this.onVis);
    }
  }

  /* =====================================================================
   * 5. HistoryManager – lịch sử nhiệm vụ / link, chống trùng
   * ===================================================================== */
  class HistoryManager {
    constructor(storage) { this.storage = storage; this.reload(); }
    reload() { const v = this.storage.get('history', []); this.items = Array.isArray(v) ? v : []; }
    save() { this.items = this.items.slice(0, 200); this.storage.set('history', this.items); }
    find(url) { const n = SecurityManager.normUrl(url); return n ? this.items.find(x => SecurityManager.normUrl(x.url) === n) : null; }
    get(id) { return this.items.find(x => x.id === id) || null; }
    /** Thêm hoặc cập nhật theo URL (không bao giờ tạo bản ghi trùng link). */
    upsert({ url, keyword = '', taskId = '', note = '' }) {
      const safe = SecurityManager.safeUrl(url);
      if (!safe) return null;
      let it = this.find(safe);
      if (it) {
        if (keyword) it.keyword = keyword;
        if (taskId) it.taskId = taskId;
        if (note) it.note = note;
      } else {
        it = { id: uid(), url: safe, keyword, taskId, host: HOST, status: 'pending', note, createdAt: now(), startedAt: 0, finishedAt: 0, duration: 0, attempts: 0, code: '' };
        this.items.unshift(it);
      }
      this.save();
      return it;
    }
    update(id, patch) { const it = this.get(id); if (!it) return null; Object.assign(it, patch); this.save(); return it; }
    finish(id, status, note = '') {
      const it = this.get(id); if (!it) return null;
      it.status = status; it.finishedAt = now();
      if (it.startedAt) it.duration = it.finishedAt - it.startedAt;
      if (note) it.note = SecurityManager.cleanText(note, 120);
      this.save(); return it;
    }
    remove(id) { this.items = this.items.filter(x => x.id !== id); this.save(); }
    clear() { this.items = []; this.save(); }
    doneTask(taskId) { return !!taskId && this.items.some(x => x.taskId === taskId && x.status === 'success'); }
    list({ status = 'all', q = '' } = {}) {
      const s = SecurityManager.cleanText(q, 80).toLowerCase();
      return this.items.filter(x => (status === 'all' || x.status === status) &&
        (!s || (x.url + ' ' + x.keyword + ' ' + x.note).toLowerCase().includes(s)));
    }
  }

  /* =====================================================================
   * 6. TaskRecognitionEngine – đọc nhiệm vụ từ DOM (+ kết quả OCR do người dùng đưa vào)
   * ===================================================================== */
  const OUTCOME_SUCCESS = /ho[àa]n th[àa]nh (?:nhi[ệe]m v[ụu]|task)|nhi[ệe]m v[ụu].{0,20}th[àa]nh c[ôo]ng|nh[ậa]n th[ưu][ởo]ng th[àa]nh c[ôo]ng|mission completed|task completed|completed successfully/i;
  const OUTCOME_FAIL = /th[ấa]t b[ạa]i|h[ếe]t h[ạa]n|kh[ôo]ng h[ợo]p l[ệe]|sai m[ãa]|m[ãa].{0,15}(?:sai|kh[ôo]ng đ[úu]ng)|invalid code|code expired|has expired|task failed/i;
  const ALERT_SELECTOR = '[role=alert],[role=status],.toast,.toastify,.alert,.swal2-popup,.notification,.notice,[class*=toast],[class*=alert],[class*=result],[class*=message]';

  function isVisible(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) !== 0;
  }
  /** Lấy các đoạn chữ "nhìn thấy được" (bỏ chữ nhiễu mờ/quá nhỏ) trong một vùng. */
  function visibleTexts(root) {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n, c = 0;
    while ((n = w.nextNode()) && c++ < 400) {
      const t = n.nodeValue.replace(/\s+/g, ' ').trim();
      const el = n.parentElement;
      if (!t || !el || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName)) continue;
      let op = 1, hidden = false, node = el;
      for (let i = 0; i < 8 && node && node !== root.parentElement; i++, node = node.parentElement) {
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
        const o = parseFloat(cs.opacity); op *= isNaN(o) ? 1 : o;
      }
      if (hidden) continue;
      const cs = getComputedStyle(el);
      const am = /rgba\([^)]*,\s*([\d.]+)\)\s*$/.exec(cs.color);
      if (am) op *= parseFloat(am[1]);
      const size = parseFloat(cs.fontSize) || 0;
      if (op >= 0.6 && size >= 10) out.push({ text: t, size });
    }
    return out;
  }

  class TaskRecognitionEngine {
    constructor(ctx) { this.ctx = ctx; this.last = null; this.changeEl = null; this.fn = () => this.scan(); }
    start() { if (!IS_GT) return; this.ctx.watcher.add(this.fn); this.scan(); }
    stop() { this.ctx.watcher.remove(this.fn); }

    _stepKeyword() {
      if (!document.body) return null;
      const HEAD = /g[õo]\s*t[ừu]|nh[ậa]p\s*t[ừu]\s*kh[óo]a/i;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, c = 0, head = null;
      while ((n = w.nextNode()) && c++ < 6000) {
        const t = n.nodeValue;
        if (t.length < 120 && HEAD.test(t) && n.parentElement && !/^(SCRIPT|STYLE)$/.test(n.parentElement.tagName)) { head = n.parentElement; break; }
      }
      if (!head) return null;
      let imageHint = false;
      for (let el = head, up = 0; el && el !== document.body && up < 5; el = el.parentElement, up++) {
        const tally = new Map();
        let sib = el.nextElementSibling;
        for (let i = 0; sib && i < 3; sib = sib.nextElementSibling, i++) {
          if (!isVisible(sib)) continue;
          for (const { text, size } of visibleTexts(sib)) {
            const k = SecurityManager.cleanKeyword(text);
            if (!SecurityManager.keywordOk(k) || k.length > 40) continue;
            const key = k.toLowerCase();
            const e = tally.get(key) || { k, count: 0, size: 0 };
            e.count++; e.size = Math.max(e.size, size); tally.set(key, e);
          }
          if (sib.querySelector('img,canvas')) imageHint = true;
        }
        if (tally.size) {
          const best = [...tally.values()].sort((a, b) => b.count - a.count || b.size - a.size)[0];
          return { keyword: best.k, confidence: best.count >= 2 ? 90 : 70, source: best.count >= 2 ? 'Bước nhiệm vụ (2 vùng khớp nhau)' : 'Bước nhiệm vụ (1 vùng)', imageHint };
        }
      }
      return imageHint ? { keyword: '', confidence: 0, source: '', imageHint: true } : null;
    }

    _outcome() {
      let nodes;
      try { nodes = document.querySelectorAll(ALERT_SELECTOR); } catch { return null; }
      let c = 0;
      for (const el of nodes) {
        if (c++ > 80) break;
        const t = (el.innerText || '').trim();
        if (!t || t.length > 220 || !isVisible(el)) continue;
        if (OUTCOME_FAIL.test(t)) return { type: 'failed', evidence: SecurityManager.cleanText(t, 100) };
        if (OUTCOME_SUCCESS.test(t)) return { type: 'success', evidence: SecurityManager.cleanText(t, 100) };
      }
      return null;
    }

    _findChangeBtn() {
      let c = 0;
      for (const el of document.querySelectorAll('button,a,[role=button]')) {
        if (c++ > 300) break;
        if (/đ[ổo]i\s*t[ừu]\s*kh[óo]a/i.test((el.textContent || '').slice(0, 60)) && isVisible(el)) return el;
      }
      return null;
    }

    scan() {
      const s = this.ctx.settings;
      if (!s.taskRecognition || !document.body) return this.last;
      const text = (document.body.innerText || '').slice(0, 20000);
      const info = { at: now(), kinds: [], keyword: '', confidence: 0, source: '', urls: [], imageHint: false, hasChangeBtn: false, outcome: null, state: 'none', taskId: '' };
      const kinds = [
        ['Tìm kiếm Google', /google|t[ìi]m ki[ếe]m|search/i], ['Truy cập website', /truy c[ậa]p|visit|v[àa]o (?:website|trang|web)/i],
        ['Xem nội dung', /\bxem\b|watch|view/i], ['Đọc văn bản', /\bđ[ọo]c\b|read/i], ['Nhập từ khóa', /nh[ậa]p|g[õo] t[ừu]|keyword|t[ừu] kh[óo]a/i]
      ];
      for (const [name, re] of kinds) if (re.test(text)) info.kinds.push(name);
      if (document.querySelector('video,iframe[src*="youtube"],iframe[src*="vimeo"]')) info.kinds.push('Video');
      const step = this._stepKeyword();
      if (step) { Object.assign(info, { keyword: step.keyword, confidence: step.confidence, source: step.source, imageHint: !!step.imageHint }); }
      if (!info.keyword) {
        const m = /(?:t[ừu] kh[óo]a|keyword)\s*[:：]\s*["“']?([^\n"'“”]{2,60})/i.exec(text);
        const k = m && SecurityManager.cleanKeyword(m[1]);
        if (k && SecurityManager.keywordOk(k)) Object.assign(info, { keyword: k, confidence: 60, source: 'Nhãn "từ khóa:" trong trang' });
      }
      if (info.imageHint && !info.keyword) info.source = 'Từ khóa có thể nằm trong ảnh – hãy dùng OCR';
      // URL: chỉ liệt kê URL được trang HIỂN THỊ; không suy đoán
      const seen = new Set();
      for (const u of (text.match(/https?:\/\/[^\s"'<>)\]]{4,200}/g) || [])) {
        const safe = SecurityManager.safeUrl(u);
        if (!safe) continue;
        const hh = new URL(safe).hostname;
        if (/(^|\.)gtraffic\.io$/i.test(hh) || /(^|\.)google\./i.test(hh) || seen.has(safe)) continue;
        seen.add(safe); if (seen.size >= 5) break;
      }
      info.urls = [...seen];
      const btn = this._findChangeBtn(); this.changeEl = btn; info.hasChangeBtn = !!btn;
      info.outcome = this._outcome();
      info.taskId = info.keyword ? hash(info.keyword.toLowerCase() + '|' + location.pathname) : '';
      const ses = this.ctx.traffic.session;
      if (!info.taskId) info.state = 'none';
      else if (info.outcome && info.outcome.type === 'success') info.state = 'done';
      else if (this.ctx.history.doneTask(info.taskId)) info.state = 'done';
      else if (ses && ses.status === 'active' && ses.taskId === info.taskId) info.state = 'running';
      else info.state = 'new';
      const prev = this.last; this.last = info;
      this.ctx.onTaskInfo(info, prev);
      return info;
    }
  }

  /* =====================================================================
   * 7. CodeDetectionEngine – chỉ nhận mã có nhãn/ngữ cảnh rõ ràng
   * ===================================================================== */
  const CODE_RULES = [
    { re: /(?<![\p{L}\d])m[ãa](?:\s*(?:x[áa]c\s*(?:nh[ậa]n|minh)|nh[ậa]n|qu[àa]|truy\s*c[ậa]p|c[ủu]a\s*b[ạa]n))?\s*[:：#=]\s*([A-Za-z0-9][A-Za-z0-9-]{3,19})(?![\p{L}\d])/iu, needDigit: false },
    { re: /(?<![\p{L}\d])code\s*(?:is\s*)?[:：#=]\s*([A-Za-z0-9][A-Za-z0-9-]{3,19})(?![\p{L}\d])/iu, needDigit: false },
    { re: /(?<![\p{L}\d])(?:verification|access|redeem|claim|gift|your)\s*code\s+(?:is\s+)?([A-Za-z0-9-]{4,20})(?![\p{L}\d])/iu, needDigit: true }
  ];
  const CODE_CLASS_HINT = /(^|[\s_-])(code|ma|otp|verify|claim|reward)([\s_-]|$)/i;

  class CodeDetectionEngine {
    constructor(ctx) { this.ctx = ctx; this.list = []; this.reload(); this.fn = () => this.scan(); }
    reload() { const v = this.ctx.storage.get('codes', []); this.list = Array.isArray(v) ? v : []; }
    start() { this.ctx.watcher.add(this.fn); this.scan(); }
    stop() { this.ctx.watcher.remove(this.fn); }
    _state(score) {
      const ses = this.ctx.traffic.session;
      const onTarget = ses && SecurityManager.hostMatches(HOST, ses.targetHost);
      return score >= 75 && (IS_GT || onTarget) ? 'confirmed' : 'suspect';
    }
    /** Ghi một mã; trả về true nếu là mã MỚI (đã loại trùng). */
    record(value, score, source) {
      this.reload();
      const state = source === 'manual' ? 'confirmed' : this._state(score);
      const ex = this.list.find(x => x.value === value);
      if (ex) {
        if (ex.state !== 'confirmed' && state === 'confirmed') { ex.state = 'confirmed'; this.ctx.storage.set('codes', this.list); this.ctx.onCodes(); }
        return false;
      }
      const ses = this.ctx.traffic.session;
      this.list.unshift({ value, score, source, state, host: HOST, time: now(), taskId: (ses && ses.taskId) || '' });
      this.list = this.list.slice(0, 30);
      this.ctx.storage.set('codes', this.list);
      this.ctx.onCodes(true, this.list[0]);
      return true;
    }
    confirm(value) {
      this.reload();
      const it = this.list.find(x => x.value === value);
      if (it) { it.state = 'confirmed'; this.ctx.storage.set('codes', this.list); this.ctx.onCodes(); }
    }
    clear() { this.list = []; this.ctx.storage.set('codes', []); this.ctx.onCodes(); }
    _labelNear(el) {
      let p = el && el.parentElement;
      for (let i = 0; i < 2 && p; i++, p = p.parentElement) {
        const t = p.textContent || '';
        if (t.length <= 160 && /(m[ãa]|code)/i.test(t)) return true;
      }
      return false;
    }
    _hint(el) {
      for (let i = 0; i < 3 && el; i++, el = el.parentElement) {
        if (CODE_CLASS_HINT.test((el.getAttribute('class') || '') + ' ' + (el.id || ''))) return true;
      }
      return false;
    }
    scan() {
      if (!this.ctx.settings.codeWatch || IS_GOOGLE || !document.body) return;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n, c = 0;
      while ((n = w.nextNode()) && c++ < 4000) {
        const t = n.nodeValue.trim();
        if (t.length < 4 || t.length > 240) continue;
        const el = n.parentElement;
        if (!el || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(el.tagName)) continue;
        let handled = false;
        for (const rule of CODE_RULES) {
          const m = rule.re.exec(t);
          if (!m) continue;
          handled = true;
          const v = m[1];
          if (rule.needDigit && !/\d/.test(v)) break;
          if (SecurityManager.codeFormat(v, true) && isVisible(el)) this.record(v, 75 + (this._hint(el) ? 10 : 0), 'DOM');
          break;
        }
        if (handled) continue;
        if (/^[A-Z0-9-]{5,20}$/.test(t) && SecurityManager.codeFormat(t, false) && (this._hint(el) || this._labelNear(el)) && isVisible(el)) {
          this.record(t, 50 + (this._hint(el) ? 10 : 0), 'DOM');
        }
      }
    }
    /** Dùng cho kết quả OCR: chỉ trả về mã có nhãn; ứng viên trơn chỉ là "nghi ngờ". */
    fromText(text, source = 'OCR') {
      const out = [];
      for (const line of String(text || '').split(/\n+/)) {
        const t = line.trim();
        if (!t) continue;
        let hit = false;
        for (const rule of CODE_RULES) {
          const m = rule.re.exec(t);
          if (m && (!rule.needDigit || /\d/.test(m[1])) && SecurityManager.codeFormat(m[1], true)) { out.push({ value: m[1], score: 70 }); hit = true; break; }
        }
        if (!hit && /^[A-Z0-9-]{5,20}$/.test(t) && SecurityManager.codeFormat(t, false)) out.push({ value: t, score: 35 });
      }
      for (const o of out) this.record(o.value, o.score, source);
      return out;
    }
    addManual(value) {
      const v = SecurityManager.cleanText(value, 20).replace(/\s+/g, '');
      if (!SecurityManager.codeFormat(v, true)) return false;
      this.record(v, 60, 'manual');
      return true;
    }
    best() { return this.list.find(x => x.state === 'confirmed') || this.list[0] || null; }
  }

  /* =====================================================================
   * 8. OCRManager – Tesseract.js, chỉ chạy trên ảnh người dùng chọn
   * ===================================================================== */
  class OCRManager {
    constructor(ctx) { this.ctx = ctx; this.busy = false; this.picking = false; }
    get lib() { return typeof Tesseract !== 'undefined' ? Tesseract : (window.Tesseract || null); }
    async toBlob(src) {
      if (src instanceof Blob) return src;
      const w = src.naturalWidth || src.width, hh = src.naturalHeight || src.height;
      if (!w || !hh) throw new Error('Ảnh rỗng hoặc chưa tải xong.');
      const k = w < 500 ? 2 : 1;
      const cv = document.createElement('canvas');
      cv.width = Math.min(w * k, 3000); cv.height = Math.round(cv.width * hh / w);
      const g = cv.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height);
      try {
        g.drawImage(src, 0, 0, cv.width, cv.height);
        return await new Promise((res, rej) => cv.toBlob(b => (b ? res(b) : rej(new Error('Không xuất được ảnh.'))), 'image/png'));
      } catch (e) {
        if (e && e.name === 'SecurityError') throw new Error('Trang chặn đọc ảnh này (CORS). Hãy chụp màn hình rồi chọn file ảnh.');
        throw e;
      }
    }
    async run(src, onProgress) {
      if (!this.ctx.settings.ocr) throw new Error('OCR đang tắt trong Cài đặt.');
      const T = this.lib;
      if (!T || !T.createWorker) throw new Error('Chưa nạp được thư viện OCR (kiểm tra mạng và @require).');
      if (this.busy) throw new Error('OCR đang chạy, vui lòng đợi.');
      this.busy = true;
      let worker = null, timer = 0, cancelled = false;
      try {
        const blob = await this.toBlob(src);
        const work = (async () => {
          worker = await T.createWorker(this.ctx.settings.ocrLang === 'eng+vie' ? 'eng+vie' : 'eng', 1, { logger: m => { if (onProgress) onProgress(m); } });
          if (cancelled) { await worker.terminate(); worker = null; throw new Error('Đã hủy.'); }
          const { data } = await worker.recognize(blob);
          return { text: (data.text || '').trim(), confidence: Math.round(data.confidence || 0) };
        })();
        const limit = new Promise((_, rej) => { timer = setTimeout(() => { cancelled = true; rej(new Error('OCR quá thời gian (90 giây).')); }, 90000); });
        return await Promise.race([work, limit]);
      } finally {
        clearTimeout(timer); this.busy = false;
        if (worker) { try { await worker.terminate(); } catch { /* bỏ qua */ } }
      }
    }
    /** Người dùng chạm vào một ảnh/canvas trên trang (một lần), Esc hoặc 20 giây để hủy. */
    pick(isOwn) {
      if (this.picking) return Promise.reject(new Error('Đang ở chế độ chọn ảnh.'));
      this.picking = true;
      return new Promise((resolve, reject) => {
        let t = 0;
        const end = (fn, v) => {
          document.removeEventListener('click', onClick, true); document.removeEventListener('keydown', onKey, true);
          clearTimeout(t); this.picking = false; fn(v);
        };
        const onClick = e => {
          if (isOwn(e)) return; // cho phép bấm vào bảng điều khiển
          e.preventDefault(); e.stopPropagation();
          const tg = e.target;
          let el = tg && tg.closest ? tg.closest('img,canvas') : null;
          if (!el && tg && tg.querySelector) el = tg.querySelector('img,canvas');
          if (!el) { for (const x of document.elementsFromPoint(e.clientX, e.clientY)) { if (/^(IMG|CANVAS)$/.test(x.tagName)) { el = x; break; } } }
          el ? end(resolve, el) : end(reject, new Error('Không thấy ảnh tại vị trí vừa chạm.'));
        };
        const onKey = e => { if (e.key === 'Escape') end(reject, new Error('Đã hủy chọn ảnh.')); };
        document.addEventListener('click', onClick, true); document.addEventListener('keydown', onKey, true);
        t = setTimeout(() => end(reject, new Error('Hết thời gian chọn ảnh.')), 20000);
      });
    }
  }

  /* =====================================================================
   * 9. TrafficManager – phiên làm nhiệm vụ (người dùng chủ động từng bước)
   * ===================================================================== */
  class TrafficManager {
    constructor(ctx) { this.ctx = ctx; this.reload(); this.changeCount = 0; this.lastChange = 0; }
    reload() {
      const s = this.ctx.storage.get('session', null);
      this.session = (s && typeof s === 'object' && now() - s.startedAt < SESSION_TTL) ? s : null;
      if (s && !this.session && s.status === 'active') { s.status = 'expired'; this.ctx.storage.set('session', s); this.session = null; }
    }
    persist() { this.ctx.storage.set('session', this.session); }
    get active() { return !!this.session && this.session.status === 'active'; }

    begin(keywordRaw) {
      const keyword = SecurityManager.cleanKeyword(keywordRaw);
      if (!keyword) return { ok: false, msg: 'Chưa có từ khóa. Hãy nhận diện hoặc nhập thủ công.' };
      const taskId = hash(keyword.toLowerCase() + '|' + (IS_GT ? location.pathname : ''));
      const gtUrl = IS_GT ? location.href : (this.session && this.session.gtUrl) || '';
      const ent = gtUrl ? this.ctx.history.upsert({ url: gtUrl, keyword, taskId }) : null;
      const same = this.session && this.session.taskId === taskId && this.session.status === 'active';
      if (same) { this.session.attempts++; }
      else {
        this.session = { id: uid(), taskId, keyword, gtUrl, historyId: ent ? ent.id : '', status: 'active', startedAt: now(), attempts: 1, targetHost: '', targetUrl: '', targetSeenAt: 0 };
      }
      if (ent) this.ctx.history.update(ent.id, { startedAt: this.session.startedAt, attempts: this.session.attempts, status: 'pending', keyword, taskId });
      this.ctx.storage.set('lastKeyword', keyword);
      this.persist();
      if (!SecurityManager.openTab(SecurityManager.googleUrl(keyword))) return { ok: false, msg: 'Không mở được Google.' };
      this.ctx.refresh();
      return { ok: true, msg: `Đã mở Google với từ khóa "${keyword}". Hãy chọn kết quả đúng với nhiệm vụ.` };
    }
    confirmTarget(raw) {
      if (!this.active) return { ok: false, msg: 'Chưa có phiên đang chạy. Bấm "Mở Google" trước.' };
      let input = String(raw || '').trim();
      if (input && !/^https?:\/\//i.test(input)) input = 'https://' + input;
      const safe = SecurityManager.safeUrl(input);
      if (!safe) return { ok: false, msg: 'Website đích không hợp lệ (chỉ nhận http/https).' };
      const u = new URL(safe);
      this.session.targetHost = u.hostname.replace(/^www\./, '').toLowerCase(); this.session.targetUrl = safe;
      this.persist(); this.ctx.refresh();
      return { ok: true, msg: 'Đã xác nhận website đích: ' + this.session.targetHost };
    }
    useThisPage() { return this.confirmTarget(location.href); }
    /** Gọi trên mọi trang khi có phiên: ghi nhận người dùng đã vào trang đích. */
    trackTarget() {
      if (IS_GT || IS_GOOGLE || !this.active) return;
      if (this.session.targetHost && SecurityManager.hostMatches(HOST, this.session.targetHost) && !this.session.targetSeenAt) {
        this.session.targetSeenAt = now(); this.persist();
        if (this.session.historyId) this.ctx.history.update(this.session.historyId, { note: 'Đã vào trang đích ' + this.session.targetHost });
      }
    }
    end(status, note) {
      if (!this.session) return false;
      this.session.status = status === 'success' ? 'success' : status === 'failed' ? 'failed' : 'cancelled';
      this.session.finishedAt = now();
      if (this.session.historyId && (status === 'success' || status === 'failed')) this.ctx.history.finish(this.session.historyId, status, note);
      this.persist(); this.ctx.refresh();
      return true;
    }
    /** Chỉ chốt thành công/thất bại khi trang GTraffic hiển thị thông báo rõ ràng. */
    applyOutcome(o) {
      if (!IS_GT || !o || !this.active) return;
      if (now() - this.session.startedAt < 3000) return;
      this.end(o.type, o.evidence);
      this.ctx.notify.toast(o.type === 'success' ? 'Trang báo THÀNH CÔNG: ' + o.evidence : 'Trang báo THẤT BẠI: ' + o.evidence, o.type === 'success' ? 'ok' : 'err');
      this.ctx.notify.system('BYPASS KING', o.type === 'success' ? 'Nhiệm vụ thành công' : 'Nhiệm vụ thất bại');
    }
    retry() {
      const s = this.session;
      if (!s || !s.keyword) return { ok: false, msg: 'Không có nhiệm vụ để thử lại.' };
      if (s.status !== 'active') {
        if (s.status === 'success') return { ok: false, msg: 'Nhiệm vụ đã thành công, không cần thử lại.' };
        this.session = { ...s, id: uid(), status: 'active', startedAt: now(), finishedAt: 0, targetSeenAt: 0 };
      }
      if ((this.session.attempts || 1) >= 5) return { ok: false, msg: 'Đã thử lại tối đa 5 lần cho nhiệm vụ này.' };
      return this.begin(this.session.keyword);
    }
    /** Nhấn nút "ĐỔI TỪ KHÓA MỚI" có sẵn của trang – luôn do người dùng bấm xác nhận. */
    requestChange() {
      const el = this.ctx.task.changeEl;
      if (!IS_GT || !el || !document.contains(el)) return { ok: false, msg: 'Không thấy nút "Đổi từ khóa mới" trên trang này.' };
      if (now() - this.lastChange < 10000) return { ok: false, msg: 'Vui lòng đợi 10 giây giữa các lần đổi từ khóa.' };
      if (this.changeCount >= 3) return { ok: false, msg: 'Đã đổi từ khóa 3 lần ở phiên này. Hãy tải lại trang nếu thật sự cần.' };
      this.changeCount++; this.lastChange = now();
      el.click();
      return { ok: true, msg: `Đã bấm "Đổi từ khóa mới" (${this.changeCount}/3). Đợi trang cập nhật rồi nhận diện lại.` };
    }
  }

  /* =====================================================================
   * 10. TimerManager – một interval duy nhất, tính theo mốc thời gian thực
   * ===================================================================== */
  class TimerManager {
    constructor(ctx) {
      this.ctx = ctx; this.iv = 0;
      this.s = { status: 'idle', total: ctx.settings.seconds, remaining: ctx.settings.seconds, endAt: 0 };
      this.load();
    }
    load() {
      const v = this.ctx.storage.get('timer', null);
      if (v && typeof v === 'object' && ['idle', 'running', 'paused', 'finished'].includes(v.status)) this.s = { ...this.s, ...v };
      else this.s = { status: 'idle', total: this.ctx.settings.seconds, remaining: this.ctx.settings.seconds, endAt: 0 };
      this._sync();
    }
    _persist() { this.ctx.storage.set('timer', this.s); }
    _clear() { if (this.iv) { clearInterval(this.iv); this.iv = 0; } }
    _sync() {
      this._clear();
      if (this.s.status === 'running') { this.iv = setInterval(() => this.tick(), 500); this.tick(); }
      else this.ctx.onTimer(this.s);
    }
    left() { return this.s.status === 'running' ? Math.max(0, Math.ceil((this.s.endAt - now()) / 1000)) : this.s.remaining; }
    start() {
      this._clear();
      this.s = { status: 'running', total: this.ctx.settings.seconds, remaining: this.ctx.settings.seconds, endAt: now() + this.ctx.settings.seconds * 1000 };
      this._persist(); this._sync();
    }
    pause() {
      if (this.s.status !== 'running') return;
      this.s.remaining = this.left(); this.s.status = 'paused'; this.s.endAt = 0;
      this._persist(); this._sync();
    }
    resume() {
      if (this.s.status !== 'paused' || this.s.remaining <= 0) return;
      this.s.status = 'running'; this.s.endAt = now() + this.s.remaining * 1000;
      this._persist(); this._sync();
    }
    reset() {
      this._clear();
      this.s = { status: 'idle', total: this.ctx.settings.seconds, remaining: this.ctx.settings.seconds, endAt: 0 };
      this._persist(); this._sync();
    }
    tick() {
      const r = this.left();
      if (r <= 0 && this.s.status === 'running') {
        this._clear();
        const fresh = this.ctx.storage.get('timer', null); // tab khác có thể đã kết thúc trước
        const already = fresh && fresh.status === 'finished';
        this.s = { ...this.s, status: 'finished', remaining: 0, endAt: 0 };
        if (!already) {
          this._persist();
          this.ctx.notify.toast('Hết giờ! Kiểm tra trang và mã (không gửi gì tự động).', 'ok');
          this.ctx.notify.system('BYPASS KING', 'Đã hết thời gian chờ');
        }
      }
      this.ctx.onTimer({ ...this.s, remaining: this.s.status === 'running' ? r : this.s.remaining });
    }
    destroy() { this._clear(); }
  }

  /* =====================================================================
   * 11. UIManager – Shadow DOM, 3 chế độ, kéo thả, ghi nhớ vị trí
   * ===================================================================== */
  const CSS = `
:host{all:initial}
*{box-sizing:border-box}
.panel,.fab{position:fixed;z-index:2147483647;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#e9eefb;--a:#f5c542;--fs:1;--op:.97}
.panel{width:min(348px,calc(100vw - 8px));max-height:min(80vh,calc(100vh - 8px));display:flex;flex-direction:column;font-size:calc(12.5px*var(--fs));line-height:1.4;
 background:linear-gradient(160deg,rgba(16,25,46,.97),rgba(8,13,27,.97));backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
 border:1px solid color-mix(in srgb,var(--a) 35%,transparent);border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.55);opacity:var(--op);overflow:hidden;animation:pop .18s ease-out}
.panel.m-compact{width:min(236px,calc(100vw - 8px))}
.panel[hidden],.fab[hidden]{display:none}
@keyframes pop{from{transform:translateY(6px) scale(.98);opacity:0}to{transform:none;opacity:var(--op)}}
.head{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;background:rgba(255,255,255,.04);border-bottom:1px solid rgba(255,255,255,.07)}
.head:active{cursor:grabbing}
.brand{flex:1;min-width:0}.brand b{font-size:14px;letter-spacing:.6px}.brand b i{font-style:normal;color:var(--a)}
.brand small{display:block;color:#8fa0c0;font-size:10px;letter-spacing:.5px}
.ib{all:unset;cursor:pointer;width:30px;height:30px;display:grid;place-items:center;border-radius:9px;color:#cdd8f0;font-size:15px;background:rgba(255,255,255,.06)}
.ib:hover{background:rgba(255,255,255,.12)}
.bar{display:flex;align-items:center;gap:7px;padding:7px 11px;font-size:.95em;color:#cfe0ff;background:rgba(56,189,248,.07)}
.dot{width:8px;height:8px;border-radius:50%;background:#34d399;flex:none;box-shadow:0 0 8px #34d399}
.dot.warn{background:#f5c542;box-shadow:0 0 8px #f5c542}.dot.err{background:#fb7185;box-shadow:0 0 8px #fb7185}
.toast{margin:7px 9px 0;padding:8px 10px;border-radius:10px;background:#1b2a47;border:1px solid #33466b;display:flex;gap:8px;align-items:center}
.toast.ok{border-color:#1f7a5a;background:#12332b}.toast.err{border-color:#8a3a4a;background:#35192a}
.toast span{flex:1;overflow-wrap:anywhere}
.scroll{overflow:auto;-webkit-overflow-scrolling:touch;padding:8px 9px 10px;display:grid;gap:7px;overscroll-behavior:contain}
details.card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:13px;overflow:hidden}
details.card>summary{list-style:none;cursor:pointer;padding:9px 11px;font-weight:800;display:flex;align-items:center;gap:7px;color:#f3f6ff}
details.card>summary::-webkit-details-marker{display:none}
details.card>summary::after{content:"▾";margin-left:auto;color:var(--a);transition:transform .15s}
details.card[open]>summary::after{transform:rotate(180deg)}
.body{padding:2px 11px 11px;display:grid;gap:7px}
.kv{display:flex;gap:8px;justify-content:space-between;align-items:flex-start}.kv>span:first-child{color:#8fa0c0;flex:none}.kv>span:last-child{text-align:right;overflow-wrap:anywhere}
.mono{font-family:ui-monospace,Consolas,monospace;letter-spacing:.5px}
.chip{display:inline-block;padding:1px 8px;border-radius:99px;font-size:.88em;font-weight:700;background:#26324c;color:#cdd8f0}
.chip.ok{background:#12402f;color:#6ee7b7}.chip.warn{background:#4a3a10;color:#fcd34d}.chip.err{background:#4a1d2a;color:#fda4af}.chip.info{background:#10364d;color:#7dd3fc}
.meter{height:6px;border-radius:9px;background:#1b2740;overflow:hidden}.meter>i{display:block;height:100%;width:0;background:linear-gradient(90deg,#fb7185,var(--a),#34d399);transition:width .3s}
.row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.row>*{flex:1;min-width:0}
input[type=text],input[type=url],input[type=number],input[type=search],select,textarea{width:100%;min-height:36px;padding:7px 9px;border-radius:10px;border:1px solid #33446a;background:#0b1326;color:#f1f5ff;font:inherit;outline:none}
input:focus,select:focus,textarea:focus{border-color:var(--a)}
textarea{min-height:56px;resize:vertical}
button.b{all:unset;box-sizing:border-box;cursor:pointer;text-align:center;min-height:36px;padding:7px 10px;border-radius:10px;font-weight:800;background:linear-gradient(135deg,var(--a),color-mix(in srgb,var(--a) 70%,#fff));color:#161616;display:flex;align-items:center;justify-content:center;transition:transform .1s,filter .15s}
button.b:active{transform:scale(.97)}button.b:hover{filter:brightness(1.08)}
button.b.s{background:#24314d;color:#eaf0ff;border:1px solid #3a4b70}
button.b.d{background:#5c2330;color:#ffe4e8;border:1px solid #84384a}
button.b.sm{min-height:28px;padding:3px 8px;font-size:.9em}
button.b:disabled{opacity:.4;cursor:not-allowed}
.timer{font:800 30px/1 ui-monospace,Consolas,monospace;text-align:center;color:var(--a);letter-spacing:2px;padding:4px 0}
.codebox{padding:10px;border-radius:12px;border:1px dashed color-mix(in srgb,var(--a) 60%,transparent);text-align:center;font:800 20px ui-monospace,Consolas,monospace;letter-spacing:1.5px;overflow-wrap:anywhere;min-height:44px;display:grid;place-items:center}
.item{padding:8px;border-radius:10px;background:rgba(0,0,0,.22);border:1px solid rgba(255,255,255,.06);display:grid;gap:5px;overflow-wrap:anywhere}
.item small{color:#8fa0c0}
.list{display:grid;gap:6px;max-height:210px;overflow:auto}
label.sw{display:flex;align-items:center;gap:9px;min-height:32px;cursor:pointer}
label.sw input{width:18px;height:18px;accent-color:var(--a);flex:none}
.muted{color:#8fa0c0;font-size:.92em}
.compact-body{padding:8px 9px 10px;display:grid;gap:7px}
.fab{width:50px;height:50px;border-radius:50%;border:1.5px solid var(--a);background:radial-gradient(circle at 30% 25%,#22345f,#0a1226);color:var(--a);font-size:24px;cursor:grab;display:grid;place-items:center;box-shadow:0 8px 22px rgba(0,0,0,.55),0 0 14px color-mix(in srgb,var(--a) 35%,transparent);touch-action:none;user-select:none;-webkit-user-select:none;padding:0;opacity:var(--op)}
.fab .badge{position:absolute;top:-3px;right:-3px;min-width:16px;height:16px;border-radius:9px;background:#fb7185;color:#fff;font:700 10px/16px system-ui;text-align:center;padding:0 4px}
.fab .badge[hidden]{display:none}
.fab small{position:absolute;bottom:-14px;left:50%;transform:translateX(-50%);font:700 10px/1 ui-monospace,monospace;color:#cfe0ff;background:#0a1226cc;padding:1px 4px;border-radius:6px;white-space:nowrap}
.fab small:empty{display:none}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

  class UIManager {
    constructor(ctx) {
      this.ctx = ctx; this.el = {};
      const st = ctx.storage;
      this.mode = ['expanded', 'compact', 'floating'].includes(st.get('mode')) ? st.get('mode') : 'expanded';
      const p = st.get('pos', null);
      this.pos = (p && typeof p === 'object') ? p : {};
      this.toastT = 0; this.host = null; this.shadow = null;
      this.onResize = () => { this._place(); };
    }

    /* ---------- dựng giao diện ---------- */
    mount() {
      this.host = document.createElement('div');
      this.host.id = 'bk-king-host';
      this.shadow = this.host.attachShadow({ mode: 'closed' });
      this.shadow.append(h('style', { text: CSS }));
      this.panel = h('section', { class: 'panel', 'aria-label': 'BYPASS KING' });
      this.fab = h('button', { class: 'fab', title: 'BYPASS KING – chạm để mở, kéo để di chuyển', 'aria-label': 'Mở BYPASS KING' }, '♛', this.el.badge = h('span', { class: 'badge', hidden: true }), this.el.fabTime = h('small'));
      this.shadow.append(this.panel, this.fab);
      this._buildPanel();
      (document.body || document.documentElement).appendChild(this.host);
      this._drag(this.el.head, this.panel, 'panel', null);
      this._drag(this.fab, this.fab, 'float', () => this.setMode(this.ctx.storage.get('lastOpenMode', 'expanded')));
      window.addEventListener('resize', this.onResize);
      this.applyTheme();
      this.setMode(this.mode, false);
    }
    own(e) { try { return e.composedPath().includes(this.host); } catch { return false; } }

    _card(title, open, ...kids) {
      return h('details', { class: 'card', open: open || null }, h('summary', { text: title }), h('div', { class: 'body' }, kids));
    }
    _btn(text, fn, cls = '') { return h('button', { class: 'b ' + cls, type: 'button', onclick: fn }, text); }
    _sw(key, label, onChange) {
      const inp = h('input', { type: 'checkbox' });
      inp.checked = !!this.ctx.settings[key];
      inp.addEventListener('change', () => { this.ctx.settings[key] = inp.checked; this.ctx.saveSettings(); if (onChange) onChange(inp.checked); });
      this.el['sw_' + key] = inp;
      return h('label', { class: 'sw' }, inp, h('span', { text: label }));
    }

    _buildPanel() {
      const c = this.ctx, e = this.el;
      e.head = h('div', { class: 'head' },
        h('div', { class: 'brand' }, h('b', null, '♛ ', h('i', { text: 'BYPASS' }), ' KING'), h('small', { text: `ULTIMATE VIP • v${VERSION}` })),
        e.btnMode = h('button', { class: 'ib', type: 'button', title: 'Chuyển Compact / Đầy đủ', onclick: () => this.setMode(this.mode === 'expanded' ? 'compact' : 'expanded') }, '▭'),
        h('button', { class: 'ib', type: 'button', title: 'Thu thành biểu tượng nổi', onclick: () => this.setMode('floating') }, '—'));
      e.dot = h('span', { class: 'dot' });
      e.status = h('span', { text: 'Sẵn sàng' });
      e.bar = h('div', { class: 'bar' }, e.dot, e.status);
      e.toastBox = h('div', { hidden: true });

      /* --- Compact --- */
      e.cKw = h('div', { class: 'mono', text: '—' });
      e.cTimer = h('div', { class: 'timer', text: fmtClock(c.settings.seconds) });
      e.cTimerBtn = this._btn('Start', () => this._timerToggle(), 'sm');
      e.cCode = h('div', { class: 'codebox', text: '—' });
      e.cCopy = this._btn('COPY CODE', () => this._copyBest(), 'sm');
      e.cGoogle = this._btn('Mở Google', () => this._openGoogle(), 'sm');
      e.compact = h('div', { class: 'compact-body' },
        h('div', { class: 'kv' }, h('span', { text: 'Từ khóa' }), e.cKw), e.cGoogle, e.cTimer,
        h('div', { class: 'row' }, e.cTimerBtn, this._btn('Reset', () => c.timer.reset(), 'sm s')), e.cCode, e.cCopy);

      /* --- 3. Task Recognition --- */
      e.tState = h('span', { class: 'chip', text: 'Chưa có' });
      e.tKw = h('span', { class: 'mono', text: '—' });
      e.tMeter = h('i'); e.tConf = h('span', { text: '0%' });
      e.tSrc = h('span', { text: '—' }); e.tKinds = h('span', { text: '—' }); e.tUrls = h('span', { text: '—' });
      e.tChange = this._btn('Đổi từ khóa mới', () => this._say(c.traffic.requestChange()), 's');
      e.ocrFile = h('input', { type: 'file', accept: 'image/*' });
      e.ocrOut = h('textarea', { readonly: true, placeholder: 'Kết quả OCR sẽ hiện ở đây…', rows: 2 });
      e.ocrStat = h('div', { class: 'muted', text: 'Chọn ảnh bạn muốn phân tích (OCR chỉ chạy khi bạn bấm).' });
      e.ocrKw = this._btn('Dùng làm từ khóa', () => this._ocrAsKeyword(), 'sm s');
      e.ocrCode = this._btn('Quét mã từ OCR', () => this._ocrAsCode(), 'sm s');
      const cardTask = this._card('🧠 Nhận diện nhiệm vụ', true,
        h('div', { class: 'kv' }, h('span', { text: 'Trạng thái' }), e.tState),
        h('div', { class: 'kv' }, h('span', { text: 'Từ khóa' }), e.tKw),
        h('div', { class: 'kv' }, h('span', { text: 'Độ tin cậy' }), e.tConf), h('div', { class: 'meter' }, e.tMeter),
        h('div', { class: 'kv' }, h('span', { text: 'Nguồn' }), e.tSrc),
        h('div', { class: 'kv' }, h('span', { text: 'Loại' }), e.tKinds),
        h('div', { class: 'kv' }, h('span', { text: 'URL hiển thị' }), e.tUrls),
        h('div', { class: 'row' }, this._btn('Quét lại', () => this._rescan(), 's'), e.tChange),
        h('div', { class: 'muted', text: 'OCR ảnh nhiệm vụ' }), e.ocrFile,
        h('div', { class: 'row' }, this._btn('OCR file ảnh', () => this._ocrFile(), 's'), this._btn('Chọn ảnh trên trang', () => this._ocrPick(), 's')),
        e.ocrStat, e.ocrOut, h('div', { class: 'row' }, e.ocrKw, e.ocrCode));

      /* --- 4. Smart Traffic --- */
      e.kwIn = h('input', { type: 'text', placeholder: 'Từ khóa nhiệm vụ', maxlength: '60', autocomplete: 'off' });
      e.kwIn.value = c.storage.get('lastKeyword', '');
      e.tgIn = h('input', { type: 'text', placeholder: 'Website đích (vd: example.com)', autocomplete: 'off' });
      e.sInfo = h('div', { class: 'muted', text: 'Chưa có phiên.' });
      const cardTraffic = this._card('🚦 Smart Traffic', true, e.kwIn,
        h('div', { class: 'row' }, this._btn('Mở Google', () => this._openGoogle()), this._btn('Thử lại', () => this._say(c.traffic.retry()), 's')),
        e.tgIn, h('div', { class: 'row' }, this._btn('Xác nhận đích', () => this._say(c.traffic.confirmTarget(e.tgIn.value)), 's'), e.useHere = this._btn('Đặt trang này', () => this._say(c.traffic.useThisPage()), 's')),
        e.sInfo,
        h('div', { class: 'row' }, this._btn('✓ Thành công', () => this._finish('success'), 'sm s'), this._btn('✗ Thất bại', () => this._finish('failed'), 'sm s'), this._btn('Kết thúc', () => this._finish('cancelled'), 'sm d')),
        h('div', { class: 'muted', text: 'Mọi bước do bạn chủ động. Công cụ không click quảng cáo, không giải CAPTCHA, không tạo lượt xem giả.' }));

      /* --- 5. Code Detection --- */
      e.codeMain = h('div', { class: 'codebox', text: '—' });
      e.codeList = h('div', { class: 'list' });
      e.codeIn = h('input', { type: 'text', placeholder: 'Nhập/dán mã thủ công', maxlength: '20', autocomplete: 'off' });
      const cardCode = this._card('🔑 Phát hiện mã', true, e.codeMain,
        h('div', { class: 'row' }, this._btn('COPY CODE', () => this._copyBest()), this._btn('Quét ngay', () => this._scanCode(), 's')),
        e.codeList, e.codeIn, h('div', { class: 'row' }, this._btn('Thêm mã', () => this._addManualCode(), 'sm s'), this._btn('Xóa danh sách', () => this._clearCodes(), 'sm d')),
        h('div', { class: 'muted', text: '"Đã xác nhận" = có nhãn mã rõ ràng và ở đúng trang đích bạn đã xác nhận. "Nghi ngờ" = cần bạn tự kiểm tra.' }));

      /* --- 6. Timer --- */
      e.timer = h('div', { class: 'timer', text: fmtClock(c.settings.seconds) });
      e.tmStart = this._btn('Start', () => c.timer.start());
      e.tmPause = this._btn('Pause', () => c.timer.pause(), 's');
      e.tmResume = this._btn('Resume', () => c.timer.resume(), 's');
      e.tmReset = this._btn('Reset', () => c.timer.reset(), 's');
      const cardTimer = this._card('⏱ Đồng hồ', true, e.timer, h('div', { class: 'row' }, e.tmStart, e.tmPause), h('div', { class: 'row' }, e.tmResume, e.tmReset),
        h('div', { class: 'muted', text: 'Hết giờ chỉ thông báo cho bạn; không tự gửi yêu cầu nào.' }));

      /* --- 7. Link Manager --- */
      e.urlIn = h('input', { type: 'url', placeholder: 'https://…', autocomplete: 'off' });
      const cardLink = this._card('🔗 Quản lý link', false, e.urlIn,
        h('div', { class: 'row' }, this._btn('Mở link', () => this._openUrl(), 's'), this._btn('Lưu link', () => this._saveUrl()), this._btn('Dán', () => this._pasteUrl(), 's')));

      /* --- 8. History --- */
      e.hQ = h('input', { type: 'search', placeholder: 'Tìm lịch sử…', autocomplete: 'off' });
      e.hF = h('select', null, h('option', { value: 'all', text: 'Tất cả' }), h('option', { value: 'success', text: 'Thành công' }), h('option', { value: 'failed', text: 'Thất bại' }), h('option', { value: 'pending', text: 'Đang chờ' }));
      e.hQ.addEventListener('input', () => this.renderHistory()); e.hF.addEventListener('change', () => this.renderHistory());
      e.hList = h('div', { class: 'list' });
      const cardHist = this._card('🕘 Lịch sử nhiệm vụ', false, e.hQ, e.hF, e.hList,
        this._btn('Xóa lịch sử', () => { if (confirm('Xóa toàn bộ lịch sử?')) { c.history.clear(); this.renderHistory(); } }, 'sm d'));

      /* --- 9. Settings --- */
      e.setSec = h('input', { type: 'number', min: '5', max: '3600', inputmode: 'numeric' });
      e.setSec.value = c.settings.seconds;
      e.setSec.addEventListener('change', () => { c.settings.seconds = clamp(Math.round(Number(e.setSec.value)) || 68, 5, 3600); e.setSec.value = c.settings.seconds; c.saveSettings(); if (c.timer.s.status === 'idle') c.timer.reset(); });
      const sel = (key, opts, after) => { const s = h('select', null, opts.map(([v, t]) => h('option', { value: v, text: t }))); s.value = String(c.settings[key]); s.addEventListener('change', () => { c.settings[key] = typeof DEFAULTS[key] === 'number' ? Number(s.value) : s.value; c.saveSettings(); if (after) after(); }); return s; };
      const cardSet = this._card('⚙ Cài đặt', false,
        h('div', { class: 'kv' }, h('span', { text: 'Thời gian (giây)' }), e.setSec),
        this._sw('ocr', 'Bật OCR'), this._sw('autoSave', 'Tự lưu link nhiệm vụ'),
        this._sw('taskRecognition', 'Nhận diện nhiệm vụ', on => { on ? c.task.start() : c.task.stop(); }),
        this._sw('codeWatch', 'Theo dõi mã', on => { on ? c.code.start() : c.code.stop(); }),
        this._sw('notify', 'Thông báo'), this._sw('autoKeyword', 'Gợi ý đổi từ khóa khi không đọc được (vẫn cần bạn bấm)'),
        h('div', { class: 'kv' }, h('span', { text: 'Ngôn ngữ OCR' }), sel('ocrLang', [['eng', 'English (nhẹ)'], ['eng+vie', 'English + Việt (nặng)']])),
        h('div', { class: 'kv' }, h('span', { text: 'Màu nhấn' }), sel('accent', [['gold', 'Vàng'], ['emerald', 'Lục'], ['sky', 'Lam'], ['rose', 'Hồng']], () => this.applyTheme())),
        h('div', { class: 'kv' }, h('span', { text: 'Cỡ chữ' }), sel('fontScale', [[0.9, 'Nhỏ'], [1, 'Vừa'], [1.15, 'Lớn']], () => this.applyTheme())),
        h('div', { class: 'kv' }, h('span', { text: 'Độ mờ' }), sel('opacity', [[0.8, '80%'], [0.9, '90%'], [0.97, '97%'], [1, '100%']], () => this.applyTheme())),
        h('div', { class: 'row' }, this._btn('Khôi phục mặc định', () => this._resetSettings(), 'sm d'), this._btn('Đặt lại vị trí', () => { this.pos = {}; c.storage.set('pos', {}); this._place(); }, 'sm s')));

      e.full = h('div', { class: 'scroll' }, cardTask, cardTraffic, cardCode, cardTimer, cardLink, cardHist, cardSet);
      e.scrollBox = e.full;
      this.panel.append(e.head, e.bar, e.toastBox, e.compact, e.full);
    }

    /* ---------- chế độ / vị trí ---------- */
    setMode(mode, save = true) {
      this.mode = mode;
      if (save) { this.ctx.storage.set('mode', mode); }
      if (mode !== 'floating') this.ctx.storage.set('lastOpenMode', mode);
      const fl = mode === 'floating';
      this.panel.hidden = fl; this.fab.hidden = !fl;
      this.panel.classList.toggle('m-compact', mode === 'compact');
      this.el.compact.hidden = mode !== 'compact'; this.el.full.hidden = mode !== 'expanded';
      this.el.btnMode.textContent = mode === 'compact' ? '▣' : '▭';
      if (!fl) this._badge(0);
      requestAnimationFrame(() => this._place());
    }
    toggle() { this.setMode(this.mode === 'floating' ? this.ctx.storage.get('lastOpenMode', 'expanded') : 'floating'); }
    _place() {
      const el = this.mode === 'floating' ? this.fab : this.panel;
      const key = this.mode === 'floating' ? 'float' : 'panel';
      if (el.hidden) return;
      const rect = el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight, p = this.pos[key];
      const r = clamp(p ? p.r : 8, 4, Math.max(4, W - rect.width - 4));
      const b = clamp(p ? p.b : 8, 4, Math.max(4, H - rect.height - 4));
      Object.assign(el.style, { right: r + 'px', bottom: b + 'px', left: 'auto', top: 'auto' });
    }
    _drag(handle, el, key, onTap) {
      let st = null;
      handle.addEventListener('pointerdown', ev => {
        if (ev.button > 0 || (handle !== el && ev.target.closest && ev.target.closest('button'))) return;
        const rc = el.getBoundingClientRect();
        st = { x: ev.clientX, y: ev.clientY, r: window.innerWidth - rc.right, b: window.innerHeight - rc.bottom, moved: false };
        try { handle.setPointerCapture(ev.pointerId); } catch { /* bỏ qua */ }
      });
      handle.addEventListener('pointermove', ev => {
        if (!st) return;
        const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
        if (!st.moved && Math.hypot(dx, dy) > 6) st.moved = true;
        if (!st.moved) return;
        this.pos[key] = { r: st.r - dx, b: st.b - dy };
        this._place();
      });
      const up = () => {
        if (!st) return;
        if (st.moved) { const rc = el.getBoundingClientRect(); this.pos[key] = { r: window.innerWidth - rc.right, b: window.innerHeight - rc.bottom }; this.ctx.storage.set('pos', this.pos); }
        else if (onTap) onTap();
        st = null;
      };
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', () => { st = null; });
    }
    applyTheme() {
      const s = this.ctx.settings;
      for (const t of [this.panel, this.fab]) {
        t.style.setProperty('--a', ACCENTS[s.accent] || ACCENTS.gold);
        t.style.setProperty('--fs', String(s.fontScale));
        t.style.setProperty('--op', String(clamp(Number(s.opacity) || 0.97, 0.6, 1)));
      }
      requestAnimationFrame(() => this._place());
    }

    /* ---------- thông báo / trạng thái ---------- */
    setStatus(msg, level = 'ok') {
      this.el.status.textContent = SecurityManager.cleanText(msg, 140);
      this.el.dot.className = 'dot' + (level === 'warn' ? ' warn' : level === 'err' ? ' err' : '');
    }
    toast(msg, level = 'info', action = null) {
      const box = this.el.toastBox; clearTimeout(this.toastT);
      box.replaceChildren(h('div', { class: 'toast ' + level }, h('span', { text: SecurityManager.cleanText(msg, 220) }),
        action ? this._btn(action.label, () => { box.hidden = true; action.fn(); }, 'sm') : null,
        h('button', { class: 'ib', type: 'button', style: 'width:24px;height:24px', onclick: () => { box.hidden = true; } }, '×')));
      box.hidden = false;
      this.toastT = setTimeout(() => { box.hidden = true; }, action ? 12000 : 6000);
      this.setStatus(msg, level === 'err' ? 'err' : level === 'warn' ? 'warn' : 'ok');
    }
    _say(r) { if (r) this.toast(r.msg, r.ok ? 'ok' : 'warn'); }
    _badge(n) { this.el.badge.hidden = !n; this.el.badge.textContent = n ? String(n) : ''; }

    /* ---------- hành động ---------- */
    _openGoogle() { this._say(this.ctx.traffic.begin(this.el.kwIn.value)); }
    _rescan() { const i = this.ctx.task.scan(); if (!i || !i.keyword) this.toast('Không nhận diện được nhiệm vụ. Hãy nhập từ khóa thủ công hoặc dùng OCR.', 'warn'); else this.toast('Đã nhận diện: ' + i.keyword + ` (${i.confidence}%)`, 'ok'); }
    _scanCode() { this.ctx.code.scan(); this.toast(this.ctx.code.list.length ? 'Đã quét xong. Xem danh sách mã bên dưới.' : 'Chưa thấy mã có nhãn rõ ràng. Bạn có thể nhập thủ công.', this.ctx.code.list.length ? 'ok' : 'warn'); }
    _timerToggle() { const t = this.ctx.timer; const s = t.s.status; if (s === 'running') t.pause(); else if (s === 'paused') t.resume(); else t.start(); }
    _finish(status) {
      const ok = this.ctx.traffic.end(status, status === 'success' ? 'Người dùng xác nhận thành công' : status === 'failed' ? 'Người dùng đánh dấu thất bại' : 'Kết thúc phiên');
      this.toast(ok ? 'Đã cập nhật phiên.' : 'Chưa có phiên nào.', ok ? 'ok' : 'warn'); this.renderHistory();
    }
    async _copy(text) {
      if (!text) return false;
      try { GM_setClipboard(text, 'text'); return true; } catch { /* thử cách khác */ }
      try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
    }
    async _copyBest() {
      const b = this.ctx.code.best();
      if (!b) return this.toast('Chưa có mã để copy.', 'warn');
      this.toast((await this._copy(b.value)) ? 'Đã copy mã: ' + b.value : 'Không copy được, hãy chép tay.', 'ok');
    }
    _addManualCode() {
      const ok = this.ctx.code.addManual(this.el.codeIn.value);
      this.toast(ok ? 'Đã thêm mã.' : 'Mã không đúng định dạng (4–20 ký tự chữ/số/gạch nối, có chữ số).', ok ? 'ok' : 'warn');
      if (ok) this.el.codeIn.value = '';
    }
    _clearCodes() { if (confirm('Xóa danh sách mã?')) this.ctx.code.clear(); }
    _openUrl() { const ok = SecurityManager.openTab(this.el.urlIn.value); this.toast(ok ? 'Đã mở link.' : 'Link không hợp lệ (chỉ nhận http/https).', ok ? 'ok' : 'warn'); }
    _saveUrl() {
      const it = this.ctx.history.upsert({ url: this.el.urlIn.value, note: 'Link thủ công' });
      this.toast(it ? 'Đã lưu link (không trùng lặp).' : 'Link không hợp lệ.', it ? 'ok' : 'warn'); this.renderHistory();
    }
    async _pasteUrl() { try { this.el.urlIn.value = (await navigator.clipboard.readText()).trim().slice(0, 2000); } catch { this.toast('Trình duyệt không cho đọc clipboard, hãy dán thủ công.', 'warn'); } }
    _resetSettings() {
      if (!confirm('Khôi phục toàn bộ cài đặt mặc định?')) return;
      Object.assign(this.ctx.settings, DEFAULTS); this.ctx.saveSettings();
      for (const k of Object.keys(DEFAULTS)) { const cb = this.el['sw_' + k]; if (cb) cb.checked = !!DEFAULTS[k]; }
      this.el.setSec.value = DEFAULTS.seconds; this.applyTheme();
      this.ctx.task.start(); this.ctx.code.start(); this.ctx.timer.reset();
      this.toast('Đã khôi phục. Các ô chọn màu/cỡ chữ sẽ cập nhật khi mở lại bảng.', 'ok');
    }
    async _runOcr(src) {
      const e = this.el; e.ocrStat.textContent = 'Đang xử lý…'; e.ocrOut.value = '';
      try {
        const r = await this.ctx.ocr.run(src, m => { if (m && m.status) e.ocrStat.textContent = `${m.status}${m.progress ? ' ' + Math.round(m.progress * 100) + '%' : ''}`; });
        this.ocrResult = r;
        e.ocrOut.value = r.text;
        e.ocrStat.textContent = r.text ? `Xong • độ tin cậy OCR ${r.confidence}%` : 'Không đọc được chữ trong ảnh.';
      } catch (err) { this.ocrResult = null; e.ocrStat.textContent = 'OCR lỗi: ' + SecurityManager.cleanText(err && err.message, 160); }
    }
    _ocrFile() { const f = this.el.ocrFile.files && this.el.ocrFile.files[0]; if (!f) return this.toast('Hãy chọn một ảnh trước.', 'warn'); if (!/^image\//.test(f.type) || f.size > 12e6) return this.toast('Chỉ nhận ảnh dưới 12MB.', 'warn'); this._runOcr(f); }
    async _ocrPick() {
      this.el.ocrStat.textContent = 'Chạm vào ảnh trên trang (Esc để hủy)…';
      try { const img = await this.ctx.ocr.pick(ev => this.own(ev)); await this._runOcr(img); }
      catch (err) { this.el.ocrStat.textContent = SecurityManager.cleanText(err && err.message, 160); }
    }
    _ocrAsKeyword() {
      const r = this.ocrResult; if (!r || !r.text) return this.toast('Chưa có kết quả OCR.', 'warn');
      const line = r.text.split(/\n+/).map(x => SecurityManager.cleanKeyword(x)).find(x => x && SecurityManager.keywordOk(x));
      if (!line) return this.toast('OCR không cho ra từ khóa hợp lệ. Hãy nhập tay.', 'warn');
      this.el.kwIn.value = line; this.toast(`Đã điền từ khóa "${line}" (OCR ${r.confidence}%). Hãy kiểm tra trước khi mở Google.`, 'ok');
    }
    _ocrAsCode() {
      const r = this.ocrResult; if (!r || !r.text) return this.toast('Chưa có kết quả OCR.', 'warn');
      const out = this.ctx.code.fromText(r.text, 'OCR');
      this.toast(out.length ? `OCR tìm thấy ${out.length} ứng viên mã (nghi ngờ – hãy kiểm tra).` : 'Không thấy mã có nhãn rõ ràng trong ảnh.', out.length ? 'ok' : 'warn');
    }

    /* ---------- render ---------- */
    renderTask(i) {
      const e = this.el;
      if (!i) return;
      const map = { none: ['Chưa có', ''], new: ['Mới', 'info'], running: ['Đang chạy', 'warn'], done: ['Đã hoàn thành', 'ok'] };
      const [t, cls] = map[i.state] || map.none;
      e.tState.textContent = t; e.tState.className = 'chip ' + cls;
      e.tKw.textContent = i.keyword || (i.imageHint ? '(trong ảnh)' : '—');
      e.cKw.textContent = e.kwIn.value || i.keyword || '—';
      const lvl = i.confidence >= 80 ? 'cao' : i.confidence >= 55 ? 'trung bình' : i.confidence > 0 ? 'thấp' : '—';
      e.tConf.textContent = i.confidence ? `${i.confidence}% (${lvl})` : '0%'; e.tMeter.style.width = i.confidence + '%';
      e.tSrc.textContent = i.source || '—'; e.tKinds.textContent = i.kinds.join(', ') || '—';
      e.tUrls.textContent = i.urls.length ? i.urls.map(u => { try { return new URL(u).hostname; } catch { return ''; } }).join(', ') + ' (cần bạn xác nhận)' : '—';
      e.tChange.disabled = !i.hasChangeBtn;
      if (i.keyword && this.shadow.activeElement !== e.kwIn && (!e.kwIn.value || e.kwIn.dataset.auto === '1')) { e.kwIn.value = i.keyword; e.kwIn.dataset.auto = '1'; e.cKw.textContent = i.keyword; }
    }
    renderTraffic() {
      const e = this.el, s = this.ctx.traffic.session;
      e.useHere.hidden = IS_GT || IS_GOOGLE;
      if (!s) { e.sInfo.textContent = 'Chưa có phiên.'; return; }
      if (s.targetHost && document.activeElement !== e.tgIn && this.shadow.activeElement !== e.tgIn) e.tgIn.value = s.targetHost;
      const st = { active: 'đang chạy', success: 'thành công', failed: 'thất bại', cancelled: 'đã kết thúc', expired: 'hết hạn' }[s.status] || s.status;
      e.sInfo.textContent = `Phiên: ${st} • lần ${s.attempts} • bắt đầu ${fmtDate(s.startedAt)}` + (s.targetHost ? ` • đích: ${s.targetHost}` + (s.targetSeenAt ? ' (đã vào)' : '') : ' • chưa xác nhận đích') +
        (s.finishedAt ? ` • ${fmtDur(s.finishedAt - s.startedAt)}` : '');
    }
    renderCodes(fresh) {
      const e = this.el, list = this.ctx.code.list, best = this.ctx.code.best();
      e.codeMain.textContent = best ? best.value : '—'; e.cCode.textContent = best ? best.value : '—';
      e.codeList.replaceChildren(...list.slice(0, 12).map(x => h('div', { class: 'item' },
        h('div', { class: 'row' }, h('span', { class: 'mono', text: x.value }), h('span', { class: 'chip ' + (x.state === 'confirmed' ? 'ok' : 'warn'), text: x.state === 'confirmed' ? 'Đã xác nhận' : 'Nghi ngờ' })),
        h('small', { text: `${x.host} • ${x.source} • ${fmtDate(x.time)}` }),
        h('div', { class: 'row' }, this._btn('Copy', async () => this.toast((await this._copy(x.value)) ? 'Đã copy ' + x.value : 'Không copy được.', 'ok'), 'sm'),
          x.state !== 'confirmed' ? this._btn('Xác nhận', () => this.ctx.code.confirm(x.value), 'sm s') : null))));
      if (!list.length) e.codeList.replaceChildren(h('div', { class: 'muted', text: 'Chưa có mã nào.' }));
      if (fresh && this.mode === 'floating') this._badge(1);
    }
    renderTimer(t) {
      const e = this.el, txt = fmtClock(Math.max(0, t.remaining));
      e.timer.textContent = txt; e.cTimer.textContent = txt;
      e.fabTime.textContent = t.status === 'running' || t.status === 'paused' ? txt : '';
      const run = t.status === 'running', pau = t.status === 'paused';
      e.tmStart.disabled = run; e.tmPause.disabled = !run; e.tmResume.disabled = !pau; e.tmReset.disabled = t.status === 'idle';
      e.cTimerBtn.textContent = run ? 'Pause' : pau ? 'Resume' : 'Start';
      e.timer.style.opacity = t.status === 'finished' ? '.6' : '1';
    }
    renderHistory() {
      const e = this.el, c = this.ctx;
      const items = c.history.list({ status: e.hF.value, q: e.hQ.value }).slice(0, 50);
      if (!items.length) { e.hList.replaceChildren(h('div', { class: 'muted', text: 'Không có mục nào.' })); return; }
      const lab = { success: ['Thành công', 'ok'], failed: ['Thất bại', 'err'], pending: ['Đang chờ', 'warn'] };
      e.hList.replaceChildren(...items.map(x => {
        const [lt, lc] = lab[x.status] || lab.pending;
        return h('div', { class: 'item' },
          h('div', { class: 'row' }, h('span', { class: 'chip ' + lc, text: lt }), h('span', { class: 'mono', text: x.keyword || '—' })),
          h('div', { text: x.url }),
          h('small', { text: `${fmtDate(x.createdAt)}${x.duration ? ' • ' + fmtDur(x.duration) : ''}${x.attempts ? ' • ' + x.attempts + ' lần' : ''}${x.note ? ' • ' + x.note : ''}` }),
          h('div', { class: 'row' },
            this._btn('Mở', () => { const ok = SecurityManager.openTab(x.url); if (!ok) this.toast('Link không hợp lệ.', 'warn'); }, 'sm s'),
            this._btn('✓', () => { c.history.finish(x.id, 'success', 'Đánh dấu thủ công'); this.renderHistory(); }, 'sm s'),
            this._btn('✗', () => { c.history.finish(x.id, 'failed', 'Đánh dấu thủ công'); this.renderHistory(); }, 'sm s'),
            this._btn('Xóa', () => { c.history.remove(x.id); this.renderHistory(); }, 'sm d')));
      }));
    }
    destroy() { window.removeEventListener('resize', this.onResize); clearTimeout(this.toastT); if (this.host) this.host.remove(); }
  }

  /* =====================================================================
   * 12. KHỞI ĐỘNG – nối các module, đồng bộ đa tab, dọn dẹp
   * ===================================================================== */
  function main() {
    const storage = new StorageManager();
    storage.migrate();

    // Menu Violentmonkey (đăng ký trên mọi trang để có đường dự phòng trên điện thoại)
    try {
      GM_registerMenuCommand('BYPASS KING: đặt trang này làm trang đích', () => {
        const s = storage.get('session', null);
        if (s && s.status === 'active') { s.targetHost = HOST.replace(/^www\./, '').toLowerCase(); s.targetUrl = location.href; storage.set('session', s); location.reload(); }
        else alert('Chưa có phiên đang chạy. Hãy bấm "Mở Google" trên trang nhiệm vụ GTraffic trước.');
      });
    } catch { /* bỏ qua */ }

    // Trang ngoài GTraffic: chỉ chạy khi có phiên đang hoạt động và đúng trang liên quan -> không tốn RAM ở nơi khác
    if (!IS_GT) {
      const s = storage.get('session', null);
      if (!(s && s.status === 'active' && now() - s.startedAt < SESSION_TTL)) return;
      if (!IS_GOOGLE) {
        let refHost = '';
        try { refHost = new URL(document.referrer).hostname; } catch { /* không có referrer */ }
        if (s.targetHost) { if (!SecurityManager.hostMatches(HOST, s.targetHost)) return; }
        else if (s.landingHost) { if (!SecurityManager.hostMatches(HOST, s.landingHost)) return; }
        else if (/(^|\.)google\./i.test(refHost)) { s.landingHost = HOST; storage.set('session', s); }
        else return;
      }
    }

    const saved = storage.get('settings', {}) || {};
    const settings = { ...DEFAULTS, ...saved };
    settings.seconds = clamp(Math.round(Number(settings.seconds)) || 68, 5, 3600);
    if (!ACCENTS[settings.accent]) settings.accent = 'gold';
    settings.fontScale = [0.9, 1, 1.15].includes(Number(settings.fontScale)) ? Number(settings.fontScale) : 1;
    settings.opacity = clamp(Number(settings.opacity) || 0.97, 0.6, 1);

    const ctx = { storage, settings, watcher: new PageWatcher(), history: new HistoryManager(storage) };
    ctx.saveSettings = () => storage.set('settings', { ...settings });
    ctx.notify = new NotificationManager(settings);
    ctx.traffic = new TrafficManager(ctx);
    ctx.task = new TaskRecognitionEngine(ctx);
    ctx.code = new CodeDetectionEngine(ctx);
    ctx.ocr = new OCRManager(ctx);
    ctx.ui = new UIManager(ctx);
    ctx.timer = null;

    let autoAsked = false;
    ctx.refresh = () => { ctx.ui.renderTraffic(); ctx.ui.renderHistory(); };
    ctx.onTimer = t => ctx.ui.renderTimer(t);
    ctx.onCodes = (fresh, rec) => {
      ctx.ui.renderCodes(fresh);
      if (fresh && rec) {
        const label = rec.state === 'confirmed' ? 'ĐÃ XÁC NHẬN' : 'NGHI NGỜ';
        ctx.notify.toast(`Phát hiện mã: ${rec.value} (${label})`, rec.state === 'confirmed' ? 'ok' : 'warn');
        ctx.notify.system('BYPASS KING – phát hiện mã', `${rec.value} (${label})`);
      }
    };
    ctx.onTaskInfo = (info, prev) => {
      ctx.ui.renderTask(info);
      if (info.outcome) ctx.traffic.applyOutcome(info.outcome);
      if (info.taskId && (!prev || prev.taskId !== info.taskId)) {
        if (info.state === 'new') {
          ctx.notify.toast(`Phát hiện nhiệm vụ mới: "${info.keyword}" (tin cậy ${info.confidence}%)`, 'ok');
          ctx.notify.system('BYPASS KING', `Nhiệm vụ mới: ${info.keyword}`);
        }
        if (settings.autoSave && IS_GT) { ctx.history.upsert({ url: location.href, keyword: info.keyword, taskId: info.taskId }); ctx.ui.renderHistory(); }
      }
      if (!info.keyword) {
        ctx.ui.setStatus(info.imageHint ? 'Từ khóa nằm trong ảnh – hãy dùng OCR hoặc nhập thủ công' : 'Chưa nhận diện được nhiệm vụ – có thể nhập thủ công', 'warn');
        if (settings.autoKeyword && info.hasChangeBtn && !autoAsked) {
          autoAsked = true;
          ctx.notify.toast('Không đọc được từ khóa. Đổi từ khóa mới?', 'warn', { label: 'Đổi', fn: () => ctx.ui._say(ctx.traffic.requestChange()) });
        }
      } else autoAsked = false;
    };
    ctx.notify.setSink((m, l, a) => ctx.ui.toast(m, l, a));

    ctx.ui.mount();
    ctx.timer = new TimerManager(ctx);
    ctx.ui.renderHistory(); ctx.ui.renderCodes(false); ctx.ui.renderTraffic();
    ctx.traffic.trackTarget();
    if (settings.taskRecognition) ctx.task.start();
    if (settings.codeWatch) ctx.code.start();
    try { GM_registerMenuCommand('BYPASS KING: hiện/ẩn bảng', () => ctx.ui.toggle()); } catch { /* bỏ qua */ }

    // Đồng bộ giữa các tab (trang nhiệm vụ <-> trang đích)
    const ids = [];
    const listen = (key, fn) => {
      try { ids.push(GM_addValueChangeListener(NS + key, (n, o, v, remote) => { if (remote) fn(v); })); } catch { /* bỏ qua */ }
    };
    listen('session', () => { ctx.traffic.reload(); ctx.ui.renderTraffic(); });
    listen('timer', () => { if (ctx.timer) ctx.timer.load(); });
    listen('codes', () => { ctx.code.reload(); ctx.ui.renderCodes(false); });
    listen('history', () => { ctx.history.reload(); ctx.ui.renderHistory(); });

    // Dọn dẹp: không để lại observer/interval/listener
    window.addEventListener('pagehide', e => {
      ctx.watcher.destroy(); if (ctx.timer) ctx.timer.destroy(); ctx.ui.destroy();
      for (const id of ids) { try { GM_removeValueChangeListener(id); } catch { /* bỏ qua */ } }
      if (e.persisted) window.addEventListener('pageshow', () => location.reload(), { once: true });
    }, { once: true });
  }

  /*TEST_EXPORT*/
  try { main(); } catch (err) { console.error('[BYPASS KING] lỗi khởi động:', err); }
})();
