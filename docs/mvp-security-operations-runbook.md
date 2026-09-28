# MVP security operations runbook

This is the initial operating draft for the decisions in
`docs/mvp-security-privacy-signoff.md`. Named owners and provider-specific
commands must be filled in before production activation.

## Access administration

- Accounts are invitation-only and must map to an active Holler workforce user
  and an explicit merchant membership. Email domain alone never grants access.
- Grant the least-privileged role needed. A different authorized administrator
  approves platform-admin access.
- Suspend access immediately on termination, suspected compromise, or loss of
  business need. Disable the identity-provider account, revoke Holler sessions,
  and disable memberships.
- Review active users, roles, and merchant grants quarterly. Record reviewer,
  date, exceptions, and remediation.
- Log invitations, role changes, membership changes, suspensions, session
  revocations, PII reveals, exports, deletion actions, and legal-hold actions.

## Session revocation test

Run before launch and after material authentication changes:

1. Sign in as a test user and establish active browser and API sessions.
2. Disable one merchant membership; verify access to that merchant fails on the
   next authorized request.
3. Re-enable membership, then revoke the Holler session; verify both UI and API
   access fail.
4. Disable the Firebase/Workspace identity; verify new sessions fail and
   existing sessions cease within the documented revocation window.
5. Remove a privileged role; verify privileged actions fail immediately.
6. Save non-sensitive test evidence and open a defect for every unexpected
   success.

Target revocation window for the MVP: immediate for Holler membership and
session changes; no more than 15 minutes for upstream identity-provider changes.

## KMS key management and rotation

- Use distinct staging and production key rings and keys. Never copy production
  encrypted data to a lower environment.
- The PII runtime identity may encrypt and decrypt. Other application roles may
  encrypt only when required and receive no decrypt grant.
- Human decrypt access is prohibited by default and requires a time-bound,
  approved emergency procedure.
- Ingest Cloud KMS administrative and data-access logs into the central security
  log destination. Alert on key-policy changes, key disablement, and unexpected
  human decrypt operations.
- Annually create a new primary key version, direct new encryption to it, prove
  old envelopes remain readable, exercise rollback, and rewrap old encrypted
  data keys if policy requires it. Record results and corrective actions.

## Identity and KMS audit logs

- Ingest Google Workspace/Firebase authentication and administrator events,
  including login failures, MFA changes, account disablement, and privileged
  configuration changes.
- Ingest Cloud KMS key administration and decrypt activity.
- Retain normalized, non-PII audit records for 12 months with access limited to
  authorized operators.
- Alert on repeated authentication failures, disabled-user activity, privilege
  escalation, bulk PII access, unusual exports, and anomalous decrypt volume.
- Review alerts promptly and document disposition without copying PII into the
  incident record.

## Retention and deletion operations

- A daily sweep creates deletion requests for expired records.
- Every request contains independently retryable steps for each applicable data
  store and provider. Completed steps are never repeated unnecessarily.
- Alert immediately on terminal failures and daily on any request that is
  overdue or has made no progress for 24 hours.
- Shopify privacy webhook work must complete within the applicable deadline;
  target internal completion within 7 days to preserve remediation time.
- Store only a non-identifying deletion tombstone after completion.
- Test customer deletion, shop deletion, uninstall, and retention expiry in
  staging before launch and quarterly thereafter.

## Cloudflare R2 storage

- Use distinct private staging and production buckets. Do not enable `r2.dev`
  public access or a public custom domain.
- Use separate buckets or strictly separated prefixes for recordings, temporary
  exports, and published artifacts. Production credentials must be scoped to
  only the required bucket and operations.
- Configure automatic expiry for recordings after 30 days and PII-bearing
  exports after 7 days; temporary unused exports expire after 24 hours.
- Deliver downloads through an authenticated application route or short-lived
  signed URL after tenant and permission checks.
- Enable configuration audit logs and data-access logs. Application audit events
  remain the authoritative record for successful user access because provider
  data-access delivery can be delayed or incomplete.
- Deletion jobs explicitly delete objects and verify absence; lifecycle expiry
  is a backstop, not the deletion workflow.

## Legal holds

- Only the designated legal-hold authority may place or release a hold.
- A hold requires a case/reference ID, reason, scope, approving identity,
  effective time, and review date. Do not put subject PII in the reason field.
- Deletion requests covered by a hold remain visibly blocked, not silently
  discarded. Other unrelated deletion steps continue.
- Review open holds at least quarterly. On release, enqueue blocked deletion
  work immediately and preserve the non-identifying audit trail.

## Backups

- Encrypt backups with environment-specific managed keys and restrict restore
  permission to the operations role.
- Retain production backups for no more than 35 days and expire them
  automatically. Do not copy them into development or staging.
- A deleted subject may persist in immutable backups until normal backup expiry.
  Restored backups must be isolated, access-controlled, and have deletion
  requests replayed before serving production traffic.
- Test restoration at least quarterly and record recovery time, access, and
  deletion-replay results.

## Incident response

1. Triage and assign severity without adding PII to tickets or chat.
2. Contain by revoking sessions, credentials, provider tokens, or KMS grants as
   applicable.
3. Preserve relevant access and administrative logs.
4. Determine affected merchants, data classes, time period, and providers.
5. Have the incident owner and counsel determine notification duties and timing.
6. Recover through tested configuration and credential rotation.
7. Complete a written review with owners and deadlines for corrective actions.

## Independent review scope

Before live customer data, an assessor outside the implementation team reviews:

- Firebase token verification, invitation rules, MFA/step-up behavior, session
  expiry, and revocation;
- role enforcement and cross-merchant isolation on routes, repositories, jobs,
  exports, and object access;
- KMS grants, envelope context binding, ciphertext tampering behavior, rotation,
  and audit logs;
- Shopify HMAC verification, minimum scopes, credential encryption, mandatory
  privacy webhooks, and uninstall behavior;
- PII logging/scrubbing, recording consent state, storage privacy, deletion,
  retention, backups, and external-provider erasure;
- dependency/secrets controls, production configuration, alerting, recovery,
  and incident response.

All critical and high findings block launch. Medium findings require an accepted
owner and remediation date. The product owner records final acceptance.

## Production readiness evidence

Keep links or identifiers for, at minimum:

- approved provider inventory and data-flow diagram;
- authentication and revocation test results;
- KMS IAM policy and completed rotation drill;
- encrypted-write and tamper-test results;
- deletion and retention sweep test results;
- Shopify privacy webhook delivery tests;
- backup restoration and deletion-replay test;
- counsel approval of contact/recording practices;
- independent assessment report and remediation record.
