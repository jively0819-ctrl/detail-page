/* =========================================================
   상세페이지 자동화 — 공통 설정
   - 비밀번호 변경: tools/password.html 에서 새 해시를 만든 뒤 passwordHash 값을 교체
   - 브랜드별 상품정보제공고시 기본값은 brands.*.info 에서 수정
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
      desc: '에스테틱 전문 라인 · 기존 상세 레이아웃 적용',
      template: 'templates/drsthe_template.docx',
      templateName: '닥터에스떼_상세페이지_입력템플릿_간편.docx',
      lineDefault: 'Professional',            // 인트로 상단 영문 표기
      tagPrefix: '데일리 에스테틱',            // "…을 담은 데일리 에스테틱 모델링 마스크"
      summaryLead: '매일의 에스테틱 루틴에는,',
      info: {
        maker: '주식회사 에스엠씨',
        seller: '(주)마더스코스메틱',
        phone: '02-6958-8664',
        expiry: '제품 내 별도 표기',
        country: '대한민국'
      }
    },
    velinic: {
      id: 'velinic', name: '벨리닉', en: 'VELINIC', accent: '#8A6A5C',
      desc: '홈케어 라인 · 고마쥬 멜팅 봄므 레이아웃 적용',
      template: 'templates/velinic_template.docx',
      templateName: '벨리닉_상세페이지_입력템플릿_간편.docx',
      lineDefault: 'VELINIC',
      tagPrefix: '데일리',
      summaryLead: '매일의 스킨케어 루틴에는,',
      info: {
        maker: '',
        seller: '',
        phone: '',
        expiry: '제품 내 별도 표기',
        country: '대한민국'
      }
    }
  },

  /* 문안 역할별 스타일 (1440px 폭 기준 px). 엑셀 글자 크기는 자동 환산됩니다. */
  roles: {
    eyebrow:  { px: 22, b: 0, color: 'accent', ls: 1 },
    title:    { px: 57, b: 1, color: '#111827' },
    en:       { px: 28, b: 0, color: '#111827' },
    headline: { px: 40, b: 1, color: '#111827' },
    h3:       { px: 28, b: 1, color: '#111827' },
    body:     { px: 25, b: 0, color: '#111827' },
    keypoint: { px: 22, b: 1, color: 'accent' },
    meta:     { px: 20, b: 0, color: '#6B7280' },
    note:     { px: 20, b: 0, color: '#6B7280' },
    label:    { px: 25, b: 1, color: '#111827' }
  }
};
