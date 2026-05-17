import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, Zap } from 'lucide-react';
import { MotionPageTransition } from './components/MotionComponents';

import { ProductProvider } from './context/ProductContext';
import { AlertProvider } from './context/AlertContext';
import { NotificationProvider } from './context/NotificationContext';
import ModernSidebar from './components/ModernSidebar';
import Dashboard from './pages/Dashboard';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import PublicVitrinePage from './pages/PublicVitrinePage';

const App: React.FC = () => {
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Extract active tab from URL: /dashboard/analytics -> analytics
  const getTabFromPath = (path: string) => {
    if (path.startsWith('/dashboard/')) {
      return path.replace('/dashboard/', '');
    }
    return 'dashboard';
  };

  const [activeTab, setActiveTab] = useState(getTabFromPath(window.location.pathname));
  const [redirecting, setRedirecting] = useState(false);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  // Sync activeTab with URL & process short link redirects
  React.useEffect(() => {
    // Check if '?video=...' is in URL
    const params = new URLSearchParams(window.location.search);
    const videoSlug = params.get('video');

    if (videoSlug) {
      setRedirecting(true);
      
      // Perform public api fetch for target URL
      fetch(`/api/public/short-links/${videoSlug}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.targetUrl) {
            // Success! Redirect directly to Shopee/destination
            window.location.replace(data.targetUrl);
          } else if (data.expired) {
            setRedirectError('Este link de afiliado atingiu o limite de acessos ou expirou.');
          } else {
            setRedirectError('Link não encontrado ou inválido.');
            setTimeout(() => {
              setRedirecting(false);
              setRedirectError(null);
            }, 3000);
          }
        })
        .catch(err => {
          console.error('[REDIRECT] Error performing redirect:', err);
          setRedirectError('Erro ao processar redirecionamento.');
          setTimeout(() => {
            setRedirecting(false);
            setRedirectError(null);
          }, 3000);
        });
    }

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
      case 'shopee_central': return 'Central Shopee';
      case 'automation_accounts': return 'Minhas Contas de Automação';
      case 'telegram_automation': return 'Automação Telegram';
      case 'whatsapp_automation': return 'Automação WhatsApp';
      case 'facebook_automation': return 'Automação Facebook';
      case 'instagram_automation': return 'Automação Instagram';
      case 'threads_automation': return 'Automação Threads';
      case 'pinterest_automation': return 'Pinterest';
      case 'twitter_automation': return 'Twitter';
      case 'youtube_automation': return 'Automação YouTube';
      case 'tutorials': return 'Tutoriais de Conexão';
      case 'schedules': return 'Gerenciar Agendamentos';
      case 'analytics': return 'Analytics Dashboard';
      case 'logs': return 'Logs do Sistema';
      case 'inbox': return 'Caixa de Mensagens';
      case 'ai_agents': return 'Agentes de IA (Gemini)';
      case 'comment_automations': return 'Automação de Comentários';
      case 'downloader': return 'Downloader Elite';
      case 'system_settings': return 'Configurações Regionais';
      case 'history': return 'Histórico de Envíos';
      case 'roadmap': return 'Roadmap Geral do Sistema';
      default: return 'Dashboard';
    }
  }

  if (redirecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="bg-white border border-gray-100 rounded-3xl p-10 max-w-sm w-full text-center space-y-6 shadow-2xl shadow-gray-200">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping"></div>
            <div className="w-16 h-16 border-2 border-purple-600 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <div>
            <h3 className="text-sm font-black text-purple-600 uppercase tracking-widest font-mono">[ PROCESSANDO REDIRECIONAMENTO ]</h3>
            <p className="text-xs text-gray-500 font-mono mt-2">
              {redirectError ? redirectError : 'Redirecionando com segurança para a página do produto...'}
            </p>
          </div>
          {redirectError && (
            <button 
              onClick={() => { setRedirecting(false); setRedirectError(null); }}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-purple-100"
            >
              Ir para Home
            </button>
          )}
        </motion.div>
      </div>
    );
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

  // Route for Public Vitrine
  if (currentRoute.startsWith('/vitrine/')) {
    return <PublicVitrinePage />;
  }

  // Main App (Dashboard)
  return (
    <AlertProvider>
      <NotificationProvider>
        <ProductProvider>
          <div className="min-h-screen bg-gray-50 flex font-sans text-gray-800">
          {/* Backdrop for mobile */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsMobileMenuOpen(false)}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[55] lg:hidden"
              />
            )}
          </AnimatePresence>

          <ModernSidebar 
            activeTab={activeTab} 
            setActiveTab={handleSetActiveTab} 
            isOpen={isMobileMenuOpen}
            onClose={() => setIsMobileMenuOpen(false)}
          />

          {/* Professional Mobile Header */}
          <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 z-[40] flex items-center justify-between px-6">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-tr from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-100">
                <Zap className="text-white w-5 h-5 fill-white" />
              </div>
              <span className="font-black text-gray-900 text-lg tracking-tight">Fluxo<span className="text-indigo-600">Inteligente</span></span>
            </div>
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2.5 hover:bg-gray-100 rounded-xl transition-all duration-200 text-gray-500 active:scale-95"
            >
              <Menu size={24} />
            </button>
          </div>

          <main className="flex-1 ml-0 lg:ml-[280px] transition-all duration-300 pt-16 lg:pt-0">
            <div className="p-4 md:p-8">
              {activeTab !== 'dashboard' && (
                <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-gray-200 pb-6 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="h-1 w-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"></div>
                      <span className="text-[10px] font-medium text-purple-500 uppercase tracking-[0.3em]">Módulo</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-800 tracking-tight">
                      {getHeaderTitle(activeTab)}
                    </h1>
                  </div>
                  <div className="flex flex-col items-start sm:items-end gap-2">
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
      </NotificationProvider>
    </AlertProvider>
  );
};

export default App;