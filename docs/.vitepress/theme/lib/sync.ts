/** 通过 Cloudflare Worker 同步到 GitHub（网站不存 Token） */

const URL_KEY = 'outai-lab-sync-url'
const PASS_KEY = 'outai-lab-sync-pass'

export function getSyncUrl(): string {
  return (localStorage.getItem(URL_KEY) || '').trim().replace(/\/+$/, '')
}

export function getSyncPass(): string {
  return localStorage.getItem(PASS_KEY) || ''
}

export function toBase64FromString(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
}

export function toBase64FromBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export interface SyncFile {
  path: string
  content: string // base64
  message?: string
}

export async function syncFiles(files: SyncFile[]): Promise<{ ok: boolean; message: string; results?: any[] }> {
  const url = getSyncUrl()
  if (!url) {
    throw new Error('请先在「同步设置」中填写同步服务地址（见 services/README.md）')
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const pass = getSyncPass()
  if (pass) headers['X-Upload-Key'] = pass

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ files }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || data.message || `HTTP ${res.status}`)
  }
  return data
}
