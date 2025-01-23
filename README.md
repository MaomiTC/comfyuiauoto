1. 启动 ComfyUI
目前，ComfyUI 仅支持在 8188 端口上运行。此外，软件还需要占用 3001 和 3005 端口。请确保这些端口未被其他应用程序占用。

检查端口占用：
在 Windows 上，可以使用以下命令检查端口占用情况：

bash
复制
netstat -ano | findstr :8188
netstat -ano | findstr :3001
netstat -ano | findstr :3005
如果端口被占用，请终止占用端口的进程或修改 ComfyUI 的配置文件以使用其他端口。

2. 安装 ComfyUI 插件
为了使用 ComfyUI 的扩展功能，您需要安装以下插件：

ComfyUI-ETN 插件：该插件提供了 ETN ImageWebSocketOutput 输出节点和 Load Mask (Base64) 节点。

插件 GitHub 地址：ComfyUI-ETN

安装步骤：
克隆或下载插件仓库到本地。

将插件文件夹放置到 ComfyUI 的 plugins 目录下。

重启 ComfyUI，确保插件加载成功。

3. 使用节点
ETN ImageWebSocketOutput：作为输出节点，用于将处理后的图像通过 WebSocket 输出。

Load Mask (Base64)：作为 Mask 输入节点，用于加载 Base64 编码的 Mask 图像。

原生 LoadImage：作为图像输入节点，用于加载普通图像。

节点连接示例：
使用 LoadImage 节点加载输入图像。

使用 Load Mask (Base64) 节点加载 Mask 图像。

将处理后的图像通过 ETN ImageWebSocketOutput 节点输出。

4. 导出 API 工作流
完成节点配置后，您可以将工作流导出为 workflow 文件，以便后续使用或分享。

5. Windows 版本 EXE 下载
为了方便 Windows 用户使用，ComfyUI 的 Windows 版本 EXE 文件已上传至以下链接：

下载地址：https://pan.quark.cn/s/8a05d3903db2
