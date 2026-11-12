import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const SYSTEM_PROMPT = `너는 한국어로 설명하는 친절하고 간결한 영어 단어 퀴즈 코치야.
사용자가 원하는 주제와 난이도를 확인한 뒤, 관련 영어 단어를 한 번에 최대 3개 알려줘. 각 단어는 영어 단어, 한국어 뜻, 짧고 자연스러운 영어 예문과 예문의 한국어 뜻을 포함해.
단어를 설명한 뒤 마지막에 복습 퀴즈를 정확히 1개 내고, 사용자가 답을 말할 때까지 정답을 먼저 공개하지 마.
사용자가 주제나 난이도 중 하나라도 알려주지 않았다면 단어 목록이나 퀴즈를 만들지 말고, 빠진 정보를 한국어로 먼저 물어봐. 난이도는 초급, 중급, 고급처럼 확인해.
답변은 간결한 한국어로 작성하고, 다음 학습을 유도하는 추가 퀴즈는 내지 마.`

interface IncomingMessage {
  role: 'user' | 'assistant'
  content: string
}

function isMessage(value: unknown): value is IncomingMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Record<string, unknown>
  return (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' && message.content.trim().length > 0 && message.content.length <= 4000
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    res.status(405).json({ error: 'POST 요청만 지원해요.' })
    return
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: '서버에 OPENAI_API_KEY가 설정되지 않았어요. .env.local을 확인해 주세요.' })
    return
  }

  const body: unknown = req.body
  if (typeof body !== 'object' || body === null || !Array.isArray((body as { messages?: unknown }).messages)) {
    res.status(400).json({ error: '메시지 형식이 올바르지 않아요.' })
    return
  }

  const rawMessages: unknown[] = (body as { messages: unknown[] }).messages
  if (rawMessages.length === 0 || rawMessages.length > 40 || !rawMessages.every(isMessage)) {
    res.status(400).json({ error: '메시지는 1개 이상 40개 이하로 보내 주세요.' })
    return
  }

  const messages = rawMessages.slice(-20).map((message) => ({
    role: message.role,
    content: message.content.trim(),
  }))

  try {
    const openai = new OpenAI({ apiKey })
    const request = {
      model: 'gpt-6-luna',
      reasoning: { effort: 'none' },
      instructions: SYSTEM_PROMPT,
      input: messages,
      max_output_tokens: 700,
    }
    // The SDK's current ReasoningEffort union has not added the model's `none` value yet.
    const response = await openai.responses.create(
      request as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming,
    )
    res.status(200).json({ reply: response.output_text })
  } catch (error) {
    console.error('OpenAI Responses API request failed:', error)
    res.status(502).json({ error: '답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.' })
  }
}
