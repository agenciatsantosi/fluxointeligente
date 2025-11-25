
import crypto from 'crypto';

const appId = "18322670054";
const password = "C2ACP62MVZOBMZH6ML4RI4THJGJJ6C77";
const url = "https://open-api.affiliate.shopee.com.br/graphql";

async function fetchData() {
    const timestamp = Math.floor(Date.now() / 1000);
    const startDate = timestamp - (30 * 24 * 60 * 60); // Last 30 days

    const query = `
    query {
      conversionReport(purchaseTimeStart: ${startDate}, purchaseTimeEnd: ${timestamp}, limit: 20) {
        nodes {
          purchaseTime
          totalCommission
          conversionStatus
          buyerType
          device
          orders {
            orderId
            orderStatus
            items {
              itemId
              itemName
              itemPrice
              actualAmount
              itemCommission
              imageUrl
            }
          }
        }
      }
    }
    `;

    const payloadObj = { query };
    const payloadString = JSON.stringify(payloadObj).replace(/\n/g, '');

    const signatureBase = appId + timestamp + payloadString + password;
    const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

    console.log("Fetching Conversion Report with CORRECT Schema...");

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature}`
            },
            body: payloadString
        });

        const data = await response.json();
        if (data.errors) {
            console.error("Errors:", JSON.stringify(data.errors, null, 2));
        } else {
            console.log("Data:", JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

fetchData();
