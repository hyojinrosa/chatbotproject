export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface StreamChunk {
  delta?: string
  error?: string
}

const DEFAULT_ERROR = '메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.'
const EMPTY_REPLY_ERROR = '응답을 받지 못했어요. 다시 시도해 주세요.'

function processSseLine(line: string, onDelta: (delta: string) => void): { done: boolean; text: string } {
  const trimmed = line.trim()
  if (!trimmed.startsWith('data:')) return { done: false, text: '' }

  const payload = trimmed.slice(5).trim()
  if (payload === '[DONE]') return { done: true, text: '' }

  const data = JSON.parse(payload) as StreamChunk
  if (data.error) throw new Error(data.error)
  if (data.delta) {
    onDelta(data.delta)
    return { done: false, text: data.delta }
  }
  return { done: false, text: '' }
}

export async function sendChat(messages: ChatMessage[], onDelta: (delta: string) => void): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? DEFAULT_ERROR)
  }

  if (!response.body || response.headers.get('content-type')?.includes('application/json')) {
    const data = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null
    if (data?.error) throw new Error(data.error)
    if (!data?.reply) throw new Error(EMPTY_REPLY_ERROR)
    onDelta(data.reply)
    return data.reply
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullReply = ''
  let done = false

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const result = processSseLine(line, onDelta)
        fullReply += result.text
        if (result.done) {
          done = true
          break
        }
      }
    }

    buffer += decoder.decode()
    if (!done && buffer.trim()) {
      const result = processSseLine(buffer, onDelta)
      fullReply += result.text
    }
  } finally {
    reader.releaseLock()
  }

  if (!fullReply) throw new Error(EMPTY_REPLY_ERROR)
  return fullReply
}
