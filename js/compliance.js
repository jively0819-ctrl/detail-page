/* =========================================================
   화장품 표시·광고 표현 검사 (화장품법 제13조, 시행규칙 제22조 [별표5],
   식약처 「화장품 표시·광고 관리 지침」 기준으로 정리한 실무용 규칙)
   level: ban  = 사용 금지 (의약품 오인·절대 표현 등)
          func = 기능성 심사(보고)를 받은 경우에만 사용 가능
          warn = 실증자료·시험 근거가 있을 때만 사용 / 표현 주의
   ※ 최종 판단은 반드시 담당자(RA) 검토를 거쳐 주세요.
   ========================================================= */
(function (G) {
  const R = [];
  function add(level, p, why, fix, func) { R.push({ level, p, re: new RegExp(p, 'g'), why, fix: fix == null ? null : fix, func: func || '' }); }

  // ---- 의약품 오인
  add('ban', '치료|치유|완치', '질병의 치료·치유 표현은 의약품 오인 표현입니다.', '케어');
  add('ban', '예방', '질병 예방 표현은 의약품 오인 표현입니다.', null);
  add('ban', '처방|약효|의약품|약용', '의약품 오인 표현입니다.', null);
  add('ban', '재생', '피부 재생 표현은 의약품 오인 표현입니다.', '케어');
  add('ban', '살균|소독|멸균|항균', '살균·항균 표현은 의약품·의약외품 오인 표현입니다.', null);
  add('ban', '항염|소염|염증|진통|해열', '염증·통증 관련 표현은 의약품 오인 표현입니다.', null);
  add('ban', '해독', '해독 표현은 의약품 오인 표현입니다.', null);
  add('ban', '아토피|습진|건선|피부염|무좀|사마귀|두드러기', '질병명은 표시·광고에 사용할 수 없습니다.', null);
  add('ban', '여드름|뾰루지', '여드름 관련 표현은 기능성(여드름성 피부 완화) 심사 제품만 가능합니다.', '피부 고민');
  add('ban', '흉터|상처', '상처·흉터 관련 표현은 의약품 오인 표현입니다.', null);
  add('ban', '면역|호르몬|혈액\\s?순환|혈행|림프|체내|진피층|혈관', '생리학적 기능·인체 내부 작용 표현은 사용할 수 없습니다.', null);
  add('ban', '셀룰라이트|지방\\s?(분해|감소|연소)|슬리밍|체중\\s?감량|다이어트', '체형 변화 표현은 사용할 수 없습니다.', null);
  add('ban', '탈모\\s?(방지|예방|치료)|발모|육모|모발\\s?성장', '발모·탈모 관련 표현은 사용할 수 없습니다.', null);
  add('ban', '모공\\s?(축소|수축|감소|제거|없)', '모공 축소 표현은 사용할 수 없습니다.', '피부결 정돈');
  add('ban', '노화\\s?(방지|억제|예방|역행)|회춘', '노화 방지 표현은 사용할 수 없습니다.', null);
  add('ban', '(줄기\\s?)?세포\\s?(재생|활성|증식|성장)', '세포 관련 생리 작용 표현은 사용할 수 없습니다.', null);
  add('ban', '민감\\s?피부\\s?(개선|완화)|홍조', '피부 증상 개선 표현은 의약품 오인 표현입니다.', null);

  // ---- 기능성 효능 (심사 전 사용 불가)
  add('func', '미백|화이트닝|브라이트닝|기미|주근깨|잡티|색소\\s?침착|멜라닌', '미백 표현은 미백 기능성 심사(보고) 제품만 가능합니다.', null, '미백');
  add('func', '주름', '주름 관련 표현은 주름개선 기능성 심사(보고) 제품만 가능합니다.', null, '주름개선');
  add('func', '자외선\\s?차단|SPF|PA\\+', '자외선 차단 표현은 자외선차단 기능성 심사(보고) 제품만 가능합니다.', null, '자외선차단');

  // ---- 절대·배타적 표현
  add('ban', '최고|최상|최초|유일|독보적|넘버\\s?원|No\\.?\\s?1|1위|1등', '근거 없는 배타적·최상급 표현은 사용할 수 없습니다.', null);
  add('ban', '100\\s?%|완벽|기적|영구|평생|무조건', '절대적 표현은 사용할 수 없습니다.', null);
  add('ban', '부작용\\s?(없|zero|제로|0)|무\\s?부작용', '부작용이 없다는 표현은 사용할 수 없습니다.', null);
  add('ban', '(?<!주)의사(?!항)|약사|한의사|전문의|피부과(?!학)|병원|의료진|닥터\\s?추천|의학적', '의료인 추천·의학적 표현은 사용할 수 없습니다.', null);

  // ---- 실증 필요 / 주의
  add('warn', '리프팅|윤곽|브이\\s?라인|V\\s?라인|얼굴\\s?(축소|작아)|작은\\s?얼굴', '신체 변화로 오인될 수 있어 인체적용시험 등 근거가 필요합니다.', null);
  add('warn', '붓기|부기|부종', '인체적용시험 결과가 있을 때 시험 결론 문구 그대로만 사용하세요.', null);
  add('warn', '탄력', '실증자료(인체적용시험) 근거가 있을 때만 사용 권장합니다.', null);
  add('warn', '진정', '실증자료가 필요한 표현입니다. "편안하게" 등으로 대체를 권장합니다.', null);
  add('warn', '개선|완화|감소|회복|복원', '효능 표현은 시험 근거가 있을 때만 사용 가능합니다.', null);
  add('warn', '장벽\\s?(강화|회복|개선)|피부\\s?장벽', '피부장벽 관련 효능은 실증자료가 필요합니다.', '피부 보호막');
  add('warn', '피지\\s?(조절|억제|분비|감소)', '피지 조절은 실증자료가 필요합니다.', '유분기 정돈');
  add('warn', '각질\\s?(제거|탈락|케어)', '세정·물리적 제거 목적일 때만 사용 가능합니다.', null);
  add('warn', '즉각|즉시|단\\s?\\d+\\s?(초|분|일)\\s?만에', '효과의 즉각성은 근거가 필요한 표현입니다.', null);
  add('warn', '무자극|자극\\s?(없|제로|0)|저자극|노\\s?자극', '피부자극시험 근거 + "모든 사람에게 자극이 없다는 의미는 아닙니다" 병기가 필요합니다.', null);
  add('warn', '임상', '"인체적용시험"으로 표기를 권장합니다.', '인체적용시험');
  add('warn', '천연|자연\\s?100|유기농|오가닉|비건', '천연·유기농 화장품 기준 또는 인증을 충족할 때만 사용 가능합니다.', null);
  add('warn', '특허', '특허 내용과 광고 내용이 일치해야 합니다.', null);
  add('warn', '침투|깊숙이|흡수\\s?(되어|돼|시켜)', '피부 깊숙이 침투 등 생리학적 작용 표현은 주의가 필요합니다.', '스며들어');
  add('warn', '디톡스|안티\\s?에이징|노화', '의약품 오인 또는 노화 관련 표현으로 주의가 필요합니다.', null);
  add('warn', '트러블', '"피부 고민" 등으로 대체를 권장합니다.', '피부 고민');
  add('warn', '줄기\\s?세포|세포|DNA|유전자|EGF', '성분명이 아닌 경우 생리 작용 표현으로 오인될 수 있습니다.', null);

  /**
   * 문안 검사
   * @param blocks [{id, label, lines:[{r,t,x?,ev?}]}]
   * @param opt {functional:'미백,주름개선', names:['제품명', ...]}
   */
  function check(blocks, opt) {
    opt = opt || {};
    const fn = opt.functional || '';
    const protect = (opt.names || []).filter(Boolean);
    const out = [];
    const seen = {};
    blocks.forEach(b => {
      (b.lines || []).forEach((ln, li) => {
        if (!ln.t || ln.x) return; // x: 법정 표기(주의사항 등) — 검사 제외
        let text = ln.t;
        // 성분명·제품명 안의 단어는 마스킹 후 검사
        protect.forEach(n => { if (n && n.length > 1) text = text.split(n).join('□'.repeat(n.length)); });
        R.forEach(rule => {
          if (rule.level === 'func' && rule.func && fn.indexOf(rule.func) >= 0) return;
          if (ln.ev && rule.level === 'warn') return; // 시험 결과 원문 — 주의 표현 허용
          rule.re.lastIndex = 0;
          let m;
          while ((m = rule.re.exec(text))) {
            const s = m.index, e = s + m[0].length;
            const key = b.id + ':' + li;
            const taken = (seen[key] = seen[key] || []);
            if (taken.some(r => s < r[1] && r[0] < e)) { if (m[0].length === 0) rule.re.lastIndex++; continue; }
            taken.push([s, e]);
            out.push({ blockId: b.id, label: b.label || '', line: li, word: m[0], level: rule.level, why: rule.why, fix: rule.fix, p: rule.p });
            if (m[0].length === 0) rule.re.lastIndex++;
          }
        });
      });
    });
    return out;
  }

  function applyFix(text, p, fix) { return text.replace(new RegExp(p, 'g'), fix); }

  G.COMP = { RULES: R, check, applyFix };
})(typeof window !== 'undefined' ? window : globalThis);
