import React from 'react';
import { motion } from 'framer-motion';
import { 
    CheckCircle2, Circle, Clock, Layout, Zap, MessageSquare, Share2, Bot, 
    BarChart3, Database, ShieldCheck, HelpCircle, User, FileText, 
    ArrowDownCircle, Send, Facebook, Instagram, Play 
} from 'lucide-react';
import { CommandCard, containerVariants, itemVariants } from '../components/MotionComponents';

const RoadmapPage: React.FC = () => {
    const modules = [
        {
            category: 'Core & Dashboard',
            items: [
                { name: 'Dashboard Principal', status: 85, notes: 'Métricas precisam de ajuste fino', icon: <Layout className="text-blue-500" /> },
                { name: 'Agendamentos', status: 100, notes: 'Funcionalidade completa', icon: <Clock className="text-green-500" /> },
                { name: 'Minhas Contas', status: 100, notes: 'Funcionalidade completa', icon: <User className="text-green-500" /> },
                { name: 'Logs de Envio', status: 90, notes: 'Estabilização final necessária', icon: <FileText className="text-blue-500" /> },
                { name: 'Tutoriais', status: 100, notes: 'Documentação base pronta', icon: <HelpCircle className="text-green-500" /> }
            ]
        },
        {
            category: 'Shopee & Mídia',
            items: [
                { name: 'Central Shopee', status: 95, notes: 'Otimização de parser pendente', icon: <Zap className="text-orange-500" /> },
                { name: 'Histórico Shopee', status: 70, notes: 'Melhorias de filtragem em progresso', icon: <Database className="text-orange-500" /> },
                { name: 'Baixar Vídeos (IG/FB)', status: 100, notes: 'Downloader funcional', icon: <ArrowDownCircle className="text-green-500" /> },
                { name: 'Public Vitrine', status: 100, notes: 'Vitrine pública ativa', icon: <Layout className="text-green-500" /> },
                { name: 'Analytics', status: 45, notes: 'Desenvolvimento de BI iniciado', icon: <BarChart3 className="text-purple-500" /> }
            ]
        },
        {
            category: 'Automação Social',
            items: [
                { name: 'WhatsApp', status: 100, notes: 'Estável com Baileys', icon: <MessageSquare className="text-green-500" /> },
                { name: 'Telegram', status: 100, notes: 'Estável com Bot API', icon: <Send className="text-blue-500" /> },
                { name: 'Facebook Reels', status: 95, notes: 'Feedback profissional integrado', icon: <Facebook className="text-blue-600" /> },
                { name: 'Instagram Graph', status: 95, notes: 'Feedback profissional integrado', icon: <Instagram className="text-pink-600" /> },
                { name: 'Twitter (X)', status: 85, notes: 'API v2 básica funcional', icon: <Share2 className="text-gray-900" /> }
            ]
        },
        {
            category: 'Módulos Avançados',
            items: [
                { name: 'YouTube Shorts', status: 20, notes: 'Pesquisa de API em progresso', icon: <Play className="text-red-500" /> },
                { name: 'Pinterest Pro', status: 50, notes: 'Board sync em desenvolvimento', icon: <Share2 className="text-red-600" /> },
                { name: 'Caixa de Mensagens', status: 20, notes: 'Arquitetura de inbox unificado', icon: <MessageSquare className="text-blue-400" /> },
                { name: 'Robô Comentários', status: 20, notes: 'Lógica de engajamento base', icon: <Bot className="text-purple-600" /> },
                { name: 'Agentes de IA', status: 10, notes: 'Integração LLM inicial', icon: <Zap className="text-yellow-500" /> }
            ]
        }
    ];

    const getStatusColor = (status: number) => {
        if (status === 100) return 'text-green-500';
        if (status >= 80) return 'text-blue-500';
        if (status >= 40) return 'text-orange-500';
        return 'text-red-500';
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <motion.div 
                    initial="hidden"
                    animate="visible"
                    variants={containerVariants}
                    className="space-y-12"
                >
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 tracking-tight">
                                System<span className="text-purple-600">_Roadmap</span>
                            </h1>
                            <p className="mt-2 text-gray-500 font-medium">Acompanhamento em tempo real do desenvolvimento do FluxoInteligente V2.0</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-white px-6 py-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                                <span className="text-xs font-black text-gray-900 uppercase tracking-widest">100% Estável</span>
                            </div>
                            <div className="bg-white px-6 py-3 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3">
                                <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse"></div>
                                <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Em Refatoração</span>
                            </div>
                        </div>
                    </div>

                    {/* Modules Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {modules.map((cat, idx) => (
                            <CommandCard key={idx} title={cat.category} icon={<ShieldCheck className="text-purple-600" />}>
                                <div className="p-6 space-y-4">
                                    {cat.items.map((item, i) => (
                                        <motion.div 
                                            key={i}
                                            variants={itemVariants}
                                            className="group bg-gray-50/50 hover:bg-white p-5 rounded-2xl border border-transparent hover:border-purple-100 transition-all duration-300"
                                        >
                                            <div className="flex items-center justify-between gap-4">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-all">
                                                        {item.icon}
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">{item.name}</h4>
                                                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">{item.notes}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <div className={`text-lg font-black ${getStatusColor(item.status)}`}>
                                                        {item.status}%
                                                    </div>
                                                    <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden mt-1">
                                                        <motion.div 
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${item.status}%` }}
                                                            transition={{ duration: 1, delay: 0.5 }}
                                                            className={`h-full ${item.status === 100 ? 'bg-green-500' : 'bg-purple-600'}`}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    ))}
                                </div>
                            </CommandCard>
                        ))}
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default RoadmapPage;
