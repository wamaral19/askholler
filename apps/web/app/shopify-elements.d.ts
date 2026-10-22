// App Bridge navigation elements used by the embedded app. AppProvider loads
// the scripts that define them; only the attributes Holler uses are typed.
import type { DetailedHTMLProps, HTMLAttributes } from "react";

type ShopifyElement<Extra = object> = DetailedHTMLProps<
  HTMLAttributes<HTMLElement>,
  HTMLElement
> &
  Extra;

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": ShopifyElement;
      "s-link": ShopifyElement<{ href: string; rel?: string }>;
    }
  }
}
