# DAWdex Download Service

观众弹幕创作的音乐 → 本地渲染 MP3 → 上传 Cloudflare → 生成个人下载链接

## 部署步骤

```bash
cd cloudflare-download

# 1. 安装依赖
npm install

# 2. 创建 R2 bucket（只需一次）
npx wrangler r2 bucket create dawdex-music

# 3. 部署 Worker
npm run deploy
```

部署后 Worker 地址：`https://dawdex-download.<your-subdomain>.workers.dev`

记得把 `upload.sh` 里的 `WORKER_URL` 改成你的实际地址。

## 使用

### 上传（本地 Mac 执行）

```bash
./upload.sh ./output.mp3 "我的第一首弹幕音乐" "dubstep" "140" "C minor"
```

返回：
```json
{
  "success": true,
  "id": "a1b2c3d4e5f6",
  "url": "https://dawdex-download.xxx.workers.dev/d/a1b2c3d4e5f6"
}
```

### 下载（观众访问）

打开 `/d/:id` → 带播放器的下载页面，可试听 + 下载

## 架构

```
本地 Mac (openDAW 渲染 MP3)
    │
    ▼ POST /upload (带 secret)
Cloudflare Worker
    │
    ▼ 存到 R2
Cloudflare R2 (dawdex-music bucket)
    │
    ▼ GET /d/:id
观众下载页 (播放器 + 下载按钮)
```
