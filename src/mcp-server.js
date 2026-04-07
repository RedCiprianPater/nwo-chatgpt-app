/**
 * NWO Robotics MCP Server - SSE Version
 * Model Context Protocol server with Server-Sent Events support
 * 
 * @version 1.0.0
 * @author RedCiprianPater
 * @license MIT
 */

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - allow all origins
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());

// Store connected clients
const clients = new Map();

// SSE at root - always returns SSE (no JSON fallback)
app.get('/', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  
  // Disable compression for SSE
  res.setHeader('Content-Encoding', 'identity');
  
  const clientId = Date.now().toString();
  clients.set(clientId, res);
  
  console.log(`SSE Client connected: ${clientId}`);
  
  // Send initial events immediately with flush
  res.write(`:ok\n\n`); // SSE comment to establish connection
  
  res.write(`event: connected\n`);
  res.write(`data: ${JSON.stringify({
    clientId,
    message: 'Connected to NWO Robotics MCP Server',
    version: '1.0.0'
  })}\n\n`);
  
  if (res.flush) res.flush();
  
  // Send tools list
  res.write(`event: tools\n`);
  res.write(`data: ${JSON.stringify({
    tools: getToolDefinitions()
  })}\n\n`);
  
  if (res.flush) res.flush();
  
  // Keep connection alive with frequent heartbeat (Render timeout ~15s)
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`); // Comment keeps connection alive
    if (res.flush) res.flush();
  }, 10000); // Every 10 seconds
  
  // Handle disconnect
  req.on('close', () => {
    clearInterval(heartbeat);
    clients.delete(clientId);
    console.log(`SSE Client disconnected: ${clientId}`);
  });
  
  req.on('error', (err) => {
    console.error(`SSE Client error: ${err.message}`);
  });
});

// POST endpoint for tool execution
app.post('/messages', async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const { tool, params, clientId } = req.body;
  
  try {
    const result = await executeTool(tool, params);
    
    // Send result back via SSE if client is connected
    const client = clients.get(clientId);
    if (client) {
      client.write(`event: result\n`);
      client.write(`data: ${JSON.stringify({
        tool,
        result
      })}\n\n`);
    }
    
    res.json({ success: true, clientId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// OPTIONS for CORS preflight
app.options('/messages', (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.status(200).end();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '1.0.0',
    connectedClients: clients.size,
    timestamp: new Date().toISOString()
  });
});

// Get tool definitions
function getToolDefinitions() {
  return [
    {
      name: 'robot_control',
      description: 'Control robot movement and actions',
      parameters: {
        type: 'object',
        properties: {
          robotId: { type: 'string' },
          command: { type: 'string', enum: ['move', 'grasp', 'release', 'rotate', 'stop'] },
          args: { type: 'object' }
        },
        required: ['robotId', 'command']
      }
    },
    {
      name: 'vla_inference',
      description: 'Visual-Language-Action model inference',
      parameters: {
        type: 'object',
        properties: {
          image: { type: 'string' },
          instruction: { type: 'string' }
        },
        required: ['instruction']
      }
    },
    {
      name: 'task_planning',
      description: 'Plan and decompose tasks',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          constraints: { type: 'object' }
        },
        required: ['task']
      }
    },
    {
      name: 'swarm_broadcast',
      description: 'Send command to robot swarm',
      parameters: {
        type: 'object',
        properties: {
          swarmId: { type: 'string' },
          command: { type: 'string' }
        },
        required: ['swarmId', 'command']
      }
    },
    {
      name: 'iot_command',
      description: 'Send command to IoT device',
      parameters: {
        type: 'object',
        properties: {
          deviceId: { type: 'string' },
          command: { type: 'string' },
          value: { type: 'string' }
        },
        required: ['deviceId', 'command']
      }
    },
    {
      name: 'emergency_stop',
      description: 'Emergency stop all robots',
      parameters: {
        type: 'object',
        properties: {
          robotId: { type: 'string' }
        }
      }
    }
  ];
}

// Tool execution
async function executeTool(tool, params) {
  const tools = {
    robot_control: async (p) => ({
      robotId: p.robotId,
      command: p.command,
      status: 'executed',
      timestamp: new Date().toISOString()
    }),
    
    vla_inference: async (p) => ({
      action: 'grasp',
      target: 'object',
      confidence: 0.95
    }),
    
    task_planning: async (p) => ({
      steps: [
        { id: 1, action: 'move_to', target: 'location_a' },
        { id: 2, action: 'grasp', target: 'object' },
        { id: 3, action: 'move_to', target: 'location_b' },
        { id: 4, action: 'place', target: 'object' }
      ],
      estimatedTime: '45s'
    }),
    
    swarm_broadcast: async (p) => ({
      swarmId: p.swarmId,
      command: p.command,
      recipients: 10,
      status: 'broadcasted'
    }),
    
    iot_command: async (p) => ({
      deviceId: p.deviceId,
      command: p.command,
      value: p.value,
      status: 'executed'
    }),
    
    emergency_stop: async (p) => ({
      robotId: p.robotId || 'all',
      status: 'stopped',
      timestamp: new Date().toISOString()
    })
  };
  
  if (!tools[tool]) {
    throw new Error(`Unknown tool: ${tool}`);
  }
  
  return await tools[tool](params);
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`NWO Robotics MCP Server running on port ${PORT}`);
  console.log(`SSE endpoint: http://0.0.0.0:${PORT}/`);
});

module.exports = app;