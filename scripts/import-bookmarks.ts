/**
 * 将 Raindrop.io 导出的 Netscape 书签 HTML 转换为
 * docs/bookmarks/ 下按文件夹分类的 Markdown 文件。
 *
 * 用法：
 *   pnpm run import-bookmarks -- ./raindrop-export.html
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

function parseNetscapeHtml(html: string): Folder {
  const root: Folder = { name: 'Bookmarks', bookmarks: [], children: [] }
  const stack: Folder[] = [root]

  const lines = html.split(/\r?\n/)
  const h3Re = /<H3[^>]*>(.*?)<\/H3>/i
  const aRe = /<A HREF="([^"]+)"[^>]*>(.*?)<\/A>/i
  const tagsRe = /TAGS="([^"]*)"/i
  const addDateRe = /ADD_DATE="(\d+)"/i

  for (const line of lines) {
    if (/<DL>/i.test(line)) continue

    if (/<\/DL>/i.test(line)) {
      if (stack.length > 1) stack.pop()
      continue
    }

    const h3Match = line.match(h3Re)
    if (h3Match) {
      const folder: Folder = { name: decodeEntities(h3Match[1]), bookmarks: [], children: [] }
      stack[stack.length - 1].children.push(folder)
      stack.push(folder)
      continue
    }

    const aMatch = line.match(aRe)
    if (aMatch) {
      const addDateMatch = line.match(addDateRe)
      const tagsMatch = line.match(tagsRe)
      stack[stack.length - 1].bookmarks.push({
        url: aMatch[1],
        title: decodeEntities(aMatch[2]),
        addDate: addDateMatch ? new Date(Number(addDateMatch[1]) * 1000).toISOString().slice(0, 10) : undefined,
        tags: tagsMatch ? tagsMatch[1].split(',').filter(Boolean) : undefined,
      })
    }
  }

  return root
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '') || 'untitled'
}

function folderToMarkdown(folder: Folder, depth = 1): string {
  let out = ''
  if (folder.bookmarks.length) {
    out += folder.bookmarks
      .map((b) => `- [${b.title}](${b.url})${b.tags?.length ? ` \`${b.tags.join('`, `')}\`` : ''}`)
      .join('\n')
    out += '\n\n'
  }
  for (const child of folder.children) {
    out += `${'#'.repeat(Math.min(depth + 1, 6))} ${child.name}\n\n`
    out += folderToMarkdown(child, depth + 1)
  }
  return out
}

function writeFolder(folder: Folder, outDir: string) {
  fs.mkdirSync(outDir, { recursive: true })
  const body = `# ${folder.name}\n\n${folderToMarkdown(folder)}`
  fs.writeFileSync(path.join(outDir, `${slugify(folder.name)}.md`), body, 'utf-8')
  for (const child of folder.children) {
    // 顶层子文件夹各生成一个独立文件；如需嵌套目录可改为递归建子目录
  }
}

function main() {
  const input = process.argv[2]
  if (!input) {
    console.error('用法: pnpm run import-bookmarks -- <raindrop-export.html>')
    process.exit(1)
  }
  const html = fs.readFileSync(input, 'utf-8')
  const root = parseNetscapeHtml(html)
  const outDir = path.resolve('docs/bookmarks')
  writeFolder(root, outDir)
  console.log(`已生成书签 Markdown 到 ${outDir}`)
}

main()
