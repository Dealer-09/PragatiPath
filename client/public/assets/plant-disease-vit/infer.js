/**
 * Plant Disease Inference — LiteRT.js + onnxruntime-web
 *
 * Strategy (best available, auto-detected):
 *   1. LiteRT.js  → model.tflite  → WebGPU / WASM  (fastest, native C++ runtime)
 *   2. onnxruntime-web → model_quantized.onnx → WASM (fallback, always works)
 *
 * Model files at /public/assets/plant-disease-vit/
 * LiteRT WASM  at /public/assets/litert-wasm/
 *
 * To generate model.tflite: scripts/convert_plant_model_tflite.py (Python 3.9-3.12)
 *
 * API audit: @litertjs/core@2.5.2
 *   CompiledModel.run(Tensor | Tensor[])   → Promise<Tensor[]>
 *   CompiledModel.run(Record<string,Tensor>) → Promise<Record<string,Tensor>>
 *   Tensor.data()                           → Promise<TypedArray>  (ASYNC!)
 *   loadAndCompile(url|Uint8Array, opts)    → Promise<CompiledModel>
 *   accelerator: 'webgpu' | 'wasm'  (no 'webnn' in v2.5.2)
 *   CompileOptions.cpuOptions.numThreads    → parallelism for WASM path
 */

const PlantViT = (() => {
    const BASE = '/public/assets/plant-disease-vit';
    const WASM = '/public/assets/litert-wasm/';

    let compiledModel = null; // LiteRT CompiledModel
    let ortSession   = null; // ort.InferenceSession
    let labels       = null;
    let prepConf     = null;
    let backend      = null; // 'litert-webgpu' | 'litert-wasm' | 'ort'
    let loadPromise  = null; // single in-flight load promise
    let liteRtModule = null; // cached litert ESM import (avoid repeated dynamic import overhead)

    // ─── Load labels + preprocessor config ──────────────────────────
    async function loadMeta() {
        if (labels) return;
        const [lRes, pRes] = await Promise.all([
            fetch(`${BASE}/class_labels.json`),
            fetch(`${BASE}/preprocessor_config.json`),
        ]);
        labels   = await lRes.json();
        prepConf = await pRes.json();
    }

    // ─── Check if TFLite model file is available ─────────────────────
    async function tfliteExists() {
        try {
            const r = await fetch(`${BASE}/model.tflite`, { method: 'HEAD' });
            return r.ok;
        } catch { return false; }
    }

    // ─── Load with LiteRT.js (correct API usage) ──────────────────────
    async function loadLiteRT(onProgress) {
        try {
            onProgress?.('Initialising LiteRT.js runtime...');

            // Cache the ESM module — avoid repeated dynamic import overhead per predict() call
            if (!liteRtModule) {
                liteRtModule = await import('/public/assets/litert-wasm/litert-core.js');
            }
            const { loadLiteRt, loadAndCompile, isWebGPUSupported } = liteRtModule;

            // Init WASM module — auto-selects best .wasm variant from the directory
            await loadLiteRt(WASM);

            // Detect accelerator — v2.5.2 supports 'webgpu' | 'wasm' only
            const useGPU = isWebGPUSupported?.() ?? (typeof navigator !== 'undefined' && !!navigator.gpu);
            const accelerator = useGPU ? 'webgpu' : 'wasm';

            onProgress?.(`Loading model via LiteRT (${accelerator.toUpperCase()})...`);

            const numThreads = navigator?.hardwareConcurrency
                ? Math.min(navigator.hardwareConcurrency, 4)
                : 2;

            // loadAndCompile accepts a URL string directly — no manual fetch needed
            compiledModel = await loadAndCompile(`${BASE}/model.tflite`, {
                accelerator,
                cpuOptions:  { numThreads },
                gpuOptions:  { precision: 'fp32' },
            });

            if (accelerator === 'webgpu' && !compiledModel.isFullyAccelerated) {
                console.warn('[PlantViT] LiteRT: model not fully GPU-accelerated, some ops on CPU');
            }

            backend = accelerator === 'webgpu' ? 'litert-webgpu' : 'litert-wasm';
            return true;
        } catch (e) {
            console.warn('[PlantViT] LiteRT.js failed, falling back to onnxruntime-web:', e.message);
            compiledModel = null;
            backend = null;
            return false;
        }
    }

    // ─── Load with onnxruntime-web (reliable WASM fallback) ──────────
    async function loadORT(onProgress) {
        onProgress?.('Loading offline model (onnxruntime-web WASM)...');
        if (typeof ort === 'undefined') throw new Error('onnxruntime-web not loaded');

        // Use all available logical cores for WASM threading
        const numThreads = navigator?.hardwareConcurrency
            ? Math.min(navigator.hardwareConcurrency, 4)
            : 2;

        ortSession = await ort.InferenceSession.create(
            `${BASE}/model_quantized.onnx`,
            {
                executionProviders: ['wasm'],
                executionMode: 'parallel',
                graphOptimizationLevel: 'all',
                extra: { session: { intra_op_num_threads: String(numThreads) } }
            }
        );
        backend = 'ort';
        return true;
    }

    // ─── Main load — lazy, singleton, concurrent-safe ────────────────
    async function load(onProgress) {
        if (compiledModel || ortSession) return true;
        // Prevent multiple concurrent loads
        if (loadPromise) return loadPromise;

        loadPromise = (async () => {
            await loadMeta();
            const hasTflite = await tfliteExists();
            if (hasTflite) {
                const ok = await loadLiteRT(onProgress);
                if (ok) return true;
            }
            await loadORT(onProgress);
            return true;
        })().catch(e => {
            loadPromise = null;
            throw e;
        });

        return loadPromise;
    }

    // ─── Preprocess: image → CHW Float32 [1, 3, 224, 224] ───────────
    function preprocess(imageElement) {
        const {
            image_size = 224,
            image_mean = [0.5, 0.5, 0.5],
            image_std  = [0.5, 0.5, 0.5]
        } = prepConf || {};

        const size = image_size;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imageElement, 0, 0, size, size);
        const raw = ctx.getImageData(0, 0, size, size).data;

        const numPixels = size * size;
        const tensor = new Float32Array(3 * numPixels);
        for (let i = 0; i < numPixels; i++) {
            tensor[i]              = (raw[i * 4]     / 255 - image_mean[0]) / image_std[0]; // R
            tensor[numPixels + i]  = (raw[i * 4 + 1] / 255 - image_mean[1]) / image_std[1]; // G
            tensor[2*numPixels + i]= (raw[i * 4 + 2] / 255 - image_mean[2]) / image_std[2]; // B
        }
        // Shape as plain number[] — ort.Tensor requires number[], LiteRT accepts both
        return { data: tensor, shape: [1, 3, size, size] };
    }

    // ─── Numerically stable softmax ───────────────────────────────────
    function softmax(arr) {
        let max = -Infinity;
        for (let i = 0; i < arr.length; i++) if (arr[i] > max) max = arr[i];
        let sum = 0;
        const exps = new Float32Array(arr.length);
        for (let i = 0; i < arr.length; i++) { exps[i] = Math.exp(arr[i] - max); sum += exps[i]; }
        for (let i = 0; i < arr.length; i++) exps[i] /= sum;
        return exps;
    }

    // ─── Run inference ────────────────────────────────────────────────
    async function predict(imageElement, onProgress) {
        await load(onProgress);
        if (!compiledModel && !ortSession) throw new Error('Model failed to load');

        const t0 = performance.now();
        const { data: tensorData, shape } = preprocess(imageElement);
        let logits;

        if (compiledModel) {
            // ── LiteRT.js path ───────────────────────────────────────
            // Use cached module — no repeated dynamic import
            const { Tensor } = liteRtModule;

            // LiteRT Tensor accepts Int32Array shape for C++ compat
            const inputTensor = new Tensor(tensorData, Int32Array.from(shape));

            // run(Tensor | Tensor[]) → Promise<Tensor[]>
            const outputs = await compiledModel.run([inputTensor]);

            // Tensor.data() is ASYNC — returns Promise<TypedArray>
            const rawLogits = await outputs[0].data();
            logits = Array.from(rawLogits);

            // Clean up C++ objects (prevent WASM heap leak)
            for (const t of outputs) t.delete();
            inputTensor.delete();
        } else {
            // ── onnxruntime-web path ─────────────────────────────────
            // ort.Tensor requires plain number[] for shape (not Int32Array)
            const inputTensor = new ort.Tensor('float32', tensorData, shape);
            const output = await ortSession.run({ pixel_values: inputTensor });
            const key = Object.keys(output)[0];
            logits = Array.from(output[key].data);
        }

        const inferMs = (performance.now() - t0).toFixed(0);
        const probs = softmax(logits);

        // Sort top-5
        const top5 = Array.from(probs)
            .map((p, i) => ({ label: labels[String(i)] || `class_${i}`, confidence: p }))
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 5);

        return { top5, backend, inferMs };
    }

    function getBackend() { return backend; }

    return { load, predict, getBackend };
})();
