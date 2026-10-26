# 香橙派文件与部署状态

用户确认旧 `CyberPet_OS` 源码保存在香橙派内，过去通过 SSH 远程开发。本次提供的 `gyztbsd` 文件夹没有该 Python 工程，当前也未建立香橙派连接，因此这里没有 `main_brain.py` 或可替代它的占位实现。

## 现在可以复制什么

如需在香橙派上运行本仓库已有的 Node 开发网关，应克隆整个仓库。`scripts/` 会引用 `src/runtime/`，不能只复制单个 `.mjs`。ESP32 草图用于 ESP32 编译上传，不是由香橙派直接执行的程序。

以下是 Debian/Ubuntu 类系统的手工部署参考，尚未在香橙派 ARM Linux 验证。需预装 Git 和满足 Vite 要求的 Node.js（例如 Node 22.12 或更新的兼容版本）及 npm。

```bash
git clone https://github.com/morebadly/realtime-omni-robot-demo.git
cd realtime-omni-robot-demo
npm install
npm run build
```

先以本地 Mock 方式运行 Pet Omni Gateway：

```bash
PET_OMNI_PROVIDER=local_mock \
PET_OMNI_CLOUD_ENABLED=0 \
PET_OMNI_REAL_PROVIDER_CALLS=0 \
PET_OMNI_ALLOW_CAMERA_UPLOAD=0 \
PET_OMNI_GATEWAY_HOST=127.0.0.1 \
npm run gateway:pet-omni
```

另开终端检查：

```bash
curl http://127.0.0.1:8021/health
```

预期 `ok=true`、`provider=local_mock`、`cloudEnabled=false`；全新且未设置相关密钥变量的环境下 `keyPresent=false`。健康检查不能证明串口、摄像头、麦克风或电机可用。

需要验证现有 Omni 协议模拟链路时，可在另一个终端运行：

```bash
LOCALDEV_OMNI_HOST=127.0.0.1 npm run mock:localdev
```

它提供 `ws://127.0.0.1:8000/omni/realtime`，只模拟媒体与协议，不访问 ESP32。这里保持回环监听；跨设备使用需要另行设计访问控制。仓库部分 `qwen-*` npm 脚本写了 Windows PowerShell 命令，不应直接当作 Linux 启动命令。

详见 [`PET_OMNI_GATEWAY.md`](../../docs/PET_OMNI_GATEWAY.md) 和 [`HARDWARE_INTEGRATION_GUIDE.md`](../../docs/HARDWARE_INTEGRATION_GUIDE.md)。这些步骤部署的是仓库已有网关，尚未连接旧 CyberPet_OS。

## 待从香橙派取回的内容

以下名称来自本地项目上下文，尚未通过香橙派实际文件核实；不能据此认为代码和模型一定完整。

| 需核对的路径 | 用途 |
| --- | --- |
| `~/CyberPet_OS/main_brain.py` | 旧设备运行入口 |
| `config.yaml` | 串口、设备与服务配置；入库前需提取不含密钥和私人联系人的示例 |
| `core/` | 事件总线、状态、串口桥、仲裁 |
| `perception/` | 摄像头、音频、触摸 |
| `cognition/` | 对话、行为、记忆等旧逻辑 |
| `expression/` | 表情、语音和动作封装 |
| `tools/` | 模型准备、人脸入库和可能存在的诊断工具 |
| 依赖清单及启动配置 | 实际包版本、环境变量说明、服务入口 |
| `assets/` 的模型名称和来源 | 下载方式与版本清单；不直接上传大模型文件 |

后续应只读取已存在的源码，在工作副本中排除 API 密钥、密码、私人邮箱与联系人、人脸照片/向量库、长期记忆、录音、日志、SSH 私钥、虚拟环境和缓存。原配置应留在设备上，仓库只存脱敏示例。模型是否允许分发需要先核实来源。

取回源码和做 Omni/设备集成是两件事。旧实现采用的语音与情绪识别架构与当前 Omni 仓库不同，后续应经设备 Runtime / Gateway 边界适配，并核对当前 ESP32 的 4 项 EDGE、1 项 BUMP、触摸引脚和串口命令。
