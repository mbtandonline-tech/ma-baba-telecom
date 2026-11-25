import { describe, it, expect } from "vitest";
import { findGeminiImage, firstInteraction, geminiErrorKind, geminiErrorMessage } from "../lib/gemini-image";

const imageStep = (data: string) => ({
  type: "model_output",
  content: [{ type: "image", data, mime_type: "image/jpeg" }],
});

describe("gemini interaction parsing", () => {
  it("reads the generated image from model_output steps", () => {
    const payload = {
      status: "completed",
      steps: [
        { type: "thought", content: [{ type: "image", data: "thought" }] },
        imageStep("generated"),
      ],
    };
    expect(findGeminiImage(payload)).toBe("generated");
  });

  it("accepts a one-item array response and takes the last image", () => {
    const payload = [{ status: "completed", steps: [imageStep("first"), imageStep("last")] }];
    expect(firstInteraction(payload).steps).toHaveLength(2);
    expect(findGeminiImage(payload)).toBe("last");
  });

  it("returns undefined when no image block exists", () => {
    expect(
      findGeminiImage({
        steps: [{ type: "model_output", content: [{ type: "text", text: "hi" }] }],
      }),
    ).toBeUndefined();
    expect(findGeminiImage(null)).toBeUndefined();
  });

  it("reads the nested API error message from an array response", () => {
    const payload = [
      {
        error: {
          code: 400,
          message: "API key not valid. Please pass a valid API key.",
          status: "INVALID_ARGUMENT",
        },
      },
    ];
    expect(geminiErrorMessage(payload)).toBe("API key not valid. Please pass a valid API key.");
    expect(geminiErrorMessage({ errors: [{ message: "quota" }] })).toBe("quota");
    expect(geminiErrorMessage({}, "fallback")).toBe("fallback");
  });
});

describe("geminiErrorKind", () => {
  it("detects an invalid key", () => {
    expect(geminiErrorKind(400, "API key not valid. Please pass a valid API key.")).toBe("key");
    expect(geminiErrorKind(403, "PERMISSION_DENIED")).toBe("key");
  });

  it("treats a 429 that mentions billing as missing billing, not a rate limit", () => {
    expect(
      geminiErrorKind(
        429,
        "You exceeded your current quota, please check your plan and billing details.",
      ),
    ).toBe("billing");
    expect(geminiErrorKind(429, "Quota exceeded for free_tier requests")).toBe("billing");
  });

  it("treats a plain 429 as a rate limit", () => {
    expect(geminiErrorKind(429, "Too many requests, slow down.")).toBe("rate");
  });

  it("separates missing models and safety refusals", () => {
    expect(geminiErrorKind(404, "model not found")).toBe("model");
    expect(geminiErrorKind(400, "Blocked by safety filters")).toBe("safety");
    expect(geminiErrorKind(500, "internal error")).toBe("other");
  });
});
