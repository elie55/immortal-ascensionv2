"""
Region map art from the place layout (owner: the painted road must run through every place, in number order).

For each region: draws a guide over the current map art — a road through the main places in map order, a round
clearing at every place, faint paths to side places — and writes a queue whose prompt asks Qwen-Image-Edit to
repaint the draft as a finished map that follows the guide exactly (no lanterns, markers or text). The prompt is the art
block's own (MAP_GUIDE_PROMPT); a regenerated guide replaces refs/maps/<region>_guide.png, the block's first reference.

  python3 tools/art/map_guides.py --name maps [--regions mortal_plains,azure_bamboo_forest] [--reroll N]
Outputs: refs/maps/<region>_guide.png (kept in the repo: the map art's layout reference),
         .tmp/queues/<name>.json (refs as ia_guides/<region>_guide.png), upload refs/maps/* to input/ia_guides/.
Collect with tools/art/collect.py <root> --tag guide.
"""
import argparse, glob, hashlib, json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "art"))
from queue import gen_size  # noqa: E402

SIDE = {"hidden", "merchant", "secret_realm"}
# the prompt and the guide reference are the region map art block (tools/gen/common.py MAP_GUIDE_PROMPT, refs/maps/<region>_guide.png)


def smooth(points, n=24):
    """Catmull-Rom through points → dense polyline."""
    if len(points) < 2: return points
    P = [points[0]] + points + [points[-1]]; out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(points[-1]); return out


def guide(region, nodes, art_file, out_file):
    base = Image.open(os.path.join(ROOT, art_file)).convert("RGB")
    W, H = base.size
    # blur the old art: palette and scenery stay, its old roads and markers cannot compete with the guide road
    base = base.filter(ImageFilter.GaussianBlur(W * 0.018))
    px = lambda n: (n["position"][0] * W, n["position"][1] * H)
    main = [n for n in nodes if n["kind"] not in SIDE]
    road = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(road)
    line = smooth([px(n) for n in main])
    d.line(line, fill=(96, 70, 44, 255), width=int(W * 0.075), joint="curve")      # road edge
    d.line(line, fill=(196, 160, 112, 255), width=int(W * 0.055), joint="curve")   # road surface
    for n in nodes:
        if n["kind"] in SIDE:
            anchor = next((m for m in nodes if m["id"] in n["connections"]), None)
            if anchor:
                a, b = px(anchor), px(n); L = math.hypot(b[0] - a[0], b[1] - a[1]); steps = int(L / 22)
                for s in range(steps):
                    if s % 2: continue
                    t0, t1 = s / steps, (s + 1) / steps
                    d.line([(a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0), (a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1)], fill=(196, 160, 112, 220), width=int(W * 0.018))
    r = W * 0.075
    for n in nodes:
        x, y = px(n); rr = r * (1.25 if n["kind"] == "boss" else 1.0)
        d.ellipse([x - rr, y - rr * 0.8, x + rr, y + rr * 0.8], fill=(214, 186, 140, 255), outline=(110, 82, 52, 255), width=4)
    road = road.filter(ImageFilter.GaussianBlur(2))
    out = base.convert("RGBA"); out.alpha_composite(road)
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    out.convert("RGB").save(out_file)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--name", required=True); ap.add_argument("--regions", default=""); ap.add_argument("--reroll", type=int, default=0)
    a = ap.parse_args()
    regions = {}
    for f in glob.glob(os.path.join(ROOT, "content", "adventure", "*.json")) + glob.glob(os.path.join(ROOT, "content", "**", "*.regions.json"), recursive=True):
        d = json.load(open(f)); L = d if isinstance(d, list) else d.get("entries", [])
        for e in L if isinstance(L, list) else []:
            if isinstance(e, dict) and str(e.get("id", "")).startswith("region."): regions[e["id"]] = e
    want = set(filter(None, a.regions.split(",")))
    q = []
    for rid, r in sorted(regions.items()):
        key = rid.split(".", 1)[1]
        if want and key not in want: continue
        nodes = json.load(open(os.path.join(ROOT, "content", "adventure", "nodes", f"{key}.json")))
        art = r["art"]["map"]; f = art["file"] if os.path.exists(os.path.join(ROOT, art["file"])) else art["file"].rsplit(".", 1)[0] + ".webp"
        gf = os.path.join(ROOT, "refs", "maps", f"{key}_guide.png"); guide(key, nodes, f, gf)
        gw, gh = gen_size(*art["size"])
        rel = os.path.splitext(art["file"][len("assets/"):])[0]
        seed = int(hashlib.sha1(f"{art['file']}#guide{a.reroll}".encode()).hexdigest()[:8], 16)
        q.append({"entity": rid, "key": "map", "file": art["file"], "prompt": art["prompt"], "ref": f"ia_guides/{key}_guide.png",
                  "w": gw, "h": gh, "transparent": False, "seed": seed, "prefix": f"IA/{rel}_guide" + (f"_r{a.reroll}" if a.reroll else "")})
    os.makedirs(os.path.join(ROOT, ".tmp", "queues"), exist_ok=True)
    json.dump(q, open(os.path.join(ROOT, ".tmp", "queues", f"{a.name}.json"), "w"), ensure_ascii=False)
    print(f"{len(q)} guides + jobs -> .tmp/queues/{a.name}.json")


if __name__ == "__main__":
    main()
