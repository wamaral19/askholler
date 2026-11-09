import { useLocation } from "react-router";

/**
 * The merchant pages are served twice: embedded in Shopify admin under /app
 * and as the standalone portal under /portal. Links stay on the surface the
 * merchant is already using.
 */
export function useMerchantBase(): "/app" | "/portal" {
  const { pathname } = useLocation();
  return pathname === "/portal" || pathname.startsWith("/portal/")
    ? "/portal"
    : "/app";
}
