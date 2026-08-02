<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { syncFiles, toBase64FromString } from '../lib/sync'
import SyncSettings from './SyncSettings.vue'

// RESTORED - please see full in next if needed
const STORAGE_KEY = 'outai-lab-bookmarks-v1'
const root = ref({ id: 'root', name: '全部书签', bookmarks: [], children: [] })
onMounted(() => { try { const r = localStorage.getItem(STORAGE_KEY); if (r) root.value = JSON.parse(r) } catch {} })
watch(root, () => localStorage.setItem(STORAGE_KEY, JSON.stringify(root.value)), { deep: true })
</script>
<template><div class="bm"><p>书签管理器临时恢复中，请稍后刷新。完整功能即将推送。</p></div></template>
<style>.bm{padding:2rem}</style>