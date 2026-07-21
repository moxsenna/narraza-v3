// @narraza/worker-outbox — standalone outbox consumer entrypoint. In Rilis 1 the
// outbox consumer runs as a module inside worker-gen (D11); this separate
// entrypoint exists so splitting into its own PM2 process is config-only once an
// external channel arrives. M0 stub.

function main(): void {
  console.error('[worker-outbox] boot placeholder');
}

main();
