"""
Collect ComfyUI outputs into assets/ at each art block's file path and final size.

  python3 tools/art/collect.py <staged_output_root> [--variant IA] [--sheet out.jpg] [--dry]

<staged_output_root> mirrors ComfyUI-Shared/output (it contains IA/...). For every art job whose
render exists (IA/<path>_NNNNN_.png, highest counter wins) the image is centre-cropped to the job's
aspect ratio, resized to its size and written to assets/<path>.webp (alpha kept for transparent jobs).
Re-run the content generators afterwards: art blocks whose file exists become status "generated".
"""
import argparse, glob, json, os, re
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def latest(root, variant, rel):
    c = glob.glob(os.path.join(root, variant, rel + "_*_.png"))
    c = [p for p in c if re.fullmatch(re.escape(os.path.basename(rel)) + r"_\d{5}_\.png", os.path.basename(p))]
    return max(c) if c else None


def fit(im, w, h):
    ar, iar = w / h, im.width / im.height
    if iar > ar:  # too wide
        nw = round(im.height * ar); x = (im.width - nw) // 2; im = im.crop((x, 0, x + nw, im.height))
    elif iar < ar:
        nh = round(im.width / ar); y = (im.height - nh) // 2; im = im.crop((0, y, im.width, y + nh))
    return im.resize((w, h), Image.LANCZOS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("root"); ap.add_argument("--variant", default="IA"); ap.add_argument("--sheet"); ap.add_argument("--dry", action="store_true")
    ap.add_argument("--tag", default="", help="pilot-round suffix")
    ap.add_argument("--cell", type=int, default=320); ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--only", default="", help="only asset paths starting with this (after assets/)")
    ap.add_argument("--out", default=ROOT, help="write assets under this root (default: repo)")
    a = ap.parse_args()
    jobs = json.load(open(os.path.join(ROOT, ".tmp/art-jobs.json")))["jobs"]
    done = []
    for j in jobs:
        if a.only and not j["file"][len("assets/"):].startswith(a.only): continue
        rel = os.path.splitext(j["file"][len("assets/"):])[0]
        src = latest(a.root, a.variant, rel + (f"_{a.tag}" if a.tag else ""))
        if not src: continue
        im = Image.open(src)
        im = im.convert("RGBA" if j.get("transparent") else "RGB")
        im = fit(im, *j["size"])
        if not a.dry:
            dst = os.path.join(a.out, j["file"]); os.makedirs(os.path.dirname(dst), exist_ok=True)
            im.save(dst, "WEBP", quality=90, method=6)
        done.append((j["file"], im))
    print(f"collected {len(done)} images")
    if a.sheet and done:
        from PIL import ImageDraw, ImageFont
        try: font = ImageFont.truetype("DejaVuSans.ttf", 15)
        except OSError: font = ImageFont.load_default()
        cell, lab = a.cell, 24; cols = min(a.cols, len(done)); rows = (len(done) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * cell, rows * (cell + lab)), (236, 236, 240)); d = ImageDraw.Draw(sheet)
        for i, (f, im) in enumerate(done):
            t = im.copy(); t.thumbnail((cell - 10, cell - 10))
            bgc = Image.new("RGB", t.size, (236, 236, 240)); bgc.paste(t, mask=t.split()[-1] if t.mode == "RGBA" else None)
            x0, y0 = (i % cols) * cell, (i // cols) * (cell + lab)
            sheet.paste(bgc, (x0 + (cell - t.width) // 2, y0 + (cell - t.height) // 2))
            parts = os.path.splitext(f)[0].split("/")
            name = parts[-2] if parts[-1] == "full_body" else parts[-1]
            d.text((x0 + cell // 2, y0 + cell + 4), name.replace("_", " "), fill=(40, 40, 60), font=font, anchor="mt")
        sheet.save(a.sheet, quality=88); print("sheet", a.sheet)


if __name__ == "__main__":
    main()
