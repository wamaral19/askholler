import { useMemo, useState } from "react";
import { Form, Link } from "react-router";

import type { ScriptPrompt } from "@holler/domain";

import { categoryOptions } from "../lib/prototype-data";
import { momentStatusLabels } from "../lib/moment-status";
import type {
  CatalogProductOption,
  LibraryResearchField,
  LibraryScript,
  MomentConfiguration,
} from "../lib/operations-types";
import { promptScopeOptions, type PromptScope } from "../lib/prompt-scope";
import { moveItem } from "../lib/reorder";

const automaticIntroduction: readonly ScriptPrompt[] = [
  {
    id: "intro-context",
    title: "Introduction",
    prompt:
      "Thanks for picking up. I’m <researcher name>, calling on behalf of <brand>. We were hoping to pick your brain for a few minutes about <event that just happened>. Do you have a few minutes?",
    researchGoal: "Introduce the call, set context, and confirm availability.",
    core: true,
  },
  {
    id: "recording-consent",
    title: "Recording consent",
    prompt: "Are you okay with me recording the call?",
    researchGoal: "Obtain explicit recording consent before recording.",
    core: true,
  },
];

const automaticQuestionIds = new Set(
  automaticIntroduction.map((prompt) => prompt.id),
);

interface QuestionChoice {
  readonly key: string;
  readonly prompt: ScriptPrompt;
  readonly source: "holler" | "merchant" | "study";
}

function questionRequirement(
  question: QuestionChoice,
): NonNullable<ScriptPrompt["delivery"]>["requirement"] {
  if (question.prompt.delivery) return question.prompt.delivery.requirement;
  return question.prompt.library?.role === "Optional"
    ? "optional"
    : question.prompt.library?.role === "Close"
      ? "close"
      : "core";
}

export type AngleBuilderResult =
  | { readonly error: string }
  | { readonly id: string; readonly published: boolean };

interface AngleBuilderFormProps {
  readonly fields: readonly LibraryResearchField[];
  readonly products: readonly CatalogProductOption[];
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
  | "customer.distinct_orders_with_product"
  | "customer.distinct_orders_with_category"
  | "order.contains_current_category"
  | "customer.first_order_contains_current_category"
  | "order.contains_sku"
  | "order.contains_size";

type ConditionNode = {
  id: string;
  kind: "condition";
  predicate: PredicateKey;
  operator: "equals" | "at_least" | "at_most";
  value: number | "";
  categoryKey: string;
  textValue: string;
  productTitles: string[];
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
      textValue: "",
      productTitles: [],
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
          textValue: "",
          productTitles: [],
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
      textValue: "",
      productTitles: [],
    },
  ],
};

const predicateLabels: Record<PredicateKey, string> = {
  "customer.order_sequence": "Customer order sequence",
  "customer.distinct_orders_with_product": "Lifetime orders with product",
  "customer.distinct_orders_with_category": "Lifetime orders in category",
  "order.contains_current_category": "Current order contains category",
  "customer.first_order_contains_current_category":
    "First order contains category",
  "order.contains_sku": "Current order contains SKU",
  "order.contains_size": "Current order contains size",
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
        : node.predicate === "customer.distinct_orders_with_product"
          ? {
              operator: node.operator,
              value: node.value,
              productTitles: node.productTitles,
            }
          : node.predicate === "customer.distinct_orders_with_category"
            ? {
                operator: node.operator,
                value: node.value,
                namespace: "merchant",
                categoryKey: node.categoryKey,
              }
            : node.predicate === "order.contains_sku"
              ? { sku: node.textValue.trim() }
              : node.predicate === "order.contains_size"
                ? { size: node.textValue.trim() }
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
    textValue: "",
    productTitles: [],
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
  if (
    predicate === "customer.distinct_orders_with_product" ||
    predicate === "customer.distinct_orders_with_category"
  ) {
    const operator = conditionOperators.find(
      (item) => item === config.operator,
    );
    if (!operator || typeof config.value !== "number") return null;
    if (predicate === "customer.distinct_orders_with_product") {
      const productTitles = Array.isArray(config.productTitles)
        ? config.productTitles.filter(
            (title): title is string => typeof title === "string",
          )
        : typeof config.productTitle === "string"
          ? [config.productTitle]
          : [];
      if (!productTitles.length) return null;
      return {
        ...condition,
        predicate,
        operator,
        value: config.value,
        productTitles,
      };
    }
    if (typeof config.categoryKey !== "string") return null;
    return {
      ...condition,
      predicate,
      operator,
      value: config.value,
      categoryKey: config.categoryKey,
    };
  }
  if (
    predicate === "order.contains_sku" ||
    predicate === "order.contains_size"
  ) {
    const key = predicate === "order.contains_sku" ? "sku" : "size";
    if (typeof config[key] !== "string") return null;
    return { ...condition, predicate, textValue: config[key] };
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

/** The saved rules as one plain-language sentence; null if unreadable. */
export function describeCohortExpression(value: unknown): string | null {
  const rule = rootRuleFromJson(value);
  if (!rule) return null;
  const description = describeRule(
    rule.children.length === 1 ? (rule.children[0] ?? rule) : rule,
  ).replace(/^\((.*)\)$/, "$1");
  return description.charAt(0).toUpperCase() + description.slice(1);
}

function describeRule(node: RuleNode): string {
  if (node.kind === "condition") {
    if (
      node.predicate === "customer.order_sequence" ||
      node.predicate === "customer.distinct_orders_with_product" ||
      node.predicate === "customer.distinct_orders_with_category"
    ) {
      const operator = {
        equals: "equals",
        at_least: "is at least",
        at_most: "is at most",
      }[node.operator];
      if (node.predicate === "customer.order_sequence")
        return `customer order sequence ${operator} ${node.value === "" ? "…" : node.value}`;
      if (node.predicate === "customer.distinct_orders_with_product")
        return `lifetime kept orders with ${node.productTitles.join(", ") || "…"} ${operator} ${node.value === "" ? "…" : node.value}`;
      const category =
        categoryOptions.find((item) => item.key === node.categoryKey)?.label ??
        node.categoryKey;
      return `lifetime kept orders in ${category} ${operator} ${node.value === "" ? "…" : node.value}`;
    }
    if (node.predicate === "order.contains_sku")
      return `current order contains SKU ${node.textValue || "…"}`;
    if (node.predicate === "order.contains_size")
      return `current order contains size ${node.textValue || "…"}`;
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
  readonly products: readonly CatalogProductOption[];
  readonly root: boolean;
  readonly onChange: (
    id: string,
    transform: (node: RuleNode) => RuleNode,
  ) => void;
  readonly onRemove: (id: string) => void;
}

function RuleEditor({
  node,
  products,
  root,
  onChange,
  onRemove,
}: RuleEditorProps) {
  if (node.kind === "condition") {
    const isSequence = node.predicate === "customer.order_sequence";
    const isHistoricalProduct =
      node.predicate === "customer.distinct_orders_with_product";
    const isHistoricalCategory =
      node.predicate === "customer.distinct_orders_with_category";
    const isCount = isSequence || isHistoricalProduct || isHistoricalCategory;
    const isLineValue =
      node.predicate === "order.contains_sku" ||
      node.predicate === "order.contains_size";
    return (
      <div
        className={`rule-row ${isCount ? "rule-row--count" : ""} ${isHistoricalProduct || isHistoricalCategory ? "rule-row--count-subject" : ""}`}
      >
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
        {isCount ? (
          <>
            {isHistoricalProduct ? (
              <div className="rule-product-picker">
                <span>Product</span>
                <details className="rule-multiselect">
                  <summary>
                    {node.productTitles.length
                      ? `${node.productTitles[0]}${node.productTitles.length > 1 ? ` +${node.productTitles.length - 1}` : ""}`
                      : "Select products"}
                  </summary>
                  <div>
                    {products.map((product) => (
                      <label key={product.id}>
                        <input
                          checked={node.productTitles.includes(product.title)}
                          onChange={(event) =>
                            onChange(node.id, (current) => {
                              const condition = current as ConditionNode;
                              return {
                                ...condition,
                                productTitles: event.target.checked
                                  ? [...condition.productTitles, product.title]
                                  : condition.productTitles.filter(
                                      (title) => title !== product.title,
                                    ),
                              };
                            })
                          }
                          type="checkbox"
                        />
                        <span>{product.title}</span>
                      </label>
                    ))}
                  </div>
                </details>
                {!products.length ? (
                  <small>No catalog products are available yet.</small>
                ) : null}
              </div>
            ) : null}
            {isHistoricalCategory ? (
              <label>
                <span>Category</span>
                <select
                  aria-label="Lifetime category"
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
            ) : null}
            <label className="rule-compact">
              <span>Operator</span>
              <select
                aria-label={isSequence ? "Sequence operator" : "Count operator"}
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
              <span>{isSequence ? "Order" : "Count"}</span>
              <input
                aria-label={
                  isSequence ? "Order sequence value" : "Order count value"
                }
                min={isSequence ? "1" : "0"}
                onChange={(event) =>
                  onChange(node.id, (current) => ({
                    ...(current as ConditionNode),
                    value:
                      event.target.value === ""
                        ? ""
                        : Number(event.target.value),
                  }))
                }
                onBlur={() =>
                  onChange(node.id, (current) => {
                    const condition = current as ConditionNode;
                    const minimum = isSequence ? 1 : 0;
                    return {
                      ...condition,
                      value:
                        condition.value === "" || condition.value < minimum
                          ? minimum
                          : condition.value,
                    };
                  })
                }
                required
                type="number"
                value={node.value}
              />
            </label>
          </>
        ) : isLineValue ? (
          <label>
            <span>
              {node.predicate === "order.contains_sku" ? "SKU" : "Size"}
            </span>
            <input
              aria-label={
                node.predicate === "order.contains_sku" ? "SKU" : "Size"
              }
              maxLength={160}
              onChange={(event) =>
                onChange(node.id, (current) => ({
                  ...(current as ConditionNode),
                  textValue: event.target.value,
                }))
              }
              placeholder={
                node.predicate === "order.contains_sku"
                  ? "e.g. BUCK-NVY-M"
                  : "e.g. M"
              }
              required
              value={node.textValue}
            />
          </label>
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
            products={products}
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
  products,
  scripts,
  saved,
  mode,
  initial,
  canManage = true,
}: AngleBuilderFormProps) {
  const request = mode === "request";
  const readOnly = !canManage;
  const launched = initial !== undefined && initial.status !== "draft";
  const [activeStep, setActiveStep] = useState<1 | 2 | 3 | 4>(1);
  const [studyName, setStudyName] = useState(initial?.name ?? "");
  const [businessQuestion, setBusinessQuestion] = useState(
    initial?.businessQuestion ?? "",
  );
  const [researchObjective, setResearchObjective] = useState(
    initial?.objective ?? "",
  );
  const [weeklyTarget, setWeeklyTarget] = useState(
    initial?.weeklyTarget ? String(initial.weeklyTarget) : "",
  );
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
  const baseScript =
    scripts.find((script) => script.id === initial?.baseScriptId) ?? scripts[0];
  const libraryQuestions: QuestionChoice[] = scripts.flatMap((script) =>
    script.prompts
      .filter((prompt) => !automaticQuestionIds.has(prompt.id))
      .map((prompt) => ({
        key: `${script.id}:${prompt.id}`,
        prompt,
        source: script.editable ? ("merchant" as const) : ("holler" as const),
      })),
  );
  const [selectedQuestions, setSelectedQuestions] = useState<QuestionChoice[]>(
    () =>
      (initial?.prompts ?? [])
        .filter(
          (prompt) =>
            !automaticQuestionIds.has(prompt.id) &&
            !/permission|recording consent/i.test(prompt.title),
        )
        .map((prompt) => {
          const library = libraryQuestions.find(
            (candidate) =>
              candidate.prompt.title === prompt.title &&
              candidate.prompt.prompt === prompt.prompt,
          );
          return (
            library ?? {
              key: `study:${prompt.id}`,
              prompt,
              source: "study" as const,
            }
          );
        }),
  );
  const [questionSearch, setQuestionSearch] = useState("");
  const [questionGroup, setQuestionGroup] = useState("");
  const [questionCategory, setQuestionCategory] = useState("");
  const [questionSegment, setQuestionSegment] = useState("");
  const [activeQuestionKey, setActiveQuestionKey] = useState<string | null>(
    null,
  );
  const [draggedQuestionKey, setDraggedQuestionKey] = useState<string | null>(
    null,
  );
  const questionMetadata = libraryQuestions
    .map((question) => question.prompt.library)
    .filter((metadata) => metadata !== undefined);
  const questionGroups = [
    ...new Set(questionMetadata.map((item) => item.group)),
  ];
  const questionCategories = [
    ...new Set(
      questionMetadata
        .filter((item) => !questionGroup || item.group === questionGroup)
        .map((item) => item.category),
    ),
  ];
  const questionSegments = [
    ...new Set(questionMetadata.map((item) => item.eligibleSegment)),
  ];
  const visibleQuestions = libraryQuestions.filter((question) => {
    const metadata = question.prompt.library;
    const matchesSearch =
      `${question.prompt.title} ${question.prompt.prompt} ${question.prompt.researchGoal ?? ""} ${(metadata?.targetTags ?? []).join(" ")} ${metadata?.questionId ?? ""} ${metadata?.category ?? ""}`
        .toLowerCase()
        .includes(questionSearch.trim().toLowerCase());
    return (
      matchesSearch &&
      (!questionGroup || metadata?.group === questionGroup) &&
      (!questionCategory || metadata?.category === questionCategory) &&
      (!questionSegment || metadata?.eligibleSegment === questionSegment)
    );
  });
  const estimatedQuestionMinutes = Math.ceil(
    selectedQuestions.reduce(
      (seconds, question) =>
        seconds + (question.prompt.library?.estimatedSeconds ?? 60),
      0,
    ) / 60,
  );
  const prompts: ScriptPrompt[] = [
    ...automaticIntroduction,
    ...selectedQuestions.map((question, index) => ({
      ...question.prompt,
      id: `question-${index + 1}`,
      delivery:
        question.prompt.delivery ??
        (question.prompt.library
          ? {
              requirement: {
                Core: "core" as const,
                Optional: "optional" as const,
                Close: "close" as const,
              }[question.prompt.library.role],
            }
          : undefined),
    })),
  ];
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
  const updateQuestionDelivery = (
    key: string,
    patch: Partial<NonNullable<ScriptPrompt["delivery"]>>,
  ) =>
    setSelectedQuestions((current) =>
      current.map((question) =>
        question.key === key
          ? {
              ...question,
              prompt: {
                ...question.prompt,
                delivery: {
                  requirement: question.prompt.delivery?.requirement ?? "core",
                  ...question.prompt.delivery,
                  ...patch,
                },
              },
            }
          : question,
      ),
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
  }

  function chooseQuestion(question: QuestionChoice) {
    setSelectedQuestions((current) =>
      current.some((item) => item.key === question.key)
        ? current.filter((item) => item.key !== question.key)
        : [...current, question],
    );
  }

  function moveQuestionBefore(sourceKey: string, targetKey: string) {
    if (sourceKey === targetKey) return;
    setSelectedQuestions((current) => {
      const sourceIndex = current.findIndex((item) => item.key === sourceKey);
      const targetIndex = current.findIndex((item) => item.key === targetKey);
      if (sourceIndex < 0 || targetIndex < 0) return current;
      const next = [...current];
      const [source] = next.splice(sourceIndex, 1);
      if (!source) return current;
      next.splice(
        sourceIndex < targetIndex ? targetIndex - 1 : targetIndex,
        0,
        source,
      );
      return next;
    });
  }

  const resetQuestionFilters = () => {
    setQuestionSearch("");
    setQuestionGroup("");
    setQuestionCategory("");
    setQuestionSegment("");
  };

  return (
    <Form method="post" className="builder-layout builder-layout--questions">
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
          <nav className="study-flow" aria-label="Study builder steps">
            {([1, 2, 3, 4] as const).map((step) => {
              const label = [
                "Basics",
                "Participant selection",
                "Questions",
                "Review and launch",
              ][step - 1];
              return (
                <button
                  aria-current={activeStep === step ? "step" : undefined}
                  className={activeStep === step ? "is-active" : undefined}
                  key={step}
                  onClick={() => setActiveStep(step)}
                  type="button"
                >
                  <span>{step}</span>
                  {label}
                </button>
              );
            })}
          </nav>
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
          <section className="panel study-step" hidden={activeStep !== 1}>
            <div className="panel-heading">
              <div>
                <span className="step-number">1</span>
                <h2>Basics</h2>
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
                  name="name"
                  onChange={(event) => setStudyName(event.target.value)}
                  placeholder="e.g. Why customers come back for a second order"
                  required
                  value={studyName}
                />
              </label>
              <label>
                <span>Trigger</span>
                <select defaultValue="order_completed">
                  <option value="order_completed">Order completed</option>
                </select>
              </label>
              <label className="full-span">
                <span>Business question</span>
                <textarea
                  name="businessQuestion"
                  onChange={(event) => setBusinessQuestion(event.target.value)}
                  placeholder="e.g. What experiences and purchase triggers explain why these customers buy again?"
                  required
                  value={businessQuestion}
                />
                <small className="field-help">
                  Internal only. Customers should never be asked to solve this
                  question directly.
                </small>
              </label>
              <label className="full-span">
                <span>Research objective</span>
                <textarea
                  name="objective"
                  onChange={(event) => setResearchObjective(event.target.value)}
                  placeholder={
                    request
                      ? "What do you want to learn from these customers?"
                      : "e.g. Identify the concrete triggers, use occasions, alternatives, and decision criteria associated with repurchasing."
                  }
                  required
                  value={researchObjective}
                />
              </label>
            </div>
            <div className="study-step__actions">
              <button
                className="button button-primary"
                onClick={() => setActiveStep(2)}
                type="button"
              >
                Continue to participant selection
              </button>
            </div>
          </section>

          <section className="panel study-step" hidden={activeStep !== 2}>
            <div className="panel-heading">
              <div>
                <span className="step-number">2</span>
                <h2>Participant selection</h2>
              </div>
              <span className="registry-label">3 registered predicates</span>
            </div>
            <p className="helper-copy">
              Define one behaviorally distinct group per study. Create sibling
              studies with the same core guide when the work needs comparison
              groups; this keeps recruitment and evidence comparable.
            </p>
            <RuleEditor
              node={rules}
              onChange={handleNodeChange}
              onRemove={(id) => setRules((current) => removeNode(current, id))}
              products={products}
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
            <div className="study-step__actions study-step__actions--split">
              <button
                className="button button-quiet"
                onClick={() => setActiveStep(1)}
                type="button"
              >
                Back
              </button>
              <button
                className="button button-primary"
                onClick={() => setActiveStep(3)}
                type="button"
              >
                Continue to questions
              </button>
            </div>
          </section>

          <section hidden>
            <div className="panel-heading">
              <div>
                <span className="step-number">3</span>
                <h2>Target evidence</h2>
              </div>
              <span className="registry-label">
                {selected.length} target tags ·{" "}
                {selected.filter((item) => item.required).length} core
              </span>
            </div>
            {request ? (
              <p className="helper-copy">
                Choose the evidence dimensions this study should look for. Tags
                can emerge anywhere in the transcript; they are not tied to a
                particular question.
              </p>
            ) : (
              <p className="helper-copy">
                Starts from your evidence taxonomy (
                <Link to="/admin/research-fields">edit taxonomy</Link>). Changes
                here apply to this run only. Required means reviewers should
                explicitly mark the tag found or not discussed after the call.
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
                        <span>Core</span>
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
                  <span>Add from taxonomy</span>
                  <select
                    onChange={(event) => setLibraryPick(event.target.value)}
                    value={libraryPick}
                  >
                    <option value="">Choose a tag…</option>
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
                  Add tag
                </button>
              </div>
            ) : null}
            <div className="inline-add inline-add--new-field">
              <label>
                <span>New target tag</span>
                <input
                  maxLength={160}
                  onChange={(event) => setNewLabel(event.target.value)}
                  placeholder="e.g. expanded_use_case"
                  value={newLabel}
                />
              </label>
              <label>
                <span>Extraction guidance (optional)</span>
                <input
                  maxLength={2000}
                  onChange={(event) => setNewPrompt(event.target.value)}
                  placeholder="What counts as evidence for this tag"
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
                Create tag
              </button>
            </div>
            {request ? null : (
              <p className="helper-copy">
                New tags are saved to the taxonomy so later studies can reuse
                them. The customer’s own language and evidence span are
                preserved during post-call review.
              </p>
            )}
          </section>

          <section className="panel study-step" hidden={activeStep !== 3}>
            <div className="panel-heading">
              <div>
                <span className="step-number">3</span>
                <h2>Questions</h2>
              </div>
              <span className="registry-label">
                2 required · {selectedQuestions.length} selected
              </span>
            </div>
            <p className="helper-copy">
              Every study begins with the same introduction and recording
              consent. Then choose the open questions that best support this
              study. Researchers can follow the conversation naturally.
            </p>
            <details className="required-questions">
              <summary>
                <span>
                  <strong>2 required questions</strong>
                  <small>Introduction and recording consent</small>
                </span>
                <span>View</span>
              </summary>
              <div
                className="automatic-questions"
                aria-label="Required questions"
              >
                {automaticIntroduction.map((prompt, index) => (
                  <article key={prompt.id}>
                    <span>{index + 1}</span>
                    <div>
                      <strong className="automatic-question__title">
                        {prompt.title}
                      </strong>
                      <p>{prompt.prompt}</p>
                    </div>
                    <small>Always included</small>
                  </article>
                ))}
              </div>
            </details>
            <div className="question-picker-layout">
              <div className="question-browser">
                <div className="question-picker__heading">
                  <label className="search-control question-search">
                    <span className="sr-only">Search question database</span>
                    <input
                      onChange={(event) =>
                        setQuestionSearch(event.target.value)
                      }
                      placeholder="Search questions, objectives, or tags"
                      type="search"
                      value={questionSearch}
                    />
                  </label>
                  <Link
                    className="button button-small button-quiet"
                    to="/admin/scripts?question=new"
                  >
                    Add question
                  </Link>
                </div>
                <div className="question-picker__filters">
                  <label>
                    <span className="sr-only">Question group</span>
                    <select
                      aria-label="Question group"
                      onChange={(event) => {
                        setQuestionGroup(event.target.value);
                        setQuestionCategory("");
                      }}
                      value={questionGroup}
                    >
                      <option value="">All groups</option>
                      {questionGroups.map((group) => (
                        <option key={group}>{group}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Category</span>
                    <select
                      aria-label="Question category"
                      onChange={(event) =>
                        setQuestionCategory(event.target.value)
                      }
                      value={questionCategory}
                    >
                      <option value="">All categories</option>
                      {questionCategories.map((category) => (
                        <option key={category}>{category}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Eligible segment</span>
                    <select
                      aria-label="Eligible customer segment"
                      onChange={(event) =>
                        setQuestionSegment(event.target.value)
                      }
                      value={questionSegment}
                    >
                      <option value="">All segments</option>
                      {questionSegments.map((segment) => (
                        <option key={segment} value={segment}>
                          {segment.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="question-results-bar">
                  <span>
                    {visibleQuestions.length} matching question
                    {visibleQuestions.length === 1 ? "" : "s"}
                  </span>
                  {questionSearch ||
                  questionGroup ||
                  questionCategory ||
                  questionSegment ? (
                    <button
                      className="text-button"
                      onClick={resetQuestionFilters}
                      type="button"
                    >
                      Reset filters
                    </button>
                  ) : null}
                </div>
                <div className="question-database" role="list">
                  {visibleQuestions.map((question) => {
                    const checked = selectedQuestions.some(
                      (selected) => selected.key === question.key,
                    );
                    const expanded = activeQuestionKey === question.key;
                    const metadata = question.prompt.library;
                    return (
                      <article
                        className={`question-list-item${checked ? " is-selected" : ""}${expanded ? " is-expanded" : ""}`}
                        key={question.key}
                        role="listitem"
                      >
                        <div
                          aria-expanded={expanded}
                          className="question-list-item__summary"
                          onClick={() =>
                            setActiveQuestionKey(expanded ? null : question.key)
                          }
                          onKeyDown={(event) => {
                            if (
                              event.currentTarget === event.target &&
                              (event.key === "Enter" || event.key === " ")
                            ) {
                              event.preventDefault();
                              setActiveQuestionKey(
                                expanded ? null : question.key,
                              );
                            }
                          }}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="question-list-item__content">
                            <span className="question-list-item__title">
                              {question.prompt.title}
                              {question.source === "merchant" ? (
                                <small>Merchant</small>
                              ) : null}
                            </span>
                            <strong>{question.prompt.prompt}</strong>
                            <span className="question-list-item__meta">
                              {metadata?.category ??
                                question.prompt.researchGoal ??
                                "Merchant question"}
                              {metadata?.researchObjective
                                ? ` · ${metadata.researchObjective}`
                                : ""}
                            </span>
                          </div>
                          <button
                            aria-label={`${checked ? "Remove" : "Add"} ${question.prompt.prompt}`}
                            aria-pressed={checked}
                            className={`question-select-button${checked ? " is-selected" : ""}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              chooseQuestion(question);
                            }}
                            type="button"
                          >
                            <span aria-hidden="true">
                              {checked ? "✓" : "+"}
                            </span>
                            {checked ? "Selected" : "Add"}
                          </button>
                        </div>
                        {expanded ? (
                          <div className="question-detail">
                            <div>
                              <span className="question-detail__label">
                                Research objective
                              </span>
                              <p>
                                {question.prompt.researchGoal ??
                                  "No research objective has been added yet."}
                              </p>
                            </div>
                            {metadata ? (
                              <dl>
                                <div>
                                  <dt>Eligible segment</dt>
                                  <dd>
                                    {metadata.eligibleSegment.replaceAll(
                                      "_",
                                      " ",
                                    )}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Method</dt>
                                  <dd>
                                    {metadata.methodCode.replaceAll("_", " ")}
                                  </dd>
                                </div>
                                <div>
                                  <dt>Expected tags</dt>
                                  <dd>{metadata.targetTags.join(", ")}</dd>
                                </div>
                                <div>
                                  <dt>Library ID</dt>
                                  <dd>{metadata.questionId}</dd>
                                </div>
                              </dl>
                            ) : null}
                            {question.prompt.probes?.length ? (
                              <div className="question-detail__probes">
                                <span className="question-detail__label">
                                  Optional follow-up probes
                                </span>
                                <ul>
                                  {question.prompt.probes.map((probe) => (
                                    <li key={probe}>{probe}</li>
                                  ))}
                                </ul>
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                  {!visibleQuestions.length ? (
                    <div className="question-empty-state">
                      <strong>No matching questions</strong>
                      <p>Try a broader search or reset the active filters.</p>
                      <button
                        className="button button-small button-quiet"
                        onClick={resetQuestionFilters}
                        type="button"
                      >
                        Reset filters
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <aside
                className="selected-question-order"
                id="selected-question-sequence"
              >
                <div className="selected-question-order__header">
                  <div>
                    <span className="eyebrow">Interview sequence</span>
                    <h3>{selectedQuestions.length} selected</h3>
                  </div>
                  <span className="registry-label">
                    ≈ {estimatedQuestionMinutes} min
                  </span>
                </div>
                {selectedQuestions.length ? (
                  <ol>
                    {selectedQuestions.map((question, index) => (
                      <li
                        draggable
                        key={question.key}
                        onDragEnd={() => setDraggedQuestionKey(null)}
                        onDragOver={(event) => event.preventDefault()}
                        onDragStart={() => setDraggedQuestionKey(question.key)}
                        onDrop={() => {
                          if (draggedQuestionKey)
                            moveQuestionBefore(
                              draggedQuestionKey,
                              question.key,
                            );
                          setDraggedQuestionKey(null);
                        }}
                      >
                        <span className="sequence-handle" aria-hidden="true">
                          ⋮⋮
                        </span>
                        <div>
                          <span>{index + 3}</span>
                          <strong>{question.prompt.prompt}</strong>
                          <small>{question.prompt.title}</small>
                          <div className="sequence-delivery">
                            <label>
                              <span>Delivery</span>
                              <select
                                aria-label={`Delivery for ${question.prompt.title}`}
                                onChange={(event) =>
                                  updateQuestionDelivery(question.key, {
                                    requirement: event.target
                                      .value as NonNullable<
                                      ScriptPrompt["delivery"]
                                    >["requirement"],
                                  })
                                }
                                value={questionRequirement(question)}
                              >
                                <option value="core">Core</option>
                                <option value="branch">Branch</option>
                                <option value="optional">Optional</option>
                                <option value="conditional">Conditional</option>
                                <option value="close">Close</option>
                              </select>
                            </label>
                            {["branch", "optional", "conditional"].includes(
                              questionRequirement(question),
                            ) ? (
                              <label>
                                <span>Ask when</span>
                                <input
                                  aria-label={`Ask when for ${question.prompt.title}`}
                                  maxLength={500}
                                  onChange={(event) =>
                                    updateQuestionDelivery(question.key, {
                                      conditionLabel:
                                        event.target.value || undefined,
                                    })
                                  }
                                  placeholder="Describe the evidence or participant subgroup"
                                  value={
                                    question.prompt.delivery?.conditionLabel ??
                                    ""
                                  }
                                />
                              </label>
                            ) : null}
                          </div>
                        </div>
                        <div className="sequence-actions">
                          <button
                            aria-label={`Move ${question.prompt.title} up`}
                            disabled={index === 0}
                            onClick={() =>
                              setSelectedQuestions((current) =>
                                moveItem(current, index, -1),
                              )
                            }
                            type="button"
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`Move ${question.prompt.title} down`}
                            disabled={index === selectedQuestions.length - 1}
                            onClick={() =>
                              setSelectedQuestions((current) =>
                                moveItem(current, index, 1),
                              )
                            }
                            type="button"
                          >
                            ↓
                          </button>
                          <button
                            aria-label={`Remove ${question.prompt.title}`}
                            onClick={() => chooseQuestion(question)}
                            type="button"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <div className="sequence-empty-state">
                    <span aria-hidden="true">＋</span>
                    <strong>Build your interview</strong>
                    <p>
                      Add questions from the library. They’ll appear here in the
                      order researchers will ask them.
                    </p>
                  </div>
                )}
                <button
                  className="button button-primary button-full"
                  disabled={!selectedQuestions.length}
                  onClick={() => setActiveStep(4)}
                  type="button"
                >
                  Review {selectedQuestions.length} question
                  {selectedQuestions.length === 1 ? "" : "s"}
                </button>
              </aside>
            </div>
            <button
              className="question-mobile-selection button button-primary"
              onClick={() =>
                document
                  .getElementById("selected-question-sequence")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" })
              }
              type="button"
            >
              {selectedQuestions.length} selected · View sequence
            </button>
            <div className="study-step__actions study-step__actions--split">
              <button
                className="button button-quiet"
                onClick={() => setActiveStep(2)}
                type="button"
              >
                Back
              </button>
              <button
                className="button button-primary"
                disabled={!selectedQuestions.length}
                onClick={() => setActiveStep(4)}
                type="button"
              >
                Continue to review and launch
              </button>
            </div>
          </section>

          <section
            className="panel study-step review-launch"
            hidden={activeStep !== 4}
            id="study-launch-actions"
          >
            <div className="panel-heading">
              <div>
                <span className="step-number">4</span>
                <h2>Review and launch</h2>
              </div>
              <span
                className={`status-pill status-${initial?.status ?? "draft"}`}
              >
                {momentStatusLabels[initial?.status ?? "draft"]}
              </span>
            </div>

            <label className="weekly-target-control">
              <span>Weekly interview target</span>
              <input
                min="1"
                name="weeklyTarget"
                onChange={(event) => setWeeklyTarget(event.target.value)}
                placeholder="e.g. 12"
                required
                type="number"
                value={weeklyTarget}
              />
              <small>
                The number of completed interviews this study should aim for
                each week.
              </small>
            </label>

            <div className="review-sections">
              <article className="review-section">
                <div className="review-section__heading">
                  <div>
                    <span className="eyebrow">Step 1</span>
                    <h3>Basics</h3>
                  </div>
                  <button
                    className="button button-small button-quiet"
                    onClick={() => setActiveStep(1)}
                    type="button"
                  >
                    Edit basics
                  </button>
                </div>
                <dl className="review-grid">
                  <div>
                    <dt>Study name</dt>
                    <dd>{studyName || "Not entered"}</dd>
                  </div>
                  <div>
                    <dt>Trigger</dt>
                    <dd>Order completed</dd>
                  </div>
                  <div className="full-span">
                    <dt>Business question</dt>
                    <dd>{businessQuestion || "Not entered"}</dd>
                  </div>
                  <div className="full-span">
                    <dt>Research objective</dt>
                    <dd>{researchObjective || "Not entered"}</dd>
                  </div>
                </dl>
              </article>

              <article className="review-section">
                <div className="review-section__heading">
                  <div>
                    <span className="eyebrow">Step 2</span>
                    <h3>Participant selection</h3>
                  </div>
                  <button
                    className="button button-small button-quiet"
                    onClick={() => setActiveStep(2)}
                    type="button"
                  >
                    Edit participants
                  </button>
                </div>
                <span className="review-section__label">
                  Qualification logic
                </span>
                <p className="review-participant-summary">
                  {describeRule(rules)}
                </p>
              </article>

              <article className="review-section">
                <div className="review-section__heading">
                  <div>
                    <span className="eyebrow">Step 3</span>
                    <h3>Questions</h3>
                  </div>
                  <button
                    className="button button-small button-quiet"
                    onClick={() => setActiveStep(3)}
                    type="button"
                  >
                    Edit questions
                  </button>
                </div>
                <p className="helper-copy">
                  2 required introduction questions · {selectedQuestions.length}{" "}
                  selected · approximately {estimatedQuestionMinutes} minutes
                </p>
                {selectedQuestions.length ? (
                  <ol className="review-question-list">
                    {selectedQuestions.map((question, index) => (
                      <li key={question.key}>
                        <span>{index + 3}</span>
                        <div>
                          <strong>{question.prompt.prompt}</strong>
                          <small>{question.prompt.title}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="helper-copy">No optional questions selected.</p>
                )}
              </article>
            </div>

            <div className="review-launch__actions">
              <button
                className="button button-quiet"
                onClick={() => setActiveStep(3)}
                type="button"
              >
                Back to questions
              </button>
              <div>
                {readOnly ? (
                  <p className="helper-copy">
                    Only research managers and merchant admins can change a
                    study’s setup.
                  </p>
                ) : launched ? (
                  <button
                    className="button button-primary"
                    name="intent"
                    type="submit"
                    value="save"
                  >
                    Save changes
                  </button>
                ) : request ? (
                  <button
                    className="button button-primary"
                    name="intent"
                    type="submit"
                    value="draft"
                  >
                    Send request
                  </button>
                ) : (
                  <>
                    <button
                      className="button button-quiet"
                      name="intent"
                      type="submit"
                      value="draft"
                    >
                      Save draft
                    </button>
                    <button
                      className="button button-primary"
                      name="intent"
                      type="submit"
                      value="publish"
                    >
                      Launch study
                    </button>
                  </>
                )}
              </div>
            </div>
            {saved && "error" in saved ? (
              <p className="save-notice save-notice--error" role="alert">
                {saved.error}
              </p>
            ) : saved && request ? (
              <p className="save-notice" role="status">
                Request sent. Holler will review it and follow up before
                anything goes live.
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
          </section>
        </div>
      </fieldset>
    </Form>
  );
}
