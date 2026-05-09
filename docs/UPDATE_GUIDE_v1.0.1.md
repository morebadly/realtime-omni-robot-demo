# Update Guide v1.0.1

## Windows CMD

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run dev
```

如果提示找不到 `node_modules` 或 `dist`，可以忽略。

## 需要重点查看

1. 左侧新增的 Robot Registry 面板。
2. 切换不同机器人后，身份档案、运行状态、模型路由会跟随 active robot。
3. 新增机器人占位后，可以在身份档案里给它单独命名。

## 注意

当前多机器人仍是前端 Demo Registry，不是真实云端设备绑定。后续会把 Registry 挪到后端 Runtime API，并为每个机器人拆分权限、插件、模型配置和实时会话。
