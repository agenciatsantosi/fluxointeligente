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
export async function processVideoForInstagram(inputPath) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, '_processed.mp4');
    
    console.log(`[VIDEO PROCESS] Processing: ${inputPath} -> ${outputPath}`);

    try {
        // Build FFMPEG command:
        // -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" 
        //   -> Resizes to 1080x1920 with black bars if needed.
        // -c:v libx264 -> Force H.264
        // -profile:v baseline -level 3.0 -> Maximum compatibility
        // -pix_fmt yuv420p -> Standard pixel format
        // -c:a aac -ar 44100 -> Standard AAC audio
        // -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -> Source for silent audio if input has none
        // -shortest -> Ensures output is as long as the video (not the infinite silence)
        
        // We use a complex filter to ensure an audio stream exists even if the original is silent
        const command = `ffmpeg -y -i "${inputPath}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -c:v libx264 -profile:v baseline -level 3.0 -pix_fmt yuv420p -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2" -c:a aac -shortest -t 60 "${outputPath}"`;

        const { stdout, stderr } = await execPromise(command);
        
        console.log(`[VIDEO PROCESS] Finished processing: ${outputPath}`);
        
        // Verify output exists
        if (fs.existsSync(outputPath)) {
            // Replace original with processed if desired, or return new path
            // For safety in this implementation, we'll replace the original
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
