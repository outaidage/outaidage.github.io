/**
 * Outai Lab 上传中转服务（Cloudflare Worker）
 *
 * 作用：网站前端把文件 POST 到这里，由 Worker 用仓库 Token 写入 GitHub。
 * 用户在 outaidage.xyz 上无需填写 GitHub Token。
 *
 * 部署（只需一次）：
 * 1. https://dash.cloudflare.com → Workers → Create
 * 2. 粘贴本文件全部代码 → Deploy
 * 3. Settings → Variables：
 *    - GITHUB_TOKEN = 有 repo 写权限的 PAT（只存在 Cloudflare，不进网站）
 *    - GITHUB_OWNER = outaidage
 *    - GITHUB_REPO  = outaidage.github.io
 *    - UPLOAD_KEY   = （可选）站点密码，不设则任何人可上传
 * 4. 把 Worker 地址填到网站「同步设置」里，例如：
 *    https://outai-upload.你的账号.workers.dev
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
  'Access-Control-Allow-Headers': 'Content-Type, X-Upload-Key',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS })
    }

    if (request.method === 'GET') {
      return json({ ok: true, service: 'outai-upload', repo: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}` })
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405)
    }

    // 可选站点密码（不是 GitHub Token）
    if (env.UPLOAD_KEY) {
      const key = request.headers.get('X-Upload-Key') || ''
      if (key !== env.UPLOAD_KEY) {
        return json({ error: '站点密码错误' }, 401)
      }
    }

    if (!env.GITHUB_TOKEN) {
      return json({ error: '服务器未配置 GITHUB_TOKEN' }, 500)
    }

    const owner = env.GITHUB_OWNER || 'outaidage'
    const repo = env.GITHUB_REPO || 'outaidage.github.io'

    let body
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Invalid JSON' }, 400)
    }

    const files = body.files
    if (!Array.isArray(files) || !files.length) {
      return json({ error: 'files 数组不能为空' }, 400)
    }
    if (files.length > 50) {
      return json({ error: '单次最多 50 个文件' }, 400)
    }

    const results = []
    for (const f of files) {
      if (!f.path || typeof f.content !== 'string') {
        results.push({ path: f.path, ok: false, error: '缺少 path 或 content' })
        continue
      }
      // 只允许写入安全目录
      if (!isAllowedPath(f.path)) {
        results.push({ path: f.path, ok: false, error: '路径不允许' })
        continue
      }
      try {
        await putGitHubFile(env.GITHUB_TOKEN, owner, repo, f.path, f.content, f.message || `chore: upload ${f.path}`)
        results.push({ path: f.path, ok: true })
      } catch (e) {
        results.push({ path: f.path, ok: false, error: String(e.message || e) })
      }
    }

    const failed = results.filter((r) => !r.ok)
    return json({
      ok: failed.length === 0,
      results,
      message: failed.length ? `${failed.length} 个失败` : `成功写入 ${results.length} 个文件`,
    })
  },
}

function isAllowedPath(p) {
  const path = p.replace(/^\/+/, '')
  return (
    path.startsWith('docs/public/files/') ||
    path.startsWith('docs/bookmarks/') ||
    path.startsWith('docs/documents/') ||
    path.startsWith('files/')
  )
}

async function putGitHubFile(token, owner, repo, path, contentBase64, message) {
  const api = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`
  let sha
  const getRes = await fetch(`${api}?ref=main`, {
    headers: ghHeaders(token),
  })
  if (getRes.ok) {
    const data = await getRes.json()
    sha = data.sha
  }

  const putRes = await fetch(api, {
    method: 'PUT',
    headers: ghHeaders(token),
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: 'main',
      ...(sha ? { sha } : {}),
    }),
  })
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}))
    throw new Error(err.message || `GitHub ${putRes.status}`)
  }
}

function ghHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
    'User-Agent': 'outai-upload-worker',
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
