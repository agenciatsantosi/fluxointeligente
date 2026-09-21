import { postStoryGraph, initializeGraphAPI } from './services/instagramGraphService.js';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
    console.log('Initializing...');
    await initializeGraphAPI();
    
    // Check if initialization succeeded by checking the DB or just calling the API
    const testUrl = 'https://fluxointeligente-fluxointeligente.ddyzc4.easypanel.host/uploads/stories/story-1773267808633-416979639.jpeg';
    
    console.log('Calling postStoryGraph...');
    const result = await postStoryGraph(testUrl, 'image');
    console.log('Result:', result);
    
    process.exit(0);
}

run().catch(console.error);
