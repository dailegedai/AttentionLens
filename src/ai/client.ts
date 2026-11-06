import type { AiSettings, PageFeatures, PollutionResult } from "../types";
import { AiParseError, parseAiContent, type ParsedAiResult } from "./parser";
import { buildAiPayload, SYSTEM_PROMPT } from "./prompts";

const REQUEST_TIMEOUT_MS = 20_000;

class AiRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatOptions {
  jsonMode: boolean;
  maxTokens?: number;
}

export async function requestAiAnalysis(
  features: PageFeatures,
  pollution: PollutionResult,
  settings: AiSettings,
): Promise<ParsedAiResult> {
  const payload = buildAiPayload(features, pollution);

  return withRetry(async () =>
    parseAiContent(
      await requestChat(
        settings,
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        { jsonMode: true },
      ),
    ),
  );
}

export async function testAiConnection(settings: AiSettings): Promise<string> {
  const reply = await withRetry(() =>
    requestChat(
      settings,
      [
        { role: "system", content: "You are a connection test. Reply with the single word: ok" },
        { role: "user", content: "ping" },
      ],
      { jsonMode: false, maxTokens: 8 },
    ),
  );

  return reply.trim();
}

async function requestChat(
  settings: AiSettings,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model: settings.model,
      messages,
      temperature: 0.2,
      stream: false,
    };

    if (options.jsonMode) body.response_format = { type: "json_object" };
    if (options.maxTokens) body.max_tokens = options.maxTokens;

    const response = await fetch(`${settings.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseBody = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;
      throw new AiRequestError(
        `DeepSeek request failed (${response.status}). ${responseBody.slice(0, 160)}`.trim(),
        retryable,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new AiRequestError("DeepSeek returned an empty response.", false);
    }

    return content;
  } finally {
    clearTimeout(timer);
  }
}

async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isRetryable(error)) throw error;
    return run();
  }
}

function isRetryable(error: unknown): boolean {
  if (error instanceof AiParseError) return true;
  if (error instanceof AiRequestError) return error.retryable;
  return error instanceof TypeError;
}
