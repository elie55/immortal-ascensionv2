// Runs in the browser pane on the owner's PC at http://127.0.0.1:8188. Packs finished renders into one zip
// (each image downscaled to ≤1088 px and re-encoded as WebP q0.95, alpha kept) and uploads it to
// ComfyUI-Shared/input/ia_batch/<name>.zip, so a single file transfer brings a whole batch into the workspace.
// Usage: paste, then `await iaPack(files, "batch02")` where files are output paths like "IA\\enemies\\x_00001_.png"
// (see /history). Then: python3 tools/art/collect.py <staged zip>.
window.iaPack = async (files, name, maxSide = 1088) => {
  const crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = crcT[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0; let count = 0; const fails = [];
  for (const f of files) {
    try {
      const i = f.lastIndexOf("\\"); const sub = f.slice(0, i), fn = f.slice(i + 1);
      const blob = await fetch(`/view?filename=${encodeURIComponent(fn)}&subfolder=${encodeURIComponent(sub)}&type=output`).then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); });
      const bmp = await createImageBitmap(blob);
      const sc = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      const cv = new OffscreenCanvas(Math.round(bmp.width * sc), Math.round(bmp.height * sc));
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const webp = new Uint8Array(await (await cv.convertToBlob({ type: "image/webp", quality: 0.95 })).arrayBuffer());
      const path = enc.encode(f.replace(/\\/g, "/").replace(/\.png$/, ".webp"));
      const crc = crc32(webp);
      const lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint32(14, crc, true); lh.setUint32(18, webp.length, true); lh.setUint32(22, webp.length, true); lh.setUint16(26, path.length, true);
      parts.push(new Uint8Array(lh.buffer), path, webp);
      const ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint32(16, crc, true); ch.setUint32(20, webp.length, true); ch.setUint32(24, webp.length, true); ch.setUint16(28, path.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), path);
      offset += 30 + path.length + webp.length; count++;
    } catch (e) { fails.push(f + ": " + e); }
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const zip = new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  const fd = new FormData(); fd.append("image", new File([zip], name + ".zip")); fd.append("subfolder", "ia_batch"); fd.append("type", "input"); fd.append("overwrite", "true");
  const r = await fetch("/upload/image", { method: "POST", body: fd });
  return { count, fails: fails.slice(0, 5), bytes: zip.size, status: r.status };
};
