import React, { useEffect, useState } from 'react';
import axios from 'axios';
import ShopeeAffiliatePage from './ShopeeAffiliatePage';
import ShopeeVideoPage from './ShopeeVideoPage';
import TelegramAutomationPage from './TelegramAutomationPage';
import WhatsAppAutomationPage from './WhatsAppAutomationPage';
import FacebookAutomationPage from './FacebookAutomationPage';
import InstagramAutomationPage from './InstagramAutomationPage';
import PinterestAutomationPage from './PinterestAutomationPage';
import AnalyticsPage from './AnalyticsPage';
import LogsAuditPage from './LogsAuditPage';
import SchedulesPage from './SchedulesPage';
import ShopeeConfig from '../components/ShopeeConfig';
import ModernDashboard from './ModernDashboard';
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
  if (activeTab === 'shopee_video') return <ShopeeVideoPage />;
  if (activeTab === 'telegram_automation') return <TelegramAutomationPage />;
  if (activeTab === 'whatsapp_automation') return <WhatsAppAutomationPage />;
  if (activeTab === 'facebook_automation') return <FacebookAutomationPage />;
  if (activeTab === 'instagram_automation') return <InstagramAutomationPage />;
  if (activeTab === 'pinterest_automation') return <PinterestAutomationPage />;
  if (activeTab === 'analytics') return <AnalyticsPage />;
  if (activeTab === 'shopee_settings') return <ShopeeConfig />;
  if (activeTab === 'logs') return <LogsAuditPage />;
  if (activeTab === 'schedules') return <SchedulesPage />;

  // Main Dashboard View
  return <ModernDashboard />;
};

export default Dashboard;