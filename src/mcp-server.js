/**
 * NWO Robotics MCP Server
 * Implements MCP over Streamable HTTP transport (required by OpenAI + Smithery)
 * 
 * Fixes applied vs original:
 *  1. Uses @modelcontextprotocol/sdk StreamableHTTPServerTransport (not raw SSE)
 *  2. Serves /.well-known/mcp/server-card.json  → fixes Smithery 404
 *  3. Serves /health                             → fixes Render cold-start & OpenAI timeout
 *  4. Proper CORS headers for OpenAI origin
 *  5. render.yaml upgraded to starter plan (no more sleep)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

const PORT = process.env.PORT || 10000;
const NWO_API_BASE = process.env.NWO_API_BASE || 'https://nwo.capital/webapp';

// ─── Express app ─────────────────────────────────────────────────────────────

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));

// Allow OpenAI, Smithery, and local dev origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Mcp-Session-Id'],
  exposedHeaders: ['Mcp-Session-Id'],
}));

app.use(express.json({ limit: '4mb' }));

// ─── Health / keep-alive (required by Render + probed by OpenAI) ─────────────

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    server: 'NWO Robotics MCP',
    version: '1.0.0',
    transport: 'streamable-http',
    mcpEndpoint: '/mcp',
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Smithery server card (fixes "404 on scan") ───────────────────────────────
// Reference: https://smithery.ai/docs/build/publish#troubleshooting

app.get('/.well-known/mcp/server-card.json', (req, res) => {
  res.json({
    serverInfo: {
      name: 'NWO Robotics MCP Server',
      version: '1.0.0',
      description:
        'Control robots, IoT devices, and swarms via natural language. ' +
        '60+ tools across robot control, VLA inference, swarm coordination, IoT, and safety.',
    },
    authentication: {
      required: false,
    },
    tools: [
      // Core robotics
      { name: 'get_robot_status',     description: 'Get status of all connected robots',           inputSchema: { type: 'object', properties: { robot_id: { type: 'string' } }, required: [] } },
      { name: 'execute_robot_task',   description: 'Send a VLA command to a specific robot',       inputSchema: { type: 'object', properties: { robot_id: { type: 'string' }, instruction: { type: 'string' }, coordinates: { type: 'object' } }, required: ['robot_id', 'instruction'] } },
      { name: 'move_robot',           description: 'Navigate robot to XY coordinates',             inputSchema: { type: 'object', properties: { robot_id: { type: 'string' }, x: { type: 'number' }, y: { type: 'number' } }, required: ['robot_id', 'x', 'y'] } },
      { name: 'stop_robot',           description: 'Emergency stop a robot',                       inputSchema: { type: 'object', properties: { robot_id: { type: 'string' } }, required: ['robot_id'] } },
      { name: 'get_robot_telemetry',  description: 'Real-time sensor data from a robot',           inputSchema: { type: 'object', properties: { robot_id: { type: 'string' } }, required: ['robot_id'] } },
      // IoT
      { name: 'query_sensors',        description: 'Query IoT sensors by location and type',       inputSchema: { type: 'object', properties: { location: { type: 'string' }, sensor_type: { type: 'string' } }, required: ['location'] } },
      { name: 'get_sensor_data',      description: 'Get data from a specific sensor',              inputSchema: { type: 'object', properties: { sensor_id: { type: 'string' } }, required: ['sensor_id'] } },
      { name: 'control_actuator',     description: 'Control motors, servos, or actuators',         inputSchema: { type: 'object', properties: { actuator_id: { type: 'string' }, command: { type: 'string' } }, required: ['actuator_id', 'command'] } },
      // Agent management
      { name: 'register_agent',       description: 'Self-register as a new AI agent',              inputSchema: { type: 'object', properties: { wallet_address: { type: 'string' }, agent_name: { type: 'string' }, capabilities: { type: 'array', items: { type: 'string' } } }, required: ['wallet_address', 'agent_name'] } },
      { name: 'check_balance',        description: 'Check remaining API quota',                    inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'upgrade_tier',         description: 'Pay with ETH for tier upgrade',                inputSchema: { type: 'object', properties: { tier: { type: 'string' } }, required: ['tier'] } },
      { name: 'get_agent_info',       description: 'Get agent account profile info',               inputSchema: { type: 'object', properties: {}, required: [] } },
      // Multi-agent / swarm
      { name: 'list_agents',          description: 'List agents in the swarm',                     inputSchema: { type: 'object', properties: {}, required: [] } },
      { name: 'coordinate_task',      description: 'Coordinate a multi-robot task',                inputSchema: { type: 'object', properties: { task: { type: 'string' }, robot_ids: { type: 'array', items: { type: 'string' } } }, required: ['task'] } },
      { name: 'share_resource',       description: 'Share a robot with another agent',             inputSchema: { type: 'object', properties: { robot_id: { type: 'string' }, target_agent: { type: 'string' } }, required: ['robot_id', 'target_agent'] } },
      // Safety
      { name: 'safety_check',         description: 'Run pre-task safety validation',               inputSchema: { type: 'object', properties: { robot_id: { type: 'string' }, task: { type: 'string' } }, required: ['robot_id', 'task'] } },
      { name: 'emergency_stop_all',   description: 'Emergency stop ALL robots immediately',        inputSchema: { type: 'object', properties: {}, required: [] } },
      // Vision
      { name: 'detect_objects',       description: 'Detect objects via robot camera feed',         inputSchema: { type: 'object', properties: { robot_id: { type: 'string' } }, required: ['robot_id'] } },
    ],
    resources: [],
    prompts: [],
  });
});

// ─── MCP Server (tool definitions + handlers) ────────────────────────────────

function buildMcpServer(apiKey, agentId) {
  const server = new McpServer({
    name: 'NWO Robotics MCP Server',
    version: '1.0.0',
  });

  const headers = () => ({
    'Content-Type': 'application/json',
    ...(apiKey  ? { 'X-API-Key':  apiKey }  : {}),
    ...(agentId ? { 'X-Agent-ID': agentId } : {}),
  });

  const nwoFetch = async (path, method = 'GET', body = null) => {
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${NWO_API_BASE}${path}`, opts);
    return res.json();
  };

  // ── Core robotics ───────────────────────────────────────────────────────────

  server.tool('get_robot_status', 'Get status of all connected robots',
    { robot_id: z.string().optional() },
    async ({ robot_id }) => {
      const path = robot_id ? `/robots/${robot_id}/status` : '/robots/status';
      const data = await nwoFetch(path);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('execute_robot_task', 'Send a VLA command to a robot',
    { robot_id: z.string(), instruction: z.string(), coordinates: z.object({ x: z.number(), y: z.number() }).optional() },
    async ({ robot_id, instruction, coordinates }) => {
      const data = await nwoFetch(`/robots/${robot_id}/task`, 'POST', { instruction, coordinates });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('move_robot', 'Navigate robot to XY coordinates',
    { robot_id: z.string(), x: z.number(), y: z.number(), speed: z.number().optional() },
    async ({ robot_id, x, y, speed }) => {
      const data = await nwoFetch(`/robots/${robot_id}/move`, 'POST', { x, y, speed });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('stop_robot', 'Emergency stop a robot',
    { robot_id: z.string() },
    async ({ robot_id }) => {
      const data = await nwoFetch(`/robots/${robot_id}/stop`, 'POST');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('get_robot_telemetry', 'Real-time sensor data from a robot',
    { robot_id: z.string() },
    async ({ robot_id }) => {
      const data = await nwoFetch(`/robots/${robot_id}/telemetry`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  // ── IoT & sensors ───────────────────────────────────────────────────────────

  server.tool('query_sensors', 'Query IoT sensors by location and type',
    { location: z.string(), sensor_type: z.string().optional() },
    async ({ location, sensor_type }) => {
      const params = new URLSearchParams({ location, ...(sensor_type ? { sensor_type } : {}) });
      const data = await nwoFetch(`/sensors?${params}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('get_sensor_data', 'Get data from a specific sensor',
    { sensor_id: z.string() },
    async ({ sensor_id }) => {
      const data = await nwoFetch(`/sensors/${sensor_id}`);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('control_actuator', 'Control motors, servos, or actuators',
    { actuator_id: z.string(), command: z.string(), value: z.number().optional() },
    async ({ actuator_id, command, value }) => {
      const data = await nwoFetch(`/actuators/${actuator_id}/control`, 'POST', { command, value });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  // ── Agent management ────────────────────────────────────────────────────────

  server.tool('register_agent', 'Self-register as a new AI agent',
    { wallet_address: z.string(), agent_name: z.string(), capabilities: z.array(z.string()).optional() },
    async ({ wallet_address, agent_name, capabilities }) => {
      const data = await nwoFetch('/agents/register', 'POST', { wallet_address, agent_name, capabilities });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('check_balance', 'Check remaining API quota and usage',
    {},
    async () => {
      const data = await nwoFetch('/agents/balance');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('upgrade_tier', 'Pay with ETH for a tier upgrade',
    { tier: z.enum(['prototype', 'production']) },
    async ({ tier }) => {
      const data = await nwoFetch('/agents/upgrade', 'POST', { tier });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('get_agent_info', 'Get agent account profile info',
    {},
    async () => {
      const data = await nwoFetch('/agents/me');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  // ── Multi-agent / swarm ─────────────────────────────────────────────────────

  server.tool('list_agents', 'List all agents in the swarm',
    { swarm_id: z.string().optional() },
    async ({ swarm_id }) => {
      const path = swarm_id ? `/swarms/${swarm_id}/agents` : '/agents';
      const data = await nwoFetch(path);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('coordinate_task', 'Coordinate a multi-robot task across a swarm',
    { task: z.string(), robot_ids: z.array(z.string()).optional() },
    async ({ task, robot_ids }) => {
      const data = await nwoFetch('/swarms/coordinate', 'POST', { task, robot_ids });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('share_resource', 'Share a robot with another agent',
    { robot_id: z.string(), target_agent: z.string() },
    async ({ robot_id, target_agent }) => {
      const data = await nwoFetch('/swarms/share', 'POST', { robot_id, target_agent });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  // ── Safety ──────────────────────────────────────────────────────────────────

  server.tool('safety_check', 'Run pre-task safety validation for a robot',
    { robot_id: z.string(), task: z.string() },
    async ({ robot_id, task }) => {
      const data = await nwoFetch(`/robots/${robot_id}/safety-check`, 'POST', { task });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  server.tool('emergency_stop_all', 'Emergency stop ALL robots immediately',
    {},
    async () => {
      const data = await nwoFetch('/robots/emergency-stop', 'POST');
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  // ── Vision ──────────────────────────────────────────────────────────────────

  server.tool('detect_objects', 'Detect objects via robot camera',
    { robot_id: z.string(), confidence_threshold: z.number().min(0).max(1).optional() },
    async ({ robot_id, confidence_threshold }) => {
      const data = await nwoFetch(`/robots/${robot_id}/detect`, 'POST', { confidence_threshold });
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    });

  return server;
}

// ─── MCP Streamable HTTP endpoint ────────────────────────────────────────────
// This is the transport OpenAI and Smithery both require.
// POST /mcp  → handles JSON-RPC requests
// GET  /mcp  → handles SSE streams (optional, for backward compat)
// DELETE /mcp → closes session

const transports = new Map(); // sessionId → transport

app.post('/mcp', async (req, res) => {
  try {
    const apiKey  = req.headers['x-api-key']  || process.env.NWO_API_KEY  || '';
    const agentId = req.headers['x-agent-id'] || process.env.NWO_AGENT_ID || '';

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (sessionId) => {
        transports.set(sessionId, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) transports.delete(transport.sessionId);
    };

    const server = buildMcpServer(apiKey, agentId);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error('MCP POST error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: err.message });
    }
  }
});

app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports.get(sessionId);
  if (!transport) {
    return res.status(404).json({ error: 'Session not found. Start a session with POST /mcp first.' });
  }
  await transport.handleRequest(req, res);
});

app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports.get(sessionId);
  if (transport) {
    await transport.handleRequest(req, res);
    transports.delete(sessionId);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// ─── Start ───────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ NWO Robotics MCP Server running on port ${PORT}`);
  console.log(`   MCP endpoint:   POST https://nwo-chatgpt-app.onrender.com/mcp`);
  console.log(`   Health check:   GET  https://nwo-chatgpt-app.onrender.com/health`);
  console.log(`   Server card:    GET  https://nwo-chatgpt-app.onrender.com/.well-known/mcp/server-card.json`);
});
