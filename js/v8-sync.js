/* =========================================================
   v8 — 여러 사람 실시간 동기화 (Firebase Firestore)
   index.html에서 Firebase SDK 3줄 다음, app.js 앞에서 불러옵니다.
   (기존 파일은 수정하지 않습니다)
   - 히스토리(dp_history_v1): 항목 1개 = 문서 1개로 저장, 실시간 반영
   - 제품 설명 · 복합 성분 · 텍스트 상자: 키 1개 = 문서 1개로 저장
   - 입장 비밀번호를 넣으면 팀 공용 계정으로 Firebase 로그인이 함께 됩니다.
   ========================================================= */
(function (G) {
  'use strict';

  /* ---------- 설정 ---------- */
  var CFG = {
    apiKey: 'AIzaSyB2F4MsmdFWA3R60GZUGDXFItvBWVrL2oo',
    authDomain: 'detail-pages-f88b7.firebaseapp.com',
    projectId: 'detail-pages-f88b7',
    storageBucket: 'detail-pages-f88b7.firebasestorage.app',
    messagingSenderId: '744633707909',
    appId: '1:744633707909:web:c0d46c3075c04d931368ec'
  };
  var TEAM_EMAIL = 'team@detailpage.app';   // ← Firebase Users에 만든 이메일로 바꾸세요
  var HKEY = 'dp_history_v1';
  var KV_KEYS = ['dp_desc_v1', 'dp_complex_v1', 'dp_textbox_v1'];
  var MAX_DOC = 900000;   // Firestore 문서 1개 한도(1MB) 여유분
  var MAX_HIST = 200;     // app.js의 히스토리 보관 개수와 동일

  if (!G.firebase || !G.localStorage) {
    console.warn('[v8] Firebase SDK를 불러오지 못해 동기화를 끕니다.');
    return;
  }

  firebase.initializeApp(CFG);
  var auth = firebase.auth();
  var db = firebase.firestore();
  var HCOL = db.collection('history');
  var KCOL = db.collection('kv');

  var LS = G.localStorage;
  var rawSet = Storage.prototype.setItem;
  var rawRemove = Storage.prototype.removeItem;
  var applying = false;
  var user = null;
  var firstHist = true;
  var firstKv = {};
  var kvTimer = {};
  var unsub = [];
  var lastHist = {};

  /* ---------- 공통 ---------- */
  function parseList(str) {
    try {
      var a = JSON.parse(str || '[]');
      return Array.isArray(a) ? a : [];
    } catch (e) {
      return [];
    }
  }
  function toMap(list) {
    var m = {};
    list.forEach(function (it) {
      if (it && it.id) {
        m[it.id] = { s: JSON.stringify(it), u: it.updated || 0 };
      }
    });
    return m;
  }
  function docId(id) {
    return String(id).replace(/\//g, '_');
  }
  function commitOps(ops) {
    for (var i = 0; i < ops.length; i += 400) {
      var batch = db.batch();
      ops.slice(i, i + 400).forEach(function (op) {
        batch.set(op.ref, op.data);
      });
      batch.commit().catch(onErr);
    }
  }
  function localSet(key, val) {
    applying = true;
    try {
      if (val == null) {
        rawRemove.call(LS, key);
      } else {
        rawSet.call(LS, key, val);
      }
    } catch (e) {
      notice('브라우저 저장 공간이 부족해 일부 동기화 데이터를 저장하지 못했습니다.');
    }
    applying = false;
  }
  function rerenderHistory() {
    var hs = document.getElementById('histSearch');
    if (hs) {
      hs.dispatchEvent(new Event('input'));
    }
  }

  /* ---------- 상태 표시 ---------- */
  var badgeEl = null;
  function badge(state, msg) {
    if (!badgeEl) {
      badgeEl = document.createElement('div');
      badgeEl.style.cssText = 'position:fixed;left:10px;bottom:8px;z-index:9999;font:11px/1.4 Pretendard,sans-serif;' +
        'padding:3px 8px;border:1px solid #d1d5db;border-radius:6px;background:#fff;color:#374151;cursor:default;opacity:.85';
      document.body.appendChild(badgeEl);
    }
    var color = state === 'on' ? '#16a34a' : state === 'err' ? '#dc2626' : '#9ca3af';
    badgeEl.innerHTML = '<span style="display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;background:' + color + '"></span>' + msg;
    badgeEl.style.cursor = state === 'on' ? 'default' : 'pointer';
    badgeEl.title = state === 'on' ? '팀 공용 저장소와 동기화 중입니다.' : '눌러서 동기화 로그인';
  }
  function notice(msg, withReload) {
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;max-width:360px;font:13px/1.5 Pretendard,sans-serif;' +
      'padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#111827';
    el.textContent = msg + ' ';
    if (withReload) {
      var b = document.createElement('button');
      b.textContent = '새로고침';
      b.style.cssText = 'margin-left:6px;padding:3px 8px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer';
      b.onclick = function () {
        location.reload();
      };
      el.appendChild(b);
    }
    var x = document.createElement('button');
    x.textContent = '×';
    x.style.cssText = 'margin-left:6px;border:0;background:none;cursor:pointer;font-size:15px';
    x.onclick = function () {
      el.remove();
    };
    el.appendChild(x);
    document.body.appendChild(el);
    if (!withReload) {
      setTimeout(function () {
        el.remove();
      }, 6000);
    }
  }
  function onErr(err) {
    console.warn('[v8]', err);
    var code = (err && err.code) || '';
    if (/permission-denied/.test(code)) {
      badge('err', '동기화 권한 없음 (보안 규칙 확인)');
    } else {
      badge('err', '동기화 오류: ' + (code || err));
    }
  }

  /* ---------- 로컬 저장 감지 → Firestore 업로드 ---------- */
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === LS && !applying) {
      onLocalWrite(k);
    }
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === LS && !applying) {
      onLocalWrite(k);
    }
  };

  function onLocalWrite(key) {
    try {
      if (key === HKEY) {
        onHistWrite();
      } else if (KV_KEYS.indexOf(key) >= 0) {
        onKvWrite(key);
      }
    } catch (e) {
      console.warn('[v8] 업로드 준비 오류', e);
    }
  }

  function onHistWrite() {
    var list = parseList(LS.getItem(HKEY));
    var next = toMap(list);
    if (!user) {
      lastHist = next;
      return;
    }
    var now = Date.now(), ops = [];
    var minU = list.length >= MAX_HIST ? Math.min.apply(null, list.map(function (x) {
      return x.updated || 0;
    })) : -1;
    Object.keys(next).forEach(function (id) {
      if (!lastHist[id] || lastHist[id].s !== next[id].s) {
        if (next[id].s.length > MAX_DOC) {
          notice('용량이 너무 커서 동기화하지 못한 히스토리가 있습니다.');
          return;
        }
        ops.push({ ref: HCOL.doc(docId(id)), data: { data: next[id].s, updated: next[id].u || now, deleted: false } });
      }
    });
    Object.keys(lastHist).forEach(function (id) {
      if (next[id]) {
        return;
      }
      if (minU >= 0 && lastHist[id].u <= minU) {
        return;   // 200개 초과로 밀려난 항목은 삭제로 보지 않음
      }
      ops.push({ ref: HCOL.doc(docId(id)), data: { data: '', updated: now, deleted: true } });
    });
    lastHist = next;
    commitOps(ops);
  }

  function onKvWrite(key) {
    if (!user) {
      return;
    }
    clearTimeout(kvTimer[key]);
    kvTimer[key] = setTimeout(function () {
      delete kvTimer[key];
      var v = LS.getItem(key);
      if (v && v.length > MAX_DOC) {
        notice('용량이 너무 커서 동기화하지 못했습니다: ' + key);
        return;
      }
      KCOL.doc(key).set({ value: v == null ? null : v, updated: Date.now() }).catch(onErr);
    }, 800);
  }

  /* ---------- Firestore 변경 → 로컬 반영 ---------- */
  function onHistSnap(snap) {
    var remote = {};
    snap.forEach(function (d) {
      remote[d.id] = d.data();
    });
    var merged = {}, ops = [];
    if (firstHist) {
      // 처음 접속: 이 브라우저에만 있던 항목을 올림 (기존 데이터 이전)
      parseList(LS.getItem(HKEY)).forEach(function (it) {
        if (!it || !it.id) {
          return;
        }
        var r = remote[docId(it.id)];
        if (!r || (it.updated || 0) > (r.updated || 0)) {
          merged[it.id] = it;
          var s = JSON.stringify(it);
          if (s.length <= MAX_DOC) {
            ops.push({ ref: HCOL.doc(docId(it.id)), data: { data: s, updated: it.updated || Date.now(), deleted: false } });
          }
        }
      });
      firstHist = false;
    }
    Object.keys(remote).forEach(function (k) {
      var r = remote[k];
      if (!r || r.deleted || !r.data) {
        return;
      }
      try {
        var it = JSON.parse(r.data);
        if (!merged[it.id] || (merged[it.id].updated || 0) < (it.updated || 0)) {
          merged[it.id] = it;
        }
      } catch (e) {
        console.warn('[v8] 히스토리 문서 해석 실패', k);
      }
    });
    var list = Object.keys(merged).map(function (k) {
      return merged[k];
    }).sort(function (a, b) {
      return (b.updated || 0) - (a.updated || 0);
    }).slice(0, MAX_HIST);
    var str = JSON.stringify(list);
    if (str !== LS.getItem(HKEY)) {
      localSet(HKEY, str);
      rerenderHistory();
    }
    lastHist = toMap(list);
    commitOps(ops);
    if (ops.length) {
      notice('이 브라우저에 있던 히스토리 ' + ops.length + '개를 팀 저장소로 올렸습니다.');
    }
  }

  function mergeVal(r, l) {
    var a, b;
    try {
      a = JSON.parse(r);
      b = JSON.parse(l);
    } catch (e) {
      return r;
    }
    if (Array.isArray(a) && Array.isArray(b)) {
      var seen = {}, out = [];
      a.concat(b).forEach(function (x) {
        var k = x && x.id ? 'id:' + x.id : JSON.stringify(x);
        if (!seen[k]) {
          seen[k] = 1;
          out.push(x);
        }
      });
      return JSON.stringify(out);
    }
    if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
      return JSON.stringify(Object.assign({}, b, a));
    }
    return r;
  }

  function onKvSnap(key, d) {
    if (kvTimer[key] || d.metadata.hasPendingWrites) {
      return;   // 내가 방금 고친 값이 아직 올라가는 중
    }
    var local = LS.getItem(key);
    var first = !firstKv[key];
    firstKv[key] = 1;
    if (!d.exists) {
      if (first && local != null) {
        KCOL.doc(key).set({ value: local, updated: Date.now() }).catch(onErr);
      }
      return;
    }
    var remote = d.data().value;
    if (remote == null || remote === local) {
      return;
    }
    var val = remote;
    if (first && local != null) {
      val = mergeVal(remote, local);
      if (val !== remote) {
        KCOL.doc(key).set({ value: val, updated: Date.now() }).catch(onErr);
      }
    }
    if (val !== local) {
      localSet(key, val);
      notice('다른 사용자가 바꾼 설정(제품 설명 · 성분 · 텍스트 상자)을 받았습니다. 새로고침하면 화면에 반영됩니다.', true);
    }
  }

  /* ---------- 로그인 ---------- */
  function signIn(pw) {
    if (!pw || user) {
      return;
    }
    badge('off', '동기화 로그인 중…');
    auth.signInWithEmailAndPassword(TEAM_EMAIL, pw).catch(function (err) {
      var c = (err && err.code) || '';
      var m = /invalid-credential|wrong-password|user-not-found|invalid-email/.test(c) ? '계정 정보 불일치 (TEAM_EMAIL · 비밀번호 확인)'
        : /too-many-requests/.test(c) ? '시도 횟수 초과 — 잠시 후 다시'
        : /network/.test(c) ? '네트워크 오류'
        : c || String(err);
      badge('err', '동기화 로그인 실패: ' + m);
    });
  }

  var gate = document.getElementById('gateForm');
  if (gate) {
    gate.addEventListener('submit', function () {
      var pw = (document.getElementById('gatePw') || {}).value;
      signIn(pw);
    });
  }

  auth.onAuthStateChanged(function (u) {
    user = u;
    unsub.forEach(function (f) {
      f();
    });
    unsub = [];
    if (!u) {
      badge('off', '동기화 꺼짐 — 눌러서 로그인');
      if (badgeEl) {
        badgeEl.onclick = function () {
          if (user) {
            return;
          }
          var pw = prompt('동기화 비밀번호를 입력해 주세요. (입장 비밀번호와 같습니다)');
          signIn(pw);
        };
      }
      return;
    }
    firstHist = true;
    firstKv = {};
    lastHist = toMap(parseList(LS.getItem(HKEY)));
    badge('on', '동기화 연결됨');
    unsub.push(HCOL.onSnapshot(onHistSnap, onErr));
    KV_KEYS.forEach(function (k) {
      unsub.push(KCOL.doc(k).onSnapshot(function (d) {
        onKvSnap(k, d);
      }, onErr));
    });
  });

  G.DP_SYNC = { auth: auth, db: db, signOut: function () { return auth.signOut(); } };
})(window);
