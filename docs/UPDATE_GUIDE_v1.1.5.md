# Update Guide v1.1.5

## 更新目标

把 v1.1.4 的长页面调试 UI 升级为点击式工作台，重点改善插件中心和整体页面长度。

## 更新步骤

```cmd
rmdir /s /q node_modules
rmdir /s /q dist
npm install
npm run build
npm run dev
```

## 验收方式

1. 顶部 Debug Navigator 点击后会切换视图，而不是只滚动到页面下方。
2. 默认实时控制页面不再展开插件中心、权限中心和日志。
3. 点击“插件中心”后进入独立 Plugin Workbench。
4. 插件中心内部可在“已安装插件 / 新增无代码插件 / 新增代码插件 / 动作库”之间切换。
5. 已安装插件中的 manifest 默认折叠，页面高度明显降低。
6. `npm run build` 通过。
