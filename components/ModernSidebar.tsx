import React, { useEffect, useState } from 'react';
import api from '../services/api';
import axios from 'axios';
import {
    LayoutDashboard,
    PlusCircle,
    Settings,
    ShoppingBag,
    MessageCircle,
    Send,
    Facebook,
    Instagram,
    Pin,
    Calendar,
    BarChart2,
    Upload,
    FileText,
    LogOut,
    Zap,
    Video,
    Twitter,
    BookOpen,
    Settings2
} from 'lucide-react';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const ModernSidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const [disabledFeatures, setDisabledFeatures] = useState<Record<string, boolean>>({});
    const [unreadCount, setUnreadCount] = useState<number>(0);

    const playNotificationSound = () => {
        try {
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            const playNote = (frequency: number, startTime: number, duration: number) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.connect(gain);
                gain.connect(ctx.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(frequency, startTime);

                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playNote(523.25, now, 0.4); // C5
            playNote(659.25, now + 0.15, 0.6); // E5
        } catch (e) {
            console.error('Audio play failed:', e);
        }
    };

    useEffect(() => {
        const fetchUnreadCount = async () => {
            try {
                const userData = localStorage.getItem('user');
                const token = localStorage.getItem('authToken');
                if (userData && token) {
                    const response = await api.get('/inbox/conversations');
                    if (response.data.success) {
                        const readTimestamps = JSON.parse(localStorage.getItem('inbox_read_timestamps') || '{}');
                        const convs = response.data.conversations;

                        let totalUnread = 0;
                        convs.forEach((c: any) => {
                            if (c.unread || c.unreadCount > 0) {
                                const clearedAt = readTimestamps[c.id];
                                if (clearedAt && c.rawTimestamp) {
                                    const messageTime = new Date(c.rawTimestamp).getTime();
                                    if (messageTime <= clearedAt + 5000) {
                                        return; // considered read by local cache
                                    }
                                }
                                totalUnread += (c.unreadCount || 1);
                            }
                        });

                        setUnreadCount(prev => {
                            if (totalUnread > prev && totalUnread > 0) {
                                playNotificationSound();
                            }
                            return totalUnread;
                        });
                    }
                }
            } catch (error) {
                console.error('Error fetching unread count:', error);
            }
        };

        fetchUnreadCount();
        const intervalId = setInterval(fetchUnreadCount, 30000); // Poll every 30s
        return () => clearInterval(intervalId);
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // Only fetch if user is logged in
                const userData = localStorage.getItem('user');
                if (userData) {
                    const response = await axios.get('/api/admin/public-settings');
                    if (response.data.success) {
                        const settings = response.data.settings;
                        const disabled: Record<string, boolean> = {};

                        Object.keys(settings).forEach(key => {
                            if (settings[key] === 'false' || settings[key] === false) {
                                disabled[key] = true;
                            }
                        });
                        setDisabledFeatures(disabled);
                    }
                }
            } catch (error) {
                console.error('Error fetching system settings:', error);
            }
        };

        fetchSettings();
    }, []);

    // Sync activeTab with URL for sidebar highlighting
    useEffect(() => {
        const handleLocationChange = () => {
            const path = window.location.pathname;
            if (path.startsWith('/dashboard/')) {
                const tab = path.replace('/dashboard/', '');
                if (tab !== activeTab) {
                    setActiveTab(tab);
                }
            } else if (path === '/dashboard') {
                if ('dashboard' !== activeTab) {
                    setActiveTab('dashboard');
                }
            }
        };

        window.addEventListener('popstate', handleLocationChange);
        // Initial sync
        handleLocationChange();

        return () => window.removeEventListener('popstate', handleLocationChange);
    }, [activeTab, setActiveTab]);

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'ai_agents', label: 'Agentes de IA', icon: Zap },
        { id: 'comment_automations', label: 'Robô Comentários', icon: MessageCircle },
        { id: 'analytics', label: 'Analytics', icon: BarChart2 },
        { id: 'schedules', label: 'Agendamentos', icon: Calendar },
        { id: 'shopee_affiliate', label: 'Buscar Produtos', icon: ShoppingBag },
        { id: 'shopee_video', label: 'Shopee Vídeo', icon: Video },
        { type: 'divider', label: 'Atendimento' },
        { id: 'inbox', label: 'Caixa de Mensagens', icon: MessageCircle, badge: unreadCount > 0 ? unreadCount : undefined },
        { type: 'divider', label: 'Automação' },
        { id: 'automation_accounts', label: 'Minhas Contas', icon: Settings2 },
        { id: 'whatsapp_automation', label: 'WhatsApp', icon: MessageCircle },
        { id: 'telegram_automation', label: 'Telegram', icon: Send },
        { id: 'facebook_automation', label: 'Facebook', icon: Facebook },
        { id: 'instagram_automation', label: 'Instagram', icon: Instagram },
        { id: 'twitter_automation', label: 'Twitter/X', icon: Twitter },
        { id: 'pinterest_automation', label: 'Pinterest', icon: Pin },
        { type: 'divider', label: 'Sistema' },
        { id: 'tutorials', label: 'Tutoriais', icon: BookOpen },
        { id: 'admin', label: '⚙️ Admin Panel', icon: Settings, special: true },
        { id: 'logs', label: 'Logs de Envio', icon: FileText },
        { type: 'divider', label: 'Configurações' },
        { id: 'shopee_settings', label: 'Conexão Shopee', icon: Settings },
    ].filter(item => {
        // Filter out disabled features
        if (item.id && disabledFeatures[`menu_${item.id}`]) {
            return false;
        }

        if (item.id === 'admin') {
            const userData = localStorage.getItem('user');
            const user = userData ? JSON.parse(userData) : null;
            return user?.role === 'admin';
        }
        return true;
    });

    const handleLogout = () => {
        // Limpar dados de autenticação
        localStorage.removeItem('authToken');
        localStorage.removeItem('user');

        // Redirecionar para landing page
        window.location.href = '/';
    };

    // Obter dados do usuário do localStorage
    const userData = localStorage.getItem('user');
    const user = userData ? JSON.parse(userData) : null;
    const userName = user?.name || 'Usuário';
    const userEmail = user?.email || '';
    const userInitials = userName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);

    return (
        <aside className="w-72 h-screen fixed left-0 top-0 bg-white/80 backdrop-blur-xl border-r border-white/20 shadow-xl z-50 flex flex-col transition-all duration-300">
            {/* Logo Section */}
            <div className="p-8 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-pink-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <Zap className="text-white w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
                        MeliFlow
                    </h1>
                    <p className="text-xs text-gray-500 font-medium tracking-wider">PRO SYSTEM</p>
                </div>
            </div>

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-1 custom-scrollbar">
                {menuItems.map((item, index) => {
                    if (item.type === 'divider') {
                        return (
                            <div key={index} className="px-4 py-4 mt-2">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                                    {item.label}
                                </p>
                            </div>
                        );
                    }

                    const Icon = item.icon as React.ElementType;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => {
                                if (item.id === 'admin') {
                                    window.location.href = '/admin';
                                } else {
                                    setActiveTab(item.id!);
                                }
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${isActive
                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                                : item.special
                                    ? 'text-orange-600 hover:bg-orange-50 hover:text-orange-700 border border-orange-200'
                                    : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                                }`}
                        >
                            <Icon size={20} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                            <span className="font-medium flex-1">{item.label}</span>

                            {item.id === 'inbox' && unreadCount > 0 && (
                                <span className="ml-auto bg-pink-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg shadow-pink-500/50 animate-bounce">
                                    {unreadCount}
                                </span>
                            )}

                            {isActive && (
                                <div className="absolute right-0 top-0 h-full w-1 bg-white/20" />
                            )}
                        </button>
                    );
                })}
            </nav>

            {/* User Profile Section */}
            <div className="p-4 m-4 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl border border-gray-200">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold shadow-md">
                        {userInitials}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-900 truncate">{userName}</p>
                        <p className="text-xs text-gray-500 truncate">{userEmail || 'Admin Master'}</p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="p-2 hover:bg-white rounded-lg transition-colors text-gray-500 hover:text-red-500 hover:scale-110"
                        title="Sair"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default ModernSidebar;
