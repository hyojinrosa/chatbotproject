import { defineConfig, loadEnv, type Plugin } from 'vite'
import type { VercelRequest, VercelResponse } from '@vercel/node'

function localChatFunction(): Plugin {
  return {
    name: 'local-chat-function',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (request, response) => {
        try {
          let body: unknown
          if (request.method === 'POST') {
            const chunks: Buffer[] = []
            for await (const chunk of request) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
            }

            try {
              body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
            } catch {
              response.statusCode = 400
              response.setHeader('Content-Type', 'application/json')
              response.end(JSON.stringify({ error: '요청 본문은 올바른 JSON이어야 해요.' }))
              return
            }
          }

          const apiRequest = Object.assign(request, { body }) as VercelRequest
          const apiResponse = response as unknown as VercelResponse
          apiResponse.status = (statusCode) => {
            response.statusCode = statusCode
            return apiResponse
          }
          apiResponse.json = (data) => {
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(data))
            return apiResponse
          }

          const { default: handler } = await server.ssrLoadModule('/api/chat.ts')
          await handler(apiRequest, apiResponse)
        } catch (error) {
          console.error('Local /api/chat handler failed:', error)
          if (!response.headersSent) {
            response.statusCode = 500
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: '서버에서 요청을 처리하지 못했어요.' }))
          }
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (process.env.OPENAI_API_KEY === undefined && env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY
  }

  return { plugins: [localChatFunction()] }
})
