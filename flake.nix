{
  description = "zanni — visual components extracted from figar.org. One so far: boil.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    figaro-forms = {
      url = "git+ssh://git@spain/var/lib/keel/jack/figaro-forms.git?ref=refs/tags/v0.24.8&rev=182db7b7e2555e84bd96bf1ccff9f671beeef978";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    figaro-forms-paced = {
      url = "git+ssh://git@spain/var/lib/keel/jack/figaro-forms.git?ref=lane/fake-speech-paced&rev=e2fdb9296fbd0e81b6bca7e8f9819dd2c0e374f1";
      flake = false;
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      figaro-forms,
      figaro-forms-paced,
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
        benchPython = pkgs.python3.withPackages (ps: [ ps.playwright ps.brotli ]);
        tier = name: members: pkgs.linkFarm "zanni-${name}"
          (pkgs.lib.mapAttrsToList (n: path: { name = n; inherit path; }) members);
        everyCheck = pkgs.lib.removeAttrs self.checks.${system} [ "quick" "release" ];
        speechKit = pkgs.runCommand "figfuzz-speech-kit" { } ''
          mkdir $out
          cp ${figaro-forms-paced}/packages/bridge/test/fake-speech.ts $out/
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
              rel == "" || rel == "/test" || rel == "/test/wave1" || pkgs.lib.hasPrefix "/test/wave1/fixtures" rel
                || (builtins.elem top [ "web" "packages" "assets" "bin" "examples" ] && !(builtins.elem base [ "node_modules" "dist" ]));
          };
          sourceRoot = "zanni-source/web";
          nodejs = pkgs.nodejs_24;
          npmDepsHash = "sha256-z3yq6ejYh2M5xJJgwxnhJ9dWZQAp5nqCSfxSm3DWVvI=";
          makeCacheWritable = true;
          doCheck = false;
          installPhase = ''
            runHook preInstall
            node ../bin/figchat-bundle $out dist
            runHook postInstall
          '';
        };

        packages.order-page = self.packages.${system}.figchat-shell.overrideAttrs (old: {
          pname = "zanni-order-page";
          npmBuildScript = "build:order";
          installPhase = ''
            runHook preInstall
            cp -r dist-order $out
            runHook postInstall
          '';
        });

        packages.zanni-react = pkgs.buildNpmPackage {
          pname = "zanni-react";
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
              rel == "" || (builtins.elem top [ "web" "packages" "assets" "bin" ] && !(builtins.elem base [ "node_modules" "dist" "dist-react" "dist-react-jotai" "dist-runtime" "dist-types" ]));
          };
          sourceRoot = "zanni-source/web";
          nodejs = pkgs.nodejs_24;
          npmDepsHash = "sha256-z3yq6ejYh2M5xJJgwxnhJ9dWZQAp5nqCSfxSm3DWVvI=";
          makeCacheWritable = true;
          dontNpmBuild = true;
          dontBuild = true;
          installPhase = ''
            runHook preInstall
            node ../bin/zanni-react-build $out
            node ../bin/zanni-react-exports $out
            node ../bin/zanni-react-check $out
            runHook postInstall
          '';
        };

        # The specimen page, built from source. Also the drift guard: the
        # copy committed at examples/card.html must equal what the tools
        # produce today, so the file the owner opens in a browser with no build
        # step is never quietly stale.
        packages.example = pkgs.runCommand "zanni-example-card" {
          nativeBuildInputs = [ self.packages.${system}.default ];
        } ''
          mkdir -p $out
          zanni-inline ${./examples/card.src.html} -o $out/card.html
          zanni-check $out/card.html
        '';

        checks.unit = pkgs.runCommand "zanni-unit" {
          nativeBuildInputs = [ pkgs.nodejs pkgs.python3 ];
        } ''
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          cp -r ${./test} test
          cp -r ${./bin} bin
          cp -r ${./packages} packages
          mkdir web
          cp -r ${./web/vendor} web/vendor
          cp ${./web/package-lock.json} web/package-lock.json
          chmod -R u+w assets examples test bin web
          patchShebangs bin
          for t in test/*.test.js; do
            echo "== $t"
            node $t
          done
          touch $out
        '';

        checks.web-unit = self.packages.${system}.figchat-shell.overrideAttrs (old: {
          pname = "zanni-web-unit";
          doCheck = true;
          checkPhase = ''
            runHook preCheck
            npm test
            runHook postCheck
          '';
          installPhase = "touch $out";
        });

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

        checks.zanni-react = pkgs.runCommand "zanni-react-check" {
          nativeBuildInputs = [ pkgs.nodejs ];
        } ''
          cp -r ${./bin} bin
          cp -r ${./assets} assets
          chmod -R u+w bin assets
          bundle=${self.packages.${system}.zanni-react}
          node bin/zanni-react-check $bundle
          cp -r $bundle poisoned
          chmod -R u+w poisoned
          v=$(ls poisoned/react)
          printf '%s' 'document.body.innerHTML = "<script>x</script>";' >> poisoned/react/$v/index.js
          if node bin/zanni-react-check poisoned 2> err; then echo "an inline script went through"; exit 1; fi
          grep -q "does not match SHA256SUMS" err
          grep -q "carries a script tag" err
          cp -r $bundle poisoned-runtime
          chmod -R u+w poisoned-runtime
          printf '%s' 'eval("1");' >> poisoned-runtime/runtime/$v/react.js
          if node bin/zanni-react-check poisoned-runtime 2> err; then echo "an eval in the runtime went through"; exit 1; fi
          grep -q "runtime/react.js does not match SHA256SUMS" err
          grep -q "runtime/react.js carries eval" err
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

        checks.figaro-404 = pkgs.runCommand "zanni-figaro-404-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.fonttools ps.brotli ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          mkdir tree && cd tree
          cp -r ${./assets} assets
          cp -r ${./bin} bin
          cp -r ${./pages} pages
          cp -r ${./test} test
          chmod -R u+w .
          python3 test/figaro-404.test.py 2>&1 | tee $out
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

        checks.shell = pkgs.runCommand "zanni-shell-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          mkdir -p tree/test
          cp -r ${./assets} tree/assets
          cp -r ${./examples} tree/examples
          cp ${./test/shell.test.py} tree/test/shell.test.py
          python3 tree/test/shell.test.py ${self.packages.${system}.zanni-react} 2>&1 | tee $out
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
          mkdir -p $out
          export ZANNI_TIMINGS=$TMPDIR/timings.jsonl ZANNI_REV=${self.shortRev or self.dirtyShortRev or "dirty"}
          python3 test/figchat.test.py ${self.packages.${system}.figchat-shell} 2>&1 | tee $out/log.txt
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless python3 test/standalone.test.py ${self.packages.${system}.figchat-shell} 2>&1 | tee -a $out/log.txt
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless python3 test/ios-composer.test.py ${self.packages.${system}.figchat-shell} 2>&1 | tee -a $out/log.txt
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless python3 test/drawer-flash.test.py ${self.packages.${system}.figchat-shell} 2>&1 | tee -a $out/log.txt
          python3 test/timing.py $ZANNI_TIMINGS $out/timings.json
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
          cp -r ${./bench} bench
          chmod -R u+w assets examples test bench
          mkdir -p $out
          export ZANNI_TIMINGS=$TMPDIR/timings.jsonl ZANNI_REV=${self.shortRev or self.dirtyShortRev or "dirty"}
          env LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless bash test/wave1/run.sh ${self.packages.${system}.figchat-shell} 2>&1 | tee $out/log.txt
          python3 test/timing.py $ZANNI_TIMINGS $out/timings.json
        '';

        apps.parity = {
          type = "app";
          program = toString (pkgs.writeShellScript "pager-parity" ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            export FONTCONFIG_FILE=${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.noto-fonts-color-emoji pkgs.noto-fonts-cjk-sans pkgs.noto-fonts ]; }}
            export PARITY_GATEWAY=${gateway}/bin/figaro-gateway
            export PARITY_WS=${gateway}/lib/node_modules/ws
            export LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib
            export __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json
            export LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless
            export PATH=${pkgs.nodejs_24}/bin:$PATH
            cd web
            [ -d node_modules ] || npm ci --ignore-scripts
            npm run build --silent -- --logLevel warn
            npm run build:order --silent -- --logLevel warn
            exec npx playwright test "$@"
          '');
        };

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


        apps.perf = {
          type = "app";
          program = toString (pkgs.writeShellScript "zanni-perf" ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=true
            export FONTCONFIG_FILE=${pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts pkgs.noto-fonts-color-emoji pkgs.noto-fonts-cjk-sans pkgs.noto-fonts ]; }}
            export FIGFUZZ_GATEWAY=${gateway}/bin/figaro-gateway
            export FIGFUZZ_SPEECH_KIT=${speechKit}
            export PYTHONDONTWRITEBYTECODE=1
            export PATH=${pkgs.nodejs}/bin:${benchPython}/bin:$PATH
            export BUNDLE=${self.packages.${system}.figchat-shell}
            exec ${pkgs.flock}/bin/flock /tmp/zanni-perf.lock ${pkgs.writeShellScript "zanni-perf-run" ''
              set -u -o pipefail
              work=$(mktemp -d)
              trap 'rm -rf "$work"' EXIT
              cd "$work"
              cp -r ${./assets} assets
              cp -r ${./examples} examples
              cp -r ${./test} test
              cp -r ${./bench} bench
              chmod -R u+w assets examples test bench
              export LD_LIBRARY_PATH=${pkgs.mesa}/lib:${pkgs.libglvnd}/lib __EGL_VENDOR_LIBRARY_FILENAMES=${pkgs.mesa}/share/glvnd/egl_vendor.d/50_mesa.json LIBGL_ALWAYS_SOFTWARE=1 EGL_PLATFORM=surfaceless
              export ZANNI_TIMINGS="$work/timings.jsonl" ZANNI_REV=${self.shortRev or self.dirtyShortRev or "dirty"}
              rc=0
              python3 bench/figchat_bench.py "$BUNDLE" --sha ${self.shortRev or self.dirtyShortRev or "dirty"} --out "$work/result.json" || rc=$?
              python3 bench/check.py "$work/result.json" bench/budgets.json || rc=$?
              python3 test/fuzz/regress/run.py "$BUNDLE" || rc=$?
              for c in composer gestures network audio paced scale; do
                python3 test/fuzz/fuzz.py "$BUNDLE" --campaign $c --seed 1 --runs 2 --steps 25 --no-shrink --regress-dir "$work/found" || rc=$?
              done
              python3 test/timing.py "$work/timings.jsonl" "''${ZANNI_PERF_OUT:-$OLDPWD}/zanni-timings.json"
              cp "$work/result.json" "''${ZANNI_PERF_OUT:-$OLDPWD}/zanni-bench.json" 2>/dev/null || true
              exit $rc
            ''}
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

        checks.sitenav = pkgs.runCommand "zanni-sitenav-test" {
          nativeBuildInputs = [ (pkgs.python3.withPackages (ps: [ ps.playwright ])) ];
          PLAYWRIGHT_BROWSERS_PATH = pkgs.playwright-driver.browsers;
          PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";
          FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.dejavu_fonts ]; };
        } ''
          set -o pipefail
          export HOME=$TMPDIR
          cp -r ${./assets} assets
          cp -r ${./examples} examples
          python3 ${./test/sitenav.test.py} examples/sitenav.html 2>&1 | tee $out
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

        checks.quick = tier "quick" { inherit (everyCheck) unit web-unit fontpack-stylesheet example; };
        checks.release = tier "release" everyCheck;

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
