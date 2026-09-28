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

## What is deployed now

- `holler-web`: Express + React Router production server (`npm run start
--workspace=@holler/web`), Starter plan.
- `holler-db`: PostgreSQL 17, Basic 256 MB, private network only.
- Migrations run on every deploy via `preDeployCommand` before traffic shifts.

Deliberately **not** enabled:

- **Worker.** In production it refuses to start until OIDC workforce auth, KMS
  phone encryption, and live Twilio/R2 configuration exist. Add it to
  `render.yaml` when those launch blockers are resolved.
- **Operations UI.** `HOLLER_OPERATIONS_MODE` is unset, so `/queue`, `/moments`,
  `/admin/dashboard`, and `/interviews/*` fail closed. Do not set a synthetic
  mode on the public deployment.
- **Live calls.** Twilio variables are unset, so `/api/twilio/*` fail closed.

## First-time setup

### 1. Render

1. Push this branch (or merge to `main`) so Render can read `render.yaml`.
2. In Render: **New → Blueprint**, connect the GitHub repository, select the
   branch, and apply.
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

- Deploys happen automatically on push to the connected branch.
- Build: `npm ci --include=dev && npm run build --workspace=@holler/web`
  (dev dependencies are needed for the build and for `tsx` in migrations).
- Roll back from the service's **Events** page.
- The database accepts no external connections (`ipAllowList: []`). To inspect
  it, temporarily add your IP in Render, and remove it afterwards.
- Never point local development commands at the production database.
