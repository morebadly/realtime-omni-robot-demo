# 香橙派源码与部署说明

[`CyberPet_OS/`](CyberPet_OS/) 已收录从香橙派真实工作区导出的设备程序，包括 24 个 Python 源文件、原依赖清单、脱敏配置、模型下载工具和资源目录说明。它是现有样机的 Python 实现，与仓库的 Web/Omni 控制台分别保存，本次不改设备行为或模型调用方式。

## 复制到香橙派的文件

需要旧设备运行时时，复制完整 `CyberPet_OS/` 目录到香橙派，例如 `~/CyberPet_OS/`。不要只复制 `main_brain.py`；它会导入 `core/`、`perception/`、`cognition/`、`expression/`。`tools/` 用于模型准备和本地人脸入库。

导出不包含原 `config.yaml`、密钥、私人联系人、人脸库、记忆数据库、录音、日志、虚拟环境和模型权重。来源与哈希清单见 [`EXPORT_MANIFEST.md`](CyberPet_OS/EXPORT_MANIFEST.md)。两处源码仅在导出副本中替换了私人称呼/联系人示例，设备原件保持不变。

已有运行中的香橙派应保留现有项目和私人配置，先把这份副本放入独立目录核对，避免覆盖正在使用的文件。

## 新环境准备

以下是 Debian/Ubuntu 类系统、Python 3.10 环境的手工准备步骤，未在新设备上重装验证；不是自动启动脚本。

```bash
cd ~/CyberPet_OS
sudo apt-get install python3-venv python3-dev build-essential libportaudio2 libasound2-dev
python3 -m venv venv
source venv/bin/activate
python -m pip install -r requirements-device.txt
cp config.yaml.example config.yaml
```

`requirements.txt` 保留了设备导出的原内容；`requirements-device.txt` 额外补入代码实际引用的 `sherpa-onnx`。原依赖大多只有版本下限，本次没有取回完整环境锁文件，不能把它当作精确复现的包版本。ARM Linux 若没有匹配的 wheel，需要按对应包的官方安装说明处理。

在本机编辑 `config.yaml`，填写自己使用的串口、音频/摄像头设备、模型路径和服务配置。该旧运行时直接读取 YAML 中的密钥字段，没有自动展开 `${ENV_VAR}` 的逻辑；密钥仅填写在被 Git 忽略的本地配置里。OpenClaw 地址及鉴权、联系人也由设备使用者在本地填写。

模型文件不在仓库中。对照 [`assets/README.md`](CyberPet_OS/assets/README.md)、配置与 [`tools/download_models.py`](CyberPet_OS/tools/download_models.py) 准备实际权重。工具能处理部分 YuNet/FER+、SenseVoice 和 Silero VAD 下载；当前配置默认的 HSEmotion `enet_b2_8.onnx`、KWS 模型与可选 MobileFaceNet 仍需按来源手动准备。下载脚本不代表所有资源都已齐备，本次没有下载或测试权重。

`assets/wake_word/my_keywords.txt.example` 是格式示例，需结合实际 KWS 模型与 tokens 设置自己的唤醒词文件；人脸入库、记忆数据应只在本地创建。若用户需要硬件运行，再在配置和资源就绪后手动执行：

```bash
source venv/bin/activate
python main_brain.py
```

这条启动命令会初始化设备子系统，并可能访问硬件和配置的云服务。本次只做静态验证，没有执行该命令，也没有烧录或实机测试。

## 与 ESP32 的对应关系

- USB-UART、115200、8N1、UTF-8 单行 JSON，以 `\n` 结束；实际串口路径现场确认。
- Python 的 `SerialBridge` 提供 `SET_MOTOR`、`SET_SERVO`、`SERVO_SEQ`、`SET_EXPR`、`SET_REFLEX`、`STOP_ALL`、`RESUME` 等接口，调试行和 JSON 共用串口。
- 当前 Python 行为逻辑按 4 项 EDGE `[FL, FR, RL, RR]`、1 项后方 BUMP 处理，与用户指定的“原版”固件布局一致；这只是静态协议对应核对，不等于实机验证。
- ESP32 草图在 [`../esp32/esp32_cerebellum/`](../esp32/esp32_cerebellum/)。固件目前保留 `MOTOR_TB6612_A_DEAD=1` 的样机接法，详见 [`ESP32 说明`](../esp32/README.md)。

本次没有把 Web 按钮连接到 Python 串口桥。旧 ASR/LLM/TTS 路径与原生实时 Omni 是不同实现，后续集成应经过 Device Runtime / Gateway，不能把旧 TTS 直接放入主 Omni 输出链。

## 另行部署仓库已有的 Node Mock 网关

如果需要的是仓库现有 Node 网关，克隆整个仓库：`scripts/` 会引用 `src/runtime/`，不能只复制单个 `.mjs`。预装 Git、兼容的 Node.js（例如 22.12 或更新的兼容版本）与 npm 后：

```bash
git clone https://github.com/RRRh66/realtime-omni-robot-demo.git
cd realtime-omni-robot-demo
npm install
npm run build
PET_OMNI_PROVIDER=local_mock \
PET_OMNI_CLOUD_ENABLED=0 \
PET_OMNI_REAL_PROVIDER_CALLS=0 \
PET_OMNI_ALLOW_CAMERA_UPLOAD=0 \
PET_OMNI_GATEWAY_HOST=127.0.0.1 \
npm run gateway:pet-omni
```

另开终端检查 `curl http://127.0.0.1:8021/health`，预期 `ok=true`、`provider=local_mock`、`cloudEnabled=false`。这只说明 Mock 网关可用，不能证明设备硬件可用。本次没有在香橙派执行这些 Node 命令。

需要模拟 Omni 协议链路时，可另开终端执行 `LOCALDEV_OMNI_HOST=127.0.0.1 npm run mock:localdev`，端点为 `ws://127.0.0.1:8000/omni/realtime`。它不会访问 ESP32。跨设备使用需另行设计访问控制；部分 `qwen-*` npm 脚本是 Windows PowerShell 写法，不应直接当作 Linux 启动命令。

网关细节见 [`PET_OMNI_GATEWAY.md`](../../docs/PET_OMNI_GATEWAY.md)，后续硬件集成边界见 [`HARDWARE_INTEGRATION_GUIDE.md`](../../docs/HARDWARE_INTEGRATION_GUIDE.md)。
