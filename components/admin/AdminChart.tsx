import React from 'react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, BarChart, Bar 
} from 'recharts';

interface AdminChartProps {
  title: string;
  subtitle?: string;
  data: any[];
  type?: 'area' | 'bar';
  height?: number;
}

const AdminChart: React.FC<AdminChartProps> = ({ 
  title, subtitle, data, type = 'area', height = 350 
}) => {
  return (
    <div className="bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-8 relative overflow-hidden group">
      
      {/* Decorative top border */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#EC4899] opacity-40 group-hover:opacity-100 transition-opacity" />

      <div className="flex justify-between items-center mb-8">
        <div>
          <h3 className="text-xl font-bold text-[#F9FAFB] tracking-tight">{title}</h3>
          {subtitle && <p className="text-sm text-[#9CA3AF] mt-1 font-medium">{subtitle}</p>}
        </div>
        
        {/* Mock Filters */}
        <div className="flex gap-2 bg-[#0A0E27]/50 p-1 rounded-xl border border-[#6366F1]/10">
          {['7d', '30d', '90d'].map((period) => (
            <button 
              key={period}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all
                ${period === '7d' ? 'bg-[#6366F1] text-white shadow-lg shadow-indigo-500/20' : 'text-[#9CA3AF] hover:text-[#F9FAFB]'}`}
            >
              {period.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          {type === 'area' ? (
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#6366F1" opacity={0.05} vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
              />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: '#0A0E27', 
                  borderColor: '#6366F133', 
                  borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  backdropFilter: 'blur(20px)'
                }}
                itemStyle={{ color: '#F9FAFB', fontWeight: 700 }}
                labelStyle={{ color: '#9CA3AF', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase', fontWeight: 800 }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke="#6366F1" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorValue)" 
                animationDuration={2000}
              />
            </AreaChart>
          ) : (
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#6366F1" opacity={0.05} vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 500 }}
              />
              <Tooltip 
                cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                contentStyle={{ 
                  backgroundColor: '#0A0E27', 
                  borderColor: '#6366F133', 
                  borderRadius: '16px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                  border: '1px solid rgba(99, 102, 241, 0.2)'
                }}
              />
              <Bar 
                dataKey="value" 
                fill="#6366F1" 
                radius={[4, 4, 0, 0]} 
                animationDuration={2000}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default AdminChart;
