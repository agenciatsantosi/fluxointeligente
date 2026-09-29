import { downloadToLocal } from './services/downloaderService.js';
import { mixBackgroundAudio } from './services/videoService.js';

async function run() {
    try {
        const videoUrl = 'https://www.tiktok.com/@safadaindelicada/video/7356230623';
        const audioUrl = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1';
        
        console.log('Downloading video...');
        const dl = await downloadToLocal(videoUrl, 'video', videoUrl, 'video');
        console.log('Download result:', dl);
        
        if (dl.success) {
            console.log('Mixing audio...');
            const mix = await mixBackgroundAudio(dl.absolutePath, audioUrl, 0.25);
            console.log('Mix result:', mix);
        }
    } catch (e) {
        console.error('ERROR:', e);
    }
}
run();
