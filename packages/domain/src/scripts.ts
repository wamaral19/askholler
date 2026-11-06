import { z } from "zod";

import { promptScopeSchema } from "./research-fields";

export const promptDeliverySchema = z
  .object({
    requirement: z.enum(["core", "branch", "optional", "conditional", "close"]),
    /** Stable machine-readable condition supplied by the study author. */
    conditionKey: z.string().trim().min(1).max(120).optional(),
    /** Plain-language instruction shown to the researcher. */
    conditionLabel: z.string().trim().min(1).max(500).optional(),
    /** Context for delivery; never read verbatim to the participant. */
    interviewerNote: z.string().trim().min(1).max(1000).optional(),
    branchGroup: z.string().trim().min(1).max(120).optional(),
    probeBranches: z
      .array(
        z.object({
          conditionKey: z.string().trim().min(1).max(120),
          conditionLabel: z.string().trim().min(1).max(500),
          probe: z.string().trim().min(1).max(500),
        }),
      )
      .max(12)
      .optional(),
  })
  .strict();

export const scriptPromptSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  title: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(2000),
  /** Defaults to "order" when absent. */
  scope: promptScopeSchema.optional(),
  /** Optional, approved follow-ups. Researchers use these selectively. */
  probes: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
  /** Internal rationale; never read to the participant. */
  researchGoal: z.string().trim().max(1000).optional(),
  /** Core questions should be explored consistently across comparison groups. */
  core: z.boolean().optional(),
  /** Study-specific sequencing and branching guidance. */
  delivery: promptDeliverySchema.optional(),
  /** Picker metadata for approved library questions; independent of coded evidence. */
  library: z
    .object({
      questionId: z.string().trim().min(1).max(40),
      group: z.string().trim().min(1).max(120),
      category: z.string().trim().min(1).max(120),
      researchObjective: z.string().trim().min(1).max(200),
      methodCode: z.string().trim().min(1).max(80),
      role: z.enum(["Core", "Optional", "Close"]),
      eligibleSegment: z.string().trim().min(1).max(100),
      suggestedTrigger: z.string().trim().min(1).max(100),
      targetTags: z.array(z.string().trim().min(1).max(100)).max(12),
      estimatedSeconds: z.number().int().positive().max(600),
    })
    .optional(),
});

/** script_versions.content for scripts authored in the app. */
export const scriptContentV1Schema = z.object({
  prompts: z.array(scriptPromptSchema).min(1).max(100),
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
    const scope = promptScopeSchema.safeParse(record.scope);
    const probes = Array.isArray(record.probes)
      ? record.probes.filter(
          (probe): probe is string =>
            typeof probe === "string" && !!probe.trim(),
        )
      : [];
    return {
      id: text(record.id, fallbackId),
      title: text(record.title, fallbackTitle),
      prompt: text(record.prompt, ""),
      ...(scope.success ? { scope: scope.data } : {}),
      ...(probes.length ? { probes } : {}),
      ...(typeof record.researchGoal === "string" && record.researchGoal.trim()
        ? { researchGoal: record.researchGoal }
        : {}),
      ...(typeof record.core === "boolean" ? { core: record.core } : {}),
      ...(record.delivery !== undefined &&
      promptDeliverySchema.safeParse(record.delivery).success
        ? { delivery: promptDeliverySchema.parse(record.delivery) }
        : {}),
      ...(record.library !== undefined &&
      scriptPromptSchema.shape.library.safeParse(record.library).success
        ? { library: scriptPromptSchema.shape.library.parse(record.library) }
        : {}),
    };
  });
}
