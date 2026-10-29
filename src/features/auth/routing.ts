import type { AppState } from "@/types";
import { entryDestination, planReturnPaths } from "./model";

const workspacePaths = new Set([
  "/tracker",
  "/history",
  "/pay",
  "/jobs",
  "/settings",
]);
export function authRedirect(
  data: Pick<AppState, "auth">,
  path: string,
): string | null {
  const destination = entryDestination(data);
  if (workspacePaths.has(path))
    return destination !== "/tracker" ? destination : null;
  if (path === "/onboarding")
    return data.auth.session === "mock" ? null : destination;
  if (path === "/plans")
    return data.auth.session === "signed-out" ? "/auth" : null;
  if (
    ["/auth", "/signup"].includes(path) &&
    data.auth.session === "mock" &&
    !data.auth.pending
  )
    return destination;
  return null;
}
export function planReturn(value: string | null) {
  if (
    typeof value === "string" &&
    planReturnPaths.includes(value as (typeof planReturnPaths)[number])
  )
    return value;
  const paths: Record<string, string> = {
    tracker: "/tracker",
    history: "/history",
    pay: "/pay",
    jobs: "/jobs",
    settings: "/settings",
    onboarding: "/onboarding",
  };
  return value && Object.hasOwn(paths, value) ? paths[value] : "/tracker";
}
export function callbackParams(search: string, hash = "") {
  const query = new URLSearchParams(search),
    fragment = new URLSearchParams(hash.replace(/^#/, ""));
  return {
    demo: query.get("demo") ?? undefined,
    flow: query.get("flow") ?? undefined,
    id: query.get("id") ?? undefined,
    external: [
      "code",
      "access_token",
      "refresh_token",
      "error",
      "error_description",
      "token",
      "token_hash",
    ].some((key) => query.has(key) || fragment.has(key)),
  };
}
