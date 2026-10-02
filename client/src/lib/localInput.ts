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
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }

  interface SpeechRecognition extends EventTarget {
    lang: string;
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onstart: ((event: Event) => void) | null;
    onend: ((event: Event) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
  }

  interface SpeechRecognitionEvent extends Event {
    readonly results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
  }

  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
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

export function createArabicSpeechRecognition(): SpeechRecognition {
  if (typeof window === "undefined") {
    throw new Error("التعرف الصوتي متاح داخل المتصفح فقط");
  }

  const Recognition =
    window.SpeechRecognition ?? window.webkitSpeechRecognition;

  if (!Recognition) {
    throw new Error(
      "التعرف الصوتي غير متاح في هذا المتصفح. استخدم Chrome على الهاتف أو الكمبيوتر."
    );
  }

  const recognition = new Recognition();
  recognition.lang = "ar-SA";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  return recognition;
}
