import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabaseClient';
import { useUser } from './UserContext';

function Messaging() {
  const { user } = useUser();

  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [staffList, setStaffList] = useState([]);
  const [showNewDM, setShowNewDM] = useState(false);
  const [memberProfiles, setMemberProfiles] = useState({});
  const [dmNames, setDmNames] = useState({});

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const subscriptionRef = useRef(null);

  const fetchStaff = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, full_name, email, role')
      .order('full_name');
    setStaffList(data || []);
    const map = {};
    (data || []).forEach(s => { map[s.id] = s; });
    setMemberProfiles(map);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    setLoadingConvs(true);

    // Step 1: Make sure user is in all group chats
    const { data: allGroups } = await supabase
      .from('conversations')
      .select('id, name, type')
      .eq('type', 'group');

    for (const group of (allGroups || [])) {
      await supabase.from('conversation_members').upsert({
        conversation_id: group.id,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,user_id' });
    }

    // Step 2: Get all memberships for this user
    const { data: memberships } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at')
      .eq('user_id', user.id);

    if (!memberships || memberships.length === 0) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }

    const convIds = memberships.map(m => m.conversation_id);
    const lastReadMap = {};
    memberships.forEach(m => { lastReadMap[m.conversation_id] = m.last_read_at; });

    // Step 3: Fetch conversation details
    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convIds);

    // Step 4: For each DM, find the other person's name
    const dmNameMap = {};
    for (const conv of (convs || [])) {
      if (conv.type === 'direct') {
        const { data: members } = await supabase
          .from('conversation_members')
          .select('user_id')
          .eq('conversation_id', conv.id);
        const otherId = (members || []).find(m => m.user_id !== user.id)?.user_id;
        if (otherId) {
          const { data: profile } = await supabase
            .from('user_profiles')
            .select('full_name, email')
            .eq('id', otherId)
            .single();
          dmNameMap[conv.id] = profile?.full_name || profile?.email || 'Staff';
        }
      }
    }
    setDmNames(dmNameMap);

    // Step 5: Fetch last message + unread count for each conversation
    const convsWithMeta = await Promise.all((convs || []).map(async (conv) => {
      const { data: lastMsgs } = await supabase
        .from('messages')
        .select('body, created_at, sender_id')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);

      const lastRead = lastReadMap[conv.id];
      const { count: unreadCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', user.id)
        .gt('created_at', lastRead || '1970-01-01');

      return { ...conv, lastMessage: lastMsgs?.[0] || null, unread: unreadCount || 0 };
    }));

    // Sort: groups first (in order), then DMs by last message
    const groups = convsWithMeta
      .filter(c => c.type === 'group')
      .sort((a, b) => a.name.localeCompare(b.name));

    const dms = convsWithMeta
      .filter(c => c.type === 'direct')
      .sort((a, b) => {
        const aTime = a.lastMessage?.created_at || a.created_at;
        const bTime = b.lastMessage?.created_at || b.created_at;
        return new Date(bTime) - new Date(aTime);
      });

    const sorted = [...groups, ...dms];

    const unread = {};
    convsWithMeta.forEach(c => { unread[c.id] = c.unread; });
    setUnreadCounts(unread);
    setConversations(sorted);
    setLoadingConvs(false);

    // Auto-select first if none selected
    setSelectedConv(prev => prev || sorted[0] || null);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchMessages = useCallback(async (convId) => {
    setLoadingMessages(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoadingMessages(false);

    // Mark as read
    await supabase
      .from('conversation_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .eq('user_id', user.id);

    setUnreadCounts(prev => ({ ...prev, [convId]: 0 }));
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchStaff(); }, [fetchStaff]);
  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  useEffect(() => {
    if (selectedConv) {
      fetchMessages(selectedConv.id);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [selectedConv?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Real-time subscription for new messages in selected conversation
  useEffect(() => {
    if (!selectedConv) return;

    if (subscriptionRef.current) {
      supabase.removeChannel(subscriptionRef.current);
    }

    const channel = supabase
      .channel(`messages:${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        setConversations(prev => prev.map(c =>
          c.id === selectedConv.id ? { ...c, lastMessage: payload.new } : c
        ));
        supabase.from('conversation_members')
          .update({ last_read_at: new Date().toISOString() })
          .eq('conversation_id', selectedConv.id)
          .eq('user_id', user.id);
      })
      .subscribe();

    subscriptionRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [selectedConv?.id, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || sending) return;
    setSending(true);
    const body = newMessage.trim();
    setNewMessage('');

    const { error } = await supabase.from('messages').insert([{
      conversation_id: selectedConv.id,
      sender_id: user.id,
      body,
    }]);

    if (error) {
      alert('Error sending message: ' + error.message);
      setNewMessage(body);
    }
    setSending(false);
  };

  const startDM = async (staffMember) => {
    setShowNewDM(false);

    // Check if DM already exists between these two users
    const { data: myMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', user.id);

    const { data: theirMemberships } = await supabase
      .from('conversation_members')
      .select('conversation_id')
      .eq('user_id', staffMember.id);

    const myIds = new Set((myMemberships || []).map(m => m.conversation_id));
    const sharedIds = (theirMemberships || [])
      .map(m => m.conversation_id)
      .filter(id => myIds.has(id));

    // Check if any shared conversation is a direct type
    for (const sharedId of sharedIds) {
      const { data: conv } = await supabase
        .from('conversations')
        .select('*')
        .eq('id', sharedId)
        .eq('type', 'direct')
        .maybeSingle();
      if (conv) {
        setSelectedConv(conv);
        return;
      }
    }

    // Create new DM
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert([{ type: 'direct' }])
      .select()
      .single();

    if (convError || !newConv) {
      alert('Error creating conversation: ' + (convError?.message || 'Unknown error'));
      return;
    }

    // Add both members
    const { error: memberError } = await supabase
      .from('conversation_members')
      .insert([
        { conversation_id: newConv.id, user_id: user.id, last_read_at: new Date().toISOString() },
        { conversation_id: newConv.id, user_id: staffMember.id, last_read_at: new Date().toISOString() },
      ]);

    if (memberError) {
      alert('Error adding members: ' + memberError.message);
      return;
    }

    setDmNames(prev => ({ ...prev, [newConv.id]: staffMember.full_name || staffMember.email }));
    await fetchConversations();
    setSelectedConv(newConv);
  };

  const getConvName = (conv) => {
    if (conv.type === 'group') return conv.name;
    return dmNames[conv.id] || 'Direct Message';
  };

  const getSenderName = (senderId) => {
    if (senderId === user.id) return 'You';
    const profile = memberProfiles[senderId];
    return profile?.full_name || profile?.email || 'Staff';
  };

  const formatTime = (d) => {
    const date = new Date(d);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatPreview = (conv) => {
    if (!conv.lastMessage) return 'No messages yet';
    const isMe = conv.lastMessage.sender_id === user.id;
    const preview = conv.lastMessage.body?.length > 40
      ? conv.lastMessage.body.slice(0, 40) + '...'
      : conv.lastMessage.body || '';
    return isMe ? `You: ${preview}` : preview;
  };

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
  const groupChats = conversations.filter(c => c.type === 'group');
  const directChats = conversations.filter(c => c.type === 'direct');

  return (
    <div style={ms.container}>
      {/* Sidebar */}
      <div style={ms.sidebar}>
        <div style={ms.sidebarHeader}>
          <p style={ms.sidebarTitle}>
            Messages
            {totalUnread > 0 && <span style={ms.unreadBadge}>{totalUnread}</span>}
          </p>
          <button onClick={() => setShowNewDM(!showNewDM)}
            style={{ background: showNewDM ? '#444' : '#b22222', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
            + DM
          </button>
        </div>

        {/* New DM picker */}
        {showNewDM && (
          <div style={ms.dmPicker}>
            <p style={{ color: '#aaa', fontSize: '12px', margin: '0 0 8px 0' }}>Start a conversation with:</p>
            {staffList.filter(s => s.id !== user.id).length === 0 && (
              <p style={{ color: '#555', fontSize: '12px' }}>No other staff members found.</p>
            )}
            {staffList.filter(s => s.id !== user.id).map(s => (
              <div key={s.id} onClick={() => startDM(s)}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px' }}
                onMouseEnter={e => e.currentTarget.style.background = '#2a2a2a'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <div style={ms.avatar}>{initials(s.full_name || s.email)}</div>
                <div>
                  <p style={{ color: '#fff', fontSize: '13px', margin: 0 }}>{s.full_name || s.email}</p>
                  <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>{(s.role || '').replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {loadingConvs ? (
          <p style={{ color: '#666', fontSize: '13px', padding: '12px 16px' }}>Loading...</p>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {groupChats.length > 0 && (
              <>
                <p style={ms.convSectionLabel}>Group Chats</p>
                {groupChats.map(conv => (
                  <ConvItem key={conv.id}
                    selected={selectedConv?.id === conv.id}
                    onClick={() => setSelectedConv(conv)}
                    name={conv.name}
                    preview={formatPreview(conv)}
                    unread={unreadCounts[conv.id] || 0}
                    isGroup />
                ))}
              </>
            )}
            {directChats.length > 0 && (
              <>
                <p style={ms.convSectionLabel}>Direct Messages</p>
                {directChats.map(conv => (
                  <ConvItem key={conv.id}
                    selected={selectedConv?.id === conv.id}
                    onClick={() => setSelectedConv(conv)}
                    name={getConvName(conv)}
                    preview={formatPreview(conv)}
                    unread={unreadCounts[conv.id] || 0}
                    isGroup={false} />
                ))}
              </>
            )}
            {conversations.length === 0 && (
              <p style={{ color: '#555', fontSize: '13px', padding: '12px 16px' }}>No conversations yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Chat area */}
      <div style={ms.chatArea}>
        {!selectedConv ? (
          <div style={ms.emptyState}>
            <p style={{ fontSize: '32px', margin: '0 0 12px 0' }}>💬</p>
            <p style={{ color: '#fff', fontSize: '16px', fontWeight: '500', margin: '0 0 6px 0' }}>Select a conversation</p>
            <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>Choose a group chat or start a direct message</p>
          </div>
        ) : (
          <>
            <div style={ms.chatHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ ...ms.avatar, background: selectedConv.type === 'group' ? '#1e2d3a' : '#2d1e3a', color: selectedConv.type === 'group' ? '#60a5fa' : '#c084fc', fontSize: '14px' }}>
                  {selectedConv.type === 'group' ? '#' : initials(getConvName(selectedConv))}
                </div>
                <div>
                  <p style={{ color: '#fff', fontSize: '15px', fontWeight: '600', margin: 0 }}>{getConvName(selectedConv)}</p>
                  <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>{selectedConv.type === 'group' ? 'Group chat' : 'Direct message'}</p>
                </div>
              </div>
            </div>

            <div style={ms.messages}>
              {loadingMessages ? (
                <p style={{ color: '#555', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>Loading messages...</p>
              ) : messages.length === 0 ? (
                <p style={{ color: '#555', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No messages yet. Say hello! 👋</p>
              ) : (
                <>
                  {messages.map((msg, idx) => {
                    const isMe = msg.sender_id === user.id;
                    const prevMsg = messages[idx - 1];
                    const showSender = !isMe && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
                    const isGrouped = prevMsg && prevMsg.sender_id === msg.sender_id &&
                      new Date(msg.created_at) - new Date(prevMsg.created_at) < 60000;

                    return (
                      <div key={msg.id} style={{ marginBottom: isGrouped ? '2px' : '12px', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                        {showSender && (
                          <p style={{ color: '#888', fontSize: '11px', margin: '0 0 3px 8px' }}>
                            {getSenderName(msg.sender_id)}
                          </p>
                        )}
                        <div style={{ maxWidth: '70%', background: isMe ? '#b22222' : '#2a2a2a', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '9px 14px' }}>
                          <p style={{ color: '#fff', fontSize: '14px', margin: 0, lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.body}</p>
                        </div>
                        {!isGrouped && (
                          <p style={{ color: '#444', fontSize: '10px', margin: '2px 4px 0 4px' }}>{formatTime(msg.created_at)}</p>
                        )}
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <div style={ms.inputArea}>
              <input
                ref={inputRef}
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder={`Message ${getConvName(selectedConv)}...`}
                style={ms.input}
              />
              <button onClick={sendMessage} disabled={!newMessage.trim() || sending}
                style={{ background: newMessage.trim() ? '#b22222' : '#2a2a2a', border: 'none', color: newMessage.trim() ? '#fff' : '#555', padding: '10px 18px', borderRadius: '10px', fontSize: '14px', cursor: newMessage.trim() ? 'pointer' : 'default', fontWeight: '600' }}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConvItem({ selected, onClick, name, preview, unread, isGroup }) {
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: selected ? '#1e1e1e' : 'transparent', borderLeft: selected ? '3px solid #b22222' : '3px solid transparent', cursor: 'pointer' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#1a1a1a'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: isGroup ? '#1e2d3a' : '#2d1e3a', color: isGroup ? '#60a5fa' : '#c084fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isGroup ? '14px' : '13px', fontWeight: '600', flexShrink: 0 }}>
        {isGroup ? '#' : initials(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: unread > 0 ? '#fff' : '#ccc', fontSize: '13px', fontWeight: unread > 0 ? '600' : '400', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          {unread > 0 && <span style={{ background: '#b22222', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '10px', fontWeight: '700', flexShrink: 0, marginLeft: '4px' }}>{unread}</span>}
        </div>
        <p style={{ color: '#555', fontSize: '11px', margin: '1px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</p>
      </div>
    </div>
  );
}

const initials = (name) => name ? name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() : '??';

const ms = {
  container: { display: 'flex', height: 'calc(100vh - 80px)', fontFamily: 'sans-serif', overflow: 'hidden' },
  sidebar: { width: '280px', borderRight: '1px solid #2a2a2a', display: 'flex', flexDirection: 'column', flexShrink: 0, background: '#111' },
  sidebarHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 14px', borderBottom: '1px solid #2a2a2a' },
  sidebarTitle: { color: '#fff', fontSize: '16px', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' },
  unreadBadge: { background: '#b22222', color: '#fff', borderRadius: '10px', padding: '2px 7px', fontSize: '11px', fontWeight: '700' },
  convSectionLabel: { color: '#555', fontSize: '10px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 14px 4px 14px', margin: 0 },
  dmPicker: { padding: '10px 14px', borderBottom: '1px solid #2a2a2a', background: '#1a1a1a', maxHeight: '250px', overflowY: 'auto' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1a' },
  chatHeader: { padding: '14px 20px', borderBottom: '1px solid #2a2a2a', background: '#111', flexShrink: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' },
  inputArea: { display: 'flex', gap: '10px', padding: '14px 20px', borderTop: '1px solid #2a2a2a', background: '#111', flexShrink: 0 },
  input: { flex: 1, background: '#2a2a2a', border: '1px solid #444', borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '38px', height: '38px', borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', flexShrink: 0 },
};

export default Messaging;