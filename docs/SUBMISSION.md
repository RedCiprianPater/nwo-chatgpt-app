# OpenAI App Store Submission Guide

## Prerequisites

- GitHub repository with public visibility
- Privacy policy (PRIVACY.md)
- Terms of service (LEGAL.md)
- App manifest (app.json)

## Submission Steps

### 1. Prepare Repository
Ensure all files are in place:
- [ ] app.json
- [ ] README.md
- [ ] LICENSE
- [ ] LEGAL.md
- [ ] PRIVACY.md
- [ ] package.json
- [ ] .gitignore
- [ ] src/mcp-server.js
- [ ] ui/widget.html
- [ ] docs/README.md
- [ ] docs/SUBMISSION.md

### 2. Submit to OpenAI

1. Go to https://platform.openai.com/apps
2. Click "Create new app"
3. Fill in the form:
   - **Name**: NWO Robotics
   - **Description**: Control robots, IoT devices, and robot swarms through natural language
   - **Manifest URL**: `https://raw.githubusercontent.com/RedCiprianPater/nwo-chatgpt-app/main/app.json`
   - **Privacy Policy URL**: `https://github.com/RedCiprianPater/nwo-chatgpt-app/blob/main/PRIVACY.md`
   - **Terms of Service URL**: `https://github.com/RedCiprianPater/nwo-chatgpt-app/blob/main/LEGAL.md`

### 3. Wait for Review

- Review time: 5-10 business days
- OpenAI will test the MCP endpoints
- You may receive feedback for changes

### 4. After Approval

Once approved:
- OpenAI automatically creates a Codex plugin
- The app appears in ChatGPT's app directory
- Users can start using it immediately

## Troubleshooting

### Manifest Validation Failed
- Ensure app.json is valid JSON
- Check all URLs are accessible
- Verify schema_version is "v1"

### Endpoint Not Responding
- Check MCP server is running
- Verify HTTPS is enabled
- Test with curl: `curl -X POST https://api.nwo.capital/mcp -H "Content-Type: application/json"`

### Privacy Policy Issues
- Ensure policy covers data collection
- Include contact information
- State data retention period

## Contact

For support: support@nwo.capital