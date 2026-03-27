import { build, emptyDir } from "jsr:@deno/dnt@0.42.3";

const denoJson = JSON.parse(Deno.readTextFileSync("./deno.json"));

await emptyDir("./npm");

await build({
  entryPoints: ["./mod.ts"],
  outDir: "./npm",
  shims: {},
  test: false,
  importMap: "./deno.json",
  filterDiagnostic(diagnostic) {
    const fileName = diagnostic.file?.fileName;
    if (fileName && fileName.includes("@std/assert")) return false;
    if (fileName && fileName.includes("@panva/jose")) return false;
    return true;
  },
  compilerOptions: {
    lib: ["ES2022", "DOM"],
  },
  package: {
    name: "@tijs/oauth-client-deno",
    version: denoJson.version,
    description:
      "AT Protocol OAuth client built with Web Crypto API - handle-focused alternative to @atproto/oauth-client-node",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/tijs/oauth-client-deno.git",
    },
    keywords: [
      "atproto",
      "oauth",
      "bluesky",
      "authentication",
      "dpop",
      "web-crypto",
    ],
    dependencies: {
      "jose": "^6.0.0",
    },
  },
  postBuild() {
    // Fix the jose import in the built files since dnt bundles @panva/jose from JSR
    // but we want to use the npm jose package instead
    for (const dir of ["esm", "script"]) {
      for (const entry of [...Deno.readDirSync(`npm/${dir}/src`)]) {
        if (entry.isFile && entry.name.endsWith(".js")) {
          const filePath = `npm/${dir}/src/${entry.name}`;
          let content = Deno.readTextFileSync(filePath);
          if (content.includes("deps/jsr.io/@panva/jose")) {
            content = content.replace(
              /from\s+["']\.\.\/deps\/jsr\.io\/@panva\/jose\/[^"']+["']/g,
              'from "jose"',
            );
            content = content.replace(
              /require\(["']\.\.\/deps\/jsr\.io\/@panva\/jose\/[^"']+["']\)/g,
              'require("jose")',
            );
            Deno.writeTextFileSync(filePath, content);
          }
        }
      }
    }
    // Remove bundled jose files (we use the npm package instead)
    const removeDirRecursive = (path: string) => {
      try {
        Deno.removeSync(path, { recursive: true });
      } catch { /* ignore */ }
    };
    removeDirRecursive("npm/esm/deps");
    removeDirRecursive("npm/script/deps");

    Deno.copyFileSync("LICENSE", "npm/LICENSE");
    Deno.copyFileSync("README.md", "npm/README.md");
  },
});
