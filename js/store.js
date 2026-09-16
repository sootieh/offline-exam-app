/* 本地存储层 —— 全部数据存 IndexedDB，不上传任何服务器 */
(function () {
  'use strict';
  var DB_NAME = 'examapp', VER = 1, db = null;

  function open() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('banks')) {
          d.createObjectStore('banks', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('questions')) {
          var qs = d.createObjectStore('questions', { keyPath: 'id' });
          qs.createIndex('bankId', 'bankId', { unique: false });
        }
        if (!d.objectStoreNames.contains('records')) {
          var rs = d.createObjectStore('records', { keyPath: 'id' });
          rs.createIndex('bankId', 'bankId', { unique: false });
        }
        if (!d.objectStoreNames.contains('exams')) {
          var es = d.createObjectStore('exams', { keyPath: 'id' });
          es.createIndex('bankId', 'bankId', { unique: false });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'k' });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; res(db); };
      req.onerror = function (e) { rej(e.target.error); };
    });
  }

  function tx(stores, mode) {
    return db.transaction(stores, mode);
  }
  function done(t) {
    return new Promise(function (res, rej) {
      t.oncomplete = function () { res(); };
      t.onerror = function (e) { rej(e.target.error); };
      t.onabort = function (e) { rej(e.target.error || new Error('abort')); };
    });
  }
  function req2p(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function (e) { rej(e.target.error); };
    });
  }
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  var DB = {
    init: function () { return open(); },
    uid: uid,

    /* ---------------- 题库 ---------------- */
    listBanks: function () {
      return req2p(tx('banks').objectStore('banks').getAll()).then(function (list) {
        return list.sort(function (a, b) { return b.createdAt - a.createdAt; });
      });
    },
    getBank: function (id) { return req2p(tx('banks').objectStore('banks').get(id)); },
    putBank: function (b) { return done(tx('banks', 'readwrite').objectStore('banks').put(b).transaction); },
    addBank: function (name) {
      var b = { id: uid(), name: name || '未命名题库', createdAt: Date.now(), updatedAt: Date.now() };
      return DB.putBank(b).then(function () { return b; });
    },
    renameBank: function (id, name) {
      return DB.getBank(id).then(function (b) {
        if (!b) return null;
        b.name = name; b.updatedAt = Date.now();
        return DB.putBank(b).then(function () { return b; });
      });
    },
    deleteBank: function (id) {
      var t = tx(['banks', 'questions', 'records', 'exams'], 'readwrite');
      t.objectStore('banks').delete(id);
      var qi = t.objectStore('questions').index('bankId').openKeyCursor(IDBKeyRange.only(id));
      qi.onsuccess = function (e) {
        var c = e.target.result; if (!c) return;
        t.objectStore('questions').delete(c.primaryKey); c.continue();
      };
      ['records', 'exams'].forEach(function (s) {
        var ci = t.objectStore(s).index('bankId').openKeyCursor(IDBKeyRange.only(id));
        ci.onsuccess = function (e) {
          var c = e.target.result; if (!c) return;
          t.objectStore(s).delete(c.primaryKey); c.continue();
        };
      });
      return done(t);
    },

    /* ---------------- 题目 ---------------- */
    addQuestions: function (bankId, list) {
      var t = tx('questions', 'readwrite'), st = t.objectStore('questions');
      list.forEach(function (q, i) {
        q.id = q.id || uid();
        q.bankId = bankId;
        q.idx = i;
        st.put(q);
      });
      return done(t);
    },
    getQuestions: function (bankId) {
      return req2p(tx('questions').objectStore('questions').index('bankId').getAll(IDBKeyRange.only(bankId)))
        .then(function (l) { return l.sort(function (a, b) { return a.idx - b.idx; }); });
    },
    getQuestion: function (id) { return req2p(tx('questions').objectStore('questions').get(id)); },
    putQuestion: function (q) { return done(tx('questions', 'readwrite').objectStore('questions').put(q).transaction); },
    deleteQuestion: function (id) {
      return done(tx('questions', 'readwrite').objectStore('questions').delete(id).transaction);
    },
    countByBank: function (bankId) {
      return req2p(tx('questions').objectStore('questions').index('bankId').count(IDBKeyRange.only(bankId)));
    },

    /* ---------------- 答题记录 ---------------- */
    getRecords: function (bankId) {
      return req2p(tx('records').objectStore('records').index('bankId').getAll(IDBKeyRange.only(bankId)))
        .then(function (list) {
          var m = {};
          list.forEach(function (r) { m[r.qid] = r; });
          return m;
        });
    },
    setRecord: function (bankId, qid, patch) {
      var t = tx('records', 'readwrite'), st = t.objectStore('records'), id = bankId + '_' + qid;
      return req2p(st.get(id)).then(function (r) {
        r = r || { id: id, bankId: bankId, qid: qid, seen: 0, right: 0, wrong: 0, fav: 0, mastered: 0 };
        for (var k in patch) r[k] = patch[k];
        r.updatedAt = Date.now();
        st.put(r);
      }).then(function () { return done(t); });
    },
    allRecords: function () { return req2p(tx('records').objectStore('records').getAll()); },

    /* ---------------- 考试记录 ---------------- */
    saveExam: function (e) {
      return done(tx('exams', 'readwrite').objectStore('exams').put(e).transaction);
    },
    listExams: function (bankId) {
      var p = bankId
        ? req2p(tx('exams').objectStore('exams').index('bankId').getAll(IDBKeyRange.only(bankId)))
        : req2p(tx('exams').objectStore('exams').getAll());
      return p.then(function (l) { return l.sort(function (a, b) { return b.startedAt - a.startedAt; }); });
    },
    getExam: function (id) { return req2p(tx('exams').objectStore('exams').get(id)); },
    deleteExam: function (id) {
      return done(tx('exams', 'readwrite').objectStore('exams').delete(id).transaction);
    },

    /* ---------------- 设置 ---------------- */
    setSetting: function (k, v) {
      return done(tx('settings', 'readwrite').objectStore('settings').put({ k: k, v: v }).transaction);
    },
    getSetting: function (k) {
      return req2p(tx('settings').objectStore('settings').get(k)).then(function (r) { return r ? r.v : null; });
    },

    /* ---------------- 备份 / 恢复 / 清空 ---------------- */
    exportAll: function () {
      var t = tx(['banks', 'questions', 'records', 'exams'], 'readonly');
      return Promise.all([
        req2p(t.objectStore('banks').getAll()),
        req2p(t.objectStore('questions').getAll()),
        req2p(t.objectStore('records').getAll()),
        req2p(t.objectStore('exams').getAll())
      ]).then(function (r) {
        return { app: 'examapp', ver: 1, at: Date.now(), banks: r[0], questions: r[1], records: r[2], exams: r[3] };
      });
    },
    importAll: function (data) {
      var t = tx(['banks', 'questions', 'records', 'exams'], 'readwrite');
      ['banks', 'questions', 'records', 'exams'].forEach(function (s) {
        (data[s] || []).forEach(function (o) { t.objectStore(s).put(o); });
      });
      return done(t);
    },
    clearRecords: function () {
      var t = tx(['records', 'exams'], 'readwrite');
      t.objectStore('records').clear(); t.objectStore('exams').clear();
      return done(t);
    },
    wipe: function () {
      var t = tx(['banks', 'questions', 'records', 'exams', 'settings'], 'readwrite');
      ['banks', 'questions', 'records', 'exams', 'settings'].forEach(function (s) {
        t.objectStore(s).clear();
      });
      return done(t);
    }
  };

  window.DB = DB;
})();
