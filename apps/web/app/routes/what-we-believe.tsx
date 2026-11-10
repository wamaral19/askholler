import {
  SiteCta,
  SitePage,
  SiteSection,
  marketingMeta,
} from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "What We Believe | Holler",
    "The principles behind Holler's human-led customer research: humans want to talk to humans, unique insights create an unfair advantage, context is everything, conversations beat surveys, and incentives matter.",
  );
}

const beliefs = [
  {
    title: "Humans want to talk to humans.",
    copy: "Bot fatigue is real. We've pounded zero on the support calls and typed \"agent\" 10x into the chatbot, just like you. If brands aren't willing to invest human time and effort into gathering insights, they shouldn't expect their customers to provide much.",
  },
  {
    title: "Customers can smell authenticity.",
    copy: "Real testimonials from real customers resonate much better than scripted content. Our content resonates because customers know it's real, and it hits harder than an emotionless written testimonial.",
  },
  {
    title: "Unique insights create an unfair advantage.",
    copy: "Your right to win comes from proprietary data and unique insights. We give you the tools, you make it happen.",
  },
  {
    title: "Context is everything.",
    copy: "The best time to understand a decision is right after it's made. We talk to customers at the moments when their motivations, emotions, and experiences are freshest.",
  },
  {
    title: "Incentives matter.",
    copy: "When everyone wants credit it's hard to know who's responsible. We're operators at heart. We charge flat fees because we want to uncover the truth, not take credit for it.",
  },
];

export default function WhatWeBelieve() {
  return (
    <SitePage current="what-we-believe">
      <SiteSection>
        <div className="site-head">
          <p className="site-kicker">Our principles</p>
          <h1>What we believe</h1>
        </div>
        <ol className="site-steps">
          {beliefs.map((belief, index) => (
            <li key={belief.title}>
              <span className="site-number">0{index + 1}</span>
              <div>
                <h2>{belief.title}</h2>
                <p>{belief.copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </SiteSection>

      <SiteCta
        kicker="Talk with Holler"
        title="What do you want to understand about your customers?"
        href="https://calendar.app.google/mrp9eD6VrhFgm7Hz9"
        label={
          <>
            Holler at us <span aria-hidden="true">↗</span>
          </>
        }
      />
    </SitePage>
  );
}
