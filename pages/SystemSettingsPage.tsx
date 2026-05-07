import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Globe, Save, CheckCircle, AlertCircle, Clock } from 'lucide-react';

const SystemSettingsPage: React.FC = () => {
    const [timezone, setTimezone] = useState('America/Sao_Paulo');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [notification, setNotification] = useState<{ message: string, type: 'success' | 'error' } | null>(null);

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
    }, []);

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

    return (
        <div className="max-w-4xl mx-auto space-y-6">
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
                            <p className="text-[11px] text-gray-400 leading-relaxed italic">
                                * Seus posts serão disparados seguindo o relógio oficial da região selecionada acima.
                            </p>
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
                                        Certifique-se de que seus horários na aba "Agendamentos" fazem sentido para a nova região.
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
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:scale-[1.02] hover:shadow-purple-300/50 active:scale-[0.98]'
                            }`}
                        >
                            {saving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <Save size={18} />
                                    Salvar Configurações
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Exemplo de Horário Atual na Região */}
            <div className="bg-gray-900 rounded-2xl p-6 text-white flex items-center justify-between shadow-xl">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center border border-white/10">
                        <Clock size={24} className="text-purple-400" />
                    </div>
                    <div>
                        <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Hora Local Estimada</p>
                        <h3 className="text-2xl font-mono font-bold tracking-tighter">
                            {new Date().toLocaleTimeString('pt-BR', { timeZone: timezone })}
                        </h3>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Status do Relógio</p>
                    <div className="flex items-center gap-2 justify-end">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="text-xs font-bold text-emerald-500 uppercase">Sincronizado</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SystemSettingsPage;
