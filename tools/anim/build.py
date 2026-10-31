"""
Build a figure's animation rig from its battle sprite and the layer edits (docs/ANIMATION.md).

  python3 tools/anim/build.py <staged_output_root> --ids npc.lin_xueyao,enemy.field_bandit [--debug]

<staged_output_root> mirrors ComfyUI-Shared/output (it contains IA_anim/<id>/<part>_NNNNN_.png).
Writes assets/anim/<id>/{body.webp, weapon.webp, blink.webp, weights.png, rig.json} and, with --debug,
.tmp/anim/<id>/debug.png (masks and pivot drawn over the sprite). Re-run tools/gen afterwards: entities
whose rig exists get an `anim` block.
"""
import argparse, glob, json, os, re, sys
import numpy as np
import cv2
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "tools", "anim"))
from edits import load_content, art_file, art_key, rig_name, cast_of, CAST, GREY  # noqa: E402
LOOKS = json.load(open(os.path.join(ROOT, "tools", "art", "facing.json"))) if os.path.exists(os.path.join(ROOT, "tools", "art", "facing.json")) else {}

MESH = [8, 12]


def latest(root, eid, part):
    c = [p for p in glob.glob(os.path.join(root, "IA_anim", eid, f"{part}_*_.png")) if re.fullmatch(part + r"_\d{5}_\.png", os.path.basename(p))]
    return max(c) if c else None


def load_edit(root, eid, part, size, src=None):
    p = latest(root, eid, part)
    if not p: return None
    im = Image.open(p).convert("RGBA")
    # the render has the source's aspect at ~1 MP: centre-crop to the aspect, then resize to the source size
    w, h = im.size; ar = size[0] / size[1]
    if w / h > ar: nw = round(h * ar); im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else: nh = round(w / ar); im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    im = im.resize(size, Image.LANCZOS)
    if src is not None:
        im, M = align(im, src)
        print(f"  {part}: aligned (shift {M[0,2]:+.1f},{M[1,2]:+.1f} px, scale {np.hypot(M[0,0], M[1,0]):.3f})")
    return im


def silhouette(im):
    """Foreground of a render on a flat background (the edit model paints one): everything not connected to the border
    in the background's colour."""
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    bg = np.median(np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]]), axis=0)
    fg = (np.abs(a - bg).max(axis=2) > 14).astype(np.uint8)
    n, lab = cv2.connectedComponents(1 - fg)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return (~(np.isin(lab, border) & (fg == 0))).astype(np.uint8) * 255


def align(edit, src):
    """Register an edit render onto the source sprite (renders drift by a few px and a little scale; a creature on a
    pale background can drift by 10+ px). Candidates: identity, ORB features + RANSAC similarity, the silhouettes'
    boxes, each refined by ECC; the one that matches the source best over its body wins. M maps edit → source px."""
    W, H = src.size
    g0 = cv2.cvtColor(flat(src).astype(np.uint8), cv2.COLOR_RGB2GRAY); g1 = cv2.cvtColor(flat(edit).astype(np.uint8), cv2.COLOR_RGB2GRAY)
    body = np.asarray(src.getchannel("A")) > 128
    a0 = flat(src).astype(np.float32)
    arr = np.asarray(edit)
    def warp(M, fill=True):
        return cv2.warpAffine(arr, M.astype(np.float32), (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(GREY[0], GREY[1], GREY[2], 0))
    def err(M):
        b = flat(Image.fromarray(warp(M), "RGBA")).astype(np.float32)
        return float(np.abs(a0 - b).mean(axis=2)[body].mean())
    cands = [np.eye(2, 3, dtype=np.float32)]
    orb = cv2.ORB_create(3000)
    k0, d0 = orb.detectAndCompute(g0, None); k1, d1 = orb.detectAndCompute(g1, None)
    if d0 is not None and d1 is not None and len(k0) > 20 and len(k1) > 20:
        matches = sorted(cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True).match(d1, d0), key=lambda m: m.distance)[:600]
        if len(matches) >= 12:
            p1 = np.float32([k1[m.queryIdx].pt for m in matches]); p0 = np.float32([k0[m.trainIdx].pt for m in matches])
            M, _ = cv2.estimateAffinePartial2D(p1, p0, method=cv2.RANSAC, ransacReprojThreshold=3.0)
            if M is not None: cands.append(M.astype(np.float32))
    try:
        s0 = body.astype(np.uint8) * 255; s1 = silhouette(edit)
        ys0, xs0 = np.where(s0 > 0); ys1, xs1 = np.where(s1 > 0)
        sc = ((ys0.max() - ys0.min()) / max(1, ys1.max() - ys1.min()) + (xs0.max() - xs0.min()) / max(1, xs1.max() - xs1.min())) / 2
        if 0.8 < sc < 1.25: cands.append(np.float32([[sc, 0, xs0.min() - xs1.min() * sc], [0, sc, ys0.min() - ys1.min() * sc]]))
    except ValueError:
        pass
    # ECC finds W with edit(W·x) ≈ src(x), i.e. source → edit; seed it with the inverse of each candidate
    small = 0.5; A = cv2.resize(g0, None, fx=small, fy=small); B = cv2.resize(g1, None, fx=small, fy=small)
    for M in list(cands):
        try:
            Wi = cv2.invertAffineTransform(M).astype(np.float32); Wi[:, 2] *= small
            _, Wi = cv2.findTransformECC(A, B, Wi, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5), None, 5)
            Wi[:, 2] /= small; cands.append(cv2.invertAffineTransform(Wi).astype(np.float32))
        except cv2.error:
            pass
    scored = sorted(((err(M), i, M) for i, M in enumerate(cands)), key=lambda t: (t[0], t[1]))
    M = scored[0][2]
    return Image.fromarray(warp(M), "RGBA"), M


def defringe(im):
    """Background removal leaves a light 1 px halo on a re-rendered figure: pull the alpha edge in by a pixel and soften it."""
    a = np.asarray(im)
    alpha = cv2.erode(a[..., 3], np.ones((3, 3), np.uint8)); alpha = cv2.GaussianBlur(alpha, (0, 0), 0.7)
    out = a.copy(); out[..., 3] = np.minimum(a[..., 3], alpha)
    return Image.fromarray(out, "RGBA")


def flat(im):
    bg = Image.new("RGB", im.size, GREY); bg.paste(im, mask=im.getchannel("A")); return np.asarray(bg).astype(np.int16)


def magenta_mask(im):
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    m = ((r > 150) & (b > 120) & (g < 120) & (r - g > 80) & (b - g > 50)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return m


def biggest_components(m, min_frac, keep_all_big=True):
    n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
    if n <= 1: return m
    areas = stats[1:, cv2.CC_STAT_AREA]; total = m.shape[0] * m.shape[1]
    keep = [i + 1 for i, a in enumerate(areas) if a >= min_frac * total] if keep_all_big else [1 + int(np.argmax(areas))]
    out = np.isin(lab, keep).astype(np.uint8) * 255
    return out


def soft(m, feather=2):
    return cv2.GaussianBlur(m, (0, 0), feather) if feather else m


def build(root, eid, c, debug=False, key=None):
    e = c[eid]
    f, creature = art_file(c, eid, key)
    name = rig_name(c, eid, key)
    rec = cast_of(f)
    armed = rec.get("armed", not creature)
    src = Image.open(os.path.join(ROOT, f)).convert("RGBA"); W, H = src.size
    alpha = np.asarray(src.getchannel("A"))
    ys, xs = np.where(alpha > 24); bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    out_dir = os.path.join(ROOT, "assets", "anim", name); os.makedirs(out_dir, exist_ok=True)
    rel = lambda n: f"assets/anim/{name}/{n}"
    src_flat = flat(src)
    dbg = np.asarray(src.convert("RGB")).copy()

    # ---------- body + weapon ----------
    nowp = load_edit(root, name, "noweapon", (W, H), src) if armed else None
    tagw = load_edit(root, name, "tag_weapon", (W, H), src) if armed else None
    weapon = None
    if nowp is not None:
        if tagw is not None:  # the painted silhouette: clean and exact
            m = magenta_mask(tagw); m = np.minimum(m, (alpha > 24).astype(np.uint8) * 255)
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)); m = biggest_components(m, 0.002)
        else:  # fallback: what disappeared when the weapon was removed
            diff = np.abs(src_flat - flat(nowp)).sum(axis=2)
            diff = cv2.GaussianBlur(diff.astype(np.float32), (0, 0), 1.5)
            m = ((diff > 110) & (alpha > 24)).astype(np.uint8) * 255
            m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((7, 7), np.uint8))
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
            m = biggest_components(m, 0.004)
        if m.any():
            m = cv2.dilate(m, np.ones((5, 5), np.uint8))
            m = np.minimum(m, alpha)  # never outside the sprite
            pts = np.column_stack(np.where(m > 127))[:, ::-1].astype(np.float32)  # x,y
            mean = pts.mean(axis=0); cov = np.cov((pts - mean).T); evals, evecs = np.linalg.eigh(cov); axis = evecs[:, int(np.argmax(evals))]
            proj = (pts - mean) @ axis; p0 = mean + axis * proj.min(); p1 = mean + axis * proj.max()
            # the grip is the end at the hands (tag_hands); without it, the end nearest the torso
            tagh = load_edit(root, name, "tag_hands", (W, H), src)
            hm = magenta_mask(tagh) if tagh is not None else None
            hand = None
            if hm is not None and (hm > 127).sum() > 50:
                # the gripping hand: of the painted hands, the one touching the weapon (the other may be free)
                n, lab, st, cen = cv2.connectedComponentsWithStats((hm > 127).astype(np.uint8), 8)
                wy_, wx_ = np.where(m > 127); wpts = np.column_stack([wx_, wy_]).astype(np.float32)[::7]
                best = None
                for k in range(1, n):
                    if st[k, cv2.CC_STAT_AREA] < 50: continue
                    d = float(np.min(np.linalg.norm(wpts - cen[k], axis=1)))
                    if best is None or d < best[0]: best = (d, cen[k])
                hand = np.array(best[1]) if best is not None else None
                if hand is None: hy, hx = np.where(hm > 127); hand = np.array([hx.mean(), hy.mean()])
                grip, tip = (p0, p1) if np.linalg.norm(p0 - hand) <= np.linalg.norm(p1 - hand) else (p1, p0)
            else:
                torso = np.array([(bbox[0] + bbox[2]) / 2, bbox[1] + bh * 0.25])  # shoulder height: the arms start there
                grip, tip = (p0, p1) if np.linalg.norm(p0 - torso) <= np.linalg.norm(p1 - torso) else (p1, p0)
            pivot = grip + (tip - grip) * 0.10
            if hand is not None:
                # the weapon turns where the hand holds it: a spear or staff is often held in the middle, not at its end
                L = np.linalg.norm(tip - grip); u = (tip - grip) / max(L, 1e-6)
                pivot = grip + u * float(np.clip((hand - grip) @ u, L * 0.05, L * 0.6))
            # the hand still holds the grip in the body layer: keep the weapon's hand region out of the weapon layer
            wm = soft(m, 1.2)
            wx, wy = np.where(wm > 8)
            x0, y0, x1, y1 = int(wy.min()), int(wx.min()), int(wy.max()) + 1, int(wx.max()) + 1
            layer = np.asarray(src).copy(); layer[..., 3] = (layer[..., 3].astype(np.float32) * (wm / 255.0)).astype(np.uint8)
            Image.fromarray(layer[y0:y1, x0:x1]).save(os.path.join(out_dir, "weapon.webp"), quality=92, method=6)
            weapon = {"file": rel("weapon.webp"), "size": [x1 - x0, y1 - y0], "offset": [x0, y0], "pivot": [round(float(pivot[0]), 1), round(float(pivot[1]), 1)]}
            dbg[m > 127] = (dbg[m > 127] * 0.4 + np.array([255, 60, 60]) * 0.6).astype(np.uint8)
            cv2.circle(dbg, (int(pivot[0]), int(pivot[1])), 9, (0, 255, 0), 3); cv2.circle(dbg, (int(tip[0]), int(tip[1])), 6, (0, 160, 255), 2)
        body_im = defringe(nowp)
    else:
        body_im = src
    body_im.save(os.path.join(out_dir, "body.webp"), quality=92, method=6)

    # ---------- blink ----------
    blink = None
    eyes = load_edit(root, name, "eyesclosed", (W, H), src)
    tage = load_edit(root, name, "tag_eyes", (W, H), src)
    if eyes is not None:
        # where the eyes may be: the top third of a standing figure; a creature's ears and tail reach higher, so half of it
        head_band = np.zeros_like(alpha); head_band[bbox[1]:bbox[1] + int(bh * (0.55 if creature else 0.34)), bbox[0]:bbox[2]] = 255
        if tage is not None:
            m = np.minimum(magenta_mask(tage), head_band)
        else:
            diff = np.abs(src_flat - flat(eyes)).sum(axis=2)
            diff = cv2.GaussianBlur(diff.astype(np.float32), (0, 0), 1.2)
            m = ((diff > 60) & (alpha > 24) & (head_band > 0)).astype(np.uint8) * 255
            m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        n, lab, stats, _ = cv2.connectedComponentsWithStats(m, 8)
        if n > 1:
            # eyes: the largest blob plus any blob of similar size near it (two eyes)
            order = np.argsort(-stats[1:, cv2.CC_STAT_AREA]) + 1
            main = order[0]; sx, sy = stats[main, cv2.CC_STAT_LEFT] + stats[main, cv2.CC_STAT_WIDTH] / 2, stats[main, cv2.CC_STAT_TOP] + stats[main, cv2.CC_STAT_HEIGHT] / 2
            keep = [main] + [i for i in order[1:4] if stats[i, cv2.CC_STAT_AREA] > stats[main, cv2.CC_STAT_AREA] * 0.06 and abs(stats[i, cv2.CC_STAT_TOP] + stats[i, cv2.CC_STAT_HEIGHT] / 2 - sy) < bh * 0.03 and abs(stats[i, cv2.CC_STAT_LEFT] - sx) < bw * 0.2]
            em = np.isin(lab, keep)
            ys2, xs2 = np.where(em); pad = max(4, int(bh * 0.008))
            x0, y0, x1, y1 = max(0, xs2.min() - pad), max(0, ys2.min() - pad), min(W, xs2.max() + 1 + pad), min(H, ys2.max() + 1 + pad)
            if (x1 - x0) < bw * 0.5 and (y1 - y0) < bh * (0.16 if creature else 0.12):
                patch = np.asarray(eyes).copy(); patch[..., 3] = alpha  # the sprite's own alpha, so the patch never leaks outside
                # feathered edges so the patch blends with the open-eyed face
                fm = np.zeros((y1 - y0, x1 - x0), np.float32); fm[2:-2, 2:-2] = 1; fm = cv2.GaussianBlur(fm, (0, 0), 1.5 if not creature else 3)
                crop = patch[y0:y1, x0:x1].copy(); crop[..., 3] = (crop[..., 3] * fm).astype(np.uint8)
                # the render's colours drift a little (a paler fur, a warmer skin): match the patch to the sprite along its rim
                ring = np.zeros(fm.shape, bool); ring[:4] = ring[-4:] = True; ring[:, :4] = ring[:, -4:] = True
                ring &= alpha[y0:y1, x0:x1] > 128
                if ring.sum() > 20:
                    sv = np.asarray(src)[y0:y1, x0:x1, :3].astype(np.float32); pv = crop[..., :3].astype(np.float32)
                    crop[..., :3] = np.clip(pv + (sv[ring].mean(axis=0) - pv[ring].mean(axis=0)), 0, 255).astype(np.uint8)
                Image.fromarray(crop).save(os.path.join(out_dir, "blink.webp"), quality=92, method=6)
                blink = {"file": rel("blink.webp"), "rect": [int(x0), int(y0), int(x1 - x0), int(y1 - y0)]}
                cv2.rectangle(dbg, (int(x0), int(y0)), (int(x1), int(y1)), (255, 255, 0), 2)

    # ---------- flutter weights ----------
    hair = load_edit(root, name, "tag_hair", (W, H), src); cloth = load_edit(root, name, "tag_cloth", (W, H), src)
    weights_file = None
    if hair is not None or cloth is not None:
        hm = magenta_mask(hair) if hair is not None else np.zeros_like(alpha)
        cm = magenta_mask(cloth) if cloth is not None else np.zeros_like(alpha)
        # geometric envelope: fabric near the spine barely moves, far from it (sleeves, ribbons, hems) it sways
        xx = np.arange(W)[None, :].repeat(H, 0); yy = np.arange(H)[:, None].repeat(W, 1)
        cx = (bbox[0] + bbox[2]) / 2; side = np.clip((np.abs(xx - cx) / (bw / 2) - 0.12) / 0.6, 0, 1); hh = np.clip(1 - (yy - bbox[1]) / bh, 0, 1)
        env = 0.15 + 0.85 * side; hem = np.clip((0.14 - hh) / 0.14, 0, 1) * np.clip((np.abs(xx - cx) / (bw / 2) - 0.1) / 0.5, 0, 1)
        wmask = np.clip((cm / 255.0) * np.maximum(env, hem * 0.9) + (hm / 255.0) * (0.25 + 0.55 * side), 0, 1)
        wmask = cv2.GaussianBlur(wmask.astype(np.float32), (0, 0), 6)
        wimg = np.zeros((H, W, 3), np.uint8); wimg[..., 0] = (wmask * 255).astype(np.uint8); wimg[..., 1] = hm
        small = cv2.resize(wimg, (W // 4, H // 4), interpolation=cv2.INTER_AREA)
        Image.fromarray(small).save(os.path.join(out_dir, "weights.png"), optimize=True)
        weights_file = rel("weights.png")
        dbg[..., 2] = np.maximum(dbg[..., 2], (wmask * 255).astype(np.uint8))

    # ---------- measurements ----------
    ally = eid.startswith("npc.") and (e.get("role") == "protagonist" or e.get("dao_companion", {}).get("eligible"))
    prompt = (e.get("art", {}).get("battle") or {}).get("prompt", "")
    facing = 1 if ally else 0 if "toward the viewer" in prompt or "front view" in prompt else -1
    look = LOOKS.get(f) or LOOKS.get(f.rsplit(".", 1)[0] + ".webp")   # recorded from the sprite itself (tools/art/facing.json) wins
    if look: facing = {"left": -1, "right": 1, "front": 0}[look]
    kind = e.get("kind"); arch = "humanoid" if weapon else ("humanoid_unarmed" if not creature else "quadruped")
    if e.get("phases") or kind == "boss": arch = "large" if not weapon else "humanoid"
    if "flying" in (e.get("tags") or []) or re.search(r"bird|crane|roc|moth|eagle|phoenix|bat", eid): arch = "flying" if creature else arch
    if re.search(r"serpent|snake|viper|eel|dragon|wyrm", eid) and creature: arch = "serpent"
    if rec.get("arch"): arch = rec["arch"]   # recorded from the sprite (tools/anim/cast.json) wins
    top = bbox[1]
    neck = top + bh * 0.15; chest = top + bh * 0.27; hips = top + bh * 0.52
    if blink: neck = blink["rect"][1] + blink["rect"][3] + bh * 0.07; chest = neck + bh * 0.12
    rig = {"id": eid, "art": art_key(c, eid, key), "body": rel("body.webp"), "size": [W, H], "bbox": bbox, "ground": [round((bbox[0] + bbox[2]) / 2), bbox[3]], "facing": facing,
           "archetype": arch, "mesh": MESH, "hips": round(hips), "chest": round(chest), "neck": round(neck),
           **({"weapon": weapon} if weapon else {}), **({"blink": blink} if blink else {}), **({"weights": weights_file} if weights_file else {})}
    json.dump(rig, open(os.path.join(out_dir, "rig.json"), "w"), indent=1)
    if debug:
        d = os.path.join(ROOT, ".tmp", "anim", name); os.makedirs(d, exist_ok=True)
        cv2.line(dbg, (bbox[0], int(neck)), (bbox[2], int(neck)), (0, 255, 255), 1); cv2.line(dbg, (bbox[0], int(chest)), (bbox[2], int(chest)), (0, 200, 255), 1)
        Image.fromarray(dbg).save(os.path.join(d, "debug.png"))
    print(f"{name}: body ✓  weapon {'✓ pivot ' + str(weapon['pivot']) if weapon else '—'}  blink {blink['rect'] if blink else '—'}  weights {'✓' if weights_file else '—'}  arch {arch} facing {facing}")


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("root"); ap.add_argument("--ids", default="", help="entity ids; `id#art_key` for another art (a beast stage)")
    ap.add_argument("--all", action="store_true", help="every sprite in tools/anim/cast.json whose renders are staged"); ap.add_argument("--debug", action="store_true"); ap.add_argument("--art", default=None)
    a = ap.parse_args(); c = load_content()
    targets = [(x.split("#")[0], x.split("#")[1] if "#" in x else a.art) for x in filter(None, a.ids.split(","))]
    if a.all: targets += [(v["id"], v["art"]) for v in CAST.values() if os.path.isdir(os.path.join(a.root, "IA_anim", rig_name(c, v["id"], v["art"])))]
    failed = []
    for eid, key in targets:
        try: build(a.root, eid, c, a.debug, key)
        except Exception as ex:  # one bad render must not stop a batch of 200
            failed.append(f"{rig_name(c, eid, key)}: {ex}"); print("FAILED", failed[-1])
    if failed: print(f"{len(failed)} failed:\n  " + "\n  ".join(failed))


if __name__ == "__main__":
    main()
