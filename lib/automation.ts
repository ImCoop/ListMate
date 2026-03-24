const DEFAULT_AUTOMATION_BASE_URL = normalizeAutomationBaseUrl(process.env.NEXT_PUBLIC_AUTOMATION_BASE_URL);

export const AUTOMATION_BASE_URL_STORAGE_KEY = "resale-tool.automation-base-url";

export function normalizeAutomationBaseUrl(value?: string) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return "http://localhost:3001";
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/$/, "");
  }

  const normalizedHost = trimmed.replace(/\/$/, "");
  return /:\d+$/.test(normalizedHost) ? `http://${normalizedHost}` : `http://${normalizedHost}:3001`;
}

export function getDefaultAutomationBaseUrl() {
  return DEFAULT_AUTOMATION_BASE_URL;
}

export function readAutomationBaseUrl() {
  if (typeof window === "undefined") {
    return DEFAULT_AUTOMATION_BASE_URL;
  }

  const saved = window.localStorage.getItem(AUTOMATION_BASE_URL_STORAGE_KEY);
  return normalizeAutomationBaseUrl(saved || DEFAULT_AUTOMATION_BASE_URL);
}

export function writeAutomationBaseUrl(value: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(AUTOMATION_BASE_URL_STORAGE_KEY, normalizeAutomationBaseUrl(value));
}

export function getAutomationNetworkErrorMessage(baseUrl: string) {
  return `Could not reach the automation service at ${baseUrl}. Open Settings and verify the service URL. If you're using another device, use your desktop's LAN IP instead of localhost.`;
}
