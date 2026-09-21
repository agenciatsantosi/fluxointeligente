import axios from 'axios';
import * as cheerio from 'cheerio';

const url = process.argv[2];

if (!url) {
    console.error('Por favor, forneça uma URL da Shopee como argumento.');
    process.exit(1);
}

async function testExtraction() {
    console.log(`Testing extraction for: ${url}`);
    try {
        const response = await axios.get(url, {
            timeout: 10000, // 10 seconds timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': 'none',
                'Sec-Fetch-User': '?1',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        console.log(`Status: ${response.status}`);
        const html = response.data;

        // 1. Check for video tag
        const $ = cheerio.load(html);
        const videoTags = $('video');
        console.log(`Found ${videoTags.length} video tags.`);
        videoTags.each((i, el) => {
            console.log(`Video ${i}:`, $(el).attr('src'));
        });

        // 2. Check for JSON data
        // Shopee often stores data in a script tag with a specific ID or variable
        // Common patterns: window.__PRELOADED_STATE__, or specific JSON-LD

        const scripts = $('script');
        let foundVideoInJson = false;

        scripts.each((i, el) => {
            const content = $(el).html();
            if (content && (content.includes('video') || content.includes('.mp4'))) {
                // console.log(`Possible video data in script ${i}`);
                // Try to extract URL with regex
                const videoUrlMatch = content.match(/https?:\/\/[^"']+\.mp4/g);
                if (videoUrlMatch) {
                    console.log('Found video URLs in script:', videoUrlMatch);
                    foundVideoInJson = true;
                }
            }
        });

        if (!foundVideoInJson) {
            console.log('No video URLs found in scripts via simple regex.');
        }

    } catch (error) {
        console.error('Error fetching URL:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
        }
    }
}

testExtraction();
