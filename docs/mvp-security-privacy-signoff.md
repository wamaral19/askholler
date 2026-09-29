# MVP security, privacy, and retention signoff

Status: approved by product owner on 2026-09-24

This record captures product decisions for the Holler MVP. Approval authorizes
implementation and drafting; it does not assert that a control is deployed or
that legal review has occurred. Production customer data and live calls remain
blocked until the applicable implementation, testing, Shopify, and legal gates
are complete.

## Approved decisions

1. **Workforce authentication:** Use Firebase Authentication with only Google
   sign-in and passwordless email-link sign-in. Google Workspace two-step
   verification is required for workforce users who can access customer PII.
   Email-link access is invitation-only. A recent MFA-backed Google session is
   required for phone reveal, PII exports, membership administration, deletion,
   and legal-hold administration.
2. **Key management:** Use Google Cloud KMS. Staging and production use separate
   keys and service identities. Only the PII service identity receives decrypt
   permission. Complete a rotation drill before production and annually.
3. **Application encryption:** All production customer-private fields and
   Shopify credentials use authenticated envelope encryption. Production must
   reject synthetic ciphertext markers.
4. **Deletion:** Implement Shopify privacy webhooks and end-to-end deletion for
   PostgreSQL PII, recordings/object storage, transcripts/evidence, exports,
   Shopify credentials, and each approved external provider. Steps are
   idempotent, independently retryable, and auditable without retaining subject
   PII.
5. **Retention:** Adopt the data-class schedule below. Retention sweeps run at
   least daily. Failed or overdue deletion steps alert the operator.
6. **Operational controls:** Draft and implement access administration,
   revocation testing, audit-log ingestion, backup handling, incident response,
   key rotation, legal hold, and independent security-review procedures.

## Pilot scope reductions

Approved by product owner on 2026-09-29 for the first merchant pilot. See the
pilot scope table in `docs/mvp-plan.md`.

- **Workforce authentication:** only Holler's internal team has access, using
  Google sign-in with Workspace 2-step verification. Email-link sign-in is not
  built for the pilot. An operator seeds memberships and roles, so there is no
  membership admin UI yet. Revocation must still work and be tested.
  Implementation uses Google OpenID Connect directly rather than Firebase
  Authentication, which is no longer needed without email links. Google ID
  tokens do not report whether a given sign-in used 2-step verification, so
  MFA is enforced by the Workspace policy requiring 2-step verification for
  every `withholler.com` account, and sessions last at most 12 hours. A
  separate recent-MFA step-up for phone reveal is not built for the pilot.
- **Transcription:** none. No transcription provider receives call audio.
  Researchers capture responses and observations directly.
- **Shopify:** custom app distribution to the pilot merchant only.
- **Reports:** Earshot and Disco are assembled manually from reviewed evidence
  and delivered privately. Every manual export follows the PII-bearing export
  retention rule below.

Key management, envelope encryption, deletion, retention, and call/recording
consent requirements are unchanged.

## Approved platform inputs

- Google Workspace domain: `withholler.com`
- Initial administrator: `wyatt@withholler.com`
- Hosting provider: Cloudflare
- Object storage: private Cloudflare R2 buckets, separated by environment
- Google Cloud/Firebase: separate staging and production projects

The Google Cloud project IDs have not yet been created or recorded.

## Provider decisions still open

- Calling provider: Twilio Programmable Voice approved on 2026-09-24. The MVP
  scope is browser calling, explicit consent-controlled recording, signed call
  and recording callbacks, private R2 transfer, and deletion of the Twilio copy
  after verified transfer.
- SMS: deferred. The Twilio number should be selected with both Voice and SMS
  capability, but production messaging remains disabled until its workflow and
  A2P registration are separately approved.
- Transcription provider: deferred until after the pilot (2026-09-29). Deepgram
  remains a candidate only.

No transcription adapter or production SMS workflow is authorized by this
signoff until the applicable provider or workflow is approved.

## Approved MVP retention schedule

| Data class                                |                                              Maximum normal retention |
| ----------------------------------------- | --------------------------------------------------------------------: |
| Customer PII used for recruitment         |                                                               90 days |
| Raw recordings                            |                                    30 days after interview completion |
| Raw transcripts                           |                                    90 days after interview completion |
| PII-bearing exports                       |                                                                7 days |
| Unused or unopened temporary exports      |                                                              24 hours |
| Approved, redacted evidence               |                                                             12 months |
| Reports without direct identifiers        |         24 months or the merchant contract term, whichever is shorter |
| Failed or incomplete prospect records     |                                                               30 days |
| Shopify and provider credentials          | Until uninstall, revocation, or loss of purpose; then delete promptly |
| Non-PII security and access audit records |                                                             12 months |
| Encrypted backups                         |                                 35 days, followed by automatic expiry |

An authenticated privacy request, Shopify redaction webhook, shop uninstall, or
contractual requirement can require earlier deletion. A documented legal hold
is the only normal exception. Retention extensions require a recorded owner,
purpose, scope, and new expiry date.

## MVP call and recording consent

Pre-call consent is not required by the product design for the MVP, but may be
added later. A live researcher must obtain affirmative verbal permission before
recording the substantive interview.

Approved prompt:

> Hi, this is Wyatt from Holler. I'd like to record this call for customer
> research. Is that okay?

The application must record the consent outcome and time. Silence, an ambiguous
answer, or continuing the conversation is not consent. If consent is declined,
the recording must remain off or stop immediately; the researcher may continue
only if an approved unrecorded-call workflow is available. The call flow must
also honor suppression, opt-out, calling-time, and jurisdictional rules approved
by counsel. This product decision is not a legal opinion.

## Named approvals still required

Before live production use, record the individuals or roles approving:

- privacy/recording/outbound-contact legal review;
- legal-hold placement and release;
- production access and membership changes;
- incident command and breach notification;
- the independent security review and remediation acceptance.
