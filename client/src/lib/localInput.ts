type TesseractWorker = {
  recognize(image: File): Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
};

type TesseractApi = {
  createWorker(
    languages: string,
    oem?: number,
    options?: Record<string, unknown>
  ): Promise<TesseractWorker>;
};

declare global {
  interface Window {
    Tesseract?: TesseractApi;
  }
}

let tesseractLoadPromise: Promise<TesseractApi> | null = null;
let ocrWorkerPromise: Promise<TesseractWorker> | null = null;

function loadTesseract(): Promise<TesseractApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("OCR متاح داخل المتصفح فقط"));
  }

  if (window.Tesseract) {
    return Promise.resolve(window.Tesseract);
  }

  if (!tesseractLoadPromise) {
    tesseractLoadPromise = new Promise<TesseractApi>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(
        'script[data-local-ocr="tesseract"]'
      );

      const script =
        existing ??
        Object.assign(document.createElement("script"), {
          src: "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
          async: true,
        });

      if (!existing) {
        script.dataset.localOcr = "tesseract";
        document.head.appendChild(script);
      }

      const timeout = window.setTimeout(() => {
        reject(new Error("تعذر تحميل محرك OCR المجاني"));
      }, 30_000);

      const finish = () => {
        window.clearTimeout(timeout);
        if (window.Tesseract) {
          resolve(window.Tesseract);
        } else {
          reject(new Error("محرك OCR لم يتم تحميله بشكل صحيح"));
        }
      };

      script.addEventListener("load", finish, { once: true });
      script.addEventListener(
        "error",
        () => {
          window.clearTimeout(timeout);
          reject(new Error("تعذر الاتصال بمحرك OCR المجاني"));
        },
        { once: true }
      );

      if (window.Tesseract) {
        finish();
      }
    });
  }

  return tesseractLoadPromise;
}

async function getOcrWorker(): Promise<TesseractWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = loadTesseract().then(tesseract =>
      tesseract.createWorker("ara+eng", 1)
    );
  }

  try {
    return await ocrWorkerPromise;
  } catch (error) {
    ocrWorkerPromise = null;
    throw error;
  }
}

export async function extractArabicTextFromImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("اختر ملف صورة صالحًا");
  }

  const worker = await getOcrWorker();
  const result = await worker.recognize(file);
  return result.data.text.trim();
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("تعذر قراءة الملف الصوتي"));
    reader.readAsDataURL(blob);
  });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeMonoWav(
  audio: AudioBuffer,
  targetSampleRate = 16_000
): ArrayBuffer {
  const sourceSampleRate = audio.sampleRate;
  const sampleCount = Math.max(
    1,
    Math.ceil((audio.length * targetSampleRate) / sourceSampleRate)
  );
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetSampleRate, true);
  view.setUint32(28, targetSampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
    audio.getChannelData(index)
  );
  for (let index = 0; index < sampleCount; index += 1) {
    const sourceIndex = Math.min(
      audio.length - 1,
      Math.floor((index * sourceSampleRate) / targetSampleRate)
    );
    const sample =
      channels.reduce((sum, channel) => sum + (channel[sourceIndex] ?? 0), 0) /
      channels.length;
    view.setInt16(
      44 + index * 2,
      Math.max(-1, Math.min(1, sample)) * 0x7fff,
      true
    );
  }

  return buffer;
}

/**
 * MediaRecorder normally produces WebM/Opus, which is deliberately converted
 * into WAV because the high-accuracy Arabic endpoint accepts WAV reliably.
 */
export async function audioBlobToWav(blob: Blob): Promise<Blob> {
  if (!blob.size) throw new Error("لم يُسجل أي صوت");
  if (typeof window === "undefined" || !window.AudioContext) {
    throw new Error("تحويل الصوت عالي الدقة غير متاح في هذا المتصفح");
  }

  const context = new window.AudioContext();
  try {
    const source = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(source.slice(0));
    return new Blob([encodeMonoWav(decoded)], { type: "audio/wav" });
  } catch {
    throw new Error("تعذر تجهيز التسجيل الصوتي للتحويل");
  } finally {
    await context.close();
  }
}
