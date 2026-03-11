import * as db from './database.js';
import * as inbox from './inboxService.js';
import * as gemini from './geminiService.js';
import fbService from './facebookService.js';
import igService from './instagramGraphService.js';

/**
 * Webhook Service for Meta (Facebook & Instagram)
 */

export const WEBHOOK_VERIFY_TOKEN = 'meliflow_secret_2026'; // Token for FB verification

/**
 * Handle Webhook Verification (GET request from Meta)
 */
export function verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === WEBHOOK_VERIFY_TOKEN) {
            console.log('[WEBHOOK] Webhook verified successfully!');
            res.status(200).send(challenge);
        } else {
            console.warn('[WEBHOOK] Verification failed: Token mismatch');
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
}

/**
 * Handle Webhook Events (POST request from Meta)
 */
export async function handleWebhookEvent(req, res) {
    const body = req.body;
    console.log('[WEBHOOK] 🛜 Incoming Webhook POST from Meta:');
    console.log(JSON.stringify(body, null, 2));

    if (body.object === 'page' || body.object === 'instagram') {
        // Iterate over entries
        body.entry.forEach(entry => {
            // entry.id is Page/IG ID
            const platform = body.object;

            // Loop over messaging events
            if (entry.messaging) {
                entry.messaging.forEach(async (messagingEvent) => {
                    if (messagingEvent.message && messagingEvent.message.text && !messagingEvent.message.is_echo) {
                        const senderId = messagingEvent.sender.id;
                        const accountId = messagingEvent.recipient.id;
                        const messageText = messagingEvent.message.text;

                        console.log(`[WEBHOOK] Incoming ${platform} message to ${accountId}: "${messageText}"`);

                        try {
                            // 1. Check if AI Agent is active for this account
                            const agent = await db.getAiAgent(accountId, platform);

                            if (agent && agent.is_active && !agent.handoff_active) {
                                // Check for activation keyword
                                if (agent.activation_keyword && agent.activation_keyword.trim() !== '') {
                                    const keyword = agent.activation_keyword.trim().toLowerCase();
                                    const targetText = messageText.toLowerCase();
                                    if (!targetText.includes(keyword)) {
                                        console.log(`[AGENTS] Message does not contain keyword "${keyword}". Ignoring.`);
                                        return; // Skip this message
                                    }
                                }

                                console.log(`[AGENTS] AI Agent is active for ${accountId}. Generating response...`);

                                // Generate response using Gemini
                                const history = []; // TODO: Optionally fetch true history, for now we just pass the prompt
                                const response = await gemini.generateAgentResponse(
                                    agent.prompt || 'Você é um assistente prestativo. Seja breve e cordial.',
                                    history,
                                    messageText
                                );

                                if (response.success && response.text) {
                                    console.log(`[AGENTS] Generated response: "${response.text}". Sending...`);

                                    // Send via inbox service (we pass threadId = senderId for FB/IG direct reply)
                                    await inbox.sendMessage(senderId, platform, accountId, response.text);
                                } else {
                                    console.error('[AGENTS] Failed to generate response:', response.error);
                                }
                            } else if (agent && agent.handoff_active) {
                                console.log(`[AGENTS] AI Bot is paused (Handoff) for ${accountId}.`);
                            }
                        } catch (error) {
                            console.error('[WEBHOOK] Error processing AI agent workflow:', error);
                        }
                    }
                });
            } else if (entry.changes) {
                // Handle Facebook (feed) and Instagram (comments) changes/webhooks
                entry.changes.forEach(async (change) => {
                    const platform = body.object;
                    const accountId = entry.id;

                    console.log(`[WEBHOOK] 📝 Change detected on ${platform} account ${accountId}: Field="${change.field}", Verb="${change.value?.verb}"`);

                    if (change.field === 'feed' && change.value && change.value.item === 'comment' && change.value.verb === 'add') {
                        console.log(`[WEBHOOK] 💬 Detected Facebook Comment on Page ${accountId}: "${change.value.message}" from ${change.value.from?.name} (${change.value.from?.id})`);
                        // Facebook Comment
                        await processCommentAutomation(accountId, 'page', change.value.comment_id, change.value.message, change.value.from?.id);
                    } else if (change.field === 'comments' && change.value) {
                        console.log(`[WEBHOOK] 💬 Detected Instagram Comment on Account ${accountId}: "${change.value.text}" from ${change.value.from?.username} (${change.value.from?.id})`);
                        // Instagram Comment
                        await processCommentAutomation(accountId, 'instagram', change.value.id, change.value.text, change.value.from?.id);
                    } else {
                        console.log(`[WEBHOOK] ⚠️ Ignored change field: ${change.field} or unsupported verb: ${change.value?.verb}`);
                        if (platform === 'page' && change.field === 'feed') {
                            console.log(`[WEBHOOK] Feed change details: Item="${change.value?.item}", Message="${change.value?.message}"`);
                        }
                    }
                });
            }
        });

        res.status(200).send('EVENT_RECEIVED');
    } else {
        res.sendStatus(404);
    }
}

async function processCommentAutomation(accountId, platform, commentId, messageText, senderId) {
    if (!messageText) return;

    try {
        const res = await db.query('SELECT * FROM comment_automations WHERE account_id = $1 AND platform = $2 AND is_active = true', [accountId, platform]);
        const automations = res.rows;

        if (!automations || automations.length === 0) return;

        console.log(`[WEBHOOK] Checking ${automations.length} comment automations for ${platform} ${accountId}`);

        for (const auto of automations) {
            const keyword = auto.keyword.trim().toLowerCase();
            const targetText = messageText.toLowerCase();

            console.log(`[WEBHOOK] Comparing: "${targetText}" against keyword: "${keyword}"`);

            if (targetText.includes(keyword)) {
                console.log(`[WEBHOOK] ✅ MATCH! Comment matches automation rule: "${keyword}" (ID: ${auto.id})`);

                // 0. Increment trigger count
                await db.query('UPDATE comment_automations SET trigger_count = trigger_count + 1 WHERE id = $1', [auto.id]);

                // Fetch token
                let token = null;
                if (platform === 'page') {
                    const tokenRes = await db.query('SELECT access_token FROM facebook_pages WHERE id = $1', [accountId]);
                    token = tokenRes.rows[0]?.access_token;
                } else {
                    const tokenRes = await db.query('SELECT access_token FROM instagram_accounts WHERE account_id = $1', [accountId]);
                    token = tokenRes.rows[0]?.access_token;
                }

                if (!token) {
                    console.error(`[WEBHOOK] Token missing for ${platform} ${accountId}`);
                    continue;
                }

                // AI vs Fixed Reply
                let reply_text = auto.reply_text;
                let dm_text = auto.dm_text;

                if (auto.reply_type === 'ai') {
                    const aiReply = await gemini.generateAgentResponse(reply_text, [], messageText);
                    if (aiReply.success) reply_text = aiReply.text;

                    if (auto.send_dm && dm_text) {
                        const aiDm = await gemini.generateAgentResponse(dm_text, [], messageText);
                        if (aiDm.success) dm_text = aiDm.text;
                    }
                }

                // 1. Build final comment reply text
                // For Facebook pages: include DM text in comment reply (Facebook 24h policy blocks Messenger DMs unless user messaged first)
                let finalReplyText = reply_text;
                if (platform === 'page' && auto.send_dm && dm_text) {
                    // Merge DM content into comment reply
                    finalReplyText = reply_text ? `${reply_text}\n\n${dm_text}` : dm_text;
                    console.log(`[WEBHOOK] 📋 DM text merged into comment reply (Facebook 24h policy)`);
                }

                // 2. Reply to comment (with merged DM text for Facebook)
                if (finalReplyText) {
                    if (platform === 'page') {
                        const replyRes = await fbService.replyToComment(commentId, finalReplyText, token);
                        if (replyRes.success) {
                            console.log(`[WEBHOOK] ✅ Comment reply sent!`);
                        } else {
                            console.error(`[WEBHOOK] ❌ Comment reply failed: ${replyRes.error}`);
                        }
                    } else {
                        const igReplyRes = await igService.replyToComment(commentId, reply_text, accountId);
                        console.log(`[WEBHOOK] Instagram comment reply: ${igReplyRes?.success ? '✅' : '❌'}`);
                    }
                }

                // 3. For Instagram: try private DM (Instagram has different rules than Facebook)
                if (platform === 'instagram' && auto.send_dm && dm_text && senderId) {
                    const igDmRes = await igService.sendPrivateReply(commentId, dm_text, accountId);
                    if (igDmRes.success) {
                        console.log(`[WEBHOOK] ✅ Instagram private reply sent for comment ${commentId}`);
                    } else {
                        console.warn(`[WEBHOOK] Instagram private_reply failed: ${igDmRes.error}. Trying inbox fallback...`);
                        await inbox.sendMessage(senderId, platform, accountId, dm_text);
                        console.log(`[WEBHOOK] ✅ Instagram inbox DM sent to ${senderId}`);
                    }
                }

                // Stop after the first matching rule triggers
                break;
            }
        }
    } catch (error) {
        console.error('[WEBHOOK] Process comment automation error:', error);
    }
}
