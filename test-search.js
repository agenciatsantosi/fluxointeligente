import fs from 'fs';
import axios from 'axios';

async function search() {
    try {
        const response = await axios.get('https://www.instagram.com/p/DYfh320lRQM/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
        });
        const html = response.data;
        
        const indices = [];
        let pos = html.indexOf('img_index');
        while (pos !== -1) {
            indices.push(pos);
            pos = html.indexOf('img_index', pos + 1);
        }
        
        console.log(`Found ${indices.length} occurrences of img_index`);
        
        if (indices.length > 0) {
            indices.slice(0, 3).forEach(index => {
                console.log(html.substring(Math.max(0, index - 50), index + 100));
                console.log('---');
            });
        }
    } catch(e) {
        console.log(e.message);
    }
}

search();
