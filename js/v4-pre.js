/* =========================================================
   v4 보정 (레이아웃 · 문안 후처리) — layouts/*.js 다음, app.js 앞에서 불러옵니다.
   1) 상품정보제공고시: 이전(v2) 목록형 포맷으로 복원 · 화장품제조업자 = 「제품 내 별도 표기」 자동 (두 브랜드)
   2) 복합 대표성분(예: 8종 마이크로바이옴) — [선택 입력 > 대표성분 구성] 입력 또는 전성분 자동 감지
      → 대표성분 리스트 · 상세 설명 박스(구성 성분 국문/영문 전체)에 반영
   3) 닥터에스떼 '마이크로바이옴 상세' · '피부 자극 테스트' 영역: 다른 제품 문구가 남아 있던 배경을 지운
      이미지(v4_06 / v4_08)로 교체하고, 시험 확인서 · 배지 · 결과 · 기관/기간 · 주석 박스를 모두 배치
   ========================================================= */
(function (G) {
  'use strict';
  var C = G.CONFIG, GEN = G.GEN, TONE = G.TONE, LAYOUTS = G.LAYOUTS || {};
  if (!C || !GEN || !TONE) return;
  var MAKER = '제품 내 별도 표기';
  var norm = function (s) { return String(s || '').replace(/\s+/g, '').replace(/[()\[\]{}]/g, '').toLowerCase(); };
  var L = function (r, t, ex) { return Object.assign({ r: r, t: t == null ? '' : String(t) }, ex || {}); };

  /* ---------- 0. 브랜드 기본값 ---------- */
  Object.keys(C.brands).forEach(function (k) { var b = C.brands[k]; b.info = b.info || {}; b.info.maker = MAKER; });

  /* ---------- 1. 레이아웃 보정 ---------- */
  function patchLayout(id, fn) { var Lo = LAYOUTS[id]; if (Lo && !Lo.v4) { fn(Lo); Lo.v4 = 1; } }
  function setBlock(Lo, id, geo) { var b = Lo.blocks.find(function (x) { return x.id === id; }); if (b) Object.assign(b, geo); return b; }
  function addBlock(Lo, b) { if (!Lo.blocks.some(function (x) { return x.id === b.id; })) Lo.blocks.push(Object.assign({ v4: 1, align: 'center' }, b)); }
  patchLayout('drsthe', function (Lo) {
    Lo.images.forEach(function (im) { im.src = im.src.replace('v3_06.jpg', 'v4_06.jpg').replace('v3_08.jpg', 'v4_08.jpg'); });
    // 마이크로바이옴(복합성분) 상세 — 다른 제품 이미지가 있던 자리 전체 사용
    setBlock(Lo, 'dWhat2Lbl', { x: 140, y: 14650, w: 1160, h: 1310, align: 'center', fs: 30 });
    // 피부 자극 테스트
    setBlock(Lo, 'dIrrLbl', { x: 7, y: 18627, w: 231, h: 108 });
    addBlock(Lo, { id: 'dIrrCert', type: 'dIrrCert', x: 460, y: 18890, w: 520, h: 420, fs: 26 });
    addBlock(Lo, { id: 'dIrrBadge', type: 'dIrrBadge', x: 110, y: 19340, w: 380, h: 300, fs: 34 });
    setBlock(Lo, 'dIrr', { x: 520, y: 19350, w: 840, h: 170, align: 'left', fs: 27 });
    setBlock(Lo, 'dIrrInfo', { x: 520, y: 19535, w: 840, h: 70, align: 'left', fs: 24 });
    addBlock(Lo, { id: 'dIrrNote', type: 'dIrrNote', x: 640, y: 19700, w: 760, h: 56, align: 'right', fs: 21 });
    // 상품정보제공고시: 이전 포맷(목록형 한 박스)
    Lo.blocks = Lo.blocks.filter(function (b) { return !/^info/.test(b.type); });
    addBlock(Lo, { id: 'infoAll', type: 'infoAll', x: 40, y: 25320, w: 1360, h: 1020, align: 'left', fs: 24 });
  });
  patchLayout('velinic', function (Lo) {
    Lo.blocks = Lo.blocks.filter(function (b) { return !/^info/.test(b.type); });
    addBlock(Lo, { id: 'vInfoAll', type: 'infoAll', x: 40, y: 39950, w: 1360, h: 1330, align: 'left', fs: 24 });
  });

  /* ---------- 2. 복합 대표성분 ---------- */
  // 형식: 이름 (영문) = 성분1, 성분2, ... | 수식어 / 설명   (영문 · 수식어/설명은 생략 가능)
  function parseComplex(text) {
    return String(text || '').split(/\n+/).map(function (ln) {
      ln = ln.trim(); if (!ln) return null;
      var m = ln.match(/^(.+?)\s*[=＝:：]\s*(.+)$/); if (!m) return null;
      var head = m[1].trim(), rest = m[2], en = '', desc = '';
      var pm = rest.split('|'); rest = pm[0]; desc = (pm[1] || '').trim();
      var em = head.match(/^(.*?)\s*\(([^)]*)\)\s*$/); if (em) { head = em[1].trim(); en = em[2].trim(); }
      var members = rest.split(/[,，、\n]+/).map(function (x) { return x.trim(); }).filter(Boolean);
      var dd = desc ? desc.split(/\s*\/\s*/) : [];
      return members.length ? { name: head, en: en, members: members, mod: dd[0] || '', ben: dd[1] || '' } : null;
    }).filter(Boolean);
  }
  function catOf(items) {
    var cnt = {}; items.forEach(function (i) { if (i.c && TONE.CAT[i.c]) cnt[i.c] = (cnt[i.c] || 0) + 1; });
    var best = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
    return best || 'barrier';
  }
  function toGroups(custom, an) {
    return custom.map(function (cx, i) {
      var set = {}; cx.members.forEach(function (m) { set[norm(m)] = 1; });
      var hits = an.items.filter(function (it) { return set[norm(it.raw)] || set[norm(it.k)] || set[norm(String(it.raw).replace(/\(.*?\)/g, ''))]; });
      hits.forEach(function (it) { set[norm(it.k)] = 1; });
      var c = catOf(hits), CT = TONE.CAT[c];
      var en = cx.en || (/^\d+/.test(cx.name) ? cx.name.match(/^\d+/)[0] + ' Complex' : cx.name);
      return { id: 'custom' + i, custom: 1, re: { test: function (k) { return !!set[norm(k)]; } }, min: 1, c: c,
        ko: function () { return cx.name; }, en: function () { return en; }, enTitle: en.replace(/^\d+\s*(종\s*)?/, ''),
        mod: cx.mod || CT.d.mod, ben: cx.ben || CT.d.benLine, feat: CT.v.bubble, card: CT.v.card, point: CT.d.point };
    });
  }
  function detectGroups(an, extra) {
    var out = [];
    (extra || []).concat(TONE.GROUPS || []).forEach(function (g) {
      var mem = [], seen = {};
      an.items.forEach(function (i) { if (g.re.test(i.k) && !seen[i.k]) { seen[i.k] = 1; mem.push(i); } });
      if (mem.length >= (g.min || 1) && !out.some(function (o) { return o.members.some(function (m) { return mem.indexOf(m) >= 0; }); }))
        out.push({ g: g, ko: g.ko(mem.length), en: g.en(mem.length), enTitle: g.enTitle || g.en(mem.length), members: mem });
    });
    return out;
  }
  function enOf(it) {
    var e = it.en; if (!e && GEN.lookup) { try { e = (GEN.lookup(it.raw) || {}).en; } catch (x) { } }
    return String(e || '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
  }

  /* ---------- 3. 문안 생성 래핑 ---------- */
  var og = GEN.generate;
  GEN.generate = function (brand, input, layout) {
    input = input || {};
    var f = document.getElementById('fComplex'), vi = document.getElementById('vInput');
    if (f && vi && !vi.classList.contains('hidden')) input.complex = f.value.trim();
    if (!String(input.maker || '').trim()) input.maker = MAKER;
    var an = GEN.analyze(input.inci || '');
    var custom = toGroups(parseComplex(input.complex), an);
    var gnames = custom.map(function (g) { return norm(g.ko()); });
    var inp2 = Object.assign({}, input, { mains: (input.mains || []).filter(function (m) { return gnames.indexOf(norm(m)) < 0; }) });
    var lay = layout ? Object.assign({}, layout, { blocks: layout.blocks.filter(function (b) { return !b.v4; }) }) : layout;
    var GR = TONE.GROUPS; custom.slice().reverse().forEach(function (g) { GR.unshift(g); });
    var r;
    try { r = og.call(this, brand, inp2, lay); }
    finally { custom.forEach(function (g) { var i = GR.indexOf(g); if (i >= 0) GR.splice(i, 1); }); }
    try { post(r, brand, input, layout, an, detectGroups(an, custom)); } catch (e) { console.warn('[v4] 후처리 오류', e); }
    if (r && r.ctx) r.ctx.groups = detectGroups(an, custom).map(function (x) { return x.ko; });
    return r;
  };

  var CAUTION = '1) 화장품 사용 시 또는 사용 후 직사광선에 의하여 사용부위가 붉은 반점, 부어오름 또는 가려움증 등의 이상 증상이나 부작용이 있는 경우 전문의 등과 상담할 것 2) 상처가 있는 부위 등에는 사용을 자제할 것 3) 보관 및 취급 시의 주의사항 가) 어린이의 손이 닿지 않는 곳에 보관할 것 나) 직사광선을 피해서 보관할 것';
  var LABEL = { infoAll: '상품정보제공고시', dIrrCert: '시험 결과 확인서', dIrrBadge: '자극 테스트 배지', dIrrNote: '시험 주석', dIrr: '피부 자극 테스트 결과', dIrrInfo: '시험 기관 · 기간', dIrrLbl: '자극 테스트 구분', dWhat2Lbl: '복합성분 상세', dWhat2: '복합성분 타이틀' };

  function post(r, brand, input, layout, an, groups) {
    if (!r || !r.blocks || !layout) return;
    var LB = {}; layout.blocks.forEach(function (b) { LB[b.id] = b; });
    var byId = {}; r.blocks.forEach(function (b) { byId[b.id] = b; });
    r.blocks = r.blocks.filter(function (b) { return !/^info/.test(b.type) || b.type === 'infoAll'; });
    function put(id, lines, ph) {
      var lb = LB[id]; if (!lb) return;
      lines = (lines || []).filter(Boolean).filter(function (l) { return l.t !== ''; });
      var b = byId[id];
      if (!b) { b = { id: id, type: lb.type, label: LABEL[id] || lb.type, x: lb.x, y: lb.y, w: lb.w, align: lb.align || 'center', ph: 0, lines: [] }; r.blocks.push(b); byId[id] = b; }
      b.x = lb.x; b.y = lb.y; b.w = lb.w; b.align = lb.align || b.align; b.lines = lines; b.ph = ph ? 1 : 0; if (LABEL[id]) b.label = LABEL[id];
    }
    var ctx = r.ctx || {}, B = C.brands[brand] || {}, info = B.info || {};
    var title = ctx.title || input.name || '', vol = ctx.volume || input.volume || '';

    /* 3-1. 복합성분 상세 (닥터에스떼) */
    if (brand === 'drsthe') {
      var g = groups[0];
      if (g) {
        put('dWhat2', [L('대제목', g.enTitle)]);
        var ls = [L('headline', g.ko), L('en', g.en)];
        if (g.g && g.g.detail) g.g.detail.forEach(function (d) { ls.push(L('소본문', d)); });
        g.members.forEach(function (m) { var e = enOf(m); ls.push(L('소본문', String(m.raw).replace(/\(.*?\)/g, '').trim() + (e ? '   |   ' + e : ''))); });
        ls.push(L('note', '*상기의 설명은 원료적 특성에 한함.'));
        put('dWhat2Lbl', ls);
      }
      /* 3-2. 피부 자극 테스트 */
      var res = String(input.irrResult || '').trim(), inf = String(input.irrInfo || '').trim();
      if (/^\d+(\.\d+)?$/.test(res)) res = '민감성 피부 첩포에 의한 일차 자극 평가 결과, 본 시험 제품의 평균 피부 반응도는 ' + res + "으로, 'no irritancy'로 판정되었다.";
      var sens = !res || /민감/.test(res + inf);
      put('dIrrLbl', [L('배지', sens ? '민감성' : '저자극')]);
      put('dIrrCert', [L('h3', '[시험 결과 확인서 이미지 삽입]'), L('소본문', '시험 성적서의 「시험 결과 확인서」 페이지를 캡처해 이 자리에 넣어 주세요.'), inf ? L('meta', inf) : null], 1);
      put('dIrrBadge', [L('h3', sens ? '민감성 피부자극' : '피부 자극'), L('h3', '테스트 완료'), (!res || /irritancy/i.test(res)) ? L('keypoint', '“ no irritancy ”') : null]);
      if (res) put('dIrr', [L('body', res, { ev: 1 })]);
      else put('dIrr', [L('body', "민감성 피부 첩포에 의한 일차 자극 평가 결과, 본 시험 제품의 평균 피부 반응도는 [0.00]으로, 'no irritancy'로 판정되었다.")], 1);
      if (inf) put('dIrrInfo', [L('meta', inf, { ev: 1 })]);
      else put('dIrrInfo', [L('meta', '[시험기관]  [시험기간 YY.MM.DD ~ YY.MM.DD]  [대상 · 인원]')], 1);
      put('dIrrNote', [L('note', '*피부 첩포에 의한 피부 일차 자극 평가에 대한 인체적용시험')]);
    }
    /* 3-3. 피부 자극 테스트 (벨리닉) */
    if (brand === 'velinic') {
      var vr = String(input.irrResult || '').trim(), vi2 = String(input.irrInfo || '').trim();
      if (/^\d+(\.\d+)?$/.test(vr)) vr = '민감성 피부 첩포에 의한 일차 자극 평가 결과, 본 시험 제품의 평균 피부 반응도는 ' + vr + "으로, 'no irritancy'로 판정되었다.";
      if (LB.vIrrB) put('vIrrB', vr ? [L('body', vr, { ev: 1 })] : [L('body', "민감성 피부 첩포에 의한 일차 자극 평가 결과, 본 시험 제품의 평균 피부 반응도는 [0.00]으로, 'no irritancy'로 판정되었다.")], !vr);
      if (LB.vIrrInfo) put('vIrrInfo', [vi2 ? L('meta', vi2, { ev: 1 }) : L('meta', '[시험기관]  [시험기간 YY.MM.DD ~ YY.MM.DD]  [대상 · 인원]'), L('note', '*피부 첩포에 의한 피부 일차 자극 평가에 대한 인체적용시험')], !vi2);
    }
    /* 3-4. 상품정보제공고시 (이전 포맷) */
    var infoId = LB.infoAll ? 'infoAll' : (LB.vInfoAll ? 'vInfoAll' : null);
    if (infoId) {
      var type = GEN.detectType ? GEN.detectType(title) : { usage: [] };
      var usage = String(input.usage || '').trim() ? input.usage.split(/\n+/).map(function (s) { return s.replace(/^\s*(STEP\.?\s*\d+\.?|\d+[\.\)])\s*[:：]?\s*/i, '').trim(); }).filter(Boolean).join(' ') : (type.usage || []).join(' ');
      var fn = String(input.functional || '').trim() ? input.functional + (input.funcNo ? ' (' + input.funcNo + ')' : '') : '해당 없음';
      var inci = an.items.map(function (i) { return i.raw; }).join(', ');
      var X = { x: 1 };
      put(infoId, [
        L('h3', '제품정보'),
        L('body', '제품명 : ' + (B.infoPrefix || '') + title, X),
        L('body', '용량 · 중량 : ' + (vol || '-'), X),
        L('body', '제품 주요 사양 : 모든 피부용', X),
        L('body', '사용기한 : ' + (input.expiry || info.expiry || '제품 내 별도 표기'), X),
        L('body', '사용 방법 : ' + (usage || '상세페이지 사용법 참조'), X),
        L('body', '화장품제조업자 : ' + MAKER, X),
        L('body', '화장품책임판매업자 : ' + (input.seller || info.seller || '(입력 필요)'), X),
        L('body', '제조국 : ' + (info.country || '대한민국'), X),
        L('body', '식품의약품안전처 심사 필 유무 : ' + fn, X),
        L('body', '품질보증기준 : 본 제품은 공정거래위원회 고시 「소비자분쟁해결기준」에 의거 교환 또는 보상 받을 수 있습니다.', X),
        L('body', '소비자상담 전화번호 : ' + (input.phone || info.phone || '(입력 필요)'), X),
        L('h3', '전성분'), L('note', inci, X),
        L('h3', '사용 시 주의사항'), L('note', CAUTION, X),
        input.caution ? L('note', input.caution, X) : null
      ]);
    }
  }
  G.V4 = { parseComplex: parseComplex, detectGroups: detectGroups, toGroups: toGroups, norm: norm, enOf: enOf, MAKER: MAKER };
})(window);
