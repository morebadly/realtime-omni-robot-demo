# Update Guide v1.1.4

## 更新方式

将 v1.1.4 包覆盖到 v1.1.3 项目目录后执行：

```bash
npm install
npm run build
```

## 建议提交

```bash
git status
git add .
git commit -m "chore: improve debug UI navigation and visible context layout"
git tag v1.1.4
git push
git push origin v1.1.4
```

## 主要文件变化

- `src/App.jsx`
- `src/components/DebugNavigation.jsx`
- `src/components/VisibleContext.jsx`
- `src/styles/app.css`
- `package.json`
- `docs/RELEASE_NOTES_v1.1.4.md`
- `docs/UPDATE_GUIDE_v1.1.4.md`

## 注意事项

v1.1.4 只优化 UI 和调试导航，不改变实时通讯协议。后续如果继续做真实云端 Omni 或自动 VAD/AEC 打断，应基于 v1.1.3/v1.1.4 已有状态机继续推进。
