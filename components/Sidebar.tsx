import React, { useState } from 'react';
import { BarChart2, Activity, ShoppingBag, DollarSign, Bot, TrendingUp, MessageCircle, ChevronDown, ChevronRight, Facebook, Calendar, Instagram, Settings } from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab }) => {
  const [automationsOpen, setAutomationsOpen] = useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'shopee_affiliate', label: 'Afiliado Shopee', icon: DollarSign },
    { id: 'schedules', label: 'Agendamentos', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: TrendingUp },
    { id: 'shopee_settings', label: 'Configurações Shopee', icon: ShoppingBag },
    { id: 'logs', label: 'Logs & Auditoria', icon: Activity },
  ];

  const automationItems = [
    { id: 'automation_accounts', label: 'Minhas Contas', icon: Settings },
    { id: 'telegram_automation', label: 'Telegram', icon: Bot },
    { id: 'whatsapp_automation', label: 'WhatsApp', icon: MessageCircle },
    { id: 'facebook_automation', label: 'Facebook', icon: Facebook },
    { id: 'instagram_automation', label: 'Instagram', icon: Instagram },
  ];

  return (
    <div className="w-64 bg-white h-screen border-r border-gray-200 flex flex-col fixed left-0 top-0 z-10">
      <div className="p-6 flex items-center border-b border-gray-100">
        <div className="w-8 h-8 bg-yellow-400 rounded-md mr-3 flex items-center justify-center font-bold text-blue-900">ML</div>
        <h1 className="text-xl font-bold text-gray-800">FluxoInteligente</h1>
      </div>
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isActive
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          )
        })}

        {/* Automations Dropdown */}
        <div>
          <button
            onClick={() => setAutomationsOpen(!automationsOpen)}
            className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors duration-200"
          >
            <div className="flex items-center space-x-3">
              <Bot size={20} />
              <span className="font-medium">Automações</span>
            </div>
            {automationsOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {automationsOpen && (
            <div className="ml-4 mt-1 space-y-1">
              {automationItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors duration-200 ${isActive
                      ? 'bg-blue-50 text-blue-600 font-medium'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                  >
                    <Icon size={18} />
                    <span className="text-sm">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </nav>
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
            JS
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">João Silva</p>
            <p className="text-xs text-gray-500">Admin</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;