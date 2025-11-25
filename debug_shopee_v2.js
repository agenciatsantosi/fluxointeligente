
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

// 1. Standard (Current Implementation)
runTest("Standard SHA256", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 credential=${appId}, timestamp=${timestamp}, signature=${sign}` },
        body: payload
    };
});

// 2. HMAC-SHA256 (Common in other Shopee APIs)
runTest("HMAC-SHA256", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password; // Or maybe just appId+timestamp+payload?
    // Let's try standard HMAC with secret as key
    const sign = crypto.createHmac('sha256', password).update(appId + timestamp + payload).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 credential=${appId}, timestamp=${timestamp}, signature=${sign}` },
        body: payload
    };
});

// 3. Quoted Header Values
runTest("Quoted Headers", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 credential="${appId}", timestamp="${timestamp}", signature="${sign}"` },
        body: payload
    };
});

// 4. Payload with variables (Standard GraphQL)
runTest("Payload with Variables", () => {
    const payload = JSON.stringify({ query, variables: {} });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 credential=${appId}, timestamp=${timestamp}, signature=${sign}` },
        body: payload
    };
});

// 5. No Spaces in Header
runTest("No Spaces in Header", () => {
    const payload = JSON.stringify({ query });
    const base = appId + timestamp + payload + password;
    const sign = crypto.createHash('sha256').update(base).digest('hex');
    return {
        headers: { 'Authorization': `SHA256 credential=${appId},timestamp=${timestamp},signature=${sign}` },
        body: payload
    };
});
