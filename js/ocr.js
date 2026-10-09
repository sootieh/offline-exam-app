/* 拍照搜题：本地 OCR（Tesseract.js，全部资源在本地，离线可用）+ 题干模糊匹配
   依赖文件放在 vendor/ocr/，首次使用时按需下载并存入 Cache Storage。 */
(function (global) {
  'use strict';

  var CACHE = 'examapp-ocr-v1';
  var BASE = 'vendor/ocr/';
  var READY_KEY = 'examapp-ocr-ready';

  var FILES = [
    { f: 'tesseract.min.js', t: 'text/javascript', b: 62961 },
    { f: 'worker.min.js', t: 'text/javascript', b: 111162 },
    { f: 'tesseract-core-simd-lstm.wasm.js', t: 'text/javascript', b: 3954569 },
    { f: 'tesseract-core-simd-lstm.wasm', t: 'application/wasm', b: 2871377 },
    { f: 'chi_sim.traineddata.gz', t: 'application/octet-stream', b: 1718768 }
  ];
  var TOTAL = FILES.reduce(function (s, x) { return s + x.b; }, 0);

  function abs(p) {
    try { return new URL(p, document.baseURI || location.href).href; }
    catch (e) { return p; }
  }
  function ready() {
    try { return localStorage.getItem(READY_KEY) === '1'; } catch (e) { return false; }
  }
  function setReady(v) {
    try { if (v) localStorage.setItem(READY_KEY, '1'); else localStorage.removeItem(READY_KEY); } catch (e) { }
  }

  /* ---------------- 模型下载 / 删除 ---------------- */

  function fetchBytes(url, onBytes) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      var total = +res.headers.get('content-length') || 0;
      if (!res.body || !res.body.getReader) {
        return res.arrayBuffer().then(function (b) {
          if (onBytes) onBytes(b.byteLength, total);
          return new Uint8Array(b);
        });
      }
      var rd = res.body.getReader(), parts = [], got = 0;
      function pump() {
        return rd.read().then(function (r) {
          if (r.done) {
            var all = new Uint8Array(got), off = 0;
            for (var k = 0; k < parts.length; k++) { all.set(parts[k], off); off += parts[k].length; }
            return all;
          }
          parts.push(r.value); got += r.value.length;
          if (onBytes) onBytes(got, total);
          return pump();
        });
      }
      return pump();
    });
  }

  /* 逐个下载并存进 Cache Storage，之后完全离线。
     onProgress(ratio 0~1) —— ratio 按「已完成文件字节 + 当前文件已读字节」估算 */
  function download(onProgress) {
    var cache, i = 0, done = 0;
    function report(extra) { if (onProgress) onProgress(Math.max(0, Math.min(1, (done + (extra || 0)) / TOTAL))); }
    function step() {
      if (i >= FILES.length) { setReady(true); report(0); return true; }
      var it = FILES[i], url = abs(BASE + it.f);
      report(0);
      return fetchBytes(url, function (got) { report(got); }).then(function (buf) {
        var body = buf;
        return cache.put(url, new Response(body, { headers: { 'Content-Type': it.t } }));
      }).then(function () {
        done += it.b; i++;
        return step();
      });
    }
    return caches.open(CACHE).then(function (c) { cache = c; return step(); });
  }

  function remove() {
    return caches.delete(CACHE).then(function () {
      setReady(false);
      return dispose();
    });
  }

  /* ---------------- 引擎 ---------------- */

  var workerPromise = null, disposeT = null;

  function loadScript() {
    if (global.Tesseract) return Promise.resolve(global.Tesseract);
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = abs(BASE + 'tesseract.min.js');
      s.onload = function () { global.Tesseract ? res(global.Tesseract) : rej(new Error('识别引擎加载失败')); };
      s.onerror = function () { rej(new Error('识别引擎加载失败')); };
      document.head.appendChild(s);
    });
  }

  function dispose() {
    if (disposeT) { clearTimeout(disposeT); disposeT = null; }
    if (!workerPromise) return Promise.resolve();
    var p = workerPromise;
    workerPromise = null;
    return p.then(function (w) { try { w.terminate(); } catch (e) { } }).catch(function () { });
  }

  /* 空闲 90 秒后主动释放引擎，避免长期占着上百 MB 内存（下次识别约多花 2~4 秒重新装载） */
  function scheduleDispose() {
    if (disposeT) clearTimeout(disposeT);
    disposeT = setTimeout(function () { disposeT = null; dispose(); }, 90000);
  }

  function getWorker(logger) {
    if (workerPromise) {
      if (disposeT) { clearTimeout(disposeT); disposeT = null; }
      return workerPromise;
    }
    workerPromise = loadScript().then(function (T) {
      return T.createWorker('chi_sim', 1, {
        workerPath: abs(BASE + 'worker.min.js'),
        corePath: abs(BASE + 'tesseract-core-simd-lstm.wasm.js'),
        langPath: abs(BASE),
        gzip: true,
        logger: function (m) { if (logger) logger(m); }
      });
    }).catch(function (e) { workerPromise = null; throw e; });
    return workerPromise;
  }

  function recognize(source, logger) {
    return getWorker(logger).then(function (w) {
      return w.recognize(source).then(function (r) {
        scheduleDispose();
        return (r && r.data && r.data.text) || '';
      });
    }, function (e) {
      dispose();
      throw e;
    });
  }

  /* ---------------- 图片预处理 ----------------
     等比缩到最大边 1600 + 灰度 + 轻微提对比，明显加快识别并提升准确率 */
  function prepare(file, maxSide) {
    maxSide = maxSide || 1600;
    return new Promise(function (res, rej) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        try { URL.revokeObjectURL(url); } catch (e) { }
        var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
        if (!w || !h) { rej(new Error('照片尺寸异常')); return; }
        var scale = Math.min(1, maxSide / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
        var cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        var ctx = cv.getContext('2d');
        if (!ctx) { res(cv); return; }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, cw, ch);
        try {
          var d = ctx.getImageData(0, 0, cw, ch), p = d.data;
          for (var i = 0; i < p.length; i += 4) {
            var g = p[i] * 0.299 + p[i + 1] * 0.587 + p[i + 2] * 0.114;
            g = (g - 128) * 1.22 + 128;
            if (g < 0) g = 0; else if (g > 255) g = 255;
            p[i] = p[i + 1] = p[i + 2] = g;
          }
          ctx.putImageData(d, 0, 0);
        } catch (e) { }
        res(cv);
      };
      img.onerror = function () {
        try { URL.revokeObjectURL(url); } catch (e) { }
        rej(new Error('照片读取失败'));
      };
      img.src = url;
    });
  }

  /* ---------------- 文本与模糊匹配 ---------------- */

  /* 归一化：只保留中文 / 字母 / 数字，去掉空白与标点，便于容错比对 */
  function norm(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[^0-9a-z一-龥]/g, '');
  }
  function tidy(t) {
    return String(t || '').replace(/\s+/g, ' ').trim();
  }

  function bigrams(s) {
    var out = [];
    for (var i = 0; i < s.length - 1; i++) out.push(s.substr(i, 2));
    return out;
  }

  function lcsRatio(a, b) {
    var n = a.length, m = b.length;
    if (!n || !m) return 0;
    var prev = new Array(m + 1), cur = new Array(m + 1), i, j;
    for (i = 0; i <= m; i++) { prev[i] = 0; cur[i] = 0; }
    for (i = 1; i <= n; i++) {
      cur[0] = 0;
      var ca = a.charAt(i - 1);
      for (j = 1; j <= m; j++) {
        cur[j] = (ca === b.charAt(j - 1)) ? prev[j - 1] + 1 : (prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]);
      }
      var t = prev; prev = cur; cur = t;
    }
    return prev[m] / n;
  }

  /* 相似度 0~1：字符覆盖 + 二元组覆盖 + 最长公共子序列比例。
     能容忍 OCR 的个别错字、多字、少字。 */
  function score(needle, hay) {
    var a = norm(needle), b = norm(hay);
    if (!a || !b) return 0;
    if (b.indexOf(a) >= 0) return 1;
    if (a.length < 4) return 0;              // 太短的关键词不做模糊，避免误命中
    var pool = b.split(''), hit = 0, i;
    for (i = 0; i < a.length; i++) {
      var p = pool.indexOf(a.charAt(i));
      if (p >= 0) { pool.splice(p, 1); hit++; }
    }
    var cc = hit / a.length;
    var A = bigrams(a), B = {}, j;
    for (j = 0; j < b.length - 1; j++) B[b.substr(j, 2)] = 1;
    var bh = 0;
    for (i = 0; i < A.length; i++) if (B[A[i]]) bh++;
    var bc = A.length ? bh / A.length : 0;
    var base = 0.45 * cc + 0.25 * bc;
    if (base < 0.30) return base;            // 明显不相关，省掉 LCS 计算
    var s = base + 0.30 * lcsRatio(a, b);
    var ratio = b.length / a.length;
    if (ratio > 5) s *= 1 - Math.min(0.15, (ratio - 5) * 0.012);  // 题干远长于识别片段时轻微降权
    return s;
  }

  var TH = 0.5;
  /* 在题目列表里模糊搜索，返回 [{q, s}]，按相似度降序 */
  function match(list, needle, limit) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var q = list[i] || {};
      var s = score(needle, q.stem);
      if (s < 1 && q.options && q.options.length) {
        var ot = '';
        for (var k = 0; k < q.options.length; k++) ot += (q.options[k].text || '');
        var s2 = score(needle, (q.stem || '') + ot) * 0.9;
        if (s2 > s) s = s2;
      }
      if (s >= TH) out.push({ q: q, s: s });
    }
    out.sort(function (x, y) { return y.s - x.s; });
    return limit ? out.slice(0, limit) : out;
  }

  global.OCR = {
    ready: ready,
    download: download,
    remove: remove,
    dispose: dispose,
    prepare: prepare,
    recognize: recognize,
    norm: norm,
    tidy: tidy,
    score: score,
    match: match,
    bytes: TOTAL
  };
})(window);
