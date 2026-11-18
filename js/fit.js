/* =========================================================
   v3 보정 스크립트 (app.js 수정 없이 동작)
   1) 문구 박스를 디자인요청서 엑셀 텍스트박스 크기(layout.js 의 h)로 고정 → 박스가 아래로 밀리며 뭉치지 않음
   2) 글자 크기를 박스에 맞게 자동 조절 (엑셀 글자 크기 fs 기준, 넘치면 줄임)
   3) [필수] 제품 설명 칸 — 문안 생성에 반영 · 히스토리/정보 수정 시 복원 · Word 템플릿 '제품설명' 행 인식
   4) 이전 버전 히스토리 안내 · 엑셀 다운로드 글자 크기 반영
   ========================================================= */
(function () {
  'use strict';
  var C = window.CONFIG, GEN = window.GEN, FILES = window.FILES;
  var $ = function (s) { return document.querySelector(s); };
  var LB = {};
  Object.keys(window.LAYOUTS || {}).forEach(function (k) { (window.LAYOUTS[k].blocks || []).forEach(function (b) { LB[b.id] = b; }); });

  /* ---------- 1. 박스 높이 고정 ---------- */
  var css = Object.keys(LB).map(function (id) { var b = LB[id]; return b.h ? '.canvas #b-' + id + '{height:' + b.h + 'px}' : ''; }).join('\n');
  var st = document.createElement('style'); st.id = 'dp-fit-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- 2. 글자 크기 자동 맞춤 ---------- */
  function rolePx(r) { var s = (C.roles && (C.roles[r] || C.roles.body)) || { px: 25 }; return s.px; }
  function fitBlock(el) {
    if (!el || !el.offsetParent) return;
    var ed = el.querySelector('.ed'); if (!ed) return;
    var lns = Array.prototype.slice.call(ed.querySelectorAll('.ln')); if (!lns.length) return;
    var lb = LB[el.dataset.id];
    var base = lns.map(function (l) { return rolePx(l.dataset.r); });
    var maxBase = Math.max.apply(null, base);
    var kmax = lb && lb.fs ? Math.max(0.5, Math.min(1.5, lb.fs / maxBase)) : 1.15;
    function apply(k) { lns.forEach(function (l, i) { l.style.fontSize = (base[i] * k).toFixed(1) + 'px'; }); }
    if (!lb || !lb.h) { apply(Math.min(1, kmax)); return; }
    var cs = getComputedStyle(el);
    var avail = el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    var fits = function () { return ed.scrollHeight <= avail + 1; };
    apply(kmax);
    if (fits()) { el.classList.remove('ovf'); el.dataset.k = kmax; return; }
    var lo = 0.35, hi = kmax; apply(lo);
    if (!fits()) { el.classList.add('ovf'); el.dataset.k = lo; return; }
    for (var n = 0; n < 9; n++) { var m = (lo + hi) / 2; apply(m); if (fits()) lo = m; else hi = m; }
    apply(lo); el.dataset.k = lo; el.classList.remove('ovf');
  }
  var pending = new Set(), all = false, raf = 0;
  function schedule(el) { if (el) pending.add(el); else all = true; if (!raf) raf = requestAnimationFrame(run); }
  function run() {
    raf = 0;
    var list = all ? Array.prototype.slice.call(document.querySelectorAll('#canvas .blk')) : Array.from(pending);
    all = false; pending.clear();
    list.forEach(fitBlock);
    if (list.length > 5) checkOld();
  }
  function hook() {
    var cv = $('#canvas'); if (!cv) return;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.target === cv || (m.target.classList && m.target.classList.contains('cv-inner'))) { schedule(); return; }
        var b = m.target.closest ? m.target.closest('.blk') : null;
        if (!b && m.target.parentElement) b = m.target.parentElement.closest('.blk');
        schedule(b);
      });
    }).observe(cv, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', function () { setTimeout(function () { schedule(); }, 300); });
  }

  /* ---------- 4-1. 이전 버전 히스토리 안내 ---------- */
  var warned = '';
  function checkOld() {
    var els = document.querySelectorAll('#canvas .blk'); var old = 0;
    els.forEach(function (e) { if (!LB[e.dataset.id]) old++; });
    var key = ($('#edTitle') || {}).textContent || '';
    if (old > 0 && warned !== key) {
      warned = key;
      var t = $('#toast'); if (!t) return;
      t.textContent = '이전 버전에서 만든 히스토리입니다. 오른쪽 위 [다시 생성]을 누르면 새 문구 자리(전체 박스)에 맞춰 다시 배치됩니다.';
      t.classList.add('show'); clearTimeout(checkOld._t); checkOld._t = setTimeout(function () { t.classList.remove('show'); }, 6000);
    }
  }

  /* ---------- 4-2. 엑셀 다운로드: 화면에서 맞춘 글자 크기 반영 ---------- */
  if (FILES && FILES.buildXlsx) {
    var ob = FILES.buildXlsx;
    FILES.buildXlsx = function (o) {
      try {
        var map = {};
        document.querySelectorAll('#canvas .blk').forEach(function (e) { map[Math.round(parseFloat(e.style.left)) + ',' + Math.round(parseFloat(e.style.top))] = { k: parseFloat(e.dataset.k || '1'), h: e.offsetHeight }; });
        (o.blocks || []).forEach(function (b) {
          var m = map[Math.round(b.x) + ',' + Math.round(b.y)]; if (!m) return;
          (b.lines || []).forEach(function (l) { l.px = Math.round(l.px * m.k * 10) / 10; });
          b.h = Math.round(m.h + 6);
        });
      } catch (e) { console.warn(e); }
      return ob.apply(this, arguments);
    };
  }

  /* ---------- 3. 제품 설명 ---------- */
  var DKEY = 'dp_desc_v1';
  function dmap() { try { return JSON.parse(localStorage.getItem(DKEY) || '{}'); } catch (e) { return {}; } }
  function saveDesc(name, d) { if (!name) return; try { var m = dmap(); m[name] = d; localStorage.setItem(DKEY, JSON.stringify(m)); } catch (e) { } }
  if (GEN && GEN.generate) {
    var og = GEN.generate;
    GEN.generate = function (brand, input) {
      var f = $('#fDesc'), vi = $('#vInput');
      if (input && f && vi && !vi.classList.contains('hidden')) input.desc = f.value.trim();
      if (input && input.desc) saveDesc(String(input.name || '').trim(), input.desc);
      return og.apply(this, arguments);
    };
  }
  if (FILES && FILES.parseDocx) {
    var op = FILES.parseDocx;
    FILES.parseDocx = function () {
      return op.apply(this, arguments).then(function (r) {
        try {
          var m = (r && r.map) || {}; var v = '';
          ['제품설명', '제품설명함축', '제품소개', '제품특징', '제품포인트'].some(function (k) { if (m[k] && String(m[k]).trim()) { v = String(m[k]).trim(); return true; } return false; });
          if (v && $('#fDesc')) { $('#fDesc').value = v; descHint(); }
        } catch (e) { }
        return r;
      });
    };
  }
  function descHint() {
    var f = $('#fDesc'), h = $('#descHint'); if (!f || !h || !GEN.parseDesc) return;
    var an = GEN.analyze(($('#fInci') || {}).value || '');
    var d = GEN.parseDesc(f.value, an);
    var KO = { moist: '보습', soothe: '편안함·진정', smooth: '피부결·각질', glow: '생기·윤기', barrier: '피부 밸런스·탄탄', nourish: '영양', fresh: '산뜻함', clean: '세정', cool: '쿨링' };
    var parts = [];
    if (d.cats.length) parts.push('피부 고민 <b>' + d.cats.slice(0, 3).map(function (c) { return KO[c] || c; }).join(' · ') + '</b>');
    if (d.tex) parts.push('제형 <b>' + d.tex.k + '</b>');
    if (d.ings.length) parts.push('강조 성분 <b>' + d.ings.slice(0, 4).join(', ') + '</b>');
    var pk = Object.keys(d.pct); if (pk.length) parts.push('함량 <b>' + pk.length + '개 인식</b>');
    if (d.high) parts.push('<b>고함량</b>');
    if (d.lowIrr) parts.push('<b>저자극</b>');
    h.innerHTML = f.value.trim() ? (parts.length ? '설명에서 인식한 포인트 · ' + parts.join(' · ') : '인식된 포인트가 없습니다. 피부 고민 · 제형 · 강조 성분을 적어 주세요.') : '';
  }
  function hookDesc() {
    var f = $('#fDesc'); if (!f) return;
    var nudge = function () { var n = $('#fName'); if (n) n.dispatchEvent(new Event('change')); descHint(); };
    f.addEventListener('input', debounce(nudge, 250));
    var inci = $('#fInci'); if (inci) inci.addEventListener('input', debounce(descHint, 300));
    var vi = $('#vInput');
    if (vi) new MutationObserver(function () {
      if (vi.classList.contains('hidden')) return;
      var name = (($('#fName') || {}).value || '').trim();
      f.value = name ? (dmap()[name] || '') : '';
      descHint();
    }).observe(vi, { attributes: true, attributeFilter: ['class'] });
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  hook(); hookDesc();
})();
