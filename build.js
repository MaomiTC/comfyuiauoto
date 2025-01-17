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
    'phtoshopPython'
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
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify({
            comfyuiPath: ''
        }, null, 2));
        console.log('Created config.json');
    }
}

// 确保工作流目录中有默认工作流文件
function ensureDefaultWorkflow() {
    const workflowPath = path.join(__dirname, 'workflow', 'default.json');
    if (!fs.existsSync(workflowPath)) {
        const defaultWorkflow = {
            nodes: {},
            connections: []
        };
        fs.writeFileSync(workflowPath, JSON.stringify(defaultWorkflow, null, 2));
        console.log('Created default workflow file');
    }
}

// 主构建函数
async function build() {
    try {
        console.log('Starting build process...');

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