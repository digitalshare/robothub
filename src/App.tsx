import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import ChatWidget from './components/ChatWidget';
import ProtectedRoute from './components/ProtectedRoute';
import NewsList from './pages/NewsList';
import ArticleDetail from './pages/ArticleDetail';
import Login from './pages/Login';
import AdminTopics from './pages/admin/AdminTopics';
import AdminSettings from './pages/admin/AdminSettings';
import AdminLogs from './pages/admin/AdminLogs';
import { AuthProvider } from './contexts/AuthContext';
import { ChatProvider } from './contexts/ChatContext';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ChatProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<NewsList />} />
              <Route path="/article/:id" element={<ArticleDetail />} />
              <Route path="/login" element={<Login />} />
              <Route
                path="/admin/topics"
                element={
                  <ProtectedRoute>
                    <AdminTopics />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/logs"
                element={
                  <ProtectedRoute>
                    <AdminLogs />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/settings"
                element={
                  <ProtectedRoute>
                    <AdminSettings />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
          {/* Site-wide AI chat (collapses to a bubble) */}
          <ChatWidget />
        </ChatProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
