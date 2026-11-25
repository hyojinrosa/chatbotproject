import OpenAI from 'openai'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export const SYSTEM_PROMPT = `너는 한국어로 설명하는 친절하고 간결한 영어 단어 퀴즈 코치야.
사용자가 주제나 난이도 중 하나라도 알려주지 않았다면 단어 목록이나 퀴즈를 만들지 말고, 빠진 정보를 한국어로 먼저 물어봐. 난이도는 초급, 중급, 고급처럼 확인해.

[1단계: 단어 소개]
주제와 난이도가 정해지면 먼저 관련 영어 단어 3개만 소개해. 각 단어마다 영어 단어, 한국어 뜻, 짧고 자연스러운 영어 예문과 예문의 한국어 해석만 보여줘.
첫 응답에서는 복습 퀴즈를 절대 내지 말고, 마지막에 반드시 다음 문장으로 안내해:
준비되면 "퀴즈 시작"이라고 입력해 주세요.

[2단계: 복습 퀴즈]
사용자가 "퀴즈 시작"이라고 입력하면, 직전에 소개한 단어 중 하나의 예문을 활용해 항상 "빈칸 채우기" 형식으로 복습 퀴즈를 정확히 1개만 내줘.
퀴즈에서는 정답이 바로 드러나지 않도록 예문의 한국어 해석을 그대로 보여주지 말고, 짧은 한국어 힌트만 제공해.
사용자가 답을 말할 때까지 정답을 먼저 공개하지 말고, 정답 단어 자리는 ______처럼 빈칸으로 바꾼 뒤 아래 형식을 그대로 지켜 출력해:

복습 퀴즈
Q. 다음 빈칸에 들어갈 알맞은 단어를 입력해보세요.
[정답 단어가 빈칸 처리된 영어 예문]
힌트: [정답을 직접 말하지 않는 짧은 한국어 힌트]
답을 입력해보세요.

[3단계: 정답 확인]
사용자가 답을 입력하면 정답 여부와 짧은 풀이를 간결한 한국어로 알려줘.
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

  const abortController = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) {
      abortController.abort()
    }
  })

  try {
    const openai = new OpenAI({ apiKey })
    const request = {
      model: 'gpt-6-luna',
      reasoning: { effort: 'none' },
      instructions: SYSTEM_PROMPT,
      input: messages,
      max_output_tokens: 700,
      stream: true,
    }
    // The SDK's current ReasoningEffort union has not added the model's `none` value yet.
    const stream = await openai.responses.create(
      request as unknown as OpenAI.Responses.ResponseCreateParamsStreaming,
      { signal: abortController.signal },
    )

    res.statusCode = 200
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    for await (const event of stream) {
      if (abortController.signal.aborted || res.writableEnded) break

      if (event.type === 'response.output_text.delta' && event.delta) {
        res.write(`data: ${JSON.stringify({ delta: event.delta })}\n\n`)
      } else if (event.type === 'error' || event.type === 'response.failed') {
        throw new Error(event.type === 'error' ? event.message : 'OpenAI response failed')
      }
    }

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n')
      res.end()
    }
  } catch (error) {
    if (abortController.signal.aborted) {
      if (!res.writableEnded) res.end()
      return
    }
    console.error('OpenAI Responses API request failed:', error)
    const errorMessage = '답변을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
    if (!res.headersSent) {
      res.status(502).json({ error: errorMessage })
      return
    }
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`)
      res.end()
    }
  }
}
