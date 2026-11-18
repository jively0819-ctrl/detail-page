/* =========================================================
   문안 생성 엔진 — 입력(제품명·용량·대표성분·전성분) → 상세페이지 레이아웃별 문안
   외부 AI 호출 없이 성분 사전 + 제품유형 규칙으로 작성 → 표현 검사까지 자동
   ========================================================= */
(function (G) {
  const ING = G.ING;

  /* ---------- 한글 조사 ---------- */
  function jong(word) {
    const s = String(word || '').replace(/[\s\)\]\}'"”’]+$/, '');
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
  ING.LIST.forEach(it => { INDEX[norm(it.k)] = it; it.a.forEach(a => { INDEX[norm(a)] = it; }); });

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
    else if (/발효/.test(k)) { c = 'glow'; h = '발효에서 얻은 생기'; d = `발효 과정을 거친 ${josa(k, '이/가')} 피부에 생기와 윤기를 더해 줍니다.`; p = 4; }
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
    const pool = an.items.filter(it => !it.base && it.d && exclude.indexOf(norm(it.k)) < 0)
      .filter(it => { const t = fnOf(it.k); return !t || fnd.indexOf(t.replace(/\(.*\)/, '')) >= 0; })
      .map(it => ({ it, s: it.p + Math.max(0, 2 - it.idx * 0.08) }));
    const out = []; const usedCat = {};
    while (out.length < (n || 3) && pool.length) {
      pool.forEach(o => { o.ss = o.s - (usedCat[o.it.c] ? 3 : 0); });
      pool.sort((a, b) => b.ss - a.ss);
      const o = pool.shift(); out.push(o.it.k); usedCat[o.it.c] = 1;
    }
    return out;
  }

  /* ---------- 제품 유형 ---------- */
  const KINDS = {
    modeling: {
      usage: ['세안 후, 가벼운 기초 케어로 피부 결을 정돈합니다.', '고무볼에 모델링 분말과 물을 잘 섞어 원하는 농도를 맞춰줍니다.', '스파츌러로 얼굴 전체에 도톰하게 펴 바르고, 팩이 안정적으로 고정될 수 있도록 바깥 라인을 도톰하게 발라줍니다.', '15~20분 후 모델링팩이 굳으면 떼어낸 뒤 토너를 사용하여 남은 잔여물을 제거해 줍니다.', '기초 크림으로 마무리합니다.'],
      tip: 'TIP. 고무볼 · 스파츌러 함께 사용하기 : 별도 증정되지 않으니, 필요 시 옵션에서 선택 구매해 주세요.',
      texture: '물과 섞으면 부드럽게 개어지는 파우더', steps: ['파우더', '젤', '고무막'],
      method: '파우더를 물과 섞어 바르면 부드럽게 굳으며 피부에 밀착되는 마스크로, 떼어내는 순간까지 촉촉하고 산뜻한 사용감을 선사합니다.',
      cats: ['soothe', 'cool', 'moist'], care: '모델링 마스크 케어'
    },
    balm: { usage: ['마른 손과 얼굴에 적당량을 덜어 줍니다.', '얼굴 전체에 부드럽게 롤링하며 메이크업과 노폐물을 녹여냅니다.', '물을 소량 묻혀 유화시킨 뒤 미온수로 깨끗하게 헹궈냅니다.'], tip: 'TIP. 동봉된 스파츌러로 덜어 사용하면 위생적으로 사용할 수 있습니다.', texture: '부드럽게 녹아드는 멜팅 밤', steps: ['밤', '오일', '에멀전'], method: '단단한 밤 제형이 피부 온도에 사르르 녹아 오일로 변하며, 물과 만나면 우유처럼 유화되어 깔끔하게 헹궈지는 클렌저입니다.', cats: ['clean', 'nourish', 'moist'], care: '클렌징 케어' },
    cleanoil: { usage: ['마른 손과 얼굴에 2~3펌프 덜어 줍니다.', '얼굴 전체에 부드럽게 롤링하며 메이크업을 녹여냅니다.', '물을 소량 묻혀 유화시킨 뒤 미온수로 헹궈냅니다.'], tip: '', texture: '가볍게 퍼지는 오일', steps: ['오일', '에멀전', '헹굼'], method: '가벼운 오일이 메이크업과 노폐물을 녹여내고, 물과 만나 유화되어 깔끔하게 헹궈지는 클렌저입니다.', cats: ['clean', 'nourish', 'moist'], care: '클렌징 케어' },
    foam: { usage: ['손에 적당량을 덜어 물과 함께 충분히 거품을 냅니다.', '얼굴 전체를 부드럽게 마사지하듯 세안합니다.', '미온수로 깨끗하게 헹궈냅니다.'], tip: '', texture: '쫀쫀한 거품', steps: ['크림', '거품', '헹굼'], method: '풍성한 거품이 피부 노폐물을 부드럽게 감싸 씻어내는 클렌저입니다.', cats: ['clean', 'moist', 'soothe'], care: '클렌징 케어' },
    gommage: { usage: ['세안 후 물기를 닦은 얼굴에 적당량을 펴 바릅니다.', '1~2분 후 가볍게 문지르면 각질이 부드럽게 밀려납니다.', '미온수로 깨끗하게 헹궈냅니다.'], tip: 'TIP. 주 1~2회 사용을 권장합니다.', texture: '부드러운 젤', steps: ['젤', '롤링', '헹굼'], method: '피부에 펴 바른 뒤 문지르면 묵은 각질이 부드럽게 밀려나는 방식으로, 피부결을 매끄럽게 정돈합니다.', cats: ['smooth', 'clean', 'moist'], care: '고마쥬 케어' },
    pad: { usage: ['세안 후 패드 한 장을 꺼냅니다.', '피부결을 따라 얼굴 전체를 부드럽게 닦아냅니다.', '남은 에센스를 가볍게 두드려 흡수시킵니다.'], tip: 'TIP. 건조한 부위에 3~5분간 올려 두면 마스크처럼 사용할 수 있습니다.', texture: '에센스를 머금은 패드', steps: ['패드', '에센스', '마무리'], method: '에센스를 듬뿍 머금은 패드로 피부결을 정돈하고 촉촉함을 더하는 스킨케어입니다.', cats: ['smooth', 'moist', 'soothe'], care: '패드 케어' },
    sheet: { usage: ['세안 후 토너로 피부결을 정돈합니다.', '마스크 시트를 얼굴에 밀착시킵니다.', '15~20분 후 떼어내고 남은 에센스를 가볍게 두드려 흡수시킵니다.'], tip: '', texture: '촉촉한 에센스', steps: ['시트', '에센스', '마무리'], method: '에센스를 머금은 시트가 피부에 밀착되어 촉촉함을 채워주는 마스크입니다.', cats: ['moist', 'soothe', 'glow'], care: '마스크 케어' },
    washoff: { usage: ['세안 후 물기를 닦아냅니다.', '눈가와 입가를 피해 얼굴 전체에 적당량을 펴 바릅니다.', '10~15분 후 미온수로 깨끗하게 헹궈냅니다.'], tip: 'TIP. 주 2~3회 사용을 권장합니다.', texture: '부드럽게 펴 발리는 크림 제형', steps: ['크림', '밀착', '헹굼'], method: '피부에 펴 바른 뒤 일정 시간 후 씻어내는 마스크로, 피부를 산뜻하게 정돈합니다.', cats: ['fresh', 'moist', 'smooth'], care: '마스크 케어' },
    sleeping: { usage: ['스킨케어 마지막 단계에서 적당량을 덜어 줍니다.', '얼굴 전체에 얇게 펴 바릅니다.', '다음 날 아침 미온수로 세안합니다.'], tip: '', texture: '가볍게 스며드는 젤 크림', steps: ['젤 크림', '밀착', '수면'], method: '자는 동안 피부를 촉촉하게 감싸주는 마스크입니다.', cats: ['moist', 'barrier', 'glow'], care: '나이트 케어' },
    massage: { usage: ['세안 후 적당량을 덜어 얼굴에 펴 바릅니다.', '안쪽에서 바깥쪽으로 부드럽게 마사지합니다.', '티슈로 닦아낸 뒤 미온수로 헹궈냅니다.'], tip: '', texture: '부드럽게 미끄러지는 크림', steps: ['크림', '마사지', '마무리'], method: '부드러운 크림 제형이 마사지하는 동안 피부를 촉촉하게 감싸줍니다.', cats: ['nourish', 'moist', 'soothe'], care: '마사지 케어' },
    toner: { usage: ['세안 후 화장솜 또는 손에 적당량을 덜어 줍니다.', '피부결을 따라 부드럽게 닦아내거나 가볍게 두드려 흡수시킵니다.'], tip: '', texture: '맑고 가벼운 워터', steps: ['워터', '흡수', '마무리'], method: '세안 후 첫 단계에서 피부결을 정돈하고 수분을 채워주는 토너입니다.', cats: ['moist', 'soothe', 'smooth'], care: '토너 케어' },
    mist: { usage: ['얼굴에서 20~30cm 정도 거리를 두고 골고루 분사합니다.', '가볍게 두드려 흡수시킵니다.'], tip: 'TIP. 메이크업 전후 수시로 사용해 보세요.', texture: '미세한 미스트', steps: ['분사', '흡수', '마무리'], method: '수시로 뿌려 촉촉함을 더해주는 미스트입니다.', cats: ['moist', 'cool', 'soothe'], care: '미스트 케어' },
    serum: { usage: ['토너로 피부결을 정돈한 뒤 적당량을 덜어 줍니다.', '얼굴 전체에 펴 바르고 가볍게 두드려 흡수시킵니다.'], tip: '', texture: '가볍게 스며드는 세럼', steps: ['드롭', '스프레딩', '흡수'], method: '농축된 제형이 피부에 가볍게 스며들어 촉촉함을 채워주는 스킨케어입니다.', cats: ['moist', 'glow', 'smooth'], care: '집중 케어' },
    lotion: { usage: ['토너와 세럼 사용 후 적당량을 덜어 줍니다.', '얼굴 전체에 펴 바르고 가볍게 두드려 흡수시킵니다.'], tip: '', texture: '부드러운 로션', steps: ['로션', '스프레딩', '흡수'], method: '가벼운 로션 제형이 피부에 촉촉함을 더해주는 스킨케어입니다.', cats: ['moist', 'soothe', 'smooth'], care: '보습 케어' },
    cream: { usage: ['스킨케어 마지막 단계에서 적당량을 덜어 줍니다.', '얼굴 전체에 부드럽게 펴 바릅니다.', '가볍게 두드려 흡수시킵니다.'], tip: '', texture: '부드럽게 녹아드는 크림', steps: ['크림', '스프레딩', '흡수'], method: '피부에 부드럽게 녹아들어 촉촉함을 채워주는 크림입니다.', cats: ['moist', 'barrier', 'soothe'], care: '보습 케어' }
  };
  const TYPES = [
    { kw: ['모델링 마스크', '모델링마스크', '모델링 팩', '모델링팩', '고무팩', '모델링'], ko: '모델링 마스크', en: 'Modeling Mask', short: 'Mask', kind: 'modeling' },
    { kw: ['클렌징 밤', '클렌징밤'], ko: '클렌징 밤', en: 'Cleansing Balm', short: 'Balm', kind: 'balm' },
    { kw: ['클렌징 오일', '클렌징오일'], ko: '클렌징 오일', en: 'Cleansing Oil', short: 'Oil', kind: 'cleanoil' },
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
    { kw: ['밤'], ko: '밤', en: 'Balm', short: 'Balm', kind: 'cream' },
    { kw: ['마스크', '팩'], ko: '마스크', en: 'Mask', short: 'Mask', kind: 'washoff' }
  ];
  function detectType(name) {
    const s = String(name || '');
    for (const t of TYPES) for (const k of t.kw) if (s.indexOf(k) >= 0) return Object.assign({}, t, KINDS[t.kind]);
    return Object.assign({ ko: '스킨케어', en: 'Skincare', short: 'Care', kind: 'cream' }, KINDS.cream);
  }

  /* ---------- 영문 제품명 ---------- */
  const EN = { '프리미엄': 'Premium', '브이-핏': 'V-Fit', '브이핏': 'V-Fit', '모델링': 'Modeling', '마스크': 'Mask', '팩': 'Pack', '크림': 'Cream', '레스큐': 'Rescue', '수분': 'Hydrating', '앰플': 'Ampoule', '세럼': 'Serum', '토너': 'Toner', '패드': 'Pad', '클렌징': 'Cleansing', '밤': 'Balm', '오일': 'Oil', '폼': 'Foam', '젤': 'Gel', '데일리': 'Daily', '시카': 'Cica', '콜라겐': 'Collagen', '히알루론': 'Hyaluronic', '펩타이드': 'Peptide', '비타': 'Vita', '골드': 'Gold', '블랙': 'Black', '아쿠아': 'Aqua', '에스테틱': 'Esthetic', '프로페셔널': 'Professional', '래디언스': 'Radiance', '솔루션': 'Solution', '쿨링': 'Cooling', '하이드레이팅': 'Hydrating', '퓨어': 'Pure', '마일드': 'Mild', '딥': 'Deep', '고마쥬': 'Gommage', '슬리핑': 'Sleeping', '워시오프': 'Wash-off', '시트': 'Sheet', '미스트': 'Mist', '에센스': 'Essence', '로션': 'Lotion', '스킨': 'Skin', '글로우': 'Glow', '모이스처': 'Moisture', '모이스트': 'Moist', '릴리프': 'Relief', '카밍': 'Calming', '밸런싱': 'Balancing', '캡슐': 'Capsule', '병풀': 'Centella', '어성초': 'Houttuynia', '녹차': 'Green Tea', '쑥': 'Mugwort', '율무': 'Coix', '세라마이드': 'Ceramide', '판테놀': 'Panthenol', '알로에': 'Aloe', '티트리': 'Tea Tree', '쌀': 'Rice', '라이스': 'Rice', '꿀': 'Honey', '허니': 'Honey', '프로폴리스': 'Propolis', '레티놀': 'Retinol', '비타민': 'Vitamin', '멀티': 'Multi', '인텐시브': 'Intensive', '부스팅': 'Boosting', '스파': 'Spa', '머드': 'Mud', '클레이': 'Clay', '핑크': 'Pink', '블루': 'Blue', '그린': 'Green', '로즈': 'Rose', '라벤더': 'Lavender', '캐모마일': 'Chamomile', '시그니처': 'Signature', '오리지널': 'Original', '플러스': 'Plus', '더블': 'Double', '트리플': 'Triple', '젤리': 'Jelly', '워터': 'Water', '버블': 'Bubble', '필링': 'Peeling', '스크럽': 'Scrub', '토닝': 'Toning', '아이': 'Eye', '바디': 'Body', '핸드': 'Hand', '립': 'Lip', '소프트': 'Soft', '스무스': 'Smooth', '엑스트라': 'Extra', '울트라': 'Ultra', '슈퍼': 'Super', '하이드로': 'Hydro', '에너지': 'Energy', '바이탈': 'Vital', '쿨': 'Cool', '젠틀': 'Gentle', '클리어': 'Clear', '클린': 'Clean', '파우더': 'Powder', '엑토인': 'Ectoin', '마데카': 'Madeca', '마데카소사이드': 'Madecassoside', '나이아신아마이드': 'Niacinamide', '스쿠알란': 'Squalane', '글루타치온': 'Glutathione', '바쿠치올': 'Bakuchiol', '인삼': 'Ginseng', '홍삼': 'Red Ginseng', '진주': 'Pearl', '카카오': 'Cacao', '클로렐라': 'Chlorella', '스피루리나': 'Spirulina', '감초': 'Licorice', '작약': 'Peony', '연꽃': 'Lotus', '동백': 'Camellia', '석류': 'Pomegranate', '레몬': 'Lemon', '자몽': 'Grapefruit', '오트': 'Oat', '귀리': 'Oat', '보습': 'Moisture', '탄력': 'Firming', '영양': 'Nourishing', '리치': 'Rich', '라이트': 'Light', '포어': 'Pore', '샷': 'Shot', '포뮬러': 'Formula', '에디션': 'Edition', '세트': 'Set', '키트': 'Kit', '리필': 'Refill', '대용량': 'Large' };
  function englishName(ko) {
    const toks = String(ko || '').trim().split(/\s+/).filter(Boolean);
    if (!toks.length) return '';
    const out = [];
    for (const t of toks) {
      if (/^[\x00-\x7F]+$/.test(t)) { out.push(t); continue; }
      if (EN[t]) { out.push(EN[t]); continue; }
      const it = INDEX[norm(t)];
      if (it && it.en) { out.push(it.en); continue; }
      const m = t.match(/^(.*?)(\d+(\.\d+)?%)$/);
      if (m && EN[m[1]]) { out.push(EN[m[1]] + ' ' + m[2]); continue; }
      if (m && /^\d/.test(t)) { out.push(t); continue; }
      if (t.indexOf('-') > 0) { const parts = t.split('-').map(x => EN[x]); if (parts.every(Boolean)) { out.push(parts.join('-')); continue; } }
      return ''; // 사전에 없는 단어 → 직접 입력 필요
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
      if (all.length && all.indexOf(norm(m)) < 0 && !an.items.some(i => norm(i.raw).indexOf(norm(m)) >= 0))
        w.push({ level: 'warn', msg: `대표성분 "${m}"이(가) 전성분에 없습니다. 성분 표준명을 확인해 주세요.` });
    });
    const nm = String(input.name || '');
    const named = an.items.filter(i => !i.base && i.k.length >= 2 && nm.replace(/\s/g, '').indexOf(plantName(i.k)) >= 0 && plantName(i.k).length >= 2);
    if (named.length && !String(input.content || '').trim())
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

  /* ---------- 문안 생성 ---------- */
  const L = (r, t, extra) => Object.assign({ r, t: t == null ? '' : String(t) }, extra || {});
  const pad2 = n => String(n).padStart(2, '0');

  function buildContext(brand, input) {
    const an = analyze(input.inci);
    const { title, volume } = splitVolume(input.name, input.volume);
    const type = detectType(title || input.name);
    let mainsK = (input.mains || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 3);
    if (mainsK.length < 3) mainsK = mainsK.concat(recommend(an, mainsK, 3 - mainsK.length, input.functional));
    const mains = mainsK.map(k => {
      const hit = an.items.find(i => norm(i.k) === norm(k)) || an.items.find(i => norm(i.raw).indexOf(norm(k)) >= 0);
      const it = hit || lookup(k);
      return Object.assign({}, it, { k: hit ? hit.raw.replace(/\(.*?\)/g, '').trim() : k });
    }).filter(m => m.d);
    const fn = String(input.functional || '');
    // 카테고리(특징·추천 대상) 3개 — 대표성분 순서, 중복 시 보조 성분 → 제품유형 기본값
    const cats = [];
    mains.forEach(m => { if (cats.indexOf(m.c) < 0) cats.push(m.c); });
    an.items.filter(i => !i.base && i.p >= 4).sort((a, b) => b.p - a.p).forEach(i => { if (cats.length < 3 && cats.indexOf(i.c) < 0) cats.push(i.c); });
    type.cats.forEach(c => { if (cats.length < 3 && cats.indexOf(c) < 0) cats.push(c); });
    const nameEn = String(input.nameEn || '').trim() || englishName(title);
    return { brand, input, an, title, volume, type, mains, cats: cats.slice(0, 3), nameEn, fn };
  }

  function listJoin(arr) { return arr.join(' · '); }

  function headOnly(m) { const h = m.h || m.k; const i = h.lastIndexOf(', '); return i > 0 ? h.slice(0, i) : h; }

  const SECTIONS = {
    intro(c) {
      const ks = c.mains.map(m => m.k);
      const lines = [
        L('eyebrow', c.input.line || c.brand.lineDefault),
        L('title', c.title, { name: 1 }),
        c.nameEn ? L('en', c.nameEn) : null,
        c.volume ? L('meta', c.volume) : null,
        ks.length ? L('headline', `${josa(listJoin(ks), '을/를')} 담은 ${c.brand.tagPrefix} ${c.type.ko}`) : null,
        L('keypoint', c.cats.map(k => ING.CATS[k].kp).join('  |  ')),
        L('meta', c.type.short)
      ];
      if (c.input.content) lines.splice(4, 0, L('meta', `대표성분 함량 : ${c.input.content}`));
      return lines;
    },
    feature(c, i) { const k = c.cats[i]; if (!k) return null; const C = ING.CATS[k]; return [L('h3', C.title), L('body', C.desc)]; },
    recHeader() { return [L('headline', '이런 분들께 추천드려요')]; },
    rec(c, i) { const k = c.cats[i]; if (!k) return null; const C = ING.CATS[k]; return [L('h3', C.rec[0]), L('body', C.rec[1])]; },
    ingHeader(c) { return [c.nameEn ? L('eyebrow', c.nameEn) : null, L('headline', `${c.title}에 담긴 대표성분`)]; },
    ing(c, i) { const m = c.mains[i]; if (!m) return null; return [L('h3', `${headOnly(m)}, ${m.k}`), L('body', m.d)]; },
    ingNote() { return [L('note', '*상기의 설명은 원료적 특성에 한함')]; },
    stepHeader(c) { return [L('headline', `${c.type.care} STEP`)]; },
    step(c, i) {
      const m = c.mains[i]; if (!m) return null; const C = ING.CATS[m.c];
      return [L('eyebrow', `STEP ${pad2(i + 1)}`), L('h3', `${m.k} ${C.short}`), L('body', `${C.adj} ${josa(m.k, '으로/로')} ${josa(C.goal, '을/를')} 위한 관리를 더합니다.`)];
    },
    point(c, i) {
      const m = c.mains[i]; if (!m) return null;
      return [L('eyebrow', `POINT ${pad2(i + 1)}`), L('headline', headOnly(m)), L('h3', m.en ? `${m.k} (${m.en})` : m.k), L('body', m.d)];
    },
    clinical(c) {
      const t = c.input;
      if (!t.clinResult && !t.clinTitle) return [L('note', '[인체적용시험 자료 없음] 이 영역은 디자인에서 제외하거나, 시험 자료를 입력한 뒤 다시 생성해 주세요.')].map(x => Object.assign(x, { ph: 1 }));
      return [L('eyebrow', 'CLINICAL TEST'), L('headline', t.clinTitle || '인체적용시험 완료', { ev: 1 }), t.clinResult ? L('body', t.clinResult, { ev: 1 }) : null, t.clinInfo ? L('meta', `(${t.clinInfo.replace(/^\(|\)$/g, '')})`, { ev: 1 }) : null, L('note', '*시험 결과는 개인에 따라 차이가 있을 수 있습니다.')];
    },
    irritation(c) {
      const t = c.input;
      if (!t.irrResult) return [L('note', '[피부 자극 테스트 자료 없음] 이 영역은 디자인에서 제외하거나, 시험 자료를 입력한 뒤 다시 생성해 주세요.', { ph: 1 })];
      return [L('headline', '피부 자극 테스트 완료'), L('body', t.irrResult, { ev: 1 }), t.irrInfo ? L('meta', t.irrInfo, { ev: 1 }) : null, L('note', '*모든 사람에게 자극이 없다는 의미는 아닙니다.')];
    },
    summary(c) {
      const parts = c.mains.map(m => `${ING.CATS[m.c].adj} ${m.k}`);
      const goal = ING.CATS[c.cats[0] || 'moist'].goal;
      const body = parts.length ? `${josa(parts.join(', '), '을/를')} 담아 ${josa(goal, '으로/로')} 가꾸어 주는 ${c.brand.tagPrefix} ${c.type.ko}입니다.` : `${josa(goal, '으로/로')} 가꾸어 주는 ${c.brand.tagPrefix} ${c.type.ko}입니다.`;
      return [L('h3', c.brand.summaryLead), L('headline', c.title, { name: 1 }), L('body', body)];
    },
    howto(c) {
      const steps = (c.input.usage && c.input.usage.trim()) ? c.input.usage.split(/\n+/).map(s => s.replace(/^\s*(STEP\s*\d+\.?|\d+[\.\)])\s*/i, '').trim()).filter(Boolean) : c.type.usage;
      const out = [L('eyebrow', 'HOW TO USE'), L('headline', 'How To Use')];
      steps.forEach((s, i) => out.push(L('body', `STEP ${pad2(i + 1)}. ${s}`)));
      if (c.type.tip) out.push(L('note', c.type.tip));
      return out;
    },
    method(c) { return [L('eyebrow', `What is ${c.type.en}?`), L('headline', `${josa(c.type.ko, '이란/란')}?`), L('body', c.type.method)]; },
    diffHeader(c) { return [L('eyebrow', 'POINT'), L('headline', `${c.title}, 이렇게 다릅니다`)]; },
    texture(c) { return [L('eyebrow', 'TEXTURE'), L('headline', c.type.texture), L('keypoint', c.type.steps.join('  →  '))]; },
    info(c) {
      const B = c.brand.info, inp = c.input;
      const items = c.an.items.map(i => i.raw).join(', ');
      const fn = c.fn ? `${c.fn}${inp.funcNo ? ' (' + inp.funcNo + ')' : ''}` : '해당 없음';
      const x = { x: 1 };
      return [
        L('h3', '제품정보'),
        L('body', `제품명 : ${c.title}${c.volume ? ' ' + c.volume : ''}`, x),
        L('body', `용량 · 중량 : ${c.volume || '-'}`, x),
        L('body', '제품 주요 사양 : 모든 피부용', x),
        L('body', `사용기한 : ${inp.expiry || B.expiry || '제품 내 별도 표기'}`, x),
        L('body', '사용 방법 : 상세페이지 사용법 참조', x),
        L('body', `화장품제조업자 : ${inp.maker || B.maker || '(입력 필요)'}`, x),
        L('body', `화장품책임판매업자 : ${inp.seller || B.seller || '(입력 필요)'}`, x),
        L('body', `제조국 : ${B.country || '대한민국'}`, x),
        L('body', `식품의약품안전처 심사 필 유무 : ${fn}`, x),
        L('body', '품질보증기준 : 본 제품은 공정거래위원회 고시 「소비자분쟁해결기준」에 의거 교환 또는 보상 받을 수 있습니다.', x),
        L('body', `소비자상담 전화번호 : ${inp.phone || B.phone || '(입력 필요)'}`, x),
        L('h3', '전성분'),
        L('note', items, x),
        L('h3', '사용 시 주의사항'),
        L('note', '1) 화장품 사용 시 또는 사용 후 직사광선에 의하여 사용부위가 붉은 반점, 부어오름 또는 가려움증 등의 이상 증상이나 부작용이 있는 경우 전문의 등과 상담할 것 2) 상처가 있는 부위 등에는 사용을 자제할 것 3) 보관 및 취급 시의 주의사항 가) 어린이의 손이 닿지 않는 곳에 보관할 것 나) 직사광선을 피해서 보관할 것', x),
        inp.caution ? L('note', inp.caution, x) : null
      ];
    }
  };
  const LABELS = { intro: '인트로', feature: '핵심 특징', recHeader: '추천 대상 타이틀', rec: '추천 대상', ingHeader: '대표성분 타이틀', ing: '대표성분', ingNote: '원료 특성 표기', stepHeader: '케어 STEP 타이틀', step: '케어 STEP', point: '성분 POINT', clinical: '인체적용시험', irritation: '피부 자극 테스트', summary: '제품 요약', howto: '사용법', method: '제품 방식 설명', diffHeader: '차별점 타이틀', texture: '텍스처', info: '상품정보제공고시' };

  function generate(brandId, input, layout) {
    const brand = G.CONFIG.brands[brandId];
    const c = buildContext(brand, input);
    const blocks = [];
    layout.blocks.forEach(b => {
      const fn = SECTIONS[b.type]; if (!fn) return;
      let lines = fn(c, b.i || 0);
      if (!lines) return;
      lines = lines.filter(Boolean).filter(l => l.t !== '');
      if (!lines.length) return;
      const ph = lines.length === 1 && lines[0].ph;
      blocks.push({ id: b.id, type: b.type, label: LABELS[b.type] + (b.i != null ? ' ' + (b.i + 1) : ''), x: b.x, y: b.y, w: b.w, align: b.type === 'info' ? 'left' : (b.align || 'center'), ph: ph ? 1 : 0, lines });
    });
    return { blocks, ctx: { title: c.title, volume: c.volume, nameEn: c.nameEn, type: c.type.ko, mains: c.mains.map(m => m.k), cats: c.cats, functional: c.fn, protect: [c.title, input.name, c.nameEn].concat(c.an.items.map(i => i.k)) } };
  }

  G.GEN = { analyze, recommend, detectType, englishName, splitVolume, checkInput, generate, josa, norm, lookup, LABELS };
})(typeof window !== 'undefined' ? window : globalThis);
