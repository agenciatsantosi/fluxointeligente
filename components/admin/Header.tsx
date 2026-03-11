import React from 'react';
import { Search, Bell, User, MessageCircle, RefreshCw } from 'lucide-react';

interface HeaderProps {
  loading: boolean;
  onRefresh: () => void;
  autoRefresh: boolean;
  setAutoRefresh: (auto: boolean) => void;
}

const Header: React.FC<HeaderProps> = ({ loading, onRefresh, autoRefresh, setAutoRefresh }) => {
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
        <button className="relative w-12 h-12 flex items-center justify-center bg-[#1E2139]/60 border border-[#6366F1]/20 rounded-xl hover:bg-[#6366F1]/20 transition-all">
          <Bell size={20} className="text-[#E5E7EB]" />
          <span className="absolute top-3 right-3 w-2.5 h-2.5 bg-[#EF4444] border-2 border-[#0A0E27] rounded-full animate-ping" />
        </button>

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
