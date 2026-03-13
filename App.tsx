import React, { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { MotionPageTransition } from './components/MotionComponents';

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
      <div className="min-h-screen bg-gray-50 flex font-sans text-gray-800">
        <ModernSidebar activeTab={activeTab} setActiveTab={handleSetActiveTab} />
        <main className="flex-1 ml-[280px] transition-all duration-300">
          <div className="p-8">
            {activeTab !== 'dashboard' && (
              <header className="mb-8 flex justify-between items-end border-b border-gray-200 pb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="h-1 w-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                    <span className="text-[10px] font-medium text-purple-500 uppercase tracking-[0.3em]">Módulo</span>
                  </div>
                  <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
                    {getHeaderTitle(activeTab)}
                  </h1>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 border border-purple-200 rounded-lg">
                    <span className="text-[10px] text-purple-600 font-medium uppercase tracking-wider">
                      v1.0.4 · Stable
                    </span>
                  </div>
                  <span className="text-[9px] text-gray-400 uppercase">Uptime: 99.9% / Latência: 42ms</span>
                </div>
              </header>
            )}
            
            <AnimatePresence mode="wait">
              <MotionPageTransition key={activeTab}>
                <Dashboard activeTab={activeTab} setActiveTab={handleSetActiveTab} />
              </MotionPageTransition>
            </AnimatePresence>
          </div>
        </main>
      </div>
    </ProductProvider>
  );
};

export default App;