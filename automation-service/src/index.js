import express from "express";
import cors from "cors";

import { authenticateDepopMagicLink, automateDepop, removeDepopListing, startDepopManualLogin } from "./automation/depop.js";
import {
  automateEbay,
  getEbayConsentUrl,
  getEbayStatus,
  handleEbayOAuthCallback,
  removeEbayListing,
  startEbayManualLogin,
} from "./automation/ebay.js";
import { logError, logStep } from "./automation/common.js";
import { automatePoshmark, removePoshmarkListing, startPoshmarkManualLogin } from "./automation/poshmark.js";
import { loadLocalEnv } from "./env.js";

loadLocalEnv();

const app = express();
const PORT = 3001;

app.use(
  cors({
    origin: true,
  }),
);
app.use(express.json({ limit: "50mb" }));

function normalizePayload(body = {}) {
  return {
    listingId: body.listingId || "",
    title: body.title || "",
    description: body.description || "",
    price: body.price ?? "",
    quantity: body.quantity ?? 1,
    brand: body.brand || "",
    size: body.size || "",
    category: body.category || "",
    topCategory: body.topCategory || "",
    condition: body.condition || "",
    imageUrls: Array.isArray(body.imageUrls) ? body.imageUrls : [],
  };
}

function validatePayload(payload) {
  if (!payload.title || !payload.description) {
    return "Title and description are required";
  }

  if (payload.price === "" || Number.isNaN(Number(payload.price))) {
    return "A valid price is required";
  }

  return null;
}

function normalizeRemovalPayload(body = {}) {
  return {
    listingId: body.listingId || "",
    url: body.url || "",
  };
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/poshmark", async (request, response) => {
  const payload = normalizePayload(request.body);
  const validationError = validatePayload(payload);

  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  try {
    logStep("poshmark", "Automation request received.");
    const result = await automatePoshmark(payload);
    response.json(result);
  } catch (error) {
    logError("poshmark", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Poshmark automation failed",
    });
  }
});

app.post("/poshmark/login", async (_request, response) => {
  try {
    logStep("poshmark", "Manual login request received.");
    const result = await startPoshmarkManualLogin();
    response.json(result);
  } catch (error) {
    logError("poshmark", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Poshmark login failed",
    });
  }
});

app.post("/poshmark/remove", async (request, response) => {
  const payload = normalizeRemovalPayload(request.body);

  try {
    logStep("poshmark", "Removal request received.");
    const result = await removePoshmarkListing(payload);

    if (!result?.ok) {
      response.status(400).json(result);
      return;
    }

    response.json(result);
  } catch (error) {
    logError("poshmark", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Poshmark removal failed",
    });
  }
});

app.post("/depop", async (request, response) => {
  const payload = normalizePayload(request.body);
  const validationError = validatePayload(payload);

  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  try {
    logStep("depop", "Automation request received.");
    const result = await automateDepop(payload);
    response.json(result);
  } catch (error) {
    logError("depop", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Depop automation failed",
    });
  }
});

app.post("/depop/login", async (_request, response) => {
  try {
    logStep("depop", "Manual login request received.");
    const result = await startDepopManualLogin();
    response.json(result);
  } catch (error) {
    logError("depop", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Depop login failed",
    });
  }
});

app.post("/depop/remove", async (request, response) => {
  const payload = normalizeRemovalPayload(request.body);

  try {
    logStep("depop", "Removal request received.");
    const result = await removeDepopListing(payload);

    if (!result?.ok) {
      response.status(400).json(result);
      return;
    }

    response.json(result);
  } catch (error) {
    logError("depop", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Depop removal failed",
    });
  }
});

app.post("/ebay", async (request, response) => {
  const payload = normalizePayload(request.body);
  const validationError = validatePayload(payload);

  if (validationError) {
    response.status(400).json({ error: validationError });
    return;
  }

  try {
    logStep("ebay", "Automation request received.");
    const result = await automateEbay(payload);
    response.json(result);
  } catch (error) {
    logError("ebay", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "eBay automation failed",
    });
  }
});

app.post("/ebay/login", async (_request, response) => {
  try {
    logStep("ebay", "Manual login request received.");
    const result = await startEbayManualLogin();
    response.json(result);
  } catch (error) {
    logError("ebay", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "eBay login failed",
    });
  }
});

app.post("/ebay/remove", async (request, response) => {
  const payload = normalizeRemovalPayload(request.body);

  try {
    logStep("ebay", "Removal request received.");
    const result = await removeEbayListing(payload);

    if (!result?.ok) {
      response.status(400).json(result);
      return;
    }

    response.json(result);
  } catch (error) {
    logError("ebay", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "eBay removal failed",
    });
  }
});

app.get("/ebay/status", async (_request, response) => {
  try {
    const result = await getEbayStatus();
    response.json(result);
  } catch (error) {
    logError("ebay", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Unable to read eBay status",
    });
  }
});

app.get("/ebay/connect", (request, response) => {
  try {
    logStep("ebay", "OAuth connect request received.");
    const url = getEbayConsentUrl();
    response.redirect(url);
  } catch (error) {
    logError("ebay", error);
    response
      .status(500)
      .send(`<html><body><h1>eBay connect failed</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></body></html>`);
  }
});

app.get("/ebay/oauth/callback", async (request, response) => {
  try {
    const result = await handleEbayOAuthCallback({
      code: typeof request.query.code === "string" ? request.query.code : "",
      state: typeof request.query.state === "string" ? request.query.state : "",
      error: typeof request.query.error === "string" ? request.query.error : "",
      errorDescription:
        typeof request.query.error_description === "string" ? request.query.error_description : "",
    });

    response.send(`<html><body><h1>eBay connected</h1><p>${result.message}</p></body></html>`);
  } catch (error) {
    logError("ebay", error);
    response
      .status(500)
      .send(`<html><body><h1>eBay connect failed</h1><p>${error instanceof Error ? error.message : "Unknown error"}</p></body></html>`);
  }
});

app.post("/depop/auth-link", async (request, response) => {
  const magicLink = typeof request.body?.url === "string" ? request.body.url.trim() : "";

  if (!magicLink) {
    response.status(400).json({ error: "A Depop magic link URL is required" });
    return;
  }

  try {
    logStep("depop", "Magic-link auth request received.");
    const result = await authenticateDepopMagicLink(magicLink);
    response.json(result);
  } catch (error) {
    logError("depop", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : "Depop magic-link authentication failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Automation service listening on http://localhost:${PORT}`);
  console.log("Open the web app, then use Send to Poshmark, Send to Depop, or Send to eBay.");
});
