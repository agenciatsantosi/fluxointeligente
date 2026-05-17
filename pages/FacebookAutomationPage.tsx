import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Facebook, Send, RefreshCw, Clock, CheckCircle, XCircle, User, Hash, FileText, Power, Settings, Key, Sparkles, Zap, Layout, Calendar, Layers, Edit2, Play, PlayCircle, Eye, Trash2, ChevronDown, Ratio, Maximize, AlertCircle, HelpCircle, Upload, ImageIcon, Pause, Volume2, VolumeX, RotateCcw, ShieldCheck, MoreVertical, X, Info, Activity, Trash, RefreshCcw, Bot, Target, Users, Link as LinkIcon, Tag, Globe } from 'lucide-react';

import { useAlert } from '../context/AlertContext';
import { useProducts } from '../context/ProductContext';
import api from '../services/api';
import StorySchedulerPage from './StorySchedulerPage';
import { CommandCard, TacticalButton, StatusPulse, containerVariants, itemVariants } from '../components/MotionComponents';
import PostUploadChoiceModal from '../components/PostUploadChoiceModal';

interface FacebookAutomationPageProps {
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

// VideoRow component for Facebook Reels (Queue items)
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
                    {videoUrl.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? (
                        <img src={videoUrl} className="w-full h-full object-cover" alt="Preview" />
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
                    <div className="flex gap-2">
                        {['9:16', '1:1', '4:5', '16:9'].map(ratio => (
                            <button
                                key={ratio}
                                onClick={() => onUpdateVideo(video.id, { aspectRatio: ratio })}
                                className={`p-1.5 rounded-lg border-2 transition-all ${
                                    video.aspect_ratio === ratio
                                    ? 'border-purple-600 bg-purple-50 text-purple-600'
                                    : 'border-gray-100 text-gray-400 hover:border-purple-200'
                                }`}
                                title={ratio}
                            >
                                <RatioIcon ratio={ratio} active={video.aspect_ratio === ratio} size="sm" />
                            </button>
                        ))}
                    </div>
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

// ReelEditorModal Component for Facebook
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

    const videoUrl = video?.video_path 
        ? (video.video_path.startsWith('http') 
            ? video.video_path 
            : `/${video.video_path.replace(/\\/g, '/').replace(/^\//, '')}`) 
        : '';

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
    }, [video, isOpen, videoUrl]);

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
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">FB_REEL_OPTIMIZATION_PROTOCOL</p>
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
                                                    <img src={frame} className="w-full h-full object-cover" alt={`Frame ${i}`} />
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

const FacebookAutomationPage: React.FC<FacebookAutomationPageProps> = ({ setActiveTab }) => {
    const { showAlert, showConfirm } = useAlert();
    // Core State
    const [sendMode, setSendMode] = useState<'reels' | 'manual' | 'stories' | 'auto'>('reels');
    const [pages, setPages] = useState<any[]>([]);
    const [reelsQueue, setReelsQueue] = useState<any[]>([]);
    const [selectedReels, setSelectedReels] = useState<number[]>([]);
    const [editingReel, setEditingReel] = useState<any>(null);
    const [showReelEditor, setShowReelEditor] = useState(false);
    const [showAccountSelector, setShowAccountSelector] = useState(false);
    const [globalAspectRatio, setGlobalAspectRatio] = useState('9:16');
    
    // Upload State
    const [isUploadingReels, setIsUploadingReels] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [showUploadChoice, setShowUploadChoice] = useState(false);
    const [lastUploadedCount, setLastUploadedCount] = useState(0);
    const [lastUploadedIds, setLastUploadedIds] = useState<number[]>([]);

    // Scheduling State
    const [scheduleMode, setScheduleMode] = useState<'draft' | 'automated' | 'one_per_week'>('draft');
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [customTimes, setCustomTimes] = useState<string[]>(['09:00', '12:00', '18:00', '21:00']);

    // Manual Post State
    const [postType, setPostType] = useState<'feed' | 'story'>('feed');
    const [manualImageUrl, setManualImageUrl] = useState('');
    const [manualMessage, setManualMessage] = useState('');
    const [manualLoading, setManualLoading] = useState(false);

    // Multi-Selection State (Local Only - No server toggle)
    const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

    // Engagement Comment State
    const [commentEnabled, setCommentEnabled] = useState(false);
    const [commentMessage, setCommentMessage] = useState('Pra quem não viu: ➡️ ');
    const [commentImageUrl, setCommentImageUrl] = useState('');
    const [commentLoading, setCommentLoading] = useState(false);

    // Shopee Affiliate State (Facebook Specific)
    const [shopeeSettings, setShopeeSettings] = useState({
        enabled: false,
        apiKey: '',
        appSecret: '',
        trackingId: '',
        defaultMessage: '🔥 CONFIRA ESTA OFERTA: {product_name} {product_link}',
        autoPost: false,
        appId: ''
    });
    const [automationEnabled, setAutomationEnabled] = useState(false);
    const [productCount, setProductCount] = useState(5);
    const [messageTemplate, setMessageTemplate] = useState('🔥 CONFIRA ESTA OFERTA: {product_name} {product_link}');
    const [categoryType, setCategoryType] = useState('0');
    const [shopeePostType, setShopeePostType] = useState<'feed' | 'story' | 'reels'>('feed');
    const [randomVariation, setRandomVariation] = useState(10);
    const [plannedTasks, setPlannedTasks] = useState<any[]>([]);
    const [mediaType, setMediaType] = useState<'auto' | 'image' | 'video'>('auto');
    const [shopeeCategories, setShopeeCategories] = useState<any[]>([]);

    // Feedback State
    const [sendingStatus, setSendingStatus] = useState<{ active: boolean; current: number; total: number; success: number; failed: number } | null>(null);
    const [accountInsights, setAccountInsights] = useState<any>(null);
    const [loadingInsights, setLoadingInsights] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const loadPlannedTasks = async () => {
        try {
            const res = await api.get('/planned-tasks');
            if (res.data.success) setPlannedTasks(res.data.tasks);
        } catch (err) {}
    };

    // --- 🪄 SHOPEE PRODUCT MAGIC (AUTO-FILL) ---
    const [shopeeSearchQuery, setShopeeSearchQuery] = useState('');
    const [shopeeLink, setShopeeLink] = useState('');
    const [isGeneratingLink, setIsGeneratingLink] = useState(false);
    const [linkType, setLinkType] = useState<'shopee' | 'custom'>('shopee');
    const [customLink, setCustomLink] = useState('');
    const [systemPublicUrl, setSystemPublicUrl] = useState('https://fluxointeligente.digital');

    const handleShortenCustomLink = async () => {
        if (!customLink.trim()) {
            showNotification('Digite o link do site para encurtar!', 'info');
            return;
        }
        let urlToShorten = customLink.trim();
        if (!/^https?:\/\//i.test(urlToShorten)) {
            urlToShorten = `https://${urlToShorten}`;
            setCustomLink(urlToShorten);
        }
        setIsGeneratingLink(true);
        try {
            const res = await api.post('/short-links', { targetUrl: urlToShorten });
            if (res.data.success) {
                const shortUrl = `${systemPublicUrl.replace(/\/$/, '')}/?video=${res.data.shortLink.slug}`;
                setShopeeLink(shortUrl);
                
                // Atualiza a legenda do comentário automaticamente
                setCommentMessage(prev => {
                    const clean = prev.replace(/(?:🛍️|🛒|🔗)?\s*(?:COMPRE AQUI|Compre aqui|Acesse aqui|ACESSE AQUI|Pra quem não viu):?\s*https?:\/\/\S*/gi, '').trim();
                    return `${clean ? clean + '\n\n' : ''}Pra quem não viu: ➡️ ${shortUrl} ⬇️`;
                });
                
                showNotification('Link do site encurtado com sucesso!', 'success');
            } else {
                showNotification(res.data.error || 'Erro ao encurtar link.', 'error');
            }
        } catch (err: any) {
            console.error('Erro ao encurtar link do site:', err);
            showNotification(err.response?.data?.error || 'Erro ao conectar ao servidor.', 'error');
        } finally {
            setIsGeneratingLink(false);
        }
    };

    const handleMagicShopeeLink = async (queryOverride?: string) => {
        const query = queryOverride || shopeeSearchQuery || manualMessage || '';
        setIsGeneratingLink(true);
        try {
            const res = await api.post('/shopee/magic-link', { 
                query,
                userId: 1 // Fallback to 1 if not auth context
            });
            
            if (res.data.success && res.data.product) {
                const product = res.data.product;
                setCommentMessage(`Pra quem não viu: ➡️ {link} ⬇️`);
                setShopeeLink(product.link);
                setCommentEnabled(true);
                
                if (!manualImageUrl) {
                    setManualImageUrl(product.image || product.imageUrl || '');
                }
                showNotification('✨ Produto encontrado! Link preparado.', 'success');
            } else {
                showNotification('Não encontramos produtos.', 'info');
            }
        } catch (err: any) {
            showNotification('Erro: ' + err.message, 'error');
        } finally {
            setIsGeneratingLink(false);
        }
    };

    // Initial Load
    useEffect(() => {
        loadPages();
        loadReelsQueue();
        loadShopeeSettings();
        loadPlannedTasks();
        loadShopeeCategories();

        // Carregar systemPublicUrl
        api.get('/short-links/public-url').then(res => {
            if (res.data.success) {
                setSystemPublicUrl(res.data.systemPublicUrl || window.location.origin);
            }
        }).catch(err => console.warn('Erro ao carregar systemPublicUrl:', err));
    }, []);

    useEffect(() => {
        // Auto-select the first page when pages load
        if (pages.length > 0 && selectedPageIds.length === 0) {
            const defaultPage = pages.find(p => p.enabled) || pages[0];
            if (defaultPage) {
                setSelectedPageIds([String(defaultPage.id)]);
                fetchAccountInsights(defaultPage.id);
            }
        } else if (selectedPageIds.length > 0) {
            fetchAccountInsights(selectedPageIds[0]);
        }
    }, [pages]);

    const fetchAccountInsights = async (pageId: string) => {
        setLoadingInsights(true);
        try {
            const response = await api.get(`/api/facebook/account-insights/${pageId}`);
            if (response.data.success) {
                setAccountInsights(response.data.insights);
            }
        } catch (error) {
            console.error('Error fetching facebook insights:', error);
        } finally {
            setLoadingInsights(false);
        }
    };

    const loadShopeeCategories = async () => {
        try {
            const response = await api.get('/shopee/categories?onlyActive=true');
            if (response.data.success) {
                setShopeeCategories(response.data.categories);
            }
        } catch (error) {
            console.error('Error loading shopee categories:', error);
        }
    };

    const loadPages = async () => {
        try {
            const response = await api.get('/facebook/pages');
            // Support both formats: { success: true, pages } and { pages }
            const pagesList = response.data.success ? response.data.pages : (response.data.pages || []);
            setPages(pagesList);
        } catch (error) {
            showNotification('Falha ao carregar páginas do Facebook', 'error');
        }
    };

    const loadReelsQueue = async () => {
        try {
            const response = await api.get(`/facebook/reels/queue?status=pending&_t=${Date.now()}`);
            if (response.data.success) setReelsQueue(response.data.queue);
        } catch (error) {
            showNotification('Falha ao carregar fila de Reels', 'error');
        }
    };

    const loadShopeeSettings = async () => {
        try {
            const response = await api.get('/shopee/config');
            if (response.data.config && response.data.config.appId) {
                setShopeeSettings(prev => ({
                    ...prev,
                    appId: response.data.config.appId,
                    appSecret: response.data.config.appSecret || '',
                    password: response.data.config.appSecret || '',
                    trackingId: response.data.config.trackingId || ''
                }));
                return;
            }
            const r2 = await api.get('/shopee/settings');
            if (r2.data.success && r2.data.settings?.appId) {
                setShopeeSettings(prev => ({
                    ...prev,
                    ...r2.data.settings,
                    password: r2.data.settings.appSecret || ''
                }));
                if (r2.data.settings.defaultMessage) {
                    setMessageTemplate(r2.data.settings.defaultMessage);
                }
            }
        } catch (error) {
            console.error('Shopee settings error:', error);
        }
    };

    // Multi-select toggle — purely local, no server call needed for selection
    const togglePage = (pageId: string) => {
        const id = String(pageId);
        setSelectedPageIds(prev => {
            if (prev.includes(id)) {
                return prev.filter(p => p !== id);
            }
            return [...prev, id];
        });
        // Fetch insights for the toggled page
        const targetPage = pages.find(p => String(p.id) === id);
        if (targetPage) {
            fetchAccountInsights(id);
        }
    };

    const selectAllPages = () => setSelectedPageIds(pages.map(p => String(p.id)));
    const clearPageSelection = () => setSelectedPageIds([]);

    const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
        showAlert(message, type);
    };

    // Queue Handlers
    const handleReelsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.length) return;
        setIsUploadingReels(true);
        setUploadProgress(0);

        const files = Array.from(e.target.files);
        const formData = new FormData();
        files.forEach(file => formData.append('files', file));

        try {
            const response = await api.post('/facebook/reels/upload', formData, {
                onUploadProgress: (progressEvent) => {
                    const progress = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
                    setUploadProgress(progress);
                },
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            if (response.data.success) {
                const newIds = response.data.files?.map((f: any) => f.id) || [];
                setLastUploadedCount(files.length);
                setLastUploadedIds(newIds);
                setShowUploadChoice(true);
                loadReelsQueue();
            }
        } catch (error) {
            showNotification('Erro no upload de arquivos', 'error');
        } finally {
            setIsUploadingReels(false);
        }
    };

    const handleUpdateReel = async (id: number, data: any) => {
        try {
            const response = await api.put(`/facebook/reels/queue/${id}`, data);
            if (response.data.success) {
                setReelsQueue(reelsQueue.map(v => v.id === id ? { ...v, ...data } : v));
                showNotification('Conteúdo atualizado com sucesso', 'success');
            }
        } catch (error) {
            showNotification('Erro ao atualizar item', 'error');
        }
    };

    const handleDeleteReel = async (id: number) => {
        try {
            const response = await api.delete(`/facebook/reels/queue/${id}`);
            if (response.data.success) {
                setReelsQueue(reelsQueue.filter(v => v.id !== id));
                setSelectedReels(selectedReels.filter(rid => rid !== id));
            }
        } catch (error) {
            showNotification('Erro ao remover item', 'error');
        }
    };

    const toggleSelectReelsAll = () => {
        if (selectedReels.length === reelsQueue.length) setSelectedReels([]);
        else setSelectedReels(reelsQueue.map(v => v.id));
    };

    // accountIdOverride: passed directly from modal
    // targetIdsOverride: specific IDs to process (used by "Send Now" modal)
    const handleBulkAction = async (action: 'clear' | 'schedule' | 'publish', accountIdOverride?: string, targetIdsOverride?: number[]) => {
        if (action === 'clear') {
            showConfirm({
                title: 'Limpar Fila de Reels',
                message: 'Deseja realmente limpar todos os itens da fila? Esta ação não pode ser desfeita.',
                confirmText: 'Limpar Agora',
                onConfirm: async () => {
                    try {
                        await api.delete('/facebook/reels/queue/all');
                        setReelsQueue([]);
                        setSelectedReels([]);
                        showNotification('Fila limpa com sucesso', 'success');
                    } catch (error) {
                        showNotification('Erro ao limpar fila', 'error');
                    }
                }
            });
            return;
        }

        // Correctly filter items based on targetIdsOverride if provided
        const targetIds = targetIdsOverride || (selectedReels.length > 0 ? selectedReels : reelsQueue.map(v => v.id));
        const itemsToProcess = reelsQueue.filter(v => targetIds.includes(v.id));
        
        if (itemsToProcess.length === 0) {
            showNotification('Nenhum item na fila para processar', 'info');
            return;
        }

        if (action === 'schedule') {
            try {
                await api.post('/facebook/reels/configure-schedule', {
                    items: itemsToProcess.map(v => v.id),
                    mode: scheduleMode,
                    startDate,
                    times: customTimes
                });
                showNotification('Agendamento sincronizado com sucesso', 'success');
            } catch (error) {
                showNotification('Erro ao configurar agendamento', 'error');
            }
            return;
        }

        if (action === 'publish') {
            setSendingStatus({ active: true, current: 0, total: itemsToProcess.length, success: 0, failed: 0 });
            
            // Get credentials - if accountIdOverride is provided, use it to find the specific page credentials
            let pageId = null;
            let accessToken = null;

            if (accountIdOverride) {
                const targetPage = pages.find(p => p.id === accountIdOverride);
                if (targetPage) {
                    pageId = targetPage.id;
                    accessToken = targetPage.accessToken;
                }
            } else {
                // Fallback to currently enabled page
                const activePage = pages.find(p => p.enabled);
                if (activePage) {
                    pageId = activePage.id;
                    accessToken = activePage.accessToken;
                }
            }

            if (!pageId || !accessToken) {
                showNotification('Nenhuma página do Facebook selecionada ou ativa', 'error');
                setSendingStatus(prev => prev ? { ...prev, active: false } : null);
                return;
            }

            for (let i = 0; i < itemsToProcess.length; i++) {
                const id = itemsToProcess[i].id;
                try {
                    const response = await api.post(`/facebook/reels/post-from-queue/${id}`, {
                        pageId,
                        accessToken
                    });
                    if (response.data.success) {
                        setReelsQueue(prev => prev.filter(v => v.id !== id)); // Remove from local UI immediately
                        setSendingStatus(prev => prev ? { ...prev, current: i + 1, success: prev.success + 1 } : null);
                    } else {
                        setReelsQueue(prev => prev.filter(v => v.id !== id));
                        setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                    }
                } catch (error) {
                    setReelsQueue(prev => prev.filter(v => v.id !== id));
                    setSendingStatus(prev => prev ? { ...prev, current: i + 1, failed: prev.failed + 1 } : null);
                }
            }
            setSendingStatus(prev => prev ? { ...prev, active: false } : null);
            await loadReelsQueue();
            setSelectedReels([]);
            showNotification('✅ Processo de publicação finalizado', 'success');
            setTimeout(() => setSendingStatus(null), 2000);
        }
    };

    // Manual Post Handlers
    const handleManualFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setManualLoading(true);
        const formData = new FormData();
        formData.append('files', e.target.files[0]);
        try {
            const response = await api.post('/facebook/reels/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success && response.data.files?.[0]) {
                setManualImageUrl(response.data.files[0].url);
            }
        } catch (error) {
            showNotification('Erro ao carregar mídia manual', 'error');
        } finally {
            setManualLoading(false);
        }
    };

    const handleCommentFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        setCommentLoading(true);
        const formData = new FormData();
        formData.append('files', e.target.files[0]);
        try {
            const response = await api.post('/facebook/reels/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            if (response.data.success && response.data.files?.[0]) {
                setCommentImageUrl(response.data.files[0].url);
            }
        } catch (error) {
            showNotification('Erro ao carregar imagem do comentário', 'error');
        } finally {
            setCommentLoading(false);
        }
    };

    const handleSendNow = async () => {
        if (selectedPageIds.length === 0) {
            showNotification('Selecione ao menos uma página do Facebook', 'info');
            return;
        }
        if (!manualImageUrl && postType === 'feed' && !manualMessage) {
            showNotification('Adicione uma imagem ou texto para postar', 'info');
            return;
        }
        setManualLoading(true);
        try {
            // Build the pages array from selectedPageIds
            const selectedPagesData = pages
                .filter(p => selectedPageIds.includes(String(p.id)))
                .map(p => ({ id: p.id, name: p.name, accessToken: p.accessToken || p.access_token }));

            const payload: any = {
                facebookPages: selectedPagesData,
                sendMode: 'manual',
                postType,
                manualMessage,
                manualImageUrl,
            };

            // Add comment fields if engagement strategy is enabled
            if (commentEnabled && (commentMessage || commentImageUrl)) {
                payload.commentMessage = commentMessage;
                payload.commentImageUrl = commentImageUrl || undefined;
                payload.shopeeLink = shopeeLink;
            }

            const response = await api.post('/facebook/post-now', payload);
            if (response.data.success !== false) {
                const s = response.data.results;
                showNotification(
                    `✅ ${s?.success ?? 0} postagem(ns) publicada(s)${s?.failed ? `, ${s.failed} falha(s)` : ''}`,
                    s?.failed ? 'error' : 'success'
                );
            } else {
                showNotification(`Falha: ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification(`Erro: ${error.message}`, 'error');
        } finally {
            setManualLoading(false);
        }
    };

    // Shopee Auto Handlers
    const handleExecuteNowShopee = async () => {
        const selectedPage = pages.find(p => p.enabled);
        if (!shopeeSettings.appId) return showNotification('❌ Configure a Shopee na tela principal do afiliado primeiro', 'error');
        if (!selectedPage) return showNotification('❌ Selecione a página do Facebook', 'error');
        if (!confirm(`Enviar ${productCount} produtos da Shopee agora para a página ${selectedPage.name}?`)) return;

        setManualLoading(true);
        const taskId = `fb_auto_${Date.now()}`;
        setSendingStatus({ active: true, current: 0, total: productCount, success: 0, failed: 0 });

        const progressInterval = setInterval(async () => {
            try {
                const res = await api.get(`/progress/${taskId}`);
                if (res.data.success && res.data.progress) {
                    setSendingStatus(prev => prev ? {
                        ...prev,
                        ...res.data.progress,
                        active: res.data.progress.active !== false
                    } : null);
                }
            } catch (err) {}
        }, 1500);

        try {
            const response = await api.post('/facebook/post-now', {
                facebookPages: [selectedPage],
                shopeeSettings: shopeeSettings,
                productCount,
                messageTemplate,
                categoryType,
                sendMode: 'auto',
                postType: shopeePostType,
                enableRotation: true,
                taskId,
                mediaType,
                commentEnabled,
                commentMessage,
                commentImageUrl
            });
            if (response.data.success) {
                showNotification(`✅ Publicação finalizada com sucesso!`, 'success');
            } else {
                showNotification(`❌ Erro na publicação da Shopee: ${response.data.error}`, 'error');
            }
            
            // Força a barra para os dados finais de backend
            if (response.data.details) {
                setSendingStatus(prev => prev ? { 
                    ...prev, 
                    active: false, 
                    success: response.data.details.success || prev.success, 
                    failed: response.data.details.failed || prev.failed, 
                    current: response.data.details.total || prev.current 
                } : null);
            } else {
                setSendingStatus(prev => prev ? { ...prev, active: false } : null);
            }
        } catch (error: any) {
            setSendingStatus(prev => prev ? { ...prev, active: false } : null);
            showNotification(`❌ Erro ao disparar produtos: ${error.message}`, 'error');
        } finally {
            clearInterval(progressInterval);
            setManualLoading(false);
            setTimeout(() => setSendingStatus(null), 4000);
        }
    };

    const handleScheduleShopee = async () => {
        const selectedPage = pages.find(p => p.enabled);
        if (!shopeeSettings.appId) return showNotification('❌ Configure a Shopee na tela principal do afiliado primeiro', 'error');
        if (!selectedPage) return showNotification('❌ Selecione a página do Facebook', 'error');
        if (!automationEnabled) return showNotification('❌ Ative a chave de agendamento automático primeiro', 'error');

        try {
            const response = await api.post('/facebook/schedule', {
                facebookPages: [selectedPage],
                shopeeSettings: shopeeSettings,
                messageTemplate: messageTemplate,
                schedule: {
                    frequency: 'daily',
                    time: customTimes[0] || '12:00',
                    times: customTimes,
                    scheduleMode: 'multiple',
                    productCount,
                    enabled: true,
                    randomVariation: randomVariation
                },
                categoryType,
                postType: shopeePostType,
                automationType: shopeePostType,
                mediaType,
                commentEnabled,
                commentMessage,
                commentImageUrl
            });
            if (response.data.success) {
                showNotification(`✅ Automação Shopee agendada com sucesso!`, 'success');
                setAutomationEnabled(false);
                loadPlannedTasks(); // Recarregar a fila
            } else {
                showNotification(`❌ Falha no agendamento: ${response.data.error}`, 'error');
            }
        } catch (error: any) {
            showNotification(`❌ Erro de sistema no agendamento: ${error.message}`, 'error');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans text-gray-800 overflow-x-hidden">

            {/* Sending Status (Modern Overlay) */}
            {sendingStatus && (
                <div className="fixed bottom-12 right-24 z-[150] bg-white border-2 border-purple-100 shadow-2xl p-8 w-96 animate-in slide-in-from-bottom-12 duration-700 rounded-[32px] overflow-hidden">
                    {/* Background decoration */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full -mr-16 -mt-16 blur-2xl"></div>
                    
                    <div className="flex items-center justify-between mb-8 relative z-10">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">PROGRAMA_TRANSMISSÃO_FB</span>
                            <span className="text-xl font-black text-gray-900 leading-none">
                                {sendingStatus.active ? 'SINCRONIZANDO...' : 'FLUXO_CONCLUÍDO'}
                            </span>
                        </div>
                        <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center border border-purple-100 shadow-sm">
                            {sendingStatus.active ? (
                                <RefreshCcw size={28} className="text-purple-600 animate-spin" />
                            ) : (
                                <ShieldCheck size={28} className="text-purple-600" />
                            )}
                        </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                        <div className="flex justify-between items-end">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">BLOCOS_ENVIADOS</span>
                                <div className="flex items-baseline gap-1">
                                    <span className="text-2xl font-black text-gray-900">{sendingStatus.current}</span>
                                    <span className="text-gray-400 font-bold text-sm">/ {sendingStatus.total}</span>
                                </div>
                            </div>
                            {sendingStatus.active && (
                                <div className="text-right flex flex-col items-end">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">NA FILA</span>
                                    <span className="text-sm font-black text-purple-600 px-3 py-1 bg-purple-50 rounded-full border border-purple-100">
                                        {sendingStatus.total - sendingStatus.current} RESTANTES
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="w-full h-4 bg-gray-50 rounded-full overflow-hidden relative border border-gray-100 p-0.5">
                            {/* Animated infinite loader when actively processing */}
                            {sendingStatus.active && sendingStatus.current === 0 && (
                                <div className="absolute inset-0 bg-gradient-to-r from-purple-200 via-purple-600 to-purple-200 bg-[length:200%_auto] animate-[pulse_2s_ease-in-out_infinite] w-full h-full opacity-50"></div>
                            )}
                            {/* Actual progress fill */}
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${(sendingStatus.current / (sendingStatus.total || 1)) * 100}%` }}
                                className={`h-full rounded-full ${
                                    sendingStatus.active 
                                        ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
                                        : (sendingStatus.failed > 0 ? 'bg-orange-500' : 'bg-green-500')
                                } transition-all duration-700 ease-out shadow-lg relative z-10`}
                            >
                                <div className="absolute inset-0 bg-white/20 animate-[shimmer_2s_infinite] skew-x-12"></div>
                            </motion.div>
                        </div>

                        {!sendingStatus.active ? (
                            <div className="grid grid-cols-2 gap-4 pt-6 mt-2 border-t border-gray-100">
                                <div className="bg-green-50/50 p-4 rounded-2xl border border-green-100/50">
                                    <span className="text-[9px] font-black text-green-600 uppercase tracking-widest block mb-1">SUCESSO</span>
                                    <span className="text-xl font-black text-green-700">{sendingStatus.success}</span>
                                </div>
                                <div className="bg-red-50/50 p-4 rounded-2xl border border-red-100/50">
                                    <span className="text-[9px] font-black text-red-600 uppercase tracking-widest block mb-1">FALHAS</span>
                                    <span className="text-xl font-black text-red-700">{sendingStatus.failed}</span>
                                </div>
                            </div>
                        ) : (
                            <div className="pt-2">
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest animate-pulse">
                                    Sincronizando com servidores do Facebook...
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Performance Dashboard */}
            <div className="px-10 mt-12 max-w-[1400px] mx-auto">
                <div className="bg-white/80 backdrop-blur-xl border border-gray-100 rounded-[2.5rem] p-10 shadow-2xl shadow-gray-100/50">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl">
                                <Facebook size={24} />
                            </div>
                            <div>
                                <h3 className="text-2xl font-black text-gray-900 tracking-tighter">Performance<span className="text-blue-600">_Dashboard</span></h3>
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">LIVE_PAGE_INSIGHTS_V1</p>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                const activePage = pages.find(p => p.enabled);
                                if (activePage) fetchAccountInsights(activePage.id);
                            }}
                            className="p-3 hover:bg-gray-50 rounded-xl transition-all text-gray-400 hover:text-blue-600"
                            title="Atualizar Métricas"
                        >
                            <RefreshCw size={20} className={loadingInsights ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {loadingInsights ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="h-32 bg-gray-50 rounded-[2rem] animate-pulse"></div>
                            ))}
                        </div>
                    ) : accountInsights ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-blue-100 rounded-xl text-blue-600 group-hover:scale-110 transition-transform">
                                        <Eye size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Impressões</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.impressions?.toLocaleString() || 0}</p>
                            </div>

                            <div className="bg-orange-50/50 p-6 rounded-[2rem] border border-orange-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-orange-100 rounded-xl text-orange-600 group-hover:scale-110 transition-transform">
                                        <Zap size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-orange-600 uppercase tracking-widest">Engajamento</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.post_engagements?.toLocaleString() || 0}</p>
                            </div>

                            <div className="bg-purple-50/50 p-6 rounded-[2rem] border border-purple-100 group hover:scale-105 transition-all cursor-default">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="p-2 bg-purple-100 rounded-xl text-purple-600 group-hover:scale-110 transition-transform">
                                        <Users size={18} />
                                    </div>
                                    <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest">Usuários Ativos</span>
                                </div>
                                <p className="text-3xl font-black text-gray-900">{accountInsights.engaged_users?.toLocaleString() || 0}</p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-gray-50 rounded-3xl p-12 text-center border border-gray-100">
                            <Activity className="mx-auto text-gray-300 mb-4" size={48} />
                            <h4 className="text-lg font-bold text-gray-900">Aguardando sincronização...</h4>
                            <p className="text-sm text-gray-500 max-w-md mx-auto mt-2">
                                Selecione uma página ativa para visualizar as métricas de performance em tempo real do Facebook Graph API.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Tactical Header */}
            <div className="bg-white border-b border-gray-200 p-12 relative overflow-visible">
                <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-b-[40px]">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
                </div>
                <div className="max-w-[1400px] mx-auto relative z-10 flex flex-col lg:flex-row items-center justify-between gap-10">
                    <div className="text-center lg:text-left">
                        <div className="flex items-center justify-center lg:justify-start gap-6">
                            <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-purple-500/20">
                                <Facebook size={40} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-4xl font-black tracking-tight text-gray-900">
                                    Centro<span className="text-purple-600">_de_Controle</span>
                                </h1>
                                <p className="text-gray-400 mt-1 text-sm font-bold uppercase tracking-widest">PROTOCOLO ALGORÍTMICO FACEBOOK</p>
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

                        <div className="flex items-center gap-4 w-full lg:w-auto">
                            <div className="flex-1 relative">
                                <button
                                    onClick={() => setShowAccountSelector(!showAccountSelector)}
                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-200 text-gray-900 font-bold text-xs outline-none focus:border-purple-400 cursor-pointer flex items-center justify-between rounded-2xl uppercase tracking-widest transition-all hover:bg-white hover:shadow-lg hover:shadow-gray-200/50"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${selectedPageIds.length > 0 ? 'bg-green-500 shadow-lg shadow-green-200 animate-pulse' : 'bg-gray-300'}`}></div>
                                        {selectedPageIds.length === 0 && <span>SELECIONAR PÁGINAS</span>}
                                        {selectedPageIds.length === 1 && <span>{pages.find(p => String(p.id) === selectedPageIds[0])?.name || '1 PÁGINA'}</span>}
                                        {selectedPageIds.length > 1 && <span>{selectedPageIds.length} PÁGINAS SELECIONADAS</span>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedPageIds.length > 0 && (
                                            <span className="bg-purple-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">{selectedPageIds.length}</span>
                                        )}
                                        <ChevronDown size={16} className={`transition-transform duration-300 ${showAccountSelector ? 'rotate-180' : ''}`} />
                                    </div>
                                </button>

                                <AnimatePresence>
                                    {showAccountSelector && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setShowAccountSelector(false)}></div>
                                            <motion.div
                                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                className="absolute top-full left-0 right-0 mt-3 bg-white border border-gray-100 rounded-[24px] shadow-2xl z-50 overflow-hidden min-w-[280px]"
                                            >
                                                {/* Header with actions */}
                                                <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex items-center justify-between">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">PÁGINAS_DISPONÍVEIS</span>
                                                    <div className="flex gap-2">
                                                        <button onClick={selectAllPages} className="text-[9px] font-black text-purple-600 hover:underline uppercase tracking-wide">Todas</button>
                                                        <span className="text-gray-300">|</span>
                                                        <button onClick={clearPageSelection} className="text-[9px] font-black text-gray-400 hover:text-red-500 hover:underline uppercase tracking-wide">Limpar</button>
                                                    </div>
                                                </div>
                                                <div className="max-h-72 overflow-y-auto custom-scrollbar">
                                                    {pages.length === 0 ? (
                                                        <div className="p-8 text-center space-y-3">
                                                            <HelpCircle size={32} className="mx-auto text-gray-200" />
                                                            <p className="text-[10px] font-black text-gray-400 uppercase">Nenhuma conta encontrada</p>
                                                        </div>
                                                    ) : (
                                                        pages.map(account => {
                                                            const isSelected = selectedPageIds.includes(String(account.id));
                                                            return (
                                                                <button
                                                                    key={account.id}
                                                                    onClick={() => togglePage(account.id)}
                                                                    className={`w-full flex items-center gap-4 px-6 py-4 transition-all text-left border-b border-gray-50 last:border-0 ${
                                                                        isSelected ? 'bg-purple-50 text-purple-700' : 'hover:bg-gray-50 text-gray-600'
                                                                    }`}
                                                                >
                                                                    {/* Custom Checkbox */}
                                                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                                                        isSelected ? 'bg-purple-600 border-purple-600' : 'border-gray-200'
                                                                    }`}>
                                                                        {isSelected && <CheckCircle size={12} className="text-white" fill="white" />}
                                                                    </div>
                                                                    <div className="flex flex-col flex-1 min-w-0">
                                                                        <span className="text-xs font-black uppercase tracking-widest truncate">{account.name}</span>
                                                                        <span className="text-[8px] font-bold opacity-40">ID: {account.id}</span>
                                                                    </div>
                                                                </button>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                                {/* Footer */}
                                                {selectedPageIds.length > 0 && (
                                                    <div className="p-3 bg-purple-50 border-t border-purple-100">
                                                        <p className="text-[9px] font-black text-purple-600 uppercase tracking-widest text-center">
                                                            {selectedPageIds.length} página(s) selecionada(s) — Pronto para transmitir
                                                        </p>
                                                    </div>
                                                )}
                                            </motion.div>
                                        </>
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            <div className="max-w-[1400px] mx-auto px-6 py-8">
                {/* Secondary Navigation (Tabs) */}
                <div className="flex items-center justify-center border-b border-gray-100 mb-10 overflow-x-auto whitespace-nowrap scrollbar-hide">
                    {[
                        { id: 'reels', label: 'FEED EM MASSA', icon: Play, count: reelsQueue.length },
                        { id: 'manual', label: 'POSTAGEM MANUAL', icon: Send },
                        { id: 'stories', label: 'STORY EM MASSA', icon: Layers },
                        { id: 'auto', label: 'SHOPEE AUTOMAÇÃO', icon: Bot }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setSendMode(tab.id as any)}
                            className={`flex items-center gap-3 px-8 py-5 text-[10px] font-black tracking-widest transition-all relative ${
                                sendMode === tab.id ? 'text-purple-600' : 'text-gray-400 hover:text-gray-600'
                            }`}
                        >
                            <tab.icon size={16} />
                            <span>{tab.label}</span>
                            {tab.count !== undefined && (
                                <span className="bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full text-[9px]">{tab.count}</span>
                            )}
                            {sendMode === tab.id && (
                                <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-t-full" />
                            )}
                        </button>
                    ))}
                </div>

                <div className="space-y-10">
                    {sendMode === 'reels' ? (
                        <div className="animate-in slide-in-from-left-8 duration-700 space-y-10">
                            {/* Reels Mass Upload Zone (Premium Style) */}
                            <div className="bg-white border-2 border-dashed border-gray-100 p-24 text-center relative group hover:border-purple-400/50 hover:bg-purple-50/30 transition-all duration-700 cursor-pointer rounded-[40px] shadow-sm">
                                <input 
                                    type="file" 
                                    multiple 
                                    accept="video/*,image/*" 
                                    onChange={handleReelsUpload}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                />
                                {isUploadingReels ? (
                                    <div className="space-y-6">
                                        <div className="w-24 h-24 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mx-auto shadow-lg shadow-purple-50"></div>
                                        <div className="mt-8 max-w-xs mx-auto px-4">
                                            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-300"
                                                    style={{ width: `${uploadProgress}%` }} 
                                                />
                                            </div>
                                            <p className="text-[10px] text-purple-600 font-black mt-3 uppercase tracking-widest">
                                                {uploadProgress < 100 ? `CARREGANDO... ${uploadProgress}%` : 'TRANSFERÊNCIA_CONCLUÍDA'}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-10">
                                        <div className="relative mx-auto w-24 h-24">
                                            <div className="absolute inset-0 bg-purple-50 rounded-3xl group-hover:scale-110 group-hover:rotate-6 transition-transform duration-500"></div>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Upload size={48} className="text-purple-600 group-hover:-translate-y-2 transition-transform duration-500" />
                                            </div>
                                        </div>
                                        <div className="space-y-4">
                                            <h3 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">CARREGAR_FEED_EM_MASSA</h3>
                                            <p className="text-gray-600 font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-3">
                                                <span className="w-8 h-[1px] bg-gray-100"></span>
                                                ARRRASTE_ARQUIVOS_OU_CLIQUE_PARA_SELECIONAR
                                                <span className="w-8 h-[1px] bg-gray-100"></span>
                                            </p>
                                        </div>
                                        <div className="flex justify-center gap-8 pt-4">
                                            {['FORMATO_MP4/JPG', 'LIMITE_1GB', 'ESPECTRO_MULTI'].map(tag => (
                                                <div key={tag} className="px-5 py-2 bg-gray-100 border border-gray-100 rounded-xl text-[9px] text-gray-600 font-black uppercase tracking-widest">{tag}</div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {reelsQueue.length > 0 && (
                                <div className="bg-white border border-gray-100 shadow-2xl shadow-gray-200/50 rounded-[40px] relative">
                                    <div className="bg-gray-50/50 px-10 py-6 border-b border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <Layers className="text-purple-600" size={20} />
                                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-900 mt-1">Fila_Processamento</h3>
                                        </div>

                                        <div className="flex items-center gap-6">
                                            {selectedReels.length > 0 && (
                                                <div className="px-6 py-3 bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-purple-200 animate-in zoom-in duration-300">
                                                    {selectedReels.length}_SELECIONADOS
                                                </div>
                                            )}
                                            <div className="flex gap-4">
                                                <button 
                                                    onClick={() => handleBulkAction('clear')}
                                                    className="px-8 py-4 border-2 border-gray-100 text-[10px] font-black text-gray-600 hover:text-red-500 hover:border-red-100 hover:bg-red-50 transition-all uppercase tracking-widest rounded-2xl"
                                                >
                                                    LIMPAR_BUFFER
                                                </button>
                                                <button 
                                                    onClick={() => handleBulkAction('schedule')}
                                                    className="px-10 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white text-[10px] font-black uppercase tracking-widest hover:shadow-2xl hover:shadow-purple-200 transition-all rounded-2xl"
                                                >
                                                    IMPLANTAR_AGENDAMENTO
                                                </button>
                                                <button 
                                                    onClick={() => handleBulkAction('publish')}
                                                    className="px-10 py-4 bg-purple-600 text-white text-[10px] font-black uppercase tracking-widest hover:shadow-2xl hover:shadow-purple-200 transition-all rounded-2xl"
                                                >
                                                    EXECUTAR AGORA
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Column Headers */}
                                    <div className="grid grid-cols-12 gap-6 px-10 py-6 bg-gray-50/50 border-b border-gray-100">
                                        <div className="col-span-1 flex items-center justify-center">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedReels.length === reelsQueue.length && reelsQueue.length > 0}
                                                onChange={toggleSelectReelsAll}
                                                className="w-6 h-6 border-2 border-gray-200 text-purple-600 focus:ring-purple-500 rounded-lg cursor-pointer transition-all"
                                            />
                                        </div>
                                        <div className="col-span-1 flex items-center justify-center"><span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">MÍDIA</span></div>
                                        <div className="col-span-1 flex items-center justify-center"><span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">POS</span></div>
                                        <div className="col-span-3 px-4"><span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">IDENTIFICADOR</span></div>
                                        <div className="col-span-4 px-4"><span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">DESCRIÇÃO</span></div>
                                        <div className="col-span-2 text-right pr-12"><span className="text-[10px] font-black text-gray-600 uppercase tracking-widest">AÇÕES</span></div>
                                    </div>

                                    <div className="max-h-[800px] min-h-[400px] overflow-y-visible">
                                        <div className="divide-y divide-gray-100">
                                            {reelsQueue.map((video, idx) => (
                                                <VideoRow 
                                                    key={video.id}
                                                    video={video}
                                                    index={idx}
                                                    selected={selectedReels.includes(video.id)}
                                                    onToggleSelection={() => setSelectedReels(prev => prev.includes(video.id) ? prev.filter(id => id !== video.id) : [...prev, video.id])}
                                                    onUpdateVideo={handleUpdateReel}
                                                    onDelete={handleDeleteReel}
                                                    onEdit={(v: any) => { setEditingReel(v); setShowReelEditor(true); }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : sendMode === 'manual' ? (
                        <div className="animate-in slide-in-from-right-8 duration-700 space-y-12">
                            <div className="max-w-4xl mx-auto flex p-2 bg-gray-50 rounded-3xl border border-gray-100 gap-2">
                                <button
                                    onClick={() => setPostType('feed')}
                                    className={`flex-1 py-6 rounded-[20px] text-[10px] font-black transition-all duration-500 uppercase tracking-widest ${postType === 'feed' ? 'bg-white text-purple-600 shadow-xl shadow-purple-50 translate-y-[-1px]' : 'text-gray-600 hover:text-gray-700'}`}
                                >
                                    FEED_DA_PÁGINA
                                </button>
                                <button
                                    onClick={() => setPostType('story')}
                                    className={`flex-1 py-6 rounded-[20px] text-[10px] font-black transition-all duration-500 uppercase tracking-widest ${postType === 'story' ? 'bg-white text-purple-600 shadow-xl shadow-purple-50 translate-y-[-1px]' : 'text-gray-600 hover:text-gray-700'}`}
                                >
                                    STORY_DA_PÁGINA
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
                                {/* Editor Column */}
                                <div className="lg:col-span-7 space-y-10 bg-white border border-gray-100 shadow-2xl shadow-gray-200/50 p-12 rounded-[40px]">
                                    <div className="flex items-center gap-4 border-b border-gray-50 pb-8 mb-4">
                                        <div className="w-12 h-12 bg-purple-50 text-purple-600 flex items-center justify-center font-black rounded-2xl shadow-sm border border-purple-100">01</div>
                                        <div className="flex-1">
                                            <h3 className="font-black text-gray-900 uppercase tracking-widest text-sm">EDITOR_DE_IMPACTO</h3>
                                            {selectedPageIds.length > 0 && (
                                                <p className="text-[9px] text-green-600 font-black uppercase tracking-widest mt-1 flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
                                                    {selectedPageIds.length} página(s) selecionada(s)
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        {/* Media Upload Section */}
                                        <div className="space-y-4">
                                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-1">MÍDIA_PARA_POSTAGEM</label>
                                            <div className="grid grid-cols-1 gap-4">
                                                <div className="relative group">
                                                    <input
                                                        type="text"
                                                        value={manualImageUrl}
                                                        onChange={(e) => setManualImageUrl(e.target.value)}
                                                        placeholder="HTTPS://DOMINIO.COM/IMAGEM.JPG"
                                                        className="w-full p-6 bg-gray-50 border border-gray-100 rounded-2xl focus:border-purple-400 outline-none text-xs text-gray-900 placeholder:text-gray-400 transition-all shadow-inner pr-32"
                                                    />
                                                    <div className="absolute right-2 top-2 bottom-2">
                                                        <label className="h-full px-6 bg-white border border-gray-100 rounded-xl flex items-center justify-center gap-2 text-[10px] font-black text-gray-600 hover:text-purple-600 hover:border-purple-200 cursor-pointer transition-all shadow-sm">
                                                            {manualLoading ? <RefreshCcw size={14} className="animate-spin" /> : <Upload size={14} />}
                                                            CARREGAR
                                                            <input type="file" onChange={handleManualFileUpload} className="hidden" accept="image/*,video/*" />
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest px-1">CONTEÚDO_TEXTUAL</label>
                                            <textarea
                                                value={manualMessage}
                                                onChange={(e) => setManualMessage(e.target.value)}
                                                placeholder="// INSIRA_O_TEXTO_DA_TRANSMISSÃO_AQUI..."
                                                className="w-full h-40 p-8 bg-gray-50 border border-gray-100 rounded-3xl focus:border-purple-400 outline-none text-sm text-gray-900 placeholder:text-gray-400 resize-none transition-all shadow-inner leading-relaxed"
                                            />
                                        </div>
                                    </div>

                                    {/* ── ENGAGEMENT COMMENT STRATEGY ── */}
                                    {postType === 'feed' && (
                                        <div className="border-t border-gray-100 pt-8 space-y-6">
                                            <button
                                                onClick={() => setCommentEnabled(!commentEnabled)}
                                                className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all duration-300 ${
                                                    commentEnabled
                                                        ? 'border-orange-400 bg-orange-50'
                                                        : 'border-gray-100 bg-gray-50 hover:border-orange-200 hover:bg-orange-50/30'
                                                }`}
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${commentEnabled ? 'bg-orange-500 shadow-lg shadow-orange-200' : 'bg-gray-200'}`}>
                                                        <Zap size={18} className={commentEnabled ? 'text-white' : 'text-gray-400'} />
                                                    </div>
                                                    <div className="text-left">
                                                        <p className={`text-xs font-black uppercase tracking-widest ${commentEnabled ? 'text-orange-700' : 'text-gray-600'}`}>
                                                            ESTRATÉGIA DE ENGAJAMENTO
                                                        </p>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wide mt-0.5">
                                                            Primeiro comentário automático com imagem + link
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className={`w-12 h-6 rounded-full transition-all duration-300 flex items-center px-0.5 ${commentEnabled ? 'bg-orange-500' : 'bg-gray-200'}`}>
                                                    <div className={`w-5 h-5 bg-white rounded-full shadow-md transform transition-transform duration-300 ${commentEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                                                </div>
                                            </button>

                                            <AnimatePresence>
                                                {commentEnabled && (() => {
                                                    const labelColor = linkType === 'shopee' ? 'text-orange-600' : 'text-indigo-600';
                                                    const inputBg = linkType === 'shopee' ? 'bg-orange-50/50' : 'bg-indigo-50/50';
                                                    const inputBorder = linkType === 'shopee' ? 'border-orange-100 focus:border-orange-400' : 'border-indigo-100 focus:border-indigo-400';
                                                    const buttonColor = linkType === 'shopee' ? 'text-orange-600 border-orange-100 hover:border-orange-400' : 'text-indigo-600 border-indigo-100 hover:border-indigo-400';
                                                    const previewBg = linkType === 'shopee' ? 'bg-orange-50 border-orange-100' : 'bg-indigo-50 border-indigo-100';
                                                    const previewBorder = linkType === 'shopee' ? 'border-orange-200' : 'border-indigo-200';
                                                    const previewText = linkType === 'shopee' ? 'text-orange-600' : 'text-indigo-600';

                                                    return (
                                                        <motion.div
                                                            initial={{ opacity: 0, height: 0 }}
                                                            animate={{ opacity: 1, height: 'auto' }}
                                                            exit={{ opacity: 0, height: 0 }}
                                                            className="space-y-5 overflow-hidden"
                                                        >
                                                            {/* Alternador de Tipo de Link */}
                                                            <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => { setLinkType('shopee'); setShopeeLink(''); }} 
                                                                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${linkType === 'shopee' ? 'bg-orange-500 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                                >
                                                                    🛍️ Shopee
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => { setLinkType('custom'); setCustomLink(''); setShopeeLink(''); }} 
                                                                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 ${linkType === 'custom' ? 'bg-indigo-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                                                >
                                                                    🌐 Site Customizado
                                                                </button>
                                                            </div>

                                                            {linkType === 'shopee' ? (
                                                                /* --- 🪄 SHOPEE SEARCH BAR (SAME AS MEDIA DOWNLOADER) --- */
                                                                <div className="space-y-3 p-4 bg-orange-50/30 border border-orange-100 rounded-3xl">
                                                                    <div className="relative group">
                                                                        <div className="absolute top-4 left-4 text-orange-500"><LinkIcon size={16} /></div>
                                                                        <input 
                                                                            type="text" 
                                                                            value={shopeeSearchQuery}
                                                                            onChange={(e) => setShopeeSearchQuery(e.target.value)}
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleMagicShopeeLink()}
                                                                            placeholder="Link ou Nome do Produto..."
                                                                            className="w-full pl-12 pr-24 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-orange-500 outline-none text-gray-800 text-xs font-bold transition-all placeholder:text-orange-300 shadow-sm" 
                                                                        />
                                                                        <div className="absolute right-2 top-2 bottom-2 flex gap-1">
                                                                            <button 
                                                                                onClick={() => handleMagicShopeeLink()}
                                                                                disabled={isGeneratingLink}
                                                                                title="Gerar Link de Afiliado Automaticamente"
                                                                                className="px-4 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                                                                            >
                                                                                {isGeneratingLink ? <RefreshCcw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                                                <span className="text-[10px] font-black uppercase tracking-widest">BUSCAR</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Categorias Rápidas */}
                                                                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto no-scrollbar py-1">
                                                                        {shopeeCategories.length > 0 ? (
                                                                            shopeeCategories.map(cat => (
                                                                                <button
                                                                                    key={cat.id}
                                                                                    onClick={() => handleMagicShopeeLink(cat.keywords || cat.name)}
                                                                                    className="px-4 py-2 bg-white border border-orange-100 text-orange-600 rounded-xl text-[9px] font-black uppercase tracking-tighter hover:bg-orange-500 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                                                                                >
                                                                                    <Tag size={10} />
                                                                                    {cat.name}
                                                                                </button>
                                                                            ))
                                                                        ) : (
                                                                            <p className="text-[9px] text-gray-400 font-bold italic">Nenhuma categoria encontrada...</p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                /* --- 🌐 CUSTOM SITE LINK SHORTENER --- */
                                                                <div className="space-y-3 p-4 bg-indigo-50/30 border border-indigo-100 rounded-3xl">
                                                                    <div className="relative group">
                                                                        <div className="absolute top-4 left-4 text-indigo-500"><Globe size={16} /></div>
                                                                        <input 
                                                                            type="text" 
                                                                            value={customLink} 
                                                                            onChange={e => setCustomLink(e.target.value)}
                                                                            onKeyDown={(e) => e.key === 'Enter' && handleShortenCustomLink()}
                                                                            placeholder="https://seu-site-ou-link.com/pagina"
                                                                            className="w-full pl-12 pr-24 py-4 bg-white border-2 border-transparent rounded-2xl focus:border-indigo-600 outline-none text-gray-800 text-xs font-bold transition-all placeholder:text-indigo-300 shadow-sm" 
                                                                        />
                                                                        <div className="absolute right-2 top-2 bottom-2 flex gap-1">
                                                                            <button 
                                                                                onClick={handleShortenCustomLink}
                                                                                disabled={isGeneratingLink}
                                                                                title="Encurtar Link do Site"
                                                                                className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:grayscale flex items-center gap-2"
                                                                            >
                                                                                {isGeneratingLink ? <RefreshCcw size={14} className="animate-spin" /> : <Sparkles size={14} />}
                                                                                <span className="text-[10px] font-black uppercase tracking-widest">ENCURTAR</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    {shopeeLink && (
                                                                        <div className="p-3.5 bg-green-50 border border-green-100 rounded-2xl flex items-center justify-between text-[10px] text-green-700 font-black font-mono shadow-sm">
                                                                            <span className="truncate">🔗 LINK ENCURTADO: {shopeeLink}</span>
                                                                            <button 
                                                                                type="button"
                                                                                onClick={() => { navigator.clipboard.writeText(shopeeLink); showNotification('📋 Link encurtado copiado!', 'success'); }} 
                                                                                className="px-2.5 py-1 bg-white border border-green-200 hover:bg-green-100 rounded-lg transition-all active:scale-95 text-[9px] uppercase tracking-wider"
                                                                            >
                                                                                Copiar
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}

                                                            <div className="space-y-3">
                                                                <label className={`text-[10px] font-black ${labelColor} uppercase tracking-widest px-1 flex items-center gap-2 transition-colors duration-300`}>
                                                                    <ImageIcon size={12} /> IMAGEM_DO_COMENTÁRIO
                                                                </label>
                                                                <div className="relative">
                                                                    <input
                                                                        type="text"
                                                                        value={commentImageUrl}
                                                                        onChange={(e) => setCommentImageUrl(e.target.value)}
                                                                        placeholder="URL ou faça upload da imagem do produto..."
                                                                        className={`w-full p-5 ${inputBg} border ${inputBorder} rounded-2xl outline-none text-xs text-gray-900 placeholder:text-gray-400 transition-all duration-300 pr-32`}
                                                                    />
                                                                    <div className="absolute right-2 top-2 bottom-2">
                                                                        <label className={`h-full px-5 bg-white border ${buttonColor} rounded-xl flex items-center justify-center gap-2 text-[10px] font-black cursor-pointer transition-all duration-300 shadow-sm`}>
                                                                            {commentLoading ? <RefreshCcw size={13} className="animate-spin" /> : <Upload size={13} />}
                                                                            UPLOAD
                                                                            <input type="file" onChange={handleCommentFileUpload} className="hidden" accept="image/*" />
                                                                        </label>
                                                                    </div>
                                                                </div>
                                                                {commentImageUrl && (
                                                                    <div className={`flex items-center gap-3 p-3 ${previewBg} rounded-xl`}>
                                                                        <img src={commentImageUrl} alt="Comment preview" className={`w-12 h-12 object-cover rounded-lg border ${previewBorder}`} onError={(e) => (e.currentTarget.style.display = 'none')} />
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className={`text-[9px] font-black ${previewText} uppercase tracking-wide`}>Imagem selecionada ✓</p>
                                                                            <p className="text-[8px] text-gray-400 truncate">{commentImageUrl}</p>
                                                                        </div>
                                                                        <button onClick={() => setCommentImageUrl('')} className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0">
                                                                            <X size={14} />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="space-y-3">
                                                                <label className={`text-[10px] font-black ${labelColor} uppercase tracking-widest px-1 flex items-center gap-2 transition-colors duration-300`}>
                                                                    <FileText size={12} /> LEGENDA_DO_COMENTÁRIO
                                                                </label>
                                                                <textarea
                                                                    value={commentMessage}
                                                                    onChange={(e) => setCommentMessage(e.target.value)}
                                                                    placeholder="Pra quem não viu: ➡️ https://seulink.com"
                                                                    rows={3}
                                                                    className={`w-full p-5 ${inputBg} border ${inputBorder} rounded-2xl outline-none text-sm text-gray-900 placeholder:text-gray-400 resize-none transition-all duration-300 leading-relaxed`}
                                                                />
                                                                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                                                                    <Info size={12} className="text-amber-500 mt-0.5 shrink-0" />
                                                                    <p className="text-[9px] text-amber-700 font-bold leading-relaxed">
                                                                        Links encurtados ou redirecionados pelo <span className="text-orange-600">fluxointeligente.digital</span> evitam bloqueios e aumentam o alcance orgânico.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })()}
                                            </AnimatePresence>
                                        </div>
                                    )}

                                    <button 
                                        onClick={handleSendNow} 
                                        disabled={manualLoading || selectedPageIds.length === 0}
                                        className="w-full py-8 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black text-xs uppercase tracking-widest hover:shadow-2xl hover:shadow-purple-100 transition-all rounded-3xl active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                                    >
                                        {manualLoading
                                            ? <><RefreshCcw size={18} className="animate-spin" /> TRANSMITINDO...</>
                                            : <><Send size={18} /> {selectedPageIds.length === 0 ? 'SELECIONE UMA PÁGINA' : `TRANSMITIR PARA ${selectedPageIds.length} PÁGINA(S)`}</>
                                        }
                                    </button>
                                </div>


                                {/* Preview Column */}
                                <div className="lg:col-span-5 sticky top-32 space-y-6">
                                    <div className="flex items-center justify-between px-2">
                                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-widest flex items-center gap-2">
                                            <StatusPulse active={!!manualImageUrl} /> LIVE_PREVIEW
                                        </span>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{postType === 'feed' ? 'TIMELINE' : 'STORY_9:16'}</span>
                                    </div>

                                    <div className={`bg-white border border-gray-100 shadow-2xl rounded-[32px] overflow-hidden flex flex-col relative group ${postType === 'story' ? 'aspect-[9/16]' : 'aspect-square'}`}>
                                        {manualImageUrl ? (
                                            manualImageUrl.match(/\.(mp4|webm|ogg)$/i) || manualImageUrl.includes('video') ? (
                                                <video src={manualImageUrl} className="w-full h-full object-cover" autoPlay loop muted />
                                            ) : (
                                                <img src={manualImageUrl} className="w-full h-full object-cover" alt="Preview" />
                                            )
                                        ) : (
                                            <div className="flex-1 bg-gray-50 flex flex-col items-center justify-center gap-4 text-gray-300">
                                                <ImageIcon size={48} strokeWidth={1} />
                                                <span className="text-[10px] font-black uppercase tracking-[0.2em]">AGUARDANDO_MÍDIA</span>
                                            </div>
                                        )}

                                        {/* Facebook Post UI Overlay */}
                                        <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-black/60 to-transparent">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md"></div>
                                                <div className="w-24 h-2 bg-white/40 rounded-full"></div>
                                            </div>
                                            <p className="text-white text-[10px] font-medium line-clamp-2 opacity-90">
                                                {manualMessage || 'O texto da sua publicação aparecerá aqui...'}
                                            </p>
                                        </div>
                                    </div>
                                    
                                    <div className="p-6 bg-purple-50/50 border border-purple-100 rounded-2xl flex items-start gap-4">
                                        <Info size={16} className="text-purple-600 mt-1 shrink-0" />
                                        <p className="text-[10px] text-purple-700 font-bold leading-relaxed uppercase tracking-wide">
                                            DICA: Use imagens de alta resolução (1080x1080 para Feed ou 1080x1920 para Stories) para melhor engajamento.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : sendMode === 'auto' ? (
                        <div className="animate-in fade-in slide-in-from-bottom-5 duration-700 space-y-12">
                            <CommandCard className="p-16 relative overflow-hidden bg-white shadow-xl border-gray-100">
                                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/5 rounded-full -mr-40 -mt-40 blur-3xl"></div>
                                <div className="max-w-4xl mx-auto space-y-12 relative z-10">
                                    <div className="flex items-center gap-6 border-b border-gray-100 pb-12">
                                        <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
                                            <Bot size={32} className="text-white" />
                                        </div>
                                        <div>
                                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Afiliado_Shopee_FB</h2>
                                            <p className="text-gray-400 font-bold text-[10px] mt-1 uppercase tracking-widest leading-relaxed">Automação de extração e postagem de ofertas para o Facebook Page</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                                        {/* Configurações Shopee */}
                                        <div className="space-y-8">
                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Produtos por Postagem (Lote)</label>
                                                <select
                                                    value={productCount}
                                                    onChange={(e) => setProductCount(Number(e.target.value))}
                                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-blue-400 outline-none transition-all"
                                                >
                                                    {[1, 3, 5, 10, 15, 20].map(num => (
                                                        <option key={num} value={num}>{num} produtos por vez</option>
                                                    ))}
                                                </select>
                                                <p className="text-[9px] text-gray-400 uppercase font-bold ml-1 italic">Cada horário disparará o envio de {productCount} produtos.</p>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Categoria de Produtos</label>
                                                <select
                                                    value={categoryType}
                                                    onChange={(e) => setCategoryType(e.target.value)}
                                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-blue-400 outline-none transition-all"
                                                >
                                                    <option value="random">ALEATÓRIO</option>
                                                    <option value="best_sellers">MAIS VENDIDOS</option>
                                                    <option value="cheapest">MAIS BARATOS</option>
                                                    <option value="expensive">MAIS CAROS</option>
                                                    {shopeeCategories.map(cat => (
                                                        <option key={cat.id} value={cat.slug}>{cat.name}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Posicionamento (Onde Postar)</label>
                                                <div className="flex bg-gray-50 p-1 border border-gray-100 rounded-2xl">
                                                    <button 
                                                       onClick={() => setShopeePostType('feed')} 
                                                       className={`flex-1 py-4 text-[10px] font-black transition-all uppercase tracking-widest rounded-xl ${shopeePostType === 'feed' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-blue-600'}`}
                                                    >
                                                       Postagem Feed
                                                    </button>
                                                    <button 
                                                       onClick={() => setShopeePostType('reels')} 
                                                       className={`flex-1 py-4 text-[10px] font-black transition-all uppercase tracking-widest rounded-xl ${shopeePostType === 'reels' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-blue-600'}`}
                                                    >
                                                       Facebook Reels
                                                    </button>
                                                    <button 
                                                       onClick={() => setShopeePostType('story')} 
                                                       className={`flex-1 py-4 text-[10px] font-black transition-all uppercase tracking-widest rounded-xl ${shopeePostType === 'story' ? 'bg-white text-blue-600 shadow-sm border border-gray-100' : 'text-gray-400 hover:text-blue-600'}`}
                                                    >
                                                       Story da Página
                                                     </button>
                                                </div>
                                                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black flex items-center gap-2">
                                                    <Info size={12} className="text-blue-500" /> Reels e Stories aceitam vídeos dos produtos.
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Tipo de Mídia (Preferência)</label>
                                                <select
                                                    value={mediaType}
                                                    onChange={(e) => setMediaType(e.target.value as any)}
                                                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-blue-400 outline-none transition-all"
                                                >
                                                    <option value="auto">QUALQUER (Vídeo se houver)</option>
                                                    <option value="image">APENAS IMAGEM</option>
                                                    <option value="video">APENAS VÍDEO</option>
                                                </select>
                                                <p className="text-[9px] text-gray-400 uppercase tracking-widest font-black flex items-center gap-2">
                                                    <Bot size={12} className="text-blue-500" /> Controla o que será extraído da Shopee.
                                                </p>
                                            </div>

                                            <div className="space-y-4">
                                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Template de Legenda</label>
                                                <textarea
                                                    value={messageTemplate}
                                                    onChange={(e) => setMessageTemplate(e.target.value)}
                                                    className="w-full h-32 p-6 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-xs text-gray-900 focus:border-blue-400 outline-none transition-all resize-none"
                                                    placeholder="🔥 MEGA OFERTA: {product_name} \n💳 Apenas: {price}\n👉 Compre aqui: {product_link}"
                                                />
                                            </div>
                                        </div>

                                        {/* Ações */}
                                        <div className="space-y-12">
                                            <div className="p-8 bg-gray-50 border border-gray-100 rounded-3xl space-y-6">
                                                <div>
                                                    <h3 className="font-black text-gray-900 text-sm uppercase tracking-widest">Postagem Rápida</h3>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Posta agora na Página do Facebook selecionada</p>
                                                </div>
                                                <TacticalButton
                                                    onClick={handleExecuteNowShopee} 
                                                    disabled={manualLoading}
                                                    color="purple"
                                                    className="w-full py-6"
                                                >
                                                    <div className="flex items-center justify-center gap-3">
                                                        {manualLoading ? <Activity size={18} className="animate-spin" /> : <Play size={18} />}
                                                        Executar Disparo Agora
                                                    </div>
                                                </TacticalButton>
                                            </div>

                                            <div className="p-8 bg-white border-2 border-blue-100 shadow-xl shadow-blue-500/5 rounded-3xl space-y-6">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <h3 className="font-black text-blue-600 text-sm uppercase tracking-widest flex items-center gap-2">
                                                            <Calendar size={16} /> Agendamento Automático
                                                        </h3>
                                                        <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Busca e posta produtos nos horários programados</p>
                                                    </div>
                                                    <button 
                                                        onClick={() => setAutomationEnabled(!automationEnabled)}
                                                        className={`w-14 h-8 rounded-full transition-colors flex items-center px-1 ${automationEnabled ? 'bg-blue-500' : 'bg-gray-200'}`}
                                                    >
                                                        <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${automationEnabled ? 'transform translate-x-6' : ''}`} />
                                                    </button>
                                                </div>

                                                <AnimatePresence>
                                                    {automationEnabled && (
                                                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="space-y-6 overflow-hidden">
                                                            <div className="space-y-4">
                                                                <div className="flex items-center justify-between mb-2">
                                                                    <div className="flex items-center gap-4">
                                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Frequência Diária</label>
                                                                        <button 
                                                                            onClick={() => setCustomTimes(["11:00", "15:00", "18:00", "20:00", "22:00"].sort())}
                                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-widest hover:opacity-90 transition-all shadow-md active:scale-95"
                                                                        >
                                                                            <Zap size={10} fill="currentColor" /> Sugerir Horários
                                                                        </button>
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-100 uppercase tracking-wider">{customTimes.length} POSTAGENS POR DIA</span>
                                                                </div>
                                                                <div className="flex flex-wrap gap-3">
                                                                    {customTimes.map((time, idx) => (
                                                                        <div key={idx} className="flex items-center gap-2 border border-blue-100 bg-blue-50/30 px-4 py-2 rounded-xl">
                                                                            <input 
                                                                                type="time" 
                                                                                value={time}
                                                                                onChange={(e) => {
                                                                                    const newTimes = [...customTimes];
                                                                                    newTimes[idx] = e.target.value;
                                                                                    setCustomTimes(newTimes);
                                                                                }}
                                                                                className="bg-transparent font-black text-xs text-blue-600 outline-none"
                                                                            />
                                                                            <button onClick={() => setCustomTimes(customTimes.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600 transition-colors">
                                                                                <Trash size={14} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                    <button onClick={() => setCustomTimes([...customTimes, '12:00'])} className="px-4 py-2 border border-dashed border-blue-300 text-blue-400 hover:text-blue-500 hover:border-blue-500 rounded-xl font-bold text-xs transition-all uppercase tracking-widest">
                                                                        + ADICIONAR
                                                                    </button>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-4 pt-4 border-t border-blue-50">
                                                                <div className="flex items-center justify-between">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Variação Aleatória (Anti-Detecção)</label>
                                                                    <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg">± {randomVariation} min</span>
                                                                </div>
                                                                <input 
                                                                    type="range" 
                                                                    min="0" 
                                                                    max="30" 
                                                                    value={randomVariation}
                                                                    onChange={(e) => setRandomVariation(Number(e.target.value))}
                                                                    className="w-full h-2 bg-blue-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                                />
                                                                <p className="text-[9px] text-gray-400 uppercase font-bold">O sistema variará o horário base em até {randomVariation} minutos para simular comportamento humano.</p>
                                                            </div>

                                                            {plannedTasks.length > 0 && (
                                                                <div className="space-y-3 pt-4 border-t border-blue-50">
                                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 flex items-center gap-2">
                                                                        <Activity size={12} className="text-blue-500" /> Próximas Postagens Planejadas
                                                                    </label>
                                                                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                                                                        {plannedTasks.map((t, i) => (
                                                                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] font-black text-gray-700">{new Date(t.planned_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                                    <span className="text-[8px] font-bold text-gray-400 uppercase">{new Date(t.planned_time).toLocaleDateString()}</span>
                                                                                </div>
                                                                                <span className="text-[8px] font-black px-2 py-1 bg-blue-100 text-blue-600 rounded-md uppercase tracking-wider">{t.status}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <TacticalButton
                                                                onClick={handleScheduleShopee}
                                                                color="slate"
                                                                className="w-full py-5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-none text-white shadow-lg shadow-blue-500/30 font-black text-[10px] uppercase tracking-[0.2em]"
                                                            >
                                                                Ativar Automação Shopee
                                                            </TacticalButton>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </CommandCard>
                        </div>
                    ) : (
                        <div className="animate-in zoom-in-95 duration-700">
                            <StorySchedulerPage platform="facebook" accounts={[]} pages={pages} />
                        </div>
                    )}
                </div>
            </div>


            {/* Modal remains at end */}
            <ReelEditorModal 
                video={editingReel}
                isOpen={showReelEditor}
                onClose={() => setShowReelEditor(false)}
                onSave={handleUpdateReel}
            />

            <PostUploadChoiceModal 
                isOpen={showUploadChoice}
                onClose={() => setShowUploadChoice(false)}
                onSchedule={() => {
                    setShowUploadChoice(false);
                    setScheduleMode('automated');
                    // Scroll to scheduling panel if needed
                    window.scrollTo({ top: 300, behavior: 'smooth' });
                }}
                onSendNow={async (accountId, title, caption) => {
                    setShowUploadChoice(false);
                    
                    // If title or caption provided, update the recently uploaded items first
                    if (title || caption) {
                        try {
                            for (const id of lastUploadedIds) {
                                await api.put(`/facebook/reels/queue/${id}`, { title, caption });
                            }
                        } catch (err) {
                            console.error('Error updating metadata for FB quick post:', err);
                        }
                    }

                    handleBulkAction('publish', accountId ? String(accountId) : undefined, lastUploadedIds);
                    setLastUploadedIds([]);
                }}
                itemCount={lastUploadedCount}
                accounts={pages}
                platform="facebook"
            />
        </div>
    );
};

export default FacebookAutomationPage;
