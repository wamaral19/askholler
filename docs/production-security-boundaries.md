# Production security boundaries

The repository now has replaceable, fail-closed boundaries for workforce identity, tenant roles, PII encryption, retention, and deletion. These are foundations, not a claim that production security is configured.

## Implemented

- `WorkforceIdentityProvider` separates verified OIDC sessions from application authorization. `authorizeWorkforce` enforces active session, recent MFA, tenant grant, and an explicit role/permission matrix.
- Workforce sessions carry roles; synthetic sessions remain development/test-only and roles are read from a server-owned allowlist.
- `DataKeyProvider` is the cloud-KMS boundary. `EnvelopeEncryptionService` uses a fresh AES-256-GCM data-key operation, authenticated tenant/customer/field context, ciphertext integrity, and key versions. No static production key or fake KMS is included.
- Workforce users, tenant memberships, retention policies, deletion requests, and independently retryable deletion steps are persisted by migration `0004_security_privacy.sql`.
- `DeletionService` is tenant-scoped, idempotent per step, preserves safe error codes, and refuses erasure while a legal hold is active.
- Production configuration rejects synthetic workforce auth, absent OIDC issuer/audience, placeholder KMS identifiers, and fake dialer/object storage providers.

## Approved direction; implementation remains a launch blocker

The product owner approved the MVP provider, retention, deletion, and operating
direction on 2026-09-24. See `docs/mvp-security-privacy-signoff.md` and
`docs/mvp-security-operations-runbook.md`. These items remain blockers until the
approved direction is implemented and verified.

1. Workforce sign-in uses Google OpenID Connect (authorization code with PKCE, state, and nonce; ID-token signature, issuer, audience, verified email, and `hd` domain checks) with server-side, hashed, revocable 12-hour sessions in `workforce_sessions`. Operators provision users and grant per-merchant roles with `npm run workforce`. Remaining: enforce Workspace 2-step verification for every `withholler.com` account in the Google Admin console, create the production OAuth client, and decide whether phone reveal needs a separate step-up. Invitation-only email links are deferred (see the pilot scope reductions in `docs/mvp-security-privacy-signoff.md`).
2. `GcpKmsDataKeyProvider` wraps per-record AES-256 data keys with a Cloud KMS symmetric key (REST API, Application Default Credentials). Remaining: create the production key and a least-privilege service account (`docs/deployment.md`), a separate staging key if staging is added, and a rotation drill.
3. Shopify order ingestion stores phone (normalized to E.164) and first name only as `env1:` envelopes bound to merchant, customer, and field, plus the last four digits for masked display; `postgres` operations mode decrypts only envelopes and rejects `synthetic:*` values. Remaining: Shopify offline access tokens are still stored unencrypted by the official session-storage adapter.
4. `PostgresDeletionRepository` and the worker's erasure steps cancel open assignments, delete recordings from R2 and Twilio, redact free-text interview notes and evidence excerpts, erase contact data, and mark the customer deleted, for `customers/redact` and `shop/redact`. Remaining: PII-bearing exports are manual for the pilot and must be deleted by hand within 7 days; `customers/data_request` is answered by an operator.
5. The hourly privacy sweep runs pending deletion requests (respecting legal hold) and applies retention: contact data 90 days after the latest order, recordings 30 days after creation. Failures and overdue requests are logged at error level. Remaining: name the legal-hold authority and attach a Render log alert to `privacy.sweep_completed` errors.
6. Complete IdP/KMS audit-log ingestion, membership administration (operator-seeded for the pilot), session revocation tests, backup deletion/retention policy, and an independent security review.

No production customer data or live outbound call is permitted until these blockers and the legal/Shopify gates in `docs/security-review.md` are closed.
