const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

// 导入 Express 服务器
require('./server.js');

let mainWindow;
let isAlwaysOnTop = false; // 添加置顶状态跟踪

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
        useContentSize: true,
        // 添加窗口置顶相关配置
        alwaysOnTop: isAlwaysOnTop,
        frame: true // 保留窗口框架以显示置顶按钮
    });

    // 加载应用
    mainWindow.loadURL('http://localhost:3005');

    // 创建自定义标题栏
    const titleBarHeight = 30;
    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.insertCSS(`
            /* 隐藏滚动条 */
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

            /* 添加自定义标题栏样式 */
            .custom-titlebar {
                position: fixed;
                top: 0;
                right: 0;
                z-index: 9999;
                height: ${titleBarHeight}px;
                padding: 5px 10px;
                display: flex;
                align-items: center;
                justify-content: flex-end;
                background: transparent;
            }

            .pin-button {
                width: 30px;
                height: 30px;
                border: none;
                background: rgba(0, 0, 0, 0.5);
                color: white;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.3s ease;
                backdrop-filter: blur(5px);
                margin-right: 10px;
            }

            .pin-button:hover {
                background: rgba(0, 0, 0, 0.7);
                transform: scale(1.1);
            }

            .pin-button.active {
                background: rgba(64, 158, 255, 0.8);
            }
        `);

        // 注入HTML和JavaScript
        mainWindow.webContents.executeJavaScript(`
            // 创建标题栏
            const titleBar = document.createElement('div');
            titleBar.className = 'custom-titlebar';
            
            // 创建置顶按钮
            const pinButton = document.createElement('button');
            pinButton.className = 'pin-button' + (${isAlwaysOnTop} ? ' active' : '');
            pinButton.innerHTML = '<i class="fas fa-thumbtack"></i>';
            pinButton.title = '窗口置顶';
            
            // 添加点击事件
            pinButton.addEventListener('click', () => {
                window.electron.toggleAlwaysOnTop();
                pinButton.classList.toggle('active');
            });
            
            titleBar.appendChild(pinButton);
            document.body.appendChild(titleBar);
        `);
    });

    // 禁用默认菜单栏
    mainWindow.setMenu(null);

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

// 添加置顶切换处理
ipcMain.handle('toggle-always-on-top', () => {
    if (mainWindow) {
        isAlwaysOnTop = !isAlwaysOnTop;
        mainWindow.setAlwaysOnTop(isAlwaysOnTop);
        return isAlwaysOnTop;
    }
    return false;
});