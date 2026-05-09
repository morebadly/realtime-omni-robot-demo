# Update Guide v1.0.4

## 更新方式

直接用本版本覆盖旧项目目录，或解压成新的 `realtime-omni-robot-demo` 目录。

Windows CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
npm install
npm run dev
```

## 验证 per-robot 配置

1. 打开 `http://127.0.0.1:5173/`。
2. 在 Robot Registry 中点击某个 `robot_id`，进入该机器人的专属调控界面。
3. 在权限中心修改一个权限，例如关闭 `voice.output`。
4. 切换到另一台机器人，确认该权限仍保持另一台机器人的配置。
5. 切回原机器人，确认刚才的权限修改仍然存在。
6. 对插件启用状态和 Model Adapter 配置重复同样验证。

## 注意

v1.0.4 仍然是 Demo / Mock Runtime：

- 配置保存在浏览器 localStorage。
- 刷新页面会保留每台机器人的本地配置。
- 清理浏览器数据会清除这些 Demo 配置。
- 成熟产品中应由 Cloud Robot Registry / Runtime API / Robot Gateway 管理这些配置。
