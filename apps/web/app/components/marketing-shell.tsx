import { useEffect, useRef, useState, type ReactNode } from "react";
import { useCases } from "./marketing-content";
import "../marketing.css";

export const marketingContactHref =
  "mailto:wyatt@withholler.com?subject=I%27d%20like%20to%20work%20with%20Holler";

export function marketingMeta(title: string, description: string) {
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
  ];
}

/* Site shell for the public marketing pages. */

type SitePageKey =
  | "home"
  | "use-cases"
  | "how-it-works"
  | "pricing"
  | "work-with-holler"
  | "about"
  | "contact"
  | "privacy";

type NavLink = { label: string; href: string; description?: string };
type NavItem =
  | { kind: "link"; key: SitePageKey; label: string; href: string }
  | {
      kind: "menu";
      key: SitePageKey;
      label: string;
      heading: string;
      links: NavLink[];
      footer: NavLink;
    };

const siteNavigation: NavItem[] = [
  {
    kind: "menu",
    key: "use-cases",
    label: "Use Cases",
    heading: "Answer the question behind the metric",
    links: useCases.map((useCase) => ({
      label: useCase.label,
      href: `/use-cases#${useCase.slug}`,
      description: useCase.question,
    })),
    footer: { label: "All use cases", href: "/use-cases" },
  },
  {
    kind: "menu",
    key: "how-it-works",
    label: "How We Work",
    heading: "From question to evidence",
    links: [
      {
        label: "How We Work",
        href: "/how-it-works",
        description: "Five steps from an important question to a report.",
      },
      {
        label: "Work With Holler",
        href: "/work-with-holler",
        description: "A focused Research Run or ongoing research.",
      },
      {
        label: "Sample report",
        href: "/sample-report",
        description: "See what a finished Holler report looks like.",
      },
    ],
    footer: { label: "See pricing", href: "/pricing" },
  },
  { kind: "link", key: "pricing", label: "Pricing", href: "/pricing" },
  { kind: "link", key: "about", label: "About", href: "/about" },
];

const footerColumns: { heading: string; links: NavLink[] }[] = [
  {
    heading: "Use Cases",
    links: useCases.map((useCase) => ({
      label: useCase.label,
      href: `/use-cases#${useCase.slug}`,
    })),
  },
  {
    heading: "Research",
    links: [
      { label: "How We Work", href: "/how-it-works" },
      { label: "Work With Holler", href: "/work-with-holler" },
      { label: "Sample report", href: "/sample-report" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    heading: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
    ],
  },
];

function Chevron() {
  return (
    <svg
      className="site-chevron"
      viewBox="0 0 12 12"
      width="10"
      height="10"
      aria-hidden="true"
    >
      <path
        d="M2.5 4.5 6 8l3.5-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SiteHeader({ current }: { current?: SitePageKey | undefined }) {
  const [openMenu, setOpenMenu] = useState<SitePageKey | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const openNow = (key: SitePageKey) => {
    window.clearTimeout(closeTimer.current);
    setOpenMenu(key);
  };
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpenMenu(null), 120);
  };

  return (
    <header
      className={`site-header${scrolled ? " is-scrolled" : ""}${
        mobileOpen ? " is-mobile-open" : ""
      }`}
      ref={headerRef}
    >
      <div className="site-header__inner">
        <a className="site-brand" href="/" aria-label="Holler home">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
        </a>

        <nav className="site-nav" aria-label="Main navigation">
          <ul>
            {siteNavigation.map((item) =>
              item.kind === "link" ? (
                <li key={item.key}>
                  <a
                    className="site-nav__trigger"
                    href={item.href}
                    aria-current={current === item.key ? "page" : undefined}
                  >
                    {item.label}
                  </a>
                </li>
              ) : (
                <li
                  key={item.key}
                  onPointerEnter={(event) =>
                    event.pointerType === "mouse" && openNow(item.key)
                  }
                  onPointerLeave={(event) =>
                    event.pointerType === "mouse" && closeSoon()
                  }
                >
                  <button
                    type="button"
                    className="site-nav__trigger"
                    aria-expanded={openMenu === item.key}
                    aria-controls={`site-menu-${item.key}`}
                    data-current={current === item.key ? "" : undefined}
                    onClick={() =>
                      setOpenMenu(openMenu === item.key ? null : item.key)
                    }
                  >
                    {item.label}
                    <Chevron />
                  </button>
                  <div
                    className="site-menu"
                    id={`site-menu-${item.key}`}
                    data-open={openMenu === item.key ? "" : undefined}
                  >
                    <div className="site-menu__panel">
                      <p className="site-menu__heading">{item.heading}</p>
                      <ul
                        className={
                          item.links.length > 3 ? "is-two-column" : undefined
                        }
                      >
                        {item.links.map((link) => (
                          <li key={link.href}>
                            <a
                              href={link.href}
                              onClick={() => setOpenMenu(null)}
                            >
                              <strong>{link.label}</strong>
                              <span>{link.description}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                      <a className="site-menu__footer" href={item.footer.href}>
                        {item.footer.label} <span aria-hidden="true">→</span>
                      </a>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ul>
        </nav>

        <a
          className="site-btn site-btn--primary site-btn--sm site-header__cta"
          href="/contact"
          aria-current={current === "contact" ? "page" : undefined}
        >
          Contact
        </a>

        <button
          type="button"
          className="site-menu-toggle"
          aria-expanded={mobileOpen}
          aria-controls="site-mobile-menu"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>

      <div className="site-mobile" id="site-mobile-menu" hidden={!mobileOpen}>
        <nav aria-label="Mobile navigation">
          {siteNavigation.map((item) =>
            item.kind === "link" ? (
              <a
                className="site-mobile__link"
                href={item.href}
                key={item.key}
                aria-current={current === item.key ? "page" : undefined}
              >
                {item.label}
              </a>
            ) : (
              <details key={item.key} open={current === item.key}>
                <summary className="site-mobile__link">
                  {item.label}
                  <Chevron />
                </summary>
                <ul>
                  {item.links.map((link) => (
                    <li key={link.href}>
                      <a href={link.href} onClick={() => setMobileOpen(false)}>
                        {link.label}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a href={item.footer.href}>{item.footer.label}</a>
                  </li>
                </ul>
              </details>
            ),
          )}
        </nav>
        <a
          className="site-btn site-btn--primary site-btn--block"
          href="/contact"
        >
          Contact
        </a>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__brand">
          <a href="/" aria-label="Holler home">
            <img src="/brand/holler-wordmark.png" alt="Holler" />
          </a>
          <p>Human customer research for DTC brands.</p>
          <p className="site-footer__ask">
            Bring us the question behind the metric.
          </p>
          <a className="site-footer__email" href={marketingContactHref}>
            wyatt@withholler.com
          </a>
        </div>
        {footerColumns.map((column) => (
          <nav aria-label={column.heading} key={column.heading}>
            <p>{column.heading}</p>
            <ul>
              {column.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="site-footer__legal">
        <span>© {new Date().getFullYear()} Holler</span>
        <a href="/privacy">Privacy</a>
      </div>
    </footer>
  );
}

export function SitePage({
  current,
  className,
  children,
}: {
  current?: SitePageKey | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={`site${className ? ` ${className}` : ""}`}>
      <SiteHeader current={current} />
      <main id="top">{children}</main>
      <SiteFooter />
    </div>
  );
}

/* One framed band of the page: a hairline across the viewport and rails at
   the column edges. */
export function SiteSection({
  className,
  children,
  ...rest
}: {
  className?: string;
  children: ReactNode;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <section
      className={`site-section${className ? ` ${className}` : ""}`}
      {...rest}
    >
      <div className="site-frame">{children}</div>
    </section>
  );
}

export function SiteHero({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker: string;
  title: ReactNode;
  lede: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <SiteSection className="site-hero">
      <div className="site-hero__title">
        <p className="site-kicker">{kicker}</p>
        <h1>{title}</h1>
        {actions ? <div className="site-actions">{actions}</div> : null}
      </div>
      <p className="site-hero__lede">{lede}</p>
    </SiteSection>
  );
}

export function SiteCta({
  kicker,
  title,
  body,
  href,
  label,
}: {
  kicker: string;
  title: ReactNode;
  body?: ReactNode;
  href: string;
  label: ReactNode;
}) {
  return (
    <SiteSection className="site-cta-section">
      <div className="site-cta">
        <p className="site-kicker">{kicker}</p>
        <h2>{title}</h2>
        {body ? <p>{body}</p> : null}
        <a className="site-btn site-btn--primary" href={href}>
          {label}
        </a>
      </div>
    </SiteSection>
  );
}
