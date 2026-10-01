# Twilio Voice and Cloudflare R2 setup

The Holler MVP uses Twilio for browser calling and consent-controlled recording,
then copies completed recordings into a private Cloudflare R2 bucket. SMS is not
enabled by this setup.

## 1. Twilio account and number

1. Create or upgrade the Twilio account owned by Holler.
2. Purchase one US local number with both **Voice** and **SMS** capabilities.
   Voice is enabled now; selecting SMS capability avoids changing the public
   number if messaging is approved later.
3. In Twilio, create a standard API key. Save its SID and secret directly into
   the deployment secret store. The secret is shown only once.
4. Create a TwiML App whose Voice request URL is
   `https://<production-host>/api/twilio/voice`, method `POST`.
5. Keep the account auth token in the deployment secret store. It verifies
   Twilio callbacks and authorizes recording operations.

Do not paste secrets into chat, tickets, documentation, or committed environment
files.

## 2. Cloudflare R2

1. Create a private production bucket, recommended name
   `holler-production-private`.
2. Leave `r2.dev` and public custom-domain access disabled.
3. Create an R2 S3 API token restricted to object read/write for this bucket.
4. Configure lifecycle expiry as a backstop:
   - `recordings/`: 30 days
   - `exports/`: 7 days
   - `exports/temporary/`: 1 day
5. Enable account audit logs and R2 data-access logs where available.

The application explicitly deletes objects during privacy workflows; lifecycle
rules do not replace verified deletion.

## 3. Deployment configuration

Set these as encrypted deployment secrets or non-secret configuration as
appropriate:

```text
DIALER_PROVIDER=twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_API_KEY_SID=SK...
TWILIO_API_KEY_SECRET=...
TWILIO_AUTH_TOKEN=...
TWILIO_TWIML_APP_SID=AP...
TWILIO_CALLER_ID=+1...
TWILIO_CALL_INTENT_SECRET=<at least 32 random characters>

OBJECT_STORE_PROVIDER=r2
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=holler-production-private
```

`APP_BASE_URL` must exactly match the public HTTPS origin seen by Twilio. Webhook
signature verification intentionally fails if proxies or environment settings
produce a different external URL.

Generate the call-intent secret with a cryptographically secure secret manager
or password generator. It is independent of all Twilio credentials.

## 4. Implemented call flow

1. An authenticated researcher opens a claimed interview.
2. Holler creates a five-minute Twilio browser token and a signed, single-use
   call intent bound to merchant, interview, assignment, and researcher.
3. Twilio posts the intent to the voice webhook. Holler verifies Twilio's
   signature, atomically binds the Twilio Call SID, rechecks the assignment, and
   only then reveals the destination number inside the PII boundary.
4. The call begins unrecorded.
5. The researcher asks the approved consent question and checks the affirmative
   consent control. Holler persists consent before calling Twilio's recording
   API.
6. Signed callbacks update call and recording state idempotently.
7. On recording completion, Holler downloads the authenticated recording,
   verifies its SHA-256 checksum, uploads it to private R2, records the durable
   transfer state, and deletes the Twilio copy.

## 5. Pre-live verification

- Use a staging Twilio account/subaccount, number, database, and R2 bucket.
- Confirm unsigned or incorrectly signed webhooks receive `403`.
- Confirm another researcher or merchant cannot obtain a token or control the
  interview recording.
- Confirm recording cannot start before the call connects and consent is
  persisted.
- Complete answered, rejected, busy, no-answer, browser-disconnect, and callback
  retry scenarios.
- Verify R2 contains the expected private object and Twilio no longer retains
  the copied recording.
- Run customer deletion and 30-day expiry against the R2 object.
- Confirm no phone number, token, recording URL, or transcript appears in logs.

Live calls remain blocked until production Firebase/Workspace authentication,
KMS-backed phone decryption, and Cloudflare deployment/database connectivity
are complete.
