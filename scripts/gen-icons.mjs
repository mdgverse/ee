/**
 * Gera todos os tamanhos de icone que o Tauri/NSIS precisam a partir de uma
 * unica imagem de origem.
 *
 *   node scripts/gen-icons.mjs [caminho-da-origem]
 *
 * Origem padrao: assets/icon-source.svg (ou .png, se o .svg nao existir).
 * Saida: src-tauri/icons/
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "src-tauri/icons");

function pickSource() {
  const fromArg = process.argv[2];
  if (fromArg) return resolve(root, fromArg);
  for (const c of ["assets/icon-source.svg", "assets/icon-source.png"]) {
    const p = resolve(root, c);
    if (existsSync(p)) return p;
  }
  throw new Error(
    "Nenhuma imagem de origem encontrada. Coloque assets/icon-source.svg (ou .png), " +
      "ou passe o caminho: node scripts/gen-icons.mjs caminho/para/icone.png"
  );
}

// Tamanhos exigidos pelo bundler do Tauri + extras usados pelo Windows/NSIS.
const PNG_SIZES = [
  ["32x32.png", 32],
  ["128x128.png", 128],
  ["128x128@2x.png", 256],
  ["icon.png", 512],
  ["Square30x30Logo.png", 30],
  ["Square44x44Logo.png", 44],
  ["Square71x71Logo.png", 71],
  ["Square89x89Logo.png", 89],
  ["Square107x107Logo.png", 107],
  ["Square142x142Logo.png", 142],
  ["Square150x150Logo.png", 150],
  ["Square284x284Logo.png", 284],
  ["Square310x310Logo.png", 310],
  ["StoreLogo.png", 50],
];

// O .ico do Windows embute varias resolucoes; estas sao as que o Explorer usa.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

async function main() {
  const src = pickSource();
  mkdirSync(outDir, { recursive: true });
  console.log(`origem : ${src}`);
  console.log(`destino: ${outDir}\n`);

  // Renderiza a origem uma unica vez em alta resolucao e reamostra a partir dai.
  const master = await sharp(src, { density: 384 })
    .resize(1024, 1024, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  for (const [name, size] of PNG_SIZES) {
    await sharp(master).resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(outDir, name));
    console.log(`  ok ${name} (${size}x${size})`);
  }

  const icoFrames = await Promise.all(
    ICO_SIZES.map((s) => sharp(master).resize(s, s).png().toBuffer())
  );
  writeFileSync(resolve(outDir, "icon.ico"), await pngToIco(icoFrames));
  console.log(`  ok icon.ico (${ICO_SIZES.join(", ")})`);

  // .icns (macOS) e opcional; so geramos se a ferramenta estiver disponivel.
  console.log("\nIcones gerados com sucesso.");
}

main().catch((e) => {
  console.error("\nFalhou:", e.message);
  process.exit(1);
});
