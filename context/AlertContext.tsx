import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertCircle, Info, XCircle, X, HelpCircle } from 'lucide-react';

type AlertType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: AlertType;
  message: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

interface PromptOptions {
  title: string;
  message: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
}

interface AlertContextType {
  showAlert: (message: string, type?: AlertType) => void;
  showConfirm: (options: ConfirmOptions) => void;
  showPrompt: (options: PromptOptions) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirm, setConfirm] = useState<ConfirmOptions | null>(null);
  const [prompt, setPrompt] = useState<PromptOptions | null>(null);
  const [promptValue, setPromptValue] = useState('');

  const showAlert = useCallback((message: string, type: AlertType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  const showConfirm = useCallback((options: ConfirmOptions) => {
    setConfirm(options);
  }, []);

  const showPrompt = useCallback((options: PromptOptions) => {
    setPrompt(options);
    setPromptValue('');
  }, []);

  const handleConfirm = () => {
    if (confirm) {
      confirm.onConfirm();
      setConfirm(null);
    }
  };

  const handleCancel = () => {
    if (confirm) {
      if (confirm.onCancel) confirm.onCancel();
      setConfirm(null);
    }
  };

  const handlePromptConfirm = () => {
    if (prompt) {
      prompt.onConfirm(promptValue);
      setPrompt(null);
      setPromptValue('');
    }
  };

  const handlePromptCancel = () => {
    if (prompt) {
      if (prompt.onCancel) prompt.onCancel();
      setPrompt(null);
      setPromptValue('');
    }
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, showPrompt }}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <>
          {/* Toast System */}
          <div className="fixed top-6 right-6 z-[2147483647] flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
              {toasts.map((toast) => (
                <motion.div
                  key={toast.id}
                  initial={{ opacity: 0, x: 50, scale: 0.9 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 20, scale: 0.9 }}
                  className={`pointer-events-auto flex items-center gap-4 px-6 py-4 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.5)] border border-white/10 min-w-[350px] max-w-[500px] backdrop-blur-md
                    ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 
                      toast.type === 'error' ? 'bg-red-600 text-white' :
                      toast.type === 'warning' ? 'bg-amber-600 text-white' :
                      'bg-indigo-600 text-white'}`}
                >
                  <div className="flex-shrink-0">
                    {toast.type === 'success' && <CheckCircle size={24} className="text-white" />}
                    {toast.type === 'error' && <AlertCircle size={24} className="text-white" />}
                    {toast.type === 'warning' && <AlertCircle size={24} className="text-white" />}
                    {toast.type === 'info' && <Info size={24} className="text-white" />}
                  </div>
                  
                  <div className="flex-1 text-sm font-black leading-tight text-white tracking-wide">
                    {toast.message}
                  </div>
                  
                  <button 
                    onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                    className="p-1 hover:bg-white/10 rounded-lg transition-colors text-white"
                  >
                    <X size={18} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* Confirm Modal */}
          <AnimatePresence>
            {confirm && (
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handleCancel}
                  className="absolute inset-0 bg-[#020412]/90 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-md bg-[#0A0E27] border border-[#6366F1]/20 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                  <div className="p-8 pb-4 text-center">
                    <div className="w-16 h-16 bg-[#6366F1]/10 rounded-2xl flex items-center justify-center text-[#6366F1] mx-auto mb-6">
                      <HelpCircle size={32} />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2">{confirm.title}</h3>
                    <p className="text-sm text-[#9CA3AF] font-medium leading-relaxed">
                      {confirm.message}
                    </p>
                  </div>
                  
                  <div className="p-8 flex gap-4">
                    <button
                      onClick={handleCancel}
                      className="flex-1 px-6 py-4 bg-[#1E2139] text-[#9CA3AF] font-bold rounded-2xl hover:bg-[#252945] transition-all"
                    >
                      {confirm.cancelText || 'Cancelar'}
                    </button>
                    <button
                      onClick={handleConfirm}
                      className="flex-1 px-6 py-4 bg-gradient-to-r from-[#6366F1] to-[#764BA2] text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      {confirm.confirmText || 'Confirmar'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/* Prompt Modal */}
          <AnimatePresence>
            {prompt && (
              <div className="fixed inset-0 z-[2147483647] flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={handlePromptCancel}
                  className="absolute inset-0 bg-[#020412]/90 backdrop-blur-md"
                />
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 20 }}
                  className="relative w-full max-w-md bg-[#0A0E27] border border-[#6366F1]/20 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                  <div className="p-8 pb-4 text-center">
                    <div className="w-16 h-16 bg-[#6366F1]/10 rounded-2xl flex items-center justify-center text-[#6366F1] mx-auto mb-6">
                      <HelpCircle size={32} />
                    </div>
                    <h3 className="text-xl font-black text-white mb-2">{prompt.title}</h3>
                    <p className="text-sm text-[#9CA3AF] font-medium leading-relaxed mb-6">
                      {prompt.message}
                    </p>
                    
                    <input 
                      autoFocus
                      type="text" 
                      value={promptValue}
                      onChange={(e) => setPromptValue(e.target.value)}
                      placeholder={prompt.placeholder || 'Digite aqui...'}
                      className="w-full px-6 py-4 bg-[#1E2139] border border-[#6366F1]/20 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#6366F1]/50 transition-all font-medium"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handlePromptConfirm();
                        if (e.key === 'Escape') handlePromptCancel();
                      }}
                    />
                  </div>
                  
                  <div className="p-8 flex gap-4">
                    <button
                      onClick={handlePromptCancel}
                      className="flex-1 px-6 py-4 bg-[#1E2139] text-[#9CA3AF] font-bold rounded-2xl hover:bg-[#252945] transition-all"
                    >
                      {prompt.cancelText || 'Cancelar'}
                    </button>
                    <button
                      onClick={handlePromptConfirm}
                      className="flex-1 px-6 py-4 bg-gradient-to-r from-[#6366F1] to-[#764BA2] text-white font-bold rounded-2xl shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                    >
                      {prompt.confirmText || 'Confirmar'}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </>,
        document.body
      )}
    </AlertContext.Provider>
  );
};
