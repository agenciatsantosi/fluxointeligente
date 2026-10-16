import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Flame, Plus, Pencil, Trash2, Check, X, Image as ImageIcon, Sparkles,
    Download, Eye, Heart, MessageCircle, Share2, Calendar, RefreshCw,
    Copy, Star, AlertTriangle, UserPlus, BarChart3, FileText, TrendingUp,
    Loader2, Wand2, Layers
} from 'lucide-react';
import { TacticalButton } from '../components/MotionComponents';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

interface WarmingAccount {
    id: number;
    name: string;
    username: string;
    niche?: string;
    audience?: string;
    language?: string;
    visual_style?: string;
    status_planning?: string;
    created_at: string;
}

interface WarmingImage {
    id: number;
    warming_account_id: number;
    category?: string;
    concept?: string;
    emotional_trigger?: string;
    visual_prompt?: string;
    image_text?: string;
    caption?: string;
    comment_question?: string;
    hashtags?: string;
    variations?: string;
    image_url: string;
    format?: string;
    style?: string;
    tone?: string;
    intensity?: string;
    is_favorite?: boolean;
    created_at: string;
}

interface WarmingPublication {
    id: number;
    warming_account_id: number;
    warming_image_id?: number | null;
    published_at: string;
    likes: number;
    comments: number;
    shares: number;
    views: number;
    notes?: string;
}

type Section = 'accounts' | 'generator' | 'gallery' | 'dashboard';

const CATEGORIES = [
    { value: 'dilemas_polemicos', label: 'Dilemas polêmicos', desc: 'Situações com dois lados que incentivam opiniões diferentes.' },
    { value: 'surpresa_curiosidade', label: 'Surpresa e curiosidade', desc: 'Informações inesperadas ou situações intrigantes.' },
    { value: 'identificacao_emocional', label: 'Identificação emocional', desc: 'Situações cotidianas que provocam reconhecimento pessoal.' },
    { value: 'debates_sociais', label: 'Debates sociais', desc: 'Questões que estimulam conversas respeitosas.' },
    { value: 'escolhas_dificeis', label: 'Escolhas difíceis', desc: 'O público precisa escolher entre duas alternativas.' },
    { value: 'indignacao_injustica', label: 'Indignação e injustiça', desc: 'Situações que exploram conflitos ou decisões questionáveis.' },
    { value: 'humor_absurdo', label: 'Humor e situações absurdas', desc: 'Cenas inesperadas que incentivam reações.' },
    { value: 'misterio_suspense', label: 'Mistério e suspense', desc: 'Desperta curiosidade e incentiva hipóteses.' },
    { value: 'historias_reviravolta', label: 'Histórias com reviravolta', desc: 'Conflito visual que sugere uma surpresa.' },
    { value: 'perguntas_provocativas', label: 'Perguntas provocativas', desc: 'Imagens construídas para gerar respostas.' }
];

const FORMATS = [
    { value: '9:16', label: 'Vertical 9:16 (TikTok/Reels)' },
    { value: '1:1', label: 'Quadrado 1:1' },
    { value: '4:5', label: 'Vertical 4:5' }
];

const INTENSITIES = [
    { value: 'leve', label: 'Leve' },
    { value: 'moderada', label: 'Moderada' },
    { value: 'forte', label: 'Forte' }
];

const STYLES = [
    { value: 'fotografia_realista', label: 'Fotografia realista' },
    { value: 'cinematografico', label: 'Cinematográfico' },
    { value: 'ilustracao', label: 'Ilustração' },
    { value: '3d', label: '3D' },
    { value: 'editorial', label: 'Editorial' }
];

const TONES = [
    { value: 'curioso', label: 'Curioso' },
    { value: 'polemico', label: 'Polêmico' },
    { value: 'emocional', label: 'Emocional' },
    { value: 'misterioso', label: 'Misterioso' },
    { value: 'humoristico', label: 'Humorístico' }
];

const categoryLabel = (value?: string) => CATEGORIES.find(c => c.value === value)?.label || value || '—';

const EMPTY_ACCOUNT = {
    name: '', username: '', niche: '', audience: '', language: 'pt-BR', visual_style: 'fotografia_realista'
};

const TikTokWarmingPage: React.FC = () => {
    const { showAlert, showConfirm } = useAlert();
    const [section, setSection] = useState<Section>('accounts');

    const [accounts, setAccounts] = useState<WarmingAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [loadingAccounts, setLoadingAccounts] = useState(true);

    const [showAccountModal, setShowAccountModal] = useState(false);
    const [editingAccount, setEditingAccount] = useState<WarmingAccount | null>(null);
    const [accountForm, setAccountForm] = useState({ ...EMPTY_ACCOUNT });
    const [savingAccount, setSavingAccount] = useState(false);

    const [genForm, setGenForm] = useState({
        category: 'identificacao_emocional',
        quantity: 2,
        format: '9:16',
        intensity: 'moderada',
        style: 'fotografia_realista',
        tone: 'curioso',
        idea: '',
        includeQuestion: true,
        variations: false
    });
    const [generating, setGenerating] = useState(false);

    const [images, setImages] = useState<WarmingImage[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const [selectedImages, setSelectedImages] = useState<number[]>([]);
    const [preview, setPreview] = useState<WarmingImage | null>(null);
    const [onlyFavorites, setOnlyFavorites] = useState(false);
    const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
    const [variationId, setVariationId] = useState<number | null>(null);
    const [editingImage, setEditingImage] = useState<WarmingImage | null>(null);
    const [editForm, setEditForm] = useState({ image_text: '', caption: '', comment_question: '', hashtags: '', concept: '' });
    const [savingEdit, setSavingEdit] = useState(false);

    const [publications, setPublications] = useState<WarmingPublication[]>([]);
    const [showPubModal, setShowPubModal] = useState(false);
    const [pubForm, setPubForm] = useState({
        warmingImageId: '' as string | number, likes: 0, comments: 0, shares: 0, views: 0, notes: ''
    });
    const [savingPub, setSavingPub] = useState(false);

    const selectedAccount = useMemo(
        () => accounts.find(a => a.id === selectedAccountId) || null,
        [accounts, selectedAccountId]
    );

    useEffect(() => { loadAccounts(); }, []);
    useEffect(() => { loadImages(); loadPublications(); }, [selectedAccountId]);

    const showErr = (error: any, fallback: string) =>
        showAlert(error?.response?.data?.error || fallback, 'error');

    /* ─────────────── CONTAS ─────────────── */
    const loadAccounts = async () => {
        setLoadingAccounts(true);
        try {
            const res = await api.get('/tiktok/warming/accounts');
            if (res.data.success) {
                setAccounts(res.data.accounts);
                if (res.data.accounts.length > 0 && selectedAccountId === null) {
                    setSelectedAccountId(res.data.accounts[0].id);
                }
            }
        } catch (error) {
            showErr(error, 'Erro ao carregar contas.');
        } finally {
            setLoadingAccounts(false);
        }
    };

    const openNewAccount = () => {
        setEditingAccount(null);
        setAccountForm({ ...EMPTY_ACCOUNT });
        setShowAccountModal(true);
    };

    const openEditAccount = (account: WarmingAccount) => {
        setEditingAccount(account);
        setAccountForm({
            name: account.name,
            username: account.username,
            niche: account.niche || '',
            audience: account.audience || '',
            language: account.language || 'pt-BR',
            visual_style: account.visual_style || 'fotografia_realista'
        });
        setShowAccountModal(true);
    };

    const saveAccount = async () => {
        if (!accountForm.name.trim()) return showAlert('Informe o nome de identificação da conta.', 'warning');
        if (!accountForm.username.trim()) return showAlert('Informe o @usuário do TikTok.', 'warning');
        setSavingAccount(true);
        try {
            if (editingAccount) {
                await api.put(`/tiktok/warming/accounts/${editingAccount.id}`, accountForm);
                showAlert('Conta atualizada com sucesso.', 'success');
            } else {
                const res = await api.post('/tiktok/warming/accounts', accountForm);
                if (res.data.account?.id) setSelectedAccountId(res.data.account.id);
                showAlert('Conta cadastrada com sucesso.', 'success');
            }
            setShowAccountModal(false);
            await loadAccounts();
        } catch (error) {
            showErr(error, 'Erro ao salvar a conta.');
        } finally {
            setSavingAccount(false);
        }
    };

    const deleteAccount = (account: WarmingAccount) => {
        showConfirm({
            title: 'Excluir conta',
            message: `Excluir "${account.name}" e todo o histórico de imagens geradas para ela? Esta ação não pode ser desfeita.`,
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                try {
                    await api.delete(`/tiktok/warming/accounts/${account.id}`);
                    showAlert('Conta excluída com sucesso.', 'success');
                    if (selectedAccountId === account.id) setSelectedAccountId(null);
                    await loadAccounts();
                    await loadImages();
                    await loadPublications();
                } catch (error) {
                    showErr(error, 'Erro ao excluir a conta.');
                }
            }
        });
    };

    /* ─────────────── IMAGENS ─────────────── */
    const loadImages = async () => {
        setLoadingImages(true);
        try {
            const query = selectedAccountId ? `?accountId=${selectedAccountId}` : '';
            const res = await api.get(`/tiktok/warming/images${query}`);
            if (res.data.success) setImages(res.data.images);
        } catch (error) {
            showErr(error, 'Erro ao carregar imagens.');
        } finally {
            setLoadingImages(false);
        }
    };

    const loadPublications = async () => {
        try {
            const query = selectedAccountId ? `?accountId=${selectedAccountId}` : '';
            const res = await api.get(`/tiktok/warming/publications${query}`);
            if (res.data.success) setPublications(res.data.publications);
        } catch (error) {
            console.error('Error loading publications:', error);
        }
    };

    const generateImages = async () => {
        if (!selectedAccount) return showAlert('Selecione uma conta antes de gerar.', 'warning');
        setGenerating(true);
        try {
            const res = await api.post('/tiktok/warming/generate', {
                warmingAccountId: selectedAccount.id,
                ...genForm,
                quantity: Number(genForm.quantity) || 2
            });
            if (res.data.success) {
                showAlert(`${res.data.count} imagem(ns) gerada(s) com sucesso.`, 'success');
                if (res.data.errors?.length) {
                    showAlert(`Atenção: ${res.data.errors.length} conteúdo(s) falharam e foram ignorados.`, 'warning');
                }
                await loadImages();
                setSection('gallery');
            }
        } catch (error) {
            showErr(error, 'Não foi possível gerar as imagens.');
        } finally {
            setGenerating(false);
        }
    };

    const regenerateImage = async (image: WarmingImage) => {
        setRegeneratingId(image.id);
        try {
            await api.post(`/tiktok/warming/images/${image.id}/regenerate`);
            showAlert('Imagem regenerada com sucesso.', 'success');
            await loadImages();
        } catch (error) {
            showErr(error, 'Erro ao regenerar a imagem.');
        } finally {
            setRegeneratingId(null);
        }
    };

    const openEditImage = (image: WarmingImage) => {
        setEditingImage(image);
        setEditForm({
            image_text: image.image_text || '',
            caption: image.caption || '',
            comment_question: image.comment_question || '',
            hashtags: image.hashtags || '',
            concept: image.concept || ''
        });
    };

    const saveEditImage = async () => {
        if (!editingImage) return;
        if (!editForm.image_text.trim()) return showAlert('Informe a frase principal da imagem.', 'warning');
        setSavingEdit(true);
        try {
            await api.post(`/tiktok/warming/images/${editingImage.id}/rerender`, editForm);
            showAlert('Texto atualizado e imagem regerada.', 'success');
            setEditingImage(null);
            if (preview && preview.id === editingImage.id) setPreview(null);
            await loadImages();
        } catch (error) {
            showErr(error, 'Erro ao salvar as alterações.');
        } finally {
            setSavingEdit(false);
        }
    };

    const createVariation = async (image: WarmingImage) => {
        setVariationId(image.id);
        try {
            const res = await api.post(`/tiktok/warming/images/${image.id}/variation`, {});
            if (res.data.success) {
                showAlert('Variação criada com sucesso.', 'success');
                await loadImages();
            }
        } catch (error) {
            showErr(error, 'Erro ao criar a variação.');
        } finally {
            setVariationId(null);
        }
    };

    const toggleFavorite = async (image: WarmingImage) => {
        try {
            await api.patch(`/tiktok/warming/images/${image.id}`, { is_favorite: !image.is_favorite });
            await loadImages();
        } catch (error) {
            showErr(error, 'Erro ao atualizar favorito.');
        }
    };

    const deleteImage = (image: WarmingImage) => {
        showConfirm({
            title: 'Excluir imagem',
            message: 'Deseja realmente excluir esta imagem? Esta ação não pode ser desfeita.',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                try {
                    await api.delete(`/tiktok/warming/images/${image.id}`);
                    showAlert('Imagem excluída.', 'success');
                    setSelectedImages(prev => prev.filter(id => id !== image.id));
                    await loadImages();
                } catch (error) {
                    showErr(error, 'Erro ao excluir a imagem.');
                }
            }
        });
    };

    const copyText = async (text: string, label = 'Conteúdo copiado.') => {
        try {
            await navigator.clipboard.writeText(text || '');
            showAlert(label, 'success');
        } catch {
            showAlert('Não foi possível copiar automaticamente.', 'error');
        }
    };

    const downloadImage = async (image: WarmingImage) => {
        try {
            const response = await fetch(image.image_url);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `aquecimento-tiktok-${image.id}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showAlert('Download iniciado.', 'success');
        } catch {
            window.open(image.image_url, '_blank');
        }
    };

    const downloadSelected = async () => {
        const picked = images.filter(img => selectedImages.includes(img.id));
        if (selectedImages.length === 0) return showAlert('Selecione ao menos uma imagem.', 'warning');
        for (const image of picked) {
            // pequeno intervalo para o navegador não bloquear downloads múltiplos
            await downloadImage(image);
            await new Promise(r => setTimeout(r, 400));
        }
        setSelectedImages([]);
    };

    const toggleSelectImage = (id: number) => {
        setSelectedImages(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    /* ─────────────── PUBLICAÇÕES (registro manual) ─────────────── */
    const openPubModal = () => {
        if (!selectedAccount) return showAlert('Selecione uma conta para registrar uma publicação.', 'warning');
        setPubForm({ warmingImageId: '', likes: 0, comments: 0, shares: 0, views: 0, notes: '' });
        setShowPubModal(true);
    };

    const savePublication = async () => {
        if (!selectedAccount) return;
        setSavingPub(true);
        try {
            await api.post('/tiktok/warming/publications', {
                warmingAccountId: selectedAccount.id,
                warmingImageId: pubForm.warmingImageId || null,
                likes: Number(pubForm.likes) || 0,
                comments: Number(pubForm.comments) || 0,
                shares: Number(pubForm.shares) || 0,
                views: Number(pubForm.views) || 0,
                notes: pubForm.notes
            });
            showAlert('Publicação registrada com sucesso.', 'success');
            setShowPubModal(false);
            await loadPublications();
        } catch (error) {
            showErr(error, 'Erro ao registrar a publicação.');
        } finally {
            setSavingPub(false);
        }
    };

    const deletePublication = (pub: WarmingPublication) => {
        showConfirm({
            title: 'Excluir registro',
            message: 'Excluir este registro manual de publicação?',
            confirmText: 'Excluir',
            cancelText: 'Cancelar',
            onConfirm: async () => {
                try {
                    await api.delete(`/tiktok/warming/publications/${pub.id}`);
                    showAlert('Registro excluído.', 'success');
                    await loadPublications();
                } catch (error) {
                    showErr(error, 'Erro ao excluir o registro.');
                }
            }
        });
    };

    /* ─────────────── MÉTRICAS (somente dados reais/manuais) ─────────────── */
    const stats = useMemo(() => {
        const totals = publications.reduce((acc, p) => ({
            likes: acc.likes + (p.likes || 0),
            comments: acc.comments + (p.comments || 0),
            shares: acc.shares + (p.shares || 0),
            views: acc.views + (p.views || 0)
        }), { likes: 0, comments: 0, shares: 0, views: 0 });

        const favorites = images.filter(i => i.is_favorite).length;

        const timeline = Object.entries(
            publications.reduce<Record<string, number>>((acc, p) => {
                const day = new Date(p.published_at).toLocaleDateString('pt-BR');
                const interactions = (p.likes || 0) + (p.comments || 0) + (p.shares || 0);
                acc[day] = (acc[day] || 0) + interactions;
                return acc;
            }, {})
        ).sort((a, b) => new Date(a[0].split('/').reverse().join('-')).getTime() - new Date(b[0].split('/').reverse().join('-')).getTime());

        const ranking = [...publications]
            .map(p => ({
                ...p,
                score: (p.likes || 0) + (p.comments || 0) * 2 + (p.shares || 0) * 3,
                image: images.find(img => img.id === p.warming_image_id)
            }))
            .sort((a, b) => b.score - a.score)
            .slice(0, 5);

        return { ...totals, favorites, timeline, ranking };
    }, [publications, images]);

    const filteredImages = onlyFavorites ? images.filter(i => i.is_favorite) : images;

    const toggleSelectAll = () => {
        if (selectedImages.length === filteredImages.length) setSelectedImages([]);
        else setSelectedImages(filteredImages.map(i => i.id));
    };

    const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400 transition';
    const labelCls = 'block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1.5';

    return (
        <div className="p-5 md:p-8 space-y-6 max-w-7xl mx-auto">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-pink-600 flex items-center justify-center shadow-lg shadow-orange-200">
                        <Flame className="h-6 w-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-gray-900 tracking-tight">Aquecimento de Conta</h1>
                        <p className="text-sm text-gray-500">Prepare conteúdos para estimular engajamento orgânico no TikTok</p>
                    </div>
                </div>
                {selectedAccount && (
                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">Conta ativa:</span>
                        <span className="text-sm font-semibold text-gray-900">{selectedAccount.name} <span className="text-gray-400">@{selectedAccount.username}</span></span>
                    </div>
                )}
            </div>

            {/* Navegação */}
            <div className="flex flex-wrap gap-1 bg-white border border-gray-200 rounded-2xl p-1.5 shadow-sm">
                {[
                    { id: 'accounts', label: 'Minhas Contas', icon: UserPlus },
                    { id: 'generator', label: 'Gerar Conteúdo', icon: Sparkles },
                    { id: 'gallery', label: 'Galeria', icon: ImageIcon },
                    { id: 'dashboard', label: 'Acompanhamento', icon: BarChart3 }
                ].map(tab => {
                    const Icon = tab.icon;
                    const active = section === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setSection(tab.id as Section)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${active ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'}`}
                        >
                            <Icon size={16} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            <AnimatePresence mode="wait">
                <motion.div key={section} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>

                    {/* ══════════ MINHAS CONTAS ══════════ */}
                    {section === 'accounts' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Minhas Contas</h2>
                                    <p className="text-xs text-gray-500">O @usuário é apenas um identificador de planejamento, não uma conexão autenticada.</p>
                                </div>
                                <TacticalButton onClick={openNewAccount}><Plus size={14} /> Adicionar Conta</TacticalButton>
                            </div>

                            {loadingAccounts ? (
                                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-purple-500" /></div>
                            ) : accounts.length === 0 ? (
                                <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                                    <UserPlus className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                    <h3 className="font-bold text-gray-800">Nenhuma conta cadastrada</h3>
                                    <p className="text-sm text-gray-500 mt-1 mb-4">Cadastre uma conta para começar a gerar conteúdos de aquecimento.</p>
                                    <TacticalButton onClick={openNewAccount} className="mx-auto"><Plus size={14} /> Adicionar Conta</TacticalButton>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                    {accounts.map(account => {
                                        const active = selectedAccountId === account.id;
                                        return (
                                            <div key={account.id} className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${active ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200 hover:shadow-md'}`}>
                                                <div className="flex justify-between items-start">
                                                    <div>
                                                        <h3 className="font-bold text-gray-900">{account.name}</h3>
                                                        <p className="text-sm text-purple-600 font-medium">@{account.username}</p>
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => openEditAccount(account)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Editar"><Pencil size={15} /></button>
                                                        <button onClick={() => deleteAccount(account)} className="p-2 rounded-lg hover:bg-red-50 text-red-500" title="Excluir"><Trash2 size={15} /></button>
                                                    </div>
                                                </div>
                                                <div className="mt-3 space-y-1 text-sm text-gray-600">
                                                    <p><span className="text-gray-400">Nicho:</span> {account.niche || '—'}</p>
                                                    <p><span className="text-gray-400">Público-alvo:</span> {account.audience || '—'}</p>
                                                    <p><span className="text-gray-400">Idioma:</span> {account.language || '—'}</p>
                                                    <p className="flex items-center gap-1 text-gray-400 text-xs pt-1"><Calendar size={12} /> Cadastrada em {new Date(account.created_at).toLocaleDateString('pt-BR')}</p>
                                                </div>
                                                <button
                                                    onClick={() => { setSelectedAccountId(account.id); setSection('generator'); }}
                                                    className={`mt-4 w-full py-2.5 rounded-xl text-sm font-bold transition-colors ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                                                >
                                                    {active ? '✓ Conta selecionada' : 'Selecionar conta'}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════ GERADOR ══════════ */}
                    {section === 'generator' && (
                        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
                            <h2 className="text-lg font-bold text-gray-900 mb-1">Gerar Conteúdo de Engajamento</h2>
                            <p className="text-xs text-gray-500 mb-5">As imagens são geradas por IA e recebem o texto aplicado por código, com variação de ideias e pergunta final.</p>

                            {!selectedAccount ? (
                                <div className="text-center py-14">
                                    <UserPlus className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                    <p className="text-sm text-gray-500 mb-4">Selecione ou cadastre uma conta para gerar conteúdos.</p>
                                    <TacticalButton onClick={() => setSection('accounts')} className="mx-auto">Ir para Minhas Contas</TacticalButton>
                                </div>
                            ) : (
                                <div className="space-y-5">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <div className="md:col-span-2 lg:col-span-1">
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Categoria do conteúdo</label>
                                            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={genForm.category} onChange={e => setGenForm({ ...genForm, category: e.target.value })}>
                                                {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                            </select>
                                            <p className="text-xs text-gray-400 mt-1">{CATEGORIES.find(c => c.value === genForm.category)?.desc}</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Quantidade de imagens</label>
                                            <input type="number" min={1} max={10} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={genForm.quantity} onChange={e => setGenForm({ ...genForm, quantity: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })} />
                                            <p className="text-xs text-gray-400 mt-1">De 1 a 10 imagens por geração.</p>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Formato da imagem</label>
                                            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={genForm.format} onChange={e => setGenForm({ ...genForm, format: e.target.value })}>
                                                {FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Intensidade emocional</label>
                                            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={genForm.intensity} onChange={e => setGenForm({ ...genForm, intensity: e.target.value })}>
                                                {INTENSITIES.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Estilo visual</label>
                                            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={genForm.style} onChange={e => setGenForm({ ...genForm, style: e.target.value })}>
                                                {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Tom</label>
                                            <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={genForm.tone} onChange={e => setGenForm({ ...genForm, tone: e.target.value })}>
                                                {TONES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Ideia ou situação específica (opcional)</label>
                                        <textarea rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Descreva uma situação, contexto ou ideia para guiar a geração..." value={genForm.idea} onChange={e => setGenForm({ ...genForm, idea: e.target.value })} />
                                    </div>

                                    <div className="flex flex-wrap gap-4">
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input type="checkbox" className="rounded" checked={genForm.includeQuestion} onChange={e => setGenForm({ ...genForm, includeQuestion: e.target.checked })} />
                                            Incluir pergunta no final da imagem
                                        </label>
                                        <label className="flex items-center gap-2 text-sm text-gray-700">
                                            <input type="checkbox" className="rounded" checked={genForm.variations} onChange={e => setGenForm({ ...genForm, variations: e.target.checked })} />
                                            Gerar diferentes variações da mesma ideia
                                        </label>
                                    </div>

                                    <TacticalButton color="purple" fullWidth loading={generating} onClick={generateImages} className="!py-4">
                                        {!generating && <><Sparkles size={16} /> Gerar Imagens</>}
                                    </TacticalButton>

                                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
                                        <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                                        <p className="text-xs text-amber-800">O sistema cria composições para estimular conversas, mas não garante resultados de engajamento nem liberação de recursos da plataforma. Não são geradas interações artificiais.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════ GALERIA ══════════ */}
                    {section === 'gallery' && (
                        <div className="space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Galeria de Imagens</h2>
                                    <p className="text-xs text-gray-500">{images.length} imagem(ns) no histórico{selectedAccount ? ` de ${selectedAccount.name}` : ''}</p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2">
                                        <input type="checkbox" checked={onlyFavorites} onChange={e => setOnlyFavorites(e.target.checked)} />
                                        Só favoritas
                                    </label>
                                    {filteredImages.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 bg-white border border-gray-200 rounded-xl px-3 py-2 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedImages.length === filteredImages.length && filteredImages.length > 0}
                                                onChange={toggleSelectAll}
                                            />
                                            Selecionar todas
                                        </label>
                                    )}
                                    {selectedImages.length > 0 && (
                                        <TacticalButton color="slate" onClick={downloadSelected}>
                                            <Download size={14} /> Baixar {selectedImages.length}
                                        </TacticalButton>
                                    )}
                                    <TacticalButton color="slate" onClick={loadImages}><RefreshCw size={14} /> Atualizar</TacticalButton>
                                </div>
                            </div>

                            {loadingImages ? (
                                <div className="flex justify-center py-16"><Loader2 className="animate-spin text-purple-500" /></div>
                            ) : filteredImages.length === 0 ? (
                                <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-12 text-center">
                                    <ImageIcon className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                                    <h3 className="font-bold text-gray-800">Nenhuma imagem encontrada</h3>
                                    <p className="text-sm text-gray-500 mt-1 mb-4">Use o gerador para criar conteúdos de engajamento.</p>
                                    <TacticalButton onClick={() => setSection('generator')} className="mx-auto"><Sparkles size={14} /> Ir para o Gerador</TacticalButton>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    {filteredImages.map(image => (
                                        <div key={image.id} className={`bg-white rounded-2xl border overflow-hidden shadow-sm hover:shadow-lg transition-all ${selectedImages.includes(image.id) ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200'}`}>
                                            <div className="relative bg-gray-100">
                                                <img src={image.image_url} alt={image.concept || 'imagem'} className="w-full h-64 object-cover" loading="lazy"
                                                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/400x711/e5e7eb/9ca3af?text=Imagem+Indispon%C3%ADvel'; }} />
                                                <label className="absolute top-2 left-2 bg-white/90 rounded-lg p-1.5 cursor-pointer">
                                                    <input type="checkbox" checked={selectedImages.includes(image.id)} onChange={() => toggleSelectImage(image.id)} />
                                                </label>
                                                {image.is_favorite && <div className="absolute top-2 right-2 bg-amber-400 rounded-full p-1.5"><Star size={13} className="text-white" fill="white" /></div>}
                                                <span className="absolute bottom-2 left-2 bg-black/70 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide">{categoryLabel(image.category)}</span>
                                            </div>
                                            <div className="p-4 space-y-2">
                                                <p className="text-sm font-semibold text-gray-900 line-clamp-2">{image.concept}</p>
                                                {image.image_text && <p className="text-xs text-gray-500 italic line-clamp-2">“{image.image_text}”</p>}
                                                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                                                    <Calendar size={11} /> {new Date(image.created_at).toLocaleDateString('pt-BR')}
                                                    <span className="mx-1">•</span>{image.format}
                                                </div>
                                                <div className="grid grid-cols-4 gap-1 pt-2 border-t border-gray-100">
                                                    <button onClick={() => setPreview(image)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex justify-center" title="Visualizar"><Eye size={14} /></button>
                                                    <button onClick={() => toggleFavorite(image)} className="p-2 rounded-lg hover:bg-gray-100 flex justify-center" title="Favoritar"><Heart size={14} className={image.is_favorite ? 'text-red-500 fill-red-500' : 'text-gray-600'} /></button>
                                                    <button onClick={() => regenerateImage(image)} disabled={regeneratingId === image.id} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex justify-center disabled:opacity-50" title="Regenerar imagem">{regeneratingId === image.id ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}</button>
                                                    <button onClick={() => openEditImage(image)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex justify-center" title="Editar texto"><Pencil size={14} /></button>
                                                    <button onClick={() => createVariation(image)} disabled={variationId === image.id} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex justify-center disabled:opacity-50" title="Criar variação">{variationId === image.id ? <Loader2 size={14} className="animate-spin" /> : <Layers size={14} />}</button>
                                                    <button onClick={() => copyText(image.caption || '', 'Legenda copiada.')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex justify-center" title="Copiar legenda"><Copy size={14} /></button>
                                                    <button onClick={() => downloadImage(image)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-600 flex justify-center" title="Baixar"><Download size={14} /></button>
                                                    <button onClick={() => deleteImage(image)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 flex justify-center" title="Excluir"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ══════════ ACOMPANHAMENTO ══════════ */}
                    {section === 'dashboard' && (
                        <div className="space-y-5">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-bold text-gray-900">Painel de Acompanhamento</h2>
                                    <p className="text-xs text-gray-500">Apenas dados reais ou registros manuais identificados. Nenhuma métrica fictícia é exibida.</p>
                                </div>
                                <TacticalButton onClick={openPubModal}><Plus size={14} /> Registrar publicação</TacticalButton>
                            </div>

                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { label: 'Imagens geradas', value: images.length, icon: ImageIcon, color: 'text-blue-600 bg-blue-50' },
                                    { label: 'Favoritas', value: stats.favorites, icon: Star, color: 'text-amber-600 bg-amber-50' },
                                    { label: 'Publicações registradas', value: publications.length, icon: FileText, color: 'text-purple-600 bg-purple-50' },
                                    { label: 'Visualizações', value: stats.views, icon: Eye, color: 'text-emerald-600 bg-emerald-50' }
                                ].map((card, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.color}`}><card.icon size={18} /></div>
                                        <p className="text-2xl font-black text-gray-900">{card.value.toLocaleString('pt-BR')}</p>
                                        <p className="text-xs text-gray-500 font-medium">{card.label}</p>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                {[
                                    { label: 'Curtidas', value: stats.likes, icon: Heart, color: 'text-red-500' },
                                    { label: 'Comentários', value: stats.comments, icon: MessageCircle, color: 'text-indigo-500' },
                                    { label: 'Compartilhamentos', value: stats.shares, icon: Share2, color: 'text-teal-500' }
                                ].map((card, idx) => (
                                    <div key={idx} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm flex items-center gap-3">
                                        <card.icon className={card.color} size={22} />
                                        <div>
                                            <p className="text-xl font-black text-gray-900">{card.value.toLocaleString('pt-BR')}</p>
                                            <p className="text-[11px] text-gray-500 font-medium">{card.label}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                    <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><TrendingUp size={16} className="text-purple-600" /> Evolução das interações</h3>
                                    <p className="text-xs text-gray-500 mb-4">Soma de curtidas, comentários e compartilhamentos por dia de publicação registrada.</p>
                                    {stats.timeline.length === 0 ? (
                                        <p className="text-sm text-gray-400 py-6 text-center">Ainda não há publicações registradas.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {stats.timeline.map(([day, total]) => {
                                                const max = Math.max(...stats.timeline.map(t => t[1]), 1);
                                                return (
                                                    <div key={day} className="flex items-center gap-3">
                                                        <span className="text-xs text-gray-500 w-20 shrink-0">{day}</span>
                                                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                                                            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${Math.max(4, (value => (value / max) * 100)(stats.timeline.find(t => t[0] === day)?.[1] || 0))}%` }}></div>
                                                        </div>
                                                        <span className="text-xs font-bold text-gray-700 w-12 text-right">{(stats.timeline.find(t => t[0] === day)?.[1] || 0).toLocaleString('pt-BR')}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                                    <h3 className="font-bold text-gray-900 mb-1 flex items-center gap-2"><BarChart3 size={16} className="text-purple-600" /> Melhor desempenho registrado</h3>
                                    <p className="text-xs text-gray-500 mb-4">Conteúdos com melhor pontuação com base nos registros manuais.</p>
                                    {stats.ranking.length === 0 ? (
                                        <p className="text-sm text-gray-400 py-6 text-center">Sem dados de desempenho ainda.</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {stats.ranking.map((item, idx) => (
                                                <div key={item.id} className="flex items-center gap-3">
                                                    <span className="w-6 h-6 rounded-lg bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">{idx + 1}</span>
                                                    {item.image && <img src={item.image.image_url} className="w-9 h-9 rounded-lg object-cover" alt="" />}
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-medium text-gray-800 truncate">{item.image?.concept || item.notes || 'Publicação'}</p>
                                                        <p className="text-[11px] text-gray-400">{item.likes} curtidas · {item.comments} comentários · {item.shares} compart.</p>
                                                    </div>
                                                    <span className="text-sm font-black text-purple-600">{item.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                                <div className="p-5 border-b border-gray-100">
                                    <h3 className="font-bold text-gray-900">Registros de publicação</h3>
                                    <p className="text-xs text-gray-500">Lançados manualmente pelo usuário — não são dados oficiais do TikTok.</p>
                                </div>
                                {publications.length === 0 ? (
                                    <p className="text-sm text-gray-400 py-8 text-center">Nenhum registro manual ainda.</p>
                                ) : (
                                    <div className="divide-y divide-gray-100">
                                        {publications.map(pub => (
                                            <div key={pub.id} className="flex flex-wrap items-center gap-4 px-5 py-3">
                                                <span className="text-xs text-gray-500 w-24">{new Date(pub.published_at).toLocaleDateString('pt-BR')}</span>
                                                <span className="text-xs text-gray-400 flex-1 min-w-[120px]">{pub.notes || '—'}</span>
                                                <div className="flex gap-4 text-xs font-semibold text-gray-700">
                                                    <span>❤ {pub.likes}</span><span>💬 {pub.comments}</span><span>↗ {pub.shares}</span><span>👁 {pub.views}</span>
                                                </div>
                                                <button onClick={() => deletePublication(pub)} className="p-2 rounded-lg hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>

            {/* ══════ MODAL CONTA ══════ */}
            <AnimatePresence>
                {showAccountModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAccountModal(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900">{editingAccount ? 'Editar Conta' : 'Adicionar Conta'}</h3>
                                <button onClick={() => setShowAccountModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Nome de identificação</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Ex: Conta Principal" value={accountForm.name} onChange={e => setAccountForm({ ...accountForm, name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">@Usuário do TikTok</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="exemplo_usuario" value={accountForm.username} onChange={e => setAccountForm({ ...accountForm, username: e.target.value })} />
                                    <p className="text-xs text-gray-400 mt-1">Identificador de planejamento. Não solicitamos sua senha do TikTok.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Nicho ou categoria</label>
                                        <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Relacionamentos, Humor..." value={accountForm.niche} onChange={e => setAccountForm({ ...accountForm, niche: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Público-alvo</label>
                                        <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="18-25 anos, Mulheres..." value={accountForm.audience} onChange={e => setAccountForm({ ...accountForm, audience: e.target.value })} />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Idioma das publicações</label>
                                        <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={accountForm.language} onChange={e => setAccountForm({ ...accountForm, language: e.target.value })}>
                                            <option value="pt-BR">Português (Brasil)</option>
                                            <option value="pt-PT">Português (Portugal)</option>
                                            <option value="es">Espanhol</option>
                                            <option value="en">Inglês</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Estilo visual preferido</label>
                                        <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={accountForm.visual_style} onChange={e => setAccountForm({ ...accountForm, visual_style: e.target.value })}>
                                            {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex gap-3">
                                <TacticalButton color="slate" onClick={() => setShowAccountModal(false)} className="flex-1">Cancelar</TacticalButton>
                                <TacticalButton loading={savingAccount} onClick={saveAccount} className="flex-1">{!savingAccount && <><Check size={14} /> Salvar</>}</TacticalButton>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════ MODAL PUBLICAÇÃO ══════ */}
            <AnimatePresence>
                {showPubModal && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPubModal(false)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900">Registrar publicação</h3>
                                <button onClick={() => setShowPubModal(false)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Imagem publicada (opcional)</label>
                                    <select className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={pubForm.warmingImageId} onChange={e => setPubForm({ ...pubForm, warmingImageId: e.target.value })}>
                                        <option value="">— Nenhuma específica —</option>
                                        {images.map(img => <option key={img.id} value={img.id}>{imageLabel(img)}</option>)}
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    {[
                                        { key: 'likes', label: 'Curtidas' },
                                        { key: 'comments', label: 'Comentários' },
                                        { key: 'shares', label: 'Compartilhamentos' },
                                        { key: 'views', label: 'Visualizações' }
                                    ].map(f => (
                                        <div key={f.key}>
                                            <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">{f.label}</label>
                                            <input type="number" min={0} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={(pubForm as any)[f.key]} onChange={e => setPubForm({ ...pubForm, [f.key]: parseInt(e.target.value) || 0 })} />
                                        </div>
                                    ))}
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Observações (opcional)</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" placeholder="Ex: post publicado às 19h" value={pubForm.notes} onChange={e => setPubForm({ ...pubForm, notes: e.target.value })} />
                                </div>
                                <p className="text-xs text-gray-400">Registro manual — não representa dados oficiais do TikTok.</p>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex gap-3">
                                <TacticalButton color="slate" onClick={() => setShowPubModal(false)} className="flex-1">Cancelar</TacticalButton>
                                <TacticalButton loading={savingPub} onClick={savePublication} className="flex-1">{!savingPub && <><Check size={14} /> Registrar</>}</TacticalButton>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════ MODAL EDITAR TEXTO ══════ */}
            <AnimatePresence>
                {editingImage && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingImage(null)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="text-lg font-bold text-gray-900">Editar texto</h3>
                                <button onClick={() => setEditingImage(null)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
                            </div>
                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Frase principal (na imagem)</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.image_text} onChange={e => setEditForm({ ...editForm, image_text: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Pergunta para comentários</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.comment_question} onChange={e => setEditForm({ ...editForm, comment_question: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Legenda</label>
                                    <textarea rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.caption} onChange={e => setEditForm({ ...editForm, caption: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 uppercase mb-1.5">Hashtags</label>
                                    <input className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm" value={editForm.hashtags} onChange={e => setEditForm({ ...editForm, hashtags: e.target.value })} />
                                </div>
                                <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                                    <Wand2 size={15} className="text-blue-600 mt-0.5 shrink-0" />
                                    <p className="text-xs text-blue-800">Ao salvar, a imagem é regerada com o novo texto aplicado.</p>
                                </div>
                            </div>
                            <div className="p-6 border-t border-gray-100 flex gap-3">
                                <TacticalButton color="slate" onClick={() => setEditingImage(null)} className="flex-1">Cancelar</TacticalButton>
                                <TacticalButton loading={savingEdit} onClick={saveEditImage} className="flex-1">{!savingEdit && <><Check size={14} /> Salvar</>}</TacticalButton>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ══════ MODAL PREVIEW ══════ */}
            <AnimatePresence>
                {preview && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreview(null)}>
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                            className="bg-white rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                                <h3 className="font-bold text-gray-900">{categoryLabel(preview.category)}</h3>
                                <button onClick={() => setPreview(null)} className="p-2 rounded-lg hover:bg-gray-100"><X size={18} /></button>
                            </div>
                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                                <img src={preview.image_url} alt={preview.concept} className="w-full rounded-xl object-contain bg-gray-50 max-h-[60vh]" />
                                <div className="space-y-4 text-sm">
                                    <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Conceito</p><p className="text-gray-800">{preview.concept || '—'}</p></div>
                                    <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Gatilho emocional</p><p className="text-gray-800">{preview.emotional_trigger || '—'}</p></div>
                                    <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Texto na imagem</p><p className="text-gray-800 italic">“{preview.image_text || '—'}”</p></div>
                                    {preview.comment_question && <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Pergunta</p><p className="text-gray-800">{preview.comment_question}</p></div>}
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <p className="text-xs font-bold text-gray-400 uppercase">Legenda</p>
                                            <button onClick={() => copyText(`${preview.caption || ''}\n\n${preview.hashtags ? '#' + preview.hashtags.split(',').map(h => h.trim()).filter(Boolean).join(' #') : ''}`, 'Legenda e hashtags copiadas.')} className="text-xs text-purple-600 font-semibold flex items-center gap-1"><Copy size={12} /> Copiar</button>
                                        </div>
                                        <p className="text-gray-800 whitespace-pre-wrap bg-gray-50 rounded-xl p-3">{preview.caption || '—'}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs font-bold text-gray-400 uppercase mb-1">Hashtags</p>
                                        <div className="flex flex-wrap gap-1">
                                            {(preview.hashtags || '').split(',').map(h => h.trim()).filter(Boolean).map((h, i) => (
                                                <span key={i} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-lg">#{h.replace(/^#/, '')}</span>
                                            ))}
                                        </div>
                                    </div>
                                    {preview.variations && (
                                        <div><p className="text-xs font-bold text-gray-400 uppercase mb-1">Variações sugeridas</p><p className="text-gray-700 text-xs whitespace-pre-wrap">{preview.variations}</p></div>
                                    )}
                                    <div className="flex gap-2 pt-2">
                                        <TacticalButton color="slate" onClick={() => downloadImage(preview)} className="flex-1"><Download size={14} /> Baixar</TacticalButton>
                                        <TacticalButton color="slate" onClick={() => regenerateImage(preview)} loading={regeneratingId === preview.id} className="flex-1">{regeneratingId !== preview.id && <><Wand2 size={14} /> Regenerar</>}</TacticalButton>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

function imageLabel(image: WarmingImage) {
    return `#${image.id} — ${(image.concept || image.image_text || 'conteúdo').slice(0, 40)}`;
}

export default TikTokWarmingPage;
