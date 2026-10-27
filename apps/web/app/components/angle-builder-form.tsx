import { useMemo, useState } from "react";
import { Form, Link } from "react-router";

import type { ScriptPrompt } from "@holler/domain";

import { ScriptEditor } from "./script-editor";
import { categoryOptions } from "../lib/prototype-data";
import { momentStatusLabels } from "../lib/moment-status";
import type {
  LibraryResearchField,
  LibraryScript,
  MomentConfiguration,
} from "../lib/operations-types";
import { promptScopeOptions, type PromptScope } from "../lib/prompt-scope";
import { moveItem } from "../lib/reorder";
import { samePromptList } from "../lib/script-prompts";

export type AngleBuilderResult =
  | { readonly error: string }
  | { readonly id: string; readonly published: boolean };

interface AngleBuilderFormProps {
  readonly fields: readonly LibraryResearchField[];
  readonly scripts: readonly LibraryScript[];
  readonly saved: AngleBuilderResult | undefined;
  /**
   * "staff" launches or drafts an angle; "request" is the merchant's version,
   * which only sends the angle to Holler as a draft request.
   */
  readonly mode: "staff" | "request";
  /** An existing angle to reopen and revise. */
  readonly initial?: MomentConfiguration;
  /** False shows the setup without letting it be saved. */
  readonly canManage?: boolean;
}

type PredicateKey =
  | "customer.order_sequence"
  | "order.contains_current_category"
  | "customer.first_order_contains_current_category";

type ConditionNode = {
  id: string;
  kind: "condition";
  predicate: PredicateKey;
  operator: "equals" | "at_least" | "at_most";
  value: number;
  categoryKey: string;
};

type GroupNode = {
  id: string;
  kind: "group";
  operator: "all" | "any" | "not";
  children: RuleNode[];
};

type RuleNode = ConditionNode | GroupNode;

const initialRules: GroupNode = {
  id: "root",
  kind: "group",
  operator: "all",
  children: [
    {
      id: "sequence",
      kind: "condition",
      predicate: "customer.order_sequence",
      operator: "equals",
      value: 2,
      categoryKey: "bottoms",
    },
    {
      id: "exclude-first",
      kind: "group",
      operator: "not",
      children: [
        {
          id: "first-category",
          kind: "condition",
          predicate: "customer.first_order_contains_current_category",
          operator: "equals",
          value: 1,
          categoryKey: "bottoms",
        },
      ],
    },
    {
      id: "current-category",
      kind: "condition",
      predicate: "order.contains_current_category",
      operator: "equals",
      value: 1,
      categoryKey: "bottoms",
    },
  ],
};

const predicateLabels: Record<PredicateKey, string> = {
  "customer.order_sequence": "Customer order sequence",
  "order.contains_current_category": "Current order contains category",
  "customer.first_order_contains_current_category":
    "First order contains category",
};

let localNodeSequence = 0;
function nextNodeId(prefix: string) {
  localNodeSequence += 1;
  return `${prefix}-${localNodeSequence}`;
}

function updateNode(
  root: RuleNode,
  id: string,
  transform: (node: RuleNode) => RuleNode,
): RuleNode {
  if (root.id === id) return transform(root);
  if (root.kind === "condition") return root;
  return {
    ...root,
    children: root.children.map((child) => updateNode(child, id, transform)),
  };
}

function removeNode(root: GroupNode, id: string): GroupNode {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== id)
      .map((child) => (child.kind === "group" ? removeNode(child, id) : child)),
  };
}

function conditionToJson(node: ConditionNode) {
  return {
    predicate: node.predicate,
    version: 1,
    config:
      node.predicate === "customer.order_sequence"
        ? { operator: node.operator, value: node.value }
        : { namespace: "merchant", categoryKey: node.categoryKey },
  };
}

function ruleToJson(node: RuleNode): unknown {
  if (node.kind === "condition") return conditionToJson(node);
  if (node.operator === "not") {
    return { not: ruleToJson(node.children[0] ?? newCondition()) };
  }
  return { [node.operator]: node.children.map(ruleToJson) };
}

function newCondition(): ConditionNode {
  return {
    id: nextNodeId("condition"),
    kind: "condition",
    predicate: "customer.order_sequence",
    operator: "equals",
    value: 2,
    categoryKey: "bottoms",
  };
}

const conditionOperators: readonly ConditionNode["operator"][] = [
  "equals",
  "at_least",
  "at_most",
];

/** Rebuilds the editor tree from saved rule JSON; null if it can't show it. */
function ruleFromJson(value: unknown): RuleNode | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if ("not" in record) {
    const child = ruleFromJson(record.not);
    return child
      ? {
          id: nextNodeId("group"),
          kind: "group",
          operator: "not",
          children: [child],
        }
      : null;
  }
  for (const operator of ["all", "any"] as const) {
    if (!(operator in record)) continue;
    const list = record[operator];
    if (!Array.isArray(list)) return null;
    const children = list.map(ruleFromJson);
    if (children.some((child) => child === null)) return null;
    return {
      id: nextNodeId("group"),
      kind: "group",
      operator,
      children: children as RuleNode[],
    };
  }
  const predicate = record.predicate;
  if (typeof predicate !== "string" || !(predicate in predicateLabels))
    return null;
  const config = (record.config ?? {}) as Record<string, unknown>;
  const condition = newCondition();
  if (predicate === "customer.order_sequence") {
    const operator = conditionOperators.find(
      (item) => item === config.operator,
    );
    if (!operator || typeof config.value !== "number") return null;
    return { ...condition, predicate, operator, value: config.value };
  }
  if (typeof config.categoryKey !== "string") return null;
  return {
    ...condition,
    predicate: predicate as PredicateKey,
    categoryKey: config.categoryKey,
  };
}

/** The editor always edits a group at its root. */
function rootRuleFromJson(value: unknown): GroupNode | null {
  const rule = ruleFromJson(value);
  if (!rule) return null;
  return rule.kind === "group" && rule.operator !== "not"
    ? { ...rule, id: "root" }
    : { id: "root", kind: "group", operator: "all", children: [rule] };
}

function describeRule(node: RuleNode): string {
  if (node.kind === "condition") {
    if (node.predicate === "customer.order_sequence") {
      const operator = {
        equals: "equals",
        at_least: "is at least",
        at_most: "is at most",
      }[node.operator];
      return `customer order sequence ${operator} ${node.value}`;
    }
    const category =
      categoryOptions.find((item) => item.key === node.categoryKey)?.label ??
      node.categoryKey;
    return `${predicateLabels[node.predicate].toLowerCase()} ${category}`;
  }
  const descriptions = node.children.map(describeRule);
  if (node.operator === "not") return `NOT (${descriptions[0] ?? "empty"})`;
  return `(${descriptions.join(node.operator === "all" ? " AND " : " OR ")})`;
}

interface RuleEditorProps {
  readonly node: RuleNode;
  readonly root: boolean;
  readonly onChange: (
    id: string,
    transform: (node: RuleNode) => RuleNode,
  ) => void;
  readonly onRemove: (id: string) => void;
}

function RuleEditor({ node, root, onChange, onRemove }: RuleEditorProps) {
  if (node.kind === "condition") {
    const isSequence = node.predicate === "customer.order_sequence";
    return (
      <div className="rule-row">
        <span className="rule-handle" aria-hidden="true">
          ::
        </span>
        <label>
          <span>Predicate</span>
          <select
            aria-label="Predicate"
            onChange={(event) =>
              onChange(node.id, (current) => ({
                ...(current as ConditionNode),
                predicate: event.target.value as PredicateKey,
              }))
            }
            value={node.predicate}
          >
            {Object.entries(predicateLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {isSequence ? (
          <>
            <label className="rule-compact">
              <span>Operator</span>
              <select
                aria-label="Sequence operator"
                onChange={(event) =>
                  onChange(node.id, (current) => ({
                    ...(current as ConditionNode),
                    operator: event.target.value as ConditionNode["operator"],
                  }))
                }
                value={node.operator}
              >
                <option value="equals">equals</option>
                <option value="at_least">at least</option>
                <option value="at_most">at most</option>
              </select>
            </label>
            <label className="rule-number">
              <span>Order</span>
              <input
                aria-label="Order sequence value"
                min="1"
                onChange={(event) =>
                  onChange(node.id, (current) => ({
                    ...(current as ConditionNode),
                    value: Math.max(1, Number(event.target.value)),
                  }))
                }
                type="number"
                value={node.value}
              />
            </label>
          </>
        ) : (
          <label>
            <span>Current category</span>
            <select
              aria-label="Current category"
              onChange={(event) =>
                onChange(node.id, (current) => ({
                  ...(current as ConditionNode),
                  categoryKey: event.target.value,
                }))
              }
              value={node.categoryKey}
            >
              {categoryOptions.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          aria-label="Remove condition"
          className="icon-button"
          onClick={() => onRemove(node.id)}
          type="button"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <fieldset className={`rule-group rule-group-${node.operator}`}>
      <legend>
        <label>
          <span className="sr-only">Group operator</span>
          <select
            aria-label="Group operator"
            onChange={(event) =>
              onChange(node.id, (current) => {
                const group = current as GroupNode;
                const operator = event.target.value as GroupNode["operator"];
                return {
                  ...group,
                  operator,
                  children:
                    operator === "not"
                      ? [group.children[0] ?? newCondition()]
                      : group.children,
                };
              })
            }
            value={node.operator}
          >
            <option value="all">ALL — every rule</option>
            <option value="any">ANY — at least one</option>
            <option value="not">NOT — invert rule</option>
          </select>
        </label>
        {!root ? (
          <button
            className="text-button danger-text"
            onClick={() => onRemove(node.id)}
            type="button"
          >
            Remove group
          </button>
        ) : null}
      </legend>
      <div className="rule-children">
        {node.children.map((child) => (
          <RuleEditor
            key={child.id}
            node={child}
            onChange={onChange}
            onRemove={onRemove}
            root={false}
          />
        ))}
      </div>
      {node.operator !== "not" ? (
        <div className="rule-actions">
          <button
            className="button button-small"
            onClick={() =>
              onChange(node.id, (current) => ({
                ...(current as GroupNode),
                children: [...(current as GroupNode).children, newCondition()],
              }))
            }
            type="button"
          >
            Add condition
          </button>
          <button
            className="button button-small button-quiet"
            onClick={() =>
              onChange(node.id, (current) => ({
                ...(current as GroupNode),
                children: [
                  ...(current as GroupNode).children,
                  {
                    id: nextNodeId("group"),
                    kind: "group",
                    operator: "all",
                    children: [newCondition()],
                  },
                ],
              }))
            }
            type="button"
          >
            Add group
          </button>
        </div>
      ) : null}
    </fieldset>
  );
}

type SelectedField =
  | {
      readonly kind: "library";
      readonly field: LibraryResearchField;
      readonly required: boolean;
    }
  | {
      readonly kind: "new";
      readonly key: string;
      readonly label: string;
      readonly prompt: string;
      readonly required: boolean;
      readonly scope: PromptScope;
    };

const sourceLabels: Record<LibraryResearchField["source"], string> = {
  platform_default: "Platform",
  merchant_default: "Library",
  research_run: "Library",
};

export function AngleBuilderForm({
  fields,
  scripts,
  saved,
  mode,
  initial,
  canManage = true,
}: AngleBuilderFormProps) {
  const request = mode === "request";
  const readOnly = !canManage;
  const launched = initial !== undefined && initial.status !== "draft";
  const [loadedRules] = useState(() =>
    initial ? rootRuleFromJson(initial.cohortExpression) : null,
  );
  const [rules, setRules] = useState<GroupNode>(loadedRules ?? initialRules);
  const [selected, setSelected] = useState<SelectedField[]>(() =>
    initial
      ? initial.fields.flatMap((item) => {
          const field = fields.find(
            (candidate) => candidate.fieldId === item.fieldId,
          );
          return field
            ? [{ kind: "library" as const, field, required: item.required }]
            : [];
        })
      : fields
          .filter((field) => field.includedByDefault)
          .map((field) => ({
            kind: "library",
            field,
            required: field.required,
          })),
  );
  const missingFields = initial
    ? initial.fields.length -
      initial.fields.filter((item) =>
        fields.some((field) => field.fieldId === item.fieldId),
      ).length
    : 0;
  const [libraryPick, setLibraryPick] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [newScope, setNewScope] = useState<PromptScope>("order");
  const [scriptId, setScriptId] = useState(
    () =>
      scripts.find((script) => script.id === initial?.baseScriptId)?.id ??
      scripts[0]?.id ??
      "",
  );
  const baseScript = scripts.find((script) => script.id === scriptId);
  const [prompts, setPrompts] = useState<ScriptPrompt[]>(() => [
    ...(initial?.prompts ?? scripts[0]?.prompts ?? []),
  ]);
  const scriptCustomized =
    baseScript !== undefined && !samePromptList(prompts, baseScript.prompts);
  const [notice, setNotice] = useState<string | null>(null);
  const available = fields.filter(
    (field) =>
      !selected.some(
        (item) => item.kind === "library" && item.field.id === field.id,
      ),
  );
  const fieldsJson = JSON.stringify(
    selected.map((item) =>
      item.kind === "library"
        ? {
            kind: "library",
            fieldVersionId: item.field.id,
            required: item.required,
          }
        : {
            kind: "new",
            label: item.label,
            prompt: item.prompt,
            required: item.required,
            scope: item.scope,
          },
    ),
  );
  const updateSelected = (index: number, required: boolean) =>
    setSelected((current) =>
      current.map((item, i) => (i === index ? { ...item, required } : item)),
    );
  const ruleJson = useMemo(
    () => JSON.stringify(ruleToJson(rules), null, 2),
    [rules],
  );

  function handleNodeChange(
    id: string,
    transform: (node: RuleNode) => RuleNode,
  ) {
    setRules((current) => updateNode(current, id, transform) as GroupNode);
    setNotice(null);
  }

  return (
    <Form method="post" className="builder-layout">
      <fieldset className="builder-fieldset" disabled={readOnly}>
        {initial ? (
          <input name="momentId" type="hidden" value={initial.id} />
        ) : null}
        <input name="cohortExpression" type="hidden" value={ruleJson} />
        <input name="fields" type="hidden" value={fieldsJson} />
        {baseScript ? (
          <input
            name="script"
            type="hidden"
            value={JSON.stringify({
              baseScriptVersionId: baseScript.versionId,
              prompts,
            })}
          />
        ) : null}
        <div className="builder-main">
          {initial?.requestedByMerchant && !launched ? (
            <p className="inline-notice">
              Requested by the merchant from the Shopify app. Review their
              setup, then save it as a draft or launch it.
            </p>
          ) : null}
          {initial && (!loadedRules || missingFields > 0) ? (
            <p className="inline-notice" role="alert">
              {!loadedRules
                ? "The saved qualification rules can’t be shown in this editor, so the defaults are shown instead. "
                : ""}
              {missingFields > 0
                ? `${missingFields} saved research ${missingFields === 1 ? "field is" : "fields are"} no longer in the library and ${missingFields === 1 ? "was" : "were"} left out. `
                : ""}
              Check before saving.
            </p>
          ) : null}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">1</span>
                <h2>Angle basics</h2>
              </div>
              <span
                className={`status-pill status-${initial?.status ?? "draft"}`}
              >
                {momentStatusLabels[initial?.status ?? "draft"]}
              </span>
            </div>
            <div className="form-grid two-column">
              <label>
                <span>Name</span>
                <input
                  {...(initial
                    ? { defaultValue: initial.name }
                    : request
                      ? {
                          placeholder:
                            "e.g. Why customers come back for a second order",
                        }
                      : { defaultValue: "Second-order category transition" })}
                  name="name"
                  required
                />
              </label>
              <label>
                <span>Trigger</span>
                <select defaultValue="order_completed">
                  <option value="order_completed">Order completed</option>
                </select>
              </label>
              <label className="full-span">
                <span>Research objective</span>
                <textarea
                  {...(initial
                    ? { defaultValue: initial.objective }
                    : request
                      ? {
                          placeholder:
                            "What do you want to learn from these customers?",
                        }
                      : {
                          defaultValue:
                            "Learn why repeat customers move into a new category on their second purchase.",
                        })}
                  name="objective"
                  required
                />
              </label>
            </div>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">2</span>
                <h2>Qualification logic</h2>
              </div>
              <span className="registry-label">3 registered predicates</span>
            </div>
            <p className="helper-copy">
              Rules use the merchant’s current category assignments. If order
              history or catalog enrichment is incomplete, qualification fails
              closed for review.
            </p>
            <RuleEditor
              node={rules}
              onChange={handleNodeChange}
              onRemove={(id) => setRules((current) => removeNode(current, id))}
              root
            />
            <div className="logic-summary">
              <span>Plain-language summary</span>
              <strong>{describeRule(rules)}</strong>
            </div>
            {request ? null : (
              <details className="json-preview">
                <summary>View versioned rule JSON</summary>
                <pre>{ruleJson}</pre>
              </details>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">3</span>
                <h2>Research fields</h2>
              </div>
              <span className="registry-label">
                {selected.length} selected ·{" "}
                {selected.filter((item) => item.required).length} required
              </span>
            </div>
            {request ? (
              <p className="helper-copy">
                Starts from your default questions. Add, remove, or reorder them
                for this angle; researchers ask them in this order.
              </p>
            ) : (
              <p className="helper-copy">
                Starts from your library defaults (
                <Link to="/admin/research-fields">edit defaults</Link>). Changes
                here apply to this run only. Researchers see fields in this
                order.
              </p>
            )}
            <ol className="ordered-list">
              {selected.map((item, index) => {
                const label =
                  item.kind === "library" ? item.field.label : item.label;
                return (
                  <li
                    className="ordered-row"
                    key={item.kind === "library" ? item.field.id : item.key}
                  >
                    <span className="ordered-row__number" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span className="field-summary">
                      <strong>{label}</strong>
                      <small>
                        {item.kind === "library"
                          ? item.field.prompt
                          : item.prompt || label}
                      </small>
                      <span className="field-summary__meta">
                        <span className="field-source">
                          {item.kind === "library"
                            ? sourceLabels[item.field.source]
                            : "New · saved to library"}
                        </span>
                      </span>
                    </span>
                    <div className="row-toggles">
                      <label className="toggle-label">
                        <input
                          checked={item.required}
                          onChange={(event) =>
                            updateSelected(index, event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>Required</span>
                      </label>
                    </div>
                    <div className="row-controls">
                      <button
                        aria-label={`Move “${label}” up`}
                        className="button button-small button-quiet"
                        disabled={index === 0}
                        onClick={() =>
                          setSelected((current) => moveItem(current, index, -1))
                        }
                        type="button"
                      >
                        ↑
                      </button>
                      <button
                        aria-label={`Move “${label}” down`}
                        className="button button-small button-quiet"
                        disabled={index === selected.length - 1}
                        onClick={() =>
                          setSelected((current) => moveItem(current, index, 1))
                        }
                        type="button"
                      >
                        ↓
                      </button>
                      <button
                        className="text-button danger-text"
                        onClick={() =>
                          setSelected((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
            {available.length ? (
              <div className="inline-add">
                <label>
                  <span>Add from library</span>
                  <select
                    onChange={(event) => setLibraryPick(event.target.value)}
                    value={libraryPick}
                  >
                    <option value="">Choose a field…</option>
                    {available.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button button-quiet"
                  disabled={!libraryPick}
                  onClick={() => {
                    const field = available.find(
                      (candidate) => candidate.id === libraryPick,
                    );
                    if (field)
                      setSelected((current) => [
                        ...current,
                        { kind: "library", field, required: field.required },
                      ]);
                    setLibraryPick("");
                  }}
                  type="button"
                >
                  Add field
                </button>
              </div>
            ) : null}
            <div className="inline-add inline-add--new-field">
              <label>
                <span>New field</span>
                <input
                  maxLength={160}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="e.g. Moisturizer liquidity"
                  value={newLabel}
                />
              </label>
              <label>
                <span>Question (optional)</span>
                <input
                  maxLength={2000}
                  onChange={(event) => setNewPrompt(event.target.value)}
                  placeholder="What researchers ask"
                  value={newPrompt}
                />
              </label>
              <label>
                <span>Asked about</span>
                <select
                  onChange={(event) =>
                    setNewScope(event.target.value as PromptScope)
                  }
                  value={newScope}
                >
                  {promptScopeOptions.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button button-quiet"
                disabled={
                  !newLabel.trim() ||
                  selected.some(
                    (item) =>
                      (item.kind === "library"
                        ? item.field.label
                        : item.label
                      ).toLowerCase() === newLabel.trim().toLowerCase(),
                  )
                }
                onClick={() => {
                  setSelected((current) => [
                    ...current,
                    {
                      kind: "new",
                      key: `new-${Date.now()}`,
                      label: newLabel.trim(),
                      prompt: newPrompt.trim(),
                      required: false,
                      scope: newScope,
                    },
                  ]);
                  setNewLabel("");
                  setNewPrompt("");
                }}
                type="button"
              >
                Create field
              </button>
            </div>
            {request ? null : (
              <p className="helper-copy">
                New fields are open-answer questions saved to the library, so
                later runs can reuse them. Adjust their type or options under
                Admin → Research fields.
              </p>
            )}
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">4</span>
                <h2>Interview script</h2>
              </div>
              <span className="registry-label">
                {scriptCustomized ? "Adapted for this run" : "Library script"}
              </span>
            </div>
            {scripts.length ? (
              <>
                <p className="helper-copy">
                  Edits here apply to this run only; the library script stays as
                  it is. You can adjust the run’s script after launch too.
                </p>
                <label className="script-name">
                  <span>Start from</span>
                  <select
                    onChange={(event) => {
                      const next = scripts.find(
                        (script) => script.id === event.target.value,
                      );
                      if (!next) return;
                      if (
                        scriptCustomized &&
                        !window.confirm(
                          "Replace your edits with the steps from this script?",
                        )
                      )
                        return;
                      setScriptId(next.id);
                      setPrompts([...next.prompts]);
                    }}
                    value={scriptId}
                  >
                    {scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.name} v{script.version}
                      </option>
                    ))}
                  </select>
                </label>
                <ScriptEditor onChange={setPrompts} prompts={prompts} />
                {scriptCustomized && baseScript ? (
                  <button
                    className="text-button"
                    onClick={() => setPrompts([...baseScript.prompts])}
                    type="button"
                  >
                    Reset to {baseScript.name} v{baseScript.version}
                  </button>
                ) : null}
              </>
            ) : (
              <p className="inline-notice">
                {request ? (
                  "Holler will choose the interview script for this angle."
                ) : (
                  <>
                    No library scripts yet.{" "}
                    <Link to="/admin/scripts?script=new">Create one</Link>{" "}
                    before launching.
                  </>
                )}
              </p>
            )}
          </section>
        </div>

        <aside className="builder-summary panel">
          <p className="eyebrow">
            {request
              ? "Request summary"
              : launched
                ? "Setup summary"
                : "Launch checklist"}
          </p>
          <h2>
            {request
              ? "Ready to send"
              : launched
                ? "Running"
                : "Ready for review"}
          </h2>
          <ul className="check-list">
            <li>Order-completed trigger</li>
            <li>Current-category logic</li>
            <li>History fails closed</li>
            <li>
              {selected.length} research fields,{" "}
              {selected.filter((item) => item.required).length} required
            </li>
            <li>
              {baseScript
                ? `Script: ${baseScript.name} v${baseScript.version}${
                    scriptCustomized ? ", adapted for this run" : ""
                  }`
                : "No script selected"}
            </li>
          </ul>
          <label>
            <span>Weekly interview target</span>
            <input
              defaultValue={initial?.weeklyTarget ?? 12}
              min="1"
              name="weeklyTarget"
              type="number"
            />
          </label>
          {readOnly ? (
            <p className="helper-copy">
              Only research managers and merchant admins can change an angle’s
              setup.
            </p>
          ) : launched ? (
            <>
              <button
                className="button button-primary button-full"
                name="intent"
                type="submit"
                value="save"
              >
                Save changes
              </button>
              <p className="helper-copy">
                Orders queued from now on use the saved setup. Calls already in
                the queue keep the setup they were queued with.
              </p>
            </>
          ) : request ? (
            <button
              className="button button-primary button-full"
              name="intent"
              type="submit"
              value="draft"
            >
              Send request
            </button>
          ) : (
            <>
              <button
                className="button button-primary button-full"
                name="intent"
                type="submit"
                value="publish"
              >
                Launch angle
              </button>
              <button
                className="button button-quiet button-full"
                name="intent"
                type="submit"
                value="draft"
              >
                Save draft
              </button>
            </>
          )}
          {notice ? <p className="save-notice">{notice}</p> : null}
          {saved && "error" in saved ? (
            <p className="save-notice save-notice--error" role="alert">
              {saved.error}
            </p>
          ) : saved && request ? (
            <p className="save-notice" role="status">
              Request sent. Holler will review it and follow up before anything
              goes live.
            </p>
          ) : saved && launched ? (
            <p className="save-notice" role="status">
              Changes saved.
            </p>
          ) : saved ? (
            <p className="save-notice">
              {saved.published ? "Live" : "Draft saved"}: {saved.id}
            </p>
          ) : null}
        </aside>
      </fieldset>
    </Form>
  );
}
