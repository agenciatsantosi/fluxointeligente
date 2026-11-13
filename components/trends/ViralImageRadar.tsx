import React, { useState } from 'react';
import api from '../../services/api';
import {
  Search, Sparkles, ExternalLink, Loader2, RefreshCw, ArrowRight,
  TrendingUp, Wand2, Rocket, MessageSquare, Flame, AlertCircle, Copy, Check,
  Instagram, Facebook, Users, Image as ImageIcon, AtSign, Target,
  Filter, Zap, Info, ThumbsUp, MessageCircle, CheckCircle2, X, Share2, Layers, Download
} from 'lucide-react';

export interface ViralImageItem {
  source_platform: 'instagram' | 'reddit' | 'pinterest' | string;
  source_id: string;
  source_url: string;
  image_url: string;
  caption?: string;
  likes: number;
  comments: number;
  author?: string;
  published_at?: string;
  viral_score: number;
  viral_label?: string;
  is_carousel?: boolean;
}

export interface VisionAnalysis {
  ocr_text?: string;
  dominant_topic?: string;
  composition_analysis?: string;
  design_palette?: string[];
  viral_psychology_hook?: string;
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
  { id: 'umbanda_cuiaba', label: 'Card com Frase Embutida (Folha Rasgada)' },
  { id: 'card_clean_moderno', label: 'Card Clean Minimalista' },
  { id: 'fotografia_realista', label: 'Fotografia Realista & Profissional' },
  { id: 'vintage_engraving', label: 'Gravura Histórica / Vintage' },
  { id: 'dark_moody_contraste', label: 'Dark / Moody Alto Contraste' },
  { id: 'ilustracao_espiritual', label: 'Ilustração Artística Espiritual' }
];

export const ViralImageRadar: React.FC<ViralImageRadarProps> = ({ accounts, onOpenAutopilot }) => {
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
  const [selectedStyle, setSelectedStyle] = useState('umbanda_cuiaba');
  const [selectedFormat, setSelectedFormat] = useState<'4:5' | '1:1' | '9:16'>('4:5');
  const [editedCaption, setEditedCaption] = useState('');
  const [copiedCaption, setCopiedCaption] = useState(false);

  // Publicação Direta
  const [publishTargetKey, setPublishTargetKey] = useState('');
  const [publishLoading, setPublishLoading] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState('');
  const [publishError, setPublishError] = useState('');

  const handleSearch = async () => {
    const activeSources = Object.entries(sources)
      .filter(([_, active]) => active)
      .map(([s]) => s)
      .join(',');

    if (!activeSources) {
      setError('Selecione pelo menos uma plataforma para pesquisar.');
      return;
    }

    let q = query.trim();
    if (mode === 'niche') {
      if (!selectedAccountId) {
        setError('Selecione uma conta conectada para buscar pelo nicho da página.');
        return;
      }
      q = '';
    } else if (mode === 'profile') {
      if (!q) {
        setError('Informe o perfil ou concorrente a ser analisado (ex: @concorrente).');
        return;
      }
    } else {
      if (!q) {
        setError('Informe uma hashtag ou palavra-chave de pesquisa (ex: #umbanda).');
        return;
      }
    }

    setLoading(true);
    setError('');
    setNotes([]);

    try {
      const res = await api.get('/trends/images/search', {
        params: {
          q,
          mode,
          sources: activeSources,
          limit,
          minLikes,
          minComments,
          recentDays,
          sortBy,
          instagramAccountId: selectedAccountId || undefined
        }
      });

      if (res.data?.success) {
        setItems(res.data.items || []);
        setNotes(res.data.notes || []);
        setSearched(true);
      } else {
        setError(res.data?.error || 'Erro ao buscar imagens virais.');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Falha na conexão com o servidor.');
    } finally {
      setLoading(false);
    }
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
      const res = await api.post('/trends/images/analyze', { item });
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
      const res = await api.post('/trends/images/recreate', {
        item: modalItem,
        visionAnalysis,
        visualStyle: selectedStyle,
        format: selectedFormat,
        accountId: selAccId || undefined,
        targetPlatform: selPlatform || undefined
      });

      if (res.data?.success && res.data.post) {
        setRecreatedPost(res.data.post);
        setEditedCaption(res.data.post.caption || '');
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

  const getViralBadge = (score: number) => {
    if (score >= 85) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-500 text-white shadow-sm">
          <Flame size={12} className="animate-pulse" /> {score}/100 Super Viral
        </span>
      );
    }
    if (score >= 70) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-black bg-indigo-600 text-white shadow-sm">
          <Zap size={12} /> {score}/100 Alto Potencial
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-200 text-slate-800">
        <TrendingUp size={12} /> {score}/100 Em Alta
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
            onClick={() => setMode('niche')}
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
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            {mode === 'niche' ? (
              <select
                value={selectedAccountId}
                onChange={e => setSelectedAccountId(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Selecione uma conta para detectar o nicho...</option>
                {accounts.map(acc => (
                  <option key={`${acc.platform}:${acc.id}`} value={acc.id}>
                    {acc.platform.toUpperCase()} — {acc.name} {acc.username ? `(@${acc.username})` : ''}
                  </option>
                ))}
              </select>
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

      {/* GRID DE RESULTADOS */}
      {items.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
              <Flame size={16} className="text-orange-500" />
              {items.length} Imagens Virais Encontradas
            </h3>
            <span className="text-xs font-semibold text-slate-500">
              Clique em "Analisar com IA" para desconstruir e recriar o post.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.map((it, idx) => (
              <div
                key={`${it.source_platform}:${it.source_id}:${idx}`}
                className="group bg-white border border-slate-200 hover:border-indigo-400 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col"
              >
                {/* Imagem de Capa */}
                <div className="relative aspect-[4/5] bg-slate-100 overflow-hidden">
                  <img
                    src={it.image_url}
                    alt={it.caption || 'Imagem viral'}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {/* Badges Flutuantes */}
                  <div className="absolute top-2.5 left-2.5">
                    {getViralBadge(it.viral_score)}
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    {getPlatformBadge(it.source_platform)}
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
                      {it.author && (
                        <span className="text-[11px] text-slate-400 truncate max-w-[90px]">
                          @{it.author}
                        </span>
                      )}
                    </div>

                    {it.caption && (
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed mb-3">
                        {it.caption}
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
                      href={it.source_url}
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
            ))}
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
                    {getViralBadge(modalItem.viral_score)}
                  </div>
                  <div className="aspect-[4/5] rounded-lg overflow-hidden bg-slate-200 max-h-72 flex items-center justify-center">
                    <img
                      src={modalItem.image_url}
                      alt="Referência viral"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex items-center justify-between mt-2 text-xs font-bold text-slate-700">
                    <span className="flex items-center gap-1">
                      <ThumbsUp size={12} className="text-red-500" /> {fmt(modalItem.likes)} curtidas
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={12} /> {fmt(modalItem.comments)} comentários
                    </span>
                    <a
                      href={modalItem.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-600 hover:underline flex items-center gap-1 text-[11px]"
                    >
                      <ExternalLink size={11} /> Link original
                    </a>
                  </div>
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
                      {visionAnalysis.ocr_text && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="font-black text-slate-700 mb-1">📝 Texto Extraído na Imagem (OCR):</p>
                          <p className="text-slate-600 italic">"{visionAnalysis.ocr_text}"</p>
                        </div>
                      )}

                      {visionAnalysis.composition_analysis && (
                        <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl">
                          <p className="font-black text-indigo-900 mb-1">🎨 Composição & Design:</p>
                          <p className="text-indigo-800 leading-relaxed">{visionAnalysis.composition_analysis}</p>
                        </div>
                      )}

                      {visionAnalysis.design_palette && visionAnalysis.design_palette.length > 0 && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                          <p className="font-black text-slate-700 mb-1.5">🌈 Paleta de Cores Identificada:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {visionAnalysis.design_palette.map((color, idx) => (
                              <span
                                key={idx}
                                className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white border border-slate-200 text-slate-700"
                              >
                                {color}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {visionAnalysis.viral_psychology_hook && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                          <p className="font-black text-emerald-900 mb-1">🧠 Psicologia & Por Que Engajou:</p>
                          <p className="text-emerald-800 leading-relaxed">{visionAnalysis.viral_psychology_hook}</p>
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
                    disabled={recreateLoading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-indigo-600 to-emerald-600 text-white rounded-xl text-xs font-black shadow-md shadow-indigo-100 hover:opacity-95 disabled:opacity-50 transition-all"
                  >
                    {recreateLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Wand2 size={16} />
                    )}
                    {recreateLoading
                      ? 'Traduzindo conceito e gerando nova arte original...'
                      : recreatedPost
                      ? 'Gerar Nova Variação com IA'
                      : 'Recriar Imagem Original Agora'}
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
    </div>
  );
};
