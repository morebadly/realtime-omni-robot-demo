# Release Notes v0.7.2

本版本不统一改名为 CloudGenie，而是为未来用户自定义命名预留正式入口。

## 新增

- 在运行状态面板加入“用户命名预留”。
- 用户可以输入机器人实例昵称，例如 `CloudGenie`。
- 昵称保存到浏览器 `localStorage`，刷新页面后保留。
- 支持重置回默认 Demo 实例名。
- 行为日志记录命名与重置操作。

## 设计原则

- 平台名、Runtime 名、Model Adapter 名不被机器人实例昵称污染。
- 机器人昵称属于 Robot Identity / Robot Registry 的一部分。
- 当前版本先用浏览器本地存储模拟，后续应同步到账号体系或 Robot Registry。

## 后续建议

- 将昵称、头像、声音风格、默认角色、家庭成员称呼等统一放入 Robot Identity Profile。
- App 绑定机器人时展示命名流程。
- 多机器人场景下支持 `CloudGenie 01`、`CloudGenie Study`、`厨房小精灵` 等用户自定义实例名。
