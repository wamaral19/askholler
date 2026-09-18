import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("moments", "routes/research-moments.tsx"),
  route("moments/new", "routes/cohort-builder.tsx"),
  route("queue", "routes/research-queue.tsx"),
  route("interviews/:interviewId", "routes/live-interview.tsx"),
] satisfies RouteConfig;
