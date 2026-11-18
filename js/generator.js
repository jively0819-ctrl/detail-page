/* =========================================================
   문안 생성 엔진 v2 — 입력(제품명 · 전성분 · (선택)대표성분) → 브랜드 상세 레이아웃의 '모든 문구 자리'별 문안
   - 기존 디자인요청서(엑셀) 문안 톤은 js/tone.js 사전에 정리되어 있습니다.
   - 레이아웃(layouts/<브랜드>/layout.js)의 블록 type 하나 = 상세 이미지 위 문구 자리 하나
   - 외부 AI 호출 없이 동작 → 같은 입력이면 항상 같은 문안
   ========================================================= */
(function (G) {
  const ING = G.ING, TONE = G.TONE;
  const { CAT, T, GROUPS, KIND } = TONE;
  /* ---------- 한글 조사 ---------- */
  function jong(word) {
    const s = String(word || '').replace(/[\s\)\]\}'"”’®™⁺+]+$/, '');
    const ch = s.slice(-1);
    if (!ch) return 0;
    const c = ch.charCodeAt(0);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
    if (/[0-9]/.test(ch)) return { '0': 21, '1': 8, '3': 16, '6': 1, '7': 8, '8': 8 }[ch] || 0;
    if (/[lL]/.test(ch)) return 8;
    if (/[mnMN]/.test(ch)) return 4;
    return 0;
  }
  function josa(word, pair) {
    const [a, b] = pair.split('/');
    const j = jong(word);
    if (pair === '으로/로') return word + (j === 0 || j === 8 ? '로' : '으로');
    if (pair === '이란/란') return word + (j ? '이란' : '란');
    return word + (j ? a : b);
  }
  /* ---------- 전성분 파싱 ---------- */
  const norm = s => String(s || '').replace(/\s+/g, '').replace(/[()\[\]{}]/g, '').toLowerCase();
  const INDEX = {};
  ING.LIST.forEach(it => { INDEX[norm(it.k)] = it; (it.a || []).forEach(a => { if (!INDEX[norm(a)]) INDEX[norm(a)] = it; }); });
  function splitInci(text) {
    let s = String(text || '').replace(/^\s*(\[?전성분\]?\s*[:：]?)/, '');
    s = s.replace(/\r/g, '').replace(/[，、;；\n]+/g, ',').replace(/·/g, ',');
    return s.split(/(?<!\d),|,(?!\d)/).map(x => x.trim().replace(/^[\-•\*]+/, '').replace(/[\.。]$/, '').trim()).filter(x => x && x.length < 80);
  }
  function plantName(name) {
    return name.replace(/(잎|꽃|뿌리|열매|씨|줄기|껍질|싹|순|과피|엽|근)*(추출물|가루|오일|수|즙|발효여과물|여과물)$/, '').replace(/(잎|꽃|뿌리|열매|씨|줄기|껍질)$/, '') || name;
  }
  function lookup(raw) {
    const n = norm(raw.replace(/\(.*?\)/g, '').replace(/\d+(\.\d+)?\s?(%|ppm|mg)/gi, ''));
    if (INDEX[n]) { const it = INDEX[n]; return Object.assign({ known: true, base: it.p === 0 }, it, { raw }); }
    const k = raw.replace(/\s+/g, '').replace(/\(.*?\)/g, '');
    if (ING.BASE.test(k)) return { k, raw, en: '', c: 'moist', h: '', d: '', p: 0, base: true, known: false, func: '' };
    let c = 'soothe', h, d, p = 3;
    const pl = plantName(k);
    if (/가루$|파우더$/.test(k)) { c = 'powder'; h = `${pl} 원물 파우더`; d = `${josa(pl, '을/를')} 곱게 갈아 담아 피부를 부드럽게 감싸줍니다.`; p = 4; }
    else if (/발효|용해물$/.test(k)) { c = 'glow'; h = '발효에서 얻은 생기'; d = `발효 과정을 거친 ${josa(k, '이/가')} 피부에 생기와 윤기를 더해 줍니다.`; p = 4; }
    else if (/오일$|버터$/.test(k)) { c = 'nourish'; h = `${pl}에서 얻은 영양감`; d = `${pl}에서 얻은 ${/버터$/.test(k) ? '버터' : '오일'}가 피부에 영양감과 촉촉함을 더해 줍니다.`; p = 3; }
    else if (/(꽃|잎)?수$|워터$/.test(k)) { c = 'moist'; h = `${pl}의 촉촉함`; d = `${pl}에서 얻은 수분이 피부에 촉촉함을 더해 줍니다.`; p = 3; }
    else if (/펩타이드/.test(k)) { c = 'smooth'; h = '피부결을 위한 펩타이드'; d = '펩타이드 성분이 피부를 매끄럽고 촉촉하게 가꾸어 줍니다.'; p = 5; }
    else if (/세라마이드/.test(k)) { c = 'barrier'; h = '피부 지질 유사 성분, 세라마이드'; d = '세라마이드가 피부 표면에 촉촉한 보호막을 형성해 줍니다.'; p = 6; }
    else if (/하이알루로/.test(k)) { c = 'moist'; h = '수분을 끌어당기는 히알루론산'; d = '히알루론산 성분이 피부에 촉촉한 수분감을 채워줍니다.'; p = 5; }
    else if (/추출물$/.test(k)) { c = 'soothe'; h = `${pl}에서 얻은 편안함`; d = `${pl}에서 얻은 성분이 피부를 촉촉하고 편안하게 가꾸어 줍니다.`; p = 3; }
    else { return { k, raw, en: '', c: 'moist', h: '', d: '', p: 1, base: true, known: false, func: '' }; }
    return { k, raw, en: '', c, h, d, p, base: false, known: false, guess: true, func: '' };
  }
  function analyze(inciText) {
    const items = splitInci(inciText).map((raw, idx) => Object.assign(lookup(raw), { idx }));
    const functional = [];
    items.forEach(it => ING.FUNCTIONAL.forEach(f => { if (f.re.test(it.k)) { if (!functional.find(x => x.k === it.k)) functional.push({ k: it.k, type: f.type }); } }));
    return { items, functional };
  }
  function recommend(an, exclude, n, declaredFn) {
    exclude = (exclude || []).map(norm);
    const fnd = String(declaredFn || '');
    const fnOf = k => (an.functional.find(f => f.k === k) || {}).type || '';
    const seen = {};
    const pool = an.items.filter(it => !it.base && it.d && exclude.indexOf(norm(it.k)) < 0 && exclude.indexOf(norm(it.raw)) < 0)
      .filter(it => { const t = fnOf(it.k); return !t || fnd.indexOf(t.replace(/\(.*\)/, '')) >= 0; })
      .filter(it => { if (seen[it.k]) return false; seen[it.k] = 1; return true; })
      .map(it => ({ it, s: it.p + Math.max(0, 2 - it.idx * 0.08) }));
    const out = []; const usedCat = {};
    while (out.length < (n || 3) && pool.length) {
      pool.forEach(o => { o.ss = o.s - (usedCat[o.it.c] ? 3 : 0); });
      pool.sort((a, b) => b.ss - a.ss);
      const o = pool.shift(); out.push(o.it.k); usedCat[o.it.c] = 1;
    }
    return out;
  }
  /* ---------- 제품 유형 (사용법 기본값) ---------- */
  const KINDS = {
    modeling: { usage: ['세안 후, 가벼운 기초 케어로 피부 결을 정돈합니다.', '고무볼에 모델링 분말과 물을 잘 섞어 원하는 농도를 맞춰줍니다.', '스파츌러로 얼굴 전체에 도톰하게 펴 바르고, 바깥 라인을 도톰하게 발라 고정해 줍니다.', '15~20분 후 모델링팩이 굳으면 떼어낸 뒤 토너로 남은 잔여물을 정돈합니다.'], steps: ['Powder', 'Gel', 'Peel-off'], cats: ['soothe', 'cool', 'moist'] },
    balm: { usage: ['마른 손과 얼굴에 적당량을 덜어 줍니다.', '얼굴 전체에 부드럽게 롤링하며 메이크업과 노폐물을 녹여냅니다.', '물을 소량 묻혀 유화시킨 뒤 미온수로 깨끗하게 헹궈냅니다.'], steps: ['Balm', 'Oil', 'Emulsion'], cats: ['clean', 'nourish', 'moist'] },
    cleanoil: { usage: ['마른 손과 얼굴에 2~3펌프 덜어 줍니다.', '얼굴 전체에 부드럽게 롤링하며 메이크업을 녹여냅니다.', '물을 소량 묻혀 유화시킨 뒤 미온수로 헹궈냅니다.'], steps: ['Oil', 'Emulsion', 'Rinse'], cats: ['clean', 'nourish', 'moist'] },
    foam: { usage: ['손에 적당량을 덜어 물과 함께 충분히 거품을 냅니다.', '얼굴 전체를 부드럽게 마사지하듯 세안합니다.', '미온수로 깨끗하게 헹궈냅니다.'], steps: ['Cream', 'Foam', 'Rinse'], cats: ['clean', 'moist', 'soothe'] },
    meltgommage: { usage: ['클렌징까지 완료한 후, 본품 적당량을 덜어 물기 없는 얼굴에 펴 발라 줍니다.', '밤에서 오일로, 후에 고마쥬로 변하며 피부의 불필요한 각질 및 노폐물을 부드럽게 정돈해 줍니다.', '충분히 마사지한 후, 약간의 물을 더하여 한 번 더 롤링하고 미온수로 깨끗이 세안해 줍니다.'], steps: ['Cleansing Balm', 'Oil', 'Gommage'], cats: ['smooth', 'clean', 'nourish'] },
    gommage: { usage: ['세안 후 물기를 닦은 얼굴에 적당량을 펴 바릅니다.', '1~2분 후 가볍게 롤링하면 묵은 각질이 부드럽게 밀려납니다.', '미온수로 깨끗하게 헹궈냅니다.'], steps: ['Gel', 'Rolling', 'Rinse'], cats: ['smooth', 'clean', 'moist'] },
    pad: { usage: ['세안 후 패드 한 장을 꺼냅니다.', '피부결을 따라 얼굴 전체를 부드럽게 닦아냅니다.', '남은 에센스를 가볍게 두드려 흡수시킵니다.'], steps: ['Pad', 'Essence', 'Finish'], cats: ['smooth', 'moist', 'soothe'] },
    sheet: { usage: ['세안 후 토너로 피부결을 정돈합니다.', '마스크 시트를 얼굴에 밀착시킵니다.', '15~20분 후 떼어내고 남은 에센스를 가볍게 두드려 흡수시킵니다.'], steps: ['Sheet', 'Essence', 'Finish'], cats: ['moist', 'soothe', 'glow'] },
    washoff: { usage: ['세안 후 물기를 닦아냅니다.', '눈가와 입가를 피해 얼굴 전체에 적당량을 펴 바릅니다.', '10~15분 후 미온수로 깨끗하게 헹궈냅니다.'], steps: ['Cream', 'Fit', 'Rinse'], cats: ['fresh', 'moist', 'smooth'] },
    sleeping: { usage: ['스킨케어 마지막 단계에서 적당량을 덜어 줍니다.', '얼굴 전체에 얇게 펴 바릅니다.', '다음 날 아침 미온수로 세안합니다.'], steps: ['Gel Cream', 'Fit', 'Sleep'], cats: ['moist', 'barrier', 'glow'] },
    massage: { usage: ['세안 후 적당량을 덜어 얼굴에 펴 바릅니다.', '안쪽에서 바깥쪽으로 부드럽게 마사지합니다.', '티슈로 닦아낸 뒤 미온수로 헹궈냅니다.'], steps: ['Cream', 'Massage', 'Finish'], cats: ['nourish', 'moist', 'soothe'] },
    toner: { usage: ['세안 후 적당량을 손 혹은 솜에 덜어냅니다.', '아침/저녁으로 피부 결을 따라 부드럽게 흡수시켜 줍니다.'], steps: ['Water', 'Layering', 'Finish'], cats: ['moist', 'soothe', 'smooth'] },
    mist: { usage: ['얼굴에서 20~30cm 정도 거리를 두고 골고루 분사합니다.', '가볍게 두드려 흡수시킵니다.'], steps: ['Spray', 'Layering', 'Finish'], cats: ['moist', 'cool', 'soothe'] },
    serum: { usage: ['토너로 피부결을 정돈한 뒤 적당량을 덜어 줍니다.', '얼굴 전체에 펴 바르고 가볍게 두드려 흡수시킵니다.'], steps: ['Drop', 'Spread', 'Finish'], cats: ['moist', 'glow', 'smooth'] },
    lotion: { usage: ['토너와 세럼 사용 후 적당량을 덜어 줍니다.', '얼굴 전체에 펴 바르고 가볍게 두드려 흡수시킵니다.'], steps: ['Lotion', 'Spread', 'Finish'], cats: ['moist', 'soothe', 'smooth'] },
    cream: { usage: ['스킨케어 마지막 단계에서 적당량을 덜어 줍니다.', '얼굴 전체에 부드럽게 펴 바릅니다.', '가볍게 두드려 흡수시킵니다.'], steps: ['Cream', 'Spread', 'Finish'], cats: ['moist', 'barrier', 'soothe'] }
  };
  const TYPES = [
    { kw: ['모델링 마스크', '모델링마스크', '모델링 팩', '모델링팩', '고무팩', '모델링'], ko: '모델링 마스크', en: 'Modeling Mask', short: 'Mask', kind: 'modeling' },
    { kw: ['클렌징 밤', '클렌징밤'], ko: '클렌징 밤', en: 'Cleansing Balm', short: 'Balm', kind: 'balm' },
    { kw: ['클렌징 오일', '클렌징오일'], ko: '클렌징 오일', en: 'Cleansing Oil', short: 'Oil', kind: 'cleanoil' },
    { kw: ['멜팅 봄므', '멜팅봄므', '멜팅 밤', '멜팅밤', '고마쥬 밤', '고마쥬밤', '고마쥬 봄므'], ko: '고마쥬', en: 'Gommage', short: 'Baume', kind: 'meltgommage' },
    { kw: ['클렌징 폼', '클렌징폼', '폼 클렌저', '폼클렌저', '클렌저', '클렌징'], ko: '클렌징 폼', en: 'Cleansing Foam', short: 'Foam', kind: 'foam' },
    { kw: ['고마쥬'], ko: '고마쥬', en: 'Gommage', short: 'Gommage', kind: 'gommage' },
    { kw: ['필링 젤', '필링젤', '필링'], ko: '필링 젤', en: 'Peeling Gel', short: 'Gel', kind: 'gommage' },
    { kw: ['토너 패드', '토너패드', '패드'], ko: '토너 패드', en: 'Toner Pad', short: 'Pad', kind: 'pad' },
    { kw: ['시트 마스크', '시트마스크', '마스크팩', '마스크 팩', '마스크 시트'], ko: '시트 마스크', en: 'Sheet Mask', short: 'Mask', kind: 'sheet' },
    { kw: ['슬리핑 마스크', '슬리핑마스크', '슬리핑팩', '슬리핑 팩'], ko: '슬리핑 마스크', en: 'Sleeping Mask', short: 'Mask', kind: 'sleeping' },
    { kw: ['워시오프', '클레이 마스크', '클레이마스크', '클레이', '머드'], ko: '워시오프 마스크', en: 'Wash-off Mask', short: 'Mask', kind: 'washoff' },
    { kw: ['마사지 크림', '마사지크림'], ko: '마사지 크림', en: 'Massage Cream', short: 'Cream', kind: 'massage' },
    { kw: ['토너', '스킨'], ko: '토너', en: 'Toner', short: 'Toner', kind: 'toner' },
    { kw: ['미스트'], ko: '미스트', en: 'Mist', short: 'Mist', kind: 'mist' },
    { kw: ['앰플'], ko: '앰플', en: 'Ampoule', short: 'Ampoule', kind: 'serum' },
    { kw: ['세럼'], ko: '세럼', en: 'Serum', short: 'Serum', kind: 'serum' },
    { kw: ['에센스'], ko: '에센스', en: 'Essence', short: 'Essence', kind: 'serum' },
    { kw: ['로션', '에멀전', '에멀젼'], ko: '로션', en: 'Lotion', short: 'Lotion', kind: 'lotion' },
    { kw: ['젤 크림', '젤크림'], ko: '젤 크림', en: 'Gel Cream', short: 'Cream', kind: 'cream' },
    { kw: ['크림'], ko: '크림', en: 'Cream', short: 'Cream', kind: 'cream' },
    { kw: ['젤', '겔'], ko: '젤', en: 'Gel', short: 'Gel', kind: 'cream' },
    { kw: ['밤'], ko: '밤', en: 'Balm', short: 'Balm', kind: 'balm' },
    { kw: ['마스크', '팩'], ko: '마스크', en: 'Mask', short: 'Mask', kind: 'washoff' }
  ];
  function detectType(name) {
    const s = String(name || '');
    for (const t of TYPES) for (const k of t.kw) if (s.indexOf(k) >= 0) return Object.assign({}, t, KINDS[t.kind], { tone: KIND[t.kind] || KIND.cream });
    return Object.assign({ ko: '스킨케어', en: 'Skincare', short: 'Care', kind: 'cream' }, KINDS.cream, { tone: KIND.cream });
  }
  /* ---------- 영문 제품명 ---------- */
  const EN = { '프리미엄': 'Premium', '브이-핏': 'V-Fit', '브이핏': 'V-Fit', '모델링': 'Modeling', '마스크': 'Mask', '팩': 'Pack', '크림': 'Cream', '레스큐': 'Rescue', '수분': 'Hydrating', '앰플': 'Ampoule', '세럼': 'Serum', '토너': 'Toner', '패드': 'Pad', '클렌징': 'Cleansing', '밤': 'Balm', '오일': 'Oil', '폼': 'Foam', '젤': 'Gel', '데일리': 'Daily', '시카': 'Cica', '콜라겐': 'Collagen', '히알루론': 'Hyaluronic', '펩타이드': 'Peptide', '비타': 'Vita', '골드': 'Gold', '블랙': 'Black', '아쿠아': 'Aqua', '에스테틱': 'Esthetic', '프로페셔널': 'Professional', '래디언스': 'Radiance', '솔루션': 'Solution', '쿨링': 'Cooling', '하이드레이팅': 'Hydrating', '퓨어': 'Pure', '마일드': 'Mild', '딥': 'Deep', '고마쥬': 'Gommage', '멜팅': 'Melting', '봄므': 'Baume', '슬리핑': 'Sleeping', '워시오프': 'Wash-off', '시트': 'Sheet', '미스트': 'Mist', '에센스': 'Essence', '로션': 'Lotion', '스킨': 'Skin', '글로우': 'Glow', '모이스처': 'Moisture', '모이스트': 'Moist', '릴리프': 'Relief', '카밍': 'Calming', '밸런싱': 'Balancing', '캡슐': 'Capsule', '병풀': 'Centella', '어성초': 'Houttuynia', '녹차': 'Green Tea', '쑥': 'Mugwort', '율무': 'Coix', '세라마이드': 'Ceramide', '판테놀': 'Panthenol', '알로에': 'Aloe', '티트리': 'Tea Tree', '쌀': 'Rice', '라이스': 'Rice', '꿀': 'Honey', '허니': 'Honey', '프로폴리스': 'Propolis', '레티놀': 'Retinol', '비타민': 'Vitamin', '멀티': 'Multi', '인텐시브': 'Intensive', '부스팅': 'Boosting', '스파': 'Spa', '머드': 'Mud', '클레이': 'Clay', '핑크': 'Pink', '블루': 'Blue', '그린': 'Green', '로즈': 'Rose', '라벤더': 'Lavender', '캐모마일': 'Chamomile', '시그니처': 'Signature', '오리지널': 'Original', '플러스': 'Plus', '더블': 'Double', '트리플': 'Triple', '젤리': 'Jelly', '워터': 'Water', '버블': 'Bubble', '필링': 'Peeling', '스크럽': 'Scrub', '토닝': 'Toning', '아이': 'Eye', '바디': 'Body', '핸드': 'Hand', '립': 'Lip', '소프트': 'Soft', '스무스': 'Smooth', '엑스트라': 'Extra', '울트라': 'Ultra', '슈퍼': 'Super', '하이드로': 'Hydro', '에너지': 'Energy', '바이탈': 'Vital', '쿨': 'Cool', '젠틀': 'Gentle', '클리어': 'Clear', '클린': 'Clean', '파우더': 'Powder', '엑토인': 'Ectoin', '마데카': 'Madeca', '마데카소사이드': 'Madecassoside', '나이아신아마이드': 'Niacinamide', '스쿠알란': 'Squalane', '글루타치온': 'Glutathione', '바쿠치올': 'Bakuchiol', '인삼': 'Ginseng', '홍삼': 'Red Ginseng', '진주': 'Pearl', '카카오': 'Cacao', '클로렐라': 'Chlorella', '스피루리나': 'Spirulina', '감초': 'Licorice', '작약': 'Peony', '연꽃': 'Lotus', '동백': 'Camellia', '석류': 'Pomegranate', '레몬': 'Lemon', '자몽': 'Grapefruit', '오트': 'Oat', '귀리': 'Oat', '보습': 'Moisture', '탄력': 'Firming', '영양': 'Nourishing', '리치': 'Rich', '라이트': 'Light', '포어': 'Pore', '샷': 'Shot', '포뮬러': 'Formula', '에디션': 'Edition', '세트': 'Set', '키트': 'Kit', '리필': 'Refill', '대용량': 'Large', '인퓨전': 'Infusion', '리페어': 'Repair', '센시티브': 'Sensitive', '바이옴': 'Biome', '엑소좀': 'Exosome' };
  function englishName(ko) {
    const toks = String(ko || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return '';
    const out = [];
    for (const t of toks) {
      if (/^[\x00-\x7F]+$/.test(t)) { out.push(t); continue; }
      if (EN[t]) { out.push(EN[t]); continue; }
      const it = INDEX[norm(t)];
      if (it && it.en) { out.push(it.en.replace(/\s*\(.*?\)/g, '')); continue; }
      const m = t.match(/^(.*?)(\d+(\.\d+)?%)$/);
      if (m && EN[m[1]]) { out.push(EN[m[1]] + ' ' + m[2]); continue; }
      if (m && /^\d/.test(t)) { out.push(t); continue; }
      if (t.indexOf('-') > 0) { const parts = t.split('-').map(x => EN[x]); if (parts.every(Boolean)) { out.push(parts.join('-')); continue; } }
      return '';
    }
    return out.join(' ');
  }
  const VOL_RE = /\s*(\d+(?:\.\d+)?\s?(?:ml|mL|ML|g|kg|KG|l|L|매|ea|EA|개입)(?:\s?[\(\[]\s?\d+\s?(?:매|ea|개)\s?[\)\]])?(?:\s?[x×\*]\s?\d+)?)\s*$/;
  function splitVolume(name, vol) {
    let title = String(name || '').trim(), v = String(vol || '').trim();
    const m = title.match(VOL_RE);
    if (m) { title = title.slice(0, m.index).trim(); if (!v) v = m[1].trim(); }
    return { title, volume: v };
  }
  /* ---------- 입력 점검 ---------- */
  function checkInput(input, an) {
    const w = [];
    if (!String(input.name || '').trim()) w.push({ level: 'err', msg: '제품명을 입력해 주세요.' });
    if (!an.items.length) w.push({ level: 'err', msg: '전성분을 붙여넣어 주세요. (상품정보제공고시의 전성분 그대로)' });
    const all = an.items.map(i => norm(i.k));
    (input.mains || []).filter(Boolean).forEach(m => {
      if (all.length && all.indexOf(norm(m)) < 0 && !an.items.some(i => norm(i.raw).indexOf(norm(m)) >= 0) && !(INDEX[norm(m)] && all.indexOf(norm(INDEX[norm(m)].k)) >= 0))
        w.push({ level: 'warn', msg: `대표성분 "${m}"이(가) 전성분에 없습니다. 성분 표준명을 확인해 주세요.` });
    });
    const nm = String(input.name || '');
    const named = an.items.filter(i => !i.base && i.k.length >= 2 && nm.replace(/\s/g, '').indexOf(plantName(i.k)) >= 0 && plantName(i.k).length >= 2);
    if (named.length && !String(input.content || '').trim() && !/\d+(\.\d+)?\s?%/.test(nm))
      w.push({ level: 'warn', msg: `제품명에 성분명(${named.map(i => i.k).slice(0, 3).join(', ')})이 들어가 있습니다. 화장품법 시행규칙에 따라 해당 성분의 함량 표기가 필요합니다. (선택 입력 > 대표성분 함량)` });
    if (an.functional.length) {
      const types = [...new Set(an.functional.map(f => f.type))];
      const declared = String(input.functional || '');
      const miss = types.filter(t => declared.indexOf(t.replace(/\(.*\)/, '')) < 0);
      if (miss.length) w.push({ level: 'info', msg: `기능성 고시 성분 포함: ${an.functional.map(f => f.k).join(', ')} → 기능성 심사(보고) 전이라면 ${miss.join(', ')} 관련 표현은 자동으로 제외합니다.` });
    }
    const unknown = an.items.filter(i => !i.known && !i.base);
    if (unknown.length) w.push({ level: 'info', msg: `사전에 없는 성분 ${unknown.length}개는 이름 규칙으로 설명을 작성합니다: ${unknown.slice(0, 6).map(i => i.k).join(', ')}${unknown.length > 6 ? ' 외' : ''}` });
    return w;
  }

  /* =========================================================
     문안 컨텍스트 — 성분 하나하나를 '톤 아이템'으로 변환
     ========================================================= */
  const L = (r, t, extra) => Object.assign({ r, t: t == null ? '' : String(t) }, extra || {});
  const pad2 = n => String(n).padStart(2, '0');
  const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => v[k] != null ? v[k] : m);
  const FEEL = { moist: '보습감', soothe: '편안함', smooth: '매끄러움', glow: '생기', barrier: '탄탄함', nourish: '영양감', fresh: '산뜻함', clean: '개운함', cool: '청량감', powder: '부드러움' };
  const NOUN = { moist: '고보습', soothe: '데일리 컴포트', smooth: '결 정돈', glow: '생기 케어', barrier: '수분막 케어', nourish: '고영양', fresh: '밸런싱', clean: '마일드', cool: '쿨링', powder: '원물' };
  // '…가꾸어 줍니다.' → '…가꾸는 데 도움' (엑셀 문안처럼 명사형으로 끝맺기)
  function toNounEnd(s) {
    s = String(s || '').trim();
    const R = [[/더해 ?줍니다\.?$/, '더하는 데 도움'], [/가꾸어 ?줍니다\.?$/, '가꾸는 데 도움'], [/채워 ?줍니다\.?$/, '채우는 데 도움'], [/감싸 ?줍니다\.?$/, '감싸는 데 도움'],
      [/형성해 ?줍니다\.?$/, '형성하는 데 도움'], [/정돈해 ?줍니다\.?$/, '정돈하는 데 도움'], [/도와 ?줍니다\.?$/, '돕는 성분'], [/보호해 ?줍니다\.?$/, '보호하는 데 도움'],
      [/선사합니다\.?$/, '선사'], [/해 ?줍니다\.?$/, '하는 데 도움'], [/줍니다\.?$/, '주는 데 도움'], [/합니다\.?$/, '함'], [/\.$/, '']];
    for (const [re, to] of R) if (re.test(s)) return s.replace(re, to);
    return s;
  }
  function originOf(it) {
    const m = String(it.d || '').match(/^(.+?에서 (얻은|유래한))/);
    if (m) return m[1].replace('유래한', '얻은');
    if (it.guess || /추출물$|오일$|가루$|버터$/.test(it.k)) return `${plantName(it.k)}에서 얻은`;
    return '';
  }
  function canonT(k) {
    if (T[k]) return T[k];
    const it = INDEX[norm(k)];
    return it && T[it.k] ? T[it.k] : null;
  }
  function parsePct(text) {
    const out = {};
    String(text || '').replace(/([가-힣A-Za-z][가-힣A-Za-z0-9\-]*)\s?(\d+(?:\.\d+)?\s?%)/g, (m, k, p) => { out[norm(k)] = p.replace(/\s/g, ''); return m; });
    return out;
  }
  function toneItem(it, pct) {
    if (!it) return null;
    if (it.group) return it;
    const t = canonT(it.k) || {};
    const c = CAT[it.c] ? it.c : 'moist';
    const CT = CAT[c];
    const disp = t.disp || it.k;
    const p = pct[norm(disp)] || pct[norm(it.k)] || '';
    const origin = t.origin || originOf(it) || CT.v.origin;
    const en = t.enName || String(it.en || '').replace(/\s*\(.*?\)/g, '') || disp;
    const ben = t.ben || (it.d ? toNounEnd(it.d) : CT.d.benLine);
    return {
      k: it.k, raw: it.raw || it.k, disp, pct: p, dispPct: p ? `${disp} ${p}` : disp, c, en, enSub: t.enSub || disp, enCat: t.enCat || en,
      mod: t.mod || (it.h && it.h.indexOf(',') < 0 ? it.h : CT.d.mod), ben, origin, dispLong: t.dispLong || disp, feat: t.feat || CT.v.bubble,
      why: t.why || [`${josa(disp, '을/를')} 담아`, CT.v.whyEnd], card: t.card || CT.v.card, concept: t.concept, story: t.story, call: t.call,
      mov: t.mov || [`${origin} ${josa(disp, '으로/로')}`, CT.v.mov, CT.v.res], movTitle: t.movTitle || disp,
      info: t.info, sub: t.sub, res: t.res, points: t.points, pts: t.pts || CT.v.pts, hero: t.hero, ord: t.ord, rich: !!t.mov, p: it.p || 5, idx: it.idx || 0
    };
  }
  function findGroups(an, exclude) {
    const ex = (exclude || []).map(norm);
    const out = [];
    GROUPS.forEach(g => {
      const mem = []; const seen = {};
      an.items.forEach(i => { if (g.re.test(i.k) && !seen[i.k] && ex.indexOf(norm(i.k)) < 0) { seen[i.k] = 1; mem.push(i); } });
      if (mem.length >= g.min && !out.some(o => o.members.some(m => mem.indexOf(m) >= 0))) {
        const n = mem.length, ko = g.ko(n);
        out.push({ group: 1, id: g.id, k: ko, raw: ko, disp: ko, dispPct: ko, dispLong: ko, pct: '', c: g.c, en: g.en(n), enSub: ko, enCat: g.en(n),
          mod: g.mod, ben: g.ben, origin: CAT[g.c].v.origin, feat: g.feat, why: [`${josa(ko, '을/를')} 담아`, CAT[g.c].v.whyEnd], card: g.card, point: g.point,
          mov: [`${josa(ko, '을/를')} 함께 담아`, CAT[g.c].v.mov, CAT[g.c].v.res], movTitle: ko, pts: CAT[g.c].v.pts, members: mem, p: 6, idx: mem[0].idx });
      }
    });
    return out;
  }
  const uniq = arr => arr.filter(Boolean).filter((x, i, a) => a.findIndex(y => y.disp === x.disp) === i);
  function buildContext(brand, input) {
    const an = analyze(input.inci);
    const { title, volume } = splitVolume(input.name, input.volume);
    const type = detectType(title || input.name);
    const pct = Object.assign(parsePct(title), parsePct(input.content));
    const groups0 = findGroups(an, []);
    const groupedK = groups0.reduce((a, g) => a.concat(g.members.map(x => x.k)), []);
    let mainsK = (input.mains || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 3);
    const userMains = mainsK.length;
    if (mainsK.length < 3) mainsK = mainsK.concat(recommend(an, mainsK.concat(groupedK), 3 - mainsK.length, input.functional));
    const pick = k => {
      const hit = an.items.find(i => norm(i.k) === norm(k)) || an.items.find(i => norm(i.raw).indexOf(norm(k)) >= 0) || (INDEX[norm(k)] && an.items.find(i => i.k === INDEX[norm(k)].k));
      return hit || lookup(k);
    };
    const mainsRaw = mainsK.map(pick).filter(m => m && (m.d || canonT(m.k)));
    let mains = mainsRaw.map(m => toneItem(m, pct));
    if (!userMains) mains = mains.map((m, i) => ({ m, i })).sort((a, b) => ((a.m.ord || 9) - (b.m.ord || 9)) || a.i - b.i).map(o => o.m);
    const groups = findGroups(an, mainsRaw.map(m => m.k));
    const grouped = groups.reduce((a, g) => a.concat(g.members.map(x => x.k)), []);
    const support = recommend(an, mainsRaw.map(m => m.k).concat(grouped), 4, input.functional).map(k => toneItem(pick(k), pct));
    // 피부 고민 카테고리 3개 (대표성분 → 복합 그룹 → 제품 유형 기본값)
    const cats = [];
    if (type.tone && type.tone.lead) type.cats.forEach(c => { if (cats.indexOf(c) < 0) cats.push(c); });
    mains.forEach(m => { if (cats.indexOf(m.c) < 0) cats.push(m.c); });
    groups.forEach(g => { if (cats.length < 3 && cats.indexOf(g.c) < 0) cats.push(g.c); });
    type.cats.forEach(c => { if (cats.length < 3 && cats.indexOf(c) < 0) cats.push(c); });
    const C3 = cats.slice(0, 3).map(c => CAT[c]);
    const four = uniq([mains[0], mains[1], groups[0], mains[2], support[0], support[1]]).slice(0, 4);
    const cards = uniq([support[0], groups[0], support[1], support[2], support[3], groups[1]]).slice(0, 4);
    const heroIt = mains.concat(support).find(m => m.hero) || mains.concat(support).find(m => m.c === 'smooth' || m.c === 'powder') || mains[0];
    const nameEn = String(input.nameEn || '').trim() || englishName(title);
    const sig = an.items.find(i => /포도세포|포도줄기세포|포도캘러스/.test(i.k));
    return { brand, input, an, title, volume, type, K: type.tone, mains, groups, support, four, cards, heroIt, cats: cats.slice(0, 3), C3, nameEn, fn: String(input.functional || ''), pct,
      sig: sig ? toneItem(sig, pct) : null, irr: !!String(input.irrResult || '').trim(), clin: !!(String(input.clinResult || '').trim() || String(input.clinTitle || '').trim()) };
  }
  const c3 = (c, i) => c.C3[i] || c.C3[c.C3.length - 1] || CAT.moist;
  const joinWa = arr => arr.length > 1 ? arr.slice(0, -2).map(x => x + ',').concat([josa(arr[arr.length - 2], '과/와')]).join(' ') + ' ' + arr[arr.length - 1] : (arr[0] || '');
  const usageSteps = c => {
    const u = String(c.input.usage || '').trim();
    const st = u ? u.split(/\n+/).map(x => x.replace(/^\s*(STEP\.?\s*\d+\.?|\d+[\.\)])\s*[:：]?\s*/i, '').trim()).filter(Boolean) : c.type.usage.slice();
    if (!u && st[0] && st[0].indexOf('적당량') >= 0 && c.brand.id === 'drsthe') st[0] = st[0].replace('본품 ', '').replace('적당량', `${c.title} 적당량`);
    return st;
  };
  const PH = t => [L('note', t, { ph: 1 })];

  /* =========================================================
     블록 문안 — 닥터에스떼 (「엑토인 1% 레스큐 토너」 요청서 톤)
     ========================================================= */
  const S = {};
  S.dLine = c => [L('배지', c.input.line || c3(c, 0).en)];
  S.dTitle = c => [L('title', c.title, { name: 1 })];
  S.dEnVol = c => [L('en', [c.nameEn, c.volume].filter(Boolean).join(' ') || c.title)];
  S.dTag = c => [L('h3', `${c3(c, 0).adj} 피부에 ${c3(c, 1).ben} 첫번째 솔루션!`)];
  S.dKey = (c, i) => {
    const m = c.mains;
    const v = [c3(c, 0).short, m[1] ? m[1].dispPct : c3(c, 1).short, m[0] ? m[0].dispPct : c.type.ko, `${c3(c, 0).label}, ${c3(c, 1).label}`][i];
    return v ? [L('소본문', v)] : null;
  };
  S.dType = c => [L('소본문', `제품 타입 : ${c.type.en} Type`)];
  S.dConcept = c => {
    const m = c.mains[0];
    const src = (m && m.concept) || c3(c, 0).d.concept;
    return src.map(s => L('headline', fill(s, { ing: m ? m.disp : c.title })));
  };
  S.dFeat = (c, i) => {
    const m = c.mains;
    if (i === 0) return [L('body', `${joinWa(m.slice(0, 2).map(x => x.dispPct))} 함유로`), L('h3', c3(c, 0).d.featEnd)];
    if (i === 1) { const C = c3(c, 1); return [L('body', C.d.feat[0]), L('h3', C.d.feat[1])]; }
    return [L('body', c.K.feel[0]), L('h3', c.K.feel[1])];
  };
  S.dCard = (c, i) => { const src = [c3(c, 0).d.card, c.K.texCard, c3(c, 2).d.card][i]; return [L('h3', src[0]), L('소본문', src[1])]; };
  S.dRecH = c => [L('h3', c.title, { name: 1 }), L('headline', '이런 분들께 추천 드려요!')];
  S.dRec = (c, i) => {
    if (i === 2) return [L('h3', '모든 피부'), L('소본문', `약한 피부부터 건강한 피부까지 데일리로 사용 가능한 순한 ${josa(c.type.ko, '을/를')} 원하시는 분`)];
    const r = c3(c, i).d.rec;
    return [L('h3', r[0]), L('소본문', r[1])];
  };
  S.dEnTitle = c => [L('대제목', c.nameEn || c.title)];
  S.dMeet = c => {
    const ks = c.mains.slice(0, 2).map(m => m.disp);
    return [L('h3', `${ks.length ? josa(joinWa(ks), '으로/로') + ' 완성하는, ' : ''}${c3(c, 0).d.meet}`), L('h3', `${josa(c.title, '을/를')} 만나보세요.`)];
  };
  S.dIng = (c, i) => { const m = c.four[i]; return m ? [L('h3', `${m.mod}, ${m.dispPct}`), L('소본문', m.ben)] : null; };
  S.dPoint = (c, i) => {
    let src;
    if (i === 0) src = c3(c, 0).d.point;
    else if (i === 1) src = (c.groups[0] && c.groups[0].point) || (c.four[2] ? CAT[c.four[2].c].d.point : c3(c, 1).d.point);
    else src = c.K.texHead;
    return [L('eyebrow', `POINT ${pad2(i + 1)}`), L('headline', src[0]), L('headline', src[1])];
  };
  S.dSteps = c => {
    const m = c.mains;
    const a = m[0] ? `${josa(m[0].dispPct, '으로/로')} ${CAT[m[0].c].d.verb}` : '';
    const b = m[1] ? `${josa(m[1].dispPct, '으로/로')} ${CAT[m[1].c].d.verb}` : '';
    return [L('body', `STEP 1: ${c3(c, 0).d.step}`), (a || b) ? L('body', `STEP 2: ${[b, a].filter(Boolean).join(' 및 ')}`) : null];
  };
  S.dWhat = c => [L('대제목', c.mains[0] ? c.mains[0].en : c.nameEn)];
  S.dClin = c => {
    const t = c.input;
    if (c.clin) return [L('body', `항목: ${t.clinTitle || '인체적용시험'}`, { ev: 1 }), t.clinResult ? L('body', `결과: ${t.clinResult}`, { ev: 1 }) : null];
    const m = c.mains[0]; if (!m) return null;
    const st = m.story || [`${m.mod}, ${m.disp}`, m.ben];
    return st.map((s, k) => L(k ? 'body' : 'h3', s));
  };
  S.dClinC = c => {
    const t = c.input;
    if (c.clin) return [t.clinInfo ? L('meta', `(${t.clinInfo.replace(/^\(|\)$/g, '')})`, { ev: 1 }) : null, L('note', '*시험 결과는 개인에 따라 차이가 있을 수 있습니다.')];
    return PH('[인체적용시험 결론 자리] 시험 자료가 있으면 선택 입력에 넣고 다시 생성 · 없으면 이 칸 삭제');
  };
  S.dNote = () => [L('note', '*상기의 설명은 원료적 특성에 한함.')];
  S.dWhat2 = c => { const g = c.four[2] || c.mains[1]; return g ? [L('대제목', g.en)] : null; };
  S.dWhat2Lbl = c => { const g = c.four[2] || c.mains[1]; return g ? [L('h3', g.disp), L('캡션', g.en)] : null; };
  S.dCall = (c, i) => {
    if (i === 0) return [L('소본문', '피부에 닿는 순간'), L('h3', `풍부한 ${FEEL[c.cats[0]] || '보습감'} 부여`)];
    if (i === 1) { const m = c.four[3] || c.mains[2] || c.mains[0]; if (!m) return null; const s = m.call || [m.mod, `${m.dispPct} 함유`]; return [L('소본문', s[0]), L('h3', s[1])]; }
    return [L('소본문', c.K.finish[0]), L('h3', c.K.finish[1])];
  };
  S.dIrrLbl = c => c.irr ? [L('소본문', /민감/.test(c.input.irrResult + c.input.irrInfo) ? '민감성' : '피부 자극')] : PH('[자극 테스트 구분]');
  S.dIrr = c => c.irr ? [L('소본문', c.input.irrResult, { ev: 1 })] : PH('[피부 자극 테스트 자료 없음] 자료를 입력하면 결과 문구가 들어갑니다 · 없으면 디자인에서 제외');
  S.dIrrInfo = c => c.input.irrInfo ? [L('캡션', c.input.irrInfo, { ev: 1 })] : null;
  S.dSum = c => { const s = c3(c, 0).d.sum; return [L('headline', s[0]), L('headline', s[1]), L('title', c.title, { name: 1 })]; };
  S.dTex = c => {
    const ks = c.mains.slice(0, 2).map(m => m.dispPct);
    const body = fill(c.K.texBody, { noun: `${NOUN[c.cats[0]] || ''} ${c.type.ko}`.trim(), name: c.title }).split(' / ');
    return [L('body', `${ks.length ? josa(joinWa(ks), '이/가') + ' 함유되어, ' : ''}${body[0]}`), L('body', body[1])];
  };
  S.dHowH = c => [L('h3', c.title, { name: 1 })];
  S.dHow = c => { const out = []; usageSteps(c).slice(0, 3).forEach((s, k) => { out.push(L('label', `STEP ${pad2(k + 1)}`)); out.push(L('body', s)); }); return out; };
  S.dTip = c => [L('label', 'TIP'), L('body', fill(c.K.tip, { name: c.title }))];
  S.dRtLine = c => [L('배지', c.input.line || c3(c, 0).en)];
  S.dRtTitle = c => [L('headline', c.mains[0] ? c.mains[0].disp : c.title)];
  S.dRtSub = c => [L('소본문', `${c3(c, 0).label} · ${c3(c, 1).label} 케어`)];
  S.dLineup = (c, i) => i === 0 ? [L('소본문', c.title, { name: 1 })] : PH(`[라인업 제품 ${i + 1}]`);
  /* 상품정보제공고시 표 칸 */
  const fnText = c => c.fn ? `${c.fn}${c.input.funcNo ? ' (' + c.input.funcNo + ')' : ''}` : '해당 없음';
  S.infoName = c => [L('캡션', `${c.brand.infoPrefix || ''}${c.title}`, { x: 1 })];
  S.infoVol = c => [L('캡션', c.volume || '-', { x: 1 })];
  S.infoUse = c => [L('캡션', usageSteps(c).join(' '), { x: 1 })];
  S.infoFunc = c => [L('캡션', fnText(c), { x: 1 })];
  S.infoInci = c => [L('캡션', c.an.items.map(e => e.raw).join(', '), { x: 1 })];

  /* =========================================================
     블록 문안 — 벨리닉 (「고마쥬 멜팅 봄므」 요청서 · 완성 상세 톤)
     ========================================================= */
  const VB = c => (c.brand.story || {});
  S.vHero = c => {
    const keys = [];
    if (c.input.line) keys.push(c.input.line);
    if (c.sig) keys.push(c.sig.en); else c.mains.slice(0, keys.length ? 1 : 2).forEach(m => keys.push(m.en));
    return [L('대제목', c.nameEn || c.title), keys.length ? L('en', keys.join(' · ')) : null, L('label', c.irr ? '피부 자극 테스트 완료' : `${c3(c, 0).care} ${c.type.ko}`)];
  };
  const bubbles = c => uniq([c.mains[0], c.heroIt, c.mains[1], c.mains[2]]).slice(0, 3);
  S.vBubble = (c, i) => { const m = bubbles(c)[i]; return m ? [L('캡션', m.enCat), L('h3', m.origin), L('h3', m.dispLong), L('캡션', m.feat)] : null; };
  S.vBrandEn = c => (VB(c).en || []).map(s => L('소본문', s, { x: 1 }));
  S.vNameMark = c => [L('h3', c.title, { name: 1 }), L('캡션', c.nameEn)];
  S.vStory = c => { const s = VB(c); return [L('eyebrow', 'BRAND STORY'), ...(s.head || []).map(t => L('headline', t, { x: 1 })), ...(s.body || []).map(t => L('소본문', t, { x: 1 }))]; };
  S.vSciH = c => {
    const s = VB(c);
    if (c.sig && s.sci) return [L('eyebrow', 'BELINIC SCIENCE'), ...s.sci.head.map(t => L('headline', t, { x: 1 })), ...s.sci.body.map(t => L('소본문', t, { x: 1 }))];
    const m = c.mains[0]; if (!m) return null;
    return [L('eyebrow', 'BELINIC SCIENCE'), L('headline', `${m.origin} ${m.disp}`), L('headline', m.feat), L('소본문', m.ben)];
  };
  S.vSciIng = c => {
    const m = c.sig || c.mains[0]; if (!m) return null;
    const s = VB(c);
    if (c.sig && s.sci) return [L('대제목', m.en), L('headline', s.sci.ko), L('소본문', s.sci.koEn), ...s.sci.desc.map(t => L('소본문', t, { x: 1 }))];
    return [L('대제목', m.en), L('headline', m.mod), ...(m.story || [m.ben]).map(t => L('소본문', t))];
  };
  S.vSciPts = c => { const m = c.sig || c.mains[0]; return [L('소본문', ((m && m.pts) || c3(c, 0).v.pts).join('   ·   '))]; };
  const soft = c => c.irr ? '저자극' : '부드러운';
  const careW = c => c.K.care || c3(c, 0).care;
  const NOUN2 = { moist: '보습', soothe: '컨디셔닝', smooth: '결 정돈', glow: '컨디셔닝', barrier: '컨디셔닝', nourish: '영양', fresh: '밸런스', clean: '세정', cool: '쿨링', powder: '원물 케어' };
  const extraCats = c => { const out = []; c.support.concat(c.mains).forEach(m => { if (m && out.indexOf(m.c) < 0) out.push(m.c); }); return out; };
  const pickWords = (c, dict, n) => { const out = []; extraCats(c).forEach(k => { const w = dict[k]; if (w && out.indexOf(w) < 0) out.push(w); }); c.cats.forEach(k => { const w = dict[k]; if (w && out.indexOf(w) < 0) out.push(w); }); return out.slice(0, n); };
  const heroWord = c => c.heroIt ? (c.heroIt.hero || c.heroIt.disp) : c.title;
  S.vHeroBadge = c => [L('label', `${josa(heroWord(c), '을/를')} 담은 ${soft(c)} ${careW(c)}`)];
  S.vHeroHead = c => c3(c, 0).v.hero.map(t => L('headline', t));
  S.vHeroName = c => [L('title', c.title, { name: 1 }), L('en', c.nameEn)];
  S.vMethodT = c => c.K.method ? [L('대제목', `What is ${c.type.en}?`), L('h3', `${josa(c.type.ko, '이란/란')} 무엇일까?`)] : [L('대제목', `What is ${c.nameEn || c.title}?`), L('h3', `${josa(c.title, '이란/란')} 무엇일까?`)];
  S.vMethodB = c => {
    if (c.K.method) return c.K.method.map(t => L('body', t));
    const ks = c.mains.slice(0, 2).map(m => m.disp);
    return [L('body', `${josa(ks.join(' · '), '을/를')} 함께 담아,`), L('body', `${josa(c.K.texHead.join(' '), '으로/로')} 완성한`), L('body', c3(c, 0).v.sum[0])];
  };
  S.vDiffH = c => [L('eyebrow', `The Difference of ${c.nameEn || c.title}`), L('headline', `${josa(c.title, '이/가')} 다른 이유`)];
  S.vDiffB = c => [L('body', `단순 ${c.K.care ? c.K.care.replace('고마쥬', '각질') : c3(c, 0).care}에 머무르지 않고`), L('h3', `피부 ${pickWords(c, NOUN2, 2).join(' · ')}까지 세심하게 고려하여`), L('label', `하나의 ${c.K.form} 안에 함께 담아 배합했습니다.`)];
  S.vWhyH = c => [L('대제목', `Why. ${c.nameEn || c.title}?`), L('h3', `왜 ${c.title}일까?`)];
  const whys = c => {
    const kw = c.K.why || [];
    const out = [];
    const add = w => { if (w && out.length < 5 && !out.some(o => o[0] === w[0])) out.push(w); };
    add(c.heroIt && c.heroIt.why); add(kw[0]); add(kw[1]);
    c.mains.forEach(m => add(m.why));
    c.cards.forEach(m => add(m.why));
    return out;
  };
  S.vWhy = (c, i) => { const w = whys(c)[i]; return w ? [L('소본문', w[0]), L('h3', w[1])] : null; };
  S.vNote = () => [L('캡션', '*상기의 설명은 원료적 특성에 한함.')];
  S.vTexH = c => { const t = c.K.texLines || [c.K.texHead.join(' '), c.K.feel[0], '어떤 피부든 부담 없이 편안하게 사용 가능!']; return [L('body', t[0]), L('headline', t[1]), L('label', t[2])]; };
  S.vTexSteps = c => [L('label', (c.K.steps || c.type.steps).join('   >   '))];
  S.vCoreH = c => [L('eyebrow', 'BELINIC SCIENCE'), L('headline', '피부에 닿는 순간'), L('headline', `부드러운 ${pickWords(c, FEEL, 1)[0] || '영양감'} 선사`), L('소본문', `${c.title} 핵심 성분`)];
  const core = c => uniq(c.mains.filter(m => m.rich).concat(c.sig ? [c.sig] : []).concat(c.mains)).sort((a, b) => (a.ord || 9) - (b.ord || 9)).slice(0, 3);
  S.vCoreTag = (c, i) => { const m = core(c)[i]; return m ? [L('h3', `+ ${m.en}`), L('캡션', m.enSub)] : null; };
  S.vMov = (c, i) => { const m = core(c)[i]; return m ? [L('headline', m.movTitle), L('body', m.mov[0]), L('h3', m.mov[1]), L('keypoint', `>>> ${m.mov[2]}`)] : null; };
  S.vMovInfo = (c, i) => { const m = core(c)[i]; if (!m) return null; const s = m.info || [`${m.disp} 원료 포인트`, m.mod, m.feat]; return [L('h3', s[0]), L('소본문', s[1]), L('소본문', s[2])]; };
  S.vMovStory = (c, i) => { const m = core(c)[i]; if (!m) return null; const s = m.story || [`${m.mod}, ${m.disp}`, m.ben]; return s.map((t, k) => L(k ? 'sm' : 'h3', t)); };
  S.vMovPt = (c, i) => {
    const m = core(c)[0]; if (!m) return null;
    const C = i === 0 ? CAT[m.c] : c3(c, 1);
    const p = (m.points && m.points[i]) || [C.v.point[0], C.v.point[1], C.d.benLine];
    return [L('eyebrow', `Point.${pad2(i + 1)}`), L('headline', p[0]), L('h3', p[1]), L('소본문', p[2])];
  };
  S.vMovCap = () => PH('[원료사 시험 자료(그래프) 영역] 원료사 자료가 있으면 결과 문구를 입력 · 없으면 그래프와 함께 삭제');
  S.vMovSub = (c, i) => { const m = core(c)[i]; if (!m) return null; const s = m.sub || [m.mod, `${m.feat}, ${m.disp}`]; return [L('h3', s[0]), L('headline', s[1])]; };
  S.vMovRes = (c, i) => { const m = core(c)[i]; if (!m) return null; const s = m.res || [CAT[m.c].v.res, m.ben]; return [L('keypoint', `>> ${s[0]}`), L('keypoint', s[1])]; };
  S.vSynH = c => [L('h3', '핵심 원료들의 시너지 효과를 통한'), L('headline', '다각도 피부 고민 케어'), L('label', `${josa(heroWord(c), '을/를')} 담은 ${c.K.texHead[1]}의 ${soft(c)} ${careW(c)}`)];
  S.vCard = (c, i) => { const m = c.cards[i]; return m ? [L('캡션', m.en), L('h3', m.disp), L('소본문', m.card)] : null; };
  S.vMeet = c => [L('headline', c3(c, 0).v.meet), L('headline', `${josa(c.title, '을/를')} 만나보세요.`)];
  S.vSumList = c => {
    const a = c3(c, 0).v.sum;
    const b = [c.K.texHead.join(' '), c.K.finish.join(' ')];
    const ks = c.mains.slice(0, 2).map(m => m.disp);
    const fw = pickWords(c, FEEL, 2);
    const d = [`${josa(ks.join(' · '), '을/를')} 함께 담은 컨디셔닝 ${c.K.noun || c.type.ko}`, `${c.K.after || '사용 후'} ${fw.length > 1 ? josa(fw[0], '과/와') + ' ' + fw[1] + ' 모두 챙기는' : '촉촉하게 정돈되는'} 부드러운 마무리감`];
    const out = [];
    [a, b, d].forEach(x => { out.push(L('h3', `+ ${x[0]}`)); out.push(L('소본문', x[1])); });
    return out;
  };
  S.vIrrH = c => c.irr ? [L('headline', '피부 자극 테스트 완료')] : PH('[피부 자극 테스트 자료 없음] 자료를 입력하면 제목 · 결과가 들어갑니다 · 없으면 디자인에서 제외');
  S.vIrrB = c => c.irr ? [L('소본문', c.input.irrResult, { ev: 1 }), L('캡션', '*모든 사람에게 자극이 없다는 의미는 아닙니다.')] : null;
  S.vIrrInfo = c => c.input.irrInfo ? [L('캡션', c.input.irrInfo, { ev: 1 })] : null;
  S.vRecH = () => [L('headline', '이런 분들께 추천드립니다!')];
  S.vRec = (c, i) => {
    const r = [c.K.rec, c.K.rec2 || c3(c, 1).v.rec, c3(c, 0).v.rec, ['식물 유래 성분으로 부담 없는', `${c.K.stage.replace(/(부터|까지|으로|로|에서)$/, '').trim()} 루틴을 채우고 싶으신 분`]][i];
    return r ? [L('body', r[0]), L('h3', r[1])] : null;
  };
  S.vHowH = c => [L('headline', `${c.title} 사용 가이드`)];
  S.vHow = (c, i) => {
    const s = usageSteps(c)[i]; if (!s) return null;
    const out = [L('label', `STEP. ${pad2(i + 1)}`), L('body', s)];
    if (i === 1 && c.K.tip) out.push(L('note', `TIP ${fill(c.K.tip, { name: c.title })}`));
    return out;
  };

  /* ---------- 블록 이름 (편집 화면 · 엑셀 [문안 목록]) ---------- */
  const LABELS = {
    dLine: '라인 배지', dTitle: '제품명', dEnVol: '영문명 · 용량', dTag: '한 줄 카피', dKey: '키포인트', dType: '제품 타입', dConcept: '콘셉트 헤드라인', dFeat: '특징', dCard: '특징 카드',
    dRecH: '추천 타이틀', dRec: '추천 대상', dEnTitle: '영문 제품명', dMeet: '제품 소개', dIng: '성분 소개', dPoint: 'POINT 타이틀', dSteps: '케어 STEP', dWhat: 'What is 성분', dClin: '시험 · 성분 설명',
    dClinC: '시험 결론', dNote: '원료 특성 표기', dWhat2: 'What is 성분 2', dWhat2Lbl: '성분 2 라벨', dCall: '성분 콜아웃', dIrrLbl: '자극 테스트 구분', dIrr: '피부 자극 테스트', dIrrInfo: '시험 정보',
    dSum: '제품 요약', dTex: '텍스처 설명', dHowH: '사용법 타이틀', dHow: '사용법', dTip: 'TIP', dRtLine: '루틴 배지', dRtTitle: '루틴 타이틀', dRtSub: '루틴 설명', dLineup: '라인업',
    infoName: '고시-제품명', infoVol: '고시-용량', infoUse: '고시-사용법', infoFunc: '고시-기능성', infoInci: '고시-전성분',
    vHero: '인트로', vBubble: '성분 버블', vBrandEn: '브랜드 영문', vNameMark: '제품명 마크', vStory: '브랜드 스토리', vSciH: '벨리닉 사이언스', vSciIng: '대표 원료', vSciPts: '원료 키워드',
    vHeroBadge: '메인 배지', vHeroHead: '메인 헤드라인', vHeroName: '메인 제품명', vMethodT: 'What is 타이틀', vMethodB: 'What is 설명', vDiffH: '차별점 타이틀', vDiffB: '차별점 설명',
    vWhyH: 'Why 타이틀', vWhy: 'Why 포인트', vNote: '원료 특성 표기', vTexH: '텍스처', vTexSteps: '텍스처 단계', vCoreH: '핵심 성분 타이틀', vCoreTag: '핵심 성분 태그', vMov: '악장 성분',
    vMovInfo: '악장 원료 정보', vMovStory: '악장 원료 설명', vMovPt: '악장 Point', vMovCap: '원료 자료 캡션', vMovSub: '악장 서브', vMovRes: '악장 결과', vSynH: '시너지 타이틀', vCard: '원료 카드',
    vMeet: '제품 소개', vSumList: '요약 리스트', vIrrH: '자극 테스트 타이틀', vIrrB: '자극 테스트 결과', vIrrInfo: '시험 정보', vRecH: '추천 타이틀', vRec: '추천 대상', vHowH: '사용 가이드 타이틀', vHow: '사용 가이드'
  };

  function generate(brandId, input, layout) {
    const brand = Object.assign({ id: brandId }, G.CONFIG.brands[brandId]);
    const c = buildContext(brand, input);
    const blocks = [];
    layout.blocks.forEach(b => {
      const fn = S[b.type];
      if (!fn) return;
      let lines = fn(c, b.i || 0);
      if (!lines) return;
      lines = lines.filter(Boolean).filter(l => l.t !== '');
      if (!lines.length) return;
      const ph = lines.length === 1 && lines[0].ph;
      blocks.push({ id: b.id, type: b.type, label: (LABELS[b.type] || b.type) + (b.i != null ? ' ' + (b.i + 1) : ''), x: b.x, y: b.y, w: b.w, align: b.align || 'center', ph: ph ? 1 : 0, lines });
    });
    return {
      blocks,
      ctx: { title: c.title, volume: c.volume, nameEn: c.nameEn, type: c.type.ko, mains: c.mains.map(m => m.disp), cats: c.cats, functional: c.fn,
        protect: [c.title, input.name, c.nameEn].concat(c.an.items.map(e => e.k)).concat(c.mains.map(m => m.disp)).concat(c.groups.map(g => g.disp)) }
    };
  }
  G.GEN = { analyze, recommend, detectType, englishName, splitVolume, checkInput, generate, josa, norm, lookup, LABELS, buildContext };
})(typeof window !== 'undefined' ? window : globalThis);
