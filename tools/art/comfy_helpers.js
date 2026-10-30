// Paste once into the browser pane tab at http://127.0.0.1:8188 (ComfyUI's own origin). Defines helpers that
// survive until the tab reloads; re-paste after a reconnect (the queue itself is lost when ComfyUI restarts,
// finished images stay in output/).
//
//   await iaRun(name, only=null, front=false, reroll=0)  queue input/ia/<name>.json (only: entity ids or prefix starts)
//   await iaOutputs(pattern, n=40)                       recent outputs whose subfolder/filename contains pattern
//   await iaQueue()                                      {running, pending, next: first pending prefixes}
//
// Same graph as comfy_submit.js (Qwen-Image-Edit 2511, Lightning 4 steps). Upload a changed queue or ref under a NEW
// file name: the bridge can hand ComfyUI an earlier copy of a path it has already written.
(() => {
  const MODEL = "qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_comfyui_4steps_v1.0.safetensors";
  function graph(e) {
    const g = {
      "1": { class_type: "UNETLoader", inputs: { unet_name: MODEL, weight_dtype: "default" } },
      "2": { class_type: "ModelSamplingAuraFlow", inputs: { model: ["1", 0], shift: 3.1 } },
      "3": { class_type: "CLIPLoader", inputs: { clip_name: "qwen_2.5_vl_7b_fp8_scaled.safetensors", type: "qwen_image", device: "default" } },
      "4": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
      "6": { class_type: "TextEncodeQwenImageEditPlus", inputs: { clip: ["3", 0], vae: ["4", 0], prompt: e.prompt } },
      "7": { class_type: "TextEncodeQwenImageEditPlus", inputs: { clip: ["3", 0], vae: ["4", 0], prompt: "" } },
      "8": { class_type: "EmptySD3LatentImage", inputs: { width: e.w, height: e.h, batch_size: 1 } },
      "9": { class_type: "KSampler", inputs: { model: ["2", 0], positive: ["6", 0], negative: ["7", 0], latent_image: ["8", 0],
             seed: e.seed, steps: 4, cfg: 1.0, sampler_name: "euler", scheduler: "simple", denoise: 1.0 } },
      "10": { class_type: "VAEDecode", inputs: { samples: ["9", 0], vae: ["4", 0] } },
      "12": { class_type: "SaveImage", inputs: { images: ["10", 0], filename_prefix: e.prefix } },
    };
    if (e.ref) {
      g["5"] = { class_type: "LoadImage", inputs: { image: e.ref } };
      g["6"].inputs.image1 = ["5", 0];
      g["7"].inputs.image1 = ["5", 0];
    }
    if (e.transparent) {
      g["11"] = { class_type: "RMBG", inputs: { image: ["10", 0], model: "RMBG-2.0", sensitivity: 1, process_res: 1024, mask_blur: 0, mask_offset: 0,
                  invert_output: false, refine_foreground: true, unload_model: false, background: "Alpha", background_color: "#222222" } };
      g["12"].inputs.images = ["11", 0];
    }
    return g;
  }
  window.iaRun = async (name, only = null, front = false, reroll = 0) => {
    const q = await fetch(`/view?filename=${name}.json&subfolder=ia&type=input&t=${Date.now()}`).then((r) => r.json());
    const pick = (e) => !only || only.some((o) => e.entity === o || e.prefix.startsWith(o));
    let queued = 0; const errors = [];
    for (const e0 of q.filter(pick)) {
      const e = reroll ? { ...e0, seed: (e0.seed + reroll * 7919) % 4294967296, prefix: `${e0.prefix}_r${reroll}` } : e0;
      const r = await fetch("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: graph(e), client_id: "ia-art", front, extra_data: { extra_pnginfo: { ia: { entity: e.entity, file: e.file } } } }) });
      if (r.ok) queued++; else errors.push([e.prefix, (await r.text()).slice(0, 300)]);
    }
    return { queued, errors: errors.slice(0, 5), total: q.length };
  };
  window.iaOutputs = async (pattern, n = 40) => {
    const h = await fetch("/history?max_items=5000").then((r) => r.json());
    const out = [];
    for (const v of Object.values(h)) for (const o of Object.values(v.outputs || {})) for (const im of o.images || []) {
      const f = `${im.subfolder}/${im.filename}`; if (f.includes(pattern)) out.push(f);
    }
    return out.slice(-n);
  };
  window.iaQueue = async () => {
    const q = await fetch("/queue").then((r) => r.json());
    const pre = (p) => Object.values(p[2]).find((n) => n.class_type === "SaveImage")?.inputs.filename_prefix;
    return { running: q.queue_running.map(pre), pending: q.queue_pending.length, next: q.queue_pending.slice(0, 3).map(pre) };
  };
  return "ia helpers ready";
})();
