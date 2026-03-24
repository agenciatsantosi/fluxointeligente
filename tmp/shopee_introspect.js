
import crypto from 'crypto';

const appId = "18322670054";
const password = "C2ACP62MVZOBMZH6ML4RI4THJGJJ6C77";
const url = "https://open-api.affiliate.shopee.com.br/graphql";

async function introspect() {
  const timestamp = Math.floor(Date.now() / 1000);

  const query = `
    query {
      __type(name: "Query") {
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
              }
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

  console.log("Introspecting Query fields...");

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
      const productOfferField = data.data.__type.fields.find(f => f.name === 'productOfferV2');
      if (productOfferField) {
        console.log("Arguments of productOfferV2:", JSON.stringify(productOfferField.args, null, 2));
        
        // Let's find the type of the 'nodes' field
        const query = `
          query {
            __type(name: "ProductOfferV2") {
              fields {
                name
                type {
                  name
                  kind
                  ofType {
                    name
                    kind
                    ofType {
                      name
                      kind
                    }
                  }
                }
              }
            }
          }
        `;
        const payloadObj2 = { query };
        const payloadString2 = JSON.stringify(payloadObj2).replace(/\n/g, '');
        const signatureBase2 = appId + timestamp + payloadString2 + password;
        const signature2 = crypto.createHash('sha256').update(signatureBase2).digest('hex');

        const resp2 = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature2}`
          },
          body: payloadString2
        });
        const data2 = await resp2.json();
        const nodesField = data2.data.__type.fields.find(f => f.name === 'nodes');
        const nodeTypeName = nodesField.type.ofType.ofType.name;
        console.log("Node Type Name:", nodeTypeName);

        // Now introspect the Product type fields
        const query3 = `
          query {
            __type(name: "${nodeTypeName}") {
              fields {
                name
              }
            }
          }
        `;
        const payloadObj3 = { query: query3 };
        const payloadString3 = JSON.stringify(payloadObj3).replace(/\n/g, '');
        const signatureBase3 = appId + timestamp + payloadString3 + password;
        const signature3 = crypto.createHash('sha256').update(signatureBase3).digest('hex');
        const resp3 = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `SHA256 Credential=${appId},Timestamp=${timestamp},Signature=${signature3}`
          },
          body: payloadString3
        });
        const data3 = await resp3.json();
        console.log("Fields of " + nodeTypeName + ":", JSON.stringify(data3.data.__type.fields.map(f => f.name), null, 2));
      } else {
        console.log("productOfferV2 not found.");
      }
    }
  } catch (error) {
    console.error("Error:", error);
  }
}

introspect();
