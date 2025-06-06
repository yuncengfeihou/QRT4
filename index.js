// index.js - Main Entry Point
import * as Constants from './constants.js';
import { sharedState } from './state.js';
import { createMenuElement } from './ui.js';
// 从 settings.js 导入核心功能
import { createSettingsHtml, loadAndApplySettings as loadAndApplySettingsToPanel, updateIconDisplay } from './settings.js';
import { setupEventListeners, handleQuickReplyClick, updateMenuStylesUI } from './events.js';
import { fetchQuickReplies } from './api.js'; // 导入 fetchQuickReplies 以便在 MutationObserver 回调中使用其逻辑（虽然 api.js 会修改，但这里需要导入）

// 创建本地设置对象，如果全局对象不存在
if (typeof window.extension_settings === 'undefined') {
    window.extension_settings = {};
}
// 初始化当前扩展的设置，包含新增字段的默认值
if (!window.extension_settings[Constants.EXTENSION_NAME]) {
    window.extension_settings[Constants.EXTENSION_NAME] = {
        enabled: true,
        iconType: Constants.ICON_TYPES.ROCKET,
        customIconUrl: '',
        customIconSize: Constants.DEFAULT_CUSTOM_ICON_SIZE,
        faIconCode: '',
        matchButtonColors: true,
        menuStyles: JSON.parse(JSON.stringify(Constants.DEFAULT_MENU_STYLES)),
        savedCustomIcons: []
    };
}

// 导出设置对象以便其他模块使用
export const extension_settings = window.extension_settings;

/**
 * Injects the rocket button next to the send button
 */
function injectRocketButton() {
    const sendButton = document.getElementById('send_but'); // 使用原生 JS 获取
    if (!sendButton) {
        console.error(`[${Constants.EXTENSION_NAME}] Could not find send button (#send_but)`);
        return null; // Return null if send button isn't found
    }

    // 检查按钮是否已存在
    let rocketButton = document.getElementById(Constants.ID_ROCKET_BUTTON);
    if (rocketButton) {
        console.log(`[${Constants.EXTENSION_NAME}] Rocket button already exists.`);
        return rocketButton;
    }

    // 创建按钮元素
    rocketButton = document.createElement('div');
    rocketButton.id = Constants.ID_ROCKET_BUTTON;
    // 初始类名在 updateIconDisplay 中设置
    // rocketButton.className = 'interactable secondary-button'; // Initial classes set by updateIconDisplay
    rocketButton.title = "快速回复菜单";
    rocketButton.setAttribute('aria-haspopup', 'true');
    rocketButton.setAttribute('aria-expanded', 'false');
    rocketButton.setAttribute('aria-controls', Constants.ID_MENU);

    // Insert the button before the send button
    sendButton.parentNode.insertBefore(rocketButton, sendButton);

    console.log(`[${Constants.EXTENSION_NAME}] Rocket button injected.`);
    return rocketButton; // Return the reference
}

/**
 * 图标预览功能已禁用以改善性能
 * 这是一个空操作，不进行任何DOM操作
 */
function updateIconPreview(iconType) {
    // 不执行任何DOM操作
    return;
}

// --- 新增：设置 MutationObserver 监听 JS Runner 按钮的出现 ---
function setupMutationObserver() {
    // 监听 #send_form 元素，因为它包含 #qr--bar 和 JS Runner 按钮
    const targetNode = document.getElementById('send_form');
    if (!targetNode) {
        console.warn(`[${Constants.EXTENSION_NAME}] Target node #send_form not found for MutationObserver.`);
        // Maybe retry finding the target node later? Or observe body?
        // For now, just warn and return. Observing body might be too broad.
        return;
    }

    const observerConfig = { childList: true, subtree: true }; // 监听子节点的添加/移除以及更深层级的变化

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    // 检查添加的节点自身或其子节点是否是 JS Runner 按钮容器
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const $node = $(node);
                        let $jsRunnerContainers = $node.is('.qr--buttons.th-button') ? $node : $node.find('.qr--buttons.th-button');

                        if ($jsRunnerContainers.length > 0) {
                            console.log(`[${Constants.EXTENSION_NAME}] MutationObserver detected JS Runner button container(s).`);
                            $jsRunnerContainers.each(function() {
                                const $container = $(this);
                                // 查找容器内的实际按钮元素
                                const $jsRunnerButtons = $container.find('.qr--button.menu_button.interactable');

                                $jsRunnerButtons.each(function() {
                                    const $buttonDiv = $(this);
                                    const label = $buttonDiv.text()?.trim();
                                    // 检查标签是否有效，并且尚未被添加
                                    if (label && label !== '' && !sharedState.jsRunnerLabels.has(label)) {
                                        console.log(`[${Constants.EXTENSION_NAME} Debug] Observer adding JS Runner button: Label='${label}'`);
                                        sharedState.jsRunnerButtonsData.push({
                                            setName: 'JS脚本按钮',         // 自定义分类名
                                            label: label,                 // 按钮显示的文字
                                            message: `[JS Runner] ${label}`, // 内部标识符或提示文本
                                            isStandard: false             // 核心标记：表明不是标准QR
                                        });
                                        sharedState.jsRunnerLabels.add(label); // 记录已添加的JS按钮标签
                                    } else if (label && sharedState.jsRunnerLabels.has(label)) {
                                         console.log(`[${Constants.EXTENSION_NAME} Debug] Observer skipping duplicate JS Runner button: Label='${label}'`);
                                    } else if (!label || label === '') {
                                         console.log(`[${Constants.EXTENSION_NAME} Debug] Observer skipping JS Runner button with empty label.`);
                                    }
                                });
                            });
                             console.log(`[${Constants.EXTENSION_NAME}] Observer finished processing added nodes. Current JS Runner buttons count in state: ${sharedState.jsRunnerButtonsData.length}`);
                        }
                    }
                });
            }
            // Note: We are only observing additions, not removals.
            // If JS Runner buttons can be removed and re-added, we might need to handle removals too.
            // For now, assume they are added once and stay until chat change or page reload.
        });
    });

    // 开始观察目标节点
    observer.observe(targetNode, observerConfig);
    console.log(`[${Constants.EXTENSION_NAME}] MutationObserver setup on #send_form.`);

    // Optional: Initial scan in case buttons are already there before observer setup completes
    // This might be redundant if setup is fast, but adds robustness.
    // We can call the same logic as in the observer callback for existing elements.
    $(targetNode).find('.qr--buttons.th-button').each(function() {
         const $container = $(this);
         $container.find('.qr--button.menu_button.interactable').each(function() {
             const $buttonDiv = $(this);
             const label = $buttonDiv.text()?.trim();
              if (label && label !== '' && !sharedState.jsRunnerLabels.has(label)) {
                 console.log(`[${Constants.EXTENSION_NAME} Debug] Initial scan adding JS Runner button: Label='${label}'`);
                 sharedState.jsRunnerButtonsData.push({
                     setName: 'JS脚本按钮',
                     label: label,
                     message: `[JS Runner] ${label}`,
                     isStandard: false
                 });
                 sharedState.jsRunnerLabels.add(label);
             } else if (label && sharedState.jsRunnerLabels.has(label)) {
                  console.log(`[${Constants.EXTENSION_NAME} Debug] Initial scan skipping duplicate JS Runner button: Label='${label}'`);
             } else if (!label || label === '') {
                  console.log(`[${Constants.EXTENSION_NAME} Debug] Initial scan skipping JS Runner button with empty label.`);
             }
         });
    });
     console.log(`[${Constants.EXTENSION_NAME}] Initial JS Runner button scan complete. Count in state: ${sharedState.jsRunnerButtonsData.length}`);


    // Consider adding a way to disconnect the observer on plugin cleanup if needed
    // For now, it can live for the lifetime of the page.
}
// --- MutationObserver 设置结束 ---


/**
 * Initializes the plugin: creates UI, sets up listeners, loads settings.
 */
function initializePlugin() {
    try {
        console.log(`[${Constants.EXTENSION_NAME}] Initializing...`);

        // Create and inject the rocket button
        const rocketButton = injectRocketButton();
        if (!rocketButton) {
             console.error(`[${Constants.EXTENSION_NAME}] Initialization failed: Rocket button could not be injected.`);
             return; // Stop initialization if button injection fails
        }

        // Create menu element
        const menu = createMenuElement();

        // Store references in shared state
        sharedState.domElements.rocketButton = rocketButton;
        sharedState.domElements.menu = menu;
        sharedState.domElements.chatItemsContainer = menu.querySelector(`#${Constants.ID_CHAT_ITEMS}`);
        sharedState.domElements.globalItemsContainer = menu.querySelector(`#${Constants.ID_GLOBAL_ITEMS}`);
        // 获取设置面板中的元素引用 (在 settings.js 中加载后才能获取)
        // 这些将在 loadAndApplySettings 或 setupEventListeners 中获取并使用
        // sharedState.domElements.settingsDropdown = document.getElementById(Constants.ID_SETTINGS_ENABLED_DROPDOWN);
        // sharedState.domElements.iconTypeDropdown = document.getElementById(Constants.ID_ICON_TYPE_DROPDOWN);
        // ... 其他设置元素 ...
         sharedState.domElements.customIconUrl = document.getElementById(Constants.ID_CUSTOM_ICON_URL);
         sharedState.domElements.customIconSizeInput = document.getElementById(Constants.ID_CUSTOM_ICON_SIZE_INPUT);
         sharedState.domElements.faIconCodeInput = document.getElementById(Constants.ID_FA_ICON_CODE_INPUT);
         sharedState.domElements.colorMatchCheckbox = document.getElementById(Constants.ID_COLOR_MATCH_CHECKBOX);


        // 创建全局对象暴露事件处理函数和保存函数
        window.quickReplyMenu = {
            handleQuickReplyClick,
            saveSettings: function() {
                console.log(`[${Constants.EXTENSION_NAME}] Attempting to save settings via window.quickReplyMenu.saveSettings...`);
                // 从DOM元素获取最新值
                const settings = extension_settings[Constants.EXTENSION_NAME];
                const enabledDropdown = document.getElementById(Constants.ID_SETTINGS_ENABLED_DROPDOWN);
                const iconTypeDropdown = document.getElementById(Constants.ID_ICON_TYPE_DROPDOWN);
                const customIconUrl = document.getElementById(Constants.ID_CUSTOM_ICON_URL);
                const customIconSizeInput = document.getElementById(Constants.ID_CUSTOM_ICON_SIZE_INPUT);
                const faIconCodeInput = document.getElementById(Constants.ID_FA_ICON_CODE_INPUT);
                const colorMatchCheckbox = document.getElementById(Constants.ID_COLOR_MATCH_CHECKBOX);

                if (enabledDropdown) settings.enabled = enabledDropdown.value === 'true';
                if (iconTypeDropdown) settings.iconType = iconTypeDropdown.value;
                 // Check customIconUrl for dataset.fullValue before saving
                 if (customIconUrl) {
                     settings.customIconUrl = customIconUrl.dataset.fullValue || customIconUrl.value;
                 }
                if (customIconSizeInput) settings.customIconSize = parseInt(customIconSizeInput.value, 10) || Constants.DEFAULT_CUSTOM_ICON_SIZE;
                if (faIconCodeInput) settings.faIconCode = faIconCodeInput.value;
                if (colorMatchCheckbox) settings.matchButtonColors = colorMatchCheckbox.checked;

                // 更新图标显示以反映最新设置
                updateIconDisplay();

                // 更新图标预览 (可选, 如果设置面板可见)
                if (document.getElementById(Constants.ID_SETTINGS_CONTAINER)?.offsetParent !== null) {
                     updateIconPreview(settings.iconType);
                }

                // 更新菜单样式 (如果样式被修改过)
                if (typeof updateMenuStylesUI === 'function' && settings.menuStyles) {
                    // 检查样式是否真的改变了，避免不必要的更新
                    // let stylesChanged = checkIfStylesChanged(); // (需要实现比较逻辑)
                    // if (stylesChanged) updateMenuStylesUI();
                    updateMenuStylesUI(); // 简单起见，每次保存都更新
                }

                // 尝试保存到 localStorage 作为备份
                let savedToLocalStorage = false;
                try {
                    localStorage.setItem('QRA_settings', JSON.stringify(settings));
                    savedToLocalStorage = true;
                } catch(e) {
                    console.error(`[${Constants.EXTENSION_NAME}] 保存到localStorage失败:`, e);
                }

                // 尝试使用 context API 保存
                let savedToContext = false;
                if (typeof context !== 'undefined' && context.saveExtensionSettings) {
                    try {
                        context.saveExtensionSettings();
                        console.log(`[${Constants.EXTENSION_NAME}] 设置已通过 context.saveExtensionSettings() 保存`);
                        savedToContext = true;
                    } catch(e) {
                        console.error(`[${Constants.EXTENSION_NAME}] 通过 context.saveExtensionSettings() 保存设置失败:`, e);
                    }
                } else {
                    console.warn(`[${Constants.EXTENSION_NAME}] context.saveExtensionSettings 不可用`);
                }

                const success = savedToContext || savedToLocalStorage; // 至少一种保存成功

                // 显示保存成功的反馈
                const saveStatus = document.getElementById('qr-save-status');
                 if (saveStatus) {
                     if (success) {
                         saveStatus.textContent = '✓ 设置已保存';
                         saveStatus.style.color = '#4caf50';
                     } else {
                         saveStatus.textContent = '✗ 保存失败';
                          saveStatus.style.color = '#f44336';
                     }
                     setTimeout(() => { if(saveStatus.textContent === '样式已应用，请保存设置' || saveStatus.textContent.startsWith('✓') || saveStatus.textContent.startsWith('✗')) saveStatus.textContent = ''; }, 2000);
                 }

                 // 更新保存按钮视觉反馈
                 const saveButton = document.getElementById('qr-save-settings');
                 if (saveButton && success) {
                     const originalText = saveButton.innerHTML; // 保存原始 HTML
                     const originalBg = saveButton.style.backgroundColor;
                     saveButton.innerHTML = '<i class="fa-solid fa-check"></i> 已保存';
                     saveButton.style.backgroundColor = '#4caf50';
                     setTimeout(() => {
                         saveButton.innerHTML = originalText;
                         saveButton.style.backgroundColor = originalBg; // 恢复原背景色或置空让 CSS 控制
                     }, 2000);
                 }

                return success; // 返回保存是否成功
            },
            // 暴露 updateIconPreview 供设置面板使用可能更好
            updateIconPreview: updateIconPreview
        };

        // Append menu to the body
        document.body.appendChild(menu);

        // Load settings and apply initial UI state (like button visibility and icon)
        loadAndApplyInitialSettings(); // 使用下面的新函数

        // --- 新增：设置 MutationObserver ---
        setupMutationObserver();
        // --- 结束新增 ---

        // Setup event listeners for the button, menu, etc.
        setupEventListeners(); // events.js

        // 设置文件上传监听器 (现在在 settings.js 中处理，确保 setupEventListeners 调用了它)
        // setupFileUploadListener(); // 不再需要在这里调用

        console.log(`[${Constants.EXTENSION_NAME}] Initialization complete.`);
    } catch (err) {
        console.error(`[${Constants.EXTENSION_NAME}] 初始化失败:`, err);
    }
}

// // 移除旧的 setupFileUploadListener 函数

/**
 * 加载初始设置并应用到插件状态和按钮显示
 * (与 settings.js 中的 loadAndApplySettingsToPanel 不同，这个是应用到插件运行状态)
 */
function loadAndApplyInitialSettings() {
    const settings = window.extension_settings[Constants.EXTENSION_NAME];

    // 确保默认值已设置 (防御性编程)
    settings.enabled = settings.enabled !== false;
    settings.iconType = settings.iconType || Constants.ICON_TYPES.ROCKET;
    settings.customIconUrl = settings.customIconUrl || '';
    settings.customIconSize = settings.customIconSize || Constants.DEFAULT_CUSTOM_ICON_SIZE;
    settings.faIconCode = settings.faIconCode || '';
    settings.matchButtonColors = settings.matchButtonColors !== false;
    settings.menuStyles = settings.menuStyles || JSON.parse(JSON.stringify(Constants.DEFAULT_MENU_STYLES));

    // 更新body类控制显示状态
    document.body.classList.remove('qra-enabled', 'qra-disabled');
    document.body.classList.add(settings.enabled ? 'qra-enabled' : 'qra-disabled');

    // 更新火箭按钮的初始可见性
    if (sharedState.domElements.rocketButton) {
        sharedState.domElements.rocketButton.style.display = settings.enabled ? 'flex' : 'none';
    }

    // 更新初始图标显示 (调用 settings.js 导出的函数)
    updateIconDisplay();

    // 应用初始菜单样式设置
    if (typeof updateMenuStylesUI === 'function') {
        updateMenuStylesUI();
    }

    console.log(`[${Constants.EXTENSION_NAME}] Initial settings applied.`);
}

// 确保 jQuery 可用 - 使用原生 js 备用
function onReady(callback) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(callback, 1);
    } else {
        document.addEventListener("DOMContentLoaded", callback);
    }
}

// 添加到 onReady 回调之前
function loadSettingsFromLocalStorage() {
    try {
        const savedSettings = localStorage.getItem('QRA_settings');
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            // 将保存的设置合并到当前设置 (确保新字段也能被加载)
            const currentSettings = extension_settings[Constants.EXTENSION_NAME];
            // 使用 Object.assign 进行浅合并，如果需要深合并，请使用 _.merge 或其他深拷贝方法
            // 这里只合并顶层属性，对 menuStyles 进行深拷贝以避免引用问题
             if (parsedSettings.menuStyles) {
                 parsedSettings.menuStyles = JSON.parse(JSON.stringify(parsedSettings.menuStyles));
             }
            Object.assign(currentSettings, parsedSettings); // 合并，localStorage中的值会覆盖默认值

            // 恢复大型customIconUrl数据，如果存储在dataset中
             const customIconUrlInput = document.getElementById(Constants.ID_CUSTOM_ICON_URL);
             if (customIconUrlInput && currentSettings.customIconUrl && currentSettings.customIconUrl.length > 1000) {
                 customIconUrlInput.dataset.fullValue = currentSettings.customIconUrl;
                 customIconUrlInput.value = "[图片数据已保存，但不在输入框显示以提高性能]";
             }


            console.log(`[${Constants.EXTENSION_NAME}] 从localStorage加载了设置:`, currentSettings);
            return true;
        }
    } catch(e) {
        console.error(`[${Constants.EXTENSION_NAME}] 从localStorage加载设置失败:`, e);
    }
    return false;
}

// 在 onReady 回调中
onReady(() => {
    try {
        // 1. 尝试从localStorage加载设置 (会更新 window.extension_settings)
        loadSettingsFromLocalStorage();

        // 2. 确保设置面板容器存在
        let settingsContainer = document.getElementById('extensions_settings');
        if (!settingsContainer) {
            console.warn("[Quick Reply Menu] #extensions_settings not found, creating dummy container.");
            settingsContainer = document.createElement('div');
            settingsContainer.id = 'extensions_settings';
            settingsContainer.style.display = 'none'; // 隐藏
            document.body.appendChild(settingsContainer);
        }

        // 3. 添加设置面板HTML内容 (使用 settings.js 的函数)
        // 注意：innerHTML += 可能导致事件监听器丢失，最好找到特定扩展的容器并替换其内容
        // 假设每个扩展都有自己的 settings div，例如 <div id="quick-reply-menu-settings">
        const settingsHtml = createSettingsHtml(); // 来自 settings.js
        // 将HTML插入到 settingsContainer 中。如果其他扩展也用 innerHTML +=，可能会有问题。
        // 最好是找到一个专门为此扩展准备的容器。
        // 临时的简单方法：
         settingsContainer.insertAdjacentHTML('beforeend', settingsHtml);


        // 4. 初始化插件 (创建按钮、菜单等)
        initializePlugin();

        // 5. 加载设置到设置面板UI元素 (调用 settings.js 的函数)
        loadAndApplySettingsToPanel(); // 加载设置到面板中的控件

    } catch (err) {
        console.error(`[${Constants.EXTENSION_NAME}] 启动失败:`, err);
    }
});
