import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pipelineMock, transcriberMock } = vi.hoisted(() => ({
  pipelineMock: vi.fn(),
  transcriberMock: vi.fn(),
}));

vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
}));

type WorkerHarness = {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: ReturnType<typeof vi.fn>;
  navigator: Navigator;
};

let workerHarness: WorkerHarness;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

beforeEach(() => {
  workerHarness = {
    onmessage: null,
    postMessage: vi.fn(),
    navigator: { userAgent: "Desktop Chrome" } as Navigator,
  };
  vi.stubGlobal("self", workerHarness);
  transcriberMock.mockResolvedValue({ text: "تم التعرف على الكلام" });
  pipelineMock.mockResolvedValue(transcriberMock);
});

describe("Arabic Whisper worker", () => {
  it("passes Float32Array samples to Transformers ASR instead of a RawAudio wrapper", async () => {
    await import("./arabicWhisper.worker");

    const samples = new Float32Array([0.1, -0.2, 0.3, -0.4]);
    workerHarness.onmessage?.({
      data: {
        id: 1,
        type: "transcribe",
        audio: samples.buffer,
      },
    } as MessageEvent);

    await vi.waitFor(() =>
      expect(workerHarness.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          type: "transcript",
          text: "تم التعرف على الكلام",
        })
      )
    );

    const audioInput = transcriberMock.mock.calls[0]?.[0];
    expect(audioInput).toBeInstanceOf(Float32Array);
    expect(Array.from(audioInput as Float32Array)).toEqual(Array.from(samples));
    expect(typeof (audioInput as Float32Array).subarray).toBe("function");
    expect(transcriberMock.mock.calls[0]?.[1]).toMatchObject({
      language: "arabic",
      task: "transcribe",
      chunk_length_s: 30,
      stride_length_s: 5,
    });
  });

  it("retries a failed WebGPU transcription once with WASM", async () => {
    const webGpuTranscriber = vi
      .fn()
      .mockRejectedValue(new Error("WebGPU device is lost"));
    const wasmTranscriber = vi
      .fn()
      .mockResolvedValue({ text: "تم التفريغ بعد التحويل إلى WASM" });
    workerHarness.navigator = {
      userAgent: "Desktop Chrome",
      gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
    } as unknown as Navigator;
    pipelineMock.mockImplementation(
      async (_task: string, _model: string, options: { device: string }) =>
        options.device === "webgpu" ? webGpuTranscriber : wasmTranscriber
    );

    await import("./arabicWhisper.worker");
    const samples = new Float32Array([0.25, -0.25]);
    workerHarness.onmessage?.({
      data: { id: 2, type: "transcribe", audio: samples.buffer },
    } as MessageEvent);

    await vi.waitFor(() =>
      expect(workerHarness.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 2,
          type: "transcript",
          text: "تم التفريغ بعد التحويل إلى WASM",
        })
      )
    );

    expect(webGpuTranscriber).toHaveBeenCalledTimes(1);
    expect(wasmTranscriber).toHaveBeenCalledTimes(1);
    expect(pipelineMock.mock.calls.map(call => call[2]?.device)).toEqual([
      "webgpu",
      "wasm",
    ]);
    expect(workerHarness.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 2,
        type: "progress",
        stage: expect.stringContaining("التحويل إلى WASM"),
      })
    );
  });

  it("uses WASM directly on mobile even when a WebGPU adapter is available", async () => {
    workerHarness.navigator = {
      userAgent: "Mozilla/5.0 (Linux; Android 15) Chrome/140 Mobile",
      gpu: { requestAdapter: vi.fn().mockResolvedValue({}) },
    } as unknown as Navigator;

    await import("./arabicWhisper.worker");
    workerHarness.onmessage?.({
      data: { id: 3, type: "load" },
    } as MessageEvent);

    await vi.waitFor(() =>
      expect(workerHarness.postMessage).toHaveBeenCalledWith({
        id: 3,
        type: "ready",
        backend: "wasm",
      })
    );

    expect(pipelineMock).toHaveBeenCalledTimes(1);
    expect(pipelineMock.mock.calls[0]?.[2]?.device).toBe("wasm");
  });
});
