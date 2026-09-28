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

1. Configure Firebase Authentication for Google Workspace and invitation-only email links; enforce Workspace MFA for PII-capable users and implement token/session verification plus step-up checks in a concrete adapter.
2. Implement Google Cloud KMS `DataKeyProvider`; provision separate environment keys, restrict decrypt grants to the PII service, and complete a rotation drill.
3. Wire encrypted envelopes into all production customer-private and Shopify credential writes. Existing `synthetic:*` fixture ciphertext is not production encryption.
4. Implement the PostgreSQL deletion repository and concrete erasers for database PII, recordings/object storage, transcripts/evidence, exports, Shopify credentials, and approved external providers.
5. Implement the approved retention durations, name the legal-hold authority, schedule retention sweeps, and alert on failed/overdue steps.
6. Complete IdP/KMS audit-log ingestion, membership administration, session revocation tests, backup deletion/retention policy, and an independent security review.

No production customer data or live outbound call is permitted until these blockers and the legal/Shopify gates in `docs/security-review.md` are closed.
