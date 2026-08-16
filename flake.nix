{
  description = "zanni — visual components extracted from figar.org. One so far: boil.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      ...
    }:
    let
      version = "0.4.0";
    in
    {
      # One call, the way gluck-service-lib's mkPythonService is one call.
      # A consumer says what its site is; the injection and the guard are
      # not copy-pasted into every consumer's installPhase, because a guard
      # that each site maintains separately is a guard that rots separately.
      #
      #   packages.default = zanni.lib.mkBoiledSite {
      #     inherit pkgs;
      #     pname = "jack-kelliher-info";
      #     version = "0.5.0";
      #     src = ./www;
      #   };
      #
      # Each page named in `pages` must carry the component's marker
      # (`<!-- zanni:boil -->`). A missing marker fails the build: a static
      # site whose effect silently did not arrive is the exact failure this
      # library was written against.
      # Downsample first, pixelate second. `image-rendering: pixelated` on a
      # full-size photograph does nothing visible — the browser's downscale
      # path is not nearest-neighbour. figar.org's mark is a 26x26 PNG scaled
      # UP to 38px; this reproduces that discipline reproducibly, so nobody
      # has to remember an imagemagick incantation or check a binary into git
      # by hand.
      lib.pixelate =
        {
          pkgs,
          src,
          size ? 96,
          colors ? 64,
          name ? "pixel.png",
        }:
        pkgs.runCommand name { nativeBuildInputs = [ pkgs.imagemagick ]; } ''
          magick ${src} -auto-orient \
            -resize ${toString size}x${toString size}^ \
            -gravity center -extent ${toString size}x${toString size} \
            -colors ${toString colors} -strip PNG8:$out
        '';

      lib.mkBoiledSite =
        {
          pkgs,
          pname,
          src,
          version ? "0.1.0",
          components ? [ "boil" ],
          pages ? [ "index.html" ],
          # Extra files to lay over the source tree, name -> derivation or
          # path. For generated assets a site should not keep in git.
          files ? { },
        }:
        let
          zanni = self.packages.${pkgs.system}.default;
          flags = pkgs.lib.concatMapStringsSep " " (c: "--component ${c}") components;
        in
        pkgs.stdenv.mkDerivation {
          inherit pname version src;
          nativeBuildInputs = [ zanni ];
          dontConfigure = true;
          dontBuild = true;
          installPhase = ''
            runHook preInstall
            mkdir -p $out
            cp -r . $out/
            chmod -R u+w $out
            ${pkgs.lib.concatStringsSep "\n" (
              pkgs.lib.mapAttrsToList (n: v: "cp -r ${v} \"$out/${n}\"") files
            )}
            for page in ${pkgs.lib.escapeShellArgs pages}; do
              zanni-inline ${flags} "$out/$page" -o "$out/$page.zanni"
              mv "$out/$page.zanni" "$out/$page"
              zanni-check "$out/$page"
            done
            runHook postInstall
          '';
        };
    }
    // flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        # The tools and the assets travel together: `zanni-inline` without
        # the assets it inlines is not a useful thing to hand anyone.
        packages.default = pkgs.stdenv.mkDerivation {
          pname = "zanni";
          inherit version;
          src = ./.;
          nativeBuildInputs = [ pkgs.makeWrapper ];
          dontConfigure = true;
          dontBuild = true;
          installPhase = ''
            runHook preInstall
            mkdir -p $out/bin $out/libexec $out/share/zanni
            cp -r assets $out/share/zanni/assets
            cp -r docs $out/share/zanni/docs
            for b in zanni-inline zanni-check; do
              install -Dm755 bin/$b $out/libexec/$b
              makeWrapper ${pkgs.nodejs}/bin/node $out/bin/$b \
                --add-flags $out/libexec/$b \
                --set-default ZANNI_ASSETS $out/share/zanni/assets
            done
            runHook postInstall
          '';
        };

        # The raw component files, for a consumer that does its own bundling
        # (an SSG, a JS build) and does not want the node tools.
        packages.assets = pkgs.runCommand "zanni-assets-${version}" { } ''
          mkdir -p $out
          cp -r ${./assets}/. $out/
        '';

        # The specimen page, built from source. Also the drift guard: the
        # copy committed at examples/card.html must equal what the tools
        # produce today, so the file Gluck opens in a browser with no build
        # step is never quietly stale.
        packages.example = pkgs.runCommand "zanni-example-card" {
          nativeBuildInputs = [ self.packages.${system}.default ];
        } ''
          mkdir -p $out
          zanni-inline ${./examples/card.src.html} -o $out/card.html
          zanni-check $out/card.html
        '';

        checks.example = pkgs.runCommand "zanni-check-example" {
          nativeBuildInputs = [ self.packages.${system}.default pkgs.diffutils ];
        } ''
          zanni-inline ${./examples/card.src.html} -o built.html
          zanni-check built.html
          diff -u ${./examples/card.html} built.html \
            || { echo "examples/card.html is stale: re-run make example"; exit 1; }
          touch $out
        '';

        apps.inline = flake-utils.lib.mkApp {
          drv = self.packages.${system}.default;
          name = "zanni-inline";
        };
        apps.check = flake-utils.lib.mkApp {
          drv = self.packages.${system}.default;
          name = "zanni-check";
        };

        devShells.default = pkgs.mkShell {
          name = "zanni";
          buildInputs = [
            pkgs.nodejs
            pkgs.caddy
          ];
        };
      }
    );
}
