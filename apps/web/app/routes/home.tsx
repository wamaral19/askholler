import { redirect } from "react-router";

export function loader() {
  return redirect("/moments");
}

export default function Home() {
  return null;
}
