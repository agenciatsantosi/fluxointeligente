const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const testFile = path.join(__dirname, 'test.txt');
fs.writeFileSync(testFile, 'hello world ' + Date.now());

async function testUpload(url, formAppender) {
    try {
        const form = new FormData();
        formAppender(form);
        const res = await axios.post(url, form, { headers: form.getHeaders(), timeout: 10000 });
        console.log(`[SUCCESS] ${url} ->`, res.status, typeof res.data === 'object' ? JSON.stringify(res.data).substring(0, 100) : res.data.substring(0, 100));
    } catch (err) {
        console.log(`[FAIL] ${url} ->`, err.message);
    }
}

async function run() {
    await testUpload('https://0x0.st', form => form.append('file', fs.createReadStream(testFile)));
    await testUpload('https://uguu.se/upload.php', form => form.append('files[]', fs.createReadStream(testFile)));
    await testUpload('https://pomf.lain.la/upload.php', form => form.append('files[]', fs.createReadStream(testFile)));
    await testUpload('https://envs.sh', form => form.append('file', fs.createReadStream(testFile)));
    await testUpload('https://file.io', form => form.append('file', fs.createReadStream(testFile)));
    // Try bashupload
    // Try filebin
}
run();
