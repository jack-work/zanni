{
  description = "zanni — visual components extracted from figar.org. One so far: boil.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    figaro-forms = {
      url = "git+ssh://git@spain/var/lib/keel/jack/figaro-forms.git?rev=1155160365dbfa82907ffef39969e01cb9e54ef5";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      figaro-forms,
      ...
    }:
    let
      version = (builtins.fromJSON (builtins.readFile ./assets/manifest.json)).version;
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
          # Bring the image into the page's palette. `saturation` below 100
          # drains the original hues; `tint` then pulls what remains toward one
          # colour by `tintAmount`. This is deliberately NOT a gradient map:
          # mapping luminance straight onto an ink->gold ramp inverts a
          # portrait — a bright background becomes gold and the face goes dark
          # and muddy. Draining and tinting keeps the face a face while making
          # it belong to the page. Set tint = null to leave colour alone.
          saturation ? 100,
          tint ? null,
          tintAmount ? 20,
          # A little contrast, because quantising to few colours flattens the
          # midtones that carry a face.
          levels ? "4%,96%",
        }:
        let
          tone = pkgs.lib.optionalString (tint != null)
            "-modulate 100,${toString saturation} -fill '${tint}' -colorize ${toString tintAmount}% -level ${levels}";
        in
        pkgs.runCommand name { nativeBuildInputs = [ pkgs.imagemagick ]; } ''
          magick ${src} -auto-orient \
            -resize ${toString size}x${toString size}^ \
            -gravity center -extent ${toString size}x${toString size} \
            ${tone} \
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
        gateway = figaro-forms.packages.${system}.bridge;
        fuzzPython = pkgs.python3.withPackages (ps: [ ps.playwright ]);
        speechKit = pkgs.runCommand "figfuzz-speech-kit" { } ''
          mkdir $out
          cp ${figaro-forms}/packages/bridge/test/fake-speech.ts $out/
          ln -s ${gateway}/lib/node_modules $out/node_modules
        '';
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

        packages.figchat-shell = pkgs.buildNpmPackage {
          pname = "figchat-shell";
          inherit version;
          src = pkgs.lib.cleanSourceWith {
            name = "zanni-source";
            src = ./.;
            filter = path: type:
              let
                rel = pkgs.lib.removePrefix (toString ./.) (toString path);
                top = builtins.elemAt (pkgs.lib.splitString "/" rel) 1;
                base = baseNameOf path;
              in
              rel == "" || (builtins.elem top [ "web" "packages" "assets" "bin" "examples" ] && !(builtins.elem base [ "node_modules" "dist" ]));
          };
          sourceRoot = "zanni-source/web";
          nodejs = pkgs.nodejs_24;
          npmDepsHash = "sha256-wgP9TVchtb1/6kNEbLnY5Py7l91ELiGyzeM9bIwgR2c=";
          makeCacheWritable = true;
          doCheck = true;
          checkPhase = ''
            runHook preCheck
            npm test
            runHook postCheck
          '';
          installPhase = ''
            runHook preInstall
            node ../bin/figchat-bundle $out dist
            runHook postInstall
          '';
        };

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

        # The renderer is the one component with logic rather than only
        # declarations, so it carries unit tests and they run in the build.
        checks.scriba = pkgs.runCommand "zanni-scriba-test" {
          nativeBuildInputs = [ pkgs.nodejs ];
        } ''
          cp -r ${./assets} assets
          cp -r ${./test} test
          node test/scriba.test.js
          touch $out
        '';

        checks.strati = pkgs.runCommand "zanni-strati-test" {
          nativeBuildInputs = [ pkgs.nodejs ];
        } ''
          cp -r ${./assets} assets
          cp -r ${./test} test
          node test/strati.test.js
          node test/ordine.test.js
          node test/ordine-drift.test.js
          node test/ordine-feed.test.js
          touch $out
        '';

        packages.order-site = self.lib.mkBoiledSite {
          inherit pkgs version;
          pname = "zanni-order-site";
          src = ./examples/order-site;
          components = [ "gesso" "fontpack" "rotolo" "registro" "strati" "ordine" ];
        };

        checks.order-site = pkgs.runCommand "zanni-order-site-check" {
          nativeBuildInputs = [ pkgs.gnugrep ];
        } ''
          if grep -nEi '<script|<style|[[:space:]]on[a-z]+=|[[:space:]]style=' ${./examples/order-site/index.html}; then
            echo "the authored order page carries an inline script, style or handler"; exit 1
          fi
          if grep -nE 'innerHTML|outerHTML|insertAdjacentHTML|document\.write' ${./assets/ordine/ordine.js} ${./assets/strati/strati.js}; then
            echo "ordine or strati writes text as markup"; exit 1
          fi
          grep -q 'data-ordine="hierarchy"' ${self.packages.${system}.order-site}/index.html
          touch $out
        '';

        checks.fontpack-stylesheet = pkgs.runCommand "zanni-fontpack-stylesheet" {
          nativeBuildInputs = [ pkgs.nodejs pkgs.diffutils ];
        } ''
          node ${./assets/fontpack/fontpack.gen.js} > built.css
          diff -u ${./assets/fontpack/fonts.css} built.css \
            || { echo "assets/fontpack/fonts.css is stale: node assets/fontpack/fontpack.gen.js > assets/fontpack/fonts.css"; exit 1; }
          touch $out
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

        checks.parla = pkgs.runCommand "zanni-parla-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/parla.test.py} examples/parla.html 2>&1 | tee $out
        '';

        checks.filo = pkgs.runCommand "zanni-filo-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/filo.test.py} examples/filo.html 2>&1 | tee $out
        '';

        checks.proscenio = pkgs.runCommand "zanni-proscenio-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/proscenio.test.py} examples/proscenio.html 2>&1 | tee $out
        '';

        checks.bacchetta = pkgs.runCommand "zanni-bacchetta-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/bacchetta.test.py} examples/bacchetta.html 2>&1 | tee $out
        '';

        checks.registro = pkgs.runCommand "zanni-registro-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/registro.test.py} examples/registro.html 2>&1 | tee $out
        '';

        checks.usage = pkgs.runCommand "zanni-usage-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/usage.test.py} examples/usage.html 2>&1 | tee $out
        '';

        checks.placet = pkgs.runCommand "zanni-placet-test" {
          nativeBuildInputs = [ pkgs.nodejs (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          cp -r ${./test} test
          cp -r ${./bin} bin
          chmod -R u+w assets examples test bin
          node test/placet.test.js
          python3 test/placet.test.py examples/placet.html 2>&1 | tee $out
        '';

        checks.figchat = pkgs.runCommand "zanni-figchat-test" {
          nativeBuildInputs = [ pkgs.nodejs (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          cp -r ${./test} test
          cp -r ${./bin} bin
          cp -r ${./packages} packages
          mkdir web
          cp -r ${./web/vendor} web/vendor
          cp ${./web/package-lock.json} web/package-lock.json
          chmod -R u+w assets examples test bin web
          node test/voce.test.js
          node test/nodi.test.js
          node test/figchat.test.js
          node test/react-example.test.js
          python3 test/figchat.test.py ${self.packages.${system}.figchat-shell} 2>&1 | tee $out
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless python3 test/ios-composer.test.py ${self.packages.${system}.figchat-shell} 2>&1 | tee -a $out
        '';

        checks.figchat-wave1 = pkgs.runCommand "zanni-figchat-wave1-test" {
          nativeBuildInputs = [ pkgs.nodejs (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.noto-fonts-color-emoji pkgs.noto-fonts-cjk-sans pkgs.noto-fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          cp -r ${./test} test
          chmod -R u+w assets examples test
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless bash test/wave1/run.sh ${self.packages.${system}.figchat-shell} 2>&1 | tee $out
        '';

        checks.figchat-fuzz = pkgs.runCommand "zanni-figchat-fuzz" {
          nativeBuildInputs = [ pkgs.nodejs fuzzPython ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.noto-fonts-color-emoji pkgs.noto-fonts-cjk-sans pkgs.noto-fonts ]; };
          FIGFUZZ_GATEWAY = "${gateway}/bin/figaro-gateway";
          FIGFUZZ_SPEECH_KIT = "${speechKit}";
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./examples} examples
          cp -r ${./assets} assets
          cp -r ${./test} test
          cp -r ${./bench} bench
          chmod -R u+w examples assets test bench
          bundle=${self.packages.${system}.figchat-shell}
          python3 test/fuzz/regress/run.py $bundle 2>&1 | tee $out
          for c in composer gestures network audio scale; do
            python3 test/fuzz/fuzz.py $bundle --campaign $c --seed 1 --runs 2 --steps 25 --no-shrink --regress-dir $TMPDIR/found 2>&1 | tee -a $out
          done
        '';

        apps.figchat-fuzz = {
          type = "app";
          program = toString (pkgs.writeShellScript "figchat-fuzz" ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            export FONTCONFIG_FILE=${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.noto-fonts-color-emoji pkgs.noto-fonts-cjk-sans pkgs.noto-fonts ]; }}
            export FIGFUZZ_GATEWAY=${gateway}/bin/figaro-gateway
            export FIGFUZZ_SPEECH_KIT=${speechKit}
            export PATH=${pkgs.nodejs}/bin:$PATH
            bundle=${self.packages.${system}.figchat-shell}
            exec ${fuzzPython}/bin/python ${./.}/test/fuzz/fuzz.py "$bundle" "$@"
          '');
        };


        packages.figchat-bench = pkgs.writeShellApplication {
          name = "figchat-bench";
          runtimeInputs = [ pkgs.nodejs (pkgs.python3.withPackages (ps: [ ps.playwright ps.brotli ])) ];
          runtimeEnv = {
            PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
            PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
            LD_LIBRARY_PATH = "${pkgs.mesa}/lib:${pkgs.libglvnd}/lib";
            __EGL_VENDOR_LIBRARY_FILENAMES = "${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json";
            LIBGL_ALWAYS_SOFTWARE = "1";
            EGL_PLATFORM = "surfaceless";
          };
          text = ''
            here=''${ZANNI_ROOT:-$PWD}
            case "''${1:-}" in
              check) shift; exec python3 "$here/bench/check.py" "$@" ;;
              chart) shift; exec python3 "$here/bench/chart.py" "$@" ;;
              *) exec python3 "$here/bench/figchat_bench.py" "$@" ;;
            esac
          '';
        };

        checks.figchat-perf = pkgs.runCommand "zanni-figchat-perf" {
          nativeBuildInputs = [ pkgs.nodejs (pkgs.python3.withPackages (ps: [ ps.playwright ps.brotli ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          cp -r ${./test} test
          cp -r ${./bench} bench
          chmod -R u+w assets examples test bench
          mkdir -p $out
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless python3 bench/figchat_bench.py ${self.packages.${system}.figchat-shell} --sha ${self.shortRev or self.dirtyShortRev or "dirty"} --out $out/result.json
          python3 bench/check.py $out/result.json bench/budgets.json 2>&1 | tee $out/check.txt
        '';

        checks.rotolo = pkgs.runCommand "zanni-rotolo-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ps.pillow ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/rotolo.test.py} examples/rotolo.html 2>&1 | tee $out
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
