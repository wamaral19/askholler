import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { SitePage, marketingMeta } from "../components/marketing-shell";

export function meta() {
  return marketingMeta(
    "Sample customer research workspace | Holler",
    "An interactive, synthetic Holler research workspace with evidence linked by tag.",
  );
}

type ResearchKind = "Insight" | "Pattern" | "Nugget" | "Conversation";

type ResearchItem = {
  id: string;
  kind: ResearchKind;
  title: string;
  detail: string;
  tags: string[];
  customer?: string;
  timestamp?: string;
};

type Conversation = {
  id: string;
  callId: string;
  customer: string;
  order: string;
  items: string[];
  itemCount: number;
  orderSequence: number;
  value: string;
  length: string;
  durationSeconds: number;
  timestamp: string;
  attribution: string;
  tags: string[];
};

const insights: ResearchItem[] = [
  {
    id: "shipping-threshold",
    kind: "Insight",
    title: "Test free shipping at a lower threshold",
    detail:
      "Six customers said shipping cost made them pause. Two added an item to qualify for free shipping, but the remaining friction suggests a lower threshold could improve checkout conversion enough to offset the AOV tradeoff.",
    tags: ["AOV", "Shipping costs", "Checkout conversion"],
  },
  {
    id: "category-expansion",
    kind: "Insight",
    title: "Target loyal Ridge Pant customers with an adjacent-category offer",
    detail:
      "Repeat purchasers often buy the Ridge Pant in another color without adding a new category. Eight love the pant but remain loyal to a competitor for outerwear—a precise audience for a product-specific offer.",
    tags: ["Repeat purchasers", "Competitor", "Product feedback"],
  },
  {
    id: "campaign-message",
    kind: "Insight",
    title: "Double down on the brand campaign about rugged use",
    detail:
      "John, James, and Jeff each described the Ridgeline campaign's rugged-use message as a reason Hollow Peak felt more credible than competitors. Only John's repeat purchase was attributed to Meta; James and Jeff returned through direct and Google, suggesting the campaign created demand beyond last-click credit.",
    tags: ["Brand", "Ad attribution", "Meta"],
  },
];

const insightActions: Record<
  string,
  { recommendation: string; conversationId: string }
> = {
  "shipping-threshold": {
    recommendation:
      "Run a controlled threshold test and measure checkout conversion with margin.",
    conversationId: "maya",
  },
  "category-expansion": {
    recommendation:
      "Send one category-specific offer to qualified repeat buyers.",
    conversationId: "kyle",
  },
  "campaign-message": {
    recommendation:
      "Test the rugged-use message independently of retargeting and branded search.",
    conversationId: "john",
  },
};

const patterns: ResearchItem[] = [
  {
    id: "meta-recall",
    kind: "Pattern",
    title: "Meta receives more credit than customers can explain",
    detail:
      "Fourteen customers were attributed to Meta; only four could recall a path from a Meta touchpoint to purchase.",
    tags: ["Ad attribution", "Meta"],
  },
  {
    id: "google-navigation",
    kind: "Pattern",
    title: "Most Google conversions begin with existing intent",
    detail:
      "Eleven customers were attributed to Google. Seven searched specifically for Hollow Peak and clicked the sponsored result.",
    tags: ["Ad attribution", "Google", "Brand"],
  },
  {
    id: "competitor-category",
    kind: "Pattern",
    title: "Adjacent-category loyalty is concentrated, not diffuse",
    detail:
      "Three customers independently named the same competitor as their preferred outerwear brand.",
    tags: ["Competitor", "Product feedback"],
  },
  {
    id: "promotion-wait",
    kind: "Pattern",
    title: "Promotions are teaching some customers to wait",
    detail:
      "Six customers said they delayed a repeat purchase until a promo code arrived.",
    tags: ["Promotions", "Repeat purchasers"],
  },
];

const nuggets: ResearchItem[] = [
  {
    id: "carl-referral",
    kind: "Nugget",
    customer: "Carl",
    timestamp: "06:42",
    title: "A quiet advocate with measurable reach",
    detail:
      "Carl has referred several friends and knows at least three who purchased.",
    tags: ["Referral", "Brand"],
  },
  {
    id: "kyle-pockets",
    kind: "Nugget",
    customer: "Kyle",
    timestamp: "08:16",
    title: "One pocket design blocks category expansion",
    detail:
      "Kyle dislikes the pockets on Hollow Peak jackets, so he will not branch out from pants.",
    tags: ["Product feedback", "Competitor"],
  },
  {
    id: "eric-switch",
    kind: "Nugget",
    customer: "Eric",
    timestamp: "04:51",
    title: "Competitor quality decline created the opening",
    detail:
      "Eric moved to Hollow Peak after deciding that a competitor's quality had deteriorated.",
    tags: ["Competitor", "Brand"],
  },
  {
    id: "patrick-wardrobe",
    kind: "Nugget",
    customer: "Patrick",
    timestamp: "10:04",
    title: "A life event reset an established consideration set",
    detail:
      "After losing weight, Patrick needed a new wardrobe and became willing to explore new brands.",
    tags: ["Sizing / fit", "Life event", "Brand"],
  },
];

const featuredConversations: Conversation[] = [
  {
    id: "john",
    callId: "e5c162eb-e708-7a2e-8650-db644b044f8a",
    customer: "John M.",
    order: "Ridge Pant · Charcoal",
    items: ["Ridge Pant · Charcoal", "Ridgeline Belt"],
    itemCount: 2,
    orderSequence: 2,
    value: "$184",
    length: "11:24",
    durationSeconds: 684,
    timestamp: "02:18",
    attribution: "Meta",
    tags: ["Brand", "Ad attribution", "Meta", "Product feedback"],
  },
  {
    id: "james",
    callId: "00000000-0000-7000-8000-000000000002",
    customer: "James R.",
    order: "Ridge Pant · Moss",
    items: ["Ridge Pant · Moss"],
    itemCount: 1,
    orderSequence: 2,
    value: "$164",
    length: "09:37",
    durationSeconds: 577,
    timestamp: "03:12",
    attribution: "Google",
    tags: ["Brand", "Ad attribution", "Google"],
  },
  {
    id: "jeff",
    callId: "00000000-0000-7000-8000-000000000003",
    customer: "Jeff L.",
    order: "Ridge Pant · Navy",
    items: ["Ridge Pant · Navy"],
    itemCount: 1,
    orderSequence: 3,
    value: "$148",
    length: "08:49",
    durationSeconds: 529,
    timestamp: "01:56",
    attribution: "Direct",
    tags: ["Brand", "Ad attribution", "Meta"],
  },
  {
    id: "maya",
    callId: "00000000-0000-7000-8000-000000000004",
    customer: "Maya C.",
    order: "Ridge Pant + base layer",
    items: ["Ridge Pant · Juniper", "Merino Base Layer"],
    itemCount: 2,
    orderSequence: 3,
    value: "$226",
    length: "10:18",
    durationSeconds: 618,
    timestamp: "05:08",
    attribution: "Email",
    tags: ["AOV", "Shipping costs", "Checkout conversion"],
  },
  {
    id: "carl",
    callId: "00000000-0000-7000-8000-000000000005",
    customer: "Carl D.",
    order: "Ridge Pant · Clay",
    items: ["Ridge Pant · Clay"],
    itemCount: 1,
    orderSequence: 4,
    value: "$148",
    length: "12:03",
    durationSeconds: 723,
    timestamp: "06:42",
    attribution: "Direct",
    tags: ["Referral", "Brand", "Repeat purchasers"],
  },
  {
    id: "kyle",
    callId: "00000000-0000-7000-8000-000000000006",
    customer: "Kyle S.",
    order: "Ridge Pant · Black",
    items: ["Ridge Pant · Black"],
    itemCount: 1,
    orderSequence: 5,
    value: "$148",
    length: "09:14",
    durationSeconds: 554,
    timestamp: "08:16",
    attribution: "Google",
    tags: ["Product feedback", "Competitor", "Repeat purchasers"],
  },
  {
    id: "eric",
    callId: "00000000-0000-7000-8000-000000000007",
    customer: "Eric T.",
    order: "Ridge Pant + trail shirt",
    items: ["Ridge Pant · Slate", "Ridgeline Trail Shirt"],
    itemCount: 2,
    orderSequence: 2,
    value: "$232",
    length: "07:52",
    durationSeconds: 472,
    timestamp: "04:51",
    attribution: "Organic search",
    tags: ["Competitor", "Brand", "Product feedback"],
  },
  {
    id: "patrick",
    callId: "00000000-0000-7000-8000-000000000008",
    customer: "Patrick W.",
    order: "Ridge Pant · Stone",
    items: ["Ridge Pant · Stone", "Ridgeline Belt", "Merino Base Layer"],
    itemCount: 3,
    orderSequence: 4,
    value: "$148",
    length: "13:19",
    durationSeconds: 799,
    timestamp: "10:04",
    attribution: "Referral",
    tags: ["Sizing / fit", "Life event", "Brand"],
  },
];

const generatedCustomers = [
  "Avery N.",
  "Morgan B.",
  "Riley H.",
  "Jordan P.",
  "Casey V.",
  "Taylor G.",
  "Cameron F.",
  "Drew A.",
  "Quinn K.",
  "Sam E.",
  "Reese J.",
  "Alex C.",
  "Jamie O.",
  "Skyler M.",
  "Rowan I.",
  "Parker Z.",
  "Bailey Q.",
  "Emerson U.",
  "Hayden X.",
  "Finley Y.",
  "Dakota R.",
  "Charlie L.",
  "Robin S.",
  "Micah T.",
  "Sage W.",
  "Blake D.",
  "Kendall M.",
  "Corey P.",
  "Shawn G.",
  "Jules F.",
  "Lane A.",
  "Noel K.",
  "Remy E.",
  "Marley J.",
  "Ellis C.",
  "River O.",
  "Arden I.",
  "Kai Z.",
  "Sydney Q.",
  "Devon U.",
  "Tatum X.",
  "Frankie Y.",
] as const;

const productSets = [
  ["Ridge Pant · Charcoal"],
  ["Ridge Pant · Moss", "Ridgeline Belt"],
  ["Merino Base Layer", "Ridgeline Trail Shirt"],
  ["Ridge Pant · Navy", "Alpine Shell"],
  ["Ridge Pant · Clay", "Merino Base Layer", "Trail Cap"],
] as const;

const generatedTagSets = [
  ["Brand", "Ad attribution", "Meta"],
  ["Repeat purchasers", "Product feedback"],
  ["Shipping costs", "Checkout conversion", "AOV"],
  ["Competitor", "Product feedback", "Brand"],
  ["Promotions", "Repeat purchasers"],
  ["Google", "Ad attribution", "Brand"],
  ["Referral", "Brand"],
] as const;

function durationLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const generatedConversations: Conversation[] = generatedCustomers.map(
  (customer, index) => {
    const items = [...productSets[index % productSets.length]!];
    const durationSeconds = 390 + ((index * 73) % 690);
    const tags = [
      ...generatedTagSets[index % generatedTagSets.length]!,
      ...(index % 5 === 0 ? ["Life event"] : []),
      ...(index % 6 === 0 ? ["Sizing / fit"] : []),
    ];
    return {
      id: `sample-${index + 9}`,
      callId: `00000000-0000-7000-8000-${String(index + 9).padStart(12, "0")}`,
      customer,
      order: items.join(" + "),
      items,
      itemCount: items.length,
      orderSequence: 2 + ((index * 3) % 6),
      value: `$${132 + ((index * 29) % 241)}`,
      length: durationLabel(durationSeconds),
      durationSeconds,
      timestamp: durationLabel(Math.round(durationSeconds * 0.42)),
      attribution: ["Meta", "Google", "Direct", "Email", "Referral"][
        index % 5
      ]!,
      tags: [...new Set(tags)],
    };
  },
);

const conversations = [...featuredConversations, ...generatedConversations];

const tagCounts = conversations.reduce<Record<string, number>>(
  (counts, conversation) => {
    for (const tag of conversation.tags) counts[tag] = (counts[tag] ?? 0) + 1;
    return counts;
  },
  {},
);

const sortedConversationTags = Object.entries(tagCounts).sort(
  ([tagA, countA], [tagB, countB]) =>
    countB - countA || tagA.localeCompare(tagB),
);

const plotRings = [
  { count: 1, distance: 0, rotation: 0 },
  { count: 6, distance: 48, rotation: 0.08 },
  { count: 12, distance: 99, rotation: 0.02 },
  { count: 16, distance: 154, rotation: 0.06 },
  { count: 15, distance: 211, rotation: 0.01 },
] as const;

const conversationPlotPoints = plotRings.flatMap((ring, ringIndex) => {
  const startIndex = plotRings
    .slice(0, ringIndex)
    .reduce((sum, current) => sum + current.count, 0);
  return Array.from({ length: ring.count }, (_, pointIndex) => {
    const conversation = conversations[startIndex + pointIndex]!;
    const angle =
      ring.count === 1
        ? 0
        : (pointIndex / ring.count + ring.rotation) * Math.PI * 2;
    const radius = 11 + ((conversation.durationSeconds - 390) / 690) * 9;
    return {
      conversation,
      radius,
      x: 250 + Math.cos(angle) * ring.distance,
      y: 250 + Math.sin(angle) * ring.distance,
    };
  });
});

function TagButton({
  tag,
  onSelect,
  compact = false,
}: {
  tag: string;
  onSelect: (tag: string) => void;
  compact?: boolean;
}) {
  return (
    <button
      className={`research-tag${compact ? " research-tag--compact" : ""}`}
      type="button"
      onClick={() => onSelect(tag)}
      aria-label={`View all research tagged ${tag}`}
    >
      <span aria-hidden="true">#</span>
      {tag}
    </button>
  );
}

function SectionHeading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="research-section-heading">
      <p className="preview-kicker">{kicker}</p>
      <div>
        <h2>{title}</h2>
        <p>{children}</p>
      </div>
    </header>
  );
}

function ConversationCluster() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activePoint = conversationPlotPoints.find(
    (point) => point.conversation.id === (hoveredId ?? selectedId),
  );
  const tooltipStyle = activePoint
    ? ({
        "--bubble-left": `${(activePoint.x / 500) * 100}%`,
        "--bubble-top": `${(activePoint.y / 500) * 100}%`,
      } as CSSProperties)
    : undefined;

  useEffect(() => {
    if (!selectedId) return;

    const clearSelection = (event: PointerEvent) => {
      if (
        !(event.target as Element).closest(
          ".conversation-cluster__point, .conversation-cluster__tooltip",
        )
      ) {
        setSelectedId(null);
      }
    };

    document.addEventListener("pointerdown", clearSelection);
    return () => document.removeEventListener("pointerdown", clearSelection);
  }, [selectedId]);

  const selectConversation = (conversationId: string) => {
    setSelectedId(conversationId);
    setHoveredId(null);
  };

  return (
    <div className="conversation-cluster">
      <svg
        viewBox="0 0 500 500"
        role="img"
        aria-label="Fifty conversations arranged as one circular cluster. Bubble size represents recording length."
      >
        <circle
          className="conversation-cluster__boundary"
          cx="250"
          cy="250"
          r="236"
        />
        {conversationPlotPoints.map(({ conversation, radius, x, y }, index) => (
          <g
            className="conversation-cluster__point"
            data-featured={
              index < featuredConversations.length ? "" : undefined
            }
            key={conversation.id}
            role="button"
            tabIndex={0}
            data-selected={selectedId === conversation.id ? "" : undefined}
            data-active={
              activePoint?.conversation.id === conversation.id ? "" : undefined
            }
            aria-pressed={selectedId === conversation.id}
            aria-label={`${conversation.customer}, ${conversation.length} recording, ${conversation.tags.length} tags, ${conversation.itemCount} items, ${conversation.value}, order ${conversation.orderSequence}`}
            onClick={() => selectConversation(conversation.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectConversation(conversation.id);
              }
            }}
            onFocus={() => {
              if (selectedId !== conversation.id) setHoveredId(conversation.id);
            }}
            onBlur={() => setHoveredId(null)}
            onMouseEnter={() => {
              if (selectedId !== conversation.id) setHoveredId(conversation.id);
            }}
            onMouseLeave={() => setHoveredId(null)}
          >
            <circle cx={x} cy={y} r={radius} />
          </g>
        ))}
      </svg>
      <div className="conversation-cluster__legend">
        <span>
          <i className="is-short" /> Shorter recording
        </span>
        <span>
          <i className="is-long" /> Longer recording
        </span>
      </div>
      {activePoint ? (
        <div
          className="conversation-cluster__tooltip"
          data-placement={activePoint.y < 150 ? "below" : "above"}
          role="tooltip"
          style={tooltipStyle}
        >
          <a
            href={`#conversation-${activePoint.conversation.id}`}
            aria-label={`View ${activePoint.conversation.customer} in the conversation index`}
          >
            <strong>{activePoint.conversation.customer}</strong>
            <span aria-hidden="true">↗</span>
          </a>
          <span>{activePoint.conversation.length} recording</span>
          <dl>
            <div className="conversation-cluster__tooltip-tags">
              <dt>Tags</dt>
              <dd>
                {activePoint.conversation.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </dd>
            </div>
            <div>
              <dt>Items</dt>
              <dd>{activePoint.conversation.itemCount}</dd>
            </div>
            <div>
              <dt>Order value</dt>
              <dd>{activePoint.conversation.value}</dd>
            </div>
            <div>
              <dt>Order</dt>
              <dd>#{activePoint.conversation.orderSequence}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

export default function ShopifySampleReport() {
  const [activeSection, setActiveSection] = useState("overview");
  const [conversationFilter, setConversationFilter] = useState<string | null>(
    null,
  );

  useEffect(() => {
    const sectionIds = [
      "overview",
      "insights",
      "patterns",
      "nuggets",
      "conversations",
    ];
    let animationFrame = 0;

    const updateActiveSection = () => {
      const readingLine = window.scrollY + 180;
      let current = sectionIds[0]!;

      for (const sectionId of sectionIds) {
        const section = document.getElementById(sectionId);
        if (!section) continue;
        const sectionTop = section.getBoundingClientRect().top + window.scrollY;
        if (sectionTop <= readingLine) current = sectionId;
      }

      setActiveSection(current);
    };

    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updateActiveSection);
    };

    updateActiveSection();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  const visibleConversations = useMemo(
    () =>
      conversationFilter
        ? conversations.filter((conversation) =>
            conversation.tags.includes(conversationFilter),
          )
        : conversations,
    [conversationFilter],
  );

  const filterConversations = (tag: string) => {
    setConversationFilter((current) => (current === tag ? null : tag));
    window.setTimeout(() => {
      document
        .getElementById("conversations")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <SitePage>
      <div className="holler-preview research-workspace-page">
        <article className="research-workspace">
          <nav className="research-workspace__nav" aria-label="Report sections">
            <div>
              <span>Hollow Peak</span>
              <small>Synthetic workspace</small>
            </div>
            <ul>
              <li>
                <a
                  className={
                    activeSection === "overview" ? "is-active" : undefined
                  }
                  href="#overview"
                  aria-current={
                    activeSection === "overview" ? "location" : undefined
                  }
                >
                  Overview
                </a>
              </li>
              <li>
                <a
                  className={
                    activeSection === "insights" ? "is-active" : undefined
                  }
                  href="#insights"
                  aria-current={
                    activeSection === "insights" ? "location" : undefined
                  }
                >
                  Insights
                </a>
              </li>
              <li>
                <a
                  className={
                    activeSection === "patterns" ? "is-active" : undefined
                  }
                  href="#patterns"
                  aria-current={
                    activeSection === "patterns" ? "location" : undefined
                  }
                >
                  Patterns
                </a>
              </li>
              <li>
                <a
                  className={
                    activeSection === "nuggets" ? "is-active" : undefined
                  }
                  href="#nuggets"
                  aria-current={
                    activeSection === "nuggets" ? "location" : undefined
                  }
                >
                  Customer nuggets
                </a>
              </li>
              <li>
                <a
                  className={
                    activeSection === "conversations" ? "is-active" : undefined
                  }
                  href="#conversations"
                  aria-current={
                    activeSection === "conversations" ? "location" : undefined
                  }
                >
                  Conversations
                </a>
              </li>
            </ul>
            <a
              className="research-workspace__tags-link"
              href="#conversation-tags"
            >
              Browse tags <span aria-hidden="true">↘</span>
            </a>
          </nav>

          <main className="research-workspace__main">
            <header className="research-hero" id="overview">
              <div className="research-hero__meta">
                <p className="preview-kicker">Holler research workspace</p>
                <span>August–October · Run 01</span>
              </div>
              <div className="research-hero__title">
                <div>
                  <p className="research-hero__brand">Hollow Peak</p>
                  <h1>What is shaping repeat purchase?</h1>
                </div>
                <p className="research-hero__disclaimer">
                  <strong>Illustrative sample</strong>
                  Every order, customer statement, and product below is
                  fictional. The interaction model is production-oriented.
                </p>
              </div>
            </header>

            <section
              className="research-conversation-overview"
              aria-label="Research at a glance"
            >
              <div className="research-conversation-overview__metrics">
                <div>
                  <small>01</small>
                  <strong>50</strong>
                  <span>completed repeat-buyer conversations</span>
                </div>
                <div>
                  <small>02</small>
                  <strong>4h 48m</strong>
                  <span>consented recorded research</span>
                </div>
                <div>
                  <small>03</small>
                  <strong>362</strong>
                  <span>accepted tag applications</span>
                </div>
                <div>
                  <small>04</small>
                  <strong>10k</strong>
                  <span>orders in the comparison set</span>
                </div>
              </div>
              <div className="research-conversation-overview__body">
                <div className="research-conversation-overview__copy">
                  <h2>The Core</h2>
                  <p>Click to see the raw data that powers the report</p>
                  <a
                    className="research-dashboard-link"
                    href="#brand-dashboard"
                    aria-disabled="true"
                    onClick={(event) => event.preventDefault()}
                  >
                    Open brand dashboard <span aria-hidden="true">↗</span>
                  </a>
                </div>
                <ConversationCluster />
              </div>
            </section>

            <section className="research-insights" id="insights">
              <header className="research-insights__heading">
                <h2>Actionable Insights</h2>
              </header>
              <ol className="research-insight-list">
                {insights.map((insight, index) => (
                  <li key={insight.id} id={insight.id}>
                    <span className="research-insight-list__number">
                      0{index + 1}
                    </span>
                    <div className="research-insight-list__content">
                      <h3>{insight.title}</h3>
                      {insight.id === "campaign-message" ? (
                        <p>
                          <a
                            className="research-person-link"
                            href="#conversation-john"
                          >
                            John
                          </a>
                          ,{" "}
                          <a
                            className="research-person-link"
                            href="#conversation-james"
                          >
                            James
                          </a>
                          , and{" "}
                          <a
                            className="research-person-link"
                            href="#conversation-jeff"
                          >
                            Jeff
                          </a>{" "}
                          each described the Ridgeline campaign's rugged-use
                          message as a reason Hollow Peak felt more credible
                          than competitors. Only John's repeat purchase was
                          attributed to Meta; James and Jeff returned through
                          direct and Google, suggesting the campaign created
                          demand beyond last-click credit.
                        </p>
                      ) : (
                        <p>{insight.detail}</p>
                      )}
                      <div className="research-tag-row">
                        {insight.tags.map((tag) => (
                          <TagButton
                            key={tag}
                            tag={tag}
                            onSelect={filterConversations}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="research-insight-list__action">
                      <span>Recommended next step</span>
                      <p>{insightActions[insight.id]!.recommendation}</p>
                      <a
                        href={`#conversation-${insightActions[insight.id]!.conversationId}`}
                      >
                        Open supporting evidence →
                      </a>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="research-patterns" id="patterns">
              <SectionHeading
                kicker="Interesting patterns"
                title="Signals worth monitoring"
              >
                These patterns are directional. They become stronger or weaker
                as more conversations receive the same accepted tags.
              </SectionHeading>
              <div className="research-pattern-grid">
                {patterns.map((pattern, index) => (
                  <article key={pattern.id} id={pattern.id}>
                    <span>0{index + 1}</span>
                    <h3>{pattern.title}</h3>
                    <p>{pattern.detail}</p>
                    <div className="research-tag-row">
                      {pattern.tags.map((tag) => (
                        <TagButton
                          compact
                          key={tag}
                          tag={tag}
                          onSelect={filterConversations}
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="research-nuggets" id="nuggets">
              <SectionHeading
                kicker="Customer nuggets"
                title="Small moments with strategic value"
              >
                Individual observations remain identifiable as anecdotes until
                other evidence accumulates under the same tag.
              </SectionHeading>
              <div className="research-nugget-grid">
                {nuggets.map((nugget) => (
                  <article key={nugget.id} id={nugget.id}>
                    <div className="research-nugget-grid__meta">
                      <span>{nugget.customer}</span>
                      <a
                        href={`#conversation-${nugget.customer?.toLowerCase()}`}
                      >
                        {nugget.timestamp} ↗
                      </a>
                    </div>
                    <h3>{nugget.title}</h3>
                    <p>{nugget.detail}</p>
                    <div className="research-tag-row">
                      {nugget.tags.map((tag) => (
                        <TagButton
                          compact
                          key={tag}
                          tag={tag}
                          onSelect={filterConversations}
                        />
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="research-conversations" id="conversations">
              <header className="research-conversations__heading">
                <p className="preview-kicker">Research library</p>
                <h2>Conversation index</h2>
              </header>
              <div className="research-conversations__toolbar">
                <div>
                  <strong>{visibleConversations.length}</strong>
                  <span>
                    {conversationFilter
                      ? ` conversations tagged ${conversationFilter}`
                      : " conversations in this sample"}
                  </span>
                </div>
                <div className="research-tag-explorer" id="conversation-tags">
                  <span>Filter by tag</span>
                  <div>
                    <button
                      className={
                        conversationFilter === null ? "is-active" : undefined
                      }
                      type="button"
                      onClick={() => setConversationFilter(null)}
                    >
                      All <small>{conversations.length}</small>
                    </button>
                    {sortedConversationTags.map(([tag, count]) => (
                      <button
                        className={
                          conversationFilter === tag ? "is-active" : undefined
                        }
                        key={tag}
                        type="button"
                        onClick={() => filterConversations(tag)}
                      >
                        {tag} <small>{count}</small>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="research-conversation-list">
                {visibleConversations.map((conversation) => (
                  <details
                    key={conversation.id}
                    id={`conversation-${conversation.id}`}
                  >
                    <summary>
                      <div className="research-conversation-list__customer">
                        <span>{conversation.customer.slice(0, 1)}</span>
                        <a
                          href={`https://app.withholler.com/calls/${conversation.callId}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {conversation.customer}{" "}
                          <span aria-hidden="true">↗</span>
                        </a>
                      </div>
                      <span>
                        {conversation.itemCount} item
                        {conversation.itemCount === 1 ? "" : "s"}
                      </span>
                      <strong>{conversation.value}</strong>
                      <span>{conversation.length}</span>
                      <div className="research-conversation-list__tags">
                        {conversation.tags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>
                      <span
                        className="research-conversation-list__chevron"
                        aria-hidden="true"
                      >
                        ⌄
                      </span>
                    </summary>
                    <div className="research-conversation-list__details">
                      <dl>
                        <div>
                          <dt>Order</dt>
                          <dd>{conversation.order}</dd>
                        </div>
                        <div>
                          <dt>Purchase sequence</dt>
                          <dd>Order #{conversation.orderSequence}</dd>
                        </div>
                        <div>
                          <dt>Attributed channel</dt>
                          <dd>{conversation.attribution}</dd>
                        </div>
                        <div>
                          <dt>Items purchased</dt>
                          <dd>{conversation.items.join(", ")}</dd>
                        </div>
                      </dl>
                      <a
                        href={`https://app.withholler.com/calls/${conversation.callId}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open conversation <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </details>
                ))}
              </div>
            </section>

            <section className="research-method">
              <p className="preview-kicker">Read the evidence carefully</p>
              <div>
                <h2>Method and limitations</h2>
                <p>
                  This synthetic workspace represents 50 fictional repeat-buyer
                  conversations and 10,000 fictional orders across three months.
                  Tags represent accepted applications, not causal proof. Counts
                  always show their population, and every qualitative claim can
                  be followed to the supporting transcript moment.
                </p>
              </div>
            </section>
          </main>
        </article>
      </div>
    </SitePage>
  );
}
