import React, { useState } from 'react';
import api from '../services/api';
import {
  Search, Sparkles, Youtube, ExternalLink, Loader2, RefreshCw, ArrowRight,
  Eye, TrendingUp, Wand2, Rocket, MessageSquare, Flame, AlertCircle, Copy, Check
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
  channel?: string;
  duration?: number;
  thumbnail?: string;
  publishedAt?: string | null;
  comments?: number;
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

const TrendRadarPage: React.FC<TrendRadarPageProps> = ({ setActiveTab }) => {
  const [theme, setTheme] = useState('');
  const [useYoutube, setUseYoutube] = useState(true);
  const [useReddit, setUseReddit] = useState(true);
  const [limit, setLimit] = useState(12);
  const [shortOnly, setShortOnly] = useState(true);
  const [minViews, setMinViews] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [items, setItems] = useState<TrendItem[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [searched, setSearched] = useState(false);

  const [remixLoading, setRemixLoading] = useState(false);
  const [remixError, setRemixError] = useState('');
  const [remix, setRemix] = useState<RemixResult | null>(null);
  const [titlesText, setTitlesText] = useState('');
  const [copied, setCopied] = useState(false);

  const keyOf = (it: TrendItem) => `${it.platform}:${it.id}`;

  const handleSearch = async () => {
    if (!theme.trim()) { setError('Digite um tema/nicho para pesquisar.'); return; }
    const sources = [useYoutube && 'youtube', useReddit && 'reddit'].filter(Boolean);
    if (sources.length === 0) { setError('Escolha pelo menos uma fonte (YouTube ou Reddit).'); return; }

    setLoading(true); setError(''); setNotes([]); setRemix(null); setRemixError('');
    try {
      const res = await api.get(
        `/trends/search?q=${encodeURIComponent(theme.trim())}&sources=${sources.join(',')}&limit=${limit}&minViews=${minViews}&shortOnly=${shortOnly ? 1 : 0}`
      );
      if (res.data?.success) {
        const list: TrendItem[] = res.data.items || [];
        setItems(list);
        setNotes(res.data.notes || []);
        // Seleciona todos por padrão (o usuário pode desmarcar)
        const sel: Record<string, boolean> = {};
        list.forEach(it => { sel[keyOf(it)] = true; });
        setSelected(sel);
        if (list.length === 0) setNotes(prev => [...prev, 'Nenhum resultado encontrado para esse tema. Tente outro termo ou amplie o período.']);
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

  const winners = items.filter(it => selected[keyOf(it)]);

  const handleRemix = async () => {
    if (winners.length === 0) { setRemixError('Selecione pelo menos 1 conteúdo vencedor.'); return; }
    setRemixLoading(true); setRemixError(''); setRemix(null);
    try {
      const res = await api.post('/trends/remix', {
        theme: theme.trim(),
        count: 10,
        winners: winners.map(w => ({ title: w.title, views: w.views, channel: w.channel, platform: w.platform }))
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
    } catch { /* ignore */ }
    setActiveTab?.('post_automations');
  };

  const allSelected = items.length > 0 && winners.length === items.length;
  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    items.forEach(it => { next[keyOf(it)] = !allSelected; });
    setSelected(next);
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Busca */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white shadow">
            <TrendingUp size={18} />
          </div>
          <div>
            <h2 className="text-lg font-black text-gray-800">Radar de Conteúdo Viral</h2>
            <p className="text-xs text-gray-500">Descubra o que está dando views no seu nicho, remodele com IA e poste a tendência.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={theme}
              onChange={e => setTheme(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="Ex: frases de umbanda, simpatia para amor, receitas fit..."
              className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none transition-all"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl text-sm font-black shadow-md shadow-purple-200 hover:opacity-95 disabled:opacity-50 transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            {loading ? 'Buscando...' : 'Buscar tendências'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 mt-4 text-xs font-bold text-gray-600">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useYoutube} onChange={e => setUseYoutube(e.target.checked)} className="accent-red-600 w-4 h-4" />
            <Youtube size={14} className="text-red-600" /> YouTube
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={useReddit} onChange={e => setUseReddit(e.target.checked)} className="accent-orange-500 w-4 h-4" />
            <MessageSquare size={14} className="text-orange-500" /> Reddit
          </label>
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
        </div>
      </div>

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
              {items.length} conteúdos encontrados · ordenados por views
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
                      <span className={`px-1.5 py-0.5 rounded ${it.platform === 'youtube' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                        {it.platform}
                      </span>
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
            Os títulos vão preenchidos na tela de Automação. Ajuste o estilo visual, escolha as contas e clique em Salvar.
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
  );
};

export default TrendRadarPage;
