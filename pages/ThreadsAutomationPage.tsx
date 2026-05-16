import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
    AtSign, 
    Send, 
    RefreshCw, 
    Clock, 
    CheckCircle, 
    XCircle, 
    User, 
    Hash, 
    FileText, 
    Power, 
    Settings, 
    Plus, 
    Trash2, 
    Zap, 
    Sparkles, 
    Calendar,
    Activity,
    Info,
    AlertCircle,
    ShieldCheck,
    MessageSquare,
    Link as LinkIcon,
    Image as ImageIcon,
    Video,
    Layout,
    ShoppingBag,
    Filter
} from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import { useProducts } from '../context/ProductContext';
import api from '../services/api';
import { CommandCard, TacticalButton, StatusPulse, containerVariants, itemVariants } from '../components/MotionComponents';

interface ThreadsAutomationPageProps {
    setActiveTab?: (tab: string) => void;
}

const ThreadsAutomationPage: React.FC<ThreadsAutomationPageProps> = ({ setActiveTab }) => {
    const { showAlert, showConfirm } = useAlert();
    const { shopeeAffiliateSettings } = useProducts();

    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);

    // Post Now State
    const [postText, setPostText] = useState('');
    const [mediaUrl, setMediaUrl] = useState('');
    const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
    const [loading, setLoading] = useState(false);

    // Automation State
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const [productCount, setProductCount] = useState(5);
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '14:00', '19:00']);
    const [randomVariation, setRandomVariation] = useState(15);
    const [contentType, setContentType] = useState<'text' | 'image' | 'video' | 'shopee'>('shopee');
    const [shopeeMediaMode, setShopeeMediaMode] = useState<'any' | 'video_only' | 'image_only' | 'video_preferred'>('any');
    
    const [messageTemplate, setMessageTemplate] = useState(`🔥 ACHADINHO NO THREADS!

{product_name}

💸 Por apenas: R$ {preco_com_desconto}

🛒 Link na bio ou aqui: {link}

#achadinhos #shopee #ofertas`);

    // Status State
    const [plannedTasks, setPlannedTasks] = useState<any[]>([]);
    const [isLoadingTasks, setIsLoadingTasks] = useState(false);
    const [accountInsights, setAccountInsights] = useState<any>(null);
    const [isLoadingInsights, setIsLoadingInsights] = useState(false);

    const loadAccounts = async () => {
        try {
            const response = await api.get('/threads/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && selectedAccountIds.length === 0) {
                    setSelectedAccountIds([response.data.accounts[0].account_id]);
                }
            }
        } catch (error) {
            console.error('Error loading Threads accounts:', error);
        }
    };

    const loadPlannedTasks = async () => {
        setIsLoadingTasks(true);
        try {
            const res = await api.get('/automation/planned-tasks?platform=threads');
            if (res.data && res.data.success) {
                setPlannedTasks(res.data.tasks || []);
            }
        } catch (e) {
            console.error('Failed to load planned tasks', e);
        } finally {
            setIsLoadingTasks(false);
        }
    };

    const loadAccountInsights = async (accountId: string) => {
        if (!accountId) return;
        setIsLoadingInsights(true);
        try {
            const acc = accounts.find(a => a.account_id === accountId);
            if (!acc) return;
            
            const res = await api.get(`/threads/account-insights/${acc.id}`);
            if (res.data && res.data.success) {
                setAccountInsights(res.data);
            }
        } catch (e) {
            console.error('Failed to load insights', e);
        } finally {
            setIsLoadingInsights(false);
        }
    };

    useEffect(() => {
        loadAccounts();
        loadPlannedTasks();
    }, []);

    useEffect(() => {
        if (selectedAccountIds.length > 0) {
            loadAccountInsights(selectedAccountIds[0]);
        }
    }, [selectedAccountIds, accounts]);


    const handleDeleteAccount = (id: number) => {
        showConfirm({
            title: 'Remover Conta',
            message: 'Tem certeza que deseja remover esta conta do Threads?',
            onConfirm: async () => {
                try {
                    await api.delete(`/threads/accounts/${id}`);
                    loadAccounts();
                    showAlert('Conta removida', 'success');
                } catch (error) {
                    showAlert('Erro ao remover conta', 'error');
                }
            }
        });
    };

    const toggleAccountSelection = (accountId: string) => {
        setSelectedAccountIds(prev => 
            prev.includes(accountId) 
                ? prev.filter(id => id !== accountId) 
                : [...prev, accountId]
        );
    };

    const handlePostNow = async () => {
        if (selectedAccountIds.length === 0) return showAlert('Selecione ao menos uma conta', 'error');
        if (!postText) return showAlert('Digite o texto do post', 'error');

        setLoading(true);
        try {
            showAlert('Iniciando disparos...', 'info');
            
            // Post to all selected accounts
            const results = await Promise.allSettled(selectedAccountIds.map(accountId => 
                api.post('/threads/post-now', {
                    text: postText,
                    mediaUrl: mediaUrl || undefined,
                    mediaType: mediaUrl ? mediaType : undefined,
                    accountId: accountId
                })
            ));

            const successes = results.filter(r => r.status === 'fulfilled' && (r.value as any).data.success).length;
            const failures = results.length - successes;

            if (failures === 0) {
                showAlert(`✅ Sucesso! Post publicado em ${successes} conta(s).`, 'success');
                setPostText('');
                setMediaUrl('');
            } else if (successes > 0) {
                showAlert(`⚠️ Post publicado em ${successes} conta(s), mas falhou em ${failures}. Verifique as notificações.`, 'warning');
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
        if (selectedAccountIds.length === 0) return showAlert('Selecione ao menos uma conta', 'error');
        
        setLoading(true);
        try {
            const threadsAccounts = accounts
                .filter(acc => selectedAccountIds.includes(acc.account_id))
                .map(acc => ({ id: acc.account_id, name: acc.username }));

            const response = await api.post('/threads/schedule', {
                threadsAccounts,
                shopeeSettings: shopeeAffiliateSettings,
                messageTemplate: messageTemplate,
                schedule: {
                    times: customTimes,
                    scheduleMode: 'automated',
                    productCount,
                    enabled: automationEnabled,
                    randomVariation,
                    contentType,
                    shopeeMediaMode
                }
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
            className="space-y-8 pb-20 max-w-[1400px] mx-auto"
        >
            {/* --- TOP GLASS HEADER --- */}
            <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 to-blue-600 rounded-[2rem] blur opacity-25 group-hover:opacity-40 transition duration-1000"></div>
                <CommandCard className="relative bg-white/80 backdrop-blur-xl border-white shadow-2xl rounded-[1.8rem] overflow-hidden">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-2">
                        <div className="flex items-center gap-6">
                            <div className="w-20 h-20 bg-black rounded-3xl flex items-center justify-center shadow-2xl transform -rotate-3 hover:rotate-0 transition-all duration-500">
                                <AtSign size={40} className="text-white" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="px-2 py-0.5 bg-purple-100 text-[9px] font-black text-purple-600 rounded-full uppercase tracking-tighter">V1.0.4 - STABLE</span>
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                </div>
                                <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                                    Threads<span className="text-purple-600">.Automation</span>
                                </h1>
                                <p className="text-sm text-gray-500 font-bold max-w-md leading-tight mt-1">
                                    Controle total sobre seus achadinhos. Potencialize seu alcance com a nova rede social da Meta.
                                </p>
                            </div>
                        </div>

                        {/* Stats Panel */}
                        <div className="flex items-center gap-4 bg-gray-50/50 p-4 rounded-[1.4rem] border border-gray-100">
                            <div className="text-center px-4 border-r border-gray-200">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Seguidores</p>
                                <p className="text-xl font-black text-gray-900">{accountInsights?.profile?.follower_count || '0'}</p>
                            </div>
                            <div className="text-center px-4 border-r border-gray-200">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Alcance (30d)</p>
                                <p className="text-xl font-black text-purple-600">
                                    {accountInsights?.insights?.find((i: any) => i.name === 'views')?.values[0]?.value || '0'}
                                </p>
                            </div>
                            <div className="text-center px-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Engajamento</p>
                                <p className="text-xl font-black text-blue-600">
                                    {accountInsights?.insights?.find((i: any) => i.name === 'likes')?.values[0]?.value || '0'}
                                </p>
                            </div>
                        </div>
                    </div>
                </CommandCard>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* --- COLUNA ESQUERDA (CONTAS E POST RÁPIDO) --- */}
                <div className="lg:col-span-4 space-y-8">
                    
                    {/* Glass Account Card */}
                    <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.6rem]">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <User size={16} className="text-purple-600" /> Contas Conectadas
                            </h3>
                            {setActiveTab && (
                                <button 
                                    onClick={() => setActiveTab('accounts')}
                                    className="p-2 bg-gray-100 rounded-xl hover:bg-black hover:text-white transition-all duration-300"
                                >
                                    <Settings size={14} />
                                </button>
                            )}
                        </div>

                        <div className="space-y-3">
                            {accounts.length === 0 ? (
                                <div className="text-center py-10 bg-gray-50/50 rounded-[1.2rem] border-2 border-dashed border-gray-200">
                                    <AtSign size={32} className="mx-auto text-gray-300 mb-2" />
                                    <p className="text-[10px] text-gray-400 font-black uppercase mb-4">Nenhuma conta ativa</p>
                                    <TacticalButton variant="secondary" size="sm" onClick={() => setActiveTab?.('accounts')}>CONECTAR AGORA</TacticalButton>
                                </div>
                            ) : (
                                accounts.map((acc) => (
                                    <div 
                                        key={acc.id}
                                        onClick={() => toggleAccountSelection(acc.account_id)}
                                        className={`group relative p-4 rounded-[1.2rem] border-2 transition-all duration-500 cursor-pointer overflow-hidden ${
                                            selectedAccountIds.includes(acc.account_id) 
                                                ? 'border-purple-600 bg-purple-50/30' 
                                                : 'border-transparent bg-gray-50/50 hover:bg-white hover:border-gray-200'
                                        }`}
                                    >
                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className="w-12 h-12 rounded-2xl bg-white overflow-hidden shadow-md transform group-hover:scale-110 transition-transform duration-500 relative">
                                                <img src={acc.profile_picture_url || `https://ui-avatars.com/api/?name=${acc.username}&background=random`} alt={acc.username} />
                                                {selectedAccountIds.includes(acc.account_id) && (
                                                    <div className="absolute inset-0 bg-purple-600/20 flex items-center justify-center">
                                                        <CheckCircle size={20} className="text-white fill-purple-600" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-sm font-black text-gray-900">@{acc.username}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`w-1.5 h-1.5 rounded-full ${selectedAccountIds.includes(acc.account_id) ? 'bg-green-500' : 'bg-gray-300'}`}></span>
                                                    <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                                                        {selectedAccountIds.includes(acc.account_id) ? 'Selecionada' : 'Não Selecionada'}
                                                    </p>
                                                </div>
                                            </div>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </CommandCard>

                    {/* Manual Post UI */}
                    <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.6rem]">
                        <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 mb-6">
                            <Send size={16} className="text-purple-600" /> Postagem Imediata
                        </h3>
                        <div className="space-y-4">
                            <div className="relative">
                                <textarea 
                                    value={postText}
                                    onChange={(e) => setPostText(e.target.value)}
                                    placeholder="O que vamos postar agora?"
                                    className="w-full h-32 px-5 py-4 bg-gray-50/50 border border-gray-100 rounded-[1.2rem] text-sm font-medium outline-none focus:bg-white focus:border-purple-300 focus:ring-4 focus:ring-purple-50 transition-all resize-none"
                                />
                                <div className="absolute bottom-4 right-4 text-[10px] font-black text-gray-300">
                                    {postText.length} CARACTERES
                                </div>
                            </div>
                            
                            <div className="p-4 bg-gray-50/50 rounded-[1.2rem] border border-gray-100 space-y-4">
                                <div className="flex items-center gap-3 px-3 py-2 bg-white rounded-xl border border-gray-100 focus-within:border-purple-300 transition-all">
                                    <LinkIcon size={14} className="text-purple-500" />
                                    <input 
                                        type="text"
                                        value={mediaUrl}
                                        onChange={(e) => setMediaUrl(e.target.value)}
                                        placeholder="URL da Imagem ou Vídeo"
                                        className="flex-1 bg-transparent text-[11px] font-bold outline-none text-gray-600"
                                    />
                                </div>
                                
                                {mediaUrl && (
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => setMediaType('image')}
                                            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mediaType === 'image' ? 'bg-black text-white' : 'bg-white text-gray-400 border border-gray-100'}`}
                                        >
                                            <ImageIcon size={12} className="inline mr-1" /> IMAGEM
                                        </button>
                                        <button 
                                            onClick={() => setMediaType('video')}
                                            className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${mediaType === 'video' ? 'bg-black text-white' : 'bg-white text-gray-400 border border-gray-100'}`}
                                        >
                                            <Video size={12} className="inline mr-1" /> VÍDEO
                                        </button>
                                    </div>
                                )}
                            </div>

                            <TacticalButton 
                                fullWidth 
                                onClick={handlePostNow} 
                                loading={loading}
                                color="black"
                                icon={Zap}
                                className="py-6 rounded-[1.2rem] text-xs shadow-2xl"
                            >
                                DISPARAR AGORA
                            </TacticalButton>
                        </div>
                    </CommandCard>
                </div>

                {/* --- COLUNA DIREITA (AUTOMAÇÃO E FILTROS) --- */}
                <div className="lg:col-span-8 space-y-8">
                    
                    {/* Main Automation Controller */}
                    <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.8rem] relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-100 rounded-full blur-3xl opacity-20 -mr-32 -mt-32"></div>
                        
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-10 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className="p-4 bg-black rounded-2xl text-white shadow-xl rotate-3 hover:rotate-0 transition-all">
                                    <Sparkles size={24} />
                                </div>
                                <div>
                                    <h3 className="text-base font-black text-gray-900 uppercase tracking-widest">Agendamento de Elite</h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Motor de Automação Shopee v2.0</p>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2 p-1.5 bg-gray-100 rounded-2xl border border-gray-200">
                                <button 
                                    onClick={() => setAutomationEnabled(false)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${!automationEnabled ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}
                                >
                                    DESATIVADO
                                </button>
                                <button 
                                    onClick={() => setAutomationEnabled(true)}
                                    className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${automationEnabled ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                                >
                                    ATIVO
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 relative z-10">
                            
                            {/* Content Filters - THE NEW STUFF */}
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <Layout size={14} className="text-purple-600" /> Tipo de Postagem
                                    </label>
                                    <div className="grid grid-cols-2 gap-3">
                                        {[
                                            { id: 'text', label: 'Só Texto', icon: FileText },
                                            { id: 'image', label: 'Só Imagem', icon: ImageIcon },
                                            { id: 'video', label: 'Só Vídeo', icon: Video },
                                            { id: 'shopee', label: 'Produto Shopee', icon: ShoppingBag },
                                        ].map((type) => (
                                            <button
                                                key={type.id}
                                                onClick={() => setContentType(type.id as any)}
                                                className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 ${contentType === type.id ? 'border-purple-600 bg-purple-50' : 'border-gray-100 bg-white hover:border-gray-200'}`}
                                            >
                                                <type.icon size={20} className={contentType === type.id ? 'text-purple-600' : 'text-gray-400'} />
                                                <span className={`text-[10px] font-black uppercase ${contentType === type.id ? 'text-purple-600' : 'text-gray-400'}`}>{type.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <AnimatePresence mode="wait">
                                    {contentType === 'shopee' && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="space-y-4 p-5 bg-gray-50/50 rounded-3xl border border-gray-100"
                                        >
                                            <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                                <Filter size={14} className="text-blue-600" /> Filtro de Mídia Shopee
                                            </label>
                                            <div className="space-y-2">
                                                {[
                                                    { id: 'any', label: 'Qualquer Mídia (Tudo)', desc: 'Posta imagem ou vídeo, o que estiver disponível' },
                                                    { id: 'video_only', label: 'Apenas Vídeo', desc: 'Ignora produtos que não possuam vídeo' },
                                                    { id: 'image_only', label: 'Apenas Imagem', desc: 'Posta apenas a imagem principal' },
                                                    { id: 'video_preferred', label: 'Prioridade Vídeo', desc: 'Tenta vídeo primeiro, senão vai imagem' },
                                                ].map((mode) => (
                                                    <button
                                                        key={mode.id}
                                                        onClick={() => setShopeeMediaMode(mode.id as any)}
                                                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${shopeeMediaMode === mode.id ? 'bg-white border-blue-500 shadow-sm' : 'bg-transparent border-transparent hover:bg-white/50'}`}
                                                    >
                                                        <div className={`w-3 h-3 rounded-full border-2 ${shopeeMediaMode === mode.id ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}></div>
                                                        <div>
                                                            <p className={`text-[10px] font-black uppercase tracking-tight ${shopeeMediaMode === mode.id ? 'text-gray-900' : 'text-gray-500'}`}>{mode.label}</p>
                                                            <p className="text-[9px] font-medium text-gray-400">{mode.desc}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Cycles & Times */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center justify-between">
                                            Ciclo Diário <span>{productCount} itens</span>
                                        </label>
                                        <input 
                                            type="range" min="1" max="50" 
                                            value={productCount} 
                                            onChange={(e) => setProductCount(parseInt(e.target.value))}
                                            className="w-full accent-black"
                                        />
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
                                    <div className="flex items-center gap-4">
                                        <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                            <Clock size={14} className="text-purple-600" /> Cronograma de Postagem
                                        </label>
                                        <button 
                                            onClick={() => setCustomTimes(["11:00", "15:00", "18:00", "20:00", "22:00"].sort())}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95"
                                        >
                                            <Zap size={10} fill="currentColor" /> Sugerir Horários
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {customTimes.map((time, idx) => (
                                            <div key={idx} className="flex items-center bg-white border-2 border-gray-100 rounded-2xl px-4 py-3 group hover:border-black transition-all">
                                                <input 
                                                    type="time" 
                                                    value={time}
                                                    onChange={(e) => {
                                                        const newTimes = [...customTimes];
                                                        newTimes[idx] = e.target.value;
                                                        setCustomTimes(newTimes);
                                                    }}
                                                    className="bg-transparent text-sm font-black outline-none"
                                                />
                                                <button 
                                                    onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))}
                                                    className="ml-2 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        <button 
                                            onClick={() => setCustomTimes([...customTimes, '12:00'])}
                                            className="flex items-center justify-center w-12 h-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-300 hover:border-black hover:text-black transition-all"
                                        >
                                            <Plus size={20} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <FileText size={14} className="text-purple-600" /> Máscara da Legenda
                                    </label>
                                    <textarea 
                                        value={messageTemplate}
                                        onChange={(e) => setMessageTemplate(e.target.value)}
                                        className="w-full h-[220px] p-6 bg-gray-50/50 border border-gray-100 rounded-3xl text-xs font-bold leading-relaxed outline-none focus:bg-white focus:border-black transition-all resize-none shadow-inner"
                                    />
                                    <div className="flex flex-wrap gap-1.5">
                                        {['{product_name}', '{preco_com_desconto}', '{link}'].map(tag => (
                                            <span key={tag} className="px-2 py-1 bg-black/5 text-[9px] font-black text-gray-500 rounded-lg border border-gray-200 uppercase tracking-tighter">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-6 relative z-10">
                            <div className="flex items-center gap-6">
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={16} className="text-green-500" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">Security Active</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Zap size={16} className="text-yellow-500" />
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400">High Speed</span>
                                </div>
                            </div>
                            
                            <TacticalButton 
                                onClick={handleSaveSchedule} 
                                loading={loading}
                                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-12 py-6 rounded-[1.4rem] font-black text-xs shadow-xl shadow-purple-200 hover:scale-[1.05]"
                            >
                                SALVAR CONFIGURAÇÃO MASTER
                            </TacticalButton>
                        </div>
                    </CommandCard>

                    {/* Queue Management - Premium List */}
                    <div className="space-y-8">
                        {/* --- PERFORMANCE DASHBOARD (NEW) --- */}
                        <AnimatePresence>
                            {accountInsights && (
                                <motion.div 
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="grid grid-cols-2 md:grid-cols-4 gap-4"
                                >
                                    {[
                                        { 
                                            label: 'Visualizações', 
                                            value: accountInsights?.insights?.find((i: any) => i.name === 'views')?.values[0]?.value || 0,
                                            icon: Activity,
                                            color: 'text-purple-600',
                                            bg: 'bg-purple-50'
                                        },
                                        { 
                                            label: 'Curtidas', 
                                            value: accountInsights?.insights?.find((i: any) => i.name === 'likes')?.values[0]?.value || 0,
                                            icon: Sparkles,
                                            color: 'text-pink-600',
                                            bg: 'bg-pink-50'
                                        },
                                        { 
                                            label: 'Reposts', 
                                            value: accountInsights?.insights?.find((i: any) => i.name === 'reposts')?.values[0]?.value || 0,
                                            icon: RefreshCw,
                                            color: 'text-blue-600',
                                            bg: 'bg-blue-50'
                                        },
                                        { 
                                            label: 'Respostas', 
                                            value: accountInsights?.insights?.find((i: any) => i.name === 'replies')?.values[0]?.value || 0,
                                            icon: MessageSquare,
                                            color: 'text-green-600',
                                            bg: 'bg-green-50'
                                        }
                                    ].map((stat, i) => (
                                        <CommandCard key={i} className="bg-white/80 border-white shadow-lg p-5 flex flex-col items-center text-center group hover:scale-[1.05] transition-all duration-300">
                                            <div className={`p-3 ${stat.bg} ${stat.color} rounded-2xl mb-3 group-hover:rotate-12 transition-transform`}>
                                                <stat.icon size={20} />
                                            </div>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{stat.label}</p>
                                            <p className={`text-2xl font-black ${stat.color} mt-1`}>{Number(stat.value).toLocaleString('pt-BR')}</p>
                                        </CommandCard>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <CommandCard className="bg-white/90 backdrop-blur-md border-white/40 shadow-xl rounded-[1.8rem]">
                            <div className="flex items-center justify-between mb-8">
                                <div>
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                        <Calendar size={16} className="text-purple-600" /> Fila de Execução
                                    </h3>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Próximos 50 disparos agendados</p>
                                </div>
                                <button 
                                    onClick={loadPlannedTasks} 
                                    className="p-3 bg-gray-50 rounded-2xl text-gray-400 hover:text-black hover:bg-gray-100 transition-all duration-300"
                                >
                                    <RefreshCw size={16} className={isLoadingTasks ? 'animate-spin' : ''} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                <AnimatePresence>
                                    {plannedTasks.length === 0 ? (
                                        <div className="col-span-2 py-16 text-center bg-gray-50/50 rounded-3xl border-2 border-dashed border-gray-100">
                                            <Clock size={32} className="mx-auto text-gray-200 mb-3" />
                                            <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em]">Radar Vazio: Nenhum post na fila</p>
                                        </div>
                                    ) : (
                                        plannedTasks.map((task, idx) => (
                                            <motion.div 
                                                key={idx}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className="p-5 bg-white border border-gray-100 rounded-2xl flex items-center justify-between group hover:border-black hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-gray-50 rounded-xl flex items-center justify-center text-gray-300 group-hover:bg-black group-hover:text-white transition-all duration-500">
                                                        <ShoppingBag size={20} />
                                                    </div>
                                                    <div>
                                                        <p className="text-[11px] font-black text-gray-900 uppercase">Achadinho #{idx + 1}</p>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <Clock size={10} className="text-purple-600" />
                                                            <p className="text-[10px] font-black text-gray-400">
                                                                {new Date(task.planned_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="px-2 py-1 bg-green-50 text-[8px] font-black text-green-600 rounded-md border border-green-100 uppercase tracking-tighter">Pronto</span>
                                                    <span className="text-[8px] font-bold text-gray-300 uppercase tracking-tighter">{task.platform}</span>
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

export default ThreadsAutomationPage;
