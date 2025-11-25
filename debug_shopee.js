import crypto from 'crypto';

// Credenciais fornecidas pelo usuário
const appId = "18322670054";
const password = "C2ACP62MVZOBMZH6ML4RI4THJGJJ6C77";
const url = "https://open-api.affiliate.shopee.com.br/graphql";

const query = `query { shopOfferV2(limit: 1) { nodes { shopName } } }`;

async function testShopee() {
    const timestamp = Math.floor(Date.now() / 1000);

    // CORREÇÃO PRINCIPAL: Criar o payload como string JSON, mas remover quebras de linha
    const payloadObj = {
        query: query
    };

    // Converter para JSON e remover todas as quebras de linha e espaços desnecessários
    let payloadString = JSON.stringify(payloadObj);
    // Remover quebras de linha que podem existir
    payloadString = payloadString.replace(/\n/g, '');

    // A base da assinatura deve ser: appId + timestamp + payload + secret
    const signatureBase = `${appId}${timestamp}${payloadString}${password}`;
    const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

    console.log("--- DEBUG INFO ---");
    console.log("App ID:", appId);
    console.log("Timestamp:", timestamp);
    console.log("Payload:", payloadString);
    console.log("Signature Base:", signatureBase);
    console.log("Signature:", signature);
    console.log("------------------");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // CORREÇÃO: Remover espaços após as vírgulas
                'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`
            },
            // Enviar o payload como string
            body: payloadString
        });

        const data = await response.json();
        console.log("Response Status:", response.status);
        console.log("Response Body:", JSON.stringify(data, null, 2));

        if (!response.ok) {
            console.error("API Error:", data);
        } else {
            console.log("✅ Sucesso!");
        }

    } catch (error) {
        console.error("Error:", error.message);
    }
}

testShopee();