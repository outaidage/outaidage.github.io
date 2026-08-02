/**
 * 扫描书签 Markdown 与 public/files，生成 docs/public/stats.json
 * 构建前可运行：npx tsx scripts/generate-stats.ts
 */
import fs from 'node:fs'
import path from 'node:path'

function countBookmarksInDir(dir: string): { bookmarks: number; folders: number } {
  let bookmarks = 0
  let folders = 0
  if (!fs.existsSync(dir)) return { bookmarks, folders }

  function walk(d: string) {
    const entries = fs.readdirSync(d, { withFileTypes: true })
    for (const e of entries) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) {
        folders++
        walk(p)
      } else if (e.name.endsWith('.md') && e.name !== 'manage.md') {
        const text = fs.readFileSync(p, 'utf-8')
        const matches = text.match(/^- \[/gm)
        if (matches) bookmarks += matches.length
      }
    }
  }
  walk(dir)
  return { bookmarks, folders }
}

function countDocuments(dir: string): number {
  if (!fs.existsSync(dir)) return 0
  return fs.readdirSync(dir).filter((f) => f !== '.gitkeep' && f !== 'manifest.json' && !f.startsWith('.')).length
}

const bm = countBookmarksInDir(path.resolve('docs/bookmarks'))
const documents = countDocuments(path.resolve('docs/public/files'))
const stats = {
  bookmarks: bm.bookmarks,
  folders: bm.folders,
  documents,
  updated: new Date().toISOString().slice(0, 10),
}

fs.mkdirSync(path.resolve('docs/public'), { recursive: true })
fs.writeFileSync(path.resolve('docs/public/stats.json'), JSON.stringify(stats, null, 2) + '\n')
console.log('stats.json', stats)
