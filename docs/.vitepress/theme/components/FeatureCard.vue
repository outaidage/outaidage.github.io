<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  desc: string
  link: string
}>()
</script>

<template>
  <a :href="link" class="ol-card">
    <div class="ol-card-icon">{{ icon }}</div>
    <div class="ol-card-body">
      <h3 class="ol-card-title">{{ title }}</h3>
      <p class="ol-card-desc">{{ desc }}</p>
    </div>
    <span class="ol-card-arrow" aria-hidden="true">→</span>
  </a>
</template>

<style scoped>
.ol-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px 18px 18px 16px;
  background: var(--ol-card);
  border: 1px solid var(--ol-border);
  border-radius: var(--ol-radius);
  text-decoration: none;
  color: inherit;
  box-shadow: var(--ol-shadow);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  overflow: hidden;
}

.ol-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--ol-primary) 0%, transparent 60%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}

.ol-card:hover {
  border-color: color-mix(in srgb, var(--ol-primary) 45%, var(--ol-border));
  box-shadow: var(--ol-shadow-hover);
  transform: translateY(-3px);
}

.ol-card:hover::before {
  opacity: 0.04;
}

.ol-card:hover .ol-card-arrow {
  opacity: 1;
  transform: translateX(0);
  color: var(--ol-primary);
}

.ol-card:hover .ol-card-title {
  color: var(--ol-primary);
}

.ol-card-icon {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.35rem;
  background: color-mix(in srgb, var(--ol-primary) 8%, transparent);
  border-radius: 10px;
  line-height: 1;
}

.ol-card-body {
  flex: 1;
  min-width: 0;
}

.ol-card-title {
  margin: 0 0 4px;
  font-size: 1.05rem;
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--ol-text);
  transition: color 0.18s ease;
}

.ol-card-desc {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.45;
  color: var(--ol-text-secondary);
}

.ol-card-arrow {
  flex-shrink: 0;
  align-self: center;
  font-size: 1.1rem;
  opacity: 0;
  transform: translateX(-6px);
  transition: all 0.2s ease;
  color: var(--ol-text-secondary);
}

@media (max-width: 480px) {
  .ol-card {
    padding: 16px;
  }
}
</style>
