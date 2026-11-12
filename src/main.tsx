import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Chatbot from './components/Chatbot'
import './style.css'

createRoot(document.getElementById('app')!).render(<StrictMode><Chatbot /></StrictMode>)
