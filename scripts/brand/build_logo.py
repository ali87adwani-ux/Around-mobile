"""
Builds the Al Dawri (الدوري) logo as outlined SVG paths (no font needed to render).
Arabic is shaped with HarfBuzz so the letters join correctly.
  python3 scripts/brand/build_logo.py   ->  assets/brand/*.svg
"""
import os
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FONTS = os.path.join(ROOT, 'node_modules/@expo-google-fonts/cairo')
OUT = os.path.join(ROOT, 'assets/brand')
NAVY, DEEP, SKY, WHITE = '#0B2E6F', '#04132F', '#7CC0F5', '#FFFFFF'


def shape(text, font_file, direction, tracking=0):
    """Return (svg path d, width, glyph boxes) in font units, y flipped (baseline at 0, up negative)."""
    blob = hb.Blob.from_file_path(font_file)
    face = hb.Face(blob)
    font = hb.Font(face)
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    buf.direction = direction
    hb.shape(font, buf, {})
    tt = TTFont(font_file)
    gs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    pen = SVGPathPen(gs)
    bpen = BoundsPen(gs)
    x = 0
    boxes = []
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
        name = order[info.codepoint]
        tp = TransformPen(pen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset))
        gs[name].draw(tp)
        gs[name].draw(TransformPen(bpen, (1, 0, 0, -1, x + pos.x_offset, -pos.y_offset)))
        boxes.append((x, x + pos.x_advance, info.cluster))
        x += pos.x_advance + tracking
    return pen.getCommands(), x - tracking, boxes, bpen.bounds


ar_d, ar_w, ar_boxes, ar_bb = shape('الدوري', os.path.join(FONTS, '900Black/Cairo_900Black.ttf'), 'rtl')
en_d, en_w, _, en_bb = shape('AL DAWRI', os.path.join(FONTS, '700Bold/Cairo_700Bold.ttf'), 'ltr', tracking=160)
ax0, ay0, ax1, ay1 = ar_bb
ex0, ey0, ex1, ey1 = en_bb

# In RTL output HarfBuzz emits glyphs visually left->right; the first glyph is the final ي (leftmost).
ya_right = ar_boxes[0][1]


def wordmark(text_fill, bar_fill, with_latin=False, latin_fill=None):
    """Wordmark group in font units, origin at bbox top-left. Returns (svg inner, width, height)."""
    w = ax1 - ax0
    h = ay1 - ay0
    bar_h = h * 0.11
    bar_y = ay1 - ay0 - bar_h * 1.15          # sits on the descender line, right of the ي tail
    bar_x0 = (ya_right - ax0) + w * 0.03
    bar_x1 = w
    parts = [f'<path d="{ar_d}" transform="translate({-ax0:.1f},{-ay0:.1f})" fill="{text_fill}"/>',
             f'<rect x="{bar_x0:.1f}" y="{bar_y:.1f}" width="{bar_x1 - bar_x0:.1f}" height="{bar_h:.1f}" rx="{bar_h / 2:.1f}" fill="{bar_fill}"/>']
    total_h = h
    if with_latin:
        ew, eh = ex1 - ex0, ey1 - ey0
        s = (w * 0.78) / ew
        gap = h * 0.22
        tx = (w - ew * s) / 2
        parts.append(f'<path d="{en_d}" transform="translate({tx:.1f},{h + gap:.1f}) scale({s:.4f}) translate({-ex0:.1f},{-ey0:.1f})" fill="{latin_fill or text_fill}"/>')
        total_h = h + gap + eh * s
    return ''.join(parts), w, total_h


def svg_doc(inner, vw, vh, size_w, size_h, bg=None, radius=0):
    defs = ''
    bg_el = ''
    if bg == 'gradient':
        defs = (f'<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1E56B3"/>'
                f'<stop offset=".55" stop-color="{NAVY}"/><stop offset="1" stop-color="{DEEP}"/></linearGradient></defs>')
        bg_el = f'<rect width="{vw}" height="{vh}" rx="{radius}" fill="url(#bg)"/>'
    elif bg:
        bg_el = f'<rect width="{vw}" height="{vh}" rx="{radius}" fill="{bg}"/>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{size_w}" height="{size_h}" viewBox="0 0 {vw:.1f} {vh:.1f}">'
            f'{defs}{bg_el}{inner}</svg>\n')


def placed(inner, w, h, box, frac):
    """Center a wordmark of size (w,h) inside a square box, scaled to `frac` of the box width."""
    s = box * frac / w
    return f'<g transform="translate({(box - w * s) / 2:.1f},{(box - h * s) / 2:.1f}) scale({s:.4f})">{inner}</g>'


os.makedirs(OUT, exist_ok=True)
files = {}
W_IN, WW, WH = wordmark(WHITE, SKY)
N_IN, NW, NH = wordmark(NAVY, SKY)
WL_IN, WLW, WLH = wordmark(WHITE, SKY, True, '#BFD9F2')
NL_IN, NLW, NLH = wordmark(NAVY, SKY, True, '#5D6A80')
M_IN, MW, MH = wordmark(WHITE, WHITE)
pad = WH * 0.12

files['icon.svg'] = svg_doc(placed(W_IN, WW, WH, 1024, 0.72), 1024, 1024, 1024, 1024, 'gradient')
files['icon-rounded.svg'] = svg_doc(placed(W_IN, WW, WH, 1024, 0.72), 1024, 1024, 1024, 1024, 'gradient', 230)
files['adaptive-foreground.svg'] = svg_doc(placed(W_IN, WW, WH, 1024, 0.48), 1024, 1024, 1024, 1024)
files['adaptive-monochrome.svg'] = svg_doc(placed(M_IN, MW, MH, 1024, 0.48), 1024, 1024, 1024, 1024)
files['splash.svg'] = svg_doc(placed(WL_IN, WLW, WLH, 1024, 0.80), 1024, 1024, 1024, 1024)
files['wordmark-white.svg'] = svg_doc(f'<g transform="translate({pad:.1f},{pad:.1f})">{W_IN}</g>', WW + 2 * pad, WH + 2 * pad, 600, round(600 * (WH + 2 * pad) / (WW + 2 * pad)))
files['wordmark-navy.svg'] = svg_doc(f'<g transform="translate({pad:.1f},{pad:.1f})">{N_IN}</g>', NW + 2 * pad, NH + 2 * pad, 600, round(600 * (NH + 2 * pad) / (NW + 2 * pad)))
files['lockup-navy.svg'] = svg_doc(f'<g transform="translate({pad:.1f},{pad:.1f})">{NL_IN}</g>', NLW + 2 * pad, NLH + 2 * pad, 600, round(600 * (NLH + 2 * pad) / (NLW + 2 * pad)))
files['lockup-white.svg'] = svg_doc(f'<g transform="translate({pad:.1f},{pad:.1f})">{WL_IN}</g>', WLW + 2 * pad, WLH + 2 * pad, 600, round(600 * (WLH + 2 * pad) / (WLW + 2 * pad)))
for name, content in files.items():
    open(os.path.join(OUT, name), 'w').write(content)
print('wrote', ', '.join(files))
