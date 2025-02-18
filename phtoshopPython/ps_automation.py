import os
from photoshop import Session
import tkinter as tk
from tkinter import filedialog, messagebox
from typing import List, Tuple
import sys

class PhotoshopAutomation:
    def __init__(self):
        self.app = Session()
        self.ps = self.app
        self.supported_formats = ('.jpg', '.jpeg', '.png', '.psd', '.tiff', '.tif')
        
    def select_images(self) -> List[str]:
        """选择图片文件"""
        root = tk.Tk()
        root.withdraw()  # 隐藏主窗口
        
        file_paths = filedialog.askopenfilenames(
            title='选择图片文件',
            filetypes=[
                ('图片文件', '*.jpg;*.jpeg;*.png;*.psd;*.tiff;*.tif'),
                ('所有文件', '*.*')
            ]
        )
        
        return [f for f in file_paths if os.path.splitext(f)[1].lower() in self.supported_formats]

    def create_new_document(self, width: int = 1920, height: int = 1080) -> None:
        """创建新的Photoshop文档"""
        doc = self.ps.app.documents.add(
            width=width,
            height=height,
            resolution=72,
            name="新建文档"
        )
        return doc

    def import_image_as_layer(self, image_path: str, document=None) -> None:
        """将图片导入为新图层"""
        try:
            if document is None:
                document = self.ps.active_document
                
            # 创建新图层
            layer_name = os.path.basename(image_path)
            art_layer = document.artLayers.add()
            art_layer.name = layer_name

            # 将图片放置到图层
            # 使用JavaScript方式导入
            js_code = f'''
            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), new File("{image_path.replace('\\', '\\\\')}"));
            executeAction(idPlc, desc, DialogModes.NO);
            '''
            self.ps.app.doJavaScript(js_code)
            
            return True
        except Exception as e:
            print(f"导入图片时出错: {str(e)}")
            return False

    def process_images(self, image_paths: List[str]) -> None:
        """处理多个图片"""
        if not image_paths:
            messagebox.showwarning("警告", "未选择任何图片")
            return

        try:
            # 创建新文档
            doc = self.create_new_document()
            
            # 导入每张图片
            for image_path in image_paths:
                success = self.import_image_as_layer(image_path, doc)
                if not success:
                    messagebox.showerror("错误", f"导入图片失败: {image_path}")
                    
            messagebox.showinfo("成功", "图片导入完成")
            
        except Exception as e:
            messagebox.showerror("错误", f"处理图片时出错: {str(e)}")

def open_image(image_path):
    """打开指定图片到Photoshop"""
    try:
        print(f"Opening image: {image_path}")
        with Session() as ps:
            # 检查是否有当前文档
            try:
                doc = ps.app.activeDocument
                print("Using existing document")
            except Exception:
                # 如果没有活动文档，创建新文档
                print("Creating new document")
                doc = ps.app.documents.add(
                    width=1920,
                    height=1080,
                    resolution=72,
                    name="新建文档"
                )
            
            # 创建新图层
            layer = doc.artLayers.add()
            layer.name = os.path.basename(image_path)
            print(f"Created new layer: {layer.name}")

            # 将图片放置到图层
            js_code = f'''
            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), new File("{image_path.replace('\\', '\\\\')}"));
            executeAction(idPlc, desc, DialogModes.NO);
            '''
            ps.app.doJavaScript(js_code)
            print("Successfully placed image in Photoshop")
            
            return True
    except Exception as e:
        print(f"Error opening image in Photoshop: {str(e)}")
        return False

if __name__ == "__main__":
    if len(sys.argv) > 1:
        image_path = sys.argv[1]
        print(f"Received image path: {image_path}")
        success = open_image(image_path)
        sys.exit(0 if success else 1)
    else:
        print("No image path provided")
        sys.exit(1) 