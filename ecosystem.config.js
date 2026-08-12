module.exports = {
  apps : [
    {
      name: "AntigravityBackend",
      script: "npm",
      args: "run start",
      cwd: "C:/vibe projects/Antigravity remote/backend",
      watch: false,
      autorestart: true
    },
    {
      name: "AntigravityTunnel",
      script: "powershell.exe",
      args: "-ExecutionPolicy Bypass -WindowStyle Hidden -File \"./scripts/start_tunnel.ps1\"",
      cwd: "C:/vibe projects/Antigravity remote/backend",
      watch: false,
      autorestart: true
    }
  ]
};
