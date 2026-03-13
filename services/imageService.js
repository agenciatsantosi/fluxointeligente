import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

/**
 * Ensures an image is compatible with Instagram:
 * - Supports 9:16, 1:1, 4:5, 16:9
 * - Professional padding/background if original doesn't match
 */
export async function processImageForInstagram(inputPath, aspectRatio = '9:16') {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, '_processed' + ext);

    const resolutions = {
        '9:16': { w: 1080, h: 1920 },
        '1:1': { w: 1080, h: 1080 },
        '4:5': { w: 1080, h: 1350 },
        '16:9': { w: 1920, h: 1080 }
    };

    const target = resolutions[aspectRatio] || resolutions['9:16'];

    console.log(`[IMAGE RE-SIZE] Processing (${aspectRatio}): ${inputPath} -> ${outputPath}`);

    try {
        await sharp(inputPath)
            .resize({
                width: target.w,
                height: target.h,
                fit: 'contain',
                background: { r: 0, g: 0, b: 0, alpha: 1 } 
            })
            .toFile(outputPath);

        console.log(`[IMAGE RE-SIZE] Finished processing: ${outputPath}`);

        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
            return { success: true, path: inputPath };
        } else {
            throw new Error('Processed image file not found');
        }
    } catch (error) {
        console.error('[IMAGE RE-SIZE] Error:', error.message);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
}
