import { ENV } from "./env";

export type TranscribeOptions = {
  audioUrl: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionResponse = WhisperResponse;

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "UPLOAD_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

function getFileExtension(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "audio/m4a": "m4a",
    "audio/mp4": "m4a",
  };
  return mimeToExt[mimeType] ?? "audio";
}

export async function transcribeAudio(
  options: TranscribeOptions,
): Promise<TranscriptionResponse | TranscriptionError> {
  if (!ENV.openAiApiKey) {
    return {
      error: "Voice transcription service is not configured",
      code: "SERVICE_ERROR",
      details: "OPENAI_API_KEY is not set",
    };
  }

  try {
    const audioResponse = await fetch(options.audioUrl);
    if (!audioResponse.ok) {
      return {
        error: "Failed to download audio file",
        code: "INVALID_FORMAT",
        details: `HTTP ${audioResponse.status}: ${audioResponse.statusText}`,
      };
    }

    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    if (audioBuffer.length > 16 * 1024 * 1024) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
        details: "Maximum allowed size is 16MB",
      };
    }

    const mimeType = audioResponse.headers.get("content-type") || "audio/mpeg";
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", blob, `audio.${getFileExtension(mimeType)}`);
    formData.append("model", ENV.openAiTranscriptionModel);
    formData.append("response_format", "verbose_json");
    if (options.language) formData.append("language", options.language);
    if (options.prompt) formData.append("prompt", options.prompt);

    const response = await fetch(`${ENV.openAiBaseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${ENV.openAiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
      };
    }

    const result = (await response.json()) as Partial<WhisperResponse>;
    if (typeof result.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
      };
    }

    return {
      task: "transcribe",
      language: result.language ?? options.language ?? "ar",
      duration: result.duration ?? 0,
      text: result.text,
      segments: Array.isArray(result.segments) ? result.segments : [],
    };
  } catch (error) {
    return {
      error: "Voice transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : String(error),
    };
  }
}
