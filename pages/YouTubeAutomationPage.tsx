import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    Youtube, 
    Send, 
    RefreshCw, 
    Clock, 
    CheckCircle, 
    User, 
    FileText, 
    Settings, 
    Plus, 
    Trash2, 
    Zap, 
    Sparkles, 
    Calendar,
    Activity,
    AlertCircle,
    ShieldCheck,
    Video,
    Layout
} from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import { useProducts } from '../context/ProductContext';
import api from '../services/api';
import { CommandCard, TacticalButton, containerVariants } from '../components/MotionComponents';

interface YouTubeAutomationPageProps {
    setActiveTab?: (tab: string) => void;
}

const YouTubeAutomationPage: React.FC<YouTubeAutomationPageProps> = ({ setActiveTab }) => {
    const { showAlert } = useAlert();
    const { shopeeAffiliateSettings } = useProducts();

    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

    // Post Now State
    const [postTitle, setPostTitle] = useState('');
    const [postDescription, setPostDescription] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [loading, setLoading] = useState(false);

    // Automation State
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const [productCount, setProductCount] = useState(5);
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '14:00', '19:00']);
    const [randomVariation, setRandomVariation] = useState(15);
    const [categoryType, setCategoryType] = useState('random');

    // Status State
    const [plannedTasks, setPlannedTasks] = useState<any[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);

    const loadAccounts = async () => {
        try {
            const response = await api.get('/youtube/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && selectedAccountIds.length === 0) {
                    setSelectedAccountIds([response.data.accounts[0].id.toString()]);
                }
            }
        } catch (error) {
            console.error('Error loading YouTube accounts:', error);
        }
    };

    const loadPlannedTasks = async () => {
        setIsLoadingTasks(true);
        try {
            const res = await api.get('/automation/planned-tasks?platform=youtube');
            if (res.data && res.data.success) {
                setPlannedTasks(res.data.tasks || []);
            }
        } catch (e) {
            console.error('Failed to load planned tasks', e);
        } finally {
            setIsLoadingTasks(false);
        }
    };

    useEffect(() => {
        loadAccounts();
        loadPlannedTasks();
    }, []);

    const toggleAccountSelection = (accountId: string) => {
        setSelectedAccountIds(prev => 
            prev.includes(accountId) 
                ? prev.filter(id => id !== accountId) 
                : [...prev, accountId]
        );
    };

    const handlePostNow = async () => {
        if (selectedAccountIds.length === 0) return showAlert('Selecione ao menos um canal', 'error');
        if (!postTitle) return showAlert('Digite o título do vídeo', 'error');
        if (!mediaUrl) return showAlert('Insira o link do vídeo (mp4)', 'error');

        setLoading(true);
        try {
            showAlert('Iniciando postagem...', 'info');
            
            const results = await Promise.allSettled(selectedAccountIds.map(accountId => 
                api.post('/youtube/post-now', {
                    title: postTitle,
                    description: postDescription,
                    videoPath: mediaUrl,
                    accountId: parseInt(accountId)
                })
            ));

            const successes = results.filter(r => r.status === 'fulfilled' && (r.value as any).data.success).length;
            const failures = results.length - successes;

            if (failures === 0) {
                showAlert(`✅ Sucesso! Vídeo publicado em ${successes} canal(is).`, 'success');
                setPostTitle('');
                setPostDescription('');
                setMediaUrl('');
            } else if (successes > 0) {
                showAlert(`⚠️ Vídeo publicado em ${successes} canal(is), mas falhou em ${failures}. Verifique as notificações.`, 'warning');
            } else {
                const firstError = (results[0] as any).reason?.response?.data?.error || (results[0] as any).reason?.message || 'Erro desconhecido';
                showAlert(`❌ Falha total: ${firstError}`, 'error');
            }
        } catch (error: any) {
            showAlert('Erro inesperado: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleSaveSchedule = async () => {
        if (selectedAccountIds.length === 0) return showAlert('Selecione ao menos um canal', 'error');
        
        setLoading(true);
        try {
            const response = await api.post('/scheduler/save', {
                platform: 'youtube',
                config: {
                    accountId: parseInt(selectedAccountIds[0]), // YouTube currently schedules 1 by 1 in legacy code
                    productCount,
                    categoryType,
                    enableRotation: true,
                    scheduleMode: 'multiple',
                    frequency: 'daily',
                    time: customTimes[0] || '12:00',
                    times: customTimes,
                    randomVariation,
                    automationEnabled
                },
                userId: 1
            });

            if (response.data.success) {
                showAlert('Configuração de automação salva!', 'success');
                loadPlannedTasks();
            } else {
                showAlert(response.data.error || 'Erro ao salvar', 'error');
            }
        } catch (error: any) {
            showAlert(error.message, 'error');
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div 
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-8 pb-20 max-w-[1400px] mx-auto px-4 sm:px-0"
        >
            {/* --- TOP GLASS HEADER --- */}
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-red-600 to-red-400 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                <CommandCard className="relative bg-white/80 backdrop-blur-xl border-white shadow-2xl rounded-[1.8rem] overflow-hidden">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-6 p-4">
                        <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-6">
                            <div className="w-20 h-20 bg-red-600 rounded-3xl flex items-center justify-center shadow-2xl transform -rotate-3 hover:rotate-0 transition-all duration-500 shrink-0">
                                <Youtube size={40} className="text-white" />
                            </div>
                            <div>
                                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                                    <span className="px-2 py-0.5 bg-red-100 text-[9px] font-black text-red-600 rounded-full uppercase tracking-tighter">V2.0 - SHORTS</span>
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                </div>
                                <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight flex items-center justify-center sm:justify-start gap-2">
                                    YouTube<span className="text-red-600">.Automation</span>
                                </h1>
                                <p className="text-sm text-gray-500 font-bold max-w-md leading-tight mt-1">
                                    Extração, formatação e postagem automática de Shorts focado em conversão.
                                </p>
                            </div>
                        </div>

                        {/* Quota Notice */}
                        <div className="flex items-center gap-3 bg-red-50 p-4 rounded-[1.4rem] border border-red-100">
                            <AlertCircle size={24} className="text-red-500 shrink-0" />
                            <div>
                                <p className="text-[10px] font-black text-red-600 uppercase">Cota de API Google</p>
                                <p className="text-xs font-medium text-red-800">Cerca de 6 uploads por dia. Agende com sabedoria.</p>
                            </div>
                        </div>
                    </div>
                </CommandCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* --- COLUNA ESQUERDA (CONTAS E POST RÁPIDO) --- */}
                <div className="lg:col-span-4 space-y-8">
                    
                    {/* Glass Account Card */}
                    <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.6rem] p-5 sm:p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <User size={16} className="text-red-600" /> Canais Conectados
                            </h3>
                            {setActiveTab && (
                                <button 
                                    onClick={() => setActiveTab('accounts')}
                                    className="p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-all duration-300 shrink-0"
                                    title="Gerenciar Contas"
                                >
                                    <Settings size={14} />
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {accounts.length === 0 ? (
                                <div className="text-center py-10 bg-gray-50/50 rounded-[1.2rem] border-2 border-dashed border-gray-200">
                                    <Youtube size={32} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-[10px] text-gray-400 font-black uppercase mb-4">Nenhum canal ativo</p>
                                    <TacticalButton variant="secondary" size="sm" onClick={() => setActiveTab?.('accounts')}>CONECTAR AGORA</TacticalButton>
                                </div>
                            ) : (
                                accounts.map((acc) => (
                                    <div 
                                        key={acc.id}
                                        onClick={() => toggleAccountSelection(acc.id.toString())}
                                        className={`group relative p-4 rounded-[1.2rem] border-2 transition-all duration-500 cursor-pointer overflow-hidden ${
                                            selectedAccountIds.includes(acc.id.toString()) 
                                                ? 'border-red-600 bg-red-50/30' 
                                                : 'border-transparent bg-gray-50/50 hover:bg-white hover:border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className="w-12 h-12 rounded-2xl bg-white overflow-hidden shadow-md transform group-hover:scale-110 transition-transform duration-500 relative shrink-0 flex items-center justify-center text-red-600 font-bold">
                                                {acc.profile_picture_url ? (
                                                    <img src={acc.profile_picture_url} alt={acc.channel_name} className="w-full h-full object-cover" />
                                                ) : (
                                                    acc.channel_name.substring(0, 1)
                                                )}
                                                {selectedAccountIds.includes(acc.id.toString()) && (
                                                    <div className="absolute inset-0 bg-red-600/20 flex items-center justify-center">
                                                        <CheckCircle size={20} className="text-white fill-red-600" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-gray-900 truncate">{acc.channel_name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedAccountIds.includes(acc.id.toString()) ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest truncate">
                                                        {selectedAccountIds.includes(acc.id.toString()) ? 'Selecionado' : 'Não Selecionado'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CommandCard>

                    {/* Manual Post UI */}
                    <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.6rem] p-5 sm:p-6">
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <Send size={16} className="text-red-600" /> Postagem Imediata
                        </h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50/50 rounded-[1.2rem] border border-gray-100 space-y-4">
                                
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">URL do Vídeo</label>
                                    <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-gray-100 focus-within:border-red-300 transition-all">
                                        <Video size={14} className="text-red-500 shrink-0" />
                                        <input 
                                            type="text"
                                            value={mediaUrl}
                                            onChange={(e) => setMediaUrl(e.target.value)}
                                            placeholder="URL direta (ex: .mp4)"
                                            className="flex-1 bg-transparent text-[11px] font-bold outline-none text-gray-600 min-w-0"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Título do Short</label>
                                    <input 
                                        type="text"
                                        value={postTitle}
                                        onChange={(e) => setPostTitle(e.target.value)}
                                        placeholder="Título (até 100 caracteres)"
                                        maxLength={100}
                                        className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-bold outline-none focus:border-red-300 transition-all"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Descrição e Links</label>
                                    <textarea 
                                        value={postDescription}
                                        onChange={(e) => setPostDescription(e.target.value)}
                                        placeholder="Sua descrição com os links de afiliado..."
                                        className="w-full h-32 p-4 bg-white border border-gray-100 rounded-xl text-xs font-medium outline-none focus:border-red-300 transition-all resize-none"
                                    />
                                </div>
                            </div>

                            <TacticalButton 
                                fullWidth 
                                onClick={handlePostNow} 
                                loading={loading}
                                color="black"
                                icon={Zap}
                                className="py-6 rounded-[1.2rem] text-xs shadow-2xl"
                            >
                                DISPARAR SHORT AGORA
                            </TacticalButton>
                        </div>
                    </CommandCard>
                </div>

                {/* --- COLUNA DIREITA (AUTOMAÇÃO E FILTROS) --- */}
                <div className="lg:col-span-8 space-y-8">
                    
                    {/* Main Automation Controller */}
                    <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.8rem] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-red-100 rounded-full blur-3xl opacity-20 -mr-32 -mt-32"></div>
                        
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-black rounded-2xl text-white shadow-xl rotate-3 hover:rotate-0 transition-all shrink-0">
                                    <Sparkles size={24} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-widest">Agendamento Automático</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Robô de Postagem Shorts v2.0</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200 self-end sm:self-auto">
                                <button 
                                    onClick={() => setAutomationEnabled(false)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${!automationEnabled ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                                >
                                    DESATIVADO
                                </button>
                                <button 
                                    onClick={() => setAutomationEnabled(true)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${automationEnabled ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    ATIVO
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                            
                            {/* Content Filters */}
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <Layout size={14} className="text-red-600" /> Categoria Shopee
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'random', label: 'Aleatório' },
                                            { id: 'achadinhos', label: 'Achadinhos' },
                                            { id: 'casa', label: 'Casa & Decor' },
                                            { id: 'beleza', label: 'Beleza & Moda' },
                                        ].map((type) => (
                                            <button
                                                key={type.id}
                                                onClick={() => setCategoryType(type.id)}
                                                className={`flex items-center justify-center p-3 rounded-xl border-2 transition-all gap-2 ${categoryType === type.id ? 'border-red-600 bg-red-50 text-red-600' : 'border-gray-100 bg-white hover:border-gray-200 text-gray-500'}`}
                                            >
                                                <span className="text-[10px] font-black uppercase text-center">{type.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Cycles & Times */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                            Ciclo Diário <span>{productCount} itens</span>
                                        </label>
                                        <input 
                                            type="range" min="1" max="10" 
                                            value={productCount} 
                                            onChange={(e) => setProductCount(parseInt(e.target.value))}
                                            className="w-full accent-black"
                                        />
                                        <p className="text-[8px] font-bold text-gray-400 text-center">Limite recomendado: 6/dia</p>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                            Variação <span>± {randomVariation} min</span>
                                        </label>
                                        <input 
                                            type="range" min="0" max="120" 
                                            value={randomVariation} 
                                            onChange={(e) => setRandomVariation(parseInt(e.target.value))}
                                            className="w-full accent-black"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Legend & Times */}
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                                        <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                            <Clock size={14} className="text-red-600" /> Cronograma de Postagem
                                        </label>
                                        <button 
                                            onClick={() => setCustomTimes(["10:00", "14:00", "18:00"].sort())}
                                            className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95 shrink-0 self-start sm:self-auto"
                                        >
                                            <Zap size={10} fill="currentColor" /> Sugerir (3/dia)
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {customTimes.map((time, idx) => (
                                            <div key={idx} className="flex items-center bg-white border-2 border-gray-100 rounded-2xl px-3 py-2 sm:px-4 sm:py-3 group hover:border-black transition-all">
                                                <input 
                                                    type="time" 
                                                    value={time}
                                                    onChange={(e) => {
                                                        const newTimes = [...customTimes];
                                                        newTimes[idx] = e.target.value;
                                                        setCustomTimes(newTimes);
                                                    }}
                                                    className="bg-transparent text-sm font-black outline-none w-16"
                                                />
                                                <button 
                                                    onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))}
                                                    className="ml-2 text-gray-300 hover:text-red-500 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        {customTimes.length < 6 && (
                                            <button 
                                                onClick={() => setCustomTimes([...customTimes, '12:00'])}
                                                className="flex items-center justify-center w-12 h-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-300 hover:border-black hover:text-black transition-all"
                                            >
                                                <Plus size={20} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-6 relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={16} className="text-green-500" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Quota Safe Mode</span>
                                </div>
                            </div>
                            
                            <TacticalButton 
                                onClick={handleSaveSchedule} 
                                loading={loading}
                                className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-500 text-white px-12 py-6 rounded-[1.4rem] font-black text-xs shadow-xl shadow-red-200 hover:scale-[1.05]"
                            >
                                SALVAR CONFIGURAÇÃO DE SHORTS
                            </TacticalButton>
                        </div>
                    </CommandCard>

                    {/* Queue Management - Premium List */}
                    <div className="space-y-8">
                        <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.8rem] p-5 sm:p-6">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar size={16} className="text-red-600" /> Fila de Shorts
                                    </h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Próximos vídeos agendados</p>
                                </div>
                                <button 
                                    onClick={loadPlannedTasks} 
                                    className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-black hover:bg-gray-100 transition-all duration-300 self-end sm:self-auto shrink-0"
                                >
                                    <RefreshCw size={16} className={isLoadingTasks ? 'animate-spin' : ''} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                <AnimatePresence>
                                    {plannedTasks.length === 0 ? (
                                        <div className="col-span-1 sm:col-span-2 py-16 text-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
                                            <Clock size={32} className="mx-auto text-gray-200 mb-3" />
                                            <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">Radar Vazio: Nenhum short na fila</p>
                                        </div>
                                    ) : (
                                        plannedTasks.map((task, idx) => (
                                            <motion.div 
                                                key={idx}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className="p-4 sm:p-5 bg-white border border-gray-100 rounded-2xl flex items-center justify-between gap-4 group hover:border-black hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                                            >
                                                <div className="flex items-center gap-4 min-w-0">
                                                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 group-hover:bg-black group-hover:text-white transition-all duration-500 shrink-0">
                                                        <Video size={20} />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-black text-gray-900 uppercase tracking-widest">
                                                            {new Date(task.planned_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                        <p className="text-[10px] font-bold text-gray-400 mt-0.5 truncate">
                                                            {new Date(task.planned_time).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                
                                                <div className="px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-red-100">
                                                    {task.status}
                                                </div>
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>
                        </CommandCard>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default YouTubeAutomationPage;
