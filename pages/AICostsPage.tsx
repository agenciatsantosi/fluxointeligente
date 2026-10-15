import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { DollarSign, Image as ImageIcon, Zap, TrendingUp, RefreshCw } from 'lucide-react';

const fmtUSD = (v: any) => `$${(Number(v) || 0).toFixed(4)}`;
const fmtNum = (v: any) => (Number(v) || 0).toLocaleString('pt-BR');

const AICostsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [byProvider, setByProvider] = useState<any[]>([]);
  const [byAutomation, setByAutomation] = useState<any[]>([]);
  const [details, setDetails] = useState<any[]>([]);
  const [pricing, setPricing] = useState<any[]>([]);
  const [period, setPeriod] = useState('30');
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState({ input_price_usd: '0', output_price_usd: '0' });

  const loadAll = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const start = period === 'all' ? undefined : new Date(now.getTime() - Number(period) * 86400000).toISOString();
      const q = start ? `?startDate=${encodeURIComponent(start)}` : '';
      const [sRes, dRes, pRes] = await Promise.all([
        api.get(`/automations/costs/summary${q}`),
        api.get(`/automations/costs/details${q ? q + '&limit=100' : '?limit=100'}`),
        api.get('/automations/costs/pricing')
      ]);
      if (sRes.data?.success) {
        setSummary(sRes.data.data.summary);
        setByProvider(sRes.data.data.byProvider || []);
        setByAutomation(sRes.data.data.byAutomation || []);
      }
      if (dRes.data?.success) setDetails(dRes.data.data || []);
      if (pRes.data?.success) setPricing(pRes.data.data || []);
    } catch (e) {
      console.error('[AICosts] erro ao carregar:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [period]);

  const openEdit = (row: any) => {
    setEditing(row);
    setEditForm({
      input_price_usd: String(row.input_price_usd ?? 0),
      output_price_usd: String(row.output_price_usd ?? 0)
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.put('/automations/costs/pricing', {
        provider: editing.provider,
        model: editing.model,
        pricing_type: editing.pricing_type,
        input_price_usd: Number(editForm.input_price_usd) || 0,
        output_price_usd: Number(editForm.output_price_usd) || 0,
        is_active: true
      });
      setEditing(null);
      const pRes = await api.get('/automations/costs/pricing');
      if (pRes.data?.success) setPricing(pRes.data.data || []);
    } catch (e: any) {
      alert('Erro ao salvar preço: ' + (e.response?.data?.error || e.message));
    }
  };

  const s = summary || {};

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black text-gray-900">💰 Custos de IA por imagem</h2>
          <p className="text-xs text-gray-500 mt-1">Quanto cada imagem gerada gasta de API, por provedor, automação e post.</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="border border-gray-300 rounded-xl text-sm px-3 py-2 bg-white"
          >
            <option value="7">Últimos 7 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="all">Tudo</option>
          </select>
          <button
            onClick={loadAll}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold"
          >
            <RefreshCw size={14} /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Carregando custos...</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase"><DollarSign size={14} /> Gasto total</div>
              <div className="text-2xl font-black text-gray-900 mt-1">{fmtUSD(s.total_cost_usd)}</div>
              <div className="text-[11px] text-gray-400 mt-1">{fmtNum(s.total_posts)} imagens · {fmtNum(s.posts_com_custo)} com custo</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase"><ImageIcon size={14} /> Custo médio / imagem</div>
              <div className="text-2xl font-black text-gray-900 mt-1">{fmtUSD(s.avg_cost_per_image)}</div>
              <div className="text-[11px] text-gray-400 mt-1">máx {fmtUSD(s.max_cost_per_image)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase"><Zap size={14} /> Tokens de prompt</div>
              <div className="text-2xl font-black text-gray-900 mt-1">{fmtNum(s.total_prompt_tokens)}</div>
              <div className="text-[11px] text-gray-400 mt-1">completion: {fmtNum(s.total_completion_tokens)}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs font-bold uppercase"><TrendingUp size={14} /> Provedores ativos</div>
              <div className="text-2xl font-black text-gray-900 mt-1">{byProvider.length}</div>
              <div className="text-[11px] text-gray-400 mt-1">modelos em uso no período</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <h3 className="text-sm font-black text-gray-900 mb-3">Por provedor / modelo</h3>
              {byProvider.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhuma imagem com provedor registrado no período.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {byProvider.map((r, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{r.provider} <span className="text-gray-400 font-medium">/ {r.model}</span></p>
                        <p className="text-[11px] text-gray-500">{fmtNum(r.count)} imagens · média {fmtUSD(r.avg_cost_usd)}</p>
                      </div>
                      <div className="text-sm font-black text-gray-900 shrink-0">{fmtUSD(r.total_cost_usd)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl p-4">
              <h3 className="text-sm font-black text-gray-900 mb-3">Por automação</h3>
              {byAutomation.length === 0 ? (
                <p className="text-xs text-gray-400">Nenhum gasto por automação no período.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {byAutomation.map((r) => (
                    <div key={r.automation_id} className="flex items-center justify-between gap-2 p-2.5 bg-gray-50 rounded-xl border border-gray-100">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-800 truncate">{r.automation_name || `Automação #${r.automation_id}`}</p>
                        <p className="text-[11px] text-gray-500">{fmtNum(r.posts)} imagens</p>
                      </div>
                      <div className="text-sm font-black text-gray-900 shrink-0">{fmtUSD(r.total_cost_usd)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h3 className="text-sm font-black text-gray-900 mb-3">Últimas imagens geradas</h3>
            {details.length === 0 ? (
              <p className="text-xs text-gray-400">Sem registros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-400 uppercase text-[10px]">
                      <th className="py-2 pr-2">Data</th>
                      <th className="py-2 pr-2">Título</th>
                      <th className="py-2 pr-2">Provedor</th>
                      <th className="py-2 pr-2">Modelo</th>
                      <th className="py-2 pr-2 text-right">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.map((d) => (
                      <tr key={d.id} className="border-t border-gray-100">
                        <td className="py-2 pr-2 text-gray-500 whitespace-nowrap">{new Date(d.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                        <td className="py-2 pr-2 text-gray-800 font-medium max-w-[280px] truncate">{d.title}</td>
                        <td className="py-2 pr-2 text-gray-600">{d.image_provider || '—'}</td>
                        <td className="py-2 pr-2 text-gray-600">{d.image_model || '—'}</td>
                        <td className="py-2 text-right font-black text-gray-900">{fmtUSD(d.image_cost_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <h3 className="text-sm font-black text-gray-900 mb-1">Tabela de preços (USD)</h3>
            <p className="text-[11px] text-gray-500 mb-3">Usada para calcular o custo estimado de cada imagem. Clique em editar para ajustar.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 uppercase text-[10px]">
                    <th className="py-2 pr-2">Provedor</th>
                    <th className="py-2 pr-2">Modelo</th>
                    <th className="py-2 pr-2">Tipo</th>
                    <th className="py-2 pr-2 text-right">Input</th>
                    <th className="py-2 pr-2 text-right">Output</th>
                    <th className="py-2 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.map((p) => (
                    <tr key={`${p.provider}/${p.model}`} className="border-t border-gray-100">
                      <td className="py-2 pr-2 font-bold text-gray-800">{p.provider}</td>
                      <td className="py-2 pr-2 text-gray-600">{p.model}</td>
                      <td className="py-2 pr-2 text-gray-500">{p.pricing_type}</td>
                      <td className="py-2 pr-2 text-right text-gray-700">{fmtUSD(p.input_price_usd)}</td>
                      <td className="py-2 pr-2 text-right text-gray-700">{fmtUSD(p.output_price_usd)}</td>
                      <td className="py-2 text-right">
                        <button onClick={() => openEdit(p)} className="text-indigo-600 font-bold hover:underline">Editar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70] p-4" onClick={() => setEditing(null)}>
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="font-black text-gray-900 text-sm mb-1">Editar preço</h4>
            <p className="text-xs text-gray-500 mb-4">{editing.provider} / {editing.model} ({editing.pricing_type})</p>
            <label className="block text-xs font-bold text-gray-600 mb-1">Preço input (USD)</label>
            <input
              value={editForm.input_price_usd}
              onChange={e => setEditForm({ ...editForm, input_price_usd: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-3"
              inputMode="decimal"
            />
            <label className="block text-xs font-bold text-gray-600 mb-1">Preço output / por imagem (USD)</label>
            <input
              value={editForm.output_price_usd}
              onChange={e => setEditForm({ ...editForm, output_price_usd: e.target.value })}
              className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm mb-4"
              inputMode="decimal"
            />
            <div className="flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 px-3 py-2 border border-gray-300 rounded-xl text-sm font-bold text-gray-600">Cancelar</button>
              <button onClick={saveEdit} className="flex-1 px-3 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AICostsPage;
