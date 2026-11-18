/* =========================================================
   ZIP 읽기/쓰기 · Word(.docx) 파싱 · Excel(.xlsx) 생성 — 외부 라이브러리 없이 동작
   ========================================================= */
(function (G) {
  const enc = new TextEncoder();
  const dec = new TextDecoder('utf-8');

  /* ---------- CRC32 ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

  /* ---------- ZIP 읽기 ---------- */
  async function inflateRaw(u8) {
    if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 해제를 지원하지 않습니다. 최신 Chrome/Edge/Safari를 사용해 주세요.');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([u8]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }
  async function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('올바른 Word(.docx) 파일이 아닙니다.');
    const cnt = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let n = 0; n < cnt; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
      files[name] = { method, csize, off };
      p += 46 + nl + xl + cl;
    }
    return {
      names: Object.keys(files),
      async read(name) {
        const f = files[name]; if (!f) return null;
        const nl = dv.getUint16(f.off + 26, true), xl = dv.getUint16(f.off + 28, true);
        const data = u8.subarray(f.off + 30 + nl + xl, f.off + 30 + nl + xl + f.csize);
        return f.method === 0 ? data : await inflateRaw(data);
      }
    };
  }

  /* ---------- ZIP 쓰기 (무압축 STORE) ---------- */
  function zip(entries) {
    const parts = [], central = []; let off = 0;
    entries.forEach(e => {
      const name = enc.encode(e.name);
      const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
      const crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), name);
      off += 30 + name.length + data.length;
    });
    const csize = central.reduce((s, a) => s + a.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob(parts.concat(central, [new Uint8Array(e.buffer)]), { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ---------- Word 입력템플릿 파싱 ---------- */
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  async function parseDocx(file) {
    const z = await unzip(await file.arrayBuffer());
    const xml = await z.read('word/document.xml');
    if (!xml) throw new Error('Word 문서 본문을 찾지 못했습니다.');
    const doc = new DOMParser().parseFromString(dec.decode(xml), 'application/xml');
    const cellText = tc => Array.from(tc.getElementsByTagNameNS(W, 'p')).map(p => {
      let s = '';
      p.querySelectorAll('*').forEach(n => { if (n.namespaceURI !== W) return; if (n.localName === 't') s += n.textContent; else if (n.localName === 'tab') s += ' '; else if (n.localName === 'br') s += '\n'; });
      return s;
    }).join('\n').trim();
    const map = {};
    Array.from(doc.getElementsByTagNameNS(W, 'tr')).forEach(tr => {
      const tcs = Array.from(tr.children).filter(n => n.localName === 'tc');
      if (tcs.length < 2) return;
      const k = cellText(tcs[0]).replace(/[\s\*·:：()（）,，\/]/g, '').replace(/필수|선택/g, '');
      const v = cellText(tcs[1]);
      if (k && !(k in map)) map[k] = v;
    });
    const brandText = Array.from(doc.getElementsByTagNameNS(W, 't')).slice(0, 40).map(t => t.textContent).join('');
    return { map, brandText };
  }

  /* ---------- Excel 생성 ---------- */
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
  const hex = c => String(c || '#111827').replace('#', '').toUpperCase();

  /**
   * opt: { title, sheetTitle, layoutWidth, images:[{data:Uint8Array, ext, h}], opacity(0-100), blocks:[{x,y,w,h,align,lines:[{t, px, b, color}] }], table:[[...]] }
   */
  function buildXlsx(opt) {
    const PX = 6244;              // 1px(1440 기준) → EMU
    const OX = 685800;            // 왼쪽 여백(B열 시작)
    const PT = 0.4917;            // 1px → pt
    const files = [];
    const imgs = opt.images || [];
    let y = 0, anchors = '', id = 1, rels = '';
    imgs.forEach((im, i) => {
      const cy = Math.round(im.h * PX);
      anchors += `<xdr:absoluteAnchor><xdr:pos x="${OX}" y="${y}"/><xdr:ext cx="${Math.round(opt.layoutWidth * PX)}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id++}" name="배경 ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rIdImg${i + 1}"><a:alphaModFix amt="${Math.round(opt.opacity * 1000)}"/></a:blip><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="${OX}" y="${y}"/><a:ext cx="${Math.round(opt.layoutWidth * PX)}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData fLocksWithSheet="0"/></xdr:absoluteAnchor>`;
      rels += `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/bg${i + 1}.${im.ext}"/>`;
      files.push({ name: `xl/media/bg${i + 1}.${im.ext}`, data: im.data });
      y += cy;
    });
    (opt.blocks || []).forEach((b, i) => {
      const x = OX + Math.round(b.x * PX), yy = Math.round(b.y * PX), cx = Math.round(b.w * PX), cy = Math.round(b.h * PX);
      const algn = b.align === 'left' ? 'l' : 'ctr';
      const paras = b.lines.map(l => {
        const sz = Math.max(600, Math.round(l.px * PT * 100));
        return `<a:p><a:pPr algn="${algn}"><a:lnSpc><a:spcPct val="115000"/></a:lnSpc><a:spcBef><a:spcPts val="${l.gap ? 300 : 0}"/></a:spcBef></a:pPr><a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}" b="${l.b ? 1 : 0}"><a:solidFill><a:srgbClr val="${hex(l.color)}"/></a:solidFill><a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/></a:rPr><a:t>${esc(l.t)}</a:t></a:r></a:p>`;
      }).join('');
      anchors += `<xdr:absoluteAnchor><xdr:pos x="${x}" y="${yy}"/><xdr:ext cx="${cx}" cy="${cy}"/><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${1000 + i}" name="문안 ${i + 1} ${esc(b.label || '')}"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:xfrm><a:off x="${x}" y="${yy}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${b.w > 600 ? 2500 : 5000}"/></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="${b.flag ? 'F59E0B' : 'E5E7EB'}"/></a:solidFill></a:ln></xdr:spPr><xdr:txBody><a:bodyPr wrap="square" lIns="180000" tIns="144000" rIns="180000" bIns="144000" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</xdr:txBody></xdr:sp><xdr:clientData fLocksWithSheet="0"/></xdr:absoluteAnchor>`;
    });
    const drawing = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;

    const cell = (ref, v, s) => `<c r="${ref}" t="inlineStr"${s ? ` s="${s}"` : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0" zoomScale="70" zoomScaleNormal="70" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/><sheetData><row r="2">${cell('P2', opt.title, 1)}</row><row r="3">${cell('P3', `배경 이미지 불투명도 ${opt.opacity}% · 흰 박스 안 문안은 클릭해 바로 수정/복사할 수 있습니다.`, 2)}</row><row r="4">${cell('P4', '문안 전체 목록은 [문안 목록] 시트에서 확인하세요.', 2)}</row></sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/><drawing r:id="rId1"/></worksheet>`;

    const rows = (opt.table || []).map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(String.fromCharCode(65 + j) + (i + 1), v, i === 0 ? 3 : 4)).join('')}</row>`).join('');
    const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols><col min="1" max="1" width="7" customWidth="1"/><col min="2" max="2" width="20" customWidth="1"/><col min="3" max="3" width="12" customWidth="1"/><col min="4" max="4" width="90" customWidth="1"/><col min="5" max="5" width="40" customWidth="1"/></cols><sheetData>${rows}</sheetData></worksheet>`;

    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="맑은 고딕"/><family val="2"/></font><font><b/><sz val="16"/><name val="맑은 고딕"/><family val="2"/></font><font><sz val="10"/><color rgb="FF6B7280"/><name val="맑은 고딕"/><family val="2"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="맑은 고딕"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F2937"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE5E7EB"/></left><right style="thin"><color rgb="FFE5E7EB"/></right><top style="thin"><color rgb="FFE5E7EB"/></top><bottom style="thin"><color rgb="FFE5E7EB"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

    const sheetName = (opt.sheetTitle || '상세페이지').replace(/[\\\/\?\*\[\]:]/g, '').slice(0, 31);
    const exts = [...new Set(imgs.map(i => i.ext))];
    const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${exts.map(e => `<Default Extension="${e}" ContentType="image/${e === 'jpg' ? 'jpeg' : e}"/>`).join('')}<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.unshift(
      { name: '[Content_Types].xml', data: ct },
      { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>` },
      { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(opt.title)}</dc:title><dc:creator>상세페이지 문안 자동화</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created></cp:coreProperties>` },
      { name: 'docProps/app.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>` },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="${esc(sheetName)}" sheetId="1" r:id="rId1"/><sheet name="문안 목록" sheetId="2" r:id="rId2"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: styles },
      { name: 'xl/worksheets/sheet1.xml', data: sheet1 },
      { name: 'xl/worksheets/_rels/sheet1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>` },
      { name: 'xl/worksheets/sheet2.xml', data: sheet2 },
      { name: 'xl/drawings/drawing1.xml', data: drawing },
      { name: 'xl/drawings/_rels/drawing1.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>` }
    );
    return zip(files);
  }

  G.FILES = { unzip, zip, parseDocx, buildXlsx, crc32 };
})(typeof window !== 'undefined' ? window : globalThis);
