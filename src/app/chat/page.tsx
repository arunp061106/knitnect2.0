'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChatChannel, ChatMessage, Profile, Style } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { formatTimeSafe } from '@/lib/utils/format';
import {
  MessageSquare,
  Send,
  AtSign,
  Layers,
  User,
  Users,
  Lock,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ChatPage() {
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [loading, setLoading] = useState(true);

  // Structured Tagging State
  const [taggedStyleId, setTaggedStyleId] = useState<string>('');
  const [taggedUserId, setTaggedUserId] = useState<string>('');
  const [showTagMenu, setShowTagMenu] = useState(false);

  const [styles, setStyles] = useState<Style[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 3000);

    const loadChatData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          window.location.href = '/login';
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (profile && isMounted) {
          setCurrentUser(profile);
        }

        // Query channels filtered by RLS
        const { data: dbChannels } = await supabase
          .from('chat_channels')
          .select('*')
          .order('created_at', { ascending: true });

        if (dbChannels && isMounted) {
          setChannels(dbChannels as ChatChannel[]);
          if (dbChannels.length > 0) {
            const initialChannel = activeChannelId || dbChannels[0].id;
            setActiveChannelId(initialChannel);

            // Fetch messages for active channel
            const { data: dbMessages } = await supabase
              .from('chat_messages')
              .select('*')
              .eq('channel_id', initialChannel)
              .order('created_at', { ascending: true });

            if (dbMessages && isMounted) {
              setMessages(dbMessages as ChatMessage[]);
            }
          }
        }

        // Fetch styles & users for deep-linking tags
        const { data: dbStyles } = await supabase.from('styles').select('*');
        if (dbStyles && isMounted) setStyles(dbStyles as Style[]);

        const { data: dbUsers } = await supabase.from('profiles').select('*');
        if (dbUsers && isMounted) setUsers(dbUsers as Profile[]);
      } catch (err) {
        console.error('Failed to load chat data:', err);
      } finally {
        clearTimeout(safetyTimer);
        if (isMounted) setLoading(false);
      }
    };

    loadChatData();

    // Subscribe to channels updates for real-time sidebar previews
    const channelsSub = supabase
      .channel('realtime:all_chat_channels')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_channels',
        },
        async () => {
          const { data } = await supabase
            .from('chat_channels')
            .select('*')
            .order('created_at', { ascending: true });
          if (data && isMounted) {
            setChannels(data as ChatChannel[]);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
      supabase.removeChannel(channelsSub);
    };
  }, [router]);

  // Realtime subscription for messages in active channel
  useEffect(() => {
    if (!activeChannelId) return;

    const supabase = createClient();

    // Fetch messages for active channel when activeChannelId changes
    supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', activeChannelId)
      .order('created_at', { ascending: true })
      .then(({ data, error }: { data: any; error: any }) => {
        if (!error && data) {
          setMessages(data as ChatMessage[]);
        }
      });

    // Subscribe to new messages for active channel
    const messageSub = supabase
      .channel(`realtime:chat_channel_${activeChannelId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `channel_id=eq.${activeChannelId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as ChatMessage;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messageSub);
    };
  }, [activeChannelId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectChannel = async (channelId: string) => {
    setActiveChannelId(channelId);
    setMobileShowChat(true);

    const supabase = createClient();
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data as ChatMessage[]);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim() || !activeChannelId || !currentUser) return;

    const trimmedBody = messageBody.trim();
    const style = taggedStyleId ? styles.find((s) => s.id === taggedStyleId) : undefined;
    const taggedUser = taggedUserId ? users.find((u) => u.id === taggedUserId) : undefined;

    const supabase = createClient();
    const msgId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    const newMsgObj: ChatMessage = {
      id: msgId,
      channel_id: activeChannelId,
      sender_id: currentUser.id,
      sender_name: currentUser.full_name || 'Staff Member',
      sender_role: currentUser.role,
      body: trimmedBody,
      tagged_style_id: taggedStyleId || undefined,
      tagged_style_number: style?.style_number || undefined,
      tagged_user_id: taggedUserId || undefined,
      tagged_user_name: taggedUser?.full_name || undefined,
      created_at: nowIso,
    };

    // Optimistic UI update
    setMessages((prev) => [...prev, newMsgObj]);
    setMessageBody('');
    setTaggedStyleId('');
    setTaggedUserId('');
    setShowTagMenu(false);

    const { error } = await supabase.from('chat_messages').insert({
      id: msgId,
      channel_id: activeChannelId,
      sender_id: currentUser.id,
      sender_name: currentUser.full_name || 'Staff Member',
      sender_role: currentUser.role,
      body: trimmedBody,
      tagged_style_id: taggedStyleId || null,
      tagged_style_number: style?.style_number || null,
      tagged_user_id: taggedUserId || null,
      tagged_user_name: taggedUser?.full_name || null,
      created_at: nowIso,
    });

    if (error) {
      console.error('Supabase chat send error:', error.message);
      // Revert optimistic update
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
      alert(`Chat Error: ${error.message}`);
      return;
    }

    // Update channel preview
    await supabase
      .from('chat_channels')
      .update({
        last_message: trimmedBody,
        last_message_at: nowIso,
      })
      .eq('id', activeChannelId);
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-mono">Loading operations communications...</p>
        </div>
      </div>
    );
  }

  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];
  const canTag = currentUser?.role === 'owner' || currentUser?.role === 'manager';

  return (
    <div className="h-[calc(100dvh-7.5rem)] md:h-[calc(100vh-6.5rem)] flex flex-col space-y-2 sm:space-y-4">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 sm:pb-3 border-b border-slate-800 flex-shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-primary flex-shrink-0" />
            <h1 className="text-sm sm:text-xl font-bold tracking-tight text-white truncate max-w-[200px] xs:max-w-xs sm:max-w-none">
              Operations Communications
            </h1>
          </div>
          <p className="hidden sm:block text-xs text-slate-400 mt-1">
            Section 8: 4 isolated communication surfaces with structured @style and @person deep-linking tags.
          </p>
        </div>

        {/* Live Cloud Sync Status Badge */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="hidden xs:inline">Realtime </span>Live
          </span>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 flex bg-[#101625] border border-slate-800 rounded overflow-hidden min-h-0">
        {/* Left Sidebar: Channels List */}
        <div className={`w-full md:w-72 bg-[#0d1320] border-r border-slate-800 flex flex-col flex-shrink-0 ${mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-slate-800 text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>Available Channels ({channels.length})</span>
            <span className="md:hidden text-[10px] text-blue-400 font-normal">Tap to open</span>
          </div>

          <div className="divide-y divide-slate-800/60 overflow-y-auto flex-1">
            {channels.map((c) => {
              const isActive = c.id === activeChannelId;
              const isCommon = c.type === 'common';
              const isExec = c.type === 'owner_manager';

              return (
                <div
                  key={c.id}
                  onClick={() => handleSelectChannel(c.id)}
                  className={`p-3 cursor-pointer transition text-xs ${
                    isActive ? 'bg-slate-800/90 text-white' : 'hover:bg-slate-800/40 text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold truncate flex items-center gap-1.5">
                      {isCommon ? (
                        <Users className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      ) : isExec ? (
                        <Lock className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                      ) : (
                        <User className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
                      )}
                      <span className="truncate">{c.name || 'Direct Message'}</span>
                    </div>
                    <Badge variant={isCommon ? 'success' : isExec ? 'purple' : 'info'}>
                      {c.type.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  {c.last_message && (
                    <p className="text-[11px] text-slate-500 truncate mt-1">{c.last_message}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Area: Messages + Input */}
        <div className={`flex-1 flex flex-col min-w-0 bg-[#0b0f19] ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
          {/* Active Channel Header */}
          <div className="h-12 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between bg-[#0d1322] flex-shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setMobileShowChat(false)}
                className="md:hidden p-1.5 -ml-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition flex-shrink-0"
                aria-label="Back to channels"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
                {activeChannel?.name || 'Channel'}
              </span>
              <Badge variant="neutral" className="hidden sm:inline-flex">{activeChannel?.type}</Badge>
            </div>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Live Realtime Channel Synchronization Active
            </span>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                No messages yet. Start the conversation below.
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_id === currentUser?.id;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="flex items-baseline gap-2 mb-1 text-[11px]">
                      <span className="font-semibold text-slate-300">{m.sender_name}</span>
                      <Badge variant={m.sender_role === 'owner' ? 'purple' : m.sender_role === 'manager' ? 'info' : 'warning'}>
                        {m.sender_role}
                      </Badge>
                      <span suppressHydrationWarning className="text-[10px] text-slate-500 font-mono">
                        {formatTimeSafe(m.created_at)}
                      </span>
                    </div>

                    <div
                      className={`p-3 rounded-lg max-w-xl text-xs space-y-2 ${
                        isMe
                          ? 'bg-slate-800 text-slate-100 border border-slate-700'
                          : 'bg-[#151c2c] text-slate-200 border border-slate-800'
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>

                      {/* Clickable Structured Tag Chips per Section 8 */}
                      {(m.tagged_style_id || m.tagged_user_id) && (
                        <div className="pt-2 border-t border-slate-700/60 flex flex-wrap gap-2 text-[10px]">
                          {m.tagged_style_id && (
                            <a
                              href={`/styles/${m.tagged_style_id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-300 font-mono hover:bg-sky-900 transition"
                            >
                              <Layers className="w-3 h-3 text-sky-400" />
                              @{m.tagged_style_number || 'Style'} &bull; View Pipeline &rarr;
                            </a>
                          )}
                          {m.tagged_user_id && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
                              <User className="w-3 h-3 text-indigo-400" />
                              @{m.tagged_user_name || 'Staff'}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Structured Tag Selector Drawer */}
          {showTagMenu && canTag && (
            <div className="p-3 bg-slate-900 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-xs">
              <div>
                <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <Layers className="w-3 h-3 text-sky-400" />
                  Tag Style (Clickable deep-link chip):
                </label>
                <select
                  value={taggedStyleId}
                  onChange={(e) => setTaggedStyleId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono text-xs focus:outline-none"
                >
                  <option value="">-- No style tag --</option>
                  {styles.map((s) => (
                    <option key={s.id} value={s.id}>
                      @{s.style_number} — {s.description}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                  <User className="w-3 h-3 text-indigo-400" />
                  Tag Person:
                </label>
                <select
                  value={taggedUserId}
                  onChange={(e) => setTaggedUserId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white text-xs focus:outline-none"
                >
                  <option value="">-- No person tag --</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      @{u.full_name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Active Tags Preview */}
          {(taggedStyleId || taggedUserId) && (
            <div className="px-3 sm:px-4 py-1.5 bg-slate-900 border-t border-slate-800/60 flex items-center gap-2 text-[11px] flex-wrap">
              <span className="text-slate-400 font-medium">Active tags:</span>
              {taggedStyleId && (
                <span className="px-2 py-0.5 rounded bg-sky-950 border border-sky-800 text-sky-300 font-mono">
                  @{styles.find((s) => s.id === taggedStyleId)?.style_number}
                </span>
              )}
              {taggedUserId && (
                <span className="px-2 py-0.5 rounded bg-indigo-950 border border-indigo-800 text-indigo-300">
                  @{users.find((u) => u.id === taggedUserId)?.full_name}
                </span>
              )}
              <button
                onClick={() => {
                  setTaggedStyleId('');
                  setTaggedUserId('');
                }}
                className="text-slate-500 hover:text-white text-[10px] ml-1"
              >
                Clear tags
              </button>
            </div>
          )}

          {/* Input Box */}
          <form onSubmit={handleSendMessage} className="p-2 sm:p-3 border-t border-slate-800 bg-[#0d1322] flex items-center gap-2 flex-shrink-0">
            {canTag && (
              <button
                type="button"
                onClick={() => setShowTagMenu(!showTagMenu)}
                className={`p-2.5 sm:p-2 rounded border transition min-h-[40px] min-w-[40px] flex items-center justify-center ${
                  showTagMenu || taggedStyleId || taggedUserId
                    ? 'bg-sky-950 text-sky-400 border-sky-700'
                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:text-white'
                }`}
                title="Tag @style or @person"
              >
                <AtSign className="w-4 h-4" />
              </button>
            )}

            <input
              type="text"
              placeholder={`Message ${activeChannel?.name || 'channel'}...`}
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 sm:py-2 text-sm sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary min-h-[40px]"
            />

            <button
              type="submit"
              disabled={!messageBody.trim()}
              className={`p-2.5 sm:p-2 rounded font-semibold text-xs transition min-h-[40px] min-w-[40px] flex items-center justify-center ${
                messageBody.trim()
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
