import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bot, Save, Plus, Trash2, Edit2, MessageSquare, MessagesSquare, Check, HelpCircle, X, ExternalLink, Info } from 'lucide-react';

// ... (previous interfaces remain the same)
interface Automation {
    id?: number;
    account_id: string;
    platform: 'page' | 'instagram';
    keyword: string;
    reply_type: 'fixed' | 'ai';
    reply_text: string;
    send_dm: boolean;
    dm_text: string;
    is_active: boolean;
    trigger_count?: number;
}

interface Account {
    id: string;
    name: string;
    access_token: string;
    category?: string;
    platform: 'page' | 'instagram';
    profile_picture_url?: string;
}

export default function CommentAutomationPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
    const [automations, setAutomations] = useState<Automation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // ... (rest of the states and handlers)
    // Form state for current editing/new automation
    const [currentCode, setCurrentCode] = useState<number | undefined>(undefined);
    const [keyword, setKeyword] = useState('');
    const [replyType, setReplyType] = useState<'fixed' | 'ai'>('fixed');
    const [replyText, setReplyText] = useState('');
    const [sendDm, setSendDm] = useState(false);
    const [dmText, setDmText] = useState('');
    const [isActive, setIsActive] = useState(true);

    const [isEditing, setIsEditing] = useState(false);
    const [showForm, setShowForm] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            // First fetch Accounts
            const fbRes = await axios.get('/api/facebook/pages');
            const pages = (fbRes.data.data?.pages || fbRes.data?.pages || []).map((p: any) => ({ ...p, platform: 'page' }));

            const igRes = await axios.get('/api/instagram/accounts');
            const accountsIg = (igRes.data.data?.accounts || igRes.data?.accounts || []).map((p: any) => ({
                id: p.account_id,
                name: p.name,
                access_token: p.access_token,
                platform: 'instagram'
            }));

            setAccounts([...pages, ...accountsIg]);

            // Then fetch automations
            const req = await axios.get('/api/comment-automations');
            if (req.data.success) {
                setAutomations(req.data.automations);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.error || 'Erro ao carregar dados');
        } finally {
            setLoading(false);
        }
    };

    const showMessage = (msg: string, isError = false) => {
        if (isError) {
            setError(msg);
            setTimeout(() => setError(null), 5000);
        } else {
            setSuccessMessage(msg);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleSelectAccount = (acc: Account) => {
        setSelectedAccount(acc);
        setShowForm(false);
    };

    const handleNewAutomation = () => {
        setCurrentCode(undefined);
        setKeyword('');
        setReplyType('fixed');
        setReplyText('');
        setSendDm(false);
        setDmText('');
        setIsActive(true);
        setIsEditing(true);
        setShowForm(true);
    };

    const handleEditAutomation = (auto: Automation) => {
        setCurrentCode(auto.id);
        setKeyword(auto.keyword);
        setReplyType(auto.reply_type);
        setReplyText(auto.reply_text || '');
        setSendDm(auto.send_dm);
        setDmText(auto.dm_text || '');
        setIsActive(auto.is_active);
        setIsEditing(true);
        setShowForm(true);
    };

    const handleCancelEdit = () => {
        setIsEditing(false);
        setShowForm(false);
    };

    const handleSave = async () => {
        if (!selectedAccount) return;
        if (!keyword.trim() || !replyText.trim()) {
            showMessage('Palavra-chave e Resposta são obrigatórios.', true);
            return;
        }

        setIsSaving(true);
        try {
            const payload: Automation = {
                id: currentCode,
                account_id: selectedAccount.id,
                platform: selectedAccount.platform,
                keyword,
                reply_type: replyType,
                reply_text: replyText,
                send_dm: sendDm,
                dm_text: dmText,
                is_active: isActive
            };

            const res = await axios.post('/api/comment-automations', payload);
            if (res.data.success) {
                showMessage('Automação salva com sucesso!');
                setShowForm(false);
                fetchData(); // reload
            } else {
                showMessage(res.data.error || 'Erro ao salvar automação', true);
            }
        } catch (err: any) {
            console.error(err);
            showMessage(err.response?.data?.error || 'Erro ao salvar automação', true);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Tem certeza que deseja apagar esta automação?')) return;
        try {
            const res = await axios.delete(`/api/comment-automations/${id}`);
            if (res.data.success) {
                showMessage('Automação removida.');
                fetchData();
            }
        } catch (err: any) {
            showMessage('Erro ao deletar', true);
        }
    };

    const accountAutomations = automations.filter(a => selectedAccount && a.account_id === selectedAccount.id && a.platform === selectedAccount.platform);

    return (
        <div className="max-w-7xl mx-auto space-y-6 relative">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <MessageSquare className="w-8 h-8 text-blue-600" />
                        Automação de Comentários
                    </h1>
                    <p className="text-gray-500 mt-2 text-lg">
                        Crie robôs que respondem automaticamente quando alguém comenta em seus posts.
                    </p>
                </div>
                <button
                    onClick={() => setShowHelp(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-xl font-bold border border-blue-100 hover:bg-blue-100 transition-all self-start"
                >
                    <HelpCircle size={20} />
                    Como Configurar?
                </button>
            </div>

            {/* Modal de Tutorial */}
            {showHelp && (
                <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scale-up">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
                            <div className="flex items-center gap-3">
                                <HelpCircle size={24} />
                                <h2 className="text-xl font-bold">Guia de Configuração</h2>
                            </div>
                            <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-white/20 rounded-lg transition-colors">
                                <X size={24} />
                            </button>
                        </div>
                        <div className="p-8 overflow-y-auto space-y-8">
                            <section className="space-y-4">
                                <div className="flex items-center gap-3 text-blue-600 font-bold text-lg">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">1</div>
                                    <h3>Configuração no Meta Developers</h3>
                                </div>
                                <div className="pl-11 space-y-3">
                                    <p className="text-gray-600">Acesse o <a href="https://developers.facebook.com/apps/" target="_blank" className="text-blue-600 underline font-semibold flex inline-flex items-center gap-1">Painel do Meta <ExternalLink size={14} /></a> e selecione seu App.</p>
                                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3 text-amber-800 text-sm">
                                        <Info className="flex-shrink-0" size={20} />
                                        <p>No menu <strong>Webhooks</strong>, mude o seletor (dropdown) de <strong>"User"</strong> para <strong>"Page"</strong>. Isso é obrigatório!</p>
                                    </div>
                                    <div className="bg-gray-50 p-4 rounded-xl space-y-2 font-mono text-sm border border-gray-100">
                                        <p><strong>URL de Retorno:</strong> {window.location.origin}/api/webhook</p>
                                        <p><strong>Token de Verificação:</strong> meliflow_secret_2026</p>
                                    </div>
                                </div>
                            </section>

                            <section className="space-y-4">
                                <div className="flex items-center gap-3 text-blue-600 font-bold text-lg">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">2</div>
                                    <h3>Ative a Assinatura (Fields)</h3>
                                </div>
                                <p className="pl-11 text-gray-600 leading-relaxed">
                                    Após salvar a URL, clique em <strong>"Inscrever-se" (Subscribe)</strong> nos campos:
                                    <br />• <strong>feed</strong> (para Facebook)
                                    <br />• <strong>comments</strong> (para Instagram)
                                </p>
                            </section>

                            <section className="space-y-4">
                                <div className="flex items-center gap-3 text-blue-600 font-bold text-lg">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm">3</div>
                                    <h3>Acesso Avançado</h3>
                                </div>
                                <p className="pl-11 text-gray-600 leading-relaxed">
                                    Em <strong>Revisão do App</strong> &gt; <strong>Permissões</strong>, certifique-se que <code>pages_messaging</code> e <code>pages_read_engagement</code> estão como <strong>Acesso Avançado</strong>.
                                </p>
                            </section>
                        </div>
                        <div className="p-6 bg-gray-50 border-t border-gray-100 text-center">
                            <button
                                onClick={() => setShowHelp(false)}
                                className="px-8 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-all shadow-md"
                            >
                                Entendi, vou configurar!
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">
                    {error}
                </div>
            )}
            {successMessage && (
                <div className="p-4 bg-green-50 text-green-700 rounded-xl border border-green-200 flex items-center gap-2">
                    <Check size={18} />
                    {successMessage}
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Sidebar Accounts */}
                <div className="w-full lg:w-80 flex-shrink-0">
                    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm sticky top-6">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">Suas Contas</h2>

                        {loading && accounts.length === 0 ? (
                            <div className="text-center py-6 text-gray-400">Carregando...</div>
                        ) : accounts.length === 0 ? (
                            <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-xl text-sm border border-gray-100 p-4">
                                Nenhuma página do Facebook ou Instagram conectada.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {accounts.map(account => (
                                    <button
                                        key={`${account.platform}-${account.id}`}
                                        onClick={() => handleSelectAccount(account)}
                                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${selectedAccount?.id === account.id ? 'bg-blue-50 border-blue-200 border' : 'hover:bg-gray-50 border border-transparent'} group`}
                                    >
                                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-inner flex-shrink-0 ${account.platform === 'instagram' ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500' : 'bg-blue-600'}`}>
                                            {account.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`font-bold truncate ${selectedAccount?.id === account.id ? 'text-blue-900' : 'text-gray-700'}`}>
                                                {account.name}
                                            </h3>
                                            <p className="text-xs text-gray-500 capitalize">{account.platform}</p>
                                        </div>
                                        {/* Badge count running rules */}
                                        {automations.filter(a => a.account_id === account.id && a.platform === account.platform).length > 0 && (
                                            <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-600">
                                                {automations.filter(a => a.account_id === account.id && a.platform === account.platform).length}
                                            </div>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="flex-1">
                    {!selectedAccount ? (
                        <div className="bg-white rounded-2xl border border-gray-100 p-12 shadow-sm text-center">
                            <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Selecione uma conta</h3>
                            <p className="text-gray-500">Escolha uma página do Facebook ou conta do Instagram ao lado para configurar seus robôs de comentários.</p>
                        </div>
                    ) : showForm ? (
                        // FORM
                        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-140px)] animate-fade-in-up">
                            <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                                        {selectedAccount.platform === 'instagram' ? <span className="w-2 h-2 rounded-full bg-pink-500"></span> : <span className="w-2 h-2 rounded-full bg-blue-500"></span>}
                                        {currentCode ? 'Editar Automação' : 'Criar Nova Automação'}
                                    </h2>
                                    <p className="text-sm text-gray-500 mt-1">Configurando regras para: {selectedAccount.name}</p>
                                </div>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full transition-colors cursor-pointer ${isActive ? 'bg-blue-600' : 'bg-gray-200'}`} onClick={() => setIsActive(!isActive)}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform pointer-events-none flex items-center justify-center ${isActive ? 'transform translate-x-6' : ''}`}>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto flex-1 bg-white space-y-6">
                                {/* Keyword */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Palavra-Chave Gatilho</label>
                                    <p className="text-xs text-gray-500 mb-3">O comentário do cliente precisará conter esta palavra exata (ex: "EU QUERO", "LINK").</p>
                                    <input
                                        type="text"
                                        value={keyword}
                                        onChange={e => setKeyword(e.target.value)}
                                        placeholder="Ex: EU QUERO"
                                        className="w-full p-4 rounded-xl border-2 border-gray-200 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-gray-700 transition-all font-bold text-lg"
                                    />
                                </div>

                                {/* Tipo de Resposta */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">Comportamento da Resposta no Comentário</label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <button
                                            onClick={() => setReplyType('fixed')}
                                            className={`p-4 rounded-xl border-2 text-left transition-all ${replyType === 'fixed' ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}
                                        >
                                            <div className="font-bold text-gray-900 mb-1">Resposta Fixa</div>
                                            <div className="text-xs text-gray-500">Você digita o texto exato que quer o robô responda.</div>
                                        </button>
                                        <button
                                            onClick={() => setReplyType('ai')}
                                            className={`p-4 rounded-xl border-2 text-left transition-all ${replyType === 'ai' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-purple-300'}`}
                                        >
                                            <div className="font-bold text-gray-900 mb-1 flex items-center gap-2">
                                                Inteligência Artificial (Gemini) <span className="bg-purple-600 text-white text-[9px] px-1.5 py-0.5 rounded uppercase font-black">Pro</span>
                                            </div>
                                            <div className="text-xs text-gray-500">Você digita as instruções e a IA cria respostas sempre diferentes.</div>
                                        </button>
                                    </div>
                                </div>

                                {/* Texto Resposta */}
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-2">
                                        {replyType === 'fixed' ? 'Texto da Resposta no Comentário' : 'Prompt da IA (Instruções para o Gemini)'}
                                    </label>
                                    <textarea
                                        value={replyText}
                                        onChange={e => setReplyText(e.target.value)}
                                        rows={4}
                                        placeholder={replyType === 'fixed' ? "Te chamei no direct! 🚀" : "Responda de forma curta avisando que você já chamou ele no direct..."}
                                        className="w-full p-4 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 text-gray-700 transition-all resize-none"
                                    />
                                </div>

                                {/* Direct Message Toggle */}
                                <div className="pt-6 border-t border-gray-100">
                                    <label className="flex items-center gap-4 cursor-pointer mb-4">
                                        <div className="relative">
                                            <input type="checkbox" className="sr-only" checked={sendDm} onChange={(e) => setSendDm(e.target.checked)} />
                                            <div className={`block w-14 h-8 rounded-full transition-colors ${sendDm ? 'bg-green-500' : 'bg-gray-200'}`}></div>
                                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform flex items-center justify-center ${sendDm ? 'transform translate-x-6' : ''}`}>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="font-bold text-gray-900 text-base flex items-center gap-2">
                                                Enviar Mensagem por Inbox (DM)
                                            </div>
                                            <p className="text-sm text-gray-500">Mandar o link ou uma mensagem privada automaticamente junto com a resposta acima.</p>
                                        </div>
                                    </label>

                                    {sendDm && (
                                        <div className="pl-18 animate-fade-in-up mt-4">
                                            <label className="block text-sm font-bold text-gray-700 mb-2">
                                                {replyType === 'fixed' ? 'Texto da Mensagem Privada (Inbox/DM)' : 'Prompt da IA para o Direct (Instruções)'}
                                            </label>
                                            <textarea
                                                value={dmText}
                                                onChange={e => setDmText(e.target.value)}
                                                rows={4}
                                                placeholder={replyType === 'fixed' ? "Olá, vi que você pediu o link: https://meusite.com" : "Responda como vendedor dando oi e mandando este link https://meusite.com"}
                                                className="w-full p-4 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-green-500 text-gray-700 transition-all resize-none"
                                            />
                                        </div>
                                    )}
                                </div>

                            </div>

                            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 shrink-0">
                                <button
                                    onClick={handleCancelEdit}
                                    className="px-6 py-3 font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isSaving}
                                    className="px-6 py-3 font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <Save size={18} />
                                    {isSaving ? 'Salvando...' : 'Salvar Automação'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        // LIST 
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900">{selectedAccount.name}</h2>
                                    <p className="text-sm text-gray-500">Gerenciando Automações ({accountAutomations.length})</p>
                                </div>
                                <button
                                    onClick={handleNewAutomation}
                                    className="bg-gray-900 hover:bg-gray-800 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-sm"
                                >
                                    <Plus size={18} />
                                    Nova Automação
                                </button>
                            </div>

                            {accountAutomations.length === 0 ? (
                                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl">
                                    <MessagesSquare className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">Nenhuma automação ativa</h3>
                                    <p className="text-gray-500 mb-6 max-w-sm mx-auto">Esta conta ainda não possui nenhuma regra para responder comentários automaticamente.</p>
                                    <button
                                        onClick={handleNewAutomation}
                                        className="bg-blue-50 text-blue-700 px-6 py-2 rounded-xl font-bold flex items-center gap-2 mx-auto hover:bg-blue-100 transition-colors"
                                    >
                                        <Plus size={16} />
                                        Criar a primeira
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                                    {accountAutomations.map(auto => (
                                        <div key={auto.id} className={`p-5 rounded-2xl border-2 transition-all group ${auto.is_active ? 'border-gray-200 hover:border-blue-300' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="bg-gray-900 text-white font-black text-xs px-2 py-1 rounded-md uppercase tracking-wide">
                                                        {auto.keyword}
                                                    </span>
                                                    {!auto.is_active && <span className="text-[10px] font-bold text-red-500 uppercase">Pausado</span>}
                                                </div>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleEditAutomation(auto)} className="p-2 text-gray-400 hover:text-blue-600 bg-white rounded-lg border border-gray-100 shadow-sm transition-colors">
                                                        <Edit2 size={14} />
                                                    </button>
                                                    <button onClick={() => handleDelete(auto.id!)} className="p-2 text-gray-400 hover:text-red-600 bg-white rounded-lg border border-gray-100 shadow-sm transition-colors">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-sm text-gray-600 line-clamp-2 mb-3">
                                                <strong className="text-gray-900 text-xs uppercase tracking-wide">Respondendo:</strong> {auto.reply_text}
                                            </p>
                                            <div className="flex gap-2">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${auto.reply_type === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                                    {auto.reply_type === 'ai' ? 'AI Responde' : 'Texto Fixo'}
                                                </span>
                                                {auto.send_dm && (
                                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                                        + Manda Direct
                                                    </span>
                                                )}
                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 flex items-center gap-1">
                                                    Detector: {auto.trigger_count || 0} vezes
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
