/* =========================================================
   상세페이지 문안 자동화 — 화면 로직
   ========================================================= */
(function () {
  'use strict';
  const C = window.CONFIG, GEN = window.GEN, COMP = window.COMP, FILES = window.FILES;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const HKEY = 'dp_history_v1';
  const ROLE_KO = { eyebrow: '상단 표기', title: '제품명', en: '영문명', headline: '헤드라인', h3: '소제목', body: '본문', keypoint: '키포인트', meta: '보조 표기', note: '주석', label: '라벨' };

  const S = { brand: null, input: null, blocks: [], ctx: null, opacity: C.defaultOpacity, histId: null, moving: false, issues: [], dirty: false };

  /* ---------------- 공통 ---------------- */
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms || 2200); }
  function busy(on, msg) { let b = $('#busy'); if (on) { if (!b) { b = document.createElement('div'); b.id = 'busy'; b.className = 'busy'; document.body.appendChild(b); } b.textContent = msg || '처리 중…'; } else if (b) b.remove(); }
  function show(v) { ['#vBrand', '#vInput', '#vEdit'].forEach(id => $(id).classList.toggle('hidden', id !== v)); $('.main').scrollTop = 0; }
  function brandColor(id) { return (C.brands[id] || {}).accent || '#111'; }
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
  function today() { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0'); }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* ---------------- 1. 비밀번호 ---------------- */
  function sha256js(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    const bytes = new TextEncoder().encode(ascii); const l = bytes.length * 8;
    const K = [], H = []; let p = 0;
    for (let c = 2; p < 64; c++) { let ok = 1; for (let d = 2; d * d <= c; d++) if (c % d === 0) { ok = 0; break; } if (ok) { if (p < 8) H[p] = (Math.pow(c, 1 / 2) * 4294967296) | 0; K[p++] = (Math.pow(c, 1 / 3) * 4294967296) | 0; } }
    const m = Array.from(bytes); m.push(0x80); while (m.length % 64 !== 56) m.push(0);
    for (let i = 7; i >= 0; i--) m.push(i > 3 ? 0 : (l >>> (i * 8)) & 0xff);
    for (let j = 0; j < m.length; j += 64) {
      const w = []; for (let i = 0; i < 16; i++) w[i] = (m[j + i * 4] << 24) | (m[j + i * 4 + 1] << 16) | (m[j + i * 4 + 2] << 8) | m[j + i * 4 + 3];
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        if (i >= 16) { const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10); w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0; }
        const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }
  async function sha256(s) {
    if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join(''); }
    return sha256js(s);
  }
  function enterApp() { $('#gate').classList.add('hidden'); $('#app').classList.remove('hidden'); renderHistory(); show('#vBrand'); }
  $('#gateForm').addEventListener('submit', async e => {
    e.preventDefault();
    const h = await sha256($('#gatePw').value);
    if (h === C.passwordHash) { sessionStorage.setItem('dp_auth', h); enterApp(); }
    else { $('#gateErr').textContent = '비밀번호가 올바르지 않습니다.'; const c = $('.gate-card'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); $('#gatePw').select(); }
  });
  $('#btnLock').onclick = () => { sessionStorage.removeItem('dp_auth'); location.reload(); };

  /* ---------------- 2. 브랜드 ---------------- */
  function renderBrands() {
    $('#brandGrid').innerHTML = Object.values(C.brands).map(b => {
      const L = window.LAYOUTS[b.id]; const img = L ? L.base + L.images[0].src : '';
      return `<button class="brand-card" data-b="${b.id}"><div class="bg" style="background-image:url('${img}')"></div><div class="shade"></div>
        <div class="txt"><div class="en" style="color:${b.accent}">${esc(b.en)}</div><div class="nm">${esc(b.name)}</div><div class="ds">${esc(b.desc)}</div></div><span class="go">선택 →</span></button>`;
    }).join('');
    $$('.brand-card').forEach(el => el.onclick = () => startInput(el.dataset.b));
  }
  function setBrandChip(el, id) { el.textContent = C.brands[id].name; el.style.setProperty('--bc', brandColor(id)); el.style.color = brandColor(id); }
  function startInput(brandId, input) {
    S.brand = brandId; S.histId = input ? S.histId : null;
    setBrandChip($('#inBrand'), brandId);
    const b = C.brands[brandId];
    $('#btnTpl').href = b.template; $('#btnTpl').setAttribute('download', b.templateName);
    fillForm(input || {});
    $('#drop').classList.remove('ok'); $('#drop .drop-in b').textContent = '입력템플릿(.docx) 업로드';
    show('#vInput'); refreshAnalysis();
  }
  $('#btnNew').onclick = () => { S.histId = null; S.brand = null; renderHistory(); show('#vBrand'); };

  /* ---------------- 3. 입력 ---------------- */
  const F = { name: '#fName', volume: '#fVol', m1: '#fM1', m2: '#fM2', m3: '#fM3', inci: '#fInci', nameEn: '#fEn', line: '#fLine', content: '#fContent', functional: '#fFunc', funcNo: '#fFuncNo', clinTitle: '#fClinT', clinResult: '#fClinR', clinInfo: '#fClinI', irrResult: '#fIrrR', irrInfo: '#fIrrI', usage: '#fUsage', maker: '#fMaker', seller: '#fSeller', phone: '#fPhone', expiry: '#fExpiry', caution: '#fCaution' };
  function readForm() {
    const o = {}; Object.keys(F).forEach(k => o[k] = $(F[k]).value.trim());
    o.mains = [o.m1, o.m2, o.m3].filter(Boolean); return o;
  }
  function fillForm(o) {
    const m = o.mains || [];
    Object.keys(F).forEach(k => { let v = o[k]; if (k === 'm1') v = m[0]; if (k === 'm2') v = m[1]; if (k === 'm3') v = m[2]; $(F[k]).value = v || ''; });
    const anyOpt = ['nameEn', 'line', 'content', 'functional', 'clinTitle', 'clinResult', 'irrResult', 'usage', 'maker', 'seller', 'phone'].some(k => o[k]);
    $('#optBox').open = !!anyOpt;
  }
  function mainsFromForm() { return [$('#fM1').value.trim(), $('#fM2').value.trim(), $('#fM3').value.trim()]; }
  function setMains(arr) { ['#fM1', '#fM2', '#fM3'].forEach((id, i) => $(id).value = arr[i] || ''); refreshAnalysis(); }

  let lastAn = null;
  function refreshAnalysis() {
    const inp = readForm();
    const an = GEN.analyze(inp.inci); lastAn = an;
    const mains = mainsFromForm(); const mN = mains.map(GEN.norm);
    const rec = GEN.recommend(an, [], 6, inp.functional).map(GEN.norm);
    ['#fM1', '#fM2', '#fM3'].forEach(id => $(id).classList.toggle('filled', !!$(id).value.trim()));
    $('#ingCount').textContent = an.items.length ? `${an.items.length}개 성분` : '';
    if (!an.items.length) $('#ingChips').innerHTML = '<p class="muted small">전성분을 붙여넣으면 성분을 자동으로 분류합니다.</p>';
    else $('#ingChips').innerHTML = an.items.map((it, i) => {
      const nm = it.raw.replace(/\(.*?\)/g, '').trim();
      const si = mN.indexOf(GEN.norm(nm)) >= 0 ? mN.indexOf(GEN.norm(nm)) : mN.indexOf(GEN.norm(it.k));
      const fn = an.functional.find(f => f.k === it.k);
      const cls = si >= 0 ? 'sel' : fn ? 'fn' : it.base ? 'base' : '';
      const tip = it.base ? '베이스 성분' : (fn ? `기능성 고시 성분(${fn.type})` : '') + (it.h ? ' · ' + it.h : '') + (it.guess ? ' (이름 규칙으로 작성)' : '');
      return `<button type="button" class="chip ${cls}${rec.indexOf(GEN.norm(it.k)) >= 0 && si < 0 ? ' key' : ''}" data-k="${esc(nm)}" title="${esc(tip)}">${esc(nm)}${si >= 0 ? `<sup>${si + 1}</sup>` : ''}</button>`;
    }).join('');
    $$('#ingChips .chip').forEach(ch => ch.onclick = () => {
      const k = ch.dataset.k; const cur = mainsFromForm(); const ix = cur.map(GEN.norm).indexOf(GEN.norm(k));
      if (ix >= 0) { cur[ix] = ''; setMains(cur.filter(Boolean)); return; }
      const empty = cur.findIndex(x => !x);
      if (empty < 0) { toast('대표성분은 최대 3개입니다. 선택된 성분을 눌러 해제해 주세요.'); return; }
      cur[empty] = k; setMains(cur);
    });
    // 경고 · 감지
    const warns = inp.name || an.items.length ? GEN.checkInput(inp, an) : [];
    $('#inAlerts').innerHTML = warns.map(w => `<div class="al ${w.level}">${esc(w.msg)}</div>`).join('');
    const sv = GEN.splitVolume(inp.name, inp.volume); const t = GEN.detectType(sv.title);
    const en = inp.nameEn || GEN.englishName(sv.title);
    $('#detect').innerHTML = inp.name ? `제품유형 <b>${esc(t.ko)}</b> · 영문명 <b>${esc(en || '자동 변환 불가 — 선택 입력에서 입력')}</b>${sv.volume ? ` · 용량 <b>${esc(sv.volume)}</b>` : ''}` : '';
  }
  const refreshDeb = debounce(refreshAnalysis, 250);
  Object.values(F).forEach(id => { $(id).addEventListener('input', refreshDeb); $(id).addEventListener('change', refreshDeb); });
  $('#btnRecommend').onclick = () => {
    const inp = readForm(); const cur = mainsFromForm().filter(Boolean);
    if (!lastAn || !lastAn.items.length) { toast('전성분을 먼저 붙여넣어 주세요.'); return; }
    const add = GEN.recommend(lastAn, cur, 3 - cur.length, inp.functional);
    setMains(cur.concat(add)); toast(add.length ? `추천 성분: ${add.join(', ')}` : '추천할 성분이 없습니다.');
  };

  // Word 업로드
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadDocx(f); });
  $('#docxFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) loadDocx(f); e.target.value = ''; });
  async function loadDocx(file) {
    if (!/\.docx$/i.test(file.name)) { toast('.docx 파일만 업로드할 수 있습니다.'); return; }
    try {
      const { map, brandText } = await FILES.parseDocx(file);
      const g = (...ks) => { for (const k of ks) if (map[k] && map[k].trim()) return map[k].trim(); return ''; };
      const join = (...v) => v.filter(Boolean).join(', ');
      const fn = g('기능성화장품여부', '기능성화장품'); 
      const o = {
        name: g('제품명'), volume: g('용량', '용량중량'), mains: [g('대표성분1'), g('대표성분2'), g('대표성분3')].filter(Boolean), inci: g('전성분'),
        nameEn: g('영문제품명', '영문명'), line: g('라인명'), content: g('대표성분함량'), functional: fn === '해당없음' || fn === '해당 없음' ? '' : fn, funcNo: g('기능성심사번호', '기능성심사보고번호'),
        clinTitle: g('인체적용시험명'), clinResult: g('인체적용시험결과'), clinInfo: g('인체적용시험정보기관기간인원', '인체적용시험정보') || join(g('인체적용시험기관'), g('인체적용시험기간'), g('인체적용시험인원')),
        irrResult: g('피부자극테스트결과'), irrInfo: g('피부자극테스트정보기관기간', '피부자극테스트정보') || join(g('피부자극테스트기관'), g('피부자극테스트기간'), g('피부자극테스트인원')),
        usage: g('사용법한줄에한단계', '사용법', '기본사용법'), maker: g('화장품제조업자'), seller: g('화장품책임판매업자'), phone: g('소비자상담전화번호'), expiry: g('사용기한'), caution: g('추가주의사항')
      };
      if (o.functional && !/미백|주름|자외선/.test(o.functional)) o.functional = '';
      const detected = /벨리닉/.test(brandText) ? 'velinic' : /닥터에스떼/.test(brandText) ? 'drsthe' : null;
      if (detected && detected !== S.brand) { S.brand = detected; setBrandChip($('#inBrand'), detected); toast(`템플릿 브랜드에 맞춰 ${C.brands[detected].name}(으)로 변경했습니다.`, 3000); }
      fillForm(o); refreshAnalysis();
      drop.classList.add('ok'); $('#drop .drop-in b').textContent = `${file.name} 불러옴`;
      if (!o.name && !o.inci) toast('템플릿에서 값을 찾지 못했습니다. 입력값 칸이 채워져 있는지 확인해 주세요.', 3500);
      else toast('템플릿 내용을 불러왔습니다. 확인 후 [문안 생성]을 눌러 주세요.');
    } catch (err) { console.error(err); toast('파일을 읽지 못했습니다: ' + err.message, 3500); }
  }

  $('#btnGenerate').onclick = () => {
    const inp = readForm(); const an = GEN.analyze(inp.inci);
    const errs = GEN.checkInput(inp, an).filter(w => w.level === 'err');
    if (errs.length) { toast(errs[0].msg); return; }
    generate(inp, true);
  };

  /* ---------------- 4. 생성 · 편집 ---------------- */
  function generate(inp, isNew) {
    const L = window.LAYOUTS[S.brand];
    const r = GEN.generate(S.brand, inp, L);
    S.input = inp; S.ctx = r.ctx;
    // 기존 수동 위치 유지
    const prev = {}; (S.blocks || []).forEach(b => prev[b.id] = b);
    S.blocks = r.blocks.map(b => (prev[b.id] && prev[b.id].moved && !isNew) ? Object.assign(b, { x: prev[b.id].x, y: prev[b.id].y, moved: 1 }) : b);
    if (isNew) S.histId = null;
    openEditor(); saveHistory(true);
  }
  function openEditor() {
    setBrandChip($('#edBrand'), S.brand);
    $('#edTitle').textContent = (S.ctx.title || '') + (S.ctx.volume ? ' ' + S.ctx.volume : '');
    $('#opRange').max = C.maxOpacity; $('#opRange').value = S.opacity; $('#opVal').textContent = S.opacity + '%';
    show('#vEdit'); renderCanvas(); runCheck(); renderHistory();
  }
  $('#btnBack').onclick = () => { startInput(S.brand, S.input); };
  $('#btnRegen').onclick = () => { if (confirm('입력 정보로 문안을 다시 생성합니다. 직접 수정한 문안은 초기화됩니다. 계속할까요?')) generate(S.input, false); };
  $('#opRange').oninput = e => { S.opacity = +e.target.value; $('#opVal').textContent = S.opacity + '%'; $$('.cv-bg').forEach(i => i.style.opacity = S.opacity / 100); autosave(); };
  $('#btnMove').onclick = () => { S.moving = !S.moving; $('#btnMove').classList.toggle('on', S.moving); $('#canvas').classList.toggle('moving', S.moving); toast(S.moving ? '박스를 드래그해서 위치를 옮기세요.' : '위치 조정을 종료했습니다.'); };

  function roleStyle(r) { const st = C.roles[r] || C.roles.body; const col = st.color === 'accent' ? brandColor(S.brand) : st.color; return { px: st.px, b: st.b, color: col }; }
  function lineHTML(l, blockId, li) {
    const st = roleStyle(l.r); let txt = esc(l.t);
    const iss = S.issues.filter(i => i.blockId === blockId && i.line === li);
    iss.forEach(i => { const w = esc(i.word); txt = txt.split(w).join(`<mark class="hl ${i.level === 'ban' ? 'ban' : ''}">${w}</mark>`); });
    return `<div class="ln r-${l.r}" data-r="${l.r}" style="font-size:${st.px}px;font-weight:${st.b ? 700 : 400};color:${st.color}">${txt || '<br>'}</div>`;
  }
  function blockInner(b) { return b.lines.map((l, i) => lineHTML(l, b.id, i)).join(''); }

  let scale = 0.5;
  function renderCanvas() {
    const L = window.LAYOUTS[S.brand]; const cv = $('#canvas');
    const total = L.images.reduce((s, i) => s + i.h, 0);
    const wrapW = $('#canvasWrap').clientWidth - 64;
    scale = Math.max(0.3, Math.min(0.62, wrapW / L.width));
    cv.style.width = L.width * scale + 'px'; cv.style.height = total * scale + 'px';
    cv.innerHTML = `<div class="cv-inner" style="transform:scale(${scale})">${L.images.map(i => `<img class="cv-bg" src="${L.base + i.src}" style="height:${i.h}px;opacity:${S.opacity / 100}" alt="">`).join('')}
      ${S.blocks.map(b => b.hidden ? '' : `<div class="blk ${b.align} ${b.ph ? 'ph' : ''}" id="b-${b.id}" data-id="${b.id}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px"><span class="tag">${esc(b.label)}</span><button class="del" title="이 박스 삭제">×</button><div class="ed" contenteditable="true" spellcheck="false">${blockInner(b)}</div></div>`).join('')}</div>`;
    cv.classList.toggle('moving', S.moving);
    $$('.blk').forEach(bindBlock);
    relayout();
  }
  function blockById(id) { return S.blocks.find(b => b.id === id); }
  function bindBlock(el) {
    const b = blockById(el.dataset.id); const ed = el.querySelector('.ed');
    ed.addEventListener('focus', () => el.classList.add('focus'));
    ed.addEventListener('blur', () => { el.classList.remove('focus'); syncBlock(el); ed.innerHTML = blockInner(b); relayout(); renderOutline(); });
    ed.addEventListener('input', () => { syncBlock(el); onEdit(); });
    ed.addEventListener('paste', e => { e.preventDefault(); const t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    el.querySelector('.del').onclick = e => { e.stopPropagation(); b.hidden = 1; el.remove(); relayout(); runCheck(); autosave(); toast('박스를 삭제했습니다. [다시 생성]으로 복구할 수 있습니다.'); };
    // drag
    el.addEventListener('pointerdown', e => {
      if (!S.moving || e.target.classList.contains('del')) return;
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      const sx = e.clientX, sy = e.clientY, ox = b.x, oy = parseFloat(el.style.top);
      const mv = ev => { b.x = Math.round(ox + (ev.clientX - sx) / scale); b.y = Math.round(oy + (ev.clientY - sy) / scale); el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; };
      const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); b.moved = 1; relayout(); autosave(); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
    });
  }
  function syncBlock(el) {
    const b = blockById(el.dataset.id); const ed = el.querySelector('.ed');
    let nodes = Array.from(ed.childNodes);
    const out = []; let lastR = 'body';
    nodes.forEach((n, i) => {
      let t, r;
      if (n.nodeType === 3) { t = n.textContent; r = lastR; }
      else { t = n.innerText; r = (n.dataset && n.dataset.r) || lastR; }
      t = String(t || '').replace(/\n+$/, '');
      const old = b.lines[out.length] || {};
      t.split('\n').forEach(part => { out.push(Object.assign({}, old.r === r ? old : {}, { r, t: part })); });
      lastR = r;
    });
    b.lines = out.filter(l => l.t.trim() !== '' || false);
    if (!b.lines.length) b.lines = [{ r: 'body', t: '' }];
  }
  const onEdit = debounce(() => { relayout(); runCheck(true); autosave(); }, 500);

  function relayout() {
    const vis = S.blocks.filter(b => !b.hidden);
    vis.forEach(b => { const el = $('#b-' + b.id); if (el) b.h = el.offsetHeight; });
    const sorted = vis.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    const placed = [];
    sorted.forEach(b => {
      let y = b.y;
      placed.forEach(p => { if (b.x < p.x + p.w && p.x < b.x + b.w && p.y <= b.y && y < p.fy + p.h + 18) y = p.fy + p.h + 18; });
      b.fy = y; placed.push(b);
      const el = $('#b-' + b.id); if (el) el.style.top = y + 'px';
    });
  }

  /* ---- 검수 ---- */
  function runCheck(keepDom) {
    S.issues = COMP.check(S.blocks.filter(b => !b.hidden), { functional: S.ctx.functional || S.input.functional, names: S.ctx.protect });
    const n = S.issues.length; const nb = S.issues.filter(i => i.level !== 'warn').length;
    $('#issueCount').textContent = n ? `${n}건` : '';
    $$('.blk').forEach(el => { const id = el.dataset.id; const li = S.issues.filter(i => i.blockId === id); el.classList.toggle('f-ban', li.some(i => i.level !== 'warn')); el.classList.toggle('f-warn', li.length > 0 && !li.some(i => i.level !== 'warn')); });
    if (!keepDom) $$('.blk').forEach(el => { const ed = el.querySelector('.ed'); if (document.activeElement !== ed) ed.innerHTML = blockInner(blockById(el.dataset.id)); });
    const lv = { ban: '사용 금지', func: '기능성 전용', warn: '근거 필요' };
    $('#issues').innerHTML = n ? S.issues.map((i, k) => `<div class="iss" data-k="${k}"><div class="top"><span class="badge ${i.level}">${lv[i.level]}</span><span class="w">"${esc(i.word)}"</span><span class="where">${esc(i.label)}</span></div><div>${esc(i.why)}</div>
      <div class="act">${i.fix ? `<button data-a="fix">"${esc(i.fix)}"(으)로 바꾸기</button>` : ''}<button data-a="go">위치로 이동</button></div></div>`).join('') : '<div class="ok-box">검출된 위험 표현이 없습니다.</div>';
    if (nb) $('#issueCount').innerHTML = `<span style="color:var(--bad)">${n}건</span>`;
    $$('#issues .iss').forEach(el => el.onclick = e => {
      const i = S.issues[+el.dataset.k]; const b = blockById(i.blockId);
      if (e.target.dataset.a === 'fix') { const l = b.lines[i.line]; l.t = COMP.applyFix(l.t, i.p, i.fix); const be = $('#b-' + b.id); be.querySelector('.ed').innerHTML = blockInner(b); runCheck(); relayout(); autosave(); toast('수정했습니다.'); return; }
      focusBlock(b.id);
    });
    renderOutline();
  }
  function focusBlock(id) { const el = $('#b-' + id); if (!el) return; el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('focus'); setTimeout(() => el.classList.remove('focus'), 1400); }
  function renderOutline() {
    $('#outline').innerHTML = S.blocks.filter(b => !b.hidden).map(b => `<div class="ol" data-id="${b.id}"><span>${esc(b.label)}</span><span>${esc((b.lines.find(l => l.r !== 'eyebrow') || b.lines[0] || {}).t || '')}</span></div>`).join('');
    $$('#outline .ol').forEach(el => el.onclick = () => focusBlock(el.dataset.id));
  }
  window.addEventListener('resize', debounce(() => { if (!$('#vEdit').classList.contains('hidden')) renderCanvas(); }, 200));

  /* ---------------- 엑셀 ---------------- */
  $('#btnXlsx').onclick = async () => {
    const L = window.LAYOUTS[S.brand]; const B = C.brands[S.brand];
    busy(true, '엑셀 파일을 만드는 중…');
    try {
      relayout();
      const images = [];
      for (const im of L.images) {
        const res = await fetch(L.base + im.src); if (!res.ok) throw new Error('배경 이미지를 불러오지 못했습니다: ' + im.src);
        const ext = (im.src.split('.').pop() || 'jpg').toLowerCase();
        images.push({ data: new Uint8Array(await res.arrayBuffer()), ext: ext === 'jpeg' ? 'jpg' : ext, h: im.h });
      }
      const vis = S.blocks.filter(b => !b.hidden);
      const blocks = vis.map(b => ({
        x: b.x, y: b.fy != null ? b.fy : b.y, w: b.w, h: Math.round((b.h || 120) * 1.12 + 10), align: b.align, label: b.label,
        flag: S.issues.some(i => i.blockId === b.id && i.level !== 'warn') || b.ph,
        lines: b.lines.map((l, i) => { const st = roleStyle(l.r); return { t: l.t, px: st.px, b: st.b, color: st.color, gap: i > 0 && (l.r === 'body' && /headline|h3/.test(b.lines[i - 1].r)) }; })
      }));
      const lvl = { ban: '사용 금지', func: '기능성 전용', warn: '근거 필요' };
      const table = [['순서', '영역', '역할', '문안', '검수 메모']];
      let n = 1;
      vis.forEach(b => b.lines.forEach((l, li) => { const iss = S.issues.filter(i => i.blockId === b.id && i.line === li).map(i => `[${lvl[i.level]}] "${i.word}" ${i.why}`).join('\n'); table.push([String(n++), b.label, ROLE_KO[l.r] || l.r, l.t, iss]); }));
      const title = `${B.name} ${S.ctx.title}${S.ctx.volume ? ' ' + S.ctx.volume : ''} 상세페이지 디자인 요청`;
      const blob = FILES.buildXlsx({ title, sheetTitle: '상세페이지', layoutWidth: L.width, images, opacity: S.opacity, blocks, table });
      download(blob, `${B.name}_${(S.ctx.title || '상세').replace(/[\\/:*?"<>|\s]+/g, '_')}_상세문안_${today()}.xlsx`);
      saveHistory(); toast('엑셀 파일을 내려받았습니다.');
    } catch (err) { console.error(err); toast('엑셀 생성 실패: ' + err.message, 4000); }
    busy(false);
  };

  /* ---------------- 레이아웃 내보내기 ---------------- */
  $('#btnLayoutExport').onclick = () => {
    const L = window.LAYOUTS[S.brand]; relayout();
    const pos = {}; S.blocks.forEach(b => pos[b.id] = b);
    const nl = Object.assign({}, L, { blocks: L.blocks.map(o => pos[o.id] ? Object.assign({}, o, { x: pos[o.id].x, y: Math.round(pos[o.id].fy != null ? pos[o.id].fy : pos[o.id].y), w: pos[o.id].w }) : o) });
    const txt = `/* ${C.brands[S.brand].name} 상세페이지 레이아웃 — 사이트에서 내보냄 ${new Date().toLocaleString('ko-KR')} */\nwindow.LAYOUTS = window.LAYOUTS || {};\nwindow.LAYOUTS['${S.brand}'] = ${JSON.stringify(nl, null, 1)};\n`;
    download(new Blob([txt], { type: 'text/javascript' }), 'layout.js');
    toast(`layout.js를 내려받았습니다. GitHub의 layouts/${S.brand}/layout.js 를 이 파일로 교체하세요.`, 4500);
  };

  /* ---------------- 히스토리 ---------------- */
  function loadHist() { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } }
  function storeHist(list) { try { localStorage.setItem(HKEY, JSON.stringify(list.slice(0, 200))); } catch (e) { toast('브라우저 저장 공간이 부족합니다. 히스토리 백업 후 오래된 항목을 삭제해 주세요.', 4000); } }
  function saveHistory(quiet) {
    if (!S.ctx) return;
    const list = loadHist(); const now = Date.now();
    const clean = S.blocks.map(b => { const o = Object.assign({}, b); delete o.fy; delete o.h; return o; });
    const item = { id: S.histId || ('h' + now.toString(36)), brand: S.brand, title: S.ctx.title, volume: S.ctx.volume, input: S.input, ctx: S.ctx, blocks: clean, opacity: S.opacity, updated: now };
    const ix = list.findIndex(x => x.id === item.id);
    if (ix >= 0) { item.created = list[ix].created; list.splice(ix, 1); } else item.created = now;
    list.unshift(item); S.histId = item.id; storeHist(list); renderHistory();
    const d = new Date(now); $('#edSaved').textContent = `저장됨 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (quiet !== true) toast('저장했습니다.');
  }
  const autosave = debounce(() => saveHistory(true), 1200);
  $('#btnSave').onclick = () => saveHistory();
  function renderHistory() {
    const q = ($('#histSearch').value || '').trim().toLowerCase();
    const list = loadHist().filter(h => !q || (h.title + ' ' + (C.brands[h.brand] || {}).name).toLowerCase().indexOf(q) >= 0);
    if (!list.length) { $('#histList').innerHTML = `<div class="side-empty">${q ? '검색 결과가 없습니다.' : '아직 만든 상세페이지가 없습니다.<br>문안을 생성하면 여기에 자동 저장됩니다.'}</div>`; return; }
    const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = 86400000;
    const grp = h => h.updated >= t0 ? '오늘' : h.updated >= t0 - 6 * day ? '최근 7일' : '이전';
    let cur = '', html = '';
    list.forEach(h => {
      const g = grp(h); if (g !== cur) { html += `<div class="h-group">${g}</div>`; cur = g; }
      const d = new Date(h.updated);
      html += `<div class="h-item ${h.id === S.histId ? 'on' : ''}" data-id="${h.id}"><span class="h-dot" style="background:${brandColor(h.brand)}"></span><div class="h-txt"><div class="h-title">${esc(h.title || '(제목 없음)')}${h.volume ? ' ' + esc(h.volume) : ''}</div><div class="h-meta">${esc((C.brands[h.brand] || {}).name || '')} · ${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}</div></div><button class="h-del" title="삭제">×</button></div>`;
    });
    $('#histList').innerHTML = html;
    $$('#histList .h-item').forEach(el => {
      el.onclick = e => {
        if (e.target.classList.contains('h-del')) { if (confirm('이 히스토리를 삭제할까요?')) { storeHist(loadHist().filter(x => x.id !== el.dataset.id)); if (S.histId === el.dataset.id) S.histId = null; renderHistory(); } return; }
        const h = loadHist().find(x => x.id === el.dataset.id); if (!h) return;
        if (!window.LAYOUTS[h.brand]) { toast('레이아웃을 찾을 수 없습니다.'); return; }
        Object.assign(S, { brand: h.brand, input: h.input, ctx: h.ctx, blocks: h.blocks, opacity: h.opacity || C.defaultOpacity, histId: h.id });
        openEditor();
      };
    });
  }
  $('#histSearch').addEventListener('input', debounce(renderHistory, 150));
  $('#btnHistExport').onclick = () => { download(new Blob([JSON.stringify(loadHist(), null, 1)], { type: 'application/json' }), `상세문안_히스토리_${today()}.json`); };
  $('#histImport').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const arr = JSON.parse(await f.text()); if (!Array.isArray(arr)) throw 0; const cur = loadHist(); const ids = new Set(cur.map(x => x.id)); const merged = cur.concat(arr.filter(x => x && x.id && !ids.has(x.id))).sort((a, b) => b.updated - a.updated); storeHist(merged); renderHistory(); toast(`${merged.length - cur.length}개 항목을 불러왔습니다.`); }
    catch (err) { toast('히스토리 파일 형식이 올바르지 않습니다.'); }
    e.target.value = '';
  });

  /* ---------------- 시작 ---------------- */
  renderBrands();
  if (sessionStorage.getItem('dp_auth') === C.passwordHash) enterApp();
})();
