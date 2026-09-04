/**
 * Node helper-worker entry. Registers the TypeScript loader for this thread (the
 * packages export `.ts` source directly, and a worker does not inherit the
 * parent's loader hooks), then wires the engine's helper handler to the
 * `MessagePort` the parent transferred in `workerData` — the same port surface a
 * browser consumer hands over, so this thread runs the identical code path.
 */
import { workerData } from 'node:worker_threads'
import { register } from 'tsx/esm/api'

register()

const { installHelperHandler } = await import('@trazor/engine')
const port = workerData.port
installHelperHandler(port)

// Announce readiness: the thread has compiled and linked the engine, so the
// parent can start timing without the first job paying for module loading. The
// pool ignores messages that carry no job id.
const announce = port.postMessage.bind(port)
announce({ type: 'helper-hello' })
