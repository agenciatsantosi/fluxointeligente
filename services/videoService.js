import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';

const execPromise = promisify(exec);

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
        // Build FFMPEG command:
        // -vf "scale=W:H:force_original_aspect_ratio=decrease,pad=W:H:(ow-iw)/2:(oh-ih)/2" 
        //   -> Resizes to target resolution with black bars if needed.
        const vfScale = `scale=${target.w}:${target.h}:force_original_aspect_ratio=decrease,pad=${target.w}:${target.h}:(ow-iw)/2:(oh-ih)/2`;
        
        const command = `ffmpeg -y -i "${inputPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -profile:v main -level 4.1 -pix_fmt yuv420p -b:v 4M -maxrate 5M -bufsize 10M -vf "${vfScale}" -c:a aac -b:a 128k -shortest -movflags +faststart -t 90 "${outputPath}"`;

        const { stdout, stderr } = await execPromise(command);
        
        console.log(`[VIDEO PROCESS] Finished processing: ${outputPath}`);
        
        // Verify output exists
        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
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
