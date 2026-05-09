import React, { useState } from 'react';
import { Bell, X, Trash2, Check, CheckCheck, AlertCircle, Info, CheckCircle2, AlertTriangle, Inbox } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotifications } from '../context/NotificationContext';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const NotificationBell: React.FC = () => {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAll } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'success': return <CheckCircle2 className="text-[#10B981]" size={18} />;
      case 'error': return <AlertCircle className="text-[#EF4444]" size={18} />;
      case 'warning': return <AlertTriangle className="text-amber-500" size={18} />;
      default: return <Info className="text-[#6366F1]" size={18} />;
    }
  };

  const getModuleBadge = (module: string) => {
    const modules: Record<string, { label: string, color: string }> = {
      whatsapp: { label: 'WhatsApp', color: 'bg-green-500/10 text-green-500' },
      telegram: { label: 'Telegram', color: 'bg-blue-500/10 text-blue-500' },
      instagram: { label: 'Instagram', color: 'bg-pink-500/10 text-pink-500' },
      facebook: { label: 'Facebook', color: 'bg-indigo-500/10 text-indigo-500' },
      shopee: { label: 'Shopee', color: 'bg-[#EE4D2D]/10 text-[#EE4D2D]' },
      system: { label: 'Sistema', color: 'bg-purple-500/10 text-purple-500' },
    };

    const config = modules[module] || { label: module, color: 'bg-gray-500/10 text-gray-500' };
    
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${config.color}`}>
        {config.label}
      </span>
    );
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2.5 hover:bg-gray-100 rounded-xl transition-all border border-transparent hover:border-purple-200 group"
      >
        <Bell size={20} className={`${unreadCount > 0 ? 'text-purple-600 animate-pulse' : 'text-gray-500 group-hover:text-purple-700'}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-[#EF4444] text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-[#020412] shadow-lg">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile */}
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-[999] md:hidden bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-4 w-[380px] max-w-[90vw] bg-[#0A0E27]/95 backdrop-blur-2xl border border-[#6366F1]/20 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[1000] overflow-hidden flex flex-col max-h-[600px]"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center justify-between bg-white/5">
                <div>
                  <h3 className="text-lg font-black text-white">Notificações</h3>
                  <p className="text-xs text-gray-400 font-medium">Você tem {unreadCount} mensagens não lidas</p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={markAllAsRead}
                    title="Marcar todas como lidas"
                    className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-[#6366F1] transition-all"
                  >
                    <CheckCheck size={18} />
                  </button>
                  <button 
                    onClick={() => setIsOpen(false)}
                    className="p-2 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* List */}
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-center opacity-40">
                    <Inbox size={48} className="mb-4" />
                    <p className="text-sm font-bold">Nenhuma notificação por aqui</p>
                    <p className="text-xs">Tudo limpo no momento!</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {notifications.map((n) => (
                      <motion.div
                        layout
                        key={n.id}
                        className={`group relative p-4 rounded-2xl border transition-all ${n.read ? 'bg-white/2 border-white/5 opacity-60' : 'bg-[#6366F1]/5 border-[#6366F1]/20 shadow-lg shadow-indigo-500/5'}`}
                      >
                        <div className="flex gap-4">
                          <div className="mt-1">
                            {getTypeIcon(n.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              {getModuleBadge(n.module)}
                              <span className="text-[10px] text-gray-500 font-medium">
                                {format(new Date(n.created_at), "HH:mm '·' d MMM", { locale: ptBR })}
                              </span>
                            </div>
                            <h4 className={`text-sm font-black truncate ${n.read ? 'text-gray-300' : 'text-white'}`}>
                              {n.title}
                            </h4>
                            <p className="text-xs text-gray-400 font-medium leading-relaxed mt-1 line-clamp-2">
                              {n.message}
                            </p>
                          </div>
                        </div>

                        {/* Actions Overlay */}
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                          {!n.read && (
                            <button 
                              onClick={() => markAsRead(n.id)}
                              className="p-1.5 bg-white/10 hover:bg-[#6366F1]/20 text-[#6366F1] rounded-lg transition-all"
                              title="Marcar como lida"
                            >
                              <Check size={14} />
                            </button>
                          )}
                          <button 
                            onClick={() => deleteNotification(n.id)}
                            className="p-1.5 bg-white/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                            title="Excluir"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div className="p-4 border-t border-white/5 bg-white/2 flex justify-center">
                  <button 
                    onClick={clearAll}
                    className="text-xs font-black text-gray-500 hover:text-red-500 transition-all uppercase tracking-widest flex items-center gap-2"
                  >
                    <Trash2 size={12} />
                    Limpar Todo Histórico
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default NotificationBell;
