import { defineConfig, presetUno, presetAttributify, presetIcons } from 'unocss'

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetIcons(),
  ],
  theme: {
    colors: {
      brand: {
        DEFAULT: '#2563EB',
        dark: '#60A5FA',
      },
    },
  },
})
