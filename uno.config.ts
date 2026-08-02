import { defineConfig, presetMini } from 'unocss'

export default defineConfig({
  presets: [presetMini()],
  theme: {
    colors: {
      primary: '#3b82f6',
      primaryDark: '#2563eb',
      lightBg: '#ffffff',
      darkBg: '#0f172a',
      lightCard: '#f8fafc',
      darkCard: '#1e293b'
    },
  },
  shortcuts: {
    'card-base': 'rounded-lg border border-gray-200 dark:border-gray-700 p-4 transition-all hover:border-primary',
    'text-desc': 'text-gray-500 dark:text-gray-400 text-sm',
  }
})