import { useEffect } from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { usePreferenceValue } from "./context/preferences";
import GlobalShortcuts from "./components/GlobalShortcuts";
import Layout from "./app/Layout";
import AppRoutes from "./app/routes";
import { startRouteWarmup } from "./app/routeWarmup";

function App() {
  const reduceMotion = usePreferenceValue("reduceMotion");
  // Idle warm-up of every lazy route chunk + hover/focus link prefetch, so the
  // Suspense fallback on first navigation to each page never happens.
  useEffect(() => startRouteWarmup(), []);
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <Router>
        <GlobalShortcuts />
        <Layout>
          <AppRoutes />
        </Layout>
      </Router>
    </MotionConfig>
  );
}

export default App;