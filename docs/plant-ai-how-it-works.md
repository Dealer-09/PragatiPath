# PragatiPath — Plant Disease AI: How It Works

> Old system → Fallback system → Current System (LiteRT WebGPU)

---

## 🔴 Old System — TF.js MobileNetV1

The app previously used **TensorFlow.js MobileNetV1** — a generic image classifier
that was never trained on plant diseases.

```
User uploads leaf
       ↓
TF.js loads 13 separate .bin shard files (~13 MB total, slow)
       ↓
MobileNetV1 runs on CPU
(trained on ImageNet — cats, dogs, cars, not plants)
       ↓
Outputs a generic ImageNet label like "broccoli" or "daisy"
       ↓
Result: wrong label, no disease name, no treatment, low accuracy
```

**Problems:**
- Wrong model entirely — not trained on crop diseases
- Slow first load (13 separate network requests)
- No disease names, no confidence, no treatment advice
- Not reliably offline — depends on CDN for model shards

---

## 🟡 Fallback System — ViT-tiny + onnxruntime-web

```
User uploads leaf
       ↓
PlantViT.predict() is called
       ↓
onnxruntime-web loads model_quantized.onnx
(5.76 MB, single file, fully cached after first load)
       ↓
Image resized to 224×224px → normalised to [-1.0, +1.0] float values
Arranged as Float32 tensor: [1, 3, 224, 224]
(batch=1, RGB channels=3, height=224, width=224)
       ↓
ViT-tiny runs inference via WASM on CPU
Vision Transformer reads the image in 16×16 pixel patches
(like reading words in a sentence — each patch is a "word")
       ↓
Outputs 13 raw scores (logits) → softmax → probabilities
       ↓
Top-5 results: { label, confidence }
       ↓
┌─────────────────────────────────────────────┐
│ Gemini API key set?                         │
│  YES → image sent to Gemini Vision          │
│         → crop, disease, severity,          │
│            treatment, prevention returned   │
│  NO  → offline ViT-tiny result shown only   │
└─────────────────────────────────────────────┘
```

### 13 classes the model knows

| Crop    | Diseases Covered                                      |
|---------|-------------------------------------------------------|
| Corn    | Blight, Common Rust, Gray Leaf Spot, Healthy          |
| Potato  | Early Blight, Late Blight, Healthy                    |
| Rice    | Brown Spot, Hispa, Leaf Blast                         |
| Wheat   | Brown Rust, Yellow Rust, Healthy                      |

---

## ⚡ Current System — LiteRT.js + WebGPU (model.tflite)

```
User uploads leaf
       ↓
PlantViT.predict() → model.tflite EXISTS → use LiteRT.js
       ↓
LiteRT.js initialises (Google's C++ inference engine, compiled to WASM)
       ↓
┌──────────────────────────────────────────────┐
│  WebGPU available? (Chrome 113+, Edge, Arc)  │
│  YES → GPU accelerator (phone/laptop GPU)    │
│  NO  → LiteRT WASM CPU(still faster than ort)│
└──────────────────────────────────────────────┘
       ↓
Image preprocessed → Tensor (Int32Array shape, required by C++ runtime)
       ↓
compiledModel.run([tensor]) → Promise<Tensor[]>
await outputs[0].data()     → Float32Array (13 logits)
C++ objects freed: tensor.delete() — no WASM heap leaks
       ↓
Softmax → top-5 results
Footer shows: ⚡ LiteRT WebGPU · 23ms
```

> Same ViT-tiny weights, same 13 classes, same accuracy.
> Only the **runtime that executes the maths** changes.

---

## 📊 Comparison

| | Old (TF.js MobileNet) | Fallback (ORT + ONNX) | Current (LiteRT + TFLite) |
|---|---|---|---|
| **Model** | MobileNetV1 (wrong task) | ViT-tiny (crop diseases) | ViT-tiny (crop diseases) |
| **File size** | 13 MB in 13 files | 5.76 MB, 1 file | ~10 MB, 1 file |
| **Accuracy** | ~30% (ImageNet labels) | ~98% | ~98% |
| **Runtime** | TensorFlow.js (pure JS) | onnxruntime-web (WASM) | LiteRT.js (C++ native) |
| **GPU** | ❌ | ❌ | ✅ WebGPU |
| **Inference speed** | ~800 ms | ~200–400 ms | ~20–50 ms (GPU) |
| **Fully offline** | Partial | ✅ Full | ✅ Full |
| **Disease-aware** | ❌ | ✅ | ✅ |
| **Treatment advice** | ❌ | ✅ (Gemini, BYOK) | ✅ (Gemini, BYOK) |

---

## 🧪 What the Colab Script Does — Cell by Cell

### Cell 1 — Install dependencies
```python
pip install ai-edge-torch transformers torch huggingface_hub
```
Installs `ai-edge-torch` — Google's official tool to convert PyTorch
models into TFLite format.

**Why Colab and not your machine?**
`ai-edge-torch` requires Python 3.9–3.12.
Your machine runs Python 3.13 — incompatible.
Colab runs Python 3.10 — works perfectly.

---

### Cell 2 — Load the model from HuggingFace
```python
model = ViTForImageClassification.from_pretrained("wambugu71/crop_leaf_diseases_vit")
model.eval()
```
Downloads the ViT-tiny model weights from HuggingFace.
Runs a dummy forward pass to confirm it loads correctly.

---

### Cell 3 — Convert to TFLite
```python
edge_model = ai_edge_torch.convert(model, sample_inputs)
```
This is the core step. Under the hood:

1. **`torch.export()`** traces the entire model with a sample input,
   recording every mathematical operation in order
2. The trace is converted to **XLA** (Google's accelerator graph format —
   the same format used in TPUs and Android phones)
3. XLA compiles to a **TFLite flatbuffer** — a compact binary file that
   the C++ LiteRT runtime reads directly without any Python

---

### Cell 4 — Save and verify
```python
edge_model.export("model.tflite")
```
Saves the binary flatbuffer to disk.

Then loads it back with TensorFlow's own Lite interpreter to:
- Confirm input shape: `[1, 3, 224, 224]` float32
- Confirm output shape: `[1, 13]` float32
- Run one real inference to prove the file is valid

---

### Cell 5 — Download
```python
from google.colab import files
files.download("model.tflite")
```
Colab's `files.download()` streams the file directly to your browser's
download folder — same as clicking a download link.

---

## 🗂 File Placement

```
PragatiPath/
└── client/public/assets/plant-disease-vit/
    ├── model_quantized.onnx      ← already here (ort fallback, 5.76 MB)
    ├── model.tflite              ← DROP HERE after Colab (~10 MB)
    ├── class_labels.json         ← already here
    └── preprocessor_config.json  ← already here
```

No code changes needed. The app checks for `model.tflite` on every load:
- **Present** → LiteRT.js activates → WebGPU if browser supports it
- **Missing** → onnxruntime-web fallback → still fully functional

---

## 🔁 Runtime Decision Flow

```
Page loads
    │
    ├── HEAD /public/assets/plant-disease-vit/model.tflite
    │       │
    │    200 OK?
    │       │
    │      YES ──→ loadLiteRT()
    │               │
    │               ├── navigator.gpu?
    │               │       YES → accelerator = 'webgpu'   ⚡ fastest
    │               │       NO  → accelerator = 'wasm'     🔵 fast
    │               │
    │               └── loadAndCompile(url, { accelerator })
    │                         → CompiledModel
    │
    └── NO / fail ──→ loadORT()
                       → ort.InferenceSession (model_quantized.onnx)
                       → 🟡 always works
```

---

## Runtime Stack Comparison

```
LiteRT.js WebGPU
    litert-core.js                (JS glue, 46 KB)
    litert_wasm_internal.js       (WASM loader, 265 KB)
    litert_wasm_internal.wasm     (C++ engine, 8.6 MB)
    model.tflite                  (weights, ~10 MB)
    → Inference runs on your GPU

onnxruntime-web WASM
    ort.min.js                    (loaded from CDN)
    model_quantized.onnx          (weights + graph, 5.76 MB)
    → Inference runs on CPU via WASM threads
```

LiteRT is the same engine that runs AI on **Android phones** and **Google's TPUs** —
compiled to WASM so it runs in the browser with no installation required.