"""Makes the Roku channel's images and fonts from KinCast's brand files.

Run from the repo root:  python3 roku/tools/make_art.py
Needs Pillow, fontTools and Playwright (Chromium) for the SVG logos.
"""
import base64
import io
import pathlib

from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "roku" / "images"
FONTS = ROOT / "roku" / "fonts"
BG = (15, 15, 15, 255)
SS = 4  # supersampling for smooth edges

OUT.mkdir(exist_ok=True)
FONTS.mkdir(exist_ok=True)


def svg_png(page, svg_path, width):
    """Renders an SVG to a transparent PNG of the given width."""
    svg = svg_path.read_text()
    data = base64.b64encode(svg.encode()).decode()
    page.set_content(
        f'<html><body style="margin:0;background:transparent">'
        f'<img id="i" src="data:image/svg+xml;base64,{data}" style="width:{width}px;display:block"></body></html>'
    )
    page.wait_for_function("document.getElementById('i').complete")
    return Image.open(io.BytesIO(page.locator("#i").screenshot(omit_background=True))).convert("RGBA")


def rounded(w, h, r, fill, border=None, bw=0):
    """A rounded rectangle, drawn large and scaled down for smooth corners."""
    im = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, w * SS - 1, h * SS - 1], r * SS, fill=fill, outline=border, width=bw * SS)
    return im.resize((w, h), Image.LANCZOS)


def nine_patch(im, name, inset):
    """Saves im as a .9.png: a 1px border with black marks for the stretchy middle."""
    w, h = im.size
    out = Image.new("RGBA", (w + 2, h + 2), (0, 0, 0, 0))
    out.paste(im, (1, 1))
    d = ImageDraw.Draw(out)
    d.line([(1 + inset, 0), (w - inset, 0)], fill=(0, 0, 0, 255))
    d.line([(0, 1 + inset), (0, h - inset)], fill=(0, 0, 0, 255))
    out.save(OUT / name)


def circle(size, fill=None, ring=0):
    im = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if ring:
        d.ellipse([0, 0, size * SS - 1, size * SS - 1], outline=(255, 255, 255, 255), width=ring * SS)
    else:
        d.ellipse([0, 0, size * SS - 1, size * SS - 1], fill=fill)
    return im.resize((size, size), Image.LANCZOS)


def gradient(w, h, horizontal):
    """Opaque background color fading to transparent (left->right or top->bottom reversed)."""
    im = Image.new("RGBA", (w, h))
    px = im.load()
    for y in range(h):
        for x in range(w):
            if horizontal:
                t = x / (w - 1)  # opaque at left
                a = int(255 * (1 - t) ** 1.6)
            else:
                t = y / (h - 1)  # opaque at bottom
                a = int(255 * t ** 1.4)
            px[x, y] = (15, 15, 15, a)
    return im


def on_background(w, h, logo, logo_w, glow=True):
    im = Image.new("RGBA", (w, h), BG)
    if glow:
        # A soft cyan-violet glow behind the logo, like the website.
        g = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        d = ImageDraw.Draw(g)
        cx, cy = w // 2, h // 2
        for i in range(40, 0, -1):
            r = int(max(w, h) * 0.45 * i / 40)
            a = int(30 * (1 - i / 40) ** 1.2)
            col = (34, 211, 238, a) if i % 2 else (99, 102, 241, a)
            d.ellipse([cx - r, cy - int(r * 0.6), cx + r, cy + int(r * 0.6)], fill=col)
        im = Image.alpha_composite(im, g)
    lw = logo_w
    lh = int(logo.height * lw / logo.width)
    l2 = logo.resize((lw, lh), Image.LANCZOS)
    im.alpha_composite(l2, ((w - lw) // 2, (h - lh) // 2))
    return im.convert("RGB")


def spinner(size):
    im = Image.new("RGBA", (size * SS, size * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    s = size * SS
    w = 8 * SS
    steps = 60
    for i in range(steps):
        t = i / steps
        a = int(255 * t)
        col = (int(34 + (99 - 34) * t), int(211 + (102 - 211) * t), int(238 + (241 - 238) * t), a)
        d.arc([w, w, s - w, s - w], start=i * 270 / steps, end=(i + 1) * 270 / steps + 1, fill=col, width=w)
    return im.resize((size, size), Image.LANCZOS)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)
        logo = svg_png(page, ROOT / "brand" / "kincast-logo-dark.svg", 1200)
        browser.close()

    # Logo for the screens (shown at 304x100 or smaller).
    l = logo.resize((608, int(logo.height * 608 / logo.width)), Image.LANCZOS)
    l.save(OUT / "logo.png")

    # Channel tiles and splash screens.
    on_background(540, 405, logo, 400).save(OUT / "icon_focus_fhd.png")
    on_background(290, 218, logo, 216).save(OUT / "icon_focus_hd.png")
    on_background(246, 140, logo, 200, glow=False).save(OUT / "icon_side_fhd.png")
    on_background(108, 69, logo, 90, glow=False).save(OUT / "icon_side_hd.png")
    on_background(1920, 1080, logo, 640).save(OUT / "splash_fhd.png")
    on_background(1280, 720, logo, 426).save(OUT / "splash_hd.png")

    # Shapes: white ones are tinted with blendColor on the TV.
    nine_patch(rounded(48, 48, 12, (255, 255, 255, 255)), "card.9.png", 14)
    nine_patch(rounded(64, 64, 18, (0, 0, 0, 0), (255, 255, 255, 255), 5), "ring.9.png", 22)
    nine_patch(rounded(64, 64, 14, (26, 26, 26, 255), (63, 63, 63, 255), 2), "field.9.png", 18)
    nine_patch(rounded(64, 64, 16, (30, 30, 30, 255), (58, 58, 58, 255), 2), "tile.9.png", 20)
    nine_patch(rounded(96, 80, 40, (39, 39, 39, 255)), "button.9.png", 42)
    nine_patch(rounded(96, 80, 40, (241, 241, 241, 255)), "button_focus.9.png", 42)
    circle(256, (255, 255, 255, 255)).save(OUT / "circle.png")
    circle(212, ring=6).save(OUT / "ring_circle.png")
    gradient(512, 32, True).save(OUT / "fade_left.png")
    gradient(32, 512, False).save(OUT / "fade_bottom.png")
    gradient(32, 512, False).transpose(Image.FLIP_TOP_BOTTOM).save(OUT / "fade_top.png")
    spinner(96).save(OUT / "spinner.png")

    # Barlow, KinCast's typeface, as TrueType (Roku can't read web fonts).
    fs = ROOT / "web" / "node_modules" / "@fontsource"
    for weight in ("400", "500", "600", "700"):
        f = TTFont(fs / "barlow" / "files" / f"barlow-latin-{weight}-normal.woff")
        f.flavor = None
        f.save(FONTS / f"Barlow-{weight}.ttf")
    for weight in ("600", "700"):
        f = TTFont(fs / "barlow-condensed" / "files" / f"barlow-condensed-latin-{weight}-normal.woff")
        f.flavor = None
        f.save(FONTS / f"BarlowCondensed-{weight}.ttf")


if __name__ == "__main__":
    main()
