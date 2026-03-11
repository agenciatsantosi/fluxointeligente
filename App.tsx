import React, { useState } from 'react';

import { ProductProvider } from './context/ProductContext';
import ModernSidebar from './components/ModernSidebar';
import Dashboard from './pages/Dashboard';
import ShopeeAffiliatePage from './pages/ShopeeAffiliatePage';
import ShopeeVideoPage from './pages/ShopeeVideoPage';
import PinterestAutomationPage from './pages/PinterestAutomationPage';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminDashboardPage from './pages/AdminDashboardPage';

const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);

  // Extract active tab from URL: /dashboard/analytics -> analytics
  const getTabFromPath = (path: string) => {
    if (path.startsWith('/dashboard/')) {
      return path.replace('/dashboard/', '');
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath(window.location.pathname));

  // Sync activeTab with URL
  React.useEffect(() => {
    const handleRouteChange = () => {
      const path = window.location.pathname;
      setCurrentRoute(path);
      if (path.startsWith('/dashboard')) {
        setActiveTab(getTabFromPath(path));
      }
    };
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  // Function to update tab and URL
  const handleSetActiveTab = (tab: string) => {
    setActiveTab(tab);
    const newPath = tab === 'dashboard' ? '/dashboard' : `/dashboard/${tab}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState(null, '', newPath);
    }
  };

  const getHeaderTitle = (tab: string) => {
    switch (tab) {
      case 'create': return 'Cadastro de Produto';
      case 'settings': return 'Configurações ML';
      case 'shopee_settings': return 'Configurações Shopee (Vendedor)';
      case 'shopee_affiliate': return 'Shopee Afiliado';
      case 'shopee_video': return 'Shopee Vídeo';
      case 'automation_accounts': return 'Minhas Contas de Automação';
      case 'telegram_automation': return 'Automação Telegram';
      case 'whatsapp_automation': return 'Automação WhatsApp';
      case 'facebook_automation': return 'Automação Facebook';
      case 'instagram_automation': return 'Automação Instagram';
      case 'pinterest_automation': return 'Pinterest';
      case 'tutorials': return 'Tutoriais de Conexão';
      case 'schedules': return 'Gerenciar Agendamentos';
      case 'analytics': return 'Analytics Dashboard';
      case 'logs': return 'Logs do Sistema';
      case 'inbox': return 'Caixa de Mensagens';
      case 'ai_agents': return 'Agentes de IA (Gemini)';
      case 'comment_automations': return 'Automação de Comentários';
      default: return 'Dashboard';
    }
  }

  // Route to Landing Page
  if (currentRoute === '/') {
    return <LandingPage />;
  }

  // Route to Login Page
  if (currentRoute === '/login') {
    return <LoginPage />;
  }

  // Route to Register Page
  if (currentRoute === '/register') {
    return <RegisterPage />;
  }

  // Route to Admin Dashboard
  if (currentRoute === '/admin') {
    const userData = localStorage.getItem('user');
    const user = userData ? JSON.parse(userData) : null;

    if (user?.role === 'admin') {
      return <AdminDashboardPage />;
    } else {
      // Redirect to dashboard if not admin
      window.location.href = '/';
      return null;
    }
  }

  // Main App (Dashboard)
  return (
    <ProductProvider>
      <div className="min-h-screen bg-gradient-premium flex font-sans text-gray-800">
        <ModernSidebar activeTab={activeTab} setActiveTab={handleSetActiveTab} />
        <main className="flex-1 ml-72 p-8 transition-all duration-300">
          {activeTab !== 'dashboard' && (
            <header className="mb-8 flex justify-between items-center">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 capitalize">
                  {getHeaderTitle(activeTab)}
                </h1>
                <p className="text-gray-500 text-sm mt-1">Painel de Integração Oficial Mercado Livre & Shopee</p>
              </div>
              <div className="flex space-x-2">
                <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold rounded uppercase tracking-wide">
                  Ambiente de Teste
                </span>
              </div>
            </header>
          )}
          <Dashboard activeTab={activeTab} setActiveTab={handleSetActiveTab} />
        </main>
      </div>
    </ProductProvider>
  );
};

export default App;