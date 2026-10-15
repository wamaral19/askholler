/**
 * Stands in for a Zapier "Catch Hook" so the Zapier dialer can be exercised
 * locally before a real Zap exists. Run it, then start the web app with
 *
 *   DIALER_PROVIDER=zapier
 *   ZAPIER_DIAL_WEBHOOK_URL=http://localhost:8787/hooks/catch/holler-dial
 *
 *   npm run zapier:fake-hook -- --port 8787 --status 200
 *
 * Use --status 500 to see how the interview page handles a rejected request.
 * Phone numbers are masked in the output, as they would be in any log.
 */
import { createServer } from "node:http";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    status: { type: "string", default: "200" },
  },
});

const status = Number(args.status);

createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    let summary: Record<string, unknown> = { unparsed: body.length };
    try {
      const payload = JSON.parse(body) as Record<string, unknown>;
      summary = {
        ...payload,
        phone:
          typeof payload.phone === "string"
            ? `••• ${payload.phone.slice(-4)}`
            : payload.phone,
      };
    } catch {
      // Report the size only; a malformed body is still a received request.
    }
    console.info(
      `${new Date().toISOString()} ${request.method} ${request.url} -> ${status}`,
    );
    console.info(JSON.stringify(summary, null, 2));
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ status: status < 400 ? "success" : "error" }),
    );
  });
}).listen(Number(args.port), "127.0.0.1", () =>
  console.info(
    `Fake Zapier Catch Hook on http://localhost:${args.port}/hooks/catch/holler-dial (responding ${status})`,
  ),
);
