import { tokenizeArgs } from 'args-tokenizer'
import { createBirpc } from 'birpc'
// @ts-expect-error
import { Go } from './wasm-exec.js'

// Set up the fs shim IMMEDIATELY before any Go code can run
// Go's syscall.init() runs during WebAssembly.instantiate and expects fs.constants
setupGlobalFs()

function setupGlobalFs() {
  // File open constants that Go's syscall package expects
  const constants = {
    O_RDONLY: 0,
    O_WRONLY: 1,
    O_RDWR: 2,
    O_CREAT: 64,
    O_EXCL: 128,
    O_NOCTTY: 256,
    O_TRUNC: 512,
    O_APPEND: 1024,
    O_DIRECTORY: 65536,
    O_NOATIME: 262144,
    O_NOFOLLOW: 131072,
    O_SYNC: 1052672,
    O_DIRECT: 16384,
    O_NONBLOCK: 2048,
  }

  const textDecoder = new TextDecoder('utf-8')

  const fs = {
    constants,

    writeSync(fd: number, buf: Uint8Array): number {
      const text = textDecoder.decode(buf)
      if (fd === 1) {
        // stdout - log for debugging
        if (text.trim()) console.log('[tsgo stdout]', text.trim())
      } else if (fd === 2) {
        // stderr
        if (text.trim()) console.error('[tsgo stderr]', text.trim())
      }
      return buf.length
    },

    write(
      fd: number,
      buf: Uint8Array,
      offset: number,
      length: number,
      _position: unknown,
      callback: (err: Error | null, written: number) => void,
    ) {
      const written = this.writeSync(fd, buf.subarray(offset, offset + length))
      callback(null, written)
    },

    chmod(_path: string, _mode: number, callback: (err: Error | null) => void) {
      callback(null)
    },

    chown(
      _path: string,
      _uid: number,
      _gid: number,
      callback: (err: Error | null) => void,
    ) {
      callback(null)
    },

    close(_fd: number, callback: (err: Error | null) => void) {
      callback(null)
    },

    fchmod(_fd: number, _mode: number, callback: (err: Error | null) => void) {
      callback(null)
    },

    fchown(
      _fd: number,
      _uid: number,
      _gid: number,
      callback: (err: Error | null) => void,
    ) {
      callback(null)
    },

    fstat(_fd: number, callback: (err: Error | null, stats?: unknown) => void) {
      callback(new Error('fstat not implemented'))
    },

    fsync(_fd: number, callback: (err: Error | null) => void) {
      callback(null)
    },

    ftruncate(
      _fd: number,
      _length: number,
      callback: (err: Error | null) => void,
    ) {
      callback(new Error('ftruncate not implemented'))
    },

    lchown(
      _path: string,
      _uid: number,
      _gid: number,
      callback: (err: Error | null) => void,
    ) {
      callback(null)
    },

    link(_path: string, _link: string, callback: (err: Error | null) => void) {
      callback(new Error('link not implemented'))
    },

    lstat(
      _path: string,
      callback: (err: Error | null, stats?: unknown) => void,
    ) {
      callback(new Error('lstat not implemented'))
    },

    mkdir(_path: string, _perm: number, callback: (err: Error | null) => void) {
      callback(null)
    },

    open(
      _path: string,
      _flags: number,
      _mode: number,
      callback: (err: Error | null, fd?: number) => void,
    ) {
      callback(new Error('open not implemented'))
    },

    read(
      _fd: number,
      _buffer: Uint8Array,
      _offset: number,
      _length: number,
      _position: unknown,
      callback: (err: Error | null, bytesRead?: number) => void,
    ) {
      callback(new Error('read not implemented'))
    },

    readdir(
      _path: string,
      callback: (err: Error | null, files?: string[]) => void,
    ) {
      callback(new Error('readdir not implemented'))
    },

    readlink(
      _path: string,
      callback: (err: Error | null, linkString?: string) => void,
    ) {
      callback(new Error('readlink not implemented'))
    },

    rename(_from: string, _to: string, callback: (err: Error | null) => void) {
      callback(new Error('rename not implemented'))
    },

    rmdir(_path: string, callback: (err: Error | null) => void) {
      callback(new Error('rmdir not implemented'))
    },

    stat(
      _path: string,
      callback: (err: Error | null, stats?: unknown) => void,
    ) {
      callback(new Error('stat not implemented'))
    },

    symlink(
      _target: string,
      _path: string,
      callback: (err: Error | null) => void,
    ) {
      callback(new Error('symlink not implemented'))
    },

    truncate(
      _path: string,
      _length: number,
      callback: (err: Error | null) => void,
    ) {
      callback(new Error('truncate not implemented'))
    },

    unlink(_path: string, callback: (err: Error | null) => void) {
      callback(new Error('unlink not implemented'))
    },

    utimes(
      _path: string,
      _atime: number,
      _mtime: number,
      callback: (err: Error | null) => void,
    ) {
      callback(null)
    },
  }

  // @ts-expect-error - Setting up global fs for Go runtime
  globalThis.fs = fs
}

// Persistent WASM state
let wasmModule: WebAssembly.Module | undefined
let wasmInstance: WebAssembly.Instance | undefined
let wasmInitialized = false
let initPromise: Promise<void> | undefined

// Extend globalThis to include tsgoCompile and tsgoReady
declare global {
  // eslint-disable-next-line no-var
  var tsgoCompile: ((input: TsgoCompileInput) => TsgoCompileResult) | undefined
  // eslint-disable-next-line no-var
  var tsgoReady: boolean | undefined
}

interface TsgoCompileInput {
  files: Record<string, string>
  args?: string[]
}

interface TsgoCompileResult {
  exitCode: number
  stdout: string
  files: Record<string, string>
}

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

async function init() {
  await initWasm()
}

async function loadWasmModule(): Promise<WebAssembly.Module> {
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

async function initWasm(): Promise<void> {
  // Return existing promise if already initializing
  if (initPromise) return initPromise

  initPromise = (async () => {
    if (wasmInitialized) return

    const wasmMod = await loadWasmModule()

    // fs shim is already set up at module load time (setupGlobalFs)

    const go = new Go()

    // The Go main() will call select{} to block forever, so go.run() won't resolve
    // We don't need to wait for it - just start it and wait for tsgoReady
    wasmInstance = await WebAssembly.instantiate(wasmMod, go.importObject)

    // Start the Go runtime (this will block because of select{})
    go.run(wasmInstance)

    // Wait for tsgoReady to be set
    await waitForTsgoReady()

    wasmInitialized = true
    console.log('[worker] WASM runtime initialized and ready')
  })()

  return initPromise
}

function waitForTsgoReady(): Promise<void> {
  return new Promise((resolve) => {
    const checkReady = () => {
      if (globalThis.tsgoReady) {
        resolve()
      } else {
        setTimeout(checkReady, 1)
      }
    }
    checkReady()
  })
}

async function compile(
  cmd: string,
  files: Record<string, string>,
): Promise<CompileResult> {
  await initWasm()

  if (!globalThis.tsgoCompile) {
    throw new Error('tsgoCompile not available - WASM not properly initialized')
  }

  const args = tokenizeArgs(cmd)
  const t = performance.now()

  console.log('[worker] Calling tsgoCompile with args:', args)
  console.log('[worker] Input files:', Object.keys(files))

  // Call the persistent tsgoCompile function
  const result = globalThis.tsgoCompile({
    files,
    args,
  })

  console.log('[worker] tsgoCompile result:', {
    exitCode: result.exitCode,
    stdout: result.stdout?.substring(0, 500),
    filesKeys: Object.keys(result.files),
  })

  const time = performance.now() - t

  // Build output object from emitted files, normalizing paths
  // Go returns absolute paths like /app/dist/main.js, we want relative paths like main.js
  const output: Record<string, string | null> = {}
  for (const [path, content] of Object.entries(result.files)) {
    // Strip /app/dist/ or /app/ prefix to get relative path
    let relativePath = path
    if (relativePath.startsWith('/app/dist/')) {
      relativePath = relativePath.slice('/app/dist/'.length)
    } else if (relativePath.startsWith('/app/')) {
      relativePath = relativePath.slice('/app/'.length)
    }
    output[relativePath] = content
  }

  // Add stdout if present
  if (result.stdout) {
    output['<stdout>'] = result.stdout
  }

  // Add stderr indicator for non-zero exit codes
  if (result.exitCode !== 0) {
    output['<stderr>'] = `Exit code: ${result.exitCode}`
  }

  return {
    output,
    time,
  }
}
