/* 题库解析引擎：Excel / CSV / TXT / JSON 全格式 + 题型智能识别 */
(function () {
  'use strict';

  var TYPE_NAME = { single: '单选题', multiple: '多选题', judge: '判断题', fill: '填空题' };

  /* ---------------- 通用工具 ---------------- */
  function norm(s) { return String(s == null ? '' : s).replace(/\u00a0/g, ' ').trim(); }
  function cleanStem(s) {
    return norm(s).replace(/^[（(【]?\s*\d+\s*[)）】.、．:：]\s*/, '');
  }

  /* CSV / TSV 行切分，支持引号包裹 */
  function splitLine(line, d) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; }
        else q = !q;
      } else if (c === d && !q) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out.map(function (x) { return x.trim(); });
  }
  function detectDelim(text) {
    var head = text.split(/\r?\n/).slice(0, 5).join('\n');
    var cands = [',', '\t', ';', '|'], best = ',', bestN = 0;
    cands.forEach(function (d) {
      var n = (head.match(new RegExp('\\' + d === '\\|' ? '\\|' : '[' + d + ']', 'g')) || []).length;
      if (d === '\t') n = (head.match(/\t/g) || []).length;
      if (n > bestN) { bestN = n; best = d; }
    });
    return bestN === 0 ? null : best;
  }

  /* ---------------- 表头列名映射 ---------------- */
  var MAP_STEM = ['题目', '题干', '问题', '标题', '题名', '题目内容', '题干内容', 'question', 'stem', 'title', 'q', 'content'];
  var MAP_ANS = ['答案', '正确答案', '标准答案', '参考答案', '正确选项', '答案选项', 'answer', 'ans', 'result', 'key', 'correct'];
  var MAP_EXP = ['解析', '解释', '详解', '答案解析', '试题解析', '备注', 'explain', 'explanation', 'analysis', 'note', 'remark'];
  var MAP_TYPE = ['题型', '类型', '题目类型', 'type', 'qtype', 'kind', 'category_type'];
  var MAP_CH = ['章节', '分类', '知识点', '目录', '所属章节', 'chapter', 'category', 'tag', '标签', '来源'];
  var MAP_OPTS = ['选项', '选项内容', 'options', 'choices', 'option', 'choice'];

  function canon(h) {
    var k = norm(h).toLowerCase().replace(/[\s_\-（）()【】\[\]:：.、]/g, '');
    if (!k) return null;
    if (MAP_STEM.indexOf(k) >= 0 || /^(题目|题干)/.test(k)) return 'stem';
    if (MAP_ANS.indexOf(k) >= 0 || /答案/.test(k)) return 'answer';
    if (MAP_EXP.indexOf(k) >= 0 || /解析|解释/.test(k)) return 'explanation';
    if (MAP_TYPE.indexOf(k) >= 0) return 'type';
    if (MAP_CH.indexOf(k) >= 0) return 'chapter';
    if (MAP_OPTS.indexOf(k) >= 0) return 'optionsAll';
    var m = k.match(/^(?:选项|option|opt|choice|选)?([a-f])(?:选项|option|opt|choice|项|选)?$/);
    if (m) return 'opt_' + m[1].toUpperCase();
    return null;
  }

  /* ---------------- 答案解析 ---------------- */
  var JUDGE_TRUE = ['对', '正确', '√', '✓', '是', 't', 'true', 'yes', 'y', 'a'];
  var JUDGE_FALSE = ['错', '错误', '×', '✗', '否', 'f', 'false', 'no', 'n', 'x', 'b'];
  /* 严格版：只认真正的判断词，用于「判断选项文本」——避免把 A.x / B.y 这类选项误判成判断题 */
  var JUDGE_TRUE_S = ['对', '正确', '√', '✓', '是', 'true', 't'];
  var JUDGE_FALSE_S = ['错', '错误', '×', '✗', '否', 'false', 'f', '不对', '不正确'];

  function parseAnswerLetters(raw) {
    var s = norm(raw).toUpperCase();
    if (!s) return [];
    // 先尝试抽取 A-F 字母
    var letters = s.match(/[A-F]/g) || [];
    if (letters.length) return letters.filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
    return [];
  }
  function isJudgeWord(s) {
    var t = norm(s).toLowerCase();
    if (JUDGE_TRUE.indexOf(t) >= 0) return 'A';
    if (JUDGE_FALSE.indexOf(t) >= 0) return 'B';
    return null;
  }
  /* 选项文本是否为“正确/错误”这类判断词（严格） */
  function isJudgeOption(s) {
    var t = norm(s).replace(/[。.、,，;；:：!！?？\s]+$/g, '').toLowerCase();
    if (JUDGE_TRUE_S.indexOf(t) >= 0) return 'A';
    if (JUDGE_FALSE_S.indexOf(t) >= 0) return 'B';
    return null;
  }

  /* 题型推断 */
  function guessType(q) {
    if (q.type && TYPE_NAME[q.type]) return q.type;
    var optCount = (q.options || []).length;
    var raw = norm(q.raw || '');
    if (optCount === 0) {
      if (isJudgeWord(raw)) return 'judge';
      return 'fill';
    }
    if (optCount <= 2) {
      // 两个选项且都是判断词（正确/错误、对/错等）→ 判断题
      var allJudge = q.options.every(function (o) { return !!isJudgeOption(o.text); });
      if (allJudge) return 'judge';
    }
    if (q.answer && q.answer.length >= 2) return 'multiple';
    return 'single';
  }

  /* 答案文本是否“纯粹由选项字母构成”（避免把 TCP/IP、1982 之类误判成选项） */
  function looksLikeLetters(s) {
    return /[A-Fa-f]/.test(s) && /^[A-Fa-f\s,，、;；|｜/]*$/.test(s) && s.replace(/[^A-Fa-f]/g, '').length <= 6;
  }

  /* 标准化单题 */
  function normalize(q, i, warnings) {
    var out = {
      idx: i,
      type: 'single',
      stem: cleanStem(q.stem),
      options: [],
      answer: [],
      explanation: norm(q.explanation),
      chapter: norm(q.chapter) || ''
    };

    // 选项：支持 [{key,text}] / ["A.xxx"] / "A.xxx\nB.yyy" / {A:'..',B:'..'}
    var opts = q.options || [];
    if (opts && !Array.isArray(opts) && typeof opts === 'object') {
      opts = Object.keys(opts).sort().map(function (k) { return { key: k, text: opts[k] }; });
    }
    var keys = 'ABCDEF';
    (opts || []).forEach(function (o, n) {
      if (o == null) return;
      var t = typeof o === 'string' ? o : (o.text != null ? String(o.text) : '');
      t = norm(t);
      if (!t) return;
      var m = t.match(/^\s*[（(【]?\s*([A-Fa-f])\s*[)）】.、．:：]?\s*([\s\S]*)$/);
      if (m) out.options.push({ key: m[1].toUpperCase(), text: norm(m[2]) });
      else out.options.push({ key: keys[n] || String.fromCharCode(65 + n), text: t });
    });

    // 答案
    var rawAns = q.answer;
    if (!Array.isArray(rawAns)) rawAns = [rawAns];
    var flat = rawAns.map(function (x) { return norm(x); }).filter(Boolean).join('|');

    out.type = guessType({ type: q.type || q.rawType, options: out.options, answer: parseAnswerLetters(flat), raw: flat });

    if (out.type === 'fill') {
      out.answer = flat.split(/\s*[|｜]\s*/).filter(Boolean);
      if (!out.answer.length) out.answer = flat ? [flat] : [];
    } else if (out.type === 'judge') {
      var letters = parseAnswerLetters(flat);
      if (letters.length) {
        out.answer = letters.slice(0, 1);
      } else {
        var j = isJudgeWord(flat);
        out.answer = [j || 'A'];
      }
      // 判断题补默认选项
      if (out.options.length < 2) {
        out.options = [{ key: 'A', text: '正确' }, { key: 'B', text: '错误' }];
      }
    } else {
      var ls = looksLikeLetters(flat) ? parseAnswerLetters(flat) : [];
      if (!ls.length) {
        // 答案写成了选项文本（或就是普通文本），先尝试按选项文本匹配
        flat.split(/\s*[|｜,，、]\s*/).forEach(function (part) {
          var hit = out.options.filter(function (o) { return norm(o.text) === norm(part); })[0];
          if (hit) ls.push(hit.key);
        });
      }
      if (!ls.length && flat) {
        // 确实不是选项（如填空答案为 TCP/IP、1982），降级为填空题
        out.type = 'fill';
        out.answer = flat.split(/\s*[|｜]\s*/).filter(Boolean);
        return out;
      }
      out.answer = ls.filter(function (v, k, a) { return a.indexOf(v) === k; }).sort();
      if (out.answer.length > 1 && out.type === 'single') out.type = 'multiple';
    }

    if (!out.stem) return null;
    // 既无选项又无答案：多半是「第一章 xxx」这类章节标题，丢弃
    if (!out.options.length && !out.answer.length) return null;
    if (out.type !== 'fill' && !out.answer.length && warnings) {
      warnings.push('第 ' + (i + 1) + ' 题未识别到答案：' + out.stem.slice(0, 20));
    }
    return out;
  }

  /* ---------------- Excel / CSV 表格 ---------------- */
  function tableToQuestions(rows, warnings) {
    if (!rows.length) return [];
    var headers = rows[0].map(function (h) { return norm(h); });
    var cols = headers.map(canon);
    // 表头识别率过低时，认为无表头，按位置猜测
    var hit = cols.filter(Boolean).length;
    var noHeader = hit <= 1;
    var res = [];

    rows.forEach(function (row, ri) {
      if (noHeader) {
        var cells = row.filter(function (c) { return norm(c) !== ''; });
        if (cells.length < 2) return;
        res.push(normalize({
          stem: cells[0],
          options: cells.slice(1, 1 + Math.max(0, cells.length - 2)),
          answer: cells[cells.length - 1]
        }, res.length, warnings));
        return;
      }
      if (ri === 0) return;
      var obj = { options: [], rawType: '' };
      var optMap = {};
      cols.forEach(function (c, ci) {
        if (!c) return;
        var v = row[ci];
        if (c === 'stem') obj.stem = v;
        else if (c === 'answer') obj.answer = v;
        else if (c === 'explanation') obj.explanation = v;
        else if (c === 'type') obj.rawType = v;
        else if (c === 'chapter') obj.chapter = v;
        else if (c === 'optionsAll') {
          String(v || '').split(/[\n\r]+|[|｜]|[；;](?=[A-Fa-f])/).forEach(function (s) {
            if (norm(s)) obj.options.push(s);
          });
        } else if (c.indexOf('opt_') === 0) {
          optMap[c.slice(4)] = v;
        }
      });
      'ABCDEF'.split('').forEach(function (k) {
        if (optMap[k] != null && norm(optMap[k]) !== '') obj.options.push(k + '. ' + norm(optMap[k]));
      });
      if (obj.rawType) {
        var rt = norm(obj.rawType).toLowerCase();
        if (/多选/.test(rt) || /multiple|check/.test(rt)) obj.type = 'multiple';
        else if (/判断/.test(rt) || /judge|bool|tf/.test(rt)) obj.type = 'judge';
        else if (/填空|简答|问答|fill|blank|text/.test(rt)) obj.type = 'fill';
        else if (/单选|single|radio|choice/.test(rt)) obj.type = 'single';
      }
      if (!norm(obj.stem)) return;
      var q = normalize(obj, res.length, warnings);
      if (q) res.push(q);
    });
    return res;
  }

  /* ---------------- TXT 文本 ---------------- */
  var RE_QSTART = /^\s*(?:【\s*(\d+)\s*】|\(\s*(\d+)\s*\)|（\s*(\d+)\s*）|(\d+)\s*[.、．)）:：])\s*([\s\S]+)$/;
  var RE_OPT = /^\s*[（(【]?\s*([A-Fa-f])\s*[)）】.、．:：]\s*([\s\S]*)$/;
  var RE_ANS = /^\s*[【\[]?\s*(?:正确答案|参考答案|标准答案|答案|答案选项)\s*[】\]]?\s*[:：]?\s*([\s\S]*)$/;
  var RE_EXP = /^\s*[【\[]?\s*(?:试题解析|答案解析|解析|详解|解释)\s*[】\]]?\s*[:：]?\s*([\s\S]*)$/;

  function txtToQuestions(text, warnings) {
    var lines = String(text).replace(/\r\n?/g, '\n').split('\n');
    var blocks = [], cur = null, lastKind = null;

    function blank() {
      return { stem: '', options: [], answer: '', explanation: '', chapter: '', rawType: '', inExp: false, hasAnswer: false, lastOpt: -1 };
    }
    function flush() { if (cur && norm(cur.stem)) { blocks.push(cur); } cur = null; }
    function startNew(stem) { flush(); cur = blank(); cur.stem = stem; lastKind = 'stem'; }

    lines.forEach(function (line) {
      var raw = line.replace(/\s+$/, '');
      if (!norm(raw)) return;
      var m;

      // 题号开头：强制新题
      if ((m = raw.match(RE_QSTART))) { startNew(m[5]); return; }

      if (!cur) { startNew(raw); return; }

      // 答案
      if ((m = raw.match(RE_ANS))) {
        cur.answer += (cur.answer ? ' ' : '') + norm(m[1]);
        cur.inExp = false; cur.hasAnswer = true; lastKind = 'ans';
        return;
      }
      // 解析
      if ((m = raw.match(RE_EXP))) {
        cur.explanation += norm(m[1]);
        cur.inExp = true; lastKind = 'exp';
        return;
      }
      // 选项
      if ((m = raw.match(RE_OPT)) && /^[A-Fa-f]$/.test(m[1])) {
        var li = m[1].toUpperCase().charCodeAt(0) - 65;
        // 已答过又出现更小/相同的选项字母 → 说明是下一题
        if (cur.hasAnswer && li <= cur.lastOpt) {
          startNew(raw);
          cur.options.push(m[1].toUpperCase() + '. ' + norm(m[2]));
          cur.lastOpt = li; lastKind = 'opt';
          return;
        }
        cur.options.push(m[1].toUpperCase() + '. ' + norm(m[2]));
        cur.lastOpt = li; cur.inExp = false; lastKind = 'opt';
        return;
      }

      // 普通文本行
      if (!cur.hasAnswer && (cur.inExp || lastKind === 'exp' || lastKind === 'ans')) {
        // 解析内容换行续写
        cur.explanation += (cur.explanation ? '\n' : '') + norm(raw);
        cur.inExp = true; lastKind = 'exp';
        return;
      }
      if (cur.hasAnswer) {
        // 本题已经收过答案，后面的正文必定是下一题（Word 里常不带题号）
        startNew(raw);
        return;
      }
      // 题干换行续写
      cur.stem += '\n' + norm(raw);
      lastKind = 'stem';
    });
    flush();

    var res = [];
    blocks.forEach(function (b) {
      if (!norm(b.stem)) return;
      var q = normalize(b, res.length, warnings);
      if (q) res.push(q);
    });
    return res;
  }

  /* ---------------- JSON ---------------- */
  function jsonToQuestions(data, warnings) {
    var arr = null;
    if (Array.isArray(data)) arr = data;
    else if (data && Array.isArray(data.questions)) arr = data.questions;
    else if (data && Array.isArray(data.data)) arr = data.data;
    else if (data && Array.isArray(data.list)) arr = data.list;
    else if (data && Array.isArray(data.banks) && data.banks[0] && Array.isArray(data.banks[0].questions)) {
      arr = data.banks[0].questions;
    }
    if (!arr) { if (warnings) warnings.push('JSON 结构无法识别，应为数组或含 questions 字段的对象'); return []; }

    var res = [];
    arr.forEach(function (it) {
      if (!it) return;
      var obj = {
        stem: it.stem || it.question || it.title || it.q || it.content || it.题干 || it.题目 || '',
        options: it.options || it.choices || it.选项 || [],
        answer: it.answer != null ? it.answer : (it.answers || it.答案 || it.correct || ''),
        explanation: it.explanation || it.analysis || it.解析 || it.explain || '',
        chapter: it.chapter || it.category || it.章节 || '',
        rawType: it.type || it.qtype || it.题型 || ''
      };
      if (typeof obj.rawType === 'string') {
        var t = obj.rawType.toLowerCase();
        if (/^(single|radio|choice|1)$/.test(t)) obj.type = 'single';
        else if (/^(multiple|multi|check|checkbox|2)$/.test(t)) obj.type = 'multiple';
        else if (/^(judge|bool|boolean|tf|3)$/.test(t)) obj.type = 'judge';
        else if (/^(fill|blank|text|qa|4)$/.test(t)) obj.type = 'fill';
      }
      var q = normalize(obj, res.length, warnings);
      if (q) res.push(q);
    });
    return res;
  }

  /* ---------------- 判分 ---------------- */
  function normText(s) {
    return String(s == null ? '' : s)
      .replace(/\s/g, '')
      .replace(/[，。、；：？！,.;:?!"'"'`~．]/g, '')
      .toLowerCase();
  }
  function check(q, user) {
    // user: 数组（选择题）或字符串（填空）
    if (q.type === 'fill') {
      var u = normText(user);
      if (!u) return { ok: false, partial: false };
      for (var i = 0; i < q.answer.length; i++) {
        var a = normText(q.answer[i]);
        if (!a) continue;
        if (a === u || (u.length >= a.length && u.indexOf(a) === 0) || (a.indexOf(u) === 0 && a.length - u.length <= 1)) {
          return { ok: true, partial: false };
        }
      }
      return { ok: false, partial: false };
    }
    var ua = (Array.isArray(user) ? user : [user]).map(function (x) { return String(x || '').toUpperCase(); })
      .filter(Boolean).sort();
    var ra = (q.answer || []).slice().sort();
    if (!ua.length) return { ok: false, partial: false };
    var same = ua.length === ra.length && ua.every(function (v, i) { return v === ra[i]; });
    if (same) return { ok: true, partial: false };
    if (q.type === 'multiple') {
      var allIn = ua.every(function (v) { return ra.indexOf(v) >= 0; });
      if (allIn && ua.length < ra.length) return { ok: false, partial: true };
    }
    return { ok: false, partial: false };
  }

  /* ---------------- Word (.docx) ---------------- */
  function decodeEnt(s) {
    return String(s)
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, d) { return String.fromCharCode(parseInt(d, 16)); })
      .replace(/&amp;/g, '&');
  }
  /* 取一个 <w:p> 段落的纯文本，保留 <w:br/> 换行与 <w:tab/> 制表符 */
  function paraText(p) {
    var out = '', re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:br\s*\/?>|<w:tab\s*\/?>/g, m;
    while ((m = re.exec(p))) {
      if (m[0].indexOf('<w:t') === 0) out += decodeEnt(m[1] || '');
      else if (m[0].indexOf('<w:br') === 0) out += '\n';
      else out += '\t';
    }
    return out;
  }
  function docxXmlToLines(xml) {
    var tblRe = /<w:tbl[\s\S]*?<\/w:tbl>/g;
    var tables = xml.match(tblRe) || [];
    var tableRows = [];
    tables.forEach(function (tb) {
      var trs = tb.match(/<w:tr[\s\S]*?<\/w:tr>/g) || [];
      trs.forEach(function (tr) {
        var tcs = tr.match(/<w:tc[\s\S]*?<\/w:tc>/g) || [];
        if (!tcs.length) return;
        var cells = tcs.map(function (tc) {
          var ps = tc.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
          return ps.map(paraText).join(' ').replace(/\s+/g, ' ').trim();
        });
        if (cells.some(function (c) { return c; })) tableRows.push(cells);
      });
    });
    var rest = xml.replace(tblRe, '');
    var lines = [];
    (rest.match(/<w:p[\s\S]*?<\/w:p>/g) || []).forEach(function (p) {
      var t = paraText(p).replace(/[ \t]+$/gm, '');
      if (norm(t)) lines.push(t);
    });
    return { lines: lines, tableRows: tableRows };
  }
  function parseDocx(arrayBuffer) {
    var warnings = [];
    if (typeof fflate === 'undefined' || !fflate.unzipSync) {
      throw new Error('Word 解析组件未加载，请刷新页面重试');
    }
    var files;
    try {
      files = fflate.unzipSync(new Uint8Array(arrayBuffer));
    } catch (e) {
      throw new Error('解压失败，文件可能已损坏');
    }
    var key = Object.keys(files).filter(function (k) { return k === 'word/document.xml' || /document\.xml$/i.test(k); })[0];
    if (!key) throw new Error('不是有效的 Word 文档（缺少 word/document.xml）');
    var xml = new TextDecoder('utf-8').decode(files[key]);
    var ext = docxXmlToLines(xml);

    // 两种版式都试一遍，取题目多的一版
    var w1 = [], w2 = [];
    var resTxt = txtToQuestions(ext.lines.join('\n'), w1);
    var resTbl = ext.tableRows.length >= 2 ? tableToQuestions(ext.tableRows, w2) : [];

    if (resTbl.length > resTxt.length) {
      warnings = warnings.concat(w2);
      return finalize(resTbl, warnings);
    }
    if (resTxt.length) {
      warnings = warnings.concat(w1);
      if (resTbl.length) warnings.push('Word 文档同时含表格与段落，已按段落版式解析（' + resTxt.length + ' 题），若结果不对请删除页眉页脚等非题目文字后重试');
      return finalize(resTxt, warnings);
    }
    warnings.push('未能从 Word 文档中识别出题目，请检查排版是否为「题干 + A.B.C.D 选项 + 答案」');
    return finalize([], warnings);
  }

  /* ---------------- 入口 ---------------- */
  function finalize(list, warnings) {
    var out = list.filter(Boolean);
    if (!out.length && warnings) warnings.push('没有解析出任何题目，请检查格式或换一种导入方式');
    return { questions: out, warnings: warnings };
  }

  function parseText(text, hint) {
    var warnings = [];
    var t = String(text || '').replace(/^\uFEFF/, '');
    if (!norm(t)) return { questions: [], warnings: ['内容为空'] };

    var first = norm(t).charAt(0);
    if (hint === 'json' || (first === '[' || first === '{')) {
      try { return finalize(jsonToQuestions(JSON.parse(t), warnings), warnings); }
      catch (e) { warnings.push('JSON 解析失败：' + e.message + '，已按文本方式重试'); }
    }
    if (hint === 'txt') return finalize(txtToQuestions(t, warnings), warnings);

    // 自动判断：CSV 需要有多行且分隔符一致
    var lines = t.split(/\n/).filter(function (l) { return norm(l); });
    var d = detectDelim(t);
    var looksCsv = d && lines.length >= 2 && /[,;\t|]/.test(lines[0]) &&
      (lines[0].split(d).length >= 2) && (lines[1].split(d).length >= 2);
    // 纯文本题库通常带题号
    var hasQNo = lines.some(function (l) { return RE_QSTART.test(l); });

    if (looksCsv && !hasQNo) {
      var rows = lines.map(function (l) { return splitLine(l, d); });
      return finalize(tableToQuestions(rows, warnings), warnings);
    }
    if (hasQNo) return finalize(txtToQuestions(t, warnings), warnings);
    if (looksCsv) {
      var rows2 = lines.map(function (l) { return splitLine(l, d); });
      return finalize(tableToQuestions(rows2, warnings), warnings);
    }
    return finalize(txtToQuestions(t, warnings), warnings);
  }

  /* 按需加载第三方解析库：Excel 库约 930KB，绝不能放在首屏关键路径上 */
  var vendorLoaders = {};
  function loadVendor(key, src) {
    if (typeof window[key] !== 'undefined') return Promise.resolve();
    if (!vendorLoaders[key]) {
      vendorLoaders[key] = new Promise(function (res, rej) {
        var s = document.createElement('script');
        s.src = src; s.async = true;
        s.onload = function () { res(); };
        s.onerror = function () { rej(new Error('解析组件加载失败，请联网一次后再试')); };
        (document.head || document.documentElement).appendChild(s);
      });
    }
    return vendorLoaders[key];
  }
  function needXLSX() { return loadVendor('XLSX', 'vendor/xlsx.full.min.js'); }
  function needFFlate() { return loadVendor('fflate', 'vendor/fflate.min.js'); }

  /* Excel：解析全部工作表 */
  function parseWorkbook(data) {
    if (typeof XLSX === 'undefined') throw new Error('Excel 解析组件未加载');
    var wb = XLSX.read(new Uint8Array(data), { type: 'array' });
    return wb.SheetNames.map(function (sn) {
      var rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], {
        header: 1, defval: '', blankrows: false, raw: false
      }).filter(function (r) {
        return r.length && r.some(function (c) { return norm(c) !== ''; });
      });
      var sw = [];
      var qs = rows.length ? tableToQuestions(rows, sw) : [];
      return { name: sn, questions: qs, warnings: sw };
    });
  }

  function parseFile(file) {
    return new Promise(function (res, rej) {
      var name = (file.name || '').toLowerCase();
      var fr = new FileReader();

      if (/\.(xlsx|xls|xlsm|ods)$/.test(name)) {
        fr.onload = function (e) {
          var data = e.target.result;
          needXLSX().then(function () {
            try {
              var sheets = parseWorkbook(data);
              var warnings = [], all = [];
              sheets.forEach(function (s) {
                all = all.concat(s.questions);
                s.warnings.forEach(function (w) { warnings.push('[' + s.name + '] ' + w); });
              });
              var empty = sheets.filter(function (s) { return !s.questions.length; })
                .map(function (s) { return s.name; });
              if (empty.length) warnings.push('以下工作表未识别到题目：' + empty.join('、'));
              if (sheets.length > 1) warnings.unshift('共读取到 ' + sheets.length + ' 个工作表，合计 ' + all.length + ' 题');
              res({ questions: all, warnings: warnings, sheets: sheets });
            } catch (err) { rej(err); }
          }).catch(rej);
        };
        fr.onerror = function () { rej(new Error('文件读取失败')); };
        fr.readAsArrayBuffer(file);
        return;
      }

      if (/\.docx$/.test(name)) {
        fr.onload = function (e) {
          var data = e.target.result;
          needFFlate().then(function () {
            try { res(parseDocx(data)); }
            catch (err) { rej(err); }
          }).catch(rej);
        };
        fr.onerror = function () { rej(new Error('文件读取失败')); };
        fr.readAsArrayBuffer(file);
        return;
      }

      if (/\.doc$/.test(name)) {
        rej(new Error('不支持 .doc（Word 97-2003）格式，请在 Word 中「另存为 .docx」后再导入'));
        return;
      }
      fr.onload = function (e) {
        var hint = /\.(csv|tsv)$/.test(name) ? 'csv' : (/\.json$/.test(name) ? 'json' : (/\.txt$/.test(name) ? 'txt' : ''));
        res(parseText(e.target.result, hint));
      };
      fr.onerror = function () { rej(new Error('文件读取失败')); };
      fr.readAsText(file, 'utf-8');
    });
  }

  /* 模板下载内容 */
  var TPL_CSV = '\uFEFF题目,选项A,选项B,选项C,选项D,答案,解析,题型\n' +
    '下列哪一项属于行政处罚？,罚款,拘役,罚金,管制,A,"罚款属于行政处罚；罚金、拘役、管制属于刑罚。",单选\n' +
    '关于法人的说法，正确的有,法人应当依法成立,法人能够独立承担民事责任,法人必须有法定代表人,法人就是法定代表人,AB,"法人是组织，法定代表人是自然人，二者不同。",多选\n' +
    '诉讼时效期间届满后，义务人可以提出不履行义务的抗辩。,正确,错误,,,A,诉讼时效届满产生抗辩权，义务人可拒绝履行。,判断\n' +
    '我国现行宪法颁布于____年。,,,,,1982,1954 年第一部宪法，现行宪法为 1982 年宪法。,填空\n';

  window.Parser = {
    parseFile: parseFile,
    parseText: parseText,
    parseWorkbook: parseWorkbook,
    parseDocx: parseDocx,
    docxXmlToLines: docxXmlToLines,
    check: check,
    typeName: function (t) { return TYPE_NAME[t] || '单选题'; },
    TYPES: ['single', 'multiple', 'judge', 'fill'],
    TYPE_NAME: TYPE_NAME,
    TPL_CSV: TPL_CSV
  };
})();
