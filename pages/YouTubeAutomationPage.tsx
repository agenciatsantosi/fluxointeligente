import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { Youtube, Plus, Trash2, Play, Check, Clock, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
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
                    scheduleMode,
                    frequency,
                    time,
                    times,
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
                            <div className="bg-gray-50 p-8 rounded-3xl border border-gray-100">
                                <div className="flex items-center justify-between mb-8">
                                    <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">AGENDAMENTO</span>
                                    <div className="flex bg-white p-1 rounded-xl border border-gray-200 shadow-sm">
                                        <button onClick={() => setScheduleMode('single')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${scheduleMode === 'single' ? 'bg-red-600 text-white shadow-md' : 'text-gray-400'}`}>ÚNICO</button>
                                        <button onClick={() => setScheduleMode('multiple')} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${scheduleMode === 'multiple' ? 'bg-red-600 text-white shadow-md' : 'text-gray-400'}`}>MÚLTIPLO</button>
                                    </div>
                                </div>

                                {scheduleMode === 'single' ? (
                                    <div className="grid grid-cols-2 gap-6 mb-8">
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">FREQUÊNCIA</label>
                                            <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:border-red-500 transition-all">
                                                <option value="daily">DIÁRIO</option>
                                                <option value="weekly">SEMANAL</option>
                                            </select>
                                        </div>
                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">HORA</label>
                                            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-gray-900 font-bold text-sm focus:outline-none focus:border-red-500 transition-all" />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-4 mb-8">
                                        {times.map((t, idx) => (
                                            <div key={idx} className="flex gap-2">
                                                <input type="time" value={t} onChange={(e) => {
                                                    const nt = [...times];
                                                    nt[idx] = e.target.value;
                                                    setTimes(nt);
                                                }} className="flex-1 p-3 bg-white border border-gray-200 rounded-xl text-gray-900 font-bold text-sm" />
                                            </div>
                                        ))}
                                        <button onClick={() => setTimes([...times, '09:00'])} className="p-3 bg-gray-100 text-gray-500 rounded-xl font-black text-[10px] uppercase">+</button>
                                    </div>
                                )}

                                <div className="space-y-6 pt-6 border-t border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PRODUTOS POR POST</span>
                                        <input type="number" value={productCount} onChange={(e) => setProductCount(parseInt(e.target.value))} className="w-24 p-3 bg-white border border-gray-200 rounded-xl text-center font-black text-sm text-red-600" />
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATEGORIA SHOPEE</span>
                                        <select value={categoryType} onChange={(e) => setCategoryType(e.target.value)} className="w-48 p-3 bg-white border border-gray-200 rounded-xl font-black text-[11px] text-gray-700 uppercase tracking-tighter">
                                            <option value="random">ALEATÓRIO</option>
                                            <option value="achadinhos">ACHADINHOS</option>
                                            <option value="casa">CASA & DECOR</option>
                                            <option value="beleza">BELEZA & MODA</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between px-8 py-6 bg-red-50 border border-red-100 rounded-3xl">
                                <div className="flex items-center gap-4">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={automationEnabled} onChange={(e) => setAutomationEnabled(e.target.checked)} className="sr-only peer" />
                                        <div className="w-12 h-7 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-red-600"></div>
                                    </label>
                                    <span className="text-[11px] font-black text-red-900 uppercase tracking-widest">ATIVAR AUTOMAÇÃO AGORA</span>
                                </div>
                                <button onClick={handleSchedule} className="px-8 py-4 bg-red-600 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-red-700 shadow-lg shadow-red-100 transition-all">
                                    SALVAR CONFIGURAÇÕES
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default YouTubeAutomationPage;
