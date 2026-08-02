<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { syncFiles, toBase64FromBuffer, toBase64FromString } from '../lib/sync'
import SyncSettings from './SyncSettings.vue'

interface DocMeta {
  id: string
  name: string
  safeName: string
  mime: string
  size: number
  addedAt: string
  published: boolean
  url?: string
}

const META_KEY = 'outai-lab-docs-meta-v1'
const DB_NAME = 'outai-lab-docs'
const STORE = 'files'
const MAX_SIZE = 20 * 1024 * 1024

const docs = ref<DocMeta[]>([])
const statusMsg = ref('')
const publishing = ref(false)
const uploading = ref(false)
const searchQuery = ref('')
const preview = ref<DocMeta | null>(null)
const previewUrl = ref('')

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function flash(msg: string) {
  statusMsg.value = msg
  setTimeout(() => {
    if (statusMsg.value === msg) statusMsg.value = ''
  }, 4000)
}

function formatSize(n: number) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  return (n / (1024 * 1024)).toFixed(1) + ' MB'
}

function safeFileName(name: string) {
  const base = name.replace(/[^\p{L}\p{N}._\-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return base || `file-${Date.now()}`
}

function saveMeta() {
  localStorage.setItem(META_KEY, JSON.stringify(docs.value))
}

function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (raw) docs.value = JSON.parse(raw)
  } catch { /* */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbPut(id: string, blob: Blob) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(blob, id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function idbGet(id: string): Promise<Blob | null> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(id)
    req.onsuccess = () => resolve((req.result as Blob) || null)
    req.onerror = () => reject(req.error)
  })
}

async function idbDel(id: string) {
  const db = await openDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

onMounted(loadMeta)
watch(docs, saveMeta, { deep: true })

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return docs.value
  return docs.value.filter((d) => d.name.toLowerCase().includes(q) || d.mime.toLowerCase().includes(q))
})

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  uploading.value = true
  let ok = 0
  try {
    for (const file of Array.from(files)) {
      if (file.size > MAX_SIZE) {
        flash(`${file.name} 超过 20MB，已跳过`)
        continue
      }
      const id = uid()
      let safe = safeFileName(file.name)
      if (docs.value.some((d) => d.safeName === safe)) {
        const parts = safe.split('.')
        const ext = parts.length > 1 ? '.' + parts.pop() : ''
        safe = parts.join('.') + '-' + id.slice(0, 4) + ext
      }
      await idbPut(id, file)
      docs.value.unshift({
        id,
        name: file.name,
        safeName: safe,
        mime: file.type || 'application/octet-stream',
        size: file.size,
        addedAt: new Date().toISOString().slice(0, 10),
        published: false,
      })
      ok++
    }
    flash(`已添加 ${ok} 个文件，点「发布到仓库」同步`)
  } catch (err: any) {
    flash('上传失败：' + (err?.message || err))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function openDoc(d: DocMeta) {
  if (d.published && d.url) {
    window.open(d.url, '_blank')
    return
  }
  const blob = await idbGet(d.id)
  if (!blob) {
    window.open(`/files/${d.safeName}`, '_blank')
    return
  }
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = URL.createObjectURL(blob)
  preview.value = d
}

async function downloadDoc(d: DocMeta) {
  if (d.published && d.url) {
    const a = document.createElement('a')
    a.href = d.url
    a.download = d.name
    a.target = '_blank'
    a.click()
    return
  }
  const blob = await idbGet(d.id)
  if (!blob) {
    flash('本地文件不存在')
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = d.name
  a.click()
  URL.revokeObjectURL(a.href)
}

async function removeDoc(d: DocMeta) {
  if (!confirm(`删除「${d.name}」？`)) return
  await idbDel(d.id)
  docs.value = docs.value.filter((x) => x.id !== d.id)
  if (preview.value?.id === d.id) closePreview()
  flash('已删除')
}

function closePreview() {
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value)
  previewUrl.value = ''
  preview.value = null
}

async function publishAll() {
  if (!docs.value.length) {
    flash('没有文档')
    return
  }
  if (!confirm(`将 ${docs.value.length} 个文档同步到仓库 docs/public/files/？`)) return

  publishing.value = true
  try {
    const payload: { path: string; content: string; message?: string }[] = []

    for (const d of docs.value) {
      const blob = await idbGet(d.id)
      if (blob) {
        const buf = await blob.arrayBuffer()
        payload.push({
          path: `docs/public/files/${d.safeName}`,
          content: toBase64FromBuffer(buf),
          message: `chore(files): ${d.safeName}`,
        })
      }
      d.published = true
      d.url = `/files/${d.safeName}`
    }

    const listLines = [
      '---',
      'title: "文档库"',
      'description: "上传、浏览、下载文档"',
      '---',
      '',
      '# 📄 文档库',
      '',
      '在网站上直接上传，发布后存入仓库。',
      '',
      '<DocumentManager />',
      '',
      '## 已发布文件',
      '',
    ]
    for (const d of docs.value.filter((x) => x.published)) {
      listLines.push(`- [${d.name}](/files/${d.safeName}) · ${formatSize(d.size)} · ${d.addedAt}`)
    }
    listLines.push('')
    payload.push({
      path: 'docs/documents/index.md',
      content: toBase64FromString(listLines.join('\n')),
      message: 'chore(docs): update documents index',
    })

    // batch in chunks of 10
    for (let i = 0; i < payload.length; i += 10) {
      const chunk = payload.slice(i, i + 10)
      flash(`同步中… ${Math.min(i + 10, payload.length)}/${payload.length}`)
      const result = await syncFiles(chunk)
      if (!result.ok) throw new Error(result.message || '部分文件失败')
    }

    flash('已同步到仓库，等待网站自动部署（1–2 分钟）')
  } catch (e: any) {
    flash('同步失败：' + (e?.message || e))
  } finally {
    publishing.value = false
  }
}

function iconFor(d: DocMeta) {
  if (d.mime.startsWith('image/')) return '🖼'
  if (d.mime === 'application/pdf') return '📕'
  if (d.mime.includes('word') || d.name.endsWith('.doc') || d.name.endsWith('.docx')) return '📘'
  if (d.mime.includes('sheet') || d.name.endsWith('.xls') || d.name.endsWith('.xlsx')) return '📗'
  if (d.mime.startsWith('text/') || d.name.endsWith('.md')) return '📝'
  if (d.mime.includes('zip') || d.name.endsWith('.zip')) return '📦'
  return '📄'
}
</script>

<template>
  <div class="dm">
    <header class="dm-header">
      <div>
        <h2 class="dm-title">文档管理</h2>
        <p class="dm-sub">
          网站直接上传 · 无需 GitHub Token · 共 {{ docs.length }} 个
          <span v-if="statusMsg" class="dm-status">{{ statusMsg }}</span>
        </p>
      </div>
      <div class="dm-actions">
        <label class="dm-btn dm-btn-primary">
          {{ uploading ? '上传中…' : '选择文件' }}
          <input type="file" multiple hidden :disabled="uploading" @change="onUpload" />
        </label>
        <button class="dm-btn dm-btn-primary" type="button" :disabled="publishing" @click="publishAll">
          {{ publishing ? '同步中…' : '发布到仓库' }}
        </button>
      </div>
    </header>

    <div class="dm-sync">
      <SyncSettings />
    </div>

    <div class="dm-toolbar">
      <input v-model="searchQuery" class="dm-search" placeholder="搜索文件名…" />
    </div>

    <div v-if="!filtered.length" class="dm-empty">
      选择文件上传，再点「发布到仓库」同步到 GitHub（首次需配置同步服务）。
    </div>

    <ul class="dm-list">
      <li v-for="d in filtered" :key="d.id" class="dm-item">
        <div class="dm-icon">{{ iconFor(d) }}</div>
        <div class="dm-info">
          <div class="dm-name">{{ d.name }}</div>
          <div class="dm-meta">
            {{ formatSize(d.size) }} · {{ d.addedAt }}
            <span v-if="d.published" class="dm-badge">已发布</span>
            <span v-else class="dm-badge muted">待同步</span>
          </div>
        </div>
        <div class="dm-ops">
          <button type="button" class="dm-btn" @click="openDoc(d)">打开</button>
          <button type="button" class="dm-btn" @click="downloadDoc(d)">下载</button>
          <button type="button" class="dm-btn dm-btn-danger" @click="removeDoc(d)">删除</button>
        </div>
      </li>
    </ul>

    <div v-if="preview" class="dm-modal" @click.self="closePreview">
      <div class="dm-modal-box">
        <div class="dm-modal-head">
          <span>{{ preview.name }}</span>
          <button type="button" class="dm-btn" @click="closePreview">关闭</button>
        </div>
        <div class="dm-modal-body">
          <img v-if="preview.mime.startsWith('image/')" :src="previewUrl" :alt="preview.name" class="dm-preview-img" />
          <iframe v-else-if="preview.mime === 'application/pdf' || preview.mime.startsWith('text/')" :src="previewUrl" class="dm-preview-frame" />
          <div v-else class="dm-preview-fallback">
            <p>此类型不支持内嵌预览</p>
            <button type="button" class="dm-btn dm-btn-primary" @click="downloadDoc(preview)">下载</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dm {
  margin: 1.5rem 0 3rem;
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 12px;
  background: var(--ol-card, #fff);
  overflow: hidden;
}
.dm-header {
  display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--ol-border, #e5e7eb);
}
.dm-title { margin: 0; font-size: 1.25rem; font-weight: 650; }
.dm-sub { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--ol-text-secondary, #6b7280); }
.dm-status { margin-left: 0.5rem; color: var(--ol-primary, #2563eb); font-weight: 600; }
.dm-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.dm-sync { padding: 0.75rem 1.5rem 0; }
.dm-btn {
  appearance: none; border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
  border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.85rem; cursor: pointer;
}
.dm-btn-primary { background: var(--ol-primary, #2563eb); border-color: transparent; color: #fff; }
.dm-btn-danger { color: #dc2626; border-color: #fecaca; }
.dm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.dm-toolbar { padding: 0.85rem 1.5rem 0; }
.dm-search {
  width: 100%; max-width: 320px; border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.85rem;
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
}
.dm-empty { padding: 2.5rem 1rem; text-align: center; color: var(--ol-text-secondary, #6b7280); font-size: 0.9rem; }
.dm-list { list-style: none; margin: 0; padding: 1rem 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 0.55rem; }
.dm-item {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  padding: 0.75rem 1rem; border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 10px; background: var(--ol-bg, #fafafa);
}
.dm-icon { font-size: 1.5rem; }
.dm-info { flex: 1; min-width: 160px; }
.dm-name { font-weight: 600; font-size: 0.95rem; word-break: break-all; }
.dm-meta { font-size: 0.75rem; color: var(--ol-text-secondary, #6b7280); margin-top: 0.2rem; }
.dm-badge {
  display: inline-block; margin-left: 0.35rem; padding: 0.05rem 0.35rem;
  border-radius: 4px; font-size: 0.7rem; background: rgba(34, 197, 94, 0.15); color: #16a34a;
}
.dm-badge.muted { background: var(--vp-c-bg-soft, #e5e7eb); color: var(--ol-text-secondary, #6b7280); }
.dm-ops { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.dm-modal {
  position: fixed; inset: 0; z-index: 100; background: rgba(0,0,0,0.55);
  display: flex; align-items: center; justify-content: center; padding: 1rem;
}
.dm-modal-box {
  width: min(960px, 100%); max-height: 90vh; background: var(--ol-card, #fff);
  border-radius: 12px; display: flex; flex-direction: column; overflow: hidden;
}
.dm-modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 1rem; border-bottom: 1px solid var(--ol-border, #e5e7eb); font-weight: 600;
}
.dm-modal-body {
  flex: 1; overflow: auto; min-height: 280px;
  display: flex; align-items: center; justify-content: center; background: var(--vp-c-bg-soft, #f4f4f5);
}
.dm-preview-img { max-width: 100%; max-height: 75vh; object-fit: contain; }
.dm-preview-frame { width: 100%; height: 75vh; border: none; background: #fff; }
.dm-preview-fallback { text-align: center; padding: 2rem; }
</style>
