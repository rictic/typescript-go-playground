import { WasmFs } from '@wasmer/wasmfs'
import { tokenizeArgs } from 'args-tokenizer'
import { createBirpc } from 'birpc'
// @ts-expect-error
import { Go } from './wasm-exec.js'

const go = new Go()
let wasmModule: WebAssembly.Module | undefined

const workerFunctions = {
  init,
  compile,
}
export type WorkerFunctions = typeof workerFunctions
createBirpc<{}, WorkerFunctions>(workerFunctions, {
  post: (data) => postMessage(data),
  on: (fn) => addEventListener('message', ({ data }) => fn(data)),
})

export interface CompileResult {
  output: Record<string, string | null>
  time: number
}

const PATH_STDERR = '/dev/stderr'

async function init() {
  await loadWasm()
}

async function loadWasm() {
  if (wasmModule) return wasmModule

  console.log('[worker] Loading tsgo.wasm')
  const response = await fetch('/tsgo.wasm', {
    cache: 'no-store',
  })
  if (!response.ok) throw new Error('Failed to load tsgo.wasm')
  const wasmBuffer = await response.arrayBuffer()
  console.log(
    `[worker] Loaded WASM: ${(wasmBuffer.byteLength / 1024 / 1024).toFixed(1)}MB`,
  )
  wasmModule = await WebAssembly.compile(wasmBuffer)
  return wasmModule
}

async function compile(
  cmd: string,
  files: Record<string, string>,
): Promise<CompileResult> {
  const wasmMod = await loadWasm()

  const wasmFs = new WasmFs()
  // @ts-expect-error
  globalThis.fs = wasmFs.fs
  wasmFs.volume.fromJSON(files, '/app')

  const { promise, resolve } = Promise.withResolvers<number>()
  const args = tokenizeArgs(cmd)
  const t = performance.now()

  go.exit = (code: number) => resolve(code)
  go.argv = ['js', ...args]

  const instance = await WebAssembly.instantiate(wasmMod, go.importObject)
  await go.run(instance)
  const code = await promise

  const time = performance.now() - t
  const stdout = ((await wasmFs.getStdOut()) as string).trim()
  let stderr = await wasmFs.fs.readFileSync(PATH_STDERR, 'utf8').trim()
  if (code !== 0) {
    stderr = `Exit code: ${code}\n\n${stderr}`.trim()
  }

  const output = {
    ...wasmFs.volume.toJSON('/app/dist', undefined, true),
  }
  if (stdout) output['<stdout>'] = stdout
  if (stderr) output['<stderr>'] = stderr

  return {
    output,
    time,
  }
}
