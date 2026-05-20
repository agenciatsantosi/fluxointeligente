import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldAlert, ZapOff, Activity, AlertTriangle, Settings, RefreshCw, Smartphone, MonitorPlay, MessageCircle, Send, AtSign, Youtube, Twitter, Globe, UserCheck, Video } from 'lucide-react';
import { motion } from 'framer-motion';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

const PlatformLimitsPage: React.FC = () => {
    const { showAlert } = useAlert();
    const [loading, setLoading] = useState(true);
    const [safeMode, setSafeMode] = useState(false);
    const [allLimits, setAllLimits] = useState<any[]>([]);
    const [allUsages, setAllUsages] = useState<any[]>([]);
    const [defaultLimits, setDefaultLimits] = useState<any>({});
    const [accounts, setAccounts] = useState<any>({
        instagram: [], facebook: [], whatsapp: [], telegram: [], threads: [], youtube: [], twitter: [], tiktok: []
    });
    const [selectedAccountId, setSelectedAccountId] = useState<string>('default');
    const [limits, setLimits] = useState<any>({
        instagram: [], facebook: [], whatsapp: [], telegram: [], threads: [], youtube: [], twitter: [], tiktok: []
    });
    const [activeTab, setActiveTab] = useState('instagram');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    // Reset selected account when tab changes
    useEffect(() => {
        setSelectedAccountId('default');
    }, [activeTab]);

    const loadData = async () => {
        setLoading(true);
        try {
            const res = await api.get('/limits/dashboard');
            if (res.data.success) {
                setLimits(res.data.limits);
                setSafeMode(res.data.safeMode);
                setAllLimits(res.data.allLimits || []);
                setAllUsages(res.data.allUsages || []);
                setDefaultLimits(res.data.defaultLimits || {});
                setAccounts(res.data.accounts || {
                    instagram: [], facebook: [], whatsapp: [], telegram: [], threads: [], youtube: [], twitter: [], tiktok: []
                });
            }
        } catch (error) {
            showAlert('error', 'Erro ao carregar dados de segurança');
        } finally {
            setLoading(false);
        }
    };

    const toggleSafeMode = async () => {
        try {
            const newState = !safeMode;
            setSafeMode(newState);
            const res = await api.post('/limits/safe-mode', { enabled: newState });
            if (res.data.success) {
                showAlert('success', `Modo Seguro ${newState ? 'Ativado' : 'Desativado'}`);
                loadData();
            }
        } catch (error) {
            setSafeMode(!safeMode);
            showAlert('error', 'Erro ao alterar modo seguro');
        }
    };

    const handleLimitChange = (type: string, value: number) => {
        // If updating for selected account, we look or create custom rows in state
        const updatedLimits = [...allLimits];
        const idx = updatedLimits.findIndex(l => l.platform === activeTab && l.limit_type === type && l.account_id === selectedAccountId);
        
        if (idx !== -1) {
            updatedLimits[idx].daily_max = value;
        } else {
            updatedLimits.push({
                platform: activeTab,
                limit_type: type,
                daily_max: value,
                is_enabled: true,
                account_id: selectedAccountId
            });
        }
        setAllLimits(updatedLimits);
    };

    const saveLimit = async (type: string) => {
        setSaving(true);
        try {
            const currentItem = allLimits.find(l => l.platform === activeTab && l.limit_type === type && l.account_id === selectedAccountId);
            const maxVal = currentItem ? currentItem.daily_max : (defaultLimits[activeTab]?.find((d: any) => d.type === type)?.max || 10);
            const enabledVal = currentItem ? currentItem.is_enabled : true;

            const res = await api.post('/limits/update', {
                platform: activeTab,
                type,
                max: maxVal,
                enabled: enabledVal,
                accountId: selectedAccountId
            });
            if (res.data.success) {
                showAlert('success', 'Limite atualizado com sucesso!');
                loadData();
            }
        } catch (error) {
            showAlert('error', 'Erro ao salvar limite.');
        } finally {
            setSaving(false);
        }
    };

    const getRiskColor = (current: number, max: number) => {
        if (max === 0) return 'bg-gray-200 text-gray-500';
        const percent = (current / max) * 100;
        if (percent >= 90) return 'bg-red-500 text-red-700';
        if (percent >= 70) return 'bg-yellow-400 text-yellow-700';
        return 'bg-green-500 text-green-700';
    };
    
    const getRiskBg = (current: number, max: number) => {
        if (max === 0) return 'bg-gray-200';
        const percent = (current / max) * 100;
        if (percent >= 90) return 'bg-red-500';
        if (percent >= 70) return 'bg-yellow-400';
        return 'bg-green-500';
    };

    const tabs = [
        { id: 'instagram', label: 'Instagram', icon: <MonitorPlay size={18} /> },
        { id: 'facebook', label: 'Facebook', icon: <MonitorPlay size={18} /> },
        { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle size={18} /> },
        { id: 'telegram', label: 'Telegram', icon: <Send size={18} /> },
        { id: 'threads', label: 'Threads', icon: <AtSign size={18} /> },
        { id: 'youtube', label: 'YouTube Shorts', icon: <Youtube size={18} /> },
        { id: 'twitter', label: 'Twitter/X', icon: <Twitter size={18} /> },
        { id: 'tiktok', label: 'TikTok', icon: <Video size={18} /> }
    ];

    const currentTabAccounts = accounts[activeTab] || [];

    if (loading) {
        return <div className="flex items-center justify-center p-20"><RefreshCw className="animate-spin text-purple-600" size={32} /></div>;
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto pb-20">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-900 rounded-3xl p-8 text-white flex flex-col md:flex-row justify-between items-start md:items-center shadow-xl">
                <div>
                    <h2 className="text-2xl font-black flex items-center gap-3">
                        <ShieldCheck className="text-emerald-400" size={32} />
                        Centro de Segurança e Limites
                    </h2>
                    <p className="text-indigo-200 mt-2 text-sm max-w-xl leading-relaxed">
                        Controle o volume de automações diárias para proteger suas contas contra banimentos e bloqueios (shadowbans).
                    </p>
                </div>
                
                <div className="mt-6 md:mt-0 bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-2xl flex items-center gap-4">
                    <div className="flex flex-col">
                        <span className="text-xs text-indigo-200 font-bold uppercase tracking-wider">Modo Seguro</span>
                        <span className="text-sm font-medium text-white">IA de Proteção</span>
                    </div>
                    <button 
                        onClick={toggleSafeMode}
                        className={`relative w-14 h-8 rounded-full transition-colors duration-300 flex items-center px-1 ${safeMode ? 'bg-emerald-500' : 'bg-slate-600'}`}
                    >
                        <motion.div 
                            layout 
                            className="w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center"
                            animate={{ x: safeMode ? 24 : 0 }}
                        >
                            {safeMode ? <ShieldCheck size={14} className="text-emerald-500" /> : <ZapOff size={14} className="text-slate-400" />}
                        </motion.div>
                    </button>
                </div>
            </div>

            {safeMode && (
                <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-4 items-start shadow-sm shadow-emerald-100">
                    <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600 shrink-0 mt-1">
                        <Activity size={20} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-emerald-800">Modo Seguro Ativado</h4>
                        <p className="text-xs text-emerald-600 mt-1">O sistema adicionará delays extras aleatórios entre postagens e reduzirá pela metade seus limites máximos diários temporariamente para simular comportamento humano e aquecer suas contas.</p>
                    </div>
                </motion.div>
            )}

            {/* Platform Tabs */}
            <div className="flex flex-wrap gap-2 mb-2">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-3 rounded-2xl text-sm font-bold transition-all flex items-center gap-2 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-100'}`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Account Selector (Subpills) */}
            <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm space-y-3">
                <span className="text-xs text-gray-400 font-bold uppercase tracking-wider block">Selecione a Conta para Ajustar Limites:</span>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setSelectedAccountId('default')}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${selectedAccountId === 'default' ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm shadow-indigo-100' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'}`}
                    >
                        <Globe size={14} />
                        🌐 Configuração Geral (Padrão)
                    </button>
                    
                    {currentTabAccounts.length === 0 ? (
                        <div className="text-xs text-gray-400 flex items-center gap-1 py-2 px-1">
                            <AlertTriangle size={12} className="text-amber-500" />
                            Nenhuma conta conectada a esta rede. Usando apenas regras de envio padrão.
                        </div>
                    ) : (
                        currentTabAccounts.map((acc: any) => (
                            <button
                                key={acc.id}
                                onClick={() => setSelectedAccountId(acc.id)}
                                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${selectedAccountId === acc.id ? 'bg-emerald-50 border-emerald-200 text-emerald-700 shadow-sm shadow-emerald-100' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'}`}
                            >
                                <UserCheck size={14} />
                                {acc.name}
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Custom limits status notification */}
            {selectedAccountId !== 'default' && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-center text-amber-800 text-xs font-medium">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0" />
                    <span>
                        Você está visualizando os limites específicos para <strong>{currentTabAccounts.find((a: any) => a.id === selectedAccountId)?.name || selectedAccountId}</strong>. Se nenhum limite personalizado for definido aqui, a conta herdará automaticamente a <strong>Configuração Geral</strong>.
                    </span>
                </div>
            )}

            {/* Content list */}
            <div className="grid grid-cols-1 gap-6">
                {(defaultLimits[activeTab] || []).map((def: any) => {
                    // Resolve limits max and enabled
                    const customLimit = allLimits.find(l => l.platform === activeTab && l.limit_type === def.type && l.account_id === selectedAccountId);
                    const defaultLimit = allLimits.find(l => l.platform === activeTab && l.limit_type === def.type && l.account_id === 'default');
                    
                    const maxVal = customLimit ? customLimit.daily_max : (defaultLimit ? defaultLimit.daily_max : def.max);
                    const isEnabled = customLimit ? customLimit.is_enabled : (defaultLimit ? defaultLimit.is_enabled : true);

                    // Resolve current usage
                    let currentVal = 0;
                    if (selectedAccountId === 'default') {
                        // Sum total today's usage across all accounts for the overall dashboard
                        const usagesForType = allUsages.filter(u => u.platform === activeTab && u.limit_type === def.type);
                        currentVal = usagesForType.reduce((acc, u) => acc + parseInt(u.count || 0), 0);
                    } else {
                        // Single account usage
                        const accountUsage = allUsages.find(u => u.platform === activeTab && u.limit_type === def.type && u.account_id === selectedAccountId);
                        currentVal = accountUsage ? parseInt(accountUsage.count || 0) : 0;
                    }

                    const percent = maxVal > 0 ? (currentVal / maxVal) * 100 : 0;
                    
                    return (
                        <div key={def.type} className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                                <div className="flex-1 w-full">
                                    <div className="flex justify-between items-end mb-2">
                                        <div className="flex flex-col">
                                            <h4 className="text-sm font-bold text-gray-800">{def.label}</h4>
                                            {selectedAccountId !== 'default' && !customLimit && (
                                                <span className="text-[10px] text-amber-500 font-bold block mt-0.5">Herdando limite da Configuração Geral</span>
                                            )}
                                        </div>
                                        <span className={`text-xs font-black px-2 py-1 rounded-lg ${getRiskColor(currentVal, maxVal).replace('bg-', 'bg-opacity-20 bg-')}`}>
                                            {currentVal} / {maxVal}
                                        </span>
                                    </div>
                                    <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                                        <motion.div 
                                            initial={{ width: 0 }}
                                            animate={{ width: `${Math.min(100, percent)}%` }}
                                            className={`h-full ${getRiskBg(currentVal, maxVal)}`}
                                            transition={{ duration: 1, ease: 'easeOut' }}
                                        />
                                    </div>
                                    {percent >= 90 && (
                                        <div className="flex items-center gap-1.5 mt-3 text-[10px] font-bold text-red-500 uppercase tracking-wider">
                                            <AlertTriangle size={12} />
                                            Limite Diário de Segurança Praticamente Atingido!
                                        </div>
                                    )}
                                </div>
                                
                                <div className="w-full md:w-auto flex items-center gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100 shrink-0">
                                    <div className="flex flex-col px-2">
                                        <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-1">Ajustar Limite</span>
                                        <input 
                                            type="number" 
                                            value={maxVal}
                                            onChange={(e) => handleLimitChange(def.type, parseInt(e.target.value) || 0)}
                                            className="w-20 bg-white border border-gray-200 rounded-xl px-2 py-1 text-sm font-bold text-gray-800 text-center outline-none focus:border-indigo-500"
                                            min="0"
                                        />
                                    </div>
                                    <button 
                                        onClick={() => saveLimit(def.type)}
                                        disabled={saving}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl p-2 transition-colors disabled:opacity-50"
                                        title="Salvar Limite"
                                    >
                                        <Settings size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            
            {/* Security and Warm-up Guide Card */}
            <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 border border-indigo-800/30 rounded-3xl p-6 md:p-8 shadow-xl mt-8">
                <div className="flex items-center gap-3 mb-6">
                    <div className="bg-indigo-500/10 p-2.5 rounded-xl border border-indigo-500/20 text-indigo-400">
                        <ShieldAlert size={24} />
                    </div>
                    <div>
                        <h3 className="text-base font-black text-white">Guia de Aquecimento e Boas Práticas de Automação</h3>
                        <p className="text-[11px] text-indigo-300">Evite bloqueios e shadowbans aplicando estratégias profissionais recomendadas pelas APIs.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Column 1: Warm-up Strategy */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400">Cronograma de Aquecimento Gradual</h4>
                        <p className="text-xs text-slate-300 leading-relaxed">
                            Contas recém-criadas ou que nunca usaram automação precisam ser aquecidas progressivamente para aumentar a reputação do IP e da conta:
                        </p>
                        
                        <div className="space-y-2.5">
                            <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-3">
                                <div>
                                    <span className="text-xs font-bold text-white block">Semana 1</span>
                                    <span className="text-[10px] text-slate-400">Excelente para contas novas</span>
                                </div>
                                <span className="text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                                    3 a 5 posts / dia
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-3">
                                <div>
                                    <span className="text-xs font-bold text-white block">Semana 2</span>
                                    <span className="text-[10px] text-slate-400">Aquecimento intermediário</span>
                                </div>
                                <span className="text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                                    8 a 10 posts / dia
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white/5 border border-white/10 rounded-xl p-3">
                                <div>
                                    <span className="text-xs font-bold text-white block">Semana 3</span>
                                    <span className="text-[10px] text-slate-400">Limite seguro recomendado</span>
                                </div>
                                <span className="text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                                    15 a 20 posts / dia
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Column 2: Best Practices */}
                    <div className="space-y-4">
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-400">Recomendações Cruciais do Threads / Instagram</h4>
                        <div className="space-y-3.5">
                            <div className="flex gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-2" />
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    <strong>Intervalo de Postagens:</strong> O ideal é manter um espaço de 30 a 90 minutos entre as ações. O nosso <strong>Modo Seguro</strong> gerencia esses delays automaticamente para você!
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-2" />
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    <strong>Evite Conteúdo Idêntico:</strong> Postar exatamente o mesmo vídeo ou texto em massa ativa filtros de spam. Varie suas legendas, hashtags e use a rotação natural do agendador.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0 mt-2" />
                                <p className="text-xs text-slate-300 leading-relaxed">
                                    <strong>Ações Seguras:</strong> O agendamento e publicação automática de posts e vídeos é a automação oficial mais segura permitida pela API. Evite abusar de comentários repetitivos ou DMs em massa.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlatformLimitsPage;
