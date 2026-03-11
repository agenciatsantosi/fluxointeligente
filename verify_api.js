
import axios from 'axios';

async function testApi() {
    try {
        console.log('Testing /api/telegram/accounts...');
        // We don't have a valid token here easily, but let's see what it returns without one
        const response = await axios.get('http://localhost:3001/api/telegram/accounts');
        console.log('Response:', response.data);
    } catch (error) {
        console.log('Error (Expected 401 if unauth):', error.response?.status, error.response?.data);
    }
}

testApi();
