import { spawn } from 'child_process';

const PORT = 3001;

// Rebuild le bundle à chaque sauvegarde
const builder = spawn('npx', ['vite', 'build', '--watch'], {
  stdio: ['ignore', 'inherit', 'inherit'],
});

// Sert dist/ en HTTP avec CORS + pas de cache
const server = spawn('npx', ['http-server', 'dist', `-p${PORT}`, '--cors', '-c-1', '-s'], {
  stdio: 'ignore',
});

// Lance le tunnel cloudflared après le premier build (~3s)
setTimeout(() => {
  const tunnel = spawn('npx', ['cloudflared', 'tunnel', '--url', `http://localhost:${PORT}`], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  tunnel.stderr.on('data', data => {
    const line = data.toString();
    const match = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (match) {
      console.log('\n──────────────────────────────────────────────');
      console.log('  URL Webflow (copie dans <script src="">)  ');
      console.log('──────────────────────────────────────────────');
      console.log(`\n  ${match[0]}/main.js\n`);
      console.log('──────────────────────────────────────────────');
      console.log('  Ctrl+C pour arrêter\n');
    }
  });
}, 3000);

function cleanup() {
  builder.kill();
  server.kill();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
