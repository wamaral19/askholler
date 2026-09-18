import type { ReactNode } from "react";
import { NavLink } from "react-router";

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
          <span className="brand-mark">Q</span>
          <div>
            <strong>Holler</strong>
            <span>Research operations</span>
          </div>
        </div>
        <nav aria-label="Primary navigation">
          <NavLink to="/moments" end>
            Research Moments
          </NavLink>
          <NavLink to="/moments/new">Cohort builder</NavLink>
          <NavLink to="/queue">Research queue</NavLink>
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" />
          Prototype workspace
          <small>Synthetic data · no calls placed</small>
        </div>
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
