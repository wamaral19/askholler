import { isbot } from "isbot";
import { renderToReadableStream } from "react-dom/server";
import { ServerRouter, type EntryContext } from "react-router";
import { addShopifyDocumentResponseHeaders } from "./shopify.server";

export const streamTimeout = 5_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  let shellRendered = false;
  const stream = await renderToReadableStream(
    <ServerRouter context={reactRouterContext} url={request.url} />,
    {
      onError(error: unknown) {
        responseStatusCode = 500;
        if (shellRendered) console.error(error);
      },
      signal: AbortSignal.timeout(streamTimeout + 1_000),
    },
  );

  shellRendered = true;
  if (
    isbot(request.headers.get("user-agent")) ||
    reactRouterContext.isSpaMode
  ) {
    await stream.allReady;
  }

  responseHeaders.set("Content-Type", "text/html");
  addShopifyDocumentResponseHeaders(request, responseHeaders);

  return new Response(stream, {
    status: responseStatusCode,
    headers: responseHeaders,
  });
}
