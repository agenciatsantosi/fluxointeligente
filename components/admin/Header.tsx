import React, { useState, useEffect, useRef } from 'react';
import { Search, Bell, User, MessageCircle, RefreshCw, X, Check, Trash2 } from 'lucide-react';
import axios from 'axios';
// Helper para tempo relativo sem dependências externas
const getRelativeTime = (timestamp: string) => {
  const now = new Date();
  const past = new Date(timestamp);
  const diffInMs = now.getTime() - past.getTime();
  const diffInSecs = Math.floor(diffInMs / 1000);
  const diffInMins = Math.floor(diffInSecs / 60);
  const diffInHours = Math.floor(diffInMins / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInSecs < 60) return 'Agora mesmo';
  if (diffInMins < 60) return `Há ${diffInMins} min`;
  if (diffInHours < 24) return `Há ${diffInHours}h`;
  if (diffInDays === 1) return 'Ontem';
  return past.toLocaleDateString('pt-BR');
};

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  module: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

interface HeaderProps {
  loading: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (auto: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ loading, onRefresh, autoRefresh, setAutoRefresh }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [shouldShake, setShouldShake] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevUnreadCount = useRef(0);

  // Som de notificação (Base64 simplificado)
  const playNotificationSound = () => {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
    oscillator.frequency.exponentialRampToValueAtTime(1320, audioContext.currentTime + 0.1); // E6

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  };

  const fetchNotifications = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.success) {
        setNotifications(response.data.notifications);
        const newUnreadCount = response.data.unread;
        
        // Se o número de não lidas aumentou, dispara o alerta
        if (newUnreadCount > prevUnreadCount.current) {
          playNotificationSound();
          setShouldShake(true);
          setTimeout(() => setShouldShake(false), 1000);
        }
        
        setUnreadCount(newUnreadCount);
        prevUnreadCount.current = newUnreadCount;
      }
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 5000); // Polling cada 5s
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post('/api/notifications/mark-read', { id }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const clearAll = async () => {
    if (!window.confirm('Deseja limpar todas as notificações?')) return;
    try {
      const token = localStorage.getItem('token');
      await axios.delete('/api/notifications/clear', {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchNotifications();
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  };

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'instagram': return '📸';
      case 'facebook': return '📘';
      case 'whatsapp': return '🟢';
      case 'shopee': return '🟠';
      case 'telegram': return '✈️';
      default: return '🔔';
    }
  };
  return (
    <header className="sticky top-0 z-[999] h-20 bg-[#0A0E27]/80 backdrop-blur-2xl border-b border-[#6366F1]/10 px-8 flex items-center justify-between shadow-xl shadow-black/20">
      
      {/* Search Bar */}
      <div className="relative group w-[400px] hidden md:block">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9CA3AF] group-focus-within:text-[#6366F1] transition-colors" size={20} />
        <input 
          type="text" 
          placeholder="Busca avançada (Cmd + K)" 
          className="w-full h-12 bg-[#1E2139]/60 border border-[#6366F1]/20 rounded-xl pl-12 pr-4 text-[#F9FAFB] placeholder-[#9CA3AF] focus:outline-none focus:border-[#6366F1] focus:bg-[#1E2139] focus:ring-4 focus:ring-[#6366F1]/10 transition-all"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        
        {/* Refresh Control */}
        <div className="flex items-center gap-3 bg-[#1E2139]/60 p-1.5 rounded-xl border border-[#6366F1]/10">
          <button 
            onClick={onRefresh}
            className={`p-2 rounded-lg hover:bg-[#6366F1]/20 transition-all ${loading ? 'animate-spin' : ''}`}
            title="Sincronizar dados"
          >
            <RefreshCw size={18} className="text-[#6366F1]" />
          </button>
          
          <label className="flex items-center gap-2 px-2 cursor-pointer select-none">
            <div className="relative">
              <input 
                type="checkbox" 
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-10 h-5 bg-[#252A45] rounded-full peer peer-checked:bg-[#6366F1] transition-colors" />
              <div className="absolute left-1 top-1 w-3 h-3 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
            </div>
            <span className="text-xs font-bold text-[#9CA3AF] uppercase tracking-tighter">Auto</span>
          </label>
        </div>

        {/* Notifications */}
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className={`relative w-12 h-12 flex items-center justify-center bg-[#1E2139]/60 border border-[#6366F1]/20 rounded-xl hover:bg-[#6366F1]/20 transition-all ${showDropdown ? 'bg-[#6366F1]/20 ring-2 ring-[#6366F1]/40' : ''} ${shouldShake ? 'animate-bell-ring' : ''}`}
          >
            <Bell size={20} className={unreadCount > 0 ? 'text-[#6366F1]' : 'text-[#E5E7EB]'} />
            {unreadCount > 0 && (
              <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#EF4444] border-2 border-[#0A0E27] rounded-full animate-pulse" />
            )}
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-3 w-96 bg-[#161B33] border border-[#6366F1]/20 rounded-2xl shadow-2xl overflow-hidden z-[1000] animate-in fade-in slide-in-from-top-4 duration-200">
              <div className="p-4 bg-[#1E2139]/80 border-b border-[#6366F1]/10 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider">Notificações</h3>
                  <p className="text-[10px] text-[#9CA3AF] font-bold">{unreadCount} não lidas</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => markAsRead('all')}
                    className="p-1.5 rounded-lg hover:bg-[#10B981]/10 text-[#10B981] transition-colors"
                    title="Marcar todas como lidas"
                  >
                    <Check size={16} />
                  </button>
                  <button 
                    onClick={clearAll}
                    className="p-1.5 rounded-lg hover:bg-[#EF4444]/10 text-[#EF4444] transition-colors"
                    title="Limpar todas"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-12 text-center">
                    <div className="w-12 h-12 bg-[#1E2139] rounded-xl flex items-center justify-center mx-auto mb-3">
                      <Bell size={24} className="text-[#374151]" />
                    </div>
                    <p className="text-xs font-bold text-[#4B5563] uppercase tracking-widest">Sem notificações</p>
                  </div>
                ) : (
                  notifications.map((n) => (
                    <div 
                      key={n.id} 
                      onClick={() => !n.read && markAsRead(n.id)}
                      className={`p-4 border-b border-[#6366F1]/5 hover:bg-[#6366F1]/5 transition-all cursor-pointer group relative ${!n.read ? 'bg-[#6366F1]/5' : ''}`}
                    >
                      <div className="flex gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-inner ${
                          n.type === 'error' ? 'bg-red-500/10' : 
                          n.type === 'success' ? 'bg-green-500/10' : 
                          'bg-[#6366F1]/10'
                        }`}>
                          {getModuleIcon(n.module)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className={`text-xs font-black uppercase truncate pr-4 ${
                              n.type === 'error' ? 'text-red-400' : 
                              n.type === 'success' ? 'text-green-400' : 
                              'text-white'
                            }`}>
                              {n.title}
                            </h4>
                            <span className="text-[10px] text-[#4B5563] font-bold whitespace-nowrap">
                              {getRelativeTime(n.timestamp)}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#9CA3AF] font-medium leading-relaxed">
                            {n.message}
                          </p>
                        </div>
                      </div>
                      {!n.read && (
                        <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-[#6366F1] rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                      )}
                    </div>
                  ))
                )}
              </div>
              
              {notifications.length > 0 && (
                <div className="p-3 bg-[#1E2139]/40 text-center">
                  <button className="text-[10px] font-black text-[#6366F1] uppercase tracking-widest hover:underline">
                    Ver Histórico Completo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Messages */}
        <button className="w-12 h-12 flex items-center justify-center bg-[#1E2139]/60 border border-[#6366F1]/20 rounded-xl hover:bg-[#6366F1]/20 transition-all">
          <MessageCircle size={20} className="text-[#E5E7EB]" />
        </button>

        {/* User Profile */}
        <div className="flex items-center gap-3 p-1.5 bg-[#1E2139]/60 border border-[#6366F1]/20 rounded-xl hover:border-[#6366F1]/40 transition-all cursor-pointer group">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-[#6366F1] to-[#764BA2] p-[2px] shadow-lg shadow-indigo-500/20">
            <div className="w-full h-full rounded-[6px] bg-[#1E2139] flex items-center justify-center">
              <User size={18} className="text-[#F9FAFB]" />
            </div>
          </div>
          <div className="hidden lg:block">
            <p className="text-sm font-bold text-[#F9FAFB] leading-tight">Admin</p>
            <p className="text-[10px] text-[#10B981] font-bold uppercase">Online Now</p>
          </div>
        </div>

      </div>
    </header>
  );
};

export default Header;

// CSS Animations
const style = document.createElement('style');
style.textContent = `
  @keyframes bell-ring {
    0% { transform: rotate(0); }
    10% { transform: rotate(15deg); }
    20% { transform: rotate(-15deg); }
    30% { transform: rotate(10deg); }
    40% { transform: rotate(-10deg); }
    50% { transform: rotate(5deg); }
    60% { transform: rotate(-5deg); }
    70% { transform: rotate(0); }
    100% { transform: rotate(0); }
  }
  .animate-bell-ring {
    animation: bell-ring 0.6s ease-in-out;
  }
`;
document.head.appendChild(style);
