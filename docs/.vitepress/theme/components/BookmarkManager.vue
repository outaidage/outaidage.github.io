<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { syncFiles, toBase64FromString } from '../lib/sync'
import SyncSettings from './SyncSettings.vue'

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

const WRAPPER_NAMES = new Set([
  'bookmarks', 'bookmarks bar', 'bookmark bar', 'other bookmarks',
  '书签', '书签栏', '收藏夹', '收藏夹栏', '其他书签', '移动收藏夹',
  'bookmarks menu', 'imported',
])

const root = ref<Folder>({
  id: 'root',
  name: '全部书签',
  bookmarks: [],
  children: [],
})

const selectedFolderId = ref('root')
const searchQuery = ref('')
const statusMsg = ref('')
const showAddForm = ref(false)
const showAddFolder = ref(false)
const showMoveFolder = ref(false)
const editingId = ref<string | null>(null)
const publishing = ref(false)
const movingFolderId = ref<string | null>(null)

const formTitle = ref('')
const formUrl = ref('')
const formTags = ref('')
const formNote = ref('')
const formFolderName = ref('')
const moveBookmarkTarget = ref('')
const moveFolderTarget = ref('')

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(root.value))
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      root.value = JSON.parse(raw)
      if (!root.value.id) root.value.id = 'root'
      selectedFolderId.value = 'root'
    }
  } catch { /* */ }
}

function flash(msg: string) {
  statusMsg.value = msg
  setTimeout(() => {
    if (statusMsg.value === msg) statusMsg.value = ''
  }, 3500)
}

onMounted(load)
watch(root, save, { deep: true })

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

function isDescendant(ancestor: Folder, id: string): boolean {
  for (const c of ancestor.children) {
    if (c.id === id) return true
    if (isDescendant(c, id)) return true
  }
  return false
}

function countAll(folder: Folder): number {
  let n = folder.bookmarks.length
  for (const c of folder.children) n += countAll(c)
  return n
}

/** 去掉浏览器/Raindrop 常见外壳文件夹，让集合直接挂在「全部书签」下 */
function normalizeTree(folder: Folder): void {
  let changed = true
  while (changed) {
    changed = false
    // 根下唯一子文件夹且根无书签 → 提升子级
    if (folder.bookmarks.length === 0 && folder.children.length === 1) {
      const only = folder.children[0]
      folder.bookmarks.push(...only.bookmarks)
      folder.children = [...only.children]
      changed = true
      continue
    }
    // 拆掉外壳名文件夹
    const kept: Folder[] = []
    for (const c of folder.children) {
      const name = c.name.trim().toLowerCase()
      if (WRAPPER_NAMES.has(name) && c.bookmarks.length === 0 && c.children.length) {
        kept.push(...c.children)
        changed = true
      } else if (WRAPPER_NAMES.has(name) && c.children.length) {
        // 有书签也提升子文件夹，书签留在该层改名
        kept.push(c)
        for (const gc of c.children) kept.push(gc)
        c.children = []
        changed = true
      } else {
        kept.push(c)
      }
    }
    if (changed) folder.children = kept
  }
  for (const c of folder.children) normalizeTree(c)
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

// ─── bookmarks CRUD ───

function addBookmark() {
  const title = formTitle.value.trim()
  const url = formUrl.value.trim()
  if (!url) {
    flash('请填写 URL')
    return
  }
  const tags = formTags.value.split(/[,，\s]+/).map((t) => t.trim()).filter(Boolean)
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

function moveBookmark(bookmarkId: string) {
  const targetId = moveBookmarkTarget.value
  if (!targetId) return
  const from = selectedFolder.value
  const to = findFolder(root.value, targetId)
  if (!to || from.id === to.id) return
  const i = from.bookmarks.findIndex((b) => b.id === bookmarkId)
  if (i < 0) return
  const [b] = from.bookmarks.splice(i, 1)
  to.bookmarks.unshift(b)
  moveBookmarkTarget.value = ''
  flash(`已移动到「${to.name}」`)
}

// ─── folders CRUD ───

function addFolder() {
  const name = formFolderName.value.trim()
  if (!name) {
    flash('请填写文件夹名')
    return
  }
  const parent = selectedFolder.value
  if (parent.children.some((c) => c.name === name)) {
    flash('同级已有同名文件夹')
    return
  }
  const id = uid()
  parent.children.push({
    id,
    name,
    bookmarks: [],
    children: [],
  })
  formFolderName.value = ''
  showAddFolder.value = false
  selectedFolderId.value = id
  flash(`已在「${parent.name}」下新建「${name}」`)
}

function renameFolder(id: string) {
  const f = findFolder(root.value, id)
  if (!f || id === 'root') return
  const name = prompt('重命名文件夹', f.name)
  if (name && name.trim()) {
    f.name = name.trim()
    flash('已重命名')
  }
}

function deleteFolder(id: string) {
  if (id === 'root') {
    flash('不能删除根目录')
    return
  }
  const f = findFolder(root.value, id)
  if (!f) return
  const n = countAll(f)
  if (!confirm(`删除文件夹「${f.name}」及其内 ${n} 条书签/子文件夹？`)) return
  const parent = findParent(root.value, id)
  if (parent) {
    parent.children = parent.children.filter((c) => c.id !== id)
    if (selectedFolderId.value === id || isDescendant(f, selectedFolderId.value)) {
      selectedFolderId.value = parent.id
    }
    flash('已删除文件夹')
  }
}

function startMoveFolder(id: string) {
  if (id === 'root') return
  movingFolderId.value = id
  moveFolderTarget.value = ''
  showMoveFolder.value = true
}

function confirmMoveFolder() {
  const id = movingFolderId.value
  const targetId = moveFolderTarget.value
  if (!id || !targetId) return
  if (id === targetId) {
    flash('不能移到自身')
    return
  }
  const folder = findFolder(root.value, id)
  const target = findFolder(root.value, targetId)
  const parent = findParent(root.value, id)
  if (!folder || !target || !parent) return
  if (isDescendant(folder, targetId)) {
    flash('不能移到自己的子文件夹内')
    return
  }
  if (target.children.some((c) => c.name === folder.name && c.id !== id)) {
    flash('目标位置已有同名文件夹')
    return
  }
  parent.children = parent.children.filter((c) => c.id !== id)
  target.children.push(folder)
  showMoveFolder.value = false
  movingFolderId.value = null
  flash(`已将「${folder.name}」移到「${target.name}」下`)
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
    // 跳过外壳名
    if (WRAPPER_NAMES.has(part.toLowerCase())) continue
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
    let folderPath = iFolder >= 0 ? cols[iFolder] || '' : ''
    // 去掉路径里的外壳段
    folderPath = folderPath
      .split('/')
      .map((p) => p.trim())
      .filter((p) => p && !WRAPPER_NAMES.has(p.toLowerCase()))
      .join('/')
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
  normalizeTree(root.value)
  return added
}

function importHtml(html: string) {
  const tempRoot: Folder = { id: uid(), name: 'tmp', bookmarks: [], children: [] }
  const stack: Folder[] = [tempRoot]
  const normalized = html.replace(/\r\n/g, '\n').replace(/<(A|H3)\b([^>]*)\n([^>]*)>/gi, '<$1$2 $3>')
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
        addDate: dateM ? new Date(Number(dateM[1]) * 1000).toISOString().slice(0, 10) : undefined,
      })
    }
  }

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
  normalizeTree(root.value)
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
      selectedFolderId.value = 'root'
      flash(`导入成功：${n} 条（已整理文件夹结构）`)
    } catch (err: any) {
      flash('导入失败：' + (err?.message || err))
    }
    input.value = ''
  }
  reader.readAsText(file)
}

function clearAll() {
  if (!confirm('清空所有本地书签数据？')) return
  root.value = { id: 'root', name: '全部书签', bookmarks: [], children: [] }
  selectedFolderId.value = 'root'
  flash('已清空')
}

function reNormalize() {
  normalizeTree(root.value)
  flash('已重新整理文件夹结构')
}

// ─── export / publish ───

function slugify(name: string) {
  return (
    name.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'untitled'
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

function buildMdFiles(folder: Folder, prefix: string, files: { path: string; content: string }[]) {
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
  const parts = files.map((f) => `===== FILE: docs/bookmarks/${f.path} =====\n${f.content}`)
  downloadText('outai-bookmarks-export.md', parts.join('\n\n'))
  flash(`已导出 ${files.length} 个文件`)
}

function exportJson() {
  downloadText('outai-bookmarks.json', JSON.stringify(root.value, null, 2))
  flash('已导出 JSON')
}

function exportCsv() {
  const rows = ['folder,url,title,tags,note,created']
  function walk(f: Folder, path: string) {
    for (const b of f.bookmarks) {
      const tags = `"${b.tags.join(', ')}"`
      const note = `"${(b.note || '').replace(/"/g, '""')}"`
      const title = `"${b.title.replace(/"/g, '""')}"`
      rows.push(`${JSON.stringify(path)},${b.url},${title},${tags},${note},${b.addDate || ''}`)
    }
    for (const c of f.children) walk(c, path ? `${path}/${c.name}` : c.name)
  }
  walk(root.value, '')
  downloadText('outai-bookmarks.csv', rows.join('\n'))
  flash('已导出 CSV')
}

async function publishToGitHub() {
  if (!totalCount.value) {
    flash('没有书签可发布')
    return
  }
  if (!confirm(`将把 ${totalCount.value} 条书签同步到仓库？`)) return

  publishing.value = true
  try {
    normalizeTree(root.value)
    const files: { path: string; content: string }[] = []
    buildMdFiles(root.value, '', files)

    const homeIdx = files.findIndex((f) => f.path === 'index.md')
    if (homeIdx >= 0) {
      files[homeIdx].content =
        '---\ntitle: "Bookmarks"\ndescription: "书签集合"\n---\n\n# 🔖 Bookmarks\n\n' +
        `共 ${totalCount.value} 条\n\n` +
        `[打开管理器](/bookmarks/manage)\n\n` +
        files[homeIdx].content.replace(/^---[\s\S]*?---\n*/, '').replace(/^# .+\n*/, '')
    }

    const payload = files.map((f) => ({
      path: `docs/bookmarks/${f.path}`,
      content: toBase64FromString(f.content),
      message: `chore(bookmarks): ${f.path}`,
    }))

    for (let i = 0; i < payload.length; i += 10) {
      const chunk = payload.slice(i, i + 10)
      flash(`同步中… ${Math.min(i + 10, payload.length)}/${payload.length}`)
      const result = await syncFiles(chunk)
      if (!result.ok) throw new Error(result.message || '部分失败')
    }

    flash(`已同步 ${files.length} 个文件`)
  } catch (e: any) {
    flash('同步失败：' + (e?.message || e))
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <div class="bm">
    <header class="bm-header">
      <div>
        <h2 class="bm-title">书签管理器</h2>
        <p class="bm-sub">
          共 {{ totalCount }} 条
          <span v-if="statusMsg" class="bm-status">{{ statusMsg }}</span>
        </p>
      </div>
      <div class="bm-actions">
        <label class="bm-btn bm-btn-primary">
          导入 CSV / HTML
          <input type="file" accept=".csv,.html,.htm,text/csv,text/html" hidden @change="onFileChange" />
        </label>
        <button class="bm-btn" type="button" @click="reNormalize">整理结构</button>
        <button class="bm-btn" type="button" @click="exportCsv">导出 CSV</button>
        <button class="bm-btn" type="button" @click="exportMarkdown">导出 MD</button>
        <button class="bm-btn bm-btn-primary" type="button" :disabled="publishing" @click="publishToGitHub">
          {{ publishing ? '同步中…' : '发布到仓库' }}
        </button>
        <button class="bm-btn bm-btn-danger" type="button" @click="clearAll">清空</button>
      </div>
    </header>

    <div class="bm-sync" style="padding: 0.75rem 1.5rem 0">
      <SyncSettings />
    </div>

    <div v-if="showMoveFolder" class="bm-move-bar">
      <span>移动文件夹到：</span>
      <select v-model="moveFolderTarget">
        <option value="">选择目标文件夹</option>
        <option
          v-for="f in allFoldersFlat"
          :key="f.id"
          :value="f.id"
          :disabled="f.id === movingFolderId"
        >
          {{ '\u00A0'.repeat(f.depth * 2) }}{{ f.name }}
        </option>
      </select>
      <button type="button" class="bm-btn bm-btn-primary" @click="confirmMoveFolder">确定</button>
      <button type="button" class="bm-btn" @click="showMoveFolder = false">取消</button>
    </div>

    <div class="bm-layout">
      <aside class="bm-sidebar">
        <div class="bm-side-head">
          <span>文件夹</span>
          <button class="bm-icon-btn" type="button" title="在当前文件夹下新建子文件夹" @click="showAddFolder = !showAddFolder">+</button>
        </div>

        <div v-if="showAddFolder" class="bm-inline-form">
          <input
            v-model="formFolderName"
            :placeholder="`在「${selectedFolder.name}」下新建`"
            @keyup.enter="addFolder"
          />
          <button class="bm-btn bm-btn-primary" type="button" @click="addFolder">创建</button>
        </div>

        <ul class="bm-tree">
          <li
            v-for="f in allFoldersFlat"
            :key="f.id"
            class="bm-tree-item"
            :class="{ active: selectedFolderId === f.id }"
            :style="{ paddingLeft: 10 + f.depth * 14 + 'px' }"
            @click="selectedFolderId = f.id"
          >
            <span class="bm-tree-name">{{ f.name }}</span>
            <span class="bm-tree-count">{{ countAll(findFolder(root, f.id)!) }}</span>
            <span v-if="f.id !== 'root'" class="bm-tree-ops" @click.stop>
              <button type="button" title="重命名" @click="renameFolder(f.id)">改</button>
              <button type="button" title="移动到其他文件夹" @click="startMoveFolder(f.id)">移</button>
              <button type="button" title="删除" @click="deleteFolder(f.id)">删</button>
            </span>
          </li>
        </ul>
      </aside>

      <section class="bm-main">
        <div class="bm-main-bar">
          <h3>{{ selectedFolder.name }}</h3>
          <input v-model="searchQuery" class="bm-search" placeholder="搜索标题 / URL / 标签" />
          <button class="bm-btn" type="button" @click="showAddFolder = true">+ 子文件夹</button>
          <button class="bm-btn bm-btn-primary" type="button" @click="showAddForm = !showAddForm; editingId = null">
            {{ showAddForm ? '取消' : '+ 书签' }}
          </button>
        </div>

        <div v-if="selectedFolder.children.length" class="bm-subfolders">
          <span class="bm-sub-label">子文件夹：</span>
          <button
            v-for="c in selectedFolder.children"
            :key="c.id"
            type="button"
            class="bm-chip"
            @click="selectedFolderId = c.id"
          >
            {{ c.name }} ({{ countAll(c) }})
          </button>
        </div>

        <div v-if="showAddForm" class="bm-form">
          <input v-model="formTitle" placeholder="标题（可空）" />
          <input v-model="formUrl" placeholder="https://..." />
          <input v-model="formTags" placeholder="标签，逗号分隔" />
          <input v-model="formNote" placeholder="备注（可选）" />
          <button class="bm-btn bm-btn-primary" type="button" @click="addBookmark">
            {{ editingId ? '保存修改' : '添加到当前文件夹' }}
          </button>
        </div>

        <div v-if="!filteredBookmarks.length" class="bm-empty">
          当前文件夹没有书签。
          <template v-if="selectedFolder.children.length">可点击上方子文件夹查看，或</template>
          点「+ 书签」添加。
        </div>

        <ul class="bm-list">
          <li v-for="b in filteredBookmarks" :key="b.id" class="bm-item">
            <div class="bm-item-main">
              <a :href="b.url" target="_blank" rel="noopener" class="bm-link">{{ b.title }}</a>
              <div class="bm-meta">
                <span class="bm-url">{{ b.url }}</span>
                <span v-for="t in b.tags" :key="t" class="bm-tag">{{ t }}</span>
              </div>
            </div>
            <div class="bm-item-ops">
              <select v-model="moveBookmarkTarget" class="bm-select" @change="moveBookmark(b.id)">
                <option value="">移动到…</option>
                <option
                  v-for="f in allFoldersFlat"
                  :key="f.id"
                  :value="f.id"
                  :disabled="f.id === selectedFolderId"
                >
                  {{ '\u00A0'.repeat(f.depth * 2) }}{{ f.name }}
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
        左侧选中文件夹后可：新建子文件夹、重命名、移动、删除。每条书签可用「移动到…」更换归属。
        导入后若结构不对，点「整理结构」。改完后点「发布到仓库」同步到网站。
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
  display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--ol-border, #e5e7eb);
}
.bm-title { margin: 0; font-size: 1.25rem; font-weight: 650; }
.bm-sub { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--ol-text-secondary, #6b7280); }
.bm-status { margin-left: 0.5rem; color: var(--ol-primary, #2563eb); font-weight: 600; }
.bm-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.bm-btn {
  appearance: none; border: 1px solid var(--ol-border, #e5e7eb);
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
  border-radius: 8px; padding: 0.4rem 0.75rem; font-size: 0.85rem; cursor: pointer;
}
.bm-btn-primary { background: var(--ol-primary, #2563eb); border-color: transparent; color: #fff; }
.bm-btn-danger { color: #dc2626; border-color: #fecaca; }
.bm-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.bm-move-bar {
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  padding: 0.65rem 1.25rem; background: var(--vp-c-brand-soft, rgba(37,99,235,0.08));
  font-size: 0.85rem;
}
.bm-move-bar select {
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 6px; padding: 0.3rem 0.5rem;
  background: var(--ol-card, #fff); color: var(--ol-text, #111);
}
.bm-layout { display: grid; grid-template-columns: 260px 1fr; min-height: 420px; }
@media (max-width: 768px) { .bm-layout { grid-template-columns: 1fr; } }
.bm-sidebar {
  border-right: 1px solid var(--ol-border, #e5e7eb);
  background: var(--vp-c-bg-soft, #f4f4f5); max-height: 560px; overflow: auto;
}
.bm-side-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.75rem 1rem; font-size: 0.8rem; font-weight: 600;
  color: var(--ol-text-secondary, #6b7280);
}
.bm-icon-btn { border: none; background: transparent; font-size: 1.2rem; cursor: pointer; color: var(--ol-primary, #2563eb); }
.bm-inline-form { display: flex; gap: 0.35rem; padding: 0 0.75rem 0.75rem; }
.bm-inline-form input {
  flex: 1; min-width: 0; border: 1px solid var(--ol-border, #e5e7eb); border-radius: 6px;
  padding: 0.35rem 0.5rem; font-size: 0.85rem; background: var(--ol-card, #fff); color: var(--ol-text, #111);
}
.bm-tree { list-style: none; margin: 0; padding: 0 0 1rem; }
.bm-tree-item {
  display: flex; align-items: center; gap: 0.25rem;
  padding: 0.4rem 0.5rem; cursor: pointer; font-size: 0.88rem;
}
.bm-tree-item:hover, .bm-tree-item.active { background: var(--vp-c-brand-soft, rgba(37, 99, 235, 0.08)); }
.bm-tree-item.active { color: var(--ol-primary, #2563eb); font-weight: 600; }
.bm-tree-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bm-tree-count { font-size: 0.72rem; color: var(--ol-text-secondary, #6b7280); }
.bm-tree-ops button {
  border: none; background: transparent; font-size: 0.72rem;
  color: var(--ol-text-secondary, #6b7280); cursor: pointer; padding: 0 0.15rem;
}
.bm-tree-ops button:hover { color: var(--ol-primary, #2563eb); }
.bm-main { padding: 1rem 1.25rem 1.5rem; max-height: 560px; overflow: auto; }
.bm-main-bar { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; margin-bottom: 0.75rem; }
.bm-main-bar h3 { margin: 0; font-size: 1.05rem; flex: 1; min-width: 80px; }
.bm-search {
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 8px; padding: 0.35rem 0.65rem;
  font-size: 0.85rem; min-width: 140px; flex: 1; max-width: 240px;
  background: var(--ol-bg, #fafafa); color: var(--ol-text, #111);
}
.bm-subfolders {
  display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
  margin-bottom: 0.85rem; font-size: 0.85rem;
}
.bm-sub-label { color: var(--ol-text-secondary, #6b7280); }
.bm-chip {
  border: 1px solid var(--ol-border, #e5e7eb); background: var(--ol-bg, #fafafa);
  border-radius: 999px; padding: 0.2rem 0.65rem; font-size: 0.8rem; cursor: pointer;
  color: var(--ol-text, #111);
}
.bm-chip:hover { border-color: var(--ol-primary, #2563eb); color: var(--ol-primary, #2563eb); }
.bm-form {
  display: grid; gap: 0.5rem; grid-template-columns: 1fr 1fr; margin-bottom: 1rem;
  padding: 1rem; border: 1px dashed var(--ol-border, #e5e7eb); border-radius: 10px;
  background: var(--vp-c-bg-soft, #f4f4f5);
}
@media (max-width: 600px) { .bm-form { grid-template-columns: 1fr; } }
.bm-form input {
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 8px; padding: 0.4rem 0.6rem;
  font-size: 0.9rem; background: var(--ol-card, #fff); color: var(--ol-text, #111);
}
.bm-empty { padding: 1.5rem 1rem; text-align: center; color: var(--ol-text-secondary, #6b7280); font-size: 0.9rem; }
.bm-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.55rem; }
.bm-item {
  display: flex; flex-wrap: wrap; gap: 0.65rem; justify-content: space-between;
  padding: 0.75rem 0.9rem; border: 1px solid var(--ol-border, #e5e7eb); border-radius: 10px;
  background: var(--ol-bg, #fafafa);
}
.bm-item-main { flex: 1; min-width: 180px; }
.bm-link { font-weight: 600; color: var(--ol-primary, #2563eb); text-decoration: none; }
.bm-meta { display: flex; flex-wrap: wrap; gap: 0.3rem; margin-top: 0.3rem; align-items: center; }
.bm-url {
  font-size: 0.72rem; color: var(--ol-text-secondary, #6b7280);
  max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.bm-tag {
  font-size: 0.68rem; padding: 0.08rem 0.35rem; border-radius: 4px;
  background: var(--vp-c-brand-soft, rgba(37, 99, 235, 0.1)); color: var(--ol-primary, #2563eb);
}
.bm-item-ops { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
.bm-select {
  border: 1px solid var(--ol-border, #e5e7eb); border-radius: 6px; padding: 0.25rem 0.35rem;
  font-size: 0.78rem; background: var(--ol-card, #fff); color: var(--ol-text, #111); max-width: 150px;
}
.bm-footer {
  padding: 0.85rem 1.5rem; border-top: 1px solid var(--ol-border, #e5e7eb);
  font-size: 0.8rem; color: var(--ol-text-secondary, #6b7280); line-height: 1.55;
  background: var(--vp-c-bg-soft, #f4f4f5);
}
</style>
