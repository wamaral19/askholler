import { z } from "zod";

export const scriptPromptSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(2000),
});

/** script_versions.content for scripts authored in the app. */
export const scriptContentV1Schema = z.object({
  prompts: z.array(scriptPromptSchema).min(1).max(40),
});

export type ScriptPrompt = z.infer<typeof scriptPromptSchema>;
export type ScriptContentV1 = z.infer<typeof scriptContentV1Schema>;

/**
 * Reads persisted script content leniently: early seeds stored prompts as bare
 * strings, and a pinned script must still render for in-flight interviews.
 */
export function readScriptPrompts(content: unknown): ScriptPrompt[] {
  const prompts =
    content && typeof content === "object" && "prompts" in content
      ? (content as { prompts: unknown }).prompts
      : undefined;
  if (!Array.isArray(prompts)) return [];
  return prompts.map((prompt, index) => {
    const fallbackId = `prompt-${index + 1}`;
    const fallbackTitle = `Prompt ${index + 1}`;
    if (typeof prompt === "string")
      return { id: fallbackId, title: fallbackTitle, prompt };
    const record =
      prompt && typeof prompt === "object"
        ? (prompt as Record<string, unknown>)
        : {};
    const text = (value: unknown, fallback: string) =>
      typeof value === "string" && value.trim() ? value : fallback;
    return {
      id: text(record.id, fallbackId),
      title: text(record.title, fallbackTitle),
      prompt: text(record.prompt, ""),
    };
  });
}
