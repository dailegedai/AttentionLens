import type { AiSettings } from "./types";

const STORAGE_KEY = "attentionLensAiSettings";

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  apiKey: "",
  model: "deepseek-v4.1-flash",
  baseUrl: "https://api.deepseek.com",
};

export async function loadAiSettings(): Promise<AiSettings> {
  const stored = (await chrome.storage.local.get(STORAGE_KEY)) as Record<
    string,
    Partial<AiSettings> | undefined
  >;
  return { ...DEFAULT_AI_SETTINGS, ...(stored[STORAGE_KEY] ?? {}) };
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: settings });
}

export function maskApiKey(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed) return "";
  if (trimmed.length <= 8) return "•".repeat(trimmed.length);
  return `${trimmed.slice(0, 3)}${"•".repeat(6)}${trimmed.slice(-4)}`;
}
