export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type MerchantId = Brand<string, "MerchantId">;
export type CustomerId = Brand<string, "CustomerId">;
export type OrderId = Brand<string, "OrderId">;
export type CommerceEventId = Brand<string, "CommerceEventId">;
export type ResearchMomentVersionId = Brand<string, "ResearchMomentVersionId">;
export type ResearchAssignmentId = Brand<string, "ResearchAssignmentId">;
export type InterviewId = Brand<string, "InterviewId">;
export type UserId = Brand<string, "UserId">;

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

export interface TenantContext {
  merchantId: MerchantId;
  actorId?: UserId;
  correlationId: string;
}
