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

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);

  // Simple routing based on URL
  React.useEffect(() => {
    const handleRouteChange = () => {
      setCurrentRoute(window.location.pathname);
    };
    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  const getHeaderTitle = (tab: string) => {
    switch (tab) {
      case 'create': return 'Cadastro de Produto';
      case 'settings': return 'Configurações ML';
      case 'shopee_settings': return 'Configurações Shopee (Vendedor)';
      case 'shopee_affiliate': return 'Shopee Afiliado';
      case 'shopee_video': return 'Shopee Vídeo';
      case 'telegram_automation': return 'Automação Telegram';
      case 'whatsapp_automation': return 'Automação WhatsApp';
      case 'facebook_automation': return 'Automação Facebook';
      case 'instagram_automation': return 'Automação Instagram';
      case 'pinterest_automation': return 'Pinterest';
      case 'schedules': return 'Gerenciar Agendamentos';
      case 'analytics': return 'Analytics Dashboard';
      case 'logs': return 'Logs do Sistema';
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

  // Main App (Dashboard)
  return (
    <ProductProvider>
      <div className="min-h-screen bg-gradient-premium flex font-sans text-gray-800">
        <ModernSidebar activeTab={activeTab} setActiveTab={setActiveTab} />
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
          <Dashboard activeTab={activeTab} setActiveTab={setActiveTab} />
        </main>
      </div>
    </ProductProvider>
  );
};

export default App;