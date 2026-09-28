import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Mobile device profiles to rotate through (avoids fingerprint pattern detection)
const MOBILE_PROFILES = [
    {
        make: 'Apple',
        model: 'iPhone 15 Pro Max',
        software: '17.4.1',
        encoder: 'H.264',
        location: '+23.5505-046.6333/', // São Paulo, BR
        os: 'iOS'
    },
    {
        make: 'Apple',
        model: 'iPhone 14',
        software: '17.3',
        encoder: 'H.264',
        location: '-22.9068-043.1729/', // Rio de Janeiro, BR
        os: 'iOS'
    },
    {
        make: 'samsung',
        model: 'SM-S918B',      // Samsung Galaxy S23 Ultra
        software: 'S918BXXS3CWL1',
        encoder: 'OMX.SEC.avc.enc',
        location: '+23.5505-046.6333/',
        os: 'Android'
    },
    {
        make: 'xiaomi',
        model: '2312DRA50G',    // Xiaomi Redmi Note 13
        software: 'OS1.0.8.0.UMQBRXM',
        encoder: 'OMX.qcom.video.encoder.avc',
        location: '-23.5489-046.6388/',
        os: 'Android'
    }
];

/**
 * Injects realistic Mobile device metadata into an MP4 file using FFmpeg stream copy.
 * This makes the video appear as if it was recorded natively on a phone,
 * which significantly increases organic reach on Facebook/Instagram.
 * 
 * Uses -c copy so it does NOT re-encode — just rewrites the container metadata.
 */
export async function injectMobileMetadata(inputPath) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, `_mobile${ext}`);

    // Pick a random device profile
    const profile = MOBILE_PROFILES[Math.floor(Math.random() * MOBILE_PROFILES.length)];
    
    // Generate a realistic timestamp (between 2 and 45 minutes ago) for 'date' metadata
    const minutesAgo = Math.floor(Math.random() * 44) + 2;
    const recordDate = new Date(Date.now() - minutesAgo * 60 * 1000);
    const dateStr = recordDate.toISOString().replace('T', ' ').substring(0, 19);

    console.log(`[MOBILE META] Injecting metadata. Profile: ${profile.model} | Date: ${dateStr} (${minutesAgo} mins ago)`);

    // Build FFmpeg command — uses stream copy (-c copy) to avoid re-encoding
    const metadataArgs = [
        `-metadata make="${profile.make}"`,
        `-metadata model="${profile.model}"`,
        `-metadata software="${profile.software}"`,
        `-metadata encoder="${profile.encoder}"`,
        `-metadata creation_time="${recordDate.toISOString()}"`,
        `-metadata date="${dateStr}"`,
        `-metadata location="${profile.location}"`,
        `-metadata location-eng="${profile.location}"`,
        profile.os === 'Android' ? `-metadata com.android.version="14"` : `-metadata com.apple.quicktime.make="Apple" -metadata com.apple.quicktime.model="${profile.model}" -metadata com.apple.quicktime.software="${profile.software}"`,
        `-metadata handler_name="VideoHandle"`,
    ].join(' ');

    // -map_metadata -1 clears original metadata, then we write fresh mobile ones
    // -movflags use_metadata_tags allows writing custom tags to the mp4 container
    const ffmpegBin = resolveTool('ffmpeg');
    if (!ffmpegBin) {
        return { success: false, path: inputPath, error: 'FFmpeg indisponível' };
    }
    const command = `"${ffmpegBin}" -y -nostats -loglevel error -i "${inputPath}" -c copy -map_metadata -1 ${metadataArgs} -movflags use_metadata_tags+faststart "${outputPath}"`;

    try {
        await execPromise(command, EXEC_OPTS);

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
            console.log(`[MOBILE META] ✅ Metadados mobile injetados com sucesso. Modelo: ${profile.model}`);
            return { success: true, path: inputPath, profile: profile.model };
        } else {
            throw new Error('Output file missing or empty after metadata injection');
        }
    } catch (error) {
        console.error('[MOBILE META] ❌ Falha ao injetar metadados:', error.message);
        // Clean up failed output
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        // Not fatal — return original file unchanged
        return { success: false, path: inputPath, error: error.message };
    }
}

/**
 * Ensures a video is compatible with Instagram/Meta Graph API:
 * - Codec: H.264 (libx264)
 * - Audio: AAC
 * - Aspect Ratio: 9:16 (padded if necessary)
 * - Container: mp4
 * - Max Duration: 60s (for Story)
 */
export async function processVideoForInstagram(inputPath, aspectRatio = '9:16') {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, '_processed.mp4');
    
    // Resolution map
    const resolutions = {
        '9:16': { w: 1080, h: 1920 },
        '1:1': { w: 1080, h: 1080 },
        '4:5': { w: 1080, h: 1350 },
        '16:9': { w: 1920, h: 1080 }
    };

    const target = resolutions[aspectRatio] || resolutions['9:16'];
    
    console.log(`[VIDEO PROCESS] Processing (${aspectRatio}): ${inputPath} -> ${outputPath}`);

    try {
        // --- VIDEO UNIQUIFIER ENGINE ---
        // Generates random variations to bypass Meta's Perceptual Hashing (pHash) and Audio Fingerprinting
        
        // 1. Audio Fingerprint Scrambler: slightly change audio speed (+1% to +2.5%)
        // The pitch is corrected automatically by the atempo filter.
        const atempo = (Math.random() * (1.025 - 1.010) + 1.010).toFixed(3);
        
        // 2. Visual Scrambler: Micro-adjustments in brightness, contrast, and saturation
        const brightness = (Math.random() * (0.05 - (-0.02)) + (-0.02)).toFixed(3); // -0.02 to 0.05
        const contrast = (Math.random() * (1.05 - 0.98) + 0.98).toFixed(3); // 0.98 to 1.05
        const saturation = (Math.random() * (1.10 - 0.95) + 0.95).toFixed(3); // 0.95 to 1.10
        
        // 3. Visual Scrambler: Micro-crop (Zoom in 1% to 3%)
        const cropZoom = (Math.random() * (0.03 - 0.01) + 0.01).toFixed(3);
        const cropFactor = 1 - parseFloat(cropZoom);

        console.log(`[VIDEO UNIQUIFIER] Applying Scrambler Filters:`);
        console.log(`   - Audio Speed: ${atempo}x`);
        console.log(`   - Color eq: B=${brightness} C=${contrast} S=${saturation}`);
        console.log(`   - Micro-Crop: Zoom ${cropZoom}`);

        // Build FFMPEG filters
        // -vf "crop=iw*FACTOR:ih*FACTOR,eq=...,scale=W:H:force...,pad=..." 
        const vfCropAndColor = `crop=iw*${cropFactor}:ih*${cropFactor},eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`;
        const vfScale = `scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease,pad=${target.w}:${target.h}:(ow-iw)/2:(oh-ih)/2`;
        const finalVf = `${vfCropAndColor},${vfScale}`;
        
        const command = `ffmpeg -y -i "${inputPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -profile:v main -level 4.1 -pix_fmt yuv420p -b:v 4M -maxrate 5M -bufsize 10M -vf "${finalVf}" -c:a aac -b:a 128k -af "atempo=${atempo}" -shortest -movflags +faststart -t 90 "${outputPath}"`;

        const { stdout, stderr } = await execPromise(command);
        
        console.log(`[VIDEO PROCESS] Finished processing: ${outputPath}`);
        
        // Verify output exists
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
            
            // AUTOMATICALLY INJECT MOBILE METADATA AFTER PROCESSING
            await injectMobileMetadata(inputPath);
            
            return { success: true, path: inputPath };
        } else {
            throw new Error('Processed file not found');
        }
    } catch (error) {
        console.error('[VIDEO PROCESS] Error:', error.message);
        // If processing fails, cleanup output and throw
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
}

/**
 * Applies a robust Anti-Copyright filter for Facebook videos:
 * - Scrambles audio fingerprint by adding low-volume brown noise and slightly changing pitch/tempo.
 * - Scrambles visual fingerprint by slightly cropping, and shifting brightness/contrast.
 */
export async function processVideoForFacebookAntiCopy(inputPath) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, '_fb_anticopy.mp4');
    
    console.log(`[FB ANTI-COPY] Applying anti-copyright filters: ${inputPath} -> ${outputPath}`);

    try {
        // Visual Scrambler
        // Visual Scrambler V2
        const brightness = (Math.random() * (0.04 - (-0.01)) + (-0.01)).toFixed(3); 
        const contrast = (Math.random() * (1.04 - 0.98) + 0.98).toFixed(3); 
        const saturation = (Math.random() * (1.08 - 0.96) + 0.96).toFixed(3); 
        const cropZoom = (Math.random() * (0.04 - 0.01) + 0.01).toFixed(3);
        const cropFactor = 1 - parseFloat(cropZoom);
        
        // Espelhamento Aleatório (Flip) imperceptível (10% de chance)
        const flip = Math.random() > 0.9 ? ",hflip" : "";
        
        // Zoompan sutil (movimento contínuo e bem pequeno)
        const zoompanOptions = `zoom='1.015+0.005*sin(iw*time)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920`;

        // Audio Scrambler (atempo + brown noise at volume 0.015)
        const atempo = (Math.random() * (1.025 - 1.010) + 1.010).toFixed(3);

        const vfFilter = `crop=iw*${cropFactor}:ih*${cropFactor},eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}${flip},zoompan=${zoompanOptions}`;
        const filterComplex = `[0:v]${vfFilter}[vout];[0:a]atempo=${atempo}[a_sped];[a_sped][1:a]amix=inputs=2:duration=first:dropout_transition=2[aout]`;

        // Dynamic Bitrate
        const crf = Math.floor(Math.random() * (26 - 20 + 1)) + 20;
        const maxRate = Math.floor(Math.random() * 5 + 3);
        const bufSize = Math.floor(Math.random() * 8 + 6);

        // We use anoisesrc to generate brown noise (sounds like very low wind), and amix to merge it.
        const command = `ffmpeg -y -i "${inputPath}" -f lavfi -i "anoisesrc=color=brown:r=44100:a=0.015" -filter_complex "${filterComplex}" -map "[vout]" -map "[aout]" -c:v libx264 -preset fast -crf ${crf} -maxrate ${maxRate}M -bufsize ${bufSize}M -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`;

        const { stdout, stderr } = await execPromise(command);
        
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
            
            console.log(`[FB ANTI-COPY] ✅ Filters applied successfully!`);
            return { success: true, path: inputPath };
        } else {
            throw new Error('Processed file not found');
        }
    } catch (error) {
        console.error('[FB ANTI-COPY] ❌ Error applying filters:', error.message);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        
        // Return original if it fails (do not crash the upload completely)
        return { success: false, path: inputPath, error: error.message };
    }
}

/**
 * Gets video metadata (duration, width, height)
 */
export async function getVideoMetadata(videoPath) {
    try {
        const command = `ffprobe -v error -show_entries format=duration -show_entries stream=width,height -of json "${videoPath}"`;
        const { stdout } = await execPromise(command);
        return JSON.parse(stdout);
    } catch (error) {
        console.error('[VIDEO PROCESS] Metadata error:', error.message);
        return null;
    }
}

/**
 * Adds a text overlay (watermark) to the video
 */
export async function burnTextToVideo(inputPath, text) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, '_with_text.mp4');
    
    console.log(`[VIDEO PROCESS] Adding text to video: ${inputPath} -> ${outputPath}`);

    try {
        const safeText = text.replace(/'/g, "\\'").replace(/:/g, "\\:");
        // x=(w-tw)/2 centers horizontally, y=h-th-180 puts it near the bottom
        const drawtextFilter = `drawtext=text='${safeText}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-text_h-180`;
        
        const command = `ffmpeg -y -i "${inputPath}" -vf "${drawtextFilter}" -c:v libx264 -preset fast -crf 23 -c:a copy "${outputPath}"`;

        const { stdout, stderr } = await execPromise(command);
        
        console.log(`[VIDEO PROCESS] Finished adding text: ${outputPath}`);
        
        if (fs.existsSync(outputPath)) {
            // Overwrite original
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
            return { success: true, path: inputPath };
        } else {
            throw new Error('Processed text video not found');
        }
    } catch (error) {
        console.error('[VIDEO PROCESS] Error adding text:', error.message);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
}

/**
 * Converts a static image to a 5-second MP4 video formatted for TikTok/Reels (9:16).
 */
export async function convertImageToVideo(imagePath) {
    const ext = path.extname(imagePath).toLowerCase();
    if (ext === '.mp4' || ext === '.webm') return imagePath; // Already a video
    
    const outputPath = imagePath.replace(ext, '_tiktok.mp4');
    console.log(`[VIDEO PROCESS] Converting image to 5s video for TikTok: ${imagePath}`);

    try {
        const command = `ffmpeg -y -loop 1 -i "${imagePath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -t 5 -pix_fmt yuv420p -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:a aac -shortest "${outputPath}"`;
        
        await execPromise(command);
        
        if (fs.existsSync(outputPath)) {
            console.log(`[VIDEO PROCESS] Success: ${outputPath}`);
            return outputPath;
        }
        throw new Error('Converted video file not found');
    } catch (error) {
        console.error('[VIDEO PROCESS] Error converting image to video:', error.message);
        throw error;
    }
}

/**
 * Converts multiple static images into a single MP4 slideshow video formatted for TikTok/Reels (9:16).
 * Each image is displayed for 3 seconds.
 */
export async function convertImagesToSlideshow(imagePaths) {
    if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
        throw new Error("No image paths provided for slideshow");
    }
    
    if (imagePaths.length === 1) {
        return await convertImageToVideo(imagePaths[0]);
    }

    const firstImageExt = path.extname(imagePaths[0]).toLowerCase();
    const outputPath = imagePaths[0].replace(firstImageExt, '_slideshow_tiktok.mp4');
    console.log(`[VIDEO PROCESS] Converting ${imagePaths.length} images to slideshow video for TikTok...`);

    try {
        let inputs = '';
        let filterComplex = '';
        let concatStreams = '';

        for (let i = 0; i < imagePaths.length; i++) {
            // -loop 1 -t 3 means loop each image for 3 seconds
            inputs += `-loop 1 -t 3 -i "${imagePaths[i]}" `;
            
            // scale and pad each image to 1080:1920 to ensure uniformity
            filterComplex += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[v${i}];`;
            concatStreams += `[v${i}]`;
        }

        // concat the scaled streams
        filterComplex += `${concatStreams}concat=n=${imagePaths.length}:v=1:a=0[outv]`;

        // Run ffmpeg with lavfi anullsrc to add silent audio channel, which TikTok likes
        const command = `ffmpeg -y ${inputs} -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -filter_complex "${filterComplex}" -map "[outv]" -map ${imagePaths.length}:a -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest "${outputPath}"`;
        
        await execPromise(command);
        
        if (fs.existsSync(outputPath)) {
            console.log(`[VIDEO PROCESS] Slideshow Success: ${outputPath}`);
            return outputPath;
        }
        throw new Error('Converted slideshow video file not found');
    } catch (error) {
        console.error('[VIDEO PROCESS] Error converting images to slideshow:', error.message);
        throw error;
    }
}

/**
 * Mixes background music into a video with adjustable background volume.
 * Supports both local files and remote HTTP URLs for the audio file.
 * Handles both videos with and without existing audio tracks gracefully.
 */
export async function mixBackgroundAudio(videoPath, audioUrlOrPath, volumePercent = 0.25) {
    const axios = (await import('axios')).default;
    const crypto = (await import('crypto')).default;
    
    const ext = path.extname(videoPath);
    const outputPath = videoPath.replace(ext, `_mixed_${crypto.randomUUID().substring(0, 8)}${ext}`);
    
    let tempAudioPath = null;
    
    try {
        console.log(`[AUDIO MIXER] Starting mix: Video=${videoPath} | Audio=${audioUrlOrPath} | Vol=${volumePercent}`);
        
        // TikTok Music URL Auto-Extractor
        if (audioUrlOrPath.startsWith('http') && audioUrlOrPath.includes('tiktok.com/music/')) {
            console.log(`[AUDIO MIXER] Detected TikTok music URL. Extracting direct MP3 link using Puppeteer...`);
            const puppeteerExtra = (await import('puppeteer-extra')).default;
            const StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
            
            try {
                puppeteerExtra.use(StealthPlugin());
            } catch (e) {}

            const browser = await puppeteerExtra.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
            });
            
            try {
                const page = await browser.newPage();
                let playUrl = null;

                page.on('response', async (response) => {
                    const resUrl = response.url();
                    if (resUrl.includes('/api/music/detail/')) {
                        try {
                            const text = await response.text();
                            const data = JSON.parse(text);
                            const musicInfo = data.musicInfo?.music;
                            if (musicInfo && musicInfo.playUrl) {
                                playUrl = musicInfo.playUrl;
                            }
                        } catch (e) {}
                    }
                });

                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
                await page.goto(audioUrlOrPath, { waitUntil: 'networkidle2', timeout: 30000 });

                // Wait up to 5 seconds for API response to populate playUrl
                for (let i = 0; i < 10; i++) {
                    if (playUrl) break;
                    await new Promise(r => setTimeout(r, 500));
                }

                if (playUrl) {
                    console.log(`[AUDIO MIXER] ✅ Extracted TikTok play URL: ${playUrl}`);
                    audioUrlOrPath = playUrl;
                } else {
                    throw new Error('Não foi possível encontrar a trilha direta de áudio na página do TikTok.');
                }
            } finally {
                await browser.close();
            }
        }

        // YouTube Audio Auto-Extractor
        if (audioUrlOrPath.startsWith('http') && (audioUrlOrPath.includes('youtube.com/') || audioUrlOrPath.includes('youtu.be/'))) {
            console.log(`[AUDIO MIXER] Detected YouTube URL for background music. Extracting audio using yt-dlp...`);
            
            const downloadsDir = path.join(process.cwd(), 'uploads', 'downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
            
            const tempAudioFilename = `youtube_bg_${crypto.randomUUID()}.mp3`;
            const tempAudioOutPath = path.join(downloadsDir, tempAudioFilename);
            
            const executable = process.platform === 'win32' 
                ? (fs.existsSync(path.join(process.cwd(), 'bin', 'yt-dlp.exe')) ? path.join(process.cwd(), 'bin', 'yt-dlp.exe') : 'yt-dlp')
                : (fs.existsSync(path.join(process.cwd(), 'bin', 'yt-dlp')) ? path.join(process.cwd(), 'bin', 'yt-dlp') : 'yt-dlp');
                
            // Download only the best audio format and convert/extract as MP3 using yt-dlp
            const dlCommand = `"${executable}" -f "ba" -x --audio-format mp3 -o "${tempAudioOutPath}" "${audioUrlOrPath}"`;
            console.log(`[AUDIO MIXER] Running yt-dlp audio download command: ${dlCommand}`);
            
            try {
                await execPromise(dlCommand);
                if (fs.existsSync(tempAudioOutPath)) {
                    console.log(`[AUDIO MIXER] ✅ Successfully extracted YouTube audio to: ${tempAudioOutPath}`);
                    audioUrlOrPath = tempAudioOutPath;
                } else {
                    throw new Error('yt-dlp completed but output audio file was not found.');
                }
            } catch (dlErr) {
                console.error(`[AUDIO MIXER] ❌ Failed to extract YouTube audio with yt-dlp:`, dlErr.message);
                throw new Error(`Falha ao extrair áudio do link do YouTube: ${dlErr.message}`);
            }
        }

        // 1. Resolve Audio Path (Download if remote URL)
        if (audioUrlOrPath.startsWith('http')) {
            const downloadsDir = path.join(process.cwd(), 'uploads', 'downloads');
            if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir, { recursive: true });
            
            tempAudioPath = path.join(downloadsDir, `temp_bg_${crypto.randomUUID()}${path.extname(new URL(audioUrlOrPath).pathname) || '.mp3'}`);
            console.log(`[AUDIO MIXER] Downloading remote MP3 to: ${tempAudioPath}`);
            
            const response = await axios({
                url: audioUrlOrPath,
                method: 'GET',
                responseType: 'stream',
                timeout: 30000
            });
            
            const writer = fs.createWriteStream(tempAudioPath);
            response.data.pipe(writer);
            
            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
            console.log(`[AUDIO MIXER] Remote MP3 downloaded successfully.`);
        } else {
            tempAudioPath = audioUrlOrPath;
        }
        
        if (!fs.existsSync(tempAudioPath)) {
            throw new Error(`Audio file not found at: ${tempAudioPath}`);
        }
        
        // 2. Mix Audio using FFmpeg (Try mixing with existing audio stream first)
        console.log(`[AUDIO MIXER] Executing FFmpeg mixing command...`);
        let success = false;
        
        // Strategy A: Input video has an audio stream. Mix them using amix filter.
        const filterComplexMix = `[0:a]volume=1.0[a1];[1:a]volume=${volumePercent}[a2];[a1][a2]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[a]`;
        const commandMix = `ffmpeg -y -i "${videoPath}" -i "${tempAudioPath}" -filter_complex "${filterComplexMix}" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest -movflags +faststart "${outputPath}"`;
        
        try {
            await execPromise(commandMix);
            success = true;
            console.log(`[AUDIO MIXER] ✅ Successfully mixed audio using amix (Video has original audio).`);
        } catch (mixErr) {
            console.warn(`[AUDIO MIXER] amix failed (Video likely has no audio stream). Trying overlay fallback...`);
            
            // Strategy B Fallback: Input video has NO audio stream. Simply apply the background audio.
            const filterComplexOverlay = `[1:a]volume=${volumePercent}[a]`;
            const commandOverlay = `ffmpeg -y -i "${videoPath}" -i "${tempAudioPath}" -filter_complex "${filterComplexOverlay}" -map 0:v -map "[a]" -c:v copy -c:a aac -shortest -movflags +faststart "${outputPath}"`;
            
            await execPromise(commandOverlay);
            success = true;
            console.log(`[AUDIO MIXER] ✅ Successfully overlaid audio (Video had no original audio).`);
        }
        
        if (success && fs.existsSync(outputPath)) {
            // Overwrite original video with the mixed output
            fs.unlinkSync(videoPath);
            fs.renameSync(outputPath, videoPath);
            console.log(`[AUDIO MIXER] ✅ Mix complete! File updated: ${videoPath}`);
            return { success: true, path: videoPath };
        } else {
            throw new Error('Mixed output file not found or empty');
        }
    } catch (err) {
        console.error(`[AUDIO MIXER] ❌ Error mixing audio:`, err.message);
        if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch (e) {}
        }
        throw err;
    } finally {
        // Clean up temporary downloaded audio files to keep server clean
        if (tempAudioPath && audioUrlOrPath.startsWith('http') && fs.existsSync(tempAudioPath)) {
            try {
                fs.unlinkSync(tempAudioPath);
                console.log(`[AUDIO MIXER CLEANUP] Deleted temp audio file: ${tempAudioPath}`);
            } catch (e) {}
        }
    }
}

// =====================================================================================
// 🎬 TIKTOK ORIGINALITY PIPELINE
// Turns a raw/foreign video into a properly authored TikTok-format piece of content:
//   - Reframes to native 9:16 (fills the screen, no letterboxing)
//   - Adds the creator's own headline + @handle overlay (authorship marks)
//   - Re-encodes at TikTok-quality bitrate (avoids "baixa qualidade")
//   - Applies subtle visual variation (micro-crop / color / bitrate)
//   - Injects realistic mobile capture metadata
// Everything is FAIL-SAFE: if ffmpeg or a font is unavailable, the original
// file is returned unchanged so the post is never blocked by processing.
// =====================================================================================

// --- FFmpeg binary discovery -------------------------------------------------
// The server process may have been started before ffmpeg was installed (or
// before its PATH was updated), so we do NOT rely on the bare command name:
// we resolve the real binary path once and reuse it everywhere.
const EXEC_OPTS = { maxBuffer: 16 * 1024 * 1024, timeout: 15 * 60 * 1000 };
const toolCache = {};

function searchBinary(root, filename, depth = 5) {
    if (depth < 0 || !fs.existsSync(root)) return null;
    let entries;
    try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch (e) { return null; }
    for (const e of entries) {
        if (e.isFile() && e.name.toLowerCase() === filename) return path.join(root, e.name);
    }
    for (const e of entries) {
        if (e.isDirectory()) {
            const found = searchBinary(path.join(root, e.name), filename, depth - 1);
            if (found) return found;
        }
    }
    return null;
}

export function resolveTool(name) {
    if (name in toolCache) return toolCache[name];
    const exe = process.platform === 'win32' ? `${name}.exe` : name;
    const candidates = [];

    if (process.platform === 'win32') {
        const local = process.env.LOCALAPPDATA || '';
        candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', exe));
        candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Packages')); // searched recursively
        candidates.push(path.join(process.cwd(), 'bin', exe));
        candidates.push('C:\\ffmpeg\\bin\\' + exe);
    } else {
        candidates.push(`/usr/bin/${name}`, `/usr/local/bin/${name}`, `/opt/homebrew/bin/${name}`);
        candidates.push(path.join(process.cwd(), 'bin', name));
    }

    // 1) exact known locations
    for (const c of candidates) {
        try {
            if (fs.existsSync(c) && fs.statSync(c).isFile()) { toolCache[name] = c; return c; }
        } catch (e) {}
    }
    // 2) recursive search inside the likely folders (Winget layout varies by version)
    for (const c of candidates) {
        try {
            const root = fs.existsSync(c) && fs.statSync(c).isDirectory() ? c : path.dirname(c);
            const found = searchBinary(root, exe.toLowerCase(), 5);
            if (found) { toolCache[name] = found; return found; }
        } catch (e) {}
    }

    toolCache[name] = null;
    return null;
}

let ffmpegAvailabilityCache = null;
export function getFfmpegBin() {
    return resolveTool('ffmpeg');
}

async function isFfmpegAvailable() {
    if (ffmpegAvailabilityCache !== null) return ffmpegAvailabilityCache;
    const bin = resolveTool('ffmpeg');
    if (!bin) {
        ffmpegAvailabilityCache = false;
        console.warn('[TIKTOK PIPELINE] FFmpeg não encontrado. Processamento ignorado.');
        return false;
    }
    try {
        await execPromise(`"${bin}" -version`, { timeout: 30000, maxBuffer: 1024 * 1024 });
        ffmpegAvailabilityCache = true;
    } catch (e) {
        ffmpegAvailabilityCache = false;
        console.warn('[TIKTOK PIPELINE] FFmpeg encontrado mas não executável:', bin, e.message);
    }
    return ffmpegAvailabilityCache;
}

// NOTE: in ffmpeg's filter syntax a ":" inside a quoted value is NOT protected
// on Windows (drive letters break the graph), so we copy a system font into the
// project and reference it with a RELATIVE path (no colon, no spaces).
const FONT_CANDIDATES = [
    'C:/Windows/Fonts/arialbd.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/segoeuib.ttf',
    'C:/Windows/Fonts/segoeui.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
    '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
];
const FONT_CACHE_RELATIVE = 'uploads/tiktok_font.ttf';
let fontCache;

function pickDrawtextFont() {
    if (fontCache !== undefined) return fontCache;
    fontCache = null;
    try {
        const cacheAbs = path.join(process.cwd(), 'uploads', 'tiktok_font.ttf');
        const source = FONT_CANDIDATES.find(f => { try { return fs.existsSync(f); } catch (e) { return false; } });
        if (source) {
            const needsCopy = !fs.existsSync(cacheAbs) || fs.statSync(cacheAbs).mtimeMs !== fs.statSync(source).mtimeMs;
            if (needsCopy) {
                fs.mkdirSync(path.dirname(cacheAbs), { recursive: true });
                fs.copyFileSync(source, cacheAbs);
            }
            fontCache = FONT_CACHE_RELATIVE; // relative path: no ":" and no spaces
        }
    } catch (e) {
        console.warn('[TIKTOK PIPELINE] Não foi possível preparar a fonte local:', e.message);
        fontCache = null;
    }
    if (!fontCache) console.warn('[TIKTOK PIPELINE] Nenhuma fonte encontrada. Overlays de texto serão ignorados.');
    return fontCache;
}

/**
 * Extracts a clean headline from a caption:
 * drops hashtags-only lines and strips every character that is special inside
 * an ffmpeg filter chain (",:[];%='\ etc), which would break the command.
 */
function buildOverlayTitle(caption) {
    if (!caption || typeof caption !== 'string') return '';
    const line = caption
        .split('\n')
        .map(l => l.replace(/#[^\s#]+/g, '').trim())
        .find(l => l.length > 0) || '';
    return line
        .replace(/[^\p{L}\p{N} .!?\-+@_]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 48);
}

/**
 * Picks a font size that fits the text inside a 1080px-wide frame.
 * Arial Bold advances ~0.58em per character on average.
 */
function fitFontSize(text, maxSize) {
    const len = Math.max((text || '').length, 1);
    const size = Math.floor(960 / (0.58 * len));
    return Math.max(24, Math.min(maxSize, size));
}

function buildHandleOverlay(username) {
    if (!username) return '';
    const normalized = String(username).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const clean = normalized.replace(/@/g, '').replace(/[^A-Za-z0-9._]/g, '');
    return clean ? `@${clean}` : '';
}

/**
 * Single ffprobe call: dimensions + audio presence (0 = unknown).
 */
async function probeVideo(filePath) {
    const fallback = { width: 0, height: 0, hasAudio: true };
    try {
        const probe = resolveTool('ffprobe');
        if (!probe) return fallback;
        const { stdout } = await execPromise(
            `"${probe}" -v error -show_entries stream=codec_type,width,height -of json "${filePath}"`,
            { timeout: 60000 }
        );
        const data = JSON.parse(stdout);
        const streams = data.streams || [];
        const video = streams.find(s => s.codec_type === 'video') || {};
        return {
            width: video.width || 0,
            height: video.height || 0,
            hasAudio: streams.some(s => s.codec_type === 'audio')
        };
    } catch (e) {
        return fallback;
    }
}

/**
 * Chooses the output size. We prefer 1080x1920, but when the source has to be
 * upscaled too much (a small/4:3 clip) we drop to 720x1280: fewer pixels to
 * encode (≈2x faster), no visible quality loss after social network's own re-encode.
 */
function pickTargetSize(width, height) {
    const fit = (tw, th) => (!width || !height ? 1 : Math.max(tw / width, th / height));
    if (fit(720, 1280) > 1.6) return { w: 540, h: 960 };   // very small source
    if (fit(1080, 1920) > 1.4) return { w: 720, h: 1280 }; // heavy upscale
    return { w: 1080, h: 1920 };
}

function rand(min, max, digits = 3) {
    return (Math.random() * (max - min) + min).toFixed(digits);
}

/**
 * Processes a local video file for Social Media publication (TikTok, Facebook Reels, etc.).
 * @param {string} inputPath - local mp4 path (file is replaced in place on success)
 * @param {object} options - { caption, username, platform }
 * @returns {Promise<{success: boolean, path: string, error?: string}>}
 */
export async function processVideoForSocial(inputPath, options = {}) {
    const platform = (options.platform || 'social').toLowerCase();
    const tag = `[${platform.toUpperCase()} PIPELINE]`;
    const fallback = { success: false, path: inputPath };
    let outputPath = null;

    try {
        if (!inputPath || typeof inputPath !== 'string' || !fs.existsSync(inputPath)) {
            return { ...fallback, error: 'Arquivo local inexistente' };
        }
        if (!/\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(inputPath)) {
            return { ...fallback, error: 'Tipo de arquivo não suportado pelo pipeline de vídeo' };
        }
        if (!(await isFfmpegAvailable())) {
            return { ...fallback, error: 'FFmpeg indisponível' };
        }

        const ext = path.extname(inputPath);
        const prefix = platform === 'facebook' ? '_fb_' : platform === 'tiktok' ? '_tt_' : `_${platform.slice(0, 2)}_`;
        outputPath = inputPath.replace(ext, `${prefix}${Date.now().toString(36)}${ext}`);
        const startedAt = Date.now();

        // --- 1. Source info → output target (keeps the encode fast) ---
        const src = await probeVideo(inputPath);
        const target = pickTargetSize(src.width, src.height);
        const k = target.w / 1080; // overlay scale factor

        // --- 2. Visual params (subtle, randomized per post) ---
        const cropFactor = (1 - parseFloat(rand(0.01, 0.04))).toFixed(4);
        const brightness = rand(-0.01, 0.04);
        const contrast = rand(0.99, 1.05);
        const saturation = rand(0.96, 1.10);
        const crf = Math.floor(Math.random() * 3) + 20; // 20..22 → good quality

        // --- 3. Build the filter chain ---
        const filters = [
            `crop=iw*${cropFactor}:ih*${cropFactor}`,
            `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
            // Fill a real 9:16 frame (center crop) instead of letterboxing with black bars
            `scale=${target.w}:${target.h}:force_original_aspect_ratio=increase`,
            `crop=${target.w}:${target.h}`,
            `setsar=1`
        ];

        const font = pickDrawtextFont();
        const title = buildOverlayTitle(options.caption);
        const handle = buildHandleOverlay(options.username);

        if (font && title) {
            const topY = Math.round((Math.floor(Math.random() * 80) + 190) * k);
            const titleSize = Math.max(18, Math.round(fitFontSize(title, 56) * k));
            filters.push(
                `drawtext=fontfile=${font}:text=${title}:fontsize=${titleSize}:` +
                `fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=${Math.round(18 * k)}:` +
                `x=(w-text_w)/2:y=${topY}:shadowcolor=black@0.4:shadowx=2:shadowy=2`
            );
        }
        if (font && handle) {
            const bottomY = Math.round((Math.floor(Math.random() * 40) + 300) * k);
            const handleSize = Math.max(16, Math.round(fitFontSize(handle, 42) * k));
            filters.push(
                `drawtext=fontfile=${font}:text=${handle}:fontsize=${handleSize}:` +
                `fontcolor=white@0.9:box=1:boxcolor=black@0.35:boxborderw=${Math.round(14 * k)}:` +
                `x=(w-text_w)/2:y=h-text_h-${bottomY}`
            );
        }

        const vf = filters.join(',');

        // --- 4. Encode: preset veryfast keeps 85s clips under ~1min on a loaded box ---
        const maxRate = target.w >= 1080 ? '8M' : '5M';
        const bufSize = target.w >= 1080 ? '12M' : '8M';
        const videoArgs = `-c:v libx264 -preset veryfast -crf ${crf} -maxrate ${maxRate} -bufsize ${bufSize} ` +
            `-profile:v high -level 4.1 -pix_fmt yuv420p -c:a aac -b:a 160k -ar 44100 -ac 2 -movflags +faststart`;

        const ffmpegBin = resolveTool('ffmpeg');
        const command = src.hasAudio
            ? `"${ffmpegBin}" -y -nostats -loglevel error -i "${inputPath}" -vf "${vf}" ${videoArgs} "${outputPath}"`
            : `"${ffmpegBin}" -y -nostats -loglevel error -i "${inputPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -vf "${vf}" -map 0:v -map 1:a ${videoArgs} -shortest "${outputPath}"`;

        console.log(`${tag} ${src.width}x${src.height} → ${target.w}x${target.h} | CRF ${crf} | ${inputPath}`);
        console.log(`${tag} Título overlay: "${title || '(nenhum)'}" | Handle/Logo: "${handle || '(nenhum)'}"`);

        await execPromise(command, { ...EXEC_OPTS, timeout: 8 * 60 * 1000 });

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024) {
            const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
            const outSize = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(1);
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);

            // Fresh mobile capture metadata (platforms favor natively-recorded files)
            await injectMobileMetadata(inputPath);

            console.log(`${tag} ✅ Concluído em ${elapsed}s (${outSize} MB): ${inputPath}`);
            return { success: true, path: inputPath };
        }

        throw new Error('Arquivo de saída ausente ou vazio após processamento');
    } catch (error) {
        console.error(`${tag} ❌ Falha no processamento (publicando arquivo original):`, error.message);
        // Fail-safe cleanup: never leave partial outputs behind
        try {
            if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch (e) {}
        return { ...fallback, error: error.message };
    }
}

/**
 * Backward compatibility: alias for TikTok
 */
export async function processVideoForTikTok(inputPath, options = {}) {
    return await processVideoForSocial(inputPath, { platform: 'tiktok', ...options });
}

/**
 * Convenience alias for Facebook
 */
export async function processVideoForFacebook(inputPath, options = {}) {
    return await processVideoForSocial(inputPath, { platform: 'facebook', ...options });
}

