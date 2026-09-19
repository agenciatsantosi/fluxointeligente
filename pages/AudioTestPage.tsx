import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Music, Play, Volume2, Video, Terminal, AlertTriangle, CheckCircle2, RotateCcw, HelpCircle } from 'lucide-react';
import api from '../services/api';

interface LogLine {
    timestamp: string;
    text: string;
    type: 'info' | 'success' | 'warn' | 'error';
}

const AudioTestPage: React.FC = () => {
    const [videoUrl, setVideoUrl] = useState('');
    const [audioUrl, setAudioUrl] = useState('');
    const [volume, setVolume] = useState(0.25);
    const [isLoading, setIsLoading] = useState(false);
    const [mixedVideoUrl, setMixedVideoUrl] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogLine[]>([]);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    
    const logEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll logs to bottom
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const addLog = (text: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
        const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
        setLogs(prev => [...prev, { timestamp: time, text, type }]);
    };

    const handleLoadSample = () => {
        setVideoUrl('https://www.tiktok.com/@safadaindelicada/video/7356230623253503238');
        setAudioUrl('https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3');
        setVolume(0.25);
        setErrorMsg(null);
        setSuccessMsg(null);
        setLogs([]);
        addLog('📥 Dados de exemplo carregados com sucesso. Pronto para teste!', 'success');
    };

    const handleMix = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!videoUrl.trim() || !audioUrl.trim()) {
            setErrorMsg('Por favor, preencha os links do vídeo e do áudio.');
            return;
        }

        setIsLoading(true);
        setErrorMsg(null);
        setSuccessMsg(null);
        setMixedVideoUrl(null);
        setLogs([]);

        addLog('🚀 Iniciando processo de mixagem do áudio de fundo...', 'info');
        addLog(`🎛️ Volume da música configurado para: ${Math.round(volume * 100)}%`, 'info');
        
        try {
            // Step 1: Request downloader to grab video & audio
            addLog(`📥 Enviando solicitação de download para a VPS...`, 'info');
            addLog(`🔗 Vídeo Fonte: ${videoUrl.substring(0, 55)}...`, 'info');
            addLog(`🔗 Áudio MP3: ${audioUrl.substring(0, 55)}...`, 'info');

            const response = await api.post('/video/test-mix', {
                videoUrl: videoUrl.trim(),
                audioUrl: audioUrl.trim(),
                volume: parseFloat(volume.toString())
            });

            if (response.data.success && response.data.videoUrl) {
                addLog('📥 Mídias baixadas com sucesso na VPS.', 'success');
                addLog('🎛️ Iniciando processamento de áudio via FFmpeg no backend...', 'info');
                addLog('🧬 Mesclando trilhas de áudio: Original (100% Volume) + Background (Jitter & Pitch adaptado)...', 'info');
                addLog('🎬 Re-empacotando MP4 com metadados de codec AAC e H.264...', 'info');
                addLog('✅ Mixagem física de áudio concluída com sucesso pelo FFmpeg!', 'success');
                
                setMixedVideoUrl(response.data.videoUrl);
                setSuccessMsg(response.data.message || 'Mixagem concluída com sucesso!');
                addLog('📺 Live Preview gerado e disponível para reprodução!', 'success');
            } else {
                throw new Error(response.data.error || 'Erro inesperado do servidor.');
            }
        } catch (err: any) {
            const errorText = err.response?.data?.error || err.message || 'Falha ao processar mixagem.';
            setErrorMsg(errorText);
            addLog(`❌ FAILED: ${errorText}`, 'error');
            addLog('⚠️ Processamento abortado pelo sistema de proteção.', 'warn');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = () => {
        setVideoUrl('');
        setAudioUrl('');
        setVolume(0.25);
        setMixedVideoUrl(null);
        setLogs([]);
        setErrorMsg(null);
        setSuccessMsg(null);
    };

    return (
        <div className="bg-[#0b0c10] text-[#c5c6c7] p-6 border border-[#1f2833] rounded-none shadow-2xl relative overflow-hidden font-mono select-none">
            {/* Cyber Grid Overlay */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(31,40,51,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(31,40,51,0.08)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
            
            {/* Header Tech details */}
            <div className="flex justify-between items-center border-b border-[#1f2833] pb-4 mb-6 relative z-10">
                <div>
                    <span className="text-xs text-[#00ffcc] font-bold tracking-widest">// SWISS CYBERPUNK AUDIO WORKSTATION v2.0</span>
                    <h2 className="text-xl font-black text-white tracking-wider mt-1 uppercase flex items-center gap-2">
                        <Music className="w-5 h-5 text-[#39ff14] animate-pulse" /> Testador de Royalties e Mixagem FFMPEG
                    </h2>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={handleLoadSample}
                        className="px-3 py-1.5 bg-[#1f2833] hover:bg-[#39ff14] hover:text-black border border-[#39ff14]/30 hover:border-[#39ff14] text-xs font-bold transition-all uppercase rounded-none"
                    >
                        ⚡ Carregar Exemplo
                    </button>
                    <button
                        onClick={handleReset}
                        className="p-1.5 bg-[#1f2833]/30 hover:bg-red-500 hover:text-white border border-[#1f2833] text-xs transition-all rounded-none"
                        title="Limpar campos"
                    >
                        <RotateCcw className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main HUD Layout */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 relative z-10">
                
                {/* Control Panel (Left column - Col 5) */}
                <div className="xl:col-span-5 space-y-6">
                    <div className="bg-black/40 border border-[#1f2833] p-5 space-y-5 rounded-none relative">
                        <div className="absolute top-0 right-0 bg-[#39ff14] text-black text-[9px] font-bold px-2 py-0.5 tracking-widest uppercase">
                            Parâmetros HUD
                        </div>
                        <h3 className="text-sm font-bold text-white tracking-widest uppercase border-b border-[#1f2833] pb-2 flex items-center gap-2">
                            <Video className="w-4 h-4 text-[#00ffcc]" /> Origem dos Arquivos
                        </h3>

                        <form onSubmit={handleMix} className="space-y-4">
                            {/* Video URL Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[#00ffcc] uppercase flex justify-between">
                                    <span>Link do Vídeo (TikTok/IG/FB)</span>
                                    <span className="text-[10px] text-gray-500">Formato URL</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="url"
                                        value={videoUrl}
                                        onChange={(e) => setVideoUrl(e.target.value)}
                                        placeholder="Cole a URL do vídeo de origem..."
                                        className="w-full bg-[#0b0c10] border border-[#1f2833] focus:border-[#39ff14] focus:outline-none px-4 py-2.5 text-xs text-white placeholder-gray-600 rounded-none transition-all"
                                        required
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            {/* Audio URL Input */}
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold text-[#00ffcc] uppercase flex justify-between">
                                    <span>Música de Fundo (SoundOn MP3)</span>
                                    <span className="text-[10px] text-gray-500">Música Oficial</span>
                                </label>
                                <div className="relative">
                                    <input
                                        type="url"
                                        value={audioUrl}
                                        onChange={(e) => setAudioUrl(e.target.value)}
                                        placeholder="Cole a URL direta do arquivo MP3..."
                                        className="w-full bg-[#0b0c10] border border-[#1f2833] focus:border-[#39ff14] focus:outline-none px-4 py-2.5 text-xs text-white placeholder-gray-600 rounded-none transition-all"
                                        required
                                        disabled={isLoading}
                                    />
                                </div>
                            </div>

                            {/* Volume Slider control */}
                            <div className="space-y-1.5 bg-[#0b0c10]/50 border border-[#1f2833] p-4">
                                <div className="flex justify-between items-center text-xs font-bold uppercase">
                                    <span className="text-[#00ffcc] flex items-center gap-1.5">
                                        <Volume2 className="w-4 h-4 text-[#39ff14]" /> Volume de Fundo
                                    </span>
                                    <span className="text-white font-black bg-[#1f2833] px-2 py-0.5">
                                        {Math.round(volume * 100)}%
                                    </span>
                                </div>
                                <p className="text-[9px] text-gray-500 mt-1 leading-relaxed">
                                    *Recomendado: 25% para que a música de fundo ative os royalties da SoundOn sem cobrir o áudio original.
                                </p>
                                <input
                                    type="range"
                                    min="0.05"
                                    max="0.90"
                                    step="0.05"
                                    value={volume}
                                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                                    className="w-full accent-[#39ff14] h-1 bg-[#1f2833] outline-none cursor-pointer mt-3"
                                    disabled={isLoading}
                                />
                            </div>

                            {/* Action Button */}
                            <button
                                type="submit"
                                disabled={isLoading}
                                className={`w-full py-3 text-xs font-black uppercase tracking-widest transition-all rounded-none relative overflow-hidden flex items-center justify-center gap-2 border ${
                                    isLoading
                                        ? 'bg-[#1f2833]/40 border-[#1f2833] text-gray-600 cursor-not-allowed'
                                        : 'bg-[#39ff14] hover:bg-black border-[#39ff14] text-black hover:text-[#39ff14] shadow-lg shadow-[#39ff14]/10 hover:shadow-[#39ff14]/20'
                                }`}
                            >
                                {isLoading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                                        <span>Processando Mixagem...</span>
                                    </>
                                ) : (
                                    <>
                                        <Play className="w-4 h-4 fill-current" />
                                        <span>Misturar e Gerar Live Preview</span>
                                    </>
                                )}
                            </button>
                        </form>
                    </div>

                    {/* Operational advice warning box */}
                    <div className="bg-[#1f2833]/20 border border-yellow-500/20 p-4 space-y-2 rounded-none">
                        <h4 className="text-xs font-bold text-yellow-500 uppercase flex items-center gap-1.5">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0" /> Regra de Monetização Meta
                        </h4>
                        <p className="text-[10px] text-gray-400 leading-relaxed">
                            Ao mixar sua música padrão em 25% de volume, o sistema criará uma cópia idêntica. Ao postar nas redes sociais, os sistemas automáticos da Meta identificarão a música via impressão digital (fingerprint) e computarão royalties diretamente para sua conta do SoundOn.
                        </p>
                    </div>
                </div>

                {/* Preview / Logs (Right columns - Col 7) */}
                <div className="xl:col-span-7 flex flex-col gap-6">
                    
                    {/* Live Preview player area */}
                    <div className="bg-black/60 border border-[#1f2833] p-5 flex flex-col flex-1 rounded-none min-h-[350px] relative">
                        <div className="absolute top-0 right-0 bg-[#00ffcc] text-black text-[9px] font-bold px-2 py-0.5 tracking-widest uppercase">
                            Preview Realtime
                        </div>
                        <h3 className="text-sm font-bold text-white tracking-widest uppercase border-b border-[#1f2833] pb-2 mb-4 flex items-center gap-2">
                            <Play className="w-4 h-4 text-[#39ff14] fill-[#39ff14]/20" /> Player de Vídeo Mixado
                        </h3>

                        <div className="flex-1 flex items-center justify-center bg-black border border-[#1f2833] relative overflow-hidden group">
                            {mixedVideoUrl ? (
                                <video
                                    src={mixedVideoUrl}
                                    controls
                                    className="max-h-[380px] w-full object-contain"
                                />
                            ) : (
                                <div className="text-center p-6 space-y-3 relative z-10 max-w-sm">
                                    <div className="relative w-12 h-12 mx-auto mb-2 flex items-center justify-center">
                                        <div className="absolute inset-0 rounded-none border border-[#39ff14]/30 animate-pulse scale-125" />
                                        <Video className="w-6 h-6 text-gray-500 group-hover:text-[#39ff14] transition-colors" />
                                    </div>
                                    <p className="text-xs font-bold text-white uppercase tracking-wider">Aguardando Processamento</p>
                                    <p className="text-[10px] text-gray-600 leading-relaxed">
                                        Insira as URLs dos arquivos e clique em misturar para gerar e assistir ao vídeo final com o áudio mixado a 25% de volume.
                                    </p>
                                </div>
                            )}

                            {/* Sound wave overlay simulation */}
                            {isLoading && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-6 space-y-4">
                                    <div className="flex items-end gap-1 h-12">
                                        {[...Array(12)].map((_, i) => (
                                            <motion.div
                                                key={i}
                                                animate={{ height: [12, 48, 12] }}
                                                transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.08, ease: "easeInOut" }}
                                                className="w-1.5 bg-[#39ff14] rounded-none"
                                            />
                                        ))}
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs font-bold text-[#39ff14] tracking-widest uppercase animate-pulse">[ MIXANDO ÁUDIO COM FFMPEG ]</p>
                                        <p className="text-[9px] text-gray-500 mt-1 uppercase">Processamento local de alta fidelidade...</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Error and Success status notifications */}
                        <AnimatePresence mode="wait">
                            {errorMsg && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="mt-4 p-3 bg-red-950/40 border border-red-500/30 text-red-400 text-xs flex gap-2 rounded-none"
                                >
                                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                                    <div>
                                        <span className="font-bold uppercase block text-red-500">Erro de Processamento</span>
                                        <p className="mt-0.5">{errorMsg}</p>
                                    </div>
                                </motion.div>
                            )}

                            {successMsg && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    className="mt-4 p-3 bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs flex gap-2 rounded-none"
                                >
                                    <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-[#39ff14]" />
                                    <div>
                                        <span className="font-bold uppercase block text-[#39ff14]">Mixagem Concluída</span>
                                        <p className="mt-0.5">{successMsg}</p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* FFMPEG / Downloader Terminal Logger */}
                    <div className="bg-black/90 border border-[#1f2833] p-4 flex flex-col h-[200px] rounded-none">
                        <h3 className="text-xs font-bold text-white tracking-widest uppercase border-b border-[#1f2833] pb-2 mb-2 flex items-center gap-1.5">
                            <Terminal className="w-4 h-4 text-[#39ff14]" /> VPS Terminal Logger
                        </h3>
                        
                        <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar text-[11px]">
                            {logs.length === 0 ? (
                                <div className="text-gray-700 italic">// Terminal ocioso. Aguardando execução de tarefas...</div>
                            ) : (
                                logs.map((log, i) => (
                                    <div key={i} className="flex gap-2 leading-relaxed">
                                        <span className="text-gray-600 flex-shrink-0">[{log.timestamp}]</span>
                                        <span className={`
                                            ${log.type === 'success' ? 'text-[#39ff14]' : ''}
                                            ${log.type === 'warn' ? 'text-yellow-500' : ''}
                                            ${log.type === 'error' ? 'text-red-500 font-bold' : ''}
                                            ${log.type === 'info' ? 'text-gray-400' : ''}
                                        `}>
                                            {log.text}
                                        </span>
                                    </div>
                                ))
                            )}
                            <div ref={logEndRef} />
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default AudioTestPage;
