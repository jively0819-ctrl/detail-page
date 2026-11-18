/* =========================================================
   v4 화면 기능 — fit.js 다음에 불러옵니다.
   1) [대표성분 구성(복합 성분)] 입력칸: 저장/복원 · Word 템플릿 '대표성분구성' 행 인식 · 전성분 자동 감지 후 한 번에 채우기
   2) 편집 화면 [+ 텍스트 상자]: 원하는 위치를 클릭해 새 문안 박스 추가 (이동 · 굵게 · 글자 크기 · 정렬 · 삭제)
      → 히스토리별 자동 저장, 엑셀 다운로드 시 함께 들어갑니다.
   3) 화장품제조업자 칸: 「제품 내 별도 표기」 자동
   ========================================================= */
(function () {
  'use strict';
  var GEN = window.GEN, V4 = window.V4, FILES = window.FILES;
  if (!V4) return;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function toast(m, ms) { var t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600); }

  /* ---------- 1. 화장품제조업자 ---------- */
  var mk = $('#fMaker');
  if (mk) { mk.placeholder = V4.MAKER + ' (자동)'; mk.readOnly = true; mk.value = ''; mk.title = '두 브랜드 모두 「제품 내 별도 표기」로 자동 저장됩니다.'; }

  /* ---------- 2. 대표성분 구성 (복합 성분) ---------- */
  var CKEY = 'dp_complex_v1';
  function cmap() { try { return JSON.parse(localStorage.getItem(CKEY) || '{}'); } catch (e) { return {}; } }
  function saveCx(name, v) { if (!name) return; try { var m = cmap(); m[name] = v; localStorage.setItem(CKEY, JSON.stringify(m)); } catch (e) { } }
  var fx = $('#fComplex');
  function cxHint() {
    var box = $('#cxDetect'); if (!box || !GEN) return;
    var an = GEN.analyze(($('#fInci') || {}).value || '');
    if (!an.items.length) { box.innerHTML = ''; return; }
    var custom = V4.toGroups(V4.parseComplex(fx ? fx.value : ''), an);
    var typed = custom.map(function (g) { return g.ko(); });
    var miss = custom.filter(function (g) { return !an.items.some(function (i) { return g.re.test(i.k); }); }).map(function (g) { return g.ko(); });
    var auto = V4.detectGroups(an, []).filter(function (d) { return typed.indexOf(d.ko) < 0; });
    var html = '';
    if (typed.length) html += '<div>입력한 복합 성분 <b>' + esc(typed.join(', ')) + '</b>' + (miss.length ? ' · <span class="warn">전성분에서 구성 성분을 찾지 못함: ' + esc(miss.join(', ')) + '</span>' : '') + '</div>';
    if (auto.length) {
      html += '<div>전성분에서 감지한 복합 성분 ' + auto.map(function (d, i) { return '<b>' + esc(d.ko) + '</b> <span class="muted">(' + esc(d.members.slice(0, 3).map(function (m) { return m.k; }).join(', ')) + (d.members.length > 3 ? ' 외 ' + (d.members.length - 3) + '개' : '') + ')</span>'; }).join(' · ') + '</div>';
      html += '<button type="button" class="btn ghost sm" id="btnCxFill">감지한 복합 성분을 입력칸에 채우기</button>';
    }
    box.innerHTML = html;
    var bt = $('#btnCxFill');
    if (bt) bt.onclick = function () {
      var lines = auto.map(function (d) { return d.ko + ' (' + d.en + ') = ' + d.members.map(function (m) { return String(m.raw).replace(/\(.*?\)/g, '').trim(); }).join(', '); });
      fx.value = (fx.value.trim() ? fx.value.trim() + '\n' : '') + lines.join('\n');
      cxHint(); toast('복합 성분을 채웠습니다. 이름 · 영문 · 문구는 자유롭게 고쳐 쓰세요.');
    };
  }
  if (fx) {
    fx.addEventListener('input', debounce(cxHint, 250));
    var inci = $('#fInci'); if (inci) inci.addEventListener('input', debounce(cxHint, 350));
    var vi = $('#vInput');
    if (vi) new MutationObserver(function () {
      if (vi.classList.contains('hidden')) return;
      var name = (($('#fName') || {}).value || '').trim();
      var v = name ? (cmap()[name] || '') : '';
      fx.value = v; if (v) { var ob = $('#optBox'); if (ob) ob.open = true; }
      if (mk) mk.value = '';
      cxHint();
    }).observe(vi, { attributes: true, attributeFilter: ['class'] });
  }
  if (GEN && GEN.generate) {
    var og = GEN.generate;
    GEN.generate = function (brand, input) {
      if (input && input.complex) saveCx(String(input.name || '').trim(), input.complex);
      return og.apply(this, arguments);
    };
  }
  if (FILES && FILES.parseDocx) {
    var op = FILES.parseDocx;
    FILES.parseDocx = function () {
      return op.apply(this, arguments).then(function (r) {
        try {
          var m = (r && r.map) || {}, v = '';
          ['대표성분구성', '대표성분구성복합성분', '복합성분', '복합대표성분'].some(function (k) { if (m[k] && String(m[k]).trim()) { v = String(m[k]).trim(); return true; } return false; });
          if (v && fx) { setTimeout(function () { fx.value = v; var ob = $('#optBox'); if (ob) ob.open = true; cxHint(); }, 0); }
        } catch (e) { }
        return r;
      });
    };
  }

  /* ---------- 3. 텍스트 상자 추가 ---------- */
  var BKEY = 'dp_textbox_v1';
  function bmap() { try { return JSON.parse(localStorage.getItem(BKEY) || '{}'); } catch (e) { return {}; } }
  function key() {
    var on = $('#histList .h-item.on');
    if (on && on.dataset.id) return on.dataset.id;
    return 't:' + ((($('#edTitle') || {}).textContent) || '');
  }
  function boxes() { return bmap()[key()] || []; }
  function setBoxes(list) { try { var m = bmap(); m[key()] = list; localStorage.setItem(BKEY, JSON.stringify(m)); } catch (e) { toast('브라우저 저장 공간이 부족합니다.'); } }
  function inner() { return $('#canvas .cv-inner'); }
  function scale() { var el = inner(); var m = el && el.style.transform.match(/scale\(([\d.]+)\)/); return m ? parseFloat(m[1]) : 0.5; }
  var adding = false;
  function addBtn() {
    var save = $('#btnSave'); if (!save || $('#btnAddText')) return;
    var b = document.createElement('button');
    b.className = 'btn ghost sm'; b.id = 'btnAddText'; b.type = 'button';
    b.title = '누른 뒤 상세 이미지에서 원하는 위치를 클릭하면 텍스트 상자가 생깁니다';
    b.innerHTML = '<span class="ico-t">T</span>＋ 텍스트 상자';
    save.parentNode.insertBefore(b, save);
    b.onclick = function () { setAdding(!adding); };
  }
  function setAdding(on) {
    adding = on; var b = $('#btnAddText'); if (b) b.classList.toggle('on', on);
    var cv = $('#canvas'); if (cv) cv.classList.toggle('adding', on);
    if (on) toast('상세 이미지에서 텍스트 상자를 넣을 위치를 클릭하세요. (Esc 취소)');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && adding) setAdding(false); });
  function boxHTML(b) {
    var lines = String(b.text || '').split('\n').map(function (t) { return '<div>' + (esc(t) || '<br>') + '</div>'; }).join('');
    return '<div class="cb-bar"><span class="cb-drag" title="끌어서 이동">이동</span><button type="button" data-a="b" title="굵게">B</button><button type="button" data-a="m" title="글자 작게">A−</button><button type="button" data-a="p" title="글자 크게">A＋</button><button type="button" data-a="al" title="정렬 바꾸기">' + ({ left: '왼쪽', center: '가운데', right: '오른쪽' }[b.align] || '왼쪽') + '</button><button type="button" data-a="x" title="삭제">×</button></div>' +
      '<div class="cb-ed" contenteditable="true" spellcheck="false" style="font-size:' + b.px + 'px;font-weight:' + (b.b ? 700 : 400) + ';text-align:' + b.align + '">' + lines + '</div>';
  }
  function render() {
    var host = inner(); if (!host) return;
    $$('#canvas .cbox').forEach(function (e) { e.remove(); });
    boxes().forEach(function (b) { host.appendChild(make(b)); });
  }
  function update(id, patch) {
    var list = boxes(); var b = list.find(function (x) { return x.id === id; }); if (!b) return null;
    Object.assign(b, patch); setBoxes(list); return b;
  }
  function make(b) {
    var el = document.createElement('div');
    el.className = 'cbox'; el.dataset.cid = b.id;
    el.style.left = b.x + 'px'; el.style.top = b.y + 'px'; el.style.width = b.w + 'px';
    el.innerHTML = boxHTML(b);
    var ed = el.querySelector('.cb-ed');
    ed.addEventListener('input', debounce(function () { update(b.id, { text: ed.innerText.replace(/\n$/, '') }); }, 300));
    ed.addEventListener('paste', function (e) { e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text/plain'); document.execCommand('insertText', false, t); });
    el.querySelector('.cb-bar').addEventListener('click', function (e) {
      var a = e.target.dataset && e.target.dataset.a; if (!a) return;
      e.stopPropagation();
      var cur = boxes().find(function (x) { return x.id === b.id; }) || b;
      if (a === 'x') { if (!confirm('이 텍스트 상자를 삭제할까요?')) return; setBoxes(boxes().filter(function (x) { return x.id !== b.id; })); el.remove(); return; }
      if (a === 'b') cur = update(b.id, { b: cur.b ? 0 : 1 });
      if (a === 'm') cur = update(b.id, { px: Math.max(12, cur.px - 3) });
      if (a === 'p') cur = update(b.id, { px: Math.min(120, cur.px + 3) });
      if (a === 'al') cur = update(b.id, { align: { left: 'center', center: 'right', right: 'left' }[cur.align] || 'left' });
      var nb = make(cur); el.replaceWith(nb);
    });
    var drag = el.querySelector('.cb-drag');
    drag.addEventListener('pointerdown', function (e) {
      e.preventDefault(); drag.setPointerCapture(e.pointerId);
      var sx = e.clientX, sy = e.clientY, ox = parseFloat(el.style.left), oy = parseFloat(el.style.top), k = scale();
      function mv(ev) { el.style.left = Math.round(ox + (ev.clientX - sx) / k) + 'px'; el.style.top = Math.round(oy + (ev.clientY - sy) / k) + 'px'; }
      function up() { drag.removeEventListener('pointermove', mv); drag.removeEventListener('pointerup', up); update(b.id, { x: parseFloat(el.style.left), y: parseFloat(el.style.top) }); }
      drag.addEventListener('pointermove', mv); drag.addEventListener('pointerup', up);
    });
    if (window.ResizeObserver) new ResizeObserver(debounce(function () { var w = Math.round(el.offsetWidth); if (w && Math.abs(w - (b.w || 0)) > 2) { b.w = w; update(b.id, { w: w }); } }, 300)).observe(el);
    return el;
  }
  function onCanvasClick(e) {
    if (!adding) return;
    if (e.target.closest('.blk') || e.target.closest('.cbox')) { if (!e.target.closest('.cv-inner')) return; }
    var host = inner(); if (!host) return;
    var rc = host.getBoundingClientRect(), k = scale();
    var x = Math.max(0, Math.round((e.clientX - rc.left) / k)), y = Math.max(0, Math.round((e.clientY - rc.top) / k));
    var b = { id: 'c' + Date.now().toString(36), x: Math.min(x, 1440 - 300), y: y, w: 640, px: 30, b: 0, align: 'left', text: '새 문구를 입력하세요' };
    var list = boxes(); list.push(b); setBoxes(list);
    var el = make(b); host.appendChild(el);
    setAdding(false);
    var ed = el.querySelector('.cb-ed'); ed.focus();
    try { var rg = document.createRange(); rg.selectNodeContents(ed); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); } catch (x) { }
    e.preventDefault(); e.stopPropagation();
  }
  function hookCanvas() {
    var cv = $('#canvas'); if (!cv) return;
    cv.addEventListener('click', onCanvasClick, true);
    var last = null;
    new MutationObserver(function () {
      var host = inner();
      if (host && (host !== last || !host.querySelector('.cbox') && boxes().length)) { last = host; render(); }
    }).observe(cv, { childList: true });
    var hl = $('#histList'), lastKey = null; if (hl) new MutationObserver(debounce(function () { var k = key(); if (inner() && k !== lastKey) { lastKey = k; render(); } }, 50)).observe(hl, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }
  /* 엑셀 다운로드에 추가 텍스트 상자 포함 */
  if (FILES && FILES.buildXlsx) {
    var ob = FILES.buildXlsx;
    FILES.buildXlsx = function (o) {
      try {
        var list = boxes();
        list.forEach(function (b) {
          var el = document.querySelector('.cbox[data-cid="' + b.id + '"] .cb-ed');
          var h = el ? Math.round(el.offsetHeight + 40) : 120;
          o.blocks = o.blocks || [];
          o.blocks.push({ x: b.x, y: b.y, w: b.w, h: h, align: b.align === 'left' ? 'left' : 'center', label: '추가 텍스트', flag: false,
            lines: String(b.text || '').split('\n').map(function (t) { return { t: t, px: b.px, b: b.b, color: '#111827' }; }) });
          if (o.table) String(b.text || '').split('\n').forEach(function (t) { o.table.push([String(o.table.length), '추가 텍스트', '직접 추가', t, '']); });
        });
      } catch (e) { console.warn(e); }
      return ob.apply(this, arguments);
    };
  }
  addBtn(); hookCanvas();
})();
