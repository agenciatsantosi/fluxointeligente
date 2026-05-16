import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { Youtube, Plus, Trash2, Play, Check, Clock, RefreshCw, AlertCircle, ExternalLink, Calendar, Trash, Activity, Zap } from 'lucide-react';
import { TacticalButton } from '../components/MotionComponents';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

const YouTubeAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [accounts, setAccounts] = useState<Array<{ id: number; channel_name: string; channel_id: string; profile_picture_url?: string }>>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Automation Settings
    const [productCount, setProductCount] = useState(5);
    const [categoryType, setCategoryType] = useState('random');
    const [enableRotation, setEnableRotation] = useState(true);
    
    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'single' | 'multiple'>('single');
    const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily');
    const [time, setTime] = useState('09:00');
    const [times, setTimes] = useState<string[]>(['09:00']);
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '12:00', '15:00', '18:00']);
    const [randomVariation, setRandomVariation] = useState(10);
    const [plannedTasks, setPlannedTasks] = useState<any[]>([]);
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const { showAlert } = useAlert();
    const [apiConfig, setApiConfig] = useState({ clientId: '', clientSecret: '' });
    const [savingConfig, setSavingConfig] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    const userData = localStorage.getItem('user');
    const user = userData ? JSON.parse(userData) : null;

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        showAlert(message, type as any);
    };

    useEffect(() => {
        loadAccounts();
        loadPlannedTasks();
        if (user?.role === 'admin') {
            loadApiConfig();
        }
        
        // Listen for message from OAuth popup
        const handleOAuthMessage = (event: MessageEvent) => {
            if (event.data === 'youtube-auth-success') {
                showNotification('✅ Canal conectado com sucesso!', 'success');
                loadAccounts();
            }
        };

        window.addEventListener('message', handleOAuthMessage);
        return () => window.removeEventListener('message', handleOAuthMessage);
    }, []);

    const loadPlannedTasks = async () => {
        try {
            const res = await api.get('/automation/planned-tasks?platform=youtube');
            if (res.data && res.data.success) {
                setPlannedTasks(res.data.tasks || []);
            }
        } catch (e) {
            console.error('Failed to load planned tasks', e);
        }
    };

    const loadApiConfig = async () => {
        try {
            const response = await api.get('/admin/system-settings');
            if (response.data.success) {
                const settings = response.data.settings;
                setApiConfig({
                    clientId: settings.YOUTUBE_CLIENT_ID || '',
                    clientSecret: settings.YOUTUBE_CLIENT_SECRET || ''
                });
                if (!settings.YOUTUBE_CLIENT_ID || !settings.YOUTUBE_CLIENT_SECRET) {
                    setShowConfig(true);
                }
            }
        } catch (error) {
            console.error('Error loading API config:', error);
        }
    };

    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            await api.post('/admin/system-settings', { key: 'YOUTUBE_CLIENT_ID', value: apiConfig.clientId });
            await api.post('/admin/system-settings', { key: 'YOUTUBE_CLIENT_SECRET', value: apiConfig.clientSecret });
            showNotification('✅ Credenciais da API salvas!', 'success');
            setShowConfig(false);
        } catch (error: any) {
            showNotification('❌ Erro ao salvar: ' + error.message, 'error');
        } finally {
            setSavingConfig(false);
        }
    };

    const loadAccounts = async () => {
        setLoading(true);
        try {
            const response = await api.get('/youtube/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(response.data.accounts[0].id);
                }
            }
        } catch (error) {
            console.error('Error loading YouTube accounts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConnectAccount = async () => {
        try {
            const response = await api.get('/youtube/auth');
            if (response.data.success && response.data.url) {
                // Open Google Auth in a popup
                const width = 600;
                const height = 700;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;
                window.open(response.data.url, 'YouTube Auth', `width=${width},height=${height},left=${left},top=${top}`);
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || error.message;
            if (errorMsg.includes('Client ID/Secret')) {
                showNotification('⚠️ Credenciais da API não encontradas. Por favor, configure-as na página de Configurações (Apenas Admin).', 'error');
            } else {
                showNotification('❌ Erro ao iniciar autenticação: ' + errorMsg, 'error');
            }
        }
    };

    const handleDeleteAccount = async (id: number) => {
        if (!confirm('Deseja realmente desconectar este canal?')) return;
        try {
            await api.delete(`/youtube/accounts/${id}`);
            showNotification('✅ Canal desconectado', 'success');
            if (selectedAccountId === id) setSelectedAccountId(null);
            loadAccounts();
        } catch (error: any) {
            showNotification('❌ Erro ao excluir: ' + error.message, 'error');
        }
    };

    const handleSchedule = async () => {
        if (!selectedAccountId) {
            showNotification('❌ Selecione um canal primeiro!', 'error');
            return;
        }

        try {
            const response = await api.post('/scheduler/save', {
                platform: 'youtube',
                config: {
                    accountId: selectedAccountId,
                    productCount,
                    categoryType,
                    enableRotation,
                    scheduleMode: 'multiple',
                    frequency: 'daily',
                    time: customTimes[0] || '12:00',
                    times: customTimes,
                    randomVariation,
                    automationEnabled
                },
                userId: 1 // TODO: Get from auth context
            });

            if (response.data.success) {
                showNotification('✅ Agendamento salvo com sucesso!', 'success');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao salvar: ' + error.message, 'error');
        }
    };

    return (
        <div className="space-y-8 max-w-6xl mx-auto pb-12 font-sans bg-gray-50 min-h-screen p-8">

            {/* Header / Accounts Section */}
            <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-red-600 to-red-500 flex items-center justify-center shadow-lg shadow-red-100">
                            <Youtube size={22} className="text-white" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-red-600 uppercase tracking-[0.3em] block mb-0.5">YOUTUBE_SHORTS</span>
                            <h2 className="font-bold text-gray-900 text-lg">Canais Conectados</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className={`p-3 rounded-xl transition-all ${showConfig ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            title="Configurações da API"
                        >
                            <AlertCircle size={20} />
                        </button>
                        <button
                            onClick={handleConnectAccount}
                            className="px-6 py-3 bg-gradient-to-r from-red-600 to-red-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:shadow-lg hover:shadow-red-200 transition-all active:scale-95 flex items-center gap-2"
                        >
                            <Plus size={16} /> CONECTAR CANAL
                        </button>
                    </div>
                </div>

                {showConfig && user?.role === 'admin' && (
                    <div className="p-8 bg-red-50/50 border-b border-gray-200 animate-in slide-in-from-top duration-300">
                        <div className="max-w-4xl space-y-6">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Configuração da API do YouTube</h3>
                                    <a 
                                        href="https://console.cloud.google.com/apis/credentials" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold text-red-600 hover:underline flex items-center gap-1"
                                    >
                                        ABRIR GOOGLE CLOUD CONSOLE <Plus size={10} className="rotate-45" />
                                    </a>
                                </div>
                                <p className="text-xs text-gray-500">Insira as credenciais do Google Cloud Console para habilitar a conexão.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Client ID</label>
                                    <input 
                                        type="text" 
                                        value={apiConfig.clientId}
                                        onChange={(e) => setApiConfig({...apiConfig, clientId: e.target.value})}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                                        placeholder="000000000-xxx.apps.googleusercontent.com"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Client Secret</label>
                                    <input 
                                        type="password" 
                                        value={apiConfig.clientSecret}
                                        onChange={(e) => setApiConfig({...apiConfig, clientSecret: e.target.value})}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                                        placeholder="GOCSPX-xxxxxxxxxxxxx"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <button 
                                    onClick={handleSaveConfig}
                                    disabled={savingConfig}
                                    className="px-6 py-3 bg-gray-900 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-black transition-all"
                                >
                                    {savingConfig ? 'SALVANDO...' : 'SALVAR CREDENCIAIS'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 p-8">
                    {accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => setSelectedAccountId(acc.id)}
                            className={`p-6 border-2 transition-all cursor-pointer relative group rounded-2xl ${selectedAccountId === acc.id
                                ? 'bg-red-50/50 border-red-500 ring-4 ring-red-50'
                                : 'bg-white border-gray-100 hover:border-red-200 hover:bg-gray-50/50'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                    {acc.profile_picture_url ? (
                                        <img src={acc.profile_picture_url} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="" />
                                    ) : (
                                        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold">
                                            {acc.channel_name.substring(0, 1)}
                                        </div>
                                    )}
                                    <div>
                                        <span className="font-bold text-gray-900 text-sm block">{acc.channel_name}</span>
                                        <span className="text-[10px] text-gray-400 font-medium">ID: {acc.channel_id.substring(0, 15)}...</span>
                                    </div>
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    
                    {accounts.length === 0 && !loading && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/30">
                            <Youtube size={40} className="text-gray-300 mx-auto mb-4" />
                            <h3 className="text-sm font-bold text-gray-900 mb-1">Nenhum canal conectado</h3>
                            <p className="text-xs text-gray-500 mb-6">Conecte seu canal para começar a postar Shorts automaticamente.</p>
                            <button onClick={handleConnectAccount} className="px-8 py-3 bg-red-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-red-700 transition-all shadow-lg shadow-red-100">
                                CONECTAR AGORA
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {selectedAccountId && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                    {/* Left Side: Preview & Info */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <AlertCircle size={18} className="text-blue-500" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">SOBRE O YOUTUBE SHORTS</span>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed mb-6">
                                O YouTube Shorts exige vídeos verticais (9:16) de até 60 segundos. O sistema irá automatizar:
                            </p>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></div>
                                    <span className="text-xs text-gray-500 font-medium">Extração de vídeos dos produtos Shopee.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></div>
                                    <span className="text-xs text-gray-500 font-medium">Geração de títulos chamativos com IA.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></div>
                                    <span className="text-xs text-gray-500 font-medium">Inserção automática de links de afiliado.</span>
                                </li>
                            </ul>
                            
                            <div className="mt-10 p-5 bg-blue-50 border border-blue-100 rounded-2xl">
                                <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-2">COTA DE API</span>
                                <p className="text-[11px] text-blue-800 font-medium">
                                    A API do YouTube permite cerca de 6 uploads por dia. O agendamento respeitará esse limite.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Configuration */}
                    <div className="lg:col-span-8 bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="px-8 py-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <RefreshCw size={18} className="text-red-600" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">CONFIGURAÇÃO DE AUTOMAÇÃO</span>
                            </div>
                        </div>

                        <div className="p-10 space-y-10">
                            {/* Scheduling Block */}
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PRODUTOS POR POST</span>
                                        <input type="number" value={productCount} onChange={(e) => setProductCount(parseInt(e.target.value))} className="w-24 p-3 bg-white border border-gray-200 rounded-xl text-center font-black text-sm text-red-600 focus:outline-none focus:border-red-500" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATEGORIA SHOPEE</span>
                                        <select value={categoryType} onChange={(e) => setCategoryType(e.target.value)} className="w-48 p-3 bg-white border border-gray-200 rounded-xl font-black text-[11px] text-gray-700 uppercase tracking-tighter focus:outline-none focus:border-red-500">
                                            <option value="random">ALEATÓRIO</option>
                                            <option value="achadinhos">ACHADINHOS</option>
                                            <option value="casa">CASA & DECOR</option>
                                            <option value="beleza">BELEZA & MODA</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 bg-white border-2 border-red-100 shadow-xl shadow-red-500/5 rounded-3xl space-y-6">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <h3 className="font-black text-red-600 text-sm uppercase tracking-widest flex items-center gap-2">
                                            <Calendar size={16} /> Agendamento Automático
                                        </h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Busca e posta produtos nos horários programados</p>
                                    </div>
                                    <button 
                                        onClick={() => setAutomationEnabled(!automationEnabled)}
                                        className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${automationEnabled ? 'bg-red-500' : 'bg-gray-200'}`}
                                    >
                                        <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${automationEnabled ? 'transform translate-x-6' : ''}`} />
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {automationEnabled && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-6 overflow-hidden">
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-4">
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Frequência Diária</label>
                                                        <button 
                                                            onClick={() => setCustomTimes(["11:00", "15:00", "18:00", "20:00", "22:00"].sort())}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-600 to-red-500 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95"
                                                        >
                                                            <Zap size={10} fill="currentColor" /> Sugerir Horários
                                                        </button>
                                                    </div>
                                                    <span className="text-[10px] font-black text-red-600 bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 uppercase tracking-wider">{customTimes.length} POSTAGENS POR DIA</span>
                                                </div>
                                                <div className="flex flex-wrap gap-3">
                                                    {customTimes.map((time, idx) => (
                                                        <div key={idx} className="flex items-center gap-2 border border-red-100 bg-red-50/30 px-4 py-2 rounded-xl">
                                                            <input 
                                                                type="time" 
                                                                value={time}
                                                                onChange={(e) => {
                                                                    const newTimes = [...customTimes];
                                                                    newTimes[idx] = e.target.value;
                                                                    setCustomTimes(newTimes);
                                                                }}
                                                                className="bg-transparent font-black text-xs text-red-600 outline-none"
                                                            />
                                                            <button onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors">
                                                                <Trash size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => setCustomTimes([...customTimes, '12:00'])} className="px-4 py-2 border border-dashed border-red-300 text-red-400 hover:text-red-500 hover:border-red-500 rounded-xl font-bold text-xs transition-all uppercase tracking-widest">
                                                        + ADICIONAR
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-4 pt-4 border-t border-red-50">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Variação Aleatória (Anti-Detecção)</label>
                                                    <span className="text-[10px] font-black text-red-600 bg-red-50 px-2 py-1 rounded-lg">± {randomVariation} min</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max="30" 
                                                    value={randomVariation}
                                                    onChange={(e) => setRandomVariation(Number(e.target.value))}
                                                    className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer accent-red-600"
                                                />
                                                <p className="text-[9px] text-gray-400 uppercase font-bold">O sistema variará o horário base em até {randomVariation} minutos para simular comportamento humano.</p>
                                            </div>

                                            {plannedTasks.length > 0 && (
                                                <div className="space-y-3 pt-4 border-t border-red-50">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                        <Activity size={12} className="text-red-500" /> Próximas Postagens Planejadas
                                                    </label>
                                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                        {plannedTasks.map((t, i) => (
                                                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-black text-gray-700">{new Date(t.planned_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    <span className="text-[8px] font-bold text-gray-400 uppercase">{new Date(t.planned_time).toLocaleDateString()}</span>
                                                                </div>
                                                                <span className="text-[8px] font-black px-2 py-1 bg-red-100 text-red-600 rounded-md uppercase tracking-wider">{t.status}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div className="pt-6 border-t border-red-50">
                                    <TacticalButton onClick={handleSchedule} className="w-full py-4 text-xs font-black tracking-widest bg-red-600 hover:bg-red-700 text-white !rounded-2xl">
                                        SALVAR CONFIGURAÇÕES
                                    </TacticalButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default YouTubeAutomationPage;
