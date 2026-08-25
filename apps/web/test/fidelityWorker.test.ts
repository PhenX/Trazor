import { describe, expect, it } from 'vitest'
import { FidelityClient } from '../src/lib/fidelityClient'
import type {
  FidelityInMessage,
  FidelityOutMessage,
  FidelityWorkerScope,
} from '../src/worker/fidelityProtocol'
import { installFidelityWorker, scoreDifference } from '../src/worker/fidelityWorker'

function solid(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let p = 0; p < width * height; p++) {
    data[p * 4] = r
    data[p * 4 + 1] = g
    data[p * 4 + 2] = b
    data[p * 4 + 3] = 255
  }
  return data
}

describe('scoreDifference', () => {
  it('scores identical rasters as a perfect, fully transparent match', () => {
    const w = 6
    const h = 6
    const raster = solid(w, h, 40, 120, 200)
    const { score, diff } = scoreDifference(w, h, raster, solid(w, h, 40, 120, 200))
    expect(score).toBeCloseTo(1, 5)
    // Faithful pixels stay transparent in the heatmap.
    for (let p = 0; p < w * h; p++) expect(diff![p * 4 + 3]).toBe(0)
  })

  it('scores very different rasters below a match and marks the heatmap', () => {
    const w = 6
    const h = 6
    const { score, diff } = scoreDifference(w, h, solid(w, h, 0, 0, 0), solid(w, h, 255, 255, 255))
    expect(score).toBeLessThan(0.5)
    let painted = 0
    for (let p = 0; p < w * h; p++) if (diff![p * 4 + 3] > 0) painted++
    expect(painted).toBeGreaterThan(0)
  })

  it('score-only mode matches the heatmap path and allocates no diff', () => {
    const w = 20
    const h = 20
    const a = solid(w, h, 30, 90, 160)
    const b = solid(w, h, 200, 170, 140)
    const withHeatmap = scoreDifference(w, h, a, b, true)
    const scoreOnly = scoreDifference(w, h, a, b, false)
    expect(scoreOnly.score).toBeCloseTo(withHeatmap.score, 12)
    expect(scoreOnly.diff).toBeUndefined()
    expect(withHeatmap.diff).toBeDefined()
  })
})

describe('installFidelityWorker', () => {
  it('round-trips a score through a fake scope', () => {
    let listener: ((ev: { data: unknown }) => void) | null = null
    const outbox: FidelityOutMessage[] = []
    const scope: FidelityWorkerScope = {
      addEventListener: (_type, fn) => {
        listener = fn
      },
      postMessage: (msg) => {
        outbox.push(msg as FidelityOutMessage)
      },
    }
    installFidelityWorker(scope)
    expect(listener).not.toBeNull()

    const w = 4
    const h = 4
    listener!({
      data: {
        type: 'score',
        id: 5,
        width: w,
        height: h,
        rendered: solid(w, h, 10, 20, 30).buffer,
        reference: solid(w, h, 200, 180, 160).buffer,
      } satisfies FidelityInMessage,
    })

    expect(outbox).toHaveLength(1)
    const out = outbox[0]
    expect(out.id).toBe(5)
    expect(out.type).toBe('result')
    const result = out as Extract<FidelityOutMessage, { type: 'result' }>
    expect(result.score).toBeLessThan(1)
    expect(result.diff?.byteLength).toBe(w * h * 4)
  })

  it('scores against a stored reference without a heatmap', () => {
    let listener: ((ev: { data: unknown }) => void) | null = null
    const outbox: FidelityOutMessage[] = []
    const scope: FidelityWorkerScope = {
      addEventListener: (_type, fn) => {
        listener = fn
      },
      postMessage: (msg) => {
        outbox.push(msg as FidelityOutMessage)
      },
    }
    installFidelityWorker(scope)

    const w = 4
    const h = 4
    listener!({
      data: {
        type: 'set-reference',
        refId: 1,
        width: w,
        height: h,
        reference: solid(w, h, 200, 180, 160).buffer,
      } satisfies FidelityInMessage,
    })
    // set-reference does not reply.
    expect(outbox).toHaveLength(0)

    listener!({
      data: {
        type: 'score',
        id: 9,
        width: w,
        height: h,
        rendered: solid(w, h, 10, 20, 30).buffer,
        refId: 1,
        heatmap: false,
      } satisfies FidelityInMessage,
    })

    expect(outbox).toHaveLength(1)
    const result = outbox[0] as Extract<FidelityOutMessage, { type: 'result' }>
    expect(result.id).toBe(9)
    expect(result.score).toBeLessThan(1)
    expect(result.diff).toBeUndefined()
  })

  it('errors when the referenced raster was never stored', () => {
    let listener: ((ev: { data: unknown }) => void) | null = null
    const outbox: FidelityOutMessage[] = []
    const scope: FidelityWorkerScope = {
      addEventListener: (_type, fn) => {
        listener = fn
      },
      postMessage: (msg) => {
        outbox.push(msg as FidelityOutMessage)
      },
    }
    installFidelityWorker(scope)
    listener!({
      data: {
        type: 'score',
        id: 3,
        width: 2,
        height: 2,
        rendered: solid(2, 2, 0, 0, 0).buffer,
        refId: 42,
        heatmap: false,
      } satisfies FidelityInMessage,
    })
    expect((outbox[0] as { type: string }).type).toBe('error')
  })
})

/** A fake Worker that records postMessage and lets the test drive replies. */
class FakeWorker {
  posted: Array<{ msg: FidelityInMessage; transfer?: Transferable[] }> = []
  private messageListeners: Array<(ev: MessageEvent) => void> = []

  addEventListener(type: string, fn: (ev: MessageEvent) => void): void {
    if (type === 'message') this.messageListeners.push(fn)
  }

  postMessage(msg: FidelityInMessage, transfer?: Transferable[]): void {
    this.posted.push({ msg, transfer })
  }

  terminate(): void {}

  reply(msg: FidelityOutMessage): void {
    for (const fn of this.messageListeners) fn({ data: msg } as MessageEvent)
  }
}

describe('FidelityClient', () => {
  it('transfers both rasters and reconstructs the heatmap from the reply', async () => {
    const fake = new FakeWorker()
    const client = new FidelityClient(() => fake as unknown as Worker)
    const w = 4
    const h = 4
    const rendered = solid(w, h, 10, 20, 30)
    const reference = solid(w, h, 200, 180, 160)
    const promise = client.score(w, h, rendered, reference)

    const posted = fake.posted[0]
    expect(posted.msg.type).toBe('score')
    expect(posted.transfer).toEqual([posted.msg.rendered, posted.msg.reference])

    const diff = new Uint8ClampedArray(w * h * 4)
    diff[3] = 200
    fake.reply({
      type: 'result',
      id: posted.msg.id,
      score: 0.75,
      width: w,
      height: h,
      diff: diff.buffer,
    })

    const out = await promise
    expect(out.score).toBe(0.75)
    expect(out.diff.width).toBe(w)
    expect(out.diff.height).toBe(h)
    expect(out.diff.data[3]).toBe(200)
  })

  it('stores a shared reference and scores against it', async () => {
    const fake = new FakeWorker()
    const client = new FidelityClient(() => fake as unknown as Worker)
    const w = 4
    const h = 4
    const reference = solid(w, h, 200, 180, 160)
    client.setReference(7, w, h, reference)
    const setMsg = fake.posted[0].msg
    expect(setMsg.type).toBe('set-reference')
    expect(fake.posted[0].transfer).toEqual([(setMsg as { reference: ArrayBuffer }).reference])

    const promise = client.scoreAgainst(7, w, h, solid(w, h, 10, 20, 30))
    const scoreMsg = fake.posted[1].msg as Extract<FidelityInMessage, { type: 'score' }>
    expect(scoreMsg.refId).toBe(7)
    expect(scoreMsg.heatmap).toBe(false)
    expect(fake.posted[1].transfer).toEqual([scoreMsg.rendered])

    fake.reply({ type: 'result', id: scoreMsg.id, score: 0.82, width: w, height: h, ssim: 0.94 })
    expect(await promise).toEqual({ score: 0.82, ssim: 0.94 })
  })

  it('rejects when the worker reports an error', async () => {
    const fake = new FakeWorker()
    const client = new FidelityClient(() => fake as unknown as Worker)
    const promise = client.score(2, 2, solid(2, 2, 0, 0, 0), solid(2, 2, 0, 0, 0))
    fake.reply({ type: 'error', id: fake.posted[0].msg.id, message: 'boom' })
    await expect(promise).rejects.toThrow('boom')
  })
})
