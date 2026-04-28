// Script to monitor provisioning logs in real-time
// Run this with: node monitor-provisioning.js

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Monitoring ReplyFlow provisioning logs...');
console.log('📋 Looking for these key events:');
console.log('   ✅ [Twilio Number Manager] Provisioning: Purchasing new Twilio number');
console.log('   ✅ [Twilio Number Manager] Provisioning: Successfully purchased number');
console.log('   ✅ [stripe-webhook] Business has no assigned Twilio number, provisioning one...');
console.log('   ✅ [stripe-webhook] Successfully provisioned Twilio number');
console.log('');

// Start the dev server to see logs
const devProcess = spawn('npm', ['run', 'dev'], {
  cwd: __dirname,
  stdio: 'inherit'
});

devProcess.on('close', (code) => {
  console.log(`Dev server exited with code ${code}`);
});

// You can also monitor Vercel logs separately for production webhook processing
