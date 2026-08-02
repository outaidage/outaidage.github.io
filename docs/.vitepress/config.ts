import { defineConfig } from 'vitepress'

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
        items: [
          { text: '书签首页', link: '/bookmarks/' },
          { text: '管理器（导入/分类）', link: '/bookmarks/manage' },
          { text: 'Tags', link: '/tags/' },
        ],
      },
      {
        text: '关于',
        items: [{ text: 'About', link: '/about' }],
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
