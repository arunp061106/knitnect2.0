'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChatChannel, ChatMessage, Profile, Style } from '@/lib/types/erp';
import { Badge } from '@/components/ui/Badge';
import { formatTimeSafe } from '@/lib/utils/format';
import { INITIAL_CHANNELS, FIXTURE_USERS, CLIENT_OFFER_9414_STYLE } from '@/lib/db/erpStore';
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

  const [currentUser, setCurrentUser] = useState<Profile | null>(() => {
    if (typeof window !== 'undefined') {
      const savedRole = localStorage.getItem('knitnect_user_role') || 'employee';
      const savedUid = localStorage.getItem('knitnect_user_id') || '';
      return FIXTURE_USERS.find(u => u.id === savedUid || u.role === savedRole) || FIXTURE_USERS[2];
    }
    return FIXTURE_USERS[2];
  });

  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [loading, setLoading] = useState(false);

  // Structured Tagging State
  const [taggedStyleId, setTaggedStyleId] = useState<string>('');
  const [taggedUserId, setTaggedUserId] = useState<string>('');
  const [showTagMenu, setShowTagMenu] = useState(false);

  const [styles, setStyles] = useState<Style[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);

  useEffect(() => {
    let isMounted = true;
    const supabase = createClient();

    const loadChatData = async () => {
      try {
        const savedRole = (typeof window !== 'undefined' && localStorage.getItem('knitnect_user_role')) || 'employee';
        const savedUid = (typeof window !== 'undefined' && localStorage.getItem('knitnect_user_id')) || '';
        const fallbackUser = FIXTURE_USERS.find(u => u.id === savedUid || u.role === savedRole) || FIXTURE_USERS[2];

        if (isMounted) setCurrentUser(fallbackUser);

        // Try getting Supabase profile if available
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user && isMounted) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.id)
              .single();
            if (profile && isMounted) setCurrentUser(profile);
          }
        } catch {
          // ignore
        }

        // Query channels with fallback to store
        let activeChannelsList: ChatChannel[] = [];
        try {
          const { data: dbChannels } = await supabase
            .from('chat_channels')
            .select('*')
            .order('created_at', { ascending: true });

          if (dbChannels && dbChannels.length > 0) {
            activeChannelsList = dbChannels as ChatChannel[];
          }
        } catch {
          // ignore
        }

        if (activeChannelsList.length === 0) {
          activeChannelsList = INITIAL_CHANNELS;
        }

        if (isMounted) {
          setChannels(activeChannelsList);
          const initialChannel = activeChannelId || activeChannelsList[0]?.id || '';
          setActiveChannelId(initialChannel);

          if (initialChannel) {
            try {
              const { data: dbMessages } = await supabase
                .from('chat_messages')
                .select('*')
                .eq('channel_id', initialChannel)
                .order('created_at', { ascending: true });

              if (dbMessages && dbMessages.length > 0 && isMounted) {
                setMessages(dbMessages as ChatMessage[]);
              } else if (isMounted) {
                setMessages([]);
              }
            } catch {
              if (isMounted) {
                setMessages([]);
              }
            }
          }
        }

        // Load styles & profiles for tagging
        try {
          const { data: dbStyles } = await supabase.from('styles').select('*');
          if (dbStyles && dbStyles.length > 0 && isMounted) {
            setStyles(dbStyles as Style[]);
          } else if (isMounted) {
            setStyles([CLIENT_OFFER_9414_STYLE]);
          }
        } catch {
          if (isMounted) setStyles([CLIENT_OFFER_9414_STYLE]);
        }

        try {
          const { data: dbUsers } = await supabase.from('profiles').select('*');
          if (dbUsers && dbUsers.length > 0 && isMounted) {
            setUsers(dbUsers as Profile[]);
          } else if (isMounted) {
            setUsers(FIXTURE_USERS);
          }
        } catch {
          if (isMounted) setUsers(FIXTURE_USERS);
        }
      } catch (err) {
        console.error('Failed to load chat data:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadChatData();

    // Subscribe to channels updates for real-time updates
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
      supabase.removeChannel(channelsSub);
    };
  }, [router, activeChannelId]);

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
        if (!error && data && data.length > 0) {
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
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true });

      if (data && data.length > 0) {
        setMessages(data as ChatMessage[]);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
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

    // Optimistic local state update
    setMessages((prev) => [...prev, newMsgObj]);
    setMessageBody('');
    setTaggedStyleId('');
    setTaggedUserId('');
    setShowTagMenu(false);

    // Persist to Supabase
    try {
      await supabase.from('chat_messages').insert({
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

      await supabase
        .from('chat_channels')
        .update({
          last_message: trimmedBody,
          last_message_at: nowIso,
        })
        .eq('id', activeChannelId);
    } catch (err) {
      console.error('Supabase chat sync error:', err);
    }
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
                {activeChannel?.name || 'Operations Channel'}
              </span>
              <Badge variant="neutral" className="hidden sm:inline-flex">{activeChannel?.type || 'general'}</Badge>
            </div>
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              Live Realtime Channel Active
            </span>
          </div>

          {/* Messages Stream */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <MessageSquare className="w-8 h-8 opacity-40" />
                <p>No messages in this channel yet.</p>
                <p className="text-[10px] text-slate-600">Send an update below with @style or @person tags.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isMe = m.sender_id === currentUser?.id;
                const roleBadge = m.sender_role;

                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%] ${
                      isMe ? 'ml-auto' : 'mr-auto'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-[11px] font-semibold text-slate-300">
                        {m.sender_name || 'Staff Member'}
                      </span>
                      <span className={`text-[9px] uppercase px-1.5 py-0.2 rounded font-mono ${
                        roleBadge === 'owner' ? 'bg-purple-900/40 text-purple-300 border border-purple-800' :
                        roleBadge === 'manager' ? 'bg-blue-900/40 text-blue-300 border border-blue-800' :
                        'bg-amber-900/40 text-amber-300 border border-amber-800'
                      }`}>
                        {roleBadge}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatTimeSafe(m.created_at)}
                      </span>
                    </div>

                    <div
                      className={`p-3 rounded-lg text-xs leading-relaxed break-words shadow ${
                        isMe
                          ? 'bg-blue-600 text-white rounded-tr-none'
                          : 'bg-[#151c2e] text-slate-200 border border-slate-800 rounded-tl-none'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.body}</p>

                      {/* Tag badges */}
                      {(m.tagged_style_number || m.tagged_user_name) && (
                        <div className="mt-2 pt-2 border-t border-white/10 flex flex-wrap gap-1.5">
                          {m.tagged_style_number && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded text-sky-200">
                              <Layers className="w-3 h-3 text-sky-400" />
                              Style: {m.tagged_style_number}
                            </span>
                          )}
                          {m.tagged_user_name && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono bg-black/30 px-1.5 py-0.5 rounded text-amber-200">
                              <User className="w-3 h-3 text-amber-400" />
                              {m.tagged_user_name}
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

          {/* Tag Selector Pill Menu */}
          {showTagMenu && canTag && (
            <div className="p-3 bg-[#0d1322] border-t border-slate-800 flex flex-col gap-2">
              <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Structured Communication Tagging</span>
                <button
                  type="button"
                  onClick={() => setShowTagMenu(false)}
                  className="text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {/* Tag Style */}
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                    <Layers className="w-3 h-3 text-sky-400" /> Tag Production Style
                  </label>
                  <select
                    value={taggedStyleId}
                    onChange={(e) => setTaggedStyleId(e.target.value)}
                    className="w-full bg-[#101625] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">None (General Message)</option>
                    {styles.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.style_number} ({s.garment_category}) - {s.season}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tag User */}
                <div>
                  <label className="text-[10px] text-slate-400 mb-1 flex items-center gap-1">
                    <User className="w-3 h-3 text-amber-400" /> Tag Staff Member
                  </label>
                  <select
                    value={taggedUserId}
                    onChange={(e) => setTaggedUserId(e.target.value)}
                    className="w-full bg-[#101625] border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                  >
                    <option value="">None</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} ({u.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Active Tag Indicators */}
          {(taggedStyleId || taggedUserId) && (
            <div className="px-3 py-1.5 bg-blue-950/30 border-t border-blue-900/40 flex items-center gap-2 text-[11px]">
              <span className="text-slate-400">Attached:</span>
              {taggedStyleId && (
                <span className="bg-sky-950 text-sky-300 border border-sky-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Layers className="w-3 h-3" />
                  {styles.find((s) => s.id === taggedStyleId)?.style_number}
                  <button type="button" onClick={() => setTaggedStyleId('')} className="ml-1 text-slate-400 hover:text-white">✕</button>
                </span>
              )}
              {taggedUserId && (
                <span className="bg-amber-950 text-amber-300 border border-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {users.find((u) => u.id === taggedUserId)?.full_name}
                  <button type="button" onClick={() => setTaggedUserId('')} className="ml-1 text-slate-400 hover:text-white">✕</button>
                </span>
              )}
            </div>
          )}

          {/* Chat Input Bar */}
          <form onSubmit={handleSendMessage} className="p-2 sm:p-3 bg-[#0d1322] border-t border-slate-800 flex items-center gap-2">
            {canTag && (
              <button
                type="button"
                onClick={() => setShowTagMenu(!showTagMenu)}
                title="Attach style or mention a person"
                className={`p-2 rounded border transition flex-shrink-0 ${
                  showTagMenu || taggedStyleId || taggedUserId
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-[#101625] text-slate-400 border-slate-700 hover:text-white'
                }`}
              >
                <AtSign className="w-4 h-4" />
              </button>
            )}

            <input
              type="text"
              value={messageBody}
              onChange={(e) => setMessageBody(e.target.value)}
              placeholder={
                activeChannel
                  ? `Message #${activeChannel.name}...`
                  : 'Type a message...'
              }
              className="flex-1 bg-[#101625] border border-slate-700/80 rounded px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 min-w-0"
            />

            <button
              type="submit"
              disabled={!messageBody.trim()}
              className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded text-xs font-semibold flex items-center gap-1.5 transition flex-shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Send</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
