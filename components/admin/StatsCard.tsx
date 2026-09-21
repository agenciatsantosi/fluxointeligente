import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: number;
  trendType?: 'up' | 'down';
  variant?: 'primary' | 'success' | 'warning' | 'danger';
  chartData?: number[];
}

const variantStyles = {
  primary: {
    gradient: 'from-[#6366F1] to-[#8B5CF6]',
    shadow: 'shadow-indigo-500/20',
    chart: '#6366F1',
    bg: 'bg-[#6366F1]/10',
    border: 'border-[#6366F1]/20'
  },
  success: {
    gradient: 'from-[#10B981] to-[#059669]',
    shadow: 'shadow-emerald-500/20',
    chart: '#10B981',
    bg: 'bg-[#10B981]/10',
    border: 'border-[#10B981]/20'
  },
  warning: {
    gradient: 'from-[#F59E0B] to-[#D97706]',
    shadow: 'shadow-amber-500/20',
    chart: '#F59E0B',
    bg: 'bg-[#F59E0B]/10',
    border: 'border-[#F59E0B]/20'
  },
  danger: {
    gradient: 'from-[#EF4444] to-[#DC2626]',
    shadow: 'shadow-red-500/20',
    chart: '#EF4444',
    bg: 'bg-[#EF4444]/10',
    border: 'border-[#EF4444]/20'
  }
};

const StatsCard: React.FC<StatsCardProps> = ({ 
  label, value, description, icon: Icon, trend, trendType = 'up', variant = 'primary', chartData = [30, 40, 35, 50, 45, 60, 55]
}) => {
  const styles = variantStyles[variant];

  return (
    <div className="group relative bg-gradient-to-br from-[#1E2139]/80 to-[#151934]/60 backdrop-blur-xl border border-[#6366F1]/10 rounded-3xl p-6 transition-all duration-500 hover:-translate-y-2 hover:border-[#6366F1]/30 hover:shadow-2xl hover:shadow-black/40 cursor-pointer overflow-hidden">
      
      {/* Top Accent Line */}
      <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${styles.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
      
      {/* Background Pattern */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#6366F1]/5 rounded-full blur-3xl group-hover:bg-[#6366F1]/10 transition-colors pointer-events-none" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-6">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${styles.gradient} flex items-center justify-center ${styles.shadow} transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6`}>
            <Icon size={28} className="text-white drop-shadow-md" />
          </div>
          
          {trend !== undefined && (
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${trendType === 'up' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-red-500/10 border-red-500/20 text-red-500'} font-bold text-xs`}>
              {trendType === 'up' ? <TrendingUp size={14} className="animate-bounce" /> : <TrendingDown size={14} className="animate-bounce" />}
              <span>{trend}%</span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-bold text-[#9CA3AF] uppercase tracking-widest mb-2">{label}</p>
          <div className="flex items-baseline gap-2">
            <h3 className="text-4xl font-extrabold text-[#F9FAFB] tracking-tight animate-[countUp_1s_ease-out]">
              {value}
            </h3>
          </div>
          {description && <p className="text-sm text-[#E5E7EB] mt-2 font-medium">{description}</p>}
        </div>

        {/* Mini Sparkline Chart */}
        <div className="mt-6 h-12 w-full">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 100 20">
            <path
              d={`M 0 ${20 - chartData[0]} ${chartData.map((d, i) => `L ${(i / (chartData.length - 1)) * 100} ${20 - d}`).join(' ')}`}
              fill="none"
              stroke={styles.chart}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chart-line"
              style={{
                strokeDasharray: 200,
                strokeDashoffset: 200,
                animation: 'drawLine 2s ease-out forwards'
              }}
            />
            {/* Area under line */}
            <path
              d={`M 0 ${20 - chartData[0]} ${chartData.map((d, i) => `L ${(i / (chartData.length - 1)) * 100} ${20 - d}`).join(' ')} L 100 20 L 0 20 Z`}
              fill={`url(#gradient-${variant})`}
              className="opacity-20 translate-y-[1px]"
            />
            <defs>
              <linearGradient id={`gradient-${variant}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={styles.chart} stopOpacity="0.8" />
                <stop offset="100%" stopColor={styles.chart} stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
