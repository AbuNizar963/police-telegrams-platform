import { pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/whisper-small";
const SAMPLE_RATE = 16_000;

type Backend = "webgpu" | "wasm";
type WhisperPipeline = (
  audio: Float32Array,
  options: {
    language: string;
    task: string;
    chunk_length_s: number;
    stride_length_s: number;
  }
) => Promise<{ text: string }>;

type WorkerRequest =
  | { id: number; type: "load" }
  | { id: number; type: "transcribe"; audio: ArrayBuffer };

type WorkerResponse =
  | {
      id: number;
      type: "progress";
      progress: number | null;
      stage: string;
      file?: string;
    }
  | { id: number; type: "ready"; backend: Backend }
  | { id: number; type: "transcript"; text: string }
  | { id: number; type: "error"; message: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
  navigator: Navigator;
};

let transcriber: WhisperPipeline | null = null;
let loadPromise: Promise<{
  pipeline: WhisperPipeline;
  backend: Backend;
}> | null = null;

function postProgress(
  id: number,
  progress: number | null,
  stage: string,
  file?: string
) {
  workerScope.postMessage({ id, type: "progress", progress, stage, file });
}

async function hasWebGpuAdapter(): Promise<boolean> {
  const navigatorWithGpu = workerScope.navigator as Navigator & {
    gpu?: { requestAdapter(): Promise<unknown | null> };
  };
  if (!navigatorWithGpu.gpu) return false;

  try {
    return Boolean(await navigatorWithGpu.gpu.requestAdapter());
  } catch {
    return false;
  }
}

async function createPipeline(
  backend: Backend,
  requestId: number
): Promise<WhisperPipeline> {
  const loaded = await pipeline("automatic-speech-recognition", MODEL_ID, {
    device: backend,
    dtype: "q4",
    progress_callback: info => {
      if (info.status === "progress_total") {
        postProgress(
          requestId,
          Math.round(info.progress),
          "تحميل ملفات النموذج",
          info.files ? Object.keys(info.files).at(-1) : undefined
        );
      } else if (info.status === "progress") {
        postProgress(
          requestId,
          Math.round(info.progress),
          "تحميل ملف من النموذج",
          info.file
        );
      } else if (info.status === "initiate") {
        postProgress(requestId, null, "تهيئة محرك التفريغ", info.file);
      }
    },
  });

  return loaded as unknown as WhisperPipeline;
}

async function loadModel(requestId: number) {
  if (!loadPromise) {
    loadPromise = (async () => {
      postProgress(requestId, null, "فحص تسريع الجهاز");
      const useWebGpu = await hasWebGpuAdapter();
      if (useWebGpu) {
        try {
          const model = await createPipeline("webgpu", requestId);
          return { pipeline: model, backend: "webgpu" as const };
        } catch {
          postProgress(
            requestId,
            null,
            "تعذر تشغيل WebGPU؛ جارٍ التحويل إلى WASM"
          );
        }
      }

      const model = await createPipeline("wasm", requestId);
      return { pipeline: model, backend: "wasm" as const };
    })().catch(error => {
      loadPromise = null;
      throw error;
    });
  }

  const loaded = await loadPromise;
  transcriber = loaded.pipeline;
  return loaded;
}

workerScope.onmessage = event => {
  const request = event.data;

  void (async () => {
    try {
      if (request.type === "load") {
        const loaded = await loadModel(request.id);
        workerScope.postMessage({
          id: request.id,
          type: "ready",
          backend: loaded.backend,
        });
        return;
      }

      if (!transcriber) {
        const loaded = await loadModel(request.id);
        transcriber = loaded.pipeline;
      }

      postProgress(request.id, null, "تحويل التسجيل محليًا إلى نص عربي");
      const samples = new Float32Array(request.audio);
      const result = await transcriber!(samples, {
        language: "arabic",
        task: "transcribe",
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      workerScope.postMessage({
        id: request.id,
        type: "transcript",
        text: result.text,
      });
    } catch (error) {
      workerScope.postMessage({
        id: request.id,
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "تعذر تشغيل نموذج Whisper المحلي",
      });
    }
  })();
};
