import { getSystemConfig } from './services/database.js';

async function checkConfig() {
    try {
        const appId = await getSystemConfig('META_APP_ID');
        const appSecret = await getSystemConfig('META_APP_SECRET');
        const publicUrl = await getSystemConfig('system_public_url');
        
        console.log('--- SYSTEM CONFIG ---');
        console.log('META_APP_ID:', appId ? 'SET (' + appId.substring(0, 4) + '...)' : 'NOT SET');
        console.log('META_APP_SECRET:', appSecret ? 'SET (***)' : 'NOT SET');
        console.log('system_public_url:', publicUrl);
        
        process.exit(0);
    } catch (err) {
        console.error('Error checking config:', err);
        process.exit(1);
    }
}

checkConfig();
