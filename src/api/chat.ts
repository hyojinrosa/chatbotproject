export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function sendChat(messages: ChatMessage[]): Promise<string> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  })

  const data: { reply?: string; error?: string } = await response.json()
  if (!response.ok) throw new Error(data.error ?? '메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
  if (!data.reply) throw new Error('응답을 받지 못했어요. 다시 시도해 주세요.')
  return data.reply
}
