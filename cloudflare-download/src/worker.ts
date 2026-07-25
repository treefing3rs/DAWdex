/**
 * DAWdex Download Worker
 * 
 * POST /upload — 本地 Mac 上传 MP3（需要 secret）
 * GET  /d/:id  — 下载页面（带播放器 + 下载按钮）
 * GET  /f/:id  — 直接下载文件
 */

export interface Env {
  BUCKET: R2Bucket
  UPLOAD_SECRET: string
}

type TrackMeta = {
  id: string
  title: string
  style: string
  bpm: number
  key: string
  roles: string[]
  createdAt: string
  filename: string
}

function generateId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12)
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    // ── POST /upload ──────────────────────────────────────────────
    if (request.method === "POST" && url.pathname === "/upload") {
      const auth = request.headers.get("Authorization")
      if (auth !== `Bearer ${env.UPLOAD_SECRET}`) {
        return Response.json({ error: "Unauthorized" }, { status: 401 })
      }

      const formData = await request.formData()
      const file = formData.get("file") as File | null
      const title = (formData.get("title") as string) || "DAWdex Creation"
      const style = (formData.get("style") as string) || "unknown"
      const bpm = (formData.get("bpm") as string) || "120"
      const key = (formData.get("key") as string) || "C minor"
      const roles = (formData.get("roles") as string) || "drums,bass,keys"

      if (!file) {
        return Response.json({ error: "No file provided" }, { status: 400 })
      }

      const id = generateId()
      const ext = file.name.endsWith(".wav") ? "wav" : "mp3"
      const filename = `${id}.${ext}`

      const meta: TrackMeta = {
        id,
        title,
        style,
        bpm: parseInt(bpm),
        key,
        roles: roles.split(","),
        createdAt: new Date().toISOString(),
        filename,
      }

      // 存文件
      await env.BUCKET.put(`tracks/${filename}`, file.stream(), {
        httpMetadata: { contentType: file.type || "audio/mpeg" },
        customMetadata: { meta: JSON.stringify(meta) },
      })

      // 存元信息
      await env.BUCKET.put(`meta/${id}.json`, JSON.stringify(meta), {
        httpMetadata: { contentType: "application/json" },
      })

      const downloadUrl = `${url.origin}/d/${id}`

      return Response.json({ success: true, id, url: downloadUrl, meta }, {
        headers: corsHeaders(),
      })
    }

    // ── GET /d/:id — 下载页面 ─────────────────────────────────────
    const downloadMatch = url.pathname.match(/^\/d\/([a-f0-9]{12})$/)
    if (request.method === "GET" && downloadMatch) {
      const id = downloadMatch[1]
      const metaObj = await env.BUCKET.get(`meta/${id}.json`)
      if (!metaObj) {
        return new Response("Not found", { status: 404 })
      }
      const meta: TrackMeta = await metaObj.json()
      const fileUrl = `${url.origin}/f/${id}`

      const schemes = [
        { bg: "#fbc153", img: "pixel-mac.png" },
        { bg: "#9ecdd9", img: "pixel-alert.png" },
        { bg: "#f0532b", img: "pixel-bomb.png" },
        { bg: "#91bc79", img: "pixel-dog.png" },
      ]
      const scheme = schemes[Math.floor(Math.random() * schemes.length)]
      const imgUrl = `${url.origin}/static/${scheme.img}`

      const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>${meta.title} — DAWdex</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Space+Mono:wght@400;700&display=swap');
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding-top: 12vh;
  background: ${scheme.bg};
  font-family: 'Space Mono', monospace;
}
.icon {
  margin-bottom: 28px;
}
.icon img {
  width: 120px;
  height: auto;
  image-rendering: pixelated;
}
.logo {
  font-family: 'Press Start 2P', monospace;
  font-size: 18px;
  letter-spacing: 2px;
  color: #000;
  margin-bottom: 28px;
}
.player {
  width: 85%;
  max-width: 300px;
}
audio {
  width: 100%;
  height: 44px;
  border: none;
  border-radius: 40px;
  opacity: 0.85;
}
.download {
  display: inline-block;
  font-family: 'Space Mono', monospace;
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  text-decoration: none;
  color: #000;
  border: 2px solid #000;
  padding: 10px 24px;
  margin-top: 24px;
  transition: background 0.12s, color 0.12s;
}
.download:hover, .download:active {
  background: #000;
  color: #fff;
}
</style>
</head>
<body>
<div class="icon"><img src="${imgUrl}" alt=""></div>
<div class="logo">DAWdex</div>
<div class="player">
  <audio controls preload="metadata" src="${fileUrl}"></audio>
</div>
<a class="download" href="${fileUrl}" download="${meta.title}.${meta.filename.split('.').pop()}">↓ save</a>
</body>
</html>`
      return new Response(html, {
        headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders() },
      })
    }

    // ── GET /f/:id — 直接下载文件 ─────────────────────────────────
    const fileMatch = url.pathname.match(/^\/f\/([a-f0-9]{12})$/)
    if (request.method === "GET" && fileMatch) {
      const id = fileMatch[1]
      // 先读 meta 拿文件名
      const metaObj = await env.BUCKET.get(`meta/${id}.json`)
      if (!metaObj) {
        return new Response("Not found", { status: 404 })
      }
      const meta: TrackMeta = await metaObj.json()
      const fileObj = await env.BUCKET.get(`tracks/${meta.filename}`)
      if (!fileObj) {
        return new Response("File not found", { status: 404 })
      }
      return new Response(fileObj.body, {
        headers: {
          "Content-Type": fileObj.httpMetadata?.contentType || "audio/mpeg",
          "Content-Disposition": `attachment; filename="${meta.title}.${meta.filename.split('.').pop()}"`,
          ...corsHeaders(),
        },
      })
    }

    // ── GET /static/:file — 静态图片 ──────────────────────────────
    const staticMatch = url.pathname.match(/^\/static\/(.+)$/)
    if (request.method === "GET" && staticMatch) {
      const key = `static/${staticMatch[1]}`
      const obj = await env.BUCKET.get(key)
      if (!obj) { return new Response("Not found", { status: 404 }) }
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "image/png",
          "Cache-Control": "public, max-age=31536000",
          ...corsHeaders(),
        },
      })
    }

    // ── 首页 ─────────────────────────────────────────────────────
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("DAWdex Download Service 🎵", {
        headers: { "Content-Type": "text/plain" },
      })
    }

    return new Response("Not found", { status: 404 })
  },
}
