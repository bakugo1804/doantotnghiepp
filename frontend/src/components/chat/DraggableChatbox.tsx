'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, X, Send, Loader2, GripVertical } from 'lucide-react';
import { aiApi } from '@/lib/api';
import { useSession } from 'next-auth/react';

interface Message { role: 'user' | 'assistant'; content: string; isError?: boolean; }

/** Câu hỏi gợi ý, giúp người dùng biết trợ lý này hỗ trợ được những gì. */
const SUGGESTIONS = [
  'Mã HS là gì và tra ở đâu?',
  'Thuế VAT nhập khẩu tính thế nào?',
  'Cần chứng từ gì để thông quan?',
];

export function DraggableChatbox() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'Xin chào! Tôi là trợ lý hải quan AI. Tôi có thể giúp bạn điền tờ khai, giải thích quy định, hoặc hỗ trợ sử dụng phần mềm. Bạn cần hỗ trợ gì?' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [takingLong, setTakingLong] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, px: 0, py: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setLoading(true);
    // Lần hỏi đầu tiên phải chờ nạp mô hình, nên báo cho người dùng biết là máy
    // vẫn đang chạy chứ không phải bị treo.
    const slowHint = setTimeout(() => setTakingLong(true), 6000);

    try {
      const res = await aiApi.chat(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch (error: any) {
      // Hiện đúng nguyên nhân từ máy chủ thay vì một câu chung chung — trước đây
      // mọi lỗi đều ra "có lỗi xảy ra" nên không thể biết phải xử lý thế nào.
      const serverMessage = error?.response?.data?.message;
      const isTimeout = error?.code === 'ECONNABORTED';
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content:
            serverMessage ||
            (isTimeout
              ? 'Trợ lý AI phản hồi quá lâu. Lần hỏi đầu tiên cần nạp mô hình nên có thể mất tới một phút, bạn thử lại giúp tôi nhé.'
              : 'Không kết nối được tới trợ lý AI. Hãy kiểm tra Ollama đã chạy trên máy chưa.'),
          isError: true,
        },
      ]);
    } finally {
      clearTimeout(slowHint);
      setTakingLong(false);
      setLoading(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY, px: position.x, py: position.y };
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    setPosition({
      x: dragStart.current.px + e.clientX - dragStart.current.x,
      y: dragStart.current.py + e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => setDragging(false);

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [dragging]);

  return (
    <div
      className="fixed z-50"
      style={{ bottom: 24 - position.y, right: 24 - position.x, cursor: dragging ? 'grabbing' : 'default' }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            className="mb-4 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col"
            style={{ height: 440 }}
          >
            {/* Header (draggable) */}
            <div
              onMouseDown={handleMouseDown}
              className="bg-blue-600 px-4 py-3 flex items-center justify-between cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-blue-300" />
                <MessageCircle className="h-4 w-4 text-white" />
                <span className="text-white font-semibold text-sm">Hỗ trợ AI</span>
              </div>
              <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white"><X className="h-4 w-4" /></button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap px-3 py-2 rounded-xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : msg.isError
                          ? 'bg-rose-50 text-rose-800 border border-rose-200 rounded-bl-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Gợi ý chỉ hiện khi chưa có trao đổi nào */}
              {messages.length === 1 && !loading && (
                <div className="space-y-1.5 pt-1">
                  {SUGGESTIONS.map((question) => (
                    <button
                      key={question}
                      onClick={() => setInput(question)}
                      className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-xs text-gray-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      {question}
                    </button>
                  ))}
                </div>
              )}

              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-xl rounded-bl-sm bg-gray-100 px-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                    {takingLong && (
                      <span className="text-xs text-gray-500">Đang nạp mô hình, lần đầu hơi lâu...</span>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-gray-200 p-3 flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                placeholder="Nhập câu hỏi..."
                className="flex-1 text-sm px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((o) => !o)}
        className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center transition"
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </motion.button>
    </div>
  );
}
