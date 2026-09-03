import { describe, expect, it } from 'vitest'
import type { RasterImage, VectorizeResult, VectorizeSettings } from '@trazor/core'
import { DEFAULT_SETTINGS } from '@trazor/core'
import { TrazorPool } from '../src/pool'
import type { WorkerInMessage, WorkerOutMessage } from '../src/protocol'

const IMAGE: RasterImage = { width: 2, height: 2, data: new Uint8ClampedArray(2 * 2 * 4) }

function fakeResult(id: number, affinity: string | undefined): VectorizeResult {
  return {
    svg: `<svg data-id="${id}" data-aff="${affinity ?? ''}"/>`,
    width: 2,
    height: 2,
    palette: [],
    stats: { pathCount: 1, nodeCount: 1, colorCount: 1, byteLength: 10, durationMs: 1, stages: [] },
    warnings: [],
  }
}

/** Shared counters so a test can observe pool concurrency across workers. */
class Tracker {
  inFlight = 0
  maxInFlight = 0
}

/**
 * A fake vectorizer worker: records the affinity keys it is dispatched and
 * resolves each job on a microtask (so the pool assigns a whole round before any
 * job settles). Never resolves a cancelled job.
 */
class FakeWorker {
  static all: FakeWorker[] = []
  affinities: (string | undefined)[] = []
  private listener: ((ev: { data: unknown }) => void) | null = null
  private cancelled = new Set<number>()

  constructor(
    private tracker: Tracker,
    private settingsAffinity: (s: VectorizeSettings) => string | undefined,
  ) {
    FakeWorker.all.push(this)
  }

  addEventListener(type: string, fn: (ev: { data: unknown }) => void): void {
    if (type === 'message') this.listener = fn
  }

  postMessage(msg: WorkerInMessage): void {
    if (msg.type === 'cancel') {
      this.cancelled.add(msg.id)
      return
    }
    if (msg.type !== 'vectorize') return
    const aff = this.settingsAffinity(msg.settings)
    this.affinities.push(aff)
    this.tracker.inFlight++
    this.tracker.maxInFlight = Math.max(this.tracker.maxInFlight, this.tracker.inFlight)
    const id = msg.id
    void Promise.resolve().then(() => {
      this.tracker.inFlight--
      if (this.cancelled.has(id)) return
      this.emit({ type: 'result', id, result: fakeResult(id, aff) })
    })
  }

  terminate(): void {}

  private emit(msg: WorkerOutMessage): void {
    this.listener?.({ data: msg })
  }
}

function makePool(size: number, affinityOf: (s: VectorizeSettings) => string | undefined) {
  const tracker = new Tracker()
  FakeWorker.all = []
  const pool = new TrazorPool(() => new FakeWorker(tracker, affinityOf) as unknown as Worker, size)
  return { pool, tracker }
}

const settingsWith = (smoothing: number): VectorizeSettings => ({ ...DEFAULT_SETTINGS, smoothing })

describe('TrazorPool', () => {
  it('runs many jobs to completion, capped at the pool size', async () => {
    const { pool, tracker } = makePool(2, () => undefined)
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => pool.run(IMAGE, settingsWith(i / 10))),
    )
    expect(results).toHaveLength(6)
    expect(new Set(results.map((r) => r.svg)).size).toBe(6) // each job's own result
    expect(tracker.maxInFlight).toBeLessThanOrEqual(2)
    expect(tracker.maxInFlight).toBe(2)
    pool.dispose()
  })

  it('prefers the warm worker for a matching affinity key', async () => {
    // Affinity key = the smoothing value, so 'a' and 'b' are two palette groups.
    const affinityOf = (s: VectorizeSettings): string => (s.smoothing < 0.5 ? 'a' : 'b')
    const { pool } = makePool(2, affinityOf)

    // Warm worker 0 with an 'a' job and let it finish.
    await pool.run(IMAGE, settingsWith(0.1), { affinityKey: 'a' })

    // Now enqueue an 'a' and a 'b' job together: 'a' should land on worker 0.
    const pa = pool.run(IMAGE, settingsWith(0.2), { affinityKey: 'a' })
    const pb = pool.run(IMAGE, settingsWith(0.9), { affinityKey: 'b' })
    await Promise.all([pa, pb])

    const worker0 = FakeWorker.all[0]
    const worker1 = FakeWorker.all[1]
    expect(worker0.affinities).toEqual(['a', 'a']) // both 'a' jobs on the warm worker
    expect(worker1.affinities).toEqual(['b'])
    pool.dispose()
  })

  it('cancelAll rejects queued and in-flight jobs with CancelledError', async () => {
    const { pool } = makePool(1, () => undefined)
    const jobs = [
      pool.run(IMAGE, settingsWith(0.1)),
      pool.run(IMAGE, settingsWith(0.2)),
      pool.run(IMAGE, settingsWith(0.3)),
    ]
    pool.cancelAll()
    const settled = await Promise.allSettled(jobs)
    const names = settled.map((s) =>
      s.status === 'rejected' ? (s.reason as Error).name : 'resolved',
    )
    expect(names).toEqual(['CancelledError', 'CancelledError', 'CancelledError'])
    pool.dispose()
  })
})
