import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Trophy, RefreshCw, Eye, MessageCircle, AlertTriangle, Settings2, SlidersHorizontal,
    Loader2, ExternalLink, Clock, ShieldCheck, Power, ChevronDown, ChevronUp, Image as ImageIcon, Link2
} from 'lucide-react';
import { TacticalButton } from '../components/MotionComponents';
import api from '../services/api';
import { useAlert } from '../context/AlertContext';

const PLATFORM_LABELS: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram' };

// Status oficiais do painel de publicações campeãs
const STATUS_META: Record<string, { label: string; cls: string }> = {
    monitoring:          { label: 'Monitorando',            cls: 'bg-slate-100 text-slate-600' },
    identified:          { label: 'Campeão identificado',   cls: 'bg-indigo-100 text-indigo-700' },
    awaiting_interval:   { label: 'Aguardando intervalo',   cls: 'bg-amber-100 text-amber-700' },
    commented:           { label: 'Comentário publicado',   cls: 'bg-emerald-100 text-emerald-700' },
    awaiting_config:     { label: 'Aguardando configuração',cls: 'bg-orange-100 text-orange-700' },
    failed:              { label: 'Falha na publicação',    cls: 'bg-red-100 text-red-700' },
    disabled:            { label: 'Automação desativada',   cls: 'bg-gray-200 text-gray-600' },
};

const OFFER_LABELS: Record<string, string> = { subscription: 'Assinatura', product: 'Produto', subscribe: 'Assinatura', sell: 'Produto' };

interface Settings { threshold: number; enabled: boolean; universalLink: string; universalOffer: string; universalMessage: string }
interface PageCfg {
    id?: number; platform: string; account_id: string;
    subscription_link: string; product_link: string; default_message: string;
    priority_offer: string; auto_monetization_enabled: boolean;
    max_comments_per_period: number; period_minutes: number; min_interval_minutes: number;
}

const emptyCfg = (platform = 'facebook', accountId = ''): PageCfg => ({
    platform, account_id: accountId, subscription_link: '', product_link: '', default_message: '',
    priority_offer: 'subscription', auto_monetization_enabled: true,
    max_comments_per_period: 3, period_minutes: 1440, min_interval_minutes: 30,
});

const EMPTY_SETTINGS: Settings = { threshold: 1000, enabled: true, universalLink: '', universalOffer: 'product', universalMessage: '' };

export default function ChampionsPanel() {
    const { showAlert } = useAlert();

    const [settings, setSettings] = useState<Settings | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [pageCfgs, setPageCfgs] = useState<PageCfg[]>([]);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [savingCfg, setSavingCfg] = useState<string | null>(null);

    const [posts, setPosts] = useState<any[]>([]);
    const [stats, setStats] = useState<any>(null);
    const [sentToday, setSentToday] = useState(0);
    const [loading, loading_] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [retryingId, setRetryingId] = useState<number | null>(null);

    const [fStatus, setFStatus] = useState('');
    const [fPage, setFPage] = useState('');
    const [fDays, setFDays] = useState('');

    const loadAll = useCallback(async () => {
        loading_(true);
        try {
            const params = new URLSearchParams();
            if (fStatus) params.set('status', fStatus);
            if (fPage) { const [pl, id] = fPage.split(':'); params.set('platform', pl); params.set('accountId', id); }
            if (fDays) params.set('days', fDays);
            const [s, c, p] = await Promise.all([
                api.get('/champions/settings'),
                api.get('/champions/page-configs'),
                api.get(`/champions/posts?${params.toString()}`),
            ]);
            if (s.data.success) setSettings({ threshold: s.data.threshold, enabled: s.data.enabled, universalLink: s.data.universalLink || '', universalOffer: s.data.universalOffer || 'product', universalMessage: s.data.universalMessage || '' });
            if (c.data.success) setPageCfgs(c.data.configs || []);
            if (p.data.success) { setPosts(p.data.posts || []); setStats(p.data.stats || null); setSentToday(p.data.sentToday || 0); }
        } catch (e: any) {
            showAlert(e?.response?.data?.error || 'Erro ao carregar painel de campeões.', 'error');
        } finally { loading_(false); }
    }, [fStatus, fPage, fDays, showAlert]);

    useEffect(() => { loadAll(); }, [loadAll]);

    const loadAccounts = useCallback(async () => {
        try {
            const [fb, ig] = await Promise.all([
                api.get('/facebook/pages').catch(() => ({ data: {} })),
                api.get('/instagram/accounts').catch(() => ({ data: {} })),
            ]);
            const accs: any[] = [];
            fb.data?.pages?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: '', platform: 'facebook' }));
            ig.data?.accounts?.forEach((p: any) => accs.push({ id: p.id, name: p.name || '', username: p.username || '', platform: 'instagram' }));
            setAccounts(accs);
        } catch { /* ignore */ }
    }, []);
    useEffect(() => { loadAccounts(); }, [loadAccounts]);

    const toggleMonitor = async () => {
        if (!settings) return;
        const next = !settings.enabled;
        setSettings({ ...settings, enabled: next });
        try {
            const r = await api.post('/champions/settings', { ...settings, enabled: next });
            if (r.data.success) setSettings({ threshold: r.data.threshold, enabled: r.data.enabled, universalLink: r.data.universalLink || '', universalOffer: r.data.universalOffer || 'product', universalMessage: r.data.universalMessage || '' });
            showAlert(next ? 'Monitoramento ativado.' : 'Monitoramento pausado.', 'success');
        } catch (e: any) {
            setSettings({ ...settings, enabled: !next });
            showAlert(e?.response?.data?.error || 'Erro ao alterar o monitoramento.', 'error');
        }
    };

    const saveSettings = async () => {
        if (!settings) return;
        // Vale para o link universal e para o comentário: nunca citar marketplace/loja.
        const badWords = /shopee|amazon|mercado\s*livre|aliexpress|link de afiliado|produto da loja/i;
        if (badWords.test(settings.universalMessage || '')) {
            showAlert('Não cite Shopee, loja ou "link de afiliado" na descrição — isso reduz os cliques. Use uma frase que gere curiosidade (ex.: "Olha o que eu achei… 👀").', 'error');
            return;
        }
        setSavingSettings(true);
        try {
            const r = await api.post('/champions/settings', settings);
            if (r.data.success) setSettings({ threshold: r.data.threshold, enabled: r.data.enabled, universalLink: r.data.universalLink || '', universalOffer: r.data.universalOffer || 'product', universalMessage: r.data.universalMessage || '' });
            showAlert('Configuração salva.', 'success');
        } catch (e: any) { showAlert(e?.response?.data?.error || 'Erro ao salvar.', 'error'); }
        finally { setSavingSettings(false); }
    };

    const cfgKey = (c: PageCfg) => `${c.platform}:${c.account_id}`;
    const findCfg = (platform: string, accountId: string) =>
        pageCfgs.find(c => c.platform === platform && String(c.account_id) === String(accountId)) ||
        emptyCfg(platform, accountId);

    const saveCfg = async (cfg: PageCfg) => {
        const key = cfgKey(cfg);
        setSavingCfg(key);
        try {
            const r = await api.post('/champions/page-configs', cfg);
            if (r.data.success) {
                setPageCfgs(prev => prev.some(c => cfgKey(c) === key)
                    ? prev.map(c => cfgKey(c) === key ? r.data.config : c)
                    : [...prev, r.data.config]);
                showAlert('Links desta página salvos.', 'success');
            }
        } catch (e: any) { showAlert(e?.response?.data?.error || 'Erro ao salvar página.', 'error'); }
        finally { setSavingCfg(null); }
    };

    const updateLocalCfg = (platform: string, accountId: string, patch: Partial<PageCfg>) => {
        const key = `${platform}:${accountId}`;
        setPageCfgs(prev => {
            const exists = prev.some(c => cfgKey(c) === key);
            const base = exists ? prev.find(c => cfgKey(c) === key)! : emptyCfg(platform, accountId);
            const merged = { ...base, ...patch };
            return exists ? prev.map(c => cfgKey(c) === key ? merged : c) : [...prev, merged];
        });
    };

    const scan = async () => {
        setScanning(true);
        try {
            const r = await api.post('/champions/scan');
            const d = r.data;
            if (d.error) showAlert(d.error, 'error');
            else showAlert(`Verificação concluída: ${d.detection?.detected ?? 0} campeão(ões) · ${d.commented ?? 0} comentário(s) publicado(s).`, 'success');
            await loadAll();
        } catch (e: any) { showAlert(e?.response?.data?.error || 'Erro ao verificar.', 'error'); }
        finally { setScanning(false); }
    };

    const retry = async (id: number) => {
        setRetryingId(id);
        try { await api.post(`/champions/${id}/retry`); await loadAll(); }
        catch (e: any) { showAlert(e?.response?.data?.error || 'Erro ao reprocessar.', 'error'); }
        finally { setRetryingId(null); }
    };

    // Contas que ainda não têm config salva (solicitam link na primeira utilização)
    const accountsMissingCfg = accounts.filter(a => !pageCfgs.some(c => c.platform === a.platform && String(c.account_id) === String(a.id)));

    return (
        <div className="space-y-6">
            {/* Configuração geral do monitoramento */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                    <div className="flex-1">
                        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2"><SlidersHorizontal size={14} /> Detecção inteligente</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Publicações com mais de <strong>{(settings?.threshold ?? 1000).toLocaleString('pt-BR')} views</strong> são identificadas automaticamente como campeãs e monetizadas, a cada 15 minutos, no servidor.
                        </p>
                    </div>
                    <div className="flex items-end gap-3 flex-wrap">
                        <div>
                            <label className="text-xs font-medium text-gray-600">Limite de views</label>
                            <input
                                type="number" min={100} step={100}
                                value={settings?.threshold ?? 1000}
                                onChange={e => setSettings(s => ({ ...(s || EMPTY_SETTINGS), threshold: Math.max(100, Number(e.target.value) || 1000) }))}
                                className="mt-1 w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={toggleMonitor}
                            title="Clique para ativar/pausar (salva na hora)"
                            className={`px-3 py-2 rounded-lg text-sm font-semibold border flex items-center gap-1.5 ${settings?.enabled ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-200 text-gray-500'}`}
                        >
                            <Power size={14} /> {settings?.enabled ? 'Monitoramento ativo' : 'Monitoramento pausado'}
                        </button>
                        <TacticalButton loading={savingSettings} onClick={saveSettings} color="indigo">
                            {!savingSettings && <><Settings2 size={14} /> Salvar</>}
                        </TacticalButton>
                        <TacticalButton loading={scanning} onClick={scan} color="cyan">
                            {!scanning && <><RefreshCw size={14} /> Verificar agora</>}
                        </TacticalButton>
                    </div>
                </div>
            </div>

            {/* Link universal (fallback para páginas sem link próprio) */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex flex-col lg:flex-row lg:items-end gap-4">
                    <div className="flex-1">
                        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Link2 size={14} /> Link universal</h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Usado automaticamente em <strong>toda página que não tiver link próprio cadastrado</strong> (e também quando a prioridade da página estiver sem link). Cada página configurada continua usando os seus próprios links.
                        </p>
                    </div>
                    <div className="flex items-end gap-3 flex-wrap">
                        <div className="flex-1 min-w-[260px]">
                            <label className="text-xs font-medium text-gray-600">Link universal (aparece encurtado no comentário)</label>
                            <input
                                type="text"
                                placeholder="https://…"
                                value={settings?.universalLink ?? ''}
                                onChange={e => setSettings(s => ({ ...(s || EMPTY_SETTINGS), universalLink: e.target.value }))}
                                className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-gray-600">Tipo de oferta</label>
                            <select
                                value={settings?.universalOffer ?? 'product'}
                                onChange={e => setSettings(s => ({ ...(s || EMPTY_SETTINGS), universalOffer: e.target.value }))}
                                className="mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                <option value="product">Produto</option>
                                <option value="subscription">Assinatura</option>
                            </select>
                        </div>
                        <TacticalButton loading={savingSettings} onClick={saveSettings} color="indigo">
                            {!savingSettings && <><Settings2 size={14} /> Salvar</>}
                        </TacticalButton>
                    </div>
                </div>
                <div className="mt-3">
                    <label className="text-xs font-medium text-gray-600">Descrição do comentário (opcional)</label>
                    <textarea
                        rows={2}
                        placeholder="Ex.: Olha o que eu achei… eu não esperava por isso 👀"
                        value={settings?.universalMessage ?? ''}
                        onChange={e => setSettings(s => ({ ...(s || EMPTY_SETTINGS), universalMessage: e.target.value }))}
                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-y"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                        Usada nos comentários das páginas que não têm mensagem própria. Vazio = a IA escreve o texto.
                        <strong className="text-orange-600"> Nunca cite Shopee, loja, preço ou "link de afiliado"</strong> — o comentário precisa gerar curiosidade para a pessoa clicar.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                        {[
                            'Olha o que eu achei… eu não esperava por isso 👀',
                            'Descobri isso e mudou tudo pra mim 🔥 dá uma olhada',
                            'Ninguém te contou isso ainda 😳 confere aqui embaixo',
                        ].map(sug => (
                            <button
                                key={sug}
                                type="button"
                                onClick={() => setSettings(s => ({ ...(s || EMPTY_SETTINGS), universalMessage: sug }))}
                                className="text-[11px] px-2 py-1 rounded-full border border-gray-200 bg-gray-50 text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700"
                            >
                                {sug}
                            </button>
                        ))}
                    </div>
                </div>
                <p className="text-[11px] text-gray-400 mt-2">
                    🔒 O link nunca aparece cru: o sistema publica a versão encurtada (ex.: <code>fluxointeligente.digital/?video=…</code>), redireciona e conta os cliques.
                </p>
            </div>

            {/* Métricas */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <StatBox title="Acima do limite" value={(stats?.identified || 0) + (stats?.awaiting_config || 0) + (stats?.failed || 0)} icon={Trophy} color="indigo" />
                <StatBox title="Monitorando" value={stats?.monitoring || 0} icon={Eye} color="slate" />
                <StatBox title="Comentários hoje" value={sentToday} icon={MessageCircle} color="green" />
                <StatBox title="Comentários publicados" value={stats?.commented || 0} icon={ShieldCheck} color="emerald" />
                <StatBox title="Falhas" value={stats?.failed || 0} icon={AlertTriangle} color="red" />
            </div>

            {/* Configuração de links por página */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2"><Settings2 size={14} /> Links por página / conta</h2>
                    <span className="text-[11px] text-gray-400">Sem link próprio, a página usa o link universal</span>
                </div>

                <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                    🔒 <strong>Não há link direto nos comentários:</strong> o sistema encurta automaticamente (ex.: <code>fluxointeligente.digital/?video=…</code>) e redireciona para o endereço que você colar aqui — reduz o risco de bloqueio no Facebook e ainda conta os cliques. Cole o endereço normal (com ou sem <code>https://</code>).
                </div>

                {accountsMissingCfg.length > 0 && (
                    <div className={`mb-3 rounded-lg border px-3 py-2 text-xs ${settings?.universalLink ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-orange-200 bg-orange-50 text-orange-700'}`}>
                        {settings?.universalLink
                            ? <><strong>{accountsMissingCfg.length}</strong> página(s) sem links próprios — vão usar o <strong>link universal</strong> automaticamente.</>
                            : <>Informe os links de assinatura e produto de <strong>{accountsMissingCfg.length}</strong> página(s), ou cadastre o <strong>link universal</strong> acima para monetizar todas de uma vez.</>}
                    </div>
                )}

                <div className="space-y-2">
                    {accounts.length === 0 && (
                        <p className="text-xs text-gray-400 py-3 text-center">Nenhuma página/conta conectada.</p>
                    )}
                    {accounts.map(a => {
                        const key = `${a.platform}:${a.id}`;
                        const cfg = findCfg(a.platform, a.id);
                        const open = expanded === key;
                        return (
                            <div key={key} className="border border-gray-100 rounded-lg overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setExpanded(open ? null : key)}
                                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 text-left"
                                >
                                    <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                                        {a.platform === 'instagram' ? '📷' : '📘'} {a.name || a.username || a.id}
                                        {a.username && a.username !== a.name ? <span className="text-xs text-gray-400">@{a.username}</span> : null}
                                        <span className="text-[10px] text-gray-400">{PLATFORM_LABELS[a.platform]}</span>
                                    </span>
                                    <span className="flex items-center gap-2">
                                        {!pageCfgs.some(c => c.platform === a.platform && String(c.account_id) === String(a.id)) && (
                                            <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 rounded-full px-2 py-0.5">sem links</span>
                                        )}
                                        {open ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
                                    </span>
                                </button>
                                <AnimatePresence>
                                    {open && (
                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                                            <div className="px-3 pb-3 pt-1 grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-gray-50">
                                                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-600">Link de assinatura (aparece encurtado no comentário)</label>
                                                        <input type="text" value={cfg.subscription_link} placeholder="ex.: meusite.com.br/assinatura"
                                                            onChange={e => updateLocalCfg(a.platform, a.id, { subscription_link: e.target.value })}
                                                            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-medium text-gray-600">Link do produto / oferta (vazio = usa o link universal)</label>
                                                        <input type="text" value={cfg.product_link} placeholder="ex.: hotmail.com"
                                                            onChange={e => updateLocalCfg(a.platform, a.id, { product_link: e.target.value })}
                                                            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                    </div>
                                                </div>
                                                <div className="md:col-span-2">
                                                    <label className="text-xs font-medium text-gray-600">Mensagem padrão (opcional — vazio = a IA cria o texto)</label>
                                                    <textarea rows={2} value={cfg.default_message} placeholder="Confira os detalhes por aqui: {link}"
                                                        onChange={e => updateLocalCfg(a.platform, a.id, { default_message: e.target.value })}
                                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600">Oferta prioritária</label>
                                                    <select value={cfg.priority_offer}
                                                        onChange={e => updateLocalCfg(a.platform, a.id, { priority_offer: e.target.value })}
                                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                                                        <option value="subscription">Assinatura</option>
                                                        <option value="product">Produto</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600">Máx. comentários / período</label>
                                                    <input type="number" min={1} max={50} value={cfg.max_comments_per_period}
                                                        onChange={e => updateLocalCfg(a.platform, a.id, { max_comments_per_period: Math.max(1, Number(e.target.value) || 1) })}
                                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600">Período (min)</label>
                                                    <input type="number" min={10} value={cfg.period_minutes}
                                                        onChange={e => updateLocalCfg(a.platform, a.id, { period_minutes: Math.max(10, Number(e.target.value) || 1440) })}
                                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-medium text-gray-600">Intervalo mín. entre comentários (min)</label>
                                                    <input type="number" min={1} value={cfg.min_interval_minutes}
                                                        onChange={e => updateLocalCfg(a.platform, a.id, { min_interval_minutes: Math.max(1, Number(e.target.value) || 30) })}
                                                        className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                                                </div>
                                                <div className="md:col-span-2 flex items-center justify-between gap-3 pt-1">
                                                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                                        <input type="checkbox" checked={cfg.auto_monetization_enabled}
                                                            onChange={e => updateLocalCfg(a.platform, a.id, { auto_monetization_enabled: e.target.checked })}
                                                            className="rounded border-gray-300" />
                                                        Monetização automática desta página
                                                    </label>
                                                    <TacticalButton loading={savingCfg === key} onClick={() => saveCfg(cfg)} color="indigo">
                                                        {savingCfg !== key && <span>Salvar</span>}
                                                    </TacticalButton>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-3">
                <select value={fPage} onChange={e => setFPage(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Todas as páginas</option>
                    {accounts.map(a => (
                        <option key={`${a.platform}:${a.id}`} value={`${a.platform}:${a.id}`}>
                            {a.platform === 'instagram' ? '📷' : '📘'} {a.name || a.username}
                        </option>
                    ))}
                </select>
                <select value={fStatus} onChange={e => setFStatus(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Todos os status</option>
                    {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={fDays} onChange={e => setFDays(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                    <option value="">Todo o período</option>
                    <option value="3">Últimos 3 dias</option>
                    <option value="7">Últimos 7 dias</option>
                    <option value="15">Últimos 15 dias</option>
                    <option value="30">Últimos 30 dias</option>
                </select>
            </div>

            {/* Lista de publicações campeãs */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2"><Trophy size={14} /> Publicações campeãs</h2>
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
                ) : posts.length === 0 ? (
                    <p className="text-sm text-gray-500 py-6 text-center">
                        Nenhuma publicação acima do limite ainda. Clique em <strong>"Verificar agora"</strong> ou aguarde a próxima varredura automática.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {posts.map(p => {
                            const meta = STATUS_META[p.status] || STATUS_META.monitoring;
                            return (
                                <div key={p.id} className="border border-gray-100 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-gray-50">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        {p.image_url ? (
                                            <img src={p.image_url} alt="" className="w-12 h-12 rounded object-cover flex-shrink-0 bg-gray-100" />
                                        ) : (
                                            <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center flex-shrink-0"><ImageIcon size={18} className="text-gray-400" /></div>
                                        )}
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-gray-800 truncate">{p.account_name || 'Conta'}</span>
                                                <span className="text-[10px] text-gray-400">{PLATFORM_LABELS[p.platform] || p.platform}</span>
                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 truncate mt-0.5">{p.caption || p.post_id || 'Publicação'}</p>
                                            <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400 flex-wrap">
                                                <span className="flex items-center gap-1"><Eye size={11} /> {Number(p.views || 0).toLocaleString('pt-BR')} views</span>
                                                {p.published_at && <span className="flex items-center gap-1"><Clock size={11} /> {new Date(p.published_at).toLocaleDateString('pt-BR')}</span>}
                                                {p.crossed_at && <span className="text-indigo-500">cruzou {new Date(p.crossed_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>}
                                                {!!p.clicks && <span className="text-emerald-600 font-semibold">{Number(p.clicks).toLocaleString('pt-BR')} cliques</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-start sm:items-end gap-1.5 sm:min-w-[220px]">
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {p.offer_type && <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 rounded-full px-2 py-0.5">Oferta: {OFFER_LABELS[p.offer_type] || p.offer_type}</span>}
                                            {p.comment_status === 'sent' && <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 rounded-full px-2 py-0.5 flex items-center gap-1"><MessageCircle size={10} /> comentário enviado</span>}
                                        </div>
                                        {p.link_used && (
                                            <a href={p.link_used} target="_blank" rel="noopener noreferrer" className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 break-all">
                                                <ExternalLink size={11} /> ver link usado
                                            </a>
                                        )}
                                        {p.error_message && <p className="text-[11px] text-red-500 break-words sm:text-right">{p.error_message}</p>}
                                        {p.status === 'failed' && (
                                            <TacticalButton loading={retryingId === p.id} onClick={() => retry(p.id)} color="cyan">
                                                {retryingId !== p.id && <span>Tentar novamente</span>}
                                            </TacticalButton>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

const StatBox = ({ title, value, icon: Icon, color = 'blue' }: any) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
        <div className={`p-2.5 rounded-lg bg-${color}-50 text-${color}-600`}><Icon size={18} /></div>
        <div>
            <p className="text-xs text-gray-500 font-medium">{title}</p>
            <p className="text-lg font-bold text-gray-900">{Number(value || 0).toLocaleString('pt-BR')}</p>
        </div>
    </div>
);
