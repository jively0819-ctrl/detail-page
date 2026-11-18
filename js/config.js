/* =========================================================
   상세페이지 자동화 — 공통 설정
   - 비밀번호 변경: tools/password.html 에서 새 해시를 만든 뒤 passwordHash 값을 교체
   - 브랜드별 상품정보제공고시 기본값은 brands.*.info 에서 수정
   - 벨리닉 브랜드 고정 문구(브랜드 스토리 · 벨리닉 사이언스)는 brands.velinic.story 에서 수정
   ========================================================= */
window.CONFIG = {
  appName: '상세페이지 문안 자동화',
  // 기본 비밀번호: detail2026!   (반드시 변경해서 사용하세요)
  passwordHash: '7808e25412177aa742da07469de5bdf7a7f81a2bfde242fcf49d743caeab1aa9',
  defaultOpacity: 30,          // 배경 상세 이미지 불투명도(%) — 30% 이하 권장
  maxOpacity: 30,
  brands: {
    drsthe: {
      id: 'drsthe', name: '닥터에스떼', en: 'Dr.esthe', accent: '#2D6A9F',
      desc: '에스테틱 전문 라인 · 엑토인 1% 레스큐 토너 상세 레이아웃',
      template: 'templates/drsthe_template.docx',
      templateName: '닥터에스떼_상세페이지_입력템플릿_간편.docx',
      lineDefault: 'Sensitive',
      infoPrefix: '',
      info: {
        maker: '주식회사 에스엠씨',
        seller: '(주)마더스코스메틱',
        phone: '02-6958-8664',
        expiry: '제품 내 별도 표기',
        country: '대한민국'
      }
    },
    velinic: {
      id: 'velinic', name: '벨리닉', en: 'BELINIC', accent: '#8A6A5C',
      desc: '더마 홈케어 라인 · 고마쥬 멜팅 봄므 상세 레이아웃',
      template: 'templates/velinic_template.docx',
      templateName: '벨리닉_상세페이지_입력템플릿_간편.docx',
      lineDefault: '',
      infoPrefix: '벨리닉 ',
      info: {
        maker: '',
        seller: '(주)마더스코스메틱',
        phone: '',
        expiry: '제품 내 별도 표기',
        country: '대한민국'
      },
      /* 벨리닉 상세 공통 문구 (모든 제품에 동일하게 들어가는 브랜드 영역) */
      story: {
        en: ['Belinic offers the most valuable experience, harmonizing the rhythm of your skin.',
             'With 20 years of medical cosmetic expertise, we are composing a new movement in skincare,',
             'where the fusion of science and artistry creates timeless beauty.'],
        head: ['20년간 쌓아온 더마 코스메틱 경험으로', '피부의 리듬을 조율하다.'],
        body: ['2004년 피부 과학 화장품에 대한 연구를 시작하며,',
               '국내 피부과 전문의로 구성된 자문단 100명이 제품 기획에서 연구 개발에 이르는',
               '전 공정에 직접 참여하여 만든 피부과 전문 화장품 브랜드를 이끌어 왔습니다.'],
        sci: {
          head: ['사계절의 예민한 환경에서도', '살아남는 포도의 강한 자생력'],
          body: ['사계절의 예민한 환경 변화에도 언제든 살아남을 수 있는 포도의 강한 자생력과 생명력에 주목하여', '벨리닉 사이언스가 탄생되었습니다.'],
          ko: '포도 유래 식물 엑소좀',
          koEn: '(Plant Exosomes)',
          desc: ['피토테라좀® 그레이프는 특허 공정을 통해 얻은 포도 줄기세포 유래 엑소좀(Exosomes)으로,', '포도의 뛰어난 자생력과 생명력이 응집된 줄기세포로 탄생한 식물 엑소좀입니다.']
        }
      }
    }
  },
  /* 문안 역할별 스타일 (1440px 폭 기준 px). 엑셀 글자 크기는 자동 환산됩니다. */
  roles: {
    '대제목': { px: 50, b: 1, color: '#111827' },
    title:    { px: 54, b: 1, color: '#111827' },
    en:       { px: 24, b: 0, color: '#374151' },
    headline: { px: 34, b: 1, color: '#111827' },
    h3:       { px: 25, b: 1, color: '#111827' },
    body:     { px: 22, b: 0, color: '#111827' },
    '소본문': { px: 19, b: 0, color: '#1F2937' },
    '캡션':   { px: 15, b: 0, color: '#4B5563' },
    '배지':   { px: 19, b: 1, color: 'accent' },
    eyebrow:  { px: 17, b: 1, color: 'accent', ls: 1 },
    keypoint: { px: 19, b: 1, color: 'accent' },
    label:    { px: 21, b: 1, color: '#111827' },
    meta:     { px: 17, b: 0, color: '#6B7280' },
    note:     { px: 15, b: 0, color: '#6B7280' }
  }
};
