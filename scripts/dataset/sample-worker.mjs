// Worker thread: receive one item at a time, process it, post the record back.
// The config is passed once via workerData. An uncaught throw here surfaces as
// the Worker 'error' event on the main thread, which fails the whole run.

import { parentPort, workerData } from 'node:worker_threads'
import { processItem } from './sample.mjs'

const cfg = workerData.config

parentPort.on('message', (msg) => {
  if (msg.type === 'stop') {
    parentPort.close()
    return
  }
  // worker_threads postMessage takes no targetOrigin (this is not window).
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  parentPort.postMessage({ type: 'record', record: processItem(msg.item, cfg) })
})
