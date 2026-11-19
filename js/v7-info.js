/* =========================================================
   v7 — 상품정보제공고시를 박스 하나로 합침
   v6-fix.js 다음, app.js 앞에서 불러옵니다. (기존 파일은 수정하지 않습니다)
   - v5가 만든 칸별 문구(제품명 · 용량 · 기능성 · 사용방법 · 전성분)를 모아
     하단 고시 영역 전체를 덮는 목록형 박스 1개로 바꿉니다.
   - 박스 위치 · 크기는 아래 BOX 값에서 조정하세요.
   ========================================================= */
(function (G) {
  'use strict';
  var C = G.CONFIG, GEN = G.GEN, LAYOUTS = G.LAYOUTS || {};
  if (!C || !GEN) return;

  var BOX = {
    drsthe: { id: 'infoAll', type: 'infoAll', x: 40, y: 25320, w: 1360, h: 1020, align: 'left', fs: 27 },
    velinic: { id: 'vInfoAll', type: 'infoAll', x: 40, y: 39950, w: 1360, h: 1330, align: 'left', fs: 27 }
  };
  var CAUTION = '1) 화장품 사용 시 또는 사용 후 직사광선에 의하여 사용부위가 붉은 반점, 부어오름 또는 가려움증 등의 이상 증상이나 부작용이 있는 경우 전문의 등과 상담할 것 2) 상처가 있는 부위 등에는 사용을 자제할 것 3) 보관 및 취급 시의 주의사항 가) 어린이의 손이 닿지 않는 곳에 보관할 것 나) 직사광선을 피해서 보관할 것';

  /* ---------- 레이아웃: 칸별 박스 제거 → 박스 1개 ---------- */
  var SPLIT = {};
  Object.keys(BOX).forEach(function (id) {
    var Lo = LAYOUTS[id];
    if (!Lo || Lo.v7) return;
    SPLIT[id] = Lo.blocks.filter(function (b) {
      return /^info/.test(b.type) && b.type !== 'infoAll';
    });
    Lo.blocks = Lo.blocks.filter(function (b) {
      return !/^info/.test(b.type);
    });
    Lo.blocks.push(Object.assign({ v7: 1 }, BOX[id]));
    Lo.v7 = 1;
  });

  var L = function (r, t) {
    return { r: r, t: t == null ? '' : String(t), x: 1 };
  };

  function textOf(r, type) {
    var b = r.blocks.find(function (x) {
      return x.type === type && !x.hidden;
    });
    if (!b || !b.lines) return '';
    return b.lines.map(function (l) { return l.t; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  /* ---------- 문안: 칸별 문구를 모아 한 박스로 ---------- */
  function post(r, brand, input) {
    var bx = BOX[brand];
    if (!r || !r.blocks || !bx) return;
    var B = C.brands[brand] || {}, info = B.info || {}, ctx = r.ctx || {};

    var name = textOf(r, 'infoName') || ((B.infoPrefix || '') + (ctx.title || input.name || ''));
    var vol = textOf(r, 'infoVol') || ctx.volume || input.volume || '-';
    var use = textOf(r, 'infoUse') || String(input.usage || '').replace(/\n+/g, ' ').trim() || '상세페이지 사용법 참조';
    var fn = textOf(r, 'infoFunc');
    if (!fn) {
      fn = String(input.functional || '').trim()
        ? input.functional + (input.funcNo ? ' (' + input.funcNo + ')' : '')
        : '해당 없음';
    }
    var inci = textOf(r, 'infoInci');
    if (!inci) {
      try {
        inci = GEN.analyze(input.inci || '').items.map(function (i) { return i.raw; }).join(', ');
      } catch (e) {
        inci = input.inci || '';
      }
    }

    r.blocks = r.blocks.filter(function (b) {
      return !/^info/.test(b.type);
    });

    var lines = [
      L('h3', '상품정보제공고시'),
      L('소본문', '제품명 : ' + name),
      L('소본문', '용량 · 중량 : ' + vol),
      L('소본문', '제품 주요 사양 : 모든 피부용'),
      L('소본문', '사용기한 : ' + (input.expiry || info.expiry || '제품 내 별도 표기')),
      L('소본문', '사용방법 : ' + use),
      L('소본문', '화장품제조업자 : ' + (info.maker || '제품 내 별도 표기')),
      L('소본문', '화장품책임판매업자 : ' + (input.seller || info.seller || '(입력 필요)')),
      L('소본문', '제조국 : ' + (info.country || '대한민국')),
      L('소본문', '식품의약품안전처 심사 필 유무 : ' + fn),
      L('소본문', '전성분 : ' + inci),
      L('소본문', '사용 시 주의사항 : ' + CAUTION + (input.caution ? ' ' + input.caution : '')),
      L('소본문', '품질보증기준 : 본 제품은 공정거래위원회 고시 「소비자분쟁해결기준」에 의거 교환 또는 보상 받을 수 있습니다.'),
      L('소본문', '소비자상담 전화번호 : ' + (input.phone || info.phone || '(입력 필요)'))
    ];

    r.blocks.push({
      id: bx.id, type: 'infoAll', label: '상품정보제공고시',
      x: bx.x, y: bx.y, w: bx.w, align: 'left', ph: 0, lines: lines
    });
    r.blocks.sort(function (a, b) {
      return a.y - b.y || a.x - b.x;
    });
  }

  /* ---------- 생성 래핑 ---------- */
  var og = GEN.generate;
  GEN.generate = function (brand, input, layout) {
    var lay = layout;
    if (layout && BOX[brand]) {
      // v5가 칸별 문구를 만들 수 있도록 칸 박스를 잠시 돌려 넣고 생성
      lay = Object.assign({}, layout, {
        blocks: layout.blocks.filter(function (b) { return !b.v7; }).concat(SPLIT[brand] || [])
      });
    }
    var r = og.call(this, brand, input, lay);
    try {
      post(r, brand, input || {});
    } catch (e) {
      console.warn('[v7] 고시 박스 합치기 오류', e);
    }
    return r;
  };
})(window);
