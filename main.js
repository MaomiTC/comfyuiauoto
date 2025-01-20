const { app, BrowserWindow, ipcMain, shell, screen, globalShortcut, Menu, dialog } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';
const { exec } = require('child_process');
const net = require('net');
const axios = require('axios');

require('./server.js');

let mainWindow;
let comfyWindow;
let pieMenuWindow = null;
let errorWindow = null;
let loadingWindow = null;

// 检查端口是否被占用
function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', () => {
                server.close();
                resolve(true);
            })
            .once('listening', () => {
                server.close(() => resolve(false));
            })
            .listen(port, '127.0.0.1');

        // 添加超时处理
        setTimeout(() => {
            try {
                server.close();
                resolve(true);
            } catch (e) {
                console.error(`Timeout checking port ${port}:`, e);
                resolve(true);
            }
        }, 1000);
    });
}

// 杀死占用端口的进程 (Windows)
function killProcessOnPort(port) {
    return new Promise((resolve, reject) => {
        // 使用 PowerShell 命令来避免编码问题
        const command = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`;
        
        exec(command, { encoding: 'utf8' }, (error, stdout, stderr) => {
            if (error) {
                // 如果是因为没有找到进程而失败，不认为是错误
                if (error.code === 1) {
                    console.log(`No process found on port ${port}`);
                    resolve();
                    return;
                }
                console.error(`Error killing process on port ${port}:`, error);
                // 即使失败也继续执行
                resolve();
                return;
            }
            console.log(`Successfully cleared port ${port}`);
            resolve();
        });
    });
}

// 清理端口函数
async function clearPorts() {
    const ports = [3001, 3005];
    for (const port of ports) {
        try {
            console.log(`Checking port ${port}...`);
            const inUse = await isPortInUse(port);
            
            if (inUse) {
                console.log(`Port ${port} is in use, attempting to free it...`);
                await killProcessOnPort(port);
                
                // 等待端口释放
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // 再次检查端口
                const stillInUse = await isPortInUse(port);
                if (stillInUse) {
                    console.log(`Warning: Port ${port} might still be in use`);
                } else {
                    console.log(`Successfully freed port ${port}`);
                }
            } else {
                console.log(`Port ${port} is available`);
            }
        } catch (error) {
            console.error(`Error handling port ${port}:`, error);
            // 继续处理下一个端口
        }
    }
    
    // 最后再等待一段时间确保所有端口都完全释放
    await new Promise(resolve => setTimeout(resolve, 1000));
}

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

    comfyWindow.loadURL('http://127.0.0.1:8188').catch(error => {
        console.error('Failed to load ComfyUI:', error);
        showErrorDialog('连接失败: ComfyUI 服务未启动或无法访问\n请确保 ComfyUI 正在运行');
    });

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
        try {
            if (url === 'https://chat.deepseek.com/sign_in') {
                // 在主窗口加载 DeepSeek
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.loadURL(url);
                    restoreWindow(mainWindow);
                }
            } else if (url === 'http://127.0.0.1:8188') {
                // 处理 ComfyUI 导航
                if (!comfyWindow) {
                    createComfyWindow();
                } else if (!comfyWindow.isDestroyed()) {
                    comfyWindow.loadURL(url);
                    comfyWindow.show();
                    comfyWindow.focus();
                }
            } else {
                // 其他导航
                mainWindow.loadURL(url);
                restoreWindow(mainWindow);
            }
            
            // 隐藏饼菜单
            if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                pieMenuWindow.hide();
            }
        } catch (error) {
            console.error('Navigation error:', error);
            showErrorDialog('导航失败: ' + error.message);
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

function showErrorWindow(errorMessage) {
    if (errorWindow) {
        errorWindow.close();
    }

    errorWindow = new BrowserWindow({
        width: 450,
        height: 250,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    errorWindow.loadFile('error.html');

    errorWindow.webContents.on('did-finish-load', () => {
        errorWindow.webContents.send('error-message', errorMessage);
    });

    errorWindow.on('closed', () => {
        errorWindow = null;
    });
}

// 添加关闭错误窗口的 IPC 处理
ipcMain.on('close-error-window', () => {
    if (errorWindow) {
        errorWindow.close();
    }
});

// 检查 ComfyUI 是否运行的函数
async function checkComfyUIConnection() {
    try {
        await axios.get('http://127.0.0.1:8188/history');
        return true;
    } catch (error) {
        return false;
    }
}

// 显示错误对话框
function showErrorDialog(message) {
    dialog.showErrorBox('错误', message);
}

// 修改错误处理
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    if (error.code === 'ECONNREFUSED') {
        showErrorDialog('连接失败: ComfyUI 服务未启动或无法访问\n请确保 ComfyUI 正在运行');
    } else {
        showErrorDialog(error.message);
    }
});

function createLoadingWindow() {
    if (loadingWindow) {
        try {
            loadingWindow.close();
        } catch (e) {
            console.error('Error closing existing loading window:', e);
        }
    }

    loadingWindow = new BrowserWindow({
        width: 300,
        height: 300,
        frame: false,
        transparent: true,
        resizable: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    loadingWindow.loadFile('loading.html');
    loadingWindow.center();

    loadingWindow.on('closed', () => {
        loadingWindow = null;
    });
}

// 安全地关闭加载窗口
function closeLoadingWindow() {
    if (loadingWindow && !loadingWindow.isDestroyed()) {
        try {
            loadingWindow.webContents.send('loading-complete');
            setTimeout(() => {
                if (loadingWindow && !loadingWindow.isDestroyed()) {
                    loadingWindow.close();
                }
            }, 1000);
        } catch (e) {
            console.error('Error closing loading window:', e);
            if (loadingWindow && !loadingWindow.isDestroyed()) {
                loadingWindow.close();
            }
        }
    }
}

// 当 Electron 完成初始化时创建窗口
app.whenReady().then(async () => {
    try {
        // 显示加载窗口
        createLoadingWindow();

        console.log('Starting port cleanup...');
        await clearPorts();
        console.log('Port cleanup completed');

        // 检查 ComfyUI 是否运行
        const isComfyUIRunning = await checkComfyUIConnection();
        if (!isComfyUIRunning) {
            closeLoadingWindow();
            showErrorDialog('连接失败: ComfyUI 服务未启动或无法访问\n请确保 ComfyUI 正在运行');
        } else {
            console.log('Creating window...');
            createWindow();
            
            // 关闭加载窗口
            closeLoadingWindow();
        }
        
        // 移除应用程序菜单栏
        if (!isDev) {
            Menu.setApplicationMenu(null);
        }

        // 注册全局的 refresh-page 处理器
        ipcMain.on('refresh-page', (event) => {
            console.log('Refresh command received');
            try {
                const focusedWindow = BrowserWindow.getFocusedWindow();
                
                // 先隐藏饼菜单
                if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                    pieMenuWindow.hide();
                }

                // 刷新活动窗口
                if (focusedWindow && !focusedWindow.isDestroyed()) {
                    console.log('Refreshing focused window');
                    focusedWindow.reload();
                } else {
                    // 如果没有焦点窗口，则按优先级刷新
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        console.log('Refreshing mainWindow');
                        mainWindow.reload();
                    } else if (comfyWindow && !comfyWindow.isDestroyed()) {
                        console.log('Refreshing comfyWindow');
                        comfyWindow.reload();
                    }
                }
            } catch (error) {
                console.error('Error refreshing page:', error);
            }
        });

        // 添加隐藏饼菜单的处理器
        ipcMain.on('hide-pie-menu', () => {
            if (pieMenuWindow && !pieMenuWindow.isDestroyed()) {
                pieMenuWindow.hide();
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
    } catch (error) {
        closeLoadingWindow();
        console.error('Fatal error during app initialization:', error);
        showErrorDialog(error.message);
    }
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