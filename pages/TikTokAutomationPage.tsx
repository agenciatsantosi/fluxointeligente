import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProducts } from '../context/ProductContext';
import { Video, Plus, Trash2, Check, Clock, RefreshCw, AlertCircle, Calendar, Trash, Activity, Zap, Pencil, X, Upload, Film, Lock, ExternalLink, AlertTriangle } from 'lucide-react';
import { TacticalButton } from '../components/MotionComponents';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

const TikTokAutomationPage: React.FC = () => {
    const { shopeeAffiliateSettings } = useProducts();

    const [accounts, setAccounts] = useState<Array<{ 
        id: number; channel_name: string; username: string; avatar_url?: string;
        tokenStatus?: 'ok' | 'warning' | 'expired' | 'unknown'; expiresAt?: string;
    }>>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);
    
    // Automation Settings
    const [productCount, setProductCount] = useState(5);
    const [categoryType, setCategoryType] = useState('random');
    const [enableRotation, setEnableRotation] = useState(true);
    
    // Scheduling State
    const [customTimes, setCustomTimes] = useState<string[]>(['11:00', '15:00', '18:00', '21:00']);
    const [randomVariation, setRandomVariation] = useState(15);
    const [plannedTasks, setPlannedTasks] = useState<any[]>([]);
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const { showAlert } = useAlert();
    const [apiConfig, setApiConfig] = useState({ clientKey: '', clientSecret: '' });
    const [savingConfig, setSavingConfig] = useState(false);
    const [showConfig, setShowConfig] = useState(false);

    // Cookie-based login
    const [showCookieForm, setShowCookieForm] = useState(false);
    const [tiktokSessionId, setTiktokSessionId] = useState('');
    const [connectingTiktok, setConnectingTiktok] = useState(false);

    // Edit account name
    const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
    const [editUsername, setEditUsername] = useState('');
    const [editDisplayName, setEditDisplayName] = useState('');
    const [savingEdit, setSavingEdit] = useState(false);

    // Manual post state
    const [showPostPanel, setShowPostPanel] = useState(false);
    const [manualVideoFile, setManualVideoFile] = useState<File | null>(null);
    const [manualCaption, setManualCaption] = useState('');
    const [manualPrivacy, setManualPrivacy] = useState('PUBLIC_TO_EVERYONE');
    const [postingManual, setPostingManual] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [postResult, setPostResult] = useState<{success: boolean; url?: string; error?: string} | null>(null);


    const handleRenameAccount = async (accId: number) => {
        if (!editUsername.trim()) return;
        setSavingEdit(true);
        try {
            await api.patch(`/tiktok/accounts/${accId}`, {
                username: editUsername.trim().replace('@', ''),
                channel_name: editDisplayName.trim() || editUsername.trim()
            });
            showAlert('✅ Conta atualizada!', 'success');
            setEditingAccountId(null);
            loadAccounts();
        } catch (err: any) {
            showAlert('❌ ' + (err.response?.data?.error || err.message), 'error');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleManualPost = async () => {
        if (!selectedAccountId) { showAlert('⚠️ Selecione uma conta TikTok primeiro.', 'error'); return; }
        if (!manualVideoFile) { showAlert('⚠️ Selecione um arquivo de vídeo.', 'error'); return; }
        setPostingManual(true);
        setUploadProgress(0);
        setPostResult(null);
        try {
            const formData = new FormData();
            formData.append('video', manualVideoFile);
            formData.append('accountId', String(selectedAccountId));
            formData.append('caption', manualCaption);
            formData.append('privacyLevel', manualPrivacy);

            const res = await api.post('/tiktok/post-manual', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                onUploadProgress: (e) => {
                    if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            if (res.data.success) {
                setPostResult({ success: true, url: res.data.profileUrl });
                showAlert('✅ Vídeo publicado no TikTok!', 'success');
                setManualVideoFile(null);
                setManualCaption('');
            } else {
                setPostResult({ success: false, error: res.data.error });
            }
        } catch (err: any) {
            const errorMsg = err.response?.data?.error || err.message;
            setPostResult({ success: false, error: errorMsg });
        } finally {
            setPostingManual(false);
        }
    };

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
            if (event.data === 'tiktok-auth-success') {
                showNotification('✅ Conta TikTok conectada com sucesso!', 'success');
                loadAccounts();
            }
        };

        window.addEventListener('message', handleOAuthMessage);
        return () => window.removeEventListener('message', handleOAuthMessage);
    }, []);

    const loadPlannedTasks = async () => {
        try {
            const res = await api.get('/automation/planned-tasks?platform=tiktok');
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
                    clientKey: settings.TIKTOK_CLIENT_KEY || '',
                    clientSecret: settings.TIKTOK_CLIENT_SECRET || ''
                });
                if (!settings.TIKTOK_CLIENT_KEY || !settings.TIKTOK_CLIENT_SECRET) {
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
            await api.post('/admin/system-settings', { key: 'TIKTOK_CLIENT_KEY', value: apiConfig.clientKey });
            await api.post('/admin/system-settings', { key: 'TIKTOK_CLIENT_SECRET', value: apiConfig.clientSecret });
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
            const response = await api.get('/tiktok/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(response.data.accounts[0].id);
                }
            }
        } catch (error) {
            console.error('Error loading TikTok accounts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleConnectAccount = async () => {
        try {
            const response = await api.get('/tiktok/auth');
            if (response.data.success && response.data.url) {
                // Open TikTok Auth in a popup
                const width = 600;
                const height = 700;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;
                window.open(response.data.url, 'TikTok Auth', `width=${width},height=${height},left=${left},top=${top}`);
            }
        } catch (error: any) {
            const errorMsg = error.response?.data?.error || error.message;
            if (errorMsg.includes('Client Key/Secret')) {
                showNotification('⚠️ Credenciais da API não encontradas. Configure-as na página de Configurações (Apenas Admin).', 'error');
            } else {
                showNotification('❌ Erro ao iniciar autenticação: ' + errorMsg, 'error');
            }
        }
    };

    const handleDeleteAccount = async (id: number) => {
        if (!confirm('Deseja realmente desconectar esta conta do TikTok?')) return;
        try {
            await api.delete(`/tiktok/accounts/${id}`);
            showNotification('✅ Conta TikTok desconectada', 'success');
            if (selectedAccountId === id) setSelectedAccountId(null);
            loadAccounts();
        } catch (error: any) {
            showNotification('❌ Erro ao excluir: ' + error.message, 'error');
        }
    };

    const handleSchedule = async () => {
        if (!selectedAccountId) {
            showNotification('❌ Selecione uma conta TikTok primeiro!', 'error');
            return;
        }

        try {
            const response = await api.post('/scheduler/save', {
                platform: 'tiktok',
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
                userId: 1
            });

            if (response.data.success) {
                showNotification('✅ Agendamento salvo com sucesso!', 'success');
            }
        } catch (error: any) {
            showNotification('❌ Erro ao salvar: ' + error.message, 'error');
        }
    };

    return (
        <div className="space-y-6 sm:space-y-8 max-w-6xl mx-auto pb-12 font-sans bg-gray-50 min-h-screen p-4 sm:p-8">

            {/* Header / Accounts Section */}
            <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                <div className="px-4 sm:px-8 py-6 bg-gray-50/50 border-b border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-900 to-black flex items-center justify-center shadow-lg shadow-gray-200 shrink-0">
                            <Video size={22} className="text-[#fe2c55]" />
                        </div>
                        <div>
                            <span className="text-[10px] font-black text-[#fe2c55] uppercase tracking-[0.3em] block mb-0.5">TIKTOK_AUTOMATION</span>
                            <h2 className="font-bold text-gray-900 text-base sm:text-lg">Contas TikTok Conectadas</h2>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <button
                            onClick={() => setShowConfig(!showConfig)}
                            className={`p-3 rounded-xl transition-all ${showConfig ? 'bg-red-100 text-[#fe2c55]' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                            title="Configurações da API"
                        >
                            <AlertCircle size={20} />
                        </button>
                        {accounts.length > 0 && (
                            <button
                                onClick={() => { setShowPostPanel(!showPostPanel); setShowCookieForm(false); }}
                                className={`flex-1 md:flex-initial justify-center px-5 py-3 font-bold text-xs uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center gap-2 border ${
                                    showPostPanel 
                                        ? 'bg-[#fe2c55] text-white border-red-600 shadow-lg shadow-red-200' 
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-[#fe2c55] hover:text-[#fe2c55]'
                                }`}
                            >
                                <Upload size={15} /> POSTAR AGORA
                            </button>
                        )}
                        <button
                            onClick={() => { setShowCookieForm(!showCookieForm); setShowPostPanel(false); }}
                            className="flex-1 md:flex-initial justify-center px-6 py-3 bg-gradient-to-r from-gray-950 to-gray-850 hover:from-black hover:to-gray-900 text-white font-bold text-xs uppercase tracking-widest rounded-xl hover:shadow-lg transition-all active:scale-95 flex items-center gap-2 border border-gray-800 whitespace-nowrap"
                        >
                            <Plus size={16} className="text-[#fe2c55]" /> CONECTAR TIKTOK
                        </button>
                    </div>
                </div>

                {showConfig && user?.role === 'admin' && (
                    <div className="p-8 bg-red-50/50 border-b border-gray-200 animate-in slide-in-from-top duration-300">
                        <div className="max-w-4xl space-y-6">
                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Configuração da API do TikTok</h3>
                                    <a 
                                        href="https://developers.tiktok.com/" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold text-[#fe2c55] hover:underline flex items-center gap-1"
                                    >
                                        ABRIR TIKTOK FOR DEVELOPERS <Plus size={10} className="rotate-45" />
                                    </a>
                                </div>
                                <p className="text-xs text-gray-500">Insira as credenciais do TikTok Developer Console para habilitar o login OAuth.</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Client Key</label>
                                    <input 
                                        type="text" 
                                        value={apiConfig.clientKey}
                                        onChange={(e) => setApiConfig({...apiConfig, clientKey: e.target.value})}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                                        placeholder="awxxxxxxxxxxxxxx"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Client Secret</label>
                                    <input 
                                        type="password" 
                                        value={apiConfig.clientSecret}
                                        onChange={(e) => setApiConfig({...apiConfig, clientSecret: e.target.value})}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-mono"
                                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
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

                {/* Cookie-based connection form */}
                {showCookieForm && (
                    <div className="mx-4 sm:mx-8 mb-6 p-4 sm:p-6 bg-gray-950 border border-gray-800 rounded-2xl space-y-4 animate-in slide-in-from-top-4 duration-300">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black text-[#fe2c55] uppercase tracking-widest">MÉTODO SIMPLES</p>
                                <p className="text-sm font-bold text-white">Conectar via Cookie de Sessão</p>
                                <p className="text-[10px] text-white/40 mt-0.5">Sem app developer. Cole o JSON exportado do Cookie-Editor ou o valor puro do sessionid.</p>
                            </div>
                            <button onClick={() => setShowCookieForm(false)} className="text-white/30 hover:text-white p-1">
                                <AlertCircle size={18} />
                            </button>
                        </div>

                        <div className="p-4 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-2">
                            <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">📋 Como pegar o cookie:</p>
                            <div className="text-[11px] text-amber-200/80 space-y-1">
                                <p><span className="text-amber-400 font-bold">Opção 1 (fácil):</span> Instale a extensão <a href="https://chrome.google.com/webstore/detail/cookie-editor/hlkenndednhfkekhgcdicdfddnkalmdm" target="_blank" rel="noopener noreferrer" className="text-[#fe2c55] underline font-bold">Cookie-Editor</a> → faça login em <a href="https://www.tiktok.com" target="_blank" rel="noopener noreferrer" className="text-[#fe2c55] underline">tiktok.com</a> → clique Export → cole o JSON aqui</p>
                                <p><span className="text-amber-400 font-bold">Opção 2 (manual):</span> Abra tiktok.com → F12 → Application → Cookies → tiktok.com → copie o valor do cookie <code className="bg-white/10 px-1 rounded">sessionid</code></p>
                            </div>
                        </div>

                        <textarea
                            value={tiktokSessionId}
                            onChange={(e) => setTiktokSessionId(e.target.value.trim())}
                            rows={4}
                            className="w-full p-3 bg-white/5 border border-gray-700 focus:border-[#fe2c55] rounded-xl text-xs font-mono text-white placeholder-white/20 transition-colors outline-none resize-none"
                            placeholder={`Cole o JSON do Cookie-Editor:\n[{"name":"sessionid","value":"abc123..."}]\n\nOU apenas o valor puro do sessionid.`}
                        />

                        <button
                            onClick={async () => {
                                if (!tiktokSessionId) {
                                    showAlert('⚠️ Cole o valor do cookie sessionid primeiro.', 'error');
                                    return;
                                }
                                setConnectingTiktok(true);
                                try {
                                    const res = await api.post('/tiktok/connect-session', { sessionId: tiktokSessionId });
                                    if (res.data.success) {
                                        showAlert(`✅ Conta @${res.data.username} conectada!`, 'success');
                                        setTiktokSessionId('');
                                        setShowCookieForm(false);
                                        loadAccounts();
                                    } else {
                                        showAlert('❌ ' + (res.data.error || 'Erro ao conectar'), 'error');
                                    }
                                } catch (err: any) {
                                    showAlert('❌ ' + (err.response?.data?.error || err.message), 'error');
                                } finally {
                                    setConnectingTiktok(false);
                                }
                            }}
                            disabled={connectingTiktok || !tiktokSessionId}
                            className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                connectingTiktok || !tiktokSessionId
                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    : 'bg-[#fe2c55] hover:bg-red-600 text-white shadow-lg shadow-red-900/30 active:scale-95'
                            }`}
                        >
                            {connectingTiktok
                                ? <><RefreshCw size={14} className="animate-spin" /> Conectando...</>
                                : <><Plus size={14} /> CONECTAR CONTA TIKTOK</>}
                        </button>
                    </div>
                )}

                {/* Manual Post Panel */}
                {showPostPanel && (
                    <div className="mx-4 sm:mx-8 mb-6 animate-in slide-in-from-top-4 duration-300">
                        <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
                            {/* Panel Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#fe2c55]/10 rounded-lg flex items-center justify-center">
                                        <Film size={16} className="text-[#fe2c55]" />
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-black text-[#fe2c55] uppercase tracking-widest">POSTAGEM MANUAL</p>
                                        <p className="text-sm font-bold text-white">Publicar Vídeo no TikTok</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowPostPanel(false)} className="text-white/30 hover:text-white transition-colors">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Left: Upload */}
                                <div className="space-y-4">
                                    {/* Account selector indicator */}
                                    {!selectedAccountId ? (
                                        <div className="p-3 bg-amber-950/40 border border-amber-700/40 rounded-xl flex items-center gap-2">
                                            <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                                            <p className="text-[11px] text-amber-300">Selecione uma conta acima para habilitar a postagem</p>
                                        </div>
                                    ) : (
                                        <div className="p-3 bg-green-950/40 border border-green-700/40 rounded-xl flex items-center gap-2">
                                            <Check size={14} className="text-green-400 shrink-0" />
                                            <p className="text-[11px] text-green-300">Conta selecionada: <strong>@{accounts.find(a => a.id === selectedAccountId)?.username}</strong></p>
                                        </div>
                                    )}

                                    {/* Video upload */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Vídeo (.mp4)</label>
                                        <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                                            manualVideoFile 
                                                ? 'border-[#fe2c55] bg-red-950/20' 
                                                : 'border-gray-700 hover:border-gray-500 bg-white/5'
                                        }`}>
                                            {manualVideoFile ? (
                                                <div className="text-center">
                                                    <Film size={24} className="text-[#fe2c55] mx-auto mb-1" />
                                                    <p className="text-xs font-bold text-white">{manualVideoFile.name}</p>
                                                    <p className="text-[10px] text-gray-400">{(manualVideoFile.size / 1024 / 1024).toFixed(1)} MB</p>
                                                </div>
                                            ) : (
                                                <div className="text-center">
                                                    <Upload size={24} className="text-gray-500 mx-auto mb-2" />
                                                    <p className="text-xs text-gray-400">Clique para selecionar o vídeo</p>
                                                    <p className="text-[10px] text-gray-600 mt-1">MP4 • máx. 287MB • máx. 60 seg</p>
                                                </div>
                                            )}
                                            <input
                                                type="file"
                                                accept="video/mp4,video/*"
                                                className="hidden"
                                                onChange={e => { if (e.target.files?.[0]) setManualVideoFile(e.target.files[0]); }}
                                            />
                                        </label>
                                    </div>

                                    {/* Privacy */}
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                                            <Lock size={10} className="inline mr-1" />Privacidade
                                        </label>
                                        <select
                                            value={manualPrivacy}
                                            onChange={e => setManualPrivacy(e.target.value)}
                                            className="w-full px-3 py-2.5 bg-white/5 border border-gray-700 rounded-xl text-white text-xs focus:border-[#fe2c55] outline-none"
                                        >
                                            <option value="PUBLIC_TO_EVERYONE">🌍 Público — Todo mundo vê</option>
                                            <option value="MUTUAL_FOLLOW_FRIENDS">👥 Amigos — Seguidores mútoos</option>
                                            <option value="SELF_ONLY">🔒 Privado — Só eu vejo</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Right: Caption + Post */}
                                <div className="space-y-4">
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Legenda / Caption</label>
                                            <span className={`text-[10px] font-bold ${ manualCaption.length > 140 ? 'text-red-400' : 'text-gray-500'}`}>
                                                {manualCaption.length}/150
                                            </span>
                                        </div>
                                        <textarea
                                            value={manualCaption}
                                            onChange={e => setManualCaption(e.target.value.slice(0, 150))}
                                            rows={5}
                                            className="w-full p-3 bg-white/5 border border-gray-700 focus:border-[#fe2c55] rounded-xl text-xs text-white placeholder-white/20 outline-none resize-none transition-colors"
                                            placeholder="Escreva a legenda do seu vídeo...&#10;&#10;Use hashtags para aumentar o alcance! #viral #tiktok"
                                        />
                                    </div>

                                    {/* Progress bar */}
                                    {postingManual && uploadProgress > 0 && (
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between">
                                                <p className="text-[10px] text-gray-400">Enviando vídeo...</p>
                                                <p className="text-[10px] font-bold text-[#fe2c55]">{uploadProgress}%</p>
                                            </div>
                                            <div className="w-full bg-gray-800 rounded-full h-1.5">
                                                <div
                                                    className="bg-[#fe2c55] h-1.5 rounded-full transition-all duration-300"
                                                    style={{width: `${uploadProgress}%`}}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Result feedback */}
                                    {postResult && (
                                        <div className={`p-3 rounded-xl flex items-start gap-2 ${
                                            postResult.success 
                                                ? 'bg-green-950/40 border border-green-700/40' 
                                                : 'bg-red-950/40 border border-red-800/40'
                                        }`}>
                                            {postResult.success ? (
                                                <>
                                                    <Check size={14} className="text-green-400 shrink-0 mt-0.5" />
                                                    <div>
                                                        <p className="text-[11px] font-bold text-green-300">Vídeo publicado com sucesso!</p>
                                                        {postResult.url && (
                                                            <a href={postResult.url} target="_blank" rel="noopener noreferrer"
                                                                className="text-[10px] text-green-400 underline flex items-center gap-1 mt-1">
                                                                Ver perfil <ExternalLink size={10} />
                                                            </a>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <AlertTriangle size={14} className="text-red-400 shrink-0 mt-0.5" />
                                                    <p className="text-[11px] text-red-300">{postResult.error}</p>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Post button */}
                                    <button
                                        onClick={handleManualPost}
                                        disabled={postingManual || !manualVideoFile || !selectedAccountId}
                                        className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
                                            postingManual || !manualVideoFile || !selectedAccountId
                                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                                : 'bg-[#fe2c55] hover:bg-red-600 text-white shadow-lg shadow-red-900/30 active:scale-95'
                                        }`}
                                    >
                                        {postingManual
                                            ? <><RefreshCw size={14} className="animate-spin" /> Publicando...</>
                                            : <><Upload size={14} /> PUBLICAR NO TIKTOK</>}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 p-4 sm:p-8">
                    {accounts.map(acc => (
                        <div
                            key={acc.id}
                            onClick={() => editingAccountId !== acc.id && setSelectedAccountId(acc.id)}
                            className={`p-6 border-2 transition-all cursor-pointer relative group rounded-2xl ${
                                acc.tokenStatus === 'expired'
                                    ? 'bg-red-50/30 border-red-300'
                                    : acc.tokenStatus === 'warning'
                                    ? 'bg-amber-50/30 border-amber-300'
                                    : selectedAccountId === acc.id
                                    ? 'bg-red-50/50 border-[#fe2c55] ring-4 ring-red-50'
                                    : 'bg-white border-gray-100 hover:border-red-200 hover:bg-gray-50/50'
                            }`}
                        >
                            {/* Token expiry alert banners */}
                            {acc.tokenStatus === 'expired' && (
                                <div className="mb-3 p-2 bg-red-100 border border-red-200 rounded-lg flex items-center gap-2">
                                    <AlertTriangle size={12} className="text-red-600 shrink-0" />
                                    <p className="text-[10px] font-bold text-red-700">Cookie expirado! Reconecte a conta.</p>
                                    <button
                                        onClick={e => { e.stopPropagation(); setShowCookieForm(true); setShowPostPanel(false); }}
                                        className="ml-auto text-[9px] font-black text-red-600 bg-red-200 hover:bg-red-300 px-2 py-0.5 rounded-md uppercase tracking-wide"
                                    >RECONECTAR</button>
                                </div>
                            )}
                            {acc.tokenStatus === 'warning' && (
                                <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                                    <AlertTriangle size={12} className="text-amber-600 shrink-0" />
                                    <p className="text-[10px] font-bold text-amber-700">Cookie expira em breve. Renove em até 5 dias.</p>
                                </div>
                            )}
                            {editingAccountId === acc.id ? (
                                /* Inline edit form */
                                <div className="space-y-3" onClick={e => e.stopPropagation()}>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Editar conta</p>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            value={editUsername}
                                            onChange={e => setEditUsername(e.target.value)}
                                            placeholder="username (sem @)"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs font-mono focus:border-[#fe2c55] outline-none"
                                            autoFocus
                                        />
                                        <input
                                            type="text"
                                            value={editDisplayName}
                                            onChange={e => setEditDisplayName(e.target.value)}
                                            placeholder="Nome de exibição"
                                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs focus:border-[#fe2c55] outline-none"
                                        />
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleRenameAccount(acc.id)}
                                            disabled={savingEdit}
                                            className="flex-1 py-2 bg-[#fe2c55] text-white text-[10px] font-black uppercase rounded-lg hover:bg-red-600 transition-all flex items-center justify-center gap-1"
                                        >
                                            {savingEdit ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                                            Salvar
                                        </button>
                                        <button
                                            onClick={() => setEditingAccountId(null)}
                                            className="px-3 py-2 bg-gray-100 text-gray-600 text-[10px] font-black uppercase rounded-lg hover:bg-gray-200 transition-all"
                                        >
                                            <X size={12} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* Normal card view */
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        {acc.avatar_url ? (
                                            <img src={acc.avatar_url} className="w-10 h-10 rounded-full border-2 border-white shadow-sm" alt="" />
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-[#fe2c55] font-bold">
                                                {acc.channel_name.substring(0, 1)}
                                            </div>
                                        )}
                                        <div>
                                            <span className="font-bold text-gray-900 text-sm block">@{acc.username}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{acc.channel_name}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setEditingAccountId(acc.id);
                                                setEditUsername(acc.username);
                                                setEditDisplayName(acc.channel_name);
                                            }}
                                            className="p-2 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-all"
                                            title="Editar nome"
                                        >
                                            <Pencil size={15} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDeleteAccount(acc.id); }}
                                            className="p-2 text-gray-400 hover:text-[#fe2c55] hover:bg-red-50 rounded-lg transition-all"
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {accounts.length === 0 && !loading && (
                        <div className="col-span-full py-16 text-center border-2 border-dashed border-gray-200 rounded-3xl bg-gray-50/30">
                            <Video size={40} className="text-gray-350 mx-auto mb-4" />
                            <h3 className="text-sm font-bold text-gray-900 mb-1">Nenhuma conta TikTok conectada</h3>
                            <p className="text-xs text-gray-500 mb-6">Conecte sua conta para começar a postar vídeos diretamente pelo painel.</p>
                            <button onClick={() => setShowCookieForm(true)} className="px-8 py-3 bg-gradient-to-r from-gray-950 to-gray-850 hover:from-black hover:to-gray-900 text-white font-black text-[10px] uppercase tracking-widest rounded-xl transition-all shadow-lg border border-gray-850">
                                CONECTAR TIKTOK AGORA
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {selectedAccountId && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 duration-500">
                    {/* Left Side: Preview & Info */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm p-5 sm:p-8">
                            <div className="flex items-center gap-3 mb-6">
                                <AlertCircle size={18} className="text-blue-500" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">LIMITES E REQUISITOS</span>
                            </div>
                            <p className="text-sm text-gray-600 leading-relaxed mb-6">
                                O TikTok Direct Publish API requer que os vídeos estejam em formato compatível e de acordo com as diretrizes:
                            </p>
                            <ul className="space-y-4">
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#fe2c55] shrink-0"></div>
                                    <span className="text-xs text-gray-500 font-medium">Extração de links de produtos da Shopee.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#fe2c55] shrink-0"></div>
                                    <span className="text-xs text-gray-500 font-medium">Legendas completas geradas automaticamente.</span>
                                </li>
                                <li className="flex items-start gap-3">
                                    <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#fe2c55] shrink-0"></div>
                                    <span className="text-xs text-gray-500 font-medium">Publicação direta de alta fidelidade sem intervenção manual.</span>
                                </li>
                            </ul>
                            
                            <div className="mt-10 p-5 bg-red-50/50 border border-red-100 rounded-2xl">
                                <span className="text-[9px] font-black text-[#fe2c55] uppercase tracking-widest block mb-2">SEGURANÇA DA CONTA</span>
                                <p className="text-[11px] text-gray-700 font-medium leading-relaxed">
                                    O limite padrão seguro é de 15 vídeos por dia para evitar detecções. Recomendamos iniciar com agendamentos de 5 a 10 postagens.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right Side: Configuration */}
                    <div className="lg:col-span-8 bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
                        <div className="px-4 sm:px-8 py-5 sm:py-6 bg-gray-50/50 border-b border-gray-200 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <RefreshCw size={18} className="text-[#fe2c55]" />
                                <span className="text-[10px] font-black text-gray-900 uppercase tracking-widest">CONFIGURAÇÃO DE AUTOMAÇÃO</span>
                            </div>
                        </div>

                        <div className="p-5 sm:p-10 space-y-8 sm:space-y-10">
                            {/* Scheduling Block */}
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">PRODUTOS POR POST</span>
                                        <input type="number" value={productCount} onChange={(e) => setProductCount(parseInt(e.target.value))} className="w-full sm:w-24 p-3 bg-white border border-gray-200 rounded-xl text-center font-black text-sm text-[#fe2c55] focus:outline-none focus:border-[#fe2c55]" />
                                    </div>
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">CATEGORIA SHOPEE</span>
                                        <select value={categoryType} onChange={(e) => setCategoryType(e.target.value)} className="w-full sm:w-48 p-3 bg-white border border-gray-200 rounded-xl font-black text-[11px] text-gray-700 uppercase tracking-tighter focus:outline-none focus:border-[#fe2c55]">
                                            <option value="random">ALEATÓRIO</option>
                                            <option value="achadinhos">ACHADINHOS</option>
                                            <option value="casa">CASA & DECOR</option>
                                            <option value="beleza">BELEZA & MODA</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="p-5 sm:p-8 bg-white border-2 border-red-100 shadow-xl shadow-red-500/5 rounded-3xl space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div>
                                        <h3 className="font-black text-[#fe2c55] text-sm uppercase tracking-widest flex items-center gap-2">
                                            <Calendar size={16} /> Agendamento Automático TikTok
                                        </h3>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Busca e posta produtos nos horários programados</p>
                                    </div>
                                    <button 
                                        onClick={() => setAutomationEnabled(!automationEnabled)}
                                        className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${automationEnabled ? 'bg-[#fe2c55]' : 'bg-gray-200'}`}
                                    >
                                        <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${automationEnabled ? 'transform translate-x-6' : ''}`} />
                                    </button>
                                </div>

                                <AnimatePresence>
                                    {automationEnabled && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-6 overflow-hidden">
                                            <div className="space-y-4">
                                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                                                    <div className="flex flex-wrap items-center gap-3">
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Frequência Diária</label>
                                                        <button 
                                                            onClick={() => setCustomTimes(["10:00", "13:00", "16:00", "19:00", "22:00"].sort())}
                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-gray-950 to-gray-800 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95 border border-gray-700 whitespace-nowrap"
                                                        >
                                                            <Zap size={10} fill="currentColor" className="text-[#fe2c55]" /> Sugerir Horários
                                                        </button>
                                                    </div>
                                                    <span className="text-[10px] font-black text-[#fe2c55] bg-red-50 px-3 py-1.5 rounded-xl border border-red-100 uppercase tracking-wider text-center w-fit sm:w-auto">{customTimes.length} POSTAGENS POR DIA</span>
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
                                                                className="bg-transparent font-black text-xs text-[#fe2c55] outline-none"
                                                            />
                                                            <button onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))} className="text-[#fe2c55]/70 hover:text-[#fe2c55] transition-colors">
                                                                <Trash size={14} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    <button onClick={() => setCustomTimes([...customTimes, '12:00'])} className="px-4 py-2 border border-dashed border-red-300 text-[#fe2c55] hover:text-[#fe2c55] hover:border-[#fe2c55] rounded-xl font-bold text-xs transition-all uppercase tracking-widest">
                                                        + ADICIONAR
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-4 pt-4 border-t border-red-50">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Variação Aleatória</label>
                                                    <span className="text-[10px] font-black text-[#fe2c55] bg-red-50 px-2 py-1 rounded-lg">± {randomVariation} min</span>
                                                </div>
                                                <input 
                                                    type="range" 
                                                    min="0" 
                                                    max="45" 
                                                    value={randomVariation}
                                                    onChange={(e) => setRandomVariation(Number(e.target.value))}
                                                    className="w-full h-2 bg-red-100 rounded-lg appearance-none cursor-pointer accent-[#fe2c55]"
                                                />
                                                <p className="text-[9px] text-gray-400 uppercase font-bold">O sistema variará o horário base para simular comportamento orgânico.</p>
                                            </div>

                                            {plannedTasks.length > 0 && (
                                                <div className="space-y-3 pt-4 border-t border-red-50">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                        <Activity size={12} className="text-[#fe2c55]" /> Próximas Postagens Planejadas
                                                    </label>
                                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                        {plannedTasks.map((t, i) => (
                                                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] font-black text-gray-700">{new Date(t.planned_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    <span className="text-[8px] font-bold text-gray-400 uppercase">{new Date(t.planned_time).toLocaleDateString()}</span>
                                                                </div>
                                                                <span className="text-[8px] font-black px-2 py-1 bg-red-100 text-[#fe2c55] rounded-md uppercase tracking-wider">{t.status}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <div className="pt-6 border-t border-red-50">
                                    <TacticalButton onClick={handleSchedule} className="w-full py-4 text-xs font-black tracking-widest bg-gradient-to-r from-gray-950 to-gray-850 hover:from-black hover:to-gray-900 border border-gray-850 text-white !rounded-2xl">
                                        SALVAR CONFIGURAÇÕES TIKTOK
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

export default TikTokAutomationPage;
