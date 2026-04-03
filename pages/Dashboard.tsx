import React, { useEffect, useState } from 'react';
import api from '../services/api';
import TelegramAutomationPage from './TelegramAutomationPage';
import WhatsAppAutomationPage from './WhatsAppAutomationPage';
import FacebookAutomationPage from './FacebookAutomationPage';
import InstagramAutomationPage from './InstagramAutomationPage';
import PinterestAutomationPage from './PinterestAutomationPage';
import TwitterAutomationPage from './TwitterAutomationPage';
import AutomationAccountsPage from './AutomationAccountsPage';
import TutorialsPage from './TutorialsPage';
import AnalyticsPage from './AnalyticsPage';
import LogsAuditPage from './LogsAuditPage';
import SchedulesPage from './SchedulesPage';
import InboxPage from './InboxPage';
import AIAgentsPage from './AIAgentsPage';
import CommentAutomationPage from './CommentAutomationPage';
import MediaDownloaderPage from './MediaDownloaderPage';

import ShopeeCentralPage from './ShopeeCentralPage';
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
      const analyticsRes = await api.get('/analytics/dashboard?days=7');
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
      const instagramRes = await api.get(`/instagram/queue?status=pending&_t=${Date.now()}`);
      if (instagramRes.data.success) {
        setStats(prev => ({
          ...prev,
          instagramVideos: instagramRes.data.queue.filter((v: any) => v.status === 'pending').length
        }));
      }

      // Load active schedules count
      const schedulesRes = await api.get('/schedules');
      if (schedulesRes.data.success) {
        setStats(prev => ({
          ...prev,
          activeSchedules: schedulesRes.data.schedules.filter((s: any) => s.active).length
        }));
      }

      // Load recent logs
      const logsRes = await api.get('/logs?limit=5');
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
  if (activeTab === 'automation_accounts') return <AutomationAccountsPage setActiveTab={setActiveTab} />;
  
  // Shopee Central (Unified)
  if (activeTab === 'shopee_central' || activeTab === 'shopee_affiliate' || activeTab === 'shopee_video' || activeTab === 'shopee_settings') {
    return <ShopeeCentralPage />;
  }

  if (activeTab === 'telegram_automation') return <TelegramAutomationPage />;
  if (activeTab === 'whatsapp_automation') return <WhatsAppAutomationPage />;
  if (activeTab === 'facebook_automation') return <FacebookAutomationPage setActiveTab={setActiveTab} />;
  if (activeTab === 'instagram_automation') return <InstagramAutomationPage setActiveTab={setActiveTab} />;
  if (activeTab === 'pinterest_automation') return <PinterestAutomationPage />;
  if (activeTab === 'twitter_automation') return <TwitterAutomationPage />;
  if (activeTab === 'ai_agents') return <AIAgentsPage />;
  if (activeTab === 'tutorials') return <TutorialsPage />;
  if (activeTab === 'analytics') return <AnalyticsPage />;
  if (activeTab === 'logs') return <LogsAuditPage />;
  if (activeTab === 'schedules') return <SchedulesPage />;
  if (activeTab === 'inbox') return <InboxPage />;
  if (activeTab === 'comment_automations') return <CommentAutomationPage />;
  if (activeTab === 'downloader') return <MediaDownloaderPage />;

  // Main Dashboard View
  return <ModernDashboard setActiveTab={setActiveTab} />;
};

export default Dashboard;