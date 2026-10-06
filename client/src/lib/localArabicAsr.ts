export type LocalArabicAsrBackend = "webgpu" | "wasm";

export type LocalArabicAsrProgress = {
  progress: number | null;
  stage: string;
  file?: string;
};

type WorkerRequest =
  | { id: number; type: "load" }
  | { id: number; type: "transcribe"; audio: ArrayBuffer };

type WorkerRequestPayload =
  | { type: "load" }
  | { type: "transcribe"; audio: ArrayBuffer };

type WorkerResponse =
  | {
      id: number;
      type: "progress";
      progress: number | null;
      stage: string;
      file?: string;
    }
  | { id: number; type: "ready"; backend: LocalArabicAsrBackend }
  | { id: number; type: "transcript"; text: string }
  | { id: number; type: "error"; message: string };

type PendingRequest = {
  resolve: (value: string | LocalArabicAsrBackend) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: LocalArabicAsrProgress) => void;
};

const TARGET_SAMPLE_RATE = 16_000;
const MAX_RECORDING_SECONDS = 10 * 60;

let worker: Worker | null = null;
let nextRequestId = 0;
const pendingRequests = new Map<number, PendingRequest>();

function settleWorkerFailure(error: Error) {
  pendingRequests.forEach(pending => pending.reject(error));
  pendingRequests.clear();
  worker?.terminate();
  worker = null;
}

function getWorker(): Worker {
  if (worker) return worker;

  const instance = new Worker(
    new URL("../workers/arabicWhisper.worker.ts", import.meta.url),
    { type: "module", name: "arabic-whisper-asr" }
  );

  instance.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const pending = pendingRequests.get(message.id);
    if (!pending) return;

    if (message.type === "progress") {
      pending.onProgress?.({
        progress: message.progress,
        stage: message.stage,
        file: message.file,
      });
      return;
    }

    pendingRequests.delete(message.id);
    if (message.type === "error") {
      pending.reject(new Error(message.message));
    } else if (message.type === "ready") {
      pending.resolve(message.backend);
    } else {
      pending.resolve(message.text);
    }
  };

  instance.onerror = event => {
    event.preventDefault();
    settleWorkerFailure(new Error("تعطل عامل التفريغ المحلي في المتصفح"));
  };

  worker = instance;
  return instance;
}

function sendRequest(
  message: WorkerRequestPayload,
  onProgress?: (progress: LocalArabicAsrProgress) => void
): Promise<string | LocalArabicAsrBackend> {
  const instance = getWorker();
  const id = ++nextRequestId;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject, onProgress });
    const request = { ...message, id } as WorkerRequest;
    if (request.type === "transcribe") {
      instance.postMessage(request, [request.audio]);
    } else {
      instance.postMessage(request);
    }
  });
}

export async function prepareLocalArabicAsr(
  onProgress?: (progress: LocalArabicAsrProgress) => void
): Promise<LocalArabicAsrBackend> {
  const backend = await sendRequest({ type: "load" }, onProgress);
  return backend as LocalArabicAsrBackend;
}

async function decodeToMonoPcm16k(blob: Blob): Promise<Float32Array> {
  if (!blob.size) throw new Error("لم يُسجل أي صوت");
  if (typeof window === "undefined" || !window.AudioContext) {
    throw new Error("تحويل الصوت المحلي غير مدعوم في هذا المتصفح");
  }

  const decodeContext = new window.AudioContext();
  try {
    const decoded = await decodeContext.decodeAudioData(
      (await blob.arrayBuffer()).slice(0)
    );
    if (decoded.duration > MAX_RECORDING_SECONDS) {
      throw new Error("الحد الأقصى للتسجيل المحلي 10 دقائق؛ سجّل مقطعًا أقصر");
    }

    const outputLength = Math.ceil(decoded.duration * TARGET_SAMPLE_RATE);
    const OfflineContext = window.OfflineAudioContext;
    if (!OfflineContext) {
      throw new Error("إعادة أخذ عينات الصوت غير مدعومة في هذا المتصفح");
    }

    const offlineContext = new OfflineContext(
      1,
      Math.max(1, outputLength),
      TARGET_SAMPLE_RATE
    );
    const source = offlineContext.createBufferSource();
    source.buffer = decoded;
    source.connect(offlineContext.destination);
    source.start();

    const resampled = await offlineContext.startRendering();
    return new Float32Array(resampled.getChannelData(0));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("الحد الأقصى")) {
      throw error;
    }
    throw new Error("تعذر تجهيز التسجيل الصوتي للتحويل المحلي");
  } finally {
    await decodeContext.close();
  }
}

export async function transcribeArabicLocally(
  blob: Blob,
  onProgress?: (progress: LocalArabicAsrProgress) => void
): Promise<string> {
  const samples = await decodeToMonoPcm16k(blob);
  const buffer = samples.buffer as ArrayBuffer;
  const result = await sendRequest(
    { type: "transcribe", audio: buffer },
    onProgress
  );
  return result as string;
}
