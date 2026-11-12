import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string; signedOut?: boolean };

export async function runAi<T>(task: () => Promise<T>): Promise<AiResult<T>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: "AI features aren't set up: add ANTHROPIC_API_KEY to the environment." };
  }
  try {
    return { ok: true, data: await task() };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return { ok: false, error: "The Anthropic API key was rejected." };
    if (error instanceof Anthropic.RateLimitError) return { ok: false, error: "Too many AI requests. Try again in a moment." };
    if (error instanceof Anthropic.APIError) return { ok: false, error: `The AI request failed (${error.status}): ${error.message}` };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
