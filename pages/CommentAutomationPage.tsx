import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { 
  Bot, Save, Plus, Trash2, Edit2, MessageSquare, MessagesSquare, 
  Link, Check, HelpCircle, X, ExternalLink, Info, Smartphone, 
  ChevronLeft, Send, Camera, Phone, Video, Search, MoreVertical, 
  Menu, Instagram, Bookmark, Zap, Sparkles, ChevronRight, Loader2, AlertCircle 
} from 'lucide-react';
import { TemplateModal } from '../components/automation/TemplateModal';
import { PostSelector } from '../components/automation/PostSelector';

/**
 * Componente interno do Mockup de Celular (Estilo Instagram)
 */
const PhoneMockup = ({ 
    keyword, 
    dmText, 
    buttonText, 
    platform, 
    accountName, 
    replyText,
    postUrl,
    postCaption
}: { 
    keyword: string, 
    dmText: string, 
    buttonText: string, 
    platform: string, 
    accountName: string,
    replyText: string,
    postUrl?: string,
    postCaption?: string
}) => {
    const [activeTab, setActiveTab] = useState<'post' | 'comments' | 'dm'>('post');

    return (
        <div className="relative group transition-all duration-700 animate-float scale-[0.85] xl:scale-[0.95] origin-center -my-8">
            {/* Glow Background */}
            <div className="absolute -inset-20 bg-blue-500/10 rounded-full blur-[120px] opacity-50 group-hover:opacity-100 transition-opacity duration-1000"></div>

            {/* Phone Frame */}
            <div className="relative w-[320px] h-[640px] bg-black rounded-[60px] border-[10px] border-zinc-900 shadow-[0_0_60px_rgba(0,0,0,0.4)] overflow-hidden mx-auto ring-1 ring-white/10 flex flex-col">
                
                {/* Status Bar */}
                <div className="h-14 bg-black flex items-end px-8 pb-2 justify-between text-white text-[11px] font-bold z-30">
                    <span className="tracking-tight">9:41</span>
                    <div className="flex gap-1.5 items-center">
                        <div className="flex gap-0.5 items-end h-2.5">
                            <div className="w-0.5 h-1 bg-white rounded-full"></div>
                            <div className="w-0.5 h-1.5 bg-white rounded-full"></div>
                            <div className="w-0.5 h-2 bg-white rounded-full"></div>
                            <div className="w-0.5 h-2.5 bg-white rounded-full"></div>
                        </div>
                        <Smartphone size={10} />
                        <div className="w-5 h-2.5 border border-white/30 rounded-[3px] p-[1px] relative">
                            <div className="bg-white h-full w-4 rounded-[1px]"></div>
                        </div>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden relative bg-zinc-950">
                    {activeTab === 'post' && (
                        <div className="h-full flex flex-col animate-fade-in">
                            <div className="h-12 flex items-center px-4 gap-3 border-b border-zinc-900">
                                <ChevronLeft size={20} className="text-white" />
                                <div className="flex-1 text-center text-xs font-bold text-white tracking-widest uppercase">Publicação</div>
                                <MoreVertical size={20} className="text-white" />
                            </div>
                            <div className="p-3 flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 p-[1.5px]">
                                    <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[10px] font-black text-white">
                                        {accountName.charAt(0).toUpperCase()}
                                    </div>
                                </div>
                                <span className="text-[11px] font-bold text-white">{accountName}</span>
                            </div>
                            <div className="aspect-square w-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                                {postUrl ? (
                                    <img src={postUrl} className="w-full h-full object-cover" alt="Selected Post" />
                                ) : (
                                    <Instagram size={48} className="text-zinc-800" />
                                )}
                            </div>
                            <div className="p-3 space-y-2">
                                <div className="flex gap-4 text-white">
                                    <MessageSquare size={20} />
                                    <Send size={20} />
                                    <Bookmark size={20} className="ml-auto" />
                                </div>
                                <div className="text-[11px] text-white">
                                    <span className="font-bold mr-2 text-blue-400">#fluxointeligente</span>
                                    <span className="text-zinc-300">{postCaption || 'Você ainda não escolheu um post para sua automação.'}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'comments' && (
                        <div className="h-full flex flex-col animate-fade-in bg-black">
                            <div className="h-12 flex items-center px-4 gap-3 border-b border-zinc-900">
                                <ChevronLeft size={20} className="text-white" />
                                <div className="flex-1 text-center text-xs font-bold text-white tracking-widest uppercase">Comentários</div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                                {/* Original Comment */}
                                <div className="flex gap-3">
                                    <div className="w-8 h-8 rounded-full bg-zinc-600 flex-shrink-0"></div>
                                    <div className="space-y-1 flex-1">
                                        <p className="text-[11px] text-white">
                                            <span className="font-bold mr-2">cliente_exemplo</span>
                                            {keyword || 'Palavra-chave'}
                                        </p>
                                        <div className="flex gap-3 text-[9px] text-zinc-500 font-bold">
                                            <span>2m</span>
                                            <span>Responder</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Our Automation Reply */}
                                {replyText && (
                                    <div className="flex gap-3 ml-11 animate-fade-in-up">
                                        <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 p-[1px]">
                                            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-[8px] font-black text-white italic">
                                                {accountName.charAt(0).toUpperCase()}
                                            </div>
                                        </div>
                                        <div className="space-y-1 flex-1">
                                            <p className="text-[11px] text-white">
                                                <span className="font-bold mr-2 text-blue-400">{accountName}</span>
                                                {replyText}
                                            </p>
                                            <div className="flex gap-3 text-[9px] text-zinc-500 font-bold">
                                                <span>agora</span>
                                                <span>Curtir</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'dm' && (
                        <div className="h-full flex flex-col animate-fade-in bg-black">
                            <div className="h-12 bg-black border-b border-zinc-800 flex items-center px-4 gap-3">
                                <ChevronLeft size={20} className="text-white" />
                                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 flex items-center justify-center text-xs font-black text-white italic">
                                    {accountName.charAt(0).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="text-white text-xs font-bold truncate">{accountName || 'Seu Perfil'}</h4>
                                    <p className="text-[8px] text-green-500 font-black tracking-tighter animate-pulse">ON-LINE</p>
                                </div>
                                <div className="flex gap-4 text-white">
                                    <Phone size={18} />
                                    <Video size={18} />
                                </div>
                            </div>
                            <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto scrollbar-hide">
                                <div className="text-center py-4">
                                    <div className="w-16 h-16 rounded-full bg-zinc-800 mx-auto mb-2 flex items-center justify-center text-white text-2xl font-black">
                                        {accountName.charAt(0).toUpperCase()}
                                    </div>
                                    <h5 className="text-white text-xs font-bold">{accountName}</h5>
                                    <p className="text-[9px] text-zinc-500 font-medium tracking-tight">Instagram • 1.2M seguidores</p>
                                </div>

                                {keyword && (
                                    <div className="self-end max-w-[85%] animate-fade-in-right">
                                        <div className="bg-blue-600 text-white text-xs py-2.5 px-4 rounded-[22px] rounded-tr-md shadow-lg shadow-blue-500/20">
                                            {keyword}
                                        </div>
                                    </div>
                                )}

                                {dmText && (
                                    <div className="self-start max-w-[85%] animate-fade-in-left">
                                        <div className="bg-zinc-800 text-white text-xs py-2.5 px-4 rounded-[22px] rounded-tl-md border border-white/5">
                                            {dmText}
                                            {buttonText && (
                                                <div className="mt-3 border-t border-white/10 pt-3 text-center text-blue-400 font-black tracking-[0.2em] text-[9px] uppercase hover:bg-white/5 py-1 rounded-lg transition-colors">
                                                    {buttonText}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Tabs Switcher at Bottom */}
                <div className="h-16 bg-zinc-900/90 backdrop-blur-xl border-t border-white/5 px-4 flex items-center justify-center gap-2">
                    {[
                        { id: 'post', label: 'Publicar', icon: Instagram },
                        { id: 'comments', label: 'Comentários', icon: MessageSquare },
                        { id: 'dm', label: 'DM', icon: MessagesSquare }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex-1 flex flex-col items-center justify-center py-1.5 rounded-xl transition-all ${
                                activeTab === tab.id 
                                ? 'bg-white/10 text-white scale-105' 
                                : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            <tab.icon size={14} className={activeTab === tab.id ? 'text-blue-400' : ''} />
                            <span className="text-[8px] font-black uppercase mt-1 tracking-wider">{tab.label}</span>
                        </button>
                    ))}
                </div>

                {/* Bottom Handle */}
                <div className="h-6 flex items-center justify-center">
                    <div className="w-20 h-1bg-zinc-700 rounded-full"></div>
                </div>
            </div>
        </div>
    );
};

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
    button_text: string;
    button_url: string;
    trigger_type?: 'all_posts' | 'specific_post';
    post_id?: string;
    post_url?: string;
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
    const [buttonText, setButtonText] = useState('');
    const [buttonUrl, setButtonUrl] = useState('');
    const [isActive, setIsActive] = useState(true);

    // Wizard state
    const [currentStep, setCurrentStep] = useState(0); // 0: Gallery, 1: Trigger, 2: Content
    const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
    
    // New automation states for specific trigger
    const [triggerType, setTriggerType] = useState<'all_posts' | 'specific_post'>('all_posts');
    const [selectedMediaId, setSelectedMediaId] = useState<string | undefined>(undefined);
    const [postUrl, setPostUrl] = useState<string | undefined>(undefined);
    const [postCaption, setPostCaption] = useState<string | undefined>(undefined);

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
        setButtonText('');
        setButtonUrl('');
        setTriggerType('all_posts');
        setSelectedMediaId(undefined);
        setPostUrl(undefined);
        setPostCaption(undefined);
        setIsActive(true);
        setIsEditing(true);
        setCurrentStep(0); // Start with Template Modal
        setIsTemplateModalOpen(true);
    };

    const handleSelectTemplate = (template: any) => {
        const { prefill } = template;
        setKeyword(prefill.keyword);
        setReplyText(prefill.replyText);
        setSendDm(!!prefill.dmText);
        setDmText(prefill.dmText);
        setButtonText(prefill.buttonText);
        setTriggerType(prefill.triggerType);
        
        setIsTemplateModalOpen(false);
        setShowForm(true);
        setCurrentStep(1); // Go to Trigger Step
    };

    const handleStartFromScratch = () => {
        setIsTemplateModalOpen(false);
        setShowForm(true);
        setCurrentStep(1);
    };

    const handleEditAutomation = (auto: any) => {
        setCurrentCode(auto.id);
        setKeyword(auto.keyword);
        setReplyType(auto.reply_type);
        setReplyText(auto.reply_text || '');
        setSendDm(auto.send_dm);
        setDmText(auto.dm_text || '');
        setButtonText(auto.button_text || '');
        setButtonUrl(auto.button_url || '');
        setTriggerType(auto.trigger_type || 'all_posts');
        setSelectedMediaId(auto.post_id);
        setPostUrl(auto.post_url);
        setIsActive(auto.is_active);
        setIsEditing(true);
        setShowForm(true);
        setCurrentStep(2); // In edit mode, go straight to content
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
            const payload: any = {
                id: currentCode,
                account_id: selectedAccount.id,
                platform: selectedAccount.platform,
                keyword,
                reply_type: replyType,
                reply_text: replyText,
                send_dm: sendDm,
                dm_text: dmText,
                button_text: buttonText,
                button_url: buttonUrl,
                trigger_type: triggerType,
                post_id: selectedMediaId,
                post_url: postUrl,
                is_active: isActive
            };
            
            // Validação de botões
            if (sendDm && (buttonText || buttonUrl)) {
                if (!buttonText || !buttonUrl) {
                    showMessage('Para usar um botão, você deve preencher tanto o texto quanto o link.', true);
                    setIsSaving(false);
                    return;
                }
                if (!buttonUrl.startsWith('http')) {
                    showMessage('O link do botão deve começar com http:// ou https://', true);
                    setIsSaving(false);
                    return;
                }
            }

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
        <div className={`${showForm ? 'max-w-full lg:px-6' : 'max-w-7xl'} mx-auto space-y-6 relative transition-all duration-500`}>
            
            {/* Cabeçalho Principal (Oculto no Builder) */}
            {!showForm && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fade-in">
                    <div>
                        <h1 className="text-4xl font-black text-zinc-900 tracking-tighter flex items-center gap-4">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                                <MessageSquare className="w-7 h-7 text-white" />
                            </div>
                            Automação de Comentários
                        </h1>
                        <p className="text-zinc-500 mt-2 text-lg font-medium">
                            Crie robôs que respondem automaticamente quando alguém comenta em seus posts.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowHelp(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-white text-zinc-700 rounded-xl font-bold border border-zinc-200 hover:border-blue-500 hover:text-blue-600 transition-all shadow-sm"
                    >
                        <HelpCircle size={20} />
                        Como Configurar?
                    </button>
                </div>
            )}

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
                                        <p><strong>Token de Verificação:</strong> fluxointeligente_secret_2026</p>
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
                {/* Sidebar Accounts (Hidden in Builder) */}
                {!showForm && (
                    <div className="w-full lg:w-80 flex-shrink-0 animate-fade-in-left">
                        <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm sticky top-6">
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4 px-2">Suas Contas</h2>

                            {loading && accounts.length === 0 ? (
                                <div className="text-center py-6 text-zinc-400">Carregando...</div>
                            ) : accounts.length === 0 ? (
                                <div className="text-center py-6 text-zinc-500 bg-zinc-50 rounded-xl text-sm border border-zinc-100 p-4">
                                    Nenhuma página conectada.
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
                                                <h3 className={`font-bold truncate ${selectedAccount?.id === account.id ? 'text-blue-900' : 'text-zinc-700'}`}>
                                                    {account.name}
                                                </h3>
                                                <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tighter">{account.platform}</p>
                                            </div>
                                            {automations.filter(a => a.account_id === account.id && a.platform === account.platform).length > 0 && (
                                                <div className="w-5 h-5 rounded-full bg-zinc-100 flex items-center justify-center text-[10px] font-black text-zinc-600">
                                                    {automations.filter(a => a.account_id === account.id && a.platform === account.platform).length}
                                                </div>
                                            )}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1">
                    {!selectedAccount ? (
                        <div className="bg-white rounded-2xl border border-gray-100 p-12 shadow-sm text-center">
                            <MessageSquare className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Selecione uma conta</h3>
                            <p className="text-gray-500">Escolha uma página do Facebook ou conta do Instagram ao lado para configurar seus robôs de comentários.</p>
                        </div>
                    ) : showForm ? (
                        // --- 🛠️ NOVO VISUAL FLOW BUILDER (STRECHED/WIZARD) ---
                        <div className="flex flex-col xl:flex-row gap-0 bg-white rounded-3xl border border-gray-100 shadow-2xl overflow-hidden h-[calc(100vh-140px)] animate-fade-in-up">
                            
                            {/* COLUNA ESQUERDA: CONFIGURAÇÃO (60%) */}
                            <div className="flex-1 flex flex-col min-w-0 border-r border-gray-100 relative">
                                <div className="p-6 border-b border-zinc-100 bg-white flex items-center justify-between sticky top-0 z-20">
                                    <div className="flex items-center gap-4">
                                        <button 
                                            onClick={handleCancelEdit}
                                            className="p-2 hover:bg-zinc-50 rounded-xl text-zinc-400 hover:text-zinc-900 transition-all border border-transparent hover:border-zinc-200"
                                        >
                                            <ChevronLeft size={24} />
                                        </button>
                                        <div>
                                            <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2 tracking-tighter">
                                                <Zap size={20} className="text-blue-600 fill-blue-600" />
                                                {currentStep === 1 ? 'Definir Gatilho' : 'Configurar Respostas'}
                                                <span className="px-2 py-0.5 bg-zinc-100 text-zinc-500 text-[10px] font-black uppercase rounded-lg ml-2">Passo {currentStep} de 2</span>
                                            </h2>
                                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">{selectedAccount.name}</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex gap-3">
                                        {currentStep === 2 && (
                                            <button 
                                                onClick={() => setCurrentStep(1)}
                                                className="px-5 py-2.5 bg-zinc-100 text-zinc-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-zinc-200 transition-all"
                                            >
                                                Anterior
                                            </button>
                                        )}
                                        {currentStep === 1 ? (
                                            <button 
                                                onClick={() => setCurrentStep(2)}
                                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20 flex items-center gap-2"
                                            >
                                                Próximo Passo
                                                <ChevronRight size={16} />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={handleSave}
                                                disabled={isSaving}
                                                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-50"
                                            >
                                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Bot size={18} />}
                                                ATIVAR ROBÔ
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="p-8 overflow-y-auto flex-1 bg-white space-y-12 custom-scrollbar">
                                    {/* PASSO 1: TRIGGER TYPE & POST SELECTION */}
                                    {currentStep === 1 && (
                                        <div className="space-y-10 animate-fade-in-up">
                                            <div className="space-y-2">
                                                <h3 className="text-3xl font-black text-zinc-900 tracking-tighter">Onde o robô deve atuar?</h3>
                                                <p className="text-zinc-500 font-medium">Selecione se o robô deve responder em qualquer publicação ou em uma específica.</p>
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {[
                                                    { id: 'all_posts', title: 'Qualquer Publicação', desc: 'Ativa em todos os posts e Reels da sua conta.', icon: Instagram },
                                                    { id: 'specific_post', title: 'Post Específico', desc: 'Funciona apenas em um post ou Reel selecionado.', icon: Bookmark }
                                                ].map(type => (
                                                    <button
                                                        key={type.id}
                                                        onClick={() => setTriggerType(type.id as any)}
                                                        className={`p-6 rounded-[28px] border-4 text-left transition-all ${
                                                            triggerType === type.id 
                                                            ? 'border-blue-600 bg-blue-50/50 shadow-xl shadow-blue-500/10' 
                                                            : 'border-zinc-100 hover:border-zinc-200 bg-white'
                                                        }`}
                                                    >
                                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                                                            triggerType === type.id ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-400'
                                                        }`}>
                                                            <type.icon size={24} />
                                                        </div>
                                                        <h4 className="text-lg font-black text-zinc-900 leading-tight mb-2">{type.title}</h4>
                                                        <p className="text-zinc-500 text-sm font-medium leading-relaxed">{type.desc}</p>
                                                    </button>
                                                ))}
                                            </div>

                                            {triggerType === 'specific_post' && (
                                                <div className="pt-8 border-t border-zinc-100 animate-fade-in">
                                                    <PostSelector 
                                                        accountId={selectedAccount.id}
                                                        selectedPostId={selectedMediaId}
                                                        onSelect={(media) => {
                                                            setSelectedMediaId(media.id);
                                                            setPostUrl(media.media_url);
                                                            setPostCaption(media.caption);
                                                        }}
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* PASSO 2: CONTENT CONFIGURATION */}
                                    {currentStep === 2 && (
                                        <div className="space-y-12 animate-fade-in-up">
                                            {/* Gatilho (Keyword) */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-black text-lg shadow-xl shadow-zinc-500/20">1</div>
                                                    <div>
                                                        <h3 className="text-xl font-black text-zinc-900 tracking-tighter">Qual a palavra-chave?</h3>
                                                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest whitespace-nowrap">Digite a palavra que o cliente deve comentar</p>
                                                    </div>
                                                </div>
                                                <div className="relative group">
                                                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-blue-600 transition-colors">
                                                        <Search size={22} />
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={keyword}
                                                        onChange={e => setKeyword(e.target.value)}
                                                        placeholder="EX: QUERO"
                                                        className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-2xl py-5 pl-14 pr-6 focus:ring-8 focus:ring-blue-100 focus:border-blue-600 transition-all outline-none font-black text-2xl tracking-widest uppercase placeholder:text-zinc-200"
                                                    />
                                                </div>
                                            </div>

                                            {/* Resposta no Comentário */}
                                            <div className="space-y-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-black text-lg shadow-xl shadow-zinc-500/20">2</div>
                                                    <div>
                                                        <h3 className="text-xl font-black text-zinc-900 tracking-tighter">Resposta no Post</h3>
                                                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest whitespace-nowrap">O que o robô vai escrever publicamente?</p>
                                                    </div>
                                                </div>
                                                <div className="bg-zinc-50 rounded-3xl p-2 border-2 border-zinc-100 focus-within:border-blue-600 focus-within:bg-white transition-all shadow-sm">
                                                    <textarea
                                                        value={replyText}
                                                        onChange={e => setReplyText(e.target.value)}
                                                        rows={3}
                                                        placeholder="Te enviei no direct agora mesmo! 🚀"
                                                        className="w-full p-6 border-none bg-transparent focus:ring-0 text-zinc-700 font-bold text-lg resize-none"
                                                    />
                                                    <div className="px-6 py-4 border-t border-zinc-100 flex justify-between items-center bg-zinc-50/50 rounded-b-[28px]">
                                                        <div className="flex gap-2">
                                                            {['🚀', '✨', '💎'].map(e => <button key={e} onClick={() => setReplyText(t => t + e)} className="p-2 hover:bg-white rounded-xl transition-all shadow-sm border border-transparent hover:border-zinc-200">{e}</button>)}
                                                        </div>
                                                        <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-100 transition-all opacity-50 cursor-not-allowed">
                                                            <Sparkles size={14} /> IA Intelix (Em breve)
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* DM Automatico */}
                                            <div className="space-y-6">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-xl shadow-blue-500/20">3</div>
                                                        <div>
                                                            <h3 className="text-xl font-black text-zinc-900 tracking-tighter">Fluxo de Conversão (DM)</h3>
                                                            <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest">Envia link privado para o cliente</p>
                                                        </div>
                                                    </div>
                                                    <label className="relative inline-flex items-center cursor-pointer group">
                                                        <input type="checkbox" checked={sendDm} onChange={(e) => setSendDm(e.target.checked)} className="sr-only peer" />
                                                        <div className="w-14 h-8 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-blue-600 shadow-sm group-hover:scale-105 transition-transform"></div>
                                                    </label>
                                                </div>

                                                {sendDm && (
                                                    <div className="space-y-6 p-8 bg-blue-50/50 rounded-[40px] border border-blue-100 animate-scale-up">
                                                        <div className="space-y-2">
                                                            <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest ml-1">Texto do Inbox</label>
                                                            <textarea
                                                                value={dmText}
                                                                onChange={e => setDmText(e.target.value)}
                                                                rows={4}
                                                                placeholder="Olá! Aqui está o link que você pediu..."
                                                                className="w-full bg-white p-6 rounded-3xl border border-blue-100 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 text-zinc-700 font-bold text-lg transition-all resize-none shadow-sm"
                                                            />
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest ml-1">Botão CTA</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={buttonText} 
                                                                    onChange={e => setButtonText(e.target.value)} 
                                                                    placeholder="CLIQUE AQUI"
                                                                    className="w-full p-4 bg-white rounded-2xl border border-blue-100 text-sm font-black focus:border-blue-500 transition-all shadow-sm"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-black text-blue-900 uppercase tracking-widest ml-1">URL / Link</label>
                                                                <input 
                                                                    type="text" 
                                                                    value={buttonUrl} 
                                                                    onChange={e => setButtonUrl(e.target.value)} 
                                                                    placeholder="https://..."
                                                                    className="w-full p-4 bg-white rounded-2xl border border-blue-100 text-sm font-medium focus:border-blue-500 transition-all shadow-sm"
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* COLUNA DIREITA: VISUALIZAÇÃO (40%) */}
                            <div className="hidden xl:flex w-[480px] bg-zinc-900 flex-col items-center justify-center p-8 relative overflow-hidden shrink-0">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-600/10 rounded-full blur-[120px] animate-pulse"></div>
                                
                                <div className="text-center mb-10 relative z-10">
                                    <h3 className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em] mb-2">Live Preview</h3>
                                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/5 backdrop-blur-md">
                                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.8)]"></div>
                                        <span className="text-[8px] font-black uppercase text-zinc-300 tracking-widest">Simulando Fluxo</span>
                                    </div>
                                </div>

                                <div className="relative z-10">
                                    <PhoneMockup 
                                        keyword={keyword} 
                                        dmText={dmText} 
                                        buttonText={buttonText} 
                                        platform={selectedAccount.platform}
                                        accountName={selectedAccount.name}
                                        replyText={replyText}
                                        postUrl={postUrl}
                                        postCaption={postCaption}
                                    />
                                </div>
                                
                                <p className="mt-10 text-[10px] text-zinc-500 font-bold max-w-[240px] text-center relative z-10 opacity-60">
                                    Confira como o robô interage nos comentários e DMs antes de ativar.
                                </p>
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

            {/* Modal de Galeria de Templates */}
            <TemplateModal 
                isOpen={isTemplateModalOpen}
                onClose={() => setIsTemplateModalOpen(false)}
                onSelect={handleSelectTemplate}
                onStartFromScratch={handleStartFromScratch}
            />
        </div>
    );
}
