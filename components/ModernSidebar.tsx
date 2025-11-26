import React from 'react';
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
    Video
} from 'lucide-react';

interface SidebarProps {
    activeTab: string;
    setActiveTab: (tab: string) => void;
}

const ModernSidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'analytics', label: 'Analytics', icon: BarChart2 },
        { id: 'schedules', label: 'Agendamentos', icon: Calendar },
        { type: 'divider', label: 'Shopee Afiliado' },
        { id: 'shopee_affiliate', label: 'Buscar Produtos', icon: ShoppingBag },
        { id: 'shopee_video', label: 'Shopee Vídeo', icon: Video },
        { type: 'divider', label: 'Automação' },
        { id: 'whatsapp_automation', label: 'WhatsApp', icon: MessageCircle },
        { id: 'telegram_automation', label: 'Telegram', icon: Send },
        { id: 'facebook_automation', label: 'Facebook', icon: Facebook },
        { id: 'instagram_automation', label: 'Instagram', icon: Instagram },
        { id: 'pinterest_automation', label: 'Pinterest', icon: Pin },
        { type: 'divider', label: 'Sistema' },
        { id: 'logs', label: 'Logs de Envio', icon: FileText },
        { type: 'divider', label: 'Configurações' },
        { id: 'shopee_settings', label: 'Conexão Shopee', icon: Settings },
    ];

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
                            onClick={() => setActiveTab(item.id!)}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group relative overflow-hidden ${isActive
                                ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/25'
                                : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700'
                                }`}
                        >
                            <Icon size={20} className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'group-hover:scale-110'}`} />
                            <span className="font-medium">{item.label}</span>

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
