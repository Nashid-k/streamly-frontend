import { BrowserRouter as Router } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { usePreferences } from "./context/preferences";
import Loader from "./components/Loader";
import GlobalShortcuts from "./components/GlobalShortcuts";
import Layout from "./app/Layout";
import AppRoutes from "./app/routes";

function App() {
  const { reduceMotion } = usePreferences();
  return (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
      <Router>
        <Loader variant="global" />
        <GlobalShortcuts />
        <Layout>
          <AppRoutes />
        </Layout>
      </Router>
    </MotionConfig>
  );
}

export default App;