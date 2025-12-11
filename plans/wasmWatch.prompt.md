## Plan: Implement Persistent WASM Watch Mode for TypeScript-Go

The key insight is that typescript-go's watch mode uses **polling + mtime comparison**, not OS file watchers. The `Watcher.DoCycle()` method can be called directly to trigger recompilation, and `incremental.Program` preserves state between cycles. We need to keep the Go runtime alive and expose a compile function to JS.

### Steps

1. **Fork typescript-go** — Fork typescript-go into this repo. Get it building with nix, and loading in the existing system.
  - Done! Run `./scripts/build-wasm.sh` to build `/public/tsgo.wasm` from the fork of typescript-go at `./typescript-go`.

2. **Modify our fork** to add a `//go:build js && wasm` variant that initializes the compiler once, then exposes a `tsgoCompile(files)` function via `syscall/js.FuncOf()`. Use `select {}` to keep the runtime alive instead of exiting after `main()`.

3. **Maintain incremental program state** — Store `*incremental.Program` in a package-level variable. On each `tsgoCompile` call, pass the previous program to `incremental.NewProgram()` so it can reuse ASTs, type info, and diagnostics for unchanged files.

4. **Update worker.ts to use persistent instance** — Change from one-shot execution to: (a) run `go.run(instance)` once at init, (b) call `globalThis.tsgoCompile(files)` for each compile, (c) receive results via callback or return value.

5. **Handle virtual filesystem mtimes** — Either update file modification times in WasmFs when files change (so `hasBeenModified()` detects changes), or modify the Go code to always treat provided files as changed and skip mtime checking.
