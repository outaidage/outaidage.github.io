<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

const props = defineProps<{
  section: string
  title?: string
  icon?: string
}>()

interface Item {
  id: string
  title: string
  url?: string
  desc?: string
  tags: string[]
}

const STORAGE_KEY = computed(() => `outai-lab-section-${props.section}`)
const TOKEN_KEY = 'outai-lab-gh-token'

const items = ref<Item[]>([])
const statusMsg = ref('')
const showForm = ref(false)
const editingId = ref<string | null>(null)
const searchQuery = ref('')

const formTitle = ref('')
const formUrl = ref('')
const formDesc = ref('')
const formTags = ref('')

const ghToken = ref('')
const showToken = ref(false)
const publishing = ref(false)

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function flash(msg: string) {
  statusMsg.value = msg
  setTimeout(() => {
    if (statusMsg.value === msg) statusMsg.value = ''
  }, 3000)
}

function save() {
  localStorage.setItem(STORAGE_KEY.value, JSON.stringify(items.value))
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.value)
    if (raw) items.value = JSON.parse(raw)
  } catch { /* */ }
  try {
    ghToken.value = localStorage.getItem(TOKEN_KEY) || ''
  } catch { /* */ }
}

onMounted(load)
watch(items, save, { deep: true })
watch(ghToken, (v) => {
  if (v) localStorage.setItem(TOKEN_KEY, v)
  else localStorage.removeItem(TOKEN_KEY)
})

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return items.value
  return items.value.filter(
    (i) =>
      i.title.toLowerCase().includes(q) ||
      (i.url || '').toLowerCase().includes(q) ||
      (i.desc || '').toLowerCase().includes(q) ||
      i.tags.some((t) => t.toLowerCase().includes(q)),
  )
})

function addItem() {
  const title = formTitle.value.trim()
  if (!title) {
    flash('请填写标题')
    return
  }
  const tags = formTags.value.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)
  if (editingId.value) {
    const it = items.value.find((x) => x.id === editingId.value)
    if (it) {
      it.title = title
      it.url = formUrl.value.trim() || undefined
      it.desc = formDesc.value.trim() || undefined
      it.tags = tags
    }
    editingId.value = null
    flash('已更新')
  } else {
    items.value.unshift({
      id: uid(),
      title,
      url: formUrl.value.trim() || undefined,
      desc: formDesc.value.trim() || undefined,
      tags,
    })
    flash('已添加')
  }
  formTitle.value = ''
  formUrl.value = ''
  formDesc.value = ''
  formTags.value = ''
  showForm.value = false
}

function startEdit(it: Item) {
  editingId.value = it.id
  formTitle.value = it.title
  formUrl.value = it.url || ''
  formDesc.value = it.desc || ''
  formTags.value = it.tags.join(', ')
  showForm.value = true
}

function removeItem(id: string) {
  items.value = items.value.filter((x) => x.id !== id)
  flash('已删除')
}

function clearAll() {
  if (!confirm('清空本栏目全部条目？')) return
  items.value = []
  flash('已清空')
}

function buildMarkdown(): string {
  const title = props.title || props.section
  const icon = props.icon || ''
  const lines: string[] = []
  lines.push('---')
  lines.push(`title: ${JSON.stringify(title)}`)
  lines.push(`description: ${JSON.stringify(title)}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${icon ? icon + ' ' : ''}${title}`)
  lines.push('')
  if (!items.value.length) {
    lines.push('> 暂无内容，请在本页管理器中添加后发布。')
    lines.push('')
    return lines.join('\n')
  }
  for (const it of items.value) {
    if (it.url) {
      lines.push(`## [${it.title}](${it.url})`)
    } else {
      lines.push(`## ${it.title}`)
    }
    lines.push('')
    if (it.desc) {
      lines.push(it.desc)
      lines.push('')
    }
    if (it.tags.length) {
      lines.push(it.tags.map((t) => '`' + t + '`').join(' '))
      lines.push('')
    }
  }
  return lines.join('\n')
}

function downloadMd() {
  const content = buildMarkdown()
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${props.section}-index.md`
  a.click()
  URL.revokeObjectURL(a.href)
  flash('已下载 Markdown')
}

async function githubRequest(path: string, method: string, body?: any) {
  const res = await fetch(`https://api.github.com${path}`, {
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
  if (!res.ok) {
    throw new Error(data.message || `GitHub API ${res.status}`)
  }
  return data
}

function toBase64(str: string) {
  return btoa(unescape(encodeURIComponent(str)))
}

async function publishToGitHub() {
  if (!ghToken.value.trim()) {
    showToken.value = true
    flash('请先填写 GitHub Token，或改用同步服务（书签/文档同款）')
    return
  }
  if (!items.value.length && !confirm('当前无条目，仍要发布空页面吗？')) return

  publishing.value = true
  try {
    const owner = 'outaidage'
    const repo = 'outaidage.github.io'
    const filePath = `docs/${props.section}/index.md`
    const content = buildMarkdown()

    let sha: string | undefined
    try {
      const existing = await githubRequest(`/repos/${owner}/${repo}/contents/${filePath}?ref=main`, 'GET')
      sha = existing.sha
    } catch {
      /* new file */
    }

    await githubRequest(`/repos/${owner}/${repo}/contents/${filePath}`, 'PUT', {
      message: `chore(${props.section}): update via Section Manager`,
      content: toBase64(content),
      branch: 'main',
      ...(sha ? { sha } : {}),
    })

    flash('已发布到 GitHub，等待 Actions 部署…')
  } catch (e: any) {
    flash('发布失败：' + (e?.message || e))
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="sm">
    <header class="sm-header">
      <div>
        <h3 class="sm-title">{{ icon || '' }} {{ title || section }} · 内容管理</h3>
        <p class="sm-sub">
          本地编辑 · {{ items.length }} 条
          <span v-if="statusMsg" class="sm-status">{{ statusMsg }}</span>
        </p>
      </div>
      <div class="sm-actions">
        <button class="sm-btn sm-btn-primary" type="button" @click="showForm = !showForm; editingId = null">
          {{ showForm ? '取消' : '+ 添加' }}
        </button>
        <button class="sm-btn" type="button" @click="downloadMd">导出 MD</button>
        <button class="sm-btn sm-btn-primary" type="button" :disabled="publishing" @click="publishToGitHub">
          {{ publishing ? '发布中…' : '发布到 GitHub' }}
        </button>
        <button class="sm-btn" type="button" @click="showToken = !showToken">Token</button>
        <button class="sm-btn sm-btn-danger" type="button" @click="clearAll">清空</button>
      </div>
    </header>

    <div v-if="showToken" class="sm-token">
      <p>需要 <code>repo</code> 权限的 PAT，仅存在本机。也可用书签/文档的同步服务发布（后续会统一）。</p>
      <input v-model="ghToken" type="password" placeholder="ghp_... 或 github_pat_..." />
    </div>

    <div v-if="showForm" class="sm-form">
      <input v-model="formTitle" placeholder="标题 *" />
      <input v-model="formUrl" placeholder="链接（可选）" />
      <input v-model="formDesc" placeholder="简介（可选）" />
      <input v-model="formTags" placeholder="标签，逗号分隔" />
      <button class="sm-btn sm-btn-primary" type="button" @click="addItem">
        {{ editingId ? '保存' : '添加' }}
      </button>
    </div>

    <div class="sm-toolbar">
      <input v-model="searchQuery" class="sm-search" placeholder="搜索…" />
    </div>

    <ul v-if="filtered.length" class="sm-list">
      <li v-for="it in filtered" :key="it.id" class="sm-item">
        <div class="sm-item-main">
          <a v-if="it.url" :href="it.url" target="_blank" rel="noopener" class="sm-link">{{ it.title }}</a>
          <span v-else class="sm-link">{{ it.title }}</span>
          <p v-if="it.desc" class="sm-desc">{{ it.desc }}</p>
          <div class="sm-meta">
            <span v-for="t in it.tags" :key="t" class="sm-tag">{{ t }}</span>
          </div>
        </div>
        <div class="sm-ops">
          <button type="button" class="sm-btn" @click="startEdit(it)">编辑</button>
          <button type="button" class="sm-btn sm-btn-danger" @click="removeItem(it.id)">删除</button>
        </div>
      </li>
    </ul>
    <div v-else class="sm-empty">
      <p>本栏目还没有内容。</p>
      <p class="sm-empty-hint">点击上方「添加」写入条目，再点「发布到 GitHub」同步到网站。</p>
      <p class="sm-empty-hint">也可以先在 <a href="/bookmarks/manage">书签管理器</a> 整理相关链接，或把文件放到 <a href="/documents/">文档库</a>。</p>
    </div>
  </div>
</template>

<style scoped>
.sm {
  margin: 1.5rem 0 2rem;
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 12px;
  background: var(--ol-card, #fff);
  overflow: hidden;
}
.sm-header {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--ol-border, #e5e7eb);
}
.sm-title { margin: 0; font-size: 1.05rem; font-weight: 650; }
.sm-sub { margin: 0.2rem 0 0; font-size: 0.8rem; color: var(--ol-text-secondary, #6b7280); }
.sm-status { margin-left: 0.4rem; color: var(--ol-primary, #2563eb); font-weight: 600; }
.sm-actions { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.sm-btn {
  appearance: none; border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
  border-radius: 8px; padding: 0.35rem 0.65rem; font-size: 0.8rem; cursor: pointer;
}
.sm-btn-primary { background: var(--ol-primary, #2563eb); border-color: transparent; color: #fff; }
.sm-btn-danger { color: #dc2626; border-color: #fecaca; }
.sm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.sm-token {
  padding: 0.75rem 1.25rem; background: var(--vp-c-bg-soft, #f4f4f5);
  border-bottom: 1px solid var(--ol-border, #e5e7eb); font-size: 0.8rem;
}
.sm-token input {
  width: 100%; margin-top: 0.4rem; padding: 0.4rem 0.6rem; border-radius: 8px;
  border: 1px solid var(--ol-border, #e5e7eb); background: var(--ol-card, #fff);
  color: var(--ol-text, #111); font-size: 0.85rem;
}
.sm-form {
  display: grid; gap: 0.45rem; grid-template-columns: 1fr 1fr;
  padding: 1rem 1.25rem; border-bottom: 1px solid var(--ol-border, #e5e7eb);
  background: var(--vp-c-bg-soft, #f4f4f5);
}
@media (max-width: 600px) { .sm-form { grid-template-columns: 1fr; } }
.sm-form input {
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 8px;
  padding: 0.4rem 0.6rem; font-size: 0.85rem;
  background: var(--ol-card, #fff); color: var(--ol-text, #111);
}
.sm-toolbar { padding: 0.75rem 1.25rem 0; }
.sm-search {
  width: 100%; max-width: 280px; border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 8px; padding: 0.35rem 0.65rem; font-size: 0.85rem;
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
}
.sm-list { list-style: none; margin: 0; padding: 0.75rem 1.25rem 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
.sm-item {
  display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: space-between;
  padding: 0.75rem 0.9rem; border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 10px; background: var(--ol-bg, #fafafa);
}
.sm-link { font-weight: 600; color: var(--ol-primary, #2563eb); text-decoration: none; }
.sm-desc { margin: 0.25rem 0 0; font-size: 0.8rem; color: var(--ol-text-secondary, #6b7280); }
.sm-meta { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; }
.sm-tag {
  font-size: 0.7rem; padding: 0.1rem 0.35rem; border-radius: 4px;
  background: var(--vp-c-brand-soft, rgba(37,99,235,0.1)); color: var(--ol-primary, #2563eb);
}
.sm-ops { display: flex; gap: 0.3rem; align-items: flex-start; }
.sm-empty { padding: 1.5rem; text-align: center; color: var(--ol-text-secondary, #6b7280); font-size: 0.9rem; }
.sm-empty-hint { margin: 0.4rem 0 0; font-size: 0.8rem; }
.sm-empty a { color: var(--ol-primary, #2563eb); }
</style>
