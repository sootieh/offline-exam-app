/* 拍照搜题（v1.15.0）断言测试：OCR 匹配算法 + 结构检查
   运行： node tools/test-ocr.js */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

/* ---------- mock 浏览器环境，直接 require 真实 ocr.js ---------- */
global.window = global;
global.document = {
  baseURI: 'https://example.com/app/index.html',
  createElement: () => ({ style: {}, getContext: () => null }),
  head: { appendChild() { } }
};
global.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
global.caches = {
  open: () => Promise.resolve({ put: () => Promise.resolve() }),
  delete: () => Promise.resolve(true)
};
global.Response = function (b, o) { this.body = b; this.opts = o; };
global.fetch = () => Promise.reject(new Error('no net'));
global.URL = URL;
require(path.join(ROOT, 'js/ocr.js'));
const OCR = global.OCR;

console.log('\n[1] 文本归一化');
ok('去掉空白与标点', OCR.norm('下列关于 刑法——基本原则的说法，正确 的是？') === '下列关于刑法基本原则的说法正确的是');
ok('英文保留并转小写', OCR.norm('Which of the following is TRUE?') === 'whichofthefollowingistrue');
ok('空值安全', OCR.norm(null) === '' && OCR.norm(undefined) === '');

console.log('\n[2] 相似度打分');
const stem = '下列关于刑法基本原则的说法，正确的是';
ok('完全相同 = 1', OCR.score(stem, stem) === 1);
ok('题干包含识别片段 = 1', OCR.score('刑法基本原则', stem) === 1);
const sTypo = OCR.score('关于刑法基本原财的说法', stem);
ok('OCR 错 1 字仍高分（>0.85）', sTypo > 0.85, 'score=' + sTypo.toFixed(3));
const sMiss = OCR.score('下列关于刑法的基本原则说法', stem);
ok('多字/少字容忍（>0.8）', sMiss > 0.8, 'score=' + sMiss.toFixed(3));
const sBad = OCR.score('企业会计准则中固定资产折旧方法', stem);
ok('无关题干低分（<0.5）', sBad < 0.5, 'score=' + sBad.toFixed(3));
ok('短词被题干完整包含 = 1', OCR.score('刑法', stem) === 1);
ok('短词未命中不做模糊（返回 0）', OCR.score('行政', stem) === 0);
ok('空串安全', OCR.score('', stem) === 0 && OCR.score(stem, '') === 0);

console.log('\n[3] 模糊搜索排序');
const qs = [
  { id: 'a', idx: 0, stem: '企业会计准则规定固定资产折旧方法一经确定不得随意变更' },
  { id: 'b', idx: 1, stem: '下列关于刑法基本原则的说法正确的是', options: [{ key: 'A', text: '罪刑法定' }] },
  { id: 'c', idx: 2, stem: '民事主体从事民事活动应当遵循自愿原则' },
  { id: 'd', idx: 3, stem: '刑法规定犯罪分子具有本法规定的减轻处罚情节的应当在法定刑以下判处刑罚' }
];
const hit = OCR.match(qs, '关于刑法基木原财的说法', 40);
ok('命中相关题目', hit.length >= 1, '命中 ' + hit.length + ' 条');
ok('最相似的是目标题（b）', hit[0] && hit[0].q.id === 'b', hit[0] ? 'first=' + hit[0].q.id : 'none');
ok('排除无关题（企业会计/民事）', !hit.some(x => x.q.id === 'a' || x.q.id === 'c'));
ok('结果按分数降序', hit.every((x, i) => i === 0 || hit[i - 1].s >= x.s));
const hit2 = OCR.match(qs, '固定资产折旧方法一经确定', 40);
ok('另一关键词也能定位（a）', hit2.length && hit2[0].q.id === 'a');
ok('limit 生效', OCR.match(qs, '刑法', 1).length <= 1);

console.log('\n[4] index.html 结构');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
['btn-shot', 'shot-file', 'shot-bar', 'shot-text', 'shot-cnt', 'shot-clear',
  'ocr-mask', 'ocr-t', 'ocr-s', 'ocr-bar', 'ocr-cancel', 'btn-ocr', 'ocr-state']
  .forEach(id => ok('存在 #' + id, html.includes('id="' + id + '"')));
ok('shot-file 为相机拍照输入', /id="shot-file"[^>]*capture="camera"/.test(html));
ok('引入 js/ocr.js 且在 app.js 之前',
  html.indexOf('js/ocr.js') > 0 && html.indexOf('js/ocr.js') < html.indexOf('js/app.js'));
ok('版本号更新为 1.15.0', html.includes('版本号 1.15.0'));
ok('设置页有拍照搜题区块', html.includes('拍照搜题'));

console.log('\n[5] app.js 逻辑');
const app = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8');
ok('绑定相机按钮', app.includes("$('btn-shot').onclick"));
ok('拍照后走 runShot', app.includes('runShot(f)'));
ok('模糊模式下调用 OCR.match', app.includes('OCR.match(App.qs, raw, 40)'));
ok('清除识别结果清 fuzzy', app.includes('function clearShot'));
ok('渲染 OCR 状态', app.includes('function renderOcrState'));
ok('App.fuzzy 已初始化', app.includes('fuzzy: false'));
ok('切换题库重置模糊态', app.includes('if (App.fuzzy) { App.fuzzy = false;'));

console.log('\n[6] CSS 与 Service Worker');
const css = fs.readFileSync(path.join(ROOT, 'css/app.css'), 'utf8');
['.shot-btn', '.shot-bar', '.ocr-mask', '.ocr-spin', '.ocr-bar', '.qi-sim', '.search-row{']
  .forEach(c => ok('样式 ' + c, css.includes(c)));
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
ok('SW 缓存版本 v29', sw.includes('examapp-v29'));
ok('SW 预缓存 js/ocr.js', sw.includes("'./js/ocr.js'"));
ok('SW 对 vendor/ocr 走缓存优先', sw.includes('/\\/vendor\\/ocr\\//'));

console.log('\n[7] 资源文件');
['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm', 'chi_sim.traineddata.gz']
  .forEach(f => {
    const p = path.join(ROOT, 'vendor/ocr', f);
    const sz = fs.existsSync(p) ? fs.statSync(p).size : 0;
    ok('vendor/ocr/' + f + '（' + Math.round(sz / 1024) + 'KB）', sz > 1000);
  });

console.log('\n[8] DOM 引用完整性（app.js 取用的 id 必须在 HTML 中存在）');
const DYNAMIC = ['toast-act', 'btn-demo', 'exam-total'];   // 运行时动态插入的元素
const ids = new Set();
let m;
const re = /\$\('([A-Za-z0-9_-]+)'\)/g;
while ((m = re.exec(app))) ids.add(m[1]);
const missing = [...ids].filter(id => DYNAMIC.indexOf(id) < 0 && !html.includes('id="' + id + '"'));
ok('共检查 ' + ids.size + ' 个 id，无缺失', missing.length === 0, '缺失：' + missing.join(', '));

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
