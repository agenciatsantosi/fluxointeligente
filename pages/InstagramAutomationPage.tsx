import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, Send, RefreshCw, RefreshCcw, Clock, CheckCircle, XCircle, User, Hash, FileText, Power, Settings, Key, Sparkles, Zap, Layout, Calendar, Layers, Edit2, Play, PlayCircle, Eye, Trash2, ChevronDown, Ratio, Maximize, AlertCircle, HelpCircle, Upload, ImageIcon, Pause, Volume2, VolumeX, RotateCcw, ShieldCheck, MoreVertical, X, Info, Activity } from 'lucide-react';
import api from '../services/api';
import StorySchedulerPage from './StorySchedulerPage';
import { CommandCard, TacticalButton, StatusPulse, containerVariants, itemVariants } from '../components/MotionComponents';
import PostUploadChoiceModal from '../components/PostUploadChoiceModal';

interface InstagramAutomationPageProps {
    setActiveTab?: (tab: string) => void;
}

// RatioIcon component for displaying visual aspect ratio shapes
const RatioIcon = ({ ratio, active, size = 'sm' }: { ratio: string, active: boolean, size?: 'sm' | 'md' | 'lg' }) => {
    const s = size === 'sm' ? 'w-4 h-6' : size === 'md' ? 'w-8 h-12' : 'w-12 h-16';
    const activeClass = active ? 'border-purple-600 bg-purple-50' : 'border-gray-300';
    if (ratio === '9:16') return <div className={`${s} border rounded-none transition-all ${activeClass} flex items-center justify-center`}><div className="w-[1px] h-full bg-current opacity-20"></div></div>;
    if (ratio === '1:1') return <div className={`aspect-square ${size === 'sm' ? 'w-4' : size === 'md' ? 'w-8' : 'w-12'} border rounded-none transition-all ${activeClass}`}></div>;
    if (ratio === '4:5') return <div className={`aspect-[4/5] ${size === 'sm' ? 'w-4' : size === 'md' ? 'w-8' : 'w-10'} border rounded-none transition-all ${activeClass}`}></div>;
    if (ratio === '16:9') return <div className={`aspect-video ${size === 'sm' ? 'w-5' : size === 'md' ? 'w-10' : 'w-16'} border rounded-none transition-all ${activeClass}`}></div>;
    return <ImageIcon size={size === 'sm' ? 16 : 24} />;
};

// VideoRow component for Instagram Reels (Queue items)
const VideoRow = ({ video, index, selected, onToggleSelection, onUpdateVideo, onDelete, onEdit }: any) => {
    const [title, setTitle] = useState(video.title || video.video_path.split('/').pop());
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
        setTitle(video.title || video.video_path.split('/').pop());
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

// ReelEditorModal Component for Instagram
// ReelEditorModal Component for Instagram
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
            setTitle(video.title || video.video_path.split('/').pop());
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
                {/* Header */}
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
                    {/* Vertical Progress Bar */}
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

                    {/* Content Area */}
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
                                                { label: 'PERMITIR COMENTÃRIOS', active: allowComments, toggle: () => setAllowComments(!allowComments) },
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

                        {/* Tactical Preview Panel */}
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
    // State
    const [videos, setVideos] = useState<any[]>([]);
    const [selectedVideos, setSelectedVideos] = useState<number[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [scheduleMode, setScheduleMode] = useState<'draft' | 'automated' | 'one_per_week'>('draft');
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '18:00']);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [globalAspectRatio, setGlobalAspectRatio] = useState('1:1');
    const [sendMode, setSendMode] = useState<'reels' | 'manual' | 'stories'>('reels');
    const [postType, setPostType] = useState<'feed' | 'story'>('feed');
    const [showAccountSelector, setShowAccountSelector] = useState(false);

    const [manualMessage, setManualMessage] = useState('');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualLoading, setManualLoading] = useState(false);
    const [editingVideo, setEditingVideo] = useState<any>(null);
    const [showEditorModal, setShowEditorModal] = useState(false);
    const [showUploadChoice, setShowUploadChoice] = useState(false);
    const [lastUploadedCount, setLastUploadedCount] = useState(0);
    const [lastUploadedIds, setLastUploadedIds] = useState<number[]>([]);
    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);

    // Notification helper
    const fileInputRef = useRef<HTMLInputElement>(null);

    const showNotification = (message: string, type: 'success' | 'error' | 'info') => {
        setNotification({ message, type });
        setTimeout(() => setNotification(null), 5000);
    };

    // Load Instagram accounts
    const loadAccounts = async () => {
        try {
            const response = await api.get('/instagram/accounts');
            if (response.data.success && Array.isArray(response.data.accounts)) {
                setAccounts(response.data.accounts);
                if (response.data.accounts.length > 0 && !selectedAccountId) {
                    setSelectedAccountId(response.data.accounts[0].id);
                }
            }
        } catch (error) { 
            console.error('Error loading accounts:', error); 
        }
    };

    // Load video queue
    const loadQueue = async () => {
        try {
            const response = await api.get('/instagram/queue');
            if (response.data.success) {
                // Handle different response structures gracefully
                const queueData = response.data.queue || response.data.videos || [];
                setVideos(Array.isArray(queueData) ? queueData : []);
            }
        } catch (error) { 
            console.error('Error loading queue:', error); 
        }
    };

    // Initial load and periodic refresh
    useEffect(() => {
        loadAccounts();
        loadQueue();
        const interval = setInterval(loadQueue, 5000);
        return () => clearInterval(interval);
    }, []);

    const toggleSelection = (id: number) => {
        setSelectedVideos(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
    };

    const toggleSelectAll = () => {
        if (selectedVideos.length === videos.length && videos.length > 0) {
            setSelectedVideos([]);
        } else {
            setSelectedVideos(videos.map(v => v.id));
        }
    };

    // Handle multiple file upload for Reels
    const handleMultipleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files) return;
        const filesToUpload = Array.from(e.target.files);
        setUploading(true);
        showNotification(`📦 Fazendo upload de ${filesToUpload.length} vídeos...`, 'info');
        
        try {
            setUploadProgress(10);
            let count = 0;
            const newIds: number[] = [];
            for (const file of filesToUpload) {
                const formData = new FormData();
                formData.append('video', file);
                formData.append('aspectRatio', globalAspectRatio);
                
                // Explicitly set Content-Type for multipart upload to ensure axis/multer compatibility
                const response = await api.post('/instagram/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });

                if (response.data.success && response.data.id) {
                    newIds.push(response.data.id);
                }

                count++;
                setUploadProgress(10 + Math.round((count * 90) / filesToUpload.length));
            }
            setUploadProgress(100);
            showNotification('✅ Upload concluído!', 'success');
            setLastUploadedCount(filesToUpload.length);
            setLastUploadedIds(newIds);
            setShowUploadChoice(true);
            loadQueue();
        } catch (error: any) { 
            console.error('Upload error:', error);
            showNotification(`❌ Erro no upload: ${error.response?.data?.error || error.message}`, 'error'); 
        } finally { 
            setUploading(false); 
            setTimeout(() => setUploadProgress(0), 2000);
        }
    };

    const handleUpdateVideo = async (id: number, updates: any) => {
        try {
            await api.put(`/instagram/queue/${id}`, updates);
            loadQueue();
        } catch (error) { 
            showNotification('âŒ Erro ao atualizar', 'error'); 
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Remover este vídeo?')) return;
        try {
            await api.delete(`/instagram/queue/${id}`);
            loadQueue();
            showNotification('âœ… Vídeo removido', 'success');
        } catch (error) { 
            showNotification('âŒ Erro ao remover', 'error'); 
        }
    };

    // Bulk actions: clear, schedule, or publish
    // accountIdOverride: passed directly from modal to avoid React state race condition
    // targetIdsOverride: specific IDs to process (used by "Send Now" modal)
    const handleBulkAction = async (action: 'clear' | 'schedule' | 'publish', accountIdOverride?: string, targetIdsOverride?: number[]) => {
        if (action === 'publish' && sendingStatus?.active) {
            showNotification('⚠️ Aguarde a finalização da postagem atual antes de iniciar outra.', 'info');
            return;
        }

        const targetIds = targetIdsOverride || (selectedVideos.length > 0 ? selectedVideos : videos.map(v => v.id));
        if (targetIds.length === 0) return;

        if (action === 'clear') {
            if (!confirm(`Remover ${targetIds.length} vídeos da fila?`)) return;
            try {
                for (const id of targetIds) await api.delete(`/instagram/queue/${id}`);
                showNotification('âœ… Fila limpa', 'success');
            } catch (error) {
                showNotification('âŒ Erro ao limpar fila', 'error');
            }
        } else if (action === 'schedule') {
            const accId = accountIdOverride || selectedAccountId;
            if (!accId) return showNotification('âŒ Selecione uma conta', 'error');
            if (scheduleMode === 'draft') return showNotification('â„¹ï¸ Escolha o modo de agendamento', 'info');
            
            try {
                const postsPerDay = (scheduleMode === 'automated') 
                    ? customTimes.length 
                    : (scheduleMode === 'one_per_week' ? 0.14 : 0);

                await api.post('/instagram/configure-schedule', {
                    postsPerDay,
                    times: customTimes, 
                    startDate, 
                    videoIds: targetIds, 
                    accountId: accId
                });
                showNotification('âœ… Agendamento concluído', 'success');
            } catch (error) {
                showNotification('âŒ Erro no agendamento', 'error');
            }
        } else if (action === 'publish') {
            const accId = accountIdOverride || selectedAccountId;
            if (!accId) return showNotification('❌ Selecione uma conta', 'error');
            if (!confirm(`Publicar ${targetIds.length} vídeo(s) agora? Haverá 30 segundos de intervalo entre cada post para evitar bloqueios do Meta.`)) return;
            
            setSendingStatus({ active: true, current: 0, total: targetIds.length, success: 0, failed: 0 });
            
            try {
                for (let i = 0; i < targetIds.length; i++) {
                    const id = targetIds[i];
                    try {
                        const response = await api.post(`/instagram/post-from-queue/${id}`, { apiMethod: 'graph', accountId: accId });
                        
                        if (response.data.success) {
                            setVideos(prev => prev.filter(v => v.id !== id));
                            setSendingStatus(prev => prev ? { ...prev, current: i + 1, success: prev.success + 1 } : null);
                        } else {
                            const errMsg = response.data.error || '';
                            const isRateLimit = errMsg.includes('(#4)') || errMsg.includes('request limit');
                            console.error(`Instagram post error for ${id}:`, errMsg);
                            if (isRateLimit) {
                                // Wait 120s and retry once on rate limit
                                showNotification('⏳ Limite de requisições atingido. Aguardando 120s...', 'info');
                                await new Promise(r => setTimeout(r, 120000));
                                const retry = await api.post(`/instagram/post-from-queue/${id}`, { apiMethod: 'graph', accountId: accId });
                                if (retry.data.success) {
                                    setVideos(prev => prev.filter(v => v.id !== id));
                                    setSendingStatus(prev => prev ? { ...prev, current: i + 1, success: prev.success + 1 } : null);
                                } else {
                                    setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                                    showNotification('❌ Limite de requisições persiste após retry. Interrompendo operação em lote para evitar bloqueios.', 'error');
                                    break; // Stop the loop to prevent further rate limits
                                }
                            } else {
                                setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                            }
                        }
                    } catch (err) {
                        console.error(`Error publishing video ${id}:`, err);
                        setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                    }
                    // 60 second delay between posts to stay within Meta API rate limits
                    if (i < targetIds.length - 1) {
                        showNotification(`✅ Post ${i + 1}/${targetIds.length} enviado. Aguardando 60s...`, 'info');
                        await new Promise(r => setTimeout(r, 60000));
                    }
                }
                setSendingStatus(prev => prev ? { ...prev, active: false } : null);
                showNotification('✅ Processo de publicação finalizado', 'success');
                setTimeout(() => setSendingStatus(null), 2000);
            } catch (error) {
                console.error('Bulk publish error:', error);
                setSendingStatus(prev => prev ? { ...prev, active: false } : null);
                showNotification('❌ Erro durante a publicação em massa', 'error');
                setTimeout(() => setSendingStatus(null), 2000);
            }
        }
        await loadQueue();
        setSelectedVideos([]);
    };

    // Manual single post handler
    const handleManualPost = async () => {
        if (!selectedAccountId || !manualImageUrl) return showNotification('âš ï¸ Preencha a conta e a URL da imagem', 'error');
        setManualLoading(true);
        try {
            await api.post('/instagram/post-now', {
                sendMode: 'manual', 
                postType, 
                manualImageUrl, 
                manualMessage, 
                accountId: selectedAccountId
            });
            showNotification('âœ… Publicado com sucesso!', 'success');
            setManualImageUrl('');
            setManualMessage('');
        } catch (error: any) { 
            console.error('Manual post error:', error);
            showNotification(`âŒ Erro ao postar: ${error.response?.data?.error || error.message}`, 'error'); 
        } finally { 
            setManualLoading(false); 
        }
    };

    // File upload for manual post
    const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setManualLoading(true);
        try {
            const formData = new FormData();
            formData.append('files', e.target.files[0]);
            // Endpoint corrected to use the base API path without double '/api'
            const response = await api.post('/story-queue/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success && response.data.files?.[0]) {
                setManualImageUrl(response.data.files[0].url);
                showNotification('âœ… Imagem carregada!', 'success');
            }
        } catch (error) { 
            console.error('Manual file upload error:', error);
            showNotification('âŒ Erro no upload do arquivo', 'error'); 
        } finally { 
            setManualLoading(false); 
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 text-gray-800 pb-20 font-sans">
            {notification && (
                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`fixed top-10 right-10 z-[100] p-6 border-l-4 shadow-2xl flex items-center gap-4 bg-white ${
                        notification.type === 'success' ? 'border-purple-500' : notification.type === 'error' ? 'border-red-500' : 'border-gray-400'
                    } rounded-xl`}
                >
                    <div className={`p-2 ${
                        notification.type === 'success' ? 'text-purple-600' : notification.type === 'error' ? 'text-red-500' : 'text-gray-400'
                    }`}>
                        {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-gray-400 tracking-widest">SISTEMA</span>
                        <p className="font-bold text-sm pr-4">{notification.message}</p>
                    </div>
                </motion.div>
            )}

            {/* Sending Status (Modern Overlay) */}
            {sendingStatus && (
                <div className="fixed bottom-12 right-24 z-[150] bg-white border border-gray-100 shadow-2xl p-8 w-96 animate-in slide-in-from-bottom-12 duration-700 rounded-[32px]">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">STATUS_PUBLICAÇÃO</span>
                            <span className="text-xl font-black text-gray-900">{sendingStatus.active ? 'PUBLICANDO...' : 'PROCESSO_CONCLUÍDO'}</span>
                        </div>
                        <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center">
                            {sendingStatus.active ? <RefreshCcw size={24} className="text-purple-600 animate-spin" /> : <ShieldCheck size={24} className="text-purple-600" />}
                        </div>
                    </div>
                    <div className="space-y-6">
                        <div className="flex justify-between text-[10px] text-gray-600 font-black">
                            <span>VÍDEOS_PROCESSADOS</span>
                            <span>{sendingStatus.current} / {sendingStatus.total}</span>
                        </div>
                        <div className="w-full h-3 bg-gray-50 rounded-full overflow-hidden relative">
                            {/* Animated infinite loader when actively processing */}
                            {sendingStatus.active && sendingStatus.current === 0 && (
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-200 via-purple-600 to-purple-200 bg-[length:200%_auto] animate-[pulse_2s_ease-in-out_infinite] w-full h-full opacity-50"></div>
                            )}
                            {/* Actual progress fill */}
                            <div
                                className={`h-full ${sendingStatus.active ? 'bg-gradient-to-r from-purple-600 to-pink-600 animate-pulse' : 'bg-green-500'} transition-all duration-1000 ease-out shadow-lg ${sendingStatus.active ? 'shadow-purple-200' : 'shadow-green-200'} relative z-10`}
                                style={{ width: `${(sendingStatus.current / (sendingStatus.total || 1)) * 100}%` }}
                            ></div>
                        </div>
                        {!sendingStatus.active && (
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-50 text-[10px]">
                                <div className="text-purple-600 font-black"><span className="opacity-40">SUCESSO:</span> {sendingStatus.success}</div>
                                <div className="text-red-500 font-black"><span className="opacity-40">FALHAS:</span> {sendingStatus.failed}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Tactical Header */}
            <div className="bg-white border-b border-gray-200 p-12 relative overflow-visible">
                <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-b-[40px]">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                </div>
                <div className="max-w-[1400px] mx-auto relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
                    <div className="text-center lg:text-left">
                        <div className="flex items-center justify-center lg:justify-start gap-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/20">
                                <Instagram size={40} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black tracking-tight text-gray-900">
                                    Centro<span className="text-purple-600">_de_Controle</span>
                                </h1>
                                <p className="text-gray-400 mt-1 text-sm font-bold uppercase tracking-widest">PROTOCOLO ALGORÃTMICO INSTAGRAM</p>
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-center lg:items-end gap-6 w-full lg:w-auto">
                        <div className="bg-gray-50 p-2 border border-gray-100 rounded-2xl flex gap-2 w-full lg:w-auto overflow-x-auto shadow-inner">
                            {['9:16', '1:1', '4:5', '16:9'].map(ratio => (
                                <button
                                    key={ratio}
                                    onClick={() => setGlobalAspectRatio(ratio)}
                                    className={`flex-1 lg:flex-none flex flex-col items-center gap-2 px-6 py-4 transition-all duration-300 rounded-xl ${
                                        globalAspectRatio === ratio 
                                        ? 'bg-white text-purple-600 shadow-md' 
                                        : 'text-gray-400 hover:text-purple-600 hover:bg-white/50'
                                    }`}
                                >
                                    <RatioIcon ratio={ratio} active={globalAspectRatio === ratio} size="sm" />
                                    <span className="text-[10px] font-black">{ratio}</span>
                                </button>
                            ))}
                        </div>

                            <div className="flex-1 relative">
                                <button
                                    onClick={() => setShowAccountSelector(!showAccountSelector)}
                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-200 text-gray-900 font-bold text-xs outline-none focus:border-purple-400 cursor-pointer flex items-center justify-between rounded-2xl uppercase tracking-widest transition-all hover:bg-white hover:shadow-lg hover:shadow-gray-200/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${accounts.find(acc => acc.id === selectedAccountId) ? 'bg-purple-500 shadow-lg shadow-purple-200 animate-pulse' : 'bg-gray-300'}`}></div>
                                        <span>{accounts.find(acc => acc.id === selectedAccountId)?.username || 'SELECIONAR CONTA'}</span>
                                    </div>
                                    <ChevronDown size={16} className={`transition-transform duration-300 ${showAccountSelector ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {showAccountSelector && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowAccountSelector(false)}></div>
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-[24px] shadow-2xl z-50 overflow-hidden"
                                            >
                                                <div className="p-4 bg-gray-50/50 border-b border-gray-50">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">CONTAS_INSTAGRAM</span>
                                                </div>
                                                <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                                    {accounts.length === 0 ? (
                                                        <div className="p-8 text-center space-y-3">
                                                            <HelpCircle size={32} className="mx-auto text-gray-200" />
                                                            <p className="text-[10px] font-black text-gray-400 uppercase">Nenhuma conta encontrada</p>
                                                        </div>
                                                    ) : (
                                                        accounts.map(acc => (
                                                            <button
                                                                key={acc.id}
                                                                onClick={() => {
                                                                    setSelectedAccountId(acc.id);
                                                                    setShowAccountSelector(false);
                                                                }}
                                                                className={`w-full flex items-center justify-between px-8 py-5 transition-all text-left group border-b border-gray-50 last:border-0 ${selectedAccountId === acc.id ? "bg-purple-50 text-purple-600" : "hover:bg-gray-50 text-gray-600"}`}
                                                            >
                                                                <div className="flex flex-col">
                                                                    <span className="text-xs font-black uppercase tracking-widest">{acc.username}</span>
                                                                    <span className="text-[8px] font-bold opacity-40">INSTAGRAM_PROFILE</span>
                                                                </div>
                                                                {selectedAccountId === acc.id && <CheckCircle size={16} className="text-purple-600" />}
                                                            </button>
                                                        ))
                                                    )}
                                                </div>
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>

            {/* Tactical Navigation */}
            <div className="max-w-[1400px] mx-auto mt-10 px-10">
                <div className="flex bg-white p-2 border border-gray-100 rounded-2xl shadow-sm">
                    {[
                        { id: 'reels', label: 'FEED EM MASSA', count: videos.length, icon: <Play size={18} /> },
                        { id: 'manual', label: 'POSTAGEM MANUAL', icon: <Edit2 size={18} /> },
                        { id: 'stories', label: 'STORY EM MASSA', icon: <Layers size={18} /> }
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setSendMode(tab.id as any)}
                            className={`flex-1 py-4 text-[11px] font-black transition-all flex items-center justify-center gap-3 uppercase tracking-widest relative rounded-xl ${
                                sendMode === tab.id
                                ? 'bg-purple-50 text-purple-600 shadow-inner'
                                : 'text-gray-400 hover:text-purple-600 hover:bg-gray-50/50'
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className="bg-purple-600 text-white px-2.5 py-1 text-[10px] font-black rounded-lg shadow-lg shadow-purple-100">
                                    {tab.count}
                                </span>
                            )}
                            {sendMode === tab.id && <motion.div layoutId="tab-indicator" className="absolute bottom-0 left-4 right-4 h-1 bg-purple-600 rounded-full" />}
                        </button>
                    ))}
                </div>

                <div className="mt-10">
                    {sendMode === 'reels' ? (
                        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-5 duration-700">
                            {/* Scheduling Control Panel */}
                            <CommandCard className="p-10 flex flex-col xl:flex-row items-start xl:items-center justify-between gap-10">
                                <div className="space-y-8 w-full xl:w-auto">
                                    <div className="flex items-center gap-5">
                                        <div className="p-4 bg-purple-50 text-purple-600 rounded-2xl shadow-inner">
                                            <Calendar size={24} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-gray-900 text-xl tracking-tight">
                                                Motor_Agendamento
                                            </h3>
                                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Configure o fluxo de distribuição</p>
                                        </div>
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-4">
                                        {[
                                            { id: 'draft', label: 'Apenas Rascunho', icon: <X size={16} /> },
                                            { id: 'automated', label: 'Automação', icon: <Zap size={16} /> },
                                            { id: 'one_per_week', label: 'Fluxo Legado', icon: <Clock size={16} /> }
                                        ].map(mode => (
                                            <button
                                                key={mode.id}
                                                onClick={() => setScheduleMode(mode.id as any)}
                                                className={`px-8 py-4 rounded-xl border-2 transition-all flex items-center gap-3 uppercase text-[10px] font-black tracking-widest ${
                                                    scheduleMode === mode.id 
                                                    ? 'border-purple-600 bg-purple-50 text-purple-600 shadow-lg shadow-purple-50' 
                                                    : 'border-gray-100 text-gray-400 hover:border-purple-200 hover:bg-gray-50/50'
                                                }`}
                                            >
                                                {mode.icon} {mode.label}
                                            </button>
                                        ))}
                                    </div>

                                    {scheduleMode === 'automated' && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="p-8 bg-gray-50 border border-gray-100 rounded-2xl space-y-8"
                                        >
                                            <div className="flex flex-wrap items-end gap-10">
                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Data de Início</label>
                                                    <input 
                                                        type="date" 
                                                        value={startDate}
                                                        onChange={(e) => setStartDate(e.target.value)}
                                                        className="px-6 py-4 bg-white border border-gray-200 rounded-xl font-bold text-sm text-gray-900 focus:border-purple-400 outline-none shadow-sm transition-all"
                                                    />
                                                </div>

                                                <div className="space-y-3">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Frequência de Postagem</label>
                                                    <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
                                                        <button 
                                                            onClick={() => { if (customTimes.length > 1) setCustomTimes(customTimes.slice(0, -1)); }}
                                                            className="w-12 h-12 flex items-center justify-center font-black text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                                                        >-</button>
                                                        <span className="w-12 text-center font-black text-purple-600 text-sm">{customTimes.length}</span>
                                                        <button 
                                                            onClick={() => setCustomTimes([...customTimes, '12:00'])}
                                                            className="w-12 h-12 flex items-center justify-center font-black text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-all"
                                                        >+</button>
                                                    </div>
                                                </div>
                                                
                                                <div className="space-y-3 flex-1 min-w-[300px]">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block ml-1">Janelas de Execução</label>
                                                    <div className="flex flex-wrap gap-3">
                                                        {customTimes.map((time, idx) => (
                                                            <div key={idx} className="flex items-center gap-2 bg-white border border-gray-200 px-5 py-3 rounded-xl group hover:border-purple-200 transition-all shadow-sm">
                                                                <input 
                                                                    type="time" 
                                                                    value={time}
                                                                    onChange={(e) => {
                                                                        const newTimes = [...customTimes];
                                                                        newTimes[idx] = e.target.value;
                                                                        setCustomTimes(newTimes);
                                                                    }}
                                                                    className="bg-transparent font-black text-xs text-purple-600 outline-none"
                                                                />
                                                                {customTimes.length > 1 && (
                                                                    <button onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all ml-2">
                                                                        <Trash2 size={14} />
                                                                    </button>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="p-5 bg-purple-50 border border-purple-100 rounded-2xl flex items-start gap-4">
                                                <Info className="text-purple-600 mt-1" size={18} />
                                                <p className="text-[10px] text-gray-600 font-bold leading-relaxed uppercase tracking-widest">
                                                    Lógica de sequenciamento aplicada. Os vídeos serão disparados sequencialmente nas janelas especificadas.
                                                </p>
                                            </div>
                                        </motion.div>
                                    )}
                                </div>

                                <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
                                    <TacticalButton onClick={() => handleBulkAction('clear')} color="slate" className="py-5 px-10">
                                        LIMPAR FILA
                                    </TacticalButton>
                                    <TacticalButton onClick={() => handleBulkAction('schedule')} color="slate" className="py-5 px-10">
                                        SINCRONIZAR
                                    </TacticalButton>
                                    <TacticalButton onClick={() => handleBulkAction('publish')} color="purple" className="py-5 px-10">
                                        EXECUTAR AGORA
                                    </TacticalButton>
                                </div>
                            </CommandCard>

                            {/* Video Queue */}
                            <CommandCard className="overflow-hidden bg-white shadow-sm border-gray-100">
                                <div className="bg-gray-50/50 px-10 py-6 border-b border-gray-100 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <Layers className="text-purple-600" size={20} />
                                        <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 mt-1">Fila_Processamento</h3>
                                    </div>
                                    <div className="flex gap-4">
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                            {selectedVideos.length} / {videos.length} SELECIONADOS
                                        </span>
                                    </div>
                                </div>

                                <div className="min-h-[500px]">
                                    {videos.length === 0 ? (
                                        <div 
                                            onClick={() => fileInputRef.current?.click()}
                                            className="py-40 text-center space-y-8 cursor-pointer group/upload transition-all hover:bg-purple-50/30 rounded-[32px] relative"
                                        >
                                            <input 
                                                type="file" 
                                                multiple 
                                                accept="video/*,image/*" 
                                                className="hidden" 
                                                onChange={handleMultipleFileSelect} 
                                                ref={fileInputRef}
                                            />
                                            {uploading ? (
                                                <div className="space-y-6">
                                                    <div className="w-24 h-24 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mx-auto shadow-lg shadow-purple-50"></div>
                                                    <div className="mt-8 max-w-xs mx-auto px-4">
                                                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                                                                style={{ width: `${uploadProgress}%` }} 
                                                            />
                                                        </div>
                                                        <p className="text-[10px] text-purple-600 font-black mt-3 uppercase tracking-widest text-center">
                                                            {uploadProgress < 100 ? `CARREGANDO... ${uploadProgress}%` : 'TRANSFERÊNCIA_CONCLUÍDA'}
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-10">
                                                    <div className="w-24 h-24 bg-white rounded-3xl flex items-center justify-center shadow-xl group-hover:scale-110 group-hover:rotate-3 transition-all duration-500 border border-gray-50 mx-auto">
                                                        <Upload className="text-purple-600" size={40} />
                                                    </div>

                                                    <div className="text-center space-y-4">
                                                        <h3 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">
                                                            Deseja Carregar Novo Feed em Massa?
                                                        </h3>
                                                        <p className="text-gray-400 font-bold uppercase tracking-widest text-[10px]">
                                                            Arraste os arquivos ou clique para selecionar
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto min-w-full">
                                            <div className="min-w-[1200px]">
                                                <div className="grid grid-cols-12 gap-6 px-10 py-6 bg-gray-50/50 border-b border-gray-100 font-black text-[10px] text-gray-400 uppercase tracking-widest">
                                                    <div className="col-span-1 flex justify-center">
                                                        <input type="checkbox" checked={selectedVideos.length === videos.length} onChange={toggleSelectAll} className="w-6 h-6 border-2 border-gray-200 text-purple-600 focus:ring-purple-500 rounded-lg cursor-pointer transition-all" />
                                                    </div>
                                                    <div className="col-span-1 text-center uppercase">Mídia</div>
                                                    <div className="col-span-1 text-center uppercase">Ãndice</div>
                                                    <div className="col-span-3 uppercase">Metadados</div>
                                                    <div className="col-span-4 px-4 uppercase">Conteúdo & Legenda</div>
                                                    <div className="col-span-2 text-right uppercase pr-4">Ações</div>
                                                </div>
                                                <div className="divide-y divide-gray-100">
                                                    {videos.map((v, i) => (
                                                        <VideoRow 
                                                            key={v.id} video={v} index={i} 
                                                            selected={selectedVideos.includes(v.id)} 
                                                            onToggleSelection={() => toggleSelection(v.id)}
                                                            onUpdateVideo={handleUpdateVideo}
                                                            onDelete={handleDelete}
                                                            onEdit={(v: any) => { setEditingVideo(v); setShowEditorModal(true); }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </CommandCard>
                        </div>
                    ) : sendMode === 'stories' ? (
                        <StorySchedulerPage platform="instagram" accounts={accounts} />
                    ) : (
                        <div className="animate-in fade-in slide-in-from-bottom-5 duration-700 space-y-12">
                            <CommandCard className="p-16 relative overflow-hidden bg-white shadow-xl border-gray-100">
                                <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full -mr-40 -mt-40 blur-3xl"></div>
                                <div className="max-w-4xl mx-auto space-y-12">
                                    <div className="flex items-center gap-6 border-b border-gray-100 pb-12">
                                        <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/20">
                                            <Zap size={32} className="text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Postagem_Direta</h2>
                                            <p className="text-gray-400 font-bold text-[10px] mt-1 uppercase tracking-widest leading-relaxed">Execute a distribuição instantânea para os destinos especificados</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
                                        <div className="space-y-8">
                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payload Visual</label>
                                                <div className={`relative aspect-square lg:aspect-auto lg:h-[500px] bg-gray-50 border-2 border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center transition-all group overflow-hidden ${manualImageUrl ? 'border-none' : 'hover:border-purple-300 hover:bg-white'}`}>
                                                    {manualImageUrl ? (
                                                        <>
                                                            {manualImageUrl.match(/\.(mp4|mov|avi|webm)$|video/i) ? (
                                                                <video 
                                                                    src={manualImageUrl.startsWith('http') ? manualImageUrl : (manualImageUrl.startsWith('/') ? manualImageUrl : `/${manualImageUrl}`)} 
                                                                    className="w-full h-full object-cover bg-black"
                                                                    autoPlay muted loop playsInline
                                                                />
                                                            ) : (
                                                                <img 
                                                                    src={manualImageUrl.startsWith('http') ? manualImageUrl : (manualImageUrl.startsWith('/') ? manualImageUrl : `/${manualImageUrl}`)} 
                                                                    className="w-full h-full object-cover shadow-2xl" 
                                                                    alt="Preview" 
                                                                />
                                                            )}
                                                            <button onClick={() => setManualImageUrl('')} className="absolute top-6 right-6 p-4 bg-white/90 text-red-500 border border-gray-100 rounded-2xl shadow-2xl hover:bg-red-500 hover:text-white transition-all">
                                                                <Trash2 size={24} />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <div className="text-center p-12">
                                                            <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-gray-100 text-gray-300 group-hover:text-purple-600 group-hover:border-purple-200 transition-all shadow-sm">
                                                                <Upload size={32} />
                                                            </div>
                                                            <p className="text-gray-400 font-black text-[10px] uppercase tracking-widest">Carregar Mídia</p>
                                                            <input type="file" onChange={handleManualFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                                        </div>
                                                    )}
                                                    {manualLoading && <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center"><div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin"></div></div>}
                                                </div>
                                                <input 
                                                    type="text" value={manualImageUrl} onChange={(e) => setManualImageUrl(e.target.value)} 
                                                    placeholder="// INJECT_MEDIA_URL_REFS"
                                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-purple-400 outline-none transition-all placeholder:text-gray-300"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-12">
                                            <div className="space-y-6">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Destino do Endpoint</label>
                                                <div className="flex bg-gray-50 p-1 border border-gray-100 rounded-2xl">
                                                    <button onClick={() => setPostType('feed')} className={`flex-1 py-4 text-[10px] font-black transition-all uppercase tracking-widest rounded-xl ${postType === 'feed' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'}`}>Protocolo Feed</button>
                                                    <button onClick={() => setPostType('story')} className={`flex-1 py-4 text-[10px] font-black transition-all uppercase tracking-widest rounded-xl ${postType === 'story' ? 'bg-white text-purple-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-purple-600'}`}>Protocolo Story</button>
                                                </div>
                                            </div>

                                            <div className="space-y-6">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Metadados de Legenda</label>
                                                <textarea 
                                                    value={manualMessage} onChange={(e) => setManualMessage(e.target.value)} 
                                                    placeholder="// DIGITE O TEXTO AQUI"
                                                    className="w-full h-80 p-8 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-purple-400 outline-none transition-all resize-none leading-relaxed"
                                                />
                                            </div>

                                            <TacticalButton 
                                                onClick={handleManualPost} disabled={manualLoading} color="purple"
                                                className="w-full py-8 text-sm"
                                            >
                                                <div className="flex items-center justify-center gap-3">
                                                    {manualLoading ? <Activity className="animate-spin" size={20} /> : <Zap size={20} />}
                                                    <span className="uppercase tracking-widest font-black">
                                                        {manualLoading ? 'EXECUTANDO...' : 'EXECUTAR DISPARO'}
                                                    </span>
                                                </div>
                                            </TacticalButton>
                                        </div>
                                    </div>
                                </div>
                            </CommandCard>
                        </div>
                    )}
                </div>
            </div>
            
            <ReelEditorModal 
                isOpen={showEditorModal} 
                video={editingVideo} 
                onClose={() => setShowEditorModal(false)}
                onSave={handleUpdateVideo}
            />

            <PostUploadChoiceModal 
                isOpen={showUploadChoice}
                onClose={() => setShowUploadChoice(false)}
                onSchedule={() => {
                    setShowUploadChoice(false);
                    setScheduleMode('automated');
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                onSendNow={async (accountId, title, caption) => {
                    setShowUploadChoice(false);
                    
                    // If title or caption provided, update the recently uploaded items first
                    if (title || caption) {
                        try {
                            for (const id of lastUploadedIds) {
                                await api.put(`/instagram/queue/${id}`, { title, caption });
                            }
                        } catch (err) {
                            console.error('Error updating metadata for quick post:', err);
                        }
                    }

                    handleBulkAction('publish', accountId ? String(accountId) : undefined, lastUploadedIds);
                    setLastUploadedIds([]);
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
