import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

// Layout
import Layout from './components/Layout';
import Loading from './components/Loading';

// Páginas públicas
import Login from './pages/Login';
import LoginSenha from './pages/LoginSenha';
import MagicLinkConsume from './pages/MagicLinkConsume';
import Register from './pages/Register';
import Vitrine from './pages/Vitrine';
import CarDetail from './pages/CarDetail';
import PropertyDetail from './pages/PropertyDetail';

// Páginas motorista (Etapa 2)
import DriverJourney from './pages/driver/DriverJourney';
import DriverPayments from './pages/driver/Payments';

// Páginas admin (Etapa 3)
import AdminDashboard from './pages/admin/Dashboard';
import AdminCars from './pages/admin/Cars';
import AdminDrivers from './pages/admin/Drivers';
import AdminDriverDetail from './pages/admin/DriverDetail';
import AdminSettings from './pages/admin/Settings';
import AdminProperties from './pages/admin/Properties';
import ContractClauses from './pages/admin/ContractClauses';

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
      <Route path="/carro/:id" element={<CarDetail />} />
      <Route path="/imovel/:id" element={<PropertyDetail />} />
      <Route path="/login" element={
        isAuthenticated
          ? <Navigate to={user?.role === 'admin' ? '/admin' : '/motorista'} />
          : <Login />
      } />
      {/* Fallback login admin por senha (emergência). Será removido depois
          que magic link estiver confirmado 100% em produção. */}
      <Route path="/admin/login-senha" element={
        isAuthenticated
          ? <Navigate to={user?.role === 'admin' ? '/admin' : '/motorista'} />
          : <LoginSenha />
      } />
      {/* Consume do magic link: usuário chega aqui clicando no email. */}
      <Route path="/admin/magic" element={<MagicLinkConsume />} />
      <Route path="/register" element={<Register />} />

      {/* Motorista (Etapa 2) */}
      <Route path="/motorista" element={
        <PrivateRoute role="motorista">
          <Layout><DriverJourney /></Layout>
        </PrivateRoute>
      } />
      <Route path="/motorista/documentos" element={<Navigate to="/motorista" />} />
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
      <Route path="/admin/imoveis" element={
        <PrivateRoute role="admin">
          <Layout><AdminProperties /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/config" element={
        <PrivateRoute role="admin">
          <Layout><AdminSettings /></Layout>
        </PrivateRoute>
      } />
      <Route path="/admin/contrato-clausulas" element={
        <PrivateRoute role="admin">
          <Layout><ContractClauses /></Layout>
        </PrivateRoute>
      } />

      {/* 404 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}
