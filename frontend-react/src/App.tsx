import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { ComingSoon } from "./pages/ComingSoon";
import { FindBestModel } from "./pages/FindBestModel";
import { Logs } from "./pages/Logs";
import { Overview } from "./pages/Overview";
import { Predictions } from "./pages/Predictions";
import { Retraining } from "./pages/Retraining";
import { TrainModel } from "./pages/TrainModel";

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Overview />} />
        <Route path="/train" element={<TrainModel />} />
        <Route path="/experiments" element={<FindBestModel />} />
        <Route path="/predictions" element={<Predictions />} />
        <Route path="/logs" element={<Logs />} />
        <Route path="/datasets" element={<ComingSoon title="Datasets" phase="Phase 1 (profiling/validation UI)" />} />
        <Route path="/registry" element={<ComingSoon title="Model Registry" phase="Phase 2" />} />
        <Route path="/deployments" element={<ComingSoon title="Deployments" phase="Phase 3" />} />
        <Route path="/monitoring" element={<ComingSoon title="Monitoring" phase="Phase 3" />} />
        <Route path="/explainability" element={<ComingSoon title="Explainability" phase="Phase 2" />} />
        <Route path="/pipelines" element={<Retraining />} />
        <Route path="/settings" element={<ComingSoon title="Settings" phase="Phase 2 (accounts)" />} />
      </Routes>
    </AppShell>
  );
}
