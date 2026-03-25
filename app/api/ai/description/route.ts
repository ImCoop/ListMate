import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/server-auth";

type GenerateDescriptionPayload = {
  imageUrls?: string[];
  title?: string;
  brand?: string;
  category?: string;
  size?: string;
  condition?: string;
};

function readModel() {
  return process.env.OPENAI_DESCRIPTION_MODEL || "gpt-4.1-mini";
}

function extractOutputText(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const maybeOutputText = (payload as { output_text?: unknown }).output_text;

  if (typeof maybeOutputText === "string" && maybeOutputText.trim()) {
    return maybeOutputText.trim();
  }

  const output = (payload as { output?: unknown }).output;

  if (!Array.isArray(output)) {
    return "";
  }

  const textChunks: string[] = [];

  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }

    const content = (item as { content?: unknown }).content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const text = (part as { text?: unknown }).text;

      if (typeof text === "string" && text.trim()) {
        textChunks.push(text.trim());
      }
    }
  }

  return textChunks.join("\n").trim();
}

export async function POST(request: Request) {
  const sessionUser = await getSessionUser();

  if (!sessionUser) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not configured. Add it to your environment and restart the app." },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => null)) as GenerateDescriptionPayload | null;
  const imageUrls = Array.isArray(body?.imageUrls) ? body?.imageUrls.filter((url) => typeof url === "string" && url.trim()) : [];

  if (!imageUrls.length) {
    return NextResponse.json({ error: "At least one image is required." }, { status: 400 });
  }

  const promptContext = [
    body?.title ? `Title: ${body.title}` : "",
    body?.brand ? `Brand: ${body.brand}` : "",
    body?.category ? `Category: ${body.category}` : "",
    body?.size ? `Size: ${body.size}` : "",
    body?.condition ? `Condition: ${body.condition}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const instruction =
    "Write a concise resale listing description from these product photos. " +
    "Use only details visible in the photos and provided context. " +
    "Do not invent measurements, materials, or defects that are not visible. " +
    "Return 2 short paragraphs, plain text only, no bullets, no emojis.";

  const content = [
    {
      type: "input_text",
      text: `${instruction}${promptContext ? `\n\nContext:\n${promptContext}` : ""}`,
    },
    ...imageUrls.slice(0, 4).map((imageUrl) => ({
      type: "input_image",
      image_url: imageUrl,
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: readModel(),
      input: [
        {
          role: "user",
          content,
        },
      ],
      max_output_tokens: 220,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMessage =
      (payload as { error?: { message?: string } } | null)?.error?.message || `OpenAI request failed with ${response.status}`;
    return NextResponse.json({ error: errorMessage }, { status: 502 });
  }

  const description = extractOutputText(payload);

  if (!description) {
    return NextResponse.json({ error: "AI did not return a description." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    description,
  });
}

