import { industries } from "../components/marketing-industries";

export const MARKETING_ORIGIN = "https://withholler.com";

const STATIC_MARKETING_PATHS = [
  "/",
  "/ad-content",
  "/contact",
  "/for",
  "/how-it-works",
  "/pricing",
  "/privacy",
  "/research",
  "/sample-report",
  "/use-cases",
  "/what-we-believe",
] as const;

export const MARKETING_PATHS = [
  ...STATIC_MARKETING_PATHS,
  ...industries.map((industry) => `/for/${industry.slug}`),
];

export function marketingUrl(path: string): string {
  return new URL(path, MARKETING_ORIGIN).toString();
}

export const MARKETING_STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${MARKETING_ORIGIN}/#organization`,
      name: "Holler",
      url: `${MARKETING_ORIGIN}/`,
      logo: {
        "@type": "ImageObject",
        url: `${MARKETING_ORIGIN}/brand/holler-logo-primary.png`,
      },
      email: "mailto:wyatt@withholler.com",
      founder: {
        "@type": "Person",
        name: "Wyatt Amaral",
      },
    },
    {
      "@type": "WebSite",
      "@id": `${MARKETING_ORIGIN}/#website`,
      name: "Holler",
      url: `${MARKETING_ORIGIN}/`,
      publisher: {
        "@id": `${MARKETING_ORIGIN}/#organization`,
      },
    },
    {
      "@type": "Service",
      "@id": `${MARKETING_ORIGIN}/#customer-research-service`,
      name: "Point-in-time customer research and testimonial content",
      description:
        "Holler conducts human customer interviews for consumer brands and turns the evidence into customer research, actionable reports, and testimonial content.",
      serviceType:
        "Point-in-time customer research and customer testimonial content",
      provider: {
        "@id": `${MARKETING_ORIGIN}/#organization`,
      },
      audience: {
        "@type": "BusinessAudience",
        audienceType: "DTC ecommerce and consumer brands",
      },
    },
  ],
};

export function marketingSitemap(): string {
  const urls = MARKETING_PATHS.map(
    (path) => `  <url><loc>${marketingUrl(path)}</loc></url>`,
  ).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    "</urlset>",
    "",
  ].join("\n");
}
