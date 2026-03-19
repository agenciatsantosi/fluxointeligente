import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Send, X, Clock, Zap, CheckCircle, ChevronLeft, User } from 'lucide-react';
import { TacticalButton } from './MotionComponents';

interface Account {
    id: string | number;
    username?: string;
    name?: string;
}

interface PostUploadChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSchedule: () => void;
    onSendNow: (accountId: string | number, title?: string, caption?: string) => void;
    itemCount: number;
    accounts?: Account[];
    selectedAccountId?: string | number;
    platform?: 'instagram' | 'facebook';
}

const PostUploadChoiceModal: React.FC<PostUploadChoiceModalProps> = ({ 
    isOpen, 
    onClose, 
    onSchedule, 
    onSendNow,
    itemCount,
    accounts = [],
    selectedAccountId: initialAccountId,
    platform = 'instagram'
}) => {
    const [step, setStep] = useState<'choice' | 'account'>('choice');
    const [selectedAccountId, setSelectedAccountId] = useState<string | number>(initialAccountId || '');
    const [title, setTitle] = useState('');
    const [caption, setCaption] = useState('');

    const handleClose = () => {
        setStep('choice');
        onClose();
    };

    const handleSendNow = () => {
        // Always show account selector so user explicitly picks where to post
        setStep('account');
    };

    const handleConfirmAccount = () => {
        if (!selectedAccountId) return;
        onSendNow(selectedAccountId, title, caption);
        setStep('choice');
        setTitle('');
        setCaption('');
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
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
                                {step === 'account' && (
                                    <button onClick={() => setStep('choice')} className="p-2 hover:bg-white/20 rounded-full transition-all">
                                        <ChevronLeft size={20} />
                                    </button>
                                )}
                                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                    <Zap size={24} className="text-white" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black uppercase tracking-tight">
                                        {step === 'choice' ? 'Upload Concluído!' : 'Selecionar Conta'}
                                    </h3>
                                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">
                                        {step === 'choice'
                                            ? `${itemCount} Itens Adicionados à Fila`
                                            : `Escolha o perfil do ${platform === 'instagram' ? 'Instagram' : 'Facebook'} para publicar`}
                                    </p>
                                </div>
                            </div>
                            <button onClick={handleClose} className="p-2 hover:bg-white/20 rounded-full transition-all">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        {step === 'choice' ? (
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
                                        onClick={handleSendNow}
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
                                    <TacticalButton color="slate" className="w-full py-4 rounded-2xl" onClick={handleClose}>
                                        Apenas Sair
                                    </TacticalButton>
                                </div>
                            </div>
                        ) : (
                                <div className="space-y-4">
                                    <div className="bg-gray-50 p-6 rounded-[24px] border border-gray-100 space-y-4">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Título do Vídeo</span>
                                            <input 
                                                type="text"
                                                placeholder="Ex: Novo Lançamento..."
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                className="w-full bg-white border-2 border-transparent focus:border-purple-500 rounded-xl px-4 py-3 text-sm font-bold outline-none transition-all shadow-sm"
                                            />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Legenda da Publicação</span>
                                            <textarea 
                                                placeholder={itemCount > 1 ? "Legenda personalizada para todos os itens..." : "Escreva uma legenda incrível..."}
                                                value={caption}
                                                onChange={(e) => setCaption(e.target.value)}
                                                rows={3}
                                                className="w-full bg-white border-2 border-transparent focus:border-purple-500 rounded-xl px-4 py-3 text-sm font-medium outline-none transition-all shadow-sm resize-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                                        {accounts.length === 0 ? (
                                            <div className="text-center py-8 text-gray-400">
                                                <User size={32} className="mx-auto mb-2 opacity-30" />
                                                <p className="text-xs font-bold">Nenhuma conta conectada.</p>
                                            </div>
                                        ) : accounts.map(acc => (
                                        <button
                                            key={acc.id}
                                            onClick={() => setSelectedAccountId(acc.id)}
                                            className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl border-2 transition-all text-left ${
                                                selectedAccountId === acc.id
                                                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                                                    : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-purple-200 hover:bg-white'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full ${selectedAccountId === acc.id ? 'bg-purple-500' : 'bg-gray-300'}`} />
                                                <div>
                                                    <p className="font-black text-sm uppercase tracking-wide">@{acc.username || acc.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{platform === 'instagram' ? 'Instagram' : 'Facebook Page'}</p>
                                                </div>
                                            </div>
                                            {selectedAccountId === acc.id && <CheckCircle size={20} className="text-purple-500" />}
                                        </button>
                                    ))}
                                </div>

                                <TacticalButton
                                    color="purple"
                                    className="w-full py-4 rounded-2xl"
                                    onClick={handleConfirmAccount}
                                    disabled={!selectedAccountId}
                                >
                                    <div className="flex items-center justify-center gap-2">
                                        <Send size={18} />
                                        Confirmar e Publicar Agora
                                    </div>
                                </TacticalButton>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default PostUploadChoiceModal;
