import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AppHeader } from "./components/AppHeader";
import { BoardPage } from "./pages/BoardPage";
import { ClassPage } from "./pages/ClassPage";
import { MediaProbePage } from "./pages/MediaProbePage";
import { PresentPage } from "./pages/PresentPage";
import { TeacherDashboardPage } from "./pages/TeacherDashboardPage";
import { TeacherManagementPage } from "./pages/TeacherManagementPage";
import { AppStateProvider } from "./state/AppState";

function AppRoutes() {
  const location = useLocation();
  const presentationMode = location.pathname.endsWith("/present");

  return (
    <>
      {!presentationMode && <AppHeader />}
      <Routes>
        <Route path="/teacher" element={<TeacherDashboardPage />} />
        <Route path="/owner/teachers" element={<TeacherManagementPage />} />
        <Route path="/setup/media" element={<MediaProbePage />} />
        <Route path="/c/:classId" element={<ClassPage />} />
        <Route path="/c/:classId/b/:boardId" element={<BoardPage />} />
        <Route path="/c/:classId/b/:boardId/present" element={<PresentPage />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AppStateProvider><AppRoutes /></AppStateProvider>;
}
