import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'

import Hero from './components/Hero.vue'
import FeatureCard from './components/FeatureCard.vue'
import Footer from './components/Footer.vue'
import BookmarkManager from './components/BookmarkManager.vue'
import SectionManager from './components/SectionManager.vue'
import DocumentManager from './components/DocumentManager.vue'
import SyncSettings from './components/SyncSettings.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Hero', Hero)
    app.component('FeatureCard', FeatureCard)
    app.component('Footer', Footer)
    app.component('BookmarkManager', BookmarkManager)
    app.component('SectionManager', SectionManager)
    app.component('DocumentManager', DocumentManager)
    app.component('SyncSettings', SyncSettings)
  },
} satisfies Theme
