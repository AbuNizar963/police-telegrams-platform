import { correctArabicText, removeRepeatedSpeech } from "./arabicSpeech";
import {
  transcribeArabicLocally,
  type LocalArabicAsrProgress,
} from "./localArabicAsr";

const SEGMENT_DURATION_MS = 8_000;
const MAX_RECORDING_DURATION_MS = 10 * 60 * 1_000;

type LiveArabicWhisperCallbacks = {
  onTranscript: (transcript: string) => void;
  onProgress: (progress: LocalArabicAsrProgress) => void;
  onCaptureStopped: () => void;
  onFinished: (transcript: string) => void;
  onError: (error: Error) => void;
  onNotice: (message: string) => void;
};

/**
 * Keeps one microphone stream open, rotates finalized MediaRecorder segments,
 * and serializes Whisper inference so the user sees text throughout dictation.
 */
export class LiveArabicWhisperRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private segmentChunks: Blob[] = [];
  private readonly queuedSegments: Blob[] = [];
  private transcript = "";
  private rotationTimer: number | null = null;
  private maximumDurationTimer: number | null = null;
  private drainingQueue = false;
  private stopping = false;
  private disposed = false;
  private errorReported = false;
  private captureStoppedReported = false;
  private finished = false;

  constructor(private readonly callbacks: LiveArabicWhisperCallbacks) {}

  start(stream: MediaStream) {
    if (this.stream || this.disposed) {
      throw new Error("مسجل Whisper المحلي قيد الاستخدام بالفعل");
    }

    this.stream = stream;
    this.startSegmentRecorder();
    if (this.stopping || this.disposed) return;
    this.rotationTimer = window.setInterval(() => {
      if (this.recorder?.state === "recording") this.recorder.stop();
    }, SEGMENT_DURATION_MS);
    this.maximumDurationTimer = window.setTimeout(() => {
      this.callbacks.onNotice(
        "وصل التسجيل المحلي إلى الحد الأقصى (10 دقائق) وسيُفرّغ المقطع الأخير الآن"
      );
      this.stop();
    }, MAX_RECORDING_DURATION_MS);
  }

  stop() {
    if (this.disposed || this.stopping) return;
    this.stopping = true;
    this.clearTimers();
    this.callbacks.onProgress({
      progress: null,
      stage: "جارٍ تفريغ المقطع الأخير؛ انتظر اكتمال النص",
    });

    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    } else {
      this.reportCaptureStopped();
      void this.drainQueue();
      this.maybeFinish();
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimers();
    this.queuedSegments.length = 0;
    const recorder = this.recorder;
    this.recorder = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") recorder.stop();
    }
    this.segmentChunks = [];
  }

  private clearTimers() {
    if (this.rotationTimer !== null) {
      window.clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
    if (this.maximumDurationTimer !== null) {
      window.clearTimeout(this.maximumDurationTimer);
      this.maximumDurationTimer = null;
    }
  }

  private startSegmentRecorder() {
    if (this.disposed || this.stopping || !this.stream) return;

    try {
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4;codecs=mp4a.40.2",
        "audio/webm",
        "audio/mp4",
      ].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);
      this.recorder = recorder;
      this.segmentChunks = [];

      recorder.ondataavailable = event => {
        if (event.data.size) this.segmentChunks.push(event.data);
      };
      recorder.onerror = () => {
        this.reportError(new Error("تعذر تسجيل أحد المقاطع الصوتية"));
        this.stopping = true;
        this.clearTimers();
        if (recorder.state !== "inactive") recorder.stop();
        else this.handleSegmentStopped(recorder);
      };
      recorder.onstop = () => this.handleSegmentStopped(recorder);
      recorder.start(1_000);
    } catch (error) {
      this.reportError(
        error instanceof Error ? error : new Error("تعذر بدء تسجيل مقطع صوتي")
      );
      this.stopping = true;
      this.clearTimers();
      this.recorder = null;
      this.reportCaptureStopped();
      void this.drainQueue();
      this.maybeFinish();
    }
  }

  private handleSegmentStopped(recorder: MediaRecorder) {
    if (this.disposed) return;

    const chunks = this.segmentChunks;
    this.segmentChunks = [];
    if (this.recorder === recorder) this.recorder = null;

    const segment = new Blob(chunks, {
      type: recorder.mimeType || "audio/webm",
    });
    if (segment.size) this.queuedSegments.push(segment);

    if (this.stopping) {
      this.reportCaptureStopped();
    } else {
      // Reopen only the recorder, not the microphone. This avoids the browser
      // SpeechRecognition restart tone and gives each segment a complete header.
      this.startSegmentRecorder();
    }

    void this.drainQueue();
  }

  private async drainQueue() {
    if (this.disposed || this.drainingQueue) return;
    this.drainingQueue = true;

    try {
      while (!this.disposed && this.queuedSegments.length) {
        const segment = this.queuedSegments.shift();
        if (!segment?.size) continue;

        this.callbacks.onProgress({
          progress: null,
          stage: "تحويل مقطع صوتي إلى نص أثناء التسجيل",
        });
        try {
          const text = await transcribeArabicLocally(segment, progress => {
            if (!this.disposed) this.callbacks.onProgress(progress);
          });
          if (this.disposed) return;

          const corrected = correctArabicText(text).trim();
          if (corrected) {
            this.transcript = removeRepeatedSpeech(
              [this.transcript, corrected].filter(Boolean).join(" ")
            );
            this.callbacks.onTranscript(this.transcript);
          }
        } catch (error) {
          this.reportError(
            error instanceof Error
              ? error
              : new Error("تعذر تفريغ مقطع صوتي محليًا")
          );
        }
      }
    } finally {
      this.drainingQueue = false;
      if (this.disposed) return;

      if (this.queuedSegments.length) {
        void this.drainQueue();
      } else if (this.stopping) {
        this.maybeFinish();
      } else {
        this.callbacks.onProgress({
          progress: null,
          stage: "يستمر التسجيل؛ سيظهر النص مع اكتمال المقاطع التالية",
        });
      }
    }
  }

  private reportCaptureStopped() {
    if (this.captureStoppedReported) return;
    this.captureStoppedReported = true;
    this.callbacks.onCaptureStopped();
  }

  private reportError(error: Error) {
    if (this.errorReported || this.disposed) return;
    this.errorReported = true;
    this.callbacks.onError(error);
  }

  private maybeFinish() {
    if (
      this.disposed ||
      this.finished ||
      !this.stopping ||
      this.recorder ||
      this.drainingQueue ||
      this.queuedSegments.length
    ) {
      return;
    }

    this.clearTimers();
    if (!this.captureStoppedReported) this.reportCaptureStopped();
    this.finished = true;
    this.stream = null;
    this.callbacks.onFinished(this.transcript);
  }
}
