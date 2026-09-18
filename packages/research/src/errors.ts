export class InvalidCohortPredicateConfigError extends Error {
  constructor(
    readonly predicate: string,
    readonly version: number,
    readonly issues: readonly string[],
  ) {
    super(`Invalid cohort predicate config: ${predicate}@${version}`);
    this.name = "InvalidCohortPredicateConfigError";
  }
}
