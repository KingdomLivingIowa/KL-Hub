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
  const [dmNames, setDmNames] = useState({});
  const [memberProfiles, setMemberProfiles] = useState({});

  // New chat modal
  const [showNewChat, setShowNewChat] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [groupChatName, setGroupChatName] = useState('');
  const [creatingChat, setCreatingChat] = useState(false);

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

    // Also load clients so house chat sender names resolve correctly
    const { data: clientData } = await supabase
      .from('clients')
      .select('id, full_name, email, auth_user_id')
      .not('auth_user_id', 'is', null);
    (clientData || []).forEach(c => {
      if (c.auth_user_id) map[c.auth_user_id] = { full_name: c.full_name, email: c.email, role: 'resident' };
    });

    setMemberProfiles(map);
  }, []);

  const fetchConversations = useCallback(async () => {
    if (!user?.id) return;
    setLoadingConvs(true);

    // Auto-join only preset staff group chats (NOT house chats - those are managed separately)
    const presetStaffNames = ["Management", "Men's Move In/Out", "Women's Move In/Out"];
    const { data: presetStaffGroups } = await supabase
      .from('conversations')
      .select('id, name, type')
      .eq('type', 'group')
      .is('house_id', null)
      .in('name', presetStaffNames);

    for (const group of (presetStaffGroups || [])) {
      await supabase.from('conversation_members').upsert({
        conversation_id: group.id,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id,user_id' });
    }

    // Get all memberships
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

    const { data: convs } = await supabase
      .from('conversations')
      .select('*')
      .in('id', convIds);

    // For DMs and custom groups, resolve display names
    const dmNameMap = { ...dmNames };
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

    // Fetch last message + unread count
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

    // Sort: preset groups first, then house chats, then custom groups, then DMs
    const presetNames = ["Management", "Men's Move In/Out", "Women's Move In/Out"];
    const presetGroups = convsWithMeta.filter(c => c.type === 'group' && presetNames.includes(c.name))
      .sort((a, b) => presetNames.indexOf(a.name) - presetNames.indexOf(b.name));
    const houseChats = convsWithMeta.filter(c => c.house_id != null)
      .sort((a, b) => a.name?.localeCompare(b.name || '') || 0);
    const customGroups = convsWithMeta.filter(c => c.type === 'group' && !presetNames.includes(c.name) && c.house_id == null)
      .sort((a, b) => a.name?.localeCompare(b.name || '') || 0);
    const dms = convsWithMeta.filter(c => c.type === 'direct')
      .sort((a, b) => new Date(b.lastMessage?.created_at || b.created_at) - new Date(a.lastMessage?.created_at || a.created_at));

    const sorted = [...presetGroups, ...houseChats, ...customGroups, ...dms];

    const unread = {};
    convsWithMeta.forEach(c => { unread[c.id] = c.unread; });
    setUnreadCounts(unread);
    setConversations(sorted);
    setLoadingConvs(false);
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

    await supabase.from('conversation_members')
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

  // Real-time for selected conversation
  useEffect(() => {
    if (!selectedConv) return;
    if (subscriptionRef.current) supabase.removeChannel(subscriptionRef.current);

    const channel = supabase
      .channel(`messages:${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
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
    if (error) { alert('Error sending: ' + error.message); setNewMessage(body); }
    setSending(false);
  };

  const toggleMember = (staffMember) => {
    setSelectedMembers(prev =>
      prev.find(m => m.id === staffMember.id)
        ? prev.filter(m => m.id !== staffMember.id)
        : [...prev, staffMember]
    );
  };

  const createChat = async () => {
    if (selectedMembers.length === 0) { alert('Select at least one person.'); return; }
    setCreatingChat(true);

    const isDM = selectedMembers.length === 1;

    // For DMs, check if one already exists
    if (isDM) {
      const otherId = selectedMembers[0].id;
      const { data: myMemberships } = await supabase
        .from('conversation_members').select('conversation_id').eq('user_id', user.id);
      const { data: theirMemberships } = await supabase
        .from('conversation_members').select('conversation_id').eq('user_id', otherId);
      const myIds = new Set((myMemberships || []).map(m => m.conversation_id));
      const sharedIds = (theirMemberships || []).map(m => m.conversation_id).filter(id => myIds.has(id));

      for (const sharedId of sharedIds) {
        const { data: conv } = await supabase.from('conversations').select('*').eq('id', sharedId).eq('type', 'direct').maybeSingle();
        if (conv) {
          setSelectedConv(conv);
          setShowNewChat(false);
          setSelectedMembers([]);
          setGroupChatName('');
          setCreatingChat(false);
          return;
        }
      }
    }

    // For group chats, require a name
    if (!isDM && !groupChatName.trim()) {
      alert('Please enter a name for the group chat.');
      setCreatingChat(false);
      return;
    }

    // Create conversation
    const { data: newConv, error: convError } = await supabase
      .from('conversations')
      .insert([{
        type: isDM ? 'direct' : 'group',
        name: isDM ? null : groupChatName.trim(),
      }])
      .select()
      .single();

    if (convError || !newConv) {
      alert('Error creating conversation: ' + (convError?.message || 'Unknown'));
      setCreatingChat(false);
      return;
    }

    // Add all members including current user
    const allMemberIds = [user.id, ...selectedMembers.map(m => m.id)];
    const { error: memberError } = await supabase.from('conversation_members').insert(
      allMemberIds.map(uid => ({
        conversation_id: newConv.id,
        user_id: uid,
        last_read_at: new Date().toISOString(),
      }))
    );

    if (memberError) {
      alert('Error adding members: ' + memberError.message);
      setCreatingChat(false);
      return;
    }

    // Update DM name map
    if (isDM) {
      setDmNames(prev => ({ ...prev, [newConv.id]: selectedMembers[0].full_name || selectedMembers[0].email }));
    }

    setShowNewChat(false);
    setSelectedMembers([]);
    setGroupChatName('');
    setCreatingChat(false);
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
    if (profile?.full_name) return profile.full_name;
    if (profile?.email) return profile.email;
    return profile?.role === 'resident' ? 'Resident' : 'Staff';
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
    const preview = (conv.lastMessage.body || '').length > 40
      ? conv.lastMessage.body.slice(0, 40) + '...'
      : conv.lastMessage.body || '';
    return isMe ? `You: ${preview}` : preview;
  };

  const totalUnread = Object.values(unreadCounts).reduce((sum, n) => sum + n, 0);
  const presetNames = ["Management", "Men's Move In/Out", "Women's Move In/Out"];
  const presetGroups = conversations.filter(c => c.type === 'group' && presetNames.includes(c.name));
  const houseChats = conversations.filter(c => c.house_id != null);
  const customGroups = conversations.filter(c => c.type === 'group' && !presetNames.includes(c.name) && c.house_id == null);
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
          <button onClick={() => { setShowNewChat(!showNewChat); setSelectedMembers([]); setGroupChatName(''); }}
            style={{ background: showNewChat ? '#999' : '#b22222', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: '500' }}>
            {showNewChat ? 'Cancel' : '+ New Chat'}
          </button>
        </div>

        {/* New chat creator */}
        {showNewChat && (
          <div style={ms.newChatPanel}>
            <p style={{ color: '#aaa', fontSize: '13px', margin: '0 0 8px 0' }}>Select people to message:</p>

            <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '10px' }}>
              {staffList.filter(s => s.id !== user.id).map(s => {
                const isSelected = selectedMembers.find(m => m.id === s.id);
                return (
                  <div key={s.id} onClick={() => toggleMember(s)}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 8px', borderRadius: '8px', cursor: 'pointer', background: isSelected ? '#1e3a2f' : 'transparent', marginBottom: '2px' }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = '#333'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? '#1e3a2f' : 'transparent'; }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', border: `2px solid ${isSelected ? '#4ade80' : '#999'}`, background: isSelected ? '#4ade80' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {isSelected && <span style={{ color: '#000', fontSize: '13px', fontWeight: '700' }}>✓</span>}
                    </div>
                    <div style={ms.avatar}>{initials(s.full_name || s.email)}</div>
                    <div>
                      <p style={{ color: '#fff', fontSize: '13px', margin: 0 }}>{s.full_name || s.email}</p>
                      <p style={{ color: '#999', fontSize: '12px', margin: 0 }}>{(s.role || '').replace(/_/g, ' ')}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Group name input — only show when 2+ people selected */}
            {selectedMembers.length > 1 && (
              <input
                value={groupChatName}
                onChange={e => setGroupChatName(e.target.value)}
                placeholder="Group chat name..."
                style={{ ...ms.input, marginBottom: '10px', padding: '8px 12px', fontSize: '13px' }}
              />
            )}

            {selectedMembers.length > 0 && (
              <div style={{ marginBottom: '8px' }}>
                <p style={{ color: '#4ade80', fontSize: '13px', margin: '0 0 6px 0' }}>
                  {selectedMembers.length === 1
                    ? `Direct message with ${selectedMembers[0].full_name || selectedMembers[0].email}`
                    : `Group chat with ${selectedMembers.length} people`}
                </p>
              </div>
            )}

            <button onClick={createChat} disabled={creatingChat || selectedMembers.length === 0}
              style={{ width: '100%', background: selectedMembers.length > 0 ? '#b22222' : '#333', border: 'none', color: selectedMembers.length > 0 ? '#fff' : '#bbb', padding: '8px', borderRadius: '8px', fontSize: '13px', cursor: selectedMembers.length > 0 ? 'pointer' : 'default', fontWeight: '600' }}>
              {creatingChat ? 'Creating...' : selectedMembers.length > 1 ? 'Create Group Chat' : 'Start Conversation'}
            </button>
          </div>
        )}

        {loadingConvs ? (
          <p style={{ color: '#999', fontSize: '13px', padding: '12px 16px' }}>Loading...</p>
        ) : (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* Preset group chats */}
            {presetGroups.length > 0 && (
              <>
                <p style={ms.convSectionLabel}>Group Chats</p>
                {presetGroups.map(conv => (
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

            {/* House chats */}
            {houseChats.length > 0 && (
              <>
                <p style={{ ...ms.convSectionLabel, color: '#b22222' }}>House Chats</p>
                {houseChats.map(conv => (
                  <ConvItem key={conv.id}
                    selected={selectedConv?.id === conv.id}
                    onClick={() => setSelectedConv(conv)}
                    name={conv.name}
                    preview={formatPreview(conv)}
                    unread={unreadCounts[conv.id] || 0}
                    isGroup
                    isHouseChat />
                ))}
              </>
            )}

            {/* Custom group chats */}
            {customGroups.length > 0 && (
              <>
                <p style={ms.convSectionLabel}>Custom Groups</p>
                {customGroups.map(conv => (
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

            {/* Direct messages */}
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
              <p style={{ color: '#bbb', fontSize: '13px', padding: '12px 16px' }}>No conversations yet.</p>
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
            <p style={{ color: '#bbb', fontSize: '14px', margin: 0 }}>Choose a group chat or start a new conversation</p>
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
                  <p style={{ color: '#bbb', fontSize: '13px', margin: 0 }}>{selectedConv.house_id ? 'House chat' : selectedConv.type === 'group' ? 'Group chat' : 'Direct message'}</p>
                </div>
              </div>
            </div>

            <div style={ms.messages}>
              {loadingMessages ? (
                <p style={{ color: '#bbb', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>Loading messages...</p>
              ) : messages.length === 0 ? (
                <p style={{ color: '#bbb', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No messages yet. Say hello! 👋</p>
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
                          <p style={{ color: '#bbb', fontSize: '13px', margin: '0 0 3px 8px' }}>{getSenderName(msg.sender_id)}</p>
                        )}
                        <div style={{ maxWidth: '70%', background: isMe ? '#b22222' : '#333', borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px', padding: '9px 14px' }}>
                          <p style={{ color: '#fff', fontSize: '14px', margin: 0, lineHeight: '1.4', wordBreak: 'break-word' }}>{msg.body}</p>
                        </div>
                        {!isGrouped && (
                          <p style={{ color: '#999', fontSize: '12px', margin: '2px 4px 0 4px' }}>{formatTime(msg.created_at)}</p>
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
                style={{ background: newMessage.trim() ? '#b22222' : '#333', border: 'none', color: newMessage.trim() ? '#fff' : '#bbb', padding: '10px 18px', borderRadius: '10px', fontSize: '14px', cursor: newMessage.trim() ? 'pointer' : 'default', fontWeight: '600' }}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ConvItem({ selected, onClick, name, preview, unread, isGroup, isHouseChat }) {
  const avatarBg = isHouseChat ? '#3a1a1a' : isGroup ? '#1e2d3a' : '#2d1e3a';
  const avatarColor = isHouseChat ? '#e05555' : isGroup ? '#60a5fa' : '#c084fc';
  return (
    <div onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: selected ? '#252525' : 'transparent', borderLeft: selected ? '3px solid #b22222' : '3px solid transparent', cursor: 'pointer' }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = '#1a1a1a'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
      <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: avatarBg, color: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isGroup ? '14px' : '13px', fontWeight: '600', flexShrink: 0 }}>
        {isHouseChat ? '🏠' : isGroup ? '#' : initials(name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: unread > 0 ? '#fff' : '#ccc', fontSize: '13px', fontWeight: unread > 0 ? '600' : '400', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          {unread > 0 && <span style={{ background: '#b22222', color: '#fff', borderRadius: '10px', padding: '1px 6px', fontSize: '12px', fontWeight: '700', flexShrink: 0, marginLeft: '4px' }}>{unread}</span>}
        </div>
        <p style={{ color: '#bbb', fontSize: '13px', margin: '1px 0 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</p>
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
  unreadBadge: { background: '#b22222', color: '#fff', borderRadius: '10px', padding: '2px 7px', fontSize: '13px', fontWeight: '700' },
  convSectionLabel: { color: '#bbb', fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '12px 14px 4px 14px', margin: 0 },
  newChatPanel: { padding: '12px 14px', borderBottom: '1px solid #2a2a2a', background: '#1a1a1a' },
  chatArea: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1a' },
  chatHeader: { padding: '14px 20px', borderBottom: '1px solid #2a2a2a', background: '#111', flexShrink: 0 },
  messages: { flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column' },
  inputArea: { display: 'flex', gap: '10px', padding: '14px 20px', borderTop: '1px solid #2a2a2a', background: '#111', flexShrink: 0 },
  input: { flex: 1, background: '#333', border: '1px solid #444', borderRadius: '10px', padding: '10px 14px', color: '#fff', fontSize: '14px', outline: 'none', width: '100%', boxSizing: 'border-box' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' },
  avatar: { width: '32px', height: '32px', borderRadius: '50%', background: '#1e3a2f', color: '#4ade80', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '600', flexShrink: 0 },
};

export default Messaging;