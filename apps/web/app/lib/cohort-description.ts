import { cohortExpressionSchema, type CohortExpression } from "@holler/domain";

/** Resolves a category reference to the label people see in the store. */
export type CategoryLabeler = (namespace: string, key: string) => string;

const ordinals = [
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
];

export function ordinal(value: number): string {
  if (ordinals[value - 1]) return ordinals[value - 1]!;
  const tens = value % 100;
  const suffix =
    tens >= 11 && tens <= 13
      ? "th"
      : (({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[
          value % 10
        ] ?? "th");
  return `${value}${suffix}`;
}

/** "bottoms" → "Bottoms", "gift-sets" → "Gift sets". */
export function humanizeKey(key: string): string {
  const words = key.replace(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const defaultLabeler: CategoryLabeler = (_namespace, key) => humanizeKey(key);

function orderSequence(config: Record<string, unknown>, negated: boolean) {
  const value = Number(config.value);
  if (!Number.isInteger(value) || value < 1) return undefined;
  const operator = config.operator;
  let phrase: string;
  if (operator === "equals" || (operator === "at_most" && value === 1))
    phrase = `the customer's ${ordinal(value)} order`;
  else if (operator === "at_least")
    phrase =
      value === 2
        ? "a repeat order"
        : `the customer's ${ordinal(value)} order or later`;
  else if (operator === "at_most")
    phrase = `the customer's ${ordinal(value)} order or earlier`;
  else return undefined;
  return `${negated ? "not " : ""}${phrase}`;
}

function category(
  config: Record<string, unknown>,
  labeler: CategoryLabeler,
): string | undefined {
  if (typeof config.categoryKey !== "string") return undefined;
  const namespace =
    typeof config.namespace === "string" ? config.namespace : "merchant";
  return labeler(namespace, config.categoryKey);
}

function describePredicate(
  predicate: string,
  config: Record<string, unknown>,
  negated: boolean,
  labeler: CategoryLabeler,
): string {
  if (predicate === "customer.order_sequence") {
    const phrase = orderSequence(config, negated);
    if (phrase) return phrase;
  }
  if (predicate === "order.contains_current_category") {
    const label = category(config, labeler);
    if (label)
      return negated
        ? `this order has no ${label}`
        : `this order includes ${label}`;
  }
  if (predicate === "customer.first_order_contains_current_category") {
    const label = category(config, labeler);
    if (label)
      return negated
        ? `their first order had no ${label}`
        : `their first order included ${label}`;
  }
  const fallback = humanizeKey(predicate).toLowerCase();
  return negated ? `not ${fallback}` : fallback;
}

function list(parts: readonly string[], conjunction: "and" | "or"): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} ${conjunction} ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, ${conjunction} ${parts.at(-1)}`;
}

function describe(
  expression: CohortExpression,
  labeler: CategoryLabeler,
  nested: boolean,
): string {
  if ("predicate" in expression)
    return describePredicate(
      expression.predicate,
      expression.config,
      false,
      labeler,
    );
  if ("not" in expression) {
    const inner = expression.not;
    if ("predicate" in inner)
      return describePredicate(inner.predicate, inner.config, true, labeler);
    if ("any" in inner)
      return `none of: ${list(
        inner.any.map((child) => describe(child, labeler, true)),
        "or",
      )}`;
    return `not (${describe(inner, labeler, true)})`;
  }
  const isAll = "all" in expression;
  const children = isAll ? expression.all : expression.any;
  const parts = children.map((child) => describe(child, labeler, true));
  if (parts.length === 1) return parts[0]!;
  if (isAll) {
    const text = list(parts, "and");
    return nested ? `(${text})` : text;
  }
  return `${parts.length === 2 ? "either" : "any of"} ${list(parts, "or")}`;
}

/**
 * Plain-English summary of a stored cohort expression, e.g. "The customer's
 * second order, their first order had no Bottoms, and this order includes
 * Bottoms."
 */
export function describeCohort(
  expression: unknown,
  labeler: CategoryLabeler = defaultLabeler,
): string {
  const parsed = cohortExpressionSchema.safeParse(expression);
  if (!parsed.success) return "Custom cohort";
  const text = describe(parsed.data, labeler, false);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Every category the expression references, for label lookup. */
export function cohortCategoryKeys(
  expression: unknown,
): { namespace: string; key: string }[] {
  const parsed = cohortExpressionSchema.safeParse(expression);
  if (!parsed.success) return [];
  const found: { namespace: string; key: string }[] = [];
  const visit = (node: CohortExpression) => {
    if ("predicate" in node) {
      if (typeof node.config.categoryKey === "string")
        found.push({
          namespace:
            typeof node.config.namespace === "string"
              ? node.config.namespace
              : "merchant",
          key: node.config.categoryKey,
        });
    } else if ("not" in node) visit(node.not);
    else ("all" in node ? node.all : node.any).forEach(visit);
  };
  visit(parsed.data);
  return found;
}
