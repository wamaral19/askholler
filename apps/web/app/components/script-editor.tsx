import type { ScriptPrompt } from "@holler/domain";

import { promptScopeOptions } from "../lib/prompt-scope";
import { moveItem } from "../lib/reorder";
import { newPromptId } from "../lib/script-prompts";

interface ScriptEditorProps {
  readonly prompts: readonly ScriptPrompt[];
  readonly onChange: (prompts: ScriptPrompt[]) => void;
  /** Hidden input carrying the prompts as JSON; omit when a parent submits. */
  readonly name?: string;
  readonly readOnly?: boolean;
}

/** Ordered, editable interview prompts. */
export function ScriptEditor({
  prompts,
  onChange,
  name,
  readOnly = false,
}: ScriptEditorProps) {
  const update = (index: number, patch: Partial<ScriptPrompt>) =>
    onChange(
      prompts.map((prompt, i) =>
        i === index ? { ...prompt, ...patch } : prompt,
      ),
    );
  const updateDelivery = (
    index: number,
    patch: Partial<NonNullable<ScriptPrompt["delivery"]>>,
  ) => {
    const current = prompts[index];
    if (!current) return;
    update(index, {
      delivery: {
        requirement: current.delivery?.requirement ?? "core",
        ...current.delivery,
        ...patch,
      },
    });
  };
  return (
    <div className="prompt-editor">
      {name ? (
        <input name={name} type="hidden" value={JSON.stringify(prompts)} />
      ) : null}
      <ol className="prompt-list">
        {prompts.map((prompt, index) => (
          <li className="prompt-row" key={prompt.id}>
            <span className="prompt-row__number" aria-hidden="true">
              {index + 1}
            </span>
            <div className="prompt-row__fields">
              <label>
                <span>Step title</span>
                <input
                  maxLength={120}
                  onChange={(event) =>
                    update(index, { title: event.target.value })
                  }
                  readOnly={readOnly}
                  required
                  value={prompt.title}
                />
              </label>
              <label>
                <span>Asked about</span>
                <select
                  disabled={readOnly}
                  onChange={(event) =>
                    update(index, {
                      scope: event.target.value as NonNullable<
                        ScriptPrompt["scope"]
                      >,
                    })
                  }
                  value={prompt.scope ?? "order"}
                >
                  {promptScopeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Core question</span>
                <textarea
                  maxLength={2000}
                  onChange={(event) =>
                    update(index, { prompt: event.target.value })
                  }
                  readOnly={readOnly}
                  required
                  rows={2}
                  value={prompt.prompt}
                />
              </label>
              <label>
                <span>Optional probes · one per line</span>
                <textarea
                  maxLength={6000}
                  onChange={(event) =>
                    update(index, {
                      probes: event.target.value
                        .split("\n")
                        .map((probe) => probe.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={"Tell me more about that.\nWhat happened next?"}
                  readOnly={readOnly}
                  rows={3}
                  value={(prompt.probes ?? []).join("\n")}
                />
              </label>
              <label>
                <span>Research goal · internal</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) =>
                    update(index, { researchGoal: event.target.value })
                  }
                  placeholder="What this part of the story should help us understand"
                  readOnly={readOnly}
                  rows={2}
                  value={prompt.researchGoal ?? ""}
                />
              </label>
              <label>
                <span>Delivery</span>
                <select
                  disabled={readOnly}
                  onChange={(event) =>
                    updateDelivery(index, {
                      requirement: event.target.value as NonNullable<
                        ScriptPrompt["delivery"]
                      >["requirement"],
                    })
                  }
                  value={prompt.delivery?.requirement ?? "core"}
                >
                  <option value="core">Core</option>
                  <option value="branch">Branch</option>
                  <option value="optional">Optional</option>
                  <option value="conditional">Conditional</option>
                  <option value="close">Close</option>
                </select>
              </label>
              {prompt.delivery?.requirement === "branch" ||
              prompt.delivery?.requirement === "conditional" ||
              prompt.delivery?.requirement === "optional" ? (
                <label>
                  <span>Ask when · researcher guidance</span>
                  <input
                    maxLength={500}
                    onChange={(event) =>
                      updateDelivery(index, {
                        conditionLabel: event.target.value || undefined,
                      })
                    }
                    placeholder="e.g. This product appears on at least two kept orders"
                    readOnly={readOnly}
                    value={prompt.delivery.conditionLabel ?? ""}
                  />
                </label>
              ) : null}
              <label>
                <span>Interviewer note · never read aloud</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) =>
                    updateDelivery(index, {
                      interviewerNote: event.target.value || undefined,
                    })
                  }
                  placeholder="How to deliver this question without leading"
                  readOnly={readOnly}
                  rows={2}
                  value={prompt.delivery?.interviewerNote ?? ""}
                />
              </label>
              <label className="toggle-label prompt-core-toggle">
                <input
                  checked={prompt.core === true}
                  disabled={readOnly}
                  onChange={(event) =>
                    update(index, { core: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>Core across comparison groups</span>
              </label>
            </div>
            {readOnly ? null : (
              <div className="row-controls">
                <button
                  aria-label={`Move “${prompt.title || `step ${index + 1}`}” up`}
                  className="button button-small button-quiet"
                  disabled={index === 0}
                  onClick={() => onChange(moveItem(prompts, index, -1))}
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move “${prompt.title || `step ${index + 1}`}” down`}
                  className="button button-small button-quiet"
                  disabled={index === prompts.length - 1}
                  onClick={() => onChange(moveItem(prompts, index, 1))}
                  type="button"
                >
                  ↓
                </button>
                <button
                  className="text-button danger-text"
                  disabled={prompts.length === 1}
                  onClick={() =>
                    onChange(prompts.filter((_, i) => i !== index))
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {readOnly ? null : (
        <button
          className="button button-small"
          disabled={prompts.length >= 40}
          onClick={() =>
            onChange([...prompts, { id: newPromptId(), title: "", prompt: "" }])
          }
          type="button"
        >
          Add step
        </button>
      )}
    </div>
  );
}
