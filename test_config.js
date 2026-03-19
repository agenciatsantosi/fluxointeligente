// Verify that the new config routes work
import { getSystemSettings, saveSystemConfig } from './services/database.js';

async function testConfigRoutes() {
    console.log('--- Testing Config Routes ---');
    
    // 1. Write a test value
    await saveSystemConfig('TEST_KEY', 'hello_world');
    console.log('✅ saveSystemConfig: OK');
    
    // 2. Read all settings
    const settings = await getSystemSettings();
    console.log('✅ getSystemSettings:', JSON.stringify(settings));
    
    if (settings.TEST_KEY === 'hello_world') {
        console.log('✅ Read/write round trip: PASS');
    } else {
        console.error('❌ Read/write round trip: FAIL');
    }
    
    process.exit(0);
}

testConfigRoutes().catch(e => {
    console.error('Error:', e.message);
    process.exit(1);
});
