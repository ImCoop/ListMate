function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/$/, "");
}

function readAutomationBaseUrls() {
  const candidates = [
    process.env.AUTOMATION_BASE_URL,
    process.env.NEXT_PUBLIC_AUTOMATION_BASE_URL,
    "http://localhost:3001",
    "http://127.0.0.1:3001",
  ]
    .map((value) => normalizeBaseUrl(value))
    .filter(Boolean);

  return [...new Set(candidates)];
}

export async function removeViaAutomation({ platform, listingId, url, userId }) {
  const baseUrls = readAutomationBaseUrls();

  if (!baseUrls.length) {
    return {
      ok: false,
      error: "AUTOMATION_BASE_URL is not configured.",
    };
  }

  const networkErrors = [];

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/${platform}/remove`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          userId,
          listingId,
          url,
        }),
      });

      const payload = (await response.json().catch(() => null)) || {};

      if (!response.ok) {
        return {
          ok: false,
          error: payload.error || `${platform} remove failed with HTTP ${response.status} (${baseUrl})`,
        };
      }

      return {
        ok: true,
        message: payload.message || `${platform} remove succeeded`,
      };
    } catch (error) {
      networkErrors.push(`${baseUrl}: ${error instanceof Error ? error.message : "request failed"}`);
    }
  }

  return {
    ok: false,
    error: networkErrors.join(" | ") || `${platform} remove request failed`,
  };
}
