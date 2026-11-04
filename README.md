# 暗区突袭 · 3D 射击闯关 (v2)

十关递进的本机／公网可玩 First-Person 射击小游戏。Three.js 单页，零后端，GitHub Pages 托管。

## 游玩

- 公网：https://lhj77432-ux.github.io/game-3d-shooter/
- 电脑：WASD 移动 · 鼠标瞄准 · 左键射击 · R 换弹 · Esc 暂停
- 手机：左摇杆移动 · 右半屏拖视角 · 开火／换弹按钮

## 关卡

1. 靶场教学（静止靶）  
2. 开阔移动靶  
3. 掩体走廊  
4. 限弹两波  
5. 中型头目  
6. 近战冲锋巷  
7. 高台俯射  
8. 限时清场 60s  
9. 混合编队  
10. 终局头目 + 护卫  

进度保存在浏览器 `localStorage`（`darkzone_v2_progress`）。

## 技术

- Three.js 0.160（CDN import map）
- WebAudio 合成音效（无版权素材）
- 程序化网格材质／低多边形科幻军事风
- 触控＋指针锁定双端输入

## 本地预览

```bash
python3 -m http.server 8765 --directory .
# 打开 http://127.0.0.1:8765/
```

勿与 `vocab-share` 混淆；本仓仅此小游戏。
