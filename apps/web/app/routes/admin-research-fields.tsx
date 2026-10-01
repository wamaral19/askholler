import { useState } from "react";
import {
  Form,
  useActionData,
  useLoaderData,
  useNavigation,
} from "react-router";

import { AppShell } from "../components/app-shell";
import { canManageMoments } from "../lib/moment-status";
import type {
  EditableFieldValueType,
  LibraryResearchField,
  ResearchFieldInput,
} from "../lib/operations-types";
import {
  executeOperationsRequest,
  getOperationsService,
  getTenantContext,
} from "../lib/operations-service.server";
import { moveItem } from "../lib/reorder";
import { formErrorFrom, jsonFormValue } from "../lib/route-forms";

export async function loader({ request }: { request: Request }) {
  return executeOperationsRequest(async () => {
    const context = await getTenantContext(request);
    const fields = await getOperationsService().listResearchFields(context, {
      includeArchived: true,
    });
    return { fields, canManage: canManageMoments(context.roles) };
  });
}

const errorMessages: Record<string, string> = {
  INVALID_RESEARCH_FIELD:
    "Give the field a name and a question. Single-choice fields need 2–20 options.",
  INVALID_FIELD_DEFAULTS:
    "The field list changed while you were editing. Reload and try again.",
  PLATFORM_FIELD_LOCKED:
    "Platform field wording is shared across merchants and can’t be edited here.",
  RESEARCH_FIELD_NOT_FOUND: "That field no longer exists.",
  MOMENT_MANAGER_ROLE_REQUIRED:
    "Only research managers and merchant admins can change research fields.",
};

export async function action({ request }: { request: Request }) {
  try {
    return await executeOperationsRequest(async () => {
      const context = await getTenantContext(request);
      const service = getOperationsService();
      const form = await request.formData();
      const intent = form.get("intent");
      if (intent === "save_defaults") {
        const defaults = jsonFormValue(form, "defaults");
        if (!Array.isArray(defaults))
          throw new Response("Invalid defaults", { status: 400 });
        await service.saveFieldDefaults(
          context,
          defaults.map((item: Record<string, unknown>) => ({
            fieldId: String(item.fieldId ?? ""),
            includedByDefault: item.includedByDefault === true,
            requiredByDefault: item.requiredByDefault === true,
          })),
        );
        return { saved: "Defaults saved." };
      }
      if (intent === "save_field") {
        const fieldId = String(form.get("fieldId") ?? "") || undefined;
        await service.saveResearchField(context, fieldId, fieldInput(form));
        return {
          saved: fieldId
            ? "Field updated. Runs already launched keep the wording they started with."
            : "Field added to the library.",
        };
      }
      if (intent === "archive" || intent === "restore") {
        await service.setResearchFieldArchived(
          context,
          String(form.get("fieldId") ?? ""),
          intent === "archive",
        );
        return {
          saved: intent === "archive" ? "Field archived." : "Field restored.",
        };
      }
      throw new Response("Unsupported action", { status: 400 });
    });
  } catch (thrown) {
    return formErrorFrom(thrown, errorMessages);
  }
}

function fieldInput(form: FormData): ResearchFieldInput {
  const valueType = String(form.get("valueType"));
  return {
    label: String(form.get("label") ?? ""),
    prompt: String(form.get("prompt") ?? ""),
    valueType: (valueTypeLabels[valueType as EditableFieldValueType]
      ? valueType
      : "long_text") as EditableFieldValueType,
    options: String(form.get("options") ?? "").split("\n"),
  };
}

export function meta() {
  return [{ title: "Research fields · Holler" }];
}

const valueTypeLabels: Record<EditableFieldValueType, string> = {
  long_text: "Open answer",
  single_select: "Single choice",
  rating_scale: "Rating 1–5",
};

const sourceLabels: Record<LibraryResearchField["source"], string> = {
  platform_default: "Platform",
  merchant_default: "Merchant",
  research_run: "Merchant",
};

export default function AdminResearchFieldsRoute() {
  const { fields, canManage } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const active = fields.filter((field) => !field.archived);
  const archived = fields.filter((field) => field.archived);
  // Remount the defaults editor whenever saved data changes.
  const defaultsKey = active
    .map(
      (field) =>
        `${field.id}:${field.includedByDefault}:${field.required}:${field.displayOrder}`,
    )
    .join("|");

  return (
    <AppShell
      eyebrow="Admin"
      title="Research fields"
      description="Your library of reusable questions. Choose which fields new research runs start with, which are required, and the order researchers ask them."
    >
      {result ? (
        <p
          className={
            "error" in result ? "save-notice save-notice--error" : "save-notice"
          }
          role={"error" in result ? "alert" : "status"}
        >
          {"error" in result ? result.error : result.saved}
        </p>
      ) : null}
      <DefaultsEditor canManage={canManage} fields={active} key={defaultsKey} />
      {canManage ? (
        <section className="panel library-panel">
          <div className="panel-heading">
            <div>
              <h2>New field</h2>
            </div>
          </div>
          <p className="helper-copy">
            New fields are saved to this merchant’s library and are available to
            every future research run.
          </p>
          <FieldEditor submitLabel="Add to library" />
        </section>
      ) : null}
      {archived.length ? (
        <section className="panel library-panel">
          <div className="panel-heading">
            <div>
              <h2>Archived</h2>
            </div>
            <span className="registry-label">{archived.length} fields</span>
          </div>
          <p className="helper-copy">
            Archived fields are hidden from the moment builder. Past answers are
            kept.
          </p>
          <ul className="ordered-list">
            {archived.map((field) => (
              <li className="ordered-row ordered-row--compact" key={field.id}>
                <FieldSummary field={field} />
                {canManage ? (
                  <Form method="post">
                    <input name="fieldId" type="hidden" value={field.fieldId} />
                    <button
                      className="button button-small"
                      name="intent"
                      type="submit"
                      value="restore"
                    >
                      Restore
                    </button>
                  </Form>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </AppShell>
  );
}

function DefaultsEditor({
  fields,
  canManage,
}: {
  readonly fields: readonly LibraryResearchField[];
  readonly canManage: boolean;
}) {
  const [rows, setRows] = useState(() =>
    fields.map((field) => ({
      field,
      includedByDefault: field.includedByDefault,
      requiredByDefault: field.required,
    })),
  );
  const [editing, setEditing] = useState<string | null>(null);
  const navigation = useNavigation();
  const dirty = rows.some(
    (row, index) =>
      row.field.id !== fields[index]?.id ||
      row.includedByDefault !== row.field.includedByDefault ||
      row.requiredByDefault !== row.field.required,
  );
  const update = (index: number, patch: Partial<(typeof rows)[number]>) =>
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );

  return (
    <section className="panel library-panel">
      <div className="panel-heading">
        <div>
          <h2>Defaults for new research runs</h2>
        </div>
        <span className="registry-label">
          {rows.filter((row) => row.includedByDefault).length} of {rows.length}{" "}
          included
        </span>
      </div>
      <p className="helper-copy">
        The moment builder starts with the included fields in this order. Each
        run can still add, remove, reorder, or change what’s required.
      </p>
      <ol className="ordered-list">
        {rows.map((row, index) => (
          <li className="ordered-row" key={row.field.id}>
            <span className="ordered-row__number" aria-hidden="true">
              {index + 1}
            </span>
            <FieldSummary field={row.field} />
            <div className="row-toggles">
              <label className="toggle-label">
                <input
                  checked={row.includedByDefault}
                  disabled={!canManage}
                  onChange={(event) =>
                    update(index, { includedByDefault: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>Include</span>
              </label>
              <label className="toggle-label">
                <input
                  checked={row.requiredByDefault}
                  disabled={!canManage}
                  onChange={(event) =>
                    update(index, { requiredByDefault: event.target.checked })
                  }
                  type="checkbox"
                />
                <span>Required</span>
              </label>
            </div>
            {canManage ? (
              <div className="row-controls">
                <button
                  aria-label={`Move “${row.field.label}” up`}
                  className="button button-small button-quiet"
                  disabled={index === 0}
                  onClick={() =>
                    setRows((current) => moveItem(current, index, -1))
                  }
                  type="button"
                >
                  ↑
                </button>
                <button
                  aria-label={`Move “${row.field.label}” down`}
                  className="button button-small button-quiet"
                  disabled={index === rows.length - 1}
                  onClick={() =>
                    setRows((current) => moveItem(current, index, 1))
                  }
                  type="button"
                >
                  ↓
                </button>
                {row.field.editable ? (
                  <button
                    aria-expanded={editing === row.field.id}
                    className="text-button"
                    onClick={() =>
                      setEditing((current) =>
                        current === row.field.id ? null : row.field.id,
                      )
                    }
                    type="button"
                  >
                    {editing === row.field.id ? "Close" : "Edit"}
                  </button>
                ) : null}
              </div>
            ) : null}
            {editing === row.field.id ? (
              <div className="ordered-row__editor">
                <FieldEditor field={row.field} submitLabel="Save field" />
                <Form method="post" className="archive-form">
                  <input
                    name="fieldId"
                    type="hidden"
                    value={row.field.fieldId}
                  />
                  <button
                    className="text-button danger-text"
                    name="intent"
                    type="submit"
                    value="archive"
                  >
                    Archive field
                  </button>
                </Form>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {canManage ? (
        <Form method="post" className="defaults-actions">
          <input name="intent" type="hidden" value="save_defaults" />
          <input
            name="defaults"
            type="hidden"
            value={JSON.stringify(
              rows.map((row) => ({
                fieldId: row.field.fieldId,
                includedByDefault: row.includedByDefault,
                requiredByDefault: row.requiredByDefault,
              })),
            )}
          />
          {dirty ? <span className="field-source">Unsaved changes</span> : null}
          <button
            className="button button-primary"
            disabled={!dirty || navigation.state === "submitting"}
            type="submit"
          >
            Save defaults
          </button>
        </Form>
      ) : null}
    </section>
  );
}

function FieldSummary({ field }: { readonly field: LibraryResearchField }) {
  return (
    <span className="field-summary">
      <strong>{field.label}</strong>
      <small>{field.prompt}</small>
      <span className="field-summary__meta">
        <span className="field-source">{sourceLabels[field.source]}</span>
        <span className="field-source">{valueTypeLabels[field.valueType]}</span>
        {field.options?.length ? (
          <small>{field.options.join(" · ")}</small>
        ) : null}
        {field.version > 1 ? (
          <span className="field-source">v{field.version}</span>
        ) : null}
      </span>
    </span>
  );
}

function FieldEditor({
  field,
  submitLabel,
}: {
  readonly field?: LibraryResearchField;
  readonly submitLabel: string;
}) {
  const [valueType, setValueType] = useState<EditableFieldValueType>(
    field?.valueType ?? "long_text",
  );
  return (
    <Form method="post" className="form-grid two-column field-editor">
      <input name="intent" type="hidden" value="save_field" />
      {field ? (
        <input name="fieldId" type="hidden" value={field.fieldId} />
      ) : null}
      <label>
        <span>Field name</span>
        <input
          defaultValue={field?.label}
          maxLength={160}
          name="label"
          placeholder="e.g. Reason for switching"
          required
        />
      </label>
      <label>
        <span>Answer type</span>
        <select
          name="valueType"
          onChange={(event) =>
            setValueType(event.target.value as EditableFieldValueType)
          }
          value={valueType}
        >
          {Object.entries(valueTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="full-span">
        <span>Question researchers ask</span>
        <textarea
          defaultValue={field?.prompt}
          maxLength={2000}
          name="prompt"
          required
          rows={2}
        />
      </label>
      {valueType === "single_select" ? (
        <label className="full-span">
          <span>Options, one per line</span>
          <textarea
            defaultValue={field?.options?.join("\n")}
            name="options"
            required
            rows={4}
          />
        </label>
      ) : null}
      <div className="full-span">
        <button className="button button-primary button-small" type="submit">
          {submitLabel}
        </button>
      </div>
    </Form>
  );
}
