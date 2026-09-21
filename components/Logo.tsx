import React from 'react';

interface LogoProps {
    size?: number;
    showText?: boolean;
    className?: string;
    dark?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 40, showText = false, className = "", dark = false }) => {
    return (
        <div className={`flex items-center gap-3 ${className}`}>
            <div 
                style={{ width: size, height: size }}
                className="relative flex items-center justify-center shrink-0"
            >
                {/* Background Gradient Circle */}
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600 via-pink-500 to-purple-800 rounded-full shadow-lg shadow-purple-500/30 animate-pulse-slow"></div>
                
                {/* SVG Logo Content */}
                <svg 
                    viewBox="0 0 100 100" 
                    className="relative w-[70%] h-[70%] text-white"
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="4" 
                    strokeLinecap="round" 
                    strokeLinejoin="round"
                >
                    {/* Outer Rotating Arrows (Simplified) */}
                    <path d="M85 50 A35 35 0 0 1 50 85 M15 50 A35 35 0 0 1 50 15" strokeOpacity="0.6" />
                    <path d="M50 15 L55 10 M50 15 L45 10" strokeOpacity="0.8" />
                    <path d="M50 85 L45 90 M50 85 L55 90" strokeOpacity="0.8" />
                    
                    {/* Inner Bolt */}
                    <path 
                        d="M55 20 L30 55 H50 L45 80 L70 45 H50 L55 20 Z" 
                        fill="white" 
                        stroke="none"
                    />
                    
                    {/* Small accent dots */}
                    <circle cx="85" cy="50" r="3" fill="white" />
                    <circle cx="15" cy="50" r="3" fill="white" />
                </svg>
            </div>
            
            {showText && (
                <div className="flex flex-col">
                    <h1 className={`text-xl font-black leading-none tracking-tight ${dark ? 'text-white' : 'text-gray-900'}`}>
                        Fluxo<span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Inteligente</span>
                    </h1>
                    <p className={`text-[9px] font-bold tracking-[0.2em] uppercase mt-1 ${dark ? 'text-purple-200' : 'text-gray-400'}`}>PRO SYSTEM</p>
                </div>
            )}
        </div>
    );
};

export default Logo;
