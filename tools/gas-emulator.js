/*
 * Локальный эмулятор Google Apps Script для проверки apps-script/Code.gs без настоящей таблицы.
 * Запуск: node tools/gas-emulator.js [порт]  (по умолчанию 8791)
 * POST /exec  - как веб-приложение Apps Script (doPost)
 * GET  /__state, /__mail, /__fetch - что записано в «таблицу», какие письма и запросы ушли
 * POST /__reset - очистить; POST /__mailfail?on=1 - имитировать сбой почты; POST /__run?fn=retryNotifications
 */
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const crypto = require('crypto');

const PORT = Number(process.argv[2] || 8791);
const CODE = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8')
  .replace(/var SECRET = '[^']*';/, "var SECRET = 'dev-secret';");

let state;
function reset() {
  state = { sheets: {}, books: {}, props: {}, cache: {}, mail: [], fetch: [], files: {}, mailFail: false, fetchStatus: 200, triggers: [], th: { posts: [], containers: {}, seq: 0, fail: '' } };
}
reset();

function pad(rows, r, c) {
  while (rows.length < r) rows.push([]);
  rows.forEach((row) => { while (row.length < c) row.push(''); });
}

class Range {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr: nr || 1, nc: nc || 1 }); }
  getValues() {
    const out = [];
    for (let i = 0; i < this.nr; i++) {
      const row = [];
      for (let j = 0; j < this.nc; j++) {
        const v = (this.sheet.rows[this.r - 1 + i] || [])[this.c - 1 + j];
        row.push(v === undefined ? '' : v);
      }
      out.push(row);
    }
    return out;
  }
  getValue() { return this.getValues()[0][0]; }
  setValues(vals) {
    pad(this.sheet.rows, this.r - 1 + vals.length, this.c - 1 + vals[0].length);
    vals.forEach((row, i) => row.forEach((v, j) => {
      // как Sheets: апостроф в начале значит «текст», в ячейке хранится без него
      this.sheet.rows[this.r - 1 + i][this.c - 1 + j] = typeof v === 'string' && v[0] === "'" ? v.slice(1) : v;
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  setNumberFormat() { return this; }
  setWrap() { return this; }
  setVerticalAlignment() { return this; }
  insertCheckboxes() { const v = []; for (let i = 0; i < this.nr; i++) { v.push(Array(this.nc).fill(false)); } return this.setValues(v); }
  setFormulas(f) { return this.setValues(f); }
  setFontWeight() { return this; }
  setBackground() { return this; }
}

class Sheet {
  constructor(name, bookId) { this.name = name; this.rows = []; this.bookId = bookId; }
  setName(n) { this.name = n; return this; }
  setColumnWidth() { return this; }
  getLastRow() { let n = this.rows.length; while (n > 0 && this.rows[n - 1].every((v) => v === '' || v === undefined)) n--; return n; }
  getLastColumn() { return Math.max(0, ...this.rows.map((r) => r.length)); }
  getRange(r, c, nr, nc) { return new Range(this, r, c, nr, nc); }
  getDataRange() { return new Range(this, 1, 1, Math.max(this.getLastRow(), 1), Math.max(this.getLastColumn(), 1)); }
  setFrozenRows() {}
  setColumnWidths() {}
  deleteRow(n) { this.rows.splice(n - 1, 1); }
  getParent() { return { getUrl: () => 'https://docs.google.com/spreadsheets/d/' + (this.bookId || 'emulator') }; }
}

function book(id) {
  const b = state.books[id];
  return {
    getId: () => id,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
    getSheets: () => b.sheets,
    getSheetByName: (n) => b.sheets.find((x) => x.name === n) || null,
    insertSheet: (n) => { const sh = new Sheet(n, id); b.sheets.push(sh); return sh; }
  };
}

function pad2(n) { return String(n).padStart(2, '0'); }
function formatDate(d, tz, fmt) {
  const offset = tz === 'UTC' || tz === 'GMT' ? 0 : 5 * 60; // Asia/Almaty = UTC+5
  const t = new Date(d.getTime() + offset * 60000);
  const map = {
    yyyy: t.getUTCFullYear(), MM: pad2(t.getUTCMonth() + 1), dd: pad2(t.getUTCDate()),
    HH: pad2(t.getUTCHours()), mm: pad2(t.getUTCMinutes()), ss: pad2(t.getUTCSeconds())
  };
  return fmt.replace(/'([^']*)'|yyyy|MM|dd|HH|mm|ss/g, (m, lit) => (lit !== undefined ? lit : map[m]));
}

const sandbox = {
  console,
  SpreadsheetApp: {
    openById: (id) => (state.books[id] ? book(id) : {
      getSheetByName: (n) => state.sheets[n] || null,
      insertSheet: (n) => (state.sheets[n] = new Sheet(n)),
      getUrl: () => 'https://docs.google.com/spreadsheets/d/emulator'
    }),
    create: (name) => {
      const id = 'book-' + crypto.randomUUID();
      state.books[id] = { name, sheets: [new Sheet('Лист1', id)] };
      return book(id);
    }
  },
  LockService: { getScriptLock: () => ({ waitLock() {}, tryLock() { return true; }, releaseLock() {} }) },
  CacheService: {
    getScriptCache: () => ({
      get: (k) => (state.cache[k] && state.cache[k].exp > Date.now() ? state.cache[k].v : null),
      put: (k, v, ttl) => { state.cache[k] = { v: String(v), exp: Date.now() + (ttl || 600) * 1000 }; },
      remove: (k) => { delete state.cache[k]; }
    })
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (k in state.props ? state.props[k] : null),
      setProperty: (k, v) => { state.props[k] = String(v); },
      setProperties: (o) => { Object.keys(o).forEach((k) => { state.props[k] = String(o[k]); }); },
      deleteProperty: (k) => { delete state.props[k]; }
    })
  },
  Utilities: {
    formatDate,
    getUuid: () => crypto.randomUUID(),
    base64Decode: (s) => Array.from(Buffer.from(s, 'base64')),
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    newBlob: (bytes, mime, name) => ({ bytes, mime, name })
  },
  MailApp: {
    sendEmail: (m) => { if (state.mailFail) throw new Error('Service invoked too many times: email'); state.mail.push(m); },
    getRemainingDailyQuota: () => 100
  },
  UrlFetchApp: {
    fetch: (url, opts) => {
      state.fetch.push({ url, opts });
      return { getResponseCode: () => state.fetchStatus, getContentText: () => (state.fetchStatus === 200 ? '{"ok":true}' : '{"error":"fail"}') };
    },
    getRequest: () => ({})
  },
  DriveApp: {
    createFolder: () => ({ getId: () => 'folder1' }),
    getFolderById: () => ({
      createFile: (blob) => { const id = 'drv-' + crypto.randomUUID(); state.files[id] = blob; return { getId: () => id }; }
    }),
    getFileById: (id) => ({ getBlob: () => ({ getBytes: () => state.files[id].bytes }), setTrashed: () => { delete state.files[id]; } })
  },
  ContentService: {
    MimeType: { JSON: 'json' },
    createTextOutput: (s) => ({ s, setMimeType() { return this; } })
  },
  ScriptApp: {
    getProjectTriggers: () => state.triggers,
    newTrigger: (fn) => ({ timeBased: () => ({ everyMinutes: () => ({ create: () => state.triggers.push({ getHandlerFunction: () => fn }) }) }) })
  },
  Logger: { log: (...a) => console.log(...a) }
};
vm.createContext(sandbox);
vm.runInContext(CODE, sandbox, { filename: 'Code.gs' });

function send(res, code, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
  res.end(b);
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const u = new URL(req.url, 'http://x');
    if (u.pathname.startsWith('/__th/')) {
      // Заглушка Threads API (graph.threads.com) для локальной проверки бота
      const p = u.pathname.slice(5);
      const q = Object.fromEntries(new URLSearchParams(req.method === 'POST' ? body : u.search.slice(1)));
      state.fetch.push({ url: '/__th' + p, method: req.method, params: q });
      const T = state.th;
      if (T.fail && p.includes(T.fail)) return send(res, 400, { error: { message: 'mock failure ' + T.fail } });
      if (p === '/oauth/access_token') return send(res, 200, { access_token: 'short-tok', user_id: '777' });
      if (p === '/access_token') return send(res, 200, { access_token: 'long-tok', expires_in: 5184000 });
      if (p === '/refresh_access_token') return send(res, 200, { access_token: 'long-tok-2', expires_in: 5184000 });
      if (p === '/v1.0/me') return send(res, 200, { id: '777', username: 'tmk.tech' });
      let m = p.match(/^\/v1\.0\/777\/threads$/);
      if (m && req.method === 'POST') { const id = 'c' + (++T.seq); T.containers[id] = q.text; return send(res, 200, { id }); }
      if (m) return send(res, 200, { data: T.posts.slice().reverse().slice(0, Number(q.limit || 10)) });
      if (p === '/v1.0/777/threads_publish') {
        const id = 'm' + (++T.seq); T.posts.push({ id, text: T.containers[q.creation_id], permalink: 'https://www.threads.com/@tmk.tech/post/' + id });
        return send(res, 200, { id });
      }
      m = p.match(/^\/v1\.0\/(c\d+)$/);
      if (m) return send(res, 200, { status: 'FINISHED' });
      m = p.match(/^\/v1\.0\/(m\d+)$/);
      if (m) return send(res, 200, { permalink: 'https://www.threads.com/@tmk.tech/post/' + m[1] });
      return send(res, 404, { error: { message: 'unknown ' + p } });
    }
    if (u.pathname === '/__thcell') {
      // Правка ячейки в таблице постов (как руками в Google Таблице): ?row=2&col=6&v=true
      const id = Object.keys(state.books)[0];
      const sh = state.books[id].sheets[0];
      const v = u.searchParams.get('v');
      sh.getRange(Number(u.searchParams.get('row')), Number(u.searchParams.get('col'))).setValue(v === 'true' ? true : v === 'false' ? false : v);
      return send(res, 200, { ok: true });
    }
    if (u.pathname === '/__thsheet') {
      const id = Object.keys(state.books)[0];
      return send(res, 200, id ? state.books[id].sheets.map((x) => ({ name: x.name, rows: x.rows })) : []);
    }
    if (u.pathname === '/__prop') { state.props[u.searchParams.get('k')] = u.searchParams.get('v'); return send(res, 200, { ok: true }); }
    if (u.pathname === '/__thfail') { state.th.fail = u.searchParams.get('on') || ''; return send(res, 200, { ok: true }); }
    if (u.pathname.startsWith('/__wa/')) {
      // Заглушка WhatsApp-провайдеров для локальной проверки
      state.fetch.push({ url: u.pathname + u.search, method: req.method, body: body, auth: req.headers.authorization || '' });
      return send(res, state.fetchStatus, state.fetchStatus === 200 ? { ok: true } : { error: 'fail' });
    }
    if (u.pathname === '/exec' && req.method === 'POST') {
      const out = sandbox.doPost({ postData: { contents: body } });
      return send(res, 200, JSON.parse(out.s));
    }
    if (u.pathname === '/__state') {
      const sheets = {};
      Object.keys(state.sheets).forEach((n) => { sheets[n] = state.sheets[n].rows; });
      return send(res, 200, { sheets, props: state.props, triggers: state.triggers.length, files: Object.keys(state.files).length });
    }
    if (u.pathname === '/__mail') return send(res, 200, state.mail);
    if (u.pathname === '/__fetch') return send(res, 200, state.fetch);
    if (u.pathname === '/__reset') { reset(); return send(res, 200, { ok: true }); }
    if (u.pathname === '/__mailfail') { state.mailFail = u.searchParams.get('on') === '1'; return send(res, 200, { ok: true }); }
    if (u.pathname === '/__fetchstatus') { state.fetchStatus = Number(u.searchParams.get('code') || 200); return send(res, 200, { ok: true }); }
    if (u.pathname === '/__run') {
      const fn = u.searchParams.get('fn');
      if (!/^(retryNotifications|setup|purgeTestLeads)$/.test(fn)) return send(res, 400, { ok: false });
      sandbox[fn]();
      return send(res, 200, { ok: true });
    }
    if (u.pathname === '/__age') {
      // «Состарить» заявки и задания: сдвигает время создания и следующей попытки в прошлое
      const minutes = Number(u.searchParams.get('min') || 60);
      Object.values(state.sheets).forEach((sh) => sh.rows.forEach((row, i) => {
        if (i === 0) return;
        row.forEach((v, j) => {
          if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v)) {
            row[j] = new Date(new Date(v).getTime() - minutes * 60000).toISOString().replace(/\.\d{3}Z$/, 'Z');
          }
        });
      }));
      return send(res, 200, { ok: true });
    }
    send(res, 404, { ok: false });
  });
}).listen(PORT, '127.0.0.1', () => console.log('GAS emulator on http://127.0.0.1:' + PORT));
