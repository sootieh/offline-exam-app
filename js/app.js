/* 主应用：路由、题库、练习、考试、统计 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dayKey(t) {
    var d = new Date(t);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  /* ================= 动作面板（iOS Action Sheet） ================= */
  var ICONS = {
    rename: '<path d="M12 4.5H6.8A2.3 2.3 0 0 0 4.5 6.8v10.4a2.3 2.3 0 0 0 2.3 2.3h10.4a2.3 2.3 0 0 0 2.3-2.3V12"/><path d="M10.6 13.4 19.2 4.8a1.7 1.7 0 0 0-2.4-2.4l-8.6 8.6-.9 3.3z"/>',
    trash: '<path d="M4.5 6.5h15"/><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7"/><path d="M6.2 6.5l.8 12.2a1.8 1.8 0 0 0 1.8 1.7h6.4a1.8 1.8 0 0 0 1.8-1.7l.8-12.2"/><path d="M10 10.5v6M14 10.5v6"/>',
    share: '<path d="M12 14.5V4.2"/><path d="M8.2 7.6 12 3.8l3.8 3.8"/><path d="M6.5 11H5.8A1.8 1.8 0 0 0 4 12.8v5.4A1.8 1.8 0 0 0 5.8 20h12.4a1.8 1.8 0 0 0 1.8-1.8v-5.4A1.8 1.8 0 0 0 18.2 11h-.7"/>'
  };
  function showActionSheet(title, items, onPick) {
    $('menu-title').textContent = title || '';
    $('menu-items').innerHTML = items.map(function (it, i) {
      return '<button class="menu-item' + (it.danger ? ' danger' : '') + '" data-i="' + i + '">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[it.icon] || '') + '</svg>' +
        esc(it.label) + '</button>';
    }).join('');
    $('menu-mask').hidden = false;
    Array.prototype.forEach.call($('menu-items').children, function (btn) {
      btn.onclick = function () {
        hideActionSheet();
        var it = items[+btn.getAttribute('data-i')];
        if (it && onPick) onPick(it.act);
      };
    });
  }
  function hideActionSheet() { $('menu-mask').hidden = true; }

  /* ================= 应用设置（偏好开关） =================
     存 localStorage，键 examapp-prefs */
  var PREFS_KEY = 'examapp-prefs';
  var PREF_DEF = { autoNext: true, swipeV: true, swipeH: true };
  function getPrefs() {
    try { return Object.assign({}, PREF_DEF, JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')); }
    catch (e) { return Object.assign({}, PREF_DEF); }
  }
  function getPref(k) { return getPrefs()[k]; }
  function setPref(k, v) {
    var p = getPrefs(); p[k] = v;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function bindSwitch(id, key) {
    var b = $(id);
    if (!b) return;
    function paint() { b.classList.toggle('on', !!getPref(key)); }
    paint();
    b.onclick = function () {
      setPref(key, !getPref(key));
      paint();
      App.toast(getPref(key) ? '已开启' : '已关闭');
    };
  }

  /* 探测 env(safe-area-inset-top) 是否真的生效：部分 iOS standalone
     场景会返回 0（此时内容会被状态栏玻璃带压住），需要 CSS 兜底 */
  function detectSafeArea() {
    try {
      var d = document.createElement('div');
      d.style.cssText = 'position:absolute;top:0;left:0;width:0;height:env(safe-area-inset-top);visibility:hidden;pointer-events:none';
      (document.body || document.documentElement).appendChild(d);
      var h = d.getBoundingClientRect().height;
      d.parentNode.removeChild(d);
      if (!h || h < 1) document.documentElement.classList.add('no-inset');
    } catch (e) {}
  }

  /* ================= 界面风格 ================= */
  var THEMES = [
    { key: 'moss',      name: '墨绿', brand: '#2e6d5c', bg: '#f6f5f1', darkBrand: '#5fa38e', darkBg: '#111210' },
    { key: 'mist',      name: '雾蓝', brand: '#4c7196', bg: '#f4f5f7', darkBrand: '#7899bb', darkBg: '#101214' },
    { key: 'clay',      name: '陶土', brand: '#a56a48', bg: '#f8f4ef', darkBrand: '#c4885f', darkBg: '#121010' },
    { key: 'graphite',  name: '石墨', brand: '#55565e', bg: '#f5f5f4', darkBrand: '#9a9ba3', darkBg: '#111112' },
    { key: 'wisteria',  name: '黛紫', brand: '#756b99', bg: '#f6f4f8', darkBrand: '#a29ac7', darkBg: '#111014' }
  ];
  function currentTheme() {
    var t = document.documentElement.getAttribute('data-theme');
    return THEMES.filter(function (x) { return x.key === t; })[0] || THEMES[0];
  }
  function applyTheme(key, save) {
    var t = THEMES.filter(function (x) { return x.key === key; })[0] || THEMES[0];
    if (t.key === THEMES[0].key) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t.key);
    if (save) { try { localStorage.setItem('examapp-theme', t.key); } catch (e) {} }
    updateThemeColorMeta();
    markThemeRow();
  }
  function updateThemeColorMeta() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var t = currentTheme();
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? t.darkBg : t.bg);
  }
  function markThemeRow() {
    var row = $('theme-row');
    if (!row) return;
    var cur = currentTheme().key;
    Array.prototype.forEach.call(row.children, function (c) {
      var on = c.getAttribute('data-theme') === cur;
      c.classList.toggle('on', on);
      c.querySelector('.theme-sw').classList.toggle('on', on);
    });
  }
  function renderThemeRow() {
    var row = $('theme-row');
    if (!row) return;
    row.innerHTML = THEMES.map(function (t) {
      return '<button class="theme-opt" data-theme="' + t.key + '" aria-label="' + t.name + '">' +
        '<span class="theme-sw"><i style="background:' + t.brand + '"></i><b style="background:' + t.bg + '"></b></span>' +
        '<span class="theme-name">' + t.name + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(row.children, function (c) {
      c.onclick = function () {
        applyTheme(c.getAttribute('data-theme'), true);
        App.toast('已切换风格');
      };
    });
    markThemeRow();
  }

  var App = {
    banks: [],
    records: {},          // bankId -> {qid: rec}
    counts: {},           // bankId -> 题目数
    curBank: null,
    qs: [],               // 当前题库题目
    recs: {},             // 当前题库记录
    lastPage: 'page-banks',
    stack: [],
    sel: {
      pracBank: null, pracScope: 'all', pracOrder: 'seq', pracLimit: '0',
      examBank: null, examTime: '60', examSrc: 'all', examTypes: {}
    },
    pending: null,        // 待导入题目
    sheets: null,         // Excel 多工作表：[{name, questions, on}]
    sheetMode: 'merge',   // merge | split
    lastWarn: [],
    lastName: '',
    daylog: {}
  };

  /* ================= 路由 ================= */
  var TABS = ['page-banks', 'page-practice', 'page-exam', 'page-stats'];
  App.go = function (id) {
    if (id === 'page-banks') App.stack = [];
    var cur = document.querySelector('.page.active');
    if (cur && cur.id !== id && TABS.indexOf(cur.id) >= 0) App.lastPage = cur.id;
    if (cur && cur.id !== id && App.stack[App.stack.length - 1] !== cur.id) App.stack.push(cur.id);
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('active'); });
    var pg = $(id); if (pg) pg.classList.add('active');
    $('tabbar').style.display = TABS.indexOf(id) >= 0 ? 'flex' : 'none';
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === id);
    });
    if (pg && pg.querySelector('.scroll')) pg.querySelector('.scroll').scrollTop = 0;
    var nv = pg && pg.querySelector('.nav'); if (nv) nv.classList.remove('mini');
    if (id === 'page-banks') renderBanks();
    if (id === 'page-practice') renderPractice();
    if (id === 'page-exam') renderExam();
    if (id === 'page-stats') renderStats();
  };
  App.back = function () {
    var prev = App.stack.pop() || (TABS.indexOf(App.lastPage) >= 0 ? App.lastPage : 'page-banks');
    App.stack = [];
    var cur = document.querySelector('.page.active');
    if (cur) cur.classList.remove('active');
    var pg = $(prev); if (pg) pg.classList.add('active');
    $('tabbar').style.display = TABS.indexOf(prev) >= 0 ? 'flex' : 'none';
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === prev);
    });
    if (prev === 'page-banks') renderBanks();
    if (prev === 'page-stats') renderStats();
  };

  var toastT = null;
  App.toast = function (msg) {
    var t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.hidden = true; }, 2000);
  };

  /* ================= 记录辅助 ================= */
  App.rec = function (bankId, qid) {
    var m = App.records[bankId] || {};
    return m[qid] || {};
  };
  App.setRecords = function (bankId, m) { App.records[bankId] = m; if (App.curBank === bankId) App.recs = m; };
  App.isFav = function (b, q) { return !!App.rec(b, q).fav; };
  App.isMastered = function (b, q) { return !!App.rec(b, q).mastered; };
  App.toggleFav = function (b, q) {
    var v = App.isFav(b, q) ? 0 : 1;
    return DB.setRecord(b, q, { fav: v }).then(function () {
      return DB.getRecords(b).then(function (m) { App.setRecords(b, m); });
    });
  };
  App.toggleMastered = function (b, q) {
    var v = App.isMastered(b, q) ? 0 : 1;
    return DB.setRecord(b, q, { mastered: v }).then(function () {
      return DB.getRecords(b).then(function (m) { App.setRecords(b, m); });
    });
  };
  App.bumpDay = function (n) {
    var k = dayKey(Date.now());
    App.daylog[k] = (App.daylog[k] || 0) + (n || 1);
    DB.setSetting('daylog', App.daylog);
  };

  /* 筛选 */
  function filterQs(list, bankId, scope) {
    var r = App.records[bankId] || {};
    return list.filter(function (q) {
      var rec = r[q.id] || {};
      if (scope === 'new') return !rec.seen;
      if (scope === 'wrong') return (rec.wrong || 0) > 0 && !(rec.right > 0);
      if (scope === 'fav') return !!rec.fav;
      if (scope === 'unmastered') return !rec.mastered;
      return true;
    });
  }
  function sortQs(list, order, limit) {
    var l = list.slice();
    if (order === 'rand') {
      for (var i = l.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1)); var t = l[i]; l[i] = l[j]; l[j] = t;
      }
    }
    return limit > 0 ? l.slice(0, limit) : l;
  }

  /* ================= 题库列表 ================= */
  function renderBanks() {
    var wrap = $('bank-list'), empty = $('bank-empty');
    if (!App.banks.length) {
      wrap.innerHTML = ''; empty.hidden = false;
      if (!$('btn-demo')) {
        var b = document.createElement('button');
        b.id = 'btn-demo'; b.className = 'btn ghost'; b.style.cssText = 'max-width:220px;margin:0 auto';
        b.textContent = '载入示例题库（10 题）';
        b.onclick = loadDemo;
        empty.appendChild(b);
      }
      return;
    }
    empty.hidden = true;
    wrap.innerHTML = App.banks.map(function (b) {
      var total = App.counts[b.id] || 0;
      var r = App.records[b.id] || {};
      var ids = Object.keys(r);
      var done = ids.filter(function (k) { return r[k].seen > 0; }).length;
      var wrong = ids.filter(function (k) { return r[k].wrong > 0 && !(r[k].right > 0); }).length;
      var fav = ids.filter(function (k) { return r[k].fav; }).length;
      var pct = total ? Math.round(done / total * 100) : 0;
      return '<div class="bank-card" data-id="' + b.id + '">' +
        '<div class="bc-bar"></div>' +
        '<button class="bc-more" data-more="' + b.id + '" aria-label="管理题库">' +
        '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/></svg></button>' +
        '<div class="bc-name">' + esc(b.name) + '</div>' +
        '<div class="bc-sub">共 ' + total + ' 题 · 已练 ' + done + ' 题（' + pct + '%）</div>' +
        '<div class="bc-prog"><i style="width:' + pct + '%"></i></div>' +
        '<div class="bc-tags"><span class="tag b">已练 ' + done + '</span>' +
        (wrong ? '<span class="tag r">错题 ' + wrong + '</span>' : '') +
        (fav ? '<span class="tag o">收藏 ' + fav + '</span>' : '') +
        '<span class="tag">' + new Date(b.createdAt).toLocaleDateString('zh-CN') + '</span></div>' +
        '</div>';
    }).join('');
    Array.prototype.forEach.call(wrap.children, function (c) {
      c.onclick = function () { openBank(c.getAttribute('data-id')); };
    });
    Array.prototype.forEach.call(wrap.querySelectorAll('.bc-more'), function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        bankMenu(btn.getAttribute('data-more'));
      };
    });
  }

  /* 题库管理：重命名 / 删除 */
  function bankMenu(id) {
    var b = App.banks.filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    showActionSheet(b.name, [
      { label: '重命名', icon: 'rename', act: 'rename' },
      { label: '删除题库', icon: 'trash', danger: true, act: 'delete' }
    ], function (act) {
      if (act === 'rename') {
        var name = prompt('新的题库名称：', b.name);
        if (name == null || !name.trim() || name.trim() === b.name) return;
        DB.renameBank(b.id, name.trim()).then(refresh).then(function () {
          if (App.curBank === b.id) {
            $('bank-title').textContent = name.trim();
            $('bh-name').textContent = name.trim();
          }
          App.toast('已重命名');
        });
      } else if (act === 'delete') {
        if (!confirm('确定删除题库「' + b.name + '」？\n\n其中的 ' + (App.counts[b.id] || 0) + ' 道题目和答题记录将一并删除，此操作不可恢复。')) return;
        DB.deleteBank(b.id).then(refresh).then(function () {
          if (App.curBank === b.id) {
            App.curBank = null;
            if ($('page-bank').classList.contains('active')) App.go('page-banks');
          }
          App.sel.pracBank = null; App.sel.examBank = null;
          App.toast('已删除题库');
        });
      }
    });
  }

  function openBank(id) {
    App.curBank = id;
    Promise.all([DB.getQuestions(id), DB.getRecords(id), DB.getBank(id)]).then(function (r) {
      App.qs = r[0]; App.recs = r[1];
      var b = r[2] || {};
      $('bank-title').textContent = b.name || '题库';
      $('bh-name').textContent = b.name || '题库';
      var types = {};
      App.qs.forEach(function (q) { types[q.type] = (types[q.type] || 0) + 1; });
      $('bh-sub').textContent = '共 ' + App.qs.length + ' 题';
      $('bh-tags').innerHTML = Object.keys(types).map(function (t) {
        return '<span class="tag">' + Parser.typeName(t) + ' ' + types[t] + '</span>';
      }).join('');
      renderQlist();
      App.go('page-bank');
    });
  }

  function renderQlist() {
    var kw = ($('q-search').value || '').trim().toLowerCase();
    var list = App.qs;
    if (kw) list = list.filter(function (q) {
      return q.stem.toLowerCase().indexOf(kw) >= 0 ||
        (q.options || []).some(function (o) { return o.text.toLowerCase().indexOf(kw) >= 0; });
    });
    $('qlist').innerHTML = list.map(function (q) {
      var r = App.recs[q.id] || {};
      var cls = 'qi-no';
      if (r.seen) cls += (r.wrong > 0 && !(r.right > 0)) ? ' wrong' : ' right';
      return '<div class="qitem" data-id="' + q.id + '">' +
        '<div class="qi-head"><span class="' + cls + '">' + (q.idx + 1) + '</span>' +
        '<span class="qi-type ' + q.type + '">' + Parser.typeName(q.type) + '</span>' +
        (r.fav ? '<span class="qi-fav">★</span>' : '') + '</div>' +
        '<div class="qi-stem">' + esc(q.stem) + '</div></div>';
    }).join('') || '<div class="empty"><p>没有匹配的题目</p></div>';
    Array.prototype.forEach.call($('qlist').querySelectorAll('.qitem'), function (c) {
      c.onclick = function () { openEdit(c.getAttribute('data-id')); };
    });
  }

  /* ================= 编辑题目 ================= */
  var editing = null;
  function openEdit(qid) {
    var q = App.qs.filter(function (x) { return x.id === qid; })[0];
    if (!q) return;
    editing = q;
    $('ed-type').value = q.type;
    $('ed-stem').value = q.stem;
    $('ed-opts').value = (q.options || []).map(function (o) { return o.key + '. ' + o.text; }).join('\n');
    $('ed-answer').value = q.answer.join(q.type === 'fill' ? ' | ' : ',');
    $('ed-exp').value = q.explanation || '';
    $('edit-mask').hidden = false;
  }
  function saveEdit() {
    if (!editing) return;
    var q = editing;
    q.type = $('ed-type').value;
    q.stem = $('ed-stem').value.trim();
    q.options = $('ed-opts').value.split('\n').map(function (l) { return l.trim(); }).filter(Boolean)
      .map(function (l, i) {
        var m = l.match(/^\s*[（(【]?\s*([A-Fa-f])\s*[)）】.、．:：]?\s*([\s\S]*)$/);
        return m ? { key: m[1].toUpperCase(), text: m[2].trim() }
          : { key: 'ABCDEF'[i] || String.fromCharCode(65 + i), text: l };
      });
    var a = $('ed-answer').value.trim();
    q.answer = q.type === 'fill'
      ? a.split(/\s*\|\s*/).filter(Boolean)
      : (a.toUpperCase().match(/[A-F]/g) || []);
    q.explanation = $('ed-exp').value.trim();
    DB.putQuestion(q).then(function () {
      $('edit-mask').hidden = true;
      App.toast('已保存');
      renderQlist();
    });
  }

  /* ================= 练习 ================= */
  function renderPractice() {
    if (!App.banks.length) { $('prac-body').hidden = true; $('prac-empty').hidden = false; return; }
    $('prac-body').hidden = false; $('prac-empty').hidden = true;
    if (!App.sel.pracBank || !App.banks.some(function (b) { return b.id === App.sel.pracBank; })) {
      App.sel.pracBank = App.banks[0].id;
    }
    $('prac-banks').innerHTML = App.banks.map(function (b) {
      return '<button class="chip' + (b.id === App.sel.pracBank ? ' on' : '') + '" data-id="' + b.id + '">' +
        esc(b.name) + '（' + (App.counts[b.id] || 0) + '）</button>';
    }).join('');
    bindChips($('prac-banks'), 'data-id', function (v) { App.sel.pracBank = v; renderPractice(); });
  }

  function startPractice(mode) {
    var bid = App.sel.pracBank;
    var order = App.sel.pracOrder, limit = +App.sel.pracLimit;
    DB.getQuestions(bid).then(function (all) {
      return DB.getRecords(bid).then(function (recs) {
        App.setRecords(bid, recs);
        var list = sortQs(filterQs(all, bid, App.sel.pracScope), order, limit);
        if (!list.length) { App.toast('该范围内没有题目'); return; }
        var b = App.banks.filter(function (x) { return x.id === bid; })[0];
        Quiz.start({ mode: mode, bankId: bid, title: b ? b.name : '', questions: list });
      });
    });
  }

  /* ================= 考试 ================= */
  function renderExam() {
    if (!App.banks.length) { $('exam-body').hidden = true; $('exam-empty').hidden = false; return; }
    $('exam-body').hidden = false; $('exam-empty').hidden = true;
    if (!App.sel.examBank || !App.banks.some(function (b) { return b.id === App.sel.examBank; })) {
      App.sel.examBank = App.banks[0].id;
    }
    $('exam-banks').innerHTML = App.banks.map(function (b) {
      return '<button class="chip' + (b.id === App.sel.examBank ? ' on' : '') + '" data-id="' + b.id + '">' +
        esc(b.name) + '</button>';
    }).join('');
    bindChips($('exam-banks'), 'data-id', function (v) {
      App.sel.examBank = v; App.sel.examTypes = {}; renderExam();
    });
    renderExamTypes();
    renderExamHist();
  }

  function renderExamTypes() {
    var bid = App.sel.examBank;
    DB.getQuestions(bid).then(function (all) {
      var types = {};
      all.forEach(function (q) { types[q.type] = (types[q.type] || 0) + 1; });
      var keys = Parser.TYPES.filter(function (t) { return types[t]; });
      $('exam-types').innerHTML = keys.map(function (t) {
        var max = types[t];
        if (App.sel.examTypes[t] == null) App.sel.examTypes[t] = Math.min(max, 50);
        return '<div class="trow"><div class="tn">' + Parser.typeName(t) +
          '<small>题库共 ' + max + ' 题</small></div>' +
          '<div class="stepper"><button data-t="' + t + '" data-d="-1">−</button>' +
          '<input type="text" inputmode="numeric" value="' + App.sel.examTypes[t] + '" data-t="' + t + '" class="ti">' +
          '<button data-t="' + t + '" data-d="1">＋</button></div></div>';
      }).join('') + (keys.length ? '<div class="trow"><div class="tn"><b>合计</b></div>' +
        '<div class="tn" style="text-align:right"><b id="exam-total">0</b> 题</div></div>' : '<div class="trow"><div class="tn">该题库没有题目</div></div>');
      updExamTotal();
      Array.prototype.forEach.call($('exam-types').querySelectorAll('button[data-d]'), function (b) {
        b.onclick = function () {
          var t = b.getAttribute('data-t'), d = +b.getAttribute('data-d');
          var max = types[t];
          App.sel.examTypes[t] = Math.max(0, Math.min(max, (App.sel.examTypes[t] || 0) + d));
          renderExamTypes();
        };
      });
      Array.prototype.forEach.call($('exam-types').querySelectorAll('input.ti'), function (i) {
        i.onchange = function () {
          var t = i.getAttribute('data-t');
          var v = parseInt(i.value, 10); if (isNaN(v)) v = 0;
          App.sel.examTypes[t] = Math.max(0, Math.min(types[t], v));
          renderExamTypes();
        };
      });
    });
  }
  function updExamTotal() {
    var t = 0; for (var k in App.sel.examTypes) t += App.sel.examTypes[k] || 0;
    var e = $('exam-total'); if (e) e.textContent = t;
  }

  function renderExamHist() {
    DB.listExams().then(function (list) {
      list = list.slice(0, 8);
      $('exam-hist').innerHTML = list.length ? list.map(function (e) {
        var rate = e.total ? Math.round(e.score / e.total * 100) : 0;
        return '<div class="hi" data-id="' + e.id + '">' +
          '<div class="hi-s ' + (rate >= 60 ? 'pass' : 'fail') + '">' + e.score + '<small style="font-size:12px">/' + e.total + '</small></div>' +
          '<div class="hi-i"><div>' + esc(e.bankName || '考试') + ' · 正确率 ' + rate + '%</div>' +
          '<div>' + new Date(e.startedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) +
          ' · 用时 ' + Math.round(e.used / 60) + ' 分钟</div></div></div>';
      }).join('') : '<div class="hint" style="margin:0">还没有考试记录</div>';
      Array.prototype.forEach.call($('exam-hist').querySelectorAll('.hi'), function (c) {
        c.onclick = function () {
          DB.getExam(c.getAttribute('data-id')).then(function (e) { if (e) App.showResult(e); });
        };
      });
    });
  }

  function startExam() {
    var bid = App.sel.examBank;
    DB.getQuestions(bid).then(function (all) {
      return DB.getRecords(bid).then(function (recs) {
        App.setRecords(bid, recs);
        var pool = filterQs(all, bid, App.sel.examSrc);
        var picked = [];
        Parser.TYPES.forEach(function (t) {
          var n = App.sel.examTypes[t] || 0;
          if (!n) return;
          var sub = pool.filter(function (q) { return q.type === t; });
          for (var i = sub.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1)); var tmp = sub[i]; sub[i] = sub[j]; sub[j] = tmp;
          }
          picked = picked.concat(sub.slice(0, n));
        });
        if (!picked.length) { App.toast('请至少选择一道题'); return; }
        var b = App.banks.filter(function (x) { return x.id === bid; })[0];
        window.__examFinished = false;
        Quiz.start({
          mode: 'exam', bankId: bid, title: b ? b.name : '',
          questions: picked, duration: +App.sel.examTime * 60
        });
      });
    });
  }

  /* ================= 结果页 ================= */
  App.showResult = function (e) {
    var rate = e.total ? Math.round(e.score / e.total * 100) : 0;
    $('rs-score').innerHTML = e.score + '<small> / ' + e.total + '</small>';
    $('rs-sub').innerHTML = '正确率 <b>' + rate + '%</b> · 答对 ' + e.correct + ' 题' +
      (e.partial ? ' · 漏选 ' + e.partial + ' 题' : '') +
      '<br>用时 ' + Math.max(1, Math.round(e.used / 60)) + ' 分钟' + (e.auto ? '（自动交卷）' : '') +
      '<br>' + esc(e.bankName || '') + ' · ' + new Date(e.startedAt).toLocaleString('zh-CN');
    $('rs-list').innerHTML = e.detail.map(function (d, i) {
      var ansTxt = d.type === 'fill' ? (d.answer || []).join(' / ')
        : (d.answer || []).map(function (k) {
          var o = (d.options || []).filter(function (x) { return x.key === k; })[0];
          return k + (o ? '.' + o.text : '');
        }).join('  ');
      var uTxt = d.user == null ? '未作答'
        : (Array.isArray(d.user) ? d.user.join('') : d.user);
      return '<div class="rsi' + (d.ok ? '' : ' bad') + '">' +
        '<div class="rsi-h"><span>' + (i + 1) + '</span><span>' + Parser.typeName(d.type) + '</span>' +
        '<span>' + (d.ok ? '✓ 正确' : (d.partial ? '△ 漏选' : '✗ 错误')) + '</span></div>' +
        '<div class="rsi-s">' + esc(d.stem) + '</div>' +
        '<div class="rsi-a">正确：<b>' + esc(ansTxt) + '</b>　你的：' + esc(uTxt) + '</div>' +
        (d.explanation ? '<div class="rsi-a" style="margin-top:4px">解析：' + esc(d.explanation) + '</div>' : '') +
        '</div>';
    }).join('');
    App.go('page-result');
    App.stack = [];
  };

  /* ================= 统计 ================= */
  function renderStats() {
    var totalQ = 0, done = 0, wrong = 0, fav = 0, rightTimes = 0, totalTimes = 0;
    var byType = {};
    App.banks.forEach(function (b) {
      var r = App.records[b.id] || {};
      totalQ += App.counts[b.id] || 0;
      Object.keys(r).forEach(function (k) {
        var rec = r[k];
        if (rec.seen) done++;
        if (rec.wrong > 0 && !(rec.right > 0)) wrong++;
        if (rec.fav) fav++;
        rightTimes += rec.right || 0;
        totalTimes += (rec.right || 0) + (rec.wrong || 0);
      });
    });
    var acc = totalTimes ? Math.round(rightTimes / totalTimes * 100) : 0;
    $('stat-cards').innerHTML =
      card(totalQ, '题库总题数') + card(App.banks.length, '题库数量') +
      card(done, '已练习题目') + card(acc + '%', '总体正确率') +
      card(wrong, '待攻克错题') + card(fav, '收藏题目');

    // 近 14 天
    var days = [], max = 1;
    for (var i = 13; i >= 0; i--) {
      var t = Date.now() - i * 86400000, k = dayKey(t);
      var v = App.daylog[k] || 0;
      if (v > max) max = v;
      days.push({ k: k, v: v, d: new Date(t).getDate() });
    }
    $('stat-chart').innerHTML = days.map(function (o) {
      var h = Math.max(2, Math.round(o.v / max * 92));
      return '<div class="cb" title="' + o.k + '：' + o.v + ' 题"><i style="height:' + h + 'px"></i><span>' + o.d + '</span></div>';
    }).join('');

    // 题型掌握
    var all = [];
    var chain = Promise.resolve();
    App.banks.forEach(function (b) {
      chain = chain.then(function () {
        return DB.getQuestions(b.id).then(function (qs) {
          qs.forEach(function (q) {
            var r = App.rec(b.id, q.id);
            all.push({ type: q.type, right: r.right || 0, wrong: r.wrong || 0, seen: r.seen || 0 });
          });
        });
      });
    });
    chain.then(function () {
      var t = {};
      all.forEach(function (x) {
        t[x.type] = t[x.type] || { n: 0, ok: 0, seen: 0 };
        t[x.type].n++;
        t[x.type].ok += x.right;
        t[x.type].seen += x.seen;
      });
      var keys = Parser.TYPES.filter(function (k) { return t[k]; });
      $('stat-types').innerHTML = keys.length ? keys.map(function (k) {
        var o = t[k];
        var rate = o.seen ? Math.round(o.ok / Math.max(1, o.ok + (o.seen - o.ok)) * 100) : 0;
        return '<div class="ts-row"><div class="ts-n">' + Parser.typeName(k).replace('题', '') + '</div>' +
          '<div class="ts-bar"><i style="width:' + rate + '%"></i></div>' +
          '<div class="ts-v">' + rate + '% · ' + o.n + '题</div></div>';
      }).join('') : '<div class="hint" style="margin:0">暂无数据</div>';
    });

    // 题库进度
    $('stat-banks').innerHTML = App.banks.length ? App.banks.map(function (b) {
      var total = App.counts[b.id] || 0;
      var r = App.records[b.id] || {};
      var d = Object.keys(r).filter(function (k) { return r[k].seen; }).length;
      var pct = total ? Math.round(d / total * 100) : 0;
      return '<div class="bp-row"><div class="bp-h"><span>' + esc(b.name) + '</span><span>' + d + '/' + total + '</span></div>' +
        '<div class="bp-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('') : '<div class="hint" style="margin:0">暂无题库</div>';
  }
  function card(v, l) {
    return '<div class="sc"><div class="sc-v">' + esc(v) + '</div><div class="sc-l">' + esc(l) + '</div></div>';
  }

  /* ================= 导入 ================= */
  /* 当前选中的题目（考虑工作表勾选 / 合并或拆分） */
  function selectedQuestions() {
    if (!App.sheets) return App.pending || [];
    var out = [];
    App.sheets.forEach(function (s) { if (s.on) out = out.concat(s.questions); });
    return out;
  }

  function renderSheetList() {
    $('imp-sheet-list').innerHTML = App.sheets.map(function (s, i) {
      return '<label class="sh-row' + (s.questions.length ? '' : ' off') + '">' +
        '<input type="checkbox" data-i="' + i + '"' + (s.on ? ' checked' : '') + '>' +
        '<span class="sh-n">' + esc(s.name) + '</span>' +
        '<span class="sh-c">' + s.questions.length + ' 题</span></label>';
    }).join('');
    Array.prototype.forEach.call($('imp-sheet-list').querySelectorAll('input'), function (c) {
      c.onchange = function () {
        App.sheets[+c.getAttribute('data-i')].on = c.checked;
        renderPreview(App.lastWarn, App.lastName);
      };
    });
  }

  function showPreview(res, defaultName) {
    App.lastWarn = res.warnings || [];
    App.lastName = defaultName;
    App.pending = res.questions || [];
    App.sheets = (res.sheets && res.sheets.length > 1)
      ? res.sheets.map(function (s) { return { name: s.name, questions: s.questions, on: true }; })
      : null;
    if (App.sheets) {
      if (!App.sheetMode) App.sheetMode = 'merge';
      setGroup('imp-sheet-mode', App.sheetMode);
      renderSheetList();
      $('imp-sheets').hidden = false;
    } else {
      $('imp-sheets').hidden = true;
    }
    renderPreview(App.lastWarn, defaultName);
  }

  function renderPreview(warnings, defaultName) {
    var list = selectedQuestions();
    App.pending = list;
    $('imp-preview').hidden = false;
    $('imp-count').textContent = list.length;
    if (defaultName && !$('imp-name').value) $('imp-name').value = defaultName;
    var t = {};
    list.forEach(function (q) { t[q.type] = (t[q.type] || 0) + 1; });
    $('imp-stats').innerHTML = Parser.TYPES.filter(function (k) { return t[k]; }).map(function (k) {
      return '<span class="tag b">' + Parser.typeName(k) + ' ' + t[k] + '</span>';
    }).join('') || '<span class="tag">未识别</span>';
    if (warnings && warnings.length) {
      $('imp-warn').hidden = false;
      $('imp-warn').innerHTML = '⚠️ ' + warnings.slice(0, 12).map(esc).join('<br>') +
        (warnings.length > 12 ? '<br>…等共 ' + warnings.length + ' 条提示' : '');
    } else $('imp-warn').hidden = true;
    $('imp-samples').innerHTML = list.slice(0, 3).map(function (q) {
      return '<div class="sample"><div class="s-stem">' + (q.idx + 1) + '. ' + esc(q.stem) + '</div>' +
        (q.options.length ? '<div class="s-opts">' + q.options.map(function (o) {
          return esc(o.key) + '. ' + esc(o.text);
        }).join('<br>') + '</div>' : '') +
        '<div class="s-ans' + (q.answer.length ? '' : ' s-bad') + '">答案：' +
        esc(q.answer.join(q.type === 'fill' ? ' / ' : ',')) + '（' + Parser.typeName(q.type) + '）' +
        (q.answer.length ? '' : '　⚠️ 未识别到答案') + '</div></div>';
    }).join('');
  }

  function resetImport() {
    App.pending = null;
    App.sheets = null;
    App.lastWarn = [];
    $('imp-preview').hidden = true;
    $('imp-sheets').hidden = true;
    $('imp-fname').hidden = true;
  }

  function doImport() {
    var list = selectedQuestions();
    if (!list || !list.length) { App.toast('没有可导入的题目，请勾选工作表或检查格式'); return; }
    var name = $('imp-name').value.trim() || '题库 ' + new Date().toLocaleDateString('zh-CN');
    var split = App.sheets && App.sheetMode === 'split';

    if (split) {
      var groups = App.sheets.filter(function (s) { return s.on && s.questions.length; });
      if (!groups.length) { App.toast('请至少勾选一个工作表'); return; }
      var chain = Promise.resolve(), n = 0, first = null;
      groups.forEach(function (g) {
        chain = chain.then(function () {
          return DB.addBank(name + ' · ' + g.name).then(function (b) {
            if (!first) first = b;
            n += g.questions.length;
            return DB.addQuestions(b.id, g.questions);
          });
        });
      });
      chain.then(function () {
        App.toast('已创建 ' + groups.length + ' 个题库，共 ' + n + ' 题');
        $('imp-name').value = ''; $('imp-text').value = '';
        resetImport();
        return refresh().then(function () { App.go('page-banks'); });
      }).catch(function (e) { App.toast('导入失败：' + e.message); });
      return;
    }

    DB.addBank(name).then(function (b) {
      return DB.addQuestions(b.id, list).then(function () { return b; });
    }).then(function (b) {
      App.toast('成功导入 ' + list.length + ' 题');
      $('imp-name').value = '';
      $('imp-text').value = '';
      resetImport();
      return refresh().then(function () {
        App.sel.pracBank = b.id; App.sel.examBank = b.id;
        openBank(b.id);
      });
    }).catch(function (e) { App.toast('导入失败：' + e.message); });
  }

  /* ================= 示例题库 ================= */
  function loadDemo() {
    var txt = [
      '1. 下列哪一项属于行政处罚？',
      'A. 罚款', 'B. 拘役', 'C. 罚金', 'D. 管制',
      '答案：A',
      '解析：罚款属于行政处罚；罚金、拘役、管制属于刑罚。',
      '',
      '2. 关于法人的说法，正确的有',
      'A. 法人应当依法成立', 'B. 法人能够独立承担民事责任',
      'C. 法人必须有法定代表人', 'D. 法人就是法定代表人',
      '答案：ABC',
      '解析：法人是组织，法定代表人是自然人，二者不同，D 错误。',
      '',
      '3. 诉讼时效期间届满后，义务人可以提出不履行义务的抗辩。',
      'A. 正确', 'B. 错误',
      '答案：A',
      '解析：诉讼时效届满产生抗辩权，义务人可拒绝履行。',
      '',
      '4. 我国现行宪法颁布于____年。',
      '答案：1982',
      '解析：1954 年第一部宪法，现行宪法为 1982 年宪法。',
      '',
      '5. 民事法律行为可以采用的形式包括',
      'A. 书面形式', 'B. 口头形式', 'C. 推定形式', 'D. 沉默形式',
      '答案：ABCD',
      '解析：沉默只有在有法律规定、当事人约定或交易习惯时才可视为意思表示。',
      '',
      '6. 以下属于主刑的是',
      'A. 管制', 'B. 拘役', 'C. 有期徒刑', 'D. 剥夺政治权利',
      '答案：ABC',
      '解析：剥夺政治权利属于附加刑。',
      '',
      '7. 无民事行为能力人实施的民事法律行为无效。',
      'A. 正确', 'B. 错误',
      '答案：A',
      '解析：无民事行为能力人独立实施的法律行为无效，由法定代理人代理。',
      '',
      '8. 我国刑法的基本原则不包括',
      'A. 罪刑法定原则', 'B. 适用刑法人人平等原则',
      'C. 罪责刑相适应原则', 'D. 疑罪从无原则',
      '答案：D',
      '解析：刑法三大基本原则为罪刑法定、适用平等、罪责刑相适应。',
      '',
      '9. 因不可抗力不能履行合同的，应当及时通知对方，以减轻可能给对方造成的损失。',
      'A. 正确', 'B. 错误',
      '答案：A',
      '解析：不可抗力免责需履行通知与减损义务。',
      '',
      '10. 限制民事行为能力人订立的合同，经法定代理人追认后有效，相对人可以催告法定代理人在____内予以追认。',
      '答案：1个月 | 一个月 | 30日',
      '解析：相对人可催告法定代理人在一个月内追认。'
    ].join('\n');
    var res = Parser.parseText(txt, 'txt');
    App.sheets = null;
    App.pending = res.questions;
    $('imp-name').value = '示例题库·法律常识';
    doImport();
  }

  /* ================= 数据刷新 ================= */
  function refresh() {
    return DB.listBanks().then(function (banks) {
      App.banks = banks;
      return Promise.all(banks.map(function (b) {
        return DB.countByBank(b.id).then(function (n) { App.counts[b.id] = n; })
          .then(function () { return DB.getRecords(b.id); })
          .then(function (m) { App.records[b.id] = m; });
      }));
    });
  }
  App.refreshAll = function () {
    refresh().then(function () {
      var cur = document.querySelector('.page.active');
      if (!cur) return;
      if (cur.id === 'page-banks') renderBanks();
      if (cur.id === 'page-stats') renderStats();
      if (cur.id === 'page-exam') renderExam();
      if (cur.id === 'page-bank' && App.curBank) {
        App.qs.forEach(function () { });
        renderQlist();
      }
    });
  };

  /* ================= chips 工具 ================= */
  function bindChips(wrap, attr, cb) {
    Array.prototype.forEach.call(wrap.children, function (c) {
      c.onclick = function () { cb(c.getAttribute(attr)); };
    });
  }
  function setGroup(id, v) {
    var w = $(id);
    Array.prototype.forEach.call(w.children, function (c) {
      c.classList.toggle('on', c.getAttribute('data-v') === v);
    });
  }
  function bindGroup(id, key) {
    var w = $(id);
    Array.prototype.forEach.call(w.children, function (c) {
      c.onclick = function () {
        Array.prototype.forEach.call(w.children, function (x) { x.classList.remove('on'); });
        c.classList.add('on');
        App.sel[key] = c.getAttribute('data-v');
      };
    });
  }

  /* ================= 备份导出 ================= */
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  }

  /* iOS 大标题：滚动时收起为导航栏小标题 */
  function bindLargeTitles() {
    document.querySelectorAll('.page').forEach(function (p) {
      var sc = p.querySelector('.scroll'), nv = p.querySelector('.nav');
      if (!sc || !nv || !nv.querySelector('.nav-t')) return;
      sc.addEventListener('scroll', function () {
        nv.classList.toggle('mini', sc.scrollTop > 26);
      }, { passive: true });
    });
  }

  /* ================= 初始化 ================= */
  function init() {
    detectSafeArea();     // 必须在渲染前：决定是否启用顶部安全区兜底
    Quiz.bind();
    bindLargeTitles();

    // 界面风格：恢复上次选择 + 渲染选择器
    try {
      var saved = localStorage.getItem('examapp-theme');
      if (saved) applyTheme(saved, false);
      else updateThemeColorMeta();
    } catch (e) { updateThemeColorMeta(); }
    renderThemeRow();

    // 答题与翻题偏好开关
    bindSwitch('sw-autoNext', 'autoNext');
    bindSwitch('sw-swipeV', 'swipeV');
    bindSwitch('sw-swipeH', 'swipeH');
    if (window.matchMedia) {
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onScheme = function () { updateThemeColorMeta(); };
      if (mq.addEventListener) mq.addEventListener('change', onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }

    // 动作面板关闭
    $('menu-cancel').onclick = hideActionSheet;
    $('menu-mask').onclick = function (e) { if (e.target === $('menu-mask')) hideActionSheet(); };

    // 底部导航
    document.querySelectorAll('.tab').forEach(function (t) {
      t.onclick = function () { App.go(t.getAttribute('data-tab')); };
    });
    document.querySelectorAll('[data-back]').forEach(function (b) {
      b.onclick = function () { App.back(); };
    });
    document.querySelectorAll('[data-goto]').forEach(function (b) {
      b.onclick = function () { App.go(b.getAttribute('data-goto')); };
    });

    // 题库页
    $('btn-goto-import').onclick = function () { App.go('page-import'); };
    $('btn-empty-import').onclick = function () { App.go('page-import'); };

    // 题库详情
    $('q-search').oninput = renderQlist;
    $('btn-bank-more').onclick = function () {
      if (App.curBank) bankMenu(App.curBank);
    };
    document.querySelectorAll('.qa').forEach(function (b) {
      b.onclick = function () {
        var act = b.getAttribute('data-act');
        App.sel.pracBank = App.curBank;
        if (act === 'recite') { App.sel.pracScope = 'all'; startPractice('recite'); return; }
        App.sel.pracScope = act === 'all' ? 'all' : act;
        startPractice('practice');
      };
    });

    // 导入
    $('imp-drop').onclick = function () { $('imp-file').click(); };
    $('imp-file').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      resetImport();
      $('imp-fname').hidden = false;
      $('imp-fname').textContent = '已选择：' + f.name + '（解析中…）';
      Parser.parseFile(f).then(function (res) {
        $('imp-fname').textContent = '已选择：' + f.name;
        showPreview(res, f.name.replace(/\.[^.]+$/, ''));
        App.toast('解析出 ' + selectedQuestions().length + ' 题');
      }).catch(function (err) {
        $('imp-fname').textContent = '解析失败：' + err.message;
        App.toast('解析失败：' + err.message);
      });
      e.target.value = '';
    };
    $('btn-parse').onclick = function () {
      var t = $('imp-text').value;
      if (!t.trim()) { App.toast('请先粘贴内容'); return; }
      var res = Parser.parseText(t);
      showPreview(res, '');
      App.toast('解析出 ' + res.questions.length + ' 题');
    };
    $('btn-clear-text').onclick = function () { $('imp-text').value = ''; resetImport(); };
    $('btn-do-import').onclick = doImport;
    bindGroup('imp-sheet-mode', 'sheetMode');
    Array.prototype.forEach.call($('imp-sheet-mode').children, function (c) {
      c.onclick = function () {
        setGroup('imp-sheet-mode', c.getAttribute('data-v'));
        App.sheetMode = c.getAttribute('data-v');
        renderPreview(App.lastWarn, App.lastName);
      };
    });
    $('btn-tpl').onclick = function () {
      download('题库模板.csv', Parser.TPL_CSV, 'text/csv;charset=utf-8');
      App.toast('已下载 CSV 模板，可用 Excel 打开编辑');
    };

    // 练习
    bindGroup('prac-scope', 'pracScope');
    bindGroup('prac-order', 'pracOrder');
    bindGroup('prac-limit', 'pracLimit');
    $('btn-start-prac').onclick = function () { startPractice('practice'); };
    $('btn-start-recite').onclick = function () { startPractice('recite'); };

    // 考试
    bindGroup('exam-time', 'examTime');
    bindGroup('exam-src', 'examSrc');
    $('btn-start-exam').onclick = startExam;

    // 统计 / 设置
    $('btn-settings').onclick = function () { App.go('page-settings'); };
    $('btn-export').onclick = function () {
      DB.exportAll().then(function (data) {
        download('考试宝备份-' + dayKey(Date.now()) + '.json', JSON.stringify(data), 'application/json');
        App.toast('已导出备份文件');
      });
    };
    $('btn-import-bak').onclick = function () { $('bak-file').click(); };
    $('bak-file').onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      var fr = new FileReader();
      fr.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (!data || !data.banks) throw new Error('不是有效的备份文件');
          DB.importAll(data).then(refresh).then(function () {
            App.toast('已恢复 ' + data.banks.length + ' 个题库');
            App.go('page-banks');
          });
        } catch (err) { App.toast('恢复失败：' + err.message); }
      };
      fr.readAsText(f, 'utf-8');
      e.target.value = '';
    };
    $('btn-clear-records').onclick = function () {
      if (!confirm('将清空所有答题记录、错题本、收藏和考试记录，题库和题目保留。确定继续？')) return;
      DB.clearRecords().then(function () { return DB.setSetting('daylog', {}); })
        .then(function () { App.daylog = {}; return refresh(); })
        .then(function () { App.toast('已清空答题记录'); App.refreshAll(); });
    };
    $('btn-wipe').onclick = function () {
      if (!confirm('将删除全部题库、题目和记录，且无法恢复。建议先导出备份。确定继续？')) return;
      DB.wipe().then(function () {
        App.records = {}; App.counts = {}; App.daylog = {}; App.curBank = null;
        return refresh();
      }).then(function () { App.go('page-banks'); App.toast('已清空全部数据'); });
    };

    // 编辑题目
    $('edit-close').onclick = function () { $('edit-mask').hidden = true; };
    $('edit-mask').onclick = function (e) { if (e.target === $('edit-mask')) $('edit-mask').hidden = true; };
    $('ed-save').onclick = saveEdit;
    $('ed-del').onclick = function () {
      if (!editing) return;
      if (!confirm('删除本题？')) return;
      DB.deleteQuestion(editing.id).then(function () {
        App.qs = App.qs.filter(function (q) { return q.id !== editing.id; });
        App.counts[App.curBank] = Math.max(0, (App.counts[App.curBank] || 1) - 1);
        $('edit-mask').hidden = true;
        App.toast('已删除');
        renderQlist();
      });
    };

    // 安装提示
    var standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!standalone && isIOS) {
      DB.getSetting('tipClosed').then(function (v) {
        if (!v) $('install-tip').hidden = false;
      });
    }
    $('it-close').onclick = function () {
      $('install-tip').hidden = true;
      DB.setSetting('tipClosed', 1);
    };

    // Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', function () {
        navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(function () { });
      });
      // 新版本接管后静默刷新一次，确保立刻用上最新代码（每次会话只刷一次）
      var reloaded = false;
      try { reloaded = sessionStorage.getItem('examapp-sw-reloaded') === '1'; } catch (e) {}
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (reloaded) return;
        try { sessionStorage.setItem('examapp-sw-reloaded', '1'); } catch (e) {}
        window.location.reload();
      });
    }

    // 启动
    DB.init().then(function () {
      return DB.getSetting('daylog').then(function (v) { App.daylog = v || {}; });
    }).then(refresh).then(function () {
      renderBanks();
      App.go('page-banks');
    }).catch(function (e) {
      document.body.innerHTML = '<div style="padding:40px;text-align:center">初始化失败：' + esc(e.message) + '</div>';
    });
  }

  App.demo = loadDemo;
  App.getPref = getPref;
  App.setPref = setPref;
  window.App = App;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
