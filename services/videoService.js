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
    const command = `ffmpeg -y -i "${inputPath}" -c copy -map_metadata -1 ${metadataArgs} -movflags use_metadata_tags+faststart "${outputPath}"`;

    try {
        await execPromise(command);

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
