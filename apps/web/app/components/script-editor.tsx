import type { ScriptPrompt } from "@holler/domain";

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
                <span>What the researcher says</span>
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
