import {
  useLoaderData,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "react-router";
import {
  SiteCta,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";
import { IndustryIcon } from "../components/industry-icons";
import { findIndustry, industries } from "../components/marketing-industries";
import {
  MomentCard,
  PillarGrid,
} from "../components/marketing-industry-blocks";

export function loader({ params }: LoaderFunctionArgs) {
  const industry = findIndustry(params.industry);
  if (!industry) {
    throw new Response("Not Found", { status: 404 });
  }
  return { slug: industry.slug };
}

export const meta: MetaFunction = ({ params }) => {
  const industry = findIndustry(params.industry);
  if (!industry) {
    return [
      { title: "Not found | Holler" },
      { name: "robots", content: "noindex, nofollow" },
    ];
  }
  return marketingMeta(
    `Holler for ${industry.name}`,
    `${industry.title} ${industry.lede}`,
    `/for/${industry.slug}`,
  );
};

export default function ForIndustry() {
  const { slug } = useLoaderData<typeof loader>();
  const industry = findIndustry(slug)!;
  const others = industries.filter((item) => item.slug !== industry.slug);

  return (
    <SitePage current="who-its-for">
      <SiteSection className="site-hero site-industry-hero">
        <div className="site-hero__title">
          <p className="site-kicker site-industry-hero__kicker">
            <IndustryIcon slug={industry.slug} size={18} />
            Holler for {industry.name}
          </p>
          <h1>{industry.title}</h1>
          <p className="site-industry-hero__lede">{industry.lede}</p>
          <div className="site-actions">
            <a
              className="site-btn site-btn--primary"
              href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
              target="_blank"
              rel="noopener noreferrer"
            >
              Holler at us <span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
        <div className="site-tile site-industry-hero__when">
          <p className="site-list-label">Holler when</p>
          <ul className="site-list">
            {industry.triggers.map((trigger) => (
              <li key={trigger}>{trigger}</li>
            ))}
          </ul>
        </div>
      </SiteSection>

      <SiteSection aria-label="What Holler does">
        <PillarGrid />
      </SiteSection>

      <SiteSection aria-labelledby="studies">
        <div className="site-head">
          <p className="site-kicker">Sample studies</p>
          <h2 id="studies">Where {industry.audience} start.</h2>
          <p>
            A non-exhaustive list of examples of where Hollering creates value.
          </p>
        </div>
        <div className="site-studies">
          {industry.moments.map((moment, index) => (
            <MomentCard moment={moment} index={index} key={moment.name} />
          ))}
        </div>
      </SiteSection>

      <SiteCta
        kicker={`Holler for ${industry.name}`}
        title={industry.closing}
        href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
        label={
          <>
            Holler at us <span aria-hidden="true">↗</span>
          </>
        }
        footer={
          <nav className="site-also" aria-label="Other industries">
            <p className="site-kicker">Also for</p>
            <ul>
              {others.map((other) => (
                <li key={other.slug}>
                  <a href={`/for/${other.slug}`}>
                    <IndustryIcon slug={other.slug} size={16} />
                    {other.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        }
      />
    </SitePage>
  );
}
