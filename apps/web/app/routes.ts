import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("app", "routes/shopify-app.tsx", [
    index("routes/shopify-app-index.tsx"),
  ]),
  route("auth/login", "routes/shopify-login.tsx"),
  route("auth/*", "routes/shopify-auth.tsx"),
  route("webhooks", "routes/shopify-webhooks.tsx"),
  route("login", "routes/workforce-login.tsx"),
  layout("routes/workforce-layout.tsx", [
    route("admin/dashboard", "routes/admin-dashboard.tsx"),
    route("admin/research-fields", "routes/admin-research-fields.tsx"),
    route("admin/scripts", "routes/admin-scripts.tsx"),
    route("moments", "routes/research-moments.tsx"),
    route("moments/new", "routes/cohort-builder.tsx"),
    route("moments/:momentId/script", "routes/moment-script.tsx"),
    route("queue", "routes/research-queue.tsx"),
    route("interviews/:interviewId", "routes/live-interview.tsx"),
  ]),
  route("merchant", "routes/workforce-merchant.ts"),
  route("api/twilio/token", "routes/twilio-token.ts"),
  route("api/twilio/recording", "routes/twilio-recording.ts"),
  route("api/twilio/voice", "routes/twilio-voice.ts"),
  route("api/twilio/call-status", "routes/twilio-call-status.ts"),
  route("api/twilio/recording-status", "routes/twilio-recording-status.ts"),
] satisfies RouteConfig;
