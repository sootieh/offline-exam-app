#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
考试宝 PWA · 局域网题库共享服务器（纯 Python 标准库，零依赖）

功能：
  1. 把本目录的考试宝 App 完整跑在局域网里（手机可直接打开使用，所有功能相同）
  2. 提供 /upload 上传页：局域网内任何设备（电脑/手机）用浏览器打开即可上传题库文件
  3. 提供 API：手机端 App「设置 → 局域网共享」开启后可列出/导入/删除共享题库

用法：
  python3 lan-server.py            # 默认端口 8765
  python3 lan-server.py 9000       # 指定端口

上传的文件存放在 ./lan-uploads/ 目录，删除题库或清空目录即可清理。
"""
import json
import os
import re
import socket
import sys
import time
import uuid
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

ROOT = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(ROOT, 'lan-uploads')
META_FILE = os.path.join(UPLOAD_DIR, 'meta.json')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765

os.makedirs(UPLOAD_DIR, exist_ok=True)


def load_meta():
    try:
        with open(META_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return []


def save_meta(meta):
    with open(META_FILE, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1)


def safe_name(name):
    name = os.path.basename(unquote(name or '')).strip() or 'untitled'
    return re.sub(r'[\\/:*?"<>|\x00-\x1f]', '_', name)[:120]


# ---------------------------------------------------------------- 上传页
UPLOAD_PAGE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>考试宝 · 局域网题库上传</title>
<style>
:root{color-scheme:light dark}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;min-height:100vh;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
  background:#f6f5f1;color:#1c1c1e;display:flex;justify-content:center;padding:32px 16px}
.dark@{display:none}
.card{width:100%;max-width:560px}
h1{font-size:22px;letter-spacing:-.3px;margin:0 0 4px}
.sub{font-size:13px;color:#8a8a8e;margin:0 0 20px}
.drop{background:#fff;border:1.5px dashed #c7c7cc;border-radius:16px;padding:34px 20px;text-align:center;cursor:pointer;transition:.15s}
.drop:active{transform:scale(.98)}
.drop b{font-size:16px;display:block;margin-bottom:6px}
.drop span{font-size:13px;color:#8a8a8e}
.bar{display:none;margin:16px 0;padding:12px 16px;background:#fff;border-radius:14px;font-size:14px;
  box-shadow:0 1px 3px rgba(0,0,0,.06)}
.bar .track{height:6px;border-radius:3px;background:#e5e5ea;margin-top:8px;overflow:hidden}
.bar .fill{height:100%;width:0;background:#2e6d5c;border-radius:3px;transition:width .2s}
h2{font-size:15px;margin:26px 0 10px;color:#3a3a3c}
.item{display:flex;align-items:center;gap:10px;background:#fff;border-radius:14px;padding:13px 16px;margin-bottom:8px;
  box-shadow:0 1px 3px rgba(0,0,0,.05)}
.item .n{flex:1;min-width:0;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.item .s{font-size:12px;color:#8a8a8e}
.item button{border:none;background:#f2f2f7;color:#c25b52;border-radius:9px;padding:7px 12px;font-size:13px;cursor:pointer}
.empty{text-align:center;color:#8a8a8e;font-size:14px;padding:20px}
.ok{color:#2e6d5c;font-weight:600}
@media (prefers-color-scheme:dark){
  body{background:#111210;color:#f2f2f2}
  .drop,.bar,.item{background:#1c1c1e}
  .drop{border-color:#48484a}
  h2{color:#c7c7cc}.item .s,.sub,.drop span,.empty{color:#98989d}
  .item button{background:#2c2c2e}
}
</style>
</head>
<body>
<div class="card">
  <h1>考试宝 · 题库上传</h1>
  <p class="sub">局域网共享 · 文件保存在运行服务器的电脑上，不会外网传输</p>

  <div class="drop" id="drop">
    <b>点击选择题库文件</b>
    <span>支持 Excel(.xlsx/.xls) · Word(.docx) · CSV · TXT · JSON</span>
  </div>
  <input type="file" id="file" accept=".xlsx,.xls,.xlsm,.docx,.csv,.txt,.json" hidden>

  <div class="bar" id="bar"><span id="btxt">上传中…</span><div class="track"><div class="fill" id="fill"></div></div></div>
  <p class="sub" id="msg" style="margin-top:12px;min-height:18px"></p>

  <h2>已共享的题库（<span id="cnt">0</span>）</h2>
  <div id="list"><div class="empty">加载中…</div></div>
</div>
<script>
var $=function(i){return document.getElementById(i)};
function fmt(n){return n>1048576?(n/1048576).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB'}
function load(){
  fetch('/api/banks',{cache:'no-store'}).then(function(r){return r.json()}).then(function(list){
    $('cnt').textContent=list.length;
    if(!list.length){$('list').innerHTML='<div class="empty">还没有共享的题库</div>';return}
    $('list').innerHTML=list.map(function(f){
      return '<div class="item"><div style="flex:1;min-width:0"><div class="n">'+esc(f.name)+'</div>'+
        '<div class="s">'+fmt(f.size)+' · '+new Date(f.ts).toLocaleString()+'</div></div>'+
        '<button data-id="'+f.id+'" data-name="'+esc(f.name)+'">删除</button></div>'
    }).join('');
    Array.prototype.forEach.call($('list').querySelectorAll('button'),function(b){
      b.onclick=function(){
        if(!confirm('删除「'+b.getAttribute('data-name')+'」？'))return;
        fetch('/api/file/'+b.getAttribute('data-id'),{method:'DELETE'}).then(load);
      };
    });
  }).catch(function(){$('list').innerHTML='<div class="empty">加载失败</div>'});
}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
$('drop').onclick=function(){$('file').click()};
$('file').onchange=function(){
  var f=this.files[0];if(!f)return;
  $('bar').style.display='block';$('msg').textContent='';$('msg').className='sub';
  var xhr=new XMLHttpRequest();
  xhr.open('POST','/api/upload?name='+encodeURIComponent(f.name));
  xhr.upload.onprogress=function(e){if(e.lengthComputable)$('fill').style.width=(e.loaded/e.total*100)+'%'};
  xhr.onload=function(){
    $('bar').style.display='none';$('fill').style.width='0';
    if(xhr.status===200){$('msg').textContent='✓ '+f.name+' 上传成功，手机端 App 即可导入';$('msg').className='sub ok'}
    else{$('msg').textContent='上传失败：'+(xhr.responseText||('HTTP '+xhr.status));$('msg').className='sub'}
    load();
  };
  xhr.onerror=function(){$('bar').style.display='none';$('msg').textContent='网络错误';$('msg').className='sub'};
  xhr.send(f);
  this.value='';
};
load();
</script>
</body>
</html>
"""


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        sys.stderr.write('[%s] %s\n' % (self.log_date_time_string(), fmt % args))

    # ---------- 工具 ----------
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- 路由 ----------
    def do_GET(self):
        p = urlparse(self.path).path
        if p == '/api/banks':
            return self._json(load_meta())
        m = re.match(r'^/api/file/([0-9a-f-]+)$', p)
        if m:
            return self.send_file(m.group(1))
        if p == '/upload':
            body = UPLOAD_PAGE.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def send_file(self, fid):
        meta = [f for f in load_meta() if f['id'] == fid]
        if not meta:
            return self._json({'error': 'not found'}, 404)
        f = meta[0]
        path = os.path.join(UPLOAD_DIR, f['id'] + '_' + f['name'])
        if not os.path.isfile(path):
            return self._json({'error': 'file missing'}, 404)
        with open(path, 'rb') as fp:
            data = fp.read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Disposition',
                         "attachment; filename*=UTF-8''" + quote_name(f['name']))
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_DELETE(self):
        p = urlparse(self.path).path
        m = re.match(r'^/api/file/([0-9a-f-]+)$', p)
        if not m:
            return self._json({'error': 'bad request'}, 400)
        fid = m.group(1)
        meta = load_meta()
        kept, removed = [], None
        for f in meta:
            if f['id'] == fid:
                removed = f
            else:
                kept.append(f)
        if removed:
            path = os.path.join(UPLOAD_DIR, fid + '_' + removed['name'])
            try:
                os.remove(path)
            except OSError:
                pass
            save_meta(kept)
        return self._json({'ok': bool(removed)})

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != '/api/upload':
            return self._json({'error': 'bad request'}, 400)
        qs = parse_qs(u.query)
        name = safe_name((qs.get('name') or ['untitled'])[0])
        try:
            length = int(self.headers.get('Content-Length') or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return self._json({'error': 'empty body'}, 400)
        if length > 200 * 1024 * 1024:
            return self._json({'error': 'file too large'}, 413)

        fid = str(uuid.uuid4())
        path = os.path.join(UPLOAD_DIR, fid + '_' + name)
        remain = length
        with open(path, 'wb') as fp:
            while remain > 0:
                chunk = self.rfile.read(min(65536, remain))
                if not chunk:
                    break
                fp.write(chunk)
                remain -= len(chunk)

        meta = load_meta()
        meta.insert(0, {'id': fid, 'name': name, 'size': length, 'ts': int(time.time() * 1000)})
        save_meta(meta)
        print('  + 已接收: %s (%.1f KB)' % (name, length / 1024))
        self._json({'ok': True, 'id': fid, 'name': name})


def quote_name(name):
    from urllib.parse import quote
    return quote(name, safe='')


def lan_ips():
    ips = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if not ip.startswith('127.'):
                ips.add(ip)
    except OSError:
        pass
    return sorted(ips) or ['127.0.0.1']


def main():
    os.chdir(ROOT)
    srv = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print()
    print('  考试宝 · 局域网题库共享服务器已启动')
    print('  ─────────────────────────────────────────')
    print('  本机 App 入口（手机浏览器打开可用全部功能）:')
    for ip in lan_ips():
        print('    http://%s:%d/' % (ip, PORT))
    print('  题库上传页（局域网内任意设备浏览器打开）:')
    for ip in lan_ips():
        print('    http://%s:%d/upload' % (ip, PORT))
    print('  ─────────────────────────────────────────')
    print('  手机端 App: 设置 → 局域网共享 → 开启「接收局域网题库」')
    print('  服务器地址填上面的 App 入口地址即可自动刷新列表')
    print('  按 Ctrl+C 停止')
    print()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')


if __name__ == '__main__':
    main()
