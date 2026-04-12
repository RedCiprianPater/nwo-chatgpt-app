import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";
import "dotenv/config";

// ─── Base URLs ────────────────────────────────────────────────────────────────
const NWO_BASE     = "https://nwo.capital/webapp";
const ROS2_BASE    = "https://nwo-ros2-bridge.onrender.com";
const EDGE_BASE    = "https://nwo-robotics-api-edge.ciprianpater.workers.dev";
const ORACLE_BASE  = "https://nwo-oracle.onrender.com";
const RELAYER_BASE = "https://nwo-relayer.onrender.com";

const PORT = process.env.PORT || 3000;

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(url, { method = "GET", headers = {}, body, params } = {}) {
  const u = new URL(url);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    });
  }
  const res = await fetch(u.toString(), {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text, status: res.status }; }
}

// Shorthand for NWO Capital endpoints (requires X-API-Key)
function nwo(apiKey, path, opts = {}) {
  return apiFetch(`${NWO_BASE}${path}`, {
    ...opts,
    headers: { "X-API-Key": apiKey, ...(opts.headers || {}) },
  });
}

// Shorthand for ROS2 bridge
function ros2(apiKey, path, opts = {}) {
  return apiFetch(`${ROS2_BASE}${path}`, {
    ...opts,
    headers: { "X-API-Key": apiKey, ...(opts.headers || {}) },
  });
}

// Shorthand for Relayer
function relayer(secret, path, opts = {}) {
  return apiFetch(`${RELAYER_BASE}${path}`, {
    ...opts,
    headers: { "X-Relayer-Secret": secret, ...(opts.headers || {}) },
  });
}

// Shorthand for Oracle
function oracle(secret, path, opts = {}) {
  return apiFetch(`${ORACLE_BASE}${path}`, {
    ...opts,
    headers: { "X-Oracle-Secret": secret, ...(opts.headers || {}) },
  });
}

function ok(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// ─── MCP Server factory ───────────────────────────────────────────────────────
function createServer(apiKey, relayerSecret, oracleSecret) {
  const server = new McpServer({ name: "NWO Robotics", version: "2.0.0" });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. INFERENCE & MODELS
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_inference",
    "Run VLA (Vision-Language-Action) inference to control a robot with a natural language instruction",
    {
      instruction:      z.string().describe("Natural language instruction"),
      images:           z.array(z.string()).optional().describe("Base64-encoded images"),
      model_id:         z.string().optional().describe("Model ID, e.g. xiaomi-robotics-0"),
      agent_id:         z.string().optional(),
      use_model_router: z.boolean().optional().describe("Auto-select best model"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "inference" }, body: args,
    }))
  );

  server.tool("nwo_edge_inference",
    "Ultra-low-latency VLA inference via edge network (200+ global locations, ~28ms)",
    {
      instruction: z.string(),
      images:      z.array(z.string()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await apiFetch(`${EDGE_BASE}/api/inference`, { method: "POST", body: args }))
  );

  server.tool("nwo_list_models",
    "List all available VLA models with capabilities and latency",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-robotics.php", { params: { action: "list_models" } }))
  );

  server.tool("nwo_get_model_info",
    "Get detailed info and performance stats for a specific model",
    { model_id: z.string() },
    { readOnlyHint: true },
    async ({ model_id }) => ok(await nwo(apiKey, "/api-robotics.php", {
      params: { action: "get_model_info", model_id },
    }))
  );

  server.tool("nwo_get_streaming_config",
    "Get available WebSocket/SSE streaming frequencies and chunk sizes",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-robotics.php", { params: { action: "streaming_config" } }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ROBOT CONTROL & STATE
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_query_robot_state",
    "Query joint angles, gripper state, position, battery level of a robot",
    {
      agent_id:      z.string().describe("Robot/agent ID"),
      include_image: z.boolean().optional(),
    },
    { readOnlyHint: true },
    async ({ agent_id, include_image }) => ok(await nwo(apiKey, "/api-robotics.php", {
      params: { action: "query_state", agent_id, include_image },
    }))
  );

  server.tool("nwo_execute_actions",
    "Execute a sequence of low-level joint actions on a robot",
    {
      agent_id:     z.string(),
      actions:      z.array(z.array(z.number())).describe("Array of joint action vectors"),
      safety_check: z.boolean().optional().default(true),
      speed:        z.number().optional().describe("Speed multiplier 0-1"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "execute" }, body: args,
    }))
  );

  server.tool("nwo_sensor_fusion",
    "Fuse multi-modal sensor data (camera, LiDAR, thermal, GPS, force) for robot decision-making",
    {
      instruction: z.string(),
      agent_id:    z.string().optional(),
      images:      z.array(z.string()).optional(),
      sensors:     z.object({
        temperature: z.object({ value: z.number(), unit: z.string() }).optional(),
        proximity:   z.object({ distance: z.number(), unit: z.string() }).optional(),
        force:       z.record(z.number()).optional(),
        gps:         z.object({ lat: z.number(), lng: z.number() }).optional(),
        lidar:       z.record(z.unknown()).optional(),
      }).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "sensor_fusion" }, body: args,
    }))
  );

  server.tool("nwo_robot_query",
    "Get status, battery, and current task of a robot",
    { agent_id: z.string() },
    { readOnlyHint: true },
    async ({ agent_id }) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "robot_query" }, body: { agent_id },
    }))
  );

  server.tool("nwo_get_agent_status",
    "Get tasks completed and success rate for an agent",
    { agent_id: z.string() },
    { readOnlyHint: true },
    async ({ agent_id }) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "get_agent_status" }, body: { agent_id },
    }))
  );

  server.tool("nwo_status_poll",
    "Poll the status and progress of an ongoing task",
    {
      task_id:  z.string(),
      agent_id: z.string(),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "status_poll" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 3. TASK PLANNING & LEARNING
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_task_planner",
    "Decompose a complex natural language goal into ordered subtasks with time estimates",
    {
      instruction: z.string().describe("High-level goal, e.g. 'Clean the entire warehouse'"),
      agent_id:    z.string().optional(),
      context:     z.record(z.unknown()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "task_planner" }, body: args,
    }))
  );

  server.tool("nwo_execute_subtask",
    "Execute a specific subtask from an existing plan",
    {
      plan_id:       z.string(),
      subtask_order: z.number(),
      agent_id:      z.string(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "execute_subtask" }, body: args,
    }))
  );

  server.tool("nwo_learning_recommend",
    "Get AI-recommended techniques and parameters for a task based on past executions",
    {
      agent_id:         z.string().optional(),
      task_description: z.string(),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "learning", subaction: "recommend" }, body: args,
    }))
  );

  server.tool("nwo_learning_log",
    "Log a task execution result for online learning and future recommendations",
    {
      agent_id:         z.string().optional(),
      task_id:          z.string().optional(),
      task_description: z.string(),
      technique_used:   z.string(),
      success:          z.boolean(),
      execution_time_ms: z.number().optional(),
      sensor_data:      z.record(z.unknown()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "learning", subaction: "log" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 4. AGENT MANAGEMENT & REGISTRATION
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_register_agent",
    "Register a new autonomous robot/agent and get an API key and agent ID",
    {
      wallet_address: z.string().optional().describe("Ethereum wallet address"),
      agent_name:     z.string(),
      agent_type:     z.string().optional().describe("e.g. robot_controller, autonomous_robot_controller"),
      capabilities:   z.array(z.string()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await apiFetch(`${NWO_BASE}/api-agent-register.php`, {
      method: "POST", body: args,
    }))
  );

  server.tool("nwo_register_robot",
    "Register a physical robot with the NWO robotics platform",
    {
      agent_id:     z.string(),
      name:         z.string(),
      type:         z.string().describe("e.g. mobile_arm, manipulator, humanoid"),
      capabilities: z.array(z.string()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "POST", params: { action: "register_agent" }, body: args,
    }))
  );

  server.tool("nwo_update_agent",
    "Update capabilities or status of an existing agent",
    {
      agent_id:     z.string(),
      capabilities: z.array(z.string()).optional(),
      status:       z.string().optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-robotics.php", {
      method: "PUT", params: { action: "update_agent" }, body: args,
    }))
  );

  server.tool("nwo_get_agent",
    "Get details, type, status, and stats for a specific agent",
    { agent_id: z.string() },
    { readOnlyHint: true },
    async ({ agent_id }) => ok(await nwo(apiKey, "/api-robotics.php", {
      params: { action: "get_agent", agent_id },
    }))
  );

  server.tool("nwo_agent_pay",
    "Pay for a tier upgrade using Ethereum or credit card",
    {
      agent_id:       z.string(),
      tier:           z.enum(["prototype", "production"]),
      billing_period: z.string().optional().default("monthly"),
      payment_method: z.string().optional().describe("ethereum or credit_card"),
      tx_hash:        z.string().optional().describe("Ethereum tx hash if paying with ETH"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-agent-pay.php", { method: "POST", body: args }))
  );

  server.tool("nwo_agent_wallet",
    "Create a hosted MoonPay wallet for credit card funding",
    { agent_id: z.string() },
    { readOnlyHint: false, destructiveHint: false },
    async ({ agent_id }) => ok(await nwo(apiKey, "/api-agent-wallet.php", {
      method: "POST", body: { action: "create_hosted_wallet", agent_id },
    }))
  );

  server.tool("nwo_agent_balance",
    "Check quota usage, remaining calls, tier, and subscription expiry",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-agent-balance.php"))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 5. AGENT DISCOVERY API
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_discovery_health",
    "Check if the NWO API is online",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-agent-discovery.php", { params: { action: "health" } }))
  );

  server.tool("nwo_discovery_whoami",
    "Get current agent identity, tier, and quota remaining",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-agent-discovery.php", { params: { action: "whoami" } }))
  );

  server.tool("nwo_discovery_capabilities",
    "Discover all execution modes, robot types, task types, models, and sensors available",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-agent-discovery.php", { params: { action: "capabilities" } }))
  );

  server.tool("nwo_dry_run",
    "Validate whether a task is feasible without executing it — checks confidence, safety, and cost estimates",
    {
      instruction:    z.string(),
      robot_id:       z.string().optional(),
      execution_mode: z.enum(["mock", "simulated", "live"]).optional().default("mock"),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-agent-discovery.php", {
      method: "POST", params: { action: "dry-run" }, body: args,
    }))
  );

  server.tool("nwo_plan",
    "Generate a detailed multi-phase execution plan for a task",
    {
      instruction:    z.string(),
      robot_id:       z.string().optional(),
      execution_mode: z.enum(["mock", "simulated", "live"]).optional().default("mock"),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-agent-discovery.php", {
      method: "POST", params: { action: "plan" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ROS2 BRIDGE (Physical Robots)
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("ros2_list_robots",
    "List all physical robots connected to the ROS2 bridge",
    {},
    { readOnlyHint: true },
    async () => ok(await ros2(apiKey, "/api/v1/robots"))
  );

  server.tool("ros2_get_robot_status",
    "Get battery, joint positions, and status of a specific physical robot",
    { robot_id: z.string() },
    { readOnlyHint: true },
    async ({ robot_id }) => ok(await ros2(apiKey, `/api/v1/robots/${robot_id}/status`))
  );

  server.tool("ros2_send_command",
    "Send a direct joint command to a physical robot via ROS2 bridge",
    {
      robot_id:     z.string(),
      command:      z.string().describe("Command name, e.g. move_arm"),
      joint_angles: z.array(z.number()).optional(),
      params:       z.record(z.unknown()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async ({ robot_id, command, joint_angles, params }) => ok(await ros2(apiKey, `/api/v1/robots/${robot_id}/command`, {
      method: "POST", body: { command, joint_angles, ...params },
    }))
  );

  server.tool("ros2_submit_action",
    "Submit NWO inference output actions directly to a physical robot via ROS2",
    {
      robot_id: z.string(),
      actions:  z.array(z.array(z.number())),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await ros2(apiKey, "/api/v1/action", { method: "POST", body: args }))
  );

  server.tool("ros2_emergency_stop",
    "Emergency stop a single physical robot immediately",
    {
      robot_id: z.string(),
      reason:   z.string().optional().default("Safety violation"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ robot_id, reason }) => ok(await ros2(apiKey, `/api/v1/robots/${robot_id}/emergency_stop`, {
      method: "POST", body: { reason },
    }))
  );

  server.tool("ros2_emergency_stop_all",
    "Emergency stop ALL connected physical robots immediately",
    {
      reason: z.string().optional().default("System-wide emergency"),
    },
    { readOnlyHint: false, destructiveHint: true },
    async ({ reason }) => ok(await ros2(apiKey, "/api/v1/robots/emergency_stop_all", {
      method: "POST", body: { reason },
    }))
  );

  server.tool("ros2_get_robot_types",
    "Get all supported physical robot types, DOF, and max speed specs",
    {},
    { readOnlyHint: true },
    async () => ok(await ros2(apiKey, "/api/v1/config/robot-types"))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 7. PHYSICS & SIMULATION
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_simulate_trajectory",
    "Simulate a robot trajectory with physics — checks feasibility and collision",
    {
      agent_id:       z.string().optional(),
      trajectory:     z.array(z.array(z.number())),
      physics_params: z.record(z.unknown()).optional(),
      check_collision: z.boolean().optional().default(true),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-simulation.php", {
      method: "POST", params: { action: "simulate_trajectory" }, body: args,
    }))
  );

  server.tool("nwo_check_collision",
    "Check if a trajectory will collide with obstacles in the environment",
    {
      agent_id:    z.string().optional(),
      trajectory:  z.array(z.array(z.number())),
      environment: z.record(z.unknown()).optional(),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-simulation.php", {
      method: "POST", params: { action: "check_collision" }, body: args,
    }))
  );

  server.tool("nwo_estimate_torques",
    "Estimate joint torques for a trajectory given payload mass",
    {
      agent_id:     z.string().optional(),
      trajectory:   z.array(z.array(z.number())),
      payload_mass: z.number().describe("Payload in kg"),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-simulation.php", {
      method: "POST", params: { action: "estimate_torques" }, body: args,
    }))
  );

  server.tool("nwo_validate_grasp",
    "Validate that a grasp configuration is stable given object shape and mass",
    {
      agent_id:     z.string().optional(),
      object_shape: z.string().describe("e.g. cylinder, box, sphere"),
      object_mass:  z.number().describe("Mass in kg"),
      grip_force:   z.number().describe("Grip force in Newtons"),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-simulation.php", {
      method: "POST", params: { action: "validate_grasp" }, body: args,
    }))
  );

  server.tool("nwo_plan_motion",
    "Plan a collision-free motion path using MoveIt2 (RRTConnect or similar planner)",
    {
      agent_id:         z.string().optional(),
      start_pose:       z.array(z.number()),
      goal_pose:        z.array(z.number()),
      planner:          z.string().optional().default("RRTConnect"),
      avoid_collisions: z.boolean().optional().default(true),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-simulation.php", {
      method: "POST", params: { action: "plan_motion" }, body: args,
    }))
  );

  server.tool("nwo_get_scene_library",
    "List available simulation scenes (warehouses, kitchens, etc.)",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-simulation.php", { params: { action: "get_scene_library" } }))
  );

  server.tool("nwo_cosmos_generate_scene",
    "Generate synthetic MuJoCo training scenes using Cosmos 3",
    {
      prompt:     z.string().describe("Scene description, e.g. Warehouse with pallets"),
      objects:    z.array(z.string()).optional(),
      lighting:   z.string().optional(),
      variations: z.number().optional().default(100),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-cosmos.php", {
      method: "POST", params: { action: "generate_scene" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 8. EMBODIMENT & CALIBRATION
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_embodiment_list",
    "List robots in the embodiment registry, optionally filtered by type",
    { filter_type: z.string().optional().describe("e.g. manipulator, mobile, humanoid") },
    { readOnlyHint: true },
    async ({ filter_type }) => ok(await nwo(apiKey, "/api-embodiment.php", {
      params: { action: "list", filter_type },
    }))
  );

  server.tool("nwo_embodiment_detail",
    "Get full specifications for a robot type (DOF, speed, joint limits, sensors)",
    { robot_type: z.string().describe("e.g. ur5e, panda, spot") },
    { readOnlyHint: true },
    async ({ robot_type }) => ok(await nwo(apiKey, "/api-embodiment.php", {
      params: { action: "detail", robot_type },
    }))
  );

  server.tool("nwo_embodiment_normalization",
    "Get joint normalization parameters (min/max/mean/std) for a robot type",
    { robot_type: z.string() },
    { readOnlyHint: true },
    async ({ robot_type }) => ok(await nwo(apiKey, "/api-embodiment.php", {
      params: { action: "normalization", robot_type },
    }))
  );

  server.tool("nwo_embodiment_urdf",
    "Download the URDF model for a robot type",
    { robot_type: z.string() },
    { readOnlyHint: true },
    async ({ robot_type }) => ok(await nwo(apiKey, "/api-embodiment.php", {
      params: { action: "urdf", robot_type },
    }))
  );

  server.tool("nwo_embodiment_test_results",
    "Get benchmark validation results (LIBERO, CALVIN, SimplerEnv) for a robot type",
    { robot_type: z.string() },
    { readOnlyHint: true },
    async ({ robot_type }) => ok(await nwo(apiKey, "/api-embodiment.php", {
      params: { action: "test_results", robot_type },
    }))
  );

  server.tool("nwo_embodiment_compare",
    "Compare two or more robot types side by side across DOF, speed, and accuracy",
    {
      robot_types:    z.array(z.string()).min(2),
      compare_fields: z.array(z.string()).optional(),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-embodiment.php", {
      method: "POST", params: { action: "compare" }, body: args,
    }))
  );

  server.tool("nwo_calibrate_confidence",
    "Calibrate raw model confidence scores to real success probabilities",
    {
      model_confidence: z.number(),
      model_id:         z.string(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-calibration.php", {
      method: "POST", params: { action: "calibrate" }, body: args,
    }))
  );

  server.tool("nwo_run_calibration",
    "Run automatic joint-offset calibration on a robot",
    {
      agent_id:         z.string(),
      calibration_type: z.string().optional().default("joint_offset"),
      method:           z.string().optional().default("automatic"),
      samples:          z.number().optional().default(100),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-calibration.php", {
      method: "POST", params: { action: "run_calibration" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 9. ONLINE RL & FINE-TUNING
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_start_online_rl",
    "Start an online reinforcement learning session with reward configuration",
    {
      agent_id:      z.string(),
      task_name:     z.string(),
      reward_config: z.object({
        success_bonus:    z.number().optional().default(1.0),
        efficiency_penalty: z.number().optional().default(-0.01),
        safety_penalty:   z.number().optional().default(-10.0),
      }).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-online-rl.php", {
      method: "POST", params: { action: "start_online_rl" }, body: args,
    }))
  );

  server.tool("nwo_submit_telemetry",
    "Submit state/action/reward telemetry to an active RL session for policy updates",
    {
      rl_session_id: z.string(),
      state:         z.array(z.number()).optional(),
      action:        z.array(z.number()).optional(),
      reward:        z.number(),
      telemetry:     z.record(z.unknown()).optional(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-online-rl.php", {
      method: "POST", params: { action: "submit_telemetry" }, body: args,
    }))
  );

  server.tool("nwo_create_fine_tune_dataset",
    "Create a fine-tuning dataset from an agent's execution history",
    {
      agent_id:   z.string(),
      start_date: z.string().describe("ISO date string"),
      end_date:   z.string().describe("ISO date string"),
      format:     z.string().optional().default("json"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-fine-tune.php", {
      method: "POST", params: { action: "create_dataset" }, body: args,
    }))
  );

  server.tool("nwo_start_fine_tune_job",
    "Start a LoRA fine-tuning job on a base VLA model using a dataset",
    {
      dataset_id:  z.string(),
      base_model:  z.string().optional().default("xiaomi-robotics-0"),
      algorithm:   z.string().optional().default("LoRA"),
      rank:        z.number().optional().default(32),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-fine-tune.php", {
      method: "POST", params: { action: "start_job" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 10. TACTILE SENSING (ORCA Hand)
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_orca_get_tactile",
    "Read raw tactile sensor data from ORCA robotic hand fingers",
    {
      finger:      z.enum(["index", "thumb", "middle", "ring", "pinky", "all"]).optional().default("all"),
      sensor_type: z.enum(["raw_taxels", "force_vector", "slip_detection"]).optional().default("raw_taxels"),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api-orca.php", {
      params: { action: "get_tactile", ...args },
    }))
  );

  server.tool("nwo_tactile_process",
    "Process tactile sensor data to determine grip quality, object texture, and recommended grip force",
    {
      agent_id:     z.string().optional(),
      tactile_data: z.record(z.unknown()),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-tactile.php", {
      method: "POST", params: { action: "process_input" }, body: args,
    }))
  );

  server.tool("nwo_slip_detection",
    "Detect slip probability by comparing current and previous tactile readings",
    {
      agent_id:          z.string().optional(),
      current_tactile:   z.array(z.number()),
      previous_tactile:  z.array(z.number()),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api-tactile.php", {
      method: "POST", params: { action: "slip_detection" }, body: args,
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 11. DATASET HUB
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_list_unitree_datasets",
    "List Unitree G1 humanoid robot datasets (1.54M+ episodes, LeRobot-compatible)",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api-unitree-datasets.php", { params: { action: "list" } }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 12. SWARM
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_swarm_join",
    "Add a robot to a multi-robot swarm",
    { swarm_id: z.string(), robot_id: z.string() },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/swarm/join", { method: "POST", body: args }))
  );

  server.tool("nwo_swarm_leave",
    "Remove a robot from a swarm",
    { swarm_id: z.string(), robot_id: z.string() },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/swarm/leave", { method: "POST", body: args }))
  );

  server.tool("nwo_swarm_broadcast",
    "Broadcast a command message to all robots in a swarm",
    {
      swarm_id: z.string(),
      message:  z.record(z.unknown()).describe("Command payload for all swarm robots"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/swarm/broadcast", { method: "POST", body: args }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 13. TASKS
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_tasks_list",
    "List current and recent tasks",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api/tasks/list"))
  );

  server.tool("nwo_tasks_history",
    "Get task execution history with pagination",
    {
      limit:  z.number().optional().default(20),
      offset: z.number().optional().default(0),
    },
    { readOnlyHint: true },
    async ({ limit, offset }) => ok(await nwo(apiKey, "/api/tasks/history", { params: { limit, offset } }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 14. CONFIG
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_config_get",
    "Get a configuration value by key",
    { key: z.string().optional() },
    { readOnlyHint: true },
    async ({ key }) => ok(await nwo(apiKey, "/api/config/get", { params: { key } }))
  );

  server.tool("nwo_config_set",
    "Set a configuration key-value pair",
    {
      key:   z.string(),
      value: z.unknown(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/config/set", { method: "POST", body: args }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 15. BILLING
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_billing_usage",
    "Check current API call usage and quota consumption",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api/billing/usage"))
  );

  server.tool("nwo_billing_invoice",
    "Get invoices for a billing month",
    { month: z.string().optional().describe("e.g. 2026-04") },
    { readOnlyHint: true },
    async ({ month }) => ok(await nwo(apiKey, "/api/billing/invoice", { params: { month } }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 16. IoT
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_iot_command",
    "Send a command to an IoT device",
    {
      device_id: z.string(),
      command:   z.record(z.unknown()),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/iot/command", { method: "POST", body: args }))
  );

  server.tool("nwo_iot_status",
    "Get the current status of an IoT device",
    { device_id: z.string() },
    { readOnlyHint: true },
    async ({ device_id }) => ok(await nwo(apiKey, "/api/iot/status", { params: { device_id } }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 17. SAFETY
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_safety_check",
    "Run a safety validation on a proposed robot action before execution",
    {
      action:  z.record(z.unknown()),
      context: z.record(z.unknown()).optional(),
    },
    { readOnlyHint: true },
    async (args) => ok(await nwo(apiKey, "/api/safety/check", { method: "POST", body: args }))
  );

  server.tool("nwo_safety_alert",
    "Send a safety alert with severity level",
    {
      level:   z.enum(["info", "warning", "critical"]),
      message: z.string(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/safety/alert", { method: "POST", body: args }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 18. TEMPLATES
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_template_list",
    "List available code templates for robot control",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api/template/list"))
  );

  server.tool("nwo_template_get",
    "Get the content of a specific code template",
    { template_id: z.string() },
    { readOnlyHint: true },
    async ({ template_id }) => ok(await nwo(apiKey, "/api/template/get", { params: { template_id } }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 19. MODELS
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("nwo_models_list",
    "List all uploaded custom models",
    {},
    { readOnlyHint: true },
    async () => ok(await nwo(apiKey, "/api/models/list"))
  );

  server.tool("nwo_models_upload",
    "Upload a custom model (base64-encoded file)",
    {
      name: z.string(),
      file: z.string().describe("Base64-encoded model file"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await nwo(apiKey, "/api/models/upload", { method: "POST", body: args }))
  );

  server.tool("nwo_models_download",
    "Download a model by ID",
    { model_id: z.string() },
    { readOnlyHint: true },
    async ({ model_id }) => ok(await nwo(apiKey, "/api/models/download", { params: { model_id } }))
  );

  server.tool("nwo_models_delete",
    "Delete a custom model by ID",
    { model_id: z.string() },
    { readOnlyHint: false, destructiveHint: true },
    async ({ model_id }) => ok(await nwo(apiKey, "/api/models/delete", {
      method: "DELETE", params: { model_id },
    }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 20. CARDIAC ORACLE
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("cardiac_oracle_health",
    "Check if the NWO Cardiac Oracle is healthy (Base mainnet, ECG validation service)",
    {},
    { readOnlyHint: true },
    async () => ok(await apiFetch(`${ORACLE_BASE}/health`))
  );

  server.tool("cardiac_validate_ecg",
    "Validate ECG biometric data and return a cardiac hash for identity registration",
    {
      wallet:  z.string().describe("Ethereum wallet address"),
      ecgData: z.object({
        samples:     z.array(z.number()).optional(),
        rrIntervals: z.array(z.number()),
        sampleRate:  z.number().optional().default(512),
        deviceType:  z.string().optional().describe("e.g. apple_watch, garmin"),
      }),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await oracle(oracleSecret, "/oracle/validate", { method: "POST", body: args }))
  );

  server.tool("cardiac_hash_ecg",
    "Compute a cardiac hash from RR intervals without full validation",
    {
      wallet:  z.string(),
      ecgData: z.object({ rrIntervals: z.array(z.number()) }),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await oracle(oracleSecret, "/oracle/hashECG", { method: "POST", body: args }))
  );

  server.tool("cardiac_verify_ecg",
    "Verify that a cardiac hash was recently validated (in-memory cache check)",
    {
      wallet:      z.string(),
      cardiacHash: z.string(),
    },
    { readOnlyHint: true },
    async (args) => ok(await oracle(oracleSecret, "/oracle/verify", { method: "POST", body: args }))
  );

  // ══════════════════════════════════════════════════════════════════════════
  // 21. CARDIAC RELAYER (Agent Identity on Base Mainnet)
  // ══════════════════════════════════════════════════════════════════════════

  server.tool("cardiac_relayer_health",
    "Check if the NWO Relayer is healthy and get chain/contract info",
    {},
    { readOnlyHint: true },
    async () => ok(await apiFetch(`${RELAYER_BASE}/health`))
  );

  server.tool("cardiac_register_agent",
    "Register an AI agent on Base mainnet and get a soul-bound rootTokenId Digital ID",
    {
      moonpayWallet: z.string().describe("Agent Ethereum wallet address"),
      apiKeyHash:    z.string().describe("keccak256 hash of your NWO API key (0x prefixed)"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/relay/registerAgent", { method: "POST", body: args }))
  );

  server.tool("cardiac_identify_by_agent_key",
    "Look up a rootTokenId by hashed API key",
    { apiKeyHash: z.string() },
    { readOnlyHint: true },
    async (args) => ok(await relayer(relayerSecret, "/read/identifyByAgentKey", { method: "POST", body: args }))
  );

  server.tool("cardiac_renew_agent_key",
    "Renew an agent API key binding on-chain (requires EIP-712 signature)",
    {
      rootTokenId:  z.string(),
      newApiKeyHash: z.string(),
      deadline:     z.number().describe("Unix timestamp"),
      agentSig:     z.string().describe("EIP-712 signature"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/relay/renewAgentKey", { method: "POST", body: args }))
  );

  server.tool("cardiac_register_human",
    "Register a human identity on Base mainnet using wallet + cardiac hash (gasless)",
    {
      wallet:      z.string(),
      cardiacHash: z.string(),
      deadline:    z.number(),
      userSig:     z.string(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/relay/selfRegisterHuman", { method: "POST", body: args }))
  );

  server.tool("cardiac_enroll_cardiac",
    "Enroll a new cardiac hash for an existing identity",
    {
      rootTokenId: z.string(),
      cardiacHash: z.string(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/relay/enrollCardiac", { method: "POST", body: args }))
  );

  server.tool("cardiac_grant_access",
    "Grant location access credential to an identity for a duration",
    {
      rootTokenId:     z.string(),
      locationHash:    z.string(),
      durationSeconds: z.number(),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/relay/grantAccess", { method: "POST", body: args }))
  );

  server.tool("cardiac_issue_credential",
    "Issue a verifiable credential (task_auth, swarm_cmd, capability, etc.) to an identity",
    {
      rootTokenId:    z.string(),
      credentialType: z.string().describe("keccak256 of credential name, e.g. keccak256('task_auth')"),
      credentialHash: z.string(),
      expiresAt:      z.number().describe("Unix timestamp expiry"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/relay/issueCredential", { method: "POST", body: args }))
  );

  server.tool("cardiac_identify_by_cardiac",
    "Look up a rootTokenId by cardiac hash",
    { cardiacHash: z.string() },
    { readOnlyHint: true },
    async (args) => ok(await relayer(relayerSecret, "/read/identifyByCardiac", { method: "POST", body: args }))
  );

  server.tool("cardiac_has_valid_credential",
    "Check if an identity has a valid credential of a given type",
    {
      rootTokenId:    z.string(),
      credentialType: z.string(),
    },
    { readOnlyHint: true },
    async (args) => ok(await relayer(relayerSecret, "/read/hasValidCredential", { method: "POST", body: args }))
  );

  server.tool("cardiac_get_nonce",
    "Get the EIP-712 nonce for a wallet (required before signing)",
    { wallet: z.string() },
    { readOnlyHint: true },
    async (args) => ok(await relayer(relayerSecret, "/read/nonce", { method: "POST", body: args }))
  );

  server.tool("cardiac_check_access",
    "Check if an identity has access to a location (on-chain verification)",
    {
      rootTokenId: z.string(),
      locationId:  z.string(),
    },
    { readOnlyHint: true },
    async (args) => ok(await relayer(relayerSecret, "/access/check", { method: "POST", body: args }))
  );

  server.tool("cardiac_preview_access",
    "Preview location access without spending gas",
    {
      rootTokenId: z.string(),
      locationId:  z.string(),
    },
    { readOnlyHint: true },
    async (args) => ok(await relayer(relayerSecret, "/access/preview", { method: "POST", body: args }))
  );

  server.tool("cardiac_process_payment",
    "Process a payment via the NWO Payment Processor smart contract",
    {
      rootTokenId:  z.string(),
      terminalId:   z.string(),
      amountCents:  z.number(),
      currencyCode: z.string().default("USD"),
    },
    { readOnlyHint: false, destructiveHint: false },
    async (args) => ok(await relayer(relayerSecret, "/payment/process", { method: "POST", body: args }))
  );

  return server;
}

// ─── HTTP endpoint ─────────────────────────────────────────────────────────────
app.post("/mcp", async (req, res) => {
  const apiKey       = req.headers["x-api-key"] || process.env.NWO_API_KEY || "";
  const relayerSecret = req.headers["x-relayer-secret"] || process.env.RELAYER_SECRET || "";
  const oracleSecret  = req.headers["x-oracle-secret"]  || process.env.ORACLE_SECRET  || "";

  const server    = createServer(apiKey, relayerSecret, oracleSecret);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", name: "NWO Robotics MCP Server", version: "2.0.0", tools: 85 });
});

app.listen(PORT, () => {
  console.log(`NWO Robotics MCP Server running on port ${PORT}`);
  console.log(`MCP endpoint: POST /mcp`);
  console.log(`Health check: GET /health`);
});
