import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = { type: "text"; text: string };
export type ImageContent = {
  type: "image_url";
  image_url: { url: string; detail?: "auto" | "low" | "high" };
};
export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};
export type MessageContent = string | TextContent | ImageContent | FileContent;
export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: { name: string };
};
export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};
export type OutputSchema = JsonSchema;
export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  model?: string;
  thinking?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

const normalizeMessage = (message: Message) => {
  if (typeof message.content === "string") return message;

  const parts = Array.isArray(message.content)
    ? message.content
    : [message.content];

  return {
    ...message,
    content: parts.map((part: MessageContent) =>
      typeof part === "string" ? { type: "text", text: part } : part,
    ),
  };
};

function normalizeToolChoice(
  value: ToolChoice | undefined,
  tools: Tool[] | undefined,
): "none" | "auto" | ToolChoiceExplicit | undefined {
  if (!value) return undefined;
  if (value === "none" || value === "auto") return value;
  if (value === "required") {
    if (!tools || tools.length !== 1) {
      throw new Error("tool_choice 'required' needs exactly one configured tool");
    }
    return { type: "function", function: { name: tools[0].function.name } };
  }
  if ("name" in value) {
    return { type: "function", function: { name: value.name } };
  }
  return value;
}

function assertConfigured(): void {
  if (!ENV.openAiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  assertConfigured();

  const payload: Record<string, unknown> = {
    model: params.model ?? ENV.openAiVisionModel,
    messages: params.messages.map(normalizeMessage),
  };

  if (params.tools?.length) payload.tools = params.tools;
  const toolChoice = normalizeToolChoice(
    params.toolChoice ?? params.tool_choice,
    params.tools,
  );
  if (toolChoice) payload.tool_choice = toolChoice;

  const maxTokens = params.max_tokens ?? params.maxTokens;
  if (typeof maxTokens === "number") payload.max_tokens = maxTokens;

  const responseFormat =
    params.response_format ??
    params.responseFormat ??
    ((params.output_schema ?? params.outputSchema)
      ? {
          type: "json_schema",
          json_schema: params.output_schema ?? params.outputSchema,
        }
      : undefined);
  if (responseFormat) payload.response_format = responseFormat;

  const response = await fetch(`${ENV.openAiBaseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.openAiApiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `OpenAI request failed: ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }

  return (await response.json()) as InvokeResult;
}

export async function listLLMModels(): Promise<{
  object: string;
  data: Array<{ id: string; object: string; created: number; owned_by: string }>;
}> {
  assertConfigured();
  const response = await fetch(`${ENV.openAiBaseUrl}/models`, {
    headers: { authorization: `Bearer ${ENV.openAiApiKey}` },
  });
  if (!response.ok) {
    throw new Error(`OpenAI models request failed: ${response.status}`);
  }
  return response.json();
}
