<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'

const URL_KEY = 'outai-lab-sync-url'
const PASS_KEY = 'outai-lab-sync-pass'

const open = ref(false)
const syncUrl = ref('')
const syncPass = ref('')
const status = ref('')

onMounted(() => {
  syncUrl.value = localStorage.getItem(URL_KEY) || ''
  syncPass.value = localStorage.getItem(PASS_KEY) || ''
})

watch(syncUrl, (v) => localStorage.setItem(URL_KEY, v.trim()))
watch(syncPass, (v) => {
  if (v) localStorage.setItem(PASS_KEY, v)
  else localStorage.removeItem(PASS_KEY)
})

async function testConnection() {
  const url = syncUrl.value.trim().replace(/\/+$/, '')
  if (!url) {
    status.value = '请填写同步服务地址'
    return
  }
  try {
    const res = await fetch(url, { method: 'GET' })
    const data = await res.json()
    if (data.ok) {
      status.value = `连接成功：${data.repo || 'ok'}`
    } else {
      status.value = '连接异常'
    }
  } catch (e: any) {
    status.value = '无法连接：' + (e?.message || e)
  }
}

defineExpose({ syncUrl, syncPass })
</script>

<template>
  <div class="ss">
    <button type="button" class="ss-toggle" @click="open = !open">
      {{ open ? '收起同步设置' : '同步设置（一次配置，无需 Token）' }}
    </button>
    <div v-if="open" class="ss-body">
      <p class="ss-help">
        在 Cloudflare 部署一次上传服务后，把地址填在这里。GitHub Token 只存在 Cloudflare，网站里永远不用填。
        说明见仓库 <code>services/README.md</code>。
      </p>
      <label>同步服务地址</label>
      <input v-model="syncUrl" placeholder="https://outai-upload.xxx.workers.dev" />
      <label>站点密码（若 Worker 配置了 UPLOAD_KEY）</label>
      <input v-model="syncPass" type="password" placeholder="可选" />
      <div class="ss-row">
        <button type="button" class="ss-btn" @click="testConnection">测试连接</button>
        <span v-if="status" class="ss-status">{{ status }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ss { margin-bottom: 0.5rem; }
.ss-toggle {
  appearance: none; border: 1px dashed var(--ol-border, #e5e7eb);
  background: transparent; color: var(--ol-text-secondary, #6b7280);
  border-radius: 8px; padding: 0.35rem 0.75rem; font-size: 0.8rem; cursor: pointer;
}
.ss-body {
  margin-top: 0.5rem; padding: 0.85rem 1rem;
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 10px;
  background: var(--vp-c-bg-soft, #f4f4f5); font-size: 0.85rem;
}
.ss-help { margin: 0 0 0.75rem; color: var(--ol-text-secondary, #6b7280); line-height: 1.5; }
.ss-body label { display: block; margin: 0.4rem 0 0.2rem; font-weight: 600; font-size: 0.8rem; }
.ss-body input {
  width: 100%; padding: 0.4rem 0.6rem; border-radius: 8px;
  border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-card, #fff); color: var(--ol-text, #111); font-size: 0.85rem;
}
.ss-row { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.65rem; }
.ss-btn {
  appearance: none; border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-card, #fff); border-radius: 8px; padding: 0.35rem 0.7rem;
  font-size: 0.8rem; cursor: pointer;
}
.ss-status { font-size: 0.8rem; color: var(--ol-primary, #2563eb); }
</style>
