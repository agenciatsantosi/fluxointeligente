
import axios from 'axios';

const BASE_URL = 'http://localhost:3001';
const ADMIN_TOKEN = 'PASTE_YOUR_ADMIN_TOKEN_HERE'; // Need a token to test protected routes

async function testEndpoints() {
    const endpoints = [
        '/api/admin/system-stats',
        '/api/admin/api-health',
        '/api/admin/subscription-stats',
        '/api/whatsapp/groups'
    ];

    console.log('--- Diagnostic Test ---');
    for (const endpoint of endpoints) {
        try {
            console.log(`Testing ${endpoint}...`);
            const response = await axios.get(`${BASE_URL}${endpoint}`, {
                headers: {
                    'Authorization': `Bearer ${ADMIN_TOKEN}`
                },
                params: {
                    accountId: '1' // for whatsapp/groups
                }
            });
            console.log(`✅ ${endpoint}: ${response.status} ${JSON.stringify(response.data).substring(0, 50)}...`);
        } catch (error) {
            console.error(`❌ ${endpoint}: ${error.response?.status || error.message}`);
            if (error.response?.data) {
                console.error('   Error data:', error.response.data);
            }
        }
    }
}

// Note: This script requires the server to be running and a valid token.
// Since I cannot easily get a token without user interaction or DB access, 
// I will rely on code analysis and simple syntax check for now, 
// OR I can try to bypass auth if I had a test mode.
// For now, I'll just check if the server starts without syntax errors.
console.log('Diagnostic script created. Run with: node verify_api_fix.js');
