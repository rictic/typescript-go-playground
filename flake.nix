{
  description = "TypeScript Go Playground development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Node.js runtime
            nodejs_22

            # pnpm package manager
            nodePackages.pnpm

            # Go toolchain for building typescript-go WASM
            go_1_24
          ];

          shellHook = ''
            echo "TypeScript Go Playground dev shell"
            echo "Node.js: $(node --version)"
            echo "pnpm: $(pnpm --version)"
            echo "Go: $(go version)"
          '';
        };
      }
    );
}
