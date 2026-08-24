import { describe, expect, it } from 'vitest'
import { analyzeImage } from '@trazor/assist'
import type { RasterImage } from '@trazor/core'
import { AssistClient } from '../src/lib/assistClient'
import type {
  AssistInMessage,
  AssistOutMessage,
  AssistWorkerScope,
} from '../src/worker/assistProtocol'
import { installAssistWorker } from '../src/worker/assistWorker'

function checkerImage(): RasterImage {
  const width = 8
  const height = 8
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const on = (x + y) % 2 === 0
      data[i] = on ? 220 : 30
      data[i + 1] = on ? 40 : 120
      data[i + 2] = on ? 60 : 200
      data[i + 3] = 255
    }
  }
  return { width, height, data }
}

/** A fake Worker that records postMessage and lets the test drive replies. */
class FakeWorker {
  posted: Array<{ msg: AssistInMessage; transfer?: Transferable[] }> = []
  private messageListeners: Array<(ev: MessageEvent) => void> = []

  addEventListener(type: string, fn: (ev: MessageEvent) => void): void {
    if (type === 'message') this.messageListeners.push(fn)
  }

  postMessage(msg: AssistInMessage, transfer?: Transferable[]): void {
    this.posted.push({ msg, transfer })
  }

  terminate(): void {}

  reply(msg: AssistOutMessage): void {
    for (const fn of this.messageListeners) fn({ data: msg } as MessageEvent)
  }
}

describe('AssistClient', () => {
  it('copies the caller image buffer instead of detaching it', () => {
    const fake = new FakeWorker()
    const client = new AssistClient(() => fake as unknown as Worker)
    const image = checkerImage()
    void client.suggestPalettes(image, analyzeImage(image))
    // The caller's pixels stay intact — the worker received a copy, not the original.
    expect(image.data.byteLength).toBe(image.width * image.height * 4)
    const posted = fake.posted[0]
    expect(posted.msg.type).toBe('suggestPalettes')
    expect(posted.transfer?.[0]).toBe(posted.msg.buffer)
    expect(posted.msg.buffer).not.toBe(image.data.buffer)
  })

  it('resolves with the worker reply matched by id', async () => {
    const fake = new FakeWorker()
    const client = new AssistClient(() => fake as unknown as Worker)
    const image = checkerImage()
    const promise = client.suggestPalettes(image, analyzeImage(image))
    const { id } = fake.posted[0].msg
    const suggestions = [
      { id: 'balanced', label: 'Balanced', colors: ['#000000', '#ffffff'], description: '' },
    ]
    fake.reply({ type: 'palettes', id, suggestions })
    await expect(promise).resolves.toEqual(suggestions)
  })

  it('rejects when the worker reports an error', async () => {
    const fake = new FakeWorker()
    const client = new AssistClient(() => fake as unknown as Worker)
    const image = checkerImage()
    const promise = client.suggestPalettes(image, analyzeImage(image))
    const { id } = fake.posted[0].msg
    fake.reply({ type: 'error', id, message: 'boom' })
    await expect(promise).rejects.toThrow('boom')
  })
})

describe('installAssistWorker', () => {
  it('round-trips palette suggestion through a fake scope', () => {
    let listener: ((ev: { data: unknown }) => void) | null = null
    const outbox: AssistOutMessage[] = []
    const scope: AssistWorkerScope = {
      addEventListener: (_type, fn) => {
        listener = fn
      },
      postMessage: (msg) => {
        outbox.push(msg as AssistOutMessage)
      },
    }
    installAssistWorker(scope)
    expect(listener).not.toBeNull()

    const image = checkerImage()
    listener!({
      data: {
        type: 'suggestPalettes',
        id: 3,
        width: image.width,
        height: image.height,
        buffer: image.data.slice().buffer,
        analysis: analyzeImage(image),
      } satisfies AssistInMessage,
    })

    expect(outbox).toHaveLength(1)
    const out = outbox[0]
    expect(out.id).toBe(3)
    expect(out.type).toBe('palettes')
    const palettes = out as Extract<AssistOutMessage, { type: 'palettes' }>
    expect(palettes.suggestions.length).toBeGreaterThan(0)
    for (const suggestion of palettes.suggestions) {
      expect(suggestion.colors.length).toBeGreaterThanOrEqual(2)
    }
  })
})
