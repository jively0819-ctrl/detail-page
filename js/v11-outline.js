/* =========================================================
   v11 — 윤곽선(아웃라인) 최종 단상자 OCR + 전성분 비교
   index.html에서 v10-pdf.js 바로 뒤에 불러옵니다.

   [1] 윤곽선 파일 OCR (무료 · 브라우저 안에서만 처리 · 서버로 보내지 않음)
     - 글자가 도형으로 바뀐 최종 단상자 PDF/AI를 그림으로 그려 Tesseract.js(한글+영문)로 읽습니다.
     - 낮은 해상도로 한 번 그려 글자 덩어리(면 · 문단)를 찾고, 덩어리마다 글자 크기에 맞춰
       고해상도로 다시 그립니다. (글자 높이 약 40px 기준 → 6pt 전성분이면 약 500dpi)
     - 칼선 · 접는 선 · 테두리 같은 긴 선은 덩어리 찾기에서 뺍니다.
     - 어두운 배경의 흰 글자는 반전해서 읽습니다.
     - 세로로 눕힌 옆면 글자(90° · 270°)와 거꾸로 놓인 날개 글자(180°)는 돌려 가며 가장 잘 읽히는 방향을 고릅니다.
     - OCR이 한 글자씩 띄워 읽은 한글("사 용 기 한")은 글자 간격을 보고 다시 붙입니다.
     - 결과는 v10 단상자 자동 채우기(V10.parseCarton)에 그대로 들어갑니다.

   [2] 전성분 비교 (최종본 OCR ↔ 기준 전성분)
     - 기준: 입력칸에 이미 있는 전성분(입력템플릿 값) · 이전 원본(글자 살린 PDF) · 직접 붙여넣기
     - 순서를 지켜 성분 단위로 맞춰 보고 다음 중 하나로 표시합니다.
         같음 · OCR 보정(기준 표기로 고침) · 추가 · 변경 · 삭제 · 순서 변경 · 확인 필요(숫자 차이 등) · 사전에 없음
     - 기준이 없으면 성분 사전으로만 보정하고, 사전에 없는 성분을 표시합니다.
     - 성분 사전 = 기본 사전(자주 쓰는 성분 약 390개) + 이 브라우저에서 비교 · 채우기에 쓴 성분(자동 학습)
       + 직접 올린 사전 파일(txt/csv · 한 줄에 하나 또는 쉼표 구분)

   옵션 (index.html에서 이 파일보다 먼저 선언)
     window.V11_OPTIONS = { lang: 'kor+eng', lang2: 'kor', targetPx: 40, maxPages: 6 }
     (lang2 = 한글을 영문으로 잘못 읽은 단어를 다시 읽을 때 쓰는 언어 · '' 이면 끔)
   ========================================================= */
(function (G) {
  'use strict';
  var doc = G.document;
  var V10 = G.V10 = G.V10 || {};
  var V11 = G.V11 = G.V11 || {};
  var OPT = G.V11_OPTIONS = Object.assign({
    lang: 'kor+eng',
    lang2: 'kor',
    tesseract: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    targetPx: 40,
    minScale: 2.5,
    maxScale: 12,
    maxPixels: 10e6,
    minConf: 25,
    maxPages: 6,
    maxBlocks: 120,
    joinGap: 0.35
  }, G.V11_OPTIONS || {});

  var str = function (s) { return String(s == null ? '' : s).trim(); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var GOOD = /[가-힣A-Za-z0-9]/;

  /* =========================================================
     1. 이미지 처리 (ImageData 형태 {width, height, data(RGBA)})
     ========================================================= */
  function grayOf(img) {
    var n = img.width * img.height, g = new Uint8Array(n), d = img.data;
    for (var i = 0, j = 0; i < n; i++, j += 4) {
      var a = d[j + 3] / 255;
      g[i] = Math.round((d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114) * a + 255 * (1 - a));
    }
    return g;
  }
  /* 긴 선 제거: 한 방향으로 L픽셀 넘게 이어진 구간을 지움 */
  function dropRuns(m, w, h, L, horiz) {
    var outer = horiz ? h : w, inner = horiz ? w : h;
    for (var o = 0; o < outer; o++) {
      var start = -1;
      for (var k = 0; k <= inner; k++) {
        var idx = horiz ? o * w + k : k * w + o;
        var on = k < inner && m[idx];
        if (on && start < 0) start = k;
        if (!on && start >= 0) {
          if (k - start > L) {
            for (var z = start; z < k; z++) m[horiz ? o * w + z : z * w + o] = 0;
          }
          start = -1;
        }
      }
    }
  }
  function dilate1(src, w, h, r, horiz) {
    var out = new Uint8Array(w * h);
    var outer = horiz ? h : w, inner = horiz ? w : h;
    for (var o = 0; o < outer; o++) {
      var last = -1e9;
      for (var k = 0; k < inner; k++) {
        if (src[horiz ? o * w + k : k * w + o]) last = k;
        if (k - last <= r) out[horiz ? o * w + k : k * w + o] = 1;
      }
      last = 1e9;
      for (k = inner - 1; k >= 0; k--) {
        if (src[horiz ? o * w + k : k * w + o]) last = k;
        if (last - k <= r) out[horiz ? o * w + k : k * w + o] = 1;
      }
    }
    return out;
  }
  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; });
    return b[b.length >> 1];
  }
  function runs(p) {
    var r = [], s = -1;
    for (var k = 0; k <= p.length; k++) {
      var on = k < p.length && p[k] > 0;
      if (on && s < 0) s = k;
      if (!on && s >= 0) { r.push(k - s); s = -1; }
    }
    return r;
  }
  /* 글자 덩어리 찾기 → [{x0,y0,x1,y1, lh(글자 높이), tall}] (단위: pdf.js 화면 좌표 pt) */
  function segment(img, s0) {
    var w = img.width, h = img.height, g = grayOf(img), TH = 40;
    var eh = new Uint8Array(w * h), ev = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var i = y * w + x, v = g[i];
        if (x + 1 < w && Math.abs(v - g[i + 1]) > TH) eh[i] = 1;
        if (y + 1 < h && Math.abs(v - g[i + w]) > TH) ev[i] = 1;
      }
    }
    var L = Math.max(60, Math.round(45 * s0));
    dropRuns(ev, w, h, L, true);
    dropRuns(eh, w, h, L, false);
    var e = new Uint8Array(w * h);
    for (i = 0; i < w * h; i++) e[i] = eh[i] | ev[i];
    var cs = 2, gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), grid = new Uint8Array(gw * gh);
    for (y = 0; y < h; y++) {
      for (x = 0; x < w; x++) if (e[y * w + x]) grid[((y / cs) | 0) * gw + ((x / cs) | 0)] = 1;
    }
    var rx = Math.max(2, Math.ceil(3 * s0 / cs)), ry = Math.max(1, Math.ceil(2 * s0 / cs));
    var dg = dilate1(dilate1(grid, gw, gh, rx, true), gw, gh, ry, false);
    var lab = new Int32Array(gw * gh), boxes = [], stack = [];
    for (var c = 0; c < gw * gh; c++) {
      if (!dg[c] || lab[c]) continue;
      var id = boxes.length + 1, b = { x0: 1e9, y0: 1e9, x1: -1, y1: -1 };
      lab[c] = id;
      stack.push(c);
      while (stack.length) {
        var q = stack.pop(), qx = q % gw, qy = (q / gw) | 0;
        if (qx < b.x0) b.x0 = qx;
        if (qx > b.x1) b.x1 = qx;
        if (qy < b.y0) b.y0 = qy;
        if (qy > b.y1) b.y1 = qy;
        if (qx > 0 && dg[q - 1] && !lab[q - 1]) { lab[q - 1] = id; stack.push(q - 1); }
        if (qx < gw - 1 && dg[q + 1] && !lab[q + 1]) { lab[q + 1] = id; stack.push(q + 1); }
        if (qy > 0 && dg[q - gw] && !lab[q - gw]) { lab[q - gw] = id; stack.push(q - gw); }
        if (qy < gh - 1 && dg[q + gw] && !lab[q + gw]) { lab[q + gw] = id; stack.push(q + gw); }
      }
      boxes.push(b);
    }
    var out = [];
    boxes.forEach(function (b) {
      var X0 = b.x0 * cs, Y0 = b.y0 * cs, X1 = Math.min(w, (b.x1 + 1) * cs), Y1 = Math.min(h, (b.y1 + 1) * cs);
      var bw = X1 - X0, bh = Y1 - Y0;
      if (bw < 4 * s0 || bh < 3 * s0) return;
      var rows = new Uint32Array(bh), cols = new Uint32Array(bw), cnt = 0;
      for (var yy = Y0; yy < Y1; yy++) {
        for (var xx = X0; xx < X1; xx++) {
          var ii = yy * w + xx;
          if (e[ii]) cnt++;
          if (eh[ii]) rows[yy - Y0]++;
          if (ev[ii]) cols[xx - X0]++;
        }
      }
      if (cnt < 12 || cnt / (bw * bh) < 0.01) return;
      var tall = bh > bw * 1.5;
      /* 글자 높이 ≈ 줄 방향 투영에서 글자가 있는 구간 길이의 중앙값 */
      var prof = tall ? cols : rows, mx = 0;
      for (var pk = 0; pk < prof.length; pk++) if (prof[pk] > mx) mx = prof[pk];
      var thr = Math.max(1, mx * 0.15), cut = new Uint8Array(prof.length);
      for (pk = 0; pk < prof.length; pk++) cut[pk] = prof[pk] >= thr ? 1 : 0;
      var lhPx = median(runs(cut).filter(function (v) { return v > 1; })) || Math.min(bw, bh);
      if (lhPx / s0 < 1.5) return;
      out.push({ x0: X0 / s0, y0: Y0 / s0, x1: X1 / s0, y1: Y1 / s0, lh: lhPx / s0, tall: tall });
    });
    var merged = true;
    while (merged) {
      merged = false;
      for (var a = 0; a < out.length && !merged; a++) {
        for (var z = a + 1; z < out.length; z++) {
          var A = out[a], B = out[z];
          var ix = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), iy = Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0);
          if (ix <= 0 || iy <= 0) continue;
          var small = Math.min((A.x1 - A.x0) * (A.y1 - A.y0), (B.x1 - B.x0) * (B.y1 - B.y0));
          if (ix * iy < small * 0.3) continue;
          A.x0 = Math.min(A.x0, B.x0); A.y0 = Math.min(A.y0, B.y0);
          A.x1 = Math.max(A.x1, B.x1); A.y1 = Math.max(A.y1, B.y1);
          A.lh = Math.min(A.lh, B.lh);
          A.tall = (A.y1 - A.y0) > (A.x1 - A.x0) * 1.5;
          out.splice(z, 1);
          merged = true;
          break;
        }
      }
    }
    out.sort(function (p, q) { return p.y0 - q.y0 || p.x0 - q.x0; });
    return out;
  }
  /* 흑백 변환 (Otsu) · 어두운 배경이면 반전 · 여백 추가 */
  function binarize(img, pad) {
    var w = img.width, h = img.height, g = grayOf(img), hist = new Float64Array(256);
    for (var i = 0; i < g.length; i++) hist[g[i]]++;
    var total = g.length, sum = 0;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    var sB = 0, wB = 0, best = 0, t = 128;
    for (i = 0; i < 256; i++) {
      wB += hist[i];
      if (!wB) continue;
      var wF = total - wB;
      if (!wF) break;
      sB += i * hist[i];
      var mB = sB / wB, mF = (sum - sB) / wF, bt = wB * wF * (mB - mF) * (mB - mF);
      if (bt > best) { best = bt; t = i; }
    }
    var dark = 0;
    for (i = 0; i < g.length; i++) if (g[i] <= t) dark++;
    var inv = dark > g.length * 0.5;
    pad = pad || 0;
    var W = w + pad * 2, H = h + pad * 2, d = new Uint8ClampedArray(W * H * 4).fill(255);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var ink = inv ? g[y * w + x] > t : g[y * w + x] <= t;
        var j = ((y + pad) * W + x + pad) * 4;
        if (ink) { d[j] = 0; d[j + 1] = 0; d[j + 2] = 0; }
      }
    }
    return { width: W, height: H, data: d, inverted: inv };
  }
  /* 시계 방향 회전 (0 · 90 · 180 · 270) */
  function rotate(img, r) {
    if (!r) return img;
    var w = img.width, h = img.height, s = img.data;
    var W = r === 180 ? w : h, H = r === 180 ? h : w, d = new Uint8ClampedArray(W * H * 4);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var X, Y;
        if (r === 90) { X = h - 1 - y; Y = x; }
        else if (r === 180) { X = w - 1 - x; Y = h - 1 - y; }
        else { X = y; Y = w - 1 - x; }
        var a = (y * w + x) * 4, b = (Y * W + X) * 4;
        d[b] = s[a]; d[b + 1] = s[a + 1]; d[b + 2] = s[a + 2]; d[b + 3] = 255;
      }
    }
    return { width: W, height: H, data: d };
  }
  /* 회전된 그림 좌표 → 회전 전 좌표 (w, h = 회전 전 크기) */
  function unrotPt(X, Y, r, w, h) {
    if (r === 90) return [Y, h - X];
    if (r === 180) return [w - X, h - Y];
    if (r === 270) return [w - Y, X];
    return [X, Y];
  }

  /* =========================================================
     2. 브라우저 입출력 (pdf.js 그리기 · Tesseract.js)
     ========================================================= */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = doc.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('OCR 라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)')); };
      doc.head.appendChild(s);
    });
  }
  var workers = {}, libP = null;
  function getWorker(lang) {
    lang = lang || OPT.lang;
    if (!workers[lang]) {
      if (!libP) {
        libP = G.Tesseract ? Promise.resolve() : loadScript(OPT.tesseract);
        libP.catch(function () { libP = null; });
      }
      workers[lang] = libP.then(async function () {
        var w = await G.Tesseract.createWorker(lang, 1, {
          logger: function (m) { if (V11._log) V11._log(m); }
        });
        await w.setParameters({
          tessedit_pageseg_mode: '6',
          preserve_interword_spaces: '1',
          user_defined_dpi: '300'
        });
        return w;
      });
      workers[lang].catch(function () { delete workers[lang]; });
    }
    return workers[lang];
  }
  function toCanvas(img) {
    var c = doc.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d').putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    return c;
  }
  function linesOf(data) {
    var out = [];
    (data.blocks || []).forEach(function (b) {
      (b.paragraphs || []).forEach(function (p) { (p.lines || []).forEach(function (l) { out.push(l); }); });
    });
    if (!out.length && data.lines) out = data.lines;
    return out;
  }
  V11._io = {
    size: function (page) {
      var vp = page.getViewport({ scale: 1 });
      return { width: vp.width, height: vp.height };
    },
    render: async function (page, rect, scale) {
      var vp = page.getViewport({ scale: scale, offsetX: -rect.x0 * scale, offsetY: -rect.y0 * scale });
      var W = Math.max(1, Math.ceil((rect.x1 - rect.x0) * scale)), H = Math.max(1, Math.ceil((rect.y1 - rect.y0) * scale));
      var c = doc.createElement('canvas');
      c.width = W;
      c.height = H;
      var ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      await page.render({ canvasContext: ctx, viewport: vp, background: 'rgba(255,255,255,1)' }).promise;
      var id = ctx.getImageData(0, 0, W, H);
      c.width = c.height = 0;
      return { width: W, height: H, data: id.data };
    },
    recognize: async function (img, lang) {
      var w = await getWorker(lang);
      var r = await w.recognize(toCanvas(img), {}, { text: true, blocks: true });
      return { lines: linesOf(r.data || {}) };
    },
    picture: function (img) {
      try {
        var c = toCanvas(img), maxW = 1600;
        if (c.width > maxW) {
          var k = maxW / c.width, c2 = doc.createElement('canvas');
          c2.width = maxW;
          c2.height = Math.round(c.height * k);
          c2.getContext('2d').drawImage(c, 0, 0, c2.width, c2.height);
          c = c2;
        }
        return c.toDataURL('image/png');
      } catch (e) { return ''; }
    }
  };

  /* =========================================================
     3. 윤곽선 PDF OCR → v10 형식 결과
     ========================================================= */
  function score(res) {
    var n = 0, cs = 0;
    res.lines.forEach(function (l) {
      (l.words || [l]).forEach(function (wd) {
        var k = (String(wd.text || '').match(/[가-힣A-Za-z0-9]/g) || []).length;
        n += k;
        cs += k * (wd.confidence || 0);
      });
    });
    return { conf: n ? cs / n : 0, n: n, v: n ? (cs / n) * Math.sqrt(n) : 0 };
  }
  var LAT = /^[^가-힣]*[A-Za-z][^가-힣]*$/;
  function hasLatin(res) {
    return res.lines.some(function (l) { return (l.words || []).some(function (w) { return LAT.test(String(w.text || '')); }); });
  }
  function ovl(a, b) {
    var ix = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), iy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ix <= 0 || iy <= 0) return 0;
    return ix / Math.max(1, Math.min(a.x1 - a.x0, b.x1 - b.x0));
  }
  /* res의 영문 단어 자리에 res2(한글 전용)가 한글로 읽은 단어가 있으면 바꿔 넣음 · 진짜 영문(PEG-40 · 영문명)은 그대로 */
  function fixLatin(res, res2) {
    var w2 = [];
    res2.lines.forEach(function (l) { (l.words || []).forEach(function (w) { if (w.bbox) w2.push(w); }); });
    res.lines.forEach(function (l) {
      var out = [];
      (l.words || []).forEach(function (w) {
        var t = String(w.text || '');
        if (!LAT.test(t) || !w.bbox) { out.push(w); return; }
        var cand = w2.filter(function (k) { return !k._used && ovl(w.bbox, k.bbox) > 0.5; });
        var ko = cand.filter(function (k) { return /[가-힣]/.test(String(k.text || '')); });
        var hang = ko.reduce(function (a, k) { return a + (String(k.text).match(/[가-힣]/g) || []).length; }, 0);
        var lat = (t.match(/[A-Za-z]/g) || []).length;
        var keep = (w.confidence || 0) >= 85 || (/\d/.test(t) && (w.confidence || 0) >= 50);
        if (!keep && ko.length && hang >= Math.max(1, lat * 0.4)) {
          cand.sort(function (a, b) { return a.bbox.x0 - b.bbox.x0; });
          cand.forEach(function (k) { k._used = true; out.push(k); });
        } else out.push(w);
      });
      l.words = out;
    });
  }
  async function ocrBox(io, page, box) {
    var pad = Math.max(2, box.lh * 0.4);
    var rect = { x0: Math.max(0, box.x0 - pad), y0: Math.max(0, box.y0 - pad), x1: box.x1 + pad, y1: box.y1 + pad };
    var bw = rect.x1 - rect.x0, bh = rect.y1 - rect.y0;
    var scale = clamp(OPT.targetPx / Math.max(box.lh, 0.5), OPT.minScale, OPT.maxScale);
    if (bw * bh * scale * scale > OPT.maxPixels) scale = Math.max(1.5, Math.sqrt(OPT.maxPixels / (bw * bh)));
    var raw = await io.render(page, rect, scale);
    var bin = binarize(raw, 12);
    raw = null;
    var order = box.tall ? [90, 270, 0] : [0, 180];
    var best = null;
    for (var i = 0; i < order.length; i++) {
      var res = await io.recognize(rotate(bin, order[i]));
      var sc = score(res);
      if (!best || sc.v > best.sc.v) best = { r: order[i], res: res, sc: sc };
      if (sc.conf >= 90 && sc.n >= 2) break;
    }
    /* 한글을 영문으로 잘못 읽은 단어("[MAE]" 등)는 한글 전용으로 다시 읽어 바꿈 */
    if (OPT.lang2 && hasLatin(best.res)) {
      var res2 = await io.recognize(rotate(bin, best.r), OPT.lang2);
      fixLatin(best.res, res2);
    }
    return { rect: rect, scale: scale, bin: bin, best: best, pad: 12 };
  }
  /* OCR 한 덩어리 → 줄 목록 [{s, h, conf}] (한글 음절 다시 붙이기 · 덩어리 밖 글자 제외) */
  function linesFrom(o, box) {
    var r = o.best.r, w = o.bin.width, h = o.bin.height, s = o.scale, out = [];
    function toPage(X, Y) {
      var p = unrotPt(X, Y, r, w, h);
      return [(p[0] - o.pad) / s + o.rect.x0, (p[1] - o.pad) / s + o.rect.y0];
    }
    o.best.res.lines.forEach(function (l) {
      var lb = l.bbox || { x0: 0, y0: 0, x1: 0, y1: 0 }, LH = Math.max(1, lb.y1 - lb.y0);
      /* 신뢰도가 낮아도 한글이 들어 있는 단어는 남김 (드문 글자 '듐 · 헥'일수록 신뢰도가 낮게 나옴 → 사전 보정) */
      var ws = (l.words && l.words.length ? l.words : [l]).filter(function (wd) {
        var t = String(wd.text || '').trim();
        return t && ((wd.confidence || 0) >= OPT.minConf || /[가-힣]/.test(t));
      });
      if (!ws.length) return;
      var lc = ws.reduce(function (a, wd) { return a + (wd.confidence || 0); }, 0) / ws.length;
      if (lc < 45 && ws.length < 3) return;
      var merged = [];
      ws.forEach(function (wd) {
        var b = wd.bbox || lb, t = String(wd.text).trim(), P = merged[merged.length - 1];
        if (P) {
          var gap = b.x0 - P.b.x1;
          var joinable = (/[가-힣\])(\/\-]$/.test(P.t) && /^[가-힣\[(\/\-]/.test(t)) || /^[,.)\]:]/.test(t);
          if (joinable && gap < LH * OPT.joinGap) {
            P.t += t;
            P.b.x1 = b.x1;
            P.c = Math.min(P.c, wd.confidence || 0);
            return;
          }
        }
        merged.push({ t: t, b: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 }, c: wd.confidence || 0 });
      });
      merged = merged.filter(function (m) {
        if (!GOOD.test(m.t) && !/^[,.:;()\[\]\/\-]+$/.test(m.t)) return false;
        var cA = toPage((m.b.x0 + m.b.x1) / 2, (m.b.y0 + m.b.y1) / 2);
        return !box || (cA[0] >= box.x0 - 1 && cA[0] <= box.x1 + 1 && cA[1] >= box.y0 - 1 && cA[1] <= box.y1 + 1);
      });
      if (!merged.length) return;
      out.push({
        s: normLine(merged.map(function (m) { return m.t; }).join(' ')),
        h: LH / s,
        conf: merged.reduce(function (a, m) { return a + m.c; }, 0) / merged.length
      });
    });
    return out;
  }
  /* OCR 줄 다듬기: 대괄호 안 띄어쓰기 · 한 글자씩 띄운 한글 · 단위 오인식 */
  function normLine(t) {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    t = t.replace(/\[\s*([^\]]{1,30}?)\s*\]/g, function (m, g) { return '[' + g.replace(/\s+/g, '') + ']'; });
    t = t.replace(/^([가-힣\s]{2,24})\]/, function (m, g) { return '[' + g.replace(/\s+/g, '') + ']'; });
    var tk = t.split(' '), res = [], run = [];
    function flush() {
      if (run.length >= 2) res.push(run.join(''));
      else if (run.length) res.push(run[0]);
      run = [];
    }
    tk.forEach(function (x) {
      if (/^[가-힣]$/.test(x)) run.push(x);
      else { flush(); res.push(x); }
    });
    flush();
    t = res.join(' ');
    t = t.replace(/(\d)\s?m[l1I|!]?(?=[\s\/,)\]]|$)/g, '$1ml');
    t = t.replace(/\(\s*주\s*\)/g, '(주)').replace(/\s+([,.])/g, '$1').replace(/,(?=[^\s\d])/g, ', ');
    return t.trim();
  }
  V11.ocrPdf = async function (pdf, opt) {
    opt = opt || {};
    var io = opt.io || V11._io, prog = opt.onProgress || function () {};
    var pages = [], texts = [], pics = [], t0 = Date.now(), confs = [];
    var np = Math.min(pdf.numPages, OPT.maxPages);
    for (var p = 1; p <= np; p++) {
      var page = await pdf.getPage(p);
      var sz = io.size(page);
      var s0 = clamp(1800 / Math.max(sz.width, sz.height), 1, 3);
      prog({ phase: 'layout', page: p, pages: np });
      var low = await io.render(page, { x0: 0, y0: 0, x1: sz.width, y1: sz.height }, s0);
      var boxes = segment(low, s0).slice(0, OPT.maxBlocks);
      low = null;
      var blocks = [];
      for (var b = 0; b < boxes.length; b++) {
        prog({ phase: 'ocr', page: p, pages: np, block: b + 1, blocks: boxes.length });
        var o = await ocrBox(io, page, boxes[b]);
        var ls = linesFrom(o, boxes[b]);
        if (!ls.length) continue;
        ls.forEach(function (l) { confs.push(l.conf); });
        var bt = ls.map(function (l) { return l.s; }).join('\n');
        blocks.push({ k: 0, x0: boxes[b].x0, x1: boxes[b].x1, y0: boxes[b].y0, lines: ls, text: bt });
        if (io.picture && /(전성분|ingredients?)/i.test(bt.replace(/\s+/g, ''))) {
          pics.push({ page: p, src: io.picture(o.best.r ? rotate(o.bin, o.best.r) : o.bin) });
        }
        o = null;
      }
      var text = blocks.map(function (x) { return x.text; }).join('\n\n');
      pages.push({ blocks: blocks, text: text, boxes: boxes.length });
      texts.push(text);
    }
    var all = texts.join('\n\n');
    return {
      pdf: pdf,
      pages: pages,
      text: all,
      stats: V10.stats ? V10.stats(all) : { good: all.length },
      ocr: true,
      conf: confs.length ? Math.round(confs.reduce(function (a, c) { return a + c; }, 0) / confs.length) : 0,
      pictures: pics,
      ms: Date.now() - t0
    };
  };
  V11._t = { fixLatin: fixLatin, segment: segment, binarize: binarize, rotate: rotate, unrotPt: unrotPt, ocrBox: ocrBox, linesFrom: linesFrom, normLine: normLine };

  /* =========================================================
     4. 전성분 비교
     ========================================================= */
  var BASE_DICT = '1,2-헥산다이올|3-O-에틸아스코빅애씨드|C12-15알킬벤조에이트|C13-14아이소파라핀|PEG-100스테아레이트|PEG-40하이드로제네이티드캐스터오일|PEG-60하이드로제네이티드캐스터오일|sh-올리고펩타이드-1|갈락토미세스발효여과물|감국꽃추출물|감자추출물|감초뿌리추출물|개똥쑥추출물|구아검|구아하이드록시프로필트라이모늄클로라이드|귀리추출물|글라이신|글라이콜디스테아레이트|글라이콜릭애씨드|글루코노락톤|글루코오스|글루타믹애씨드|글루타치온|글리세린|글리세릴스테아레이트|글리세릴스테아레이트에스이|글리세릴카프릴레이트|꿀추출물|나이아신아마이드|나일론-12|네오펜틸글라이콜다이헵타노에이트|노나펩타이드-1|녹두추출물|녹차추출물|다마스크장미꽃수|다이메티콘|다이메티콘/비닐다이메티콘크로스폴리머|다이메티콘크로스폴리머|다이소듐이디티에이|다이소듐포스페이트|다이에틸아미노하이드록시벤조일헥실벤조에이트|다이카프릴릴카보네이트|다이펩타이드-2|다이프로필렌글라이콜|닥나무추출물|달맞이꽃오일|데실글루코사이드|덱스트린|덱스판테놀|동백나무씨오일|동백나무잎추출물|드로메트리졸트라이실록산|디스테아디모늄헥토라이트|라벤더꽃추출물|라벤더오일|라우레스-23|라우릭애씨드|라우릴글루코사이드|라우릴하이드록시설타인|라이소레시틴|라이신|락토바실러스발효물|락토바이오닉애씨드|락틱애씨드|레몬열매추출물|레스베라트롤|레시틴|레티놀|레티닐팔미테이트|로열젤리추출물|로즈마리잎추출물|로즈힙열매오일|류신|리날룰|리모넨|리보플라빈|마그네슘설페이트|마그네슘아스코빌포스페이트|마그네슘알루미늄실리케이트|마데카소사이드|마데카식애씨드|마이카|마이크로크리스탈린셀룰로오스|마이크로크리스탈린왁스|마카다미아씨오일|만니톨|만델릭애씨드|말토덱스트린|망고씨버터|메티오닌|메틸렌비스-벤조트라이아졸릴테트라메틸부틸페놀|메틸파라벤|멘톨|모란뿌리추출물|미네랄오일|미리스틱애씨드|바쿠치올|발린|베타-글루칸|베타인|베헤닐알코올|베헨트리모늄클로라이드|벤질벤조에이트|벤질살리실레이트|벤질알코올|벤토나이트|변성알코올|병풀잎추출물|병풀추출물|보론나이트라이드|부티로스퍼멈파키이씨드버터|부틸렌글라이콜|부틸하이드록시톨루엔|블루베리열매추출물|비스-에틸헥실옥시페놀메톡시페닐트리아진|비오틴|비즈왁스|비피다발효용해물|사이클로덱스트린|사이클로펜타실록산|사이클로헥사실록산|사카로마이세스발효여과물|살리실릭애씨드|석류열매추출물|세라마이드에이에스|세라마이드에이피|세라마이드엔에스|세라마이드엔지|세라마이드엔피|세라마이드이오피|세레신|세린|세테스-20|세테아릴글루코사이드|세테아릴알코올|세테아릴올리베이트|세트리모늄클로라이드|세틸알코올|세틸에틸헥사노에이트|셀룰로오스|셀룰로오스검|소듐라우레스설페이트|소듐라우로일글루타메이트|소듐라우릴설페이트|소듐락테이트|소듐메타비설파이트|소듐메틸코코일타우레이트|소듐벤조에이트|소듐스테아로일글루타메이트|소듐시트레이트|소듐아세틸레이티드하이알루로네이트|소듐아스코빌포스페이트|소듐알지네이트|소듐코코일글리시네이트|소듐코코일이세티오네이트|소듐클로라이드|소듐포스페이트|소듐폴리글루타메이트|소듐폴리아크릴레이트|소듐피씨에이|소듐하이드록사이드|소듐하이알루로네이트|소비톨|솔비탄세스퀴올리에이트|솔비탄스테아레이트|솔비탄올리베이트|쇠비름추출물|수크로오스|스위트아몬드오일|스쿠알란|스쿠알렌|스테아랄코늄헥토라이트|스테아레스-2|스테아레스-21|스테아릭애씨드|스테아릴알코올|시스테인|시아노코발아민|시어버터|시트랄|시트로넬올|시트릭애씨드|실리카|쌀겨추출물|쌀추출물|쑥잎추출물|쑥추출물|아데노신|아라키딜글루코사이드|아라키딜알코올|아르간커넬오일|아르기닌|아모다이메티콘|아미노메틸프로판올|아보카도오일|아사이팜열매추출물|아세틸테트라펩타이드-2|아세틸헥사펩타이드-8|아스코빅애씨드|아스코빌글루코사이드|아스코빌팔미테이트|아스파틱애씨드|아시아티코사이드|아시아틱애씨드|아이소유제놀|아이소프로필알코올|아젤라익애씨드|아크릴레이트/C10-30알킬아크릴레이트크로스폴리머|알라닌|알란토인|알로에바바덴시스잎즙|알로에베라잎추출물|알루미나|알루미늄하이드록사이드|알부틴|알지닌|알파-비사보롤|암모늄라우릴설페이트|암모늄아크릴로일다이메틸타우레이트/브이피코폴리머|약모밀추출물|어성초추출물|에르고티오네인|에리스리톨|에칠아스코빌에텔|에탄올|에틸헥실글리세린|에틸헥실메톡시신나메이트|에틸헥실살리실레이트|에틸헥실트라이아존|에틸헥실팔미테이트|엑토인|연꽃추출물|엽산|오렌지열매추출물|오이열매추출물|오조케라이트|옥토크릴렌|올레익애씨드|올리고펩타이드-1|올리브열매오일|우레아|울트라마린|위치하젤추출물|유비퀴논|유용성감초추출물|유자열매추출물|유제놀|유칼립투스잎추출물|이노시톨|이디티에이|이소노닐이소노나노에이트|이소도데칸|이소류신|이소프로필미리스테이트|이소프로필팔미테이트|이소헥사데칸|인삼뿌리추출물|인삼추출물|자몽열매추출물|자일리톨|작약뿌리추출물|잔탄검|장미꽃추출물|저먼캐모마일꽃추출물|적색산화철|정제수|제라니올|젤란검|징크글루코네이트|징크옥사이드|징크피씨에이|차나무잎추출물|카나우바왁스|카라기난|카르니틴|카멜리아재포니카씨오일|카모마일꽃추출물|카보머|카올린|카퍼글루코네이트|카퍼트라이펩타이드-1|카페인|카프릴릭/카프릭트라이글리세라이드|카프릴릴글라이콜|카프릴릴메티콘|칸델릴라왁스|칼슘카보네이트|캐모마일꽃추출물|캠퍼|코카마이드엠이에이|코카미도프로필베타인|코코-글루코사이드|코코-카프릴레이트/카프레이트|코코넛오일|콜레스테롤|콩추출물|쿠마린|클로페네신|타이로신|탤크|토마토추출물|토코페롤|토코페릴아세테이트|트라넥사믹애씨드|트라이메틸실록시실리케이트|트라이에탄올아민|트라이에톡시카프릴릴실레인|트라이펩타이드-1|트레오닌|트레할로스|트로메타민|티타늄디옥사이드|티트리잎오일|파네솔|파라핀|판테놀|팔미토일테트라펩타이드-7|팔미토일트라이펩타이드-1|팔미토일펜타펩타이드-4|팔미틱애씨드|페녹시에탄올|페닐알라닌|페닐트라이메티콘|페트롤라툼|페퍼민트잎추출물|펜타펩타이드-18|펜틸렌글라이콜|포도씨오일|포타슘세틸포스페이트|포타슘소르베이트|포타슘하이드록사이드|폴리글루타믹애씨드|폴리글리세릴-10라우레이트|폴리글리세릴-10스테아레이트|폴리글리세릴-3메틸글루코오스다이스테아레이트|폴리메틸메타크릴레이트|폴리솔베이트20|폴리솔베이트60|폴리솔베이트80|폴리실리콘-15|폴리아크릴레이트-13|폴리아크릴아마이드|폴리에톡실레이티드레틴아마이드|폴리쿼터늄-10|폴리쿼터늄-51|폴리쿼터늄-7|프럭토오스|프로판다이올|프로판다이올다이카프릴레이트|프로폴리스추출물|프로필렌글라이콜|프로필렌카보네이트|프로필파라벤|프롤린|피리독신|피이지-100스테아레이트|피이지-40하이드로제네이티드캐스터오일|피이지-60하이드로제네이티드캐스터오일|피토스테롤|피토스핑고신|하마멜리스버지니아나잎추출물|하이드로제네이티드레시틴|하이드로제네이티드폴리데센|하이드로제네이티드폴리아이소부텐|하이드록시아세토페논|하이드록시에틸셀룰로오스|하이드록시에틸아크릴레이트/소듐아크릴로일다이메틸타우레이트코폴리머|하이드록시에틸우레아|하이드록시프로필메틸셀룰로오스|하이드롤라이즈드실크|하이드롤라이즈드엘라스틴|하이드롤라이즈드콜라겐|하이드롤라이즈드하이알루로닉애씨드|하이알루로네이트크로스폴리머|하이알루로닉애씨드|해바라기씨오일|향료|헥사펩타이드-9|헥실신남알|호모살레이트|호호바씨오일|홍삼추출물|황금추출물|황색산화철|효모추출물|흑색산화철|히스티딘'.split('|');
  var LS_LEARN = 'v11_inci_learned', LS_USER = 'v11_inci_user';
  function lsGet(k) {
    try { return JSON.parse(G.localStorage.getItem(k) || '[]'); } catch (e) { return []; }
  }
  function lsSet(k, v) {
    try { G.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 불가 */ }
  }
  function keyOf(s) {
    return String(s || '').normalize('NFC')
      .replace(/[\s\u00A0]+/g, '')
      .replace(/[‐‑‒–—―−]/g, '-')
      .replace(/（/g, '(').replace(/）/g, ')').replace(/，/g, ',')
      .replace(/[.。·]+$/g, '')
      .toLowerCase();
  }
  var dictCache = null;
  function dict() {
    if (dictCache) return dictCache;
    var m = {};
    BASE_DICT.concat(lsGet(LS_LEARN), lsGet(LS_USER)).forEach(function (w) {
      w = str(w);
      if (w && w.length <= 80) m[keyOf(w)] = w;
    });
    dictCache = { map: m, list: Object.keys(m) };
    return dictCache;
  }
  function learn(list) {
    var cur = lsGet(LS_LEARN), seen = {};
    cur.forEach(function (w) { seen[keyOf(w)] = 1; });
    (list || []).forEach(function (w) {
      w = str(w);
      if (!w || w.length > 80 || seen[keyOf(w)] || BASE_DICT.indexOf(w) >= 0) return;
      seen[keyOf(w)] = 1;
      cur.push(w);
    });
    lsSet(LS_LEARN, cur.slice(-5000));
    dictCache = null;
  }
  V11.learn = learn;
  V11.loadDictText = function (text) {
    var list = String(text || '').split(/[\r\n]+|[\t;]|,(?!\d)/).map(function (s) { return s.replace(/^["']|["']$/g, '').trim(); })
      .filter(function (s) { return s && /[가-힣]/.test(s) && s.length <= 80; });
    var cur = lsGet(LS_USER), seen = {}, n = 0;
    cur.forEach(function (w) { seen[keyOf(w)] = 1; });
    list.forEach(function (w) { if (!seen[keyOf(w)]) { seen[keyOf(w)] = 1; cur.push(w); n++; } });
    lsSet(LS_USER, cur);
    dictCache = null;
    return n;
  };
  V11.dictSize = function () { return dict().list.length; };

  function jamo(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c >= 0xAC00 && c <= 0xD7A3) {
        var k = c - 0xAC00;
        out += String.fromCharCode(0x1100 + ((k / 588) | 0), 0x1161 + (((k % 588) / 28) | 0));
        if (k % 28) out += String.fromCharCode(0x11A7 + (k % 28));
      } else out += s.charAt(i);
    }
    return out;
  }
  function lev(a, b) {
    if (a === b) return 0;
    var n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    var prev = new Array(m + 1), cur = new Array(m + 1);
    for (var j = 0; j <= m; j++) prev[j] = j;
    for (var i = 1; i <= n; i++) {
      cur[0] = i;
      for (j = 1; j <= m; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1));
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[m];
  }
  var jcache = {};
  function J(k) { return jcache[k] || (jcache[k] = jamo(k)); }
  /* 한글 뼈대: 숫자 · 영문 · 기호를 뺀 한글만 (OCR이 'PEG-' '1,2-'를 자주 놓치므로 따로 비교) */
  function skel(k) { var h = String(k).replace(/[^가-힣]/g, ''); return h.length >= 2 ? h : ''; }
  function jsim(x, y) {
    if (x === y) return 1;
    var a = J(x), b = J(y);
    return 1 - lev(a, b) / Math.max(a.length, b.length, 1);
  }
  function sim(a, b) {
    var ka = keyOf(a), kb = keyOf(b);
    if (ka === kb) return 1;
    var s = jsim(ka, kb), sa = skel(ka), sb = skel(kb);
    if (sa && sb) s = Math.max(s, jsim(sa, sb) * 0.97);
    return s;
  }
  function skelSim(a, b) {
    var sa = skel(keyOf(a)), sb = skel(keyOf(b));
    return sa && sb ? jsim(sa, sb) : 0;
  }
  function digits(s) { return (String(s).match(/\d+/g) || []).join(','); }
  /* b의 숫자 묶음이 a 안에 순서대로 다 들어 있는지 (예: OCR '6 -40' 안에 '40') */
  function digitsIn(a, b) {
    var da = String(a).match(/\d+/g) || [], db = String(b).match(/\d+/g) || [], k = 0;
    if (!db.length) return !da.length;
    for (var i = 0; i < da.length && k < db.length; i++) if (da[i] === db[k]) k++;
    return k === db.length;
  }
  /* OCR 단어 a를 기준 표기 b로 볼 수 있는지 → {st, v, note} 또는 null */
  function judge(a, b) {
    var ss = skelSim(a, b), s = sim(a, b);
    if (s === 1) return { st: 'same', v: b };
    if (ss >= 0.85 || s >= 0.72) {
      if (digits(a) === digits(b) || (digits(b) && digits(a).replace(/,/g, '') === digits(b).replace(/,/g, ''))) return { st: 'fixed', v: b, note: 'OCR "' + a + '" → ' + b };
      if (digitsIn(a, b) && digits(b)) return { st: 'fixed', v: b, note: 'OCR "' + a + '" → ' + b + ' (숫자 앞뒤 잡음 제거)' };
      if (!digits(a) && digits(b)) return { st: 'check', v: b, note: 'OCR에서 숫자/영문이 빠짐 · ' + b + ' 맞는지 확인' };
      return { st: 'check', v: a, note: '숫자가 다름 (기존 ' + b + ')' };
    }
    return null;
  }
  function bestDict(t) {
    var D = dict(), k = keyOf(t);
    if (D.map[k]) return { w: D.map[k], s: 1 };
    var best = null;
    for (var i = 0; i < D.list.length; i++) {
      var dk = D.list[i];
      if (Math.abs(skel(dk).length - skel(k).length) > Math.max(3, k.length * 0.35) && Math.abs(dk.length - k.length) > Math.max(3, k.length * 0.35)) continue;
      var s = sim(k, dk);
      if (!best || s > best.s) best = { w: D.map[dk], s: s };
    }
    return best || { w: '', s: 0 };
  }
  function splitInci(s) {
    s = String(s || '').replace(/^\s*[\[【(]?\s*(전\s*성\s*분(\s*명)?|모든\s*성분|ingredients?)\s*[\]】)]?\s*[:：]?\s*/i, '');
    s = s.replace(/(\d)\s*[,，]\s*(?=\d)/g, '$1\u0001');
    return s.split(/\s*(?:[,，、;]|\.(?!\d))\s*/).map(function (t) {
      return t.replace(/\u0001/g, ',').replace(/^[\s\-–·•*]+|[\s.·*]+$/g, '').replace(/([가-힣])\s+(?=[가-힣])/g, '$1').trim();
    }).filter(function (t) { return t && GOOD.test(t); });
  }
  V11.splitInci = splitInci;
  /* OCR이 쉼표를 놓쳐 두 성분이 붙은 경우 나누기 ("나이아신아마이드 12-한다이올") */
  function splitMerged(list) {
    var D = dict(), out = [];
    list.forEach(function (t) {
      var k = keyOf(t);
      if (D.map[k] || t.length < 5) { out.push(t); return; }
      var whole = bestDict(t).s, best = null, sp = [];
      t.replace(/\s+/g, function (m, i) { sp.push([i, i + m.length]); return m; });
      sp.forEach(function (p) {
        var a = t.slice(0, p[0]).trim(), b = t.slice(p[1]).trim(), da = bestDict(a), db = bestDict(b);
        var s = Math.min(da.s, db.s);
        if (s >= 0.75 && (!best || s > best.s)) best = { a: a, b: b, s: s };
      });
      if (!best) {
        for (var i = 2; i <= t.length - 2; i++) {
          var a2 = t.slice(0, i), b2 = t.slice(i);
          if (!/[가-힣]$/.test(a2) || !/^[가-힣0-9A-Za-z]/.test(b2)) continue;
          var x = bestDict(a2), y = bestDict(b2), s2 = Math.min(x.s, y.s);
          if ((x.s === 1 || y.s === 1) && s2 >= 0.85 && (!best || s2 > best.s)) best = { a: a2, b: b2, s: s2 };
        }
      }
      if (best && best.s > whole) splitMerged([best.a]).concat(splitMerged([best.b])).forEach(function (z) { out.push(z); });
      else out.push(t);
    });
    return out;
  }

  /* ocrText: 최종본 OCR 전성분 · baseText: 기준 전성분 (없으면 '') */
  V11.compareInci = function (ocrText, baseText) {
    var A = splitMerged(splitInci(ocrText)), B = splitInci(baseText), n = A.length, m = B.length, D = dict();
    var rows = [], i, j;
    if (!m) {
      A.forEach(function (a) {
        var d = bestDict(a), jd = d.s >= 0.82 ? judge(a, d.w) : null;
        if (d.s === 1) rows.push({ st: 'same', v: d.w, ocr: a });
        else if (jd) rows.push({ st: jd.st, v: jd.v, ocr: a, note: jd.note + ' (사전)' });
        else rows.push({ st: 'unknown', v: a, ocr: a, hint: d.s >= 0.6 ? d.w : '' });
      });
      return finish(rows, false);
    }
    var S = [];
    for (i = 0; i < n; i++) {
      S.push([]);
      for (j = 0; j < m; j++) S[i].push(sim(A[i], B[j]));
    }
    function gain(s) { return s >= 0.55 ? (s - 0.5) * 2 + (s === 1 ? 0.5 : 0) : -1e9; }
    var dp = [];
    for (i = 0; i <= n; i++) dp.push(new Float64Array(m + 1));
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1] + gain(S[i - 1][j - 1]));
      }
    }
    var pairA = new Array(n).fill(-1), pairB = new Array(m).fill(-1);
    i = n; j = m;
    while (i > 0 && j > 0) {
      var g = gain(S[i - 1][j - 1]);
      if (g > -1e8 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + g)) < 1e-9) { pairA[i - 1] = j - 1; pairB[j - 1] = i - 1; i--; j--; }
      else if (dp[i][j] === dp[i - 1][j]) i--;
      else j--;
    }
    var movedA = {}, movedB = {};
    for (i = 0; i < n; i++) {
      if (pairA[i] >= 0) continue;
      var bj = -1, bs = 0;
      for (j = 0; j < m; j++) {
        if (pairB[j] >= 0 || movedB[j] != null) continue;
        if (S[i][j] > bs) { bs = S[i][j]; bj = j; }
      }
      if (bj >= 0 && bs >= 0.75) { movedA[i] = bj; movedB[bj] = i; }
    }
    for (i = 0; i < n; i++) {
      var a = A[i];
      if (movedA[i] != null) {
        var jm = judge(a, B[movedA[i]]) || { st: 'check', v: a };
        rows.push({ st: 'moved', v: jm.v, ocr: a, base: B[movedA[i]], note: '기존 ' + (movedA[i] + 1) + '번째 → ' + (i + 1) + '번째' + (jm.st === 'check' ? ' · ' + (jm.note || '표기 확인') : ''), warn: jm.st === 'check' });
        continue;
      }
      var pj = pairA[i];
      if (pj < 0) {
        var d = bestDict(a);
        var ja = d.s >= 0.82 ? judge(a, d.w) : null;
        if (d.s === 1) rows.push({ st: 'added', v: d.w, ocr: a, note: '기준에 없던 성분' });
        else if (ja && ja.st === 'fixed') rows.push({ st: 'added', v: ja.v, ocr: a, note: '기준에 없던 성분 · ' + ja.note + ' (사전)' });
        else rows.push({ st: 'unknown', v: a, ocr: a, hint: d.s >= 0.6 ? d.w : '', note: '기준에 없고 사전에도 없음' });
        continue;
      }
      var b = B[pj];
      /* OCR 결과가 기준과 다른 '실제 성분명'과 정확히 같으면 = 성분 변경 (OCR 보정으로 덮지 않음) */
      if (D.map[keyOf(a)] && keyOf(a) !== keyOf(b)) { rows.push({ st: 'changed', v: D.map[keyOf(a)], ocr: a, base: b, note: '기존 ' + b + ' → 변경' }); continue; }
      var jp = judge(a, b);
      if (jp && jp.st !== 'same') {
        var alt = bestDict(a);
        if (alt.w && keyOf(alt.w) !== keyOf(b) && alt.s > sim(a, b) + 0.04) {
          rows.push({ st: 'check', v: a, ocr: a, base: b, hint: alt.w, note: '기존 ' + b + '보다 ' + alt.w + '에 더 가까움 · 성분이 바뀌었는지 확인' });
          continue;
        }
      }
      if (jp) { rows.push({ st: jp.st, v: jp.v, ocr: a, base: b, note: jp.note }); continue; }
      var d2 = bestDict(a), j2 = d2.s >= 0.82 ? judge(a, d2.w) : null;
      if (j2 && j2.st === 'fixed') rows.push({ st: 'changed', v: j2.v, ocr: a, base: b, note: '기존 ' + b + ' → 변경 · ' + j2.note });
      else rows.push({ st: 'check', v: a, ocr: a, base: b, note: '기존 ' + b + '와 다름', hint: d2.s >= 0.6 ? d2.w : '' });
    }
    var dels = [];
    for (j = 0; j < m; j++) {
      if (pairB[j] >= 0 || movedB[j] != null) continue;
      var after = -1;
      for (var q = j - 1; q >= 0; q--) { if (pairB[q] >= 0) { after = pairB[q]; break; } }
      dels.push({ at: after, row: { st: 'removed', v: '', ocr: '', base: B[j], note: '최종본에 없음' } });
    }
    var outRows = [];
    dels.filter(function (x) { return x.at < 0; }).forEach(function (x) { outRows.push(x.row); });
    rows.forEach(function (r, k) {
      outRows.push(r);
      dels.filter(function (x) { return x.at === k; }).forEach(function (x) { outRows.push(x.row); });
    });
    return finish(outRows, true);
  };
  function finish(rows, hasBase) {
    var c = { same: 0, fixed: 0, added: 0, removed: 0, moved: 0, changed: 0, check: 0, unknown: 0 };
    rows.forEach(function (r) { c[r.st]++; });
    var list = rows.filter(function (r) { return r.st !== 'removed'; }).map(function (r) { return r.v; });
    var warn = rows.filter(function (r) { return r.warn; }).length;
    return { rows: rows, count: c, hasBase: hasBase, list: list, text: list.join(', '), review: c.check + c.unknown + warn, diff: c.added + c.removed + c.moved + c.changed };
  }

  /* =========================================================
     5. 화면 — 전성분 비교 패널 (v10 단상자 결과 아래)
     ========================================================= */
  var STL = {
    same: ['s', '같음'],
    fixed: ['f', 'OCR 보정'],
    added: ['a', '추가'],
    removed: ['r', '삭제'],
    moved: ['m', '순서 변경'],
    changed: ['a', '변경'],
    check: ['c', '확인 필요'],
    unknown: ['c', '사전에 없음']
  };
  var CSS = '' +
    '.v11-box{margin-top:10px;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#fff;font-size:13px}' +
    '.v11-box h4{margin:0 0 6px;font-size:14px}' +
    '.v11-sum{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}' +
    '.v11-sum span{padding:1px 7px;border-radius:4px;background:#f3f4f6;font-size:12px}' +
    '.v11-chips{line-height:2;margin:6px 0}' +
    '.v11-t{display:inline;padding:1px 4px;border-radius:3px}' +
    '.v11-t.f{background:#eef2ff;color:#3730a3}' +
    '.v11-t.a{background:#fee2e2;color:#991b1b;font-weight:600}' +
    '.v11-t.r{background:#fee2e2;color:#991b1b;text-decoration:line-through}' +
    '.v11-t.m{background:#ffedd5;color:#9a3412}' +
    '.v11-t.c{background:#fef3c7;color:#92400e;font-weight:600}' +
    '.v11-box table{width:100%;border-collapse:collapse;margin-top:4px}' +
    '.v11-box td,.v11-box th{border-top:1px solid #f1f5f9;padding:4px 6px;text-align:left;vertical-align:top;font-size:12px}' +
    '.v11-box th{color:#6b7280;font-weight:500}' +
    '.v11-box textarea{width:100%;box-sizing:border-box;min-height:64px;font-size:12px;padding:6px;border:1px solid #d1d5db;border-radius:6px}' +
    '.v11-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}' +
    '.v11-btn{font-size:12px;border:1px solid #d1d5db;background:#fff;border-radius:4px;padding:3px 8px;cursor:pointer}' +
    '.v11-btn.p{background:#2563eb;border-color:#2563eb;color:#fff}' +
    '.v11-pic{max-height:260px;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;margin-top:6px}' +
    '.v11-pic img{display:block;width:100%}' +
    '.v11-muted{color:#6b7280;font-size:12px;line-height:1.5}';
  function addCss() {
    if (!doc || doc.getElementById('v11Css')) return;
    var s = doc.createElement('style');
    s.id = 'v11Css';
    s.textContent = CSS;
    doc.head.appendChild(s);
  }
  function setField(id, v) {
    var el = doc.getElementById(id);
    if (!el) return false;
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  /* slot: 패널을 넣을 요소 · S: { data(inciOcr 포함), r(OCR 결과), base } · onFill(text) */
  V11.mountInci = function (slot, S, onFill) {
    addCss();
    var ocrInci = S.data.inciOcr || '', base = S.base || '';
    var box = doc.createElement('div');
    box.className = 'v11-box';
    slot.innerHTML = '';
    slot.appendChild(box);
    var cmp;
    function draw() {
      var c = cmp.count;
      var sum = cmp.hasBase
        ? ['같음 ' + c.same, 'OCR 보정 ' + c.fixed, '추가·변경 ' + (c.added + c.changed), '삭제 ' + c.removed, '순서 변경 ' + c.moved, '확인 필요 ' + cmp.review]
        : ['사전 일치 ' + c.same, '사전 보정 ' + c.fixed, '사전에 없음 ' + c.unknown];
      var chips = cmp.rows.map(function (r) {
        var t = STL[r.st];
        var tip = [t[1], r.note || '', r.hint ? '비슷한 성분: ' + r.hint : ''].filter(Boolean).join(' · ');
        return '<span class="v11-t ' + t[0] + '" title="' + esc(tip) + '">' + esc(r.st === 'removed' ? r.base : r.v) + '</span>';
      }).join(', ');
      var flagged = cmp.rows.filter(function (r) { return r.st !== 'same'; });
      var table = flagged.length ? '<table><tr><th>상태</th><th>채울 값</th><th>최종본 OCR 원문</th><th>기준</th><th>메모</th></tr>' +
        flagged.map(function (r) {
          var t = STL[r.st];
          return '<tr><td><span class="v11-t ' + t[0] + '">' + t[1] + '</span></td><td>' + esc(r.v || '-') + '</td><td>' + esc(r.ocr || '-') +
            '</td><td>' + esc(r.base || '-') + '</td><td>' + esc([r.note, r.hint ? '비슷한 성분: ' + r.hint : ''].filter(Boolean).join(' · ')) + '</td></tr>';
        }).join('') + '</table>' : '<p class="v11-muted">모든 성분이 기준과 같습니다.</p>';
      var pic = ((S.r && S.r.pictures) || [])[0];
      box.innerHTML = '<h4>전성분 확인 · 최종본(윤곽선) OCR ' + (cmp.hasBase ? '↔ 기준 전성분' : '· 성분 사전 보정') + '</h4>' +
        '<p class="v11-muted">' + (cmp.hasBase
          ? '최종본에서 읽은 전성분을 기준 전성분과 성분 단위로 비교했습니다. 빨간색은 실제로 바뀐 성분, 노란색은 OCR이 확실하지 않아 눈으로 확인할 성분입니다. 성분에 마우스를 올리면 이유가 보입니다.'
          : '기준 전성분이 없어 성분 사전으로만 보정했습니다. 노란색 성분은 사전에 없어 OCR 그대로입니다. 아래에 이전 원본 전성분을 넣으면 바뀐 성분만 표시합니다.') + '</p>' +
        '<div class="v11-sum">' + sum.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
        '<div class="v11-chips">' + chips + '</div>' + table +
        (pic && pic.src ? '<details><summary class="v11-muted">최종본 전성분 영역 이미지 (OCR에 쓴 확대 이미지)</summary><div class="v11-pic"><img alt="최종본 전성분 영역" src="' + pic.src + '"></div></details>' : '') +
        '<p class="v11-muted" style="margin-top:8px">채울 전성분 (직접 고칠 수 있습니다)</p>' +
        '<textarea class="v11-out">' + esc(cmp.text) + '</textarea>' +
        '<div class="v11-row"><button type="button" class="v11-btn p" data-a="fill">이 전성분으로 입력칸 채우기</button>' +
        '<span class="v11-muted">확인 필요 ' + cmp.review + '개' + (cmp.review ? ' · 노란색 성분을 이미지와 대조해 주세요' : '') + '</span></div>' +
        '<details' + (cmp.hasBase ? '' : ' open') + '><summary class="v11-muted">비교 기준 전성분 (이전 원본 · 입력템플릿 값)</summary>' +
        '<textarea class="v11-base" placeholder="이전 원본의 전성분을 붙여 넣거나, 글자가 살아 있는 이전 PDF를 올려 주세요">' + esc(base) + '</textarea>' +
        '<div class="v11-row"><button type="button" class="v11-btn" data-a="cmp">다시 비교</button>' +
        '<label class="v11-btn">이전 원본 PDF 올리기<input type="file" accept=".pdf,.ai" hidden data-a="basefile"></label>' +
        '<label class="v11-btn">성분 사전 추가 (txt · csv)<input type="file" accept=".txt,.csv" hidden data-a="dict"></label>' +
        '<span class="v11-muted">성분 사전 ' + V11.dictSize().toLocaleString() + '개</span></div></details>';
    }
    function recompute() { cmp = V11.compareInci(ocrInci, base); draw(); }
    recompute();
    box.addEventListener('click', function (e) {
      var a = e.target && e.target.getAttribute && e.target.getAttribute('data-a');
      if (a === 'fill') {
        var v = str(box.querySelector('.v11-out').value);
        setField('fInci', v);
        var unk = {};
        cmp.rows.forEach(function (r) { if (r.st === 'unknown' || r.st === 'check') unk[r.v] = 1; });
        learn(splitInci(v).filter(function (t) { return !unk[t]; }));
        if (onFill) onFill(v);
      } else if (a === 'cmp') {
        base = str(box.querySelector('.v11-base').value);
        if (base) learn(splitInci(base));
        recompute();
      }
    });
    box.addEventListener('change', async function (e) {
      var t = e.target, a = t && t.getAttribute('data-a'), f = t && t.files && t.files[0];
      if (!f) return;
      try {
        if (a === 'basefile') {
          var r = await V10.readPdf(f);
          if (r.stats.garbled || r.stats.good < 30) throw new Error('이 파일도 글자 정보가 없습니다. 글자가 살아 있는 이전 원본 PDF를 올리거나 전성분을 붙여 넣어 주세요.');
          var inci = V10.parseCarton(r).inci;
          if (!inci) throw new Error('이 파일에서 전성분을 찾지 못했습니다. 전성분을 직접 붙여 넣어 주세요.');
          base = inci;
          learn(splitInci(base));
          recompute();
        } else if (a === 'dict') {
          var n = V11.loadDictText(await f.text());
          recompute();
          if (G.alert) G.alert('성분 사전에 ' + n + '개를 추가했습니다.');
        }
      } catch (err) {
        if (G.alert) G.alert(err && err.message ? err.message : err);
      }
      t.value = '';
    });
    return cmp;
  };
})(typeof window !== 'undefined' ? window : globalThis);
