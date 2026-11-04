# 3D 射击闯关

简易 3D 射击闯关（Three.js），桌面 + 手机触控，10 关逐步解锁。静态托管，无账号、不接 DeepSeek。

## 在线玩（GitHub Pages）

预期地址（需在仓库 Settings → Pages 启用后生效）：

**https://lhj77432-ux.github.io/game-3d-shooter/**

启用步骤（一次性）：
1. 打开 https://github.com/lhj77432-ux/game-3d-shooter/settings/pages
2. Build and deployment → Source：**Deploy from a branch**
3. Branch：**main** / folder：**/ (root)** → Save
4. 等 1～2 分钟后打开上面的链接

仓库：https://github.com/lhj77432-ux/game-3d-shooter

## 本地预览

```bash
python3 -m http.server 8765
```

浏览器打开 http://127.0.0.1:8765/

## 操作

**桌面**
- WASD 移动 · 鼠标瞄准 · 左键射击 · R 换弹 · Esc 暂停

**手机**
- 左下摇杆移动 · 右半屏拖动瞄准 · 右下开火／换弹

## 关卡（10 关顺序解锁）

1. 教学：静止靶 · 2. 移动靶 · 3. 掩体侧移 · 4. 双波限弹 · 5. Boss
6. 窄廊冲锋 · 7. 高台 · 8. 限时 60s · 9. 远程＋近战 · 10. 终关 Boss

进度：`localStorage` 键 `game3d_shooter_progress_v1`
