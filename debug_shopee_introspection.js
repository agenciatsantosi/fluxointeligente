
import crypto from 'crypto';

const appId = "18322670054";
const password = "C2ACP62MVZOBMZH6ML4RI4THJGJJ6C77";
const url = "https://open-api.affiliate.shopee.com.br/graphql";

async function introspect() {
  const timestamp = Math.floor(Date.now() / 1000);

  // Introspect arguments of conversionReport
  const query = `
    query {
      __schema {
        queryType {
          fields {
            name
            args {
              name
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

  console.log("Introspecting Schema...");

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
      const queryType = data.data.__schema.queryType;
      const conversionReportField = queryType.fields.find(f => f.name === 'conversionReport');

      if (conversionReportField) {
        const argNames = conversionReportField.args.map(a => a.name);
        console.log("Arguments of conversionReport:", JSON.stringify(argNames, null, 2));
      } else {
        console.log("conversionReport field not found in Query type.");
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

introspect();
