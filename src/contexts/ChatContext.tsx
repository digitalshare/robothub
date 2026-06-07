import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

export interface ChatAttachment {
  text: string;
  articleId?: string;
  articleTitle?: string;
}

interface ChatState {
  open: boolean;
  attachment: ChatAttachment | null;
  openChat: (attachment?: ChatAttachment) => void;
  closeChat: () => void;
  clearAttachment: () => void;
}

const ChatContext = createContext<ChatState | undefined>(undefined);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [attachment, setAttachment] = useState<ChatAttachment | null>(null);

  const openChat = useCallback((a?: ChatAttachment) => {
    if (a) setAttachment(a);
    setOpen(true);
  }, []);

  const closeChat = useCallback(() => setOpen(false), []);
  const clearAttachment = useCallback(() => setAttachment(null), []);

  return (
    <ChatContext.Provider value={{ open, attachment, openChat, closeChat, clearAttachment }}>
      {children}
    </ChatContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}
