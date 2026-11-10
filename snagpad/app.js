/* SnagPad v1.1 — offline snag / punch list with file/link sharing. No server, no tracking. */
(() => {
'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const STATUSES = ['Open', 'In progress', 'Ready for inspection', 'Closed'];
const SCOL = { 'Open': '#ef4444', 'In progress': '#f59e0b', 'Ready for inspection': '#3b82f6', 'Closed': '#10b981' };
const PRIOS = ['Low', 'Medium', 'High', 'Critical'];
const PCOL = { Low: '#0284c7', Medium: '#d97706', High: '#dc2626', Critical: '#7f1d1d' };
const DEFAULT_TRADES = ['Architectural', 'Civil / Structural', 'Plastering', 'Painting', 'Tiling', 'Ceiling', 'Doors & Ironmongery', 'Windows & Glazing', 'Waterproofing', 'Plumbing', 'Electrical', 'ACMV', 'Fire Protection', 'Landscape', 'Cleaning', 'Others'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtD = iso => { if (!iso) return ''; const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const fmtDT = ts => { const d = new Date(ts); return `${fmtD(new Date(ts - d.getTimezoneOffset() * 6e4).toISOString())} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const isOver = it => it.due && it.status !== 'Closed' && it.due < todayISO();
const ts = i => i.updatedAt || i.updated || i.created || 0;
const lastBy = i => i.updatedBy ? `Last updated by ${esc(i.updatedBy)}, ${fmtDT(ts(i))}` : (i.updated || i.updatedAt) ? `Last updated ${fmtDT(ts(i))}` : `Logged ${fmtDT(i.created)}`;

/* ---------- IndexedDB ---------- */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('snagpad', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('projects', { keyPath: 'id' });
      d.createObjectStore('items', { keyPath: 'id' }).createIndex('pid', 'projectId');
      d.createObjectStore('photos', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => { db = r.result; res(db); };
    r.onerror = () => rej(r.error);
  });
}
const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const all = store => req(tx(store).getAll());
const get = (store, id) => req(tx(store).get(id));
const put = (store, v) => req(tx(store, 'readwrite').put(v));
const del = (store, id) => req(tx(store, 'readwrite').delete(id));

/* ---------- State ---------- */
const S = { projects: [], items: [], pid: null, filter: { q: '', status: 'Active', trade: '', prio: '', sort: 'new', mine: false }, thumbs: new Map(), me: '' };
const isMine = i => { const a = (i.assignee || '').toLowerCase().trim(), m = (S.me || '').toLowerCase().trim(); return !!(m && a && (a.includes(m) || m.includes(a))); };
const proj = () => S.projects.find(p => p.id === S.pid);
const pItems = () => S.items.filter(i => i.projectId === S.pid);

function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('on'), 1800); }

async function load() {
  S.projects = await all('projects');
  S.items = await all('items');
  const last = await get('meta', 'pid');
  S.me = (await get('meta', 'me'))?.v || '';
  S.thumbs = new Map();
  if (!S.projects.length) {
    const p = newProject('My first project'); await put('projects', p); S.projects.push(p);
  }
  S.pid = (last && S.projects.some(p => p.id === last.v)) ? last.v : S.projects[0].id;
  for (const ph of await all('photos')) S.thumbs.set(ph.id, ph.thumb);
}
function newProject(name) {
  return { id: uid(), name, client: '', address: '', by: '', prefix: 'S', trades: DEFAULT_TRADES.slice(), counter: 0, created: Date.now() };
}
async function setProject(id) { S.pid = id; await put('meta', { k: 'pid', v: id }); renderAll(); }

/* ---------- Rendering ---------- */
function renderAll() { $('#projName').textContent = proj()?.name || '—'; renderList(); renderFilters(); renderSummary(); renderSettings(); renderReportOptions(); }

function renderFilters() {
  const items = pItems();
  const counts = { All: items.length, Active: items.filter(i => i.status !== 'Closed').length, Overdue: items.filter(isOver).length };
  STATUSES.forEach(s => counts[s] = items.filter(i => i.status === s).length);
  const keys = ['Active', 'All', ...STATUSES, 'Overdue'];
  $('#statusChips').innerHTML = `<button class="chip mine ${S.filter.mine ? 'on' : ''}" data-mine="1" title="Snags whose 'Assigned to' matches My name">👤 Assigned to me <i>${S.me ? items.filter(isMine).length : '?'}</i></button>` + keys.map(k => `<button class="chip ${S.filter.status === k ? 'on' : ''}" data-k="${esc(k)}">${k === 'Overdue' ? '⚠ ' : ''}${esc(k)} <i>${counts[k]}</i></button>`).join('');
  const trades = [...new Set([...(proj()?.trades || []), ...items.map(i => i.trade).filter(Boolean)])];
  $('#fTrade').innerHTML = '<option value="">All trades</option>' + trades.map(t => `<option ${S.filter.trade === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
  $('#fPrio').innerHTML = '<option value="">All priorities</option>' + PRIOS.map(t => `<option ${S.filter.prio === t ? 'selected' : ''}>${t}</option>`).join('');
}

function filtered() {
  const f = S.filter, q = f.q.trim().toLowerCase();
  let arr = pItems().filter(i => {
    if (f.status === 'Active' && i.status === 'Closed') return false;
    if (STATUSES.includes(f.status) && i.status !== f.status) return false;
    if (f.status === 'Overdue' && !isOver(i)) return false;
    if (f.trade && i.trade !== f.trade) return false;
    if (f.mine && !isMine(i)) return false;
    if (f.prio && i.priority !== f.prio) return false;
    if (q && !`${i.ref} ${i.title} ${i.location} ${i.trade} ${i.assignee} ${i.notes}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const by = {
    new: (a, b) => b.created - a.created, old: (a, b) => a.created - b.created,
    prio: (a, b) => PRIOS.indexOf(b.priority) - PRIOS.indexOf(a.priority) || b.created - a.created,
    due: (a, b) => (a.due || '9999').localeCompare(b.due || '9999'),
    loc: (a, b) => (a.location || '').localeCompare(b.location || '', undefined, { numeric: true }) || a.created - b.created
  };
  return arr.sort(by[f.sort]);
}

function renderList() {
  const arr = filtered();
  $('#empty').hidden = pItems().length > 0;
  if (pItems().length && !arr.length) { $('#list').innerHTML = `<div class="empty"><p>No snags match these filters.</p></div>`; return; }
  $('#list').innerHTML = arr.map(i => {
    const th = i.photos?.length ? S.thumbs.get(i.photos[0]) : null;
    const next = STATUSES[(STATUSES.indexOf(i.status) + 1) % STATUSES.length];
    return `<article class="item" data-id="${i.id}" style="--sc:${SCOL[i.status]}">
      <div class="thumb" style="${th ? `background-image:url(${th})` : ''}">${th ? (i.photos.length > 1 ? `<em>${i.photos.length}</em>` : '') : '📷'}</div>
      <div class="ibody">
        <div class="itop"><span class="iid">${esc(i.ref)}</span>${i.status !== 'Closed' ? `<button class="quick" data-next="${i.id}" title="Move to ${next}">→ ${esc(next === 'Ready for inspection' ? 'Ready' : next)}</button>` : ''}</div>
        <div class="ititle">${esc(i.title)}</div>
        <div class="imeta">${esc([i.location, i.trade, i.assignee].filter(Boolean).join(' · ') || 'No location')}</div>
        <div class="badges"><span class="b st">${esc(i.status)}</span><span class="b p-${i.priority}">${i.priority}</span>${i.due ? `<span class="b ${isOver(i) ? 'over' : ''}">${isOver(i) ? 'Overdue ' : 'Due '}${fmtD(i.due)}</span>` : ''}</div>
        <div class="iby">${lastBy(i)}</div>
      </div></article>`;
  }).join('');
}

function renderSummary() {
  const items = pItems(), n = items.length;
  const c = s => items.filter(i => i.status === s).length;
  const closed = c('Closed'), pct = n ? Math.round(closed / n * 100) : 0, over = items.filter(isOver).length;
  const groupBars = (key, title) => {
    const g = {}; items.forEach(i => { const k = i[key] || '(not set)'; (g[k] ||= { t: 0, c: 0 }); g[k].t++; if (i.status === 'Closed') g[k].c++; });
    const rows = Object.entries(g).sort((a, b) => (b[1].t - b[1].c) - (a[1].t - a[1].c) || b[1].t - a[1].t).slice(0, 12);
    const max = Math.max(1, ...rows.map(r => r[1].t));
    return `<div class="card"><h2>${title}</h2><p class="muted small">Open vs closed. Sorted by most outstanding.</p><div class="bars">${rows.length ? rows.map(([k, v]) => `<div class="bar"><span class="nm" title="${esc(k)}">${esc(k)}</span><span class="tr" style="width:${v.t / max * 100}%"><i style="width:${(v.t - v.c) / v.t * 100}%;background:#ef4444"></i><i style="width:${v.c / v.t * 100}%;background:#10b981"></i></span><span class="ct">${v.t - v.c} / ${v.t}</span></div>`).join('') : '<p class="muted">Nothing yet.</p>'}</div></div>`;
  };
  $('#summary').innerHTML = `
    <div class="kpis">
      <div class="kpi" style="--sc:#0f172a"><b>${n}</b><span>Total snags</span></div>
      <div class="kpi" style="--sc:${SCOL.Open}"><b>${n - closed}</b><span>Outstanding</span></div>
      <div class="kpi" style="--sc:#b91c1c"><b>${over}</b><span>Overdue</span></div>
      <div class="kpi" style="--sc:${SCOL.Closed}"><b>${pct}%</b><span>Closed</span></div>
    </div>
    <div class="card"><h2>Status</h2>
      <div class="progress">${STATUSES.map(s => `<i style="width:${n ? c(s) / n * 100 : 0}%;background:${SCOL[s]}" title="${s}"></i>`).join('')}</div>
      <div class="row gap wrap small">${STATUSES.map(s => `<span><span class="b st" style="--sc:${SCOL[s]}">${c(s)}</span> ${s}</span>`).join('')}</div>
    </div>
    ${groupBars('trade', 'By trade')}${groupBars('assignee', 'By assignee')}${groupBars('location', 'By location')}`;
}

function renderSettings() {
  const p = proj(); if (!p) return;
  $('#pName').value = p.name; $('#pClient').value = p.client; $('#pAddr').value = p.address; $('#pBy').value = p.by;
  $('#pPrefix').value = p.prefix; $('#pTrades').value = p.trades.join(', ');
  if (document.activeElement !== $('#myName')) $('#myName').value = S.me;
  if (navigator.storage?.estimate) navigator.storage.estimate().then(e => {
    $('#storageInfo').textContent = `Storage used on this device: ${(e.usage / 1048576).toFixed(1)} MB${e.quota ? ` of about ${(e.quota / 1073741824).toFixed(1)} GB available` : ''}.`;
  });
}

function renderReportOptions() {
  const box = $('#repStatuses');
  if (!box.children.length) box.innerHTML = STATUSES.map(s => `<label class="ck"><input type="checkbox" value="${s}" ${s !== 'Closed' ? 'checked' : ''}> ${s}</label>`).join('');
  if ($('#view-report').classList.contains('on')) buildReport();
}

async function buildReport() {
  const p = proj(); if (!p) return '';
  const sts = $$('#repStatuses input:checked').map(i => i.value);
  const wantPh = $('#repPhotos').checked, wantNotes = $('#repNotes').checked, wantSig = $('#repSig').checked;
  const items = pItems().filter(i => sts.includes(i.status)).sort((a, b) => (a.location || '').localeCompare(b.location || '', undefined, { numeric: true }) || a.seq - b.seq);
  const all_ = pItems(), cnt = s => all_.filter(i => i.status === s).length;
  const photoCache = {};
  if (wantPh) for (const i of items) for (const id of (i.photos || [])) { const ph = await get('photos', id); if (ph) photoCache[id] = ph.full; }
  const html = `<div class="rep">
    <div class="rhead"><div><h1>Snag List Report</h1><div class="rmeta"><b>${esc(p.name)}</b>${p.client ? ` · ${esc(p.client)}` : ''}${p.address ? `<br>${esc(p.address)}` : ''}</div></div>
    <div class="rmeta" style="text-align:right">Date: ${fmtD(todayISO())}${p.by ? `<br>Inspected by: ${esc(p.by)}` : ''}<br>Showing: ${esc(sts.join(', ') || 'none')}</div></div>
    <div class="rsum"><div><b>${all_.length}</b>Total</div>${STATUSES.map(s => `<div><b>${cnt(s)}</b>${s}</div>`).join('')}<div><b>${all_.filter(isOver).length}</b>Overdue</div></div>
    <table><thead><tr><th>ID</th><th>Description</th><th>Location</th><th>Trade</th><th>Priority</th><th>Status</th><th>Assigned</th><th>Due</th></tr></thead><tbody>
    ${items.map(i => `<tr><td>${esc(i.ref)}</td><td>${esc(i.title)}</td><td>${esc(i.location)}</td><td>${esc(i.trade)}</td><td>${i.priority}</td><td>${esc(i.status)}</td><td>${esc(i.assignee)}</td><td>${fmtD(i.due)}${isOver(i) ? ' ⚠' : ''}</td></tr>`).join('') || '<tr><td colspan="8">No snags in the selected statuses.</td></tr>'}
    </tbody></table>
    ${(wantPh || wantNotes) ? items.filter(i => (wantPh && i.photos?.length) || (wantNotes && i.notes)).map(i => `<div class="ritem"><h3>${esc(i.ref)} — ${esc(i.title)}</h3>
      <div class="rmeta">${esc([i.location, i.trade, i.priority, i.status, i.assignee && 'Assigned: ' + i.assignee].filter(Boolean).join(' · '))} · Logged ${fmtDT(i.created)}</div>
      ${wantNotes && i.notes ? `<p style="margin:6px 0 0;font-size:12px;white-space:pre-wrap">${esc(i.notes)}</p>` : ''}
      ${wantPh && i.photos?.length ? `<div class="rph">${i.photos.map(id => photoCache[id] ? `<img src="${photoCache[id]}" alt="">` : '').join('')}</div>` : ''}</div>`).join('') : ''}
    ${wantSig ? `<div class="sig"><div>Inspected by (name, signature, date)</div><div>Acknowledged by contractor (name, signature, date)</div></div>` : ''}
    <div class="foot">Generated with SnagPad · ${fmtDT(Date.now())}</div></div>`;
  $('#reportPreview').innerHTML = html;
  return html;
}

/* ---------- Item editor ---------- */
let cur = null; // item being edited (copy)
function segInit(el, opts, colors) {
  el.innerHTML = opts.map(o => `<button type="button" data-v="${o}" style="--sc:${colors[o]}">${o}</button>`).join('');
  el.onclick = e => { const b = e.target.closest('button'); if (!b) return; el.dataset.v = b.dataset.v; [...el.children].forEach(c => c.classList.toggle('on', c === b)); };
}
const segSet = (el, v) => { el.dataset.v = v; [...el.children].forEach(c => c.classList.toggle('on', c.dataset.v === v)); };

function fillDatalists() {
  const items = pItems(), uniq = k => [...new Set(items.map(i => i[k]).filter(Boolean))].sort();
  $('#dlLoc').innerHTML = uniq('location').map(v => `<option value="${esc(v)}">`).join('');
  $('#dlTrade').innerHTML = [...new Set([...(proj().trades || []), ...uniq('trade')])].map(v => `<option value="${esc(v)}">`).join('');
  $('#dlWho').innerHTML = uniq('assignee').map(v => `<option value="${esc(v)}">`).join('');
}

function openItem(item, carry) {
  const isNew = !item;
  cur = item ? structuredClone(item) : { id: uid(), projectId: S.pid, title: '', location: carry?.location || '', trade: carry?.trade || '', assignee: carry?.assignee || '', priority: carry?.priority || 'Medium', status: 'Open', due: carry?.due || '', notes: '', photos: [], created: Date.now(), _new: true };
  cur._added = []; cur._removed = [];
  $('#itemTitle').textContent = isNew ? 'New snag' : cur.ref;
  $('#iTitle').value = cur.title; $('#iLoc').value = cur.location; $('#iTrade').value = cur.trade; $('#iWho').value = cur.assignee;
  $('#iDue').value = cur.due; $('#iNotes').value = cur.notes;
  segSet($('#iPrio'), cur.priority); segSet($('#iStatus'), cur.status);
  $('#iMeta').textContent = isNew ? '' : `Logged ${fmtDT(cur.created)}${(cur.updated || cur.updatedAt) ? ' · Last updated ' + (cur.updatedBy ? 'by ' + cur.updatedBy + ', ' : '') + fmtDT(ts(cur)) : ''}${cur.closedAt ? ' · Closed ' + fmtDT(cur.closedAt) : ''}`;
  $('#itemDelete').hidden = isNew; $('#itemDup').hidden = isNew;
  fillDatalists(); renderPhotoStrip();
  const d = $('#dlgItem'); if (!d.open) d.showModal();
  if (isNew) setTimeout(() => $('#iTitle').focus(), 50);
}
function renderPhotoStrip() {
  $$('#photoStrip .ph').forEach(n => n.remove());
  const add = $('#photoStrip .addphoto');
  cur.photos.forEach((id, n) => {
    const d = document.createElement('div'); d.className = 'ph'; d.dataset.id = id;
    d.style.backgroundImage = `url(${S.thumbs.get(id)})`; d.innerHTML = `<span>✎ ${n + 1}</span>`;
    add.before(d);
  });
}
function readForm() {
  Object.assign(cur, { title: $('#iTitle').value.trim(), location: $('#iLoc').value.trim(), trade: $('#iTrade').value.trim(), assignee: $('#iWho').value.trim(), due: $('#iDue').value, notes: $('#iNotes').value.trim(), priority: $('#iPrio').dataset.v, status: $('#iStatus').dataset.v });
}
async function saveItem() {
  readForm();
  if (!cur.title) { $('#iTitle').focus(); toast('Add a short description'); return false; }
  const p = proj();
  if (cur._new) { p.counter = (p.counter || 0) + 1; cur.seq = p.counter; cur.ref = `${p.prefix || 'S'}-${String(p.counter).padStart(3, '0')}`; await put('projects', p); }
  else cur.updated = Date.now();
  cur.updatedAt = cur.updated || Date.now(); cur.updatedBy = S.me || '';
  const old = S.items.find(i => i.id === cur.id);
  if (cur.status === 'Closed' && (!old || old.status !== 'Closed')) cur.closedAt = Date.now();
  if (cur.status !== 'Closed') delete cur.closedAt;
  for (const id of cur._removed) { await del('photos', id); S.thumbs.delete(id); }
  const rec = { ...cur }; delete rec._new; delete rec._added; delete rec._removed;
  await put('items', rec);
  S.items = S.items.filter(i => i.id !== rec.id).concat(rec);
  toast(cur._new ? `${rec.ref} saved` : 'Saved');
  renderAll();
  return rec;
}
async function discardItem() { if (cur) for (const id of cur._added) { await del('photos', id); S.thumbs.delete(id); } cur = null; }

/* ---------- Photos ---------- */
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function fileToURL(f) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); }); }
function scaleTo(im, max, q = .82) {
  const k = Math.min(1, max / Math.max(im.naturalWidth || im.width, im.naturalHeight || im.height));
  const c = document.createElement('canvas'); c.width = Math.round((im.naturalWidth || im.width) * k); c.height = Math.round((im.naturalHeight || im.height) * k);
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
}
async function addPhotos(files) {
  for (const f of files) {
    try {
      const im = await loadImg(await fileToURL(f));
      const full = scaleTo(im, 1600), thumb = scaleTo(im, 240, .7);
      const ph = { id: uid(), orig: full, full, thumb, strokes: [] };
      await put('photos', ph); S.thumbs.set(ph.id, thumb); cur.photos.push(ph.id); cur._added.push(ph.id);
    } catch (e) { toast('Could not read that image'); }
  }
  renderPhotoStrip();
}

/* ---------- Markup ---------- */
const M = { ph: null, img: null, strokes: [], tool: 'pen', color: '#ef4444', drawing: null };
async function openMarkup(id) {
  M.ph = await get('photos', id); if (!M.ph) return;
  M.img = await loadImg(M.ph.orig); M.strokes = structuredClone(M.ph.strokes || []);
  const c = $('#markCanvas'); c.width = M.img.naturalWidth; c.height = M.img.naturalHeight;
  $$('#markTools .sw').forEach(s => s.classList.toggle('on', s.dataset.c === M.color));
  $('#dlgMark').showModal(); drawMark();
}
function drawStroke(g, s, W) {
  g.strokeStyle = s.c; g.fillStyle = s.c; g.lineWidth = s.w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = s.w * .6;
  const p = s.p; if (!p.length) return;
  if (s.t === 'pen') { g.beginPath(); g.moveTo(p[0][0], p[0][1]); p.forEach(q => g.lineTo(q[0], q[1])); g.stroke(); }
  else if (p.length > 1) {
    const [a, b] = [p[0], p[p.length - 1]];
    if (s.t === 'arrow') {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), h = s.w * 4.5;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - Math.cos(ang) * h * .6, b[1] - Math.sin(ang) * h * .6); g.stroke();
      g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - h * Math.cos(ang - .45), b[1] - h * Math.sin(ang - .45)); g.lineTo(b[0] - h * Math.cos(ang + .45), b[1] - h * Math.sin(ang + .45)); g.closePath(); g.fill();
    } else { g.beginPath(); g.ellipse((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.abs(b[0] - a[0]) / 2 || 1, Math.abs(b[1] - a[1]) / 2 || 1, 0, 0, Math.PI * 2); g.stroke(); }
  }
}
function drawMark(target) {
  const c = target || $('#markCanvas'), g = c.getContext('2d');
  g.drawImage(M.img, 0, 0, c.width, c.height);
  [...M.strokes, ...(M.drawing ? [M.drawing] : [])].forEach(s => drawStroke(g, s, c.width));
}
function canvasPt(e) { const c = $('#markCanvas'), r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; }
function initMarkup() {
  const c = $('#markCanvas');
  c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); M.drawing = { t: M.tool, c: M.color, w: Math.max(5, c.width / 110), p: [canvasPt(e)] }; drawMark(); });
  c.addEventListener('pointermove', e => { if (!M.drawing) return; const pt = canvasPt(e); if (M.drawing.t === 'pen') M.drawing.p.push(pt); else M.drawing.p[1] = pt; drawMark(); });
  const end = () => { if (M.drawing && M.drawing.p.length > 1) M.strokes.push(M.drawing); M.drawing = null; drawMark(); };
  c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
  $('#markTools').addEventListener('click', e => {
    const b = e.target.closest('[data-tool]'), sw = e.target.closest('.sw');
    if (b) { M.tool = b.dataset.tool; $$('#markTools [data-tool]').forEach(x => x.classList.toggle('on', x === b)); }
    if (sw) { M.color = sw.dataset.c; $$('#markTools .sw').forEach(x => x.classList.toggle('on', x === sw)); }
  });
  $('#markUndo').onclick = () => { M.strokes.pop(); drawMark(); };
  $('#markCancel').onclick = () => $('#dlgMark').close();
  $('#markDelPhoto').onclick = () => {
    if (!confirm('Remove this photo from the snag?')) return;
    cur.photos = cur.photos.filter(x => x !== M.ph.id); cur._removed.push(M.ph.id); renderPhotoStrip(); $('#dlgMark').close();
  };
  $('#markSave').onclick = async () => {
    const out = document.createElement('canvas'); out.width = M.img.naturalWidth; out.height = M.img.naturalHeight; drawMark(out);
    M.ph.full = out.toDataURL('image/jpeg', .82); M.ph.strokes = M.strokes; M.ph.updatedAt = Date.now();
    const im = await loadImg(M.ph.full); M.ph.thumb = scaleTo(im, 240, .7);
    await put('photos', M.ph); S.thumbs.set(M.ph.id, M.ph.thumb); renderPhotoStrip(); renderList(); $('#dlgMark').close();
  };
}

/* ---------- Export ---------- */
function download(name, data, type) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type })); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
const slug = s => (s || 'project').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'project';
function makeCSV() {
  const cols = ['ID', 'Description', 'Location', 'Trade', 'Priority', 'Status', 'Assigned to', 'Due (dd/mm/yyyy)', 'Logged', 'Closed', 'Last updated', 'Updated by', 'Notes', 'Photos'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = pItems().sort((a, b) => a.seq - b.seq).map(i => [i.ref, i.title, i.location, i.trade, i.priority, i.status, i.assignee, fmtD(i.due), fmtDT(i.created), i.closedAt ? fmtDT(i.closedAt) : '', fmtDT(ts(i)), i.updatedBy || '', i.notes, (i.photos || []).length]);
  return '\ufeff' + [cols, ...rows].map(r => r.map(q).join(',')).join('\r\n');
}
async function backup() {
  const data = { app: 'SnagPad', version: 1, exported: new Date().toISOString(), projects: await all('projects'), items: await all('items'), photos: await all('photos') };
  download(`snagpad-backup-${todayISO()}.json`, JSON.stringify(data), 'application/json'); toast('Backup downloaded');
}
async function restore(file) {
  try {
    const d = JSON.parse(await file.text());
    if (d.app !== 'SnagPad' || !Array.isArray(d.projects)) throw 0;
    if (!confirm(`Restore ${d.projects.length} project(s) and ${d.items.length} snag(s)? Existing records with the same ID will be replaced.`)) return;
    for (const p of d.projects) await put('projects', p);
    for (const i of d.items || []) await put('items', i);
    for (const ph of d.photos || []) await put('photos', ph);
    await load(); renderAll(); toast('Backup restored');
  } catch { toast('That is not a SnagPad backup file'); }
}

/* ---------- Sharing (no server: a .snagpad file or a #link, sent by WhatsApp / email / AirDrop) ---------- */
const SHARE_KEYS = ['title', 'location', 'trade', 'assignee', 'priority', 'status', 'due', 'notes', 'updatedBy'];
const LINK_WARN = 2000, LINK_MAX = 60000;
const b64u = buf => { const a = new Uint8Array(buf); let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const b = atob(s), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
const zip = str => new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
const unzip = bytes => new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();

async function setMe(v) { S.me = (v || '').trim().slice(0, 40); await put('meta', { k: 'me', v: S.me }); $('#myName').value = S.me; $('#shareMe').value = S.me; renderFilters(); renderList(); }

async function buildPayload(withPhotos) {
  const p = { ...proj() }, items = pItems().map(i => ({ ...i }));
  const d = { app: 'SnagPad', kind: 'share', version: 2, exported: Date.now(), from: S.me || '', project: p, items };
  if (withPhotos) {
    const ids = [...new Set(items.flatMap(i => i.photos || []))];
    d.photos = (await Promise.all(ids.map(id => get('photos', id)))).filter(Boolean);
  } else {
    d.noPhotos = true;
    if ((p.trades || []).join('|') === DEFAULT_TRADES.join('|')) delete p.trades;
    d.items = items.map(i => { const o = {}; for (const [k, v] of Object.entries(i)) if (v !== '' && v != null && k !== 'projectId' && k !== 'photos') o[k] = v; if (i.photos?.length) o.np = i.photos.length; return o; });
  }
  return d;
}
const shareName = () => `${slug(proj().name)}-${todayISO()}${S.me ? '-' + slug(S.me) : ''}.snagpad`;
let prepared = null;
async function prepareFile() {
  const d = await buildPayload(true);
  prepared = { pid: S.pid, me: S.me, file: new File([JSON.stringify(d)], shareName(), { type: 'application/json' }), n: d.items.length, ph: d.photos.length };
  return prepared;
}
async function shareFile() {
  if (!prepared || prepared.pid !== S.pid || prepared.me !== S.me) await prepareFile();
  const f = prepared.file;
  if (navigator.canShare && navigator.share) {
    try { if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: `SnagPad: ${proj().name}` }); toast('Shared'); return 'share'; } }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  download(f.name, f, 'application/json'); toast(`File saved: ${f.name}. Send it by WhatsApp, email or AirDrop.`); return 'download';
}
async function makeLink() {
  const json = JSON.stringify(await buildPayload(false));
  const code = canZip() ? 'z' + b64u(await zip(json)) : 'j' + b64u(new TextEncoder().encode(json));
  return `${location.origin}${location.pathname}#snagpad=${code}`;
}
async function showLink() {
  const link = await makeLink(), n = link.length;
  $('#linkBox').hidden = false; $('#linkOut').value = n > LINK_MAX ? '' : link;
  const w = $('#linkWarn');
  w.className = 'small ' + (n > LINK_WARN ? 'warn' : 'muted');
  w.textContent = n > LINK_MAX ? `This project is too big for a link (${n.toLocaleString()} characters). Use "Share file" instead.`
    : n > LINK_WARN ? `Long link (${n.toLocaleString()} characters). WhatsApp handles it, but SMS, some email apps and chat apps may cut it off. If it doesn't open on the other phone, send the file instead. Photos are not included in links.`
    : `Link ready (${n.toLocaleString()} characters). Photos are not included in links; send the file if they need the photos.`;
  $('#btnCopyLink').hidden = $('#btnSendLink').hidden = n > LINK_MAX;
  $('#btnSendLink').hidden = n > LINK_MAX || !navigator.share;
  return link;
}
async function decodeLink(text) {
  const m = String(text).match(/snagpad=([jz])([A-Za-z0-9_-]+)/); if (!m) throw new Error('nolink');
  const bytes = unb64u(m[2]);
  return JSON.parse(m[1] === 'z' ? await unzip(bytes) : new TextDecoder().decode(bytes));
}
function validShare(d) {
  if (d && d.app === 'SnagPad' && Array.isArray(d.projects) && d.projects.length === 1 && !d.kind) // a one-project backup file also works
    d = { app: 'SnagPad', kind: 'share', version: 2, exported: Date.parse(d.exported) || Date.now(), from: '', project: d.projects[0], items: d.items || [], photos: d.photos || [] };
  if (!d || d.app !== 'SnagPad' || d.kind !== 'share' || !d.project?.id || !Array.isArray(d.items)) return null;
  return d;
}
function normIn(raw, d, pid) {
  const it = { ...raw, projectId: pid }; delete it.np;
  if (d.noPhotos) { for (const k of SHARE_KEYS) if (it[k] == null) it[k] = ''; delete it.photos; }
  if (it.status !== 'Closed') delete it.closedAt;
  return it;
}
function diffShare(d) {
  const local = S.projects.find(p => p.id === d.project.id), r = { local, add: [], upd: [], keep: 0, same: 0, onlyHere: 0 };
  for (const it of d.items) {
    const l = S.items.find(x => x.id === it.id);
    if (!l) r.add.push(it); else if (ts(it) > ts(l)) r.upd.push([l, it]); else if (ts(it) < ts(l)) r.keep++; else r.same++;
  }
  if (local) r.onlyHere = S.items.filter(i => i.projectId === local.id && !d.items.some(x => x.id === i.id)).length;
  return r;
}
let pending = null;
function showImport(d) {
  pending = d; const r = diffShare(d), np = d.noPhotos ? d.items.reduce((a, i) => a + (i.np || 0), 0) : (d.photos || []).length;
  const chg = ([l, it]) => `<li><b>${esc(it.ref)}</b> ${esc(it.title || l.title)}${(it.status && it.status !== l.status) ? ` — ${esc(l.status)} → <b>${esc(it.status)}</b>` : ' — edited'}${it.updatedBy ? ` <span class="muted">(${esc(it.updatedBy)}, ${fmtDT(ts(it))})</span>` : ''}</li>`;
  $('#impPreview').innerHTML = `
    <div class="card flat"><b>${esc(d.project.name)}</b><div class="muted small">${d.from ? `From ${esc(d.from)} · ` : ''}shared ${fmtDT(d.exported || Date.now())} · ${d.items.length} snag(s) · ${d.noPhotos ? `link without photos${np ? ` (${np} photo(s) stay on the sender's phone)` : ''}` : `${np} photo(s)`}</div></div>
    ${r.local ? `<p><b>This project is already on this phone, so it will be merged.</b> For each snag, the newest edit wins. Nothing is deleted.</p>
      <ul class="implist">
        <li>${r.add.length} new snag(s) will be added</li>
        <li>${r.upd.length} snag(s) will be updated (their edit is newer)</li>
        <li>${r.keep} snag(s) kept as they are here (your edit is newer)</li>
        <li>${r.same} unchanged${r.onlyHere ? ` · ${r.onlyHere} snag(s) only on this phone stay as they are` : ''}</li>
      </ul>${r.upd.length ? `<p class="small"><b>Updates:</b></p><ul class="implist small">${r.upd.slice(0, 15).map(chg).join('')}${r.upd.length > 15 ? `<li>…and ${r.upd.length - 15} more</li>` : ''}</ul>` : ''}`
    : `<p>This is a new project on this phone. ${d.items.length} snag(s) will be added.</p>`}
    ${!S.me ? `<p class="small warn">Tip: set <b>My name</b> (Settings) so your updates show who made them.</p>` : ''}`;
  $('#dlgImport').showModal();
}
async function applyShare(d) {
  const inP = d.project; let p = S.projects.find(x => x.id === inP.id), isNew = !p;
  if (isNew) { p = { ...newProject(inP.name), ...inP }; if (!Array.isArray(p.trades)) p.trades = DEFAULT_TRADES.slice(); }
  else { p.trades = [...new Set([...(p.trades || []), ...(inP.trades || [])])]; for (const k of ['client', 'address', 'by']) if (!p[k] && inP[k]) p[k] = inP[k]; }
  p.counter = Math.max(p.counter || 0, inP.counter || 0);
  for (const ph of d.photos || []) { const l = await get('photos', ph.id); if (!l || (ph.updatedAt || 0) > (l.updatedAt || 0)) await put('photos', ph); }
  const have = new Set(await req(tx('photos').getAllKeys()));
  const refs = new Map(S.items.filter(i => i.projectId === p.id).map(i => [i.ref, i.id]));
  let add = 0, upd = 0, renum = 0;
  for (const raw of d.items) {
    const it = normIn(raw, d, p.id), l = S.items.find(x => x.id === it.id);
    if (!l) {
      it.photos = (it.photos || []).filter(id => have.has(id));
      if (refs.has(it.ref) && refs.get(it.ref) !== it.id) { p.counter++; it.seq = p.counter; it.ref = `${p.prefix || 'S'}-${String(p.counter).padStart(3, '0')}`; renum++; }
      refs.set(it.ref, it.id); await put('items', it); add++;
    } else if (ts(it) > ts(l)) {
      const merged = { ...it, photos: [...new Set([...(it.photos || []), ...(l.photos || [])])].filter(id => have.has(id)) };
      if (merged.status !== 'Closed') delete merged.closedAt;
      await put('items', merged); upd++;
    }
  }
  await put('projects', p);
  await load(); await setProject(p.id);
  toast(`${isNew ? 'Imported' : 'Merged'}: ${add} added, ${upd} updated${renum ? `, ${renum} renumbered` : ''}`);
  return { add, upd, renum };
}
async function importFile(file) {
  try { const d = validShare(JSON.parse(await file.text())); if (!d) throw 0; showImport(d); }
  catch { toast('That is not a SnagPad share file'); }
}
async function importLinkText(text) {
  try { const d = validShare(await decodeLink(text)); if (!d) throw 0; showImport(d); return true; }
  catch { toast('This SnagPad link is incomplete or damaged. Ask for the file instead.'); return false; }
}
function clearHash() { if (location.hash.includes('snagpad=')) history.replaceState(null, '', location.pathname + location.search); }
async function checkHash() { if (location.hash.includes('snagpad=')) { const ok = await importLinkText(location.hash); if (!ok) clearHash(); } }
function openShare() {
  $('#shareMe').value = S.me; $('#linkBox').hidden = true; $('#shareProjName').textContent = proj()?.name || '';
  if (!$('#dlgShare').open) $('#dlgShare').showModal();
  prepareFile().catch(() => { });
}
function bindShare() {
  $('#shareBtn').onclick = openShare; $('#btnOpenShare').onclick = openShare;
  $('#shareClose').onclick = () => $('#dlgShare').close();
  $('#shareMe').onchange = async e => { await setMe(e.target.value); prepareFile().catch(() => { }); };
  $('#btnSaveMe').onclick = async () => { await setMe($('#myName').value); toast(S.me ? `Hi ${S.me}. Your edits will show your name.` : 'Name cleared'); };
  $('#btnShareFile').onclick = () => shareFile();
  $('#btnShareLink').onclick = () => showLink();
  $('#btnCopyLink').onclick = async () => {
    const t = $('#linkOut'); t.select();
    try { await navigator.clipboard.writeText(t.value); toast('Link copied. Paste it into WhatsApp.'); } catch { document.execCommand?.('copy'); toast('Link selected. Copy it and paste into WhatsApp.'); }
  };
  $('#btnSendLink').onclick = () => navigator.share({ title: `SnagPad: ${proj().name}`, url: $('#linkOut').value }).catch(() => { });
  $('#fileImport').onchange = e => { if (e.target.files[0]) importFile(e.target.files[0]); e.target.value = ''; };
  $('#btnPasteLink').onclick = async () => { if (await importLinkText($('#pasteLink').value)) $('#pasteLink').value = ''; };
  $('#impCancel').onclick = () => { pending = null; clearHash(); $('#dlgImport').close(); };
  $('#dlgImport').addEventListener('cancel', () => { pending = null; clearHash(); });
  $('#impOk').onclick = async () => { const d = pending; pending = null; $('#dlgImport').close(); clearHash(); if (d) { if ($('#dlgShare').open) $('#dlgShare').close(); await applyShare(d); } };
}

/* ---------- Sample data ---------- */
async function loadSample() {
  const p = proj();
  const sample = [
    ['Hairline crack on wall below window', 'Block A / L3 / Unit 3-05 / Living', 'Plastering', 'Medium', 'Open', 'ABC Plaster Works', 7],
    ['Paint drips and patchy finish on ceiling', 'Block A / L3 / Unit 3-05 / Bedroom 2', 'Painting', 'Low', 'In progress', 'Bright Coat Painting', 5],
    ['Hollow-sounding floor tiles (approx. 4 nos)', 'Block A / L3 / Unit 3-02 / Kitchen', 'Tiling', 'High', 'Open', 'Tile Pro', -2],
    ['Main door does not close fully, rubbing at head', 'Block A / L3 / Unit 3-02 / Entrance', 'Doors & Ironmongery', 'Medium', 'Ready for inspection', 'Joinery subcon', 3],
    ['Water ponding on balcony floor after rain', 'Block A / L3 / Unit 3-01 / Balcony', 'Waterproofing', 'Critical', 'Open', 'WP Specialist', -1],
    ['Missing cover plate at power point', 'Block A / L3 / Corridor', 'Electrical', 'Low', 'Closed', 'Electrical subcon', 0],
    ['Window sealant gap at bottom corner', 'Block A / L3 / Unit 3-05 / Bedroom 1', 'Windows & Glazing', 'High', 'In progress', 'Glazing subcon', 4],
    ['Basin waste pipe leaking under vanity', 'Block A / L3 / Unit 3-01 / Bath', 'Plumbing', 'High', 'Open', 'Plumbing subcon', 2]
  ];
  const base = Date.now() - 8 * 864e5;
  for (const [k, [title, location, trade, priority, status, assignee, dueIn]] of sample.entries()) {
    p.counter = (p.counter || 0) + 1;
    const due = new Date(Date.now() + dueIn * 864e5); due.setMinutes(due.getMinutes() - due.getTimezoneOffset());
    const it = { id: uid(), projectId: p.id, seq: p.counter, ref: `${p.prefix || 'S'}-${String(p.counter).padStart(3, '0')}`, title, location, trade, priority, status, assignee, due: due.toISOString().slice(0, 10), notes: k === 0 ? 'Sample record (fictional). Rake out, fill and repaint whole wall panel.' : '', photos: [], created: base + k * 36e5 * 7 };
    if (status === 'Closed') it.closedAt = Date.now() - 864e5;
    await put('items', it); S.items.push(it);
  }
  if (p.name === 'My first project') p.name = 'Sample — Residential Block A (fictional)';
  await put('projects', p); renderAll(); toast('Sample snags loaded');
}

/* ---------- Events ---------- */
function bind() {
  $('#tabs').onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#tabs button').forEach(x => x.classList.toggle('on', x === b));
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + b.dataset.view));
    $('#fab').hidden = b.dataset.view !== 'list';
    if (b.dataset.view === 'report') buildReport();
    if (b.dataset.view === 'summary') renderSummary();
    window.scrollTo(0, 0);
  };
  $('#q').oninput = e => { S.filter.q = e.target.value; renderList(); };
  $('#statusChips').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    if (b.dataset.mine) {
      if (!S.me) { toast('Set "My name" first'); openShare(); setTimeout(() => $('#shareMe').focus(), 60); return; }
      S.filter.mine = !S.filter.mine;
    } else S.filter.status = b.dataset.k;
    renderFilters(); renderList();
  };
  $('#fTrade').onchange = e => { S.filter.trade = e.target.value; renderList(); };
  $('#fPrio').onchange = e => { S.filter.prio = e.target.value; renderList(); };
  $('#fSort').onchange = e => { S.filter.sort = e.target.value; renderList(); };
  $('#list').onclick = async e => {
    const nx = e.target.closest('[data-next]');
    if (nx) {
      e.stopPropagation();
      const it = S.items.find(i => i.id === nx.dataset.next);
      it.status = STATUSES[STATUSES.indexOf(it.status) + 1]; it.updated = it.updatedAt = Date.now(); it.updatedBy = S.me || ''; if (it.status === 'Closed') it.closedAt = Date.now();
      await put('items', it); toast(`${it.ref} → ${it.status}`); renderList(); renderFilters(); return;
    }
    const card = e.target.closest('.item'); if (card) openItem(S.items.find(i => i.id === card.dataset.id));
  };
  $('#fab').onclick = () => openItem(null);
  $('#empty').insertAdjacentHTML('beforeend', '<button class="btn" id="btnSample">Load sample snags</button>');
  $('#btnSample').onclick = loadSample;

  segInit($('#iPrio'), PRIOS, PCOL); segInit($('#iStatus'), STATUSES, SCOL);
  $('#photoInput').onchange = e => { addPhotos([...e.target.files]); e.target.value = ''; };
  $('#photoStrip').onclick = e => { const ph = e.target.closest('.ph'); if (ph) openMarkup(ph.dataset.id); };
  $('#itemForm').onsubmit = async e => { e.preventDefault(); if (await saveItem()) { cur = null; $('#dlgItem').close(); } };
  $('#itemSaveNext').onclick = async () => { const r = await saveItem(); if (r) openItem(null, r); };
  $('#itemCancel').onclick = async () => { await discardItem(); $('#dlgItem').close(); };
  $('#dlgItem').addEventListener('cancel', () => discardItem());
  $('#itemDelete').onclick = async () => {
    if (!confirm(`Delete ${cur.ref}? This cannot be undone.`)) return;
    for (const id of cur.photos.concat(cur._removed)) { await del('photos', id); S.thumbs.delete(id); }
    await del('items', cur.id); S.items = S.items.filter(i => i.id !== cur.id); cur = null; $('#dlgItem').close(); renderAll(); toast('Deleted');
  };
  $('#itemDup').onclick = async () => { const r = await saveItem(); if (!r) return; openItem(null, r); $('#iTitle').value = r.title; $('#iNotes').value = r.notes; toast('Duplicated — edit and save'); };

  $('#projBtn').onclick = () => { renderProjList(); $('#dlgProj').showModal(); };
  $('#projClose').onclick = () => $('#dlgProj').close();
  $('#projList').onclick = async e => { const p = e.target.closest('.proj'); if (p) { await setProject(p.dataset.id); $('#dlgProj').close(); } };
  $('#btnNewProj').onclick = async () => {
    const n = $('#newProjName').value.trim(); if (!n) return $('#newProjName').focus();
    const p = newProject(n); await put('projects', p); S.projects.push(p); $('#newProjName').value = ''; await setProject(p.id); $('#dlgProj').close(); toast('Project created');
  };
  $('#btnSaveProj').onclick = async () => {
    const p = proj();
    Object.assign(p, { name: $('#pName').value.trim() || p.name, client: $('#pClient').value.trim(), address: $('#pAddr').value.trim(), by: $('#pBy').value.trim(), prefix: ($('#pPrefix').value.trim() || 'S').replace(/[^\w]/g, '').slice(0, 6) || 'S', trades: $('#pTrades').value.split(',').map(s => s.trim()).filter(Boolean) });
    await put('projects', p); renderAll(); toast('Project saved');
  };
  $('#btnDelProj').onclick = async () => {
    const p = proj(), its = pItems();
    if (!confirm(`Delete project "${p.name}" and its ${its.length} snag(s)? Back up first if unsure.`)) return;
    for (const i of its) { for (const id of i.photos || []) await del('photos', id); await del('items', i.id); }
    await del('projects', p.id); S.items = S.items.filter(i => i.projectId !== p.id); S.projects = S.projects.filter(x => x.id !== p.id);
    if (!S.projects.length) { const np = newProject('My first project'); await put('projects', np); S.projects.push(np); }
    await setProject(S.projects[0].id); toast('Project deleted');
  };
  $('#btnBackup').onclick = backup;
  $('#fileRestore').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };

  $('#repStatuses').onchange = buildReport; ['#repPhotos', '#repNotes', '#repSig'].forEach(s => $(s).onchange = buildReport);
  $('#btnPrint').onclick = async () => { $('#printRoot').innerHTML = `<div class="reportwrap">${await buildReport()}</div>`; setTimeout(() => window.print(), 300); };
  $('#btnCsv').onclick = () => { download(`snags-${slug(proj().name)}-${todayISO()}.csv`, makeCSV(), 'text/csv;charset=utf-8'); toast('CSV downloaded'); };
  if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.csv', { type: 'text/csv' })] })) {
    $('#btnShare').hidden = false;
    $('#btnShare').onclick = () => navigator.share({ files: [new File([makeCSV()], `snags-${slug(proj().name)}.csv`, { type: 'text/csv' })], title: 'Snag list' }).catch(() => { });
  }
  initMarkup(); bindShare();
}
function renderProjList() {
  $('#projList').innerHTML = S.projects.map(p => { const its = S.items.filter(i => i.projectId === p.id), open = its.filter(i => i.status !== 'Closed').length;
    return `<div class="proj ${p.id === S.pid ? 'on' : ''}" data-id="${p.id}"><b>${esc(p.name)}</b><span class="muted small">${open} open · ${its.length} total</span></div>`; }).join('');
}

/* ---------- Boot ---------- */
(async () => {
  try { await openDB(); await load(); bind(); renderAll(); checkHash(); window.addEventListener('hashchange', checkHash); }
  catch (e) { document.body.insertAdjacentHTML('afterbegin', `<p style="padding:20px;color:#b91c1c">SnagPad could not open local storage on this browser (${esc(e?.message || e)}). Private browsing mode may block it.</p>`); }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
})();
})();
