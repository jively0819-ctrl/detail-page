/* =========================================================
   v6 보정 — v5-fix.js 다음, app.js 앞에서 불러옵니다. (기존 파일은 수정하지 않습니다)
   [벨리닉]
   1) 인트로 성분 버블 3개 모두 문안 생성
      - 대표성분이 1~2개뿐이어도 복합성분 · 4대 성분 · 서포트 성분 순으로 채워 버블 2 · 3이 비지 않도록 함
      - 버블 2 박스 높이를 늘려 아래 줄(원료 설명)까지 덮도록 조정
   2) 텍스처 영역(이미지 05)
      - 배경에 남아 있던 원본 문구(밤-오일-고마쥬 … / Cleansing Balm > Oil > Gommage)를 지운 이미지(v6_05.jpg)로 교체
      - 헤드라인 박스 · 단계 박스를 원본 문구 자리 전체로 확장
      - 원본 사진(멜팅 고마쥬 사용 컷)이 맞지 않는 제품은 [제형 이미지 교체] 안내 박스 표시
   [공통]
   3) 제품 유형 판별 보정 — 이름에 '마스크'만 있는 시트 마스크(예: 라하 마스크)가 워시오프로 잡히던 문제
      - 제품 설명 · 용량 · 사용법에 '시트' · '매' · '부직포' 등이 있으면 시트 마스크로 판별
      - [선택 입력 > 제품 유형]에서 직접 지정 가능 (자동 판별보다 우선)
   ========================================================= */
(function (G) {
  'use strict';
  var C = G.CONFIG, GEN = G.GEN, LAYOUTS = G.LAYOUTS || {};
  if (!C || !GEN) return;
  var L = function (r, t, ex) { return Object.assign({ r: r, t: t == null ? '' : String(t) }, ex || {}); };

  /* ---------- 제품 유형 ---------- */
  // 생성 엔진은 제품명으로만 유형을 판별하므로, 지정 유형의 대표 키워드를 제품명 앞에 잠시 붙여 생성한 뒤 결과에서 지웁니다.
  var KINDS = [
    { v: '', t: '자동 판별 (제품명 · 설명 기준)' },
    { v: 'sheet', t: '시트 마스크', mark: '시트마스크' },
    { v: 'washoff', t: '워시오프 마스크', mark: '클레이마스크' },
    { v: 'sleeping', t: '슬리핑 마스크', mark: '슬리핑마스크' },
    { v: 'modeling', t: '모델링 마스크', mark: '모델링마스크' },
    { v: 'pad', t: '토너 패드', mark: '토너패드' }
  ];
  var SHEET_RE = /시트|sheet|부직포|하이드로겔|큐프라|텐셀|\d+\s*매(?![가-힣])|1\s*장/i;
  function autoKind(input) {
    var t = GEN.detectType(String(input.name || ''));
    if (t.kind !== 'washoff' || t.ko !== '마스크') return '';            // 제품명에 유형이 분명하면 그대로
    var txt = [input.desc, input.description, input.volume, input.usage, input.name].join(' ');
    return SHEET_RE.test(txt) ? 'sheet' : '';
  }
  function kindOf(input) {
    var sel = document.getElementById('fKind'), vi = document.getElementById('vInput');
    if (sel && vi && !vi.classList.contains('hidden')) input.kind = sel.value;
    return input.kind || autoKind(input);
  }

  /* ---------- 레이아웃 (벨리닉) ---------- */
  var TEX_Y = 0;
  (function () {
    var Lo = LAYOUTS.velinic; if (!Lo || Lo.v6) return;
    var y = 0;
    Lo.images.forEach(function (im) {
      if (/(v\d+_)?05\.jpg$/.test(im.src)) { TEX_Y = y; im.src = im.src.replace(/(v\d+_)?05\.jpg$/, 'v6_05.jpg'); }
      y += im.h;
    });
    if (!TEX_Y) TEX_Y = 15622;
    var set = function (id, g) { var b = Lo.blocks.find(function (x) { return x.id === id; }); if (b) Object.assign(b, g); return b; };
    set('vBubble1', { y: 1095, h: 255 });
    set('vTexH', { x: 122, y: TEX_Y + 160, w: 1196, h: 330 });
    set('vTexSteps', { x: 66, y: TEX_Y + 1217, w: 1308, h: 93 });
    if (!Lo.blocks.some(function (b) { return b.id === 'vTexImg'; }))
      Lo.blocks.push({ id: 'vTexImg', type: 'vTexImg', v6: 1, x: 320, y: TEX_Y + 820, w: 800, h: 120, align: 'center' });
    Lo.v6 = 1;
  })();

  /* ---------- 문안 후처리 ---------- */
  var uniq = function (arr) { return arr.filter(Boolean).filter(function (x, i, a) { return a.findIndex(function (y) { return y.disp === x.disp; }) === i; }); };
  function bubbleLines(m) { return [L('캡션', m.enCat || m.en), L('h3', m.origin), L('h3', m.dispLong || m.disp), L('캡션', m.feat)]; }
  function post(r, brand, input, layout, kind) {
    if (!r || !r.blocks || !layout || brand !== 'velinic') return;
    var LB = {}; layout.blocks.forEach(function (b) { LB[b.id] = b; });
    var B = Object.assign({ id: brand }, C.brands[brand]);
    var c = GEN.buildContext(B, input);
    function put(id, lines, ph, label) {
      var lb = LB[id]; if (!lb) return;
      lines = (lines || []).filter(Boolean).filter(function (l) { return l.t !== ''; }); if (!lines.length) return;
      var b = r.blocks.find(function (x) { return x.id === id; });
      if (!b) { b = { id: id }; r.blocks.push(b); }
      Object.assign(b, { type: lb.type, label: label || b.label || lb.type, x: lb.x, y: lb.y, w: lb.w, align: lb.align || 'center', ph: ph ? 1 : 0, lines: lines });
    }
    // 1) 성분 버블 3개
    var pool = uniq([c.mains[0], c.heroIt, c.mains[1], c.mains[2]].concat(c.groups || [], c.four || [], c.cards || [], c.support || []));
    for (var i = 0; i < 3; i++) {
      var id = 'vBubble' + i, has = r.blocks.some(function (b) { return b.id === id && b.lines && b.lines.length; });
      if (has) continue;
      var m = pool[i];
      if (m) put(id, bubbleLines(m), 0, '성분 버블 ' + (i + 1));
      else put(id, [L('note', '[성분 버블 ' + (i + 1) + ' — 대표성분을 추가 입력해 주세요]', { ph: 1 })], 1, '성분 버블 ' + (i + 1));
    }
    // 2) 텍스처 사진 교체 안내 (원본 사진 = 멜팅 고마쥬 사용 컷)
    if (c.type.kind !== 'meltgommage') {
      var shot = { sheet: '시트를 얼굴에 붙인 사용 컷', pad: '패드로 닦아내는 사용 컷', modeling: '모델링팩을 펴 바르고 떼어내는 단계 컷' }[c.type.kind] || (c.type.ko + ' 제형 · 사용 단계 컷');
      put('vTexImg', [L('h3', '[제형 이미지 교체]'), L('캡션', '현재 사진은 다른 제품(멜팅 고마쥬) 컷입니다 · ' + shot + '으로 교체해 주세요')], 1, '텍스처 이미지 안내');
    }
    r.blocks.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  }

  function strip(r, mark) {
    if (!mark || !r) return;
    var re = new RegExp(mark + '\\s?', 'g');
    var fix = function (s) { return typeof s === 'string' ? s.replace(re, '') : s; };
    (r.blocks || []).forEach(function (b) { b.label = fix(b.label); (b.lines || []).forEach(function (l) { l.t = fix(l.t); }); });
    var x = r.ctx; if (!x) return;
    Object.keys(x).forEach(function (k) { if (typeof x[k] === 'string') x[k] = fix(x[k]); else if (Array.isArray(x[k])) x[k] = x[k].map(fix); });
  }

  var og = GEN.generate;
  GEN.generate = function (brand, input, layout) {
    input = input || {};
    var kind = '';
    try { kind = kindOf(input); } catch (e) { kind = ''; }
    var K = KINDS.find(function (k) { return k.v && k.v === kind; });
    var cur = GEN.detectType(String(input.name || ''));
    var mark = K && cur.kind !== K.v ? K.mark : '';
    var inp = input;
    if (mark) {
      inp = Object.assign({}, input, { name: mark + ' ' + String(input.name || '') });
      if (!String(input.nameEn || '').trim()) { try { inp.nameEn = GEN.englishName(GEN.splitVolume(input.name, input.volume).title) || ''; } catch (e) { } }
    }
    var lay = layout ? Object.assign({}, layout, { blocks: layout.blocks.filter(function (b) { return !b.v6; }) }) : layout;
    var r = og.call(this, brand, inp, lay);
    if (inp !== input) ['complex', 'maker'].forEach(function (k) { if (inp[k] != null && input[k] == null) input[k] = inp[k]; });
    try { post(r, brand, inp, layout, kind); } catch (e) { console.warn('[v6] 후처리 오류', e); }
    strip(r, mark);
    if (r && r.ctx && K) r.ctx.type = K.t;
    return r;
  };

  /* ---------- 입력 화면: [선택 입력 > 제품 유형] ---------- */
  function addKindField() {
    var box = document.getElementById('optBox'); if (!box || document.getElementById('fKind')) return;
    var lab = document.createElement('label'); lab.className = 'fld';
    lab.innerHTML = '<span>제품 유형 <em>사용법 · 텍스처 · 추천 문안에 반영 · 이름에 \'마스크\'만 있는 시트 마스크는 여기서 지정</em></span>';
    var sel = document.createElement('select'); sel.id = 'fKind';
    KINDS.forEach(function (k) { var o = document.createElement('option'); o.value = k.v; o.textContent = k.t; sel.appendChild(o); });
    lab.appendChild(sel);
    var sum = box.querySelector('summary');
    box.insertBefore(lab, sum ? sum.nextSibling : box.firstChild);
    var hint = document.createElement('div'); hint.className = 'desc-hint'; hint.id = 'fKindHint'; lab.appendChild(hint);
    var upd = function () {
      var nm = (document.getElementById('fName') || {}).value || '', ds = (document.getElementById('fDesc') || {}).value || '', vo = (document.getElementById('fVol') || {}).value || '';
      var a = sel.value ? '' : autoKind({ name: nm, desc: ds, volume: vo });
      var t = a ? '시트 마스크' : (nm ? GEN.detectType(nm).ko : '');
      hint.textContent = sel.value ? '' : (t ? '자동 판별: ' + t : '');
    };
    ['fName', 'fDesc', 'fVol'].forEach(function (id) { var el = document.getElementById(id); if (el) el.addEventListener('input', upd); });
    sel.addEventListener('change', upd); upd();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addKindField); else addKindField();
  G.V6 = { autoKind: autoKind, KINDS: KINDS };
})(window);
