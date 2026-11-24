/* =========================================================
   v12 — 교육자료(PPT · PDF · Word)로 제품 포인트 잡기 + 빈 문안 채우기
   index.html 맨 아래, 다른 js 파일을 모두 불러온 뒤 마지막 줄에 불러옵니다.

   [1] 입력 화면에 [교육자료 업로드] 칸 추가
     - 사내 교육자료(.pptx 권장 · .pdf · .docx)를 올리면 브라우저 안에서 글자를 읽습니다. (서버로 보내지 않음)
     - 슬라이드 제목 · 표 · 글상자 위치를 보고 다음을 자동으로 정리합니다.
         라인명 · 제품명(국/영) · 한 줄 소개 · 콘셉트(○○란?) · 판매 포인트 · 대표성분(이름 · 헤드라인 · 설명 · 핵심 효과)
         · 텍스처 · 사용 단계 · 수치 근거
     - 기본정보(제품명 · 용량 · 기능성)와 전성분을 함께 보고
         · 교육자료의 대표성분이 전성분에 실제로 있는지 확인 (몇 번째 성분인지 표시)
         · 기능성 심사 전이면 주름 · 미백 표현을 일반 표현으로 바꿈
     - 교육자료 표현 중 화장품 광고에 쓰면 안 되는 표현(보톡스 · 치료 · 재생 · 면역 · 염증 · 만병통치약 등)은
       문안에 넣기 전에 대체 표현으로 바꾸거나 빼고, [바꾼 표현] 목록으로 보여 줍니다.
     - 정리된 포인트는 패널에서 바로 고칠 수 있고, 이 브라우저에 저장됩니다.

   [2] 문안 생성에 교육자료 포인트 반영 (GEN.generate 감싸기)
     - 인트로 한 줄 소개 · 키포인트, 제품 방식(○○란?), 핵심 특징 1~3(판매 포인트), 텍스처,
       대표성분 1~3, 케어 STEP · 성분 POINT, 제품 요약, 사용법을 교육자료 기준으로 씁니다.
     - 교육자료에 없는 부분은 기존 생성 문안을 그대로 씁니다.

   [3] 빈 문안 채우기
     - 레이아웃에 자리가 있는데 문안이 만들어지지 않은 박스(대표성분이 사전에 없을 때, 특징 · 추천 대상이
       3개가 안 될 때 등)를 기본 문안이나 [입력 필요] 안내 문구로 채워, 박스가 빠지지 않게 합니다.

   옵션 (이 파일보다 먼저 선언)
     window.V12_OPTIONS = { fillEmpty: true, jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js' }
   ========================================================= */
(function (G) {
  'use strict';
  var doc = G.document;
  var V12 = G.V12 = G.V12 || {};
  var OPT = G.V12_OPTIONS = Object.assign({
    fillEmpty: true,
    jszip: 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
    storeKey: 'v12.edu'
  }, G.V12_OPTIONS || {});

  var str = function (s) { return String(s == null ? '' : s).trim(); };
  var one = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var nz = function (s) { return String(s || '').replace(/[\s()\[\]{}·,\-_.]/g, '').toLowerCase(); };
  var CIRCLE = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮';

  /* =========================================================
     1. 작은 XML 파서 (pptx · docx 공용 · 브라우저/노드 모두 동작)
     ========================================================= */
  function decode(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, function (m, e) {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
    });
  }
  function parseXml(xml) {
    xml = String(xml || '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    var root = { n: '#root', a: '', c: [] }, stack = [root];
    var re = /<(\/?)([A-Za-z_][\w:.\-]*)([^>]*?)(\/?)>|([^<]+)/g, m;
    while ((m = re.exec(xml))) {
      var top = stack[stack.length - 1];
      if (m[5] != null) { top.c.push({ n: '#t', t: decode(m[5]) }); continue; }
      if (m[1]) {
        while (stack.length > 1 && stack.pop().n !== m[2]) { /* 짝이 안 맞으면 닫을 때까지 */ }
        continue;
      }
      var node = { n: m[2], a: m[3] || '', c: [] };
      top.c.push(node);
      if (!m[4]) stack.push(node);
    }
    return root;
  }
  function attr(node, k) {
    if (!node) return '';
    var m = new RegExp('(?:^|\\s)' + k.replace(/[.:]/g, '\\$&') + '="([^"]*)"').exec(node.a || '');
    return m ? decode(m[1]) : '';
  }
  function kids(node, name) { return (node && node.c || []).filter(function (x) { return x.n === name; }); }
  function kid(node, name) { return kids(node, name)[0] || null; }
  function find(node, name) {
    if (!node || !node.c) return null;
    for (var i = 0; i < node.c.length; i++) {
      var x = node.c[i];
      if (x.n === name) return x;
      var r = find(x, name);
      if (r) return r;
    }
    return null;
  }
  function findAll(node, name, out) {
    out = out || [];
    (node && node.c || []).forEach(function (x) {
      if (x.n === name) out.push(x);
      else findAll(x, name, out);
    });
    return out;
  }
  /* a:p 한 문단의 글자 (a:t · a:br · w:t · w:tab) */
  function paraText(p) {
    var out = '';
    (function walk(n) {
      (n.c || []).forEach(function (x) {
        if (x.n === '#t') return;
        if (x.n === 'a:t' || x.n === 'w:t') out += (x.c || []).map(function (t) { return t.t || ''; }).join('');
        else if (x.n === 'a:br' || x.n === 'w:br') out += ' ';
        else if (x.n === 'w:tab') out += ' ';
        else walk(x);
      });
    })(p);
    return one(out);
  }

  /* =========================================================
     2. PPTX → 슬라이드별 글상자 목록 (위치 포함)
     ========================================================= */
  function xfrmOf(node) {
    var x = node && (find(node, 'a:xfrm') || find(node, 'p:xfrm'));
    var off = kid(x, 'a:off'), ext = kid(x, 'a:ext');
    return {
      x: +attr(off, 'x') || 0, y: +attr(off, 'y') || 0,
      w: +attr(ext, 'cx') || 0, h: +attr(ext, 'cy') || 0,
      chx: +attr(kid(x, 'a:chOff'), 'x') || 0, chy: +attr(kid(x, 'a:chOff'), 'y') || 0,
      chw: +attr(kid(x, 'a:chExt'), 'cx') || 0, chh: +attr(kid(x, 'a:chExt'), 'cy') || 0
    };
  }
  function slideElems(xml) {
    var root = parseXml(xml), tree = find(root, 'p:spTree'), els = [];
    function T(f, x, y) { return f(x, y); }
    function walk(node, tf) {
      (node.c || []).forEach(function (n) {
        if (n.n === 'p:sp') {
          var xf = xfrmOf(kid(n, 'p:spPr')), tx = kid(n, 'p:txBody');
          if (!tx) return;
          var paras = kids(tx, 'a:p').map(paraText).filter(Boolean);
          if (!paras.length) return;
          var p0 = T(tf, xf.x, xf.y), p1 = T(tf, xf.x + xf.w, xf.y + xf.h);
          els.push({ x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], paras: paras, tbl: false });
        } else if (n.n === 'p:graphicFrame') {
          var gx = xfrmOf(kid(n, 'p:xfrm') ? n : n), tbl = find(n, 'a:tbl');
          if (!tbl) return;
          var cols = findAll(find(tbl, 'a:tblGrid'), 'a:gridCol').map(function (c) { return +attr(c, 'w') || 0; });
          var yy = gx.y;
          kids(tbl, 'a:tr').forEach(function (tr) {
            var rh = +attr(tr, 'h') || 0, xx = gx.x;
            kids(tr, 'a:tc').forEach(function (tc, ci) {
              var cw = cols[ci] || (gx.w / Math.max(1, kids(tr, 'a:tc').length));
              var paras = findAll(tc, 'a:p').map(paraText).filter(Boolean);
              if (paras.length) {
                var p0 = T(tf, xx, yy), p1 = T(tf, xx + cw, yy + rh);
                els.push({ x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], paras: paras, tbl: true });
              }
              xx += cw;
            });
            yy += rh;
          });
        } else if (n.n === 'p:grpSp') {
          var g = xfrmOf(kid(n, 'p:grpSpPr'));
          var sx = g.chw ? g.w / g.chw : 1, sy = g.chh ? g.h / g.chh : 1;
          walk(n, function (x, y) { return tf(g.x + (x - g.chx) * sx, g.y + (y - g.chy) * sy); });
        } else if (n.n === 'mc:AlternateContent') {
          var ch = kid(n, 'mc:Choice') || kid(n, 'mc:Fallback');
          if (ch) walk(ch, tf);
        }
      });
    }
    if (tree) walk(tree, function (x, y) { return [x, y]; });
    els.sort(function (a, b) { return (Math.abs(a.y - b.y) < 150000 ? 0 : a.y - b.y) || a.x - b.x; });
    return els;
  }
  function loadScript(src) {
    return new Promise(function (ok, no) {
      var s = doc.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { no(new Error('라이브러리를 불러오지 못했습니다: ' + src)); };
      doc.head.appendChild(s);
    });
  }
  async function zipOf(file) {
    if (!G.JSZip) await loadScript(OPT.jszip);
    return G.JSZip.loadAsync(await file.arrayBuffer());
  }
  async function readPptx(file) {
    var zip = await zipOf(file);
    var names = Object.keys(zip.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); });
    names.sort(function (a, b) { return (+a.match(/(\d+)\.xml$/)[1]) - (+b.match(/(\d+)\.xml$/)[1]); });
    var pres = zip.file('ppt/presentation.xml') ? await zip.file('ppt/presentation.xml').async('string') : '';
    var W = +((/<p:sldSz[^>]*cx="(\d+)"/.exec(pres) || [])[1]) || 12192000;
    var slides = [];
    for (var i = 0; i < names.length; i++) {
      slides.push({ no: i + 1, els: slideElems(await zip.file(names[i]).async('string')) });
    }
    return { slides: slides, W: W };
  }
  async function readDocx(file) {
    var zip = await zipOf(file);
    var xml = await zip.file('word/document.xml').async('string');
    return textToSlides(findAll(parseXml(xml), 'w:p').map(paraText).filter(Boolean).join('\n'));
  }
  async function readPdf(file) {
    if (!G.V10 || !G.V10.readPdf) throw new Error('PDF 읽기 모듈(v10-pdf.js)이 없습니다. PPT(.pptx)로 올려 주세요.');
    var r = await G.V10.readPdf(file), pages = [];
    if (Array.isArray(r.pages) && r.pages.length) {
      pages = r.pages.map(function (p) { return typeof p === 'string' ? p : str(p && (p.text || p.str || '')); });
    }
    if (!pages.filter(Boolean).length) pages = String(r.text || '').split(/\f|\n\s*-{3,}\s*\d+\s*-{3,}\s*\n/);
    return { slides: pages.map(function (t, i) { return textSlide(t, i + 1); }), W: 1000 };
  }
  /* 위치 정보가 없는 글(PDF · Word) → 한 쪽을 한 슬라이드로, 줄마다 글상자 하나 */
  function textSlide(t, no) {
    var y = 0;
    return {
      no: no, els: String(t || '').split(/\n+/).map(one).filter(Boolean).map(function (l) {
        y += 10;
        return { x: 0, y: y, w: 1000, h: 10, paras: [l], tbl: false, flat: true };
      })
    };
  }
  function textToSlides(t) {
    /* Word: 제목처럼 보이는 줄(주요 성분 ① …, 판매 포인트, HOW TO USE …)에서 쪽을 나눔 */
    var chunks = [[]];
    String(t || '').split('\n').forEach(function (l) {
      if (/^(KEY INGREDIENTS?|SELLING POINTS?|HOW TO USE|주요\s*성분\s*[①-⑮\d]|판매\s*포인트|사용\s*(단계|방법|법)|.{1,10}(이란|란)\?$)/i.test(one(l)) && chunks[chunks.length - 1].length) chunks.push([]);
      chunks[chunks.length - 1].push(l);
    });
    return { slides: chunks.map(function (c, i) { return textSlide(c.join('\n'), i + 1); }), W: 1000 };
  }

  /* =========================================================
     3. 화장품 광고 표현 정리
     ========================================================= */
  var PRE = [
    [/연어\s*정액에서\s*추출한/g, '연어에서 얻은'],
    [/바르는\s*(타입의\s*)?보톡스/g, '바르는 탄력 케어'],
    [/[,，]?\s*[‘’'"“”]?만병통치약[‘’'"“”]?\s*(이라는|이란)?/g, function (m, j) { return j ? ' ' + j : ''; }]
  ];
  var DROP = [
    [/치료|질환|처방|의약|약학|약이나/, '의약품 오인 표현'],
    [/상처|세포|재건|재생|사멸|손상|표피\s*두께|진피|아쿠아포린|DNA\s*·?\s*ATP/, '의약품 · 생리활성 오인 표현'],
    [/면역|혈액\s*순환|염증|NO\s*합성|저해/, '의약품 오인 표현'],
    [/보톡스|botox|fusion\s*protein/i, '의약품(보툴리눔) 오인 · 상표'],
    [/만병통치|불로장생/, '과장 · 의약품 오인 표현'],
    [/콜라겐\s*(생성|발현|수치|합성|증가)/, '생리활성(콜라겐 생성) 표현'],
    [/효과를\s*볼\s*수\s*있/, '효능 보장 표현']
  ];
  function repl(fn) {
    var hasW = /주름/.test(fn || ''), hasB = /미백/.test(fn || '');
    var R = [
      [/침투력을?\s*높인/g, '흡수감을 높인'],
      [/(피부\s*)?침투가?\s*용이/g, '피부에 부드럽게 스며듦'],
      [/(피부\s*)?침투가?\s*가능한?/g, '피부에 부드럽게 스며드는'],
      [/침투/g, '흡수'],
      [/리프팅\s*업/g, '탄력 케어'],
      [/리프팅/g, '탄력'],
      [/항노화\s*예방|노화\s*예방|항노화|안티\s*에이징/g, '탄력 케어'],
      [/항염(\s*(효능|효과|케어))?/g, '진정 케어'],
      [/다크서클(\s*(개선|감소))?/g, '눈가 케어'],
      [/보약/g, '영양 케어'],
      [/어려\s*보이게/g, '생기 있어 보이게']
    ];
    if (!hasW) R.push([/항주름|주름\s*(감소|개선)|주름/g, '탄력 케어']);
    if (!hasB) R.push([/미백/g, '맑은 피부톤 케어']);
    return R;
  }
  var WARN = [
    [/특허/, '특허 번호 · 등록 여부를 확인한 뒤 표기'],
    [/영약/, '의약품 오인 소지 — 브랜드 콘셉트로만 사용'],
    [/장수\s*비타민/, '원료사 자료로 근거 확인 필요'],
    [/\d+(\.\d+)?\s*%/, '시험 근거(원료 · 인체적용) 확인 후 표기']
  ];
  /* 괄호 밖의 쉼표 · 가운뎃점 · 빗금으로 나눔 */
  function segs(s) {
    var out = [], cur = '', d = 0, seps = [];
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '(' || ch === '[') d++;
      if (ch === ')' || ch === ']') d = Math.max(0, d - 1);
      if (!d) {
        var m = /^(,\s+|\s+·\s+|\s+\/\s+|\s+\+\s+)/.exec(s.slice(i));
        if (m) { out.push(cur); seps.push(m[1]); cur = ''; i += m[1].length - 1; continue; }
      }
      cur += ch;
    }
    out.push(cur);
    return { parts: out, seps: seps };
  }
  /* log: 바꾼 표현 기록 배열 · 반환: 정리된 문장 ('' = 통째로 뺌) */
  function safe(text, fn, log, where) {
    var src = one(text);
    if (!src) return '';
    var s = src;
    PRE.forEach(function (r) { s = s.replace(r[0], r[1]); });
    s = one(s).replace(/‘([^‘’]+)‘/g, '‘$1’').replace(/’\s+(이라는|이란|라는)/g, '’$1');
    var sp = segs(s), R = repl(fn), keep = [], kseps = [], lastDropped = false;
    sp.parts.forEach(function (p, i) {
      var why = null;
      DROP.some(function (d) { if (d[0].test(p)) { why = d[1]; return true; } return false; });
      if (why) {
        if (log) log.push({ from: one(p), to: '', why: why, where: where || '' });
        lastDropped = i === sp.parts.length - 1;
        return;
      }
      var q = p;
      R.forEach(function (r) { q = q.replace(r[0], r[1]); });
      if (q !== p && log) log.push({ from: one(p), to: one(q), why: '화장품 표현으로 순화', where: where || '' });
      keep.push(q);
      if (i < sp.seps.length) kseps.push(sp.seps[i]);
    });
    if (!keep.length) return '';
    /* 서술어가 든 마지막 조각이 빠진 문장은 통째로 뺌 */
    if (lastDropped && /(다|요)\.?$/.test(src)) return '';
    /* 절반 넘게 빠져 뜻이 안 통하는 조각은 통째로 뺌 */
    var keptLen = keep.join('').length;
    if (keep.length < sp.parts.length && (keptLen < src.length * 0.45 || /=/.test(src))) return '';
    var res = keep[0];
    for (var k = 1; k < keep.length; k++) res += (kseps[k - 1] || ', ') + keep[k];
    res = dedupe(one(res).replace(/^[,·\/+\s]+|[,·\/+\s]+$/g, ''));
    if (src !== s && log && !log.some(function (l) { return l.from === src; })) {
      log.push({ from: src, to: res, why: '의약품 오인 · 과장 표현 정리', where: where || '' });
    }
    return res;
  }
  /* 같은 말 반복 정리: '탄력 케어 · 탄력 케어' → '탄력 케어' */
  function dedupe(s) {
    var sp = segs(s), seen = {}, out = '', first = true;
    sp.parts.forEach(function (p, i) {
      var k = nz(p);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out += (first ? '' : (sp.seps[i - 1] || ', ')) + p;
      first = false;
    });
    out = out.replace(/(탄력 케어|진정 케어|눈가 케어)(\s*(및|,|·)\s*)\1/g, '$1');
    return one(out);
  }
  function warnsOf(text) {
    var w = [];
    WARN.forEach(function (r) { if (r[0].test(text)) w.push(r[1]); });
    return w;
  }

  /* =========================================================
     4. 교육자료 분석 → 제품 포인트
     ========================================================= */
  var LABEL = /^(KEY\s*INGREDIENTS?|SELLING\s*POINTS?|HOW\s*TO\s*USE|TEXTURE|CONCEPT|BRAND\s*STORY|핵심\s*효과\s*·?\s*POINT|POINT|주요\s*성분|목차|INDEX|CONTENTS)$/i;
  function noiseLine(t, foot) {
    return !t || LABEL.test(t) || foot[t] || /^※|사내\s*교육|외부\s*공유|www\.|https?:|^\d+$|^THANK\s*YOU$|^감사합니다\.?$/i.test(t);
  }
  function footers(slides) {
    var cnt = {};
    slides.forEach(function (s) {
      var seen = {};
      s.els.forEach(function (e) { e.paras.forEach(function (p) { if (!seen[p]) { seen[p] = 1; cnt[p] = (cnt[p] || 0) + 1; } }); });
    });
    var f = {}, min = Math.max(3, Math.ceil(slides.length * 0.4));
    Object.keys(cnt).forEach(function (k) { if (cnt[k] >= min && k.length < 40) f[k] = 1; });
    return f;
  }
  function joinWrap(lines) {
    var out = [];
    lines.forEach(function (l) {
      var prev = out[out.length - 1];
      if (prev != null && !/[.!?。:…]$/.test(prev) && /^[가-힣a-z(]/.test(l) && prev.length > 8 && !/^(\d+[.)]|[-•])/.test(l)) out[out.length - 1] = prev + ' ' + l;
      else out.push(l);
    });
    return out;
  }
  function cx(e) { return e.x + e.w / 2; }
  /* 짧은 표 제목(열 머리) + 그 아래 글상자 → 열별 묶음 */
  function columns(s, foot) {
    var anchors = s.els.filter(function (e) {
      var t = e.paras.join(' ');
      return e.tbl && e.paras.length === 1 && t.length <= 20 && !/—|–/.test(t) && !noiseLine(t, foot);
    });
    if (anchors.length < 2) return [];
    var ay = Math.min.apply(null, anchors.map(function (a) { return a.y; }));
    var cols = anchors.map(function (a) { return { a: a, title: a.paras[0], lines: [] }; });
    s.els.forEach(function (e) {
      if (e.tbl || e.y < ay || noiseLine(e.paras[0], foot)) return;
      var best = null, bd = 1e18;
      cols.forEach(function (c) { var d = Math.abs(cx(c.a) - cx(e)); if (d < bd) { bd = d; best = c; } });
      if (best) e.paras.forEach(function (p) { if (!noiseLine(p, foot)) best.lines.push(p); });
    });
    cols.sort(function (a, b) { return a.a.x - b.a.x; });
    return cols;
  }
  function subtitleOf(s, foot) {
    var out = '';
    s.els.some(function (e) {
      if (LABEL.test(e.paras[0]) && e.paras.length > 1) { out = e.paras.slice(1).join(' / '); return true; }
      return false;
    });
    return out;
  }
  function headOf(s) {
    var t = s.els.filter(function (e) { return e.tbl; })[0];
    return t ? t.paras.join(' ') : '';
  }
  function labelOf(s) {
    var l = '';
    s.els.some(function (e) { if (LABEL.test(e.paras[0])) { l = e.paras[0].toUpperCase(); return true; } return false; });
    return l;
  }
  function circleNo(t) {
    var m = /^\s*([①-⑮])/.exec(t);
    if (m) return CIRCLE.indexOf(m[1]) + 1;
    m = /^\s*(\d{1,2})[.)]\s/.exec(t);
    return m ? +m[1] : 0;
  }
  function cleanIngName(n) {
    n = one(String(n || '').replace(/^[①-⑮]\s*/, '').replace(/메커니즘|원리|소개$/g, ''));
    return n;
  }
  function splitKoEn(n) {
    var m = /^([A-Za-z][a-z]+(?:\s[A-Za-z][a-z]+)*)\s+([가-힣].*)$/.exec(n);
    if (m) return { ko: m[2], en: m[1] };
    m = /^(.*[가-힣].*?)\s+([A-Z][a-z]+(?:\s[A-Za-z][a-z]+)*)$/.exec(n);
    if (m) return { ko: m[1], en: m[2] };
    return { ko: n, en: '' };
  }
  function displayName(n) {
    return one(n.replace(/바르는\s*보톡스|보톡스/g, '').replace(/\s{2,}/g, ' ')) || n;
  }
  function slideType(s, i, foot) {
    var all = s.els.map(function (e) { return e.paras.join(' '); }).join(' \n');
    var head = headOf(s), lab = labelOf(s);
    if (/^\s*(목차|INDEX|CONTENTS)/im.test(all) && all.length < 260) return 'toc';
    if (/THANK\s*YOU|감사합니다/i.test(all) && all.length < 120) return 'end';
    if (/HOW\s*TO\s*USE/.test(lab) || /사용\s*(단계|방법|법)/.test(head) || /STEP\s*0?1/i.test(all) && /STEP\s*0?2/i.test(all)) return 'usage';
    if (/SELLING/.test(lab) || /판매\s*포인트|셀링\s*포인트/.test(head)) return 'selling';
    if (/(주요\s*)?성분\s*[①-⑮\d]+\s*[—–\-:]/.test(head)) return 'ingDetail';
    if (s.els.filter(function (e) { return circleNo(e.paras[0]) && !e.tbl; }).length >= 2) return 'ingOverview';
    if (/INGREDIENT/.test(lab)) return 'ingSummary';
    if (/(이란|란)\s*\?/.test(all) || /정의|CONCEPT|콘셉트|컨셉/i.test(head + lab)) return 'concept';
    return i === 0 ? 'cover' : 'etc';
  }

  function analyzeDeck(deck, info) {
    info = info || {};
    var fn = info.func || '';
    var slides = deck.slides || [], foot = footers(slides), log = [];
    var E = {
      line: '', product: '', enName: '', tagline: '', taglines: [], concept: null, texture: '',
      points: [], ings: [], steps: [], stepLead: '', evidence: [], changes: log, warns: [], slideTypes: []
    };
    Object.keys(foot).forEach(function (k) { if (/^[A-Za-z][A-Za-z0-9\s.\-&]+$/.test(k) && k.split(' ').length >= 2 && !E.enName) E.enName = k; });
    var byNo = {}, later = [];
    function ingAt(no, name) {
      var key = no ? 'n' + no : 'k' + nz(name);
      if (!byNo[key]) { byNo[key] = { no: no || 0, name: '', en: '', head: '', body: [], keys: [], tags: [], evid: [], src: [] }; E.ings.push(byNo[key]); }
      return byNo[key];
    }
    function evid(t, where) {
      if (/\d+(\.\d+)?\s*%|\d+\s*(배|시간|주)/.test(t)) E.evidence.push({ t: t, where: where });
    }
    slides.forEach(function (s, si) {
      var type = slideType(s, si, foot), where = (s.no || si + 1) + '쪽';
      E.slideTypes.push(type);
      var lines = [];
      s.els.forEach(function (e) { e.paras.forEach(function (p) { if (!noiseLine(p, foot)) lines.push(p); }); });
      lines.forEach(function (l) { evid(l, where); });
      var head = headOf(s), sub = subtitleOf(s, foot);
      if (type === 'cover') {
        lines.forEach(function (l) {
          var t = one(l.replace(/^\|\s*/, ''));
          if (/\bLINE$/i.test(t) && !E.line) E.line = t.toUpperCase();
          if (/[가-힣]/.test(t) && E.enName && E.enName.split(' ').some(function (w) { return w.length >= 3 && t.indexOf(w) >= 0; }) && !E.product) E.product = t;
        });
        if (!E.product) {
          var lk = lines.filter(function (l) { return /라인$/.test(l); })[0];
          var near = lines.filter(function (l) { return /[가-힣]/.test(l) && l.length <= 20 && l !== lk; });
          if (near.length) E.product = near[near.length - 1];
        }
      }
      if (head && !/—|–/.test(head) && head.length > 14 && type !== 'usage' && type !== 'selling' && type !== 'toc') E.taglines.push(head);
      if (type === 'concept') {
        var title = lines.filter(function (l) { return /(이란|란)\s*\?$/.test(l); })[0] || '';
        var word = title.replace(/(이란|란)\s*\?$/, '').trim();
        var def = lines.filter(function (l) { return /뜻|의미|유래/.test(l) && l.length > 12; })[0] || '';
        var en = '';
        lines.some(function (l) { var m = /^([A-Za-z]{3,})\s*\(([가-힣]+)\)/.exec(l); if (m) { en = m[1]; return true; } return false; });
        var shorts = lines.filter(function (l) { return l.length >= 5 && l.length <= 14 && l !== title && !/[:(]/.test(l); });
        var tag = shorts.filter(function (l) { return /위한|의\s/.test(l); }).pop() || shorts.sort(function (a, b) { return b.length - a.length; })[0] || '';
        E.concept = {
          word: word, en: en, title: title,
          body: safe(def, fn, log, where),
          tag: safe(tag, fn, log, where)
        };
      }
      if (type === 'ingOverview') {
        s.els.forEach(function (e) {
          var no = circleNo(e.paras[0]);
          if (!no || e.tbl) return;
          var it = ingAt(no);
          if (!it.name) it.name = cleanIngName(e.paras[0]);
          it.src.push(where);
          e.paras.slice(1).forEach(function (p) {
            var m = /^(.{2,30}?)\s*:\s*(.+)$/.exec(p);
            if (m) { it.keys.push({ k: m[1], t: m[2], w: where, ov: 1 }); return; }
            it.body.push({ t: p, w: where, ov: 1 });
          });
        });
        if (sub) E.taglines.push(sub.replace(/^\[[^\]]*\]\s*/, ''));
      }
      if (type === 'ingDetail') {
        var hm = /([①-⑮]|\d+)\s*[—–\-:]\s*(.+)$/.exec(head) || [];
        var no = hm[1] ? (CIRCLE.indexOf(hm[1]) + 1 || +hm[1]) : 0;
        var it = ingAt(no, hm[2]);
        var full = cleanIngName(hm[2] || '');
        if (full && (!it.name || /[A-Za-z]/.test(full) || full.length >= it.name.length)) it.name = full;
        it.src.push(where);
        if (sub) it.head = sub;
        var body = [];
        s.els.forEach(function (e) {
          if (e.tbl || LABEL.test(e.paras[0])) return;
          e.paras.forEach(function (p) { if (!noiseLine(p, foot)) body.push(p); });
        });
        (s.els.some(function (e) { return e.flat; }) ? joinWrap(body) : body).forEach(function (p) {
          var m = /^(.{2,24}?)\s+[—–]\s+(.+)$/.exec(p);
          if (m) it.keys.push({ k: m[1], t: m[2], w: where });
          else it.body.push({ t: p, w: where });
        });
      }
      if (type === 'ingSummary') later.push(function () {
        columns(s, foot).forEach(function (c) {
          var t = nz(c.title), hit = null;
          E.ings.forEach(function (it) { if (!hit && (nz(it.name).indexOf(t) >= 0 || t.indexOf(nz(it.name)) >= 0 || sharesWord(it.name, c.title))) hit = it; });
          if (!hit) hit = ingAt(0, c.title), hit.name = hit.name || cleanIngName(c.title);
          c.lines.forEach(function (l) { hit.tags.push(l); });
        });
      });
      if (type === 'selling') {
        var cols = columns(s, foot);
        cols.forEach(function (c) { E.points.push({ title: c.title, lines: c.lines, w: where }); });
        if (!cols.length) {
          lines.forEach(function (l) { if (l.length <= 40) E.points.push({ title: l, lines: [], w: where }); });
        }
      }
      if (type === 'usage') {
        if (sub && !E.stepLead) E.stepLead = sub;
        var steps = [];
        s.els.forEach(function (e) {
          var cur = null;
          e.paras.forEach(function (p) {
            var m = /^STEP\s*0?(\d+)\s*[.:)]?\s*(.*)$/i.exec(p);
            if (m) { cur = { n: +m[1], x: e.x, lines: m[2] ? [m[2]] : [] }; steps.push(cur); return; }
            if (cur && !noiseLine(p, foot)) cur.lines.push(p);
          });
        });
        if (!steps.length) {
          lines.forEach(function (l) {
            var m = /^(?:\d+[.)]|[①-⑮])\s*(.+)$/.exec(l);
            if (m) steps.push({ n: steps.length + 1, lines: [m[1]] });
          });
        }
        steps.sort(function (a, b) { return a.n - b.n; });
        steps.forEach(function (st) {
          var t = one(st.lines.join(' '));
          if (t) E.steps.push(t);
        });
      }
      if (!E.texture) {
        lines.some(function (l) {
          var m = /([가-힣]+(?:\s[가-힣]+){0,3}\s*(발림성|제형|텍스처|사용감))/.exec(l);
          if (m) { E.texture = one(m[1]); return true; }
          return false;
        });
      }
    });
    later.forEach(function (f) { f(); });
    /* 대표성분 문안 */
    E.ings.sort(function (a, b) { return (a.no || 99) - (b.no || 99); });
    E.ings.forEach(function (it, i) {
      var nm = splitKoEn(displayName(it.name));
      it.ko = displayName(nm.ko);
      it.en = it.en || nm.en;
      var head = it.head ? it.head.split(/\s*[:/]\s*/)[0] : '';
      it.headOut = safe(head, fn, log, it.src[0]);
      if (!it.headOut || it.headOut.length > 30) {
        var k0 = it.keys.filter(function (k) { return !k.ov; }).map(function (k) { return safe(k.t, fn, log, k.w); }).filter(function (x) { return x && x.length <= 26; })[0];
        var t0 = it.tags.map(function (t) { return safe(t, fn, log, it.src[0]); }).filter(function (x) { return x && x.length <= 26; })[0];
        it.headOut = k0 || t0 || it.headOut;
      }
      var sents = [];
      it.body.filter(function (b) { return !b.ov; }).concat(it.body.filter(function (b) { return b.ov; })).forEach(function (b) {
        if (sents.length >= 2) return;
        var t = safe(b.t, fn, log, b.w);
        if (t && t.length >= 10 && !/^\d/.test(t) && sents.indexOf(t) < 0) sents.push(/[.다]$/.test(t) ? t : t + '.');
      });
      if (!sents.length) {
        var tg = it.tags.map(function (t) { return safe(t, fn, log, it.src[0]); }).filter(Boolean).slice(0, 3);
        if (tg.length) sents.push(tg.join(', ') + '.');
        it.fromTags = !!tg.length;
      }
      it.bodyOut = sents.join(' ');
      it.keysOut = it.keys.map(function (k) {
        var a = safe(k.k, fn, log, k.w), b = safe(String(k.t).split(/(?<=다\.)\s/)[0], fn, log, k.w);
        return a && b ? a + ' — ' + b : '';
      }).filter(Boolean).slice(0, 3);
      if (!it.headOut) it.headOut = it.keysOut[0] ? it.keysOut[0].split(' — ')[0] : '';
    });
    /* 판매 포인트 */
    E.points = E.points.map(function (p) {
      return {
        title: safe(p.title, fn, log, p.w) || p.title,
        lines: p.lines.map(function (l) { return safe(l, fn, log, p.w); }).filter(Boolean).slice(0, 4),
        w: p.w
      };
    }).filter(function (p) { return p.title; }).slice(0, 3);
    E.tagline = '';
    E.taglines.some(function (t) { var x = safe(t, fn, log, ''); if (x && x.length >= 8) { E.tagline = x; return true; } return false; });
    E.texture = safe(E.texture, fn, log, '');
    E.stepLead = safe(E.stepLead, fn, log, '');
    E.steps = E.steps.map(function (t) { return safe(t, fn, log, '사용 단계'); }).filter(Boolean);
    /* 중복 기록 정리 */
    var seen = {};
    E.changes = log.filter(function (l) { var k = l.from + '|' + l.to; if (seen[k]) return false; seen[k] = 1; return l.from && l.from !== l.to; });
    E.warns = [];
    [E.tagline, E.concept && E.concept.tag, E.concept && E.concept.body].concat(E.points.map(function (p) { return p.title + ' ' + p.lines.join(' '); }))
      .concat(E.ings.map(function (i) { return i.headOut + ' ' + i.bodyOut; })).forEach(function (t) {
        warnsOf(t || '').forEach(function (w) { if (E.warns.indexOf(w) < 0) E.warns.push(w); });
      });
    return E;
  }
  function sharesWord(a, b) {
    var wa = String(a).split(/[\s()]+/).filter(function (w) { return w.length >= 3; });
    return wa.some(function (w) { return String(b).indexOf(w) >= 0; });
  }

  /* =========================================================
     5. 전성분 대조
     ========================================================= */
  var ALIAS = [
    [/PDRN|DNA|디엔에이/i, ['디엔에이', 'dna', '폴리데옥시리보뉴클레오타이드', 'pdrn']],
    [/연어/, ['연어', '소듐디엔에이']],
    [/병풀|센텔라|시카/, ['병풀', '센텔라', '마데카', '아시아티코사이드']],
    [/트러플|송로/, ['송로', '튜버', '트러플']],
    [/흰목이/, ['흰목이', '트레멜라']],
    [/에르고티오네인|ergothioneine/i, ['에르고티오네인']],
    [/펩타이드|peptide/i, ['펩타이드', 'peptide']],
    [/SP1|NPToc|PEP-1/i, ['sp1', 'nptoc', 'pep1', '에스피원']],
    [/콜라겐/, ['콜라겐']],
    [/로얄젤리|로열젤리/, ['로열젤리', '로얄젤리']],
    [/꿀|허니|honey/i, ['꿀', '허니', '벌꿀']],
    [/히알루론|하이알루론/, ['하이알루론', '히알루론']],
    [/세라마이드/, ['세라마이드']],
    [/나이아신/, ['나이아신아마이드']],
    [/아데노신/, ['아데노신']]
  ];
  var STOP = /^(추출물|유래|저분자|리포좀|시그니처|스마트|바르는|보톡스|성분|효과|원료|식물|동물성|발효|유산균|화이트|블랙|바람꽃)$/;
  function inciItems(inci) {
    if (G.GEN && G.GEN.analyze) {
      try { return G.GEN.analyze(inci).items.map(function (i) { return i.raw || i.k; }); } catch (e) { /* 아래로 */ }
    }
    return String(inci || '').replace(/^\s*\[?전성분\]?\s*[:：]?/, '').split(/,(?![^(]*\))|\n/).map(one).filter(Boolean);
  }
  function matchInci(E, inci) {
    var items = inciItems(inci), nItems = items.map(nz);
    E.inciCount = items.length;
    E.ings.forEach(function (it) {
      var name = it.name + ' ' + (it.en || '');
      var keys = [];
      ALIAS.forEach(function (a) { if (a[0].test(name)) keys = keys.concat(a[1]); });
      name.split(/[\s(),·\/]+/).forEach(function (w) {
        w = w.replace(/추출물$/, '');
        if (/[가-힣]/.test(w) && w.length >= 2 && !STOP.test(w)) keys.push(nz(w));
      });
      var hits = [];
      nItems.forEach(function (n, i) { if (keys.some(function (k) { return k && n.indexOf(nz(k)) >= 0; })) hits.push(i); });
      it.inci = hits.map(function (i) { return { idx: i + 1, raw: items[i] }; });
    });
    /* 문안에 쓸 대표성분 3개: 전성분에 있는 성분 우선, 교육자료 순서 */
    if (!E.picked) {
      var withHit = E.ings.filter(function (i) { return i.inci && i.inci.length; });
      var pool = items.length ? withHit.concat(E.ings.filter(function (i) { return withHit.indexOf(i) < 0; })) : E.ings.slice();
      pool.slice(0, 3).forEach(function (i) { i.use = true; });
    }
    return E;
  }

  /* =========================================================
     6. 문안 생성 감싸기 — 교육자료 포인트 반영 + 빈 박스 채우기
     ========================================================= */
  function josa(w, pair) {
    if (G.GEN && G.GEN.josa) return G.GEN.josa(w, pair);
    var c = String(w || '').slice(-1).charCodeAt(0), j = c >= 0xac00 && c <= 0xd7a3 ? (c - 0xac00) % 28 : 0, ab = pair.split('/');
    if (pair === '으로/로') return w + (j === 0 || j === 8 ? '로' : '으로');
    return w + (j ? ab[0] : ab[1]);
  }
  var pad2 = function (n) { return (n < 10 ? '0' : '') + n; };
  function L(r, t, extra) { return Object.assign({ r: r, t: t == null ? '' : String(t) }, extra || {}); }
  function used(E) { return (E.ings || []).filter(function (i) { return i.use; }); }
  function ingTitle(i) { return i.ko || i.name; }

  function eduSections(E, ctx, input, brand) {
    var title = ctx.title || input.name || E.product || '';
    var ings = used(E), pts = E.points || [];
    var S = {};
    S.intro = function (orig) {
      if (!orig) return null;
      var lines = orig.lines.map(function (l) { return Object.assign({}, l); });
      lines.forEach(function (l) {
        if (l.r === 'eyebrow' && !str(input.line) && E.line) l.t = E.line;
        if (l.r === 'headline' && E.tagline) { l.t = E.tagline; l.edu = 1; }
        if (l.r === 'keypoint' && pts.length) { l.t = pts.map(function (p) { return p.title; }).join('  |  '); l.edu = 1; }
      });
      if (E.tagline && !lines.some(function (l) { return l.r === 'headline'; })) lines.push(L('headline', E.tagline, { edu: 1 }));
      return lines;
    };
    if (E.concept && (E.concept.body || E.concept.tag)) {
      S.method = function () {
        var c = E.concept;
        return [
          L('eyebrow', 'What is ' + (c.en || (E.enName || '').split(' ').pop() || '') + '?'),
          L('headline', c.title || (c.word ? josa(c.word, '이란/란') + '?' : '')),
          c.body ? L('body', c.body, { edu: 1 }) : null,
          c.tag ? L('keypoint', c.tag, { edu: 1 }) : null
        ];
      };
    }
    if (pts.length) {
      S.feature = function (i) {
        var p = pts[i];
        if (!p) return null;
        return [L('h3', p.title, { edu: 1 })].concat(p.lines.slice(0, 3).map(function (t) { return L('body', t, { edu: 1 }); }));
      };
    }
    if (E.texture) {
      S.texture = function (orig) {
        var kp = orig && orig.lines.filter(function (l) { return l.r === 'keypoint'; })[0];
        return [L('eyebrow', 'TEXTURE'), L('headline', E.texture, { edu: 1 }), kp ? Object.assign({}, kp) : null];
      };
    }
    if (ings.length) {
      S.ing = function (i) {
        var it = ings[i];
        if (!it) return null;
        var long = it.headOut && it.headOut.length > 20;
        var h = it.headOut && !long ? it.headOut + ', ' + ingTitle(it) : ingTitle(it);
        return [L('h3', h, { edu: 1 }), long ? L('meta', it.headOut, { edu: 1 }) : null, it.bodyOut ? L('body', it.bodyOut, { edu: 1 }) : null]
          .concat((it.keysOut || []).slice(0, 2).map(function (k) { return L('keypoint', k, { edu: 1 }); }));
      };
      S.point = function (i) {
        var it = ings[i];
        if (!it) return null;
        return [L('eyebrow', 'POINT ' + pad2(i + 1)), L('headline', it.headOut || ingTitle(it), { edu: 1 }),
          L('h3', it.en ? ingTitle(it) + ' (' + it.en + ')' : ingTitle(it)), it.bodyOut ? L('body', it.bodyOut, { edu: 1 }) : null];
      };
      S.step = function (i) {
        var it = ings[i];
        if (!it) return null;
        return [L('eyebrow', 'STEP ' + pad2(i + 1)), L('h3', ingTitle(it), { edu: 1 }), it.headOut ? L('body', it.headOut, { edu: 1 }) : null];
      };
      S.summary = function (orig) {
        var names = ings.map(ingTitle).join(', ');
        var tail = pts.length ? pts.map(function (p) { return p.title; }).join(' · ') + '까지 한 번에 채워 주는 ' : '';
        var body = josa(names, '을/를') + ' 담아, ' + tail + title + '입니다.';
        var lead = orig && orig.lines.filter(function (l) { return l.r === 'h3'; })[0];
        return [lead ? Object.assign({}, lead) : L('h3', brand && brand.summaryLead || ''), L('headline', title, { name: 1 }), L('body', body, { edu: 1 })];
      };
    }
    if (E.steps && E.steps.length && !str(input.usage)) {
      S.howto = function () {
        var out = [L('eyebrow', 'HOW TO USE'), L('headline', 'How To Use')];
        if (E.stepLead) out.push(L('meta', E.stepLead, { edu: 1 }));
        E.steps.forEach(function (s, i) { out.push(L('body', 'STEP ' + pad2(i + 1) + '. ' + s, { edu: 1 })); });
        return out;
      };
    }
    return S;
  }

  var GENERIC = {
    feature: [['촉촉한 보습 케어', '피부에 수분감을 채워 촉촉하게 가꾸어 줍니다.'], ['매끄러운 피부결', '피부결을 매끄럽고 부드럽게 정돈해 줍니다.'], ['가벼운 데일리 케어', '매일 부담 없이 사용하기 좋은 가벼운 사용감입니다.']],
    rec: [['피부가 쉽게 건조해지는 분', '촉촉한 보습감이 필요한 분께 추천드려요.'], ['피부결이 거칠게 느껴지는 분', '매끄러운 피부결을 원하는 분께 추천드려요.'], ['간편한 데일리 케어를 원하는 분', '가벼운 사용감의 데일리 케어를 찾는 분께 추천드려요.']]
  };
  function fallback(type, i, ctx, input, brand) {
    var mains = (ctx && ctx.mains) || [];
    var title = (ctx && ctx.title) || input.name || '';
    var PH = function (t) { return [L('note', '[' + t + ' 입력 필요] 입력칸 · 교육자료를 채운 뒤 다시 생성하거나, 이 박스를 직접 수정해 주세요.', { ph: 1 })]; };
    switch (type) {
      case 'intro': return [L('eyebrow', (brand && brand.lineDefault) || ''), L('title', title, { name: 1 }), ctx && ctx.nameEn ? L('en', ctx.nameEn) : null, ctx && ctx.volume ? L('meta', ctx.volume) : null];
      case 'feature': return [L('h3', GENERIC.feature[i % 3][0]), L('body', GENERIC.feature[i % 3][1])];
      case 'rec': return [L('h3', GENERIC.rec[i % 3][0]), L('body', GENERIC.rec[i % 3][1])];
      case 'recHeader': return [L('headline', '이런 분들께 추천드려요')];
      case 'ingHeader': return [L('headline', title + '에 담긴 대표성분')];
      case 'ingNote': return [L('note', '*상기의 설명은 원료적 특성에 한함')];
      case 'diffHeader': return [L('eyebrow', 'POINT'), L('headline', title + ', 이렇게 다릅니다')];
      case 'ing':
      case 'point':
      case 'step': {
        var m = mains[i];
        if (!m) return PH('대표성분 ' + (i + 1));
        var lk = G.GEN && G.GEN.lookup ? G.GEN.lookup(m) : null;
        var d = (lk && lk.d) || '피부를 촉촉하고 편안하게 가꾸어 줍니다.';
        if (type === 'step') return [L('eyebrow', 'STEP ' + pad2(i + 1)), L('h3', m), L('body', d)];
        if (type === 'point') return [L('eyebrow', 'POINT ' + pad2(i + 1)), L('headline', (lk && lk.h) || m), L('body', d)];
        return [L('h3', ((lk && lk.h) ? lk.h + ', ' : '') + m), L('body', d)];
      }
      case 'texture': return [L('eyebrow', 'TEXTURE'), L('headline', ((ctx && ctx.type) || '제품') + ' 텍스처')];
      case 'method': return [L('headline', ((ctx && ctx.type) || title) + ' 소개'), L('body', '[제품 방식 설명 입력 필요]', { ph: 1 })];
      case 'summary': return [L('h3', (brand && brand.summaryLead) || ''), L('headline', title, { name: 1 })];
      default: return PH((G.GEN && G.GEN.LABELS && G.GEN.LABELS[type]) || type);
    }
  }
  function findArgs(args) {
    var a = { brandId: '', input: null, layout: null };
    Array.prototype.forEach.call(args, function (x) {
      if (typeof x === 'string' && !a.brandId) a.brandId = x;
      else if (x && typeof x === 'object' && Array.isArray(x.blocks) && !a.layout) a.layout = x;
      else if (x && typeof x === 'object' && !a.input && ('inci' in x || 'name' in x)) a.input = x;
    });
    return a;
  }
  function wrapGenerate() {
    var GEN = G.GEN;
    if (!GEN || typeof GEN.generate !== 'function' || GEN.generate.__v12) return false;
    var orig = GEN.generate;
    var wrapped = function () {
      var res = orig.apply(this, arguments);
      try { return post(res, findArgs(arguments)); } catch (e) {
        if (G.console) console.warn('[v12] 문안 보정 실패 — 기존 문안을 그대로 씁니다', e);
        return res;
      }
    };
    wrapped.__v12 = true;
    wrapped.__orig = orig;
    GEN.generate = wrapped;
    return true;
  }
  function post(res, A) {
    if (!res || !Array.isArray(res.blocks) || !A.layout) return res;
    var input = A.input || {}, ctx = res.ctx || {};
    var brand = G.CONFIG && G.CONFIG.brands && G.CONFIG.brands[A.brandId];
    var E = V12.state && V12.state.on !== false ? V12.state : null;
    if (E && sameProduct(E, input.name) === false) {
      if (G.console) console.warn('[v12] 교육자료 제품(' + E.product + ')과 입력 제품명(' + input.name + ')이 달라 교육자료를 반영하지 않았습니다');
      E = null;
    }
    var S = E ? eduSections(E, ctx, input, brand) : {};
    var have = {};
    res.blocks.forEach(function (b) { have[b.id] = b; });
    var LABELS = (G.GEN && G.GEN.LABELS) || {};
    var out = [], filled = [], edu = 0;
    A.layout.blocks.forEach(function (b) {
      var cur = have[b.id], lines = null, src = 'orig';
      var f = S[b.type];
      if (f) {
        lines = f.length === 1 && (b.type === 'intro' || b.type === 'texture' || b.type === 'summary') ? f(cur) : f(b.i || 0, cur);
        if (lines) { lines = lines.filter(Boolean).filter(function (l) { return str(l.t) !== ''; }); src = 'edu'; }
        if (lines && !lines.length) lines = null;
      }
      if (!lines && cur) { out.push(cur); return; }
      if (!lines && OPT.fillEmpty) {
        lines = (fallback(b.type, b.i || 0, ctx, input, brand) || []).filter(Boolean).filter(function (l) { return str(l.t) !== ''; });
        src = 'fill';
      }
      if (!lines || !lines.length) return;
      if (src === 'edu') edu++;
      if (src === 'fill') filled.push(b.id);
      var base = cur || {
        id: b.id, type: b.type,
        label: (LABELS[b.type] || b.type) + (b.i != null ? ' ' + (b.i + 1) : ''),
        x: b.x, y: b.y, w: b.w, align: b.type === 'info' ? 'left' : (b.align || 'center')
      };
      out.push(Object.assign({}, base, { lines: lines, ph: lines.length === 1 && lines[0].ph ? 1 : 0, v12: src }));
    });
    /* 레이아웃 밖에서 추가된 블록(다른 모듈)도 유지 */
    res.blocks.forEach(function (b) { if (!out.some(function (o) { return o.id === b.id; })) out.push(b); });
    res.blocks = out;
    if (E) {
      ctx.protect = (ctx.protect || []).concat(used(E).map(ingTitle));
      ctx.edu = { file: E.file, blocks: edu };
    }
    ctx.filled = filled;
    res.ctx = ctx;
    if (G.console) console.info('[v12] 교육자료 반영 ' + edu + '개 박스 · 빈 박스 채움 ' + filled.length + '개' + (filled.length ? ' (' + filled.join(', ') + ')' : ''));
    return res;
  }

  /* =========================================================
     7. 입력 화면 — [교육자료 업로드] 패널
     ========================================================= */
  /* 교육자료 제품명과 입력 제품명 비교 (모르면 null) */
  function sameProduct(E, name) {
    var a = nz(E && E.product), b = nz(name);
    if (!a || !b) return null;
    var k = Math.min(6, a.length, b.length);
    return a.indexOf(b.slice(0, k)) >= 0 || b.indexOf(a.slice(0, k)) >= 0;
  }
  function fieldVal(id) { var el = doc && doc.getElementById(id); return el ? str(el.value) : ''; }
  function setField(id, v, force) {
    var el = doc.getElementById(id);
    if (!el || !v || (str(el.value) && !force)) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function infoNow() {
    return { name: fieldVal('fName'), en: fieldVal('fEn'), vol: fieldVal('fVol'), inci: fieldVal('fInci'), func: fieldVal('fFunc'), usage: fieldVal('fUsage') };
  }
  function save() {
    try { if (V12.state) G.localStorage.setItem(OPT.storeKey, JSON.stringify(V12.state)); else G.localStorage.removeItem(OPT.storeKey); } catch (e) { /* 저장 공간 없음 */ }
  }
  function restore() {
    try { var s = G.localStorage.getItem(OPT.storeKey); if (s) V12.state = JSON.parse(s); } catch (e) { V12.state = null; }
  }
  var CSS = '' +
    '.v12-wrap{margin:10px 0 4px}' +
    '.v12-drop{display:block;border:1.5px dashed #c7cdd6;border-radius:8px;padding:14px 16px;cursor:pointer;background:#fafbfc;text-align:center}' +
    '.v12-drop b{display:block;font-size:14px;margin-bottom:4px}' +
    '.v12-drop span{font-size:12px;color:#6b7280;line-height:1.5}' +
    '.v12-drop:hover,.v12-drop.v12-over{border-color:#2563eb;background:#f5f8ff}' +
    '.v12-res{margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-size:13px;background:#fff}' +
    '.v12-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px}' +
    '.v12-head small{color:#6b7280}' +
    '.v12-sec{margin:10px 0 4px;font-weight:700;font-size:13px}' +
    '.v12-res table{width:100%;border-collapse:collapse}' +
    '.v12-res td{padding:4px 6px;border-top:1px solid #f1f5f9;vertical-align:top}' +
    '.v12-res td.k{width:120px;color:#6b7280;white-space:nowrap}' +
    '.v12-res input[type=text],.v12-res textarea{width:100%;box-sizing:border-box;border:1px solid #e5e7eb;border-radius:4px;padding:4px 6px;font:inherit;font-size:13px;background:#fff}' +
    '.v12-res textarea{min-height:46px;resize:vertical}' +
    '.v12-b{display:inline-block;padding:1px 6px;border-radius:4px;font-size:12px;background:#f3f4f6;color:#374151;margin:1px 2px 1px 0}' +
    '.v12-b.ok{background:#dcfce7;color:#166534}.v12-b.warn{background:#fef3c7;color:#92400e}.v12-b.no{background:#fee2e2;color:#991b1b}' +
    '.v12-x{font-size:12px;border:1px solid #d1d5db;background:#fff;border-radius:4px;padding:2px 8px;cursor:pointer;margin-left:4px}' +
    '.v12-x.pri{background:#2563eb;border-color:#2563eb;color:#fff}' +
    '.v12-list{margin:4px 0 0;padding-left:18px;color:#374151;line-height:1.6}' +
    '.v12-list s{color:#9ca3af}' +
    '.v12-err{color:#b91c1c;line-height:1.6}' +
    '.v12-ing{border:1px solid #eef0f3;border-radius:6px;padding:6px 8px;margin:6px 0}';
  function inp(path, v, area) {
    v = Array.isArray(v) ? v.join('\n') : (v || '');
    return area ? '<textarea data-p="' + path + '"' + (area === 'arr' ? ' data-arr="1"' : '') + '>' + esc(v) + '</textarea>'
      : '<input type="text" data-p="' + path + '" value="' + esc(v) + '">';
  }
  function row(k, html) { return '<tr><td class="k">' + esc(k) + '</td><td>' + html + '</td></tr>'; }
  function render(res) {
    var E = V12.state;
    if (!E) { res.hidden = true; res.innerHTML = ''; return; }
    res.hidden = false;
    var info = infoNow();
    var nameMismatch = sameProduct(E, info.name) === false;
    var h = '<div class="v12-head"><b>교육자료에서 잡은 제품 포인트 · ' + esc(E.file || '') + '</b><small>' +
      '<label><input type="checkbox" data-p="on"' + (E.on !== false ? ' checked' : '') + '> 문안 생성에 반영</label>' +
      '<button type="button" class="v12-x" data-act="rematch">전성분 다시 대조</button>' +
      '<button type="button" class="v12-x" data-act="clear">지우기</button></small></div>';
    /* 기본정보 점검 */
    var chk = [];
    chk.push(info.name ? '<span class="v12-b ok">제품명 ' + esc(info.name) + '</span>' : '<span class="v12-b warn">제품명 비어 있음</span>');
    chk.push(info.vol ? '<span class="v12-b ok">용량 ' + esc(info.vol) + '</span>' : '<span class="v12-b warn">용량 비어 있음</span>');
    chk.push(E.inciCount ? '<span class="v12-b ok">전성분 ' + E.inciCount + '개</span>' : '<span class="v12-b warn">전성분 비어 있음 — 대표성분 대조 불가</span>');
    chk.push('<span class="v12-b">기능성 ' + esc(info.func || '해당 없음') + '</span>');
    if (nameMismatch) chk.push('<span class="v12-b no">교육자료 제품명(' + esc(E.product) + ')과 입력 제품명이 달라 문안에 반영하지 않습니다 — 다른 제품이면 [지우기] 후 새 교육자료를 올려 주세요</span>');
    h += '<div>' + chk.join('') + '</div>';
    h += '<div class="v12-sec">제품 콘셉트</div><table>' +
      row('라인명', inp('line', E.line)) +
      row('한 줄 소개', inp('tagline', E.tagline)) +
      (E.concept ? row('콘셉트 제목', inp('concept.title', E.concept.title)) + row('콘셉트 설명', inp('concept.body', E.concept.body, 1)) + row('콘셉트 키워드', inp('concept.tag', E.concept.tag)) : '') +
      row('텍스처', inp('texture', E.texture)) + '</table>';
    h += '<div class="v12-sec">판매 포인트 → 핵심 특징 1~3</div><table>';
    (E.points.length ? E.points : [{ title: '', lines: [] }]).forEach(function (p, i) {
      h += row('포인트 ' + (i + 1), inp('points.' + i + '.title', p.title) + inp('points.' + i + '.lines', p.lines, 'arr'));
    });
    h += '</table><div class="v12-sec">대표성분 (체크한 순서대로 대표성분 1~3에 들어갑니다)</div>';
    E.ings.forEach(function (it, i) {
      var badge = !E.inciCount ? '<span class="v12-b">전성분 입력 후 대조</span>'
        : (it.inci && it.inci.length ? '<span class="v12-b ok">전성분 ' + it.inci.slice(0, 3).map(function (x) { return x.idx + '번 ' + esc(x.raw); }).join(' · ') + (it.inci.length > 3 ? ' 외 ' + (it.inci.length - 3) + '개' : '') + '</span>'
          : '<span class="v12-b no">전성분에서 못 찾음 — 표기명 확인</span>');
      h += '<div class="v12-ing"><label><input type="checkbox" data-p="ings.' + i + '.use"' + (it.use ? ' checked' : '') + '> <b>' + esc(it.no ? CIRCLE[it.no - 1] + ' ' : '') + esc(it.name) + '</b></label> ' + badge +
        (it.fromTags ? ' <span class="v12-b warn">설명을 요약 키워드로 만듦 — 다듬어 주세요</span>' : '') +
        '<table>' + row('표기명', inp('ings.' + i + '.ko', it.ko)) + row('헤드라인', inp('ings.' + i + '.headOut', it.headOut)) +
        row('설명', inp('ings.' + i + '.bodyOut', it.bodyOut, 1)) + row('핵심 효과', inp('ings.' + i + '.keysOut', it.keysOut, 'arr')) + '</table></div>';
    });
    h += '<div class="v12-sec">사용 단계' + (info.usage ? ' <small style="font-weight:400;color:#92400e">(사용법 입력칸에 값이 있어 입력칸 내용을 우선 씁니다)</small>' : '') + '</div><table>' +
      row('안내 문구', inp('stepLead', E.stepLead)) + row('STEP', inp('steps', E.steps, 'arr')) + '</table>';
    if (E.evidence.length) {
      h += '<div class="v12-sec">수치 근거 (문안에 자동으로 넣지 않음 · 시험 자료 확인 후 사용)</div><ul class="v12-list">' +
        E.evidence.slice(0, 8).map(function (e) { return '<li>' + esc(e.t) + ' <small>(' + esc(e.where) + ')</small></li>'; }).join('') + '</ul>';
    }
    if (E.changes.length) {
      h += '<div class="v12-sec">바꾼 표현 ' + E.changes.length + '건 (교육자료 원문 → 문안)</div><ul class="v12-list">' +
        E.changes.slice(0, 30).map(function (c) {
          return '<li><s>' + esc(c.from) + '</s> → ' + (c.to ? esc(c.to) : '<b>뺌</b>') + ' <small>(' + esc(c.why) + (c.where ? ' · ' + esc(c.where) : '') + ')</small></li>';
        }).join('') + '</ul>';
    }
    if (E.warns.length) {
      h += '<div class="v12-sec">확인할 점</div><ul class="v12-list">' + E.warns.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul>';
    }
    h += '<p class="muted small" style="margin:8px 0 0">고친 내용은 바로 저장되며 [상세페이지 문안 생성] 때 반영됩니다. 교육자료 원문은 사내용 표현이 섞여 있으니, 생성 후 [표현 검수]도 꼭 확인해 주세요.</p>';
    res.innerHTML = h;
  }
  function setPath(o, path, v) {
    var ks = path.split('.'), cur = o;
    for (var i = 0; i < ks.length - 1; i++) {
      var k = ks[i], nk = ks[i + 1];
      if (cur[k] == null) cur[k] = /^\d+$/.test(nk) ? [] : {};
      cur = cur[k];
    }
    cur[ks[ks.length - 1]] = v;
  }
  async function readAny(file) {
    var n = (file.name || '').toLowerCase();
    if (/\.pptx$/.test(n)) return readPptx(file);
    if (/\.docx$/.test(n)) return readDocx(file);
    if (/\.pdf$/.test(n)) return readPdf(file);
    if (/\.(ppt|doc)$/.test(n)) throw new Error('예전 형식(.ppt · .doc)은 읽을 수 없습니다. PowerPoint/Word에서 [다른 이름으로 저장] → .pptx · .docx로 바꿔 올려 주세요.');
    if (/\.(txt|md)$/.test(n)) return textToSlides(await file.text());
    throw new Error('지원하지 않는 파일입니다. .pptx · .pdf · .docx를 올려 주세요.');
  }
  function setup() {
    wrapGenerate();
    /* v10/v11 [최종 단상자 디자인 업로드] 칸이 남아 있으면 숨김 */
    var old = doc.getElementById('v10Carton');
    if (old) old.remove();
    var drop = doc.getElementById('drop');
    if (!drop || doc.getElementById('v12Edu')) return;
    var style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.appendChild(style);
    var box = doc.createElement('div');
    box.id = 'v12Edu';
    box.className = 'v12-wrap';
    box.innerHTML = '<label class="v12-drop"><input type="file" accept=".pptx,.pdf,.docx,.txt" hidden>' +
      '<b>교육자료 업로드 (PPT · PDF · Word)</b>' +
      '<span>제품 교육자료를 올리면 콘셉트 · 판매 포인트 · 대표성분 · 사용 단계를 정리하고, 기본정보 · 전성분과 대조해 문안에 반영합니다<br>파일은 서버로 보내지 않고 이 브라우저 안에서만 읽습니다 · PPT(.pptx)가 가장 정확합니다</span></label>' +
      '<div class="v12-res" hidden></div>';
    drop.parentNode.insertBefore(box, drop.nextSibling);
    var lab = box.querySelector('label'), fi = box.querySelector('input[type=file]'), res = box.querySelector('.v12-res');
    restore();
    if (V12.state) render(res);
    async function run(file) {
      res.hidden = false;
      res.innerHTML = '<p class="muted small">교육자료를 읽는 중입니다…</p>';
      try {
        var deck = await readAny(file);
        var info = infoNow();
        var E = analyzeDeck(deck, info);
        E.file = file.name || '';
        E.on = true;
        if (!E.ings.length && !E.points.length && !E.concept && !E.steps.length) {
          res.innerHTML = '<p class="v12-err">교육자료에서 성분 · 판매 포인트 · 사용 단계를 찾지 못했습니다. 글자가 이미지로만 된 자료일 수 있습니다. PPT(.pptx) 원본을 올려 주세요.</p>';
          return;
        }
        matchInci(E, info.inci);
        V12.state = E;
        /* 기본정보가 비어 있으면 교육자료 값으로 채움 */
        setField('fName', E.product);
        setField('fEn', E.enName);
        if (!info.usage && E.steps.length) setField('fUsage', E.steps.join('\n'));
        save();
        render(res);
        note('교육자료에서 대표성분 ' + E.ings.length + '개 · 판매 포인트 ' + E.points.length + '개를 정리했습니다');
      } catch (e) {
        res.innerHTML = '<p class="v12-err">' + esc(e && e.message ? e.message : e) + '</p>';
      }
    }
    function onEdit(e) {
      var t = e.target, p = t && t.getAttribute && t.getAttribute('data-p');
      if (!p || !V12.state) return;
      var v = t.type === 'checkbox' ? t.checked : (t.getAttribute('data-arr') ? t.value.split('\n').map(one).filter(Boolean) : t.value);
      setPath(V12.state, p, v);
      if (/^ings\.\d+\.use$/.test(p)) V12.state.picked = true;
      save();
    }
    res.addEventListener('input', onEdit);
    res.addEventListener('change', function (e) { if (e.target && e.target.type === 'checkbox') onEdit(e); });
    res.addEventListener('click', function (e) {
      var t = e.target, act = t && t.getAttribute && t.getAttribute('data-act');
      if (!act || !V12.state) return;
      if (act === 'clear') { V12.state = null; save(); render(res); return; }
      if (act === 'rematch') { matchInci(V12.state, fieldVal('fInci')); save(); render(res); note('전성분과 다시 대조했습니다'); }
    });
    /* 전성분 · 제품명 · 기능성이 바뀌면 대조 결과 갱신 */
    ['fInci', 'fName', 'fVol', 'fFunc'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) el.addEventListener('change', function () { if (V12.state) { matchInci(V12.state, fieldVal('fInci')); save(); render(res); } });
    });
    fi.addEventListener('change', function () { if (fi.files && fi.files[0]) run(fi.files[0]); fi.value = ''; });
    ['dragenter', 'dragover'].forEach(function (ev) { lab.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); lab.classList.add('v12-over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { lab.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); lab.classList.remove('v12-over'); }); });
    lab.addEventListener('drop', function (e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) run(f); });
  }
  function note(msg) {
    if (G.console) console.info('[v12] ' + msg);
    var t = doc && doc.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(note._t);
    note._t = setTimeout(function () { t.classList.remove('show'); }, 3800);
  }

  V12.analyzeDeck = analyzeDeck;
  V12.matchInci = matchInci;
  V12.safe = safe;
  V12.wrap = wrapGenerate;
  V12._t = { parseXml: parseXml, slideElems: slideElems, textToSlides: textToSlides, post: post, eduSections: eduSections };
  wrapGenerate();
  if (doc) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', setup);
    else setup();
    G.addEventListener && G.addEventListener('load', wrapGenerate);
  }
})(typeof window !== 'undefined' ? window : globalThis);
