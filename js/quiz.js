/* 答题引擎：练习 / 背题 / 考试 三种模式共用 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var S = null;   // 当前会话
  var timer = null;

  var el = {};
  function cache() {
    ['qz-back', 'qz-bar', 'qz-pos', 'qz-card', 'qz-type', 'qz-timer', 'qz-stem', 'qz-opts',
      'qz-fillwrap', 'qz-fill', 'qz-ansblock', 'qz-ans-toggle', 'qz-ans-body', 'qz-mine',
      'qz-right', 'qz-exp2', 'qz-redo', 'qz-prev', 'qz-fav', 'qz-main', 'qz-next',
      'qz-body', 'card-mask', 'sh-grid', 'sh-close', 'sh-hint'].forEach(function (k) { el[k] = $(k); });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* ---------------- 开始 ---------------- */
  function start(cfg) {
    cache();
    S = {
      mode: cfg.mode,               // practice | recite | exam
      bankId: cfg.bankId,
      title: cfg.title || '',
      qs: cfg.questions.slice(),
      duration: cfg.duration || 0,  // 秒
      i: 0,
      answers: {},                  // qid -> {v, ok, partial}
      startAt: Date.now(),
      endAt: cfg.duration ? Date.now() + cfg.duration * 1000 : 0
    };
    S.states = S.qs.map(function () { return { v: null, done: false, ok: false, partial: false }; });

    el['qz-timer'].hidden = !cfg.duration;
    el['card-mask'].hidden = true;
    App.go('page-quiz');
    render();
    if (cfg.duration) {
      clearInterval(timer);
      timer = setInterval(tick, 1000);
      tick();
    } else {
      clearInterval(timer);
    }
  }

  function tick() {
    var left = Math.max(0, Math.round((S.endAt - Date.now()) / 1000));
    var m = Math.floor(left / 60), s = left % 60;
    el['qz-timer'].textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
    el['qz-timer'].className = 'qz-timer' + (left <= 60 ? ' urgent' : '');
    if (left <= 0) {
      clearInterval(timer);
      App.toast('考试时间到，自动交卷');
      finishExam(true);
    }
  }

  /* ---------------- 渲染 ---------------- */
  function render() {
    var q = S.qs[S.i], st = S.states[S.i];
    var pct = ((S.i + 1) / S.qs.length) * 100;
    el['qz-bar'].style.width = pct + '%';
    el['qz-pos'].textContent = (S.i + 1) + '/' + S.qs.length;
    el['qz-type'].textContent = Parser.typeName(q.type);
    el['qz-type'].className = 'qz-type ' + q.type;
    el['qz-stem'].textContent = q.stem;

    // 选项区
    var isChoice = q.type !== 'fill';
    el['qz-opts'].hidden = !isChoice;
    el['qz-fillwrap'].hidden = isChoice;
    if (isChoice) {
      var sel = Array.isArray(st.v) ? st.v : (st.v ? [st.v] : []);
      el['qz-opts'].innerHTML = q.options.map(function (o) {
        var cls = 'opt';
        if (sel.indexOf(o.key) >= 0) cls += ' sel';   // 高亮上次作答的选项
        // 练习模式判分后不再标出正确/错误项（答案在折叠的解析卡里，且可随时修改）
        // 只在背题模式直接标出正确项
        if (S.mode === 'recite') cls += ' locked';
        if (S.mode === 'recite' && q.answer.indexOf(o.key) >= 0) cls += ' right locked';
        return '<button class="' + cls + '" data-k="' + esc(o.key) + '">' +
          '<span class="k' + (q.type === 'multiple' ? ' multi' : '') + '">' + esc(o.key) + '</span>' +
          '<span>' + esc(o.text) + '</span></button>';
      }).join('');
      Array.prototype.forEach.call(el['qz-opts'].children, function (b) {
        b.onclick = function () { pick(b.getAttribute('data-k')); };
      });
    } else {
      el['qz-fill'].value = typeof st.v === 'string' ? st.v : '';
      el['qz-fill'].disabled = (S.mode === 'recite');   // 练习判分后仍可修改答案
    }

    // 答案解析折叠块（取代浏览：默认折叠，可展开看我的答案 / 正确答案 / 参考解析）
    if (S.mode === 'exam') {
      el['qz-ansblock'].hidden = true;      // 考试不显示答案
      el['qz-redo'].hidden = true;
    } else {
      el['qz-ansblock'].hidden = false;
      el['qz-ans-toggle'].classList.toggle('open', !!S.expOpen);
      el['qz-ans-body'].hidden = !S.expOpen;
      el['qz-redo'].hidden = !(S.mode === 'practice' && st.done);
      if (S.expOpen) {
        var mine = '—';
        if (Array.isArray(st.v) && st.v.length) mine = q.type === 'fill' ? st.v.join(' / ') : st.v.join('、');
        else if (typeof st.v === 'string' && st.v) mine = st.v;
        el['qz-mine'].textContent = mine;
        el['qz-mine'].className = st.done ? (st.ok ? 'ok' : (st.partial ? 'part' : 'bad')) : '';
        var ansTxt2 = q.type === 'fill'
          ? q.answer.join(' / ')
          : q.answer.map(function (k) {
            var o = (q.options || []).filter(function (x) { return x.key === k; })[0];
            return k + (o ? '. ' + o.text : '');
          }).join('　');
        el['qz-right'].textContent = ansTxt2 || '—';
        el['qz-exp2'].textContent = q.explanation || '暂无答案解析';
      }
    }

    // 底部按钮
    el['qz-prev'].disabled = S.i === 0;
    el['qz-prev'].textContent = '上一题';
    if (S.mode === 'practice') {
      el['qz-main'].hidden = true;      // 练习不再需要「确认作答」：跳转或退出即判为已作答
    } else if (S.mode === 'recite') {
      var mst = App.isMastered(S.bankId, q.id);
      el['qz-main'].hidden = false;
      el['qz-main'].textContent = mst ? '✓ 已掌握（点击取消）' : '✓ 记住了';
      el['qz-main'].disabled = false;
      el['qz-main'].style.opacity = 1;
    } else {
      el['qz-main'].hidden = false;
      el['qz-main'].textContent = '交卷';
      el['qz-main'].disabled = false;
      el['qz-main'].style.opacity = 1;
    }
    var last = S.i === S.qs.length - 1;
    el['qz-next'].textContent = last ? '完成' : '下一题';

    var fav = App.isFav(S.bankId, q.id);
    el['qz-fav'].textContent = fav ? '★ 已收藏' : '☆ 收藏';
    el['qz-fav'].className = 'qz-act fav' + (fav ? ' on' : '');

    if (S.mode === 'practice') saveSession();
  }

  /* ---------------- 作答 ---------------- */
  function pick(k) {
    if (!S) return;
    var q = S.qs[S.i], st = S.states[S.i];
    if (S.mode === 'recite') return;
    if (st.done && S.mode === 'practice') resetAnswered();   // 已判分也可修改：撤销后重选
    else if (st.done) return;

    if (q.type === 'multiple') {
      var cur = Array.isArray(st.v) ? st.v.slice() : [];
      var p = cur.indexOf(k);
      if (p >= 0) cur.splice(p, 1); else cur.push(k);
      st.v = cur.sort();
      if (S.mode === 'exam') { render(); return; }
      render();
    } else {
      st.v = [k];
      if (S.mode === 'exam') {
        // 考试：只记录所选，不判分不显示答案（交卷时统一判分），短暂停顿后自动跳下一题
        // 注意不能在此置 st.done / 写记录：否则交卷时会被当成"已判过"而漏判、且 seen 会重复计数
        render();
        setTimeout(function () { if (S.i < S.qs.length - 1) { S.i++; S.expOpen = false; render(); } }, 220);
      } else {
        render();
        // 单选/判断：选定后不判分，停顿片刻直接跳下一题（可在 设置 → 答题与翻题 关闭）
        // 仅记录所选项，不显示对错、不写入正确/错误记录；需要判分时关掉开关或点「确认作答」
        if ((q.type === 'single' || q.type === 'judge') && App.getPref && App.getPref('autoNext')) {
          var session = S, idx = S.i, last = S.i === S.qs.length - 1;
          setTimeout(function () {
            // 期间若已翻页/退出会话则不跳转，避免误跳
            if (!S || S !== session || S.i !== idx) return;
            if (!last) { autoSubmit(); S.i++; S.expOpen = false; render(); }
          }, 420);
        }
      }
    }
  }

  function saveRecord(q, st, graded) {
    // 会话可能在写入过程中结束（如退出时自动判分），先固定 bankId 避免异步回调里 S 已为 null
    var bid = S ? S.bankId : (App.sel.pracBank || App.sel.examBank || App.sel.homeBank);
    if (!bid) return Promise.resolve();
    var mode = S ? S.mode : 'practice';
    var patch = {};
    if (mode === 'recite') return Promise.resolve();
    patch.seen = (App.rec(bid, q.id).seen || 0) + 1;
    if (graded) {
      if (st.ok) patch.right = (App.rec(bid, q.id).right || 0) + 1;
      else patch.wrong = (App.rec(bid, q.id).wrong || 0) + 1;
    }
    return DB.setRecord(bid, q.id, patch).then(function () {
      return DB.getRecords(bid).then(function (m) { App.setRecords(bid, m); });
    });
  }

  /* 撤销上一轮判分的记录，使重新作答不会把 seen / right / wrong 重复累加 */
  function revertRecord(q, st) {
    var bid = S ? S.bankId : null;
    if (!bid) return Promise.resolve();
    var rec = App.rec(bid, q.id) || {};
    var patch = {};
    if (rec.seen) patch.seen = Math.max(0, (rec.seen || 0) - 1);
    if (st.ok) { if (rec.right) patch.right = Math.max(0, rec.right - 1); }
    else if (rec.wrong) patch.wrong = Math.max(0, rec.wrong - 1);
    if (!Object.keys(patch).length) return Promise.resolve();
    return DB.setRecord(bid, q.id, patch).then(function () {
      return DB.getRecords(bid).then(function (m) { App.setRecords(bid, m); });
    });
  }

  /* 练习模式：已判分的题允许重新选择（先撤销上一轮记录，再按新答案判分） */
  function resetAnswered() {
    if (!S || S.mode !== 'practice') return;
    var st = S.states[S.i];
    if (!st || !st.done) return;
    var q = S.qs[S.i];
    revertRecord(q, st);
    st.done = false; st.ok = false; st.partial = false;
  }

  function submitCurrent(quiet) {
    if (!S) return false;
    var q = S.qs[S.i], st = S.states[S.i];
    if (st.done) return false;
    if (q.type === 'fill') {
      var v = document.getElementById('qz-fill').value.trim();
      if (!v) { if (!quiet) App.toast('请先填写答案'); return false; }
      st.v = v;
    }
    if (!st.v || (Array.isArray(st.v) && !st.v.length)) {
      if (!quiet) App.toast('请先选择答案');
      return false;
    }
    var r = Parser.check(q, q.type === 'fill' ? st.v : st.v);
    st.ok = r.ok; st.partial = r.partial; st.done = true;
    saveRecord(q, st, true);
    if (!quiet) S.expOpen = true;   // 主动判分才自动展开答案解析
    render();
    return true;
  }

  /* 练习模式：翻页 / 退出 / 完成时把当前题自动判为已作答（静默，不弹解析） */
  function autoSubmit() {
    if (!S || S.mode !== 'practice') return;
    var st = S.states[S.i];
    if (!st || st.done) return;
    var v = st.v;
    if (!v || (Array.isArray(v) && !v.length)) return;   // 未作答不判
    submitCurrent(true);
  }

  /* ---------------- 题卡 ---------------- */
  function openCard() {
    el['sh-grid'].innerHTML = S.qs.map(function (q, i) {
      var st = S.states[i], cls = 'qn';
      if (i === S.i) cls += ' cur';
      else if (st.done && S.mode !== 'exam') cls += st.ok ? ' right' : ' wrong';
      else if (st.v && (Array.isArray(st.v) ? st.v.length : st.v)) cls += ' done';
      return '<button class="' + cls + '" data-i="' + i + '">' + (i + 1) + '</button>';
    }).join('');
    el['sh-hint'].textContent = '已答 ' + S.states.filter(function (s) {
      return s.v && (Array.isArray(s.v) ? s.v.length : s.v);
    }).length + '/' + S.qs.length;
    Array.prototype.forEach.call(el['sh-grid'].children, function (b) {
      b.onclick = function () { autoSubmit(); S.i = +b.getAttribute('data-i'); S.expOpen = false; el['card-mask'].hidden = true; render(); };
    });
    el['card-mask'].hidden = false;
  }

  /* ---------------- 练习续作（会话快照） ---------------- */
  var SESS_KEY = 'examapp-session';
  function saveSession() {
    if (!S || S.mode !== 'practice') return;
    try {
      localStorage.setItem(SESS_KEY, JSON.stringify({
        bankId: S.bankId, title: S.title, i: S.i, total: S.qs.length,
        qids: S.qs.map(function (q) { return q.id; }),
        states: S.states.map(function (st) { return { v: st.v, done: st.done, ok: st.ok, partial: st.partial }; }),
        answered: S.states.filter(function (st) { return st.done || (st.v && (Array.isArray(st.v) ? st.v.length : st.v)); }).length,
        scope: (App.sel && App.sel.pracScope) || 'all',
        types: ((App.sel && App.sel.pracTypes) || []).slice(),
        order: (App.sel && App.sel.pracOrder) || 'seq',
        limit: (App.sel && App.sel.pracLimit) || '0',
        savedAt: Date.now()
      }));
    } catch (e) { }
  }
  function readSession() {
    try { return JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); } catch (e) { return null; }
  }
  function clearSession() {
    try { localStorage.removeItem(SESS_KEY); } catch (e) { }
  }
  function resumeSession() {
    var snap = readSession();
    if (!snap || !snap.qids || !snap.qids.length) { App.toast('没有未完成的练习'); return; }
    DB.getQuestions(snap.bankId).then(function (all) {
      var byId = {};
      all.forEach(function (q) { byId[q.id] = q; });
      var qs = [];
      (snap.qids || []).forEach(function (id) { if (byId[id]) qs.push(byId[id]); });
      if (!qs.length) {
        clearSession();
        App.toast('原题库已不存在，续作记录已清除');
        return;
      }
      if (App.sel) {
        App.sel.pracBank = snap.bankId;
        App.sel.pracScope = snap.scope || 'all';
        App.sel.pracTypes = (snap.types || []).slice();
        App.sel.pracOrder = snap.order || 'seq';
        App.sel.pracLimit = String(snap.limit || '0');
      }
      cache();
      S = {
        mode: 'practice', bankId: snap.bankId, title: snap.title || '',
        qs: qs, duration: 0,
        i: Math.min(snap.i || 0, qs.length - 1),
        answers: {}, startAt: Date.now(), endAt: 0, expOpen: false
      };
      S.states = qs.map(function (q, i) {
        var sa = (snap.states || [])[i] || {};
        return { v: sa.v !== undefined ? sa.v : null, done: !!sa.done, ok: !!sa.ok, partial: !!sa.partial };
      });
      el['card-mask'].hidden = true;
      clearInterval(timer);
      App.go('page-quiz');
      render();
      App.toast('已回到第 ' + (S.i + 1) + ' 题');
    });
  }

  /* ---------------- 结束 ---------------- */
  function stop() {
    clearInterval(timer);
    S = null;
  }

  /* 中途离开答题页（如直接点底部标签）：同样判分并保留进度 */
  function leave() {
    if (!S) return;
    if (S.mode === 'practice') { autoSubmit(); saveSession(); }
    stop();
  }

  function back() {
    autoSubmit();     // 退出练习前把当前题判为已作答
    if (S && S.mode === 'practice') saveSession();
    if (S && S.mode === 'exam' && !window.__examFinished) {
      if (!confirm('考试尚未交卷，退出后本次作答将不记录。确定退出？')) return;
    }
    var from = S ? S.mode : 'practice';
    stop();
    window.__examFinished = false;
    App.go(from === 'exam' ? 'page-exam' : (App.lastPage || 'page-banks'));
    App.refreshAll();
  }

  function finishPractice() {
    autoSubmit();     // 最后一题同样判为已作答
    clearSession();
    var done = S.states.filter(function (s) { return s.done; });
    var ok = S.states.filter(function (s) { return s.ok; });
    var total = S.qs.length;
    var rate = done.length ? Math.round(ok.length / done.length * 100) : 0;
    stop();
    App.go(App.lastPage || 'page-banks');
    App.refreshAll();
    if (S === null) {
      App.toast('本轮共 ' + total + ' 题，已答 ' + done.length + ' 题，正确率 ' + rate + '%');
    }
  }

  function finishExam(auto) {
    var q = S.qs, sts = S.states;
    var score = 0, full = q.length, correct = 0, partial = 0;
    var answered = 0;
    q.forEach(function (qq, i) {
      var st = sts[i];
      if (st.v && (Array.isArray(st.v) ? st.v.length : st.v)) {
        answered++;
        // 始终依据所选项重新判分，避免因中途标记 done 而漏判
        var r = Parser.check(qq, st.v);
        st.ok = r.ok; st.partial = r.partial; st.done = true;
      } else if (!st.done) {
        st.done = true;
      }
      if (st.ok) { score += 1; correct++; }
      else if (st.partial) { score += 0.5; partial++; }
    });
    App.bumpDay(answered);

    // 写入答题记录
    var chain = Promise.resolve();
    q.forEach(function (qq, i) {
      var st = sts[i];
      if (!st.v || (Array.isArray(st.v) && !st.v.length)) return;
      chain = chain.then(function () {
        var old = App.rec(S.bankId, qq.id);
        return DB.setRecord(S.bankId, qq.id, {
          seen: (old.seen || 0) + 1,
          right: (old.right || 0) + (st.ok ? 1 : 0),
          wrong: (old.wrong || 0) + (st.ok ? 0 : 1)
        });
      });
    });

    var exam = {
      id: DB.uid(),
      bankId: S.bankId,
      bankName: S.title,
      startedAt: S.startAt,
      endedAt: Date.now(),
      duration: S.duration,
      total: full,
      score: Math.round(score * 10) / 10,
      correct: correct,
      partial: partial,
      used: Math.round((Date.now() - S.startAt) / 1000),
      auto: !!auto,
      detail: q.map(function (qq, i) {
        return {
          qid: qq.id,
          stem: qq.stem,
          type: qq.type,
          answer: qq.answer,
          explanation: qq.explanation,
          options: qq.options,
          user: sts[i].v,
          ok: sts[i].ok,
          partial: sts[i].partial
        };
      })
    };
    chain.then(function () { return DB.saveExam(exam); })
      .then(function () { return DB.getRecords(S.bankId); })
      .then(function (m) {
        App.setRecords(S.bankId, m);
        clearInterval(timer);
        window.__examFinished = true;
        S = null;
        App.showResult(exam);
        App.refreshAll();
      });
  }

  /* ---------------- 事件绑定 ---------------- */
  function bind() {
    cache();
    el['qz-back'].onclick = back;
    el['qz-card'].onclick = openCard;
    el['sh-close'].onclick = function () { el['card-mask'].hidden = true; };
    el['card-mask'].onclick = function (e) { if (e.target === el['card-mask']) el['card-mask'].hidden = true; };
    el['qz-prev'].onclick = function () {
      if (S && S.i > 0) { autoSubmit(); S.i--; S.expOpen = false; render(); }
    };
    el['qz-next'].onclick = function () {
      if (!S) return;
      autoSubmit();
      if (S.i < S.qs.length - 1) { S.i++; S.expOpen = false; render(); }
      else {
        if (S.mode === 'exam') { if (confirm('确认交卷？')) finishExam(false); }
        else finishPractice();
      }
    };
    el['qz-main'].onclick = function () {
      if (!S) return;
      if (S.mode === 'practice') submitCurrent();
      else if (S.mode === 'recite') {
        var q = S.qs[S.i];
        App.toggleMastered(S.bankId, q.id).then(render);
      } else {
        if (confirm('确认交卷？')) finishExam(false);
      }
    };
    el['qz-fav'].onclick = function () {
      var q = S.qs[S.i];
      App.toggleFav(S.bankId, q.id).then(render);
    };
    el['qz-fill'].oninput = function (e) {
      if (!S) return;
      if (S.mode === 'practice') resetAnswered();   // 改动填空内容即撤销上一轮判分
      var st = S.states[S.i];
      if (!st.done) st.v = e.target.value;
    };
    el['qz-ans-toggle'].onclick = function () {
      if (!S || S.mode === 'exam') return;
      S.expOpen = !S.expOpen;
      render();
    };
    bindSwipe();
  }

  /* ---------------- 滑动翻题 ----------------
     上滑 / 左滑 → 下一题；下滑 / 右滑 → 上一题
     与页面滚动共存：内容还能朝手势方向滚动时让给原生滚动，
     滚到边缘才触发翻题；斜向滑动有轴向锁定，不误触 */
  function bindSwipe() {
    var area = el['qz-body'];
    if (!area || !area.addEventListener) return;   // 防御：元素缺失时不阻断初始化
    var sx = 0, sy = 0, axis = null, mode = null, scrollY = false;

    function reset() { axis = null; mode = null; }

    area.addEventListener('touchstart', function (e) {
      if (!S || !e.touches || e.touches.length !== 1) return;
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
      reset();
      scrollY = area.scrollHeight > area.clientHeight + 4;
    }, { passive: true });

    area.addEventListener('touchmove', function (e) {
      if (!S || mode || !e.touches || !e.touches.length) return;
      var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      var ax = Math.abs(dx), ay = Math.abs(dy);
      if (ax < 14 && ay < 14) return;                    // 抖动阈值
      if (!axis) {                                       // 轴向锁定
        if (ax > ay * 1.3) axis = 'h';
        else if (ay > ax * 1.3) axis = 'v';
        else return;
      }
      if (axis === 'v' && scrollY) {                     // 还能滚动 → 让给原生滚动
        var atTop = area.scrollTop <= 0;
        var atBottom = area.scrollTop >= area.scrollHeight - area.clientHeight - 1;
        if ((dy > 0 && !atTop) || (dy < 0 && !atBottom)) { mode = 'scroll'; return; }
      }
      if (axis === 'h' && e.preventDefault) e.preventDefault();  // 横向不吃原生滚动
      mode = 'swipe';
    }, { passive: false });

    area.addEventListener('touchend', function (e) {
      if (!S || mode !== 'swipe' || !axis || !e.changedTouches || !e.changedTouches.length) return;
      var t = e.changedTouches[0];
      var dx = t.clientX - sx, dy = t.clientY - sy;
      var TH = 64;                                       // 位移阈值
      if (axis === 'h' && App.getPref && App.getPref('swipeH')) {
        if (dx <= -TH) nav(1); else if (dx >= TH) nav(-1);
      } else if (axis === 'v' && App.getPref && App.getPref('swipeV')) {
        if (dy <= -TH) nav(1); else if (dy >= TH) nav(-1);
      }
      reset();
    });
  }

  /* dir: 1=下一题  -1=上一题 */
  function nav(dir) {
    if (!S) return;
    if (dir > 0) {
      autoSubmit();
      if (S.i < S.qs.length - 1) { S.i++; S.expOpen = false; render(); }   // 每题进入默认折叠
      else if (S.mode !== 'exam') finishPractice();
    } else if (S.i > 0) { autoSubmit(); S.i--; S.expOpen = false; render(); }
  }

  window.Quiz = { start: start, stop: stop, leave: leave, bind: bind, readSession: readSession, resumeSession: resumeSession, clearSession: clearSession };
})();
