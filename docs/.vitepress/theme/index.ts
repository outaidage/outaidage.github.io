import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style.css'

import Hero from './components/Hero.vue'
import FeatureCard from './components/FeatureCard.vue'
import Footer from './components/Footer.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('Hero', Hero)
    app.component('FeatureCard', FeatureCard)
    app.component('Footer', Footer)
  },
} satisfies Theme
