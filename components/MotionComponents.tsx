import React from 'react';
import { motion } from 'framer-motion';

// Padrões de timing
const TIMING = {
    MICRO: 0.15,
    LAYOUT: 0.3,
    FEEDBACK: 0.5
};

// Variantes de entrada (Cinematic Dashboard)
export const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
        opacity: 1, 
        y: 0,
        transition: { 
            duration: TIMING.LAYOUT,
            staggerChildren: 0.05
        }
    }
};

export const itemVariants = {
    hidden: { opacity: 0, x: -10 },
    visible: { opacity: 1, x: 0 }
};

// CommandCard: Card com hover físico e elevação
export const CommandCard = ({ children, className = '', ...props }: any) => (
    <motion.div
        whileHover={{ 
            scale: 1.01,
            y: -2,
            boxShadow: "0 20px 40px rgba(0,0,0,0.05), 0 0 20px rgba(139, 92, 246, 0.05)"
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`bg-white border border-gray-100 rounded-2xl transition-all hover:border-purple-400/50 overflow-hidden ${className}`}
        {...props}
    >
        {children}
    </motion.div>
);

// TacticalButton: Botão com feedback cinético
export const TacticalButton = ({ children, color = 'purple', className = '', ...props }: any) => {
    const colorClasses = {
        purple: 'bg-gradient-to-r from-purple-600 to-pink-600 hover:shadow-lg hover:shadow-purple-200 text-white shadow-sm',
        slate: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
        danger: 'bg-red-500 hover:bg-red-400 text-white shadow-red-500/20',
        cyan: 'bg-cyan-500 hover:bg-cyan-400 text-white shadow-cyan-500/20'
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`px-6 py-3 font-sans text-xs font-bold uppercase tracking-widest transition-all rounded-xl ${colorClasses[color as keyof typeof colorClasses]} ${className}`}
            {...props}
        >
            {children}
        </motion.button>
    );
};

// StatusPulse: Indicador de sistema ativo
export const StatusPulse = ({ active = true, className = '' }: { active?: boolean, className?: string }) => (
    <div className={`relative flex h-2 w-2 ${className}`}>
        {active && (
            <motion.span 
                animate={{ scale: [1, 2.5], opacity: [0.5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"
            />
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${active ? 'bg-purple-600' : 'bg-gray-300'}`}></span>
    </div>
);

// MotionPageTransition: Transição entre páginas
export const MotionPageTransition = ({ children }: { children: React.ReactNode }) => (
    <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: TIMING.LAYOUT }}
    >
        {children}
    </motion.div>
);
