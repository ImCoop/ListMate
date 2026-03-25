const UNAVAILABLE_TEXT_PATTERNS = {
  poshmark: [
    "listing not found",
    "this listing is no longer available",
    "unable to find this listing",
    "we could not find that listing",
  ],
  depop: [
    "this item has sold",
    "item is no longer available",
    "this listing is no longer available",
    "product not found",
  ],
  ebay: [
    "this listing was ended",
    "this item is out of stock",
    "this listing has been removed",
    "the item you selected is no longer available",
  ],
};

const UNAVAILABLE_URL_PATTERNS = {
  poshmark: [],
  depop: [],
  ebay: ["itmunavailable", "itemunavailable", "viitem?item=", "itm/0"],
};

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function textSuggestsUnavailable(platform, text) {
  const candidate = text.toLowerCase();
  return (UNAVAILABLE_TEXT_PATTERNS[platform] || []).some((pattern) => candidate.includes(pattern));
}

function urlSuggestsUnavailable(platform, url) {
  const candidate = String(url || "").toLowerCase();
  return (UNAVAILABLE_URL_PATTERNS[platform] || []).some((pattern) => candidate.includes(pattern));
}

export async function checkListingAvailability({ platform, url, timeoutMs = 15000, signal }) {
  const timeout = withTimeout(signal, timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: timeout.signal,
      headers: {
        "user-agent": "ListMateMonitoringBot/1.0",
      },
    });

    const finalUrl = response.url || url;
    const httpStatus = response.status;

    if (httpStatus === 404 || httpStatus === 410 || httpStatus === 451) {
      return {
        ok: true,
        available: false,
        finalUrl,
        httpStatus,
        reason: `HTTP ${httpStatus}`,
      };
    }

    if (urlSuggestsUnavailable(platform, finalUrl)) {
      return {
        ok: true,
        available: false,
        finalUrl,
        httpStatus,
        reason: "Final URL indicates unavailable listing",
      };
    }

    const contentType = String(response.headers.get("content-type") || "");
    const isHtml = contentType.includes("text/html") || contentType.includes("application/xhtml+xml");

    if (!isHtml) {
      return {
        ok: true,
        available: response.ok,
        finalUrl,
        httpStatus,
        reason: response.ok ? "Non-HTML response treated as available" : `HTTP ${httpStatus}`,
      };
    }

    const body = (await response.text()).slice(0, 50000);

    if (textSuggestsUnavailable(platform, body)) {
      return {
        ok: true,
        available: false,
        finalUrl,
        httpStatus,
        reason: "Page text indicates unavailable listing",
      };
    }

    return {
      ok: true,
      available: response.ok,
      finalUrl,
      httpStatus,
      reason: response.ok ? "Listing appears available" : `HTTP ${httpStatus}`,
    };
  } catch (error) {
    return {
      ok: false,
      available: null,
      error: error instanceof Error ? error.message : "Availability check failed",
    };
  } finally {
    timeout.clear();
  }
}
