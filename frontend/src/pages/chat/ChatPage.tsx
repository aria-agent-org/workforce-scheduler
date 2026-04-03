import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { Send, Users, MessageCircle, Radio } from "lucide-react";
import api, { tenantApi } from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";

export default function ChatPage() {
  const { toast } = useToast();
  const user = useAuthStore(s => s.user);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [channel, setChannel] = useState<"broadcast" | "direct">("broadcast");
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    try {
      const res = await api.get(tenantApi(`/chat/messages?channel=${channel}&page_size=50`));
      setMessages(res.data.items || res.data || []);
    } catch { /* ignore */ }
  }, [channel]);

  useEffect(() => { loadMessages(); const iv = setInterval(loadMessages, 10000); return () => clearInterval(iv); }, [loadMessages]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  useEffect(() => {
    api.get(tenantApi("/chat/unread-count")).then(r => setUnread(r.data.count || 0)).catch(() => {});
  }, []);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setLoading(true);
    try {
      await api.post(tenantApi("/chat/messages"), { body: newMessage.trim(), channel });
      setNewMessage("");
      await loadMessages();
    } catch (e: any) { toast("error", e?.response?.data?.detail || "שגיאה בשליחה"); }
    finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><MessageCircle className="h-5 w-5" /> צ'אט</h1>
        {unread > 0 && <Badge className="bg-red-500">{unread} לא נקראו</Badge>}
      </div>

      <div className="flex gap-2">
        <Button variant={channel === "broadcast" ? "default" : "outline"} size="sm" onClick={() => setChannel("broadcast")} className="min-h-[40px]">
          <Radio className="me-1 h-4 w-4" /> כללי
        </Button>
        <Button variant={channel === "direct" ? "default" : "outline"} size="sm" onClick={() => setChannel("direct")} className="min-h-[40px]">
          <Users className="me-1 h-4 w-4" /> ישיר
        </Button>
      </div>

      <Card className="shadow-elevation-1">
        <CardContent className="p-0">
          <div className="h-[60vh] overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-12">
                <MessageCircle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>אין הודעות עדיין</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.sender_id === user?.id ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.sender_id === user?.id
                    ? "bg-primary-500 text-white rounded-bl-sm"
                    : "bg-muted rounded-br-sm"
                }`}>
                  {msg.sender_name && msg.sender_id !== user?.id && (
                    <p className="text-[10px] font-bold opacity-70 mb-0.5">{msg.sender_name}</p>
                  )}
                  <p className="text-sm whitespace-pre-wrap">{msg.body}</p>
                  <p className="text-[10px] opacity-50 mt-1">{msg.created_at ? new Date(msg.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : ""}</p>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="border-t p-3 flex gap-2">
            <Input
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
              placeholder="כתוב הודעה..."
              className="flex-1 min-h-[44px]"
            />
            <Button onClick={sendMessage} disabled={loading || !newMessage.trim()} className="min-h-[44px] min-w-[44px]">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
