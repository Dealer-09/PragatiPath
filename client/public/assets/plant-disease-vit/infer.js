/**
 * Plant Disease ViT Offline Inference
 * Uses onnxruntime-web with the self-hosted quantized INT8 ViT-tiny model
 * (wambugu71/crop_leaf_diseases_vit, converted via scripts/convert_plant_model.py)
 *
 * Model files expected at:
 *   /public/assets/plant-disease-vit/model_quantized.onnx
 *   /public/assets/plant-disease-vit/class_labels.json
 *   /public/assets/plant-disease-vit/preprocessor_config.json
 */

const PlantViT = (() => {
    let session   = null;
    let labels    = null;
    let prepConf  = null;
    let loading   = false;

    // ─── Load model (lazy, once) ─────────────────────────────────────
    async function load(onProgress) {
        if (session) return true;
        if (loading)  return false;
        loading = true;

        try {
            onProgress?.('Loading class labels...');
            const [labelsRes, prepRes] = await Promise.all([
                fetch('/public/assets/plant-disease-vit/class_labels.json'),
                fetch('/public/assets/plant-disease-vit/preprocessor_config.json'),
            ]);
            labels   = await labelsRes.json();
            prepConf = await prepRes.json();

            onProgress?.('Loading offline model (first time only)...');
            // ort is loaded via script tag in dashboard.html
            session = await ort.InferenceSession.create(
                '/public/assets/plant-disease-vit/model_quantized.onnx',
                { executionProviders: ['wasm'] }
            );

            loading = false;
            return true;
        } catch (e) {
            loading = false;
            console.error('[PlantViT] load failed:', e);
            return false;
        }
    }

    // ─── Preprocess image to float32 tensor [1, 3, 224, 224] ─────────
    function preprocess(imageElement) {
        const { image_size = 224, image_mean = [0.5, 0.5, 0.5], image_std = [0.5, 0.5, 0.5] } = prepConf || {};

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = image_size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, image_size, image_size);

        const { data } = ctx.getImageData(0, 0, image_size, image_size);
        const tensor   = new Float32Array(3 * image_size * image_size);

        for (let i = 0; i < image_size * image_size; i++) {
            const r = data[i * 4]     / 255;
            const g = data[i * 4 + 1] / 255;
            const b = data[i * 4 + 2] / 255;
            // CHW layout (channels first), normalise
            tensor[i]                           = (r - image_mean[0]) / image_std[0];
            tensor[image_size * image_size + i] = (g - image_mean[1]) / image_std[1];
            tensor[2 * image_size * image_size + i] = (b - image_mean[2]) / image_std[2];
        }

        return new ort.Tensor('float32', tensor, [1, 3, image_size, image_size]);
    }

    // ─── Softmax helper ──────────────────────────────────────────────
    function softmax(arr) {
        const max = Math.max(...arr);
        const exps = arr.map(v => Math.exp(v - max));
        const sum  = exps.reduce((a, b) => a + b, 0);
        return exps.map(v => v / sum);
    }

    // ─── Run inference ────────────────────────────────────────────────
    async function predict(imageElement, onProgress) {
        const loaded = await load(onProgress);
        if (!loaded) throw new Error('Model failed to load');

        const inputTensor = preprocess(imageElement);
        const feeds  = { pixel_values: inputTensor };
        const output = await session.run(feeds);

        // Get logits — ViT output key is typically 'logits'
        const logitsKey = Object.keys(output)[0];
        const logits    = Array.from(output[logitsKey].data);
        const probs     = softmax(logits);

        // Top-5
        const indexed = probs.map((p, i) => ({ idx: i, prob: p }));
        indexed.sort((a, b) => b.prob - a.prob);
        const top5 = indexed.slice(0, 5).map(({ idx, prob }) => ({
            label:      labels[String(idx)] || `class_${idx}`,
            confidence: prob,
        }));

        return top5;
    }

    return { load, predict };
})();
