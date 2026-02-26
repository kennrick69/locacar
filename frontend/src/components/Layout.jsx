import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  Car, LayoutDashboard, FileText, CreditCard, Settings,
  Users, LogOut, Menu, X, ChevronRight
} from 'lucide-react';

const driverMenu = [
  { path: '/motorista', label: 'Meu Processo', icon: LayoutDashboard },
  { path: '/motorista/pagamentos', label: 'Pagamentos', icon: CreditCard },
];

const adminMenu = [
  { path: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/admin/carros', label: 'Carros', icon: Car },
  { path: '/admin/motoristas', label: 'Motoristas', icon: Users },
  { path: '/admin/config', label: 'Configurações', icon: Settings },
];

export default function Layout({ children }) {
  const { user, logout, isAdmin } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const menu = isAdmin ? adminMenu : driverMenu;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 bg-white border-r border-gray-200
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
          <Link to="/" className="flex items-center gap-2">
            <Car className="w-7 h-7 text-brand-600" />
            <span className="text-xl font-bold text-brand-800">LocaCar</span>
          </Link>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User info */}
        <div className="px-4 py-3 border-b border-gray-100">
          <p className="font-medium text-gray-800 text-sm truncate">{user?.nome}</p>
          <p className="text-xs text-gray-400">
            {isAdmin ? 'Administrador' : 'Motorista'}
          </p>
        </div>

        {/* Nav */}
        <nav className="p-3 flex-1">
          {menu.map(item => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1
                  text-sm font-medium transition-colors
                  ${active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'}
                `}
              >
                <Icon className="w-5 h-5" />
                {item.label}
                {active && <ChevronRight className="w-4 h-4 ml-auto" />}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full
                       text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar mobile */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 lg:hidden">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2">
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          <div className="flex items-center gap-2 ml-3">
            <Car className="w-5 h-5 text-brand-600" />
            <span className="font-bold text-brand-800">LocaCar</span>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
