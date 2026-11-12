import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { sendChat } from '../api/chat'
import type { ChatMessage } from '../api/chat'

interface DisplayMessage extends ChatMessage {
  id: number
  pending?: boolean
}

const suggestions = ['여행 영어 · 초급', '음식 · 중급', '비즈니스 · 초급']

export default function Chatbot() {
  const [messages, setMessages] = useState<DisplayMessage[]>([
    { id: 1, role: 'assistant', content: '안녕하세요! 어떤 주제와 난이도의 영어 단어를 배워 볼까요?\n예: 여행 영어 초급, 음식 관련 중급', },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const nextId = useRef(2)
  const messagesEnd = useRef<HTMLDivElement>(null)
  const textarea = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function submit(text = input) {
    const content = text.trim()
    if (!content || isLoading) return
    const history: ChatMessage[] = [...messages.filter((message) => !message.pending), { role: 'user', content }]
    setMessages((current) => [...current, { id: nextId.current++, role: 'user', content }, { id: nextId.current++, role: 'assistant', content: '', pending: true }])
    setInput('')
    setIsLoading(true)
    if (textarea.current) textarea.current.style.height = 'auto'
    try {
      const reply = await sendChat(history)
      setMessages((current) => current.map((message) => message.pending ? { ...message, content: reply, pending: false } : message))
    } catch (error) {
      const message = error instanceof Error ? error.message : '오류가 발생했어요. 다시 시도해 주세요.'
      setMessages((current) => current.map((item) => item.pending ? { ...item, content: message, pending: false } : item))
    } finally {
      setIsLoading(false)
      textarea.current?.focus()
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void submit()
    }
  }

  function resizeInput(element: HTMLTextAreaElement) {
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, 100)}px`
  }

  return (
    <main className="page">
      <header className="topbar">
        <div className="brand"><span className="brand-icon" aria-hidden="true">Aa</span><span>단어 한입</span></div>
        <span className="top-note">오늘의 영어, 가볍게 한입</span>
      </header>
      <div className="layout">
        <section className="intro" aria-labelledby="page-title">
          <span className="eyebrow"><i /> YOUR DAILY WORD BITE</span>
          <h1 id="page-title">영어 단어를<br /><span>재미있게</span> 익혀요</h1>
          <p className="intro-copy">관심 있는 주제와 원하는 난이도를 말해 주세요. 단어부터 짧은 복습 퀴즈까지 함께할게요.</p>
          <div className="tip"><strong>이렇게 시작해 보세요</strong>“여행 영어 초급 단어 알려줘”<br />“요리 관련 중급 단어를 배우고 싶어”</div>
        </section>
        <section className="chat-card" aria-label="영어 단어 퀴즈 채팅">
          <header className="chat-head">
            <div className="avatar" aria-hidden="true">🌱</div>
            <div><div className="chat-name">단어 한입 코치</div><div className="online">함께 공부할 준비가 됐어요</div></div>
          </header>
          <div className="messages" aria-live="polite">
            {messages.map((message) => (
              <article className={`message ${message.role}`} key={message.id}>
                {message.role === 'assistant' && <span className="message-avatar" aria-hidden="true">🌱</span>}
                <div className="message-content">
                  <div className="bubble">{message.pending ? <span className="typing" aria-label="답변 작성 중"><span /><span /><span /></span> : message.content}</div>
                  {!message.pending && <div className="message-time">{message.role === 'user' ? '나' : '단어 한입 코치'}</div>}
                </div>
              </article>
            ))}
            <div ref={messagesEnd} />
          </div>
          <form className="composer" onSubmit={handleSubmit}>
            <div className="suggestions">{suggestions.map((suggestion) => <button className="suggestion" key={suggestion} type="button" disabled={isLoading} onClick={() => void submit(suggestion)}>{suggestion}</button>)}</div>
            <div className="input-row">
              <textarea ref={textarea} value={input} onChange={(event) => { setInput(event.target.value); resizeInput(event.target) }} onKeyDown={handleKeyDown} placeholder="주제와 난이도를 입력해 주세요" rows={1} aria-label="메시지 입력" />
              <button className="send" type="submit" disabled={isLoading || !input.trim()} aria-label="메시지 보내기">↑</button>
            </div>
            <p className="footnote">Enter로 전송 · Shift + Enter로 줄 바꿈</p>
          </form>
        </section>
      </div>
    </main>
  )
}
