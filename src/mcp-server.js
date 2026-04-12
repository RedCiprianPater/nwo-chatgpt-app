/**
 * NWO Robotics MCP Server — Complete Implementation
 * Covers every endpoint in agent.md v2.0.0
 *
 * Transport : Streamable HTTP (required by OpenAI + Smithery)
 * Endpoints :
 *   POST/GET/DELETE /mcp                    → MCP protocol
 *   GET  /health                            → Render health-check + OpenAI probe
 *   GET  /                                  → Discovery info
 *   GET  /.well-known/mcp/server-card.json  → Smithery static scan (fixes 404)
 *
 * Services wrapped:
 *   NWO_BASE   https://nwo.capital/webapp
 *   ROS2       https://nwo-ros2-bridge.onrender.com/api/v1
 *   EDGE       https://nwo-robotics-api-edge.ciprianpater.workers.dev
 *   RELAYER    https://nwo-relayer.onrender.com
 *   ORACLE     https://nwo-oracle.onrender.com
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT         = process.env.PORT || 10000;
const NWO_BASE     = process.env.NWO_API_BASE || 'https://nwo.capital/webapp';
const ROS2_BASE    = 'https://nwo-ros2-bridge.onrender.com/api/v1';
const EDGE_BASE    = 'https://nwo-robotics-api-edge.ciprianpater.workers.dev';
const RELAYER_BASE = 'https://nwo-relayer.onrender.com';
const ORACLE_BASE  = 'https://nwo-oracle.onrender.com';

// ─── Express app ──────────────────────────────────────────────────────────────

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id',
                   'X-API-Key', 'X-Agent-Id', 'X-Relayer-Secret', 'X-Oracle-Secret'],
  exposedHeaders: ['Mcp-Session-Id'],
}));
app.use(express.json({ limit: '10mb' }));

// ─── Health / root (fixes OpenAI timeout + Render health check) ───────────────

app.get('/', (req, res) => res.json({
  status: 'ok',
  server: 'NWO Robotics MCP',
  version: '2.0.0',
  mcpEndpoint: '/mcp',
  docs: 'https://nwo.capital/webapp/agent.md',
}));

app.get('/health', (req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── Smithery server card (fixes "Initialization failed with status 404") ─────

app.get('/.well-known/mcp/server-card.json', (_req, res) => {
  res.json({
    serverInfo: {
      name: 'NWO Robotics MCP Server',
      version: '2.0.0',
      description:
        'Full NWO Robotics API as MCP tools — VLA inference, robot control, ' +
        'swarm coordination, simulation, online RL, tactile sensing, and ' +
        'Cardiac blockchain identity. 60+ tools covering every endpoint in agent.md.',
    },
    authentication: { required: false },
    tools: [
      { name: 'vla_inference',           description: 'Run VLA inference: instruction + images → joint actions' },
      { name: 'edge_inference',          description: 'Ultra-low-latency inference via Cloudflare edge (28ms)' },
      { name: 'list_models',             description: 'List all available VLA models' },
      { name: 'get_model_info',          description: 'Get detailed info for a specific model' },
      { name: 'get_streaming_config',    description: 'Get WebSocket streaming configuration' },
      { name: 'query_robot_state',       description: 'Query robot joint angles, position, battery' },
      { name: 'execute_actions',         description: 'Execute pre-computed joint actions on a robot' },
      { name: 'sensor_fusion',           description: 'VLA inference with multi-modal sensor data' },
      { name: 'robot_query',             description: 'Quick robot status: battery, current task' },
      { name: 'get_agent_status',        description: 'Get tasks completed and success rate' },
      { name: 'task_planner',            description: 'Decompose complex instruction into subtasks' },
      { name: 'execute_subtask',         description: 'Execute one subtask from a plan' },
      { name: 'status_poll',             description: 'Poll running task progress and status' },
      { name: 'learning_recommend',      description: 'Get technique recommendations for a task' },
      { name: 'learning_log',            description: 'Log execution result for model learning' },
      { name: 'register_agent',          description: 'Self-register AI agent, get API key' },
      { name: 'check_balance',           description: 'Check API quota: used, remaining, tier' },
      { name: 'pay_upgrade',             description: 'Pay ETH to upgrade quota tier' },
      { name: 'create_wallet',           description: 'Create MoonPay wallet for credit card funding' },
      { name: 'register_robot',          description: 'Register a robot in the NWO system' },
      { name: 'update_agent',            description: 'Update robot agent capabilities/status' },
      { name: 'get_agent_info',          description: 'Get full agent profile and stats' },
      { name: 'nwo_health',              description: 'Check NWO API health' },
      { name: 'nwo_whoami',              description: 'Get identity and quota for current API key' },
      { name: 'discover_capabilities',   description: 'Discover all robot types, models, sensors' },
      { name: 'dry_run',                 description: 'Validate task feasibility without executing' },
      { name: 'plan_task',               description: 'Generate phased execution plan' },
      { name: 'ros2_list_robots',        description: 'List robots connected to ROS2 bridge' },
      { name: 'ros2_robot_status',       description: 'Get live robot status via ROS2 bridge' },
      { name: 'ros2_send_command',       description: 'Send joint command via ROS2 bridge' },
      { name: 'ros2_submit_action',      description: 'Submit action sequence via ROS2 bridge' },
      { name: 'ros2_emergency_stop',     description: 'Emergency stop one robot via ROS2 bridge' },
      { name: 'ros2_emergency_stop_all', description: 'Emergency stop ALL robots via ROS2 bridge' },
      { name: 'ros2_get_robot_types',    description: 'Get supported robot types from ROS2 bridge' },
      { name: 'simulate_trajectory',     description: 'Simulate trajectory with physics' },
      { name: 'check_collision',         description: 'Check trajectory for collisions' },
      { name: 'estimate_torques',        description: 'Estimate joint torques for a trajectory' },
      { name: 'validate_grasp',          description: 'Validate grasp stability' },
      { name: 'plan_motion',             description: 'Plan collision-free motion with MoveIt2' },
      { name: 'get_scene_library',       description: 'Get available simulation scenes' },
      { name: 'generate_scene',          description: 'Generate synthetic scenes with NVIDIA Cosmos 3' },
      { name: 'list_embodiments',        description: 'List all supported robot embodiments' },
      { name: 'get_robot_specs',         description: 'Get robot specs: DOF, joints, sensors, speed' },
      { name: 'get_normalization',       description: 'Get joint normalization params for a robot type' },
      { name: 'download_urdf',           description: 'Get URDF model for a robot type' },
      { name: 'get_test_results',        description: 'Get LIBERO/CALVIN benchmark results' },
      { name: 'compare_robots',          description: 'Compare robot types side by side' },
      { name: 'run_calibration',         description: 'Run automatic joint calibration' },
      { name: 'calibrate_confidence',    description: 'Calibrate model confidence to success probability' },
      { name: 'start_rl_training',       description: 'Start online RL training session' },
      { name: 'submit_rl_telemetry',     description: 'Submit state/action/reward to RL session' },
      { name: 'create_finetune_dataset', description: 'Create fine-tuning dataset from logs' },
      { name: 'start_finetune_job',      description: 'Start LoRA fine-tuning job' },
      { name: 'read_tactile',            description: 'Read ORCA tactile sensor data' },
      { name: 'process_tactile',         description: 'Process tactile data for grip quality' },
      { name: 'detect_slip',             description: 'Detect object slip from tactile readings' },
      { name: 'list_datasets',           description: 'List Unitree datasets (1.54M+ episodes)' },
      { name: 'cardiac_register_agent',  description: 'Register agent on Base mainnet, get rootTokenId' },
      { name: 'cardiac_identify_agent',  description: 'Look up rootTokenId by API key hash' },
      { name: 'cardiac_renew_key',       description: 'Renew agent API key on-chain' },
      { name: 'cardiac_issue_credential','description': 'Issue verifiable credential to identity' },
      { name: 'cardiac_check_credential','description': 'Check if rootTokenId has valid credential' },
      { name: 'cardiac_grant_access',    description: 'Grant location access credential' },
      { name: 'cardiac_get_nonce',       description: 'Get EIP-712 nonce for a wallet' },
      { name: 'cardiac_check_access',    description: 'Check location access for rootTokenId' },
      { name: 'cardiac_payment_process', description: 'Process payment via Cardiac smart contract' },
      { name: 'oracle_health',           description: 'Check Cardiac oracle health and chain status' },
      { name: 'oracle_validate_ecg',     description: 'Validate ECG biometric data for human identity' },
      { name: 'oracle_hash_ecg',         description: 'Compute cardiac hash from ECG RR intervals' },
      { name: 'oracle_verify',           description: 'Verify recent ECG validation by cardiac hash' },
    ],
    resources: [],
    prompts: [],
  });
});

// ─── MCP server factory ───────────────────────────────────────────────────────

function buildMcpServer(apiKey, agentId, relayerSecret, oracleSecret) {
  const server = new McpServer({ name: 'NWO Robotics MCP Server', version: '2.0.0' });

  // ── Typed fetch helpers ──────────────────────────────────────────────────────

  const nwoGet = (path) =>
    fetch(`${NWO_BASE}/${path}`, {
      headers: { 'X-API-Key': apiKey },
    }).then(r => r.json());

  const nwoPost = (path, body) =>
    fetch(`${NWO_BASE}/${path}`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const nwoPut = (path, body) =>
    fetch(`${NWO_BASE}/${path}`, {
      method: 'PUT',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const ros2Get = (path) =>
    fetch(`${ROS2_BASE}${path}`, {
      headers: { 'X-API-Key': apiKey },
    }).then(r => r.json());

  const ros2Post = (path, body) =>
    fetch(`${ROS2_BASE}${path}`, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const relayerPost = (path, body) =>
    fetch(`${RELAYER_BASE}${path}`, {
      method: 'POST',
      headers: { 'X-Relayer-Secret': relayerSecret, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const oraclePost = (path, body) =>
    fetch(`${ORACLE_BASE}${path}`, {
      method: 'POST',
      headers: { 'X-Oracle-Secret': oracleSecret, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(r => r.json());

  const text = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. INFERENCE & MODELS
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('vla_inference',
    'Run VLA inference: send instruction + base64 images, receive joint actions',
    {
      instruction:      z.string().describe('Natural language robot instruction'),
      images:           z.array(z.string()).optional().describe('Base64-encoded camera images'),
      model_id:         z.string().optional().describe('e.g. xiaomi-robotics-0, pi05, groot_n1.7'),
      use_model_router: z.boolean().optional().describe('Auto-select best model for task type'),
      agent_id:         z.string().optional().describe('Target robot/agent ID'),
    },
    async (args) => text(await nwoPost('api-robotics.php?action=inference', args)));

  server.tool('edge_inference',
    'Ultra-low-latency VLA inference via Cloudflare global edge (28ms avg)',
    {
      instruction: z.string(),
      images:      z.array(z.string()).optional(),
    },
    async ({ instruction, images }) => {
      const res = await fetch(`${EDGE_BASE}/api/inference`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction, images }),
      });
      return text(await res.json());
    });

  server.tool('list_models',
    'List all available VLA models with capabilities, status, and latency',
    {},
    async () => text(await nwoGet('api-robotics.php?action=list_models')));

  server.tool('get_model_info',
    'Get detailed info and benchmark performance for a specific model',
    { model_id: z.string().describe('e.g. xiaomi-robotics-0') },
    async ({ model_id }) =>
      text(await nwoGet(`api-robotics.php?action=get_model_info&model_id=${model_id}`)));

  server.tool('get_streaming_config',
    'Get available WebSocket streaming frequencies and chunk size ranges',
    {},
    async () => text(await nwoGet('api-robotics.php?action=streaming_config')));

  // ══════════════════════════════════════════════════════════════════════════
  // 2. ROBOT CONTROL & STATE
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('query_robot_state',
    'Query robot state: joint angles, gripper state, position (x,y,z), battery',
    {
      agent_id:      z.string().describe('Robot or agent ID'),
      include_image: z.boolean().optional().describe('Include camera image in response'),
    },
    async ({ agent_id, include_image }) =>
      text(await nwoGet(
        `api-robotics.php?action=query_state&agent_id=${agent_id}${include_image ? '&include_image=true' : ''}`
      )));

  server.tool('execute_actions',
    'Execute a sequence of pre-computed joint action vectors on a robot',
    {
      agent_id:     z.string(),
      actions:      z.array(z.array(z.number())).describe('2D array: each row is one joint-space action'),
      safety_check: z.boolean().optional().default(true),
      speed:        z.number().min(0).max(1).optional().default(0.7),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=execute', args)));

  server.tool('sensor_fusion',
    'Run VLA inference fusing camera + lidar + thermal + force + GPS sensor data',
    {
      agent_id:    z.string(),
      instruction: z.string(),
      images:      z.array(z.string()).optional(),
      sensors: z.object({
        temperature: z.object({ value: z.number(), unit: z.string() }).optional(),
        proximity:   z.object({ distance: z.number(), unit: z.string() }).optional(),
        force:       z.object({ grip_pressure: z.number() }).optional(),
        gps:         z.object({ lat: z.number(), lng: z.number() }).optional(),
        lidar:       z.array(z.number()).optional(),
        thermal:     z.array(z.number()).optional(),
      }).optional(),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=sensor_fusion', args)));

  server.tool('robot_query',
    'Quick query: robot active/idle, battery percent, current task',
    { agent_id: z.string() },
    async ({ agent_id }) =>
      text(await nwoPost('api-robotics.php?action=robot_query', { agent_id })));

  server.tool('get_agent_status',
    'Get tasks completed and success rate for a robot agent',
    { agent_id: z.string().optional() },
    async ({ agent_id }) =>
      text(await nwoPost('api-robotics.php?action=get_agent_status', { agent_id })));

  // ══════════════════════════════════════════════════════════════════════════
  // 3. TASK PLANNING & LEARNING
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('task_planner',
    'Decompose a complex instruction into ordered subtasks with time estimates',
    {
      instruction: z.string(),
      agent_id:    z.string(),
      context:     z.record(z.unknown()).optional()
        .describe('Environment context e.g. {location, known_objects}'),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=task_planner', args)));

  server.tool('execute_subtask',
    'Execute a numbered subtask from a multi-step plan',
    {
      plan_id:       z.string(),
      subtask_order: z.number().int().describe('1-based subtask index'),
      agent_id:      z.string(),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=execute_subtask', args)));

  server.tool('status_poll',
    'Poll the progress and status of a running task (completed, progress%, errors)',
    {
      task_id:  z.string(),
      agent_id: z.string().optional(),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=status_poll', args)));

  server.tool('learning_recommend',
    'Get technique recommendations for a task (grip_force, approach_speed, etc.)',
    {
      agent_id:         z.string(),
      task_description: z.string(),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=learning&subaction=recommend', args)));

  server.tool('learning_log',
    'Log a completed task execution so the model can learn from it',
    {
      agent_id:          z.string(),
      task_id:           z.string().optional(),
      task_description:  z.string(),
      technique_used:    z.string().optional(),
      success:           z.boolean(),
      execution_time_ms: z.number().optional(),
      sensor_data:       z.record(z.unknown()).optional(),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=learning&subaction=log', args)));

  // ══════════════════════════════════════════════════════════════════════════
  // 4. AGENT MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('register_agent',
    'Self-register a new AI agent — returns api_key, agent_id, and 100k free monthly quota',
    {
      wallet_address: z.string().describe('Ethereum wallet (or "auto" to generate)'),
      agent_name:     z.string(),
      agent_type:     z.string().optional().default('autonomous_robot_controller'),
      capabilities:   z.array(z.string()).optional()
        .default(['vision', 'manipulation', 'learning', 'planning']),
    },
    async ({ wallet_address, agent_name, agent_type, capabilities }) => {
      const res = await fetch(`${NWO_BASE}/api-agent-register.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_address, agent_name, agent_type, capabilities }),
      });
      return text(await res.json());
    });

  server.tool('check_balance',
    'Check quota: used this month, remaining, limit, tier, subscription expiry',
    {},
    async () => {
      const res = await fetch(`${NWO_BASE}/api-agent-balance.php`, {
        headers: { 'X-API-Key': apiKey },
      });
      return text(await res.json());
    });

  server.tool('pay_upgrade',
    'Upgrade tier by paying ETH (prototype=500k/mo ~0.015ETH, production=unlimited ~0.062ETH)',
    {
      tier:           z.enum(['prototype', 'production']),
      billing_period: z.enum(['monthly', 'yearly']).optional().default('monthly'),
      tx_hash:        z.string().optional().describe('ETH transaction hash of payment'),
    },
    async ({ tier, billing_period, tx_hash }) => {
      const res = await fetch(`${NWO_BASE}/api-agent-pay.php`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId, api_key: apiKey,
          tier, billing_period, payment_method: 'ethereum', tx_hash,
        }),
      });
      return text(await res.json());
    });

  server.tool('create_wallet',
    'Create a hosted MoonPay wallet so the agent can be funded via credit card',
    {},
    async () => {
      const res = await fetch(`${NWO_BASE}/api-agent-wallet.php`, {
        method: 'POST',
        headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create_hosted_wallet', agent_id: agentId }),
      });
      return text(await res.json());
    });

  server.tool('register_robot',
    'Register a new robot entity in the NWO system',
    {
      agent_id:     z.string(),
      name:         z.string(),
      type:         z.string().describe('mobile_arm | manipulator | mobile | humanoid'),
      capabilities: z.array(z.string()).optional(),
    },
    async (args) =>
      text(await nwoPost('api-robotics.php?action=register_agent', args)));

  server.tool('update_agent',
    'Update a robot agent\'s capabilities or operational status',
    {
      agent_id:     z.string(),
      capabilities: z.array(z.string()).optional(),
      status:       z.enum(['active', 'idle', 'maintenance', 'offline']).optional(),
    },
    async (args) =>
      text(await nwoPut('api-robotics.php?action=update_agent', args)));

  server.tool('get_agent_info',
    'Get full agent profile: name, type, status, total tasks, success rate',
    { agent_id: z.string() },
    async ({ agent_id }) =>
      text(await nwoGet(`api-robotics.php?action=get_agent&agent_id=${agent_id}`)));

  // ══════════════════════════════════════════════════════════════════════════
  // 5. AGENT DISCOVERY API
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('nwo_health',
    'Check NWO API online status and timestamp',
    {},
    async () => text(await nwoGet('api-agent-discovery.php?action=health')));

  server.tool('nwo_whoami',
    'Get the agent_id, tier, and quota_remaining for the current API key',
    {},
    async () => text(await nwoGet('api-agent-discovery.php?action=whoami')));

  server.tool('discover_capabilities',
    'Discover execution modes, robot/task types, available models, sensors, and features',
    {},
    async () => text(await nwoGet('api-agent-discovery.php?action=capabilities')));

  server.tool('dry_run',
    'Validate task feasibility without executing — safety check, confidence, duration estimate',
    {
      instruction:    z.string(),
      robot_id:       z.string(),
      execution_mode: z.enum(['mock', 'simulated', 'live']).optional().default('mock'),
    },
    async (args) =>
      text(await nwoPost('api-agent-discovery.php?action=dry-run', args)));

  server.tool('plan_task',
    'Generate a phased plan: preparation → perception → execution → verification',
    {
      instruction:    z.string(),
      robot_id:       z.string(),
      execution_mode: z.enum(['mock', 'simulated', 'live']).optional().default('mock'),
    },
    async (args) =>
      text(await nwoPost('api-agent-discovery.php?action=plan', args)));

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ROS2 BRIDGE (Physical Robots)
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('ros2_list_robots',
    'List all robots currently connected to the ROS2 bridge',
    {},
    async () => text(await ros2Get('/robots')));

  server.tool('ros2_robot_status',
    'Get live status of a specific physical robot via ROS2 bridge',
    { robot_id: z.string() },
    async ({ robot_id }) => text(await ros2Get(`/robots/${robot_id}/status`)));

  server.tool('ros2_send_command',
    'Send a named command + joint angles to a physical robot via ROS2 bridge',
    {
      robot_id:     z.string(),
      command:      z.string().describe('e.g. move_arm, home, open_gripper, close_gripper'),
      joint_angles: z.array(z.number()).optional(),
    },
    async ({ robot_id, command, joint_angles }) =>
      text(await ros2Post(`/robots/${robot_id}/command`, { command, joint_angles })));

  server.tool('ros2_submit_action',
    'Submit a computed action sequence directly to a robot via ROS2 bridge',
    {
      robot_id: z.string(),
      actions:  z.array(z.array(z.number())).describe('2D action array from VLA inference'),
    },
    async ({ robot_id, actions }) =>
      text(await ros2Post('/action', { robot_id, actions })));

  server.tool('ros2_emergency_stop',
    'Emergency stop a single robot via ROS2 bridge (10ms response)',
    {
      robot_id: z.string(),
      reason:   z.string().optional().default('Emergency stop requested'),
    },
    async ({ robot_id, reason }) =>
      text(await ros2Post(`/robots/${robot_id}/emergency_stop`, { reason })));

  server.tool('ros2_emergency_stop_all',
    'Emergency stop ALL connected robots via ROS2 bridge',
    { reason: z.string().optional().default('System-wide emergency') },
    async ({ reason }) =>
      text(await ros2Post('/robots/emergency_stop_all', { reason })));

  server.tool('ros2_get_robot_types',
    'Get all robot types supported by the ROS2 bridge with DOF, speed, and specs',
    {},
    async () => text(await ros2Get('/config/robot-types')));

  // ══════════════════════════════════════════════════════════════════════════
  // 7. PHYSICS SIMULATION
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('simulate_trajectory',
    'Simulate a trajectory with physics: check feasibility, collisions, time estimate',
    {
      agent_id:        z.string(),
      trajectory:      z.array(z.array(z.number())),
      physics_params:  z.object({
        gravity:     z.number().optional().default(9.81),
        object_mass: z.number().optional(),
      }).optional(),
      check_collision: z.boolean().optional().default(true),
    },
    async (args) =>
      text(await nwoPost('api-simulation.php?action=simulate_trajectory', args)));

  server.tool('check_collision',
    'Check a trajectory for collisions with environment obstacles',
    {
      agent_id:    z.string(),
      trajectory:  z.array(z.array(z.number())),
      environment: z.object({
        obstacles: z.array(z.unknown()).optional(),
      }).optional(),
    },
    async (args) =>
      text(await nwoPost('api-simulation.php?action=check_collision', args)));

  server.tool('estimate_torques',
    'Estimate joint torques for a trajectory given payload mass',
    {
      agent_id:     z.string(),
      trajectory:   z.array(z.array(z.number())),
      payload_mass: z.number().optional().describe('Payload mass in kg'),
    },
    async (args) =>
      text(await nwoPost('api-simulation.php?action=estimate_torques', args)));

  server.tool('validate_grasp',
    'Validate whether a grasp will be stable for object shape, mass, and grip force',
    {
      agent_id:     z.string(),
      object_shape: z.string().describe('cylinder | box | sphere | irregular'),
      object_mass:  z.number().describe('Mass in kg'),
      grip_force:   z.number().describe('Grip force in Newtons'),
    },
    async (args) =>
      text(await nwoPost('api-simulation.php?action=validate_grasp', args)));

  server.tool('plan_motion',
    'Plan a collision-free motion path using MoveIt2',
    {
      agent_id:         z.string(),
      start_pose:       z.array(z.number()).describe('Start joint angles'),
      goal_pose:        z.array(z.number()).describe('Goal joint angles or Cartesian pose'),
      planner:          z.string().optional().default('RRTConnect'),
      avoid_collisions: z.boolean().optional().default(true),
    },
    async (args) =>
      text(await nwoPost('api-simulation.php?action=plan_motion', args)));

  server.tool('get_scene_library',
    'Get available simulation scenes (warehouse, kitchen, outdoor, etc.)',
    {},
    async () => text(await nwoGet('api-simulation.php?action=get_scene_library')));

  server.tool('generate_scene',
    'Generate synthetic robot training scenes using NVIDIA Cosmos 3',
    {
      prompt:     z.string().describe('Scene description, e.g. "Warehouse with pallets and boxes"'),
      objects:    z.array(z.string()).optional(),
      lighting:   z.string().optional().default('industrial'),
      variations: z.number().int().optional().default(100),
    },
    async (args) =>
      text(await nwoPost('api-cosmos.php?action=generate_scene', args)));

  // ══════════════════════════════════════════════════════════════════════════
  // 8. EMBODIMENT & CALIBRATION
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('list_embodiments',
    'List all supported robot embodiments filterable by type',
    { filter_type: z.string().optional().describe('manipulator | mobile | humanoid | mobile_arm') },
    async ({ filter_type }) =>
      text(await nwoGet(
        `api-embodiment.php?action=list${filter_type ? `&filter_type=${filter_type}` : ''}`
      )));

  server.tool('get_robot_specs',
    'Get full specifications for a robot type: DOF, joint limits, sensors, max speed',
    { robot_type: z.string().describe('e.g. ur5e, panda, spot, g1') },
    async ({ robot_type }) =>
      text(await nwoGet(`api-embodiment.php?action=detail&robot_type=${robot_type}`)));

  server.tool('get_normalization',
    'Get joint normalization parameters (min, max, mean, std) needed for VLA inference',
    { robot_type: z.string() },
    async ({ robot_type }) =>
      text(await nwoGet(`api-embodiment.php?action=normalization&robot_type=${robot_type}`)));

  server.tool('download_urdf',
    'Get URDF robot model XML for a given robot type',
    { robot_type: z.string() },
    async ({ robot_type }) =>
      text(await nwoGet(`api-embodiment.php?action=urdf&robot_type=${robot_type}`)));

  server.tool('get_test_results',
    'Get LIBERO, CALVIN, and SimplerEnv benchmark results for a robot type',
    { robot_type: z.string() },
    async ({ robot_type }) =>
      text(await nwoGet(`api-embodiment.php?action=test_results&robot_type=${robot_type}`)));

  server.tool('compare_robots',
    'Compare multiple robot types on DOF, speed, accuracy, and other fields',
    {
      robot_types:    z.array(z.string()).min(2).describe('e.g. ["ur5e", "panda", "spot"]'),
      compare_fields: z.array(z.string()).optional().default(['dof', 'speed', 'accuracy']),
    },
    async (args) =>
      text(await nwoPost('api-embodiment.php?action=compare', args)));

  server.tool('run_calibration',
    'Run automatic calibration on a robot (joint offset, force-torque, camera extrinsic)',
    {
      agent_id:         z.string(),
      calibration_type: z.enum(['joint_offset', 'force_torque', 'camera_extrinsic'])
        .optional().default('joint_offset'),
      method:           z.string().optional().default('automatic'),
      samples:          z.number().int().optional().default(100),
    },
    async (args) =>
      text(await nwoPost('api-calibration.php?action=run_calibration', args)));

  server.tool('calibrate_confidence',
    'Calibrate raw model confidence score to a calibrated success probability with CI',
    {
      model_confidence: z.number().min(0).max(1),
      model_id:         z.string().optional(),
    },
    async (args) =>
      text(await nwoPost('api-calibration.php?action=calibrate', args)));

  // ══════════════════════════════════════════════════════════════════════════
  // 9. ONLINE RL & FINE-TUNING
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('start_rl_training',
    'Start an online RL training session with custom reward configuration',
    {
      agent_id:  z.string(),
      task_name: z.string(),
      reward_config: z.object({
        success_bonus:      z.number().optional().default(1.0),
        efficiency_penalty: z.number().optional().default(-0.01),
        safety_penalty:     z.number().optional().default(-10.0),
      }).optional(),
    },
    async (args) =>
      text(await nwoPost('api-online-rl.php?action=start_online_rl', args)));

  server.tool('submit_rl_telemetry',
    'Submit state/action/reward data to an active RL session for online policy update',
    {
      rl_session_id: z.string(),
      state:         z.array(z.number()),
      action:        z.array(z.number()),
      reward:        z.number(),
      telemetry:     z.record(z.unknown()).optional(),
    },
    async (args) =>
      text(await nwoPost('api-online-rl.php?action=submit_telemetry', args)));

  server.tool('create_finetune_dataset',
    'Create a fine-tuning dataset from logged task executions over a date range',
    {
      agent_id:   z.string(),
      start_date: z.string().describe('YYYY-MM-DD'),
      end_date:   z.string().describe('YYYY-MM-DD'),
      format:     z.enum(['json', 'parquet', 'lerobot']).optional().default('json'),
    },
    async (args) =>
      text(await nwoPost('api-fine-tune.php?action=create_dataset', args)));

  server.tool('start_finetune_job',
    'Start a LoRA fine-tuning job on a base VLA model using a prepared dataset',
    {
      dataset_id: z.string(),
      base_model: z.string().optional().default('xiaomi-robotics-0'),
      algorithm:  z.string().optional().default('LoRA'),
      rank:       z.number().int().optional().default(32),
    },
    async (args) =>
      text(await nwoPost('api-fine-tune.php?action=start_job', args)));

  // ══════════════════════════════════════════════════════════════════════════
  // 10. TACTILE SENSING (ORCA Hand)
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('read_tactile',
    'Read ORCA robot hand tactile sensor data (256 taxels per finger, force, slip)',
    {
      finger:      z.enum(['index', 'thumb', 'middle', 'ring', 'pinky', 'all'])
        .optional().default('all'),
      sensor_type: z.enum(['raw_taxels', 'force_vector', 'slip_detection'])
        .optional().default('force_vector'),
    },
    async ({ finger, sensor_type }) =>
      text(await nwoGet(
        `api-orca.php?action=get_tactile&finger=${finger}&sensor_type=${sensor_type}`
      )));

  server.tool('process_tactile',
    'Process tactile data to assess grip quality, object texture, recommended grip force',
    {
      agent_id:     z.string(),
      tactile_data: z.object({
        all_fingers:    z.array(z.unknown()).optional(),
        force_feedback: z.array(z.number()).optional(),
      }),
    },
    async (args) =>
      text(await nwoPost('api-tactile.php?action=process_input', args)));

  server.tool('detect_slip',
    'Detect object slip by comparing current vs previous tactile readings',
    {
      agent_id:         z.string(),
      current_tactile:  z.array(z.number()),
      previous_tactile: z.array(z.number()),
    },
    async (args) =>
      text(await nwoPost('api-tactile.php?action=slip_detection', args)));

  // ══════════════════════════════════════════════════════════════════════════
  // 11. DATASET HUB
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('list_datasets',
    'List Unitree G1 robot demonstration datasets — 1.54M+ episodes, 430+ hours, LeRobot format',
    {},
    async () => text(await nwoGet('api-unitree-datasets.php?action=list')));

  // ══════════════════════════════════════════════════════════════════════════
  // 12. CARDIAC IDENTITY — Relayer (Base Mainnet, Chain ID 8453)
  // Contracts: NWOIdentityRegistry 0x78455AFd5E5088F8B5fecA0523291A75De1dAfF8
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('cardiac_register_agent',
    'Register AI agent on Base mainnet. Returns permanent soul-bound rootTokenId.',
    {
      moonpay_wallet: z.string().describe('Agent Ethereum wallet address'),
      api_key_hash:   z.string().describe('keccak256(api_key) as 0x hex string'),
    },
    async ({ moonpay_wallet, api_key_hash }) =>
      text(await relayerPost('/relay/registerAgent', {
        moonpayWallet: moonpay_wallet, apiKeyHash: api_key_hash,
      })));

  server.tool('cardiac_identify_agent',
    'Look up an agent rootTokenId on-chain by their hashed API key',
    { api_key_hash: z.string().describe('keccak256(api_key) as 0x hex string') },
    async ({ api_key_hash }) =>
      text(await relayerPost('/read/identifyByAgentKey', { apiKeyHash: api_key_hash })));

  server.tool('cardiac_renew_key',
    'Renew agent API key binding on Base mainnet (requires EIP-712 agent signature)',
    {
      root_token_id:    z.string(),
      new_api_key_hash: z.string(),
      deadline:         z.number().int().describe('Unix timestamp deadline for signature'),
      agent_sig:        z.string().describe('EIP-712 agent signature 0x...'),
    },
    async ({ root_token_id, new_api_key_hash, deadline, agent_sig }) =>
      text(await relayerPost('/relay/renewAgentKey', {
        rootTokenId: root_token_id, newApiKeyHash: new_api_key_hash,
        deadline, agentSig: agent_sig,
      })));

  server.tool('cardiac_issue_credential',
    'Issue a verifiable credential to an identity (task_auth, capability, swarm_cmd, emergency)',
    {
      root_token_id:   z.string(),
      credential_type: z.string()
        .describe('keccak256 of credential name e.g. keccak256("task_auth")'),
      credential_hash: z.string(),
      expires_at:      z.number().int().describe('Unix timestamp for expiry'),
    },
    async ({ root_token_id, credential_type, credential_hash, expires_at }) =>
      text(await relayerPost('/relay/issueCredential', {
        rootTokenId: root_token_id, credentialType: credential_type,
        credentialHash: credential_hash, expiresAt: expires_at,
      })));

  server.tool('cardiac_check_credential',
    'Check if a rootTokenId currently holds a valid credential of the given type',
    {
      root_token_id:   z.string(),
      credential_type: z.string(),
    },
    async ({ root_token_id, credential_type }) =>
      text(await relayerPost('/read/hasValidCredential', {
        rootTokenId: root_token_id, credentialType: credential_type,
      })));

  server.tool('cardiac_grant_access',
    'Grant location access credential to an identity for a time window',
    {
      root_token_id:    z.string(),
      location_hash:    z.string(),
      duration_seconds: z.number().int().optional().default(3600),
    },
    async ({ root_token_id, location_hash, duration_seconds }) =>
      text(await relayerPost('/relay/grantAccess', {
        rootTokenId: root_token_id, locationHash: location_hash,
        durationSeconds: duration_seconds,
      })));

  server.tool('cardiac_get_nonce',
    'Get EIP-712 signing nonce for a wallet (required before relay message signing)',
    { wallet: z.string() },
    async ({ wallet }) =>
      text(await relayerPost('/read/nonce', { wallet })));

  server.tool('cardiac_check_access',
    'Check location access for a rootTokenId. Returns granted + deny reason code.',
    {
      root_token_id: z.string(),
      location_id:   z.string(),
    },
    async ({ root_token_id, location_id }) =>
      text(await relayerPost('/access/check', {
        rootTokenId: root_token_id, locationId: location_id,
      })));

  server.tool('cardiac_payment_process',
    'Process a payment via Cardiac NWOPaymentProcessor smart contract (0x4afa...)',
    {
      root_token_id: z.string(),
      terminal_id:   z.string(),
      amount_cents:  z.number().int(),
      currency_code: z.string().optional().default('USD'),
    },
    async ({ root_token_id, terminal_id, amount_cents, currency_code }) =>
      text(await relayerPost('/payment/process', {
        rootTokenId: root_token_id, terminalId: terminal_id,
        amountCents: amount_cents, currencyCode: currency_code,
      })));

  // ══════════════════════════════════════════════════════════════════════════
  // 13. CARDIAC ORACLE
  // ══════════════════════════════════════════════════════════════════════════

  server.tool('oracle_health',
    'Check Cardiac oracle: health, chain, relayer balance, ECG config',
    {},
    async () => {
      const res = await fetch(`${ORACLE_BASE}/health`);
      return text(await res.json());
    });

  server.tool('oracle_validate_ecg',
    'Validate ECG biometric data to prove human identity (10/min rate limit)',
    {
      wallet:   z.string(),
      ecg_data: z.object({
        samples:      z.array(z.number()).describe('ECG signal samples'),
        rr_intervals: z.array(z.number()).describe('RR intervals in ms'),
        sample_rate:  z.number().optional().default(512),
        device_type:  z.string().optional().default('apple_watch'),
      }),
    },
    async ({ wallet, ecg_data }) =>
      text(await oraclePost('/oracle/validate', {
        wallet,
        ecgData: {
          samples:     ecg_data.samples,
          rrIntervals: ecg_data.rr_intervals,
          sampleRate:  ecg_data.sample_rate,
          deviceType:  ecg_data.device_type,
        },
      })));

  server.tool('oracle_hash_ecg',
    'Compute a cardiac hash from ECG RR intervals without full validation',
    {
      wallet:       z.string(),
      rr_intervals: z.array(z.number()).describe('RR intervals in ms'),
    },
    async ({ wallet, rr_intervals }) =>
      text(await oraclePost('/oracle/hashECG', {
        wallet, ecgData: { rrIntervals: rr_intervals },
      })));

  server.tool('oracle_verify',
    'Verify a recent ECG validation is cached by cardiac hash (in-memory, resets on restart)',
    {
      wallet:       z.string(),
      cardiac_hash: z.string(),
    },
    async ({ wallet, cardiac_hash }) =>
      text(await oraclePost('/oracle/verify', { wallet, cardiacHash: cardiac_hash })));

  return server;
}

// ─── MCP Streamable HTTP ──────────────────────────────────────────────────────
// Sessions are stored so that initialize (POST #1) and tools/list (POST #2)
// hit the same transport instance — fixing the "Server not initialized" error.

const transports = new Map(); // sessionId → { transport, server }

app.post('/mcp', async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];

    // ── Existing session: reuse the already-initialized transport ─────────────
    if (sessionId && transports.has(sessionId)) {
      const { transport } = transports.get(sessionId);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // ── New session: build server + transport, then handle initialize ─────────
    const apiKey        = req.headers['x-api-key']        || process.env.NWO_API_KEY        || '';
    const agentId       = req.headers['x-agent-id']       || process.env.NWO_AGENT_ID       || '';
    const relayerSecret = req.headers['x-relayer-secret'] || process.env.NWO_RELAYER_SECRET  || '';
    const oracleSecret  = req.headers['x-oracle-secret']  || process.env.NWO_ORACLE_SECRET   || '';

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sid) => {
        transports.set(sid, { transport, server: mcpServer });
      },
    });

    const mcpServer = buildMcpServer(apiKey, agentId, relayerSecret, oracleSecret);

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);

  } catch (err) {
    console.error('MCP POST error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error', message: err.message });
  }
});

app.get('/mcp', async (req, res) => {
  const entry = transports.get(req.headers['mcp-session-id']);
  if (!entry) return res.status(404).json({ error: 'Session not found. POST /mcp first.' });
  await entry.transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const entry = transports.get(sessionId);
  if (entry) {
    await entry.transport.handleRequest(req, res);
    transports.delete(sessionId);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ NWO Robotics MCP Server v2.0.0 — port ${PORT}`);
  console.log(`   MCP:         POST https://nwo-chatgpt-app.onrender.com/mcp`);
  console.log(`   Health:      GET  https://nwo-chatgpt-app.onrender.com/health`);
  console.log(`   Server card: GET  https://nwo-chatgpt-app.onrender.com/.well-known/mcp/server-card.json`);
});
