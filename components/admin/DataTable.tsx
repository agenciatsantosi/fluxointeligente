import React from 'react';
import { Search, Filter, MoreVertical, Eye, Edit, Trash2, Lock, Unlock, RefreshCw } from 'lucide-react';

interface DataTableProps {
  title: string;
  columns: string[];
  data: any[];
  onAction?: (action: string, id: any) => void;
  filters?: React.ReactNode;
}

const DataTable: React.FC<DataTableProps> = ({ title, columns, data, onAction, filters }) => {
  return (
    <div className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl overflow-hidden shadow-2xl shadow-black/20">
      
      <div className="p-8 border-b border-[#6366F1]/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h3 className="text-xl font-bold text-[#F9FAFB] tracking-tight">{title}</h3>
          <p className="text-sm text-[#9CA3AF] mt-1 font-medium">Gerencie e visualize dados em tempo real</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
            <input 
              type="text" 
              placeholder="Busca rápida..." 
              className="w-full h-10 bg-[#0A0E27]/50 border border-[#6366F1]/20 rounded-xl pl-10 pr-4 text-sm text-[#F9FAFB] focus:outline-none focus:border-[#6366F1] transition-all"
            />
          </div>
          {filters}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-[#0A0E27]/30">
              {columns.map((col, idx) => (
                <th key={idx} className="px-6 py-4 text-left text-[11px] font-extrabold text-[#9CA3AF] uppercase tracking-widest border-b border-[#6366F1]/10">
                  {col}
                </th>
              ))}
              <th className="px-6 py-4 text-right text-[11px] font-extrabold text-[#9CA3AF] uppercase tracking-widest border-b border-[#6366F1]/10">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#6366F1]/5">
            {data.map((row, idx) => (
              <tr key={idx} className="group hover:bg-[#6366F1]/5 transition-all cursor-pointer">
                {columns.map((col, colIdx) => (
                  <td key={colIdx} className="px-6 py-5 text-sm font-medium text-[#E5E7EB]">
                    {/* Handle special cell rendering if needed, for now just text */}
                    {row[col.toLowerCase().replace(' ', '_')] || '-'}
                  </td>
                ))}
                <td className="px-6 py-5 text-right">
                  <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 bg-[#1E2139] border border-[#6366F1]/20 rounded-lg text-[#6366F1] hover:bg-[#6366F1] hover:text-white transition-all">
                      <Eye size={16} />
                    </button>
                    <button className="p-2 bg-[#1E2139] border border-[#6366F1]/20 rounded-lg text-emerald-500 hover:bg-emerald-500 hover:text-white transition-all">
                      <Edit size={16} />
                    </button>
                    <button className="p-2 bg-[#1E2139] border border-[#6366F1]/20 rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="p-6 bg-[#0A0E27]/20 border-t border-[#6366F1]/10 flex justify-between items-center">
        <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-tighter">Mostrando {data.length} registros</p>
        <div className="flex gap-2">
          <button className="px-4 py-2 bg-[#1E2139] border border-[#6366F1]/20 rounded-xl text-xs font-bold text-[#F9FAFB] hover:border-[#6366F1] transition-all disabled:opacity-50" disabled>Anterior</button>
          <button className="px-4 py-2 bg-[#1E2139] border border-[#6366F1]/20 rounded-xl text-xs font-bold text-[#F9FAFB] hover:border-[#6366F1] transition-all">Próximo</button>
        </div>
      </div>
    </div>
  );
};

export default DataTable;
