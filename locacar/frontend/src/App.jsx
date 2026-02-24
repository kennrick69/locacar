import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Layout
import Layout from './components/Layout';
import Loading from './components/Loading';

// Páginas públicas
import Login from './pages/Login';
import Register from './pages/Register';
import Vitrine from './pages/Vitrine';

// Páginas motorista (Etapa 2)
import DriverDashboard from './pages/driver/Dashboard';
import DriverDocuments from './pages/driver/Documents';
import DriverPayments from './pages/driver/Payments';

// Páginas admin (Etapa 3)
import AdminDashboard from './pages/admin/Dashboard';
import AdminCars from './pages/admin/Cars';
import AdminDrivers from './pages/admin/Drivers';
import AdminDriverDetail from './pages/admin/DriverDetail';
import AdminSettings from './pages/admin/Settings';

function PrivateRoute({ children, role }) {
  const { isAuthenticated, user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!isAuthenticated) return <Navigate to="/login" />;
  if (role && user?.role !== role) {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/motorista'} />;
  }
  return children;
}

export default function App() {
  const { loading, isAuthenticated, user } = useAuth();

  if (loading) return <Loading />;

  return (
    <Routes>
      {/* Públicas */}
      <Route path="/" element={<Vitrine />} />
      <Route path="/login" element={
        isAuthenticated
          ? <Navigate to={user?.role === 'admin' ? '/admin' : '/motorista'} />
          : <Login />
      } />
      <Route path="/register" element={
        isAuthenticated
          ? <Navigate to="/motorista" />
          : <Register />
      } />

      {/* Motorista (Etapa 2) */}
      <Route path="/motorista" element={
        <PrivateRoute role="motorista">
          <Layout><DriverDashboard /></Layout>
        </PrivateRoute>
      } />
      <Route path="/motorista/documentos" element={
        <PrivateRoute role="motorista">
          <Layout><DriverDocuments /></Layout>
        </PrivateRoute>
      } />
      <Route path="/motorista/pagamentos" element={
        <PrivateRoute role="motorista">
          <Layout><DriverPayments /></Layout>
        </PrivateRoute>
      } />

      {/* Admin (Etapa 3) */}
      <Route path="/admin" element={
        <PrivateRoute role="admin">
          <Layout><AdminDashboard /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/carros" element={
        <PrivateRoute role="admin">
          <Layout><AdminCars /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/motoristas" element={
        <PrivateRoute role="admin">
          <Layout><AdminDrivers /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/motoristas/:id" element={
        <PrivateRoute role="admin">
          <Layout><AdminDriverDetail /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/config" element={
        <PrivateRoute role="admin">
          <Layout><AdminSettings /></Layout>
        </PrivateRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
