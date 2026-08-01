/**
 * 扫描 docs/ 下所有 Markdown 文件的 frontmatter `tags` 字段，
 * 生成 docs/tags/index.md 标签索引页。
 *
 * 用法：
 *   pnpm run build-tags
 */
import fs from 'node:fs'
import path from 'node:path'
import fg from 'fast-glob'

interface Entry {
  title: string
  link: string
  tags: string[]
}

function parseFrontmatter(raw: string): Record<string, any> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const fm: Record<string, any> = {}
  for (const line of match[1].split('\n')) {
    const m = line.match(/^(\w+):\s*(.*)$/)
    if (!m) continue
    const [, key, value] = m
    if (value.startsWith('[') && value.endsWith(']')) {
      fm[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean)
    } else {
      fm[key] = value.trim().replace(/^['"]|['"]$/g, '')
    }
  }
  return fm
}

function firstH1(raw: string): string | undefined {
  const m = raw.match(/^#\s+(.+)$/m)
  return m?.[1].trim()
}

async function main() {
  const files = await fg('docs/**/*.md', { ignore: ['docs/.vitepress/**', 'docs/tags/**'] })
  const byTag = new Map<string, Entry[]>()

  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8')
    const fm = parseFrontmatter(raw)
    const tags: string[] = fm.tags ?? []
    if (!tags.length) continue

    const link = '/' + path.relative('docs', file).replace(/\.md$/, '').replace(/index$/, '')
    const title = fm.title ?? firstH1(raw) ?? path.basename(file, '.md')

    for (const tag of tags) {
      if (!byTag.has(tag)) byTag.set(tag, [])
      byTag.get(tag)!.push({ title, link, tags })
    }
  }

  const sortedTags = [...byTag.keys()].sort()
  let out = '# 🏷 Tags\n\n'
  if (!sortedTags.length) {
    out += '- 暂无标签\n'
  } else {
    for (const tag of sortedTags) {
      out += `## ${tag}\n\n`
      for (const entry of byTag.get(tag)!) {
        out += `- [${entry.title}](${entry.link})\n`
      }
      out += '\n'
    }
  }

  fs.writeFileSync('docs/tags/index.md', out, 'utf-8')
  console.log(`已生成标签索引，共 ${sortedTags.length} 个标签`)
}

main()
