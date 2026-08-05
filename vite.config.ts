import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import type { IncomingMessage, ServerResponse } from 'http'

/**
 * DeepSeek 服务端代理：API Key 只存在于本地 .env（不进入前端代码），
 * 前端调用 /api/explain，由此中间件转发到 api.deepseek.com。
 * 前端只需传 { messages }，模型参数由服务端固定。
 */
function deepseekProxy(apiKey: string | undefined): Plugin {
  return {
    name: 'deepseek-proxy',
    configureServer(server) {
      server.middlewares.use('/api/explain', async (req: IncomingMessage, res: ServerResponse) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }
        if (!apiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'DEEPSEEK_API_KEY 未配置（请在项目根目录 .env 中设置）' }))
          return
        }
        try {
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const { messages, mode } = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          if (!Array.isArray(messages) || messages.length === 0) {
            res.statusCode = 400
            res.end(JSON.stringify({ error: 'messages 不能为空' }))
            return
          }
          // mode 'chat'：自由对话（纯文本回复）；默认结构化 JSON（解释层 / 综合研判）
          const isChat = mode === 'chat'
          const upstream = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages: messages.slice(-24),
              ...(isChat ? {} : { response_format: { type: 'json_object' } }),
              temperature: isChat ? 0.5 : 0.3,
              max_tokens: isChat ? 2400 : 1400,
              stream: false,
            }),
            signal: AbortSignal.timeout(60_000),
          })
          const text = await upstream.text()
          res.statusCode = upstream.status
          res.end(text)
        } catch (e) {
          res.statusCode = 502
          res.end(JSON.stringify({ error: `DeepSeek 代理失败：${e instanceof Error ? e.message : String(e)}` }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')
  return {
    base: './',
    plugins: [inspectAttr(), react(), deepseekProxy(env.DEEPSEEK_API_KEY)],
    server: {
      port: 3000,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  }
});
