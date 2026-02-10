const hud = require('hud-sdk/setup');
const { execSync } = require('child_process');

// Get git commit hash
let gitCommitHash = process.env.GIT_COMMIT_HASH || 'unknown';
if (gitCommitHash === 'unknown') {
  try {
    gitCommitHash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    // Git not available, use unknown
  }
}

// Register Hud - don't instrument node_modules unless needed
hud.register({
  includeModules: [],
});

// Initialize Hud session with API key and service name
const hudApiKey = process.env.HUD_API_KEY;
if (!hudApiKey) {
  console.warn('HUD_API_KEY environment variable is not set. Hud monitoring will not be initialized.');
} else {
  void hud.initSession(hudApiKey, 'magician-props-api', {
    tags: {
      commit: gitCommitHash,
    },
  });
}
