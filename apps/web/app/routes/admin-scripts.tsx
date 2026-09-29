import { useState } from "react";
import {
  Form,
  Link,
  redirect,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { AppShell } from "../components/app-shell";
import { ScriptEditor } from "../components/script-editor";
import { canManageMoments } from "../lib/moment-status";
import type { LibraryScript } from "../lib/operations-types";
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

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = getTenantContext(request);
    const scripts = await getOperationsService().listScripts(context);
    const requested = new URL(request.url).searchParams.get("script");
    const selected =
      requested === "new"
        ? null
        : (scripts.find((script) => script.id === requested) ??
          scripts[0] ??
          null);
    return {
      scripts,
      selected,
      canManage: canManageMoments(context.roles),
    };
  });
}

export async function action({ request }: { request: Request }) {
  try {
    return await executeOperationsRequest(async () => {
      const form = await request.formData();
      const scriptId = String(form.get("scriptId") ?? "");
      const result = await getOperationsService().saveScript(
        getTenantContext(request),
        {
          ...(scriptId ? { scriptId } : {}),
          name: String(form.get("name") ?? ""),
          prompts: promptsFromForm(jsonFormValue(form, "prompts")),
        },
      );
      return redirect(
        `/admin/scripts?script=${encodeURIComponent(result.scriptId)}`,
      );
    });
  } catch (thrown) {
    return formErrorFrom(thrown, scriptErrorMessages);
  }
}

export function meta() {
  return [{ title: "Scripts · Holler" }];
}

export default function AdminScriptsRoute() {
  const { scripts, selected, canManage } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <AppShell
      eyebrow="Admin"
      title="Scripts"
      description="Reusable interview scripts. Moments start from a library script and can adapt it for one run without changing the library copy."
      actions={
        canManage ? (
          <Link
            className="button button-primary"
            to="/admin/scripts?script=new"
          >
            New script
          </Link>
        ) : undefined
      }
    >
      <div className="library-layout">
        <nav className="panel script-index" aria-label="Library scripts">
          <p className="eyebrow">Library</p>
          {scripts.length ? (
            <ul>
              {scripts.map((script) => (
                <li key={script.id}>
                  <Link
                    aria-current={
                      script.id === selected?.id ? "page" : undefined
                    }
                    to={`/admin/scripts?script=${encodeURIComponent(script.id)}`}
                  >
                    <strong>{script.name}</strong>
                    <small>
                      v{script.version} · {script.prompts.length} steps
                      {script.editable ? "" : " · Platform"}
                    </small>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper-copy">No scripts yet.</p>
          )}
        </nav>
        <ScriptForm
          canManage={canManage}
          error={result && "error" in result ? result.error : undefined}
          key={selected?.versionId ?? "new"}
          script={selected}
        />
      </div>
    </AppShell>
  );
}

function ScriptForm({
  script,
  canManage,
  error,
}: {
  readonly script: LibraryScript | null;
  readonly canManage: boolean;
  readonly error: string | undefined;
}) {
  const initial = script?.prompts ?? [
    { id: "prompt-1", title: "Permission and context", prompt: "" },
  ];
  const [prompts, setPrompts] = useState(() => [...initial]);
  const [name, setName] = useState(script?.name ?? "");
  const navigation = useNavigation();
  const dirty =
    name !== (script?.name ?? "") || !samePromptList(prompts, initial);
  const readOnly = !canManage;

  return (
    <Form method="post" className="panel script-form">
      {script ? (
        <input name="scriptId" type="hidden" value={script.id} />
      ) : null}
      <div className="panel-heading">
        <div>
          <h2>{script ? script.name : "New script"}</h2>
        </div>
        {script ? (
          <span className="registry-label">Version {script.version}</span>
        ) : null}
      </div>
      {script && !script.editable ? (
        <p className="inline-notice">
          This is a platform script. Saving changes creates a copy in this
          merchant’s library.
        </p>
      ) : null}
      {script?.editable ? (
        <p className="helper-copy">
          Saving publishes version {script.version + 1}. Moments already using
          this script keep the version they launched with.
        </p>
      ) : null}
      <label className="script-name">
        <span>Script name</span>
        <input
          maxLength={120}
          name="name"
          onChange={(event) => setName(event.target.value)}
          readOnly={readOnly}
          required
          value={name}
        />
      </label>
      <ScriptEditor
        name="prompts"
        onChange={setPrompts}
        prompts={prompts}
        readOnly={readOnly}
      />
      {canManage ? (
        <div className="defaults-actions">
          {error ? (
            <p className="save-notice save-notice--error" role="alert">
              {error}
            </p>
          ) : null}
          <button
            className="button button-primary"
            disabled={!dirty || navigation.state === "submitting"}
            type="submit"
          >
            {script && !script.editable
              ? "Save as merchant script"
              : script
                ? "Publish new version"
                : "Create script"}
          </button>
        </div>
      ) : null}
    </Form>
  );
}
