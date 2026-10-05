import { useEffect } from "react";
import { playHash } from "../lib/route";

export function Parent() {
  useEffect(() => {
    document.title = "One Thing";
  }, []);
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>One Thing</h1>
      <p>A mission board that shows a kid one step at a time.</p>
      <p>
        <a href={playHash("sample")}>Play the sample mission</a>
      </p>
    </main>
  );
}
