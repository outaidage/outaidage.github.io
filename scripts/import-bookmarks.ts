/**
 * 将 Netscape 书签 HTML（Chrome / Firefox / Raindrop 导出）转换为
 * docs/bookmarks/ 下按真实文件夹层级嵌套的 Markdown 目录结构。
 *
 * 用法：
 *   npm run import-bookmarks -- ./bookmarks.html
 *   npm run import-bookmarks -- ./bookmarks.html --clean
 *
 * 生成结构示例：
 *   docs/bookmarks/
 *     index.md                 # 根目录书签 + 子文件夹入口
 *     design/
 *       index.md
 *       fonts/
 *         index.md
 *     programming/
 *       index.md
 *       javascript/
 *         index.md
 */
import fs from 'node:fs'
import path from 'node:path'

interface Bookmark {
  title: string
  url: string
  addDate?: string
  tags?: string[]
}

interface Folder {
  name: string
  bookmarks: Bookmark[]
  children: Folder[]
}

// ───────── parse ─────────

function parseNetscapeHtml(html: string): Folder {
  const root: Folder = { name: 'Bookmarks', bookmarks: [], children: [] }
  const stack: Folder[] = [root]

  // 部分导出器会把属性折行，先压成单行再按标签切
  const normalized = html
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    // 把跨行的 <A ...> 和 <H3 ...> 合并到一行
    .replace(/<(A|H3)\b([^>]*)\n([^>]*)>/gi, '<$1$2 $3>')

  const lines = normalized.split('\n')

  const h3Re = /<H3\b([^>]*)>([\s\S]*?)<\/H3>/i
  const aRe = /<A\b([^>]*)HREF="([^"]+)"([^>]*)>([\s\S]*?)<\/A>/i
  // 更宽松：HREF 可能不在第一个属性
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

function stripTags(str: string): string {
  return str.replace(/<[^>]+>/g, '').trim()
}

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

// ───────── path helpers ─────────

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return s || 'untitled'
}

/** 同一父目录下避免 slug 冲突：design、design-2、design-3 … */
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

// ───────── markdown ─────────

function bookmarkLine(b: Bookmark): string {
  const tags =
    b.tags && b.tags.length
      ? ' ' + b.tags.map((t) => '`' + t + '`').join(' ')
      : ''
  const date = b.addDate ? ` · ${b.addDate}` : ''
  return `- [${b.title}](${b.url})${tags}${date}`
}

function renderFolderPage(folder: Folder, childLinks: { name: string; rel: string; count: number }[]): string {
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

function countAll(folder: Folder): number {
  let n = folder.bookmarks.length
  for (const c of folder.children) n += countAll(c)
  return n
}

// ───────── write tree ─────────

interface WriteStats {
  files: number
  bookmarks: number
  folders: number
}

function cleanBookmarksDir(outDir: string) {
  if (!fs.existsSync(outDir)) return
  // 只清 docs/bookmarks 下内容，保留目录本身
  for (const entry of fs.readdirSync(outDir)) {
    const p = path.join(outDir, entry)
    fs.rmSync(p, { recursive: true, force: true })
  }
}

function writeFolderTree(
  folder: Folder,
  dir: string,
  stats: WriteStats,
  isRoot = false,
): void {
  fs.mkdirSync(dir, { recursive: true })

  const usedSlugs = new Set<string>()
  const childLinks: { name: string; rel: string; count: number }[] = []

  for (const child of folder.children) {
    // 跳过完全空的叶子（无书签且无子文件夹）
    if (child.bookmarks.length === 0 && child.children.length === 0) continue

    const slug = uniqueSlug(child.name, usedSlugs)
    const childDir = path.join(dir, slug)
    writeFolderTree(child, childDir, stats, false)

    childLinks.push({
      name: child.name,
      rel: `./${slug}/`,
      count: countAll(child),
    })
  }

  const body = renderFolderPage(folder, childLinks)
  const filePath = path.join(dir, 'index.md')
  fs.writeFileSync(filePath, body, 'utf-8')

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
    console.error('用法: npm run import-bookmarks -- <bookmarks.html> [--clean]')
    console.error('  --clean  导入前清空 docs/bookmarks/ 目录')
    process.exit(1)
  }

  if (!fs.existsSync(input)) {
    console.error(`文件不存在: ${input}`)
    process.exit(1)
  }

  const html = fs.readFileSync(input, 'utf-8')
  const root = parseNetscapeHtml(html)
  const outDir = path.resolve('docs/bookmarks')

  if (clean) {
    console.log('清空 docs/bookmarks/ …')
    cleanBookmarksDir(outDir)
  }

  const stats: WriteStats = { files: 0, bookmarks: 0, folders: 0 }
  writeFolderTree(root, outDir, stats, true)

  console.log('')
  console.log('文件夹树：')
  printTree(root)
  console.log('')
  console.log(
    `完成：${stats.folders} 个文件夹，${stats.bookmarks} 条书签，${stats.files} 个 index.md → ${outDir}`,
  )
}

main()
