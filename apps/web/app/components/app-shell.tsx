import { useId, useState, type ReactNode } from "react";
import { Form, NavLink, useLocation, useRouteLoaderData } from "react-router";

import type { loader as workforceLayoutLoader } from "../routes/workforce-layout";

interface AppShellProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  /** Extra class on the shell, e.g. the dark call-sheet console. */
  readonly className?: string;
  /** Leave out the page header; the page supplies its own context. */
  readonly hideHeader?: boolean;
}

export function AppShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
  hideHeader = false,
}: AppShellProps) {
  const layout = useRouteLoaderData<typeof workforceLayoutLoader>(
    "routes/workforce-layout",
  );
  const [collapsed, setCollapsed] = useState(layout?.sidebarCollapsed ?? false);
  const navId = useId();

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    document.cookie = `holler_sidebar=${next ? "collapsed" : "open"}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }

  return (
    <div
      className={[
        "app-shell",
        collapsed ? "app-shell--sidebar-collapsed" : null,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <aside className="sidebar">
        <button
          aria-controls={navId}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="sidebar-toggle"
          onClick={toggleSidebar}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          type="button"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" width="18" height="18">
            <path
              d={collapsed ? "M7 4l6 6-6 6" : "M13 4l-6 6 6 6"}
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            />
          </svg>
        </button>
        {collapsed ? (
          <img
            alt="Holler"
            className="sidebar-mark"
            src="/brand/holler-mark.png"
          />
        ) : null}
        <div className="sidebar-body" hidden={collapsed} id={navId}>
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
                Live angles
              </NavLink>
              <NavLink to="/moments/new">Angle builder</NavLink>
            </NavGroup>
            <NavGroup label="Live research">
              <NavLink to="/queue">Live queue</NavLink>
              <NavLink to="/calls">Completed calls</NavLink>
            </NavGroup>
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
        </div>
      </aside>
      <main className="workspace">
        {hideHeader ? (
          <h1 className="sr-only">{title}</h1>
        ) : (
          <header className="page-header">
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h1>{title}</h1>
              <p className="lede">{description}</p>
            </div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </header>
        )}
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
