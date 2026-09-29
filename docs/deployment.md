# Deployment (Render + Cloudflare DNS)

Holler runs as one Node web service on Render with a managed PostgreSQL
database. Cloudflare holds the `withholler.com` zone and provides DNS.

| Hostname             | Serves                                                            |
| -------------------- | ----------------------------------------------------------------- |
| `withholler.com`     | Public landing page only                                          |
| `www.withholler.com` | 308 redirect to `withholler.com`                                  |
| `app.withholler.com` | Shopify app, Shopify webhooks, Twilio callbacks, workforce routes |

Both hostnames point at the same service. `apps/web/server/host-routing.mjs`
enforces the split: any non-landing path on the marketing host is redirected
(308, method preserved) to the app host, and a bare visit to the app host's
root goes to the marketing site. Stable backend URLs never depend on the
marketing site.

## Services

- `holler-web`: Express + React Router production server (`npm run start
--workspace=@holler/web`), Starter plan. Serves the landing page, Shopify,
  Twilio callbacks, and the workforce pages (`HOLLER_OPERATIONS_MODE=postgres`).
- `holler-worker`: Graphile Worker (`npm run start --workspace=@holler/worker`),
  Starter plan. Runs qualification, report rendering, and the hourly privacy
  sweep (deletion requests and retention).
- `holler-db`: PostgreSQL 17, Basic 256 MB, private network only.
- Migrations run on every `holler-web` deploy via `preDeployCommand` before
  traffic shifts.

Everything that touches customer data fails closed until its secrets exist:
the workforce pages return errors (the landing page and Shopify webhooks keep
working), and the worker refuses to start without its R2 and Twilio
credentials. Render prompts for `sync: false` secrets only when a service is
first created, so after pulling a Blueprint change that adds one, enter it in
the dashboard yourself.

## Go-live checklist

1. Google sign-in (next section).
2. Customer-data encryption with Cloud KMS (below).
3. Twilio and R2: `docs/twilio-r2-setup.md`. The same `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, and `R2_*` values go on both `holler-web` and
   `holler-worker`.
4. Shopify production app: `docs/shopify-pilot-app-setup.md`.
5. Provision the team with `npm run workforce` (below) and sign in.
6. Before the first real call: brief researchers on the recording-consent
   prompt and call rules in `docs/mvp-security-privacy-signoff.md`.

## Customer-data encryption (Cloud KMS)

Customer phone numbers and first names are encrypted with a Google Cloud KMS
key before they are stored. Without it, production refuses to serve workforce
pages, and development drops contact details at ingestion.

1. In the production Google Cloud project, enable the **Cloud Key Management
   Service API**.
2. Create a key ring `pii` (location `us`) and a **symmetric
   encrypt/decrypt** key `customer-data`, with automatic rotation (for
   example every 365 days). Old key versions stay enabled for decryption.
3. Create a service account `holler-pii` and grant it only **Cloud KMS
   CryptoKey Encrypter/Decrypter** on that key (not the project).
4. Create a JSON key for the service account. In Render → `holler-web` →
   **Environment → Secret Files**, add it as `gcp-kms.json`
   (`GOOGLE_APPLICATION_CREDENTIALS` already points to
   `/etc/secrets/gcp-kms.json`). Delete the downloaded copy.
5. Set `PII_KMS_KEY_ID` on `holler-web` to
   `projects/<project-id>/locations/us/keyRings/pii/cryptoKeys/customer-data`.

Only `holler-web` needs the key; the worker never decrypts customer data.

## Workforce sign-in (Google)

Workforce pages use Google sign-in when `WORKFORCE_AUTH_PROVIDER=oidc`.

1. In Google Admin (`admin.google.com`) → **Security → 2-Step Verification**,
   require 2-Step Verification for everyone in `withholler.com`.
2. In Google Cloud Console → **APIs & Services → OAuth consent screen**, choose
   **Internal** so only `withholler.com` accounts can use the app.
3. **Credentials → Create credentials → OAuth client ID → Web application**,
   with authorized redirect URI
   `https://app.withholler.com/login/google/callback` (add
   `http://localhost:5173/login/google/callback` on a separate development
   client).
4. Set in Render:

   | Key                          | Value                            |
   | ---------------------------- | -------------------------------- |
   | `WORKFORCE_AUTH_PROVIDER`    | `oidc`                           |
   | `OIDC_ISSUER`                | `https://accounts.google.com`    |
   | `OIDC_AUDIENCE`              | the OAuth client ID              |
   | `GOOGLE_OAUTH_CLIENT_SECRET` | the OAuth client secret (secret) |
   | `WORKFORCE_ALLOWED_DOMAIN`   | `withholler.com`                 |

5. Provision people before they sign in (there is no self sign-up):

   ```bash
   npm run workforce -- add person@withholler.com
   npm run workforce -- grant person@withholler.com <merchantId> research_manager
   npm run workforce -- disable person@withholler.com   # ends all sessions
   ```

   Against production, run these from a Render shell on `holler-web`.

## First-time setup

### 1. Render

1. Merge to `main` so Render can read `render.yaml`.
2. In Render: **New → Blueprint**, connect the GitHub repository, select the
   `main` branch, and apply.
3. When prompted, enter `SHOPIFY_API_SECRET` (Shopify Partner dashboard → app
   → Client credentials). Leaving it blank only disables the Shopify surface.
4. Wait for the first deploy. Open the service's `*.onrender.com` URL and
   confirm the landing page loads.
5. In the service's **Settings → Custom Domains**, confirm `withholler.com` and
   `app.withholler.com` are listed (Render also adds `www`). Note the target
   hostname Render shows, e.g. `holler-web.onrender.com`.

### 2. Cloudflare DNS

In the `withholler.com` zone, **leave MX/TXT email records untouched**. Remove
any existing `A`/`AAAA`/`CNAME` records for `@`, `www`, and `app` (e.g. parking
records), then add:

| Type  | Name  | Target                    | Proxy    |
| ----- | ----- | ------------------------- | -------- |
| CNAME | `@`   | `holler-web.onrender.com` | DNS only |
| CNAME | `www` | `holler-web.onrender.com` | DNS only |
| CNAME | `app` | `holler-web.onrender.com` | DNS only |

Use the exact target Render displays. Cloudflare flattens the apex CNAME.

Back in Render, click **Verify** on each domain. Render issues TLS
certificates once DNS resolves (usually minutes).

Optional, after certificates are issued: switch the records to **Proxied** and
set Cloudflare **SSL/TLS → Full (strict)**. Never use "Flexible"; it breaks
HTTPS to the origin and Twilio signature checks.

### 3. Verify

```bash
curl -sI https://withholler.com/            # 200
curl -sI https://www.withholler.com/        # 308 → https://withholler.com/
curl -sI https://withholler.com/queue       # 308 → https://app.withholler.com/queue
curl -sI https://app.withholler.com/        # 302 → https://withholler.com/
```

## Backend URLs for providers

Use these when configuring external services. They depend only on
`APP_BASE_URL=https://app.withholler.com`.

| Provider | Setting                     | Value                                                |
| -------- | --------------------------- | ---------------------------------------------------- |
| Shopify  | App URL                     | `https://app.withholler.com`                         |
| Shopify  | Allowed redirection URL     | `https://app.withholler.com/auth/callback`           |
| Shopify  | Webhooks (from app config)  | `https://app.withholler.com/webhooks`                |
| Twilio   | TwiML App Voice request URL | `https://app.withholler.com/api/twilio/voice` (POST) |

Holler sets Twilio's call-status and recording-status callbacks itself
(`/api/twilio/call-status`, `/api/twilio/recording-status`) from
`APP_BASE_URL`, and verifies webhook signatures against it, so it must match
the public origin exactly. See `docs/twilio-r2-setup.md` for Twilio and R2
provisioning and the secrets to add in Render.

### Shopify dev vs production

`shopify.app.toml` still points at Shopify's placeholder URL and has
`automatically_update_urls_on_dev = true`. Running `shopify app dev` against
this app rewrites its URLs to a temporary tunnel, which would break a
production install. Before pointing the Shopify app at `app.withholler.com`,
create a separate development app (or a `shopify.app.production.toml` for a
separate production app) so dev and production never share URLs.

## Operating

- `holler-web` deploys from `main` only, and only after GitHub CI passes for
  the commit (`autoDeployTrigger: checksPass`). Ship by merging a PR to `main`.
- Build: `npm ci --include=dev && npm run build --workspace=@holler/web`
  (dev dependencies are needed for the build and for `tsx` in migrations).
- Roll back from the service's **Events** page.
- The database accepts no external connections (`ipAllowList: []`). To inspect
  it, temporarily add your IP in Render, and remove it afterwards.
- Never point local development commands at the production database.
