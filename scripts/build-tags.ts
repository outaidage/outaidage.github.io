/**
 * 扫描 docs/bookmarks 与各栏目 Markdown，提取 `标签` 与 frontmatter tags，
 * 写入 docs/tags/index.md
 */
import fs from 'node:fs'
import path from 'node:path'

interface Entry {
  title: string
  link: string
  tags: string[]
}

function walkMd(dir: string, baseUrl: string, out: string[]) {
  if (!fs.existsSync(dir)) return
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      walkMd(p, `${baseUrl}${e.name}/`, out)
    } else if (e.name.endsWith('.md') && e.name !== 'manage.md') {
      out.push(p)
    }
  }
}

function extractFromBookmarks(file: string, link: string): Entry[] {
  const raw = fs.readFileSync(file, 'utf-8')
  const entries: Entry[] = []
  // - [title](url) `tag1` `tag2`
  const re = /^- \[([^\]]+)\]\(([^)]+)\)(.*)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    const title = m[1]
    const url = m[2]
    const rest = m[3] || ''
    const tags = [...rest.matchAll(/`([^`]+)`/g)].map((x) => x[1].trim()).filter(Boolean)
    if (tags.length) {
      entries.push({ title, link: url, tags })
    }
  }
  return entries
}

function extractFrontmatterTags(file: string, link: string): Entry[] {
  const raw = fs.readFileSync(file, 'utf-8')
  const fm = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!fm) return []
  const tagLine = fm[1].split('\n').find((l) => l.startsWith('tags:'))
  if (!tagLine) return []
  const value = tagLine.replace(/^tags:\s*/, '').trim()
  let tags: string[] = []
  if (value.startsWith('[') && value.endsWith(']')) {
    tags = value
      .slice(1, -1)
      .split(',')
      .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean)
  } else if (value) {
    tags = [value.replace(/^['"]|['"]$/g, '')]
  }
  if (!tags.length) return []
  const h1 = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || path.basename(file, '.md')
  return [{ title: h1, link, tags }]
}

const all: Entry[] = []
const bmFiles: string[] = []
walkMd(path.resolve('docs/bookmarks'), '/bookmarks/', bmFiles)
for (const f of bmFiles) {
  const rel = path.relative(path.resolve('docs/bookmarks'), f).replace(/\\/g, '/')
  const link =
    '/bookmarks/' +
    rel.replace(/\.md$/, '').replace(/\/index$/, '').replace(/^index$/, '')
  all.push(...extractFromBookmarks(f, link.endsWith('/') ? link : link || '/bookmarks/'))
}

const sections = ['learn', 'ai', 'network', 'software', 'media', 'reading', 'tools', 'downloads', 'notes', 'featured']
for (const s of sections) {
  const f = path.resolve('docs', s, 'index.md')
  if (fs.existsSync(f)) all.push(...extractFrontmatterTags(f, `/${s}/`))
}

const byTag = new Map<string, Entry[]>()
for (const e of all) {
  for (const t of e.tags) {
    if (!byTag.has(t)) byTag.set(t, [])
    byTag.get(t)!.push(e)
  }
}

const sorted = [...byTag.keys()].sort((a, b) => a.localeCompare(b, 'zh-CN'))
let body = ''
if (!sorted.length) {
  body = '暂无标签。\n'
} else {
  body += '## 标签云\n\n'
  for (const t of sorted) {
    const id = encodeURIComponent(t)
    body += `[\`${t}\`](#${slugAnchor(t)}) ` 
  }
  body += '\n\n'
  for (const t of sorted) {
    body += `## ${t}\n\n`
    for (const e of byTag.get(t)!) {
      body += `- [${e.title}](${e.link})\n`
    }
    body += '\n'
  }
}

function slugAnchor(t: string) {
  return t.toLowerCase().replace(/\s+/g, '-')
}

const page = `---
title: Tags
description: 按标签浏览书签与内容
---

# 🏷 Tags

从已发布的书签与栏目内容中收集的标签。共 **${sorted.length}** 个标签。

[书签管理器](/bookmarks/manage) · [书签首页](/bookmarks/)

${body}
`

fs.mkdirSync(path.resolve('docs/tags'), { recursive: true })
fs.writeFileSync(path.resolve('docs/tags/index.md'), page, 'utf-8')
console.log(`tags: ${sorted.length} tags, ${all.length} entries`)
