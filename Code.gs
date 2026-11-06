/**
 * Personal Budjet: Telegram Mini App backend (Google Apps Script).
 *
 * Buni ALOHIDA Apps Script loyihasiga joylang (script.google.com, "New project").
 * Botning oʻz Apps Script loyihasiga qoʻshmang: ikkita doPost bir-birini buzadi.
 *
 * Script Properties (Project Settings → Script properties):
 *   BOT_TOKEN        — @BotFather bergan bot tokeni (Mini App shu bot ichida ochiladi)
 *   ALLOWED_USER_ID  — sizning Telegram ID raqamingiz (masalan, @userinfobot koʻrsatadi)
 *   SHEET_ID         — sheet havolasidagi /d/ va /edit orasidagi qism (kodda saqlanmaydi, repo ochiq boʻlgani uchun)
 *   GEMINI_API_KEY   — ovozli kiritish uchun (aistudio.google.com/apikey, bepul). Kerak boʻlmasa qoʻymang.
 *   GEMINI_MODEL     — ixtiyoriy, standart: gemini-flash-latest
 *
 * Deploy → New deployment → Web app:
 *   Execute as: Me    Who has access: Anyone
 * Chiqqan …/exec manzilini index.html dagi API_URL ga qoʻying.
 */

var CFG = {
  OUT: { name: 'Outflow', firstRow: 5, cols: 7 },   // A Date · B Outflow · C Amount · D Payment method · E Rate · F Note · G Exchange-to
  IN: { name: 'Inflow', firstRow: 7, cols: 6 },     // A Date · B Inflow · C Amount · D Payment method · E Rate · F Note
  LIST: 'List of items',                            // A Payment method · B Inflow · C Outflow · D Tip
  BALANCE_RANGE: 'C1:G2',                           // Inflow: 1-qator hamyon nomi, 2-qator qoldiq
  RATE_COL: 12,                                     // Outflow L: sheet hisoblagan joriy kurs
  USD_WALLETS: ['Cash dollar', 'Visa', 'Master card'],
  EXCHANGE: 'Exchange',
  HISTORY_ROWS: 1500,                               // statistika uchun oxirgi qatorlar (~5 oy)
  RECENT: 15,
  BUDGET_RANGE: 'M2:P5',                            // Inflow: byudjet turi · Income · Spent · Balance ($)
  UID_TTL_SEC: 6 * 3600,                            // bir yozuv ikki marta tushmasligi uchun (internet uzilsa)
  MAX_AUTH_AGE_SEC: 24 * 3600,
  GEMINI_MODEL: 'gemini-flash-latest',              // Script property GEMINI_MODEL bilan almashtirsa boʻladi
  RECUR_PROP: 'RECURRING'                           // Script property: qoʻlda qoʻshilgan / olib tashlangan oylik toʻlovlar (JSON, ilova oʻzi yozadi)
};

/* ================= HTTP ================= */

function doPost(e) {
  var out;
  try {
    var req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    auth_(req.initData);
    if (req.action === 'init') out = init_();
    else if (req.action === 'add') out = add_(req.entry || {});
    else if (req.action === 'undo') out = undo_(req.ref || {});
    else if (req.action === 'voice') out = ai_(req, 'voice');
    else if (req.action === 'receipt') out = ai_(req, 'receipt');
    else if (req.action === 'update') out = update_(req.ref || {}, req.entry || {});
    else if (req.action === 'delete') out = delete_(req.ref || {});
    else if (req.action === 'recur') out = recur_(req);
    else throw new Error('Nomaʼlum amal: ' + req.action);
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'personal-budjet-miniapp' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ================= Telegram auth ================= */

function auth_(initData) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('BOT_TOKEN');
  var allowed = props.getProperty('ALLOWED_USER_ID');
  if (!token || !allowed) throw new Error('Apps Script sozlanmagan: BOT_TOKEN va ALLOWED_USER_ID kerak');
  if (!initData || typeof initData !== 'string') throw new Error('Mini App’ni Telegram ichida oching');

  var fields = {}, hash = '';
  initData.split('&').forEach(function (pair) {
    var i = pair.indexOf('=');
    if (i < 0) return;
    var k = decode_(pair.slice(0, i)), v = decode_(pair.slice(i + 1));
    if (k === 'hash') hash = v; else fields[k] = v;
  });
  var check = Object.keys(fields).sort().map(function (k) { return k + '=' + fields[k]; }).join('\n');
  var secret = Utilities.computeHmacSha256Signature(bytes_(token), bytes_('WebAppData'));
  var sig = hex_(Utilities.computeHmacSha256Signature(bytes_(check), secret));
  if (!hash || sig !== hash) throw new Error('Ruxsat yoʻq: Telegram imzosi mos kelmadi');

  var age = Date.now() / 1000 - Number(fields.auth_date || 0);
  if (!(age < CFG.MAX_AUTH_AGE_SEC)) throw new Error('Sessiya eskirdi: Mini App’ni yopib, qayta oching');

  var user = {};
  try { user = JSON.parse(fields.user || '{}'); } catch (x) {}
  if (String(user.id) !== String(allowed).trim()) throw new Error('Ruxsat yoʻq: bu Telegram akkaunt uchun ochilmagan');
  return user;
}

/* ================= actions ================= */

function init_() {
  var ss = openSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var lists = lists_(ss);
  var outSh = ss.getSheetByName(CFG.OUT.name), inSh = ss.getSheetByName(CFG.IN.name);
  var outRows = readTail_(outSh, CFG.OUT.firstRow, CFG.OUT.cols, CFG.HISTORY_ROWS);
  var inRows = readTail_(inSh, CFG.IN.firstRow, CFG.IN.cols, CFG.HISTORY_ROWS);

  var usage = { out: {}, in: {} }, walletUse = { out: {}, in: {} }, catWallet = { out: {}, in: {} };
  var pairUse = {}, pairRate = {};
  outRows.forEach(function (r) {
    var v = r.values, cat = String(v[1]), wallet = String(v[3]), rate = num_(v[4]), to = String(v[6]);
    if (!cat) return;
    if (cat === CFG.EXCHANGE) {
      if (wallet && to) {
        var key = wallet + '>' + to;
        pairUse[key] = (pairUse[key] || 0) + 1;
        if (rate > 0) pairRate[key] = rate;
      }
      return;
    }
    count_(usage.out, cat); count_(walletUse.out, wallet); countNested_(catWallet.out, cat, wallet);
  });
  inRows.forEach(function (r) {
    var v = r.values, cat = String(v[1]), wallet = String(v[3]);
    if (!cat) return;
    count_(usage.in, cat); count_(walletUse.in, wallet); countNested_(catWallet.in, cat, wallet);
  });

  // Tez summalar: har kategoriyada eng koʻp takrorlangan summa + hamyon (kamida 2 marta)
  var quick = { out: {}, in: {} };
  [['out', outRows], ['in', inRows]].forEach(function (pair) {
    var acc = {};
    pair[1].forEach(function (r, i) {
      var v = r.values, cat = String(v[1] || ''), a = num_(v[2]), w = String(v[3] || '');
      if (!cat || cat === CFG.EXCHANGE || !(a > 0) || !w) return;
      var k = a + '|' + w;
      acc[cat] = acc[cat] || {};
      acc[cat][k] = acc[cat][k] || { a: a, w: w, n: 0, last: 0 };
      acc[cat][k].n++; acc[cat][k].last = i;
    });
    Object.keys(acc).forEach(function (cat) {
      var list = Object.keys(acc[cat]).map(function (k) { return acc[cat][k]; })
        .filter(function (x) { return x.n >= 2; })
        .sort(function (x, y) { return y.n - x.n || y.last - x.last; }).slice(0, 3)
        .map(function (x) { return { a: x.a, w: x.w }; });
      if (list.length) quick[pair[0]][cat] = list;
    });
  });

  var favWallet = { out: {}, in: {} };
  ['out', 'in'].forEach(function (m) {
    Object.keys(catWallet[m]).forEach(function (c) { favWallet[m][c] = top_(catWallet[m][c]); });
  });
  var pair = top_(pairUse);

  var recent = outRows.slice(-CFG.RECENT).map(function (r) { return entry_('out', r, tz); })
    .concat(inRows.slice(-CFG.RECENT).map(function (r) { return entry_('in', r, tz); }))
    .filter(function (x) { return x.cat; })
    .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : b.row - a.row; })
    .slice(0, CFG.RECENT);

  return {
    wallets: lists.wallets,
    outCats: lists.outCats,
    inCats: lists.inCats,
    balances: balances_(ss),
    usage: usage,
    favWallet: favWallet,
    defaultWallet: { out: top_(walletUse.out) || lists.wallets[0], in: top_(walletUse.in) || lists.wallets[0] },
    exPair: pair ? pair.split('>') : null,
    lastRate: currentRate_(outSh),
    pairRate: pairRate,
    recent: recent,
    budgets: budgets_(ss),
    quick: quick,
    fixed: fixed_(outRows),
    recurring: recurring_(outRows, tz)
  };
}

// Har oy (oyiga 1–2 marta) toʻlanadiganlar: oxirgi 4 oyning kamida 3 tasida bor boʻlganlar
function recurring_(rows, tz) {
  var cur = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  var y = Number(cur.slice(0, 4)), m = Number(cur.slice(5, 7)), months = [];
  for (var i = 1; i <= 4; i++) {
    var mm = m - i, yy = y;
    while (mm <= 0) { mm += 12; yy--; }
    months.push(yy + '-' + (mm < 10 ? '0' : '') + mm);
  }
  var by = {};
  rows.forEach(function (r) {
    var v = r.values, cat = String(v[1] || '');
    if (!cat || cat === CFG.EXCHANGE || !(v[0] instanceof Date)) return;
    var mk = Utilities.formatDate(v[0], tz, 'yyyy-MM');
    var o = by[cat] = by[cat] || { months: {}, inWindow: 0, last: null, days: [] };
    o.months[mk] = (o.months[mk] || 0) + 1;
    if (months.indexOf(mk) >= 0) { o.inWindow++; o.days.push(Number(Utilities.formatDate(v[0], tz, 'd'))); }
    o.last = { amount: num_(v[2]), wallet: String(v[3] || ''), date: Utilities.formatDate(v[0], tz, 'yyyy-MM-dd') };
  });
  var out = [];
  Object.keys(by).forEach(function (cat) {
    var o = by[cat], present = months.filter(function (k) { return o.months[k]; }).length;
    if (present < 3 || o.inWindow / present > 2.5) return;
    // Odatdagi toʻlov kuni: oxirgi oylardagi kunlarning medianasi
    var d = o.days.slice().sort(function (a, b) { return a - b; }), day = d.length ? d[Math.floor((d.length - 1) / 2)] : Number(o.last.date.slice(8));
    out.push({ cat: cat, amount: o.last.amount, wallet: o.last.wallet, lastDate: o.last.date, day: day, paid: !!o.months[cur] });
  });
  // Ilovada qoʻlda qoʻshilganlari (maktab, bogʻcha…) va olib tashlanganlari
  var pref = recurPrefs_(), mine = {};
  pref.add.forEach(function (a) { mine[a.cat] = 1; });
  out = out.filter(function (x) { return !mine[x.cat] && pref.hide.indexOf(x.cat) < 0; });
  pref.add.forEach(function (a) {
    var o = by[a.cat];
    out.push({ cat: a.cat, amount: a.amount, wallet: a.wallet, day: a.day, lastDate: o && o.last ? o.last.date : '',
      paid: !!(o && o.months[cur]), manual: true });
  });
  // Muddati oldinroq keladigani birinchi
  return out.sort(function (a, b) { return a.day - b.day || (a.cat < b.cat ? -1 : 1); });
}

// Doim bir xil summa va hamyondan toʻlanadigan kategoriyalar (masalan, har kungi xayriya):
// oxirgi 10 ta yozuvning kamida 80 foizi bir xil boʻlsa, ilova kategoriya bosilganda shu summani oʻzi yozadi
function fixed_(rows) {
  var by = {};
  rows.forEach(function (r) {
    var v = r.values, cat = String(v[1] || ''), a = num_(v[2]);
    if (!cat || cat === CFG.EXCHANGE || !(a > 0)) return;
    (by[cat] = by[cat] || []).push(a + '|' + String(v[3] || ''));
  });
  var out = {};
  Object.keys(by).forEach(function (cat) {
    var last = by[cat].slice(-10);
    if (last.length < 4) return;
    var cnt = {};
    last.forEach(function (k) { cnt[k] = (cnt[k] || 0) + 1; });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    if (cnt[top] >= Math.ceil(last.length * 0.8)) {
      var p = top.split('|');
      out[cat] = { a: Number(p[0]), w: p.slice(1).join('|') };
    }
  });
  return out;
}

function recurPrefs_() {
  try {
    var j = JSON.parse(PropertiesService.getScriptProperties().getProperty(CFG.RECUR_PROP) || '{}');
    return { add: j.add || [], hide: j.hide || [] };
  } catch (e) { return { add: [], hide: [] }; }
}

// Oylik toʻlovni eslatmaga qoʻshish (op: add) yoki eslatmadan olib tashlash (op: remove)
function recur_(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var ss = openSheet_(), tz = ss.getSpreadsheetTimeZone(), lists = lists_(ss);
    var cat = String(req.cat || '');
    var names = lists.outCats.map(function (c) { return c.name; });
    if (!cat || cat === CFG.EXCHANGE || names.indexOf(cat) < 0) throw new Error('Kategoriya topilmadi: ' + cat);
    var pref = recurPrefs_();
    pref.add = pref.add.filter(function (a) { return a.cat !== cat; });
    pref.hide = pref.hide.filter(function (h) { return h !== cat; });
    if (req.op === 'add') {
      var amount = Math.round(Number(req.amount) * 100) / 100, wallet = String(req.wallet || ''), day = Math.round(Number(req.day));
      if (!(amount > 0) || !isFinite(amount)) throw new Error('Summa notoʻgʻri');
      if (lists.wallets.indexOf(wallet) < 0) throw new Error('Hamyon topilmadi: ' + wallet);
      if (!(day >= 1 && day <= 31)) throw new Error('Sana 1 dan 31 gacha boʻlsin');
      pref.add.push({ cat: cat, amount: amount, wallet: wallet, day: day });
    } else if (req.op === 'remove') pref.hide.push(cat);
    else throw new Error('Amal notoʻgʻri');
    PropertiesService.getScriptProperties().setProperty(CFG.RECUR_PROP, JSON.stringify(pref));
    var rows = readTail_(ss.getSheetByName(CFG.OUT.name), CFG.OUT.firstRow, CFG.OUT.cols, CFG.HISTORY_ROWS);
    return { recurring: recurring_(rows, tz) };
  } finally {
    lock.releaseLock();
  }
}

function budgets_(ss) {
  var v = ss.getSheetByName(CFG.IN.name).getRange(CFG.BUDGET_RANGE).getValues();
  return v.filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) { return { name: String(r[0]).trim(), income: num_(r[1]), spent: num_(r[2]), balance: num_(r[3]) }; });
}

// Yozuvni tekshiradi va sheet qatoriga aylantiradi (add va update ikkalasi ishlatadi)
function buildEntry_(ss, lists, tz, en) {
  var type = String(en.type || '');
  var wallet = String(en.wallet || '');
  if (['out', 'in', 'exchange'].indexOf(type) < 0) throw new Error('Yozuv turi notoʻgʻri');
  if (lists.wallets.indexOf(wallet) < 0) throw new Error('Hamyon topilmadi: ' + wallet);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(en.date))) throw new Error('Sana notoʻgʻri');
  var amount = Math.round(Number(en.amount) * 100) / 100;
  if (!(amount > 0) || !isFinite(amount)) throw new Error('Summa notoʻgʻri');

  var cat, to = '', rate = '';
  if (type === 'exchange') {
    cat = CFG.EXCHANGE;
    to = String(en.to || '');
    if (lists.wallets.indexOf(to) < 0 || to === wallet) throw new Error('Pul qaysi hamyonga tushishini tanlang');
    if (isUsd_(wallet) !== isUsd_(to)) {
      rate = Number(en.rate);
      if (!(rate > 0)) throw new Error('Kursni kiriting');
    }
  } else if (type === 'out') {
    cat = String(en.category || '');
    if (!lists.outCats.some(function (c) { return c.name === cat; })) throw new Error('Kategoriya topilmadi: ' + cat);
    // Oddiy chiqimda kurs yozilmaydi: Outflow L ustuni oxirgi kiritilgan kursni oʻzi oladi.
  } else {
    cat = String(en.category || '');
    if (lists.inCats.indexOf(cat) < 0) throw new Error('Kategoriya topilmadi: ' + cat);
    // Inflow J ustuni soʻmdagi kirimni E (kurs) ga boʻladi, shuning uchun soʻm hamyonga kursni yozamiz.
    if (!isUsd_(wallet)) rate = Number(en.rate) > 0 ? Number(en.rate) : currentRate_(ss.getSheetByName(CFG.OUT.name));
  }

  var amountCell = amount;
  var expr = String(en.expr || '');
  if (/^\d+(\.\d+)?(\+\d+(\.\d+)?)+$/.test(expr)) {
    var sum = expr.split('+').reduce(function (s, x) { return s + Number(x); }, 0);
    if (Math.abs(sum - amount) < 0.005) amountCell = '=' + expr;   // sheetda "=733+105" koʻrinishida qoladi
  }
  var note = String(en.note || '').trim().slice(0, 300);
  if (/^[=+\-@]/.test(note)) note = "'" + note;

  var conf = type === 'in' ? CFG.IN : CFG.OUT;
  var vals = [Utilities.parseDate(String(en.date), tz, 'yyyy-MM-dd'), cat, amountCell, wallet, rate, note];
  if (conf === CFG.OUT) vals.push(to);
  return {
    conf: conf, vals: vals,
    saved: { sheet: type === 'in' ? 'in' : 'out', date: String(en.date), cat: cat, amount: amount,
             wallet: wallet, to: to, rate: rate || null, note: note.replace(/^'/, '') }
  };
}

function add_(en) {
  var ss = openSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var b = buildEntry_(ss, lists_(ss), tz, en);
  var uid = String(en.uid || '').replace(/[^\w-]/g, '').slice(0, 64);
  var cache = uid ? CacheService.getScriptCache() : null;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Internet uzilib, ilova qayta yuborsa: shu yozuv allaqachon tushgan boʻlsa, qaytadan yozmaymiz
    var seen = cache && cache.get('uid:' + uid);
    if (seen) return { saved: JSON.parse(seen), balances: balances_(ss), budgets: budgets_(ss), duplicate: true };
    var sh = ss.getSheetByName(b.conf.name);
    var row = lastDataRow_(sh, b.conf.firstRow) + 1;
    // Varaq oxiriga yetsa, oxirgi qatordan OLDIN qator qoʻshamiz: formulalardagi diapazonlar ham kengayadi.
    if (row >= sh.getMaxRows()) sh.insertRowsBefore(sh.getMaxRows(), 300);
    sh.getRange(row, 1, 1, b.vals.length).setValues([b.vals]);
    SpreadsheetApp.flush();
    b.saved.row = row;
    if (cache) cache.put('uid:' + uid, JSON.stringify(b.saved), CFG.UID_TTL_SEC);
    return { saved: b.saved, balances: balances_(ss), budgets: budgets_(ss) };
  } finally {
    lock.releaseLock();
  }
}

// Ilovadagi eski yozuvni tahrirlash: qator ilova koʻrgan holatda boʻlsagina oʻzgartiriladi
function update_(ref, en) {
  var ss = openSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var conf = ref.sheet === 'in' ? CFG.IN : CFG.OUT;
  if ((String(en.type) === 'in') !== (conf === CFG.IN)) throw new Error('Kirim va chiqim turini almashtirib boʻlmaydi');
  var b = buildEntry_(ss, lists_(ss), tz, en);
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ss.getSheetByName(conf.name);
    var row = Number(ref.row);
    checkRow_(sh, conf, row, ref, tz);
    sh.getRange(row, 1, 1, b.vals.length).setValues([b.vals]);
    SpreadsheetApp.flush();
    b.saved.row = row;
    return { saved: b.saved, balances: balances_(ss), budgets: budgets_(ss) };
  } finally {
    lock.releaseLock();
  }
}

// Istalgan yozuvni oʻchirish (qatorning A–G kataklari tozalanadi, formulalarga tegilmaydi)
function delete_(ref) {
  var ss = openSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var conf = ref.sheet === 'in' ? CFG.IN : CFG.OUT;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ss.getSheetByName(conf.name);
    var row = Number(ref.row);
    checkRow_(sh, conf, row, ref, tz);
    sh.getRange(row, 1, 1, conf.cols).clearContent();
    SpreadsheetApp.flush();
    return { balances: balances_(ss), budgets: budgets_(ss) };
  } finally {
    lock.releaseLock();
  }
}

function checkRow_(sh, conf, row, ref, tz) {
  if (!(row >= conf.firstRow) || row > sh.getMaxRows()) throw new Error('Qator topilmadi');
  var v = sh.getRange(row, 1, 1, conf.cols).getValues()[0];
  var date = v[0] instanceof Date ? Utilities.formatDate(v[0], tz, 'yyyy-MM-dd') : String(v[0]);
  if (String(v[1]) !== String(ref.cat) || Math.abs(num_(v[2]) - Number(ref.amount)) > 0.005 || (ref.date && date !== String(ref.date))) {
    throw new Error('Bu qator sheetda oʻzgargan. Ilovani yopib, qayta oching.');
  }
}

function undo_(ref) {
  var ss = openSheet_();
  var conf = ref.sheet === 'in' ? CFG.IN : CFG.OUT;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ss.getSheetByName(conf.name);
    var row = Number(ref.row);
    if (row !== lastDataRow_(sh, conf.firstRow)) throw new Error('Faqat eng oxirgi yozuvni bekor qilish mumkin. Sheetda qoʻlda tekshiring.');
    var range = sh.getRange(row, 1, 1, conf.cols);
    var v = range.getValues()[0];
    if (String(v[1]) !== String(ref.cat) || Math.abs(num_(v[2]) - Number(ref.amount)) > 0.005) {
      throw new Error('Bu qator oʻzgargan, sheetda qoʻlda tekshiring.');
    }
    range.clearContent();
    SpreadsheetApp.flush();
    return { balances: balances_(ss), budgets: budgets_(ss) };
  } finally {
    lock.releaseLock();
  }
}

/* ================= voice → entries (Gemini) =================
 * Ovozli xabarni Gemini'ga yuboradi: u matnga aylantiradi va yozuvlarga ajratadi.
 * Hech narsa sheetga yozilmaydi: natija Mini App'da koʻrib chiqiladi, keyin "add" bilan saqlanadi.
 * Script Properties: GEMINI_API_KEY (aistudio.google.com/apikey), ixtiyoriy GEMINI_MODEL.
 */

function ai_(req, kind) {
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error((kind === 'receipt' ? 'Chek' : 'Ovoz') + ' uchun Apps Script’da GEMINI_API_KEY sozlanmagan');
  var model = props.getProperty('GEMINI_MODEL') || CFG.GEMINI_MODEL;
  var audio = String(kind === 'receipt' ? req.data || '' : req.audio || '');
  if (!audio || audio.length > 10 * 1024 * 1024 || !/^[A-Za-z0-9+/=]+$/.test(audio)) {
    throw new Error(kind === 'receipt' ? 'Fayl notoʻgʻri yoki juda katta' : 'Ovoz yozuvi notoʻgʻri yoki juda uzun');
  }
  var mime = String(req.mime || '');
  if (kind === 'receipt') {
    if (!/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/.test(mime)) throw new Error('Rasm yoki PDF yuboring');
  } else if (!/^audio\/[\w.+-]+$/.test(mime)) mime = 'audio/wav';

  var ss = openSheet_();
  var tz = ss.getSpreadsheetTimeZone();
  var lists = lists_(ss);
  var now = new Date();
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var rate = currentRate_(ss.getSheetByName(CFG.OUT.name));
  var outNames = uniqTrim_(lists.outCats.map(function (c) { return c.name; }).filter(function (n) { return n !== CFG.EXCHANGE; }));
  var inNames = uniqTrim_(lists.inCats);

  var body = {
    contents: [{ role: 'user', parts: [
      { inlineData: { mimeType: mime, data: audio } },
      { text: voicePrompt_(today, Utilities.formatDate(now, tz, 'EEEE'), rate, lists.wallets, outNames, inNames, kind) }
    ] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: voiceSchema_(lists.wallets, uniqTrim_(outNames.concat(inNames)))
    }
  };
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key },
    payload: JSON.stringify(body), muteHttpExceptions: true
  });
  var code = res.getResponseCode(), text = res.getContentText();
  if (code !== 200) {
    var msg = '';
    try { msg = JSON.parse(text).error.message; } catch (x) { msg = text.slice(0, 200); }
    throw new Error('Ovozni tahlil qilib boʻlmadi (' + code + '): ' + msg);
  }
  var j = JSON.parse(text);
  var parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  if (!parts || !parts.length) throw new Error('Ovoz tushunilmadi, qayta urinib koʻring');
  var parsed;
  try { parsed = JSON.parse(parts.map(function (p) { return p.text || ''; }).join('')); }
  catch (x) { throw new Error('Ovoz tushunilmadi, qayta urinib koʻring'); }

  var entries = (parsed.entries || []).slice(0, 10).map(function (e) {
    var type = ['out', 'in', 'exchange'].indexOf(e.type) >= 0 ? e.type : 'out';
    var wallet = lists.wallets.indexOf(e.wallet) >= 0 ? e.wallet : null;
    var to = type === 'exchange' && lists.wallets.indexOf(e.to) >= 0 ? e.to : null;
    var cat = type === 'exchange' ? CFG.EXCHANGE
      : matchName_(type === 'in' ? lists.inCats : lists.outCats.map(function (c) { return c.name; }), e.category);
    var r = Number(e.rate);
    return {
      type: type, category: cat, amount: Math.round(Number(e.amount) * 100) / 100 || 0,
      wallet: wallet, to: to, rate: r > 0 ? r : null,
      date: /^\d{4}-\d{2}-\d{2}$/.test(String(e.date)) ? String(e.date) : today,
      note: String(e.note || '').slice(0, 200)
    };
  }).filter(function (e) { return e.amount > 0; });
  return { transcript: String(parsed.transcript || '').slice(0, 1000), entries: entries };
}

function voicePrompt_(today, weekday, rate, wallets, outNames, inNames, kind) {
  var intro = kind === 'receipt' ? [
    'You read a photo, screenshot or PDF of a payment receipt, card-to-card transfer, bill or shop check',
    'and turn it into personal-finance entries for a Google Sheet. Texts may be in Uzbek, Russian or English.',
    'Receipt rules:',
    '- One entry per payment shown. amount = the total that left the payer\'s account (including commission).',
    '- Card payments and transfers in soʻm → wallet "Card sum"; cash checks → "Cash sum"; USD card → "Visa" or "Master card".',
    '- Money received (incoming transfer, refund, salary) → type "in".',
    '- date = the date printed on the receipt; note = shop or recipient name, short.',
    '- transcript = one short line in Uzbek Latin: who was paid, total, date.',
    ''
  ] : [
    'You turn a short voice note into personal-finance entries for a Google Sheet.',
    'The speaker talks in Uzbek (Latin or Cyrillic), sometimes mixed with Russian or English words.'
  ];
  return intro.concat([
    'Today is ' + today + ' (' + weekday + '). Current exchange rate: 1 USD = ' + rate + ' UZS (soʻm).',
    '',
    'Wallets (use the exact names):',
    '- "Cash sum": cash in soʻm (naqd, naqd pul, qoʻldan).',
    '- "Card sum": soʻm bank card (karta, plastik, Uzcard, Humo, kartadan, perevod).',
    '- "Cash dollar": cash US dollars (dollar, naqd dollar, koʻk).',
    '- "Visa": US dollar Visa card.',
    '- "Master card": US dollar Mastercard.',
    'Available wallets: ' + JSON.stringify(wallets),
    '',
    'Entry types:',
    '- "out": money spent or given. category from OUT categories.',
    '- "in": money received. category from IN categories.',
    '- "exchange": money moved or converted between the speaker\'s own wallets (almashtirdim, ayirboshladim, kartaga tashladim,',
    '  kartadan yechib oldim, naqdlashtirdim). wallet = where the money left, to = where it arrived, amount = in the currency of',
    '  the wallet it left, rate = soʻm per 1 USD only if said, otherwise null. category = null.',
    '',
    'Rules:',
    '- The speaker usually says, in this order: the category name in English (as listed below), the amount, the wallet.',
    '  Examples: "medicine 150k cash sum", "grocery two hundred thousand card sum", "taxi 30 ming karta", "doctor 50 dollars cash dollar".',
    '  "k" = thousand, "m" / "mln" = million. The amount may be said in English or Uzbek words.',
    '- Speech is often misheard: "cash some" / "cash son" / "cache sum" = "Cash sum", "card some" = "Card sum",',
    '  "visa card" = "Visa", plural or slightly wrong category words ("groceries", "medicines") = the closest category.',
    '- One entry per amount that was spent, received or moved. Ignore amounts that are only mentioned as context.',
    '- Write numbers as digits: "ikki yuz ming" = 200000, "bir yarim million" = 1500000, "oʻttiz besh ming" = 35000,',
    '  "ming" = 1000, "million" / "mln" = 1000000, "yuz dollar" = 100, "12 ming 100" = 12100.',
    '- amount is always in the wallet\'s currency. If dollars are named and no wallet is said, wallet = "Cash dollar".',
    '- If the wallet is not said for a soʻm amount, wallet = null (the app fills in the usual one).',
    '- Dates as YYYY-MM-DD: "bugun" = today, "kecha" = yesterday, "oʻtgan kuni" = 2 days ago, a weekday name = its most recent past date.',
    '  Default is today.',
    '- category: the closest name from the list for that type. Use "Other" only if nothing fits. Never invent categories.',
    '- note: short extra details (shop, person, purpose) in the speaker\'s language, or "".',
    '- transcript: what was said, written in Uzbek Latin script.',
    '',
    'OUT categories: ' + JSON.stringify(outNames),
    'IN categories: ' + JSON.stringify(inNames)
  ]).join('\n');
}

function voiceSchema_(wallets, cats) {
  return {
    type: 'OBJECT',
    properties: {
      transcript: { type: 'STRING' },
      entries: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            type: { type: 'STRING', format: 'enum', enum: ['out', 'in', 'exchange'] },
            category: { type: 'STRING', format: 'enum', nullable: true, enum: cats },
            amount: { type: 'NUMBER' },
            wallet: { type: 'STRING', format: 'enum', nullable: true, enum: wallets },
            to: { type: 'STRING', format: 'enum', nullable: true, enum: wallets },
            rate: { type: 'NUMBER', nullable: true },
            date: { type: 'STRING' },
            note: { type: 'STRING' }
          },
          required: ['type', 'category', 'amount', 'wallet', 'to', 'rate', 'date', 'note'],
          propertyOrdering: ['type', 'category', 'amount', 'wallet', 'to', 'rate', 'date', 'note']
        }
      }
    },
    required: ['transcript', 'entries'],
    propertyOrdering: ['transcript', 'entries']
  };
}

function uniqTrim_(names) {
  var seen = {}, out = [];
  names.forEach(function (n) { var t = String(n).trim(); if (t && !seen[t]) { seen[t] = 1; out.push(t); } });
  return out;
}
function matchName_(list, name) {
  var want = String(name || '').trim().toLowerCase();
  if (!want) return null;
  for (var i = 0; i < list.length; i++) if (String(list[i]).trim().toLowerCase() === want) return list[i];
  return null;
}

/* ================= sheet helpers ================= */

function openSheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Apps Script sozlanmagan: SHEET_ID kerak');
  return SpreadsheetApp.openById(id.trim());
}

function lists_(ss) {
  var sh = ss.getSheetByName(CFG.LIST);
  var n = Math.max(sh.getLastRow() - 1, 1);
  var vals = sh.getRange(2, 1, n, 4).getValues();
  var wallets = [], inCats = [], outCats = [];
  vals.forEach(function (r) {
    if (r[0] !== '' && r[0] !== null) wallets.push(String(r[0]));
    if (r[1] !== '' && r[1] !== null) inCats.push(String(r[1]));
    if (r[2] !== '' && r[2] !== null) outCats.push({ name: String(r[2]), tip: String(r[3] || '') });
  });
  return { wallets: wallets, inCats: inCats, outCats: outCats };
}

function balances_(ss) {
  var v = ss.getSheetByName(CFG.IN.name).getRange(CFG.BALANCE_RANGE).getValues();
  var b = {};
  v[0].forEach(function (name, i) { if (name !== '' && name !== null) b[String(name).trim()] = num_(v[1][i]); });
  return b;
}

function currentRate_(outSh) {
  var last = lastDataRow_(outSh, CFG.OUT.firstRow);
  if (last < CFG.OUT.firstRow) return 0;
  var rate = num_(outSh.getRange(last, CFG.RATE_COL).getValue());
  if (rate > 0) return rate;
  var e = outSh.getRange(CFG.OUT.firstRow, 5, last - CFG.OUT.firstRow + 1, 1).getValues();
  for (var i = e.length - 1; i >= 0; i--) if (num_(e[i][0]) > 0) return num_(e[i][0]);
  return 0;
}

function lastDataRow_(sh, firstRow) {
  var n = sh.getMaxRows() - firstRow + 1;
  if (n <= 0) return firstRow - 1;
  var col = sh.getRange(firstRow, 1, n, 1).getValues();
  for (var i = col.length - 1; i >= 0; i--) {
    if (col[i][0] !== '' && col[i][0] !== null) return firstRow + i;
  }
  return firstRow - 1;
}

function readTail_(sh, firstRow, cols, n) {
  var last = lastDataRow_(sh, firstRow);
  if (last < firstRow) return [];
  var start = Math.max(firstRow, last - n + 1);
  return sh.getRange(start, 1, last - start + 1, cols).getValues()
    .map(function (v, i) { return { row: start + i, values: v }; });
}

function entry_(sheet, r, tz) {
  var v = r.values;
  return {
    sheet: sheet, row: r.row,
    date: v[0] instanceof Date ? Utilities.formatDate(v[0], tz, 'yyyy-MM-dd') : String(v[0]),
    cat: String(v[1] || ''), amount: num_(v[2]), wallet: String(v[3] || ''),
    rate: num_(v[4]) || null, note: String(v[5] || ''), to: sheet === 'out' ? String(v[6] || '') : ''
  };
}

/* ================= small utils ================= */

function isUsd_(w) { return CFG.USD_WALLETS.indexOf(w) >= 0; }
function num_(x) {
  if (typeof x === 'number') return x;
  var n = Number(String(x == null ? '' : x).replace(/[\s ]/g, '').replace(',', '.'));
  return isFinite(n) ? n : 0;
}
function count_(o, k) { if (k) o[k] = (o[k] || 0) + 1; }
function countNested_(o, k, k2) { if (!k || !k2) return; o[k] = o[k] || {}; o[k][k2] = (o[k][k2] || 0) + 1; }
function top_(o) {
  var best = null, n = -1;
  Object.keys(o || {}).forEach(function (k) { if (o[k] > n) { n = o[k]; best = k; } });
  return best;
}
function decode_(s) { return decodeURIComponent(s.replace(/\+/g, ' ')); }
function bytes_(s) { return Utilities.newBlob(s).getBytes(); }
function hex_(bytes) {
  return bytes.map(function (b) { var h = (b & 0xff).toString(16); return h.length < 2 ? '0' + h : h; }).join('');
}
