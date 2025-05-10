// state.js

// Use an object to allow modifications from other modules
export const sharedState = {
    menuVisible: false,
    domElements: {
        rocketButton: null,
        menu: null,
        chatItemsContainer: null,
        globalItemsContainer: null,
        settingsDropdown: null,
        // ... other settings elements references
    },
    // --- 新增：用于存储扫描到的 JS Runner 按钮数据 ---
    jsRunnerButtonsData: [],
    jsRunnerLabels: new Set(), // 用于去重
    // --- 结束新增 ---
};

/**
 * Updates the menu visibility state.
 * @param {boolean} visible
 */
export function setMenuVisible(visible) {
    sharedState.menuVisible = visible;
}
