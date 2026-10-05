import { useEffect, useState } from "react";
import { api, type Health } from "./lib/api";
import { parseRoute, type Route } from "./lib/route";

function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.health().then(setHealth, (e: Error) => setError(e.message));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>One Thing</h1>
      <p>Route: {route.page === "play" ? `play ${route.id} at speed ${route.speed}` : "parent"}</p>
      {health && (
        <p>
          Model {health.model}: {health.ollama}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
