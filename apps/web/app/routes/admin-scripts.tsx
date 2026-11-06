import {
  Form,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";
import type { ScriptPrompt } from "@holler/domain";

import { AppShell } from "../components/app-shell";
import { canManageMoments } from "../lib/moment-status";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { isPromptScope, promptScopeOptions } from "../lib/prompt-scope";
import { formErrorFrom } from "../lib/route-forms";
import { newPromptId, scriptErrorMessages } from "../lib/script-prompts";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const scripts = await getOperationsService().listScripts(context);
    return {
      questions: scripts.flatMap((script) =>
        script.prompts.map((prompt) => ({
          key: `${script.id}:${prompt.id}`,
          prompt,
          source: script.editable ? ("merchant" as const) : ("holler" as const),
        })),
      ),
      canManage: canManageMoments(context.roles),
      adding: new URL(request.url).searchParams.get("question") === "new",
    };
  });
}

export async function action({ request }: { request: Request }) {
  try {
    return await executeOperationsRequest(async () => {
      const form = await request.formData();
      const title = String(form.get("title") ?? "").trim();
      const scopeValue = form.get("scope");
      const result = await getOperationsService().saveScript(
        await getTenantContext(request),
        {
          name: title,
          prompts: [
            {
              id: newPromptId(),
              title,
              prompt: String(form.get("prompt") ?? "").trim(),
              scope: isPromptScope(scopeValue) ? scopeValue : "order",
              probes: String(form.get("probes") ?? "")
                .split("\n")
                .map((probe) => probe.trim())
                .filter(Boolean),
              researchGoal: String(form.get("researchGoal") ?? "").trim(),
              core: false,
            },
          ],
        },
      );
      return redirect(
        `/admin/scripts?created=${encodeURIComponent(result.scriptId)}`,
      );
    });
  } catch (thrown) {
    return formErrorFrom(thrown, scriptErrorMessages);
  }
}

export function meta() {
  return [{ title: "Question database · Holler" }];
}

export default function AdminScriptsRoute() {
  const { questions, canManage, adding } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const holler = questions.filter((question) => question.source === "holler");
  const merchant = questions.filter(
    (question) => question.source === "merchant",
  );

  return (
    <AppShell
      eyebrow="Admin"
      title="Question database"
      description="Reusable interview questions for study design. Holler base questions are shared; merchant questions remain private to the current merchant."
      actions={
        canManage && !adding ? (
          <a
            className="button button-primary"
            href="/admin/scripts?question=new"
          >
            Add question
          </a>
        ) : undefined
      }
    >
      {adding && canManage ? (
        <section className="panel question-create">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Merchant question</p>
              <h2>Add to the database</h2>
            </div>
            <a className="text-button" href="/admin/scripts">
              Cancel
            </a>
          </div>
          <p className="helper-copy">
            This question will only be available to studies for the current
            merchant.
          </p>
          <Form className="form-grid two-column" method="post">
            <label>
              <span>Question name</span>
              <input
                name="title"
                placeholder="e.g. Recent purchase timeline"
                required
              />
            </label>
            <label>
              <span>Research dimension</span>
              <select defaultValue="order" name="scope">
                {promptScopeOptions.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="full-span">
              <span>Question researchers ask</span>
              <textarea
                maxLength={2000}
                name="prompt"
                placeholder="Use open, behaviorally anchored wording"
                required
                rows={3}
              />
            </label>
            <label className="full-span">
              <span>Optional probes · one per line</span>
              <textarea
                name="probes"
                placeholder={"Tell me more about that.\nWhat happened next?"}
                rows={4}
              />
            </label>
            <label className="full-span">
              <span>Research goal · internal</span>
              <textarea
                maxLength={1000}
                name="researchGoal"
                placeholder="What this question should help the researcher understand"
                rows={2}
              />
            </label>
            <div className="defaults-actions full-span">
              {result && "error" in result ? (
                <p className="save-notice save-notice--error" role="alert">
                  {result.error}
                </p>
              ) : null}
              <button
                className="button button-primary"
                disabled={navigation.state === "submitting"}
                type="submit"
              >
                {navigation.state === "submitting"
                  ? "Adding…"
                  : "Add merchant question"}
              </button>
            </div>
          </Form>
        </section>
      ) : null}

      <QuestionSection
        empty="No merchant questions yet."
        eyebrow="Private to this merchant"
        questions={merchant}
        title="Merchant questions"
      />
      <QuestionSection
        empty="Holler base questions have not been loaded yet."
        eyebrow="Shared foundation"
        questions={holler}
        title="Holler base questions"
      />
    </AppShell>
  );
}

interface QuestionRow {
  readonly key: string;
  readonly prompt: ScriptPrompt;
  readonly source: "merchant" | "holler";
}

function QuestionSection({
  eyebrow,
  title,
  empty,
  questions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly empty: string;
  readonly questions: readonly QuestionRow[];
}) {
  return (
    <section className="panel question-library-section">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <span className="registry-label">{questions.length} questions</span>
      </div>
      {questions.length ? (
        <div className="question-library-list">
          {questions.map((question) => (
            <details key={question.key}>
              <summary>
                <div>
                  <span className="question-list-item__title">
                    {question.prompt.title}
                  </span>
                  <h3>{question.prompt.prompt}</h3>
                  <span className="question-list-item__meta">
                    {question.prompt.library?.category ??
                      question.prompt.researchGoal ??
                      "Merchant question"}
                  </span>
                </div>
                <span className="question-library-list__disclosure">
                  Details
                </span>
              </summary>
              <div className="question-detail">
                <div>
                  <span className="question-detail__label">
                    Research objective
                  </span>
                  <p>
                    {question.prompt.researchGoal ??
                      "No research objective has been added yet."}
                  </p>
                </div>
                {question.prompt.library ? (
                  <dl>
                    <div>
                      <dt>Group</dt>
                      <dd>{question.prompt.library.group}</dd>
                    </div>
                    <div>
                      <dt>Eligible segment</dt>
                      <dd>
                        {question.prompt.library.eligibleSegment.replaceAll(
                          "_",
                          " ",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Method</dt>
                      <dd>
                        {question.prompt.library.methodCode.replaceAll(
                          "_",
                          " ",
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Library ID</dt>
                      <dd>{question.prompt.library.questionId}</dd>
                    </div>
                  </dl>
                ) : null}
                {question.prompt.probes?.length ? (
                  <div className="question-detail__probes">
                    <span className="question-detail__label">
                      Optional follow-up probes
                    </span>
                    <ul>
                      {question.prompt.probes.map((probe) => (
                        <li key={probe}>{probe}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <p className="helper-copy">{empty}</p>
      )}
    </section>
  );
}
