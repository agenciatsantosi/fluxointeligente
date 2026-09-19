
import crypto from 'crypto';

const appId = "18322670054";
const password = "C2ACP62MVZOBMZH6ML4RI4THJGJJ6C77";
const url = "https://open-api.affiliate.shopee.com.br/graphql";

const query = `query { shopOfferV2(limit: 1) { nodes { shopName } } }`;

async function runTest(name, generatorFn) {
    console.log(`\n--- TEST: ${name} ---`);
    try {
        const { headers, body } = generatorFn();

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: body
        });

        const data = await response.json();
        console.log(`Status: ${response.status}`);
        if (data.errors) {
            console.log(`Error: ${data.errors[0].message}`);
        } else {
            console.log("SUCCESS! Data:", JSON.stringify(data).substring(0, 100) + "...");
        }
    } catch (e) {
        console.log("Exception:", e.message);
    }
}

const timestamp = Math.floor(Date.now() / 1000);

// 6. Capitalized Keys (Credential, Timestamp, Signature)
runTest("Capitalized Keys", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${sign}` },
        body: payload
    };
});

// 7. Capitalized Keys No Space
runTest("Capitalized Keys No Space", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${sign}` },
        body: payload
    };
});

// 8. Lowercase keys but with quotes (Just in case)
runTest("Lowercase Quoted", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 credential="${appId}", timestamp="${timestamp}", signature="${sign}"` },
        body: payload
    };
});
