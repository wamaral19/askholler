import { useId, useState, type ReactNode } from "react";
import { Form, NavLink, useLocation, useRouteLoaderData } from "react-router";

import type { loader as workforceLayoutLoader } from "../routes/workforce-layout";

interface AppShellProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

export function AppShell({
  eyebrow,
  title,
  description,
  actions,
  children,
}: AppShellProps) {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
          <span>Research operations</span>
        </div>
        <MerchantSelection />
        <nav aria-label="Primary navigation">
          <NavGroup label="Admin">
            <NavLink to="/admin/dashboard">Dashboard</NavLink>
            <NavLink to="/admin/research-fields">Research fields</NavLink>
            <NavLink to="/admin/scripts">Scripts</NavLink>
          </NavGroup>
          <NavGroup label="Angle setup">
            <NavLink to="/moments" end>
              Moments
            </NavLink>
            <NavLink to="/moments/new">Moment builder</NavLink>
          </NavGroup>
          <NavLink to="/queue">Order queue</NavLink>
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          Prototype workspace
          <small>Synthetic data · no calls placed</small>
        </div>
        <Form action="/login" method="post" className="sidebar-sign-out">
          <input name="intent" type="hidden" value="sign-out" />
          <button className="text-button" type="submit">
            Sign out
          </button>
        </Form>
      </aside>
      <main className="workspace">
        <header className="page-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="lede">{description}</p>
          </div>
          {actions ? <div className="page-actions">{actions}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}

function MerchantSelection() {
  const data = useRouteLoaderData<typeof workforceLayoutLoader>(
    "routes/workforce-layout",
  );
  const location = useLocation();
  const selectId = useId();
  if (!data?.merchants.length) return null;
  const current = data.merchants.find(
    (merchant) => merchant.id === data.merchantId,
  );
  return (
    <section className="merchant-selection" aria-label="Merchant selection">
      {data.merchants.length > 1 ? (
        <Form action="/merchant" method="post">
          <label htmlFor={selectId}>Merchant</label>
          <input
            name="redirectTo"
            type="hidden"
            value={location.pathname + location.search}
          />
          <select
            id={selectId}
            name="merchantId"
            defaultValue={data.merchantId}
            key={data.merchantId}
            onChange={(event) => event.currentTarget.form?.requestSubmit()}
          >
            {data.merchants.map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
          </select>
          <noscript>
            <button className="text-button" type="submit">
              Switch merchant
            </button>
          </noscript>
        </Form>
      ) : (
        <>
          <span className="merchant-selection__label">Merchant</span>
          <strong>{current?.name ?? data.merchants[0]?.name}</strong>
        </>
      )}
    </section>
  );
}

function NavGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const groupId = useId();
  return (
    <div className="nav-group">
      <button
        aria-controls={groupId}
        aria-expanded={open}
        className="nav-group__toggle"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {label}
      </button>
      <div className="nav-group__links" hidden={!open} id={groupId}>
        {children}
      </div>
    </div>
  );
}

export function PrototypeBanner({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="prototype-banner" role="status">
      <strong>Prototype mode</strong>
      <span>{children}</span>
    </div>
  );
}
