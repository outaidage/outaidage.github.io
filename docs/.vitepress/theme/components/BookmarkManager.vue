<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

interface Bookmark {
  id: string
  title: string
  url: string
  tags: string[]
  note?: string
  addDate?: string
}

interface Folder {
  id: string
  name: string
  bookmarks: Bookmark[]
  children: Folder[]
}

const STORAGE_KEY = 'outai-lab-bookmarks-v1'

const root = ref<Folder>({
  id: 'root',
  name: 'Bookmarks',
  bookmarks: [],
  children: [],
})

const selectedFolderId = ref('root')
const searchQuery = ref('')
const statusMsg = ref('')
const showAddForm = ref(false)
const showAddFolder = ref(false)
const editingId = ref<string | null>(null)

// forms
const formTitle = ref('')
const formUrl = ref('')
const formTags = ref('')
const formNote = ref('')
const formFolderName = ref('')
const moveTargetId = ref('')

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root.value))
  flash('已保存到本机')
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      root.value = JSON.parse(raw)
      selectedFolderId.value = 'root'
    }
  } catch {
    /* ignore */
  }
}

function flash(msg: string) {
  statusMsg.value = msg
  setTimeout(() => {
    if (statusMsg.value === msg) statusMsg.value = ''
  }, 2500)
}

onMounted(load)
watch(root, save, { deep: true })

// ─── tree helpers ───

function findFolder(folder: Folder, id: string): Folder | null {
  if (folder.id === id) return folder
  for (const c of folder.children) {
    const f = findFolder(c, id)
    if (f) return f
  }
  return null
}

function findParent(folder: Folder, id: string): Folder | null {
  for (const c of folder.children) {
    if (c.id === id) return folder
    const p = findParent(c, id)
    if (p) return p
  }
  return null
}

function countAll(folder: Folder): number {
  let n = folder.bookmarks.length
  for (const c of folder.children) n += countAll(c)
  return n
}

const selectedFolder = computed(() => findFolder(root.value, selectedFolderId.value) || root.value)

const filteredBookmarks = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const list = selectedFolder.value.bookmarks
  if (!q) return list
  return list.filter(
    (b) =>
      b.title.toLowerCase().includes(q) ||
      b.url.toLowerCase().includes(q) ||
      b.tags.some((t) => t.toLowerCase().includes(q)),
  )
})

const totalCount = computed(() => countAll(root.value))

const allFoldersFlat = computed(() => {
  const list: { id: string; name: string; depth: number }[] = []
  function walk(f: Folder, depth: number) {
    list.push({ id: f.id, name: f.name, depth })
    for (const c of f.children) walk(c, depth + 1)
  }
  walk(root.value, 0)
  return list
})

// ─── CRUD ───

function addBookmark() {
  const title = formTitle.value.trim()
  const url = formUrl.value.trim()
  if (!url) {
    flash('请填写 URL')
    return
  }
  const tags = formTags.value
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const folder = selectedFolder.value

  if (editingId.value) {
    const b = folder.bookmarks.find((x) => x.id === editingId.value)
    if (b) {
      b.title = title || url
      b.url = url
      b.tags = tags
      b.note = formNote.value.trim() || undefined
    }
    editingId.value = null
    flash('已更新')
  } else {
    folder.bookmarks.unshift({
      id: uid(),
      title: title || url,
      url,
      tags,
      note: formNote.value.trim() || undefined,
      addDate: new Date().toISOString().slice(0, 10),
    })
    flash('已添加')
  }
  formTitle.value = ''
  formUrl.value = ''
  formTags.value = ''
  formNote.value = ''
  showAddForm.value = false
}

function startEdit(b: Bookmark) {
  editingId.value = b.id
  formTitle.value = b.title
  formUrl.value = b.url
  formTags.value = b.tags.join(', ')
  formNote.value = b.note || ''
  showAddForm.value = true
}

function deleteBookmark(id: string) {
  const folder = selectedFolder.value
  const i = folder.bookmarks.findIndex((b) => b.id === id)
  if (i >= 0) {
    folder.bookmarks.splice(i, 1)
    flash('已删除书签')
  }
}

function addFolder() {
  const name = formFolderName.value.trim()
  if (!name) {
    flash('请填写文件夹名')
    return
  }
  selectedFolder.value.children.push({
    id: uid(),
    name,
    bookmarks: [],
    children: [],
  })
  formFolderName.value = ''
  showAddFolder.value = false
  flash('已新建文件夹')
}

function deleteFolder(id: string) {
  if (id === 'root') {
    flash('不能删除根目录')
    return
  }
  if (!confirm('删除此文件夹及其所有内容？')) return
  const parent = findParent(root.value, id)
  if (parent) {
    parent.children = parent.children.filter((c) => c.id !== id)
    if (selectedFolderId.value === id) selectedFolderId.value = parent.id
    flash('已删除文件夹')
  }
}

function renameFolder(id: string) {
  const f = findFolder(root.value, id)
  if (!f || id === 'root') return
  const name = prompt('新名称', f.name)
  if (name && name.trim()) {
    f.name = name.trim()
    flash('已重命名')
  }
}

function moveBookmark(bookmarkId: string) {
  const targetId = moveTargetId.value
  if (!targetId) return
  const from = selectedFolder.value
  const to = findFolder(root.value, targetId)
  if (!to || from.id === to.id) return
  const i = from.bookmarks.findIndex((b) => b.id === bookmarkId)
  if (i < 0) return
  const [b] = from.bookmarks.splice(i, 1)
  to.bookmarks.unshift(b)
  moveTargetId.value = ''
  flash('已移动')
}

// ─── import ───

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else inQuotes = false
      } else cur += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') {
        result.push(cur)
        cur = ''
      } else cur += ch
    }
  }
  result.push(cur)
  return result
}

function ensurePath(parent: Folder, folderPath: string): Folder {
  const parts = folderPath.split('/').map((p) => p.trim()).filter(Boolean)
  let cur = parent
  for (const part of parts) {
    let child = cur.children.find((c) => c.name === part)
    if (!child) {
      child = { id: uid(), name: part, bookmarks: [], children: [] }
      cur.children.push(child)
    }
    cur = child
  }
  return cur
}

function importCsv(text: string) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) throw new Error('CSV 为空')
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase())
  const idx = (n: string) => headers.indexOf(n)
  const iUrl = idx('url')
  if (iUrl < 0) throw new Error('缺少 url 列')
  const iTitle = idx('title')
  const iFolder = idx('folder') >= 0 ? idx('folder') : idx('collection')
  const iTags = idx('tags')
  const iNote = idx('note') >= 0 ? idx('note') : idx('excerpt')
  const iCreated = idx('created')

  let added = 0
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li])
    const url = (cols[iUrl] || '').trim()
    if (!url || !/^https?:\/\//i.test(url)) continue
    const title = (iTitle >= 0 ? cols[iTitle] : '') || url
    const folderPath = iFolder >= 0 ? cols[iFolder] || '' : ''
    const tagsRaw = iTags >= 0 ? cols[iTags] || '' : ''
    const tags = tagsRaw.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
    const note = iNote >= 0 ? (cols[iNote] || '').trim() : ''
    let addDate: string | undefined
    if (iCreated >= 0 && cols[iCreated]) {
      const raw = cols[iCreated].trim()
      if (/^\d{10,13}$/.test(raw)) {
        const n = Number(raw)
        addDate = new Date(n > 1e12 ? n : n * 1000).toISOString().slice(0, 10)
      } else {
        const d = new Date(raw)
        if (!isNaN(d.getTime())) addDate = d.toISOString().slice(0, 10)
      }
    }
    const target = folderPath ? ensurePath(root.value, folderPath) : root.value
    target.bookmarks.push({
      id: uid(),
      title: title.trim(),
      url,
      tags,
      note: note || undefined,
      addDate,
    })
    added++
  }
  return added
}

function importHtml(html: string) {
  const tempRoot: Folder = { id: uid(), name: 'tmp', bookmarks: [], children: [] }
  const stack: Folder[] = [tempRoot]
  const normalized = html
    .replace(/\r\n/g, '\n')
    .replace(/<(A|H3)\b([^>]*)\n([^>]*)>/gi, '<$1$2 $3>')
  const h3Re = /<H3\b([^>]*)>([\s\S]*?)<\/H3>/i
  const aRe = /<A\b([^>]*)HREF="([^"]+)"([^>]*)>([\s\S]*?)<\/A>/i
  const tagsRe = /TAGS="([^"]*)"/i
  const addDateRe = /ADD_DATE="(\d+)"/i

  for (const line of normalized.split('\n')) {
    if (/<\/DL>/i.test(line)) {
      if (stack.length > 1) stack.pop()
      continue
    }
    const h3 = line.match(h3Re)
    if (h3) {
      const name = h3[2].replace(/<[^>]+>/g, '').trim()
      const folder: Folder = { id: uid(), name, bookmarks: [], children: [] }
      stack[stack.length - 1].children.push(folder)
      stack.push(folder)
      continue
    }
    const a = line.match(aRe)
    if (a) {
      const tagsM = (a[1] + a[3]).match(tagsRe)
      const dateM = (a[1] + a[3]).match(addDateRe)
      stack[stack.length - 1].bookmarks.push({
        id: uid(),
        url: a[2],
        title: a[4].replace(/<[^>]+>/g, '').trim() || a[2],
        tags: tagsM ? tagsM[1].split(',').map((t) => t.trim()).filter(Boolean) : [],
        addDate: dateM
          ? new Date(Number(dateM[1]) * 1000).toISOString().slice(0, 10)
          : undefined,
      })
    }
  }

  // merge into root
  let added = 0
  function merge(from: Folder, to: Folder) {
    for (const b of from.bookmarks) {
      to.bookmarks.push(b)
      added++
    }
    for (const c of from.children) {
      let target = to.children.find((x) => x.name === c.name)
      if (!target) {
        target = { id: uid(), name: c.name, bookmarks: [], children: [] }
        to.children.push(target)
      }
      merge(c, target)
    }
  }
  merge(tempRoot, root.value)
  return added
}

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = String(reader.result || '')
      const name = file.name.toLowerCase()
      let n = 0
      if (name.endsWith('.csv') || text.includes('url,') || text.includes('URL,')) {
        n = importCsv(text)
      } else {
        n = importHtml(text)
      }
      flash(`导入成功：${n} 条书签`)
    } catch (err: any) {
      flash('导入失败：' + (err?.message || err))
    }
    input.value = ''
  }
  reader.readAsText(file)
}

function clearAll() {
  if (!confirm('清空所有本地书签数据？此操作不可恢复')) return
  root.value = { id: 'root', name: 'Bookmarks', bookmarks: [], children: [] }
  selectedFolderId.value = 'root'
  flash('已清空')
}

// ─── export markdown ───

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  )
}

function folderToMd(folder: Folder, childLinks: { name: string; slug: string; count: number }[]): string {
  const lines: string[] = []
  lines.push('---')
  lines.push(`title: ${JSON.stringify(folder.name)}`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${folder.name}`)
  lines.push('')
  if (childLinks.length) {
    lines.push('## 子文件夹')
    lines.push('')
    for (const c of childLinks) {
      lines.push(`- [${c.name}](./${c.slug}/)（${c.count}）`)
    }
    lines.push('')
  }
  if (folder.bookmarks.length) {
    if (childLinks.length) {
      lines.push('## 书签')
      lines.push('')
    }
    for (const b of folder.bookmarks) {
      const tags = b.tags.length ? ' ' + b.tags.map((t) => '`' + t + '`').join(' ') : ''
      const date = b.addDate ? ` · ${b.addDate}` : ''
      lines.push(`- [${b.title}](${b.url})${tags}${date}`)
      if (b.note) lines.push(`  > ${b.note}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function buildMdFiles(
  folder: Folder,
  prefix: string,
  files: { path: string; content: string }[],
) {
  const used = new Set<string>()
  const childLinks: { name: string; slug: string; count: number }[] = []
  for (const child of folder.children) {
    if (!child.bookmarks.length && !child.children.length) continue
    let slug = slugify(child.name)
    let s = slug
    let i = 2
    while (used.has(s)) {
      s = `${slug}-${i}`
      i++
    }
    used.add(s)
    childLinks.push({ name: child.name, slug: s, count: countAll(child) })
    buildMdFiles(child, prefix ? `${prefix}/${s}` : s, files)
  }
  const path = prefix ? `${prefix}/index.md` : 'index.md'
  files.push({ path, content: folderToMd(folder, childLinks) })
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportMarkdown() {
  const files: { path: string; content: string }[] = []
  buildMdFiles(root.value, '', files)
  // single combined download as a simple text archive guide
  const parts = files.map((f) => `===== FILE: docs/bookmarks/${f.path} =====\n${f.content}`)
  downloadText('outai-bookmarks-export.md', parts.join('\n\n'))
  flash(`已导出 ${files.length} 个 Markdown 文件（合并下载）`)
}

function exportJson() {
  downloadText('outai-bookmarks.json', JSON.stringify(root.value, null, 2))
  flash('已导出 JSON')
}

function exportCsv() {
  const rows = ['folder,url,title,tags,note,created']
  function walk(f: Folder, path: string) {
    const folderPath = path
    for (const b of f.bookmarks) {
      const tags = `"${b.tags.join(', ')}"`
      const note = `"${(b.note || '').replace(/"/g, '""')}"`
      const title = `"${b.title.replace(/"/g, '""')}"`
      rows.push(`${JSON.stringify(folderPath)},${b.url},${title},${tags},${note},${b.addDate || ''}`)
    }
    for (const c of f.children) {
      walk(c, path ? `${path}/${c.name}` : c.name)
    }
  }
  walk(root.value, '')
  downloadText('outai-bookmarks.csv', rows.join('\n'))
  flash('已导出 CSV')
}
</script>

<template>
  <div class="bm">
    <header class="bm-header">
      <div>
        <h2 class="bm-title">书签管理器</h2>
        <p class="bm-sub">
          数据保存在浏览器本地 · 共 {{ totalCount }} 条
          <span v-if="statusMsg" class="bm-status">{{ statusMsg }}</span>
        </p>
      </div>
      <div class="bm-actions">
        <label class="bm-btn bm-btn-primary">
          导入 CSV / HTML
          <input type="file" accept=".csv,.html,.htm,text/csv,text/html" hidden @change="onFileChange" />
        </label>
        <button class="bm-btn" type="button" @click="exportCsv">导出 CSV</button>
        <button class="bm-btn" type="button" @click="exportMarkdown">导出 MD</button>
        <button class="bm-btn" type="button" @click="exportJson">导出 JSON</button>
        <button class="bm-btn bm-btn-danger" type="button" @click="clearAll">清空</button>
      </div>
    </header>

    <div class="bm-layout">
      <!-- sidebar folders -->
      <aside class="bm-sidebar">
        <div class="bm-side-head">
          <span>文件夹</span>
          <button class="bm-icon-btn" type="button" title="新建子文件夹" @click="showAddFolder = !showAddFolder">+</button>
        </div>

        <div v-if="showAddFolder" class="bm-inline-form">
          <input v-model="formFolderName" placeholder="文件夹名称" @keyup.enter="addFolder" />
          <button class="bm-btn bm-btn-primary" type="button" @click="addFolder">创建</button>
        </div>

        <ul class="bm-tree">
          <li
            v-for="f in allFoldersFlat"
            :key="f.id"
            class="bm-tree-item"
            :class="{ active: selectedFolderId === f.id }"
            :style="{ paddingLeft: 12 + f.depth * 14 + 'px' }"
            @click="selectedFolderId = f.id"
          >
            <span class="bm-tree-name">{{ f.name }}</span>
            <span class="bm-tree-count">{{ countAll(findFolder(root, f.id)!) }}</span>
            <span v-if="f.id !== 'root'" class="bm-tree-ops" @click.stop>
              <button type="button" @click="renameFolder(f.id)">改</button>
              <button type="button" @click="deleteFolder(f.id)">删</button>
            </span>
          </li>
        </ul>
      </aside>

      <!-- main -->
      <section class="bm-main">
        <div class="bm-main-bar">
          <h3>{{ selectedFolder.name }}</h3>
          <input v-model="searchQuery" class="bm-search" placeholder="搜索标题 / URL / 标签" />
          <button class="bm-btn bm-btn-primary" type="button" @click="showAddForm = !showAddForm; editingId = null">
            {{ showAddForm ? '取消' : '+ 添加书签' }}
          </button>
        </div>

        <div v-if="showAddForm" class="bm-form">
          <input v-model="formTitle" placeholder="标题（可空）" />
          <input v-model="formUrl" placeholder="https://..." />
          <input v-model="formTags" placeholder="标签，逗号分隔" />
          <input v-model="formNote" placeholder="备注（可选）" />
          <button class="bm-btn bm-btn-primary" type="button" @click="addBookmark">
            {{ editingId ? '保存修改' : '添加' }}
          </button>
        </div>

        <div v-if="!filteredBookmarks.length" class="bm-empty">
          此文件夹暂无书签。可导入 Raindrop CSV，或点击「添加书签」。
        </div>

        <ul class="bm-list">
          <li v-for="b in filteredBookmarks" :key="b.id" class="bm-item">
            <div class="bm-item-main">
              <a :href="b.url" target="_blank" rel="noopener" class="bm-link">{{ b.title }}</a>
              <div class="bm-meta">
                <span class="bm-url">{{ b.url }}</span>
                <span v-for="t in b.tags" :key="t" class="bm-tag">{{ t }}</span>
                <span v-if="b.addDate" class="bm-date">{{ b.addDate }}</span>
              </div>
              <p v-if="b.note" class="bm-note">{{ b.note }}</p>
            </div>
            <div class="bm-item-ops">
              <select v-model="moveTargetId" class="bm-select" @change="moveBookmark(b.id)">
                <option value="">移动到…</option>
                <option v-for="f in allFoldersFlat" :key="f.id" :value="f.id" :disabled="f.id === selectedFolderId">
                  {{ '—'.repeat(f.depth) }} {{ f.name }}
                </option>
              </select>
              <button type="button" class="bm-btn" @click="startEdit(b)">编辑</button>
              <button type="button" class="bm-btn bm-btn-danger" @click="deleteBookmark(b.id)">删除</button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <footer class="bm-footer">
      <p>
        <strong>使用说明：</strong>
        1）从 Raindrop 导出 CSV 后点「导入」；
        2）在此增删改、移动分类；
        3）点「导出 MD」下载，解压内容放到仓库
        <code>docs/bookmarks/</code> 后 <code>git push</code> 即可上线。
        数据仅存本机浏览器，换设备需重新导入或导出 JSON。
      </p>
    </footer>
  </div>
</template>

<style scoped>
.bm {
  margin: 1.5rem 0 3rem;
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 12px;
  background: var(--ol-card, #fff);
  overflow: hidden;
}
.bm-header {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid var(--ol-border, #e5e7eb);
}
.bm-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 650;
}
.bm-sub {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: var(--ol-text-secondary, #6b7280);
}
.bm-status {
  margin-left: 0.5rem;
  color: var(--ol-primary, #2563eb);
  font-weight: 600;
}
.bm-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.bm-btn {
  appearance: none;
  border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-bg, #fafafa);
  color: var(--ol-text, #111);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  cursor: pointer;
  line-height: 1.3;
}
.bm-btn:hover {
  border-color: var(--ol-primary, #2563eb);
}
.bm-btn-primary {
  background: var(--ol-primary, #2563eb);
  border-color: transparent;
  color: #fff;
}
.bm-btn-primary:hover {
  filter: brightness(1.05);
}
.bm-btn-danger {
  color: #dc2626;
  border-color: #fecaca;
}
.bm-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 420px;
}
@media (max-width: 768px) {
  .bm-layout {
    grid-template-columns: 1fr;
  }
}
.bm-sidebar {
  border-right: 1px solid var(--ol-border, #e5e7eb);
  background: var(--vp-c-bg-soft, #f4f4f5);
  max-height: 560px;
  overflow: auto;
}
.bm-side-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ol-text-secondary, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.bm-icon-btn {
  border: none;
  background: transparent;
  font-size: 1.2rem;
  cursor: pointer;
  color: var(--ol-primary, #2563eb);
}
.bm-inline-form {
  display: flex;
  gap: 0.35rem;
  padding: 0 0.75rem 0.75rem;
}
.bm-inline-form input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 6px;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  background: var(--ol-card, #fff);
  color: var(--ol-text, #111);
}
.bm-tree {
  list-style: none;
  margin: 0;
  padding: 0 0 1rem;
}
.bm-tree-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.45rem 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
}
.bm-tree-item:hover,
.bm-tree-item.active {
  background: var(--vp-c-brand-soft, rgba(37, 99, 235, 0.08));
}
.bm-tree-item.active {
  color: var(--ol-primary, #2563eb);
  font-weight: 600;
}
.bm-tree-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bm-tree-count {
  font-size: 0.75rem;
  color: var(--ol-text-secondary, #6b7280);
}
.bm-tree-ops button {
  border: none;
  background: transparent;
  font-size: 0.75rem;
  color: var(--ol-text-secondary, #6b7280);
  cursor: pointer;
  padding: 0 0.2rem;
}
.bm-tree-ops button:hover {
  color: var(--ol-primary, #2563eb);
}
.bm-main {
  padding: 1rem 1.25rem 1.5rem;
  max-height: 560px;
  overflow: auto;
}
.bm-main-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
  margin-bottom: 1rem;
}
.bm-main-bar h3 {
  margin: 0;
  font-size: 1.05rem;
  flex: 1;
  min-width: 100px;
}
.bm-search {
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  font-size: 0.85rem;
  min-width: 160px;
  flex: 1;
  max-width: 280px;
  background: var(--ol-bg, #fafafa);
  color: var(--ol-text, #111);
}
.bm-form {
  display: grid;
  gap: 0.5rem;
  grid-template-columns: 1fr 1fr;
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px dashed var(--ol-border, #e5e7eb);
  border-radius: 10px;
  background: var(--vp-c-bg-soft, #f4f4f5);
}
@media (max-width: 600px) {
  .bm-form {
    grid-template-columns: 1fr;
  }
}
.bm-form input {
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 8px;
  padding: 0.45rem 0.65rem;
  font-size: 0.9rem;
  background: var(--ol-card, #fff);
  color: var(--ol-text, #111);
}
.bm-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: var(--ol-text-secondary, #6b7280);
  font-size: 0.9rem;
}
.bm-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.bm-item {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 10px;
  background: var(--ol-bg, #fafafa);
}
.bm-item-main {
  flex: 1;
  min-width: 200px;
}
.bm-link {
  font-weight: 600;
  color: var(--ol-primary, #2563eb);
  text-decoration: none;
}
.bm-link:hover {
  text-decoration: underline;
}
.bm-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.35rem;
  align-items: center;
}
.bm-url {
  font-size: 0.75rem;
  color: var(--ol-text-secondary, #6b7280);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bm-tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  background: var(--vp-c-brand-soft, rgba(37, 99, 235, 0.1));
  color: var(--ol-primary, #2563eb);
}
.bm-date {
  font-size: 0.7rem;
  color: var(--ol-text-secondary, #6b7280);
}
.bm-note {
  margin: 0.35rem 0 0;
  font-size: 0.8rem;
  color: var(--ol-text-secondary, #6b7280);
}
.bm-item-ops {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.bm-select {
  border: 1px solid var(--ol-border, #e5e7eb);
  border-radius: 6px;
  padding: 0.3rem 0.4rem;
  font-size: 0.8rem;
  background: var(--ol-card, #fff);
  color: var(--ol-text, #111);
  max-width: 140px;
}
.bm-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--ol-border, #e5e7eb);
  font-size: 0.8rem;
  color: var(--ol-text-secondary, #6b7280);
  line-height: 1.6;
  background: var(--vp-c-bg-soft, #f4f4f5);
}
.bm-footer code {
  font-size: 0.75rem;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  background: var(--ol-card, #fff);
}
</style>
