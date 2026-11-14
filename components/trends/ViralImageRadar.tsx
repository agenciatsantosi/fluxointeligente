import React, { useState, useRef, useEffect } from 'react';
import api from '../../services/api';
import {
  Search, Sparkles, ExternalLink, Loader2, RefreshCw, ArrowRight,
  TrendingUp, Wand2, Rocket, MessageSquare, Flame, AlertCircle, Copy, Check,
  Instagram, Facebook, Users, Image as ImageIcon, AtSign, Target,
  Filter, Zap, Info, ThumbsUp, MessageCircle, CheckCircle2, X, Share2, Layers, Download,
  Star, ChevronDown
} from 'lucide-react';

export interface ViralImageItem {
  id?: string;
  source_id?: string;
  externalId?: string;
  platform?: string;
  source_platform?: string;
  title?: string;
  caption?: string;
  imageUrl?: string;
  image_url?: string;
  permalink?: string;
  source_url?: string;
  likes: number;
  comments: number;
  author?: string;
  channel?: string;
  publishedAt?: string;
  published_at?: string;
  viralScore?: number;
  viral_score?: number;
  viralRating?: string;
  viral_label?: string;
  is_carousel?: boolean;
}

export interface VisionAnalysis {
  ocr?: { extracted_text?: string; hook_phrase?: string; has_text?: boolean };
  ocr_text?: string;
  art_style_analysis?: { medium?: string; exact_technique?: string; is_illustration?: boolean };
  subject_and_archetype?: { central_character?: string; action_and_pose?: string; key_symbols?: string[] };
  dominant_topic?: string;
  composition?: { layout_type?: string; element_distribution?: string; visual_hierarchy?: string };
  composition_analysis?: string;
  design?: { color_palette?: string[]; art_style?: string; lighting?: string };
  design_palette?: string[];
  marketing_psychology?: { core_subject?: string; viral_hook_reason?: string; dominant_emotion?: string };
  viral_psychology_hook?: string;
  creative_remix_proposal?: { new_improved_phrase?: string; essence_description_pt?: string; prompt_image_en?: string };
  recreation_concept?: string;
  suggested_format?: string;
  confidence_score?: number;
}

export interface RecreatedViralPost {
  id?: number;
  recreated_image_url: string;
  original_image_url?: string;
  source_platform?: string;
  format?: string;
  caption: string;
  hashtags: string[];
  title?: string;
  call_to_action?: string;
  visual_style?: string;
  status?: string;
  created_at?: string;
}

interface ViralImageRadarProps {
  accounts: any[];
  selectedExamples?: any[];
  onToggleExample?: (item: any) => void;
  onClearExamples?: () => void;
  onOpenAutopilot?: () => void;
}

const fmt = (n: number) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

const IMAGE_VISUAL_STYLES = [
  { id: 'sem_estilo', label: 'Estilo Original / Sem estilo fixo (Preserva a Essência e Técnica da Arte)' },
  { id: 'umbanda_cuiaba', label: 'Card com Frase Embutida (Folha Rasgada)' },
  { id: 'card_clean_moderno', label: 'Card Clean Minimalista' },
  { id: 'fotografia_realista', label: 'Fotografia Realista & Profissional' },
  { id: 'vintage_engraving', label: 'Gravura Histórica / Vintage' },
  { id: 'dark_moody_contraste', label: 'Dark / Moody Alto Contraste' },
  { id: 'ilustracao_espiritual', label: 'Ilustração Artística Espiritual' }
];

export const ViralImageRadar: React.FC<ViralImageRadarProps> = ({
  accounts,
  selectedExamples = [],
  onToggleExample,
  onClearExamples,
  onOpenAutopilot
}) => {
  const isExampleSelected = (it: any) => {
    if (!selectedExamples || selectedExamples.length === 0) return false;
    const rawKey = it.imageUrl || it.image_url || it.id || it.externalId || it.permalink;
    return selectedExamples.some(e => (e.imageUrl || e.image_url || e.id || e.externalId || e.permalink) === rawKey);
  };
  // Estado de busca
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'hashtag' | 'profile' | 'niche'>('hashtag');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [sources, setSources] = useState({
    instagram: true,
    reddit: true,
    pinterest: true
  });
  const [limit, setLimit] = useState(12);
  const [minLikes, setMinLikes] = useState(0);
  const [minComments, setMinComments] = useState(0);
  const [recentDays, setRecentDays] = useState(0);
  const [sortBy, setSortBy] = useState<'viral_score' | 'likes' | 'comments' | 'recent'>('viral_score');
  const [showFilters, setShowFilters] = useState(false);

  // Concorrentes e Tags da Página Conectada
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  const [detectedNiche, setDetectedNiche] = useState('');
  const [discoveredCompetitors, setDiscoveredCompetitors] = useState<Array<{
    username: string;
    name: string;
    seguidores?: string;
    engajamento?: string;
    foco?: string;
    motivo_sucesso?: string;
  }>>([]);
  const [discoveredTags, setDiscoveredTags] = useState<string[]>([]);

  // Busca e Autocomplete de Contas / Páginas com Digitação Instantânea
  const [accountSearchText, setAccountSearchText] = useState('');
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const accountComboboxRef = useRef<HTMLDivElement>(null);
  const [modalPageFilter, setModalPageFilter] = useState('');

  // Fechar dropdown de contas ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountComboboxRef.current && !accountComboboxRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Lista filtrada em tempo real conforme o usuário digita o início ou trecho do nome da página
  const filteredAccounts = (accounts || []).filter(acc => {
    if (!accountSearchText.trim()) return true;
    const term = accountSearchText.toLowerCase();
    const nameMatch = (acc.name || '').toLowerCase().includes(term);
    const userMatch = (acc.username || '').toLowerCase().includes(term);
    const platformMatch = (acc.platform || '').toLowerCase().includes(term);
    return nameMatch || userMatch || platformMatch;
  });

  // Estado dos resultados
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ViralImageItem[]>([]);
  const [notes, setNotes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  // Modal de Análise e Remodelagem
  const [modalItem, setModalItem] = useState<ViralImageItem | null>(null);
  const [visionAnalysis, setVisionAnalysis] = useState<VisionAnalysis | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);
  const [visionError, setVisionError] = useState('');

  // Remodelagem
  const [recreatedPost, setRecreatedPost] = useState<RecreatedViralPost | null>(null);
  const [recreateLoading, setRecreateLoading] = useState(false);
  const [recreateError, setRecreateError] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('sem_estilo');
  const [selectedFormat, setSelectedFormat] = useState<'4:5' | '1:1' | '9:16'>('4:5');
  const [editedCaption, setEditedCaption] = useState('');
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Publicação Direta
  const [publishTargetKey, setPublishTargetKey] = useState('');
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState('');
  const [publishError, setPublishError] = useState('');

  // Modal de Vinculação de Exemplo à Página Conectada
  const [assigningItem, setAssigningItem] = useState<any | null>(null);
  const [targetAccountKey, setTargetAccountKey] = useState<string>('');
  const [savingExampleLoading, setSavingExampleLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string>('');

  const getExampleTargetPage = (it: any) => {
    if (!selectedExamples || selectedExamples.length === 0 || !it) return null;
    const rawKey = it.imageUrl || it.image_url || it.id || it.externalId || it.permalink;
    const found = selectedExamples.find(
      (e: any) => (e.imageUrl || e.image_url || e.id || e.externalId || e.permalink) === rawKey
    );
    return found?.targetPage || null;
  };

  const handleOpenAssignModal = (it: any) => {
    const currentTarget = getExampleTargetPage(it);
    if (currentTarget?.id && currentTarget?.platform) {
      setTargetAccountKey(`${currentTarget.platform}:${currentTarget.id}`);
    } else if (selectedAccountId) {
      setTargetAccountKey(selectedAccountId);
    } else if (accounts && accounts.length > 0) {
      setTargetAccountKey(`${accounts[0].platform}:${accounts[0].id}`);
    } else {
      setTargetAccountKey('');
    }
    setAssigningItem(it);
  };

  const handleConfirmSaveExample = async () => {
    if (!assigningItem) return;
    if (!targetAccountKey) {
      setError('Selecione uma conta ou página para vincular o exemplo.');
      return;
    }

    const [platform, pageId] = targetAccountKey.split(':');
    const accObj = (accounts || []).find(a => `${a.platform}:${a.id}` === targetAccountKey);
    const pageName = accObj?.name || accObj?.username || 'Página Conectada';

    setSavingExampleLoading(true);
    try {
      const res = await api.post('/trends/images/examples', {
        pageId,
        pagePlatform: platform,
        pageName,
        item: assigningItem
      });

      const enrichedItem = {
        ...(res.data?.sanitizedItem || assigningItem),
        targetPage: {
          id: pageId,
          platform,
          name: pageName
        }
      };

      onToggleExample?.(enrichedItem);
      setToastMessage(`Post vinculado com sucesso à página "${pageName}"! O robô usará este exemplo.`);
      setTimeout(() => setToastMessage(''), 5000);
      setAssigningItem(null);
    } catch (err: any) {
      console.warn('[ViralImageRadar] Erro ao salvar exemplo na API:', err.message);
      onToggleExample?.({
        ...assigningItem,
        targetPage: {
          id: pageId,
          platform,
          name: pageName
        }
      });
      setToastMessage(`Exemplo salvo para a página "${pageName}"!`);
      setTimeout(() => setToastMessage(''), 5000);
      setAssigningItem(null);
    } finally {
      setSavingExampleLoading(false);
    }
  };

  const handleRemoveExample = async () => {
    if (!assigningItem) return;
    const currentTarget = getExampleTargetPage(assigningItem);
    const itemKey = assigningItem.imageUrl || assigningItem.image_url || assigningItem.id || assigningItem.externalId || assigningItem.permalink;

    setSavingExampleLoading(true);
    try {
      if (currentTarget?.id) {
        await api.delete('/trends/images/examples', {
          data: {
            pageId: currentTarget.id,
            itemKey
          }
        });
      }
    } catch (err: any) {
      console.warn('[ViralImageRadar] Erro ao remover exemplo da API:', err.message);
    } finally {
      onToggleExample?.(assigningItem);
      setToastMessage('Exemplo desvinculado com sucesso.');
      setTimeout(() => setToastMessage(''), 4000);
      setSavingExampleLoading(false);
      setAssigningItem(null);
    }
  };

  const handleSelectAccount = async (accIdOrKey: string) => {
    setSelectedAccountId(accIdOrKey);
    if (!accIdOrKey) {
      setAccountSearchText('');
      setDiscoveredCompetitors([]);
      setDetectedNiche('');
      setDiscoveredTags([]);
      return;
    }
    const acc = accounts.find(a => `${a.platform}:${a.id}` === accIdOrKey || String(a.id) === accIdOrKey);
    if (acc) {
      setAccountSearchText(`${acc.platform.toUpperCase()} — ${acc.name}`);
      await fetchCompetitorsAndTagsForPage(acc);
    }
  };

  const fetchCompetitorsAndTagsForPage = async (acc: any) => {
    setCompetitorsLoading(true);
    setError('');
    try {
      const res = await api.post('/trends/discover-competitors', {
        pageId: String(acc.id),
        name: acc.name,
        username: acc.username,
        platform: acc.platform,
        instagramAccountId: acc.platform === 'instagram' ? acc.id : undefined
      });
      if (res.data?.success) {
        setDetectedNiche(res.data.nicho || '');
        setDiscoveredCompetitors(res.data.concorrentes || []);
        const tags = res.data.top_hashtags || [];
        setDiscoveredTags(tags);
        const bestQuery = tags[0] || res.data.nicho || acc.name;
        if (bestQuery) {
          setQuery(bestQuery);
          // Já dispara a busca com a tag extraída dos posts da página!
          executeSearchWithCustomQuery(bestQuery, acc);
        }
      }
    } catch (err: any) {
      console.warn('[ViralImageRadar] Falha ao descobrir concorrentes:', err.message);
    } finally {
      setCompetitorsLoading(false);
    }
  };

  const executeSearchWithCustomQuery = async (customQ: string, accOverride?: any) => {
    const activeSources = Object.entries(sources)
      .filter(([_, active]) => active)
      .map(([s]) => s)
      .join(',');

    const acc = accOverride || accounts.find(a => `${a.platform}:${a.id}` === selectedAccountId || String(a.id) === selectedAccountId);

    setLoading(true);
    setError('');
    setNotes([]);

    try {
      const res = await api.get('/trends/images/search', {
        params: {
          q: customQ,
          mode: mode === 'profile' ? 'profile' : (mode === 'niche' ? 'niche' : 'hashtag'),
          sources: activeSources || 'instagram,reddit',
          limit,
          minLikes,
          minComments,
          recentDays,
          sortBy,
          pageId: acc?.id || undefined,
          pageName: acc?.name || undefined,
          pagePlatform: acc?.platform || undefined,
          pageUsername: acc?.username || undefined,
          instagramAccountId: acc?.platform === 'instagram' ? acc.id : undefined
        }
      });

      if (res.data?.success) {
        setItems(res.data.items || []);
        setNotes(res.data.notes || []);
        setSearched(true);
        if (res.data.resolvedQuery && !query) setQuery(res.data.resolvedQuery);
      } else {
        setError(res.data?.error || 'Erro ao buscar imagens virais.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    let q = query.trim();
    const selAcc = accounts.find(a => `${a.platform}:${a.id}` === selectedAccountId || String(a.id) === selectedAccountId);

    if (mode === 'niche') {
      if (!selectedAccountId && !selAcc) {
        setError('Selecione uma conta conectada para buscar pelo nicho da página.');
        return;
      }
      if (!q && discoveredTags.length > 0) {
        q = discoveredTags[0];
      } else if (!q && detectedNiche) {
        q = detectedNiche;
      } else if (!q && selAcc?.name) {
        q = selAcc.name;
      }
    } else if (mode === 'profile') {
      if (!q) {
        setError('Informe o perfil ou concorrente a ser analisado (ex: @concorrente).');
        return;
      }
    } else {
      if (!q && !selAcc) {
        setError('Informe uma hashtag ou palavra-chave de pesquisa (ex: #umbanda).');
        return;
      }
    }

    await executeSearchWithCustomQuery(q, selAcc);
  };

  const openItemModal = (item: ViralImageItem) => {
    setModalItem(item);
    setVisionAnalysis(null);
    setRecreatedPost(null);
    setVisionError('');
    setRecreateError('');
    setPublishSuccess('');
    setPublishError('');
    setEditedCaption('');
    // Inicia análise visual automaticamente
    handleAnalyzeVision(item);
  };

  const handleAnalyzeVision = async (item: ViralImageItem) => {
    setVisionLoading(true);
    setVisionError('');
    try {
      const rawUrl = item.imageUrl || item.image_url || '';
      const rawTitle = item.title || item.caption || '';
      const res = await api.post('/trends/images/analyze', {
        item,
        imageUrl: rawUrl,
        title: rawTitle
      });
      if (res.data?.success && res.data.analysis) {
        setVisionAnalysis(res.data.analysis);
      } else {
        setVisionError(res.data?.error || 'Não foi possível analisar a imagem com visão computacional.');
      }
    } catch (err: any) {
      setVisionError(err.response?.data?.error || err.message || 'Falha ao analisar imagem.');
    } finally {
      setVisionLoading(false);
    }
  };

  const handleRecreateImage = async () => {
    if (!modalItem) return;
    setRecreateLoading(true);
    setRecreateError('');
    setPublishSuccess('');
    setPublishError('');

    try {
      const [selPlatform, selAccId] = publishTargetKey ? publishTargetKey.split(':') : ['', ''];
      const rawUrl = modalItem.imageUrl || modalItem.image_url || '';
      const rawTitle = modalItem.title || modalItem.caption || '';

      const res = await api.post('/trends/images/recreate', {
        item: modalItem,
        referenceImageUrl: rawUrl,
        referenceTitle: rawTitle,
        visionAnalysis,
        analysis: visionAnalysis,
        visualStyle: selectedStyle,
        format: selectedFormat,
        accountId: selAccId || undefined,
        targetPlatform: selPlatform || undefined
      });

      const postData = res.data?.post || (res.data?.recreated ? {
        id: res.data.id,
        recreated_image_url: res.data.recreated.imageUrl,
        caption: res.data.recreated.caption,
        hashtags: res.data.recreated.hashtags,
        format: res.data.recreated.format,
        style: res.data.recreated.style
      } : null);

      if (res.data?.success && postData) {
        setRecreatedPost(postData);
        setEditedCaption(postData.caption || '');
      } else {
        setRecreateError(res.data?.error || 'Erro ao recriar imagem viral.');
      }
    } catch (err: any) {
      setRecreateError(err.response?.data?.error || err.message || 'Falha na recriação com IA.');
    } finally {
      setRecreateLoading(false);
    }
  };

  const handlePublishNow = async () => {
    if (!recreatedPost?.id && !recreatedPost?.recreated_image_url) {
      setPublishError('Gere a imagem original antes de publicar.');
      return;
    }
    if (!publishTargetKey) {
      setPublishError('Escolha a página de destino (Facebook ou Instagram) para publicar.');
      return;
    }

    const [platform, accId] = publishTargetKey.split(':');
    setPublishLoading(true);
    setPublishError('');
    setPublishSuccess('');

    try {
      const res = await api.post('/trends/images/publish', {
        recreatedPostId: recreatedPost.id,
        accountId: accId,
        targetPlatform: platform
      });

      if (res.data?.success) {
        setPublishSuccess(`Post publicado com sucesso! ${res.data.postUrl ? `Link: ${res.data.postUrl}` : ''}`);
      } else {
        setPublishError(res.data?.error || 'Erro ao publicar post.');
      }
    } catch (err: any) {
      setPublishError(err.response?.data?.error || err.message || 'Falha ao enviar para a rede social.');
    } finally {
      setPublishLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  const getPlatformBadge = (platform: string) => {
    if (platform === 'instagram') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-pink-50 text-pink-700 border border-pink-200">
          <Instagram size={11} /> Instagram
        </span>
      );
    }
    if (platform === 'reddit') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
          <MessageSquare size={11} /> Reddit
        </span>
      );
    }
    if (platform === 'pinterest') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200">
          <ImageIcon size={11} /> Pinterest
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700">
        {platform}
      </span>
    );
  };

  const resolveImageUrl = (url?: string) => {
    if (!url) return '';
    // Se for URL externa com bloqueio de CORS / hotlink (Instagram, Facebook, Reddit), usa o proxy transparente do backend
    if (url.includes('cdninstagram.com') || url.includes('fbcdn.net') || url.includes('redd.it')) {
      return `/api/trends/images/proxy?url=${encodeURIComponent(url)}`;
    }
    return url;
  };

  const getViralBadge = (score?: number) => {
    const s = Math.round(Number(score) || 0);
    if (s >= 85) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500 text-white shadow-sm">
          <Flame size={12} className="animate-pulse" /> {s}/100 Super Viral
        </span>
      );
    }
    if (s >= 70) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-600 text-white shadow-sm">
          <Zap size={12} /> {s}/100 Alto Potencial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-800">
        <TrendingUp size={12} /> {s}/100 Em Alta
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* CARD DE BUSCA DE IMAGENS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-emerald-500 flex items-center justify-center text-white shadow-md">
              <ImageIcon size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Radar de Imagens Virais</h2>
              <p className="text-xs text-slate-500">
                Encontre publicações visuais com alta taxa de engajamento, analise padrões e recrie posts com IA.
              </p>
            </div>
          </div>
          {onOpenAutopilot && (
            <button
              onClick={onOpenAutopilot}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
            >
              <Sparkles size={14} /> Piloto Automático 24h
            </button>
          )}
        </div>

        {/* Modos de Busca */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={() => setMode('hashtag')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              mode === 'hashtag'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Target size={14} /> Hashtags / Palavra-chave
          </button>
          <button
            onClick={() => setMode('profile')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              mode === 'profile'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <AtSign size={14} /> Perfil / Concorrente
          </button>
          <button
            onClick={() => {
              setMode('niche');
              if (selectedAccountId) {
                const acc = accounts.find(a => `${a.platform}:${a.id}` === selectedAccountId || String(a.id) === selectedAccountId);
                if (acc) setAccountSearchText(`${acc.platform.toUpperCase()} — ${acc.name}`);
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
              mode === 'niche'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Users size={14} /> Nicho da Conta Conectada
          </button>
        </div>

        {/* Input Principal */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-4">
          <div className="md:col-span-8 relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none" />
            {mode === 'niche' ? (
              <div ref={accountComboboxRef} className="relative w-full">
                <input
                  type="text"
                  value={accountSearchText}
                  onChange={e => {
                    setAccountSearchText(e.target.value);
                    setAccountDropdownOpen(true);
                  }}
                  onFocus={() => {
                    setAccountDropdownOpen(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (filteredAccounts.length > 0) {
                        const target = filteredAccounts[0];
                        handleSelectAccount(`${target.platform}:${target.id}`);
                        setAccountSearchText(`${target.platform.toUpperCase()} — ${target.name}`);
                        setAccountDropdownOpen(false);
                      }
                    } else if (e.key === 'Escape') {
                      setAccountDropdownOpen(false);
                    }
                  }}
                  placeholder="Digite o início do nome da página (ex: Zé Pilintra, Terreiro, Macrame)..."
                  className="w-full pl-10 pr-20 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-xs"
                />

                {/* Botões de Ação na Direita do Input */}
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1 text-slate-400">
                  {selectedAccountId && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedAccountId('');
                        setAccountSearchText('');
                        setDiscoveredCompetitors([]);
                        setDetectedNiche('');
                        setDiscoveredTags([]);
                      }}
                      className="p-1 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors"
                      title="Limpar seleção"
                    >
                      <X size={15} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAccountDropdownOpen(!accountDropdownOpen)}
                    className="p-1 hover:text-slate-600 rounded-lg transition-colors"
                    title={accountDropdownOpen ? 'Fechar lista' : 'Ver todas as páginas'}
                  >
                    <ChevronDown
                      size={16}
                      className={`transition-transform duration-200 ${accountDropdownOpen ? 'rotate-180 text-indigo-600' : ''}`}
                    />
                  </button>
                </div>

                {/* Dropdown com Lista Filtrada em Tempo Real */}
                {accountDropdownOpen && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 max-h-72 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-2.5 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3.5 bg-slate-50/70">
                      <span>Páginas Encontradas ({filteredAccounts.length})</span>
                      <span className="text-[10px] text-indigo-600 font-semibold lowercase">
                        enter seleciona a 1ª
                      </span>
                    </div>

                    {filteredAccounts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 font-medium">
                        Nenhuma página encontrada com "{accountSearchText}".
                      </div>
                    ) : (
                      <div className="p-1.5 space-y-0.5">
                        {filteredAccounts.map(acc => {
                          const isCurrent =
                            selectedAccountId === `${acc.platform}:${acc.id}` ||
                            selectedAccountId === String(acc.id);
                          return (
                            <button
                              key={`${acc.platform}:${acc.id}`}
                              type="button"
                              onClick={() => {
                                handleSelectAccount(`${acc.platform}:${acc.id}`);
                                setAccountSearchText(`${acc.platform.toUpperCase()} — ${acc.name}`);
                                setAccountDropdownOpen(false);
                              }}
                              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-left transition-colors ${
                                isCurrent
                                  ? 'bg-indigo-50 text-indigo-700 font-black'
                                  : 'text-slate-700 hover:bg-slate-100'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {acc.platform === 'facebook' ? (
                                  <Facebook size={15} className="text-blue-600 shrink-0" />
                                ) : (
                                  <Instagram size={15} className="text-pink-600 shrink-0" />
                                )}
                                <span className="truncate">
                                  <strong className="text-slate-400 uppercase text-[10px] mr-1.5 font-bold">
                                    {acc.platform}
                                  </strong>
                                  {acc.name}
                                </span>
                              </div>
                              {acc.username && (
                                <span className="text-[11px] text-slate-400 font-medium shrink-0 ml-2">
                                  @{acc.username}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder={
                  mode === 'profile'
                    ? 'Digite o @ do perfil ou concorrente (ex: @concorrente)'
                    : 'Digite a hashtag ou tema (ex: #umbanda, frases motivacionais, culinaria)'
                }
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            )}
          </div>

          <div className="md:col-span-4 flex items-center gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                showFilters ? 'bg-slate-100 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter size={14} /> Filtros
            </button>

            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-200 disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              {loading ? 'Buscando...' : 'Buscar Imagens'}
            </button>
          </div>
        </div>

        {/* Toggles de Plataformas */}
        <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-100 text-xs">
          <span className="font-bold text-slate-500">Plataformas:</span>
          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={sources.instagram}
              onChange={e => setSources(s => ({ ...s, instagram: e.target.checked }))}
              className="accent-indigo-600 w-4 h-4 rounded"
            />
            <Instagram size={13} className="text-pink-600" /> Instagram
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={sources.reddit}
              onChange={e => setSources(s => ({ ...s, reddit: e.target.checked }))}
              className="accent-indigo-600 w-4 h-4 rounded"
            />
            <MessageSquare size={13} className="text-orange-600" /> Reddit
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700">
            <input
              type="checkbox"
              checked={sources.pinterest}
              onChange={e => setSources(s => ({ ...s, pinterest: e.target.checked }))}
              className="accent-indigo-600 w-4 h-4 rounded"
            />
            <ImageIcon size={13} className="text-red-600" /> Pinterest
          </label>
        </div>

        {/* Filtros Avançados */}
        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <label className="block font-bold text-slate-600 mb-1">Mínimo de Curtidas</label>
              <select
                value={minLikes}
                onChange={e => setMinLikes(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-700 outline-none"
              >
                <option value={0}>Qualquer quantia</option>
                <option value={50}>50+ curtidas</option>
                <option value={200}>200+ curtidas</option>
                <option value={1000}>1.000+ curtidas</option>
                <option value={5000}>5.000+ curtidas</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Mínimo de Comentários</label>
              <select
                value={minComments}
                onChange={e => setMinComments(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-700 outline-none"
              >
                <option value={0}>Qualquer quantia</option>
                <option value={10}>10+ comentários</option>
                <option value={30}>30+ comentários</option>
                <option value={100}>100+ comentários</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Período de Publicação</label>
              <select
                value={recentDays}
                onChange={e => setRecentDays(Number(e.target.value))}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-700 outline-none"
              >
                <option value={0}>Qualquer época</option>
                <option value={7}>Últimos 7 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-600 mb-1">Ordenar por</label>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="w-full bg-white border border-slate-200 rounded-lg p-2 font-semibold text-slate-700 outline-none"
              >
                <option value="viral_score">🔥 Viral Score (Maior)</option>
                <option value="likes">❤️ Mais Curtidas</option>
                <option value="comments">💬 Mais Comentários</option>
                <option value="recent">🕒 Mais Recentes</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {/* FEEDBACK: LENDO POSTS E BUSCANDO CONCORRENTES */}
      {competitorsLoading && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center gap-3 animate-pulse">
          <Loader2 size={20} className="animate-spin text-indigo-600 shrink-0" />
          <div>
            <p className="text-xs font-black text-indigo-950">
              Analisando últimos posts da página selecionada...
            </p>
            <p className="text-[11px] text-indigo-700">
              Extraindo hashtags reais e mapeando concorrentes diretos com alta taxa de engajamento no Instagram.
            </p>
          </div>
        </div>
      )}

      {/* PAINEL DE INTELIGÊNCIA COMPETITIVA & TAGS DA PÁGINA */}
      {discoveredCompetitors.length > 0 && (
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-md space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-400/30">
                  Nicho: {detectedNiche || 'Detectado'}
                </span>
                <span className="text-xs font-bold text-slate-300">
                  {discoveredCompetitors.length} Concorrentes Mapeados
                </span>
              </div>
              <h3 className="text-sm font-black text-white mt-1">
                Concorrentes Diretos no Instagram & Tags Extraídas dos Posts
              </h3>
            </div>

            {/* Tags extraídas dos posts */}
            {discoveredTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="text-[11px] font-bold text-slate-400">Tags dos posts:</span>
                {discoveredTags.slice(0, 8).map((tag, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQuery(tag);
                      setMode('hashtag');
                      executeSearchWithCustomQuery(tag);
                    }}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/25 text-amber-300 border border-white/10 transition-colors"
                    title={`Buscar imagens da tag ${tag}`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Cards dos Concorrentes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {discoveredCompetitors.map((comp, idx) => (
              <div
                key={idx}
                className="bg-white/10 hover:bg-white/15 border border-white/10 rounded-xl p-3.5 transition-all flex flex-col justify-between space-y-2 group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-300 group-hover:text-amber-200">
                      {comp.username}
                    </span>
                    <span className="text-[10px] font-bold text-slate-300 bg-white/10 px-1.5 py-0.5 rounded">
                      {comp.seguidores || 'Alta Tração'}
                    </span>
                  </div>
                  <p className="text-[11px] font-bold text-slate-200 line-clamp-1 mt-0.5">
                    {comp.name}
                  </p>
                  {comp.motivo_sucesso && (
                    <p className="text-[10px] text-slate-300 leading-relaxed mt-1">
                      💡 {comp.motivo_sucesso}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMode('profile');
                    setQuery(comp.username);
                    executeSearchWithCustomQuery(comp.username);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-black transition-colors shadow-sm"
                >
                  <Search size={12} /> Rastrear Posts Virais de {comp.username}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NOTAS E AVISOS */}
      {notes.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
          {notes.map((n, i) => (
            <p key={i} className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
              <Info size={13} className="shrink-0 text-amber-600" /> {n}
            </p>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-xs font-bold">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* BARRA DE EXEMPLOS SELECIONADOS PARA O ROBÔ 24H */}
      {selectedExamples.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow-sm shrink-0">
              <Star size={20} className="fill-slate-950" />
            </div>
              <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-900">
                  {selectedExamples.length} {selectedExamples.length === 1 ? 'Exemplo de Referência selecionado' : 'Exemplos de Referência selecionados'}
                </h4>
                <span className="text-[10px] font-black bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
                  Robô 24h Guiado
                </span>
              </div>
              <p className="text-xs text-slate-600">
                O robô autônomo usará esses posts como padrão visual, gancho e tom de voz ao buscar e criar novos posts sozinho.
              </p>
              {/* Badges das páginas vinculadas aos exemplos */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {Array.from(new Set(selectedExamples.map(e => e.targetPage?.name || 'Não vinculado'))).map(pName => {
                  const count = selectedExamples.filter(e => (e.targetPage?.name || 'Não vinculado') === pName).length;
                  return (
                    <span
                      key={pName}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-black bg-white text-slate-800 border border-amber-300 shadow-2xs"
                    >
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      {pName}: <strong className="text-amber-950">{count} {count === 1 ? 'exemplo' : 'exemplos'}</strong>
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onClearExamples && (
              <button
                type="button"
                onClick={onClearExamples}
                className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-white rounded-xl border border-slate-300 transition-colors"
              >
                Limpar seleção ({selectedExamples.length})
              </button>
            )}
            {onOpenAutopilot && (
              <button
                type="button"
                onClick={onOpenAutopilot}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black shadow-md transition-all"
              >
                <Sparkles size={14} className="text-amber-400" />
                Ativar Robô com esses Exemplos
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* GRID DE RESULTADOS */}
      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Flame size={16} className="text-orange-500" />
              {items.length} Imagens Virais Encontradas
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              Marque ⭐ para o Robô aprender ou clique em "Analisar com IA".
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((it, idx) => {
              const rawImg = it.imageUrl || it.image_url || '';
              const cardScore = it.viralScore ?? it.viral_score ?? 0;
              const cardPlatform = it.platform || it.source_platform || 'web';
              const cardCaption = it.caption || it.title || '';
              const cardAuthor = it.author || it.channel || '';
              const cardUrl = it.source_url || it.permalink || '#';
              const isSelected = isExampleSelected(it);

              return (
                <div
                  key={`${cardPlatform}:${it.id || it.source_id || idx}:${idx}`}
                  className={`group bg-white border ${
                    isSelected
                      ? 'border-amber-400 ring-2 ring-amber-300/80 shadow-md bg-amber-50/10'
                      : 'border-slate-200 hover:border-indigo-400'
                  } rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col`}
                >
                  {/* Imagem de Capa */}
                  <div className="relative aspect-[4/5] bg-slate-100 overflow-hidden flex items-center justify-center">
                    {rawImg ? (
                      <img
                        src={resolveImageUrl(rawImg)}
                        alt={cardCaption || 'Imagem viral'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (!img.dataset.proxied && rawImg) {
                            img.dataset.proxied = 'true';
                            img.src = `/api/trends/images/proxy?url=${encodeURIComponent(rawImg)}`;
                          }
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300 gap-1">
                        <ImageIcon size={32} />
                        <span className="text-[10px] font-bold">Sem prévia</span>
                      </div>
                    )}

                    {/* Botão de Exemplo para o Robô */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenAssignModal(it);
                      }}
                      className={`absolute top-2.5 left-2.5 z-10 px-2.5 py-1.5 rounded-xl backdrop-blur-md transition-all shadow-md flex items-center gap-1.5 text-[11px] font-black ${
                        isSelected
                          ? 'bg-amber-400 text-slate-950 ring-2 ring-amber-300'
                          : 'bg-black/60 hover:bg-black/80 text-white hover:text-amber-300'
                      }`}
                      title={isSelected ? `Exemplo ativo para ${getExampleTargetPage(it)?.name || 'Robô'} (Clique para alterar página ou remover)` : 'Vincular a uma página para guiar o Robô 24h'}
                    >
                      <Star size={13} className={isSelected ? 'fill-slate-950 text-slate-950' : 'text-amber-400'} />
                      <span className="max-w-[120px] truncate">
                        {isSelected
                          ? (getExampleTargetPage(it)?.name ? getExampleTargetPage(it)!.name : 'Exemplo Ativo')
                          : 'Exemplo'}
                      </span>
                    </button>

                    {/* Badges Flutuantes */}
                    <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5">
                      {getPlatformBadge(cardPlatform)}
                    </div>
                    <div className="absolute bottom-2.5 left-2.5">
                      {getViralBadge(cardScore)}
                    </div>
                    {it.is_carousel && (
                      <div className="absolute bottom-2.5 right-2.5 bg-black/70 backdrop-blur-sm text-white px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1">
                        <Layers size={10} /> Carrossel
                      </div>
                    )}
                  </div>

                  {/* Dados e Métricas */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-2">
                        <span className="flex items-center gap-1 text-red-600">
                          <ThumbsUp size={13} /> {fmt(it.likes)}
                        </span>
                        <span className="flex items-center gap-1 text-slate-600">
                          <MessageCircle size={13} /> {fmt(it.comments)}
                        </span>
                        {cardAuthor && (
                          <span className="text-[11px] text-slate-400 truncate max-w-[90px]">
                            @{cardAuthor}
                          </span>
                        )}
                      </div>

                      {cardCaption && (
                        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
                          {cardCaption}
                        </p>
                      )}
                    </div>

                    {/* Ações */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        onClick={() => openItemModal(it)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-sm transition-colors"
                      >
                        <Sparkles size={13} /> Analisar & Recriar
                      </button>
                      <a
                        href={cardUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors shrink-0"
                        title="Ver original"
                      >
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {searched && items.length === 0 && !loading && !error && (
        <div className="text-center py-16 text-slate-400 bg-white rounded-2xl border border-slate-200">
          <ImageIcon size={44} className="mx-auto mb-3 opacity-30 text-slate-500" />
          <p className="font-bold text-slate-700">Nenhuma imagem viral encontrada com os filtros atuais.</p>
          <p className="text-xs text-slate-500 mt-1">
            Experimente reduzir o mínimo de curtidas ou buscar por outro termo.
          </p>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL DE ANÁLISE VISUAL E RECRIAÇÃO CRIATIVA COM IA       */}
      {/* ========================================================= */}
      {modalItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
            {/* Cabeçalho do Modal */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow">
                  <Wand2 size={16} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Viral Creative Studio — Análise & Recriação</h3>
                  <p className="text-[11px] text-slate-500">
                    Visão Computacional Multimodal (OCR + Composição) e Geração de Conteúdo Original
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalItem(null)}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo do Modal (2 Colunas: Análise da Referência | Criação Original) */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* COLUNA ESQUERDA: Referência & Relatório de Visão (5 cols) */}
              <div className="lg:col-span-5 space-y-4">
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      Referência Viral
                    </span>
                    {getViralBadge(modalItem.viralScore ?? modalItem.viral_score)}
                  </div>
                  <div className="aspect-[4/5] rounded-lg overflow-hidden bg-slate-900 max-h-72 flex items-center justify-center">
                    {modalItem.imageUrl || modalItem.image_url ? (
                      <img
                        src={resolveImageUrl(modalItem.imageUrl || modalItem.image_url)}
                        alt="Referência viral"
                        className="w-full h-full object-contain"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const raw = modalItem.imageUrl || modalItem.image_url;
                          if (!img.dataset.proxied && raw) {
                            img.dataset.proxied = 'true';
                            img.src = `/api/trends/images/proxy?url=${encodeURIComponent(raw)}`;
                          }
                        }}
                      />
                    ) : (
                      <ImageIcon size={32} className="text-slate-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <ThumbsUp size={12} className="text-red-500" /> {fmt(modalItem.likes)} curtidas
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={12} /> {fmt(modalItem.comments)} comentários
                    </span>
                    <a
                      href={modalItem.source_url || modalItem.permalink || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <ExternalLink size={11} /> Link original
                    </a>
                  </div>

                  {/* Botão de Exemplo no Modal */}
                  <button
                    type="button"
                    onClick={() => handleOpenAssignModal(modalItem)}
                    className={`w-full mt-3 py-2 px-3 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
                      isExampleSelected(modalItem)
                        ? 'bg-amber-400 text-slate-950 shadow-sm ring-2 ring-amber-300'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    <Star size={14} className={isExampleSelected(modalItem) ? 'fill-slate-950 text-slate-950' : 'text-amber-500'} />
                    {isExampleSelected(modalItem)
                      ? `✓ Exemplo Ativo para "${getExampleTargetPage(modalItem)?.name || 'Robô'}" (Alterar ou Remover)`
                      : '⭐ Salvar este Post como Exemplo para o Robô 24h'}
                  </button>
                </div>

                {/* Relatório da Visão Computacional */}
                <div className="space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" /> Relatório de Visão Computacional
                  </h4>

                  {visionLoading && (
                    <div className="flex items-center justify-center gap-2 py-8 text-slate-400 bg-slate-50 rounded-xl border border-slate-100">
                      <Loader2 size={18} className="animate-spin text-indigo-600" />
                      <span className="text-xs font-bold">Lendo composição, OCR e psicologia visual...</span>
                    </div>
                  )}

                  {visionError && (
                    <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-semibold">
                      {visionError}
                    </div>
                  )}

                  {visionAnalysis && (
                    <div className="space-y-2.5 text-xs">
                      {/* Arquétipo / Personagem Central */}
                      {(visionAnalysis.subject_and_archetype?.central_character || visionAnalysis.marketing_psychology?.core_subject) && (
                        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl">
                          <p className="font-black text-amber-900 mb-1 flex items-center gap-1.5">
                            <Star size={13} className="fill-amber-500 text-amber-600" />
                            Personagem / Arquétipo Central:
                          </p>
                          <p className="text-amber-950 font-bold">
                            {visionAnalysis.subject_and_archetype?.central_character || visionAnalysis.marketing_psychology?.core_subject}
                          </p>
                          {visionAnalysis.subject_and_archetype?.action_and_pose && (
                            <p className="text-amber-800 text-[11px] mt-0.5">
                              {visionAnalysis.subject_and_archetype.action_and_pose}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Estilo Artístico e Técnica */}
                      {(visionAnalysis.art_style_analysis?.medium || visionAnalysis.design?.art_style) && (
                        <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl">
                          <p className="font-black text-indigo-950 mb-1">🎨 Estilo Artístico Preservado:</p>
                          <p className="text-indigo-900 font-bold">
                            {visionAnalysis.art_style_analysis?.medium || visionAnalysis.design?.art_style}
                          </p>
                          {visionAnalysis.art_style_analysis?.exact_technique && (
                            <p className="text-indigo-800 text-[11px] mt-0.5">
                              Técnica: {visionAnalysis.art_style_analysis.exact_technique}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Símbolos Marcantes */}
                      {visionAnalysis.subject_and_archetype?.key_symbols && visionAnalysis.subject_and_archetype.key_symbols.length > 0 && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="font-black text-slate-700 mb-1 text-[11px]">✨ Símbolos Marcantes:</p>
                          <div className="flex flex-wrap gap-1">
                            {visionAnalysis.subject_and_archetype.key_symbols.map((sym, idx) => (
                              <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white border border-slate-200 text-slate-700">
                                {sym}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Proposta da Nova Arte */}
                      {visionAnalysis.creative_remix_proposal?.essence_description_pt && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                          <p className="font-black text-emerald-950 mb-1">🌱 Essência da Nova Arte:</p>
                          <p className="text-emerald-900 leading-relaxed text-[11px]">
                            {visionAnalysis.creative_remix_proposal.essence_description_pt}
                          </p>
                        </div>
                      )}

                      {/* OCR Texto */}
                      {(visionAnalysis.ocr?.extracted_text || visionAnalysis.ocr_text) && (
                        <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="font-bold text-slate-700 mb-0.5 text-[11px]">📝 Texto Lido na Imagem:</p>
                          <p className="text-slate-600 italic text-[11px]">"{visionAnalysis.ocr?.extracted_text || visionAnalysis.ocr_text}"</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* COLUNA DIREITA: Recriação com IA, Editor e Publicação (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Opções de Geração */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Configurações da Nova Arte
                    </span>
                    <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Sem cópia — 100% Original
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Estilo Visual da Marca</label>
                      <select
                        value={selectedStyle}
                        onChange={e => setSelectedStyle(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs font-semibold text-slate-800 outline-none"
                      >
                        {IMAGE_VISUAL_STYLES.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1">Formato da Imagem</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => setSelectedFormat('4:5')}
                          className={`py-1.5 text-[11px] font-bold rounded-lg border text-center transition-colors ${
                            selectedFormat === '4:5'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Vertical 4:5
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFormat('1:1')}
                          className={`py-1.5 text-[11px] font-bold rounded-lg border text-center transition-colors ${
                            selectedFormat === '1:1'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Quadrado 1:1
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedFormat('9:16')}
                          className={`py-1.5 text-[11px] font-bold rounded-lg border text-center transition-colors ${
                            selectedFormat === '9:16'
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-200'
                          }`}
                        >
                          Story 9:16
                        </button>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleRecreateImage}
                    disabled={recreateLoading || visionLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-emerald-600 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 hover:opacity-95 disabled:opacity-50 transition-all"
                  >
                    {recreateLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : visionLoading ? (
                      <Loader2 size={16} className="animate-spin text-amber-300" />
                    ) : (
                      <Wand2 size={16} />
                    )}
                    {recreateLoading
                      ? 'Traduzindo conceito e gerando nova arte original...'
                      : visionLoading
                      ? 'Analisando essência da arte de referência...'
                      : recreatedPost
                      ? 'Gerar Nova Variação com IA'
                      : 'Recriar Imagem com a Mesma Essência'}
                  </button>
                </div>

                {recreateError && (
                  <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
                    {recreateError}
                  </div>
                )}

                {/* Resultado da Nova Arte */}
                {recreatedPost && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600" /> Nova Arte Gerada
                      </span>
                      <a
                        href={recreatedPost.recreated_image_url}
                        download="post_viral_recreated.png"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1"
                      >
                        <Download size={13} /> Baixar
                      </a>
                    </div>

                    <div className="aspect-[4/5] rounded-xl overflow-hidden bg-slate-900 max-h-80 mx-auto flex items-center justify-center shadow-md">
                      <img
                        src={recreatedPost.recreated_image_url}
                        alt="Arte original gerada"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Editor de Legenda */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-black uppercase tracking-wider text-slate-600">
                          Legenda Otimizada & Hashtags
                        </label>
                        <button
                          onClick={() => copyToClipboard(editedCaption)}
                          className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                        >
                          {copiedCaption ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar</>}
                        </button>
                      </div>
                      <textarea
                        value={editedCaption}
                        onChange={e => setEditedCaption(e.target.value)}
                        rows={5}
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs text-slate-800 font-medium outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
                      />
                    </div>

                    {/* Área de Publicação Direta */}
                    <div className="pt-3 border-t border-slate-200 space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Conta de Destino para Publicação
                        </label>
                        <select
                          value={publishTargetKey}
                          onChange={e => setPublishTargetKey(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="">Selecione a página ou conta conectada...</option>
                          {accounts.map(acc => (
                            <option key={`${acc.platform}:${acc.id}`} value={`${acc.platform}:${acc.id}`}>
                              {acc.platform.toUpperCase()} — {acc.name} {acc.username ? `(@${acc.username})` : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {publishSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold">
                          {publishSuccess}
                        </div>
                      )}

                      {publishError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
                          {publishError}
                        </div>
                      )}

                      <button
                        onClick={handlePublishNow}
                        disabled={publishLoading || !publishTargetKey}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md shadow-emerald-100 disabled:opacity-50 transition-all"
                      >
                        {publishLoading ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Rocket size={16} />
                        )}
                        {publishLoading ? 'Publicando...' : 'Publicar Agora na Rede Social'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: SELECIONAR PÁGINA PARA VINCULAR O EXEMPLO          */}
      {/* ========================================================= */}
      {assigningItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center shadow-sm">
                  <Star size={18} className="fill-slate-950" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">Vincular Exemplo para o Robô 24h</h3>
                  <p className="text-[11px] text-slate-600">
                    Defina em qual página o robô autônomo usará este post como modelo
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAssigningItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Prévia do Post */}
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-14 h-14 rounded-lg bg-slate-200 overflow-hidden shrink-0">
                  <img
                    src={resolveImageUrl(assigningItem.imageUrl || assigningItem.image_url)}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-800 line-clamp-2">
                    {assigningItem.caption || assigningItem.title || 'Post Viral Selecionado'}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500 mt-1">
                    <span className="text-red-600 flex items-center gap-1">
                      <ThumbsUp size={11} /> {fmt(assigningItem.likes)}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={11} /> {fmt(assigningItem.comments)}
                    </span>
                    <span className="text-amber-700 font-black">
                      Score: {assigningItem.viralScore ?? assigningItem.viral_score ?? 80}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Atual se já vinculado */}
              {isExampleSelected(assigningItem) && getExampleTargetPage(assigningItem) && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                  <CheckCircle2 size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-black">Já vinculado atualmente à página:</span>
                    <p className="font-bold text-slate-900 mt-0.5">
                      {getExampleTargetPage(assigningItem)?.platform?.toUpperCase()} — {getExampleTargetPage(assigningItem)?.name}
                    </p>
                    <p className="text-[11px] text-amber-800 mt-1">
                      Você pode transferir este exemplo para outra página abaixo ou removê-lo.
                    </p>
                  </div>
                </div>
              )}

              {/* Seleção da Página */}
              <div>
                <label className="block text-xs font-black text-slate-800 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-500" />
                    Para qual Página / Conta você deseja direcionar este exemplo?
                  </span>
                  {targetAccountKey && (
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                      1 Selecionada
                    </span>
                  )}
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={modalPageFilter}
                      onChange={(e) => setModalPageFilter(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const matches = (accounts || []).filter(acc => {
                            if (!modalPageFilter.trim()) return true;
                            const t = modalPageFilter.toLowerCase();
                            return (acc.name || '').toLowerCase().includes(t) || (acc.username || '').toLowerCase().includes(t) || (acc.platform || '').toLowerCase().includes(t);
                          });
                          if (matches.length > 0) {
                            setTargetAccountKey(`${matches[0].platform}:${matches[0].id}`);
                          }
                        }
                      }}
                      placeholder="Digite o início do nome da página (ex: Filhos, Zé, Terreiro)..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2.5 pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white transition-all shadow-xs"
                      autoFocus
                    />
                  </div>

                  {/* Lista de páginas com clique direto sem abrir o select nativo do navegador */}
                  <div className="border border-slate-200 rounded-xl max-h-52 overflow-y-auto bg-white p-1.5 space-y-1 divide-y divide-slate-50 shadow-inner">
                    {(accounts || [])
                      .filter(acc => {
                        if (!modalPageFilter.trim()) return true;
                        const t = modalPageFilter.toLowerCase();
                        return (acc.name || '').toLowerCase().includes(t) || (acc.username || '').toLowerCase().includes(t) || (acc.platform || '').toLowerCase().includes(t);
                      })
                      .map((acc) => {
                        const isSelected = targetAccountKey === `${acc.platform}:${acc.id}`;
                        return (
                          <button
                            key={`${acc.platform}:${acc.id}`}
                            type="button"
                            onClick={() => setTargetAccountKey(`${acc.platform}:${acc.id}`)}
                            className={`w-full flex items-center justify-between p-2 rounded-lg text-left text-xs transition-all ${
                              isSelected
                                ? 'bg-amber-500 text-white font-black shadow-xs'
                                : 'text-slate-700 hover:bg-slate-100 font-semibold'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {acc.platform === 'facebook' ? (
                                <Facebook size={14} className={isSelected ? 'text-white' : 'text-blue-600'} />
                              ) : (
                                <Instagram size={14} className={isSelected ? 'text-white' : 'text-pink-600'} />
                              )}
                              <span className="truncate">
                                <strong className={`uppercase text-[10px] mr-1.5 ${isSelected ? 'text-amber-100' : 'text-slate-400'}`}>
                                  {acc.platform}
                                </strong>
                                {acc.name || acc.username}
                              </span>
                            </div>
                            {isSelected ? (
                              <CheckCircle2 size={15} className="text-white shrink-0 ml-2" />
                            ) : acc.username ? (
                              <span className="text-[10px] text-slate-400 truncate ml-2">@{acc.username}</span>
                            ) : null}
                          </button>
                        );
                      })}
                    {(accounts || []).filter(acc => {
                      if (!modalPageFilter.trim()) return true;
                      const t = modalPageFilter.toLowerCase();
                      return (acc.name || '').toLowerCase().includes(t) || (acc.username || '').toLowerCase().includes(t) || (acc.platform || '').toLowerCase().includes(t);
                    }).length === 0 && (
                      <div className="p-3 text-center text-xs text-slate-400 font-medium">
                        Nenhuma página encontrada com "{modalPageFilter}".
                      </div>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  💡 Quando o Robô autônomo 24h rodar para esta página, ele analisará os exemplos vinculados a ela para saber exatamente o estilo visual, tema, cores e gancho que funcionam no seu público.
                </p>
              </div>
            </div>

            {/* Footer com Ações */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <div>
                {isExampleSelected(assigningItem) && (
                  <button
                    type="button"
                    disabled={savingExampleLoading}
                    onClick={handleRemoveExample}
                    className="px-3 py-2 text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-xl border border-red-200 transition-colors"
                  >
                    Remover dos Exemplos
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAssigningItem(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!targetAccountKey || savingExampleLoading}
                  onClick={handleConfirmSaveExample}
                  className="px-4 py-2 text-xs font-black bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {savingExampleLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" /> Salvando...
                    </>
                  ) : (
                    <>
                      <Check size={14} /> Salvar Exemplo para esta Página
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST FLUTUANTE DE SUCESSO */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white border border-amber-400 px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-in slide-in-from-top duration-300">
          <Star size={16} className="text-amber-400 fill-amber-400 shrink-0" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage('')} className="p-1 hover:bg-slate-800 rounded-lg ml-2">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
