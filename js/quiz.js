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
      'qz-fillwrap', 'qz-fill', 'qz-answer', 'qz-exp', 'qz-prev', 'qz-fav', 'qz-main', 'qz-next',
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
        if (sel.indexOf(o.key) >= 0) cls += ' sel';
        if (st.done && S.mode !== 'exam') {
          if (q.answer.indexOf(o.key) >= 0) cls += ' right';
          else if (sel.indexOf(o.key) >= 0) cls += ' wrong';
        }
        if (st.done && S.mode !== 'exam') cls += ' locked';
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
      el['qz-fill'].disabled = st.done && S.mode !== 'recite';
    }

    // 答案 / 解析
    var showAns = (S.mode === 'recite') || (st.done && S.mode === 'practice');
    el['qz-answer'].hidden = !showAns;
    el['qz-exp'].hidden = !(showAns && q.explanation);
    if (showAns) {
      var ansTxt = q.type === 'fill'
        ? q.answer.join(' / ')
        : q.answer.map(function (k) {
          var o = q.options.filter(function (x) { return x.key === k; })[0];
          return k + (o ? '. ' + o.text : '');
        }).join('   ');
      var head = S.mode === 'recite' ? '正确答案：'
        : (st.ok ? '回答正确' : (st.partial ? '漏选（多选需全对）' : '回答错误'));
      el['qz-answer'].className = 'qz-answer' + (st.ok || S.mode === 'recite' ? '' : ' bad');
      el['qz-answer'].innerHTML = '<b>' + esc(head) + '</b>' +
        '<div style="margin-top:4px">' + esc(ansTxt) + '</div>' +
        (q.type !== 'fill' && st.v ? '<div style="margin-top:4px;opacity:.75">你的作答：' +
          esc((Array.isArray(st.v) ? st.v.join('') : st.v) || '未作答') + '</div>' : '');
      if (q.explanation) {
        el['qz-exp'].innerHTML = '<span class="lb">解析</span>' + esc(q.explanation);
      }
    }

    // 底部按钮
    el['qz-prev'].disabled = S.i === 0;
    el['qz-prev'].textContent = '上一题';
    if (S.mode === 'practice') {
      el['qz-main'].textContent = st.done ? '已作答' : '确认作答';
      el['qz-main'].disabled = st.done;
      el['qz-main'].style.opacity = st.done ? .45 : 1;
    } else if (S.mode === 'recite') {
      var mst = App.isMastered(S.bankId, q.id);
      el['qz-main'].textContent = mst ? '✓ 已掌握（点击取消）' : '✓ 记住了';
      el['qz-main'].disabled = false;
      el['qz-main'].style.opacity = 1;
    } else {
      el['qz-main'].textContent = '交卷';
      el['qz-main'].disabled = false;
      el['qz-main'].style.opacity = 1;
    }
    var last = S.i === S.qs.length - 1;
    el['qz-next'].textContent = last ? '完成' : '下一题';

    var fav = App.isFav(S.bankId, q.id);
    el['qz-fav'].textContent = fav ? '★ 已收藏' : '☆ 收藏';
    el['qz-fav'].className = 'qz-act fav' + (fav ? ' on' : '');
  }

  /* ---------------- 作答 ---------------- */
  function pick(k) {
    var q = S.qs[S.i], st = S.states[S.i];
    if (st.done && S.mode !== 'recite') return;
    if (S.mode === 'recite') return;

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
        st.done = true;
        saveRecord(q, st, false);
        render();
        setTimeout(function () { if (S.i < S.qs.length - 1) { S.i++; render(); } }, 220);
      } else {
        render();
        // 单选/判断：选定后不判分，停顿片刻直接跳下一题（可在 设置 → 答题与翻题 关闭）
        // 仅记录所选项，不显示对错、不写入正确/错误记录；需要判分时关掉开关或点「确认作答」
        if ((q.type === 'single' || q.type === 'judge') && App.getPref && App.getPref('autoNext')) {
          var session = S, idx = S.i, last = S.i === S.qs.length - 1;
          setTimeout(function () {
            // 期间若已翻页/退出会话则不跳转，避免误跳
            if (!S || S !== session || S.i !== idx) return;
            if (!last) { S.i++; render(); }
          }, 420);
        }
      }
    }
  }

  function saveRecord(q, st, graded) {
    var patch = {};
    if (S.mode === 'recite') return Promise.resolve();
    patch.seen = (App.rec(S.bankId, q.id).seen || 0) + 1;
    if (graded) {
      if (st.ok) patch.right = (App.rec(S.bankId, q.id).right || 0) + 1;
      else patch.wrong = (App.rec(S.bankId, q.id).wrong || 0) + 1;
    }
    return DB.setRecord(S.bankId, q.id, patch).then(function () {
      return DB.getRecords(S.bankId).then(function (m) { App.setRecords(S.bankId, m); });
    });
  }

  function submitCurrent() {
    var q = S.qs[S.i], st = S.states[S.i];
    if (st.done) return;
    if (q.type === 'fill') {
      var v = document.getElementById('qz-fill').value.trim();
      if (!v) { App.toast('请先填写答案'); return; }
      st.v = v;
    }
    if (!st.v || (Array.isArray(st.v) && !st.v.length)) { App.toast('请先选择答案'); return; }
    var r = Parser.check(q, q.type === 'fill' ? st.v : st.v);
    st.ok = r.ok; st.partial = r.partial; st.done = true;
    saveRecord(q, st, true);
    render();
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
      b.onclick = function () { S.i = +b.getAttribute('data-i'); el['card-mask'].hidden = true; render(); };
    });
    el['card-mask'].hidden = false;
  }

  /* ---------------- 结束 ---------------- */
  function stop() {
    clearInterval(timer);
    S = null;
  }

  function back() {
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
      if (!st.done && st.v && (Array.isArray(st.v) ? st.v.length : st.v)) {
        answered++;
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
    el['qz-prev'].onclick = function () { if (S.i > 0) { S.i--; render(); } };
    el['qz-next'].onclick = function () {
      if (S.i < S.qs.length - 1) { S.i++; render(); }
      else {
        if (S.mode === 'exam') { if (confirm('确认交卷？')) finishExam(false); }
        else finishPractice();
      }
    };
    el['qz-main'].onclick = function () {
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
      var st = S.states[S.i];
      if (!st.done) st.v = e.target.value;
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
      if (S.i < S.qs.length - 1) { S.i++; render(); }
      else if (S.mode !== 'exam') finishPractice();
    } else if (S.i > 0) { S.i--; render(); }
  }

  window.Quiz = { start: start, stop: stop, bind: bind };
})();
