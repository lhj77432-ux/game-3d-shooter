# 3D 射击闯关

简易 3D 射击闯关（Three.js），桌面 + 手机触控，10 关逐步解锁。静态托管，无账号、不接 DeepSeek。

## 在线玩

部署到 GitHub Pages 后打开仓库 Pages 地址（见仓库 About / Settings → Pages）。

本地预览：

```bash
python3 -m http.server 8765
```

浏览器打开 http://127.0.0.1:8765/

## 操作

**桌面**
- WASD 移动
- 鼠标瞄准（点击画布锁定指针）
- 左键射击
- R 换弹
- Esc 暂停

**手机**
- 左下虚拟摇杆移动
- 右半屏拖动瞄准
- 右下「开火」／「换弹」

## 关卡（10 关顺序解锁）

1. 教学：静止靶
2. 3 个移动靶
3. 掩体 + 侧移射击怪
4. 两波 + 限弹
5. 多血量 Boss
6. 窄廊近战冲锋
7. 高台清下方敌人
8. 限时 60 秒
9. 远程 + 近战混合
10. 终关 Boss + 小怪

进度保存在浏览器 `localStorage`（键名 `game3d_shooter_progress_v1`）。

## 文件

- `index.html` — 页面与 HUD
- `style.css` — 样式与触控控件
- `game.js` — Three.js 游戏逻辑与 10 关数据
