# v0.7 更新指南

## 从 v0.6 更新

建议直接解压 v0.7 更新包，进入项目目录后重新安装依赖：

```bash
rm -rf node_modules dist
npm install
npm run dev
```

Windows CMD：

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果 `rmdir` 提示找不到目录，可以忽略。

## 使用模型接入中心

1. 在页面中找到“模型接入中心”。
2. 选择 LocalDev / Wi‑Fi Cloud / eSIM Cloud / Self-hosted Cloud。
3. 修改 Endpoint、Model ID、Transport 或能力声明。
4. 点击“保存 Adapter 配置”。
5. 切换左侧运行模式后，机器人状态会使用对应 Adapter Profile。

当前“测试连接”是 Mock，只验证 UI 和 Runtime 流程。

## 使用代码插件

1. 在插件中心找到“新增代码插件”。
2. 选择触发器，例如“触摸：摸头”。
3. 编写 JS 函数体，返回动作数组。
4. 声明权限。
5. 添加插件后点击“测试运行”，或用左侧 Mock 事件触发。

代码插件只能返回动作意图，不能直接控制硬件。Runtime 会继续检查权限，最后由 Tool Engine / Mock Tool 执行动作。
