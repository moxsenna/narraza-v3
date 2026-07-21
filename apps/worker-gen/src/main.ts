// @narraza/worker-gen — generation job worker host. Also hosts the outbox
// consumer module in Rilis 1 (D11). Real claim loop, lease/fence, and graceful
// shutdown land in M3; env wiring in W0.2. This is the M0 entrypoint stub.

function main(): void {
  console.error('[worker-gen] boot placeholder');
}

main();
