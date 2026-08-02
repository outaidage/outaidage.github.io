<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'

interface DocMeta {
  id: string
  name: string
  safeName: string
  mime: string
  size: number
  addedAt: string
  published: boolean
  /** public URL after publish */
  url?: string
}

const META_KEY = 'outai-lab-docs-meta-v1'
const TOKEN_KEY = 'outai-lab-gh-token'
const DB_NAME = 'outai-lab-docs'
const STORE = 'files'
const GH_OWNER = 'outaidage'
const GH_REPO = 'outaidage.github.io'
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

const docs = ref<DocMeta[]>([])
const statusMsg = ref('')
const ghToken = ref('')
const showToken = ref(false)
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
  }, 3500)
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
  try {
    ghToken.value = localStorage.getItem(TOKEN_KEY) || ''
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
watch(ghToken, (v) => {
  if (v) localStorage.setItem(TOKEN_KEY, v)
  else localStorage.removeItem(TOKEN_KEY)
})

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return docs.value
  return docs.value.filter(
    (d) => d.name.toLowerCase().includes(q) || d.mime.toLowerCase().includes(q),
  )
})

function isPreviewable(d: DocMeta) {
  return (
    d.mime.startsWith('image/') ||
    d.mime === 'application/pdf' ||
    d.mime.startsWith('text/') ||
    d.mime === 'application/json'
  )
}

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
      // avoid name clash
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
    flash(`已上传 ${ok} 个文件（本机）`)
  } catch (err: any) {
    flash('上传失败：' + (err?.message || err))
  } finally {
    uploading.value = false
    input.value = ''
  }
}

async function openDoc(d: DocMeta) {
  // Prefer published public URL
  if (d.published && d.url) {
    window.open(d.url, '_blank')
    return
  }
  const blob = await idbGet(d.id)
  if (!blob) {
    // try public path anyway
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
    flash('本地文件不存在，请重新上传或从已发布链接下载')
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

function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function githubRequest(apiPath: string, method: string, body?: any) {
  const res = await fetch(`https://api.github.com${apiPath}`, {
    method,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${ghToken.value.trim()}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`)
  return data
}

async function putFile(filePath: string, contentBase64: string, message: string) {
  let sha: string | undefined
  try {
    const existing = await githubRequest(
      `/repos/${GH_OWNER}/${GH_REPO}/contents/${filePath}?ref=main`,
      'GET',
    )
    sha = existing.sha
  } catch { /* new */ }
  await githubRequest(`/repos/${GH_OWNER}/${GH_REPO}/contents/${filePath}`, 'PUT', {
    message,
    content: contentBase64,
    branch: 'main',
    ...(sha ? { sha } : {}),
  })
}

function buildIndexMd(list: DocMeta[]) {
  const lines = [
    '---',
    'title: "文档库"',
    'description: "可上传、浏览、下载的文档"',
    '---',
    '',
    '# 📄 文档库',
    '',
    '在下方管理器中上传文档，发布后可在此浏览与下载。',
    '',
    '<DocumentManager />',
    '',
    '## 已发布文件',
    '',
  ]
  const published = list.filter((d) => d.published)
  if (!published.length) {
    lines.push('> 暂无已发布文档。')
  } else {
    for (const d of published) {
      const link = d.url || `/files/${d.safeName}`
      lines.push(`- [${d.name}](${link}) · ${formatSize(d.size)} · ${d.addedAt}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}

async function publishAll() {
  if (!ghToken.value.trim()) {
    showToken.value = true
    flash('请先填写 GitHub Token')
    return
  }
  const pending = docs.value.filter((d) => !d.published)
  if (!docs.value.length) {
    flash('没有文档')
    return
  }
  if (!confirm(`将发布文档到仓库（未发布 ${pending.length} 个），是否继续？`)) return

  publishing.value = true
  try {
    let i = 0
    for (const d of docs.value) {
      if (d.published && d.url) continue
      const blob = await idbGet(d.id)
      if (!blob) {
        // mark as published if already on CDN path
        d.published = true
        d.url = `/files/${d.safeName}`
        continue
      }
      const buf = await blob.arrayBuffer()
      const b64 = toBase64(buf)
      const path = `docs/public/files/${d.safeName}`
      await putFile(path, b64, `chore(docs): upload ${d.safeName}`)
      d.published = true
      d.url = `/files/${d.safeName}`
      i++
      flash(`上传中… ${i}/${docs.value.length}`)
    }

    // update documents index page (keep manager)
    const indexMd = buildIndexMd(docs.value)
    await putFile('docs/documents/index.md', toBase64(new TextEncoder().encode(indexMd).buffer as ArrayBuffer), 'chore(docs): update documents index')

    // manifest for sidebar rebuild reference
    const manifest = JSON.stringify(
      docs.value.map(({ name, safeName, mime, size, addedAt, url }) => ({
        name,
        safeName,
        mime,
        size,
        addedAt,
        url: url || `/files/${safeName}`,
      })),
      null,
      2,
    )
    await putFile(
      'docs/public/files/manifest.json',
      toBase64(new TextEncoder().encode(manifest).buffer as ArrayBuffer),
      'chore(docs): update files manifest',
    )

    flash('发布完成，等待 Actions 部署后即可在线打开/下载')
  } catch (e: any) {
    flash('发布失败：' + (e?.message || e))
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
  if (d.mime.includes('zip') || d.name.endsWith('.zip') || d.name.endsWith('.rar')) return '📦'
  return '📄'
}
</script>

<template>
  <div class="dm">
    <header class="dm-header">
      <div>
        <h2 class="dm-title">文档管理</h2>
        <p class="dm-sub">
          上传 · 预览 · 下载 · 发布到站点 · 共 {{ docs.length }} 个
          <span v-if="statusMsg" class="dm-status">{{ statusMsg }}</span>
        </p>
      </div>
      <div class="dm-actions">
        <label class="dm-btn dm-btn-primary">
          {{ uploading ? '上传中…' : '上传文件' }}
          <input
            type="file"
            multiple
            hidden
            :disabled="uploading"
            @change="onUpload"
          />
        </label>
        <button
          class="dm-btn dm-btn-primary"
          type="button"
          :disabled="publishing"
          @click="publishAll"
        >
          {{ publishing ? '发布中…' : '发布到 GitHub' }}
        </button>
        <button class="dm-btn" type="button" @click="showToken = !showToken">Token</button>
      </div>
    </header>

    <div v-if="showToken" class="dm-token">
      <p>
        需要有仓库写权限的
        <a href="https://github.com/settings/tokens" target="_blank" rel="noopener">PAT</a>
        （与书签管理器共用）。文件会放到 <code>docs/public/files/</code>，站点路径为
        <code>/files/文件名</code>。单文件建议 &lt; 20MB。
      </p>
      <input v-model="ghToken" type="password" placeholder="ghp_... 或 github_pat_..." />
    </div>

    <div class="dm-toolbar">
      <input v-model="searchQuery" class="dm-search" placeholder="搜索文件名…" />
    </div>

    <div v-if="!filtered.length" class="dm-empty">
      还没有文档。点击「上传文件」添加 PDF、图片、Office、压缩包等。
    </div>

    <ul class="dm-list">
      <li v-for="d in filtered" :key="d.id" class="dm-item">
        <div class="dm-icon">{{ iconFor(d) }}</div>
        <div class="dm-info">
          <div class="dm-name">{{ d.name }}</div>
          <div class="dm-meta">
            {{ formatSize(d.size) }} · {{ d.addedAt }}
            <span v-if="d.published" class="dm-badge">已发布</span>
            <span v-else class="dm-badge muted">仅本机</span>
          </div>
        </div>
        <div class="dm-ops">
          <button type="button" class="dm-btn" @click="openDoc(d)">打开</button>
          <button type="button" class="dm-btn" @click="downloadDoc(d)">下载</button>
          <button type="button" class="dm-btn dm-btn-danger" @click="removeDoc(d)">删除</button>
        </div>
      </li>
    </ul>

    <!-- preview modal -->
    <div v-if="preview" class="dm-modal" @click.self="closePreview">
      <div class="dm-modal-box">
        <div class="dm-modal-head">
          <span>{{ preview.name }}</span>
          <button type="button" class="dm-btn" @click="closePreview">关闭</button>
        </div>
        <div class="dm-modal-body">
          <img
            v-if="preview.mime.startsWith('image/')"
            :src="previewUrl"
            :alt="preview.name"
            class="dm-preview-img"
          />
          <iframe
            v-else-if="preview.mime === 'application/pdf'"
            :src="previewUrl"
            class="dm-preview-frame"
          />
          <iframe
            v-else-if="preview.mime.startsWith('text/') || preview.mime === 'application/json'"
            :src="previewUrl"
            class="dm-preview-frame"
          />
          <div v-else class="dm-preview-fallback">
            <p>此类型不支持内嵌预览。</p>
            <button type="button" class="dm-btn dm-btn-primary" @click="downloadDoc(preview)">下载文件</button>
            <a
              v-if="preview.published && preview.url"
              :href="preview.url"
              target="_blank"
              rel="noopener"
              class="dm-btn"
            >新窗口打开</a>
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
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--ol-border, #e5e7eb);
}
.dm-title { margin: 0; font-size: 1.25rem; font-weight: 650; }
.dm-sub { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--ol-text-secondary, #6b7280); }
.dm-status { margin-left: 0.5rem; color: var(--ol-primary, #2563eb); font-weight: 600; }
.dm-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.dm-btn {
  appearance: none; border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
  border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.85rem; cursor: pointer;
  text-decoration: none; display: inline-flex; align-items: center;
}
.dm-btn-primary { background: var(--ol-primary, #2563eb); border-color: transparent; color: #fff; }
.dm-btn-danger { color: #dc2626; border-color: #fecaca; }
.dm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.dm-token {
  padding: 0.85rem 1.5rem;
  background: var(--vp-c-bg-soft, #f4f4f5);
  border-bottom: 1px solid var(--ol-border, #e5e7eb);
  font-size: 0.85rem;
  color: var(--ol-text-secondary, #6b7280);
}
.dm-token a { color: var(--ol-primary, #2563eb); }
.dm-token input {
  width: 100%; margin-top: 0.5rem; padding: 0.45rem 0.65rem;
  border-radius: 8px; border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-card, #fff); color: var(--ol-text, #111);
}
.dm-toolbar { padding: 0.85rem 1.5rem 0; }
.dm-search {
  width: 100%; max-width: 320px;
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 8px;
  padding: 0.4rem 0.75rem; font-size: 0.85rem;
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
}
.dm-empty {
  padding: 2.5rem 1rem; text-align: center;
  color: var(--ol-text-secondary, #6b7280); font-size: 0.9rem;
}
.dm-list {
  list-style: none; margin: 0; padding: 1rem 1.25rem 1.5rem;
  display: flex; flex-direction: column; gap: 0.55rem;
}
.dm-item {
  display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;
  padding: 0.75rem 1rem;
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 10px;
  background: var(--ol-bg, #fafafa);
}
.dm-icon { font-size: 1.5rem; line-height: 1; }
.dm-info { flex: 1; min-width: 160px; }
.dm-name { font-weight: 600; font-size: 0.95rem; word-break: break-all; }
.dm-meta { font-size: 0.75rem; color: var(--ol-text-secondary, #6b7280); margin-top: 0.2rem; }
.dm-badge {
  display: inline-block; margin-left: 0.35rem; padding: 0.05rem 0.35rem;
  border-radius: 4px; font-size: 0.7rem;
  background: rgba(34, 197, 94, 0.15); color: #16a34a;
}
.dm-badge.muted { background: var(--vp-c-bg-soft, #e5e7eb); color: var(--ol-text-secondary, #6b7280); }
.dm-ops { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.dm-modal {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 1rem;
}
.dm-modal-box {
  width: min(960px, 100%);
  max-height: 90vh;
  background: var(--ol-card, #fff);
  border-radius: 12px;
  display: flex; flex-direction: column;
  overflow: hidden;
}
.dm-modal-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--ol-border, #e5e7eb);
  font-weight: 600; font-size: 0.9rem;
}
.dm-modal-body {
  flex: 1; overflow: auto; min-height: 280px;
  display: flex; align-items: center; justify-content: center;
  background: var(--vp-c-bg-soft, #f4f4f5);
}
.dm-preview-img { max-width: 100%; max-height: 75vh; object-fit: contain; }
.dm-preview-frame { width: 100%; height: 75vh; border: none; background: #fff; }
.dm-preview-fallback { text-align: center; padding: 2rem; display: flex; flex-direction: column; gap: 0.75rem; align-items: center; }
</style>
