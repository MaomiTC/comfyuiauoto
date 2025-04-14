const fs = require('fs');
const path = require('path');

// 确保必要的目录存在
const requiredDirs = [
    'public',
    'public/saved_images',
    'public/original_images',
    'temp',
    'preset',
    'workflow',
    'public/image',
    'phtoshopPython',
    'assets'
];

// 创建必要的目录
function createDirectories() {
    requiredDirs.forEach(dir => {
        const dirPath = path.join(__dirname, dir);
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            console.log(`Created directory: ${dirPath}`);
        }
    });
}

// 确保配置文件存在
function ensureConfigFile() {
    const configPath = path.join(__dirname, 'config.json');
    try {
        if (!fs.existsSync(configPath)) {
            fs.writeFileSync(configPath, JSON.stringify({
                comfyuiPath: '',
                lastWorkflow: '',
                settings: {
                    theme: 'light',
                    language: 'en'
                }
            }, null, 2), 'utf8');
            console.log('Created config.json');
        }
    } catch (error) {
        console.error('Error creating config file:', error);
    }
}

// 确保工作流目录中有默认工作流文件
function ensureDefaultWorkflow() {
    const workflowPath = path.join(__dirname, 'workflow', 'default.json');
    try {
        if (!fs.existsSync(workflowPath)) {
            const defaultWorkflow = {
                nodes: {},
                connections: []
            };
            fs.writeFileSync(workflowPath, JSON.stringify(defaultWorkflow, null, 2));
            console.log('Created default workflow file');
        }
    } catch (error) {
        console.error('Error creating default workflow:', error);
    }
}

// 检查必要的文件
function checkRequiredFiles() {
    const requiredFiles = [
        'main.js',
        'server.js',
        'preload.js',
        'pieMenu.html',
        'package.json'
    ];

    requiredFiles.forEach(file => {
        const filePath = path.join(__dirname, file);
        if (!fs.existsSync(filePath)) {
            console.error(`Missing required file: ${file}`);
            process.exit(1);
        }
    });
}

// 主构建函数
async function build() {
    try {
        console.log('Starting build process...');

        // 检查必要的文件
        checkRequiredFiles();

        // 创建必要的目录
        createDirectories();

        // 确保配置文件存在
        ensureConfigFile();

        // 确保默认工作流存在
        ensureDefaultWorkflow();

        console.log('Build completed successfully!');
    } catch (error) {
        console.error('Build failed:', error);
        process.exit(1);
    }
}

// 执行构建
build(); 