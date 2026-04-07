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
const helmet = require('helmet');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Store connected clients
const clients = new Map();

// SSE Endpoint - This is what OpenAI connects to
app.get('/sse', (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const clientId = Date.now().toString();
  clients.set(clientId, res);
  
  console.log(`Client connected: ${clientId}`);
  
  // Send initial connection message
  res.write(`data: ${JSON.stringify({
    type: 'connection',
    clientId,
    message: 'Connected to NWO Robotics MCP Server'
  })}\n\n`);
  
  // Send capabilities
  res.write(`data: ${JSON.stringify({
    type: 'capabilities',
    tools: getToolDefinitions()
  })}\n\n`);
  
  // Handle client disconnect
  req.on('close', () => {
    clients.delete(clientId);
    console.log(`Client disconnected: ${clientId}`);
  });
});

// POST endpoint for tool execution (called by OpenAI)
app.post('/messages', async (req, res) => {
  const { tool, params, clientId } = req.body;
  
  try {
    const result = await executeTool(tool, params);
    
    // Send result back via SSE if client is connected
    const client = clients.get(clientId);
    if (client) {
      client.write(`data: ${JSON.stringify({
        type: 'tool_result',
        tool,
        result
      })}\n\n`);
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '1.0.0',
    connectedClients: clients.size
  });
});

// Get tool definitions for MCP
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

// Start server
app.listen(PORT, () => {
  console.log(`NWO Robotics MCP Server (SSE) running on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Messages endpoint: http://localhost:${PORT}/messages`);
});

module.exports = app;