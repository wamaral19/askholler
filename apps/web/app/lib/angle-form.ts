import type { MomentFieldSelection, SaveMomentInput } from "./operations-types";
import { isPromptScope } from "./prompt-scope";
import { jsonFormValue } from "./route-forms";
import { promptsFromForm } from "./script-prompts";

/** Inline messages for the angle builder's rejected saves. */
export const angleSaveErrors: Readonly<Record<string, string>> = {
  FIELD_SET_REQUIRED:
    "Add at least one research field, from the library or as a new field.",
  INVALID_FIELD_SET:
    "One of the research fields is unavailable or listed twice. New fields need a name up to 160 characters.",
  INVALID_RESEARCH_MOMENT:
    "Check the name, objective, weekly target (1–10,000), and rules.",
  INVALID_SCRIPT:
    "Every script step needs a title and text. Scripts hold 1–40 steps.",
  PINNED_SCRIPT_UNAVAILABLE:
    "No published interview script is available for this merchant. Add one under Admin → Scripts.",
};

function fieldsFromForm(value: unknown): MomentFieldSelection[] {
  if (!Array.isArray(value))
    throw new Response("Invalid fields", { status: 400 });
  return value.map((item: Record<string, unknown>) =>
    item.kind === "new"
      ? {
          kind: "new",
          label: String(item.label ?? ""),
          prompt: String(item.prompt ?? ""),
          required: item.required === true,
          scope: isPromptScope(item.scope) ? item.scope : "order",
        }
      : {
          kind: "library",
          fieldVersionId: String(item.fieldVersionId ?? ""),
          required: item.required === true,
        },
  );
}

/** Reads the angle builder form posted by AngleBuilderForm. */
export function momentInputFromForm(form: FormData): SaveMomentInput {
  const script = form.get("script")
    ? (jsonFormValue(form, "script") as Record<string, unknown> | null)
    : null;
  return {
    name: String(form.get("name") ?? "").trim(),
    objective: String(form.get("objective") ?? "").trim(),
    weeklyTarget: Number(form.get("weeklyTarget") ?? 0),
    cohortExpression: jsonFormValue(form, "cohortExpression"),
    fields: fieldsFromForm(jsonFormValue(form, "fields")),
    ...(script
      ? {
          script: {
            baseScriptVersionId: String(script.baseScriptVersionId ?? ""),
            prompts: promptsFromForm(script.prompts),
          },
        }
      : {}),
    publish: form.get("intent") === "publish",
  };
}
