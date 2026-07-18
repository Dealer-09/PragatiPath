# PragatiPath — Plant Disease AI: How It Works

> **Current System (V2):** Dual-engine architecture. **Primary:** Gemini Vision (requires BYOK key). **Fallback:** MobileNetV3-Large trained on a 128-class unified dataset (PlantVillage + PlantDoc + BD), running entirely offline via LiteRT WebGPU.

---

## ⚡ The Clever Hans Problem (V1 Iteration)

Our initial **V1 Model** (a Vision Transformer / ViT-tiny trained solely on the PlantVillage dataset) suffered from a catastrophic failure known as the **"Clever Hans" effect**. 

The PlantVillage dataset primarily consists of leaves photographed on perfectly flat, solid-color backgrounds in a laboratory setting. When we tested the V1 model on real-world smartphone photos containing dirt, grass, or human fingers in the background, the model **hallucinated**. It had learned to predict diseases based on the background lighting and color rather than the microscopic texture of the leaf itself.

---

## 🧬 Building the "Beast" Model (V2 Iteration)

To cure the Clever Hans bias, we threw out the V1 architecture and completely re-engineered the ML pipeline. We trained a new model across multiple Kaggle T4 GPUs using a 3-Dataset Fusion strategy:

1. **PlantVillage:** (High volume, clean lab data)
2. **PlantDoc:** (Noisy, real-world smartphone photos with messy backgrounds)
3. **Bangladesh Crop Dataset:** (Localized South-Asian crop varieties)

### Solving "Label Collision"
Merging 3 disparate datasets normally corrupts the neural network because of "Label Collisions" (e.g., ID 5 means "Apple Rust" in Dataset A, but "Tomato Blight" in Dataset B). We wrote a Python ETL pipeline that recursively parsed all 3 HuggingFace repositories and automatically built a mathematically perfect **128-Class Master Dictionary** (`master_dict.json`) to unify the tensors.

### The Architecture: MobileNetV3
We migrated from ViT-tiny to **MobileNetV3-Large**. While ViT is powerful, MobileNet is inherently designed for mobile devices. The final output layer uses `activation="softmax"` baked in at training time, so inference output values are true probabilities (0.0–1.0), not raw logits. We compiled the model specifically for **WebGPU inference** by mathematically locking the tensor batch size to `1` and preserving pure `Float32` precision.

---

## ⚙️ The Actual Branching Logic (Gemini vs Offline)

> **Important:** The choice between Gemini Vision and the offline model is a **hard binary branch** based solely on whether the user has set a Gemini API key. It is NOT an automated cascade based on confidence scores.

```text
User uploads leaf photo
        ↓
analyzeImage() checks: does localStorage have 'gemini_api_key'?
        ↓
    ┌───────────────────┬───────────────────────┐
    │ YES (key exists)  │ NO (no key)           │
    ↓                   ↓
Gemini Vision path  Offline MobileNet path
(server-side)       (browser-side, no network)
    ↓                   ↓
Returns structured  Returns top-5 predictions
diagnosis JSON      with softmax confidences
    ↓                   ↓
If Gemini errors →  If top confidence < 60% →
shows error, does   shows UI hint suggesting
NOT auto-switch     user set a Gemini key
to offline model    (no auto-escalation)
```

**The "Low Confidence" message** at the end of the offline path is purely UI text — it suggests the user manually set a Gemini key. There is no automated escalation between modes.

---

## ⚙️ Offline Runtime Cascade (within the Offline path)

When no API key is set, LiteRT.js handles runtime selection internally:

```text
User uploads leaf (no API key set)
       ↓
PlantAI.predict() initializes liteRtModule
       ↓
┌────────────────────────────────────────────────────────────┐
│ 1. Primary Runtime: WebGPU Accelerator                     │
│    Executes model.tflite via native GPU shards.            │
│    Latency: ~30ms (Chrome 113+, Edge)                      │
└────────────────────────────────────────────────────────────┘
       ↓ (If WebGPU is unsupported or crashes)
┌────────────────────────────────────────────────────────────┐
│ 2. Fallback Runtime: WASM CPU                              │
│    Runs purely on CPU threads via WebAssembly.             │
│    Latency: ~120ms (Universally compatible)                │
└────────────────────────────────────────────────────────────┘
       ↓
Outputs 128-class softmax probabilities (baked into model)
```

## 🗂 File Placement

```text
PragatiPath/
└── client/public/assets/plant-disease-mobilenet/
    ├── model.tflite              ← Primary Offline model (12.4 MB, Float32)
    ├── class_labels.json         ← 128-class unified mapping
    ├── infer.js                  ← The cascade logic script
```

---

## 🚀 The Hybrid Deployment Strategy

The fundamental trade-off of AI is that **Offline Models are bounded** by their training data. Our 128-class MobileNet is blazing fast and free, but if a farmer uploads a crop not in our dataset (like a Cucumber), it is mathematically forced to guess incorrectly or throw a Low Confidence warning.

To solve this, PragatiPath uses a **Hybrid Architecture**:

1. **Primary (Gemini Vision):** If the user has a Gemini API key configured, every scan goes to Gemini 2.5 Flash. It has an infinite vocabulary, can identify virtually any plant disease, and outputs structured treatment/prevention advice.
2. **Fallback (Offline MobileNet):** If no key is set, the browser runs the `.tflite` model locally via LiteRT.js. Zero internet required, instant inference, fully private.

The user bridges these modes **manually** — the UI shows a prompt suggesting they configure a Gemini key if the offline model returns low confidence.

---

## 🛠 Future Roadmap (V3 Improvements)

To push the offline model even closer to Gemini's accuracy, future iterations can implement:

1. **Vocabulary Expansion:** Ingest more diverse datasets (e.g., iNaturalist, specialized pest datasets) and map them into the `master_dict.json` to push the boundary from 128 classes to 300+ classes.
2. **Heavier Architectures:** Upgrade the Kaggle script from MobileNetV3 to **EfficientNetB3** or **ResNet50**. This trades file size (12MB → 50MB) and latency for much deeper visual reasoning.
3. **Aggressive Data Augmentation:** Introduce `RandomRotation` and `RandomZoom` layers during the Kaggle training loop to artificially simulate strange smartphone camera angles and harsh sunlight.
4. **YOLO Object Detection:** Instead of full-image classification, train a YOLOv8 model to strictly draw bounding boxes over the diseased spots, completely bypassing background noise entirely.
5. **Auto-escalation on Low Confidence:** If the offline model confidence < 60% AND a Gemini key exists, automatically re-run the scan via Gemini Vision without requiring the user to manually re-upload.