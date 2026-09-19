#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""生成「考神」App 图标：5 个版本 × 4 种尺寸（临时脚本，生成后可删）"""
import math, os, glob, sys
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageFont

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')  # 仓库根的 icons/
N = 4.8            # 超椭圆指数（iOS squircle）
SS = 6             # 超采样倍数（质量足够，内存友好）
SIZES = (167, 180, 192, 512)


# ---------- 基础工具 ----------
def squircle_mask(S):
    m = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(m)
    half, e, steps = S / 2.0, 2.0 / N, 1440
    pts = []
    for i in range(steps):
        t = 2 * math.pi * i / steps
        c, s = math.cos(t), math.sin(t)
        pts.append((half + half * math.copysign(abs(c) ** e, c),
                    half + half * math.copysign(abs(s) ** e, s)))
    d.polygon(pts, fill=255)
    return m


def vgrad(S, top, bottom):
    g = Image.new('RGB', (1, S))
    d = ImageDraw.Draw(g)
    for y in range(S):
        t = y / (S - 1)
        d.point((0, y), fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return g.resize((S, S), Image.NEAREST)


def radial(S, cx, cy, radius, color, peak):
    lay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(lay)
    r = int(radius)
    steps = 220
    for i in range(steps, 0, -1):
        rr = r * i / steps
        a = int(peak * (1 - i / steps) ** 1.7)
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    return lay


def glass_base(S, top, bottom):
    """渐变底 + 左上高光 + 顶部镜面 + 内侧渐变描边"""
    img = vgrad(S, top, bottom).convert('RGBA')
    img = Image.alpha_composite(img, radial(S, S * 0.28, S * 0.15, S * 0.85, (255, 255, 255), 96))
    img = Image.alpha_composite(img, radial(S, S * 0.5, -S * 0.10, S * 0.92, (255, 255, 255), 62))
    mask = squircle_mask(S)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    # 内侧描边：mask - 腐蚀(mask)，再乘竖向 alpha
    ring = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(5)))
    grad_a = Image.new('L', (S, S), 0)
    gd = ImageDraw.Draw(grad_a)
    for y in range(S):
        t = y / (S - 1)
        gd.line([(0, y), (S, y)], fill=min(255, int(150 * (1 - t) ** 1.5) + 16))
    ring = ImageChops.multiply(ring, grad_a)
    edge = Image.new('RGBA', (S, S), (255, 255, 255, 255))
    edge.putalpha(ring)
    out = Image.alpha_composite(out, edge)
    return out, mask


def finish(img, mask, size):
    out = Image.new('RGBA', img.size, (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out.resize((size, size), Image.LANCZOS)


def layer(S):
    return Image.new('RGBA', (S, S), (0, 0, 0, 0))


def soft_shadow(S, box, radius, blur, alpha):
    """给 artwork 加一层柔和投影"""
    sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle(box, radius=radius, fill=(0, 0, 0, alpha))
    return sh.filter(ImageFilter.GaussianBlur(blur))


def star_points(cx, cy, R, r, n=5, rot=-90):
    pts = []
    for i in range(n * 2):
        ang = math.radians(rot + i * 360 / (n * 2))
        rad = R if i % 2 == 0 else r
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    return pts


# ---------- 版本 1：墨绿 · 答题卡 ----------
def draw_moss(S):
    img, mask = glass_base(S, (58, 138, 118), (20, 66, 55))
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.475
    w, h = S * 0.435, S * 0.53
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    img = Image.alpha_composite(img, soft_shadow(S, [x0, y0 + S * 0.02, x1, y1 + S * 0.03],
                                                 int(S * 0.085), S * 0.028, 70))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([x0, y0, x1, y1], radius=int(S * 0.085), fill=(255, 255, 255, 252))
    lw = int(S * 0.021)
    for i, (frac, col) in enumerate([(0.60, (37, 110, 94, 255)), (0.86, (206, 214, 226, 255)), (0.44, (206, 214, 226, 255))]):
        ly = y0 + S * 0.118 + i * S * 0.115
        lx1 = x0 + S * 0.085 + (x1 - x0 - S * 0.17) * frac
        d.rounded_rectangle([x0 + S * 0.085, ly, lx1, ly + lw], radius=lw // 2, fill=col)
    bx, by = x1 - S * 0.052, y1 - S * 0.028
    br = S * 0.098
    d.ellipse([bx - br - S * 0.022, by - br - S * 0.022, bx + br + S * 0.022, by + br + S * 0.022], fill=(255, 255, 255, 255))
    d.ellipse([bx - br, by - br, bx + br, by + br], fill=(52, 168, 130, 255))
    tw = max(2, int(S * 0.024))
    d.line([(bx - br * 0.46, by + br * 0.02), (bx - br * 0.10, by + br * 0.44), (bx + br * 0.52, by - br * 0.42)],
           fill=(255, 255, 255, 255), width=tw, joint="curve")
    return img, mask


# ---------- 版本 2：考字 · 靛蓝 ----------
def pick_cjk_font():
    cands = glob.glob('/usr/share/fonts/**/NotoSansCJK-*.ttc', recursive=True)
    order = ['Bold', 'Medium', 'Black', 'Regular', 'DemiLight', 'Light']
    for o in order:
        for c in cands:
            if o in os.path.basename(c):
                return c
    return cands[0] if cands else None


def draw_glyph(S):
    img, mask = glass_base(S, (76, 92, 178), (30, 38, 96))
    img = Image.alpha_composite(img, radial(S, S * 0.5, S * 0.46, S * 0.42, (150, 170, 255), 60))
    d = ImageDraw.Draw(img)
    # 圆形底盘
    R = S * 0.30
    cx = cy = S * 0.5
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 255, 255, 30))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(255, 255, 255, 70), width=max(1, int(S * 0.006)))
    # 考 字
    fp = pick_cjk_font()
    if fp:
        fs = int(S * 0.40)
        f = ImageFont.truetype(fp, fs, index=0)
        lay = layer(S)
        ld = ImageDraw.Draw(lay)
        ld.text((cx, cy), '考', font=f, fill=(255, 255, 255, 255), anchor='mm')
        img = Image.alpha_composite(img, lay.filter(ImageFilter.GaussianBlur(S * 0.012)))
        img = Image.alpha_composite(img, lay)
    return img, mask


# ---------- 版本 3：勋章 · 琥珀金 ----------
def draw_medal(S, top=(226, 158, 74), bottom=(150, 88, 28)):
    img, mask = glass_base(S, top, bottom)
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.56
    R = S * 0.235
    # 绶带
    for sgn in (-1, 1):
        d.polygon([(cx + sgn * S * 0.055, cy - R * 0.55),
                   (cx + sgn * S * 0.235, cy - R * 1.55),
                   (cx + sgn * S * 0.145, cy - R * 1.62),
                   (cx + sgn * S * 0.028, cy - R * 0.62)], fill=(255, 236, 205, 235))
    # 奖牌
    d.ellipse([cx - R - S * 0.028, cy - R - S * 0.028 + S * 0.02, cx + R + S * 0.028, cy + R + S * 0.028 + S * 0.02],
              fill=(0, 0, 0, 60))
    d.ellipse([cx - R - S * 0.028, cy - R - S * 0.028, cx + R + S * 0.028, cy + R + S * 0.028], fill=(255, 226, 170, 255))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(252, 196, 108, 255))
    d.ellipse([cx - R * 0.80, cy - R * 0.80, cx + R * 0.80, cy + R * 0.80], outline=(255, 255, 255, 150),
              width=max(1, int(S * 0.008)))
    # 星
    d.polygon(star_points(cx, cy, R * 0.62, R * 0.27, 5, -90), fill=(255, 255, 255, 255))
    return img, mask


# ---------- 版本 4：星辰 · 深紫蓝 ----------
def draw_star(S, top=(108, 96, 186), bottom=(44, 38, 92)):
    img, mask = glass_base(S, top, bottom)
    img = Image.alpha_composite(img, radial(S, S * 0.5, S * 0.48, S * 0.6, (190, 170, 255), 78))
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.48
    # 光晕环
    for i, (rr, aa) in enumerate([(0.40, 26), (0.325, 40), (0.25, 60)]):
        lay = layer(S)
        ImageDraw.Draw(lay).ellipse([cx - S * rr, cy - S * rr, cx + S * rr, cy + S * rr], fill=(255, 255, 255, aa))
        img = Image.alpha_composite(img, lay)
    d = ImageDraw.Draw(img)
    d.polygon(star_points(cx, cy, S * 0.245, S * 0.105, 5, -90), fill=(255, 255, 255, 255))
    # 两颗小星
    for (sx, sy, ss) in [(0.735, 0.30, 0.062), (0.30, 0.755, 0.045)]:
        d.polygon(star_points(S * sx, S * sy, S * ss, S * ss * 0.43, 5, -90), fill=(255, 255, 255, 215))
    return img, mask


# ---------- 版本 5：极简对勾 · 石墨 ----------
def draw_check(S, top=(110, 114, 126), bottom=(34, 36, 44)):
    img, mask = glass_base(S, top, bottom)
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.5
    R = S * 0.29
    # 细环
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=(255, 255, 255, 105), width=max(2, int(S * 0.014)))
    # 对勾
    tw = max(3, int(S * 0.055))
    pts = [(cx - R * 0.52, cy + R * 0.03), (cx - R * 0.14, cy + R * 0.42), (cx + R * 0.55, cy - R * 0.40)]
    glow = layer(S)
    ImageDraw.Draw(glow).line(pts, fill=(255, 255, 255, 120), width=int(tw * 1.9), joint="curve")
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(S * 0.02)))
    d = ImageDraw.Draw(img)
    d.line(pts, fill=(255, 255, 255, 255), width=tw, joint="curve")
    for p in pts:
        d.ellipse([p[0] - tw / 2, p[1] - tw / 2, p[0] + tw / 2, p[1] + tw / 2], fill=(255, 255, 255, 255))
    return img, mask


# ---------- 白底系列（浅色壁纸也清晰：白底 + 彩色主体 + 浅灰描边） ----------
WHITE_TOP, WHITE_BOT = (255, 255, 255), (233, 236, 241)


def white_bordered(img, mask, S):
    """白底图标加一圈浅灰描边"""
    ring = ImageChops.subtract(mask, mask.filter(ImageFilter.MinFilter(5)))
    edge = Image.new('RGBA', (S, S), (28, 32, 40, 52))
    edge.putalpha(ImageChops.multiply(ring, Image.new('L', (S, S), 120)))
    return Image.alpha_composite(img, edge)


def draw_check_white(S):
    img, mask = glass_base(S, WHITE_TOP, WHITE_BOT)
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.5
    R = S * 0.29
    ink = (36, 158, 106)
    d.ellipse([cx - R, cy - R, cx + R, cy + R], outline=ink + (120,), width=max(2, int(S * 0.016)))
    tw = max(3, int(S * 0.055))
    pts = [(cx - R * 0.52, cy + R * 0.03), (cx - R * 0.14, cy + R * 0.42), (cx + R * 0.55, cy - R * 0.40)]
    d.line(pts, fill=ink + (255,), width=tw, joint="curve")
    for p in pts:
        d.ellipse([p[0] - tw / 2, p[1] - tw / 2, p[0] + tw / 2, p[1] + tw / 2], fill=ink + (255,))
    return white_bordered(img, mask, S), mask


def draw_star_white(S):
    img, mask = glass_base(S, WHITE_TOP, WHITE_BOT)
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.48
    ink = (66, 132, 224)
    for rr, aa in [(0.40, 22), (0.325, 34), (0.25, 52)]:
        lay = layer(S)
        ImageDraw.Draw(lay).ellipse([cx - S * rr, cy - S * rr, cx + S * rr, cy + S * rr], fill=ink + (aa,))
        img = Image.alpha_composite(img, lay)
    d = ImageDraw.Draw(img)
    d.polygon(star_points(cx, cy, S * 0.245, S * 0.105, 5, -90), fill=ink + (255,))
    for (sx, sy, ss) in [(0.735, 0.30, 0.062), (0.30, 0.755, 0.045)]:
        d.polygon(star_points(S * sx, S * sy, S * ss, S * ss * 0.43, 5, -90), fill=ink + (200,))
    return white_bordered(img, mask, S), mask


def draw_medal_white(S):
    img, mask = glass_base(S, WHITE_TOP, WHITE_BOT)
    d = ImageDraw.Draw(img)
    cx, cy = S * 0.5, S * 0.56
    R = S * 0.235
    gold, gold_l = (214, 152, 54), (238, 190, 104)
    for sgn in (-1, 1):
        d.polygon([(cx + sgn * S * 0.055, cy - R * 0.55),
                   (cx + sgn * S * 0.235, cy - R * 1.55),
                   (cx + sgn * S * 0.145, cy - R * 1.62),
                   (cx + sgn * S * 0.028, cy - R * 0.62)], fill=gold + (225,))
    d.ellipse([cx - R - S * 0.028, cy - R - S * 0.028 + S * 0.02, cx + R + S * 0.028, cy + R + S * 0.028 + S * 0.02],
              fill=(120, 110, 90, 45))
    d.ellipse([cx - R - S * 0.028, cy - R - S * 0.028, cx + R + S * 0.028, cy + R + S * 0.028], fill=gold_l + (255,))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=gold + (255,))
    d.ellipse([cx - R * 0.80, cy - R * 0.80, cx + R * 0.80, cy + R * 0.80],
              outline=(255, 255, 255, 190), width=max(1, int(S * 0.008)))
    d.polygon(star_points(cx, cy, R * 0.62, R * 0.27, 5, -90), fill=(255, 255, 255, 255))
    return white_bordered(img, mask, S), mask


# 品牌参考色
WX = ((32, 200, 122), (8, 150, 82))      # 微信绿
ZFB = ((74, 150, 255), (12, 96, 226))    # 支付宝蓝
HA = ((96, 206, 248), (14, 150, 210))    # Home Assistant 天蓝

VARIANTS = [
    ('check-wx', '极简绿', draw_check, *WX),
    ('check-zfb', '极简蓝', draw_check, *ZFB),
    ('check-ha', '极简天蓝', draw_check, *HA),
    ('check-white', '极简白', draw_check_white, None, None),
    ('star-wx', '星辰绿', draw_star, *WX),
    ('star-zfb', '星辰蓝', draw_star, *ZFB),
    ('star-ha', '星辰天蓝', draw_star, *HA),
    ('star-white', '星辰白', draw_star_white, None, None),
    ('medal-wx', '勋章绿', draw_medal, *WX),
    ('medal-zfb', '勋章蓝', draw_medal, *ZFB),
    ('medal-ha', '勋章天蓝', draw_medal, *HA),
    ('medal-white', '勋章白', draw_medal_white, None, None)
]

if __name__ == '__main__':
    # 可选参数：只生成指定 key（分批跑，避免大图占内存被系统杀）
    only = set(sys.argv[1:])
    import gc
    for key, name, fn, top, bottom in VARIANTS:
        if only and key not in only:
            continue
        d = os.path.join(OUT, key)
        os.makedirs(d, exist_ok=True)
        S = 512 * SS
        img, mask = fn(S) if top is None else fn(S, top, bottom)
        for s in SIZES:
            finish(img, mask, s).save(os.path.join(d, 'icon-%d.png' % s), 'PNG', optimize=True)
        del img, mask
        gc.collect()
        print('%-10s %s' % (key, name), flush=True)
    print('完成 →', OUT)
