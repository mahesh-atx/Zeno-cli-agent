import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  sourcemap: false,
  target: "node18",
  esbuildOptions(options) {
    options.jsx = "transform";
    options.jsxFactory = "React.createElement";
    options.jsxFragment = "React.Fragment";
  },
  banner: {
    js: "#!/usr/bin/env node",
  },
  // Keep react and ink external for small bundle (ink alias resolves via node_modules/ink -> @jrichman/ink)
  // Also externalize react-devtools-core which is an optional peer of ink that causes bundle failure when bundling ink
  external: ["react", "ink", "react-devtools-core"],
});
