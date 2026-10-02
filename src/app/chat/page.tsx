'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ErpStore } from '@/lib/db/erpStore';
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
  ArrowRight,
  ArrowLeft,
} from 'lucide-react';

import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';

export default function ChatPage() {
  const store = ErpStore.getInstance();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [currentUser, setCurrentUser] = useState<Profile>(store.getCurrentUser());
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageBody, setMessageBody] = useState('');
  const [mobileShowChat, setMobileShowChat] = useState(false);

  // Structured Tagging State
  const [taggedStyleId, setTaggedStyleId] = useState<string>('');
  const [taggedUserId, setTaggedUserId] = useState<string>('');
  const [showTagMenu, setShowTagMenu] = useState(false);

  const [styles, setStyles] = useState<Style[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);

  const isCloudLive = isSupabaseConfigured();

  useEffect(() => {
    const refresh = () => {
      const u = store.getCurrentUser();
      setCurrentUser(u);
      const chs = store.getChannelsForUser(u);
      setChannels(chs);

      const activeId = activeChannelId || chs[0]?.id || '';
      if (!activeChannelId && activeId) {
        setActiveChannelId(activeId);
      }

      if (activeId) {
        setMessages(store.getMessagesForChannel(activeId));
      }

      setStyles(store.getStyles(u.role));
      setUsers(store.getUsers());
    };

    refresh();
    const unsub = store.subscribe(refresh);
    return unsub;
  }, [store, activeChannelId]);

  // Supabase Realtime synchronization (Multi-device live broadcast across all channels)
  useEffect(() => {
    if (!isCloudLive) return;

    const supabase = createClient();

    // 1. Fetch channel messages from Supabase for current channel
    if (activeChannelId) {
      supabase
        .from('chat_messages')
        .select('*')
        .eq('channel_id', activeChannelId)
        .order('created_at', { ascending: true })
        .then(({ data, error }) => {
          if (!error && data && data.length > 0) {
            data.forEach((m) => store.receiveExternalChatMessage(m as ChatMessage));
            setMessages(store.getMessagesForChannel(activeChannelId));
          } else if (error) {
            console.warn('Could not fetch cloud chat messages:', error.message);
          }
        });
    }

    // 2. Subscribe to realtime inserts across all channels (updates sidebar previews + active chat)
    const channel = supabase
      .channel('realtime:all_chat_messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
        },
        (payload) => {
          const newMsg = payload.new as ChatMessage;
          store.receiveExternalChatMessage(newMsg);
          if (activeChannelId) {
            setMessages(store.getMessagesForChannel(activeChannelId));
          }
        }
      )
      .subscribe((status) => {
        console.log('Supabase Realtime status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isCloudLive, activeChannelId, store]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSelectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    setMessages(store.getMessagesForChannel(channelId));
    setMobileShowChat(true);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!messageBody.trim() || !activeChannelId) return;

    const localMsg = store.sendChatMessage(
      activeChannelId,
      currentUser.id,
      messageBody.trim(),
      taggedStyleId || undefined,
      taggedUserId || undefined
    );

    // If Supabase is configured, broadcast message to Postgres Realtime
    if (isCloudLive) {
      const supabase = createClient();
      const style = taggedStyleId ? styles.find((s) => s.id === taggedStyleId) : undefined;
      const taggedUser = taggedUserId ? users.find((u) => u.id === taggedUserId) : undefined;

      supabase
        .from('chat_messages')
        .insert({
          id: localMsg.id,
          channel_id: activeChannelId,
          sender_id: currentUser.id,
          sender_name: currentUser.full_name,
          sender_role: currentUser.role,
          body: messageBody.trim(),
          tagged_style_id: taggedStyleId || null,
          tagged_style_number: style?.style_number || null,
          tagged_user_id: taggedUserId || null,
          tagged_user_name: taggedUser?.full_name || null,
          created_at: localMsg.created_at,
        })
        .then(({ error }) => {
          if (error) {
            console.error('Supabase chat sync error:', error.message);
            alert(`⚠️ Supabase Cloud Sync Error: "${error.message}"\n\nPlease ensure you ran the SQL migration script in your Supabase SQL Editor and that NEXT_PUBLIC_SUPABASE_URL is https://chbwrpasfuschpcavxdl.supabase.co`);
          }
        });
    }

    setMessageBody('');
    setTaggedStyleId('');
    setTaggedUserId('');
    setShowTagMenu(false);
  };

  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];
  const canTag = currentUser.role === 'owner' || currentUser.role === 'manager';

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
          {isCloudLive ? (
            <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-mono bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1.5 shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="hidden xs:inline">Realtime </span>Live
            </span>
          ) : (
            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5"
              title="Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to Vercel for multi-device realtime chat."
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              Local
            </span>
          )}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="flex-1 flex bg-[#101625] border border-slate-800 rounded overflow-hidden min-h-0">
        {/* Left Sidebar: Channels List (Full width on mobile until a channel is selected) */}
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

        {/* Right Area: Messages + Input (Full width on mobile when open) */}
        <div className={`flex-1 flex flex-col min-w-0 bg-[#0b0f19] ${!mobileShowChat ? 'hidden md:flex' : 'flex'}`}>
          {/* Active Channel Header */}
          <div className="h-12 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between bg-[#0d1322] flex-shrink-0 gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {/* Back to Channels button on Mobile */}
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
                const isMe = m.sender_id === currentUser.id;

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
