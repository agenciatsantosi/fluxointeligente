import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Send, X, Clock, Zap } from 'lucide-react';
import { TacticalButton } from './MotionComponents';

interface PostUploadChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSchedule: () => void;
    onSendNow: () => void;
    itemCount: number;
}

const PostUploadChoiceModal: React.FC<PostUploadChoiceModalProps> = ({ 
    isOpen, 
    onClose, 
    onSchedule, 
    onSendNow,
    itemCount 
}) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                    />
                    
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-xl bg-white rounded-[32px] shadow-2xl overflow-hidden border border-gray-100"
                    >
                        {/* Header */}
                        <div className="p-8 bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-between text-white">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                    <Zap size={24} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">Upload Concluído!</h3>
                                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">{itemCount} Itens Adicionados à Fila</p>
                                </div>
                            </div>
                            <button onClick={onClose} className="p-2 hover:bg-white/20 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-10 space-y-8">
                            <div className="text-center space-y-2">
                                <h4 className="text-lg font-black text-gray-900 uppercase">Qual o próximo passo?</h4>
                                <p className="text-sm text-gray-500 font-medium">Escolha como deseja distribuir seus novos conteúdos.</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                {/* Option 1: Schedule */}
                                <motion.button
                                    whileHover={{ scale: 1.02, y: -4 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onSchedule}
                                    className="p-8 bg-gray-50 border-2 border-transparent hover:border-purple-200 hover:bg-white rounded-[24px] transition-all flex flex-col items-center gap-4 group"
                                >
                                    <div className="p-5 bg-purple-50 text-purple-600 rounded-2xl group-hover:bg-purple-600 group-hover:text-white transition-all shadow-sm">
                                        <Clock size={32} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-xs font-black text-gray-900 uppercase tracking-widest mb-1">Agendar Envio</span>
                                        <span className="block text-[10px] text-gray-400 font-bold uppercase leading-tight">Configurar horários automáticos</span>
                                    </div>
                                </motion.button>

                                {/* Option 2: Send Now */}
                                <motion.button
                                    whileHover={{ scale: 1.02, y: -4 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={onSendNow}
                                    className="p-8 bg-gray-50 border-2 border-transparent hover:border-pink-200 hover:bg-white rounded-[24px] transition-all flex flex-col items-center gap-4 group"
                                >
                                    <div className="p-5 bg-pink-50 text-pink-600 rounded-2xl group-hover:bg-pink-600 group-hover:text-white transition-all shadow-sm">
                                        <Send size={32} />
                                    </div>
                                    <div className="text-center">
                                        <span className="block text-xs font-black text-gray-900 uppercase tracking-widest mb-1">Enviar Agora</span>
                                        <span className="block text-[10px] text-gray-400 font-bold uppercase leading-tight">Postar imediatamente em lote</span>
                                    </div>
                                </motion.button>
                            </div>

                            <div className="pt-4">
                                <TacticalButton color="slate" className="w-full py-4 rounded-2xl" onClick={onClose}>
                                    Apenas Sair
                                </TacticalButton>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default PostUploadChoiceModal;
