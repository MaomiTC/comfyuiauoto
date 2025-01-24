const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

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
            preload: path.join(__dirname, 'preload.js'),
            devTools: false  // 禁用开发者工具
        },
        // 添加以下配置来移除滚动条
        backgroundColor: '#1e1e1e',
        autoHideMenuBar: true,
        useContentSize: true
    });

    // 加载应用
    mainWindow.loadURL('http://localhost:3005');

    // 禁用菜单栏
    mainWindow.setMenu(null);

    // 注入自定义 CSS 来隐藏滚动条
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.insertCSS(`
            ::-webkit-scrollbar {
                display: none !important;
            }
            * {
                -ms-overflow-style: none !important;
                scrollbar-width: none !important;
            }
            body {
                overflow: hidden !important;
                margin: 0 !important;
                padding: 0 !important;
            }
        `);
    });

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