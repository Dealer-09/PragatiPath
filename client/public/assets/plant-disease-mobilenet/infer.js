/**
 * Plant Disease Inference — LiteRT.js
 *
 * Strategy:
 *   1. LiteRT.js  → model.tflite  → WebGPU / WASM  (fastest, native C++ runtime)
 *
 * Model files at /public/assets/plant-disease-mobilenet/
 * LiteRT WASM  at /public/assets/litert-wasm/
 */

const PlantAI = (() => {
    const BASE = '/public/assets/plant-disease-mobilenet';
    const WASM = '/public/assets/litert-wasm/';

    let compiledModel = null;
    let labels       = null;
    let prepConf     = null;
    let backend      = null; // 'litert-webgpu' | 'litert-wasm'
    let loadPromise  = null;
    let liteRtModule = null;

    async function loadMeta() {
        if (labels) return;
        const lRes = await fetch(`${BASE}/class_labels.json`);
        labels = await lRes.json();
    }

    async function tfliteExists() {
        try {
            const r = await fetch(`${BASE}/model.tflite`, { method: 'HEAD' });
            return r.ok;
        } catch { return false; }
    }

    async function loadLiteRT(onProgress) {
        try {
            onProgress?.('Initialising LiteRT.js runtime...');
            if (!liteRtModule) {
                liteRtModule = await import('/public/assets/litert-wasm/litert-core.js');
            }
            const { loadLiteRt, loadAndCompile, isWebGPUSupported } = liteRtModule;

            await loadLiteRt(WASM);

            const useGPU = isWebGPUSupported?.() ?? (typeof navigator !== 'undefined' && !!navigator.gpu);
            let accelerator = useGPU ? 'webgpu' : 'wasm';

            onProgress?.(`Loading MobileNetV3-Large (${accelerator.toUpperCase()})...`);

            const hasSAB = typeof SharedArrayBuffer !== 'undefined';
            const numThreads = hasSAB && navigator?.hardwareConcurrency
                ? Math.min(navigator.hardwareConcurrency, 4)
                : 1;

            try {
                compiledModel = await loadAndCompile(`${BASE}/model.tflite`, {
                    accelerator,
                    cpuOptions:  { numThreads },
                    gpuOptions:  { precision: 'fp32' },
                });
            } catch (firstErr) {
                if (accelerator === 'webgpu') {
                    console.warn('[PlantAI] WebGPU failed, falling back to CPU (WASM)...', firstErr.message);
                    accelerator = 'wasm';
                    onProgress?.(`Loading model (WASM CPU)...`);
                    compiledModel = await loadAndCompile(`${BASE}/model.tflite`, {
                        accelerator,
                        cpuOptions:  { numThreads }
                    });
                } else {
                    throw firstErr;
                }
            }
            
            backend = accelerator === 'webgpu' ? 'litert-webgpu' : 'litert-wasm';
            return true;
        } catch (e) {
            console.error('[PlantAI] LiteRT.js failed:', e);
            throw new Error(`LiteRT failed: ${e.message}`);
        }
    }

    async function load(onProgress) {
        if (compiledModel) return true;
        if (loadPromise) return loadPromise;

        loadPromise = (async () => {
            await loadMeta();
            const hasTflite = await tfliteExists();
            if (!hasTflite) throw new Error("model.tflite not found on server.");
            await loadLiteRT(onProgress);
            return true;
        })().catch(e => {
            loadPromise = null;
            throw e;
        });

        return loadPromise;
    }

    function preprocess(imageElement) {
        // MobileNetV3 uses standard ImageNet mean/std
        const image_size = 224;
        const image_mean = [0.485, 0.456, 0.406];
        const image_std  = [0.229, 0.224, 0.225];

        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = image_size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, image_size, image_size);
        const raw = ctx.getImageData(0, 0, image_size, image_size).data;

        const numPixels = image_size * image_size;
        const tensor = new Float32Array(3 * numPixels);
        
        for (let i = 0; i < numPixels; i++) {
            tensor[i * 3]     = (raw[i * 4]     / 255 - image_mean[0]) / image_std[0]; // R
            tensor[i * 3 + 1] = (raw[i * 4 + 1] / 255 - image_mean[1]) / image_std[1]; // G
            tensor[i * 3 + 2] = (raw[i * 4 + 2] / 255 - image_mean[2]) / image_std[2]; // B
        }
        
        return { data: tensor, shape: [1, image_size, image_size, 3] };
    }

    async function predict(imageElement, onProgress) {
        await load(onProgress);
        if (!compiledModel) throw new Error('Model failed to load');

        const t0 = performance.now();
        const { data: tensorData, shape } = preprocess(imageElement);
        let logits;

        const { Tensor } = liteRtModule;
        const inputTensor = new Tensor(tensorData, Int32Array.from(shape));
        const outputs = await compiledModel.run([inputTensor]);
        const rawLogits = await outputs[0].data();
        logits = Array.from(rawLogits);

        for (const t of outputs) t.delete();
        inputTensor.delete();

        const inferMs = (performance.now() - t0).toFixed(0);
        
        // The MobileNetV3 model from Kaggle script outputs softmax probabilities
        const probs = logits;

        const top5 = Array.from(probs)
            .map((p, i) => ({ label: labels[String(i)] || `class_${i}`, confidence: p }))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

        return { top5, backend, inferMs };
    }

    function getBackend() { return backend; }

    return { load, predict, getBackend };
})();
