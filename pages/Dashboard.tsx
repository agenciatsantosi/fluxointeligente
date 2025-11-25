import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ShopeeAffiliatePage from './ShopeeAffiliatePage';
import TelegramAutomationPage from './TelegramAutomationPage';
import WhatsAppAutomationPage from './WhatsAppAutomationPage';
import FacebookAutomationPage from './FacebookAutomationPage';
import InstagramAutomationPage from './InstagramAutomationPage';
import AnalyticsPage from './AnalyticsPage';
import LogsAuditPage from './LogsAuditPage';
import SchedulesPage from './SchedulesPage';
import ShopeeConfig from '../components/ShopeeConfig';
import { MessageCircle, Send, Calendar, TrendingUp, Instagram, Facebook, Bot, Activity } from 'lucide-react';

interface DashboardProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ activeTab, setActiveTab }) => {
  const [stats, setStats] = useState({
    totalSends: 0,
    whatsappSends: 0,
    telegramSends: 0,
    facebookSends: 0,
    instagramVideos: 0,
    activeSchedules: 0,
    successRate: 0
  });
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load analytics stats
      const analyticsRes = await axios.get('http://localhost:3001/api/analytics/dashboard?days=7');
      if (analyticsRes.data.success) {
        setStats({
          totalSends: analyticsRes.data.stats.totalSends || 0,
          whatsappSends: analyticsRes.data.stats.whatsappSends || 0,
          telegramSends: analyticsRes.data.stats.telegramSends || 0,
          facebookSends: analyticsRes.data.stats.facebookSends || 0,
          instagramVideos: 0, // Will load from Instagram queue
          activeSchedules: 0, // Will load from schedules
          successRate: analyticsRes.data.stats.successRate || 0
        });
      }

      // Load Instagram videos count
      const instagramRes = await axios.get('http://localhost:3001/api/instagram/queue');
      if (instagramRes.data.success) {
        setStats(prev => ({
          ...prev,
          instagramVideos: instagramRes.data.queue.filter((v: any) => v.status === 'pending').length
        }));
      }

      // Load active schedules count
      const schedulesRes = await axios.get('http://localhost:3001/api/schedules');
      if (schedulesRes.data.success) {
        setStats(prev => ({
          ...prev,
          activeSchedules: schedulesRes.data.schedules.filter((s: any) => s.active).length
        }));
      }

      // Load recent logs
      const logsRes = await axios.get('http://localhost:3001/api/logs?limit=5');
      if (logsRes.data.success) {
        setRecentLogs(logsRes.data.logs);
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  // Route to different pages
  if (activeTab === 'shopee_affiliate') return <ShopeeAffiliatePage />;
  if (activeTab === 'telegram_automation') return <TelegramAutomationPage />;
  if (activeTab === 'whatsapp_automation') return <WhatsAppAutomationPage />;
  if (activeTab === 'facebook_automation') return <FacebookAutomationPage />;
  if (activeTab === 'instagram_automation') return <InstagramAutomationPage />;
  if (activeTab === 'analytics') return <AnalyticsPage />;
  if (activeTab === 'shopee_settings') return <ShopeeConfig />;
  if (activeTab === 'logs') return <LogsAuditPage />;
  if (activeTab === 'schedules') return <SchedulesPage />;

  // Main Dashboard View
  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-blue-600 rounded-2xl p-8 text-white">
        <h1 className="text-3xl font-bold mb-2">Dashboard MeliFlow</h1>
        <p className="text-white/80">Painel de Integração Oficial Mercado Livre & Shopee</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Sends */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-purple-100 rounded-lg">
              <Send className="text-purple-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Últimos 7 dias</span>
          </div>
          <h3 className="text-3xl font-bold text-gray-900">{stats.totalSends}</h3>
          <p className="text-sm text-gray-600 mt-1">Total de Envios</p>
        </div>

        {/* WhatsApp */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-green-100 rounded-lg">
              <MessageCircle className="text-green-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">WhatsApp</span>
          </div>
          <h3 className="text-3xl font-bold text-green-600">{stats.whatsappSends}</h3>
          <p className="text-sm text-gray-600 mt-1">Mensagens Enviadas</p>
        </div>

        {/* Telegram */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-blue-100 rounded-lg">
              <Bot className="text-blue-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Telegram</span>
          </div>
          <h3 className="text-3xl font-bold text-blue-600">{stats.telegramSends}</h3>
          <p className="text-sm text-gray-600 mt-1">Mensagens Enviadas</p>
        </div>

        {/* Facebook */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-indigo-100 rounded-lg">
              <Facebook className="text-indigo-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Facebook</span>
          </div>
          <h3 className="text-3xl font-bold text-indigo-600">{stats.facebookSends}</h3>
          <p className="text-sm text-gray-600 mt-1">Posts Publicados</p>
        </div>

        {/* Instagram */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-pink-100 rounded-lg">
              <Instagram className="text-pink-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Instagram</span>
          </div>
          <h3 className="text-3xl font-bold text-pink-600">{stats.instagramVideos}</h3>
          <p className="text-sm text-gray-600 mt-1">Vídeos na Fila</p>
        </div>

        {/* Active Schedules */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-orange-100 rounded-lg">
              <Calendar className="text-orange-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Agendamentos</span>
          </div>
          <h3 className="text-3xl font-bold text-orange-600">{stats.activeSchedules}</h3>
          <p className="text-sm text-gray-600 mt-1">Ativos</p>
        </div>

        {/* Success Rate */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition">
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-emerald-100 rounded-lg">
              <TrendingUp className="text-emerald-600" size={24} />
            </div>
            <span className="text-xs text-gray-500">Performance</span>
          </div>
          <h3 className="text-3xl font-bold text-emerald-600">{stats.successRate.toFixed(1)}%</h3>
          <p className="text-sm text-gray-600 mt-1">Taxa de Sucesso</p>
        </div>

        {/* Quick Actions */}
        <div className="bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-sm p-6 text-white hover:shadow-md transition cursor-pointer"
          onClick={() => setActiveTab('whatsapp_automation')}>
          <div className="flex items-center justify-between mb-4">
            <div className="p-3 bg-white/20 rounded-lg">
              <MessageCircle className="text-white" size={24} />
            </div>
          </div>
          <h3 className="text-2xl font-bold">Enviar Agora</h3>
          <p className="text-sm text-white/80 mt-1">Automação WhatsApp</p>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Activity size={24} className="text-purple-600" />
            Atividade Recente
          </h2>
          <button
            onClick={() => setActiveTab('logs')}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium"
          >
            Ver todos →
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto"></div>
            <p className="mt-2">Carregando...</p>
          </div>
        ) : recentLogs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Activity size={48} className="mx-auto mb-2 opacity-50" />
            <p>Nenhuma atividade recente</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentLogs.map((log, index) => (
              <div key={index} className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition">
                <div className={`p-2 rounded-lg ${log.status === 'success' ? 'bg-green-100' :
                    log.status === 'error' ? 'bg-red-100' : 'bg-blue-100'
                  }`}>
                  {log.platform === 'whatsapp' && <MessageCircle size={20} className="text-green-600" />}
                  {log.platform === 'telegram' && <Bot size={20} className="text-blue-600" />}
                  {log.platform === 'facebook' && <Facebook size={20} className="text-indigo-600" />}
                  {log.platform === 'instagram' && <Instagram size={20} className="text-pink-600" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{log.action}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(log.timestamp).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${log.status === 'success' ? 'bg-green-100 text-green-700' :
                    log.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'
                  }`}>
                  {log.status === 'success' ? '✓ Sucesso' : log.status === 'error' ? '✗ Erro' : 'ℹ Info'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => setActiveTab('whatsapp_automation')}
          className="p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-green-500 hover:shadow-md transition text-left group"
        >
          <MessageCircle className="text-green-600 mb-3 group-hover:scale-110 transition" size={32} />
          <h3 className="font-bold text-gray-900">WhatsApp</h3>
          <p className="text-sm text-gray-500 mt-1">Automação de mensagens</p>
        </button>

        <button
          onClick={() => setActiveTab('telegram_automation')}
          className="p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-blue-500 hover:shadow-md transition text-left group"
        >
          <Bot className="text-blue-600 mb-3 group-hover:scale-110 transition" size={32} />
          <h3 className="font-bold text-gray-900">Telegram</h3>
          <p className="text-sm text-gray-500 mt-1">Bot de automação</p>
        </button>

        <button
          onClick={() => setActiveTab('facebook_automation')}
          className="p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-indigo-500 hover:shadow-md transition text-left group"
        >
          <Facebook className="text-indigo-600 mb-3 group-hover:scale-110 transition" size={32} />
          <h3 className="font-bold text-gray-900">Facebook</h3>
          <p className="text-sm text-gray-500 mt-1">Publicação automática</p>
        </button>

        <button
          onClick={() => setActiveTab('instagram_automation')}
          className="p-6 bg-white rounded-xl border-2 border-gray-200 hover:border-pink-500 hover:shadow-md transition text-left group"
        >
          <Instagram className="text-pink-600 mb-3 group-hover:scale-110 transition" size={32} />
          <h3 className="font-bold text-gray-900">Instagram</h3>
          <p className="text-sm text-gray-500 mt-1">Upload de vídeos</p>
        </button>
      </div>
    </div>
  );
};

export default Dashboard;