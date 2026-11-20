import { pillars, type Moment } from "./marketing-industries";

/* Shared blocks for the Who It's For pages. */

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function MomentCard({
  moment,
  index,
}: {
  moment: Moment;
  index: number;
}) {
  return (
    <article className="site-study" id={slugify(moment.name)}>
      <header className="site-study__head">
        <div>
          <span className="site-number">
            {String(index + 1).padStart(2, "0")}
          </span>
          <div>
            <h3>{moment.name}</h3>
            <p className="site-study__signal">{moment.signal}</p>
          </div>
        </div>
        <p className="site-study__trigger">
          <span>Call</span> {moment.trigger.toLowerCase()}
        </p>
      </header>
      <div className="site-study__steps">
        <section>
          <p className="site-kicker">
            <span className="site-number">01</span> Analysis
          </p>
          <ul className="site-list">
            {moment.look.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
        <section>
          <p className="site-kicker">
            <span className="site-number">02</span> Qualification
          </p>
          <p>{moment.qualify}</p>
        </section>
        <section>
          <p className="site-kicker">
            <span className="site-number">03</span> Research
          </p>
          <ul className="site-study__questions">
            {moment.ask.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </section>
      </div>
      <footer className="site-study__moves">
        <span className="site-kicker">Moves</span>
        <ul>
          {moment.moves.map((metric) => (
            <li key={metric}>{metric}</li>
          ))}
        </ul>
      </footer>
    </article>
  );
}

export function PillarGrid() {
  return (
    <ol className="site-pillars">
      {pillars.map((pillar) => (
        <li key={pillar.number}>
          <p className="site-kicker">
            <span className="site-number">{pillar.number}</span> {pillar.label}
          </p>
          <h3>{pillar.title}</h3>
          <p>{pillar.copy}</p>
        </li>
      ))}
    </ol>
  );
}
