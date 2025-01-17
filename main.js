const { app, BrowserWindow, ipcMain, shell, screen, globalShortcut, Menu } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

require('./server.js');

let mainWindow;
let comfyWindow;
let pieMenuWindow = null;

// 添加恢复窗口函数
function restoreWindow(window) {
    if (window) {
        if (window.isMinimized()) {
            window.restore();
        }
        window.show();
        window.focus();
    }
}

function createComfyWindow() {
    comfyWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'public', 'image', 'logox.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        frame: true
    });

    comfyWindow.loadURL('http://127.0.0.1:8188');

    if (isDev) {
        comfyWindow.webContents.openDevTools();
    }

    comfyWindow.on('closed', () => {
        comfyWindow = null;
    });

    return comfyWindow;
}

function createPieMenu() {
    if (pieMenuWindow) {
        pieMenuWindow.show();
        pieMenuWindow.webContents.send('window-show');
        return;
    }

    pieMenuWindow = new BrowserWindow({
        width: 400,
        height: 400,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
            enableRemoteModule: true
        },
        icon: path.join(__dirname, 'public', 'image', 'logox.ico')
    });

    pieMenuWindow.loadFile('pieMenu.html');

    pieMenuWindow.webContents.on('did-finish-load', () => {
        if (isDev) {
            pieMenuWindow.webContents.openDevTools();
        }
    });

    ipcMain.on('refresh-page', () => {
        console.log('Refresh command received');
        try {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            
            if (!focusedWindow) {
                if (comfyWindow && !comfyWindow.isDestroyed()) {
                    console.log('Refreshing comfyWindow');
                    comfyWindow.reload();
                } else if (mainWindow && !mainWindow.isDestroyed()) {
                    console.log('Refreshing mainWindow');
                    mainWindow.reload();
                }
            } else {
                console.log('Refreshing focused window');
                focusedWindow.reload();
            }

            if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                pieMenuWindow.hide();
            }
        } catch (error) {
            console.error('Error refreshing page:', error);
        }
    });

    pieMenuWindow.once('ready-to-show', () => {
        pieMenuWindow.show();
        pieMenuWindow.webContents.send('window-show');
    });

    pieMenuWindow.on('blur', () => {
        pieMenuWindow.hide();
    });

    pieMenuWindow.on('closed', () => {
        pieMenuWindow = null;
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, 'public', 'image', 'logox.ico'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: false,
            preload: path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        frame: true
    });

    mainWindow.loadURL('http://localhost:3005');

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // 修改导航处理逻辑
    ipcMain.on('navigate', (event, url) => {
        if (url === 'http://localhost:8188') {
            if (comfyWindow && !comfyWindow.isDestroyed()) {
                restoreWindow(comfyWindow);
            } else {
                createComfyWindow();
            }
            // 隐藏饼菜单
            if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                pieMenuWindow.hide();
            }
        } else {
            mainWindow.loadURL(url);
            restoreWindow(mainWindow);
            // 隐藏饼菜单
            if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                pieMenuWindow.hide();
            }
        }
    });

    mainWindow.on('closed', () => {
        if (comfyWindow && !comfyWindow.isDestroyed()) {
            comfyWindow.close();
        }
        if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
            pieMenuWindow.close();
        }
        mainWindow = null;
    });
}

// 当 Electron 完成初始化时创建窗口
app.whenReady().then(() => {
    createWindow();
    
    // 移除应用程序菜单栏
    if (!isDev) {  // 在非开发模式下移除菜单栏
        Menu.setApplicationMenu(null);
    }

    // 注册全局的 refresh-page 处理器
    ipcMain.on('refresh-page', (event) => {
        console.log('Refresh command received');
        try {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            
            if (!focusedWindow) {
                if (comfyWindow && !comfyWindow.isDestroyed()) {
                    console.log('Refreshing comfyWindow');
                    comfyWindow.reload();
                } else if (mainWindow && !mainWindow.isDestroyed()) {
                    console.log('Refreshing mainWindow');
                    mainWindow.reload();
                }
            } else {
                console.log('Refreshing focused window');
                focusedWindow.reload();
            }

            // 隐藏饼菜单
            if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                pieMenuWindow.hide();
            }
        } catch (error) {
            console.error('Error refreshing page:', error);
        }
    });

    // 注册 Alt+W 快捷键
    globalShortcut.register('Alt+W', () => {
        try {
            if (pieMenuWindow && pieMenuWindow.isVisible()) {
                pieMenuWindow.hide();
            } else {
                // 如果所有窗口都最小化，先显示饼菜单
                createPieMenu();
                const mousePos = screen.getCursorScreenPoint();
                pieMenuWindow.setPosition(mousePos.x - 150, mousePos.y - 150);
            }
        } catch (error) {
            console.error('Error handling Alt+W shortcut:', error);
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 当所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 应用退出时注销所有快捷键
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
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