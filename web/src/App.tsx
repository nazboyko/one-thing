import { useEffect, useState } from "react";
import { Parent } from "./pages/Parent";
import { Play } from "./pages/Play";
import { DEMO } from "./lib/demo";
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
  if (DEMO) return <Play id="sample" speed={route.page === "play" ? route.speed : 1} />;
  if (route.page === "play") return <Play key={route.id} id={route.id} speed={route.speed} />;
  return <Parent />;
}
