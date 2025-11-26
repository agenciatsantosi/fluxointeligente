import React, { useState } from 'react';
import { ProductProvider } from './context/ProductContext';
import ModernSidebar from './components/ModernSidebar';
import Dashboard from './pages/Dashboard';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const getHeaderTitle = (tab: string) => {
    switch (tab) {
      case 'create': return 'Cadastro de Produto';
      case 'settings': return 'Configurações ML';
      case 'shopee_settings': return 'Configurações Shopee (Vendedor)';
      case 'shopee_affiliate': return 'Painel Afiliado Shopee';
      case 'telegram_automation': return 'Automação Telegram';
      case 'whatsapp_automation': return 'Automação WhatsApp';
      case 'facebook_automation': return 'Automação Facebook';
      case 'instagram_automation': return 'Automação Instagram';
      case 'schedules': return 'Gerenciar Agendamentos';
      case 'analytics': return 'Analytics Dashboard';
      case 'logs': return 'Logs do Sistema';
      default: return 'Dashboard';
    }
  }

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