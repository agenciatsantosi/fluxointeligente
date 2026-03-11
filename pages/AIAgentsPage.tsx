import React, { useState, useEffect } from 'react';
import { Bot, Facebook, Instagram, Save, Zap, Power, PowerOff, ShieldAlert, Cpu } from 'lucide-react';
import api from '../services/api';

interface Account {
    id: string;
    name: string;
    platform: 'facebook' | 'instagram';
    avatar?: string;
}

interface Agent {
    id?: number;
    account_id: string;
    platform: string;
    is_active: boolean;
    prompt: string;
    model: string;
    activation_keyword: string;
    handoff_active: boolean;
}

const AIAgentsPage: React.FC = () => {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [activeAccount, setActiveAccount] = useState<Account | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Editor State
    const [prompt, setPrompt] = useState('Você é um assistente prestativo. Seja breve e cordial na resposta.');
    const [keyword, setKeyword] = useState('');
    const [isActive, setIsActive] = useState(false);
    const [handoff, setHandoff] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [fbRes, igRes, agentsRes] = await Promise.all([
                api.get('/facebook/pages').catch(e => { console.error('FB error', e); return { data: { pages: [] } }; }),
                api.get('/instagram/accounts').catch(e => { console.error('IG error', e); return { data: { accounts: [] } }; }),
                api.get('/agents').catch(e => { console.error('Agents get error', e); return { data: { success: true, agents: [] } }; })
            ]);

            const loadedAccounts: Account[] = [];

            if (fbRes.data?.data?.pages || fbRes.data?.pages) {
                const pages = fbRes.data?.data?.pages || fbRes.data?.pages;
                pages.forEach((p: any) => {
                    loadedAccounts.push({ id: p.id, name: p.name, platform: 'facebook', avatar: p.picture?.data?.url });
                });
            }
            if (igRes.data?.data?.accounts || igRes.data?.accounts) {
                const accountsArray = igRes.data?.data?.accounts || igRes.data?.accounts;
                accountsArray.forEach((a: any) => {
                    loadedAccounts.push({ id: a.account_id, name: a.username || a.name, platform: 'instagram', avatar: a.profile_picture_url });
                });
            }

            setAccounts(loadedAccounts);
            if (agentsRes.data?.success) {
                setAgents(agentsRes.data.agents);
            }

            if (loadedAccounts.length > 0) {
                selectAccount(loadedAccounts[0], agentsRes.data?.agents || []);
            }
        } catch (error) {
            console.error('Error loading AI agents data:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectAccount = (acc: Account, currentAgents: Agent[] = agents) => {
        setActiveAccount(acc);
        const agent = currentAgents.find(a => a.account_id === acc.id && a.platform === acc.platform);
        if (agent) {
            setPrompt(agent.prompt || 'Você é um assistente prestativo. Seja breve e cordial na resposta.');
            setKeyword(agent.activation_keyword || '');
            setIsActive(agent.is_active || false);
            setHandoff(agent.handoff_active || false);
        } else {
            setPrompt('Você é um assistente prestativo e vendedor da nossa loja. Responda as dúvidas com simpatia e ofereça nossos produtos. Seja breve (no máximo 2 parágrafos).');
            setKeyword('');
            setIsActive(false);
            setHandoff(false);
        }
    };

    const handleSaveAgent = async () => {
        if (!activeAccount) return;
        setSaving(true);
        try {
            const payload = {
                account_id: activeAccount.id,
                platform: activeAccount.platform,
                prompt: prompt,
                activation_keyword: keyword,
                is_active: isActive,
                model: 'gemini-1.5-flash'
            };

            const res = await api.post('/agents', payload);
            if (res.data.success) {
                const updatedAgent = res.data.agent;
                setAgents(prev => {
                    const filtered = prev.filter(a => !(a.account_id === updatedAgent.account_id && a.platform === updatedAgent.platform));
                    return [...filtered, updatedAgent];
                });

                // If it was just saved, handoff is automatically reset to false in the backend
                setHandoff(false);

                alert('Agente salvo com sucesso!');
            }
        } catch (error) {
            console.error('Error saving agent:', error);
            alert('Erro ao salvar agente.');
        } finally {
            setSaving(false);
        }
    };

    const handleResumeBot = async () => {
        if (!activeAccount) return;
        setSaving(true);
        try {
            const payload = {
                account_id: activeAccount.id,
                platform: activeAccount.platform,
                status: false // Turn off handoff -> Resume AI
            };
            const res = await api.post('/agents/handoff', payload);
            if (res.data.success) {
                setHandoff(false);
                setAgents(prev => prev.map(a =>
                    (a.account_id === activeAccount.id && a.platform === activeAccount.platform)
                        ? { ...a, handoff_active: false }
                        : a
                ));
            }
        } catch (error) {
            console.error('Error resuming bot:', error);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return <div className="p-8 text-center text-gray-500 font-bold flex justify-center items-center h-full"><Zap className="animate-pulse mr-2 text-purple-600" /> Carregando Agentes de IA...</div>;
    }

    return (
        <div className="p-8 max-w-7xl mx-auto flex h-[calc(100vh-80px)]">

            {/* Sidebar */}
            <div className="w-1/3 pr-8 flex flex-col h-full border-r border-gray-100">
                <div className="mb-6">
                    <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tighter">
                        <div className="p-3 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl shadow-lg shadow-purple-500/30">
                            <Cpu size={24} className="text-white" />
                        </div>
                        Agentes de IA
                    </h1>
                    <p className="text-gray-500 mt-2">Crie um cérebro inteligente (Gemini) para cada uma das suas páginas e automatize o atendimento com perfeição.</p>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                    {accounts.length === 0 ? (
                        <div className="text-center p-6 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                            <p className="text-gray-500 font-bold">Nenhuma conta conectada.</p>
                            <p className="text-sm text-gray-400 mt-1">Conecte uma página no menu Minhas Contas para criar um agente.</p>
                        </div>
                    ) : (
                        accounts.map(acc => {
                            const accAgent = agents.find(a => a.account_id === acc.id && a.platform === acc.platform);
                            const hasAi = accAgent?.is_active;
                            const isPaused = accAgent?.handoff_active;

                            return (
                                <button
                                    key={`${acc.platform}-${acc.id}`}
                                    onClick={() => selectAccount(acc)}
                                    className={`w-full text-left p-4 rounded-2xl transition-all border flex items-center justify-between ${activeAccount?.id === acc.id && activeAccount?.platform === acc.platform
                                        ? 'bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200 shadow-sm'
                                        : 'bg-white border-gray-100 hover:border-purple-200 hover:shadow-sm hover:-translate-y-0.5'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="relative">
                                            {acc.avatar ? (
                                                <img src={acc.avatar} alt={acc.name} className="w-10 h-10 rounded-full border border-gray-100 object-cover" />
                                            ) : (
                                                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 font-bold">{acc.name[0]}</div>
                                            )}
                                            <div className="absolute -bottom-1 -right-1 p-1 bg-white rounded-full shadow-sm">
                                                {acc.platform === 'facebook' ? <Facebook size={12} className="text-blue-600" /> : <Instagram size={12} className="text-pink-600" />}
                                            </div>
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-gray-800 text-sm truncate max-w-[120px]">{acc.name}</h3>
                                            {hasAi ? (
                                                isPaused ? (
                                                    <span className="text-[10px] text-orange-600 font-bold uppercase flex items-center gap-1 mt-0.5"><ShieldAlert size={10} /> Em Pausa (Humano)</span>
                                                ) : (
                                                    <span className="text-[10px] text-green-600 font-bold uppercase flex items-center gap-1 mt-0.5"><Zap size={10} className="fill-green-600" /> IA Ativa</span>
                                                )
                                            ) : (
                                                <span className="text-[10px] text-gray-400 font-bold uppercase mt-0.5">Sem IA</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-gray-300">
                                        <Bot size={18} className={hasAi && !isPaused ? "text-purple-600" : ""} />
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 pl-8 flex flex-col h-full">
                {activeAccount ? (
                    <div className="bg-white rounded-[2rem] border border-gray-100 p-8 shadow-xl shadow-gray-200/50 flex flex-col h-full relative overflow-hidden">

                        {/* Status Ribbon (For Handoff) */}
                        {isActive && handoff && (
                            <div className="absolute top-0 left-0 right-0 bg-orange-100 border-b border-orange-200 p-3 flex justify-between items-center text-orange-800">
                                <div className="flex items-center gap-2">
                                    <ShieldAlert size={16} />
                                    <span className="text-sm font-bold">Intervenção Humana Detectada! O robô pausou automaticamente para não atrapalhar seu atendimento.</span>
                                </div>
                                <button
                                    onClick={handleResumeBot}
                                    disabled={saving}
                                    className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-orange-600/20 disabled:opacity-50"
                                >
                                    Retomar Robô
                                </button>
                            </div>
                        )}

                        <div className={`flex items-center justify-between mb-8 ${isActive && handoff ? 'mt-10' : ''}`}>
                            <div className="flex items-center gap-4">
                                <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-2xl flex items-center justify-center border border-purple-200">
                                    <Bot size={32} className={isActive ? "text-purple-600" : "text-gray-400"} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Cérebro: {activeAccount.name}</h2>
                                    <p className="text-sm text-gray-500 font-medium">Motor de IA: Google Gemini 1.5 Flash</p>
                                </div>
                            </div>

                            <label className="flex items-center cursor-pointer group">
                                <div className="mr-3 text-right">
                                    <div className={`font-bold text-sm ${isActive ? 'text-purple-600' : 'text-gray-400'}`}>
                                        {isActive ? 'AGENTE LIGADO' : 'AGENTE DESLIGADO'}
                                    </div>
                                    <div className="text-[10px] text-gray-400 font-medium">Status do Robô Automático</div>
                                </div>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full transition-colors ${isActive ? 'bg-purple-600' : 'bg-gray-200'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isActive ? 'transform translate-x-6' : ''} flex items-center justify-center`}>
                                        {isActive ? <Power size={12} className="text-purple-600" /> : <PowerOff size={12} className="text-gray-400" />}
                                    </div>
                                </div>
                            </label>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                Palavra-chave de Ativação (Opcional)
                                <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-black">Filtro</span>
                            </label>
                            <p className="text-xs text-gray-500 mb-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                Se preenchido, o robô <strong>só vai responder</strong> se a mensagem do cliente contiver esta palavra exata (ex: "orçamento"). Se deixado em branco, o robô responderá a todas as mensagens.
                            </p>
                            <input
                                type="text"
                                value={keyword}
                                onChange={(e) => setKeyword(e.target.value)}
                                className="w-full p-4 rounded-xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 text-gray-700 transition-all font-medium"
                                placeholder="Deixe em branco para responder tudo..."
                            />
                        </div>

                        <div className="flex-1 flex flex-col mb-6">
                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                Prompt de Sistema (Instruções do Agente)
                                <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-black">Core</span>
                            </label>
                            <p className="text-xs text-gray-500 mb-4 bg-gray-50 p-3 rounded-xl border border-gray-100">
                                Diga exatamente como você quer que o Agente responda aos clientes desta página. Defina o tom de voz, o tamanho da resposta, os produtos que ele deve empurrar e objeções comuns.
                            </p>
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                className="w-full flex-1 p-5 rounded-2xl border-2 border-gray-200 bg-gray-50 focus:bg-white focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 text-gray-700 transition-all resize-none shadow-inner"
                                placeholder="Você é o assistente virtual da resenha digital. O cliente irá perguntar preços, etc..."
                            />
                        </div>

                        <div className="flex justify-end pt-4 border-t border-gray-100">
                            <button
                                onClick={handleSaveAgent}
                                disabled={saving}
                                className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                            >
                                {saving ? (
                                    <>Aguarde...</>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        Salvar Configurações
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <div className="text-center opacity-50">
                            <Bot size={64} className="mx-auto text-gray-300 mb-4" />
                            <p className="text-gray-500 font-bold text-lg">Selecione uma conta para configurar seu Agente</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AIAgentsPage;
