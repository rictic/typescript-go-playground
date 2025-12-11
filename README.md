# TypeScript Go Playground

This is a playground that allows you to experience [TypeScript 7](https://github.com/microsoft/typescript-go) online!

It's forked from https://github.com/sxzz/typescript-go-playground to explore what optimized emit speed using a WASM build of typescript-go will look like. This doesn't run type checking, and uses a modified version of typescript-go with a new wasm entrypoint that efficiently creates Program objects and skips type checking.

Kevin's original version of this playground uses an unmodified version of typescript-go's wasm build, which requires creating a new compiler for each compilation. I'm confident that once typescript-go is closer to release it will expose APIs needed to get performance more similar to this demo.

## License

[MIT](./LICENSE) License © 2025 [Kevin Deng](https://github.com/sxzz)
