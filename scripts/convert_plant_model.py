"""
Convert wambugu71/crop_leaf_diseases_vit (ViT-tiny) to ONNX + INT8 quantized
for self-hosted offline inference in the browser via onnxruntime-web.

Output files go to:
  client/public/assets/plant-disease-vit/model_quantized.onnx   (~5-6 MB)
  client/public/assets/plant-disease-vit/config.json
  client/public/assets/plant-disease-vit/class_labels.json

Usage:
  python scripts/convert_plant_model.py
"""

import json, os, shutil
from pathlib import Path

MODEL_ID   = "wambugu71/crop_leaf_diseases_vit"
OUTPUT_DIR = Path("client/public/assets/plant-disease-vit")

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print("==> Loading model from HuggingFace...")
    from transformers import ViTForImageClassification, AutoImageProcessor
    import torch

    model     = ViTForImageClassification.from_pretrained(MODEL_ID)
    processor = AutoImageProcessor.from_pretrained(MODEL_ID)
    model.eval()

    # ── 1. Export to ONNX (float32) ───────────────────────────────────
    print("==> Exporting to ONNX (float32)...")
    dummy = torch.zeros(1, 3, 224, 224)

    onnx_f32_path = OUTPUT_DIR / "model.onnx"
    torch.onnx.export(
        model,
        dummy,
        str(onnx_f32_path),
        input_names=["pixel_values"],
        output_names=["logits"],
        dynamic_axes={"pixel_values": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
        do_constant_folding=True,
    )
    print(f"    Saved: {onnx_f32_path}  ({onnx_f32_path.stat().st_size / 1e6:.1f} MB)")

    # ── 2. INT8 static quantization ───────────────────────────────────
    print("==> Quantizing to INT8...")
    from onnxruntime.quantization import quantize_dynamic, QuantType

    onnx_q8_path = OUTPUT_DIR / "model_quantized.onnx"
    quantize_dynamic(
        str(onnx_f32_path),
        str(onnx_q8_path),
        weight_type=QuantType.QInt8,
    )
    print(f"    Saved: {onnx_q8_path}  ({onnx_q8_path.stat().st_size / 1e6:.1f} MB)")

    # Remove float32 (keep only quantized for serving)
    onnx_f32_path.unlink()

    # ── 3. Write class labels ─────────────────────────────────────────
    print("==> Writing class labels...")
    labels = {str(k): v for k, v in model.config.id2label.items()}
    labels_path = OUTPUT_DIR / "class_labels.json"
    with open(labels_path, "w") as f:
        json.dump(labels, f, indent=2)
    print(f"    Saved: {labels_path}  ({len(labels)} classes)")

    # ── 4. Write preprocessor config ─────────────────────────────────
    proc_config = {
        "image_size": processor.size.get("height", 224),
        "image_mean": list(processor.image_mean),
        "image_std":  list(processor.image_std),
    }
    cfg_path = OUTPUT_DIR / "preprocessor_config.json"
    with open(cfg_path, "w") as f:
        json.dump(proc_config, f, indent=2)
    print(f"    Saved: {cfg_path}")

    print("\n✅ Done! Files in:", OUTPUT_DIR)
    print(f"   Quantized model: {onnx_q8_path.stat().st_size / 1e6:.1f} MB")
    print(f"   Classes: {len(labels)}")

if __name__ == "__main__":
    main()
