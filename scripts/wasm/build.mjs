#!/usr/bin/env node
/**
 * Build the boundary solve's WebAssembly kernel: `crates/solve` compiled with the
 * toolchain its `rust-toolchain.toml` pins (rustup installs it on first use) and
 * copied to `packages/trace/wasm/solve.wasm`, the module `loadBandKernel` takes.
 * Prints the module's size and SHA-256.
 *
 *   npm run build:wasm            # build and copy
 *   npm run build:wasm -- --check # build and fail unless it equals the committed module
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const crate = join(root, 'crates', 'solve')
const built = join(crate, 'target', 'wasm32-unknown-unknown', 'release', 'trazor_solve.wasm')
const out = join(root, 'packages', 'trace', 'wasm', 'solve.wasm')
const check = process.argv.includes('--check')

// cargo runs in the crate so rustup reads its rust-toolchain.toml; the target
// and the SIMD flag come from the crate's .cargo/config.toml.
execFileSync('cargo', ['build', '--release', '--locked'], { cwd: crate, stdio: 'inherit' })
const bytes = readFileSync(built)
const sha = createHash('sha256').update(bytes).digest('hex')
if (check) {
  const committed = createHash('sha256').update(readFileSync(out)).digest('hex')
  if (committed !== sha) {
    console.error(`solve.wasm differs from a fresh build: committed ${committed}, built ${sha}`)
    process.exit(1)
  }
  console.log(`solve.wasm matches a fresh build (${bytes.length} bytes, sha256 ${sha})`)
} else {
  copyFileSync(built, out)
  console.log(`packages/trace/wasm/solve.wasm: ${bytes.length} bytes, sha256 ${sha}`)
}
