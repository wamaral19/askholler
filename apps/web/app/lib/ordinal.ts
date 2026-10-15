// Kept apart from cohort-description so browser code can use it without
// pulling in @holler/domain, whose barrel imports node:crypto.

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
