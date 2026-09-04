/**
 * A {@link HelperPool} backed by Node `worker_threads` — the Node counterpart of
 * the `MessagePort`s a browser consumer transfers into the vectorizer worker.
 * Used by the bench (`--workers N`) and by the engine's parallel-path tests, so
 * both exercise real cross-thread transfers rather than an in-process stub.
 *
 * Each helper is a thread running `helper-entry.mjs` and reached through one end
 * of a `MessageChannel`; `execArgv: []` keeps the parent's TypeScript loader
 * flags out of the child, which registers its own.
 */
import { MessageChannel, Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { HelperPool } from '@trazor/engine'

export interface NodeHelpers {
  pool: HelperPool
  /** Resolves once every thread has loaded the engine and is answering jobs. */
  ready: Promise<void>
  /** Terminate every helper thread. */
  dispose(): Promise<void>
}

export function createNodeHelpers(size: number): NodeHelpers {
  const entry = fileURLToPath(new URL('./helper-entry.mjs', import.meta.url))
  const workers: Worker[] = []
  const ports: MessagePort[] = []
  const hellos: Promise<void>[] = []
  for (let i = 0; i < size; i++) {
    const { port1, port2 } = new MessageChannel()
    workers.push(
      new Worker(entry, { workerData: { port: port2 }, transferList: [port2], execArgv: [] }),
    )
    hellos.push(
      new Promise<void>((resolve) => {
        port1.addEventListener('message', (ev: { data: unknown }) => {
          if ((ev.data as { type?: string }).type === 'helper-hello') resolve()
        })
      }),
    )
    ports.push(port1 as unknown as MessagePort)
  }
  return {
    pool: new HelperPool(ports),
    ready: Promise.all(hellos).then(() => undefined),
    dispose: async () => {
      await Promise.all(workers.map((w) => w.terminate()))
    },
  }
}
