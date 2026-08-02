/**
 * 书签导入脚本 —— 支持：
 *   1. Raindrop.io CSV 导出（推荐，完整保留集合路径 + 标签）
 *   2. Netscape HTML（Chrome / Firefox / Raindrop HTML）
 *
 * 用法：
 *   npm run import-bookmarks -- ./Raindrop.io-Export.csv --clean
 *   npm run import-bookmarks -- ./bookmarks.html --clean
 *
 * 生成结构（深层嵌套）：
 *   docs/bookmarks/
 *     index.md
 *     科学上网/
 *       index.md
 *     电影电视/
 *       index.md
 *       纪录片/
 *         index.md
 */
import fs from 'node:fs'
import path from 'node:path'

interface Bookmark {
  title: string
  url: string
  addDate?: string
  tags?: string[]
  note?: string
}

interface Folder {
  name: string
  bookmarks: Bookmark[]
  children: Folder[]
}

// ───────── utils ─────────

function decodeEntities(str: string): string {
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
}

function stripTags(str: string): string {
  return str.replace(/<[^>]+>/g, '').trim()
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'untitled'
}

function uniqueSlug(name: string, used: Set<string>): string {
  let base = slugify(name)
  let slug = base
  let i = 2
  while (used.has(slug)) {
    slug = `${base}-${i}`
    i++
  }
  used.add(slug)
  return slug
}

function ensureChild(parent: Folder, name: string): Folder {
  let child = parent.children.find((c) => c.name === name)
  if (!child) {
    child = { name, bookmarks: [], children: [] }
    parent.children.push(child)
  }
  return child
}

/** 按 "a/b/c" 路径创建/获取嵌套文件夹 */
function ensurePath(root: Folder, folderPath: string): Folder {
  const parts = folderPath
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  let cur = root
  for (const part of parts) {
    cur = ensureChild(cur, part)
  }
  return cur
}

function countAll(folder: Folder): number {
  let n = folder.bookmarks.length
  for (const c of folder.children) n += countAll(c)
  return n
}

// ───────── CSV parser (Raindrop) ─────────

/** 简易 CSV 行解析，支持双引号转义 */
function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        result.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
  }
  result.push(cur)
  return result
}

function parseRaindropCsv(text: string): Folder {
  const root: Folder = { name: 'Bookmarks', bookmarks: [], children: [] }
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return root

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (name: string) => headers.indexOf(name)

  // Raindrop 常见列名
  const iUrl = idx('url')
  const iTitle = idx('title')
  const iFolder = idx('folder') >= 0 ? idx('folder') : idx('collection')
  const iTags = idx('tags')
  const iCreated = idx('created')
  const iNote = idx('note') >= 0 ? idx('note') : idx('excerpt')

  if (iUrl < 0) {
    throw new Error('CSV 缺少 url 列，请确认是 Raindrop 导出的 CSV')
  }

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const url = (cols[iUrl] || '').trim()
    if (!url || !/^https?:\/\//i.test(url)) continue

    const title = (iTitle >= 0 ? cols[iTitle] : '') || url
    const folderPath = (iFolder >= 0 ? cols[iFolder] : '') || ''
    const tagsRaw = iTags >= 0 ? cols[iTags] || '' : ''
    const tags = tagsRaw
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean)
    const note = iNote >= 0 ? (cols[iNote] || '').trim() : undefined

    let addDate: string | undefined
    if (iCreated >= 0 && cols[iCreated]) {
      const raw = cols[iCreated].trim()
      // Unix 秒 / 毫秒 / ISO
      if (/^\d{10,13}$/.test(raw)) {
        const n = Number(raw)
        const ms = n > 1e12 ? n : n * 1000
        addDate = new Date(ms).toISOString().slice(0, 10)
      } else {
        const d = new Date(raw)
        if (!isNaN(d.getTime())) addDate = d.toISOString().slice(0, 10)
      }
    }

    const target = folderPath ? ensurePath(root, folderPath) : root
    target.bookmarks.push({
      title: title.trim(),
      url,
      tags: tags.length ? tags : undefined,
      addDate,
      note: note || undefined,
    })
  }

  return root
}

// ───────── HTML parser (Netscape) ─────────

function parseNetscapeHtml(html: string): Folder {
  const root: Folder = { name: 'Bookmarks', bookmarks: [], children: [] }
  const stack: Folder[] = [root]

  const normalized = html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/<(A|H3)\b([^>]*)\n([^>]*)>/gi, '<$1$2 $3>')

  const lines = normalized.split('\n')
  const h3Re = /<H3\b([^>]*)>([\s\S]*?)<\/H3>/i
  const aRe = /<A\b([^>]*)HREF="([^"]+)"([^>]*)>([\s\S]*?)<\/A>/i
  const aReAlt = /<A\b([^>]*)>([\s\S]*?)<\/A>/i
  const tagsRe = /TAGS="([^"]*)"/i
  const addDateRe = /ADD_DATE="(\d+)"/i
  const hrefRe = /HREF="([^"]+)"/i

  for (const line of lines) {
    if (/<DL\b/i.test(line) && !/<\/DL>/i.test(line)) continue

    if (/<\/DL>/i.test(line)) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const h3Match = line.match(h3Re)
    if (h3Match) {
      const folder: Folder = {
        name: decodeEntities(stripTags(h3Match[2])),
        bookmarks: [],
        children: [],
      }
      stack[stack.length - 1].children.push(folder)
      stack.push(folder)
      continue
    }

    let url = ''
    let title = ''
    let attrBlob = ''

    const aMatch = line.match(aRe)
    if (aMatch) {
      url = aMatch[2]
      title = decodeEntities(stripTags(aMatch[4]))
      attrBlob = aMatch[1] + aMatch[3]
    } else {
      const alt = line.match(aReAlt)
      if (alt) {
        const href = alt[1].match(hrefRe)
        if (href) {
          url = href[1]
          title = decodeEntities(stripTags(alt[2]))
          attrBlob = alt[1]
        }
      }
    }

    if (url) {
      const addDateMatch = attrBlob.match(addDateRe)
      const tagsMatch = attrBlob.match(tagsRe)
      stack[stack.length - 1].bookmarks.push({
        url,
        title: title || url,
        addDate: addDateMatch
          ? new Date(Number(addDateMatch[1]) * 1000).toISOString().slice(0, 10)
          : undefined,
        tags: tagsMatch
          ? tagsMatch[1]
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
          : undefined,
      })
    }
  }

  return root
}

// ───────── markdown render ─────────

function bookmarkLine(b: Bookmark): string {
  const tags =
    b.tags && b.tags.length
      ? ' ' + b.tags.map((t) => '`' + t + '`').join(' ')
      : ''
  const date = b.addDate ? ` · ${b.addDate}` : ''
  let line = `- [${b.title}](${b.url})${tags}${date}`
  if (b.note) {
    line += `\n  > ${b.note.replace(/\n/g, ' ')}`
  }
  return line
}

function renderFolderPage(
  folder: Folder,
  childLinks: { name: string; rel: string; count: number }[],
): string {
  const lines: string[] = []

  lines.push('---')
  lines.push(`title: ${JSON.stringify(folder.name)}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${folder.name}`)
  lines.push('')

  if (childLinks.length) {
    lines.push('## 子文件夹')
    lines.push('')
    for (const c of childLinks) {
      const tip = c.count > 0 ? `（${c.count}）` : ''
      lines.push(`- [${c.name}](${c.rel})${tip}`)
    }
    lines.push('')
  }

  if (folder.bookmarks.length) {
    if (childLinks.length) {
      lines.push('## 书签')
      lines.push('')
    }
    for (const b of folder.bookmarks) {
      lines.push(bookmarkLine(b))
    }
    lines.push('')
  }

  if (!folder.bookmarks.length && !childLinks.length) {
    lines.push('> 此文件夹为空')
    lines.push('')
  }

  return lines.join('\n')
}

// ───────── write tree ─────────

interface WriteStats {
  files: number
  bookmarks: number
  folders: number
}

function cleanBookmarksDir(outDir: string) {
  if (!fs.existsSync(outDir)) return
  for (const entry of fs.readdirSync(outDir)) {
    fs.rmSync(path.join(outDir, entry), { recursive: true, force: true })
  }
}

function writeFolderTree(folder: Folder, dir: string, stats: WriteStats): void {
  fs.mkdirSync(dir, { recursive: true })

  const usedSlugs = new Set<string>()
  const childLinks: { name: string; rel: string; count: number }[] = []

  for (const child of folder.children) {
    if (child.bookmarks.length === 0 && child.children.length === 0) continue

    const slug = uniqueSlug(child.name, usedSlugs)
    const childDir = path.join(dir, slug)
    writeFolderTree(child, childDir, stats)

    childLinks.push({
      name: child.name,
      rel: `./${slug}/`,
      count: countAll(child),
    })
  }

  const body = renderFolderPage(folder, childLinks)
  fs.writeFileSync(path.join(dir, 'index.md'), body, 'utf-8')

  stats.files += 1
  stats.folders += 1
  stats.bookmarks += folder.bookmarks.length
}

function printTree(folder: Folder, indent = ''): void {
  const total = countAll(folder)
  console.log(`${indent}${folder.name} (${folder.bookmarks.length} 本层 / ${total} 合计)`)
  for (const child of folder.children) {
    if (child.bookmarks.length === 0 && child.children.length === 0) continue
    printTree(child, indent + '  ')
  }
}

// ───────── main ─────────

function main() {
  const args = process.argv.slice(2).filter((a) => a !== '--')
  const clean = args.includes('--clean')
  const input = args.find((a) => !a.startsWith('--'))

  if (!input) {
    console.error('用法: npm run import-bookmarks -- <file.csv|file.html> [--clean]')
    console.error('')
    console.error('Raindrop 推荐导出 CSV：')
    console.error('  Settings → Backups → 下载 CSV')
    console.error('  或 集合页 → Export → CSV')
    process.exit(1)
  }

  if (!fs.existsSync(input)) {
    console.error(`文件不存在: ${input}`)
    process.exit(1)
  }

  const raw = fs.readFileSync(input, 'utf-8')
  const lower = input.toLowerCase()
  let root: Folder

  if (lower.endsWith('.csv')) {
    console.log('检测到 Raindrop CSV，按集合路径 + 标签解析…')
    root = parseRaindropCsv(raw)
  } else if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    console.log('检测到 Netscape HTML…')
    root = parseNetscapeHtml(raw)
  } else {
    // 自动嗅探
    if (raw.trimStart().startsWith('<!') || /<DL/i.test(raw)) {
      console.log('内容像 HTML，按 Netscape 解析…')
      root = parseNetscapeHtml(raw)
    } else {
      console.log('按 CSV 解析…')
      root = parseRaindropCsv(raw)
    }
  }

  const outDir = path.resolve('docs/bookmarks')

  if (clean) {
    console.log('清空 docs/bookmarks/ …')
    cleanBookmarksDir(outDir)
  }

  const stats: WriteStats = { files: 0, bookmarks: 0, folders: 0 }
  writeFolderTree(root, outDir, stats)

  console.log('')
  console.log('文件夹树：')
  printTree(root)
  console.log('')
  console.log(
    `完成：${stats.folders} 个文件夹，${stats.bookmarks} 条书签，${stats.files} 个 index.md → ${outDir}`,
  )
}

main()
