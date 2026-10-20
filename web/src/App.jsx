import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Splash } from './components/ui.jsx';
import Setup from './pages/Setup.jsx';
import Login from './pages/Login.jsx';
import Join from './pages/Join.jsx';
import Home from './pages/Home.jsx';
import Watch from './pages/Watch.jsx';
import Live from './pages/Live.jsx';
import LiveNow from './pages/LiveNow.jsx';
import Upload from './pages/Upload.jsx';
import Channel from './pages/Channel.jsx';
import Studio from './pages/Studio.jsx';
import GoLive from './pages/GoLive.jsx';
import Family from './pages/Family.jsx';
import Subscriptions from './pages/Subscriptions.jsx';
import Settings from './pages/Settings.jsx';
import NotFound from './pages/NotFound.jsx';

function Private({ children, member }) {
  const { user, canUpload } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (member && !canUpload) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { loading, user, needsSetup } = useAuth();
  if (loading) return <Splash />;
  if (needsSetup) {
    return (
      <Routes>
        <Route path="*" element={<Setup />} />
      </Routes>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/join/:code" element={<Join />} />
      <Route element={<Private><Layout /></Private>}>
        <Route index element={<Home />} />
        <Route path="search" element={<Home />} />
        <Route path="watch/:id" element={<Watch />} />
        <Route path="live" element={<LiveNow />} />
        <Route path="live/:username" element={<Live />} />
        <Route path="c/:username" element={<Channel />} />
        <Route path="upload" element={<Private member><Upload /></Private>} />
        <Route path="studio" element={<Private member><Studio /></Private>} />
        <Route path="go-live" element={<Private member><GoLive /></Private>} />
        <Route path="family" element={<Family />} />
        <Route path="subscriptions" element={<Subscriptions />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
