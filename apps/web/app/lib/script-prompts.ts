import type { ScriptPrompt } from "@holler/domain";

/** Reads the prompt list a ScriptEditor submits; the service validates it. */
export function promptsFromForm(value: unknown): ScriptPrompt[] {
  if (!Array.isArray(value))
    throw new Response("Invalid prompts", { status: 400 });
  return value.map((item) => {
    const record = (item ?? {}) as Record<string, unknown>;
    return {
      id: String(record.id ?? ""),
      title: String(record.title ?? ""),
      prompt: String(record.prompt ?? ""),
    };
  });
}

export function samePromptList(
  a: readonly ScriptPrompt[],
  b: readonly ScriptPrompt[],
): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function newPromptId(): string {
  return `prompt-${Math.random().toString(36).slice(2, 10)}`;
}

export const scriptErrorMessages: Readonly<Record<string, string>> = {
  INVALID_SCRIPT:
    "Every prompt needs a title (up to 120 characters) and text (up to 2,000). Scripts hold 1–40 prompts.",
  SCRIPT_NOT_FOUND: "That script is no longer in the library.",
  RESEARCH_MOMENT_NOT_FOUND: "That moment no longer exists.",
  MOMENT_MANAGER_ROLE_REQUIRED:
    "Only research managers and merchant admins can change scripts.",
};
