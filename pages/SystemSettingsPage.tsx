import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Globe, Save, CheckCircle, AlertCircle, Clock, Bell, BellOff, Shield, Smartphone, MessageSquare, Instagram, Facebook, Youtube, Monitor } from 'lucide-react';

const SystemSettingsPage: React.FC = () => {
    const [timezone, setTimezone] = useState('America/Sao_Paulo');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [savingSystem, setSavingSystem] = useState(false);
    const [savingNotifs, setSavingNotifs] = useState(false);
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
    const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
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
            if (response.data.success && response.data.config.TIMEZONE) {
                setTimezone(response.data.config.TIMEZONE);
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadNotifSettings = async () => {
        try {
            const response = await api.get('/api/notifications/settings');
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
            setNotification({ message: 'Configurações de fuso horário salvas com sucesso!', type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        } catch (error) {
            setNotification({ message: 'Erro ao salvar configurações.', type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveNotifSettings = async () => {
        setSavingNotifs(true);
        try {
            await api.post('/api/notifications/settings', notifSettings);
            setNotification({ message: 'Preferências de notificação salvas!', type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        } catch (error) {
            setNotification({ message: 'Erro ao salvar preferências.', type: 'error' });
        } finally {
            setSavingNotifs(false);
        }
    };

    const handleSaveSystemSettings = async () => {
        setSavingSystem(true);
        try {
            for (const [key, value] of Object.entries(systemSettings)) {
                await api.post('/admin/system-settings', { key, value });
            }
            setNotification({ message: 'Configurações do sistema salvas com sucesso!', type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        } catch (error) {
            setNotification({ message: 'Erro ao salvar configurações do sistema.', type: 'error' });
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

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20">
            {/* Feedback Notification */}
            {notification && (
                <div className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border animate-in fade-in slide-in-from-top-4 duration-300 ${
                    notification.type === 'success' 
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}>
                    {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    <span className="font-medium">{notification.message}</span>
                </div>
            )}

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
