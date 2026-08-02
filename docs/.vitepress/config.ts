import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** 扫描 docs/bookmarks 生成侧边栏树 */
function buildBookmarksSidebar(): { text: string; link?: string; collapsed?: boolean; items?: any[] }[] {
  const base = path.resolve(__dirname, '../bookmarks')
  if (!fs.existsSync(base)) {
    return [
      { text: '书签首页', link: '/bookmarks/' },
      { text: '管理器', link: '/bookmarks/manage' },
    ]
  }

  function walk(dir: string, urlBase: string): any[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    const items: any[] = []

    // index.md at this level
    const hasIndex = entries.some((e) => e.isFile() && e.name === 'index.md')

    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))

    for (const d of dirs) {
      const childPath = path.join(dir, d.name)
      const childUrl = `${urlBase}${d.name}/`
      const children = walk(childPath, childUrl)
      const childHasIndex = fs.existsSync(path.join(childPath, 'index.md'))

      if (children.length) {
        items.push({
          text: prettyName(d.name),
          collapsed: true,
          items: [
            ...(childHasIndex ? [{ text: '概览', link: childUrl }] : []),
            ...children,
          ],
        })
      } else if (childHasIndex) {
        items.push({ text: prettyName(d.name), link: childUrl })
      }
    }

    // other md files (non-index)
    const mds = entries
      .filter((e) => e.isFile() && e.name.endsWith('.md') && e.name !== 'index.md' && e.name !== 'manage.md')
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    for (const f of mds) {
      const name = f.name.replace(/\.md$/, '')
      items.push({ text: prettyName(name), link: `${urlBase}${name}` })
    }

    return items
  }

  function prettyName(slug: string) {
    return slug.replace(/-/g, ' ')
  }

  const tree = walk(base, '/bookmarks/')
  return [
    { text: '书签首页', link: '/bookmarks/' },
    { text: '管理器（导入/发布）', link: '/bookmarks/manage' },
    ...tree,
  ]
}

export default defineConfig({
  title: 'Outai Lab',
  description: 'Build · Learn · Collect. 一个不断成长的个人知识库。',
  lang: 'zh-CN',
  cleanUrls: true,
  lastUpdated: true,

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#2563EB' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'Outai Lab' }],
    ['meta', { property: 'og:description', content: 'Build · Learn · Collect. 一个不断成长的个人知识库。' }],
    ['meta', { property: 'og:image', content: '/og.png' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Outai Lab',

    nav: [
      { text: 'Home', link: '/' },
      { text: 'Featured', link: '/featured/' },
      {
        text: 'Bookmarks',
        items: [
          { text: '书签首页', link: '/bookmarks/' },
          { text: '书签管理器', link: '/bookmarks/manage' },
          { text: '标签', link: '/tags/' },
        ],
      },
      { text: 'About', link: '/about' },
    ],

    sidebar: [
      {
        text: '知识库',
        collapsed: false,
        items: [
          { text: 'Home', link: '/' },
          { text: 'Featured', link: '/featured/' },
          { text: 'Learn', link: '/learn/' },
          { text: 'Network', link: '/network/' },
          { text: 'AI', link: '/ai/' },
          { text: 'Software', link: '/software/' },
          { text: 'Media', link: '/media/' },
          { text: 'Reading', link: '/reading/' },
          { text: 'Tools', link: '/tools/' },
          { text: 'Downloads', link: '/downloads/' },
          { text: 'Notes', link: '/notes/' },
        ],
      },
      {
        text: '书签',
        collapsed: false,
        items: buildBookmarksSidebar(),
      },
      {
        text: '标签 & 关于',
        items: [
          { text: 'Tags', link: '/tags/' },
          { text: 'About', link: '/about' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/outaidage/outaidage.github.io' },
    ],

    footer: {
      message: 'Built with VitePress · Outai Lab',
      copyright: '© 2026 Outai Lab',
    },

    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
      label: '本页目录',
    },

    docFooter: {
      prev: '上一页',
      next: '下一页',
    },

    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式',
    sidebarMenuLabel: '菜单',
    returnToTopLabel: '回到顶部',
  },
})
