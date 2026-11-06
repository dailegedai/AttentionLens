import "./options.css";

import { DEFAULT_AI_SETTINGS, loadAiSettings, maskApiKey, saveAiSettings } from "../settings";
import type { AiSettings, RuntimeRequest, TestConnectionResponse } from "../types";

const aiEnabled = requireElement<HTMLInputElement>("ai-enabled");
const aiModel = requireElement<HTMLInputElement>("ai-model");
const aiBaseUrl = requireElement<HTMLInputElement>("ai-base-url");
const aiApiKey = requireElement<HTMLInputElement>("ai-api-key");
const keySaved = requireElement<HTMLElement>("key-saved");
const keyEntry = requireElement<HTMLElement>("key-entry");
const keyMask = requireElement<HTMLElement>("key-mask");
const changeKeyButton = requireElement<HTMLButtonElement>("change-key-button");
const clearKeyButton = requireElement<HTMLButtonElement>("clear-key-button");
const saveButton = requireElement<HTMLButtonElement>("save-button");
const testButton = requireElement<HTMLButtonElement>("test-button");
const status = requireElement<HTMLParagraphElement>("status");

let storedSettings: AiSettings = { ...DEFAULT_AI_SETTINGS };
let isChangingKey = false;

changeKeyButton.addEventListener("click", () => {
  isChangingKey = true;
  renderKeyState();
  aiApiKey.focus();
});
clearKeyButton.addEventListener("click", () => {
  void clearKey();
});
saveButton.addEventListener("click", () => {
  void saveSettings();
});
testButton.addEventListener("click", () => {
  void testConnection();
});

void init();

async function init(): Promise<void> {
  storedSettings = await loadAiSettings();
  aiEnabled.checked = storedSettings.enabled;
  aiModel.value = storedSettings.model;
  aiBaseUrl.value = storedSettings.baseUrl;
  renderKeyState();
}

function renderKeyState(): void {
  const hasStoredKey = storedSettings.apiKey.trim().length > 0;
  const showSavedKey = hasStoredKey && !isChangingKey;

  keySaved.hidden = !showSavedKey;
  keyEntry.hidden = showSavedKey;
  keyMask.textContent = showSavedKey ? maskApiKey(storedSettings.apiKey) : "";

  if (!showSavedKey) {
    aiApiKey.placeholder = hasStoredKey ? "Enter a new key" : "sk-...";
    if (!isChangingKey) aiApiKey.value = "";
  }
}

function collectSettings(): AiSettings {
  return {
    enabled: aiEnabled.checked,
    apiKey: isChangingKey ? aiApiKey.value.trim() : storedSettings.apiKey,
    model: aiModel.value.trim() || DEFAULT_AI_SETTINGS.model,
    baseUrl: aiBaseUrl.value.trim() || DEFAULT_AI_SETTINGS.baseUrl,
  };
}

async function saveSettings(): Promise<void> {
  const settings = collectSettings();

  if (settings.enabled && !settings.apiKey) {
    setStatus("Add an API key before enabling DeepSeek.", "error");
    return;
  }

  await saveAiSettings(settings);
  storedSettings = settings;
  isChangingKey = false;
  renderKeyState();
  setStatus("Settings saved. Analyze a page to use them.", "ok");
}

async function clearKey(): Promise<void> {
  storedSettings = { ...storedSettings, apiKey: "" };
  await saveAiSettings(storedSettings);
  isChangingKey = false;
  aiApiKey.value = "";
  renderKeyState();
  setStatus("API key cleared from this browser profile.", "ok");
}

async function testConnection(): Promise<void> {
  const settings = collectSettings();

  if (!settings.apiKey) {
    setStatus("Add an API key before testing the connection.", "error");
    return;
  }

  testButton.disabled = true;
  setStatus("Testing the connection...", "");

  try {
    const response = (await chrome.runtime.sendMessage({
      type: "TEST_AI_CONNECTION",
      settings,
    } satisfies RuntimeRequest)) as TestConnectionResponse;

    if (!response?.ok) {
      setStatus(response?.error ?? "Connection test failed.", "error");
      return;
    }
    setStatus(response.message, "ok");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Connection test failed.", "error");
  } finally {
    testButton.disabled = false;
  }
}

function setStatus(message: string, tone: "" | "ok" | "error"): void {
  status.textContent = message;
  status.className = `status ${tone}`.trim();
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing options element: #${id}`);
  return element as T;
}
