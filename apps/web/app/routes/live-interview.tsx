import { useState } from "react";
import { Form, Link, useActionData, useLoaderData } from "react-router";

import { AppShell, PrototypeBanner } from "../components/app-shell";
import {
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";

const observationOptions = [
  ["hesitation", "Hesitation"],
  ["excitement", "Notable excitement"],
  ["reluctance", "Reluctance"],
  ["confusion", "Confusion"],
  ["strong_conviction", "Strong conviction"],
  ["follow_up_needed", "Follow-up needed"],
] as const;

export async function loader({
  request,
  params,
}: {
  request: Request;
  params: { interviewId?: string };
}) {
  if (!params.interviewId)
    throw new Response("Interview is required", { status: 400 });
  return getOperationsService().getInterview(
    getTenantContext(request),
    params.interviewId,
  );
}

export async function action({
  request,
  params,
}: {
  request: Request;
  params: { interviewId?: string };
}) {
  if (!params.interviewId)
    throw new Response("Interview is required", { status: 400 });
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");
  const service = getOperationsService();
  const context = getTenantContext(request);
  if (intent === "reveal") {
    const result = await service.revealPhone(context, params.interviewId);
    return Response.json(
      { intent, phone: result.phone },
      { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } },
    );
  }
  if (intent === "response") {
    await service.saveResponse(
      context,
      params.interviewId,
      String(form.get("fieldId")),
      String(form.get("value")),
    );
    return { intent, saved: true };
  }
  if (intent === "observation") {
    await service.addObservation(
      context,
      params.interviewId,
      String(form.get("kind")),
      String(form.get("detail")),
    );
    return { intent, saved: true };
  }
  if (intent === "complete" || intent === "no_answer") {
    await service.completeInterview(
      context,
      params.interviewId,
      intent === "complete" ? "completed" : "no_answer",
    );
    return { intent, saved: true };
  }
  throw new Response("Unsupported action", { status: 400 });
}

export function meta() {
  return [{ title: "Live Interview · Holler" }];
}

export default function LiveInterviewRoute() {
  const {
    assignment,
    script,
    fields,
    scriptName,
    scriptVersion,
    fieldSetVersion,
    status,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [activePrompt, setActivePrompt] = useState(0);
  const [observations, setObservations] = useState<Set<string>>(
    () => new Set(),
  );
  const [observationNote, setObservationNote] = useState("");

  if (!assignment) return null;

  function toggleObservation(id: string) {
    setObservations((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <AppShell
      eyebrow="Manual interview · in progress"
      title={assignment.customerName}
      description={`${assignment.merchant} · ${assignment.moment}`}
      actions={
        <Link className="button button-quiet" to="/queue">
          Return to queue
        </Link>
      }
    >
      <PrototypeBanner>
        Manual dial only. Responses and observations are submitted through the
        application service.
      </PrototypeBanner>

      {status === "completed" || actionData?.intent === "complete" ? (
        <section className="completion-panel">
          <span className="completion-mark">Done</span>
          <div>
            <p className="eyebrow">Synthetic interview completed</p>
            <h2>Ready for transcript and evidence review</h2>
            <p>
              This prototype did not persist responses or contact a
              transcription provider.
            </p>
          </div>
          <Link className="button button-primary" to="/queue">
            Return to queue
          </Link>
        </section>
      ) : (
        <div className="interview-layout">
          <aside className="interview-context panel">
            <div className="live-call-label">
              <span className="pulse-dot" />
              Manual call in progress
            </div>
            <dl>
              <div>
                <dt>Event age</dt>
                <dd>{assignment.eventAgeMinutes} minutes</dd>
              </div>
              <div>
                <dt>Order</dt>
                <dd>
                  #{assignment.orderSequence} · {assignment.orderTotal}
                </dd>
              </div>
              <div>
                <dt>Products</dt>
                <dd>{assignment.products.join(", ")}</dd>
              </div>
              <div>
                <dt>Observed attribution</dt>
                <dd>{assignment.observedAttribution}</dd>
              </div>
            </dl>
            <div className="privacy-callout">
              <span>Manual dial</span>
              <strong>
                {actionData && "phone" in actionData
                  ? String(actionData.phone)
                  : assignment.maskedPhone}
              </strong>
              <Form method="post">
                <button
                  className="text-button"
                  name="intent"
                  type="submit"
                  value="reveal"
                >
                  Reveal for manual dial
                </button>
              </Form>
              <small>
                Claim-gated · explicit reveal is audited by the service
              </small>
            </div>
          </aside>

          <div className="interview-main">
            <section className="panel script-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Pinned script · immutable</p>
                  <h2>
                    {scriptName} v{scriptVersion}
                  </h2>
                </div>
                <span className="registry-label">
                  {activePrompt + 1} of {script.length}
                </span>
              </div>
              <div className="script-progress" aria-hidden="true">
                <span
                  style={{
                    width: `${((activePrompt + 1) / script.length) * 100}%`,
                  }}
                />
              </div>
              <div className="script-question">
                <span>{script[activePrompt]?.title}</span>
                <blockquote>{script[activePrompt]?.prompt}</blockquote>
              </div>
              <label>
                <span>Live response note</span>
                <textarea
                  key={script[activePrompt]?.id}
                  placeholder="Capture a concise note; transcript evidence is linked after the call."
                  rows={4}
                />
              </label>
              <div className="script-navigation">
                <button
                  className="button button-quiet"
                  disabled={activePrompt === 0}
                  onClick={() => setActivePrompt((current) => current - 1)}
                  type="button"
                >
                  Previous
                </button>
                <button
                  className="button button-primary"
                  disabled={activePrompt === script.length - 1}
                  onClick={() => setActivePrompt((current) => current + 1)}
                  type="button"
                >
                  Next question
                </button>
              </div>
            </section>

            <section className="panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Structured capture</p>
                  <h2>Research fields</h2>
                </div>
                <span className="registry-label">
                  Pinned field set v{fieldSetVersion}
                </span>
              </div>
              <div className="research-field-list">
                {fields.map((field) => (
                  <Form className="research-field" key={field.id} method="post">
                    <input name="intent" type="hidden" value="response" />
                    <input name="fieldId" type="hidden" value={field.id} />
                    <span>
                      <strong>{field.label}</strong>
                      <small>
                        {field.source.replaceAll("_", " ")}
                        {field.required ? " · required" : " · optional"}
                      </small>
                    </span>
                    {field.valueType === "single_select" ? (
                      <select defaultValue="" name="value">
                        <option disabled value="">
                          Select a response
                        </option>
                        {field.options?.map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : field.valueType === "rating_scale" ? (
                      <select defaultValue="" name="value">
                        <option disabled value="">
                          Select 1–5
                        </option>
                        {[1, 2, 3, 4, 5].map((rating) => (
                          <option key={rating} value={rating}>
                            {rating}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        name="value"
                        placeholder={field.prompt}
                        rows={2}
                      />
                    )}
                    <button className="text-button" type="submit">
                      Save response
                    </button>
                  </Form>
                ))}
              </div>
            </section>
          </div>

          <aside className="observation-panel panel">
            <p className="eyebrow">Researcher-only context</p>
            <h2>Live observations</h2>
            <p className="helper-copy">
              Capture signals the transcript cannot: hesitation, excitement, or
              unwillingness to discuss a topic.
            </p>
            <div className="observation-chips">
              {observationOptions.map(([id, label]) => (
                <button
                  aria-pressed={observations.has(id)}
                  className={observations.has(id) ? "selected" : ""}
                  key={id}
                  onClick={() => toggleObservation(id)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
            <label>
              <span>Observation detail</span>
              <textarea
                onChange={(event) => setObservationNote(event.target.value)}
                placeholder="What did you hear or notice?"
                rows={5}
                value={observationNote}
              />
            </label>
            <label>
              <span>General researcher notes</span>
              <textarea
                placeholder="Context, follow-ups, or script feedback"
                rows={5}
              />
            </label>
            <Form method="post">
              <input name="detail" type="hidden" value={observationNote} />
              <input
                name="kind"
                type="hidden"
                value={[...observations].join(",")}
              />
              <button
                className="button button-quiet button-full"
                name="intent"
                type="submit"
                value="observation"
              >
                Save observations
              </button>
            </Form>
            <Form method="post">
              <button
                className="button button-primary button-full"
                name="intent"
                type="submit"
                value="complete"
              >
                Complete interview
              </button>
            </Form>
            <Form method="post">
              <button
                className="button button-quiet button-full"
                name="intent"
                type="submit"
                value="no_answer"
              >
                Mark no answer
              </button>
            </Form>
          </aside>
        </div>
      )}
    </AppShell>
  );
}
