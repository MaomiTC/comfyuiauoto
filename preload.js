const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        invoke: (channel, ...args) => {
            // 白名单channels
            const validChannels = ['open-external-link'];
            if (validChannels.includes(channel)) {
                return ipcRenderer.invoke(channel, ...args);
            }
            return Promise.reject(new Error('Invalid channel'));
        }
    },
    closeErrorWindow: () => {
        ipcRenderer.send('close-error-window');
    },
    onErrorMessage: (callback) => {
        ipcRenderer.on('error-message', (event, message) => {
            callback(message);
        });
    },
    onLoadingComplete: (callback) => {
        ipcRenderer.on('loading-complete', () => callback());
    }
}); 