import { Route, Routes } from "react-router-dom";
import { AppShell } from "./components/layout/AppShell";
import { Datasets } from "./pages/Datasets";
import { Deployments } from "./pages/Deployments";
import { Explainability } from "./pages/Explainability";
import { FindBestModel } from "./pages/FindBestModel";
import { Logs } from "./pages/Logs";
import { ModelRegistry } from "./pages/ModelRegistry";
import { Monitoring } from "./pages/Monitoring";
import { Overview } from "./pages/Overview";
import { Predictions } from "./pages/Predictions";
import { Retraining } from "./pages/Retraining";
import { Settings } from "./pages/Settings";
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
        <Route path="/datasets" element={<Datasets />} />
        <Route path="/registry" element={<ModelRegistry />} />
        <Route path="/deployments" element={<Deployments />} />
        <Route path="/monitoring" element={<Monitoring />} />
        <Route path="/explainability" element={<Explainability />} />
        <Route path="/pipelines" element={<Retraining />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}
