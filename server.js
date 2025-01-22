const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const WebSocket = require('ws');
const FormData = require('form-data');
const { spawn } = require('child_process');

const app = express();
const httpPort = 3005;
const wsPort = 3001;  // WebSocket 使用不同的端口

// 设置网站图标
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'image', 'icon.ico'));
});

// 增加请求大小限制
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({
    limit: '50mb',
    extended: true,
    parameterLimit: 50000
}));

// 配置静态文件服务
app.use(express.static(path.join(__dirname, 'public')));
app.use('/image', express.static(path.join(__dirname, 'public', 'image')));

// 创建 WebSocket 服务器
const wss = new WebSocket.Server({ port: wsPort });

// 存储所有连接的客户端
const clients = new Set();

// 存储最新的图像数据
let latestImageData = null;
let latestPrompt = '';

// 添加新的WebSocket连接来监听ComfyUI的状态
let comfyWs = null;

// 在文件开头添加配置文件读取
let comfyuiPath;
try {
    const configPath = path.join(__dirname, 'config.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        comfyuiPath = config.comfyuiPath;
        // 如果配置文件中有路径，立即设置为环境变量
        if (comfyuiPath) {
            process.env.COMFYUI_DIR = comfyuiPath;
            console.log('已从配置文件加载 ComfyUI 路径:', comfyuiPath);
        }
    }
} catch (error) {
    console.error('读取配置文件失败:', error);
}

// 获取 ComfyUI 路径的辅助函数
const getComfyUIPath = () => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.comfyuiPath && fs.existsSync(path.join(config.comfyuiPath, 'main.py'))) {
                return config.comfyuiPath;
            }
        }
    } catch (error) {
        console.error('Error reading ComfyUI path:', error);
    }
    return path.join(__dirname, '..', 'ComfyUI'); // 默认路径
};

function connectComfyWebSocket() {
    comfyWs = new WebSocket('ws://127.0.0.1:8188/ws');
    
    comfyWs.on('open', () => {
        console.log('已连接到ComfyUI WebSocket');
        // 广播连接成功消息
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'connection', status: 'connected' }));
            }
        });
    });

    comfyWs.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('收到ComfyUI消息:', message);
            
            // 转发相关消息到所有客户端
            clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        } catch (e) {
            console.error('处理ComfyUI消息错误:', e);
        }
    });

    comfyWs.on('close', () => {
        console.log('ComfyUI WebSocket连接已关闭，尝试重新连接...');
        // 广播断开连接消息
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'connection', status: 'disconnected' }));
            }
        });
        setTimeout(connectComfyWebSocket, 5000);
    });
}

// 启动时连接到ComfyUI WebSocket
connectComfyWebSocket();

// 在文件开头的常量定义部分添加
const MAX_SAVED_IMAGES = 20;  // 最大保留图片数量

// 添加清理图片的函数
function cleanupSavedImages(savedImagesDir) {
    try {
        if (!fs.existsSync(savedImagesDir)) {
            return;
        }

        const files = fs.readdirSync(savedImagesDir)
            .filter(file => file.endsWith('.png'))
            .map(file => ({
                name: file,
                path: path.join(savedImagesDir, file),
                time: fs.statSync(path.join(savedImagesDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        // 如果图片数量超过限制，删除旧图片
        if (files.length > MAX_SAVED_IMAGES) {
            files.slice(MAX_SAVED_IMAGES).forEach(file => {
                try {
                    fs.unlinkSync(file.path);
                    console.log(`已删除旧图片: ${file.name}`);
                } catch (err) {
                    console.error(`删除图片失败 ${file.name}:`, err);
                }
            });
        }
    } catch (error) {
        console.error('清理saved_images目录失败:', error);
    }
}

// 修改 saveReceivedImage 函数
const saveReceivedImage = async (base64Data, prompt) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `generated_${timestamp}.png`;
        
        // 使用固定的服务器端路径
        const savedImagesDir = path.join(__dirname, 'public', 'saved_images');
        
        // 确保保存目录存在
        if (!fs.existsSync(savedImagesDir)) {
            fs.mkdirSync(savedImagesDir, { recursive: true });
        }
        
        const savePath = path.join(savedImagesDir, fileName);
        
        // 保存图片
        fs.writeFileSync(savePath, base64Data, 'base64');
        
        // 清理旧图片
        cleanupSavedImages(savedImagesDir);
        
        return fileName;
    } catch (error) {
        console.error('保存图片失败:', error);
        return null;
    }
};

// 修改 WebSocket 消息处理
wss.on('connection', (ws) => {
    console.log('新的WebSocket连接');
    clients.add(ws);

    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            console.log('收到WebSocket消息:', data);
            if (data.type === 'image') {
                // 保存接收到的图片
                const fileName = await saveReceivedImage(data.image, data.prompt);
                if (fileName) {
                    data.savedPath = `/saved_images/${fileName}`;
                }
                
                latestImageData = data.image;
                latestPrompt = data.prompt;
                
                // 广播给其他客户端
                clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'image',
                            image: data.image,
                            prompt: data.prompt,
                            savedPath: data.savedPath,
                            timestamp: Date.now()
                        }));
                    }
                });
            }
        } catch (e) {
            console.error('消息处理错误:', e);
        }
    });

    // 监听ComfyUI的WebSocket消息
    comfyWs.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            console.log('收到ComfyUI消息:', message);
            
            // 如果是执行完成的消息
            if (message.type === 'executed' && message.data?.output) {
                // 试获取最新的图片
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        type: 'refresh',
                        timestamp: Date.now()
                    }));
                }, 1000); // 延迟1秒等待图片保存
            }
        } catch (e) {
            console.error('处理ComfyUI消息错误:', e);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('WebSocket连接已关闭');
    });
});

// 广播图片给所有连接的客户端
function broadcastImage(imageData, prompt) {
    console.log('广播图片数据:', imageData ? '有图片数据' : '无图片数据');
    const message = JSON.stringify({
        type: 'image',
        image: imageData,
        prompt: prompt,
        timestamp: Date.now()
    });

    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// 修改上传路由
app.post('/api/comfyui/upload/:connection_id', async (req, res) => {
    try {
        if (!req.body || !req.body.image) {
            return res.status(400).json({ error: 'No image data provided' });
        }

        const connectionId = req.params.connection_id;
        const nodeId = req.body.nodeId;
        
        try {
            // 将 base64 转换为文件
            const base64Data = req.body.image.split(',')[1];
            
            // 使用固定的服务器端路径
            const tempDir = path.join(__dirname, 'temp');
            
            // 确保临时目录存在
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const tempFilePath = path.join(tempDir, `${connectionId}.png`);
            
            // 写入临时文件
            fs.writeFileSync(tempFilePath, base64Data, 'base64');
            
            // 创建 FormData
            const form = new FormData();
            form.append('image', fs.createReadStream(tempFilePath));
            
            // 上传到 ComfyUI
            let imagePath;
            try {
                const response = await axios.post('http://127.0.0.1:8188/upload/image', form, {
                    headers: {
                        ...form.getHeaders()
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity
                });
                imagePath = response.data.name;
            } catch (uploadError) {
                console.error('ComfyUI上传失败:', uploadError);
                throw new Error('ComfyUI上传失败');
            }

            // 删除临时文件
            try {
                fs.unlinkSync(tempFilePath);
            } catch (err) {
                console.warn('删除临时文件失败:', err);
            }

            // 保存原始图片数据到本地存储
            try {
                const originalImagesDir = path.join(__dirname, 'public', 'original_images');
                if (!fs.existsSync(originalImagesDir)) {
                    fs.mkdirSync(originalImagesDir, { recursive: true });
                }
                const originalImagePath = path.join(originalImagesDir, `${nodeId}_original.png`);
                fs.writeFileSync(originalImagePath, base64Data, 'base64');
            } catch (saveError) {
                console.error('保存原始图片失败:', saveError);
            }

            // 广播图片给所有客户端
            broadcastImage(base64Data, '');

            res.json({
                success: true,
                connection_id: connectionId,
                image_path: imagePath,
                preview: req.body.image,
                nodeId: nodeId
            });
        } catch (error) {
            console.error('Upload failed:', error.message);
            res.status(500).json({
                error: '上传失败',
                details: error.response?.data || error.message
            });
        }
    } catch (error) {
        console.error('Request processing failed:', error);
        res.status(500).json({
            error: '请求处理失败',
            details: error.message
        });
    }
});

// 添加获取原始图片的路由
app.get('/api/get-original-image/:nodeId', (req, res) => {
    try {
        const nodeId = req.params.nodeId;
        const originalImagePath = path.join(__dirname, 'public', 'original_images', `${nodeId}_original.png`);
        
        if (fs.existsSync(originalImagePath)) {
            const imageData = fs.readFileSync(originalImagePath, 'base64');
            res.json({ image: `data:image/png;base64,${imageData}` });
        } else {
            res.status(404).json({ error: '原始图片不存在' });
        }
    } catch (error) {
        console.error('获取原始图片失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取工作流列表
app.get('/api/workflows', (req, res) => {
    try {
        const workflowDir = path.join(__dirname, 'workflow');
        // 确保目录存在
        if (!fs.existsSync(workflowDir)) {
            fs.mkdirSync(workflowDir);
        }
        const files = fs.readdirSync(workflowDir)
            .filter(file => file.endsWith('.json'))
            .map(file => ({
                name: file.replace('.json', ''),
                path: file
            }));
        res.json(files);
    } catch (error) {
        console.error('获取工作流列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取指定工作流
app.get('/api/workflow/:filename?', (req, res) => {
    try {
        const filename = req.params.filename || 'image.json';
        const filePath = path.join(__dirname, 'workflow', filename);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: '工作文件不存在' });
        }

        const workflow = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        // 修改转换函数，保持完整的参数名
        const convertParamNames = (nodes) => {
            for (const nodeId in nodes) {
                const node = nodes[nodeId];
                if (node.inputs) {
                    // 保持原始inputs对象
                    const originalInputs = { ...node.inputs };
                    
                    // 为每个参数添加显示名称
                    for (const key in originalInputs) {
                        if (typeof originalInputs[key] === 'object' && originalInputs[key] !== null) {
                            originalInputs[key].displayName = key; // 添加显示名称
                        }
                    }
                    
                    node.inputs = originalInputs;
                }
            }
            return nodes;
        };

        // 转换参数名
        if (workflow.nodes) {
            workflow.nodes = convertParamNames(workflow.nodes);
        }

        res.json(workflow);
    } catch (error) {
        console.error('读取工作流失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 更新工作流
app.post('/api/workflow/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(__dirname, 'workflow', filename);
        fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('更新工作流失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 执行工作流
app.post('/api/execute', async (req, res) => {
    try {
        const workflow = req.body;
        // 发送到 ComfyUI API
        const response = await axios.post('http://127.0.0.1:8188/prompt', {
            // 需要按照 ComfyUI API 的格式构造请求
            prompt: workflow,
            // 添加客户端 ID
            client_id: "comfyui-web"
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        // 返回执行结果
        res.json(response.data);
    } catch (error) {
        console.error('执行工作流失败:', error);
        res.status(500).json({ 
            error: error.message,
            details: '检查comfyui是否启动，工作流是否能正常执行'
        });
    }
});

// 添加新的路由来处理预设
app.get('/api/preset/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const presetPath = path.join(__dirname, 'preset', `${filename}.preset.json`);
        
        // 确保预设目录存在
        const presetDir = path.dirname(presetPath);
        if (!fs.existsSync(presetDir)) {
            fs.mkdirSync(presetDir, { recursive: true });
        }
        
        if (!fs.existsSync(presetPath)) {
            return res.json({ selectedParams: {} });
        }

        const preset = JSON.parse(fs.readFileSync(presetPath, 'utf8'));
        res.json(preset);
    } catch (error) {
        console.error('读取预设失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改保存预设的路由
app.post('/api/preset/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        const presetPath = path.join(__dirname, 'preset', `${filename}.preset.json`);
        
        // 确保预设目录存在
        const presetDir = path.dirname(presetPath);
        if (!fs.existsSync(presetDir)) {
            fs.mkdirSync(presetDir, { recursive: true });
        }
        
        fs.writeFileSync(presetPath, JSON.stringify(req.body, null, 2));
        console.log('预设保存成功:', presetPath);
        res.json({ success: true });
    } catch (error) {
        console.error('保存预设失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改输出目录路径的获取方式
app.get('/api/output-images', (req, res) => {
    try {
        // 用环境变量或配置文件来设置ComfyUI的路径
        const comfyuiDir = getComfyUIPath();
        const outputDir = path.join(comfyuiDir, 'output');
        
        if (!fs.existsSync(outputDir)) {
            return res.status(404).json({ error: '输出目录不存在' });
        }

        const files = fs.readdirSync(outputDir)
            .filter(file => file.endsWith('.png') || file.endsWith('.jpg'))
            .map(file => ({
                name: file,
                path: `/outputs/${file}`,
                time: fs.statSync(path.join(outputDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        res.json(files);
    } catch (error) {
        console.error('获取输出图片失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改静态文件服务器的路径
app.use('/outputs', express.static(path.join(getComfyUIPath(), 'output')));

// 添加获取保存图片列表的路由
app.get('/api/saved-images', (req, res) => {
    try {
        const savedImagesDir = path.join(__dirname, 'public', 'saved_images');

        if (!fs.existsSync(savedImagesDir)) {
            fs.mkdirSync(savedImagesDir, { recursive: true });
            return res.json([]);
        }
        
        const files = fs.readdirSync(savedImagesDir)
            .filter(file => file.endsWith('.png'))
            .map(file => ({
                name: file,
                path: `/saved_images/${file}`,
                time: fs.statSync(path.join(savedImagesDir, file)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);
            
        res.json(files);
    } catch (error) {
        console.error('获取保存图片列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改静态文件服务配置
app.use('/saved_images', express.static(path.join(__dirname, 'public', 'saved_images')));

// 在现有的路由之前添加新的路由
app.get('/api/models', (req, res) => {
    try {
        // 使用环境变量或默认路径
        const comfyuiDir = getComfyUIPath();
        const modelsDir = path.join(comfyuiDir, 'models');
        
        // 需要扫描的子目录
        const subDirs = [
            'checkpoints',
            'controlnet',
            'loras',
            'unet'
        ];
        
        const models = {};
        
        // 扫描每个子目录
        subDirs.forEach(dir => {
            const fullPath = path.join(modelsDir, dir);
            if (fs.existsSync(fullPath)) {
                // 获取支持的文件扩展名
                const supportedExt = [
                    '.ckpt',
                    '.safetensors',
                    '.pt',
                    '.pth',
                    '.bin',
                    '.onnx',
                    '.sft',
                    '.gguf'
                ];
                
                // 递归读取目录下的所有文件
                const files = [];
                function scanDir(dirPath) {
                    const items = fs.readdirSync(dirPath);
                    items.forEach(item => {
                        const fullPath = path.join(dirPath, item);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            scanDir(fullPath);
                        } else if (supportedExt.some(ext => item.toLowerCase().endsWith(ext))) {
                            // 取相对于模型目录的路径
                            const relativePath = path.relative(modelsDir, fullPath);
                            files.push({
                                name: item,
                                path: relativePath,
                                size: (stat.size / (1024 * 1024)).toFixed(2) + ' MB', // 转换为MB
                                lastModified: stat.mtime
                            });
                        }
                    });
                }
                
                try {
                    scanDir(fullPath);
                    models[dir] = files;
                } catch (error) {
                    console.error(`扫描 ${dir} 目录失败:`, error);
                    models[dir] = { error: error.message };
                }
            } else {
                models[dir] = { error: '目录不存在' };
            }
        });
        
        res.json({
            comfyuiPath: comfyuiDir,
            models: models
        });
    } catch (error) {
        console.error('获取模型列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改设置检查路由
app.get('/api/settings', (req, res) => {
    try {
        const configPath = path.join(__dirname, 'config.json');
        let settings = {};
        
        if (fs.existsSync(configPath)) {
            settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
        
        // 检查 ComfyUI 路径是否有效
        if (settings.comfyuiPath) {
            const mainPyPath = path.join(settings.comfyuiPath, 'main.py');
            const isValid = fs.existsSync(mainPyPath);
            if (!isValid) {
                console.log('Invalid ComfyUI path:', settings.comfyuiPath);
                settings.comfyuiPath = '';
            }
        }
        
        res.json(settings);
    } catch (error) {
        console.error('读取设置失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改保存设置的路由
app.post('/api/settings', async (req, res) => {
    try {
        const { comfyuiPath } = req.body;
        
        if (!comfyuiPath) {
            return res.status(400).json({ error: '请提供 ComfyUI 路径' });
        }

        // 验证路径是否有效
        const mainPyPath = path.join(comfyuiPath, 'main.py');
        if (!fs.existsSync(mainPyPath)) {
            console.log('Invalid ComfyUI path, main.py not found:', mainPyPath);
            return res.status(400).json({ error: '无效的 ComfyUI 路径：未找到 main.py' });
        }
        
        // 保存设置
        const configPath = path.join(__dirname, 'config.json');
        const settings = { comfyuiPath };
        
        // 确保配置目录存在
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        
        // 写入配置文件
        fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
        
        // 更新全局变量
        process.env.COMFYUI_DIR = comfyuiPath;
        
        console.log('Settings saved successfully:', settings);
        res.json({ success: true });
    } catch (error) {
        console.error('保存设置失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改 printModelsInfo 函数
function printModelsInfo(comfyuiDir) {
    try {
        const modelsDir = path.join(comfyuiDir, 'models');
        
        // 获取所有模型目录
        const modelDirs = fs.readdirSync(modelsDir)
            .filter(item => fs.statSync(path.join(modelsDir, item)).isDirectory());
        
        console.log('\n=== ComfyUI 模型信息 ===');
        console.log('ComfyUI路径:', comfyuiDir);
        console.log('模型根目录:', modelsDir);
        console.log('发现模型目录:', modelDirs);
        
        // 记录未找到的文件类型
        const notFoundExtensions = new Set();
        
        // 遍历所有模型目录
        modelDirs.forEach(dir => {
            const fullPath = path.join(modelsDir, dir);
            if (fs.existsSync(fullPath)) {
                // 获取支持的文件扩展名
                const supportedExt = [
                    '.ckpt',
                    '.safetensors',
                    '.pt',
                    '.pth',
                    '.bin',
                    '.onnx',
                    '.sft',
                    '.gguf'
                ];
                const files = [];
                
                function scanDir(dirPath) {
                    const items = fs.readdirSync(dirPath);
                    items.forEach(item => {
                        const fullPath = path.join(dirPath, item);
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            console.log(`  发现子目录: ${path.relative(modelsDir, fullPath)}`);
                            scanDir(fullPath);
                        } else {
                            const ext = path.extname(item).toLowerCase();
                            if (supportedExt.includes(ext)) {
                                const size = (stat.size / (1024 * 1024)).toFixed(2);
                                files.push({
                                    name: item,
                                    path: path.relative(modelsDir, fullPath),
                                    size: `${size} MB`
                                });
                            } else if (ext) {
                                notFoundExtensions.add(ext);
                            }
                        }
                    });
                }
                
                try {
                    scanDir(fullPath);
                    console.log(`\n${dir}目录 (${files.length}个文件):`);
                    files.forEach(file => {
                        console.log(`  - ${file.path} (${file.size})`);
                    });
                } catch (error) {
                    console.error(`扫描 ${dir} 目录失败:`, error);
                }
            } else {
                console.log(`\n${dir}目录: 不存在`);
            }
        });
        
        console.log('\n总计:');
        console.log(`- 模型目录数: ${modelDirs.length}`);
        console.log(`- 支持的文件类型: ${supportedExt.join(', ')}`);
        if (notFoundExtensions.size > 0) {
            console.log('- 未被识别的文件类型:', Array.from(notFoundExtensions).join(', '));
        }
        console.log('\n===================\n');
    } catch (error) {
        console.error('扫描模型目录失败:', error);
    }
}

// 添加获取 checkpoints 列表的路由
app.get('/api/checkpoints', (req, res) => {
    try {
        const comfyuiDir = getComfyUIPath();
        const checkpointsDir = path.join(comfyuiDir, 'models', 'checkpoints');
        
        if (!fs.existsSync(checkpointsDir)) {
            return res.json([]);
        }
        
        const supportedExt = [
            '.safetensors',
            '.ckpt',
            '.pt',
            '.pth',
            '.bin',
            '.onnx',
            '.sft',
            '.gguf'
        ];
        
        const files = fs.readdirSync(checkpointsDir)
            .filter(file => supportedExt.some(ext => file.toLowerCase().endsWith(ext)))
            .map(file => ({
                name: file,
                value: file
            }));
        
        res.json(files);
    } catch (error) {
        console.error('获取 checkpoints 列表失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加重命名工作流的路由
app.post('/api/workflow/rename', (req, res) => {
    try {
        const { oldPath, newPath } = req.body;
        const oldFilePath = path.join(__dirname, 'workflow', oldPath);
        const newFilePath = path.join(__dirname, 'workflow', newPath);
        
        // 检查源文件是否存在
        if (!fs.existsSync(oldFilePath)) {
            return res.status(404).json({ error: '源文件不存在' });
        }
        
        // 检查目标文件是否已存在
        if (fs.existsSync(newFilePath)) {
            return res.status(400).json({ error: '目标文件已存在' });
        }
        
        // 重命名文件
        fs.renameSync(oldFilePath, newFilePath);
        
        res.json({ success: true });
    } catch (error) {
        console.error('重命名工作流失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 修改获取不同类型模型列表的路由
app.get('/api/models/:type', (req, res) => {
    try {
        const { type } = req.params;
        const comfyuiDir = getComfyUIPath();
        const modelsDir = path.join(comfyuiDir, 'models');
        
        // 添加错误检查和日志
        if (!fs.existsSync(modelsDir)) {
            console.error('Models directory not found:', modelsDir);
            return res.status(404).json({ 
                error: 'Models directory not found',
                path: modelsDir 
            });
        }

        // 递归获取目录中的所有文件
        function getAllFiles(dirPath, arrayOfFiles = []) {
            const files = fs.readdirSync(dirPath);
        
            files.forEach(file => {
                const fullPath = path.join(dirPath, file);
                if (fs.statSync(fullPath).isDirectory()) {
                    arrayOfFiles = getAllFiles(fullPath, arrayOfFiles);
                } else {
                    const relativePath = path.relative(modelsDir, fullPath);
                    arrayOfFiles.push({
                        name: file,
                        fullPath: fullPath,
                        // 使用相对于模型类型目录的路径
                        relativePath: path.relative(path.join(modelsDir, type), fullPath),
                        // 添加完整的相对路径用于显示
                        displayPath: relativePath
                    });
                }
            });
        
            return arrayOfFiles;
        }

        const modelDir = path.join(modelsDir, type);
        
        if (!fs.existsSync(modelDir)) {
            console.error('Model type directory not found:', modelDir);
            return res.json([]);
        }
        
        const supportedExt = [
            '.safetensors',
            '.ckpt',
            '.pt',
            '.pth',
            '.bin',
            '.onnx',
            '.sft',
            '.gguf'
        ];
        
        try {
            // 递归获取所有文件
            const allFiles = getAllFiles(modelDir);
            
            // 过滤和处理文件
            const files = allFiles
                .filter(file => {
                    const ext = path.extname(file.name).toLowerCase();
                    return supportedExt.includes(ext);
                })
                .map(file => {
                    const dirName = path.dirname(file.relativePath);
                    const displayName = dirName === '.' ? file.name : `${dirName}/${file.name}`;
                    
                    return {
                        name: displayName,  // 显示名称包含子目录路径
                        value: file.name,   // 值仍然使用文件名
                        fullPath: file.relativePath, // 完整相对路径
                        size: fs.statSync(file.fullPath).size,
                        directory: dirName === '.' ? '' : dirName
                    };
                });

            // 按目录分组
            const groupedFiles = files.reduce((acc, file) => {
                const dir = file.directory || 'root';
                if (!acc[dir]) {
                    acc[dir] = [];
                }
                acc[dir].push(file);
                return acc;
            }, {});

            console.log(`Found ${files.length} models in ${type} directory`);
            
            // 返回扁平化的列表，但保持文件的完整路径信息
            res.json(files.map(file => ({
                name: file.name,  // 显示名称（包含路径）
                value: file.fullPath  // 值使用完整相对路径
            })));
            
        } catch (error) {
            console.error(`Error reading ${type} models:`, error);
            res.status(500).json({ 
                error: `Failed to read ${type} models`,
                details: error.message,
                path: modelDir
            });
        }
    } catch (error) {
        console.error(`Error in /api/models/${req.params.type}:`, error);
        res.status(500).json({ 
            error: 'Server error',
            details: error.message 
        });
    }
});

// 添加新的路由来获取预处理器列表
app.get('/api/preprocessors', (req, res) => {
    try {
        // 预定义处理器列表
        const preprocessors = [
            'AnimeFace_SemSegPreprocessor',
            'AnyLineArtPreprocessor_aux',
            'BinaryPreprocessor',
            'CannyEdgePreprocessor',
            'ColorPreprocessor',
            'DensePreprocessor',
            'DepthAnythingPreprocessor',
            'Zoe_DepthAnythingPreprocessor',
            'DepthAnythingV2Preprocessor',
            'DSTNE-NormalMapPreprocessor',
            'DWPreprocessor',
            'AnimalPosePreprocessor',
            'HEDPreprocessor',
            'FakeScribblePreprocessor',
            'LeReS-DepthMapPreprocessor',
            'LineArtPreprocessor',
            'AnimeLineArtPreprocessor',
            'LinenartStandardPreprocessor',
            'Manga2Anime_LineArt_Preprocessor',
            'MediaPipe-FaceMeshPreprocessor',
            'MeshGraphormer-DepthMapPreprocessor',
            'Metric3D-DepthMapPreprocessor',
            'Metric3D-NormalMapPreprocessor',
            'MiDaS-NormalMapPreprocessor',
            'MiDaS-DepthMapPreprocessor',
            'M-LSDPreprocessor',
            'BAE-NormalMapPreprocessor',
            'OneFormer-COCO-SemSegPreprocessor',
            'OneFormer-ADE20K-SemSegPreprocessor',
            'OpenposePreprocessor',
            'PiDiNetPreprocessor',
            'PyraCannyPreprocessor',
            'ImageLuminanceDetector',
            'ImageInpaintPreprocessor',
            'ScribblePreprocessor',
            'Scribble_XDoG_Preprocessor',
            'Scribble_HED_Preprocessor',
            'SAMPreprocessor',
            'ShufflePreprocessor',
            'TEEDPreprocessor',
            'TilePreprocessor',
            'TTPlanet_TileGF_Preprocessor',
            'TTPlanet_TileSimple_Preprocessor',
            'UniFormer_SemSegPreprocessor',
            'ZoeDepthPreprocessor',
            'Zoe-DepthMapPreprocessor'
        ];
        
        res.json(preprocessors);
    } catch (error) {
        console.error('获取预处理器列表失败:', error);
        res.status(500).json({ error: '获取预处理器列表失败' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/autocmfy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/autocmfy.html'));
});

// 添加全局错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        error: '服务器错误',
        details: err.message
    });
});

// 确保必要的目录存在
const ensureDirectories = () => {
    const dirs = [
        'public/saved_images',
        'public/original_images',
        'temp',
        'preset',
        'workflow'
    ];
    
    dirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    });
};

// 在启动服务器前确保目录存在
ensureDirectories();

// 添加新的路由来处理在Photoshop中打开图片
app.post('/api/open-in-photoshop', async (req, res) => {
    try {
        const { imagePath } = req.body;
        
        // 获取图片的完整路径
        let fullPath;
        if (imagePath.startsWith('/saved_images/')) {
            // 如果是保存的图片
            fullPath = path.join(__dirname, 'public', imagePath);
        } else if (imagePath.startsWith('/outputs/')) {
            // 如果是输出目录的图片
            fullPath = path.join(getComfyUIPath(), 'output', path.basename(imagePath));
        } else {
            throw new Error('Invalid image path');
        }

        // 检查文件是否存在
        if (!fs.existsSync(fullPath)) {
            throw new Error('Image file not found');
        }

        // 使用虚拟环境中的 Python 脚本打开图片
        const pythonProcess = spawn(
            path.join(__dirname, 'phtoshopPython', 'venv', 'Scripts', 'python.exe'),
            [
                path.join(__dirname, 'phtoshopPython', 'ps_automation.py'), 
                fullPath
            ],
            {
                env: {
                    ...process.env,
                    PYTHONPATH: path.join(__dirname, 'phtoshopPython', 'venv', 'Lib', 'site-packages')
                }
            }
        );

        pythonProcess.stdout.on('data', (data) => {
            console.log(`Python stdout: ${data}`);
        });

        pythonProcess.stderr.on('data', (data) => {
            console.error(`Python stderr: ${data}`);
        });

        pythonProcess.on('close', (code) => {
            if (code === 0) {
                res.json({ success: true });
            } else {
                res.status(500).json({ error: 'Failed to open image in Photoshop' });
            }
        });

    } catch (error) {
        console.error('Error opening image in Photoshop:', error);
        res.status(500).json({ error: error.message });
    }
});

// 添加工作流顺序的路由
app.post('/api/workflow-order', (req, res) => {
    try {
        const { order } = req.body;
        const orderPath = path.join(__dirname, 'workflow', 'order.json');
        fs.writeFileSync(orderPath, JSON.stringify({ order }, null, 2));
        res.json({ success: true });
    } catch (error) {
        console.error('保存工作流顺序失败:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/workflow-order', (req, res) => {
    try {
        const orderPath = path.join(__dirname, 'workflow', 'order.json');
        if (fs.existsSync(orderPath)) {
            const orderData = JSON.parse(fs.readFileSync(orderPath, 'utf8'));
            res.json(orderData);
        } else {
            res.json({ order: [] });
        }
    } catch (error) {
        console.error('读取工作流顺序失败:', error);
        res.status(500).json({ error: error.message });
    }
});

// 启动服务器
const PORT = process.env.PORT || 3005;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
}); 