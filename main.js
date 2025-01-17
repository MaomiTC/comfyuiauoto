const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

// 导入 Express 服务器
require('./server.js');

let mainWindow;

function createWindow() {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'public', 'image', 'logox.ico'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // 加载应用
    mainWindow.loadURL('http://localhost:3005');

    // 开发环境下打开开发者工具
    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // 当窗口关闭时触发
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// 当 Electron 完成初始化时创建窗口
app.whenReady().then(createWindow);

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

// 处理外部链接的打开
ipcMain.handle('open-external-link', async (event, url) => {
    try {
        await shell.openExternal(url);
        return true;
    } catch (error) {
        console.error('打开外部链接失败:', error);
        return false;
    }
}); 