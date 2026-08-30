import { Navigate, Route, Routes } from 'react-router-dom';
import { StudiesPage } from './pages/StudiesPage';
import { ViewerPage } from './pages/ViewerPage';
import { LocalFilesPage } from './pages/LocalFilesPage';
import { UploadPage } from './pages/UploadPage';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<StudiesPage />} />
      <Route path="/viewer" element={<ViewerPage />} />
      <Route path="/local" element={<LocalFilesPage />} />
      <Route path="/upload" element={<UploadPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
