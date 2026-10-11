import React, { useEffect, useState } from 'react';
import {
    Plus,
    X,
    Trash2,
    RefreshCw,
    CheckCircle,
    AlertCircle,
    ShieldCheck,
    ExternalLink,
    Flame,
    MonitorSmartphone,
    ChevronDown,
} from 'lucide-react';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

/**
 * Automação do Kwai.
 *
 * O Kwai NÃO possui API pública de upload para terceiros. A publicação é feita
 * por automação de navegador (Puppeteer) no Kwai Studio (studio.kwai.com).
 *
 * Importante: os cookies do site (www.kwai.com) NÃO autenticam o Studio — são
 * sessões separadas. Por isso o fluxo principal aqui é abrir um Chrome de
 * verdade para você entrar na conta UMA vez; a sessão fica salva e é reutilizada
 * nas próximas postagens. Só aceita VÍDEO (sem imagem/carrossel).
 */

interface KwaiAccount {
    id: string | number;
    username?: string;
    channel_name?: string;
    avatar_url?: string;
    added_at?: string;
}

const KwaiAutomationPage: React.FC = () => {
    const { showAlert, showConfirm } = useAlert();

    const [accounts, setAccounts] = useState<KwaiAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);

    const [username, setUsername] = useState('');
    const [cookies, setCookies] = useState('');
    const [saving, setSaving] = useState(false);
    const [verifyingId, setVerifyingId] = useState<string | number | null>(null);
    const [loggingInId, setLoggingInId] = useState<string | number | null>(null);

    const loadAccounts = async () => {
        try {
            const res = await api.get('/kwai/accounts');
            if (res.data.success) {
                setAccounts(res.data.accounts || []);
            }
        } catch (err) {
            console.error('[KWAI] load accounts error:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadAccounts();
    }, []);

    const startLogin = async (accountId: string | number, silent = false) => {
        setLoggingInId(accountId);
        try {
            const res = await api.post(`/kwai/accounts/${accountId}/login`);
            if (res.data.success) {
                showAlert('🖥️ Janela do Chrome aberta. Entre na conta do Kwai — a sessão será salva sozinha.', 'info');
            } else {
                showAlert('❌ ' + (res.data.error || 'Não foi possível abrir o login.'), 'error');
            }
        } catch (err: any) {
            showAlert('❌ ' + (err.response?.data?.error || err.message), 'error');
        } finally {
            setLoggingInId(null);
        }
    };

    const handleConnect = async () => {
        if (!username.trim()) {
            showAlert('Digite o usuário da conta do Kwai.', 'error');
            return;
        }

        setSaving(true);
        try {
            const cleanUsername = username.trim().replace(/^@/, '');
            const res = await api.post('/kwai/accounts', {
                username: cleanUsername,
                cookies: cookies.trim() || undefined,
            });

            if (res.data.success) {
                showAlert('✅ Conta registrada!', 'success');
                setUsername('');
                setCookies('');
                setIsAdding(false);
                await loadAccounts();
                // Sem cookies = depende do login no navegador → abre automaticamente.
                if (res.data.needsLogin && res.data.accountId) {
                    await startLogin(res.data.accountId);
                }
            } else {
                showAlert('❌ ' + (res.data.error || 'Erro ao registrar.'), 'error');
            }
        } catch (err: any) {
            showAlert('❌ ' + (err.response?.data?.error || err.message), 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleRemove = (acc: KwaiAccount) => {
        const name = acc.username || acc.channel_name || `#${acc.id}`;
        showConfirm({
            title: 'Remover conta do Kwai',
            message: `Remover a conta @${name}?`,
            confirmText: 'Remover',
            onConfirm: async () => {
                try {
                    await api.delete(`/kwai/accounts/${acc.id}`);
                    setAccounts(prev => prev.filter(a => a.id !== acc.id));
                    showAlert('✅ Conta removida.', 'success');
                } catch (err: any) {
                    showAlert('❌ ' + (err.response?.data?.error || err.message), 'error');
                }
            },
        });
    };

    const handleVerify = async (acc: KwaiAccount) => {
        setVerifyingId(acc.id);
        try {
            const res = await api.post(`/kwai/accounts/${acc.id}/verify`);
            if (res.data.valid) {
                showAlert(`✅ Sessão da conta @${acc.username || acc.id} está válida.`, 'success');
            } else {
                showAlert(`⚠️ Sessão inválida/expirada: ${res.data.error || 'faça login no navegador.'}`, 'error');
            }
        } catch (err: any) {
            showAlert('❌ ' + (err.response?.data?.error || err.message), 'error');
        } finally {
            setVerifyingId(null);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-20 px-4 sm:px-0 animate-fade-in">
            {/* Hero */}
            <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-amber-400 rounded-[28px] p-8 sm:p-10 text-white shadow-2xl">
                <div className="relative z-10">
                    <h2 className="text-3xl sm:text-4xl font-black mb-2 flex items-center gap-3">
                        <Flame className="w-9 h-9" /> Automação Kwai
                    </h2>
                    <p className="text-orange-50 text-sm max-w-2xl">
                        Conecte suas contas do Kwai para o Downloader publicar vídeos automaticamente.
                    </p>
                </div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20" />
            </div>

            {/* Aviso importante */}
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 items-start">
                <AlertCircle className="text-amber-500 shrink-0 mt-0.5" size={18} />
                <div className="text-[13px] text-amber-900 leading-relaxed space-y-1">
                    <p><strong>O Kwai não tem API pública de publicação.</strong> O envio é feito por automação de navegador (Puppeteer) no Kwai Studio.</p>
                    <p>Os cookies do site <span className="font-mono">www.kwai.com</span> <strong>não servem</strong> — o Studio tem sessão própria. Clique em <strong>Fazer login no navegador</strong>: abre um Chrome para você entrar <strong>uma vez</strong> e a sessão fica salva.</p>
                    <p>O Kwai aceita <strong>apenas vídeo</strong>.</p>
                </div>
            </div>

            {/* Adicionar / lista */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="flex items-center justify-between p-5 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                        <h3 className="font-black text-gray-800 text-lg">Contas conectadas</h3>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200">
                            {accounts.length}
                        </span>
                    </div>
                    <button
                        onClick={() => setIsAdding(!isAdding)}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide bg-orange-500 hover:bg-orange-600 text-white transition-all shadow-md"
                    >
                        {isAdding ? <X size={14} /> : <Plus size={14} />}
                        {isAdding ? 'Fechar' : 'Adicionar conta'}
                    </button>
                </div>

                {isAdding && (
                    <div className="p-5 bg-orange-50/40 border-b border-orange-100 space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-1">Usuário do Kwai</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="ex: achadinhos_macrame"
                                className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white"
                            />
                            <p className="text-[11px] text-gray-500 mt-1">
                                Serve para você identificar a conta. Não precisa ser o login exato.
                            </p>
                        </div>

                        <button
                            onClick={handleConnect}
                            disabled={saving}
                            className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:bg-orange-300 text-white rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2"
                        >
                            {saving ? <RefreshCw className="animate-spin" size={16} /> : <MonitorSmartphone size={16} />}
                            {saving ? 'Abrindo...' : 'Criar conta e abrir login'}
                        </button>

                        <button
                            type="button"
                            onClick={() => setShowAdvanced(v => !v)}
                            className="flex items-center gap-1 text-[12px] font-bold text-gray-500 hover:text-gray-700"
                        >
                            <ChevronDown size={14} className={showAdvanced ? 'rotate-180 transition-transform' : 'transition-transform'} />
                            Avançado: usar cookies do studio.kwai.com
                        </button>

                        {showAdvanced && (
                            <div>
                                <textarea
                                    value={cookies}
                                    onChange={(e) => setCookies(e.target.value)}
                                    placeholder='[{"name":"...","value":"...","domain":".kwai.com"}]'
                                    rows={5}
                                    className="w-full px-4 py-3 rounded-xl border border-orange-200 focus:ring-2 focus:ring-orange-500 outline-none font-mono text-xs resize-none bg-white"
                                />
                                <p className="text-[11px] text-gray-500 mt-1">
                                    Só use se você exportou os cookies <strong>do domínio studio.kwai.com</strong> (útil em servidor sem tela).
                                </p>
                            </div>
                        )}
                    </div>
                )}

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
                            <RefreshCw className="animate-spin" size={18} /> Carregando contas...
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                            <ShieldCheck className="mx-auto mb-3 opacity-40" size={36} />
                            <p className="text-sm font-bold">Nenhuma conta do Kwai conectada</p>
                            <p className="text-xs mt-1">Clique em "Adicionar conta" para começar.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {accounts.map((acc) => {
                                const name = acc.username || acc.channel_name || `#${acc.id}`;
                                return (
                                    <div
                                        key={acc.id}
                                        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white rounded-2xl border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all"
                                    >
                                        <div className="flex items-center gap-3.5 min-w-0">
                                            <div className="w-11 h-11 rounded-2xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 font-black text-sm shrink-0">
                                                {name.substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-black text-gray-900 truncate text-sm">@{name.replace(/^@/, '')}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded-md">
                                                        <CheckCircle size={9} /> REGISTRADA
                                                    </span>
                                                    <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1 rounded">ID: {acc.id}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <button
                                                onClick={() => startLogin(acc.id)}
                                                disabled={loggingInId === acc.id}
                                                title="Abrir o Chrome para entrar no Kwai Studio"
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold bg-orange-500 hover:bg-orange-600 text-white transition-all disabled:opacity-50 shadow-sm"
                                            >
                                                {loggingInId === acc.id ? <RefreshCw className="animate-spin" size={13} /> : <MonitorSmartphone size={13} />}
                                                Fazer login no navegador
                                            </button>
                                            <button
                                                onClick={() => handleVerify(acc)}
                                                disabled={verifyingId === acc.id}
                                                title="Verificar se a sessão ainda está válida"
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold bg-gray-100 hover:bg-gray-200 text-gray-700 transition-all disabled:opacity-50"
                                            >
                                                {verifyingId === acc.id ? <RefreshCw className="animate-spin" size={13} /> : <ShieldCheck size={13} />}
                                                Verificar
                                            </button>
                                            <button
                                                onClick={() => handleRemove(acc)}
                                                title="Remover conta"
                                                className="p-2 rounded-lg text-red-500 hover:bg-red-50 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Ajuda */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <h4 className="font-black text-gray-800 mb-3 text-sm uppercase tracking-wide">Como a publicação funciona</h4>
                <ol className="space-y-2 text-[13px] text-gray-600 list-decimal list-inside">
                    <li>Adicione a conta e clique em <strong>Fazer login no navegador</strong>.</li>
                    <li>Entre na conta do Kwai na janela que abrir (e-mail/telefone/QR). A sessão é salva sozinha.</li>
                    <li>No <strong>Downloader</strong>, baixe um vídeo (YouTube, TikTok, Instagram...).</li>
                    <li>Selecione a conta do Kwai como destino e publique — ou agende pela fila.</li>
                </ol>
                <a
                    href="https://studio.kwai.com/upload/publish"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 mt-4 text-xs font-bold text-orange-600 hover:text-orange-700"
                >
                    Abrir Kwai Studio <ExternalLink size={12} />
                </a>
            </div>
        </div>
    );
};

export default KwaiAutomationPage;
