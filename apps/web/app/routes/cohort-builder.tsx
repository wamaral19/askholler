import { useMemo, useState } from "react";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import { AppShell, PrototypeBanner } from "../components/app-shell";
import { categoryOptions, researchFields } from "../lib/prototype-data";
import {
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";

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

export function loader() {
  return { fields: researchFields, categories: categoryOptions };
}

export async function action({ request }: { request: Request }) {
  const form = await request.formData();
  const expression = JSON.parse(
    String(form.get("cohortExpression")),
  ) as unknown;
  const result = await getOperationsService().saveMoment(
    getTenantContext(request),
    {
      name: String(form.get("name") ?? "").trim(),
      objective: String(form.get("objective") ?? "").trim(),
      weeklyTarget: Number(form.get("weeklyTarget") ?? 0),
      cohortExpression: expression,
      fieldIds: form.getAll("fieldId").map(String),
      customFields: form.getAll("customField").map(String),
      publish: form.get("intent") === "publish",
    },
  );
  return { ...result, published: form.get("intent") === "publish" };
}

export function meta() {
  return [{ title: "Cohort Builder · Holler" }];
}

export default function CohortBuilderRoute() {
  const { fields } = useLoaderData<typeof loader>();
  const saved = useActionData<typeof action>();
  const [rules, setRules] = useState<GroupNode>(initialRules);
  const [selectedFields, setSelectedFields] = useState(
    () => new Set(fields.map((field) => field.id)),
  );
  const [customFields, setCustomFields] = useState<string[]>([]);
  const [customField, setCustomField] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
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

  function toggleField(id: string) {
    setSelectedFields((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell
      eyebrow="Research Moment · draft"
      title="Build a research cohort"
      description="Compose code-registered predicates into a versioned, explainable cohort. No unrestricted SQL is accepted here."
      actions={
        <Link className="button button-quiet" to="/moments">
          Back to moments
        </Link>
      }
    >
      <PrototypeBanner>
        Configuration is submitted through the tenant-scoped application
        service.
      </PrototypeBanner>

      <Form method="post" className="builder-layout">
        <input name="cohortExpression" type="hidden" value={ruleJson} />
        <div className="builder-main">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">1</span>
                <h2>Moment basics</h2>
              </div>
              <span className="status-pill status-draft">Draft</span>
            </div>
            <div className="form-grid two-column">
              <label>
                <span>Name</span>
                <input
                  defaultValue="Second-order category transition"
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
                  defaultValue="Learn why repeat customers move into a new category on their second purchase."
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
            <details className="json-preview">
              <summary>View versioned rule JSON</summary>
              <pre>{ruleJson}</pre>
            </details>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="step-number">3</span>
                <h2>Research fields</h2>
              </div>
              <span className="registry-label">
                {selectedFields.size + customFields.length} selected
              </span>
            </div>
            <p className="helper-copy">
              Platform defaults preserve attribution comparability. Merchant and
              run-specific fields can be included only where they are relevant.
            </p>
            {(
              [
                ["platform_default", "Platform defaults"],
                ["merchant_default", "Merchant defaults"],
                ["research_run", "This research run"],
              ] as const
            ).map(([source, label]) => (
              <div className="field-group" key={source}>
                <h3>{label}</h3>
                {fields
                  .filter((field) => field.source === source)
                  .map((field) => (
                    <label className="field-option" key={field.id}>
                      <input
                        checked={selectedFields.has(field.id)}
                        disabled={
                          source === "platform_default" && field.required
                        }
                        onChange={() => toggleField(field.id)}
                        type="checkbox"
                        name="fieldId"
                        value={field.id}
                      />
                      <span>
                        <strong>{field.label}</strong>
                        <small>{field.prompt}</small>
                      </span>
                      <span className="field-source">
                        {field.required ? "Required" : "Optional"}
                      </span>
                    </label>
                  ))}
              </div>
            ))}
            {customFields.map((field) => (
              <div className="field-option custom-field" key={field}>
                <input name="customField" type="hidden" value={field} />
                <span>
                  <strong>{field}</strong>
                  <small>Draft run-specific long-text field</small>
                </span>
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    setCustomFields((current) =>
                      current.filter((item) => item !== field),
                    )
                  }
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="inline-add">
              <label>
                <span>New run-specific field</span>
                <input
                  onChange={(event) => setCustomField(event.target.value)}
                  placeholder="e.g. Moisturizer liquidity"
                  value={customField}
                />
              </label>
              <button
                className="button button-quiet"
                disabled={!customField.trim()}
                onClick={() => {
                  setCustomFields((current) => [
                    ...current,
                    customField.trim(),
                  ]);
                  setCustomField("");
                }}
                type="button"
              >
                Add field
              </button>
            </div>
          </section>
        </div>

        <aside className="builder-summary panel">
          <p className="eyebrow">Publish checklist</p>
          <h2>Ready for review</h2>
          <ul className="check-list">
            <li>Order-completed trigger</li>
            <li>Current-category logic</li>
            <li>History fails closed</li>
            <li>{selectedFields.size + customFields.length} research fields</li>
            <li>Pinned script: Repeat purchase v3</li>
          </ul>
          <label>
            <span>Weekly interview target</span>
            <input
              defaultValue="12"
              min="1"
              name="weeklyTarget"
              type="number"
            />
          </label>
          <button
            className="button button-primary button-full"
            name="intent"
            type="submit"
            value="publish"
          >
            Publish prototype
          </button>
          <button
            className="button button-quiet button-full"
            name="intent"
            type="submit"
            value="draft"
          >
            Save draft
          </button>
          {notice ? <p className="save-notice">{notice}</p> : null}
          {saved ? (
            <p className="save-notice">
              {saved.published ? "Published" : "Draft saved"}: {saved.id}
            </p>
          ) : null}
        </aside>
      </Form>
    </AppShell>
  );
}
