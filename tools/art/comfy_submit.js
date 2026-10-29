// Runs in the browser pane on the owner's PC, at http://127.0.0.1:8188 (ComfyUI's own origin).
// Loads a queue file from ComfyUI's input folder (ia/<name>.json) and queues one Qwen-Image-Edit 2511
// graph per entry. Paste as-is with QUEUE_NAME set; returns {queued, errors}.
// FRONT = true puts the jobs ahead of everything already waiting (fixes and rerolls during a long run).
const QUEUE_NAME = "__QUEUE__";
const FRONT = false;
const MODEL = "qwen_image_edit_2511_fp8_e4m3fn_scaled_lightning_comfyui_4steps_v1.0.safetensors";
const q = await fetch(`/view?filename=${QUEUE_NAME}.json&subfolder=ia&type=input&t=${Date.now()}`).then(r => r.json());
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
let queued = 0; const errors = [];
for (const e of q) {
  const r = await fetch("/prompt", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: graph(e), client_id: "ia-art", front: FRONT, extra_data: { extra_pnginfo: { ia: { entity: e.entity, file: e.file } } } }) });
  if (r.ok) queued++; else errors.push([e.file, (await r.text()).slice(0, 400)]);
}
({ queued, errors: errors.slice(0, 5), total: q.length });
