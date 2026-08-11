module.exports = {
  apps: [
    {
      name: 'web',
      cwd: 'apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
    },
    {
      name: 'worker',
      script: 'apps/worker-gen/dist/main.js',
      env: {
        JOB_PROCESSOR_ENABLED: 'false',
        JOB_SHUTDOWN_DRAIN_MS: '30000',
      },
      kill_timeout: 35000,
    },
  ],
};
