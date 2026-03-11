import https from 'https';
import fs from 'fs';

async function getImageInfo(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            const chunks = [];
            res.on('data', (chunk) => {
                chunks.push(chunk);
                // Stop after enough data to get JPEG header
                if (Buffer.concat(chunks).length > 2048) {
                    res.destroy();
                }
            });
            res.on('close', () => {
                const buffer = Buffer.concat(chunks);
                // Simple JPEG dimension parser
                let i = 0;
                if (buffer[i] === 0xFF && buffer[i+1] === 0xD8) {
                    i += 2;
                    while (i < buffer.length) {
                        if (buffer[i] === 0xFF && (buffer[i+1] >= 0xC0 && buffer[i+1] <= 0xC3)) {
                            const height = buffer.readUInt16BE(i + 5);
                            const width = buffer.readUInt16BE(i + 7);
                            resolve({ width, height, format: 'JPEG' });
                            return;
                        }
                        const length = buffer.readUInt16BE(i + 2);
                        i += length + 2;
                    }
                }
                resolve({ error: 'Not a JPEG or dimensions not found' });
            });
            res.on('error', reject);
        }).on('error', reject);
    });
}

const url = 'https://meliflow-meliflow.ddyzc4.easypanel.host/uploads/stories/story-1773267808633-416979639.jpeg';
getImageInfo(url).then(info => console.log('Image Info:', info)).catch(console.error);
