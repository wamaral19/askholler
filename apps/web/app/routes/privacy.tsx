export function meta() {
  return [
    { title: "Privacy Policy — Holler" },
    {
      name: "description",
      content:
        "How Holler collects, uses, and protects personal information, including during customer research calls.",
    },
  ];
}

const lastUpdated = "September 29, 2026";
const privacyEmail = "wyatt@withholler.com";
const privacyHref = `mailto:${privacyEmail}`;

export default function Privacy() {
  return (
    <main className="simple-landing privacy-page" id="top">
      <header className="simple-header is-scrolled">
        <div className="simple-header-inner">
          <a className="simple-brand" href="/" aria-label="Holler home">
            <img src="/brand/holler-wordmark-primary.png" alt="Holler" />
          </a>
          <a className="simple-header-cta" href="/">
            Home
          </a>
        </div>
      </header>

      <article className="privacy-policy">
        <p className="simple-eyebrow">Last updated {lastUpdated}</p>
        <h1>Privacy Policy</h1>

        <p>
          Tour Pro Shop LLC, doing business as Holler (“Holler,” “we,” “us”),
          provides customer research services to ecommerce brands (“brands”). As
          part of those services, we may contact a brand’s customers to learn
          about their experience. This policy explains how we collect, use,
          share, and protect personal information when you visit our website,
          use our services, or take part in a research conversation with us.
        </p>
        <p>
          When we handle information about a brand’s customers, we generally do
          so on behalf of that brand and under its instructions. The brand’s own
          privacy policy describes how the brand itself handles your
          information.
        </p>

        <section aria-labelledby="called">
          <h2 id="called">If we contacted you</h2>
          <p>
            You likely heard from us because you bought from a brand that works
            with Holler. The brand asked us to learn how customers find it and
            why they buy. Research conversations are not sales calls.
          </p>
          <ul>
            <li>
              <strong>Where we got your details.</strong> The brand shared
              information from your order, such as your first name, phone
              number, and what you bought.
            </li>
            <li>
              <strong>Recording.</strong> We ask for your permission before
              recording. If you say no, we don’t record, and you can ask us to
              stop recording at any time.
            </li>
            <li>
              <strong>Not interested?</strong> Tell the researcher or email us
              at <a href={privacyHref}>{privacyEmail}</a>, and we will stop
              contacting you for research on behalf of that brand.
            </li>
          </ul>
        </section>

        <section aria-labelledby="collect">
          <h2 id="collect">Information we collect</h2>
          <h3>From brands we work with</h3>
          <p>
            Brands may share information about their customers with us,
            including:
          </p>
          <ul>
            <li>contact details, such as name and phone number;</li>
            <li>
              order and purchase history, such as products, quantities, prices,
              order dates, and order status;
            </li>
            <li>
              marketing and referral information, such as the ad, campaign, or
              website that led to a purchase;
            </li>
            <li>customer account identifiers and related details; and</li>
            <li>other information a brand chooses to share with us.</li>
          </ul>

          <h3>From you, during research</h3>
          <ul>
            <li>your answers, opinions, and other things you tell us;</li>
            <li>audio recordings of conversations, with your permission;</li>
            <li>
              notes, transcripts, and summaries of conversations we prepare; and
            </li>
            <li>
              call details, such as date, time, duration, and your recording and
              contact preferences.
            </li>
          </ul>

          <h3>From business customers and contacts</h3>
          <p>
            Names, work email addresses, phone numbers, company details, account
            and billing information, and the information you give us when you
            contact us or use our services.
          </p>

          <h3>Automatically, when you use our website or services</h3>
          <p>
            Device and usage information, such as IP address, browser type,
            pages viewed, and referring URLs. We and our service providers may
            use cookies and similar technologies to operate, secure, and
            understand use of our website and services.
          </p>
        </section>

        <section aria-labelledby="use">
          <h2 id="use">How we use information</h2>
          <ul>
            <li>
              to provide our services, including selecting customers to invite
              to research based on criteria set by a brand;
            </li>
            <li>
              to contact you about research by phone or, where permitted by law,
              other channels;
            </li>
            <li>
              to conduct, record (with permission), transcribe, and analyze
              research conversations, which may include using automated and
              AI-based tools;
            </li>
            <li>to prepare research findings and reports for brands;</li>
            <li>to honor your contact preferences and privacy requests;</li>
            <li>
              to operate, secure, maintain, improve, and develop our services;
            </li>
            <li>
              to create de-identified or aggregated information, which we may
              use for any lawful purpose;
            </li>
            <li>
              to comply with law, enforce our agreements, and protect the
              rights, safety, and property of Holler, our customers, and others;
              and
            </li>
            <li>for other purposes we describe when we collect information.</li>
          </ul>
        </section>

        <section aria-labelledby="share">
          <h2 id="share">How we share information</h2>
          <ul>
            <li>
              <strong>With the brand.</strong> We share research results with
              the brand you bought from. Results may include your responses,
              quotes, and, if you agreed to be recorded, recordings.
            </li>
            <li>
              <strong>With service providers.</strong> We work with companies
              that provide services to us, such as hosting, cloud storage,
              telecommunications, encryption, transcription, analytics, and
              customer support. They may use personal information only to
              provide those services.
            </li>
            <li>
              <strong>With professional advisors,</strong> such as lawyers,
              auditors, and insurers.
            </li>
            <li>
              <strong>For legal reasons,</strong> when we believe it is required
              by law or legal process, or needed to protect rights, safety, or
              property.
            </li>
            <li>
              <strong>In a business transaction,</strong> such as a merger,
              acquisition, financing, or sale of assets.
            </li>
            <li>
              <strong>With your consent</strong> or at your direction.
            </li>
          </ul>
          <p>
            We do not sell personal information, and we do not share it for
            cross-context behavioral advertising.
          </p>
        </section>

        <section aria-labelledby="retention">
          <h2 id="retention">How long we keep information</h2>
          <p>
            We keep personal information only as long as needed for the purposes
            described in this policy. How long depends on the type of
            information, the brand’s instructions and our agreement with it,
            whether you asked us to delete it, and our legal obligations. We
            keep contact details and call recordings for a limited time, and
            delete or de-identify research data when we no longer need it.
          </p>
        </section>

        <section aria-labelledby="choices">
          <h2 id="choices">Your choices</h2>
          <ul>
            <li>
              <strong>Research contact.</strong> You can decline any research
              conversation, end it at any time, or ask us not to contact you
              again.
            </li>
            <li>
              <strong>Recording.</strong> You can say no to recording and still
              take part.
            </li>
            <li>
              <strong>Cookies.</strong> Most browsers let you block or delete
              cookies. Some parts of our website may not work without them.
            </li>
          </ul>
        </section>

        <section aria-labelledby="rights">
          <h2 id="rights">Your privacy rights</h2>
          <p>
            Depending on where you live, you may have the right to request
            access to, a copy of, correction of, or deletion of your personal
            information; to opt out of certain processing; and to appeal our
            decision about your request. We will not discriminate against you
            for exercising these rights.
          </p>
          <p>
            To make a request, email <a href={privacyHref}>{privacyEmail}</a>.
            We will verify your request before acting on it, and you may use an
            authorized agent. If we hold your information on behalf of a brand,
            we may refer your request to that brand or act on its instructions.
            You can also contact the brand directly; when a brand tells us you
            asked to delete your data, we delete it from our systems too.
          </p>
        </section>

        <section aria-labelledby="security">
          <h2 id="security">Security</h2>
          <p>
            We use administrative, technical, and physical safeguards designed
            to protect personal information, including encryption and access
            controls. No method of transmission or storage is completely secure,
            and we cannot guarantee absolute security.
          </p>
        </section>

        <section aria-labelledby="children">
          <h2 id="children">Children</h2>
          <p>
            Our services are not directed to children under 13, and we do not
            knowingly collect their personal information. If you believe we
            have, contact us and we will delete it.
          </p>
        </section>

        <section aria-labelledby="international">
          <h2 id="international">Where we process information</h2>
          <p>
            Holler is based in the United States. We and our service providers
            may process personal information in the United States and other
            countries, which may have different data protection laws than where
            you live.
          </p>
        </section>

        <section aria-labelledby="changes">
          <h2 id="changes">Changes to this policy</h2>
          <p>
            We may update this policy from time to time. We will post the
            updated policy here and change the “Last updated” date. If we make
            material changes, we will provide additional notice as required by
            law.
          </p>
        </section>

        <section aria-labelledby="contact">
          <h2 id="contact">Contact us</h2>
          <p>
            Questions or requests about privacy? Email{" "}
            <a href={privacyHref}>{privacyEmail}</a>.
          </p>
        </section>
      </article>

      <footer className="simple-footer">
        <span>© {new Date().getFullYear()} Holler</span>
        <a href="#top">Back to top ↑</a>
      </footer>
    </main>
  );
}
