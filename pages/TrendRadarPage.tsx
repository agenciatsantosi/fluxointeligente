import React, { useEffect, useState } from 'react';
import api from '../services/api';
import {
  Search, Sparkles, Youtube, ExternalLink, Loader2, RefreshCw, ArrowRight,
  Eye, TrendingUp, Wand2, Rocket, MessageSquare, Flame, AlertCircle, Copy, Check,
  Instagram, Facebook, Wand2 as WandIcon, Users, Clock, Save, Trash2, Image as ImageIcon,
  AtSign, Target, LayoutGrid, List
} from 'lucide-react';

interface TrendRadarPageProps {
  setActiveTab?: (tab: string) => void;
}

interface TrendItem {
  platform: string;
  id: string;
  title: string;
  url: string;
  views: number;
  likes?: number;
  comments?: number;
  channel?: string;
  duration?: number;
  thumbnail?: string;
  publishedAt?: string | null;
}

interface SearchHistory {
  id: number;
  query: string;
  detected_niche?: string | null;
  sources: string[];
  count: number;
  items_count: number;
  created_at: string;
}

interface RemixResult {
  analise: string;
  titulos: string[];
  legenda: string;
  hashtags: string[];
  direcao_visual: string;
}

const fmt = (n: number) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000_000) return `${(v / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
};

const fmtDuration = (s?: number) => {
  const t = Number(s) || 0;
  if (t <= 0) return '';
  const m = Math.floor(t / 60);
  const sec = t % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

const VISUAL_STYLES = [
  { id: '', label: 'Padrão (IA escolhe)' },
  { id: 'Fotografia realista, profissional e moderna', label: 'Fotografia realista' },
  { id: 'Ilustração digital, cores vibrantes', label: 'Ilustração colorida' },
  { id: 'Minimalista, fundo limpo, espaço para texto', label: 'Minimalista' },
  { id: 'Escuro, moody, contraste alto', label: 'Escuro / Moody' },
  { id: 'Produto em close, iluminação de estúdio', label: 'Close de produto' }
];

const TrendRadarPage: React.FC<TrendRadarPageProps> = ({ setActiveTab }) => {
  /* ---------- estado de busca ---------- */
  const [theme, setTheme] = useState('');
  const [profileUser, setProfileUser] = useState(''); // @usuario para modo profile
  const [mode, setMode] = useState<'hashtag' | 'profile' | 'ownfeed'>('hashtag');
  const [useYoutube, setUseYoutube] = useState(true);
  const [useInstagram, setUseInstagram] = useState(true);
  const [useReddit, setUseReddit] = useState(true);
  const [limit, setLimit] = useState(12);
  const [shortOnly, setShortOnly] = useState(true);
  const [minViews, setMinViews] = useState(0);
  const [visualStyle, setVisualStyle] = useState('');

  /* ---------- seletor de página ---------- */
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selKey, setSelKey] = useState('');
  const [detectedNiche, setDetectedNiche] = useState('');
  const [nicheQueries, setNicheQueries] = useState<string[]>([]);

  /* ---------- estado de resultados ---------- */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [items, setItems] = useState<TrendItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [searched, setSearched] = useState(false);
  const [persistedMsg, setPersistedMsg] = useState('');

  /* ---------- estado do remix ---------- */
  const [remixLoading, setRemixLoading] = useState(false);
  const [remixError, setRemixError] = useState('');
  const [remix, setRemix] = useState<RemixResult | null>(null);
  const [titlesText, setTitlesText] = useState('');
  const [copied, setCopied] = useState(false);

  /* ---------- estado do histórico ---------- */
  const [historyTab, setHistoryTab] = useState<'buscar' | 'historico'>('buscar');
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [viewingItems, setViewingItems] = useState<TrendItem[]>([]);
  const [viewingSearch, setViewingSearch] = useState<SearchHistory | null>(null);

  const keyOf = (it: TrendItem) => `${it.platform}:${it.id}`;

  /* ---------- carregar contas/páginas ---------- */
  useEffect(() => {
    (async () => {
      try {
        const [fb, ig, tg, wa, tw, th] = await Promise.all([
          api.get('/facebook/pages').catch(() => ({ data: {} })),
          api.get('/instagram/accounts').catch(() => ({ data: {} })),
          api.get('/telegram/accounts').catch(() => ({ data: {} })),
          api.get('/whatsapp/accounts').catch(() => ({ data: {} })),
          api.get('/twitter/accounts').catch(() => ({ data: {} })),
          api.get('/threads/accounts').catch(() => ({ data: {} }))
        ]);
        const accs: any[] = [];
        fb.data?.pages?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: '', platform: 'facebook' }));
        ig.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: p.username || '', platform: 'instagram' }));
        tg.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: p.username || '', platform: 'telegram' }));
        wa.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: p.phone || '', platform: 'whatsapp' }));
        tw.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || p.username || '', username: p.username || '', platform: 'twitter' }));
        th.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: p.username || '', platform: 'threads' }));
        setAccounts(accs);
      } catch { /* sem contas: busca por tema continua funcionando */ }
    })();
  }, []);

  const selAccount = accounts.find(a => `${a.platform}:${a.id}` === selKey) || null;

  /* ---------- histórico ---------- */
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get('/trends/history');
      if (res.data?.success) setHistory(res.data.searches || []);
    } catch { /* ignore */ } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (historyTab === 'historico') loadHistory();
  }, [historyTab]);

  /* ---------- busca ---------- */
  const handleSearch = async () => {
    const sources = [useYoutube && 'youtube', useInstagram && 'instagram', useReddit && 'reddit'].filter(Boolean);
    if (sources.length === 0) { setError('Escolha pelo menos uma fonte.'); return; }

    let q = theme.trim();
    let instagramAccountId: number | null = null;

    if (mode === 'profile') {
      const u = profileUser.trim();
      if (!u) { setError('Digite o usuário do Instagram (ex: @concorrente).'); return; }
      q = u;
    } else if (mode === 'ownfeed') {
      if (!selAccount || selAccount.platform !== 'instagram') {
        setError('Para o feed próprio, selecione uma conta do Instagram.');
        return;
      }
      instagramAccountId = selAccount.id;
      q = ''; // ownfeed não precisa de tema
    } else {
      // hashtag: tema ou nicho da página
      if (!q && !selAccount) {
        setError('Digite um tema/nicho OU escolha uma página para a IA detectar o nicho.');
        return;
      }
      if (selAccount) instagramAccountId = selAccount.platform === 'instagram' ? selAccount.id : null;
    }

    setLoading(true); setError(''); setNotes([]); setRemix(null); setRemixError('');
    setDetectedNiche(''); setNicheQueries([]);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      params.set('mode', mode);
      params.set('sources', sources.join(','));
      params.set('limit', String(limit));
      params.set('minViews', String(minViews));
      params.set('shortOnly', shortOnly ? '1' : '0');
      if (selAccount) {
        params.set('pageName', selAccount.name || '');
        params.set('pageUsername', selAccount.username || '');
        params.set('pagePlatform', selAccount.platform);
      }
      if (instagramAccountId) params.set('instagramAccountId', String(instagramAccountId));
      if (mode === 'ownfeed' || (mode === 'hashtag' && selAccount)) params.set('persist', '1');

      const res = await api.get(`/trends/search?${params.toString()}`);
      if (res.data?.success) {
        const list: TrendItem[] = res.data.items || [];
        setItems(list);
        setNotes(res.data.notes || []);
        if (res.data.detectedNiche) setDetectedNiche(res.data.detectedNiche);
        if (Array.isArray(res.data.nicheQueries)) setNicheQueries(res.data.nicheQueries);
        if (!q && res.data.query) setTheme(res.data.query);
        const sel: Record<string, boolean> = {};
        list.forEach(it => { sel[keyOf(it)] = true; });
        setSelected(sel);
        if (list.length === 0) setNotes(prev => [...prev, 'Nenhum resultado encontrado. Tente outro termo, outra fonte ou diminua o "mín. views".']);
        if (res.data.query) setPersistedMsg('Pesquisa salva no histórico.');
      } else {
        setError(res.data?.error || 'Falha na busca.');
      }
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Erro ao buscar tendências.');
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const searchWithQuery = (q: string) => {
    setTheme(q);
    setProfileUser('');
    setSelKey('');
    setMode('hashtag');
    setTimeout(() => { document.getElementById('trends-search-btn')?.click(); }, 0);
  };

  /* ---------- seleção / remix ---------- */
  const winners = items.filter(it => selected[keyOf(it)]);

  const handleRemix = async () => {
    if (winners.length === 0) { setRemixError('Selecione pelo menos 1 conteúdo vencedor.'); return; }
    setRemixLoading(true); setRemixError(''); setRemix(null);
    try {
      const res = await api.post('/trends/remix', {
        theme: theme.trim() || (detectedNiche || ''),
        count: 10,
        winners: winners.map(w => ({ title: w.title, views: w.views, channel: w.channel, platform: w.platform })),
        style: visualStyle
      });
      if (res.data?.success) {
        const r: RemixResult = {
          analise: res.data.analise || '',
          titulos: res.data.titulos || [],
          legenda: res.data.legenda || '',
          hashtags: res.data.hashtags || [],
          direcao_visual: res.data.direcao_visual || ''
        };
        setRemix(r);
        setTitlesText(r.titulos.join('\n'));
      } else {
        setRemixError(res.data?.error || 'A IA não retornou resultado.');
      }
    } catch (e: any) {
      setRemixError(e.response?.data?.error || e.message || 'Erro ao remodelar.');
    } finally {
      setRemixLoading(false);
    }
  };

  const copyCaption = async () => {
    if (!remix) return;
    const tags = remix.hashtags.map(h => `#${h}`).join(' ');
    const text = `${remix.legenda}${tags ? `\n\n${tags}` : ''}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard bloqueado */ }
  };

  const createCampaign = () => {
    const titles = titlesText.split('\n').map(t => t.trim()).filter(Boolean);
    if (titles.length === 0) { setRemixError('Nenhum título para enviar à campanha.'); return; }
    try {
      localStorage.setItem('trend_prefill_titles', titles.join('\n'));
      localStorage.setItem('trend_prefill_style', visualStyle || '');
    } catch { /* ignore */ }
    setActiveTab?.('post_automations');
  };

  /* ---------- histórico ações ---------- */
  const loadSearchItems = async (search: SearchHistory) => {
    setViewingSearch(search);
    setViewingItems([]);
    try {
      const res = await api.get(`/trends/history/${search.id}/items`);
      if (res.data?.success) {
        const items: TrendItem[] = res.data.items.map((r: any) => ({
          platform: r.platform,
          id: r.item_id,
          title: r.title,
          url: r.url || '',
          views: r.views,
          likes: r.likes,
          comments: r.comments,
          channel: r.channel,
          duration: r.duration,
          thumbnail: r.thumbnail,
          publishedAt: r.published_at
        }));
        setViewingItems(items);
        setSelected({});
        items.forEach(it => {
          setSelected(prev => ({ ...prev, [`${it.platform}:${it.id}`]: Boolean(r.selected) }));
        });
      }
    } catch { /* ignore */ }
  };

  const deleteHistory = async (id: number) => {
    if (!window.confirm('Excluir esta pesquisa do histórico?')) return;
    try {
      await api.delete(`/trends/history/${id}`);
      setHistory(prev => prev.filter(h => h.id !== id));
      if (viewingSearch?.id === id) { setViewingSearch(null); setViewingItems([]); }
    } catch { /* ignore */ }
  };

  const allSelected = items.length > 0 && winners.length === items.length;
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    items.forEach(it => { next[keyOf(it)] = !allSelected; });
    setSelected(next);
  };

  const platformLabel = (p: string) => {
    if (p === 'youtube') return <><Youtube size={12} className="text-red-600 mr-1" /> YouTube</>;
    if (p === 'instagram') return <><Instagram size={12} className="text-pink-600 mr-1" /> Instagram</>;
    if (p === 'reddit') return <><MessageSquare size={12} className="text-orange-500 mr-1" /> Reddit</>;
    return p;
  };

  const modeLabel = (m: string) => {
    if (m === 'hashtag') return <><Target size={12} className="text-purple-600 mr-1" /> Hashtag</>;
    if (m === 'profile') return <><AtSign size={12} className="text-blue-600 mr-1" /> Perfil</>;
    if (m === 'ownfeed') return <><Users size={12} className="text-green-600 mr-1" /> Meu feed</>;
    return m;
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Abas: Buscar / Histórico */}
      <div className="flex flex-col sm:flex-row gap-2 border-b border-gray-200">
        <button
          onClick={() => setHistoryTab('buscar')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-t-xl transition-colors ${
            historyTab === 'buscar'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Search size={16} className="mr-2" /> Buscar tendências
        </button>
        <button
          onClick={() => setHistoryTab('historico')}
          className={`flex-1 py-2.5 text-sm font-bold rounded-t-xl transition-colors ${
            historyTab === 'historico'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Clock size={16} className="mr-2" /> Minhas pesquisas ({history.length})
        </button>
      </div>

      {/* ============ ABA BUSCAR ============ */}
      {historyTab === 'buscar' && (
        <div className="space-y-5">
          {/* Busca */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white shadow">
                <TrendingUp size={18} />
              </div>
              <div>
                <h2 className="text-lg font-black text-gray-800">Radar de Conteúdo Viral</h2>
                <p className="text-xs text-gray-500">Descubra o que está dando views, remodele com IA e poste a tendência.</p>
              </div>
            </div>

            {/* Modo de busca */}
            <div className="flex gap-2 mb-4">
              {(['hashtag', 'profile', 'ownfeed'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    if (m === 'ownfeed') setSelKey(''); setProfileUser(''); setTheme('');
                    if (m === 'profile') setTheme(''); setSelKey('');
                    if (m === 'hashtag') setProfileUser('');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-colors border ${
                    mode === m
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {m === 'hashtag' && <Target size={14} />}
                  {m === 'profile' && <AtSign size={14} />}
                  {m === 'ownfeed' && <Users size={14} />}
                  {m === 'hashtag' && 'Hashtag'}
                  {m === 'profile' && 'Perfil / Concorrente'}
                  {m === 'ownfeed' && 'Meu feed (IG)'}
                </button>
              ))}
            </div>

            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={mode === 'profile' ? profileUser : theme}
                  onChange={e => {
                    if (mode === 'profile') setProfileUser(e.target.value);
                    else setTheme(e.target.value);
                  }}
                  onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                  placeholder={mode === 'profile' ? 'Ex: @concorrente ou nome do perfil' : 'Ex: frases de umbanda, simpatia para amor, receitas fit...'}
                  className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
                />
              </div>
              <button
                id="trends-search-btn"
                onClick={handleSearch}
                disabled={loading}
                className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-sm font-black shadow-md shadow-purple-200 hover:opacity-95 disabled:opacity-50 transition-all"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                {loading ? 'Buscando...' : 'Buscar tendências'}
              </button>
            </div>

            {/* Ou pelo nicho da página */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-3">
              <div className="flex items-center gap-2 text-xs font-black text-gray-500 uppercase tracking-wider shrink-0">
                <WandIcon size={14} className="text-purple-500" /> Ou pelo nicho da página
              </div>
              <select
                value={selKey}
                onChange={e => setSelKey(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm font-semibold text-gray-700 bg-gray-50 focus:ring-2 focus:ring-purple-500 outline-none"
              >
                <option value="">— escolha uma página/conta (a IA detecta o nicho) —</option>
                {accounts.map(a => (
                  <option key={`${a.platform}:${a.id}`} value={`${a.platform}:${a.id}`}>
                    {a.platform === 'instagram' ? '📷' : a.platform === 'facebook' ? '📘' : a.platform === 'twitter' ? '🐦' : a.platform === 'threads' ? '@' : '•'} {a.name || a.username} {a.username && a.username !== a.name ? `(@${a.username})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {selAccount && (
              <p className="text-[11px] text-purple-600 font-bold mt-1.5">
                Deixe o campo de tema vazio para a IA procurar o nicho de <strong>{selAccount.name || selAccount.username}</strong> automaticamente.
              </p>
            )}

            {/* Fontes e filtros */}
            <div className="flex flex-wrap items-center gap-4 mt-4 text-xs font-bold text-gray-600">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useYoutube} onChange={e => setUseYoutube(e.target.checked)} className="accent-red-600 w-4 h-4" />
                <Youtube size={14} className="text-red-600" /> YouTube
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useInstagram} onChange={e => setUseInstagram(e.target.checked)} className="accent-pink-600 w-4 h-4" />
                <Instagram size={14} className="text-pink-600" /> Instagram
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useReddit} onChange={e => setUseReddit(e.target.checked)} className="accent-orange-500 w-4 h-4" />
                <MessageSquare size={14} className="text-orange-500" /> Reddit
              </label>
              <label className="flex items-center gap-2 cursor-not-allowed opacity-50" title="Facebook não tem API pública de busca de conteúdo de terceiros.">
                <input type="checkbox" disabled className="accent-blue-600 w-4 h-4" />
                <Facebook size={14} className="text-blue-600" /> Facebook <span className="text-[10px] font-normal">(sem API pública)</span>
              </label>
              {mode === 'hashtag' && (
                <>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={shortOnly} onChange={e => setShortOnly(e.target.checked)} className="accent-purple-600 w-4 h-4" />
                    <Flame size={14} className="text-purple-600" /> Só vídeos curtos (até 3 min)
                  </label>
                  <label className="flex items-center gap-2">
                    Resultados
                    <select value={limit} onChange={e => setLimit(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
                      {[8, 12, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2">
                    Mín. views
                    <select value={minViews} onChange={e => setMinViews(Number(e.target.value))} className="border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
                      {[0, 1000, 10000, 100000, 1000000].map(n => <option key={n} value={n}>{fmt(n)}</option>)}
                    </select>
                  </label>
                </>
              )}
            </div>

            {detectedNiche && (
              <div className="mt-3 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2">
                <p className="text-[11px] font-black uppercase tracking-wider text-purple-500">Nicho detectado pela IA</p>
                <p className="text-sm font-bold text-gray-800">{detectedNiche}</p>
                {nicheQueries.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {nicheQueries.map((q, i) => (
                      <button key={i} onClick={() => searchWithQuery(q)} className="text-[11px] font-bold bg-white border border-purple-200 text-purple-600 px-2 py-0.5 rounded-full hover:bg-purple-100 transition-colors">
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {persistedMsg && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-xl px-4 py-3 text-sm font-bold">
              <Check size={16} /> {persistedMsg}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-bold">
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {notes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3 text-xs font-semibold space-y-1">
              {notes.map((n, i) => <p key={i}>• {n}</p>)}
            </div>
          )}

          {/* Resultados */}
          {items.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-sm font-black text-gray-700 uppercase tracking-wider">
                  {items.length} conteúdos encontrados · ordenados por popularidade
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={toggleAll} className="text-xs font-bold text-gray-500 hover:text-purple-600 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                    {allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <button
                    onClick={handleRemix}
                    disabled={remixLoading || winners.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-black shadow-md shadow-purple-200 hover:opacity-95 disabled:opacity-50 transition-all"
                  >
                    {remixLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {remixLoading ? 'Remodelando...' : `Remodelar ${winners.length} com IA`}
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
                {items.map(it => {
                  const k = keyOf(it);
                  const on = !!selected[k];
                  return (
                    <div
                      key={k}
                      className={`flex items-center gap-3 p-2.5 rounded-xl border transition-colors ${on ? 'border-purple-200 bg-purple-50/50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={e => setSelected(prev => ({ ...prev, [k]: e.target.checked }))}
                        className="accent-purple-600 w-4 h-4 shrink-0"
                      />
                      <div className="w-20 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                        {it.thumbnail
                          ? <img src={it.thumbnail} alt="" className="w-full h-full object-cover" loading="lazy" />
                          : <div className="w-full h-full flex items-center justify-center text-gray-300"><Eye size={16} /></div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{it.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] font-semibold text-gray-500">
                          {platformLabel(it.platform)}
                          {it.channel && <span className="truncate">{it.channel}</span>}
                          {it.duration ? <span>· {fmtDuration(it.duration)}</span> : null}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-gray-900 flex items-center gap-1 justify-end">
                          <Eye size={12} className="text-gray-400" /> {fmt(it.views)}
                        </p>
                        {it.comments ? <p className="text-[10px] text-gray-400 font-semibold">{fmt(it.comments)} coment.</p> : null}
                      </div>
                      <a href={it.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-purple-600 transition-colors shrink-0" title="Abrir original">
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {searched && items.length === 0 && !loading && !error && (
            <div className="text-center py-16 text-gray-400">
              <TrendingUp size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-bold">Nenhum resultado. Tente outro termo, outra fonte ou diminua o "mín. views".</p>
            </div>
          )}

          {remixError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-bold">
              <AlertCircle size={16} /> {remixError}
            </div>
          )}

          {/* Resultado da IA */}
          {remix && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm space-y-5">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-purple-600" />
                <h3 className="text-base font-black text-gray-800">Conteúdo remodelado pela IA</h3>
              </div>

              {remix.analise && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-purple-500 mb-1">Por que esses conteúdos dão views</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{remix.analise}</p>
                </div>
              )}

              {/* Estilo visual para o remix */}
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-gray-500 mb-2">Estilo visual da imagem (opcional)</p>
                <div className="flex gap-2 flex-wrap">
                  {VISUAL_STYLES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setVisualStyle(s.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                        visualStyle === s.id
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black uppercase tracking-wider text-gray-500">Seus títulos originais (edite se quiser)</p>
                  <span className="text-[11px] font-bold text-gray-400">{titlesText.split('\n').filter(t => t.trim()).length} títulos</span>
                </div>
                <textarea
                  value={titlesText}
                  onChange={e => setTitlesText(e.target.value)}
                  rows={Math.min(14, Math.max(5, remix.titulos.length))}
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-800 font-semibold focus:ring-2 focus:ring-purple-500 outline-none resize-y"
                />
              </div>

              {(remix.legenda || remix.hashtags.length > 0) && (
                <div className="grid md:grid-cols-2 gap-3">
                  {remix.legenda && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] font-black uppercase tracking-wider text-gray-500">Legenda sugerida</p>
                        <button onClick={copyCaption} className="text-[10px] font-bold text-purple-600 hover:underline flex items-center gap-1">
                          {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
                        </button>
                      </div>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{remix.legenda}</p>
                    </div>
                  )}
                  {remix.hashtags.length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-gray-500 mb-1">Hashtags</p>
                      <div className="flex flex-wrap gap-1.5">
                        {remix.hashtags.map((h, i) => (
                          <span key={i} className="text-[11px] font-bold bg-white border border-gray-200 text-purple-600 px-2 py-0.5 rounded-full">#{h}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {remix.direcao_visual && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-1">Direção visual da imagem</p>
                  <p className="text-sm text-gray-700">{remix.direcao_visual}</p>
                </div>
              )}

              <button
                onClick={createCampaign}
                className="w-full flex items-center justify-center gap-2 px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-black shadow-md shadow-green-200 hover:opacity-95 transition-all"
              >
                <Rocket size={16} /> Criar campanha com esses títulos
                <ArrowRight size={16} />
              </button>
              <p className="text-[11px] text-gray-400 text-center">
                Os títulos (e o estilo visual) vão preenchidos na tela de Automação. Ajuste o estilo, escolha as contas e clique em Salvar.
              </p>
            </div>
          )}

          {remixLoading && !remix && (
            <div className="flex items-center justify-center gap-3 py-14 text-gray-400">
              <RefreshCw size={22} className="animate-spin" />
              <span className="font-bold text-sm">A IA está analisando os vencedores e criando seus títulos...</span>
            </div>
          )}
        </div>
      )}

      {/* ============ ABA HISTÓRICO ============ */}
      {historyTab === 'historico' && (
        <div className="space-y-5">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-black text-gray-800 flex items-center gap-2">
                  <Clock size={20} className="text-purple-600" /> Minhas pesquisas salvas
                </h2>
                <p className="text-xs text-gray-500">Cada pesquisa guarda os conteúdos encontrados e os que você selecionou.</p>
              </div>
              {history.length === 0 && (
                <span className="text-xs font-bold text-gray-400 bg-gray-100 px-3 py-1 rounded-full">Vazio — faça uma busca e ela será salva automaticamente</span>
              )}
            </div>

            {historyLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
            ) : history.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <List size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-bold">Nenhuma pesquisa salva ainda.</p>
                <p className="text-sm text-gray-500 mt-2">Vá em "Buscar tendências", faça uma busca e ela será guardada aqui automaticamente.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {history.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-white hover:bg-gray-50 transition-colors cursor-pointer group" onClick={() => loadSearchItems(h)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-bold text-purple-600 uppercase tracking-wider">{modeLabel(h.query.includes('@') ? 'profile' : 'hashtag')}</span>
                        <span className="text-[10px] font-bold text-gray-400">{new Date(h.created_at).toLocaleDateString('pt-BR')} {new Date(h.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <p className="text-sm font-bold text-gray-800 truncate">{h.query}</p>
                      {h.detected_niche && (
                        <p className="text-xs text-gray-500 truncate">Nicho: {h.detected_niche}</p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-semibold text-gray-500">{h.items_count} conteúdos</span>
                        <span className="text-[10px] font-semibold text-gray-500">{h.sources.join(', ')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={e => { e.stopPropagation(); loadSearchItems(h); }}
                        className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Ver conteúdos"
                      >
                        <LayoutGrid size={16} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteHistory(h.id); }}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Itens da pesquisa selecionada */}
          {viewingSearch && viewingItems.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-black text-gray-800 flex items-center gap-2">
                    <LayoutGrid size={18} /> Conteúdos de: "{viewingSearch.query}"
                  </h3>
                  <p className="text-xs text-gray-500">{viewingItems.length} itens · {viewingSearch.sources.join(', ')}</p>
                </div>
                <button
                  onClick={() => { setViewingSearch(null); setViewingItems([]); setSelected({}); }}
                  className="text-[11px] font-bold text-gray-500 hover:text-red-600 underline"
                >
                  Voltar à lista
                </button>
              </div>

              <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
                {viewingItems.map(it => {
                  const k = keyOf(it);
                  const on = !!selected[k];
                  return (
                    <div
                      key={k}
                      className={`flex items-center gap-3 p-2 rounded-xl border transition-colors ${on ? 'border-purple-200 bg-purple-50/50' : 'border-gray-100 bg-white hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={e => setSelected(prev => ({ ...prev, [k]: e.target.checked }))}
                        className="accent-purple-600 w-4 h-4 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{it.title}</p>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] font-semibold text-gray-500">
                          {platformLabel(it.platform)}
                          {it.channel && <span className="truncate">{it.channel}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-black text-gray-900">{fmt(it.views)}</p>
                      </div>
                      <a href={it.url} target="_blank" rel="noreferrer" className="p-2 text-gray-400 hover:text-purple-600 transition-colors shrink-0" title="Abrir original">
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleRemix}
                  disabled={remixLoading || viewingItems.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-xs font-black shadow-md disabled:opacity-50"
                >
                  {remixLoading ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  Remodelar selecionados com IA
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default TrendRadarPage;
