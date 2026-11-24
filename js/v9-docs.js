/* =========================================================
   v9 — 시험 보고서 · 제조사 자료 자동 추출 + 필수 표기 문구 자동 삽입
   v7-info.js 다음, app.js 앞에서 불러옵니다. (기존 파일은 수정하지 않습니다)
   [입력 화면 · 선택 입력]
   1) 파일 2칸만 보이도록 정리
      - 인체적용시험 결과 보고서 (효능 시험 · 피부자극 시험, 여러 개)
      - 제조사 추가 자료 (원료 스펙 · 함량 · 전성분 · 특허 · 인증 · 사용법 · 사용기한 등)
      - PDF · Word(.docx) · 한글(.hwpx) · Excel(.xlsx) · 이미지 · 텍스트 / 스캔본은 OCR로 읽기
      - 읽은 값은 기존 입력칸(시험명 · 결과 · 기관/기간/인원 · 함량 · 사용법 …)에 자동으로 채움
        (이미 입력된 칸은 덮어쓰지 않고 [바꾸기] 버튼으로 선택)
      - 기존 입력칸은 [추출값 확인 · 직접 입력] 안으로 접어 둠 (id 그대로 → app.js · Word 템플릿 그대로 동작)
   [상세페이지 문안]
   2) 필수 표기 문구(*) 자동 삽입 — 관련 영역 바로 아래 초록 점선 박스
      - 인체적용시험: 시험명 · 시험기관/기간/대상 · 개인차 안내
      - 피부자극시험: 시험기관/기간 · "모든 사람에게 자극이 없다는 의미는 아님" · 개인차 안내
      - 함량(원료 기준) · 기능성 심사(보고) · 원료의 특성에 한함 · 특허 원료 · 비건 인증 · 연출 이미지
      - 생성 문안에 같은 문구가 이미 있으면 넣지 않음
   3) 편집 화면 오른쪽 [필수 표기 점검] — 들어갔는지 / 빠졌는지 표시 · [추가] · [복사]
   4) 상품정보제공고시: v7 통짜 박스 유지 + 제품 유형별 개별 주의사항(팩 · 스크럽) 추가
   ========================================================= */
(function (G) {
  'use strict';
  var C = G.CONFIG, GEN = G.GEN, FILES = G.FILES, LAYOUTS = G.LAYOUTS || {};
  if (!C || !GEN) return;
  var doc = G.document;
  var $ = function (s) { return doc ? doc.querySelector(s) : null; };
  var $$ = function (s) { return doc ? Array.prototype.slice.call(doc.querySelectorAll(s)) : []; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var str = function (s) { return String(s == null ? '' : s).trim(); };
  var one = function (s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); };
  var nz = function (s) { return String(s == null ? '' : s).replace(/[\s*※·,.:：()\[\]「」『』"'“”‘’\-~]/g, '').toLowerCase(); };
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }
  function toast(m, ms) { var t = $('#toast'); if (!t) return; t.textContent = m; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, ms || 2600); }
  var V9 = G.V9 = { cur: null, brand: null, files: [] };

  /* =========================================================
     1. 파일 → 텍스트
     ========================================================= */
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = doc.createElement('script');
      s.src = src;
      s.onload = res;
      s.onerror = function () { rej(new Error('라이브러리를 불러오지 못했습니다 (인터넷 연결 확인)')); };
      doc.head.appendChild(s);
    });
  }
  var pdfReady = null;
  function pdfLib() {
    if (!pdfReady) {
      pdfReady = (G.pdfjsLib ? Promise.resolve() : loadScript(PDFJS + 'pdf.min.js')).then(function () {
        G.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
        return G.pdfjsLib;
      });
    }
    return pdfReady;
  }
  async function pdfOpen(buf) {
    var lib = await pdfLib();
    return lib.getDocument({ data: buf, cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/' }).promise;
  }
  async function pdfText(pdf) {
    var out = [];
    for (var p = 1; p <= pdf.numPages; p++) {
      var pg = await pdf.getPage(p);
      var tc = await pg.getTextContent();
      var lines = [], cur = '', lastY = null, lastEnd = null;
      tc.items.forEach(function (it) {
        if (it.str == null) return;
        var y = it.transform[5], x = it.transform[4];
        if (lastY !== null && Math.abs(y - lastY) > 2.5) { lines.push(cur); cur = ''; lastEnd = null; }
        if (cur && lastEnd !== null && x - lastEnd > 1.5 && !/\s$/.test(cur)) cur += ' ';
        cur += it.str;
        lastY = y; lastEnd = x + (it.width || 0);
        if (it.hasEOL) { lines.push(cur); cur = ''; lastY = null; lastEnd = null; }
      });
      if (cur) lines.push(cur);
      out.push(lines.join('\n'));
    }
    return out.join('\n\n');
  }
  async function pdfCanvases(pdf, max) {
    var n = pdf.numPages, idx = [];
    for (var i = 1; i <= n; i++) idx.push(i);
    if (n > max) idx = idx.slice(0, Math.ceil(max / 2)).concat(idx.slice(n - Math.floor(max / 2)));
    var cs = [];
    for (var k = 0; k < idx.length; k++) {
      var pg = await pdf.getPage(idx[k]);
      var vp = pg.getViewport({ scale: 2 });
      var c = doc.createElement('canvas');
      c.width = vp.width; c.height = vp.height;
      await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      cs.push(c);
    }
    return cs;
  }
  async function ocr(sources, onp) {
    if (!G.Tesseract) await loadScript(TESS);
    var done = 0;
    var w = await G.Tesseract.createWorker('kor+eng', 1, {
      logger: function (m) {
        if (m.status === 'recognizing text' && onp) onp((done + m.progress) / sources.length);
      }
    });
    var out = [];
    for (var i = 0; i < sources.length; i++) {
      var r = await w.recognize(sources[i]);
      out.push(r.data.text);
      done++;
    }
    await w.terminate();
    return out.join('\n\n');
  }
  function xmlText(x) {
    return String(x)
      .replace(/<w:tab\/>|<hp:tab[^>]*\/>/g, '\t')
      .replace(/<\/w:tc>|<\/hp:tc>/g, '\t')
      .replace(/<\/w:p>|<\/hp:p>|<w:br[^>]*\/>|<\/a:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, function (m, n) { return String.fromCharCode(+n); }).replace(/&amp;/g, '&');
  }
  async function zipText(buf, test) {
    var z = await FILES.unzip(buf);
    var dec = new TextDecoder('utf-8');
    var names = z.names.filter(test).sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); });
    var out = [];
    for (var i = 0; i < names.length; i++) { var u = await z.read(names[i]); if (u) out.push(xmlText(dec.decode(u))); }
    return out.join('\n');
  }
  async function xlsxText(buf) {
    var z = await FILES.unzip(buf);
    var dec = new TextDecoder('utf-8');
    var ent = function (s) { return xmlText(s); };
    var ss = [];
    var s = await z.read('xl/sharedStrings.xml');
    if (s) {
      (dec.decode(s).match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
        ss.push(ent((si.match(/<t[^>]*>[\s\S]*?<\/t>/g) || []).join('')));
      });
    }
    var out = [];
    var sheets = z.names.filter(function (n) { return /^xl\/worksheets\/sheet\d+\.xml$/.test(n); }).sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); });
    for (var i = 0; i < sheets.length; i++) {
      var x = dec.decode(await z.read(sheets[i]));
      (x.match(/<row[\s\S]*?<\/row>/g) || []).forEach(function (row) {
        var cells = [];
        var re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, m;
        while ((m = re.exec(row))) {
          var at = m[1] || '', body = m[2] || '', v = '';
          var vm = body.match(/<v>([\s\S]*?)<\/v>/);
          if (/t="s"/.test(at) && vm) v = ss[+vm[1]] || '';
          else if (/t="inlineStr"/.test(at)) v = ent(body);
          else if (vm) v = ent(vm[1]);
          if (str(v)) cells.push(str(v));
        }
        if (cells.length) out.push(cells.join('\t'));
      });
    }
    return out.join('\n');
  }
  // file → { text, scanned, pdf }
  async function readFile(f) {
    var name = f.name || '', ext = (name.split('.').pop() || '').toLowerCase();
    if (/^(png|jpe?g|webp|bmp|gif)$/.test(ext) || /^image\//.test(f.type || '')) return { text: '', scanned: true, image: true };
    var buf = await f.arrayBuffer();
    if (ext === 'pdf') {
      var pdf = await pdfOpen(buf);
      var t = await pdfText(pdf);
      var scanned = (G.V10 && G.V10.isScanned) ? G.V10.isScanned(t, pdf) : t.replace(/\s/g, '').length < 40 * pdf.numPages;
      return { text: t, scanned: scanned, pdf: pdf };
    }
    if (ext === 'docx') return { text: await zipText(buf, function (n) { return /^word\/(document|footnotes|endnotes)\.xml$/.test(n); }) };
    if (ext === 'hwpx') return { text: await zipText(buf, function (n) { return /^Contents\/section\d+\.xml$/i.test(n); }) };
    if (ext === 'xlsx') return { text: await xlsxText(buf) };
    if (/^(txt|csv|md|tsv)$/.test(ext)) return { text: new TextDecoder('utf-8').decode(buf) };
    if (ext === 'hwp') throw new Error('한글(.hwp) 파일은 바로 읽을 수 없습니다. 한글에서 PDF 또는 .hwpx로 저장해 올려 주세요.');
    if (ext === 'doc' || ext === 'xls') throw new Error('예전 형식(.' + ext + ')입니다. .docx / .xlsx / PDF로 저장해 올려 주세요.');
    throw new Error('지원하지 않는 형식입니다 (.' + ext + ')');
  }

  /* =========================================================
     2. 텍스트 → 값 추출
     ========================================================= */
  function prep(t) {
    return String(t || '').replace(/\r/g, '').replace(/\u00a0|\u3000/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  }
  function linesOf(t) { return prep(t).split('\n').map(function (l) { return l.replace(/[ \t]+/g, ' ').trim(); }); }
  // 라벨 다음 값 (같은 줄 또는 다음 줄)
  function field(lines, labelRe, valRe, maxLen) {
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i], m = L.match(labelRe);
      if (!m) continue;
      var rest = L.slice(m.index + m[0].length).replace(/^[\s:：\-|·]+/, '').trim();
      var cands = [rest, lines[i + 1] || '', lines[i + 2] || ''];
      for (var k = 0; k < cands.length; k++) {
        var c = cands[k];
        if (!c) continue;
        if (valRe) { var v = c.match(valRe); if (v) return str(v[1] != null ? v[1] : v[0]); if (k === 0) continue; else break; }
        if (c.length <= (maxLen || 120)) return c;
      }
    }
    return '';
  }
  var D = '(?:(?:19|20)?\\d{2}\\s*[.\\-/년]\\s*)?\\d{1,2}\\s*[.\\-/월]\\s*\\d{1,2}\\s*일?';
  var RANGE = new RegExp('((?:19|20)?\\d{2}\\s*[.\\-/년]\\s*\\d{1,2}\\s*[.\\-/월]\\s*\\d{1,2}\\s*일?)\\s*(?:[~∼〜\\-–—]|부터|to)\\s*(' + D + ')');
  function fmtDate(s, base) {
    var n = String(s).match(/\d+/g) || [];
    var y, m, d;
    if (n.length >= 3) { y = n[0]; m = n[1]; d = n[2]; } else { y = base || ''; m = n[0]; d = n[1]; }
    if (y && y.length === 2) y = '20' + y;
    var p = function (x) { return ('0' + x).slice(-2); };
    return { y: y, t: (y ? y + '.' : '') + p(m) + '.' + p(d) };
  }
  function period(text, lines) {
    var cand = field(lines, /(시험\s*기간|연구\s*기간|시험\s*일정|시험\s*실시\s*기간|평가\s*기간|study\s*period|test\s*period)/i, RANGE);
    var m = cand ? cand.match(RANGE) : null;
    if (!m) {
      var L = lines.find(function (l) { return /(기간|period|일정)/i.test(l) && RANGE.test(l); });
      m = (L || '').match(RANGE) || prep(text).match(RANGE);
    }
    if (!m) return '';
    var a = fmtDate(m[1]), b = fmtDate(m[2], a.y);
    return a.t + ' ~ ' + b.t;
  }
  var ORG_KNOWN = /(한국피부과학연구원|한국피부임상과학연구원|한국피부임상연구센터|한국바이오임상연구센터|한국의류시험연구원|피엔케이피부임상연구센터|P&K\s*피부임상연구센터|P&K|㈜?\s*더마프로|Dermapro|KC\s*피부임상연구센터|씨앤씨인터내셔널|글로벌의학연구센터|엘리드|코리아더마|한국화학융합시험연구원|KTR|한국건설생활환경시험연구원|KCL|인하대학교\s*피부과학연구소|에이씨티|ACT|더마트리|씨엔에스|CNS|제이투케이바이오|코스맥스|한국콜마)/i;
  var ORG_GEN = /((?:\(주\)|㈜|주식회사\s?)?[가-힣A-Za-z&]{2,24}(?:연구원|연구소|연구센터|임상센터|시험센터|센터|Research\s*Institute|Research\s*Center|Laboratory))/;
  function org(text, lines) {
    var v = field(lines, /(시험\s*기관(?:\s*명)?|연구\s*기관(?:\s*명)?|수행\s*기관|시험\s*실시\s*기관|시험\s*수행\s*기관|testing\s*(?:facility|laboratory|institution)|test\s*facility)/i, null, 80);
    var pick = function (s) { var m = String(s || '').match(ORG_KNOWN) || String(s || '').match(ORG_GEN); return m ? one(m[1]) : ''; };
    var r = pick(v) || (v && v.length <= 30 && !/\d{3,}/.test(v) ? v : '');
    if (!r) r = pick(prep(text));
    return r.replace(/^[\s:：]+|[\s,.]+$/g, '');
  }
  function subjects(text, lines) {
    var t = prep(text);
    var n = '';
    var m = t.match(/(?:대상자|피험자|시험\s*대상(?:자)?|참여자|선정\s*대상|최종\s*(?:분석\s*)?대상|subjects?|panel)\s*(?:수|인원)?\s*[:：]?\s*(?:[^\n\d]{0,24})?(\d{1,3})\s*(?:명|인|persons?|subjects?)/i);
    if (m) n = m[1];
    if (!n) { m = t.match(/\bN\s*=\s*(\d{1,3})/); if (m) n = m[1]; }
    if (!n) { m = t.match(/(?:총|성인\s*(?:여성|남성|남녀)?)\s*(\d{1,3})\s*명/); if (m) n = m[1]; }
    var age = t.match(/만?\s*(\d{2})\s*(?:세)?\s*[~∼\-–]\s*(\d{2})\s*세/);
    var sex = t.match(/(성인\s*)?(여성|남성|남녀)/);
    var skin = t.match(/(건성|민감성|지성|복합성|건조한|예민한|민감한)\s*피부/);
    var parts = [];
    if (skin) parts.push(skin[0]);
    if (age) parts.push('만 ' + age[1] + '~' + age[2] + '세');
    if (sex) parts.push((sex[1] ? '성인 ' : '') + sex[2]);
    return { n: n, desc: parts.join(' '), text: (parts.join(' ') + (n ? ' ' + n + '명' : '')).trim() };
  }
  function sentences(s) { return one(s).split(/(?<=[다함음됨임]\.|\.)\s+(?=[가-힣A-Z0-9'"“‘(])/).map(str).filter(Boolean); }
  var CONC_HEAD = /(?:^|\n)[ \t]*(?:\d+(?:\.\d+)*[\.\)]?\s*|[IVX]+\.\s*|[가-하]\.\s*)?(종합\s*결론|최종\s*결론|결론\s*및\s*고찰|결과\s*및\s*결론|시험\s*결론|평가\s*결론|결\s*론|요\s*약|summary|conclusions?)\s*[:：]?[ \t]*/gi;
  var NEXT_HEAD = /\n[ \t]*(?:\d+(?:\.\d+)*[\.\)]?\s*|[IVX]+\.\s*)?(참고\s*문헌|references?|고\s*찰|부\s*록|appendix|시험\s*책임자|연구\s*책임자|책임\s*연구원|서\s*명|첨부|별첨|표\s*\d|그림\s*\d|figure\s*\d|table\s*\d|시험\s*방법|시험\s*재료|\d+\.\s*[가-힣]{2,8}\s*$)/im;
  var GOOD = /(결과|확인|판정|유의|도움|완화|개선|감소|증가|나타|보였|입증|평가되었|것으로)/;
  function conclusion(text) {
    var t = prep(text), m, best = null;
    CONC_HEAD.lastIndex = 0;
    while ((m = CONC_HEAD.exec(t))) {
      var start = m.index + m[0].length;
      var seg = t.slice(start, start + 1400);
      var nx = seg.search(NEXT_HEAD);
      if (nx > 20) seg = seg.slice(0, nx);
      if (/\.{4,}|·{4,}|…{2,}/.test(seg.slice(0, 120))) continue;
      var ss = sentences(seg).filter(function (s) { return s.length >= 12 && s.length <= 400; });
      var good = ss.filter(function (s) { return GOOD.test(s); });
      if (!good.length) continue;
      var isSum = /요\s*약|summary/i.test(m[1]);
      var score = good.length + (isSum ? 0 : 3) + start / t.length;
      if (!best || score >= best.score) best = { score: score, s: good.slice(0, 3).join(' ') };
    }
    if (best) return best.s;
    var all = sentences(t).filter(function (s) { return s.length >= 15 && s.length <= 300 && /(유의|판정되었|도움을\s*주는|것으로\s*(나타|확인|평가)|확인되었)/.test(s); });
    return all.slice(-2).join(' ');
  }
  var PNAME = /^.*?(토너|스킨|크림|세럼|에센스|앰플|마스크|팩|로션|에멀전|밤|봄므|오일|폼|패드|미스트|젤|겔|고마쥬|클렌저)\s*(?:\([^)]*\))?\s*(?:\d+\s*(?:ml|g|매))?\s*(?:의|을\s*통한|를\s*통한|에\s*대한|사용\s*후)\s+/i;
  function clinTitle(text, lines, pname) {
    var v = field(lines, /(시험\s*제목|시험\s*과제\s*명|시험\s*명(?:칭)?|연구\s*제목|연구\s*과제\s*명|과제\s*명|study\s*title|title\s*of\s*(?:the\s*)?study|^title)\s*/i, null, 160);
    if (!v || v.length < 6) {
      var L = lines.find(function (l) { return /인체\s*적용\s*시험/.test(l) && /(완화|개선|도움|보습|감소|증가|효과|효능|평가)/.test(l) && l.length < 140; });
      v = L || '';
    }
    v = one(v).replace(/^["'“‘「『<\[]+|["'”’」』>\]]+$/g, '');
    if (pname) {
      var k = String(pname).replace(/\s+/g, '');
      var flat = v.replace(/\s+/g, '');
      var at = flat.indexOf(k);
      if (at >= 0) {
        var cnt = 0, cut = 0;
        for (var i = 0; i < v.length && cnt < at + k.length; i++) { if (!/\s/.test(v[i])) cnt++; cut = i + 1; }
        v = v.slice(cut).replace(/^\s*(?:\([^)]*\))?\s*(?:의|을\s*통한|를\s*통한|에\s*대한|사용\s*후)?\s*/, '');
      }
    }
    v = v.replace(PNAME, '');
    v = v.replace(/\s*(?:에\s*대한|의|을\s*위한)?\s*인체\s*적용\s*시험\s*(?:결과\s*)?(?:보고서|결과)?\s*$/, '').replace(/\s*(?:평가\s*)?시험\s*$/, '');
    return str(v);
  }
  var IRR_JUDGE = /(no[\s-]*irritan(?:cy|t)|non[\s-]*irritan(?:cy|t)|negligible|slight(?:ly)?[\s-]*irritan(?:cy|t)|mild[\s-]*irritan(?:cy|t)|무자극|저자극|자극\s*없음)/i;
  function irrResult(text, lines) {
    var t = prep(text);
    var c = conclusion(t);
    var ss = sentences(c || '').concat(sentences(t)).filter(function (s) { return /(반응도|irritan|자극)/i.test(s) && /(판정|결과|확인|평가)/.test(s) && s.length < 300; });
    if (ss.length) return ss[0];
    var mean = t.match(/평균\s*(?:피부\s*)?(?:자극\s*)?(?:반응도|점수|지수)[^\d\n]{0,20}(\d+(?:\.\d+)?)/) || t.match(/mean\s*(?:score|irritation\s*index)[^\d\n]{0,20}(\d+(?:\.\d+)?)/i);
    if (!mean) return '';
    var j = t.match(IRR_JUDGE);
    var skin = t.match(/(민감성|건성|지성|복합성|정상)\s*피부/);
    return (skin ? skin[1] + ' 피부 ' : '') + '첩포에 의한 일차 자극 평가 결과, 본 시험 제품의 평균 피부 반응도는 ' + mean[1] + '으로, \'' + (j ? j[1].toLowerCase().replace(/\s+/g, ' ') : 'no irritancy') + '\'로 판정되었다.';
  }
  function kindOf(text) {
    var t = prep(text);
    var cnt = function (re) { return (t.match(re) || []).length; };
    var irr = cnt(/첩포|일차\s*자극|피부\s*자극|자극\s*(?:시험|테스트|평가|지수)|반응도|patch\s*test|irritat/gi);
    var clin = cnt(/인체\s*적용\s*시험|효능\s*평가|유의(?:하게|한|성)|개선|완화|보습|수분\s*(?:량|함유)|경피\s*수분|가려움|탄력|주름|미백|피부결|각질|광채|진피/gi);
    var test = /(피험자|시험\s*책임자|시험\s*기관|대상자|첩포|인체\s*적용\s*시험)/.test(t);
    if (test && irr >= 3 && irr >= clin * 0.5) return 'irr';
    if (test && clin >= 2) return 'clin';
    return 'maker';
  }
  function pctFor(text, names) {
    var t = one(prep(text)), out = [];
    names.forEach(function (nm) {
      var k = String(nm || '').replace(/\(.*?\)/g, '').replace(/\s+/g, '');
      if (k.length < 2) return;
      var pat = k.split('').map(function (ch) { return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('\\s*');
      var re = new RegExp(pat + '(?:\\s*\\([^)]{0,40}\\))?\\s*[:：]?\\s*(?:함량\\s*)?(\\d+(?:\\.\\d+)?)\\s*(%|ppm)', 'i');
      var m = t.match(re);
      if (m && parseFloat(m[1]) > 0 && parseFloat(m[1]) <= 100) out.push({ k: k, pct: m[1] + m[2] });
    });
    return out;
  }
  function inciOf(text) {
    var t = prep(text);
    var re = /(?:^|\n)[ \t]*(?:\[?\s*전\s*성분(?:\s*명|\s*표시)?\s*\]?|ingredients?|성분\s*표시)\s*[:：]?\s*/gi, m, best = '';
    while ((m = re.exec(t))) {
      var seg = t.slice(m.index + m[0].length, m.index + m[0].length + 4000);
      var end = seg.search(/\n\s*\n|\n[ \t]*[가-힣A-Za-z ]{2,14}\s*[:：]/);
      if (end > 0) seg = seg.slice(0, end);
      seg = seg.replace(/\n/g, ' ').trim();
      if ((seg.match(/,/g) || []).length >= 5 && seg.length > best.length) best = seg;
    }
    return best.replace(/\s+/g, ' ').replace(/\s*,\s*/g, function (m, off, all) { return /\d/.test(all[off - 1] || '') && /\d/.test(all[off + m.length] || '') ? ',' : ', '; }).replace(/[.\s]+$/, '');
  }
  function usageOf(text, lines) {
    var t = prep(text);
    var m = t.match(/(?:^|\n)[ \t]*\[?\s*(?:사용\s*(?:법|방법)|how\s*to\s*use|directions?)\s*\]?\s*[:：]?\s*([\s\S]{8,700}?)(?=\n\s*\n|\n[ \t]*\[?\s*(?:사용\s*시\s*주의|주의\s*사항|보관|전\s*성분|용량|사용\s*기한|제조|caution)|$)/i);
    if (!m) return '';
    var body = m[1].trim();
    var steps = body.split(/\n|(?=(?:^|\s)(?:\d+[\.\)]|STEP\s*\d+|①|②|③|④|⑤))/i).map(function (s) { return s.replace(/^\s*(?:\d+[\.\)]|STEP\s*\d+\.?|[①-⑨])\s*[:：]?\s*/i, '').trim(); }).filter(function (s) { return s.length >= 4; });
    return steps.slice(0, 6).join('\n');
  }
  function makerFields(text, lines, ctx) {
    var t = prep(text), o = {};
    var ex = t.match(/(?:사용\s*기한|유통\s*기한|shelf\s*life)[^\n]{0,12}?((?:제조일로?\s*부터\s*)?\d+\s*(?:개월|년)(?:\s*\(?\s*개봉\s*후\s*\d+\s*개월\s*\)?)?)/i);
    if (ex) o.expiry = one(ex[1]).replace(/^(\d)/, '제조일로부터 $1');
    var vol = field(lines, /(?:^|\s)(용량|내용량|중량|용량\s*·\s*중량)\s*/, /(\d+(?:\.\d+)?\s?(?:ml|mL|ML|g|G|매)(?:\s*[x×*]\s*\d+\s*(?:매|ea|개))?)/);
    if (vol) o.volume = vol.replace(/\s+/g, '');
    var fn = [];
    if (/미백\s*(?:기능성|에\s*도움)|피부의?\s*미백/.test(t)) fn.push('미백');
    if (/주름\s*(?:개선|기능성)|주름\s*개선에\s*도움/.test(t)) fn.push('주름개선');
    if (/자외선\s*차단\s*(?:기능성)?|SPF\s*\d+/i.test(t) && /기능성|심사|보고/.test(t)) fn.push('자외선차단');
    if (fn.length && /(기능성\s*화장품|심사|보고)/.test(t)) o.functional = fn.join(', ');
    var fno = t.match(/(?:심사|보고)\s*(?:번호|필\s*번호)?\s*[:：]?\s*(제\s*\d{4}\s*[-–]\s*\d{2,7}\s*호|\d{4}\s*[-–]\s*\d{2,7})/);
    if (fno && o.functional) o.funcNo = one(fno[1]);
    var pat = t.match(/(?:특허|patent)[^\n]{0,40}?(?:제\s*)?(10\s*[-–]\s*\d{4}\s*[-–]\s*\d{7}|10\s*[-–]\s*\d{7}|10\s*[-–]\s*\d{4}\s*[-–]\s*\d{6})\s*(?:[-–]\s*0{4})?\s*호?/i);
    if (pat) o.patent = '제' + pat[1].replace(/\s+/g, '').replace(/–/g, '-') + '호';
    var veg = t.match(/(비건|vegan)/i);
    if (veg) {
      var vo = t.match(/(EVE\s*VEGAN|이브\s*비건|Vegan\s*Society|비건\s*소사이어티|V-?Label|브이\s*라벨|한국\s*비건\s*인증원|비건\s*표준\s*인증|PETA)/i);
      o.cert = '비건 인증' + (vo ? ' · ' + one(vo[1]) : '');
    }
    var ph = t.match(/(?:소비자\s*상담|고객\s*(?:센터|상담)|상담\s*전화|대표\s*전화)[^\n\d]{0,16}(0\d{1,2}[-\s.)]?\d{3,4}[-\s.]?\d{4}|1[5-9]\d{2}[-\s.]?\d{4})/);
    if (ph) o.phone = ph[1].replace(/[\s.)]/g, '-').replace(/-+/g, '-');
    var se = t.match(/(?:화장품\s*)?책임\s*판매\s*업자\s*[:：]?\s*([^\n\t,]{2,40})/);
    if (se) o.seller = one(se[1]);
    var mk = t.match(/(?:화장품\s*)?제조\s*(?:업자|원|사)\s*[:：]\s*([^\n\t,]{2,40})/);
    if (mk) o.makerRef = one(mk[1]);
    var cau = t.match(/(?:개별\s*)?(?:사용\s*시\s*)?주의\s*사항\s*[:：]?\s*([\s\S]{10,900}?)(?=\n\s*\n|$)/);
    if (cau) {
      var extra = cau[1].split(/\n|(?=\d\)\s)|(?=[가-하]\)\s)/).map(function (s) { return s.replace(/^\s*(?:\d+\)|[가-하]\)|[-•·])\s*/, '').trim(); }).filter(function (s) { return s.length > 5 && !/(직사광선|어린이|상처가\s*있는|붉은\s*반점|보관\s*및\s*취급|전문의\s*등과\s*상담)/.test(s); });
      if (extra.length) o.caution = extra.slice(0, 3).join(' / ');
    }
    var inci = inciOf(t);
    if (inci) o.inci = inci;
    o.usage = usageOf(t, lines);
    var names = [];
    var an = GEN.analyze(inci || (ctx && ctx.inci) || '');
    an.items.forEach(function (i) { if (!i.base) names.push(i.k); });
    ((ctx && ctx.mains) || []).forEach(function (m) { if (m) names.push(m); });
    names = names.filter(function (n, i, a) { return a.map(nz).indexOf(nz(n)) === i; });
    var pc = pctFor(t, names);
    if (pc.length) o.pctAll = pc;
    var extraNotes = (t.match(/(?:^|\n)\s*[*※][^\n]{6,120}/g) || []).map(function (s) { return one(s.replace(/^\s*[*※]\s*/, '*')); });
    if (extraNotes.length) o.notes = extraNotes.slice(0, 6);
    return o;
  }
  /* 문서 1개 분석 → { kind, values:{ 필드: 값 } } */
  function parseDoc(text, zone, ctx) {
    ctx = ctx || {};
    var t = prep(text), lines = linesOf(t);
    var kind = kindOf(t);
    if (zone === 'clin' && kind === 'maker' && /(시험|평가|결과)/.test(t)) kind = /자극|첩포|반응도/.test(t) ? 'irr' : 'clin';
    var v = {};
    if (kind === 'clin') {
      v.clinTitle = clinTitle(t, lines, ctx.name);
      v.clinResult = conclusion(t);
      var o1 = org(t, lines), p1 = period(t, lines), s1 = subjects(t, lines);
      v.clinInfo = [o1, p1, s1.text].filter(Boolean).join(', ');
    } else if (kind === 'irr') {
      v.irrResult = irrResult(t, lines);
      var o2 = org(t, lines), p2 = period(t, lines), s2 = subjects(t, lines);
      v.irrInfo = [o2, p2, s2.n ? s2.n + '명' : ''].filter(Boolean).join(', ');
    }
    if (kind === 'maker' || zone === 'maker') {
      var mf = makerFields(t, lines, ctx);
      Object.keys(mf).forEach(function (k) { if (mf[k] && (!Array.isArray(mf[k]) || mf[k].length)) v[k] = mf[k]; });
    }
    Object.keys(v).forEach(function (k) { if (v[k] === '' || v[k] == null) delete v[k]; });
    return { kind: kind, values: v };
  }

  /* =========================================================
     3. 필수 표기 문구 규칙
     ========================================================= */
  var SEC_KO = { top: '제품 표기', ing: '성분', sci: '원료 · 인증', clin: '인체적용시험', irr: '피부자극시험', tex: '제형 이미지' };
  var hasRe = function (re) { return function (txt) { return re.test(txt); }; };
  var hasAll = function (parts) { return function (txt) { var n = nz(txt); return parts.filter(Boolean).every(function (p) { return n.indexOf(nz(p)) >= 0; }); }; };
  function pctList(input, title) {
    var out = [], seen = {};
    String((input.content || '') + ', ' + (title || input.name || '')).replace(/([가-힣A-Za-z][가-힣A-Za-z0-9\-]*)\s?(\d+(?:\.\d+)?\s?%)/g, function (m, k, p) {
      if (!seen[k]) { seen[k] = 1; out.push(k + ' ' + p.replace(/\s/g, '')); }
      return m;
    });
    return out;
  }
  function namedNoPct(input) {
    try {
      var an = GEN.analyze(input.inci || '');
      var w = GEN.checkInput(Object.assign({}, input, { desc: input.desc || 'x' }), an).filter(function (x) { return /함량 표기가 필요/.test(x.msg); });
      if (!w.length) return '';
      var m = w[0].msg.match(/성분명\(([^)]+)\)/);
      return m ? m[1] : '성분';
    } catch (e) { return ''; }
  }
  function reqRules(brand, input) {
    input = input || {};
    var R = [], desc = String(input.desc || '');
    var add = function (o) { R.push(o); };
    var title = (function () { try { return GEN.splitVolume(input.name, input.volume).title; } catch (e) { return input.name || ''; } })();
    /* 제품 표기 */
    var pl = pctList(input, title);
    if (pl.length) add({ id: 'content', sec: 'top', label: '대표성분 함량 기준', text: '*' + pl.join(', ') + ' 함유 (원료 함량 기준)', test: hasRe(/원료\s*(?:투입\s*)?(?:함량\s*)?기준|함량\s*기준/) });
    else { var nn = namedNoPct(input); if (nn) add({ id: 'content', sec: 'top', label: '대표성분 함량', ph: 1, text: '*[제품명에 들어간 성분(' + nn + ')의 함량 입력 필요 — 선택 입력 > 대표성분 함량]', test: function () { return false; } }); }
    var fn = str(input.functional);
    if (fn) add({ id: 'fn', sec: 'top', label: '기능성 심사(보고)', text: '*본 제품은 식품의약품안전처에서 ' + fn.replace(/,\s*/g, ' · ') + ' 기능성 심사(보고)를 받은 기능성 화장품입니다.' + (str(input.funcNo) ? ' (' + str(input.funcNo) + ')' : ''), test: hasRe(/기능성\s*(?:화장품)?\s*(?:심사|보고)/) });
    /* 성분 */
    add({ id: 'ing', sec: 'ing', label: '원료의 특성에 한함', text: '*원료의 특성에 한함', test: hasRe(/원료(?:의|적)?\s*특성/) });
    String(input.reqExtra || '').split(/\n+/).map(str).filter(Boolean).forEach(function (t, i) {
      add({ id: 'extra' + i, sec: 'ing', label: '제조사 요청 문구', text: /^[*※]/.test(t) ? t : '*' + t, test: hasAll([t.replace(/^[*※]\s*/, '')]) });
    });
    /* 원료 · 인증 */
    var patent = str(input.patent);
    if (brand === 'velinic') {
      add({ id: 'patent', sec: 'sci', label: '특허 원료 표기', ph: patent ? 0 : 1, text: '*피토테라좀® 그레이프 : 특허 원료에 한함 (' + (patent ? '특허 ' + patent : '특허번호 입력 필요') + ')', test: patent ? hasAll([patent]) : hasRe(/특허\s*(?:원료|번호|제\s*10)/) });
      add({ id: 'sciIng', sec: 'sci', label: '원료의 특성에 한함', text: '*원료의 특성에 한함', test: hasRe(/원료(?:의|적)?\s*특성/) });
    } else if (patent) {
      add({ id: 'patent', sec: 'sci', label: '특허 원료 표기', text: '*특허 원료에 한함 (특허 ' + patent + ')', test: hasAll([patent]) });
    }
    var cert = str(input.cert);
    if (/비건|vegan/i.test(cert + ' ' + desc)) {
      var corg = (cert.match(/·\s*(.+)$/) || [])[1];
      add({ id: 'vegan', sec: 'sci', label: '비건 인증 안내', ph: corg ? 0 : 1, text: '*비건 인증은 동물성 원료 및 동물실험을 배제한 제품에 대한 인증으로, 피부 안전성 및 효능을 보장하는 것은 아닙니다. (인증기관 : ' + (corg || '입력 필요') + ')', test: hasRe(/비건\s*인증은/) });
    }
    /* 인체적용시험 */
    if (str(input.clinResult) || str(input.clinTitle)) {
      if (str(input.clinTitle)) add({ id: 'clinTitle', sec: 'clin', label: '시험명', text: '*인체적용시험명 : ' + str(input.clinTitle), test: hasAll([input.clinTitle]) });
      var ci = str(input.clinInfo);
      add({ id: 'clinInfo', sec: 'clin', label: '시험기관 · 기간 · 대상', ph: ci ? 0 : 1, text: ci ? '*시험기관 · 기간 · 대상 : ' + ci : '*[시험기관 · 시험기간 · 대상 인원 입력 필요]', test: ci ? hasAll(ci.split(/\s*,\s*/)) : function () { return false; } });
      add({ id: 'clinIndiv', sec: 'clin', label: '개인차 안내', text: '*본 시험 결과는 개인에 따라 차이가 있을 수 있습니다.', test: hasRe(/개인(?:에\s*따라|별)?\s*(?:차이|차가|차)/) });
    }
    /* 피부자극시험 */
    if (str(input.irrResult)) {
      var ii = str(input.irrInfo);
      add({ id: 'irrInfo', sec: 'irr', label: '시험기관 · 기간', ph: ii ? 0 : 1, text: ii ? '*시험기관 · 기간 : ' + ii : '*[피부자극시험 기관 · 기간 입력 필요]', test: ii ? hasAll(ii.split(/\s*,\s*/)) : function () { return false; } });
      add({ id: 'irrAll', sec: 'irr', label: '모든 사람 무자극 아님', text: '*모든 사람에게 피부 자극이 없다는 의미는 아닙니다.', test: hasRe(/모든\s*사람/) });
      add({ id: 'irrIndiv', sec: 'irr', label: '개인차 안내', text: '*피부 자극 테스트 결과는 개인에 따라 차이가 있을 수 있습니다.', test: hasRe(/개인(?:에\s*따라|별)?\s*(?:차이|차가|차)/) });
    }
    /* 제형 이미지 */
    add({ id: 'texImg', sec: 'tex', label: '연출 이미지 안내', text: '*이미지는 제품의 이해를 돕기 위한 연출 컷입니다.', test: hasRe(/연출/) });
    return R;
  }
  // 문안에 넣지 않고 점검 패널에만 띄우는 경고
  function reqWarns(brand, input, allText) {
    input = input || {};
    var W = [], desc = String(input.desc || '') + ' ' + (allText || '');
    if (!str(input.irrResult) && /저자극|무자극|자극\s*(?:테스트|시험)\s*완료|피부\s*자극\s*테스트/.test(desc)) W.push('저자극 · 자극 테스트 표현이 있습니다. 피부자극시험 보고서를 올리거나 해당 표현을 빼 주세요.');
    if (!str(input.clinResult) && /인체\s*적용\s*시험\s*완료|임상\s*완료/.test(desc)) W.push('인체적용시험 완료 표현이 있습니다. 시험 보고서를 올려 시험명 · 기관 · 기간 · 대상을 함께 표기해 주세요.');
    if (brand !== 'velinic' && !str(input.patent) && /특허/.test(desc)) W.push('특허 표현이 있습니다. 제조사 자료의 특허번호를 넣어 주세요. (선택 입력 > 특허번호)');
    if (/글라이콜릭애씨드|락틱애씨드|만델릭애씨드|말릭애씨드|타타릭애씨드|시트릭애씨드/.test(input.inci || '')) W.push('AHA 성분이 있습니다. 0.5%를 넘게 들어 있으면 고시 주의사항에 AHA 개별 문구(자외선 차단제 병용 · 일부 시험 사용)가 필요합니다.');
    return W;
  }

  /* =========================================================
     4. 레이아웃 — 필수 표기 박스 자리 (관련 영역 바로 아래)
     ========================================================= */
  var SPEC = {
    drsthe: { top: { after: 'dType', w: 900, align: 'left' }, ing: { after: 'dIng3', align: 'center' }, sci: { after: 'dMeet', align: 'center' }, clin: { after: 'dClinC', w: 860, align: 'left' }, irr: { after: 'dIrrInfo', w: 780, align: 'left' }, tex: { after: 'dTex', align: 'center' } },
    velinic: { top: { after: 'vHeroName', align: 'center' }, ing: { after: 'vBubble2', align: 'center' }, sci: { after: 'vSciPts', align: 'center' }, clin: { after: 'vSumList', align: 'center' }, irr: { after: 'vIrrInfo', align: 'center' }, tex: { after: 'vTexSteps', align: 'center' } }
  };
  Object.keys(SPEC).forEach(function (bid) {
    var Lo = LAYOUTS[bid];
    if (!Lo || Lo.v9) return;
    Object.keys(SPEC[bid]).forEach(function (sec) {
      var sp = SPEC[bid][sec];
      var t = Lo.blocks.find(function (b) { return b.id === sp.after; });
      if (!t) return;
      Lo.blocks.push({ id: 'n9_' + sec, type: 'n9note', v9: 1, sec: sec, x: t.x, y: t.y + (t.h || 80) + 8, w: sp.w || t.w, align: sp.align || t.align || 'center' });
    });
    Lo.v9 = 1;
  });

  /* =========================================================
     5. 생성 후처리
     ========================================================= */
  var L = function (r, t, ex) { return Object.assign({ r: r, t: t == null ? '' : String(t) }, ex || {}); };
  function blockText(b) { return (b.lines || []).map(function (l) { return l.t; }).join(' '); }
  var MASK_KIND = { sheet: 1, washoff: 1, modeling: 1, sleeping: 1 };
  function post(r, brand, input, layout) {
    if (!r || !r.blocks || !layout) return;
    var LB = {};
    layout.blocks.forEach(function (b) { LB[b.id] = b; });
    r.blocks = r.blocks.filter(function (b) { return !/^n9_/.test(b.id); });
    var rules = reqRules(brand, input);
    var bySec = {};
    rules.forEach(function (x) { (bySec[x.sec] = bySec[x.sec] || []).push(x); });
    var geo = {};
    Object.keys(bySec).forEach(function (sec) {
      var g = LB['n9_' + sec];
      if (g) geo[sec] = { x: g.x, y: g.y, w: g.w, align: g.align };
    });
    // 벨리닉: 인체적용시험 결과가 실제로 들어간 박스 바로 아래로
    var cr = nz(input.clinResult).slice(0, 14);
    if (cr) {
      var hit = r.blocks.find(function (b) { return nz(blockText(b)).indexOf(cr) >= 0; });
      if (hit && (brand === 'velinic' || !geo.clin)) {
        var a = LB[hit.id] || hit;
        geo.clin = { x: a.x, y: a.y + (a.h || 140) + 8, w: a.w, align: a.align || 'center' };
      }
    }
    Object.keys(bySec).forEach(function (sec) {
      var g = geo[sec];
      if (!g) return;
      var near = r.blocks.filter(function (b) { return !b.hidden && b.y >= g.y - 2600 && b.y <= g.y + 400 && b.type !== 'infoAll'; }).map(blockText).join(' ');
      var need = bySec[sec].filter(function (x) { return !x.test(near); });
      if (!need.length) return;
      r.blocks.push({
        id: 'n9_' + sec, type: 'n9note', label: '필수 표기 · ' + SEC_KO[sec], x: g.x, y: g.y, w: g.w, align: g.align || 'center',
        ph: need.some(function (x) { return x.ph; }) ? 1 : 0,
        lines: need.map(function (x) { return L('note', x.text, { x: 1, req: x.id }); })
      });
    });
    // 상품정보제공고시 (v7 통짜 박스) — 제품 유형별 개별 주의사항
    var info = r.blocks.find(function (b) { return b.type === 'infoAll'; });
    if (info && info.lines) {
      var cl = info.lines.find(function (l) { return /^사용 시 주의사항/.test(l.t); });
      if (cl) {
        var kind = (r.ctx && r.ctx.type && r.ctx.type.kind) || '';
        try { kind = input.kind || (G.V6 && G.V6.autoKind ? G.V6.autoKind(input) : '') || GEN.detectType(GEN.splitVolume(input.name, input.volume).title).kind; } catch (e) { }
        var add = [];
        if (MASK_KIND[kind] && cl.t.indexOf('눈 주위') < 0) add.push('4) 팩 : 눈 주위를 피하여 사용할 것');
        if (/스크럽|스크러브|알갱이|scrub/i.test((input.name || '') + ' ' + (input.desc || '')) && cl.t.indexOf('알갱이') < 0) add.push((add.length ? '5' : '4') + ') 미세한 알갱이가 함유된 스크러브 세안제 : 알갱이가 눈에 들어갔을 때에는 물로 씻어내고, 이상이 있는 경우에는 전문의와 상담할 것');
        if (add.length) cl.t = cl.t + ' ' + add.join(' ');
      }
      info.label = '상품정보제공고시';
    }
    r.blocks.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  }
  function val(id) { var el = $(id); return el ? str(el.value) : ''; }
  var og = GEN.generate;
  GEN.generate = function (brand, input, layout) {
    input = input || {};
    var vi = $('#vInput');
    if (vi && !vi.classList.contains('hidden')) {
      input.patent = val('#fPatent');
      input.cert = val('#fCert');
      input.reqExtra = val('#fReqExtra');
      input.docs = V9.files.filter(function (f) { return f.status === 'ok'; }).map(function (f) { return { name: f.name, kind: f.kind }; });
    }
    V9.cur = input; V9.brand = brand;
    var lay = layout ? Object.assign({}, layout, { blocks: layout.blocks.filter(function (b) { return !b.v9; }) }) : layout;
    var r = og.call(this, brand, input, lay);
    try { post(r, brand, input, layout); } catch (e) { console.warn('[v9] 필수 표기 후처리 오류', e); }
    return r;
  };
  V9._x = { parseDoc: parseDoc, reqRules: reqRules, reqWarns: reqWarns, post: post, kindOf: kindOf, conclusion: conclusion, prep: prep };

  if (!doc || !doc.getElementById) return;

  /* =========================================================
     6. 입력 화면 — 파일 2칸
     ========================================================= */
  var FMAP = {
    clinTitle: ['#fClinT', '인체적용시험명'], clinResult: ['#fClinR', '인체적용시험 결과'], clinInfo: ['#fClinI', '시험기관 · 기간 · 대상'],
    irrResult: ['#fIrrR', '피부자극시험 결과'], irrInfo: ['#fIrrI', '피부자극시험 기관 · 기간'],
    inci: ['#fInci', '전성분'], volume: ['#fVol', '용량'], content: ['#fContent', '대표성분 함량'], functional: ['#fFunc', '기능성'], funcNo: ['#fFuncNo', '기능성 심사(보고)번호'],
    usage: ['#fUsage', '사용법'], expiry: ['#fExpiry', '사용기한'], seller: ['#fSeller', '책임판매업자'], phone: ['#fPhone', '소비자상담 전화'], caution: ['#fCaution', '추가 주의사항'],
    patent: ['#fPatent', '특허번호'], cert: ['#fCert', '인증'], notes: ['#fReqExtra', '제조사 요청 주석'], makerRef: [null, '제조사 (참고)']
  };
  var KIND_KO = { clin: '인체적용시험 보고서', irr: '피부자극시험 보고서', maker: '제조사 자료' };
  function ctxNow() {
    var mains = [val('#fM1'), val('#fM2'), val('#fM3')].filter(Boolean);
    var name = val('#fName');
    try { name = GEN.splitVolume(name, val('#fVol')).title; } catch (e) { }
    return { name: name, inci: val('#fInci'), mains: mains };
  }
  function contentFrom(v) {
    if (!v.pctAll || !v.pctAll.length) return '';
    var name = nz(val('#fName')), mains = [val('#fM1'), val('#fM2'), val('#fM3')].map(nz);
    var pick = v.pctAll.filter(function (p) { var k = nz(p.k); return name.indexOf(k) >= 0 || mains.indexOf(k) >= 0; });
    if (!pick.length) pick = v.pctAll.slice(0, 2);
    return pick.slice(0, 3).map(function (p) { return p.k + ' ' + p.pct; }).join(', ');
  }
  function setField(key, value) {
    var m = FMAP[key];
    if (!m || !m[0]) return false;
    var el = $(m[0]);
    if (!el) return false;
    if (key === 'functional') {
      var want = String(value).split(/\s*,\s*/);
      var opt = Array.prototype.find.call(el.options, function (o) { var have = o.value.split(/\s*,\s*/); return have.length === want.length && want.every(function (w) { return have.indexOf(w) >= 0; }); });
      if (!opt) { opt = doc.createElement('option'); opt.textContent = want.join(', '); el.appendChild(opt); }
      el.value = opt.value;
    } else {
      el.value = Array.isArray(value) ? value.join('\n') : value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  function curVal(key) { var m = FMAP[key]; if (!m || !m[0]) return ''; var el = $(m[0]); return el ? str(el.value) : ''; }
  function shown(key, v) { return Array.isArray(v) ? v.join(' / ') : String(v); }
  function applyFile(f, force) {
    var v = Object.assign({}, f.values);
    if (v.pctAll) { var c = contentFrom(v); if (c) v.content = c; }
    f.rows = [];
    Object.keys(FMAP).forEach(function (k) {
      if (v[k] == null || v[k] === '' || (Array.isArray(v[k]) && !v[k].length)) return;
      var now = curVal(k), nv = shown(k, v[k]);
      var st;
      if (!FMAP[k][0]) st = 'ref';
      else if (!now || force) { setField(k, v[k]); st = 'set'; }
      else if (nz(now) === nz(nv)) st = 'same';
      else st = 'keep';
      f.rows.push({ k: k, label: FMAP[k][1], v: nv, st: st });
    });
    if (v.inci && curVal('inci') && nz(curVal('inci')) !== nz(v.inci)) {
      var a = GEN.analyze(curVal('inci')).items.map(function (i) { return nz(i.k); }), b = GEN.analyze(v.inci).items.map(function (i) { return nz(i.k); });
      var diff = b.filter(function (x) { return a.indexOf(x) < 0; }).length + a.filter(function (x) { return b.indexOf(x) < 0; }).length;
      f.inciDiff = diff;
    }
  }
  function renderFiles() {
    var box = $('#v9Files');
    if (!box) return;
    if (!V9.files.length) { box.innerHTML = ''; renderReqPreview(); return; }
    box.innerHTML = V9.files.map(function (f, i) {
      var st = f.status === 'busy' ? '<span class="v9-st busy">' + esc(f.msg || '읽는 중…') + '</span>'
        : f.status === 'err' ? '<span class="v9-st err">' + esc(f.msg) + '</span>'
        : f.status === 'scan' ? '<span class="v9-st warn">글자를 읽을 수 없는 스캔본입니다</span> <button type="button" class="btn ghost sm" data-ocr="' + i + '">OCR로 읽기</button>'
        : '<span class="v9-st ok">' + esc(KIND_KO[f.kind] || '자료') + '로 인식 · ' + (f.rows || []).length + '개 항목</span>';
      var rows = (f.rows || []).map(function (r) {
        var stt = { set: '<span class="v9-b set">채움</span>', same: '<span class="v9-b same">입력값과 같음</span>', keep: '<span class="v9-b keep">기존 값 유지</span> <button type="button" class="link" data-swap="' + i + ':' + r.k + '">이 값으로 바꾸기</button>', ref: '<span class="v9-b same">참고</span>' }[r.st];
        return '<tr><th>' + esc(r.label) + '</th><td>' + esc(r.v.length > 160 ? r.v.slice(0, 160) + '…' : r.v) + '</td><td class="v9-stc">' + stt + '</td></tr>';
      }).join('');
      var warn = f.inciDiff ? '<div class="v9-note warn">제조사 자료의 전성분이 입력한 전성분과 ' + f.inciDiff + '개 다릅니다. 최신 전성분인지 확인해 주세요.</div>' : '';
      var none = f.status === 'ok' && !(f.rows || []).length ? '<div class="v9-note">자동으로 읽을 항목을 찾지 못했습니다. [결론 문구 붙여넣기]로 필요한 문장만 넣어 주세요.</div>' : '';
      return '<div class="v9-file"><div class="v9-fh"><b>' + esc(f.name) + '</b>' + st + '<button type="button" class="v9-x" data-del="' + i + '" title="목록에서 빼기 (입력칸 값은 유지)">×</button></div>' + (rows ? '<table class="v9-tb">' + rows + '</table>' : '') + warn + none + '</div>';
    }).join('');
    renderReqPreview();
  }
  function renderReqPreview() {
    var box = $('#v9Req');
    if (!box) return;
    var brand = V9.brandIn || V9.brand;
    var inp = {
      name: val('#fName'), volume: val('#fVol'), inci: val('#fInci'), content: val('#fContent'), functional: val('#fFunc'), funcNo: val('#fFuncNo'),
      clinTitle: val('#fClinT'), clinResult: val('#fClinR'), clinInfo: val('#fClinI'), irrResult: val('#fIrrR'), irrInfo: val('#fIrrI'),
      patent: val('#fPatent'), cert: val('#fCert'), reqExtra: val('#fReqExtra'), desc: val('#fDesc'), mains: [val('#fM1'), val('#fM2'), val('#fM3')].filter(Boolean)
    };
    if (!inp.name) { box.innerHTML = ''; return; }
    var rules = reqRules(brand, inp), warns = reqWarns(brand, inp);
    box.innerHTML = '<div class="v9-req-h">상세페이지에 자동으로 들어갈 필수 표기 문구 <b>' + rules.length + '개</b> <span class="muted">(생성 문안에 이미 있으면 빼고 넣습니다)</span></div>' +
      '<ul>' + rules.map(function (x) { return '<li class="' + (x.ph ? 'ph' : '') + '"><span class="v9-sec">' + esc(SEC_KO[x.sec]) + '</span>' + esc(x.text) + '</li>'; }).join('') + '</ul>' +
      warns.map(function (w) { return '<div class="v9-note warn">' + esc(w) + '</div>'; }).join('');
  }
  async function processFile(file, zone) {
    var f = { name: file.name, zone: zone, status: 'busy', msg: '읽는 중…', file: file };
    V9.files.push(f); renderFiles();
    try {
      var rd = await readFile(file);
      f.pdf = rd.pdf; f.image = rd.image;
      if (rd.scanned) { f.status = 'scan'; f.text = rd.text; renderFiles(); return; }
      finish(f, rd.text);
    } catch (e) {
      console.warn('[v9]', e);
      f.status = 'err'; f.msg = e.message || String(e); renderFiles();
    }
  }
  function finish(f, text) {
    f.text = text;
    var r = parseDoc(text, f.zone, ctxNow());
    f.kind = r.kind; f.values = r.values; f.status = 'ok';
    applyFile(f, false);
    var opt = $('#optBox'); if (opt) opt.open = true;
    renderFiles();
    toast((KIND_KO[f.kind] || '자료') + '에서 ' + (f.rows || []).filter(function (x) { return x.st === 'set'; }).length + '개 항목을 채웠습니다.');
  }
  async function runOcr(i) {
    var f = V9.files[i];
    if (!f) return;
    f.status = 'busy'; f.msg = 'OCR 준비 중… (처음 한 번은 1분 정도 걸립니다)'; renderFiles();
    try {
      var src = f.image ? [f.file] : await pdfCanvases(f.pdf, 10);
      var t = await ocr(src, function (p) { f.msg = 'OCR 읽는 중 ' + Math.round(p * 100) + '%'; renderFiles(); });
      finish(f, t);
    } catch (e) {
      f.status = 'err'; f.msg = 'OCR 실패: ' + (e.message || e); renderFiles();
    }
  }
  function buildZones() {
    var box = $('#v9Zones');
    if (!box || box.dataset.ok) return;
    box.dataset.ok = 1;
    $$('.v9-zone').forEach(function (z) {
      var zone = z.dataset.zone, inp = z.querySelector('input[type=file]');
      z.addEventListener('click', function (e) {
        if (e.target.closest('[data-paste]')) { e.preventDefault(); openPaste(zone); return; }
        inp.click();
      });
      ['dragenter', 'dragover'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.add('over'); }); });
      ['dragleave', 'drop'].forEach(function (ev) { z.addEventListener(ev, function (e) { e.preventDefault(); z.classList.remove('over'); }); });
      z.addEventListener('drop', function (e) { Array.prototype.forEach.call(e.dataTransfer.files || [], function (f) { processFile(f, zone); }); });
      inp.addEventListener('click', function (e) { e.stopPropagation(); });
      inp.addEventListener('change', function () { Array.prototype.forEach.call(inp.files || [], function (f) { processFile(f, zone); }); inp.value = ''; });
    });
    var files = $('#v9Files');
    files.addEventListener('click', function (e) {
      var d = e.target.dataset || {};
      if (d.del != null) { V9.files.splice(+d.del, 1); renderFiles(); }
      if (d.ocr != null) runOcr(+d.ocr);
      if (d.swap) {
        var p = d.swap.split(':'), f = V9.files[+p[0]];
        if (!f) return;
        var v = Object.assign({}, f.values); if (v.pctAll) { var c = contentFrom(v); if (c) v.content = c; }
        setField(p[1], v[p[1]]);
        (f.rows || []).forEach(function (r) { if (r.k === p[1]) r.st = 'set'; });
        renderFiles(); toast('바꿨습니다.');
      }
    });
    var go = $('#v9PasteGo'), x = $('#v9PasteX');
    if (go) go.onclick = function () {
      var t = val('#v9PasteTxt');
      if (!t) { toast('붙여넣은 내용이 없습니다.'); return; }
      var f = { name: '붙여넣은 ' + ($('#v9Paste').dataset.zone === 'maker' ? '제조사 자료' : '보고서 문구'), zone: $('#v9Paste').dataset.zone, status: 'busy' };
      V9.files.push(f); finish(f, t);
      $('#v9PasteTxt').value = ''; $('#v9Paste').classList.add('hidden');
    };
    if (x) x.onclick = function () { $('#v9Paste').classList.add('hidden'); };
    ['#fName', '#fVol', '#fInci', '#fContent', '#fFunc', '#fFuncNo', '#fClinT', '#fClinR', '#fClinI', '#fIrrR', '#fIrrI', '#fPatent', '#fCert', '#fReqExtra', '#fDesc'].forEach(function (id) {
      var el = $(id); if (el) el.addEventListener('input', debounce(renderReqPreview, 300));
    });
    var vi = $('#vInput');
    if (vi) {
      vi.addEventListener('change', debounce(renderReqPreview, 800), true);
      vi.addEventListener('drop', debounce(renderReqPreview, 1500), true);
    }
  }
  function openPaste(zone) {
    var p = $('#v9Paste'); if (!p) return;
    p.dataset.zone = zone; p.classList.remove('hidden');
    var t = $('#v9PasteTxt');
    t.placeholder = zone === 'maker' ? '제조사 자료 내용을 붙여넣으세요 (전성분 · 함량 · 특허번호 · 인증 · 사용법 · 사용기한 등)' : '보고서의 시험명 · 시험기관 · 기간 · 대상 · 결론 부분을 그대로 붙여넣으세요';
    t.focus();
  }
  // 입력 화면이 다시 열릴 때 v9 칸 복원 (정보 수정 · 히스토리)
  function hookInput() {
    var vi = $('#vInput');
    if (!vi) return;
    var lastName = null;
    new MutationObserver(function () {
      if (vi.classList.contains('hidden')) return;
      var name = val('#fName'), cur = V9.cur || {};
      var same = name && cur.name === name;
      ['#fPatent', '#fCert', '#fReqExtra'].forEach(function (id, i) { var el = $(id); if (el) el.value = same ? (cur[['patent', 'cert', 'reqExtra'][i]] || '') : ''; });
      if (name !== lastName) { V9.files = same ? V9.files : []; lastName = name; }
      if (!name) V9.files = [];
      var chip = $('#inBrand');
      V9.brandIn = chip ? (/벨리닉/.test(chip.textContent) ? 'velinic' : 'drsthe') : V9.brand;
      renderFiles();
    }).observe(vi, { attributes: true, attributeFilter: ['class'] });
    var hl = $('#histList');
    if (hl) hl.addEventListener('click', function (e) {
      var it = e.target.closest('.h-item');
      if (!it || e.target.classList.contains('h-del')) return;
      try {
        var h = JSON.parse(localStorage.getItem('dp_history_v1') || '[]').find(function (x) { return x.id === it.dataset.id; });
        if (h) { V9.cur = h.input || {}; V9.brand = h.brand; }
      } catch (er) { }
    }, true);
    var bg = $('#brandGrid');
    if (bg) bg.addEventListener('click', function (e) { var c = e.target.closest('.brand-card'); if (c) { V9.brandIn = c.dataset.b; V9.cur = null; V9.files = []; } }, true);
  }

  /* =========================================================
     7. 편집 화면 — [필수 표기 점검]
     ========================================================= */
  function canvasText() {
    return $$('#canvas .blk .ed, #canvas .cbox .cb-ed').map(function (e) { return e.innerText || ''; }).join(' ');
  }
  function renderCheck() {
    var sec = $('#v9Check');
    if (!sec) return;
    var ed = $('#vEdit');
    if (!ed || ed.classList.contains('hidden') || !V9.cur) { sec.innerHTML = ''; return; }
    var all = canvasText();
    var rules = reqRules(V9.brand, V9.cur);
    var miss = 0;
    var rows = rules.map(function (x, i) {
      var ok = !x.ph && (x.test(all) || nz(all).indexOf(nz(x.text)) >= 0);
      if (!ok) miss++;
      return '<div class="v9-ck ' + (ok ? 'ok' : (x.ph ? 'ph' : 'miss')) + '"><span class="v9-dot"></span><div class="v9-ckt"><div><b>' + esc(SEC_KO[x.sec]) + '</b> · ' + esc(x.label) + (ok ? '' : x.ph ? ' <em>입력 필요</em>' : ' <em>빠짐</em>') + '</div><div class="v9-ckx">' + esc(x.text) + '</div>' +
        (ok ? '' : '<div class="v9-cka"><button type="button" data-add="' + i + '">상세에 추가</button><button type="button" data-copy="' + i + '">문구 복사</button></div>') + '</div></div>';
    });
    // 상품정보제공고시 입력 필요 항목
    var infoEl = $('#canvas .blk[data-id="infoAll"] .ed, #canvas .blk[data-id="vInfoAll"] .ed');
    if (infoEl) {
      var need = (infoEl.innerText || '').split('\n').filter(function (l) { return /\(입력 필요\)/.test(l); }).map(function (l) { return l.split(':')[0].trim(); });
      if (need.length) { miss++; rows.push('<div class="v9-ck ph"><span class="v9-dot"></span><div class="v9-ckt"><div><b>상품정보제공고시</b> · 입력 필요 <em>' + esc(need.join(', ')) + '</em></div><div class="v9-ckx">정보 수정 > 선택 입력 > 추출값 확인 · 직접 입력에서 채운 뒤 [다시 생성]하거나, 고시 박스에서 바로 고쳐 주세요.</div></div></div>'); }
    }
    var warns = reqWarns(V9.brand, V9.cur, all).map(function (w) { return '<div class="v9-note warn">' + esc(w) + '</div>'; }).join('');
    sec.innerHTML = '<div class="panel-title">필수 표기 점검 <span class="count">' + (miss ? '<span style="color:var(--bad)">빠짐 ' + miss + '</span>' : '모두 포함') + '</span></div>' +
      '<p class="muted small">시험 · 함량 · 원료 · 인증 근거 문구(*)가 상세에 들어갔는지 확인합니다. 초록 점선 박스가 자동으로 넣은 문구입니다.</p>' + rows.join('') + warns;
    sec.querySelectorAll('[data-add],[data-copy]').forEach(function (b) {
      b.onclick = function () {
        var x = rules[+(b.dataset.add || b.dataset.copy)];
        if (b.dataset.copy != null) { copy(x.text); return; }
        var el = $('#b-n9_' + x.sec + ' .ed');
        if (!el) { copy(x.text); toast('이 영역의 필수 표기 박스가 없어 문구를 복사했습니다. [다시 생성]하면 자동으로 들어갑니다.', 4000); return; }
        var d = doc.createElement('div');
        d.className = 'ln r-note'; d.dataset.r = 'note'; d.textContent = x.text;
        el.appendChild(d);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('blur'));
        toast('추가했습니다.');
        setTimeout(renderCheck, 700);
      };
    });
  }
  function copy(t) {
    try { navigator.clipboard.writeText(t).then(function () { toast('복사했습니다. 원하는 박스에 붙여넣으세요.'); }); }
    catch (e) { prompt('아래 문구를 복사하세요', t); }
  }
  function hookEditor() {
    var panel = $('.panel');
    if (panel && !$('#v9Check')) {
      var s = doc.createElement('div');
      s.className = 'panel-sec'; s.id = 'v9Check';
      panel.insertBefore(s, panel.firstChild);
    }
    var deb = debounce(renderCheck, 400);
    var cv = $('#canvas');
    if (cv) {
      new MutationObserver(deb).observe(cv, { childList: true });
      cv.addEventListener('input', debounce(renderCheck, 900));
      cv.addEventListener('focusout', debounce(renderCheck, 300));
    }
    var ed = $('#vEdit');
    if (ed) new MutationObserver(deb).observe(ed, { attributes: true, attributeFilter: ['class'] });
  }
  function init() { buildZones(); hookInput(); hookEditor(); }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : globalThis);
