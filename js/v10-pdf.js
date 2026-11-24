/* =========================================================
   v10 — PDF 바로 읽기 개선 + 최종 단상자 디자인 자동 채우기
   index.html에서 v9-docs.js 바로 앞에 불러옵니다. (v9-docs.js는 한 줄만 고칩니다)

   [1] PDF를 OCR 없이 바로 읽기
     - pdf.js가 꺼낸 글자 조각을 실제 읽는 순서로 다시 정렬합니다.
       · 글자마다 쪼개진 디자인 PDF(일러스트·인디자인 · 자간 조정)도 한 줄로 이어 붙임
       · 가짜 굵게(같은 글자 두 번 찍기)로 생긴 중복 글자 제거 ("제제품품" → "제품")
       · 90°/180°/270° 회전된 글자(단상자 옆면 등)도 바로 읽음
       · 단 · 패널이 나뉜 문서는 덩어리(문단)별로 묶어 서로 섞이지 않게 함
     - "스캔본" 판정 기준을 바꿉니다.
       기존: 쪽당 40자 미만이면 OCR → 이미지가 많은 컨셉·성분 자료는 글자가 있어도 OCR로 넘어갔음
       변경: 직접 읽은 글자가 30자 이상이면 OCR 없이 바로 사용 · 글자가 없거나 깨진 PDF만 OCR
     - 이 개선은 v9의 [인체적용시험 보고서] · [제조사 추가 자료] 칸에 올리는 PDF 전체에 적용됩니다.

   [2] (v12부터 기본 꺼짐 · V10_OPTIONS.carton = true 일 때만) 최종 단상자 디자인(PDF · AI) → 입력칸 자동 채우기
     - 입력템플릿 업로드 칸 아래에 [최종 단상자 디자인 업로드] 칸을 추가합니다.
     - 제품명 · 영문명 · 용량 · 전성분 · 대표성분 함량 · 기능성 · 사용법 · 사용기한
       · 책임판매업자 · 상담 전화번호 · 추가 주의사항을 읽어 채웁니다.
     - 비어 있는 칸만 채우고, 이미 값이 있으면 [바꾸기] 버튼으로 고릅니다.
     - 글자를 윤곽선(아웃라인)으로 바꾼 인쇄용 파일은 v11-outline.js가 있으면 OCR + 전성분 비교로 읽습니다
       (v11이 없으면 안내 문구만 표시)

   옵션 (index.html에서 이 파일보다 먼저 선언하면 적용)
     window.V10_OPTIONS = { ocr: 'auto' }   // 'auto' = 글자 없을 때만 OCR · 'off' = OCR 사용 안 함
   ========================================================= */
(function (G) {
  'use strict';
  var doc = G.document;
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var OPT = G.V10_OPTIONS = Object.assign({ ocr: 'auto', minChars: 30, carton: false }, G.V10_OPTIONS || {});
  var V10 = G.V10 = G.V10 || {};

  var str = function (s) { return String(s == null ? '' : s).trim(); };
  var one = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  function note(msg, ms) {
    if (G.console) console.info('[v10] ' + msg);
    var t = doc && doc.getElementById('toast');
    if (!t) return;
    setTimeout(function () {
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(note._t);
      note._t = setTimeout(function () { t.classList.remove('show'); }, ms || 3800);
    }, 50);
  }

  /* =========================================================
     1. 글자 품질 판정
     ========================================================= */
  function stats(s) {
    var all = String(s || '').replace(/\s/g, '');
    var good = (all.match(/[가-힣A-Za-z0-9]/g) || []).length;
    var bad = (all.match(/[\uE000-\uF8FF\uFFFD\u0000-\u001F\u00C0-\u024F\u4E00-\u9FFF]/g) || []).length;
    return {
      n: all.length,
      good: good,
      bad: bad,
      garbled: all.length >= 20 && bad / all.length > 0.3 && good / all.length < 0.5
    };
  }
  V10.stats = stats;

  /* =========================================================
     2. 읽는 순서 재정렬 (pdf.js textContent → 줄 · 덩어리)
     ========================================================= */
  function mul(a, b) {
    return [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
    ];
  }
  function eol(s, y) {
    return { str: s, dir: 'ltr', width: 0, height: 10, transform: [10, 0, 0, 10, 0, -y], fontName: '', hasEOL: true };
  }
  function layout(tc, vpT) {
    vpT = vpT || [1, 0, 0, 1, 0, 0];
    /* (1) 조각 → 읽기 좌표 (회전 보정) */
    var raw = [];
    (tc.items || []).forEach(function (it) {
      if (!it || it.str == null) return;
      var s = String(it.str).replace(/\u0000/g, '');
      if (!s.trim()) return;
      var m = mul(vpT, it.transform || [1, 0, 0, 1, 0, 0]);
      var h = Math.hypot(m[2], m[3]) || Math.hypot(m[0], m[1]) || 10;
      var ang = Math.atan2(m[1], m[0]);
      var k = ((Math.round(ang / (Math.PI / 2)) % 4) + 4) % 4;
      var th = k * Math.PI / 2, cs = Math.round(Math.cos(th)), sn = Math.round(Math.sin(th));
      var x = m[4] * cs + m[5] * sn, y = -m[4] * sn + m[5] * cs;
      var w = it.width > 0 ? it.width : s.length * h * 0.55;
      raw.push({ s: s, x0: x, x1: x + w, y: y, h: h, k: k });
    });
    /* (2) 가짜 굵게 · 겹침 중복 제거 */
    var seen = {}, items = [];
    raw.forEach(function (r) {
      var q = Math.max(r.h * 0.4, 0.5);
      var key = r.k + '|' + r.s + '|' + Math.round(r.x0 / q) + '|' + Math.round(r.y / q);
      if (seen[key]) return;
      seen[key] = 1;
      items.push(r);
    });
    /* (3) 같은 기준선 → 줄 */
    items.sort(function (a, b) { return a.k - b.k || a.y - b.y || a.x0 - b.x0; });
    var rows = [];
    items.forEach(function (it) {
      var r = rows.length ? rows[rows.length - 1] : null;
      if (r && r.k === it.k && Math.abs(it.y - r.y) <= Math.min(r.h, it.h) * 0.45) {
        r.its.push(it);
        r.h = Math.max(r.h, it.h);
      } else {
        rows.push({ k: it.k, y: it.y, h: it.h, its: [it] });
      }
    });
    /* (4) 줄 안에서 멀리 떨어진 조각(다른 단 · 다른 패널)은 나눔 */
    var frags = [];
    rows.forEach(function (r) {
      r.its.sort(function (a, b) { return a.x0 - b.x0; });
      var f = null;
      r.its.forEach(function (it) {
        var gap = f ? it.x0 - f.x1 : 0;
        if (f && gap > Math.max(f.h, it.h) * 3) {
          frags.push(f);
          f = null;
        }
        if (!f) {
          f = { k: r.k, y: r.y, h: it.h, x0: it.x0, x1: it.x1, s: it.s };
          return;
        }
        if (gap > Math.min(f.h, it.h) * 0.18 && !/\s$/.test(f.s) && !/^\s/.test(it.s)) f.s += ' ';
        f.s += it.s;
        f.x1 = Math.max(f.x1, it.x1);
        f.h = Math.max(f.h, it.h);
      });
      if (f) frags.push(f);
    });
    /* (5) 위아래로 이어지는 줄 → 덩어리(문단) */
    frags.sort(function (a, b) { return a.k - b.k || a.y - b.y || a.x0 - b.x0; });
    var blocks = [];
    frags.forEach(function (f) {
      f.s = one(f.s);
      var best = null, bd = 1e9;
      for (var i = blocks.length - 1; i >= 0; i--) {
        var b = blocks[i];
        if (b.k !== f.k) continue;
        var L = b.lines[b.lines.length - 1];
        var dy = f.y - L.y;
        var lo = Math.min(L.h, f.h), hi = Math.max(L.h, f.h);
        if (dy > hi * 2.2 || dy < lo * 0.5) continue;
        if (hi / lo > 1.9) continue;
        var ov = Math.min(b.x1, f.x1) - Math.max(b.x0, f.x0);
        if (ov < -lo) continue;
        if (dy < bd) { bd = dy; best = b; }
      }
      if (!best) {
        best = { k: f.k, x0: f.x0, x1: f.x1, y0: f.y - f.h, lines: [] };
        blocks.push(best);
      }
      best.lines.push(f);
      best.x0 = Math.min(best.x0, f.x0);
      best.x1 = Math.max(best.x1, f.x1);
    });
    blocks.sort(function (a, b) { return a.k - b.k || a.y0 - b.y0 || a.x0 - b.x0; });
    /* (6) 결과: v9이 그대로 쓰는 items(줄마다 hasEOL) + 텍스트 + 덩어리 정보 */
    var out = [], texts = [], yy = 0;
    blocks.forEach(function (b, bi) {
      if (bi) out.push(eol('', yy += 10));
      b.lines.forEach(function (l) { out.push(eol(l.s, yy += 10)); });
      texts.push(b.lines.map(function (l) { return l.s; }).join('\n'));
    });
    return { items: out, text: texts.join('\n\n'), blocks: blocks, rawCount: raw.length, dupCount: raw.length - items.length };
  }
  V10.layout = layout;

  /* =========================================================
     3. pdf.js 연결 — v9가 불러오는 pdf.js에도 자동 적용
     ========================================================= */
  function patchPage(pg) {
    if (!pg || pg.__v10) return pg;
    Object.defineProperty(pg, '__v10', { value: true });
    var orig = pg.getTextContent.bind(pg);
    pg.getTextContent = function (opt) {
      if (pg.__v10tc) return Promise.resolve(pg.__v10tc);
      return orig(opt).then(function (tc) {
        try {
          var vp = pg.getViewport({ scale: 1 });
          var L = layout(tc, vp.transform);
          var res = { items: L.items, styles: tc.styles || {}, lang: tc.lang || null, v10: L };
          pg.__v10tc = res;
          return res;
        } catch (e) {
          if (G.console) console.warn('[v10] 순서 정렬 실패 → 원본 사용', e);
          return tc;
        }
      });
    };
    return pg;
  }
  function patchDoc(pdf) {
    if (!pdf || pdf.__v10) return pdf;
    Object.defineProperty(pdf, '__v10', { value: true });
    var og = pdf.getPage.bind(pdf);
    pdf.getPage = function (n) { return og(n).then(patchPage); };
    return pdf;
  }
  function wrapLib(lib) {
    if (!lib || lib.__v10) return lib;
    var W = Object.create(lib);
    Object.defineProperty(W, '__v10', { value: true });
    Object.defineProperty(W, '__raw', { value: lib });
    Object.defineProperty(W, 'getDocument', {
      value: function (src) {
        var task = lib.getDocument(src);
        var p = task.promise.then(patchDoc);
        try { Object.defineProperty(task, 'promise', { value: p, configurable: true }); } catch (e) { /* 그대로 */ }
        return task;
      }
    });
    return W;
  }
  var rawLib = G.pdfjsLib, wrapped = rawLib ? wrapLib(rawLib) : undefined;
  try {
    Object.defineProperty(G, 'pdfjsLib', {
      configurable: true,
      enumerable: true,
      get: function () { return wrapped; },
      set: function (v) { rawLib = v; wrapped = wrapLib(v); }
    });
  } catch (e) {
    if (G.console) console.warn('[v10] pdf.js 연결 실패', e);
  }

  /* v9-docs.js readFile()의 스캔본 판정 대체 */
  V10.isScanned = function (t, pdf) {
    var st = stats(t);
    V10.lastRead = st;
    if (st.garbled) {
      note('이 PDF는 글꼴 정보가 깨져 있어 글자를 바로 읽을 수 없습니다.' + (OPT.ocr === 'off' ? ' (OCR 꺼짐)' : ' OCR로 읽습니다.'));
      return OPT.ocr !== 'off';
    }
    if (st.good >= OPT.minChars) {
      note('PDF 글자를 바로 읽었습니다 · ' + st.good.toLocaleString() + '자 · OCR 사용 안 함');
      return false;
    }
    if (OPT.ocr === 'off') {
      note('PDF에 글자 정보가 없습니다 (스캔 이미지 또는 윤곽선 글자) · OCR이 꺼져 있어 읽지 않았습니다.');
      return false;
    }
    note('PDF에 글자 정보가 없어 (스캔 이미지 또는 윤곽선 글자) OCR로 읽습니다.');
    return true;
  };

  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = doc.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('PDF 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)')); };
      doc.head.appendChild(s);
    });
  }
  var libReady = null;
  function ensureLib() {
    if (!libReady) {
      libReady = (G.pdfjsLib ? Promise.resolve() : loadScript(PDFJS + 'pdf.min.js')).then(function () {
        G.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        return G.pdfjsLib;
      });
    }
    return libReady;
  }
  V10.readPdf = async function (file) {
    var lib = await ensureLib();
    var buf = await file.arrayBuffer();
    var pdf;
    try {
      pdf = await lib.getDocument({
        data: new Uint8Array(buf),
        cMapUrl: PDFJS + 'cmaps/',
        cMapPacked: true,
        standardFontDataUrl: PDFJS + 'standard_fonts/'
      }).promise;
    } catch (e) {
      if (e && e.name === 'PasswordException') throw new Error('암호가 걸린 PDF입니다. 암호를 해제한 파일로 올려 주세요.');
      if (/\.ai$/i.test(file.name || '')) throw new Error('AI 파일을 열 수 없습니다. 일러스트레이터에서 [PDF 호환 파일 만들기]를 켜고 저장하거나, PDF로 내보내 올려 주세요.');
      throw new Error('PDF를 열 수 없습니다: ' + (e && e.message ? e.message : e));
    }
    var pages = [], texts = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var pg = await pdf.getPage(p);
      var tc = await pg.getTextContent();
      var L = tc.v10 || layout(tc, pg.getViewport({ scale: 1 }).transform);
      pages.push(L);
      texts.push(L.text);
    }
    var text = texts.join('\n\n');
    return { pdf: pdf, pages: pages, text: text, stats: stats(text), name: file.name || '' };
  };
  /* 글자가 없을 때: 윤곽선 글자인지 스캔 이미지인지 */
  V10.diagnose = async function (pdf) {
    var OPS = (rawLib || G.pdfjsLib).OPS, img = 0, path = 0;
    var n = Math.min(pdf.numPages, 3);
    for (var p = 1; p <= n; p++) {
      var ol = await (await pdf.getPage(p)).getOperatorList();
      ol.fnArray.forEach(function (fn) {
        if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) img++;
        else if (fn === OPS.constructPath) path++;
      });
    }
    return { img: img, path: path, kind: path > 300 ? 'outline' : (img ? 'image' : 'empty') };
  };

  /* =========================================================
     4. 단상자 문안 → 입력값
     ========================================================= */
  var LB = [
    ['name', /(제품명|화장품의?\s*명칭|품\s*명)/],
    ['vol', /(내\s*용\s*량|용\s*량|중\s*량)/],
    ['inci', /(전\s*성\s*분(?:\s*명)?|모든\s*성분|ingredients?)/i],
    ['usage', /(사용\s*방법|사\s*용\s*법|용법\s*[·ㆍ・]?\s*용량|how\s*to\s*use|directions?)/i],
    ['storage', /(보관\s*(?:방법|및\s*취급\s*시의?\s*주의\s*사항))/],
    ['caution', /(사용\s*(?:할\s*때의?|시의?)\s*주의\s*사항|주의\s*사항|cautions?|warnings?)/i],
    ['expiry', /(사용\s*기한(?:\s*또는\s*개봉\s*후\s*사용\s*기간)?|개봉\s*후\s*사용\s*기간|유통\s*기한)/],
    ['maker', /(화장품\s*제조\s*업자|제\s*조\s*업\s*자|제\s*조\s*원|제\s*조\s*사|manufactured\s*by|manufacturer)/i],
    ['seller', /(화장품\s*책임\s*판매\s*업자|책임\s*판매\s*업자|판\s*매\s*원|판\s*매\s*사|distributed\s*by|distributor)/i],
    ['phone', /(소비자\s*상담(?:\s*실|\s*전화(?:\s*번호)?|\s*번호)?|고객\s*상담(?:\s*실|\s*센터)?|고객\s*센터|상담\s*전화|customer\s*(?:service|center))/i],
    ['effect', /(효능\s*[·ㆍ・]?\s*효과)/],
    ['lot', /(제조\s*번호|lot\s*no\.?|batch)/i],
    ['price', /(권장\s*소비자\s*가격|가\s*격)/],
    ['func', /(기능성\s*화장품)/],
    ['origin', /(제\s*조\s*국|원\s*산\s*지|made\s*in)/i]
  ];
  var HEAD = /^[\s\[【<(〔「■□●○◆◇▶▷►•·*※]*/;
  function labelAt(line) {
    var m0 = String(line).match(HEAD), pre = m0 ? m0[0].length : 0, rest = String(line).slice(pre);
    for (var i = 0; i < LB.length; i++) {
      var m = rest.match(LB[i][1]);
      if (!m || m.index !== 0) continue;
      var after = rest.slice(m[0].length);
      if (/^[가-힣A-Za-z]/.test(after) && LB[i][0] !== 'func' && LB[i][0] !== 'origin') continue;
      var val = after.replace(/^[\s\]】>)〕」:：\-–|·]+/, '');
      return { key: LB[i][0], label: m[0], val: val };
    }
    return null;
  }
  function sections(lines) {
    var out = {}, cur = null;
    lines.forEach(function (ln) {
      var l = str(ln);
      if (!l) {
        if (cur && cur.lines.length) cur = null;
        return;
      }
      var lb = labelAt(l);
      if (lb) {
        cur = { key: lb.key, label: lb.label, lines: lb.val ? [lb.val] : [] };
        (out[lb.key] = out[lb.key] || []).push(cur);
        return;
      }
      if (cur && cur.lines.length < 60) cur.lines.push(l);
    });
    return out;
  }
  function joinWrap(lines, mode) {
    var s = '';
    (lines || []).forEach(function (l) {
      l = str(l);
      if (!l) return;
      if (!s) { s = l; return; }
      var a = s.slice(-1), b = l.charAt(0);
      if (a === '-') s += l;
      else if (mode === 'inci' && /[가-힣)]/.test(a) && /[가-힣(]/.test(b)) s += l;
      else s += ' ' + l;
    });
    return s;
  }
  function cleanInci(s) {
    return one(s).replace(/\s*[,，]\s*/g, ', ').replace(/(\d), (\d)/g, '$1,$2').replace(/[.\s]+$/, '').trim();
  }
  var BUL = /^\s*(?:\d{1,2}\s*[.)]|[①-⑩]|step\s*\d+\.?|[-•·▶]|[가-하]\s*[.)])\s*/i;
  function itemsOf(lines) {
    var out = [];
    if ((lines || []).some(function (l) { return BUL.test(l); })) {
      lines.forEach(function (l) {
        if (BUL.test(l) || !out.length) out.push(str(l).replace(BUL, ''));
        else out[out.length - 1] = joinWrap([out[out.length - 1], l]);
      });
    } else {
      out = joinWrap(lines).split(/(?<=[.!?。])\s+/);
    }
    return out.map(one).filter(function (s) { return s.length >= 3; });
  }
  var PT = /(토너|스킨|크림|세럼|에센스|앰플|마스크|팩|로션|에멀전|에멀젼|밤|봄므|오일|폼|클렌저|클렌징|패드|미스트|젤|겔|고마쥬|필링|쿠션|파운데이션|프라이머|워터|버블|스크럽|스틱|선스크린)$/;
  var PTE = /\b(TONER|SKIN|CREAM|SERUM|ESSENCE|AMPOULE|MASK|PACK|LOTION|EMULSION|BALM|BAUME|OIL|FOAM|CLEANSER|PADS?|MIST|GEL|GOMMAGE|PEELING|CUSHION|WATER|SCRUB|STICK|SUNSCREEN)\b/i;
  var VOLTAIL = /\s*\d+(?:[.,]\d+)?\s?(?:ml|mL|ML|㎖|g|G)(?![A-Za-z])\s*(?:\/.*)?$/;
  function cands(pages, test) {
    var out = [];
    (pages || []).forEach(function (P) {
      (P.blocks || []).forEach(function (b) {
        var ls = b.lines;
        for (var i = 0; i < ls.length; i++) {
          out.push({ s: ls[i].s, h: ls[i].h });
          var n = ls[i + 1];
          if (n && Math.max(ls[i].h, n.h) / Math.min(ls[i].h, n.h) < 1.15) out.push({ s: ls[i].s + ' ' + n.s, h: Math.min(ls[i].h, n.h), pair: true });
        }
      });
    });
    return out.map(function (c) { c.s = one(c.s).replace(VOLTAIL, '').trim(); return c; }).filter(test);
  }
  function nameOf(sec, pages) {
    var c0 = (sec.name || [])[0];
    if (c0 && c0.lines.length) return one(c0.lines[0]).replace(VOLTAIL, '').trim();
    var best = null;
    cands(pages, function (c) {
      var s = c.s;
      if ((s.match(/[가-힣]/g) || []).length < 2 || s.length > 40 || /[:：]/.test(s) || labelAt(s)) return false;
      if ((s.match(/,/g) || []).length >= 2) return false;
      return true;
    }).forEach(function (c) {
      var sc = c.h * (PT.test(c.s) ? 2 : 1) + (c.pair ? 0.01 : 0);
      if (!best || sc > best.sc) best = { s: c.s, sc: sc };
    });
    return best ? best.s : '';
  }
  function enOf(pages) {
    var best = null;
    cands(pages, function (c) {
      var s = c.s;
      return !/[가-힣]/.test(s) && /[A-Za-z]{2,}/.test(s) && s.length <= 60 && !/[:：,]/.test(s) && !labelAt(s) && PTE.test(s);
    }).forEach(function (c) {
      var sc = c.h + (c.pair ? 0.01 : 0);
      if (!best || sc > best.sc) best = { s: c.s, sc: sc };
    });
    return best ? best.s : '';
  }
  var VOL = /(\d+(?:[.,]\d+)?)\s?(ml|mL|ML|㎖|g|G|매|ea|EA)(?![A-Za-z])/;
  function normVol(m) {
    var u = m[2].replace('㎖', 'ml').toLowerCase();
    return m[1].replace(',', '.') + u;
  }
  function volOf(sec, text) {
    var src = (sec.vol || []).map(function (c) { return c.lines.slice(0, 2).join(' '); });
    for (var i = 0; i < src.length; i++) {
      var m = src[i].match(VOL);
      if (m) return normVol(m);
    }
    var m2 = text.match(new RegExp('(?:내용량|용량|중량)\\s*[\\]】]?\\s*[:：]?\\s*' + VOL.source));
    if (m2) return normVol(m2);
    var cnt = {}, first = {}, re = new RegExp(VOL.source, 'g'), m3, idx = 0;
    while ((m3 = re.exec(text))) {
      var after = text.slice(m3.index + m3[0].length, m3.index + m3[0].length + 2);
      if (/^\s*%/.test(after)) continue;
      var v = normVol(m3);
      cnt[v] = (cnt[v] || 0) + 1;
      if (!(v in first)) first[v] = idx++;
    }
    var ks = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || first[a] - first[b]; });
    return ks[0] || '';
  }
  function inciOf(sec, lines) {
    var best = '', bs = -1;
    (sec.inci || []).forEach(function (c) {
      var s = cleanInci(joinWrap(c.lines, 'inci'));
      var commas = (s.match(/,/g) || []).length;
      var ko = (s.match(/[가-힣]/g) || []).length > s.length * 0.3;
      var sc = commas * (ko ? 3 : 1);
      if (commas >= 4 && sc > bs) { bs = sc; best = s; }
    });
    if (!best) {
      var i = -1;
      for (var a = 0; a < lines.length; a++) if (/(^|\s)정\s*제\s*수\s*[,，]/.test(lines[a])) { i = a; break; }
      if (i >= 0) {
        var buf = [];
        for (var j = i; j < lines.length && str(lines[j]) && (j === i || !labelAt(lines[j])); j++) buf.push(lines[j]);
        best = cleanInci(joinWrap(buf, 'inci').replace(/^.*?(?=정\s*제\s*수\s*[,，])/, ''));
      }
    }
    return best;
  }
  function usageOf(sec) {
    var c = (sec.usage || [])[0];
    return c ? itemsOf(c.lines).slice(0, 6).join('\n') : '';
  }
  var STD = /(붉은\s*반점|상처가\s*있는|어린이의?\s*손|직사광선을\s*피해|보관\s*및\s*취급|전문의\s*등과\s*상담)/;
  function cautionOf(sec) {
    var c = (sec.caution || [])[0];
    if (!c) return '';
    return itemsOf(c.lines).filter(function (s) { return !STD.test(s); }).slice(0, 4).join(' / ');
  }
  var EXP = /((?:제조일로?\s*부터\s*)?\d{1,2}\s*(?:개월|년)(?:\s*[,(/]?\s*개봉\s*(?:후|시)\s*\d{1,2}\s*개월\s*\)?)?)/;
  function fixExp(s, label) {
    s = one(s).replace(/제조일로?\s*부터\s*/, '제조일로부터 ');
    if (/^\d/.test(s)) s = (/개봉/.test(label || '') ? '개봉 후 ' : '제조일로부터 ') + s;
    return s;
  }
  function expiryOf(sec, text) {
    var cs = sec.expiry || [];
    for (var i = 0; i < cs.length; i++) {
      var m = joinWrap(cs[i].lines.slice(0, 2)).match(EXP);
      if (m) return fixExp(m[1], cs[i].label);
    }
    var m2 = text.match(new RegExp('사용\\s*기한[^\\n]{0,24}?' + EXP.source));
    return m2 ? fixExp(m2[1]) : '';
  }
  var ADDR = /(?:\s|^)(?:서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충북|충남|충청|전북|전남|전라|경북|경남|경상|제주)|주소|tel|전화|\/|\||\(우\)|\d{2,4}-\d{3,4}/i;
  function company(sec, key) {
    var c = (sec[key] || [])[0];
    if (!c) return '';
    var s = joinWrap(c.lines.slice(0, 2));
    var i = s.search(ADDR);
    if (i > 0) s = s.slice(0, i);
    return s.replace(/[\s,:：]+$/, '').trim().slice(0, 40);
  }
  var PH = /(0\d{1,2}[-.)\s]{1,2}\d{3,4}[-.\s]\d{4}|1[5-9]\d{2}[-.\s]\d{4}|080[-.\s]?\d{3,4}[-.\s]?\d{4})/;
  function phoneOf(sec, lines) {
    var src = (sec.phone || []).map(function (c) { return joinWrap(c.lines.slice(0, 2)); });
    lines.forEach(function (l) { if (/(상담|고객|문의|customer|tel)/i.test(l)) src.push(l); });
    for (var i = 0; i < src.length; i++) {
      var m = src[i].match(PH);
      if (m) return m[1].replace(/[.)\s]+/g, '-').replace(/-+/g, '-');
    }
    return '';
  }
  function funcOf(sec, lines) {
    var scope = [].concat(sec.func || [], sec.effect || []).map(function (c) { return (c.label || '') + ' ' + c.lines.join(' '); }).join(' ');
    lines.forEach(function (l) { if (/기능성/.test(l)) scope += ' ' + l; });
    if (!/기능성/.test(scope)) return '';
    var t = [];
    if (/미백/.test(scope)) t.push('미백');
    if (/주름\s*개선/.test(scope)) t.push('주름개선');
    if (/자외선\s*(?:차단|으로부터)/.test(scope)) t.push('자외선차단');
    return t.join(', ');
  }
  function contentOf(name, text, inci) {
    var pool = (inci || '').replace(/\s+/g, '') + '|' + (name || '').replace(/\s+/g, '');
    var re = /([가-힣A-Za-z][가-힣A-Za-z\-]{1,24})\s*(\d+(?:\.\d+)?)\s*(%|ppm)/g, m, out = [], seen = {};
    var src = (name || '') + '\n' + text;
    while ((m = re.exec(src)) && out.length < 4) {
      var k = m[1], v = parseFloat(m[2]);
      if (seen[k] || !(v > 0 && v <= 100) || pool.indexOf(k) < 0) continue;
      seen[k] = 1;
      out.push(k + ' ' + m[2] + m[3]);
    }
    return out.join(', ');
  }
  V10.parseCarton = function (r) {
    var text = String(r.text || ''), lines = text.split('\n');
    var sec = sections(lines), o = {};
    o.name = nameOf(sec, r.pages);
    o.en = enOf(r.pages);
    o.vol = volOf(sec, text);
    o.inci = inciOf(sec, lines);
    o.content = contentOf(o.name, text, o.inci);
    o.func = funcOf(sec, lines);
    o.usage = usageOf(sec);
    o.expiry = expiryOf(sec, text);
    o.seller = company(sec, 'seller');
    o.maker = company(sec, 'maker');
    o.phone = phoneOf(sec, lines);
    o.caution = cautionOf(sec);
    return o;
  };
  V10._t = { labelAt: labelAt, sections: sections, joinWrap: joinWrap };

  /* =========================================================
     5. 입력 화면 — [최종 단상자 디자인 업로드]
     ========================================================= */
  var FIELDS = [
    ['name', 'fName', '제품명'],
    ['en', 'fEn', '영문 제품명'],
    ['vol', 'fVol', '용량'],
    ['inci', 'fInci', '전성분'],
    ['content', 'fContent', '대표성분 함량'],
    ['func', 'fFunc', '기능성 화장품'],
    ['usage', 'fUsage', '사용법'],
    ['expiry', 'fExpiry', '사용기한'],
    ['seller', 'fSeller', '화장품책임판매업자'],
    ['phone', 'fPhone', '소비자상담 전화번호'],
    ['caution', 'fCaution', '추가 주의사항'],
    ['maker', null, '화장품제조업자 (참고)']
  ];
  var ST = {
    filled: ['ok', '채움'],
    same: ['ok', '같음'],
    kept: ['warn', '기존값 유지'],
    ocrchk: ['warn', '아래에서 확인 후 채우기'],
    nosel: ['warn', '선택지 없음'],
    none: ['no', '못 찾음'],
    info: ['no', '참고용']
  };
  function openParents(el) {
    var p = el.parentElement;
    while (p) {
      if (p.tagName === 'DETAILS') p.open = true;
      p = p.parentElement;
    }
  }
  function apply(data, force, only) {
    var st = {};
    FIELDS.forEach(function (f) {
      var key = f[0], id = f[1];
      if (only && only !== key) return;
      var v = str(data[key]);
      if (!v) { st[key] = 'none'; return; }
      if (!id) { st[key] = 'info'; return; }
      var el = doc.getElementById(id);
      if (!el) { st[key] = 'none'; return; }
      var cur = str(el.value);
      if (cur === v) { st[key] = 'same'; return; }
      if (cur && !force) { st[key] = 'kept'; return; }
      if (el.tagName === 'SELECT' && !Array.prototype.some.call(el.options, function (o) { return o.value === v; })) { st[key] = 'nosel'; return; }
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      openParents(el);
      st[key] = 'filled';
    });
    return st;
  }
  var CSS = '' +
    '.v10-wrap{margin:10px 0 4px}' +
    '.v10-drop{display:block;border:1.5px dashed #c7cdd6;border-radius:10px;padding:14px 16px;cursor:pointer;background:#fafbfc;text-align:center}' +
    '.v10-drop b{display:block;font-size:14px;margin-bottom:4px}' +
    '.v10-drop span{font-size:12px;color:#6b7280;line-height:1.5}' +
    '.v10-drop:hover,.v10-drop.v10-over{border-color:#2563eb;background:#f5f8ff}' +
    '.v10-res{margin-top:8px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;font-size:13px;background:#fff}' +
    '.v10-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}' +
    '.v10-head small{color:#6b7280}' +
    '.v10-res table{width:100%;border-collapse:collapse}' +
    '.v10-res td{padding:5px 6px;border-top:1px solid #f1f5f9;vertical-align:top}' +
    '.v10-res td.k{width:140px;color:#6b7280;white-space:nowrap}' +
    '.v10-res td.v div{max-height:72px;overflow:auto;white-space:pre-wrap;word-break:break-all}' +
    '.v10-res td.s{width:170px;text-align:right;white-space:nowrap}' +
    '.v10-b{display:inline-block;padding:1px 6px;border-radius:4px;font-size:12px;background:#f3f4f6;color:#374151}' +
    '.v10-b.ok{background:#dcfce7;color:#166534}.v10-b.warn{background:#fef3c7;color:#92400e}.v10-b.no{background:#f3f4f6;color:#9ca3af}' +
    '.v10-x{margin-left:6px;font-size:12px;border:1px solid #d1d5db;background:#fff;border-radius:4px;padding:1px 6px;cursor:pointer}' +
    '.v10-err{color:#b91c1c;line-height:1.6}';
  function render(res, S) {
    var rows = FIELDS.map(function (f) {
      var k = f[0], s = S.st[k] || 'none', b = ST[s] || ST.none, v = S.data[k] || '';
      var btn = (s === 'kept') ? '<button type="button" class="v10-x" data-k="' + k + '">바꾸기</button>' : '';
      return '<tr><td class="k">' + esc(f[2]) + '</td><td class="v"><div>' + (v ? esc(v) : '<span style="color:#9ca3af">-</span>') + '</div></td>' +
        '<td class="s"><span class="v10-b ' + b[0] + '">' + b[1] + '</span>' + btn + '</td></tr>';
    }).join('');
    var kept = FIELDS.some(function (f) { return S.st[f[0]] === 'kept'; });
    res.innerHTML = '<div class="v10-head"><b>단상자에서 읽은 값 · ' + esc(S.file) + '</b>' +
      '<small>' + (S.ocr ? '윤곽선 파일 · OCR로 읽음 (평균 신뢰도 ' + S.conf + '%) · 모든 값을 원본과 대조해 주세요' : 'PDF 글자 ' + S.chars.toLocaleString() + '자를 바로 읽음 (OCR 없음)') +
      (kept ? ' <button type="button" class="v10-x" data-all="1">모두 단상자 값으로 바꾸기</button>' : '') + '</small></div>' +
      '<table>' + rows + '</table>' +
      '<p class="muted small" style="margin:6px 0 0">비어 있던 칸만 자동으로 채웠습니다. 값이 다르면 [바꾸기]를 눌러 주세요. 최종 게시 전 원본과 한 번 더 대조해 주세요.</p>';
  }
  function noText(d) {
    if (d.kind === 'outline') {
      return '<p class="v10-err"><b>이 파일은 글자가 윤곽선(아웃라인)으로 바뀌어 있어 바로 읽을 수 없습니다.</b><br>' +
        '인쇄소용 최종 파일은 보통 [윤곽선 만들기]가 되어 있습니다. 디자이너에게 <b>윤곽선 변환 전, 글자가 살아 있는 PDF</b>(또는 일러스트레이터 원본 .ai)를 따로 받아 올려 주세요.</p>';
    }
    if (d.kind === 'image') {
      return '<p class="v10-err"><b>이 파일은 이미지(스캔본)로만 되어 있어 글자 정보가 없습니다.</b><br>디자인 프로그램에서 내보낸 PDF(글자 살림)를 올려 주세요.</p>';
    }
    return '<p class="v10-err">파일에서 읽을 수 있는 글자를 찾지 못했습니다.</p>';
  }
  function setupCarton() {
    var drop = doc.getElementById('drop');
    if (!drop || doc.getElementById('v10Carton')) return;
    var style = doc.createElement('style');
    style.textContent = CSS;
    doc.head.appendChild(style);
    var box = doc.createElement('div');
    box.id = 'v10Carton';
    box.className = 'v10-wrap';
    box.innerHTML = '<label class="v10-drop"><input type="file" accept=".pdf,.ai,application/pdf" hidden>' +
      '<b>최종 단상자 디자인 업로드 (PDF · AI)</b>' +
      '<span>단상자 파일을 올리면 제품명 · 용량 · 전성분 · 사용법 · 사용기한 · 책임판매업자 · 상담 전화번호를 바로 읽어 채웁니다<br>글자가 살아 있으면 OCR 없이 바로 읽고, 윤곽선(아웃라인) 최종본이면 OCR로 읽은 뒤 전성분을 기존 값과 비교합니다</span></label>' +
      '<div class="v10-res" hidden></div>';
    drop.parentNode.insertBefore(box, drop.nextSibling);
    var lab = box.querySelector('label'), inp = box.querySelector('input'), res = box.querySelector('.v10-res');
    var S = null;
    /* 결과 표 + (윤곽선 OCR이면) 전성분 비교 패널 */
    function show() {
      render(res, S);
      if (S.ocr && G.V11 && G.V11.mountInci) {
        var slot = doc.createElement('div');
        res.appendChild(slot);
        G.V11.mountInci(slot, { data: S.data, r: S.r, base: S.base }, function (v) {
          S.data.inci = v;
          S.st.inci = 'filled';
          note('확인한 전성분으로 입력칸을 채웠습니다');
          show();
        });
      }
    }
    async function run(file) {
      res.hidden = false;
      res.innerHTML = '<p class="muted small">단상자 파일을 읽는 중입니다…</p>';
      try {
        var r = await V10.readPdf(file), ocr = false;
        var fi = doc.getElementById('fInci'), base = fi ? str(fi.value) : '';
        if (r.stats.garbled || r.stats.good < OPT.minChars) {
          var dg = r.stats.garbled ? { kind: 'garbled' } : await V10.diagnose(r.pdf);
          if (!G.V11 || !G.V11.ocrPdf || dg.kind === 'empty') {
            res.innerHTML = r.stats.garbled
              ? '<p class="v10-err">이 파일은 글꼴 정보가 깨져 있어 글자를 바로 읽을 수 없습니다. 디자인 프로그램에서 PDF로 다시 내보내 올려 주세요.</p>'
              : noText(dg);
            return;
          }
          res.innerHTML = '<p class="muted small v10-prog">' + (dg.kind === 'outline' ? '글자가 윤곽선(아웃라인)으로 되어 있어' : dg.kind === 'garbled' ? '글꼴 정보가 깨져 있어' : '이미지로 된 파일이라') +
            ' 그림으로 읽는 중입니다 (OCR · 이 브라우저 안에서만 처리) · 처음 한 번은 한글 OCR 데이터를 내려받느라 더 걸립니다</p>';
          var pr = res.querySelector('.v10-prog'), msg0 = pr.textContent;
          r = await G.V11.ocrPdf(r.pdf, {
            onProgress: function (p) {
              pr.textContent = msg0 + ' — ' + (p.phase === 'layout' ? p.page + '/' + p.pages + '쪽 글자 위치 찾는 중' : p.page + '/' + p.pages + '쪽 글자 덩어리 ' + p.block + '/' + p.blocks);
            }
          });
          if (r.stats.good < 10) {
            res.innerHTML = '<p class="v10-err">OCR로도 글자를 거의 읽지 못했습니다. 해상도가 매우 낮거나 글자가 너무 작은 파일일 수 있습니다.</p>';
            return;
          }
          ocr = true;
        }
        var data = V10.parseCarton(r), forApply = data, cmp = null;
        if (ocr) {
          cmp = G.V11.compareInci(data.inci, base);
          data.inciOcr = data.inci;
          data.inci = cmp.text;
          /* 바뀐 성분이나 확인할 성분이 있으면 전성분은 자동으로 채우지 않음 (비교 패널에서 확인 후 채우기) */
          if (cmp.review || cmp.diff) forApply = Object.assign({}, data, { inci: '' });
        }
        S = { data: data, st: apply(forApply, false), file: file.name || '', chars: r.stats.good, ocr: ocr, r: r, base: base, conf: r.conf || 0 };
        if (ocr && forApply !== data && data.inci) S.st.inci = 'ocrchk';
        V10.lastCarton = { data: data, text: r.text, ocr: ocr };
        show();
        var n = FIELDS.filter(function (f) { return S.st[f[0]] === 'filled'; }).length;
        note('단상자에서 ' + n + '개 칸을 채웠습니다' + (ocr ? ' (OCR · 값을 꼭 확인해 주세요)' : ''));
      } catch (e) {
        res.innerHTML = '<p class="v10-err">' + esc(e && e.message ? e.message : e) + '</p>';
      }
    }
    res.addEventListener('click', function (e) {
      var t = e.target;
      if (!S || !t || !t.classList || !t.classList.contains('v10-x')) return;
      var st = t.getAttribute('data-all') ? apply(S.data, true) : apply(S.data, true, t.getAttribute('data-k'));
      Object.keys(st).forEach(function (k) { S.st[k] = st[k]; });
      show();
    });
    inp.addEventListener('change', function () {
      if (inp.files && inp.files[0]) run(inp.files[0]);
      inp.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      lab.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); lab.classList.add('v10-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      lab.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); lab.classList.remove('v10-over'); });
    });
    lab.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) run(f);
    });
  }
  /* v12: [최종 단상자 디자인 업로드] 칸은 기본으로 끔 (윤곽선 최종본이 제대로 읽히지 않아 제거)
     다시 켜려면 index.html에서 이 파일보다 먼저 window.V10_OPTIONS = { carton: true } 선언 */
  if (doc && OPT.carton === true) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', setupCarton);
    else setupCarton();
  }
})(typeof window !== 'undefined' ? window : globalThis);
