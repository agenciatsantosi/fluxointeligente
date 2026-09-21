
import crypto from 'crypto';

const appId = "18322670054";
const password = "C2ACP62MVZOBMZH6ML4RI4THJGJJ6C77";
const url = "https://open-api.affiliate.shopee.com.br/graphql";

async function checkCapabilities() {
    const timestamp = Math.floor(Date.now() / 1000);

    // 1. Test Link Generation (Mutation)
    const linkQuery = `
    mutation {
      generateShortLink(input: { originUrl: "https://shopee.com.br/product/29072359302/29072359302", subIds: ["test"] }) {
        shortLink
      }
    }
    `;

    // 2. Introspect generateShortLink Input
    const introspectionQuery = `
    query {
      __schema {
        mutationType {
          fields {
            name
            args {
              name
              type {
                name
                kind
                ofType {
                  name
                  kind
                  inputFields {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
    `;

    console.log("--- Testing Link Generation ---");
    await runRequest(linkQuery, timestamp, "Link Gen");

    console.log("\n--- Introspecting generateShortLink Input ---");
    await runRequest(introspectionQuery, timestamp, "Introspection");
}

async function runRequest(query, timestamp, label) {
    const payloadObj = { query };
    const payloadString = JSON.stringify(payloadObj).replace(/\n/g, '');

    const signatureBase = appId + timestamp + payloadString + password;
    const signature = crypto.createHash('sha256').update(signatureBase).digest('hex');

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
            console.error(`${label} Errors:`, JSON.stringify(data.errors, null, 2));
        } else {
            if (label === "Introspection") {
                const fields = data.data.__schema.mutationType.fields;
                const linkField = fields.find(f => f.name === 'generateShortLink');
                if (linkField) {
                    console.log("generateShortLink Args:", JSON.stringify(linkField.args, null, 2));
                    // Check input fields if it's an object
                    const inputArg = linkField.args.find(a => a.name === 'input');
                    if (inputArg && inputArg.type.ofType && inputArg.type.ofType.inputFields) {
                        console.log("Input Fields:", JSON.stringify(inputArg.type.ofType.inputFields.map(f => f.name), null, 2));
                    }
                }
            } else {
                console.log(`${label} Success:`, JSON.stringify(data, null, 2));
            }
        }
    } catch (error) {
        console.error(`${label} Network Error:`, error);
    }
}

checkCapabilities();
