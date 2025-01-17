const { app, BrowserWindow, ipcMain, shell, screen, globalShortcut } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

require('./server.js');

let mainWindow;
let comfyWindow;
let pieMenuWindow = null;

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
        }
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
            webSecurity: false
        },
        icon: path.join(__dirname, 'public', 'image', 'logox.ico')
    });

    pieMenuWindow.loadFile('pieMenu.html');

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
        }
    });

    mainWindow.loadURL('http://localhost:3005');

    if (isDev) {
        mainWindow.webContents.openDevTools();
    }

    // 处理页面导航
    ipcMain.on('navigate', (event, url) => {
        if (url === 'http://localhost:8188') {
            if (comfyWindow && !comfyWindow.isDestroyed()) {
                comfyWindow.focus();
            } else {
                createComfyWindow();
            }
        } else {
            mainWindow.loadURL(url);
            mainWindow.focus();
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

    // 注册 Alt+W 快捷键
    globalShortcut.register('Alt+W', () => {
        try {
            if (pieMenuWindow && pieMenuWindow.isVisible()) {
                pieMenuWindow.hide();
            } else {
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