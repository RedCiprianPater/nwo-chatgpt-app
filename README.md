# NWO Robotics MCP Server

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-green.svg)](https://modelcontextprotocol.io)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/RedCiprianPater/nwo-chatgpt-app)
[![Live on Render](https://img.shields.io/badge/hosted-Render-purple.svg)](https://nwo-chatgpt-app.onrender.com)

Control real robots, IoT devices, and autonomous agent swarms through natural language — powered by the [NWO Robotics API](https://nwo.capital).

This is a remote **Model Context Protocol (MCP)** server. Connect it to any MCP-compatible AI client (ChatGPT, Claude, Cursor, etc.) and start controlling robots instantly — no local installation required.

---

## MCP Endpoint

```
https://nwo-chatgpt-app.onrender.com/mcp
```

| Route | Purpose |
|-------|---------|
| `POST /mcp` | MCP Streamable HTTP transport |
| `GET  /health` | Health check |
| `GET  /.well-known/mcp/server-card.json` | Smithery server metadata |

---

## Connecting

### ChatGPT (OpenAI Apps)
1. Go to **ChatGPT → Settings → Apps → Add App**
2. Enter: `https://nwo-chatgpt-app.onrender.com/mcp`
3. Start chatting with your robots

### Claude / Cursor / other MCP clients
Add to your MCP config:
```json
{
  "mcpServers": {
    "nwo-robotics": {
      "url": "https://nwo-chatgpt-app.onrender.com/mcp",
      "headers": {
        "X-API-Key": "your_nwo_api_key",
        "X-Agent-Id": "your_agent_id"
      }
    }
  }
}
```

### Smithery
Find it at [smithery.ai](https://smithery.ai) → search **NWO Robotics**

---

## Tools (64 total)

### 🤖 VLA Inference & Models
Send natural language instructions + camera images, receive joint action vectors in real time.

| Tool | Description |
|------|-------------|
| `vla_inference` | Run VLA inference: instruction + images → joint actions |
| `edge_inference` | Ultra-low-latency inference via Cloudflare edge (28ms avg) |
| `list_models` | List all available VLA models |
| `get_model_info` | Get detailed info for a specific model |
| `get_streaming_config` | Get WebSocket streaming configuration |

Supported models: `xiaomi-robotics-0` · `pi05` · `groot_n1.7` · `deepseek-ocr-2b`

---

### 🦾 Robot Control & State

| Tool | Description |
|------|-------------|
| `query_robot_state` | Joint angles, gripper state, position, battery |
| `execute_actions` | Execute pre-computed joint action sequences |
| `sensor_fusion` | VLA inference with camera + lidar + thermal + force + GPS |
| `robot_query` | Quick status: active/idle, battery, current task |
| `get_agent_status` | Tasks completed and success rate |

---

### 🗺️ Task Planning & Learning

| Tool | Description |
|------|-------------|
| `task_planner` | Decompose complex instruction into ordered subtasks |
| `execute_subtask` | Execute one subtask from a multi-step plan |
| `status_poll` | Poll task progress and completion status |
| `learning_recommend` | Get technique recommendations for a task type |
| `learning_log` | Log execution result so the model learns from it |

---

### 🔑 Agent Management

| Tool | Description |
|------|-------------|
| `register_agent` | Self-register, get API key + 100k free monthly calls |
| `check_balance` | Check quota: used, remaining, tier, expiry |
| `pay_upgrade` | Pay ETH to upgrade tier |
| `create_wallet` | Create MoonPay wallet for credit card funding |
| `register_robot` | Register a robot in the NWO system |
| `update_agent` | Update robot capabilities or status |
| `get_agent_info` | Get full agent profile and stats |

**Quota tiers:**

| Tier | Calls/month | Cost |
|------|------------|------|
| Free | 100,000 | $0 |
| Prototype | 500,000 | ~0.015 ETH/mo |
| Production | Unlimited | ~0.062 ETH/mo |

---

### 🔍 Agent Discovery

| Tool | Description |
|------|-------------|
| `nwo_health` | Check NWO API health |
| `nwo_whoami` | Get identity and quota for current API key |
| `discover_capabilities` | All execution modes, robot types, models, sensors |
| `dry_run` | Validate task feasibility without executing |
| `plan_task` | Generate phased execution plan |

---

### 🔌 ROS2 Bridge — Physical Robots

| Tool | Description |
|------|-------------|
| `ros2_list_robots` | List connected physical robots |
| `ros2_robot_status` | Live status: battery, joints, last update |
| `ros2_send_command` | Send named joint command |
| `ros2_submit_action` | Submit VLA action sequence |
| `ros2_emergency_stop` | Stop one robot (10ms response) |
| `ros2_emergency_stop_all` | Stop ALL robots immediately |
| `ros2_get_robot_types` | Supported types: UR5e, Panda, Spot, G1... |

---

### 🧪 Physics Simulation

| Tool | Description |
|------|-------------|
| `simulate_trajectory` | Simulate with physics — feasibility + warnings |
| `check_collision` | Check for environment collisions |
| `estimate_torques` | Estimate joint torques for a payload |
| `validate_grasp` | Check grasp stability for shape + mass + force |
| `plan_motion` | Collision-free motion planning with MoveIt2 |
| `get_scene_library` | Available simulation scenes |
| `generate_scene` | Generate synthetic scenes with NVIDIA Cosmos 3 |

---

### 📐 Embodiment & Calibration

| Tool | Description |
|------|-------------|
| `list_embodiments` | Browse the robot embodiment registry |
| `get_robot_specs` | DOF, joint limits, sensors, max speed |
| `get_normalization` | Joint normalization params for VLA inference |
| `download_urdf` | Get URDF model for a robot type |
| `get_test_results` | LIBERO / CALVIN / SimplerEnv benchmarks |
| `compare_robots` | Side-by-side comparison of robot types |
| `run_calibration` | Automatic joint offset calibration |
| `calibrate_confidence` | Map model confidence to success probability |

---

### 🧠 Online RL & Fine-Tuning

| Tool | Description |
|------|-------------|
| `start_rl_training` | Start online RL session with custom rewards |
| `submit_rl_telemetry` | Stream state/action/reward data |
| `create_finetune_dataset` | Build dataset from logged executions |
| `start_finetune_job` | Launch LoRA fine-tuning on a VLA model |

---

### 🖐️ Tactile Sensing (ORCA Hand)

| Tool | Description |
|------|-------------|
| `read_tactile` | Read 256-taxel sensor arrays per finger |
| `process_tactile` | Assess grip quality, texture, recommended force |
| `detect_slip` | Detect object slip in real time |

---

### 📦 Dataset Hub

| Tool | Description |
|------|-------------|
| `list_datasets` | 1.54M+ Unitree G1 demonstrations, 430+ hours, LeRobot format |

---

### 🫀 Cardiac Blockchain Identity (Base Mainnet)

AI agents receive a permanent soul-bound Digital ID (`rootTokenId`) on Base mainnet (Chain ID 8453).

| Tool | Description |
|------|-------------|
| `cardiac_register_agent` | Register on-chain, get rootTokenId |
| `cardiac_identify_agent` | Look up rootTokenId by API key hash |
| `cardiac_renew_key` | Renew API key binding on-chain |
| `cardiac_issue_credential` | Issue verifiable credential (task_auth, swarm_cmd...) |
| `cardiac_check_credential` | Check if credential is valid |
| `cardiac_grant_access` | Grant location access |
| `cardiac_get_nonce` | Get EIP-712 nonce for signing |
| `cardiac_check_access` | Check location access permission |
| `cardiac_payment_process` | Process payment via smart contract |

**Deployed contracts (Base Mainnet):**
- `NWOIdentityRegistry` — `0x78455AFd5E5088F8B5fecA0523291A75De1dAfF8`
- `NWOAccessController` — `0x29d177bedaef29304eacdc63b2d0285c459a0f50`
- `NWOPaymentProcessor` — `0x4afa4618bb992a073dbcfbddd6d1aebc3d5abd7c`

---

### 🔮 Cardiac Oracle

| Tool | Description |
|------|-------------|
| `oracle_health` | Check oracle health and chain status |
| `oracle_validate_ecg` | Validate ECG biometric for human identity |
| `oracle_hash_ecg` | Compute cardiac hash from RR intervals |
| `oracle_verify` | Verify recent ECG validation by hash |

---

## Example Commands

```
"Pick up the red box from the table and place it on shelf B"
"What is the temperature in warehouse zone 3?"
"Run a safety check before moving robot_001 to the loading dock"
"Deploy all available robots to patrol the perimeter"
"What grip technique should I use for fragile glass objects?"
"Register me as a new agent with wallet 0x123..."
"Start a LoRA fine-tuning job on xiaomi-robotics-0"
```

---

## Tech Stack

- **Runtime**: Node.js (ES Modules)
- **Transport**: MCP Streamable HTTP (`@modelcontextprotocol/sdk`)
- **Framework**: Express + Helmet + CORS
- **Hosting**: Render (starter plan, always-on)
- **Schema validation**: Zod
- **Blockchain**: Base Mainnet (Chain ID 8453) via NWO Relayer + Oracle

---

## Self-Hosting

```bash
git clone https://github.com/RedCiprianPater/nwo-chatgpt-app.git
cd nwo-chatgpt-app
npm install

# Create .env
echo "NWO_API_KEY=sk_live_your_key" >> .env
echo "NWO_AGENT_ID=agent_your_id" >> .env
echo "NWO_RELAYER_SECRET=your_relayer_secret" >> .env
echo "NWO_ORACLE_SECRET=your_oracle_secret" >> .env

npm start
# Server runs on http://localhost:10000
```

---

## Project Structure

```
nwo-chatgpt-app/
├── src/
│   └── mcp-server.js     # Main MCP server (all 64 tools)
├── docs/
│   ├── README.md         # Technical docs
│   └── SUBMISSION.md     # OpenAI submission guide
├── ui/                   # UI assets
├── package.json
├── render.yaml           # Render deployment config
├── PRIVACY.md
└── LEGAL.md
```

---

## Documentation

- [Agent Skill File](https://nwo.capital/webapp/agent.md) — full API reference
- [API Docs](https://nwo.capital/webapp/nwo-robotics.html)
- [Cardiac API Docs](https://nwo.capital/webapp/nwo-cardiac.html)
- [OpenAPI Spec](https://nwo.capital/openapi.yaml)
- [Cardiac SDK](https://github.com/RedCiprianPater/nwo-cardiac-sdk)
- [Live Demo](https://huggingface.co/spaces/PUBLICAE/nwo-robotics-api-demo)
- [Privacy Policy](PRIVACY.md)
- [Terms of Service](LEGAL.md)

---

## Links

- 🌐 [NWO Capital](https://nwo.capital)
- 🔑 [Get API Key](https://nwo.capital/webapp/api-key.php)
- 🧬 [Cardiac Portal](https://nwocardiac.cloud)
- 📦 [PyPI Package](https://pypi.org/project/nwo-robotics/)
- 🤗 [HuggingFace Demo](https://huggingface.co/spaces/PUBLICAE/nwo-robotics-api-demo)

---

## Support

- 📧 [support@nwo.capital](mailto:support@nwo.capital)
- 🐛 [Open an Issue](https://github.com/RedCiprianPater/nwo-chatgpt-app/issues)

---

## License

MIT License — see [LICENSE](LICENSE) for details.
