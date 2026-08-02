<script setup lang="ts">
import { ref, onMounted } from 'vue'

const stats = ref({
  bookmarks: 0,
  documents: 0,
  folders: 0,
  updated: '',
})
const loaded = ref(false)

onMounted(async () => {
  try {
    const res = await fetch('/stats.json?' + Date.now())
    if (res.ok) {
      const data = await res.json()
      stats.value = {
        bookmarks: data.bookmarks || 0,
        documents: data.documents || 0,
        folders: data.folders || 0,
        updated: data.updated || '',
      }
    }
  } catch { /* */ }
  loaded.value = true
})
</script>

<template>
  <div v-if="loaded" class="ss-wrap">
    <a class="ss-item" href="/bookmarks/">
      <span class="ss-num">{{ stats.bookmarks }}</span>
      <span class="ss-label">书签</span>
    </a>
    <a class="ss-item" href="/documents/">
      <span class="ss-num">{{ stats.documents }}</span>
      <span class="ss-label">文档</span>
    </a>
    <a class="ss-item" href="/bookmarks/">
      <span class="ss-num">{{ stats.folders }}</span>
      <span class="ss-label">文件夹</span>
    </a>
    <div class="ss-item muted">
      <span class="ss-num small">{{ stats.updated || '—' }}</span>
      <span class="ss-label">最近更新</span>
    </div>
  </div>
</template>

<style scoped>
.ss-wrap {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
  max-width: 720px;
  margin: 0 auto 2rem;
  padding: 0 1.5rem;
}
@media (max-width: 600px) {
  .ss-wrap { grid-template-columns: repeat(2, 1fr); }
}
.ss-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.85rem 0.5rem;
  border-radius: 12px;
  border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-card, #fff);
  text-decoration: none !important;
  color: inherit !important;
  transition: box-shadow 0.2s, border-color 0.2s;
}
.ss-item:not(.muted):hover {
  border-color: var(--ol-primary, #2563eb);
  box-shadow: var(--ol-shadow-hover, 0 8px 20px rgba(0,0,0,0.06));
}
.ss-item.muted { opacity: 0.85; }
.ss-num {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--ol-primary, #2563eb);
  line-height: 1.2;
}
.ss-num.small { font-size: 0.95rem; font-weight: 600; color: var(--ol-text-secondary, #6b7280); }
.ss-label { font-size: 0.8rem; color: var(--ol-text-secondary, #6b7280); }
</style>
