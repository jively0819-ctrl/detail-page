/* =========================================================
   v5 보정 — v4-pre.js 다음, app.js 앞에서 불러옵니다. (기존 파일은 수정하지 않습니다)
   1) 상품정보제공고시: v2 방식으로 되돌림
      - 하단 고시 표 이미지의 칸마다 박스 하나씩 (제품명 · 용량 · [벨리닉] 기능성 · 사용방법 · 전성분)
      - 좌표 · 문구 형식 모두 v2(detail-page_v2) 그대로
   2) 닥터에스떼 복합성분 상세(What is …?) 영역
      - 배경에 남아 있던 다른 제품 그림(콜라겐 원형 그림)과 표 안 문구를 지운 이미지(v5_06.jpg)로 교체
      - 사진 가운데 성분명 라벨 + 하단 2행 표(왼쪽 영문 타이틀 / 오른쪽 설명) 문구를 자동 생성
   3) 편집 화면 상세페이지 오른쪽 위 [새 텍스트 상자] 아이콘 (스크롤해도 따라옴)
   ========================================================= */
(function (G) {
  'use strict';
  var C = G.CONFIG, GEN = G.GEN, TONE = G.TONE, V4 = G.V4, LAYOUTS = G.LAYOUTS || {};
  if (!C || !GEN || !TONE) return;
  var L = function (r, t, ex) { return Object.assign({ r: r, t: t == null ? '' : String(t) }, ex || {}); };
  var LABEL = {
    infoName: '고시 · 제품명', infoVol: '고시 · 용량', infoFunc: '고시 · 기능성', infoUse: '고시 · 사용방법', infoInci: '고시 · 전성분',
    dWhat2Lbl: '복합성분 라벨', dTbl0L: '표 1행 타이틀', dTbl0R: '표 1행 설명', dTbl1L: '표 2행 타이틀', dTbl1R: '표 2행 설명'
  };

  /* ---------- 1. 레이아웃 ---------- */
  // v2 고시 칸 좌표 (detail-page_v2 layouts/*/layout.js) · 높이는 v3 엑셀 박스 높이
  var INFO = {
    drsthe: [
      { id: 'infoName', type: 'infoName', x: 386, y: 25387, w: 390, h: 41, align: 'left', fs: 25 },
      { id: 'infoVol', type: 'infoVol', x: 387, y: 25448, w: 198, h: 35, align: 'left', fs: 25 },
      { id: 'infoUse', type: 'infoUse', x: 367, y: 25699, w: 994, h: 66, align: 'left', fs: 25 },
      { id: 'infoInci', type: 'infoInci', x: 64, y: 25899, w: 1318, h: 154, align: 'left', fs: 18 }
    ],
    velinic: [
      { id: 'vInfoName', type: 'infoName', x: 380, y: 40167, w: 520, h: 52, align: 'left' },
      { id: 'vInfoVol', type: 'infoVol', x: 380, y: 40242, w: 300, h: 52, align: 'left' },
      { id: 'vInfoFunc', type: 'infoFunc', x: 1080, y: 40372, w: 330, h: 80, align: 'left' },
      { id: 'vInfoUse', type: 'infoUse', x: 370, y: 40492, w: 1000, h: 150, align: 'left' },
      { id: 'vInfoInci', type: 'infoInci', x: 50, y: 40702, w: 1340, h: 330, align: 'left' }
    ]
  };
  var TBL = [
    { id: 'dTbl0L', type: 'dTbl', i: 0, x: 172, y: 15404, w: 300, h: 282, align: 'center', fs: 38 },
    { id: 'dTbl0R', type: 'dTbl', i: 1, x: 490, y: 15404, w: 780, h: 282, align: 'center', fs: 30 },
    { id: 'dTbl1L', type: 'dTbl', i: 2, x: 172, y: 15704, w: 300, h: 282, align: 'center', fs: 38 },
    { id: 'dTbl1R', type: 'dTbl', i: 3, x: 490, y: 15704, w: 780, h: 282, align: 'center', fs: 30 }
  ];
  function fixLayout(id) {
    var Lo = LAYOUTS[id]; if (!Lo || Lo.v5) return;
    Lo.blocks = Lo.blocks.filter(function (b) { return b.type !== 'infoAll' && !/^v?[iI]nfo/.test(b.id); });
    INFO[id].forEach(function (b) { Lo.blocks.push(Object.assign({ v5: 1 }, b)); });
    if (id === 'drsthe') {
      Lo.images.forEach(function (im) { im.src = im.src.replace(/(v3_|v4_)?06\.jpg$/, 'v5_06.jpg'); });
      var lbl = Lo.blocks.find(function (b) { return b.id === 'dWhat2Lbl'; });
      if (lbl) Object.assign(lbl, { x: 440, y: 14950, w: 560, h: 140, align: 'center', fs: 34 });
      TBL.forEach(function (b) { Lo.blocks.push(Object.assign({ v5: 1 }, b)); });
    }
    Lo.v5 = 1;
  }
  fixLayout('drsthe'); fixLayout('velinic');

  /* ---------- 2. 문안 ---------- */
  function usageSteps(c) {
    var u = String(c.input.usage || '').trim();
    var st = u ? u.split(/\n+/).map(function (x) { return x.replace(/^\s*(STEP\.?\s*\d+\.?|\d+[\.\)])\s*[:：]?\s*/i, '').trim(); }).filter(Boolean) : (c.type.usage || []).slice();
    if (!u && st[0] && st[0].indexOf('적당량') >= 0 && c.brand.id === 'drsthe') st[0] = st[0].replace('본품 ', '').replace('적당량', c.title + ' 적당량');
    return st;
  }
  function infoLines(type, c) {
    var X = { x: 1 };
    if (type === 'infoName') return [L('캡션', (c.brand.infoPrefix || '') + c.title, X)];
    if (type === 'infoVol') return [L('캡션', c.volume || '-', X)];
    if (type === 'infoUse') return [L('캡션', usageSteps(c).join(' '), X)];
    if (type === 'infoFunc') return [L('캡션', c.fn ? c.fn + (c.input.funcNo ? ' (' + c.input.funcNo + ')' : '') : '해당 없음', X)];
    if (type === 'infoInci') return [L('캡션', c.an.items.map(function (e) { return e.raw; }).join(', '), X)];
    return null;
  }
  var clean = function (s) { return String(s || '').replace(/\(.*?\)/g, '').trim(); };
  var josa = function (w, p) { try { return GEN.josa(w, p); } catch (e) { return w; } };
  function catOf(key) { return (TONE.CAT[key] || TONE.CAT.moist); }
  function tableLines(c, g) {
    var rows = [];
    var gname = g ? (g.ko || '') : '';
    var others = (c.mains || []).filter(function (m) { return !g || (g.members || []).every(function (x) { return x.k !== m.k; }); })
      .filter(function (m) { return GEN.norm(m.disp) !== GEN.norm(gname); });
    if (g) {
      var mem = (g.members || []).map(function (m) { return clean(m.raw); });
      var gc = (g.g && g.g.c) || (c.cats || [])[0] || 'barrier';
      var CT = catOf(gc);
      var ben = (g.g && (typeof g.g.ben === 'string' ? g.g.ben : '')) || CT.d.benLine;
      rows.push({
        en: [CT.en + ' Care', 'Formula'],
        body: [mem.slice(0, 3).join(', ') + (mem.length > 3 ? ' 등' : ''), (mem.length || '') + (mem.length ? '종 성분을 정교하게 조합하여,' : '성분을 정교하게 조합하여,')],
        strong: ben
      });
    }
    others.slice(0, g ? 1 : 2).forEach(function (m) {
      var CT = catOf(m.c);
      var en = String(m.enCat || m.en || CT.en).split(/\s+/);
      var enL = en.length > 2 ? [en.slice(0, Math.ceil(en.length / 2)).join(' '), en.slice(Math.ceil(en.length / 2)).join(' ')] : [en.join(' '), 'Care Tech'];
      rows.push({ en: enL, body: [josa(m.dispPct, '을/를') + ' 함께 담아,', m.mod || CT.d.mod], strong: m.ben || CT.d.benLine });
    });
    while (rows.length < 2) {
      var k = rows.length, cat = catOf((c.cats || [])[k] || (c.cats || [])[0]);
      var fin = (c.K && c.K.finish) || ['피부에 부드럽게 스며드는', '산뜻한 마무리감'];
      rows.push(k === 0
        ? { en: [cat.en + ' Care', 'Formula'], body: [cat.d.mod + ' 성분을 조합하여,'], strong: cat.d.benLine }
        : { en: ['Daily Comfort', 'Texture'], body: [fin[0] + ','], strong: fin[1] });
    }
    return rows.slice(0, 2);
  }
  function post(r, brand, input, layout) {
    if (!r || !r.blocks || !layout) return;
    var LB = {}; layout.blocks.forEach(function (b) { LB[b.id] = b; });
    var B = Object.assign({ id: brand }, C.brands[brand]);
    var c = GEN.buildContext(B, input);
    var an = c.an;
    r.blocks = r.blocks.filter(function (b) { return b.type !== 'infoAll' && !/^info/.test(b.type) && !/^dTbl/.test(b.type); });
    function put(id, lines, ph) {
      var lb = LB[id]; if (!lb || !lines) return;
      lines = lines.filter(Boolean).filter(function (l) { return l.t !== ''; }); if (!lines.length) return;
      var b = r.blocks.find(function (x) { return x.id === id; });
      if (!b) { b = { id: id }; r.blocks.push(b); }
      Object.assign(b, { type: lb.type, label: LABEL[id] || LABEL[lb.type] || lb.type, x: lb.x, y: lb.y, w: lb.w, align: lb.align || 'center', ph: ph ? 1 : 0, lines: lines });
    }
    (INFO[brand] || []).forEach(function (b) { put(b.id, infoLines(b.type, c)); });
    if (brand === 'drsthe') {
      var groups = [];
      try {
        var custom = V4 ? V4.toGroups(V4.parseComplex(input.complex), an) : [];
        groups = V4 ? V4.detectGroups(an, custom) : [];
      } catch (e) { groups = []; }
      var g = groups[0] || null;
      var head = g ? { ko: g.ko, en: g.en } : (c.four[2] || c.mains[1]) ? { ko: (c.four[2] || c.mains[1]).disp, en: (c.four[2] || c.mains[1]).en } : null;
      if (head) put('dWhat2Lbl', [L('h3', head.ko), L('캡션', head.en)]);
      var rows = tableLines(c, g);
      rows.forEach(function (row, k) {
        put('dTbl' + k + 'L', row.en.filter(Boolean).map(function (t) { return L('en', t); }));
        put('dTbl' + k + 'R', row.body.filter(Boolean).map(function (t) { return L('소본문', t); }).concat([L('h3', row.strong)]));
      });
    }
    // 블록 순서를 위에서 아래로 정렬 (문안 목록 · 엑셀 순서)
    r.blocks.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  }
  var og = GEN.generate;
  GEN.generate = function (brand, input, layout) {
    var r = og.apply(this, arguments);
    try { post(r, brand, input || {}, layout); } catch (e) { console.warn('[v5] 후처리 오류', e); }
    return r;
  };

  /* ---------- 3. 상세페이지 오른쪽 위 [새 텍스트 상자] 아이콘 ---------- */
  function addFab() {
    var wrap = document.getElementById('canvasWrap'); if (!wrap || document.getElementById('v5Fab')) return;
    var box = document.createElement('div'); box.className = 'v5-fab'; box.id = 'v5Fab';
    box.innerHTML = '<button type="button" class="v5-fab-btn" id="v5FabBtn" title="새 텍스트 상자 — 누른 뒤 상세페이지에서 넣을 위치를 클릭하세요" aria-label="새 텍스트 상자">' +
      '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="2.5" y="4.5" width="14" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 8.5h7M9.5 8.5v6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="18.5" cy="17.5" r="4.5" fill="currentColor"/><path d="M18.5 15.3v4.4M16.3 17.5h4.4" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>' +
      '<span>새 텍스트</span></button>';
    wrap.insertBefore(box, wrap.firstChild);
    var btn = box.querySelector('button');
    btn.onclick = function (e) {
      e.preventDefault(); e.stopPropagation();
      var t = document.getElementById('btnAddText');
      if (t) t.click();
      else alert('텍스트 상자 기능(js/v4-ui.js)이 로드되지 않았습니다. 강력 새로고침(Ctrl+F5) 후 다시 시도해 주세요.');
    };
    var sync = function () { var t = document.getElementById('btnAddText'); btn.classList.toggle('on', !!(t && t.classList.contains('on'))); };
    var obs = function () { var t = document.getElementById('btnAddText'); if (t) new MutationObserver(sync).observe(t, { attributes: true, attributeFilter: ['class'] }); };
    setTimeout(obs, 0); setTimeout(obs, 800);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addFab); else addFab();
})(window);
