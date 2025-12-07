#!/usr/bin/env python3
"""
Script để generate icons cho Data Scraper extension
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Cần cài đặt Pillow: pip install Pillow")
    exit(1)

import os

def create_icon(size, output_path):
    """Tạo icon với kích thước cho trước"""
    # Tạo image với background gradient
    img = Image.new('RGB', (size, size), color='#667eea')
    draw = ImageDraw.Draw(img)
    
    # Vẽ background gradient đơn giản
    for i in range(size):
        ratio = i / size
        r = int(102 + (118 - 102) * ratio)  # 667eea -> 764ba2
        g = int(126 + (75 - 126) * ratio)
        b = int(234 + (162 - 234) * ratio)
        draw.rectangle([(0, i), (size, i+1)], fill=(r, g, b))
    
    # Vẽ biểu tượng data/scraper (database/table icon)
    margin = size // 4
    center_x, center_y = size // 2, size // 2
    
    # Vẽ hình database/table
    if size >= 48:
        # Vẽ các đường ngang (table rows)
        row_height = size // 6
        for i in range(3):
            y = center_y - row_height + (i * row_height)
            draw.rectangle(
                [margin, y, size - margin, y + 2],
                fill='white'
            )
        
        # Vẽ các đường dọc (table columns)
        col_width = (size - 2 * margin) // 4
        for i in range(1, 4):
            x = margin + (i * col_width)
            draw.rectangle(
                [x, center_y - row_height, x + 1, center_y + row_height * 2],
                fill='white'
            )
    else:
        # Icon nhỏ: vẽ đơn giản hơn
        draw.rectangle(
            [margin, center_y - 2, size - margin, center_y + 2],
            fill='white'
        )
        draw.rectangle(
            [center_x - 2, margin, center_x + 2, size - margin],
            fill='white'
        )
    
    # Lưu file
    img.save(output_path, 'PNG')
    print(f"✅ Đã tạo: {output_path} ({size}x{size})")

def main():
    # Tạo thư mục icons nếu chưa có
    icons_dir = 'icons'
    os.makedirs(icons_dir, exist_ok=True)
    
    # Tạo các icon với kích thước khác nhau
    sizes = [16, 48, 128]
    
    for size in sizes:
        output_path = os.path.join(icons_dir, f'icon{size}.png')
        create_icon(size, output_path)
    
    print("\n🎉 Đã tạo xong tất cả icons!")

if __name__ == '__main__':
    main()

