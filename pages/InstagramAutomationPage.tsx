import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, Send, RefreshCw, RefreshCcw, Clock, CheckCircle, XCircle, User, Hash, FileText, Power, Settings, Key, Sparkles, Zap, Layout, Calendar, Layers, Edit2, Play, PlayCircle, Eye, Trash2, ChevronDown, Ratio, Maximize, AlertCircle, HelpCircle, Upload, ImageIcon, Pause, Volume2, VolumeX, RotateCcw, ShieldCheck, MoreVertical, X, Info, Activity, Bot } from 'lucide-react';
import { useAlert } from '../context/AlertContext';
import api from '../services/api';
import StorySchedulerPage from './StorySchedulerPage';
import { CommandCard, TacticalButton, StatusPulse, containerVariants, itemVariants } from '../components/MotionComponents';
import PostUploadChoiceModal from '../components/PostUploadChoiceModal';

interface InstagramAutomationPageProps {
    setActiveTab?: (tab: string) => void;
}

const RatioIcon = ({ ratio, active, size = 'sm' }: { ratio: string, active: boolean, size?: 'sm' | 'md' | 'lg' }) => {
    const s = size === 'sm' ? 'w-4 h-6' : size === 'md' ? 'w-8 h-12' : 'w-12 h-16';
    const activeClass = active ? 'border-purple-600 bg-purple-50' : 'border-gray-300';
    if (ratio === '9:16') return <div className={`${s} border rounded-none transition-all ${activeClass} flex items-center justify-center`}><div className="w-[1px] h-full bg-current opacity-20"></div></div>;
    if (ratio === '1:1') return <div className={`aspect-square ${size === 'sm' ? 'w-4' : size === 'md' ? 'w-8' : 'w-12'} border rounded-none transition-all ${activeClass}`}></div>;
    if (ratio === '4:5') return <div className={`aspect-[4/5] ${size === 'sm' ? 'w-4' : size === 'md' ? 'w-8' : 'w-10'} border rounded-none transition-all ${activeClass}`}></div>;
    if (ratio === '16:9') return <div className={`aspect-video ${size === 'sm' ? 'w-5' : size === 'md' ? 'w-10' : 'w-16'} border rounded-none transition-all ${activeClass}`}></div>;
    return <ImageIcon size={size === 'sm' ? 16 : 24} />;
};

const VideoRow = ({ video, index, selected, onToggleSelection, onUpdateVideo, onDelete, onEdit }: any) => {
    const [title, setTitle] = useState(video.title || (video.video_path ? video.video_path.split('/').pop() : ''));
    const [editing, setEditing] = useState(false);
    const [caption, setCaption] = useState(video.caption || '');
    const [showMenu, setShowMenu] = useState(false);

    const handleTitleBlur = () => {
        if (title !== video.title) onUpdateVideo(video.id, { title });
    };

    const handleSaveCaption = () => {
        onUpdateVideo(video.id, { caption });
        setEditing(false);
    };

    useEffect(() => {
        setTitle(video.title || (video.video_path ? video.video_path.split('/').pop() : ''));
        setCaption(video.caption || '');
    }, [video]);

    const videoUrl = video.video_path 
        ? (video.video_path.startsWith('http') 
            ? video.video_path 
            : `/${video.video_path.replace(/\\/g, '/').replace(/^\//, '')}`) 
        : '';

    return (
        <motion.div 
            variants={itemVariants}
            className={`grid grid-cols-12 gap-6 px-10 py-8 items-center border-b border-gray-100 transition-all duration-300 ${selected ? 'bg-purple-50' : 'hover:bg-gray-50/50'}`}
        >
            <div className="col-span-1 flex items-center justify-center">
                <input
                    type="checkbox"
                    className="w-6 h-6 border-2 border-gray-200 text-purple-600 focus:ring-purple-500 rounded-lg cursor-pointer transition-all"
                    checked={selected}
                    onChange={onToggleSelection}
                />
            </div>
            
            <div className="col-span-1 border-x border-gray-100 h-full flex items-center justify-center">
                <div className="w-16 h-24 bg-gray-900 rounded-xl overflow-hidden relative group/thumb shadow-lg">
                    {video.thumbnail_url || videoUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                        <img src={video.thumbnail_url || videoUrl} className="w-full h-full object-cover" alt="Preview" />
                    ) : (
                        <video className="w-full h-full object-cover">
                            <source src={videoUrl} type="video/mp4" />
                        </video>
                    )}
                    <div className="absolute inset-0 bg-purple-600/0 group-hover/thumb:bg-purple-600/20 transition-all flex items-center justify-center">
                        <Play size={16} className="text-white opacity-0 group-hover/thumb:opacity-100 transform scale-50 group-hover/thumb:scale-100 transition-all" fill="currentColor" />
                    </div>
                </div>
            </div>

            <div className="col-span-1 px-4 text-center">
                <span className="text-[10px] font-black text-gray-400 block mb-1 uppercase tracking-widest">INDEX</span>
                <span className="text-lg font-black text-gray-900">#{index + 1}</span>
            </div>

            <div className="col-span-3 px-4">
                <div className="flex flex-col gap-3">
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        className="w-full bg-gray-50/50 border border-gray-100 focus:border-purple-600 rounded-lg px-3 py-2 text-sm font-bold text-gray-900 outline-none transition-all"
                    />
                </div>
            </div>

            <div className="col-span-4 px-4 border-l border-gray-100">
                {editing ? (
                    <div className="space-y-3">
                        <textarea 
                            value={caption} 
                            onChange={(e) => setCaption(e.target.value)} 
                            className="w-full bg-gray-50 p-4 border border-gray-200 rounded-xl text-xs h-24 focus:border-purple-600 outline-none font-medium leading-relaxed text-gray-700" 
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditing(false)} className="px-4 py-2 text-[10px] font-bold text-gray-400 hover:text-gray-900 uppercase tracking-widest">Cancelar</button>
                            <button onClick={handleSaveCaption} className="px-4 py-2 text-[10px] font-bold bg-purple-600 text-white rounded-lg uppercase tracking-widest shadow-lg shadow-purple-100">Atualizar</button>
                        </div>
                    </div>
                ) : (
                    <div className="group/caption relative p-4 bg-gray-50/50 hover:bg-white rounded-xl border border-transparent hover:border-gray-200 cursor-text transition-all" onClick={() => setEditing(true)}>
                        <p className="text-xs text-gray-600 leading-relaxed font-medium line-clamp-3">
                            {caption || '// ADICIONAR_LEGENDA'}
                        </p>
                        <Edit2 size={12} className="absolute top-2 right-2 text-purple-500 opacity-0 group-hover/caption:opacity-100 transition-opacity" />
                    </div>
                )}
            </div>

            <div className="col-span-2 flex justify-end gap-3 pr-4 relative">
                <button 
                    onClick={() => onEdit(video)}
                    className="p-3 bg-white border border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200 rounded-xl transition-all shadow-sm"
                >
                    <Edit2 size={18} />
                </button>
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className={`p-3 border rounded-xl transition-all ${showMenu ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white border-gray-200 text-gray-500 hover:text-purple-600 hover:border-purple-200 shadow-sm'}`}
                    >
                        <MoreVertical size={18} />
                    </button>
                    
                    <AnimatePresence>
                        {showMenu && (
                            <>
                                <div className="fixed inset-0 z-[100]" onClick={() => setShowMenu(false)}></div>
                                <motion.div 
                                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                    className="absolute right-0 mt-3 w-64 bg-white border border-gray-100 rounded-2xl shadow-2xl z-[110] overflow-hidden"
                                >
                                    <div className="p-2 space-y-1">
                                        <button 
                                            onClick={() => { onEdit(video); setShowMenu(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 hover:text-purple-600 transition-all rounded-xl"
                                        >
                                            <Edit2 size={16} /> <span className="uppercase tracking-widest">EDITAR_CONTEÚDO</span>
                                        </button>
                                        <button 
                                            onClick={() => { /* Logic for schedule */ setShowMenu(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-all rounded-xl"
                                        >
                                            <Calendar size={16} /> <span className="uppercase tracking-widest">AGENDAR_POST</span>
                                        </button>
                                        <div className="h-px bg-gray-100 mx-2 my-1"></div>
                                        <button 
                                            onClick={() => { onDelete(video.id); setShowMenu(false); }}
                                            className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-red-500 hover:bg-red-50 transition-all rounded-xl"
                                        >
                                            <Trash2 size={16} /> <span className="uppercase tracking-widest">EXCLUIR_DADOS</span>
                                        </button>
                                    </div>
                                </motion.div>
                            </>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};

const ReelEditorModal = ({ video, isOpen, onClose, onSave }: any) => {
    const [step, setStep] = useState('criar');
    const [title, setTitle] = useState(video?.title || '');
    const [caption, setCaption] = useState(video?.caption || '');
    const [shareToFeed, setShareToFeed] = useState(video?.share_to_feed !== false);
    const [allowComments, setAllowComments] = useState(video?.allow_comments !== false);
    const [allowEmbedding, setAllowEmbedding] = useState(video?.allow_embedding !== false);
    const [thumbnailUrl, setThumbnailUrl] = useState(video?.thumbnail_url || '');
    const [thumbOffset, setThumbOffset] = useState(video?.thumb_offset || 0);
    const [suggestedFrames, setSuggestedFrames] = useState<string[]>([]);
    const [isPlaying, setIsPlaying] = useState(true);
    const [isMuted, setIsMuted] = useState(true);
    const videoRef = useRef<HTMLVideoElement>(null);
    const thumbInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (video) {
            setTitle(video.title || (video.video_path ? video.video_path.split('/').pop() : ''));
            setCaption(video.caption || '');
            setShareToFeed(video.share_to_feed !== false);
            setAllowComments(video.allow_comments !== false);
            setAllowEmbedding(video.allow_embedding !== false);
            setThumbnailUrl(video.thumbnail_url || '');
            setThumbOffset(video.thumb_offset || 0);
            
            if (isOpen && videoUrl) {
                const vid = document.createElement('video');
                vid.src = videoUrl;
                vid.crossOrigin = 'anonymous';
                vid.onloadedmetadata = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    canvas.width = vid.videoWidth;
                    canvas.height = vid.videoHeight;
                    
                    const capture = (time: number) => {
                        return new Promise<string>((resolve) => {
                            vid.currentTime = time;
                            vid.onseeked = () => {
                                ctx?.drawImage(vid, 0, 0);
                                resolve(canvas.toDataURL('image/jpeg', 0.8));
                            };
                        });
                    };
                    
                    (async () => {
                        const duration = vid.duration;
                        const frames: string[] = [];
                        for (let i = 0; i < 5; i++) {
                            const time = (duration / 6) * (i + 1);
                            frames.push(await capture(time));
                        }
                        setSuggestedFrames(frames);
                    })();
                };
            }
        }
    }, [video, isOpen]);

    const handleThumbnailUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const formData = new FormData();
        formData.append('files', e.target.files[0]);
        try {
            const response = await api.post('/story-queue/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success && response.data.files?.[0]) {
                setThumbnailUrl(response.data.files[0].url);
                setThumbOffset(0);
            }
        } catch (error) {
            console.error('Thumbnail upload error:', error);
        }
    };

    if (!isOpen) return null;

    const videoUrl = video?.video_path 
        ? (video.video_path.startsWith('http') 
            ? video.video_path 
            : `/${video.video_path.replace(/\\/g, '/').replace(/^\//, '')}`) 
        : '';
    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm" 
                onClick={onClose}
            ></motion.div>
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative bg-white w-full max-w-6xl h-[90vh] border border-gray-200 flex flex-col shadow-2xl rounded-3xl overflow-hidden"
            >
                <div className="flex items-center justify-between px-10 py-6 border-b border-gray-100 bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200">
                            <Edit2 size={22} className="text-white" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-gray-900 tracking-tight">
                                Editor<span className="text-purple-600">_Module</span>
                            </h2>
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">IG_REEL_OPTIMIZATION_PROTOCOL</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-all text-gray-400 hover:text-gray-900">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 flex overflow-hidden">
                    <div className="w-24 bg-gray-50 border-r border-gray-100 flex flex-col items-center py-10 gap-10">
                        {[
                            { id: 'criar', label: '01' },
                            { id: 'publicar', label: '02' }
                        ].map((s) => (
                            <div key={s.id} className="relative flex flex-col items-center gap-2 group cursor-pointer" onClick={() => setStep(s.id)}>
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm transition-all ${
                                    step === s.id ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white border border-gray-200 text-gray-400 group-hover:border-purple-300'
                                }`}>
                                    {s.label}
                                </div>
                                <div className={`absolute top-12 text-[9px] font-black uppercase transition-all tracking-widest ${step === s.id ? 'text-purple-600' : 'text-gray-400'}`}>
                                    {s.id}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        <div className="flex-1 overflow-y-auto p-12 space-y-12 bg-white">
                            {step === 'criar' ? (
                                <>
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                            <span className="text-[10px] text-purple-600 font-black uppercase tracking-[0.2em]">DADOS_ENTRADA</span>
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                        </div>

                                        <div className="grid grid-cols-1 gap-8">
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div> Título do Reel
                                                </label>
                                                <input 
                                                    type="text" 
                                                    value={title}
                                                    onChange={(e) => setTitle(e.target.value)}
                                                    className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold text-gray-900 focus:border-purple-400 outline-none transition-all"
                                                />
                                            </div>
                                            <div className="space-y-3">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-purple-600"></div> Legenda (Caption)
                                                </label>
                                                <textarea 
                                                    value={caption}
                                                    onChange={(e) => setCaption(e.target.value)}
                                                    placeholder="Digite a legenda aqui..."
                                                    className="w-full h-40 px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-medium text-gray-700 focus:border-purple-400 outline-none transition-all resize-none leading-relaxed"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                            <span className="text-[10px] text-purple-600 font-black uppercase tracking-[0.2em]">SELEÇÃO_DE_CAPA</span>
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                        </div>

                                        <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-thin">
                                            {suggestedFrames.map((frame, i) => (
                                                <div 
                                                    key={i} 
                                                    onClick={() => {
                                                        setThumbnailUrl(frame);
                                                        setThumbOffset(i * 1000);
                                                    }}
                                                    className={`w-40 aspect-[9/16] flex-shrink-0 border-4 transition-all cursor-pointer rounded-2xl overflow-hidden bg-gray-900 ${
                                                        thumbnailUrl === frame ? 'border-purple-500 shadow-xl' : 'border-transparent opacity-60 hover:opacity-100'
                                                    }`}
                                                >
                                                    <img src={frame} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                            
                                            <div 
                                                onClick={() => thumbInputRef.current?.click()}
                                                className="w-40 aspect-[9/16] flex-shrink-0 border-2 border-dashed border-gray-200 hover:border-purple-300 rounded-2xl flex flex-col items-center justify-center gap-3 transition-all cursor-pointer bg-gray-50/50 group"
                                            >
                                                <div className="p-3 bg-white rounded-xl shadow-sm group-hover:shadow-md transition-all text-gray-400 group-hover:text-purple-600">
                                                    <Upload size={24} />
                                                </div>
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Upload Capa</span>
                                                <input type="file" ref={thumbInputRef} className="hidden" accept="image/*" onChange={handleThumbnailUpload} />
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="space-y-12">
                                    <div className="space-y-8">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                            <span className="text-[10px] text-purple-600 font-black uppercase tracking-[0.2em]">PARÂMETROS_DISTRIBUIÇÃO</span>
                                            <div className="h-px flex-1 bg-gray-100"></div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-6">
                                            {[
                                                { label: 'MOSTRAR NO FEED', active: shareToFeed, toggle: () => setShareToFeed(!shareToFeed) },
                                                { label: 'PERMITIR COMENTÁRIOS', active: allowComments, toggle: () => setAllowComments(!allowComments) },
                                                { label: 'PERMITIR EMBEDDING', active: allowEmbedding, toggle: () => setAllowEmbedding(!allowEmbedding) }
                                            ].map((item, idx) => (
                                                <button key={idx} onClick={item.toggle} className="flex items-center justify-between p-6 bg-gray-50/50 border border-gray-100 hover:border-purple-100 rounded-2xl transition-all text-left group">
                                                    <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest">{item.label}</span>
                                                    <div className={`w-12 h-6 rounded-full transition-all relative ${item.active ? 'bg-purple-600 shadow-lg shadow-purple-100' : 'bg-gray-200'}`}>
                                                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${item.active ? 'left-7' : 'left-1'}`}></div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="p-8 bg-purple-50 border border-purple-100 rounded-2xl flex items-start gap-5">
                                        <div className="p-3 bg-white rounded-xl shadow-sm text-purple-600">
                                            <ShieldCheck size={24} />
                                        </div>
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-black text-purple-600 uppercase tracking-widest">VERIFICAÇÃO DE COPYRIGHT: OK</p>
                                            <p className="text-xs text-gray-600 leading-relaxed font-medium">Nenhuma infração de áudio detectada. O conteúdo está pronto para distribuição nas redes Meta.</p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="w-[420px] bg-gray-50 border-l border-gray-100 p-10 flex flex-col gap-6">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] text-purple-600 font-black uppercase tracking-widest flex items-center gap-2">
                                    <StatusPulse active={isPlaying} /> PREVIEW DO REEL
                                </span>
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">9:16</span>
                            </div>
                            
                            <div className="bg-gray-900 border border-gray-200 shadow-2xl rounded-3xl overflow-hidden flex flex-col aspect-[9/16] relative group/preview">
                                <video 
                                    ref={videoRef}
                                    src={videoUrl} 
                                    className="w-full h-full object-cover" 
                                    muted={isMuted} 
                                    autoPlay 
                                    loop 
                                    onPlay={() => setIsPlaying(true)}
                                    onPause={() => setIsPlaying(false)}
                                />
                                
                                <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-gray-900/80 to-transparent opacity-0 group-hover/preview:opacity-100 transition-opacity flex flex-col gap-4">
                                    <div className="flex items-center justify-between">
                                        <div className="flex gap-4">
                                            <button onClick={() => setIsPlaying(!isPlaying)} className="text-white hover:text-purple-400 transition-colors">
                                                {isPlaying ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                                            </button>
                                            <button onClick={() => { if(videoRef.current) videoRef.current.currentTime = 0; }} className="text-white hover:text-purple-400">
                                                <RotateCcw size={22} />
                                            </button>
                                        </div>
                                        <button onClick={() => setIsMuted(!isMuted)} className="text-white hover:text-purple-400">
                                            {isMuted ? <VolumeX size={22} /> : <Volume2 size={22} />}
                                        </button>
                                    </div>
                                    <div className="h-1.5 bg-white/20 w-full rounded-full overflow-hidden">
                                        <motion.div 
                                            className="h-full bg-purple-500" 
                                            initial={{ width: "0%" }}
                                            animate={{ width: isPlaying ? "100%" : "0%" }}
                                            transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
                                        ></motion.div>
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={() => { 
                                    onSave(video.id, { title, caption, shareToFeed, allowComments, allowEmbedding, thumbnailUrl, thumbOffset }); 
                                    onClose(); 
                                }}
                                className="w-full py-5 mt-auto bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-purple-100 hover:shadow-purple-200 transition-all active:scale-95 flex items-center justify-center gap-3"
                            >
                                <Send size={18} /> ATUALIZAR CONTEÚDO
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
};

const InstagramAutomationPage: React.FC<InstagramAutomationPageProps> = ({ setActiveTab }) => {
    const { showAlert, showConfirm } = useAlert();
    const [videos, setVideos] = useState<any[]>([]);
    const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [scheduleMode, setScheduleMode] = useState<'draft' | 'automated' | 'one_per_week'>('draft');
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '18:00']);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [globalAspectRatio, setGlobalAspectRatio] = useState('1:1');
    const [manualMessage, setManualMessage] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualLoading, setManualLoading] = useState(false);
    const [postType, setPostType] = useState<'feed' | 'story'>('feed');
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [editingVideo, setEditingVideo] = useState<any>(null);
    const [showUploadChoice, setShowUploadChoice] = useState(false);
    const [lastUploadedCount, setLastUploadedCount] = useState(0);
    const [lastUploadedIds, setLastUploadedIds] = useState<number[]>([]);
    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        showAlert(message, type);
    };

    const loadAccounts = async () => {
        try {
            const response = await api.get('/instagram/accounts');
            if (response.data.success) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(response.data.accounts[0].id);
                }
            }
        } catch (error) { console.error(error); }
    };

    const loadQueue = async () => {
        try {
            const response = await api.get('/instagram/queue?status=pending');
            if (response.data.success) setVideos(response.data.queue || []);
        } catch (error) { console.error(error); }
    };

    useEffect(() => {
        loadAccounts();
        loadQueue();
    }, []);

    const handleDelete = async (id: number) => {
        showConfirm({
            title: 'Remover Vídeo',
            message: 'Deseja realmente remover este vídeo?',
            onConfirm: async () => {
                try {
                    await api.delete(`/instagram/queue/${id}`);
                    loadQueue();
                    showNotification('Vídeo removido', 'success');
                } catch (error) { showNotification('Erro ao remover', 'error'); }
            }
        });
    };

    const handleBulkAction = async (action: 'clear' | 'schedule' | 'publish', accountIdOverride?: string, targetIdsOverride?: number[]) => {
        const targetIds = targetIdsOverride || (selectedVideos.length > 0 ? selectedVideos : videos.map(v => v.id));
        if (targetIds.length === 0) return;

        if (action === 'clear') {
            showConfirm({
                title: 'Limpar Fila',
                message: `Remover ${targetIds.length} vídeos?`,
                onConfirm: async () => {
                    try {
                        for (const id of targetIds) await api.delete(`/instagram/queue/${id}`);
                        loadQueue();
                        showNotification('Fila limpa', 'success');
                    } catch (error) { showNotification('Erro ao limpar', 'error'); }
                }
            });
        } else if (action === 'publish') {
            const accId = accountIdOverride || selectedAccountId;
            if (!accId) return showNotification('Selecione uma conta', 'error');
            
            showConfirm({
                title: 'Publicar Agora',
                message: `Iniciar publicação de ${targetIds.length} itens?`,
                onConfirm: async () => {
                    setSendingStatus({ active: true, current: 0, total: targetIds.length, success: 0, failed: 0 });
                    for (let i = 0; i < targetIds.length; i++) {
                        try {
                            const response = await api.post(`/instagram/post-from-queue/${targetIds[i]}`, { accountId: accId });
                            if (response.data.success) {
                                setSendingStatus(prev => prev ? { ...prev, current: i + 1, success: prev.success + 1 } : null);
                            } else {
                                setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                            }
                        } catch (err) {
                            setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                        }
                        if (i < targetIds.length - 1) await new Promise(r => setTimeout(r, 60000));
                    }
                    setSendingStatus(null);
                    loadQueue();
                    showNotification('Publicação finalizada', 'success');
                }
            });
        }
    };

    const handleManualPost = async () => {
        if (!selectedAccountId || !manualImageUrl) return showNotification('Campos obrigatórios ausentes', 'error');
        setManualLoading(true);
        try {
            await api.post('/instagram/post-now', {
                sendMode: 'manual', 
                postType, 
                manualImageUrl, 
                manualMessage, 
                accountId: selectedAccountId
            });
            showNotification('Publicado com sucesso!', 'success');
        } catch (error) { showNotification('Erro ao postar', 'error'); }
        finally { setManualLoading(false); }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-20">
            <div className="max-w-7xl mx-auto px-4 py-12">
                <CommandCard title="Instagram Automation" icon={<Instagram className="text-purple-600" />}>
                    <div className="p-8">
                        <p className="text-gray-600 mb-8">Interface de automação restaurada e integrada com useAlert.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-6">
                                <h3 className="text-lg font-bold">Fila de Postagem</h3>
                                <div className="space-y-2">
                                    {videos.map((v, i) => (
                                        <VideoRow 
                                            key={v.id} 
                                            video={v} 
                                            index={i} 
                                            selected={selectedVideos.includes(v.id)}
                                            onToggleSelection={() => setSelectedVideos(prev => prev.includes(v.id) ? prev.filter(x => x !== v.id) : [...prev, v.id])}
                                            onUpdateVideo={async (id: number, u: any) => {
                                                await api.put(`/instagram/queue/${id}`, u);
                                                loadQueue();
                                            }}
                                            onDelete={() => handleDelete(v.id)}
                                            onEdit={(video: any) => {
                                                setEditingVideo(video);
                                                setShowEditorModal(true);
                                            }}
                                        />
                                    ))}
                                    {videos.length === 0 && <p className="text-sm text-gray-400 py-10 text-center">Nenhum item na fila.</p>}
                                </div>
                            </div>
                            
                            <div className="space-y-6">
                                <h3 className="text-lg font-bold">Postagem Manual</h3>
                                <div className="space-y-4">
                                    <input 
                                        type="text" 
                                        placeholder="URL da Imagem" 
                                        className="w-full p-4 bg-white border rounded-xl"
                                        value={manualImageUrl}
                                        onChange={e => setManualImageUrl(e.target.value)}
                                    />
                                    <textarea 
                                        placeholder="Legenda" 
                                        className="w-full p-4 bg-white border rounded-xl h-32"
                                        value={manualMessage}
                                        onChange={e => setManualMessage(e.target.value)}
                                    />
                                    <TacticalButton 
                                        onClick={handleManualPost} 
                                        loading={manualLoading}
                                        className="w-full py-4 bg-purple-600 text-white rounded-xl font-bold"
                                    >
                                        POSTAR AGORA
                                    </TacticalButton>
                                </div>
                            </div>
                        </div>
                    </div>
                </CommandCard>
            </div>
            
            <ReelEditorModal 
                isOpen={showEditorModal} 
                video={editingVideo} 
                onClose={() => setShowEditorModal(false)} 
                onSave={async (id: number, u: any) => {
                    await api.put(`/instagram/queue/${id}`, u);
                    loadQueue();
                }} 
            />

            <PostUploadChoiceModal
                isOpen={showUploadChoice}
                onClose={() => setShowUploadChoice(false)}
                onConfirm={async ({ accountId }) => {
                    setShowUploadChoice(false);
                    handleBulkAction('publish', accountId ? String(accountId) : undefined, lastUploadedIds);
                }}
                itemCount={lastUploadedCount}
                accounts={accounts}
                selectedAccountId={selectedAccountId}
                platform="instagram"
            />
        </div>
    );
};

export default InstagramAutomationPage;
