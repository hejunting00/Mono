// Export: markdown → standalone HTML (GitHub-ish styling + KaTeX + mermaid).
import MarkdownIt from 'markdown-it'
import katex from 'katex'

let md: MarkdownIt | null = null
function getMd(): MarkdownIt {
  if (!md) {
    md = new MarkdownIt({ html: true, linkify: true, breaks: false })
    // task lists → checkboxes
    md.renderer.rules.list_item_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx]
      const next = tokens[idx + 1]
      const checked = next?.content?.startsWith('[x] ') || next?.content?.startsWith('[X] ')
      const unchecked = next?.content?.startsWith('[ ] ')
      if (checked || unchecked) {
        token.attrSet('class', 'task-item')
        if (next) {
          next.content = next.content.replace(/^\[[ xX]\]\s+/, '')
        }
        return `<li class="task-item"><input type="checkbox" ${checked ? 'checked' : ''} disabled>`
      }
      return self.renderToken(tokens, idx, options)
    }
  }
  return md
}

const EXPORT_CSS = `
body { margin: 0; padding: 2.5em 1em; background: var(--md-bg); color: var(--md-text); }
.md-export { max-width: 820px; margin: 0 auto; font-size: 16px; line-height: 1.7; font-family: var(--md-font); }
.md-export h1 { font-size: 1.9em; } .md-export h2 { font-size: 1.5em; }
.md-export blockquote { border-left: 4px solid var(--md-quote-border); padding-left: 1em; color: var(--md-muted); margin: 0.6em 0; }
.md-export code { font-family: var(--md-mono); font-size: 0.88em; background: var(--md-code-bg); padding: 0.15em 0.4em; border-radius: 4px; }
.md-export pre { background: var(--md-code-bg); border-radius: 8px; padding: 0.9em 1em; overflow-x: auto; }
.md-export pre code { background: transparent; padding: 0; }
.md-export table { border-collapse: collapse; } .md-export th, .md-export td { border: 1px solid var(--md-border); padding: 6px 14px; }
.md-export img { max-width: 100%; }
.md-export a { color: var(--md-link); }
.md-export hr { border: none; border-top: 3px double var(--md-border); margin: 1.6em 0; }
.md-export ul.task-item, .md-export li.task-item { list-style: none; }
`

function renderMath(html: string): string {
  // $$block$$ first, then inline $...$
  html = html.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false })
    } catch {
      return _
    }
  })
  html = html.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
    if (!tex.trim() || /^\s|\s$/.test(tex)) return _
    try {
      return katex.renderToString(tex, { displayMode: false, throwOnError: false })
    } catch {
      return _
    }
  })
  return html
}

async function renderMermaidBlocks(html: string): Promise<string> {
  const blocks = html.match(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g)
  if (!blocks) return html
  const mermaid = (await import('mermaid')).default
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: document.documentElement.dataset['theme'] === 'night' ? 'dark' : 'default' })
  let seq = 0
  for (const block of blocks) {
    const code = block
      .replace(/<pre><code class="language-mermaid">/, '')
      .replace(/<\/code><\/pre>/, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
    try {
      const { svg } = await mermaid.render('mdread-export-' + ++seq, code)
      html = html.replace(block, svg)
    } catch {
      /* keep the code block */
    }
  }
  return html
}

export async function buildStandaloneHtml(name: string, markdown: string): Promise<string> {
  const themeCss =
    document.documentElement.dataset['theme'] === 'night'
      ? await import('../themes/night.css?inline').then((m) => m.default)
      : await import('../themes/github-light.css?inline').then((m) => m.default)
  const katexCss = await import('katex/dist/katex.min.css?inline').then((m) => m.default)

  let body = getMd().render(markdown)
  body = renderMath(body)
  body = await renderMermaidBlocks(body)

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${name.replace(/\.[^.]+$/, '')}</title>
<style>${katexCss}</style>
<style>${themeCss}</style>
<style>${EXPORT_CSS}</style>
</head>
<body>
<article class="md-export md-body">${body}</article>
</body>
</html>`
}

export async function exportHtml(name: string, markdown: string): Promise<void> {
  const { getApi } = await import('../lib/tauri')
  const api = getApi()
  const html = await buildStandaloneHtml(name, markdown)
  const target = await api.saveAsDialog(name.replace(/\.[^.]+$/, '') + '.html')
  if (!target) return
  await api.writeFile(target, html)
  await api.revealItem(target)
}

export async function exportPdf(markdown: string): Promise<void> {
  // Render the standalone HTML in a hidden iframe and invoke the platform
  // print dialog (WebView2 / browser) — "Save as PDF" from there.
  const html = await buildStandaloneHtml('print', markdown)
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;'
  iframe.setAttribute('aria-hidden', 'true')
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) {
    iframe.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  // let KaTeX fonts and rendered SVG settle before printing
  await new Promise((r) => setTimeout(r, 1200))
  iframe.contentWindow?.focus()
  iframe.contentWindow?.print()
  // keep the frame around until the dialog is certainly done
  setTimeout(() => iframe.remove(), 60_000)
}
