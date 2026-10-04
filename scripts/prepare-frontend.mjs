/**
 * Transforma o HTML monolitico do Everything Editor no frontend do app desktop.
 *
 *   node scripts/prepare-frontend.mjs
 *
 * O arquivo original tem ~12 MB, dos quais ~92% sao fontes embutidas em base64
 * dentro de um unico bloco <style>. Isso e otimo para distribuir um arquivo
 * solto, mas pessimo para o tempo de abertura: o motor precisa ler, decodificar
 * e manter na memoria 11 MB de texto antes de pintar a primeira tela.
 *
 * Aqui nos:
 *   1. extraimos cada fonte base64 para um arquivo real em src/fonts/
 *      (deduplicado por hash do conteudo);
 *   2. trocamos os data: URIs por caminhos relativos, de modo que o webview
 *      carregue cada fonte sob demanda, so quando algum texto realmente usar;
 *   3. removemos os scripts de analytics da Cloudflare, que em um app offline
 *      apenas adicionam uma espera de rede na inicializacao;
 *   4. injetamos um pequeno ajuste de comportamento para janela desktop.
 *
 * base64 ocupa 4 bytes para cada 3 bytes de dados, entao extrair tambem
 * devolve cerca de 25% do peso dos binarios.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_HTML = resolve(root, process.argv[2] ?? "everything-editor-v1.6.html");
const OUT_DIR = resolve(root, "src");
const FONT_DIR = resolve(OUT_DIR, "fonts");

const EXT_BY_MIME = {
  "font/woff2": "woff2",
  "font/woff": "woff",
  "font/ttf": "ttf",
  "font/otf": "otf",
  "application/font-woff": "woff",
  "application/x-font-ttf": "ttf",
};

const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

function main() {
  let html = readFileSync(SRC_HTML, "utf8");
  const before = Buffer.byteLength(html);
  console.log(`origem: ${SRC_HTML}`);
  console.log(`        ${mb(before)}\n`);

  rmSync(FONT_DIR, { recursive: true, force: true });
  mkdirSync(FONT_DIR, { recursive: true });

  // ---- 1 & 2: extrair fontes -------------------------------------------
  const seen = new Map(); // hash -> nome do arquivo
  let extracted = 0;
  let bytesOnDisk = 0;

  html = html.replace(
    // As aspas podem ser duplas, simples ou inexistentes: o arquivo usa as tres.
    /url\(\s*(["']?)data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)\1\s*\)/g,
    (whole, _q, mime, b64) => {
      const ext = EXT_BY_MIME[mime];
      if (!ext) return whole; // mime desconhecido: deixa como esta

      const buf = Buffer.from(b64, "base64");
      const hash = createHash("sha1").update(buf).digest("hex").slice(0, 12);

      let name = seen.get(hash);
      if (!name) {
        name = `${hash}.${ext}`;
        writeFileSync(resolve(FONT_DIR, name), buf);
        seen.set(hash, name);
        bytesOnDisk += buf.length;
      }
      extracted++;
      return `url("fonts/${name}")`;
    }
  );

  console.log(
    `fontes: ${extracted} referencias -> ${seen.size} arquivos unicos (${mb(bytesOnDisk)} em disco)`
  );

  // ---- 2b: limpar url() relativas que nao existem ----------------------
  // O original referencia "OCRAEXT.TTF", um arquivo que nunca foi distribuido
  // junto. Em um app empacotado isso vira um 404 a cada abertura. Os local()
  // que acompanham a declaracao continuam valendo como fallback.
  let dangling = 0;
  html = html.replace(
    /,?\s*url\(\s*(["']?)(?!fonts\/|data:|https?:)[^)"']+\.(?:ttf|otf|woff2?|eot)\1\s*\)/gi,
    () => {
      dangling++;
      return "";
    }
  );
  console.log(`limpeza: ${dangling} url() apontando para arquivo inexistente removida(s)`);

  // ---- 3: remover analytics da Cloudflare ------------------------------
  let beacons = 0;
  html = html.replace(
    /<script[^>]*cloudflareinsights\.com[^>]*>\s*<\/script>/gi,
    () => {
      beacons++;
      return "";
    }
  );
  console.log(`analytics: ${beacons} script(s) da Cloudflare removido(s)`);

  // ---- 4: ajustes para o contexto desktop ------------------------------
  const desktopPatch = `
<script>
/* Ajustes aplicados ao empacotar como aplicativo desktop (Tauri). */
(function () {
  // O menu de contexto nativo do webview nao faz sentido num editor.
  window.addEventListener('contextmenu', function (e) {
    var t = e.target;
    var editable = t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName));
    if (!editable) e.preventDefault();
  });
  // Evita que arrastar um arquivo para a janela navegue para fora do app.
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });
  // Ctrl+0 restaura o zoom padrao.
  window.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === '0') document.body.style.zoom = '';
  });
})();
</script>
`;
  html = html.replace(/<\/body>/i, `${desktopPatch}</body>`);

  // ---- grava -----------------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(resolve(OUT_DIR, "index.html"), html);
  const after = Buffer.byteLength(html);

  console.log(`\ndestino: ${resolve(OUT_DIR, "index.html")}`);
  console.log(`         ${mb(before)} -> ${kb(after)}  (-${(100 - (after / before) * 100).toFixed(1)}%)`);
  console.log(`total distribuido: ${mb(after + bytesOnDisk)} (html + fontes)`);
}

main();
