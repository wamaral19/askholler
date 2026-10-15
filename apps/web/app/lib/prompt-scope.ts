// Browser-safe mirror of @holler/domain's PromptScope (that package's barrel
// imports node:crypto, so client components cannot import it).
export type PromptScope = "order" | "item" | "marketing";

export const promptScopeOptions: readonly (readonly [PromptScope, string])[] = [
  ["order", "Order"],
  ["item", "Item"],
  ["marketing", "Marketing"],
];

export const promptScopeHelp: Readonly<Record<PromptScope, string>> = {
  order: "Asked once about the order as a whole",
  item: "Asked once for each item in the order",
  marketing: "How the customer found and chose the brand",
};

export function isPromptScope(value: unknown): value is PromptScope {
  return value === "order" || value === "item" || value === "marketing";
}
