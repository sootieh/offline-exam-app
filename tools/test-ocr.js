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
ok('版本号更新为 1.19.0', html.includes('版本号 1.19.0'));
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
const swVer = parseInt((sw.match(/examapp-v(\d+)/) || [0, 0])[1], 10);
ok('SW 缓存版本已递增（v31+）', swVer >= 31, '当前 v' + swVer);
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

console.log('\n[8] 题库管理：勾选多选 + 底部四按钮');
['btn-mg-merge', 'btn-mg-del', 'btn-mg-rename', 'btn-mg-import', 'mg-sel-n']
  .forEach(id => ok('底部按钮 #' + id, html.includes('id="' + id + '"')));
ok('每行渲染复选框', app.includes('class="mg-check') && app.includes('data-act="check"'));
ok('点按整行切换勾选', app.includes('row.onclick = function'));
ok('拖动手柄不触发勾选', app.includes("closest('[data-act=\"drag\"]')"));
ok('选中数量驱动按钮状态', app.includes('function paintMgActs'));
ok('合并需 ≥2 个', app.includes('合并请先勾选至少 2 个题库'));
ok('删除/重命名绑定勾选列表',
  app.includes("$('btn-mg-del').onclick") && app.includes("$('btn-mg-rename').onclick"));
ok('多选删除逐个执行', app.includes('function confirmDeleteBank(ids)'));
ok('批量合并逐个复制', app.includes('function mergeOne(') && app.includes('function doMerge(ids, targetId)'));
ok('新增重命名入口', app.includes('function renameBank(ids)'));
ok('行内旧按钮已移除', !app.includes('data-act="merge">合并') && !app.includes('data-act="del">删除'));
ok('进入管理页清空勾选', app.includes("if (id === 'page-manage') { App.mgSel = {};"));
['.mg-check', '.mg-acts', '.mg-btn', '.mg-sel-n', '.mg-row.on']
  .forEach(c => ok('样式 ' + c, css.includes(c)));

console.log('\n[10] 界面与性能优化');
const blurCount = (css.match(/(?<!-webkit-)backdrop-filter:/g) || []).length;
ok('玻璃效果收敛到浮层（≤9 处）', blurCount <= 9, '实际 ' + blurCount + ' 处');
ok('题目列表不再叠玻璃', !/\.qitem\{[^}]*backdrop-filter/.test(css));
ok('题库卡片不再叠玻璃', !/\.bank-card\{[^}]*backdrop-filter/.test(css));
ok('答题选项不再叠玻璃', !/\.opt\{[^}]*backdrop-filter/.test(css));
ok('列表改用实心表面', /\.qitem\{[^}]*background:var\(--surface\)/.test(css));
ok('保留导航栏玻璃', /\.nav::before\{[^}]*backdrop-filter/.test(css));
ok('保留 Tab Bar 玻璃', /\.tabbar\{[^}]*backdrop-filter/.test(css));
ok('定义了 --surface / --hair-l', css.includes('--surface:#ffffff') && css.includes('--hair-l:'));
ok('更新了现代主色（墨绿 #10685b）', css.includes('--brand:#10685b'));
ok('JS 主题色板与 CSS 同步', !/#2e6d5c|#4c7196|#a56a48|#55565e|#756b99/.test(app));
ok('无残留旧功能色硬编码', !/#3e7d5c|#c25b52|rgba\(46,109,92/.test(css));
ok('搜索输入做了防抖', app.includes('searchT = setTimeout(renderQlist'));
ok('题目列表改为事件委托', app.includes('function bindQlistOnce'));
ok('拖动排序改为缓存测量', app.includes('function measure()') && app.includes('cache[i - 1].top'));

console.log('\n[11] 左缘右滑返回');
ok('手势绑定函数存在', app.includes('function bindEdgeBack()'));
ok('初始化时调用绑定', app.includes('bindEdgeBack();'));
ok('仅在有返回按钮的页面接管', app.includes("pg.querySelector('[data-back]')"));
ok('起点限制在左边缘', app.includes('var EDGE = 34') && app.includes('t.clientX > EDGE'));
ok('位移阈值 62px', app.includes('var MIN = 62'));
ok('偏竖向时让给原生滚动', app.includes('ay > ax * 0.9'));
ok('浮层打开时不接管手势', app.includes('function overlayed()'));
ok('接管后吃掉默认行为（不让浏览器抢）', app.includes("if (e.cancelable && e.preventDefault) e.preventDefault();"));
ok('touchmove 非被动监听', app.includes("'touchmove', onMove, { passive: false }"));
ok('跟随开关，默认开启', app.includes('edgeBack: true') && app.includes("bindSwitch('sw-edgeBack', 'edgeBack')"));
ok('提示箭头元素存在', html.includes('id="edge-hint"'));
ok('提示箭头样式存在', css.includes('.edge-hint{') && css.includes('pointer-events:none'));
ok('返回有滑入动画', css.includes('.page.pop-in') && css.includes('@keyframes pagePopIn'));
ok('尊重减少动效偏好', css.includes('prefers-reduced-motion') && css.includes('.page.pop-in{animation:none}'));

console.log('\n[12] 首页三个入口按钮字符对齐');
const btnRe = /<button class="btn ghost big entry" id="btn-(?:goto-stats|home-detail|home-manage)"[^>]*><span>([^<]*)<\/span><\/button>/g;
const labels = [];
let bm;
while ((bm = btnRe.exec(html))) labels.push(bm[1]);
ok('取到 3 个按钮', labels.length === 3, '实际：' + labels.join(' | '));
ok('完整统计已去掉箭头', labels.indexOf('完整统计') >= 0, '实际：' + labels.join(' | '));
ok('三个按钮均无箭头符号', labels.every(t => !/[→›>»]/.test(t)), '实际：' + labels.join(' | '));
ok('三者同用 .btn.ghost.big.entry（排版完全一致）',
  (html.match(/class="btn ghost big entry" id="btn-(?:goto-stats|home-detail|home-manage)"/g) || []).length === 3);
ok('文字包在定宽 span 里', labels.length === 3 && /<span>完整统计<\/span>/.test(html));
ok('文字块宽度统一为 7 个汉字（7em）', /\.btn\.entry>span\{[^}]*width:7em/.test(css));
ok('文字块分散对齐（text-align-last:justify）', /\.btn\.entry>span\{[^}]*text-align-last:justify/.test(css));
ok('按钮整体居中', /\.btn\.entry\{[^}]*justify-content:center/.test(css));
ok('相邻入口间距统一 8px', css.includes('.btn.entry+.btn.entry{margin-top:8px}'));
ok('不再有内联 margin 破坏间距', !/id="btn-goto-stats"[^>]*style=/.test(html));

console.log('\n[13] 外观：浅色 / 深色 / 跟随系统（图标 + 文字网格）');
ok('设置页有外观网格容器', html.includes('id="appearance-row"'));
ok('外观不再是下拉框', !html.includes('id="appearance-select"'));
ok('外观沿用界面风格同一套类', html.includes('class="theme-row ap-row" id="appearance-row"'));
['system', 'light', 'dark'].forEach(k =>
  ok('外观含档位 ' + k, app.includes("{ key: '" + k + "'")));
ok('外观中文标签齐全', ['跟随系统', '浅色', '深色'].every(t => app.includes("name: '" + t + "'")));
ok('外观项带双色圆片（top/bottom）', app.includes("a.top") && app.includes("a.bottom"));
ok('JS 有三档外观定义', app.includes("var APPEARANCES = [") && app.includes("key: 'dark'") && app.includes("name: '深色'"));
ok('外观渲染为 3 项网格', app.includes('function renderAppearanceRow()') && app.includes('APPEARANCES.map'));
ok('选中态同步到圆片 .on', app.includes('function markAppearanceRow()'));
ok('CSS 限制 3 项网格宽度', css.includes('.ap-row{'));
ok('isDark() 综合模式与系统偏好', app.includes('function isDark()') && app.includes("a === 'system' && systemDark()"));
ok('实际模式写入 data-mode', app.includes("setAttribute('data-mode', isDark() ? 'dark' : 'light')"));
ok('深色变量由 [data-mode="dark"] 驱动', css.includes(':root[data-mode="dark"]{'));
ok('深色不再写死媒体查询', (css.match(/prefers-color-scheme/g) || []).length === 0);
ok('各主题深色跟随 data-mode', css.includes('[data-mode="dark"][data-theme="mist"]'));
ok('首屏内联脚本定好 data-mode（防闪色）', html.includes("setAttribute('data-mode'"));
ok('系统深浅变化时跟随', app.includes('var onScheme = function () { applyAppearance(null, false); };'));
ok('同步 color-scheme meta', app.includes('meta[name="color-scheme"]'));

console.log('\n[14] 应用图标：4 × 3 图片网格（option 放不了图，故回退网格）');
ok('图标控件是网格 #icon-grid', html.includes('id="icon-grid"'));
ok('已移除下拉框 icon-picker', !html.includes('id="icon-picker"'));
ok('JS 改用 renderIconGrid', app.includes('function renderIconGrid()') && !app.includes('renderIconPicker'));
ok('JS 改用 markIconGrid', app.includes('function markIconGrid()') && !app.includes('markIconPicker'));
ok('网格项为 图片 + 名称', app.includes('class="icon-sw"><img src="icons/') && app.includes('class="icon-name"'));
ok('CSS 为 4 列网格', /\.icon-grid\{[^}]*grid-template-columns:repeat\(4,1fr\)/.test(css));
ok('12 款图标全部可选', (app.match(/\{ key: '[a-z]+-[a-z]+',\s+name: '/g) || []).length >= 12);
ok('选中态有勾选标记', css.includes('.icon-sw.on::after') && css.includes('.icon-opt.on .icon-name'));

console.log('\n[9] DOM 引用完整性（app.js 取用的 id 必须在 HTML 中存在）');
const DYNAMIC = ['toast-act', 'btn-demo', 'exam-total'];   // 运行时动态插入的元素
const ids = new Set();
let m;
const re = /\$\('([A-Za-z0-9_-]+)'\)/g;
while ((m = re.exec(app))) ids.add(m[1]);
const missing = [...ids].filter(id => DYNAMIC.indexOf(id) < 0 && !html.includes('id="' + id + '"'));
ok('共检查 ' + ids.size + ' 个 id，无缺失', missing.length === 0, '缺失：' + missing.join(', '));

console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
