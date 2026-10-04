# Everything Editor — Desktop

Empacotamento do **Everything Editor V1.6** como aplicativo desktop nativo para
Windows, usando [Tauri 2](https://tauri.app).

O arquivo original `everything-editor-v1.6.html` continua sendo a **única fonte
de verdade**: o frontend do app é gerado a partir dele por um script, então
atualizar o editor é só substituir esse HTML e recompilar.

---

## Baixar o instalador

O instalador é compilado pelo GitHub Actions em um runner Windows.

1. Abra a aba **Actions** do repositório
2. Clique no run mais recente de **Build Windows installer**
3. Baixe o artefato **`everything-editor-windows`**
4. Dentro dele está o `Everything Editor_1.6.0_x64-setup.exe`

Para publicar uma versão fixa, crie uma tag `v*` (ex.: `v1.6.0`) — o instalador
é anexado automaticamente ao release.

---

## Por que não é só um HTML dentro de uma janela

O arquivo original tem **11,43 MB**, dos quais **92,7% são fontes em base64**
dentro de um único bloco `<style>` de 11 MB. Antes de pintar o primeiro pixel, o
motor precisa ler, decodificar e manter em memória esse bloco inteiro.

O `scripts/prepare-frontend.mjs` desmonta isso:

| | antes | depois |
|---|---|---|
| `index.html` | 11,43 MB | **990 KB** (−91,5%) |
| fontes | embutidas em base64 | 83 arquivos em `src/fonts/`, sob demanda |
| peso total | 11,43 MB | 8,82 MB |

O que o script faz:

1. **Extrai as 83 fontes** para arquivos reais, deduplicados por hash SHA-1 do
   conteúdo, e troca os `data:` URIs por caminhos relativos. O webview passa a
   carregar cada fonte só quando algum texto realmente a usa — e base64 gasta 4
   bytes para cada 3 de dados, então sair dele já devolve ~25% do peso.
2. **Remove os dois scripts de analytics da Cloudflare**, que num app offline só
   acrescentam espera de rede na abertura.
3. **Remove a referência a `OCRAEXT.TTF`**, um arquivo que nunca foi distribuído
   junto e virava um 404 a cada inicialização (os `local()` seguem como fallback).
4. **Injeta ajustes de desktop**: menu de contexto nativo suprimido fora de
   campos editáveis, arrastar-e-soltar não navega para fora do app, `Ctrl+0`
   restaura o zoom.

### Outras otimizações

- **Perfil de release do Rust** — `opt-level = 3`, `lto = "fat"`,
  `codegen-units = 1`, `panic = "abort"`, `strip = true`.
- **Sem flash branco** — a janela nasce `visible: false` e só aparece no
  `PageLoadEvent::Finished`, com um fallback de 3 s caso a página falhe.
- **WebView2** — o Tauri usa o motor já presente no Windows, em vez de embarcar
  um Chromium inteiro como faria o Electron. O instalador fica na casa dos
  poucos MB e o consumo de RAM é uma fração.

---

## Desenvolvimento

Requer [Node 20+](https://nodejs.org) e [Rust](https://rustup.rs).

```bash
npm install
npm run icons      # gera src-tauri/icons/ a partir de assets/icon-source.png
npm run dev        # abre o app em modo desenvolvimento
npm run build:win  # compila o .exe + instalador NSIS
```

`npm run frontend` roda sozinho antes de `dev` e `build` (via
`beforeDevCommand` / `beforeBuildCommand`), então o `src/` fica sempre em dia
com o HTML original.

### Atualizar o editor

Substitua `everything-editor-v1.6.html` e recompile. Se mudar o nome do
arquivo, passe o novo caminho:

```bash
node scripts/prepare-frontend.mjs caminho/para/novo-editor.html
```

### Ícone

Extraído do `apple-touch-icon` embutido no próprio HTML (256×256) e salvo em
`assets/icon-source.png`. O `npm run icons` gera todos os PNGs e um `icon.ico`
multi-resolução (16, 24, 32, 48, 64, 128, 256). Para trocar, substitua o
`assets/icon-source.png` e rode o script de novo.

---

## Estrutura

```
everything-editor-v1.6.html   HTML original (fonte de verdade)
assets/icon-source.png        ícone extraído do HTML
scripts/prepare-frontend.mjs  gera src/ a partir do HTML
scripts/gen-icons.mjs         gera src-tauri/icons/
src/                          frontend gerado (fora do Git)
src-tauri/                    app Tauri: config, Rust, ícones
.github/workflows/            CI que compila o instalador no Windows
```
