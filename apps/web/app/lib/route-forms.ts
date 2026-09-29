/** Reads a JSON-encoded form value, rejecting malformed input with a 400. */
export function jsonFormValue(form: FormData, name: string): unknown {
  try {
    return JSON.parse(String(form.get(name) ?? ""));
  } catch {
    throw new Response(`Invalid ${name}`, { status: 400 });
  }
}

/**
 * Turns a rejected request into a message the page can show inline, so
 * validation and permission failures stay on the form instead of the error
 * boundary. Anything else is rethrown.
 */
export async function formErrorFrom(
  thrown: unknown,
  messages: Readonly<Record<string, string>>,
): Promise<{ error: string }> {
  if (
    !(thrown instanceof Response) ||
    ![400, 403, 404, 409].includes(thrown.status)
  )
    throw thrown;
  const body = (await thrown.json().catch(() => null)) as {
    error?: { code?: string };
  } | null;
  const code = body?.error?.code ?? "";
  if (messages[code]) return { error: messages[code] };
  if (thrown.status === 403)
    return { error: "You don’t have permission to change this." };
  return { error: `Could not save (${code || thrown.status}).` };
}
