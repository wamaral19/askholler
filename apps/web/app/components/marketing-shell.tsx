type MarketingHeaderProps = {
  current?:
    "use-cases" | "how-it-works" | "pricing" | "work-with-holler" | "about";
  scrolled?: boolean;
};

const navigation = [
  { label: "Use Cases", href: "/use-cases", key: "use-cases" },
  { label: "How We Work", href: "/how-it-works", key: "how-it-works" },
  { label: "Pricing", href: "/pricing", key: "pricing" },
  {
    label: "Work With Holler",
    href: "/work-with-holler",
    key: "work-with-holler",
  },
  { label: "About", href: "/about", key: "about" },
] as const;

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

export function MarketingHeader({
  current,
  scrolled = true,
}: MarketingHeaderProps) {
  return (
    <header className={`preview-header${scrolled ? " is-scrolled" : ""}`}>
      <div className="preview-header-inner">
        <a className="preview-brand" href="/" aria-label="Holler home">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
        </a>

        <nav className="preview-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <a
              href={item.href}
              aria-current={current === item.key ? "page" : undefined}
              key={item.key}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <details className="preview-mobile-menu">
          <summary>Menu</summary>
          <nav aria-label="Mobile navigation">
            {navigation.map((item) => (
              <a
                href={item.href}
                aria-current={current === item.key ? "page" : undefined}
                key={item.key}
              >
                {item.label}
              </a>
            ))}
          </nav>
        </details>

        <a className="preview-header-cta" href="/contact">
          Contact
        </a>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="preview-footer">
      <div className="preview-footer-brand">
        <a href="/" aria-label="Holler home">
          <img src="/brand/holler-wordmark.png" alt="Holler" />
        </a>
        <p>Human customer research for DTC brands.</p>
        <span>© {new Date().getFullYear()} Holler</span>
      </div>
      <nav aria-label="Footer navigation">
        {navigation.map((item) => (
          <a href={item.href} key={item.key}>
            {item.label}
          </a>
        ))}
      </nav>
      <div className="preview-footer-contact">
        <p>Bring us the question behind the metric.</p>
        <a href={marketingContactHref}>wyatt@withholler.com</a>
        <a href="/privacy">Privacy</a>
      </div>
    </footer>
  );
}
