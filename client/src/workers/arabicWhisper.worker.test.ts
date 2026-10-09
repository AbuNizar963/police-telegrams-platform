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
    navigator: {} as Navigator,
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
});
