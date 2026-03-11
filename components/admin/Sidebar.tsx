import React from 'react';
import { 
  LayoutDashboard, Users, Bot, DollarSign, 
  Wifi, Settings, Database, FileText, ChevronRight 
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

const navItems = [
  { id: 'visao-geral', label: 'Visão Geral', icon: LayoutDashboard },
  { id: 'usuarios', label: 'Usuários', icon: Users },
  { id: 'contas-automacao', label: 'Contas de Automação', icon: Bot },
  { id: 'assinaturas', label: 'Assinaturas', icon: DollarSign, badge: 'New' },
  { id: 'apis', label: 'Status APIs', icon: Wifi },
  { id: 'configuracoes', label: 'Configurações', icon: Settings },
  { id: 'banco-dados', label: 'Banco de Dados', icon: Database },
  { id: 'logs', label: 'Logs', icon: FileText },
];

const Sidebar: React.FC<SidebarProps> = ({ activeTab, setActiveTab, isOpen, setIsOpen }) => {
  return (
    <aside className={`fixed left-0 top-0 h-screen bg-[#0A0E27] border-r border-[#6366F1]/10 transition-all duration-300 z-[1000] 
      ${isOpen ? 'w-[280px]' : 'w-[80px]'} lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
      
      {/* Logo Section */}
      <div className="p-6 mb-8 border-b border-[#6366F1]/10 flex items-center gap-4">
        <div className="w-12 h-12 flex-shrink-0 bg-gradient-to-br from-[#667EEA] to-[#764BA2] rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-[float_6s_ease-in-out_infinite]">
          <LayoutDashboard className="text-white" size={24} />
        </div>
        {isOpen && (
          <div className="overflow-hidden whitespace-nowrap">
            <h1 className="text-xl font-bold bg-gradient-to-r from-[#667EEA] to-[#A78BFA] bg-clip-text text-transparent">
              MeliFlow
            </h1>
            <p className="text-xs text-[#9CA3AF] font-medium">Admin Dashboard</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="px-3 space-y-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl transition-all duration-300 relative group
              ${activeTab === item.id 
                ? 'bg-gradient-to-r from-[#6366F1]/20 to-transparent text-[#A78BFA] font-semibold' 
                : 'text-[#E5E7EB] hover:bg-[#6366F1]/10 hover:translate-x-2'}`}
          >
            {/* Active Indicator */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[#667EEA] to-[#764BA2] rounded-r-full transition-transform duration-300
              ${activeTab === item.id ? 'scale-y-100' : 'scale-y-0 group-hover:scale-y-50'}`} 
            />

            <item.icon size={22} className={`flex-shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6
              ${activeTab === item.id ? 'text-[#6366F1]' : ''}`} 
            />
            
            {isOpen && (
              <span className="flex-1 text-left whitespace-nowrap">{item.label}</span>
            )}

            {isOpen && item.badge && (
              <span className="px-2 py-0.5 bg-gradient-to-r from-[#EF4444] to-[#DC2626] text-white text-[10px] font-bold rounded-lg animate-pulse">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Toggle Button (Mobile/Tablet) */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="absolute -right-3 top-24 w-6 h-6 bg-[#1E2139] border border-[#6366F1]/20 rounded-full flex items-center justify-center text-[#6366F1] hover:scale-110 transition-transform lg:hidden"
      >
        <ChevronRight size={14} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* User Compact Footer */}
      {isOpen && (
        <div className="absolute bottom-6 left-6 right-6 p-4 bg-[#1E2139]/60 rounded-2xl border border-[#6366F1]/10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#6366F1] border-2 border-[#0A0E27] overflow-hidden">
            <img src="https://ui-avatars.com/api/?name=Admin&background=6366F1&color=fff" alt="avatar" />
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-[#F9FAFB] truncate">Thiago Santosi</p>
            <p className="text-[10px] text-[#9CA3AF] uppercase tracking-wider font-bold">Diretor Geral</p>
          </div>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
