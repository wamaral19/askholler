import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type LoaderFunctionArgs,
  type MetaArgs,
} from "react-router";
import "./styles.css";

export function loader({ request }: LoaderFunctionArgs) {
  return { origin: new URL(request.url).origin };
}

export function meta({ data }: MetaArgs<typeof loader>) {
  const title = "Holler — Hear what your customers think";
  const description =
    "Holler has human, 1:1 conversations with your customers at exactly the moments you want to hear from them.";
  const socialImage = `${data?.origin ?? ""}/og.png`;

  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { property: "og:image", content: socialImage },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: socialImage },
  ];
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
