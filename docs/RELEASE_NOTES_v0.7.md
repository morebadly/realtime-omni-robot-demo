# Release Notes v0.7

## 核心目标

v0.7 继续把 Demo 从“页面展示”往“Runtime 平台骨架”推进，重点补上三个能力：模型可配置、代码插件雏形、插件权限执行守卫。同时修复待机表情过于怪异的问题。

## 新增

- 新增 `ModelProviderPanel.jsx`：模型接入中心。
- 新增 `src/runtime/permissionEngine.js`：统一权限检查。
- 新增 `src/runtime/codePluginSandbox.js`：浏览器 Web Worker 代码插件 Demo 沙箱。
- `modelAdapters.js` 增加 Adapter Profile：Provider 名称、Endpoint、Model ID、API Key、Transport、能力声明。
- 插件中心新增“代码插件”创建入口。
- 代码插件可以写 JS 函数体，返回动作数组，例如：

```js
if (ctx.event?.type === 'touch.event' && ctx.event.area === 'head') {
  return [
    toolkit.action.expression('happy'),
    toolkit.action.say('这是代码插件返回的摸头回应。'),
    toolkit.action.motion('tail_wag')
  ];
}
return [];
```

## 变更

- `PluginEngine` 改为异步执行，以便支持代码插件沙箱。
- 插件执行前检查 `plugin.run`。
- 每个事实事件进入 Runtime 前检查读取权限，例如 `touch.read`、`nfc.read`、`camera.read`、`voice.input`。
- 每个动作执行前检查动作所需权限，例如 `voice.output`、`robot.expression.write`、`home.ac.write`。
- 关闭权限后，动作不会执行，并会在行为日志里显示被阻止的原因。
- Omni I/O Inspector 移除“情绪置信度百分比”，改为显示机器人表情、表情来源和状态语气。
- 待机表情改成较短的发光胶囊眼，减少奇怪的瞪眼感。

## 保留

- LocalDevOmniAdapter / ThirdPartyCloudOmniAdapter / SelfHostedCloudOmniAdapter / OfflinePetEngine。
- 原始音频直给 Omni、摄像头关键帧直给 Omni、触摸/NFC 只作为事实事件的输入原则。
- 无代码插件多动作编排。
- 工具入口收敛到插件动作库。

## 注意

当前代码插件沙箱是浏览器 Demo 级别：它使用 Web Worker、超时终止和有限 toolkit，但还不是生产级安全沙箱。正式产品需要更强的隔离、权限、资源限制和签名机制。
