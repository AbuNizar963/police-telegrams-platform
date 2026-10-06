import { afterEach, describe, expect, it, vi } from "vitest";

const { transcribeMock } = vi.hoisted(() => ({
  transcribeMock: vi.fn(),
}));

vi.mock("./localArabicAsr", () => ({
  transcribeArabicLocally: transcribeMock,
}));

import { LiveArabicWhisperRecorder } from "./liveArabicWhisperRecorder";

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported() {
    return false;
  }

  state: RecordingState = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onerror: (() => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(readonly stream: MediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    if (this.state === "inactive") return;
    this.ondataavailable?.({ data: new Blob(["audio-segment"]) });
    this.state = "inactive";
    this.onstop?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  FakeMediaRecorder.instances = [];
});

describe("LiveArabicWhisperRecorder", () => {
  it("shows a transcribed segment while the microphone session continues", async () => {
    const setInterval = vi.fn(() => 1);
    const setTimeout = vi.fn(() => 2);
    vi.stubGlobal("window", {
      setInterval,
      setTimeout,
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    transcribeMock.mockResolvedValue("المدرسه");

    const onTranscript = vi.fn();
    const onCaptureStopped = vi.fn();
    const onFinished = vi.fn();
    const recorder = new LiveArabicWhisperRecorder({
      onTranscript,
      onProgress: vi.fn(),
      onCaptureStopped,
      onFinished,
      onError: vi.fn(),
      onNotice: vi.fn(),
    });

    recorder.start({} as MediaStream);
    FakeMediaRecorder.instances[0]!.stop();

    await vi.waitFor(() =>
      expect(onTranscript).toHaveBeenCalledWith("المدرسة")
    );
    expect(FakeMediaRecorder.instances).toHaveLength(2);
    expect(FakeMediaRecorder.instances[1]!.state).toBe("recording");
    expect(onCaptureStopped).not.toHaveBeenCalled();
    expect(onFinished).not.toHaveBeenCalled();

    recorder.dispose();
  });

  it("transcribes the last segment and finishes after the user stops", async () => {
    vi.stubGlobal("window", {
      setInterval: vi.fn(() => 1),
      setTimeout: vi.fn(() => 2),
      clearInterval: vi.fn(),
      clearTimeout: vi.fn(),
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
    transcribeMock
      .mockResolvedValueOnce("المدرسة قريبة")
      .mockResolvedValueOnce("وصلت الرسالة");

    const onTranscript = vi.fn();
    const onCaptureStopped = vi.fn();
    const onFinished = vi.fn();
    const recorder = new LiveArabicWhisperRecorder({
      onTranscript,
      onProgress: vi.fn(),
      onCaptureStopped,
      onFinished,
      onError: vi.fn(),
      onNotice: vi.fn(),
    });

    recorder.start({} as MediaStream);
    FakeMediaRecorder.instances[0]!.stop();
    await vi.waitFor(() => expect(onTranscript).toHaveBeenCalledTimes(1));

    recorder.stop();
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));

    expect(onCaptureStopped).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenLastCalledWith("المدرسة قريبة وصلت الرسالة");
    expect(onFinished).toHaveBeenCalledWith("المدرسة قريبة وصلت الرسالة");
  });
});
