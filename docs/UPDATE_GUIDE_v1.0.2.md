# Update Guide v1.0.2

## 更新方式

直接用本压缩包覆盖旧项目目录，或解压成新的 `realtime-omni-robot-demo` 目录。

Windows CMD：

```cmd
cd C:\Users\Administrator\Desktop\realtime-omni-robot-demo
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果提示找不到 `node_modules` 或 `dist`，可以忽略。

## 验证删除机器人

1. 打开 `http://localhost:5173/`。
2. 在左侧 `Robot Registry` 面板点击“新增机器人占位”。
3. 点击某个机器人卡片右上角的“删除”。
4. 确认后，该机器人会从列表消失。
5. 如果删除的是当前 active robot，页面会自动切换到下一个机器人。
6. 当列表只剩一个机器人时，删除按钮会禁用，防止没有 active robot。

## 注意

当前删除只作用于浏览器本地 Demo 数据。后期接真实云端 Robot Registry 时，需要区分：

- 从当前用户账号解绑机器人；
- 删除云端注册记录；
- 注销设备证书；
- 清理或保留历史日志；
- 迁移或删除机器人身份档案。
