// api.js
import * as Constants from './constants.js';
import { sharedState, setMenuVisible } from './state.js'; // 导入 sharedState

/**
 * Fetches chat and global quick replies from the quickReplyApi.
 * Checks if the main Quick Reply v2 extension is enabled before fetching.
 * Also includes JS Runner buttons data collected by MutationObserver.
 * @returns {{ chat: Array<object>, global: Array<object> }}
 */
export function fetchQuickReplies() { // This function is no longer async
    console.log(`[${Constants.EXTENSION_NAME} Debug] fetchQuickReplies called.`);
    let chatReplies = [];
    const globalReplies = [];
    const chatQrLabels = new Set(); // To track labels and avoid duplicates in chat section

    // --- 检查 Quick Reply API ---
    if (!window.quickReplyApi) {
        console.error(`[${Constants.EXTENSION_NAME}] Quick Reply API (window.quickReplyApi) not found! Cannot fetch standard replies.`);
        // 即使 API 不存在，仍然尝试从共享状态获取 JS Runner 按钮
    } else {
        // --- 获取标准 Quick Reply (仅当 API 存在且启用时) ---
        const qrApi = window.quickReplyApi;
        if (!qrApi.settings || qrApi.settings.isEnabled === false) {
            console.log(`[${Constants.EXTENSION_NAME}] Core Quick Reply v2 is disabled. Skipping standard reply fetch.`);
        } else {
            console.log(`[${Constants.EXTENSION_NAME}] Fetching standard Quick Replies...`);
            try {
                // Fetch Chat Quick Replies (Accessing internal settings)
                if (qrApi.settings?.chatConfig?.setList) {
                    qrApi.settings.chatConfig.setList.forEach(setLink => {
                        if (setLink?.isVisible && setLink.set?.qrList) {
                            setLink.set.qrList.forEach(qr => {
                                if (qr && !qr.isHidden && qr.label) {
                                    chatReplies.push({
                                        setName: setLink.set.name || 'Unknown Set',
                                        label: qr.label,
                                        message: qr.message || '(无消息内容)',
                                        isStandard: true
                                    });
                                    chatQrLabels.add(qr.label);
                                }
                            });
                        }
                    });
                } else {
                     console.warn(`[${Constants.EXTENSION_NAME}] Could not find chatConfig.setList in quickReplyApi settings.`);
                }

                // Fetch Global Quick Replies (Accessing internal settings)
                if (qrApi.settings?.config?.setList) {
                    qrApi.settings.config.setList.forEach(setLink => {
                        if (setLink?.isVisible && setLink.set?.qrList) {
                            setLink.set.qrList.forEach(qr => {
                                // Only add to global if not hidden and label doesn't exist in chat replies
                                if (qr && !qr.isHidden && qr.label && !chatQrLabels.has(qr.label)) {
                                    globalReplies.push({
                                        setName: setLink.set.name || 'Unknown Set',
                                        label: qr.label,
                                        message: qr.message || '(无消息内容)',
                                        isStandard: true
                                    });
                                }
                            });
                        }
                    });
                } else {
                     console.warn(`[${Constants.EXTENSION_NAME}] Could not find config.setList in quickReplyApi settings.`);
                }
                console.log(`[${Constants.EXTENSION_NAME}] Fetched Standard Replies - Chat: ${chatReplies.length}, Global: ${globalReplies.length}`);

            } catch (error) {
                console.error(`[${Constants.EXTENSION_NAME}] Error fetching standard quick replies:`, error);
            }
        }
    }

    // ***************************************************************
    // --- 修改：从共享状态获取 JS Runner 按钮数据 ---
    // ***************************************************************
    console.log(`[${Constants.EXTENSION_NAME} Debug] Including JS Runner buttons from shared state...`);
    const initialJsCount = chatReplies.length;
    // 遍历共享状态中存储的 JS Runner 按钮数据
    sharedState.jsRunnerButtonsData.forEach(jsButton => {
        // 再次检查标签是否已存在，防止与标准QR或之前添加的JS按钮重复
        if (jsButton.label && !chatQrLabels.has(jsButton.label)) {
             console.log(`[${Constants.EXTENSION_NAME} Debug] Adding JS Runner button from state: Label='${jsButton.label}'`);
             chatReplies.push(jsButton);
             chatQrLabels.add(jsButton.label); // Add to set to prevent duplicates in global
        } else if (jsButton.label) {
            console.log(`[${Constants.EXTENSION_NAME} Debug] Skipping JS Runner button from state due to duplicate label: Label='${jsButton.label}'`);
        }
    });
     console.log(`[${Constants.EXTENSION_NAME} Debug] Added ${chatReplies.length - initialJsCount} JS Runner buttons from state.`);
    // --- JS Runner 数据获取结束 ---

    console.log(`[${Constants.EXTENSION_NAME} Debug] Final fetch results - Chat (incl. JS): ${chatReplies.length}, Global: ${globalReplies.length}`);
    return { chat: chatReplies, global: globalReplies };
}


/**
 * Triggers a specific standard quick reply using the API.
 * (此函数只处理 isStandard: true 的情况，由 event handler 决定调用)
 * @param {string} setName
 * @param {string} label
 */
export async function triggerQuickReply(setName, label) {
    if (!window.quickReplyApi) {
        console.error(`[${Constants.EXTENSION_NAME}] Quick Reply API not found! Cannot trigger standard reply.`);
        // setMenuVisible(false); // 让调用者处理 UI 状态
        return; // Indicate failure or inability to proceed
    }

    // --- 新增检查 ---
    // 触发前也检查主 Quick Reply v2 是否启用
    if (!window.quickReplyApi.settings || window.quickReplyApi.settings.isEnabled === false) {
         console.log(`[${Constants.EXTENSION_NAME}] Core Quick Reply v2 is disabled. Cannot trigger standard reply.`);
         // setMenuVisible(false); // 让调用者处理 UI 状态
         return;
    }
    // --- 检查结束 ---

    console.log(`[${Constants.EXTENSION_NAME}] Triggering Standard Quick Reply: "${setName}.${label}"`);
    try {
        // 假设 qrApi.executeQuickReply 是正确的 API 调用方法
        // 注意：根据 QuickReplyApi.js.txt，实际方法是 executeQuickReply
        await window.quickReplyApi.executeQuickReply(setName, label);
        console.log(`[${Constants.EXTENSION_NAME}] Standard Quick Reply "${setName}.${label}" executed successfully.`);
    } catch (error) {
        console.error(`[${Constants.EXTENSION_NAME}] Failed to execute Standard Quick Reply "${setName}.${label}":`, error);
        // 让调用者处理 UI 关闭，即使出错
    }
    // 不需要在这里设置 setMenuVisible(false)
}
