# NWO Robotics MCP Server - Technical Documentation

## Architecture

The MCP server is built on Node.js with Express, providing HTTP endpoints for ChatGPT integration.

## Endpoints

### MCP Endpoint
```
POST /mcp
Content-Type: application/json
X-API-Key: your-api-key
```

### Health Check
```
GET /health
```

## Tool Categories

### Core Robotics (15 tools)
- `robot_control` - Direct robot movement commands
- `vla_inference` - Visual-Language-Action processing
- `task_planning` - AI task decomposition
- `sensor_fusion` - Multi-sensor integration
- `agent_management` - Agent lifecycle
- And 10 more...

### Agent Discovery (5 tools)
- `health_check` - System status
- `capabilities` - Available features
- `dry_run` - Test commands
- `planning` - Execution planning
- `discovery` - Find agents

### Simulation (6 tools)
- `trajectory_sim` - Path simulation
- `collision_detect` - Collision checking
- `torque_calc` - Torque calculations
- `grasp_sim` - Grasp simulation
- `motion_plan` - Motion planning
- `physics_sim` - Physics simulation

### Embodiment (6 tools)
- `robot_specs` - Robot specifications
- `urdf_parse` - URDF parsing
- `kinematics` - Kinematic calculations
- `dynamics` - Dynamic modeling
- `workspace` - Workspace analysis
- `comparison` - Robot comparisons

### Swarm (3 tools)
- `swarm_join` - Join swarm
- `swarm_leave` - Leave swarm
- `swarm_broadcast` - Broadcast to swarm

### Tasks (2 tools)
- `task_list` - List tasks
- `task_history` - Task history

### IoT (2 tools)
- `iot_command` - Send IoT commands
- `iot_status` - Get IoT status

### Safety (2 tools)
- `safety_check` - Safety validation
- `emergency_stop` - Emergency stop

### Models (4 tools)
- `model_list` - List models
- `model_info` - Model details
- `model_upload` - Upload models
- `model_delete` - Delete models

## Authentication

All requests require an API key in the `X-API-Key` header.

## Response Format

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation completed"
}
```