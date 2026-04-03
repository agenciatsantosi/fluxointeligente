import React, { useState, useEffect } from 'react';
import { Bot, MessageCircle, Facebook as FacebookIcon, Instagram as InstagramIcon, Twitter as TwitterIcon, Hash as HashIcon, Plus, Trash2, Power, PowerOff, RefreshCw, AlertCircle, X, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { QRCodeSVG } from 'qrcode.react';

interface Account {
    id: string | number;
    name?: string;
    username?: string;
    enabled?: boolean;
    added_at?: string;
    addedAt?: string;
    status?: string;
    last_error?: string;
}

interface AutomationAccountsPageProps {
    setActiveTab: (tab: string) => void;
}

const AutomationAccountsPage: React.FC<AutomationAccountsPageProps> = ({ setActiveTab }) => {
    const [accounts, setAccounts] = useState<{
        telegram: Account[];
        whatsapp: Account[];
        facebook: Account[];
        instagram: Account[];
        twitter: Account[];
        pinterest: Account[];
    }>({
        telegram: [],
        whatsapp: [],
        facebook: [],
        instagram: [],
        twitter: [],
        pinterest: []
    });

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [activeAddForm, setActiveAddForm] = useState<string | null>(null);

    // Form States
    const [telegramToken, setTelegramToken] = useState('');
    const [telegramStatus, setTelegramStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [telegramMessage, setTelegramMessage] = useState('');

    const [whatsappStatus, setWhatsappStatus] = useState('disconnected');
    const [whatsappQr, setWhatsappQr] = useState<string | null>(null);

    const [facebookPageId, setFacebookPageId] = useState('');
    const [facebookToken, setFacebookToken] = useState('');
    const [facebookIGBusinessId, setFacebookIGBusinessId] = useState<string | null>(null);
    const [facebookIGUsername, setFacebookIGUsername] = useState<string | null>(null);

    const [instagramAccountId, setInstagramAccountId] = useState('');
    const [instagramToken, setInstagramToken] = useState('');

    const [twitterApiKey, setTwitterApiKey] = useState('');
    const [twitterApiSecret, setTwitterApiSecret] = useState('');
    const [twitterAccessToken, setTwitterAccessToken] = useState('');
    const [twitterTokenSecret, setTwitterTokenSecret] = useState('');

    const [pinterestToken, setPinterestToken] = useState('');
    const [waAccountName, setWaAccountName] = useState('');
    
    // Bridge Settings States
    const [bridgeEnabled, setBridgeEnabled] = useState(false);
    const [bridgeBotToken, setBridgeBotToken] = useState('');
    const [bridgeChatId, setBridgeChatId] = useState('');
    const [savingBridge, setSavingBridge] = useState(false);

    // Meta App Config States
    const [metaAppId, setMetaAppId] = useState('');
    const [metaAppSecret, setMetaAppSecret] = useState('');
    const [savingMeta, setSavingMeta] = useState(false);

    // Meta Wizard States
    const [wizardStep, setWizardStep] = useState(1);
    const [isMetaWizard, setIsMetaWizard] = useState(false);
    const [isInstagramWizard, setIsInstagramWizard] = useState(false);
    const [detectedIG, setDetectedIG] = useState<any>(null);
    const [wizardLoading, setWizardLoading] = useState(false);
    const [wizardError, setWizardError] = useState<string | null>(null);
    const [discoveredPages, setDiscoveredPages] = useState<any[]>([]);
    const [userTokenForRefresh, setUserTokenForRefresh] = useState('');

    useEffect(() => {
        loadAllAccounts();

        // Check if we should refresh because we navigated back from a platform page
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !isMetaWizard && !isInstagramWizard) {
                // Only reload account lists, not form configs
                loadAllAccounts(false);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const loadAllAccounts = async (initConfigs = true) => {
        try {
            setLoading(true);
            const [telegram, whatsapp, facebook, instagram, twitter, pinterest, userConfig] = await Promise.all([
                api.get('/telegram/accounts').catch(err => { console.error('Telegram error:', err); return { data: { accounts: [] } }; }),
                api.get('/whatsapp/accounts').catch(err => { console.error('WhatsApp error:', err); return { data: { accounts: [] } }; }),
                api.get('/facebook/pages').catch(err => { console.error('Facebook error:', err); return { data: { pages: [] } }; }),
                api.get('/instagram/accounts').catch(err => { console.error('Instagram error:', err); return { data: { accounts: [] } }; }),
                api.get('/twitter/accounts').catch(err => { console.error('Twitter error:', err); return { data: { accounts: [] } }; }),
                api.get('/pinterest/boards').catch(err => { console.error('Pinterest error:', err); return { data: { boards: [] } }; }),
                api.get('/user-config').catch(err => { console.error('User config error:', err); return { data: { config: {} } }; })
            ]);

            if (userConfig.data.success && userConfig.data.config && initConfigs) {
                const config = userConfig.data.config;
                setBridgeEnabled(config.telegram_bridge_enabled === 'true' || config.telegram_bridge_enabled === true);
                setBridgeBotToken(config.telegram_bridge_bot_token || '');
                setBridgeChatId(config.telegram_bridge_chat_id || '');
                
                // Meta App Config
                setMetaAppId(config.META_APP_ID || '');
                setMetaAppSecret(config.META_APP_SECRET || '');
            }

            console.log('[DEBUG] Accounts loaded:', {
                telegram: telegram.data.accounts?.length || 0,
                whatsapp: whatsapp.data.groups?.length || 0,
                twitter: twitter.data.accounts?.length || 0
            });

            setAccounts({
                telegram: telegram.data.accounts || [],
                whatsapp: whatsapp.data.accounts || [],
                facebook: facebook.data.pages || [],
                instagram: instagram.data.accounts || [],
                twitter: twitter.data.accounts || [],
                pinterest: pinterest.data.boards || []
            });
        } catch (error) {
            console.error('Erro crítico ao carregar contas:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadAllAccounts();
        setRefreshing(false);
    };

    const handleToggleAccount = async (platform: string, accountId: string | number) => {
        try {
            // For now, just update locally - backend toggle endpoints may need to be added
            const platformKey = platform as keyof typeof accounts;
            setAccounts(prev => ({
                ...prev,
                [platform]: prev[platformKey].map(acc =>
                    acc.id === accountId ? { ...acc, enabled: !acc.enabled } : acc
                )
            }));
        } catch (error) {
            console.error('Erro ao alternar conta:', error);
        }
    };

    const handleDeleteAccount = async (platform: string, accountId: string | number) => {
        if (!confirm('Tem certeza que deseja remover esta conta?')) return;

        try {
            // Call appropriate delete endpoint based on platform
            let endpoint = '';
            switch (platform) {
                case 'telegram':
                    endpoint = `/telegram/accounts/${accountId}`;
                    break;
                case 'whatsapp':
                    endpoint = `/whatsapp/accounts/${accountId}`;
                    break;
                // ... (rest remains same)
                case 'facebook':
                    endpoint = `/facebook/page/${accountId}`;
                    break;
                case 'instagram':
                    endpoint = `/instagram/accounts/${accountId}`;
                    break;
                case 'twitter':
                    endpoint = `/twitter/accounts/${accountId}`;
                    break;
                case 'pinterest':
                    endpoint = `/pinterest/board/${accountId}`;
                    break;
            }

            await api.delete(endpoint);

            // Update local state
            const platformKey = platform as keyof typeof accounts;
            setAccounts(prev => ({
                ...prev,
                [platform]: prev[platformKey].filter(acc => acc.id !== accountId)
            }));

            alert('✅ Conta removida com sucesso!');
        } catch (error) {
            console.error('Erro ao deletar conta:', error);
            alert('❌ Erro ao remover conta. Tente novamente.');
        }
    };

    const navigateToPlatform = (platform: string) => {
        const routes: Record<string, string> = {
            telegram: 'telegram_automation',
            whatsapp: 'whatsapp_automation',
            facebook: 'facebook_automation',
            instagram: 'instagram_automation',
            twitter: 'twitter_automation',
            pinterest: 'pinterest_automation'
        };

        if (routes[platform]) {
            setActiveTab(routes[platform]);
        }
    };

    const handleTelegramConnect = async () => {
        if (!telegramToken) {
            setTelegramStatus('error');
            setTelegramMessage('Digite o token do bot');
            return;
        }

        setTelegramStatus('loading');
        setTelegramMessage('Testando conexão...');

        try {
            console.log('[DEBUG] Connecting telegram bot with token:', telegramToken.substring(0, 10) + '...');
            const response = await api.post('/telegram/accounts', { botToken: telegramToken });
            console.log('[DEBUG] Connection response:', response.data);

            if (response.data.success) {
                setTelegramStatus('success');
                setTelegramMessage(`Bot conectado: @${response.data.account.username}`);

                // Refresh accounts
                await loadAllAccounts();

                setTimeout(() => {
                    setActiveAddForm(null);
                    setTelegramToken('');
                    setTelegramStatus('idle');
                }, 2000);
            } else {
                setTelegramStatus('error');
                setTelegramMessage(response.data.error || 'Erro ao conectar');
            }
        } catch (error: any) {
            setTelegramStatus('error');
            setTelegramMessage(error.message);
        }
    };

    const [pollAccountId, setPollAccountId] = useState<number | null>(null);

    const handleWhatsAppConnect = async (force: boolean = false) => {
        try {
            if (!waAccountName.trim()) return;
            setWhatsappStatus('loading');
            const res = await api.post('/whatsapp/accounts', { name: waAccountName });
            const accId = res.data.id;

            await api.post('/whatsapp/initialize', { accountId: accId, force });
            setPollAccountId(accId);
            startWhatsAppPolling(accId);
        } catch (error: any) {
            alert('Erro ao iniciar conexão WhatsApp: ' + error.message);
            setWhatsappStatus('disconnected');
        }
    };

    const startWhatsAppPolling = (accountId: number) => {
        const interval = setInterval(async () => {
            try {
                const response = await api.get('/whatsapp/status', { params: { accountId } });
                if (response.data.success) {
                    const status = response.data.status;
                    setWhatsappStatus(status);

                    if (status === 'qr_ready') {
                        const qrResponse = await api.get('/whatsapp/qr', { params: { accountId } });
                        if (qrResponse.data.qr) {
                            setWhatsappQr(qrResponse.data.qr);
                        }
                    } else if (status === 'connected') {
                        setWhatsappQr(null);
                        setWaAccountName('');
                        clearInterval(interval);
                        await loadAllAccounts();
                        setTimeout(() => setActiveAddForm(null), 3000);
                    } else if (status === 'loading_data') {
                        setWhatsappQr(null);
                        // Just keep polling
                    }
                }
            } catch (error) {
                console.error('Error polling WhatsApp status:', error);
            }
        }, 3000);
    };

    const handleWhatsAppDisconnect = async (accountId: number) => {
        if (!confirm('Tem certeza que deseja desconectar este WhatsApp?')) return;
        try {
            await api.post('/whatsapp/disconnect', { accountId });
            setWhatsappStatus('disconnected');
            setWhatsappQr(null);
            await loadAllAccounts();
        } catch (error: any) {
            alert('Erro ao desconectar WhatsApp: ' + error.message);
        }
    };

    const handleFacebookConnect = async () => {
        setWizardError(null);
        const cleanedId = facebookPageId.trim();

        if (!cleanedId || !facebookToken) {
            setWizardError('Preencha os campos do Facebook antes de continuar.');
            return;
        }

        // Intelligent URL detection & Extraction
        let finalId = cleanedId;
        if (cleanedId.includes('facebook.com') || cleanedId.includes('/')) {
            const idMatch = cleanedId.match(/id=(\d+)/) || cleanedId.match(/\/(\d+)(\/|$|\?)/);

            if (idMatch && idMatch[1]) {
                finalId = idMatch[1];
                setFacebookPageId(finalId); // Auto-update UI
                console.log(`[WIZARD] Auto-extracted ID: ${finalId}`);
            } else {
                setWizardError('Não conseguimos encontrar o ID no link colado. Por favor, use apenas o número do ID ou o botão "Mágica".');
                return;
            }
        }

        // Specific warning for User Profiles (usually start with 1000)
        if (finalId.startsWith('1000')) {
            setWizardError('⚠️ Esse ID parece ser do seu **Perfil Pessoal**.\n\nO Facebook não permite automação em perfis pessoais. Você deve usar uma **Página**.\n\n💡 Dica: Clique no botão **"🪄 Mágica"** abaixo para que o sistema encontre sua Página automaticamente!');
            return;
        }

        if (!/^\d+$/.test(finalId)) {
            setWizardError('ID da Página inválido. Certifique-se de usar apenas números, sem espaços ou letras.');
            return;
        }

        try {
            if (isInstagramWizard) {
                // If it's just the Instagram Wizard, we DON'T save the Facebook Page,
                // we just use it to find the linked Instagram Account.
                setWizardStep(2);
                handleDetectInstagram(finalId, facebookToken);
            } else {
                // If it's the Meta Wizard or normal Facebook add, save the Page
                const response = await api.post('/facebook/pages', {
                    pageId: finalId,
                    accessToken: facebookToken,
                    instagramBusinessId: facebookIGBusinessId,
                    instagramUsername: facebookIGUsername,
                    userAccessToken: userTokenForRefresh // <-- NOVO: Token Global para renovação
                });

                if (response.data.success) {
                    if (isMetaWizard) {
                        setWizardStep(2);
                        handleDetectInstagram(finalId, facebookToken);
                    } else {
                        setWizardError('✅ Página conectada com sucesso!');
                        setFacebookPageId('');
                        setFacebookToken('');
                        setTimeout(() => {
                            setActiveAddForm(null);
                            setWizardError(null);
                        }, 2000);
                        await loadAllAccounts();
                    }
                } else {
                    setWizardError(response.data.error);
                }
            } // Close if/else isInstagramWizard
        } catch (error: any) {
            const serverError = error.response?.data?.error || error.message;
            setWizardError(serverError);
        }
    };

    const handleDetectInstagram = async (pageId: string, token: string) => {
        setWizardLoading(true);
        setWizardError(null);
        try {
            const response = await api.get('/facebook/detect-instagram', {
                params: { pageId, accessToken: token }
            });
            if (response.data.success) {
                setDetectedIG(response.data.instagramAccount);
            }
        } catch (error: any) {
            console.error('Error detecting IG:', error);
            const serverError = error.response?.data?.error || error.message;
            setWizardError('Erro ao detectar Instagram: ' + serverError);
            setWizardLoading(false);
        } finally {
            setWizardLoading(false);
        }
    };

    const handleFetchPages = async () => {
        if (!facebookToken) {
            setWizardError('Cole o seu Access Token para buscar suas páginas automaticamente.');
            return;
        }

        setWizardLoading(true);
        setWizardError(null);
        try {
            const response = await api.get('/facebook/list-pages', {
                params: { accessToken: facebookToken }
            });

            if (response.data.success) {
                if (response.data.pages.length === 0) {
                    setWizardError('Nenhuma página encontrada para este token. Verifique se você é administrador de alguma página.');
                } else {
                    setDiscoveredPages(response.data.pages);
                }
            } else {
                setWizardError(response.data.error);
            }
        } catch (error: any) {
            const serverError = error.response?.data?.error || error.message;
            setWizardError('Erro ao buscar páginas: ' + serverError);
        } finally {
            setWizardLoading(false);
        }
    };

    const handleInstagramConnect = async () => {
        setWizardError(null);
        if (!instagramAccountId || !instagramToken) {
            setWizardError('Preencha Account ID e Access Token antes de continuar.');
            return;
        }

        try {
            const response = await api.post('/instagram/accounts', {
                accountId: instagramAccountId,
                accessToken: instagramToken,
                userAccessToken: userTokenForRefresh // <-- NOVO: Token Global para renovação
            });

            if (response.data.success) {
                setWizardError('✅ Conta Instagram adicionada com sucesso!');
                setInstagramAccountId('');
                setInstagramToken('');
                setTimeout(() => {
                    setActiveAddForm(null);
                    setWizardError(null);
                }, 2000);
                await loadAllAccounts();
            } else {
                setWizardError(response.data.error);
            }
        } catch (error: any) {
            const serverError = error.response?.data?.error || error.message;
            setWizardError(serverError);
        }
    };

    const handleTwitterConnect = async () => {
        if (!twitterApiKey || !twitterApiSecret || !twitterAccessToken || !twitterTokenSecret) {
            alert('Preencha todas as credenciais');
            return;
        }

        try {
            const response = await api.post('/twitter/accounts', {
                apiKey: twitterApiKey,
                apiSecret: twitterApiSecret,
                accessToken: twitterAccessToken,
                accessTokenSecret: twitterTokenSecret
            });

            if (response.data.success) {
                alert('✅ Conta conectada com sucesso!');
                setTwitterApiKey('');
                setTwitterApiSecret('');
                setTwitterAccessToken('');
                setTwitterTokenSecret('');
                setActiveAddForm(null);
                await loadAllAccounts();
            } else {
                alert('❌ Erro: ' + response.data.error);
            }
        } catch (error: any) {
            alert('❌ Erro: ' + error.message);
        }
    };

    const handlePinterestConnect = async () => {
        if (!pinterestToken) {
            alert('Digite o Access Token');
            return;
        }

        try {
            // Pinterest logic might vary, assuming a similar endpoint structure
            const response = await api.post('/pinterest/accounts', {
                accessToken: pinterestToken
            });

            if (response.data.success) {
                alert('✅ Conta adicionada!');
                setPinterestToken('');
                setActiveAddForm(null);
                await loadAllAccounts();
            } else {
                alert('❌ Erro: ' + response.data.error);
            }
        } catch (error: any) {
            alert('❌ Erro: ' + error.message);
        }
    };

    const handleSaveMetaConfig = async () => {
        setSavingMeta(true);
        try {
            await api.post('/system-config/bulk', { 
                configs: {
                    'META_APP_ID': metaAppId,
                    'META_APP_SECRET': metaAppSecret
                }
            });
            alert('✅ Configurações do App Meta salvas com sucesso!');
        } catch (error: any) {
            console.error('Error saving Meta config:', error);
            alert('❌ Erro ao salvar: ' + (error.response?.data?.error || error.message));
        } finally {
            setSavingMeta(false);
        }
    };

    const handleSaveBridge = async () => {
        setSavingBridge(true);
        try {
            await api.post('/user-config', { key: 'telegram_bridge_enabled', value: String(bridgeEnabled) });
            await api.post('/user-config', { key: 'telegram_bridge_bot_token', value: bridgeBotToken });
            await api.post('/user-config', { key: 'telegram_bridge_chat_id', value: bridgeChatId });
            alert('✅ Configurações da Ponte de Vídeo salvas com sucesso!');
        } catch (error: any) {
            console.error('Error saving bridge config:', error);
            alert('❌ Erro ao salvar: ' + (error.response?.data?.error || error.message));
        } finally {
            setSavingBridge(false);
        }
    };

    const platformStyles: Record<string, { bgLight: string, border: string, bg: string, text: string, hover: string }> = {
        telegram: { bgLight: 'bg-blue-50', border: 'border-blue-100', bg: 'bg-blue-600', text: 'text-blue-600', hover: 'hover:bg-blue-700' },
        whatsapp: { bgLight: 'bg-green-50', border: 'border-green-100', bg: 'bg-green-600', text: 'text-green-600', hover: 'hover:bg-green-700' },
        facebook: { bgLight: 'bg-blue-50', border: 'border-blue-100', bg: 'bg-blue-600', text: 'text-blue-600', hover: 'hover:bg-blue-700' },
        instagram: { bgLight: 'bg-pink-50', border: 'border-pink-100', bg: 'bg-pink-600', text: 'text-pink-600', hover: 'hover:bg-pink-700' },
        twitter: { bgLight: 'bg-sky-50', border: 'border-sky-100', bg: 'bg-sky-600', text: 'text-sky-600', hover: 'hover:bg-sky-700' },
        pinterest: { bgLight: 'bg-red-50', border: 'border-red-100', bg: 'bg-red-600', text: 'text-red-600', hover: 'hover:bg-red-700' }
    };

    const platforms = [
        {
            id: 'telegram',
            name: 'Telegram',
            icon: Bot,
            accounts: accounts.telegram,
            accountType: 'bots'
        },
        {
            id: 'whatsapp',
            name: 'WhatsApp',
            icon: MessageCircle,
            accounts: accounts.whatsapp,
            accountType: 'conexões'
        },
        {
            id: 'facebook',
            name: 'Facebook',
            icon: FacebookIcon,
            accounts: accounts.facebook,
            accountType: 'páginas'
        },
        {
            id: 'instagram',
            name: 'Instagram',
            icon: InstagramIcon,
            accounts: accounts.instagram,
            accountType: 'contas'
        },
        {
            id: 'twitter',
            name: 'Twitter/X',
            icon: TwitterIcon,
            accounts: accounts.twitter,
            accountType: 'contas'
        },
        {
            id: 'pinterest',
            name: 'Pinterest',
            icon: HashIcon,
            accounts: accounts.pinterest,
            accountType: 'boards'
        }
    ];

    const totalAccounts = Object.values(accounts).reduce((sum, arr) => sum + arr.length, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <RefreshCw className="animate-spin mx-auto mb-4 text-purple-600" size={48} />
                    <p className="text-gray-600">Carregando suas contas...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in max-w-7xl mx-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-purple-500/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-16 -mt-16 blur-3xl"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-black/10 rounded-full -ml-10 -mb-10 blur-2xl"></div>

                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <Bot size={32} className="text-white" />
                            </div>
                            <h1 className="text-3xl font-bold">Minhas Contas de Automação</h1>
                        </div>
                        <p className="text-purple-100 text-lg max-w-2xl">
                            Gerencie todas as suas contas conectadas em um só lugar
                        </p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing}
                        className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-4 py-2 rounded-xl border border-white/20 hover:bg-white/20 transition-all font-bold"
                    >
                        <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Atualizando...' : 'Atualizar'}
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                {platforms.map(platform => {
                    const style = platformStyles[platform.id as keyof typeof platformStyles];
                    return (
                        <div
                            key={platform.id}
                            className={`${style.bgLight} border ${style.border} rounded-2xl p-4 text-center`}
                        >
                            <platform.icon className={`${style.text} mx-auto mb-2`} size={24} />
                            <div className={`text-2xl font-bold ${style.text}`}>
                                {platform.accounts.length}
                            </div>
                            <div className="text-xs text-gray-600 font-medium">{platform.name}</div>
                        </div>
                    );
                })}
            </div>

            {/* 🪄 Meta Magic Connection Wizard (New) */}
            <div className="relative group p-[2px] rounded-[24px] bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 shadow-2xl overflow-hidden mb-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="absolute inset-0 bg-white/40 backdrop-blur-3xl group-hover:bg-transparent transition-colors duration-500"></div>

                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-700">
                    <FacebookIcon size={120} className="text-white" />
                </div>
                <div className="absolute bottom-0 left-0 p-8 opacity-10 group-hover:-rotate-12 transition-transform duration-700">
                    <InstagramIcon size={120} className="text-white" />
                </div>

                <div className="bg-white/95 backdrop-blur-md rounded-[22px] p-8 md:p-10 relative z-10">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 md:gap-12">
                        <div className="flex-1 space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="flex -space-x-2">
                                    <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg transform -rotate-6">
                                        <FacebookIcon size={20} />
                                    </div>
                                    <div className="w-10 h-10 bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 text-white rounded-xl flex items-center justify-center shadow-lg transform rotate-6">
                                        <InstagramIcon size={20} />
                                    </div>
                                </div>
                                <span className="bg-purple-600 text-white text-[10px] font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded-full shadow-lg shadow-purple-200">Exclusivo FluxoInteligente</span>
                            </div>
                            <div>
                                <h2 className="text-3xl md:text-4xl font-black text-gray-900 tracking-tight leading-none mb-4">
                                    Meta Magic <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">Connector</span>
                                </h2>
                                <p className="text-gray-500 max-w-xl text-sm md:text-base leading-relaxed font-medium">
                                    A tecnologia proprietária da FluxoInteligente que automatiza a descoberta de suas Redes Sociais.
                                    <span className="block mt-1 font-bold text-gray-400">Pincelamos seus IDs e tokens automaticamente para você.</span>
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={() => {
                                setIsMetaWizard(true);
                                setWizardStep(1);
                                setActiveAddForm('facebook');
                                setWizardError(null);
                            }}
                            className="bg-gray-900 text-white px-10 py-5 rounded-2xl font-black text-lg hover:bg-black hover:scale-[1.02] hover:shadow-2xl active:scale-95 transition-all flex items-center justify-center gap-4 group/btn shrink-0"
                        >
                            <div className="p-2 bg-white/10 rounded-lg group-hover/btn:rotate-180 transition-transform duration-500">
                                <RefreshCw size={24} />
                            </div>
                            Iniciar Conexão Premium
                        </button>
                    </div>
                </div>
            </div>

            {/* Platform Sections */}
            <div className="space-y-6">
                {platforms.map(platform => {
                    const Icon = platform.icon;
                    const style = platformStyles[platform.id as keyof typeof platformStyles];
                    return (
                        <div key={platform.id} className="bg-white rounded-2xl shadow-lg overflow-hidden border border-gray-100">
                            <div className={`${style.bgLight} px-6 py-4 border-b ${style.border} flex items-center justify-between`}>
                                <div className="flex items-center gap-3">
                                    <Icon className={style.text} size={24} />
                                    <h2 className="text-lg font-bold text-gray-800">{platform.name}</h2>
                                    <span className={`px-2 py-0.5 ${style.bgLight} ${style.text} rounded-full text-xs font-bold border ${style.border}`}>
                                        {platform.accounts.length} {platform.accountType}
                                    </span>
                                </div>
                                <button
                                    onClick={() => {
                                        setIsMetaWizard(false);
                                        setWizardError(null);
                                        setActiveAddForm(activeAddForm === platform.id ? null : platform.id);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2 ${style.bg} text-white rounded-lg ${style.hover} transition-all text-sm font-bold shadow-md shadow-gray-200`}
                                >
                                    {activeAddForm === platform.id ? <X size={16} /> : <Plus size={16} />}
                                    {activeAddForm === platform.id ? 'Fechar' : 'Adicionar'}
                                </button>
                            </div>

                            <div className="p-6">
                                {activeAddForm === platform.id && (
                                    <div className={`mb-6 p-6 rounded-2xl border ${style.border} ${style.bgLight} animate-in fade-in slide-in-from-top-4 duration-300`}>
                                        <div className="flex items-center justify-between mb-4">
                                            <h3 className="font-bold text-gray-800 text-lg">Conectar {platform.name}</h3>
                                            <button onClick={() => setActiveAddForm(null)} className="text-gray-400 hover:text-gray-600 p-1" title="Fechar formulário">
                                                <X size={20} />
                                            </button>
                                        </div>

                                        {wizardError && (
                                            <div className="mb-6 bg-white/60 backdrop-blur-md border border-red-200/50 rounded-2xl overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-300">
                                                <div className="flex bg-red-50/50 p-4 gap-3 border-b border-red-100/50">
                                                    <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={18} />
                                                    <div className="flex-1">
                                                        <h4 className="text-sm font-black text-red-900 uppercase tracking-tight mb-1">Atenção Necessária</h4>
                                                        <p className="text-xs text-red-800 leading-relaxed font-medium">
                                                            {wizardError.split('💡')[0].replace('❌', '').trim()}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => setWizardError(null)}
                                                        className="text-red-400 hover:text-red-600 transition-colors p-1 hover:bg-red-100 rounded-lg h-fit"
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                {wizardError.includes('💡') && (
                                                    <div className="p-4 bg-white/40 flex gap-3 items-start">
                                                        <div className="p-1.5 bg-amber-100 rounded-lg text-amber-600 shrink-0">
                                                            <RefreshCw size={14} />
                                                        </div>
                                                        <div className="flex-1">
                                                            <h5 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1">Dica de Especialista</h5>
                                                            <p className="text-[11px] text-amber-800 leading-relaxed whitespace-pre-line">
                                                                {wizardError.split('💡')[1].replace('Dica:', '').replace('Solução:', '').trim()}
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Telegram Form */}
                                        {platform.id === 'telegram' && (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-1">Token do Bot</label>
                                                    <input
                                                        type="text"
                                                        value={telegramToken}
                                                        onChange={(e) => setTelegramToken(e.target.value)}
                                                        placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz..."
                                                        className="w-full px-4 py-3 rounded-xl border border-blue-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all outline-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleTelegramConnect}
                                                    disabled={telegramStatus === 'loading'}
                                                    className={`w-full py-3 rounded-xl font-bold text-white transition-all shadow-lg ${telegramStatus === 'loading' ? 'bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'}`}
                                                >
                                                    {telegramStatus === 'loading' ? 'Conectando...' : 'Conectar Bot'}
                                                </button>
                                                {telegramStatus !== 'idle' && (
                                                    <div className={`p-3 rounded-lg text-sm font-medium flex items-center gap-2 ${telegramStatus === 'success' ? 'bg-green-100 text-green-700' : telegramStatus === 'error' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                                                        {telegramStatus === 'loading' ? <RefreshCw size={14} className="animate-spin" /> : telegramStatus === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
                                                        {telegramMessage}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* WhatsApp Form */}
                                        {platform.id === 'whatsapp' && (
                                            <div className="text-center space-y-4">
                                                {whatsappStatus === 'disconnected' || whatsappStatus === 'loading' ? (
                                                    <div className="py-8 space-y-6">
                                                        <MessageCircle className="mx-auto text-green-300 animate-pulse" size={64} />

                                                        <div className="max-w-md mx-auto text-left">
                                                            <label className="block text-sm font-bold text-gray-700 mb-2 font-poppins">Nome da Conexão</label>
                                                            <input
                                                                type="text"
                                                                value={waAccountName}
                                                                onChange={(e) => setWaAccountName(e.target.value)}
                                                                placeholder="Ex: Celular Pessoal, WhatsApp Business..."
                                                                className="w-full px-5 py-3 rounded-2xl border border-green-200 focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none transition-all bg-white shadow-sm"
                                                            />
                                                            <p className="mt-2 text-xs text-gray-400">Dê um nome fácil de identificar para esta conta.</p>
                                                        </div>

                                                        <div className="pt-2">
                                                            <button
                                                                onClick={() => handleWhatsAppConnect(false)}
                                                                disabled={whatsappStatus === 'loading' || !waAccountName.trim()}
                                                                className={`px-10 py-4 rounded-2xl font-bold transition-all shadow-xl flex items-center gap-3 mx-auto text-white ${whatsappStatus === 'loading' || !waAccountName.trim() ? 'bg-gray-300 cursor-not-allowed shadow-none' : 'bg-green-600 hover:bg-green-700 hover:scale-105 active:scale-95'}`}
                                                            >
                                                                {whatsappStatus === 'loading' ? <RefreshCw size={20} className="animate-spin" /> : <Plus size={20} />}
                                                                {whatsappStatus === 'loading' ? 'Iniciando Servidor...' : 'Gerar QR Code de Conexão'}
                                                            </button>

                                                            <button
                                                                onClick={() => handleWhatsAppConnect(true)}
                                                                disabled={whatsappStatus === 'loading' || !waAccountName.trim()}
                                                                className="mt-6 text-xs text-gray-400 hover:text-red-500 transition-colors block mx-auto font-medium"
                                                            >
                                                                ⚠️ Limpar Sessão e Forçar Nova Conexão
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : whatsappStatus === 'qr_ready' && whatsappQr ? (
                                                    <div className="bg-white p-6 rounded-2xl inline-block shadow-inner mx-auto mb-4">
                                                        <QRCodeSVG value={whatsappQr} size={250} level="H" includeMargin />
                                                        <p className="mt-4 text-sm font-bold text-gray-800">Escaneie com seu WhatsApp</p>
                                                    </div>
                                                ) : whatsappStatus === 'loading_data' ? (
                                                    <div className="py-8 text-center">
                                                        <RefreshCw className="animate-spin mx-auto mb-4 text-blue-500" size={64} />
                                                        <p className="text-blue-600 font-bold mb-2">Conectado! Aguarde...</p>
                                                        <p className="text-gray-500 text-sm">Carregando seus grupos e contatos. Isso pode levar alguns segundos.</p>
                                                    </div>
                                                ) : (
                                                    <div className="py-8">
                                                        <CheckCircle className="mx-auto mb-4 text-green-500" size={64} />
                                                        <p className="text-green-600 font-bold mb-2">Conectado com sucesso!</p>
                                                        <p className="text-gray-500 text-sm">Seus grupos já estão disponíveis.</p>
                                                        <button
                                                            onClick={() => pollAccountId && handleWhatsAppDisconnect(pollAccountId)}
                                                            className="mt-6 text-sm text-red-500 hover:text-red-700 font-medium underline"
                                                        >
                                                            Desconectar e Configurar Especial
                                                        </button>
                                                        <button
                                                            onClick={() => navigateToPlatform('whatsapp')}
                                                            className="mt-4 block w-full py-2 bg-green-100 text-green-700 rounded-lg font-bold hover:bg-green-200"
                                                        >
                                                            Ir para Painel de Automação
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Meta Wizard (Shared for Facebook and Instagram) */}
                                        {(platform.id === 'facebook' || (platform.id === 'instagram' && isInstagramWizard)) && (
                                            <div className="space-y-4">
                                                {(isMetaWizard || isInstagramWizard) && (
                                                    <div className="mb-6 relative">
                                                        <button
                                                            onClick={() => {
                                                                setIsMetaWizard(false);
                                                                setIsInstagramWizard(false);
                                                                setActiveAddForm(null);
                                                                setWizardError(null);
                                                            }}
                                                            className="absolute -top-12 -right-2 p-2 text-gray-400 hover:text-gray-600 transition-colors"
                                                            title="Cancelar"
                                                        >
                                                            <X size={20} />
                                                        </button>

                                                        <div className="flex items-center justify-between mb-8 relative">
                                                            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-gray-100 -z-10"></div>
                                                            {[1, 2, 3].map(step => (
                                                                <div key={step} className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all border-4 ${wizardStep >= step ? 'bg-purple-600 border-purple-100 text-white' : 'bg-white border-gray-100 text-gray-300'}`}>
                                                                    {step}
                                                                </div>
                                                            ))}
                                                        </div>
                                                        <div className="flex justify-between text-[10px] font-black uppercase tracking-tighter text-gray-400 px-1">
                                                            <span>Facebook</span>
                                                            <span>Detectar IG</span>
                                                            <span>Finalizar</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {wizardStep === 1 ? (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-5 rounded-2xl border border-blue-100 shadow-sm mb-4 relative overflow-hidden group">
                                                            <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                                                                <FacebookIcon size={40} className="text-blue-600" />
                                                            </div>
                                                            <div className="flex gap-4 relative z-10">
                                                                <div className="shrink-0">
                                                                    <div className="w-8 h-8 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center text-xs font-black">01</div>
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-sm font-black text-blue-900 mb-1 uppercase tracking-tight">
                                                                        {isInstagramWizard ? 'Conexão via Página Meta' : 'Conexão Estratégica'}
                                                                    </h4>
                                                                    <p className="text-[11px] text-blue-700/80 leading-relaxed font-bold">
                                                                        {isInstagramWizard
                                                                            ? 'Para conectar o Instagram Business, o Facebook exige que você primeiro selecione a Página do Facebook a qual o Instagram está vinculado.'
                                                                            : 'Conecte sua Página do Facebook para desbloquear a gestão automatizada de conversões e respostas em tempo real.'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-6">
                                                            {/* Step Header */}
                                                            <div className="flex items-center gap-3 pb-2 border-b border-gray-100">
                                                                <div className="w-8 h-8 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 flex items-center justify-center text-xs font-black">01</div>
                                                                <div>
                                                                    <h4 className="text-sm font-black text-gray-800 uppercase tracking-tight">
                                                                        {isInstagramWizard ? 'Passo 1: Encontrar sua Página' : 'Vincular Página'}
                                                                    </h4>
                                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Inicie com seu User Token</p>
                                                                </div>
                                                            </div>

                                                            {/* User Token Input - The Start of Everything */}
                                                            <div className="bg-white p-5 rounded-2xl border-2 border-purple-100 shadow-sm relative group/input">
                                                                <div className="flex items-center justify-between mb-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <label className="block text-xs font-black text-purple-600 uppercase tracking-widest">User Access Token</label>
                                                                        <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-md font-black uppercase tracking-widest border border-purple-200">Seguro</span>
                                                                    </div>
                                                                    <a
                                                                        href="https://developers.facebook.com/tools/explorer/"
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="text-[10px] text-purple-600 hover:text-purple-700 underline font-black uppercase tracking-tighter flex items-center gap-1"
                                                                    >
                                                                        Gerar no Explorer <RefreshCw size={10} />
                                                                    </a>
                                                                </div>
                                                                <div className="relative">
                                                                    <input
                                                                        type="password"
                                                                        value={facebookToken}
                                                                        onChange={(e) => {
                                                                            setFacebookToken(e.target.value);
                                                                            setUserTokenForRefresh(e.target.value); // Salva o token global original
                                                                            if (wizardError) setWizardError(null);
                                                                        }}
                                                                        placeholder="Cole seu Token e clique no botão roxo abaixo..."
                                                                        className="w-full px-5 py-4 rounded-xl border-2 border-gray-100 focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 outline-none transition-all font-mono text-sm bg-gray-50/50 hover:bg-white focus:bg-white"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Educational Callout */}
                                                            <div className="bg-amber-50/50 p-4 rounded-2xl border border-amber-100/50 relative overflow-hidden">
                                                                <div className="absolute -right-2 -bottom-2 opacity-10">
                                                                    <AlertCircle size={60} className="text-amber-500" />
                                                                </div>
                                                                <h5 className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-1 flex items-center gap-1">
                                                                    💡 Curiosidade: Por que o ID 1000... falha?
                                                                </h5>
                                                                <p className="text-[10px] text-amber-700/70 font-bold leading-relaxed">
                                                                    Seu Perfil Pessoal sempre começa com 1000. Sites de "Find ID" costumam mostrar o ID do seu Perfil, mas o FluxoInteligente precisa do ID da sua **Página Comercial** (que é o que tem o campo "Mensagens"). Use o botão abaixo para não errar!
                                                                </p>
                                                            </div>

                                                            {/* Discovery Button - Prominent & Pulsing */}
                                                            <button
                                                                type="button"
                                                                onClick={handleFetchPages}
                                                                disabled={wizardLoading || !facebookToken}
                                                                className={`w-full py-5 rounded-2xl border-2 border-dashed flex items-center justify-center gap-3 transition-all shadow-2xl ${!facebookToken ? 'border-gray-200 text-gray-400 cursor-not-allowed opacity-50' : 'border-purple-400 bg-purple-50 text-purple-700 hover:border-purple-600 hover:bg-purple-100/50 animate-pulse shadow-purple-200/50'}`}
                                                            >
                                                                {wizardLoading ? <RefreshCw size={24} className="animate-spin text-purple-600" /> : <RefreshCw size={24} className="text-purple-600" />}
                                                                <div className="text-left">
                                                                    <span className="block text-sm font-black uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-purple-700 to-indigo-700">🪄 Iniciar Mágica Meta</span>
                                                                    <span className="block text-[9px] font-bold text-purple-400 uppercase tracking-widest leading-none">Descobrir minhas páginas automaticamente</span>
                                                                </div>
                                                            </button>

                                                            {/* Discovered Pages List */}
                                                            {discoveredPages.length > 0 && (
                                                                <div className="space-y-3 animate-in fade-in slide-in-from-top-4 duration-500 bg-gray-50/50 p-4 rounded-2xl border border-gray-100 shadow-inner">
                                                                    <div className="flex items-center justify-between px-1">
                                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resultados da Busca</span>
                                                                        <button onClick={() => setDiscoveredPages([])} className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-widest flex items-center gap-1">Limpar <X size={10} /></button>
                                                                    </div>
                                                                    <div className="grid gap-3">
                                                                        {discoveredPages.map((page: any) => (
                                                                            <div key={page.id} className="p-4 bg-white border-2 border-purple-50 rounded-2xl flex items-center justify-between group hover:border-purple-400 hover:shadow-lg transition-all">
                                                                                <div className="flex items-center gap-4">
                                                                                    {page.picture?.data?.url ? (
                                                                                        <img src={page.picture.data.url} alt={page.name} className="w-12 h-12 rounded-xl shadow-md border-2 border-white grayscale group-hover:grayscale-0 transition-all object-cover" />
                                                                                    ) : (
                                                                                        <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center font-black shadow-md border-2 border-white uppercase">{page.name[0]}</div>
                                                                                    )}
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-sm font-black text-gray-800 leading-tight">{page.name}</span>
                                                                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{page.category || 'Página Meta'}</span>
                                                                                        <div className="flex items-center gap-1 mt-1">
                                                                                            <span className="text-[9px] font-mono text-purple-400">ID: {page.id}</span>
                                                                                            {page.instagram_business_account && (
                                                                                                <span className="text-[9px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-md font-black flex items-center gap-1">
                                                                                                    <InstagramIcon size={8} /> @{page.instagram_business_account.username || 'Insta'}
                                                                                                </span>
                                                                                            )}
                                                                                        </div>
                                                                                    </div>
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => {
                                                                                        setFacebookPageId(page.id);
                                                                                        // We keep the PAGE access token for THIS page
                                                                                        const pageToken = page.access_token;
                                                                                        
                                                                                        // Note: We intentionally DO NOT overwrite the user token if we want to refresh others,
                                                                                        // but for this specific page save, we need THE page token.
                                                                                        // So we'll send a separate field for global refresh.
                                                                                        setFacebookToken(pageToken); 
                                                                                        
                                                                                        setFacebookIGBusinessId(page.instagram_business_account?.id || null);
                                                                                        setFacebookIGUsername(page.instagram_business_account?.username || null);
                                                                                        setDiscoveredPages([]);
                                                                                        setWizardError(null);
                                                                                    }}
                                                                                    className={`px-5 py-2.5 text-white text-[10px] font-black rounded-xl hover:scale-105 active:scale-95 transition-all shadow-xl uppercase tracking-widest ${page.instagram_business_account ? 'bg-gradient-to-r from-pink-600 to-purple-600 shadow-pink-200' : 'bg-gradient-to-r from-purple-600 to-indigo-600 shadow-purple-200'}`}
                                                                                >
                                                                                    {isInstagramWizard ? 'Selecionar para achar o Insta' : 'Selecionar'}
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Hidden/Populated Manual Fields Visualization */}
                                                            {facebookPageId && (
                                                                <div className="p-5 rounded-2xl bg-green-50 border-2 border-green-100 shadow-sm animate-in zoom-in-95 duration-300">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-12 h-12 bg-green-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-green-100">
                                                                            <CheckCircle size={24} />
                                                                        </div>
                                                                        <div className="flex-1">
                                                                            <h5 className="text-xs font-black text-green-800 uppercase tracking-widest mb-1">Página Selecionada!</h5>
                                                                            <p className="text-[10px] font-bold text-green-600/80 uppercase tracking-tighter">Pronto para validar a conexão oficial.</p>
                                                                        </div>
                                                                        <button
                                                                            onClick={() => { setFacebookPageId(''); }}
                                                                            className="text-[10px] font-black text-red-400 hover:text-red-600 uppercase tracking-widest"
                                                                        >
                                                                            Trocar
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Connection Action */}
                                                            <button
                                                                onClick={handleFacebookConnect}
                                                                disabled={wizardLoading || !facebookPageId}
                                                                className={`w-full py-5 rounded-2xl font-black text-lg transition-all shadow-2xl flex items-center justify-center gap-3 relative overflow-hidden group/btn ${wizardLoading || !facebookPageId ? 'bg-gray-100 text-gray-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white hover:scale-[1.01] active:scale-[0.98] shadow-blue-200'}`}
                                                            >
                                                                {wizardLoading && <div className="absolute inset-0 bg-white/20 animate-pulse pointer-events-none"></div>}
                                                                {wizardLoading ? (
                                                                    <RefreshCw size={24} className="animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        {isInstagramWizard ? 'Continuar para achar o Instagram' : 'Validar Conexão Oficial'}
                                                                        <CheckCircle size={24} className="group-hover/btn:translate-x-1 transition-transform" />
                                                                    </>
                                                                )}
                                                            </button>

                                                            {/* Manual Entry Toggle (Optional/Secondary) */}
                                                            {!facebookPageId && (
                                                                <p className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest pt-2">
                                                                    Problemas com a mágica? Insira o ID manualmente no botão acima.
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : wizardStep === 2 ? (
                                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                                        <div className="text-center py-4">
                                                            <h4 className="font-bold text-gray-800 mb-1">Detectando conta do Instagram...</h4>
                                                            <p className="text-xs text-gray-500">Estamos verificando se existe um Instagram vinculado à sua Página.</p>
                                                        </div>

                                                        {wizardLoading ? (
                                                            <div className="flex flex-col items-center py-10">
                                                                <RefreshCw size={48} className="animate-spin text-purple-600 mb-4" />
                                                                <span className="text-sm font-medium text-gray-400">Verificando API do Meta...</span>
                                                            </div>
                                                        ) : detectedIG ? (
                                                            <div className="bg-gradient-to-r from-pink-50 to-purple-50 p-6 rounded-2xl border border-pink-100 flex items-center gap-4">
                                                                <div className="w-16 h-16 rounded-full border-2 border-pink-500 p-0.5 overflow-hidden bg-white">
                                                                    {detectedIG.profile_picture_url ? (
                                                                        <img src={detectedIG.profile_picture_url} alt={detectedIG.username} className="w-full h-full rounded-full object-cover" />
                                                                    ) : (
                                                                        <div className="w-full h-full rounded-full flex items-center justify-center text-pink-600 font-bold text-xl">{detectedIG.username?.[0].toUpperCase()}</div>
                                                                    )}
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <InstagramIcon size={16} className="text-pink-600" />
                                                                        <h5 className="font-bold text-gray-900">@{detectedIG.username}</h5>
                                                                    </div>
                                                                    <p className="text-xs text-gray-500">{detectedIG.name || 'Conta Profissional'}</p>
                                                                    <div className="mt-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full inline-block font-bold">VINCULADO AO FACEBOOK</div>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                                                                <AlertCircle size={32} className="text-red-500 mx-auto mb-2" />
                                                                <p className="text-sm text-red-700 font-bold">Nenhum Instagram encontrado!</p>
                                                                <p className="text-xs text-red-600 mt-1">Certifique-se de que sua conta IG é Profissional e está vinculada a esta Página.</p>
                                                            </div>
                                                        )}

                                                        <div className="flex gap-3">
                                                            <button
                                                                onClick={() => setWizardStep(1)}
                                                                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-bold transition-all"
                                                            >
                                                                Voltar
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (detectedIG) {
                                                                        setInstagramAccountId(detectedIG.id);
                                                                        setInstagramToken(facebookToken);
                                                                        setWizardStep(3);
                                                                        setWizardError(null);
                                                                    } else {
                                                                        setIsMetaWizard(false);
                                                                        setIsInstagramWizard(false);
                                                                        setActiveAddForm(null);
                                                                        setWizardError(null);
                                                                    }
                                                                }}
                                                                className="flex-[2] py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-all shadow-lg"
                                                            >
                                                                {detectedIG ? 'Continuar' : 'Finalizar apenas Facebook'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                                        <div className="text-center py-4">
                                                            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
                                                            <h4 className="font-bold text-gray-800 mb-1">Verificação Final</h4>
                                                            <p className="text-xs text-gray-500">Estamos prontos para ativar sua Inbox Unificada.</p>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                                                <span className="text-sm text-gray-600">Facebook Página</span>
                                                                <CheckCircle size={16} className="text-green-600" />
                                                            </div>
                                                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                                                                <span className="text-sm text-gray-600">Instagram Business</span>
                                                                <CheckCircle size={16} className="text-green-600" />
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={async () => {
                                                                try {
                                                                    setWizardLoading(true);
                                                                    setWizardError(null);
                                                                    await api.post('/instagram/accounts', {
                                                                        accountId: instagramAccountId,
                                                                        accessToken: instagramToken
                                                                    });
                                                                    setIsMetaWizard(false);
                                                                    setIsInstagramWizard(false);
                                                                    setActiveAddForm(null);
                                                                    setWizardStep(1);
                                                                    loadAllAccounts();
                                                                } catch (e: any) {
                                                                    const serverError = e.response?.data?.error || e.message;
                                                                    setWizardError('Erro ao salvar Instagram: ' + serverError + '. O Facebook já foi salvo.');
                                                                } finally {
                                                                    setWizardLoading(false);
                                                                }
                                                            }}
                                                            className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-black transition-all shadow-xl"
                                                        >
                                                            Ativar Inbox Unificada
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Instagram Form */}
                                        {platform.id === 'instagram' && !isInstagramWizard && (
                                            <div className="space-y-4">
                                                <div className="bg-gradient-to-r from-purple-500 to-pink-500 p-6 rounded-2xl text-white shadow-xl shadow-pink-500/30 text-center relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 -m-4 opacity-10 group-hover:scale-110 transition-transform">
                                                        <InstagramIcon size={120} />
                                                    </div>
                                                    <h4 className="text-xl font-black mb-2 relative z-10">Recomendado: Mágica Meta 🪄</h4>
                                                    <p className="text-sm text-pink-100 mb-6 relative z-10 font-medium">A forma mais fácil de conectar seu Instagram é através do Facebook. O sistema encontra e conecta sua conta automaticamente apenas com o seu Token!</p>
                                                    <button
                                                        onClick={() => {
                                                            setIsInstagramWizard(true);
                                                            setWizardStep(1);
                                                            // We do NOT change activeAddForm to 'facebook' anymore!
                                                            // activeAddForm remains 'instagram'
                                                        }}
                                                        className="w-full py-4 bg-white text-purple-600 rounded-xl font-black hover:scale-[1.02] active:scale-95 transition-all shadow-lg relative z-10 flex items-center justify-center gap-2 text-lg"
                                                    >
                                                        Conectar Instagram Automaticamente <div className="bg-blue-100 p-1.5 rounded-lg ml-2"><FacebookIcon size={16} className="text-blue-600" /></div>
                                                    </button>
                                                </div>

                                                <div className="flex items-center gap-4 py-4 opacity-50">
                                                    <div className="flex-1 h-[2px] bg-gray-200"></div>
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Ou via Conexão Manual</span>
                                                    <div className="flex-1 h-[2px] bg-gray-200"></div>
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">ID da Conta Instagam Business</label>
                                                    <input
                                                        type="text"
                                                        value={instagramAccountId}
                                                        onChange={(e) => setInstagramAccountId(e.target.value)}
                                                        placeholder="Ex: 178414..."
                                                        className="w-full px-4 py-3 rounded-xl border-2 border-pink-100 focus:ring-4 focus:ring-pink-500/10 focus:border-pink-500 outline-none transition-all font-mono text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">User Access Token (Gere no Graph Explorer)</label>
                                                    <input
                                                        type="password"
                                                        value={instagramToken}
                                                        onChange={(e) => setInstagramToken(e.target.value)}
                                                        placeholder="IGQV..."
                                                        className="w-full px-4 py-3 rounded-xl border-2 border-pink-100 focus:ring-4 focus:ring-pink-500/10 focus:border-pink-500 outline-none transition-all font-mono text-sm"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handleInstagramConnect}
                                                    className="w-full py-3 bg-white border-2 border-pink-200 hover:border-pink-400 text-pink-600 rounded-xl font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                                                >
                                                    Conectar Manualmente
                                                </button>
                                            </div>
                                        )}

                                        {/* Twitter Form */}
                                        {platform.id === 'twitter' && (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">API Key</label>
                                                        <input type="text" value={twitterApiKey} onChange={(e) => setTwitterApiKey(e.target.value)} title="Twitter API Key" className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">API Secret</label>
                                                        <input type="text" value={twitterApiSecret} onChange={(e) => setTwitterApiSecret(e.target.value)} title="Twitter API Secret" className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Access Token</label>
                                                        <input type="text" value={twitterAccessToken} onChange={(e) => setTwitterAccessToken(e.target.value)} title="Twitter Access Token" className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-bold text-gray-600 mb-1 uppercase">Token Secret</label>
                                                        <input type="text" value={twitterTokenSecret} onChange={(e) => setTwitterTokenSecret(e.target.value)} title="Twitter Token Secret" className="w-full px-3 py-2 rounded-lg border border-sky-200 text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={handleTwitterConnect}
                                                    className="w-full py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold transition-all shadow-lg mt-2"
                                                >
                                                    Conectar Twitter/X
                                                </button>
                                            </div>
                                        )}

                                        {/* Pinterest Form */}
                                        {platform.id === 'pinterest' && (
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-bold text-gray-700 mb-1">Access Token</label>
                                                    <input
                                                        type="text"
                                                        value={pinterestToken}
                                                        onChange={(e) => setPinterestToken(e.target.value)}
                                                        placeholder="pina_..."
                                                        className="w-full px-4 py-3 rounded-xl border border-red-200 focus:ring-2 focus:ring-red-500 outline-none"
                                                    />
                                                </div>
                                                <button
                                                    onClick={handlePinterestConnect}
                                                    className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all shadow-lg"
                                                >
                                                    Conectar Pinterest
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {
                                    platform.accounts.length === 0 && !activeAddForm ? (
                                        <div className="text-center py-12">
                                            <Icon className="mx-auto mb-3 text-gray-300" size={48} />
                                            <p className="text-gray-500 mb-4 font-medium">
                                                Nenhuma página conectada
                                            </p>
                                            <button
                                                onClick={() => setActiveAddForm(platform.id)}
                                                className={`px-6 py-2 ${style.bg} text-white rounded-lg ${style.hover} transition-all font-bold shadow-lg shadow-gray-200`}
                                            >
                                                Conectar {platform.name}
                                            </button>
                                        </div>
                                    ) : (
                                        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 ${activeAddForm === platform.id ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                                            {platform.accounts.map((account: Account) => (
                                                <div
                                                    key={account.id}
                                                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:shadow-md transition-all group"
                                                >
                                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                                        <div className={`w-2 h-2 rounded-full ${account.enabled !== false ? 'bg-green-500' : 'bg-gray-400'}`} />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-bold text-gray-900 truncate text-sm">
                                                                {account.name || account.username || 'Sem nome'}
                                                            </p>
                                                            <div className="flex items-center gap-2">
                                                                <p className="text-xs text-gray-400 truncate font-mono">
                                                                    {(account as any).account_id || account.id}
                                                                </p>
                                                                {(platform.id === 'facebook' || platform.id === 'instagram') && (
                                                                    <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${
                                                                        account.status === 'expired' 
                                                                            ? 'bg-red-100 text-red-600 border border-red-200' 
                                                                            : account.status === 'recovering'
                                                                                ? 'bg-amber-100 text-amber-600 border border-amber-200 animate-pulse'
                                                                                : 'bg-green-100 text-green-600 border border-green-200'
                                                                    }`}>
                                                                        {account.status === 'expired' ? (
                                                                            <>
                                                                                <AlertCircle size={8} /> SESSÃO EXPIRADA
                                                                            </>
                                                                        ) : account.status === 'recovering' ? (
                                                                            <>
                                                                                <RefreshCw size={8} className="animate-spin" /> RECUPERANDO
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <CheckCircle size={8} /> ONLINE
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {account.status === 'expired' && (
                                                                <p className="text-[9px] text-red-400 font-bold mt-1 max-w-[150px] truncate" title={account.last_error}>
                                                                    Erro: {account.last_error || 'Token Inválido'}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {account.status === 'expired' && (
                                                            <button
                                                                onClick={() => {
                                                                    setActiveAddForm(platform.id);
                                                                    if (platform.id === 'facebook') {
                                                                        setFacebookPageId(String((account as any).page_id || account.id));
                                                                        setIsMetaWizard(false);
                                                                    } else {
                                                                        setInstagramAccountId(String((account as any).account_id || account.id));
                                                                        setIsInstagramWizard(false);
                                                                    }
                                                                }}
                                                                className="px-2 py-1 bg-red-600 text-white text-[10px] font-black rounded-lg hover:bg-red-700 transition-all shadow-md shadow-red-100 uppercase"
                                                            >
                                                                Reconectar
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleToggleAccount(platform.id, account.id)}
                                                            className={`p-2 rounded-lg transition-all ${account.enabled !== false
                                                                ? 'text-green-600 hover:bg-green-50'
                                                                : 'text-gray-400 hover:bg-gray-100'
                                                                }`}
                                                            title={account.enabled !== false ? 'Desativar' : 'Ativar'}
                                                        >
                                                            {account.enabled !== false ? <Power size={16} /> : <PowerOff size={16} />}
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteAccount(platform.id, account.id)}
                                                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                            title="Remover conta"
                                                        >
                                                            <Trash2 size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )
                                }
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Configurações Globais e Ferramentas Adicionais */}
            <div className="mt-12 space-y-12">
                {/* Ponte de Vídeo Telegram (Opcional) */}
                <div className="bg-white/40 backdrop-blur-md rounded-[32px] border-2 border-white shadow-xl overflow-hidden">
                    <div className="p-8 space-y-8">
                        <div className="space-y-2">
                            <div className="flex items-center gap-3 mb-1">
                                <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                                    <RefreshCw size={18} />
                                </div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Ponte de Vídeo Telegram (Opcional)</h3>
                            </div>
                            <p className="text-sm text-gray-500 font-medium leading-relaxed">
                                Use seu próprio bot para fazer o "Bridge" de vídeos (Reels/Stories) para o Meta.
                            </p>
                        </div>

                        <div className="flex items-center gap-4 p-4 bg-white/60 rounded-2xl border border-white">
                            <div className="flex items-center gap-3">
                                <div 
                                    onClick={() => setBridgeEnabled(!bridgeEnabled)}
                                    className={`w-12 h-6 rounded-full cursor-pointer transition-colors flex items-center px-1 ${bridgeEnabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${bridgeEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                </div>
                                <span className="text-sm font-bold text-gray-700">Ativar Ponte Personalizada</span>
                            </div>
                            {!bridgeEnabled && (
                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest bg-blue-100 px-2 py-1 rounded-md">Usando Ponte Global do Sistema</span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Bot Token Personalizado</label>
                                <input 
                                    type="password" 
                                    value={bridgeBotToken} 
                                    onChange={(e) => setBridgeBotToken(e.target.value)}
                                    placeholder="Token do Bot para upload"
                                    className="w-full px-4 py-3 rounded-2xl border-2 border-white bg-white/50 focus:border-blue-500 focus:bg-white transition-all outline-none text-sm font-mono"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">ID do Canal/Chat de Ponte</label>
                                <input 
                                    type="text" 
                                    value={bridgeChatId} 
                                    onChange={(e) => setBridgeChatId(e.target.value)}
                                    placeholder="-100..."
                                    className="w-full px-4 py-3 rounded-2xl border-2 border-white bg-white/50 focus:border-blue-500 focus:bg-white transition-all outline-none text-sm font-mono"
                                />
                            </div>
                        </div>

                        <div className="bg-white/60 p-4 rounded-2xl border border-white/80">
                            <p className="text-[11px] text-gray-500 leading-relaxed italic">
                                <strong>Por que usar?</strong> O Meta exige links diretos de vídeo estáveis. O Bridge faz upload do seu vídeo para o Telegram temporariamente para gerar um link que o Meta aceita sem erros. Se você não configurar, usaremos o bot oficial do FluxoInteligente.
                            </p>
                        </div>

                        <button
                            onClick={handleSaveBridge}
                            disabled={savingBridge}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                        >
                            {savingBridge ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                            Salvar Configurações da Ponte
                        </button>
                    </div>
                </div>

                {/* Meta App Configuration Section */}
                <div className="mt-8 p-8 bg-gradient-to-br from-indigo-50 to-blue-50 rounded-[32px] border-2 border-white shadow-xl space-y-8 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                        <FacebookIcon size={140} />
                    </div>
                    
                    <div className="space-y-2 relative z-10">
                        <div className="flex items-center gap-3 mb-1">
                            <div className="w-8 h-8 bg-blue-600 text-white rounded-lg flex items-center justify-center">
                                <RefreshCw size={18} />
                            </div>
                            <h3 className="text-xl font-black text-gray-900 tracking-tight">Gerenciamento de App Meta</h3>
                        </div>
                        <p className="text-sm text-gray-600 font-medium leading-relaxed">
                            Configure as credenciais do seu App no Meta for Developers para habilitar a **troca automática de Tokens por tokens de 60 dias**.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative z-10">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">App ID (ID do Aplicativo)</label>
                            <input 
                                type="text" 
                                value={metaAppId} 
                                onChange={(e) => setMetaAppId(e.target.value)}
                                placeholder="Ex: 58291..."
                                className="w-full px-4 py-3 rounded-2xl border-2 border-white bg-white/50 focus:border-blue-500 focus:bg-white transition-all outline-none text-sm font-mono"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">App Secret (Chave Secreta)</label>
                            <input 
                                type="password" 
                                value={metaAppSecret} 
                                onChange={(e) => setMetaAppSecret(e.target.value)}
                                placeholder="••••••••"
                                className="w-full px-4 py-3 rounded-2xl border-2 border-white bg-white/50 focus:border-blue-500 focus:bg-white transition-all outline-none text-sm font-mono"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleSaveMetaConfig}
                        disabled={savingMeta}
                        className="w-full py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 relative z-10"
                    >
                        {savingMeta ? <RefreshCw size={20} className="animate-spin" /> : <CheckCircle size={20} />}
                        Salvar Credenciais do Aplicativo
                    </button>
                </div>
            </div>

            {/* Help Section */}
            {
                totalAccounts === 0 && (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-8 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <AlertCircle size={120} className="text-blue-600" />
                        </div>
                        <div className="relative z-10 flex items-start gap-5">
                            <div className="p-3 bg-blue-100 rounded-xl text-blue-600">
                                <AlertCircle size={28} />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-blue-900 mb-2">Como começar?</h3>
                                <p className="text-blue-800 text-lg mb-4 opacity-90">
                                    Você ainda não tem nenhuma conta conectada. Para começar a automatizar suas postagens:
                                </p>
                                <ol className="space-y-3">
                                    {[
                                        'Escolha uma plataforma acima (Telegram, WhatsApp, Facebook, etc.)',
                                        'Clique em "Adicionar" ou "Conectar"',
                                        'Siga as instruções para conectar sua conta',
                                        'Configure seus agendamentos e comece a automatizar!'
                                    ].map((step, i) => (
                                        <li key={i} className="flex items-center gap-3 text-blue-900 font-medium bg-white/50 p-3 rounded-lg border border-blue-200/50">
                                            <span className="flex-shrink-0 w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center text-xs font-bold">{i + 1}</span>
                                            {step}
                                        </li>
                                    ))}
                                </ol>
                            </div>
                        </div>
                    </div>
                )
            }
        </div>
    );
};

export default AutomationAccountsPage;
