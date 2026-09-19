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

/**
 * Adds a text overlay to the image 
 */
export async function burnTextToImage(inputPath, text) {
    const ext = path.extname(inputPath);
    const outputPath = inputPath.replace(ext, '_with_text' + ext);

    console.log(`[IMAGE PROCESS] Adding text to image: ${inputPath} -> ${outputPath}`);

    try {
        const metadata = await sharp(inputPath).metadata();
        const width = metadata.width || 1080;
        const height = metadata.height || 1920;

        const svgImage = `
            <svg width="${width}" height="${height}">
                <style>
                    .title { fill: white; font-size: 48px; font-family: sans-serif; font-weight: bold; text-anchor: middle; }
                </style>
                <rect x="0" y="${height - 250}" width="${width}" height="100" fill="rgba(0,0,0,0.6)" />
                <text x="50%" y="${height - 180}" class="title">${text}</text>
            </svg>
        `;

        await sharp(inputPath)
            .composite([{
                input: Buffer.from(svgImage),
                top: 0,
                left: 0
            }])
            .toFile(outputPath);

        console.log(`[IMAGE PROCESS] Finished adding text: ${outputPath}`);

        if (fs.existsSync(outputPath)) {
            fs.unlinkSync(inputPath);
            fs.renameSync(outputPath, inputPath);
            return { success: true, path: inputPath };
        } else {
            throw new Error('Processed text image not found');
        }
    } catch (error) {
        console.error('[IMAGE PROCESS] Error adding text:', error.message);
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
}
