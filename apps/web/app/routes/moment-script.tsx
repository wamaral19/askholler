import { useState } from "react";
import {
  Form,
  Link,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { AppShell } from "../components/app-shell";
import { ScriptEditor } from "../components/script-editor";
import { canManageMoments, momentStatusLabels } from "../lib/moment-status";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { formErrorFrom, jsonFormValue } from "../lib/route-forms";
import {
  promptsFromForm,
  samePromptList,
  scriptErrorMessages,
} from "../lib/script-prompts";

interface Args {
  readonly request: Request;
  readonly params: { readonly momentId?: string };
}

export async function loader({ request, params }: Args) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const service = getOperationsService();
    const [script, library] = await Promise.all([
      service.getMomentScript(context, params.momentId ?? ""),
      service.listScripts(context),
    ]);
    return { script, library, canManage: canManageMoments(context.roles) };
  });
}

export async function action({ request, params }: Args) {
  try {
    return await executeOperationsRequest(async () => {
      const form = await request.formData();
      const script = await getOperationsService().updateMomentScript(
        await getTenantContext(request),
        params.momentId ?? "",
        promptsFromForm(jsonFormValue(form, "prompts")),
      );
      return { saved: script.scriptVersion };
    });
  } catch (thrown) {
    return formErrorFrom(thrown, scriptErrorMessages);
  }
}

export function meta() {
  return [{ title: "Moment script · Holler" }];
}

export default function MomentScriptRoute() {
  const { script, library, canManage } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const navigation = useNavigation();
  const [prompts, setPrompts] = useState(() => [...script.prompts]);
  const [source, setSource] = useState("");
  const dirty = !samePromptList(prompts, script.prompts);

  return (
    <AppShell
      eyebrow="Angle setup"
      title={`${script.momentName} script`}
      description="Adapt the interview script for this research run only. The library script is not changed."
      actions={
        <Link className="button button-quiet" to="/moments">
          Back to moments
        </Link>
      }
    >
      <Form method="post" className="panel script-form">
        <div className="panel-heading">
          <div>
            <h2>
              {script.scriptName} v{script.scriptVersion}
            </h2>
            <span className={`status-pill status-${script.momentStatus}`}>
              {momentStatusLabels[script.momentStatus]}
            </span>
          </div>
          <span className="registry-label">
            {script.runSpecific ? "Adapted for this run" : "Library script"}
          </span>
        </div>
        <p className="helper-copy">
          Saving applies to orders queued from now on. Calls already in the
          queue keep the script they were queued with.
        </p>
        {canManage && library.length ? (
          <div className="inline-add">
            <label>
              <span>Start over from a library script</span>
              <select
                onChange={(event) => setSource(event.target.value)}
                value={source}
              >
                <option value="">Choose a script…</option>
                {library.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} v{item.version}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button-quiet"
              disabled={!source}
              onClick={() => {
                const chosen = library.find((item) => item.id === source);
                if (chosen) setPrompts([...chosen.prompts]);
                setSource("");
              }}
              type="button"
            >
              Replace steps
            </button>
          </div>
        ) : null}
        <ScriptEditor
          name="prompts"
          onChange={setPrompts}
          prompts={prompts}
          readOnly={!canManage}
        />
        {canManage ? (
          <div className="defaults-actions">
            {result && "error" in result ? (
              <p className="save-notice save-notice--error" role="alert">
                {result.error}
              </p>
            ) : result && !dirty ? (
              <p className="save-notice" role="status">
                Saved as version {result.saved}.
              </p>
            ) : null}
            <button
              className="button button-quiet"
              disabled={!dirty}
              onClick={() => setPrompts([...script.prompts])}
              type="button"
            >
              Discard changes
            </button>
            <button
              className="button button-primary"
              disabled={!dirty || navigation.state === "submitting"}
              type="submit"
            >
              Save for this run
            </button>
          </div>
        ) : null}
      </Form>
    </AppShell>
  );
}
