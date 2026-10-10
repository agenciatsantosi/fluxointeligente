import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Globe, Save, CheckCircle, AlertCircle, Clock, Bell, BellOff, Shield, Smartphone, MessageSquare, Instagram, Facebook, Youtube, Monitor, RefreshCw, Bot, Sparkles, Key, Eye, EyeOff, Globe as GlobeIcon, Image as ImageIcon } from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import Logo from '../components/Logo';

const SystemSettingsPage: React.FC = () => {
    const [timezone, setTimezone] = useState('America/Sao_Paulo');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingSystem, setSavingSystem] = useState(false);
    const [savingNotifs, setSavingNotifs] = useState(false);
    const { showAlert } = useAlert();
    const [userSettings, setUserSettings] = useState<Record<string, any>>({});
    const [savingBridge, setSavingBridge] = useState(false);
    const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [openaiApiKey, setOpenaiApiKey] = useState('');
    const [huggingfaceApiKey, setHuggingfaceApiKey] = useState('');
    const [cloudflareAccountId, setCloudflareAccountId] = useState('');
    const [cloudflareApiToken, setCloudflareApiToken] = useState('');
    const [imageProvider, setImageProvider] = useState('auto');
    const [testingImageGen, setTestingImageGen] = useState(false);
    const [imageTestResult, setImageTestResult] = useState<string | null>(null);
    const [savingAiKeys, setSavingAiKeys] = useState(false);
    const [testingAiKeys, setTestingAiKeys] = useState(false);
    const [showGeminiKey, setShowGeminiKey] = useState(false);
    const [showOpenaiKey, setShowOpenaiKey] = useState(false);
    const [showHuggingfaceKey, setShowHuggingfaceKey] = useState(false);
    const [showCloudflareToken, setShowCloudflareToken] = useState(false);
    const [notifSettings, setNotifSettings] = useState<any>({
        whatsapp_success: true,
        whatsapp_error: true,
        telegram_success: true,
        telegram_error: true,
        instagram_success: true,
        instagram_error: true,
        facebook_success: true,
        facebook_error: true,
        youtube_success: true,
        youtube_error: true,
        system_status: true
    });

    const userData = localStorage.getItem('user');
    const user = userData ? JSON.parse(userData) : null;

    const timezones = [
        { label: 'Brasília / São Paulo (GMT-3)', value: 'America/Sao_Paulo' },
        { label: 'Manaus (GMT-4)', value: 'America/Manaus' },
        { label: 'Cuiabá (GMT-4)', value: 'America/Cuiaba' },
        { label: 'Campo Grande (GMT-4)', value: 'America/Campo_Grande' },
        { label: 'Porto Velho (GMT-4)', value: 'America/Porto_Velho' },
        { label: 'Boa Vista (GMT-4)', value: 'America/Boa_Vista' },
        { label: 'Rio Branco (GMT-5)', value: 'America/Rio_Branco' },
        { label: 'Fernando de Noronha (GMT-2)', value: 'America/Noronha' },
        { label: 'Fortaleza / Recife (GMT-3)', value: 'America/Fortaleza' },
    ];

    useEffect(() => {
        loadSettings();
        loadNotifSettings();
        if (user?.role === 'admin') {
            loadSystemSettings();
        }
    }, []);

    const loadSystemSettings = async () => {
        try {
            const response = await api.get('/admin/system-settings');
            if (response.data.success) {
                setSystemSettings(response.data.settings);
            }
        } catch (error) {
            console.error('Error loading system settings:', error);
        }
    };

    const loadSettings = async () => {
        setLoading(true);
        try {
            const response = await api.get('/user-config');
            if (response.data.success && response.data.config) {
                if (response.data.config.TIMEZONE) {
                    setTimezone(response.data.config.TIMEZONE);
                }
                if (response.data.config.gemini_api_key) {
                    setGeminiApiKey(response.data.config.gemini_api_key);
                }
                if (response.data.config.openai_api_key) {
                    setOpenaiApiKey(response.data.config.openai_api_key);
                }
                if (response.data.config.huggingface_api_key) {
                    setHuggingfaceApiKey(response.data.config.huggingface_api_key);
                }
                if (response.data.config.cloudflare_account_id) {
                    setCloudflareAccountId(response.data.config.cloudflare_account_id);
                }
                if (response.data.config.cloudflare_api_token) {
                    setCloudflareApiToken(response.data.config.cloudflare_api_token);
                }
                if (response.data.config.image_provider) {
                    setImageProvider(response.data.config.image_provider);
                }
                setUserSettings(response.data.config);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadNotifSettings = async () => {
        try {
            const response = await api.get('/notifications/settings');
            if (response.data.success) {
                setNotifSettings(response.data.settings);
            }
        } catch (error) {
            console.error('Error loading notification settings:', error);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.post('/user-config', { key: 'TIMEZONE', value: timezone });
            showAlert('Configurações de fuso horário salvas com sucesso!', 'success');
        } catch (error) {
            showAlert('Erro ao salvar configurações.', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveNotifSettings = async () => {
        setSavingNotifs(true);
        try {
            await api.post('/notifications/settings', notifSettings);
            showAlert('Preferências de notificação salvas!', 'success');
        } catch (error) {
            showAlert('Erro ao salvar preferências.', 'error');
        } finally {
            setSavingNotifs(false);
        }
    };

    const handleSaveBridgeSettings = async () => {
        setSavingBridge(true);
        try {
            await api.post('/user-config', { key: 'telegram_bridge_enabled', value: String(userSettings.telegram_bridge_enabled === 'true' || userSettings.telegram_bridge_enabled === true) });
            await api.post('/user-config', { key: 'telegram_bridge_bot_token', value: userSettings.telegram_bridge_bot_token || '' });
            await api.post('/user-config', { key: 'telegram_bridge_chat_id', value: userSettings.telegram_bridge_chat_id || '' });
            showAlert('Configurações da Ponte de Vídeo salvas com sucesso!', 'success');
        } catch (error) {
            showAlert('Erro ao salvar configurações da ponte.', 'error');
        } finally {
            setSavingBridge(false);
        }
    };

    const handleSaveSystemSettings = async () => {
        setSavingSystem(true);
        try {
            for (const [key, value] of Object.entries(systemSettings)) {
                await api.post('/admin/system-settings', { key, value });
            }
            showAlert('Configurações do sistema salvas com sucesso!', 'success');
        } catch (error) {
            showAlert('Erro ao salvar configurações do sistema.', 'error');
        } finally {
            setSavingSystem(false);
        }
    };

    const toggleNotif = (key: string) => {
        setNotifSettings((prev: any) => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleSaveAiKeys = async () => {
        setSavingAiKeys(true);
        try {
            if (geminiApiKey) {
                await api.post('/user-config', { key: 'gemini_api_key', value: geminiApiKey });
                await api.post('/gemini/configure', { apiKey: geminiApiKey });
            }
            if (openaiApiKey) {
                await api.post('/user-config', { key: 'openai_api_key', value: openaiApiKey });
            }
            if (huggingfaceApiKey) {
                await api.post('/user-config', { key: 'huggingface_api_key', value: huggingfaceApiKey });
            }
            if (cloudflareAccountId) {
                await api.post('/user-config', { key: 'cloudflare_account_id', value: cloudflareAccountId });
            }
            if (cloudflareApiToken) {
                await api.post('/user-config', { key: 'cloudflare_api_token', value: cloudflareApiToken });
            }
            await api.post('/user-config', { key: 'image_provider', value: imageProvider });
            showAlert('Configurações de IA salvas com sucesso!', 'success');
        } catch (error) {
            showAlert('Erro ao salvar as configurações de IA.', 'error');
        } finally {
            setSavingAiKeys(false);
        }
    };

    const [testingGemini, setTestingGemini] = useState(false);
    const [testingOpenai, setTestingOpenai] = useState(false);
    const [testingHuggingface, setTestingHuggingface] = useState(false);
    const [testingCloudflare, setTestingCloudflare] = useState(false);

    const handleTestSpecificAi = async (provider: 'gemini' | 'openai' | 'huggingface' | 'cloudflare') => {
        if (provider === 'gemini') setTestingGemini(true);
        if (provider === 'openai') setTestingOpenai(true);
        if (provider === 'huggingface') setTestingHuggingface(true);
        if (provider === 'cloudflare') setTestingCloudflare(true);

        try {
            if (provider === 'gemini') {
                if (!geminiApiKey.trim()) {
                    showAlert('Insira a chave do Google Gemini antes de testar.', 'error');
                    return;
                }
                await api.post('/user-config', { key: 'gemini_api_key', value: geminiApiKey.trim() });
                await api.post('/gemini/configure', { apiKey: geminiApiKey.trim() });
            } else if (provider === 'openai') {
                if (!openaiApiKey.trim()) {
                    showAlert('Insira a chave da OpenAI antes de testar.', 'error');
                    return;
                }
                await api.post('/user-config', { key: 'openai_api_key', value: openaiApiKey.trim() });
            } else if (provider === 'huggingface') {
                if (!huggingfaceApiKey.trim()) {
                    showAlert('Insira a chave do Hugging Face antes de testar.', 'error');
                    return;
                }
                await api.post('/user-config', { key: 'huggingface_api_key', value: huggingfaceApiKey.trim() });
            } else if (provider === 'cloudflare') {
                if (!cloudflareAccountId.trim() || !cloudflareApiToken.trim()) {
                    showAlert('Insira o Account ID e o API Token do Cloudflare antes de testar.', 'error');
                    return;
                }
                await api.post('/user-config', { key: 'cloudflare_account_id', value: cloudflareAccountId.trim() });
                await api.post('/user-config', { key: 'cloudflare_api_token', value: cloudflareApiToken.trim() });
            }

            const response = await api.get(`/ai/test?provider=${provider}`);
            if (response.data.success) {
                showAlert(`✅ ${response.data.message}`, 'success');
            } else {
                showAlert(`❌ ${response.data.error || 'Falha ao validar chave.'}`, 'error');
            }
        } catch (error: any) {
            showAlert(`❌ Erro ao validar ${provider}: ${error.response?.data?.error || error.message}`, 'error');
        } finally {
            if (provider === 'gemini') setTestingGemini(false);
            if (provider === 'openai') setTestingOpenai(false);
            if (provider === 'huggingface') setTestingHuggingface(false);
            if (provider === 'cloudflare') setTestingCloudflare(false);
        }
    };

    const handleTestAiConnection = async () => {
        setTestingAiKeys(true);
        try {
            // Salvar chaves antes de testar para garantir que testamos o que está no input
            if (geminiApiKey) {
                await api.post('/user-config', { key: 'gemini_api_key', value: geminiApiKey });
                await api.post('/gemini/configure', { apiKey: geminiApiKey });
            }
            if (openaiApiKey) await api.post('/user-config', { key: 'openai_api_key', value: openaiApiKey });

            const response = await api.get('/ai/test');
            if (response.data.success) {
                showAlert(`${response.data.message} (Provedor Ativo: ${response.data.provider})`, 'success');
            } else {
                showAlert(response.data.error || 'Falha ao testar a conexão.', 'error');
            }
        } catch (error: any) {
            showAlert('Erro ao conectar com a IA.', 'error');
        } finally {
            setTestingAiKeys(false);
        }
    };

    const handleTestImageGeneration = async () => {
        setTestingImageGen(true);
        setImageTestResult(null);
        try {
            await api.post('/user-config', { key: 'image_provider', value: imageProvider });
            if (cloudflareAccountId) await api.post('/user-config', { key: 'cloudflare_account_id', value: cloudflareAccountId.trim() });
            if (cloudflareApiToken) await api.post('/user-config', { key: 'cloudflare_api_token', value: cloudflareApiToken.trim() });
            if (huggingfaceApiKey) await api.post('/user-config', { key: 'huggingface_api_key', value: huggingfaceApiKey.trim() });
            if (openaiApiKey) await api.post('/user-config', { key: 'openai_api_key', value: openaiApiKey.trim() });

            const res = await api.post('/automations/preview', {
                title: 'Café da manhã inspirador com foco e produtividade',
                visual_identity: {
                    style: 'Fotografia realista, profissional e moderna',
                    imageProvider: imageProvider
                }
            });

            const imgUrl = res.data?.imageUrl || res.data?.data?.image_url || res.data?.data?.imageUrl;
            if (res.data?.success && imgUrl) {
                setImageTestResult(imgUrl);
                showAlert(`✅ Imagem gerada com sucesso via ${imageProvider.toUpperCase()}!`, 'success');
            } else {
                const errMsg = res.data?.error || res.data?.details || 'Falha ao gerar imagem de teste.';
                showAlert(`❌ ${errMsg}`, 'error');
            }
        } catch (error: any) {
            const msg = error.response?.data?.error || error.response?.data?.details || error.message;
            showAlert(`❌ Erro no teste de imagem: ${msg}`, 'error');
        } finally {
            setTestingImageGen(false);
        }
    };

    const NotifToggle = ({ label, settingKey, icon: Icon, color }: any) => (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100 hover:border-purple-200 transition-colors group">
            <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
                    <Icon size={18} className={color.replace('bg-', 'text-')} />
                </div>
                <span className="text-sm font-semibold text-gray-700">{label}</span>
            </div>
            <button
                onClick={() => toggleNotif(settingKey)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                    notifSettings[settingKey] ? 'bg-purple-600' : 'bg-gray-300'
                }`}
            >
                <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        notifSettings[settingKey] ? 'translate-x-6' : 'translate-x-1'
                    }`}
                />
            </button>
        </div>
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-in fade-in duration-500">
                <div className="relative">
                    <div className="absolute inset-0 bg-purple-500/10 blur-2xl rounded-full animate-pulse-slow scale-150"></div>
                    <Logo size={60} className="animate-bounce-subtle relative z-10" />
                </div>
                <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                        <RefreshCw className="animate-spin text-purple-600" size={14} />
                        <span className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Sincronizando Ajustes</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                            <Globe size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Configurações Regionais</h2>
                            <p className="text-sm text-gray-500">Ajuste o fuso horário para que seus agendamentos ocorram no momento exato.</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                        <div className="space-y-4">
                            <label className="block text-sm font-semibold text-gray-700 flex items-center gap-2">
                                <Clock size={16} className="text-gray-400" />
                                Fuso Horário do Sistema
                            </label>
                            <div className="relative group">
                                <select 
                                    value={timezone}
                                    onChange={(e) => setTimezone(e.target.value)}
                                    className="w-full pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all appearance-none text-gray-700 font-medium"
                                >
                                    {timezones.map((tz) => (
                                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                                    ))}
                                </select>
                                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                    <Globe size={16} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-6">
                            <div className="flex gap-4">
                                <div className="p-2 bg-amber-100 text-amber-600 h-fit rounded-lg shadow-sm">
                                    <AlertCircle size={20} />
                                </div>
                                <div className="space-y-2">
                                    <h4 className="font-bold text-amber-900 text-sm tracking-tight">Importante sobre Agendamentos</h4>
                                    <p className="text-[12px] text-amber-800/80 leading-relaxed">
                                        Ao alterar o fuso horário, o sistema irá recalcular todos os posts pendentes. 
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSave}
                            disabled={saving || loading}
                            className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-200/50 ${
                                saving 
                                ? 'bg-gray-400 cursor-not-allowed' 
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:scale-[1.02]'
                            }`}
                        >
                            <Save size={18} />
                            {saving ? 'Salvando...' : 'Salvar Regional'}
                        </button>
                    </div>
                </div>
            </div>

            {/* NOTIFICATION PREFERENCES */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                                <Bell size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Preferências de Notificação</h2>
                                <p className="text-sm text-gray-500">Escolha quais eventos devem disparar alertas no sistema.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleSaveNotifSettings}
                            disabled={savingNotifs}
                            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                        >
                            {savingNotifs ? 'Salvando...' : 'Salvar Alertas'}
                        </button>
                    </div>
                </div>

                <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* WhatsApp Group */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Smartphone size={14} /> WhatsApp
                            </h3>
                            <div className="grid gap-3">
                                <NotifToggle label="Sucesso no Envio" settingKey="whatsapp_success" icon={CheckCircle} color="bg-emerald-500" />
                                <NotifToggle label="Erros de Conexão" settingKey="whatsapp_error" icon={AlertCircle} color="bg-rose-500" />
                            </div>
                        </div>

                        {/* Telegram Group */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <MessageSquare size={14} /> Telegram
                            </h3>
                            <div className="grid gap-3">
                                <NotifToggle label="Sucesso no Envio" settingKey="telegram_success" icon={CheckCircle} color="bg-emerald-500" />
                                <NotifToggle label="Erros de Bot" settingKey="telegram_error" icon={AlertCircle} color="bg-rose-500" />
                            </div>
                        </div>

                        {/* Instagram Group */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Instagram size={14} /> Instagram
                            </h3>
                            <div className="grid gap-3">
                                <NotifToggle label="Reels Publicados" settingKey="instagram_success" icon={CheckCircle} color="bg-emerald-500" />
                                <NotifToggle label="Erros de API" settingKey="instagram_error" icon={AlertCircle} color="bg-rose-500" />
                            </div>
                        </div>

                        {/* Facebook Group */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Facebook size={14} /> Facebook
                            </h3>
                            <div className="grid gap-3">
                                <NotifToggle label="Posts / Stories OK" settingKey="facebook_success" icon={CheckCircle} color="bg-emerald-500" />
                                <NotifToggle label="Falhas de Página" settingKey="facebook_error" icon={AlertCircle} color="bg-rose-500" />
                            </div>
                        </div>

                        {/* YouTube Group */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Youtube size={14} /> YouTube
                            </h3>
                            <div className="grid gap-3">
                                <NotifToggle label="Shorts Enviados" settingKey="youtube_success" icon={CheckCircle} color="bg-emerald-500" />
                                <NotifToggle label="Erros de Upload" settingKey="youtube_error" icon={AlertCircle} color="bg-rose-500" />
                            </div>
                        </div>

                        {/* System Group */}
                        <div className="space-y-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <Monitor size={14} /> Sistema
                            </h3>
                            <div className="grid gap-3">
                                <NotifToggle label="Status do Servidor" settingKey="system_status" icon={Shield} color="bg-indigo-500" />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Telegram Bridge Settings */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl shadow-sm border border-indigo-100 overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Bot size={120} className="text-indigo-600" />
                </div>
                
                <div className="p-6 border-b border-indigo-100/50 bg-white/50 backdrop-blur-sm relative z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 rounded-lg">
                                <Bot size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-gray-900 tracking-tight">Configuração da Ponte de Vídeo (Telegram Bridge)</h2>
                                <p className="text-sm text-gray-600 mt-1 font-medium max-w-2xl">
                                    Utilize um bot do Telegram como servidor de relay para evitar bloqueios do Instagram.
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 bg-white/80 p-3 rounded-xl border border-indigo-100 shadow-sm">
                            <span className="text-[10px] font-black uppercase text-gray-500 tracking-widest">Status da Ponte</span>
                            <button
                                onClick={() => setUserSettings(prev => ({ ...prev, telegram_bridge_enabled: !(prev.telegram_bridge_enabled === 'true' || prev.telegram_bridge_enabled === true) }))}
                                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-all ${
                                    (userSettings.telegram_bridge_enabled === 'true' || userSettings.telegram_bridge_enabled === true) ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30' : 'bg-gray-300'
                                }`}
                            >
                                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-all ${(userSettings.telegram_bridge_enabled === 'true' || userSettings.telegram_bridge_enabled === true) ? 'translate-x-8' : 'translate-x-1'}`} />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="p-8 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-indigo-600 tracking-widest ml-1">Token do Bot Telegram</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-indigo-400">
                                    <Bot size={18} />
                                </div>
                                <input 
                                    type="password"
                                    placeholder="123456789:ABCDEF..."
                                    value={userSettings.telegram_bridge_bot_token || ''}
                                    onChange={(e) => setUserSettings(prev => ({ ...prev, telegram_bridge_bot_token: e.target.value }))}
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-indigo-200 rounded-xl text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                                />
                            </div>
                            <p className="text-[10px] text-gray-500 font-bold uppercase mt-1 ml-1 tracking-tighter">Crie um bot no @BotFather do Telegram</p>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-black uppercase text-indigo-600 tracking-widest ml-1">ID do Chat ou Canal</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-indigo-400">
                                    <MessageSquare size={18} />
                                </div>
                                <input 
                                    type="text"
                                    placeholder="-100123456789"
                                    value={userSettings.telegram_bridge_chat_id || ''}
                                    onChange={(e) => setUserSettings(prev => ({ ...prev, telegram_bridge_chat_id: e.target.value }))}
                                    className="w-full pl-12 pr-4 py-3 bg-white border border-indigo-200 rounded-xl text-gray-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm"
                                />
                            </div>
                            <div className="flex items-center gap-2 mt-1 ml-1">
                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Envie uma mensagem pro bot para descobrir seu Chat ID.</p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-indigo-100/50 flex justify-end">
                        <button
                            onClick={handleSaveBridgeSettings}
                            disabled={savingBridge}
                            className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                        >
                            {savingBridge ? (
                                <>
                                    <RefreshCw className="animate-spin" size={18} />
                                    <span>Salvando...</span>
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    <span>Salvar Configuração do Telegram</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* AI Keys Section */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gradient-to-r from-violet-50 to-indigo-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-violet-100 text-violet-600 rounded-lg">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900">Inteligência Artificial</h2>
                            <p className="text-sm text-gray-500">Configure as APIs para geração de imagens e textos nas automações.</p>
                        </div>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    {/* Gemini Key */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-violet-500"></div>
                            <label className="text-xs font-black uppercase text-violet-700 tracking-widest">Google Gemini API Key</label>
                            <span className="ml-auto text-xs bg-violet-100 text-violet-700 font-semibold px-2 py-0.5 rounded-full">Legendas & Hashtags</span>
                        </div>
                        <div className="relative flex items-center gap-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-violet-400">
                                    <Key size={16} />
                                </div>
                                <input
                                    type={showGeminiKey ? 'text' : 'password'}
                                    placeholder="AIzaSy..."
                                    value={geminiApiKey}
                                    onChange={e => setGeminiApiKey(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-violet-500 transition-all font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowGeminiKey(!showGeminiKey)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    {showGeminiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleTestSpecificAi('gemini')}
                                disabled={testingGemini}
                                className="px-4 py-3 bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                            >
                                {testingGemini ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                                Testar Chave
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 ml-1">→ Obtenha em <span className="font-semibold text-violet-700">aistudio.google.com</span> (gratuito)</p>
                    </div>

                    {/* OpenAI Key */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                            <label className="text-xs font-black uppercase text-emerald-700 tracking-widest">OpenAI API Key</label>
                            <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Geração de Imagens (DALL-E 3)</span>
                        </div>
                        <div className="relative flex items-center gap-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-emerald-400">
                                    <Key size={16} />
                                </div>
                                <input
                                    type={showOpenaiKey ? 'text' : 'password'}
                                    placeholder="sk-..."
                                    value={openaiApiKey}
                                    onChange={e => setOpenaiApiKey(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    {showOpenaiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleTestSpecificAi('openai')}
                                disabled={testingOpenai}
                                className="px-4 py-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                            >
                                {testingOpenai ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                                Testar Chave
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 ml-1">→ Obtenha em <span className="font-semibold text-emerald-700">platform.openai.com</span>. Necessário para gerar imagens com DALL-E 3.</p>
                    </div>

                    {/* Hugging Face API Key */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                            <label className="text-xs font-black uppercase text-orange-700 tracking-widest">Hugging Face API Key</label>
                            <span className="ml-auto text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">Geração de Imagens (Inference API)</span>
                        </div>
                        <div className="relative flex items-center gap-2">
                            <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-orange-400">
                                    <Key size={16} />
                                </div>
                                <input
                                    type={showHuggingfaceKey ? 'text' : 'password'}
                                    placeholder="hf_..."
                                    value={huggingfaceApiKey}
                                    onChange={e => setHuggingfaceApiKey(e.target.value)}
                                    className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 transition-all font-mono text-sm"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowHuggingfaceKey(!showHuggingfaceKey)}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                >
                                    {showHuggingfaceKey ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleTestSpecificAi('huggingface')}
                                disabled={testingHuggingface}
                                className="px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 border border-orange-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                            >
                                {testingHuggingface ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                                Testar Chave
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 ml-1">→ Obtenha em <span className="font-semibold text-orange-700">huggingface.co/settings/tokens</span>. Modelos: Stable Diffusion, FLUX, etc.</p>
                    </div>

                    {/* Cloudflare Workers AI */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                            <label className="text-xs font-black uppercase text-amber-700 tracking-widest">Cloudflare Workers AI</label>
                            <span className="ml-auto text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">Geração de Imagens (Workers AI)</span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <label className="text-xs font-black uppercase text-amber-700 tracking-widest">Account ID</label>
                                </div>
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-amber-400">
                                        <Globe size={16} />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="abc123... (seu Account ID)"
                                        value={cloudflareAccountId}
                                        onChange={e => setCloudflareAccountId(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 transition-all font-mono text-sm"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 mb-1">
                                    <label className="text-xs font-black uppercase text-amber-700 tracking-widest">API Token</label>
                                </div>
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-amber-400">
                                        <Key size={16} />
                                    </div>
                                    <input
                                        type={showCloudflareToken ? 'text' : 'password'}
                                        placeholder="Bearer token..."
                                        value={cloudflareApiToken}
                                        onChange={e => setCloudflareApiToken(e.target.value)}
                                        className="w-full pl-10 pr-12 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500 transition-all font-mono text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowCloudflareToken(!showCloudflareToken)}
                                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                                    >
                                        {showCloudflareToken ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => handleTestSpecificAi('cloudflare')}
                            disabled={testingCloudflare}
                            className="px-4 py-3 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                        >
                            {testingCloudflare ? <RefreshCw className="animate-spin" size={14} /> : <CheckCircle size={14} />}
                            Testar Cloudflare
                        </button>
                        <p className="text-xs text-gray-500 ml-1">→ Configure em <span className="font-semibold text-amber-700">dash.cloudflare.com/profile/api-tokens</span> (Workers AI permission). Modelos: Stable Diffusion, FLUX, etc.</p>
                    </div>

                    {/* Pollinations.ai (Free, No Key) */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-pink-500"></div>
                            <label className="text-xs font-black uppercase text-pink-700 tracking-widest">Pollinations.ai</label>
                            <span className="ml-auto text-xs bg-pink-100 text-pink-700 font-semibold px-2 py-0.5 rounded-full">Gratuito / Sem Chave</span>
                        </div>
                        <p className="text-xs text-gray-500 ml-1">→ Gratuito, sem necessidade de chave. Modelos: FLUX, Stable Diffusion, GPT-Image. Rate limits aplicam-se.</p>
                    </div>

                    {/* Image Provider Selector */}
                    <div className="space-y-3">
                        <div className="flex items-center gap-2 mb-1">
                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                            <label className="text-xs font-black uppercase text-indigo-700 tracking-widest">Provedor Padrão de Geração de Imagens</label>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                            <select
                                value={imageProvider}
                                onChange={e => setImageProvider(e.target.value)}
                                className="w-full sm:w-1/2 pl-4 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all appearance-none text-gray-700 font-medium"
                            >
                                <option value="auto">🤖 Auto (tenta OpenAI → Hugging Face → Cloudflare → Pollinations)</option>
                                <option value="openai">🟢 OpenAI (DALL-E 3, gpt-image-1) — Melhor qualidade, pago</option>
                                <option value="huggingface">🟠 Hugging Face (Stable Diffusion, FLUX) — Gratuito/Pago</option>
                                <option value="cloudflare">🟡 Cloudflare Workers AI (FLUX, SD) — Gratuito c/ conta</option>
                                <option value="pollinations">🩷 Pollinations.ai (FLUX, SD, GPT-Image) — Gratuito, rate-limited</option>
                            </select>
                            <button
                                type="button"
                                onClick={handleTestImageGeneration}
                                disabled={testingImageGen}
                                className="flex items-center justify-center gap-2 px-4 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-xs transition-all disabled:opacity-50"
                                title="Gera uma imagem real de teste com o provedor selecionado"
                            >
                                {testingImageGen ? (
                                    <>
                                        <RefreshCw className="animate-spin" size={15} />
                                        <span>Gerando Imagem...</span>
                                    </>
                                ) : (
                                    <>
                                        <ImageIcon size={15} />
                                        <span>Testar Gerar Imagem</span>
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 ml-1">Define qual provedor será usado por padrão para gerar imagens nas automações. "Auto" tenta em ordem até conseguir.</p>
                        {imageTestResult && (
                            <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-4">
                                <img src={imageTestResult} alt="Teste de Imagem" className="w-20 h-20 object-cover rounded-lg border border-emerald-300 shadow-sm" />
                                <div className="text-xs text-emerald-800 space-y-1">
                                    <p className="font-bold">✅ Imagem de teste gerada com sucesso!</p>
                                    <a href={imageTestResult} target="_blank" rel="noopener noreferrer" className="underline text-emerald-700 font-medium hover:text-emerald-900">
                                        Abrir em tamanho real
                                    </a>
                                </div>
                            </div>
                        )}
                    </div>


                    <div className="pt-6 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="text-xs text-gray-500">
                            💡 Use o botão <strong>Checar Conexão da API</strong> para validar suas chaves em tempo real.
                        </div>
                        <div className="flex items-center gap-3 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={handleTestAiConnection}
                                disabled={testingAiKeys}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-violet-50 text-violet-700 hover:bg-violet-100 border border-violet-200 rounded-xl font-bold transition-all shadow-xs active:scale-[0.98] disabled:opacity-50"
                                title="Verifica se a chave de API responde e qual modelo está ativo"
                            >
                                {testingAiKeys ? (
                                    <><RefreshCw className="animate-spin" size={18} /><span>Checando API...</span></>
                                ) : (
                                    <><CheckCircle size={18} /><span>Checar Conexão da API</span></>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveAiKeys}
                                disabled={savingAiKeys}
                                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-8 py-3 bg-violet-600 text-white rounded-xl font-bold hover:bg-violet-700 transition-all shadow-lg shadow-violet-200 active:scale-[0.98] disabled:opacity-50"
                            >
                                {savingAiKeys ? (
                                    <><RefreshCw className="animate-spin" size={18} /><span>Salvando...</span></>
                                ) : (
                                    <><Save size={18} /><span>Salvar Chaves</span></>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* YouTube API Settings (Admin Only) */}
            {user?.role === 'admin' ? (
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-rose-100 text-rose-600 rounded-lg">
                                <AlertCircle size={20} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-gray-900">Configurações YouTube API</h2>
                                <p className="text-sm text-gray-500">Credenciais globais para conexão com o Google Cloud Console.</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">YOUTUBE_CLIENT_ID</label>
                                <input 
                                    type="text"
                                    value={systemSettings.YOUTUBE_CLIENT_ID || ''}
                                    onChange={(e) => setSystemSettings({...systemSettings, YOUTUBE_CLIENT_ID: e.target.value})}
                                    placeholder="Insira o Client ID do Google Console aqui..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all font-mono text-sm"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-semibold text-gray-700">YOUTUBE_CLIENT_SECRET</label>
                                <input 
                                    type="password"
                                    value={systemSettings.YOUTUBE_CLIENT_SECRET || ''}
                                    onChange={(e) => setSystemSettings({...systemSettings, YOUTUBE_CLIENT_SECRET: e.target.value})}
                                    placeholder="Insira o Client Secret do Google Console aqui..."
                                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 transition-all font-mono text-sm"
                                />
                            </div>
                        </div>

                        <div className="pt-6 border-t border-gray-100 flex justify-end">
                            <button
                                onClick={handleSaveSystemSettings}
                                disabled={savingSystem}
                                className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-lg active:scale-[0.98]"
                            >
                                {savingSystem ? 'Salvando...' : 'Salvar Credenciais API'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-6">
                    <div className="flex items-center gap-3 text-gray-500">
                        <AlertCircle size={20} />
                        <p className="text-sm font-medium">As configurações da API do YouTube só podem ser visualizadas e editadas por administradores.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SystemSettingsPage;
